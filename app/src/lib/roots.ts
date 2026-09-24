/**
 * The Roots — one cassava on a bed, the soil's water and air, hour by hour.
 *
 * This is the model behind the Landing plot (S0, "The Drooping Cassava") and
 * later behind the Sugar Line's door 5. It came onto the trunk from the Roots
 * prototype (`Roots prototype/roots.ts`, 23 Sep 2026) with its PHYSICS
 * UNCHANGED — every number the storyboard quotes reproduces here, and
 * `verify-roots-model.mjs` pins them — plus the accounting the plot needs:
 * spilled water is recorded instead of clamped away, uptake is tallied so the
 * thrift line can say where every millimetre went, and each constant carries
 * its basis, as the furnace's fuels do.
 *
 * One plant on a 1 m × 1 m bed (the usual spacing), a 300 mm root zone, an
 * hourly step. Water is in mm (= litres on the square metre), so a 10 L
 * watering can is 10 mm.
 *
 * MEASURED (see `ROOTS_CONSTANTS` for the sources):
 *   soil porosity / field capacity / wilting point / Ksat per texture;
 *   roots suffer below ~10 % air-filled porosity; the oxygen in a flooded
 *   soil is used up within ~48 h; FAO-56's dry-side stress with p = 0.35 and
 *   Kc = 0.80 for year-1 cassava.
 * MODELLED (labelled so wherever they are shown): ETo 4.5 mm/day, the linear
 *   drainage reservoir, infiltration on clay, the O₂ time constants, the rot
 *   clock, the mound's effect, and everything about sugar and ions — game
 *   units, time compressed. Sugar is computed for the record and never shown
 *   in S0; it returns with a reviewed model in BioWilds.
 *
 * Nothing in here knows what a day on screen is: `plot.ts` drives it one dawn
 * at a time and the scene renders what it reads.
 */

/* ----------------------------------------------------------------------------
 * Constants, with their basis
 * ------------------------------------------------------------------------- */

export type Texture = 'sand' | 'loam' | 'clay'

/** porosity φ, field capacity, wilting point (volumetric) and Ksat (mm h⁻¹). */
export const SOIL: Record<Texture, { phi: number; fc: number; wp: number; ks: number }> = {
  sand: { phi: 0.437, fc: 0.091, wp: 0.033, ks: 210 },
  loam: { phi: 0.463, fc: 0.27, wp: 0.117, ks: 13.2 },
  clay: { phi: 0.475, fc: 0.396, wp: 0.272, ks: 0.6 },
}

/** Root zone depth, mm. */
export const Z = 300
/** One watering can on the bed, mm (10 L on the square metre). */
export const CAN = 10
/** Air-filled porosity below which roots suffer. */
export const AIR_OK = 0.1
/** Air-filled porosity at which the root zone's oxygen heads to zero. */
export const AIR_FLOOR = 0.05
/** FAO-56 depletion fraction p for cassava, year 1. */
export const P_DEPLETION = 0.35
/** Reference evapotranspiration, mm/day — modelled. */
export const ETO = 4.5
/** Crop coefficient, cassava year 1, mid-season. */
export const KC = 0.8
/** Dry matter made per mm transpired on the square metre, g — modelled game figure. */
export const WUE = 3
/** A pond deeper than the bed's brick edging spills over it, mm. */
export const EDGING = 40
/** Hours for root-zone O₂ to fall toward its target once the air is gone, and to come back when the pores drain. */
export const O2_TAU_DOWN = 12
export const O2_TAU_UP = 2
/** The rot clock: hours near-anoxic before roots start dying, and the fraction lost per hour after that. */
export const ROT_AFTER_H = 24
export const ROT_PER_H = 1 / 48

export interface RootsConstant {
  id: string
  name: string
  value: string
  basis: 'measured' | 'modelled'
  /** Where the number comes from, for the journal's "Where the numbers come from" and for anyone who asks. */
  source: string
}

/**
 * The register the journal shows green (measured) and amber (modelled). Two
 * sources are still owed and say so — the house rule is never to let a
 * modelled number pass as a measured one.
 */
