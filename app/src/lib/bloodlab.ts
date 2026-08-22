import { getBand } from './bands'
import { logEvent } from './events'
import { DEMANDS, getJourney } from './journey'

/**
 * Blood Voyage's measurement loop — the house pattern (see the Measurement
 * Loop note): pick one independent variable, commit a prediction, run a
 * timed trial against a visible instrument, record it, and only then let a
 * mission complete.
 *
 * Here the independent variable is **body demand**, and the dependent
 * variable is **oxygen delivery rate**. A trial is one clean lap — a lap
 * ridden from start to finish at a single demand setting. Change the dial
 * part-way round and the lap is honestly discarded rather than recorded,
 * which is the controlled-variable idea made physical rather than explained.
 *
 * The relationship the data exposes is worth the whole cabinet:
 *
 *     delivery rate  =  trips per minute  ×  oxygen handed over per trip
 *
 * Both factors rise together with demand, so delivery climbs far faster than
 * heart rate alone would suggest. That is the shape of the real relationship
 * (physiologists write it as the Fick principle) and a learner can read it
 * straight off their own table.
 */

export interface Trial {
  /** Index into DEMANDS. */
  demand: number
  /** Seconds for the lap. */
  lapTime: number
  /** Heart rate during the lap. */
  bpm: number
  /** O₂ handed over per lap, out of 4. */
  extraction: number
  /** Laps per minute. */
  tripsPerMin: number
  /** O₂ delivered per minute = tripsPerMin × extraction. */
  rate: number
}

export type PredictionDir = 'lower' | 'same' | 'higher'

export interface LabState {
  trials: Trial[]
  /** Prediction committed for the demand level about to be tried. */
  prediction: { demand: number; dir: PredictionDir } | null
  /** Demands the learner has predicted for, so we only ask once each. */
  predicted: number[]
  /** Missions already completed (ids), so each logs its event once. */
  done: string[]
  /** Free-text / tile write-up. */
  claim: string
  reason: string
}

const state: LabState = {
  trials: [],
  prediction: null,
  predicted: [],
  done: [],
  claim: '',
  reason: '',
}

const listeners = new Set<() => void>()

function notify(): void {
  listeners.forEach((fn) => fn())
}

export function getLab(): LabState {
  return state
}

