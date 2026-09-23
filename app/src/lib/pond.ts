/**
 * The Pond — a sprig of hornwort, a lamp on a rail, and a bubble counter.
 *
 * Door 2 of the Sugar Line (round E, after the Mystery Run brief of 13 Sep).
 * The Factory taught the learner what a dial does; the Pond takes the dials
 * away. Three plates on the tank read `?`, the learner can nudge but never
 * read them, and the only way to find out what is holding the plant back is
 * to change one thing and count bubbles.
 *
 * ## Why this model is not the Factory's
 *
 * `ratelab.ts` solves a land leaf as a smooth PRODUCT of light, CO₂ and
 * temperature factors. That is right for a curve you slide along, and wrong
 * here: a product has no ceiling, so "I made it brighter and nothing
 * happened" is never quite true — there is always a little more. A Mystery
 * Run needs *nothing happened* to be literally true on the counter.
 *
 * So the Pond uses the light-response model a plant physiologist would
 * actually fit: the **non-rectangular hyperbola** (Thornley), which blends
 * two limits — the light-limited slope `φ·PAR` and the light-saturated rate
 * `Aₘ` set by the carbon supply and the temperature — with a curvature θ.
 * At θ → 1 it is Blackman's "the factor in shortest supply", the model the
 * Analyst's page names; below 1 it rounds the corner, which is what real
 * leaves do. One equation gives us both an honest curve and a genuine
 * ceiling, and the two guarantees the round is built on:
 *
 *   - a nudge of a factor that is NOT limiting moves the count by < 1
 *   - a nudge of the factor that IS limiting moves it by ≥ 6
 *
 * `verify-pond-model.mjs` asserts both for every sprig at every band.
 *
 * ## Honest about the apparatus
 *
 * A bubble count is a rough measure of oxygen — bubbles differ in size — and
 * the Analyst's page says so. Warm water also degasses, which is why the
 * bath (never the lamp) sets the temperature, and why the model adds a small
 * physical degassing term that is NOT photosynthesis and is labelled as such.
 * Nothing in here is "photosynthesis increased 300 %": it is a bubble count.
 */

import { tempFactor } from './ratelab'
import type { LeafPreset } from './leaves'

/* ------------------------------------------------------------------ */
/* The plant                                                           */
/* ------------------------------------------------------------------ */

/**
 * Hornwort (*Ceratophyllum demersum*) — the sprig in the tank.
 *
 * It grows in the Volta and in half the ponds in Ghana, which is why it is
 * here rather than the *Elodea* of the English textbook (named on the
 * Analyst's page as the paper's plant). No roots at all: a cut stem in the
 * water, whorls of forked bristles up it — which is the thing to recognise.
 *
 * The figures are a submerged-macrophyte shape, not a bean's: a low
 * half-saturation for light (it lives in dim water and saturates a few
 * hundred µmol in), and a HIGH half-saturation for CO₂, because in water
 * the gas arrives through an unstirred boundary layer and diffuses ten
 * thousand times slower than in air. That last number is the whole reason a
 * spoon of baking soda changes everything.
 */
export const HORNWORT = {
  id: 'hornwort',
  name: 'Hornwort',
  binomial: 'Ceratophyllum demersum',
  /** Light-saturated rate, µmol CO₂ m⁻² s⁻¹, at saturating CO₂ and the optimum. */
  pmax: 15.5,
  /** Quantum yield: µmol CO₂ fixed per µmol photons absorbed. */
  phi: 0.038,
  /** Curvature of the light response, 0–1. Near 1 is Blackman's hard corner. */
  theta: 0.96,
  /**
   * CO₂ half-saturation, ppm-equivalent of dissolved inorganic carbon.
   * Low, because what limits an aquatic plant once there is plenty of
   * bicarbonate about is its own boundary layer and enzymes, not more
   * carbon — so the first spoon changes everything and the third almost
   * nothing, which is exactly the shape the round needs.
   */
  kCo2: 260,
  /** Dark respiration at 25 °C, µmol CO₂ m⁻² s⁻¹. */
  rd25: 1.15,
  tMin: 2,
  tOpt: 28,
  tMax: 42,
  /** The sprig's photosynthesising area, m². */
  area: 0.0042,
} as const

/** `tempFactor` wants a LeafPreset's three temperatures; this is that slice. */
const TEMPS = { tMin: HORNWORT.tMin, tOpt: HORNWORT.tOpt, tMax: HORNWORT.tMax } as unknown as LeafPreset

