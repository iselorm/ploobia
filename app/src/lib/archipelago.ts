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
 * Saving is `worldsave.ts`'s job (W3): it reads this store and writes a
 * subset back; the clock it needs to re-seed is exposed as `seedClock`.
 *
 * THE FUEL CEILINGS carry their sources (`FUELS[id].source`). Two are
 * measured figures for an open hearth; the wet-wood ceiling is modelled from
 * the calorific-value curve and is labelled so (house rule: never invent a
 * number — and never let a modelled one pass as a measured one).
 */

import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { setSkyOverride } from './looks'
import {
  advance as advancePlot,
  choose as choosePlot,
  competence as competenceOf,
  firstBed,
  freshBed,
  probe as probePlot,
  raiseCompetence,
  recordOf,
  replay as replayPlot,
  rescued,
  say as sayPlot,
  secondBed,
  skyForHour,
  takeNudge,
  type Competence,
  type DawnChoice,
  type PlotRecord,
  type PlotRun,
} from './plot'

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
  /** Steady-state ceiling of an open hearth of it with a working draught, °C. */
  peak: number
  /** How fast a hearth of it climbs, °C per second at full draught (a game rate, not a measurement). */
  climb: number
  /** True when `peak` sits inside a measured range; false when it is a modelled estimate. */
  verified: boolean
  basis: 'measured' | 'modelled'
  /** Where the number comes from, for the About card and for anyone who asks. */
  source: string
}

/**
 * Wet wood / dry wood / charcoal (Selorm, 2026-09-17): the contrast a learner
 * can feel — water in the wood eats the heat; charcoal is the higher-energy,
 * lower-moisture fuel. Coke arrives when metallurgy itself is the lesson.
 * The misconception the round is built to catch: the wet wood is HEAVIER, so
 * why less useful heat? Mass ≠ useful fuel energy.
 */
