import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { benchAvailable, benchDrop, registerInteractable, useWorld } from '@/lib/archipelago'
import { useBand } from '@/lib/bands'
import {
  JUG_MAX,
  PIECES,
  benchGap,
  benchLevel,
  benchLevel_,
  benchPredicted,
  benchTilt,
  benchToMark,
  benchWetMass,
  markLevel,
  runnerOffered,
  trayFor,
  type Bench,
  type Piece,
} from '@/lib/supply'
import { BALANCE_AT, BALANCE_BENCH, BALANCE_BENCH_AT, BENCH_REACH, BIN_AT, BUTT_AT, COLD_BENCH, COLD_BENCH_AT, JUG_AT, PATTERN_AT, TRAY_AT } from './benchLayout'

/**
 * S2 in the courtyard (storyboard v3.1 §03 M3, §07): the cold bench and the
 * balance bench against the west wall, and the instruments ON them — the jug
 * with its scale and its water, the wooden pattern, the tray of scrap, the
 * beam balance with the wet set on one pan and the dry ingots on the other.
 * Primitives until the meshes land; every number comes from lib/supply.ts.
 * Readings are Html tags anchored to the objects, shown only inside a room.
 * Scene handles for suites: `bench-jug` (userData.level), `bench-balance`
 * (userData.tilt, userData.dry), `bench-tray` (userData.left).
 */
export default function BenchScene() {
  const s = useWorld()
  const available = benchAvailable(s)
  useEffect(() => {
    if (!available) return
    const offs = [
      registerInteractable({ id: 'bench.jug', verb: 'measure', label: 'Measure the pattern', pos: [JUG_AT[0] + 0.6, 0, JUG_AT[2]], radius: BENCH_REACH }),
      registerInteractable({ id: 'bench.balance', verb: 'measure', label: 'The balance', pos: [BALANCE_AT[0] + 0.6, 0, BALANCE_AT[2]], radius: BENCH_REACH }),
    ]
    return () => offs.forEach((f) => f())
  }, [available])
  const [band] = useBand()
  const tray = useMemo(() => trayFor(band), [band])
  const b = s.supply?.bench ?? null
  return (
    <group name="bench">
      <ColdBench />
      <BalanceBench />
      <Jug b={b} inRoom={s.room === 'bench'} />
      <Pattern b={b} />
      <Tray pieces={tray} b={b} active={s.room === 'bench' && b?.phase === 'matching'} />
      <Balance b={b} inRoom={s.room === 'balance'} band={band} />
    </group>
  )
}

const STONE = '#8F8A80'
const OAK = '#8B6B3E'
const OAK_DARK = '#5E4530'
const IRON = '#3D332A'
const COPPER = '#C8743A'
const COPPER_WET = '#9C5A2E'
const GREY = '#6E6F72'
const CREAM = '#F1E9D7'
const WATER = '#6FA8CF'
const AMBER = '#E8A33D'

/* ---- the benches -------------------------------------------------------- */

function ColdBench() {
  const [x, , z] = COLD_BENCH_AT
  const { length, depth, top } = COLD_BENCH
  return (
    <group name="cold-bench">
      {/* the slab, with old water rings */}
      <mesh position={[x, top - 0.04, z]} castShadow receiveShadow>
        <boxGeometry args={[depth, 0.08, length]} />
        <meshStandardMaterial color={STONE} roughness={0.95} />
      </mesh>
      {[-0.9, 0.9].map((dz) => (
        <group key={dz} position={[x, 0, z + dz]}>
          <mesh position={[-0.22, (top - 0.08) / 2, 0]}>
            <boxGeometry args={[0.08, top - 0.08, 0.5]} />
            <meshStandardMaterial color={OAK} roughness={0.9} />
          </mesh>
          <mesh position={[0.22, (top - 0.08) / 2, 0]}>
            <boxGeometry args={[0.08, top - 0.08, 0.5]} />
            <meshStandardMaterial color={OAK} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.3, 0]}>
            <boxGeometry args={[0.52, 0.05, 0.08]} />
            <meshStandardMaterial color={OAK_DARK} roughness={0.9} />
          </mesh>
        </group>
      ))}
      {/* the water butt at the north end */}
      <mesh position={[BUTT_AT[0], 0.42, BUTT_AT[2]]} castShadow>
        <cylinderGeometry args={[0.3, 0.27, 0.84, 14]} />
        <meshStandardMaterial color={OAK_DARK} roughness={0.9} />
      </mesh>
      <mesh position={[BUTT_AT[0], 0.85, BUTT_AT[2]]}>
        <cylinderGeometry args={[0.31, 0.31, 0.03, 14]} />
        <meshStandardMaterial color={OAK} roughness={0.9} />
      </mesh>
      {/* the drip tray under the front edge */}
      <mesh position={[x + 0.36, 0.06, z]}>
        <boxGeometry args={[0.3, 0.04, 1.2]} />
        <meshStandardMaterial color={IRON} roughness={0.8} />
      </mesh>
    </group>
  )
}

