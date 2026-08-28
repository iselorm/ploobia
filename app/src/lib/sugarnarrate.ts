/**
 * What the narrator says in The Sugar Line.
 *
 * Four moments, which is what Selorm asked for: tell the story, say what is
 * about to happen when a trial runs, explain why the result came out that way,
 * and suggest what to try next.
 *
 * **Every line here is derived, not scripted.** The "why" comes from
 * `findBottleneck`, which is the same solve that drives the needle and the
 * bottleneck plate — so the voice cannot drift out of step with the model, and
 * it cannot say something the cabinet does not also show. That last part is
 * the platform rule from `lib/audio.ts`: nothing audible is load-bearing. A
 * muted learner, a deaf learner, a learner on a device with no voices, and a
 * learner in a room of thirty all read exactly what the others hear.
 *
 * Pure module — no React, no three, no browser. Checked out of band by
 * `verify-sugar-model.mjs`, which is the only place a claim like "the
 * explanation names the actual constraint" can be tested at all.
 */

import {
  MEASURES,
  type BottleneckReading,
  type MeasureId,
  type SugarReading,
  type SugarSolve,
  type SugarVarId,
} from './sugarline'
import { SUGAR_VARS } from './sugarsim'
import type { Specimen } from './specimens'

export interface NarrationContext {
  specimen: Specimen
  solve: SugarSolve
  bottleneck: BottleneckReading
  measure: MeasureId
  xVar: SugarVarId
  /** The reading just recorded, if a trial has ended. */
  reading: SugarReading | null
  readings: SugarReading[]
  prediction: number | null
  night: boolean
  girdled: boolean
}

/* ------------------------------------------------------------------ */
/* 1. The story                                                       */
/* ------------------------------------------------------------------ */

/**
 * Spoken once, when the learner starts. The same account the welcome card
 * gives in writing, plus this specimen's own destination — which is the part
 * that makes it a story about *this* plant rather than about photosynthesis in
 * general.
 */
export function narrateOpening(specimen: Specimen): string {
  // Read the destination off the SAME key fact the atlas card shows.
  //
  // The first version picked `sinks.find(kind === 'store')`, which for a bean
  // is the roots — while the card beside it said "Main sink: Pods". Two
  // different answers to one question, from the voice that exists to explain
  // the cabinet. That is the exact drift this module claims to prevent, and it
  // survived a green suite because nothing compared the two.
  const main = specimen.keyFacts.find(([k]) => k === 'Main sink')?.[1]
  const destination = (main ?? specimen.sinks[0]?.label ?? 'roots').toLowerCase()
  return (
    `This is ${specimen.name.toLowerCase()}. Its leaves make sugar out of air, water and light — ` +
    `and then it has to get somewhere, down the stem to the ${destination}. ` +
    `Change one thing at a time and find out what stalls the line.`
  )
}

/* ------------------------------------------------------------------ */
/* 2. What is about to happen                                         */
/* ------------------------------------------------------------------ */

/**
 * Spoken as a trial starts: what is being measured, and what to watch.
 *
 * Takes only the two things it uses. Asking for a whole `NarrationContext`
 * made the caller build a solve and run the bottleneck finder before either
 * was needed — and at the point a trial starts, one of them did not exist yet.
 */
export function narrateTrialStart(input: {
  measure: MeasureId
  prediction: number | null
}): string {
  const m = MEASURES[input.measure]
  const said =
    input.prediction === null
      ? 'You have not committed a prediction, so there is nothing to be right about yet.'
      : `You said about ${format(input.prediction, m.decimals)}.`
  return `Measuring ${m.simpleLabel.toLowerCase()}. Hold everything else still and watch where the needle settles. ${said}`
}

/* ------------------------------------------------------------------ */
/* 3. Why it came out that way                                        */
/* ------------------------------------------------------------------ */

/**
 * The result, and the reason for it.
 *
 * Two sentences of fact and one of cause. The cause is `bottleneck.because` —
 * the model's own explanation of what is holding the line back, which is what
 * turns a number into an idea.
 */
