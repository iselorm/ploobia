/**
 * The plot — the Landing's cassava bed, played one dawn at a time.
 *
 * S0, "The Drooping Cassava" (storyboard v4, 24 Sep 2026). The Roots model
 * (`roots.ts`) is the physics; this file is the trial around it: a run of
 * days on one bed, each dawn paused until the child probes, pours or waits,
 * then twenty-four hourly steps over about six seconds, then the next dawn.
 * The store holds a `PlotRun` and the ticker calls `advance`; the HUD reads
 * the run; nothing in `useFrame` knows what a day is.
 *
 * The rules that live here and nowhere else:
 *
 *  • RESCUE and CARE are two lines, never one. Rescue = the plant is standing
 *    at the last noon (firm ≥ 0.8 on the last day). Steady hands = never
 *    below 0.6 in daylight after the first day. Rescue unlocks; care is the
 *    achievement. Root health is evidence, never a veto.
 *  • The first stand is an EVENT — the first one o'clock at firm ≥ 0.95 —
 *    not a date. Nara's "And look", the chime and the leaf glyph key off it.
 *  • Day 1 is not the child's: the care minimum resets after the first day's
 *    last hour, so a soaked start never counts against them.
 *  • Two kinds of retry: REPLAY keeps the same bed and seed; A NEW BED draws
 *    a fresh as-found state from the range (air 0.05–0.08, O₂ 0.35–0.50), so
 *    a memorised calendar fails and the probe is the way back.
 *  • The explanation gate is on dialogue and rule text only: `explainsCause`
 *    is what the suites run over Ploob's and Nara's lines. Measurements are
 *    evidence and are never gated.
 */

import { rngFor } from './challenge'
import { AIR_OK, CAN, P_DEPLETION, SOIL, airOf, asFound, newBed, probeWord, runDays, stepHour, storedOf, type Bed, type ProbeWord, type RunResult, type Start } from './roots'

/* ----------------------------------------------------------------------------
 * Constants
 * ------------------------------------------------------------------------- */

export type BedId = 'first' | 'second'
export type DawnChoice = 'pour' | 'wait'
export type PlotPhase = 'dawn' | 'running' | 'done' | 'dead'

export const FORTNIGHT = 14
export const WEEK = 7
/** A day runs in about six seconds: 24 hours at this many hours per second. */
export const HOURS_PER_SECOND = 4
/** Standing at the last noon. */
export const RESCUE_FIRM = 0.8
/** Never below this in daylight after day 1 — steady hands. */
export const CARE_FIRM = 0.6
/** The first one o'clock at or above this fires the first stand. */
export const STAND_FIRM = 0.95
/** Roots gone: the plant is dead and the plate offers the retry. */
export const DEAD_HEALTH = 0.001
/** Dawns in a row without a probe before Ploob asks "Shall we look first?" */
export const UNPROBED_NUDGE = 3
/** The hour the can is poured. */
export const POUR_HOUR = 7
/** The hour the leaf is read — the hardest hour. */
export const READ_HOUR = 13

/** Nara's bed as found on the baseline play: soaked clay. */
export const BASELINE_START: Start = { airStart: 0.06, o2: 0.4 }
/**
 * The range A NEW BED draws from (S0-D1, checked against the model in
 * `verify-roots-model.mjs`): air 0.05–0.07 so the plant visibly droops on the
 * first noon (0.30–0.70; at 0.075 and above it reads 0.8+ and is not a
 * droop), O₂ 0.35–0.50. Above air 0.062 every early two-can calendar that
 * wins on the baseline fails, so the first fresh bed is drawn from that
 * drier band: a memorised calendar meets a bed it does not fit.
 */
export const START_RANGE = { air: [0.05, 0.07] as const, o2: [0.35, 0.5] as const }
export const DRIER_BAND = [0.064, 0.07] as const
/** The far bed when the child reaches it: clay left dry a week after Nara stopped watering it. */
export const SECOND_BED_DAYS_DRY = 7

export function secondBedStart(daysDry = SECOND_BED_DAYS_DRY): Start {
  return asFound('clay', daysDry)
}

/**
 * A fresh as-found state from a seed — the same seed gives the same bed.
 * `after` is the start being left: a bed at or below the baseline's air is
 * followed by one from the drier band; any other by one at least 0.006 away
 * in air, so two beds in a row never play alike.
 */
