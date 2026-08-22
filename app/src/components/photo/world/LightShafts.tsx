import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import type { PhotoSim } from '@/lib/photo'
import type { WorldState } from '@/lib/world'
import { SUN_POS } from '@/lib/sunlight'
import { sunFanTexture } from '../Sprites'

/**
 * Sun shafts, without a post-processing pass.
 *
 * A god-ray effect costs a masked render plus a radial blur — real money on
 * the mid-range tablets this platform targets, and unavailable in Cardboard
 * stereo where the post chain steps aside. So the shafts are geometry instead:
 * two camera-facing fans centred on the *line of sight to the sun*, which is
 * exactly where the rays converge on screen. Because they sit at a real depth
 * in the world they are cut by whatever is in front of them — the plant, a
 * blade of grass — which is the part that sells it.
 *
 * They only appear when you are looking toward a low sun, the way real
 * crepuscular rays do, and they never appear at night.
 */
export default function LightShafts({ sim, world }: { sim: PhotoSim; world: WorldState }) {
  const nearRef = useRef<THREE.Mesh>(null)
  const farRef = useRef<THREE.Mesh>(null)
  const texture = useMemo(() => sunFanTexture(), [])
  const tmp = useMemo(() => ({ toSun: new THREE.Vector3(), fwd: new THREE.Vector3() }), [])

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        fog: false,
        side: THREE.DoubleSide,
      }),
    [texture],
  )
  const farMaterial = useMemo(() => material.clone(), [material])

  useFrame((state) => {
    const camera = state.camera
    tmp.toSun.subVectors(SUN_POS, camera.position).normalize()
    camera.getWorldDirection(tmp.fwd)
    const align = tmp.fwd.dot(tmp.toSun)
    // Low sun = long rays. Overhead sun = none, which is also when a real sky
    // has none.
    const lowSun = 1 - THREE.MathUtils.clamp(tmp.toSun.y * 1.15, 0, 1) * 0.55
    const strength =
      Math.pow(Math.max(0, align), 2.4) * lowSun * sim.light * world.daylight * (1 - world.rain * 0.5)

    for (const [ref, mat, distance, spin] of [
      [nearRef, material, 2.4, 0.035],
      [farRef, farMaterial, 6.4, -0.021],
    ] as const) {
      const mesh = ref.current
      if (!mesh) continue
      mat.opacity = strength * (distance < 4 ? 0.42 : 0.27)
      mesh.visible = mat.opacity > 0.004
      if (!mesh.visible) continue
      mesh.position.copy(camera.position).addScaledVector(tmp.toSun, distance)
      mesh.quaternion.copy(camera.quaternion)
      mesh.rotateZ(sim.time * spin)
      const s = distance * 2.6
      mesh.scale.set(s, s, s)
    }
  })

  return (
    <group renderOrder={6}>
      <mesh ref={nearRef} material={material} frustumCulled={false} renderOrder={6}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh ref={farRef} material={farMaterial} frustumCulled={false} renderOrder={6}>
        <planeGeometry args={[1, 1]} />
      </mesh>
    </group>
  )
}
