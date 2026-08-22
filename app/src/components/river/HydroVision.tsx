import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import {
  bedH,
  channelW,
  COURSE,
  floodplainW,
  meanderX,
  profileH,
  STATION_BY_ID,
  turbidityNow,
  valleyH,
  velocityAt,
  waterY,
  worldZ,
  type RiverSim,
} from '@/lib/river'

/**
 * Hydro Vision — the one AR toggle. Telemetry (live, ephemeral): the thalweg
 * ribbon coloured by speed, the watershed line on the ridges. Data (recorded,
 * learner-made): the cross-section curtains drawn from the learner's own
 * soundings. Same two-layer rule as Physics Vision.
 */

/* ------------------------------------------------------------------ */
/* Thalweg ribbon — the fastest thread of water, wearing its speed     */
/* ------------------------------------------------------------------ */

const T_ROWS = 110
const T_S0 = 6
const T_DS = (COURSE - 10) / T_ROWS

function ThalwegRibbon({ sim }: { sim: RiverSim }) {
  const geo = useMemo(() => {
    const count = T_ROWS * 2
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    const index: number[] = []
    for (let r = 0; r < T_ROWS - 1; r++) {
      const a0 = r * 2
      index.push(a0, a0 + 3, a0 + 2, a0, a0 + 1, a0 + 3)
    }
    g.setIndex(index)
    return g
  }, [])
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false }),
    [],
  )
  const slow = useMemo(() => new THREE.Color('#4AC4FF'), [])
  const fast = useMemo(() => new THREE.Color('#FF6A4A'), [])
  const c = useMemo(() => new THREE.Color(), [])
  const ref = useRef<THREE.Mesh>(null)

  useFrame(() => {
    if (!ref.current) return
    const on = sim.visionOn && sim.mapT < 0.5
    ref.current.visible = on
    if (!on) return
    const pos = geo.attributes.position as THREE.BufferAttribute
    const col = geo.attributes.color as THREE.BufferAttribute
    for (let r = 0; r < T_ROWS; r++) {
      const s = T_S0 + r * T_DS
      const w = channelW(s)
      // Outside of the bend: curvature of the centreline pushes the thread out.
      const curv = meanderX(s + 1.5, sim.years) - 2 * meanderX(s, sim.years) + meanderX(s - 1.5, sim.years)
      const off = THREE.MathUtils.clamp(-curv * 2.2, -w * 0.32, w * 0.32)
      const x = meanderX(s, sim.years) + off
      const y = waterY(sim, s) + 0.04
      const z = worldZ(s)
      const v = velocityAt(sim, s)
      c.copy(slow).lerp(fast, THREE.MathUtils.clamp((v - 0.25) / 0.9, 0, 1))
      const halfW = 0.06 + Math.min(0.1, v * 0.05)
      pos.setXYZ(r * 2, x - halfW, y, z)
      pos.setXYZ(r * 2 + 1, x + halfW, y, z)
      col.setXYZ(r * 2, c.r, c.g, c.b)
      col.setXYZ(r * 2 + 1, c.r, c.g, c.b)
    }
    pos.needsUpdate = true
    col.needsUpdate = true
    geo.computeBoundingSphere()
  })
  return <mesh ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={3} />
}

/* ------------------------------------------------------------------ */
/* Watershed line — the basin's own border, glowing on the ridge       */
/* ------------------------------------------------------------------ */