export function startFor(seed: number, after?: Start): Start {
  const r = rngFor(seed)
  const prev = after?.airStart
  let lo: number = START_RANGE.air[0]
  let hi: number = START_RANGE.air[1]
  if (prev != null && prev <= 0.062) {
    lo = DRIER_BAND[0]
    hi = DRIER_BAND[1]
  }
  const round3 = (x: number) => Math.round(x * 1000) / 1000
  let air = round3(lo + (hi - lo) * r())
  if (prev != null && Math.abs(air - prev) < 0.0059) {
    // step to the far side of the previous bed, inside the range
    air = round3(prev + 0.006 <= hi ? prev + 0.006 + (hi - prev - 0.006) * r() : lo + (prev - 0.006 - lo) * r())
  }
  const o2 = START_RANGE.o2[0] + (START_RANGE.o2[1] - START_RANGE.o2[0]) * r()
  return { airStart: air, o2: Math.round(o2 * 100) / 100 }
}

/* ----------------------------------------------------------------------------
 * The run
 * ------------------------------------------------------------------------- */

/** What the probe would read at this dawn, and what the child did with it. */
export interface Dawn {
  /** 1-based. */
  day: number
  probed: boolean
  word: ProbeWord
  theta: number
  air: number
  o2: number
  /** Cans poured this dawn (0 or 1). */
  cans: number
  /** The number in force at this dawn, or null before the brief. */
  said: number | null
}

/** A closed day: the dawn, plus what the leaf and the roots did. */
export interface PlotDay extends Dawn {
  /** Firmness at one o'clock. */
  firm13: number
  /** Living root fraction at the day's end. */
  health: number
}

export interface PlotRun {
  bed: BedId
  seed: number
  start: Start
  length: number
  /** 1-based, per bed. */
  attempt: number
  /** The live bed. Mutated by `advance`; the store replaces the run object to publish. */
  b: Bed
  /** 1-based day in progress or awaiting its dawn. */
  day: number
  /** Whole hours stepped today. */
  hour: number
  /** Fractional hours waiting to be stepped. */
  acc: number
  phase: PlotPhase
  days: PlotDay[]
  today: Dawn
  /** Every number the child typed, in order; the last is in force. */
  said: number[]
  /** Day of the first stand, or null. */
  stood: number | null
  /** First dawn on which the child read DRY, or null. */
  dryRead: number | null
  /** Dawns in a row closed without a probe. */
  unprobed: number
  /** Ploob has asked "Shall we look first?" this run. */
  nudged: boolean
  /** Firmness at the latest one o'clock, for the gauge. */
  firm13: number
  /** The lowest one o'clock reading after day 1, for the gauge's "best/worst". */
  worst13: number
}

export type PlotEvent = 'stand' | 'day' | 'done' | 'dead'

function dawnOf(b: Bed, day: number, said: number | null): Dawn {
  return { day, probed: false, word: probeWord(b), theta: b.theta, air: airOf(b), o2: b.o2, cans: 0, said }
}

export function newRun(bed: BedId, start: Start, length: number, seed: number, attempt = 1): PlotRun {
  const b = newBed('clay', start)
  // The plant as found: the leaf shows what yesterday's one o'clock would have read on this bed
  // (0.49 soaked, 0.65 on the far bed), so the droop is there before the first dawn and nothing
  // pops upright when the marker goes in. By the first noon the model has forgotten the value.
  b.firm = runDays('clay', [0], start).daily[0].firm13
  return {
    bed,
    seed,
    start,
    length,
    attempt,
    b,
    day: 1,
    hour: 0,
    acc: 0,
    phase: 'dawn',
    days: [],
    today: dawnOf(b, 1, null),
    said: [],
    stood: null,
    dryRead: null,
    unprobed: 0,
    nudged: false,
    firm13: b.firm,
    worst13: 1,
  }
}

/** The baseline first bed: Nara's, soaked. */
export function firstBed(seed = 1, attempt = 1, start: Start = BASELINE_START): PlotRun {
  return newRun('first', start, FORTNIGHT, seed, attempt)
}

/** The far bed, a week after Nara stopped watering it. */
export function secondBed(seed = 1, attempt = 1): PlotRun {
  return newRun('second', secondBedStart(), WEEK, seed, attempt)
}

