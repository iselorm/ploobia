import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { EPISODE_IDS, EPISODES, type EpisodeId, type Vocab } from '@/lib/physics'
import { FLOOR, Label } from './objects'

/**
 * The shelf along the back wall. It is the map of the whole journey and the
 * only navigation the room has: every episode is one object on it. Landed
 * episodes sit in colour with a tick; the current one glows; the ones ahead
 * are silhouettes, so the length of the journey is visible without anything
 * unlearned being playable; and an episode whose prerequisites are missing
 * (a teacher deep link) is greyed. Tap any playable object to replay.
 *
 * After A3 the shelf grows a door: the Motion Yard's benches, where
 * "measure it properly" lives.
 */

export const SHELF_Z = -3.3
export const SHELF_Y = FLOOR + 1.05
const SLOT_W = 0.62

export type SlotState = 'done' | 'current' | 'open' | 'ahead' | 'locked'

interface Props {
  current: EpisodeId
  states: Record<EpisodeId, SlotState>
  doorOpen: boolean
  vocab: Vocab
  onSelect: (id: EpisodeId) => void
  onDoor: () => void
  /** The object that just landed drifts up to its slot. */
  landing: EpisodeId | null
}

const TINT: Record<SlotState, string> = {
  done: '#2E6DA8',
  current: '#E8A33D',
  open: '#7FA6CC',
  ahead: '#2A3542',
  locked: '#7A8390',
}

/** A small emblem per episode: the object of that episode, in miniature. */
function Emblem({ id, color }: { id: EpisodeId; color: string }) {
  const mat = <meshStandardMaterial color={color} roughness={0.6} />
  switch (id) {
    case 'a1':
      return (
        <group>
          <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.36, 0.05]} />
            {mat}
          </mesh>
          <mesh position={[-0.14, 0.12, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.22, 8]} />
            {mat}
          </mesh>
        </group>
      )
    case 'a2':
      return (
        <group>
          <mesh position={[0, 0.12, 0]}>
            <torusGeometry args={[0.1, 0.025, 8, 20]} />
            {mat}
          </mesh>
          <mesh position={[0, 0.12, 0]}>
            <boxGeometry args={[0.02, 0.09, 0.02]} />
            {mat}
          </mesh>
        </group>
      )
    case 'a3':
      return (
        <mesh position={[0, 0.14, 0]}>
          <boxGeometry args={[0.32, 0.22, 0.03]} />
          {mat}
        </mesh>
      )
    case 'a4':
      return (
        <group>
          <mesh position={[-0.02, 0.06, 0]}>
            <boxGeometry args={[0.24, 0.05, 0.05]} />
            {mat}
          </mesh>
          <mesh position={[0.14, 0.06, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <coneGeometry args={[0.07, 0.12, 10]} />
            {mat}
          </mesh>
        </group>
      )
    case 'a5':
      return (
        <group>
          <mesh position={[0, 0.06, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.015, 0.015, 0.4, 6]} />
            {mat}
          </mesh>
          <mesh position={[0, 0.06, 0]}>
            <sphereGeometry args={[0.05, 12, 8]} />
            {mat}
          </mesh>
        </group>
      )
    case 'a6':
      return (
        <mesh position={[0, 0.11, 0]}>
          <boxGeometry args={[0.2, 0.2, 0.2]} />
          {mat}
        </mesh>
      )
    case 'a7':
      return (
        <group>
          <mesh position={[-0.08, 0.1, 0]}>
            <sphereGeometry args={[0.08, 14, 10]} />
            {mat}
          </mesh>
          <mesh position={[0.1, 0.07, 0]}>
            <sphereGeometry args={[0.055, 14, 10]} />
            {mat}
          </mesh>
        </group>
      )
  }
}

