/**
 * S2 — The Cart That Must Leave: the cold bench, the balance, the charge.
 *
 * Storyboard v3.1 (§03 M3, §04, §06) and the mock review of 28–29 Sep. Pure:
 * no store, no React. The bench is a small state machine over a set of scrap
 * pieces; the numbers are the worked batch — a pattern of 1,000 cm³, copper at
 * 8.96 g/cm³, so 8,960 g of copper and one ingot (896 g) for the runner.
 *
 * The safety rule is state, not text: what goes in the water (the pattern, the
 * scrap) never goes to the fire. The wet set is balanced against DRY ingots,
 * and only the dry pan is charged. `verify-supply-model.mjs` pins all of this.
 *
 * Round A2 adds the mould: every pour is on a record, a short pour sends the
 * cold cast back to the dry pan (it is dry copper; it never met the water),
 * and a full one is the kit — once.
 */

/* ----------------------------------------------------------------------------
 * Reference facts (sourced in the storyboard §06)
 * ------------------------------------------------------------------------- */

/** Copper, solid, g/cm³ — CRC Handbook; RSC periodic table. */
export const RHO_CU = 8.96
/** Iron, solid, g/cm³ — the Engineer's grey lump. */
export const RHO_FE = 7.87
/** The gate pattern's volume: straps and pins, cm³ (authored batch). */
export const PATTERN_CM3 = 1000
/** Water in the jug before anything goes in, cm³. */
export const JUG_START = 1500
/** The jug's brim, cm³. */
export const JUG_MAX = 3000
/** One dry ingot: 100 cm³ of copper. */
export const INGOT_CM3 = 100
export const INGOT_G = 896
/** Sefu's allowance for the channel: one ingot, 10 % of the finished copper. It comes back. */
export const RUNNER_G = 896
/** The beam reads level within this, grams. */
export const LEVEL_G = 50
/** Below this fraction of the mould the last pin seat never fills. */
export const PIN_SEAT_FRACTION = 0.9

/* ----------------------------------------------------------------------------
 * The scrap
 * ------------------------------------------------------------------------- */

export type Metal = 'copper' | 'iron'
export type PieceShape = 'nugget' | 'pin' | 'offcut' | 'knob' | 'drip' | 'bell' | 'lump'

export interface Piece {
  id: string
  /** Volume, cm³ — what the jug measures. */
  cm3: number
  metal: Metal
  shape: PieceShape
}

/** Six copper pieces that add to exactly the pattern; any five stop short. */
export const SCRAP: Piece[] = [
  { id: 'scrap.nugget', cm3: 100, metal: 'copper', shape: 'nugget' },
  { id: 'scrap.pin', cm3: 100, metal: 'copper', shape: 'pin' },
  { id: 'scrap.offcut', cm3: 200, metal: 'copper', shape: 'offcut' },
  { id: 'scrap.knob', cm3: 200, metal: 'copper', shape: 'knob' },
  { id: 'scrap.drip', cm3: 200, metal: 'copper', shape: 'drip' },
  { id: 'scrap.bell', cm3: 200, metal: 'copper', shape: 'bell' },
]

/** The Engineer's suspect: the size of a copper lump, iron all through. */
export const GREY_LUMP: Piece = { id: 'scrap.grey', cm3: 100, metal: 'iron', shape: 'lump' }

export type BandId = 'explorer' | 'scientist' | 'analyst'

/** What is in the tray for a band: the Analyst's tray carries the grey lump too. */
export function trayFor(band: BandId): Piece[] {
  return band === 'analyst' ? [...SCRAP, GREY_LUMP] : SCRAP
}

export const PIECES: Record<string, Piece> = Object.fromEntries([...SCRAP, GREY_LUMP].map((p) => [p.id, p]))

export function pieceOf(id: string): Piece | undefined {
  return PIECES[id]
}

export function densityOf(p: Piece): number {
  return p.metal === 'copper' ? RHO_CU : RHO_FE
}

/** Mass, grams, rounded to the gram. */
export function massOf(p: Piece): number {
  return Math.round(densityOf(p) * p.cm3)
}

/* ----------------------------------------------------------------------------
 * The jug
 * ------------------------------------------------------------------------- */

export function markLevel(): number {
  return JUG_START + PATTERN_CM3
}

