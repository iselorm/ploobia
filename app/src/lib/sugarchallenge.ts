/**
 * The Sugar Line's challenges — and the economy behind them.
 *
 * The generic spine lives in `lib/challenge.ts` and knows nothing about
 * plants. This is the cabinet's half: what its resources are, what a gathered
 * photon is worth, what a trial costs, and which targets are worth setting.
 *
 * **The design argument, because it is the whole point of the feature.** An
 * arcade round that let you spray light and carbon at a plant under time
 * pressure would teach the exact habit the cabinet exists to break — the loop
 * is *change one thing, hold the rest still*. So the game does not touch the
 * trial. It sits in front of it and makes the inputs **scarce**:
 *
 *   gather  →  you bank light, carbon and water in a short round
 *   spend   →  the dials are now capped by what you banked, and each trial
 *              draws them down
 *   hit     →  you are scored on reaching a target, in few trials, cheaply
 *
 * A limiting factor stops being a sentence in a textbook and becomes the
 * reason you cannot turn the light up any further. That is the thing this
 * cabinet has always been trying to teach, and scarcity teaches it harder than
 * any explanation.
 *
 * Pure module — no React, no three, no browser. Checked by
 * `verify-challenge.mjs`.
 */

import { CO2_AMBIENT_PPM, CO2_MAX_PPM, PAR_FULL_SUN } from './ratelab'
import { MEASURES, type MeasureId, type SugarSolve } from './sugarline'
import type { Challenge, ResourceBudget } from './challenge'
import type { Band } from './bands'
import type { BiomeId } from './leaves'
import type { DayTally } from './hatches'

/** The three things a plant is ever short of, in the units the cabinet shows. */
export type SugarResource = 'light' | 'co2' | 'water'

export const SUGAR_RESOURCES: Array<{
  id: SugarResource
  label: string
  /** Shown on the bank readout. */
  unit: string
  tint: string
}> = [
  { id: 'light', label: 'Light', unit: 'µmol', tint: '#E8A33D' },
  { id: 'co2', label: 'Carbon', unit: 'ppm', tint: '#6C7480' },
  { id: 'water', label: 'Water', unit: '%', tint: '#2E6DA8' },
]

/* ------------------------------------------------------------------ */
/* What a banked resource buys                                         */
/* ------------------------------------------------------------------ */

/**
 * The ceiling each dial may reach, given what was **gathered**.
 *
 * This is where scarcity becomes physical. Bank 1000 µmol and the light dial
 * simply stops at half — not greyed out with an explanation, just *stops*, at
 * the place your gathering ran out. A learner who wants more light has to go
 * and get more light, which is a truer account of a plant's day than any
 * amount of text.
 *
 * Note the word *gathered*: this is passed the grant, not the running balance.
 * A ceiling that fell as the bank drained would mean the second reading of a
 * comparison could not be taken at the same intensity as the first — the
 * cabinet would be forbidding the one move it spends all its time teaching.
 * How bright you may go is what you caught; how many times is what is left.
 *
 * Ambient CO₂ and a damp soil are free, because they are free to a real plant.
 * You bank the amount *above* ambient — the enrichment, which is the thing a
 * grower actually pays for.
 */
export function capsFor(budget: ResourceBudget): {
  light: number
  co2ppm: number
  water: number
} {
  const light = clamp01((budget.light ?? 0) / PAR_FULL_SUN)
  const co2ppm = Math.min(CO2_MAX_PPM, CO2_AMBIENT_PPM + Math.max(0, budget.co2 ?? 0))
  const water = clamp01(BASE_SOIL_WATER + (budget.water ?? 0) / 100)
  return { light, co2ppm, water }
}

/** Soil a challenge starts with before any watering. Dry enough to matter. */
export const BASE_SOIL_WATER = 0.35

/* ------------------------------------------------------------------ */
/* What a trial costs                                                  */
/* ------------------------------------------------------------------ */

export interface TrialConditions {
  /** 0–1 on the light dial. */
  light: number
  /**
   * 0–1 on the CO₂ dial, in the cabinet's own normalised units — that is,
   * `sim.co2`, which the sim reads as `co2 * CO2_MAX_PPM`. The mapping is
   * copied from `SUGAR_VARS.co2` rather than invented here, because a cost
   * computed on a different scale from the dial would cap the learner at a
   * number that is not the number they are looking at.
   */
  co2: number
  night: boolean
}

