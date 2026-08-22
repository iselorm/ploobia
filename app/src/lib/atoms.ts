/**
 * Atom Foundry — pure logic for the chemistry cabinet.
 *
 * The one idea: the periodic table is a CONSEQUENCE, not a poster. Element
 * identity = proton count; chemistry = the outermost electrons; the table's
 * rows and columns are shell-filling written down. So the learner builds atoms
 * particle by particle and the table assembles itself on a dark wall.
 *
 * Everything numeric in here is real: first ionisation energies in kJ/mol,
 * stable-isotope neutron counts, common mass numbers. The instrument (the
 * "grip probe") measures how hard the atom holds its outer electron — which is
 * exactly what first ionisation energy is, so the sawtooth the learner plots
 * is the actual experimental evidence that shells exist.
 */

import type { Band } from './bands'
import type { SkillId } from './events'

/* ------------------------------------------------------------------ */
/* Element data (Z = 1–20, all real)                                  */
/* ------------------------------------------------------------------ */

export type Category = 'alkali' | 'alkaline' | 'metal' | 'metalloid' | 'nonmetal' | 'halogen' | 'noble'

export interface ElementInfo {
  z: number
  symbol: string
  name: string
  /** Mass number of the most common isotope. */
  a: number
  /** First ionisation energy, kJ/mol (real). */
  ie: number
  /** Neutron counts of the stable isotopes (real). */
  stableN: number[]
  category: Category
  /** One short, true, surprising thing — shown on the wall tile's fact card. */
  fact: string
}

export const ELEMENTS: ElementInfo[] = [
  { z: 1, symbol: 'H', name: 'Hydrogen', a: 1, ie: 1312, stableN: [0, 1], category: 'nonmetal', fact: 'Nine out of every ten atoms in the universe are hydrogen — one proton, one electron, and that is the whole recipe.' },
  { z: 2, symbol: 'He', name: 'Helium', a: 4, ie: 2372, stableN: [1, 2], category: 'noble', fact: 'Helium was discovered on the Sun (hēlios) before anyone found it on Earth — a mystery line in sunlight, 27 years early.' },
  { z: 3, symbol: 'Li', name: 'Lithium', a: 7, ie: 520, stableN: [3, 4], category: 'alkali', fact: 'The lithium in your phone battery works because this atom barely holds its single outer electron — easy out, easy back in, thousands of times.' },
  { z: 4, symbol: 'Be', name: 'Beryllium', a: 9, ie: 899, stableN: [5], category: 'alkaline', fact: 'Beryllium has exactly one stable isotope — and emeralds are beryllium crystals with a pinch of chromium for the green.' },
  { z: 5, symbol: 'B', name: 'Boron', a: 11, ie: 801, stableN: [5, 6], category: 'metalloid', fact: 'Boron makes glass tough against heat — borosilicate lab beakers shrug off flames that shatter ordinary glass.' },
  { z: 6, symbol: 'C', name: 'Carbon', a: 12, ie: 1086, stableN: [6, 7], category: 'nonmetal', fact: 'Four outer electrons, four bonds, endless chains and rings — which is why every living thing ever found is built on carbon.' },
  { z: 7, symbol: 'N', name: 'Nitrogen', a: 14, ie: 1402, stableN: [7, 8], category: 'nonmetal', fact: 'Four out of every five breaths you take is nitrogen. It mostly ignores you — the pair of N atoms grip each other with a triple bond.' },
  { z: 8, symbol: 'O', name: 'Oxygen', a: 16, ie: 1314, stableN: [8, 9, 10], category: 'nonmetal', fact: 'Two electrons short of a full shell makes oxygen a notorious electron thief — burning, rusting and breathing are all its thefts.' },
  { z: 9, symbol: 'F', name: 'Fluorine', a: 19, ie: 1681, stableN: [10], category: 'halogen', fact: 'One electron short of a full shell, small, and furious about it: fluorine is the most reactive element there is. It attacks glass.' },
  { z: 10, symbol: 'Ne', name: 'Neon', a: 20, ie: 2081, stableN: [10, 11, 12], category: 'noble', fact: 'A perfectly full shell means neon reacts with nothing at all — no neon compound has ever been made. It just glows.' },
  { z: 11, symbol: 'Na', name: 'Sodium', a: 23, ie: 496, stableN: [12], category: 'alkali', fact: 'One lonely electron in a brand-new shell: drop sodium in water and it dumps that electron so fast the metal fizzes, melts and can explode.' },
  { z: 12, symbol: 'Mg', name: 'Magnesium', a: 24, ie: 738, stableN: [12, 13, 14], category: 'alkaline', fact: 'The atom at the heart of every chlorophyll molecule — every leaf that has ever photosynthesised did it around a magnesium atom.' },
  { z: 13, symbol: 'Al', name: 'Aluminium', a: 27, ie: 578, stableN: [14], category: 'metal', fact: 'Aluminium was once worth more than gold — Napoleon III served his best guests with aluminium cutlery and gave the rest gold.' },
  { z: 14, symbol: 'Si', name: 'Silicon', a: 28, ie: 786, stableN: [14, 15, 16], category: 'metalloid', fact: 'Sits right under carbon with the same four outer electrons — but its chains are weaker, so it builds rocks and computer chips instead of life.' },
  { z: 15, symbol: 'P', name: 'Phosphorus', a: 31, ie: 1012, stableN: [16], category: 'nonmetal', fact: 'Discovered by boiling down 5,500 litres of urine in search of gold. The finder got a glowing white element that bursts into flame in air.' },
  { z: 16, symbol: 'S', name: 'Sulfur', a: 32, ie: 1000, stableN: [16, 17, 18, 20], category: 'nonmetal', fact: 'Volcanoes vent it, gunpowder needs it, and the smell of rotten eggs is its calling card — sulfur has been famous since ancient times.' },
  { z: 17, symbol: 'Cl', name: 'Chlorine', a: 35, ie: 1251, stableN: [18, 20], category: 'halogen', fact: 'One electron short of a full shell, so it snatches one from almost anything — that greed is what makes it kill germs in swimming pools.' },
  { z: 18, symbol: 'Ar', name: 'Argon', a: 40, ie: 1521, stableN: [18, 20, 22], category: 'noble', fact: 'Its name means "the lazy one". About 1% of every breath is argon that has been drifting, unreacted, since before the dinosaurs.' },
  { z: 19, symbol: 'K', name: 'Potassium', a: 39, ie: 419, stableN: [20, 22], category: 'alkali', fact: 'Bananas are slightly radioactive: a trace of potassium-40 (21 neutrons — one too many to be stable) ticks away in every one.' },
  { z: 20, symbol: 'Ca', name: 'Calcium', a: 40, ie: 590, stableN: [20, 22, 23, 24, 26, 28], category: 'alkaline', fact: 'Your skeleton is a calcium mineral you built yourself — and the same two-outer-electron habit that makes bones makes limestone and chalk.' },
]

