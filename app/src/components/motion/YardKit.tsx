import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useQualityCaps } from '@/lib/quality'
import {
  BALL_RADIUS,
  MARKERS,
  MASS_BY_ID,
  SURFACE_BY_ID,
  TRACK_LEN,
  WORLDS,
  type MassId,
  type MotionSim,
  type SurfaceId,
  type WorldId,
} from '@/lib/motion'
import { YARD_Y } from './YardWorld'
import { dialAngle, dialTexture, edgeScaleTexture, gateDisplay, gMeterTexture, holoBoard, stopwatchFace } from './textures'

/* World-space layout of the yard, shared with the vision layer. */
export const START_X = -1.05
export const worldX = (d: number) => START_X + d
const LANE_X0 = -1.6
const LANE_X1 = worldX(TRACK_LEN) + 0.18
export const LANE_Z = 0
const LANE_W = 0.52
export const LANE_TOP = YARD_Y + 0.022
/** Height of the car's centre above the clearing floor. */
export const CAR_Y = LANE_TOP + 0.062
export const STOPWATCH_POS: [number, number, number] = [START_X - 0.42, YARD_Y + 0.78, 0.58]
export const PAD_POS: [number, number, number] = [-0.2, YARD_Y, -1.7]
export const TOTEM_POS: [number, number, number] = [-2.7, YARD_Y, -0.9]
export const CHEST_POS: [number, number, number] = [2.5, YARD_Y, -1.5]

const HOLO = '#5FE0D2'

/* ------------------------------------------------------------------ */
/* The lane — a painted racing strip with glowing lines                */
/* ------------------------------------------------------------------ */

function Lane({ surface, target }: { surface: SurfaceId; target: number }) {
  const meta = SURFACE_BY_ID[surface]
  const scale = useMemo(() => edgeScaleTexture(LANE_X1 - LANE_X0, (START_X - LANE_X0) / (LANE_X1 - LANE_X0)), [])
  const quality = useQualityCaps()
  const mid = (LANE_X0 + LANE_X1) / 2
  const len = LANE_X1 - LANE_X0
  return (
    <group>
      {/* Bed */}
      <mesh position={[mid, YARD_Y + 0.008, LANE_Z]} receiveShadow={quality.shadows}>
        <boxGeometry args={[len, 0.024, LANE_W + 0.22]} />
        <meshStandardMaterial color="#6B6258" roughness={0.9} />
      </mesh>
      {/* Running surface */}
      <mesh position={[mid, LANE_TOP - 0.005, LANE_Z]} receiveShadow={quality.shadows}>
        <boxGeometry args={[len - 0.06, 0.012, LANE_W]} />
        <meshStandardMaterial
          color={meta.color}
          roughness={surface === 'smooth' ? 0.2 : 0.95}
          metalness={surface === 'smooth' ? 0.35 : 0}
        />
      </mesh>
      {/* Luminous edge lines */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[mid, LANE_TOP + 0.002, LANE_Z + (s * (LANE_W + 0.06)) / 2]}>
          <boxGeometry args={[len - 0.05, 0.006, 0.025]} />
          <meshStandardMaterial color={HOLO} emissive={HOLO} emissiveIntensity={0.9} toneMapped={false} />
        </mesh>
      ))}
      {/* Painted scale along the near edge */}
      <mesh position={[mid, LANE_TOP + 0.003, LANE_Z + LANE_W / 2 + 0.19]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[len, 0.14]} />
        <meshStandardMaterial map={scale} roughness={0.7} transparent />
      </mesh>
      {/* Start line */}
      <mesh position={[worldX(0), LANE_TOP + 0.004, LANE_Z]}>
        <boxGeometry args={[0.016, 0.006, LANE_W]} />
        <meshStandardMaterial color="#FF4A3D" emissive="#FF4A3D" emissiveIntensity={1.4} toneMapped={false} />
      </mesh>
      {/* Marker lines; the one being timed to glows gold */}
      {MARKERS.map((d) => {
        const on = Math.abs(d - target) < 1e-6
        return (
          <mesh key={d} position={[worldX(d), LANE_TOP + 0.004, LANE_Z]}>
            <boxGeometry args={[on ? 0.02 : 0.012, 0.006, LANE_W]} />
            <meshStandardMaterial
              color={on ? '#FFD25A' : '#3A3F46'}
              emissive={on ? '#FFC94A' : '#000000'}
              emissiveIntensity={on ? 1.8 : 0}
              toneMapped={!on}
            />
          </mesh>
        )
      })}
      {/* End stop */}
      <mesh position={[LANE_X1 - 0.05, LANE_TOP + 0.045, LANE_Z]}>
        <boxGeometry args={[0.05, 0.1, LANE_W]} />
        <meshStandardMaterial color="#C13B33" roughness={0.6} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* The toy car                                                        */
