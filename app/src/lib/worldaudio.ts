/**
 * The Archipelago's sound — W3 round 4. Asset-free, like the rest of the
 * platform's audio (`lib/audio.ts`): every sound here is an oscillator or a
 * shaped burst of noise, so the world edition gains no download weight.
 *
 * Two kinds of sound:
 *  - BEDS run continuously and follow state: the furnace's roar (gain and
 *    brightness follow its heat), the hearths' crackle (rate follows how
 *    many are lit). Built once audio has started, muted or not; the master
 *    gain is what mute controls.
 *  - ONE-SHOTS answer a change in the store or the explorer: a step, a
 *    pick-up, the bellows, the crane's winch and a landing, the Lens, a
 *    door, the pour, the stamp. Found by diffing successive states in one
 *    subscription — the scene never calls audio directly.
 *
 * Sound is never load-bearing: everything audible is also visible.
 */

import { audioGraph, blip, canPlay, noiseBuffer } from './audio'
import { COPPER_MELT_C, fallTimes, getWorld, worldStore, type WorldState } from './archipelago'

/* ----------------------------------------------------------------------------
 * Primitives
 * ------------------------------------------------------------------------- */

/** A shaped burst of filtered noise. */
function burst(opts: { dur: number; gain: number; type?: BiquadFilterType; freq: number; freqTo?: number; q?: number; attack?: number }): void {
  if (!canPlay()) return
  const g0 = audioGraph()
  const buf = noiseBuffer()
  if (!g0 || !buf) return
  const { ctx, master } = g0
  const t = ctx.currentTime
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.loop = true
  src.loopStart = Math.random() * 1.5
  src.loopEnd = src.loopStart + 0.5
  const f = ctx.createBiquadFilter()
  f.type = opts.type ?? 'bandpass'
  f.Q.value = opts.q ?? 0.8
  f.frequency.setValueAtTime(opts.freq, t)
  if (opts.freqTo) f.frequency.exponentialRampToValueAtTime(Math.max(20, opts.freqTo), t + opts.dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(opts.gain, t + (opts.attack ?? 0.008))
  g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur)
  src.connect(f)
  f.connect(g)
  g.connect(master)
  src.start(t)
  src.stop(t + opts.dur + 0.03)
}

/* ----------------------------------------------------------------------------
 * One-shots
 * ------------------------------------------------------------------------- */

/** A footfall on packed sand: a short, dull noise tap. Alternates a little. */
export function footstep(left: boolean): void {
  burst({ dur: 0.09, gain: 0.05, type: 'lowpass', freq: left ? 520 : 460, q: 0.5 })
}

/** Picking a piece up: a soft copper clink. */
export function pickUp(): void {
  blip(1760, 0.07, 0.05, 'triangle')
  window.setTimeout(() => blip(2340, 0.05, 0.03, 'triangle'), 25)
}

/** Setting a piece down: a low tap. */
export function putDown(): void {
  burst({ dur: 0.12, gain: 0.07, type: 'lowpass', freq: 300, q: 0.7 })
}

/** A heavy piece landing off the hook. */
export function thud(): void {
  burst({ dur: 0.28, gain: 0.16, type: 'lowpass', freq: 160, freqTo: 60, q: 0.9 })
  blip(70, 0.22, 0.12, 'sine', 40)
}

/** One stroke of the bellows: a breath of air, longer for a bigger stroke. */
export function bellows(strength: number): void {
  const s = Math.max(0.15, Math.min(1, strength))
  burst({ dur: 0.35 + s * 0.4, gain: 0.05 + s * 0.08, type: 'bandpass', freq: 400, freqTo: 1400, q: 0.6, attack: 0.08 })
}

/** The crane's winch, one notch. */
export function winch(): void {
  blip(300, 0.05, 0.03, 'square', 260)
}

/** The Lens rising to the System ring, or dropping back. */
export function lens(up: boolean): void {
  blip(up ? 880 : 660, 0.16, 0.06, 'sine', up ? 1320 : 440)
}

/** A hearth catching: a puff and a crackle. */
export function ignite(): void {
  burst({ dur: 0.5, gain: 0.09, type: 'bandpass', freq: 600, freqTo: 220, q: 0.7, attack: 0.03 })
  window.setTimeout(() => crackle(0.06), 120)
  window.setTimeout(() => crackle(0.04), 260)
}