export const FUELS: Record<FuelId, Fuel> = {
  wetwood: {
    id: 'wetwood',
    name: 'Wet wood',
    peak: 550,
    climb: 60,
    verified: false,
    basis: 'modelled',
    source:
      'Modelled, not measured. Green wood is roughly half water by weight, and the water takes the heat: FAO (Wood fuels handbook / j4504e, fig. 7) has the net calorific value of wood falling from ≈18.5 MJ/kg oven-dry to zero at ≈88 % total moisture (air-dried 12–20 % ≈ 13–16 MJ/kg). A cook-stove study (Int. J. Sustainable Engineering 2023, doi 10.1080/19397038.2022.2159568) found eucalyptus at ≈50 % moisture failed to reach cooking temperature at all. 550 °C is the model’s ceiling for a blown open hearth of it — below dry wood by the calorific margin, above a smoulder.',
  },
  drywood: {
    id: 'drywood',
    name: 'Dry wood',
    peak: 900,
    climb: 110,
    verified: true,
    basis: 'measured',
    source:
      'Open wood firings measured at 560–918 °C, all open firings peaking by ≈940 °C (Gosselain 1992, “Bonfire of the Enquiries”, J. Archaeological Science 19, table 1). An enclosed kiln with a long firebox can push wood well past this; an open hearth cannot, blown or not.',
  },
  charcoal: {
    id: 'charcoal',
    name: 'Charcoal',
    peak: 1200,
    climb: 150,
    verified: true,
    basis: 'measured',
    source:
      'A charcoal hearth on bag bellows: “when it reached 900 °C, the bellows were used to increase the temperature to about 1200 °C”, crucible maxima 943–1233 °C (EXARC Journal 2021/4, Chalcolithic copper experiment, IR pyrometer ±2 %). Copper is smelted at 1100–1200 °C and cast at ≈1100 °C on charcoal (Penn Museum Expedition, “Fuel for the Metal Worker”).',
  },
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

/* ----------------------------------------------------------------------------
 * The plot — S0, "The Drooping Cassava" (storyboard v4). The trial itself is
 * `lib/plot.ts`; this is where it sits in the world: the stage the round has
 * reached, the run in progress, and the flags the quest's predicates read.
 * ------------------------------------------------------------------------- */

export type PlotStage =
  /** Off the boat; the wet streak; Nara not yet met. */
  | 'arrive'
  /** Nara's testimony heard; the empty plot on offer. */
  | 'met'
  /** The marker is in and named; the fortnight can begin. */
  | 'first'
  /** The first bed rescued; the far bed droops. */
  | 'second'
  /** The far bed held; the method assembles. */
  | 'method'
  /** The filmable moment: Nara picks up the can, stops, probes first. No card. */
  | 'pause'
  /** The closing record, the why, the counterfactual. */
  | 'record'
  /** The page by the well. */
  | 'page'
  /** The rails, the cutting. */
  | 'reward'
  /** Sela's request; the Foundry is next. */
  | 'done'

export type PlotStepId = 'trail' | 'claim' | 'probe' | 'lens' | 'say' | 'fortnight' | 'far' | 'teach' | 'page' | 'plant' | 'done'

export interface PlotState {
  stage: PlotStage
  step: PlotStepId
  /** The nickname on the marker, cleaned; null until the plot is claimed. */
  name: string | null
  /** The naming card is open (the marker has been pushed in). */
  naming: boolean
  /** Nara's testimony has been heard. */
  met: boolean
  /** The run in progress: the first bed, then the far bed. Null before the marker. Mutated by the ticker; replaced to publish. */
  run: PlotRun | null
  /** The first bed's rescued run, kept for the record and the hand-in. */
  first: PlotRun | null
  /** Every finished attempt, in order — the journal keeps the failed ones too. */
  attempts: PlotRecord[]
  /** Probes pushed into any bed. */
  probes: number
  /** The Lens raised at the Landing once the plot is claimed. */
  lensSeen: boolean
  /** The first stand has fired (chime, glyph, Nara's line). */
  stood: boolean
  /** The child has read DRY. Opens the rule line, with `stood`. */
  dryRead: boolean
  rescuedFirst: boolean
  rescuedSecond: boolean
  /** The method card has been handed in; Nara's competence is set. */
  taught: boolean
  competence: Competence | null
  /** The closing record has been read. */
  recorded: boolean
  /** The plot's why: -1 unanswered, else the option index. Own words kept beside it. */
  why: number
  whyText: string | null
  pageRead: boolean
  planted: boolean
  /** Sela's line has been heard; the world's quest is the Foundry's from here. */
  sent: boolean
  /** The seed of the first bed in play — the retry's "same seed". */
  seed: number
}

export const initialPlot = (): PlotState => ({
  stage: 'arrive',
  step: 'trail',
  name: null,
  naming: false,
  met: false,
  run: null,
  first: null,
  attempts: [],
  probes: 0,
  lensSeen: false,
  stood: false,
  dryRead: false,
  rescuedFirst: false,
  rescuedSecond: false,
  taught: false,
  competence: null,
  recorded: false,
  why: -1,
  whyText: null,
  pageRead: false,
  planted: false,
  sent: false,
  seed: 1,
})

export interface WorldState {
  zone: ZoneId
  ring: LensRing
  phase: 'welcome' | 'play'
  step: StepId
  /** S0 — the Landing plot. */
  plot: PlotState
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
  /** The pour card has been stepped out of (so it never comes back, even after a door). */
  pourSeen: boolean
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
  /**
   * A cabinet the explorer has stepped into through a door — the route swaps
   * to that cabinet's page and the world waits here, state intact, until the
   * cabinet's back link returns. Null while in the world.
   */
  cabinet: CabinetId | null
  /** Where to stand on return from a cabinet: the door's own coordinates. */
  returnPos: [number, number, number] | null
  /** This visit began from a save: the welcome offers to continue. Never saved itself. */
  resumed: boolean
  /** The interactable being talked to (a `talk` verb), or null. The card is the HUD's. */
  talk: string | null
}

/** Cabinets a courtyard door can open. Each is an existing arcade page; the door is the link. */
export type CabinetId = 'atoms'

/**
 * A door in the world to a cabinet: what it opens, when it unlocks, and the
 * search params the cabinet's page reads (`from=world` swaps its back link).
 */
export interface Door {
  id: string
  cabinet: CabinetId
  label: string
  /** The route the door opens, hash-relative. */
  route: string
  /** Shown while the door is still shut. */
  locked: string
  unlocked: (s: WorldState) => boolean
}

export const DOORS: Record<string, Door> = {
  'door.bench': {
    id: 'door.bench',
    cabinet: 'atoms',
    label: 'The Bench',
    route: '/atoms?from=world&door=2',
    locked: 'The Bench — after the pour, when Sefu asks for bronze.',
    // The third why: "Tin, and a bench to work out how much of it." Answered either way, the door is open.
    unlocked: (s) => s.poured && s.whys[2] >= 0,
  },
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
  pourSeen: false,
  crossings: 0,
  time: 0,
  room: 'none',
  air: 0,
  crane: { active: false, yaw: 0.2, hookY: 3.2, holding: null, drops: {} },
  curve: [],
  whys: [-1, -1, -1],
  cabinet: null,
  returnPos: null,
  resumed: false,
  talk: null,
  journal: { prediction: null, action: null, observed: null, explanation: null },
  plot: initialPlot(),
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
  setSkyOverride(null)
  simTime = 0
  sinceFlush = 0
  pendingHearths = null
  pendingFurnace = 20
  wroteHearths = null
  wroteFurnace = null
  litAt = null
  sincePlotFlush = 0
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

export type Verb = 'grab' | 'probe' | 'build' | 'feed' | 'portal' | 'talk' | 'crane' | 'door' | 'marker' | 'read' | 'plant'

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
  /** The path holds something: not null, not false, not empty. */
  | { type: 'set'; source: string }
  | { type: 'never' }

export interface QuestStep<Id extends string = string> {
  id: Id
  /** The checklist line — what the learner reads as the job. */
  label: string
  /** The coach line: the single next action, in Ploob's words. */
  coach: string
  /** Which interactable id (or `prefix.`) the marker should point at. */
  target: string | null
  until: Predicate
}

export interface Quest<Id extends string = string> {
  id: string
  title: string
  hook: string
  predict: { ask: string; unit: string }
  steps: QuestStep<Id>[]
  /** The whys, growing — asked after the hand-in, never during. */
  whys: string[]
  /** Step ids the checklist leaves out (the walk in, the epilogue). */
  hidden: Id[]
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
    case 'set': {
      const v = readPath(s, p.source)
      return v != null && v !== false && v !== ''
    }
    case 'never':
      return false
  }
}

export const RELIGHT: Quest<StepId> = {
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
      coach: 'See it? The air escapes at the split in the pipe. Walk up to the split and fix it.',
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
    'Three days later Sefu asks for bronze. What would you add, and why would you need the bench?',
  ],
  hidden: ['arrive', 'done'],
}

