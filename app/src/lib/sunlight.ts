/**
 * The live sun — one shared source of truth.
 *
 * The world driver moves these every frame from the interpolated `WorldState`;
 * shaders, sprites and the light rig all read them rather than each keeping a
 * private copy. Mutated in place (never reassigned) so they can be handed
 * straight to a uniform.
 */

import * as THREE from 'three'

/** World-space position of the sun disc. */
export const SUN_POS = new THREE.Vector3(6.5, 8, -4.5)
/** Unit direction from the world toward the sun. */
export const SUN_DIR = new THREE.Vector3(0.5, 0.72, -0.35).normalize()
/** Sun tint — white-gold at noon, amber at dusk. */
export const SUN_TINT = new THREE.Color('#FFE27A')
/** How far the disc sits from the origin. */
export const SUN_DISTANCE = 12.5
/** Scalars the shaders need: `daylight` 0..1 from the world, `power` folds in the light slider. */
export const SUN_STATE = { daylight: 1, power: 1 }
