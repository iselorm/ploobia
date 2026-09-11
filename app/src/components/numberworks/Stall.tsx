import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { BASIN_MAX, TOMATOES_PER_KG, VENUE } from '@/lib/market'
import type { MarketSim } from '@/lib/marketsim'
import { rngFor } from '@/lib/challenge'
import Prop from './Prop'
import { boardTexture, drawBoard, signTexture, stripesTexture } from './textures'

/**
 * The learner's stall — every verb in Door 1 lives on this table.
 *
 * basin/count · the tomatoes are instanced spheres whose count IS the state
 * scale/weigh · the needle swings to the last sale's kilos
 * board/write  · the chalk board's text is a canvas texture, redrawn on change
 * till/ring    · the drawer bounces and coins pop on the target
 *
 * Every hotspot answers the hand with a soft light (house rule 4). The stall
 * itself — table, canopy, sign — is procedural: it has no verb of its own.
 */

export type StallVerb = 'basin' | 'scale' | 'board' | 'till'

const TABLE_Y = 0.86
const TOMATO_R = 0.037

function Halo({ radius, active, hover }: { radius: number; active: boolean; hover: boolean }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null)
  useFrame((state) => {
    const m = mat.current
    if (!m) return
    const pulse = 0.18 + Math.sin(state.clock.elapsedTime * 2.6) * 0.06
    const want = hover ? 0.55 : active ? pulse : 0.09
    m.opacity += (want - m.opacity) * 0.15
  })
  return (
    <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <circleGeometry args={[radius, 28]} />
      <meshBasicMaterial ref={mat} color="#FFE2A8" transparent opacity={0.09} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </mesh>
  )
}

/** A tappable region: a generous invisible hit target plus the halo under it. */
function Hotspot({ verb, radius, height = 0.3, active, onTap, hovered, onHover, children }: { verb: StallVerb; radius: number; height?: number; active: boolean; onTap: (v: StallVerb) => void; hovered: StallVerb | null; onHover: (v: StallVerb | null) => void; children: React.ReactNode }) {
  return (
    <group
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        onTap(verb)
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        onHover(verb)
      }}
      onPointerOut={() => onHover(null)}
      name={`hotspot-${verb}`}
    >
      <mesh position={[0, height / 2, 0]} visible={false}>
        <cylinderGeometry args={[radius * 1.25, radius * 1.25, height, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <Halo radius={radius * 1.15} active={active} hover={hovered === verb} />
      {children}
    </group>
  )
}

/** The tomatoes, heaped in the basin: count = the stock. Layout from a fixed seed so a heap of 40 is always the same heap. */
function Tomatoes({ sim }: { sim: MarketSim }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const layout = useMemo(() => {
    const rng = rngFor(0x70ba70)
    const out: THREE.Matrix4[] = []
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    for (let i = 0; i < BASIN_MAX; i++) {
      // rings of tomatoes rising in layers; the first ones fill the bottom
      const layer = Math.floor(i / 20)
      const j = i % 20
      const ring = j < 7 ? 0 : 1
      const inRing = ring === 0 ? j : j - 7
      const n = ring === 0 ? 7 : 13
      const a = (inRing / n) * Math.PI * 2 + layer * 0.35 + rng() * 0.15
      const r = (ring === 0 ? 0.08 : 0.19) * (1 - layer * 0.12) + (rng() - 0.5) * 0.02
      const y = 0.04 + layer * 0.062 + (rng() - 0.5) * 0.01
      e.set(rng() * 6, rng() * 6, 0)
      q.setFromEuler(e)
      m.compose(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), q, new THREE.Vector3(1, 0.92 + rng() * 0.12, 1))
      out.push(m.clone())
    }
    return out
  }, [])
  const shown = useRef(-1)
  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const n = Math.max(0, Math.min(BASIN_MAX, Math.round(sim.stock)))
    if (n === shown.current) return
    for (let i = 0; i < n; i++) mesh.setMatrixAt(i, layout[i])
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
    shown.current = n
  })
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, BASIN_MAX]} count={0} castShadow name="tomatoes">
      <sphereGeometry args={[TOMATO_R, 14, 10]} />
      <meshStandardMaterial color="#D9402A" roughness={0.38} metalness={0} />
    </instancedMesh>
  )
}

