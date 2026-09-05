import { useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { glyphTexture } from '@/components/world/Glyphs'
import { YARD_Y } from '@/components/motion/YardWorld'

/**
 * The room's small vocabulary of objects. Everything in First Physics is
 * built from these: a lane on the floor, a post, a flag, a ruler that
 * unrolls, an arrow that means force, a crate, a label that says a number.
 * They are deliberately plain — the object of an episode has to be the
 * brightest idea in the frame, so nothing here competes with it.
 */

export const FLOOR = YARD_Y

/* ------------------------------------------------------------------ */
/* Anchors — where the equation card's arrows point                   */
/* ------------------------------------------------------------------ */

export interface AnchorMap {
  [id: string]: THREE.Vector3
}

/** Registers this group's world position under `id` every frame. */
export function Anchor({ id, anchors, children, position }: { id: string; anchors: AnchorMap; children?: ReactNode; position?: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(() => {
    if (!ref.current) return
    const v = anchors[id] ?? (anchors[id] = new THREE.Vector3())
    ref.current.getWorldPosition(v)
  })
  return (
    <group ref={ref} position={position}>
      {children}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Drag lock — a drag on an object must not also orbit the camera     */
/* ------------------------------------------------------------------ */

/** Returns [lock, unlock]: call lock on pointerdown of a draggable, unlock on up. */
export function useDragLock(): [() => void, () => void] {
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null
  const lock = () => {
    if (controls) controls.enabled = false
  }
  const unlock = () => {
    if (controls) controls.enabled = true
  }
  return [lock, unlock]
}

/* ------------------------------------------------------------------ */
/* Labels                                                             */
/* ------------------------------------------------------------------ */

export function Label({
  text,
  color = '#2A2823',
  size = 0.22,
  position,
  billboard = true,
  flat = false,
  outline = 'rgba(251, 245, 234, 0.95)',
  renderOrder = 3,
}: {
  text: string
  color?: string
  size?: number
  position: [number, number, number]
  billboard?: boolean
  /** Lie on the floor, readable from +z. */
  flat?: boolean
  outline?: string
  renderOrder?: number
}) {
  const { texture, aspect } = useMemo(() => glyphTexture(text, color, { strokeWidth: 10, strokeColor: outline }), [text, color, outline])
  const ref = useRef<THREE.Mesh>(null)
  const camera = useThree((s) => s.camera)
  useFrame(() => {
    if (billboard && ref.current) ref.current.quaternion.copy(camera.quaternion)
  })
  return (
    <mesh ref={ref} position={position} rotation={flat ? [-Math.PI / 2, 0, 0] : [0, 0, 0]} renderOrder={renderOrder}>
      <planeGeometry args={[size * aspect, size]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} alphaTest={0.02} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ */
/* The lane                                                           */
/* ------------------------------------------------------------------ */

/** A pale strip on the floor with a start post. `length` metres along +x from `x0`. */
export function Lane({ x0, length, z = 0, width = 0.5, color = '#EDE4D2', lanes = 1 }: { x0: number; length: number; z?: number; width?: number; color?: string; lanes?: number }) {
  return (
    <group>
      {Array.from({ length: lanes }, (_, i) => (
        <mesh key={i} position={[x0 + length / 2, FLOOR + 0.006, z + (i - (lanes - 1) / 2) * (width + 0.12)]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[length + 0.3, width]} />
          <meshStandardMaterial color={color} roughness={0.95} />
        </mesh>
      ))}
    </group>
  )
}

export function Post({ position, height = 0.55, color = '#8A5A0B' }: { position: [number, number, number]; height?: number; color?: string }) {
  return (
    <mesh position={[position[0], position[1] + height / 2, position[2]]} castShadow>
      <cylinderGeometry args={[0.03, 0.035, height, 10]} />
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  )
}

export function Flag({ position, color = '#C13B33' }: { position: [number, number, number]; color?: string }) {
  return (
    <group position={position}>
      <Post position={[0, 0, 0]} height={0.7} color="#5C4A35" />
      <mesh position={[0.14, 0.6, 0]} castShadow>
        <boxGeometry args={[0.26, 0.16, 0.01]} />
        <meshStandardMaterial color={color} roughness={0.7} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

/**
 * The ruler: a tape that unrolls from `x0` to `x0 + reading`, with tick
 * marks every half metre and a number at every metre. It sits just off the
 * lane so the runner does not stand on the number.
 */
export function Ruler({ x0, reading, max, z = 0.42, color = '#F2A25C', showTenths = true }: { x0: number; reading: number; max: number; z?: number; color?: string; showTenths?: boolean }) {
  const tape = useRef<THREE.Mesh>(null)
  useFrame(() => {
    if (!tape.current) return
    const len = Math.max(0.001, reading)
    tape.current.scale.x = len
    tape.current.position.x = x0 + len / 2
  })
  const ticks = useMemo(() => {
    const out: number[] = []
    for (let m = 0; m <= max + 1e-6; m += 0.5) out.push(m)
    return out
  }, [max])
  return (
    <group>
      <mesh ref={tape} position={[x0, FLOOR + 0.012, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1, 0.09]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      {ticks.map((m) => (
        <mesh key={m} position={[x0 + m, FLOOR + 0.014, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.012, Number.isInteger(m) ? 0.2 : 0.12]} />
          <meshBasicMaterial color="#5C4A35" toneMapped={false} />
        </mesh>
      ))}
      {ticks.filter((m) => Number.isInteger(m)).map((m) => (
        <Label key={`n${m}`} text={`${m} m`} size={0.16} position={[x0 + m, FLOOR + 0.02, z + 0.22]} billboard={false} flat color="#5C4A35" />
      ))}
      {showTenths && <Label text={`${reading.toFixed(1)} m`} color={color} size={0.26} position={[x0 + reading, FLOOR + 0.16, z + 0.62]} outline="rgba(20,34,50,0.85)" />}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Force arrow                                                        */
/* ------------------------------------------------------------------ */

/**
 * The arrow that means force, drawn on the object it acts on. Length is
 * proportional to `newtons` (scale metres/N), direction is the sign along
 * +x. This convention holds for the whole strand.
 */
export function ForceArrow({
  newtons,
  origin,
  scale = 0.06,
  color = '#C13B33',
  thickness = 0.05,
  label,
  z = 0,
}: {
  newtons: number
  origin: [number, number, number]
  scale?: number
  color?: string
  thickness?: number
  label?: string
  z?: number
}) {
  const shaft = useRef<THREE.Mesh>(null)
  const head = useRef<THREE.Mesh>(null)
  const len = Math.abs(newtons) * scale
  const dir = Math.sign(newtons) || 1
  useFrame(() => {
    if (!shaft.current || !head.current) return
    const l = Math.max(0.0001, len)
    shaft.current.scale.x = l
    shaft.current.position.x = origin[0] + (dir * l) / 2
    head.current.position.x = origin[0] + dir * (l + 0.09)
    head.current.rotation.z = dir > 0 ? -Math.PI / 2 : Math.PI / 2
    const vis = len > 0.02
    shaft.current.visible = vis
    head.current.visible = vis
  })
  return (
    <group>
      <mesh ref={shaft} position={[origin[0], origin[1], origin[2] + z]}>
        <boxGeometry args={[1, thickness, thickness]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} roughness={0.5} />
      </mesh>
      <mesh ref={head} position={[origin[0], origin[1], origin[2] + z]}>
        <coneGeometry args={[thickness * 2.2, 0.18, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} roughness={0.5} />
      </mesh>
      {label && len > 0.02 && <Label text={label} color={color} size={0.2} position={[origin[0] + (dir * len) / 2, origin[1] + 0.22, origin[2] + z]} outline="rgba(20,34,50,0.85)" />}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Crate and balls                                                    */
/* ------------------------------------------------------------------ */

export const CRATE = 0.42

export function Crate({ color = '#C9A46E' }: { color?: string }) {
  return (
    <group>
      <mesh position={[0, CRATE / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[CRATE, CRATE, CRATE]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      {[-0.13, 0.13].map((y, i) => (
        <mesh key={i} position={[0, CRATE / 2 + y, 0]}>
          <boxGeometry args={[CRATE + 0.01, 0.04, CRATE + 0.01]} />
          <meshStandardMaterial color="#8A6A44" roughness={0.85} />
        </mesh>
      ))}
    </group>
  )
}

export function Ball({ radius, color, metal = false }: { radius: number; color: string; metal?: boolean }) {
  return (
    <mesh castShadow>
      <sphereGeometry args={[radius, 28, 20]} />
      <meshStandardMaterial color={color} metalness={metal ? 0.85 : 0} roughness={metal ? 0.25 : 0.7} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ */
/* A pulse ring for "tap a symbol → its object lights up"             */
/* ------------------------------------------------------------------ */

export function Pulse({ active, radius = 0.5, y = FLOOR + 0.02, color = '#F2F6FA' }: { active: boolean; radius?: number; y?: number; color?: string }) {
  const ref = useRef<THREE.Mesh>(null)
  const t = useRef(0)
  useFrame((_, dt) => {
    if (!ref.current) return
    if (!active) {
      ref.current.visible = false
      t.current = 0
      return
    }
    ref.current.visible = true
    t.current = (t.current + dt * 1.6) % 1
    const s = 0.5 + t.current * 1.2
    ref.current.scale.set(s, s, s)
    ;(ref.current.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - t.current)
  })
  return (
    <mesh ref={ref} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[radius * 0.86, radius, 40]} />
      <meshBasicMaterial color={color} transparent opacity={0.6} toneMapped={false} depthWrite={false} />
    </mesh>
  )
}