export function matchedCm3(inJug: Piece[]): number {
  return inJug.reduce((sum, p) => sum + p.cm3, 0)
}

export function copperCm3(inJug: Piece[]): number {
  return inJug.filter((p) => p.metal === 'copper').reduce((sum, p) => sum + p.cm3, 0)
}

/** Where the water stands, cm³ on the jug's scale. */
export function jugLevel(inJug: Piece[], patternIn: boolean): number {
  return JUG_START + matchedCm3(inJug) + (patternIn ? PATTERN_CM3 : 0)
}

export function toMark(inJug: Piece[]): number {
  return Math.max(0, markLevel() - jugLevel(inJug, false))
}

export function reachedMark(inJug: Piece[]): boolean {
  return jugLevel(inJug, false) >= markLevel()
}

/** What the wet set weighs, grams. */
export function wetMass(inJug: Piece[]): number {
  return inJug.reduce((sum, p) => sum + massOf(p), 0)
}

/** What that much copper should weigh: density × volume. */
export function predictedMass(cm3: number): number {
  return Math.round(RHO_CU * cm3)
}

/** What the mould needs, grams of copper. */
export function needG(): number {
  return predictedMass(PATTERN_CM3)
}

/* ----------------------------------------------------------------------------
 * The balance
 * ------------------------------------------------------------------------- */

/** The beam's lean: +1 dry side heavy, −1 light, 0 level. Saturates at one ingot. */
export function beamTilt(dryIngots: number, wetG: number): number {
  const diff = dryIngots * INGOT_G - wetG
  if (Math.abs(diff) <= LEVEL_G) return 0
  return Math.max(-1, Math.min(1, diff / INGOT_G))
}

export function isLevel(dryIngots: number, wetG: number): boolean {
  return Math.abs(dryIngots * INGOT_G - wetG) <= LEVEL_G
}

export function nearestLevel(wetG: number): number {
  return Math.round(wetG / INGOT_G)
}

/** Grams that go to the fire: the dry ingots, and the runner if Sefu added it. */
export function chargeOf(dryIngots: number, runner: boolean): number {
  return dryIngots * INGOT_G + (runner ? RUNNER_G : 0)
}

export interface Cast {
  /** How much of the mould filled, 0..1. */
  fraction: number
  short: boolean
  /** Under 90 %: the last pin seat never fills. */
  pinSeatMissing: boolean
  /** Copper beyond the mould plus the runner: back to the recovery tray, grams. */
  spareG: number
}

/** What the mould gives for a charge of dry ingots (the runner is never in the strap). */
export function castOf(dryIngots: number): Cast {
  const copper = dryIngots * INGOT_G
  const need = needG()
  const fraction = Math.min(1, Math.round((copper / need) * 1000) / 1000)
  return {
    fraction,
    short: fraction < 1,
    pinSeatMissing: fraction < PIN_SEAT_FRACTION,
    spareG: Math.max(0, copper - need) + RUNNER_G,
  }
}

/* ----------------------------------------------------------------------------
 * The bench — a state machine over the pieces
 * ------------------------------------------------------------------------- */

export type BenchPhase = 'idle' | 'pattern' | 'marked' | 'matching' | 'balancing' | 'charged'

export interface Bench {
  phase: BenchPhase
  /** Pieces in the water, in the order they went in. Also the wet set on the pan. */
  inJug: string[]
  patternIn: boolean
  marked: boolean
  /** Volume matched when the set went to the balance, cm³. */
  matched: number | null
  /** Dry ingots on the other pan. */
  dry: number
  /** Sefu's runner ingot, added at the charge. */
  runner: boolean
  /** Pieces the child weighed and sank alone at the balance. */
  inspected: string[]
  /** The pan went to the fire without the beam level: a guess, and Sefu says so. */
  sentUnlevel: boolean
  /** Grams sent to the fire, once charged. */
  charge: number | null
  /** Times a short cast has come back from the mould. */
  recasts: number
  /** The cold short cast on the dry pan, as ingots' worth. It is one piece: it never comes off the pan. */
  castDry: number
}

export function initialBench(): Bench {
  return { phase: 'idle', inJug: [], patternIn: false, marked: false, matched: null, dry: 0, runner: false, inspected: [], sentUnlevel: false, charge: null, recasts: 0, castDry: 0 }
}

const piecesIn = (b: Bench): Piece[] => b.inJug.map((id) => PIECES[id]).filter((p): p is Piece => !!p)

