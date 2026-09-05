import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import GlyphInstances, { hideGlyph, writeGlyph } from '@/components/world/Glyphs'
import { getQualityCaps } from '@/lib/quality'
import { poreOpening, stomatalGates } from '@/lib/ratelab'
import { simEnv, simSpecimen, type SugarSim } from '@/lib/sugarsim'
import { ATLAS, glowSprite, leafSkinTexture } from './atlas'

/**
 * The Hatches — one stoma, from underneath, the size of the screen.
 *
 * Stage 2 of the campaign. Everything here follows one number, `pore`: how
 * far the two guard cells have swelled apart, 0–1, which is the plant's own
 * reflexes under the learner's ceiling (`poreOpening` in `ratelab.ts`). The
 * gap between the cells *is* that number; so is the rate the CO₂ drifts in
 * and the rate the water streams out. One solve drives the picture and the
 * meters, so the pore the learner sees and the sugar the HUD counts cannot
 * disagree.
 *
 * Three things the picture has to say, and does without a caption:
 *
 * 1. **Carbon comes in this way and water goes out the same way.** CO₂
 *    labels drift toward the pore and through it; water droplets stream out
 *    of it and rise. Both stop when it shuts.
 * 2. **The plant closes it itself.** The guard cells slacken as turgor goes,
 *    and a limp leaf's hatch is shut whatever the slider says. When the leaf
 *    wilts the whole field yellows and sags.
 * 3. **Light never touches it.** The glow behind the skin brightens with the
 *    sun and is the same whether the pore is open or shut — the one fact this
 *    stage exists to settle.
 *
 * Cheap on purpose: two capsules, one plane, two instanced sheets, two label
 * sheets. A stoma at 20 µm is a diagram, not a photograph, and a photograph
 * would hide the one thing that matters — the gap.
 */

/** The pore's width when fully open, world units. The guard cells are 0.34 wide. */
const MAX_GAP = 0.62
const GUARD_R = 0.34
const GUARD_H = 1.5
/** Where the stoma sits — the leaf stage's eye level, so the camera rig needs no special case. */
const STOMA_Y = 1.3
const CO2_COUNT = 14
const WATER_COUNT = 26
const CHLOROPLASTS = 7

/** How limp the field looks below full turgor. */
function slack(turgor: number): number {
  return THREE.MathUtils.clamp(1 - turgor, 0, 1)
}

/* ------------------------------------------------------------------ */
/* The skin                                                            */
/* ------------------------------------------------------------------ */

