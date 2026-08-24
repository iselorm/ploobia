/**
 * The Sugar Line cabinet's mutable state, its clocks, its instruments and its
 * missions.
 *
 * `lib/sugarline.ts` is the pure model; this is the part that changes. It is a
 * plain mutable object shared between React and the R3F render loop — the
 * house pattern — so the scene can read the live solve every frame without
 * re-rendering anything.
 */

import type { Band, BandCaps } from './bands'
import type { LabEnv } from './ratelab'
import { CO2_AMBIENT_PPM, CO2_MAX_PPM, PAR_FULL_SUN, TEMP_MAX_C, TEMP_MIN_C } from './ratelab'
import { DEFAULT_SPECIMEN, SPECIMEN_BY_ID, type Specimen } from './specimens'
import {
  clamp,
  clamp01,
  createCarbonState,
  findAnomaly,
  halfRange,
  mean,
  MEASURES,
  noisy,
  solveSugarLine,
  stepCarbon,
  type CarbonState,
  type MeasureId,
  type SugarReading,
  type SugarSolve,
  type SugarVarId,
  type SugarVarMeta,
} from './sugarline'

/* ------------------------------------------------------------------ */
/* Clocks                                                             */
/* ------------------------------------------------------------------ */

/**
 * A tuber does not fill while you watch, so plant time runs fast. The
 * multiplier is always on screen rather than hidden — a simulation that
 * silently speeds up time teaches the wrong intuition about rates.
 */
export const CLOCK_LIVE_HOURS_PER_SECOND = 0.5
/** ×1800 */
export const CLOCK_LIVE_MULTIPLIER = Math.round(CLOCK_LIVE_HOURS_PER_SECOND * 3600)

/**
 * Timing a tracer needs a clock a human can tap against, so a tracer run drops
 * the plant to forty-five times real speed. At a typical 1 m h⁻¹ the labelled
 * parcel then takes about ten seconds to cross the gap between the marks.
 *
 * The stopwatch on screen counts **plant** seconds, not real ones. That is the
 * honest choice: the learner divides a real distance by a real time and gets a
 * real speed, with no hidden conversion factor to fall into.
 */
export const CLOCK_TRACER_HOURS_PER_SECOND = 45 / 3600
export const CLOCK_TRACER_MULTIPLIER = 45

/** The marks are scribed across three tenths of the transport path. */
export const TRACER_GAP_FRACTION = 0.3

/* ------------------------------------------------------------------ */
/* Stages                                                             */
/* ------------------------------------------------------------------ */

/**
 * Three views of one plant, in the order a learner should meet them: the whole
 * supply chain, then the factory that feeds it, then the pipe it travels down.
 */
export type StageId = 'plant' | 'leaf' | 'stem'

export interface StageMeta {
  id: StageId
  label: string
  /** Uppercase eyebrow used on the atlas card. */
  eyebrow: string
  /** One line under the tab. */
  hint: string
  /** The scale bar this view shows. */
  scale: { label: string; /** metres per bar */ metres: number }
}

export const STAGES: StageMeta[] = [
  {
    id: 'plant',
    label: 'Whole plant',
    eyebrow: 'THE SUPPLY CHAIN',
    hint: 'Source, line and sinks together. Watch where the sugar actually goes.',
    scale: { label: '10 cm', metres: 0.1 },
  },
  {
    id: 'leaf',
    label: 'Inside a leaf',
    eyebrow: 'THE FACTORY',
    hint: 'A chloroplast at work: light split water, the Calvin cycle builds sugar.',
    scale: { label: '2 µm', metres: 2e-6 },
  },
  {
    id: 'stem',
    label: 'The stem, cut',
    eyebrow: 'THE LINE',
    hint: 'Xylem climbing, phloem descending, and what happens when you cut the ring.',
    scale: { label: '100 µm', metres: 1e-4 },
  },
]

export const STAGE_BY_ID: Record<string, StageMeta> = Object.fromEntries(
  STAGES.map((s) => [s.id, s]),
)

/* ------------------------------------------------------------------ */
/* Variables                                                          */
/* ------------------------------------------------------------------ */

