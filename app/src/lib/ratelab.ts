/**
 * The Rate Lab model.
 *
 * This replaces the old `rate = min(light, CO₂, water)` shortcut. That version
 * produced straight lines and hard corners; real photosynthesis produces
 * saturating curves, has a temperature optimum with an enzyme cliff past it,
 * and runs against respiration the whole time — so the NET rate can be
 * negative. That last detail is what makes the compensation point findable.
 *
 * Everything here is a pure function of (leaf, environment, leaf water state).
 * Units are real: µmol photons m⁻² s⁻¹ for light, ppm for CO₂, °C, kPa.
 */

import type { BandCaps } from './bands'
import type { LeafPreset } from './leaves'
import { BIOME_BY_ID, LEAF_BY_ID, type BiomeId } from './leaves'

/* ------------------------------------------------------------------ */
/* Units and ranges                                                   */
/* ------------------------------------------------------------------ */

/** Full midday sun, µmol photons m⁻² s⁻¹ (PAR). */
export const PAR_FULL_SUN = 2000
/** Top of the CO₂ slider, ppm. Present-day air is about 425 ppm. */
export const CO2_MAX_PPM = 1500
export const CO2_AMBIENT_PPM = 425
export const TEMP_MIN_C = 0
export const TEMP_MAX_C = 50

/** Scales µmol CO₂ m⁻² s⁻¹ into the bubbles-per-minute a school apparatus shows. */
const BUBBLE_SCALE = 9
const TRANSPIRATION_SCALE = 1
const UPTAKE_SCALE = 1
/** Fraction of soil water a unit of transpiration removes per second. */
const SOIL_DRAIN = 0.004

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/* ------------------------------------------------------------------ */
/* Physics: how thirsty is the air?                                   */
/* ------------------------------------------------------------------ */

/**
 * Saturation vapour pressure, kPa (Tetens equation). Rises steeply with
 * temperature — which is the real reason hot air dries a leaf out so fast.
 */
export function saturationVapourPressure(tempC: number): number {
  return 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3))
}

/**
 * Vapour pressure deficit, kPa — the pull the atmosphere exerts on the water
 * inside a leaf. This, not temperature alone, sets the rate of water loss.
 */
export function vapourPressureDeficit(tempC: number, humidity: number): number {
  return Math.max(0, saturationVapourPressure(tempC) * (1 - clamp01(humidity)))
}

/* ------------------------------------------------------------------ */
/* Temperature response                                               */
/* ------------------------------------------------------------------ */

/** Sharpness of the temperature response. Higher = narrower optimum. */
const TEMP_SHARPNESS = 1.6

/**
 * Temperature factor, 0–1 — the standard asymmetric beta response used in crop
 * physiology. It is exactly 1 at the leaf's optimum and exactly 0 at its
 * chilling limit and its denaturation limit, with a broad shoulder below the
 * optimum and a steep cliff above it. That asymmetry is the point: warming up
 * is gradual and reversible, cooking is sudden and permanent.
 */
export function tempFactor(tempC: number, leaf: LeafPreset): number {
  const { tMin, tOpt, tMax } = leaf
  if (tempC <= tMin || tempC >= tMax) return 0
  const exponent = (tOpt - tMin) / (tMax - tOpt)
  const falling = (tMax - tempC) / (tMax - tOpt)
  const rising = Math.pow((tempC - tMin) / (tOpt - tMin), exponent)
  return clamp01(Math.pow(falling * rising, TEMP_SHARPNESS))
}

/** How alive the tissue is, 0–1 — collapses once past the denaturation limit. */
function viability(tempC: number, leaf: LeafPreset): number {
  const notFrozen = smoothstep(leaf.tMin - 4, leaf.tMin + 2, tempC)
  const notCooked = 1 - smoothstep(leaf.tMax + 2, leaf.tMax + 12, tempC)
  return clamp01(notFrozen * notCooked)
}

/* ------------------------------------------------------------------ */
/* Environment + the full physiology solve                            */
/* ------------------------------------------------------------------ */

