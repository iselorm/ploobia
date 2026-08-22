import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { glyphTexture } from '@/components/photo/Glyphs'
import { glowTexture } from '@/components/photo/Sprites'
import { GRIP_MAX, PROBE_SECONDS, type AtomSim } from '@/lib/atoms'
import { STAGE_POS } from './layout'
import { ContactShadow } from './FoundryWorld'

/**
 * The grip probe — the cabinet's instrument. It fires a tether at the atom's
 * outermost electron and reads off the energy needed to pull it free (first
 * ionisation energy, for real). The luminous meter beside it is a world
 * object; exact numbers live in the HUD.
 */

// Head placed along the same direction the electron is tugged in BuildAtom.
const PULL_DIR = new THREE.Vector3(1.4, -0.15, -0.5).normalize()
const HEAD = new THREE.Vector3().copy(PULL_DIR).multiplyScalar(1.5).add(new THREE.Vector3(...STAGE_POS))
const BASE: [number, number, number] = [HEAD.x + 0.25, 0, HEAD.z - 0.15]

export default function Probe({ sim, onFact }: { sim: AtomSim; onFact: () => void }) {
  const beam = useRef<THREE.Mesh>(null)
  const beamMat = useRef<THREE.MeshBasicMaterial>(null)
  const fill = useRef<THREE.Group>(null)
  const lens = useRef<THREE.MeshBasicMaterial>(null)
  const target = useMemo(() => new THREE.Vector3(), [])
  const mid = useMemo(() => new THREE.Vector3(), [])
  const halo = useMemo(() => glowTexture('rgba(127, 227, 255, 0.7)', 'rgba(127, 227, 255, 0)', 'probe-halo'), [])
  const caption = useMemo(() => glyphTexture('grip probe', '#FFF6E8', { strokeWidth: 6, strokeColor: 'rgba(38, 24, 12, 0.9)' }), [])
  const level = useRef(0)

  useFrame(() => {
    const t = sim.time
    const active = sim.probing
    const b = beam.current
    if (b) {
      b.visible = active
      if (active) {
        // Beam from the head to the (tugged) outer-electron region.
        target.set(...STAGE_POS).addScaledVector(PULL_DIR, 0.55)
        mid.lerpVectors(HEAD, target, 0.5)
        b.position.copy(mid)
        b.lookAt(target)
        const len = HEAD.distanceTo(target)
        b.scale.set(1, 1, len)
        if (beamMat.current) beamMat.current.opacity = 0.55 + Math.sin(t * 26) * 0.25
      }
    }
    // Meter fills toward the measured value while the probe pulls.
    const goal = active ? (Math.min(1, (t - sim.probeStartAt) / PROBE_SECONDS) * sim.probeValue) / GRIP_MAX : sim.probeValue > 0 ? sim.probeValue / GRIP_MAX : 0
    level.current += (goal - level.current) * 0.12
    if (fill.current) fill.current.scale.y = Math.max(0.001, level.current)
    if (lens.current) lens.current.opacity = active ? 0.95 : 0.45 + Math.sin(t * 1.6) * 0.1
  })

  return (
    <group>
      {/* pylon */}
      <group
        position={BASE}
        onClick={(e) => {
          e.stopPropagation()
          onFact()
        }}
      >
        <mesh position={[0, 0.75, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.09, 1.5, 10]} />
          <meshStandardMaterial color="#4E3A2A" roughness={0.55} metalness={0.35} />
        </mesh>
        <ContactShadow position={[0, 0, 0]} radius={0.4} opacity={0.35} />
      </group>
      {/* head, aimed at the atom */}
      <group position={[HEAD.x, HEAD.y, HEAD.z]}>
        <mesh castShadow>
          <sphereGeometry args={[0.13, 18, 14]} />
          <meshStandardMaterial color="#39424E" roughness={0.4} metalness={0.6} />
        </mesh>
        <mesh position={[-PULL_DIR.x * 0.12, -PULL_DIR.y * 0.12, -PULL_DIR.z * 0.12]}>
          <sphereGeometry args={[0.07, 14, 12]} />
          <meshBasicMaterial ref={lens} color="#7FE3FF" transparent opacity={0.6} toneMapped={false} />
        </mesh>
        <sprite scale={[0.9, 0.9, 1]}>
          <spriteMaterial map={halo} transparent opacity={0.35} depthWrite={false} toneMapped={false} />
        </sprite>
      </group>
      {/* tether beam */}
      <mesh ref={beam} visible={false}>
        <boxGeometry args={[0.022, 0.022, 1]} />
        <meshBasicMaterial ref={beamMat} color="#8FE9FF" transparent opacity={0.6} toneMapped={false} depthWrite={false} />
      </mesh>
      {/* the meter — a luminous column beside the pylon */}
      <group position={[BASE[0] + 0.55, 0, BASE[2] - 0.1]}>
        <mesh position={[0, 0.8, 0]}>
          <boxGeometry args={[0.16, 1.6, 0.16]} />
          <meshStandardMaterial color="#3A2C20" emissive="#3A2C1C" emissiveIntensity={0.3} roughness={0.8} />
        </mesh>
        {/* fill anchored at the base via a unit-height box inside a scaled group */}
        <group ref={fill} position={[0, 0.02, 0]} scale={[1, 0.001, 1]}>
          <mesh position={[0, 0.78, 0]}>
            <boxGeometry args={[0.1, 1.56, 0.1]} />
            <meshBasicMaterial color="#7FE3FF" toneMapped={false} />
          </mesh>
        </group>
        <mesh position={[0, 1.78, 0]} renderOrder={2}>
          <planeGeometry args={[0.16 * caption.aspect, 0.16]} />
          <meshBasicMaterial map={caption.texture} transparent opacity={0.9} depthWrite={false} toneMapped={false} />
        </mesh>
        <ContactShadow position={[0, 0, 0]} radius={0.32} opacity={0.3} />
      </group>
    </group>
  )
}
