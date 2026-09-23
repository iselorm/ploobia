import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { PATIENT_BY_ID, solvePond, LAMP_RAIL, type PondEnv, type Suspect } from '@/lib/pond'
import type { SugarSim } from '@/lib/sugarsim'

/**
 * The Pond — a jam-jar tank on the back bench, and the one stage in this
 * cabinet where the learner cannot read the dials.
 *
 * Door 2 of the campaign (the Mystery Run, 13 Sep 2026). Everything here
 * follows one number the learner never sees — the sprig's rate — and one
 * they do: the bubbles leaving the cut stem, which they count on a minute of
 * sped-up clock. Three plates on the tank's front read `?` until the
 * accusation, and the whole picture is built so that three things are legible
 * without a caption:
 *
 * 1. **The plates are a question, not a fault.** They are dashed, they carry
 *    a small torn-label corner, and they are the only thing in the room with
 *    a `?` on them. A ten-year-old reads mystery, not breakage.
 * 2. **A nudge moved something real.** The lamp slides along its rail, the
 *    soda fizzes down through the water, the bath's coil glows or frosts —
 *    and then nothing else happens, because the count is what answers.
 * 3. **The bubbles are the instrument.** They leave the cut stem, rise into
 *    the funnel and collect in the tube; the tube's column is the run's
 *    memory, and it is the same picture the syllabus practical draws.
 *
 * Cheap by construction: a glass box, an instanced sprig of leaflets, a
 * ribbon of instanced bubbles, a funnel, a tube, a lamp and four plates.
 * Nothing here is a photograph — a tank at 10 cm is an apparatus, and the
 * apparatus is the point.
 */

/* Where the tank sits. The camera rig's `plant` stops frame this happily. */
const TANK = { w: 2.6, h: 1.9, d: 1.4, y: 1.0 }
const WATER_TOP = TANK.y + TANK.h / 2 - 0.16
/**
 * The apparatus, from the bottom up: the sprig stands cut-end up in the
 * water, an inverted funnel sits over it catching what leaves the cut, and
 * the graduated tube stands on the funnel's spout with its closed end above
 * the water. This is the 0610 practical's own picture, and every number in
 * the round is read off the one place gas can go.
 */
const STEM_TOP = TANK.y - TANK.h / 2 + 0.1 + 0.85
/** Where the funnel's mouth sits — clear enough of the cut end to see the bubbles cross it. */
const FUNNEL_Y = 1.35
/** The tube's closed top, up out of the water. */
const TUBE_TOP = 2.5
const STEM_X = -0.1
/** Bubbles in the ribbon. Enough to read a rate, few enough to count by eye. */
const BUBBLES = 42
/** How long a bubble takes to rise, seconds. */
const RISE_S = 1.25
/**
 * The tank runs on the round's clock, not ours.
 *
 * A count is a minute of the tank's time played in six seconds of ours, so
 * the bubbles come ten times a real sprig's rate — otherwise 3 a minute and
 * 27 a minute are both "one bubble somewhere in the jar", and the picture
 * says nothing the counts do not. Keep this in step with `COUNT_MS` on the
 * page: the two are the same sped-up minute seen from different ends.
 */
const TIME_SCALE = 10

const GLASS = '#BFD8E4'
const WATER = '#3F7FBF'
const LEAF = '#4E8A4A'
const BRASS = '#C98A1E'

/* ------------------------------------------------------------------ */
/* The sprig                                                           */
/* ------------------------------------------------------------------ */

/**
 * Hornwort, procedurally: a bare stem with whorls of fine forked bristles up
 * it and no roots at all — which is the thing to recognise in a real pond.
 * The painted identification card on the page carries the recognisable
 * picture; this is the plant in the water, doing the work.
 */
