import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { glyphTexture } from '@/components/photo/Glyphs'
import { glowTexture } from '@/components/photo/Sprites'
import { CATEGORY_META, ELEMENTS, GRIP_MAX, wallSlot, type AtomSim } from '@/lib/atoms'
import { STAGE_POS, TILE_PITCH_Y, WALL_TOP_Y, WALL_Z, tileCenter } from './layout'

/**
 * The periodic table as a board on the workshop wall — **a hint, not a hole**.
 *
 * The first version was a dark wall of empty sockets: nothing was given, and
 * every tile you had not forged was a void. That reads as the subject of the
 * room, which it is not, and it hides the shape of the thing being learned —
 * a learner who has forged four elements should still be able to see that
 * there is a *table*, and roughly how big it is.
 *
 * So an unforged tile now carries its class colour at about a seventh
 * strength and its symbol at under half — present, legible if you look, and
 * quiet enough that the atom on the bench wins. A forged tile is unchanged:
 * full class colour, lit, white symbol. **The colour that means something
 * never changes** — only its strength does, which is the one dimension free
 * to carry "found / not found".
 *
 * Rows are shells, columns are outer electrons, and the ghost frame shows
 * where the CURRENT build lives — by proton count, so an ion never moves.
 */

interface Props {
  sim: AtomSim
  discovered: number[]
  /** Latest probe value per z — lit tiles glow brighter with grip (a heat map). */
  probed: Record<number, number>
  /** False while the catch is running: the record must not swallow taps. */
  tappable?: boolean
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

/* The wall writes one flag back to the sim (whether it is bowed out of the
   way), and the compiler's immutability rule wants that write named rather
   than buried in a frame callback — same pattern as the page's `markStarted`. */
function setWallHidden(sim: AtomSim, hidden: boolean): void {
  sim.wallHidden = hidden
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

/**
 * What the bench's back wall carries instead of the table: **only the elements
 * this player has actually forged**, in a single centred row, plus a dashed
 * slot at the end for the one on the bench right now.
 *
 * It is a record, not a reference. It grows as they play, it never shows them
 * a grid of things they have not done, and — the point Selorm made — it leaves
 * the background quiet enough that the atom being forged is plainly the
 * subject of the picture.
 */
function ForgedRecord({ sim, discovered, building, tappable, onTile }: { sim: AtomSim; discovered: number[]; building: number; tappable: boolean; onTile: (z: number) => void }) {
  const group = useRef<THREE.Group>(null)
  const shown = useMemo(() => {
    const lit = discovered.filter((z) => ELEMENTS.some((e) => e.z === z)).sort((a, b) => a - b)
    return lit.slice(-9)
  }, [discovered])

  const pitch = 0.86
  const pending = building > 0 && !shown.includes(building) ? 1 : 0
  const width = (shown.length + pending - 1) * pitch

  useFrame(() => {
    const g = group.current
    if (!g) return
    // it rides in exactly when the board rides out
    const targetY = sim.wallHidden ? 0 : 6.6
    g.position.y += (targetY - g.position.y) * 0.075
    g.visible = g.position.y < 6.3 && shown.length + pending > 0
  })

  const y = WALL_TOP_Y - 0.5
  return (
    <group ref={group}>
      {shown.length > 0 && (
        <Label text="forged so far" color="#6E5638" size={0.24} position={[0, y + 0.68, WALL_Z + 0.5]} opacity={0.9} />
      )}
      {shown.map((z, i) => {
        const el = ELEMENTS.find((e) => e.z === z)
        if (!el) return null
        const tint = CATEGORY_META[el.category].tint
        return (
          <group
            key={z}
            position={[-width / 2 + i * pitch, y, WALL_Z + 0.5]}
            // During the catch the whole canvas is a target and a stray tap on
            // the record would open an element card mid-round. A record is
            // worth reading, but never at the cost of swallowing a catch.
            onClick={
              tappable
                ? (e) => {
                    e.stopPropagation()
                    onTile(z)
                  }
                : undefined
            }
          >
            <mesh>
              <boxGeometry args={[0.72, 0.72, 0.07]} />
              <meshStandardMaterial color={tint} emissive={tint} emissiveIntensity={0.35} roughness={0.4} />
            </mesh>
            <Label text={el.symbol} color="#FFF6E8" size={0.3} position={[0, 0.03, 0.048]} />
            <Label text={String(el.z)} color="#FFF6E8" size={0.11} position={[-0.25, 0.23, 0.048]} opacity={0.85} />
          </group>
        )
      })}
      {pending === 1 && (
        <group position={[-width / 2 + shown.length * pitch, y, WALL_Z + 0.5]}>
          <mesh>
            <boxGeometry args={[0.72, 0.72, 0.04]} />
            <meshBasicMaterial color="#C7A87C" transparent opacity={0.18} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0, 0.03]}>
            <ringGeometry args={[0.36, 0.4, 4, 1, Math.PI / 4]} />
            <meshBasicMaterial color="#E8A33D" transparent opacity={0.7} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}
    </group>
  )
}

export default function TableWall({ sim, discovered, probed, tappable = true, ghostElectrons, ghostBalanced, onTile, onWallFact }: Props) {
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
    // **The full table is the Wall view's subject, and nothing else's.**
    // On the bench it was a wall of twenty sockets directly behind the atom,
    // and however faint the unforged tiles were made, twenty of them behind
    // the one thing the player is building is a crowd. The record of what has
    // been forged still hangs there (see ForgedRecord) — a handful of lit
    // tiles, no grid — and the whole table is one tap away, in the Wall view
    // or the Elements panel, where it is what you came to look at.
    let hidden = sim.viewId !== 'wall'
    if (sim.demoMode || sim.placing) hidden = false // the forge flight needs its destination on screen
    else if (!hidden) hidden = dist < 3.6
    setWallHidden(sim, hidden)
    const g = wallGroup.current
    if (!g) return
    const targetY = hidden ? -6.6 : 0
    g.position.y += (targetY - g.position.y) * 0.075
    g.visible = g.position.y > -6.3
  })

  return (
    <group>
      <ForgedRecord sim={sim} discovered={discovered} building={ghostElectrons} tappable={tappable} onTile={onTile} />
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
        <meshStandardMaterial color="#3B322B" roughness={0.88} metalness={0.08} />
      </mesh>
      {/* faint frame glow strip along the top */}
      <mesh position={[0, WALL_TOP_Y + 0.98, WALL_Z + 0.02]}>
        <boxGeometry args={[8.6, 0.03, 0.02]} />
        <meshBasicMaterial color="#E8A33D" toneMapped={false} transparent opacity={0.5} />
      </mesh>

      {/* column numerals = outer electrons; row numerals = shells */}
      {Array.from({ length: 8 }, (_, i) => (
        <Label key={`col-${i}`} text={String(i + 1)} color="#F0DCBB" size={0.2} position={[(i + 1 - 4.5) * 0.95, WALL_TOP_Y + 0.62, WALL_Z + 0.06]} opacity={0.9} />
      ))}
      <Label text="electrons in the outer shell" color="#DCC7A2" size={0.14} position={[0, WALL_TOP_Y + 0.86, WALL_Z + 0.06]} opacity={0.7} />
      {Array.from({ length: 4 }, (_, i) => (
        <Label key={`row-${i}`} text={String(i + 1)} color="#F0DCBB" size={0.2} position={[-4.15, WALL_TOP_Y - i * TILE_PITCH_Y, WALL_Z + 0.06]} opacity={0.9} />
      ))}
      <Label text="shells" color="#DCC7A2" size={0.14} position={[-4.5, slabY, WALL_Z + 0.06]} rotation={[0, 0, Math.PI / 2]} opacity={0.7} />

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
                <meshStandardMaterial color="#2E2822" roughness={0.92} metalness={0.04} />
              )}
            </mesh>
            {/* Unforged: the class colour at a seventh, so the shape of the table
                is legible without competing with the bench. */}
            {!lit && (
              <mesh position={[0, 0, 0.033]}>
                <planeGeometry args={[TILE_W - 0.05, TILE_H - 0.05]} />
                <meshBasicMaterial color={tint} transparent opacity={0.16} depthWrite={false} toneMapped={false} />
              </mesh>
            )}
            {lit ? (
              <>
                <Label text={el.symbol} color="#FFF6E8" size={0.3} position={[0, 0.03, 0.045]} />
                <Label text={String(el.z)} color="#FFF6E8" size={0.11} position={[-0.28, 0.22, 0.045]} opacity={0.85} />
              </>
            ) : (
              <>
                <Label text={el.symbol} color={tint} size={0.28} position={[0, 0.03, 0.045]} opacity={0.42} />
                <Label text={String(el.z)} color={tint} size={0.11} position={[-0.28, 0.22, 0.045]} opacity={0.5} />
              </>
            )}
          </group>
        )
      })}

      {/* the wall goes on — faint sockets hinting at the elements beyond Z = 20 */}
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={`future-${i}`} position={[(i + 1 - 4.5) * 0.95, WALL_TOP_Y - 4 * TILE_PITCH_Y, WALL_Z + 0.04]}>
          <boxGeometry args={[TILE_W, TILE_H * 0.5, 0.03]} />
          <meshStandardMaterial color="#2A241F" roughness={0.95} transparent opacity={0.5} />
        </mesh>
      ))}

      <GhostFrame electrons={ghostElectrons} balanced={ghostBalanced} />
      </group>
    </group>
  )
}
