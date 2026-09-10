# DOOD · iPhone Duo

**Live: https://bonxn.github.io/dood-iphone-duo/**

An interactive folding iPhone Duo mockup showing the DOOD app's cover and inner screens, plus a script that renders the fold transition to video. Built on [jal-co/iphone-duo](https://github.com/jal-co/iphone-duo) (React 19, Three.js, Motion). The 3D model is by [Apple](https://www.apple.com/iphone-duo/).

## Run

Node.js 22.12 or newer.

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5201
```

Open `http://127.0.0.1:5201`. Drag horizontally across the phone, click it to toggle, or scrub the slider.

## Screens

`public/screens/` holds the display content:

| File | Surface | Canvas |
| --- | --- | --- |
| `outer.png` | Cover screen (closed) | 932 × 1356, from Figma frame `Outer Closed Landscape` at 2x |
| `inner.png` | Inner screen (open) | 1780 × 1252, from Figma frame `Inner Open Portrait - Split View` at 2x |
| `outer-bg.svg`, `inner-bg.svg` | Flat backdrop behind each overlay | 800 × 1120, 1600 × 1120 |

To update a design: export the frame from Figma as PNG (2x or 3x) to `public/screens/raw/outer.png` or `inner.png`, then run `python3 scripts/prepare-screens.py`. A transparent export is cropped to its opaque bounds; an opaque render on Figma's dark backdrop gets its rounded corners made transparent so the phone's own bezel shows through.

### Animated inner screen

The inner display can play videos instead of the still. `src/App.tsx` points `innerVideoOpen` at `public/screens/inner-open.mp4` and `innerVideoClose` at `inner-close.mp4`, each with a WebM fallback that headless Chromium uses for capture. When the fold passes `innerVideoStartDegrees` (70°) while opening, the opening video restarts from 0; when it passes `innerVideoCloseStartDegrees` (120°) while closing, the closing video restarts from 0. Each video holds its last frame when it ends. The opening video's first frame is the poster before any transition; the still image is shown until a video can play, and alone if the files are missing. Leave out `innerVideoClose` to rewind the opening video on close instead.

To install your own animations (any format, ideally 890 × 626 or 1780 × 1252 at 30fps):

```sh
sh scripts/prepare-screen-video.sh path/to/opening.mov open
sh scripts/prepare-screen-video.sh path/to/closing.mov close
```

This scales and center-crops to 1780 × 1252 and writes both encodings. `sh scripts/make-placeholder-video.sh` builds stand-in clips from the still for testing the pipeline. Rounded corners are masked in the shader (`innerCorner`), so the videos can have square corners.

## Render the video

```sh
npx playwright install chromium   # once
npm run render          # full: closed 1s → unfold 2s → open 2s → fold 2s → closed 1s (8s)
npm run render:unfold   # unfold only: closed 0.5s → unfold 2s → open 1.5s (4s)
```

`scripts/render-video.mjs` starts the dev server if needed, captures the clip at 1920 × 1080, 30fps, and writes `exports/duo-fold.mp4` or `exports/duo-unfold.mp4` plus a `<clip>-contact-sheet.jpg` and proof frames in `exports/proofs/<clip>/`. Timelines live in the `clips` table at the top of the script. When a screen video is configured, the capture seeks it frame by frame so it stays exactly in sync with the fold.

## Test and build

```sh
npm run build
npm test
```

## Deploy

Every push to `main` builds the site and publishes it to GitHub Pages via `.github/workflows/pages.yml`. The workflow sets `BASE_PATH=/dood-iphone-duo/` so asset URLs resolve under the repository sub-path; local dev keeps `/`.

## Attribution

Apple's model and its textures are not covered by the MIT license; see `THIRD_PARTY.md` before redistributing. The folding component in `src/iphone-duo/` is MIT-licensed by its original author.