/** Scales µmol O₂ into the bubbles a school apparatus shows, per minute. */
export const BUBBLE_SCALE = 780

/* ------------------------------------------------------------------ */
/* The three dials, and what a nudge does                              */
/* ------------------------------------------------------------------ */

/**
 * The lamp's rail, in centimetres from the tank. A notch, never a value:
 * the plate reads `?` until the reveal.
 *
 * Review 1's correction: a percentage step cannot move a saturating curve
 * the way the story needs, and it is not what the practical does. The real
 * one slides the lamp, and the light at the sprig falls as 1/d² — so a notch
 * inward is roughly double the light, and the numbers can move.
 */
export const LAMP_RAIL = [45, 30, 20, 15, 10] as const

/** Spoons of baking soda (sodium hydrogencarbonate) in the tank. */
export const SODA_RAIL = [0, 1, 2, 3] as const

/** The water bath, °C. Room in Kumasi is 27; the veranda is 38. */
export const BATH_RAIL = [20, 24, 27, 30, 34, 38] as const

export const ROOM_C = 27

/**
 * PAR at the sprig, µmol photons m⁻² s⁻¹, from the lamp's distance.
 *
 * Inverse square from a small source, with the constant set so the rail runs
 * from deep shade at 45 cm to well past saturation at 10 cm. The water and
 * the glass take a little of it, which is in the constant.
 */
export const LAMP_K = 112500

export function parAt(cm: number): number {
  return Math.round((LAMP_K / (cm * cm)) * 10) / 10
}

/**
 * Dissolved inorganic carbon available to the sprig, as a ppm-equivalent.
 *
 * Nought spoons is what pond water that a plant has been sitting in all
 * morning has left — the plant has stripped it. Each spoon of baking soda
 * puts carbon back, with less effect each time as the water approaches what
 * it can hold.
 */
export function co2PpmFor(spoons: number): number {
  const n = Math.max(0, Math.min(SODA_RAIL.length - 1, Math.round(spoons)))
  return [80, 620, 1150, 1500][n]
}

export interface PondEnv {
  /** The lamp's distance, cm — one of LAMP_RAIL. */
  lampCm: number
  /** Spoons of baking soda in the tank. */
  spoons: number
  /** The water bath, °C — one of BATH_RAIL. */
  bathC: number
  /** A cloth over the tank: no light at all. */
  covered?: boolean
}

export type Dial = 'lamp' | 'soda' | 'bath'
/** What a plate can be accused of. `none` is the Analyst's fourth plate. */
export type Suspect = Dial | 'none'

export const DIALS: Dial[] = ['lamp', 'soda', 'bath']

function notch(rail: readonly number[], value: number, step: number): number {
  let i = 0
  let best = Infinity
  rail.forEach((v, k) => {
    const d = Math.abs(v - value)
    if (d < best) {
      best = d
      i = k
    }
  })
  const next = Math.max(0, Math.min(rail.length - 1, i + step))
  return rail[next]
}

/**
 * One notch, in the direction the learner asked for. `up` means *more of
 * what the dial gives the plant*: brighter, more soda, warmer. The lamp's
 * rail runs far to near, so brighter is a step along it — and the plate
 * still says nothing at all.
 */
export function nudge(env: PondEnv, dial: Dial, dir: 'up' | 'down'): PondEnv {
  const step = dir === 'up' ? 1 : -1
  if (dial === 'lamp') return { ...env, lampCm: notch(LAMP_RAIL, env.lampCm, step) }
  if (dial === 'soda') return { ...env, spoons: notch(SODA_RAIL, env.spoons, step) }
  return { ...env, bathC: notch(BATH_RAIL, env.bathC, step) }
}

/** Whether a nudge would do anything at all — the rail's end. */
export function atEnd(env: PondEnv, dial: Dial, dir: 'up' | 'down'): boolean {
  const next = nudge(env, dial, dir)
  return next.lampCm === env.lampCm && next.spoons === env.spoons && next.bathC === env.bathC
}

/* ------------------------------------------------------------------ */
/* The solve                                                           */
/* ------------------------------------------------------------------ */

