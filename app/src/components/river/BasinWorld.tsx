import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { WorldState } from '@/lib/world'
import type { PhotoSim } from '@/lib/photo'
import Atmosphere from '@/components/photo/world/Atmosphere'
import Weather from '@/components/photo/world/Weather'
import ValleyTerrain from './ValleyTerrain'
import {
  BASIN_PRESETS,
  floodplainW,
  meanderX,
  valleyH,
  worldZ,
  type BasinId,
  type RiverSim,
} from '@/lib/river'

/**
 * The basin dial is the gravity dial's sibling: one control retunes the whole
 * world. Each basin is a full interpolated lighting state; night and the
 * storm are multipliers on daylight, and the lightning is its own light.
 */

/* ------------------------------------------------------------------ */
/* Trees — instanced, restyled per basin                               */
/* ------------------------------------------------------------------ */

const TREE_MAX = 300

function mulberry(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface TreeStyle {
  trunkH: number
  trunkR: number
  crownR: number
  crownY: number
  crownSquash: number
  trunk: string
  crown: string
}
const TREE_STYLES: Record<BasinId, TreeStyle> = {
  temperate: { trunkH: 0.55, trunkR: 0.05, crownR: 0.5, crownY: 0.75, crownSquash: 1, trunk: '#6B4E32', crown: '#4E8B3F' },
  savanna: { trunkH: 0.95, trunkR: 0.16, crownR: 0.55, crownY: 1.15, crownSquash: 0.45, trunk: '#8A6A48', crown: '#7A8A4A' },
  monsoon: { trunkH: 1.05, trunkR: 0.045, crownR: 0.5, crownY: 1.15, crownSquash: 0.4, trunk: '#7A6A4A', crown: '#3E8A4E' },
  wadi: { trunkH: 0.12, trunkR: 0.04, crownR: 0.26, crownY: 0.25, crownSquash: 0.8, trunk: '#8A7A55', crown: '#8A8A5A' },
}

function Trees({ sim }: { sim: RiverSim }) {
  const trunkRef = useRef<THREE.InstancedMesh>(null)
  const crownRef = useRef<THREE.InstancedMesh>(null)
  const built = useRef<BasinId | null>(null)
  const trunkCol = useMemo(() => new THREE.Color('#6B4E32'), [])
  const crownCol = useMemo(() => new THREE.Color('#4E8B3F'), [])
  const m4 = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const vPos = useMemo(() => new THREE.Vector3(), [])
  const vScale = useMemo(() => new THREE.Vector3(), [])

  // Candidate spots, fixed for the session (deterministic — verify-friendly).
  const spots = useMemo(() => {
    const rand = mulberry(20260821)
    const out: Array<{ x: number; z: number; k: number }> = []
    let guard = 0
    while (out.length < TREE_MAX && guard++ < 4000) {
      const x = (rand() - 0.5) * 150
      const z = (rand() - 0.5) * 150 + 4
      const s = THREE.MathUtils.clamp(z + 58, 0, 120)
      const lat = Math.abs(x - meanderX(s))
      if (lat < floodplainW(s) + 2.2) continue
      if (Math.hypot(x, z) > 85) continue
      out.push({ x, z, k: 0.6 + rand() * 0.8 })
    }
    return out
  }, [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const style = TREE_STYLES[sim.basin]
    if (built.current !== sim.basin && trunkRef.current && crownRef.current) {
      built.current = sim.basin
      const density = BASIN_PRESETS[sim.basin].treeDensity
      const n = Math.floor(TREE_MAX * density)
      for (let i = 0; i < TREE_MAX; i++) {
        const sp = spots[i]
        const on = i < n
        const y = valleyH(sp.x, sp.z)
        const k = sp.k * (on ? 1 : 0.0001)
        vPos.set(sp.x, y + (style.trunkH * k) / 2, sp.z)
        vScale.set(k, k, k)
        m4.compose(vPos, q, vScale)
        trunkRef.current.setMatrixAt(i, m4)
        vPos.set(sp.x, y + style.crownY * k, sp.z)
        vScale.set(k, k * style.crownSquash, k)
        m4.compose(vPos, q, vScale)
        crownRef.current.setMatrixAt(i, m4)
      }
      trunkRef.current.instanceMatrix.needsUpdate = true
      crownRef.current.instanceMatrix.needsUpdate = true
    }
    const kk = 1 - Math.exp(-dt * 2.2)
    trunkCol.lerp(new THREE.Color(style.trunk), kk)
    crownCol.lerp(new THREE.Color(style.crown), kk)
    if (trunkRef.current) (trunkRef.current.material as THREE.MeshStandardMaterial).color.copy(trunkCol)
    if (crownRef.current) (crownRef.current.material as THREE.MeshStandardMaterial).color.copy(crownCol)
    const vis = sim.mapT < 0.55
    if (trunkRef.current) trunkRef.current.visible = vis
    if (crownRef.current) crownRef.current.visible = vis
  })

  const style = TREE_STYLES.temperate
  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, TREE_MAX]} frustumCulled={false}>
        <cylinderGeometry args={[style.trunkR * 0.8, style.trunkR, style.trunkH, 5]} />
        <meshStandardMaterial color="#6B4E32" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={crownRef} args={[undefined, undefined, TREE_MAX]} frustumCulled={false}>
        <icosahedronGeometry args={[0.5, 1]} />
        <meshStandardMaterial color="#4E8B3F" roughness={0.85} flatShading />
      </instancedMesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* The world                                                           */
