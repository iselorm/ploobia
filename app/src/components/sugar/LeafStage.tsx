import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import GlyphInstances, { hideGlyph, writeGlyph } from '@/components/world/Glyphs'
import { getQualityCaps } from '@/lib/quality'
import type { SugarSim } from '@/lib/sugarsim'
import { ATLAS, glowSprite, thylakoidTexture } from './atlas'

/**
 * Inside a chloroplast.
 *
 * The point of this stage is that photosynthesis is **two** processes wired
 * together, and that they can be limited independently — which is the single
 * idea that turns "limiting factors" from a list to be memorised into
 * something a learner can watch happen.
 *
 *   THYLAKOID   light splits water, electrons run down the membrane, ATP and
 *               NADPH come out, oxygen is thrown away. Driven by light.
 *   STROMA      the Calvin cycle spends that ATP and NADPH fixing CO₂ into
 *               sugar. Driven by CO₂ — and by whatever the membrane sends it.
 *
 * Turn the light down and the grana go quiet while the cycle coasts on what is
 * left. Starve it of CO₂ and the membrane keeps flashing while the cycle
 * stalls. Same scene, two different answers to "what is holding it back?".
 */

const GRANA = [
  { x: -1.15, y: 0.42, z: -0.2, discs: 7, tilt: 0.2 },
  { x: -0.28, y: 0.95, z: 0.45, discs: 6, tilt: -0.16 },
  { x: 1.05, y: 0.5, z: -0.3, discs: 8, tilt: 0.12 },
]

/** Where the Calvin cycle runs, in the stroma below and in front of the stacks. */
const CYCLE_CENTRE = new THREE.Vector3(0.05, -0.5, 0.15)
const CYCLE_RADIUS = 0.92
/**
 * The cycle is tilted toward the lens rather than laid flat. Seen edge-on a
 * ring reads as a line, and the one thing this drawing has to say is that the
 * Calvin cycle *is a cycle*.
 */
const CYCLE_TILT = 1.02

/* ------------------------------------------------------------------ */
/* The organelle itself                                               */
/* ------------------------------------------------------------------ */

/**
 * A chloroplast is a lens, not a sphere, and it has a double envelope. The
 * front is left open so the camera is genuinely inside rather than peering
 * through a fogged shell.
 */
function Envelope() {
  const geometry = useMemo(() => {
    const g = new THREE.SphereGeometry(1, 40, 28, Math.PI * 0.18, Math.PI * 1.64)
    g.scale(2.05, 1.35, 1.5)
    g.computeVertexNormals()
    return g
  }, [])
  const inner = useMemo(() => {
    const g = new THREE.SphereGeometry(1, 36, 24, Math.PI * 0.18, Math.PI * 1.64)
    g.scale(1.96, 1.28, 1.43)
    g.computeVertexNormals()
    return g
  }, [])
  useEffect(
    () => () => {
      geometry.dispose()
      inner.dispose()
    },
    [geometry, inner],
  )

  return (
    <group>
      {/* The envelope is a hint, not a fog bank. An earlier pass stacked three
          translucent shells and the grana disappeared inside a pale egg. */}
      <mesh geometry={geometry}>
        <meshPhysicalMaterial
          color="#D6EBCB"
          roughness={0.3}
          metalness={0}
          transmission={0.72}
          thickness={0.25}
          transparent
          opacity={0.22}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* A rim on the inside of the far wall, so the organelle has an edge. */}
      <mesh geometry={inner}>
        <meshBasicMaterial color="#A9CE9A" transparent opacity={0.14} side={THREE.BackSide} depthWrite={false} />
      </mesh>
      {/* An outline in the plane of the plate. Without it the envelope is so
          faint that the grana read as floating in nothing at all. */}
      <mesh rotation={[0, 0, 0]} position={[0, 0, -0.05]} scale={[2.05, 1.35, 1]}>
        <torusGeometry args={[1, 0.011, 8, 96]} />
        <meshBasicMaterial color="#7FA872" transparent opacity={0.5} depthWrite={false} />
      </mesh>
    </group>
  )
}

/**
 * Stroma lamellae — the flattened tubes that join one granum to the next.
 *
 * Real chloroplasts are a connected membrane system, not a bag of separate
 * stacks, and drawing the links is what stops the three grana reading as three
 * unrelated objects that happen to share a room.
 */
