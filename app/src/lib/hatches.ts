/**
 * The Hatches — a plant-day the sim runs on its own.
 *
 * Stage 2 of the Sugar Line campaign, and the first *Keep it alive* round:
 * the learner holds one control — how far the stomata may open — against a
 * day of weather that plays out whether they are ready or not. Open, and
 * carbon comes in and sugar gets made; but water leaves the same way, and a
 * leaf that runs dry shuts its own hatches and stops. That trade is the
 * whole stage, and this module is the part of it that is not a picture.
 *
 * Three things are deliberately *not* here:
 *
 * - **Light is not in the trade.** Light goes through the leaf's clear top
 *   skin whether the stomata are open or shut. The day's sun drives the
 *   factory through `sim.light` exactly as the dial does in the plain lab;
 *   the hatch only ever meets CO₂ and water.
 * - **The control is a ceiling, not a hand on the door.** `sim.hatch` caps
 *   the opening; the plant's own reflexes (turgor, dry air, CAM) still close
 *   it further — see `poreOpening` in `ratelab.ts`. A plant that obeyed a
 *   slider would be a lie a ten-year-old would carry for years.
 * - **Nothing here is a picture.** Pure functions over the sim, so the whole
 *   day can be driven in Node and asserted on: winnable, missable, not won by
 *   leaving the slider alone. `verify-hatches-model.mjs` does exactly that.
 *
 * The same shape — a scripted timeline, one control, integrating meters, a
 * lock, a tally — is what the roots stage runs a plant-week on. Anything a
 * second stage would need is kept general; anything about stomata is named.
 */

import { rngFor } from './challenge'
import { BIOME_BY_ID, type BiomeId } from './leaves'
import { poreOpening, stomatalGates, transpirationMlPerHour, vapourPressureDeficit } from './ratelab'
import { SPECIMEN_BY_ID, type Specimen } from './specimens'
import type { SugarSolve } from './sugarline'
import type { SugarSim } from './sugarsim'

/* ------------------------------------------------------------------ */
/* The day's weather                                                   */
/* ------------------------------------------------------------------ */

export interface DryWind {
  /** Plant hour it arrives. */
  start: number
  hours: number
  /** Relative humidity while it blows, 0–1. */
  humidity: number
  /** °C added on top of the day's curve. */
  tempRise: number
  /** What the learner is told has arrived — the habitat's own wind. */
  name: string
}

export interface Cloud {
  start: number
  hours: number
  /** Fraction of the sun that gets through, 0–1. */
  light: number
}

export interface DaySpec {
  seed: number
  habitat: BiomeId
  /** First and last plant hour of the run. 6→18 is a day; 6→30 is a day and the night after. */
  from: number
  to: number
  /** How fast the day plays: plant hours per real second. */
  hoursPerSecond: number
  /** Midday light as a fraction of full sun. */
  peakLight: number
  /** The temperature curve: overnight low and afternoon high, °C. */
  tempLow: number
  tempHigh: number
  /** The habitat's ordinary humidity, before any wind. */
  humidity: number
  wind: DryWind | null
  cloud: Cloud | null
}

/** A day in ninety seconds; a day-and-night in three minutes. */
export const DAY_SECONDS = 90
export const DAWN = 6
export const DUSK = 18

/** The dry wind each habitat actually gets, in the words a learner there would use. */
const WIND_NAME: Record<BiomeId, string> = {
  savanna: 'the Harmattan',
  desert: 'a hot desert wind',
  temperate: 'a dry afternoon wind',
  rainforest: 'a dry spell',
  boreal: 'a dry, cold wind',
}

/**
 * Build the day from the seed and the habitat.
 *
 * The habitat supplies the ordinary day (its light, its temperature, its
 * humidity — the same numbers the plate shows); the seed decides when the
 * wind comes and how hard, and whether a cloud passes. Thirty phones on one
 * room code get the same wind at the same hour, which is what makes their
 * scores comparable.
 */