export const ELEMENT_BY_Z: Record<number, ElementInfo> = Object.fromEntries(ELEMENTS.map((e) => [e.z, e]))
export const MAX_Z = 20

export const CATEGORY_META: Record<Category, { label: string; tint: string }> = {
  alkali: { label: 'Alkali metal', tint: '#E8A33D' },
  alkaline: { label: 'Alkaline earth metal', tint: '#D98A45' },
  metal: { label: 'Metal', tint: '#A8B0BC' },
  metalloid: { label: 'Metalloid', tint: '#9C86B8' },
  nonmetal: { label: 'Non-metal', tint: '#4C9455' },
  halogen: { label: 'Halogen', tint: '#4FA08F' },
  noble: { label: 'Noble gas', tint: '#4C7FB5' },
}

/* ------------------------------------------------------------------ */
/* Shells                                                             */
/* ------------------------------------------------------------------ */

/**
 * Shell seat limits in the school model used for Z ≤ 20: 2, then 8, then 8,
 * then 8. (Calcium's arrangement is 2·8·8·2 — two electrons in a fourth shell
 * that could hold eight. An earlier version capped this shell at 2 to make the
 * numbers total 20, which made the meter announce calcium's outer shell as
 * "full" — wrong, and it would have taught the opposite of the point.)
 */
export const SHELL_CAPS = [2, 8, 8, 8]

/** How `count` electrons arrange themselves, e.g. 11 → [2, 8, 1]. */
export function shellsFor(count: number): number[] {
  const shells: number[] = []
  let left = count
  for (const cap of SHELL_CAPS) {
    if (left <= 0) break
    const take = Math.min(cap, left)
    shells.push(take)
    left -= take
  }
  return shells
}

/** Electrons in the outermost shell (0 for an empty atom). */
export function outerElectrons(count: number): number {
  const shells = shellsFor(count)
  return shells.length ? shells[shells.length - 1] : 0
}

/** Total electrons a given number of shells can hold. */
export function shellCapacityThrough(nShells: number): number {
  return SHELL_CAPS.slice(0, nShells).reduce((a, b) => a + b, 0)
}

/**
 * Where a given electron ARRANGEMENT lives on the school 8-column wall.
 * Row = number of occupied shells; column = outer electrons — except a
 * completely full outer shell sits in column 8 (that is why helium, with only
 * 2 electrons, lives above neon on the right edge).
 */
export function wallSlot(electrons: number): { row: number; col: number } | null {
  if (electrons < 1 || electrons > MAX_Z) return null
  const shells = shellsFor(electrons)
  const row = shells.length
  const outer = shells[shells.length - 1]
  const col = outer === SHELL_CAPS[row - 1] && row <= 2 ? 8 : outer
  return { row, col }
}

export const PERIOD_OF: Record<number, number> = Object.fromEntries(
  ELEMENTS.map((e) => [e.z, wallSlot(e.z)?.row ?? 1]),
)

export interface ShellRow {
  /** 1-based shell number. */
  n: number
  /** Electrons currently in it. */
  count: number
  /** Maximum this shell can hold. */
  cap: number
  /** Is this the outermost occupied shell (the one chemistry cares about)? */
  outer: boolean
  /** Is it completely full? */
  full: boolean
}

