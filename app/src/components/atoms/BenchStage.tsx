import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { glyphTexture } from '@/components/photo/Glyphs'
import { ELEMENT_BY_Z } from '@/lib/atoms'
import { reactionFor, type Structure } from '@/lib/matter'
import type { Bench } from '@/lib/foundry'
import { ContactShadow } from './FoundryWorld'

/**
 * Door 2 in the world: two pads, and the jar the product assembles in.
 *
 * Three rules from the Matter Works notes are load-bearing here, and each one
 * was learned by getting it wrong on screen first.
 *
 * **A lattice must interleave, or it teaches the opposite.** The first version
 * advanced its site counter with the innermost loop axis, so a 3:1 lattice
 * built three slabs of one element against one slab of the other — two
 * substances stacked, which is precisely what a compound is not.
 *
 * **Product atoms carry their symbol, drawn through the geometry.** Unlabelled
 * coloured balls in a two-colour lattice ask the learner to take on trust which
 * ball is which, and that trust is the entire content of the picture.
 *
 * **CPK colours, not family tints.** Family tint makes water three green balls,
 * because hydrogen and oxygen are both non-metals.
 */

/** CPK, the convention every chemistry book uses. */
const CPK: Record<number, string> = {
  1: '#F4F4F4',
  3: '#7A4FCF',
  4: '#4CC300',
  5: '#FFB5B5',
  6: '#3B3B3B',
  7: '#3050F8',
  8: '#E8493A',
  9: '#8FE04E',
  10: '#9FD9E8',
  11: '#AB5CF2',
  12: '#8AFF00',
  13: '#BFA6A6',
  14: '#E9C79B',
  15: '#FF8000',
  16: '#E8D33A',
  17: '#4BE04B',
  18: '#7FD1E3',
  19: '#8F40D4',
  20: '#3DFF00',
}

function cpk(z: number): string {
  return CPK[z] ?? '#B9B09A'
}

/** Where the pads sit: on the bench, low, and inside the clear band. */
const PAD_Y = 0.42
const PAD_Z = 0.9
const PAD_X = 1.35

/** A rough radius, so a hydrogen does not draw the same size as a calcium. */
function radiusOf(z: number): number {
  if (z === 1) return 0.17
  if (z <= 10) return 0.26
  return 0.32
}

/** One atom on a pad, with its symbol on a plate that ignores depth. */
function PadAtom({ z, x }: { z: number; x: number }) {
  const el = ELEMENT_BY_Z[z]
  const label = useMemo(
    () => glyphTexture(el?.symbol ?? '?', '#FFF6E8', { strokeWidth: 6, strokeColor: 'rgba(38, 24, 12, 0.9)' }),
    [el?.symbol],
  )
  const bob = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (bob.current) bob.current.position.y = PAD_Y + Math.sin(clock.elapsedTime * 1.3 + x) * 0.035
  })
  // Objects on a bench must be near the bench. An atom floating at head height
  // over a pad on the ground reads as two unrelated things.
  const r = radiusOf(z) * 0.5
  return (
    <group position={[x, 0, PAD_Z]}>
      {/* the pad: a light pool and a contact shadow, never a brass ring —
          a glow says "resting here", a ring says "bolted down", and it is not */}
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.35, 32]} />
        <meshBasicMaterial color="#E8A33D" transparent opacity={0.55} depthWrite={false} toneMapped={false} />
      </mesh>
      <ContactShadow position={[0, 0, 0]} radius={0.42} opacity={0.3} />
      <group ref={bob} position={[0, PAD_Y, 0]}>
        <mesh>
          <sphereGeometry args={[r, 24, 18]} />
          <meshStandardMaterial color={cpk(z)} roughness={0.35} metalness={0.05} emissive={cpk(z)} emissiveIntensity={0.12} />
        </mesh>
        <mesh position={[0, 0, r + 0.01]} renderOrder={4}>
          <planeGeometry args={[0.22 * label.aspect, 0.22]} />
          <meshBasicMaterial map={label.texture} transparent depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

interface Site {
  pos: [number, number, number]
  z: number
}

