/**
 * The Numberworks — the pure model behind Door 1, The Market.
 *
 * A stall at Kejetia, Kumasi. The learner puts a price on the board, opens the
 * stall, and a seeded crowd of shoppers walks the alley: each one has a limit
 * they will pay for a tomato and a number they want, so the till at closing is
 * a function of price and stock and nothing else. That function has a hump —
 * more per tomato but fewer tomatoes, or the other way round — and finding the
 * hump is the first thing a market teaches about number.
 *
 * Three rules, each closing an easier design:
 *
 * 1. **One day, one solve.** `simulateDay` is what the score reads; `stepDay`
 *    replays the same day in real time so the picture and the till cannot
 *    disagree. The shoppers come from the seed, so a link lands on the same
 *    crowd.
 * 2. **The number comes before the world moves.** Every round opens on a
 *    number the learner TYPES — how many tomatoes is ₵200 — at every depth,
 *    Explorer included (review 1, 11 Sep: the recording opened on falling
 *    tomatoes and the maths had gone missing). Ploob repeats the number back;
 *    the day is what proves it. Recorded as a prediction, so it is evidence,
 *    and it is the first line of the stamp. Later days ask for the till.
 * 3. **Score is not XP.** A hand-in awards a `ChallengeScore` and a journal
 *    card; XP comes only from recorded evidence.
 *
 * Numbers: the wholesale basin and the retail range are placeholders to be set
 * from a dated Kejetia survey before the round ships (see PRICE_SOURCE). The
 * demand ceiling is a model, and the brief says so. Currency is the cedi, with
 * a slot per language (CURRENCY) — the maths never changes, the board does.
 *
 * Pure: no React, no three, no browser. Checked by `verify-market-model.mjs`.
 */

import type { Band } from './bands'
import {
  CHALLENGE_VERSION,
  rngFor,
  seedFromCode,
  scoreAttempt,
  type Challenge,
  type ChallengeAttempt,
  type ChallengeScore,
  type ResourceBudget,
} from './challenge'

/* ------------------------------------------------------------------ */
/* The venue                                                           */
/* ------------------------------------------------------------------ */

/** Language-keyed later: the Twi voice says it as Kumasi does. */
export const VENUE = { name: 'Kejetia', city: 'Kumasi', sign: 'KEJETIA' }

/** A slot per language later (naira, shilling); the numbers on the board change, the maths does not. */
export const CURRENCY = { code: 'GHS', symbol: '₵', name: 'cedi' }

/**
 * Where the prices come from. Placeholder values until the round ships; the
 * survey date and source travel with the numbers so nobody has to guess later.
 */
export const PRICE_SOURCE = { survey: 'Kejetia market, Kumasi — to be surveyed before release', date: '2026-09-11', note: 'placeholder figures; the demand ceiling is a model' }

/** A basin holds this many; the gather round can fill it, never past it. */
export const BASIN_MAX = 60
/** The wholesale basin: sixty tomatoes for ₵180, so ₵3 each. */
export const WHOLESALE = { count: 60, price: 180 }
/** About eight medium tomatoes to a kilo. */
export const TOMATOES_PER_KG = 8
/** Above this nobody buys — the hatched dead zone on the price dial starts a little below it. */
export const PRICE_CEILING = 5.5
export const PRICE_SOFT_CEILING = 5.0
export const PRICE_MIN = 1
/** The market clock: opens at 7, closes at 18. A day plays in DAY_SECONDS of wall time. */
export const OPEN_HOUR = 7
export const CLOSE_HOUR = 18
export const DAY_SECONDS = 8
/** The four o'clock discount, as a fraction of the day. */
export const DISCOUNT_HOUR = 16

export function dayFractionOfHour(h: number): number {
  return (h - OPEN_HOUR) / (CLOSE_HOUR - OPEN_HOUR)
}

/** "3:40 pm" for a fraction of the day. */
export function clockLabel(t: number): string {
  const hours = OPEN_HOUR + Math.max(0, Math.min(1, t)) * (CLOSE_HOUR - OPEN_HOUR)
  const h = Math.floor(hours)
  const m = Math.floor((hours - h) * 60)
  const ampm = h >= 12 ? 'pm' : 'am'
  const hh = h > 12 ? h - 12 : h
  return `${hh}:${m < 10 ? '0' : ''}${m} ${ampm}`
}

export function cedis(v: number, dp = 0): string {
  return `${CURRENCY.symbol}${v.toFixed(dp)}`
}

/* ------------------------------------------------------------------ */
/* Doors                                                               */
/* ------------------------------------------------------------------ */

export type DoorId = 1 | 2 | 3 | 4 | 5 | 6

export interface Door {
  id: DoorId
  name: string
  /** The game in three words. */
  game: string
  /** What the learner does there, in a sentence. */
  where: string
  built: boolean
}

export const DOORS: Door[] = [
  { id: 1, name: 'The Market', game: 'Fill the till', where: 'a stall at Kejetia: price, weigh, sell', built: true },
  { id: 2, name: 'Algebra Machines', game: 'Run it backwards', where: 'the mill: a number in, a number out', built: false },
  { id: 3, name: 'Geometry Workshop', game: 'Cut it to fit', where: 'the carpenter and the weaver', built: false },
  { id: 4, name: 'Probability Fair', game: 'Beat the odds', where: 'honest games at the edge of the market', built: false },
  { id: 5, name: 'Data Detective', game: 'Read the graph', where: 'the newspaper office upstairs', built: false },
  { id: 6, name: 'Modelling Studio', game: 'Fit the curve', where: 'the studio over the market', built: false },
]

export const DOOR_BY_ID: Record<number, Door> = Object.fromEntries(DOORS.map((d) => [d.id, d]))

/* ------------------------------------------------------------------ */
/* Shoppers and the day                                                */
/* ------------------------------------------------------------------ */

export interface Shopper {
  /** When they reach the stall, as a fraction of the day. */
  at: number
  /** The most they will pay for one tomato, in cedis. */
  limit: number
  /** How many they want. */
  want: number
  /** Which of the three cutouts walks — a look, not a behaviour. */
  look: 0 | 1 | 2
}

export const SHOPPERS_PER_DAY = 40

/**
 * The crowd, from the seed and nothing else. Limits sit between ₵3.20 and
 * ₵5.50 — so at ₵4 about two in three buy, at ₵5 about one in five, and above
 * ₵5.50 nobody. Wants are one to four tomatoes. Both are the model's, and the
 * brief says so.
 */
