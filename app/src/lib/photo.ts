/** Photosynthesis / osmosis / diffusion lab facts and shared sim state. */

import { BIOME_BY_ID, LEAF_BY_ID, type BiomeId, type LeafPreset } from './leaves'
import {
  CO2_AMBIENT_PPM,
  CO2_MAX_PPM,
  sensitivities,
  solveLeaf,
  VARS,
  type LabEnv,
  type Physiology,
  type VarId,
} from './ratelab'

export const PHOTO_FACTS: string[] = [
  'Photosynthesis is how plants cook their own food — using nothing but sunlight, water, and air!',
  'The green stuff in leaves is called chlorophyll. It catches sunlight like a tiny solar panel.',
  'Chloroplasts are the little green factories inside plant cells where photosynthesis happens. One leaf cell can hold 50 of them!',
  'Plants breathe IN carbon dioxide and breathe OUT oxygen — the exact opposite of you!',
  'The oxygen you are breathing right now was probably made by a plant, algae, or phytoplankton.',
  'Inside a chloroplast, pancake-shaped stacks called thylakoids are where sunlight is trapped. A stack of them is called a granum!',
  'Glucose is a sugar plants make for food. Extra glucose gets linked into starch — that is why potatoes are so filling!',
  'The word "photosynthesis" comes from Greek: "photo" means light and "synthesis" means putting together.',
  'Without photosynthesis there would be almost no oxygen on Earth — and no pizza, since wheat is a plant!',
  'A big oak tree can make enough oxygen in a year for about 10 people to breathe.',
  'Leaves are flat and wide to catch as much sunlight as possible — like a solar panel shape!',
  'Plants get their water through their roots, and it travels up tiny tubes in the stem called xylem — like drinking through a straw.',
]

export const OSMOSIS_FACTS: string[] = [
  'Osmosis is water sneaking across a semi-permeable membrane toward the side with more dissolved stuff (like salt). Water follows the salt!',
  'A semi-permeable membrane is like a fence with holes only small things can slip through — water yes, salt no.',
  'Plant roots drink water from the soil by osmosis — that is how this very plant stays hydrated!',
  'When a wilted plant gets watered, osmosis fills its cells back up and it stands tall again.',
  'Put a raisin in plain water and it plumps up into a grape shape — that is osmosis filling it with water!',
]

export const DIFFUSION_FACTS: string[] = [
  'Diffusion is particles spreading out from a crowded place to a roomy place — no pushing required, just random jiggling!',
  'When you smell cookies baking from all the way upstairs, that is diffusion — smell particles drifted through the air to your nose.',
  'The oxygen leaves make exits the leaf by diffusion, floating from crowded (inside) to roomy (outside).',
  'Particles never stop jiggling! This random wiggle is called Brownian motion, and it powers diffusion.',
  'Diffusion happens faster when it is warm, because particles jiggle harder — like kids with more energy.',
]

export const CLIMATE_FACTS: string[] = [
  'A leaf has to solve one impossible problem: the same holes that let CO₂ in also let water out. Every leaf shape on Earth is a different compromise on that one trade-off.',
  'A cactus opens its stomata at night instead of during the day, and stores the CO₂ as an acid until morning. That is why a cactus pad tastes sour at dawn and far less so by dusk.',
  'Rainforest leaves are huge because the forest floor is dark. Desert leaves are tiny — or replaced by spines — because the problem there was never light, it is water.',
  'Maize, sugarcane and sorghum use a CO₂ pump called C4 photosynthesis. It is why they thrive in heat that makes wheat and rice struggle.',
  'A pine needle is shaped like a desert leaf. For half the year the water around it is frozen solid, and frozen water is just as unavailable as no water at all.',
  'Plants lose more than 95% of the water they take up straight back out of their leaves. Only a few percent is actually used to build the plant.',
  'Hot air is thirstier air: the drying power of the atmosphere roughly doubles for every 10 °C rise. That is why 40 °C in a desert punishes a leaf so much harder than 30 °C.',
  'Two plants side by side in one field can need wildly different amounts of water, purely from how their leaves are built — waxy layer, number of stomata, total surface area.',
  'A wilting leaf has shut its own stomata. That stops water escaping, but it also stops CO₂ getting in — wilting is a plant choosing to starve rather than dry out.',
  'Silvery or hairy leaves are common in hot dry places: the pale surface reflects sunlight and the hairs trap a still layer of humid air against the leaf.',
]

