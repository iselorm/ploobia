import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import PerfProbe from '@/components/PerfProbe'
import YardWorld from '@/components/motion/YardWorld'
import PostFX from '@/components/photo/world/PostFX'
import { getQualityCaps, reportFrame, useQualityCaps } from '@/lib/quality'
import { registerCamera } from '@/lib/input'
import type { MotionSim, WorldId } from '@/lib/motion'
import { FLOORS, stepPhysics, type EpisodeId, type PhysicsSim, type Vocab } from '@/lib/physics'
import type { Projected } from '@/components/hud/EquationCard'
import { EPISODE_COMPONENTS } from './episodes'
import Shelf, { type SlotState } from './Shelf'
import { FLOOR, type AnchorMap } from './objects'

/**
 * The room. One canvas, the Yard's meadow underneath (its gravity retune is
 * what A7 turns), the shelf at the back, and exactly one episode object on
 * the floor. The camera has an authored shot per episode and tweens to it on
 * arrival; the rest of the time OrbitControls owns it — free orbit and zoom
 * always, per Selorm.
 */

export interface ScreenMap {
  [id: string]: Projected
}

interface Shot {
  position: [number, number, number]
  target: [number, number, number]
}

const SHOTS: Record<EpisodeId, Shot> = {
  a1: { position: [0.5, 1.7, 4.4], target: [0, FLOOR + 0.2, 0] },
  a2: { position: [0.3, 2.1, 5.0], target: [0, FLOOR + 0.2, 0.1] },
  a3: { position: [0.8, 1.8, 5.6], target: [0, FLOOR + 0.6, -0.6] },
  a4: { position: [0.4, 1.9, 4.9], target: [0, FLOOR + 0.2, 0] },
  a5: { position: [0.2, 2.2, 5.8], target: [0, FLOOR + 0.3, 0] },
  a6: { position: [0.4, 1.9, 5.3], target: [0, FLOOR + 0.2, 0] },
  a7: { position: [1.3, 1.3, 3.5], target: [0, FLOOR + 0.55, 0] },
}

function Ticker({ sim }: { sim: PhysicsSim }) {
  useFrame((_, rawDt) => {
    reportFrame(rawDt)
    stepPhysics(sim, Math.min(rawDt, 0.25))
  })
  return null
}

interface OrbitLike {
  target: THREE.Vector3
  enabled: boolean
  update: () => void
}

/** Tween to the episode's shot on arrival; otherwise leave the camera alone. */
function RoomCamera({ episode, portrait }: { episode: EpisodeId; portrait: boolean }) {
  const controls = useThree((s) => s.controls) as OrbitLike | null
  const camera = useThree((s) => s.camera)
  const from = useMemo(() => ({ p: new THREE.Vector3(), t: new THREE.Vector3() }), [])
  const to = useMemo(() => ({ p: new THREE.Vector3(), t: new THREE.Vector3() }), [])
  const k = useRef(1)
  const lastEp = useRef<EpisodeId | null>(null)
  const pending = useRef({ dx: 0, dy: 0, zoom: 0 })

  useEffect(
    () =>
      registerCamera({
        orbit: (dx, dy) => {
          pending.current.dx += dx
          pending.current.dy += dy
        },
        zoom: (dz) => {
          pending.current.zoom += dz
        },
      }),
    [],
  )

  useFrame((_, dt) => {
    if (!controls) return
    if (lastEp.current !== episode) {
      lastEp.current = episode
      const shot = SHOTS[episode]
      from.p.copy(camera.position)
      from.t.copy(controls.target)
      to.p.set(...shot.position)
      to.t.set(...shot.target)
      if (portrait) {
        // Pull back so the whole object fits the narrow frame.
        to.p.sub(to.t).multiplyScalar(1.45).add(to.t)
        to.p.y += 0.3
      }
      k.current = 0
    }
    if (k.current < 1) {
      k.current = Math.min(1, k.current + dt / 1.1)
      const e = 1 - Math.pow(1 - k.current, 3)
      camera.position.lerpVectors(from.p, to.p, e)
      controls.target.lerpVectors(from.t, to.t, e)
      controls.enabled = k.current >= 1
      controls.update()
    }
    // Gamepad / keyboard orbit deltas, applied once per frame.
    const p = pending.current
    if (p.dx || p.dy || p.zoom) {
      const off = camera.position.clone().sub(controls.target)
      const s = new THREE.Spherical().setFromVector3(off)
      s.theta -= p.dx * 0.02
      s.phi = Math.max(0.15, Math.min(Math.PI / 2 - 0.05, s.phi - p.dy * 0.02))
      s.radius = Math.max(1.5, Math.min(14, s.radius * (1 + p.zoom * 0.05)))
      camera.position.copy(controls.target).add(off.setFromSpherical(s))
      controls.update()
      p.dx = p.dy = p.zoom = 0
    }
  })
  return null
}

