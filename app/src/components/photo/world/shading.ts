/**
 * Shared shader injections: contact occlusion and leaf translucency.
 *
 * Both work by patching stock three materials in `onBeforeCompile`, so every
 * surface keeps the standard lighting, shadow and fog paths — and both are
 * pure material work, which means they survive into Cardboard stereo where the
 * post chain is switched off.
 */

import * as THREE from 'three'
import { MAX_OCCLUDERS, OCCLUDERS, OCCLUDER_K } from '@/lib/occluders'
import { SUN_DIR, SUN_STATE, SUN_TINT } from '@/lib/sunlight'

type Shader = THREE.WebGLProgramParametersWithUniforms

/** Shared uniform objects — mutated in place by the world driver. */
export const AO_UNIFORMS = {
  uOcc: { value: OCCLUDERS },
  uOccK: { value: OCCLUDER_K },
}
export const SUN_UNIFORMS = {
  uSunDir: { value: SUN_DIR },
  uSunCol: { value: SUN_TINT },
  uSunPower: { value: 1 },
}

/** Keep the sun uniform in step with the world; called once per frame. */
export function syncSunUniforms(light: number): void {
  SUN_UNIFORMS.uSunPower.value = light * (0.25 + SUN_STATE.daylight * 0.75)
  SUN_STATE.power = SUN_UNIFORMS.uSunPower.value
}

/* ------------------------------------------------------------------ */
/* World-space varyings (position + normal), shared by both effects    */
/* ------------------------------------------------------------------ */

const VARYING_DECL = 'varying vec3 vWPosX;\nvarying vec3 vWNrmX;'

function injectWorldVaryings(shader: Shader): void {
  if (shader.vertexShader.includes('vWPosX')) return
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VARYING_DECL}`)
    // `fog_vertex` sits at the end of main in every stock material, by which
    // point `transformed` and `objectNormal` are final — including in the
    // grass, which rebuilds `transformed` from scratch.
    .replace(
      '#include <fog_vertex>',
      `#include <fog_vertex>
      vWPosX = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
      vWNrmX = normalize( mat3( modelMatrix ) * objectNormal );`,
    )
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${VARYING_DECL}`)
}

/* ------------------------------------------------------------------ */
/* Contact occlusion                                                   */
/* ------------------------------------------------------------------ */

const AO_FN = `
uniform vec4 uOcc[${MAX_OCCLUDERS}];
uniform float uOccK[${MAX_OCCLUDERS}];
float contactAO( vec3 p, vec3 n ) {
  float ao = 1.0;
  for ( int i = 0; i < ${MAX_OCCLUDERS}; i ++ ) {
    vec4 o = uOcc[ i ];
    if ( o.w <= 0.0 ) continue;
    vec3 d = o.xyz - p;
    float dist = length( d );
    // Falls off over roughly one and a half radii beyond the sphere.
    float k = clamp( 1.0 - ( dist - o.w ) / ( o.w * 1.7 ), 0.0, 1.0 );
    // A surface facing the occluder loses more sky than one facing away.
    float facing = clamp( dot( n, d / max( dist, 1e-4 ) ), 0.0, 1.0 );
    ao -= k * k * ( 0.28 + 0.72 * facing ) * uOccK[ i ];
  }
  return clamp( ao, 0.16, 1.0 );
}`

/**
 * Darkens *indirect* light (sky, environment) near the declared occluders, and
 * direct light only a little — the shadow map already owns direct light, and
 * doubling up turns contact areas to mud.
 */
export function injectContactAO(shader: Shader, strength = 1): void {
  injectWorldVaryings(shader)
  Object.assign(shader.uniforms, AO_UNIFORMS)
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${AO_FN}`)
    .replace(
      '#include <aomap_fragment>',
      `#include <aomap_fragment>
      {
        float cAO = mix( 1.0, contactAO( vWPosX, normalize( vWNrmX ) ), ${strength.toFixed(3)} );
        reflectedLight.indirectDiffuse *= cAO;
        reflectedLight.indirectSpecular *= cAO;
        reflectedLight.directDiffuse *= mix( 1.0, cAO, 0.3 );
      }`,
    )
}

/** Convenience for materials that have no other `onBeforeCompile`. */
export function applyContactAO(mat: THREE.Material, key: string, strength = 1): void {
  mat.onBeforeCompile = (shader) => injectContactAO(shader as Shader, strength)
  mat.customProgramCacheKey = () => `cao-${key}-${strength}`
}

/* ------------------------------------------------------------------ */
/* Leaf translucency                                                   */
/* ------------------------------------------------------------------ */

export interface TranslucencyHandle {
  /** 0 = opaque leaf, 1 = full transmission. Animate freely. */
  amount: { value: number }
}

/**
 * A leaf held up to the sun stops being a green surface and becomes a lit
 * window with its plumbing drawn on it. That is what this does: light that
 * arrives on the far side is scattered forward in proportion to how *thin* the
 * lamina is at that point, so the veins — thick, opaque bundles of pipework —
 * stay dark while the tissue between them burns bright green.
 *
 * Cheap on purpose: no transmission pass, no back-face render, one texture
 * fetch and a handful of dot products, and it works in stereo.
 */
export function applyLeafTranslucency(
  mat: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
  thickness: THREE.Texture,
  key: string,
  amount = 1,
): TranslucencyHandle {
  const uThick = { value: thickness }
  const uTrans = { value: amount }
  mat.onBeforeCompile = (s) => {
    const shader = s as Shader
    injectWorldVaryings(shader)
    Object.assign(shader.uniforms, SUN_UNIFORMS, { uThick, uTrans })
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uThick; uniform float uTrans;
        uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uSunPower;`,
      )
      // After `opaque_fragment` has written gl_FragColor and before tone
      // mapping: scattered light is emitted light, not reflected light.
      .replace(
        '#include <tonemapping_fragment>',
        `{
          vec3 Vv = normalize( cameraPosition - vWPosX );
          vec3 Nw = normalize( vWNrmX );
          // 1 where the lamina is thin, 0 along a vein or the midrib.
          float thin = texture2D( uThick, vMapUv ).r;
          // Looking into the sun through the leaf.
          float back = pow( clamp( - dot( Vv, uSunDir ), 0.0, 1.0 ), 2.2 );
          // Light arriving on the far side of this patch of lamina.
          float wrap = clamp( dot( - Nw, uSunDir ) * 0.55 + 0.45, 0.0, 1.0 );
          // Grazing angles glow along the margin, the way a real leaf does.
          float rim = pow( 1.0 - abs( dot( Vv, Nw ) ), 1.6 );
          float glow = back * wrap * 2.6 + back * rim * 0.95;
          // Light that comes *through* a leaf has been filtered by its
          // pigment: it arrives green, not gold. A dried leaf transmits tan,
          // which falls out of this for free because the albedo has changed.
          vec3 pigment = mix( diffuseColor.rgb * 1.9, vec3( 0.40, 0.88, 0.22 ), 0.28 );
          gl_FragColor.rgb += uSunCol * pigment * uTrans * uSunPower * glow * thin * ( 0.35 + 0.65 * thin ) * gl_FragColor.a;
        }
        #include <tonemapping_fragment>`,
      )
  }
  mat.customProgramCacheKey = () => `leaf-sss-${key}`
  mat.needsUpdate = true
  return { amount: uTrans }
}
