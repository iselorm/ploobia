import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { CuboidCollider } from '@react-three/rapier'
import { getWorld, registerInteractable, strapShown, takeStrap, useWorld } from '@/lib/archipelago'
import { WORLD_TEXT } from '@/lib/worldtext'
import { TextPlane } from './Dressing'
import Tag from './SceneTag'
import { STRAP_BENCH, STRAP_BENCH_AT, STRAP_REACH, STRAP_VERB_AT } from './viceLayout'

/**
 * S2 moment 1 — the rusted strap off the watch's jetty gate, on a plank bench
 * beside Sefu, with Sela's order slate (storyboard v3.1 §03 M1; the design of
 * 2 Oct: the strap is the arrival beat). Object first: the strap is the
 * reason the furnace is being lit, and it is broken where it was weakest.
 *
 * It lies in two pieces, snapped across a pin hole. One tap takes the long
 * piece in the hand: it lifts toward the camera and flakes fall from it.
 * Stand-in props. Scene handles for suites: `strap-bench`, `strap-rusted`
 * (userData.lift, written per frame — no prop), `strap-end`.
 */

const RUST = '#7A3F22'
const RUST_DARK = '#4E2A18'
const RUST_LIGHT = '#A85A2A'
const PLANK = '#7A5A3A'
const PLANK_DARK = '#5E4530'

/** The strap on the bench: its long piece from the west pin hole to the break, and the snapped-off end. */
const S = { len: 0.74, wid: 0.11, thick: 0.02, x0: -0.62, z: 0.06 }
const BREAK_X = S.x0 + S.len
const LIFT = 0.2

/** A deterministic scatter: flakes round the break and along the strap. */
function flakes(n: number): { x: number; z: number; r: number; fall: number; c: string }[] {
  let seed = 7
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  return Array.from({ length: n }, (_, i) => ({
    x: i < n / 2 ? BREAK_X - 0.06 + rnd() * 0.22 : S.x0 + rnd() * S.len,
    z: S.z - 0.09 + rnd() * 0.2,
    r: 0.008 + rnd() * 0.012,
    fall: rnd(),
    c: i % 3 === 0 ? RUST_LIGHT : i % 3 === 1 ? RUST : RUST_DARK,
  }))
}

export default function StrapBench() {
  const s = useWorld()
  const shown = strapShown(s) && s.zone === 'foundry'
  useEffect(() => {
    if (!shown) return
    return registerInteractable({ id: 'strap.bench', verb: 'measure', label: 'The rusted strap', pos: STRAP_VERB_AT, radius: STRAP_REACH })
  }, [shown])
  if (!shown) return null
  const inRoom = s.room === 'strap'
  const top = STRAP_BENCH.top
  return (
    <group position={STRAP_BENCH_AT} name="strap-bench">
      <CuboidCollider args={[STRAP_BENCH.length / 2, top / 2, STRAP_BENCH.depth / 2]} position={[0, top / 2, 0]} />
      {/* the bench: two planks on trestles */}
      {[-0.155, 0.155].map((z) => (
        <mesh key={z} position={[0, top - 0.03, z]} castShadow receiveShadow>
          <boxGeometry args={[STRAP_BENCH.length, 0.06, 0.3]} />
          <meshStandardMaterial color={PLANK} roughness={0.9} />
        </mesh>
      ))}
      {[-0.6, 0.6].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          {[-0.22, 0.22].map((z) => (
            <mesh key={z} position={[0, (top - 0.06) / 2, z]} castShadow>
              <boxGeometry args={[0.07, top - 0.06, 0.07]} />
              <meshStandardMaterial color={PLANK_DARK} roughness={0.9} />
            </mesh>
          ))}
          <mesh position={[0, top * 0.45, 0]}>
            <boxGeometry args={[0.05, 0.05, 0.5]} />
            <meshStandardMaterial color={PLANK_DARK} roughness={0.9} />
          </mesh>
        </group>
      ))}

      {/* Sela's order slate, propped at the back */}
      <group position={[0.48, top, -0.21]} rotation={[-0.3, -0.12, 0]} name="strap-slate">
        <mesh position={[0, 0.17, 0]} castShadow>
          <boxGeometry args={[0.5, 0.34, 0.02]} />
          <meshStandardMaterial color="#6B4A30" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.17, 0.011]}>
          <planeGeometry args={[0.45, 0.29]} />
          <meshStandardMaterial color="#2C3330" roughness={1} />
        </mesh>
        <TextPlane lines={WORLD_TEXT.foundry.slate} width={0.42} height={0.26} color="#EFE7D2" px={58} weight={700} position={[0, 0.17, 0.013]} />
      </group>

      <Strap top={top} inRoom={inRoom} taken={s.strap === 'taken'} />

      {inRoom && s.strap === 'taken' && (
        <>
          <Html position={[BREAK_X - 0.05, top + LIFT + 0.19, S.z + 0.06]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
            <Tag dark testid="strap-tag-break">
              snapped at the pin hole
            </Tag>
          </Html>
          <Html position={[S.x0 + 0.26, top + 0.02, S.z + 0.26]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
            <Tag small testid="strap-tag-flakes">
              flakes come off in your fingers
            </Tag>
          </Html>
        </>
      )}
    </group>
  )
}