/* ------------------------------------------------------------------ */

function Car({ sim, mass }: { sim: MotionSim; mass: MassId }) {
  const g = useRef<THREE.Group>(null)
  const wheels = useRef<THREE.Mesh[]>([])
  const meta = MASS_BY_ID[mass]
  const quality = useQualityCaps()
  useFrame(() => {
    if (!g.current) return
    g.current.position.set(worldX(sim.ballX), LANE_TOP, LANE_Z)
    for (const w of wheels.current) if (w) w.rotation.z = -sim.ballSpin
  })
  const wheelPos: Array<[number, number]> = [
    [-0.075, -0.075],
    [-0.075, 0.075],
    [0.075, -0.075],
    [0.075, 0.075],
  ]
  return (
    <group ref={g}>
      {/* Body */}
      <mesh position={[0, 0.062, 0]} castShadow={quality.shadows}>
        <boxGeometry args={[0.21, 0.055, 0.11]} />
        <meshStandardMaterial color={meta.color} roughness={meta.metal ? 0.3 : 0.65} metalness={meta.metal ? 0.75 : 0.05} />
      </mesh>
      {/* Cabin */}
      <mesh position={[-0.02, 0.1, 0]} castShadow={quality.shadows}>
        <boxGeometry args={[0.1, 0.05, 0.09]} />
        <meshStandardMaterial color="#20313F" roughness={0.25} metalness={0.4} />
      </mesh>
      {/* Nose stripe */}
      <mesh position={[0.09, 0.075, 0]}>
        <boxGeometry args={[0.035, 0.012, 0.112]} />
        <meshStandardMaterial color={HOLO} emissive={HOLO} emissiveIntensity={0.7} toneMapped={false} />
      </mesh>
      {wheelPos.map(([x, z], i) => (
        <mesh
          key={i}
          ref={(el) => {
            if (el) wheels.current[i] = el
          }}
          position={[x, 0.03, z]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[0.03, 0.03, 0.02, 20]} />
          <meshStandardMaterial color="#22252A" roughness={0.85} />
        </mesh>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Timing gates — sector arches with a split display                   */
/* ------------------------------------------------------------------ */

function GateArch({ sim, d, split, lit }: { sim: MotionSim; d: number; split: string; lit: boolean }) {
  const disp = useMemo(() => gateDisplay(), [])
  const beam = useRef<THREE.MeshBasicMaterial>(null)
  useEffect(() => {
    disp.draw(split, lit)
  }, [disp, split, lit])
  useFrame(() => {
    const t = sim.crossAt[String(d)]
    const flash = sim.rolling && t != null && Math.abs(sim.time - t) < 0.12
    if (beam.current) beam.current.color.set(flash ? '#FFFFFF' : '#FF4A3D')
  })
  const H = 0.42
  return (
    <group position={[worldX(d), LANE_TOP, LANE_Z]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, H / 2, (s * (LANE_W + 0.18)) / 2]}>
          <boxGeometry args={[0.035, H, 0.035]} />
          <meshStandardMaterial color="#2B3038" roughness={0.5} metalness={0.4} />
        </mesh>
      ))}
      {/* Crossbar with the split display */}
      <mesh position={[0, H + 0.05, 0]}>
        <boxGeometry args={[0.04, 0.1, LANE_W + 0.215]} />
        <meshStandardMaterial color="#2B3038" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position={[0.026, H + 0.05, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.34, 0.085]} />
        <meshBasicMaterial map={disp.texture} transparent toneMapped={false} />
      </mesh>
      {/* Beam */}
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[0.005, 0.005, LANE_W + 0.14]} />
        <meshBasicMaterial ref={beam} color="#FF4A3D" toneMapped={false} />
      </mesh>
    </group>
  )
}