export interface LabEnv {
  /** Light as a fraction of full sun, 0–1. */
  light: number
  /** CO₂ as a fraction of CO2_MAX_PPM, 0–1. */
  co2: number
  /** Air temperature, °C. */
  tempC: number
  /** Relative humidity, 0–1. */
  humidity: number
  /** Soil water, 0–1. */
  soilWater: number
  /** Leaf turgor / hydration, 0–1. 1 = firm, 0 = fully wilted. */
  turgor: number
  /**
   * How far the stomata may open, 0–1, as a fraction of the leaf's own
   * maximum. A learner's ceiling, not a hand on the door: the leaf's reflexes
   * (turgor, dry air, CAM) still close them further on top of this, and
   * nothing can hold them open past it. Absent means 1 — the plain lab.
   */
  hatch?: number
  /** Night. A CAM plant opens its hatches only now. */
  night?: boolean
}

/**
 * The leaf's own reflexes, 0–1 each — the part of the opening the learner
 * does not control. Exposed so the HUD can draw where the plant is holding
 * the hatches ("your slider says 80, the leaf is holding at 45").
 */
export interface StomatalGates {
  /** A wilting leaf physically cannot hold its stomata open. */
  turgor: number
  /** Very dry air triggers partial closure even in a well-watered plant. */
  vpd: number
  /** CAM plants keep the doors shut through the day on purpose, and open at night. */
  cam: number
  /** The product — how far the plant itself would open, before any ceiling. */
  plant: number
}

export function stomatalGates(leaf: LeafPreset, env: LabEnv): StomatalGates {
  // Firm above 0.45, shut below 0.1. The old edges (0.18–0.6) closed the
  // hatches so early and so smoothly that a leaf in a dry wind settled at
  // half-open and half-firm and never actually wilted, whatever the learner
  // did — a plant that could not be got wrong. Real closure is partial and
  // late; a leaf in a drying pot under a hot wind does go limp.
  const turgor = smoothstep(0.1, 0.45, env.turgor)
  const cam = leaf.pathway === 'CAM' ? (env.night ? 0.85 : 0.12) : 1
  const vpdKpa = vapourPressureDeficit(env.tempC, env.humidity)
  const vpd = 1 / (1 + Math.pow(vpdKpa / 3.2, 1.6))
  return { turgor, vpd, cam, plant: clamp01(turgor * cam * vpd) }
}

/** The pore as a fraction of fully open, 0–1: the plant's gates under the learner's ceiling. */
export function poreOpening(leaf: LeafPreset, env: LabEnv): number {
  const ceiling = env.hatch === undefined ? 1 : clamp01(env.hatch)
  return Math.min(ceiling, stomatalGates(leaf, env).plant)
}

export interface Physiology {
  /** Light reaching the leaf, µmol photons m⁻² s⁻¹. */
  par: number
  /** CO₂ in the air, ppm. */
  co2Ppm: number
  /** CO₂ actually inside the leaf, ppm — throttled by the stomata. */
  ciPpm: number
  /** Stomatal conductance, 0–1. How far the leaf's doors are open. */
  conductance: number
  vpd: number
  lightFactor: number
  co2Factor: number
  tempFactor: number
  /** Fraction of gross photosynthesis wasted by photorespiration (C3 only). */
  photorespiration: number
  /** Gross photosynthesis, µmol CO₂ m⁻² s⁻¹. */
  gross: number
  /** Respiration, µmol CO₂ m⁻² s⁻¹ — always running, faster when warm. */
  respiration: number
  /** Net = gross − respiration. Negative means the plant is losing sugar. */
  net: number
  /** Water lost per unit time (relative units). */
  transpiration: number
  /** Water taken up by roots per unit time (relative units). */
  uptake: number
  /** Net O₂ exchange the apparatus would read, bubbles min⁻¹. Can be negative. */
  reading: number
  /** Sugar made per unit water lost — the number that decides who survives a desert. */
  waterUseEfficiency: number
}

/** How far the stomata are open, 0–1. */
export function stomatalConductance(leaf: LeafPreset, env: LabEnv): number {
  const anatomicalMax = 0.2 + 0.8 * leaf.stomatalDensity
  // The plant's reflexes decide how far it would open; a ceiling from the
  // learner can only cap that. With no ceiling this is exactly the old
  // product of the three gates.
  return clamp01(anatomicalMax * poreOpening(leaf, env))
}