/**
 * S0 — the Landing plot. The title on the Play card is the question; the
 * internal name (Too much water) never shows. Coach lines are Ploob's and
 * pass the explanation gate: none names the cause before the world has.
 */
export const PLOT: Quest<PlotStepId> = {
  id: 'landing.plot',
  title: "Why is Nara's cassava drooping?",
  hook: 'A wet streak runs up the harbour path to a cassava that droops however much it is watered. Find out what it needs.',
  predict: { ask: 'How many cans will it take to get her standing — and keep her standing for a fortnight?', unit: 'cans' },
  steps: [
    { id: 'trail', label: 'Follow the wet streak', coach: 'Something has been spilling water up the path. Follow it.', target: 'talk.nara', until: { type: 'state', source: 'plot.met', equals: true } },
    { id: 'claim', label: 'Take the plot', coach: 'The empty plot is yours if you want it. Push the marker in.', target: 'marker.plot', until: { type: 'set', source: 'plot.name' } },
    { id: 'probe', label: "Probe Nara's bed", coach: 'Before anything — push the probe into her bed and read it.', target: 'bed.nara', until: { type: 'threshold', source: 'plot.probes', op: '>=', value: 1 } },
    { id: 'lens', label: 'Look inside with the Lens', coach: 'Raise the Lens by the bed. See what the soil is like under the plant.', target: 'bed.nara', until: { type: 'state', source: 'plot.lensSeen', equals: true } },
    { id: 'say', label: 'Say how many cans', coach: 'Say your number first. Then each morning: probe, and pour or wait.', target: 'bed.nara', until: { type: 'count', source: 'plot.run.said', op: '>=', value: 1 } },
    { id: 'fortnight', label: 'Keep it standing for a fortnight', coach: 'Each dawn: probe first, then the can or the wait. Watch the leaves at one o\u2019clock.', target: 'bed.nara', until: { type: 'state', source: 'plot.rescuedFirst', equals: true } },
    { id: 'far', label: 'The far bed', coach: 'Nara ran off toward the far bed. Follow her — and probe before you do anything.', target: 'bed.far', until: { type: 'state', source: 'plot.rescuedSecond', equals: true } },
    { id: 'teach', label: 'Teach Nara', coach: 'Both beds standing. Tell Nara what you did each morning.', target: 'talk.nara', until: { type: 'state', source: 'plot.taught', equals: true } },
    { id: 'page', label: 'The page by the well', coach: 'Ploob has found something in the mud by the well.', target: 'page.well', until: { type: 'state', source: 'plot.pageRead', equals: true } },
    { id: 'plant', label: 'Plant your cutting', coach: 'Your plot, your cutting. Put it in.', target: 'bed.mine', until: { type: 'state', source: 'plot.planted', equals: true } },
    { id: 'done', label: 'Sela at the jetty', coach: 'Sela is waiting at the jetty.', target: 'talk.sela', until: { type: 'never' } },
  ],
  whys: ['What happened to the first plant while nobody watered it?'],
  hidden: ['trail', 'lens', 'done'],
}

