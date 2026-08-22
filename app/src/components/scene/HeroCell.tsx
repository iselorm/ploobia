import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { SimState } from '@/lib/sim'
import { VESSEL_RADIUS, heartbeat } from '@/lib/sim'
import { getJourney, oxygenationAt, radiusAtDist, beatsPerSecond } from '@/lib/journey'
import GlyphInstances, { hideGlyph, writeGlyph } from '@/components/photo/Glyphs'

/**
 * Scarlet — YOUR red blood cell. One hero cell rides just ahead of the camera
 * for the whole journey, wearing four haemoglobin sites. In the lungs four
 * self-labelled O₂ molecules fly in through the wall and click on, one per
 * site; at the tissue they fly off to the waiting body cells and CO₂ hitches
 * a ride home instead. The crowd shows the trend — the hero shows the
 * mechanism.
 */

const CELL_SCALE = 1.3
/** Where the hero rides relative to the camera. */
const HERO_AHEAD = 9
const HERO_ANGLE = -2.28 // lower-left of the view
const HERO_ORBIT = 1.85

/** Local positions of the four haemoglobin sites on the cell rim. */
const SITE_LOCAL = [
  new THREE.Vector3(0.78, 0.2, 0.3),
  new THREE.Vector3(-0.72, 0.34, 0.3),
  new THREE.Vector3(0.3, -0.78, 0.32),
  new THREE.Vector3(-0.28, 0.8, -0.26),
]

const O2_COLOR = '#7EC8EE'
const O2_LABEL = '#14567D'
const C_COLOR = '#6C7480'
const CO2_O_COLOR = '#E14B3C'
const C_LABEL = '#2B3038'
const CO2_O_LABEL = '#7A1E14'

const OXY = new THREE.Color('#E23A31')
const DEOXY = new THREE.Color('#7E2730')

function biconcave(): THREE.LatheGeometry {
  const half = (rho: number) =>
    (Math.sqrt(Math.max(0, 1 - rho * rho)) *
      (0.81 + 7.83 * rho * rho - 4.39 * rho * rho * rho * rho)) /
    (3.91 * 2)
  const SEG = 14
  const pts: THREE.Vector2[] = []
  for (let i = 0; i <= SEG; i++) pts.push(new THREE.Vector2(i / SEG, half(i / SEG)))
  for (let i = SEG; i >= 0; i--) pts.push(new THREE.Vector2(Math.max(i / SEG, 1e-4), -half(i / SEG)))
  const geo = new THREE.LatheGeometry(pts, 28)
  geo.computeVertexNormals()
  return geo
}