export const PHOTO_TICKER_FACTS: string[] = [
  ...PHOTO_FACTS.slice(0, 6),
  ...CLIMATE_FACTS,
  ...OSMOSIS_FACTS.slice(0, 3),
  ...DIFFUSION_FACTS.slice(0, 3),
]

/** Facts shown when the zoomed-in chloroplast is tapped. */
export const CHLOROPLAST_FACTS: string[] = PHOTO_FACTS

export type LabMode = 'garden' | 'roots'
export type MembraneDemo = 'diffusion' | 'osmosis'
export type LimitingFactor = VarId

/**
 * Mutable simulation state shared between React UI and the R3F render loop.
 * Mutated freely inside useFrame; React reads via polling intervals.
 */
export interface PhotoSim {
  /** Sunlight intensity 0–1. */
  light: number
  /** CO₂ level 0–1. */
  co2: number
  /** Water supply 0–1. */
  water: number
  paused: boolean
  started: boolean
  /** Which mini-scene is on screen. */
  mode: LabMode
  /** Camera inside the leaf looking at a chloroplast. */
  zoomed: boolean
  /** Glucose molecules produced so far. */
  glucose: number
  /** Oxygen bubbles released so far. */
  oxygen: number
  /** Wall-clock seconds since mount. */
  time: number
  /** Which membrane demo is showing. */
  demo: MembraneDemo
  /** Whether the membrane demo particles are running. */
  demoRunning: boolean
  /** Bump to trigger a particle reset inside the membrane scene. */
  demoReset: number
  /** Seconds since the current demo started (for status text). */
  demoTime: number

  /* ---- Rate Lab additions ---- */
  /** Air temperature, °C. */
  tempC: number
  /** Relative humidity 0–1 — set by the climate, drives water loss. */
  humidity: number
  /** Leaf hydration 0–1. Drops when water loss outruns uptake; 0 = fully wilted. */
  turgor: number
  /** Which leaf is mounted in the apparatus. */
  leafId: string
  /** Which climate the plant is standing in. */
  biomeId: BiomeId
  /** The one variable currently under investigation. */
  xVar: VarId
  /** A measurement trial is running. */
  trialRunning: boolean
  /** Seconds elapsed in the current trial. */
  trialElapsed: number
  /** Seconds the current trial should last. */
  trialLength: number
  /** Bubbles counted so far in the current trial (for the on-screen apparatus). */
  trialBubbles: number
  /** Rate accumulator used to average the reading across the trial. */
  trialRateSum: number
  /** Samples contributing to trialRateSum. */
  trialSamples: number
  /** Bumped whenever a trial finishes, so the HUD can react. */
  trialCompleted: number
  /** Bumped whenever a trial is thrown away because a control moved mid-run. */
  trialAborted: number
  /** Result of the most recent trial, bubbles min⁻¹ (can be negative). */
  lastTrueValue: number
  /* ---- membrane bench ---- */
  /** Which membrane is clamped into the chamber. */
  membraneId: string
  /** Temperature of the chamber, °C — drives how hard particles jiggle. */
  membraneTempC: number
  /** Live particle counts per side, indexed by SPECIES_ORDER. */
  mLeft: number[]
  mRight: number[]
  /** Smoothed net crossings per second; positive means left → right. */
  mNetFlow: number
  /** Total crossings since the run started. */
  mCrossings: number
  /** True once net movement has effectively stopped. */
  mEquilibrium: boolean

  /* ---- camera + guided demo ---- */
  /** Pending dolly request from the HUD: negative zooms in, positive zooms out. */
  viewZoom: number
  /** Slowly orbit the scene by itself. */
  autoOrbit: boolean
  /** Bump to snap the camera back to the default framing. */
  viewReset: number
  /** The guided demo is driving the controls. */
  demoMode: boolean
  /** Requested authored viewpoint (see lib/viewpoints.ts); bump `viewSeq` to fly. */
  viewId: string
  viewSeq: number
  /** The equation stage: open flag, playhead 0..4 (steps), and playing flag. */
  equationOpen: boolean
  equationT: number
  equationPlaying: boolean