export function shoppersFor(seed: number, n = SHOPPERS_PER_DAY): Shopper[] {
  const rng = rngFor(seed ^ 0x6d6b74)
  const out: Shopper[] = []
  for (let i = 0; i < n; i++) {
    out.push({
      at: 0.03 + rng() * 0.94,
      limit: Math.round((3.2 + rng() * (PRICE_CEILING - 3.2)) * 100) / 100,
      want: 1 + Math.floor(rng() * 4),
      look: Math.floor(rng() * 3) as 0 | 1 | 2,
    })
  }
  return out.sort((a, b) => a.at - b.at)
}

export interface PriceSchedule {
  /** Cedis per tomato on the board. */
  price: number
  /** A discount, as a fraction, from DISCOUNT_HOUR onwards. 0 = none. */
  discount: number
}

/** The price a shopper actually sees at a moment of the day. */
export function priceAt(s: PriceSchedule, t: number): number {
  const late = t >= dayFractionOfHour(DISCOUNT_HOUR)
  return late && s.discount > 0 ? Math.round(s.price * (1 - s.discount) * 100) / 100 : s.price
}

export interface Sale {
  at: number
  n: number
  paid: number
  shopper: number
}

export interface DayResult {
  sold: number
  till: number
  unsold: number
  /** Shoppers who looked and walked on. */
  passed: number
  sales: Sale[]
}

/** The whole day at once — what the score reads. */
export function simulateDay(shoppers: Shopper[], stock: number, schedule: PriceSchedule): DayResult {
  let left = Math.max(0, Math.floor(stock))
  let till = 0
  let passed = 0
  const sales: Sale[] = []
  shoppers.forEach((s, i) => {
    if (left <= 0) return
    const p = priceAt(schedule, s.at)
    if (p > s.limit + 1e-9) {
      passed += 1
      return
    }
    const n = Math.min(s.want, left)
    left -= n
    const paid = Math.round(n * p * 100) / 100
    till = Math.round((till + paid) * 100) / 100
    sales.push({ at: s.at, n, paid, shopper: i })
  })
  return { sold: Math.floor(stock) - left, till, unsold: left, passed, sales }
}

/**
 * The same day, replayed. `t` is the fraction of the day so far; `stepDay`
 * settles every shopper whose moment has come. Nothing here can end up
 * different from `simulateDay` on the same inputs — that is the point.
 */
export interface DayRun {
  shoppers: Shopper[]
  stock0: number
  schedule: PriceSchedule
  t: number
  /** Index of the next shopper to settle. */
  next: number
  sold: number
  till: number
  unsold: number
  passed: number
  /** Which shoppers looked at the board and walked on, in order. */
  passes: number[]
  sales: Sale[]
  done: boolean
  /** The last thing that happened, for the picture and Ploob. */
  last: { kind: 'sale' | 'pass'; shopper: number; n: number } | null
}

export function startDay(shoppers: Shopper[], stock: number, schedule: PriceSchedule): DayRun {
  return { shoppers, stock0: Math.floor(stock), schedule, t: 0, next: 0, sold: 0, till: 0, unsold: Math.floor(stock), passed: 0, passes: [], sales: [], done: false, last: null }
}

/** Advance by a fraction of the day. Returns the run for chaining. */
export function stepDay(run: DayRun, dt: number): DayRun {
  if (run.done) return run
  run.t = Math.min(1, run.t + Math.max(0, dt))
  run.last = null
  while (run.next < run.shoppers.length && run.shoppers[run.next].at <= run.t) {
    const i = run.next
    const s = run.shoppers[i]
    run.next += 1
    if (run.unsold <= 0) continue
    const p = priceAt(run.schedule, s.at)
    if (p > s.limit + 1e-9) {
      run.passed += 1
      run.passes.push(i)
      run.last = { kind: 'pass', shopper: i, n: 0 }
      continue
    }
    const n = Math.min(s.want, run.unsold)
    run.unsold -= n
    run.sold += n
    const paid = Math.round(n * p * 100) / 100
    run.till = Math.round((run.till + paid) * 100) / 100
    run.sales.push({ at: s.at, n, paid, shopper: i })
    run.last = { kind: 'sale', shopper: i, n }
  }
  if (run.t >= 1) run.done = true
  return run
}

/** Close early: settle the day as it stands. */
export function closeDay(run: DayRun): DayRun {
  run.done = true
  return run
}

/** Profit on the day, as a fraction of what the basin cost. */
export function profitOf(till: number, cost: number): number {
  return cost > 0 ? (till - cost) / cost : 0
}

/* ------------------------------------------------------------------ */
/* The Harmattan price — a sequence, and an instrument's accuracy     */
/* ------------------------------------------------------------------ */

/** Four mornings on the board, growing by a fixed fraction a day. */
export const HARMATTAN = {
  /** ₵ per kilo on Monday. */
  p0: 24,
  /** The daily multiplier. */
  r: 1.15,
  days: ['Mon', 'Tue', 'Wed', 'Thu'] as const,
  /** Today's weight sold, in kilos, read off a scale that shows the nearest 50 g. */
  kilos: 6.2,
  scaleStep: 0.05,
}

export function harmattanPrice(day: number): number {
  return Math.round(HARMATTAN.p0 * Math.pow(HARMATTAN.r, day) * 100) / 100
}

/** The four prices on the board. */
export function harmattanBoard(): number[] {
  return HARMATTAN.days.map((_, i) => harmattanPrice(i))
}

/** Friday. */
export function harmattanFriday(): number {
  return harmattanPrice(4)
}

/**
 * The scale reads to the nearest 50 g, so the kilos sold today could be up to
 * 25 g either way — and the takings with them. The half-width of that band,
 * in cedis, at Thursday's price.
 */
export function harmattanBound(): number {
  return Math.round(harmattanPrice(3) * (HARMATTAN.scaleStep / 2) * 100) / 100
}

/* ------------------------------------------------------------------ */
/* Levels                                                              */
/* ------------------------------------------------------------------ */

export type LevelKind = 'fill' | 'ratio' | 'harmattan'

export interface Level {
  id: string
  door: DoorId
  /** 1, 2, 3 — the level you can hit at Explorer; the one that needs the rule; the one that needs the number. */
  tier: 1 | 2 | 3
  kind: LevelKind
  /** Seven words or fewer. This is the Play button's label. */
  title: string
  /** One sentence the brief opens with. */
  blurb: string
  /** The guess the brief asks for, before the model is shown. */
  guess: { question: string; answer: number; min: number; max: number; step: number; unit: string }
  /** The one name the measured thing has everywhere. */
  metric: { id: 'till' | 'profit' | 'price'; label: string; unit: string }
  /** What the gauge asks for. */
  target: { direction: 'atLeast' | 'near'; value: number; tolerance: number }
  /** A second thing the round must also satisfy, or none. */
  condition?: 'fewLeft' | 'boundsStated'
  /** What the score's thrift term reads against. */
  budget: ResourceBudget
  /** Seconds of catching for a band that gathers. */
  gatherSeconds: number
  /** The line Ploob opens the round with (after answering the guess). */
  open: string
  /** What Ploob says the moment the target is met. */
  done: string
}

