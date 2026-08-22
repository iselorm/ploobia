import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import type { SimState } from '@/lib/sim'
import { VESSEL_RADIUS } from '@/lib/sim'
import { LAP_LENGTH, STAGE_ENDS, getJourney, radiusAtDist } from '@/lib/journey'
import type { CellType } from '@/lib/facts'
import GlyphInstances, { glyphTexture, hideGlyph, writeGlyph } from '@/components/photo/Glyphs'
import { getQualityCaps } from '@/lib/quality'

/**
 * Everything the learner sees THROUGH the vessel wall on the window
 * stretches, plus the ambient gas traffic that crosses it:
 *
 *  - lungs: breathing alveoli outside a thin wall; O₂ lanes streaming in,
 *    CO₂ lanes streaming out.
 *  - tissue: living body cells outside the capillary; O₂ lanes out, CO₂ in.
 *  - the featured body cell of the meet-the-cell story, with its membrane,
 *    nucleus and mitochondria labelled in-world (no floating overlays).
 */

const LUNGS_START = 0
const LUNGS_END = STAGE_ENDS[0]
const TISSUE_START = STAGE_ENDS[3]
const TISSUE_END = STAGE_ENDS[4]

const FIELD_HALF = 140

interface Props {
  sim: SimState
  onCellClick: (type: CellType, id: number) => void
}

/** Deterministic pseudo-random stream so layouts are stable across mounts. */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

/** For a lap-local z, world z of the copy nearest the camera (or null). */
function nearestWorldZ(localD: number, camZ: number): number | null {
  const camDist = -camZ
  const baseLap = Math.floor((camDist - localD) / LAP_LENGTH + 0.5)
  for (const lap of [baseLap, baseLap + 1, baseLap - 1]) {
    if (lap < 0) continue
    const z = -(lap * LAP_LENGTH + localD)
    if (Math.abs(z - camZ) < FIELD_HALF) return z
  }
  return null
}

// ---------------------------------------------------------------------------
// Alveoli — the breathing air sacs of the lungs
// ---------------------------------------------------------------------------

const ALVEOLI_N = 64

function Alveoli({ sim }: { sim: SimState }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const data = useMemo(() => {
    const rand = rng(1337)
    return Array.from({ length: ALVEOLI_N }, () => ({
      local: LUNGS_START + 4 + rand() * (LUNGS_END - LUNGS_START - 8),
      angle: rand() * Math.PI * 2,
      radius: VESSEL_RADIUS * 0.82 + 2.4 + rand() * 4.2,
      scale: 1.1 + rand() * 1.6,
      phase: rand() * Math.PI * 2,
    }))
  }, [])
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    // Whole-lung breathing at the demand dial's real rate: 14 breaths/min at
    // rest, 45 flat out — you can watch the lungs work harder.
    const breathHz = sim.breathsPerMin / 60
    const breath = 1 + Math.sin(sim.time * breathHz * Math.PI * 2) * 0.13
    for (let i = 0; i < ALVEOLI_N; i++) {
      const d = data[i]
      const z = nearestWorldZ(d.local, sim.camZ)
      if (z === null) {
        dummy.scale.setScalar(0)
      } else {
        dummy.position.set(Math.cos(d.angle) * d.radius, Math.sin(d.angle) * d.radius, z)
        dummy.scale.setScalar(d.scale * breath * (1 + Math.sin(d.phase + sim.time * 0.7) * 0.05))
      }
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, ALVEOLI_N]} frustumCulled={false}>
      <sphereGeometry args={[1, 18, 14]} />
      <meshLambertMaterial
        color="#F2BFC7"
        emissive="#B25667"
        emissiveIntensity={0.32}
        transparent
        opacity={0.88}
      />
    </instancedMesh>
  )
}

// ---------------------------------------------------------------------------
// Body cells — the tissue outside the capillary
// ---------------------------------------------------------------------------

const BODYCELL_N = 40