/** The plot holds the Landing until Sela sends the child across the water. */
export function plotActive(s: WorldState): boolean {
  return s.zone === 'landing' && !s.plot.sent
}

export function activeQuest(s: WorldState): Quest {
  return plotActive(s) ? PLOT : RELIGHT
}

export function currentStepId(s: WorldState): string {
  return plotActive(s) ? s.plot.step : s.step
}

/**
 * Where the current step points, in the world: the registered interactable
 * the step names, or the nearest match for a prefix target ("scrap."),
 * skipping what is held or already fed. Null when the step has no place.
 */
export function questTarget(s: WorldState, from: [number, number]): [number, number, number] | null {
  const step = currentStep(s)
  if (!step.target || s.phase !== 'play') return null
  let best = Infinity
  let target: [number, number, number] | null = null
  for (const it of interactables.values()) {
    if (it.id === step.target || (step.target.endsWith('.') && it.id.startsWith(step.target))) {
      if (s.held === it.id || (step.id === 'clear' && s.fed.includes(it.id))) continue
      const d = Math.hypot(it.pos[0] - from[0], it.pos[2] - from[1])
      if (d < best) {
        best = d
        target = it.pos
      }
    }
  }
  return target
}

/** The active quest's current step — the plot's at the Landing, the furnace's across the water. */
export function currentStep(s: WorldState): QuestStep {
  const q = activeQuest(s)
  const id = currentStepId(s)
  return q.steps.find((st) => st.id === id) ?? q.steps[0]
}

function advanced<Id extends string>(q: Quest<Id>, current: Id, state: WorldState): Id | null {
  let i = q.steps.findIndex((st) => st.id === current)
  let changed = false
  while (i < q.steps.length - 1 && evalPredicate(q.steps[i].until, state)) {
    i++
    changed = true
  }
  return changed ? q.steps[i].id : null
}

/**
 * Advance both quests as far as the state allows. Called by the ticker once
 * per frame; a step that is already satisfied is skipped, so a learner who
 * fixes the pipe before probing is not sent back to probe.
 */
export function advanceQuest(): void {
  const state = getWorld()
  const step = advanced(RELIGHT, state.step, state)
  const plotStep = advanced(PLOT, state.plot.step, state)
  if (step || plotStep) {
    setWorld({
      ...(step ? { step } : {}),
      ...(plotStep ? { plot: { ...getWorld().plot, step: plotStep } } : {}),
    })
  }
}

