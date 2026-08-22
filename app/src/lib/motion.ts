/**
 * Motion Lab — the first physics cabinet (Mechanics strand, layers 0–2).
 *
 * One room that grows: a bench with a rolling track, a rule, a stopwatch and
 * a ball; a drop tower beside it; a gravity dial on the wall. The learner's
 * own reaction time — measured from real taps, never faked — is the thread
 * that turns "time a roll" into "why do my five timings disagree?" and then
 * into "so how would you time something properly?" (the segue to the
 * pendulum). All motion here is analytic: positions are functions of time,
 * so crossing times are exact and honest whatever the frame rate.
 */

import type { Band, BandCaps } from './bands'
import type { SkillId } from './events'
import { fitLine, type Point } from './practical'
import {
  flightAt,
  groundAlongRange,
  launchSpeed as familyLaunchSpeed,
  RING_TOL,
  solveFlight,
  TARGET_TOL,
  type Flight,
  type LauncherId,
  type VenueId,
} from './yard'

/* ------------------------------------------------------------------ */
/* Worlds — gravity is a dial, not a fact                             */
/* ------------------------------------------------------------------ */

export type WorldId = 'earth' | 'moon' | 'mars' | 'jupiter' | 'sun'

export interface WorldMeta {
  id: WorldId
  label: string
  g: number
  /** Sky through the window: zenith, horizon, ground glow. */
  sky: [string, string, string]
  /** Star visibility 0–1. */
  stars: number
  /** Only shown when the band exposes extra worlds. */
  extra?: boolean
  note: string
}

export const WORLDS: WorldMeta[] = [
  {
    id: 'earth',
    label: 'Earth',
    g: 9.81,
    sky: ['#3B7FC4', '#C8E3F2', '#E9EFE6'],
    stars: 0,
    note: 'Home. g ≈ 9.8 m/s² — every second of falling adds almost 10 m/s of speed.',
  },
  {
    id: 'moon',
    label: 'Moon',
    g: 1.62,
    sky: ['#05060C', '#0B0E1A', '#1A1C22'],
    stars: 1,
    note: 'No air, one-sixth the gravity. Things fall slowly enough to time by hand.',
  },
  {
    id: 'mars',
    label: 'Mars',
    g: 3.72,
    sky: ['#B0754A', '#E5B98A', '#D9A574'],
    stars: 0.15,
    note: 'Butterscotch sky, about a third of Earth’s gravity.',
  },
  {
    id: 'jupiter',
    label: 'Jupiter',
    g: 24.79,
    sky: ['#B8926A', '#E4C9A0', '#C9A67A'],
    stars: 0,
    extra: true,
    note: 'No solid surface — this is "if you could stand at the cloud tops". Two and a half times Earth.',
  },
  {
    id: 'sun',
    label: 'Sun',
    g: 274,
    sky: ['#FFF3C4', '#FFE08A', '#FFC85A'],
    stars: 0,
    extra: true,
    note: 'A thought experiment: there is no surface to stand on. Twenty-eight times Earth.',
  },
]
export const WORLD_BY_ID: Record<WorldId, WorldMeta> = Object.fromEntries(WORLDS.map((w) => [w.id, w])) as Record<
  WorldId,
  WorldMeta
>

/* ------------------------------------------------------------------ */
/* Bench kit                                                          */
/* ------------------------------------------------------------------ */

export type SurfaceId = 'smooth' | 'felt' | 'rough'
export interface SurfaceMeta {
  id: SurfaceId
  label: string
  /** Rolling-resistance coefficient: deceleration = μ·g. */
  mu: number
  color: string
}
export const SURFACES: SurfaceMeta[] = [
  { id: 'smooth', label: 'Smooth track', mu: 0.005, color: '#D8D2C4' },
  { id: 'felt', label: 'Felt', mu: 0.02, color: '#3F6E4A' },
  { id: 'rough', label: 'Rough mat', mu: 0.05, color: '#8A6A4A' },
]
export const SURFACE_BY_ID: Record<SurfaceId, SurfaceMeta> = Object.fromEntries(
  SURFACES.map((s) => [s.id, s]),
) as Record<SurfaceId, SurfaceMeta>

export type MassId = 'steel' | 'wood'
export interface MassMeta {
  id: MassId
  label: string
  grams: number
  color: string
  metal: boolean
}
export const MASSES: MassMeta[] = [
  { id: 'steel', label: 'Steel ball · 100 g', grams: 100, color: '#8E97A3', metal: true },
  { id: 'wood', label: 'Wooden ball · 20 g', grams: 20, color: '#C99A5B', metal: false },
]
export const MASS_BY_ID: Record<MassId, MassMeta> = Object.fromEntries(MASSES.map((m) => [m.id, m])) as Record<
  MassId,
  MassMeta
>

/** Push strengths — Explorer gets three buttons, Scientist+ a slider. */
export const PUSHES = [
  { label: 'Gentle', v0: 0.6 },
  { label: 'Medium', v0: 1.0 },
  { label: 'Hard', v0: 1.4 },
]
export const PUSH_MIN = 0.4
export const PUSH_MAX = 1.6

/** Distance markers painted on the bench, metres from the start line. */
export const MARKERS = [0.5, 1.0, 1.5, 2.0]
/** Where the ball rests before a push, metres from the start line. */
export const BALL_REST = -0.35
/** Track length past the start line, metres — an end stop catches the ball. */
export const TRACK_LEN = 2.05
export const BALL_RADIUS = 0.045

export const DROP_MIN = 0.2
export const DROP_MAX = 2.0

/* ------------------------------------------------------------------ */
/* Kinematics — closed form so crossings are exact                    */
/* ------------------------------------------------------------------ */

/** Time for a ball pushed at v0 from x0 with deceleration a to reach x, or null. */
export function crossingTime(x0: number, v0: number, a: number, x: number): number | null {
  const d = x - x0
  if (d <= 0) return 0
  if (a <= 1e-9) return d / v0
  const disc = v0 * v0 - 2 * a * d
  if (disc < 0) return null
  return (v0 - Math.sqrt(disc)) / a
}
/** Where a decelerating ball comes to rest, relative to x0. */
export function stopDistance(v0: number, a: number): number {
  return a <= 1e-9 ? Infinity : (v0 * v0) / (2 * a)
}
export function rollX(x0: number, v0: number, a: number, t: number): number {
  const tStop = a <= 1e-9 ? Infinity : v0 / a
  const tt = Math.min(t, tStop)
  return x0 + v0 * tt - 0.5 * a * tt * tt
}
export function fallTime(h: number, g: number): number {
  return Math.sqrt((2 * h) / g)
}
export function landingSpeed(h: number, g: number): number {
  return Math.sqrt(2 * g * h)
}

