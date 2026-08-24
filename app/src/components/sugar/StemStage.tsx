import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import GlyphInstances, { hideGlyph, writeGlyph } from '@/components/world/Glyphs'
import type { SugarSim } from '@/lib/sugarsim'
import { simSpecimen } from '@/lib/sugarsim'
import { ATLAS, glowSprite, stemSectionTexture } from './atlas'

/**
 * The stem, cut open and blown up until one sieve tube is the size of a
 * drainpipe.
 *
 * Three things have to land here, and none of them survive a diagram:
 *
 * 1. **There are two pipes and they run opposite ways.** Water climbs the
 *    xylem under tension; sucrose descends the phloem under pressure.
 * 2. **The phloem is a mass flow, and water is what does the pushing.** Sugar
 *    loaded at the top drags water in osmotically from the xylem next door,
 *    that raises the pressure, and the whole column moves. At the far end the
 *    sugar is unloaded and the water goes straight back to the xylem. It is a
 *    circuit, not a one-way street.
 * 3. **Girdling takes the phloem and leaves the xylem**, because the phloem is
 *    on the outside. Cut the ring and the sugar column stops dead while the
 *    water column carries on untouched.
 */

const TOP = 1.85
const BOTTOM = -1.85
const XYLEM_X = -0.62
const PHLOEM_X = 0.42
const COMPANION_X = 0.98
const XYLEM_R = 0.24
const PHLOEM_R = 0.2

/** Where the girdle removes the phloem, in this view's own coordinates. */
const CUT_TOP = 0.26
const CUT_BOTTOM = -0.26

/* ------------------------------------------------------------------ */
/* The tissue around the pipes                                        */
/* ------------------------------------------------------------------ */

