/**
 * The Archipelago — world state, the relight quest, and the furnace model.
 *
 * This is round W0 of the world branch: the store the scene composes from,
 * the quest as DATA (steps with a verb, a target and a predicate), and the one
 * pure model the slice needs (a furnace whose ceiling is set by fuel and air).
 *
 * Two rules from the world bible are enforced here and nowhere else:
 *
 *  • Rapier is the physical world; this file is the science. Nothing in here
 *    moves a block, and nothing in the scene computes a temperature.
 *  • Quest predicates READ state. They never set it.
 *
 * The store is Zustand (vanilla store + `useStore`), decided 2026-09-17 for
 * the world branch because quest, tool, Lens, zone, player, inventory and
 * evidence state arrive together and a pile of module stores would not hold.
 * No browser storage; the `persist` layer is a later round.
 *
 * PREVIZ VALUES: the fuel ceilings below are placeholders at the right order
 * of magnitude for a forced-draught hearth. They are marked `verified: false`
 * and must be checked against a source before round W3 puts them on a
 * learner's gauge with any claim to truth (house rule: never invent a number).
 */

import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

/* ----------------------------------------------------------------------------
 * Zones and rings
 * ------------------------------------------------------------------------- */

export type ZoneId = 'landing' | 'foundry'
export type LensRing = 'world' | 'system'

/* ----------------------------------------------------------------------------
 * Fuel and the furnace model
 * ------------------------------------------------------------------------- */

export type FuelId = 'wetwood' | 'drywood' | 'charcoal'

export interface Fuel {
  id: FuelId
  name: string
  /** Steady-state ceiling with a working draught, °C. PREVIZ — see header. */
  peak: number
  /** How fast a hearth of it climbs, °C per second at full draught. */
  climb: number
  verified: boolean
}

/**
 * Wet wood / dry wood / charcoal (Selorm, 2026-09-17): the contrast a learner
 * can feel — water in the wood eats the heat; charcoal is the higher-energy,
 * lower-moisture fuel. Coke arrives when metallurgy itself is the lesson.
 * The misconception the round is built to catch: the wet wood is HEAVIER, so
 * why less useful heat? Mass ≠ useful fuel energy.
 */
export const FUELS: Record<FuelId, Fuel> = {
  wetwood: { id: 'wetwood', name: 'Wet wood', peak: 550, climb: 60, verified: false },
  drywood: { id: 'drywood', name: 'Dry wood', peak: 900, climb: 110, verified: false },
  charcoal: { id: 'charcoal', name: 'Charcoal', peak: 1180, climb: 150, verified: false },
}

export const FUEL_ORDER: FuelId[] = ['wetwood', 'drywood', 'charcoal']

/** Copper melts at 1084.6 °C (CRC Handbook). The gauge shows the round figure. */
export const COPPER_MELT_C = 1085
export const HANDIN_TOLERANCE_C = 40

/**
 * Where a hearth's temperature is heading: the fuel's ceiling scaled by the
 * draught it actually gets. A furnace with a split bellows pipe still burns —
 * it just never gets hot, which is the whole lesson of board 5.
 */
export function ceilingFor(fuel: FuelId, draught: number): number {
  const f = FUELS[fuel]
  return 20 + (f.peak - 20) * clamp01(draught)
}

/** One tick of a hearth toward its ceiling. Pure. */
export function stepTemp(temp: number, fuel: FuelId, draught: number, dt: number): number {
  const target = ceilingFor(fuel, draught)
  const rate = FUELS[fuel].climb * (0.35 + 0.65 * clamp01(draught))
  if (temp < target) return Math.min(target, temp + rate * dt)
  return Math.max(target, temp - rate * 0.5 * dt)
}

/**
 * The draught the furnace gets: the bellows stroke, through a pipe that leaks
 * most of it while split. A furnace never gets NO air — the mouth breathes —
 * so the floor is a whisper, not zero.
 */
