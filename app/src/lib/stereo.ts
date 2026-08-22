/**
 * Cardboard stereo — cheap immersive viewing.
 *
 * A phone in a cardboard viewer: the scene rendered side by side from two eye
 * cameras, the head's orientation from the device gyroscope (drag as a
 * fallback), a short guided tour through the authored viewpoints, and one tap
 * (the Cardboard button) to move on. Nothing else: no menus, no free roaming,
 * a fixed horizon, no scripted acceleration — the things that make VR safe and
 * comfortable for children on a two-dollar viewer.
 *
 * Module-level store like the others; the cabinet reads it, the HUD hides.
 */

import { useSyncExternalStore } from 'react'

export interface StereoState {
  on: boolean
  /** Inter-pupillary distance in world units (scene metres ≈ 0.064 scaled). */
  eyeSep: number
  /** Whether device orientation is actually delivering data. */
  tracking: boolean
  /** Landscape required for a cardboard viewer. */
  landscape: boolean
}

let state: StereoState = { on: false, eyeSep: 0.064, tracking: false, landscape: true }
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())
function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
export function getStereo(): StereoState {
  return state
}
export function useStereo(): StereoState {
  return useSyncExternalStore(subscribe, getStereo, getStereo)
}
function set(patch: Partial<StereoState>) {
  state = { ...state, ...patch }
  notify()
}

/** Ask for gyroscope access where the platform requires it (iOS), then switch on. */
export async function enterStereo(): Promise<void> {
  try {
    const D = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> }
    if (typeof D.requestPermission === 'function') {
      const r = await D.requestPermission()
      if (r !== 'granted') set({ tracking: false })
    }
  } catch {
    /* no permission API — fine */
  }
  try {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }
    if (el.requestFullscreen) await el.requestFullscreen()
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen()
  } catch {
    /* fullscreen refused — still works */
  }
  try {
    const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
    if (so?.lock) await so.lock('landscape')
  } catch {
    /* orientation lock unsupported — the overlay asks the learner to rotate */
  }
  set({ on: true })
  updateLandscape()
}

export function exitStereo(): void {
  set({ on: false })
  try {
    if (document.fullscreenElement) void document.exitFullscreen()
  } catch {
    /* ignore */
  }
  try {
    const so = screen.orientation as ScreenOrientation & { unlock?: () => void }
    so?.unlock?.()
  } catch {
    /* ignore */
  }
}

export function setTracking(t: boolean): void {
  if (t !== state.tracking) set({ tracking: t })
}

export function updateLandscape(): void {
  const l = typeof window === 'undefined' ? true : window.innerWidth >= window.innerHeight
  if (l !== state.landscape) set({ landscape: l })
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', updateLandscape)
  window.addEventListener('orientationchange', updateLandscape)
}
