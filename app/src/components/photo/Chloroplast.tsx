import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { glyphTexture } from './Glyphs'
import { starburstTexture } from './Sprites'
import type { PhotoSim } from '@/lib/photo'
import { getBand } from '@/lib/bands'

interface Props {
  sim: PhotoSim
  onFact: () => void
}

/* ---- layout inside the envelope (local units) ---- */
const GRANA: Array<{ p: [number, number, number]; n: number; r: number }> = [
  { p: [-0.42, -0.02, 0.1], n: 7, r: 0.16 },
  { p: [-0.05, 0.08, -0.16], n: 5, r: 0.14 },
  { p: [0.34, -0.06, 0.12], n: 8, r: 0.17 },
  { p: [0.08, -0.14, 0.32], n: 4, r: 0.12 },
  { p: [0.5, 0.14, -0.2], n: 5, r: 0.13 },
  { p: [-0.3, 0.16, -0.32], n: 4, r: 0.12 },
]
/** Stroma lamellae: thin tubes joining neighbouring stacks. */
const LAMELLAE: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [2, 4],
  [1, 5],
]

function ThylakoidStack({
  p,
  n,
  r,
  glowRef,
}: {
  p: [number, number, number]
  n: number
  r: number
  glowRef: (m: THREE.MeshStandardMaterial | null) => void
}) {
  return (
    <group position={p}>
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i} position={[0, (i - (n - 1) / 2) * 0.052, 0]}>
          <cylinderGeometry args={[r, r, 0.032, 24]} />
          <meshStandardMaterial
            ref={i === 0 ? glowRef : undefined}
            color="#2E7D32"
            emissive="#43A047"
            emissiveIntensity={0.6}
            roughness={0.35}
          />
        </mesh>
      ))}
    </group>
  )
}

