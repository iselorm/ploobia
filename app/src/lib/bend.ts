/**
 * S2 round A3 — the vice: which strap keeps a bend?
 *
 * Storyboard v3.1 §03 M5, and the design of 2 Oct: the child says which strip
 * gives first BEFORE the first weight, hangs dry ingots on four strips at once,
 * lifts them off, and reads which arms came back. Pure: no store, no React.
 *
 * What is sourced and what is modelled (journal: "Where the numbers come from"):
 *  - The DIRECTION is sourced. Annealed copper yields at about 33 MPa, wrought
 *    iron at 160–220 MPa; copper's Young's modulus is 110–128 GPa against
 *    about 190 GPa for wrought iron, so under the same load a copper strip
 *    dips about 1.6 times as far. Rust is porous and flaky and does not protect
 *    the iron under it; copper's weathered skin does.
 *  - The INGOT COUNTS are modelled: test strips of an authored section, chosen
 *    so the answers are whole ingots. New copper 3, old copper 3 (its skin is
 *    thin: the metal under it is whole), new iron 8, rusted iron 2 (the rust
 *    has eaten the section, and it cracks rather than bends).
 *
 * `verify-bend-model.mjs` pins all of it.
 */

import type { CastRecord } from './supply'

export type StripId = 'copper' | 'oldCopper' | 'iron' | 'rusted'
export type BandId = 'explorer' | 'scientist' | 'analyst'

export interface StripSpec {
  id: StripId
  /** What the tag on the strip says. */
  label: string
  metal: 'copper' | 'iron'
  /** An old sample: green copper off a roof, iron left out in the wet. */
  aged: boolean
  /** Ingots at which it gives (modelled). */
  givesAt: number
  /** How it gives: a bend that stays, or a crack. */
  gives: 'bends' | 'cracks'
  /** Dip under one ingot, against new iron (Young's modulus; rusted iron has lost section). */
  flex: number
}

/** The four strips, in the order they sit in the vice. */
export const STRIPS: readonly StripSpec[] = [
  { id: 'copper', label: 'new copper', metal: 'copper', aged: false, givesAt: 3, gives: 'bends', flex: 1.6 },
  { id: 'oldCopper', label: 'old copper', metal: 'copper', aged: true, givesAt: 3, gives: 'bends', flex: 1.6 },
  { id: 'iron', label: 'new iron', metal: 'iron', aged: false, givesAt: 8, gives: 'bends', flex: 1 },
  { id: 'rusted', label: 'rusted iron', metal: 'iron', aged: true, givesAt: 2, gives: 'cracks', flex: 2.4 },
]

export const STRIP: Record<StripId, StripSpec> = Object.fromEntries(STRIPS.map((s) => [s.id, s])) as Record<StripId, StripSpec>

/** The hanger takes eight ingots: enough to bend new iron. */
export const HANGER_MAX = 8

/** The copper test strip is cut from the runner: 10 cm³, 90 g of it. */
export const TEST_STRIP_CM3 = 10
export const TEST_STRIP_G = 90

/** What the recovery tray holds once the test strip has been cut from the runner, grams. */
export function trayG(spareG: number, v: Pick<Bend, 'cut'>): number {
  return v.cut ? spareG - TEST_STRIP_G : spareG
}

/** Which strip gives under the least load. */
export function firstToGive(): StripId {
  return STRIPS.reduce((a, b) => (b.givesAt < a.givesAt ? b : a)).id
}

/** One strip's record: the heaviest load it came back from, and the load it gave at. */
export interface Reading {
  back: number
  gaveAt: number | null
}

/** The reading pins the load exactly: it came back from one ingot fewer. */
export function exact(r: Reading): boolean {
  return r.gaveAt != null && r.gaveAt === r.back + 1
}

export type Guess = StripId | 'unsure'
export type DrawingPart = 'brace' | 'strap'

export interface Bend {
  /** The new copper strip has been cut from the runner in the recovery tray. */
  cut: boolean
  /** Which strip the child said would give first, before the first weight. Compared, never scored. */
  guess: Guess | null
  /** Ingots on the hanger. */
  load: number
  /** The hanger is on the strips now. */
  on: boolean
  readings: Record<StripId, Reading>
  /** Sets of strips used: 1, and one more for every "fresh strips". */
  sets: number
  /** The band's test is finished. Latched: the strips stay in the vice as the record. */
  done: boolean
  /** What the child pointed at on the repair drawing. Nothing rides on it. */
  pick: DrawingPart | null
  /** "Why does the gate still get copper?" — the option chosen, −1 until answered. */
  why: number
  whyText: string | null
}

const blank = (): Record<StripId, Reading> => ({ copper: { back: 0, gaveAt: null }, oldCopper: { back: 0, gaveAt: null }, iron: { back: 0, gaveAt: null }, rusted: { back: 0, gaveAt: null } })