/** The dial position, 0–1, that a ppm ceiling corresponds to. */
export function co2DialFor(ppm: number): number {
  return clamp01(ppm / CO2_MAX_PPM)
}

/**
 * What one recorded trial draws out of the bank.
 *
 * Running bright is expensive and running dark is cheap, which is the whole
 * trade. Enrichment costs only what is *above* ambient, so a learner who
 * leaves CO₂ alone spends nothing on it — and discovers that on a
 * light-limited plant, that was the right call. Night costs no light, which is
 * not a special case but the same rule: no photons arrive, so none are spent.
 */
export function trialCost(c: TrialConditions): ResourceBudget {
  const light = c.night ? 0 : Math.max(0, c.light) * PAR_FULL_SUN
  const ppm = Math.max(0, c.co2) * CO2_MAX_PPM
  const co2 = Math.max(0, ppm - CO2_AMBIENT_PPM)
  return { light: round2(light * TRIAL_SHARE), co2: round2(co2 * TRIAL_SHARE), water: 0 }
}

/**
 * What fraction of a full-strength grant one trial at full strength consumes.
 *
 * This constant exists because the budget has to do two different jobs, and at
 * first it did them both badly. `capsFor` reads it as *how bright you may go*,
 * and `trialCost` reads it as *how much you may burn* — so with a trial priced
 * at the raw dial value, gathering enough light to reach the ceiling bought
 * you exactly one trial at that ceiling, and the second reading of a
 * two-reading comparison was unaffordable by construction. A cabinet whose
 * whole subject is "change one thing and measure again" cannot price its own
 * loop out of reach.
 *
 * A third means three trials at full blast, or five or six run sensibly dim —
 * which lines up with the six-trial floor the scoring already uses.
 */
export const TRIAL_SHARE = 1 / 3

/** How much soil water one pour adds, in the percentage points the dial shows. */
export const WATER_PER_POUR = 12

/**
 * What that pour draws out of the bank.
 *
 * The same rule as a trial, for the same reason: the grant sets how wet the pot
 * may get, and each use costs a share of it. Pricing a pour at the full 12
 * would mean a drought brief granting 8 could not be watered even once, which
 * is not scarcity — it is a control that does nothing.
 */
export const POUR_DRAW = round2(WATER_PER_POUR * TRIAL_SHARE)

/* The budget arithmetic moved to `lib/challenge.ts` when the Motion Yard
   needed the same three functions — a joule and a photon come off a bank
   identically. Re-exported here so nothing that already imports them from the
   cabinet's own module has to care. */
export { canAfford, drawDown, spentSoFar } from './challenge'

/* ------------------------------------------------------------------ */
/* Reading the goal off the model                                      */
/* ------------------------------------------------------------------ */

/**
 * Every goal metric is something the cabinet already measures and displays.
 *
 * Deliberately not a new set of game numbers: a score built on a quantity the
 * instruments do not show would be a second, invisible model, and the learner
 * would have no way to reason about it.
 */
export function metricValue(solve: SugarSolve, metric: string): number {
  const m = MEASURES[metric as MeasureId]
  return m ? m.read(solve) : 0
}

/**
 * The day's metrics, read off a finished (or running) day rather than a
 * solve. `sugarDay` is the whole-plant production integrated over the run —
 * the same mg h⁻¹ the plant stage shows, summed; `mgPerMl` is that over the
 * water the stomata let out. Both are on the day HUD the whole time.
 */
export const DAY_METRICS: Record<string, { label: string; unit: string; read: (t: DayTally) => number }> = {
  sugarDay: { label: 'Sugar banked', unit: 'mg', read: (t) => t.sugarMg },
  mgPerMl: { label: 'Sugar per water', unit: 'mg mL⁻¹', read: (t) => t.mgPerMl },
}

export function dayMetricValue(tally: DayTally, metric: string): number {
  return DAY_METRICS[metric]?.read(tally) ?? 0
}

export function metricUnit(metric: string): string {
  return MEASURES[metric as MeasureId]?.unit ?? DAY_METRICS[metric]?.unit ?? ''
}