function Sprig({ sim }: { sim: SugarSim }) {
  const whorls = useMemo(() => {
    const out: Array<{ y: number; a: number; r: number }> = []
    for (let i = 0; i < 6; i += 1) {
      const y = 0.1 + i * 0.13
      for (let k = 0; k < 6; k += 1) out.push({ y, a: (k / 6) * Math.PI * 2 + i * 0.5, r: 0.18 + (i % 2) * 0.05 })
    }
    return out
  }, [])
  const group = useRef<THREE.Group>(null)
  useFrame(() => {
    const g = group.current
    if (!g) return
    // The sprig sways with the water it sits in, a little faster when the
    // bath is warm — the only place the temperature shows without a number.
    const warm = (sim.pond.env.bathC - 20) / 18
    g.rotation.z = Math.sin(sim.time * (0.6 + warm * 0.5)) * 0.045
  })
  return (
    <group ref={group} position={[STEM_X, TANK.y - TANK.h / 2 + 0.1, 0]} name="sprig">
      <mesh position={[0, 0.42, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.045, 0.85, 7]} />
        <meshStandardMaterial color="#3E6F3C" roughness={0.85} />
      </mesh>
      {whorls.map((w, i) => (
        <mesh key={i} position={[Math.cos(w.a) * w.r * 0.5, w.y, Math.sin(w.a) * w.r * 0.5]} rotation={[0, -w.a, Math.PI / 2 - 0.5]}>
          <cylinderGeometry args={[0.008, 0.014, w.r, 4]} />
          <meshStandardMaterial color={LEAF} roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* The bubbles — the instrument                                        */
/* ------------------------------------------------------------------ */

/**
 * A ribbon of bubbles leaving the cut stem. How many are in the air at once
 * IS the rate: they are spawned on a phase that runs at the solve's own
 * bubbles-a-minute, so a learner who has watched one sprig can see a
 * difference before they have counted it. During a count the released ones
 * are totalled on the sim so the HUD's tally and the picture agree.
 */
function Bubbles({ sim }: { sim: SugarSim }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  /**
   * The ribbon keeps its own clock.
   *
   * `sim.time` is the *plant's* clock and runs at whatever multiplier the
   * room is set to — on this stage that is about a sixth of real time, which
   * left the bubbles hanging in the water like beads on a string. A tank is
   * watched in the present tense, so the ribbon runs on the wall clock and
   * the sped-up minute is in `TIME_SCALE`, where it can be read.
   */
  const clock = useRef(0)
  useFrame((_, dt) => {
    const m = mesh.current
    if (!m) return
    clock.current += Math.min(0.05, dt)
    const rate = solvePond(sim.pond.env).bubbles
    // Bubbles a minute → a phase per second, capped so a fast sprig reads as
    // a stream rather than a solid rod.
    const perSecond = Math.min(12, (rate / 60) * TIME_SCALE)
    for (let i = 0; i < BUBBLES; i += 1) {
      const live = i < Math.min(BUBBLES, Math.ceil(perSecond * RISE_S))
      if (!live) {
        dummy.position.set(0, -99, 0)
        dummy.updateMatrix()
        m.setMatrixAt(i, dummy.matrix)
        continue
      }
      const k = ((clock.current / RISE_S + i * 0.6180339887) % 1 + 1) % 1
      // They leave the cut end and go up into the funnel, which is where a
      // real one's gas goes — not to the surface, which would be a leak.
      const y = STEM_TOP - 0.02 + k * (FUNNEL_Y + 0.08 - (STEM_TOP - 0.02))
      const wobble = Math.sin(clock.current * 3 + i) * 0.03
      dummy.position.set(STEM_X + wobble, y, Math.cos(i * 2.3) * 0.06)
      const s = 0.044 + (i % 3) * 0.008
      dummy.scale.setScalar(s)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, BUBBLES]} name="bubbles">
      <sphereGeometry args={[1, 8, 6]} />
      <meshStandardMaterial color="#EAF6FB" transparent opacity={0.85} roughness={0.2} metalness={0} />
    </instancedMesh>
  )
}

/* ------------------------------------------------------------------ */
/* The apparatus                                                       */
/* ------------------------------------------------------------------ */

function Funnel() {
  // A cone's apex is +y and its open base −y, so no rotation at all is the
  // inverted funnel: mouth down over the cut end, spout up into the tube.
  return (
    <group position={[STEM_X, FUNNEL_Y + 0.18, 0]} name="funnel">
      <mesh>
        <coneGeometry args={[0.32, 0.36, 18, 1, true]} />
        <meshStandardMaterial color="#A9C7D6" transparent opacity={0.5} roughness={0.12} side={THREE.DoubleSide} />
      </mesh>
      {/* the rim, or a glass cone in glass water is not there at all */}
      <mesh position={[0, -0.18, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.32, 0.008, 6, 24]} />
        <meshStandardMaterial color="#7E9AAA" />
      </mesh>
    </group>
  )
}

/** The graduated tube: the run's memory, filling as the gas collects. */
function Tube({ sim }: { sim: SugarSim }) {
  const gas = useRef<THREE.Mesh>(null)
  useFrame(() => {
    const g = gas.current
    if (!g) return
    // The column is what THIS count has collected, so it empties between
    // counts and fills while one runs — never a total across the round. Gas
    // collects at the closed top and pushes the water down, so the column
    // grows downward from TUBE_TOP rather than up from the spout.
    const fill = Math.min(1, sim.pond.released / 40)
    g.scale.y = Math.max(0.001, fill)
    g.position.y = TUBE_TOP - 0.04 - (0.6 * Math.max(0.001, fill)) / 2
  })
  return (
    <group position={[STEM_X, 0, 0]} name="tube">
      <mesh position={[0, TUBE_TOP - 0.45, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.92, 12, 1, true]} />
        <meshStandardMaterial color={GLASS} transparent opacity={0.4} roughness={0.12} side={THREE.DoubleSide} />
      </mesh>
      {/* the closed end */}
      <mesh position={[0, TUBE_TOP, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.02, 12]} />
        <meshStandardMaterial color={GLASS} transparent opacity={0.6} roughness={0.1} />
      </mesh>
      <mesh ref={gas} position={[0, TUBE_TOP - 0.34, 0]}>
        <cylinderGeometry args={[0.078, 0.078, 0.6, 12]} />
        <meshStandardMaterial color="#EAF6FB" transparent opacity={0.65} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[0.09, TUBE_TOP - 0.82 + i * 0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.004, 0.004, 0.07, 4]} />
          <meshStandardMaterial color="#6E6555" />
        </mesh>
      ))}
    </group>
  )
}

/** The lamp on its centimetre rail. Its distance is the light, and the plate will not say so. */
function Lamp({ sim }: { sim: SugarSim }) {
  const group = useRef<THREE.Group>(null)
  const glow = useRef<THREE.PointLight>(null)
  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    // The rail runs right of the tank: 45 cm out to 10 cm in, mapped onto a
    // metre of bench so the slide is visible from the camera's stop.
    const k = (sim.pond.env.lampCm - LAMP_RAIL[LAMP_RAIL.length - 1]) / (LAMP_RAIL[0] - LAMP_RAIL[LAMP_RAIL.length - 1])
    const x = 1.55 + k * 1.15
    g.position.x += (x - g.position.x) * Math.min(1, dt * 6)
    if (glow.current) glow.current.intensity = sim.pond.env.covered ? 0 : 3.2
  })
  return (
    <group ref={group} position={[2.4, TANK.y + 0.5, 0]} name="lamp">
      {/* The shade opens at the tank: the apex is on the far side, so the
          cone reads as light going somewhere rather than a horn. */}
      <mesh rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.22, 0.3, 14, 1, true]} />
        <meshStandardMaterial color={BRASS} side={THREE.DoubleSide} roughness={0.5} metalness={0.3} />
      </mesh>
      <mesh position={[0, -0.45, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.9, 6]} />
        <meshStandardMaterial color="#6E6555" />
      </mesh>
      <pointLight ref={glow} position={[-0.2, 0, 0]} color="#FFE9B8" intensity={3.2} distance={4} decay={2} />
    </group>
  )
}

