/**
 * The world's save — W3, round 1 of persistence.
 *
 * A learner who reloads, closes the lid, or comes back tomorrow finds the
 * courtyard as they left it: the quest step, the fuels lit, the pipe fixed,
 * the furnace's curve, the whys answered, the journal and the stamp, and the
 * spot they stood on. Nothing transient is kept — nothing held, nothing on
 * the hook, no room open, the Lens down — and the welcome card offers the
 * choice: continue, or start over.
 *
 * The save is a SUBSET of the store, written through the shared `persist`
 * helper (memory fallback where storage is refused), throttled so a climbing
 * gauge does not thrash the disk, flushed on hide and on unmount. The only
 * live thing outside the store is the explorer's position, which the page
 * hands in as a getter so this file stays free of the scene.
 *
 * A save from an older build is untrusted: any shape surprise is a fresh
 * start, never a half-restored world.
 */

import { read, write, remove } from './persist'
import {
  currentStep,
  getWorld,
  resetWorld,
  seedClock,
  setWorld,
  worldStore,
  type Crane,
  type FuelId,
  type WorldState,
} from './archipelago'

export const SAVE_KEY = 'ploobia.world.v1'

/** A store write schedules a save this long later; writes in between do not push it. */
const SETTLE_MS = 700

type SavedKeys =
  | 'zone'
  | 'step'
  | 'fed'
  | 'hearths'
  | 'lit'
  | 'bellowsSeen'
  | 'pipeFixed'
  | 'furnace'
  | 'prediction'
  | 'poured'
  | 'pourSeen'
  | 'crossings'
  | 'time'
  | 'air'
  | 'curve'
  | 'whys'
  | 'journal'

/** Where the explorer stood and looked — the scene's, handed in and out by the page. */
export interface Spot {
  pos: [number, number, number]
  /** Explorer facing, radians about +Y. */
  facing: number
  /** Camera yaw and pitch, radians. */
  cam: [number, number]
}

export interface WorldSave {
  v: 1
  /** Wall-clock ms when written. */
  at: number
  /** Where the explorer stood; null if unknown. */
  pos: [number, number, number] | null
  /** Which way they faced and looked; absent in a save without it. */
  look?: { facing: number; cam: [number, number] }
  s: Pick<WorldState, SavedKeys> & { drops: Crane['drops'] }
}

const FUEL_IDS: FuelId[] = ['wetwood', 'drywood', 'charcoal']

/** Is there anything worth keeping yet? The quest begins at the Foundry gate. */
export function worthSaving(s: WorldState): boolean {
  return s.phase === 'play' && (s.zone === 'foundry' || s.crossings > 0)
}