function Skin({ sim }: { sim: SugarSim }) {
  const texture = useMemo(() => leafSkinTexture(), [])
  const matRef = useRef<THREE.MeshStandardMaterial>(null)
  const glowRef = useRef<THREE.Mesh>(null)
  const sprite = useMemo(() => glowSprite('rgba(255,244,196,0.95)', 'rgba(255,236,170,0.35)', 'skin-sun'), [])
  const firm = useMemo(() => new THREE.Color('#FFFFFF'), [])
  const limp = useMemo(() => new THREE.Color('#D9D3A8'), [])

  useFrame(() => {
    const m = matRef.current
    if (m) m.color.copy(firm).lerp(limp, slack(sim.turgor) * 0.8)
    const g = glowRef.current
    if (g) {
      // Light lands on the top skin and comes through — brighter with the sun,
      // and, deliberately, not a function of the pore at all.
      const light = sim.night ? 0 : sim.light
      const mat = g.material as THREE.MeshBasicMaterial
      mat.opacity = 0.15 + 0.7 * THREE.MathUtils.clamp(light, 0, 1)
    }
  })

  return (
    <group name="leaf-skin">
      <mesh position={[0, STOMA_Y, -0.36]} receiveShadow>
        <planeGeometry args={[14, 10]} />
        <meshStandardMaterial ref={matRef} map={texture} roughness={0.85} metalness={0} />
      </mesh>
      {/* The sun, through the leaf. */}
      <mesh ref={glowRef} name="skin-sun" position={[0.2, STOMA_Y + 0.6, -0.34]}>
        <planeGeometry args={[9, 9]} />
        <meshBasicMaterial map={sprite} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* The stoma                                                           */
/* ------------------------------------------------------------------ */

function Stoma({ sim }: { sim: SugarSim }) {
  const left = useRef<THREE.Group>(null)
  const right = useRef<THREE.Group>(null)
  const pore = useRef<THREE.Mesh>(null)
  const chl = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const firm = useMemo(() => new THREE.Color('#5E9D53'), [])
  const limp = useMemo(() => new THREE.Color('#8FA36A'), [])
  const matL = useRef<THREE.MeshStandardMaterial>(null)
  const matR = useRef<THREE.MeshStandardMaterial>(null)

  // Chloroplasts scattered in the two guard cells — the epidermis has none,
  // the guard cells do, which is why they can swell on light.
  const chlPositions = useMemo(() => {
    const out: [number, number][] = []
    let seed = 7
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
    for (let i = 0; i < CHLOROPLASTS * 2; i++) out.push([(rnd() - 0.5) * 0.28, (rnd() - 0.5) * 1.1])
    return out
  }, [])

  useFrame((state) => {
    const specimen = simSpecimen(sim)
    const env = simEnv(sim)
    const opening = poreOpening(specimen.leaf, env)
    const s = slack(sim.turgor)
    const gap = MAX_GAP * opening
    const t = state.clock.elapsedTime

    // The guard cells: apart by the gap, bowing outward as they swell, and
    // sagging as the leaf goes limp.
    const bow = 0.08 + 0.32 * opening
    const sag = 1 - 0.18 * s
    const lean = 0.12 * s
    if (left.current) {
      left.current.position.set(-(gap / 2 + GUARD_R * 0.96), STOMA_Y, 0)
      left.current.scale.set(1 + bow * 0.5, sag, 1)
      left.current.rotation.z = 0.06 + bow * 0.5 + lean
    }
    if (right.current) {
      right.current.position.set(gap / 2 + GUARD_R * 0.96, STOMA_Y, 0)
      right.current.scale.set(1 + bow * 0.5, sag, 1)
      right.current.rotation.z = -(0.06 + bow * 0.5) - lean
    }
    if (pore.current) {
      pore.current.scale.set(Math.max(0.02, gap), sag * (0.86 + 0.1 * opening), 1)
      pore.current.position.set(0, STOMA_Y, -0.05)
    }
    if (matL.current) matL.current.color.copy(firm).lerp(limp, s * 0.9)
    if (matR.current) matR.current.color.copy(firm).lerp(limp, s * 0.9)

    const mesh = chl.current
    if (mesh) {
      chlPositions.forEach(([x, y], i) => {
        const side = i < CHLOROPLASTS ? -1 : 1
        const g = side < 0 ? left.current : right.current
        if (!g) return
        dummy.position.set(g.position.x + x * (1 + bow * 0.5), STOMA_Y + y * sag, 0.24 + Math.sin(t * 1.3 + i) * 0.02)
        dummy.scale.setScalar(0.055)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      })
      mesh.instanceMatrix.needsUpdate = true
    }
  })

  const capsule = useMemo(() => new THREE.CapsuleGeometry(GUARD_R, GUARD_H - 2 * GUARD_R, 6, 18), [])

  return (
    <group name="stoma">
      <group ref={left} name="guard-left">
        <mesh geometry={capsule} castShadow>
          <meshStandardMaterial ref={matL} color="#5E9D53" roughness={0.55} metalness={0} transparent opacity={0.94} />
        </mesh>
      </group>
      <group ref={right} name="guard-right">
        <mesh geometry={capsule} castShadow>
          <meshStandardMaterial ref={matR} color="#5E9D53" roughness={0.55} metalness={0} transparent opacity={0.94} />
        </mesh>
      </group>
      {/* The pore: the dark of the leaf's inside, seen through the gap. */}
      <mesh ref={pore} name="pore">
        <planeGeometry args={[1, GUARD_H * 0.95]} />
        <meshBasicMaterial color="#22301C" toneMapped={false} />
      </mesh>
      <instancedMesh ref={chl} args={[undefined, undefined, CHLOROPLASTS * 2]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color={ATLAS.greenDeep} roughness={0.6} metalness={0} />
      </instancedMesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* What passes through                                                 */
/* ------------------------------------------------------------------ */

interface Mote {
  t: number
  x: number
  y: number
  speed: number
  /** Whether this one has been let through. Set at the moment it reaches the pore. */
  through: boolean
}

/**
 * CO₂ drifting in toward the pore from the air in front, and water rising
 * out of it. Both sheets follow `pore`: with the hatch shut, carbon hangs in
 * front of it and water stops, which is the picture of "closed".
 */
function Traffic({ sim }: { sim: SugarSim }) {
  const co2Ref = useRef<THREE.InstancedMesh>(null)
  const co2Label = useRef<THREE.InstancedMesh>(null)
  const waterRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const pos = useMemo(() => new THREE.Vector3(), [])
  const quality = getQualityCaps()
  const labels = quality.particleScale > 0.5

  const co2 = useMemo<Mote[]>(() => {
    let seed = 99
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
    return Array.from({ length: CO2_COUNT }, () => ({
      t: rnd(),
      x: (rnd() - 0.5) * 3.2,
      y: (rnd() - 0.5) * 2.4,
      speed: 0.09 + rnd() * 0.07,
      through: false,
    }))
  }, [])
  const water = useMemo<Mote[]>(() => {
    let seed = 1234
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
    return Array.from({ length: WATER_COUNT }, () => ({
      t: rnd(),
      x: (rnd() - 0.5) * 0.4,
      y: (rnd() - 0.5) * 1.1,
      speed: 0.18 + rnd() * 0.16,
      through: true,
    }))
  }, [])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const specimen = simSpecimen(sim)
    const env = simEnv(sim)
    const opening = poreOpening(specimen.leaf, env)
    const cam = state.camera

    /* -- carbon: from the air in front, in through the pore -- */
    const inMesh = co2Ref.current
    const inText = co2Label.current
    if (inMesh) {
      // More carbon moves when the pore is open; none gets through when shut.
      const flow = 0.25 + 0.75 * opening
      co2.forEach((m, i) => {
        m.t += dt * m.speed * flow
        if (m.t >= 1) {
          m.t -= 1
          m.through = false
        }
        // Path: far out front (t=0) → the pore (t=0.62) → inside (t=1).
        let x: number, y: number, z: number
        if (m.t < 0.62) {
          const k = m.t / 0.62
          const e = k * k * (3 - 2 * k)
          x = THREE.MathUtils.lerp(m.x, 0, e)
          y = THREE.MathUtils.lerp(STOMA_Y + m.y, STOMA_Y + m.y * 0.35, e)
          z = THREE.MathUtils.lerp(3.2, 0.12, e)
        } else {
          // Only a mote that finds the pore open goes in; the rest wait at the door.
          if (!m.through) m.through = opening > 0.08 && Math.abs(m.y) * 0.35 < (MAX_GAP * opening) / 2 + 0.55
          const k = (m.t - 0.62) / 0.38
          if (m.through) {
            x = 0
            y = STOMA_Y + m.y * 0.35
            z = THREE.MathUtils.lerp(0.12, -0.3, k)
          } else {
            // Hovering at the closed door, drifting a little.
            x = Math.sin(state.clock.elapsedTime * 0.8 + i) * 0.12
            y = STOMA_Y + m.y * 0.35 + Math.cos(state.clock.elapsedTime * 0.6 + i) * 0.06
            z = 0.16 + Math.sin(state.clock.elapsedTime * 0.5 + i) * 0.05
            // A mote turned away goes back for another try.
            if (k > 0.5) m.t = 0
          }
        }
        const fade = m.through && m.t > 0.62 ? 1 - (m.t - 0.62) / 0.38 : Math.min(1, m.t * 6)
        pos.set(x, y, z)
        dummy.position.copy(pos)
        dummy.scale.setScalar(0.085 * Math.max(0, fade))
        dummy.updateMatrix()
        inMesh.setMatrixAt(i, dummy.matrix)
        if (inText) {
          if (fade > 0.2) writeGlyph(inText, i, dummy, cam, pos, 1, 0.14)
          else hideGlyph(inText, i, dummy)
        }
      })
      inMesh.instanceMatrix.needsUpdate = true
      if (inText) inText.instanceMatrix.needsUpdate = true
    }

    /* -- water: out of the pore, up and away -- */
    const outMesh = waterRef.current
    if (outMesh) {
      const transp = sim.solve?.leaf.transpiration ?? 0
      // Rate follows the model's own transpiration; a shut pore streams nothing.
      const flow = THREE.MathUtils.clamp(transp / 1.6, 0, 1) * (opening > 0.05 ? 1 : 0)
      const visible = Math.round(WATER_COUNT * flow)
      water.forEach((m, i) => {
        if (i >= visible) {
          dummy.scale.setScalar(0)
          dummy.updateMatrix()
          outMesh.setMatrixAt(i, dummy.matrix)
          return
        }
        m.t += dt * m.speed
        if (m.t >= 1) m.t -= 1
        const k = m.t
        const x = m.x * (MAX_GAP * opening) + Math.sin(k * 6 + i) * 0.05 * k
        const y = STOMA_Y + m.y * 0.4 + k * 1.6
        const z = 0.2 + k * 2.4
        dummy.position.set(x, y, z)
        dummy.scale.setScalar(0.05 * (1 - k * 0.6))
        dummy.updateMatrix()
        outMesh.setMatrixAt(i, dummy.matrix)
      })
      outMesh.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <group name="hatch-traffic">
      <instancedMesh ref={co2Ref} name="hatch-co2" args={[undefined, undefined, CO2_COUNT]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color={ATLAS.co2} roughness={0.5} metalness={0} transparent opacity={0.8} />
      </instancedMesh>
      {labels && (
        <GlyphInstances
          ref={co2Label}
          text="CO₂"
          name="hatch-label-co2"
          color={ATLAS.ink}
          count={CO2_COUNT}
          size={0.16}
          style={{ strokeWidth: 7, strokeColor: 'rgba(252,250,244,0.95)' }}
          renderOrder={3}
        />
      )}
      <instancedMesh ref={waterRef} name="hatch-water" args={[undefined, undefined, WATER_COUNT]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial
          color={ATLAS.water}
          roughness={0.15}
          metalness={0}
          transparent
          opacity={0.85}
          emissive={ATLAS.water}
          emissiveIntensity={0.25}
        />
      </instancedMesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */

/**
 * The plant's reflex, for the suite: how far the plant itself would open the
 * hatch right now and how far it actually is under the ceiling. Written on
 * the window so the day suite can assert "the slider says 80, the leaf is
 * holding at 45" without reading pixels.
 */
function Probe({ sim }: { sim: SugarSim }) {
  useFrame(() => {
    const specimen = simSpecimen(sim)
    const env = simEnv(sim)
    const w = window as unknown as Record<string, unknown>
    w.__hatch = {
      pore: poreOpening(specimen.leaf, env),
      plant: stomatalGates(specimen.leaf, env).plant,
      ceiling: sim.hatch,
      turgor: sim.turgor,
    }
  })
  return null
}

export default function HatchStage({ sim }: { sim: SugarSim }) {
  return (
    <group name="hatch-stage">
      <Skin sim={sim} />
      <Stoma sim={sim} />
      <Traffic sim={sim} />
      <Probe sim={sim} />
    </group>
  )
}