export const SUGAR_VARS: Record<SugarVarId, SugarVarMeta> = {
  light: {
    id: 'light',
    label: 'Light intensity',
    simpleLabel: 'Sunlight',
    unit: 'µmol m⁻² s⁻¹',
    chipUnit: 'µmol',
    axis: 'Light intensity (µmol m⁻² s⁻¹)',
    min: 0,
    max: PAR_FULL_SUN,
    step: 50,
    color: '#E8A33D',
    read: (e) => e.light * PAR_FULL_SUN,
    patch: (real) => ({ light: clamp01(real / PAR_FULL_SUN) }),
    format: (real) => `${Math.round(real)}`,
  },
  co2: {
    id: 'co2',
    label: 'CO₂ concentration',
    simpleLabel: 'Carbon dioxide',
    unit: 'ppm',
    chipUnit: 'ppm',
    axis: 'CO₂ concentration (ppm)',
    min: 0,
    max: CO2_MAX_PPM,
    step: 25,
    color: '#7A8B99',
    read: (e) => e.co2 * CO2_MAX_PPM,
    patch: (real) => ({ co2: clamp01(real / CO2_MAX_PPM) }),
    format: (real) => `${Math.round(real)}`,
  },
  temp: {
    id: 'temp',
    label: 'Temperature',
    simpleLabel: 'Temperature',
    unit: '°C',
    chipUnit: '°C',
    axis: 'Temperature (°C)',
    min: TEMP_MIN_C,
    max: TEMP_MAX_C,
    step: 1,
    color: '#C13B33',
    read: (e) => e.tempC,
    patch: (real) => ({ tempC: real }),
    format: (real) => real.toFixed(0),
  },
  water: {
    id: 'water',
    label: 'Soil water',
    simpleLabel: 'Water',
    unit: '%',
    chipUnit: '%',
    axis: 'Soil water (%)',
    min: 0,
    max: 100,
    step: 5,
    color: '#2E6DA8',
    read: (e) => e.soilWater * 100,
    patch: (real) => ({ soilWater: clamp01(real / 100) }),
    format: (real) => `${Math.round(real)}`,
  },
}

export const SUGAR_VAR_ORDER: SugarVarId[] = ['light', 'co2', 'temp', 'water']

/* ------------------------------------------------------------------ */
/* The sim                                                            */
/* ------------------------------------------------------------------ */

export interface TrialSnapshot {
  xVar: SugarVarId
  measure: MeasureId
  x: number
  light: number
  co2: number
  tempC: number
  water: number
  specimenId: string
  girdled: boolean
}

export interface SugarSim {
  /* ---- environment (what the learner sets) ---- */
  light: number
  co2: number
  tempC: number
  soilWater: number
  humidity: number
  turgor: number
  /** Night forces light to zero and makes the plant live off its starch. */
  night: boolean

  /* ---- specimen and surgery ---- */
  specimenId: string
  /** The phloem ring has been cut. Xylem keeps running; sugar cannot pass. */
  girdled: boolean

  /* ---- clocks ---- */
  /** Wall-clock seconds since mount, for idle animation. */
  time: number
  /** Plant hours elapsed. */
  plantHours: number
  /** Hours of plant time per real second, right now. */
  clockRate: number
  paused: boolean
  started: boolean

  /* ---- carbon stores ---- */
  carbon: CarbonState
  /** The most recent solve, refreshed every frame. Read-only for the scene. */
  solve: SugarSolve | null

  /* ---- view ---- */
  /**
   * Draw the specimen's native habitat around it. Off puts it back on the
   * plain field-guide plate — one press, for anyone who finds the scenery
   * distracting or is working on a slow tablet.
   */
  habitat: boolean
  /**
   * The mission the learner has tapped. It drives the coach chip, the glow
   * ring on whichever control the mission needs next, and where the camera
   * flies — a mission you can only read is a to-do list, not a task.
   */
  activeMission: string | null
  stage: StageId
  /** Reaction Vision: the survey pulse that annotates the chemistry as it passes. */
  vision: boolean
  /** 0–1 position of the survey wavefront. */
  pulse: number
  viewId: string
  viewSeq: number
  viewZoom: number
  viewReset: number
  autoOrbit: boolean

  /* ---- measurement trial ---- */
  measure: MeasureId
  xVar: SugarVarId
  trialRunning: boolean
  trialElapsed: number
  trialLength: number
  trialSum: number
  trialSamples: number
  trialCompleted: number
  trialAborted: number
  lastTrueValue: number
  trialSnapshot: TrialSnapshot | null

  /* ---- the tracer run (translocation speed) ---- */
  tracerActive: boolean
  /** How far the labelled parcel has travelled from the leaf, in metres. */
  tracerDistance: number
  /** Stopwatch state: 0 not started, 1 running, 2 stopped. */
  tracerWatch: 0 | 1 | 2
  /** Seconds on the learner's stopwatch. */
  tracerWatchSeconds: number
  /** Plant-time seconds the parcel really took between the marks. */
  tracerTrueSeconds: number
  /** Bumped whenever a tracer run finishes. */
  tracerCompleted: number
  /** Metres at which the first and second marks sit. */
  tracerMarkA: number
  tracerMarkB: number