/* ------------------------------------------------------------------ */
/* Sim — one mutable object shared with the render loop               */
/* ------------------------------------------------------------------ */

export type LabMode = 'roll' | 'drop' | 'launch'
export type MotionViewId = 'overview' | 'bench' | 'drop' | 'instrument'

export interface LaunchLog {
  launcher: LauncherId
  v0: number
  angle: number
  world: WorldId
  g: number
  mass: MassId
  /** Downrange landing distance and time of flight, from the solved flight. */
  range: number
  tof: number
  /** Learner-placed prediction ring, metres downrange (null = not placed). */
  ringAt: number | null
  /** ring − landing, metres (null when no ring). */
  ringGap: number | null
  /** Target ring distance this launch aimed at, and whether it hit ±0.15 m. */
  target: number
  hit: boolean
}

export interface RollSample {
  t: number
  x: number
  v: number
}

export interface RollLog {
  push: number
  surface: SurfaceId
  mass: MassId
  world: WorldId
  /** Metres past the start line where it stopped (TRACK_LEN if it hit the end). */
  stopDist: number
}
export interface DropLog {
  height: number
  world: WorldId
  paired: boolean
  mass: MassId
}

export interface TraceSample {
  t: number
  h: number
}

export interface MotionSim {
  time: number
  /** performance.now() at the last frame, for sub-frame tap timestamps. */
  lastWall: number
  started: boolean
  paused: boolean
  demoMode: boolean

  mode: LabMode
  world: WorldId
  g: number
  venue: VenueId
  /** Physics Vision — the single toggle for the whole AR layer. On by default. */
  visionOn: boolean

  /* roll */
  surface: SurfaceId
  mass: MassId
  push: number
  /** Marker the learner is timing to. */
  target: number
  ballX: number
  ballSpin: number
  rolling: boolean
  rollStartAt: number
  rollV0: number
  rollX0: number
  rollA: number
  /** Sim time the ball crosses each marker (and 0 = start line); null if it never will. */
  crossAt: Record<string, number | null>
  gatesUnlocked: boolean
  gateDist: number
  /** Increments when a photogate pair completes a measurement. */
  gateDone: number
  gateSnapshot: { d: number; t: number } | null
  rollDone: number
  rollLog: RollLog[]
  /** Current run's path (t, x, v) every 50 ms — trails, curtain, telemetry. */
  rollPath: RollSample[]
  /** Previous run, kept for the ghost race. */
  ghostRoll: RollSample[] | null

  /* launch */
  launcher: LauncherId
  launchAngle: number
  /** Power setting per launcher (pull-back m / tension / counterweight kg). */
  launchPower: Record<LauncherId, number>
  trebuchetUnlocked: boolean
  launching: boolean
  launchStartAt: number
  /** The solved flight currently in the air (or just landed). */
  flight: Flight | null
  /** The previous flight — the ghost arc. */
  ghostFlight: Flight | null
  /** Live projectile position for the renderer (downrange, height). */
  projX: number
  projY: number
  launchDone: number
  launchLog: LaunchLog[]
  /** Learner-placed landing call, metres downrange; null = not placed. */
  predictRing: number | null
  /** Gap shown after the last landing (ring − landing), null = no ring. */
  lastRingGap: number | null
  targetDist: number

  /* drop */
  dropHeight: number
  dropping: boolean
  dropStartAt: number
  dropH0: number
  dropPaired: boolean
  /** Heights of the two balls (metres above the pad); ball B is the paired one. */
  ballAY: number
  ballBY: number
  landedAt: number | null
  dropDone: number
  dropLog: DropLog[]
  padUnlocked: boolean
  padDone: number
  padSnapshot: { h: number; t: number } | null
  sensorUnlocked: boolean
  sensorArmed: boolean
  traceDone: number
  traceSnapshot: { h: number; t: number; samples: TraceSample[] } | null

  /* stopwatch — runs on sim time, the same clock as the ball */
  swRunning: boolean
  swStartAt: number
  swElapsed: number
  /** Increments on every STOP so the page can turn it into a reading. */
  swStops: number
  swLast: { start: number; stop: number } | null
  /** Early/late feedback for the last tap, seconds (positive = late). */
  swFlick: number | null
  swFlickAt: number

  /* calibration lamp */
  lampOn: boolean

  /* segue */
  drawerOpen: boolean

  /* camera */
  viewId: MotionViewId
  viewSeq: number
  viewZoom: number
  viewReset: number
  autoOrbit: boolean
}

export function createMotionSim(): MotionSim {
  return {
    time: 0,
    lastWall: typeof performance !== 'undefined' ? performance.now() : 0,
    started: false,
    paused: false,
    demoMode: false,
    mode: 'roll',
    world: 'earth',
    g: WORLD_BY_ID.earth.g,
    venue: 'outdoors',
    visionOn: true,
    surface: 'felt',
    mass: 'steel',
    push: 1.0,
    target: 1.0,
    ballX: BALL_REST,
    ballSpin: 0,
    rolling: false,
    rollStartAt: 0,
    rollV0: 0,
    rollX0: BALL_REST,
    rollA: 0,
    crossAt: {},
    gatesUnlocked: false,
    gateDist: 1.0,
    gateDone: 0,
    gateSnapshot: null,
    rollDone: 0,
    rollLog: [],
    rollPath: [],
    ghostRoll: null,
    launcher: 'slingshot',
    launchAngle: 40,
    launchPower: { slingshot: 0.6, catapult: 2.5, trebuchet: 5 },
    trebuchetUnlocked: false,
    launching: false,
    launchStartAt: 0,
    flight: null,
    ghostFlight: null,
    projX: 0,
    projY: 0,
    launchDone: 0,
    launchLog: [],
    predictRing: null,
    lastRingGap: null,
    targetDist: 6.0,
    dropHeight: 1.0,
    dropping: false,
    dropStartAt: 0,
    dropH0: 1.0,
    dropPaired: false,
    ballAY: 1.0,
    ballBY: 1.0,
    landedAt: null,
    dropDone: 0,
    dropLog: [],
    padUnlocked: false,
    padDone: 0,
    padSnapshot: null,
    sensorUnlocked: false,
    sensorArmed: false,
    traceDone: 0,
    traceSnapshot: null,
    swRunning: false,
    swStartAt: 0,
    swElapsed: 0,
    swStops: 0,
    swLast: null,
    swFlick: null,
    swFlickAt: 0,
    lampOn: false,
    drawerOpen: false,
    viewId: 'overview',
    viewSeq: 0,
    viewZoom: 0,
    viewReset: 0,
    autoOrbit: false,
  }
}

