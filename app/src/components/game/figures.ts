/**
 * The layers each page-figure draws — the hotspot map that a painted card
 * from the asset pipeline must honour (see SectionFigure.tsx).
 */

export type FigureKind = 'leaf-section' | 'root-section'

export interface FigureLayer {
  key: string
  /** What the target plate and the coach say when it lights. */
  says: string
}

export const FIGURE_LAYERS: Record<FigureKind, FigureLayer[]> = {
  'leaf-section': [
    { key: 'cuticle', says: 'The cuticle: a waxy skin that keeps water in.' },
    { key: 'upperEpidermis', says: 'The upper epidermis: clear cells, no chloroplasts — a window.' },
    { key: 'palisade', says: 'The palisade mesophyll: tall cells packed with chloroplasts, where most sugar is made.' },
    { key: 'chloroplast', says: 'Chloroplasts: where the chlorophyll is, and the light is caught.' },
    { key: 'spongy', says: 'The spongy mesophyll: loose cells with air between them.' },
    { key: 'airSpaces', says: 'The air spaces: where carbon dioxide arrives and water vapour leaves from.' },
    { key: 'lowerEpidermis', says: 'The lower epidermis: the underside, with the stomata.' },
    { key: 'stoma', says: 'A stoma: two guard cells and the pore between them.' },
    { key: 'vascular', says: 'A vascular bundle — the vein: xylem above, phloem below.' },
  ],
  'root-section': [
    { key: 'soil', says: 'Soil: grains with water and mineral ions between them.' },
    { key: 'rootHair', says: 'Root hair cells: long, thin, and thousands of them — a huge surface.' },
    { key: 'cortex', says: 'The root cortex: water crosses it cell by cell.' },
    { key: 'rootXylem', says: 'The xylem at the centre: the water is on the line from here.' },
  ],
}