  /* ---- guided demo ---- */
  demoMode: boolean
}

export function createSugarSim(): SugarSim {
  const specimen = SPECIMEN_BY_ID[DEFAULT_SPECIMEN]
  return {
    light: 0.55,
    co2: CO2_AMBIENT_PPM / CO2_MAX_PPM,
    tempC: 24,
    soilWater: 0.7,
    humidity: 0.55,
    turgor: 1,
    night: false,

    specimenId: DEFAULT_SPECIMEN,
    girdled: false,

    time: 0,
    plantHours: 8,
    clockRate: CLOCK_LIVE_HOURS_PER_SECOND,
    paused: false,
    started: false,

    carbon: createCarbonState(specimen),
    solve: null,

    habitat: true,
    activeMission: null,
    stage: 'plant',
    vision: false,
    pulse: 0,
    viewId: 'overview',
    viewSeq: 0,
    viewZoom: 0,
    viewReset: 0,
    autoOrbit: false,

    measure: 'export',
    xVar: 'light',
    trialRunning: false,
    trialElapsed: 0,
    trialLength: 6,
    trialSum: 0,
    trialSamples: 0,
    trialCompleted: 0,
    trialAborted: 0,
    lastTrueValue: 0,
    trialSnapshot: null,

    tracerActive: false,
    tracerDistance: 0,
    tracerWatch: 0,
    tracerWatchSeconds: 0,
    tracerTrueSeconds: 0,
    tracerCompleted: 0,
    tracerMarkA: specimen.pathLengthM * 0.18,
    tracerMarkB: specimen.pathLengthM * (0.18 + TRACER_GAP_FRACTION),

    demoMode: false,
  }
}

export function simSpecimen(sim: SugarSim): Specimen {
  return SPECIMEN_BY_ID[sim.specimenId] ?? SPECIMEN_BY_ID[DEFAULT_SPECIMEN]
}

/** The environment the model sees. Night is a hard zero on light, not a dimmer. */
export function simEnv(sim: SugarSim): LabEnv {
  return {
    light: sim.night ? 0 : sim.light,
    co2: sim.co2,
    tempC: sim.tempC,
    humidity: sim.humidity,
    soilWater: sim.soilWater,
    turgor: sim.turgor,
  }
}

export function simSolve(sim: SugarSim): SugarSolve {
  return solveSugarLine(simSpecimen(sim), simEnv(sim), sim.carbon, { girdled: sim.girdled })
}

/** Swap the specimen and start its stores fresh. */
export function loadSpecimen(sim: SugarSim, id: string): void {
  const specimen = SPECIMEN_BY_ID[id]
  if (!specimen) return
  sim.specimenId = id
  sim.carbon = createCarbonState(specimen)
  sim.turgor = 1
  sim.girdled = false
  sim.tracerActive = false
  sim.tracerWatch = 0
  sim.tracerDistance = 0
  sim.solve = null
}

/* ------------------------------------------------------------------ */
/* One tick                                                           */
/* ------------------------------------------------------------------ */

/** How fast the leaf loses and regains water — the same shape the Rate Lab used. */
function stepTurgor(sim: SugarSim, solve: SugarSolve, dtHours: number): void {
  const specimen = simSpecimen(sim)
  const buffer = 0.5 + 3 * specimen.leaf.waterStore
  const balance = solve.leaf.uptake - solve.leaf.transpiration
  sim.turgor = clamp01(sim.turgor + (balance * 0.22 * dtHours) / buffer)
  sim.soilWater = clamp01(sim.soilWater - solve.leaf.transpiration * 0.014 * dtHours)
}

/**
 * Advance everything by `rawDt` real seconds. Called once per frame from the
 * scene; the two clamps are the house rule (tight for idle animation, looser
 * for anything that has to keep wall-clock honesty on a slow machine).
 */
