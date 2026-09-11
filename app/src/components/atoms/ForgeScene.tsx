import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getQualityCaps, reportFrame, useQualityCaps } from '@/lib/quality'
import PerfProbe from '@/components/PerfProbe'
import { stepAtoms, type AtomSim } from '@/lib/atoms'
import type { Bench, Kind } from '@/lib/foundry'
import { rngFor } from '@/lib/challenge'
import PostFX from '@/components/photo/world/PostFX'
import { glyphTexture } from '@/components/photo/Glyphs'
import FoundryWorld from './FoundryWorld'
import BuildAtom from './BuildAtom'
import TableWall from './TableWall'
import BenchStage from './BenchStage'
import Dispensers, { type ParticleKind } from './Dispensers'
import AtomCamera from './AtomCamera'

/**
 * The Foundry Game's scene — the Atom Foundry's room with two changes.
 *
 * 1. The wall's ghost frame follows **protons**, not electrons. An ion is the
 *    same element; the tile it belongs to must not move when an electron
 *    leaves. (`lib/atoms` already names the build by proton count — the wall
 *    now agrees with it.)
 * 2. A **rain** of particles for the gather round: seeded, so two people on
 *    one link catch from the same sky; tapped, not timed, so the clock is a
 *    catch and never a countdown.
 *
 * No probe in this scene: the ionisation "grip" is a later door, not the way
 * in.
 */

function SimTicker({ sim }: { sim: AtomSim }) {
  useFrame((_, rawDt) => {
    reportFrame(rawDt)
    stepAtoms(sim, Math.min(rawDt, 0.25))
  })
  return null
}

const KIND_COLOR: Record<Kind, string> = { proton: '#E8A33D', neutron: '#9AA4B2', electron: '#63E0FF' }
const KIND_GLYPH: Record<Kind, string> = { proton: 'p⁺', neutron: 'n⁰', electron: 'e⁻' }

interface Drop {
  kind: Kind
  x: number
  z: number
  /** sim seconds at which it starts to fall */
  at: number
  /** fall duration */
  dur: number
}

/**
 * The rain. `drops` are laid out from the seed once; each falls from above the
 * wall to the floor over `dur` seconds and fades. Tapping one banks it and
 * pops it. Nothing here decides the outcome on its own — the bank is the
 * page's, this only reports taps.
 */
function Rain({
  sim,
  seed,
  kinds,
  startAt,
  seconds,
  onCatch,
}: {
  sim: AtomSim
  seed: number
  kinds: Kind[]
  startAt: number
  seconds: number
  onCatch: (kind: Kind) => void
}) {
  const drops = useMemo<Drop[]>(() => {
    const rng = rngFor(seed ^ 0x5eed)
    return kinds.map((kind, i) => ({
      kind,
      // the clear band between the HUD columns, and in front of the wall so the drops read large
      x: -2.1 + rng() * 4.2,
      z: 0.2 + rng() * 2.4,
      at: startAt + (i / kinds.length) * seconds,
      dur: 3.6 + rng() * 1.8,
    }))
  }, [seed, kinds, startAt, seconds])
  const glyphs = useMemo(
    () => ({
      proton: glyphTexture(KIND_GLYPH.proton, '#FFF6E8', { strokeWidth: 6, strokeColor: 'rgba(38, 24, 12, 0.9)' }),
      neutron: glyphTexture(KIND_GLYPH.neutron, '#FFF6E8', { strokeWidth: 6, strokeColor: 'rgba(38, 24, 12, 0.9)' }),
      electron: glyphTexture(KIND_GLYPH.electron, '#FFF6E8', { strokeWidth: 6, strokeColor: 'rgba(38, 24, 12, 0.9)' }),
    }),
    [],
  )
  return (
    <group>
      {drops.map((d, i) => (
        <Drop key={i} d={d} sim={sim} glyph={glyphs[d.kind]} onCatch={() => onCatch(d.kind)} />
      ))}
    </group>
  )
}

