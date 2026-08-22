/**
 * Practical-skills toolkit — shared by every exam-style practical.
 *
 * Born in the Motion Lab and reused by the Pendulum Practical, Newton's Ramp
 * and everything after: the learner's *measured* reaction time, repeat
 * statistics, least-squares straight lines, learner-drawn best-fit lines and
 * gradient checks, and the honest formatting of a value with its uncertainty.
 *
 * Nothing here knows about balls, bobs or carts. It knows about tables,
 * graphs and the marks IGCSE Paper 5/6 hands out for using them properly.
 */

import { useSyncExternalStore } from 'react'

/* ------------------------------------------------------------------ */
/* Reaction time — measured from the learner's own taps, never faked  */
/* ------------------------------------------------------------------ */

/**
 * The learner's median reaction time in milliseconds, or null until they
 * have run the "catch the light" calibration. Module-level so it follows the
 * learner from cabinet to cabinet within a session (a profile field later).
 */
let reactionMs: number | null = null
let reactionSamples: number[] = []
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((l) => l())
}
function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function getReactionMs(): number | null {
  return reactionMs
}
export function getReactionSamples(): number[] {
  return reactionSamples
}
export function setReaction(samples: number[]): void {
  reactionSamples = [...samples]
  reactionMs = samples.length ? Math.round(median(samples)) : null
  notify()
}
export function useReactionMs(): number | null {
  return useSyncExternalStore(subscribe, getReactionMs, getReactionMs)
}

/* ------------------------------------------------------------------ */
/* Repeat statistics                                                  */
/* ------------------------------------------------------------------ */

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0
}
export function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
/** Half the range — the IGCSE-friendly uncertainty of a set of repeats. */
export function halfRange(xs: number[]): number {
  if (xs.length < 2) return 0
  return (Math.max(...xs) - Math.min(...xs)) / 2
}
export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1))
}

/* ------------------------------------------------------------------ */
/* Straight lines                                                     */
/* ------------------------------------------------------------------ */

export interface Point {
  x: number
  y: number
}

export interface LineFit {
  gradient: number
  intercept: number
  r2: number
  n: number
}

/** Ordinary least squares y = m·x + c. Null with fewer than two distinct x. */
export function fitLine(points: Point[]): LineFit | null {
  const n = points.length
  if (n < 2) return null
  const mx = mean(points.map((p) => p.x))
  const my = mean(points.map((p) => p.y))
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (const p of points) {
    sxx += (p.x - mx) ** 2
    sxy += (p.x - mx) * (p.y - my)
    syy += (p.y - my) ** 2
  }
  if (sxx <= 1e-12) return null
  const gradient = sxy / sxx
  const intercept = my - gradient * mx
  const r2 = syy > 0 ? (sxy * sxy) / (sxx * syy) : 1
  return { gradient, intercept, r2, n }
}

/** Least squares through the origin: y = m·x. */
export function fitThroughOrigin(points: Point[]): number | null {
  let sxx = 0
  let sxy = 0
  for (const p of points) {
    sxx += p.x * p.x
    sxy += p.x * p.y
  }
  return sxx > 1e-12 ? sxy / sxx : null
}

/** A learner-drawn line: two draggable handles in data units. */
export interface Handles {
  a: Point
  b: Point
}

export function lineFromHandles(h: Handles): { gradient: number; intercept: number } | null {
  const dx = h.b.x - h.a.x
  if (Math.abs(dx) < 1e-9) return null
  const gradient = (h.b.y - h.a.y) / dx
  return { gradient, intercept: h.a.y - gradient * h.a.x }
}

/**
 * Does a learner-drawn line deserve the "best-fit line" mark? Its gradient
 * must be within `tol` (fraction) of the least-squares gradient and it must
 * pass through the cloud of points (RMS residual no worse than 1.6× the
 * least-squares residual, with a floor so perfect data is not impossible).
 */
export function lineClose(
  handles: Handles,
  points: Point[],
  tol = 0.15,
): { ok: boolean; learner: number; fitted: number } {
  const fit = fitLine(points)
  const ln = lineFromHandles(handles)
  if (!fit || !ln) return { ok: false, learner: ln?.gradient ?? 0, fitted: fit?.gradient ?? 0 }
  const gradOk = Math.abs(ln.gradient - fit.gradient) <= Math.abs(fit.gradient) * tol
  const rms = (m: number, c: number) =>
    Math.sqrt(mean(points.map((p) => (p.y - (m * p.x + c)) ** 2)))
  const fitRms = rms(fit.gradient, fit.intercept)
  const yScale = Math.max(1e-6, Math.max(...points.map((p) => Math.abs(p.y))))
  const floor = yScale * 0.04
  const passOk = rms(ln.gradient, ln.intercept) <= Math.max(floor, fitRms * 1.6)
  return { ok: gradOk && passOk, learner: ln.gradient, fitted: fit.gradient }
}

/* ------------------------------------------------------------------ */
/* Formatting                                                         */
/* ------------------------------------------------------------------ */

/** Round to a number of significant figures (as a string, keeping trailing zeros). */
export function sigFig(x: number, sf: number): string {
  if (x === 0) return '0'
  const d = Math.ceil(Math.log10(Math.abs(x)))
  const decimals = Math.max(0, sf - d)
  return x.toFixed(decimals)
}

/** "9.7 ± 0.3" with the uncertainty rounded to one s.f. and the value to match. */
export function withUncertainty(value: number, unc: number): string {
  if (!(unc > 0)) return sigFig(value, 3)
  const d = Math.floor(Math.log10(unc))
  const decimals = Math.max(0, -d)
  return `${value.toFixed(decimals)} ± ${unc.toFixed(decimals)}`
}

/** Seconds as a stopwatch reads them: 0.45 → "0.45 s". */
export function fmtSeconds(s: number, decimals = 2): string {
  return `${s.toFixed(decimals)} s`
}