/** REPLAY THIS FORTNIGHT — the same bed, the same seed, one more attempt. */
export function replay(run: PlotRun): PlotRun {
  return newRun(run.bed, run.start, run.length, run.seed, run.attempt + 1)
}

/** A NEW BED — a fresh as-found state from the range. Only the first bed varies. */
export function freshBed(run: PlotRun): PlotRun {
  const seed = (run.seed * 7919 + run.attempt * 104729 + 1) >>> 0
  return newRun(run.bed, run.bed === 'first' ? startFor(seed, run.start) : run.start, run.length, seed, run.attempt + 1)
}

/** The child pushes the probe in. Free, every dawn; the reading sits on the plate until the next one. */
export function probe(run: PlotRun): boolean {
  if (run.phase !== 'dawn' || run.today.probed) return false
  run.today.probed = true
  if (run.today.word === 'DRY' && run.dryRead == null) run.dryRead = run.day
  return true
}

/** The child types (or revises) the number of cans. Every revision is kept. */
export function say(run: PlotRun, n: number): boolean {
  if (!Number.isFinite(n) || n < 0 || n > 99) return false
  const v = Math.round(n)
  if (run.said[run.said.length - 1] === v) return false
  run.said.push(v)
  run.today.said = v
  return true
}

/** Pour or wait: the dawn ends and the day runs. */
export function choose(run: PlotRun, choice: DawnChoice): boolean {
  if (run.phase !== 'dawn') return false
  run.today.cans = choice === 'pour' ? 1 : 0
  run.unprobed = run.today.probed ? 0 : run.unprobed + 1
  run.phase = 'running'
  run.hour = 0
  run.acc = 0
  return true
}

/** Ploob's nudge is owed: three dawns closed unprobed and not yet asked. Marks it asked. */
export function takeNudge(run: PlotRun): boolean {
  if (run.nudged || run.unprobed < UNPROBED_NUDGE) return false
  run.nudged = true
  return true
}

/** Total cans poured on this run so far. */
export function cansUsed(run: PlotRun): number {
  return run.days.reduce((a, d) => a + d.cans, 0) + (run.phase === 'running' ? run.today.cans : 0)
}

/** The number in force — the last one typed — or null. */
export function saidNow(run: PlotRun): number | null {
  return run.said.length ? run.said[run.said.length - 1] : null
}

/** Absolute hour of the run, for the demand curve. */
function absHour(run: PlotRun): number {
  return (run.day - 1) * 24 + run.hour
}

/**
 * Time passes: `dt` seconds of the day's six. Steps whole hours, closes the
 * day at its last hour and opens the next dawn (or ends the run). Returns the
 * events that fired, in order, for the HUD's chime and Nara's lines.
 */
export function advance(run: PlotRun, dt: number): PlotEvent[] {
  const events: PlotEvent[] = []
  if (run.phase !== 'running') return events
  run.acc += dt * HOURS_PER_SECOND
  while (run.acc >= 1 && run.phase === 'running') {
    run.acc -= 1
    const h = run.hour
    const pour = h === POUR_HOUR ? run.today.cans * CAN : 0
    stepHour(run.b, absHour(run), pour, 0)
    run.hour += 1
    if (h === READ_HOUR) {
      run.firm13 = run.b.firm
      if (run.day > 1) run.worst13 = Math.min(run.worst13, run.firm13)
      if (run.stood == null && run.firm13 >= STAND_FIRM) {
        run.stood = run.day
        events.push('stand')
      }
    }
    if (h === 23) {
      if (run.day === 1) run.b.minFirm = 1 // the day as found is not the learner's
      run.days.push({ ...run.today, firm13: run.firm13, health: run.b.health })
      events.push('day')
      if (run.b.health <= DEAD_HEALTH) {
        run.phase = 'dead'
        events.push('dead')
      } else if (run.day >= run.length) {
        run.phase = 'done'
        events.push('done')
      } else {
        run.day += 1
        run.hour = 0
        run.phase = 'dawn'
        run.today = dawnOf(run.b, run.day, saidNow(run))
      }
    }
  }
  return events
}

/**
 * The sky as the day runs, on the Looks scale (1 day · 0.42 evening · 0
 * night): the dawn pause glows at 0.45, the morning brightens, the afternoon
 * holds, dusk falls through evening into night, and the small hours lift
 * toward the next dawn. `hour` is the model's, 0–24, fractional.
 */