/* ------------------------------------------------------------------ */

export default function BasinWorld({ sim, world }: { sim: RiverSim; world: WorldState }) {
  const shim = useMemo(() => ({ time: 0, water: 0.6, light: 0.85, paused: false }) as unknown as PhotoSim, [])
  const preset = useRef({ ...BASIN_PRESETS.temperate })
  const boltRef = useRef<THREE.PointLight>(null)
  const { camera, gl } = useThree()
  const exposure = useRef(1)

  useEffect(() => {
    return () => {
      gl.toneMappingExposure = 1
    }
  }, [gl])

  // Expose the world for the verify suite (daylight, rain, stars).
  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__riverWorld = world
  }, [world])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const base = BASIN_PRESETS[sim.basin]
    // Storm rain: in the wadi it falls on the headwaters only — stand at the
    // village and the sky above you stays dry while the river rises.
    let rainHere = sim.rainNow
    if (base.stormUpstream) {
      const upness = 1 - THREE.MathUtils.smoothstep(camera.position.z, worldZ(38), worldZ(58))
      rainHere *= upness
    }
    Object.assign(preset.current, base)
    preset.current.rain = Math.max(base.rain, rainHere)
    const light = base.light * (sim.night ? 0.05 : 1) * (1 - sim.rainNow * 0.55)
    const k = 1 - Math.exp(-dt * 2.2)
    world.step(preset.current, light, k)
    const s = shim as unknown as { time: number; light: number; paused: boolean }
    s.time = sim.time
    s.light += (light - s.light) * k
    s.paused = sim.paused

    // True night: the dusk floor in WorldState is deliberate for the garden,
    // so the basin darkens the exposure instead — and lightning cuts through.
    const wantExp = sim.night ? 0.34 + sim.lightning * 0.9 : 1
    exposure.current += (wantExp - exposure.current) * Math.min(1, k * 2)
    gl.toneMappingExposure = sim.night ? Math.max(exposure.current, 0.34 + sim.lightning * 0.9) : exposure.current

    // Lightning is its own light.
    if (boltRef.current) {
      boltRef.current.intensity = sim.lightning * 60
      boltRef.current.position.set(meanderX(70) + 6, valleyH(6, worldZ(70)) + 16, worldZ(70))
    }
  })

  return (
    <group>
      <Atmosphere sim={shim} world={world} />
      <ValleyTerrain sim={sim} world={world} />
      <Weather sim={shim} world={world} />
      <Trees sim={sim} />
      <pointLight ref={boltRef} intensity={0} color="#EAF2FF" distance={90} decay={1.6} />
    </group>
  )
}
