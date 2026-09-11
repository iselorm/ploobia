/**
 * The counting rule — what happens when two atoms are put on a bench together.
 *
 * This is the model Door 2 runs on, rebuilt from the Matter Works notes because
 * that cabinet's code never reached the clone or the vault. The notes are worth
 * more than the code was: they are a list of the specific ways this model goes
 * wrong, each one paid for once already.
 *
 * The whole cabinet turns on one distinction, so it is stated here at the top:
 *
 *   **Say what will happen and why. Never say the number being predicted.**
 *
 * A learner reading "sodium gives 1" and "chlorine takes 1" can derive the
 * ratio, and deriving it is the entire lesson. `pairOutlook` therefore names
 * the *mechanism* — swap, share, mix, refuse — and the model suite walks all
 * 400 pairs and fails the build if any outlook contains a subscript, the word
 * "ratio", or the formula it precedes. That check exists because a readout once
 * printed "H₂O · Ratio 2 : 1" directly above a dial asking the learner to guess
 * the ratio: no error, no visible fault, and every prediction in the cabinet
 * silently became a reading-comprehension exercise.
 *
 * Pure: no React, no three, no browser. Checked by `verify-matter-model.mjs`.
 */

import { ELEMENT_BY_Z, ELEMENTS, outerElectrons, shellsFor, SHELL_CAPS, type Category, type ElementInfo } from './atoms'

/* ------------------------------------------------------------------ */
/* Appetite: outer electrons, room, valency                            */
/* ------------------------------------------------------------------ */

/** Electrons in the outermost shell of the neutral atom. */
export function outerOf(z: number): number {
  return outerElectrons(z)
}

/** Spaces left in the outermost shell of the neutral atom. */
export function roomOf(z: number): number {
  const shells = shellsFor(z)
  if (!shells.length) return 0
  const cap = SHELL_CAPS[shells.length - 1]
  return cap - shells[shells.length - 1]
}

/**
 * How many bonds this atom makes.
 *
 * **`min(outer, room)`, not "room".** The naive rule gives boron valency 5
 * (three outer, five spaces) and cheerfully produces B₂O₅, which does not
 * exist. Boron has three electrons to play with; three is the answer.
 */
export function valencyOf(z: number): number {
  return Math.min(outerOf(z), roomOf(z))
}

/** True for the noble gases: a full outer shell, nothing to gain or give. */
export function isNoble(z: number): boolean {
  return roomOf(z) === 0
}

const METALLIC: Category[] = ['alkali', 'alkaline', 'metal']

/** Metal for the counting rule's purposes. Metalloids count as non-metals here. */
export function isMetal(z: number): boolean {
  const el = ELEMENT_BY_Z[z]
  return !!el && METALLIC.includes(el.category)
}

/**
 * What each element says about itself, in the same words everywhere.
 *
 * "1 outer · gives 1" and "7 outer · takes 1" is the whole of what a learner
 * needs to derive NaCl, and neither phrase contains the answer.
 */
export function appetiteOf(z: number): string {
  const outer = outerOf(z)
  if (isNoble(z)) return `${outer} outer · full shell`
  const v = valencyOf(z)
  if (isMetal(z)) return `${outer} outer · gives ${v}`
  return `${outer} outer · takes ${v}`
}

/* ------------------------------------------------------------------ */
/* Electronegativity and ionic character                               */
/* ------------------------------------------------------------------ */

/** Pauling electronegativities, Z ≤ 20 (real values; noble gases have none). */
const CHI: Record<number, number> = {
  1: 2.2,
  3: 0.98,
  4: 1.57,
  5: 2.04,
  6: 2.55,
  7: 3.04,
  8: 3.44,
  9: 3.98,
  11: 0.93,
  12: 1.31,
  13: 1.61,
  14: 1.9,
  15: 2.19,
  16: 2.58,
  17: 3.16,
  19: 0.82,
  20: 1.0,
}

export function electronegativity(z: number): number | null {
  return CHI[z] ?? null
}

/**
 * Ionic character, Pauling: `1 − exp(−¼Δχ²)`.
 *
 * **A slope, not a switch.** There is no line at which a bond becomes ionic;
 * pretending there is one is how learners end up believing HCl and NaCl are
 * different kinds of thing rather than the same kind at different strengths.
 */
