import { useEffect, useEffectEvent, useRef, useState, type ComponentProps } from 'react'
import { useMotionValueEvent, useReducedMotion } from 'motion/react'
import { ACESFilmicToneMapping, AmbientLight, DirectionalLight, LinearMipmapLinearFilter, PerspectiveCamera, PMREMGenerator, Scene, SRGBColorSpace, TextureLoader, VideoTexture, WebGLRenderer, type Texture } from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { loadPhone } from './model'
import { foldChoreography } from './fold-choreography'
import { useFoldablePhone } from './FoldablePhone'

type PhoneModel = Awaited<ReturnType<typeof loadPhone>>
type Surface = { model: PhoneModel; renderer: WebGLRenderer; draw: () => void }
export type PhoneDeviceProps = ComponentProps<'div'> & {
  modelSrc: string; screenSrc: string; coverSrc?: string; rotation?: number; exposure?: number; blur?: number; parallax?: number
  screenOverlaySrc?: string; coverOverlaySrc?: string; revealSrc?: string
  /** Inner-screen video played when the fold passes `screenVideoStart` while opening (one URL or fallbacks in order). Replaces `screenOverlaySrc` once it can play; the image stays as a poster until then. */
  screenVideoSrc?: string | string[]
  /** Inner-screen video played when the fold passes `screenVideoStart` while closing. Without it, closing rewinds the opening video instead. */
  screenCloseVideoSrc?: string | string[]
  /** Fold progress (0–1) the fold must pass while opening for the opening video to start. */
  screenVideoStart?: number
  /** Fold progress (0–1) the fold must pass while closing for the closing video to start. Defaults to `screenVideoStart`. */
  screenCloseVideoStart?: number
  /** Rounded-corner radius of the inner overlay as a fraction of its height, applied to images and video alike. */
  screenCorner?: number
}

export function PhoneDevice(props: PhoneDeviceProps) {
  return <PhoneDeviceSurface key={props.modelSrc} {...props} />
}