/* ------------------------------------------------------------------ */
/* Water, in millilitres                                               */
/* ------------------------------------------------------------------ */

/**
 * A fully open stoma's conductance for a well-watered crop leaf, mol m⁻² s⁻¹.
 *
 * The model's `conductance` is a 0–1 index and its `transpiration` a
 * relative number, which is fine for a bubble count but not for a jar
 * marked in millilitres. The bridge is the standard gas-exchange relation
 * E = gₛ · VPD / P, with gₛ at the upper middle of the range reported for
 * irrigated crop trials — 300–700 mmol m⁻² s⁻¹ (Reynolds et al., CIMMYT
 * *Physiological Breeding II*, ch. 2 "Stomatal conductance"). Not a bean
 * figure: a whole-crop one, which is the honest level of precision here.
 */
export const GS_FULL_MOL = 0.5
/** Atmospheric pressure, kPa. */
const ATMOSPHERE_KPA = 101.3
/** Water, g mol⁻¹. */
const WATER_G_PER_MOL = 18.015

/**
 * Water a leaf loses per hour, mL, for a given opening and air.
 *
 * `conductance` is the model's 0–1 index; `leafAreaM2` the specimen's real
 * leaf area. One millilitre is one gram. A bean leaf area of 0.028 m² fully
 * open in 1.5 kPa air comes out at about 10 mL h⁻¹ — tens of millilitres a
 * day, which is where the potometer in a school lab lands too.
 */
export function transpirationMlPerHour(conductance: number, vpdKpa: number, leafAreaM2: number): number {
  const molPerM2s = clamp01(conductance) * GS_FULL_MOL * (Math.max(0, vpdKpa) / ATMOSPHERE_KPA)
  return molPerM2s * leafAreaM2 * WATER_G_PER_MOL * 3600
}

/** Solve the whole leaf at one instant. Pure — safe to call inside a render loop. */
export function solveLeaf(leaf: LeafPreset, env: LabEnv): Physiology {
  const par = env.light * PAR_FULL_SUN
  const co2Ppm = env.co2 * CO2_MAX_PPM
  const vpd = vapourPressureDeficit(env.tempC, env.humidity)
  const conductance = stomatalConductance(leaf, env)
  const pore = poreOpening(leaf, env)

  // Stomata throttle how much CO₂ reaches the chloroplasts. Cᵢ/Cₐ runs from
  // about 0.7 for a well-watered C3 leaf with its stomata open down toward
  // the compensation point when they are shut; the floor is the leak through
  // the cuticle and the CO₂ the leaf's own respiration hands back. The
  // earlier `0.45 + 0.55·conductance` let a shut leaf keep nearly half its
  // carbon supply, which made closing the hatches almost free — and a trade
  // with a free side is not a trade.
  let ciPpm = co2Ppm * (0.15 + 0.6 * pore)
  // A CAM plant works from the acid it banked overnight, so the CO₂ in today's
  // air barely matters to it — a genuinely surprising, checkable prediction.
  if (leaf.pathway === 'CAM') ciPpm = Math.max(ciPpm, 780)

  const lightFactor = par / (par + leaf.kLight)
  const co2Factor = ciPpm / (ciPpm + leaf.kCo2)
  const tFactor = tempFactor(env.tempC, leaf)

  // Photorespiration: RuBisCO grabs O₂ instead of CO₂. Worse when hot, worse
  // when CO₂ is scarce, and absent in C4/CAM plants because they concentrate CO₂.
  const photorespiration =
    leaf.pathway === 'C3'
      ? 0.38 * clamp01((env.tempC - 12) / 26) * (280 / (280 + ciPpm))
      : 0

  const gross = leaf.pmax * lightFactor * co2Factor * tFactor * (1 - photorespiration)

  // Respiration never stops while the tissue is alive, and speeds up when warm
  // (Q10 ≈ 1.8 once you allow for the acclimation real leaves manage).
  const respiration =
    leaf.rd25 * Math.pow(1.8, (env.tempC - 25) / 10) * viability(env.tempC, leaf)

  const net = gross - respiration

  const transpiration =
    conductance * leaf.leafArea * (1 - 0.82 * leaf.cuticle) * vpd * TRANSPIRATION_SCALE
  const uptake = (0.35 + 0.65 * leaf.rootDepth) * env.soilWater * UPTAKE_SCALE

  const reading = net * leaf.leafArea * BUBBLE_SCALE
  const waterUseEfficiency = transpiration > 1e-4 ? Math.max(0, gross) * leaf.leafArea / transpiration : 0

  return {
    par,
    co2Ppm,
    ciPpm,
    conductance,
    vpd,
    lightFactor,
    co2Factor,
    tempFactor: tFactor,
    photorespiration,
    gross,
    respiration,
    net,
    transpiration,
    uptake,
    reading,
    waterUseEfficiency,
  }
}

