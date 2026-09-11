/**
 * The Foundry Game — the pure model behind Door 1.
 *
 * The Atom Foundry taught atomic structure and never asked the learner to
 * *do* anything with it. This module is the game layer: a **door** is a place
 * on the bench, a **level** is a target stated in the cabinet's own units —
 * protons, neutrons, electrons — and a hand-in scores the build against the
 * target through `lib/challenge`, which already knew the Foundry would bank
 * protons before the Foundry did.
 *
 * Three rules shaped it, each closing an easier design:
 *
 * 1. **Identity is proton count, and nothing else.** A level that says "keep
 *    it carbon" is checked on protons alone; an ion and an isotope are still
 *    carbon. The wall's tile follows the same rule (`lib/atoms` already does),
 *    so the model and the picture cannot disagree.
 *
 * 2. **The guess comes before the model is shown.** Every brief opens on a
 *    number the learner commits — never a caption — and the answer is the
 *    first thing Ploob says. The guess is recorded as a prediction, so it is
 *    evidence, not decoration.
 *
 * 3. **Score is not XP.** A hand-in awards a `ChallengeScore` and a journal
 *    card. XP still comes only from recorded evidence; the game produces that
 *    as a side effect, never as a reward for clicks.
 *
 * Pure: no React, no three, no browser. Checked by `verify-foundry-model.mjs`.
 */

import type { Band } from './bands'
import {
  CHALLENGE_VERSION,
  rngFor,
  seedFromCode,
  scoreAttempt,
  type Challenge,
  type ChallengeAttempt,
  type ChallengeScore,
  type ResourceBudget,
} from './challenge'
import { ELEMENT_BY_Z, MAX_Z, shellsFor, stabilityOf } from './atoms'
import { appetiteOf, formulaFor, pairOutlook, ratioQuestion } from './matter'

/* ------------------------------------------------------------------ */
/* Doors                                                               */
/* ------------------------------------------------------------------ */

export type DoorId = 1 | 2 | 3 | 4 | 5

export interface Door {
  id: DoorId
  name: string
  /** The game in three words. */
  game: string
  /** What the learner makes there, in a sentence. */
  where: string
  built: boolean
}

export const DOORS: Door[] = [
  { id: 1, name: 'The Forge', game: 'Make it carbon', where: 'one atom, built from what you catch', built: true },
  { id: 2, name: 'The Bench', game: 'Make salt', where: 'two atoms, and the rule that joins them', built: true },
  { id: 3, name: 'The Jar', game: "What's in this?", where: 'a thing from the kitchen, taken apart', built: false },
  { id: 4, name: 'The Wall', game: 'Light the wall', where: 'the table as a map you fill', built: false },
  { id: 5, name: 'The Reaction Line', game: 'Nothing missing', where: 'a room supplying each other', built: false },
]

export const DOOR_BY_ID: Record<number, Door> = Object.fromEntries(DOORS.map((d) => [d.id, d]))

/* ------------------------------------------------------------------ */
/* Builds and targets                                                  */
/* ------------------------------------------------------------------ */

export interface Build {
  protons: number
  neutrons: number
  electrons: number
}

export const EMPTY: Build = { protons: 0, neutrons: 0, electrons: 0 }

/** Charge is protons minus electrons. Always. */
export function chargeOf(b: Build): number {
  return b.protons - b.electrons
}

/** Mass number is protons plus neutrons of THIS isotope — never relative atomic mass. */
export function massNumberOf(b: Build): number {
  return b.protons + b.neutrons
}

/** The element the build represents, by proton count alone; null when there is no nucleus or it is past the wall. */
export function identityOf(b: Build): { z: number; symbol: string; name: string } | null {
  if (b.protons < 1 || b.protons > MAX_Z) return null
  const e = ELEMENT_BY_Z[b.protons]
  return { z: e.z, symbol: e.symbol, name: e.name }
}

