/**
 * World state for the Rate Lab garden — "state is interpolation, not a switch".
 *
 * Every biome is a full lighting state (sun colour, sky stops, fog, ground
 * palette, grass, weather). The light slider is a *daylight* multiplier that
 * pulls the whole state toward its dusk variant and lowers the sun. The world
 * lerps toward the target every frame; switching biome mid-transition simply
 * retargets, so nothing ever jumps. (After MengTo's threejs-landscape /
 * threejs-weather; see the vault note "Rendering Craft".)
 */

import * as THREE from 'three'
import type { BiomeId } from './leaves'

export interface WorldPreset {
  /** Six sky stops, zenith → below-horizon, full daylight. */
  sky: [string, string, string, string, string, string]
  /** Six sky stops at dusk / very low light. */
  skyDusk: [string, string, string, string, string, string]
  sun: string
  sunDusk: string
  /** Hemisphere sky / ground colours. */
  hemiSky: string
  hemiGround: string
  fogNear: number
  fogFar: number
  /** Ground palette: lush, dry/rock, sand/pale. */
  grass: string
  rock: string
  sand: string
  /** Grass blade base and tip colours and relative density 0–1. */
  bladeBase: string
  bladeTip: string
  bladeDensity: number
  bladeHeight: number
  /** Moisture bias 0–1 (wetter = greener hollows, puddles). */
  moisture: number
  /** Weather multipliers. */
  rain: number
  snow: number
  haze: number
  /** Star visibility at dusk (dry, clear skies show more). */
  stars: number
}

export const WORLD_PRESETS: Record<BiomeId, WorldPreset> = {
  rainforest: {
    sky: ['#4E8FB0', '#79B6CC', '#A9D3D6', '#CBE3D6', '#D9E7CD', '#B7C9A9'],
    skyDusk: ['#182B3B', '#28465C', '#3F6474', '#5B7D7C', '#6E877A', '#55665A'],
    sun: '#FFF1CF',
    sunDusk: '#F0B87A',
    hemiSky: '#BFE3D6',
    hemiGround: '#3E6B3A',
    fogNear: 14,
    fogFar: 52,
    grass: '#3F8A44',
    rock: '#5B6B4E',
    sand: '#7C8B5A',
    bladeBase: '#2E6B33',
    bladeTip: '#8FD06B',
    bladeDensity: 0.95,
    bladeHeight: 1.15,
    moisture: 0.9,
    rain: 0.55,
    snow: 0,
    haze: 0.6,
    stars: 0.35,
  },
  temperate: {
    sky: ['#3B7FC4', '#63A5DB', '#9CCBEA', '#C8E3F2', '#E3EEF0', '#C6D6C4'],
    skyDusk: ['#16233F', '#2B3F66', '#5A5F86', '#9A6F7E', '#C48A6C', '#8B6E5A'],
    sun: '#FFF4D6',
    sunDusk: '#FFB070',
    hemiSky: '#CFEAF5',
    hemiGround: '#5F8F4E',
    fogNear: 22,
    fogFar: 70,
    grass: '#6FAE5A',
    rock: '#9A9686',
    sand: '#B7A97D',
    bladeBase: '#4E8B3F',
    bladeTip: '#B4DE7A',
    bladeDensity: 0.85,
    bladeHeight: 1,
    moisture: 0.6,
    rain: 0.2,
    snow: 0,
    haze: 0.25,
    stars: 0.7,
  },
  savanna: {
    sky: ['#5C93C9', '#8DB8DA', '#C7D5D0', '#E7D9B3', '#EDD9A4', '#C9B47C'],
    skyDusk: ['#2A2140', '#5B3557', '#A0506A', '#D9805C', '#F0A45B', '#A97D4C'],
    sun: '#FFF0C0',
    sunDusk: '#FF9A4A',
    hemiSky: '#E9D9A8',
    hemiGround: '#8C7A3E',
    fogNear: 26,
    fogFar: 80,
    grass: '#B9A54E',
    rock: '#9A7F55',
    sand: '#D3BE86',
    bladeBase: '#8A7A32',
    bladeTip: '#E4CB6C',
    bladeDensity: 0.7,
    bladeHeight: 1.25,
    moisture: 0.28,
    rain: 0.09,
    snow: 0,
    haze: 0.35,
    stars: 0.9,
  },
  desert: {
    sky: ['#4B86C4', '#84B4DE', '#C6D9E6', '#EEDFC0', '#F3DCB2', '#D9BC8B'],
    skyDusk: ['#22183A', '#4A2C5A', '#8F4A6B', '#D07A5A', '#F2A55C', '#B08653'],
    sun: '#FFF6DC',
    sunDusk: '#FF9455',
    hemiSky: '#F0DCBA',
    hemiGround: '#A88657',
    fogNear: 30,
    fogFar: 90,
    grass: '#C9AD74',
    rock: '#A98963',
    sand: '#E2C899',
    bladeBase: '#A08A4E',
    bladeTip: '#D8C27E',
    bladeDensity: 0.12,
    bladeHeight: 0.7,
    moisture: 0.05,
    rain: 0.02,
    snow: 0,
    haze: 0.9,
    stars: 1,
  },
  boreal: {
    sky: ['#4B7CA6', '#7FA9C7', '#B4CDDD', '#D3E1E8', '#E4EBEE', '#C3CDCF'],
    skyDusk: ['#141E30', '#233551', '#3E5474', '#6E7A8E', '#93909A', '#6C6F78'],
    sun: '#FDF3E2',
    sunDusk: '#F3B98A',
    hemiSky: '#C6DCEA',
    hemiGround: '#5C6E5B',
    fogNear: 16,
    fogFar: 60,
    grass: '#7F9C79',
    rock: '#7B8583',
    sand: '#DDE5E6',
    bladeBase: '#4E6E4B',
    bladeTip: '#9CB88E',
    bladeDensity: 0.45,
    bladeHeight: 0.8,
    moisture: 0.55,
    rain: 0.05,
    snow: 0.7,
    haze: 0.4,
    stars: 0.85,
  },
}