function Drop({ d, sim, glyph, onCatch }: { d: Drop; sim: AtomSim; glyph: { texture: THREE.Texture; aspect: number }; onCatch: () => void }) {
  const group = useRef<THREE.Group>(null)
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  /** sim time of the catch, for the pop; null while still falling */
  const caughtAt = useRef<number | null>(null)
  const r = d.kind === 'electron' ? 0.11 : 0.16
  useFrame(() => {
    const g = group.current
    if (!g) return
    const t = sim.time
    if (t < d.at) {
      g.visible = false
      return
    }
    if (caughtAt.current !== null) {
      // pop: swell and vanish over a third of a second
      const k = Math.min(1, (t - caughtAt.current) / 0.32)
      g.visible = k < 1
      g.scale.setScalar(1 + k * 1.6)
      if (mat.current) mat.current.opacity = 1 - k
      return
    }
    const k = (t - d.at) / d.dur
    if (k > 1.15) {
      g.visible = false
      return
    }
    g.visible = true
    // A gentle ease so the top of the fall is slow enough to tap.
    const y = 4.6 - Math.min(1, k) * 4.4 + Math.sin(t * 3 + d.x) * 0.03
    g.position.set(d.x + Math.sin(t * 0.9 + d.z) * 0.12, y, d.z)
    g.scale.setScalar(k > 1 ? 1 - (k - 1) / 0.15 : 1)
    if (mat.current) mat.current.opacity = k > 1 ? 1 - (k - 1) / 0.15 : 1
  })
  return (
    <group
      ref={group}
      visible={false}
      onClick={(e) => {
        e.stopPropagation()
        if (caughtAt.current !== null) return
        const t = sim.time
        if (t < d.at || (t - d.at) / d.dur > 1.15) return
        caughtAt.current = t
        onCatch()
      }}
    >
      {/* a generous invisible hit target — fingers are wide, drops are small */}
      <mesh>
        <sphereGeometry args={[r * 2.6, 8, 6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[r, 18, 14]} />
        <meshStandardMaterial ref={mat} color={KIND_COLOR[d.kind]} emissive={KIND_COLOR[d.kind]} emissiveIntensity={0.9} roughness={0.35} transparent />
      </mesh>
      <mesh position={[0, r + 0.12, 0]} renderOrder={2}>
        <planeGeometry args={[0.2 * glyph.aspect, 0.2]} />
        <meshBasicMaterial map={glyph.texture} transparent opacity={0.95} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

interface Props {
  sim: AtomSim
  protons: number
  neutrons: number
  electrons: number
  discovered: number[]
  showNeutrons: boolean
  rain: { seed: number; kinds: Kind[]; startAt: number; seconds: number } | null
  /** Door 2's two pads and the prediction. Null on a forge level. */
  bench: Bench | null
  /** True once the prediction is locked: the jar may fill. */
  showProduct: boolean
  /** True on a landscape phone: its own, closer framing. */
  phone: boolean
  /** Pixels of HUD along the bottom edge that the shot must compose above. */
  hudBottom: number
  onAdd: (kind: ParticleKind) => void
  onCatch: (kind: Kind) => void
  onTile: (z: number) => void
  onContextLost: () => void
}

/** Full-viewport canvas for the Foundry Game. Code-split via React.lazy by the page. */
export default function ForgeScene({ sim, protons, neutrons, electrons, discovered, showNeutrons, rain, bench, showProduct, phone, hudBottom, onAdd, onCatch, onTile, onContextLost }: Props) {
  const quality = useQualityCaps()
  return (
    <Canvas
      dpr={[1, quality.maxDpr]}
      camera={{ fov: 46, near: 0.05, far: 200, position: [0, 2.5, 7.8] }}
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
      <SimTicker sim={sim} />
      <PerfProbe cabinet="atoms" />
      <AtomCamera sim={sim} phone={phone} hudBottom={hudBottom} bench={!!bench} />
      <FoundryWorld />
      {/* The forge and the bench are two places in one room: the launchers and
          the single atom belong to Door 1, the pads and the jar to Door 2. */}
      {bench ? (
        <BenchStage bench={bench} showProduct={showProduct} />
      ) : (
        <BuildAtom sim={sim} protons={protons} neutrons={neutrons} electrons={electrons} cloudView={false} showMass={showNeutrons} onFact={() => undefined} />
      )}
      <TableWall
        sim={sim}
        discovered={discovered}
        probed={{}}
        tappable={!rain}
        ghostElectrons={protons}
        ghostBalanced={protons > 0}
        onTile={onTile}
        onWallFact={() => undefined}
      />
      {!bench && <Dispensers sim={sim} showNeutrons={showNeutrons} onAdd={onAdd} />}
      {rain && <Rain sim={sim} seed={rain.seed} kinds={rain.kinds} startAt={rain.startAt} seconds={rain.seconds} onCatch={onCatch} />}
      <PostFX />
    </Canvas>
  )
}