/** Nuclide notation pieces for a label: "12", "C", "+" */
export function nuclide(b: Build): { a: number; symbol: string; charge: string } {
  const id = identityOf(b)
  const q = chargeOf(b)
  const charge = q === 0 ? '' : q > 0 ? (q === 1 ? '+' : `${q}+`) : q === -1 ? '−' : `${-q}−`
  return { a: massNumberOf(b), symbol: id?.symbol ?? '?', charge }
}

/** The label a learner reads on the brass tag: what stability means for this nucleus, as data — no theatre. */
export function stabilityWord(b: Build): 'stable' | 'known to decay' | 'not in this table' | 'no nucleus' {
  if (b.protons < 1) return 'no nucleus'
  if (b.protons > MAX_Z) return 'not in this table'
  const s = stabilityOf(b.protons, b.neutrons)
  if (s === 'stable') return 'stable'
  if (s === 'unstable') return 'known to decay'
  return 'not in this table'
}

/**
 * A level's target. Two shapes:
 *
 * - `exact`: make this build (helium: 2·2·2). Matched part by part.
 * - `keep`:  start from `from`; keep the element; change the listed things.
 *            "Keep it carbon" — change charge and mass number, protons stay six.
 */
export type Target =
  | { kind: 'exact'; build: Build }
  | { kind: 'keep'; from: Build; change: Array<'charge' | 'mass'> }
  /**
   * Door 2. Two element slots rather than a particle count — the bench asks
   * *which two atoms*, and (when `askRatio`) what they make of each other.
   *
   * `want` is unordered: the counting rule does not care which pad you filled
   * first, and neither does this.
   */
  | { kind: 'pair'; want: [number, number]; askRatio: boolean }

/**
 * What is on the two pads, and what the learner has predicted.
 *
 * Kept apart from `Build` on purpose. A build is a count of particles inside
 * one atom; a bench is two whole atoms and a guess about them. Folding the
 * second into the first is how a model starts lying about what it represents.
 */
export interface Bench {
  a: number | null
  b: number | null
  /** The learner's ratio prediction, locked in before any readout. */
  predicted: number | null
}

export const EMPTY_BENCH: Bench = { a: null, b: null, predicted: null }

/** True when the two pads hold the wanted pair, in either order. */
export function pairMatches(bench: Bench, want: [number, number]): boolean {
  if (bench.a === null || bench.b === null) return false
  const [x, y] = want
  return (bench.a === x && bench.b === y) || (bench.a === y && bench.b === x)
}

export interface Level {
  id: string
  door: DoorId
  /** 1, 2, 3 — the level you can hit at Explorer; the one that needs the rule; the one that needs the number. */
  tier: 1 | 2 | 3
  /** Seven words or fewer. This is the Play button's label. */
  title: string
  /** One sentence the brief opens with. */
  blurb: string
  /** The guess the brief asks for, before the model is shown. */
  guess: { question: string; answer: number; min: number; max: number; unit: string }
  target: Target
  /** What the gather round can bank, per particle. Generous: the puzzle is the build, not the catch. */
  budget: ResourceBudget
  /** Seconds of catching for a band that gathers. */
  gatherSeconds: number
  /** The line Ploob opens the round with (after answering the guess). */
  open: string
  /** What Ploob says the moment the target is met. */
  done: string
}

