/**
 * S2 round A2 — where the gate mould lies and where the camera cuts to for it
 * (storyboard v3.1 §03 M4, §07; mock v2 frame 6: the mould at the furnace
 * foot, the channel running to it, the furnace behind).
 *
 * The pour channel runs along x = 0 from the furnace mouth to z = −2.4. The
 * mould lies half-buried in a bed of casting sand at its foot, the strap's
 * length across the view (east–west), so the cut from the yard side reads it
 * end to end. Its top face is BELOW the channel's lip: copper runs down.
 */

import type { Vec3 } from './benchLayout'

/** Where the channel ends (Courtyard's channel: 4.4 m long, centred at z = −4.6). */
export const CHANNEL = { z0: -6.8, z1: -2.4, width: 0.9, top: 0.12 }

/** The centre of the sand bed and of the mould in it. */
export const MOULD_AT: Vec3 = [0, 0, -1.5]
export const SAND = { w: 2.9, d: 1.7, top: 0.05 }
/** The mould's lower half: length along x, width along z, its top face above the floor. */
export const MOULD = { len: 1.36, wid: 0.7, top: 0.11, lid: 0.1 }
/** The strap cavity: one metre end to end before its round caps, lying toward the back of the mould. */
export const STRAP = { len: 1.0, wid: 0.15, z: -0.07 }
/** The pouring basin at the mould's north-west shoulder, where the spout from the channel lands. */
export const BASIN_AT: Vec3 = [-0.5, 0, -0.47]
/** The recovery tray, on the sand beside the mould's east end. */
export const TRAY_AT: Vec3 = [1.1, 0, -1.78]

/**
 * Where Sefu stands for the pour: east of the channel, behind the tray — clear of the quest plate in the
 * cut, and far enough from the furnace mouth that the child at the mouth still gets the furnace's verb.
 */
export const SEFU_AT_MOULD: Vec3 = [1.95, 0, -2.9]

/** Where the explorer's Measure verb finds the mould: the yard side of the sand. */
export const MOULD_VERB_AT: Vec3 = [0.2, 0, -0.55]
export const MOULD_REACH = 1.6

/**
 * The room cut: from the yard side, a little high, the strap across the frame
 * and the furnace mouth behind it. On a phone the strip takes the top of the
 * screen, so the phone cut looks further up and the mould sits below it.
 */
export const MOULD_CAM = { pos: [0.3, 1.8, 0.5] as Vec3, look: [0.05, 0.2, -1.7] as Vec3 }
export const MOULD_CAM_PHONE = { pos: [0.3, 1.55, 0.4] as Vec3, look: [0.05, 0.42, -1.8] as Vec3 }
