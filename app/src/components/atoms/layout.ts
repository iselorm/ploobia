/** Shared world layout for the foundry — the wall and the stage agree through this file. */

export const STAGE_POS: [number, number, number] = [0, 1.9, 0]

export const WALL_Z = -5.6
export const TILE_PITCH_X = 0.95
export const TILE_PITCH_Y = 0.82
export const TILE_SIZE = 0.82
export const WALL_TOP_Y = 3.3

/** World-space centre of a wall tile (row 1–4, col 1–8). */
export function tileCenter(row: number, col: number): [number, number, number] {
  return [(col - 4.5) * TILE_PITCH_X, WALL_TOP_Y - (row - 1) * TILE_PITCH_Y, WALL_Z + 0.09]
}

/** Shell ring radii on the build stage. */
export const SHELL_RADII = [0.42, 0.66, 0.9, 1.12]
/** Orbit speed per shell (inner shells whirl faster). */
export const SHELL_SPEEDS = [1.5, 1.05, 0.75, 0.55]