export const LEVELS: Level[] = [
  {
    id: 'forge-helium',
    door: 1,
    tier: 1,
    title: 'Forge the gas that lifts a balloon',
    blurb: 'Helium is the lightest gas that never reacts with anything. Build one atom of it from what you catch.',
    guess: {
      question: 'Before you look: how many particles does one helium atom need — protons, neutrons and electrons together?',
      answer: 6,
      min: 1,
      max: 12,
      unit: 'particles',
    },
    target: { kind: 'exact', build: { protons: 2, neutrons: 2, electrons: 2 } },
    budget: { proton: 4, neutron: 4, electron: 4 },
    gatherSeconds: 20,
    open: 'Six — two of each. Catch what falls; build with what you catch.',
    done: 'Helium. The first shell is full at two — that is why it never reacts with anything. Hand it in.',
  },
  {
    id: 'keep-carbon',
    door: 1,
    tier: 2,
    title: 'Keep it carbon — change two things',
    blurb: 'Carbon-12 is on the stage. Change two things about it. It must still be carbon when you hand it in.',
    guess: {
      question: 'Before you touch it: how many protons does an atom need to be carbon?',
      answer: 6,
      min: 1,
      max: 12,
      unit: 'protons',
    },
    target: { kind: 'keep', from: { protons: 6, neutrons: 6, electrons: 6 }, change: ['charge', 'mass'] },
    budget: { proton: 2, neutron: 3, electron: 3 },
    gatherSeconds: 15,
    open: 'Six protons — that is what names it. Change the charge and the mass number without touching them.',
    done: 'Still carbon. The protons never moved; everything else did. Hand it in.',
  },
  {
    id: 'to-order',
    door: 1,
    tier: 3,
    title: 'To order: carbon-13, charge +1',
    blurb: 'A partner has sent a target: the same element, a set charge, a set mass number. Build exactly that.',
    guess: {
      question: 'Carbon-13 with charge +1: how many neutrons does that take?',
      answer: 7,
      min: 4,
      max: 10,
      unit: 'neutrons',
    },
    target: { kind: 'exact', build: { protons: 6, neutrons: 7, electrons: 5 } },
    budget: { proton: 8, neutron: 9, electron: 8 },
    gatherSeconds: 0,
    open: 'Seven. Mass number thirteen is six protons and seven neutrons; charge +1 is one electron short.',
    done: 'Carbon-13, charge +1 — exactly to order. Hand it in.',
  },

  /* ---- Door 2 · The Bench ---- */
  {
    id: 'bench-water',
    door: 2,
    tier: 1,
    title: 'Put two atoms together and make water',
    blurb: 'One atom on its own is not a substance. Put a second one beside it and the counting rule decides what forms.',
    guess: {
      question: 'Before you look: how many electrons does an oxygen atom have in its outer shell?',
      answer: 6,
      min: 1,
      max: 8,
      unit: 'electrons',
    },
    target: { kind: 'pair', want: [1, 8], askRatio: true },
    budget: { H: 4, O: 2 },
    gatherSeconds: 0,
    open: 'Six — so oxygen has room for two more. Hydrogen brings one each. Put them on the pads and say what you think forms.',
    done: 'Water. Two hydrogens for one oxygen, because oxygen had two spaces and each hydrogen filled one. Hand it in.',
  },
  {
    id: 'bench-salt',
    door: 2,
    tier: 2,
    title: 'Make the salt in your jollof',
    blurb: 'Sodium is a metal that catches fire in water. Chlorine is a poison gas. Together they are the salt on every table in Ghana.',
    guess: {
      question: 'Before you touch it: how many electrons does a sodium atom have in its outer shell?',
      answer: 1,
      min: 1,
      max: 8,
      unit: 'electrons',
    },
    target: { kind: 'pair', want: [11, 17], askRatio: true },
    budget: { Na: 4, Cl: 4 },
    gatherSeconds: 0,
    open: 'One. Sodium has one to give and chlorine has one space to fill. Put them on the pads, then say what you think forms.',
    done: 'Salt. There are no molecules in it anywhere — just charged atoms in a grid, which is why it is a hard cube that melts at 800 °C. Hand it in.',
  },
  {
    id: 'bench-limits',
    door: 2,
    tier: 3,
    title: 'Find where the counting rule runs out',
    blurb: 'The rule has been right every time so far. Put sulfur and oxygen on the pads and read what the bench admits.',
    guess: {
      question: 'How many electrons does a sulfur atom have in its outer shell?',
      answer: 6,
      min: 1,
      max: 8,
      unit: 'electrons',
    },
    target: { kind: 'pair', want: [8, 16], askRatio: false },
    budget: { S: 3, O: 3 },
    gatherSeconds: 0,
    open: 'Six, the same as oxygen. Put them together and watch the rule reach its edge — the bench will tell you where.',
    done: 'There it is. The rule says one for one; the real world makes SO₂ and SO₃, because sulfur can use more of its electrons than the rule allows. A rule with a known edge beats a rule that pretends. Hand it in.',
  },
]

