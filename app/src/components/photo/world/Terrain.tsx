import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import type { WorldState } from '@/lib/world'
import { CLEARING, GROUND_Y, landH } from '@/lib/world'
import { useQualityCaps } from '@/lib/quality'

/* ------------------------------------------------------------------ */
/* Polar heightfield: dense near the clearing, sparse at the horizon    */
/* ------------------------------------------------------------------ */

function buildTerrain(angular: number, radial: number, r0: number, r1: number) {
  const verts = (radial + 1) * angular
  const positions = new Float32Array(verts * 3)
  const normals = new Float32Array(verts * 3)
  // slope (0 flat .. 1 steep), moisture (0 dry .. 1 wet), distance 0..1
  const params = new Float32Array(verts * 3)
  const index: number[] = []

  let v = 0
  for (let r = 0; r <= radial; r++) {
    const t = r / radial
    const rad = r0 + (r1 - r0) * Math.pow(t, 2.4)
    for (let a = 0; a < angular; a++) {
      const th = (a / angular) * Math.PI * 2
      const x = Math.cos(th) * rad
      const z = Math.sin(th) * rad
      const h = landH(x, z)
      positions[v * 3] = x
      positions[v * 3 + 1] = GROUND_Y + h
      positions[v * 3 + 2] = z
      // Analytic-ish normal by central differences on the height function.
      const e = 0.35 + t * 1.5
      const hx = landH(x + e, z) - landH(x - e, z)
      const hz = landH(x, z + e) - landH(x, z - e)
      const n = new THREE.Vector3(-hx, 2 * e, -hz).normalize()
      normals[v * 3] = n.x
      normals[v * 3 + 1] = n.y
      normals[v * 3 + 2] = n.z
      const slope = 1 - n.y
      // Low ground is wetter; add a slow noise so colour does not band.
      const moist = THREE.MathUtils.smoothstep(-h, -3, 4)
      params[v * 3] = slope
      params[v * 3 + 1] = moist
      params[v * 3 + 2] = t
      v++
    }
  }
  for (let r = 0; r < radial; r++) {
    for (let a = 0; a < angular; a++) {
      const a0 = r * angular + a
      const a1 = r * angular + ((a + 1) % angular)
      const b0 = (r + 1) * angular + a
      const b1 = (r + 1) * angular + ((a + 1) % angular)
      // Winding chosen so the top face points +y (checked by orbiting below once).
      index.push(a0, b1, b0, a0, a1, b1)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geo.setAttribute('aParams', new THREE.BufferAttribute(params, 3))
  geo.setIndex(index)
  return geo
}

/**
 * Terrain material: colour by slope and moisture from three biome colours
 * (uniforms, so a biome change is free), lit by the sun + hemisphere, fogged.
 * Built on MeshStandardMaterial via onBeforeCompile so it keeps shadows,
 * environment lighting and tone mapping.
 */
function makeTerrainMaterial() {
  const uniforms = {
    uGrass: { value: new THREE.Color('#6FAE5A') },
    uRock: { value: new THREE.Color('#8B8A78') },
    uSand: { value: new THREE.Color('#B7A97D') },
    uMoisture: { value: 0.6 },
    uSnow: { value: 0 },
    uWet: { value: 0 },
  }
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, metalness: 0 })
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec3 aParams;
        varying vec3 vParams;
        varying vec3 vWPos;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vParams = aParams;
        vWPos = (modelMatrix * vec4(position, 1.0)).xyz;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uGrass; uniform vec3 uRock; uniform vec3 uSand;
        uniform float uMoisture; uniform float uSnow; uniform float uWet;
        varying vec3 vParams; varying vec3 vWPos;
        float hashT(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noiseT(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(hashT(i), hashT(i+vec2(1,0)), f.x), mix(hashT(i+vec2(0,1)), hashT(i+vec2(1,1)), f.x), f.y); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float slope = vParams.x;
          float moist = clamp(0.35 + vParams.y * 0.35 + (uMoisture - 0.5) * 1.1, 0.0, 1.0);
          float grain = noiseT(vWPos.xz * 0.35) * 0.5 + noiseT(vWPos.xz * 1.7) * 0.5;
          vec3 c = mix(uGrass, uSand, clamp(0.9 - moist * 1.3 + grain * 0.3, 0.0, 1.0));
          c = mix(c, uRock, clamp(slope * 3.4 - 0.15 + grain * 0.2, 0.0, 1.0));
          // very low frequency tint so it never bands
          c *= 0.92 + noiseT(vWPos.xz * 0.06) * 0.16;
          // settled snow lies on flatter ground first
          float snowMask = clamp(uSnow * (1.15 - slope * 3.0) , 0.0, 1.0);
          c = mix(c, vec3(0.93, 0.95, 0.97), snowMask);
          diffuseColor.rgb *= c;
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.55, uWet * clamp(vParams.y, 0.0, 1.0));`,
      )
  }
  mat.customProgramCacheKey = () => 'terrain-v1'
  return { mat, uniforms }
}

export default function Terrain({ world }: { world: WorldState }) {
  const quality = useQualityCaps()
  const geo = useMemo(() => {
    const angular = quality.particleScale >= 1 ? 360 : quality.particleScale >= 0.7 ? 240 : 160
    const radial = quality.particleScale >= 1 ? 44 : 32
    return buildTerrain(angular, radial, 1.5, 150)
  }, [quality.particleScale])
  const { mat, uniforms } = useMemo(makeTerrainMaterial, [])
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame(() => {
    uniforms.uGrass.value.copy(world.grass)
    uniforms.uRock.value.copy(world.rock)
    uniforms.uSand.value.copy(world.sand)
    uniforms.uMoisture.value = world.moisture
    uniforms.uSnow.value = world.snow
    uniforms.uWet.value = world.rain
  })

  return (
    <>
      <mesh ref={meshRef} geometry={geo} material={mat} receiveShadow frustumCulled={false} />
      {/* The clearing floor: flat, receives the apparatus and its contact shadows. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_Y + 0.004, 0]} receiveShadow>
        <circleGeometry args={[CLEARING * 0.72, 48]} />
        <ClearingMaterial world={world} />
      </mesh>
    </>
  )
}

/** Same palette as the terrain, slightly worn (this is where the bench stands). */
function ClearingMaterial({ world }: { world: WorldState }) {
  const ref = useRef<THREE.MeshStandardMaterial>(null)
  const scratch = useMemo(() => new THREE.Color(), [])
  useFrame(() => {
    if (!ref.current) return
    scratch.copy(world.grass).lerp(world.sand, 0.55 - world.moisture * 0.25).multiplyScalar(0.96)
    if (world.snow > 0) scratch.lerp(new THREE.Color('#EEF2F5'), world.snow * 0.85)
    ref.current.color.lerp(scratch, 0.2)
  })
  return <meshStandardMaterial ref={ref} color="#9BB27A" roughness={0.98} />
}