function PhoneDeviceSurface({ modelSrc, screenSrc, coverSrc = screenSrc, screenOverlaySrc, coverOverlaySrc, revealSrc, screenVideoSrc, screenCloseVideoSrc, screenVideoStart = 0.6, screenCloseVideoStart = screenVideoStart, screenCorner = 0, rotation = -6, exposure = 1.2, blur = 28, parallax = 1, className = '', ...props }: PhoneDeviceProps) {
  const { progress, setValue, toggle } = useFoldablePhone()
  const reducedMotion = useReducedMotion()
  const canvas = useRef<HTMLCanvasElement>(null)
  const surface = useRef<Surface | undefined>(undefined)
  const drag = useRef<{ x: number; value: number; moved: boolean } | undefined>(undefined)
  const suppressClick = useRef(false)
  const [status, setStatus] = useState('Loading Apple model…')
  const [ready, setReady] = useState(false)
  const [amount, setAmount] = useState(progress.get())
  const openVideo = useRef<HTMLVideoElement>(null)
  const closeVideo = useRef<HTMLVideoElement>(null)
  const videoAttached = useRef(false)
  const lastProgress = useRef(progress.get())
  const toList = (source: string | string[] | undefined) => source === undefined ? [] : Array.isArray(source) ? source : [source]
  const openSources = toList(screenVideoSrc)
  const closeSources = toList(screenCloseVideoSrc)
  const videoKey = `${openSources.join('|')}//${closeSources.join('|')}`
  const update = useEffectEvent(() => {
    const current = surface.current
    if (!current) return
    const p = Math.max(0, Math.min(1, progress.get()))
    const motion = foldChoreography(p)
    const { angle } = motion
    current.model.screen.uniforms.defocus.value = motion.innerDefocus
    current.model.cover.uniforms.focusEdge.value = motion.coverFocusEdge
    current.model.screen.uniforms.progress.value = p
    current.model.cover.uniforms.progress.value = p
    current.model.screen.uniforms.blur.value = blur
    current.model.cover.uniforms.blur.value = blur
    current.model.left.rotation.y = angle
    current.model.body.position.x = -4.12 * (1 - Math.max(0, Math.cos(angle)))
    current.model.body.rotation.y = rotation * Math.PI / 180
    current.model.screen.uniforms.parallax.value = reducedMotion ? 0 : parallax
    current.model.cover.uniforms.parallax.value = reducedMotion ? 0 : parallax
    current.model.screen.uniforms.overlayCorner.value = screenCorner
    current.model.body.updateMatrixWorld(true)
    current.model.screen.uniforms.bodyInverse.value.copy(current.model.body.matrixWorld).invert()
    current.model.cover.uniforms.bodyInverse.value.copy(current.model.body.matrixWorld).invert()
    current.renderer.toneMappingExposure = exposure
    current.draw()
  })
  useMotionValueEvent(progress, 'change', setAmount)
  useMotionValueEvent(progress, 'change', value => {
    const open = openVideo.current
    const close = closeVideo.current
    const previous = lastProgress.current
    lastProgress.current = value
    if (!open || open.dataset.manual === 'true' || close?.dataset.manual === 'true') return
    const restart = (element: HTMLVideoElement) => {
      element.pause()
      // Seek first, play once the seek lands: the seek activates this video's texture and playback starts on its exact first frame.
      if (!reducedMotion) element.addEventListener('seeked', () => { element.play().catch(() => {}) }, { once: true })
      element.currentTime = 0
    }
    if (value >= screenVideoStart && previous < screenVideoStart) {
      close?.pause()
      restart(open)
    } else if (value < screenCloseVideoStart && previous >= screenCloseVideoStart) {
      open.pause()
      if (close) restart(close)
      else open.currentTime = 0
    }
  })
  useEffect(() => { update() }, [rotation, exposure, blur, parallax, reducedMotion, screenCorner])
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const context = element.getContext('webgl2', { alpha: true, antialias: true, preserveDrawingBuffer: true })
    if (!context) { setStatus('WebGL 2 is unavailable. Enable hardware acceleration to view the phone.'); return }
    const renderer = new WebGLRenderer({ canvas: element, context, alpha: true, antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = ACESFilmicToneMapping
    const scene = new Scene()
    const camera = new PerspectiveCamera(30, 1, 0.1, 100)
    camera.position.set(0, 0, 36)
    const environment = new RoomEnvironment()
    const generator = new PMREMGenerator(renderer)
    const environmentMap = generator.fromScene(environment)
    scene.environment = environmentMap.texture
    environment.dispose()
    generator.dispose()
    scene.add(new AmbientLight(0xffffff, 1.5))
    const key = new DirectionalLight(0xffffff, 3)
    key.position.set(-8, 12, 20)
    scene.add(key)
    let disposed = false
    let model: PhoneModel | undefined
    const render = () => renderer.render(scene, camera)
    const resize = () => {
      const { width, height } = element.getBoundingClientRect()
      if (!width || !height) return
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      const span = Math.max(16, 21 / camera.aspect)
      camera.fov = 2 * Math.atan(span / 72) * 180 / Math.PI
      camera.updateProjectionMatrix()
      render()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    const unsubscribe = progress.on('change', () => update())
    loadPhone(modelSrc).then(loaded => {
      if (disposed) { loaded.dispose(); return }
      model = loaded
      scene.add(model.body)
      surface.current = { model, renderer, draw: render }
      resize()
      update()
      setReady(true)
      setStatus('')
    }).catch(() => { if (!disposed) setStatus('The Apple model could not load. Reload to try again.') })
    return () => {
      disposed = true
      unsubscribe()
      observer.disconnect()
      surface.current = undefined
      model?.dispose()
      environmentMap.dispose()
      renderer.dispose()
    }
  }, [modelSrc, progress])
  useEffect(() => {
    if (!ready || !surface.current) return
    const current = surface.current
    let cancelled = false
    const textures: Texture[] = []
    const loader = new TextureLoader()
    Promise.all([screenSrc, coverSrc].map(src => loader.loadAsync(src).then(texture => {
      texture.colorSpace = SRGBColorSpace
      texture.anisotropy = Math.min(8, current.renderer.capabilities.getMaxAnisotropy())
      if (cancelled) texture.dispose()
      else textures.push(texture)
      return texture
    }))).then(([screen, cover]) => {
      if (cancelled) return
      current.model.screen.uniforms.screenMap.value = screen
      current.model.screen.uniforms.resolution.value.set(screen.image.width, screen.image.height)
      current.model.cover.uniforms.screenMap.value = cover
      current.model.cover.uniforms.resolution.value.set(cover.image.width, cover.image.height)
      current.model.screen.needsUpdate = true
      current.model.cover.needsUpdate = true
      current.draw()
      setStatus('')
    }).catch(() => { if (!cancelled) setStatus('A screen image could not load. Choose another image.') })
    return () => { cancelled = true; for (const texture of textures) texture.dispose() }
  }, [screenSrc, coverSrc, ready])
  useEffect(() => {
    if (!ready || !surface.current) return
    const current = surface.current
    let cancelled = false
    const textures: Texture[] = []
    for (const [src, material, map, enabled] of [[screenOverlaySrc, current.model.screen, 'overlayMap', 'hasOverlay'], [coverOverlaySrc, current.model.cover, 'overlayMap', 'hasOverlay'], [revealSrc, current.model.screen, 'revealMap', 'hasReveal']] as const) {
      material.uniforms[enabled].value = 0
      if (!src) continue
      new TextureLoader().loadAsync(src).then(texture => {
        if (cancelled || (material === current.model.screen && map === 'overlayMap' && videoAttached.current)) { texture.dispose(); return }
        texture.colorSpace = SRGBColorSpace
        textures.push(texture)
        material.uniforms[map].value = texture
        material.uniforms[enabled].value = 1
        if (map === 'overlayMap') { material.uniforms.overlayAspect.value = texture.image.width / texture.image.height; material.uniforms.overlayEncoded.value = 0 }
        current.draw()
      }).catch(() => { if (!cancelled) setStatus('Screen content could not load. Choose another image.') })
    }
    current.draw()
    return () => { cancelled = true; textures.forEach(texture => texture.dispose()) }
  }, [screenOverlaySrc, coverOverlaySrc, revealSrc, ready])
  useEffect(() => {
    const elements = [openVideo.current, closeVideo.current].filter((element): element is HTMLVideoElement => element !== null)
    if (!ready || !surface.current || elements.length === 0) return
    const current = surface.current
    const material = current.model.screen
    const textures = new Map<HTMLVideoElement, VideoTexture>()
    for (const element of elements) {
      const texture = new VideoTexture(element)
      texture.colorSpace = SRGBColorSpace
      texture.generateMipmaps = true
      texture.minFilter = LinearMipmapLinearFilter
      texture.anisotropy = Math.min(8, current.renderer.capabilities.getMaxAnisotropy())
      textures.set(element, texture)
    }
    let active: HTMLVideoElement | undefined
    let frame = 0
    const draw = () => { if (active) textures.get(active)!.needsUpdate = true; current.draw() }
    const loop = () => { draw(); frame = requestAnimationFrame(loop) }
    // Whichever video last played or seeked owns the screen; the opening video is the initial poster.
    const activate = (element: HTMLVideoElement) => {
      if (element.readyState < element.HAVE_CURRENT_DATA) return
      if (active === element) { draw(); return }
      active = element
      videoAttached.current = true
      material.uniforms.overlayMap.value = textures.get(element)
      material.uniforms.overlayAspect.value = element.videoWidth / element.videoHeight
      material.uniforms.overlayEncoded.value = 1
      material.uniforms.hasOverlay.value = 1
      element.dataset.active = 'true'
      for (const other of elements) if (other !== element) delete other.dataset.active
      draw()
    }
    const listeners: Array<[HTMLVideoElement, string, () => void]> = []
    const listen = (element: HTMLVideoElement, event: string, handler: () => void) => { element.addEventListener(event, handler); listeners.push([element, event, handler]) }
    for (const element of elements) {
      const isOpen = element === openVideo.current
      listen(element, 'loadeddata', () => {
        if (!active && (isOpen || !openVideo.current)) {
          activate(element)
          if (isOpen && progress.get() >= screenVideoStart && element.dataset.manual !== 'true' && !reducedMotion) element.play().catch(() => {})
        }
      })
      listen(element, 'seeked', () => activate(element))
      listen(element, 'play', () => { activate(element); cancelAnimationFrame(frame); loop() })
      listen(element, 'pause', () => { if (active === element) { cancelAnimationFrame(frame); draw() } })
      listen(element, 'ended', () => { if (active === element) { cancelAnimationFrame(frame); draw() } })
      listen(element, 'error', () => setStatus('A screen video could not load. The still image is shown instead.'))
      if (element.readyState >= element.HAVE_CURRENT_DATA) element.dispatchEvent(new Event('loadeddata'))
      else element.load()
    }
    return () => {
      cancelAnimationFrame(frame)
      for (const [element, event, handler] of listeners) element.removeEventListener(event, handler)
      if (videoAttached.current) { material.uniforms.overlayMap.value = undefined; material.uniforms.hasOverlay.value = 0; material.uniforms.overlayEncoded.value = 0 }
      videoAttached.current = false
      for (const element of elements) delete element.dataset.active
      for (const texture of textures.values()) texture.dispose()
    }
  }, [videoKey, ready])
  return <div {...props} className={`duo-device ${className}`} data-progress={amount.toFixed(3)} data-ready={ready}
  >
    <canvas ref={canvas} aria-hidden="true" />
    {openSources.length > 0 && <video key={`open:${videoKey}`} ref={openVideo} className="duo-screen-video" data-duo-screen-video="open" data-video-start={screenVideoStart} muted playsInline preload="auto" crossOrigin="anonymous" aria-hidden="true">{openSources.map(src => <source key={src} src={src} />)}</video>}
    {closeSources.length > 0 && <video key={`close:${videoKey}`} ref={closeVideo} className="duo-screen-video" data-duo-screen-video="close" data-video-start={screenCloseVideoStart} muted playsInline preload="auto" crossOrigin="anonymous" aria-hidden="true">{closeSources.map(src => <source key={src} src={src} />)}</video>}
    <button className="duo-device-target" type="button" aria-label="Fold or unfold phone" aria-pressed={amount >= 0.5} disabled={!ready}
      onPointerDown={event => {
        if (event.button !== 0) return
        drag.current = { x: event.clientX, value: progress.get(), moved: false }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={event => {
        const start = drag.current
        if (!start) return
        const delta = start.x - event.clientX
        if (Math.abs(delta) < 5 && !start.moved) return
        start.moved = true
        setValue(start.value + delta / (event.currentTarget.clientWidth * 0.5))
      }}
      onPointerUp={() => { if (drag.current) suppressClick.current = drag.current.moved; drag.current = undefined }}
      onPointerCancel={() => { if (drag.current) setValue(drag.current.value); drag.current = undefined; suppressClick.current = true }}
      onClick={event => { if (!suppressClick.current) toggle(event.detail === 0); suppressClick.current = false }}
    />
    {status && <p className="duo-status" role="status">{status}</p>}
  </div>
}
