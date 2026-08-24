/**
 * The Sugar Line model — a whole plant as a supply chain.
 *
 * The Rate Lab stopped at the leaf: light in, oxygen bubbles out, end of story.
 * That is where most textbooks stop too, and it is why photosynthesis so often
 * lands as an equation to memorise rather than a system to reason about. This
 * model carries the carbon all the way through:
 *
 *   SOURCE  a leaf fixes CO₂ into glucose (the leaf solve, `solveLeaf`)
 *   BUFFER  the leaf banks the surplus as starch and spends it after dark
 *   LOADING companion cells pump sucrose into the sieve tubes — active,
 *           saturable, and the reason the source end is so concentrated
 *   FLOW    Münch pressure flow: sugar draws water in osmotically at the
 *           source, that pressure pushes the whole column toward the sinks
 *   SINKS   root store, fruit and growing tip unload it, burn some of it and
 *           bank the rest — and a FULL sink pushes back and slows the line
 *
 * Every number the instruments show is read out of this one solve, so the
 * gauges and the animation can never disagree with each other.
 *
 * Units are real throughout: µmol CO₂ m⁻² s⁻¹, mg of glucose-equivalent,
 * g L⁻¹ of sucrose, MPa, m h⁻¹.
 */

import { solveLeaf, type LabEnv, type Physiology } from './ratelab'
import type { Specimen, SinkPreset } from './specimens'

/* ------------------------------------------------------------------ */
/* Chemistry                                                          */
/* ------------------------------------------------------------------ */

/** Relative formula mass of glucose, g mol⁻¹. */
export const MR_GLUCOSE = 180.16
/** Relative formula mass of sucrose, g mol⁻¹. Two glucose units, minus a water. */
export const MR_SUCROSE = 342.3

/**
 * One µmol of CO₂ fixed becomes one sixth of a µmol of glucose — the 6 in
 * 6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂ — which is 0.0300 mg of sugar.
 */
export const MG_GLUCOSE_PER_UMOL_CO2 = MR_GLUCOSE / 6 / 1000

/* ------------------------------------------------------------------ */
/* Phloem hydraulics                                                  */
/* ------------------------------------------------------------------ */

/** Gas constant, J mol⁻¹ K⁻¹. */
const R_GAS = 8.314

/**
 * Lumped hydraulic conductivity of a sieve tube, m² s⁻¹ Pa⁻¹.
 *
 * A bare Hagen–Poiseuille tube of sieve-element bore would run sap at tens of
 * metres per hour, which is roughly fifty times too fast. The missing
 * resistance is the **sieve plates**: every few hundred micrometres the column
 * is forced through a perforated end wall, and those plates — not the tube —
 * dominate the pressure drop. Rather than model each plate, the constant below
 * lumps them in, calibrated so a 0.8 MPa gradient over a half-metre stem gives
 * the ~1 m h⁻¹ that radio-tracer studies actually measure.
 */
const PHLOEM_CONDUCTIVITY = 1.74e-10

/** Reference temperature for sap viscosity, °C. */
const VISCOSITY_REF_C = 20

/**
 * Sap is thicker when it is cold, so the same pressure moves it more slowly.
 * Water's viscosity falls about 2.4% per °C near room temperature; clamped so
 * neither a frost nor an oven produces a nonsense multiplier.
 */
export function viscosityFactor(tempC: number): number {
  return clamp(1 / (1 + 0.024 * (tempC - VISCOSITY_REF_C)), 0.45, 2.6)
}

/**
 * Osmotic (solute) potential of a sucrose solution, MPa — van 't Hoff.
 * This is what makes the source end of the phloem pressurised: sucrose pulls
 * water in from the neighbouring xylem, and the sieve tube's rigid wall turns
 * that inrush into turgor pressure.
 */
export function osmoticPressure(gramsPerLitre: number, tempC: number): number {
  const molPerM3 = (gramsPerLitre * 1000) / MR_SUCROSE
  return (molPerM3 * R_GAS * (tempC + 273.15)) / 1e6
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                      */
/* ------------------------------------------------------------------ */

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1)
}

