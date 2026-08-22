/**
 * Ploobia's sound layer — platform-wide, asset-free.
 *
 * Every sound here is synthesised with WebAudio oscillators and noise buffers,
 * so the single-file build gains no download weight at all. That matters:
 * Ploobia is built for price-sensitive markets, and an audio pack would be
 * bigger than the whole app.
 *
 * Rules this module keeps:
 *  - Nothing sounds until a real user gesture starts it (browser policy, and
 *    also basic manners).
 *  - Mute is remembered across sessions, and honoured before anything plays.
 *  - Sound is never load-bearing: everything audible is also visible. A muted
 *    learner, or one on a device with no audio, misses nothing teachable.
 */

const KEY = 'ploobia.audio.v1'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = false
let started = false
const listeners = new Set<(m: boolean) => void>()

/* ------------------------------------------------------------------ */
/* Persistence (same guarded pattern as lib/events.ts)                */
/* ------------------------------------------------------------------ */

function loadMuted(): boolean {
  try {
    return window.localStorage?.getItem(KEY) === 'muted'
  } catch {
    return false
  }
}

function saveMuted(m: boolean): void {
  try {
    window.localStorage?.setItem(KEY, m ? 'muted' : 'on')
  } catch {
    /* private mode / quota: the setting just won't persist */
  }
}

if (typeof window !== 'undefined') muted = loadMuted()

/* ------------------------------------------------------------------ */
/* Lifecycle                                                          */
/* ------------------------------------------------------------------ */

/** Call from a click/tap handler — browsers refuse audio before a gesture. */
export function startAudio(): void {
  if (started || typeof window === 'undefined') return
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = muted ? 0 : 0.5
    master.connect(ctx.destination)
    started = true
    exposeState()
  } catch {
    ctx = null
    master = null
  }
}

/** Test handle: verification asserts on the audio state it cannot hear. */
function exposeState(): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as Record<string, unknown>
  w.__audioStarted = started
  w.__audioMuted = muted
}

export function isMuted(): boolean {
  return muted
}

export function setMuted(m: boolean): void {
  muted = m
  saveMuted(m)
  if (master && ctx) {
    master.gain.cancelScheduledValues(ctx.currentTime)
    master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.05)
  }
  listeners.forEach((fn) => fn(m))
  exposeState()
}

export function onMuteChange(fn: (m: boolean) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function ready(): boolean {
  if (!ctx || !master || muted) return false
  if (ctx.state === 'suspended') void ctx.resume()
  return true
}

/* ------------------------------------------------------------------ */
/* Voices                                                             */
/* ------------------------------------------------------------------ */

/** A short pitched blip: sine/triangle with a fast attack and a soft tail. */
function blip(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', slideTo?: number): void {
  if (!ready() || !ctx || !master) return
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g)
  g.connect(master)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

/**
 * One heart sound: a low thud with a click of valve noise on top. "lub" is
 * bigger and lower than "dub" — the same shape as the visual waveform in
 * lib/sim.ts, so what you hear and what the wall does are the same beat.
 */
export function heartThump(strength: number, lub: boolean): void {
  if (!ready() || !ctx || !master) return
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'sine'
  const f0 = lub ? 62 : 78
  osc.frequency.setValueAtTime(f0, t)
  osc.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.16)
  const peak = (lub ? 0.5 : 0.3) * Math.max(0.15, strength)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + 0.014)
  g.gain.exponentialRampToValueAtTime(0.0001, t + (lub ? 0.24 : 0.18))
  osc.connect(g)
  g.connect(master)
  osc.start(t)
  osc.stop(t + 0.3)
}

/** Passing a checkpoint gate. */
export function checkpointBlip(): void {
  blip(880, 0.13, 0.16, 'triangle')
  window.setTimeout(() => blip(1320, 0.1, 0.11, 'triangle'), 70)
}

/** Completing a lap — a small three-note flourish. */
export function lapChime(): void {
  blip(660, 0.18, 0.15, 'sine')
  window.setTimeout(() => blip(880, 0.18, 0.15, 'sine'), 110)
  window.setTimeout(() => blip(1180, 0.3, 0.16, 'sine'), 230)
}

/** An O₂ molecule handed to a body cell. */
export function deliveryPing(): void {
  blip(1480, 0.16, 0.1, 'sine', 1980)
}

/** Oxygen clicking onto a haemoglobin site in the lungs. */
export function loadClick(): void {
  blip(1180, 0.07, 0.06, 'triangle')
}
