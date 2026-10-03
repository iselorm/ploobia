import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { CuboidCollider } from '@react-three/rapier'
import { bendOf, getWorld, registerInteractable, useWorld, vicePredict, viceShown, viceStageOf } from '@/lib/archipelago'
import { useBand } from '@/lib/bands'
import { STRIP, STRIPS, readingText, stripState, type Bend, type StripId, type StripSpec } from '@/lib/bend'
import Tag from './SceneTag'
import { ARM, JAW_Z, RULE, STRIP_X, STRIP_Y, VICE_BENCH, VICE_BENCH_AT, VICE_REACH, VICE_VERB_AT } from './viceLayout'

/**
 * S2 round A3 — the vice under the east wall's rack (storyboard v3.1 §03 M5;
 * the design of 2 Oct). Object first: four strips clamped in a row and seen
 * side-on against a pale board with one ruled line at their unloaded height.
 * Ingots hang from every tip; the arms dip (copper further than iron); on the
 * lift each one springs back to the line, or keeps the bend — and the bend
 * that stayed is marked on the board behind it in amber.
 *
 * Elastic bending is drawn as a curve along the arm; a bend that stays is a
 * kink at the jaw; a crack is the arm hanging from the jaw. Stand-in props.
 * Every number is lib/bend.ts's. Scene handles for suites: `vice`
 * (userData.load, .on), `vice-strip-<id>` (userData.angle — the tip's dip in
 * radians — and .state, written per frame, no prop), `vice-wedge-<id>`.
 */

const IRON_DARK = '#3D332A'
const PLANK = '#7A5A3A'
const PLANK_DARK = '#5E4530'
const BOARD = '#EFE6D2'
const AMBER = '#E8A33D'
const COPPER = '#C8743A'

const LOOK: Record<StripId, { color: string; rough: number; metal: number; thick: number }> = {
  copper: { color: COPPER, rough: 0.45, metal: 0.6, thick: ARM.thick },
  oldCopper: { color: '#5FA08C', rough: 0.9, metal: 0.15, thick: ARM.thick },
  iron: { color: '#8D9299', rough: 0.5, metal: 0.65, thick: ARM.thick },
  // The rust has eaten the section: the strip is visibly thinner.
  rusted: { color: '#7A3F22', rough: 1, metal: 0.05, thick: ARM.thick * 0.62 },
}

/** Radians of curve along the arm per unit of dip (new iron under one ingot). */
const FLEX_RAD = 0.045
/** The kink a bend leaves at the jaw, and the hang of a cracked arm. */
const SET_RAD = 0.24
const CRACK_RAD = 0.84
const SEGS = 5

const jawOf = (id: StripId): number => JAW_Z[STRIPS.findIndex((s) => s.id === id)]

/** The curve (elastic, along the arm) and the kink (at the jaw) a strip is heading for. */
function targets(v: Bend, s: StripSpec): { curve: number; kink: number } {
  switch (stripState(v, s.id)) {
    case 'bent':
      return { curve: 0, kink: SET_RAD }
    case 'cracked':
      return { curve: 0, kink: CRACK_RAD }
    case 'giving':
      // At or past what it can take the strip gives under the load: the kink is there already, with the spring on top
      // of it. The lift takes the spring away and leaves the kink — or shows the crack for what it is.
      return s.gives === 'cracks' ? { curve: 0, kink: CRACK_RAD } : { curve: v.load * s.flex * FLEX_RAD, kink: SET_RAD }
    case 'flexed':
      return { curve: v.load * s.flex * FLEX_RAD, kink: 0 }
    default:
      return { curve: 0, kink: 0 }
  }
}

/** Where the tip is for a curve and a kink: [reach along z, drop], in metres from the jaw. */
function tipOf(curve: number, kink: number): [number, number] {
  let z = 0
  let y = 0
  const seg = ARM.len / SEGS
  for (let i = 0; i < SEGS; i++) {
    const a = kink + (curve * (i + 1)) / SEGS
    z += seg * Math.cos(a)
    y += seg * Math.sin(a)
  }
  return [z, y]
}