/** The scale's needle: swings to the last sale's kilos, then settles. Procedural over either scale. */
function Needle({ sim }: { sim: MarketSim }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(() => {
    const g = ref.current
    if (!g) return
    const since = sim.lastSaleAt < 0 ? 99 : sim.time - sim.lastSaleAt
    const kg = since < 2.4 ? sim.lastSaleN / TOMATOES_PER_KG : 0
    const want = -kg * 2.4
    g.rotation.z += (want - g.rotation.z) * 0.18
  })
  return (
    <group position={[0, 0.245, 0.062]}>
      <group ref={ref}>
        <mesh position={[0, 0.03, 0]}>
          <boxGeometry args={[0.006, 0.06, 0.004]} />
          <meshStandardMaterial color="#C0453C" />
        </mesh>
      </group>
    </group>
  )
}

/** Coins by the till: their count follows the money. On the ring they pop. */
function Coins({ sim }: { sim: MarketSim }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const MAX = 48
  const layout = useMemo(() => {
    const rng = rngFor(0xc01d5)
    return Array.from({ length: MAX }, (_, i) => ({ x: -0.16 + (i % 8) * 0.045 + rng() * 0.01, z: -0.02 + Math.floor(i / 8) * 0.045, y: 0.004 * (1 + (i % 3)) }))
  }, [])
  const m = useMemo(() => new THREE.Matrix4(), [])
  const shown = useRef(-1)
  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const n = Math.max(0, Math.min(MAX, Math.floor(sim.till / 8)))
    const ring = sim.ringAt >= 0 ? sim.time - sim.ringAt : 99
    if (n === shown.current && ring > 1.2) return
    for (let i = 0; i < n; i++) {
      const p = layout[i]
      const hop = ring < 1.2 ? Math.max(0, Math.sin(ring * 6 - i * 0.2)) * 0.05 : 0
      m.makeTranslation(p.x, p.y + hop, p.z)
      mesh.setMatrixAt(i, m)
    }
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
    shown.current = n
  })
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, MAX]} count={0} name="coins">
      <cylinderGeometry args={[0.016, 0.016, 0.004, 12]} />
      <meshStandardMaterial color="#D9A441" metalness={0.7} roughness={0.35} />
    </instancedMesh>
  )
}