/** The rail the lamp slides on, marked but not numbered — the numbers are the mystery. */
function Rail() {
  return (
    <group position={[0, TANK.y - 0.44, 0]}>
      <mesh position={[2.1, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, 1.5, 6]} />
        <meshStandardMaterial color="#8A8378" metalness={0.4} roughness={0.5} />
      </mesh>
      {LAMP_RAIL.map((_, i) => (
        <mesh key={i} position={[1.45 + i * 0.3, 0.03, 0]}>
          <boxGeometry args={[0.012, 0.06, 0.012]} />
          <meshStandardMaterial color="#6E6555" />
        </mesh>
      ))}
    </group>
  )
}

/** The water bath under the tank — warm or cool, and it is the bath that sets the temperature. */
function Bath({ sim }: { sim: SugarSim }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(() => {
    const m = mat.current
    if (!m) return
    const warm = THREE.MathUtils.clamp((sim.pond.env.bathC - 20) / 18, 0, 1)
    m.color.setStyle(warm > 0.5 ? '#C9724A' : '#6FA8C9')
    m.emissive.setStyle(warm > 0.7 ? '#7A2E12' : '#0B2436')
    m.emissiveIntensity = Math.abs(warm - 0.5) * 0.5
  })
  return (
    <mesh position={[0, TANK.y - TANK.h / 2 - 0.12, 0]} receiveShadow>
      <boxGeometry args={[TANK.w + 0.5, 0.22, TANK.d + 0.4]} />
      <meshStandardMaterial ref={mat} color="#6FA8C9" transparent opacity={0.75} roughness={0.4} />
    </mesh>
  )
}