export const LEVEL_BY_ID: Record<string, Level> = Object.fromEntries(LEVELS.map((l) => [l.id, l]))

/** Which tier the band opens on. Explorer starts at 1, Scientist at 2, Analyst at 3 — all three stay reachable. */
export function levelForBand(band: Band, door: DoorId = 1): Level {
  const tier: 1 | 2 | 3 = band === 'explorer' ? 1 : band === 'scientist' ? 2 : 3
  return LEVELS.find((l) => l.door === door && l.tier === tier) ?? LEVELS[0]
}

/** Where a level's bench starts: empty for an exact target, the `from` build for a keep. */
export function startBuild(level: Level): Build {
  return level.target.kind === 'keep' ? { ...level.target.from } : { ...EMPTY }
}

/** True for the levels that are played on the two-pad bench rather than the forge. */
export function isPairLevel(level: Level): boolean {
  return level.target.kind === 'pair'
}

/* ------------------------------------------------------------------ */
/* The gauge                                                           */
/* ------------------------------------------------------------------ */

export interface GaugeCell {
  id: 'protons' | 'neutrons' | 'electrons' | 'identity' | 'charge' | 'mass' | 'pads' | 'ratio'
  label: string
  /** The reading, as a short string. */
  value: string
  /** What the target asks, as a short string. */
  want: string
  met: boolean
  /** What is left to do, in the learner's words — empty when met. */
  todo: string
}

export interface Gauge {
  cells: GaugeCell[]
  /** Parts met of parts asked. */
  met: number
  of: number
  hit: boolean
}

/** The symbol on a pad, or a dash. */
function symbolOf(z: number | null): string {
  if (z === null) return '—'
  return ELEMENT_BY_Z[z]?.symbol ?? '?'
}

/**
 * The subscript the ratio dial is asking for, for a wanted pair.
 *
 * It goes through `ratioQuestion` rather than reading a subscript directly, so
 * the dial's label, the recorded answer and the marking cannot drift apart —
 * which is exactly how a learner who correctly predicted 2 for water was once
 * marked wrong.
 */
export function pairAnswer(want: [number, number]): number | null {
  const f = formulaFor(want[0], want[1])
  if (!f) return null
  return ratioQuestion(f)?.answer ?? null
}

/**
 * The pinned gauge: the target and the reading on one plate.
 *
 * For an exact target, one cell per particle. For a keep target, the identity
 * cell (must hold) plus one cell per thing that must change. `met / of` is what
 * the score's accuracy reads, so the gauge and the score can never disagree.
 */