export const FEW_LEFT = 5
/**
 * How close a stated bound has to be, in cedis. Half a scale step at
 * Thursday's price is about ₵0.91; a tenth of a cedi means the learner did the
 * multiplication, not a guess anywhere near one.
 */
export const BOUND_TOLERANCE = 0.1

export const LEVELS: Level[] = [
  {
    id: 'fill-the-till',
    door: 1,
    tier: 1,
    kind: 'fill',
    title: 'Fill the till by closing time',
    blurb: 'A basin of tomatoes, a chalk board, a till. Put a price on one tomato and see what the market does with it.',
    guess: {
      question: `If one tomato sells for ${cedis(4)}, how many do you have to sell to close with ${cedis(200)} in the till?`,
      answer: 50,
      min: 10,
      max: 100,
      step: 1,
      unit: 'tomatoes',
    },
    metric: { id: 'till', label: 'Money in the till', unit: CURRENCY.symbol },
    target: { direction: 'atLeast', value: 200, tolerance: 0 },
    budget: { tomatoes: BASIN_MAX },
    gatherSeconds: 45,
    open: 'Open the stall, and let the alley check your number.',
    done: `${cedis(200)} in the till. Every tomato went out at a price a shopper would pay. Hand it in.`,
  },
  {
    id: 'wholesale-ratio',
    door: 1,
    tier: 2,
    kind: 'ratio',
    title: 'Make a quarter more than you paid',
    blurb: `The basin cost ${cedis(WHOLESALE.price)} wholesale for ${WHOLESALE.count} tomatoes. Sell by the kilo, mark it up, and end the day a quarter up — with almost nothing left.`,
    guess: {
      question: `${cedis(WHOLESALE.price)} for ${WHOLESALE.count} tomatoes. What did one tomato cost you?`,
      answer: 3,
      min: 1,
      max: 6,
      step: 0.5,
      unit: `${CURRENCY.symbol} each`,
    },
    metric: { id: 'profit', label: 'Profit on the day', unit: '%' },
    target: { direction: 'atLeast', value: 25, tolerance: 0 },
    condition: 'fewLeft',
    budget: { tomatoes: BASIN_MAX },
    gatherSeconds: 0,
    open: `${cedis(WHOLESALE.price)} shared ${WHOLESALE.count} ways is what one tomato cost you; ${TOMATOES_PER_KG} to a kilo makes the kilo price. Mark it up and open the stall.`,
    done: 'A quarter up, and the basin near empty. The mark-up sets the profit per kilo; the ceiling sets how many kilos go. Hand it in.',
  },
  {
    id: 'harmattan-price',
    door: 1,
    tier: 3,
    kind: 'harmattan',
    title: "Name Friday's price within fifty pesewas",
    blurb: 'The glut is over and the price has climbed the same fraction every morning this week. Four mornings are on the board. Say Friday.',
    guess: {
      question: `Monday was ${cedis(harmattanPrice(0), 2)} a kilo and Tuesday ${cedis(harmattanPrice(1), 2)}. What did Tuesday multiply Monday by?`,
      answer: HARMATTAN.r,
      min: 1,
      max: 1.5,
      step: 0.01,
      unit: '×',
    },
    metric: { id: 'price', label: "Friday's price", unit: `${CURRENCY.symbol} per kilo` },
    target: { direction: 'near', value: harmattanFriday(), tolerance: 0.5 },
    condition: 'boundsStated',
    budget: { predictions: 3 },
    gatherSeconds: 0,
    open: `Tuesday over Monday is the ratio — and Wednesday is that ratio times Tuesday again. Carry it to Friday, and say how far today's takings could be off, from what the scale can read.`,
    done: 'Friday named, bounds stated. A fixed fraction a day is a sequence that multiplies, not a line that adds. Hand it in.',
  },
]

export const LEVEL_BY_ID: Record<string, Level> = Object.fromEntries(LEVELS.map((l) => [l.id, l]))

/** Which tier the band opens on. Explorer starts at 1, Scientist at 2, Analyst at 3 — all three stay reachable. */
export function levelForBand(band: Band, door: DoorId = 1): Level {
  const tier: 1 | 2 | 3 = band === 'explorer' ? 1 : band === 'scientist' ? 2 : 3
  return LEVELS.find((l) => l.door === door && l.tier === tier) ?? LEVELS[0]
}

/* ------------------------------------------------------------------ */
/* The stall's state — what the HUD holds and the gauge reads         */
/* ------------------------------------------------------------------ */

export interface StallState {
  /** Tomatoes in the basin before the day. */
  stock: number
  /** Cedis per tomato on the board (levels 1 and 2). */
  price: number
  /** Mark-up over cost, as a fraction (level 2). */
  markup: number
  /** The four o'clock discount, as a fraction (level 2). */
  discount: number
  /** The last day run, if any. */
  day: DayResult | null
  /** Level 3: the learner's prediction for Friday, ₵ per kilo. */
  prediction: number | null
  /** Level 3: the learner's stated half-width on today's takings, in cedis. */
  bound: number | null
  /** The number typed at the brief (level 1: tomatoes to sell; 2: cost each; 3: the ratio). */
  guess: number | null
  /** Level 1, days after the first: the till the learner said this day would make. */
  tillGuess: number | null
  /** Which day of the level this is (1-based); the day's question depends on it. */
  dayIndex: number
  /** Whether the last day run met the target — the next day's question depends on it. */
  lastHit: boolean | null
}

export function startStall(level: Level, stock: number): StallState {
  return {
    stock: Math.min(BASIN_MAX, Math.max(0, Math.floor(stock))),
    price: level.kind === 'ratio' ? Math.round(costPerTomato() * 1.3 * 100) / 100 : 4,
    markup: 0.3,
    discount: 0,
    day: null,
    prediction: null,
    bound: null,
    guess: null,
    tillGuess: null,
    dayIndex: 1,
    lastHit: null,
  }
}

export function costPerTomato(): number {
  return WHOLESALE.price / WHOLESALE.count
}