export function subscribeLab(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/* ------------------------------------------------------------------ */
/* Predictions                                                        */
/* ------------------------------------------------------------------ */

export function commitPrediction(dir: PredictionDir): void {
  const j = getJourney()
  state.prediction = { demand: j.demand, dir }
  if (!state.predicted.includes(j.demand)) state.predicted.push(j.demand)
  logEvent('blood', getBand(), 'prediction.committed', {
    variable: 'demand',
    x: j.demand,
    // Direction predictions are logged as -1 / 0 / +1 against the last trial.
    predicted: dir === 'higher' ? 1 : dir === 'lower' ? -1 : 0,
    kind: 'direction',
  })
  checkMissions()
  notify()
}

/** Whether we should be asking for a prediction at the current demand. */
export function needsPrediction(): boolean {
  const j = getJourney()
  if (state.trials.some((t) => t.demand === j.demand)) return false
  if (state.predicted.includes(j.demand)) return false
  // Nothing to predict against until there is a first result to compare with.
  return state.trials.length > 0
}

/* ------------------------------------------------------------------ */
/* Trials                                                             */
/* ------------------------------------------------------------------ */

/**
 * Called by the journey when a clean lap completes. `demand` is the level the
 * lap was ridden at (never -1 — mixed laps are filtered out upstream).
 */
export function recordLapTrial(demand: number, lapTime: number): void {
  if (lapTime <= 0.5) return // a warped or paused lap is not a measurement
  const dem = DEMANDS[demand]
  const tripsPerMin = 60 / lapTime
  const rate = tripsPerMin * dem.extraction
  const trial: Trial = {
    demand,
    lapTime,
    bpm: dem.bpm,
    extraction: dem.extraction,
    tripsPerMin,
    rate,
  }
  state.trials.push(trial)

  // Was the prediction for this demand right? Compare against the best rate
  // recorded at any lower demand.
  const pred = state.prediction && state.prediction.demand === demand ? state.prediction : null
  let close: boolean | null = null
  if (pred) {
    const lower = state.trials.filter((t) => t.demand < demand)
    if (lower.length > 0) {
      const ref = lower[lower.length - 1].rate
      const actual = rate > ref * 1.05 ? 'higher' : rate < ref * 0.95 ? 'lower' : 'same'
      close = actual === pred.dir
    }
    state.prediction = null
  }

  logEvent('blood', getBand(), 'reading.recorded', {
    variable: 'demand',
    x: demand,
    y: Number(rate.toFixed(2)),
    repeats: [],
    uncertainty: 0,
    controls: { cellCrowd: 1 },
    predicted: pred ? (pred.dir === 'higher' ? 1 : pred.dir === 'lower' ? -1 : 0) : null,
    predictionClose: close,
    anomalous: false,
  })
  checkMissions()
  notify()
}

/** Best (fastest) trial per demand — the row shown in the table. */
export function bestTrials(): (Trial | null)[] {
  return DEMANDS.map((_, i) => {
    const mine = state.trials.filter((t) => t.demand === i)
    if (mine.length === 0) return null
    return mine.reduce((a, b) => (b.lapTime < a.lapTime ? b : a))
  })
}

/* ------------------------------------------------------------------ */
/* Missions — completed on recorded evidence only                     */
/* ------------------------------------------------------------------ */

export interface LabMission {
  id: string
  title: string
  hint: string
  skill: 'measuring' | 'predicting' | 'controlling' | 'interpreting' | 'explaining'
  done: (s: LabState) => boolean
}

export const LAB_MISSIONS: LabMission[] = [
  {
    id: 'first-lap',
    title: 'Complete one full circuit',
    hint: 'Ride a whole lap without changing the demand dial.',
    skill: 'measuring',
    done: (s) => s.trials.length >= 1,
  },
  {
    id: 'three-levels',
    title: 'Measure all three demand levels',
    hint: 'One clean lap each at resting, jogging and sprinting.',
    skill: 'controlling',
    done: (s) => new Set(s.trials.map((t) => t.demand)).size >= 3,
  },
  {
    id: 'predict-once',
    title: 'Predict before you measure',
    hint: 'Say what will happen to delivery before running a new demand level.',
    skill: 'predicting',
    done: (s) => s.predicted.length >= 1,
  },
  {
    id: 'both-factors',
    title: 'Find the two reasons delivery rises',
    hint: 'Your table holds both: trips per minute AND oxygen handed over per trip.',
    skill: 'interpreting',
    done: (s) => {
      const b = DEMANDS.map((_, i) => s.trials.filter((t) => t.demand === i))
      const rest = b[0][0]
      const sprint = b[2][0]
      if (!rest || !sprint) return false
      return sprint.tripsPerMin > rest.tripsPerMin && sprint.extraction > rest.extraction
    },
  },
  {
    id: 'explain',
    title: 'Explain what your data shows',
    hint: 'Write a claim and a reason once you have measured at least two levels.',
    skill: 'explaining',
    done: (s) => s.claim.trim().length > 0 && s.reason.trim().length > 0 && s.trials.length >= 2,
  },
]

function checkMissions(): void {
  for (const m of LAB_MISSIONS) {
    if (state.done.includes(m.id)) continue
    if (!m.done(state)) continue
    state.done.push(m.id)
    logEvent('blood', getBand(), 'mission.completed', {
      missionId: m.id,
      title: m.title,
      skill: m.skill,
    })
  }
}

export function setWriteUp(claim: string, reason: string): void {
  const hadBoth = state.claim.trim().length > 0 && state.reason.trim().length > 0
  state.claim = claim
  state.reason = reason
  const nowBoth = claim.trim().length > 0 && reason.trim().length > 0
  if (!hadBoth && nowBoth && state.trials.length >= 2) {
    logEvent('blood', getBand(), 'writeup.completed', {
      variable: 'demand',
      claim,
      reason,
      limitations: [],
      ownWords: true,
    })
  }
  checkMissions()
  notify()
}

/** Test handle. */
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__bloodLab = () => ({
    trials: state.trials,
    predicted: state.predicted,
    done: state.done,
  })
}