export function ionicCharacter(za: number, zb: number): number | null {
  const a = electronegativity(za)
  const b = electronegativity(zb)
  if (a === null || b === null) return null
  const d = Math.abs(a - b)
  return 1 - Math.exp(-0.25 * d * d)
}

/* ------------------------------------------------------------------ */
/* The outlook — what will happen, never the number                    */
/* ------------------------------------------------------------------ */

export type Outlook = 'swap' | 'share' | 'mix' | 'refuse'

export interface PairOutlook {
  kind: Outlook
  /** A tag for an element tile, measured against what is in the other slot. */
  tag: string
  /** The reasoning in full, for the card on the question plate. */
  why: string
}

/**
 * One rule, four cases.
 *
 * Metal + non-metal **swap** (electrons change owner outright). Two non-metals
 * **share**. Two metals **mix only** — an alloy is a mixture, not a compound,
 * and that distinction is worth a whole level later. Anything with a noble gas
 * **refuses**.
 *
 * Nothing here may name a subscript, a ratio or a formula. The suite enforces
 * it across all 400 pairs, in both directions.
 */
export function pairOutlook(za: number, zb: number): PairOutlook {
  const a = ELEMENT_BY_Z[za]
  const b = ELEMENT_BY_Z[zb]
  if (!a || !b) return { kind: 'refuse', tag: 'not here', why: 'That element is not on this bench.' }

  if (isNoble(za) || isNoble(zb)) {
    const noble = isNoble(za) ? a : b
    return {
      kind: 'refuse',
      tag: 'refuses',
      why: `${noble.name} already has a full outer shell. It has nothing to give and no room to take, so it does not join anything here.`,
    }
  }
  if (isMetal(za) && isMetal(zb)) {
    return {
      kind: 'mix',
      tag: 'mixes only',
      why: `${a.name} and ${b.name} are both metals — both give electrons away, and neither will take any. They mix, the way gold and copper mix, but they do not form a compound.`,
    }
  }
  if (isMetal(za) !== isMetal(zb)) {
    const metal = isMetal(za) ? a : b
    const other = isMetal(za) ? b : a
    return {
      kind: 'swap',
      tag: 'swaps',
      why: `${metal.name} gives outer electrons away; ${other.name} has room to take them. The electrons change owner outright, and the charged atoms that are left grip each other.`,
    }
  }
  return {
    kind: 'share',
    tag: 'shares',
    why: `${a.name} and ${b.name} both want to take electrons, and neither will give any up. So they share — each shared pair counts for both atoms at once.`,
  }
}

/* ------------------------------------------------------------------ */
/* The formula                                                         */
/* ------------------------------------------------------------------ */

/**
 * IUPAC puts hydrogen *after* these, and before everything else.
 *
 * Without the set you get H₃N and H₄C on screen, which are not wrong about the
 * atoms and are wrong about how chemistry is written — and a learner who writes
 * H₃N in an IGCSE paper loses the mark.
 */
export const H_FOLLOWS = new Set(['B', 'C', 'N', 'Si', 'P'])

export interface Formula {
  /** Ordered pairs, e.g. [['Na',1],['Cl',1]] or [['H',2],['O',1]]. */
  parts: Array<[string, number]>
  /** "NaCl", "H₂O", "NH₃". */
  text: string
}

