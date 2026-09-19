import { useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useWorldMesh } from './useWorldMesh'
import type { WorldMeshId } from '@/lib/worldassets'

export default function Prop({
  id,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  own = false,
  visible = true,
  scale = 1,
  children,
}: {
  id: WorldMeshId
  position?: [number, number, number]
  rotation?: [number, number, number]
  /** Clone the shared mesh — needed when the same id is drawn more than once. */
  own?: boolean
  visible?: boolean
  /** Applied to the generated mesh only — the stand-in draws at its own size. */
  scale?: number
  children: ReactNode
}) {
  const generated = useWorldMesh(id, own)
  const holder = useRef<THREE.Group>(null)
  const born = useRef(-1)
  useFrame((state) => {
    const h = holder.current
    if (!h || !generated) return
    if (born.current < 0) born.current = state.clock.elapsedTime
    const k = Math.min(1, (state.clock.elapsedTime - born.current) / 0.45)
    h.scale.setScalar(scale * (0.6 + 0.4 * (1 - Math.pow(1 - k, 3))))
  })
  return (
    <group position={position} rotation={rotation} name={`prop-${id}`} visible={visible} userData={{ generated: !!generated }}>
      {generated ? (
        <group ref={holder}>
          <primitive object={generated.group} />
        </group>
      ) : (
        children
      )}
    </group>
  )
}
