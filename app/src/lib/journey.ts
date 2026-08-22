import * as THREE from 'three'
import type { SimState } from './sim'
import { checkpointBlip, deliveryPing, lapChime, loadClick } from './audio'
import { recordLapTrial } from './bloodlab'

/* Best laps survive the session, guarded exactly like lib/events.ts. */
const BEST_KEY = 'ploobia.blood.bests.v1'

function loadBests(): (number | null)[] {
  try {
    const raw = window.localStorage?.getItem(BEST_KEY)
    if (!raw) return [null, null, null]
    const v = JSON.parse(raw)
    return Array.isArray(v) && v.length === 3 ? v : [null, null, null]
  } catch {
    return [null, null, null]
  }
}

function saveBests(b: (number | null)[]): void {
  try {
    window.localStorage?.setItem(BEST_KEY, JSON.stringify(b))
  } catch {
    /* private mode: bests stay in memory for this session */
  }
}

/**
 * The oxygen journey — a full circuit of the circulatory system expressed as
 * distance along an endless vessel. The ride keeps its infinite-tunnel
 * illusion; what changes is WHERE on the loop you are. Stage boundaries are
 * fixed in world space, so the capillary squeeze is visible approaching long
 * before you reach it.
 *
 * Order of stops (one lap) — a DOUBLE circulation, so the heart is crossed
 * twice, which is the whole point of having two pumps:
 *   lungs → left heart → artery → capillary → tissue → vein → right heart →
 *   (lungs again)
 *
 * Stage indices are load-bearing elsewhere: 0 lungs, 3 capillary, 4 tissue,
 * 5 vein — the gas-exchange zones and the featured cell hang off them.
 */

export type StageId =
  | 'lungs'
  | 'leftHeart'
  | 'artery'
  | 'capillary'
  | 'tissue'
  | 'vein'
  | 'rightHeart'

export interface StageDef {
  id: StageId
  /** Length of the stage in world units of forward travel. */
  length: number
  title: string
  /** One-line toast shown on entry. */
  toast: string
  /** Vessel radius multiplier (1 = the classic artery bore). */
  radiusK: number
  /** Inner wall colour. */
  wall: string
  /** 0 = opaque wall, 1 = fully see-through (shows the world outside). */
  window: number
  /** Flow speed multiplier for this stretch. */
  flowK: number
  /** Heartbeat displacement gain on the wall. */
  pulseK: number
  fog: string
  fogDensity: number
  /** Key light colour riding with the camera. */
  light: string
}

export const STAGES: StageDef[] = [
  {
    id: 'lungs', length: 47,
    title: 'The lungs',
    toast: 'Oxygen loading station — air is on the other side of this thin wall',
    radiusK: 0.82, wall: '#B24A55', window: 0.55, flowK: 0.9, pulseK: 0.5,
    fog: '#5A1E26', fogDensity: 0.034, light: '#FFB9A0',
  },
  {
    id: 'leftHeart', length: 29,
    title: 'The left heart',
    toast: 'The big pump. Its wall is thick because it must push you round the whole body',
    radiusK: 1.5, wall: '#8E2028', window: 0, flowK: 1.6, pulseK: 2.2,
    fog: '#4A0E12', fogDensity: 0.045, light: '#FF9A76',
  },
  {
    id: 'artery', length: 52,
    title: 'An artery',
    toast: 'The motorway — bright red blood racing out to the body',
    radiusK: 1.0, wall: '#8E2028', window: 0, flowK: 1.3, pulseK: 1.0,
    fog: '#4A0E12', fogDensity: 0.042, light: '#FF9A76',
  },
  {
    id: 'capillary', length: 40,
    title: 'A capillary',
    toast: 'So narrow the red cells squeeze through in single file!',
    radiusK: 0.30, wall: '#A03A42', window: 0.35, flowK: 0.7, pulseK: 0.15,
    fog: '#54161C', fogDensity: 0.05, light: '#FFAD8E',
  },
  {
    id: 'tissue', length: 55,
    title: 'Body tissue',
    toast: 'Delivery time — living cells are waiting for their oxygen',
    radiusK: 0.34, wall: '#9C4A4A', window: 0.6, flowK: 0.65, pulseK: 0.1,
    fog: '#4E1A1E', fogDensity: 0.046, light: '#FFC2A2',
  },
  {
    id: 'vein', length: 47,
    title: 'A vein',
    toast: 'The quiet road home — darker blood drifting back to the heart',
    radiusK: 1.15, wall: '#5E141C', window: 0, flowK: 0.85, pulseK: 0.25,
    fog: '#380A0E', fogDensity: 0.05, light: '#E58A70',
  },
  {
    id: 'rightHeart', length: 29,
    title: 'The right heart',
    toast: 'The second pump — a thinner wall, because the lungs are only next door',
    radiusK: 1.4, wall: '#54121A', window: 0, flowK: 1.45, pulseK: 1.5,
    fog: '#340A10', fogDensity: 0.048, light: '#D98A78',
  },
]

