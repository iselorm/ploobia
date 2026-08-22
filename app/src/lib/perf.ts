/**
 * Render cost, measured rather than guessed.
 *
 * Two problems this solves. First, "it was slow on my tablet" is unactionable
 * without knowing what the scene was actually asking of the GPU, so the pilot
 * report carries a cost snapshot alongside the frame rate. Second, the headless
 * suites run on a software renderer whose frame rate says nothing about real
 * hardware — but **draw calls and triangle counts transfer**, so they are what
 * the performance audit asserts against.
 *
 * `<PerfProbe/>` (components/PerfProbe.tsx) publishes here once a second from
 * inside each cabinet's Canvas. Everything is a plain module store: no React
 * state, no re-renders, nothing running when no one is looking.
 */

export interface PerfSnapshot {
  /** Which cabinet was on screen when this was taken. */
  cabinet: string
  /** Quality tier in force. */
  tier: string
  /** three.js renderer.info.render.calls — the number that most predicts cost on a tablet. */
  calls: number
  triangles: number
  /** Live GPU resources. A climbing count between visits means a leak. */
  geometries: number
  textures: number
  /** Compiled shader programs — each one is a compile stall the first time. */
  programs: number
  /** Median frame time in ms over the last sampling window, and its fps. */
  frameMs: number
  fps: number
  /** Worst frame in the window — where the stutters live. */
  worstMs: number
  /** Canvas backing-store size, after the DPR cap. */
  drawingBuffer: string
  at: number
}

let latest: PerfSnapshot | null = null

declare global {
  interface Window {
    /** Read by verify-perf.mjs, and handy in a device's own console. */
    __perf?: PerfSnapshot | null
  }
}

export function publishPerf(s: PerfSnapshot): void {
  latest = s
  // Same convention as the cabinets' own `window.__riverSim` handles: the
  // suites assert against the running scene rather than a parallel model.
  if (typeof window !== 'undefined') window.__perf = s
}

export function getPerf(): PerfSnapshot | null {
  return latest
}

/** Cleared on cabinet change so a report never carries the previous room's cost. */
export function clearPerf(): void {
  latest = null
  if (typeof window !== 'undefined') window.__perf = null
}

/* ------------------------------------------------------------------ */
/* Renderer identity                                                  */
/* ------------------------------------------------------------------ */

let cachedRenderer: string | null | undefined

/**
 * Recorded by `PerfProbe` from the scene's own context.
 *
 * **Never create a WebGL context just to read this.** iOS Safari grants very
 * few, and an earlier version probed one during module evaluation — before
 * React had mounted — which is a fine way to stall a bundle on a phone and
 * leave the boot shell up with nothing behind it. A scene already has a
 * context; ask that one, once.
 */
export function setRenderer(name: string | null): void {
  if (name) cachedRenderer = name
}

/**
 * The GPU string, e.g. "Mali-G52" or "ANGLE (… SwiftShader …)", or null until a
 * scene has reported one. A report filed from the hall, before any cabinet has
 * opened, will honestly say it does not know rather than spending a context to
 * find out.
 */
export function glRenderer(): string | null {
  return cachedRenderer ?? null
}

/* ------------------------------------------------------------------ */
/* Frame-time window                                                  */
/* ------------------------------------------------------------------ */

/**
 * A rolling window of frame times. The median is reported rather than the mean
 * because one 400 ms shader compile should not describe a scene that is
 * otherwise smooth — and the max is reported separately, because that stall is
 * real and worth seeing.
 */
export class FrameWindow {
  private samples: number[] = []
  private readonly cap: number

  constructor(cap = 120) {
    this.cap = cap
  }

  push(ms: number): void {
    if (!(ms > 0) || ms > 2000) return
    this.samples.push(ms)
    if (this.samples.length > this.cap) this.samples.shift()
  }

  get size(): number {
    return this.samples.length
  }

  median(): number {
    if (!this.samples.length) return 0
    const sorted = [...this.samples].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)]
  }

  worst(): number {
    return this.samples.length ? Math.max(...this.samples) : 0
  }

  clear(): void {
    this.samples.length = 0
  }
}
