import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { PLOOB2_URL } from './Ploob2'

/**
 * Ploob 2.0 in a scene — the rendered still as a billboard.
 *
 * The app's 3D Ploob is still the old `ploob.glb` (the green-tinted jelly
 * pudding), and a real Ploob 2.0 mesh needs a turnaround that does not exist
 * yet. Until it does, the honest in-scene Ploob is the picture Selorm locked:
 * a cutout plane that faces the camera, stands on the ground, and breathes.
 * Same technique as the Market's shoppers; no rig, no seams, no wrong face.
 *
 * `height` is his height in metres; the plane is square (the picture is), so
 * the width is the same and the sides are transparent.
 */
export default function PloobCutout({
  position = [0, 0, 0],
  height = 0.95,
  tint = '#ffffff',
  bob = true,
}: {
  position?: [number, number, number]
  height?: number
  /** A multiply tint over the amber — leave white for Ploob as he is. */
  tint?: string
  bob?: boolean
}) {
  const group = useRef<THREE.Group>(null)
  const camera = useThree((s) => s.camera)
  const [tex, setTex] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    let live = true
    new THREE.TextureLoader().loadAsync(PLOOB2_URL).then((t) => {
      if (!live) return
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 4
      setTex(t)
    })
    return () => {
      live = false
    }
  }, [])
  const seed = useMemo(() => Math.random() * 10, [])
  useFrame((state) => {
    const g = group.current
    if (!g) return
    const t = state.clock.elapsedTime + seed
    g.position.set(position[0], position[1] + (bob ? Math.abs(Math.sin(t * 2.2)) * 0.012 : 0), position[2])
    g.rotation.y = Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z)
    const squash = bob ? 1 + Math.sin(t * 2.2) * 0.012 : 1
    g.scale.set(1 / squash, squash, 1)
  })
  if (!tex) return null
  return (
    <group ref={group} position={position} name="ploob">
      <mesh position={[0, height / 2, 0]} castShadow>
        <planeGeometry args={[height, height]} />
        <meshBasicMaterial map={tex} color={tint} transparent alphaTest={0.35} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  )
}