export function benchLevel(b: Bench): number {
  return jugLevel(piecesIn(b), b.patternIn)
}
export function benchToMark(b: Bench): number {
  return toMark(piecesIn(b))
}
export function benchReached(b: Bench): boolean {
  return reachedMark(piecesIn(b))
}
export function benchWetMass(b: Bench): number {
  return wetMass(piecesIn(b))
}
export function benchPredicted(b: Bench): number {
  return predictedMass(b.matched ?? matchedCm3(piecesIn(b)))
}
/** Measured minus predicted, grams: negative when the set weighs less than its volume says. */
export function benchGap(b: Bench): number {
  return benchWetMass(b) - benchPredicted(b)
}
export function benchTilt(b: Bench): number {
  return beamTilt(b.dry, benchWetMass(b))
}
/** Named with a trailing underscore so the water level keeps `benchLevel`. */
export function benchLevel_(b: Bench): boolean {
  return b.phase === 'balancing' && isLevel(b.dry, benchWetMass(b))
}
export function runnerOffered(b: Bench): boolean {
  return benchLevel_(b)
}

export function sinkPattern(b: Bench): Bench {
  if (b.phase !== 'idle') return b
  return { ...b, phase: 'pattern', patternIn: true }
}

export function markRise(b: Bench): Bench {
  if (b.phase !== 'pattern') return b
  return { ...b, phase: 'marked', marked: true }
}

export function liftPattern(b: Bench): Bench {
  if (b.phase !== 'marked') return b
  return { ...b, phase: 'matching', patternIn: false }
}

/** A piece from the tray into the water. Only while matching; never twice. */
export function drop(b: Bench, id: string): Bench {
  if (b.phase !== 'matching' || !PIECES[id] || b.inJug.includes(id)) return b
  return { ...b, inJug: [...b.inJug, id] }
}

/** A piece out of the water. At the balance this empties the pan back to the jug. */
export function take(b: Bench, id: string): Bench {
  if ((b.phase !== 'matching' && b.phase !== 'balancing') || !b.inJug.includes(id)) return b
  return { ...b, phase: 'matching', matched: null, inJug: b.inJug.filter((x) => x !== id) }
}

/** The set as it stands goes to the balance — at the mark or not (a short charge is a lesson). */
export function done(b: Bench): Bench {
  if (b.phase !== 'matching' || b.inJug.length === 0) return b
  return { ...b, phase: 'balancing', matched: matchedCm3(piecesIn(b)) }
}

export const MAX_INGOTS = 14

export function addIngot(b: Bench): Bench {
  if (b.phase !== 'balancing' || b.dry >= MAX_INGOTS) return b
  return { ...b, dry: b.dry + 1 }
}

export function takeIngot(b: Bench): Bench {
  if (b.phase !== 'balancing' || b.dry <= b.castDry) return b
  return { ...b, dry: b.dry - 1 }
}

/** Weigh and sink one piece of the set alone: what the Engineer does when the beam will not level. */
export function inspect(b: Bench, id: string): Bench {
  if (b.phase !== 'balancing' || !b.inJug.includes(id) || b.inspected.includes(id)) return b
  return { ...b, inspected: [...b.inspected, id] }
}

/** The dry pan goes to the fire with Sefu's runner. Level or not — a guess is flagged. */
export function toFire(b: Bench): Bench {
  if (b.phase !== 'balancing' || b.dry === 0) return b
  return { ...b, phase: 'charged', runner: true, sentUnlevel: !isLevel(b.dry, benchWetMass(b)), charge: chargeOf(b.dry, true) }
}

/** The bench opens once the furnace has reached copper heat, or for a save that already poured — and, once opened, stays open. */
export function benchOpens(f: { temp: number; poured: boolean; opened?: boolean }): boolean {
  return f.poured || !!f.opened || f.temp >= 1085
}

/* ----------------------------------------------------------------------------
 * The mould (round A2) — the pours, on a record
 * ------------------------------------------------------------------------- */

/** Copper runs at this reading: the relight's own hand-in tolerance under 1,085 °C. */
export const POUR_AT_C = 1045

export function hotEnough(temp: number): boolean {
  return temp >= POUR_AT_C
}

