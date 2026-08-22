import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useQualityCaps } from '@/lib/quality'
import { WorldState, GROUND_Y } from '@/lib/world'
import { PLANET_PRESETS } from '@/lib/yard'
import { WORLD_BY_ID, type MotionSim } from '@/lib/motion'
import type { PhotoSim } from '@/lib/photo'
import Atmosphere from '@/components/photo/world/Atmosphere'
import Terrain from '@/components/photo/world/Terrain'
import Grass from '@/components/photo/world/Grass'
import Stones from '@/components/photo/world/Stones'
import { woodTexture } from './textures'

/** The clearing floor — everything in the yard stands on this. */
export const YARD_Y = GROUND_Y

/* ------------------------------------------------------------------ */
/* Outdoors — the Cinematic Lab world, retuned by the gravity dial     */
/* ------------------------------------------------------------------ */

function OutdoorVenue({ sim }: { sim: MotionSim }) {
  const world = useMemo(() => new WorldState(), [])
  // The garden world components read {light, time, water, paused} off the
  // photosynthesis sim; the yard feeds them a shim driven by the planets.
  const shim = useMemo(() => ({ time: 0, water: 0.6, light: 0.85, paused: false }) as unknown as PhotoSim, [])
  const sunLamp = useRef<THREE.DirectionalLight>(null)
  const boost = useRef(0)

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const preset = PLANET_PRESETS[sim.world]
    const k = 1 - Math.exp(-dt * 2.2)
    world.step(preset, preset.light, k)
    const s = shim as unknown as { time: number; light: number; paused: boolean }
    s.time = sim.time
    s.light += (preset.light - s.light) * k
    s.paused = sim.paused
    // Airless worlds: harsh white extra sun so the kit still reads at night-sky noon.
    boost.current += (preset.boost - boost.current) * k
    if (sunLamp.current) sunLamp.current.intensity = boost.current
  })

  return (
    <group>
      <Atmosphere sim={shim} world={world} />
      <Terrain world={world} />
      <Grass sim={shim} world={world} />
      <Stones world={world} />
      <directionalLight ref={sunLamp} position={[14, 22, 6]} color="#FFFFFF" intensity={0} />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Workshop — a bright maker-space hangar. Never the grey room again.  */
/* ------------------------------------------------------------------ */

const HANGAR_W = 26
const HANGAR_D = 16
const HANGAR_H = 5.2

function WorkshopVenue({ sim }: { sim: MotionSim }) {
  const { scene } = useThree()
  const quality = useQualityCaps()
  const floor = useMemo(() => {
    const t = woodTexture()
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(8, 5)
    return t
  }, [])
  const bg = useMemo(() => new THREE.Color('#E7E0D2'), [])
  const fog = useMemo(() => new THREE.Fog('#E7E0D2', 24, 60), [])
  const skyPanels = useRef<THREE.MeshBasicMaterial>(null)
  const skyColor = useMemo(() => new THREE.Color('#C8E3F2'), [])

  useEffect(() => {
    const prevBg = scene.background
    const prevFog = scene.fog
    scene.background = bg
    scene.fog = fog
    return () => {
      scene.background = prevBg
      scene.fog = prevFog
    }
  }, [scene, bg, fog])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    // The skylights glow with the chosen world's sky — the dial is felt indoors too.
    const w = WORLD_BY_ID[sim.world]
    skyColor.lerp(new THREE.Color(w.sky[1]), 1 - Math.exp(-dt * 2.4))
    if (skyPanels.current) skyPanels.current.color.copy(skyColor)
  })

  const columns: Array<[number, number]> = []
  for (let i = -2; i <= 2; i++) {
    columns.push([i * (HANGAR_W / 5), -HANGAR_D / 2 + 0.3])
    columns.push([i * (HANGAR_W / 5), HANGAR_D / 2 - 0.3])
  }
  const beams = [-2, -1, 0, 1, 2].map((i) => i * (HANGAR_W / 5))

  return (
    <group>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, YARD_Y, 0]} receiveShadow={quality.shadows}>
        <planeGeometry args={[HANGAR_W, HANGAR_D]} />
        <meshStandardMaterial map={floor} roughness={0.7} metalness={0.02} />
      </mesh>
      {/* Low perimeter walls (open above — light floods in) */}
      {[
        [0, -HANGAR_D / 2, HANGAR_W, 0],
        [0, HANGAR_D / 2, HANGAR_W, 0],
      ].map(([x, z, w], i) => (
        <mesh key={`w${i}`} position={[x, YARD_Y + 1.1, z]}>
          <boxGeometry args={[w, 2.2, 0.16]} />
          <meshStandardMaterial color="#EFE7D6" roughness={0.9} />
        </mesh>
      ))}
      {[
        [-HANGAR_W / 2, 0],
        [HANGAR_W / 2, 0],
      ].map(([x, z], i) => (
        <mesh key={`e${i}`} position={[x, YARD_Y + 1.1, z]}>
          <boxGeometry args={[0.16, 2.2, HANGAR_D]} />
          <meshStandardMaterial color="#EFE7D6" roughness={0.9} />
        </mesh>
      ))}
      {/* Columns and roof frame */}
      {columns.map(([x, z], i) => (
        <mesh key={`c${i}`} position={[x, YARD_Y + HANGAR_H / 2, z]}>
          <boxGeometry args={[0.22, HANGAR_H, 0.22]} />
          <meshStandardMaterial color="#B9834C" roughness={0.6} />
        </mesh>
      ))}
      {beams.map((x, i) => (
        <mesh key={`b${i}`} position={[x, YARD_Y + HANGAR_H, 0]}>
          <boxGeometry args={[0.18, 0.3, HANGAR_D]} />
          <meshStandardMaterial color="#A97440" roughness={0.6} />
        </mesh>
      ))}
      {/* Skylight panels between the beams, glowing with the chosen sky */}
      {beams.slice(0, -1).map((x, i) => (
        <mesh key={`s${i}`} position={[x + HANGAR_W / 10, YARD_Y + HANGAR_H + 0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[HANGAR_W / 5 - 0.4, HANGAR_D - 1]} />
          <meshBasicMaterial ref={i === 0 ? skyPanels : undefined} color="#C8E3F2" side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ))}
      {/* Shelves of parts along the back wall */}
      {[-8, -4.4, 4.4, 8].map((x, i) => (
        <group key={`sh${i}`} position={[x, YARD_Y, -HANGAR_D / 2 + 0.75]}>
          <mesh position={[0, 0.9, 0]}>
            <boxGeometry args={[2.6, 1.8, 0.5]} />
            <meshStandardMaterial color="#C9A46E" roughness={0.75} />
          </mesh>
          {[0.35, 0.95, 1.55].map((y, j) => (
            <mesh key={j} position={[0, y, 0.28]}>
              <boxGeometry args={[2.5, 0.05, 0.06]} />
              <meshStandardMaterial color="#8A6A44" roughness={0.8} />
            </mesh>
          ))}
          {[0.52, 1.12, 1.72].map((y, j) => (
            <mesh key={`box${j}`} position={[((i + j) % 3) * 0.6 - 0.6, y, 0.16]}>
              <boxGeometry args={[0.42, 0.28, 0.3]} />
              <meshStandardMaterial color={['#5B7EA6', '#A65B5B', '#6E9A5B'][(i + j) % 3]} roughness={0.7} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Light rig: bright, warm, calm */}
      <ambientLight intensity={0.5} color="#FFF6E4" />
      <hemisphereLight args={['#F2EEE2', '#B79A6E', 0.85]} />
      <directionalLight
        position={[6, 9, 4]}
        intensity={1.5}
        color="#FFF2D8"
        castShadow={quality.shadows}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-bias={-0.0005}
      />
      {[-6, 0, 6].map((x, i) => (
        <pointLight key={i} position={[x, YARD_Y + HANGAR_H - 0.6, 0.5]} intensity={1.1} color="#FFEFD2" distance={12} decay={2} />
      ))}
    </group>
  )
}

export default function YardWorld({ sim, venue }: { sim: MotionSim; venue: 'outdoors' | 'workshop' }) {
  return venue === 'workshop' ? <WorkshopVenue sim={sim} /> : <OutdoorVenue sim={sim} />
}