/* ------------------------------------------------------------------ */
/* State                                                              */
/* ------------------------------------------------------------------ */

/** The stores the model carries between frames. Everything else is derived. */
export interface CarbonState {
  /** Free sugar in the mesophyll, available for loading. mg glucose-equivalent. */
  leafSugar: number
  /** The leaf's own overnight bank. Fills in surplus, drains after dark. mg. */
  leafStarch: number
  /** What each sink has banked so far, mg, in `Specimen.sinks` order. */
  sinkStore: number[]
  /** Running totals for the carbon-balance audit, mg. */
  totalFixed: number
  totalRespired: number
  totalExported: number
}

export function createCarbonState(specimen: Specimen): CarbonState {
  return {
    // A plant that has just been through a night starts with its buffer part
    // spent and a working amount of free sugar in the leaf.
    leafSugar: specimen.leafSugarStart,
    leafStarch: specimen.leafStarchStart,
    sinkStore: specimen.sinks.map((s) => s.startStore),
    totalFixed: 0,
    totalRespired: 0,
    totalExported: 0,
  }
}

/* ------------------------------------------------------------------ */
/* The solve                                                          */
/* ------------------------------------------------------------------ */

/** What one sink is doing this instant. */
export interface SinkFlow {
  id: string
  /** Share of the arriving sugar this sink is pulling, 0–1. */
  share: number
  /** Sugar arriving here, mg h⁻¹. */
  inflow: number
  /** Of that, the part burnt for growth and maintenance, mg h⁻¹. */
  burnt: number
  /** Of that, the part banked, mg h⁻¹. Negative when the sink is living off its store. */
  banked: number
  /** How full it is, 0–1. */
  fill: number
  /** Sucrose concentration at this unloading site, g L⁻¹. */
  concentration: number
}

export interface SugarSolve {
  /** The leaf-level physiology solve everything else is built on. */
  leaf: Physiology
  /** Gross sugar manufactured, mg h⁻¹. */
  production: number
  /** Sugar burnt by the leaf itself, mg h⁻¹. */
  leafRespiration: number
  /** Production − leaf respiration, mg h⁻¹. Negative in the dark. */
  netProduction: number
  /** Sugar moving into (positive) or out of (negative) the leaf's starch bank, mg h⁻¹. */
  starchFlux: number
  /** Sucrose concentration in the sieve tubes at the source, g L⁻¹. */
  sourceConcentration: number
  /** Demand-weighted concentration at the unloading end, g L⁻¹. */
  sinkConcentration: number
  /** Turgor pressure at the source end, MPa. */
  sourcePressure: number
  /** Turgor pressure at the sink end, MPa. */
  sinkPressure: number
  /** The gradient that drives the whole line, MPa. */
  pressureGradient: number
  /** Sap speed down the sieve tubes, m h⁻¹. */
  velocity: number
  /** Sugar leaving the leaf down the phloem, mg h⁻¹. */
  exportRate: number
  /** Ceiling the loading machinery imposes on export, mg h⁻¹. */
  loadingCapacity: number
  /** True when export is capped by loading rather than by the pressure gradient. */
  loadingLimited: boolean
  /** True when full sinks are what is holding the line back. */
  sinkLimited: boolean
  /** Per-sink detail, in `Specimen.sinks` order. */
  sinks: SinkFlow[]
  /** Total burnt at the sinks, mg h⁻¹. */
  sinkRespiration: number
  /** Everything the plant burns, mg h⁻¹. */
  wholePlantRespiration: number
  /** Fixed − burnt, mg h⁻¹. What the plant actually gains. */
  netGain: number
}

/** Leaf-level assimilation converted into sugar mass, mg h⁻¹. */
function sugarPerHour(umolPerM2PerSecond: number, leafAreaM2: number): number {
  return umolPerM2PerSecond * leafAreaM2 * MG_GLUCOSE_PER_UMOL_CO2 * 3600
}

/**
 * Solve the whole plant at one instant. Pure — safe inside a render loop, and
 * the same call the instruments, the graph and the animation all read.
 */