/** Sim time *now*, interpolated inside the current frame so a tap between frames is honest. */
export function simNow(sim: MotionSim): number {
  if (typeof performance === 'undefined') return sim.time
  const dt = Math.min(0.25, Math.max(0, (performance.now() - sim.lastWall) / 1000))
  return sim.time + dt
}

/* ---- actions (called by handlers and by the guided demo alike) ---- */

export function pushBall(sim: MotionSim, at = simNow(sim)): void {
  if (sim.rolling) return
  const mu = SURFACE_BY_ID[sim.surface].mu
  // The run that just finished becomes the ghost — race yourself.
  if (sim.rollPath.length > 1) sim.ghostRoll = sim.rollPath
  sim.rolling = true
  sim.rollStartAt = at
  sim.rollV0 = sim.push
  sim.rollX0 = BALL_REST
  sim.rollA = mu * sim.g
  sim.crossAt = {}
  for (const d of [0, ...MARKERS]) {
    const t = crossingTime(BALL_REST, sim.push, sim.rollA, d)
    sim.crossAt[String(d)] = t === null ? null : at + t
  }
  const tEnd = crossingTime(BALL_REST, sim.push, sim.rollA, TRACK_LEN)
  sim.crossAt.end = tEnd === null ? null : at + tEnd
  // Precompute the whole run (analytic, so trails and telemetry are exact).
  const tStop = sim.rollA <= 1e-9 ? 30 : sim.rollV0 / sim.rollA
  // crossingTime is relative to the push, so tEnd needs no offset here.
  const dur = Math.min(tStop, tEnd === null ? tStop : tEnd + 1e-9, 30)
  const path: RollSample[] = []
  for (let t = 0; t <= dur + 1e-9; t += 0.05) {
    path.push({ t, x: rollX(BALL_REST, sim.rollV0, sim.rollA, t), v: Math.max(0, sim.rollV0 - sim.rollA * t) })
  }
  path.push({ t: dur, x: rollX(BALL_REST, sim.rollV0, sim.rollA, dur), v: Math.max(0, sim.rollV0 - sim.rollA * dur) })
  sim.rollPath = path
}

/** Position/speed along a stored roll path at time t, interpolated. */
export function rollPathAt(path: RollSample[], t: number): RollSample {
  if (path.length === 0) return { t: 0, x: BALL_REST, v: 0 }
  if (t <= 0) return path[0]
  const last = path[path.length - 1]
  if (t >= last.t) return last
  const i = Math.min(path.length - 2, Math.floor(t / 0.05))
  const a = path[i]
  const b = path[i + 1]
  const u = (t - a.t) / Math.max(1e-9, b.t - a.t)
  return { t, x: a.x + (b.x - a.x) * u, v: a.v + (b.v - a.v) * u }
}

/** Launch speed the current settings would give (shown live in the HUD). */
export function currentLaunchSpeed(sim: MotionSim): number {
  return familyLaunchSpeed(sim.launcher, sim.launchPower[sim.launcher], sim.g, MASS_BY_ID[sim.mass].grams / 1000)
}

export function fireLaunch(sim: MotionSim, at = simNow(sim)): void {
  if (sim.launching) return
  const v0 = currentLaunchSpeed(sim)
  const flight = solveFlight(v0, sim.launchAngle, sim.g, (d) => groundAlongRange(sim.venue, d))
  sim.ghostFlight = sim.flight
  sim.flight = flight
  sim.launching = true
  sim.launchStartAt = at
  sim.projX = 0
  sim.projY = flight.path[0].y
  sim.lastRingGap = null
}

/** Seconds into the current (or last) flight, clamped to its duration. */
export function flightElapsed(sim: MotionSim): number {
  if (!sim.flight) return 0
  return Math.max(0, Math.min(simNow(sim) - sim.launchStartAt, sim.flight.T))
}

export function resetLaunch(sim: MotionSim): void {
  sim.launching = false
  sim.flight = null
  sim.projX = 0
  sim.projY = 0
}

export function resetBall(sim: MotionSim): void {
  sim.rolling = false
  sim.ballX = BALL_REST
  sim.crossAt = {}
}

export function releaseDrop(sim: MotionSim, paired: boolean, at = simNow(sim)): void {
  if (sim.dropping) return
  sim.dropping = true
  sim.dropPaired = paired
  sim.dropStartAt = at
  sim.dropH0 = sim.dropHeight
  sim.ballAY = sim.dropHeight
  sim.ballBY = sim.dropHeight
  sim.landedAt = null
  sim.sensorArmed = sim.sensorUnlocked
}

export function resetDrop(sim: MotionSim): void {
  sim.dropping = false
  sim.ballAY = sim.dropHeight
  sim.ballBY = sim.dropHeight
  sim.landedAt = null
}

/** The learner (or the demo) taps the stopwatch. Returns what happened. */
export function tapStopwatch(sim: MotionSim, at = simNow(sim)): 'start' | 'stop' {
  if (!sim.swRunning) {
    sim.swRunning = true
    sim.swStartAt = at
    sim.swElapsed = 0
    // Early/late against the event they were meant to catch.
    const ref = referenceStart(sim)
    sim.swFlick = ref === null ? null : at - ref
    sim.swFlickAt = at
    return 'start'
  }
  sim.swRunning = false
  sim.swElapsed = at - sim.swStartAt
  sim.swLast = { start: sim.swStartAt, stop: at }
  const ref = referenceStop(sim)
  sim.swFlick = ref === null ? null : at - ref
  sim.swFlickAt = at
  sim.swStops += 1
  return 'stop'
}
export function resetStopwatch(sim: MotionSim): void {
  sim.swRunning = false
  sim.swElapsed = 0
  sim.swFlick = null
}

