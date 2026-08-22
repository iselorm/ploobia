import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import type { PhotoSim } from '@/lib/photo'
import type { WorldState } from '@/lib/world'
import { CLEARING, GROUND_Y, landH } from '@/lib/world'
import { useQualityCaps } from '@/lib/quality'

/* ------------------------------------------------------------------ */
/* One blade: a tapered 5-segment ribbon. Everything else is the shader */
/* ------------------------------------------------------------------ */

function bladeGeometry() {
  const segs = 5
  const positions: number[] = []
  const uvs: number[] = []
  const index: number[] = []
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const w = i === segs ? 0 : 0.5 * (1 - t * t * 0.85)
    positions.push(-w, t, 0, w, t, 0)
    uvs.push(0, t, 1, t)
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(index)
  geo.computeVertexNormals()
  return geo
}

const OUTER = 26

/**
 * Instanced shader grass. Bend, lean, taper and gust are all computed in the
 * vertex shader from a per-instance parameter attribute, so wind costs nothing
 * on the CPU. Blade colour is a base→tip mix from two uniforms (never hard-coded)
 * so biome and snow can recolour it. Density is a *count*, not a rebuild.
 */
export default function Grass({ sim, world }: { sim: PhotoSim; world: WorldState }) {
  const quality = useQualityCaps()
  const total = Math.round(42000 * quality.particleScale)
  const meshRef = useRef<THREE.InstancedMesh>(null)

  const { geo, mat, uniforms } = useMemo(() => {
    const geo = bladeGeometry()
    // Per-instance: world x, z, height, phase | lean, tint, ao, unused
    const p0 = new Float32Array(total * 4)
    const p1 = new Float32Array(total * 4)
    let n = 0
    let guard = 0
    while (n < total && guard < total * 8) {
      guard++
      // Denser near the clearing: sample radius with a bias toward the inside.
      const u = Math.random()
      const r = CLEARING * 0.9 + (OUTER - CLEARING * 0.9) * Math.pow(u, 1.6)
      const th = Math.random() * Math.PI * 2
      const x = Math.cos(th) * r
      const z = Math.sin(th) * r
      const h = landH(x, z)
      // Reject steep ground (rock shows) — cheap slope probe.
      const e = 0.4
      const slope = Math.abs(landH(x + e, z) - landH(x - e, z)) + Math.abs(landH(x, z + e) - landH(x, z - e))
      if (slope > 0.9) continue
      p0[n * 4] = x
      p0[n * 4 + 1] = z
      p0[n * 4 + 2] = 0.32 + Math.random() * 0.42 // height
      p0[n * 4 + 3] = Math.random() * Math.PI * 2 // phase
      p1[n * 4] = (Math.random() - 0.5) * 0.7 // lean
      p1[n * 4 + 1] = Math.random() // tint
      p1[n * 4 + 2] = GROUND_Y + h // ground y
      p1[n * 4 + 3] = Math.random() * Math.PI * 2 // yaw
      n++
    }
    geo.setAttribute('aP0', new THREE.InstancedBufferAttribute(p0, 4))
    geo.setAttribute('aP1', new THREE.InstancedBufferAttribute(p1, 4))

    const uniforms = {
      uTime: { value: 0 },
      uWind: { value: new THREE.Vector2(0.8, 0.35) },
      uWindAmp: { value: 0.35 },
      uBase: { value: new THREE.Color('#4E8B3F') },
      uTip: { value: new THREE.Color('#B4DE7A') },
      uHeight: { value: 1 },
      uSnow: { value: 0 },
      uDry: { value: 0 },
    }
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, metalness: 0, side: THREE.DoubleSide })
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec4 aP0; attribute vec4 aP1;
          uniform float uTime; uniform vec2 uWind; uniform float uWindAmp; uniform float uHeight;
          varying float vT; varying float vTint;`,
        )
        .replace(
          '#include <begin_vertex>',
          `
          float gT = position.y;                 // 0 root .. 1 tip
          vT = gT; vTint = aP1.y;
          float bh = aP0.z * uHeight;
          float yaw = aP1.w;
          // Blade lies along local x (width) and grows up y; rotate by yaw.
          float cy = cos(yaw), sy = sin(yaw);
          vec2 wdir = normalize(uWind);
          float gust = sin(uTime * 1.7 + aP0.w + aP0.x * 0.35 + aP0.y * 0.22) * uWindAmp
                     + sin(uTime * 3.1 + aP0.w * 1.7) * uWindAmp * 0.25;
          float bend = (aP1.x + gust) * gT * gT;   // quadratic sweep, root stays put
          vec3 local = vec3(position.x * 0.045 * (0.6 + bh), gT * bh, 0.0);
          // sweep tip along wind direction (in world xz)
          vec3 rotated = vec3(local.x * cy - local.z * sy, local.y, local.x * sy + local.z * cy);
          rotated.xz += wdir * bend * bh * 0.9;
          rotated.y -= abs(bend) * bh * 0.25;
          vec3 transformed = rotated + vec3(aP0.x, aP1.z, aP0.y);
          `,
        )
        // Instance transform is baked above; neutralise instanceMatrix.
        .replace('#include <project_vertex>', `
          vec4 mvPosition = vec4( transformed, 1.0 );
          mvPosition = modelViewMatrix * mvPosition;
          gl_Position = projectionMatrix * mvPosition;`)
        .replace('#include <worldpos_vertex>', `
          #if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
            vec4 worldPosition = vec4( transformed, 1.0 );
            worldPosition = modelMatrix * worldPosition;
          #endif`)
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform vec3 uBase; uniform vec3 uTip; uniform float uSnow; uniform float uDry;
          varying float vT; varying float vTint;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            vec3 base = mix(uBase, uBase * 1.18, vTint * 0.6);
            vec3 tip = mix(uTip, uTip * 0.9, vTint * 0.4);
            vec3 dryC = vec3(0.78, 0.66, 0.36);
            base = mix(base, dryC * 0.75, uDry);
            tip = mix(tip, dryC, uDry);
            base = mix(base, vec3(0.60, 0.65, 0.72), uSnow * 0.86);
            tip  = mix(tip,  vec3(0.90, 0.94, 1.00), uSnow);
            vec3 c = mix(base, tip, smoothstep(0.0, 1.0, vT));
            // root occlusion
            c *= 0.55 + vT * 0.45;
            diffuseColor.rgb *= c;
          }`,
        )
    }
    mat.customProgramCacheKey = () => 'grass-v1'
    return { geo, mat, uniforms }
  }, [total])

  // The instance transform is baked in the shader; identity matrices keep the
  // stock normal / shadow code paths (which read instanceMatrix) well-behaved.
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const id = new THREE.Matrix4()
    for (let i = 0; i < total; i++) mesh.setMatrixAt(i, id)
    mesh.instanceMatrix.needsUpdate = true
  }, [total, geo])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return
    uniforms.uTime.value = sim.time
    uniforms.uBase.value.copy(world.bladeBase)
    uniforms.uTip.value.copy(world.bladeTip)
    uniforms.uHeight.value = world.bladeHeight
    uniforms.uSnow.value = world.snow
    // Wilting soil → dry grass in the clearing's neighbourhood reads as a drought.
    uniforms.uDry.value = THREE.MathUtils.clamp((0.35 - sim.water) * 2.2, 0, 1) * (1 - world.moisture * 0.5)
    uniforms.uWindAmp.value = 0.22 + world.rain * 0.5 + (world.haze > 0.7 ? 0.1 : 0)
    mesh.count = Math.max(0, Math.round(total * world.bladeDensity))
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[geo, mat, total]}
      frustumCulled={false}
      castShadow={false}
      receiveShadow={quality.shadows}
    />
  )
}
