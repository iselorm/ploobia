/**
 * S2 — where the cold bench and the balance bench stand in the courtyard, and
 * where the camera cuts to for each (storyboard v3.1 §07; the mock review of
 * 29 Sep: the instrument belongs to its bench, the view cuts close, the
 * explorer stays out of the reading).
 *
 * The west wall's inner face is at x ≈ −12.7; the yard lamp at (−11.6, 3.2, 4)
 * lights both benches. Both face east, toward the yard.
 */

export type Vec3 = [number, number, number]

/** The cold bench: a stone slab on trestles with the water butt at its north end. */
export const COLD_BENCH_AT: Vec3 = [-11.3, 0, 3.4]
export const COLD_BENCH = { length: 2.4, depth: 0.8, top: 0.86 }
/** On the slab: the jug toward the yard, the pattern beside it, the tray at the south end. */
export const JUG_AT: Vec3 = [-11.1, COLD_BENCH.top, 3.2]
export const PATTERN_AT: Vec3 = [-11.55, COLD_BENCH.top, 2.7]
export const TRAY_AT: Vec3 = [-11.2, COLD_BENCH.top, 4.15]
export const BUTT_AT: Vec3 = [-11.4, 0, 1.9]

/** The balance bench: planks on iron legs, the scrap bin beside its south leg. */
export const BALANCE_BENCH_AT: Vec3 = [-11.3, 0, 6.8]
export const BALANCE_BENCH = { length: 1.8, depth: 0.7, top: 0.82 }
export const BALANCE_AT: Vec3 = [-11.2, BALANCE_BENCH.top, 6.8]
export const BIN_AT: Vec3 = [-11.6, 0, 8.1]

/**
 * The room cuts: close on the instrument, a little high, from the yard side.
 * On a phone the strip takes the top of the screen, so the phone cut looks a
 * little further down and the instrument sits below it.
 */
export const BENCH_CAM = { pos: [-9.6, 1.6, 4.35] as Vec3, look: [-11.15, 0.92, 3.15] as Vec3 }
export const BENCH_CAM_PHONE = { pos: [-9.55, 1.45, 4.3] as Vec3, look: [-11.15, 1.32, 3.15] as Vec3 }
export const BALANCE_CAM = { pos: [-9.4, 1.75, 7.95] as Vec3, look: [-11.2, 1.0, 6.8] as Vec3 }
export const BALANCE_CAM_PHONE = { pos: [-9.3, 1.6, 7.9] as Vec3, look: [-11.2, 1.5, 6.8] as Vec3 }

/** Reach of the two verbs. */
export const BENCH_REACH = 1.9