/** The instant a START tap *should* have happened for the current motion. */
export function referenceStart(sim: MotionSim): number | null {
  if (sim.mode === 'roll') return sim.rolling ? (sim.crossAt['0'] ?? null) : null
  if (sim.mode === 'launch') return sim.launching ? sim.launchStartAt : null
  return sim.dropping ? sim.dropStartAt : null
}
/** The instant a STOP tap should have happened. */
export function referenceStop(sim: MotionSim): number | null {
  if (sim.mode === 'roll') return sim.rolling ? (sim.crossAt[String(sim.target)] ?? null) : null
  if (sim.mode === 'launch') return sim.flight ? sim.launchStartAt + sim.flight.T : null
  if (!sim.dropping && sim.landedAt === null) return null
  return sim.dropStartAt + fallTime(sim.dropH0, sim.g)
}

/** True time between the two events the learner is timing (roll: start line → target; drop: release → land). */
export function trueInterval(sim: MotionSim): number | null {
  if (sim.mode === 'roll') {
    const a = sim.crossAt['0']
    const b = sim.crossAt[String(sim.target)]
    if (a === null || a === undefined || b === null || b === undefined) return null
    return b - a
  }
  if (sim.mode === 'launch') return sim.flight ? sim.flight.T : null
  return fallTime(sim.dropH0, sim.g)
}

/* ---- per-frame step ---- */

export function stepMotion(sim: MotionSim, dt: number): void {
  sim.time += dt
  if (sim.paused || !sim.started) return
  const now = sim.time

  if (sim.rolling) {
    const t = now - sim.rollStartAt
    const x = rollX(sim.rollX0, sim.rollV0, sim.rollA, t)
    const stopped = t >= sim.rollV0 / Math.max(1e-9, sim.rollA)
    const hitEnd = x >= TRACK_LEN
    sim.ballSpin += ((x - sim.ballX) / BALL_RADIUS) * 1
    sim.ballX = Math.min(x, TRACK_LEN)
    if (stopped || hitEnd) {
      sim.rolling = false
      sim.rollDone += 1
      sim.rollLog.push({
        push: sim.rollV0,
        surface: sim.surface,
        mass: sim.mass,
        world: sim.world,
        stopDist: hitEnd ? TRACK_LEN : Math.min(TRACK_LEN, sim.ballX),
      })
      // Photogates: the pair at 0 and gateDist reports the exact interval, if crossed.
      if (sim.gatesUnlocked) {
        const a = sim.crossAt['0']
        const b = sim.crossAt[String(sim.gateDist)]
        if (a != null && b != null) {
          sim.gateSnapshot = { d: sim.gateDist, t: b - a }
          sim.gateDone += 1
        }
      }
    }
  }

  if (sim.launching && sim.flight) {
    const t = now - sim.launchStartAt
    const s = flightAt(sim.flight, t)
    sim.projX = s.x
    sim.projY = s.y
    if (t >= sim.flight.T) {
      sim.launching = false
      const range = sim.flight.range
      const ringAt = sim.predictRing
      const ringGap = ringAt === null ? null : ringAt - range
      sim.lastRingGap = ringGap
      const hit = Math.abs(range - sim.targetDist) <= TARGET_TOL
      sim.launchLog.push({
        launcher: sim.launcher,
        v0: sim.flight.v0,
        angle: sim.flight.angle,
        world: sim.world,
        g: sim.g,
        mass: sim.mass,
        range,
        tof: sim.flight.T,
        ringAt,
        ringGap: ringGap === null ? null : Number(ringGap.toFixed(3)),
        target: sim.targetDist,
        hit,
      })
      sim.launchDone += 1
    }
  }

  if (sim.dropping) {
    const t = now - sim.dropStartAt
    const h = Math.max(0, sim.dropH0 - 0.5 * sim.g * t * t)
    sim.ballAY = h
    sim.ballBY = h
    if (h <= 0) {
      const tl = fallTime(sim.dropH0, sim.g)
      sim.landedAt = sim.dropStartAt + tl
      sim.dropping = false
      sim.dropDone += 1
      sim.dropLog.push({ height: sim.dropH0, world: sim.world, paired: sim.dropPaired, mass: sim.mass })
      if (sim.padUnlocked) {
        sim.padSnapshot = { h: sim.dropH0, t: tl }
        sim.padDone += 1
      }
      if (sim.sensorArmed) {
        sim.sensorArmed = false
        sim.traceSnapshot = { h: sim.dropH0, t: tl, samples: makeTrace(sim.dropH0, sim.g) }
        sim.traceDone += 1
      }
    }
  }
}

/** Motion-sensor trace: height every 20 ms, with an honest half-millimetre of sensor noise. */
export function makeTrace(h0: number, g: number): TraceSample[] {
  const tl = fallTime(h0, g)
  const out: TraceSample[] = []
  const dt = 0.02
  let seed = Math.floor(h0 * 1000 + g * 37) | 1
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff - 0.5
  }
  for (let t = 0; t <= tl + 1e-9; t += dt) {
    const h = Math.max(0, h0 - 0.5 * g * t * t)
    out.push({ t: Number(t.toFixed(3)), h: Number((h + rnd() * 0.001).toFixed(4)) })
  }
  const last = out[out.length - 1]
  if (last.t < tl - 1e-6) out.push({ t: Number(tl.toFixed(3)), h: 0 })
  return out
}

/** Speed–time points from a trace by central differences (downward speed positive). */
export function traceToVt(samples: TraceSample[]): Point[] {
  const pts: Point[] = []
  for (let i = 1; i < samples.length - 1; i++) {
    const a = samples[i - 1]
    const b = samples[i + 1]
    const dt = b.t - a.t
    if (dt <= 0) continue
    pts.push({ x: samples[i].t, y: (a.h - b.h) / dt })
  }
  return pts
}