/** Level 2 prices by mark-up; levels 1 and 3 by the board. */
export function scheduleOf(level: Level, s: StallState): PriceSchedule {
  if (level.kind === 'ratio') {
    return { price: Math.round(costPerTomato() * (1 + s.markup) * 100) / 100, discount: s.discount }
  }
  return { price: s.price, discount: 0 }
}

/** The kilo price the board shows at level 2. */
export function kiloPrice(perTomato: number): number {
  return Math.round(perTomato * TOMATOES_PER_KG * 100) / 100
}

/* ------------------------------------------------------------------ */
/* The gauge                                                           */
/* ------------------------------------------------------------------ */

export interface GaugeCell {
  id: 'till' | 'profit' | 'left' | 'price' | 'bound'
  label: string
  value: string
  want: string
  met: boolean
  /** What is left to do, in the learner's words — empty when met. */
  todo: string
  /** For the bar: 0..1 of the way to the target. */
  progress: number
}

export interface Gauge {
  cells: GaugeCell[]
  met: number
  of: number
  hit: boolean
  /** The headline reading in the metric's units, for the score. */
  best: number
}

export function gaugeFor(level: Level, s: StallState): Gauge {
  const cells: GaugeCell[] = []
  const day = s.day
  if (level.kind === 'fill') {
    const till = day?.till ?? 0
    const met = till >= level.target.value - 1e-9
    cells.push({
      id: 'till',
      label: level.metric.label,
      value: cedis(till),
      want: `${cedis(level.target.value)} by closing`,
      met,
      todo: met ? '' : day ? `${cedis(level.target.value - till)} short` : 'open the stall',
      progress: Math.min(1, till / level.target.value),
    })
    return { cells, met: met ? 1 : 0, of: 1, hit: met, best: till }
  }
  if (level.kind === 'ratio') {
    const till = day?.till ?? 0
    const profit = day ? profitOf(till, WHOLESALE.price) * 100 : 0
    const metProfit = !!day && profit >= level.target.value - 1e-9
    const left = day ? day.unsold : s.stock
    const metLeft = !!day && left <= FEW_LEFT
    cells.push({
      id: 'profit',
      label: level.metric.label,
      value: day ? `${profit.toFixed(0)} %` : '—',
      want: `≥ ${level.target.value} %`,
      met: metProfit,
      todo: metProfit ? '' : day ? (profit < 0 ? `${cedis(WHOLESALE.price - till)} below what you paid` : `${(level.target.value - profit).toFixed(0)} points short`) : 'open the stall',
      progress: day ? Math.max(0, Math.min(1, profit / level.target.value)) : 0,
    })
    cells.push({
      id: 'left',
      label: 'Left in the basin',
      value: `${left}`,
      want: `≤ ${FEW_LEFT}`,
      met: metLeft,
      todo: metLeft ? '' : day ? `${left - FEW_LEFT} too many left — cut the price later, or earlier` : 'open the stall',
      progress: day ? Math.max(0, Math.min(1, 1 - Math.max(0, left - FEW_LEFT) / BASIN_MAX)) : 0,
    })
    const met = cells.filter((c) => c.met).length
    return { cells, met, of: 2, hit: met === 2, best: day ? profit : 0 }
  }
  // harmattan
  const friday = harmattanFriday()
  const p = s.prediction
  const miss = p === null ? null : Math.abs(p - friday)
  const metPrice = miss !== null && miss <= level.target.tolerance + 1e-9
  cells.push({
    id: 'price',
    label: level.metric.label,
    value: p === null ? '—' : cedis(p, 2),
    want: `within ${cedis(level.target.tolerance, 2)}`,
    met: metPrice,
    // Never the size of the miss: a gauge that says "₵0.32 low" is a dial
    // that finds Friday in two locks with no reasoning at all. Direction only.
    todo: metPrice ? '' : p === null ? 'carry the ratio to Friday' : miss! > 1 && p < friday ? 'a straight line undershoots — multiply' : p < friday ? 'low — carry the ratio again, to two decimals' : 'high — check the ratio, then carry it',
    progress: p === null ? 0 : metPrice ? 1 : miss! > 1 ? 0.25 : 0.6,
  })
  const truth = harmattanBound()
  const b = s.bound
  const metBound = b !== null && Math.abs(b - truth) <= BOUND_TOLERANCE + 1e-9
  cells.push({
    id: 'bound',
    label: 'Takings could be off by',
    value: b === null ? '—' : `± ${cedis(b, 2)}`,
    want: `from a ${HARMATTAN.scaleStep * 1000} g scale`,
    met: metBound,
    todo: metBound ? '' : b === null ? 'state the bounds before you look' : 'half a step on the scale, times the price',
    progress: b === null ? 0 : Math.max(0, Math.min(1, 1 - Math.max(0, Math.abs(b - truth) - BOUND_TOLERANCE) / 2)),
  })
  const met = cells.filter((c) => c.met).length
  return { cells, met, of: 2, hit: met === 2, best: p ?? 0 }
}

/** The single next thing to do, for the aim ring. */
export type Aim = 'catch' | 'price' | 'open' | 'markup' | 'discount' | 'predict' | 'bound' | 'hand' | null

export function aimFor(level: Level, s: StallState, phase: 'gather' | 'lab'): Aim {
  if (phase === 'gather') return 'catch'
  const g = gaugeFor(level, s)
  if (g.hit) return 'hand'
  if (level.kind === 'fill') return s.day ? 'price' : 'open'
  if (level.kind === 'ratio') {
    if (!s.day) return 'open'
    return g.cells[0].met ? 'discount' : 'markup'
  }
  if (s.prediction === null) return 'predict'
  if (s.bound === null) return 'bound'
  return g.cells[0].met ? 'bound' : 'predict'
}

/* ------------------------------------------------------------------ */
/* Ploob                                                               */
/* ------------------------------------------------------------------ */

/**
 * What Ploob says about the stall right now — derived, never scripted per
 * click, so it is always true. Names what changed and why it matters; never
 * praises a click; never prints the number the learner is meant to work out.
 */