function Label({ text, position, size = 0.11 }: { text: string; position: [number, number, number]; size?: number }) {
  const { texture, aspect } = useMemo(() => glyphTexture(text, '#1E3422'), [text])
  const ref = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    if (ref.current) ref.current.quaternion.copy(state.camera.quaternion)
  })
  return (
    <mesh ref={ref} position={position}>
      <planeGeometry args={[size * aspect, size]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

const PHOTONS = 36
const CARRIERS = 28

/**
 * The chloroplast, revealed inside the leaf at the "Inside" viewpoint.
 *
 * Grana (thylakoid stacks) joined by stroma lamellae inside a double
 * envelope. Photons arrive along the sun's line and strike the stacks, which
 * pulse; energy carriers (ATP / NADPH) then drift out into the stroma. All of
 * it scales with the light slider, so a learner who dims the sun watches the
 * factory slow down. Tap it for a fact.
 */
export default function Chloroplast({ sim, onFact }: Props) {
  const outerRef = useRef<THREE.Mesh>(null)
  const innerRef = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.PointLight>(null)
  const [hovered, setHovered] = useState(false)
  const stackMats = useRef<Array<THREE.MeshStandardMaterial | null>>([])
  const photonRef = useRef<THREE.InstancedMesh>(null)
  const carrierRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const starTex = useMemo(() => starburstTexture(), [])
  const band = getBand()
  const simple = band === 'explorer'

  const photonSeeds = useMemo(
    () =>
      Array.from({ length: PHOTONS }, (_, i) => ({
        target: i % GRANA.length,
        phase: (i * 0.618) % 1,
        spread: ((i * 7919) % 100) / 100 - 0.5,
      })),
    [],
  )
  const carrierSeeds = useMemo(
    () =>
      Array.from({ length: CARRIERS }, (_, i) => ({
        from: i % GRANA.length,
        phase: (i * 0.377) % 1,
        dir: new THREE.Vector3(Math.sin(i * 2.1), Math.cos(i * 1.3) * 0.5, Math.cos(i * 2.7)).normalize(),
      })),
    [],
  )
  const from = useMemo(() => new THREE.Vector3(-1.9, 1.5, 0.9), [])
  const granaPos = useMemo(() => GRANA.map((g) => new THREE.Vector3(...g.p)), [])
  const tmp = useMemo(() => new THREE.Vector3(), [])
  const pulse = useMemo(() => GRANA.map(() => 0), [])

  const lamellae = useMemo(
    () =>
      LAMELLAE.map(([a, b]) => {
        const A = granaPos[a]
        const B = granaPos[b]
        const mid = A.clone().add(B).multiplyScalar(0.5)
        const len = A.distanceTo(B)
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize())
        return { mid, len, q }
      }),
    [granaPos],
  )

  useFrame((state) => {
    const t = sim.time
    const light = sim.light
    if (outerRef.current) {
      const s = 1 + Math.sin(t * 1.8) * 0.02
      outerRef.current.scale.set(1.15 * s, 0.68 * s, 0.78 * s)
    }
    if (innerRef.current) {
      const s = 1 + Math.sin(t * 1.8 + 0.4) * 0.02
      innerRef.current.scale.set(1.08 * s, 0.62 * s, 0.72 * s)
    }
    if (glowRef.current) glowRef.current.intensity = 0.6 + light * 1.6 + Math.sin(t * 2.4) * 0.3

    // Photons: stream toward stacks; each strike bumps that stack's emissive.
    const pm = photonRef.current
    const active = Math.max(2, Math.round(PHOTONS * light))
    for (let i = 0; i < pulse.length; i++) pulse[i] = 0
    if (pm) {
      for (let i = 0; i < PHOTONS; i++) {
        const s = photonSeeds[i]
        const u = (t * (0.35 + light * 0.4) + s.phase) % 1
        tmp.copy(from)
        tmp.x += s.spread * 0.8
        tmp.lerp(granaPos[s.target], u)
        const on = i < active
        const fade = on ? Math.min(1, u * 5) * Math.min(1, (1 - u) * 6) : 0
        if (on && u > 0.9) pulse[s.target] += (u - 0.9) * 10
        dummy.position.copy(tmp)
        dummy.quaternion.copy(state.camera.quaternion)
        dummy.scale.setScalar(0.11 * fade)
        dummy.updateMatrix()
        pm.setMatrixAt(i, dummy.matrix)
      }
      pm.instanceMatrix.needsUpdate = true
    }
    stackMats.current.forEach((m, i) => {
      if (m) m.emissiveIntensity = 0.35 + light * 0.5 + Math.min(1.2, pulse[i]) * 0.9
    })
    // Energy carriers drift out of the stacks into the stroma and fade.
    const cm = carrierRef.current
    if (cm) {
      const activeC = Math.round(CARRIERS * light)
      for (let i = 0; i < CARRIERS; i++) {
        const s = carrierSeeds[i]
        const u = (t * 0.28 + s.phase) % 1
        dummy.position.copy(granaPos[s.from]).addScaledVector(s.dir, u * 0.55)
        dummy.quaternion.copy(state.camera.quaternion)
        const fade = i < activeC ? Math.min(1, u * 4) * (1 - u) : 0
        dummy.scale.setScalar(0.05 * fade)
        dummy.updateMatrix()
        cm.setMatrixAt(i, dummy.matrix)
      }
      cm.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <group position={[0, 2.8, 0.45]}>
      {/* Double envelope */}
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
        <sphereGeometry args={[1, 40, 28]} />
        <meshPhysicalMaterial
          color={hovered ? '#7DD387' : '#67B96C'}
          transparent
          opacity={0.22}
          roughness={0.18}
          clearcoat={0.6}
          clearcoatRoughness={0.4}
          emissive="#2E7D32"
          emissiveIntensity={hovered ? 0.35 : 0.15}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={innerRef}>
        <sphereGeometry args={[1, 40, 28]} />
        <meshStandardMaterial color="#9BD69C" transparent opacity={0.16} roughness={0.5} depthWrite={false} side={THREE.BackSide} />
      </mesh>

      {/* Grana + lamellae */}
      {GRANA.map((g, i) => (
        <ThylakoidStack
          key={i}
          p={g.p}
          n={g.n}
          r={g.r}
          glowRef={(m) => {
            stackMats.current[i] = m
          }}
        />
      ))}
      {lamellae.map((l, i) => (
        <mesh key={i} position={l.mid} quaternion={l.q}>
          <cylinderGeometry args={[0.02, 0.02, l.len, 8]} />
          <meshStandardMaterial color="#3E9A45" emissive="#2E7D32" emissiveIntensity={0.3} roughness={0.5} />
        </mesh>
      ))}

      {/* Photons and energy carriers */}
      <instancedMesh ref={photonRef} args={[undefined, undefined, PHOTONS]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={starTex} transparent depthWrite={false} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={carrierRef} args={[undefined, undefined, CARRIERS]} frustumCulled={false}>
        <circleGeometry args={[1, 10]} />
        <meshBasicMaterial color="#FFE27A" transparent opacity={0.9} depthWrite={false} toneMapped={false} />
      </instancedMesh>

      <pointLight ref={glowRef} color="#7CFC9B" intensity={1.4} distance={4} />

      {/* Labels in the world */}
      <Label text={simple ? 'light catchers' : 'grana · thylakoid stacks'} position={[-0.42, 0.34, 0.1]} />
      <Label text={simple ? 'sugar workshop' : 'stroma'} position={[0.55, -0.4, 0.3]} />
      <Label text={simple ? 'energy!' : 'ATP · NADPH'} position={[0.05, 0.42, 0.42]} size={0.09} />
      <Label text="chloroplast · tap it" position={[0, 0.9, 0]} size={0.115} />
    </group>
  )
}
