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

/** Subtract a cost from a bank, never below zero. */
export function drawDown(bank: ResourceBudget, cost: ResourceBudget): ResourceBudget {
  const out: ResourceBudget = { ...bank }
  for (const k of Object.keys(cost)) {
    out[k] = round2(Math.max(0, (out[k] ?? 0) - (cost[k] ?? 0)))
  }
  return out
}

/** Can this trial be afforded at all? A learner must be told before, not after. */
export function canAfford(bank: ResourceBudget, cost: ResourceBudget): boolean {
  return Object.keys(cost).every((k) => (bank[k] ?? 0) + 1e-6 >= (cost[k] ?? 0))
}

/** Total spent = what was banked minus what is left. */
export function spentSoFar(granted: ResourceBudget, remaining: ResourceBudget): ResourceBudget {
  const out: ResourceBudget = {}
  for (const k of Object.keys(granted)) {
    out[k] = round2(Math.max(0, (granted[k] ?? 0) - (remaining[k] ?? 0)))
  }
  return out
}

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

export function metricUnit(metric: string): string {
  return MEASURES[metric as MeasureId]?.unit ?? ''
}

export function metricLabel(metric: string): string {
  return MEASURES[metric as MeasureId]?.label ?? metric
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
  build: (seed: number) => Challenge
}

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
    title: 'Land it exactly',
    brief:
      'Hit 12.0 mg per hour, give or take 0.4. You cannot get there by turning everything up — you have to know which dial moves it and by how much.',
    band: 'scientist',
    build: (seed) =>
      make({
        seed,
        gatherSeconds: 40,
        goal: { metric: 'export', direction: 'near', target: 12, tolerance: 0.4, unit: 'mg h⁻¹' },
        budget: { light: 1500, co2: 350, water: 40 },
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

/* ------------------------------------------------------------------ */

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
