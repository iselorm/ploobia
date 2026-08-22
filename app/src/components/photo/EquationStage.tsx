import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { glyphTexture } from './Glyphs'
import { starburstTexture } from './Sprites'
import type { PhotoSim } from '@/lib/photo'
import { getBand } from '@/lib/bands'

/**
 * The photosynthesis equation, expanded in 3D inside the leaf.
 *
 *   6 CO₂ + 6 H₂O + light → C₆H₁₂O₆ + 6 O₂
 *
 * Playhead T runs 0..4 through four beats: ingredients · light splits water ·
 * carbon is fixed · the equation. Every atom's position is a pure function of
 * T, so scrubbing, replaying and skipping are free. Labels are glyph planes in
 * the world (never HTML overlays); the explanatory copy lives in the HUD card.
 */

export const STAGE_ORIGIN = new THREE.Vector3(0, 3.75, 0.4)
export const EQ_STEPS = 4
const STEP_SECONDS = 6

/* ---- palette ---- */
const C_COLOR = '#2B2F36'
const O_COLOR = '#D33B32'
const H_COLOR = '#F2F2F2'
const LABEL = '#1E3422'

/* ---- layout (stage-local) ---- */
const CO2_SLOTS: THREE.Vector3[] = []
const H2O_SLOTS: THREE.Vector3[] = []
for (let i = 0; i < 6; i++) {
  const row = i % 3
  const col = Math.floor(i / 3)
  CO2_SLOTS.push(new THREE.Vector3(-2.35 + col * 0.62, 0.55 - row * 0.5, 0))
  H2O_SLOTS.push(new THREE.Vector3(-1.05 + col * 0.42, 0.55 - row * 0.5, 0.05))
}
const FACTORY = new THREE.Vector3(0.05, 0.05, 0)
const RING_CENTER = new THREE.Vector3(1.35, 0.05, 0)
const RING_R = 0.34
const O2_SLOTS: THREE.Vector3[] = Array.from({ length: 6 }, (_, i) => new THREE.Vector3(2.25 + (i % 2) * 0.28, 0.62 - Math.floor(i / 2) * 0.55, 0))
const LIGHT_FROM = new THREE.Vector3(-1.4, 1.75, 0.3)

const ease = (u: number) => {
  const t = THREE.MathUtils.clamp(u, 0, 1)
  return t * t * (3 - 2 * t)
}
/** 0..1 progress of a sub-animation that starts at `start` (in T units) and lasts `dur`. */
const seg = (T: number, start: number, dur: number) => ease((T - start) / dur)

/* ------------------------------------------------------------------ */
/* Atom pools                                                         */
/* ------------------------------------------------------------------ */

interface AtomSpec {
  color: string
  radius: number
  /** Position and scale as a function of T. */
  at: (T: number, out: THREE.Vector3) => number
}

