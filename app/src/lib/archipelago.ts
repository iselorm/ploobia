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
import {
  answerPause,
  beginDispatch,
  confirmChoice,
  initialKeep,
  keepStage,
  readReport,
  seenWords,
  settleDispatch,
  type HandoffChoice,
  type Keep,
  type KeepStage,
  type PauseAnswer,
} from './keep'
import {
  POUR_TOTAL,
  addIngot,
  backToBench,
  benchOpens,
  benchReached,
  benchWetMass,
  castCm3,
  done as benchDoneAt,
  drop as benchDropAt,
  hotEnough,
  initialBench,
  initialCast,
  inspect as benchInspectAt,
  kitCast,
  lastPour,
  liftPattern,
  markLevel,
  markRise,
  mouldLook,
  mouldStage,
  pourCharge,
  sinkPattern,
  take as benchTakeAt,
  takeIngot,
  toFire,
  JUG_START,
  type Bench,
  type CastRecord,
  type MouldLook,
} from './supply'
import {
  DRAW_TOTAL,
  STRIP,
  STRIPS,
  answerBend,
  drawBeat,
  bendStage,
  cutStrip,
  exact,
  fresh as freshStrips,
  hang as hangIngot,
  initialBend,
  lift as liftHanger,
  pickDrawing,
  predict as predictStrip,
  readingText,
  settle as settleBend,
  type Bend,
  type DrawBeat,
  type BandId as BendBand,
  type DrawingPart,
  type Guess,
} from './bend'

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
export type RoomId = 'none' | 'furnace' | 'bench' | 'balance' | 'mould' | 'strap' | 'vice' | 'drawing'

/** S2 moment 1 — the rusted strap on the bench by the gate: not yet seen, shown, or taken in the hand. */
export type StrapBeat = 'unseen' | 'shown' | 'taken'

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
  /** S1 — the handoff and its fortnights (lib/keep.ts). Null until Nara asks, after S0. */
  keep: Keep | null
  /** S2 — the cold bench and what it charged (lib/supply.ts). Null until the child first measures. */
  supply: Supply | null
  /** S2 — the rusted strap off the watch's gate, on the bench beside Sefu (round A3). */
  strap: StrapBeat
}

/** S2's state: the bench and the mould now; the vice and the road join them in later rounds. */
export interface Supply {
  bench: Bench
  /** The mould at the furnace foot: every pour so far, and Sefu's question (round A2). */
  cast: CastRecord
  /** Sim time the last pour began; the channel, the cooling and the reveal are read off it. Null when nothing is in the mould. */
  pouredAt: number | null
  /** The vice and the repair drawing (round A3, lib/bend.ts). */
  bend: Bend
  /** Sim time the drawing's clip began; its beats are read off it. Null when it is not playing (the ticker clears it at the end). Not restored. */
  drawnAt: number | null
}