function Lamellae() {
  const links = useMemo(() => {
    const out: Array<{ curve: THREE.CatmullRomCurve3 }> = []
    for (let i = 0; i < GRANA.length - 1; i++) {
      const a = GRANA[i]
      const b = GRANA[i + 1]
      out.push({
        curve: new THREE.CatmullRomCurve3([
          new THREE.Vector3(a.x, a.y, a.z),
          new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2 - 0.22, (a.z + b.z) / 2 + 0.12),
          new THREE.Vector3(b.x, b.y, b.z),
        ]),
      })
    }
    return out
  }, [])
  return (
    <group>
      {links.map((l, i) => (
        <mesh key={i}>
          <tubeGeometry args={[l.curve, 22, 0.035, 7, false]} />
          <meshStandardMaterial color="#4E9A55" roughness={0.55} metalness={0} transparent opacity={0.85} />
        </mesh>
      ))}
    </group>
  )
}

const WATER_IN = 10

/**
 * Water arriving at the membrane.
 *
 * It matters that this is here. The oxygen a plant releases comes from
 * splitting **water**, not from the carbon dioxide — probably the single most
 * commonly muddled fact in the topic — and the only way to make that arguable
 * from the picture is to show the water going in at the same place the oxygen
 * comes out.
 */
function WaterIn({ sim }: { sim: SugarSim }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const labelRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const scratch = useMemo(() => new THREE.Vector3(), [])
  const drops = useMemo(
    () =>
      Array.from({ length: WATER_IN }, (_, i) => ({
        target: GRANA[i % GRANA.length],
        t: i / WATER_IN,
        side: i % 2 === 0 ? -1 : 1,
      })),
    [],
  )

  useFrame((state, rawDt) => {
    const mesh = meshRef.current
    const label = labelRef.current
    if (!mesh || !label) return
    const dt = Math.min(rawDt, 0.05)
    const lit = sim.solve ? sim.solve.leaf.lightFactor : 0
    const moving = sim.started && !sim.paused
    const active = Math.max(1, Math.round(WATER_IN * lit))

    for (let i = 0; i < WATER_IN; i++) {
      const d = drops[i]
      if (i >= active) {
        dummy.scale.setScalar(0)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        hideGlyph(label, i, dummy)
        continue
      }
      if (moving) {
        d.t += dt * (0.1 + lit * 0.2)
        if (d.t > 1) d.t = 0
      }
      // Up from the stroma floor into the side of the stack.
      scratch.set(
        d.target.x + d.side * (0.85 - d.t * 0.5),
        -1.15 + d.t * (d.target.y + 1.15),
        d.target.z + 0.18,
      )
      dummy.position.copy(scratch)
      dummy.rotation.set(0, 0, 0)
      const fade = Math.min(1, d.t * 6) * Math.min(1, (1 - d.t) * 5)
      dummy.scale.setScalar(0.05 * fade)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      if (i === 0) {
        scratch.y += 0.1
        writeGlyph(label, i, dummy, state.camera, scratch, fade, 0.12)
      } else {
        hideGlyph(label, i, dummy)
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    label.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={meshRef} args={[undefined, undefined, WATER_IN]} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color={ATLAS.water} roughness={0.16} metalness={0} transparent opacity={0.9} />
      </instancedMesh>
      <GlyphInstances
        ref={labelRef}
        text="H₂O"
        color={ATLAS.waterDeep}
        count={WATER_IN}
        size={0.12}
        style={{ strokeWidth: 7, strokeColor: 'rgba(252,250,244,0.96)' }}
      />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Grana — the stacks of thylakoids                                    */
/* ------------------------------------------------------------------ */

function Grana({ sim }: { sim: SugarSim }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const texture = useMemo(() => thylakoidTexture(), [])
  const total = GRANA.reduce((a, g) => a + g.discs, 0)
  const layout = useMemo(() => {
    const out: Array<{ p: THREE.Vector3; tilt: number; r: number }> = []
    GRANA.forEach((g) => {
      for (let i = 0; i < g.discs; i++) {
        const off = (i - (g.discs - 1) / 2) * 0.115
        out.push({
          p: new THREE.Vector3(g.x, g.y + off, g.z),
          tilt: g.tilt,
          r: 0.36 - Math.abs(off) * 0.2,
        })
      }
    })
    return out
  }, [])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const lit = sim.solve ? sim.solve.leaf.lightFactor : 0
    layout.forEach((d, i) => {
      // The stacks breathe faintly with the light reactions running.
      const beat = 1 + Math.sin(sim.time * 3 + i * 0.4) * 0.02 * lit
      dummy.position.copy(d.p)
      dummy.rotation.set(Math.PI / 2 + d.tilt, 0, d.tilt * 0.4)
      dummy.scale.set(d.r * beat, 0.05, d.r * beat)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    const mat = mesh.material as THREE.MeshStandardMaterial
    mat.emissiveIntensity = 0.08 + lit * 0.5
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, total]} frustumCulled={false} castShadow>
      <cylinderGeometry args={[1, 1, 1, 20]} />
      <meshStandardMaterial
        map={texture}
        color="#DDF0D2"
        roughness={0.45}
        metalness={0}
        emissive="#3E8C44"
        emissiveIntensity={0.2}
      />
    </instancedMesh>
  )
}

/* ------------------------------------------------------------------ */
/* Light in, oxygen out                                               */
/* ------------------------------------------------------------------ */

const PHOTON_LANES = 6
const PHOTONS_PER_LANE = 4
const PHOTON_TOTAL = PHOTON_LANES * PHOTONS_PER_LANE

/**
 * Photons arriving in tidy lanes, each aimed at one granum. Brighter light
 * lights more lanes rather than making the existing ones frantic — the house
 * rule that a busy scene reads as noise, not as energy.
 */
function Photons({ sim }: { sim: SugarSim }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const sprite = useMemo(() => glowSprite('rgba(255,244,190,0.98)', 'rgba(255,214,110,0.35)', 'photon'), [])
  const progress = useRef(0)
  const from = useMemo(() => new THREE.Vector3(), [])
  const to = useMemo(() => new THREE.Vector3(), [])
  const at = useMemo(() => new THREE.Vector3(), [])

  useFrame((state, rawDt) => {
    const mesh = meshRef.current
    if (!mesh) return
    const dt = Math.min(rawDt, 0.05)
    const lit = sim.solve ? sim.solve.leaf.lightFactor : 0
    if (sim.started && !sim.paused) progress.current += dt * (0.2 + lit * 0.5)
    const lanes = Math.max(0, Math.round(PHOTON_LANES * lit))

    for (let lane = 0; lane < PHOTON_LANES; lane++) {
      const target = GRANA[lane % GRANA.length]
      from.set(target.x - 0.9 + lane * 0.12, 2.05, target.z - 0.45)
      to.set(target.x, target.y, target.z)
      for (let k = 0; k < PHOTONS_PER_LANE; k++) {
        const index = lane * PHOTONS_PER_LANE + k
        if (lane >= lanes) {
          dummy.scale.setScalar(0)
          dummy.updateMatrix()
          mesh.setMatrixAt(index, dummy.matrix)
          continue
        }
        const t = (progress.current + lane * 0.23 + k / PHOTONS_PER_LANE) % 1
        at.lerpVectors(from, to, t)
        dummy.position.copy(at)
        dummy.quaternion.copy(state.camera.quaternion)
        const fade = Math.min(1, t * 5) * Math.min(1, (1 - t) * 9)
        dummy.scale.setScalar(0.42 * fade)
        dummy.updateMatrix()
        mesh.setMatrixAt(index, dummy.matrix)
      }
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, PHOTON_TOTAL]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={sprite} transparent depthWrite={false} toneMapped={false} />
    </instancedMesh>
  )
}

const O2_POOL = 12

/**
 * The oxygen. It comes from splitting water, not from the carbon dioxide —
 * the most commonly muddled fact in the whole topic — so it is emitted from
 * the thylakoid membrane where the splitting happens, and nowhere else.
 */
function OxygenRelease({ sim }: { sim: SugarSim }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const labelRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const scratch = useMemo(() => new THREE.Vector3(), [])
  const bubbles = useMemo(
    () =>
      Array.from({ length: O2_POOL }, (_, i) => ({
        origin: GRANA[i % GRANA.length],
        t: i / O2_POOL,
        spin: (i * 1.7) % (Math.PI * 2),
      })),
    [],
  )

  useFrame((state, rawDt) => {
    const mesh = meshRef.current
    const label = labelRef.current
    if (!mesh || !label) return
    const dt = Math.min(rawDt, 0.05)
    const lit = sim.solve ? sim.solve.leaf.lightFactor : 0
    const active = Math.round(O2_POOL * lit)
    const moving = sim.started && !sim.paused

    for (let i = 0; i < O2_POOL; i++) {
      const b = bubbles[i]
      if (i >= active) {
        dummy.scale.setScalar(0)
        dummy.updateMatrix()
        mesh.setMatrixAt(i * 2, dummy.matrix)
        mesh.setMatrixAt(i * 2 + 1, dummy.matrix)
        hideGlyph(label, i, dummy)
        continue
      }
      if (moving) {
        b.t += dt * (0.1 + lit * 0.18)
        if (b.t > 1) b.t = 0
        b.spin += dt * 1.2
      }
      const rise = b.t * 2.2
      const fade = Math.min(1, b.t * 6) * Math.min(1, (1 - b.t) * 4)
      // Diatomic: two bonded atoms, because "oxygen" in the air is O₂.
      for (let k = 0; k < 2; k++) {
        const a = b.spin + (k === 0 ? 0 : Math.PI)
        scratch.set(
          b.origin.x + Math.cos(a) * 0.045 + Math.sin(b.t * 5 + b.spin) * 0.08,
          b.origin.y + rise,
          b.origin.z + Math.sin(a) * 0.045,
        )
        dummy.position.copy(scratch)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.setScalar(0.048 * fade)
        dummy.updateMatrix()
        mesh.setMatrixAt(i * 2 + k, dummy.matrix)
      }
      if (i % 4 === 0) {
        scratch.y += 0.08
        writeGlyph(label, i, dummy, state.camera, scratch, fade, 0.1)
      } else {
        hideGlyph(label, i, dummy)
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    label.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={meshRef} args={[undefined, undefined, O2_POOL * 2]} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial
          color={ATLAS.oxygen}
          roughness={0.14}
          metalness={0}
          transparent
          opacity={0.92}
          emissive={ATLAS.oxygen}
          emissiveIntensity={0.25}
        />
      </instancedMesh>
      <GlyphInstances
        ref={labelRef}
        text="O₂"
        color={ATLAS.waterDeep}
        count={O2_POOL}
        size={0.09}
        style={{ strokeWidth: 6, strokeColor: 'rgba(252,250,244,0.95)' }}
      />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* The energy carriers                                                */
/* ------------------------------------------------------------------ */

const CARRIER_POOL = 10

/**
 * ATP and NADPH ferrying from the membrane to the cycle.
 *
 * They are the whole reason the two halves are joined, and drawing them is
 * what stops the light reactions and the Calvin cycle reading as two unrelated
 * animations sharing a room. They run out to the cycle full and come back
 * empty, which is also true.
 */
function Carriers({ sim }: { sim: SugarSim }) {
  const atpRef = useRef<THREE.InstancedMesh>(null)
  const nadphRef = useRef<THREE.InstancedMesh>(null)
  const atpLabel = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const scratch = useMemo(() => new THREE.Vector3(), [])
  const from = useMemo(() => new THREE.Vector3(), [])
  const carriers = useMemo(
    () =>
      Array.from({ length: CARRIER_POOL * 2 }, (_, i) => ({
        granum: GRANA[i % GRANA.length],
        t: (i / (CARRIER_POOL * 2)) % 1,
        angle: (i * 137.5 * Math.PI) / 180,
      })),
    [],
  )

  useFrame((state, rawDt) => {
    const atp = atpRef.current
    const nadph = nadphRef.current
    const label = atpLabel.current
    if (!atp || !nadph || !label) return
    const dt = Math.min(rawDt, 0.05)
    const lit = sim.solve ? sim.solve.leaf.lightFactor : 0
    const moving = sim.started && !sim.paused
    const active = Math.round(CARRIER_POOL * lit)

    for (let i = 0; i < CARRIER_POOL; i++) {
      for (let kind = 0; kind < 2; kind++) {
        const c = carriers[i * 2 + kind]
        const mesh = kind === 0 ? atp : nadph
        if (i >= active) {
          dummy.scale.setScalar(0)
          dummy.updateMatrix()
          mesh.setMatrixAt(i, dummy.matrix)
          if (kind === 0) hideGlyph(label, i, dummy)
          continue
        }
        if (moving) {
          c.t += dt * (0.16 + lit * 0.3)
          if (c.t > 1) c.t = 0
        }
        from.set(c.granum.x, c.granum.y, c.granum.z)
        scratch.set(
          CYCLE_CENTRE.x + Math.cos(c.angle) * CYCLE_RADIUS,
          CYCLE_CENTRE.y + Math.sin(c.angle) * 0.16,
          CYCLE_CENTRE.z + Math.sin(c.angle) * CYCLE_RADIUS,
        )
        // Out full, back empty — a loop, not a one-way stream.
        const there = c.t < 0.5 ? c.t * 2 : 1 - (c.t - 0.5) * 2
        dummy.position.lerpVectors(from, scratch, there)
        dummy.position.y += Math.sin(there * Math.PI) * 0.16
        dummy.rotation.set(0, sim.time * 1.6 + i, 0)
        const carrying = c.t < 0.5 ? 1 : 0.55
        dummy.scale.setScalar(0.055 * carrying)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        if (kind === 0 && i === 0) {
          scratch.copy(dummy.position)
          scratch.y += 0.1
          writeGlyph(label, i, dummy, state.camera, scratch, 1, 0.12)
        } else if (kind === 0) {
          hideGlyph(label, i, dummy)
        }
      }
    }
    atp.instanceMatrix.needsUpdate = true
    nadph.instanceMatrix.needsUpdate = true
    label.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={atpRef} args={[undefined, undefined, CARRIER_POOL]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#F2C14E" emissive="#C48A16" emissiveIntensity={0.6} roughness={0.3} />
      </instancedMesh>
      <instancedMesh ref={nadphRef} args={[undefined, undefined, CARRIER_POOL]} frustumCulled={false}>
        <octahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#8FB6E8" emissive="#3B6FA8" emissiveIntensity={0.5} roughness={0.3} />
      </instancedMesh>
      <GlyphInstances
        ref={atpLabel}
        text="ATP"
        color="#8A5A0B"
        count={CARRIER_POOL}
        size={0.1}
        style={{ strokeWidth: 6, strokeColor: 'rgba(252,250,244,0.95)' }}
      />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* The Calvin cycle                                                   */
/* ------------------------------------------------------------------ */

const CYCLE_STATIONS = [
  { at: 0.0, text: 'CO₂', color: ATLAS.co2 },
  { at: 0.22, text: '3-PGA', color: '#7A6A4A' },
  { at: 0.5, text: 'G3P', color: ATLAS.sugarDeep },
  { at: 0.78, text: 'RuBP', color: ATLAS.greenDeep },
]

const CYCLE_TOKENS = 14

/**
 * The Calvin cycle, drawn as what it is: a loop that runs on the carriers the
 * membrane sends over, takes CO₂ in at one point, and lets one carbon in six
 * leave as sugar while the rest go round again to rebuild the acceptor.
 *
 * The ring idiom is ThreeUI's Orbital Sphere (MIT) reduced to a single plane
 * and given stations — the point being that a cycle should look like a cycle,
 * with a visible exit, rather than like a list of arrows.
 */
function CalvinCycle({ sim }: { sim: SugarSim }) {
  const tokenRef = useRef<THREE.InstancedMesh>(null)
  const exitRef = useRef<THREE.InstancedMesh>(null)
  const labelRefs = useRef<Array<THREE.InstancedMesh | null>>([])
  const glucoseLabel = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const scratch = useMemo(() => new THREE.Vector3(), [])
  const tokens = useMemo(
    () => Array.from({ length: CYCLE_TOKENS }, (_, i) => ({ t: i / CYCLE_TOKENS })),
    [],
  )
  const exits = useMemo(
    () => Array.from({ length: 6 }, () => ({ alive: false, u: 0 })),
    [],
  )
  const exitAcc = useRef(0)

  // A ring in the XZ plane, tipped back about X so it presents as an ellipse
  // rather than a line. Rotating the *points* rather than a parent group keeps
  // the station labels and the exit path in the same space as everything else.
  const SIN_T = Math.sin(CYCLE_TILT)
  const COS_T = Math.cos(CYCLE_TILT)
  const pointAt = (t: number, out: THREE.Vector3) => {
    const a = t * Math.PI * 2
    out.set(
      CYCLE_CENTRE.x + Math.cos(a) * CYCLE_RADIUS,
      CYCLE_CENTRE.y - Math.sin(a) * CYCLE_RADIUS * SIN_T,
      CYCLE_CENTRE.z + Math.sin(a) * CYCLE_RADIUS * COS_T,
    )
    return out
  }

  useFrame((state, rawDt) => {
    const mesh = tokenRef.current
    const exit = exitRef.current
    if (!mesh || !exit) return
    const dt = Math.min(rawDt, 0.05)
    const solve = sim.solve
    const moving = sim.started && !sim.paused
    // The cycle's speed is the carbon actually being fixed, so a CO₂-starved
    // chloroplast visibly stalls while its membrane keeps flashing.
    const drive = solve ? THREE.MathUtils.clamp(solve.leaf.gross / 18, 0, 1.2) : 0

    tokens.forEach((tok, i) => {
      if (moving) {
        tok.t += dt * (0.03 + drive * 0.16)
        if (tok.t > 1) tok.t -= 1
      }
      pointAt(tok.t, scratch)
      dummy.position.copy(scratch)
      dummy.rotation.set(0, sim.time + i, 0)
      dummy.scale.setScalar(0.055 * (0.6 + drive * 0.5))
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true

    // One carbon in six leaves the cycle as sugar; the other five stay in to
    // rebuild RuBP. That ratio is the reason the cycle has to turn six times
    // to make one glucose.
    if (moving) {
      exitAcc.current += dt * drive * 0.9
      while (exitAcc.current >= 1) {
        exitAcc.current -= 1
        const free = exits.find((e) => !e.alive)
        if (free) {
          free.alive = true
          free.u = 0
        }
      }
    }
    exits.forEach((e, i) => {
      if (!e.alive) {
        dummy.scale.setScalar(0)
        dummy.updateMatrix()
        exit.setMatrixAt(i, dummy.matrix)
        if (glucoseLabel.current) hideGlyph(glucoseLabel.current, i, dummy)
        return
      }
      if (moving) {
        e.u += dt * 0.35
        if (e.u >= 1) e.alive = false
      }
      pointAt(0.5, scratch)
      // Out of the cycle, through the envelope, on its way to the phloem.
      dummy.position.set(
        scratch.x + e.u * 2.6,
        scratch.y - 0.1 + Math.sin(e.u * Math.PI) * 0.5,
        scratch.z + e.u * 0.6,
      )
      dummy.rotation.set(e.u * 4, e.u * 3, 0.4)
      const fade = Math.min(1, e.u * 6) * Math.min(1, (1 - e.u) * 3)
      dummy.scale.setScalar(0.085 * fade)
      dummy.updateMatrix()
      exit.setMatrixAt(i, dummy.matrix)
      if (glucoseLabel.current && i === 0) {
        scratch.copy(dummy.position)
        scratch.y += 0.14
        writeGlyph(glucoseLabel.current, i, dummy, state.camera, scratch, fade, 0.14)
      } else if (glucoseLabel.current) {
        hideGlyph(glucoseLabel.current, i, dummy)
      }
    })
    exit.instanceMatrix.needsUpdate = true

    // Station labels sit on the ring and face the camera.
    CYCLE_STATIONS.forEach((s, i) => {
      const label = labelRefs.current[i]
      if (!label) return
      pointAt(s.at, scratch)
      scratch.y += 0.16
      // A generous lift along the view ray: RuBP sits at the back of the ring
      // and was permanently behind the middle granum without it.
      writeGlyph(label, 0, dummy, state.camera, scratch, 1, 0.5)
      label.instanceMatrix.needsUpdate = true
    })
  })

  return (
    <group>
      {/* The loop itself, plus a marker at each station so the ring reads as a
          route with stops rather than a decorative hoop. */}
      <mesh position={CYCLE_CENTRE} rotation={[Math.PI / 2 + CYCLE_TILT, 0, 0]}>
        <torusGeometry args={[CYCLE_RADIUS, 0.026, 10, 80]} />
        <meshStandardMaterial
          color={ATLAS.greenDeep}
          roughness={0.55}
          transparent
          opacity={0.7}
          emissive={ATLAS.green}
          emissiveIntensity={0.15}
        />
      </mesh>
      {CYCLE_STATIONS.map((s) => {
        const a = s.at * Math.PI * 2
        return (
          <mesh
            key={`stop-${s.text}`}
            position={[
              CYCLE_CENTRE.x + Math.cos(a) * CYCLE_RADIUS,
              CYCLE_CENTRE.y - Math.sin(a) * CYCLE_RADIUS * Math.sin(CYCLE_TILT),
              CYCLE_CENTRE.z + Math.sin(a) * CYCLE_RADIUS * Math.cos(CYCLE_TILT),
            ]}
          >
            <sphereGeometry args={[0.062, 12, 10]} />
            <meshStandardMaterial color={s.color} roughness={0.4} metalness={0} />
          </mesh>
        )
      })}
      <instancedMesh ref={tokenRef} args={[undefined, undefined, CYCLE_TOKENS]} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color="#6C7480" roughness={0.45} metalness={0} />
      </instancedMesh>
      <instancedMesh ref={exitRef} args={[undefined, undefined, 6]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color={ATLAS.sugarLight}
          emissive={ATLAS.sugarDeep}
          emissiveIntensity={0.55}
          roughness={0.3}
        />
      </instancedMesh>
      {CYCLE_STATIONS.map((s, i) => (
        <GlyphInstances
          key={s.text}
          ref={(el) => {
            labelRefs.current[i] = el
          }}
          text={s.text}
          color={s.color}
          count={1}
          size={0.17}
          style={{ strokeWidth: 8, strokeColor: 'rgba(252,250,244,0.97)' }}
        />
      ))}
      <GlyphInstances
        ref={glucoseLabel}
        text="C₆H₁₂O₆"
        color={ATLAS.sugarDeep}
        count={6}
        size={0.12}
        style={{ strokeWidth: 7, strokeColor: 'rgba(252,250,244,0.96)' }}
      />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Stage labels                                                       */
/* ------------------------------------------------------------------ */

/**
 * Two standing captions, in the world rather than floating over it, naming the
 * two halves. They are depth-tested, so walking the camera behind a granum
 * hides them exactly as it should.
 */
function StageTags() {
  const thylakoid = useRef<THREE.InstancedMesh>(null)
  const stroma = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const scratch = useMemo(() => new THREE.Vector3(), [])

  useFrame((state) => {
    if (thylakoid.current) {
      scratch.set(-1.15, 1.42, 0.1)
      writeGlyph(thylakoid.current, 0, dummy, state.camera, scratch, 1, 0.25)
      thylakoid.current.instanceMatrix.needsUpdate = true
    }
    if (stroma.current) {
      scratch.set(1.25, -1.15, 0.3)
      writeGlyph(stroma.current, 0, dummy, state.camera, scratch, 1, 0.25)
      stroma.current.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <group>
      <GlyphInstances
        ref={thylakoid}
        text="THYLAKOID"
        color={ATLAS.greenDeep}
        count={1}
        size={0.2}
        style={{ strokeWidth: 8, strokeColor: 'rgba(252,250,244,0.97)' }}
      />
      <GlyphInstances
        ref={stroma}
        text="STROMA"
        color={ATLAS.muted}
        count={1}
        size={0.2}
        style={{ strokeWidth: 8, strokeColor: 'rgba(252,250,244,0.97)' }}
      />
    </group>
  )
}

/* ------------------------------------------------------------------ */

export default function LeafStage({ sim }: { sim: SugarSim }) {
  const quality = getQualityCaps()
  return (
    <group position={[0, 1.5, 0]}>
      <Envelope />
      <Lamellae />
      <Grana sim={sim} />
      <WaterIn sim={sim} />
      <Photons sim={sim} />
      <OxygenRelease sim={sim} />
      {quality.particleScale > 0.5 && <Carriers sim={sim} />}
      <CalvinCycle sim={sim} />
      <StageTags />
    </group>
  )
}
