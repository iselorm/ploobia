import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useQualityCaps } from '@/lib/quality'
import {
  bedH,
  channelW,
  COURSE,
  DELTA0,
  GORGE0,
  GORGE1,
  meanderX,
  TRIBUTARIES,
  tribPoint,
  valleyH,
  VILLAGE_S,
  worldZ,
  type RiverSim,
} from '@/lib/river'

/**
 * Scene detail — the things that make an orbit worth doing: boulders on the
 * gorge bed, scree on its walls, bank rocks along the whole course, reeds on
 * the floodplain and the delta. All instanced, all deterministic (a fixed
 * seed), all placed from the same terrain function everything else reads.
 */

function rng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x9e3779b9) | 0
    let t = Math.imul(a ^ (a >>> 16), 0x21f0aaad)
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97)
    return ((t ^ (t >>> 15)) >>> 0) / 4294967296
  }
}

interface Placed {
  x: number
  y: number
  z: number
  s: number
  rx: number
  ry: number
}

export default function Detail({ sim }: { sim: RiverSim }) {
  const quality = useQualityCaps()
  const k = quality.particleScale >= 1 ? 1 : quality.particleScale >= 0.7 ? 0.7 : 0.45

  /* ---- boulders in the gorge, and cobbles along the whole bed ---- */
  const boulders = useMemo(() => {
    const rand = rng(70021)
    const out: Placed[] = []
    const n = Math.round(110 * k)
    for (let i = 0; i < n; i++) {
      // Two thirds in the gorge (where the river is still breaking rock apart).
      const inGorge = i % 3 !== 0
      const s = inGorge ? GORGE0 + rand() * (GORGE1 - GORGE0) : 6 + rand() * (DELTA0 - 10)
      const w = channelW(s)
      const off = (rand() - 0.5) * (w + 2.6)
      const x = meanderX(s, 0) + off
      const z = worldZ(s)
      const y = bedH(s, 0) + 0.05
      const big = inGorge ? 0.35 + rand() * 0.75 : 0.16 + rand() * 0.3
      out.push({ x, y, z, s: big, rx: rand() * 3.14, ry: rand() * 6.28 })
    }
    return out
  }, [k])

  /* ---- scree fans on the gorge walls and crag faces ---- */
  const scree = useMemo(() => {
    const rand = rng(31337)
    const out: Placed[] = []
    const n = Math.round(140 * k)
    for (let i = 0; i < n; i++) {
      const s = GORGE0 - 4 + rand() * (GORGE1 - GORGE0 + 10)
      const side = rand() < 0.5 ? -1 : 1
      const d = channelW(s) * 0.5 + 1.2 + rand() * 7
      const x = meanderX(s, 0) + side * d
      const z = worldZ(s) + (rand() - 0.5) * 2.4
      out.push({ x, y: valleyH(x, z, 0) + 0.08, z, s: 0.2 + rand() * 0.5, rx: rand() * 3.14, ry: rand() * 6.28 })
    }
    return out
  }, [k])

  /* ---- reeds/scrub on the floodplain, the tributary mouths and the delta ---- */
  const reeds = useMemo(() => {
    const rand = rng(9182)
    const out: Placed[] = []
    const n = Math.round(170 * k)
    const tp = { x: 0, z: 0 }
    for (let i = 0; i < n; i++) {
      let x: number
      let z: number
      const pick = rand()
      if (pick < 0.25) {
        // along a tributary
        const tb = TRIBUTARIES[Math.floor(rand() * TRIBUTARIES.length)]
        tribPoint(tb, 0.25 + rand() * 0.7, tp)
        x = tp.x + (rand() - 0.5) * 3.4
        z = tp.z + (rand() - 0.5) * 3.4
      } else if (pick < 0.6) {
        // the delta and its distributary margins
        const t = rand()
        x = meanderX(DELTA0, 0) + (rand() - 0.5) * (10 + t * 40)
        z = worldZ(DELTA0 + t * (COURSE - DELTA0))
      } else {
        const s = 70 + rand() * (DELTA0 - 72)
        x = meanderX(s, 0) + (rand() < 0.5 ? -1 : 1) * (channelW(s) * 0.5 + 0.6 + rand() * 5)
        z = worldZ(s)
      }
      out.push({ x, y: valleyH(x, z, 0), z, s: 0.5 + rand() * 0.9, rx: 0, ry: rand() * 6.28 })
    }
    return out
  }, [k])

  /* ---- jetties and boats at the village, so the place looks lived in ---- */
  const boats = useMemo(
    () =>
      VILLAGE_S.filter((_, i) => i % 3 === 0).map((s, i) => {
        const side = i % 2 ? 1 : -1
        const x = meanderX(s, 0) + side * (channelW(s) * 0.5 - 0.25)
        return { x, y: bedH(s, 0) + 0.42, z: worldZ(s), s: 1, rx: 0, ry: side * 0.25 }
      }),
    [],
  )

  const rockRef = useRef<THREE.InstancedMesh>(null)
  const screeRef = useRef<THREE.InstancedMesh>(null)
  const reedRef = useRef<THREE.InstancedMesh>(null)
  const group = useRef<THREE.Group>(null)
  const m4 = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const e = useMemo(() => new THREE.Euler(), [])
  const vp = useMemo(() => new THREE.Vector3(), [])
  const vs = useMemo(() => new THREE.Vector3(), [])
  const laid = useRef(false)

  useFrame(() => {
    if (group.current) group.current.visible = sim.mapT < 0.55
    if (laid.current) return
    const write = (mesh: THREE.InstancedMesh | null, list: Placed[], yLift = 0) => {
      if (!mesh) return
      list.forEach((p, i) => {
        vp.set(p.x, p.y + yLift, p.z)
        vs.setScalar(p.s)
        e.set(p.rx, p.ry, 0)
        q.setFromEuler(e)
        m4.compose(vp, q, vs)
        mesh.setMatrixAt(i, m4)
      })
      mesh.instanceMatrix.needsUpdate = true
      mesh.count = list.length
    }
    write(rockRef.current, boulders)
    write(screeRef.current, scree)
    write(reedRef.current, reeds, 0.18)
    laid.current = true
  })

  return (
    <group ref={group}>
      <instancedMesh ref={rockRef} args={[undefined, undefined, Math.max(1, boulders.length)]} frustumCulled={false} castShadow={false}>
        <dodecahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial color="#8E8C82" roughness={0.95} flatShading />
      </instancedMesh>
      <instancedMesh ref={screeRef} args={[undefined, undefined, Math.max(1, scree.length)]} frustumCulled={false}>
        <tetrahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial color="#9A9084" roughness={1} flatShading />
      </instancedMesh>
      <instancedMesh ref={reedRef} args={[undefined, undefined, Math.max(1, reeds.length)]} frustumCulled={false}>
        <coneGeometry args={[0.16, 0.72, 4]} />
        <meshStandardMaterial color="#6E8F4A" roughness={0.9} flatShading />
      </instancedMesh>
      {boats.map((b, i) => (
        <group key={i} position={[b.x, b.y, b.z]} rotation={[0, b.ry, 0]}>
          <mesh>
            <boxGeometry args={[0.28, 0.12, 0.92]} />
            <meshStandardMaterial color="#8A5A3E" roughness={0.85} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