export function stepSim(sim: SugarSim, rawDt: number): void {
  const dt = Math.min(rawDt, 0.05)
  const stepDt = Math.min(rawDt, 0.25)
  sim.time += dt

  const solve = simSolve(sim)
  sim.solve = solve
  if (sim.paused || !sim.started) return

  sim.clockRate = sim.tracerActive ? CLOCK_TRACER_HOURS_PER_SECOND : CLOCK_LIVE_HOURS_PER_SECOND
  const dtHours = stepDt * sim.clockRate
  sim.plantHours += dtHours

  stepCarbon(simSpecimen(sim), sim.carbon, solve, dtHours * 3600)
  stepTurgor(sim, solve, dtHours)

  /* ---- the measurement trial ---- */
  if (sim.trialRunning) {
    sim.trialElapsed += stepDt
    const value = MEASURES[sim.measure].read(solve)
    sim.trialSum += value * stepDt
    sim.trialSamples += stepDt
    if (sim.trialElapsed >= sim.trialLength) {
      sim.lastTrueValue = sim.trialSamples > 0 ? sim.trialSum / sim.trialSamples : 0
      sim.trialRunning = false
      sim.trialCompleted += 1
    }
  }

  /* ---- the tracer parcel ---- */
  if (sim.tracerActive) {
    // The parcel travels at the sap's real speed. m h⁻¹ × hours = metres.
    const before = sim.tracerDistance
    sim.tracerDistance += solve.velocity * dtHours
    // The stopwatch counts plant seconds, so the learner's division needs no
    // conversion factor.
    if (sim.tracerWatch === 1) sim.tracerWatchSeconds += dtHours * 3600
    // What the run *should* have read, for the honest-error comparison.
    if (before < sim.tracerMarkA && sim.tracerDistance >= sim.tracerMarkA) sim.tracerTrueSeconds = 0
    else if (sim.tracerDistance > sim.tracerMarkA && sim.tracerDistance <= sim.tracerMarkB)
      sim.tracerTrueSeconds += dtHours * 3600
    if (sim.tracerDistance >= sim.tracerMarkB + simSpecimen(sim).pathLengthM * 0.12) {
      sim.tracerActive = false
      sim.tracerCompleted += 1
    }
  }

  /* ---- Reaction Vision's survey wavefront ---- */
  if (sim.vision) {
    sim.pulse += dt * 0.34
    if (sim.pulse > 1.35) sim.pulse = -0.1
  } else {
    sim.pulse = 0
  }
}

/* ------------------------------------------------------------------ */
/* Taking a reading                                                   */
/* ------------------------------------------------------------------ */

export function snapshotTrial(sim: SugarSim): TrialSnapshot {
  return {
    xVar: sim.xVar,
    measure: sim.measure,
    x: SUGAR_VARS[sim.xVar].read(simEnv(sim)),
    light: (sim.night ? 0 : sim.light) * PAR_FULL_SUN,
    co2: sim.co2 * CO2_MAX_PPM,
    tempC: sim.tempC,
    water: sim.soilWater * 100,
    specimenId: sim.specimenId,
    girdled: sim.girdled,
  }
}

/** Run the true value through the band's instrument and build the record. */
export function makeReading(
  id: number,
  sim: SugarSim,
  snap: TrialSnapshot,
  caps: BandCaps,
  predicted: number | null,
): SugarReading {
  const decimals = MEASURES[snap.measure].decimals
  const n = caps.repeats ? 3 : 1
  const repeats = Array.from({ length: n }, () =>
    Number(noisy(sim.lastTrueValue, caps.noise).toFixed(decimals)),
  )
  const solve = sim.solve ?? simSolve(sim)
  return {
    id,
    xVar: snap.xVar,
    x: snap.x,
    measure: snap.measure,
    y: Number(mean(repeats).toFixed(decimals)),
    repeats,
    uncertainty: Number(halfRange(repeats).toFixed(decimals)),
    anomalous: findAnomaly(repeats),
    specimenId: snap.specimenId,
    girdled: snap.girdled,
    controls: { light: snap.light, co2: snap.co2, temp: snap.tempC, water: snap.water },
    predicted,
    audit: {
      fixed: Number(solve.production.toFixed(2)),
      burnt: Number(solve.wholePlantRespiration.toFixed(2)),
      exported: Number(solve.exportRate.toFixed(2)),
    },
  }
}

/* ------------------------------------------------------------------ */
/* Missions                                                           */
/* ------------------------------------------------------------------ */

export type SkillId = 'measuring' | 'predicting' | 'controlling' | 'interpreting' | 'explaining'

/**
 * The control a mission step is pointing at.
 *
 * These are names for things already on screen, not new machinery: the HUD
 * matches the string against the control it renders and puts a ring round it.
 * Keeping the vocabulary this small is deliberate — if a step cannot name the
 * one control it needs, the step is too vague to give a learner.
 */
export type MissionTarget =
  | 'light'
  | 'co2'
  | 'temp'
  | 'water'
  | 'night'
  | 'girdle'
  | 'measure'
  | 'xvar'
  | 'predict'
  | 'run'
  | 'tracer'
  | 'specimen'
  | 'stage'

