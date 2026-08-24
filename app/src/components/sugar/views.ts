/**
 * Authored viewpoints.
 *
 * Each is a composed shot rather than a random crop: the subject reads before
 * the caption explains it. The camera flies to one for a short window and then
 * hands control straight back to OrbitControls — a rig that keeps pulling the
 * camera home fights the learner, which is a mistake this codebase has made
 * once already.
 */

import type { StageId } from '@/lib/sugarsim'

export interface Viewpoint {
  id: string
  label: string
  stage: StageId
  hint: string
  position: [number, number, number]
  target: [number, number, number]
}

export const VIEWPOINTS: Viewpoint[] = [
  {
    id: 'overview',
    label: 'Overview',
    stage: 'plant',
    hint: 'The whole specimen: leaves, stem and everything underground.',
    position: [0.72, 1.85, 6.5],
    target: [0, 1.0, 0],
  },
  {
    id: 'canopy',
    label: 'Canopy',
    stage: 'plant',
    hint: 'Where the sugar is made. Watch it load into the veins.',
    position: [1.1, 3.15, 3.3],
    target: [0.1, 2.15, 0],
  },
  {
    id: 'stem',
    label: 'Stem',
    stage: 'plant',
    hint: 'The cutaway: water climbing one pipe, sugar descending the other.',
    position: [0.32, 1.62, 1.95],
    target: [0, 1.25, 0],
  },
  {
    id: 'roots',
    label: 'Below ground',
    stage: 'plant',
    hint: 'The customers. Nothing down here can photosynthesise.',
    position: [0.55, 0.15, 2.35],
    target: [0, -0.62, 0],
  },
  {
    id: 'backlit',
    label: 'Backlit',
    stage: 'plant',
    hint: 'Low and against the light, the way a leaf is read in the field.',
    position: [-2.1, 0.62, 3.5],
    target: [0.1, 1.6, -0.1],
  },
  {
    id: 'inside',
    label: 'Inside',
    stage: 'leaf',
    hint: 'A chloroplast: grana on the light reactions, the cycle in the stroma.',
    position: [0.25, 1.95, 6.1],
    target: [0.05, 1.32, 0],
  },
  {
    id: 'cycle',
    label: 'The cycle',
    stage: 'leaf',
    hint: 'Close on the Calvin cycle and the carbon leaving it as sugar.',
    position: [0.55, 1.6, 4.7],
    target: [0.05, 1.05, 0.15],
  },
  {
    id: 'section',
    label: 'Section',
    stage: 'stem',
    hint: 'One xylem vessel and one sieve tube, at working scale.',
    position: [0.2, 2.05, 7.6],
    target: [0.1, 2.0, 0],
  },
  {
    id: 'plate',
    label: 'Sieve plate',
    stage: 'stem',
    hint: 'The perforated end wall every parcel has to squeeze through.',
    position: [1.45, 3.5, 2.75],
    target: [0.42, 3.32, 0],
  },
]

export const VIEW_BY_ID: Record<string, Viewpoint> = Object.fromEntries(
  VIEWPOINTS.map((v) => [v.id, v]),
)

export function viewsForStage(stage: StageId): Viewpoint[] {
  return VIEWPOINTS.filter((v) => v.stage === stage)
}

/** The shot a stage opens on. */
export function defaultViewFor(stage: StageId): Viewpoint {
  return viewsForStage(stage)[0] ?? VIEWPOINTS[0]
}
