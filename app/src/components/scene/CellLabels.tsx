import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { glyphTexture } from '@/components/photo/Glyphs'
import type { SimState } from '@/lib/sim'
import { CELL_COLORS, CELL_LABELS, CELL_TAGLINES, type CellType } from '@/lib/facts'

/**
 * Labels mode: name tags pinned to the nearest cell of each type — drawn IN
 * the 3D world (camera-facing textured quads, lifted toward the camera so
 * they clear the cell's own front face), never as DOM overlays floating on
 * top of the scene.
 */

function WorldLabel({ source, type }: { source: THREE.Vector3; type: CellType }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const { camera } = useThree()
  const { texture, aspect } = useMemo(
    () => glyphTexture(`${CELL_LABELS[type]} · ${CELL_TAGLINES[type]}`, CELL_COLORS[type]),
    [type],
  )
  const toCam = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return
    mesh.position.copy(source)
    toCam.copy(camera.position).sub(source)
    const dist = toCam.length()
    if (dist > 1e-4) mesh.position.addScaledVector(toCam, Math.min(1.6, dist * 0.12) / dist)
    mesh.quaternion.copy(camera.quaternion)
    // roughly constant on-screen size, like the old distanceFactor behaviour
    mesh.scale.setScalar(THREE.MathUtils.clamp(dist / 16, 0.5, 2.6))
  })

  return (
    <mesh ref={meshRef} renderOrder={2}>
      <planeGeometry args={[0.42 * aspect, 0.42]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} alphaTest={0.02} />
    </mesh>
  )
}

export default function CellLabels({ sim }: { sim: SimState }) {
  return (
    <>
      <WorldLabel source={sim.labelRbc} type="rbc" />
      <WorldLabel source={sim.labelWbc} type="wbc" />
      <WorldLabel source={sim.labelPlatelet} type="platelet" />
    </>
  )
}