export interface MissionStep {
  /** The imperative, short enough for the coach chip. One action only. */
  say: string
  /** Which control to ring while this step is the current one. */
  target: MissionTarget
  /** True once the learner has done it. */
  done: (sim: SugarSim, readings: SugarReading[]) => boolean
}

export interface SugarMission {
  id: string
  title: string
  brief: string
  /** The payoff, revealed on completion. This is where the idea actually lands. */
  reward: string
  minBand: Band
  skill: SkillId
  check: (readings: SugarReading[]) => boolean
  /**
   * How to actually do it.
   *
   * A mission that only states its finish line is a to-do list; the learner
   * reads "show the curve levelling off" and has no idea which of eleven
   * controls to touch first. Tapping a mission makes it the active one, and
   * the first step whose `done` is still false becomes the coach chip's line
   * and rings its own control.
   */
  steps: MissionStep[]
}

/** µmol from the 0–1 light dial, matching what a reading records. */
const umol = (sim: SugarSim) => sim.light * PAR_FULL_SUN
const anyExport = (rs: SugarReading[]) => rs.some((r) => r.measure === 'export')

const BAND_RANK: Record<Band, number> = { explorer: 0, scientist: 1, analyst: 2 }

export const SUGAR_MISSIONS: SugarMission[] = [
  {
    id: 'first-export',
    title: 'Wake the line up',
    brief: 'Record a sugar export rate above 8 mg per hour.',
    reward:
      'That is sugar leaving the leaf. Nothing else in the plant can make it — every root, every flower, every seed is living on what comes down that pipe.',
    minBand: 'explorer',
    skill: 'measuring',
    check: (rs) => rs.some((r) => r.measure === 'export' && r.y > 8),
    steps: [
      {
        say: 'Turn the light up past half way — the leaf needs something to work with.',
        target: 'light',
        done: (sim) => sim.light > 0.5,
      },
      {
        say: 'Say what you think the reading will be. Guessing is allowed; not guessing is not.',
        target: 'predict',
        done: (_sim, rs) => rs.some((r) => r.predicted !== null),
      },
      { say: 'Press Run measurement and let the trial finish.', target: 'run', done: (_s, rs) => anyExport(rs) },
    ],
  },
  {
    id: 'dark-line',
    title: 'The night shift',
    brief:
      'Switch to night and record the export rate. The sun is off — find out whether the sugar stops with it.',
    reward:
      'It keeps going. The leaf banked the day’s surplus as starch and is spending it now. That is why a leaf weighs most at dusk and least at dawn.',
    minBand: 'explorer',
    skill: 'measuring',
    check: (rs) => rs.some((r) => r.measure === 'export' && r.controls.light < 1 && r.y > 0.5),
    steps: [
      { say: 'Switch the plant to night.', target: 'night', done: (sim) => sim.night },
      {
        say: 'Run a measurement in the dark. Watch whether the gold keeps moving.',
        target: 'run',
        done: (_s, rs) => rs.some((r) => r.measure === 'export' && r.controls.light < 1),
      },
    ],
  },
  {
    id: 'cut-the-ring',
    title: 'Cut the ring',
    brief:
      'Girdle the stem — cut away the ring of phloem — and record the export rate below the cut.',
    reward:
      'Zero. Water still climbs the xylem in the wood, so the leaves stay alive and green for weeks; the roots below the cut starve to death. Ring-barking kills a tree from the bottom up.',
    minBand: 'explorer',
    skill: 'controlling',
    check: (rs) => rs.some((r) => r.girdled && r.measure === 'export' && r.y < 0.6),
    steps: [
      { say: 'Cut the phloem ring — you are girdling the stem.', target: 'girdle', done: (sim) => sim.girdled },
      {
        say: 'Now measure the export below the cut.',
        target: 'run',
        done: (_s, rs) => rs.some((r) => r.girdled && r.measure === 'export'),
      },
    ],
  },
  {
    id: 'light-curve',
    title: 'Find the ceiling',
    brief:
      'Investigate light. Record at least five export readings across the range and show the curve levelling off.',
    reward:
      'Past the bend, more light buys nothing: something downstream is the constraint. Either the leaf cannot fix CO₂ any faster, or the phloem cannot carry sugar away any faster.',
    minBand: 'scientist',
    skill: 'measuring',
    check: (rs) => {
      const s = rs.filter((r) => r.xVar === 'light' && r.measure === 'export')
      if (s.length < 5) return false
      const peak = Math.max(...s.map((r) => r.y))
      const high = s.filter((r) => r.x > 1100)
      return peak > 6 && high.length >= 2 && high.every((r) => r.y >= peak * 0.78)
    },
    steps: [
      { say: 'Set light as the thing you are investigating.', target: 'xvar', done: (sim) => sim.xVar === 'light' },
      {
        say: 'Take readings right across the light range — low, middle, then two up at the top.',
        target: 'light',
        done: (_s, rs) => rs.filter((r) => r.xVar === 'light' && r.measure === 'export').length >= 5,
      },
      {
        say: 'Two readings above 1100 µmol are what show the curve flattening.',
        target: 'run',
        done: (_s, rs) =>
          rs.filter((r) => r.xVar === 'light' && r.measure === 'export' && r.x > 1100).length >= 2,
      },
    ],
  },
  {
    id: 'timed-tracer',
    title: 'Time the sugar',
    brief:
      'Run a tracer and record the translocation speed. Then do it again at a different temperature.',
    reward:
      'Cold sap is thicker sap. The same pressure moves it more slowly, which is one honest reason a cold spring delays a harvest.',
    minBand: 'scientist',
    skill: 'measuring',
    check: (rs) => {
      const s = rs.filter((r) => r.measure === 'velocity')
      if (s.length < 2) return false
      return Math.max(...s.map((r) => r.controls.temp)) - Math.min(...s.map((r) => r.controls.temp)) >= 8
    },
    steps: [
      { say: 'Switch the instrument to translocation speed.', target: 'measure', done: (sim) => sim.measure === 'velocity' },
      {
        say: 'Release the tracer, then start and stop the watch on the two marks.',
        target: 'tracer',
        done: (_s, rs) => rs.some((r) => r.measure === 'velocity'),
      },
      {
        say: 'Change the temperature by at least 8 °C and time a second run.',
        target: 'temp',
        done: (_s, rs) => {
          const v = rs.filter((r) => r.measure === 'velocity')
          return v.length >= 2 && Math.max(...v.map((r) => r.controls.temp)) - Math.min(...v.map((r) => r.controls.temp)) >= 8
        },
      },
    ],
  },
  {
    id: 'drought-line',
    title: 'Dry the line out',
    brief:
      'Drop the soil water below 20% and record the export rate. Compare it with a well-watered reading in the same light.',
    reward:
      'Drought stops the line at both ends: shut stomata starve the factory of CO₂, and a slack, unwatered sieve tube cannot hold the pressure that pushes the sugar along.',
    minBand: 'scientist',
    skill: 'controlling',
    check: (rs) => {
      const dry = rs.filter((r) => r.measure === 'export' && r.controls.water < 20)
      const wet = rs.filter((r) => r.measure === 'export' && r.controls.water > 55)
      if (!dry.length || !wet.length) return false
      return wet.some((w) => dry.some((d) => Math.abs(w.controls.light - d.controls.light) < 220 && w.y > d.y))
    },
    steps: [
      {
        say: 'First take a well-watered reading — you need something to compare against.',
        target: 'run',
        done: (_s, rs) => rs.some((r) => r.measure === 'export' && r.controls.water > 55),
      },
      { say: 'Now drop the soil water below 20%.', target: 'water', done: (sim) => sim.soilWater < 0.2 },
      {
        say: 'Measure again at the same light. Only the water may change.',
        target: 'run',
        done: (_s, rs) => rs.some((r) => r.measure === 'export' && r.controls.water < 20),
      },
    ],
  },
  {
    id: 'balance-the-books',
    title: 'Balance the books',
    brief:
      'Record a reading where the carbon audit closes: everything fixed accounted for as burnt or exported.',
    reward:
      'Carbon in equals carbon out plus carbon kept. If your books do not balance you have missed a flow — usually respiration, which never stops, day or night, in every living cell of the plant.',
    minBand: 'analyst',
    skill: 'interpreting',
    check: (rs) =>
      rs.some((r) => {
        const out = r.audit.burnt + r.audit.exported
        return r.audit.fixed > 4 && Math.abs(r.audit.fixed - out) <= Math.max(0.8, r.audit.fixed * 0.22)
      }),
    steps: [
      { say: 'Switch the instrument to net carbon gain.', target: 'measure', done: (sim) => sim.measure === 'gain' },
      {
        say: 'Give the leaf plenty of light so there is real carbon to account for.',
        target: 'light',
        done: (sim) => umol(sim) > 700,
      },
      {
        say: 'Run it, then read the audit in the Sugar tab: fixed = burnt + exported + kept.',
        target: 'run',
        done: (_s, rs) => rs.some((r) => r.audit.fixed > 4),
      },
    ],
  },
  {
    id: 'sink-limited',
    title: 'Fill the store',
    brief:
      'Fill a storage sink past 90% and then record the export rate. Something should have changed.',
    reward:
      'A full sink pushes back. Sugar that cannot be unloaded raises the pressure at the far end, the gradient collapses, and the whole line slows — even though the leaf is still making sugar as fast as ever. Yield is not always limited by the leaf.',
    minBand: 'analyst',
    skill: 'interpreting',
    check: (rs) => rs.some((r) => r.measure === 'export' && r.audit.fixed > r.audit.exported * 2.2 && r.audit.fixed > 6),
    steps: [
      {
        say: 'Run the plant bright and warm so the stores actually fill.',
        target: 'light',
        done: (sim) => umol(sim) > 900 && sim.tempC > 20,
      },
      {
        say: 'Watch a store on the plant swell past nine tenths, then measure the export.',
        target: 'run',
        done: (_s, rs) => rs.some((r) => r.measure === 'export' && r.audit.fixed > r.audit.exported * 1.8),
      },
    ],
  },
  {
    id: 'two-specimens',
    title: 'Two plants, one question',
    brief:
      'Measure the export rate of two different specimens under conditions that match to within 200 µmol and 3 °C.',
    reward:
      'Same physics, different hardware. Leaf area, photosynthetic pathway and the length of the pipe are all the plant chose long before today’s weather.',
    minBand: 'analyst',
    skill: 'controlling',
    check: (rs) => {
      const s = rs.filter((r) => r.measure === 'export')
      for (let i = 0; i < s.length; i++) {
        for (let j = i + 1; j < s.length; j++) {
          if (
            s[i].specimenId !== s[j].specimenId &&
            Math.abs(s[i].controls.light - s[j].controls.light) < 200 &&
            Math.abs(s[i].controls.temp - s[j].controls.temp) < 3
          )
            return true
        }
      }
      return false
    },
    steps: [
      { say: 'Measure the export rate of the specimen you are on.', target: 'run', done: (_s, rs) => anyExport(rs) },
      {
        say: 'Pick a different specimen from the library.',
        target: 'specimen',
        done: (_s, rs) => new Set(rs.filter((r) => r.measure === 'export').map((r) => r.specimenId)).size >= 2 ||
          rs.some((r) => r.measure === 'export' && r.specimenId !== rs[rs.length - 1]?.specimenId),
      },
      {
        say: 'Match the light to within 200 µmol and the temperature to within 3 °C, then measure.',
        target: 'run',
        done: (_s, rs) => {
          const e = rs.filter((r) => r.measure === 'export')
          for (let i = 0; i < e.length; i++)
            for (let j = i + 1; j < e.length; j++)
              if (
                e[i].specimenId !== e[j].specimenId &&
                Math.abs(e[i].controls.light - e[j].controls.light) < 200 &&
                Math.abs(e[i].controls.temp - e[j].controls.temp) < 3
              )
                return true
          return false
        },
      },
    ],
  },
]