export function gaugeFor(level: Level, b: Build, bench: Bench = EMPTY_BENCH): Gauge {
  const t = level.target
  const cells: GaugeCell[] = []
  if (t.kind === 'pair') {
    /*
     * The gauge at Door 2 is where THE SPOILER CHECK lives in the UI.
     *
     * The `pads` cell says which two atoms are down — never what they make.
     * The `ratio` cell shows the learner their *own* prediction and whether it
     * held, and it shows nothing at all before they have locked one in. A
     * readout that appears above an unanswered dial turns every prediction in
     * the cabinet into a reading-comprehension exercise, silently, with no
     * error and nothing visibly wrong.
     */
    const on = pairMatches(bench, t.want)
    const both = bench.a !== null && bench.b !== null
    cells.push({
      id: 'pads',
      label: 'on the bench',
      value: both ? `${symbolOf(bench.a)} + ${symbolOf(bench.b)}` : bench.a !== null || bench.b !== null ? 'one pad filled' : 'both pads empty',
      want: 'two atoms',
      met: on,
      todo: on ? '' : both ? 'not this pair — try again' : 'put an atom on each pad',
    })
    if (t.askRatio) {
      const answer = pairAnswer(t.want)
      const locked = bench.predicted !== null
      const right = locked && answer !== null && bench.predicted === answer
      cells.push({
        id: 'ratio',
        label: 'your prediction',
        value: locked ? String(bench.predicted) : '—',
        want: locked ? (right ? 'held' : 'not this time') : 'say it first',
        met: right,
        todo: locked ? (right ? '' : 'the bench will show you why') : 'set the dial, then lock it in',
      })
    }
    const met = cells.filter((c) => c.met).length
    return { cells, met, of: cells.length, hit: met === cells.length }
  }
  if (t.kind === 'exact') {
    const rows: Array<['protons' | 'neutrons' | 'electrons', string]> = [
      ['protons', 'protons'],
      ['neutrons', 'neutrons'],
      ['electrons', 'electrons'],
    ]
    for (const [id, label] of rows) {
      const have = b[id]
      const want = t.build[id]
      const met = have === want
      const d = want - have
      cells.push({
        id,
        label,
        value: String(have),
        want: String(want),
        met,
        todo: met ? '' : d > 0 ? `${d} to go` : `${-d} too many`,
      })
    }
  } else {
    const from = t.from
    const kept = b.protons === from.protons
    cells.push({
      id: 'identity',
      label: 'protons',
      value: String(b.protons),
      want: `keep ${from.protons}`,
      met: kept,
      todo: kept ? '' : b.protons > from.protons ? 'one too many — undo' : 'put one back',
    })
    if (t.change.includes('charge')) {
      const was = chargeOf(from)
      const now = chargeOf(b)
      const met = now !== was
      cells.push({
        id: 'charge',
        label: 'charge',
        value: fmtCharge(now),
        want: `change from ${fmtCharge(was)}`,
        met,
        todo: met ? '' : 'add or take an electron',
      })
    }
    if (t.change.includes('mass')) {
      const was = massNumberOf(from)
      const now = massNumberOf(b)
      const met = now !== was
      cells.push({
        id: 'mass',
        label: 'mass number',
        value: String(now),
        want: `change from ${was}`,
        met,
        todo: met ? '' : 'add or take a neutron',
      })
    }
  }
  const met = cells.filter((c) => c.met).length
  const of = cells.length
  // A keep target is only hit when the identity held — changing two things
  // and the element is not "keep it carbon", whatever else lines up.
  const hit = t.kind === 'keep' ? cells[0].met && met === of : met === of
  return { cells, met, of, hit }
}

export function fmtCharge(q: number): string {
  if (q === 0) return '0'
  return q > 0 ? `+${q}` : `−${-q}`
}

/**
 * The single next thing to do, for the aim ring: which particle the tray
 * should point at. Null when the target is met (then Hand in wears the ring).
 */
export function nextPart(level: Level, b: Build): 'proton' | 'neutron' | 'electron' | null {
  const t = level.target
  if (t.kind === 'exact') {
    if (b.protons !== t.build.protons) return 'proton'
    if (b.neutrons !== t.build.neutrons) return 'neutron'
    if (b.electrons !== t.build.electrons) return 'electron'
    return null
  }
  // The bench has no particle tray, so it has nothing to aim at.
  if (t.kind === 'pair') return null
  if (b.protons !== t.from.protons) return 'proton'
  if (t.change.includes('charge') && chargeOf(b) === chargeOf(t.from)) return 'electron'
  if (t.change.includes('mass') && massNumberOf(b) === massNumberOf(t.from)) return 'neutron'
  return null
}

/* ------------------------------------------------------------------ */
/* Ploob                                                               */
/* ------------------------------------------------------------------ */

/**
 * What Ploob says about the build right now — derived, never scripted per
 * click, so it is always true. Names what changed and why it matters; never
 * praises a click; never prints the number the learner is meant to work out.
 */
/**
 * Ploob at the bench.
 *
 * Same discipline as the forge: every line is derived from the model, and none
 * of them names the number being predicted. Before a prediction is locked he
 * talks about *appetite* — what each atom has and what it wants — which is
 * exactly the material a learner needs to work the answer out, and is not the
 * answer.
 */