export function ploobLine(level: Level, s: StallState, run: DayRun | null): string {
  const g = gaugeFor(level, s)
  if (g.hit) return level.done
  if (run && !run.done) {
    if (run.last?.kind === 'pass') return `That one looked at the board and walked on. Above ${cedis(PRICE_SOFT_CEILING)} most of them do.`
    if (run.unsold === 0) return 'The basin is empty and there is still daylight. Tomorrow, catch more — or charge a little more.'
    if (run.t > 0.75 && run.unsold > FEW_LEFT && level.kind === 'ratio') return `${run.unsold} left and the sun is going. The four o'clock discount is what moves the last kilos.`
    return `${clockLabel(run.t)} · ${run.sold} sold, ${run.unsold} in the basin.`
  }
  if (level.kind === 'fill') {
    if (!s.day) return s.stock < 50 ? `${s.stock} tomatoes at ${cedis(s.price, 2)} cannot reach ${cedis(200)} — the basin is the ceiling. Open the stall and see, or catch again.` : `${s.stock} in the basin at ${cedis(s.price, 2)} each. Open the stall.`
    const d = s.day
    if (d.unsold > 0 && d.passed > 0) return `${d.passed} walked past at ${cedis(s.price, 2)}. Lower the price and more of them stop — or catch more, and sell them all.`
    if (d.unsold === 0) return `Sold out at ${cedis(s.price, 2)} — every tomato went. The only way up from here is a fuller basin, or a price a few more will still pay.`
    return `${d.sold} sold for ${cedis(d.till)}. The gauge says what is short.`
  }
  if (level.kind === 'ratio') {
    if (!s.day) return `Mark-up ${Math.round(s.markup * 100)} % puts the kilo at ${cedis(kiloPrice(scheduleOf(level, s).price), 2)}. Open the stall and see who stops.`
    const d = s.day
    const profit = profitOf(d.till, WHOLESALE.price) * 100
    if (profit < level.target.value && d.unsold > FEW_LEFT) return `${profit.toFixed(0)} % with ${d.unsold} left. The mark-up you kept on each kilo, the ceiling took back in kilos. Cut later — the discount — or mark up less.`
    if (profit < level.target.value) return `${profit.toFixed(0)} % and the basin is empty. Every kilo went for less than it could have. Mark up a little more.`
    return `${profit.toFixed(0)} % — but ${d.unsold} tomatoes are still in the basin, and unsold is wasted. Cut deeper at four, or earlier.`
  }
  if (s.prediction === null) return 'Four mornings on the board. Each one is the one before, times the same number. Carry it one more day.'
  if (s.bound === null) return 'Friday is set. Now the bounds: the scale reads to fifty grams, so how far could today\'s takings be off?'
  const miss = Math.abs(s.prediction - harmattanFriday())
  if (miss > 1 && s.prediction < harmattanFriday()) return "A straight line from four points undershoots — each day multiplies, it doesn't add. Carry the ratio."
  if (!g.cells[0].met) return 'Close, but not within fifty pesewas. Check the ratio to two decimal places and carry it again — four times, not three.'
  return 'Friday is right. The bounds are half a step on the scale, times Thursday\'s price per kilo.'
}

/* ------------------------------------------------------------------ */
/* The catch                                                           */
/* ------------------------------------------------------------------ */

/**
 * What falls during the gather round: tomatoes, from the seed, so two people
 * on one link catch from the same sky. Returns the moments (0..1 of the round)
 * and lanes; the count is generous — the catch is the arcade minute.
 */
export function rain(seed: number, count = 70): Array<{ at: number; lane: number; dur: number }> {
  const rng = rngFor(seed ^ 0x70bad0)
  const out: Array<{ at: number; lane: number; dur: number }> = []
  for (let i = 0; i < count; i++) {
    out.push({ at: (i + rng() * 0.8) / count, lane: rng(), dur: 3.2 + rng() * 1.6 })
  }
  return out
}

/** What a catch banks: tomatoes, capped at the basin. */
export function stockOf(caught: number): number {
  return Math.min(BASIN_MAX, Math.max(0, caught))
}

/**
 * A thin catch is never a dead end: the wholesaler tops the basin up to the
 * number the learner SAID they needed (their own prediction, capped at the
 * basin), paid for in thrift. Before review 1 the top-up went to a fixed 56;
 * now the learner's number is the target stock, and a wrong number is proved
 * wrong by the day, never by a red mark. With no number (a free stall) the
 * old rule stands.
 */
export function topUp(caught: number, level: Level, needed: number | null = null): { stock: number; topped: boolean } {
  const need = level.kind === 'fill' ? Math.min(BASIN_MAX, needed !== null && needed > 0 ? Math.ceil(needed) : Math.ceil(level.target.value / 4) + 6) : BASIN_MAX
  const stock = stockOf(caught)
  return stock < need ? { stock: need, topped: true } : { stock, topped: false }
}

/* ------------------------------------------------------------------ */
/* The challenge — the link                                            */
/* ------------------------------------------------------------------ */

/** The setup string carries the level and its target, so a link is the whole world. */
export function setupOf(level: Level): string {
  return `${level.id}:${level.target.value}`
}

/** Read a level back from a setup string; unknown or malformed → null, never a guess. */
export function levelFromSetup(setup: string): Level | null {
  const [id] = setup.split(':')
  const level = LEVEL_BY_ID[id]
  if (!level) return null
  return setupOf(level) === setup ? level : null
}

export function challengeFor(level: Level, band: Band, seed: number, by?: string): Challenge {
  return {
    v: CHALLENGE_VERSION,
    cabinet: 'numberworks',
    seed,
    setup: setupOf(level),
    band,
    goal: { metric: level.metric.id, direction: level.target.direction, target: level.target.value, tolerance: level.target.tolerance, unit: level.metric.unit },
    budget: { ...level.budget },
    gatherSeconds: band === 'explorer' ? level.gatherSeconds : 0,
    condition: level.condition,
    by,
  }
}

export function soloSeed(sessionCode: string, level: Level): number {
  return seedFromCode(`${sessionCode}:${level.id}`)
}

/** What the round spent of its budget: unsold tomatoes are waste; predictions are counted. */
export function spentOf(level: Level, s: StallState, predictions: number): ResourceBudget {
  if (level.kind === 'harmattan') return { predictions: Math.max(0, predictions - 1) }
  return { tomatoes: s.day ? s.day.unsold : s.stock }
}

/** Score a hand-in. `trials` is days run (or predictions made). */
export function attemptFor(level: Level, challenge: Challenge, s: StallState, trials: number, seconds: number): { attempt: ChallengeAttempt; score: ChallengeScore } {
  const g = gaugeFor(level, s)
  const conditionMet = level.condition === 'fewLeft' ? !!s.day && s.day.unsold <= FEW_LEFT : level.condition === 'boundsStated' ? g.cells[1]?.met === true : undefined
  const attempt: ChallengeAttempt = {
    challengeId: '',
    best: g.best,
    hit: g.hit,
    trials: Math.max(1, trials),
    spent: spentOf(level, s, trials),
    gathered: { ...challenge.budget },
    seconds,
    conditionMet,
  }
  return { attempt, score: scoreAttempt(challenge, attempt) }
}