/** The till bounces on the ring. Wraps either the generated box or the stand-in. */
function Ringer({ sim, children }: { sim: MarketSim; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(() => {
    const g = ref.current
    if (!g) return
    const ring = sim.ringAt >= 0 ? sim.time - sim.ringAt : 99
    const k = ring < 0.9 ? Math.sin(ring * 14) * Math.exp(-ring * 4) * 0.08 : 0
    g.position.y = k
    g.rotation.z = k * 0.6
  })
  return <group ref={ref}>{children}</group>
}

interface Props {
  sim: MarketSim
  board: { eyebrow: string; big: string; small?: string }
  aim: StallVerb | null
  hovered: StallVerb | null
  onHover: (v: StallVerb | null) => void
  onTap: (v: StallVerb) => void
}

export default function Stall({ sim, board, aim, hovered, onHover, onTap }: Props) {
  const stripes = useMemo(() => stripesTexture(), [])
  const sign = useMemo(() => signTexture(VENUE.sign), [])
  const chalk = useMemo(() => boardTexture(board.eyebrow, board.big, board.small), [])
  useEffect(() => {
    drawBoard(chalk.canvas, board.eyebrow, board.big, board.small)
    chalk.texture.needsUpdate = true
  }, [chalk, board.eyebrow, board.big, board.small])

  return (
    <group name="subject">
      {/* table */}
      <mesh position={[0, TABLE_Y - 0.03, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.7, 0.06, 0.86]} />
        <meshStandardMaterial color="#8A5A2B" roughness={0.85} />
      </mesh>
      {[-0.78, 0.78].map((x) =>
        [-0.36, 0.36].map((z) => (
          <mesh key={`${x}${z}`} position={[x, (TABLE_Y - 0.06) / 2, z]} castShadow>
            <boxGeometry args={[0.06, TABLE_Y - 0.06, 0.06]} />
            <meshStandardMaterial color="#6E4521" roughness={0.9} />
          </mesh>
        )),
      )}
      {/* the canopy and its posts */}
      {[-0.86, 0.86].map((x) => (
        <mesh key={x} position={[x, 1.25, -0.42]} castShadow>
          <cylinderGeometry args={[0.025, 0.025, 2.5, 8]} />
          <meshStandardMaterial color="#C9A46B" roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, 2.38, 0.05]} rotation={[-0.32, 0, 0]} castShadow>
        <planeGeometry args={[2.1, 1.05]} />
        <meshStandardMaterial map={stripes} side={THREE.DoubleSide} roughness={0.95} />
      </mesh>
      <mesh position={[0, 2.06, 0.5]} rotation={[0, 0, 0]}>
        <planeGeometry args={[0.72, 0.18]} />
        <meshBasicMaterial map={sign} toneMapped={false} />
      </mesh>

      {/* basin + tomatoes */}
      <group position={[-0.45, TABLE_Y, 0.06]}>
        <Hotspot verb="basin" radius={0.3} height={0.26} active={aim === 'basin'} onTap={onTap} hovered={hovered} onHover={onHover}>
          <Prop id="basin">
            <mesh position={[0, 0.09, 0]} castShadow>
              <cylinderGeometry args={[0.28, 0.22, 0.18, 22, 1, true]} />
              <meshStandardMaterial color="#3F6FB0" roughness={0.6} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[0, 0.005, 0]}>
              <cylinderGeometry args={[0.22, 0.22, 0.01, 22]} />
              <meshStandardMaterial color="#35619A" roughness={0.6} />
            </mesh>
          </Prop>
          <Tomatoes sim={sim} />
        </Hotspot>
      </group>

      {/* scale + needle */}
      <group position={[0.08, TABLE_Y, -0.14]}>
        <Hotspot verb="scale" radius={0.16} height={0.34} active={aim === 'scale'} onTap={onTap} hovered={hovered} onHover={onHover}>
          <Prop id="scale">
            <mesh position={[0, 0.13, 0]} castShadow>
              <cylinderGeometry args={[0.07, 0.09, 0.26, 16]} />
              <meshStandardMaterial color="#C9CFD6" metalness={0.8} roughness={0.35} />
            </mesh>
            <mesh position={[0, 0.245, 0.055]} rotation={[0, 0, 0]}>
              <circleGeometry args={[0.075, 24]} />
              <meshStandardMaterial color="#FBF8EF" roughness={0.7} />
            </mesh>
            <mesh position={[0, 0.3, 0]}>
              <cylinderGeometry args={[0.12, 0.12, 0.012, 20]} />
              <meshStandardMaterial color="#9AA4B2" metalness={0.75} roughness={0.4} />
            </mesh>
          </Prop>
          <Needle sim={sim} />
        </Hotspot>
      </group>

      {/* chalk board on its stand */}
      <group position={[0.46, TABLE_Y, -0.2]}>
        <Hotspot verb="board" radius={0.17} height={0.4} active={aim === 'board'} onTap={onTap} hovered={hovered} onHover={onHover}>
          <mesh position={[0, 0.04, 0]}>
            <boxGeometry args={[0.2, 0.08, 0.06]} />
            <meshStandardMaterial color="#6E4521" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.24, 0]} rotation={[-0.18, 0, 0]} name="board" castShadow>
            <planeGeometry args={[0.36, 0.28]} />
            <meshBasicMaterial map={chalk.texture} toneMapped={false} />
          </mesh>
        </Hotspot>
      </group>

      {/* the till + coins */}
      <group position={[0.62, TABLE_Y, 0.16]}>
        <Hotspot verb="till" radius={0.2} height={0.2} active={aim === 'till'} onTap={onTap} hovered={hovered} onHover={onHover}>
          <Ringer sim={sim}>
            <Prop id="till" rotation={[0, -0.35, 0]}>
              <mesh position={[0, 0.07, 0]} castShadow>
                <boxGeometry args={[0.3, 0.14, 0.22]} />
                <meshStandardMaterial color="#A46B32" roughness={0.85} />
              </mesh>
              <mesh position={[0, 0.045, 0.16]} castShadow>
                <boxGeometry args={[0.26, 0.07, 0.12]} />
                <meshStandardMaterial color="#8A5A2B" roughness={0.85} />
              </mesh>
            </Prop>
          </Ringer>
          <group position={[-0.02, 0.005, -0.28]}>
            <Coins sim={sim} />
          </group>
        </Hotspot>
      </group>
    </group>
  )
}