/* ------------------------------------------------------------------ */
/* Water balance over time                                            */
/* ------------------------------------------------------------------ */

export interface WaterStep {
  turgor: number
  soilWater: number
}

/**
 * Advance the plant's water state by `dt` seconds. A succulent's big internal
 * reservoir makes it respond far more slowly, which is exactly why it survives.
 */
export function stepWater(
  leaf: LeafPreset,
  env: LabEnv,
  phys: Physiology,
  biomeRainRate: number,
  dt: number,
): WaterStep {
  const buffer = 0.5 + 3 * leaf.waterStore
  const turgor = clamp01(env.turgor + ((phys.uptake - phys.transpiration) * 0.06 * dt) / buffer)
  const soilWater = clamp01(
    env.soilWater - phys.transpiration * SOIL_DRAIN * dt + (biomeRainRate * dt) / 60,
  )
  return { turgor, soilWater }
}

/* ------------------------------------------------------------------ */
/* Which factor is limiting? (numeric sensitivity)                    */
/* ------------------------------------------------------------------ */

export type VarId = 'light' | 'co2' | 'temp' | 'water'

export interface Sensitivities {
  light: number
  co2: number
  temp: number
  water: number
  /** The factor whose small increase would help most. Null when nothing helps. */
  limiting: VarId | null
  /** True when raising the temperature would now REDUCE the rate. */
  heatDamage: boolean
  /** True when the leaf is below its chilling threshold. */
  tooCold: boolean
  /** Past the denaturation limit — the enzymes are wrecked, not merely slowed. */
  lethalHeat: boolean
  /**
   * True when CO₂ is the limiting factor only because water stress has closed
   * the stomata. The proximate cause and the ultimate cause differ, and saying
   * so out loud is the difference between a fact and an explanation.
   */
  stomatalLimited: boolean
}

function nudge(env: LabEnv, v: VarId, delta: number): LabEnv {
  switch (v) {
    case 'light':
      return { ...env, light: clamp01(env.light + delta) }
    case 'co2':
      return { ...env, co2: clamp01(env.co2 + delta) }
    case 'temp':
      return { ...env, tempC: env.tempC + delta * (TEMP_MAX_C - TEMP_MIN_C) }
    case 'water':
      return { ...env, soilWater: clamp01(env.soilWater + delta), turgor: clamp01(env.turgor + delta) }
  }
}

/**
 * Rather than guessing, measure: give each factor a 4% nudge and see which one
 * buys the most extra rate. This is honest even in the awkward regions (past
 * the temperature optimum, below the compensation point) where a hand-written
 * rule would lie.
 */
export function sensitivities(leaf: LeafPreset, env: LabEnv): Sensitivities {
  const delta = 0.04
  const phys = solveLeaf(leaf, env)
  const base = phys.net
  const out = { light: 0, co2: 0, temp: 0, water: 0 } as Record<VarId, number>
  ;(['light', 'co2', 'temp', 'water'] as VarId[]).forEach((v) => {
    out[v] = (solveLeaf(leaf, nudge(env, v, delta)).net - base) / delta
  })

  const lethalHeat = phys.tempFactor <= 0.001 && env.tempC > leaf.tOpt

  let limiting: VarId | null = null
  let best = 0.15
  ;(['light', 'co2', 'temp', 'water'] as VarId[]).forEach((v) => {
    // Past the optimum, "more heat" only ever looks helpful because a dying
    // leaf respires less. Never offer that as the limiting factor.
    if (v === 'temp' && env.tempC >= leaf.tOpt) return
    if (out[v] > best) {
      best = out[v]
      limiting = v
    }
  })

  return {
    ...out,
    limiting,
    // Only call it damage once we are genuinely past the optimum — a leaf
    // sitting exactly at its best temperature is not "overheating".
    heatDamage: env.tempC > leaf.tOpt + 2 && out.temp < -0.5,
    tooCold: env.tempC < leaf.tMin + 4,
    lethalHeat,
    stomatalLimited: phys.conductance < 0.35 && out.water > 0.5 && out.co2 > out.light,
  }
}

