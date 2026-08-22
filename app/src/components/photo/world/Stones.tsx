import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import type { WorldState } from '@/lib/world'
import { CLEARING, GROUND_Y, landH } from '@/lib/world'
import { useQualityCaps } from '@/lib/quality'

/**
 * Stones from the same height function as the terrain, sunk rather than
 * dropped, in a few sizes. They matter most near the subject, where they give
 * the eye something to measure scale against.
 */
export default function Stones({ world }: { world: WorldState }) {
  const quality = useQualityCaps()
  const count = Math.round(180 * Math.max(0.5, quality.particleScale))
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(1, 1)
    g.scale(1, 0.62, 1)
    g.translate(0, 0.3, 0)
    return g
  }, [])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8B8A78', roughness: 0.95, flatShading: true }), [])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    let placed = 0
    let guard = 0
    while (placed < count && guard < count * 10) {
      guard++
      const u = Math.random()
      const r = CLEARING * 0.95 + (34 - CLEARING) * Math.pow(u, 1.3)
      const th = Math.random() * Math.PI * 2
      const x = Math.cos(th) * r
      const z = Math.sin(th) * r
      const e = 0.5
      const slope = Math.abs(landH(x + e, z) - landH(x - e, z)) + Math.abs(landH(x, z + e) - landH(x, z - e))
      // Stones like slopes and dry ground a little more than flat meadow.
      if (Math.random() > 0.35 + slope * 0.6) continue
      const s = [0.1, 0.16, 0.26, 0.42][Math.floor(Math.pow(Math.random(), 2.2) * 4)]
      dummy.position.set(x, GROUND_Y + landH(x, z) - s * 0.15, z)
      dummy.rotation.set(Math.random() * 0.4, Math.random() * Math.PI * 2, Math.random() * 0.4)
      dummy.scale.set(s * (0.8 + Math.random() * 0.5), s, s * (0.8 + Math.random() * 0.5))
      dummy.updateMatrix()
      mesh.setMatrixAt(placed, dummy.matrix)
      placed++
    }
    mesh.count = placed
    mesh.instanceMatrix.needsUpdate = true
  }, [count])

  const scratch = useMemo(() => new THREE.Color(), [])
  useFrame(() => {
    scratch.copy(world.rock)
    if (world.snow > 0) scratch.lerp(new THREE.Color('#E8EEF2'), world.snow * 0.6)
    mat.color.lerp(scratch, 0.15)
  })

  return (
    <instancedMesh ref={meshRef} args={[geo, mat, count]} castShadow={quality.shadows} receiveShadow={quality.shadows} frustumCulled={false} />
  )
}