/** g from a trace: gradient of the v–t line through the origin-ish, with a crude uncertainty. */
export function gFromTrace(samples: TraceSample[]): { g: number; unc: number } | null {
  const pts = traceToVt(samples)
  const fit = fitLine(pts)
  if (!fit) return null
  // Residual-based uncertainty on the gradient.
  const n = pts.length
  const mx = pts.reduce((s, p) => s + p.x, 0) / n
  const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0)
  const sse = pts.reduce((s, p) => s + (p.y - (fit.gradient * p.x + fit.intercept)) ** 2, 0)
  const se = n > 2 && sxx > 0 ? Math.sqrt(sse / (n - 2) / sxx) : 0
  return { g: fit.gradient, unc: Math.max(0.02, se * 2) }
}

/* ------------------------------------------------------------------ */
/* Readings — the learner's evidence                                  */
/* ------------------------------------------------------------------ */

export type ReadingKind = 'roll' | 'drop' | 'trace' | 'reaction' | 'launch'
export type Method = 'hand' | 'gate' | 'sensor'

export interface MotionReading {
  id: number
  kind: ReadingKind
  method: Method
  /** Roll: distance to the marker (m). Drop/trace: height (m). Reaction: 0. */
  x: number
  /** Measured time (s). Reaction: median reaction time (s). */
  t: number
  /** What the model says the interval really was. */
  trueT: number
  world: WorldId
  g: number
  mass: MassId
  surface: SurfaceId
  push: number
  predicted: number | null
  /** Analyst: predicted landing speed committed before a trace. */
  predictedSpeed: number | null
  trace?: TraceSample[]
  /** Launch readings (Scout measures the landing): x = range, t = time of flight. */
  angle?: number
  speed?: number
  launcher?: LauncherId
}

/** A tolerance a prediction has to land inside to count as "close". */
export function predictionClose(predicted: number, actual: number): boolean {
  return Math.abs(predicted - actual) <= Math.max(0.1, actual * 0.15)
}

/** Readings that share the same set-up (same everything but time). */
export function sameSetup(a: MotionReading, b: MotionReading): boolean {
  return (
    a.kind === b.kind &&
    a.method === b.method &&
    Math.abs(a.x - b.x) < 1e-6 &&
    a.world === b.world &&
    a.mass === b.mass &&
    a.surface === b.surface &&
    Math.abs(a.push - b.push) < 1e-6
  )
}

export function groupBySetup(readings: MotionReading[]): MotionReading[][] {
  const groups: MotionReading[][] = []
  for (const r of readings) {
    const g = groups.find((grp) => sameSetup(grp[0], r))
    if (g) g.push(r)
    else groups.push([r])
  }
  return groups
}

/* ------------------------------------------------------------------ */
/* Missions — complete on recorded evidence, never on button presses  */
/* ------------------------------------------------------------------ */

export interface MissionContext {
  readings: MotionReading[]
  rolls: RollLog[]
  drops: DropLog[]
  launches: LaunchLog[]
  /** Order predictions committed (heavy/light/same). */
  orderPredicted: boolean
  /** Learner-drawn best-fit lines judged good. */
  rollLineOk: boolean
  vtLineOk: boolean
  areaOk: boolean
  drawerOpen: boolean
}

export interface MotionMission {
  id: string
  title: string
  brief: string
  reward: string
  minBand: Band
  skill: SkillId
  /** Which bench this mission belongs to (drives the panel hint). */
  mode: LabMode
  check: (ctx: MissionContext) => boolean
}

const RANK: Record<Band, number> = { explorer: 0, scientist: 1, analyst: 2 }

const rollHand = (ctx: MissionContext) => ctx.readings.filter((r) => r.kind === 'roll' && r.method === 'hand')
const rollAny = (ctx: MissionContext) => ctx.readings.filter((r) => r.kind === 'roll')
const dropHand = (ctx: MissionContext) => ctx.readings.filter((r) => r.kind === 'drop' && r.method === 'hand')
const traces = (ctx: MissionContext) => ctx.readings.filter((r) => r.kind === 'trace')