function Strap({ top, inRoom, taken }: { top: number; inRoom: boolean; taken: boolean }) {
  const long = useRef<THREE.Group>(null)
  const ring = useRef<THREE.MeshStandardMaterial>(null)
  const bits = useRef<THREE.Group>(null)
  const lift = useRef(taken ? 1 : 0)
  const fell = useRef(taken ? 1 : 0)
  const scatter = useMemo(() => flakes(22), [])
  const reduced = useMemo(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, [])
  useFrame((state, dtRaw) => {
    const dt = Math.min(0.05, dtRaw)
    const s = getWorld()
    const up = s.strap === 'taken' && s.room === 'strap' ? 1 : 0
    lift.current += (up - lift.current) * (reduced ? 1 : 1 - Math.pow(0.004, dt))
    const g = long.current
    if (g) {
      g.position.y = top + S.thick / 2 + LIFT * lift.current
      g.rotation.x = 0.55 * lift.current
      // Written here, never as a prop: a prop would wipe it on every re-render.
      g.userData.lift = LIFT * lift.current
    }
    // The flakes that come away fall once, when it is first taken, and stay on the planks.
    const want = s.strap === 'taken' ? 1 : 0
    fell.current += (want - fell.current) * (reduced ? 1 : Math.min(1, dt * 1.6))
    const b = bits.current
    if (b) {
      b.children.forEach((m, i) => {
        const f = scatter[i]
        // Half of them start on the strap and drop; the rest were already on the bench.
        const from = i % 2 === 0 ? S.thick + LIFT * lift.current * (1 - fell.current) : 0
        const t = Math.min(1, fell.current * (1.2 + f.fall))
        m.position.y = top + 0.004 + from * (1 - t * t)
        m.visible = i % 2 === 1 || want === 1
      })
    }
    if (ring.current) ring.current.opacity = s.strap === 'shown' && s.room === 'strap' ? (reduced ? 0.7 : 0.45 + 0.35 * Math.sin(state.clock.elapsedTime * 3.4)) : 0
  })
  const pick = (e: { stopPropagation: () => void }) => {
    if (!inRoom || taken) return
    e.stopPropagation()
    takeStrap()
  }
  return (
    <group>
      {/* the long piece: from the sound pin hole to the break */}
      <group ref={long} position={[0, top + S.thick / 2, S.z]} name="strap-rusted" onClick={pick}>
        <mesh position={[S.x0 + S.len / 2, 0, 0]} castShadow>
          <boxGeometry args={[S.len, S.thick, S.wid]} />
          <meshStandardMaterial color={RUST} roughness={1} />
        </mesh>
        <mesh position={[S.x0, 0, 0]} castShadow>
          <cylinderGeometry args={[S.wid / 2, S.wid / 2, S.thick, 18]} />
          <meshStandardMaterial color={RUST} roughness={1} />
        </mesh>
        {/* the sound hole at the west end */}
        <mesh position={[S.x0 + 0.02, S.thick / 2 + 0.001, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 0.004, 14]} />
          <meshStandardMaterial color="#1F1712" roughness={1} />
        </mesh>
        {/* the break: across the other hole, eaten thin — two ragged teeth either side of half a hole */}
        {[-1, 1].map((k) => (
          <mesh key={k} position={[BREAK_X + 0.012, 0, k * 0.038]} rotation={[0, k * 0.5, 0]} castShadow>
            <boxGeometry args={[0.04, S.thick * 0.6, 0.026]} />
            <meshStandardMaterial color={RUST_DARK} roughness={1} />
          </mesh>
        ))}
        {/* pits and scale along it */}
        {[0.1, 0.24, 0.37, 0.52, 0.63].map((d, i) => (
          <mesh key={d} position={[S.x0 + d, S.thick / 2 + 0.002, (i % 2 ? 0.02 : -0.025)]}>
            <boxGeometry args={[0.07 - i * 0.008, 0.005, 0.04 + (i % 3) * 0.012]} />
            <meshStandardMaterial color={i % 2 ? RUST_DARK : RUST_LIGHT} roughness={1} />
          </mesh>
        ))}
        {/* a generous thing to tap */}
        <mesh position={[S.x0 + S.len / 2, 0.03, 0]} visible={false}>
          <boxGeometry args={[S.len + 0.2, 0.16, S.wid + 0.2]} />
          <meshBasicMaterial />
        </mesh>
      </group>
      {/* the snapped-off end, lying where it fell */}
      <group position={[BREAK_X + 0.1, top + S.thick / 2, S.z + 0.035]} rotation={[0, -0.32, 0]} name="strap-end">
        <mesh castShadow>
          <boxGeometry args={[0.1, S.thick, S.wid]} />
          <meshStandardMaterial color={RUST} roughness={1} />
        </mesh>
        <mesh position={[0.05, 0, 0]} castShadow>
          <cylinderGeometry args={[S.wid / 2, S.wid / 2, S.thick, 18]} />
          <meshStandardMaterial color={RUST} roughness={1} />
        </mesh>
        {[-1, 1].map((k) => (
          <mesh key={k} position={[-0.06, 0, k * 0.038]} rotation={[0, -k * 0.4, 0]}>
            <boxGeometry args={[0.035, S.thick * 0.6, 0.026]} />
            <meshStandardMaterial color={RUST_DARK} roughness={1} />
          </mesh>
        ))}
      </group>
      {/* flakes */}
      <group ref={bits}>
        {scatter.map((f, i) => (
          <mesh key={i} position={[f.x, top + 0.004, f.z]} rotation={[0, f.fall * 3, 0]}>
            <boxGeometry args={[f.r * 2, 0.004, f.r * 1.3]} />
            <meshStandardMaterial color={f.c} roughness={1} />
          </mesh>
        ))}
      </group>
      {/* the invitation: an amber ring round the strap until it is taken */}
      <mesh position={[S.x0 + S.len / 2 + 0.06, top + 0.003, S.z]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 0.3, 1]}>
        <ringGeometry args={[0.5, 0.53, 40]} />
        <meshStandardMaterial ref={ring} color="#E8A33D" emissive="#E8A33D" emissiveIntensity={1} transparent opacity={0} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  )
}