/** The live, interpolated world — one instance per garden. */
export class WorldState {
  sky = Array.from({ length: 6 }, () => new THREE.Color())
  sun = new THREE.Color()
  hemiSky = new THREE.Color()
  hemiGround = new THREE.Color()
  grass = new THREE.Color()
  rock = new THREE.Color()
  sand = new THREE.Color()
  bladeBase = new THREE.Color()
  bladeTip = new THREE.Color()
  fogNear = 22
  fogFar = 70
  bladeDensity = 0.8
  bladeHeight = 1
  moisture = 0.5
  rain = 0
  snow = 0
  haze = 0.3
  stars = 0
  /** 0 = dusk, 1 = full day. Follows the light slider. */
  daylight = 1
  /** Sun elevation in radians. */
  sunElevation = 0.9
  /** Sun azimuth (fixed for now: light comes from the sun disc's side). */
  sunAzimuth = 0.95

  private tSky = Array.from({ length: 6 }, () => new THREE.Color())
  private a = new THREE.Color()
  private b = new THREE.Color()
  private c = new THREE.Color()
  private d = new THREE.Color()
  private initialised = false

  /**
   * Retarget toward `preset` at `light` (0–1) and ease toward it.
   * `k` is the per-frame lerp factor (already dt-shaped by the caller).
   */
  step(preset: WorldPreset, light: number, k: number): void {
    const day = THREE.MathUtils.clamp(0.08 + light * 0.92, 0, 1)
    // Sky: lerp each stop between dusk and day, then ease toward it.
    for (let i = 0; i < 6; i++) {
      this.a.set(preset.skyDusk[i])
      this.b.set(preset.sky[i])
      this.tSky[i].copy(this.a).lerp(this.b, day)
    }
    this.a.set(preset.sunDusk)
    this.b.set(preset.sun)
    const tSun = this.c.copy(this.a).lerp(this.b, day)
    const tHemiSky = this.d.set(preset.hemiSky).lerp(this.tSky[2], 1 - day)
    const tHemiGround = this.b.set(preset.hemiGround)
    const kk = this.initialised ? k : 1
    for (let i = 0; i < 6; i++) this.sky[i].lerp(this.tSky[i], kk)
    this.sun.lerp(tSun, kk)
    this.hemiSky.lerp(tHemiSky, kk)
    this.hemiGround.lerp(tHemiGround, kk)
    this.grass.lerp(this.a.set(preset.grass), kk)
    this.rock.lerp(this.a.set(preset.rock), kk)
    this.sand.lerp(this.a.set(preset.sand), kk)
    this.bladeBase.lerp(this.a.set(preset.bladeBase), kk)
    this.bladeTip.lerp(this.a.set(preset.bladeTip), kk)
    const L = (from: number, to: number) => from + (to - from) * kk
    this.fogNear = L(this.fogNear, preset.fogNear * (0.6 + day * 0.4))
    this.fogFar = L(this.fogFar, preset.fogFar * (0.55 + day * 0.45))
    this.bladeDensity = L(this.bladeDensity, preset.bladeDensity)
    this.bladeHeight = L(this.bladeHeight, preset.bladeHeight)
    this.moisture = L(this.moisture, preset.moisture)
    this.rain = L(this.rain, preset.rain)
    this.snow = L(this.snow, preset.snow)
    this.haze = L(this.haze, preset.haze)
    this.stars = L(this.stars, preset.stars * THREE.MathUtils.smoothstep(1 - day, 0.45, 0.95))
    this.daylight = L(this.daylight, day)
    this.sunElevation = L(this.sunElevation, THREE.MathUtils.lerp(0.14, 1.05, day))
    this.initialised = true
  }

