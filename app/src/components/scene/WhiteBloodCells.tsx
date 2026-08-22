import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import type { SimState, Highlight } from '@/lib/sim'
import { FIELD_LENGTH, VESSEL_RADIUS, WBC_COUNT, heartbeat } from '@/lib/sim'
import { radiusAtDist, beatsPerSecond } from '@/lib/journey'
import { WBC_KINDS, WBC_ROSTER, type CellType } from '@/lib/facts'

interface Props {
  sim: SimState
  highlighted: Highlight | null
  onCellClick: (type: CellType, id: number) => void
}

/**
 * Rare, large, cream-colored white blood cells drifting lazily through the
 * stream. Slower than the red cells so they loom impressively past the camera.
 */
export default function WhiteBloodCells({ sim, highlighted, onCellClick }: Props) {
  const meshRefs = useRef<(THREE.Mesh | null)[]>([])

  // One lumpy sphere geometry, reused by all 5 cells (rotation/scale differ).
  const geometry = useMemo(() => {
    const g = new THREE.SphereGeometry(2.35, 40, 28)
    const pos = g.attributes.position as THREE.BufferAttribute
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      const n =
        Math.sin(v.x * 1.4 + 2.1) * Math.cos(v.y * 1.6 + 0.7) * 0.14 +
        Math.sin(v.z * 2.2 + v.x) * 0.08
      v.multiplyScalar(1 + n)
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    g.computeVertexNormals()
    return g
  }, [])

  const materials = useMemo(
    () =>
      Array.from(
        { length: WBC_COUNT },
        (_, i) =>
          new THREE.MeshLambertMaterial({
            color: new THREE.Color(WBC_KINDS[WBC_ROSTER[i]].color),
            emissive: new THREE.Color('#E8A33D'),
            emissiveIntensity: 0,
          }),
      ),
    [],
  )

  const data = useMemo(
    () =>
      Array.from({ length: WBC_COUNT }, (_, i) => ({
        angle: Math.random() * Math.PI * 2,
        orbit: 2.6 + Math.random() * (VESSEL_RADIUS * 0.42 - 2.6),
        z: -FIELD_LENGTH / 2 + (i / WBC_COUNT) * FIELD_LENGTH + (Math.random() - 0.5) * 30,
        speedK: 0.68 + Math.random() * 0.16,
        swirl: (Math.random() - 0.5) * 0.12,
        rotAxis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        rotRate: (Math.random() - 0.5) * 0.5,
        scale: (0.9 + Math.random() * 0.25) * WBC_KINDS[WBC_ROSTER[i]].scale,
      })),
    [],
  )

  // Golden emissive glow for the highlighted white cell.
  useEffect(() => {
    materials.forEach((m, i) => {
      const active = highlighted?.type === 'wbc' && highlighted.id === i
      m.emissiveIntensity = active ? 0.55 : 0
    })
  }, [highlighted, materials])

  const dq = useMemo(() => new THREE.Quaternion(), [])
  const camPos = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.25)
    const flow = sim.flowNow
    const beat = heartbeat(sim.time, beatsPerSecond(sim))

    let nearest = -1
    let nearestDz = Infinity

    for (let i = 0; i < WBC_COUNT; i++) {
      const mesh = meshRefs.current[i]
      if (!mesh) continue
      const d = data[i]

      d.z -= flow * d.speedK * dt
      if (d.z > sim.camZ + 18) d.z -= FIELD_LENGTH
      else if (d.z < sim.camZ - FIELD_LENGTH) d.z += FIELD_LENGTH

      const dz = Math.abs(d.z - sim.camZ)
      if (dz < nearestDz) {
        nearestDz = dz
        nearest = i
      }

      d.angle += d.swirl * dt
      dq.setFromAxisAngle(d.rotAxis, d.rotRate * dt)
      mesh.quaternion.premultiply(dq)
      // a white cell HAS to deform through a capillary — hug the axis and shrink
      const localR = radiusAtDist(-d.z, VESSEL_RADIUS)
      const fit = Math.min(1, Math.max(0.42, (localR - 0.6) / (2.35 * d.scale * 2.3)))
      const maxR = Math.max(0.0, localR - 2.35 * d.scale * fit - 0.5)
      const r = Math.min(d.orbit, maxR)
      mesh.position.set(Math.cos(d.angle) * r, Math.sin(d.angle) * r, d.z)
      sim.wbcPos[i].copy(mesh.position)
      const active = highlighted?.type === 'wbc' && highlighted.id === i
      const dCam = mesh.position.distanceTo(camPos.set(0, 0, sim.camZ))
      const nearK = dCam < 8 ? Math.max(0, Math.min(1, (dCam - 3.2) / 4.8)) : 1
      mesh.scale.setScalar(d.scale * fit * nearK * (active ? 1.12 : 1) * (1 + beat * 0.02))
    }

    if (nearest >= 0) {
      const d = data[nearest]
      sim.labelWbc.set(Math.cos(d.angle) * d.orbit, Math.sin(d.angle) * d.orbit, d.z)
    }
  })

  const handleClick = (id: number) => (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 8) return
    e.stopPropagation()
    onCellClick('wbc', id)
  }

  return (
    <group>
      {Array.from({ length: WBC_COUNT }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            meshRefs.current[i] = m
          }}
          geometry={geometry}
          material={materials[i]}
          onClick={handleClick(i)}
        />
      ))}
    </group>
  )
}