export function missionsForBand(band: Band): SugarMission[] {
  return SUGAR_MISSIONS.filter((m) => BAND_RANK[m.minBand] <= BAND_RANK[band])
}

export interface MissionProgress {
  mission: SugarMission
  /** How many steps are already satisfied. */
  index: number
  /** The one thing to do next. Null once every step is done. */
  step: MissionStep | null
  /** The mission's own evidence test — the thing that actually completes it. */
  complete: boolean
}

/**
 * Where the learner is inside a mission they have tapped.
 *
 * Steps are checked in order and the first unmet one is the current step,
 * rather than "the furthest one reached". That matters: change the light back
 * down and the light-curve mission honestly walks its instruction back too,
 * instead of leaving a learner staring at step three of a job that is now
 * unfinished at step one.
 */
export function missionProgress(
  sim: SugarSim,
  readings: SugarReading[],
  id: string | null,
): MissionProgress | null {
  if (!id) return null
  const mission = SUGAR_MISSIONS.find((m) => m.id === id)
  if (!mission) return null
  const complete = mission.check(readings)
  if (complete) return { mission, index: mission.steps.length, step: null, complete }
  const index = mission.steps.findIndex((s) => !s.done(sim, readings))
  return {
    mission,
    index: index === -1 ? mission.steps.length : index,
    step: index === -1 ? null : mission.steps[index],
    complete,
  }
}

