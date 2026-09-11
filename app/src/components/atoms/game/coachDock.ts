/**
 * Where Ploob's line sits, and how the move button walks it round.
 *
 * Its own module because the HUD file may only export components (the React
 * Compiler's fast-refresh rule), and because *where the coach lives* is a
 * piece of the cabinet's state, not a detail of how the plate is drawn.
 */

export type CoachDock = 'float' | 'left' | 'right' | 'hidden'

export const COACH_KEY = 'ploobia.foundry.coach.v1'

/** The next place the move button sends it. Phones have no columns to send it to. */
export function nextDock(dock: CoachDock, columns: boolean): CoachDock {
  if (!columns) return 'float'
  if (dock === 'float') return 'left'
  if (dock === 'left') return 'right'
  return 'float'
}