function TimingGates({ sim, unlocked, gateDist }: { sim: MotionSim; unlocked: boolean; gateDist: number }) {
  if (!unlocked) return null
  const snap = sim.gateSnapshot
  const has = snap !== null && Math.abs(snap.d - gateDist) < 1e-6
  return (
    <group>
      <GateArch sim={sim} d={0} split="0.000" lit={has} />
      <GateArch sim={sim} d={gateDist} split={has ? `${snap!.t.toFixed(3)}` : '— s'} lit={has} />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Stopwatch on a tripod by the start line                             */
/* ------------------------------------------------------------------ */

function StopwatchPost({ sim }: { sim: MotionSim }) {
  const face = useMemo(() => stopwatchFace(), [])
  const ring = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(() => {
    const t = sim.swRunning ? Math.max(0, sim.time - sim.swStartAt) : sim.swElapsed
    const showFlick = sim.swFlick !== null && sim.time - sim.swFlickAt < 2.5
    face.draw(t, sim.swRunning, showFlick ? sim.swFlick : null)
    if (ring.current) ring.current.emissiveIntensity = sim.swRunning ? 0.9 : 0.05
  })
  const [px, py, pz] = STOPWATCH_POS
  return (
    <group>
      {/* Tripod */}
      {[0.5, 2.6, 4.7].map((a, i) => (
        <mesh key={i} position={[px + Math.cos(a) * 0.12, YARD_Y + (py - YARD_Y) / 2 - 0.05, pz + Math.sin(a) * 0.12]} rotation={[Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22]}>
          <cylinderGeometry args={[0.012, 0.016, py - YARD_Y - 0.08, 10]} />
          <meshStandardMaterial color="#3E4650" roughness={0.4} metalness={0.6} />
        </mesh>
      ))}
      <group position={[px, py, pz]} rotation={[-0.3, 0.4, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.085, 0.085, 0.026, 48]} />
          <meshStandardMaterial ref={ring} color="#3E4650" roughness={0.35} metalness={0.7} emissive="#39A05A" emissiveIntensity={0.05} />
        </mesh>
        <mesh position={[0, 0, 0.0135]}>
          <circleGeometry args={[0.076, 48]} />
          <meshStandardMaterial map={face.texture} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.095, 0]}>
          <cylinderGeometry args={[0.013, 0.013, 0.022, 16]} />
          <meshStandardMaterial color="#C13B33" roughness={0.4} metalness={0.4} />
        </mesh>
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Gravity totem — the dial and the g-meter                            */
/* ------------------------------------------------------------------ */

function GravityTotem({ world, extra, g }: { world: WorldId; extra: boolean; g: number }) {
  const list = useMemo(() => WORLDS.filter((w) => !w.extra || extra), [extra])
  const labels = useMemo(() => list.map((w) => w.label), [list])
  const face = useMemo(() => dialTexture(labels), [labels])
  const meter = useMemo(() => gMeterTexture(), [])
  const knob = useRef<THREE.Group>(null)
  const idx = Math.max(0, list.findIndex((w) => w.id === world))
  const target = dialAngle(idx, list.length)
  const angle = useRef(target)
  useEffect(() => {
    meter.draw(g)
  }, [meter, g])
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    angle.current += (target - angle.current) * (1 - Math.exp(-dt * 6))
    if (knob.current) knob.current.rotation.z = angle.current
  })
  const [tx, ty, tz] = TOTEM_POS
  return (
    <group position={[tx, ty, tz]} rotation={[0, 0.55, 0]}>
      {/* Pedestal */}
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[0.46, 1.1, 0.26]} />
        <meshStandardMaterial color="#7A8088" roughness={0.5} metalness={0.35} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.72, 0.06, 0.5]} />
        <meshStandardMaterial color="#33373E" roughness={0.7} />
      </mesh>
      {/* Dial */}
      <group position={[0, 0.82, 0.155]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.21, 0.21, 0.03, 48]} />
          <meshStandardMaterial color="#5B534A" roughness={0.6} metalness={0.2} />
        </mesh>
        <mesh position={[0, 0, 0.016]}>
          <circleGeometry args={[0.205, 48]} />
          <meshStandardMaterial map={face} roughness={0.7} />
        </mesh>
        <group ref={knob} position={[0, 0, 0.03]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.06, 0.065, 0.05, 32]} />
            <meshStandardMaterial color="#2B2B2B" roughness={0.4} metalness={0.5} />
          </mesh>
          <mesh position={[0, 0.04, 0.026]}>
            <boxGeometry args={[0.013, 0.065, 0.008]} />
            <meshStandardMaterial color="#F4EBD8" emissive="#F4EBD8" emissiveIntensity={0.4} />
          </mesh>
        </group>
      </group>
      {/* g-meter hologram above */}
      <mesh position={[0, 1.62, 0.02]}>
        <planeGeometry args={[0.34, 0.9]} />
        <meshBasicMaterial map={meter.texture} transparent toneMapped={false} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Holo-board — earned equations, written in light                     */