export function metricLabel(metric: string): string {
  return MEASURES[metric as MeasureId]?.label ?? DAY_METRICS[metric]?.label ?? metric
}

/** The day a keep-round challenge asks for, read off its `world` ("desert:24"). */
export function dayWorldOf(c: Challenge): { habitat: BiomeId; hours: number } {
  const [h, n] = (c.world ?? '').split(':')
  const habitat = (['rainforest', 'temperate', 'savanna', 'desert', 'boreal'] as BiomeId[]).includes(h as BiomeId)
    ? (h as BiomeId)
    : 'temperate'
  const hours = Number(n)
  return { habitat, hours: Number.isFinite(hours) && hours > 0 ? hours : 12 }
}

/** The one condition a Sugar Line challenge can ask for, in the learner's words. */
export const CONDITIONS: Record<string, { label: string; met: (t: DayTally) => boolean }> = {
  leafFirm: { label: 'leaf firm at the end', met: (t) => t.leafFirm },
}

/* ------------------------------------------------------------------ */
/* The challenges themselves                                           */
/* ------------------------------------------------------------------ */

export interface SugarChallengePreset {
  id: string
  title: string
  /** The brief, in the learner's language. */
  brief: string
  band: Band
  /**
   * Where this sits on the campaign map, when it does. Stage 1 is the leaf —
   * *The Factory* — and its three levels are the three bands, so a learner's
   * band picks their level and the stage is never built three times. Presets
   * with no level are the extra briefs offered under "other challenges".
   */
  stage?: 1 | 2
  level?: 1 | 2 | 3
  build: (seed: number) => Challenge
  /**
   * For a `keep` round: how the day is scripted. The habitat the weather
   * comes from, and how many plant hours it runs (12 = dawn to dusk; 24 = a
   * day and the night after). Absent for a gather round.
   */
  day?: { habitat: BiomeId; hours: number }
}

/** The campaign stage a preset belongs to, for the brief's eyebrow. */
export const STAGE_NAMES: Record<1 | 2, string> = { 1: 'The Factory', 2: 'The Hatches' }

const CABINET = 'photosynthesis'

function make(over: Partial<Challenge> & { seed: number }): Challenge {
  return {
    v: 1,
    cabinet: CABINET,
    setup: 'bean',
    band: 'scientist',
    gatherSeconds: 40,
    goal: { metric: 'export', direction: 'atLeast', target: 14, tolerance: 0.4, unit: 'mg h⁻¹' },
    budget: { light: 1400, co2: 300, water: 40 },
    ...over,
  }
}

/**
 * Three shapes, and each teaches something the others cannot.
 *
 * `atLeast` is the obvious one and the weakest: it rewards pushing every dial
 * up. `near` is the one that makes a learner reason — you cannot land on 12.0
 * by maximising, you have to know which dial moves the number and by how much.
 * `atMost` on a *cost* turns the whole thing around and asks for efficiency.
 */
