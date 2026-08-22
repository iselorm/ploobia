import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import type { SimState, Highlight } from '@/lib/sim'
import { CELL_VERGE, FIELD_LENGTH, PLATELET_COUNT, VESSEL_RADIUS } from '@/lib/sim'
import { radiusAtDist } from '@/lib/journey'
import type { CellType } from '@/lib/facts'

const BASE_COLOR = new THREE.Color('#EFA9A0')
const GLOW_COLOR = new THREE.Color('#FFD9A0')

interface Props {
  sim: SimState
  highlighted: Highlight | null
  onCellClick: (type: CellType, id: number) => void
}

/**
 * Tiny irregular platelet blobs skittering through the plasma — small,
 * fast-tumbling, and fun to spot.
 */
export default function Platelets({ sim, highlighted, onCellClick }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null)

  const geometry = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(0.36, 1)
    const pos = g.attributes.position as THREE.BufferAttribute
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      v.multiplyScalar(1 + (Math.sin(v.x * 7.1) * Math.cos(v.y * 5.3 + 1.7) + Math.sin(v.z * 6.2)) * 0.16)
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    g.computeVertexNormals()
    return g
  }, [])

  const material = useMemo(
    () =>
      new THREE.MeshLambertMaterial({
        color: new THREE.Color('#ffffff'),
      }),
    [],
  )

  const data = useMemo(() => {
    const items = Array.from({ length: PLATELET_COUNT }, () => ({
      angle: Math.random() * Math.PI * 2,
      orbit: 1.6 + Math.sqrt(Math.random()) * (VESSEL_RADIUS * 0.6 - 1.6),
      z: (Math.random() - 0.5) * FIELD_LENGTH,
      speedK: 0.72 + Math.random() * 0.2,
      swirl: (Math.random() - 0.5) * 0.9,
      rotAxis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      rotRate: (Math.random() - 0.5) * 6,
      wobblePhase: Math.random() * Math.PI * 2,
      scale: 0.7 + Math.random() * 0.7,
    }))
    return items
  }, [])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const c = new THREE.Color()
    for (let i = 0; i < PLATELET_COUNT; i++) {
      c.copy(BASE_COLOR).offsetHSL(0, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.08)
      mesh.setColorAt(i, c)
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [])

  const prevHighlight = useRef<number | null>(null)
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    if (prevHighlight.current !== null) {
      mesh.setColorAt(prevHighlight.current, BASE_COLOR)
      prevHighlight.current = null
    }
    if (highlighted?.type === 'platelet' && highlighted.id < PLATELET_COUNT) {
      mesh.setColorAt(highlighted.id, GLOW_COLOR)
      prevHighlight.current = highlighted.id
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [highlighted])

  const dummy = useMemo(() => new THREE.Object3D(), [])
  const dq = useMemo(() => new THREE.Quaternion(), [])

  useFrame((_, rawDt) => {
    const mesh = meshRef.current
    if (!mesh) return
    const dt = Math.min(rawDt, 0.25)
    const flow = sim.flowNow

    let nearest = -1
    let nearestDz = Infinity

    for (let i = 0; i < PLATELET_COUNT; i++) {
      const d = data[i]
      d.z -= flow * d.speedK * dt
      if (d.z > sim.camZ + 14) d.z -= FIELD_LENGTH
      else if (d.z < sim.camZ - FIELD_LENGTH) d.z += FIELD_LENGTH

      const dz = Math.abs(d.z - sim.camZ)
      if (dz < nearestDz) {
        nearestDz = dz
        nearest = i
      }

      d.angle += d.swirl * dt
      const localR = radiusAtDist(-d.z, VESSEL_RADIUS)
      const maxR = Math.max(0.45, localR - 0.6 - CELL_VERGE)
      const r = Math.min(d.orbit + Math.sin(sim.time * 2.4 + d.wobblePhase) * 0.3, maxR)
      dq.setFromAxisAngle(d.rotAxis, d.rotRate * dt)
      dummy.position.set(Math.cos(d.angle) * r, Math.sin(d.angle) * r, d.z)
      dummy.quaternion.premultiply(dq)
      const active = highlighted?.type === 'platelet' && highlighted.id === i
      const pdz = d.z - sim.camZ
      const dCam = Math.sqrt(dummy.position.x * dummy.position.x + dummy.position.y * dummy.position.y + pdz * pdz)
      const nearK = dCam < 2.4 ? Math.max(0, Math.min(1, (dCam - 0.8) / 1.6)) : 1
      dummy.scale.setScalar(d.scale * nearK * (active ? 1.8 : 1))
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }

    if (nearest >= 0) {
      const d = data[nearest]
      sim.labelPlatelet.set(Math.cos(d.angle) * d.orbit, Math.sin(d.angle) * d.orbit, d.z)
    }

    // The three platelets nearest the camera get racing nameplates.
    const order = data
      .map((d, i) => ({ i, dz: Math.abs(d.z - sim.camZ) }))
      .sort((a, b) => a.dz - b.dz)
    for (let k = 0; k < 3; k++) {
      const d = data[order[k].i]
      const r = d.orbit + Math.sin(sim.time * 2.4 + d.wobblePhase) * 0.3
      sim.plateletTagPos[k].set(Math.cos(d.angle) * r, Math.sin(d.angle) * r, d.z)
    }

    mesh.instanceMatrix.needsUpdate = true
  })

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 8) return
    if (e.instanceId === undefined) return
    e.stopPropagation()
    onCellClick('platelet', e.instanceId)
  }

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, PLATELET_COUNT]}
      frustumCulled={false}
      onClick={handleClick}
    />
  )
}