const SUBS = '₀₁₂₃₄₅₆₇₈₉'
export function subscript(n: number): string {
  return n === 1 ? '' : String(n).split('').map((d) => SUBS[Number(d)]).join('')
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

/** Which element is written first. */
function writtenFirst(a: ElementInfo, b: ElementInfo): [ElementInfo, ElementInfo] {
  // A metal always leads: NaCl, CaO.
  if (isMetal(a.z) !== isMetal(b.z)) return isMetal(a.z) ? [a, b] : [b, a]
  // Hydrogen is the special case IUPAC carves out.
  if (a.symbol === 'H' && H_FOLLOWS.has(b.symbol)) return [b, a]
  if (b.symbol === 'H' && H_FOLLOWS.has(a.symbol)) return [a, b]
  if (a.symbol === 'H') return [a, b]
  if (b.symbol === 'H') return [b, a]
  // Otherwise the less electronegative atom leads: CO₂, SO₂, SiO₂.
  const ca = electronegativity(a.z) ?? 0
  const cb = electronegativity(b.z) ?? 0
  if (ca !== cb) return ca < cb ? [a, b] : [b, a]
  return a.z < b.z ? [a, b] : [b, a]
}

/**
 * Cross the valencies and cancel.
 *
 * Two atoms of the same element are a special case — the formula is E₂, not E,
 * because the counting rule is about how many bonds each atom needs, and two
 * identical atoms satisfy each other one pair at a time.
 */
export function formulaFor(za: number, zb: number): Formula | null {
  const a = ELEMENT_BY_Z[za]
  const b = ELEMENT_BY_Z[zb]
  if (!a || !b) return null
  if (isNoble(za) || isNoble(zb)) return null
  if (isMetal(za) && isMetal(zb)) return null

  if (za === zb) {
    return { parts: [[a.symbol, 2]], text: `${a.symbol}${subscript(2)}` }
  }

  const va = valencyOf(za)
  const vb = valencyOf(zb)
  if (va <= 0 || vb <= 0) return null
  const g = gcd(va, vb)
  const na = vb / g
  const nb = va / g

  const [first, second] = writtenFirst(a, b)
  const nFirst = first.z === za ? na : nb
  const nSecond = second.z === za ? na : nb
  return {
    parts: [
      [first.symbol, nFirst],
      [second.symbol, nSecond],
    ],
    text: `${first.symbol}${subscript(nFirst)}${second.symbol}${subscript(nSecond)}`,
  }
}

/* ------------------------------------------------------------------ */
/* Where the counting rule runs out                                    */
/* ------------------------------------------------------------------ */

/**
 * Pairs the counting rule cannot settle, and what really forms.
 *
 * These are not bugs to be fudged. The rule is a good rule with an edge, and
 * showing a learner the edge — with the real answer named, not hidden — is
 * better chemistry than a rule that pretends to be universal. An Analyst level
 * at Door 2 sends the learner looking for one of these on purpose.
 *
 * "Unsupported" is not "impossible".
 */
export const RULE_LIMITS: Record<string, string> = {
  '8:16': 'The counting rule says SO. What sulfur and oxygen really make is SO₂ and SO₃, depending on the conditions — sulfur can use more of its outer electrons than the rule allows for, and the rule has no way to know that.',
  '7:8': 'The counting rule says N₂O₃. Nitrogen and oxygen make at least six different compounds (NO, NO₂, N₂O, N₂O₄, N₂O₅ …) and the rule cannot choose between them.',
  '6:20': 'The counting rule says Ca₂C. The real compound is calcium carbide, CaC₂, where the carbon atoms are bonded to each other first — the rule counts atoms, not the shapes they make.',
  '6:12': 'The counting rule says Mg₂C. The real compounds are magnesium carbides such as Mg₂C₃, again because the carbons bond to one another.',
  '3:6': 'The counting rule says Li₄C. The real compound is lithium carbide, Li₂C₂, with a carbon–carbon pair at its heart.',
}

function limitKey(za: number, zb: number): string {
  return za < zb ? `${za}:${zb}` : `${zb}:${za}`
}

/** The real-chemistry footnote for a pair, or null when the rule is sound. */
export function ruleLimitFor(za: number, zb: number): string | null {
  return RULE_LIMITS[limitKey(za, zb)] ?? null
}

/* ------------------------------------------------------------------ */
/* Structure — four different words for four different things          */
/* ------------------------------------------------------------------ */

export type Structure = 'molecule' | 'lattice' | 'network' | 'free molecules' | 'mixture'

export const STRUCTURE_NOTES: Record<Structure, string> = {
  molecule: 'Separate molecules, each one a fixed little group of atoms. They are not strongly attached to each other, which is why this melts and boils easily.',
  lattice:
    'A lattice: charged atoms packed in a repeating grid, every one gripping its neighbours. There are no molecules in it anywhere — that is why it is a hard solid with a very high melting point.',
  network:
    'A giant network: every atom bonded to the next, all the way through, one single enormous structure. Nothing here melts easily. The counting rule cannot tell you this happens — carbon and silicon count the same way, and one makes a gas while the other makes sand.',
  'free molecules': 'Two atoms of the same element, holding on to each other. This is still an element, not a compound — the molecule just happens to have two atoms in it.',
  mixture: 'A mixture, not a compound: the atoms are jumbled together in no fixed proportion, and you could vary it.',
}

/**
 * What kind of thing this is.
 *
 * "Molecule" is the word everybody reaches for and it is wrong for most of what
 * this bench makes. Salt and sodium nitride have no molecules in them anywhere,
 * and that is exactly why salt is a hard cube that melts at 800 °C while water
 * pours.
 */
/**
 * The pairs that build a giant network instead of separate molecules.
 *
 * This is **not** something the counting rule decides, and pretending otherwise
 * would be the same sin as fudging `RULE_LIMITS`. CO₂ is a gas of small
 * molecules and SiO₂ is sand, from the same 1:2 counting — because carbon is
 * small enough to make strong double bonds and close the molecule, and silicon
 * is not, so its single bonds just keep going. Same arithmetic, different
 * atoms, different substance. The set is named here so the cabinet can say so.
 */
const NETWORK_PAIRS = new Set(['6:6', '14:14', '8:14', '6:14'])

export function structureFor(za: number, zb: number): Structure | null {
  const look = pairOutlook(za, zb)
  if (look.kind === 'refuse') return null
  if (look.kind === 'mix') return 'mixture'
  if (NETWORK_PAIRS.has(limitKey(za, zb))) return 'network'
  if (za === zb) return 'free molecules'
  if (look.kind === 'swap') return 'lattice'
  return 'molecule'
}

/* ------------------------------------------------------------------ */
/* Shape — VSEPR on the finished graph, never a lookup                 */
/* ------------------------------------------------------------------ */

export type Shape = 'linear' | 'bent' | 'trigonal pyramidal' | 'trigonal planar' | 'tetrahedral' | 'none'

/**
 * The shape of a small molecule with one central atom.
 *
 * Counted, not looked up: bonded neighbours **plus lone pairs** on the central
 * atom decide the arrangement, and then the lone pairs are made invisible again
 * to give the shape its name. Water is bent for the reason water is bent — two
 * neighbours and two lone pairs arranged as a tetrahedron — rather than because
 * a table somewhere says "water: bent".
 */
export function shapeOf(centreZ: number, neighbours: number, lonePairs: number): Shape {
  const domains = neighbours + lonePairs
  if (!ELEMENT_BY_Z[centreZ] || neighbours < 1) return 'none'
  if (domains === 2) return 'linear'
  if (domains === 3) return neighbours === 3 ? 'trigonal planar' : 'bent'
  if (domains === 4) {
    if (neighbours === 4) return 'tetrahedral'
    if (neighbours === 3) return 'trigonal pyramidal'
    if (neighbours === 2) return 'bent'
    return 'linear'
  }
  return 'none'
}

/** Lone pairs left on an atom once it has made `bonds` bonds. */
export function lonePairsOn(z: number, bonds: number): number {
  if (isMetal(z)) return 0
  return Math.max(0, Math.floor((outerOf(z) - bonds) / 2))
}

/* ------------------------------------------------------------------ */
/* The reaction                                                        */
/* ------------------------------------------------------------------ */

export interface Reaction {
  za: number
  zb: number
  outlook: PairOutlook
  formula: Formula | null
  structure: Structure | null
  /** Name of the product, when the cabinet knows one worth saying. */
  name: string | null
  /** 0–1, Pauling. Null when an element has no electronegativity (noble). */
  ionic: number | null
  shape: Shape
  /** Where the counting rule runs out, in full. Null when it is sound. */
  caveat: string | null
}

/** Product names worth saying out loud. Anything not here goes unnamed rather than invented. */
const NAMES: Record<string, string> = {
  'H2O': 'Water',
  'NaCl': 'Salt — sodium chloride',
  'CO2': 'Carbon dioxide',
  'CH4': 'Methane',
  'NH3': 'Ammonia',
  'CaO': 'Quicklime — calcium oxide',
  'MgO': 'Magnesium oxide',
  'H2': 'Hydrogen gas',
  'O2': 'Oxygen gas',
  'N2': 'Nitrogen gas',
  'Cl2': 'Chlorine gas',
  'HCl': 'Hydrogen chloride',
  'SiO2': 'Silica — sand and quartz',
  'CaCl2': 'Calcium chloride',
  'Na2O': 'Sodium oxide',
  'AlCl3': 'Aluminium chloride',
  'Li2O': 'Lithium oxide',
  'KCl': 'Potassium chloride',
  'MgCl2': 'Magnesium chloride',
  'Al2O3': 'Alumina — aluminium oxide',
  'CaS': 'Calcium sulfide',
  'H2S': 'Hydrogen sulfide',
  'PH3': 'Phosphine',
  'SiC': 'Silicon carbide — carborundum',
}

/** The plain-ASCII key a formula is named by, e.g. "H₂O" → "H2O". */
export function nameKey(f: Formula): string {
  return f.parts.map(([sym, n]) => (n === 1 ? sym : `${sym}${n}`)).join('')
}

export function reactionFor(za: number, zb: number): Reaction {
  const outlook = pairOutlook(za, zb)
  const formula = formulaFor(za, zb)
  const structure = structureFor(za, zb)
  const ionic = ionicCharacter(za, zb)
  const name = formula ? (NAMES[nameKey(formula)] ?? null) : null

  // The shape is only meaningful for a small molecule with one central atom:
  // the atom that appears once is the centre, and the other one surrounds it.
  let shape: Shape = 'none'
  if (formula && structure === 'molecule' && formula.parts.length === 2) {
    const [[symA, nA], [symB, nB]] = formula.parts
    const centreSym = nA === 1 ? symA : nB === 1 ? symB : null
    if (centreSym) {
      const centre = ELEMENTS.find((e) => e.symbol === centreSym)
      const neighbours = centreSym === symA ? nB : nA
      if (centre) shape = shapeOf(centre.z, neighbours, lonePairsOn(centre.z, valencyOf(centre.z)))
    }
  }

  return { za, zb, outlook, formula, structure, name, ionic, shape, caveat: ruleLimitFor(za, zb) }
}

/* ------------------------------------------------------------------ */
/* The ratio question — asked the way it is answered                   */
/* ------------------------------------------------------------------ */

export interface RatioQuestion {
  /** The element the learner counts, i.e. the one whose subscript is unknown. */
  askSymbol: string
  /** The element that appears once — the anchor the question is "per". */
  perSymbol: string
  /** "How many hydrogen atoms for every one oxygen?" */
  text: string
  /** The answer. Never rendered anywhere near the question. */
  answer: number
}

/**
 * Which subscript the dial is asking for.
 *
 * The Matter Works asked this backwards once: the dial said "how many oxygen
 * per hydrogen" while the recorded answer was the *other* subscript, so a
 * learner who correctly predicted 2 for water was marked wrong. The question,
 * the dial's label, the recorded reading and both narration lines all read from
 * this one function so they cannot drift apart again.
 *
 * It anchors on whichever element carries subscript 1. When neither does (or
 * both do) it anchors on the second-written element, which is the one a learner
 * reads last.
 */
export function ratioQuestion(f: Formula): RatioQuestion | null {
  if (f.parts.length !== 2) return null
  const [[symA, nA], [symB, nB]] = f.parts
  let ask: [string, number]
  let per: string
  if (nA === 1 && nB !== 1) {
    ask = [symB, nB]
    per = symA
  } else if (nB === 1 && nA !== 1) {
    ask = [symA, nA]
    per = symB
  } else {
    ask = [symA, nA]
    per = symB
  }
  const askEl = ELEMENTS.find((e) => e.symbol === ask[0])
  const perEl = ELEMENTS.find((e) => e.symbol === per)
  if (!askEl || !perEl) return null
  return {
    askSymbol: ask[0],
    perSymbol: per,
    text: `How many ${askEl.name.toLowerCase()} atoms for every one ${perEl.name.toLowerCase()}?`,
    answer: ask[1],
  }
}