export function newSupply(): Supply {
  return { bench: initialBench(), cast: initialCast(), pouredAt: null, bend: initialBend(), drawnAt: null }
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
  keep: null,
  supply: null,
  strap: 'unseen',
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

export type Verb = 'grab' | 'probe' | 'build' | 'feed' | 'portal' | 'talk' | 'crane' | 'door' | 'marker' | 'read' | 'plant' | 'measure'

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
  /** A second brief for a quest with a changed case (the plot's far bed). */
  predictFar?: { ask: string; unit: string }
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
  hook: 'A wet streak runs up the harbour path to a cassava that droops however much it is watered. Find out what it needs. Each simulated day takes about six seconds, then pauses for your next decision.',
  predict: { ask: 'How many cans will it take to get her standing — and keep her standing for a fortnight?', unit: 'cans' },
  /** The far bed's brief — the changed case gets its own number. */
  predictFar: { ask: 'How many cans will this bed take to stay standing for the week?', unit: 'cans' },
  steps: [
    { id: 'trail', label: 'Follow the wet streak', coach: 'Something has been spilling water up the path. Follow it.', target: 'talk.nara', until: { type: 'state', source: 'plot.met', equals: true } },
    { id: 'claim', label: 'Take the plot', coach: 'The empty plot is yours if you want it. Push the marker in.', target: 'marker.plot', until: { type: 'set', source: 'plot.name' } },
    { id: 'probe', label: "Probe Nara's bed", coach: 'Before anything — push the probe into her bed and read it.', target: 'bed.nara', until: { type: 'threshold', source: 'plot.probes', op: '>=', value: 1 } },
    // Encouraged, never required: the Lens step is satisfied by the Lens OR by the number being said, so a child who
    // skips the Lens is not held at it (Selorm's test, 24 Sep: "the hint kept sending me to the first bed").
    { id: 'lens', label: 'Look inside with the Lens', coach: 'Raise the Lens by the bed. See what the soil is like under the plant.', target: 'bed.nara', until: { type: 'count', source: 'plot.run.said', op: '>=', value: 1 } },
    { id: 'say', label: 'Say how many cans', coach: 'Say your number first. Then each morning: probe, and pour or wait.', target: 'bed.nara', until: { type: 'count', source: 'plot.run.said', op: '>=', value: 1 } },
    { id: 'fortnight', label: 'Keep it standing for a fortnight', coach: 'Each dawn: probe first, then the can or the wait. Watch the leaves at one o\u2019clock.', target: 'bed.nara', until: { type: 'state', source: 'plot.rescuedFirst', equals: true } },
    { id: 'far', label: 'The far bed', coach: 'Nara ran off toward the far bed. Follow her — and probe before you do anything.', target: 'bed.far', until: { type: 'state', source: 'plot.rescuedSecond', equals: true } },
    { id: 'teach', label: 'Teach Nara', coach: 'Both beds standing. Tell Nara what you did each morning.', target: 'talk.nara', until: { type: 'state', source: 'plot.taught', equals: true } },
    { id: 'page', label: 'The page by the well', coach: 'Ploob has found something in the mud by the well.', target: 'page.well', until: { type: 'state', source: 'plot.pageRead', equals: true } },
    { id: 'plant', label: 'Plant your cutting', coach: 'Your plot, your cutting. Put it in.', target: 'bed.mine', until: { type: 'state', source: 'plot.planted', equals: true } },
    { id: 'done', label: 'Sela at the jetty', coach: 'Sela is waiting at the jetty.', target: 'talk.sela', until: { type: 'never' } },
  ],
  whys: ['Why could the first plant droop while its soil was wet?'],
  hidden: ['trail', 'lens', 'done'],
}

/**
 * S1 — the handoff, as the Landing's quest (storyboard v3.1 §05). Its step is
 * derived from the keep's stage, never stored: tell Nara → tell Sela → away
 * (the Foundry is the errand) → the report. The predicates are `never`; the
 * checklist reads the order.
 */
export type KeepStepId = 'tell' | 'sela' | 'away' | 'report'
export const KEEP_QUEST: Quest<KeepStepId> = {
  id: 'landing.keep',
  title: 'The Handoff',
  hook: 'Nara will keep the beds while you are away. Tell her what to do — then see if it held.',
  predict: { ask: '', unit: '' },
  steps: [
    { id: 'tell', label: 'Tell Nara what to do each morning', coach: 'Nara has a question for you, by her bed.', target: 'talk.nara', until: { type: 'never' } },
    { id: 'sela', label: 'Tell Sela you are going', coach: 'Sela is at the jetty. Tell her when you are going.', target: 'talk.sela', until: { type: 'never' } },
    { id: 'away', label: 'Relight the Foundry while the fortnight runs', coach: 'Through the gate: the Foundry is cold. The fortnight runs here while you are away.', target: 'portal.foundry', until: { type: 'never' } },
    { id: 'report', label: "Read Nara's report", coach: 'Nara has kept a record of every morning.', target: null, until: { type: 'never' } },
  ],
  whys: [],
  hidden: [],
}

/**
 * S2 — The cart that must leave: the relight with a reason. The relight's own
 * steps, then the four the kit needs. The new steps' predicates are `never`;
 * the supply state decides which is current (storyboard v3.1 §03).
 */
export type CartStepId = StepId | 'measure' | 'cast' | 'test' | 'deliver'
export const CART_QUEST: Quest<CartStepId> = {
  id: 'foundry.cart',
  title: 'The cart that must leave',
  hook: "The watch's jetty gate will not close. Sela needs copper fittings, and the Foundry is cold.",
  predict: RELIGHT.predict,
  steps: [
    // The cart holds the pour: the relight's last step is the heat, and the pour is the cast.
    ...RELIGHT.steps.map((st) => (st.id === 'feed' ? { ...st, label: 'Reach 1085 °C' } : st)),
    { id: 'measure', label: 'Measure the pattern', coach: 'The cold bench, by the west wall: water first. Water tells you what copper will.', target: 'bench.jug', until: { type: 'never' } },
    { id: 'cast', label: 'Cast the fittings', coach: "Sefu's got the dry pan. The mould's at the furnace foot.", target: 'cast.mould', until: { type: 'never' } },
    { id: 'test', label: 'Test the straps', coach: 'The fittings are cast. The vice is by the east wall: which strip keeps a bend?', target: 'vice.strips', until: { type: 'never' } },
    { id: 'deliver', label: 'Bring them to Sela', coach: 'Back through the crossing, with the kit.', target: 'portal.landing', until: { type: 'never' } },
  ],
  whys: RELIGHT.whys,
  hidden: RELIGHT.hidden,
}

