import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { BALL_RADIUS, MASS_BY_ID, type MassId, type MotionSim } from '@/lib/motion'
import { LAUNCH_ORIGIN } from '@/lib/yard'
import { YARD_Y } from './YardWorld'
import { PAD_POS, worldX } from './YardKit'

const HOLO = '#5FE0D2'

/**
 * Scout — the lab drone. It hovers where the action is: over the landing pad
 * in drop mode (it *is* the release clamp), near the launcher in launch mode
 * (following the flight to measure the landing), behind the lane otherwise.
 * Its belly lamp is the reaction-time calibration light, and its projector
 * eye is the diegetic source of every AR overlay in the yard.
 */
export default function Scout({ sim, mass, dropHeight }: { sim: MotionSim; mass: MassId; dropHeight: number }) {
  const g = useRef<THREE.Group>(null)
  const rotors = useRef<THREE.Mesh[]>([])
  const lamp = useRef<THREE.MeshStandardMaterial>(null)
  const lampLight = useRef<THREE.PointLight>(null)
  const eye = useRef<THREE.MeshStandardMaterial>(null)
  const pos = useMemo(() => new THREE.Vector3(0, YARD_Y + 1.6, 1.2), [])
  const target = useMemo(() => new THREE.Vector3(), [])
  const meta = MASS_BY_ID[mass]
  const other = MASS_BY_ID[mass === 'steel' ? 'wood' : 'steel']

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = state.clock.elapsedTime
    // Where should Scout be?
    if (sim.mode === 'drop') {
      target.set(PAD_POS[0], PAD_POS[1] + 0.06 + BALL_RADIUS + dropHeight + 0.22, PAD_POS[2])
    } else if (sim.mode === 'launch') {
      const [ox, oz] = LAUNCH_ORIGIN
      if (sim.launching || (sim.flight && sim.time - sim.launchStartAt < sim.flight.T + 2)) {
        target.set(ox + sim.projX, YARD_Y + Math.max(1.1, sim.projY + 0.8), oz + 0.9)
      } else {
        target.set(ox + 0.6, YARD_Y + 1.5, oz + 1.1)
      }
    } else {
      target.set(worldX(sim.rolling ? sim.ballX : 0.6), YARD_Y + 1.35, 1.15)
    }
    const k = 1 - Math.exp(-dt * (sim.launching ? 5 : 2.2))
    pos.lerp(target, k)
    if (g.current) {
      g.current.position.set(pos.x, pos.y + Math.sin(t * 2.1) * 0.03, pos.z)
      g.current.rotation.y = Math.sin(t * 0.7) * 0.15 + (sim.mode === 'launch' ? -0.4 : 0)
      g.current.rotation.z = THREE.MathUtils.clamp((target.x - pos.x) * 0.25, -0.3, 0.3)
    }
    for (const r of rotors.current) if (r) r.rotation.y += dt * 40
    if (lamp.current) lamp.current.emissiveIntensity = sim.lampOn ? 4 : 0.15
    if (lampLight.current) lampLight.current.intensity = sim.lampOn ? 4 : 0
    if (eye.current) eye.current.emissiveIntensity = sim.visionOn ? 1.6 + Math.sin(t * 3) * 0.3 : 0.4
  })

  const holdBalls = sim.mode === 'drop' && !sim.dropping && sim.landedAt === null
  const rotorPos: Array<[number, number]> = [
    [-0.17, -0.17],
    [-0.17, 0.17],
    [0.17, -0.17],
    [0.17, 0.17],
  ]
  return (
    <group ref={g}>
      {/* Body */}
      <mesh castShadow>
        <sphereGeometry args={[0.13, 24, 18]} />
        <meshStandardMaterial color="#EDE6D6" roughness={0.35} metalness={0.15} />
      </mesh>
      <mesh position={[0, -0.02, 0]}>
        <cylinderGeometry args={[0.15, 0.11, 0.09, 24]} />
        <meshStandardMaterial color="#2E3A42" roughness={0.5} metalness={0.4} />
      </mesh>
      {/* Projector eye */}
      <mesh position={[0.1, 0.02, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <cylinderGeometry args={[0.045, 0.055, 0.05, 20]} />
        <meshStandardMaterial ref={eye} color="#0E2A2E" emissive={HOLO} emissiveIntensity={1.2} toneMapped={false} />
      </mesh>
      {/* Arms + rotors */}
      {rotorPos.map(([x, z], i) => (
        <group key={i} position={[x, 0.05, z]}>
          <mesh position={[-x * 0.35, -0.01, -z * 0.35]} rotation={[0, Math.atan2(-x, -z), Math.PI / 2]}>
            <cylinderGeometry args={[0.012, 0.012, 0.16, 8]} />
            <meshStandardMaterial color="#3E4650" roughness={0.5} metalness={0.5} />
          </mesh>
          <mesh
            ref={(el) => {
              if (el) rotors.current[i] = el
            }}
            position={[0, 0.03, 0]}
          >
            <boxGeometry args={[0.16, 0.006, 0.02]} />
            <meshStandardMaterial color="#9AA4AE" roughness={0.4} metalness={0.5} transparent opacity={0.8} />
          </mesh>
          <mesh position={[0, 0.01, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 0.03, 12]} />
            <meshStandardMaterial color="#C13B33" roughness={0.5} />
          </mesh>
        </group>
      ))}
      {/* Belly lamp — the calibration light */}
      <mesh position={[0, -0.1, 0]}>
        <sphereGeometry args={[0.045, 20, 14]} />
        <meshStandardMaterial ref={lamp} color="#FFE9A8" emissive="#FFD25A" emissiveIntensity={0.15} toneMapped={false} />
      </mesh>
      <pointLight ref={lampLight} color="#FFD98A" intensity={0} distance={4} decay={2} position={[0, -0.2, 0]} />
      {/* The balls it is about to drop */}
      {holdBalls && (
        <>
          <mesh position={[-0.12, -0.16, 0]}>
            <sphereGeometry args={[BALL_RADIUS, 20, 14]} />
            <meshStandardMaterial color={meta.color} roughness={meta.metal ? 0.25 : 0.7} metalness={meta.metal ? 0.85 : 0} />
          </mesh>
          <mesh position={[0.12, -0.16, 0]}>
            <sphereGeometry args={[BALL_RADIUS, 20, 14]} />
            <meshStandardMaterial color={other.color} roughness={other.metal ? 0.25 : 0.7} metalness={other.metal ? 0.85 : 0} />
          </mesh>
        </>
      )}
    </group>
  )
}