/**
 * Where the product's atoms sit.
 *
 * A lattice is built by walking a cube of cells and choosing which element
 * occupies each site. At 1:1 that is an exact rock-salt checkerboard — the
 * parity of x+y+z. At every other ratio the parity trick does not exist, so
 * the cell coordinates are hashed and a fixed count of minority sites is taken:
 * the minority element scatters, and the proportion stays honest.
 *
 * A molecule is built around whichever atom appears once, with the others
 * placed on a ring whose opening angle comes from the shape the model derived.
 */
function sitesFor(za: number, zb: number, structure: Structure, parts: Array<[string, number]>, shape: string): Site[] {
  const A = ELEMENT_BY_Z[za]
  const B = ELEMENT_BY_Z[zb]
  if (!A || !B) return []
  const nOf = (sym: string) => parts.find(([s]) => s === sym)?.[1] ?? 1
  const na = nOf(A.symbol)
  const nb = nOf(B.symbol)

  if (structure === 'lattice' || structure === 'network') {
    const sites: Site[] = []
    const n = 3
    const step = 0.44
    const minorityIsB = nb <= na
    const majority = minorityIsB ? za : zb
    const minority = minorityIsB ? zb : za
    const ratio = minorityIsB ? nb / (na + nb) : na / (na + nb)
    const cells: Array<[number, number, number]> = []
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) cells.push([i, j, k])
    const even = na === nb
    // A fixed count, chosen by hash — not "every third cell", which lines up
    // into slabs exactly the way the first version did.
    const wantMinority = Math.round(cells.length * ratio)
    const ranked = even
      ? []
      : [...cells]
          .map((c) => ({ c, h: Math.abs(Math.sin(c[0] * 12.9898 + c[1] * 78.233 + c[2] * 37.719) * 43758.5453) % 1 }))
          .sort((p, q) => p.h - q.h)
          .slice(0, wantMinority)
          .map(({ c }) => c.join(','))
    const chosen = new Set(ranked)
    for (const [i, j, k] of cells) {
      const isMinority = even ? (i + j + k) % 2 === 1 : chosen.has([i, j, k].join(','))
      sites.push({
        pos: [(i - (n - 1) / 2) * step, (j - (n - 1) / 2) * step, (k - (n - 1) / 2) * step],
        z: isMinority ? minority : majority,
      })
    }
    return sites
  }

  // A molecule: the atom that appears once is the centre.
  const centreZ = na === 1 ? za : zb
  const outerZ = centreZ === za ? zb : za
  const count = centreZ === za ? nb : na
  const sites: Site[] = [{ pos: [0, 0, 0], z: centreZ }]
  const bond = radiusOf(centreZ) + radiusOf(outerZ) + 0.06
  if (count === 1) {
    sites.push({ pos: [bond, 0, 0], z: outerZ })
  } else if (shape === 'linear') {
    sites.push({ pos: [bond, 0, 0], z: outerZ }, { pos: [-bond, 0, 0], z: outerZ })
  } else if (shape === 'bent') {
    // 104.5°, which is what two neighbours and two lone pairs actually give.
    const half = (104.5 * Math.PI) / 180 / 2
    sites.push({ pos: [Math.sin(half) * bond, Math.cos(half) * bond, 0], z: outerZ })
    sites.push({ pos: [-Math.sin(half) * bond, Math.cos(half) * bond, 0], z: outerZ })
  } else {
    // trigonal / tetrahedral: spread them evenly around, tilted down a little
    const tilt = shape === 'trigonal pyramidal' ? -0.35 : 0
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      sites.push({
        pos: [Math.cos(a) * bond * Math.cos(tilt), Math.sin(tilt) * bond, Math.sin(a) * bond * Math.cos(tilt)],
        z: outerZ,
      })
    }
  }
  return sites
}

/**
 * The jar, and what is in it.
 *
 * `fit` normalises against the structure's own measured extent rather than a
 * fixed scale — a 3:1 lattice is half again as wide as 1:1, and the version
 * with a fixed scale sent sodium nitride through the cork and out of the
 * bottom of the jar.
 */