export function solveSugarLine(
  specimen: Specimen,
  env: LabEnv,
  state: CarbonState,
  options: { girdled: boolean },
): SugarSolve {
  const leaf = solveLeaf(specimen.leaf, env)
  const area = specimen.leafAreaM2

  const production = sugarPerHour(leaf.gross, area)
  const leafRespiration = sugarPerHour(leaf.respiration, area)
  const netProduction = production - leafRespiration

  /* ---- loading: active, saturable, and starch-buffered ---------------- */

  // Michaelis–Menten on the free sugar pool. A leaf with plenty of sugar
  // loads near its ceiling; an empty one barely loads at all.
  const available = Math.max(0, state.leafSugar)
  const saturation = available / (available + specimen.loadingKm)
  const loadingCapacity = specimen.loadingMax * saturation

  // Sucrose concentration at the source tracks how loaded the leaf is.
  const sourceConcentration =
    specimen.sourceCMin + (specimen.sourceCMax - specimen.sourceCMin) * saturation

  /* ---- the sinks: how hard is each one pulling? ----------------------- */

  const fills = specimen.sinks.map((s, i) => clamp01(state.sinkStore[i] / s.capacity))
  // A sink's pull is its demand tempered by how full it already is. A storage
  // organ that is packed cannot take more, and its unloading end fills with
  // sugar it cannot use — which is exactly how a full sink slows the line.
  const pulls = specimen.sinks.map((s, i) => s.demand * (1 - 0.92 * fills[i] * s.saturates))
  const totalPull = pulls.reduce((a, b) => a + b, 0)

  const sinkConcentrations = specimen.sinks.map((s, i) =>
    s.saturates ? s.sinkCMin + (sourceConcentration - s.sinkCMin) * 0.86 * fills[i] : s.sinkCMin,
  )
  const weightedSinkC =
    totalPull > 1e-6
      ? sinkConcentrations.reduce((sum, c, i) => sum + c * pulls[i], 0) / totalPull
      : sinkConcentrations.reduce((a, b) => a + b, 0) / Math.max(1, sinkConcentrations.length)

  /**
   * Congestion at the unloading end.
   *
   * A demand-weighted mean alone hides the thing that matters: when the big
   * storage organs fill up, the *only* sink still pulling is the growing tip,
   * and renormalising the shares hands it 100% — so the mean concentration
   * stayed low and the line kept running at full speed with every store full,
   * which is not what happens. A tip can only use sugar as fast as it can
   * build tissue. Whatever the shut sinks would have taken backs up along the
   * unloading end and raises the concentration there, which is exactly how a
   * full crop feeds back and slows its own phloem.
   */
  const baselinePull = specimen.sinks.reduce((a, s) => a + s.demand, 0)
  const congestion = clamp01(1 - totalPull / Math.max(1e-6, baselinePull))
  const sinkConcentration =
    weightedSinkC + (sourceConcentration - weightedSinkC) * 0.8 * congestion

  /* ---- Münch pressure flow -------------------------------------------- */

  const sourcePressure = osmoticPressure(sourceConcentration, env.tempC) * leafHydration(env)
  const sinkPressure = osmoticPressure(sinkConcentration, env.tempC)
  const pressureGradient = Math.max(0, sourcePressure - sinkPressure)

  const openArea = options.girdled ? 0 : specimen.phloemAreaM2
  // v = K·ΔP/L, with K lumping the sieve plates in (see PHLOEM_CONDUCTIVITY).
  const velocityMs =
    openArea > 0
      ? (PHLOEM_CONDUCTIVITY * pressureGradient * 1e6) /
        (specimen.pathLengthM * viscosityFactor(env.tempC))
      : 0
  const velocity = velocityMs * 3600

  // Mass carried = speed × cross-section × concentration. g L⁻¹ is kg m⁻³, and
  // kg s⁻¹ → mg h⁻¹ is ×3.6e9.
  const massFlow = velocityMs * openArea * sourceConcentration * 3.6e9

  // Export can never exceed what the loading machinery can push in.
  const exportRate = Math.max(0, Math.min(massFlow, loadingCapacity))
  const loadingLimited = openArea > 0 && loadingCapacity < massFlow * 0.98
  const sinkLimited = openArea > 0 && !loadingLimited && fills.some((f, i) => f > 0.9 && specimen.sinks[i].saturates)

  /* ---- what happens at each sink -------------------------------------- */

  const sinks: SinkFlow[] = specimen.sinks.map((s, i) => {
    const share = totalPull > 1e-6 ? pulls[i] / totalPull : 0
    const inflow = exportRate * share
    // Maintenance never stops, so an unfed sink eats into its own store.
    const maintenance = s.maintenance * respirationQ10(env.tempC)
    const burnt = Math.min(inflow + Math.max(0, state.sinkStore[i]) * 0.02, inflow * s.growthCost + maintenance)
    return {
      id: s.id,
      share,
      inflow,
      burnt,
      banked: inflow - burnt,
      fill: fills[i],
      concentration: sinkConcentrations[i],
    }
  })

  const sinkRespiration = sinks.reduce((a, s) => a + s.burnt, 0)
  const wholePlantRespiration = leafRespiration + sinkRespiration

  /* ---- the leaf's own books ------------------------------------------- */

  // Surplus goes to starch; a deficit is met from starch. This is what keeps
  // the line running through the night, and why a leaf is heaviest at dusk.
  const surplus = netProduction - exportRate
  const starchFlux =
    surplus >= 0
      ? Math.min(surplus * specimen.starchShare, specimen.starchMax - state.leafStarch)
      : -Math.min(-surplus, state.leafStarch * 0.6 + 0.001)

  return {
    leaf,
    production,
    leafRespiration,
    netProduction,
    starchFlux,
    sourceConcentration,
    sinkConcentration,
    sourcePressure,
    sinkPressure,
    pressureGradient,
    velocity,
    exportRate,
    loadingCapacity,
    loadingLimited,
    sinkLimited,
    sinks,
    sinkRespiration,
    wholePlantRespiration,
    netGain: production - wholePlantRespiration,
  }
}