function WatershedLine({ sim }: { sim: RiverSim }) {
  const lines = useMemo(() => {
    const mk = (side: 1 | -1) => {
      const pts: THREE.Vector3[] = []
      for (let s = 2; s <= COURSE + 6; s += 2.5) {
        const cx = meanderX(s)
        // Walk outward and keep the highest point in a band beyond the valley.
        let bestX = cx + side * (floodplainW(s) + 7)
        let bestH = -1
        for (let d = floodplainW(s) + 5; d < floodplainW(s) + 20; d += 1.6) {
          const x = cx + side * d
          const h = valleyH(x, worldZ(s))
          if (h > bestH) {
            bestH = h
            bestX = x
          }
        }
        pts.push(new THREE.Vector3(bestX, bestH + 0.15, worldZ(s)))
      }
      return new THREE.BufferGeometry().setFromPoints(pts)
    }
    return [mk(1), mk(-1)]
  }, [])
  const mat = useMemo(() => new THREE.LineBasicMaterial({ color: '#FFD87E', transparent: true, opacity: 0.7 }), [])
  const g = useRef<THREE.Group>(null)
  useFrame(() => {
    if (!g.current) return
    g.current.visible = sim.visionOn && sim.mapT < 0.5
    mat.opacity = 0.5 + Math.sin(sim.time * 1.4) * 0.18
  })
  return (
    <group ref={g}>
      {lines.map((geo, i) => {
        const line = new THREE.Line(geo, mat)
        return <primitive key={i} object={line} />
      })}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Cross-section curtains — the learner's soundings, standing up       */
/* ------------------------------------------------------------------ */

function Curtain({ sim, station, profile }: { sim: RiverSim; station: 'st1' | 'st2' | 'st3'; profile: number[] }) {
  const st = STATION_BY_ID[station]
  const geo = useMemo(() => {
    const w = channelW(st.s)
    const n = profile.length
    const pos: number[] = []
    const index: number[] = []
    const bankY = profileH(st.s)
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1)
      const x = (t - 0.5) * w * 0.92
      pos.push(x, bankY, 0)
      pos.push(x, bankY - profile[i], 0)
    }
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
    g.setIndex(index)
    g.computeVertexNormals()
    return g
  }, [st.s, profile])
  const ref = useRef<THREE.Mesh>(null)
  useFrame(() => {
    if (!ref.current) return
    ref.current.visible = sim.visionOn && sim.mapT < 0.5
    ref.current.position.set(meanderX(st.s, sim.years), 0, worldZ(st.s))
  })
  return (
    <mesh ref={ref} geometry={geo}>
      <meshBasicMaterial color="#7FD4FF" transparent opacity={0.4} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ */
/* Underwater lens — caustics, murk and the bedload going past         */
/* ------------------------------------------------------------------ */

const SED_N = 240

export function UnderwaterLens({ sim }: { sim: RiverSim }) {
  const { scene } = useThree()
  const fog = useMemo(() => new THREE.Fog('#37505C', 0.4, 8), [])
  const prevFog = useRef<THREE.Fog | THREE.FogExp2 | null>(null)
  const active = useRef(false)
  const causticMat = useRef<THREE.MeshBasicMaterial>(null)
  const causticRef = useRef<THREE.Mesh>(null)
  const groupRef = useRef<THREE.Group>(null)
  const sed = useMemo(() => {
    const pos = new Float32Array(SED_N * 3)
    const seed: number[] = []
    for (let i = 0; i < SED_N; i++) seed.push((i * 0.6180339887) % 1, ((i * 0.7548776662) % 1) - 0.5, (i * 0.323) % 1)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return { g, seed }
  }, [])
  const sedMat = useMemo(
    () => new THREE.PointsMaterial({ color: '#C9B08A', size: 2.5, sizeAttenuation: false, transparent: true, opacity: 0.8, depthWrite: false }),
    [],
  )

  useFrame(() => {
    const on = sim.lens === 'under' && sim.mapT < 0.5
    if (on && !active.current) {
      active.current = true
      prevFog.current = scene.fog as THREE.Fog | null
      scene.fog = fog
    }
    if (!on && active.current) {
      active.current = false
      scene.fog = prevFog.current
    }
    if (groupRef.current) groupRef.current.visible = on
    if (!on) return
    const st = STATION_BY_ID[sim.station]
    const turb = turbidityNow(sim)
    fog.color.set('#37505C').lerp(new THREE.Color('#5C4A32'), turb)
    fog.far = THREE.MathUtils.lerp(9, 2.2, turb)
    if (groupRef.current) groupRef.current.position.set(meanderX(st.s, sim.years), 0, worldZ(st.s))
    if (causticRef.current) causticRef.current.position.y = bedH(st.s, sim.years) + 0.03
    if (causticMat.current) causticMat.current.opacity = 0.25 + Math.sin(sim.time * 3.1) * 0.08
    // Sediment: suspension drifts by, bedload hops along the bottom.
    const pos = sed.g.attributes.position as THREE.BufferAttribute
    const v = velocityAt(sim, st.s)
    const bed = bedH(st.s, sim.years)
    const top = waterY(sim, st.s)
    for (let i = 0; i < SED_N; i++) {
      const a = sed.seed[i * 3]
      const b = sed.seed[i * 3 + 1]
      const cph = sed.seed[i * 3 + 2]
      const along = ((a + sim.time * v * 0.22) % 1) * 14 - 7
      const isBed = i % 3 === 0
      const y = isBed ? bed + 0.05 + Math.abs(Math.sin(sim.time * 4 + cph * 9)) * 0.12 * Math.min(1, v) : bed + 0.2 + ((b + 0.5) % 1) * Math.max(0.2, top - bed - 0.25)
      pos.setXYZ(i, b * channelW(st.s) * 0.8, y, along)
    }
    pos.needsUpdate = true
  })

  return (
    <group ref={groupRef} visible={false}>
      {/* caustic shimmer on the bed */}
      <mesh ref={causticRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <planeGeometry args={[8, 14]} />
        <meshBasicMaterial ref={causticMat} color="#BFE8F5" transparent opacity={0.25} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <points geometry={sed.g} material={sedMat} frustumCulled={false} />
    </group>
  )
}

/* ------------------------------------------------------------------ */

export default function HydroVision({ sim, sections }: { sim: RiverSim; sections: Partial<Record<'st1' | 'st2' | 'st3', number[]>> }) {
  return (
    <group>
      <ThalwegRibbon sim={sim} />
      <WatershedLine sim={sim} />
      {(Object.keys(sections) as Array<'st1' | 'st2' | 'st3'>).map((id) =>
        sections[id] ? <Curtain key={id} sim={sim} station={id} profile={sections[id]!} /> : null,
      )}
      <UnderwaterLens sim={sim} />
    </group>
  )
}
