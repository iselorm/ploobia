/**
 * Spoken narration — platform-wide, asset-free.
 *
 * Companion to [[audio.ts]] and bound by the same rules. Two of them matter
 * more here than they do for a beep:
 *
 *  - **Nothing is load-bearing.** Every line the narrator speaks is already on
 *    screen in the cabinet's own words. A learner who is deaf, muted, on a
 *    device with no voices, or in a classroom of thirty misses no teaching at
 *    all — they read exactly what the others hear. This is why the narrator
 *    takes lines from the HUD rather than owning a script of its own.
 *  - **Nothing sounds until a real user gesture.** Browser policy, and manners.
 *    iOS in particular discards `speak()` calls made before a tap.
 *
 * Why `speechSynthesis` and not recorded audio: the whole arcade is one
 * self-contained HTML file, about 2.5 MB, built for markets where data costs
 * real money. Narrating even one cabinet with recorded voice would be larger
 * than the entire app. The Web Speech API is already on the device, costs zero
 * bytes, and works offline — which is the same argument that made every sound
 * effect in this platform a synthesised oscillator.
 *
 * The trade-off is honest: the voice is whatever the device provides, and its
 * quality varies from very good (iOS, recent Android) to robotic (older
 * Android, some Linux). It is a reading voice, not a performance. If a
 * recorded narration is ever wanted, it belongs in a separately downloaded
 * pack, not in the bundle.
 */

const KEY = 'ploobia.voice.v1'

/** Longer than this and a learner has stopped listening. Enforced, not hoped for. */
const MAX_CHARS = 300

let enabled = false
let started = false
let voice: SpeechSynthesisVoice | null = null
let lastSpoken = ''
const listeners = new Set<(on: boolean) => void>()

/* ------------------------------------------------------------------ */
/* Capability                                                         */
/* ------------------------------------------------------------------ */

function synth(): SpeechSynthesis | null {
  try {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
      ? window.speechSynthesis
      : null
  } catch {
    return null
  }
}

/** True when this device can speak at all. The toggle hides when it cannot. */
export function narrationAvailable(): boolean {
  return synth() !== null
}

/**
 * Pick a voice once.
 *
 * `getVoices()` is empty on the first call in Chrome and fills in
 * asynchronously, which is the single most common way this API appears broken.
 * A local voice is preferred over a network one: a network voice adds latency
 * and, on a metered connection, cost.
 */
function pickVoice(): void {
  const s = synth()
  if (!s || voice) return
  const all = s.getVoices()
  if (!all.length) return
  const english = all.filter((v) => /^en(-|_|$)/i.test(v.lang))
  const pool = english.length ? english : all
  voice =
    pool.find((v) => v.localService && /female|samantha|karen|zira|google uk english female/i.test(v.name)) ??
    pool.find((v) => v.localService) ??
    pool[0]
}

/* ------------------------------------------------------------------ */
/* Preference                                                         */
/* ------------------------------------------------------------------ */

function load(): boolean {
  try {
    // Off unless the learner turned it on. A cabinet that starts talking by
    // itself in a classroom of thirty tablets is a support ticket, not a
    // feature — so the first press is always a person's.
    return window.localStorage?.getItem(KEY) === 'on'
  } catch {
    return false
  }
}

function save(on: boolean): void {
  try {
    window.localStorage?.setItem(KEY, on ? 'on' : 'off')
  } catch {
    /* private mode — the session still works, it just forgets */
  }
}

if (typeof window !== 'undefined') {
  enabled = load()
  const s = synth()
  if (s) {
    pickVoice()
    // Chrome fills the voice list late; without this the first line is silent.
    s.addEventListener?.('voiceschanged', pickVoice)
  }
}

export function narrationOn(): boolean {
  return enabled
}

export function setNarration(on: boolean): void {
  enabled = on
  save(on)
  if (!on) stopNarration()
  listeners.forEach((l) => l(on))
}

export function onNarrationChange(fn: (on: boolean) => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/* ------------------------------------------------------------------ */
/* Speaking                                                           */
/* ------------------------------------------------------------------ */

/** Call from a real tap, once, before anything is expected to be audible. */
export function startNarration(): void {
  started = true
  pickVoice()
}

export function stopNarration(): void {
  try {
    synth()?.cancel()
  } catch {
    /* nothing to cancel */
  }
  lastSpoken = ''
}

export interface SpeakOptions {
  /** Cut off whatever is being said. Use for results; not for flavour. */
  interrupt?: boolean
  /** Say it even if the same words were just said. */
  repeat?: boolean
  /**
   * Wait your turn instead of being dropped.
   *
   * The default is to drop a line that arrives while another is being spoken,
   * because a cabinet emits far more prompts than anyone wants read aloud. But
   * a result and the suggestion that follows it are one thought in two
   * sentences, and the second must not be swallowed by the first.
   */
  queue?: boolean
}

/**
 * Say one line.
 *
 * Silently does nothing when narration is off, unavailable, or no gesture has
 * happened yet — callers should never have to check first, because a caller
 * that has to check is a caller that will forget.
 */
export function speak(text: string, options: SpeakOptions = {}): void {
  const s = synth()
  if (!enabled || !started || !s || !text) return

  const line = text.replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS)
  if (!line) return
  // A cabinet re-renders constantly and the same coach line can arrive many
  // times; saying it twice sounds broken.
  if (!options.repeat && line === lastSpoken) return

  try {
    if (options.interrupt) s.cancel()
    else if (!options.queue && (s.speaking || s.pending)) return // let the current line finish
    const u = new SpeechSynthesisUtterance(line)
    if (voice) u.voice = voice
    u.lang = voice?.lang ?? 'en-GB'
    // A little under conversational: this is explanation, and the audience is
    // ten to seventeen.
    u.rate = 0.95
    u.pitch = 1.02
    u.volume = 1
    s.speak(u)
    lastSpoken = line
  } catch {
    /* a device that refuses to speak is not a broken cabinet */
  }
}

/** Symbols a screen reads fine and a voice does not. */
export function speakable(text: string): string {
  return text
    .replace(/CO₂/g, 'C O 2')
    .replace(/O₂/g, 'oxygen')
    .replace(/H₂O/g, 'water')
    .replace(/C₆H₁₂O₆/g, 'glucose')
    .replace(/µmol/g, 'micromoles')
    .replace(/mg h⁻¹/g, 'milligrams per hour')
    .replace(/m h⁻¹/g, 'metres per hour')
    .replace(/°C/g, ' degrees')
    .replace(/MPa/g, 'megapascals')
    .replace(/ppm/g, 'parts per million')
    .replace(/×/g, ' times ')
    .replace(/—/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
}