  /** World-space direction *toward* the sun. */
  sunDirection(out: THREE.Vector3): THREE.Vector3 {
    const e = this.sunElevation
    const a = this.sunAzimuth
    return out.set(Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a)).normalize()
  }
}

/* ------------------------------------------------------------------ */
/* Terrain height — one analytic function everything samples           */
/* ------------------------------------------------------------------ */

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}
function smooth(t: number) {
  return t * t * (3 - 2 * t)
}
function noise2(x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const a = hash2(xi, yi)
  const b = hash2(xi + 1, yi)
  const c = hash2(xi, yi + 1)
  const d = hash2(xi + 1, yi + 1)
  const u = smooth(xf)
  const v = smooth(yf)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
export function fbm(x: number, y: number, octaves = 4): number {
  let v = 0
  let amp = 0.5
  let f = 1
  for (let i = 0; i < octaves; i++) {
    v += amp * (noise2(x * f, y * f) * 2 - 1)
    f *= 2.02
    amp *= 0.5
  }
  return v
}
function ridged(x: number, y: number, octaves = 3): number {
  let v = 0
  let amp = 0.5
  let f = 1
  for (let i = 0; i < octaves; i++) {
    v += amp * (1 - Math.abs(noise2(x * f, y * f) * 2 - 1))
    f *= 2.1
    amp *= 0.5
  }
  return v
}

/** Radius of the flat clearing the apparatus stands on. */
export const CLEARING = 5.2

/**
 * Terrain height at (x, z). Flat clearing in the middle, rolling meadow
 * beyond, hills that rise toward the horizon. Warped fBm so it reads eroded
 * rather than crumpled; the ridge term scales with distance so the far rings
 * are not flat.
 */
export function landH(x: number, z: number): number {
  const r = Math.hypot(x, z)
  const wx = x + fbm(x * 0.05, z * 0.05, 3) * 6
  const wz = z + fbm(x * 0.05 + 41, z * 0.05 - 17, 3) * 6
  let h = fbm(wx * 0.045, wz * 0.045, 5) * 2.4
  const far = THREE.MathUtils.smoothstep(r, 18, 70)
  h += ridged(wx * 0.06, wz * 0.06, 3) * (0.6 + far * 9)
  h += far * far * 6 // hills lift toward the horizon
  // The clearing: blend to zero inside CLEARING, smoothly.
  const inside = 1 - THREE.MathUtils.smoothstep(r, CLEARING * 0.7, CLEARING * 1.6)
  return h * (1 - inside)
}

/** The y of the flat clearing (matches the old ground disc). */
export const GROUND_Y = -0.62