export const ROOTS_CONSTANTS: readonly RootsConstant[] = [
  {
    id: 'soils',
    name: 'Soil water constants',
    value: 'sand φ .437 / fc .091 / wp .033 / Ks 210 · loam .463 / .270 / .117 / 13.2 · clay .475 / .396 / .272 / 0.6 mm h⁻¹',
    basis: 'measured',
    source: 'Rawls, Brakensiek & Saxton 1982, "Estimation of soil water properties", Trans. ASAE 25(5) — the textural-class means.',
  },
  {
    id: 'airOk',
    name: 'Air the roots need',
    value: '10 % air-filled porosity',
    basis: 'measured',
    source: 'AHDB soil-structure guidance: root growth and function suffer below about 10 % air-filled pore space.',
  },
  {
    id: 'o2Gone',
    name: 'Oxygen gone after flooding',
    value: '≈ 48 h',
    basis: 'measured',
    source: 'University of Wisconsin Extension, on flooded soils (after Purvis & Williamson 1972; Fausey & McDonald 1985): the oxygen in a saturated soil is used up within about two days.',
  },
  {
    id: 'kc',
    name: 'Crop coefficient Kc',
    value: '0.80 (cassava, year 1, mid-season)',
    basis: 'measured',
    source: 'FAO Irrigation and Drainage Paper 56, Table 12.',
  },
  {
    id: 'p',
    name: 'Depletion fraction p',
    value: '0.35 (cassava, year 1)',
    basis: 'measured',
    source: 'FAO Irrigation and Drainage Paper 56, Table 22; the dry-side stress Ks = (TAW − Dr) / ((1 − p)·TAW).',
  },
  {
    id: 'eto',
    name: 'Reference evapotranspiration ETo',
    value: '4.5 mm/day',
    basis: 'modelled',
    source: 'A typical southern-Ghana dry-season figure stands in; the sourced value is owed before scientific release.',
  },
  {
    id: 'o2tau',
    name: 'Oxygen time constants',
    value: '12 h falling, 2 h recovering',
    basis: 'modelled',
    source: 'Chosen so that a flooded bed reaches near-anoxia in about a day and a half (inside the measured ≈ 48 h) and breathes again within a few hours of draining.',
  },
  {
    id: 'rot',
    name: 'The rot clock',
    value: '24 h near-anoxic, then 1/48 of the roots per hour',
    basis: 'modelled',
    source: 'Anoxia of 48 h or more kills root tips (maize: Subbaiah et al. 2000); saturation of 4–8 h starts Phytophthora (UC IPM). The clock is a game reading of those, not a cassava measurement — days-to-damage for cassava under waterlogging is owed.',
  },
  {
    id: 'drain',
    name: 'Drainage above field capacity',
    value: 'a linear reservoir with τ from Ksat',
    basis: 'modelled',
    source: 'The reservoir’s form and the clay infiltration cap are the model’s; the rates come from the measured Ksat.',
  },
  {
    id: 'wue',
    name: 'Water-use efficiency',
    value: '3 g dry matter per litre',
    basis: 'modelled',
    source: 'C3 crops typically 2–5 g kg⁻¹; sugar is a game figure here and is not shown in S0.',
  },
]

/* ----------------------------------------------------------------------------
 * The bed
 * ------------------------------------------------------------------------- */

export interface Bed {
  texture: Texture
  mound: boolean
  /** Volumetric water content of the root zone. */
  theta: number
  /** mm standing on the surface. */
  pond: number
  /** 0..1 root-zone oxygen. */
  o2: number
  /** Hours near-anoxic (the rot clock). */
  anox: number
  /** 0..1 living root fraction. */
  health: number
  /** 0..1 leaf firmness. */
  firm: number
  /** mm lost below the root zone (poured and wasted). */
  drained: number
  /** mm that overflowed the edging — the rest of "wasted". */
  spilled: number
  /** mm the plant has taken up. */
  taken: number
  /** mm that arrived on the bed (pour + rain reaching it). */
  arrived: number
  ionsToday: number
  /** Lowest firmness during daylight since the last reset (day 1 is not the learner's). */
  minFirm: number
  /** Mineral ions in the root zone, game units (nitrate stands for them all). */
  pool: number
  leached: number
}

export interface Start {
  theta?: number
  airStart?: number
  o2?: number
  anox?: number
  mound?: boolean
}

export function newBed(texture: Texture, st: Start = {}): Bed {
  const s = SOIL[texture]
  const theta = st.theta ?? (st.airStart !== undefined ? s.phi - st.airStart : Math.min(s.phi - 0.13, s.fc - 0.1 * (s.fc - s.wp)))
  return {
    texture,
    mound: st.mound ?? false,
    theta,
    pond: 0,
    o2: st.o2 ?? 1,
    anox: st.anox ?? 0,
    health: 1,
    firm: 1,
    drained: 0,
    spilled: 0,
    taken: 0,
    arrived: 0,
    ionsToday: 0,
    minFirm: 1,
    pool: 100,
    leached: 0,
  }
}