/* ----------------------------------------------------------------------------
 * The ticker — explicit sim time; the only place temperatures change
 * ------------------------------------------------------------------------- */

const MAX_DT = 0.25
/** Store writes for a climbing temperature are throttled to this cadence. */
const FLUSH_EVERY = 0.12

let simTime = 0
/**
 * The physics clock: advanced once per Rapier step (a fixed 1/60 s), by the
 * scene. A dropped piece falls in physics time, not frame time — on a slow
 * frame the two drift apart, and a drop timed by frames would report the
 * heavy piece "faster" for no reason but a hitch. That is the very
 * misconception the bet exists to disprove, so the drops are timed here.
 */
let physicsTime = 0
export function stepPhysicsClock(dt: number): void {
  physicsTime += dt
}
export function getPhysicsTime(): number {
  return physicsTime
}
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

/**
 * Re-seed the module clocks after a restore: sim time from the save, and the
 * furnace's lighting instant back-derived from the last point of its curve,
 * so the record carries on from where it stopped rather than starting a
 * second curve at zero. The pending/written pairs are cleared so the next
 * tick reads the restored store values as someone else's write.
 */
export function seedClock(time: number, furnaceLit: boolean, curve: CurvePoint[]): void {
  simTime = Math.max(0, time)
  sinceFlush = 0
  pendingHearths = null
  wroteHearths = null
  wroteFurnace = null
  const last = curve[curve.length - 1]
  litAt = furnaceLit ? simTime - (last ? last[0] : 0) : null
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
  tickPlot(dt)
  advanceQuest()
}

/* ----------------------------------------------------------------------------
 * The plot's day — the run steps in place, the store is told at a cadence
 * ------------------------------------------------------------------------- */

let sincePlotFlush = 0

function tickPlot(dt: number): void {
  const s = getWorld()
  const run = s.plot.run
  // The sky is the trial's while a bed is in play: dawn at the pause, the day
  // sweeping as it runs; the child's own Look comes back when the run ends.
  if (run && s.phase === 'play' && s.zone === 'landing' && (run.phase === 'dawn' || run.phase === 'running')) {
    setSkyOverride(run.phase === 'dawn' ? skyForHour(0) : skyForHour(run.hour + run.acc))
  } else setSkyOverride(null)
  if (!run || run.phase !== 'running' || s.phase !== 'play') return
  const events = advancePlot(run, dt)
  sincePlotFlush += dt
  const stood = events.includes('stand')
  const ended = events.includes('done') || events.includes('dead')
  if (!stood && !ended && sincePlotFlush < FLUSH_EVERY) return
  sincePlotFlush = 0
  const plot: PlotState = { ...s.plot, run: { ...run } }
  if (stood) {
    plot.stood = true
    window.dispatchEvent(new CustomEvent('ploobia:stand', { detail: run.bed }))
  }
  if (ended) {
    const rec = recordOf(run)
    plot.attempts = [...plot.attempts, rec]
    if (rescued(run)) {
      if (run.bed === 'first') {
        plot.rescuedFirst = true
        plot.first = { ...run }
      } else {
        plot.rescuedSecond = true
      }
    }
  }
  setWorld({ plot })
}

/* ----------------------------------------------------------------------------
 * The plot's verbs
 * ------------------------------------------------------------------------- */

/** Nara's testimony is heard when her card opens; the plot is on offer from then. */
export function meetNara(): void {
  setWorld((s) => (s.plot.met ? {} : { plot: { ...s.plot, met: true, stage: s.plot.stage === 'arrive' ? 'met' : s.plot.stage } }))
}

/** The marker pushed in: the naming card opens. */
export function pushMarker(): void {
  setWorld((s) => (s.plot.name ? {} : { plot: { ...s.plot, naming: true } }))
}