export interface PondSolve {
  par: number
  co2Ppm: number
  /** The light-limited rate, µmol CO₂ m⁻² s⁻¹ — φ · PAR. */
  aLight: number
  /** The light-saturated rate: what the carbon supply and the enzymes allow. */
  aMax: number
  /** Gross photosynthesis after the two limits are blended. */
  gross: number
  /** Respiration — always running, faster when warm. */
  respiration: number
  /** Net CO₂ fixed; the oxygen the bubbles are made of. */
  net: number
  /** Oxygen coming out of solution because the water is warm — NOT photosynthesis. */
  degassing: number
  /** What the counter shows, bubbles a minute. */
  bubbles: number
  /** Which limit is binding: the one a nudge would move. */
  limitedBy: Suspect
}

/**
 * The non-rectangular hyperbola: the lesser of the two limits, with the
 * corner rounded by θ. θ = 1 is Blackman exactly (a hard min); θ = 0 is the
 * rectangular hyperbola the Factory uses.
 */
function blend(aLight: number, aMax: number, theta: number): number {
  if (aMax <= 0) return 0
  const b = aLight + aMax
  const disc = Math.max(0, b * b - 4 * theta * aLight * aMax)
  return (b - Math.sqrt(disc)) / (2 * theta)
}

/**
 * Warm water holds less gas, so it gives some back on its own. Small, real,
 * and the reason a warm tank can show a bubble or two more than the plant
 * made — the Analyst's page says so, and the bath's plate is the honest
 * place to look for it.
 */
function degassingAt(tempC: number): number {
  return Math.max(0, (tempC - ROOM_C) * 0.06)
}

export function solvePond(env: PondEnv): PondSolve {
  const par = env.covered ? 0 : parAt(env.lampCm)
  const co2Ppm = co2PpmFor(env.spoons)
  const fT = tempFactor(env.bathC, TEMPS)
  const aLight = HORNWORT.phi * par * fT
  const aMax = HORNWORT.pmax * (co2Ppm / (co2Ppm + HORNWORT.kCo2)) * fT
  const gross = blend(aLight, aMax, HORNWORT.theta)
  const respiration = HORNWORT.rd25 * Math.pow(1.8, (env.bathC - 25) / 10)
  const net = gross - respiration
  const degassing = degassingAt(env.bathC)
  const bubbles = Math.max(0, net * HORNWORT.area * BUBBLE_SCALE + degassing)
  // Which limit is binding, for the model suite and the reveal — never shown
  // to a learner before they have accused a plate.
  const slack = 0.12
  let limitedBy: Suspect = 'none'
  if (aLight < aMax * (1 - slack)) limitedBy = 'lamp'
  else if (aMax < aLight * (1 - slack)) limitedBy = co2Ppm < 1400 ? 'soda' : 'bath'
  if (fT < 0.72) limitedBy = 'bath'
  return { par, co2Ppm, aLight, aMax, gross, respiration, net, degassing, bubbles, limitedBy }
}

/** What the counter reads after a minute: a whole number of bubbles. */
export function bubblesPerMinute(env: PondEnv): number {
  return Math.round(solvePond(env).bubbles)
}

/**
 * How far a real count can sit from the truth: about one in twenty of it,
 * and never less than half a bubble. This is the Analyst's "within the
 * spread of the three repeats" — a change smaller than this is not a
 * finding, whatever the arithmetic says.
 */
export function spreadAt(bubbles: number): number {
  return Math.round((0.05 * bubbles + 0.6) * 100) / 100
}

/**
 * A count, with the scatter a real one has. Bubbles are not a metronome,
 * which is why the Analyst repeats and takes a mean, and why "flat" at that
 * band is a mean of three.
 */
export function countWith(env: PondEnv, rand: () => number): number {
  const truth = solvePond(env).bubbles
  const noise = (rand() - 0.5) * 2 * spreadAt(truth)
  return Math.max(0, Math.round(truth + noise))
}

/* ------------------------------------------------------------------ */
/* The two guarantees                                                  */
/* ------------------------------------------------------------------ */

/** The largest change either nudge of this dial makes to the count. */
export function swingOf(env: PondEnv, dial: Dial): number {
  const now = solvePond(env).bubbles
  let swing = 0
  for (const dir of ['up', 'down'] as const) {
    if (atEnd(env, dial, dir)) continue
    swing = Math.max(swing, Math.abs(solvePond(nudge(env, dial, dir)).bubbles - now))
  }
  return Math.round(swing * 100) / 100
}

/**
 * The best a single nudge of this dial could make things — never negative.
 *
 * This, not the swing, is what "nothing is holding it back" means: a sprig
 * at its ceiling can still be made worse (every rail has a wrong way to go),
 * and being unable to make it WORSE would be a strange thing to claim. The
 * honest claim is that nothing you do improves it.
 */