function Jar({ bench, show }: { bench: Bench; show: boolean }) {
  const group = useRef<THREE.Group>(null)
  const built = useMemo(() => {
    if (bench.a === null || bench.b === null) return null
    const r = reactionFor(bench.a, bench.b)
    if (!r.formula || !r.structure || r.structure === 'mixture') return null
    const sites = sitesFor(bench.a, bench.b, r.structure, r.formula.parts, r.shape)
    if (!sites.length) return null
    let extent = 0
    for (const s of sites) extent = Math.max(extent, Math.hypot(s.pos[0], s.pos[1], s.pos[2]) + radiusOf(s.z))
    const fit = 0.62 / Math.max(0.001, extent)
    return { sites, fit, r }
  }, [bench.a, bench.b])

  // One symbol plate per *element*, riding the frontmost atom of its kind: a
  // key, not a hedge. Twenty-seven labelled balls would be unreadable.
  const keys = useMemo(() => {
    if (!built) return []
    const seen = new Map<number, Site>()
    for (const s of built.sites) {
      const cur = seen.get(s.z)
      if (!cur || s.pos[2] > cur.pos[2]) seen.set(s.z, s)
    }
    return [...seen.entries()].map(([z, s]) => ({ z, s }))
  }, [built])

  useFrame(({ clock }) => {
    if (group.current) group.current.rotation.y = clock.elapsedTime * 0.28
  })

  return (
    <group position={[0, 0, -1.1]}>
      {/* the jar: a cylinder and a cork, drawn back-face-first so the contents read */}
      <mesh position={[0, 0.82, 0]}>
        <cylinderGeometry args={[0.78, 0.72, 1.5, 28, 1, true]} />
        <meshStandardMaterial color="#CFE3E6" roughness={0.12} metalness={0.05} transparent opacity={0.24} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={[0, 1.63, 0]}>
        <cylinderGeometry args={[0.6, 0.66, 0.22, 24]} />
        <meshStandardMaterial color="#A9743E" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.78, 0.78, 0.1, 28]} />
        <meshStandardMaterial color="#B9CDD1" roughness={0.3} transparent opacity={0.5} />
      </mesh>
      <ContactShadow position={[0, 0, 0]} radius={0.95} opacity={0.32} />

      {show && built && (
        <group ref={group} position={[0, 0.82, 0]} scale={built.fit}>
          {built.sites.map((s, i) => (
            <mesh key={i} position={s.pos}>
              <sphereGeometry args={[radiusOf(s.z), 16, 12]} />
              <meshStandardMaterial color={cpk(s.z)} roughness={0.36} metalness={0.05} />
            </mesh>
          ))}
          {keys.map(({ z, s }) => (
            <KeyLabel key={z} z={z} pos={s.pos} />
          ))}
        </group>
      )}
    </group>
  )
}

/** A symbol drawn **through** the geometry — otherwise it hides behind the next ball along. */
function KeyLabel({ z, pos }: { z: number; pos: [number, number, number] }) {
  const el = ELEMENT_BY_Z[z]
  const label = useMemo(
    () => glyphTexture(el?.symbol ?? '?', '#FFF6E8', { strokeWidth: 7, strokeColor: 'rgba(38, 24, 12, 0.95)' }),
    [el?.symbol],
  )
  const r = radiusOf(z)
  return (
    <sprite position={[pos[0], pos[1] + r + 0.16, pos[2]]} scale={[0.34 * label.aspect, 0.34, 1]} renderOrder={5}>
      <spriteMaterial map={label.texture} transparent depthTest={false} depthWrite={false} toneMapped={false} />
    </sprite>
  )
}

export default function BenchStage({ bench, showProduct }: { bench: Bench; showProduct: boolean }) {
  return (
    <group>
      {bench.a !== null && <PadAtom z={bench.a} x={-PAD_X} />}
      {bench.b !== null && <PadAtom z={bench.b} x={PAD_X} />}
      {/* the empty pads, so a learner can see where the atoms go */}
      {[[-PAD_X, bench.a] as const, [PAD_X, bench.b] as const].map(([x, z]) =>
        z === null ? (
          <mesh key={x} position={[x, 0.012, PAD_Z]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.3, 0.35, 32]} />
            <meshBasicMaterial color="#B9A98A" transparent opacity={0.4} depthWrite={false} toneMapped={false} />
          </mesh>
        ) : null,
      )}
      <Jar bench={bench} show={showProduct} />
    </group>
  )
}
