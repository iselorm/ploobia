/**
 * The verb registry — how a word on a page moves the world.
 *
 * The field guide's one trick (borrowed from StoryComet, 11 Sep 2026) is that
 * the page, the narrator and the scene share a vocabulary: a braced term on a
 * page such as `{xylem:stem/xylem}` names an `object/verb`, and tapping the
 * term — or the narrator reaching it — fires that verb on the cabinet's sim.
 *
 * A cabinet registers the verbs it can honestly answer while it is mounted,
 * and unregisters them on unmount. A page can therefore only ask for what the
 * cabinet can show: the model suite checks that every braced term in every
 * book resolves to a verb the cabinet declares (`SUGAR_VERBS`), and the
 * browser suite taps every one and asserts the sim moved. **A term that
 * resolves to nothing is a build error, not a plain word.**
 *
 * The registry is deliberately tiny and framework-free: a Map, keyed by
 * `object/verb`, with a change counter for the suites. No React here.
 */

export type VerbId = `${string}/${string}`

export type VerbFn = () => void

interface Entry {
  fn: VerbFn
  /** Which cabinet registered it, so one cabinet's unmount clears only its own. */
  scope: string
}

const registry = new Map<VerbId, Entry>()

/** Bumped on every successful run — the browser suite reads it back. */
let runs = 0
let lastRun: VerbId | null = null

export function registerVerb(scope: string, id: VerbId, fn: VerbFn): void {
  registry.set(id, { fn, scope })
}

/** Register many at once; returns the unregister function for an effect cleanup. */
export function registerVerbs(scope: string, verbs: Record<string, VerbFn>): () => void {
  for (const [id, fn] of Object.entries(verbs)) registerVerb(scope, id as VerbId, fn)
  return () => unregisterScope(scope)
}

export function unregisterScope(scope: string): void {
  for (const [id, e] of registry) if (e.scope === scope) registry.delete(id)
}

export function hasVerb(id: string): boolean {
  return registry.has(id as VerbId)
}

/**
 * Fire a verb. Returns false when nothing is registered under that id — the
 * page card renders such a term as plain text (never a dead handle), and the
 * suite counts it as a failure.
 */
export function runVerb(id: string): boolean {
  const e = registry.get(id as VerbId)
  if (!e) return false
  try {
    e.fn()
  } catch {
    return false
  }
  runs += 1
  lastRun = id as VerbId
  return true
}

export function listVerbs(): VerbId[] {
  return [...registry.keys()]
}

export function verbRuns(): { runs: number; last: VerbId | null } {
  return { runs, last: lastRun }
}

/** Split `object/verb` into its halves; null for a malformed id. */
export function parseVerbId(id: string): { object: string; verb: string } | null {
  const i = id.indexOf('/')
  if (i <= 0 || i === id.length - 1) return null
  return { object: id.slice(0, i), verb: id.slice(i + 1) }
}

declare global {
  interface Window {
    __ploobiaVerbs?: {
      list: () => VerbId[]
      run: (id: string) => boolean
      runs: () => { runs: number; last: VerbId | null }
    }
  }
}

if (typeof window !== 'undefined') {
  window.__ploobiaVerbs = { list: listVerbs, run: runVerb, runs: verbRuns }
}