export const SUGAR_CHALLENGES: SugarChallengePreset[] = [
  {
    id: 'first-light',
    title: 'First light',
    brief:
      'Gather what you can, then get sugar leaving the leaf at 10 mg per hour or better. Light is the obvious lever — check whether it is the only one.',
    band: 'explorer',
    stage: 1,
    level: 1,
    build: (seed) =>
      make({
        seed,
        band: 'explorer',
        gatherSeconds: 45,
        goal: { metric: 'export', direction: 'atLeast', target: 10, tolerance: 0.4, unit: 'mg h⁻¹' },
        budget: { light: 1200, co2: 150, water: 45 },
      }),
  },
  {
    id: 'land-it',
    title: 'Find the ceiling',
    brief:
      'Land 12.0 mg per hour, give or take 0.4. Turning everything up overshoots — you have to know which dial moves it and by how much, and watch the light curve flatten as you go.',
    band: 'scientist',
    stage: 1,
    level: 2,
    build: (seed) =>
      make({
        seed,
        gatherSeconds: 40,
        goal: { metric: 'export', direction: 'near', target: 12, tolerance: 0.4, unit: 'mg h⁻¹' },
        budget: { light: 1500, co2: 350, water: 40 },
      }),
  },
  {
    id: 'balance-books',
    title: 'Balance the books',
    brief:
      'Land net carbon gain within 0.5 of 12 mg per hour. The plant burns sugar all day and all night — respiration doubles for every 10 °C — so the books only balance in its favour where production outruns the burn.',
    band: 'analyst',
    stage: 1,
    level: 3,
    build: (seed) =>
      make({
        seed,
        band: 'analyst',
        gatherSeconds: 40,
        goal: { metric: 'gain', direction: 'near', target: 12, tolerance: 0.5, unit: 'mg h⁻¹' },
        budget: { light: 1500, co2: 350, water: 40 },
      }),
  },
  /* ---- Stage 2 · The Hatches — keep it alive --------------------------- */
  {
    id: 'open-the-hatches',
    title: 'Open the hatches',
    brief:
      'A whole day plays out in ninety seconds. Hold one slider — how far the hatches may open. Open, and carbon comes in and sugar gets made; but water leaves the same way, and a leaf that runs dry goes limp and stops. Bank 100 mg by dusk with the leaf still firm.',
    band: 'explorer',
    stage: 2,
    level: 1,
    day: { habitat: 'temperate', hours: 12 },
    build: (seed) =>
      make({
        seed,
        band: 'explorer',
        loop: 'keep',
        condition: 'leafFirm',
        gatherSeconds: 0,
        world: 'temperate:12',
        goal: { metric: 'sugarDay', direction: 'atLeast', target: 100, tolerance: 2, unit: 'mg' },
        // The water on offer: what a wide-open leaf would lose on this day.
        // Thrift is measured against it, and set per seed in `dayBudget`.
        budget: { water: 66 },
      }),
  },
  {
    id: 'harmattan',
    title: 'The Harmattan',
    brief:
      'Maize, in the savanna, on a Harmattan day: the air is bone dry from mid-morning and the pot is all the water there is. Bank 730 mg by dusk and keep the leaf firm — the dry air has a name now (vapour-pressure deficit), and the plant will close its own hatches before you do.',
    band: 'scientist',
    stage: 2,
    level: 2,
    day: { habitat: 'savanna', hours: 12 },
    build: (seed) =>
      make({
        seed,
        setup: 'maize',
        band: 'scientist',
        loop: 'keep',
        condition: 'leafFirm',
        gatherSeconds: 0,
        world: 'savanna:12',
        goal: { metric: 'sugarDay', direction: 'atLeast', target: 730, tolerance: 5, unit: 'mg' },
        budget: { water: 150 },
      }),
  },
  {
    id: 'desert-night',
    title: 'Night shift, cactus rules',
    brief:
      'A bean in a hot desert for a day and the night after. Keep it standing and bank 30 mg — then look at what the prickly pear did with the same day. It opens its hatches only at night, when the air has stopped pulling; the bean cannot. Say why that matters, in two lines, on the numbers.',
    band: 'analyst',
    stage: 2,
    level: 3,
    day: { habitat: 'desert', hours: 24 },
    build: (seed) =>
      make({
        seed,
        band: 'analyst',
        loop: 'keep',
        condition: 'leafFirm',
        gatherSeconds: 0,
        world: 'desert:24',
        goal: { metric: 'sugarDay', direction: 'atLeast', target: 30, tolerance: 1, unit: 'mg' },
        budget: { water: 99 },
      }),
  },

  {
    id: 'thin-air',
    title: 'Thin air',
    brief:
      'A poor carbon day: almost none to gather. Get to 12 mg per hour anyway, and find out what actually limits the line when the air is thin.',
    band: 'scientist',
    build: (seed) =>
      make({
        seed,
        gatherSeconds: 40,
        goal: { metric: 'export', direction: 'atLeast', target: 12, tolerance: 0.4, unit: 'mg h⁻¹' },
        budget: { light: 1800, co2: 40, water: 45 },
      }),
  },
  {
    id: 'drought',
    title: 'The dry week',
    brief:
      'Barely any water in the bank. Keep the line moving at 10 mg per hour — and notice that light you cannot use is light you wasted.',
    band: 'scientist',
    build: (seed) =>
      make({
        seed,
        gatherSeconds: 45,
        goal: { metric: 'export', direction: 'atLeast', target: 10, tolerance: 0.4, unit: 'mg h⁻¹' },
        budget: { light: 1600, co2: 300, water: 12 },
      }),
  },
  {
    id: 'fast-line',
    title: 'Run the line fast',
    brief:
      'Get the sap itself moving at 1.1 metres per hour. Export rate and translocation speed are not the same number — this is where you find out why.',
    band: 'analyst',
    build: (seed) =>
      make({
        seed,
        band: 'analyst',
        gatherSeconds: 40,
        goal: { metric: 'velocity', direction: 'atLeast', target: 1.1, tolerance: 0.05, unit: 'm h⁻¹' },
        budget: { light: 1500, co2: 400, water: 45 },
      }),
  },
  {
    id: 'maize-match',
    title: 'Match the maize',
    brief:
      'A C4 plant on the same budget. Land net carbon gain within 0.5 of 18 mg per hour — the pathway changes the arithmetic.',
    band: 'analyst',
    build: (seed) =>
      make({
        seed,
        setup: 'maize',
        band: 'analyst',
        gatherSeconds: 40,
        goal: { metric: 'gain', direction: 'near', target: 18, tolerance: 0.5, unit: 'mg h⁻¹' },
        budget: { light: 1500, co2: 250, water: 40 },
      }),
  },
]

