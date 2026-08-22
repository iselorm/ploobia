/**
 * Quality tiers — the platform-wide rendering budget.
 *
 * "Cinematic Lab" only works if the scene still looks intentional on a
 * mid-range Android tablet over metered data, so every cabinet renders against
 * a tier rather than a fixed setting. The tier is guessed at boot from cheap
 * device signals and then *adapted*: if measured frame time stays poor for a
 * few seconds the tier steps down (never up — flapping looks worse than a
 * steady lower tier).
 *
 * Cabinets read `QUALITY_CAPS[tier]` flags, never the tier name — the same
 * discipline as `BAND_CAPS` and the input store.
 */

import { useSyncExternalStore } from 'react'

export type QualityTier = 'high' | 'medium' | 'low'

export interface QualityCaps {
  /** Device-pixel-ratio ceiling handed to the Canvas. */
  maxDpr: number
  /** Multiplier for particle / molecule counts (1 = authored count). */
  particleScale: number
  /** Enable shadow maps and contact shadows. */
  shadows: boolean
  /** Enable the post-processing chain (bloom, AO) when a cabinet has one. */
  postFx: boolean
  /** Antialiasing on the WebGL context. */
  antialias: boolean
}

export const QUALITY_CAPS: Record<QualityTier, QualityCaps> = {
  high: { maxDpr: 2, particleScale: 1, shadows: true, postFx: true, antialias: true },
  medium: { maxDpr: 1.5, particleScale: 0.7, shadows: true, postFx: false, antialias: true },
  low: { maxDpr: 1, particleScale: 0.45, shadows: false, postFx: false, antialias: false },
}

const ORDER: QualityTier[] = ['high', 'medium', 'low']

/* ------------------------------------------------------------------ */
/* Store                                                              */
/* ------------------------------------------------------------------ */

let tier: QualityTier = guessTier()
let locked = false
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((l) => l())
}

export function getQualityTier(): QualityTier {
  return tier
}

export function getQualityCaps(): QualityCaps {
  return QUALITY_CAPS[tier]
}

/** Explicit choice (a settings menu later). Locks out adaptive changes. */
export function setQualityTier(t: QualityTier, lock = true): void {
  locked = lock
  if (t === tier) return
  tier = t
  notify()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useQualityTier(): QualityTier {
  return useSyncExternalStore(subscribe, getQualityTier, getQualityTier)
}

export function useQualityCaps(): QualityCaps {
  return QUALITY_CAPS[useQualityTier()]
}

/* ------------------------------------------------------------------ */
/* Boot-time guess                                                    */
/* ------------------------------------------------------------------ */

function guessTier(): QualityTier {
  if (typeof navigator === 'undefined') return 'medium'
  const nav = navigator as Navigator & { deviceMemory?: number }
  const cores = nav.hardwareConcurrency ?? 4
  const mem = nav.deviceMemory ?? 4
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const px = typeof window !== 'undefined' ? window.innerWidth * window.innerHeight * dpr * dpr : 0

  // Phones and cheap tablets: few cores, little memory, very dense screens.
  if (mem <= 2 || cores <= 2) return 'low'
  if (coarse && (mem <= 4 || cores <= 4 || px > 4.5e6)) return 'medium'
  if (!coarse && cores <= 4 && mem <= 4) return 'medium'
  return 'high'
}

/* ------------------------------------------------------------------ */
/* Adaptive downgrade                                                 */
/* ------------------------------------------------------------------ */

const WINDOW_S = 3
const SLOW_MS = 38 // sustained ≈ <26 fps
let acc = 0
let n = 0
let elapsed = 0
let settle = 2 // ignore the first seconds (shader compile, warm-up)

/**
 * Feed real frame deltas (seconds) from a `useFrame`. When the rolling average
 * over WINDOW_S stays above SLOW_MS the tier steps down one notch.
 * Cheap enough to call every frame from every cabinet.
 */
export function reportFrame(dt: number): void {
  if (locked || tier === 'low') return
  if (settle > 0) {
    settle -= dt
    return
  }
  acc += dt
  n += 1
  elapsed += dt
  if (elapsed < WINDOW_S) return
  const avgMs = (acc / Math.max(1, n)) * 1000
  acc = 0
  n = 0
  elapsed = 0
  if (avgMs > SLOW_MS) {
    const i = ORDER.indexOf(tier)
    tier = ORDER[Math.min(ORDER.length - 1, i + 1)]
    settle = 2
    notify()
  }
}