/* ------------------------------------------------------------------ */
/* Guided demo                                                        */
/* ------------------------------------------------------------------ */

export interface DemoApi {
  setStage: (s: StageId) => void
  setLight: (v: number) => void
  setTemp: (c: number) => void
  setNight: (on: boolean) => void
  setGirdled: (on: boolean) => void
  setMeasure: (m: MeasureId) => void
  setXVar: (v: SugarVarId) => void
  setPrediction: (v: number | null) => void
  setVision: (on: boolean) => void
  startTrial: () => void
  view: (id: string) => void
}

export interface DemoStep {
  /** What the narration says. */
  say: string
  ms: number
  enter?: (api: DemoApi) => void
  /** Slide a control smoothly across the step. */
  tween?: { from: number; to: number; apply: (api: DemoApi, v: number) => void }
  /** Wait for the running trial instead of the timer. */
  awaitTrial?: boolean
}

export const SUGAR_DEMO: DemoStep[] = [
  {
    say: 'This is one bean plant, and one question: where does the sugar go?',
    ms: 3400,
    enter: (a) => {
      a.setStage('plant')
      a.view('overview')
      a.setNight(false)
      a.setGirdled(false)
    },
  },
  {
    say: 'Gold parcels are sugar. They are made in the leaves and they only ever travel one way — down.',
    ms: 3600,
    enter: (a) => a.view('canopy'),
  },
  {
    say: 'Blue is water, climbing the xylem. Two pipes, side by side, running in opposite directions.',
    ms: 3600,
    enter: (a) => a.view('stem'),
  },
  {
    say: 'Turn the light down and the line thins out. There is less to send.',
    ms: 3800,
    enter: (a) => a.view('overview'),
    tween: { from: 0.85, to: 0.12, apply: (a, v) => a.setLight(v) },
  },
  {
    say: 'Turn it back up and the pods start filling again.',
    ms: 3200,
    tween: { from: 0.12, to: 0.8, apply: (a, v) => a.setLight(v) },
  },
  {
    say: 'The phloem tap measures how much sugar leaves the leaf every hour. Commit a prediction, then measure.',
    ms: 3200,
    enter: (a) => {
      a.setMeasure('export')
      a.setXVar('light')
      a.setPrediction(20)
    },
  },
  {
    say: 'Six seconds of trial, averaged — exactly like counting bubbles in a real lab.',
    ms: 9000,
    enter: (a) => a.startTrial(),
    awaitTrial: true,
  },
  {
    say: 'One reading is a dot. A curve needs several, and that is the whole job.',
    ms: 3000,
  },
  {
    say: 'Now the surgery. Cut the ring of phloem out of the stem and watch what happens.',
    ms: 4200,
    enter: (a) => {
      a.view('stem')
      a.setGirdled(true)
    },
  },
  {
    say: 'Water still climbs. Sugar stops dead at the cut, and everything below it begins to starve.',
    ms: 4200,
  },
  {
    say: 'Put the ring back, and go and find out what else can stall the line.',
    ms: 3200,
    enter: (a) => {
      a.setGirdled(false)
      a.view('overview')
      a.setPrediction(null)
    },
  },
]