export function riseOf(env: PondEnv, dial: Dial): number {
  const now = solvePond(env).bubbles
  let rise = 0
  for (const dir of ['up', 'down'] as const) {
    if (atEnd(env, dial, dir)) continue
    rise = Math.max(rise, solvePond(nudge(env, dial, dir)).bubbles - now)
  }
  return Math.round(Math.max(0, rise) * 100) / 100
}

/** A sprig at its ceiling: every dial tried, and not one of them improves it. */
export function atCeiling(env: PondEnv, dials: Dial[] = DIALS): boolean {
  return dials.every((d) => riseOf(env, d) < MOVES_MIN)
}

/** A dial that is not the answer must do nothing you could see: under one bubble. */
export const FLAT_MAX = 1
/** The dial that IS the answer must be unmistakable: six bubbles or more. */
export const MOVES_MIN = 6

/**
 * Flat: a dial that is not the answer must do nothing a learner could see.
 *
 * At Explorer and Scientist a count is a clean number, so "nothing" means
 * under a bubble. At Analyst the counts carry their real scatter and the
 * learner takes a mean of three, so "nothing" means inside that spread —
 * which is the honest test, and the one the Analyst's own sprig needs:
 * it is set deliberately close to the crossing point so that the second
 * factor can take over, and a tenth of a bubble either way is not a finding.
 */
export function flatEnough(env: PondEnv, dial: Dial, band: 'explorer' | 'scientist' | 'analyst' = 'scientist'): boolean {
  const bound = band === 'analyst' ? spreadAt(solvePond(env).bubbles) : FLAT_MAX
  return swingOf(env, dial) < bound
}

export function movesEnough(env: PondEnv, dial: Dial): boolean {
  return swingOf(env, dial) >= MOVES_MIN
}

/* ------------------------------------------------------------------ */
/* The indicator tube                                                  */
/* ------------------------------------------------------------------ */

/**
 * The second tube: its own sprig in hydrogencarbonate indicator, no soda.
 * Baking soda in the tank would turn any indicator purple whatever the
 * plant did, which is why 6.1.9 gets a tube of its own (review 1).
 *
 * Purple = CO₂ taken out of the water (photosynthesis winning), red = the
 * two in balance, yellow = CO₂ given back (respiration winning, under cloth).
 */
export type IndicatorColour = 'purple' | 'red' | 'yellow'

export function indicatorColour(env: PondEnv): IndicatorColour {
  // The tube is its OWN sprig in indicator solution beside the tank: fixed
  // carbon, fixed bath, and only the lamp shared with the tank. It used to
  // inherit the tank's bath and soda too, so a sprig on a hot veranda turned
  // the tube yellow while the tank beside it was visibly bubbling under a
  // full lamp — an instrument contradicting the thing it is measuring. What
  // the statement asks it to read is light and dark; that is now all it reads.
  const solve = solvePond({ lampCm: env.lampCm, spoons: 1, bathC: ROOM_C, covered: env.covered })
  if (solve.net > 1.2) return 'purple'
  if (solve.net < -0.2) return 'yellow'
  return 'red'
}

export function indicatorSays(colour: IndicatorColour): string {
  if (colour === 'purple') return 'purple — the sprig is taking carbon dioxide out of the water faster than it puts any back'
  if (colour === 'yellow') return 'yellow — more carbon dioxide is going into the water than is coming out of it'
  return 'red — as it started: what goes in and what comes out are level'
}

/* ------------------------------------------------------------------ */
/* The patients                                                        */
/* ------------------------------------------------------------------ */

export interface PondPatient {
  id: string
  /** What the learner sees it called. */
  name: string
  /** Where it came from — one line, before anything is measured. */
  story: string
  /** The hidden setup. */
  setup: PondEnv
  /** Which plates the tank shows. */
  dials: Dial[]
  /** Whether the tank has the fourth plate: *nothing — it is at its ceiling*. */
  ceilingPlate?: boolean
  /** The answer. Never in the DOM before the accusation. */
  truth: Suspect
}

/**
 * Six sprigs. Each is set where the other factors are out of the way, so
 * that the flat nudges really are flat and the limiting one really moves —
 * a property of the setup, checked by the suite, not a trick in the round.
 */