function buildAtoms(): AtomSpec[] {
  const atoms: AtomSpec[] = []
  const tmp = new THREE.Vector3()

  // ---- CO₂: C in the middle, two O either side. Enter the factory in step 2. ----
  for (let i = 0; i < 6; i++) {
    const slot = CO2_SLOTS[i]
    const start = 2 + i * 0.11
    const dur = 0.42
    const carbonRingSlot = new THREE.Vector3(
      RING_CENTER.x + Math.cos((i / 6) * Math.PI * 2 + Math.PI / 6) * RING_R,
      RING_CENTER.y + Math.sin((i / 6) * Math.PI * 2 + Math.PI / 6) * RING_R,
      RING_CENTER.z,
    )
    const oKnob = new THREE.Vector3(
      RING_CENTER.x + Math.cos((i / 6) * Math.PI * 2 + Math.PI / 6) * (RING_R + 0.24),
      RING_CENTER.y + Math.sin((i / 6) * Math.PI * 2 + Math.PI / 6) * (RING_R + 0.24),
      RING_CENTER.z + 0.05,
    )
    // carbon
    atoms.push({
      color: C_COLOR,
      radius: 0.125,
      at: (T, out) => {
        const p = seg(T, start, dur)
        const q = seg(T, start + dur + 0.08, 0.35)
        if (p < 1) {
          out.copy(slot).lerp(FACTORY, p)
          return 1 - p * 0.6
        }
        out.copy(FACTORY).lerp(carbonRingSlot, q)
        return 0.4 + q * 0.6
      },
    })
    // the two oxygens of this CO₂: one becomes the ring's O/OH knob, one is
    // recycled (fades in the factory)
    for (const side of [-1, 1]) {
      const off = new THREE.Vector3(side * 0.2, 0, 0)
      atoms.push({
        color: O_COLOR,
        radius: 0.105,
        at: (T, out) => {
          const p = seg(T, start, dur)
          const q = seg(T, start + dur + 0.08, 0.35)
          if (p < 1) {
            out.copy(slot).add(tmp.copy(off).multiplyScalar(1 - p * 0.7)).lerp(FACTORY, p)
            return 1 - p * 0.6
          }
          if (side === 1) {
            out.copy(FACTORY).lerp(oKnob, q)
            return 0.4 + q * 0.5
          }
          out.copy(FACTORY)
          return Math.max(0, 0.4 - q * 0.4)
        },
      })
    }
  }

  // ---- H₂O: O centre, two H at ~104°. Split by light in step 1. ----
  for (let i = 0; i < 6; i++) {
    const slot = H2O_SLOTS[i]
    const start = 1 + i * 0.12
    const dur = 0.5
    const o2Slot = O2_SLOTS[i]
    // oxygen → O₂ column
    atoms.push({
      color: O_COLOR,
      radius: 0.11,
      at: (T, out) => {
        const p = seg(T, start + 0.15, dur)
        out.copy(slot).lerp(o2Slot, p)
        return 1
      },
    })
    // two hydrogens → the factory (become energy carriers), fade
    for (const k of [0, 1]) {
      const ang = k === 0 ? Math.PI * 0.32 : Math.PI * 0.68
      const off = new THREE.Vector3(Math.cos(ang) * 0.17, -Math.sin(ang) * 0.17, 0.02)
      atoms.push({
        color: H_COLOR,
        radius: 0.06,
        at: (T, out) => {
          const p = seg(T, start + 0.15, dur)
          out.copy(slot).add(off).lerp(FACTORY, p)
          return 1 - p * 0.9
        },
      })
    }
  }

  // ---- Glucose hydrogens: appear on the ring as carbon settles (step 2). ----
  for (let i = 0; i < 12; i++) {
    const c = Math.floor(i / 2)
    const a = (c / 6) * Math.PI * 2 + Math.PI / 6
    const off = i % 2 === 0 ? -0.16 : 0.16
    const pos = new THREE.Vector3(
      RING_CENTER.x + Math.cos(a) * (RING_R + 0.02) + Math.cos(a + Math.PI / 2) * off * 0.6,
      RING_CENTER.y + Math.sin(a) * (RING_R + 0.02) + Math.sin(a + Math.PI / 2) * off * 0.6,
      RING_CENTER.z + (i % 2 === 0 ? 0.16 : -0.16),
    )
    const start = 2 + c * 0.11 + 0.5
    atoms.push({
      color: H_COLOR,
      radius: 0.055,
      at: (T, out) => {
        out.copy(pos)
        return seg(T, start, 0.3)
      },
    })
  }

  return atoms
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

function Label({ text, position, size = 0.26, color = LABEL }: { text: string; position: [number, number, number]; size?: number; color?: string }) {
  const { texture, aspect } = useMemo(() => glyphTexture(text, color), [text, color])
  const ref = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    if (ref.current) ref.current.quaternion.copy(state.camera.quaternion)
  })
  return (
    <mesh ref={ref} position={position}>
      <planeGeometry args={[size * aspect, size]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

const PHOTONS = 42

export default function EquationStage({ sim }: { sim: PhotoSim }) {
  const atoms = useMemo(buildAtoms, [])
  const sphere = useMemo(() => new THREE.SphereGeometry(1, 20, 14), [])
  const mats = useMemo(
    () => ({
      C: new THREE.MeshStandardMaterial({ color: C_COLOR, roughness: 0.35, metalness: 0.05 }),
      O: new THREE.MeshStandardMaterial({ color: O_COLOR, roughness: 0.3, emissive: '#5A0F0A', emissiveIntensity: 0.25 }),
      H: new THREE.MeshStandardMaterial({ color: H_COLOR, roughness: 0.4 }),
    }),
    [],
  )
  const meshRefs = useRef<Array<THREE.Mesh | null>>([])
  const tmp = useMemo(() => new THREE.Vector3(), [])
  const groupRef = useRef<THREE.Group>(null)
  const factoryRef = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.PointLight>(null)
  const photonRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const starTex = useMemo(() => starburstTexture(), [])
  const ringRef = useRef<THREE.Mesh>(null)
  const waterTarget = useMemo(() => new THREE.Vector3(-0.85, 0.05, 0.05), [])
  const band = getBand()

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    if (sim.equationPlaying && !sim.paused) {
      sim.equationT = Math.min(EQ_STEPS, sim.equationT + dt / STEP_SECONDS)
      if (sim.equationT >= EQ_STEPS) sim.equationPlaying = false
    }
    const T = sim.equationT
    // Whole stage eases in when it opens.
    const g = groupRef.current
    if (g) {
      const s = g.scale.x + (1 - g.scale.x) * (1 - Math.exp(-dt * 4))
      g.scale.setScalar(s)
    }
    for (let i = 0; i < atoms.length; i++) {
      const m = meshRefs.current[i]
      if (!m) continue
      const sc = atoms[i].at(T, tmp)
      m.position.copy(tmp)
      const r = atoms[i].radius * Math.max(0.0001, sc)
      m.scale.setScalar(r)
      m.visible = sc > 0.02
    }
    // Factory breathes harder while it works (steps 1–2).
    const working = THREE.MathUtils.clamp(T - 0.9, 0, 1) * THREE.MathUtils.clamp(3.2 - T, 0, 1)
    if (factoryRef.current) {
      const p = 1 + Math.sin(sim.time * 2.6) * 0.03 * (1 + working * 2)
      factoryRef.current.scale.set(0.62 * p, 0.42 * p, 0.5 * p)
      const mat = factoryRef.current.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = 0.25 + working * 0.9
    }
    if (glowRef.current) glowRef.current.intensity = 0.6 + working * 2.4
    // Ring outline fades in as carbon settles.
    if (ringRef.current) {
      const mat = ringRef.current.material as THREE.MeshBasicMaterial
      mat.opacity = seg(T, 2.6, 0.7) * 0.75
    }
    // Photons: stream toward the water in step 1, toward the factory in step 2, idle otherwise.
    const pm = photonRef.current
    if (pm) {
      const active = T >= 0.85 && T < 3.1
      const to = T < 2 ? waterTarget : FACTORY
      for (let i = 0; i < PHOTONS; i++) {
        const u = (sim.time * 0.28 + i / PHOTONS) % 1
        const fade = active ? Math.min(1, u * 5) * Math.min(1, (1 - u) * 6) : 0
        const spread = ((i * 7919) % 100) / 100 - 0.5
        dummy.position.copy(LIGHT_FROM).lerp(to, u)
        dummy.position.x += spread * 0.5 * (1 - u)
        dummy.position.y += Math.abs(spread) * 0.2 * (1 - u)
        dummy.quaternion.copy(state.camera.quaternion)
        dummy.scale.setScalar(0.16 * fade)
        dummy.updateMatrix()
        pm.setMatrixAt(i, dummy.matrix)
      }
      pm.instanceMatrix.needsUpdate = true
    }
  })

  const simple = band === 'explorer'
  const labels = simple
    ? { co2: 'carbon dioxide', h2o: 'water', light: 'light', sugar: 'sugar', o2: 'oxygen', factory: 'chloroplast' }
    : { co2: '6 CO₂', h2o: '6 H₂O', light: 'light energy', sugar: 'C₆H₁₂O₆', o2: '6 O₂', factory: 'chloroplast' }

  return (
    <group ref={groupRef} position={STAGE_ORIGIN} scale={0.01}>
      {/* Atoms */}
      {atoms.map((a, i) => (
        <mesh
          key={i}
          ref={(el) => {
            meshRefs.current[i] = el
          }}
          geometry={sphere}
          material={a.color === C_COLOR ? mats.C : a.color === O_COLOR ? mats.O : mats.H}
          castShadow={false}
        />
      ))}

      {/* The factory: a chloroplast with thylakoid stacks */}
      <mesh ref={factoryRef} position={FACTORY}>
        <sphereGeometry args={[1, 32, 24]} />
        <meshStandardMaterial color="#57A75B" transparent opacity={0.4} roughness={0.25} emissive="#2E7D32" emissiveIntensity={0.3} depthWrite={false} />
      </mesh>
      {[-0.22, 0.02, 0.24].map((x, i) => (
        <group key={i} position={[FACTORY.x + x, FACTORY.y + (i === 1 ? 0.06 : -0.02), FACTORY.z + (i === 1 ? -0.1 : 0.06)]}>
          {[0, 1, 2, 3].map((k) => (
            <mesh key={k} position={[0, k * 0.055 - 0.08, 0]}>
              <cylinderGeometry args={[0.1, 0.1, 0.03, 18]} />
              <meshStandardMaterial color="#2E7D32" emissive="#43A047" emissiveIntensity={0.8} roughness={0.4} />
            </mesh>
          ))}
        </group>
      ))}
      <pointLight ref={glowRef} position={[FACTORY.x, FACTORY.y + 0.2, FACTORY.z + 0.4]} color="#8CFFA0" intensity={0.8} distance={3.5} />

      {/* Glucose ring outline */}
      <mesh ref={ringRef} position={RING_CENTER} rotation={[0, 0, Math.PI / 6]}>
        <torusGeometry args={[RING_R, 0.018, 8, 6]} />
        <meshBasicMaterial color="#F0E2B0" transparent opacity={0} toneMapped={false} />
      </mesh>

      {/* Photons */}
      <instancedMesh ref={photonRef} args={[undefined, undefined, PHOTONS]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={starTex} transparent depthWrite={false} toneMapped={false} />
      </instancedMesh>

      {/* Arrow */}
      <group position={[0.68, 0.05, 0]}>
        <mesh rotation={[0, 0, -Math.PI / 2]}>
          <cylinderGeometry args={[0.02, 0.02, 0.32, 8]} />
          <meshBasicMaterial color="#FBF5EA" toneMapped={false} />
        </mesh>
        <mesh position={[0.2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.07, 0.14, 12]} />
          <meshBasicMaterial color="#FBF5EA" toneMapped={false} />
        </mesh>
      </group>
      <Label text="+" position={[-1.6, 0.05, 0]} size={0.24} color="#FBF5EA" />
      <Label text="+" position={[1.92, 0.05, 0]} size={0.24} color="#FBF5EA" />

      {/* Labels in the world */}
      <Label text={labels.co2} position={[-2.05, -1.0, 0]} />
      <Label text={labels.h2o} position={[-0.85, -1.0, 0]} />
      <Label text={labels.light} position={[LIGHT_FROM.x, LIGHT_FROM.y + 0.28, LIGHT_FROM.z]} color="#8A5A32" />
      <Label text={labels.factory} position={[FACTORY.x, FACTORY.y - 0.62, FACTORY.z + 0.2]} size={0.17} />
      <Label text={labels.sugar} position={[RING_CENTER.x, -1.0, 0]} />
      <Label text={labels.o2} position={[2.4, -1.0, 0]} />
    </group>
  )
}