/** One pop of a fire. */
function crackle(gain: number): void {
  burst({ dur: 0.03 + Math.random() * 0.04, gain, type: 'highpass', freq: 1800 + Math.random() * 2500, q: 1.2 })
}

/** The pour: copper lets go — a bright pour of noise under a bronze chord. */
export function pour(): void {
  burst({ dur: 1.6, gain: 0.08, type: 'bandpass', freq: 900, freqTo: 2600, q: 0.5, attack: 0.25 })
  blip(392, 0.9, 0.1)
  window.setTimeout(() => blip(523.25, 0.9, 0.09), 140)
  window.setTimeout(() => blip(659.25, 1.2, 0.08), 280)
  window.setTimeout(() => blip(783.99, 1.8, 0.07), 420)
}

/** The stamp landing on the journal. */
export function stamp(): void {
  burst({ dur: 0.14, gain: 0.12, type: 'lowpass', freq: 500, q: 0.6 })
  window.setTimeout(() => blip(1046.5, 0.5, 0.06), 60)
}

/** A door's latch. */
export function latch(): void {
  blip(240, 0.05, 0.05, 'square', 200)
  window.setTimeout(() => burst({ dur: 0.1, gain: 0.05, type: 'bandpass', freq: 1200, q: 1 }), 40)
}

/** Stepping through a portal: a rising wash. */
export function portal(): void {
  burst({ dur: 0.9, gain: 0.07, type: 'bandpass', freq: 300, freqTo: 3000, q: 0.5, attack: 0.2 })
  blip(440, 0.6, 0.05, 'sine', 880)
}

/** Someone begins to speak: two soft notes. */
export function talk(): void {
  blip(660, 0.1, 0.05, 'triangle')
  window.setTimeout(() => blip(880, 0.12, 0.04, 'triangle'), 90)
}

/** A shut door, a too-heavy piece: the platform's nudge, quieter. */
export function refuse(): void {
  blip(220, 0.12, 0.04, 'triangle', 180)
}

/* ----------------------------------------------------------------------------
 * Beds
 * ------------------------------------------------------------------------- */

interface Bed {
  gain: GainNode
  filter: BiquadFilterNode
  src: AudioBufferSourceNode
  rumble: OscillatorNode
  rumbleGain: GainNode
}

let bed: Bed | null = null

function ensureBed(): Bed | null {
  if (bed) return bed
  const g0 = audioGraph()
  const buf = noiseBuffer()
  if (!g0 || !buf) return null
  const { ctx, master } = g0
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.loop = true
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 120
  filter.Q.value = 0.4
  const gain = ctx.createGain()
  gain.gain.value = 0
  src.connect(filter)
  filter.connect(gain)
  gain.connect(master)
  src.start()
  // Under the noise, a low pulse that the fire's draught leans on.
  const rumble = ctx.createOscillator()
  rumble.type = 'sine'
  rumble.frequency.value = 46
  const rumbleGain = ctx.createGain()
  rumbleGain.gain.value = 0
  rumble.connect(rumbleGain)
  rumbleGain.connect(master)
  rumble.start()
  bed = { gain, filter, src, rumble, rumbleGain }
  return bed
}

/** Drive the furnace bed from the state: heat sets gain and brightness. */
function driveBed(s: WorldState): void {
  const b = ensureBed()
  const g0 = audioGraph()
  if (!b || !g0) return
  const t = g0.ctx.currentTime
  const heat = s.furnace.lit ? Math.min(1, Math.max(0, (s.furnace.temp - 20) / (COPPER_MELT_C + 100))) : 0
  // Inside the room the fire is close; outside it is behind a wall of stone.
  const near = s.room === 'furnace' ? 1 : 0.45
  b.gain.gain.setTargetAtTime(heat * 0.22 * near, t, 0.25)
  b.filter.frequency.setTargetAtTime(120 + heat * 900, t, 0.25)
  b.rumbleGain.gain.setTargetAtTime(heat * 0.12 * near, t, 0.25)
}