export const PATIENTS: PondPatient[] = [
  {
    id: 'shady',
    name: 'the shady sprig',
    story: 'It came from under the bridge, where the water never sees much sun.',
    setup: { lampCm: 45, spoons: 2, bathC: ROOM_C },
    dials: ['lamp', 'soda'],
    truth: 'lamp',
  },
  {
    id: 'stuffy',
    name: 'the quiet sprig',
    story: 'It has been in this jar since yesterday, and nobody has changed the water.',
    setup: { lampCm: 15, spoons: 0, bathC: ROOM_C },
    dials: ['lamp', 'soda'],
    truth: 'soda',
  },
  {
    id: 'veranda',
    name: 'the veranda sprig',
    story: 'Somebody left this one out on the veranda all afternoon.',
    setup: { lampCm: 10, spoons: 3, bathC: 38 },
    dials: ['lamp', 'soda', 'bath'],
    truth: 'bath',
  },
  {
    id: 'patient-a',
    name: 'sprig A',
    story: 'Straight from the pond this morning, into water that has been standing.',
    setup: { lampCm: 15, spoons: 0, bathC: ROOM_C },
    dials: ['lamp', 'soda', 'bath'],
    truth: 'soda',
  },
  {
    id: 'patient-b',
    name: 'sprig B',
    story: 'This jar has been on the shelf at the back, away from the window.',
    setup: { lampCm: 45, spoons: 2, bathC: ROOM_C },
    dials: ['lamp', 'soda', 'bath'],
    truth: 'lamp',
  },
  {
    id: 'patient-c',
    name: 'sprig C',
    story: 'And this one spent the afternoon out on the veranda.',
    setup: { lampCm: 10, spoons: 3, bathC: 38 },
    dials: ['lamp', 'soda', 'bath'],
    truth: 'bath',
  },
  {
    id: 'the-ceiling',
    name: 'the last sprig',
    story: 'Standing water, and the lamp is where the last person left it.',
    setup: { lampCm: 20, spoons: 0, bathC: ROOM_C },
    dials: ['lamp', 'soda', 'bath'],
    ceilingPlate: true,
    truth: 'soda',
  },
  {
    id: 'at-its-best',
    name: 'the healthy sprig',
    story: 'Fresh water, fresh soda, and the lamp close. This one came out of the pond an hour ago.',
    setup: { lampCm: 10, spoons: 3, bathC: ROOM_C },
    dials: ['lamp', 'soda', 'bath'],
    ceilingPlate: true,
    truth: 'none',
  },
]

export const PATIENT_BY_ID: Record<string, PondPatient> = Object.fromEntries(PATIENTS.map((p) => [p.id, p]))

/* ------------------------------------------------------------------ */
/* The accusation                                                      */
/* ------------------------------------------------------------------ */

/** One count in the learner's log. */
export interface PondCount {
  /** What the learner had just done, in their own words: "brighter", "a spoon". */
  did: string
  /**
   * The direction the learner committed to before this nudge, and whether the
   * count went that way. A prediction the game throws away is a toll booth;
   * this is the row that makes calling it *same* — the round's actual skill —
   * worth something.
   */
  called?: { guess: 'up' | 'same' | 'down'; right: boolean }
  /** The dial that was nudged, when one was — for the confounding check. */
  dial: Dial | null
  env: PondEnv
  bubbles: number
  /** More than one dial moved since the last count: not evidence for either. */
  confounded: boolean
}

/**
 * A plate cannot be accused until every dial on the tank has been tried
 * (review 1). This makes the strange result a guarantee rather than luck,
 * and makes ruling-out — not guessing — the thing the economy term rewards.
 */
export function canAccuse(patient: PondPatient, log: PondCount[]): boolean {
  return patient.dials.every((d) => log.some((c) => c.dial === d && !c.confounded))
}

/** The dials still untried — Ploob's nudge when the learner reaches for a plate too early. */
export function untried(patient: PondPatient, log: PondCount[]): Dial[] {
  return patient.dials.filter((d) => !log.some((c) => c.dial === d && !c.confounded))
}

/**
 * Accuracy also requires the accused dial's own jump to be in the log: a
 * learner who names the right plate having never seen it move has guessed.
 * For `none` — the Analyst's fourth plate — the evidence is the opposite:
 * every dial tried, and none of them moved anything.
 */
export function hasEvidenceFor(patient: PondPatient, accused: Suspect, log: PondCount[]): boolean {
  if (accused === 'none') {
    // Every dial tried, and not one of the counts went up by a jump.
    const tried = patient.dials.every((d) => log.some((c) => c.dial === d && !c.confounded))
    return tried && !jumps(log).some((j) => j.up)
  }
  // The jump has to be one the learner WATCHED. This used to ask the model
  // whether the accused dial *would* move the count from where it stood —
  // which credited a learner with a jump they never saw, and refused one they
  // did see under a cloth (where the model's swing is zero). The log is the
  // evidence; the model is not a witness.
  return jumps(log).some((j) => j.dial === accused && j.up)
}