/**
 * Per-shell occupancy AND capacity — the thing a learner has to see to
 * understand why the table looks the way it does. Always includes one empty
 * "next" shell so the ceiling is visible before it is reached.
 */
export function shellDetail(electrons: number): ShellRow[] {
  const filled = shellsFor(electrons)
  const rows: ShellRow[] = filled.map((count, i) => ({
    n: i + 1,
    count,
    cap: SHELL_CAPS[i],
    outer: i === filled.length - 1,
    full: count === SHELL_CAPS[i],
  }))
  // Show the next empty shell whenever the current outer one is full — that is
  // the moment "where does the next electron go?" becomes the interesting question.
  const nextIndex = filled.length
  const outerFull = rows.length > 0 && rows[rows.length - 1].full
  if (nextIndex < SHELL_CAPS.length && (rows.length === 0 || outerFull)) {
    rows.push({ n: nextIndex + 1, count: 0, cap: SHELL_CAPS[nextIndex], outer: false, full: false })
  }
  return rows
}

/** Room left in the outermost occupied shell (null for an empty atom). */
export function roomInOuterShell(electrons: number): number | null {
  const filled = shellsFor(electrons)
  if (!filled.length) return null
  const i = filled.length - 1
  return SHELL_CAPS[i] - filled[i]
}

export interface AddressLogic {
  row: number
  col: number
  shells: number
  outer: number
  outerCap: number
  /** True when the outer shell is full — the noble-gas column-8 rule. */
  outerFull: boolean
  /** "3 shells" → row; short phrase. */
  rowWhy: string
  /** "1 electron in a shell that holds 8" → column; short phrase. */
  colWhy: string
}

/**
 * The address derivation, spelled out. The whole cabinet exists to make this
 * one inference obvious, so it is computed in one place and shown verbatim.
 */
export function addressLogic(electrons: number): AddressLogic | null {
  const slot = wallSlot(electrons)
  if (!slot) return null
  const filled = shellsFor(electrons)
  const shells = filled.length
  const outer = filled[shells - 1]
  const outerCap = SHELL_CAPS[shells - 1]
  const outerFull = outer === outerCap
  return {
    row: slot.row,
    col: slot.col,
    shells,
    outer,
    outerCap,
    outerFull,
    rowWhy: `${shells} shell${shells === 1 ? '' : 's'} in use`,
    colWhy: outerFull && slot.col === 8 ? `outer shell FULL (${outer} of ${outerCap})` : `${outer} of ${outerCap} in the outer shell`,
  }
}

/* ------------------------------------------------------------------ */
/* Stability (real isotope data)                                      */
/* ------------------------------------------------------------------ */

export type Stability = 'stable' | 'unstable' | 'wild'

/** How stable a nucleus of `z` protons and `n` neutrons is. */
export function stabilityOf(z: number, n: number): Stability {
  const el = ELEMENT_BY_Z[z]
  if (!el) return 'wild'
  if (el.stableN.includes(n)) return 'stable'
  const nearest = Math.min(...el.stableN.map((s) => Math.abs(s - n)))
  return nearest <= 1 ? 'unstable' : 'wild'
}

/** The neutron count of the most common isotope. */
export function commonNeutrons(z: number): number {
  const el = ELEMENT_BY_Z[z]
  return el ? el.a - el.z : 0
}

/* ------------------------------------------------------------------ */
/* The grip probe                                                     */
/* ------------------------------------------------------------------ */

export const GRIP_MAX = 2500 // display ceiling, just above helium

/** True (noise-free) probe value for a neutral atom of element z. */
export function trueGrip(z: number): number {
  return ELEMENT_BY_Z[z]?.ie ?? 0
}

/** Friendly 0–10 grip scale for Explorer wording. */
export function gripScale(kjmol: number): number {
  return Math.round((kjmol / GRIP_MAX) * 10 * 10) / 10
}

export function gripWord(kjmol: number): string {
  if (kjmol < 550) return 'barely holding on'
  if (kjmol < 850) return 'a loose hold'
  if (kjmol < 1150) return 'a firm hold'
  if (kjmol < 1500) return 'a strong grip'
  if (kjmol < 2000) return 'a very strong grip'
  return 'an iron grip'
}

export interface GripReading {
  id: number
  z: number
  symbol: string
  period: number
  outer: number
  /** Measured value (noise applied), kJ/mol. */
  y: number
  repeats: number[]
  predicted: number | null
}

/* ------------------------------------------------------------------ */
/* Sim store (mutable, read by the scene every frame)                 */
/* ------------------------------------------------------------------ */

export type AtomViewId = 'overview' | 'stage' | 'wall'