export function skyForHour(hour: number): number {
  const h = ((hour % 24) + 24) % 24
  const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t))
  if (h < 2) return lerp(0.45, 1, h / 2)
  if (h < 15) return 1
  if (h < 17.5) return lerp(1, 0.42, (h - 15) / 2.5)
  if (h < 19.5) return lerp(0.42, 0, (h - 17.5) / 2)
  if (h < 22) return 0
  return lerp(0, 0.45, (h - 22) / 2)
}

/** Whole seconds until the next dawn, for the plate's countdown. */
export function secondsToDawn(run: PlotRun): number {
  if (run.phase !== 'running') return 0
  return Math.max(1, Math.ceil((24 - run.hour - run.acc) / HOURS_PER_SECOND))
}

/** The hour of the running day, in words a child reads at a glance — the plate and the day ring say the same. */
export const DAY_PHASES = ['Sunrise', 'Morning', 'Afternoon', 'Sunset', 'Night', 'Before dawn'] as const
export type DayPhase = (typeof DAY_PHASES)[number]

export function dayPhaseIndex(hour: number): number {
  const h = ((hour % 24) + 24) % 24
  if (h < 2) return 0
  if (h < 11) return 1
  if (h < 15) return 2
  if (h < 19.5) return 3
  if (h < 22) return 4
  return 5
}

export function dayPhase(hour: number): DayPhase {
  return DAY_PHASES[dayPhaseIndex(hour)]
}

/**
 * The gauges' scales, from the model's own thresholds (Selorm, 25 Sep: the
 * dials and the ring). Water runs wilting point → porosity, and the probe's
 * words sit where the probe reads them: SOAKED when the air in the pores is
 * under AIR_OK, DRY when more than P_DEPLETION of the available water is
 * gone. Air runs 0 → a quarter of the soil's volume. The leaf is firmness,
 * with the floor (steady hands) and the standing line (rescue) on it.
 */
export const GAUGE = (() => {
  const c = SOIL.clay
  const span = c.phi - c.wp
  return {
    water: (theta: number) => Math.max(0, Math.min(1, (theta - c.wp) / span)),
    soakedAt: (c.phi - AIR_OK - c.wp) / span,
    dryAt: (c.fc - P_DEPLETION * (c.fc - c.wp) - c.wp) / span,
    air: (air: number) => Math.max(0, Math.min(1, air / 0.25)),
    /** Air words at the bar's scale: little under AIR_OK, some to 0.16, plenty above. */
    airLittleAt: AIR_OK / 0.25,
    airSomeAt: 0.16 / 0.25,
    floor: CARE_FIRM,
    standing: RESCUE_FIRM,
  }
})()

export type AirWord = 'little' | 'some' | 'plenty'
export function airWord(air: number): AirWord {
  return air < AIR_OK ? 'little' : air < 0.16 ? 'some' : 'plenty'
}

/* ----------------------------------------------------------------------------
 * Verdicts
 * ------------------------------------------------------------------------- */

/** Is the plate up at all: a run in play on the first or the far bed. */
export function plateUp(p: { run: PlotRun | null; stage: string }): boolean {
  return !!p.run && (p.stage === 'first' || p.stage === 'second')
}

/** Standing at the last noon. Only a finished run can have rescued. */
export function rescued(run: PlotRun): boolean {
  return run.phase === 'done' && run.days[run.days.length - 1].firm13 >= RESCUE_FIRM
}

/** Never below 0.6 in daylight after the first day. */
export function steadyHands(run: PlotRun): boolean {
  return run.phase === 'done' && run.b.minFirm >= CARE_FIRM
}

/** Every pour on this run happened on a dawn the child had probed. */
export function pouredOnProbedDawns(run: PlotRun): boolean {
  const poured = run.days.filter((d) => d.cans > 0)
  return poured.length > 0 && poured.every((d) => d.probed)
}

/** The dawn after each pour was probed — "check again tomorrow". */
export function checkedAfterPouring(run: PlotRun): boolean {
  let ok = false
  for (let i = 0; i < run.days.length; i += 1) {
    if (run.days[i].cans === 0) continue
    // a pour on the last day has no tomorrow to check
    if (i === run.days.length - 1 && run.phase !== 'dawn') continue
    const next = run.days[i + 1] ?? (run.phase === 'dawn' && run.today.day === run.days[i].day + 1 ? run.today : null)
    if (!next || !next.probed) return false
    ok = true
  }
  return ok
}