/**
 * A wilting plant cannot hold its sieve tubes pressurised: the water that makes
 * the pressure has to come from somewhere, and a droughted xylem has none to
 * lend. Translocation failing under drought is a real and much-underrated way
 * that dry weather costs a crop its yield.
 */
function leafHydration(env: LabEnv): number {
  return 0.25 + 0.75 * clamp01(env.turgor)
}

/** Respiration roughly doubles for every 10 °C — the classic Q₁₀. */
function respirationQ10(tempC: number): number {
  return Math.pow(2, (tempC - 20) / 10)
}

/* ------------------------------------------------------------------ */
/* Stepping the stores                                                */
/* ------------------------------------------------------------------ */

/**
 * Advance the stores by `dt` seconds of *plant* time. The cabinet runs plant
 * time faster than wall time (a tuber does not fill while you watch), and the
 * speed-up is explicit on screen rather than hidden.
 */
export function stepCarbon(
  specimen: Specimen,
  state: CarbonState,
  solve: SugarSolve,
  dt: number,
): void {
  const hours = dt / 3600

  state.totalFixed += solve.production * hours
  state.totalRespired += solve.wholePlantRespiration * hours
  state.totalExported += solve.exportRate * hours

  // Leaf: made − burnt − exported − banked as starch.
  state.leafSugar = Math.max(
    0,
    state.leafSugar + (solve.netProduction - solve.exportRate - solve.starchFlux) * hours,
  )
  state.leafStarch = clamp(state.leafStarch + solve.starchFlux * hours, 0, specimen.starchMax)

  solve.sinks.forEach((flow, i) => {
    const preset = specimen.sinks[i]
    state.sinkStore[i] = clamp(state.sinkStore[i] + flow.banked * hours, 0, preset.capacity)
  })
}

/* ------------------------------------------------------------------ */
/* What is holding the line back?                                     */
/* ------------------------------------------------------------------ */