/* ------------------------------------------------------------------ */
/* The share card                                                      */
/* ------------------------------------------------------------------ */

export const NICKNAME_MAX = 16

export function cleanNickname(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{N} '-]/gu, '')
    .replace(/\d{3,}/gu, '')
    .replace(/\s+/gu, ' ')
    .trimStart()
    .slice(0, NICKNAME_MAX)
}

export function sendableNickname(raw: string): string {
  return cleanNickname(raw).trim()
}

export interface ShareCard {
  headline: string
  dare: string
  /** The big number on the card. */
  figure: string
  sub: string
  trials: number
  stars: 0 | 1 | 2 | 3
}

export function shareCardFor(level: Level, s: StallState, by: string | undefined, trials: number, stars: 0 | 1 | 2 | 3): ShareCard {
  const who = by && by.trim() ? by.trim() : 'Someone'
  if (level.kind === 'fill') {
    // A strategy, not a score: price · stock · till · left, and a dare that is
    // a piece of maths — beat it at a dearer price, or waste fewer.
    const till = s.day?.till ?? 0
    const left = s.day?.unsold ?? s.stock
    const dearer = Math.round((s.price + 0.2) * 100) / 100
    const dare = left > 0 ? `Waste fewer than ${left} — or beat ${cedis(till)} at ${cedis(dearer, 2)}?` : `Beat ${cedis(till)} at ${cedis(dearer, 2)}?`
    return { headline: `${who} closed at ${cedis(till)} selling at ${cedis(s.price, 2)}`, dare, figure: cedis(till), sub: `${s.stock} stocked · ${s.day?.sold ?? 0} sold · ${left} left`, trials, stars }
  }
  if (level.kind === 'ratio') {
    const profit = s.day ? profitOf(s.day.till, WHOLESALE.price) * 100 : 0
    return { headline: `${who} made ${profit.toFixed(0)} % on the basin`, dare: `Beat ${profit.toFixed(0)} % with fewer left`, figure: `${profit.toFixed(0)} %`, sub: `mark-up ${Math.round(s.markup * 100)} %${s.discount ? `, ${Math.round(s.discount * 100)} % off at four` : ''}`, trials, stars }
  }
  return { headline: `${who} named Friday's price`, dare: 'Name it in one', figure: s.prediction === null ? '—' : cedis(s.prediction, 2), sub: 'a fixed fraction a day', trials, stars }
}

/* ------------------------------------------------------------------ */
/* Round A.2 — after review 1: the number first, the crowd as a lever, */
/* the day reconstructed before it is scored, one why-question         */
/* ------------------------------------------------------------------ */

/** The board on day 1 of level 1 is fixed here; day 2 is the experiment price. */
export const DAY1_PRICE = 4
export const EXPERIMENT_PRICE = 4.5

/**
 * What the alley does at a price, before the stall opens: how many of the
 * day's crowd would stop, and how many tomatoes they would want between them.
 * The lever shows the head-count only (a crowd, not a list — D2), so day 3
 * still has to be reasoned, not scrolled.
 */
export function demandAt(shoppers: Shopper[], price: number): { stop: number; want: number; of: number } {
  let stop = 0
  let want = 0
  for (const s of shoppers) {
    if (price <= s.limit + 1e-9) {
      stop += 1
      want += s.want
    }
  }
  return { stop, want, of: shoppers.length }
}

/**
 * The crowd for a day. Day 1 of level 1 is guaranteed (D5): the first number
 * the learner commits must be proved, or the beat is a coin toss — so the
 * day-1 crowd is the first seed off the link's on which fifty at ₵4 sells
 * every one of fifty. Later days are the seed's own, so an experiment can
 * miss. Both friends on one link get the same sequence.
 */
export function crowdSeedFor(seed: number, level: Level | null, dayIndex: number): number {
  const base = (seed ^ Math.imul(Math.max(1, dayIndex) - 1, 0x9e3779b1)) >>> 0
  if (!level || level.kind !== 'fill' || dayIndex !== 1) return base
  const need = Math.ceil(level.target.value / DAY1_PRICE)
  for (let k = 0; k < 64; k++) {
    const candidate = (base + k * 0x2545f491) >>> 0
    const r = simulateDay(shoppersFor(candidate), need, { price: DAY1_PRICE, discount: 0 })
    if (r.sold === need && r.till >= level.target.value - 1e-9) return candidate
  }
  return base
}

export type DayQuestionKind = 'count' | 'till'

export interface DayQuestion {
  kind: DayQuestionKind
  /** The question, in Ploob's words. */
  question: string
  /** The number that turns out to be right (never shown before the day). */
  answer: number
  unit: string
  /** The price the board is locked at for this day, or null when the lever is free. */
  lockPrice: number | null
  /** Whether typing accepts pesewas. */
  decimals: boolean
  /** The reason this day exists — Ploob's line after the number is typed. */
  intent: string
}

/**
 * Days are experiments. Day 1: observe at ₵4 — how many must we sell? A day
 * that missed asks the count again (a guided retry). The day after a hit is
 * the experiment: what if ₵4.50 — what will the till be? After that the
 * lever is free and the learner names the till before opening.
 */
export function dayQuestion(level: Level, s: StallState, shoppers: Shopper[]): DayQuestion | null {
  if (level.kind !== 'fill') return null
  const target = level.target.value
  if (s.dayIndex === 1 || s.lastHit === false) {
    const price = s.dayIndex === 1 ? DAY1_PRICE : s.price
    const answer = Math.ceil(target / price)
    return {
      kind: 'count',
      question: s.dayIndex === 1 ? `We're selling at ${cedis(price)} each. The till needs ${cedis(target)}. How many tomatoes must we sell?` : `The till closed at ${cedis(s.day?.till ?? 0)}. At ${cedis(price, 2)} each, how many must we sell for ${cedis(target)}?`,
      answer,
      unit: 'tomatoes',
      lockPrice: s.dayIndex === 1 ? DAY1_PRICE : null,
      decimals: false,
      intent: 'Then let’s make sure we have that many.',
    }
  }
  if (s.dayIndex === 2) {
    const price = EXPERIMENT_PRICE
    const answer = simulateDay(shoppers, s.stock, { price, discount: 0 }).till
    return {
      kind: 'till',
      question: `What if we charge ${cedis(price, 2)}? Fewer shoppers stop — but each sale is worth more. What will the till say at closing?`,
      answer,
      unit: 'in the till',
      lockPrice: price,
      decimals: false,
      intent: 'Let’s see what the alley does with it.',
    }
  }
  const answer = simulateDay(shoppers, s.stock, { price: s.price, discount: 0 }).till
  return {
    kind: 'till',
    question: `Your price is ${cedis(s.price, 2)}, ${s.stock} in the basin. What will the till say at closing?`,
    answer,
    unit: 'in the till',
    lockPrice: null,
    decimals: false,
    intent: 'Your stall, your price. Open it.',
  }
}

