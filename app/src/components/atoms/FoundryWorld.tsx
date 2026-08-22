import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useQualityCaps } from '@/lib/quality'
import { glowTexture, shadowTexture } from '@/components/photo/Sprites'

/**
 * The foundry venue: a warm workshop at golden hour — bright enough to feel
 * friendly, warm enough that the luminous atom and the dark table wall still
 * pop. Gradient dome, fog tinted to the horizon, a glowing stage, drifting
 * motes and clean lamps — the Cinematic Lab checklist, indoors and amber.
 * (First pass was a near-black hall; Selorm's review: "not as friendly as it
 * should" — hence the daylight lift.)
 */

export const FLOOR_COLOR = '#6E5138'
export const FOG_COLOR = '#9C7448'

/** Six-stop vertical gradient painted onto the inside of a dome. */
function domeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const g = ctx.createLinearGradient(0, 512, 0, 0)
    g.addColorStop(0, '#E5A960') // golden glow at the horizon
    g.addColorStop(0.12, '#C98F4E')
    g.addColorStop(0.28, '#A9743E')
    g.addColorStop(0.5, '#7E5A35')
    g.addColorStop(0.75, '#5A452E')
    g.addColorStop(1, '#453729')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 4, 512)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function Motes({ scale }: { scale: number }) {
  const count = Math.round(70 * scale)
  const ref = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: Math.sin(i * 12.9898) * 8,
        y: 0.4 + ((i * 0.618) % 1) * 3.6,
        z: Math.sin(i * 78.233) * 6 - 1,
        speed: 0.05 + ((i * 0.377) % 1) * 0.08,
        phase: i * 1.7,
      })),
    [count],
  )
  const map = useMemo(() => glowTexture('rgba(255, 226, 170, 0.9)', 'rgba(255, 226, 170, 0)', 'mote-amber'), [])

  useFrame(({ clock }) => {
    const mesh = ref.current
    if (!mesh) return
    const t = clock.elapsedTime
    seeds.forEach((s, i) => {
      dummy.position.set(
        s.x + Math.sin(t * s.speed + s.phase) * 0.6,
        s.y + Math.sin(t * s.speed * 1.4 + s.phase * 2.1) * 0.4,
        s.z + Math.cos(t * s.speed * 0.8 + s.phase) * 0.6,
      )
      dummy.scale.setScalar(0.05 + 0.03 * Math.sin(t * 0.6 + s.phase))
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={map} transparent opacity={0.35} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
    </instancedMesh>
  )
}

function Lamp({ position, tint }: { position: [number, number, number]; tint: string }) {
  const halo = useMemo(() => glowTexture('rgba(255, 214, 150, 0.85)', 'rgba(255, 214, 150, 0)', 'lamp-halo'), [])
  return (
    <group position={position}>
      {/* pole */}
      <mesh position={[0, -position[1] / 2, 0]}>
        <cylinderGeometry args={[0.035, 0.05, position[1], 8]} />
        <meshStandardMaterial color="#4A3A2C" roughness={0.8} metalness={0.4} />
      </mesh>
      {/* glowing head */}
      <mesh>
        <sphereGeometry args={[0.16, 18, 14]} />
        <meshBasicMaterial color={tint} toneMapped={false} />
      </mesh>
      <sprite scale={[1.6, 1.6, 1]}>
        <spriteMaterial map={halo} transparent opacity={0.6} depthWrite={false} toneMapped={false} />
      </sprite>
    </group>
  )
}

/** Soft dark ellipse that grounds an object on the floor. */
export function ContactShadow({ position, radius = 0.7, opacity = 0.42 }: { position: [number, number, number]; radius?: number; opacity?: number }) {
  const map = useMemo(() => shadowTexture(), [])
  return (
    <mesh position={[position[0], 0.012, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[radius * 2, radius * 2 * 0.86]} />
      <meshBasicMaterial map={map} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  )
}

export default function FoundryWorld() {
  const quality = useQualityCaps()
  const dome = useMemo(() => domeTexture(), [])
  const stageGlow = useMemo(() => glowTexture('rgba(232, 163, 61, 0.5)', 'rgba(232, 163, 61, 0)', 'stage-glow'), [])

  return (
    <group>
      <fog attach="fog" args={[FOG_COLOR, 14, 46]} />
      {/* dome */}
      <mesh scale={[48, 48, 48]}>
        <sphereGeometry args={[1, 24, 18]} />
        <meshBasicMaterial map={dome} side={THREE.BackSide} fog={false} toneMapped={false} />
      </mesh>
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[46, 48]} />
        <meshStandardMaterial color={FLOOR_COLOR} roughness={0.94} metalness={0.05} />
      </mesh>
      {/* warm pool of light around the stage */}
      <mesh position={[0, 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[10, 10]} />
        <meshBasicMaterial map={stageGlow} transparent opacity={0.65} depthWrite={false} toneMapped={false} />
      </mesh>

      {/* lighting */}
      <ambientLight intensity={1.05} color="#FFEBCD" />
      <hemisphereLight args={['#FFE9C2', '#8A6238', 0.55]} />
      <directionalLight
        position={[4, 8, 5]}
        intensity={1.6}
        color="#FFE2B0"
        castShadow={quality.shadows}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={24}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
      />
      <pointLight position={[0, 3.4, 0.6]} intensity={9} color="#FFC873" distance={11} decay={2} />
      <pointLight position={[0, 3.2, -4.2]} intensity={13} color="#B9CFE8" distance={11} decay={2} />

      <Lamp position={[-4.6, 3.1, 2.4]} tint="#FFDFA6" />
      <Lamp position={[4.6, 3.1, 2.4]} tint="#FFDFA6" />
      <Lamp position={[-4.4, 3.4, -3.8]} tint="#FFE9C6" />
      <Lamp position={[4.4, 3.4, -3.8]} tint="#FFE9C6" />

      <Motes scale={quality.particleScale} />
    </group>
  )
}
