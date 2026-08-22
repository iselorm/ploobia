/**
 * The membrane bench.
 *
 * "Semi-permeable" is a word learners repeat without a picture attached. So the
 * membrane here has *visible pores of a chosen size*, particles have *sizes*,
 * and whether something crosses is decided by whether it fits. Swap the
 * membrane for cling film and nothing moves; swap it for filter paper and
 * everything does — and neither of those is partially permeable.
 */

export type SpeciesId = 'water' | 'glucose' | 'starch'

export interface Species {
  id: SpeciesId
  /** Short label drawn on the particle. */
  label: string
  name: string
  /** Relative molecular size. 1 is tiny; a pore must be at least this big. */
  size: number
  color: string
  /** Darker shade used for the formula drawn on the particle. */
  labelColor: string
  note: string
}

export const SPECIES: Record<SpeciesId, Species> = {
  water: {
    id: 'water',
    label: 'H₂O',
    name: 'Water',
    size: 1,
    color: '#3E90D0',
    labelColor: '#12496F',
    note: 'The smallest molecule here. It slips through almost anything with holes at all.',
  },
  glucose: {
    id: 'glucose',
    label: 'glucose',
    name: 'Glucose',
    size: 2,
    color: '#E8A33D',
    labelColor: '#7A4E06',
    note: 'A medium sugar molecule. Small enough for dialysis tubing, far too big for a cell membrane to let through freely.',
  },
  starch: {
    id: 'starch',
    label: 'starch',
    name: 'Starch',
    size: 3,
    color: '#2FB9A8',
    labelColor: '#0B5148',
    note: 'Hundreds of glucose molecules joined into a giant chain — which is exactly why plants store sugar as starch: it is too big to leak out.',
  },
}

export const SPECIES_ORDER: SpeciesId[] = ['water', 'glucose', 'starch']

export interface MembranePreset {
  id: string
  name: string
  /** Largest particle size that fits through. 0 lets nothing past. */
  poreSize: number
  /** Radius of the drawn holes, in world units. */
  poreRadius: number
  /** True only when it lets some things through and blocks others. */
  partiallyPermeable: boolean
  verdict: string
  note: string
  /** Where a learner actually meets this membrane. */
  realWorld: string[]
}

export const MEMBRANES: MembranePreset[] = [
  {
    id: 'cell',
    name: 'Cell membrane',
    poreSize: 1,
    poreRadius: 0.055,
    partiallyPermeable: true,
    verdict: 'Partially permeable — water only',
    note: 'Holes so small that only water slips through freely. Anything bigger needs a protein channel or a pump, which costs the cell energy.',
    realWorld: [
      'Every living cell you are made of, right now',
      'Root hair cells drinking water out of the soil',
      'Red blood cells, which swell and burst if you put them in pure water',
    ],
  },
  {
    id: 'visking',
    name: 'Visking tubing',
    poreSize: 2,
    poreRadius: 0.1,
    partiallyPermeable: true,
    verdict: 'Partially permeable — water and glucose',
    note: 'The classic lab stand-in for a cell membrane. Water and glucose fit; starch is far too big and stays inside.',
    realWorld: [
      'The dialysis tubing practical in almost every biology course',
      'Kidney dialysis machines, which clean waste out of blood the same way',
      'Testing food for sugars without the starch coming along',
    ],
  },
  {
    id: 'filter',
    name: 'Filter paper',
    poreSize: 3,
    poreRadius: 0.19,
    partiallyPermeable: false,
    verdict: 'Fully permeable — everything gets through',
    note: 'The holes are enormous compared with any molecule. It separates lumps from liquid, not one molecule from another — so it is NOT partially permeable.',
    realWorld: ['A coffee filter', 'A tea bag', 'Straining pasta through a colander'],
  },
  {
    id: 'plastic',
    name: 'Cling film',
    poreSize: 0,
    poreRadius: 0,
    partiallyPermeable: false,
    verdict: 'Impermeable — nothing gets through',
    note: 'No holes at all. Nothing crosses in either direction, so nothing ever evens out and osmosis cannot happen.',
    realWorld: ['Food wrap', 'A waterproof jacket', 'The waxy cuticle on top of a leaf'],
  },
]

export const MEMBRANE_BY_ID: Record<string, MembranePreset> = Object.fromEntries(
  MEMBRANES.map((m) => [m.id, m]),
)

/** Does this species fit through this membrane? */
export function canCross(species: Species, membrane: MembranePreset): boolean {
  return membrane.poreSize >= species.size
}

export type MembraneDemoId = 'diffusion' | 'osmosis'

export interface DemoSetup {
  id: MembraneDemoId
  title: string
  /** The species whose spreading the learner is watching. */
  tracer: SpeciesId
  brief: string
  /** What should happen, revealed once equilibrium is reached. */
  payoff: string
}

export const MEMBRANE_DEMOS: Record<MembraneDemoId, DemoSetup> = {
  diffusion: {
    id: 'diffusion',
    title: 'Diffusion',
    tracer: 'glucose',
    brief:
      'All the glucose starts crowded on the left. Nothing pushes it — each molecule just jiggles at random. Watch where that gets it.',
    payoff:
      'Both sides evened out. Molecules never stopped moving — as many cross left-to-right as right-to-left now, so there is no NET movement. That balance is called dynamic equilibrium.',
  },
  osmosis: {
    id: 'osmosis',
    title: 'Osmosis',
    tracer: 'water',
    brief:
      'Water starts even on both sides, but all the starch is on the right. Starch cannot cross. Watch what the water does.',
    payoff:
      'Water moved toward the starch. Not because anything pulled it — but because on the crowded side, more of the water is tied up around the solute, so fewer water molecules are free to leave. Water always moves from where it is more free to where it is less free.',
  },
}

/**
 * How much faster things spread at this temperature, relative to 22 °C.
 *
 * Molecular speed alone only rises with √T — about 8% across this whole
 * slider, which is invisible. What actually makes warm liquids mix so much
 * faster is that water gets thinner as it warms: the Stokes–Einstein relation
 * puts the diffusion coefficient at D ∝ T/η, and water's viscosity η falls
 * steeply with temperature. Together they roughly triple the spreading rate
 * between an ice bath and a hot tap — which is both real and visible.
 */
export function diffusionFactor(tempC: number): number {
  const kelvin = Math.max(273 + 1, tempC + 273)
  const reference = 295
  const viscosity = Math.exp(1900 * (1 / reference - 1 / kelvin))
  return (kelvin / reference) * viscosity
}

/**
 * Fraction of water on a side that is free to leave, given how much solute is
 * crowding it. This one line is the whole mechanism of osmosis: solute does not
 * "attract" water, it just reduces the water's freedom to depart.
 */
export function freeWaterFraction(waterCount: number, soluteCount: number): number {
  if (waterCount <= 0) return 0
  return Math.max(0.12, 1 - (soluteCount * 1.6) / (waterCount + soluteCount * 1.6))
}