export function buildDay(seed: number, habitat: BiomeId, hours = DUSK - DAWN): DaySpec {
  const next = rngFor((seed ^ 0x5a17c4) >>> 0)
  const b = BIOME_BY_ID[habitat] ?? BIOME_BY_ID.temperate
  // The habitat's "typical daytime temperature" is an afternoon figure; the
  // night before it is cooler by an amount that depends on how dry the air is
  // (dry air cools fast).
  const swing = 6 + (1 - b.humidity) * 10
  const windStart = 10.5 + next() * 2.5
  const windHours = 2.5 + next() * 1.5
  // Drier habitats have drier winds. The floor keeps a rainforest "dry spell"
  // from being nothing at all.
  const windHumidity = Math.max(0.1, Math.min(0.32, b.humidity * (0.35 + next() * 0.15)))
  const cloud =
    next() < 0.45
      ? { start: 14 + next() * 2, hours: 0.6 + next() * 0.8, light: 0.3 + next() * 0.2 }
      : null
  return {
    seed,
    habitat,
    from: DAWN,
    to: DAWN + hours,
    // Always a day's pace: a day-and-night simply takes twice as long.
    hoursPerSecond: (DUSK - DAWN) / DAY_SECONDS,
    peakLight: b.light,
    tempLow: b.temp - swing,
    tempHigh: b.temp,
    humidity: b.humidity,
    wind: {
      start: round2(windStart),
      hours: round2(windHours),
      humidity: round2(windHumidity),
      tempRise: round2(2 + next() * 3),
      name: WIND_NAME[habitat],
    },
    cloud: cloud ? { start: round2(cloud.start), hours: round2(cloud.hours), light: round2(cloud.light) } : null,
  }
}

export interface Weather {
  /** Light as a fraction of full sun. Zero at night. */
  light: number
  tempC: number
  humidity: number
  night: boolean
  windOn: boolean
  cloudOn: boolean
  /** The air's pull on the leaf, kPa. */
  vpdKpa: number
}

/** The weather at a plant hour (0–24, wrapping). */
export function weatherAt(spec: DaySpec, hour: number): Weather {
  const h = ((hour % 24) + 24) % 24
  const night = h < DAWN || h >= DUSK
  // The sun: a half-sine from dawn to dusk.
  const sun = night ? 0 : Math.sin(((h - DAWN) / (DUSK - DAWN)) * Math.PI)
  const cloudOn = !!spec.cloud && h >= spec.cloud.start && h < spec.cloud.start + spec.cloud.hours
  const light = spec.peakLight * sun * (cloudOn ? spec.cloud!.light : 1)
  // Temperature lags the sun by about two hours and bottoms out before dawn.
  const phase = ((h - 4) / 24) * 2 * Math.PI
  const t = spec.tempLow + (spec.tempHigh - spec.tempLow) * (0.5 - 0.5 * Math.cos(phase))
  const windOn = !!spec.wind && h >= spec.wind.start && h < spec.wind.start + spec.wind.hours
  const tempC = t + (windOn ? spec.wind!.tempRise : 0)
  // Humidity runs opposite to temperature through the day, then the wind
  // overrides it.
  const humid = windOn
    ? spec.wind!.humidity
    : Math.min(0.98, spec.humidity + (spec.humidity * 0.35) * (0.5 + 0.5 * Math.cos(phase)) - spec.humidity * 0.17)
  return {
    light: round3(light),
    tempC: round2(tempC),
    humidity: round3(humid),
    night,
    windOn,
    cloudOn,
    vpdKpa: round3(vapourPressureDeficit(tempC, humid)),
  }
}

/* ------------------------------------------------------------------ */
/* The run                                                             */
/* ------------------------------------------------------------------ */

export interface DaySample {
  hour: number
  /** The learner's ceiling at the time. */
  hatch: number
  /** What the pore actually was, 0–1 of fully open. */
  pore: number
  /** The plant's own reflex, before the ceiling. */
  plant: number
  turgor: number
  /** mg h⁻¹ and mL h⁻¹, at that moment. */
  sugarRate: number
  waterRate: number
  humidity: number
  windOn: boolean
}

export interface DayRun {
  spec: DaySpec
  /** Plant hour, `spec.from` → `spec.to`. */
  hour: number
  /** The pot: water available to the roots right now, and what it holds full, mL. */
  potMl: number
  potCapacityMl: number
  /** The leaf's water store, mL, and how far below full it is. */
  leafMl: number
  leafDeficitMl: number
  /** The day's total sugar made by the leaf, mg. */
  sugarMg: number
  /** The day's total water lost through the stomata, mL. */
  waterMl: number
  /** Whether the leaf is wilted right now. */
  wilted: boolean
  /** Hours spent wilted, and when the first wilt began (plant hour) or null. */
  wiltHours: number
  wiltedAt: number | null
  /** Lowest turgor seen. */
  minTurgor: number
  /** Samples every quarter plant-hour, for the tally and the suite. */
  samples: DaySample[]
  done: boolean
}