function stopBed(): void {
  if (!bed) return
  try {
    bed.src.stop()
    bed.rumble.stop()
  } catch {
    /* already stopped */
  }
  bed.gain.disconnect()
  bed.rumbleGain.disconnect()
  bed = null
}

/* ----------------------------------------------------------------------------
 * The watcher: diff the store, and listen to the explorer
 * ------------------------------------------------------------------------- */

export interface Stride {
  /** Ground speed this frame, m/s. */
  speed: number
  grounded: boolean
}

/** Seconds between footfalls at walking pace. */
const STRIDE_S = 0.38

/**
 * Install the world's sound for as long as the page is mounted. `getStride`
 * reads the explorer (speed and grounded) so this file stays free of the
 * scene. Returns the cleanup.
 */
export function installWorldAudio(getStride: () => Stride): () => void {
  let prev = getWorld()
  let lastAir = prev.air
  let lastHook = prev.crane.hookY
  let winchAt = 0
  driveBed(prev)

  const unsub = worldStore.subscribe((s) => {
    // The beds follow state whether or not a one-shot fires.
    if (s.furnace !== prev.furnace || s.room !== prev.room) driveBed(s)

    if (s.zone !== prev.zone) portal()
    if (s.held && !prev.held) pickUp()
    if (!s.held && prev.held) putDown()
    if (s.ring !== prev.ring) lens(s.ring === 'system')
    if (s.lit.length > prev.lit.length) ignite()
    if (s.furnace.lit && !prev.furnace.lit) ignite()
    if (s.poured && !prev.poured) pour()
    if (s.whys[2] >= 0 && prev.whys[2] < 0) stamp()
    if (s.cabinet && !prev.cabinet) latch()
    if (s.talk && !prev.talk) talk()
    if (s.pipeFixed && !prev.pipeFixed) {
      putDown()
      window.setTimeout(() => blip(1046.5, 0.3, 0.05), 120)
    }
    // The bellows: a stroke each time the air is pushed up a notch.
    if (s.air > lastAir + 0.08) {
      bellows(s.air)
      lastAir = s.air
    } else if (s.air < lastAir) lastAir = s.air
    // The winch: a notch per 0.35 m of hook travel.
    if (s.crane.active && Math.abs(s.crane.hookY - lastHook) >= 0.35) {
      const now = performance.now()
      if (now - winchAt > 90) {
        winch()
        winchAt = now
      }
      lastHook = s.crane.hookY
    } else if (!s.crane.active) lastHook = s.crane.hookY
    // A landing: a drop that just got its t1.
    for (const id of Object.keys(s.crane.drops)) {
      const d = s.crane.drops[id]
      const p = prev.crane.drops[id]
      if (d.t1 != null && (!p || p.t1 == null)) {
        thud()
        // Both timed from the same height: the bet is settled, a small chord.
        if (fallTimes(s) && !fallTimes(prev)) window.setTimeout(() => blip(880, 0.4, 0.06), 300)
      }
    }
    prev = s
  })

  // Footfalls, from the explorer's stride.
  let stride = 0
  let left = false
  let last = performance.now()
  const walk = window.setInterval(() => {
    const now = performance.now()
    const dt = (now - last) / 1000
    last = now
    const s = getWorld()
    if (s.phase !== 'play' || s.room !== 'none' || s.crane.active) return
    const st = getStride()
    if (st.speed > 0.2 && st.grounded) {
      stride += dt * (st.speed / 3.2)
      if (stride >= STRIDE_S) {
        stride = 0
        left = !left
        footstep(left)
      }
    } else stride = STRIDE_S * 0.7
  }, 40)

  const onShut = () => refuse()
  window.addEventListener('ploobia:doorshut', onShut)
  window.addEventListener('ploobia:tooheavy', onShut)

  return () => {
    unsub()
    window.clearInterval(walk)
    window.removeEventListener('ploobia:doorshut', onShut)
    window.removeEventListener('ploobia:tooheavy', onShut)
    stopBed()
  }
}

/** Test handle: what the bed is doing right now. */
export function bedLevel(): { gain: number; cutoff: number } | null {
  if (!bed) return null
  return { gain: bed.gain.gain.value, cutoff: bed.filter.frequency.value }
}
