/**
 * Motion Yard — venues, planets and the launch family.
 *
 * The yard supersedes the Motion Lab room ("rigid and scary — like a prison").
 * A venue supplies ground, sky, light and backdrop; the kit is venue-agnostic.
 * The gravity dial retunes the *whole world*: Earth is a temperate day on the
 * Cinematic Lab meadow, the Moon is night, stars and grey dust, Mars is a
 * butterscotch sky over red sand. The Workshop is a bright maker-space hangar
 * — never the grey room again.
 *
 * The launch family (slingshot / catapult / trebuchet) all reduce to a launch
 * speed and an angle → the same parabola. That sameness is the insight, not a
 * gimmick. The trebuchet's launch speed honestly depends on g, so on the Moon
 * it throws slower *and* the ball falls slower.
 */

import type { WorldPreset } from './world'
import { landH } from './world'
import type { WorldId } from './motion'

/* ------------------------------------------------------------------ */
/* Venues                                                             */
/* ------------------------------------------------------------------ */

export type VenueId = 'outdoors' | 'workshop'

export const VENUES: Array<{ id: VenueId; label: string; blurb: string }> = [
  { id: 'outdoors', label: 'Outdoors', blurb: 'The meadow. Turn the gravity dial and the whole world retunes.' },
  { id: 'workshop', label: 'Workshop', blurb: 'The bright hangar — calm light, flat floor, exam conditions.' },
]

/** Planet presets drive the same interpolated WorldState as the garden biomes. */
export interface PlanetPreset extends WorldPreset {
  /** Daylight input for WorldState.step (0 = dusk skies, 1 = full day). */
  light: number
  /** Extra harsh-sun directional intensity (airless worlds need it). */
  boost: number
}

export const PLANET_PRESETS: Record<WorldId, PlanetPreset> = {
  earth: {
    sky: ['#3B7FC4', '#63A5DB', '#9CCBEA', '#C8E3F2', '#E3EEF0', '#C6D6C4'],
    skyDusk: ['#16233F', '#2B3F66', '#5A5F86', '#9A6F7E', '#C48A6C', '#8B6E5A'],
    sun: '#FFF4D6',
    sunDusk: '#FFB070',
    hemiSky: '#CFEAF5',
    hemiGround: '#5F8F4E',
    fogNear: 22,
    fogFar: 70,
    grass: '#6FAE5A',
    rock: '#9A9686',
    sand: '#B7A97D',
    bladeBase: '#4E8B3F',
    bladeTip: '#B4DE7A',
    bladeDensity: 0.85,
    bladeHeight: 1,
    moisture: 0.6,
    rain: 0,
    snow: 0,
    haze: 0.25,
    stars: 0,
    light: 0.85,
    boost: 0,
  },
  moon: {
    // No air: the sky is black at noon. Sky and dusk stops are the same so the
    // daylight mix cannot lighten it; stars are always out.
    sky: ['#04050A', '#05060C', '#07080F', '#0A0B12', '#0D0E14', '#101116'],
    skyDusk: ['#04050A', '#05060C', '#07080F', '#0A0B12', '#0D0E14', '#101116'],
    sun: '#FFFFFF',
    sunDusk: '#F4F1E8',
    hemiSky: '#23252E',
    hemiGround: '#3A3A40',
    fogNear: 60,
    fogFar: 180,
    grass: '#7E7E84',
    rock: '#5E5E63',
    sand: '#98989E',
    bladeBase: '#5E5E63',
    bladeTip: '#8E8E93',
    bladeDensity: 0,
    bladeHeight: 0.4,
    moisture: 0,
    rain: 0,
    snow: 0,
    haze: 0,
    stars: 1,
    light: 0,
    boost: 2.4,
  },
  mars: {
    sky: ['#8A5A3E', '#A76B44', '#C4854F', '#E5B98A', '#EDC192', '#C99A6A'],
    skyDusk: ['#2A1B22', '#4A2A2E', '#7A4238', '#B06A44', '#D08A55', '#9A6A44'],
    sun: '#FFE8C8',
    sunDusk: '#FFB584',
    hemiSky: '#E0B084',
    hemiGround: '#8A4A32',
    fogNear: 26,
    fogFar: 85,
    grass: '#A05538',
    rock: '#7A3E2C',
    sand: '#C98050',
    bladeBase: '#8A4A32',
    bladeTip: '#B06844',
    bladeDensity: 0,
    bladeHeight: 0.4,
    moisture: 0.02,
    rain: 0,
    snow: 0,
    haze: 0.8,
    stars: 0.12,
    light: 0.7,
    boost: 0.35,
  },
  jupiter: {
    // A thought experiment — "standing" on the cloud tops.
    sky: ['#B8926A', '#D9B586', '#E4C9A0', '#EDD9B4', '#E3C9A2', '#C9A67A'],
    skyDusk: ['#3A2C22', '#5C4432', '#8A6844', '#B08A5A', '#C9A06A', '#9A7A50'],
    sun: '#FFF2D2',
    sunDusk: '#F0B87A',
    hemiSky: '#E8D2AC',
    hemiGround: '#9A7A50',
    fogNear: 14,
    fogFar: 55,
    grass: '#C4A478',
    rock: '#A08050',
    sand: '#DCC49A',
    bladeBase: '#A08050',
    bladeTip: '#C9A96E',
    bladeDensity: 0,
    bladeHeight: 0.4,
    moisture: 0.1,
    rain: 0,
    snow: 0,
    haze: 0.9,
    stars: 0,
    light: 0.55,
    boost: 0,
  },
  sun: {
    sky: ['#FFF8DC', '#FFEFB8', '#FFE49A', '#FFD87E', '#FFCE66', '#F2B84E'],
    skyDusk: ['#E8B84A', '#F0C45A', '#F8D06A', '#FFDC7A', '#FFE48A', '#F0C05A'],
    sun: '#FFFFFF',
    sunDusk: '#FFF4D0',
    hemiSky: '#FFEFC0',
    hemiGround: '#8A6A3A',
    fogNear: 10,
    fogFar: 40,
    grass: '#4A4038',
    rock: '#3A342E',
    sand: '#5C5044',
    bladeBase: '#3A342E',
    bladeTip: '#5C5044',
    bladeDensity: 0,
    bladeHeight: 0.3,
    moisture: 0,
    rain: 0,
    snow: 0,
    haze: 1,
    stars: 0,
    light: 1,
    boost: 1.6,
  },
}