/** The bed as found: field capacity, then `days` of dry weather with the plant drinking. */
export function asFound(texture: Texture, days: number): Start {
  const b = newBed(texture, { theta: SOIL[texture].fc })
  for (let h = 0; h < days * 24; h += 1) stepHour(b, h, 0, 0)
  return { theta: b.theta, o2: b.o2 }
}

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x))

/** Demand for water this hour, mm h⁻¹ — a daylight sine, zero at night. `leaf` scales it (a hot fortnight is 1.25). */
export function demandAt(hour: number, leaf = 1): number {
  const h = hour % 24
  if (h < 6 || h > 18) return 0
  const daily = ETO * KC * leaf
  return ((daily * Math.PI) / 24) * Math.sin((Math.PI * (h - 6)) / 12)
}

/** FAO-56's dry-side stress coefficient, 1 when the roots have easy water and falling toward 0 at wilting point. */
export function dryFactor(b: Bed): number {
  const s = SOIL[b.texture]
  const taw = (s.fc - s.wp) * Z
  const dr = Math.max(0, (s.fc - b.theta) * Z)
  const raw = P_DEPLETION * taw
  if (dr <= raw) return 1
  return clamp((taw - dr) / ((1 - P_DEPLETION) * taw))
}

/** Air-filled porosity. */
export function airOf(b: Bed): number {
  return SOIL[b.texture].phi - b.theta
}

/** Where the root-zone oxygen is heading, from the air in the pores. */
export function o2Target(b: Bed): number {
  return clamp((airOf(b) - AIR_FLOOR) / (AIR_OK - AIR_FLOOR))
}

/** mm of water in the root zone. */
export function storedOf(b: Bed): number {
  return b.theta * Z
}

/**
 * The probe's word. SOAKED while the pores hold less than the air roots need;
 * DRY once the plant is past the readily-available water (FAO-56's p); DAMP
 * between. Explorer sees the word; Investigator sees θ and air % beside it.
 */
export type ProbeWord = 'SOAKED' | 'DAMP' | 'DRY'

export function probeWord(b: Bed): ProbeWord {
  if (airOf(b) < AIR_OK) return 'SOAKED'
  const s = SOIL[b.texture]
  const dr = (s.fc - b.theta) * Z
  const taw = (s.fc - s.wp) * Z
  return dr > P_DEPLETION * taw ? 'DRY' : 'DAMP'
}

export interface StepOut {
  demand: number
  uptake: number
  ions: number
}

/** One hour. `pour` and `rain` are mm arriving this hour. */
export function stepHour(b: Bed, hour: number, pour: number, rain: number, roots = 1, leaf = 1): StepOut {
  const s = SOIL[b.texture]
  const drainK = b.mound ? 4 : 1
  // rain on a mound partly runs off the sides
  const arriving = pour + rain * (b.mound ? 0.6 : 1)
  b.pond += arriving
  b.arrived += arriving
  // infiltration: fast on sand and loam; on clay it is slow, faster when dry
  const room = (s.phi - b.theta) * Z
  const cap = s.ks * (1 + (3 * (s.phi - b.theta)) / (s.phi - s.wp))
  const inf = Math.min(b.pond, room, cap)
  b.pond -= inf
  b.theta += inf / Z
  // a pond deeper than the bed's brick edging spills over it — recorded, not lost
  if (b.pond > EDGING) {
    b.spilled += b.pond - EDGING
    b.pond = EDGING
  }
  // drainage above field capacity: a linear reservoir with τ from Ksat
  if (b.theta > s.fc) {
    const tau = (Z * (s.phi - s.fc)) / (s.ks * drainK)
    const out = (b.theta - s.fc) * (1 - Math.exp(-1 / tau))
    // dissolved ions leave with the water that drains past the roots
    const wash = b.pool * (out / b.theta)
    b.pool -= wash
    b.leached += wash
    b.theta -= out
    b.drained += out * Z
  }
  // oxygen: used up over ~a day and a half once the air is gone; back in a
  // couple of hours when the pores drain
  const target = o2Target(b)
  const tauO2 = target < b.o2 ? O2_TAU_DOWN : O2_TAU_UP
  b.o2 += (target - b.o2) * (1 - Math.exp(-1 / tauO2))
  // the rot clock
  if (b.o2 < 0.15) b.anox += 1
  else if (b.o2 > 0.5) b.anox = Math.max(0, b.anox - 0.5)
  if (b.anox > ROT_AFTER_H) b.health = Math.max(0, b.health - ROT_PER_H)
  // uptake: roots × dry side × oxygen (conductance falls when roots suffocate)
  const demand = demandAt(hour, leaf)
  const capacity = 0.62 * roots * dryFactor(b) * b.o2 * b.health
  const uptake = Math.min(demand, capacity)
  const before = b.theta
  b.theta = Math.max(s.wp * 0.9, b.theta - uptake / Z)
  b.taken += (before - b.theta) * Z
  // mineral ions: active transport runs on respiration's energy
  const energy = b.o2 + (1 - b.o2) / 15
  // pumps need energy (respiration) and something to pump: the pool, and
  // water to carry it to the root surface
  const conc = b.pool / 100
  const ions = Math.min(b.pool, 0.25 * roots * b.health * energy * (conc / (conc + 0.3)) * dryFactor(b))
  b.pool -= ions
  b.ionsToday += ions
  // leaf firmness relaxes toward what the roots can supply
  const want = demand > 0 ? clamp(capacity / demand) : capacity > 0.05 ? 1 : b.firm
  b.firm += (want - b.firm) * (1 - Math.exp(-1 / 1.5))
  if (demand > 0) b.minFirm = Math.min(b.minFirm, b.firm)
  return { demand, uptake, ions }
}