export type Bottleneck = 'light' | 'co2' | 'temp' | 'water' | 'loading' | 'sink' | 'girdle' | 'none'

export interface BottleneckReading {
  id: Bottleneck
  /** One line naming the constraint in plain language. */
  label: string
  /** Why it is the constraint — the sentence that turns a fact into a reason. */
  because: string
}

const BOTTLENECK_COPY: Record<Bottleneck, { label: string; because: string }> = {
  light: {
    label: 'Light',
    because: 'The leaf can fix more carbon than the photons arriving allow. More light, more sugar.',
  },
  co2: {
    label: 'Carbon dioxide',
    because: 'There is light to spare but not enough CO₂ reaching the chloroplasts to use it.',
  },
  temp: {
    label: 'Temperature',
    because: 'The enzymes are working away from their optimum, so every step downstream waits on them.',
  },
  water: {
    label: 'Water',
    because:
      'A short leaf cannot hold its stomata open or its sieve tubes pressurised. Drought stops the line at both ends.',
  },
  loading: {
    label: 'Phloem loading',
    because:
      'The leaf is making sugar faster than the companion cells can pump it into the sieve tubes, so it is piling up as starch.',
  },
  sink: {
    label: 'Sink capacity',
    because:
      'The stores are full. Sugar that cannot be unloaded raises the pressure at the far end and the whole column slows.',
  },
  girdle: {
    label: 'The cut ring',
    because:
      'The phloem is severed. Water still climbs the xylem, but no sugar can get past the cut — everything below it is starving.',
  },
  none: { label: 'Nothing', because: 'Every stage is keeping up with the one before it.' },
}

/**
 * Which stage is actually the constraint. Measured, not guessed: each input
 * gets a small nudge and the one that buys the most extra export wins — the
 * same honest method the Rate Lab used for limiting factors, extended past the
 * leaf to the transport machinery.
 */
export function findBottleneck(
  specimen: Specimen,
  env: LabEnv,
  state: CarbonState,
  options: { girdled: boolean },
): BottleneckReading {
  if (options.girdled) return { id: 'girdle', ...BOTTLENECK_COPY.girdle }

  const base = solveSugarLine(specimen, env, state, options)
  if (base.sinkLimited) return { id: 'sink', ...BOTTLENECK_COPY.sink }

  // An 8% nudge, and a slightly bigger one on turgor. Stomatal closure has a
  // dead zone below about 0.18 turgor, and a 5% nudge inside it moved nothing
  // at all — so a plant that was visibly dying of thirst reported that water
  // was not its problem.
  const delta = 0.08
  const candidates: Array<{ id: Bottleneck; env: LabEnv }> = [
    { id: 'light', env: { ...env, light: clamp01(env.light + delta) } },
    { id: 'co2', env: { ...env, co2: clamp01(env.co2 + delta) } },
    { id: 'temp', env: { ...env, tempC: env.tempC + delta * 50 } },
    {
      id: 'water',
      env: {
        ...env,
        soilWater: clamp01(env.soilWater + delta),
        turgor: clamp01(env.turgor + delta * 1.6),
      },
    },
  ]

  /**
   * Which stage is short?
   *
   * The nudge has to be measured against **production** when the factory is
   * the slow step, and against **export** when the pipe is. Measuring export
   * alone gets deep shade wrong: a leaf with sugar still banked keeps loading
   * for a while after the light goes, so nudging the light changes nothing
   * this instant even though light is obviously the thing to fix.
   */
  const supplyLimited = base.production < Math.min(base.loadingCapacity, base.exportRate + 0.4) * 0.98
  /**
   * A third case, and the one that caught a droughted plant out: the line can
   * stall completely, with the sink end at a higher pressure than the source.
   * Then export is exactly zero however you nudge it, and ranking by export
   * says nothing would help — of a specimen visibly dying of thirst. When
   * there is no gradient at all, the constraint is whatever would restore one.
   */
  const stalled = base.pressureGradient <= 1e-6
  const metric = (s: SugarSolve) =>
    stalled ? s.sourcePressure : supplyLimited ? s.production : s.exportRate
  const baseValue = metric(base)

  let bestId: Bottleneck = 'none'
  // Two per cent of the current value, with a small absolute floor. The floor
  // has to be small: a plant whose line has already stalled has a baseline of
  // nearly zero, and a fixed 0.02 mg h⁻¹ threshold declared that nothing at
  // all would help a specimen that was plainly dying of thirst.
  let best = Math.max(0.0015, baseValue * 0.02)
  candidates.forEach((c) => {
    // Past the temperature optimum "more heat" only looks helpful because a
    // dying leaf respires less. Never offer that as the thing to fix.
    if (c.id === 'temp' && env.tempC >= specimen.leaf.tOpt) return
    const gain = metric(solveSugarLine(specimen, c.env, state, options)) - baseValue
    if (gain > best) {
      best = gain
      bestId = c.id
    }
  })

  if (bestId === 'none' && base.loadingLimited && base.production > 0.5) {
    return { id: 'loading', ...BOTTLENECK_COPY.loading }
  }
  return { id: bestId, ...BOTTLENECK_COPY[bestId] }
}