/* ------------------------------------------------------------------ */

function HoloBoard({ lines }: { lines: string[] }) {
  const board = useMemo(() => holoBoard(), [])
  const pane = useRef<THREE.Group>(null)
  useEffect(() => {
    board.draw(lines, 'Earned so far')
  }, [board, lines])
  useFrame(() => {
    if (pane.current) pane.current.position.y = 1.52 + Math.sin(performance.now() / 1400) * 0.015
  })
  return (
    <group position={[0.9, YARD_Y, -3.2]} rotation={[0, 0.18, 0]}>
      {[-0.95, 0.95].map((x) => (
        <mesh key={x} position={[x, 0.9, 0]}>
          <cylinderGeometry args={[0.03, 0.04, 1.8, 12]} />
          <meshStandardMaterial color="#33373E" roughness={0.5} metalness={0.5} />
        </mesh>
      ))}
      {[-0.95, 0.95].map((x) => (
        <mesh key={`t${x}`} position={[x, 1.82, 0]}>
          <sphereGeometry args={[0.045, 16, 12]} />
          <meshStandardMaterial color={HOLO} emissive={HOLO} emissiveIntensity={1.4} toneMapped={false} />
        </mesh>
      ))}
      <group ref={pane} position={[0, 1.52, 0]}>
        <mesh>
          <planeGeometry args={[1.84, 1.15]} />
          <meshBasicMaterial map={board.texture} transparent toneMapped={false} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Kit chest — dark until the segue, then it lights and opens          */
/* ------------------------------------------------------------------ */

function KitChest({ sim }: { sim: MotionSim }) {
  const lid = useRef<THREE.Group>(null)
  const hint = useRef<THREE.MeshStandardMaterial>(null)
  const open = useRef(0)
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const target = sim.drawerOpen ? 1 : 0
    open.current += (target - open.current) * (1 - Math.exp(-dt * 3))
    if (lid.current) lid.current.rotation.x = -open.current * 1.5
    if (hint.current) {
      const pulse = sim.drawerOpen ? 1.6 : 0.25 + 0.2 * (0.5 + 0.5 * Math.sin(performance.now() / 600))
      hint.current.emissiveIntensity = pulse
    }
  })
  const [cx, cy, cz] = CHEST_POS
  return (
    <group position={[cx, cy, cz]} rotation={[0, -0.5, 0]}>
      <mesh position={[0, 0.13, 0]} castShadow>
        <boxGeometry args={[0.52, 0.26, 0.34]} />
        <meshStandardMaterial color="#6E5136" roughness={0.8} />
      </mesh>
      <group position={[0, 0.26, -0.17]}>
        <group ref={lid}>
          <mesh position={[0, 0.03, 0.17]}>
            <boxGeometry args={[0.52, 0.06, 0.34]} />
            <meshStandardMaterial color="#7E5F40" roughness={0.75} />
          </mesh>
        </group>
      </group>
      {/* Latch — the pulsing hint */}
      <mesh position={[0, 0.2, 0.176]}>
        <boxGeometry args={[0.07, 0.06, 0.015]} />
        <meshStandardMaterial ref={hint} color="#D8B25A" emissive="#FFC94A" emissiveIntensity={0.3} toneMapped={false} />
      </mesh>
      {/* String coil and bob revealed inside */}
      <mesh position={[-0.1, 0.28, 0]} rotation={[Math.PI / 2, 0, 0]} visible={sim.drawerOpen}>
        <torusGeometry args={[0.06, 0.014, 10, 32]} />
        <meshStandardMaterial color="#EAE2CF" roughness={0.9} />
      </mesh>
      <mesh position={[0.1, 0.3, 0]} visible={sim.drawerOpen}>
        <sphereGeometry args={[0.035, 24, 16]} />
        <meshStandardMaterial color="#8E97A3" roughness={0.3} metalness={0.8} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Drop pad + falling balls (Scout releases them overhead)             */
/* ------------------------------------------------------------------ */

function DropPad({ sim, mass, paired, padUnlocked, sensorUnlocked }: { sim: MotionSim; mass: MassId; paired: boolean; padUnlocked: boolean; sensorUnlocked: boolean }) {
  const a = useRef<THREE.Mesh>(null)
  const b = useRef<THREE.Mesh>(null)
  const padGlow = useRef<THREE.MeshStandardMaterial>(null)
  const meta = MASS_BY_ID[mass]
  const other = MASS_BY_ID[mass === 'steel' ? 'wood' : 'steel']
  const quality = useQualityCaps()
  const [px, py, pz] = PAD_POS
  useFrame(() => {
    const y0 = py + 0.06 + BALL_RADIUS
    const inFlight = sim.dropping || sim.landedAt !== null
    if (a.current) {
      a.current.visible = inFlight
      a.current.position.set(px - 0.12, y0 + sim.ballAY, pz)
    }
    if (b.current) {
      b.current.visible = inFlight && (paired || sim.dropPaired)
      b.current.position.set(px + 0.12, y0 + sim.ballBY, pz)
    }
    if (padGlow.current) {
      const justLanded = sim.landedAt !== null && sim.time - sim.landedAt < 0.5
      padGlow.current.emissiveIntensity = justLanded ? 1.6 : padUnlocked ? 0.35 : 0.08
    }
  })
  return (
    <group>
      {/* Pad */}
      <mesh position={[px, py + 0.03, pz]} receiveShadow={quality.shadows}>
        <cylinderGeometry args={[0.42, 0.48, 0.06, 40]} />
        <meshStandardMaterial ref={padGlow} color="#2E3A42" emissive={HOLO} emissiveIntensity={0.1} roughness={0.6} />
      </mesh>
      {/* Sensor post */}
      {sensorUnlocked && (
        <group position={[px - 0.62, py, pz]}>
          <mesh position={[0, 0.5, 0]}>
            <cylinderGeometry args={[0.02, 0.025, 1.0, 12]} />
            <meshStandardMaterial color="#33373E" roughness={0.5} metalness={0.5} />
          </mesh>
          <mesh position={[0, 1.02, 0]}>
            <boxGeometry args={[0.12, 0.08, 0.08]} />
            <meshStandardMaterial color="#C13B33" emissive="#FF4A3D" emissiveIntensity={sim.sensorArmed ? 1.2 : 0.2} toneMapped={false} />
          </mesh>
        </group>
      )}
      {/* Balls */}
      <mesh ref={a} castShadow={quality.shadows}>
        <sphereGeometry args={[BALL_RADIUS, 28, 20]} />
        <meshStandardMaterial color={meta.color} roughness={meta.metal ? 0.25 : 0.7} metalness={meta.metal ? 0.85 : 0} />
      </mesh>
      <mesh ref={b} castShadow={quality.shadows}>
        <sphereGeometry args={[BALL_RADIUS, 28, 20]} />
        <meshStandardMaterial color={other.color} roughness={other.metal ? 0.25 : 0.7} metalness={other.metal ? 0.85 : 0} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */

interface Props {
  sim: MotionSim
  world: WorldId
  surface: SurfaceId
  mass: MassId
  target: number
  gatesUnlocked: boolean
  gateDist: number
  paired: boolean
  padUnlocked: boolean
  sensorUnlocked: boolean
  extraWorlds: boolean
  earned: string[]
  g: number
}

export default function YardKit({ sim, world, surface, mass, target, gatesUnlocked, gateDist, paired, padUnlocked, sensorUnlocked, extraWorlds, earned, g }: Props) {
  return (
    <group>
      <Lane surface={surface} target={target} />
      <Car sim={sim} mass={mass} />
      <TimingGates sim={sim} unlocked={gatesUnlocked} gateDist={gateDist} />
      <StopwatchPost sim={sim} />
      <GravityTotem world={world} extra={extraWorlds} g={g} />
      <HoloBoard lines={earned} />
      <KitChest sim={sim} />
      <DropPad sim={sim} mass={mass} paired={paired} padUnlocked={padUnlocked} sensorUnlocked={sensorUnlocked} />
    </group>
  )
}