/* ------------------------------------------------------------------ */
/* Variable metadata — drives sliders, axes and table headers          */
/* ------------------------------------------------------------------ */

export interface VarMeta {
  id: VarId
  label: string
  /** Wording for the youngest band. */
  simpleLabel: string
  unit: string
  /** Compact unit for the value chip, where space is tight. */
  chipUnit: string
  /** Short axis label including units. */
  axis: string
  min: number
  max: number
  step: number
  color: string
  /** Read the real-world value out of an environment. */
  read: (env: LabEnv) => number
  /** Write a real-world value into an environment patch. */
  patch: (real: number) => Partial<LabEnv>
  format: (real: number) => string
}

export const VARS: Record<VarId, VarMeta> = {
  light: {
    id: 'light',
    label: 'Light intensity',
    simpleLabel: 'Sunlight',
    unit: 'µmol m⁻² s⁻¹',
    chipUnit: 'µmol',
    axis: 'Light intensity (µmol m⁻² s⁻¹)',
    min: 0,
    max: PAR_FULL_SUN,
    step: 50,
    color: '#E8A33D',
    read: (e) => e.light * PAR_FULL_SUN,
    patch: (real) => ({ light: clamp01(real / PAR_FULL_SUN) }),
    format: (real) => `${Math.round(real)}`,
  },
  co2: {
    id: 'co2',
    label: 'CO₂ concentration',
    simpleLabel: 'Carbon dioxide',
    unit: 'ppm',
    chipUnit: 'ppm',
    axis: 'CO₂ concentration (ppm)',
    min: 0,
    max: CO2_MAX_PPM,
    step: 25,
    color: '#7A8B99',
    read: (e) => e.co2 * CO2_MAX_PPM,
    patch: (real) => ({ co2: clamp01(real / CO2_MAX_PPM) }),
    format: (real) => `${Math.round(real)}`,
  },
  temp: {
    id: 'temp',
    label: 'Temperature',
    simpleLabel: 'Temperature',
    unit: '°C',
    chipUnit: '°C',
    axis: 'Temperature (°C)',
    min: TEMP_MIN_C,
    max: TEMP_MAX_C,
    step: 1,
    color: '#C13B33',
    read: (e) => e.tempC,
    patch: (real) => ({ tempC: real }),
    format: (real) => real.toFixed(0),
  },
  water: {
    id: 'water',
    label: 'Soil water',
    simpleLabel: 'Water',
    unit: '%',
    chipUnit: '%',
    axis: 'Soil water (%)',
    min: 0,
    max: 100,
    step: 5,
    color: '#2E6DA8',
    read: (e) => e.soilWater * 100,
    patch: (real) => ({ soilWater: clamp01(real / 100) }),
    format: (real) => `${Math.round(real)}`,
  },
}

export const VAR_ORDER: VarId[] = ['light', 'co2', 'temp', 'water']

/* ------------------------------------------------------------------ */
/* Readings, repeats, statistics                                      */
/* ------------------------------------------------------------------ */