export interface AtomSim {
  time: number
  started: boolean
  demoMode: boolean
  /* the build */
  protons: number
  neutrons: number
  electrons: number
  /* animation timestamps (sim seconds) */
  lastAddP: number
  lastAddN: number
  lastAddE: number
  /** Set when a NEW shell receives its first electron — the ring-ignition beat. */
  shellIgniteAt: number
  shellIgniteIndex: number
  prevShellCount: number
  /** Set when the build first becomes a complete neutral element — the celebration flash. */
  completeFlashAt: number
  /** The z the flash last fired for (0 = build is currently incomplete). */
  lastCompleteZ: number
  /** Increments on every completion — the page turns it into the element pop-up. */
  completeSeq: number
  /* probe */
  probing: boolean
  probeStartAt: number
  probeZ: number
  /** Increments when a probe completes; page turns it into a reading. */
  probeDone: number
  probeValue: number
  /* placing an atom into the wall */
  placing: { z: number; startAt: number } | null
  /** Increments when a placement lands; page records the build. */
  placeDone: number
  /** z values already forged into the wall. */
  discovered: Set<number>
  /** Best (latest) probe value per z — tints the wall tiles into a heat map. */
  probedGrip: Map<number, number>
  /* view */
  cloudView: boolean
  /** True while the table wall has slid away so a zoomed-in atom reads cleanly. */
  wallHidden: boolean
  viewId: AtomViewId
  viewSeq: number
  viewReset: number
  viewZoom: number
  autoOrbit: boolean
}

export function createAtomSim(): AtomSim {
  return {
    time: 0,
    started: false,
    demoMode: false,
    protons: 0,
    neutrons: 0,
    electrons: 0,
    lastAddP: -9,
    lastAddN: -9,
    lastAddE: -9,
    shellIgniteAt: -9,
    shellIgniteIndex: -1,
    prevShellCount: 0,
    completeFlashAt: -9,
    lastCompleteZ: 0,
    completeSeq: 0,
    probing: false,
    probeStartAt: 0,
    probeZ: 0,
    probeDone: 0,
    probeValue: 0,
    placing: null,
    placeDone: 0,
    discovered: new Set<number>(),
    probedGrip: new Map<number, number>(),
    cloudView: false,
    wallHidden: false,
    viewId: 'overview',
    viewSeq: 0,
    viewReset: 0,
    viewZoom: 0,
    autoOrbit: false,
  }
}

export const PROBE_SECONDS = 2.2
export const PLACE_SECONDS = 1.7

/** Advance clocks and finish any timed animation. Call once per frame with dt ≤ 0.25. */
export function stepAtoms(sim: AtomSim, dt: number): void {
  sim.time += dt
  if (sim.probing && sim.time - sim.probeStartAt >= PROBE_SECONDS) {
    sim.probing = false
    sim.probeDone += 1
    sim.probedGrip.set(sim.probeZ, sim.probeValue)
  }
  if (sim.placing && sim.time - sim.placing.startAt >= PLACE_SECONDS) {
    sim.discovered.add(sim.placing.z)
    sim.placing = null
    sim.placeDone += 1
  }
}

export type BuildPatch = { protons?: number; neutrons?: number; electrons?: number }

/** Apply a particle-count change, stamping the animation clocks. */
export function applyBuild(sim: AtomSim, patch: BuildPatch): void {
  if (patch.protons !== undefined && patch.protons !== sim.protons) {
    sim.lastAddP = sim.time
    sim.protons = patch.protons
  }
  if (patch.neutrons !== undefined && patch.neutrons !== sim.neutrons) {
    sim.lastAddN = sim.time
    sim.neutrons = patch.neutrons
  }
  if (patch.electrons !== undefined && patch.electrons !== sim.electrons) {
    sim.lastAddE = sim.time
    sim.electrons = patch.electrons
    const shells = shellsFor(sim.electrons).length
    if (shells > sim.prevShellCount) {
      sim.shellIgniteAt = sim.time
      sim.shellIgniteIndex = shells - 1
    }
    sim.prevShellCount = shells
  }
  // The completion beat: the moment protons and electrons balance into a real element.
  const complete = sim.protons >= 1 && sim.protons <= MAX_Z && sim.electrons === sim.protons
  if (complete && sim.lastCompleteZ !== sim.protons) {
    sim.completeFlashAt = sim.time
    sim.lastCompleteZ = sim.protons
    sim.completeSeq += 1
  } else if (!complete) {
    sim.lastCompleteZ = 0
  }
}

/** Start the grip probe (neutral atoms only — the page enforces the message). */
export function fireProbe(sim: AtomSim, noise: number): boolean {
  if (sim.probing || sim.placing) return false
  const z = sim.protons
  if (z < 1 || z > MAX_Z || sim.electrons !== z) return false
  sim.probing = true
  sim.probeStartAt = sim.time
  sim.probeZ = z
  const truth = trueGrip(z)
  const jitter = noise > 0 ? 1 + (Math.random() * 2 - 1) * noise * 1.6 : 1
  sim.probeValue = Math.round(truth * jitter)
  return true
}

/** Start the fly-to-wall placement (neutral + stable only). */
export function forgePlace(sim: AtomSim): boolean {
  if (sim.probing || sim.placing) return false
  const z = sim.protons
  if (z < 1 || z > MAX_Z || sim.electrons !== z) return false
  if (stabilityOf(z, sim.neutrons) !== 'stable') return false
  sim.placing = { z, startAt: sim.time }
  return true
}