/* ------------------------------------------------------------------ */
/* Yard layout — world coordinates (the clearing ground is YARD_Y)     */
/* ------------------------------------------------------------------ */

/** Everything in the yard stands on the clearing (or the hangar floor). */
export const LAUNCH_ORIGIN: [number, number] = [-2.2, 1.7]
/** Height of the launch cup above the ground, metres. */
export const LAUNCH_H0 = 0.5
/** Target ring choices, metres downrange from the launcher. */
export const TARGETS = [4.5, 6.0, 7.5]
/** "Hit" tolerance, metres (spec: ±0.15 m). */
export const TARGET_TOL = 0.15
/** Prediction-ring tolerance for the place-it mission, metres. */
export const RING_TOL = 0.2

/**
 * Ground height (metres above the clearing floor) `d` metres downrange from
 * the launcher, along the +x firing line. Outdoors this is the real terrain —
 * launches past the clearing land on the meadow. The workshop floor is flat.
 */
export function groundAlongRange(venue: VenueId, d: number): number {
  if (venue === 'workshop') return 0
  return Math.max(0, landH(LAUNCH_ORIGIN[0] + d, LAUNCH_ORIGIN[1]))
}

/* ------------------------------------------------------------------ */
/* The launch family                                                  */
/* ------------------------------------------------------------------ */

export type LauncherId = 'slingshot' | 'catapult' | 'trebuchet'

export interface LauncherMeta {
  id: LauncherId
  label: string
  blurb: string
  power: { label: string; min: number; max: number; step: number; unit: string }
  /** Trebuchet releases at a fixed angle; the counterweight is the variable. */
  fixedAngle?: number
  /** Unlocked by a mission rather than available from the start. */
  locked?: boolean
}

export const LAUNCHERS: LauncherMeta[] = [
  {
    id: 'slingshot',
    label: 'Slingshot',
    blurb: 'Pull it back. Further pull, faster ball — the most direct "what happens if".',
    power: { label: 'Pull-back', min: 0.2, max: 1.0, step: 0.05, unit: 'm' },
  },
  {
    id: 'catapult',
    label: 'Catapult',
    blurb: 'An angle dial and a tension winder. The workhorse.',
    power: { label: 'Tension', min: 1, max: 5, step: 0.25, unit: '' },
  },
  {
    id: 'trebuchet',
    label: 'Trebuchet',
    blurb: 'A falling counterweight throws the ball — so its launch speed honestly depends on gravity.',
    power: { label: 'Counterweight', min: 2, max: 10, step: 0.5, unit: 'kg' },
    fixedAngle: 45,
    locked: true,
  },
]
export const LAUNCHER_BY_ID: Record<LauncherId, LauncherMeta> = Object.fromEntries(
  LAUNCHERS.map((l) => [l.id, l]),
) as Record<LauncherId, LauncherMeta>

