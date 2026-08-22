import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useQualityCaps } from '@/lib/quality'
import { BALL_RADIUS, MASS_BY_ID, currentLaunchSpeed, type MassId, type MotionSim } from '@/lib/motion'
import { groundAlongRange, LAUNCH_H0, LAUNCH_ORIGIN, type LauncherId, type VenueId } from '@/lib/yard'
import { YARD_Y } from './YardWorld'
import { angleReadout, gapReadout } from './textures'

const HOLO = '#5FE0D2'
const GOLD = '#FFC94A'

/** World position of a point d metres downrange, h metres above the ground line. */
export function launchWorld(d: number, h: number): [number, number, number] {
  return [LAUNCH_ORIGIN[0] + d, YARD_Y + h, LAUNCH_ORIGIN[1]]
}

/* ------------------------------------------------------------------ */
/* The three machines                                                 */
/* ------------------------------------------------------------------ */

function Slingshot({ active, pull, angle }: { active: boolean; pull: number; angle: number }) {
  // The pouch sits back along the (cos, sin) launch direction by `pull`.
  const th = (angle * Math.PI) / 180
  const px = -Math.cos(th) * pull * 0.42
  const py = LAUNCH_H0 - Math.sin(th) * pull * 0.42
  const forkTop = LAUNCH_H0 + 0.12
  return (
    <group>
      {/* Handle and fork */}
      <mesh position={[0, (forkTop - 0.14) / 2, 0]}>
        <cylinderGeometry args={[0.028, 0.036, forkTop - 0.14, 12]} />
        <meshStandardMaterial color="#7E5F40" roughness={0.75} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, forkTop - 0.05, s * 0.09]} rotation={[s * 0.5, 0, 0]}>
          <cylinderGeometry args={[0.02, 0.024, 0.22, 10]} />
          <meshStandardMaterial color="#7E5F40" roughness={0.75} />
        </mesh>
      ))}
      {/* Elastic to the pouch */}
      {active &&
        [-1, 1].map((s) => {
          const from = new THREE.Vector3(0, forkTop + 0.04, s * 0.135)
          const to = new THREE.Vector3(px, py, 0)
          const midLen = from.distanceTo(to)
          const mid = from.clone().add(to).multiplyScalar(0.5)
          const dir = to.clone().sub(from).normalize()
          const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
          return (
            <mesh key={s} position={mid.toArray()} quaternion={quat}>
              <cylinderGeometry args={[0.008, 0.008, midLen, 6]} />
              <meshStandardMaterial color="#B33A2E" roughness={0.8} />
            </mesh>
          )
        })}
      {/* Pouch */}
      {active && (
        <mesh position={[px, py, 0]}>
          <boxGeometry args={[0.05, 0.05, 0.07]} />
          <meshStandardMaterial color="#4A3A2A" roughness={0.9} />
        </mesh>
      )}
    </group>
  )
}

function Catapult({ active, tension, angle }: { active: boolean; tension: number; angle: number }) {
  // The arm rests at the launch angle; tension winds the spring coil tighter.
  const th = (angle * Math.PI) / 180
  const armLen = 0.55
  return (
    <group>
      {/* Base */}
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[0.5, 0.12, 0.34]} />
        <meshStandardMaterial color="#6E5136" roughness={0.8} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[-0.05, 0.22, s * 0.14]}>
          <boxGeometry args={[0.06, 0.24, 0.05]} />
          <meshStandardMaterial color="#7E5F40" roughness={0.75} />
        </mesh>
      ))}
      {/* Spring coil — winds with tension */}
      <mesh position={[-0.05, 0.3, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.05, 0.014 + (active ? tension * 0.004 : 0), 10, 24]} />
        <meshStandardMaterial color="#8E97A3" roughness={0.35} metalness={0.7} />
      </mesh>
      {/* Arm at the launch angle, cup at the end */}
      <group position={[-0.05, 0.3, 0]} rotation={[0, 0, active ? th : 0.3]}>
        <mesh position={[armLen / 2, 0, 0]}>
          <boxGeometry args={[armLen, 0.045, 0.05]} />
          <meshStandardMaterial color="#9A7448" roughness={0.7} />
        </mesh>
        <mesh position={[armLen, 0.035, 0]}>
          <cylinderGeometry args={[0.055, 0.04, 0.05, 20, 1, true]} />
          <meshStandardMaterial color="#4A3A2A" roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  )
}