/* ------------------------------------------------------------------ */
/* Missions                                                           */
/* ------------------------------------------------------------------ */

export interface PlacedBuild {
  id: number
  z: number
  neutrons: number
}

export interface AtomMissionContext {
  readings: GripReading[]
  builds: PlacedBuild[]
  /** An ion (charge ±1, ≥1 electron) held steady for a few seconds. */
  ionHeld: boolean
  /** The learner has seen a second (or later) shell ignite. */
  shellOpened: boolean
}

export interface AtomMission {
  id: string
  title: string
  brief: string
  reward: string
  minBand: Band
  skill: SkillId
  check: (ctx: AtomMissionContext) => boolean
}

const BAND_RANK: Record<Band, number> = { explorer: 0, scientist: 1, analyst: 2 }
const NOBLE_Z = [2, 10, 18]

function probedZ(ctx: AtomMissionContext): Set<number> {
  return new Set(ctx.readings.map((r) => r.z))
}

export const ATOM_MISSIONS: AtomMission[] = [
  {
    id: 'first-atom',
    title: 'Forge hydrogen',
    brief: 'Build the simplest atom there is — one proton, one electron — and forge it into the wall.',
    reward: 'One proton IS hydrogen. The proton count is the element’s identity: change it and you have made a different element, not a different version.',
    minBand: 'explorer',
    skill: 'measuring',
    check: (ctx) => ctx.builds.some((b) => b.z === 1),
  },
  {
    id: 'shell-burst',
    title: 'Overflow the first shell',
    brief: 'Keep pouring electrons until the first ring is full and a new ring ignites.',
    reward: 'Shell 1 holds exactly two electrons — the third has nowhere to go but a NEW ring, further out. Every row of the periodic table is one of these overflows written down.',
    minBand: 'explorer',
    skill: 'measuring',
    check: (ctx) => ctx.shellOpened,
  },
  {
    id: 'atom-of-life',
    title: 'Build the atom of life',
    brief: 'Forge carbon-12: six protons, six neutrons, six electrons.',
    reward: 'Carbon’s four outer electrons make four bonds — chains, rings, branches without end. Every living thing ever found is built on this one atom.',
    minBand: 'explorer',
    skill: 'measuring',
    check: (ctx) => ctx.builds.some((b) => b.z === 6 && b.neutrons === 6),
  },
  {
    id: 'contented',
    title: 'Meet a contented atom',
    brief: 'Build a noble gas — helium, neon or argon — and record its grip with the probe.',
    reward: 'A completely full outer shell wants nothing: hardest grip on the wall, no reactions, no compounds. That contentment is the whole right-hand edge of the table.',
    minBand: 'explorer',
    skill: 'measuring',
    check: (ctx) => ctx.readings.some((r) => NOBLE_Z.includes(r.z)),
  },
  {
    id: 'row-walk',
    title: 'Walk a row',
    brief: 'Record the grip of at least four elements from the same row of the table.',
    reward: 'Across a row the shell count never changes — but each extra proton pulls the same shell in tighter, so the grip climbs from left to right. The left side holds its electrons loosely; the right side hoards them.',
    minBand: 'scientist',
    skill: 'controlling',
    check: (ctx) => {
      const byPeriod = new Map<number, Set<number>>()
      ctx.readings.forEach((r) => {
        const set = byPeriod.get(r.period) ?? new Set<number>()
        set.add(r.z)
        byPeriod.set(r.period, set)
      })
      return [...byPeriod.values()].some((s) => s.size >= 4)
    },
  },
  {
    id: 'family-ties',
    title: 'Same column, same story',
    brief: 'Record the grip of two elements from the same column — lithium and sodium, say, or fluorine and chlorine.',
    reward: 'Same column = same number of outer electrons = the same chemical personality. That is why the table is worth drawing as a grid at all: the columns are families.',
    minBand: 'scientist',
    skill: 'interpreting',
    check: (ctx) => {
      const cols = new Map<number, Set<number>>()
      ctx.readings.forEach((r) => {
        const slot = wallSlot(r.z)
        if (!slot) return
        const set = cols.get(slot.col) ?? new Set<number>()
        set.add(r.z)
        cols.set(slot.col, set)
      })
      return [...cols.values()].some((s) => s.size >= 2)
    },
  },
  {
    id: 'cliff-edge',
    title: 'Find the cliff',
    brief: 'Record a noble gas — then build the very next element and record it too.',
    reward: 'One step past a full shell, the newcomer electron sits alone in a fresh ring, far from the nucleus and easy to steal. That cliff is why neon is bored and sodium is violent — and why a new row starts exactly there.',
    minBand: 'scientist',
    skill: 'interpreting',
    check: (ctx) => {
      const zs = probedZ(ctx)
      return NOBLE_Z.some((nz) => zs.has(nz) && zs.has(nz + 1))
    },
  },
  {
    id: 'ion-forge',
    title: 'Forge an ion',
    brief: 'Unbalance the charge: build an atom with one electron too many or too few, and hold it steady.',
    reward: 'An atom that loses or gains electrons is an ion — same element (the protons never moved), new charge. Metals on the left shed electrons to empty a shell; non-metals on the right grab them to fill one.',
    minBand: 'scientist',
    skill: 'measuring',
    check: (ctx) => ctx.ionHeld,
  },
  {
    id: 'heavy-twin',
    title: 'Build a heavy twin',
    brief: 'Forge two stable versions of the SAME element with different neutron counts — carbon-12 and carbon-13, say.',
    reward: 'Same protons, same chemistry, different mass: isotopes. Neutrons change the weight and the stability, never the identity — that is why the wall accepted both into one slot.',
    minBand: 'scientist',
    skill: 'controlling',
    check: (ctx) => {
      const byZ = new Map<number, Set<number>>()
      ctx.builds.forEach((b) => {
        const set = byZ.get(b.z) ?? new Set<number>()
        set.add(b.neutrons)
        byZ.set(b.z, set)
      })
      return [...byZ.values()].some((s) => s.size >= 2)
    },
  },
  {
    id: 'call-it',
    title: 'Call the grip',
    brief: 'Commit a prediction before probing, and land within 15% of the measured value — three times.',
    reward: 'Predicting correctly means your shell model is doing real work: you can read an element’s grip off its address on the wall before the probe ever fires.',
    minBand: 'analyst',
    skill: 'predicting',
    check: (ctx) =>
      ctx.readings.filter((r) => r.predicted !== null && Math.abs(r.predicted - r.y) <= Math.abs(r.y) * 0.15).length >= 3,
  },
  {
    id: 'sawtooth',
    title: 'Prove the shells exist',
    brief: 'Record at least eight grips spanning two different rows, including a noble gas AND the element after it. Then read the graph.',
    reward: 'The graph is a sawtooth: a climb across each row, a collapse after each full shell. Nobody has ever seen a shell — this plot is how we know they are there. You just reproduced one of chemistry’s great arguments from evidence.',
    minBand: 'analyst',
    skill: 'interpreting',
    check: (ctx) => {
      const zs = probedZ(ctx)
      if (zs.size < 8) return false
      const periods = new Set([...zs].map((z) => PERIOD_OF[z]))
      if (periods.size < 2) return false
      return NOBLE_Z.some((nz) => zs.has(nz) && zs.has(nz + 1))
    },
  },
  {
    id: 'crack-in-model',
    title: 'Find the crack in the model',
    brief: 'Record boron or oxygen together with both of its row neighbours, and look closely at the middle value.',
    reward: 'Boron and oxygen sit slightly LOW — the smooth climb dips. Simple shell rings cannot explain that; the full quantum picture (sub-shells) can. A good model earns trust by working, and earns respect by showing you exactly where it stops working.',
    minBand: 'analyst',
    skill: 'explaining',
    check: (ctx) => {
      const zs = probedZ(ctx)
      return [5, 8].some((z) => zs.has(z) && zs.has(z - 1) && zs.has(z + 1))
    },
  },
]