export default function HeroCell({ sim }: { sim: SimState }) {
  const { camera } = useThree()
  const cellRef = useRef<THREE.Mesh>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const sitesRef = useRef<THREE.InstancedMesh>(null)
  const o2Ref = useRef<THREE.InstancedMesh>(null)
  const o2LabelRef = useRef<THREE.InstancedMesh>(null)
  const co2CoreRef = useRef<THREE.InstancedMesh>(null)
  const co2SatRef = useRef<THREE.InstancedMesh>(null)
  const cLabelRef = useRef<THREE.InstancedMesh>(null)
  const co2OLabelRef = useRef<THREE.InstancedMesh>(null)

  const cellGeo = useMemo(() => biconcave(), [])
  const cellMat = useMemo(
    () =>
      new THREE.MeshLambertMaterial({
        color: OXY.clone(),
        emissive: new THREE.Color('#3A0A0C'),
        emissiveIntensity: 0.35,
      }),
    [],
  )

  // Per-slot animation progress: 1 = docked on its haemoglobin site.
  const anim = useMemo(
    () => ({
      o2: new Float32Array(4),
      co2: Float32Array.from([1, 1, 1, 1]),
      cellPos: new THREE.Vector3(),
      cellQuat: new THREE.Quaternion(),
      scratch: new THREE.Vector3(),
      site: new THREE.Vector3(),
      dock: new THREE.Vector3(),
      free: new THREE.Vector3(),
      dummy: new THREE.Object3D(),
      axis: new THREE.Vector3(0, 1, 0),
    }),
    [],
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.25)
    const j = getJourney()
    const { dummy, cellPos, cellQuat, scratch, site, dock, free } = anim

    // --- place the hero just ahead of the camera, hugging the local bore
    const z = sim.camZ - HERO_AHEAD
    const localR = radiusAtDist(-z, VESSEL_RADIUS)
    const r = Math.min(HERO_ORBIT, Math.max(0.55, localR - 1.6))
    cellPos.set(Math.cos(HERO_ANGLE) * r, Math.sin(HERO_ANGLE) * r, z)
    sim.heroPos.copy(cellPos)

    const cell = cellRef.current
    if (cell) {
      cell.position.copy(cellPos)
      // slow, steady roll so the sites stay easy to watch
      cell.rotation.set(Math.sin(sim.time * 0.4) * 0.35 + 1.15, sim.time * 0.22, 0)
      cellQuat.copy(cell.quaternion)
      const beat = heartbeat(sim.time, beatsPerSecond(sim))
      const squeeze = Math.min(1, Math.max(0, (localR - 2.2) / 6.8))
      cell.scale.setScalar(CELL_SCALE * (1 + beat * 0.03) * (0.82 + 0.18 * squeeze))
      // the hero's own colour follows its oxygen load
      const oxy = oxygenationAt(-z)
      ;(cell.material as THREE.MeshLambertMaterial).color.copy(DEOXY).lerp(OXY, oxy)
    }

    const ring = ringRef.current
    if (ring) {
      ring.position.copy(cellPos)
      ring.quaternion.copy(camera.quaternion)
      const pulse = 1 + Math.sin(sim.time * 2.4) * 0.06
      ring.scale.setScalar(CELL_SCALE * 1.55 * pulse)
    }

    // --- four haemoglobin sites, riding on the (rotating) cell
    const sites = sitesRef.current
    for (let i = 0; i < 4; i++) {
      site.copy(SITE_LOCAL[i]).multiplyScalar(CELL_SCALE).applyQuaternion(cellQuat).add(cellPos)
      // dock point sits proud of the site sphere so the O₂ is never swallowed
      dock.copy(SITE_LOCAL[i]).multiplyScalar(CELL_SCALE * 1.55).applyQuaternion(cellQuat).add(cellPos)
      if (sites) {
        dummy.position.copy(site)
        dummy.quaternion.copy(cellQuat)
        dummy.scale.setScalar(0.34 * CELL_SCALE)
        dummy.updateMatrix()
        sites.setMatrixAt(i, dummy.matrix)
      }

      // --- O₂ on this site: dock/undock along a radial path through the wall
      const o2Occupied = i < j.o2
      const target = o2Occupied ? 1 : 0
      anim.o2[i] += (target - anim.o2[i]) * Math.min(1, dt * 1.4)
      const p = anim.o2[i]
      const o2 = o2Ref.current
      const o2Label = o2LabelRef.current
      if (o2 && o2Label) {
        if (p > 0.02) {
          // free end of the path: out past the wall, at this site's own angle
          const ang = HERO_ANGLE + (i - 1.5) * 0.55
          const wallR = localR + 2.2
          free.set(Math.cos(ang) * wallR, Math.sin(ang) * wallR, z + (i - 1.5) * 1.6)
          scratch.copy(free).lerp(dock, p)
          const s = 0.62 * (0.4 + 0.6 * Math.min(1, p * 3))
          for (let a = 0; a < 2; a++) {
            const off = (a === 0 ? -1 : 1) * 0.19 * s
            dummy.position.set(scratch.x + off, scratch.y + off * 0.4, scratch.z)
            dummy.quaternion.copy(camera.quaternion)
            dummy.scale.setScalar(s * 0.42)
            dummy.updateMatrix()
            o2.setMatrixAt(i * 2 + a, dummy.matrix)
            writeGlyph(o2Label, i * 2 + a, dummy, camera, dummy.position, 2.1 * s, 0.34)
          }
        } else {
          for (let a = 0; a < 2; a++) {
            hideGlyph(o2, i * 2 + a, dummy)
            hideGlyph(o2Label, i * 2 + a, dummy)
          }
        }
      }

      // --- CO₂: rides shallow plasma orbits near the cell, not on the sites
      const co2Occupied = i < j.co2
      const co2Target = co2Occupied ? 1 : 0
      anim.co2[i] += (co2Target - anim.co2[i]) * Math.min(1, dt * 1.4)
      const q = anim.co2[i]
      const core = co2CoreRef.current
      const sat = co2SatRef.current
      const cLab = cLabelRef.current
      const oLab = co2OLabelRef.current
      if (core && sat && cLab && oLab) {
        if (q > 0.02) {
          const orbA = sim.time * 0.7 + i * 1.9
          scratch.set(
            cellPos.x + Math.cos(orbA) * 1.9 * CELL_SCALE,
            cellPos.y + Math.sin(orbA * 0.8) * 1.2 * CELL_SCALE,
            cellPos.z + Math.sin(orbA) * 1.3,
          )
          // when unbound, drift out toward the wall (lungs: breathed away)
          const ang = HERO_ANGLE + (i - 1.5) * 0.7 + 0.9
          const wallR = localR + 2.4
          free.set(Math.cos(ang) * wallR, Math.sin(ang) * wallR, z + (i - 1.5) * 2.1)
          const pos = free.lerp(scratch, q)
          const s = 0.5 * (0.4 + 0.6 * Math.min(1, q * 3))
          dummy.position.copy(pos)
          dummy.quaternion.copy(camera.quaternion)
          dummy.scale.setScalar(s * 0.3)
          dummy.updateMatrix()
          core.setMatrixAt(i, dummy.matrix)
          writeGlyph(cLab, i, dummy, camera, pos, 2.0 * s, 0.3)
          for (let a = 0; a < 2; a++) {
            const off = (a === 0 ? -1 : 1) * 0.24 * s
            dummy.position.set(pos.x + off, pos.y + off * 0.3, pos.z)
            dummy.scale.setScalar(s * 0.22)
            dummy.updateMatrix()
            sat.setMatrixAt(i * 2 + a, dummy.matrix)
            writeGlyph(oLab, i * 2 + a, dummy, camera, dummy.position, 1.5 * s, 0.24)
          }
        } else {
          hideGlyph(core, i, dummy)
          hideGlyph(cLab, i, dummy)
          for (let a = 0; a < 2; a++) {
            hideGlyph(sat, i * 2 + a, dummy)
            hideGlyph(oLab, i * 2 + a, dummy)
          }
        }
      }
    }

    for (const m of [sitesRef, o2Ref, o2LabelRef, co2CoreRef, co2SatRef, cLabelRef, co2OLabelRef]) {
      if (m.current) m.current.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <group>
      <mesh ref={cellRef} geometry={cellGeo} material={cellMat} />
      {/* soft halo ring so the learner never loses their own cell */}
      <mesh ref={ringRef} renderOrder={2}>
        <ringGeometry args={[0.98, 1.06, 48]} />
        <meshBasicMaterial color="#FFD9A0" transparent opacity={0.32} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {/* four haemoglobin sites */}
      <instancedMesh ref={sitesRef} args={[undefined, undefined, 4]} frustumCulled={false}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshLambertMaterial color="#5E1218" emissive="#2A0507" emissiveIntensity={0.4} />
      </instancedMesh>
      {/* O₂ cargo (two atoms each) */}
      <instancedMesh ref={o2Ref} args={[undefined, undefined, 8]} frustumCulled={false}>
        <sphereGeometry args={[1, 14, 12]} />
        <meshStandardMaterial color={O2_COLOR} emissive="#5FB6E8" emissiveIntensity={0.75} roughness={0.15} transparent opacity={0.95} />
      </instancedMesh>
      <GlyphInstances ref={o2LabelRef} text="O" color={O2_LABEL} count={8} size={0.17} />
      {/* CO₂ cargo (C core + two O satellites each) */}
      <instancedMesh ref={co2CoreRef} args={[undefined, undefined, 4]} frustumCulled={false}>
        <sphereGeometry args={[1, 14, 12]} />
        <meshStandardMaterial color={C_COLOR} emissive="#4A5058" emissiveIntensity={0.6} roughness={0.4} />
      </instancedMesh>
      <instancedMesh ref={co2SatRef} args={[undefined, undefined, 8]} frustumCulled={false}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color={CO2_O_COLOR} emissive="#B22A1C" emissiveIntensity={0.5} roughness={0.4} />
      </instancedMesh>
      <GlyphInstances ref={cLabelRef} text="C" color={C_LABEL} count={4} size={0.16} />
      <GlyphInstances ref={co2OLabelRef} text="O" color={CO2_O_LABEL} count={8} size={0.13} />
    </group>
  )
}