export function benchLine(level: Level, bench: Bench): string {
  if (level.target.kind !== 'pair') return level.open
  const t = level.target
  if (bench.a === null && bench.b === null) return level.open
  if (bench.a === null || bench.b === null) {
    const z = (bench.a ?? bench.b) as number
    const el = ELEMENT_BY_Z[z]
    return el ? `${el.name}: ${appetiteOf(z)}. Now put something on the other pad.` : level.open
  }
  const look = pairOutlook(bench.a, bench.b)
  if (!pairMatches(bench, t.want)) {
    const a = ELEMENT_BY_Z[bench.a]
    const b = ELEMENT_BY_Z[bench.b]
    const heads = a && b ? `${a.name} and ${b.name}: ${look.tag}. ` : ''
    return `${heads}Not the pair this job asked for, though — take one off and try again.`
  }
  if (t.askRatio && bench.predicted === null) {
    const a = ELEMENT_BY_Z[bench.a]
    const b = ELEMENT_BY_Z[bench.b]
    return a && b ? `${a.symbol}: ${appetiteOf(a.z)}. ${b.symbol}: ${appetiteOf(b.z)}. Say what you think forms, then lock it in.` : look.why
  }
  return level.done
}

export function ploobLine(level: Level, b: Build, prev: Build | null): string {
  const g = gaugeFor(level, b)
  if (g.hit) return level.done
  const id = identityOf(b)
  if (prev) {
    if (b.protons !== prev.protons) {
      const was = identityOf(prev)
      if (id && was && id.z !== was.z) return `${was.name} became ${id.name.toLowerCase()} — the proton count is the name.`
      if (id && !was) return `${id.name}. One proton names it.`
      if (!id && was) return 'No nucleus, no atom. Put a proton back.'
    }
    if (b.electrons !== prev.electrons) {
      const q = chargeOf(b)
      if (q === 0) return `Balanced again — charge 0. Still ${id ? id.name.toLowerCase() : 'nothing'}.`
      return `Charge ${fmtCharge(q)} — ${b.electrons > b.protons ? 'more electrons than protons' : 'more protons than electrons'}. Still ${id ? id.name.toLowerCase() : 'nothing'}: the protons didn't move.`
    }
    if (b.neutrons !== prev.neutrons) {
      return `Mass number ${massNumberOf(b)} now. Same element — neutrons change the weight, not the name.`
    }
  }
  const part = nextPart(level, b)
  if (!id) return 'Start with a proton. That is what names an atom.'
  if (part === 'proton') return `${id.name} — one more proton and the name changes.`
  if (part === 'neutron') return 'Neutrons next: they add mass and change nothing else about the name.'
  if (part === 'electron') return 'Electrons next: they set the charge. Same protons, same name.'
  return level.open
}

/* ------------------------------------------------------------------ */
/* The catch                                                           */
/* ------------------------------------------------------------------ */

export type Kind = 'proton' | 'neutron' | 'electron'
export const KINDS: Kind[] = ['proton', 'neutron', 'electron']

/**
 * What falls during the gather round, from the seed and nothing else, so two
 * people on one link catch from the same sky. A gentle bias toward what the
 * level needs — the catch is the arcade minute, not the puzzle.
 */
export function rain(seed: number, level: Level, count = 40): Kind[] {
  const rng = rngFor(seed)
  const need = level.budget
  const weights = KINDS.map((k) => 1 + (need[k] ?? 0))
  const total = weights.reduce((a, b) => a + b, 0)
  const out: Kind[] = []
  for (let i = 0; i < count; i++) {
    let r = rng() * total
    let pick: Kind = 'proton'
    for (let j = 0; j < KINDS.length; j++) {
      r -= weights[j]
      if (r <= 0) {
        pick = KINDS[j]
        break
      }
    }
    out.push(pick)
  }
  return out
}

