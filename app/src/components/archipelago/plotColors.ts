/**
 * The plot's colours, shared by the plate's dials and the day ring in the
 * scene so a word is the same colour everywhere it appears. Meaning colours,
 * never decoration; each is always shown with its word beside it.
 */

export const PLOT_AMBER = '#F0B354'
export const PLOT_CREAM = '#F6F2E8'

/** The probe's three words. DAMP is the healthy middle, so it wears the leaf's green. */
export const WORD_COLOR = { SOAKED: '#4F8AA8', DAMP: '#7BD389', DRY: '#E8A33D' } as const

/** Air in the pores. */
export const AIR_COLOR = { little: '#FF8A5C', some: '#E8A33D', plenty: '#F6F2E8' } as const

/** The leaf against its two lines: under the floor, between, standing. */
export const LEAF_COLOR = { down: '#FF8A5C', close: '#E8A33D', standing: '#7BD389' } as const

export function leafColor(firm: number, floor: number, standing: number): string {
  return firm >= standing ? LEAF_COLOR.standing : firm >= floor ? LEAF_COLOR.close : LEAF_COLOR.down
}