/** The plot named and claimed; the first bed's fortnight is set up on the seed. */
export function namePlot(name: string): void {
  setWorld((s) => {
    const clean = name.trim()
    if (!clean) return { plot: { ...s.plot, naming: false } }
    return { plot: { ...s.plot, name: clean, naming: false, stage: 'first', run: s.plot.run ?? firstBed(s.plot.seed, 1) } }
  })
}

/** Which bed the run in progress is on, as an interactable id. */
export function runBedId(s: WorldState): string | null {
  const run = s.plot.run
  if (!run) return null
  return run.bed === 'first' ? 'bed.nara' : 'bed.far'
}

/** The probe pushed into a bed. Free, every dawn; the reading sits on the plate. */
export function probeBed(id: string): boolean {
  const s = getWorld()
  const run = s.plot.run
  if (!run || id !== runBedId(s)) return false
  const did = probePlot(run)
  const dryRead = s.plot.dryRead || run.today.word === 'DRY'
  setWorld({ plot: { ...s.plot, run: { ...run }, probes: s.plot.probes + 1, dryRead } })
  return did
}

/** The number typed, or revised. Every revision is kept. */
export function plotSay(n: number): boolean {
  const s = getWorld()
  const run = s.plot.run
  if (!run) return false
  const ok = sayPlot(run, n)
  if (ok) setWorld({ plot: { ...s.plot, run: { ...run } } })
  return ok
}

/** Pour or wait: the dawn ends and the day runs. Refused before a number is said. */
export function plotChoose(choice: DawnChoice): boolean {
  const s = getWorld()
  const run = s.plot.run
  // The first bed wants the number said first; the far bed is the changed case, no new brief.
  if (!run || run.phase !== 'dawn' || (run.bed === 'first' && run.said.length === 0)) return false
  const ok = choosePlot(run, choice)
  if (ok) setWorld({ plot: { ...s.plot, run: { ...run } } })
  return ok
}

/** Ploob's "Shall we look first?" — owed after three unprobed dawns, said once a run. */
export function plotNudge(): boolean {
  const s = getWorld()
  const run = s.plot.run
  if (!run || !takeNudge(run)) return false
  setWorld({ plot: { ...s.plot, run: { ...run } } })
  return true
}

/** Replay this fortnight (same bed, same seed) or A new bed (a fresh start from the range). */
export function plotRetry(kind: 'replay' | 'fresh'): void {
  setWorld((s) => {
    const run = s.plot.run
    if (!run || (run.phase !== 'dead' && run.phase !== 'done')) return {}
    const next = kind === 'fresh' ? freshBed(run) : replayPlot(run)
    return { plot: { ...s.plot, run: next, stood: false, seed: next.seed } }
  })
}

/** The first bed's closing line stepped out of: the far bed's week begins. */
export function plotToFarBed(): void {
  setWorld((s) => {
    if (!s.plot.rescuedFirst || s.plot.stage !== 'first') return {}
    return { plot: { ...s.plot, stage: 'second', run: secondBed(s.plot.seed, 1), stood: false } }
  })
}

/** The far bed held: the method assembles. */
export function plotToMethod(): void {
  setWorld((s) => (s.plot.rescuedSecond && s.plot.stage === 'second' ? { plot: { ...s.plot, stage: 'method' } } : {}))
}

/** The method handed in: Nara's competence is what the child demonstrated. */
export function teachNara(): void {
  setWorld((s) => {
    if (s.plot.taught || !s.plot.first) return {}
    const c = competenceOf(s.plot.first, s.plot.run?.bed === 'second' ? s.plot.run : null)
    return { plot: { ...s.plot, taught: true, competence: c, stage: 'pause' } }
  })
}

/** Nara's pause has played: the closing record. */
export function pauseDone(): void {
  setWorld((s) => (s.plot.stage === 'pause' ? { plot: { ...s.plot, stage: 'record' } } : {}))
}

/** The plot's why answered by option; the judge may only raise Nara from copies to runs. */
export function plotAnswerWhy(choice: number, text: string | null): void {
  setWorld((s) => {
    const right = PLOT_WHY.options[choice]?.right === true
    return { plot: { ...s.plot, why: choice, whyText: text, competence: s.plot.competence ? raiseCompetence(s.plot.competence, right) : s.plot.competence } }
  })
}