export const SUGAR_CHALLENGE_BY_ID: Record<string, SugarChallengePreset> = Object.fromEntries(
  SUGAR_CHALLENGES.map((c) => [c.id, c]),
)

/** The ones offered at a band: this band's, plus anything easier. */
export function challengesForBand(band: Band): SugarChallengePreset[] {
  const order: Band[] = ['explorer', 'scientist', 'analyst']
  const ceiling = order.indexOf(band)
  return SUGAR_CHALLENGES.filter((c) => order.indexOf(c.band) <= ceiling)
}

/**
 * The one brief the band's *Play* door opens on.
 *
 * The stage-1 level for the band — this is what makes "Play" a single tap:
 * an Explorer never sees a list, and a Scientist sees their own level chosen
 * with the rest one link away. Falls back to the easiest thing offered so a
 * band with no level of its own still has a door.
 */
export function levelForBand(band: Band, stage: 1 | 2 = 1): SugarChallengePreset {
  const offered = challengesForBand(band)
  return (
    offered.find((c) => c.stage === stage && c.band === band) ??
    offered.find((c) => c.stage === stage) ??
    offered.find((c) => c.stage === 1 && c.band === band) ??
    offered[0]
  )
}

/**
 * Which preset a challenge is — for the campaign map, which keys progress by
 * preset id. A challenge that arrived by link does not carry its id, so it
 * is matched on the things a preset fixes: the plant, the goal, the loop and
 * the world. Two presets never share all four.
 */
export function presetIdFor(c: Challenge): string | undefined {
  return SUGAR_CHALLENGES.find((p) => {
    const b = p.build(c.seed)
    return (
      b.setup === c.setup &&
      b.goal.metric === c.goal.metric &&
      b.goal.direction === c.goal.direction &&
      b.goal.target === c.goal.target &&
      (b.loop ?? 'gather') === (c.loop ?? 'gather') &&
      (b.world ?? '') === (c.world ?? '') &&
      b.gatherSeconds === c.gatherSeconds &&
      // Two briefs can share a goal and differ only in what they offer —
      // First light and The dry week are the same target on a wet and a dry
      // budget — so the budget is part of the match.
      sameBudget(b.budget, c.budget)
    )
  })?.id
}

/** Key order is not part of a budget — a link writes them sorted. */
function sameBudget(a: ResourceBudget, b: ResourceBudget): boolean {
  const ka = Object.keys(a).sort()
  const kb = Object.keys(b).sort()
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && Math.abs(a[k] - b[k]) < 1e-6)
}

/** The campaign stage a preset sits on, or undefined for the extra briefs. */
export function stageOfPresetId(id: string): 1 | 2 | undefined {
  return SUGAR_CHALLENGE_BY_ID[id]?.stage
}

/** The presets of one campaign stage, in level order. */
export function levelsOfStage(stage: 1 | 2): SugarChallengePreset[] {
  return SUGAR_CHALLENGES.filter((c) => c.stage === stage).sort((a, b) => (a.level ?? 0) - (b.level ?? 0))
}

/* ------------------------------------------------------------------ */

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
