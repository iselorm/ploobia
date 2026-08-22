import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { glyphTexture } from '@/components/photo/Glyphs'
import { glowTexture } from '@/components/photo/Sprites'
import { CATEGORY_META, ELEMENTS, GRIP_MAX, wallSlot, type AtomSim } from '@/lib/atoms'
import { STAGE_POS, TILE_PITCH_Y, WALL_TOP_Y, WALL_Z, tileCenter } from './layout'

/**
 * The periodic table as a dark wall of sockets. Nothing up here is given:
 * every lit tile was forged on the stage. Rows are shells, columns are outer
 * electrons, and the ghost frame always shows where the CURRENT build would
 * live — the single clearest answer to "why is sodium on the left?".
 */

interface Props {
  sim: AtomSim
  discovered: number[]
  /** Latest probe value per z — lit tiles glow brighter with grip (a heat map). */
  probed: Record<number, number>
  /** Electron count of the build on the stage (drives the ghost frame). */
  ghostElectrons: number
  /** Charge balanced? (unbalanced builds get a grey ghost — an ion has no new address) */
  ghostBalanced: boolean
  onTile: (z: number) => void
  onWallFact: () => void
}

function Label({ text, color, size, position, rotation, opacity = 1 }: { text: string; color: string; size: number; position: [number, number, number]; rotation?: [number, number, number]; opacity?: number }) {
  const { texture, aspect } = useMemo(() => glyphTexture(text, color), [text, color])
  return (
    <mesh position={position} rotation={rotation ?? [0, 0, 0]} renderOrder={2}>
      <planeGeometry args={[size * aspect, size]} />
      <meshBasicMaterial map={texture} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

const TILE_W = 0.84
const TILE_H = 0.7

function GhostFrame({ electrons, balanced }: { electrons: number; balanced: boolean }) {
  const group = useRef<THREE.Group>(null)
  const glow = useMemo(() => glowTexture('rgba(232, 163, 61, 0.55)', 'rgba(232, 163, 61, 0)', 'ghost-glow'), [])
  const target = useMemo(() => new THREE.Vector3(), [])

  const slot = wallSlot(electrons)
  useFrame(({ clock }) => {
    const g = group.current
    if (!g) return
    g.visible = !!slot
    if (!slot) return
    const c = tileCenter(slot.row, slot.col)
    target.set(c[0], c[1], c[2] + 0.03)
    g.position.lerp(target, 0.12)
    const pulse = 1 + Math.sin(clock.elapsedTime * 3.2) * 0.045
    g.scale.setScalar(pulse)
  })

  const color = balanced ? '#F2B357' : '#9AA0AE'
  const bar = (w: number, h: number, x: number, y: number) => (
    <mesh position={[x, y, 0]}>
      <boxGeometry args={[w, h, 0.02]} />
      <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.95} />
    </mesh>
  )
  return (
    <group ref={group}>
      {bar(TILE_W + 0.1, 0.045, 0, TILE_H / 2 + 0.05)}
      {bar(TILE_W + 0.1, 0.045, 0, -TILE_H / 2 - 0.05)}
      {bar(0.045, TILE_H + 0.14, -TILE_W / 2 - 0.05, 0)}
      {bar(0.045, TILE_H + 0.14, TILE_W / 2 + 0.05, 0)}
      <sprite scale={[2.1, 1.8, 1]}>
        <spriteMaterial map={glow} transparent opacity={balanced ? 0.5 : 0.2} depthWrite={false} toneMapped={false} />
      </sprite>
    </group>
  )
}

export default function TableWall({ sim, discovered, probed, ghostElectrons, ghostBalanced, onTile, onWallFact }: Props) {
  const found = useMemo(() => new Set(discovered), [discovered])
  const slabY = WALL_TOP_Y - (3 * TILE_PITCH_Y) / 2
  const wallGroup = useRef<THREE.Group>(null)
  const stagePos = useMemo(() => new THREE.Vector3(...STAGE_POS), [])

  // The wall bows out when the learner closes in on the atom (or picks the
  // Atom view), and glides back up as they pull away — so a big atom's outer
  // rings never fight the sockets behind them. The demo keeps the wall up:
  // its narration points at the ghost slot.
  useFrame(({ camera }) => {
    const dist = camera.position.distanceTo(stagePos)
    let hidden = sim.wallHidden
    if (sim.demoMode || sim.placing) hidden = false // the forge flight needs its destination on screen
    else if (sim.viewId === 'stage') hidden = true
    else if (hidden) hidden = dist < 4.6
    else hidden = dist < 3.6
    sim.wallHidden = hidden
    const g = wallGroup.current
    if (!g) return
    const targetY = hidden ? -6.6 : 0
    g.position.y += (targetY - g.position.y) * 0.075
    g.visible = g.position.y > -6.3
  })

  return (
    <group ref={wallGroup}>
      {/* backing slab */}
      <mesh
        position={[0, slabY, WALL_Z - 0.06]}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation()
          onWallFact()
        }}
      >
        <boxGeometry args={[8.6, 4.4, 0.14]} />
        <meshStandardMaterial color="#191310" roughness={0.85} metalness={0.15} />
      </mesh>
      {/* faint frame glow strip along the top */}
      <mesh position={[0, WALL_TOP_Y + 0.98, WALL_Z + 0.02]}>
        <boxGeometry args={[8.6, 0.03, 0.02]} />
        <meshBasicMaterial color="#E8A33D" toneMapped={false} transparent opacity={0.5} />
      </mesh>

      {/* column numerals = outer electrons; row numerals = shells */}
      {Array.from({ length: 8 }, (_, i) => (
        <Label key={`col-${i}`} text={String(i + 1)} color="#D8B98A" size={0.2} position={[(i + 1 - 4.5) * 0.95, WALL_TOP_Y + 0.62, WALL_Z + 0.06]} opacity={0.85} />
      ))}
      <Label text="electrons in the outer shell" color="#B99C72" size={0.14} position={[0, WALL_TOP_Y + 0.86, WALL_Z + 0.06]} opacity={0.7} />
      {Array.from({ length: 4 }, (_, i) => (
        <Label key={`row-${i}`} text={String(i + 1)} color="#D8B98A" size={0.2} position={[-4.15, WALL_TOP_Y - i * TILE_PITCH_Y, WALL_Z + 0.06]} opacity={0.85} />
      ))}
      <Label text="shells" color="#B99C72" size={0.14} position={[-4.5, slabY, WALL_Z + 0.06]} rotation={[0, 0, Math.PI / 2]} opacity={0.7} />

      {/* the 20 sockets */}
      {ELEMENTS.map((el) => {
        const slot = wallSlot(el.z)
        if (!slot) return null
        const [x, y, z] = tileCenter(slot.row, slot.col)
        const lit = found.has(el.z)
        const grip = probed[el.z]
        const heat = grip !== undefined ? Math.min(1, grip / GRIP_MAX) : null
        const tint = CATEGORY_META[el.category].tint
        return (
          <group
            key={el.z}
            position={[x, y, z]}
            onClick={(e) => {
              e.stopPropagation()
              if (lit) onTile(el.z)
              else onWallFact()
            }}
          >
            <mesh>
              <boxGeometry args={[TILE_W, TILE_H, 0.06]} />
              {lit ? (
                <meshStandardMaterial color={tint} emissive={tint} emissiveIntensity={heat !== null ? 0.35 + heat * 1.1 : 0.35} roughness={0.4} />
              ) : (
                <meshStandardMaterial color="#17110C" emissive="#3A2B1A" emissiveIntensity={0.38} roughness={0.9} />
              )}
            </mesh>
            {/* socket rim so empty slots read as waiting, not as void */}
            {!lit && (
              <mesh position={[0, 0, 0.033]}>
                <planeGeometry args={[TILE_W - 0.06, TILE_H - 0.06]} />
                <meshBasicMaterial color="#0C0906" toneMapped={false} />
              </mesh>
            )}
            {lit ? (
              <>
                <Label text={el.symbol} color="#FFF6E8" size={0.3} position={[0, 0.03, 0.045]} />
                <Label text={String(el.z)} color="#FFF6E8" size={0.11} position={[-0.28, 0.22, 0.045]} opacity={0.85} />
              </>
            ) : (
              <Label text={String(el.z)} color="#8A7458" size={0.12} position={[-0.28, 0.22, 0.045]} opacity={0.8} />
            )}
          </group>
        )
      })}

      {/* the wall goes on — faint sockets hinting at the elements beyond Z = 20 */}
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={`future-${i}`} position={[(i + 1 - 4.5) * 0.95, WALL_TOP_Y - 4 * TILE_PITCH_Y, WALL_Z + 0.04]}>
          <boxGeometry args={[TILE_W, TILE_H * 0.5, 0.03]} />
          <meshStandardMaterial color="#0E0B08" emissive="#1C1510" emissiveIntensity={0.15} roughness={0.95} transparent opacity={0.55} />
        </mesh>
      ))}

      <GhostFrame electrons={ghostElectrons} balanced={ghostBalanced} />
    </group>
  )
}