export function atomMissionsForBand(band: Band): AtomMission[] {
  return ATOM_MISSIONS.filter((m) => BAND_RANK[m.minBand] <= BAND_RANK[band])
}

/* ------------------------------------------------------------------ */
/* Facts ticker                                                       */
/* ------------------------------------------------------------------ */

export const ATOM_TICKER: string[] = [
  'If an atom were a football stadium, the nucleus would be a marble on the centre spot — the rest is electrons and emptiness.',
  'You are about 60% hydrogen atoms by count — most of them made in the first three minutes of the universe.',
  'Protons decide WHAT an atom is. Neutrons decide how heavy (and how stable). Electrons decide what it DOES.',
  'The periodic table has rows because shells fill up: 2, then 8, then 8. Every new row is a new shell opening.',
  'Elements in the same column behave alike because they show the world the same number of outer electrons.',
  'A neutral atom has equal protons and electrons. Knock one electron off and you have an ion — same element, new charge.',
  'Gold atoms in your jewellery were forged in colliding neutron stars. Every single one.',
  'The probe measures first ionisation energy — the real, measured cost (in kJ/mol) of stealing an atom’s outermost electron.',
  'Dmitri Mendeleev left GAPS in his 1869 table and predicted the missing elements’ properties. When gallium turned up matching his numbers, the table was proved.',
  'Atoms never touch. What you feel as "solid" is electron shells refusing to overlap.',
  'Carbon-14 is unstable — and its steady decay is the clock archaeologists use to date anything that once lived.',
]

/* ------------------------------------------------------------------ */
/* Tap-for-facts (in-world objects)                                   */
/* ------------------------------------------------------------------ */

export interface AtomFact {
  title: string
  body: string
}