function Trebuchet({ active, counterweight, locked }: { active: boolean; counterweight: number; locked: boolean }) {
  const hint = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(() => {
    if (hint.current) hint.current.emissiveIntensity = locked ? 0.3 + 0.35 * (0.5 + 0.5 * Math.sin(performance.now() / 500)) : 0
  })
  const tone = locked ? '#3A3630' : '#7E5F40'
  const beamTilt = active ? -0.6 : -0.85
  return (
    <group>
      {/* A-frame */}
      {[-1, 1].map((s) => (
        <group key={s} position={[0, 0, s * 0.16]}>
          <mesh position={[-0.12, 0.34, 0]} rotation={[0, 0, 0.35]}>
            <boxGeometry args={[0.05, 0.72, 0.05]} />
            <meshStandardMaterial color={tone} roughness={0.8} />
          </mesh>
          <mesh position={[0.12, 0.34, 0]} rotation={[0, 0, -0.35]}>
            <boxGeometry args={[0.05, 0.72, 0.05]} />
            <meshStandardMaterial color={tone} roughness={0.8} />
          </mesh>
        </group>
      ))}
      {/* Axle + beam */}
      <mesh position={[0, 0.66, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.022, 0.022, 0.42, 12]} />
        <meshStandardMaterial color="#3E4650" roughness={0.4} metalness={0.6} />
      </mesh>
      <group position={[0, 0.66, 0]} rotation={[0, 0, beamTilt]}>
        <mesh position={[0.18, 0, 0]}>
          <boxGeometry args={[0.9, 0.05, 0.06]} />
          <meshStandardMaterial color={tone} roughness={0.75} />
        </mesh>
        {/* Counterweight box — bigger with mass */}
        <mesh position={[-0.3, -0.12, 0]}>
          <boxGeometry args={[0.14 + counterweight * 0.012, 0.14 + counterweight * 0.012, 0.16]} />
          <meshStandardMaterial color={locked ? '#2E2B26' : '#4A4E56'} roughness={0.6} metalness={0.3} />
        </mesh>
        {/* Sling strings */}
        <mesh position={[0.66, -0.09, 0]} rotation={[0, 0, 0.5]}>
          <cylinderGeometry args={[0.006, 0.006, 0.26, 6]} />
          <meshStandardMaterial color="#EAE2CF" roughness={0.9} />
        </mesh>
      </group>
      {/* Locked hint lamp */}
      {locked && (
        <mesh position={[0, 0.95, 0]}>
          <sphereGeometry args={[0.035, 16, 12]} />
          <meshStandardMaterial ref={hint} color="#FFC94A" emissive={GOLD} emissiveIntensity={0.4} toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Rings: target (gold) and the learner's landing call (cyan)          */
/* ------------------------------------------------------------------ */

function GroundRing({ d, venue, color, radius, pulse, label }: { d: number; venue: VenueId; color: string; radius: number; pulse: boolean; label?: boolean }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(() => {
    if (mat.current && pulse) mat.current.emissiveIntensity = 1.1 + 0.5 * Math.sin(performance.now() / 350)
  })
  const h = groundAlongRange(venue, d)
  return (
    <group position={launchWorld(d, h + 0.02)}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius - 0.035, radius, 40]} />
        <meshStandardMaterial ref={mat} color={color} emissive={color} emissiveIntensity={1.2} toneMapped={false} transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
      {label && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.02, 0.05, 20]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  )
}

/** After a called landing: a bar from the ring to the landing plus a readout. */
function GapBar({ sim, venue }: { sim: MotionSim; venue: VenueId }) {
  const gap = sim.lastRingGap
  const flight = sim.flight
  if (gap === null || flight === null || sim.launching) return null
  const landing = flight.range
  const ring = landing + gap
  const mid = (landing + ring) / 2
  const h = groundAlongRange(venue, mid)
  return (
    <group>
      <mesh position={launchWorld(mid, h + 0.04)}>
        <boxGeometry args={[Math.max(0.02, Math.abs(gap)), 0.012, 0.05]} />
        <meshStandardMaterial color="#FFB86B" emissive="#FFB86B" emissiveIntensity={1} toneMapped={false} />
      </mesh>
      <GapSprite gap={gap} at={launchWorld(mid, h + 0.5)} />
    </group>
  )
}

function GapSprite({ gap, at }: { gap: number; at: [number, number, number] }) {
  const tag = useMemo(() => gapReadout(), [])
  const sprite = useRef<THREE.Sprite>(null)
  useFrame(() => {
    tag.draw(gap)
  })
  return (
    <sprite ref={sprite} position={at} scale={[1.1, 0.28, 1]}>
      <spriteMaterial map={tag.texture} transparent depthWrite={false} toneMapped={false} />
    </sprite>
  )
}

/* ------------------------------------------------------------------ */
/* Angle ladder — the pilot's pitch ladder on the active launcher      */
/* ------------------------------------------------------------------ */

function AngleLadder({ sim }: { sim: MotionSim }) {
  const readout = useMemo(() => angleReadout(), [])
  const needle = useRef<THREE.Group>(null)
  const root = useRef<THREE.Group>(null)
  useFrame(() => {
    if (root.current) root.current.visible = sim.visionOn && sim.mode === 'launch'
    readout.draw(sim.launchAngle, currentLaunchSpeed(sim))
    if (needle.current) needle.current.rotation.z = (sim.launchAngle * Math.PI) / 180
  })
  const arcLine = useMemo(() => {
    const pts: THREE.Vector3[] = []
    for (let a = 15; a <= 75; a += 3) {
      const th = (a * Math.PI) / 180
      pts.push(new THREE.Vector3(Math.cos(th) * 0.62, Math.sin(th) * 0.62, 0))
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const mat = new THREE.LineBasicMaterial({ color: HOLO, transparent: true, opacity: 0.55, toneMapped: false })
    return new THREE.Line(geo, mat)
  }, [])
  const ticks = useMemo(() => [15, 30, 45, 60, 75], [])
  return (
    <group ref={root} position={launchWorld(0, LAUNCH_H0)} visible={false}>
      <primitive object={arcLine} />
      {ticks.map((a) => {
        const th = (a * Math.PI) / 180
        return (
          <mesh key={a} position={[Math.cos(th) * 0.62, Math.sin(th) * 0.62, 0]}>
            <sphereGeometry args={[a === 45 ? 0.02 : 0.012, 10, 8]} />
            <meshStandardMaterial color={HOLO} emissive={HOLO} emissiveIntensity={a === 45 ? 1.6 : 0.8} toneMapped={false} />
          </mesh>
        )
      })}
      <group ref={needle}>
        <mesh position={[0.31, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.006, 0.006, 0.62, 6]} />
          <meshStandardMaterial color={HOLO} emissive={HOLO} emissiveIntensity={1.4} toneMapped={false} transparent opacity={0.85} />
        </mesh>
      </group>
      <sprite position={[0.15, 0.95, 0]} scale={[0.56, 0.28, 1]}>
        <spriteMaterial map={readout.texture} transparent depthWrite={false} toneMapped={false} />
      </sprite>
    </group>
  )
}

/* ------------------------------------------------------------------ */

interface Props {
  sim: MotionSim
  launcher: LauncherId
  angle: number
  power: number
  mass: MassId
  venue: VenueId
  trebuchetUnlocked: boolean
  targetDist: number
  ringAt: number | null
  onPlaceRing: (d: number) => void
}

export default function Launchers({ sim, launcher, angle, power, mass, venue, trebuchetUnlocked, targetDist, ringAt, onPlaceRing }: Props) {
  const ball = useRef<THREE.Mesh>(null)
  const meta = MASS_BY_ID[mass]
  const quality = useQualityCaps()
  const dragging = useRef(false)
  const downAt = useRef<[number, number]>([0, 0])

  useFrame(() => {
    if (!ball.current) return
    const show = sim.launching || sim.flight !== null
    ball.current.visible = show
    if (show) {
      const [x, y, z] = launchWorld(sim.projX, sim.projY)
      ball.current.position.set(x, Math.max(y, YARD_Y + groundAlongRange(venue, sim.projX) + BALL_RADIUS * 0.7), z)
    }
  })

  const place = (e: ThreeEvent<PointerEvent>) => {
    const d = e.point.x - LAUNCH_ORIGIN[0]
    onPlaceRing(Math.max(0.5, Math.min(14, Number(d.toFixed(2)))))
  }

  const origin = launchWorld(0, 0)
  return (
    <group>
      {/* The pad the active machine stands on */}
      <mesh position={[origin[0], YARD_Y + 0.012, origin[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.75, 36]} />
        <meshStandardMaterial color="#585E52" roughness={0.9} />
      </mesh>

      {/* Active machine at the pad */}
      <group position={origin}>
        {launcher === 'slingshot' && <Slingshot active pull={power} angle={angle} />}
        {launcher === 'catapult' && <Catapult active tension={power} angle={angle} />}
        {launcher === 'trebuchet' && <Trebuchet active counterweight={power} locked={false} />}
      </group>

      {/* The other machines, parked behind — the trebuchet dark until earned */}
      <group position={[origin[0] - 1.35, origin[1], origin[2] - 0.9]} rotation={[0, 0.5, 0]} scale={0.8}>
        {launcher !== 'slingshot' && <Slingshot active={false} pull={0} angle={40} />}
      </group>
      <group position={[origin[0] - 1.5, origin[1], origin[2] + 0.35]} rotation={[0, 0.9, 0]} scale={0.8}>
        {launcher !== 'catapult' && <Catapult active={false} tension={0} angle={40} />}
      </group>
      <group position={[origin[0] - 1.3, origin[1], origin[2] + 1.3]} rotation={[0, 1.1, 0]} scale={0.85}>
        {launcher !== 'trebuchet' && <Trebuchet active={false} counterweight={5} locked={!trebuchetUnlocked} />}
      </group>

      {/* Projectile */}
      <mesh ref={ball} castShadow={quality.shadows} visible={false}>
        <sphereGeometry args={[BALL_RADIUS, 28, 20]} />
        <meshStandardMaterial color={meta.color} roughness={meta.metal ? 0.25 : 0.7} metalness={meta.metal ? 0.85 : 0} />
      </mesh>

      {/* Target ring (gold) and the learner's landing call (cyan) */}
      <GroundRing d={targetDist} venue={venue} color={GOLD} radius={0.36} pulse label />
      {ringAt !== null && <GroundRing d={ringAt} venue={venue} color={HOLO} radius={0.28} pulse={false} />}
      <GapBar sim={sim} venue={venue} />

      {/* Angle ladder (Physics Vision) */}
      <AngleLadder sim={sim} />

      {/* Tap the corridor to place the landing call (a tap, not an orbit drag) */}
      <mesh
        position={[origin[0] + 7, YARD_Y + 0.05, origin[2]]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(e) => {
          if (sim.mode !== 'launch') return
          dragging.current = true
          downAt.current = [e.nativeEvent.clientX ?? 0, e.nativeEvent.clientY ?? 0]
        }}
        onPointerUp={(e) => {
          if (!dragging.current || sim.mode !== 'launch') return
          dragging.current = false
          const [dx, dy] = downAt.current
          const moved = Math.hypot((e.nativeEvent.clientX ?? 0) - dx, (e.nativeEvent.clientY ?? 0) - dy)
          if (moved < 9) place(e)
        }}
      >
        <planeGeometry args={[15, 3.2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}
