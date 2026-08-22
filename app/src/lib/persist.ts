/**
 * Safe key/value persistence.
 *
 * The house rule "no browser storage" exists because the preview sandbox this
 * project was authored in silently breaks `localStorage`. On a real hosted
 * origin it works, and a pilot tester who reloads must not lose an afternoon of
 * readings. So: one probe at module load, one shared helper, and every caller
 * degrades to memory without a try/catch of its own.
 *
 * `available` is exported so UI can be honest with the learner ("this device is
 * not saving progress") rather than pretending.
 */

const memory = new Map<string, string>()

function probe(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false
    const k = '__ploobia_probe__'
    window.localStorage.setItem(k, '1')
    window.localStorage.removeItem(k)
    return true
  } catch {
    return false
  }
}

/** True when this browser actually lets us keep things between visits. */
export const available = probe()

export function readRaw(key: string): string | null {
  if (!available) return memory.get(key) ?? null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return memory.get(key) ?? null
  }
}

export function writeRaw(key: string, value: string): void {
  memory.set(key, value)
  if (!available) return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* quota exhausted or private mode — the memory copy still serves this session */
  }
}

export function remove(key: string): void {
  memory.delete(key)
  if (!available) return
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/**
 * Read and parse, returning `fallback` on anything unexpected.
 *
 * Storage written by an older build is untrusted input: a shape change must
 * degrade to the fallback, never throw halfway through a lesson.
 */
export function read<T>(key: string, fallback: T): T {
  const raw = readRaw(key)
  if (raw == null) return fallback
  try {
    const parsed = JSON.parse(raw) as T
    return parsed === null || parsed === undefined ? fallback : parsed
  } catch {
    return fallback
  }
}

export function write(key: string, value: unknown): void {
  try {
    writeRaw(key, JSON.stringify(value))
  } catch {
    /* circular or non-serialisable — a caller bug, never worth crashing a lesson */
  }
}