export function draughtFor(pipeFixed: boolean, air = 1): number {
  const a = 0.08 + 0.92 * clamp01(air)
  return pipeFixed ? a : a * 0.32
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

/* ----------------------------------------------------------------------------
 * State
 * ------------------------------------------------------------------------- */

export type StepId = 'arrive' | 'clear' | 'probe' | 'lens' | 'build' | 'feed' | 'done'

/** A room is a cabinet interior entered from the world by a camera cut — same React tree, no reload. */
export type RoomId = 'none' | 'furnace'

/**
 * The crane — the way the heavy piece is cleared, and board 1's bet: drop a
 * heavy piece and a light one from the same height and time the falls.
 */
export interface Drop {
  /** Hook height at release, metres above the yard. */
  from: number
  t0: number
  /** Sim time it came to rest; null while falling. */
  t1: number | null
}
export interface Crane {
  /** The explorer is at the controls; keys drive the crane, not the walk. */
  active: boolean
  /** Boom yaw, radians. */
  yaw: number
  /** Hook height, metres. */
  hookY: number
  /** The piece on the hook, if any. */
  holding: string | null
  /** Every drop from the hook, by piece id — the last one wins. */
  drops: Record<string, Drop>
}

/** One point of the temperature-against-time record, for the Investigator's curve. */
export type CurvePoint = [t: number, temp: number]

/** The four-line record a stamp needs. Null lines are not yet earned. */
export interface Journal {
  prediction: string | null
  action: string | null
  observed: string | null
  explanation: string | null
}

export interface WorldState {
  zone: ZoneId
  ring: LensRing
  phase: 'welcome' | 'play'
  step: StepId
  /** The id of the block in hand, if any. */
  held: string | null
  /** Ids of copper scrap the conveyor has carried into the furnace mouth. */
  fed: string[]
  /** Hearth temperatures by fuel, °C. */
  hearths: Record<FuelId, number>
  /** Which hearths have been lit with the probe. */
  lit: FuelId[]
  /** The learner has raised the Lens to the System ring inside the Foundry. */
  bellowsSeen: boolean
  pipeFixed: boolean
  furnace: { lit: boolean; fuel: FuelId | null; temp: number }
  /** The number typed at the brief; null until committed. */
  prediction: number | null
  /** The id of the interactable within reach, if any. */
  near: string | null
  /** Set once at the pour; the celebration beat and the island light. */
  poured: boolean
  /** How the learner arrived at the courtyard: a count of portal crossings. */
  crossings: number
  /** Explicit simulation time, seconds. Wall-clocked and clamped in the ticker. */
  time: number
  room: RoomId
  /** Bellows stroke 0..1, set in the furnace room. Reaches the fire only through a whole pipe. */
  air: number
  crane: Crane
  /** Furnace temperature against time since it was lit, sampled ~2 Hz. */
  curve: CurvePoint[]
  /** Answers to the three whys, by index; -1 = not yet answered. */
  whys: number[]
  journal: Journal
}

const initial = (): WorldState => ({
  zone: 'landing',
  ring: 'world',
  phase: 'welcome',
  step: 'arrive',
  held: null,
  fed: [],
  hearths: { wetwood: 20, drywood: 20, charcoal: 20 },
  lit: [],
  bellowsSeen: false,
  pipeFixed: false,
  furnace: { lit: false, fuel: null, temp: 20 },
  prediction: null,
  near: null,
  poured: false,
  crossings: 0,
  time: 0,
  room: 'none',
  air: 0,
  crane: { active: false, yaw: 0.2, hookY: 3.2, holding: null, drops: {} },
  curve: [],
  whys: [-1, -1, -1],
  journal: { prediction: null, action: null, observed: null, explanation: null },
})

export const worldStore = createStore<WorldState>(initial)

export function getWorld(): WorldState {
  return worldStore.getState()
}

export function setWorld(patch: Partial<WorldState> | ((s: WorldState) => Partial<WorldState>)): void {
  worldStore.setState(patch)
}

export function resetWorld(): void {
  worldStore.setState(initial(), true)
  simTime = 0
  sinceFlush = 0
  pendingHearths = null
  pendingFurnace = 20
  wroteHearths = null
  wroteFurnace = null
  litAt = null
}

export function useWorld(): WorldState {
  return useStore(worldStore)
}

/* ----------------------------------------------------------------------------
 * Interactables — what the scene registers so the explorer can find it
 *
 * The scene owns positions (Rapier owns the moving ones); the store owns the
 * list. `near` is decided once per frame by the explorer from this map.
 * ------------------------------------------------------------------------- */

export type Verb = 'grab' | 'probe' | 'build' | 'feed' | 'portal' | 'talk' | 'crane'

export interface Interactable {
  id: string
  verb: Verb
  label: string
  /** World position; scenes update it for moving bodies. */
  pos: [number, number, number]
  radius: number
  /** For grabbables: mass in kg, from the body. Above CARRY_KG needs the crane. */
  mass?: number
}

export const CARRY_KG = 40

export const interactables = new Map<string, Interactable>()

export function registerInteractable(i: Interactable): () => void {
  interactables.set(i.id, i)
  return () => {
    interactables.delete(i.id)
  }
}

/** The one thing the explorer can act on: nearest registered target in reach. */
export function nearestInteractable(x: number, z: number): Interactable | null {
  let best: Interactable | null = null
  let bestD = Infinity
  for (const it of interactables.values()) {
    const dx = it.pos[0] - x
    const dz = it.pos[2] - z
    const d = Math.hypot(dx, dz)
    if (d <= it.radius && d < bestD) {
      best = it
      bestD = d
    }
  }
  return best
}

/* ----------------------------------------------------------------------------
 * The quest — data, with predicates that read the store
 * ------------------------------------------------------------------------- */

/**
 * Predicates are typed DATA, never expressions (Selorm, 2026-09-17: "don't
 * eventually eval() these"). `source` is a dotted path into WorldState; a
 * `count` reads an array's length. This is what a World Builder will emit and
 * what a curriculum author can read.
 */
export type Predicate =
  | { type: 'state'; source: string; equals: string | number | boolean }
  | { type: 'threshold'; source: string; op: '>=' | '<=' | '>' | '<'; value: number }
  | { type: 'count'; source: string; op: '>=' | '<=' | '>' | '<'; value: number }
  | { type: 'never' }

export interface QuestStep {
  id: StepId
  /** The checklist line — what the learner reads as the job. */
  label: string
  /** The coach line: the single next action, in Ploob's words. */
  coach: string
  /** Which interactable id (or `prefix.`) the marker should point at. */
  target: string | null
  until: Predicate
}

export interface Quest {
  id: string
  title: string
  hook: string
  predict: { ask: string; unit: string }
  steps: QuestStep[]
  /** The three whys, growing — asked after the hand-in, never during. */
  whys: [string, string, string]
}

function readPath(s: WorldState, path: string): unknown {
  let cur: unknown = s
  for (const k of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[k]
  }
  return cur
}

function compare(a: number, op: '>=' | '<=' | '>' | '<', b: number): boolean {
  switch (op) {
    case '>=':
      return a >= b
    case '<=':
      return a <= b
    case '>':
      return a > b
    case '<':
      return a < b
  }
}

export function evalPredicate(p: Predicate, s: WorldState): boolean {
  switch (p.type) {
    case 'state':
      return readPath(s, p.source) === p.equals
    case 'threshold': {
      const v = readPath(s, p.source)
      return typeof v === 'number' && compare(v, p.op, p.value)
    }
    case 'count': {
      const v = readPath(s, p.source)
      return Array.isArray(v) && compare(v.length, p.op, p.value)
    }
    case 'never':
      return false
  }
}

export const RELIGHT: Quest = {
  id: 'foundry.relight',
  title: 'Relight the furnace',
  hook: 'The furnace went cold in the night and the Landing is dark. Find out why.',
  predict: { ask: 'How hot must the furnace get to melt copper?', unit: '°C' },
  steps: [
    {
      id: 'arrive',
      label: 'Get to the Foundry',
      coach: 'The Foundry is across the water. Walk into the gate.',
      target: 'portal.foundry',
      until: { type: 'state', source: 'zone', equals: 'foundry' },
    },
    {
      id: 'clear',
      label: 'Clear the conveyor jam',
      coach: 'Copper has fallen off the belt. Pick a piece up and put it back on.',
      target: 'scrap.',
      until: { type: 'count', source: 'fed', op: '>=', value: 2 },
    },
    {
      id: 'probe',
      label: 'Test the fuels',
      coach: 'It is fed and still cold. Light each test hearth and read the gauge.',
      target: 'hearth.',
      until: { type: 'count', source: 'lit', op: '>=', value: 3 },
    },
    {
      id: 'lens',
      label: 'Find why the air isn\'t flowing',
      coach: 'Charcoal burns hottest — so why is the furnace cold? Raise the Lens by the furnace.',
      target: 'feed.furnace',
      until: { type: 'state', source: 'bellowsSeen', equals: true },
    },
    {
      id: 'build',
      label: 'Fix the bellows pipe',
      coach: 'The air stops at the split pipe. Fix it.',
      target: 'build.pipe',
      until: { type: 'state', source: 'pipeFixed', equals: true },
    },
    {
      id: 'feed',
      label: 'Reach 1085 °C and pour',
      coach: 'Air runs. Feed the furnace and watch the gauge.',
      target: 'feed.furnace',
      until: { type: 'state', source: 'poured', equals: true },
    },
    {
      id: 'done',
      label: 'Look across the water',
      coach: 'The pour. Look across the water.',
      target: null,
      until: { type: 'never' },
    },
  ],
  whys: [
    'What happened when the air ran again?',
    'The wet wood was heavier than the charcoal. Why did the furnace get less useful heat from it?',
    'Three days later the foreman asks for bronze. What would you add, and why would you need the bench?',
  ],
}

export function currentStep(s: WorldState): QuestStep {
  return RELIGHT.steps.find((st) => st.id === s.step) ?? RELIGHT.steps[0]
}

/**
 * Advance the quest as far as the state allows. Called by the ticker once per
 * frame; a step that is already satisfied is skipped, so a learner who fixes
 * the pipe before probing is not sent back to probe.
 */
export function advanceQuest(): void {
  const state = getWorld()
  let i = RELIGHT.steps.findIndex((st) => st.id === state.step)
  let changed = false
  while (i < RELIGHT.steps.length - 1 && evalPredicate(RELIGHT.steps[i].until, state)) {
    i++
    changed = true
  }
  if (changed) setWorld({ step: RELIGHT.steps[i].id })
}

/* ----------------------------------------------------------------------------
 * The ticker — explicit sim time; the only place temperatures change
 * ------------------------------------------------------------------------- */

const MAX_DT = 0.25
/** Store writes for a climbing temperature are throttled to this cadence. */
const FLUSH_EVERY = 0.12

let simTime = 0
let sinceFlush = 0
/** Sim time the furnace was lit; the curve's zero. */
let litAt: number | null = null
let pendingHearths: Record<FuelId, number> | null = null
let pendingFurnace = 20
/** What the ticker last wrote; a store value that differs was written by someone else. */
let wroteHearths: Record<FuelId, number> | null = null
let wroteFurnace: number | null = null

/** Explicit simulation time, seconds — wall-clocked, clamped, never a frame count. */
export function getSimTime(): number {
  return simTime
}

export function tickWorld(dtRaw: number): void {
  const dt = Math.min(MAX_DT, Math.max(0, dtRaw))
  simTime += dt
  sinceFlush += dt
  const s = getWorld()

  // Integrate into pending values every frame; write to the store at a
  // cadence, because every subscriber re-renders on a write and a number
  // climbing sixty times a second is not sixty pictures anyone can see.
  // Someone else (a restore, a suite) wrote the store since the last flush:
  // their values win over the ticker's pending ones.
  if (wroteHearths !== s.hearths) pendingHearths = null
  if (wroteFurnace !== s.furnace.temp) pendingFurnace = s.furnace.temp
  const hearths = pendingHearths ?? { ...s.hearths }
  let hot = false
  for (const f of s.lit) {
    hearths[f] = stepTemp(hearths[f], f, 1, dt)
    hot = true
  }
  pendingHearths = hearths
  let furnaceTemp = pendingFurnace
  if (s.furnace.lit && s.furnace.fuel) {
    furnaceTemp = stepTemp(furnaceTemp, s.furnace.fuel, draughtFor(s.pipeFixed, s.air), dt)
    hot = true
  }
  pendingFurnace = furnaceTemp

  const poured = s.poured || (s.furnace.lit && furnaceTemp >= COPPER_MELT_C - HANDIN_TOLERANCE_C)
  if (hot && (sinceFlush >= FLUSH_EVERY || poured !== s.poured)) {
    sinceFlush = 0
    // The curve: one point every ~0.5 s of the furnace's life, from lighting.
    let curve = s.curve
    if (s.furnace.lit && litAt != null) {
      const t = simTime - litAt
      const last = curve[curve.length - 1]
      if (!last || t - last[0] >= 0.5) curve = [...curve, [Math.round(t * 10) / 10, Math.round(furnaceTemp)]]
    }
    // Observed is earned by observing: the reading at the pour, in the
    // learner's own numbers — not by answering a question afterwards.
    const journal =
      poured && !s.poured && s.furnace.fuel
        ? { ...s.journal, observed: s.journal.observed ?? `Watched the gauge climb to ${Math.round(furnaceTemp)} °C on ${FUELS[s.furnace.fuel].name.toLowerCase()} and the copper go.` }
        : s.journal
    const nextHearths = { ...hearths }
    const nextFurnace = furnaceTemp !== s.furnace.temp ? { ...s.furnace, temp: furnaceTemp } : s.furnace
    wroteHearths = nextHearths
    wroteFurnace = nextFurnace.temp
    setWorld({ hearths: nextHearths, furnace: nextFurnace, poured, curve, journal, time: simTime })
  }
  advanceQuest()
}

/* ----------------------------------------------------------------------------
 * Verbs the HUD and the explorer call
 * ------------------------------------------------------------------------- */

export function crossPortal(to: ZoneId): void {
  setWorld((s) => ({ zone: to, ring: 'world', held: null, near: null, crossings: s.crossings + 1 }))
}

export function lightHearth(fuel: FuelId): void {
  setWorld((s) => (s.lit.includes(fuel) ? {} : { lit: [...s.lit, fuel] }))
}

export function toggleLens(): void {
  setWorld((s) => {
    const ring: LensRing = s.ring === 'world' ? 'system' : 'world'
    return { ring, bellowsSeen: s.bellowsSeen || (ring === 'system' && s.zone === 'foundry') }
  })
}

export function fixPipe(): void {
  setWorld({ pipeFixed: true })
}

export function feedFurnace(fuel: FuelId): void {
  if (litAt == null) litAt = simTime
  setWorld((s) => ({
    furnace: { lit: true, fuel, temp: Math.max(s.furnace.temp, 20) },
    journal: { ...s.journal, action: s.journal.action ?? `Fed the furnace ${FUELS[fuel].name.toLowerCase()} with the pipe ${s.pipeFixed ? 'whole' : 'split'}.` },
  }))
}

export function setAir(air: number): void {
  setWorld({ air: Math.max(0, Math.min(1, air)) })
}

export function enterRoom(room: RoomId): void {
  setWorld({ room, held: null })
}

export function leaveRoom(): void {
  setWorld({ room: 'none' })
}

export function commitPrediction(n: number): void {
  setWorld({ prediction: n, journal: { ...getWorld().journal, prediction: `Said the furnace must reach ${n} °C to melt copper.` } })
}

export const CRANE = {
  /** Mast foot, courtyard coordinates. */
  mast: [-10.5, 0, -10.5] as [number, number, number],
  boomY: 5.6,
  reach: 4.5,
  yawMin: -0.35,
  yawMax: 1.5,
  hookMin: 0.55,
  hookMax: 4.6,
  yawRate: 0.9,
  hookRate: 1.6,
  /** How close the hook must be to a piece to take it. */
  grab: 0.9,
}

export function craneTip(yaw: number): [number, number] {
  return [CRANE.mast[0] + Math.sin(yaw) * CRANE.reach, CRANE.mast[2] + Math.cos(yaw) * CRANE.reach]
}

export function craneEnter(): void {
  setWorld((s) => ({ crane: { ...s.crane, active: true }, held: null }))
}

export function craneLeave(): void {
  setWorld((s) => ({ crane: { ...s.crane, active: false } }))
}

/** Drive the crane by the stick: x rotates, y raises. Called per frame. */
export function craneDrive(x: number, y: number, dt: number): void {
  const s = getWorld()
  if (!s.crane.active) return
  const yaw = Math.max(CRANE.yawMin, Math.min(CRANE.yawMax, s.crane.yaw + x * CRANE.yawRate * dt))
  const hookY = Math.max(CRANE.hookMin, Math.min(CRANE.hookMax, s.crane.hookY + y * CRANE.hookRate * dt))
  if (yaw !== s.crane.yaw || hookY !== s.crane.hookY) worldStore.setState({ crane: { ...s.crane, yaw, hookY } })
}

export function craneTake(id: string): void {
  setWorld((s) => ({ crane: { ...s.crane, holding: id } }))
}

/** Release: the drop starts here — height and time are the record. */
export function craneRelease(): void {
  setWorld((s) => {
    const id = s.crane.holding
    if (!id) return {}
    return { crane: { ...s.crane, holding: null, drops: { ...s.crane.drops, [id]: { from: s.crane.hookY, t0: simTime, t1: null } } } }
  })
}

export function noteLanding(id: string): void {
  setWorld((s) => {
    const d = s.crane.drops[id]
    if (!d || d.t1 != null) return {}
    return { crane: { ...s.crane, drops: { ...s.crane.drops, [id]: { ...d, t1: simTime } } } }
  })
}

/** The bet's evidence: a heavy and a light piece dropped from about the same height, both timed. */
export function fallTimes(s: WorldState): { heavy: number; light: number; from: number } | null {
  const h = s.crane.drops['scrap.heavy']
  const light = Object.entries(s.crane.drops).find(([id, d]) => id !== 'scrap.heavy' && d.t1 != null)?.[1]
  if (!h || h.t1 == null || !light || light.t1 == null) return null
  if (Math.abs(h.from - light.from) > 0.6) return null
  return { heavy: h.t1 - h.t0, light: light.t1 - light.t0, from: (h.from + light.from) / 2 }
}

export function answerWhy(index: number, choice: number): void {
  setWorld((s) => {
    const whys = [...s.whys]
    whys[index] = choice
    const right = WHYS[index].options[choice]?.right
    const journal = { ...s.journal }
    if (index === 1 && right) journal.explanation = journal.explanation ?? WHYS[1].options[choice].line
    return { whys, journal }
  })
}

/**
 * A why answered in the learner's own words, judged. `verdict` is what the
 * judge decided; the journal keeps the LEARNER's sentence when it was right —
 * their words, not the option's. A misconception maps onto the option that
 * names it so Ploob's reasoned line is the same one the written choice gets.
 */
export function answerWhyText(index: number, text: string, verdict: 'right' | 'partial' | 'misconception' | 'off', misconception: string | null): void {
  setWorld((s) => {
    const why = WHYS[index]
    const whys = [...s.whys]
    const journal = { ...s.journal }
    if (verdict === 'right') {
      whys[index] = why.options.findIndex((o) => o.right)
      if (index === 1) journal.explanation = journal.explanation ?? text.trim()
    } else if (verdict === 'misconception') {
      const i = why.options.findIndex((o) => o.key === misconception)
      whys[index] = i >= 0 ? i : whys[index]
    }
    return { whys, journal }
  })
}

/** What the learner could have seen: the facts a judge is allowed to weigh. */
export function whyFacts(s: WorldState): Record<string, string | number | boolean> {
  return {
    fuels_tested: FUEL_ORDER.filter((f) => s.lit.includes(f)).map((f) => `${FUELS[f].name} reached ${Math.round(s.hearths[f])} °C`).join('; '),
    fuel_fed: s.furnace.fuel ? FUELS[s.furnace.fuel].name : 'none',
    pipe: s.pipeFixed ? 'the bellows pipe was fixed before the pour' : 'the bellows pipe was still split',
    bellows_stroke_percent: Math.round(s.air * 100),
    furnace_reading_c: Math.round(s.furnace.temp),
    copper_melts_c: COPPER_MELT_C,
    prediction_c: s.prediction ?? 'none',
  }
}

export function stampReady(j: Journal): boolean {
  return !!(j.prediction && j.action && j.observed && j.explanation)
}

/* ----------------------------------------------------------------------------
 * The three whys — growing, with distractors that test the model
 * ------------------------------------------------------------------------- */

export interface WhyOption {
  /** Stable key: 'right' for the explanation, a misconception name otherwise. The judge answers in these. */
  key: string
  text: string
  right: boolean
  /** What Ploob says back — a line that reasons, never a buzzer. */
  line: string
}

export interface Why {
  ask: string
  options: WhyOption[]
}

export const WHYS: Why[] = [
  {
    ask: 'What happened when the pipe was whole again?',
    options: [
      { key: 'right', text: 'More air reached the fire and it burned hotter.', right: true, line: 'More air, more of the charcoal burning at once — and the heat went where the copper was.' },
      { key: 'fuel_changed', text: 'The fuel became better fuel.', right: false, line: 'Same charcoal, same pile. Nothing about the fuel changed — something about what reached it did.' },
      { key: 'copper_changed', text: 'The copper got easier to melt.', right: false, line: 'Copper melts at the same temperature whatever the weather. The furnace changed, not the copper.' },
    ],
  },
  {
    ask: 'The wet wood was heavier than the charcoal. Why did the furnace get less useful heat from it?',
    options: [
      { key: 'mass_burns_slower', text: 'Heavy things burn slower.', right: false, line: 'Weight is not the reason — a heavy log of dry wood burns fine. What is the wet wood heavy WITH?' },
      { key: 'right', text: 'Much of its weight was water, and boiling that water off ate the heat first.', right: true, line: 'That is it. Mass is not fuel. The water had to leave as steam before the wood could give heat to anything.' },
      { key: 'no_carbon', text: 'Wet wood has no carbon in it.', right: false, line: 'It has as much carbon as dry wood — it is the same wood. Something else in it takes heat away.' },
    ],
  },
  {
    ask: 'Three days later the foreman asks for bronze bells. What would you need that this courtyard does not have?',
    options: [
      { key: 'bronze_needs_more_heat', text: 'A hotter fuel — bronze needs more heat than copper.', right: false, line: 'Bronze actually melts lower than copper. Heat is not what is missing.' },
      { key: 'right', text: 'Tin, and a bench to work out how much of it — bronze is copper with tin in it.', right: true, line: 'Copper and tin, in a proportion. That is a counting question, and the Bench is where it gets answered.' },
      { key: 'bronze_is_burnt_copper', text: 'More air — bronze is copper burned harder.', right: false, line: 'Burning copper harder gives you copper oxide, not bronze. Bronze is a mixture, not a burn.' },
    ],
  },
]


export function fedBlock(id: string): void {
  setWorld((s) => (s.fed.includes(id) ? {} : { fed: [...s.fed, id] }))
}

/** The hand-in: prediction against the reading, on the cabinet's three axes. */
export function scoreRelight(s: WorldState): { accuracy: number; economy: number; thrift: number; reading: number } {
  const reading = Math.round(s.furnace.temp)
  const miss = s.prediction == null ? 1 : Math.min(1, Math.abs(s.prediction - COPPER_MELT_C) / 600)
  const accuracy = Math.round((1 - miss) * 100)
  // Economy: did the chosen fuel reach the target at all; thrift: how little
  // ceiling was left unused (coke overshoots copper by a wide margin).
  const ceiling = s.furnace.fuel ? ceilingFor(s.furnace.fuel, draughtFor(s.pipeFixed, s.air)) : 20
  const economy = ceiling >= COPPER_MELT_C ? 100 : Math.round((ceiling / COPPER_MELT_C) * 100)
  const thrift = s.furnace.fuel ? Math.round(Math.max(0, 100 - ((ceiling - COPPER_MELT_C) / COPPER_MELT_C) * 100)) : 0
  return { accuracy, economy, thrift, reading }
}
