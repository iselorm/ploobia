import { useSyncExternalStore } from 'react'

/**
 * Layout regime for a cabinet's HUD.
 *
 *  • `wide`    — desktop / landscape tablet: side columns beside the scene.
 *  • `compact` — phones (either orientation) and very short windows: the side
 *                columns collapse into a bottom drawer so the 3D scene keeps
 *                most of the screen.
 *
 * Decided from viewport geometry alone (not from the input mode) because a
 * mouse on a tiny window needs the drawer just as much as a thumb does.
 */
export type LayoutMode = 'wide' | 'compact'

const COMPACT_MAX_WIDTH = 760
const COMPACT_MAX_HEIGHT = 560

function read(): LayoutMode {
  if (typeof window === 'undefined') return 'wide'
  return window.innerWidth < COMPACT_MAX_WIDTH || window.innerHeight < COMPACT_MAX_HEIGHT
    ? 'compact'
    : 'wide'
}

function subscribe(cb: () => void) {
  window.addEventListener('resize', cb)
  window.addEventListener('orientationchange', cb)
  return () => {
    window.removeEventListener('resize', cb)
    window.removeEventListener('orientationchange', cb)
  }
}

export function useLayoutMode(): LayoutMode {
  return useSyncExternalStore(subscribe, read, () => 'wide')
}

/**
 * True when the viewport is at least `px` wide. Cabinets that put a column on
 * BOTH sides of the scene need more room than the `compact` breakpoint gives:
 * at ~800–1000 px the two columns meet in the middle and start covering the
 * centre HUD, which is how a Skip button once became unclickable.
 */
export function useMinWidth(px: number): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (typeof window === 'undefined' ? true : window.innerWidth >= px),
    () => true,
  )
}

/** Portrait phones get an even tighter treatment (single-column chips). */
export function usePortrait(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (typeof window === 'undefined' ? false : window.innerHeight > window.innerWidth),
    () => false,
  )
}

/** True when the viewport is shorter than `px` — side columns must economise on height. */
export function useShortViewport(px = 900): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (typeof window === 'undefined' ? false : window.innerHeight < px),
    () => false,
  )
}
