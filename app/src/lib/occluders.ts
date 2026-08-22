/**
 * Contact occlusion — the cheap ambient-occlusion model for the garden.
 *
 * A screen-space AO pass is the obvious answer and the wrong one here: it needs
 * a normal buffer, and the grass builds its blades in the vertex shader, so the
 * normal pass would draw 42 000 blades in the wrong place. It also costs a full
 * extra pass on exactly the mid-range tablets this platform is for, and it is
 * unavailable in Cardboard stereo (where the post chain steps aside).
 *
 * Instead the scene declares the handful of things that actually occlude
 * ambient light near the subject — the soil mound, the stem, the canopy, the
 * apparatus — as spheres. Terrain, grass and props darken their *indirect*
 * light near those spheres in the fragment shader: a few dozen instructions,
 * no extra pass, correct in both eyes.
 */

import * as THREE from 'three'

export const MAX_OCCLUDERS = 5

/** xyz = world centre, w = radius. A radius of 0 disables the slot. */
export const OCCLUDERS: THREE.Vector4[] = Array.from({ length: MAX_OCCLUDERS }, () => new THREE.Vector4(0, 0, 0, 0))
/** Per-slot strength 0..1, so a fading prop can fade its occlusion too. */
export const OCCLUDER_K: number[] = Array.from({ length: MAX_OCCLUDERS }, () => 0)

/** Slot assignments — fixed, so nothing has to negotiate at runtime. */
export const OCC_SLOT = {
  mound: 0,
  stem: 1,
  canopy: 2,
  apparatus: 3,
  spare: 4,
} as const

export function setOccluder(slot: number, x: number, y: number, z: number, radius: number, strength = 1): void {
  OCCLUDERS[slot].set(x, y, z, radius)
  OCCLUDER_K[slot] = strength
}

export function clearOccluder(slot: number): void {
  OCCLUDERS[slot].w = 0
  OCCLUDER_K[slot] = 0
}