export const MOTION_MISSIONS: MotionMission[] = [
  {
    id: 'first-time',
    title: 'Time a run',
    brief: 'Send the car down the lane. Start the watch as it crosses the start line, stop it at the 1 m line. Record it.',
    reward:
      'That number is a measurement — a distance you chose and a time you caught. Every physics fact you will ever learn started as one of these.',
    minBand: 'explorer',
    skill: 'measuring',
    mode: 'roll',
    check: (ctx) => rollAny(ctx).length > 0,
  },
  {
    id: 'same-roll-thrice',
    title: 'Do it again. And again.',
    brief: 'Same launch, same lane, same line — three times. Are the three times the same?',
    reward:
      'The car did exactly the same thing every time. You did not — that spread is your reaction time, and every scientist has one. That is why real labs repeat readings and take a mean.',
    minBand: 'explorer',
    skill: 'measuring',
    mode: 'roll',
    check: (ctx) => groupBySetup(rollHand(ctx)).some((g) => g.length >= 3),
  },
  {
    id: 'two-numbers',
    title: 'Speed needs two numbers',
    brief: 'Same push: time the car to the 0.5 m, 1.0 m and 1.5 m lines.',
    reward:
      'Speed is how much distance in how much time — you cannot say "fast" with one number. Speed = distance ÷ time, and on a distance–time graph that is the slope of the line.',
    minBand: 'explorer',
    skill: 'controlling',
    mode: 'roll',
    check: (ctx) => {
      const rs = rollAny(ctx)
      const byPush = new Map<string, Set<number>>()
      for (const r of rs) {
        const k = `${r.push.toFixed(2)}|${r.surface}|${r.mass}|${r.world}`
        const s = byPush.get(k) ?? new Set<number>()
        s.add(Math.round(r.x * 100))
        byPush.set(k, s)
      }
      return [...byPush.values()].some((s) => s.size >= 3)
    },
  },
  {
    id: 'gradient',
    title: 'Read the gradient',
    brief: 'Drag the best-fit line through your distance–time points and read the speed off its gradient.',
    reward:
      'Speed = gradient of a distance–time graph. Every graph you draw from now on will have a gradient that means something physical — this is the first.',
    minBand: 'scientist',
    skill: 'interpreting',
    mode: 'roll',
    check: (ctx) => ctx.rollLineOk,
  },
  {
    id: 'beat-the-watch',
    title: 'Beat the stopwatch',
    brief: 'Unlock the timing gates and time the same run with the beam and with your thumb.',
    reward:
      'The gates agree with the model to a thousandth of a second. Your thumb is late by your reaction time — now you have a name for the spread you saw earlier.',
    minBand: 'explorer',
    skill: 'measuring',
    mode: 'roll',
    check: (ctx) => {
      const gates = ctx.readings.filter((r) => r.kind === 'roll' && r.method === 'gate')
      const hands = rollHand(ctx)
      return gates.some((g) => hands.some((h) => Math.abs(h.x - g.x) < 1e-6 && Math.abs(h.push - g.push) < 1e-6 && h.surface === g.surface))
    },
  },
  {
    id: 'friction',
    title: 'Why does it stop?',
    brief: 'Same push on all three lane surfaces. Watch how far the car rolls each time.',
    reward:
      'Nothing pushed the car backwards, yet it stopped — a force from the surface was slowing it the whole way. Take that force away and it would roll forever. Hold that thought for Newton.',
    minBand: 'scientist',
    skill: 'controlling',
    mode: 'roll',
    check: (ctx) => {
      const byPush = new Map<string, Set<SurfaceId>>()
      for (const r of ctx.rolls) {
        const k = `${r.push.toFixed(2)}|${r.mass}|${r.world}`
        const s = byPush.get(k) ?? new Set<SurfaceId>()
        s.add(r.surface)
        byPush.set(k, s)
      }
      return [...byPush.values()].some((s) => s.size >= 3)
    },
  },
  {
    id: 'hit-target',
    title: 'Hit the ring',
    brief: 'Pick a target ring, then tune your launcher until the ball lands inside it (±0.15 m).',
    reward:
      'You just solved a physics problem backwards: you knew where it had to land and found the speed and angle that make it happen. Engineers call that design.',
    minBand: 'explorer',
    skill: 'controlling',
    mode: 'launch',
    check: (ctx) => ctx.launches.some((l) => l.hit),
  },
  {
    id: 'place-it',
    title: 'Call the landing',
    brief: 'Before you fire, drag the glowing landing ring to where you think the ball will come down.',
    reward:
      'A placed ring is a prediction you can *see* being tested. The gap bar is your error — watch it shrink as your feel for the parabola grows.',
    minBand: 'explorer',
    skill: 'predicting',
    mode: 'launch',
    check: (ctx) => ctx.launches.some((l) => l.ringAt !== null && l.ringGap !== null && Math.abs(l.ringGap) <= RING_TOL),
  },
  {
    id: 'best-angle',
    title: 'Find the best angle',
    brief: 'Same launch speed, at least three different angles. Which angle throws furthest? Check the range–angle graph.',
    reward:
      'Low angles run out of air time; high angles waste speed going up. The crown sits near 45° — and on the flat, the range formula says exactly that.',
    minBand: 'scientist',
    skill: 'interpreting',
    mode: 'launch',
    check: (ctx) => {
      const bySpeed = new Map<string, Set<number>>()
      for (const l of ctx.launches) {
        const k = `${l.v0.toFixed(1)}|${l.world}`
        const s = bySpeed.get(k) ?? new Set<number>()
        s.add(Math.round(l.angle))
        bySpeed.set(k, s)
      }
      return [...bySpeed.values()].some((s) => s.size >= 3)
    },
  },
  {
    id: 'same-arc',
    title: 'Same arc, different toy',
    brief: 'Get two different launchers to the same launch speed and angle. Where do the balls land?',
    reward:
      'The slingshot and the catapult vanish from the physics the instant the ball leaves them. Only speed, angle and gravity remain — one parabola, whatever threw it.',
    minBand: 'scientist',
    skill: 'explaining',
    mode: 'launch',
    check: (ctx) =>
      ctx.launches.some((a) =>
        ctx.launches.some(
          (b) =>
            a !== b &&
            a.launcher !== b.launcher &&
            a.world === b.world &&
            Math.abs(a.v0 - b.v0) <= 0.15 &&
            Math.abs(a.angle - b.angle) <= 2 &&
            Math.abs(a.range - b.range) <= 0.25,
        ),
      ),
  },
  {
    id: 'trebuchet-moon',
    title: 'A trebuchet on the Moon',
    brief: 'Fire the trebuchet on Earth, then turn the dial to Moon and fire it again. Watch the launch speed readout.',
    reward:
      'Two effects at once: the counterweight falls more weakly, so the throw is slower — *and* the ball falls more slowly once it flies. The slingshot only feels the second one. That difference is what "g is a variable" really means.',
    minBand: 'analyst',
    skill: 'explaining',
    mode: 'launch',
    check: (ctx) => {
      const worlds = new Set(ctx.launches.filter((l) => l.launcher === 'trebuchet').map((l) => l.world))
      return worlds.has('earth') && worlds.has('moon')
    },
  },
  {
    id: 'heavy-light',
    title: 'Heavy or light?',
    brief: 'Predict which ball lands first, then have Scout drop the steel and wooden balls together from 1 m.',
    reward:
      'They land together. Galileo argued this four hundred years ago and it is still a shock: mass does not change how fast something falls (with no air to get in the way).',
    minBand: 'explorer',
    skill: 'predicting',
    mode: 'drop',
    check: (ctx) => ctx.orderPredicted && ctx.drops.some((d) => d.paired),
  },
  {
    id: 'time-a-fall',
    title: 'Time a fall',
    brief: 'Hand-time a drop from the same height five times. Then look at the spread.',
    reward:
      'A 1 m drop on Earth takes under half a second — about twice your reaction time. Your clock is simply not good enough for this. Yet.',
    minBand: 'explorer',
    skill: 'measuring',
    mode: 'drop',
    check: (ctx) => groupBySetup(dropHand(ctx)).some((g) => g.length >= 5),
  },
  {
    id: 'moon-drop',
    title: 'Drop it on the Moon',
    brief: 'Turn the gravity dial to Moon and time the same drop.',
    reward:
      'Over a second to fall — suddenly you can time it. Gravity is a variable, not a fact, and slower things are easier to measure. Remember both.',
    minBand: 'explorer',
    skill: 'controlling',
    mode: 'drop',
    check: (ctx) => ctx.readings.some((r) => (r.kind === 'drop' || r.kind === 'trace') && r.world === 'moon'),
  },
  {
    id: 'sensor',
    title: 'Let the sensor watch',
    brief: 'Arm the motion sensor and record a drop — it samples the height every 20 ms.',
    reward:
      'A curve, not a line: the ball covers more height in each successive 20 ms. It is speeding up. Now turn that curve into speed against time.',
    minBand: 'scientist',
    skill: 'measuring',
    mode: 'drop',
    check: (ctx) => traces(ctx).length > 0,
  },
  {
    id: 'vt-line',
    title: 'Straight line, at last',
    brief: 'Switch the trace to speed–time and drag a best-fit line through it. What is its gradient?',
    reward:
      'Speed against time is a straight line through the origin: the ball gains the same speed every second. That gradient is the acceleration — g — and v = u + at is just the equation of this line.',
    minBand: 'scientist',
    skill: 'interpreting',
    mode: 'drop',
    check: (ctx) => ctx.vtLineOk,
  },
  {
    id: 'area',
    title: 'Area under the line',
    brief: 'Shade the area under your speed–time line up to the landing. Compare it with the drop height.',
    reward:
      'The area under a speed–time graph is the distance travelled — here, the height you dropped from. Write the triangle’s area out and you get s = ut + ½at².',
    minBand: 'scientist',
    skill: 'interpreting',
    mode: 'drop',
    check: (ctx) => ctx.areaOk,
  },
  {
    id: 'three-worlds',
    title: 'Same law, three worlds',
    brief: 'Record a sensor trace on Earth, the Moon and Mars, and read g from each gradient.',
    reward:
      'Three different gradients, one shape of law. The model v = u + at survives a change of planet — that is what makes it a law rather than an Earth fact.',
    minBand: 'analyst',
    skill: 'interpreting',
    mode: 'drop',
    check: (ctx) => {
      const worlds = new Set(traces(ctx).map((r) => r.world))
      return worlds.has('earth') && worlds.has('moon') && worlds.has('mars')
    },
  },
  {
    id: 'no-time',
    title: 'Lose the clock',
    brief: 'Predict the landing speed from the height alone (v² = u² + 2as), then check it against a trace.',
    reward:
      'You predicted a speed without ever measuring a time. v² = u² + 2as is the equation for when the clock is missing — and the trace agreed with you.',
    minBand: 'analyst',
    skill: 'predicting',
    mode: 'drop',
    check: (ctx) =>
      traces(ctx).some(
        (r) =>
          r.predictedSpeed !== null &&
          Math.abs(r.predictedSpeed - landingSpeed(r.x, r.g)) <= landingSpeed(r.x, r.g) * 0.05,
      ),
  },
  {
    id: 'segue',
    title: 'So how do you time things properly?',
    brief: 'Finish "Time a fall" and "Drop it on the Moon". Something in the kit chest wants to answer.',
    reward:
      'Galileo hit exactly this wall. The story goes he watched a lamp swing in a cathedral and noticed each swing seemed to take the same time, wide or narrow. Could a swinging thing be a clock? That is the next cabinet.',
    minBand: 'explorer',
    skill: 'explaining',
    mode: 'drop',
    check: (ctx) => ctx.drawerOpen,
  },
]