export const OBJECT_FACTS: Record<string, AtomFact[]> = {
  nucleus: [
    { title: 'The nucleus', body: 'Nearly all of the atom’s mass, squeezed into a hundred-thousandth of its width. Protons (p⁺) and neutrons (n⁰) hold together by the strong force — the strongest glue in nature.' },
    { title: 'Why neutrons matter', body: 'Protons all push each other apart (same charge!). Neutrons add strong-force glue without adding push — too few or too many and the nucleus wobbles apart: radioactivity.' },
    { title: 'Identity lives here', body: 'Count the protons and you have named the atom. Six is carbon. Every time. There are no exceptions anywhere in the universe.' },
  ],
  electron: [
    { title: 'The electron', body: 'Almost two thousand times lighter than a proton, with an equal and opposite charge. Chemistry — every reaction, every bond, every colour — is electrons doing things.' },
    { title: 'Shells', body: 'Electrons stack into shells around the nucleus: 2 fit in the first, 8 in the second, 8 in the third. Only the OUTERMOST shell touches the world, so it alone decides the atom’s behaviour.' },
    { title: 'Rings are a model', body: 'Real electrons are fuzzy clouds of probability, not planets on racetracks. The rings are a model that predicts brilliantly for the first 20 elements — and models that work are how science moves.' },
  ],
  probe: [
    {
      title: 'The grip probe',
      body: 'It fires a tether at the atom’s outermost electron and pulls until the electron comes free. The meter reads how much energy that took — chemists call it the first ionisation energy, in kJ/mol. Every value in this foundry is the real measured one.',
    },
    {
      title: 'Why measure grip?',
      body: 'The outer electrons ARE the chemistry. A loose grip means an eager, reactive metal; an iron grip means a contented noble gas. Probe a few elements and the periodic table’s whole pattern appears in your graph.',
    },
    {
      title: 'Neutral atoms only',
      body: 'The probe reads the pull on a neutral atom’s outer electron — an ion’s charge would tug the tether and spoil the measurement. Balance electrons against protons before you fire.',
    },
  ],
  wall: [
    { title: 'The wall', body: 'Rows = how many shells the atom uses. Columns = electrons in the outer shell. The table’s whole shape is shell-filling, written down once and forever.' },
    {
      title: 'Why eight columns?',
      body: 'Because eight is the seat limit of a shell. A row runs from one lonely outer electron (column 1) to a completely full shell (column 8) — then the seats run out, a new shell opens, and a new row begins. The width of the periodic table IS the capacity of a shell.',
    },
    { title: 'Left side, right side', body: 'Left column: one outer electron, loosely held, desperate to lose it — the violent metals. Right columns: nearly or completely full shells that grab or hoard electrons. Sides of the table are STRATEGIES.' },
    { title: 'Mendeleev’s gamble', body: 'In 1869 Mendeleev ordered the known elements and left holes where the pattern demanded elements nobody had found. Gallium and germanium later filled the holes with the properties he predicted.' },
  ],
}

/* ------------------------------------------------------------------ */
/* Concepts intro (shown once, after "Start forging")                 */
/* ------------------------------------------------------------------ */

export interface IntroStep {
  title: string
  body: string
  /** Small tag line above the title. */
  kicker: string
}

export const INTRO_STEPS: IntroStep[] = [
  {
    kicker: 'First things first',
    title: 'What is an atom?',
    body: 'Take anything — water, air, your own hand — and imagine cutting it smaller and smaller. The smallest piece you can reach is an atom: a tiny nucleus of protons (positive) and neutrons (neutral), wrapped in shells of orbiting electrons (negative). Atoms are the building bricks of everything that exists.',
  },
  {
    kicker: 'Atoms come in kinds',
    title: 'What is an element?',
    body: 'An element is a substance made of only one kind of atom — and the "kind" is simply the proton count. One proton is hydrogen. Six is carbon. Seventy-nine is gold. Change the proton count and you have changed the element. That is exactly what you will do on this stage, one proton at a time.',
  },
  {
    kicker: 'Atoms team up',
    title: 'What is a compound?',
    body: 'Atoms of different elements can bond together into compounds: water (H₂O) is hydrogen with oxygen; carbon dioxide (CO₂) is carbon with oxygen. A compound behaves nothing like its ingredients — sodium is a violent metal and chlorine a poison gas, yet bonded they make table salt. In this foundry you forge the pure elements; bonding them into compounds is a later cabinet.',
  },
  {
    kicker: 'The rule behind everything',
    title: 'How many electrons fit in a shell?',
    body: 'Shells have strict seat limits. The first ring holds a maximum of 2 electrons. The second holds 8. The third holds 8 as well (for the first twenty elements). Fill a ring and the next electron cannot squeeze in — it has no choice but to start a brand-new ring further out. Watch the shell meter in your controls: it shows every seat, taken and empty, so you always know how much room is left.',
  },
  {
    kicker: 'The wall’s secret code',
    title: 'Why those limits fix the address',
    body: 'The dark wall is the periodic table, and your atom’s address falls straight out of its shells. ROW = how many shells are in use — a new row begins exactly when a full shell forces a new one open. COLUMN = how many electrons sit in that outer shell — which is why the table is 8 columns wide: 8 is the seat limit. So the left side holds atoms with 1–2 loosely-held outer electrons (the reactive metals), the right side holds nearly-full shells that grab electrons, and the last column is completely full and reacts with nothing. Watch the amber ghost frame while you build: it always points at the one slot your atom belongs in.',
  },
]

