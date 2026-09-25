/** Scripted arrival coordinates share the Landing's jetty and follow-camera pose. */
import { LANDING_SPAWN } from '../components/archipelago/landingLayout'
export const ARRIVAL_SECONDS = 30
export const ARRIVAL_SEEN = 'ploobia.arrival.v1'
/** Cinematic clock only; never written into a world save. */
export const flight = { seconds: 0, paused: false }
export type Point = [number, number, number]
export const PLANE_DOCK: Point = [1, -0.1, 20]
const ease = (t: number) => t * t * (3 - 2 * t)
const mix = (a: Point, b: Point, t: number): Point => a.map((v, i) => v + (b[i] - v) * t) as Point
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
export function arrivalPose(seconds: number) {
  const t = Math.max(0, Math.min(ARRIVAL_SECONDS, seconds))
  const index = Math.max(0, ROUTE.findIndex((p) => p.t >= t) - 1)
  const a = ROUTE[index], b = ROUTE[index + 1]
  const u = ease((t - a.t) / (b.t - a.t))
  return { plane: mix(a.plane, b.plane, u), camera: mix(a.camera, b.camera, u), look: mix(a.look, b.look, u) }
}
export function arrivalBeat(t: number) {
  if (t < 5) return { title: 'Through the clouds', line: 'Wait… I can see something!' }
  if (t < 12) return { title: 'The Ploobia Archipelago', line: 'Look at all those islands. Where would you go first?' }
  if (t < 20) return { title: 'Approaching The Landing', line: 'There! The harbour. We’re going down!' }
  if (t < 26) return { title: 'Welcome to The Landing', line: 'We landed on the water! Did you see that?' }
  return { title: 'Your adventure starts here', line: 'Come on! Someone’s been spilling water up that path.' }
}
