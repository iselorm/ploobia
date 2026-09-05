/**
 * The Motion Yard's challenges — and the economy behind them.
 *
 * The generic spine lives in `lib/challenge.ts` and knows nothing about
 * projectiles. This is the cabinet's half, and it is the second one written,
 * which is the test that matters: if the spine needed changing to take it, the
 * spine was not general.
 *
 * **Why energy, and why one resource.** The Sugar Line banks three things
 * because a plant is short of three things. A launcher is short of exactly
 * one: **energy**. You bank joules, and every action spends the energy it
 * really costs —
 *
 *   a shot   ½ m v²    — quadratic in speed, linear in mass
 *   a lift   m g h     — cheaper on the Moon, dearer on Jupiter
 *   a roll   ½ m v²    — the same rule as a shot, just smaller
 *
 * That single choice does more teaching than the rest of the cabinet's copy
 * put together, because of the square. A learner who wants twice the range
 * does not pay twice — they pay **four times**, and they find that out by
 * running out of joules rather than by being told. Halving the ball's mass at
 * the same energy does not double the speed either; it multiplies it by √2.
 * These are the two facts about kinetic energy that survive an exam, and
 * scarcity is the only way I know to make a fifteen year old *feel* them.
 *
 * The mass trade goes the other way from the intuition, too: on a fixed energy
 * budget the **wooden** ball leaves faster than the steel one, because
 * v = √(2E/m). The cabinet already lets you swap them; now the swap costs
 * something and the learner has a reason to think about it.
 *
 * Pure module — no React, no three, no browser. Checked by
 * `verify-motionchallenge.mjs`.
 */

import type { Band } from './bands'
import type { Challenge, ResourceBudget } from './challenge'
import {
  DROP_MAX,
  DROP_MIN,
  MASS_BY_ID,
  PUSH_MAX,
  PUSH_MIN,
  type MassId,
  type MotionReading,
  type WorldId,
} from './motion'
import { ANGLE_MAX, ANGLE_MIN, LAUNCHER_BY_ID, launchSpeed, type LauncherId } from './yard'

/** The one thing a launcher is ever short of. */
export type MotionResource = 'energy'

export const MOTION_RESOURCES: Array<{
  id: MotionResource
  label: string
  unit: string
  tint: string
}> = [{ id: 'energy', label: 'Energy', unit: 'J', tint: '#C2703A' }]

/* ------------------------------------------------------------------ */
/* What things cost, in joules                                         */
/* ------------------------------------------------------------------ */

export function massKg(mass: MassId): number {
  return MASS_BY_ID[mass].grams / 1000
}

/** ½mv². The whole feature is downstream of this line. */
export function kineticEnergy(speed: number, mass: MassId): number {
  return 0.5 * massKg(mass) * Math.max(0, speed) ** 2
}

/** mgh — what it costs to lift the ball before you let go of it. */
export function liftEnergy(height: number, g: number, mass: MassId): number {
  return massKg(mass) * g * Math.max(0, height)
}

/**
 * What fraction of a full-strength grant one trial at full strength consumes.
 *
 * The same constant, and the same reason, as the Sugar Line's: the budget has
 * to say both *how hard you may go* and *how much you may burn*, and priced at
 * the raw value a full-power shot would cost the entire grant — leaving the
 * second shot of a two-shot comparison unaffordable by construction, in a
 * cabinet whose whole subject is firing again with one thing changed.
 */
export const TRIAL_SHARE = 1 / 3

export interface ShotConditions {
  kind: 'launch' | 'drop' | 'roll'
  mass: MassId
  g: number
  /** Launch only: the muzzle speed the dials produce, m/s. */
  speed?: number
  /** Drop only: metres. */
  height?: number
  /** Roll only: the push, m/s. */
  push?: number
}

/** What one recorded trial draws out of the bank. */
export function trialCost(c: ShotConditions): ResourceBudget {
  let joules = 0
  if (c.kind === 'launch') joules = kineticEnergy(c.speed ?? 0, c.mass)
  else if (c.kind === 'drop') joules = liftEnergy(c.height ?? 0, c.g, c.mass)
  else joules = kineticEnergy(c.push ?? 0, c.mass)
  return { energy: round3(joules * TRIAL_SHARE) }
}

/* ------------------------------------------------------------------ */
/* What a banked joule buys                                            */
/* ------------------------------------------------------------------ */

export interface DialCaps {
  /** Muzzle speed ceiling, m/s. */
  speed: number
  /** The power-dial ceiling for the launcher in use, in that dial's own units. */
  power: number
  /** Roll push ceiling, m/s. */
  push: number
  /** Drop height ceiling, m. */
  height: number
}

/**
 * The ceiling each dial may reach, given what was **granted**.
 *
 * Passed the grant and not the running balance, for the reason the Sugar Line
 * learned the hard way: a ceiling that fell as the bank drained would forbid
 * taking the second reading at the same setting as the first, which is the one
 * move the cabinet exists to teach. How hard you may go is what you banked;
 * how many times is what is left.
 *
 * Note that the answer depends on the ball and the planet. The same bank buys
 * a faster wooden ball than a steel one, and a taller drop on the Moon than on
 * Jupiter — because the physics says so, not because a table says so.
 */