/* ------------------------------------------------------------------ */
/* Readings                                                           */
/* ------------------------------------------------------------------ */

export type SugarVarId = 'light' | 'co2' | 'temp' | 'water'

export interface SugarVarMeta {
  id: SugarVarId
  label: string
  simpleLabel: string
  unit: string
  chipUnit: string
  axis: string
  min: number
  max: number
  step: number
  color: string
  read: (env: LabEnv) => number
  patch: (real: number) => Partial<LabEnv>
  format: (real: number) => string
}

/** What the phloem tap can be set to measure. */
export type MeasureId = 'export' | 'velocity' | 'gain'

export interface MeasureMeta {
  id: MeasureId
  label: string
  simpleLabel: string
  unit: string
  axis: string
  /** How the instrument is described to a learner. */
  instrument: string
  /** Pull the true value out of a solve. */
  read: (solve: SugarSolve) => number
  decimals: number
}

export const MEASURES: Record<MeasureId, MeasureMeta> = {
  export: {
    id: 'export',
    label: 'Sugar export rate',
    simpleLabel: 'Sugar leaving the leaf',
    unit: 'mg h⁻¹',
    axis: 'Sugar export (mg h⁻¹)',
    instrument:
      'The phloem tap. An aphid stylet left in a sieve tube drips pure phloem sap, and the drop is weighed — this is how the rate is really measured.',
    read: (s) => s.exportRate,
    decimals: 1,
  },
  velocity: {
    id: 'velocity',
    label: 'Translocation speed',
    simpleLabel: 'How fast the sugar travels',
    unit: 'm h⁻¹',
    axis: 'Translocation speed (m h⁻¹)',
    instrument:
      'A labelled parcel of sugar, timed between two marks on the stem. Real experiments feed the leaf ¹⁴CO₂ and follow the radioactive sugar down.',
    read: (s) => s.velocity,
    decimals: 2,
  },
  gain: {
    id: 'gain',
    label: 'Net carbon gain',
    simpleLabel: 'What the plant keeps',
    unit: 'mg h⁻¹',
    axis: 'Net gain (mg h⁻¹)',
    instrument:
      'Everything fixed, minus everything burnt anywhere in the plant. Negative means the plant is living off its stores.',
    read: (s) => s.netGain,
    decimals: 1,
  },
}

export const MEASURE_ORDER: MeasureId[] = ['export', 'velocity', 'gain']

export interface SugarReading {
  id: number
  /** Which input was under investigation. */
  xVar: SugarVarId
  x: number
  /** Which instrument was read. */
  measure: MeasureId
  y: number
  repeats: number[]
  uncertainty: number
  anomalous: boolean
  specimenId: string
  girdled: boolean
  controls: { light: number; co2: number; temp: number; water: number }
  predicted: number | null
  /** The carbon audit at the moment of the reading, mg h⁻¹. */
  audit: { fixed: number; burnt: number; exported: number }
}

