import * as THREE from 'three'
import { rngFor } from '@/lib/challenge'
import type { SugarResource } from '@/lib/sugarchallenge'
import type { SugarRig } from './rig'

/**
 * Where the gather round's catchables come from, and how much room they need.
 *
 * Pulled out of `GatherRound` so that exactly one piece of code decides where
 * things spawn. The renderer needs the paths; the camera needs the volume they
 * occupy. When those were two calculations they were free to disagree, and they
 * did: motes streamed in from far above the frame while the camera framed the
 * plant, so most of a mote's catchable life happened off-screen. Playing the
 * deployed build, two full sweeps of the visible grass caught nothing at all.
 *
 * **The fix is not to scatter catchables where the learner happens to be
 * looking.** Light arrives down the sun's own lanes, carbon drifts across the
 * canopy, water rises out of the soil — spraying them over empty grass to make
 * the game easier would put the geography at odds with the biology, which is
 * the one thing this cabinet must never do. Instead the paths are cut to a
 * length that belongs on screen, and the camera is told to frame *the field*
 * rather than the specimen.
 */

/** Where one catchable starts and ends. Derived from the seed and never edited. */
export interface Spawn {
  kind: SugarResource
  from: THREE.Vector3
  to: THREE.Vector3
  speed: number
  /** Its starting place along the path, 0–1. */
  phase: number
}

export interface GatherField {
  items: Spawn[]
  /** The volume the catchable stretches of every path occupy. */
  bounds: THREE.Box3
}

/**
 * How far up-sun a photon starts, as a multiple of the plant's height plus a
 * constant.
 *
 * Was `1.4 × height + 1.4`, which on a bean is 4.8 world units — twice the
 * plant, and taller than the camera's frame. A mote spent most of its life
 * above the top of the screen and only entered the visible band as it faded
 * out. Shorter travel means the whole journey is watchable, which is also the
 * only way the lesson lands: you are meant to *see* light arriving at a leaf.
 */
const LIGHT_REACH = 0.75
const LIGHT_REACH_BASE = 0.5

/**
 * The stretch of a path over which a mote is solid enough to be caught.
 *
 * Not a taste decision — it is where `fade` (see `GatherRound`) reaches 0.4,
 * which is the threshold the catch test itself uses. Framing has to agree with
 * catching about which part of a path matters, so the number lives here and
 * both read it.
 */
export const CATCH_WINDOW = { lo: 0.08, hi: 0.92 }

/** The direction light travels: down along the sun's own elevation and azimuth. */
export function sunTravel(elevation: number, azimuth: number): THREE.Vector3 {
  return new THREE.Vector3(
    Math.cos(elevation) * Math.sin(azimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.cos(azimuth),
  )
    .normalize()
    .multiplyScalar(-1)
}

export function buildGatherField(
  rig: SugarRig,
  seed: number,
  elevation: number,
  azimuth: number,
  count: number,
): GatherField {
  const travel = sunTravel(elevation, azimuth)
  const next = rngFor(seed)
  const leaves = [...rig.leaves].sort((a, b) => b.source.y - a.source.y)
  const canopy = rig.height * 0.7
  const reach = rig.height * LIGHT_REACH + LIGHT_REACH_BASE
  const items: Spawn[] = []

  for (let i = 0; i < count; i++) {
    const roll = next()
    const kind: SugarResource = roll < 0.5 ? 'light' : roll < 0.82 ? 'co2' : 'water'
    const leaf = leaves[i % Math.max(1, leaves.length)]
    const to = leaf ? leaf.source.clone() : new THREE.Vector3(0, canopy, 0)
    let from: THREE.Vector3

    if (kind === 'light') {
      from = to.clone().addScaledVector(travel, -reach)
    } else if (kind === 'co2') {
      const a = next() * Math.PI * 2
      const r = 1.2 + next() * 0.7
      from = new THREE.Vector3(Math.cos(a) * r, canopy + (next() - 0.5) * 0.7, Math.sin(a) * r)
    } else {
      const a = next() * Math.PI * 2
      const r = 0.25 + next() * 0.5
      from = new THREE.Vector3(Math.cos(a) * r, -0.35, Math.sin(a) * r)
    }

    items.push({
      kind,
      from,
      to: kind === 'water' ? new THREE.Vector3(from.x * 0.3, canopy * 0.85, from.z * 0.3) : to,
      phase: next(),
      speed: 0.16 + next() * 0.16,
    })
  }

  /* The box covers only the catchable stretches. A mote outside that window is
     scaled to nothing and cannot be caught, so demanding the camera find room
     for it would push the plant into the distance for no gain. Both endpoints
     of the window are enough: the path between them is a straight line. */
  const bounds = new THREE.Box3()
  const at = new THREE.Vector3()
  for (const it of items) {
    bounds.expandByPoint(at.lerpVectors(it.from, it.to, CATCH_WINDOW.lo))
    bounds.expandByPoint(at.lerpVectors(it.from, it.to, CATCH_WINDOW.hi))
  }
  // The specimen itself is always in shot: the learner has to see what they are
  // gathering *for*, and a frame of bare sky would be a puzzle rather than a game.
  bounds.expandByPoint(new THREE.Vector3(0, 0, 0))
  bounds.expandByPoint(new THREE.Vector3(0, rig.height, 0))

  return { items, bounds }
}

/**
 * Where to put the camera so the whole field is in shot.
 *
 * Fits the bounding *sphere* rather than the box, which is slightly generous
 * and, more usefully, does not care which way round the plant the learner had
 * the camera when the round began: the direction is preserved and only the
 * distance changes, so the round opens from where they were standing instead
 * of cutting to a new angle.
 */
export function framingFor(
  bounds: THREE.Box3,
  from: THREE.Vector3,
  fovDegrees: number,
  aspect: number,
  out: { position: THREE.Vector3; target: THREE.Vector3 },
): void {
  const centre = bounds.getCenter(out.target)
  const radius = Math.max(0.5, bounds.getBoundingSphere(new THREE.Sphere()).radius)

  const fovV = THREE.MathUtils.degToRad(fovDegrees)
  const fovH = 2 * Math.atan(Math.tan(fovV / 2) * Math.max(0.2, aspect))
  // The tighter of the two axes is the one that decides — on a phone in
  // portrait that is the width, and fitting only the height would put half the
  // field outside the glass on the very device the round was designed for.
  const half = Math.min(fovV, fovH) / 2
  const distance = THREE.MathUtils.clamp((radius / Math.sin(half)) * MARGIN, 2, 24)

  /* A scratch vector of its own, and not `out.position`.
     Aliasing them looks harmless and is not: `out.position.copy(centre)` runs
     before `dir.normalize()` is evaluated, so the direction is overwritten by
     the centre and the camera converges on `centre + normalise(centre) × d` —
     a fixed point with nothing to do with where the learner was standing. It
     still framed the field, so every on-screen check passed while the camera
     crept across the sky for seven seconds. */
  DIR.copy(from).sub(centre)
  if (DIR.lengthSq() < 1e-6) DIR.set(0.35, 0.35, 1)
  out.position.copy(centre).addScaledVector(DIR.normalize(), distance)
}

const DIR = new THREE.Vector3()

/** A little air around the field, so the collector can reach its edges. */
const MARGIN = 1.08