export const ANGLE_MIN = 15
export const ANGLE_MAX = 75

/** Trebuchet: counterweight drop height and lever efficiency (tuned, honest form). */
const TREB_DROP = 0.5
const TREB_EFF = 0.12

/**
 * Launch speed for a launcher at a power setting. The slingshot and catapult
 * are elastic — g does not enter. The trebuchet converts counterweight
 * potential energy (M·g·h) into ball kinetic energy at efficiency η, so
 * v = √(2·η·M·g·h / m) — weaker on the Moon, in exactly the measurable way.
 */
export function launchSpeed(id: LauncherId, power: number, g: number, ballKg: number): number {
  if (id === 'slingshot') return power * 10
  if (id === 'catapult') return power * 2
  return Math.sqrt((2 * TREB_EFF * power * g * TREB_DROP) / Math.max(0.005, ballKg))
}

export interface FlightSample {
  t: number
  /** Downrange distance from the launcher, metres. */
  x: number
  /** Height above the clearing floor, metres. */
  y: number
  vx: number
  vy: number
}

export interface Flight {
  v0: number
  angle: number
  g: number
  /** Time of flight to ground contact, seconds. */
  T: number
  /** Downrange landing distance, metres. */
  range: number
  /** Peak height above the ground, metres. */
  peak: number
  /** Dense path samples (every 20 ms) for trails, curtains and ghosts. */
  path: FlightSample[]
}

/**
 * Solve a launch against real ground. Analytic parabola, numeric ground
 * contact (the meadow is not flat — that is a feature, and the Analyst copy
 * says so). Everything downstream (strobe, ghost, telemetry, readings) reads
 * from the returned path so the visuals and the data cannot disagree.
 */
export function solveFlight(v0: number, angleDeg: number, g: number, ground: (d: number) => number): Flight {
  const th = (angleDeg * Math.PI) / 180
  const vx = v0 * Math.cos(th)
  const vy = v0 * Math.sin(th)
  const y = (t: number) => LAUNCH_H0 + vy * t - 0.5 * g * t * t
  const x = (t: number) => vx * t
  // March until the ball is below ground (past the apex), then bisect.
  const dt = 0.004
  let t0 = 0
  let t1 = 0
  const tMax = (vy + Math.sqrt(vy * vy + 2 * g * (LAUNCH_H0 + 40))) / Math.max(1e-6, g) + 1
  for (let t = dt; t <= tMax; t += dt) {
    if (y(t) <= ground(x(t)) && t > (0.02 * v0) / Math.max(1, g)) {
      t0 = t - dt
      t1 = t
      break
    }
  }
  if (t1 === 0) t1 = t0 = tMax
  for (let i = 0; i < 30; i++) {
    const tm = (t0 + t1) / 2
    if (y(tm) <= ground(x(tm))) t1 = tm
    else t0 = tm
  }
  const T = (t0 + t1) / 2
  const range = x(T)
  const peak = LAUNCH_H0 + (vy * vy) / (2 * g)
  const path: FlightSample[] = []
  for (let t = 0; t <= T + 1e-9; t += 0.02) {
    path.push({ t, x: x(t), y: y(t), vx, vy: vy - g * t })
  }
  const last = path[path.length - 1]
  if (!last || last.t < T - 1e-6) path.push({ t: T, x: range, y: ground(range), vx, vy: vy - g * T })
  return { v0, angle: angleDeg, g, T, range, peak, path }
}

/** Position/velocity along a flight at time t (clamped), by interpolation. */
export function flightAt(f: Flight, t: number): FlightSample {
  if (t <= 0) return f.path[0]
  if (t >= f.T) return f.path[f.path.length - 1]
  const i = Math.min(f.path.length - 2, Math.floor(t / 0.02))
  const a = f.path[i]
  const b = f.path[i + 1]
  const u = (t - a.t) / Math.max(1e-9, b.t - a.t)
  return {
    t,
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    vx: a.vx,
    vy: a.vy + (b.vy - a.vy) * u,
  }
}