export type Competence = 'runs' | 'copies'

/**
 * Nara's competence is set by what the child demonstrated, never by prose:
 * the first bed stood and stayed standing, and the second bed was probed
 * before it was poured and held for the week → she runs the method. The
 * first without the second → she copies a routine, and will pause and report
 * when a bed is outside what was tested (S1). The judge may raise `copies`
 * to `runs` on a right explanation; it never lowers a demonstration.
 */
export function competence(first: PlotRun, second: PlotRun | null): Competence {
  if (!rescued(first)) return 'copies'
  if (second && rescued(second) && pouredOnProbedDawns(second)) return 'runs'
  return 'copies'
}

export function raiseCompetence(c: Competence, judgeRight: boolean): Competence {
  return judgeRight ? 'runs' : c
}

/** The method card, assembled from the child's own dawns across the runs given. */
export interface MethodSteps {
  probe: boolean
  soakedWait: boolean
  dryCan: boolean
  checkAgain: boolean
}

export function methodSteps(runs: PlotRun[]): MethodSteps {
  const days = runs.flatMap((r) => r.days)
  return {
    probe: days.some((d) => d.probed),
    soakedWait: days.some((d) => d.probed && d.word === 'SOAKED' && d.cans === 0),
    dryCan: days.some((d) => d.probed && d.word === 'DRY' && d.cans > 0),
    checkAgain: runs.some(checkedAfterPouring),
  }
}

/* ----------------------------------------------------------------------------
 * The record
 * ------------------------------------------------------------------------- */

export type AccuracyWord = 'spot on' | 'close' | 'off'
export type EconomyWord = 'fewest' | 'one over' | 'more than needed' | 'not saved'

export interface Thrift {
  /** mm that arrived on the bed — the child's cans. */
  arrived: number
  /** mm the plant took up. */
  taken: number
  /** mm of the child's water drained below the roots: what the bed drained beyond what it would have drained untouched. */
  drained: number
  /** mm the bed drained by itself — the water it was found with, not the child's. */
  inherited: number
  /** mm over the edging. */
  spilled: number
  /** Change in what the bed holds, mm (negative when it dried). */
  stored: number
  /** Ions washed out, game units — Investigator's line only. */
  leached: number
}

export interface PlotRecord {
  bed: BedId
  attempt: number
  said: number[]
  cans: number
  rescued: boolean
  steadyHands: boolean
  stood: number | null
  fewest: number | null
  accuracy: AccuracyWord | null
  economy: EconomyWord
  thrift: Thrift
  /** The days, for the journal's curve. */
  firm13: number[]
  words: ProbeWord[]
  probed: boolean[]
  cansByDay: number[]
}

/**
 * The fewest cans that rescue this bed from this start WITH steady hands —
 * the measure economy is judged against, because the fewest rescue-only
 * plans are the late ones that let it droop for a week. Searched over 0/1
 * schedules up to `maxK` cans (the D1 range never needs more than three; the
 * cap keeps the record instant). Null when nothing up to `maxK` works.
 */
export function fewestCans(start: Start, length: number, maxK = 4): number | null {
  for (let k = 0; k <= Math.min(maxK, length); k += 1) {
    if (anyCareWinWith(start, length, k)) return k
  }
  return null
}

function anyCareWinWith(start: Start, length: number, k: number): boolean {
  const idx: number[] = []
  for (let i = 0; i < k; i += 1) idx.push(i)
  const cans = new Array<number>(length).fill(0)
  for (;;) {
    cans.fill(0)
    for (const i of idx) cans[i] = 1
    const r = runDays('clay', cans, start)
    if (r.firmEnd >= RESCUE_FIRM && r.minFirm >= CARE_FIRM) return true
    // next combination
    let p = k - 1
    while (p >= 0 && idx[p] === length - k + p) p -= 1
    if (p < 0) return false
    idx[p] += 1
    for (let q = p + 1; q < k; q += 1) idx[q] = idx[q - 1] + 1
  }
}