/** Ploob repeats the number back — whatever it is. The day is what checks it. */
export function repeatBack(q: DayQuestion, typed: number): string {
  const n = q.decimals ? typed.toFixed(2) : String(Math.round(typed))
  if (q.kind === 'count') return `${n}. Then let’s catch at least ${n}.`
  return `${cedis(typed)}. ${q.intent}`
}

/** The four o'clock event: the day pauses at DISCOUNT_HOUR when stock remains. */
export const EVENT_T = dayFractionOfHour(DISCOUNT_HOUR)
export const EVENT_DROP_TO = 3.5

/** Whether the day should stop at four for a decision. */
export function eventDue(run: DayRun, level: Level | null): boolean {
  return !!level && level.kind === 'fill' && run.unsold > 0 && run.t >= EVENT_T - 1e-9 && !run.done
}

/** Drop the board to EVENT_DROP_TO from four o'clock: a discount, as the model already prices one. */
export function eventDrop(run: DayRun): PriceSchedule {
  const p = run.schedule.price
  const discount = p > EVENT_DROP_TO ? Math.round((1 - EVENT_DROP_TO / p) * 1000) / 1000 : 0
  return { price: p, discount }
}

/** What the event card says: keep, or drop — both are sums. */
export function eventLines(run: DayRun, target: number): { headline: string; keep: string; drop: string } {
  const p = run.schedule.price
  const short = Math.max(0, target - run.till)
  const keepN = Math.ceil(short / p)
  const dropN = Math.ceil(short / EVENT_DROP_TO)
  return {
    headline: `${clockLabel(run.t)} · ${run.unsold} left, the sun is going.`,
    keep: short > 0 ? `${keepN} more sale${keepN === 1 ? '' : 's'} at ${cedis(p, 2)}` : `${cedis(p, 2)} — the target is met`,
    drop: short > 0 ? `${dropN} at ${cedis(EVENT_DROP_TO, 2)} — and they all go` : `${cedis(EVENT_DROP_TO, 2)} — sell the rest`,
  }
}

export interface Reconstruction {
  /** "You found a working strategy." or "Not yet — ₵40 short." */
  headline: string
  rows: Array<[string, string]>
  /** The two products, side by side: what was said, what the day made. */
  lines: Array<{ text: string; tone: 'said' | 'made' }>
  /** The array the layer draws: sold of stocked. */
  grid: { lit: number; of: number } | null
}

/** The five-second reconstruction: the sum first, the score never on this card. */
export function reconstructionOf(level: Level, s: StallState): Reconstruction {
  const d = s.day
  if (level.kind === 'fill') {
    const target = level.target.value
    const hit = !!d && d.till >= target - 1e-9
    const price = d ? (d.sales.length ? Math.round((d.sales[0].paid / d.sales[0].n) * 100) / 100 : s.price) : s.price
    const need = Math.ceil(target / price)
    const rows: Array<[string, string]> = [
      s.tillGuess !== null ? ['You said the till', cedis(s.tillGuess)] : ['You said we needed', s.guess === null ? '—' : `${s.guess}`],
      ['Selling price', cedis(price, 2)],
      ['You stocked', `${s.stock}`],
      ['Walked past', `${d?.passed ?? 0}`],
      ['You sold', `${d?.sold ?? 0}`],
      ['Left in the basin', `${d?.unsold ?? s.stock}`],
    ]
    const lines: Reconstruction['lines'] = []
    if (s.tillGuess !== null) lines.push({ text: `you said ${cedis(s.tillGuess)}`, tone: 'said' })
    else lines.push({ text: `${need} × ${cedis(price, 2)} = ${cedis(need * price)}`, tone: 'said' })
    // The sum the day made. A day that dropped the price at four is two
    // products, and the card says both — never a product that is not the till.
    if (d) {
      const byPrice = new Map<number, number>()
      for (const x of d.sales) {
        const each = Math.round((x.paid / x.n) * 100) / 100
        byPrice.set(each, (byPrice.get(each) ?? 0) + x.n)
      }
      const parts = [...byPrice.entries()].sort((a, b) => b[0] - a[0]).map(([each, n]) => `${n} × ${cedis(each, 2)}`)
      lines.push({ text: parts.length ? `${parts.join(' + ')} = ${cedis(d.till)}` : `0 × ${cedis(price, 2)} = ${cedis(0)}`, tone: 'made' })
    } else lines.push({ text: '—', tone: 'made' })
    return {
      headline: hit ? 'You found a working strategy.' : d ? `Not yet — ${cedis(target - d.till)} short.` : 'No day run yet.',
      rows,
      lines,
      grid: d ? { lit: d.sold, of: s.stock } : null,
    }
  }
  if (level.kind === 'ratio') {
    const till = d?.till ?? 0
    const profit = till - WHOLESALE.price
    const pct = profitOf(till, WHOLESALE.price) * 100
    const hit = !!d && pct >= level.target.value - 1e-9 && d.unsold <= FEW_LEFT
    return {
      headline: hit ? 'A quarter up, and the basin near empty.' : d ? `${pct.toFixed(0)} % with ${d.unsold} left.` : 'No day run yet.',
      rows: [
        ['Paid wholesale', cedis(WHOLESALE.price)],
        ['Kilo price', cedis(kiloPrice(scheduleOf(level, s).price), 2)],
        ['Till at closing', cedis(till)],
        ['Discount at four', s.discount ? `−${Math.round(s.discount * 100)} %` : 'none'],
        ['You sold', `${d?.sold ?? 0}`],
        ['Left in the basin', `${d?.unsold ?? s.stock}`],
      ],
      lines: [
        { text: `${cedis(till)} − ${cedis(WHOLESALE.price)} = ${cedis(profit)}`, tone: 'made' },
        { text: `${cedis(profit)} ÷ ${cedis(WHOLESALE.price)} = ${pct.toFixed(0)} %`, tone: 'made' },
      ],
      grid: d ? { lit: d.sold, of: s.stock } : null,
    }
  }
  const friday = harmattanFriday()
  return {
    headline: s.prediction !== null && Math.abs(s.prediction - friday) <= level.target.tolerance ? 'Friday named.' : 'Friday, still to name.',
    rows: [
      ['Monday', cedis(harmattanPrice(0), 2)],
      ['Thursday', cedis(harmattanPrice(3), 2)],
      ['The ratio', `× ${HARMATTAN.r}`],
      ['You said Friday', s.prediction === null ? '—' : cedis(s.prediction, 2)],
      ['Scale reads to', `${HARMATTAN.scaleStep * 1000} g`],
      ['Your bound', s.bound === null ? '—' : `± ${cedis(s.bound, 2)}`],
    ],
    lines: [
      { text: `${cedis(HARMATTAN.p0)} × ${HARMATTAN.r}⁴ = ${cedis(friday, 2)}`, tone: 'made' },
      { text: `${HARMATTAN.scaleStep / 2} kg × ${cedis(harmattanPrice(3), 2)} = ± ${cedis(harmattanBound(), 2)}`, tone: 'made' },
    ],
    grid: null,
  }
}