/** One pour into the gate mould: what went in, and what the mould gave. */
export interface Pour extends Cast {
  /** Dry copper in the crucible, as ingots' worth. */
  dry: number
  /** Grams to the fire: the dry copper and the runner. */
  chargeG: number
  /** The pan went without the beam level. */
  guess: boolean
}

export interface CastRecord {
  pours: Pour[]
  /** "Which measurement told you how much?" — the option chosen, −1 until answered. */
  why: number
  /** The same, in the learner's own words (Investigator, Engineer), when the judge took it. */
  whyText: string | null
}

export function initialCast(): CastRecord {
  return { pours: [], why: -1, whyText: null }
}

export function lastPour(c: CastRecord | null | undefined): Pour | null {
  return c && c.pours.length ? c.pours[c.pours.length - 1] : null
}

/** The fittings are cast: the last pour filled the mould. One kit, ever. */
export function kitCast(c: CastRecord | null | undefined): boolean {
  const p = lastPour(c)
  return !!p && !p.short
}

/** How much of the pattern's volume the pour filled, cm³. */
export function castCm3(p: Pour): number {
  return Math.round(p.fraction * PATTERN_CM3)
}

/** Copper that stayed in the mould, grams. */
export function castG(p: Pour): number {
  return Math.min(p.dry * INGOT_G, needG())
}

/** Copper the mould still wanted, grams. */
export function missingG(p: Pour): number {
  return needG() - castG(p)
}

/**
 * What stands at the furnace foot: nothing yet, a charge waiting for the
 * pour, a short cast cooling in the open mould, or the fittings.
 */
export type MouldStage = 'empty' | 'charged' | 'short' | 'full'

export function mouldStage(b: Bench | null | undefined, c: CastRecord | null | undefined): MouldStage {
  if (kitCast(c)) return 'full'
  if (!b || b.phase !== 'charged') return 'empty'
  // Every return to the bench answers one short pour; a charge beyond that has not been poured yet.
  return (c?.pours.length ?? 0) > b.recasts ? 'short' : 'charged'
}

/** Sefu pours the charge. Only a waiting charge pours; a cast kit is never poured again. */
export function pourCharge(b: Bench, c: CastRecord): CastRecord {
  if (mouldStage(b, c) !== 'charged') return c
  const pour: Pour = { ...castOf(b.dry), dry: b.dry, chargeG: b.charge ?? chargeOf(b.dry, true), guess: b.sentUnlevel }
  return { ...c, pours: [...c.pours, pour] }
}

/**
 * A short cast, once dull, goes on the dry pan and the child goes back to find
 * what is missing: to the jug if the water never reached the mark, else to the
 * balance. The runner returns to Sefu until the next charge.
 */
export function backToBench(b: Bench, c: CastRecord): Bench {
  if (mouldStage(b, c) !== 'short') return b
  const atMark = benchReached(b)
  return { ...b, phase: atMark ? 'balancing' : 'matching', matched: atMark ? b.matched : null, runner: false, sentUnlevel: false, charge: null, recasts: b.recasts + 1, castDry: b.dry }
}

/**
 * The pour's beats, in seconds of sim time: the channel runs, the metal dulls
 * (nobody touches it bright), the mould opens. The scene and the HUD read the
 * beat off the clock; nothing else times it.
 */
export const POUR_BEATS = { run: 2.6, cool: 3.4, open: 0.8 } as const
export const POUR_TOTAL = 6.8
export type PourBeat = 'run' | 'cool' | 'open' | 'done'

export function pourBeat(elapsed: number): PourBeat {
  if (elapsed < POUR_BEATS.run) return 'run'
  if (elapsed < POUR_BEATS.run + POUR_BEATS.cool) return 'cool'
  if (elapsed < POUR_TOTAL) return 'open'
  return 'done'
}

/** What the mould looks like now: cold, a charge waiting, a beat of the pour, or what the pour gave. */
export type MouldLook = 'cold' | 'waiting' | 'run' | 'cool' | 'open' | 'short' | 'full'

/** `elapsed` is seconds since the last pour began; null when no clock is running (a restored, settled pour). */
export function mouldLook(stage: MouldStage, elapsed: number | null): MouldLook {
  if (stage === 'empty') return 'cold'
  if (stage === 'charged') return 'waiting'
  const beat = elapsed == null ? 'done' : pourBeat(elapsed)
  return beat === 'done' ? stage : beat
}
