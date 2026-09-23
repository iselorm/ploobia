/**
 * Looks — the time-of-day slider (decided 2026-09-06: "lighting presets, not
 * a palette swap"; one scalar drives the room; Day and Night shift are the
 * two ends and dawn/evening come free).
 *
 * `sun` runs 0 → 1: 0 is Night shift, 1 is Day, the evening lies between.
 * Everything the scene lights with comes out of `lightingFor(sun, zone)` —
 * a pure interpolation over three keyframes — so the toggle is a toy and
 * not a second set of constants. What never changes: meaning colours (the
 * furnace's heat, the amber marker, the greens and ambers of the journal).
 * Night shift keeps the subject lit, never the room black: the lamps come
 * up as the sun goes down.
 *
 * Remembered through the shared `persist` helper; default Day.
 */

import { useSyncExternalStore } from 'react'
import * as THREE from 'three'
import { read, write } from './persist'

const KEY = 'ploobia.looks.v1'

export const LOOK_PRESETS = [
  { id: 'day', label: 'Day', sun: 1 },
  { id: 'evening', label: 'Evening', sun: 0.42 },
  { id: 'night', label: 'Night shift', sun: 0 },
] as const
export type LookId = (typeof LOOK_PRESETS)[number]['id']

interface Looks {
  sun: number
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1
}

let looks: Looks = (() => {
  const raw = read<Partial<Looks>>(KEY, {})
  return { sun: clamp01(typeof raw.sun === 'number' ? raw.sun : 1) }
})()
const listeners = new Set<() => void>()

export function getSun(): number {
  return looks.sun
}

export function setSun(v: number): void {
  const sun = clamp01(v)
  if (sun === looks.sun) return
  looks = { sun }
  write(KEY, looks)
  listeners.forEach((l) => l())
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useSun(): number {
  return useSyncExternalStore(subscribe, getSun, getSun)
}

/** The preset nearest the slider, for the chip's label. */
export function nearestLook(sun: number): LookId {
  let best: LookId = 'day'
  let d = Infinity
  for (const p of LOOK_PRESETS) {
    const dd = Math.abs(p.sun - sun)
    if (dd < d) {
      d = dd
      best = p.id
    }
  }
  return best
}

/* ----------------------------------------------------------------------------
 * The lighting rig, as a function of the sun
 * ------------------------------------------------------------------------- */

export type LightZone = 'landing' | 'foundry'

export interface Lighting {
  sky: { top: string; horizon: string; fog: string }
  ambient: { color: string; intensity: number }
  hemi: { sky: string; ground: string; intensity: number }
  /** The key light: the sun by day, the moon by night. */
  key: { color: string; intensity: number; position: [number, number, number] }
  /** How far the lamps are up, 0..1 — the room's own light as the sun goes. */
  lamps: number
  /** Fog distances shorten a little at night. */
  fog: [number, number]
}

interface Key {
  at: number
  sky: [string, string, string]
  ambient: [string, number]
  hemi: [string, string, number]
  key: [string, number, [number, number, number]]
  lamps: number
  fog: [number, number]
}

/** Day keyframes differ by zone (the Landing's sky is cooler; its sun sits the other way). */
const DAY: Record<LightZone, Key> = {
  foundry: {
    at: 1,
    sky: ['#F0B354', '#F6E3C6', '#EBD6B4'],
    ambient: ['#FFF0D8', 0.5],
    hemi: ['#F8DDB0', '#7A5A3C', 0.9],
    key: ['#FFE2B0', 2.4, [-14, 22, 12]],
    lamps: 0,
    fog: [40, 190],
  },
  landing: {
    at: 1,
    sky: ['#8FBBE8', '#F3E4C4', '#EDDDBE'],
    ambient: ['#FFF4E0', 0.55],
    hemi: ['#BFD8F5', '#8A6A3F', 0.9],
    key: ['#FFE9C4', 2.6, [18, 26, 10]],
    lamps: 0,
    fog: [40, 190],
  },
}

/** The evening: a low warm sun, the sky going violet, the lamps coming on. */
const EVENING: Record<LightZone, Key> = {
  foundry: {
    at: 0.42,
    sky: ['#6A5A8E', '#F0975A', '#D9A07A'],
    ambient: ['#F2CFAE', 0.34],
    hemi: ['#B58CA0', '#4A3526', 0.7],
    key: ['#FFAE68', 1.5, [-22, 7, 10]],
    lamps: 0.55,
    fog: [36, 170],
  },
  landing: {
    at: 0.42,
    sky: ['#5C5A90', '#F2A066', '#DCA57F'],
    ambient: ['#F2D2B0', 0.36],
    hemi: ['#A98CB0', '#4E3A28', 0.7],
    key: ['#FFB374', 1.6, [24, 8, 8]],
    lamps: 0.55,
    fog: [36, 170],
  },
}

/** Night shift: a blue moon, the room never black, the lamps fully up. */
const NIGHT: Record<LightZone, Key> = {
  foundry: {
    at: 0,
    sky: ['#101B2C', '#2E3D52', '#1F2B3C'],
    ambient: ['#A9BCDD', 0.22],
    hemi: ['#3A5480', '#22190F', 0.55],
    key: ['#9DB6E0', 0.7, [10, 20, -14]],
    lamps: 1,
    fog: [30, 150],
  },
  landing: {
    at: 0,
    sky: ['#0F1A2C', '#2C3B52', '#1E2A3B'],
    ambient: ['#AEC0E0', 0.24],
    hemi: ['#3C5686', '#241B10', 0.55],
    key: ['#A3BBE4', 0.75, [-12, 22, -10]],
    lamps: 1,
    fog: [30, 150],
  },
}

const CA = new THREE.Color()
const CB = new THREE.Color()
function mixColor(a: string, b: string, t: number): string {
  return '#' + CA.set(a).lerp(CB.set(b), t).getHexString()
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t

function between(a: Key, b: Key, t: number): Lighting {
  return {
    sky: { top: mixColor(a.sky[0], b.sky[0], t), horizon: mixColor(a.sky[1], b.sky[1], t), fog: mixColor(a.sky[2], b.sky[2], t) },
    ambient: { color: mixColor(a.ambient[0], b.ambient[0], t), intensity: mix(a.ambient[1], b.ambient[1], t) },
    hemi: { sky: mixColor(a.hemi[0], b.hemi[0], t), ground: mixColor(a.hemi[1], b.hemi[1], t), intensity: mix(a.hemi[2], b.hemi[2], t) },
    key: {
      color: mixColor(a.key[0], b.key[0], t),
      intensity: mix(a.key[1], b.key[1], t),
      position: [mix(a.key[2][0], b.key[2][0], t), mix(a.key[2][1], b.key[2][1], t), mix(a.key[2][2], b.key[2][2], t)],
    },
    lamps: mix(a.lamps, b.lamps, t),
    fog: [mix(a.fog[0], b.fog[0], t), mix(a.fog[1], b.fog[1], t)],
  }
}

/** The rig for a sun height, piecewise between night, evening and day. */
export function lightingFor(sun: number, zone: LightZone): Lighting {
  const s = clamp01(sun)
  const n = NIGHT[zone]
  const e = EVENING[zone]
  const d = DAY[zone]
  if (s <= e.at) return between(n, e, s / e.at)
  return between(e, d, (s - e.at) / (d.at - e.at))
}