/** Whether a committed direction matched what the count did. */
export function calledIt(guess: 'up' | 'same' | 'down', delta: number): boolean {
  if (guess === 'same') return Math.abs(delta) < FLAT_MAX
  return guess === 'up' ? delta >= FLAT_MAX : delta <= -FLAT_MAX
}

/** Consecutive pairs of counts that differ by one dial and nothing else. */
function jumps(log: PondCount[]): Array<{ dial: Dial; delta: number; up: boolean }> {
  const out: Array<{ dial: Dial; delta: number; up: boolean }> = []
  for (let i = 1; i < log.length; i += 1) {
    const c = log[i]
    if (!c.dial || c.confounded) continue
    const delta = c.bubbles - log[i - 1].bubbles
    out.push({ dial: c.dial, delta, up: delta >= MOVES_MIN })
  }
  return out
}

export interface Verdict {
  right: boolean
  /** The plates, in the order they flip: the accused first. */
  plates: Array<{ dial: Suspect; reads: string }>
  /** What the round says, from the learner's own counts — never a lecture. */
  line: string
  /** Whether the hand-in may stamp: right, explained, and evidenced. */
  stamps: boolean
}

function plateReads(env: PondEnv, dial: Suspect): string {
  if (dial === 'lamp') return `${env.lampCm} cm`
  if (dial === 'soda') return env.spoons === 1 ? '1 spoon' : `${env.spoons} spoons`
  if (dial === 'bath') return `${env.bathC} °C`
  // Not "nothing is limiting it" — that is never true of a living plant, and
  // a learner told it here has to unlearn it a year later. What the plate
  // means is that this bench has nothing left to give.
  return 'nothing more on this bench'
}

/**
 * The reveal. A wrong accusation is honest information, never a game over:
 * the plates flip anyway and the round explains itself out of the counts the
 * learner already took.
 */
export function verdictOf(patient: PondPatient, accused: Suspect, log: PondCount[]): Verdict {
  const right = accused === patient.truth
  const order: Suspect[] = [accused, ...patient.dials.filter((d) => d !== accused)]
  const plates = order.map((d) => ({ dial: d, reads: plateReads(patient.setup, d) }))
  const first = log[0]?.bubbles ?? bubblesPerMinute(patient.setup)
  const best = log.reduce((m, c) => Math.max(m, c.bubbles), first)
  const evidence = hasEvidenceFor(patient, accused, log)
  let line: string
  const lastCount = log.length ? log[log.length - 1].bubbles : first
  if (right && patient.truth === 'none') {
    line = `Nothing you could change made it faster. ${first} a minute when you found it, ${lastCount} a minute once you had tried every dial — this one is already getting as much as the bench can give it.`
  } else if (right) {
    line = `You said it before the plates did: ${first} a minute to ${best}, and only one dial did that.`
  } else if (accused === 'none') {
    line = `Something did move it — ${first} a minute to ${best}. Look at the step that moved.`
  } else {
    line = `The ${accused === 'lamp' ? 'lamp' : accused === 'soda' ? 'baking soda' : 'bath'} was already where it needed to be — your own count said so. Look at the step that moved.`
  }
  return { right, plates, line, stamps: right && evidence }
}

/* ------------------------------------------------------------------ */
/* What the learner reads afterwards                                   */
/* ------------------------------------------------------------------ */

/** The rise, as the band says it. A bubble count — never "photosynthesis". */
export function riseLine(first: number, best: number, band: 'explorer' | 'scientist' | 'analyst'): string {
  if (first <= 0) return `${best} bubbles a minute`
  const times = best / first
  if (band === 'explorer') {
    // `Math.round` printed "nearly 3×" for two and a half times, which is
    // both wrong and a bad habit to model for the youngest band.
    const whole = Math.floor(times)
    if (times >= 2) return `${first} → ${best} bubbles a minute — more than ${whole === 1 ? 'twice' : `${whole}×`} as many`
    return `${first} → ${best} bubbles a minute — up by a ${times > 1.4 ? 'half' : 'bit'}`
  }
  // To the nearest ten per cent. These are counts of a few dozen bubbles with
  // a spread of their own; "+275 %" is the false precision this cabinet
  // exists to argue against.
  const pct = Math.round(((times - 1) * 100) / 10) * 10
  return `${first} → ${best} bubbles a minute — about ${pct >= 0 ? '' : ''}${pct} % ${pct < 0 ? 'fewer' : 'more'}`
}

