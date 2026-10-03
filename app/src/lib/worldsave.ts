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
  type StrapBeat,
  currentStep,
  getWorld,
  resetWorld,
  seedClock,
  setWorld,
  worldStore,
  type Crane,
  type FuelId,
  keepStageOf,
  type Supply,
  type WorldState,
} from './archipelago'
import { salvageKeep, seenWords, validKeep, type Keep } from './keep'
import { initialBench, initialCast, type Bench, type CastRecord, type Pour } from './supply'
import { HANGER_MAX, STRIPS, initialBend, runnerInTray, type Bend, type Reading } from './bend'

/**
 * v2 (S0): the plot rides in the save — the stage, the run in progress, the attempts. A v1 save is a fresh start.
 * S1 adds an OPTIONAL `keep` block without a version bump: a v2 save without it restores exactly as before.
 */
export const SAVE_KEY = 'ploobia.world.v2'

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
  | 'plot'

/** Where the explorer stood and looked — the scene's, handed in and out by the page. */
export interface Spot {
  pos: [number, number, number]
  /** Explorer facing, radians about +Y. */
  facing: number
  /** Camera yaw and pitch, radians. */
  cam: [number, number]
}

export interface WorldSave {
  v: 2
  /** Wall-clock ms when written. */
  at: number
  /** Where the explorer stood; null if unknown. */
  pos: [number, number, number] | null
  /** Which way they faced and looked; absent in a save without it. */
  look?: { facing: number; cam: [number, number] }
  s: Pick<WorldState, SavedKeys> & { drops: Crane['drops']; keep?: Keep | null; supply?: Supply | null; strap?: StrapBeat }
}

const FUEL_IDS: FuelId[] = ['wetwood', 'drywood', 'charcoal']

/** Is there anything worth keeping yet? The plot begins when Nara has been met; the furnace at the gate. */
export function worthSaving(s: WorldState): boolean {
  return s.phase === 'play' && (s.zone === 'foundry' || s.crossings > 0 || s.plot.met)
}

