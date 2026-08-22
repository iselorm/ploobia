import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { glyphTexture } from '@/components/photo/Glyphs'
import { glowTexture } from '@/components/photo/Sprites'
import type { AtomSim } from '@/lib/atoms'
import { ContactShadow } from './FoundryWorld'

/**
 * The three particle sources on the foundry floor. Tapping a crucible feeds
 * one particle to the stage — the most direct "what happens if I…?" in the
 * cabinet. (The HUD carries the matching +/− buttons for precision.)
 */

export type ParticleKind = 'proton' | 'neutron' | 'electron'

interface CrucibleSpec {
  kind: ParticleKind
  label: string
  color: string
  glow: string
  position: [number, number, number]
}

const SPECS: CrucibleSpec[] = [
  { kind: 'proton', label: 'p⁺ protons', color: '#E8A33D', glow: 'rgba(232, 163, 61, 0.75)', position: [-2.7, 0, 0.7] },
  { kind: 'neutron', label: 'n⁰ neutrons', color: '#9AA4B2', glow: 'rgba(154, 164, 178, 0.6)', position: [-1.35, 0, 2.35] },
  { kind: 'electron', label: 'e⁻ electrons', color: '#63E0FF', glow: 'rgba(99, 224, 255, 0.7)', position: [2.7, 0, 0.7] },
]

function Crucible({ spec, sim, onAdd }: { spec: CrucibleSpec; sim: AtomSim; onAdd: (kind: ParticleKind) => void }) {
  const bob = useRef<THREE.Group>(null)
  const glowMat = useRef<THREE.SpriteMaterial>(null)
  const inviteRing = useRef<THREE.Mesh>(null)
  const inviteMat = useRef<THREE.MeshBasicMaterial>(null)
  const halo = useMemo(() => glowTexture(spec.glow, spec.glow.replace(/[\d.]+\)$/, '0)'), `crucible-${spec.kind}`), [spec])
  const label = useMemo(() => glyphTexture(spec.label, '#FFF6E8', { strokeWidth: 6, strokeColor: 'rgba(38, 24, 12, 0.9)' }), [spec.label])

  useFrame(() => {
    const t = sim.time
    const added = spec.kind === 'proton' ? sim.lastAddP : spec.kind === 'neutron' ? sim.lastAddN : sim.lastAddE
    const pulse = Math.max(0, 1 - (t - added) * 2.4)
    // A steady breathing beat so the orb reads as "press me", not scenery.
    const breathe = Math.sin(t * 2.4 + spec.position[0] * 2)
    if (bob.current) {
      bob.current.position.y = 1.0 + Math.sin(t * 1.4 + spec.position[0]) * 0.08 + pulse * 0.22
      const s = 1 + breathe * 0.09 + pulse * 0.55
      bob.current.scale.setScalar(s)
    }
    if (glowMat.current) glowMat.current.opacity = 0.6 + breathe * 0.18 + pulse * 0.4
    // The invitation ring on the rim swells and fades like the Motion Yard's press-me ring.
    if (inviteRing.current && inviteMat.current) {
      const w = (t * 0.55 + spec.position[0]) % 1
      inviteRing.current.scale.setScalar(1 + w * 0.55)
      inviteMat.current.opacity = (1 - w) * 0.55 + pulse * 0.3
    }
  })

  return (
    <group position={spec.position}>
      {/* bowl */}
      <group
        onClick={(e) => {
          e.stopPropagation()
          onAdd(spec.kind)
        }}
      >
        <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.44, 0.3, 0.6, 22]} />
          <meshStandardMaterial color="#4E3A2A" roughness={0.55} metalness={0.3} />
        </mesh>
        {/* molten surface */}
        <mesh position={[0, 0.62, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.4, 24]} />
          <meshBasicMaterial color={spec.color} toneMapped={false} />
        </mesh>
        {/* the sample particle hovering above, asking to be tapped */}
        <group ref={bob} position={[0, 1.0, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.13, 20, 16]} />
            <meshStandardMaterial color={spec.color} emissive={spec.color} emissiveIntensity={1.1} roughness={0.3} />
          </mesh>
        </group>
        {/* swelling invitation ring on the rim */}
        <mesh ref={inviteRing} position={[0, 0.64, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
          <ringGeometry args={[0.42, 0.47, 36]} />
          <meshBasicMaterial ref={inviteMat} color={spec.color} transparent opacity={0.4} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
        <sprite position={[0, 0.75, 0]} scale={[1.5, 1.5, 1]}>
          <spriteMaterial ref={glowMat} map={halo} transparent opacity={0.5} depthWrite={false} toneMapped={false} />
        </sprite>
      </group>
      {/* caption — in the world, subject to depth */}
      <mesh position={[0, 1.44, 0]} renderOrder={2}>
        <planeGeometry args={[0.24 * label.aspect, 0.24]} />
        <meshBasicMaterial map={label.texture} transparent opacity={0.92} depthWrite={false} toneMapped={false} />
      </mesh>
      <ContactShadow position={[0, 0, 0]} radius={0.62} opacity={0.38} />
    </group>
  )
}

export default function Dispensers({ sim, showNeutrons, onAdd }: { sim: AtomSim; showNeutrons: boolean; onAdd: (kind: ParticleKind) => void }) {
  return (
    <group>
      {SPECS.filter((s) => showNeutrons || s.kind !== 'neutron').map((s) => (
        <Crucible key={s.kind} spec={s} sim={sim} onAdd={onAdd} />
      ))}
    </group>
  )
}