export default function ViceScene() {
  const s = useWorld()
  const shown = viceShown(s) && s.zone === 'foundry'
  useEffect(() => {
    if (!shown) return
    return registerInteractable({ id: 'vice.strips', verb: 'measure', label: 'The vice', pos: VICE_VERB_AT, radius: VICE_REACH })
  }, [shown])
  const [band] = useBand()
  if (!shown) return null
  const v = bendOf(s)
  const inRoom = s.room === 'vice'
  const stage = viceStageOf(s, band)
  const top = VICE_BENCH.top
  return (
    <group name="vice" userData={{ load: v.load, on: v.on }}>
      <CuboidCollider args={[VICE_BENCH.depth / 2, top / 2, VICE_BENCH.length / 2]} position={[VICE_BENCH_AT[0], top / 2, VICE_BENCH_AT[2]]} />
      {/* the bench: planks along the wall, on three trestles */}
      <mesh position={[VICE_BENCH_AT[0], top - 0.035, VICE_BENCH_AT[2]]} castShadow receiveShadow>
        <boxGeometry args={[VICE_BENCH.depth, 0.07, VICE_BENCH.length]} />
        <meshStandardMaterial color={PLANK} roughness={0.9} />
      </mesh>
      {[-1, 0, 1].map((k) => (
        <mesh key={k} position={[VICE_BENCH_AT[0] - 0.05, (top - 0.07) / 2, VICE_BENCH_AT[2] + k * (VICE_BENCH.length / 2 - 0.12)]} castShadow>
          <boxGeometry args={[VICE_BENCH.depth - 0.2, top - 0.07, 0.08]} />
          <meshStandardMaterial color={PLANK_DARK} roughness={0.9} />
        </mesh>
      ))}
      {/* the pale board behind the strips, and the one ruled line at their unloaded height */}
      <mesh position={[RULE.x, STRIP_Y - 0.12, (RULE.z0 + RULE.z1) / 2]} receiveShadow>
        <boxGeometry args={[0.03, 0.62, RULE.z1 - RULE.z0]} />
        <meshStandardMaterial color={BOARD} roughness={0.95} />
      </mesh>
      <mesh position={[RULE.x - 0.017, STRIP_Y, (RULE.z0 + RULE.z1) / 2]}>
        <boxGeometry args={[0.004, 0.008, RULE.z1 - RULE.z0 - 0.06]} />
        <meshStandardMaterial color="#3D332A" roughness={1} />
      </mesh>

      {STRIPS.map((st) => (
        <ViceStand key={st.id} z={jawOf(st.id)} top={top} />
      ))}
      {STRIPS.map((st) =>
        st.id === 'copper' && !v.cut ? null : <Strip key={`${st.id}-${v.sets}`} spec={st} top={top} pickable={inRoom && stage === 'predict'} />,
      )}

      {inRoom && (
        <>
          {/* the load, on the object — out of the way while the strips are being pointed at */}
          {stage !== 'predict' && (
            <Html position={[STRIP_X, STRIP_Y + 0.52, VICE_BENCH_AT[2]]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
              <Tag wide testid="vice-tag">
                {!v.cut ? 'Three strips · one clamp empty' : v.load === 0 ? 'Nothing on the hanger' : v.on ? `${v.load} ingot${v.load === 1 ? '' : 's'} on each` : `Lifted · ${v.load} on each hanger`}
              </Tag>
            </Html>
          )}
          {STRIPS.map((st) => {
            const empty = st.id === 'copper' && !v.cut
            const reading = readingText(STRIP[st.id], v.readings[st.id])
            return (
              <Html key={st.id} position={[STRIP_X, STRIP_Y + 0.26, jawOf(st.id) + ARM.len * 0.45]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
                <Tag small stack dark={!!reading && v.readings[st.id].gaveAt != null} testid={empty ? 'strip-tag-empty' : `strip-tag-${st.id}`}>
                  {empty ? 'empty' : st.label}
                  {reading && (
                    <>
                      <br />
                      <span style={{ fontWeight: 700 }}>{reading}</span>
                    </>
                  )}
                </Tag>
              </Html>
            )
          })}
        </>
      )}
    </group>
  )
}

/** One small vice on a post: the jaw the strip is clamped in. */
function ViceStand({ z, top }: { z: number; top: number }) {
  const h = STRIP_Y - top
  return (
    <group position={[STRIP_X, top, z - 0.06]}>
      <mesh position={[0, h / 2 - 0.02, 0]} castShadow>
        <boxGeometry args={[0.12, h - 0.04, 0.1]} />
        <meshStandardMaterial color={IRON_DARK} roughness={0.75} metalness={0.3} />
      </mesh>
      {/* the two jaws, either side of the strip's line */}
      {[-1, 1].map((k) => (
        <mesh key={k} position={[0, h + k * 0.028, 0.005]} castShadow>
          <boxGeometry args={[0.15, 0.036, 0.12]} />
          <meshStandardMaterial color="#54483C" roughness={0.6} metalness={0.4} />
        </mesh>
      ))}
      {/* the screw's handle */}
      <mesh position={[0, h + 0.075, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.008, 0.008, 0.2, 8]} />
        <meshStandardMaterial color="#6E6257" roughness={0.5} metalness={0.5} />
      </mesh>
    </group>
  )
}

/** A strip, its hanger and its ingots, and the amber wedge behind a bend that stayed. */
function Strip({ spec, top, pickable }: { spec: StripSpec; top: number; pickable: boolean }) {
  const s = useWorld()
  const v = bendOf(s)
  const root = useRef<THREE.Group>(null)
  const segs = useRef<(THREE.Group | null)[]>([])
  const hanger = useRef<THREE.Group>(null)
  const halo = useRef<THREE.MeshStandardMaterial>(null)
  const look = LOOK[spec.id]
  const jaw = jawOf(spec.id)
  const first = targets(v, spec)
  // The arm's own motion: a damped spring on the curve, a quick ease on the kink.
  const m = useRef({ curve: first.curve, vel: 0, kink: first.kink, hang: v.on ? 1 : 0 })
  const reduced = useMemo(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, [])
  useFrame((state, dtRaw) => {
    const dt = Math.min(0.05, dtRaw)
    const now = bendOf(getWorld())
    const want = targets(now, spec)
    const a = m.current
    // Underdamped, so a lifted strip visibly springs; critically damped under reduced motion.
    const k = 220
    const c = reduced ? 2 * Math.sqrt(k) : 9
    a.vel += (-k * (a.curve - want.curve) - c * a.vel) * dt
    a.curve += a.vel * dt
    a.kink += (want.kink - a.kink) * (1 - Math.pow(0.0005, dt))
    a.hang += ((now.on ? 1 : 0) - a.hang) * (1 - Math.pow(0.001, dt))
    const g = root.current
    if (g) {
      g.rotation.x = a.kink
      const [tz, ty] = tipOf(a.curve, a.kink)
      // Written here, never as a prop: a prop would wipe it on every re-render.
      g.userData.angle = Math.atan2(ty, tz)
      g.userData.state = stripState(now, spec.id)
      const h = hanger.current
      if (h) {
        // On the strip the hanger rides the tip; lifted off, it stands on the bench under it.
        const tipY = STRIP_Y - ty
        const riding = Math.max(top + 0.03, tipY - 0.27)
        const resting = top + 0.03
        h.position.set(STRIP_X, resting + (riding - resting) * a.hang, jaw + ARM.len - 0.02 - (ARM.len - tz) * a.hang)
        h.visible = now.load > 0
      }
    }
    segs.current.forEach((sg) => {
      if (sg) sg.rotation.x = a.curve / SEGS
    })
    if (halo.current) halo.current.opacity = pickable ? (reduced ? 0.5 : 0.3 + 0.25 * Math.sin(state.clock.elapsedTime * 3.2)) : 0
  })
  const seg = ARM.len / SEGS
  // A chain of short pieces, each turned a little more than the last: the curve of a loaded strip.
  const chain = (i: number): React.ReactNode => (
    <group
      ref={(g) => {
        segs.current[i] = g
      }}
      position={[0, 0, i === 0 ? 0 : seg]}
    >
      <mesh position={[0, 0, seg / 2]} castShadow>
        <boxGeometry args={[ARM.wid, look.thick, seg + 0.002]} />
        <meshStandardMaterial color={look.color} roughness={look.rough} metalness={look.metal} />
      </mesh>
      {spec.id === 'rusted' && i % 2 === 0 && (
        <mesh position={[0.012, look.thick / 2 + 0.001, seg / 2]}>
          <boxGeometry args={[ARM.wid * 0.5, 0.003, seg * 0.6]} />
          <meshStandardMaterial color="#4E2A18" roughness={1} />
        </mesh>
      )}
      {spec.id === 'oldCopper' && i % 2 === 1 && (
        <mesh position={[-0.01, look.thick / 2 + 0.001, seg / 2]}>
          <boxGeometry args={[ARM.wid * 0.55, 0.003, seg * 0.7]} />
          <meshStandardMaterial color="#8FC4B0" roughness={1} />
        </mesh>
      )}
      {i < SEGS - 1 ? chain(i + 1) : <mesh position={[0, -0.012, seg - 0.012]}><boxGeometry args={[0.012, 0.024, 0.012]} /><meshStandardMaterial color={IRON_DARK} roughness={0.6} /></mesh>}
    </group>
  )
  const r = v.readings[spec.id]
  const gave = r.gaveAt != null
  const wedge = useMemo(() => {
    const [tz, ty] = tipOf(0, spec.gives === 'cracks' ? CRACK_RAD : SET_RAD)
    const g = new THREE.BufferGeometry()
    // In the board's plane: the jaw, the tip on the ruled line, the tip where it stayed.
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, ARM.len, 0, -ty, tz], 3))
    g.computeVertexNormals()
    return g
  }, [spec.gives])
  return (
    <>
      {/* the part held in the jaw */}
      <mesh position={[STRIP_X, STRIP_Y, jaw - 0.07]}>
        <boxGeometry args={[ARM.wid, look.thick, 0.14]} />
        <meshStandardMaterial color={look.color} roughness={look.rough} metalness={look.metal} />
      </mesh>
      <group
        ref={root}
        position={[STRIP_X, STRIP_Y, jaw]}
        name={`vice-strip-${spec.id}`}
        onClick={(e) => {
          if (!pickable) return
          e.stopPropagation()
          vicePredict(spec.id)
        }}
      >
        {chain(0)}
        {/* a generous thing to point at, and the halo that says it can be */}
        <mesh position={[0, -0.1, ARM.len / 2]} visible={false}>
          <boxGeometry args={[0.3, 0.5, ARM.len + 0.1]} />
          <meshBasicMaterial />
        </mesh>
      </group>
      <mesh position={[STRIP_X + 0.07, STRIP_Y - 0.01, jaw + ARM.len / 2]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[ARM.len + 0.1, 0.16]} />
        <meshStandardMaterial ref={halo} color={AMBER} emissive={AMBER} emissiveIntensity={0.8} transparent opacity={0} toneMapped={false} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {/* the bend that stayed, marked on the board behind it */}
      {gave && (
        <mesh geometry={wedge} position={[RULE.x - 0.02, STRIP_Y, jaw]} name={`vice-wedge-${spec.id}`}>
          <meshStandardMaterial color={AMBER} emissive={AMBER} emissiveIntensity={0.7} transparent opacity={0.6} toneMapped={false} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* the crack itself, dark at the jaw */}
      {gave && spec.gives === 'cracks' && (
        <mesh position={[STRIP_X, STRIP_Y, jaw + 0.004]}>
          <boxGeometry args={[ARM.wid + 0.006, 0.02, 0.008]} />
          <meshStandardMaterial color="#1A1310" roughness={1} />
        </mesh>
      )}
      {/* the hanger: a hook, a rod, a pan, and the ingots on it */}
      <group ref={hanger} visible={false}>
        <mesh position={[0, 0.135, 0]}>
          <boxGeometry args={[0.008, 0.27, 0.008]} />
          <meshStandardMaterial color={IRON_DARK} roughness={0.6} metalness={0.4} />
        </mesh>
        <mesh position={[0, 0, 0]} castShadow>
          <boxGeometry args={[0.13, 0.012, 0.15]} />
          <meshStandardMaterial color={IRON_DARK} roughness={0.7} metalness={0.3} />
        </mesh>
        {Array.from({ length: v.load }, (_, i) => (
          <mesh key={i} position={[0, 0.02 + Math.floor(i / 2) * 0.03, (i % 2 ? 0.036 : -0.036)]} castShadow>
            <boxGeometry args={[0.1, 0.026, 0.06]} />
            <meshStandardMaterial color={COPPER} roughness={0.5} metalness={0.55} />
          </mesh>
        ))}
      </group>
    </>
  )
}
