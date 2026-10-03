/**
 * S2 round A3 — where the strap bench, the vice and the repair drawing stand,
 * and where the camera cuts to for each (storyboard v3.1 §03 M1 and M5; the
 * design of 2 Oct).
 *
 * The strap bench is beside Sefu's post by the gate ([3.2, 0, 8], facing the
 * gate), so an arriving child sees the strap with him in the frame. The vice
 * is under the north-east tool rack on the east wall (inner face x ≈ 12.7),
 * the strips in a row along the wall and seen side-on from the yard; the
 * drawing board stands just south of it.
 */

import type { Vec3 } from './benchLayout'

/* ---- the strap bench (moment 1) -------------------------------------------- */

/** A plank bench to Sefu's left, its long side toward the gate. */
export const STRAP_BENCH_AT: Vec3 = [4.75, 0, 8.3]
export const STRAP_BENCH = { length: 1.5, depth: 0.62, top: 0.84 }
/** Where the explorer's verb finds it: the gate side. */
export const STRAP_VERB_AT: Vec3 = [4.75, 0, 9.3]
export const STRAP_REACH = 1.3
export const STRAP_CAM = { pos: [4.25, 1.62, 10.25] as Vec3, look: [4.55, 0.98, 8.3] as Vec3 }
export const STRAP_CAM_PHONE = { pos: [4.35, 1.42, 9.95] as Vec3, look: [4.6, 1.12, 8.3] as Vec3 }

/* ---- the vice (moment 5) ----------------------------------------------------- */

/** The vice bench along the east wall, under the rack at z = −4. */
export const VICE_BENCH_AT: Vec3 = [12.0, 0, -4.2]
export const VICE_BENCH = { length: 2.4, depth: 0.8, top: 0.86 }
/** The strips' own line: their height above the floor, and how far off the wall they sit. */
export const STRIP_Y = 1.32
export const STRIP_X = 11.86
/** Each strip's jaw along the wall (z), in the vice's order; the arm reaches south (+z) from it. */
export const JAW_Z = [-5.12, -4.62, -4.12, -3.62] as const
export const ARM = { len: 0.36, wid: 0.07, thick: 0.012 }
/** The straight edge behind the strips, at their unloaded height. */
export const RULE = { z0: -5.3, z1: -3.1, x: 12.2 }
export const VICE_VERB_AT: Vec3 = [11.0, 0, -4.2]
export const VICE_REACH = 1.5
export const VICE_CAM = { pos: [9.55, 1.5, -4.2] as Vec3, look: [12.0, 1.16, -4.2] as Vec3 }
export const VICE_CAM_PHONE = { pos: [10.15, 1.42, -4.2] as Vec3, look: [12.0, 1.3, -4.2] as Vec3 }

/** Where Sefu stands for the test and the drawing: at the bench's south end, between the two. */
export const SEFU_AT_VICE: Vec3 = [11.75, 0, -2.6]

/* ---- the repair drawing ------------------------------------------------------- */

/** A board on a frame against the east wall, facing the yard. */
export const DRAWING_AT: Vec3 = [12.3, 0, -1.25]
export const DRAWING = { w: 1.7, h: 1.25, y: 1.5 }
export const DRAWING_VERB_AT: Vec3 = [11.2, 0, -1.25]
export const DRAWING_REACH = 1.2
export const DRAWING_CAM = { pos: [10.05, 1.55, -1.25] as Vec3, look: [12.3, 1.42, -1.25] as Vec3 }
export const DRAWING_CAM_PHONE = { pos: [10.45, 1.5, -1.25] as Vec3, look: [12.3, 1.62, -1.25] as Vec3 }