export function capsFor(
  budget: ResourceBudget,
  ctx: { mass: MassId; g: number; launcher: LauncherId },
): DialCaps {
  const e = Math.max(0, budget.energy ?? 0)
  const m = massKg(ctx.mass)
  const vMax = Math.sqrt((2 * e) / m)
  return {
    speed: vMax,
    power: powerForSpeed(ctx.launcher, vMax, ctx.g, ctx.mass),
    push: clamp(vMax, 0, PUSH_MAX),
    height: clamp(e / (m * Math.max(0.01, ctx.g)), 0, DROP_MAX),
  }
}

/**
 * The power-dial setting that produces a given muzzle speed.
 *
 * Found by bisection against the cabinet's own `launchSpeed`, rather than by
 * inverting each launcher's formula here. Three formulas written out a second
 * time would be three chances for the ceiling to stop matching the dial, and
 * the Sugar Line already shipped exactly that bug once — a cost computed on a
 * different scale from the control it was capping. The trebuchet is the reason
 * this matters most: its speed depends on gravity, so its dial ceiling has to
 * as well, and it is the formula most likely to change again.
 */
export function powerForSpeed(
  launcher: LauncherId,
  speed: number,
  g: number,
  mass: MassId,
): number {
  const { min, max } = LAUNCHER_BY_ID[launcher].power
  const kg = massKg(mass)
  const at = (p: number) => launchSpeed(launcher, p, g, kg)
  if (at(min) >= speed) return min
  if (at(max) <= speed) return max
  let lo = min
  let hi = max
  // Every launcher is monotonic in power, so forty halvings land well inside
  // the smallest step any of the dials offers.
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (at(mid) < speed) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/* ------------------------------------------------------------------ */
/* Reading the goal off a recorded trial                               */
/* ------------------------------------------------------------------ */

export type MotionMetricId = 'range' | 'tof' | 'speed' | 'fall' | 'rollTime'

export interface MotionMeasureMeta {
  id: MotionMetricId
  label: string
  unit: string
  /** Which kind of trial can answer this at all. */
  kind: MotionReading['kind']
  read: (r: MotionReading) => number | null
  decimals: number
}

/**
 * The Motion Yard had no registry of what it measures — units were string
 * literals scattered through three HUD files. A challenge cannot state a goal
 * in a unit nothing agrees on, so this is that registry, and every entry is a
 * quantity the cabinet already puts on screen.
 */
export const MOTION_MEASURES: Record<MotionMetricId, MotionMeasureMeta> = {
  range: {
    id: 'range',
    label: 'Range',
    unit: 'm',
    kind: 'launch',
    read: (r) => (r.kind === 'launch' ? r.x : null),
    decimals: 2,
  },
  tof: {
    id: 'tof',
    label: 'Time of flight',
    unit: 's',
    kind: 'launch',
    read: (r) => (r.kind === 'launch' ? r.t : null),
    decimals: 2,
  },
  speed: {
    id: 'speed',
    label: 'Launch speed',
    unit: 'm s⁻¹',
    kind: 'launch',
    read: (r) => (r.kind === 'launch' ? (r.speed ?? null) : null),
    decimals: 2,
  },
  fall: {
    id: 'fall',
    label: 'Fall time',
    unit: 's',
    kind: 'drop',
    read: (r) => (r.kind === 'drop' || r.kind === 'trace' ? r.t : null),
    decimals: 3,
  },
  rollTime: {
    id: 'rollTime',
    label: 'Time to the marker',
    unit: 's',
    kind: 'roll',
    read: (r) => (r.kind === 'roll' ? r.t : null),
    decimals: 2,
  },
}

/** The value a reading offers for a goal, or null if it cannot answer it. */
export function metricValue(reading: MotionReading, metric: string): number | null {
  const m = MOTION_MEASURES[metric as MotionMetricId]
  return m ? m.read(reading) : null
}

export function metricUnit(metric: string): string {
  return MOTION_MEASURES[metric as MotionMetricId]?.unit ?? ''
}

export function metricLabel(metric: string): string {
  return MOTION_MEASURES[metric as MotionMetricId]?.label ?? metric
}

/* ------------------------------------------------------------------ */
/* The challenges themselves                                           */
/* ------------------------------------------------------------------ */

export interface MotionChallengePreset {
  id: string
  title: string
  brief: string
  band: Band
  /** The setup string encodes launcher, world and ball — see `parseSetup`. */
  build: (seed: number) => Challenge
}

const CABINET = 'motion'

/**
 * The setup is one string because `Challenge.setup` is one string, and the
 * spine must not grow a field for every cabinet that wants one. Packed and
 * parsed in one place so the link format has a single owner.
 */
export interface MotionSetup {
  launcher: LauncherId
  world: WorldId
  mass: MassId
}

export function packSetup(s: MotionSetup): string {
  return `${s.launcher}:${s.world}:${s.mass}`
}

export function parseSetup(text: string): MotionSetup {
  const [launcher, world, mass] = text.split(':')
  return {
    launcher: (LAUNCHER_BY_ID[launcher as LauncherId] ? launcher : 'slingshot') as LauncherId,
    world: (world || 'earth') as WorldId,
    mass: (mass === 'wood' ? 'wood' : 'steel') as MassId,
  }
}

function make(over: Partial<Challenge> & { seed: number }): Challenge {
  return {
    v: 1,
    cabinet: CABINET,
    setup: packSetup({ launcher: 'slingshot', world: 'earth', mass: 'steel' }),
    band: 'scientist',
    // The Motion Yard's arcade layer is a shooter, not a gatherer: a launcher
    // fires, so the game is the shot. There is no round in front of it — the
    // grant is the scarcity, which the spine has always allowed.
    gatherSeconds: 0,
    goal: { metric: 'range', direction: 'near', target: 6, tolerance: 0.3, unit: 'm' },
    budget: { energy: 8 },
    ...over,
  }
}

export const MOTION_CHALLENGES: MotionChallengePreset[] = [
  {
    id: 'first-shot',
    title: 'First shot',
    brief:
      'Land the ball within 0.3 m of the 6 m target. You have eight joules; every shot spends ½mv², so a wild first guess is expensive.',
    band: 'explorer',
    build: (seed) =>
      make({
        seed,
        band: 'explorer',
        goal: { metric: 'range', direction: 'near', target: 6, tolerance: 0.3, unit: 'm' },
        budget: { energy: 8 },
      }),
  },
  {
    id: 'square-law',
    title: 'The price of speed',
    brief:
      'Reach 9 m or better on a tight budget. Doubling the range does not cost twice as much — find out what it does cost, and how few shots you need to know.',
    band: 'scientist',
    build: (seed) =>
      make({
        seed,
        goal: { metric: 'range', direction: 'atLeast', target: 9, tolerance: 0.3, unit: 'm' },
        budget: { energy: 6 },
      }),
  },
  {
    id: 'wooden-ball',
    title: 'Lighter, faster',
    brief:
      'The same joules, a 20 g wooden ball. Land within 0.4 m of 11 m — and notice which way the mass swap moved the speed, because it is not the way most people guess.',
    band: 'scientist',
    build: (seed) =>
      make({
        seed,
        setup: packSetup({ launcher: 'slingshot', world: 'earth', mass: 'wood' }),
        goal: { metric: 'range', direction: 'near', target: 11, tolerance: 0.4, unit: 'm' },
        budget: { energy: 1.4 },
      }),
  },
  {
    id: 'hang-time',
    title: 'Keep it up',
    brief:
      'Get a full second and a half of flight. Range and time in the air are not the same target — the angle that wins one loses the other.',
    band: 'scientist',
    build: (seed) =>
      make({
        seed,
        goal: { metric: 'tof', direction: 'atLeast', target: 1.5, tolerance: 0.05, unit: 's' },
        budget: { energy: 8 },
      }),
  },
  {
    id: 'moon-shot',
    title: 'Moon shot',
    brief:
      'One sixth of Earth’s gravity, and the same slingshot. Land within 0.6 m of 24 m. The launcher has not changed — work out what has.',
    band: 'analyst',
    build: (seed) =>
      make({
        seed,
        band: 'analyst',
        setup: packSetup({ launcher: 'slingshot', world: 'moon', mass: 'steel' }),
        goal: { metric: 'range', direction: 'near', target: 24, tolerance: 0.6, unit: 'm' },
        budget: { energy: 5 },
      }),
  },
  {
    id: 'counterweight',
    title: 'The trebuchet’s secret',
    brief:
      'A falling counterweight throws the ball, so this launcher’s speed honestly depends on gravity. Land within 0.5 m of 8 m — then ask yourself what the same setting would do on the Moon.',
    band: 'analyst',
    build: (seed) =>
      make({
        seed,
        band: 'analyst',
        setup: packSetup({ launcher: 'trebuchet', world: 'earth', mass: 'steel' }),
        goal: { metric: 'range', direction: 'near', target: 8, tolerance: 0.5, unit: 'm' },
        budget: { energy: 9 },
      }),
  },
]

export const MOTION_CHALLENGE_BY_ID: Record<string, MotionChallengePreset> = Object.fromEntries(
  MOTION_CHALLENGES.map((c) => [c.id, c]),
)

/** The ones offered at a band: this band's, plus anything easier. */
export function challengesForBand(band: Band): MotionChallengePreset[] {
  const order: Band[] = ['explorer', 'scientist', 'analyst']
  const ceiling = order.indexOf(band)
  return MOTION_CHALLENGES.filter((c) => order.indexOf(c.band) <= ceiling)
}

/* ------------------------------------------------------------------ */

/** Re-exported so a caller never has to know which module owns the arithmetic. */
export { canAfford, drawDown, spentSoFar } from './challenge'

/** The dial limits the cabinet itself enforces, for anything clamping to both. */
export const DIAL_LIMITS = {
  angle: { min: ANGLE_MIN, max: ANGLE_MAX },
  push: { min: PUSH_MIN, max: PUSH_MAX },
  drop: { min: DROP_MIN, max: DROP_MAX },
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
