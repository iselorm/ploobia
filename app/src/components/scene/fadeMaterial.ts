import * as THREE from 'three'

/**
 * Per-instance fading for instanced sprites, done through ALPHA.
 *
 * The obvious way to fade an InstancedMesh sprite — multiply its
 * `instanceColor` toward zero — does not make it disappear. It makes it
 * **black**, because the instance colour is multiplied into an opaque texel.
 * On a dark red scene that reads as a mysterious black shape, which is exactly
 * how Blood Voyage grew a set of unexplained black chevrons.
 *
 * `instanceColor` is RGB only, so the fade needs its own per-instance channel.
 * These helpers add an `aFade` instanced attribute and multiply it into the
 * fragment alpha, leaving the instance colour free to carry the true tint at
 * full strength.
 */

/** Attach an `aFade` attribute to an instanced geometry; returns its array. */
export function attachFade(geometry: THREE.BufferGeometry, count: number): Float32Array {
  const data = new Float32Array(count)
  const attr = new THREE.InstancedBufferAttribute(data, 1)
  attr.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('aFade', attr)
  return data
}

/** Flag the fade attribute as dirty after writing into its array. */
export function commitFade(geometry: THREE.BufferGeometry): void {
  const attr = geometry.getAttribute('aFade') as THREE.InstancedBufferAttribute | undefined
  if (attr) attr.needsUpdate = true
}

/**
 * A camera-facing sprite material that honours `aFade`. Fog is off so these
 * read as luminous markers rather than dissolving into the tunnel haze — they
 * are diagrammatic objects, not part of the physical world.
 */
export function makeFadeMaterial(map: THREE.Texture): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  })
  m.fog = false
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aFade;
varying float vFade;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vFade = aFade;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vFade;`,
      )
      .replace(
        '#include <dithering_fragment>',
        `gl_FragColor.a *= clamp(vFade, 0.0, 1.0);
#include <dithering_fragment>`,
      )
  }
  // onBeforeCompile-modified materials need their own program cache entry.
  m.customProgramCacheKey = () => 'ploobia-fade-sprite'
  return m
}