export function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length
}

export function halfRange(xs: number[]): number {
  return xs.length < 2 ? 0 : (Math.max(...xs) - Math.min(...xs)) / 2
}

/** A repeat sitting well outside the others — the rule a mark scheme accepts. */
export function findAnomaly(xs: number[]): boolean {
  if (xs.length < 3) return false
  const m = mean(xs)
  const spread = halfRange(xs) || 1e-6
  return xs.some((x) => Math.abs(x - m) > 1.6 * spread && Math.abs(x - m) > 0.08 * Math.max(1, Math.abs(m)))
}

/** Gaussian-ish instrument noise from two uniform samples. */
export function noisy(value: number, fraction: number): number {
  if (fraction <= 0) return value
  const u = Math.random() + Math.random() - 1
  const scale = Math.max(0.4, Math.abs(value))
  return value + u * fraction * scale
}

/** Readings that share an investigated variable and an instrument, sorted by x. */
export function seriesFor(
  readings: SugarReading[],
  xVar: SugarVarId,
  measure: MeasureId,
): SugarReading[] {
  return readings
    .filter((r) => r.xVar === xVar && r.measure === measure)
    .sort((a, b) => a.x - b.x)
}

/** Was a committed prediction close enough to count? */
export function predictionClose(predicted: number, y: number): boolean {
  return Math.abs(predicted - y) <= Math.max(0.6, Math.abs(y) * 0.18)
}

export function readingsToCsv(readings: SugarReading[], vars: Record<SugarVarId, SugarVarMeta>): string {
  const head = [
    'trial',
    'investigating',
    'x_value',
    'x_unit',
    'instrument',
    'value',
    'unit',
    'uncertainty',
    'repeats',
    'anomaly',
    'predicted',
    'specimen',
    'phloem_cut',
    'light_umol_m2_s',
    'co2_ppm',
    'temperature_C',
    'soil_water_pct',
    'carbon_fixed_mg_h',
    'carbon_burnt_mg_h',
    'carbon_exported_mg_h',
  ]
  const rows = readings.map((r, i) => [
    i + 1,
    vars[r.xVar].label,
    r.x.toFixed(1),
    vars[r.xVar].unit,
    MEASURES[r.measure].label,
    r.y.toFixed(2),
    MEASURES[r.measure].unit,
    r.uncertainty.toFixed(2),
    r.repeats.join(' / '),
    r.anomalous ? 'yes' : 'no',
    r.predicted === null ? '' : r.predicted.toFixed(2),
    r.specimenId,
    r.girdled ? 'yes' : 'no',
    r.controls.light.toFixed(0),
    r.controls.co2.toFixed(0),
    r.controls.temp.toFixed(1),
    r.controls.water.toFixed(0),
    r.audit.fixed.toFixed(2),
    r.audit.burnt.toFixed(2),
    r.audit.exported.toFixed(2),
  ])
  return [head, ...rows]
    .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n')
}

/* ------------------------------------------------------------------ */
/* Curve description (missions and the graph read these)              */
/* ------------------------------------------------------------------ */

/** Has the learner shown the export rate levelling off at the top of the range? */
export function hasPlateau(series: SugarReading[], max: number): boolean {
  if (series.length < 4) return false
  const high = series.filter((r) => r.x >= max * 0.55)
  if (high.length < 2) return false
  const peak = Math.max(...series.map((r) => r.y))
  if (peak < 2) return false
  const top = high.filter((r) => r.y >= peak * 0.85)
  if (top.length < 2) return false
  return Math.max(...top.map((r) => r.x)) - Math.min(...top.map((r) => r.x)) >= max * 0.2
}

/** Does the carbon audit close? Fixed should equal burnt plus exported, within slack. */
export function auditCloses(audit: { fixed: number; burnt: number; exported: number }): boolean {
  const out = audit.burnt + audit.exported
  if (audit.fixed < 0.5) return false
  return Math.abs(audit.fixed - out) <= Math.max(0.8, audit.fixed * 0.22)
}

export type { SinkPreset }
