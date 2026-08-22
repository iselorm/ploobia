import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Sparkles } from '@react-three/drei'
import { glyphTexture } from './Glyphs'
import type { PhotoSim } from '@/lib/photo'

interface Props {
  sim: PhotoSim
  onFact: () => void
}

/** A thylakoid stack (granum): a little tower of glowing green pancakes. */
function ThylakoidStack({ position }: { position: [number, number, number] }) {
  const coins = useMemo(() => [0, 1, 2, 3, 4], [])
  return (
    <group position={position}>
      {coins.map((i) => (
        <mesh key={i} position={[0, i * 0.09 - 0.18, 0]}>
          <cylinderGeometry args={[0.17, 0.17, 0.055, 20]} />
          <meshStandardMaterial
            color="#2E7D32"
            emissive="#43A047"
            emissiveIntensity={0.7}
            roughness={0.4}
          />
        </mesh>
      ))}
    </group>
  )
}

/**
 * The zoomed-in chloroplast revealed inside the leaf. Clickable for facts.
 * Only mounted while sim.zoomed is true.
 */
export default function Chloroplast({ sim, onFact }: Props) {
  const outerRef = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.PointLight>(null)
  const labelRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)
  const { texture: labelTexture, aspect: labelAspect } = useMemo(
    () => glyphTexture('chloroplast · tap it', '#2E7D32'),
    [],
  )

  useFrame((state) => {
    const t = sim.time
    if (labelRef.current) {
      labelRef.current.quaternion.copy(state.camera.quaternion)
      labelRef.current.position.y = 0.86 + Math.sin(t * 2) * 0.03
    }
    if (outerRef.current) {
      const s = 1 + Math.sin(t * 1.8) * 0.03
      outerRef.current.scale.set(1.1 * s, 0.62 * s, 0.7 * s)
    }
    if (glowRef.current) glowRef.current.intensity = 1.2 + Math.sin(t * 2.4) * 0.4
  })

  return (
    <group position={[0, 2.8, 0.45]}>
      {/* Jelly-like outer membrane */}
      <mesh
        ref={outerRef}
        onClick={(e) => {
          e.stopPropagation()
          onFact()
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHovered(false)
          document.body.style.cursor = 'auto'
        }}
      >
        <sphereGeometry args={[1, 32, 24]} />
        <meshStandardMaterial
          color={hovered ? '#69C174' : '#57A75B'}
          transparent
          opacity={0.38}
          roughness={0.25}
          emissive="#2E7D32"
          emissiveIntensity={hovered ? 0.55 : 0.3}
        />
      </mesh>
      {/* Thylakoid stacks inside */}
      <ThylakoidStack position={[-0.38, 0, 0.08]} />
      <ThylakoidStack position={[0.02, 0.05, -0.14]} />
      <ThylakoidStack position={[0.42, -0.04, 0.1]} />
      <ThylakoidStack position={[0.1, -0.02, 0.3]} />
      <pointLight ref={glowRef} color="#7CFC9B" intensity={1.4} distance={4} />
      <Sparkles count={22} scale={2.4} size={4} speed={0.5} color="#B9F6CA" />
      {/* Labelled inside the 3D scene rather than as an HTML overlay, so it is
          occluded by the world and can never land on top of the HUD. */}
      <mesh ref={labelRef} position={[0, 0.92, 0]}>
        <planeGeometry args={[0.115 * labelAspect, 0.115]} />
        <meshBasicMaterial map={labelTexture} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}