/** The child came across from S0's Landing: Sela's order is why the furnace is being lit. */
export function cartStory(s: WorldState): boolean {
  return s.keep != null || s.plot.sent
}

/** The cart holds the courtyard's quest once the child has come across from S0's Landing. */
export function cartActive(s: WorldState): boolean {
  return s.zone === 'foundry' && cartStory(s)
}

function cartStepId(s: WorldState): CartStepId {
  const sup = s.supply
  // The relight's own steps lead until the bench is open (the heat is there, and the cart holds the pour)
  // or an old pour is done. From then on the bench and the mould lead — whatever relight step a child who
  // skipped ahead was left on.
  if (!sup) return s.step === 'done' ? 'measure' : s.step
  if (kitCast(sup.cast)) return sup.cast.why < 0 ? 'cast' : bendOf(s).why >= 0 ? 'deliver' : 'test'
  return mouldStage(sup.bench, sup.cast) === 'empty' ? 'measure' : 'cast'
}

/** The story fortnight's report has been read (the handoff's first loop is closed). */
function storyRead(k: Keep | null): boolean {
  if (!k || k.storyDispatchId == null) return false
  const d = k.dispatch
  return !d || d.id !== k.storyDispatchId || d.status === 'read'
}

/** The handoff holds the Landing's quest from Nara's question until the story report is read. */
export function keepQuestActive(s: WorldState): boolean {
  return s.zone === 'landing' && keepAvailable(s) && !storyRead(s.keep)
}

function keepStepId(s: WorldState): KeepStepId {
  const st = s.keep ? keepStage(s.keep) : 'ask'
  return st === 'ready' ? 'sela' : st === 'away' ? 'away' : st === 'report' ? 'report' : 'tell'
}

/** The plot holds the Landing until Sela sends the child across the water. */
export function plotActive(s: WorldState): boolean {
  return s.zone === 'landing' && !s.plot.sent
}

export function activeQuest(s: WorldState): Quest {
  return plotActive(s) ? PLOT : keepQuestActive(s) ? KEEP_QUEST : cartActive(s) ? CART_QUEST : RELIGHT
}