/** The Explorer's names for the two halves of a chloroplast. Sugar is cooked. */
export const CHLORO_NAMES = {
  explorer: { light: 'the sun side', dark: 'the kitchen side' },
  scientist: { light: 'the light reactions', dark: 'the cycle that builds sugar' },
  analyst: { light: 'the grana', dark: 'the stroma' },
} as const

/** How the look inside is lit — by the TRUTH, never by the accusation. */
export type ChloroLight = 'stalled' | 'dim' | 'slow' | 'full'

export function chloroLightFor(truth: Suspect): ChloroLight {
  if (truth === 'soda') return 'stalled'
  if (truth === 'lamp') return 'dim'
  if (truth === 'bath') return 'slow'
  return 'full'
}

export function insideSays(truth: Suspect, band: 'explorer' | 'scientist' | 'analyst'): string {
  const n = CHLORO_NAMES[band]
  if (truth === 'soda') return `${n.light} is charged and waiting. ${n.dark} has nothing to build with.`
  if (truth === 'lamp') return `${n.light} is barely working — nothing is arriving. ${n.dark} is waiting for it.`
  if (truth === 'bath') return `Both sides are crawling. It is not what is arriving — it is the heat.`
  return `Both sides are working as fast as this sprig can.`
}

/**
 * The conditions the Factory's own leaf is put into for the look inside.
 *
 * Not a special animation: the chloroplast stage already runs off `sim.solve`,
 * so the honest way to show a carbon-starved chloroplast is to starve one of
 * carbon and let the same model draw it — the membrane keeps flashing while
 * the cycle stalls, because that is what the model says happens. Six seconds,
 * then the room is put back exactly as it was.
 */
export function insideWorld(truth: Suspect): { light: number; co2: number; tempC: number } {
  if (truth === 'soda') return { light: 0.92, co2: 0.02, tempC: 25 }
  if (truth === 'lamp') return { light: 0.06, co2: 0.5, tempC: 25 }
  if (truth === 'bath') return { light: 0.8, co2: 0.5, tempC: 41 }
  return { light: 0.85, co2: 0.55, tempC: 25 }
}

/* ------------------------------------------------------------------ */
/* A run: which sprigs a level puts on the bench                       */
/* ------------------------------------------------------------------ */

/** A small deterministic shuffle, so a seed picks the order and nothing else. */
function pick<T>(items: T[], seed: number): T {
  return items[Math.abs(Math.round(seed)) % items.length]
}

/**
 * The sprigs a level works through, from its seed.
 *
 * The Explorer meets two: one of the first pair (so a replay is a different
 * mystery) and then the veranda sprig, which is the one that adds the bath —
 * 6.1.8 wants all three factors varied, and only after both sprigs have they
 * been. The Scientist gets Selorm's three patients in order. The Analyst gets
 * one sprig with a ceiling and a takeover, and on some seeds the sprig where
 * the honest answer is *nothing at all*.
 */
export function sprigsFor(levelId: string, seed: number): PondPatient[] {
  if (levelId === 'why-so-quiet') {
    return [pick([PATIENT_BY_ID['shady'], PATIENT_BY_ID['stuffy']], seed), PATIENT_BY_ID['veranda']]
  }
  if (levelId === 'three-patients') {
    return [PATIENT_BY_ID['patient-a'], PATIENT_BY_ID['patient-b'], PATIENT_BY_ID['patient-c']]
  }
  if (levelId === 'the-ceiling') {
    return [pick([PATIENT_BY_ID['the-ceiling'], PATIENT_BY_ID['the-ceiling'], PATIENT_BY_ID['at-its-best']], seed)]
  }
  return [PATIENT_BY_ID['stuffy']]
}

/**
 * The economy floor: you cannot accuse a plate until every dial has been
 * tried, so the fewest honest counts is one for the sprig as found plus one
 * per suspect. Ruling out is the game — this is what makes it score.
 */
export function countFloor(patient: PondPatient): number {
  return patient.dials.length + 1
}