/** Turgor below which the leaf is wilted: the point where its own gate has all but shut. */
export const WILT_TURGOR = 0.35
/** Turgor at or above which the leaf counts as firm at the end of the day. */
export const FIRM_TURGOR = 0.6
/** Where the pot starts the day: watered the evening before, not to the brim. */
export const DAY_SOIL_WATER = 0.8
const SAMPLE_EVERY = 0.25

/*
 * Water, in the day, is real.
 *
 * The plain lab's turgor is a dimensionless nudge that suits a rate reading
 * and never a wilt. A day is different: the only reason the hatches are a
 * decision is that the pot and the leaf hold a finite amount of water, and
 * the air can take it faster than the roots can replace it. So for the run
 * the pot is millilitres, the leaf's store is millilitres, and turgor is the
 * leaf's deficit against that store. All three scale with the specimen's
 * real leaf area, so a maize plant has a bigger pot and a bigger reservoir
 * than a bean, and the same air.
 *
 * - `POT_ML_PER_M2` — what a pot sized for the plant holds when full. A bean
 *   at 0.028 m² gets 170 mL, a small pot's worth of available water.
 * - `LEAF_ML_PER_M2` — water in the leaves, about 180 g m⁻² fresh weight
 *   (leaf water content sits around 150–250 g m⁻² across crops).
 * - `WILT_FRACTION` — a leaf goes limp after losing about a quarter of that;
 *   real leaves wilt somewhere in the 10–20% band and fully collapse past it.
 * - `UPTAKE_ML_PER_M2_H` — the most the roots can lift per hour from a wet
 *   pot, falling steeply as the pot dries (∝ soil water^1.5).
 */
export const WATER_TUNE = {
  POT_ML_PER_M2: 5000,
  LEAF_ML_PER_M2: 180,
  WILT_FRACTION: 0.2,
  UPTAKE_ML_PER_M2_H: 800,
  /** How much deeper roots enlarge the reservoir and the lift: factor = base + reach × rootDepth. */
  ROOT_BASE: 0.35,
  ROOT_REACH: 1.2,
  /** How steeply the roots' lift falls as the pot dries: uptake ∝ soil^POW. */
  DRY_POW: 1.5,
  /** Water that leaves through the cuticle even with every stoma shut, as a fraction of fully-open loss. */
  CUTICLE_LEAK: 0.04,
}
/*
 * Those numbers were not reasoned into place; they were searched for. The
 * brief was two sentences — *a bean in a temperate day with a dry afternoon
 * wind goes limp if left wide open and stays firm at about half; maize in the
 * Harmattan goes limp at anything above a third* — and the search in
 * `verify-hatches-model.mjs` asserts both still hold, across seeds, so the
 * tuning cannot drift without the suite saying so.
 */

/**
 * Put the sim at dawn and hand it the day.
 *
 * The learner's dials are not the controls here — the sun, the air and the
 * clock are the script's — so they are set from the weather every step and
 * the one thing the learner holds is `sim.hatch`. Soil water starts wet
 * enough to matter, turgor firm, the phloem intact.
 */
export function startDay(sim: SugarSim, spec: DaySpec, hatch = 1): DayRun {
  const area = leafAreaOf(sim)
  const reach = WATER_TUNE.ROOT_BASE + WATER_TUNE.ROOT_REACH * rootDepthOf(sim)
  const run: DayRun = {
    spec,
    hour: spec.from,
    potCapacityMl: round2(area * WATER_TUNE.POT_ML_PER_M2 * reach),
    potMl: round2(area * WATER_TUNE.POT_ML_PER_M2 * reach * DAY_SOIL_WATER),
    leafMl: round2(area * WATER_TUNE.LEAF_ML_PER_M2),
    leafDeficitMl: 0,
    sugarMg: 0,
    waterMl: 0,
    wilted: false,
    wiltHours: 0,
    wiltedAt: null,
    minTurgor: 1,
    samples: [],
    done: false,
  }
  sim.day = run
  sim.hatch = hatch
  sim.soilWater = DAY_SOIL_WATER
  sim.turgor = 1
  sim.girdled = false
  sim.tracerActive = false
  applyWeather(sim, weatherAt(spec, spec.from))
  return run
}