/** The second tube: its own sprig in indicator, no soda. The whole of 6.1.9, uncontaminated. */
function IndicatorTube({ sim }: { sim: SugarSim }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(() => {
    const m = mat.current
    if (!m) return
    const c = sim.pond.indicator
    m.color.setStyle(c === 'purple' ? '#8A5AB5' : c === 'yellow' ? '#D9B23A' : '#C9583F')
  })
  return (
    <group position={[-1.9, TANK.y - TANK.h / 2 + 0.28, 0.3]} name="indicator">
      <mesh>
        <cylinderGeometry args={[0.14, 0.14, 0.9, 12, 1, true]} />
        <meshStandardMaterial color={GLASS} transparent opacity={0.36} roughness={0.12} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -0.08, 0]}>
        <cylinderGeometry args={[0.125, 0.125, 0.68, 12]} />
        <meshStandardMaterial ref={mat} color="#C9583F" transparent opacity={0.72} />
      </mesh>
      <mesh position={[0, -0.1, 0]} rotation={[0, 0, 0.2]}>
        <cylinderGeometry args={[0.014, 0.018, 0.5, 5]} />
        <meshStandardMaterial color="#3E6F3C" />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* The plates — the mystery, and the filmable moment                   */
/* ------------------------------------------------------------------ */

const PLATE_LABEL: Record<Suspect, string> = { lamp: 'LAMP', soda: 'SODA', bath: 'BATH', none: 'NOTHING' }

function plateReads(e: PondEnv, dial: Suspect): string {
  if (dial === 'lamp') return `${e.lampCm} cm`
  if (dial === 'soda') return e.spoons === 1 ? '1 spoon' : `${e.spoons} spoons`
  if (dial === 'bath') return `${e.bathC} °C`
  // The fourth plate is not a setting at all — it is the answer "nothing was
  // holding it back", and what it reads when it flips is the ceiling itself.
  return 'at its best'
}

/**
 * A plate on the tank's front. Dashed and question-marked while the round is
 * a mystery; it flips to its number at the reveal, the accused one first.
 * The torn corner is what stops a ten-year-old reading it as broken.
 */
function Plate({ sim, dial, index, of, rank, onAccuse, live }: { sim: SugarSim; dial: Suspect; index: number; of: number; rank: number; onAccuse?: (s: Suspect) => void; live: boolean }) {
  const [flipped, setFlipped] = useState(false)
  /**
   * The plates go over one at a time, the accused first.
   *
   * This is the round's payoff — three question marks becoming three
   * readings — and flipping them all in one frame threw it away. `rank` is
   * the order the verdict puts them in, and each one waits its turn.
   */
  useFrame(() => {
    const want = sim.pond.revealed && sim.pond.revealedAt >= 0 && performance.now() - sim.pond.revealedAt >= rank * 260
    if (want !== flipped) setFlipped(want)
  })
  const revealed = flipped
  const accused = sim.pond.accused === dial
  const found = (PATIENT_BY_ID[sim.pond.patientId] ?? PATIENT_BY_ID['stuffy']).setup
  const asFound = plateReads({ ...found }, dial)
  const now = plateReads(sim.pond.env, dial)
  return (
    <Html position={[(index - (of - 1) / 2) * 0.82, TANK.y - TANK.h / 2 + 0.26, TANK.d / 2 + 0.03]} center distanceFactor={6} zIndexRange={[12, 8]}>
      <button
        type="button"
        disabled={!live || revealed}
        onClick={() => onAccuse?.(dial)}
        data-testid="pond-plate"
        data-dial={dial}
        data-revealed={revealed ? 'true' : 'false'}
        data-live={live ? 'true' : 'false'}
        aria-label={revealed ? `${PLATE_LABEL[dial]} ${asFound}` : dial === 'none' ? 'Blame nothing — this bench has no more to give it' : `Blame the ${dial}`}
        style={{
          width: 90,
          padding: '4px 6px',
          borderRadius: 6,
          border: `1.5px ${revealed ? 'solid' : 'dashed'} ${accused ? '#C98A1E' : revealed ? '#6E6555' : '#8B8471'}`,
          background: revealed ? '#FBF8F1' : '#F6F2E8',
          color: revealed ? '#2A2118' : '#8B8471',
          fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
          fontSize: 10,
          fontWeight: 600,
          textAlign: 'left',
          cursor: live && !revealed ? 'pointer' : 'default',
          transform: revealed ? 'scale(1.06)' : live ? 'scale(1)' : 'scale(1)',
          transition: 'transform 180ms ease-out, background 180ms',
          boxShadow: live && !revealed ? '0 0 0 4px rgba(201,138,30,.34)' : 'none',
        }}
      >
        <span style={{ display: 'block', letterSpacing: '.08em', fontSize: 8 }}>{PLATE_LABEL[dial]}</span>
        <span style={{ display: 'block', fontSize: revealed ? 12 : 15, fontWeight: 700 }}>{revealed ? asFound : '?'}</span>
        {/* What it was found at is the diagnosis; where the learner left it is
            a second, quieter line — two numbers under one label with no
            explanation was the most confusing moment in the round. */}
        {revealed && dial !== 'none' && now !== asFound && (
          <span style={{ display: 'block', fontSize: 8.5, color: '#8B8471' }}>now {now}</span>
        )}
      </button>
    </Html>
  )
}