export default function Shelf({ current, states, doorOpen, vocab, onSelect, onDoor, landing }: Props) {
  const n = EPISODE_IDS.length + 1
  const x0 = -((n - 1) * SLOT_W) / 2
  const glow = useRef<THREE.PointLight>(null)
  const landingRef = useRef<THREE.Group>(null)
  const landStart = useRef(-1)
  const slots = useMemo(() => EPISODE_IDS.map((id, i) => ({ id, x: x0 + i * SLOT_W })), [x0])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (glow.current) glow.current.intensity = 0.9 + Math.sin(t * 2.2) * 0.3
    if (landingRef.current) {
      if (landing && landStart.current < 0) landStart.current = t
      if (!landing) landStart.current = -1
      const k = landing ? Math.min(1, (t - landStart.current) / 1.1) : 1
      const ease = 1 - Math.pow(1 - k, 3)
      landingRef.current.position.y = SHELF_Y - 0.9 * (1 - ease)
      landingRef.current.scale.setScalar(0.6 + 0.4 * ease)
    }
  })

  const tap = (e: ThreeEvent<PointerEvent>, id: EpisodeId) => {
    e.stopPropagation()
    const s = states[id]
    if (s === 'ahead' || s === 'locked') return
    onSelect(id)
  }

  return (
    <group name="shelf">
      {/* The plank and its brackets */}
      <mesh position={[0, SHELF_Y - 0.03, SHELF_Z]} castShadow receiveShadow>
        <boxGeometry args={[n * SLOT_W + 0.4, 0.06, 0.5]} />
        <meshStandardMaterial color="#8A6A44" roughness={0.85} />
      </mesh>
      {[-1, 1].map((k) => (
        <mesh key={k} position={[(k * (n * SLOT_W + 0.2)) / 2, (FLOOR + SHELF_Y) / 2 - 0.03, SHELF_Z]} castShadow>
          <boxGeometry args={[0.07, SHELF_Y - FLOOR, 0.07]} />
          <meshStandardMaterial color="#5C4A35" roughness={0.85} />
        </mesh>
      ))}
      {slots.map(({ id, x }) => {
        const state = states[id]
        const color = TINT[state]
        const isLanding = landing === id
        return (
          <group key={id} position={[x, isLanding ? 0 : SHELF_Y, SHELF_Z]} ref={isLanding ? landingRef : undefined} name={`shelf-${id}`}>
            <Emblem id={id} color={color} />
            {state === 'done' && <Label text="✓" color="#3E7C43" size={0.18} position={[0.2, 0.34, 0.05]} />}
            {state === 'current' && <pointLight ref={glow} position={[0, 0.3, 0.3]} color="#FFD98A" intensity={1} distance={1.4} decay={2} />}
            <Label text={EPISODES[id].short} color={state === 'ahead' ? '#8A93A0' : '#2A2823'} size={0.15} position={[0, -0.16, 0.28]} billboard />
            {/* Tap volume */}
            <mesh position={[0, 0.15, 0.05]} onPointerDown={(e) => tap(e, id)} name={`shelf-tap-${id}`}>
              <boxGeometry args={[0.55, 0.5, 0.5]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </group>
        )
      })}
      {/* The door to the Yard */}
      <group position={[x0 + EPISODE_IDS.length * SLOT_W, SHELF_Y, SHELF_Z]} name="shelf-door" visible={doorOpen}>
        <mesh position={[0, 0.2, 0]} castShadow>
          <boxGeometry args={[0.26, 0.4, 0.04]} />
          <meshStandardMaterial color="#2E6DA8" roughness={0.6} emissive="#2E6DA8" emissiveIntensity={0.25} />
        </mesh>
        <mesh position={[0.08, 0.2, 0.03]}>
          <sphereGeometry args={[0.02, 8, 6]} />
          <meshStandardMaterial color="#E8A33D" />
        </mesh>
        <Label text={vocab === 'simple' ? 'Measure it' : 'The Yard'} color="#2A2823" size={0.15} position={[0, -0.16, 0.28]} billboard />
        <mesh
          position={[0, 0.2, 0.05]}
          onPointerDown={(e) => {
            e.stopPropagation()
            if (doorOpen) onDoor()
          }}
          name="shelf-tap-door"
        >
          <boxGeometry args={[0.55, 0.5, 0.5]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
      <pointLight position={[0, SHELF_Y + 1.0, SHELF_Z + 0.9]} color="#FFF2D8" intensity={0.9} distance={5} decay={2} />
      {/* The unused `current` prop keeps the API honest for the suite's shelf assertions. */}
      <group name={`shelf-current-${current}`} />
    </group>
  )
}
