/**
 * Authored viewpoints for the Rate Lab garden.
 *
 * Each is a composed shot, not a random crop: the subject reads before the
 * copy explains it. The camera flies to one for a short window and then hands
 * control straight back to OrbitControls (never fight the learner).
 */

export type ViewId = 'overview' | 'bench' | 'leaf' | 'inside' | 'sunset'

export interface Viewpoint {
  id: ViewId
  label: string
  /** One line the HUD can show while flying. */
  hint: string
  position: [number, number, number]
  target: [number, number, number]
  /** Also open the chloroplast view. */
  zoomed?: boolean
}

export const VIEWPOINTS: Viewpoint[] = [
  {
    id: 'overview',
    label: 'Overview',
    hint: 'The whole bench: leaf, climate, and the oxygen tube.',
    position: [0, 3.4, 10.5],
    target: [0, 2.2, 0],
  },
  {
    id: 'bench',
    label: 'Bench',
    hint: 'Close on the apparatus — watch the bubbles rise.',
    position: [3.6, 2.6, 4.4],
    target: [1.4, 2.0, 0.3],
  },
  {
    id: 'leaf',
    label: 'Leaf',
    hint: 'Macro on the lamina: veins carry water in, sugar out.',
    position: [1.1, 3.55, 2.3],
    target: [0, 2.85, 0.15],
  },
  {
    id: 'inside',
    label: 'Inside',
    hint: 'Through the surface into a chloroplast — where light becomes sugar.',
    position: [0.2, 3.2, 3.4],
    target: [0, 2.8, 0.45],
    zoomed: true,
  },
  {
    id: 'sunset',
    label: 'Low sun',
    hint: 'From behind the leaf, into the light.',
    position: [-2.6, 1.9, -6.2],
    target: [0, 2.6, 0.5],
  },
]

export const VIEW_BY_ID: Record<string, Viewpoint> = Object.fromEntries(VIEWPOINTS.map((v) => [v.id, v]))

/** Where the equation stage frames itself. */
export const EQUATION_VIEW: Viewpoint = {
  id: 'inside',
  label: 'Equation',
  hint: 'The photosynthesis equation, expanded.',
  position: [0, 3.9, 7.6],
  target: [0, 3.65, 0.4],
}