export function motionMissionsForBand(band: Band): MotionMission[] {
  return MOTION_MISSIONS.filter((m) => RANK[m.minBand] <= RANK[band])
}

/** Ids of the two missions whose completion opens the drawer. */
export const SEGUE_REQUIRES = ['time-a-fall', 'moon-drop']

/* ------------------------------------------------------------------ */
/* Copy — band-skinned                                                */
/* ------------------------------------------------------------------ */

export const SEGUE_COPY: Record<BandCaps['vocab'], string[]> = {
  simple: [
    'Things fall too fast for our stopwatch. Four hundred years ago Galileo had the same problem.',
    'The story goes he watched a lamp swinging in a cathedral and noticed each swing seemed to take the same time, wide or narrow.',
    'Could a swinging thing be a clock? Here is some string and a weight — find out in the next cabinet.',
  ],
  formal: [
    'Fast events cannot be timed by hand: your reaction time is a large fraction of a fall. Galileo faced exactly this.',
    'Watching a swinging lamp, he noticed the period seemed independent of the amplitude. Could a pendulum be a clock?',
    'Test it properly: what could change the swing time — how far you pull it back, how heavy the bob is, how long the string is? Change one at a time. That is the Pendulum Practical.',
  ],
  technical: [
    'Your calibrated reaction time is of the order of a 1 m fall on Earth, so hand timing cannot resolve it. Galileo hit this wall in the 1600s.',
    'He timed his ramps with a water clock; the pendulum clock was Huygens’ in 1656. A pendulum’s period is only amplitude-independent for small swings — you will find where that breaks.',
    'Next cabinet: the Pendulum Practical — the most-examined mechanics practical in IGCSE Paper 5/6, on this same bench.',
  ],
}

export interface EquationBeat {
  id: 'speed' | 'gradient' | 'vt' | 'area' | 'v2'
  title: string
  equation: string
  body: Record<BandCaps['vocab'], string>
}

export const EQUATION_BEATS: Record<EquationBeat['id'], EquationBeat> = {
  speed: {
    id: 'speed',
    title: 'Speed needs two numbers',
    equation: 'speed = distance ÷ time',
    body: {
      simple: 'You measured how far the ball went and how long it took. Divide one by the other and you get its speed — metres every second.',
      formal: 'Average speed = distance ÷ time, in m/s. Your three markers gave three distances and three times: plot them and the points fall on a line.',
      technical: 'v̄ = Δs / Δt. For steady motion the d–t points are collinear; the ball is in fact decelerating slightly (rolling resistance, a = μg), which is why the far points bend down.',
    },
  },
  gradient: {
    id: 'gradient',
    title: 'Speed is the gradient',
    equation: 'speed = gradient of the distance–time graph',
    body: {
      simple: 'The steeper the line, the faster the ball.',
      formal: 'Gradient = rise ÷ run = distance ÷ time = speed. A steeper distance–time line means a higher speed; a flat line means it has stopped.',
      technical: 'v = ds/dt: the gradient of s(t) at any instant is the velocity there. Your best-fit gradient is the mean speed over the range you timed.',
    },
  },
  vt: {
    id: 'vt',
    title: 'The line that means g',
    equation: 'v = u + at',
    body: {
      simple: 'Every second, the falling ball gains the same amount of speed. That is what the straight line says.',
      formal: 'Speed against time is a straight line: gradient = acceleration. Starting from rest (u = 0), v = at, and the gradient you measured is g.',
      technical: 'v = u + at is the equation of your v–t line with intercept u and gradient a = g. On Earth the gradient is 9.8 m/s²; the same law with a different constant on the Moon.',
    },
  },
  area: {
    id: 'area',
    title: 'Area is distance',
    equation: 's = ut + ½at²',
    body: {
      simple: 'The space under the line is how far the ball fell.',
      formal: 'Area under a speed–time graph = distance. Your triangle: ½ × base (t) × height (v = at) = ½at², which is the height you dropped from.',
      technical: 's = ut + ½at² is the area of a trapezium under v = u + at. With u = 0 the area is the triangle ½·t·at. Eliminating t between the two equations gives v² = u² + 2as.',
    },
  },
  v2: {
    id: 'v2',
    title: 'Losing the clock',
    equation: 'v² = u² + 2as',
    body: {
      simple: 'You can work out how fast it lands without timing it at all.',
      formal: 'Combine v = at and s = ½at² to remove t: v² = 2as. From 1 m on Earth that gives about 4.4 m/s.',
      technical: 'v² = u² + 2as. From rest, v = √(2gh) — check it against the last v–t point of your trace.',
    },
  },
}