/* ------------------------------------------------------------------ */
/* Copy that changes with the band                                    */
/* ------------------------------------------------------------------ */

export function stageBlurb(stage: StageId, caps: BandCaps): string {
  if (stage === 'leaf') {
    return caps.vocab === 'simple'
      ? 'Inside a leaf cell there are little green factories. This is one of them, working.'
      : caps.vocab === 'formal'
        ? 'A chloroplast: light-dependent reactions in the thylakoid membranes, the Calvin cycle in the stroma.'
        : 'Thylakoid membranes run the light-dependent reactions; the stroma runs Calvin–Benson carbon fixation on the ATP and NADPH they supply.'
  }
  if (stage === 'stem') {
    return caps.vocab === 'simple'
      ? 'The stem has two sets of pipes. One carries water up. The other carries sugar down.'
      : caps.vocab === 'formal'
        ? 'Xylem vessels carry water upward under tension; phloem sieve tubes carry sucrose downward under pressure.'
        : 'Xylem: dead, open vessels under tension from transpiration. Phloem: living sieve elements under positive turgor, driven by Münch mass flow.'
  }
  return caps.vocab === 'simple'
    ? 'One plant. Sugar is made at the top and used up at the bottom.'
    : caps.vocab === 'formal'
      ? 'Sources make sugar, sinks consume or store it, and the phloem connects them.'
      : 'A source–sink system: assimilate supply, phloem transport capacity and sink demand each able to be the binding constraint.'
}

export { clamp, clamp01 }