export function snapshot(s: WorldState, spot: Spot | null): WorldSave {
  // A piece still in the air is not a measurement; only settled drops are kept.
  const drops: Crane['drops'] = {}
  for (const [id, d] of Object.entries(s.crane.drops)) if (d.t1 != null) drops[id] = d
  return {
    v: 2,
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
      // The run is a plain object (the bed's numbers, the days); the ticker's in-place
      // mutation is on the live copy, so a save mid-day carries the day so far.
      plot: s.plot,
      drops,
      // S1: the handoff, its dispatches, the beds' scientific state, lots and reports. Settled
      // results are stored whole, so a reload replays the report and never re-runs a fortnight.
      keep: s.keep,
      supply: s.supply,
      // S2 round A3: the strap on the bench by the gate. Optional: a save without it has not seen the strap.
      strap: s.strap,
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
  if (o.v !== 2 || !isNum(o.at)) return false
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
  if (!validPlot(s.plot)) return false
  // `keep` is not checked here: a bad keep block is salvaged on restore, never a reason to lose the world.
  return true
}

const PLOT_STAGES = ['arrive', 'met', 'first', 'second', 'method', 'pause', 'record', 'page', 'reward', 'done']

function validRun(x: unknown): boolean {
  if (x == null) return true
  const r = x as Record<string, unknown>
  if (typeof r !== 'object') return false
  if (r.bed !== 'first' && r.bed !== 'second') return false
  if (!isNum(r.seed) || !isNum(r.length) || !isNum(r.attempt) || !isNum(r.day) || !isNum(r.hour) || !isNum(r.acc)) return false
  if (!['dawn', 'running', 'done', 'dead'].includes(r.phase as string)) return false
  if (!Array.isArray(r.days) || !Array.isArray(r.said) || !r.said.every(isNum)) return false
  const b = r.b as Record<string, unknown> | undefined
  if (!b || typeof b !== 'object' || b.texture !== 'clay') return false
  for (const k of ['theta', 'pond', 'o2', 'anox', 'health', 'firm', 'drained', 'spilled', 'taken', 'arrived', 'minFirm', 'pool', 'leached']) if (!isNum(b[k])) return false
  const t = r.today as Record<string, unknown> | undefined
  if (!t || typeof t !== 'object' || !isNum(t.day) || !isBool(t.probed) || typeof t.word !== 'string') return false
  return true
}

/** The plot's shape, loosely: the stage, the flags, the runs. Anything odd is a fresh start. */
function validPlot(x: unknown): boolean {
  if (!x || typeof x !== 'object') return false
  const p = x as Record<string, unknown>
  if (!PLOT_STAGES.includes(p.stage as string) || typeof p.step !== 'string') return false
  if (p.name != null && typeof p.name !== 'string') return false
  for (const k of ['naming', 'met', 'lensSeen', 'stood', 'dryRead', 'rescuedFirst', 'rescuedSecond', 'taught', 'recorded', 'pageRead', 'planted', 'sent']) if (!isBool(p[k])) return false
  if (!isNum(p.probes) || !isNum(p.why) || !isNum(p.seed)) return false
  if (p.whyText != null && typeof p.whyText !== 'string') return false
  if (p.competence != null && p.competence !== 'runs' && p.competence !== 'copies') return false
  if (!Array.isArray(p.attempts)) return false
  if (!validRun(p.run) || !validRun(p.first)) return false
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
  const { drops, keep: rawKeep, supply: rawSupply, strap: rawStrap, ...kept } = save.s
  const base = getWorld()
  // A save taken mid-pause resumes at the record; a naming card is never saved open.
  const plot = { ...kept.plot, naming: false, stage: kept.plot.stage === 'pause' ? ('record' as const) : kept.plot.stage }
  setWorld({
    ...kept,
    plot,
    keep: restoreKeep(rawKeep, plot),
    supply: restoreSupply(rawSupply),
    strap: rawStrap === 'shown' || rawStrap === 'taken' ? rawStrap : 'unseen',
    phase: 'welcome',
    resumed: true,
    crane: { ...base.crane, drops: { ...drops } },
  })
  seedClock(kept.time, kept.furnace.lit, kept.curve)
  if (!save.pos) return null
  return { pos: save.pos, facing: save.look?.facing ?? Math.PI, cam: save.look?.cam ?? [Math.PI - 0.6, 0.42] }
}

const BENCH_PHASES = new Set(['idle', 'pattern', 'marked', 'matching', 'balancing', 'charged'])

/**
 * S2's block as saved: the bench when its shape holds, else a fresh bench —
 * a bad block is never a reason to lose the world. No block → none.
 */
export function restoreSupply(raw: unknown): Supply | null {
  if (raw == null || typeof raw !== 'object') return null
  const r = raw as { bench?: unknown; cast?: unknown; pouredAt?: unknown; bend?: unknown }
  const b = r.bench
  const x = (b && typeof b === 'object' ? b : {}) as Partial<Bench>
  const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((i) => typeof i === 'string')
  const count = (v: unknown): boolean => v == null || (typeof v === 'number' && v >= 0)
  const ok =
    typeof x.phase === 'string' && BENCH_PHASES.has(x.phase) && strings(x.inJug) && strings(x.inspected) &&
    typeof x.patternIn === 'boolean' && typeof x.marked === 'boolean' && typeof x.dry === 'number' && x.dry >= 0 &&
    typeof x.runner === 'boolean' && typeof x.sentUnlevel === 'boolean' &&
    (x.matched == null || typeof x.matched === 'number') && (x.charge == null || typeof x.charge === 'number') &&
    count(x.recasts) && count(x.castDry)
  // An A1 save has no `recasts`/`castDry` and no cast block: the bench comes back whole, the record starts empty.
  const read = ok ? { ...initialBench(), ...(x as Bench), recasts: x.recasts ?? 0, castDry: x.castDry ?? 0 } : initialBench()
  // The record is read even beside an unreadable bench: a kit on it is still the one kit.
  const cast = restoreCast(r.cast, read)
  // A record that cannot be read starts again — and the bench's count of returns with it, or the next pours would
  // be taken for ones already answered.
  const bench = cast ? read : { ...read, recasts: 0, castDry: 0 }
  const record = cast ?? initialCast()
  return { bench, cast: record, pouredAt: cast && cast.pours.length > 0 && isNum(r.pouredAt) ? r.pouredAt : null, bend: restoreBend(r.bend, record), drawnAt: null }
}

/**
 * The vice as saved (round A3): whole when every field reads true and it fits the record it came with. An A2 save has
 * no block: a new vice. A strip cut with no pour on record is nobody's strip; a pick with no test done, or an answer
 * with no pick, is dropped rather than believed.
 */
export function restoreBend(raw: unknown, cast: CastRecord): Bend {
  if (raw == null || typeof raw !== 'object') return initialBend()
  const v = raw as Partial<Bend>
  const whole = (n: unknown, lo: number, hi: number): n is number => isNum(n) && Number.isInteger(n) && n >= lo && n <= hi
  const guessOk = v.guess == null || v.guess === 'unsure' || STRIPS.some((st) => st.id === v.guess)
  const readings = v.readings as Record<string, Partial<Reading>> | undefined
  const readingsOk =
    !!readings && typeof readings === 'object' &&
    STRIPS.every((st) => {
      const r = readings[st.id]
      if (!r || !whole(r.back, 0, st.givesAt - 1)) return false
      return r.gaveAt == null || (whole(r.gaveAt, st.givesAt, HANGER_MAX) && r.gaveAt > r.back)
    })
  const ok =
    isBool(v.cut) && guessOk && whole(v.load, 0, HANGER_MAX) && isBool(v.on) && readingsOk && whole(v.sets, 1, 999) && isBool(v.done) &&
    (v.pick == null || v.pick === 'brace' || v.pick === 'strap') && whole(v.why, -1, 2) && (v.whyText == null || typeof v.whyText === 'string')
  if (!ok || !v.cut || !runnerInTray(cast)) return initialBend()
  const b = v as Bend
  const loaded = b.guess != null && b.load > 0
  const pick = b.done ? (b.pick ?? null) : null
  const why = pick ? b.why : -1
  return {
    cut: true,
    guess: b.guess ?? null,
    load: b.guess != null ? b.load : 0,
    on: loaded && b.on,
    readings: Object.fromEntries(STRIPS.map((st) => [st.id, { back: b.readings[st.id].back, gaveAt: b.readings[st.id].gaveAt ?? null }])) as Bend['readings'],
    sets: b.sets,
    done: b.done,
    pick,
    why,
    whyText: why >= 0 ? (b.whyText ?? null) : null,
  }
}

/** The mould's record as saved, when every pour reads true and it fits the bench it came with; else null (the record starts again). */
function restoreCast(raw: unknown, bench: Bench): CastRecord | null {
  if (raw == null || typeof raw !== 'object') return null
  const c = raw as Partial<CastRecord>
  if (!Array.isArray(c.pours) || !isNum(c.why) || c.why < -1 || c.why > 2 || !(c.whyText == null || typeof c.whyText === 'string')) return null
  const pourOk = (p: unknown): p is Pour => {
    if (!p || typeof p !== 'object') return false
    const q = p as Partial<Pour>
    return isNum(q.dry) && q.dry > 0 && isNum(q.chargeG) && isNum(q.fraction) && q.fraction >= 0 && q.fraction <= 1 && isBool(q.short) && isBool(q.pinSeatMissing) && isNum(q.spareG) && isBool(q.guess)
  }
  if (!c.pours.every(pourOk)) return null
  // Every return to the bench answers one short pour: a record that disagrees with its bench is not this bench's record.
  const full = c.pours.filter((p) => !p.short).length
  if (full > 1 || (full === 1 && c.pours[c.pours.length - 1].short)) return null
  if (full === 0 && c.pours.length !== bench.recasts + (bench.phase === 'charged' && c.pours.length > bench.recasts ? 1 : 0)) return null
  return { pours: c.pours, why: c.why, whyText: c.whyText ?? null }
}

/**
 * The keep as saved: whole when it validates; otherwise what validates, with
 * the story award treated as given if it cannot be read (lib/keep.ts
 * `salvageKeep`). No keep, or no S0 beds to fall back on → none.
 */
export function restoreKeep(raw: unknown, plot: WorldState['plot']): Keep | null {
  if (raw == null) return null
  if (validKeep(raw)) return raw
  if (!plot.first || plot.run?.bed !== 'second') return null
  return salvageKeep(raw, { nara: plot.first.b, far: plot.run.b, farSeen: seenWords(plot.run) })
}

/** A one-line account of a save for the welcome card. */
export function describeSave(s: WorldState): string {
  const ks = keepStageOf(s)
  if (ks === 'away') return 'A fortnight is running at the Landing. It settles when you cross back.'
  if (ks === 'report') return "Nara's report is waiting at the Landing."
  if (s.poured) return s.whys[2] >= 0 ? 'The furnace is relit and the stamp is yours.' : 'The furnace is relit — the whys are waiting.'
  const run = s.plot.run
  if (s.zone === 'landing' && !s.plot.sent && run && (s.plot.stage === 'first' || s.plot.stage === 'second') && run.phase !== 'done' && run.phase !== 'dead') {
    return `Day ${run.day} of ${run.length} on ${run.bed === 'first' ? "Nara's bed" : 'the far bed'} · ${currentStep(s).label}.`
  }
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
