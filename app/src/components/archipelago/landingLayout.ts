/**
 * Where things stand on the Landing — one module with no imports, so the
 * scene files (Landing, Plot, Nara) and the suites read the same numbers
 * without a circular import. The plaza is a disc of radius 14 at y = 0; the
 * gate is at z = −11.5 with a clear walk to it down x = 0; the jetty runs
 * out over the water to the south-east.
 */

export const PORTAL: [number, number, number] = [0, 0, -11.5]
export const JETTY_X = 5
/** Where the child stands on arrival: the jetty's end, facing the settlement. */
export const LANDING_SPAWN: [number, number, number] = [JETTY_X, 0.6, 17.5]
export const WELL: [number, number, number] = [3.6, 0, 3.2]

export const BEDS = {
  /** Nara's, by the well — her mother's cutting, drowning. */
  nara: [0.5, 0, 1.2] as [number, number, number],
  /** The empty plot beside it — the child's. */
  mine: [-2.4, 0, 1.4] as [number, number, number],
  /** Down the path past the store — the far bed. */
  far: [-9.5, 0, -1.0] as [number, number, number],
}
/** The marker leaning on the child's rail, and standing at the plot's corner once it is in. */
export const MARKER_LEAN: [number, number, number] = [-1.45, 0, 2.3]
export const MARKER_IN: [number, number, number] = [-3.25, 0, 2.3]
/** The torn page in the mud by the well. */
export const PAGE: [number, number, number] = [WELL[0] + 0.9, 0, WELL[2] + 0.9]
/** Sela, at the jetty's landward end. */
export const SELA_AT: [number, number, number] = [JETTY_X - 0.2, 0, 13.6]
