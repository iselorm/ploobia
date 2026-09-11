import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { glowTexture } from '@/components/photo/Sprites'
import type { AtomSim } from '@/lib/atoms'
import { ContactShadow } from './FoundryWorld'
import { STAGE_POS } from './layout'

/**
 * The three particle sources — **launchers, in a row, in the tray's order**.
 *
 * They used to be three cauldrons standing far apart on the bench floor
 * (protons hard left, neutrons front-centre, electrons hard right). Two things
 * were wrong with that, and Selorm named both: the room read as busy, and
 * because a tap fired at one edge of the screen while the atom it fed sat in
 * the middle, the player had to *hunt for the action* instead of watching it.
 *
 * So: one rail, three launchers side by side in the same left-to-right order
 * as the tray's − p⁺ + · − n⁰ + · − e⁻ + buttons directly beneath them, each
 * angled up and back at the stage. Adding a particle — from the launcher or
 * from the tray, they are the same event — fires a shot that arcs from the
 * muzzle into the atom. Everything the player does and everything that happens
 * because of it now lives in one column of the screen.
 *
 * They carry no captions of their own. The tray sits directly under them and
 * already says "Proton p⁺"; floating the same glyph in the world put big
 * letters across the periodic table to tell the player something the button
 * beneath their thumb was already telling them.
 *
 * The slots are **fixed**, not distributed among the visible launchers: when
 * the neutron launcher is hidden for a level, protons and electrons stay
 * exactly where they were. A control that moves because a neighbour vanished
 * is a control the player has to find again.
 */

export type ParticleKind = 'proton' | 'neutron' | 'electron'

interface LauncherSpec {
  kind: ParticleKind
  color: string
  glow: string
  /** Fixed slot on the rail. Order matches the tray, left to right. */
  x: number
}

/** The rail: how far forward the launchers stand, and how high the muzzle sits. */
const RAIL_Z = 1.95
/**
 * The rail sits in a shallow channel, below the level of the bench top.
 *
 * With the launchers standing proud on the slab, the middle one rose into the
 * column of the picture the atom occupies — and the atom being forged is the
 * one thing in this room that must never be crowded. Sinking the rail costs
 * nothing (they are still plainly instruments you press) and hands the whole
 * upper half of the centre back to the element.
 */
const RAIL_Y = -0.14
const BARREL_TILT = -0.46
const BARREL_LEN = 0.62
const BARREL_MID_Y = 0.36
const MUZZLE: [number, number, number] = [
  0,
  BARREL_MID_Y + (BARREL_LEN / 2) * Math.cos(BARREL_TILT),
  RAIL_Z + (BARREL_LEN / 2) * Math.sin(BARREL_TILT),
]
/** How long a shot takes to reach the stage. Long enough to follow, short enough to feel like a press. */
const SHOT_SECONDS = 0.46

const SPECS: LauncherSpec[] = [
  { kind: 'proton', color: '#E8A33D', glow: 'rgba(232, 163, 61, 0.75)', x: -1.45 },
  { kind: 'neutron', color: '#9AA4B2', glow: 'rgba(154, 164, 178, 0.6)', x: 0 },
  { kind: 'electron', color: '#63E0FF', glow: 'rgba(99, 224, 255, 0.7)', x: 1.45 },
]

/**
 * The shot: muzzle to stage along a lifted arc.
 *
 * A straight line would be read as a UI transition; the arc is what makes it a
 * thing that was *thrown*, which is the whole point of a launcher. The control
 * point is above the midpoint, so the shot rises out of the barrel and drops
 * into the atom rather than sliding across the picture.
 */
function shotPoint(from: THREE.Vector3, to: THREE.Vector3, k: number, out: THREE.Vector3): void {
  const inv = 1 - k
  const midX = (from.x + to.x) / 2
  const midY = Math.max(from.y, to.y) + 0.75
  const midZ = (from.z + to.z) / 2
  out.set(
    inv * inv * from.x + 2 * inv * k * midX + k * k * to.x,
    inv * inv * from.y + 2 * inv * k * midY + k * k * to.y,
    inv * inv * from.z + 2 * inv * k * midZ + k * k * to.z,
  )
}