export function initialBend(): Bend {
  return { cut: false, guess: null, load: 0, on: false, readings: blank(), sets: 1, done: false, pick: null, why: -1, whyText: null }
}

/** A pour has run: there is a runner in the recovery tray to cut a strip from. */
export function runnerInTray(c: CastRecord | null | undefined): boolean {
  return !!c && c.pours.length > 0
}

/** Sefu cuts the test strip from the runner. No pour, no runner, no strip. */
export function cutStrip(v: Bend, c: CastRecord | null | undefined): Bend {
  if (v.cut || !runnerInTray(c)) return v
  return { ...v, cut: true }
}

const isGuess = (g: unknown): g is Guess => g === 'unsure' || (typeof g === 'string' && g in STRIP)

/** The guess, once, before the first weight. */
export function predict(v: Bend, g: Guess): Bend {
  if (!v.cut || v.guess != null || !isGuess(g)) return v
  return { ...v, guess: g }
}

/** One more ingot on the hanger, and the hanger on the strips. */
export function hang(v: Bend): Bend {
  if (!v.cut || v.guess == null || v.why >= 0 || v.load >= HANGER_MAX) return v
  return { ...v, load: v.load + 1, on: true }
}

/** What the band has to see before the test is finished. */
export function tested(v: Bend, band: BandId): boolean {
  const r = v.readings
  if (band === 'explorer') {
    // Copper and the old samples gave, and new iron came back from the load copper gave at.
    return r.copper.gaveAt != null && r.oldCopper.gaveAt != null && r.rusted.gaveAt != null && r.iron.back >= r.copper.gaveAt
  }
  return STRIPS.every((s) => exact(r[s.id]))
}

/** The hanger comes off: each straight strip either springs back or keeps what the load did to it. */
export function lift(v: Bend, band: BandId): Bend {
  if (!v.on) return v
  const readings = blank()
  for (const s of STRIPS) {
    const r = v.readings[s.id]
    readings[s.id] = r.gaveAt != null ? r : v.load >= s.givesAt ? { back: r.back, gaveAt: v.load } : { back: Math.max(r.back, v.load), gaveAt: null }
  }
  const next = { ...v, on: false, readings }
  return { ...next, done: v.done || tested(next, band) }
}

/** A second set of strips, straight; the guess and the cut stay. Only when something has given and the test is not done. */
export function fresh(v: Bend): Bend {
  if (v.done || v.on || !STRIPS.some((s) => v.readings[s.id].gaveAt != null)) return v
  return { ...v, load: 0, on: false, readings: blank(), sets: v.sets + 1 }
}

export type StripState = 'straight' | 'flexed' | 'giving' | 'bent' | 'cracked'

/** What a strip looks like now. `giving` is under a load at or past what it can take: it shows on the lift. */
export function stripState(v: Bend, id: StripId): StripState {
  const s = STRIP[id]
  if (v.readings[id].gaveAt != null) return s.gives === 'cracks' ? 'cracked' : 'bent'
  if (!v.on || v.load === 0) return 'straight'
  return v.load >= s.givesAt ? 'giving' : 'flexed'
}

/** How far the arm dips, in units of new iron under one ingot. A strip that gave keeps the dip it gave at. */
export function dip(v: Bend, id: StripId): number {
  const s = STRIP[id]
  const r = v.readings[id]
  if (r.gaveAt != null) return s.givesAt * s.flex
  return v.on ? v.load * s.flex : 0
}

/** The guess against the record: true or false once ONE strip has given alone; null for "not sure", or while nothing tells. */
export function guessRight(v: Bend): boolean | null {
  if (v.guess == null || v.guess === 'unsure') return null
  const gave = STRIPS.filter((s) => v.readings[s.id].gaveAt != null)
  if (!gave.length) return null
  const least = Math.min(...gave.map((s) => v.readings[s.id].gaveAt as number))
  const first = gave.filter((s) => v.readings[s.id].gaveAt === least)
  if (first.length !== 1 || !exact(v.readings[first[0].id])) return null
  return first[0].id === v.guess
}

export type BendStage = 'uncut' | 'predict' | 'testing' | 'stuck' | 'tested' | 'drawn' | 'answered'

/** Where the vice stands. `stuck`: this set of strips can no longer finish the band's test. */
export function bendStage(v: Bend, band: BandId = 'explorer'): BendStage {
  if (v.why >= 0) return 'answered'
  if (v.pick != null) return 'drawn'
  if (v.done) return 'tested'
  if (!v.cut) return 'uncut'
  if (v.guess == null) return 'predict'
  const r = v.readings
  const stuck = band === 'explorer' ? r.iron.gaveAt != null : STRIPS.some((s) => r[s.id].gaveAt != null && !exact(r[s.id]))
  return stuck && !v.on ? 'stuck' : 'testing'
}