/**
 * Stage lengths and paces are tuned so that ONE LAP AT REST TAKES ABOUT 60
 * SECONDS — which is how long a real red blood cell takes to go round your
 * whole body. That is not decoration: it makes the lap timer a quantity the
 * learner can compare with the real world, and it makes a lap short enough to
 * use as a measurement trial. Sprinting drops it to roughly 20 s, close to
 * the real figure for hard exercise.
 *
 * The distribution WITHIN the lap is deliberately not to scale: a real
 * capillary transit is about a second of that minute, but it is where all the
 * teaching is, so it gets a generous share of the ride.
 */

/** Cumulative end distance of each stage within one lap. */
export const STAGE_ENDS: number[] = (() => {
  const ends: number[] = []
  let acc = 0
  for (const s of STAGES) {
    acc += s.length
    ends.push(acc)
  }
  return ends
})()

export const LAP_LENGTH = STAGE_ENDS[STAGE_ENDS.length - 1]

/** Width (in world units) of the blend window across a stage boundary. */
export const BLEND = 10

/** Seconds after crossing the line in which choosing a demand still "counts". */
export const LAP_START_GRACE = 5

// ---------------------------------------------------------------------------
// Body demand — the one dial the learner turns
// ---------------------------------------------------------------------------

/**
 * What the body is doing decides everything else: heart rate, how fast the
 * blood moves, how hard you breathe, and — the part most people never meet —
 * how much of its oxygen each red cell actually hands over.
 *
 * At rest a red cell gives up only about a QUARTER of its oxygen; blood in
 * your veins is still ~75% loaded. Working muscle is warm, acidic and full of
 * CO₂, which makes haemoglobin release oxygen far more readily (the Bohr
 * shift), so extraction climbs toward three quarters when you sprint.
 */
export interface DemandLevel {
  id: 'rest' | 'jog' | 'sprint'
  label: string
  /** Heart rate, beats per minute — drives the real heartbeat waveform. */
  bpm: number
  /** Global flow multiplier, standing in for cardiac output. */
  flow: number
  /** O₂ molecules handed over per red cell per lap, out of 4. */
  extraction: number
  /** Breaths per minute — drives how fast the alveoli inflate. */
  breathsPerMin: number
  /** One line for the control panel. */
  blurb: string
  /** Extra line added to the tissue checkpoint at this demand. */
  tissueLine: string
}