/* ----------------------------------------------------------------------------
 * Whole runs — for the counterfactual, the suites and the record
 * ------------------------------------------------------------------------- */

export interface DayRow {
  /** 0-based. */
  day: number
  theta: number
  air: number
  o2: number
  /** Firmness read at 13:00 — the hardest hour. */
  firm13: number
  health: number
  ions: number
  word: ProbeWord
}

export interface RunResult {
  cans: number
  /** Firmness at the last day's one o'clock. */
  firmEnd: number
  /** Lowest daylight firmness after the first day. */
  minFirm: number
  health: number
  /** mm poured and lost: drained below the roots plus spilled over the edging. */
  wasted: number
  drained: number
  spilled: number
  taken: number
  arrived: number
  stored: number
  hoursDrowned: number
  hoursDry: number
  daily: DayRow[]
  ions: number
  /** Game units; computed for the record, never shown in S0. */
  sugar: number
  days: number
  leachedTotal: number
  poolEnd: number
}

/**
 * `cans[d]` cans poured at 07:00 on day d (0-based); `rain[h]` mm arriving in
 * hour h; `leaf` scales demand (1.25 for a hot fortnight).
 */
export function runDays(texture: Texture, cans: number[], st: Start = {}, rain: Record<number, number> = {}, leaf = 1): RunResult {
  const b = newBed(texture, st)
  const n = cans.length
  let drowned = 0
  let dry = 0
  let ions = 0
  let sugar = 0
  let firm13 = 1
  const daily: DayRow[] = []
  for (let h = 0; h < 24 * n; h += 1) {
    const day = Math.floor(h / 24)
    const pour = h % 24 === 7 ? cans[day] * CAN : 0
    const out = stepHour(b, h, pour, rain[h] ?? 0, 1, leaf)
    ions += out.ions
    sugar += WUE * out.uptake
    if (b.o2 < 0.5) drowned += 1
    if (dryFactor(b) < 0.5) dry += 1
    if (h % 24 === 13) firm13 = b.firm
    if (h === 23) b.minFirm = 1 // the day as found is not the learner's
    if (h % 24 === 23) {
      daily.push({ day, theta: b.theta, air: airOf(b), o2: b.o2, firm13, health: b.health, ions: b.ionsToday, word: probeWord(b) })
      b.ionsToday = 0
    }
  }
  return {
    cans: cans.reduce((a, c) => a + c, 0),
    firmEnd: daily[n - 1].firm13,
    minFirm: b.minFirm,
    health: b.health,
    wasted: b.drained + b.spilled,
    drained: b.drained,
    spilled: b.spilled,
    taken: b.taken,
    arrived: b.arrived,
    stored: storedOf(b) + b.pond,
    hoursDrowned: drowned,
    hoursDry: dry,
    daily,
    ions,
    sugar,
    days: n,
    leachedTotal: b.leached,
    poolEnd: b.pool,
  }
}

/** Every 0/1-can schedule over n days (2^n). */
export function* binarySchedules(n: number): Generator<number[]> {
  for (let i = 0; i < 2 ** n; i += 1) {
    const c: number[] = []
    for (let d = 0; d < n; d += 1) c.push((i >> d) & 1)
    yield c
  }
}

/** Every schedule of 0–maxPer cans at dawn over n days. */
export function* schedules(n: number, maxPer = 2): Generator<number[]> {
  const total = (maxPer + 1) ** n
  for (let i = 0; i < total; i += 1) {
    const c: number[] = []
    let x = i
    for (let d = 0; d < n; d += 1) {
      c.push(x % (maxPer + 1))
      x = Math.floor(x / (maxPer + 1))
    }
    yield c
  }
}