/* ------------------------------------------------------------------ */
/* Guided demo — drives the real handlers                             */
/* ------------------------------------------------------------------ */

export interface MotionDemoApi {
  setMode: (m: LabMode) => void
  setWorld: (w: WorldId) => void
  setPush: (v: number) => void
  setTarget: (d: number) => void
  setDropHeight: (h: number) => void
  setLauncher: (l: LauncherId) => void
  setAngle: (deg: number) => void
  setPower: (v: number) => void
  fire: () => void
  push: () => void
  release: (paired: boolean) => void
  tap: () => void
  resetView: () => void
  setAutoOrbit: (on: boolean) => void
  view: (v: MotionViewId) => void
  /** Sim time the ball crosses the start line / target marker (null if unknown). */
  crossing: (which: 'start' | 'target' | 'land') => number | null
  now: () => number
}

export interface MotionDemoStep {
  text: string
  ms: number
  enter?: (api: MotionDemoApi) => void
  /** Called every tick with the elapsed ms; return true to advance early. */
  tick?: (api: MotionDemoApi, elapsedMs: number, state: Record<string, unknown>) => boolean | void
}

/** Human-ish demo taps: reaction of ~0.22 s after the event, like a real thumb. */
const DEMO_REACTION = 0.22

function timedRoll(api: MotionDemoApi, ms: number, state: Record<string, unknown>) {
  const st = state
  const s = api.crossing('start')
  const t = api.crossing('target')
  const now = api.now()
  if (!st.started && s !== null && now >= s + DEMO_REACTION) {
    st.started = true
    api.tap()
  }
  if (st.started && !st.stopped && t !== null && now >= t + DEMO_REACTION) {
    st.stopped = true
    api.tap()
  }
  return st.stopped === true && ms > 800
}

export const MOTION_DEMO: MotionDemoStep[] = [
  {
    text: 'I am Scout. Watch me run the yard once — car, catapult, drop — then it is all yours.',
    ms: 3400,
    enter: (api) => {
      api.resetView()
      api.setAutoOrbit(true)
      api.setMode('roll')
      api.setPush(1.0)
      api.setTarget(1.0)
      api.setWorld('earth')
    },
  },
  {
    text: 'The lane. I want the car’s speed — so I need a distance and a time. The glowing tags follow everything that moves.',
    ms: 4200,
    enter: (api) => {
      api.setAutoOrbit(false)
      api.view('bench')
    },
  },
  {
    text: 'Go! I start the watch as the car crosses the start line, and stop it at the 1 m line.',
    ms: 9000,
    enter: (api) => api.push(),
    tick: (api, ms, st) => timedRoll(api, ms, st),
  },
  {
    text: 'One reading: 1.0 m and the time I caught. Same push again — and watch the faded ghost: that is the last run, racing me.',
    ms: 8500,
    enter: (api) => {
      window.setTimeout(() => api.push(), 1400)
    },
    tick: (api, ms, st) => (ms > 1600 ? timedRoll(api, ms, st) : undefined),
  },
  {
    text: 'Not quite the same time. The car did the same thing — I did not. That difference is my reaction time, and yours gets measured too.',
    ms: 4600,
  },
  {
    text: 'The catapult. Speed and angle in — one clean arc out, wearing its own numbers.',
    ms: 8200,
    enter: (api) => {
      api.setMode('launch')
      api.view('instrument')
      api.setLauncher('catapult')
      api.setAngle(45)
      api.setPower(2.5)
      window.setTimeout(() => api.fire(), 2400)
    },
  },
  {
    text: 'Now a drop. Which lands first, the heavy ball or the light one? I say together.',
    ms: 6000,
    enter: (api) => {
      api.setMode('drop')
      api.view('drop')
      api.setDropHeight(1.0)
      window.setTimeout(() => api.release(true), 2600)
    },
  },
  {
    text: 'Together. And on Earth that fall took under half a second — try timing that by hand.',
    ms: 6000,
    enter: (api) => {
      window.setTimeout(() => api.release(false), 900)
    },
    tick: (api, ms, st) => {
      const s = api.crossing('start')
      const l = api.crossing('land')
      const now = api.now()
      if (!st.started && s !== null && now >= s + DEMO_REACTION) {
        st.started = true
        api.tap()
      }
      if (st.started && !st.stopped && l !== null && now >= l + DEMO_REACTION) {
        st.stopped = true
        api.tap()
      }
      return st.stopped === true && ms > 1200
    },
  },
  {
    text: 'Now the gravity dial — and not just the fall changes. The whole world retunes. Same drop, on the Moon.',
    ms: 7000,
    enter: (api) => {
      api.setWorld('moon')
      window.setTimeout(() => api.release(false), 2400)
    },
  },
  {
    text: 'Over a second to fall, under a black noon sky. Gravity is a dial. Your turn — the missions will tell you what to hunt for.',
    ms: 5000,
    enter: (api) => {
      api.setWorld('earth')
      api.setMode('roll')
      api.resetView()
    },
  },
]
