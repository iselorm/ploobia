import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { CuboidCollider } from '@react-three/rapier'
import { getSimTime, getWorld, mouldLookOf, mouldShown, registerInteractable, useWorld } from '@/lib/archipelago'
import { useBand } from '@/lib/bands'
import { INGOT_G, PATTERN_CM3, POUR_BEATS, RUNNER_G, castCm3, castG, lastPour, type MouldLook, type Pour } from '@/lib/supply'
import Tag from './SceneTag'
import { BASIN_AT, CHANNEL, MOULD, MOULD_AT, MOULD_REACH, MOULD_VERB_AT, SAND, STRAP, TRAY_AT } from './mouldLayout'

/**
 * S2 round A2 — the gate mould at the furnace foot (storyboard v3.1 §03 M4,
 * §07; mock v2 frame 6). Object first: the mould is the moment. It lies open
 * and empty in a bed of casting sand, showing the shape it wants; it is
 * clamped shut when the charge arrives; the channel runs, the metal dulls,
 * the lid lifts — and what the pour gave lies in the cavity it should have
 * filled, the unfilled end marked on the stone itself.
 *
 * Stand-in props in the Foundry's register until the Gate_Mould art lands.
 * Every number is lib/supply.ts's; the beats are read off the sim clock.
 * Scene handles for suites: `cast-mould` (userData.look, .lid, .fraction),
 * `cast-tray` (userData.spareG), `cast-channel` (userData.glow).
 */

const STONE = '#857E73'
const STONE_DARK = '#6C665D'
const CAVITY = '#2B2621'
const SAND_C = '#6A5540'
const IRON = '#3D332A'
const COPPER_CAST = '#B8683A'
const AMBER = '#E8A33D'
const MOLTEN = '#FFB347'
const MOLTEN_E = '#FF7A2E'

/** The lid's angle when the mould lies open, radians past vertical. */
const LID_OPEN = 1.92
/** Where along the strap (0..1 from the west end) the second pin hole sits. */
const HOLE_AT = [0.14, 0.86] as const
const PIN_X = [-0.26, 0.3] as const

const ease = (t: number): number => {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

/** Set the emissive strength of every material under a group — only when it has changed. */
function setEmissive(g: THREE.Group | null, v: number): void {
  if (!g || g.userData.emissive === v) return
  g.userData.emissive = v
  g.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
    if (m && 'emissiveIntensity' in m) m.emissiveIntensity = v
  })
}

/** Seconds since the last pour began, or null when no pour's clock is running. */
function pourElapsed(): number | null {
  const at = getWorld().supply?.pouredAt
  return at == null ? null : getSimTime() - at
}

/** How bright the metal in the mould is, 0..1: it arrives late in the run, then dulls through the cooling. */
function mouldGlow(look: MouldLook, el: number | null): number {
  if (el == null) return 0
  if (look === 'run') return ease((el / POUR_BEATS.run - 0.5) / 0.5)
  if (look === 'cool') return 1 - ease((el - POUR_BEATS.run) / POUR_BEATS.cool)
  return 0
}

export default function MouldScene() {
  const s = useWorld()
  const shown = mouldShown(s) && s.zone === 'foundry'
  useEffect(() => {
    if (!shown) return
    return registerInteractable({ id: 'cast.mould', verb: 'measure', label: 'The gate mould', pos: MOULD_VERB_AT, radius: MOULD_REACH })
  }, [shown])
  const [band] = useBand()
  if (!shown) return null
  const look = mouldLookOf(s)
  const pour = lastPour(s.supply?.cast)
  // What lies in the cavity: nothing until a pour has been revealed (or is being revealed).
  const revealed = look === 'open' || look === 'short' || look === 'full'
  return (
    <group name="cast" position={MOULD_AT}>
      <CuboidCollider args={[MOULD.len / 2, 0.16, MOULD.wid / 2]} position={[0, 0.16, 0]} />
      <SandBed />
      <Spout />
      <Mould look={look} pour={revealed ? pour : null} />
      <Tray look={look} pour={pour} inRoom={s.room === 'mould'} band={band} />
      {s.room === 'mould' && <Tags look={look} pour={pour} band={band} />}
    </group>
  )
}