function applyWeather(sim: SugarSim, w: Weather): void {
  sim.light = w.light
  sim.tempC = w.tempC
  sim.humidity = w.humidity
  sim.night = w.night
}

/** The leaf's real area for the water arithmetic. */
function leafAreaOf(sim: SugarSim): number {
  const s: Specimen | undefined = SPECIMEN_BY_ID[sim.specimenId]
  return s?.leafAreaM2 ?? 0.03
}

function rootDepthOf(sim: SugarSim): number {
  const s: Specimen | undefined = SPECIMEN_BY_ID[sim.specimenId]
  return s?.leaf.rootDepth ?? 0.5
}

/**
 * One tick of the day. Called from `stepSim` with the solve it just made.
 *
 * The meters integrate the model's own numbers — `production` is the mg h⁻¹
 * the plant stage already reports, and the water is the same conductance
 * the pore is drawn from, put through `transpirationMlPerHour`. One solve
 * drives the picture and the meters, so they cannot disagree.
 */
export function stepDay(sim: SugarSim, solve: SugarSolve, dtHours: number): void {
  const run = sim.day
  if (!run || run.done) return
  const specimen = SPECIMEN_BY_ID[sim.specimenId]
  const w = weatherAt(run.spec, run.hour)

  const area = leafAreaOf(sim)
  const sugarRate = Math.max(0, solve.production)
  // Through the stomata, plus the cuticle's unavoidable leak.
  const stomatal = transpirationMlPerHour(solve.leaf.conductance, w.vpdKpa, area)
  const leak = transpirationMlPerHour(1, w.vpdKpa, area) * WATER_TUNE.CUTICLE_LEAK
  const waterRate = stomatal + leak
  run.sugarMg += sugarRate * dtHours
  run.waterMl += waterRate * dtHours

  /* -- the water balance, in millilitres --
     The roots lift what the leaf asks for, up to what a pot this dry lets
     them; the shortfall comes out of the leaf and is what wilts it. A leaf
     in credit takes water back at the same root-limited rate — recovery is
     not instant, the roots have to catch up. */
  const soilFrac = run.potCapacityMl > 0 ? run.potMl / run.potCapacityMl : 0
  const reach = WATER_TUNE.ROOT_BASE + WATER_TUNE.ROOT_REACH * rootDepthOf(sim)
  const uptakeMax = WATER_TUNE.UPTAKE_ML_PER_M2_H * area * Math.pow(Math.max(0, soilFrac), WATER_TUNE.DRY_POW) * reach
  const wanted = waterRate + run.leafDeficitMl / Math.max(dtHours, 1e-6) * 0.35
  const uptake = Math.min(uptakeMax, Math.max(0, wanted))
  run.potMl = Math.max(0, run.potMl - uptake * dtHours)
  run.leafDeficitMl = Math.max(0, Math.min(run.leafMl, run.leafDeficitMl + (waterRate - uptake) * dtHours))
  sim.soilWater = round3(run.potCapacityMl > 0 ? run.potMl / run.potCapacityMl : 0)
  sim.turgor = round3(1 - Math.min(1, run.leafDeficitMl / (run.leafMl * WATER_TUNE.WILT_FRACTION)))

  const wilted = sim.turgor < WILT_TURGOR
  if (wilted) {
    run.wiltHours += dtHours
    if (run.wiltedAt === null) run.wiltedAt = round2(run.hour)
  }
  run.wilted = wilted
  run.minTurgor = Math.min(run.minTurgor, sim.turgor)

  const last = run.samples[run.samples.length - 1]
  if (!last || run.hour - last.hour >= SAMPLE_EVERY - 1e-9) {
    const env = { ...simEnvLite(sim), turgor: sim.turgor }
    run.samples.push({
      hour: round2(run.hour),
      hatch: round3(sim.hatch),
      pore: specimen ? round3(poreOpening(specimen.leaf, env)) : 0,
      plant: specimen ? round3(stomatalGates(specimen.leaf, env).plant) : 0,
      turgor: round3(sim.turgor),
      sugarRate: round2(sugarRate),
      waterRate: round2(waterRate),
      humidity: w.humidity,
      windOn: w.windOn,
    })
  }

  run.hour += dtHours
  if (run.hour >= run.spec.to) {
    run.hour = run.spec.to
    run.done = true
    return
  }
  applyWeather(sim, weatherAt(run.spec, run.hour))
}

