export const FOLD_DURATION = 2

// Fold progress at which the inner screen starts its final sharpening (120° of 180°).
export const INNER_SETTLE_START = 2 / 3
// Perceived blur tracks log2(radius), so a linear fade reads as "blurry… blurry… snap" in the last few degrees.
// After INNER_SETTLE_START the defocus decays exponentially with this rate, which makes the sharpening
// read evenly from 120° to 180°. Higher = sharp sooner.
const INNER_SETTLE_RATE = 4

export function foldChoreography(progress: number) {
  const p = Math.max(0, Math.min(1, progress))
  const hinge = Math.min(1, p / 0.96)
  return {
    angle: (1 - hinge) * Math.PI,
    coverFocusEdge: 1.25 - Math.min(1, p / 0.45) * 1.1,
    innerDefocus: innerDefocus(p),
  }
}

function innerDefocus(p: number) {
  const early = (1 - p) ** 0.65
  if (p < INNER_SETTLE_START) return early
  const atStart = (1 - INNER_SETTLE_START) ** 0.65
  const t = (p - INNER_SETTLE_START) / (1 - INNER_SETTLE_START)
  const floor = 2 ** -INNER_SETTLE_RATE
  return atStart * (2 ** (-INNER_SETTLE_RATE * t) - floor) / (1 - floor)
}