export function thriftOf(run: PlotRun): Thrift {
  const b = run.b
  const start = newBed('clay', run.start)
  // what the bed would have drained on its own over the days played so far
  const daysPlayed = run.days.length + (run.phase === 'running' ? 1 : 0)
  const untouched = daysPlayed > 0 ? runDays('clay', new Array<number>(daysPlayed).fill(0), run.start).drained : 0
  const inherited = Math.min(b.drained, untouched)
  return {
    arrived: b.arrived,
    taken: b.taken,
    drained: b.drained - inherited,
    inherited,
    spilled: b.spilled,
    stored: storedOf(b) + b.pond - storedOf(start),
    leached: b.leached,
  }
}

export function recordOf(run: PlotRun): PlotRecord {
  const cans = cansUsed(run)
  const said = saidNow(run)
  const won = rescued(run)
  const fewest = won ? fewestCans(run.start, run.length) : null
  let accuracy: AccuracyWord | null = null
  if (said != null) {
    const off = Math.abs(said - cans)
    accuracy = off === 0 ? 'spot on' : off === 1 ? 'close' : 'off'
  }
  let economy: EconomyWord = 'not saved'
  if (won) economy = fewest == null || cans <= fewest ? 'fewest' : cans === fewest + 1 ? 'one over' : 'more than needed'
  return {
    bed: run.bed,
    attempt: run.attempt,
    said: [...run.said],
    cans,
    rescued: won,
    steadyHands: steadyHands(run),
    stood: run.stood,
    fewest,
    accuracy,
    economy,
    thrift: thriftOf(run),
    firm13: run.days.map((d) => d.firm13),
    words: run.days.map((d) => d.word),
    probed: run.days.map((d) => d.probed),
    cansByDay: run.days.map((d) => d.cans),
  }
}

/** The counterfactual the first play watches: the same bed with a can every morning. */
export function everyMorning(start: Start, length = FORTNIGHT): RunResult {
  return runDays('clay', new Array<number>(length).fill(1), start)
}

/** The day roots fall below half under a schedule, 1-based, or null. */
export function rootsBelowHalfOn(r: RunResult): number | null {
  const i = r.daily.findIndex((d) => d.health < 0.5)
  return i < 0 ? null : i + 1
}

/* ----------------------------------------------------------------------------
 * The explanation gate
 * ------------------------------------------------------------------------- */

/**
 * Does a line state the cause? The gate on Ploob's and Nara's lines and on
 * rule text before the first stand and a DRY read. Measurements — the probe's
 * air %, the Lens's bars — are evidence and are never run through this.
 */
export const EXPLAINS = /\b(drown\w*|air|airless|oxygen|roots?)\b/i

export function explainsCause(text: string): boolean {
  return EXPLAINS.test(text)
}

/**
 * The first stand, said back in the words that fit what the child actually
 * did (Selorm, 24 Sep): "you gave it nothing" only when nothing was given;
 * a mistaken pour gets a line that looks back instead; the far bed was
 * watered, and both of them say so. Ploob's voice and Nara's are separate —
 * she is the client, he is the coach — and neither names the cause.
 */
export function recoveryLine(run: PlotRun, voice: 'ploob' | 'nara' = 'ploob'): string {
  const day = run.stood ?? run.day
  const poured = run.days.some((d) => d.day <= day && d.cans > 0) || (run.today.day <= day && run.today.cans > 0)
  if (voice === 'nara') {
    if (run.bed === 'second') return 'You watered this one and it came up. Mine got worse with water.'
    if (!poured) return 'You gave it nothing. And look.'
    return 'It came up. I would have kept pouring.'
  }
  if (run.bed === 'second') return 'You gave this bed water, and it came up. Keep checking it.'
  if (!poured) return 'It came up. You gave it nothing and it came up.'
  return 'It came up. Look back at what changed each morning.'
}

export function methodReply(steps: MethodSteps): string {
  if (Object.values(steps).every(Boolean)) return 'Probe. Soaked, wait. Dry, one can. Look again tomorrow. — I can do that.'
  const missing = [!steps.probe && 'probing before deciding', !steps.soakedWait && 'waiting when the bed is soaked', !steps.dryCan && 'watering when the bed is dry', !steps.checkAgain && 'checking again after watering'].filter(Boolean)
  return `Both beds are standing. We still need to test ${missing.join(', ')} together before I can rely on the whole method.`
}