/** The record read, the counterfactual watched: the page is in the mud by the well. */
export function plotRecorded(): void {
  setWorld((s) => (s.plot.stage === 'record' ? { plot: { ...s.plot, recorded: true, stage: 'page' } } : {}))
}

export function readPage(): void {
  setWorld((s) => (s.plot.stage === 'page' ? { plot: { ...s.plot, pageRead: true, stage: 'reward' } } : {}))
}

export function plantCutting(): void {
  setWorld((s) => (s.plot.stage === 'reward' ? { plot: { ...s.plot, planted: true, stage: 'done' } } : {}))
}

/** Sela's line heard: the Foundry's quest takes the Landing from here. */
export function sendAcross(): void {
  setWorld((s) => (s.plot.stage === 'done' ? { plot: { ...s.plot, sent: true } } : {}))
}

/** The plot's one why, for the first play: three options; the world disproves two. */
export const PLOT_WHY: Why = {
  ask: 'What happened to the first plant while nobody watered it?',
  options: [
    { key: 'thirsty', text: 'It was thirsty and finally found water.', right: false, line: 'Nobody gave it any — and a can every morning would have finished it. You watched that.' },
    { key: 'right', text: 'The soil was full of water and short of air, so the roots stopped taking water up.', right: true, line: 'That is it. Full of water, no air in the pores — the roots could not work. When the bed drained, they could.' },
    { key: 'bad_soil', text: 'The soil was bad and the plant got used to it.', right: false, line: 'Same soil, same plant. It came back on its own once the bed drained — the soil did not change, the water in it did.' },
  ],
}

/* ----------------------------------------------------------------------------
 * Verbs the HUD and the explorer call
 * ------------------------------------------------------------------------- */

/**
 * Step through a door: the world remembers where it stood and which cabinet
 * it is in; the HUD (outside the canvas, where the router lives) does the
 * route change. Returns false if the door is still shut.
 */
export function enterDoor(id: string, at: [number, number, number]): boolean {
  const door = DOORS[id]
  const s = getWorld()
  if (!door || !door.unlocked(s)) return false
  setWorld({ cabinet: door.cabinet, returnPos: at, held: null, near: null })
  return true
}

/** Back from a cabinet: the world resumes where the door was, nothing reset. */
export function returnFromCabinet(): [number, number, number] | null {
  const s = getWorld()
  const at = s.returnPos
  setWorld({ cabinet: null, returnPos: null })
  return at
}

export function talkTo(id: string | null): void {
  setWorld({ talk: id })
  if (id === 'talk.nara') meetNara()
}

export function crossPortal(to: ZoneId): void {
  setWorld((s) => ({ zone: to, ring: 'world', held: null, near: null, crossings: s.crossings + 1 }))
}

export function lightHearth(fuel: FuelId): void {
  setWorld((s) => (s.lit.includes(fuel) ? {} : { lit: [...s.lit, fuel] }))
}

export function toggleLens(): void {
  setWorld((s) => {
    const ring: LensRing = s.ring === 'world' ? 'system' : 'world'
    const lensSeen = s.plot.lensSeen || (ring === 'system' && s.zone === 'landing' && s.plot.run != null)
    return {
      ring,
      bellowsSeen: s.bellowsSeen || (ring === 'system' && s.zone === 'foundry'),
      ...(lensSeen !== s.plot.lensSeen ? { plot: { ...s.plot, lensSeen } } : {}),
    }
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
    return { crane: { ...s.crane, holding: null, drops: { ...s.crane.drops, [id]: { from: s.crane.hookY, t0: physicsTime, t1: null } } } }
  })
}

export function noteLanding(id: string): void {
  setWorld((s) => {
    const d = s.crane.drops[id]
    if (!d || d.t1 != null) return {}
    return { crane: { ...s.crane, drops: { ...s.crane.drops, [id]: { ...d, t1: physicsTime } } } }
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
    ask: 'Three days later Sefu asks for bronze bells. What would you need that this courtyard does not have?',
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