function BodyCells({ sim, onCellClick }: Props) {
  const bodyRef = useRef<THREE.InstancedMesh>(null)
  const nucRef = useRef<THREE.InstancedMesh>(null)
  const data = useMemo(() => {
    const rand = rng(4242)
    return Array.from({ length: BODYCELL_N }, () => ({
      local: TISSUE_START + 4 + rand() * (TISSUE_END - TISSUE_START - 8),
      angle: rand() * Math.PI * 2,
      radius: VESSEL_RADIUS * 0.34 + 2.6 + rand() * 3.6,
      scale: 1.3 + rand() * 0.9,
      squish: 0.78 + rand() * 0.2,
      spin: rand() * Math.PI * 2,
    }))
  }, [])
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame(() => {
    const body = bodyRef.current
    const nuc = nucRef.current
    if (!body || !nuc) return
    for (let i = 0; i < BODYCELL_N; i++) {
      const d = data[i]
      const z = nearestWorldZ(d.local, sim.camZ)
      if (z === null) {
        dummy.scale.setScalar(0)
        dummy.updateMatrix()
        body.setMatrixAt(i, dummy.matrix)
        nuc.setMatrixAt(i, dummy.matrix)
        continue
      }
      const x = Math.cos(d.angle) * d.radius
      const y = Math.sin(d.angle) * d.radius
      dummy.position.set(x, y, z)
      dummy.rotation.set(0, d.spin, d.angle)
      dummy.scale.set(d.scale, d.scale * d.squish, d.scale)
      dummy.updateMatrix()
      body.setMatrixAt(i, dummy.matrix)
      // nucleus tucked off-centre inside
      dummy.position.set(x * 1.02, y * 1.02, z + d.scale * 0.22)
      dummy.scale.setScalar(d.scale * 0.34)
      dummy.updateMatrix()
      nuc.setMatrixAt(i, dummy.matrix)
    }
    body.instanceMatrix.needsUpdate = true
    nuc.instanceMatrix.needsUpdate = true
  })

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 8) return
    if (e.instanceId === undefined) return
    e.stopPropagation()
    onCellClick('bodycell', e.instanceId)
  }

  return (
    <group>
      <instancedMesh
        ref={bodyRef}
        args={[undefined, undefined, BODYCELL_N]}
        frustumCulled={false}
        onClick={handleClick}
      >
        <sphereGeometry args={[1, 18, 14]} />
        <meshLambertMaterial
          color="#DCA98B"
          emissive="#7A4A32"
          emissiveIntensity={0.18}
          transparent
          opacity={0.95}
        />
      </instancedMesh>
      <instancedMesh ref={nucRef} args={[undefined, undefined, BODYCELL_N]} frustumCulled={false}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshLambertMaterial color="#7E4256" emissive="#3A1522" emissiveIntensity={0.3} />
      </instancedMesh>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Ambient gas traffic across the wall — orderly radial lanes
// ---------------------------------------------------------------------------

interface LaneSpec {
  /** lap-local z range of the zone */
  z0: number
  z1: number
  /** 1 = molecules move inward (into the blood), -1 = outward */
  dir: 1 | -1
}

function GasLanes({
  sim,
  spec,
  species,
  count,
  seed,
}: {
  sim: SimState
  spec: LaneSpec[]
  species: 'o2' | 'co2'
  count: number
  seed: number
}) {
  const atomRef = useRef<THREE.InstancedMesh>(null)
  const coreRef = useRef<THREE.InstancedMesh>(null)
  const labelRef = useRef<THREE.InstancedMesh>(null)
  const { camera } = useThree()

  const LABEL_EVERY = 4
  const labelCount = Math.ceil(count / LABEL_EVERY)

  const data = useMemo(() => {
    const rand = rng(seed)
    return Array.from({ length: count }, (_, i) => {
      const zone = spec[i % spec.length]
      return {
        zone,
        local: zone.z0 + 4 + rand() * (zone.z1 - zone.z0 - 8),
        angle: rand() * Math.PI * 2,
        phase: rand(),
        speed: 0.055 + rand() * 0.03,
      }
    })
  }, [count, seed, spec])
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame(() => {
    const atoms = species === 'o2' ? atomRef.current : coreRef.current
    const sats = species === 'co2' ? atomRef.current : null
    const label = labelRef.current
    if (!atoms || !label) return
    for (let i = 0; i < count; i++) {
      const d = data[i]
      const z = nearestWorldZ(d.local, sim.camZ)
      const li = Math.floor(i / LABEL_EVERY)
      if (z === null) {
        hideGlyph(atoms, species === 'o2' ? i * 2 : i, dummy)
        if (species === 'o2') hideGlyph(atoms, i * 2 + 1, dummy)
        if (sats) {
          hideGlyph(sats, i * 2, dummy)
          hideGlyph(sats, i * 2 + 1, dummy)
        }
        if (i % LABEL_EVERY === 0) hideGlyph(label, li, dummy)
        continue
      }
      const localR = radiusAtDist(-z, VESSEL_RADIUS)
      const rOuter = localR + 3.4
      const rInner = Math.max(0.7, localR * 0.35)
      const t = (d.phase + sim.time * d.speed) % 1
      const r = d.zone.dir === 1 ? rOuter - (rOuter - rInner) * t : rInner + (rOuter - rInner) * t
      const fade = Math.min(1, Math.min(t, 1 - t) * 6)
      const x = Math.cos(d.angle) * r
      const y = Math.sin(d.angle) * r
      const s = 0.5 * fade
      if (species === 'o2') {
        for (let a = 0; a < 2; a++) {
          const off = (a === 0 ? -1 : 1) * 0.11
          dummy.position.set(x + off, y + off * 0.4, z)
          dummy.quaternion.copy(camera.quaternion)
          dummy.scale.setScalar(s * 0.42)
          dummy.updateMatrix()
          atoms.setMatrixAt(i * 2 + a, dummy.matrix)
        }
      } else {
        dummy.position.set(x, y, z)
        dummy.quaternion.copy(camera.quaternion)
        dummy.scale.setScalar(s * 0.42)
        dummy.updateMatrix()
        atoms.setMatrixAt(i, dummy.matrix)
        if (sats) {
          for (let a = 0; a < 2; a++) {
            const off = (a === 0 ? -1 : 1) * 0.19
            dummy.position.set(x + off, y + off * 0.3, z)
            dummy.scale.setScalar(s * 0.3)
            dummy.updateMatrix()
            sats.setMatrixAt(i * 2 + a, dummy.matrix)
          }
        }
      }
      if (i % LABEL_EVERY === 0) {
        dummy.position.set(x, y, z)
        writeGlyph(label, li, dummy, camera, dummy.position, fade * 2.4, 0.5)
      }
    }
    atoms.instanceMatrix.needsUpdate = true
    if (sats) sats.instanceMatrix.needsUpdate = true
    label.instanceMatrix.needsUpdate = true
  })

  if (species === 'o2') {
    return (
      <group>
        <instancedMesh ref={atomRef} args={[undefined, undefined, count * 2]} frustumCulled={false}>
          <sphereGeometry args={[1, 12, 10]} />
          <meshStandardMaterial color="#7EC8EE" emissive="#5FB6E8" emissiveIntensity={0.75} roughness={0.15} transparent opacity={0.92} />
        </instancedMesh>
        <GlyphInstances ref={labelRef} text="O₂" color="#14567D" count={labelCount} size={0.2} />
      </group>
    )
  }
  return (
    <group>
      <instancedMesh ref={coreRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color="#6C7480" emissive="#4A5058" emissiveIntensity={0.6} roughness={0.4} />
      </instancedMesh>
      <instancedMesh ref={atomRef} args={[undefined, undefined, count * 2]} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color="#E14B3C" emissive="#B22A1C" emissiveIntensity={0.5} roughness={0.4} />
      </instancedMesh>
      <GlyphInstances ref={labelRef} text="CO₂" color="#7A1E14" count={labelCount} size={0.2} />
    </group>
  )
}

// ---------------------------------------------------------------------------
// Word tags — in-world labels for the featured cell (never DOM overlays)
// ---------------------------------------------------------------------------

function WordTag({
  text,
  color,
  anchor,
  lift,
  size,
  visibleRef,
}: {
  text: string
  color: string
  anchor: THREE.Vector3
  lift: number
  size: number
  visibleRef: { current: number }
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const { camera } = useThree()
  const { texture, aspect } = useMemo(() => glyphTexture(text, color), [text, color])
  const toCam = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const v = visibleRef.current
    if (v <= 0.01) {
      mesh.scale.setScalar(0)
      return
    }
    mesh.position.copy(anchor)
    toCam.copy(camera.position).sub(anchor)
    const len = toCam.length()
    if (len > 1e-4) mesh.position.addScaledVector(toCam, lift / len)
    mesh.quaternion.copy(camera.quaternion)
    mesh.scale.setScalar(v)
  })

  return (
    <mesh ref={meshRef} renderOrder={2}>
      <planeGeometry args={[size * aspect, size]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} alphaTest={0.02} />
    </mesh>
  )
}

/** A static glyph plane for use inside a group that is already billboarded. */
function GlyphSprite({ text, color, size, y }: { text: string; color: string; size: number; y: number }) {
  const { texture, aspect } = useMemo(() => glyphTexture(text, color), [text, color])
  return (
    <mesh position={[0, y, 0]} renderOrder={2}>
      <planeGeometry args={[size * aspect, size]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} alphaTest={0.02} />
    </mesh>
  )
}

// ---------------------------------------------------------------------------
// The featured body cell — membrane, nucleus, mitochondria, and the handover
// ---------------------------------------------------------------------------

function FocusCell({ sim }: { sim: SimState }) {
  const groupRef = useRef<THREE.Group>(null)
  const mitoMats = useMemo(
    () =>
      Array.from(
        { length: 3 },
        () =>
          new THREE.MeshLambertMaterial({
            color: new THREE.Color('#C96A3E'),
            emissive: new THREE.Color('#E8722C'),
            emissiveIntensity: 0.15,
          }),
      ),
    [],
  )
  const o2Ref = useRef<THREE.Group>(null)
  const co2Ref = useRef<THREE.Group>(null)
  const { camera } = useThree()

  const j = getJourney()
  const focus = j.cellFocus

  // Organelle anchors in world space (the focus cell never moves).
  const anchors = useMemo(() => {
    const mito = [
      new THREE.Vector3(focus.x + 0.95, focus.y + 0.55, focus.z + 0.5),
      new THREE.Vector3(focus.x - 0.8, focus.y - 0.5, focus.z + 0.9),
      new THREE.Vector3(focus.x + 0.25, focus.y - 0.95, focus.z - 0.85),
    ]
    return {
      cell: new THREE.Vector3(focus.x, focus.y + 2.9, focus.z),
      membrane: new THREE.Vector3(focus.x - 2.15, focus.y - 0.85, focus.z + 0.7),
      nucleus: new THREE.Vector3(focus.x - 0.55, focus.y + 0.4, focus.z - 0.4),
      mito,
      // O₂ handover path: from inside the vessel, through the wall, to a
      // mitochondrion. CO₂ comes back along a slightly different line.
      pathStart: new THREE.Vector3(
        Math.cos(Math.atan2(focus.y, focus.x)) * 1.4,
        Math.sin(Math.atan2(focus.y, focus.x)) * 1.4,
        focus.z + 2.5,
      ),
      pathMid: new THREE.Vector3(focus.x * 0.72, focus.y * 0.72, focus.z + 1.1),
    }
  }, [focus])

  const labelVis = useRef(0)
  const scratchA = useMemo(() => new THREE.Vector3(), [])
  const scratchB = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const near = Math.abs(focus.z - sim.camZ) < 60
    // labels breathe in while the story runs (or any time you drift close by
    // after the story is done), and out again as you leave
    const want = near && (j.beatActive || j.beatDone) ? 1 : 0
    labelVis.current += (want - labelVis.current) * Math.min(1, dt * 2.5)

    // mitochondria glow as the oxygen arrives
    const glow = 0.15 + j.handoff * 1.3 * (0.8 + Math.sin(sim.time * 5) * 0.2)
    for (const m of mitoMats) m.emissiveIntensity = j.handoff > 0.55 ? glow : 0.15

    // O₂ travelling from the blood into the cell (first half of handoff)…
    const o2 = o2Ref.current
    if (o2) {
      const t = Math.min(1, j.handoff / 0.55)
      if (j.beatActive && t > 0 && t < 1) {
        // two-segment lerp: vessel → membrane → mitochondrion
        if (t < 0.5) scratchA.copy(anchors.pathStart).lerp(anchors.pathMid, t * 2)
        else scratchA.copy(anchors.pathMid).lerp(anchors.mito[0], (t - 0.5) * 2)
        o2.position.copy(scratchA)
        o2.quaternion.copy(camera.quaternion)
        o2.scale.setScalar(1)
      } else {
        o2.scale.setScalar(0)
      }
    }
    // …and CO₂ leaving the cell for the blood (second half)
    const co2 = co2Ref.current
    if (co2) {
      const t = Math.max(0, (j.handoff - 0.6) / 0.4)
      if (j.beatActive && t > 0 && t < 1) {
        if (t < 0.5) scratchB.copy(anchors.mito[1]).lerp(anchors.pathMid, t * 2)
        else scratchB.copy(anchors.pathMid).lerp(anchors.pathStart, (t - 0.5) * 2)
        co2.position.copy(scratchB)
        co2.quaternion.copy(camera.quaternion)
        co2.scale.setScalar(1)
      } else {
        co2.scale.setScalar(0)
      }
    }
  })

  return (
    <group ref={groupRef}>
      {/* membrane — the cell's soft translucent skin */}
      <mesh position={[focus.x, focus.y, focus.z]} scale={[2.5, 2.15, 2.35]}>
        <sphereGeometry args={[1, 28, 22]} />
        <meshLambertMaterial
          color="#E8B990"
          emissive="#8A5638"
          emissiveIntensity={0.22}
          transparent
          opacity={0.5}
          depthWrite={false}
        />
      </mesh>
      {/* cytoplasm haze */}
      <mesh position={[focus.x, focus.y, focus.z]} scale={[2.2, 1.9, 2.05]}>
        <sphereGeometry args={[1, 20, 16]} />
        <meshBasicMaterial color="#F6D2A8" transparent opacity={0.1} depthWrite={false} />
      </mesh>
      {/* nucleus */}
      <mesh position={[anchors.nucleus.x, anchors.nucleus.y, anchors.nucleus.z]} scale={1.0}>
        <sphereGeometry args={[1, 20, 16]} />
        <meshLambertMaterial color="#7E4256" emissive="#40182A" emissiveIntensity={0.35} />
      </mesh>
      {/* mitochondria */}
      {anchors.mito.map((p, i) => (
        <mesh
          key={i}
          position={[p.x, p.y, p.z]}
          rotation={[0.4 * i, 0.9 + i, 0.3]}
          material={mitoMats[i]}
        >
          <capsuleGeometry args={[0.26, 0.62, 6, 12]} />
        </mesh>
      ))}
      {/* the travelling molecules of the handover */}
      <group ref={o2Ref} scale={0}>
        <mesh position={[-0.13, 0, 0]}>
          <sphereGeometry args={[0.16, 12, 10]} />
          <meshStandardMaterial color="#7EC8EE" emissive="#5FB6E8" emissiveIntensity={0.75} roughness={0.15} />
        </mesh>
        <mesh position={[0.13, 0, 0]}>
          <sphereGeometry args={[0.16, 12, 10]} />
          <meshStandardMaterial color="#7EC8EE" emissive="#5FB6E8" emissiveIntensity={0.75} roughness={0.15} />
        </mesh>
        <GlyphSprite text="O₂" color="#14567D" size={0.26} y={0.36} />
      </group>
      <group ref={co2Ref} scale={0}>
        <mesh>
          <sphereGeometry args={[0.15, 12, 10]} />
          <meshStandardMaterial color="#6C7480" emissive="#4A5058" emissiveIntensity={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[-0.22, 0, 0]}>
          <sphereGeometry args={[0.11, 10, 8]} />
          <meshStandardMaterial color="#E14B3C" emissive="#B22A1C" emissiveIntensity={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[0.22, 0, 0]}>
          <sphereGeometry args={[0.11, 10, 8]} />
          <meshStandardMaterial color="#E14B3C" emissive="#B22A1C" emissiveIntensity={0.5} roughness={0.4} />
        </mesh>
        <GlyphSprite text="CO₂" color="#7A1E14" size={0.24} y={0.34} />
      </group>
      {/* in-world organelle labels, depth-aware, lifted toward the camera */}
      <WordTag text="Body cell" color="#4A2A18" anchor={anchors.cell} lift={0.5} size={0.62} visibleRef={labelVis} />
      <WordTag text="Cell membrane" color="#6B3A20" anchor={anchors.membrane} lift={0.45} size={0.4} visibleRef={labelVis} />
      <WordTag text="Nucleus" color="#40182A" anchor={anchors.nucleus} lift={1.0} size={0.42} visibleRef={labelVis} />
      <WordTag text="Mitochondrion" color="#7A3A12" anchor={anchors.mito[0]} lift={0.95} size={0.38} visibleRef={labelVis} />
    </group>
  )
}

// ---------------------------------------------------------------------------

export default function JourneyWorld({ sim, onCellClick }: Props) {
  const particleScale = getQualityCaps().particleScale
  const o2Count = Math.max(10, Math.round(26 * particleScale))
  const co2Count = Math.max(8, Math.round(18 * particleScale))

  const gasZones = useMemo(
    () => ({
      o2: [
        { z0: LUNGS_START, z1: LUNGS_END, dir: 1 as const }, // breathed in
        { z0: TISSUE_START, z1: TISSUE_END, dir: -1 as const }, // delivered out
      ],
      co2: [
        { z0: LUNGS_START, z1: LUNGS_END, dir: -1 as const }, // breathed out
        { z0: TISSUE_START, z1: TISSUE_END, dir: 1 as const }, // collected in
      ],
    }),
    [],
  )

  return (
    <group>
      <Alveoli sim={sim} />
      <BodyCells sim={sim} onCellClick={onCellClick} />
      <GasLanes sim={sim} spec={gasZones.o2} species="o2" count={o2Count} seed={777} />
      <GasLanes sim={sim} spec={gasZones.co2} species="co2" count={co2Count} seed={999} />
      <FocusCell sim={sim} />
    </group>
  )
}