/** A reading in words, for the tag on the strip. Empty until the strip has carried a load. */
export function readingText(s: StripSpec, r: Reading): string {
  if (r.gaveAt == null) return r.back > 0 ? `came back from ${r.back}` : ''
  const how = s.gives === 'cracks' ? 'cracked' : 'stayed bent'
  return exact(r) ? `${how} at ${r.gaveAt}` : `${how} between ${r.back + 1} and ${r.gaveAt}`
}

/** The child points at a part of the repair drawing, once, after the test. */
export function pickDrawing(v: Bend, part: DrawingPart): Bend {
  if (!v.done || v.pick != null || (part !== 'brace' && part !== 'strap')) return v
  return { ...v, pick: part }
}

/** The why's options are the store's; the model only keeps the choice. */
export const BEND_WHY_OPTIONS = 3

export function answerBend(v: Bend, choice: number, text: string | null = null): Bend {
  if (v.pick == null || v.why >= 0 || !Number.isInteger(choice) || choice < 0 || choice >= BEND_WHY_OPTIONS) return v
  return { ...v, why: choice, whyText: text }
}

/* ----------------------------------------------------------------------------
 * The repair drawing moves — a few seconds, read off the sim clock
 * ------------------------------------------------------------------------- */

/**
 * The clip, in seconds of sim time: the brace is redrawn in copper, the leaf
 * sags as it gives, holds, the timber brace goes back in, the leaf comes up
 * square. Watched, not read; nothing is recorded.
 */
export const DRAW_BEATS = { copper: 0.5, sag: 1.5, hold: 0.8, timber: 0.5, back: 1.0 } as const
export const DRAW_TOTAL = 4.3
/** How far the leaf's latch side drops at the worst, as a shear (drop per unit of width). */
export const SAG_MAX = 0.14
export type DrawBeat = 'still' | 'copper' | 'sag' | 'hold' | 'timber' | 'back' | 'square'

const smooth = (t: number): number => {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

/** `elapsed` is seconds since the clip began; null when no clip is running. */
export function drawBeat(elapsed: number | null): DrawBeat {
  if (elapsed == null) return 'still'
  const b = DRAW_BEATS
  if (elapsed < b.copper) return 'copper'
  if (elapsed < b.copper + b.sag) return 'sag'
  if (elapsed < b.copper + b.sag + b.hold) return 'hold'
  if (elapsed < b.copper + b.sag + b.hold + b.timber) return 'timber'
  if (elapsed < DRAW_TOTAL) return 'back'
  return 'square'
}

/** The leaf's sag at this instant of the clip. */
export function drawSag(elapsed: number | null): number {
  if (elapsed == null) return 0
  const b = DRAW_BEATS
  switch (drawBeat(elapsed)) {
    case 'sag':
      return SAG_MAX * smooth((elapsed - b.copper) / b.sag)
    case 'hold':
    case 'timber':
      return SAG_MAX
    case 'back':
      return SAG_MAX * (1 - smooth((elapsed - b.copper - b.sag - b.hold - b.timber) / b.back))
    default:
      return 0
  }
}

/** The brace is drawn in copper from the first beat until the timber one goes back in. */
export function braceCopper(elapsed: number | null): boolean {
  const beat = drawBeat(elapsed)
  return beat === 'copper' || beat === 'sag' || beat === 'hold'
}

/* ----------------------------------------------------------------------------
 * Where the numbers come from (the journal shows these)
 * ------------------------------------------------------------------------- */

export interface BendSource {
  claim: string
  basis: 'sourced' | 'modelled'
  source: string
}

export const BEND_SOURCES: readonly BendSource[] = [
  {
    claim: 'Iron needs air and water to rust, and rust is porous and flaky: it does not protect the iron under it.',
    basis: 'sourced',
    source: 'RSC Education, “What causes iron to rust?”; J. Clark, Chemguide, “Rusting of iron”.',
  },
  {
    claim: 'Copper weathers to a skin and then stops: that is why it lasts in the wet.',
    basis: 'sourced',
    source: 'Copper Development Association, Architecture Design Handbook, “Fundamentals”.',
  },
  {
    claim: 'Sound iron is stronger and stiffer than copper.',
    basis: 'sourced',
    source: 'Yield strength: annealed copper about 33 MPa, wrought iron 160–220 MPa. Young’s modulus: copper 110–128 GPa, wrought iron about 190 GPa (handbook values).',
  },
  {
    claim: 'The ingot counts at the vice: 3, 3, 8 and 2.',
    basis: 'modelled',
    source: 'Authored test strips, sized so each answer is a whole number of ingots. The order is real; the counts are ours.',
  },
]