/* ------------------------------------------------------------------ */
/* The stage                                                           */
/* ------------------------------------------------------------------ */

export default function PondStage({ sim, canAccuse, onAccuse }: { sim: SugarSim; canAccuse?: boolean; onAccuse?: (s: Suspect) => void }) {
  // The plates are the sprig's own suspects, never the full set: a plate the
  // tank has no dial for is a suspect the learner cannot try, and the round
  // would be asking them to rule out something it never let them touch. The
  // fourth plate — *nothing, it is at its best* — belongs only to the sprigs
  // whose answer can be "nothing", and it is the Analyst's whole lesson.
  const patient = PATIENT_BY_ID[sim.pond.patientId] ?? PATIENT_BY_ID['stuffy']
  const plates: Suspect[] = [...patient.dials, ...(patient.ceilingPlate ? (['none'] as Suspect[]) : [])]
  return (
    <group name="pond-stage">
      {/* the bench */}
      <mesh position={[0, TANK.y - TANK.h / 2 - 0.36, 0]} receiveShadow>
        <boxGeometry args={[6, 0.24, 2.6]} />
        <meshStandardMaterial color="#8A6A45" roughness={0.9} />
      </mesh>
      <Bath sim={sim} />

      {/* the tank */}
      <mesh position={[0, TANK.y, 0]} castShadow>
        <boxGeometry args={[TANK.w, TANK.h, TANK.d]} />
        <meshStandardMaterial color={GLASS} transparent opacity={0.22} roughness={0.08} metalness={0.05} />
      </mesh>
      {/* Edges, or the glass reads as a pane rather than a container — the
          single biggest thing between "a tank" and "a blue rectangle". */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(TANK.w, TANK.h, TANK.d)]} />
        <lineBasicMaterial color="#6E8A97" transparent opacity={0.7} />
      </lineSegments>
      <mesh position={[0, TANK.y - 0.08, 0]}>
        <boxGeometry args={[TANK.w - 0.06, TANK.h - 0.32, TANK.d - 0.06]} />
        <meshStandardMaterial color={WATER} transparent opacity={0.26} roughness={0.1} />
      </mesh>
      {/* The surface. A jar of water has a top, and the bubbles arrive at it. */}
      <mesh position={[0, WATER_TOP, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[TANK.w - 0.06, TANK.d - 0.06]} />
        <meshStandardMaterial color="#9FD0E8" transparent opacity={0.5} roughness={0.05} side={THREE.DoubleSide} />
      </mesh>

      <Sprig sim={sim} />
      <Bubbles sim={sim} />
      <Funnel />
      <Tube sim={sim} />
      <Rail />
      <Lamp sim={sim} />
      {/* The indicator is an instrument, not a garnish: it reads the water's
          carbon dioxide and it is how a Scientist sees the soda arrive. It
          stays on at every quality setting. */}
      <IndicatorTube sim={sim} />

      {/* a cloth over the tank, when the control is on */}
      {sim.pond.env.covered && (
        <mesh position={[0, TANK.y + 0.2, 0]}>
          <boxGeometry args={[TANK.w + 0.2, TANK.h + 0.2, TANK.d + 0.2]} />
          <meshStandardMaterial color="#4A4438" roughness={1} />
        </mesh>
      )}

      {plates.map((d, i) => (
        <Plate
          key={d}
          sim={sim}
          dial={d}
          index={i}
          of={plates.length}
          rank={sim.pond.accused === d ? 0 : 1 + i}
          live={!!canAccuse}
          onAccuse={onAccuse}
        />
      ))}
    </group>
  )
}