/** The bank after a catch: what fell and was tapped, capped at the level's budget so the tray never overflows. */
export function bankOf(caught: Kind[], level: Level): ResourceBudget {
  const bank: ResourceBudget = { proton: 0, neutron: 0, electron: 0 }
  for (const k of caught) bank[k] = Math.min(level.budget[k] ?? 0, (bank[k] ?? 0) + 1)
  return bank
}

/** What the target needs from the bank, over the start build. */
export function needOf(level: Level): ResourceBudget {
  const s = startBuild(level)
  const t = level.target
  if (t.kind === 'exact') {
    return {
      proton: Math.max(0, t.build.protons - s.protons),
      neutron: Math.max(0, t.build.neutrons - s.neutrons),
      electron: Math.max(0, t.build.electrons - s.electrons),
    }
  }
  // A bench level spends atoms, not particles — its budget is keyed by symbol
  // and the spine never interprets it, so there is nothing to report here.
  if (t.kind === 'pair') return {}
  // A keep target can be met by adding OR taking; one of each kind it may change is enough to add.
  return {
    proton: 0,
    neutron: t.change.includes('mass') ? 1 : 0,
    electron: t.change.includes('charge') ? 1 : 0,
  }
}

/**
 * A thin catch is never a dead end. After the round the crucibles fill the
 * bank up to what the target needs — said out loud by Ploob, and paid for in
 * thrift, since the score reads spend against the bank. Returns the bank and
 * whether anything was added.
 */
export function topUp(bank: ResourceBudget, level: Level): { bank: ResourceBudget; topped: boolean } {
  const need = needOf(level)
  const out: ResourceBudget = { ...bank }
  let topped = false
  for (const k of KINDS) {
    if ((out[k] ?? 0) < (need[k] ?? 0)) {
      out[k] = need[k]
      topped = true
    }
  }
  return { bank: out, topped }
}

/** Can this build be made from the bank, starting from the level's start build? */
export function affordable(level: Level, bank: ResourceBudget, b: Build): boolean {
  const s = startBuild(level)
  return (
    Math.max(0, b.protons - s.protons) <= (bank.proton ?? 0) &&
    Math.max(0, b.neutrons - s.neutrons) <= (bank.neutron ?? 0) &&
    Math.max(0, b.electrons - s.electrons) <= (bank.electron ?? 0)
  )
}

/** What the build has drawn from the bank so far — the tray's "left" badges. */
export function spentOf(level: Level, b: Build): ResourceBudget {
  const s = startBuild(level)
  return {
    proton: Math.max(0, b.protons - s.protons),
    neutron: Math.max(0, b.neutrons - s.neutrons),
    electron: Math.max(0, b.electrons - s.electrons),
  }
}

/* ------------------------------------------------------------------ */
/* The challenge — the link                                            */
/* ------------------------------------------------------------------ */

/** The setup string carries the level and its target, so a link is the whole world. */
export function setupOf(level: Level): string {
  const t = level.target
  if (t.kind === 'pair') return `${level.id}:${t.want[0]}+${t.want[1]}${t.askRatio ? ':ratio' : ''}`
  return t.kind === 'exact'
    ? `${level.id}:${t.build.protons}.${t.build.neutrons}.${t.build.electrons}`
    : `${level.id}:${t.from.protons}.${t.from.neutrons}.${t.from.electrons}:${t.change.join('+')}`
}

/** Read a level back from a setup string; unknown or malformed → null, never a guess. */
export function levelFromSetup(setup: string): Level | null {
  const [id] = setup.split(':')
  const level = LEVEL_BY_ID[id]
  if (!level) return null
  // The setup must still describe the level it names — a link that has been
  // fiddled with is refused rather than half-read.
  return setupOf(level) === setup ? level : null
}