export const DEMANDS: DemandLevel[] = [
  {
    id: 'rest', label: 'Resting', bpm: 70, flow: 0.9, extraction: 1, breathsPerMin: 14,
    blurb: 'Sitting still. Cells sip oxygen — each red cell hands over just 1 of its 4.',
    tissueLine: 'Resting cells take only 1 of the 4 — your veins still carry plenty of oxygen.',
  },
  {
    id: 'jog', label: 'Jogging', bpm: 120, flow: 1.6, extraction: 2, breathsPerMin: 26,
    blurb: 'Muscles working. The heart beats faster AND each cell gives up more oxygen.',
    tissueLine: 'Working muscle takes 2 of the 4 — twice the delivery on every trip.',
  },
  {
    id: 'sprint', label: 'Sprinting', bpm: 180, flow: 2.6, extraction: 3, breathsPerMin: 45,
    blurb: 'Flat out! Hot, acidic muscle makes haemoglobin let go of oxygen far more easily.',
    tissueLine: 'Hot, acidic muscle prises 3 of the 4 loose — that is the Bohr shift at work.',
  },
]

/** Beats per second for the heartbeat waveform, from the current demand. */
export function beatsPerSecond(sim: SimState): number {
  return sim.bpm / 60
}

/** Distance travelled for a world-space z coordinate. */
export function distOfZ(z: number): number {
  return -z
}

/**
 * Did travelling from `a` to `b` pass the lap-local boundary at `d`? Works
 * across lap rollovers, and does not care how big the step was — so lap
 * counting and delivery counting stay correct even if a frame stalls, a tab
 * sleeps, or a test warps the camera across half the circuit.
 */
export function crossedBoundary(a: number, b: number, d: number): boolean {
  if (b <= a) return false
  if (b - a >= LAP_LENGTH) return true
  const la = lapDist(a)
  const lb = lapDist(b)
  return la < lb ? la < d && d <= lb : d > la || d <= lb
}

/** Which lap a travelled distance falls in. */
export function lapOf(d: number): number {
  return Math.floor(d / LAP_LENGTH)
}

/** Lap-local distance in [0, LAP_LENGTH). */
export function lapDist(d: number): number {
  const m = d % LAP_LENGTH
  return m < 0 ? m + LAP_LENGTH : m
}

export function stageIndexAt(d: number): number {
  const ld = lapDist(d)
  for (let i = 0; i < STAGE_ENDS.length; i++) {
    if (ld < STAGE_ENDS[i]) return i
  }
  return STAGES.length - 1
}

export function stageAt(d: number): StageDef {
  return STAGES[stageIndexAt(d)]
}

/** 0..1 progress through the current stage. */
export function stageT(d: number): number {
  const i = stageIndexAt(d)
  const start = i === 0 ? 0 : STAGE_ENDS[i - 1]
  return (lapDist(d) - start) / STAGES[i].length
}