export interface WhyOption {
  text: string
  right: boolean
  /** Ploob's answer, from the day's own numbers — never "wrong". */
  answer: string
}

export interface WhyQuestion {
  question: string
  options: WhyOption[]
}

/**
 * One question after the day, not another sum. Two explanations are things
 * the day itself disproves; Ploob answers each from the numbers.
 */
export function whyQuestion(level: Level, s: StallState): WhyQuestion {
  const d = s.day
  if (level.kind === 'fill') {
    const target = level.target.value
    const price = s.price
    const need = Math.ceil(target / price)
    const hit = !!d && d.till >= target - 1e-9
    const sold = d?.sold ?? 0
    const passed = d?.passed ?? 0
    return {
      question: hit ? `Why did ${cedis(price, 2)} work?` : `Why did ${cedis(price, 2)} fall short?`,
      options: hit
        ? [
            { text: `${need} tomatoes at ${cedis(price, 2)} each is ${cedis(need * price)} — and ${sold} sold.`, right: true, answer: `That is the sum that held: ${sold} × ${cedis(price, 2)} = ${cedis(d?.till ?? 0)}.` },
            { text: 'Every shopper who came bought tomatoes.', right: false, answer: passed > 0 ? `${passed} looked at the board and walked on. The sum held anyway.` : 'Look again at the alley: some always walk on. The sum is what held.' },
            { text: `${cedis(price, 2)} was the most anyone would pay.`, right: false, answer: `Some would pay up to ${cedis(PRICE_CEILING, 2)} — the dial's ceiling. ${cedis(price, 2)} worked because ${need} at ${cedis(price, 2)} is ${cedis(need * price)}.` },
          ]
        : [
            { text: `Only ${sold} sold — ${sold} × ${cedis(price, 2)} is under ${cedis(target)}.`, right: true, answer: `${sold} × ${cedis(price, 2)} = ${cedis(d?.till ?? 0)}. ${cedis(target)} needs ${need} at this price.` },
            { text: 'The shoppers had no money.', right: false, answer: `${passed} walked on because the board was above their limit, not because they had nothing. ${sold} did buy.` },
            { text: 'The market closed early.', right: false, answer: 'The market ran to six. What ran out was buyers at this price, or tomatoes.' },
          ],
    }
  }
  if (level.kind === 'ratio') {
    return {
      question: 'Why does the four o’clock discount raise profit?',
      options: [
        { text: 'It sells the kilos the ceiling was refusing.', right: true, answer: 'Yes — a kilo unsold is ₵0; a kilo at a smaller mark-up is still above cost.' },
        { text: 'It raises the price per kilo.', right: false, answer: 'It lowers it. What it raises is the number of kilos that go.' },
        { text: 'Shoppers always wait for four.', right: false, answer: 'They arrive all day; the discount only changes what the late ones see.' },
      ],
    }
  }
  return {
    question: 'Why does a straight line from four mornings undershoot Friday?',
    options: [
      { text: 'Each day multiplies the last by the same number.', right: true, answer: `Yes — × ${HARMATTAN.r} each morning. The steps grow; a line keeps them the same.` },
      { text: 'The ratio shrinks every day.', right: false, answer: 'The ratio is the one thing that does not change on the board.' },
      { text: 'The scale rounds up.', right: false, answer: 'The scale sets the bounds on today, not the price on Friday.' },
    ],
  }
}

/** The four-line stamp: prediction · action · observed · explanation. */
export function stampOf(level: Level, s: StallState, chosen: WhyOption | null): string[] {
  const d = s.day
  if (level.kind === 'fill') {
    return [
      `Predicted ${s.guess === null ? '—' : s.guess} at ${cedis(s.price, 2)}${s.tillGuess !== null ? ` · said the till would make ${cedis(s.tillGuess)}` : ''}`,
      `Stocked ${s.stock} and opened at ${cedis(s.price, 2)}`,
      d ? `${d.sold} sold, ${d.passed} walked past, ${cedis(d.till)} in the till, ${d.unsold} left` : 'No day run',
      chosen ? `Explained: ${chosen.text}` : 'Explanation still to choose',
    ]
  }
  if (level.kind === 'ratio') {
    return [
      `Predicted ${s.guess === null ? '—' : cedis(s.guess, 2)} each from ${cedis(WHOLESALE.price)} for ${WHOLESALE.count}`,
      `Marked up ${Math.round(s.markup * 100)} %${s.discount ? `, ${Math.round(s.discount * 100)} % off at four` : ''}`,
      d ? `${cedis(d.till)} in the till, ${d.unsold} left — ${(profitOf(d.till, WHOLESALE.price) * 100).toFixed(0)} %` : 'No day run',
      chosen ? `Explained: ${chosen.text}` : 'Explanation still to choose',
    ]
  }
  return [
    `Predicted the ratio ${s.guess === null ? '—' : s.guess.toFixed(2)}`,
    `Named Friday ${s.prediction === null ? '—' : cedis(s.prediction, 2)}, bound ${s.bound === null ? '—' : `± ${cedis(s.bound, 2)}`}`,
    `Friday is ${cedis(harmattanFriday(), 2)}; half a step is ± ${cedis(harmattanBound(), 2)}`,
    chosen ? `Explained: ${chosen.text}` : 'Explanation still to choose',
  ]
}

/** The rows the count layer draws: ten to a row, the spare ghosted. */
export function rowsOf(n: number, need: number | null): { rows: number; full: number; spare: number } {
  const count = Math.max(0, Math.floor(n))
  const needed = need === null ? count : Math.max(0, Math.min(count, Math.floor(need)))
  return { rows: Math.ceil(count / 10), full: needed, spare: count - needed }
}
