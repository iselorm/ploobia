/** Scripted arrival coordinates share the Landing's jetty and follow-camera pose. */
import { LANDING_SPAWN } from '../components/archipelago/landingLayout'
export const ARRIVAL_SECONDS = 30
export const ARRIVAL_SEEN = 'ploobia.arrival.v1'
/** Cinematic clock only; never written into a world save. */
export const flight = { seconds: 0, paused: false }
export type Point = [number, number, number]
export const PLANE_DOCK: Point = [1, -0.1, 20]
export function dockCamera(): { camera: Point; look: Point } {
  const [x, y, z] = LANDING_SPAWN
  return { camera: [x, y + 0.6 + 2.9 * Math.sin(0.42) * 1.6, z + 6.2 * Math.cos(0.42)], look: [x, y + 0.6, z] }
}
const ROUTE: { t: number; plane: Point; camera: Point; look: Point }[] = [
  { t: 0, plane: [45, 33, 95], camera: [54, 38, 109], look: [8, 10, -12] },
  { t: 5, plane: [34, 25, 76], camera: [46, 31, 88], look: [0, 3, -28] },
  { t: 12, plane: [24, 16, 58], camera: [36, 24, 72], look: [0, 3, -12] },
  { t: 20, plane: [7, -0.1, 37], camera: [15, 5, 48], look: [4, 0, 21] },
  { t: 26, plane: PLANE_DOCK, camera: [8, 3, 28], look: [3, 0.7, 18] },
  { t: ARRIVAL_SECONDS, plane: PLANE_DOCK, ...dockCamera() },
]
type Pose = { plane: Point; camera: Point; look: Point }
const keys = ['plane', 'camera', 'look'] as const
/** Monotone Hermite tangents retain momentum without overshooting the waterline. */
const tangents = ROUTE.map((p, i) => {
  const result: Pose = { plane: [0, 0, 0], camera: [0, 0, 0], look: [0, 0, 0] }
  for (const key of keys) for (let axis = 0; axis < 3; axis++) {
    if (i === ROUTE.length - 1) continue
    const next = ROUTE[i + 1]
    const right = (next[key][axis] - p[key][axis]) / (next.t - p.t)
    if (i === 0) { result[key][axis] = right; continue }
    const prev = ROUTE[i - 1]
    const left = (p[key][axis] - prev[key][axis]) / (p.t - prev.t)
    result[key][axis] = left * right > 0 ? 2 * left * right / (left + right) : 0
  }
  return result
})
/** Supply an output object in frame loops to avoid garbage collection during the flight. */
export function arrivalPose(seconds: number, out: Pose = { plane: [0, 0, 0], camera: [0, 0, 0], look: [0, 0, 0] }) {
  const t = Math.max(0, Math.min(ARRIVAL_SECONDS, seconds))
  const index = Math.max(0, ROUTE.findIndex((p) => p.t >= t) - 1)
  const a = ROUTE[index], b = ROUTE[index + 1], span = b.t - a.t
  const u = (t - a.t) / span, u2 = u * u, u3 = u2 * u
  for (const key of keys) for (let axis = 0; axis < 3; axis++) {
    out[key][axis] = (2 * u3 - 3 * u2 + 1) * a[key][axis] + (u3 - 2 * u2 + u) * span * tangents[index][key][axis]
      + (-2 * u3 + 3 * u2) * b[key][axis] + (u3 - u2) * span * tangents[index + 1][key][axis]
  }
  return out
}
export function arrivalBeat(t: number) {
  if (t < 5) return { title: 'Through the clouds', line: 'Wait… I can see something!' }
  if (t < 12) return { title: 'The Ploobia Archipelago', line: 'Look at all those islands. Where would you go first?' }
  if (t < 20) return { title: 'Approaching The Landing', line: 'There! The harbour. We’re going down!' }
  if (t < 26) return { title: 'Welcome to The Landing', line: 'We landed on the water! Did you see that?' }
  return { title: 'Your adventure starts here', line: 'Come on! Someone’s been spilling water up that path.' }
}