export function currentStepId(s: WorldState): string {
  return plotActive(s) ? s.plot.step : keepQuestActive(s) ? keepStepId(s) : cartActive(s) ? cartStepId(s) : s.step
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

  // Copper heat. For a child on Sela's errand it opens the bench and Sefu holds the pour until the
  // charge is measured (S2 round A2); for anyone else the relight pours by itself, as built.
  const atHeat = s.furnace.lit && furnaceTemp >= COPPER_MELT_C - HANDIN_TOLERANCE_C
  const story = cartStory(s)
  const sup = s.supply
  const elapsed = sup?.pouredAt != null ? simTime - sup.pouredAt : null
  // A full cast becomes "the pour" when the mould opens on it, not when the channel starts.
  const castDone = !!sup && kitCast(sup.cast) && (elapsed == null || elapsed >= POUR_TOTAL)
  const poured = s.poured || castDone || (!story && atHeat)
  const opens = story && atHeat && !s.poured && !sup
  // While a pour plays, the store's clock is kept fresh so the HUD can read its beat.
  const drawn = sup?.drawnAt != null ? simTime - sup.drawnAt : null
  // The drawing's clip ends with a write of its own (its clock is cleared), so the HUD hears of it whatever else is burning.
  const clipOver = drawn != null && drawn >= DRAW_TOTAL
  const revealing = (elapsed != null && elapsed < POUR_TOTAL + 2 * FLUSH_EVERY) || drawn != null
  if ((hot || revealing || poured !== s.poured) && (sinceFlush >= FLUSH_EVERY || poured !== s.poured || opens || clipOver)) {
    sinceFlush = 0
    // The curve: one point every ~0.5 s of the furnace's life, from lighting.
    let curve = s.curve
    // The curve is the climb to copper heat. While Sefu holds the pour for the bench it stops, so the
    // pour card shows the climb and not the minutes spent measuring.
    if (s.furnace.lit && litAt != null && !(sup && !s.poured)) {
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
    setWorld({ hearths: nextHearths, furnace: nextFurnace, poured, curve, journal, time: simTime, ...(opens ? { supply: newSupply() } : clipOver && sup ? { supply: { ...sup, drawnAt: null } } : {}) })
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
  // Both beds want their number said first — the far bed is the changed case and gets its own brief.
  if (!run || run.phase !== 'dawn' || run.said.length === 0) return false
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
  ask: 'Why could the first plant droop while its soil was wet?',
  options: [
    { key: 'thirsty', text: 'It was thirsty and finally found water.', right: false, line: 'The probe showed water was already there. A can every morning would keep this bed too wet. Compare the two watering histories next.' },
    { key: 'right', text: 'The soil was full of water and short of air, so the roots stopped taking water up.', right: true, line: 'That is it. Full of water, no air in the pores — the roots could not work. When the bed drained, they could.' },
    { key: 'bad_soil', text: 'The soil was bad and the plant got used to it.', right: false, line: 'Same soil, same plant. It came back on its own once the bed drained — the soil did not change, the water in it did.' },
  ],
}

/* ----------------------------------------------------------------------------
 * S1 — The Handoff (storyboard v3.1). The model is lib/keep.ts; these are the
 * store's verbs. Ability stays in `plot.competence`: S1 raises it there (the
 * copies pause), never through a second copy.
 * ------------------------------------------------------------------------- */

/** Nara's question, judged against the method: three named wrong answers, each a rule she could run. */
export const HANDOFF_WHY: Why = {
  ask: 'So what should Nara do each morning?',
  options: [
    { key: 'right', text: 'Probe first; if it is soaked or damp, wait; if it is dry, one can; check again tomorrow.', right: true, line: 'That is the method you showed her — both beds.' },
    { key: 'daily', text: 'Give it a can every morning.', right: false, line: 'A can every morning, whatever the probe says.' },
    { key: 'droop', text: 'Give it a can the morning after the leaves go down.', right: false, line: 'Watering when the leaves say so, a day behind.' },
    { key: 'leave', text: 'Leave it and let it sort itself out.', right: false, line: 'No water at all on the far bed.' },
  ],
}

/** Can Nara ask yet: S0 finished and both beds' runs to hand. */
export function keepAvailable(s: WorldState): boolean {
  return s.plot.sent && s.plot.first != null && s.plot.run?.bed === 'second'
}

export function keepStageOf(s: WorldState): KeepStage | null {
  return s.keep ? keepStage(s.keep) : null
}

/** Nara asks. The beds are copied from S0's end once; S0's own record is never rewritten. */
export function openKeep(): void {
  setWorld((s) => {
    if (s.keep || !keepAvailable(s) || !s.plot.first || !s.plot.run) return {}
    return { keep: initialKeep(s.plot.first.b, s.plot.run.b, seenWords(s.plot.run)) }
  })
}

/** The child answered "Yes, that" to Nara's say-back. */
export function confirmKeep(choice: HandoffChoice, record?: Keep['handoff']): void {
  setWorld((s) => (s.keep ? { keep: confirmChoice(s.keep, choice, record) } : {}))
}

const abilityOf = (s: WorldState): Competence => s.plot.competence ?? 'copies'

/**
 * Begin a dispatch at Sela's board. The story fortnight waits for the child's
 * return across the water; a practice fortnight is computed at once (no errand,
 * no crates) and goes straight to its report.
 */
export function beginKeep(opts: { rain?: boolean } = {}): void {
  setWorld((s) => {
    if (!s.keep) return {}
    let k = beginDispatch(s.keep, abilityOf(s), opts)
    if (k === s.keep) return {}
    if (k.dispatch?.kind === 'practice') k = settleDispatch(k, abilityOf(s))
    return { keep: k }
  })
}

/** Fourteen days, applied once: beds, report, crates, campaign day together. */
export function settleKeep(): void {
  setWorld((s) => {
    if (!s.keep) return {}
    const k = settleDispatch(s.keep, abilityOf(s))
    return k === s.keep ? {} : { keep: k }
  })
}

/** The report read: the next instruction can be given. */
export function readKeep(): void {
  setWorld((s) => {
    if (!s.keep) return {}
    const k = readReport(s.keep)
    return k === s.keep ? {} : { keep: k }
  })
}

/**
 * The child answered Nara's pause. A right answer raises `copies` to `runs`
 * through S0's own `raiseCompetence`; nothing ever lowers it.
 */
export function answerKeepPause(answer: PauseAnswer): void {
  setWorld((s) => {
    const d = s.keep?.dispatch
    if (!s.keep || !d?.report || d.report.pauseDay == null || d.report.pauseAnswer) return {}
    const keep = answerPause(s.keep, d.id, answer)
    const competence = s.plot.competence ? raiseCompetence(s.plot.competence, answer.right) : s.plot.competence
    return { keep, plot: { ...s.plot, competence } }
  })
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
  setWorld((s) => {
    // S2 moment 1: on Sela's errand the first step into the cold Foundry, before the brief, is the rusted strap.
    const beat = to === 'foundry' && cartStory(s) && s.prediction == null && s.strap === 'unseen'
    // A room never rides through the gate: the crossing closes whatever cut was open.
    return { zone: to, ring: 'world', held: null, near: null, crossings: s.crossings + 1, room: beat ? ('strap' as const) : ('none' as const), ...(beat ? { strap: 'shown' as const } : {}) }
  })
  // The first return to the Landing with a fortnight out settles it — once (settleDispatch ignores a settled one).
  if (to === 'landing') settleKeep()
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

/* ----------------------------------------------------------------------------
 * S2 — the cold bench (lib/supply.ts)
 * ------------------------------------------------------------------------- */

/** The bench works once the furnace has reached copper heat, or for a save that already poured — and, once opened, stays open. */
export function benchAvailable(s: WorldState): boolean {
  return s.zone === 'foundry' && benchOpens({ temp: s.furnace.temp, poured: s.poured, opened: s.supply != null })
}

/** Walk up to the jug or the balance: a camera cut into that station, the explorer held still beside it. */
export function openBench(room: 'bench' | 'balance'): void {
  setWorld((s) => {
    // Not while carrying: a piece in hand is put down by the explorer, never dropped by a camera cut.
    if (!benchAvailable(s) || s.held) return {}
    const supply = s.supply ?? newSupply()
    return { supply, room }
  })
}

function withBench(f: (b: Bench) => Bench): void {
  setWorld((s) => {
    if (!s.supply) return {}
    const b = f(s.supply.bench)
    return b === s.supply.bench ? {} : { supply: { ...s.supply, bench: b } }
  })
}

export const benchSink = (): void => withBench(sinkPattern)
export const benchMark = (): void => withBench(markRise)
export const benchLift = (): void => withBench(liftPattern)
export const benchDrop = (id: string): void => withBench((b) => benchDropAt(b, id))
/** A piece out of the water — or off the pan, which sends the set back to the jug and the camera with it. */
export function benchTake(id: string): void {
  withBench((b) => benchTakeAt(b, id))
  setWorld((s) => (s.room === 'balance' && s.supply?.bench.phase === 'matching' ? { room: 'bench' } : {}))
}
/** The set as it stands goes to the balance; the camera goes with it. */
export function benchDone(): void {
  withBench(benchDoneAt)
  setWorld((s) => (s.supply?.bench.phase === 'balancing' ? { room: 'balance' } : {}))
}
export const balanceAdd = (): void => withBench(addIngot)
export const balanceTake = (): void => withBench(takeIngot)
export const balanceInspect = (id: string): void => withBench((b) => benchInspectAt(b, id))
/** Sefu takes the dry pan, with his runner. The wet set stays where it is. */
export const balanceToFire = (): void => withBench(toFire)

/* ----------------------------------------------------------------------------
 * S2 round A2 — the mould at the furnace foot
 * ------------------------------------------------------------------------- */

/** The mould stands in the yard for a child on Sela's errand, or once the bench has been opened. */
export function mouldShown(s: WorldState): boolean {
  return cartStory(s) || s.supply != null
}

/** What the mould looks like now, read off the record and the sim clock. */
export function mouldLookOf(s: WorldState): MouldLook {
  const sup = s.supply
  if (!sup) return 'cold'
  return mouldLook(mouldStage(sup.bench, sup.cast), sup.pouredAt != null ? simTime - sup.pouredAt : null)
}

/** The furnace is at copper heat right now: lit, and at the reading the relight itself pours at. */
export function furnaceReady(s: WorldState): boolean {
  return s.furnace.lit && hotEnough(s.furnace.temp)
}

/** Why Sefu will not pour a waiting charge: the fire is below copper heat. Null when nothing blocks it. */
export function pourBlocked(s: WorldState): 'cold' | null {
  if (mouldLookOf(s) !== 'waiting') return null
  return furnaceReady(s) ? null : 'cold'
}

/** Walk up to the mould: a camera cut onto the casting pit, the explorer held still beside it. */
export function openMould(): void {
  // Not while carrying: a piece in hand is put down by the explorer, never dropped by a camera cut.
  setWorld((s) => (s.zone === 'foundry' && mouldShown(s) && !s.held ? { room: 'mould' } : {}))
}

/** The child says the word and Sefu pours the waiting charge. Never cold, never twice. */
export function castPour(): void {
  setWorld((s) => {
    const sup = s.supply
    if (!sup || pourBlocked(s)) return {}
    const cast = pourCharge(sup.bench, sup.cast)
    return cast === sup.cast ? {} : { supply: { ...sup, cast, pouredAt: simTime } }
  })
}

/** A short cast, once it has dulled and the mould is open, goes on the dry pan; the child and the camera go to the bench it sends them to. */
export function castBack(): void {
  setWorld((s) => {
    const sup = s.supply
    if (!sup || mouldLookOf(s) !== 'short') return {}
    const bench = backToBench(sup.bench, sup.cast)
    if (bench === sup.bench) return {}
    return { supply: { ...sup, bench, pouredAt: null }, room: bench.phase === 'balancing' ? 'balance' : 'bench' }
  })
}

/**
 * Sefu's question at the full mould, answered by pointing. The lesson's why:
 * one answer, Ploob's reasoned line, never a buzzer.
 */
export const MEASURE_WHY: Why = {
  ask: 'Which measurement told you how much?',
  options: [
    {
      key: 'right',
      text: 'The water: the pattern raised it to the mark, and the scrap had to raise it to the same mark.',
      right: true,
      line: "The water. The pattern raised it to the mark; scrap that raises it the same takes up the same space. Same space of copper, same strap.",
    },
    { key: 'heat_tells_amount', text: 'The furnace gauge: it showed the copper was hot enough.', right: false, line: 'The gauge says when copper will run. It cannot say how much to melt.' },
    { key: 'sefu_told', text: 'Sefu: he knew how much the gate needed.', right: false, line: 'Sefu asked you. He never gave a number. It came off the cold bench.' },
  ],
}
/** What each option is on screen: a thing to point at, not a sentence to read. */
export const MEASURE_POINTS: readonly { id: 'water' | 'gauge' | 'sefu'; label: string }[] = [
  { id: 'water', label: 'the water' },
  { id: 'gauge', label: 'the furnace' },
  { id: 'sefu', label: 'Sefu' },
]
/** Ploob's one nudge when a typed answer is on the right track but stops short (the balance, the weight). */
export const MEASURE_NUDGE = 'The balance matched dry copper to the wet set. What told you how big the set had to be?'

export function answerCastWhy(choice: number): void {
  setWorld((s) => {
    const sup = s.supply
    if (!sup || !kitCast(sup.cast) || sup.cast.why >= 0 || !MEASURE_WHY.options[choice]) return {}
    return { supply: { ...sup, cast: { ...sup.cast, why: choice } } }
  })
}

/** The same, in the learner's own words, judged: their sentence is kept when it was right. */
export function answerCastWhyText(text: string, verdict: 'right' | 'partial' | 'misconception' | 'off', misconception: string | null): void {
  setWorld((s) => {
    const sup = s.supply
    if (!sup || !kitCast(sup.cast) || sup.cast.why >= 0) return {}
    if (verdict === 'right') return { supply: { ...sup, cast: { ...sup.cast, why: MEASURE_WHY.options.findIndex((o) => o.right), whyText: text.trim() } } }
    if (verdict === 'misconception') {
      const i = MEASURE_WHY.options.findIndex((o) => o.key === misconception)
      return i >= 0 ? { supply: { ...sup, cast: { ...sup.cast, why: i } } } : {}
    }
    return {}
  })
}

/** What the learner measured on the way to the pour: the facts a judge may weigh. */
export function castFacts(s: WorldState): Record<string, string | number | boolean> {
  const sup = s.supply
  const b = sup?.bench
  const first = sup?.cast.pours[0]
  const last = lastPour(sup?.cast)
  return {
    water_before_cm3: JUG_START,
    water_with_the_pattern_under_cm3: markLevel(),
    scrap_reached_the_mark: b ? benchReached(b) : false,
    wet_set_weighed_g: b ? benchWetMass(b) : 0,
    dry_ingots_on_the_pan: b?.dry ?? 0,
    beam_was_level: last ? !last.guess : false,
    pours: sup?.cast.pours.length ?? 0,
    first_pour: first ? (first.short ? `short: ${castCm3(first)} of 1000 cm³` : 'filled the mould') : 'none',
    furnace_reading_c: Math.round(s.furnace.temp),
    sefu_gave_a_number: false,
  }
}

/* ----------------------------------------------------------------------------
 * S2 round A3 — the strap, the vice and the repair drawing (lib/bend.ts)
 * ------------------------------------------------------------------------- */

/** The strap bench stands beside Sefu for a child on Sela's errand. */
export function strapShown(s: WorldState): boolean {
  return cartStory(s)
}

/** Walk up to the strap bench: a camera cut onto the rusted strap and Sela's slate. */
export function openStrap(): void {
  setWorld((s) => (s.zone === 'foundry' && strapShown(s) && !s.held ? { room: 'strap', strap: s.strap === 'unseen' ? 'shown' : s.strap } : {}))
}

/** One tap takes the strap in the hand: the flakes fall, and what it is can be read off it. Only at the bench. */
export function takeStrap(): void {
  setWorld((s) => (s.room === 'strap' && s.strap === 'shown' ? { strap: 'taken' } : {}))
}

/** The vice stands under the east wall's rack whenever the mould stands in the yard. */
export function viceShown(s: WorldState): boolean {
  return mouldShown(s)
}

const NEW_BEND: Bend = initialBend()

/** The vice's state; a new vice until the bench has been opened. */
export function bendOf(s: WorldState): Bend {
  return s.supply?.bend ?? NEW_BEND
}

/** Walk up to the vice: a camera cut side-on to the strips. */
export function openVice(): void {
  // Not while carrying: a piece in hand is put down by the explorer, never dropped by a camera cut.
  setWorld((s) => (s.zone === 'foundry' && viceShown(s) && !s.held ? { room: 'vice' } : {}))
}

function withBend(f: (v: Bend, sup: Supply) => Bend, also?: (v: Bend) => Partial<Supply>): void {
  setWorld((s) => {
    const sup = s.supply
    if (!sup) return {}
    const cur = sup.bend ?? NEW_BEND
    const v = f(cur, sup)
    return v === cur ? {} : { supply: { ...sup, bend: v, ...(also?.(v) ?? {}) } }
  })
}

/** A runner is in the recovery tray right now: the mould has opened on a pour, and that pour's copper has not gone back to the bench. */
export function runnerBack(s: WorldState): boolean {
  const look = mouldLookOf(s)
  return look === 'short' || look === 'full'
}

/** Sefu cuts the test strip from the runner in the recovery tray. No runner in the tray, no strip. */
export function viceCut(): void {
  if (!runnerBack(getWorld())) return
  withBend((v, sup) => cutStrip(v, sup.cast))
}
export const vicePredict = (g: Guess): void => withBend((v) => predictStrip(v, g))
export const viceHang = (): void => withBend(hangIngot)
export const viceLift = (band: BendBand): void => withBend((v) => liftHanger(v, band))
export const viceFresh = (): void => withBend(freshStrips)

/** The drawing has its verb once the strips have told their story. */
export function drawingShown(s: WorldState): boolean {
  return viceShown(s) && bendOf(s).done
}

/**
 * The repair drawing, on its board beside the vice: only once the test is done. A record that already satisfies
 * the band (the band was changed mid-test) is settled as done on the way.
 */
export function openDrawing(band?: BendBand): void {
  if (band) withBend((v) => settleBend(v, band))
  setWorld((s) => (s.zone === 'foundry' && bendOf(s).done && !s.held ? { room: 'drawing' } : {}))
}

/** The child points at a part of the drawing, and the drawing moves: its clip starts on the sim clock. */
export const drawingPick = (part: DrawingPart): void => withBend((v) => pickDrawing(v, part), () => ({ drawnAt: simTime }))

/** "Watch again": the clip from the top. Only once something has been pointed at. */
export function drawingReplay(): void {
  setWorld((s) => (s.supply && bendOf(s).pick != null ? { supply: { ...s.supply, drawnAt: simTime } } : {}))
}

/** Seconds into the drawing's clip, or null when it is not playing. */
export function drawingElapsed(s: WorldState): number | null {
  const at = s.supply?.drawnAt
  return at == null ? null : simTime - at
}

/** Which beat of its clip the drawing is on: still until something is pointed at, square once it has played. */
export function drawingBeatOf(s: WorldState): DrawBeat {
  const el = drawingElapsed(s)
  if (el == null) return bendOf(s).pick != null ? 'square' : 'still'
  return drawBeat(el)
}

/** Where Sefu stands: by the gate, at the mould while there is something in it, at the vice once the kit is cast and his question answered. */
export type SefuSpot = 'gate' | 'mould' | 'vice'
export function sefuSpot(s: WorldState): SefuSpot {
  const sup = s.supply
  const look = mouldLookOf(s)
  const pouring = look === 'run' || look === 'cool' || look === 'open'
  // He does not walk off while the child is still looking at the mould with him.
  if (sup && kitCast(sup.cast) && sup.cast.why >= 0 && s.room !== 'mould') return 'vice'
  // Before the kit, he comes over while the child is at the vice or the drawing — never away from a pour.
  if ((s.room === 'vice' || s.room === 'drawing') && !pouring) return 'vice'
  return look !== 'cold' ? 'mould' : 'gate'
}

/**
 * The bend's why. The options' `text` is what the judge weighs; `BEND_SHORT`
 * is what the child taps; Ploob's line back is built from the child's own
 * record (`bendWhyLine`).
 */
export const BEND_WHY: Why = {
  ask: 'Why does the gate still get copper?',
  options: [
    { key: 'copper_stronger', text: 'Copper is stronger than iron.', right: false, line: 'Iron is the stronger. But iron rusts.' },
    {
      key: 'right',
      text: 'Copper does not rust away in the wet, and the brace carries the weight of the gate: the straps only have to last and keep it straight.',
      right: true,
      line: 'Copper lasts in the wet, and the brace takes the weight.',
    },
    { key: 'only_metal', text: 'Copper is the only metal Sefu had.', right: false, line: 'Sefu has iron: it is in the vice. He picked copper for a gate that stands in the wet.' },
  ],
}
/** What each option is on screen: a few words to tap, in the options' order. */
export const BEND_SHORT: readonly string[] = ['Stronger than iron', 'No rust, and the brace takes the weight', 'What Sefu had']
/** Ploob's one nudge when a typed answer is on the right track but stops short. */
export const BEND_NUDGE = 'Your record has two old strips in it. What did the wet do to each?'

/** Ploob's reasoned line for an answer, in the child's own readings. */
export function bendWhyLine(s: WorldState, choice: number): string {
  const r = bendOf(s).readings
  const opt = BEND_WHY.options[choice]
  if (!opt) return ''
  const cu = readingText(STRIP.copper, r.copper)
  if (opt.key === 'right') return `The rusted strip ${readingText(STRIP.rusted, r.rusted)}. Old copper held as long as new: it ${cu}. ${opt.line}`
  if (opt.key === 'copper_stronger') return `Your record: copper ${cu}; new iron ${readingText(STRIP.iron, r.iron)}. ${opt.line}`
  return opt.line
}

export function answerBendWhy(choice: number): void {
  withBend((v) => answerBend(v, choice))
}

/** The same, in the learner's own words, judged: their sentence is kept when it was right. */
export function answerBendWhyText(text: string, verdict: 'right' | 'partial' | 'misconception' | 'off', misconception: string | null): void {
  withBend((v) => {
    if (verdict === 'right') return answerBend(v, BEND_WHY.options.findIndex((o) => o.right), text.trim())
    if (verdict === 'misconception') return answerBend(v, BEND_WHY.options.findIndex((o) => o.key === misconception))
    return v
  })
}

/** What the learner saw at the vice and the drawing: the facts a judge may weigh. */
export function bendFacts(s: WorldState): Record<string, string | number | boolean> {
  const v = bendOf(s)
  const say = (id: keyof typeof STRIP): string => readingText(STRIP[id], v.readings[id]) || 'not loaded'
  return {
    weights: 'copper ingots of 896 g, the same number hung on all four strips at once',
    new_copper: say('copper'),
    old_copper: say('oldCopper'),
    new_iron: say('iron'),
    rusted_iron: say('rusted'),
    every_reading_exact: STRIPS.every((st) => exact(v.readings[st.id])),
    guessed_first_to_give: v.guess == null ? 'none' : v.guess === 'unsure' ? 'not sure' : STRIP[v.guess].label,
    pointed_at_on_the_drawing: v.pick ?? 'nothing',
    the_drawing_shows: 'a timber brace carrying the gate leaf; copper straps and copper pins keeping it straight; no iron touching copper',
    sefu_gave_a_number: false,
  }
}

/** Where the vice stands for a band (the HUD's and the suites' one read). */
export function viceStageOf(s: WorldState, band: BendBand): ReturnType<typeof bendStage> {
  return bendStage(bendOf(s), band)
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