export interface Reading {
  id: number
  /** Which variable was being investigated. */
  xVar: VarId
  /** Its value in real units. */
  x: number
  /** Net O₂ exchange, bubbles min⁻¹. Negative = consuming O₂. */
  y: number
  /** Individual repeat values, when the trial was repeated. */
  repeats: number[]
  /** Half-range of the repeats, used as the uncertainty bar. */
  uncertainty: number
  /** Flagged when one repeat sits far outside the others. */
  anomalous: boolean
  leafId: string
  biomeId: BiomeId
  /** Every control setting at the moment of measurement, in real units. */
  controls: { light: number; co2: number; temp: number; water: number; humidity: number }
  /** The prediction the learner committed to before running, if any. */
  predicted: number | null
  /** Water use efficiency at the time of the reading. */
  wue: number
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

export function halfRange(xs: number[]): number {
  if (xs.length < 2) return 0
  return (Math.max(...xs) - Math.min(...xs)) / 2
}

/**
 * A repeat is anomalous when it sits more than twice the typical spread away
 * from the middle of the others — the rule a marking scheme would accept.
 */
export function findAnomaly(xs: number[]): boolean {
  if (xs.length < 3) return false
  const m = mean(xs)
  const spread = halfRange(xs) || 1e-6
  return xs.some((x) => Math.abs(x - m) > 1.6 * spread && Math.abs(x - m) > 1.5)
}

/** Gaussian-ish instrument noise from two uniform samples. */
export function noisy(value: number, fraction: number): number {
  if (fraction <= 0) return value
  const u = Math.random() + Math.random() - 1
  const scale = Math.max(1.2, Math.abs(value))
  return value + u * fraction * scale
}

/** Run one measurement (already-solved rate) through the band's instrument. */
export function takeReading(trueValue: number, caps: BandCaps): number[] {
  const n = caps.repeats ? 3 : 1
  return Array.from({ length: n }, () => Number(noisy(trueValue, caps.noise).toFixed(1)))
}

/* ------------------------------------------------------------------ */
/* Curve description helpers (used by missions and the graph)          */
/* ------------------------------------------------------------------ */

/** Readings that share an investigated variable, sorted by x. */
export function seriesFor(readings: Reading[], xVar: VarId): Reading[] {
  return readings.filter((r) => r.xVar === xVar).sort((a, b) => a.x - b.x)
}

/**
 * Has the learner demonstrated a plateau? True when the top of the range is
 * well sampled and those high-x readings stop climbing.
 */
export function hasPlateau(series: Reading[], xVar: VarId): boolean {
  if (series.length < 4) return false
  const meta = VARS[xVar]
  const high = series.filter((r) => r.x >= meta.max * 0.6)
  if (high.length < 2) return false
  const peak = Math.max(...series.map((r) => r.y))
  if (peak < 4) return false
  const top = high.filter((r) => r.y >= peak * 0.85)
  if (top.length < 2) return false
  const spanX = Math.max(...top.map((r) => r.x)) - Math.min(...top.map((r) => r.x))
  return spanX >= meta.max * 0.2
}

/* ------------------------------------------------------------------ */
/* CSV export                                                         */
/* ------------------------------------------------------------------ */

export function readingsToCsv(readings: Reading[]): string {
  const head = [
    'trial',
    'investigating',
    'x_value',
    'x_unit',
    'net_O2_bubbles_per_min',
    'uncertainty',
    'repeats',
    'anomaly',
    'predicted',
    'leaf',
    'pathway',
    'climate',
    'light_umol_m2_s',
    'co2_ppm',
    'temperature_C',
    'soil_water_pct',
    'humidity_pct',
    'water_use_efficiency',
  ]
  const rows = readings.map((r, i) => {
    const leaf = LEAF_BY_ID[r.leafId]
    return [
      i + 1,
      VARS[r.xVar].label,
      r.x.toFixed(1),
      VARS[r.xVar].unit,
      r.y.toFixed(1),
      r.uncertainty.toFixed(1),
      r.repeats.join(' / '),
      r.anomalous ? 'yes' : 'no',
      r.predicted === null ? '' : r.predicted.toFixed(1),
      leaf?.name ?? r.leafId,
      leaf?.pathway ?? '',
      BIOME_BY_ID[r.biomeId]?.name ?? r.biomeId,
      r.controls.light.toFixed(0),
      r.controls.co2.toFixed(0),
      r.controls.temp.toFixed(1),
      r.controls.water.toFixed(0),
      (r.controls.humidity * 100).toFixed(0),
      r.wue.toFixed(2),
    ]
  })
  return [head, ...rows]
    .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n')
}

/** Was a committed prediction "close" to the measured value? Same tolerance the Data Lab uses. */
export function predictionClose(predicted: number, y: number): boolean {
  return Math.abs(predicted - y) <= Math.max(1.5, Math.abs(y) * 0.15)
}