/** Projects every anchor into screen pixels each frame, for the card's arrows. */
function Projection({ anchors, screen }: { anchors: AnchorMap; screen: ScreenMap }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    for (const id of Object.keys(anchors)) {
      v.copy(anchors[id]).project(camera)
      const onScreen = v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1
      const entry = screen[id] ?? (screen[id] = { x: 0, y: 0, onScreen: true })
      entry.x = ((v.x + 1) / 2) * size.width
      entry.y = ((1 - v.y) / 2) * size.height
      entry.onScreen = onScreen
    }
  })
  return null
}

function WorldShim({ sim, shim }: { sim: PhysicsSim; shim: MotionSim }) {
  useFrame(() => {
    const s = shim as unknown as { world: WorldId; time: number; paused: boolean }
    const airless = sim.episode === 'a6' && FLOORS[sim.a6.floor].airless
    s.world = airless ? 'moon' : sim.world
    s.time = sim.time
    s.paused = sim.paused
  })
  return null
}

/** Exposes the scene graph to the verify suite. */
function Expose({ sim }: { sim: PhysicsSim }) {
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const w = window as unknown as { __physicsScene?: THREE.Scene; __physicsSim?: PhysicsSim }
    w.__physicsScene = scene
    w.__physicsSim = sim
  }, [scene, sim])
  return null
}

interface Props {
  sim: PhysicsSim
  episode: EpisodeId
  vocab: Vocab
  live: boolean
  pulseId: string | null
  anchors: AnchorMap
  screen: ScreenMap
  portrait: boolean
  shelfStates: Record<EpisodeId, SlotState>
  doorOpen: boolean
  landing: EpisodeId | null
  onSelect: (id: EpisodeId) => void
  onDoor: () => void
  onContextLost: () => void
}

export default function PhysicsScene({ sim, episode, vocab, live, pulseId, anchors, screen, portrait, shelfStates, doorOpen, landing, onSelect, onDoor, onContextLost }: Props) {
  const quality = useQualityCaps()
  const Episode = EPISODE_COMPONENTS[episode]
  // The Yard's world reads {world, time, paused} off a MotionSim; the room feeds
  // it a shim. A6's airless notch borrows the Moon's night sky and dust — the
  // gravity underneath stays Earth's, and the chip says which two things left.
  const shim = useMemo(() => ({ world: 'earth' as WorldId, time: 0, paused: false }) as unknown as MotionSim, [])
  return (
    <Canvas
      dpr={[1, quality.maxDpr]}
      camera={{ fov: 42, near: 0.05, far: 400, position: SHOTS.a1.position }}
      gl={{ antialias: getQualityCaps().antialias, powerPreference: 'high-performance' }}
      shadows={quality.shadows ? { type: THREE.PCFSoftShadowMap } : false}
      style={{ position: 'fixed', inset: 0 }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.0
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault()
          onContextLost()
        })
      }}
    >
      <Ticker sim={sim} />
      <WorldShim sim={sim} shim={shim} />
      <PerfProbe cabinet="physics" />
      <Expose sim={sim} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.12} minDistance={1.5} maxDistance={14} maxPolarAngle={Math.PI / 2 - 0.05} target={SHOTS.a1.target} />
      <RoomCamera episode={episode} portrait={portrait} />
      <Projection anchors={anchors} screen={screen} />
      <YardWorld sim={shim} venue="outdoors" />
      <Shelf current={episode} states={shelfStates} doorOpen={doorOpen} vocab={vocab} onSelect={onSelect} onDoor={onDoor} landing={landing} />
      <Episode key={episode} sim={sim} anchors={anchors} pulseId={pulseId} vocab={vocab} live={live} />
      <PostFX />
    </Canvas>
  )
}