  /**
   * The conditions captured the instant the trial started. A measurement
   * belongs to the conditions it was made under, not to whatever the sliders
   * happen to say when it finishes.
   */
  trialSnapshot: TrialSnapshot | null
}

export interface TrialSnapshot {
  xVar: VarId
  /** The investigated variable's value in real units. */
  x: number
  light: number
  co2: number
  tempC: number
  water: number
  humidity: number
  leafId: string
  biomeId: BiomeId
}

export function createPhotoSim(): PhotoSim {
  const biome = BIOME_BY_ID.temperate
  return {
    light: biome.light,
    co2: CO2_AMBIENT_PPM / CO2_MAX_PPM,
    water: biome.soilWater,
    paused: false,
    started: false,
    mode: 'garden',
    zoomed: false,
    glucose: 0,
    oxygen: 0,
    time: 0,
    demo: 'diffusion',
    demoRunning: false,
    demoReset: 0,
    demoTime: 0,
    tempC: biome.temp,
    humidity: biome.humidity,
    turgor: 1,
    leafId: 'temperate',
    biomeId: 'temperate',
    xVar: 'light',
    trialRunning: false,
    trialElapsed: 0,
    trialLength: 6,
    trialBubbles: 0,
    trialRateSum: 0,
    trialSamples: 0,
    trialCompleted: 0,
    trialAborted: 0,
    lastTrueValue: 0,
    trialSnapshot: null,
    membraneId: 'visking',
    membraneTempC: 22,
    mLeft: [0, 0, 0],
    mRight: [0, 0, 0],
    mNetFlow: 0,
    mCrossings: 0,
    mEquilibrium: false,
    viewZoom: 0,
    autoOrbit: false,
    viewReset: 0,
    demoMode: false,
    viewId: 'overview',
    viewSeq: 0,
    equationOpen: false,
    equationT: 0,
    equationPlaying: false,
  }
}

/** The leaf currently mounted, always resolving to something valid. */
export function simLeaf(sim: PhotoSim): LeafPreset {
  return LEAF_BY_ID[sim.leafId] ?? LEAF_BY_ID.temperate
}

/** Convert the mutable sim into the pure environment the model expects. */
export function simEnv(sim: PhotoSim): LabEnv {
  return {
    light: sim.light,
    co2: sim.co2,
    tempC: sim.tempC,
    humidity: sim.humidity,
    soilWater: sim.water,
    turgor: sim.turgor,
  }
}

/** Freeze the current conditions for a measurement. */
export function snapshotTrial(sim: PhotoSim): TrialSnapshot {
  return {
    xVar: sim.xVar,
    x: VARS[sim.xVar].read(simEnv(sim)),
    light: sim.light * VARS.light.max,
    co2: sim.co2 * VARS.co2.max,
    tempC: sim.tempC,
    water: sim.water * 100,
    humidity: sim.humidity,
    leafId: sim.leafId,
    biomeId: sim.biomeId,
  }
}

/** Solve the mounted leaf under the current settings. */
export function simPhysiology(sim: PhotoSim): Physiology {
  return solveLeaf(simLeaf(sim), simEnv(sim))
}

/**
 * Normalised drive for the visuals (0–1), plus the factor currently holding the
 * leaf back. The real model lives in `lib/ratelab.ts`; this is the thin adaptor
 * the 3D scene uses to decide how many particles to fly around.
 */
export function photoRate(sim: PhotoSim): { rate: number; limiting: LimitingFactor } {
  const leaf = simLeaf(sim)
  const env = simEnv(sim)
  const { limiting } = sensitivities(leaf, env)
  return { rate: photoDrive(sim), limiting: limiting ?? 'light' }
}

/**
 * Just the 0–1 visual drive, without the limiting-factor solve. The render loop
 * calls this every frame, so it stays cheap.
 */
export function photoDrive(sim: PhotoSim): number {
  const leaf = simLeaf(sim)
  const phys = solveLeaf(leaf, simEnv(sim))
  return Math.max(0, Math.min(1, phys.gross / (leaf.pmax * 0.7)))
}

export const LIMITING_LABELS: Record<LimitingFactor, string> = {
  light: 'light',
  co2: 'CO₂',
  water: 'water',
  temp: 'temperature',
}
