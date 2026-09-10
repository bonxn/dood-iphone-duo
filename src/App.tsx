import { useState } from 'react'
import { useMotionValueEvent } from 'motion/react'
import { AppleCredit, FoldablePhone, FoldScrubber, FoldToggle, PhoneBackground, PhoneDevice, useFoldablePhone } from './iphone-duo'

// Asset URLs respect Vite's base path so the site also works under a sub-path (GitHub Pages).
const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`

const screens = {
  model: asset('models/iphone-duo.glb'),
  inner: asset('screens/inner.png'),
  cover: asset('screens/outer.png'),
  innerBackground: asset('screens/inner-bg.svg'),
  coverBackground: asset('screens/outer-bg.svg'),
  // Inner-screen animations. MP4 (H.264, hardware-decoded) first for real browsers; headless capture can't play it and falls back to WebM.
  // Remove both to use the still image only.
  innerVideoOpen: [asset('screens/inner-open.mp4'), asset('screens/inner-open.webm')],   // plays when the fold passes the opening angle while opening
  innerVideoClose: [asset('screens/inner-close.mp4'), asset('screens/inner-close.webm')], // plays when the fold passes the closing angle while closing
  // Fold angles, in degrees: the opening video starts once the fold passes the first while opening,
  // the closing video once it passes the second while closing.
  innerVideoStartDegrees: 70,
  innerVideoCloseStartDegrees: 120,
  // Rounded corner radius of the inner display content, as a fraction of its height (103px of 1252px).
  innerCorner: 103 / 1252,
}

function FoldDegrees() {
  const { progress } = useFoldablePhone()
  const [degrees, setDegrees] = useState(Math.round(progress.get() * 180))
  useMotionValueEvent(progress, 'change', value => setDegrees(Math.round(value * 180)))
  return <output aria-label="Opening angle">{degrees}°</output>
}

export default function App() {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  return <main className={dark ? 'page dark' : 'page'}>
    <FoldablePhone className="phone-study" defaultValue={0} duration={2}>
      <PhoneBackground />
      <PhoneDevice modelSrc={screens.model} screenSrc={screens.innerBackground} coverSrc={screens.coverBackground} screenOverlaySrc={screens.inner} coverOverlaySrc={screens.cover} screenVideoSrc={screens.innerVideoOpen} screenCloseVideoSrc={screens.innerVideoClose} screenVideoStart={screens.innerVideoStartDegrees / 180} screenCloseVideoStart={screens.innerVideoCloseStartDegrees / 180} screenCorner={screens.innerCorner} rotation={-6} exposure={1.2} blur={48} parallax={1} />
      <div className="phone-controls"><FoldToggle /><FoldScrubber /><FoldDegrees /></div>
      <div className="phone-caption"><span>Drag to unfold. Click to open or close.</span><AppleCredit /></div>
    </FoldablePhone>
    <nav className="page-actions" aria-label="Page controls"><button type="button" onClick={() => setDark(!dark)}>{dark ? 'Light mode' : 'Dark mode'}</button></nav>
  </main>
}