/* ---- the bed and the spout ------------------------------------------------ */

function SandBed() {
  return (
    <group name="cast-sand">
      <mesh position={[0, SAND.top / 2, 0]} receiveShadow>
        <boxGeometry args={[SAND.w, SAND.top, SAND.d]} />
        <meshStandardMaterial color={SAND_C} roughness={1} />
      </mesh>
      {/* a timber kerb round the bed, so it reads as a made place and not a stain */}
      {(
        [
          // no kerb on the north side: the spout from the channel crosses there
          [0, SAND.d / 2, SAND.w + 0.12, 0.09],
          [SAND.w / 2, 0, 0.09, SAND.d],
          [-SAND.w / 2, 0, 0.09, SAND.d],
        ] as const
      ).map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, 0.05, z]} castShadow>
          <boxGeometry args={[w, 0.1, d]} />
          <meshStandardMaterial color="#5E4530" roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

/** The last stretch from the channel's foot to the pouring basin: a stone lip, angled to the mould's west shoulder. */
function Spout() {
  const from: [number, number] = [0, CHANNEL.z1 - MOULD_AT[2]]
  const to: [number, number] = [BASIN_AT[0], BASIN_AT[2]]
  const len = Math.hypot(to[0] - from[0], to[1] - from[1])
  const yaw = Math.atan2(to[0] - from[0], to[1] - from[1])
  return (
    <group position={[(from[0] + to[0]) / 2, 0, (from[1] + to[1]) / 2]} rotation={[0, yaw, 0]} name="cast-spout">
      <mesh position={[0, 0.06, 0]} receiveShadow>
        <boxGeometry args={[0.3, 0.12, len + 0.1]} />
        <meshStandardMaterial color="#8A6A48" roughness={0.5} />
      </mesh>
    </group>
  )
}

/* ---- the mould ------------------------------------------------------------- */

function Mould({ look, pour }: { look: MouldLook; pour: Pour | null }) {
  const lid = useRef<THREE.Group>(null)
  const seam = useRef<THREE.MeshStandardMaterial>(null)
  const basin = useRef<THREE.MeshStandardMaterial>(null)
  const metal = useRef<THREE.Group>(null)
  const gap = useRef<THREE.Group>(null)
  const reduced = useMemo(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, [])
  const shut = look === 'waiting' || look === 'run' || look === 'cool'
  const first = useRef(true)
  useFrame((state, dtRaw) => {
    const dt = Math.min(0.05, dtRaw)
    const el = pourElapsed()
    const now = mouldLookOf(getWorld())
    // The lid: shut for the pour, lifted on the 'open' beat by the clock, otherwise lying open.
    const closed = now === 'waiting' || now === 'run' || now === 'cool'
    const want = closed ? 0 : now === 'open' && el != null ? LID_OPEN * ease((el - POUR_BEATS.run - POUR_BEATS.cool) / POUR_BEATS.open) : LID_OPEN
    const g = lid.current
    if (g) {
      // The first frame snaps (a mould found open is not seen opening); the 'open' beat follows the clock exactly.
      if (first.current || now === 'open') g.rotation.x = -want
      else g.rotation.x += (-want - g.rotation.x) * (1 - Math.pow(0.002, dt))
      first.current = false
    }
    const glow = mouldGlow(now, el)
    if (seam.current) {
      seam.current.emissiveIntensity = glow * 1.8
      seam.current.opacity = glow
    }
    if (basin.current) basin.current.emissiveIntensity = glow * 1.6
    // The cast keeps a little of its heat as the lid lifts, then none: nobody touches it bright.
    setEmissive(metal.current, now === 'open' && el != null ? Math.round(35 * (1 - ease((el - POUR_BEATS.run - POUR_BEATS.cool) / POUR_BEATS.open))) / 100 : 0)
    // The gap breathes so the eye goes to it first (steady under reduced motion).
    setEmissive(gap.current, reduced ? 0.9 : Math.round((0.7 + 0.45 * Math.sin(state.clock.elapsedTime * 3.2)) * 20) / 20)
  })
  const y = MOULD.top
  const f = pour ? pour.fraction : 0
  const x0 = -STRAP.len / 2
  const xEnd = x0 + f * STRAP.len
  const r = STRAP.wid / 2
  const holeFormed = (i: number): boolean => x0 + HOLE_AT[i] * STRAP.len + 0.035 < xEnd + 1e-6
  return (
    <group name="cast-mould" userData={{ look, lid: shut ? 'shut' : 'open', fraction: f }}>
      {/* the lower half, sunk in the sand */}
      <mesh position={[0, y / 2 + 0.015, 0]} castShadow receiveShadow>
        <boxGeometry args={[MOULD.len, y - 0.03, MOULD.wid]} />
        <meshStandardMaterial color={STONE} roughness={0.95} />
      </mesh>
      {/* the pouring basin on the north-west shoulder */}
      <mesh position={[BASIN_AT[0], y / 2 + 0.015, BASIN_AT[2]]} castShadow>
        <boxGeometry args={[0.3, y - 0.03, 0.26]} />
        <meshStandardMaterial color={STONE_DARK} roughness={0.95} />
      </mesh>
      <mesh position={[BASIN_AT[0], y + 0.002, BASIN_AT[2]]}>
        <cylinderGeometry args={[0.085, 0.085, 0.006, 18]} />
        <meshStandardMaterial ref={basin} color={CAVITY} emissive={MOLTEN_E} emissiveIntensity={0} roughness={0.6} toneMapped={false} />
      </mesh>

      {/* the cavity: the shape the copper has to fill — a strap, two pin holes' bosses, two pins on their sprues */}
      <group position={[0, y + 0.002, 0]} name="cast-cavity">
        <Strap from={x0} to={x0 + STRAP.len} z={STRAP.z} r={r} h={0.004} color={CAVITY} capEnd />
        {PIN_X.map((px) => (
          <PinShape key={px} x={px} h={0.004} color={CAVITY} />
        ))}
        {/* the runner from the basin to the strap's west end */}
        <mesh position={[x0 - 0.01, 0, (BASIN_AT[2] + 0.1 + STRAP.z) / 2]}>
          <boxGeometry args={[0.05, 0.004, Math.abs(BASIN_AT[2] + 0.1 - STRAP.z)]} />
          <meshStandardMaterial color={CAVITY} roughness={0.8} />
        </mesh>
      </group>

      {/* what the pour gave, lying in the cavity */}
      {pour && (
        <group ref={metal} position={[0, y + 0.006, 0]} name="cast-metal">
          <Strap from={x0} to={xEnd} z={STRAP.z} r={r - 0.008} h={0.034} color={COPPER_CAST} capEnd lip={pour.short} />
          {HOLE_AT.map((_, i) =>
            holeFormed(i) ? (
              <mesh key={i} position={[x0 + HOLE_AT[i] * STRAP.len, 0.035, STRAP.z]}>
                <cylinderGeometry args={[0.03, 0.03, 0.004, 14]} />
                <meshStandardMaterial color={CAVITY} roughness={0.8} />
              </mesh>
            ) : null,
          )}
          {/* a pin is cast only if the copper reached its sprue */}
          {xEnd >= PIN_X[0] && <PinShape x={PIN_X[0]} h={0.034} color={COPPER_CAST} inset name="cast-pin-0" />}
          {!pour.pinSeatMissing && <PinShape x={PIN_X[1]} h={0.034} color={COPPER_CAST} inset name="cast-pin-1" />}
        </group>
      )}

      {/* the gap, marked on the stone: where the copper never came */}
      {pour?.short && (look === 'short' || look === 'open') && (
        <group ref={gap} position={[0, y + 0.012, 0]} name="cast-gap">
          {/* a wash of amber over the empty cavity, and a dashed box round it: it should shout before any word does */}
          <mesh position={[(xEnd + 0.03 + x0 + STRAP.len + r + 0.03) / 2, -0.004, STRAP.z]}>
            <boxGeometry args={[x0 + STRAP.len + r - xEnd, 0.004, (r + 0.035) * 2]} />
            <meshStandardMaterial color={AMBER} emissive={AMBER} emissiveIntensity={0.9} transparent opacity={0.32} toneMapped={false} depthWrite={false} />
          </mesh>
          <Dashes x0={xEnd + 0.03} x1={x0 + STRAP.len + r + 0.03} z={STRAP.z} half={r + 0.035} />
          {pour.pinSeatMissing && (
            <mesh position={[PIN_X[1], 0, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.105, 0.009, 6, 24]} />
              <meshStandardMaterial color={AMBER} emissive={AMBER} emissiveIntensity={0.9} toneMapped={false} />
            </mesh>
          )}
        </group>
      )}

      {/* the glow at the seam while the metal is bright */}
      <mesh position={[0, y + 0.004, 0]}>
        <boxGeometry args={[MOULD.len + 0.02, 0.014, MOULD.wid + 0.02]} />
        <meshStandardMaterial ref={seam} color={MOLTEN} emissive={MOLTEN_E} emissiveIntensity={0} transparent opacity={0} toneMapped={false} depthWrite={false} />
      </mesh>

      {/* the upper half: hinged on the north edge, lifted back toward the furnace */}
      <group ref={lid} position={[0, y + 0.008, -MOULD.wid / 2]} name="cast-lid">
        <mesh position={[0, MOULD.lid / 2, MOULD.wid / 2]} castShadow>
          <boxGeometry args={[MOULD.len, MOULD.lid, MOULD.wid]} />
          <meshStandardMaterial color={STONE_DARK} roughness={0.95} />
        </mesh>
        {/* its own half of the cavity, on the face that meets the lower half */}
        <group position={[0, -0.006, MOULD.wid / 2]}>
          <Strap from={x0} to={x0 + STRAP.len} z={STRAP.z} r={r} h={0.004} color={CAVITY} capEnd />
        </group>
        {/* the clamp: two iron bands and a wedge, on while the mould is shut */}
        {shut &&
          [-0.42, 0.42].map((bx) => (
            <mesh key={bx} position={[bx, MOULD.lid / 2 - 0.03, MOULD.wid / 2]}>
              <boxGeometry args={[0.07, MOULD.lid + 0.1, MOULD.wid + 0.06]} />
              <meshStandardMaterial color={IRON} roughness={0.7} metalness={0.3} />
            </mesh>
          ))}
        {shut && (
          <mesh position={[0.42, MOULD.lid + 0.035, MOULD.wid / 2]} rotation={[0, 0, 0.18]}>
            <boxGeometry args={[0.16, 0.05, 0.1]} />
            <meshStandardMaterial color="#8B6B3E" roughness={0.9} />
          </mesh>
        )}
      </group>
    </group>
  )
}

/** A strap lying along x from `from` to `to`: a bar with a round west cap, and a round east cap or a frozen lip. */
function Strap({ from, to, z, r, h, color, capEnd, lip }: { from: number; to: number; z: number; r: number; h: number; color: string; capEnd?: boolean; lip?: boolean }) {
  const len = Math.max(0.001, to - from)
  const metal = color === COPPER_CAST
  const mat = () => <meshStandardMaterial color={color} roughness={metal ? 0.55 : 0.8} metalness={metal ? 0.45 : 0} emissive={metal ? MOLTEN_E : '#000000'} emissiveIntensity={0} />
  return (
    <group>
      <mesh position={[from + len / 2, h / 2, z]} castShadow={metal}>
        <boxGeometry args={[len, h, r * 2]} />
        {mat()}
      </mesh>
      <mesh position={[from, h / 2, z]} castShadow={metal}>
        <cylinderGeometry args={[r, r, h, 20]} />
        {mat()}
      </mesh>
      {capEnd && (
        // A full strap ends in the same round cap; a short one in a frozen lip, a wave that stopped.
        <group position={[to, h / 2, z]} scale={[lip ? 0.45 : 1, lip ? 0.8 : 1, 1]}>
          <mesh castShadow={metal}>
            <cylinderGeometry args={[r, r, h, 20]} />
            {mat()}
          </mesh>
        </group>
      )}
    </group>
  )
}

/** A gate pin beside the strap: a short shank on its sprue and a domed head, toward the yard. */
function PinShape({ x, h, color, inset, name }: { x: number; h: number; color: string; inset?: boolean; name?: string }) {
  const metal = color === COPPER_CAST
  const k = inset ? 0.86 : 1
  const mat = <meshStandardMaterial color={color} roughness={metal ? 0.55 : 0.8} metalness={metal ? 0.45 : 0} emissive={metal ? MOLTEN_E : '#000000'} emissiveIntensity={0} />
  return (
    <group position={[x, h / 2, 0]} name={name}>
      {/* the sprue from the strap's edge */}
      <mesh position={[0, 0, 0.05]}>
        <boxGeometry args={[0.022 * k, h, 0.07]} />
        {mat}
      </mesh>
      <mesh position={[0, 0, 0.15]} castShadow={metal}>
        <boxGeometry args={[0.07 * k, h, 0.15]} />
        {mat}
      </mesh>
      <mesh position={[0, 0, 0.24]} castShadow={metal}>
        <cylinderGeometry args={[0.055 * k, 0.055 * k, h, 16]} />
        {mat}
      </mesh>
    </group>
  )
}

/** An amber dashed box round the stretch of cavity the copper never reached. */
function Dashes({ x0, x1, z, half }: { x0: number; x1: number; z: number; half: number }) {
  const n = Math.max(2, Math.round((x1 - x0) / 0.07))
  const step = (x1 - x0) / n
  const bars: [number, number, number, number][] = []
  for (let i = 0; i < n; i += 1) {
    const x = x0 + (i + 0.5) * step
    bars.push([x, z - half, step * 0.55, 0.022], [x, z + half, step * 0.55, 0.022])
  }
  for (const dz of [-half * 0.5, half * 0.5]) bars.push([x1, z + dz, 0.022, half * 0.6])
  return (
    <group>
      {bars.map(([x, bz, w, d], i) => (
        <mesh key={i} position={[x, 0, bz]}>
          <boxGeometry args={[w, 0.008, d]} />
          <meshStandardMaterial color={AMBER} emissive={AMBER} emissiveIntensity={0.9} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

/* ---- the recovery tray ------------------------------------------------------ */

function Tray({ look, pour, inRoom, band }: { look: MouldLook; pour: Pour | null; inRoom: boolean; band: string }) {
  const back = pour && (look === 'short' || look === 'full') ? pour.spareG : 0
  const spare = Math.max(0, Math.round((back - RUNNER_G) / INGOT_G))
  const at: [number, number, number] = [TRAY_AT[0] - MOULD_AT[0], 0, TRAY_AT[2] - MOULD_AT[2]]
  const label = band === 'explorer' ? (spare > 0 ? 'The runner and the spare come back' : 'The runner comes back') : `${fmt(back)} g back in the tray`
  return (
    <group position={at} rotation={[0, 0.12, 0]} name="cast-tray" userData={{ spareG: back }}>
      <mesh position={[0, 0.03 + SAND.top, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 0.06, 0.42]} />
        <meshStandardMaterial color={IRON} roughness={0.8} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.062 + SAND.top, 0]}>
        <boxGeometry args={[0.52, 0.006, 0.34]} />
        <meshStandardMaterial color="#2A231D" roughness={0.9} />
      </mesh>
      {back > 0 && (
        <>
          {/* the runner: the channel's copper, knocked off the cast */}
          <mesh position={[-0.1, 0.085 + SAND.top, 0.02]} rotation={[0, 0.5, 0]} castShadow>
            <boxGeometry args={[0.3, 0.035, 0.05]} />
            <meshStandardMaterial color={COPPER_CAST} roughness={0.55} metalness={0.45} />
          </mesh>
          {Array.from({ length: Math.min(4, spare) }, (_, i) => (
            <mesh key={i} position={[0.15, 0.08 + SAND.top + Math.floor(i / 2) * 0.035, -0.08 + (i % 2) * 0.13]} castShadow>
              <boxGeometry args={[0.14, 0.03, 0.09]} />
              <meshStandardMaterial color={COPPER_CAST} roughness={0.55} metalness={0.45} />
            </mesh>
          ))}
        </>
      )}
      {inRoom && back > 0 && (
        <Html position={[0, 0.34, 0]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
          <Tag small testid="tray-tag">
            {label}
          </Tag>
        </Html>
      )}
    </group>
  )
}

/* ---- the readings, on the object -------------------------------------------- */

function Tags({ look, pour, band }: { look: MouldLook; pour: Pour | null; band: string }) {
  const words = band !== 'explorer'
  let main: string
  switch (look) {
    case 'cold':
      main = 'The gate mould · empty'
      break
    case 'waiting':
      main = 'Clamped · the charge is on the fire'
      break
    case 'run':
      main = 'Pouring'
      break
    case 'cool':
    case 'open':
      main = 'Dulling'
      break
    case 'short':
      // Volume only, at every band: how much copper that is, and where it went missing, is theirs to find.
      main = pour ? `${fmt(castCm3(pour))} of ${fmt(PATTERN_CM3)} cm³` : ''
      break
    case 'full':
      main = pour ? (words ? `In ${fmt(pour.chargeG)} g = cast ${fmt(castG(pour))} g + tray ${fmt(pour.spareG)} g` : `${fmt(PATTERN_CM3)} of ${fmt(PATTERN_CM3)} cm³`) : ''
      break
  }
  const xEnd = pour ? -STRAP.len / 2 + pour.fraction * STRAP.len : 0
  return (
    <>
      <Html position={[-0.1, 0.46, -0.52]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
        <Tag wide testid="mould-tag">
          {main}
        </Tag>
      </Html>
      {look === 'short' && pour && (
        <Html position={pour.pinSeatMissing ? [PIN_X[1] + 0.5, 0.1, 0.16] : [xEnd + 0.36, 0.2, STRAP.z - 0.16]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
          <Tag small dark testid="missing-tag">
            {pour.pinSeatMissing ? 'the last pin seat never filled' : 'the end never filled'}
          </Tag>
        </Html>
      )}
    </>
  )
}

/* ---- the channel -------------------------------------------------------------- */

/**
 * The pour channel from the furnace mouth. A save that poured before S2 keeps
 * it lit, as built — that copper is what Sefu melts for Sela. Once the mould
 * has taken a pour the channel is cold stone again, and during a pour a
 * stream runs down it and dulls with the cast.
 */
export function PourChannel() {
  const s = useWorld()
  const stream = useRef<THREE.Mesh>(null)
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  const root = useRef<THREE.Group>(null)
  const legacy = s.poured && (s.supply?.cast.pours.length ?? 0) === 0
  const len = CHANNEL.z1 - CHANNEL.z0
  useFrame(() => {
    const el = pourElapsed()
    const now = mouldLookOf(getWorld())
    // The front reaches the foot half-way through the run; the stream dulls through the cooling.
    const reach = now === 'run' && el != null ? ease(el / (POUR_BEATS.run * 0.5)) : now === 'cool' ? 1 : 0
    const glow = now === 'run' ? 1 : now === 'cool' && el != null ? 1 - ease((el - POUR_BEATS.run) / (POUR_BEATS.cool * 0.8)) : 0
    const m = stream.current
    if (m) {
      m.visible = reach > 0 && glow > 0.02
      m.scale.z = Math.max(0.001, reach)
      m.position.z = CHANNEL.z0 + (len * reach) / 2
    }
    if (mat.current) {
      mat.current.emissiveIntensity = glow * 1.5
      mat.current.opacity = Math.min(1, glow * 1.4)
    }
    if (root.current) root.current.userData.glow = legacy ? 1 : glow
  })
  return (
    // No `userData` prop here: the glow is written each frame, and a prop would wipe it on every re-render.
    <group ref={root} name="cast-channel">
      <mesh position={[0, 0.06, (CHANNEL.z0 + CHANNEL.z1) / 2]} receiveShadow>
        <boxGeometry args={[CHANNEL.width, CHANNEL.top, len]} />
        <meshStandardMaterial color={legacy ? MOLTEN : '#8A6A48'} emissive={legacy ? MOLTEN_E : '#000000'} emissiveIntensity={legacy ? 1.4 : 0} roughness={0.5} toneMapped={!legacy} />
      </mesh>
      <mesh ref={stream} position={[0, CHANNEL.top + 0.004, CHANNEL.z0]} visible={false}>
        <boxGeometry args={[CHANNEL.width * 0.55, 0.012, len]} />
        <meshStandardMaterial ref={mat} color={MOLTEN} emissive={MOLTEN_E} emissiveIntensity={0} transparent opacity={0} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  )
}

function fmt(n: number): string {
  return n.toLocaleString('en-GB')
}