function simEnvLite(sim: SugarSim) {
  return {
    light: sim.night ? 0 : sim.light,
    co2: sim.co2,
    tempC: sim.tempC,
    humidity: sim.humidity,
    soilWater: sim.soilWater,
    turgor: sim.turgor,
    hatch: sim.hatch,
    night: sim.night,
  }
}

/** Take the day away from the sim and hand its dials back. */
export function endDay(sim: SugarSim): void {
  sim.day = null
  sim.hatch = 1
}

/* ------------------------------------------------------------------ */
/* The tally                                                           */
/* ------------------------------------------------------------------ */

export interface DayTally {
  sugarMg: number
  waterMl: number
  /** Sugar per water, mg mL⁻¹ — the number level 2 scores. */
  mgPerMl: number
  /** Standing at the end of the day. */
  leafFirm: boolean
  turgorAtEnd: number
  wilted: boolean
  wiltedAt: number | null
  wiltHours: number
  /** When the wind came and what the ceiling was set to at the time. */
  windAt: number | null
  hatchAtWind: number | null
  /** What the plant itself was holding the hatches at when the wind was worst. */
  plantAtWind: number | null
  /** One sentence: the moment it went wrong and the move that would have fixed it. */
  advice: string
}

export function dayTally(run: DayRun, turgorAtEnd: number): DayTally {
  const wind = run.spec.wind
  const atWind = wind ? run.samples.find((s) => s.hour >= wind.start) : undefined
  const worst = wind
    ? run.samples
        .filter((s) => s.windOn)
        .reduce<DaySample | null>((a, s) => (a === null || s.plant < a.plant ? s : a), null)
    : null
  const leafFirm = turgorAtEnd >= FIRM_TURGOR && !run.wilted
  const mgPerMl = run.waterMl > 1e-6 ? run.sugarMg / run.waterMl : 0

  let advice: string
  if (run.wiltedAt !== null) {
    const lost = Math.round(run.wiltHours * 10) / 10
    // The number that would have saved it comes from the replay
    // (`safestCeiling`), which the card adds; a rule of thumb here would
    // contradict it, and did.
    advice =
      `You lost ${lost} ${lost === 1 ? 'hour' : 'hours'} to a wilt at ${clock(run.wiltedAt)}.` +
      (atWind && wind
        ? ` Your hatches were allowed ${Math.round(atWind.hatch * 100)}% when ${wind.name} came at ${clock(wind.start)}; closing them further then would have kept the leaf standing and the afternoon's sugar.`
        : ' Closing earlier keeps the afternoon.')
  } else if (!leafFirm) {
    advice = `The leaf is standing but limp at dusk (${Math.round(turgorAtEnd * 100)}%). It got through the day on the last of its water — a little less open in the afternoon would have left it firm.`
  } else if (run.minTurgor < 0.45) {
    advice = `Close call: the leaf dropped to ${Math.round(run.minTurgor * 100)}% firm and recovered. That is the trade working — you kept it open as long as it could bear.`
  } else {
    advice = `The leaf never came near wilting. If the sugar came up short, the hatches could have stood more open through the mild hours.`
  }

  return {
    sugarMg: round2(run.sugarMg),
    waterMl: round2(run.waterMl),
    mgPerMl: round3(mgPerMl),
    leafFirm,
    turgorAtEnd: round3(turgorAtEnd),
    wilted: run.wilted,
    wiltedAt: run.wiltedAt,
    wiltHours: round2(run.wiltHours),
    windAt: wind ? wind.start : null,
    hatchAtWind: atWind ? atWind.hatch : null,
    plantAtWind: worst ? worst.plant : null,
    advice,
  }
}

/** "13:50" from 13.83. */
export function clock(hour: number): string {
  const h = Math.floor(((hour % 24) + 24) % 24)
  const m = Math.round((hour - Math.floor(hour)) * 60) % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/* ------------------------------------------------------------------ */

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