/* ------------------------------------------------------------------ */
/* Guided demo                                                        */
/* ------------------------------------------------------------------ */

export interface AtomDemoApi {
  set: (patch: BuildPatch) => void
  get: () => { protons: number; neutrons: number; electrons: number }
  probe: () => void
  probeBusy: () => boolean
  place: () => void
  placeBusy: () => boolean
  view: (v: AtomViewId) => void
  resetView: () => void
  setAutoOrbit: (on: boolean) => void
}

export interface AtomDemoStep {
  text: string
  ms: number
  enter?: (api: AtomDemoApi) => void
  /** Return true to advance early. */
  tick?: (api: AtomDemoApi, elapsed: number, state: Record<string, unknown>) => boolean | void
}

/** Pour particles one at a time so the build is visibly a build. */
function pour(api: AtomDemoApi, elapsed: number, state: Record<string, unknown>, target: { protons: number; neutrons: number; electrons: number }, everyMs: number): boolean {
  const step = Math.floor(elapsed / everyMs)
  if (step === state.lastStep) return false
  state.lastStep = step
  const cur = api.get()
  if (cur.protons < target.protons) api.set({ protons: cur.protons + 1 })
  else if (cur.neutrons < target.neutrons) api.set({ neutrons: cur.neutrons + 1 })
  else if (cur.electrons < target.electrons) api.set({ electrons: cur.electrons + 1 })
  else return true
  return false
}

export const ATOM_DEMO: AtomDemoStep[] = [
  {
    text: 'Watch first. I will forge two atoms with these controls and set them into the wall — then it is all yours.',
    ms: 4200,
    enter: (api) => {
      api.set({ protons: 0, neutrons: 0, electrons: 0 })
      api.resetView()
      api.setAutoOrbit(true)
    },
  },
  {
    text: 'The stage is empty and the periodic table is a dark wall of sockets. Nothing up there is given — everything must be built.',
    ms: 4600,
    enter: (api) => api.view('wall'),
  },
  {
    text: 'One proton from the crucible… and that IS hydrogen. The proton count is the atom’s name.',
    ms: 3600,
    enter: (api) => {
      api.setAutoOrbit(false)
      api.view('stage')
      api.set({ protons: 1 })
    },
  },
  {
    text: 'One electron to balance the charge. See the ghost slot on the wall? Row 1, column 1 — the only address this pattern can have.',
    ms: 4600,
    enter: (api) => api.set({ electrons: 1 }),
  },
  {
    text: 'The probe measures how hard the atom grips that outer electron. Watch the beam…',
    ms: 2600,
    enter: (api) => api.probe(),
    tick: (api, elapsed) => elapsed > 800 && !api.probeBusy(),
  },
  {
    text: 'Recorded — one real number on the graph. Now I forge it into the wall.',
    ms: 2400,
    enter: (api) => api.place(),
    tick: (api, elapsed) => elapsed > 800 && !api.placeBusy(),
  },
  {
    text: 'Hydrogen, lit. Next: one more proton, two neutrons for glue, one more electron — helium, and shell 1 is now FULL.',
    ms: 6200,
    tick: (api, elapsed, state) => pour(api, elapsed, state, { protons: 2, neutrons: 2, electrons: 2 }, 900),
  },
  {
    text: 'Probe it: an iron grip — more than DOUBLE hydrogen’s. A full shell hoards its electrons. That contentment is the whole right-hand edge of the table.',
    ms: 4400,
    enter: (api) => api.probe(),
    tick: (api, elapsed) => elapsed > 2600 && !api.probeBusy(),
  },
  {
    text: 'Into the wall — column 8, with the other contented atoms.',
    ms: 2400,
    enter: (api) => api.place(),
    tick: (api, elapsed) => elapsed > 800 && !api.placeBusy(),
  },
  {
    text: 'Now watch the most important animation in this room. One more proton makes lithium… and a THIRD electron has nowhere to fit—',
    ms: 4800,
    tick: (api, elapsed, state) => pour(api, elapsed, state, { protons: 3, neutrons: 4, electrons: 2 }, 800),
  },
  {
    text: '—so a NEW ring ignites, and the ghost slot snaps to a new row. Row 2, column 1. Every row of the periodic table is one of these overflows.',
    ms: 5200,
    enter: (api) => api.set({ electrons: 3 }),
  },
  {
    text: 'Probe: the grip has COLLAPSED. That lonely outer electron, far from the nucleus, is easy to steal — which is why the left side of the table is the reactive-metal side.',
    ms: 4800,
    enter: (api) => api.probe(),
    tick: (api, elapsed) => elapsed > 3000 && !api.probeBusy(),
  },
  {
    text: 'Two atoms, two addresses, and the graph already tells the story: full shell, iron grip; new shell, loose grip.',
    ms: 4600,
    enter: (api) => api.view('overview'),
  },
  {
    text: 'Your turn. Forge atoms, probe them, light the wall — the missions will tell you what to hunt for.',
    ms: 4200,
    enter: (api) => api.set({ protons: 0, neutrons: 0, electrons: 0 }),
  },
]
