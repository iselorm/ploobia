import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { photoDrive, type PhotoSim } from '@/lib/photo'
import { LEAF_CENTER } from './GardenWorld'
import GlyphInstances, { hideGlyph, writeGlyph } from './Glyphs'

/**
 * The molecule traffic in and out of the leaf.
 *
 * Every species carries its own chemical label — the carbon atom says C, each
 * oxygen says O, the droplet says H₂O — so nothing depends on a floating
 * caption that could drift over something else on screen.
 */

/* ------------------------------------------------------------------ */
/* CO₂ molecules drifting from the air into the leaf                   */
/* ------------------------------------------------------------------ */

const CO2_COUNT = 18
/** Label one molecule in every N, so formulae stay readable rather than stacking. */
const LABEL_EVERY_CO2 = 3

function randomAirSpot(v: THREE.Vector3) {
  v.set(3.5 + Math.random() * 4.5, 2 + Math.random() * 4.5, -3 + Math.random() * 6)
}

export function Co2Molecules({ sim }: { sim: PhotoSim }) {
  const coresRef = useRef<THREE.InstancedMesh>(null)
  const satsRef = useRef<THREE.InstancedMesh>(null)
  const cLabelRef = useRef<THREE.InstancedMesh>(null)
  const oLabelRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const scratch = useMemo(() => new THREE.Vector3(), [])
  const seeds = useMemo(
    () =>
      Array.from({ length: CO2_COUNT }, () => ({
        pos: new THREE.Vector3(),
        spin: Math.random() * Math.PI * 2,
        wobble: Math.random() * Math.PI * 2,
      })),
    [],
  )
  const inited = useRef(false)

  useFrame((state, rawDt) => {
    const cores = coresRef.current
    const sats = satsRef.current
    const cLab = cLabelRef.current
    const oLab = oLabelRef.current
    if (!cores || !sats || !cLab || !oLab) return
    const camera = state.camera
    const dt = Math.min(rawDt, 0.05)
    if (!inited.current) {
      seeds.forEach((s) => randomAirSpot(s.pos))
      inited.current = true
    }
    const active = Math.max(3, Math.round(CO2_COUNT * (0.15 + sim.co2 * 0.85)))
    const moving = sim.started && !sim.paused
    const t = sim.time

    for (let i = 0; i < CO2_COUNT; i++) {
      const s = seeds[i]
      if (i < active) {
        if (moving) {
          // Drift toward the leaf; "breathe in" when close.
          const speed = 0.35 + sim.co2 * 0.85
          dummy.position.copy(LEAF_CENTER).sub(s.pos).normalize()
          s.pos.addScaledVector(dummy.position, dt * speed)
          s.pos.y += Math.sin(t * 1.6 + s.wobble) * dt * 0.35
          s.spin += dt * 1.5
          if (s.pos.distanceTo(LEAF_CENTER) < 0.7) randomAirSpot(s.pos)
        }
        const bob = Math.sin(t * 2 + s.wobble) * 0.06
        dummy.position.set(s.pos.x, s.pos.y + bob, s.pos.z)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.setScalar(0.19)
        dummy.updateMatrix()
        cores.setMatrixAt(i, dummy.matrix)

        // Only a sample of the molecules is labelled. Every one of them wearing
        // a formula turns the sky into a wall of text; a few is enough to
        // establish what the shapes mean.
        if (i % LABEL_EVERY_CO2 === 0) {
          scratch.set(s.pos.x, s.pos.y + bob, s.pos.z)
          writeGlyph(cLab, i, dummy, camera, scratch, 1, 0.3)
        } else {
          hideGlyph(cLab, i, dummy)
        }

        // Two smaller oxygen atoms flanking the carbon core.
        for (let k = 0; k < 2; k++) {
          const a = s.spin + (k === 0 ? 0 : Math.PI)
          scratch.set(
            s.pos.x + Math.cos(a) * 0.33,
            s.pos.y + bob + Math.sin(a * 1.3) * 0.06,
            s.pos.z + Math.sin(a) * 0.33,
          )
          dummy.position.copy(scratch)
          dummy.rotation.set(0, 0, 0)
          dummy.scale.setScalar(0.13)
          dummy.updateMatrix()
          sats.setMatrixAt(i * 2 + k, dummy.matrix)
          if (i % LABEL_EVERY_CO2 === 0) {
            writeGlyph(oLab, i * 2 + k, dummy, camera, scratch, 1, 0.22)
          } else {
            hideGlyph(oLab, i * 2 + k, dummy)
          }
        }
      } else {
        dummy.scale.setScalar(0)
        dummy.updateMatrix()
        cores.setMatrixAt(i, dummy.matrix)
        sats.setMatrixAt(i * 2, dummy.matrix)
        sats.setMatrixAt(i * 2 + 1, dummy.matrix)
        hideGlyph(cLab, i, dummy)
        hideGlyph(oLab, i * 2, dummy)
        hideGlyph(oLab, i * 2 + 1, dummy)
      }
    }
    cores.instanceMatrix.needsUpdate = true
    sats.instanceMatrix.needsUpdate = true
    cLab.instanceMatrix.needsUpdate = true
    oLab.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={coresRef} args={[undefined, undefined, CO2_COUNT]} frustumCulled={false}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color="#6C7480" roughness={0.4} />
      </instancedMesh>
      <instancedMesh ref={satsRef} args={[undefined, undefined, CO2_COUNT * 2]} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color="#E14B3C" roughness={0.4} />
      </instancedMesh>
      <GlyphInstances ref={cLabelRef} text="C" color="#2B3038" count={CO2_COUNT} size={0.2} />
      <GlyphInstances ref={oLabelRef} text="O" color="#7A1E14" count={CO2_COUNT * 2} size={0.16} />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Water droplets rising from the soil through the stem                */
/* ------------------------------------------------------------------ */

const H2O_COUNT = 10
const LABEL_EVERY_H2O = 3

export function WaterDroplets({ sim }: { sim: PhotoSim }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const labelRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const scratch = useMemo(() => new THREE.Vector3(), [])
  const seeds = useMemo(
    () =>
      // Evenly spaced along the stem rather than randomly placed, so droplets
      // (and their labels) never bunch up on top of one another.
      Array.from({ length: H2O_COUNT }, (_, i) => ({
        t: i / H2O_COUNT,
        wobble: (i * 2.399) % (Math.PI * 2),
      })),
    [],
  )

  useFrame((state, rawDt) => {
    const mesh = meshRef.current
    const label = labelRef.current
    if (!mesh || !label) return
    const camera = state.camera
    const dt = Math.min(rawDt, 0.05)
    const active = Math.max(2, Math.round(H2O_COUNT * (0.15 + sim.water * 0.85)))
    const moving = sim.started && !sim.paused
    for (let i = 0; i < H2O_COUNT; i++) {
      const s = seeds[i]
      if (i < active) {
        if (moving) {
          s.t += dt * (0.12 + sim.water * 0.3)
          if (s.t > 1) s.t = 0
        }
        // Path: from the soil at the stem base up to the leaf.
        const y = 0.05 + s.t * 2.5
        const swayX = Math.sin(s.t * 6 + s.wobble) * 0.09
        scratch.set(swayX, y, Math.cos(s.t * 5 + s.wobble) * 0.06)
        dummy.position.copy(scratch)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.setScalar(0.13 + Math.sin(s.t * Math.PI) * 0.03)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        if (i % LABEL_EVERY_H2O === 0) {
          // Alternate sides of the stem so consecutive labels cannot collide.
          scratch.x += (i / LABEL_EVERY_H2O) % 2 === 0 ? 0.44 : -0.44
          writeGlyph(label, i, dummy, camera, scratch, 1, 0.18)
        } else {
          hideGlyph(label, i, dummy)
        }
      } else {
        dummy.scale.setScalar(0)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        hideGlyph(label, i, dummy)
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    label.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={meshRef} args={[undefined, undefined, H2O_COUNT]} frustumCulled={false}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color="#3E90D0" roughness={0.2} transparent opacity={0.92} />
      </instancedMesh>
      <GlyphInstances ref={labelRef} text="H₂O" color="#12496F" count={H2O_COUNT} size={0.19} />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* O₂ bubbles floating out of the leaf                                 */
/* ------------------------------------------------------------------ */

const O2_POOL = 26
const LABEL_EVERY_O2 = 4

/**
 * Oxygen leaves as O₂ — a pair of bonded atoms, not a lone ball. Drawing it
 * diatomic and labelling both atoms is the same amount of work and stops a
 * learner picturing single oxygen atoms floating around.
 */
export function OxygenBubbles({ sim }: { sim: PhotoSim }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const labelRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const scratch = useMemo(() => new THREE.Vector3(), [])
  const bubbles = useMemo(
    () =>
      Array.from({ length: O2_POOL }, () => ({
        alive: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        spin: Math.random() * Math.PI * 2,
      })),
    [],
  )
  const spawnAcc = useRef(0)

  useFrame((state, rawDt) => {
    const mesh = meshRef.current
    const label = labelRef.current
    if (!mesh || !label) return
    const camera = state.camera
    const dt = Math.min(rawDt, 0.05)
    const rate = photoDrive(sim)
    const moving = sim.started && !sim.paused

    if (moving) {
      spawnAcc.current += dt * rate * 3.2
      sim.oxygen += dt * rate * 1.6
      while (spawnAcc.current >= 1) {
        spawnAcc.current -= 1
        const b = bubbles.find((bb) => !bb.alive)
        if (b) {
          b.alive = true
          b.life = 0
          b.pos.set(
            LEAF_CENTER.x + (Math.random() - 0.5) * 2.2,
            LEAF_CENTER.y + 0.12,
            LEAF_CENTER.z + (Math.random() - 0.5) * 1.4,
          )
          b.vel.set(-0.25 - Math.random() * 0.45, 0.55 + Math.random() * 0.5, (Math.random() - 0.5) * 0.4)
        }
      }
    }

    for (let i = 0; i < O2_POOL; i++) {
      const b = bubbles[i]
      if (b.alive) {
        if (moving) {
          b.life += dt
          b.pos.addScaledVector(b.vel, dt)
          b.pos.x += Math.sin(b.life * 3 + i) * dt * 0.25
          b.spin += dt * 0.8
          if (b.life > 5.5 || b.pos.y > 8.5) b.alive = false
        }
        const grow = Math.min(1, b.life * 3)
        const r = 0.15 * grow + 0.02
        // Two bonded atoms, offset either side of the bubble's centre.
        for (let k = 0; k < 2; k++) {
          const a = b.spin + (k === 0 ? 0 : Math.PI)
          scratch.set(
            b.pos.x + Math.cos(a) * r * 0.85,
            b.pos.y,
            b.pos.z + Math.sin(a) * r * 0.85,
          )
          dummy.position.copy(scratch)
          dummy.rotation.set(0, 0, 0)
          dummy.scale.setScalar(r)
          dummy.updateMatrix()
          mesh.setMatrixAt(i * 2 + k, dummy.matrix)
          if (i % LABEL_EVERY_O2 === 0) {
            writeGlyph(label, i * 2 + k, dummy, camera, scratch, grow, r + 0.12)
          } else {
            hideGlyph(label, i * 2 + k, dummy)
          }
        }
      } else {
        dummy.scale.setScalar(0)
        dummy.updateMatrix()
        mesh.setMatrixAt(i * 2, dummy.matrix)
        mesh.setMatrixAt(i * 2 + 1, dummy.matrix)
        hideGlyph(label, i * 2, dummy)
        hideGlyph(label, i * 2 + 1, dummy)
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    label.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={meshRef} args={[undefined, undefined, O2_POOL * 2]} frustumCulled={false}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color="#7EC8EE" roughness={0.15} transparent opacity={0.92} />
      </instancedMesh>
      <GlyphInstances ref={labelRef} text="O" color="#14567D" count={O2_POOL * 2} size={0.17} />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Glucose cubes accumulating on the leaf                              */
/* ------------------------------------------------------------------ */

const GLUCOSE_POOL = 30
/**
 * Glucose piles up in one small patch on the leaf, so every extra label lands
 * on top of the last one. A single labelled cube says everything the rest would.
 */
const LABELLED_GLUCOSE = 0

export function GlucoseCubes({ sim }: { sim: PhotoSim }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const labelRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const scratch = useMemo(() => new THREE.Vector3(), [])
  const cubes = useMemo(
    () =>
      Array.from({ length: GLUCOSE_POOL }, () => ({
        pos: new THREE.Vector3(),
        born: -1,
        spin: Math.random() * Math.PI * 2,
      })),
    [],
  )
  const spawnAcc = useRef(0)
  const nextSlot = useRef(0)

  useFrame((state, rawDt) => {
    const mesh = meshRef.current
    const label = labelRef.current
    if (!mesh || !label) return
    const camera = state.camera
    const dt = Math.min(rawDt, 0.05)
    const rate = photoDrive(sim)
    const moving = sim.started && !sim.paused

    if (moving) {
      spawnAcc.current += dt * rate * 1.4
      sim.glucose += dt * rate * 1.1
      while (spawnAcc.current >= 1) {
        spawnAcc.current -= 1
        const c = cubes[nextSlot.current % GLUCOSE_POOL]
        nextSlot.current += 1
        c.pos.set(
          LEAF_CENTER.x + (Math.random() - 0.5) * 2.1,
          LEAF_CENTER.y + 0.16,
          LEAF_CENTER.z + (Math.random() - 0.5) * 1.3,
        )
        c.born = sim.time
      }
    }

    for (let i = 0; i < GLUCOSE_POOL; i++) {
      const c = cubes[i]
      if (c.born >= 0) {
        const age = sim.time - c.born
        const grow = Math.min(1, age * 2.5)
        const pulse = 1 + Math.sin(sim.time * 2.2 + c.spin) * 0.12
        scratch.copy(c.pos)
        scratch.y += Math.sin(sim.time * 1.4 + c.spin) * 0.02
        dummy.position.copy(scratch)
        dummy.rotation.set(0.6, c.spin + sim.time * 0.4, 0.4)
        dummy.scale.setScalar(0.13 * grow * pulse)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        if (i === LABELLED_GLUCOSE) {
          scratch.y += 0.24
          writeGlyph(label, i, dummy, camera, scratch, grow, 0.2)
        } else {
          hideGlyph(label, i, dummy)
        }
      } else {
        dummy.scale.setScalar(0)
        dummy.rotation.set(0, 0, 0)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        hideGlyph(label, i, dummy)
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    label.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={meshRef} args={[undefined, undefined, GLUCOSE_POOL]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#F0B429" emissive="#B97D10" emissiveIntensity={0.45} roughness={0.3} />
      </instancedMesh>
      <GlyphInstances ref={labelRef} text="C₆H₁₂O₆" color="#8A5A0B" count={GLUCOSE_POOL} size={0.15} />
    </group>
  )
}