export function snapshot(s: WorldState, spot: Spot | null): WorldSave {
  // A piece still in the air is not a measurement; only settled drops are kept.
  const drops: Crane['drops'] = {}
  for (const [id, d] of Object.entries(s.crane.drops)) if (d.t1 != null) drops[id] = d
  return {
    v: 1,
    at: Date.now(),
    // Through a door, the spot is the door's own; the cabinet's page never moves the explorer.
    pos: s.cabinet ? s.returnPos : (spot?.pos ?? null),
    look: spot ? { facing: spot.facing, cam: spot.cam } : undefined,
    s: {
      zone: s.zone,
      step: s.step,
      fed: s.fed,
      hearths: s.hearths,
      lit: s.lit,
      bellowsSeen: s.bellowsSeen,
      pipeFixed: s.pipeFixed,
      furnace: s.furnace,
      prediction: s.prediction,
      poured: s.poured,
      pourSeen: s.pourSeen,
      crossings: s.crossings,
      time: s.time,
      air: s.air,
      curve: s.curve,
      whys: s.whys,
      journal: s.journal,
      drops,
    },
  }
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isBool = (v: unknown): v is boolean => typeof v === 'boolean'
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')

/** Structural check of a parsed save. Anything odd is a fresh start. */
export function validSave(x: unknown): x is WorldSave {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  if (o.v !== 1 || !isNum(o.at)) return false
  if (o.pos != null && !(Array.isArray(o.pos) && o.pos.length === 3 && o.pos.every(isNum))) return false
  if (o.look != null) {
    const l = o.look as Record<string, unknown>
    if (typeof l !== 'object' || !isNum(l.facing) || !(Array.isArray(l.cam) && l.cam.length === 2 && l.cam.every(isNum))) return false
  }
  const s = o.s as Record<string, unknown> | undefined
  if (!s || typeof s !== 'object') return false
  if (s.zone !== 'landing' && s.zone !== 'foundry') return false
  if (typeof s.step !== 'string') return false
  if (!isStrArr(s.fed) || !isStrArr(s.lit)) return false
  const h = s.hearths as Record<string, unknown> | undefined
  if (!h || typeof h !== 'object' || !FUEL_IDS.every((f) => isNum(h[f]))) return false
  if (!s.lit.every((f) => (FUEL_IDS as string[]).includes(f))) return false
  if (!isBool(s.bellowsSeen) || !isBool(s.pipeFixed) || !isBool(s.poured) || !isBool(s.pourSeen)) return false
  const f = s.furnace as Record<string, unknown> | undefined
  if (!f || typeof f !== 'object' || !isBool(f.lit) || !isNum(f.temp)) return false
  if (f.fuel != null && !(FUEL_IDS as unknown[]).includes(f.fuel)) return false
  if (s.prediction != null && !isNum(s.prediction)) return false
  if (!isNum(s.crossings) || !isNum(s.time) || !isNum(s.air)) return false
  if (!Array.isArray(s.curve) || !s.curve.every((p) => Array.isArray(p) && p.length === 2 && p.every(isNum))) return false
  if (!Array.isArray(s.whys) || s.whys.length !== 3 || !s.whys.every(isNum)) return false
  const j = s.journal as Record<string, unknown> | undefined
  if (!j || typeof j !== 'object') return false
  for (const k of ['prediction', 'action', 'observed', 'explanation']) if (j[k] != null && typeof j[k] !== 'string') return false
  const d = s.drops as Record<string, unknown> | undefined
  if (!d || typeof d !== 'object') return false
  for (const v of Object.values(d)) {
    const dd = v as Record<string, unknown>
    if (!dd || !isNum(dd.from) || !isNum(dd.t0) || !isNum(dd.t1)) return false
  }
  return true
}

export function loadSave(): WorldSave | null {
  const raw = read<unknown>(SAVE_KEY, null)
  return validSave(raw) ? raw : null
}

export function clearSave(): void {
  remove(SAVE_KEY)
}

/**
 * Put a save into the store: a reset, then the kept subset, phase `welcome`
 * with `resumed` set so the card offers Continue. Returns where to stand and look.
 */
export function restoreWorld(save: WorldSave): Spot | null {
  resetWorld()
  const { drops, ...kept } = save.s
  const base = getWorld()
  setWorld({
    ...kept,
    phase: 'welcome',
    resumed: true,
    crane: { ...base.crane, drops: { ...drops } },
  })
  seedClock(kept.time, kept.furnace.lit, kept.curve)
  if (!save.pos) return null
  return { pos: save.pos, facing: save.look?.facing ?? Math.PI, cam: save.look?.cam ?? [Math.PI - 0.6, 0.42] }
}

/** A one-line account of a save for the welcome card. */
export function describeSave(s: WorldState): string {
  if (s.poured) return s.whys[2] >= 0 ? 'The furnace is relit and the stamp is yours.' : 'The furnace is relit — the whys are waiting.'
  return `Next: ${currentStep(s).label}.`
}

/**
 * Keep the save current while the world page is mounted. The first store
 * write after a save schedules the next one `SETTLE_MS` later — a throttle,
 * not a debounce, because a burning furnace writes the store eight times a
 * second and a debounce would never settle. Flushed on hide, and on the
 * returned cleanup (a door, or leaving the page).
 */
export function watchWorld(getSpot: () => Spot): () => void {
  let timer: number | null = null
  const flush = () => {
    if (timer != null) {
      window.clearTimeout(timer)
      timer = null
    }
    const s = getWorld()
    if (!worthSaving(s)) return
    write(SAVE_KEY, snapshot(s, getSpot()))
  }
  const schedule = () => {
    if (timer == null) timer = window.setTimeout(flush, SETTLE_MS)
  }
  const unsub = worldStore.subscribe(schedule)
  const onHide = () => {
    if (document.visibilityState === 'hidden') flush()
  }
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('pagehide', flush)
  // The explorer walks without writing the store; keep the spot fresh anyway.
  const walk = window.setInterval(() => {
    if (timer == null && worthSaving(getWorld())) flush()
  }, 5000)
  return () => {
    unsub()
    document.removeEventListener('visibilitychange', onHide)
    window.removeEventListener('pagehide', flush)
    window.clearInterval(walk)
    flush()
  }
}