/** What the kit pays for, per band. A count spends a minute; a nudge spends kit. */
export const POND_KIT: Record<'explorer' | 'scientist' | 'analyst', { minutes: number; spoons: number; jugs: number }> = {
  explorer: { minutes: 6, spoons: 3, jugs: 2 },
  scientist: { minutes: 8, spoons: 3, jugs: 3 },
  analyst: { minutes: 20, spoons: 4, jugs: 4 },
}

/**
 * A round's whole grant.
 *
 * The bench is refilled for each sprig — every patient gets the band's kit,
 * because a mystery you cannot afford to finish is not a mystery — so the
 * grant the challenge hands over is that kit times the number of sprigs the
 * level sets. Each count spends a minute of both, which is what lets thrift
 * be scored across the round while the bench stays the same size at every
 * tank.
 */
export function pondBudgetFor(levelId: string, band: 'explorer' | 'scientist' | 'analyst'): { minutes: number; spoons: number; jugs: number } {
  const k = POND_KIT[band]
  const n = Math.max(1, sprigsFor(levelId, 0).length)
  return { minutes: k.minutes * n, spoons: k.spoons * n, jugs: k.jugs * n }
}

/**
 * What "few enough counts" means at a tank, for the challenge spine.
 *
 * The spine's default is a lab round's: one measurement is perfect play and
 * six is wasteful. At a tank one count is not even legal — no plate can be
 * accused until every dial has been tried — so under the default every Pond
 * level scored zero economy however well it was played, which is the
 * scoreboard punishing the discipline the round exists to teach.
 *
 * `minTrials` is the honest floor: one count as found plus one per suspect,
 * for every sprig the level sets (and three times over at Analyst, where the
 * counter is noisy and the brief asks for repeats). `floor` is the whole
 * grant: spend every minute you were given and the economy term is spent too.
 */
export function pondTrialsFor(levelId: string, band: 'explorer' | 'scientist' | 'analyst'): { minTrials: number; floor: number } {
  const sprigs = sprigsFor(levelId, 0)
  const repeats = band === 'analyst' ? 3 : 1
  const minTrials = sprigs.reduce((n, p) => n + countFloor(p) * repeats, 0)
  const floor = pondBudgetFor(levelId, band).minutes
  return { minTrials, floor: Math.max(minTrials + 2, floor) }
}

/** Moving the lamp is free — it is just a lamp on a rail. */
export function costOf(dial: Dial): { spoons: number; jugs: number } {
  if (dial === 'soda') return { spoons: 1, jugs: 0 }
  if (dial === 'bath') return { spoons: 0, jugs: 1 }
  return { spoons: 0, jugs: 0 }
}

/**
 * Two dials moved since the last count: that count is evidence for neither,
 * and Ploob says so rather than letting it into the log as proof.
 */
export function confounded(since: Dial[]): boolean {
  return new Set(since).size > 1
}

/* ------------------------------------------------------------------ */
/* What Ploob says — reacting, never lecturing                          */
/* ------------------------------------------------------------------ */

const DIAL_WORDS: Record<Dial, string> = { lamp: 'the lamp', soda: 'the baking soda', bath: 'the bath' }

/**
 * Ploob's line at the tank, from the counts and nothing else.
 *
 * The rule the Game Grammar now carries, and the browser suite checks: react
 * to the reading, ask the next question, never state the rule the world is
 * about to show, and never draw the inference. "Huh." is allowed. "So it
 * wasn't short of light" is the learner's line, not his — and the words
 * *limiting*, *factor* and *rate* appear nowhere in the lab.
 */
export function pondLine(log: PondCount[], canAccuseNow: boolean, untriedDials: Dial[]): string {
  if (log.length === 0) return 'That tank should be fizzing. It is not — and the labels have fallen off the dials. Count a minute first, so we know where we are starting.'
  const last = log[log.length - 1]
  const prev = log.length >= 2 ? log[log.length - 2] : null
  if (last.confounded) return 'Two things changed between those counts — which one did it? That one proves nothing either way.'
  if (!prev) return `${last.bubbles} a minute. Now change one thing and see.`
  const d = last.bubbles - prev.bubbles
  const rest = untriedDials.map((x) => DIAL_WORDS[x]).join(' and ')
  if (Math.abs(d) < 1.5) return `${last.bubbles} again. Huh. ${untriedDials.length ? 'What else could you try?' : 'And that is all of them tried.'}`
  if (d > 0) return `${last.bubbles}! Now that moved. ${canAccuseNow ? 'Ready to name one?' : `Try ${rest} too, so we are sure.`}`
  return `Down to ${last.bubbles}. That went the wrong way — worth knowing.`
}