/** Build the challenge for a level: a seed, the target as setup, a match goal, the bank as budget. */
export function challengeFor(level: Level, band: Band, seed: number, by?: string): Challenge {
  const g = gaugeFor(level, startBuild(level))
  return {
    v: CHALLENGE_VERSION,
    cabinet: 'atoms',
    seed,
    setup: setupOf(level),
    band,
    goal: { metric: 'parts', direction: 'atLeast', target: g.of, tolerance: 0, unit: 'parts' },
    budget: { ...level.budget },
    gatherSeconds: band === 'explorer' ? level.gatherSeconds : 0,
    by,
  }
}

/** A fresh solo seed for a level, from a session code — the same shape the Sugar Line uses. */
export function soloSeed(sessionCode: string, level: Level): number {
  return seedFromCode(`${sessionCode}:${level.id}`)
}

/** Score a hand-in: `best` is parts met, so accuracy is met/of; trials and spend do the rest. */
export function attemptFor(
  level: Level,
  challenge: Challenge,
  b: Build,
  trials: number,
  bank: ResourceBudget,
  seconds: number,
  bench: Bench = EMPTY_BENCH,
): { attempt: ChallengeAttempt; score: ChallengeScore } {
  const g = gaugeFor(level, b, bench)
  const spent = spentOf(level, b)
  const attempt: ChallengeAttempt = {
    challengeId: '',
    best: g.hit ? g.of : Math.min(g.met, g.of - 1),
    hit: g.hit,
    trials: Math.max(1, trials),
    spent,
    gathered: bank,
    seconds,
  }
  return { attempt, score: scoreAttempt(challenge, attempt) }
}

/* ------------------------------------------------------------------ */
/* The share card                                                      */
/* ------------------------------------------------------------------ */

/**
 * A nickname fit to send.
 *
 * The card and the link carry exactly one thing about the sender, and this is
 * it — so what a child can put in that field is worth being strict about. No
 * "@" and no digit runs that could be a handle or a number; letters, spaces,
 * one hyphen or apostrophe's worth of ordinary names, and sixteen characters,
 * which is enough for any name a child calls themselves and not enough for a
 * sentence about where they live.
 *
 * Empty in, empty out: the card then says "Someone", which is a fine thing for
 * it to say and much better than a half-scrubbed string.
 *
 * Two functions, because they run at different moments. `cleanNickname` runs
 * on every keystroke and so must never eat a trailing space — a child typing
 * "Ama Serwaa" needs the space after "Ama" to survive long enough to type the
 * next letter. `sendableNickname` runs when the card is drawn and the link is
 * built, and that one trims both ends, because nothing should travel with
 * whitespace on it.
 */
export const NICKNAME_MAX = 16

export function cleanNickname(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{N} '-]/gu, '')
    .replace(/\d{3,}/gu, '')
    .replace(/\s+/gu, ' ')
    .trimStart()
    .slice(0, NICKNAME_MAX)
}

/** What actually goes on the card and into the link. */
export function sendableNickname(raw: string): string {
  return cleanNickname(raw).trim()
}

export interface ShareCard {
  /** "Kwame forged helium" */
  headline: string
  /** The dare, in the player's words by default. */
  dare: string
  nuclide: { a: number; symbol: string; charge: string }
  /** Tiles lit on the wall, by z. */
  lit: number[]
  trials: number
  stars: 0 | 1 | 2 | 3
}

export function shareCardFor(level: Level, b: Build, by: string | undefined, lit: number[], trials: number, stars: 0 | 1 | 2 | 3): ShareCard {
  const id = identityOf(b)
  const who = by && by.trim() ? by.trim() : 'Someone'
  const what = level.target.kind === 'keep' ? 'kept it carbon' : `forged ${id ? id.name.toLowerCase() : 'an atom'}`
  return {
    headline: `${who} ${what}`,
    dare: trials === 1 ? 'Can you do it in one trial?' : `Can you do it in fewer than ${trials} trials?`,
    nuclide: nuclide(b),
    lit,
    trials,
    stars,
  }
}

/** For the wall: which shell the build's outermost electron sits in, 1-based; 0 when there are no electrons. */
export function shellCount(b: Build): number {
  return shellsFor(b.electrons).length
}