export function narrateResult(ctx: NarrationContext): string {
  const m = MEASURES[ctx.measure]
  const value = ctx.reading ? format(ctx.reading.y, m.decimals) : format(m.read(ctx.solve), m.decimals)
  const parts: string[] = [`${value} ${spokenUnit(m.unit)}.`]

  if (ctx.reading && ctx.prediction !== null) {
    parts.push(verdict(ctx.prediction, ctx.reading.y))
  }

  // The reason. Girdling and night are states the learner deliberately caused,
  // so they are named as such rather than reported as a mysterious limit.
  if (ctx.girdled) {
    parts.push('The ring is cut, so nothing is getting past it.')
  } else if (ctx.night) {
    parts.push('It is dark, so nothing is being made — the line is running on starch the leaf banked earlier.')
  }
  parts.push(ctx.bottleneck.because)
  return parts.join(' ')
}

/** How close was the prediction? Same thresholds the reveal card draws. */
function verdict(predicted: number, actual: number): string {
  const spread = Math.max(Math.abs(actual), 1e-6)
  const relative = Math.abs(predicted - actual) / spread
  if (relative <= 0.06) return 'That is almost exactly what you predicted.'
  if (relative <= 0.18) return 'Close to your prediction.'
  if (relative <= 0.45) return 'Out a bit from your prediction — the direction is the interesting part.'
  return 'A long way from your prediction, which is the most useful kind of wrong.'
}

/* ------------------------------------------------------------------ */
/* 4. What to try next                                                */
/* ------------------------------------------------------------------ */

/**
 * A suggestion, chosen from what the learner has actually done.
 *
 * Never "try harder": it names one concrete next move, and prefers finishing
 * the curve they have started over opening a new question. A learner with four
 * points on one variable is one trial from a shape, and telling them so is
 * worth more than any new idea.
 */
export function narrateNext(ctx: NarrationContext): string {
  const onThisVar = ctx.readings.filter((r) => r.xVar === ctx.xVar).length
  const v = SUGAR_VARS[ctx.xVar]

  if (ctx.girdled) {
    return 'Heal the ring and run it again — that is the comparison that proves what the phloem was doing.'
  }
  if (onThisVar >= 4) {
    return `You have ${onThisVar} points on ${v.simpleLabel.toLowerCase()}. One more and the curve has a shape you can argue from.`
  }
  if (onThisVar >= 1 && onThisVar < 4) {
    return `That is ${onThisVar === 1 ? 'one point' : `${onThisVar} points`}. A single dot is not a pattern — move ${v.simpleLabel.toLowerCase()} again and take another.`
  }

  // Nothing recorded on this variable yet: point at the constraint, because
  // changing the thing that is actually limiting the line is the move that
  // teaches the most.
  const suggestion = NEXT_MOVE[ctx.bottleneck.id]
  return suggestion ?? `Change ${v.simpleLabel.toLowerCase()} and run it again.`
}

/** One concrete move per constraint. Keyed to `Bottleneck`. */
const NEXT_MOVE: Record<string, string> = {
  light: 'Light is what is holding it back. Turn the light up and run it again — see whether the rate follows.',
  co2: 'Carbon dioxide is the limit here. Raise it and run it again, and watch whether more light still helps.',
  temp: 'Temperature is the limit. Move it toward this plant’s optimum and take another reading.',
  water: 'It is short of water. Water it, give it a moment, then measure again.',
  loading:
    'The leaf is making sugar faster than it can load it. Try turning the light down — the rate may barely change, which is the point.',
  sink: 'The stores are full. Try a plant with somewhere else to put it, or watch what the back-pressure does to the speed.',
  girdle: 'Heal the ring and measure again to see what the cut was costing.',
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function format(n: number, decimals: number): string {
  return n.toFixed(decimals)
}

/** Units are written for the eye; these are for the ear. */
function spokenUnit(unit: string): string {
  if (unit === 'mg h⁻¹') return 'milligrams per hour'
  if (unit === 'm h⁻¹') return 'metres per hour'
  if (unit === 'µmol m⁻² s⁻¹') return 'micromoles per square metre per second'
  return unit
}
