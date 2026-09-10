// Renders the fold transition to exports/duo-fold.mp4 by capturing the real
// WebGL page frame by frame with Playwright and piping JPEG frames into ffmpeg.
// Clips (30fps, 1920×1080):
//   full   closed 1s → unfold 2s → open 2s → fold 2s → closed 1s (8s)   [default]
//   unfold closed 0.5s → unfold 2s → open 1.5s (4s)
// Usage: node scripts/render-video.mjs [full|unfold]
import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

const FPS = 30
const CAPTURE = { width: 960, height: 540 }
// Extra viewport height keeps the slider on screen for Playwright while staying outside the capture clip.
const VIEWPORT = { width: CAPTURE.width, height: CAPTURE.height + 200 }
const url = process.env.DUO_URL ?? 'http://127.0.0.1:5201/'
const clips = {
  full: { output: 'exports/duo-fold.mp4', timeline: [[30, 0, 0], [60, 0, 1], [60, 1, 1], [60, 1, 0], [30, 0, 0]], proofs: [0, 45, 60, 75, 89, 120, 165, 180, 195, 239] },
  unfold: { output: 'exports/duo-unfold.mp4', timeline: [[15, 0, 0], [60, 0, 1], [45, 1, 1]], proofs: [0, 30, 45, 60, 74, 90, 119] },
}
const clipName = process.argv[2] ?? 'full'
const clip = clips[clipName]
if (!clip) throw new Error(`Unknown clip "${clipName}". Use one of: ${Object.keys(clips).join(', ')}`)
const { output, timeline } = clip
const total = timeline.reduce((sum, [count]) => sum + count, 0)
const proofFrames = clip.proofs

const STEP = 0.005 // the FoldScrubber's range step; values must sit on it for fill() to round-trip

function progressAt(frame) {
  let start = 0
  for (const [count, from, to] of timeline) {
    if (frame < start + count) return Math.round((from + (to - from) * ((frame - start) / count)) / STEP) * STEP
    start += count
  }
  return 0
}

async function reachable() {
  try { return (await fetch(url)).ok } catch { return false }
}

async function startServer() {
  if (await reachable()) return undefined
  const { port, hostname } = new URL(url)
  const server = spawn('npx', ['vite', '--host', hostname, '--port', port || '5173', '--strictPort'], { stdio: ['ignore', 'ignore', 'inherit'] })
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (await reachable()) return server
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  server.kill()
  throw new Error(`Dev server did not start at ${url}`)
}

const proofDir = `exports/proofs/${clipName}`
await mkdir(proofDir, { recursive: true })
const server = await startServer()
const encoder = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-vcodec', 'mjpeg', '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output], { stdio: ['pipe', 'ignore', 'inherit'] })
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: 'light' })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`))
  await page.goto(url)
  await page.locator('[data-ready="true"]').waitFor({ timeout: 30000 })
  await page.waitForLoadState('networkidle')
  // Fill the viewport with the device; controls sit below the capture area.
  await page.addStyleTag({ content: `
    .page { padding: 0 !important; display: block !important; min-height: 0 !important; }
    .phone-study { width: ${CAPTURE.width}px !important; }
    .duo-device { width: ${CAPTURE.width}px !important; height: ${CAPTURE.height}px !important; }
    .phone-controls { margin-top: 32px !important; }
    .page-actions { display: none !important; }
    body { overflow: hidden; }
  ` })
  const device = page.locator('.duo-device')
  const box = await device.boundingBox()
  if (!box || box.x !== 0 || box.y !== 0) throw new Error(`Unexpected device placement ${JSON.stringify(box)}`)
  const slider = page.getByRole('slider', { name: 'Fold angle', exact: true })
  // Screen videos: take manual control so each captured frame shows the exact video time.
  // 'open' plays after the fold passes the start angle while opening, 'close' while closing.
  const videos = {}
  for (const kind of ['open', 'close']) {
    const locator = page.locator(`video[data-duo-screen-video="${kind}"]`)
    if (await locator.count() === 0) continue
    await locator.evaluate(element => { element.dataset.manual = 'true'; element.pause() })
    await page.waitForFunction(kind => { const element = document.querySelector(`video[data-duo-screen-video="${kind}"]`); return element && element.readyState >= 2 && Number.isFinite(element.duration) }, kind, { timeout: 30000 })
    videos[kind] = { locator, ...(await locator.evaluate(element => ({ start: Number(element.dataset.videoStart), duration: element.duration }))) }
    console.log(`screen video (${kind}): starts at progress ${videos[kind].start.toFixed(3)}, ${videos[kind].duration.toFixed(2)}s long`)
  }
  const hasVideo = Boolean(videos.open)
  const seekVideo = (kind, time) => videos[kind].locator.evaluate((element, time) => new Promise(resolve => {
    const done = () => { clearTimeout(timer); resolve() }
    const timer = setTimeout(done, 1000)
    element.addEventListener('seeked', done, { once: true })
    element.currentTime = time // always seek: the seek also makes this video the active screen
  }), time)
  let activeVideo = 'open', videoStartedAt = null
  const states = []
  for (let frame = 0; frame < total; frame++) {
    const progress = progressAt(frame)
    await slider.fill(String(Number(progress.toFixed(3))))
    await page.waitForFunction(expected => document.querySelector('.duo-device')?.getAttribute('data-progress') === expected, progress.toFixed(3))
    let videoTime = 0
    if (hasVideo) {
      const previous = frame === 0 ? 0 : progressAt(frame - 1)
      const openStart = videos.open.start, closeStart = videos.close?.start ?? openStart
      if (progress >= openStart && (frame === 0 || previous < openStart)) { activeVideo = 'open'; videoStartedAt = frame }
      else if (frame > 0 && progress < closeStart && previous >= closeStart) { if (videos.close) { activeVideo = 'close'; videoStartedAt = frame } else videoStartedAt = null }
      videoTime = videoStartedAt === null ? 0 : Math.min(videos[activeVideo].duration - 0.001, (frame - videoStartedAt) / FPS)
      await seekVideo(activeVideo, videoTime)
    }
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const image = await page.screenshot({ type: 'jpeg', quality: 95, clip: { x: 0, y: 0, ...CAPTURE } })
    if (!encoder.stdin.write(image)) await once(encoder.stdin, 'drain')
    if (proofFrames.includes(frame)) await writeFile(`${proofDir}/${String(frame).padStart(3, '0')}.jpg`, image)
    states.push({ frame, progress: Number(progress.toFixed(4)), video: hasVideo ? activeVideo : null, videoTime: Number(videoTime.toFixed(4)) })
    if (frame % 30 === 0) console.log(`frame ${frame}/${total} progress ${progress.toFixed(2)}`)
  }
  await writeFile(`exports/${clipName}-frame-state.json`, JSON.stringify({ fps: FPS, frames: total, errors, states }, null, 2))
  if (errors.length) throw new Error(errors.join('\n'))
  encoder.stdin.end()
  const [code] = await once(encoder, 'close')
  if (code !== 0) throw new Error(`Encoder exited ${code}`)
  const sheetPath = `exports/${clipName}-contact-sheet.jpg`
  const sheet = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', output, '-vf', `select='not(mod(n\\,${Math.max(1, Math.round(total / 16))}))',scale=320:-1,tile=8x2`, '-frames:v', '1', sheetPath], { stdio: ['ignore', 'ignore', 'inherit'] })
  await once(sheet, 'close')
  console.log(`Wrote ${output} (${total} frames, ${total / FPS}s) and ${sheetPath}`)
} finally {
  await browser.close()
  if (encoder.exitCode === null) encoder.kill()
  server?.kill()
}