function Cortex() {
  const section = useMemo(() => stemSectionTexture(), [])
  return (
    <group>
      {/* The stem wall, opened toward the camera. */}
      <mesh rotation={[0, 0, 0]}>
        <cylinderGeometry args={[1.78, 1.78, TOP - BOTTOM, 44, 1, true, Math.PI * 0.26, Math.PI * 1.48]} />
        <meshStandardMaterial color="#A9C182" roughness={0.88} metalness={0} side={THREE.DoubleSide} />
      </mesh>
      {/* Cut faces at top and bottom, wearing the real transverse section. */}
      {[TOP, BOTTOM].map((y, i) => (
        <mesh key={i} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1.78, 44]} />
          <meshStandardMaterial map={section} roughness={0.8} metalness={0} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* A pale ground plane behind the pipes so they read against something. */}
      <mesh position={[0.1, 0, -1.5]}>
        <planeGeometry args={[4.2, TOP - BOTTOM]} />
        <meshStandardMaterial color="#E9EEDC" roughness={0.95} metalness={0} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* The two pipes                                                      */
/* ------------------------------------------------------------------ */

function Pipes({ sim }: { sim: SugarSim }) {
  const bridgeRef = useRef<THREE.Mesh>(null)
  const bulgeRef = useRef<THREE.Group>(null)

  const plates = useMemo(() => {
    const out: number[] = []
    for (let y = TOP - 0.55; y > BOTTOM; y -= 0.7) out.push(y)
    return out
  }, [])

  useFrame(() => {
    const solve = sim.solve
    // The source end of a loaded sieve tube is genuinely fatter: the osmotic
    // inrush stretches it. Turgor you can see.
    const swell = solve ? 1 + THREE.MathUtils.clamp(solve.sourcePressure / 2.4, 0, 1) * 0.13 : 1
    if (bulgeRef.current) {
      bulgeRef.current.scale.x += (swell - bulgeRef.current.scale.x) * 0.08
      bulgeRef.current.scale.z = bulgeRef.current.scale.x
    }
    // The sieve tube is drawn in three pieces so the middle one can vanish
    // when the ring is cut. Leaving that gap open all the time — which the
    // first pass did — put a hole in a perfectly healthy stem.
    if (bridgeRef.current) bridgeRef.current.visible = !sim.girdled
  })

  return (
    <group>
      {/* Xylem — a dead, open pipe. Wide bore, no end walls, thick lignin rings. */}
      <mesh position={[XYLEM_X, 0, 0]}>
        <cylinderGeometry args={[XYLEM_R, XYLEM_R, TOP - BOTTOM, 24, 1, true]} />
        <meshPhysicalMaterial
          color="#B3D2EA"
          roughness={0.2}
          metalness={0}
          transmission={0.3}
          thickness={0.2}
          transparent
          opacity={0.66}
          side={THREE.DoubleSide}
        />
      </mesh>
      {Array.from({ length: 11 }, (_, i) => BOTTOM + 0.2 + i * 0.38).map((y, i) => (
        <mesh key={i} position={[XYLEM_X, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[XYLEM_R * 1.02, 0.02, 6, 22]} />
          <meshStandardMaterial color="#8FB4D2" roughness={0.5} metalness={0} />
        </mesh>
      ))}

      {/* Phloem — living sieve tube, split so the cut can open in the middle. */}
      <group ref={bulgeRef} position={[PHLOEM_X, 0, 0]}>
        <mesh position={[0, (TOP + CUT_TOP) / 2, 0]}>
          <cylinderGeometry args={[PHLOEM_R, PHLOEM_R, TOP - CUT_TOP, 22, 1, true]} />
          <meshPhysicalMaterial
            color="#F0D49A"
            roughness={0.35}
            metalness={0}
            transmission={0.35}
            thickness={0.2}
            transparent
            opacity={0.62}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh position={[0, (BOTTOM + CUT_BOTTOM) / 2, 0]}>
          <cylinderGeometry args={[PHLOEM_R, PHLOEM_R, CUT_BOTTOM - BOTTOM, 22, 1, true]} />
          <meshPhysicalMaterial
            color="#F0D49A"
            roughness={0.35}
            metalness={0}
            transmission={0.35}
            thickness={0.2}
            transparent
            opacity={0.62}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh ref={bridgeRef}>
          <cylinderGeometry args={[PHLOEM_R, PHLOEM_R, CUT_TOP - CUT_BOTTOM, 22, 1, true]} />
          <meshPhysicalMaterial
            color="#F0D49A"
            roughness={0.35}
            metalness={0}
            transmission={0.35}
            thickness={0.2}
            transparent
            opacity={0.62}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      {/* Sieve plates: perforated end walls. These are the resistance that makes
          phloem sap crawl at a metre an hour instead of tearing along. */}
      {plates.map((y, i) => (
        <group key={i} position={[PHLOEM_X, y, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[PHLOEM_R * 0.24, PHLOEM_R * 0.99, 20]} />
            <meshStandardMaterial
              color="#C79A3E"
              roughness={0.6}
              metalness={0}
              side={THREE.DoubleSide}
              transparent
              opacity={0.85}
            />
          </mesh>
          {[0, 1, 2, 3, 4].map((k) => {
            const a = (k / 5) * Math.PI * 2
            return (
              <mesh key={k} position={[Math.cos(a) * PHLOEM_R * 0.62, 0, Math.sin(a) * PHLOEM_R * 0.62]}>
                <cylinderGeometry args={[PHLOEM_R * 0.14, PHLOEM_R * 0.14, 0.04, 8]} />
                <meshBasicMaterial color="#F7E7C2" />
              </mesh>
            )
          })}
        </group>
      ))}

      {/* Companion cells: the pumps. A sieve element has no nucleus and cannot
          run its own loading, so the cell strapped to its side does it. */}
      {[1.2, 0.4, -0.4, -1.2].map((y, i) => (
        <group key={i} position={[COMPANION_X, y, 0]}>
          <mesh>
            <capsuleGeometry args={[0.14, 0.42, 6, 12]} />
            <meshStandardMaterial color="#8FC080" roughness={0.6} metalness={0} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.055, 10, 8]} />
            <meshStandardMaterial color="#4A7C43" roughness={0.5} />
          </mesh>
          {/* Plasmodesmata — the doorways sugar is pumped through. */}
          <mesh position={[-0.29, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.022, 0.022, 0.28, 6]} />
            <meshStandardMaterial color="#B7D8A8" roughness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* The cut                                                            */
/* ------------------------------------------------------------------ */

function Cut({ sim }: { sim: SugarSim }) {
  const groupRef = useRef<THREE.Group>(null)
  const glow = useMemo(() => glowSprite('rgba(193,59,51,0.5)', 'rgba(193,59,51,0.12)', 'cut'), [])
  useFrame(() => {
    if (groupRef.current) groupRef.current.visible = sim.girdled
  })
  return (
    <group ref={groupRef} position={[PHLOEM_X, 0, 0]} visible={false}>
      {[CUT_TOP, CUT_BOTTOM].map((y, i) => (
        <mesh key={i} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[PHLOEM_R, 22]} />
          <meshStandardMaterial color="#B08A55" roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <mesh>
        <planeGeometry args={[1.6, 1.6]} />
        <meshBasicMaterial map={glow} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Traffic                                                            */
/* ------------------------------------------------------------------ */

const SAP_POOL = 26
const WATER_POOL = 20
const OSMO_POOL = 12

/**
 * Sucrose descending the sieve tube. When the ring is cut the column simply
 * stops above the gap and piles up — which is what really happens, and why a
 * girdled trunk swells above the cut and starves below it.
 */
function SapFlow({ sim }: { sim: SugarSim }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const labelRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const scratch = useMemo(() => new THREE.Vector3(), [])
  const parcels = useMemo(
    () =>
      Array.from({ length: SAP_POOL }, (_, i) => ({
        y: TOP - (i / SAP_POOL) * (TOP - BOTTOM),
        lane: (i % 4) / 4,
        wobble: (i * 2.399) % (Math.PI * 2),
      })),
    [],
  )

  useFrame((state, rawDt) => {
    const mesh = meshRef.current
    const label = labelRef.current
    if (!mesh || !label) return
    const dt = Math.min(rawDt, 0.05)
    const solve = sim.solve
    const moving = sim.started && !sim.paused
    const speed = solve ? THREE.MathUtils.clamp(solve.velocity * 0.34, 0, 1.6) : 0
    const density = solve ? THREE.MathUtils.clamp(solve.exportRate / 26, 0.08, 1) : 0.08
    const active = Math.max(3, Math.round(SAP_POOL * density))

    for (let i = 0; i < SAP_POOL; i++) {
      const p = parcels[i]
      if (i >= active) {
        dummy.scale.setScalar(0)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        hideGlyph(label, i, dummy)
        continue
      }
      if (moving) {
        // Girdled: everything above the cut queues up against it.
        const blocked = sim.girdled && p.y > CUT_TOP
        const stop = CUT_TOP + 0.1 + (i % 5) * 0.16
        if (blocked) {
          if (p.y > stop) p.y -= dt * speed * 0.5
        } else {
          p.y -= dt * speed
          if (p.y < BOTTOM) p.y = TOP
        }
        // A parcel below the cut drains away and is not replaced.
        if (sim.girdled && p.y < CUT_BOTTOM && p.y > BOTTOM + 0.05) p.y -= dt * speed * 0.6
      }
      const a = p.lane * Math.PI * 2 + Math.sin(sim.time * 0.6 + p.wobble) * 0.4
      const r = PHLOEM_R * 0.52
      scratch.set(PHLOEM_X + Math.cos(a) * r, p.y, Math.sin(a) * r)
      // Nothing may be drawn inside the gap the cut leaves behind.
      const inGap = sim.girdled && p.y < CUT_TOP && p.y > CUT_BOTTOM
      dummy.position.copy(scratch)
      dummy.rotation.set(sim.time * 0.8 + p.wobble, p.y * 2, 0.3)
      dummy.scale.setScalar(inGap ? 0 : 0.062)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)

      if (i === 2 || i === 12) {
        scratch.x += 0.16
        writeGlyph(label, i, dummy, state.camera, scratch, inGap ? 0 : 1, 0.16)
      } else {
        hideGlyph(label, i, dummy)
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    label.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={meshRef} args={[undefined, undefined, SAP_POOL]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color={ATLAS.sugarLight}
          emissive={ATLAS.sugarDeep}
          emissiveIntensity={0.45}
          roughness={0.3}
        />
      </instancedMesh>
      <GlyphInstances
        ref={labelRef}
        text="sucrose"
        color={ATLAS.sugarDeep}
        count={SAP_POOL}
        size={0.11}
        style={{ strokeWidth: 7, strokeColor: 'rgba(252,250,244,0.96)' }}
      />
    </group>
  )
}

/** Water climbing the xylem, at the speed transpiration is pulling it. */
function XylemFlow({ sim }: { sim: SugarSim }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const drops = useMemo(
    () =>
      Array.from({ length: WATER_POOL }, (_, i) => ({
        y: BOTTOM + (i / WATER_POOL) * (TOP - BOTTOM),
        lane: (i % 5) / 5,
      })),
    [],
  )

  useFrame((_, rawDt) => {
    const mesh = meshRef.current
    if (!mesh) return
    const dt = Math.min(rawDt, 0.05)
    const solve = sim.solve
    const moving = sim.started && !sim.paused
    const pull = THREE.MathUtils.clamp((solve?.leaf.transpiration ?? 0) * 0.9, 0.04, 1.4)
    for (let i = 0; i < WATER_POOL; i++) {
      const d = drops[i]
      if (moving) {
        d.y += dt * (0.25 + pull * 1.5)
        if (d.y > TOP) d.y = BOTTOM
      }
      const a = d.lane * Math.PI * 2
      dummy.position.set(XYLEM_X + Math.cos(a) * XYLEM_R * 0.5, d.y, Math.sin(a) * XYLEM_R * 0.5)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.setScalar(0.058)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, WATER_POOL]} frustumCulled={false}>
      <sphereGeometry args={[1, 10, 8]} />
      <meshStandardMaterial color={ATLAS.water} roughness={0.15} metalness={0} transparent opacity={0.9} />
    </instancedMesh>
  )
}

/**
 * The Münch circuit: water crossing from the xylem into the sieve tube at the
 * loaded end, and crossing straight back at the unloading end.
 *
 * This is the part every diagram leaves out, and without it "pressure flow"
 * is just a phrase. The sugar does not push itself along — the water that the
 * sugar drags in does the pushing.
 */
function OsmoticCircuit({ sim }: { sim: SugarSim }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const scratch = useMemo(() => new THREE.Vector3(), [])
  const hops = useMemo(
    () =>
      Array.from({ length: OSMO_POOL }, (_, i) => ({
        t: i / OSMO_POOL,
        // Half cross in at the top, half cross back at the bottom.
        top: i % 2 === 0,
        row: ((i * 7) % 5) / 5,
      })),
    [],
  )

  useFrame((_, rawDt) => {
    const mesh = meshRef.current
    if (!mesh) return
    const dt = Math.min(rawDt, 0.05)
    const solve = sim.solve
    const moving = sim.started && !sim.paused
    const drive = solve ? THREE.MathUtils.clamp(solve.pressureGradient / 1.4, 0, 1.2) : 0
    for (let i = 0; i < OSMO_POOL; i++) {
      const h = hops[i]
      if (moving) {
        h.t += dt * (0.18 + drive * 0.5)
        if (h.t > 1) h.t = 0
      }
      const y = h.top ? TOP - 0.35 - h.row * 0.5 : BOTTOM + 0.35 + h.row * 0.5
      // Top: xylem → phloem. Bottom: phloem → xylem.
      const x = h.top
        ? THREE.MathUtils.lerp(XYLEM_X + XYLEM_R, PHLOEM_X - PHLOEM_R, h.t)
        : THREE.MathUtils.lerp(PHLOEM_X - PHLOEM_R, XYLEM_X + XYLEM_R, h.t)
      scratch.set(x, y, 0.06)
      dummy.position.copy(scratch)
      dummy.rotation.set(0, 0, 0)
      const fade = Math.min(1, h.t * 5) * Math.min(1, (1 - h.t) * 5)
      dummy.scale.setScalar(0.042 * fade * (sim.girdled ? 0.35 : 1))
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, OSMO_POOL]} frustumCulled={false}>
      <sphereGeometry args={[1, 8, 6]} />
      <meshStandardMaterial
        color="#8FC8F0"
        roughness={0.15}
        metalness={0}
        transparent
        opacity={0.85}
        emissive="#3E90D0"
        emissiveIntensity={0.2}
      />
    </instancedMesh>
  )
}

/* ------------------------------------------------------------------ */
/* Labels                                                             */
/* ------------------------------------------------------------------ */

/**
 * Captions live in the world, not in an overlay — but they are pushed out in
 * front of the cortex on +Z so the stem wall never eats them, which is exactly
 * what happened to XYLEM and SOURCE END the first time round.
 */
const TAGS: Array<{ text: string; at: [number, number, number]; color: string; size: number }> = [
  { text: 'SOURCE END', at: [-1.42, TOP - 0.18, 1.15], color: ATLAS.muted, size: 0.15 },
  { text: 'XYLEM', at: [-1.42, 1.05, 1.15], color: ATLAS.waterDeep, size: 0.21 },
  { text: 'water up ↑', at: [-1.42, 0.79, 1.15], color: ATLAS.water, size: 0.15 },
  { text: 'PHLOEM', at: [1.5, 1.05, 1.15], color: ATLAS.sugarDeep, size: 0.21 },
  { text: 'sugar down ↓', at: [1.5, 0.79, 1.15], color: ATLAS.sugar, size: 0.15 },
  { text: 'companion cell', at: [1.62, -0.55, 1.1], color: ATLAS.greenDeep, size: 0.13 },
  { text: 'sieve plate', at: [PHLOEM_X - 0.82, TOP - 0.55, 1.1], color: '#B07C1E', size: 0.13 },
  { text: 'SINK END', at: [-1.42, BOTTOM + 0.18, 1.15], color: ATLAS.muted, size: 0.15 },
]

function Tags() {
  const refs = useRef<Array<THREE.InstancedMesh | null>>([])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const scratch = useMemo(() => new THREE.Vector3(), [])
  useFrame((state) => {
    TAGS.forEach((tag, i) => {
      const mesh = refs.current[i]
      if (!mesh) return
      scratch.set(...tag.at)
      writeGlyph(mesh, 0, dummy, state.camera, scratch, 1, 0.12)
      mesh.instanceMatrix.needsUpdate = true
    })
  })
  return (
    <group>
      {TAGS.map((tag, i) => (
        <GlyphInstances
          key={tag.text}
          ref={(el) => {
            refs.current[i] = el
          }}
          text={tag.text}
          color={tag.color}
          count={1}
          size={tag.size}
          style={{ strokeWidth: 8, strokeColor: 'rgba(252,250,244,0.97)' }}
        />
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ */

export default function StemStage({ sim }: { sim: SugarSim }) {
  const specimen = simSpecimen(sim)
  // Keep a reference to the specimen so a swap re-renders this stage's colour.
  useEffect(() => undefined, [specimen.id])
  return (
    <group position={[0, 2.02, 0]}>
      <Cortex />
      <Pipes sim={sim} />
      <Cut sim={sim} />
      <XylemFlow sim={sim} />
      <SapFlow sim={sim} />
      <OsmoticCircuit sim={sim} />
      <Tags />
    </group>
  )
}
