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

/** `?q=low|medium|high` anywhere in the URL (hash included) pins the tier — for debugging and for slow test renderers. */
function pinnedTier(): QualityTier | null {
  if (typeof window === 'undefined') return null
  const m = /[?&]q=(low|medium|high)\b/.exec(window.location.hash + window.location.search)
  return m ? (m[1] as QualityTier) : null
}
const pinned = pinnedTier()
let tier: QualityTier = pinned ?? guessTier()
let locked = pinned !== null
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

/**
 * Told by `PerfProbe` what the live renderer actually is, once a scene exists.
 *
 * Software rendering (SwiftShader, llvmpipe, Apple's fallback, Microsoft's
 * Basic Render Driver) is one to two orders of magnitude slower than the
 * weakest real GPU, so no amount of adaptive stepping reaches a usable tier
 * from `high` in time. Drop straight to `low` — but leave it unlocked, so an
 * explicit `?q=` still wins and this is only a default.
 */
export function noteRenderer(renderer: string | null | undefined): void {
  if (locked || tier === 'low' || !renderer) return
  if (/swiftshader|llvmpipe|softwarerasterizer|basic render|software adapter/i.test(renderer)) {
    tier = 'low'
    notify()
  }
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

/**
 * Cheap signals only. **Nothing here may touch WebGL.**
 *
 * This runs during module evaluation, before React has mounted anything, and an
 * earlier version created a throwaway WebGL context here to detect software
 * rendering. That was a bad place for it: iOS Safari grants very few WebGL
 * contexts and can be slow to hand one over, so a probe at import time can
 * stall the whole bundle before a single pixel is drawn — leaving the boot
 * shell up and nothing behind it. The software check now happens inside
 * `PerfProbe`, using the renderer the scene already has (`noteRenderer`).
 */
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
const DIRE_MS = 70 // ≈ <14 fps — one notch will not save this
const SETTLE_S = 2.5
let acc = 0
let n = 0
let elapsed = 0
let settle = SETTLE_S // ignore the first seconds (shader compile, warm-up)

/**
 * Re-arm the sampling window. **Every cabinet must call this as its scene
 * mounts.**
 *
 * Without it the tier ratchets down as a learner walks the arcade: entering a
 * cabinet costs a burst of shader compiles and texture uploads, and since the
 * window carried over from the previous room there was no settle period to
 * absorb it — so the first three seconds of each new cabinet read as sustained
 * slowness and a perfectly capable tablet ended the visit pinned to `low`.
 * Downgrades are permanent by design, which made that bug permanent too.
 */
export function resetFrameSampling(): void {
  acc = 0
  n = 0
  elapsed = 0
  settle = SETTLE_S
}

/**
 * Feed real frame deltas (seconds) from a `useFrame`. When the rolling average
 * over WINDOW_S stays above SLOW_MS the tier steps down; if it is catastrophic
 * it steps two, because a device rendering at 12 fps should not have to endure
 * two more sampling windows to reach the tier it was always going to need.
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
    const steps = avgMs > DIRE_MS ? 2 : 1
    const i = ORDER.indexOf(tier)
    tier = ORDER[Math.min(ORDER.length - 1, i + steps)]
    settle = SETTLE_S
    notify()
  }
}
