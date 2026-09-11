import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { loadMesh, type MeshAssetId } from '@/lib/marketassets'

/**
 * A generated prop with its procedural stand-in.
 *
 * Renders the children (the stand-in) until the Higgsfield mesh arrives, then
 * swaps — with a short scale-in so the swap reads as the prop settling rather
 * than popping. If the mesh never arrives (offline copy, slow network, a tier
 * that declined it) the stand-in simply stays. Nothing waits on this.
 */
export function useGenerated(id: MeshAssetId): THREE.Group | null {
  const [group, setGroup] = useState<THREE.Group | null>(null)
  useEffect(() => {
    let live = true
    loadMesh(id).then((g) => {
      if (live && g) setGroup(g)
    })
    return () => {
      live = false
    }
  }, [id])
  return group
}

export default function Prop({ id, position = [0, 0, 0], rotation = [0, 0, 0], children }: { id: MeshAssetId; position?: [number, number, number]; rotation?: [number, number, number]; children: ReactNode }) {
  const generated = useGenerated(id)
  const holder = useRef<THREE.Group>(null)
  const born = useRef(-1)
  useFrame((state) => {
    const h = holder.current
    if (!h || !generated) return
    if (born.current < 0) born.current = state.clock.elapsedTime
    const k = Math.min(1, (state.clock.elapsedTime - born.current) / 0.45)
    const s = 0.6 + 0.4 * (1 - Math.pow(1 - k, 3))
    h.scale.setScalar(s)
  })
  return (
    <group position={position} rotation={rotation} name={`prop-${id}`} userData={{ generated: !!generated }}>
      {generated ? (
        <group ref={holder}>
          <primitive object={generated} />
        </group>
      ) : (
        children
      )}
    </group>
  )
}