function BalanceBench() {
  const [x, , z] = BALANCE_BENCH_AT
  const { length, depth, top } = BALANCE_BENCH
  return (
    <group name="balance-bench">
      <mesh position={[x, top - 0.03, z]} castShadow receiveShadow>
        <boxGeometry args={[depth, 0.06, length]} />
        <meshStandardMaterial color={OAK} roughness={0.9} />
      </mesh>
      {[
        [-0.28, -0.8],
        [0.28, -0.8],
        [-0.28, 0.8],
        [0.28, 0.8],
      ].map(([dx, dz]) => (
        <mesh key={`${dx}${dz}`} position={[x + dx, (top - 0.06) / 2, z + dz]}>
          <boxGeometry args={[0.06, top - 0.06, 0.06]} />
          <meshStandardMaterial color={IRON} roughness={0.8} />
        </mesh>
      ))}
      {/* the scrap bin: a half barrel, a few glints in it */}
      <mesh position={[BIN_AT[0], 0.26, BIN_AT[2]]} castShadow>
        <cylinderGeometry args={[0.26, 0.23, 0.52, 12]} />
        <meshStandardMaterial color={OAK_DARK} roughness={0.9} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[BIN_AT[0] + (i - 1) * 0.09, 0.5, BIN_AT[2] + (i % 2) * 0.08 - 0.04]}>
          <dodecahedronGeometry args={[0.05, 0]} />
          <meshStandardMaterial color={COPPER} roughness={0.6} metalness={0.4} />
        </mesh>
      ))}
    </group>
  )
}

/* ---- the jug ------------------------------------------------------------- */

const JUG_H = 0.36
const JUG_R = 0.17

