import * as THREE from 'three'
import type { CellType } from './facts'

/** Vessel geometry constants shared across the scene. */
export const VESSEL_RADIUS = 9
export const VESSEL_LENGTH = 340
export const FIELD_LENGTH = 260
export const MAX_RBC = 2600
export const WBC_COUNT = 5
export const PLATELET_COUNT = 36

export interface Highlight {
  type: CellType
  id: number
}

/**
 * Mutable simulation state shared between the UI (React state) and the
 * render loop (refs). Read/written inside useFrame without re-renders.
 */
export interface SimState {
  /**
   * Flow speed multiplier — no longer a free slider: it is derived from the
   * body-demand dial (see lib/journey.ts DEMANDS), so speed always has a
   * reason behind it.
   */
  speed: number
  /** Heart rate in beats per minute, from the demand dial. */
  bpm: number
  /** Breaths per minute, from the demand dial. */
  breathsPerMin: number
  /** Active red blood cell count, 600 – MAX_RBC. */
  density: number
  paused: boolean
  labels: boolean
  started: boolean
  /** Wall-clock seconds since scene mount (heartbeat never stops). */
  time: number
  /** Seconds of active flow (frozen while paused). */
  flowTime: number
  /** Camera z position (drifts toward -Infinity). */
  camZ: number
  /**
   * Forward flow in world units/s for THIS frame — speed slider × the journey
   * stage's pace (surging through the heart, crawling through the capillary,
   * near-frozen during the meet-the-cell story). Written once per frame by the
   * camera rig; every cell field reads it so the whole bloodstream agrees.
   */
  flowNow: number
  /** Total red blood cells that have flowed past the camera. */
  cellsPassed: number
  highlighted: Highlight | null
  /** Latest world positions for label mode (updated each frame). */
  labelRbc: THREE.Vector3
  labelWbc: THREE.Vector3
  labelPlatelet: THREE.Vector3
  /** Racing nameplates: the hero cell and every notable rival, per frame. */
  heroPos: THREE.Vector3
  wbcPos: THREE.Vector3[]
  plateletTagPos: THREE.Vector3[]
}

export function createSimState(): SimState {
  return {
    speed: 0.9,
    bpm: 70,
    breathsPerMin: 14,
    density: 1500,
    paused: false,
    labels: true,
    started: false,
    time: 0,
    flowTime: 0,
    camZ: 0,
    flowNow: 0,
    cellsPassed: 0,
    highlighted: null,
    labelRbc: new THREE.Vector3(),
    labelWbc: new THREE.Vector3(),
    labelPlatelet: new THREE.Vector3(),
    heroPos: new THREE.Vector3(),
    wbcPos: Array.from({ length: WBC_COUNT }, () => new THREE.Vector3()),
    plateletTagPos: Array.from({ length: 3 }, () => new THREE.Vector3()),
  }
}

/**
 * Lazily-created shared sim singleton. The scene mutates it freely inside
 * useFrame; React only reads it through polling intervals and callbacks.
 */
let simInstance: SimState | null = null
export function getSim(): SimState {
  if (!simInstance) {
    simInstance = createSimState()
    // Test handle: verification scripts steer the ride through window.
    if (typeof window !== 'undefined') {
      ;(window as unknown as Record<string, unknown>).__bloodSim = simInstance
    }
  }
  return simInstance
}

/**
 * Heartbeat waveform, 0..1. A "lub-dub": a strong beat followed by a
 * smaller echo beat. `beatsPerSecond` ~ 1 at rest (60 BPM).
 */
export function heartbeat(t: number, beatsPerSecond = 1): number {
  const phase = (t * beatsPerSecond) % 1
  const lub = Math.exp(-Math.pow((phase - 0.12) / 0.055, 2))
  const dub = 0.45 * Math.exp(-Math.pow((phase - 0.34) / 0.07, 2))
  return Math.min(1, lub + dub)
}