function Launcher({ spec, sim, onAdd }: { spec: LauncherSpec; sim: AtomSim; onAdd: (kind: ParticleKind) => void }) {
  const glowMat = useRef<THREE.SpriteMaterial>(null)
  const inviteRing = useRef<THREE.Mesh>(null)
  const inviteMat = useRef<THREE.MeshBasicMaterial>(null)
  const shot = useRef<THREE.Mesh>(null)
  const halo = useMemo(() => glowTexture(spec.glow, spec.glow.replace(/[\d.]+\)$/, '0)'), `launcher-${spec.kind}`), [spec])

  // Local space: the group is already at [spec.x, 0, RAIL_Z], so the muzzle is
  // at MUZZLE with x 0, and the stage is wherever it is relative to this slot.
  const from = useMemo(() => new THREE.Vector3(0, MUZZLE[1], MUZZLE[2] - RAIL_Z), [])
  const to = useMemo(() => new THREE.Vector3(STAGE_POS[0] - spec.x, STAGE_POS[1], STAGE_POS[2] - RAIL_Z), [spec.x])
  const at = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    const t = sim.time
    const added = spec.kind === 'proton' ? sim.lastAddP : spec.kind === 'neutron' ? sim.lastAddN : sim.lastAddE
    const since = t - added
    const pulse = Math.max(0, 1 - since * 2.4)
    // A steady breathing beat so the orb reads as "press me", not scenery.
    const breathe = Math.sin(t * 2.4 + spec.x * 2)
    if (glowMat.current) glowMat.current.opacity = 0.6 + breathe * 0.18 + pulse * 0.4
    if (inviteRing.current && inviteMat.current) {
      const w = (t * 0.55 + spec.x) % 1
      inviteRing.current.scale.setScalar(1 + w * 0.5)
      inviteMat.current.opacity = (1 - w) * 0.5 + pulse * 0.3
    }
    // the shot itself
    if (shot.current) {
      const k = since / SHOT_SECONDS
      if (added > 0 && k >= 0 && k <= 1) {
        shotPoint(from, to, k, at)
        shot.current.position.copy(at)
        // it shrinks as it lands, so it reads as joining the atom rather than stopping
        shot.current.scale.setScalar(1 - k * 0.45)
        shot.current.visible = true
      } else {
        shot.current.visible = false
      }
    }
  })

  return (
    <group position={[spec.x, RAIL_Y, RAIL_Z]}>
      <group
        onClick={(e) => {
          e.stopPropagation()
          onAdd(spec.kind)
        }}
      >
        {/* the plinth it stands on */}
        <mesh position={[0, 0.065, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.52, 0.13, 0.52]} />
          <meshStandardMaterial color="#256C6E" roughness={0.7} metalness={0.1} />
        </mesh>
        {/* a band in the particle's colour: which launcher is which, without reading */}
        <mesh position={[0, 0.135, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.42, 0.42]} />
          <meshBasicMaterial color={spec.color} transparent opacity={0.55} depthWrite={false} toneMapped={false} />
        </mesh>
        {/* the barrel, tilted up and back at the stage */}
        <mesh position={[0, BARREL_MID_Y, (BARREL_LEN / 2) * Math.sin(BARREL_TILT)]} rotation={[BARREL_TILT, 0, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.13, 0.17, BARREL_LEN, 18]} />
          <meshStandardMaterial color="#8A6437" roughness={0.42} metalness={0.55} />
        </mesh>
        {/* the charge glowing in the muzzle */}
        <mesh position={[0, MUZZLE[1] - 0.02, MUZZLE[2] - RAIL_Z + 0.015]} rotation={[BARREL_TILT + Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.115, 18]} />
          <meshBasicMaterial color={spec.color} toneMapped={false} />
        </mesh>
        {/* swelling invitation ring around the muzzle */}
        <mesh
          ref={inviteRing}
          position={[0, MUZZLE[1], MUZZLE[2] - RAIL_Z + 0.03]}
          rotation={[BARREL_TILT + Math.PI / 2, 0, 0]}
          renderOrder={2}
        >
          <ringGeometry args={[0.135, 0.175, 28]} />
          <meshBasicMaterial ref={inviteMat} color={spec.color} transparent opacity={0.4} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
        <sprite position={[0, MUZZLE[1] + 0.1, MUZZLE[2] - RAIL_Z]} scale={[0.95, 0.95, 1]}>
          <spriteMaterial ref={glowMat} map={halo} transparent opacity={0.5} depthWrite={false} toneMapped={false} />
        </sprite>
      </group>

      {/* the shot in flight, muzzle to atom */}
      <mesh ref={shot} visible={false} renderOrder={3}>
        <sphereGeometry args={[0.1, 16, 12]} />
        <meshBasicMaterial color={spec.color} toneMapped={false} />
      </mesh>

      <ContactShadow position={[0, 0, 0]} radius={0.36} opacity={0.38} />
    </group>
  )
}

export default function Dispensers({ sim, showNeutrons, onAdd }: { sim: AtomSim; showNeutrons: boolean; onAdd: (kind: ParticleKind) => void }) {
  return (
    <group>
      {/* the rail the three stand on: what makes them one instrument, not three objects */}
      <mesh position={[0, RAIL_Y + 0.03, RAIL_Z]} receiveShadow>
        <boxGeometry args={[3.9, 0.06, 0.8]} />
        <meshStandardMaterial color="#1F5E60" roughness={0.8} metalness={0.1} />
      </mesh>
      {SPECS.filter((s) => showNeutrons || s.kind !== 'neutron').map((s) => (
        <Launcher key={s.kind} spec={s} sim={sim} onAdd={onAdd} />
      ))}
    </group>
  )
}