function Jug({ b, inRoom }: { b: Bench | null; inRoom: boolean }) {
  const water = useRef<THREE.Mesh>(null)
  const shown = useRef(1500)
  const level = b ? benchLevel(b) : 1500
  const marked = !!b?.marked
  const markY = -JUG_H / 2 + (markLevel() / JUG_MAX) * JUG_H
  useFrame((_, dt) => {
    // The water finds its level: a short glide, no allocation.
    shown.current += (level - shown.current) * (1 - Math.pow(0.002, Math.min(0.05, dt)))
    const m = water.current
    if (!m) return
    const h = Math.max(0.005, (shown.current / JUG_MAX) * JUG_H)
    m.scale.y = h / JUG_H
    m.position.y = -JUG_H / 2 + h / 2
    m.userData.level = Math.round(shown.current)
  })
  const inJug = b?.inJug ?? []
  const tag = !b || b.phase === 'idle' ? 'Water at 1,500' : b.phase === 'pattern' ? `1,500 → ${fmt(level)}` : b.phase === 'marked' ? `The mark · ${fmt(markLevel())}` : `${fmt(level)} · ${benchToMark(b) === 0 ? 'at the mark' : `${fmt(benchToMark(b))} to the mark`}`
  return (
    <group position={[JUG_AT[0], JUG_AT[1] + JUG_H / 2, JUG_AT[2]]} name="bench-jug" userData={{ level }}>
      {/* the body, pale inside so the line reads; open at the top */}
      {/* thin glazed earthenware reads as a pale glass here so the water line shows from the yard side */}
      <mesh castShadow>
        <cylinderGeometry args={[JUG_R, JUG_R * 0.92, JUG_H, 20, 1, true]} />
        <meshStandardMaterial color={CREAM} roughness={0.5} transparent opacity={0.42} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={[0, -JUG_H / 2 + 0.005, 0]}>
        <cylinderGeometry args={[JUG_R * 0.92, JUG_R * 0.92, 0.01, 20]} />
        <meshStandardMaterial color={CREAM} roughness={0.7} />
      </mesh>
      {/* the handle, on the wall side */}
      <mesh position={[-JUG_R - 0.03, 0.02, 0]} rotation={[0, 0, 0]}>
        <torusGeometry args={[0.07, 0.016, 8, 16, Math.PI]} />
        <meshStandardMaterial color={CREAM} roughness={0.7} />
      </mesh>
      {/* the scale band on the yard side: a long tick every 1,000, short every 250 */}
      <mesh position={[JUG_R + 0.004, 0, 0]}>
        <boxGeometry args={[0.008, JUG_H - 0.02, 0.06]} />
        <meshStandardMaterial color="#F6F2E8" roughness={0.8} />
      </mesh>
      {Array.from({ length: 13 }, (_, i) => i * 250).map((v) => (
        <mesh key={v} position={[JUG_R + 0.009, -JUG_H / 2 + (v / JUG_MAX) * JUG_H, 0]}>
          <boxGeometry args={[0.004, 0.004, v % 1000 === 0 ? 0.05 : 0.024]} />
          <meshStandardMaterial color={IRON} />
        </mesh>
      ))}
      {/* the water */}
      <mesh ref={water} position={[0, -JUG_H / 2 + 0.09, 0]}>
        <cylinderGeometry args={[JUG_R * 0.9, JUG_R * 0.86, JUG_H, 20]} />
        <meshStandardMaterial color={WATER} transparent opacity={0.8} roughness={0.2} />
      </mesh>
      {/* the mark: an amber ring at the pattern's rise, once made */}
      {marked && (
        <mesh position={[0, markY, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[JUG_R + 0.012, 0.007, 6, 28]} />
          <meshStandardMaterial color={AMBER} emissive={AMBER} emissiveIntensity={0.5} />
        </mesh>
      )}
      {/* the pattern under, or the scrap in */}
      {b?.patternIn && (
        <group position={[0, -JUG_H / 2 + 0.06, 0]} rotation={[0, 0.4, 0]}>
          <PatternMesh />
        </group>
      )}
      {inJug.map((id, i) => (
        <group key={id} position={[((i % 3) - 1) * 0.07, -JUG_H / 2 + 0.03 + Math.floor(i / 3) * 0.05, ((i % 2) - 0.5) * 0.06]}>
          <PieceMesh piece={PIECES[id]} wet />
        </group>
      ))}
      {inRoom && (
        <Html position={[0.24, JUG_H / 2 + 0.06, -0.26]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
          <Tag testid="jug-tag">{tag}</Tag>
        </Html>
      )}
    </group>
  )
}

/** The gate pattern: a strap with two pin holes and two pegs on sprues, in pale wood. */
function PatternMesh() {
  return (
    <group>
      <mesh castShadow>
        <boxGeometry args={[0.22, 0.02, 0.05]} />
        <meshStandardMaterial color="#D9B87A" roughness={0.6} />
      </mesh>
      {[-0.07, 0.07].map((dx) => (
        <mesh key={dx} position={[dx, 0.012, 0]}>
          <cylinderGeometry args={[0.006, 0.006, 0.006, 8]} />
          <meshStandardMaterial color="#5E4530" />
        </mesh>
      ))}
      {[-0.05, 0.05].map((dx) => (
        <mesh key={dx} position={[dx, -0.03, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.06, 8]} />
          <meshStandardMaterial color="#D9B87A" roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0.13, 0.005, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.014, 0.004, 6, 12]} />
        <meshStandardMaterial color={IRON} />
      </mesh>
    </group>
  )
}

function Pattern({ b }: { b: Bench | null }) {
  if (b?.patternIn) return null
  return (
    <group position={[PATTERN_AT[0], PATTERN_AT[1] + 0.015, PATTERN_AT[2]]} rotation={[0, 0.2, 0]} name="bench-pattern">
      <PatternMesh />
    </group>
  )
}

/* ---- the scrap ----------------------------------------------------------- */

function PieceMesh({ piece, wet = false, hot = false }: { piece: Piece | undefined; wet?: boolean; hot?: boolean }) {
  if (!piece) return null
  const color = piece.metal === 'iron' ? GREY : wet ? COPPER_WET : COPPER
  const mat = <meshStandardMaterial color={color} roughness={wet ? 0.35 : 0.6} metalness={0.35} emissive={hot ? AMBER : '#000000'} emissiveIntensity={hot ? 0.35 : 0} />
  const s = piece.cm3 >= 200 ? 1 : 0.8
  switch (piece.shape) {
    case 'nugget':
    case 'lump':
      return (
        <mesh castShadow scale={s}>
          <dodecahedronGeometry args={[0.042, 0]} />
          {mat}
        </mesh>
      )
    case 'pin':
      return (
        <mesh castShadow rotation={[0, 0, Math.PI / 2]} scale={s}>
          <cylinderGeometry args={[0.02, 0.02, 0.1, 10]} />
          {mat}
        </mesh>
      )
    case 'offcut':
      return (
        <mesh castShadow rotation={[0, 0.3, 0.2]}>
          <boxGeometry args={[0.13, 0.018, 0.045]} />
          {mat}
        </mesh>
      )
    case 'knob':
      return (
        <mesh castShadow>
          <icosahedronGeometry args={[0.048, 0]} />
          {mat}
        </mesh>
      )
    case 'drip':
      return (
        <mesh castShadow>
          <boxGeometry args={[0.1, 0.014, 0.07]} />
          {mat}
        </mesh>
      )
    case 'bell':
      return (
        <mesh castShadow rotation={[0.5, 0, 0]}>
          <sphereGeometry args={[0.05, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          {mat}
        </mesh>
      )
  }
}

function Tray({ pieces, b, active }: { pieces: Piece[]; b: Bench | null; active: boolean }) {
  const left = pieces.filter((p) => !b?.inJug.includes(p.id))
  return (
    <group position={TRAY_AT} name="bench-tray" userData={{ left: left.length }}>
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.5, 0.04, 0.34]} />
        <meshStandardMaterial color="#4A4038" roughness={0.9} />
      </mesh>
      {left.map((p, i) => (
        <group
          key={p.id}
          position={[((i % 4) - 1.5) * 0.115, 0.07, (Math.floor(i / 4) - 0.5) * 0.14]}
          onClick={(e) => {
            if (!active) return
            e.stopPropagation()
            benchDrop(p.id)
          }}
        >
          <PieceMesh piece={p} hot={active} />
        </group>
      ))}
    </group>
  )
}

/* ---- the balance --------------------------------------------------------- */

const ARM = 0.44
const BEAM_Y = 0.5

function Balance({ b, inRoom, band }: { b: Bench | null; inRoom: boolean; band: string }) {
  const beam = useRef<THREE.Group>(null)
  const tilt = b ? benchTilt(b) : 0
  const onPan = !!b && (b.phase === 'balancing' || b.phase === 'charged')
  const dry = onPan ? b.dry : 0
  useFrame((_, dt) => {
    const g = beam.current
    if (!g) return
    // Dry heavy: the right (dry) pan goes down → the beam leans clockwise about z from the yard side.
    const want = -tilt * 0.16
    g.rotation.z += (want - g.rotation.z) * (1 - Math.pow(0.004, Math.min(0.05, dt)))
    g.userData.tilt = tilt
  })
  const level = !!b && benchLevel_(b)
  const wet = onPan ? benchWetMass(b) : 0
  const predicted = onPan ? benchPredicted(b) : 0
  const gap = onPan ? benchGap(b) : 0
  const showRunner = !!b && (runnerOffered(b) || b.phase === 'charged')
  const readout = !onPan
    ? 'Nothing on the pans yet'
    : band === 'explorer'
      ? `${dry} dry ingot${dry === 1 ? '' : 's'} · ${level ? 'level' : tilt > 0 ? 'dry side heavy' : 'dry side light'}`
      : gap === 0 || band === 'scientist'
        ? `Measured ${fmt(wet)} g · Predicted ${fmt(predicted)} g${level ? ' · level' : ''}`
        : `Measured ${fmt(wet)} g · Predicted ${fmt(predicted)} g · ${fmt(Math.abs(gap))} g ${gap < 0 ? 'below' : 'above'} prediction`
  return (
    <group position={BALANCE_AT} name="bench-balance" userData={{ tilt, dry, level }}>
      {/* base and post */}
      <mesh position={[0, 0.03, 0]} castShadow>
        <boxGeometry args={[0.3, 0.06, 0.3]} />
        <meshStandardMaterial color={OAK_DARK} roughness={0.9} />
      </mesh>
      <mesh position={[0, BEAM_Y / 2 + 0.03, 0]}>
        <boxGeometry args={[0.05, BEAM_Y, 0.05]} />
        <meshStandardMaterial color={IRON} roughness={0.7} />
      </mesh>
      {/* the beam, pivoting at the post's top; pans hang from its ends */}
      <group ref={beam} position={[0, BEAM_Y + 0.04, 0]}>
        <mesh castShadow>
          <boxGeometry args={[ARM * 2 + 0.06, 0.028, 0.028]} />
          <meshStandardMaterial color={IRON} roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.03, 0]}>
          <coneGeometry args={[0.014, 0.05, 6]} />
          <meshStandardMaterial color={AMBER} />
        </mesh>
        <Pan x={-ARM} label="wet">
          {onPan && b.inJug.map((id, i) => (
            <group key={id} position={[((i % 3) - 1) * 0.06, 0.03 + Math.floor(i / 3) * 0.045, ((i % 2) - 0.5) * 0.05]}>
              <PieceMesh piece={PIECES[id]} wet />
            </group>
          ))}
        </Pan>
        <Pan x={ARM} label="dry">
          {Array.from({ length: dry }, (_, i) => (
            <mesh key={i} position={[((i % 5) - 2) * 0.045, 0.02 + Math.floor(i / 5) * 0.03, (Math.floor(i / 5) % 2) * 0.03 - 0.015]} castShadow>
              <boxGeometry args={[0.04, 0.024, 0.07]} />
              <meshStandardMaterial color={COPPER} roughness={0.55} metalness={0.4} />
            </mesh>
          ))}
        </Pan>
      </group>
      {/* Sefu's runner ingot: on the bench beside the base, once the beam is level */}
      {showRunner && (
        <mesh position={[0.34, 0.02, 0.16]} castShadow name="bench-runner">
          <boxGeometry args={[0.04, 0.024, 0.07]} />
          <meshStandardMaterial color={COPPER} emissive={AMBER} emissiveIntensity={0.45} roughness={0.55} metalness={0.4} />
        </mesh>
      )}
      {inRoom && (
        <>
          <Html position={[0, BEAM_Y - 0.14, 0.02]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
            <Tag testid="balance-tag" wide>{readout}</Tag>
          </Html>
          <Html position={[-ARM, 0.16, 0]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
            <Tag small dark>WET · stays</Tag>
          </Html>
          <Html position={[ARM, 0.16, 0]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
            <Tag small dark>DRY · to the fire</Tag>
          </Html>
          {showRunner && (
            <Html position={[0.34, 0.12, 0.16]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
              <Tag small>+1 for the channel</Tag>
            </Html>
          )}
        </>
      )}
    </group>
  )
}

function Pan({ x, label, children }: { x: number; label: string; children?: React.ReactNode }) {
  const drop = 0.26
  return (
    <group position={[x, 0, 0]} name={`pan-${label}`}>
      {[-0.1, 0.1].map((dz) => (
        <mesh key={dz} position={[0, -drop / 2, dz]}>
          <cylinderGeometry args={[0.003, 0.003, drop, 4]} />
          <meshStandardMaterial color={IRON} />
        </mesh>
      ))}
      <mesh position={[0, -drop, 0]}>
        <cylinderGeometry args={[0.14, 0.11, 0.02, 20]} />
        <meshStandardMaterial color={COPPER} roughness={0.5} metalness={0.5} />
      </mesh>
      <group position={[0, -drop + 0.01, 0]}>{children}</group>
    </group>
  )
}

/* ---- tags ----------------------------------------------------------------- */

function Tag({ children, small, dark, wide, testid }: { children: React.ReactNode; small?: boolean; dark?: boolean; wide?: boolean; testid?: string }) {
  return (
    <span
      className={`lg ${dark ? 'lg-dark' : ''}`}
      data-testid={testid}
      style={{
        display: 'inline-block',
        whiteSpace: 'nowrap',
        padding: small ? '3px 9px' : wide ? '6px 14px' : '5px 12px',
        borderRadius: 999,
        font: `900 ${small ? 11 : wide ? 13.5 : 13}px Nunito, ui-rounded, system-ui, sans-serif`,
        color: dark ? '#F6F2E8' : '#2A2823',
        boxShadow: '0 8px 20px -10px rgba(40,26,10,.6)',
      }}
    >
      {children}
    </span>
  )
}

function fmt(n: number): string {
  return n.toLocaleString('en-GB')
}