function smooth(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

/**
 * Blend a per-stage numeric property across boundaries. Each boundary blends
 * over BLEND world units centred on the crossing, so the capillary mouth
 * narrows like a funnel instead of a step.
 */
export function paramAt(d: number, pick: (s: StageDef) => number): number {
  const i = stageIndexAt(d)
  const ld = lapDist(d)
  const start = i === 0 ? 0 : STAGE_ENDS[i - 1]
  const end = STAGE_ENDS[i]
  const cur = pick(STAGES[i])
  const half = BLEND / 2
  if (ld - start < half) {
    const prev = pick(STAGES[(i + STAGES.length - 1) % STAGES.length])
    return prev + (cur - prev) * smooth(0.5 + (ld - start) / BLEND)
  }
  if (end - ld < half) {
    const next = pick(STAGES[(i + 1) % STAGES.length])
    return cur + (next - cur) * smooth(0.5 - (end - ld) / BLEND)
  }
  return cur
}

const colorA = new THREE.Color()
const colorB = new THREE.Color()

/** Blend a per-stage colour property (writes into `out`). */
export function colorAt(d: number, pick: (s: StageDef) => string, out: THREE.Color): THREE.Color {
  const i = stageIndexAt(d)
  const ld = lapDist(d)
  const start = i === 0 ? 0 : STAGE_ENDS[i - 1]
  const end = STAGE_ENDS[i]
  const half = BLEND / 2
  out.set(pick(STAGES[i]))
  if (ld - start < half) {
    colorA.set(pick(STAGES[(i + STAGES.length - 1) % STAGES.length]))
    out.copy(colorA.lerp(out, smooth(0.5 + (ld - start) / BLEND)))
  } else if (end - ld < half) {
    colorB.set(pick(STAGES[(i + 1) % STAGES.length]))
    out.lerp(colorB, smooth(0.5 - (end - ld) / BLEND))
  }
  return out
}

/** Local vessel radius (world units) at a travelled distance. */
export function radiusAtDist(d: number, vesselRadius: number): number {
  return paramAt(d, (s) => s.radiusK) * vesselRadius
}

/**
 * How oxygen-loaded the blood is at a point on the loop, 0..1.
 * Loads through the lungs, holds high through heart/artery/capillary,
 * unloads through the tissue, holds low through the vein.
 */
export function oxygenationAt(d: number): number {
  const j = getJourney()
  const dem = DEMANDS[j.demand]
  // Venous saturation is what is LEFT after extraction: 3/4 at rest, 1/4 flat out.
  const venous = 1 - dem.extraction / 4
  const i = stageIndexAt(d)
  const t = stageT(d)
  const s = STAGES[i].id
  if (s === 'lungs') return venous + (1 - venous) * smooth((t - 0.12) / 0.65)
  if (s === 'leftHeart' || s === 'artery' || s === 'capillary') return 1
  if (s === 'tissue') return 1 - (1 - venous) * smooth((t - 0.25) / 0.55)
  return venous // vein and right heart: the ride home, still part-loaded
}

/**
 * Hero cell cargo derived from position and demand (deterministic per lap).
 * The hero always tops back up to 4 in the lungs; how many it DROPS at the
 * tissue is what the demand dial decides.
 */
export function heroCargoAt(d: number): { o2: number; co2: number } {
  const dem = DEMANDS[getJourney().demand]
  const kept = 4 - dem.extraction // sites still loaded on the way home
  const i = stageIndexAt(d)
  const t = stageT(d)
  const s = STAGES[i].id
  if (s === 'lungs') {
    // CO₂ is blown off first, then the empty sites reload one at a time.
    const co2 = Math.max(0, dem.extraction - Math.floor(t / 0.08))
    const filling = Math.max(0, Math.min(dem.extraction, Math.floor((t - 0.24) / 0.14) + 1))
    return { o2: kept + filling, co2 }
  }
  if (s === 'leftHeart' || s === 'artery' || s === 'capillary') return { o2: 4, co2: 0 }
  if (s === 'tissue') {
    const handed = Math.max(0, Math.min(dem.extraction, Math.floor((t - 0.3) / 0.1) + 1))
    const picked = Math.max(0, Math.min(dem.extraction, Math.floor((t - 0.36) / 0.1) + 1))
    return { o2: 4 - handed, co2: picked }
  }
  return { o2: kept, co2: dem.extraction } // vein / right heart: heading home
}

// ---------------------------------------------------------------------------
// Meet-the-cell story beat
// ---------------------------------------------------------------------------

export interface StoryLine {
  /** Seconds the line stays up (scaled by nothing — wall clock). */
  hold: number
  text: string
}

export const CELL_STORY: StoryLine[] = [
  { hold: 5.5, text: 'Wait — slow down. Something on the other side of the wall needs us.' },
  { hold: 7, text: 'That is a body cell — a tiny living unit. Your whole body is built from trillions of these.' },
  { hold: 7, text: 'Its skin is the cell membrane — it lets oxygen in. The dark core is the nucleus, the cell’s control centre.' },
  { hold: 7.5, text: 'Watch: our red cell hands over {n} of its 4 oxygens. They slip through the capillary wall, into the cell…' },
  { hold: 7.5, text: '…to the mitochondria — the cell’s power stations. They use oxygen to release energy from food. See them glow!' },
  { hold: 7, text: 'In return the cell hands us its waste gas, CO₂. We’ll carry it back to the lungs and breathe it out.' },
  { hold: 6.5, text: 'Notice we did not empty out. Resting cells take only a share — the rest is reserve, ready for when you suddenly run.' },
  { hold: 5.5, text: 'Delivery complete. Every cell in your body gets this visit — thousands of times a day. Onward!' },
]

/** Fill the story's {n} token with how many O₂ this demand actually hands over. */
export function storyLine(text: string): string {
  return text.replace('{n}', String(DEMANDS[getJourney().demand].extraction))
}

/** Wall-clock seconds — narration must not slow down with the frame rate. */
export function nowS(): number {
  return (typeof performance !== 'undefined' ? performance.now() : 0) / 1000
}

export interface JourneyState {
  /** Distance travelled by the camera (world units). */
  dist: number
  stageIndex: number
  lap: number
  /** Hero cell cargo. */
  o2: number
  co2: number
  /** Stage-entry toast bookkeeping (wall-clock seconds via nowS()). */
  toastStage: number
  toastAt: number
  /** Meet-the-cell beat. */
  beatActive: boolean
  beatLine: number
  beatLineAt: number
  beatDone: boolean
  /** World position of the featured body cell (set once per app run). */
  cellFocus: THREE.Vector3
  /** 0..1 how far the featured O₂ handover has progressed (drives molecules). */
  handoff: number
  // --- race layer -------------------------------------------------------
  /** Riding time in wall-clock seconds; frozen while paused or in the story. */
  rideClock: number
  /** rideClock value when the current lap began. */
  lapStartClock: number
  /** rideClock value at the last checkpoint crossing. */
  lastGateClock: number
  /** Split time (s) of the most recent checkpoint sector, or null. */
  lastSplit: number | null
  /** Stage index just ENTERED at the last crossing (banner + gate flash). */
  crossedIndex: number
  /** nowS() of the last crossing (drives the gate flash + banner life). */
  crossedAt: number
  /** true when the last crossing completed a lap (lap banner instead). */
  crossedLap: boolean
  lastLap: number | null
  bestLap: number | null
  /** Best clean lap per demand level — a lap where the dial never moved. */
  bestByDemand: (number | null)[]
  /** Demand this lap started at, or -1 once the dial moves mid-lap. */
  lapDemand: number
  /**
   * False when the current lap was not ridden from the start line — joined
   * part-way, or jumped. Such a lap still shows a time, but is never recorded
   * as a measurement, because it would be a fabricated one.
   */
  lapMeasurable: boolean
  /** internal: last nowS() seen by tickJourney. */
  lastTickAt: number
  /** internal: distance at the previous tick, for crossing detection. */
  prevDist: number
  // --- demand + delivery -------------------------------------------------
  /** Index into DEMANDS. */
  demand: number
  /** Total O₂ molecules handed to body cells this session. */
  o2Delivered: number
  /** nowS() of the last delivery (drives the counter pop + banner). */
  deliveredAt: number
  /** How many were handed over on the most recent tissue pass. */
  lastDelivery: number
}

let journey: JourneyState | null = null

export function getJourney(): JourneyState {
  if (!journey) {
    journey = {
      dist: 0,
      stageIndex: 0,
      lap: 0,
      o2: 0,
      co2: 4,
      toastStage: -1,
      toastAt: -999,
      beatActive: false,
      beatLine: 0,
      beatLineAt: 0,
      beatDone: false,
      cellFocus: new THREE.Vector3(
        Math.cos(CELL_FOCUS_ANGLE) * CELL_FOCUS_RADIUS,
        Math.sin(CELL_FOCUS_ANGLE) * CELL_FOCUS_RADIUS,
        -cellFocusDist(),
      ),
      handoff: 0,
      rideClock: 0,
      lapStartClock: 0,
      lastGateClock: 0,
      lastSplit: null,
      crossedIndex: -1,
      crossedAt: -999,
      crossedLap: false,
      lastLap: null,
      bestLap: null,
      bestByDemand: typeof window === 'undefined' ? [null, null, null] : loadBests(),
      lapDemand: 0,
      lapMeasurable: true,
      lastTickAt: -1,
      prevDist: 0,
      demand: 0,
      o2Delivered: 0,
      deliveredAt: -999,
      lastDelivery: 0,
    }
    // Test handles: verification scripts steer the ride through window.
    if (typeof window !== 'undefined') {
      const w = window as unknown as Record<string, unknown>
      w.__journey = journey
      w.__stages = STAGES.map((s) => s.id)
      w.__ghost = ghostState
    }
  }
  return journey
}

/** Where (distance on lap 0) the featured body cell sits, and its placement. */
export const CELL_FOCUS_LAP_T = 0.34 // fraction into the tissue stage
export const CELL_FOCUS_ANGLE = -0.55 // radians around the vessel axis
/** Just outside the translucent capillary wall (tissue bore ≈ 3 units). */
export const CELL_FOCUS_RADIUS = 5.4

export function cellFocusDist(): number {
  const tissueStart = STAGE_ENDS[3] // end of capillary = start of tissue
  return tissueStart + STAGES[4].length * CELL_FOCUS_LAP_T
}

/**
 * Turn the body-demand dial. Everything downstream — heart rate, flow, how
 * much oxygen comes off at the tissue, how hard the lungs work — follows from
 * this one number, which is exactly the point.
 *
 * Moving it mid-lap spoils that lap as a fair measurement, so the lap is
 * marked "mixed" and will not set a per-demand best.
 */
export function setDemand(sim: SimState, index: number): void {
  const j = getJourney()
  const i = Math.max(0, Math.min(DEMANDS.length - 1, Math.round(index)))
  if (i === j.demand) return
  // A change in the first few seconds of a lap is treated as setting up for
  // that lap, not as spoiling it — otherwise choosing your condition just
  // after the finish line would throw the lap away for no good reason. Time,
  // not distance, because the same grace period should feel the same at every
  // speed.
  const atLapStart = j.rideClock - j.lapStartClock < LAP_START_GRACE
  if (atLapStart) j.lapDemand = i
  else if (j.lapDemand !== -1 && j.lapDemand !== i) j.lapDemand = -1
  j.demand = i
  applyDemand(sim)
}

/** Push the current demand's numbers into the sim the render loop reads. */
export function applyDemand(sim: SimState): void {
  const dem = DEMANDS[getJourney().demand]
  sim.speed = dem.flow
  sim.bpm = dem.bpm
  sim.breathsPerMin = dem.breathsPerMin
}

/** Re-arm the meet-the-cell stop so it plays again next time through tissue. */
export function replayCellStory(): void {
  const j = getJourney()
  j.beatDone = false
  j.beatActive = false
  j.beatLine = 0
  j.handoff = 0
}

export function skipCellStory(): void {
  const j = getJourney()
  j.beatActive = false
  j.beatDone = true
}

/**
 * Advance the journey — called once per frame from the camera rig.
 * Owns stage detection, toasts, hero cargo and the meet-the-cell beat.
 */
export function tickJourney(sim: SimState, _dt: number): void {
  const j = getJourney()
  const prevDist = j.prevDist
  j.dist = distOfZ(sim.camZ)
  // A jump no honest frame could produce (max pace is a couple of units per
  // clamped frame) means the ride was moved, not ridden. The lap in progress
  // stops being a measurement.
  if (Math.abs(j.dist - prevDist) > 8) j.lapMeasurable = false
  j.prevDist = j.dist
  const prevLap = j.lap
  j.lap = Math.floor(j.dist / LAP_LENGTH)

  // Ride clock: wall time, but only while actually riding (not paused, not
  // parked at the featured cell). Clamped so a background tab doesn't "ride".
  const t = nowS()
  const wallDt = j.lastTickAt < 0 ? 0 : Math.min(Math.max(t - j.lastTickAt, 0), 0.25)
  j.lastTickAt = t
  if (sim.started && !sim.paused && !j.beatActive) j.rideClock += wallDt

  const idx = stageIndexAt(j.dist)
  const lapRolled = j.lap !== prevLap

  // --- Delivery: banked when the tissue→vein boundary is passed, tested as a
  // crossing rather than a stage-change so a stalled frame cannot lose one.
  if (sim.started && crossedBoundary(prevDist, j.dist, STAGE_ENDS[4])) {
    const handed = DEMANDS[j.demand].extraction
    j.o2Delivered += handed
    j.lastDelivery = handed
    j.deliveredAt = t
    deliveryPing()
  }
  if (sim.started && crossedBoundary(prevDist, j.dist, STAGE_ENDS[0])) loadClick()

  // --- Checkpoint: split times, gate flash, banner.
  if (idx !== j.stageIndex) {
    j.stageIndex = idx
    j.toastStage = idx
    j.toastAt = nowS()
    j.lastSplit = j.rideClock - j.lastGateClock
    j.lastGateClock = j.rideClock
    j.crossedIndex = idx
    j.crossedAt = t
    j.crossedLap = lapRolled
    if (!lapRolled) checkpointBlip()
  }

  // --- Lap: counted on its own, never as a side effect of a stage change.
  if (lapRolled && sim.started) {
    const lapTime = j.rideClock - j.lapStartClock
    // A lap that was joined part-way or jumped gets no time at all: showing a
    // 0.3 s "best lap" would be worse than showing nothing.
    if (j.lapMeasurable) {
      j.lastLap = lapTime
      if (j.bestLap === null || lapTime < j.bestLap) j.bestLap = lapTime
    }
    // Only a lap ridden start to finish, entirely at one demand, is a fair
    // sample. Everything else still gets a time on the HUD — it just never
    // reaches the data table.
    if (j.lapDemand >= 0 && j.lapMeasurable) {
      const prevBest = j.bestByDemand[j.lapDemand]
      if (prevBest === null || lapTime < prevBest) j.bestByDemand[j.lapDemand] = lapTime
      recordLapTrial(j.lapDemand, lapTime)
    }
    j.lapDemand = j.demand
    j.lapMeasurable = true
    j.lapStartClock = j.rideClock
    saveBests(j.bestByDemand)
    lapChime()
  }

  const cargo = heroCargoAt(j.dist)
  j.o2 = cargo.o2
  j.co2 = cargo.co2
  // While the meet-the-cell story runs the ride is nearly stopped, so the
  // handover — not distance — drives the sites the learner is watching. Only
  // as many sites as the current demand extracts: at rest the cell leaves
  // with three quarters of its oxygen still aboard.
  if (j.beatActive || (j.beatDone && j.lap === 0 && stageIndexAt(j.dist) === 4)) {
    const handed = Math.round(DEMANDS[j.demand].extraction * j.handoff)
    j.o2 = Math.min(j.o2, 4 - handed)
    j.co2 = Math.max(j.co2, handed)
  }

  // --- Meet-the-cell beat: first pass through the tissue, once per run.
  // Armed either by sitting in the approach window OR by having crossed the
  // featured cell since the last tick — so a stalled frame, a backgrounded
  // tab or a jump can never skip the one moment the cabinet exists for.
  const focusD = cellFocusDist()
  const inWindow = j.dist > focusD - 6 && j.dist < focusD + 30
  const crossedFocus =
    lapOf(prevDist) === lapOf(j.dist) && prevDist < focusD && j.dist >= focusD
  // The catch-up branch stays bounded to the tissue: a stalled frame should
  // still trigger the stop, but arriving in the vein is too late to mean it.
  const nearEnough = j.dist < focusD + 45
  if (!j.beatDone && !j.beatActive && nearEnough && (inWindow || crossedFocus)) {
    j.beatActive = true
    j.beatLine = 0
    j.beatLineAt = nowS()
  }
  if (j.beatActive) {
    const line = CELL_STORY[j.beatLine]
    if (line && nowS() - j.beatLineAt > line.hold) {
      j.beatLine++
      j.beatLineAt = nowS()
    }
    if (j.beatLine >= CELL_STORY.length) {
      j.beatActive = false
      j.beatDone = true
    }
    // Handover progress follows the story: starts at line 3, done by line 5.
    const p = j.beatLine + Math.min(1, (nowS() - j.beatLineAt) / (CELL_STORY[j.beatLine]?.hold ?? 1))
    j.handoff = Math.min(1, Math.max(0, (p - 3) / 2))
  } else if (j.beatDone) {
    j.handoff = 1
  }
}

/**
 * Next checkpoint: the stage boundary ahead, how far it is, and a live ETA
 * at the current slider speed (integrating this stage's pace — blend zones
 * are small enough to ignore). frac is 0..1 progress through this sector.
 */
export function nextCheckpoint(sim: SimState): {
  next: StageDef
  remaining: number
  eta: number
  frac: number
} {
  const j = getJourney()
  const i = j.stageIndex
  const ld = lapDist(j.dist)
  const start = i === 0 ? 0 : STAGE_ENDS[i - 1]
  const end = STAGE_ENDS[i]
  const remaining = end - ld
  const pace = sim.speed * 6 * STAGES[i].flowK
  return {
    next: STAGES[(i + 1) % STAGES.length],
    remaining,
    eta: pace > 0 ? remaining / pace : Infinity,
    frac: (ld - start) / STAGES[i].length,
  }
}

/**
 * The ghost: where your best lap AT THIS DEMAND would be on the track right
 * now, as a lap fraction, plus how far ahead (negative) or behind (positive)
 * you are in seconds.
 *
 * Because pace is deterministic for a given demand, riding a whole lap at one
 * setting simply matches the ghost — the delta only opens up when you change
 * demand mid-lap, which is exactly the experiment worth running: is it faster
 * to sprint the whole way, or only the second half?
 */
export function ghostState(): { frac: number; delta: number } | null {
  const j = getJourney()
  const best = j.bestByDemand[j.demand]
  if (best === null || best <= 0) return null
  const elapsed = j.rideClock - j.lapStartClock
  const ghostFrac = Math.min(1, elapsed / best)
  const myFrac = lapDist(j.dist) / LAP_LENGTH
  // How long the ghost took to reach where I am now, versus my elapsed time.
  const ghostTimeHere = myFrac * best
  return { frac: ghostFrac, delta: elapsed - ghostTimeHere }
}

/**
 * Oxygen delivered per minute of riding — the sim's own measurement of
 * (trips per minute × molecules handed over per trip). This is the shape of
 * the Fick relationship: delivery = flow × extraction. It is a reading from
 * THIS simulation, not a physiological figure in real units.
 */
export function deliveryPerMinute(): number {
  const j = getJourney()
  if (j.rideClock < 1) return 0
  return (j.o2Delivered / j.rideClock) * 60
}

/** mm:ss.d for lap times, s.d for short splits. */
export function fmtRace(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—'
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const m = Math.floor(seconds / 60)
  const rest = seconds - m * 60
  return `${m}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`
}

/**
 * Flow multiplier the ride should use right now — the stage's own pace,
 * pulled almost to a stop while the meet-the-cell story is playing.
 */
export function journeyFlowK(_sim: SimState): number {
  const j = getJourney()
  const base = paramAt(j.dist, (s) => s.flowK)
  if (j.beatActive) return base * 0.05
  return base
}
