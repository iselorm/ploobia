import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Edges, OrbitControls } from '@react-three/drei'
import {
  canCross,
  diffusionFactor,
  freeWaterFraction,
  MEMBRANE_BY_ID,
  MEMBRANE_DEMOS,
  SPECIES,
  SPECIES_ORDER,
  type MembraneDemoId,
  type SpeciesId,
} from '@/lib/membrane'
import type { PhotoSim } from '@/lib/photo'
import GlyphInstances, { hideGlyph, writeGlyph } from './Glyphs'
import { glowTexture } from './Sprites'

/**
 * The membrane bench.
 *
 * Three things the old version was missing, all of which are the actual lesson:
 *
 *  1. **The membrane has visible pores of a chosen size**, and a particle
 *     crosses only if it fits. Swap in cling film and nothing moves.
 *  2. **Net movement is drawn as an arrow** that shrinks to nothing at
 *     equilibrium — because "the particles still move but there is no net
 *     movement" is the single hardest idea here, and it has to be seen.
 *  3. **Crossings flash**, so the moment a molecule squeezes through a pore is
 *     something you can actually catch.
 */

const HALF_X = 4
const HALF_Y = 2
const HALF_Z = 1.5

const COUNTS: Record<SpeciesId, number> = {
  water: 80,
  glucose: 34,
  starch: 16,
}
const TOTAL = COUNTS.water + COUNTS.glucose + COUNTS.starch
const RADIUS: Record<SpeciesId, number> = {
  water: 0.085,
  glucose: 0.13,
  starch: 0.2,
}

interface Particle {
  species: SpeciesId
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  /** Counts down after a crossing so the particle can flash. */
  flash: number
}

/**
 * Brownian motion done properly: a particle travels in a straight line until
 * something knocks it off course, then sets off in a new random direction.
 *
 * The first version re-randomised the position every frame instead, which is
 * mathematically a random walk but visually just vibration — and it spread so
 * slowly that diffusion took several minutes to show anything at all.
 */
function scatter(p: Particle, speed: number) {
  // Random direction on a sphere.
  const theta = Math.random() * Math.PI * 2
  const z = Math.random() * 2 - 1
  const r = Math.sqrt(1 - z * z)
  p.vx = Math.cos(theta) * r * speed
  p.vy = Math.sin(theta) * r * speed * 0.75
  p.vz = z * speed * 0.6
}

/* ------------------------------------------------------------------ */
/* The membrane, drawn with real holes                                 */
/* ------------------------------------------------------------------ */

function Membrane({ sim }: { sim: PhotoSim }) {
  const poreRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const grid = useMemo(() => {
    const pts: Array<[number, number]> = []
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 6; c++) {
        pts.push([-HALF_Y + 0.42 + r * 0.45, -HALF_Z + 0.36 + c * 0.46])
      }
    }
    return pts
  }, [])

  useFrame(() => {
    const mesh = poreRef.current
    if (!mesh) return
    const membrane = MEMBRANE_BY_ID[sim.membraneId] ?? MEMBRANE_BY_ID.visking
    const t = sim.time
    grid.forEach(([y, z], i) => {
      // Cling film has no holes at all, so the pores collapse to nothing.
      const r = membrane.poreRadius * (1 + Math.sin(t * 2 + i * 0.6) * 0.06)
      dummy.position.set(0, y, z)
      dummy.rotation.set(0, Math.PI / 2, 0)
      dummy.scale.set(r, r, r)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      {/* The sheet itself */}
      <mesh>
        <boxGeometry args={[0.09, HALF_Y * 2 - 0.02, HALF_Z * 2 - 0.02]} />
        <meshStandardMaterial
          color="#F5E8CE"
          transparent
          opacity={0.55}
          roughness={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* The pores */}
      <instancedMesh ref={poreRef} args={[undefined, undefined, grid.length]} frustumCulled={false}>
        <circleGeometry args={[1, 12]} />
        <meshBasicMaterial color="#2A3A2E" side={THREE.DoubleSide} />
      </instancedMesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Net-flow arrow                                                      */
/* ------------------------------------------------------------------ */

/**
 * One arrow through the membrane whose length and opacity track the *net*
 * crossing rate. At equilibrium it shrinks away entirely — the visual proof
 * that motion has not stopped but net movement has.
 */
function NetFlowArrow({ sim }: { sim: PhotoSim }) {
  const groupRef = useRef<THREE.Group>(null)
  const shaftRef = useRef<THREE.Mesh>(null)
  const headRef = useRef<THREE.Mesh>(null)
  const shown = useRef(0)

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const group = groupRef.current
    if (!group || !shaftRef.current || !headRef.current) return

    // Ease toward the measured flow so the arrow never jitters.
    const target = THREE.MathUtils.clamp(sim.mNetFlow / 6, -1, 1)
    shown.current += (target - shown.current) * (1 - Math.exp(-dt * 2.5))

    const magnitude = Math.abs(shown.current)
    const direction = shown.current >= 0 ? 1 : -1
    const length = 0.5 + magnitude * 2.6
    group.visible = magnitude > 0.02
    group.position.set(0, HALF_Y + 0.5, 0)
    group.scale.set(direction, 1, 1)

    shaftRef.current.scale.set(length, 1, 1)
    shaftRef.current.position.x = length / 2
    headRef.current.position.x = length + 0.16

    const opacity = Math.min(0.95, 0.25 + magnitude * 1.4)
    ;(shaftRef.current.material as THREE.MeshBasicMaterial).opacity = opacity
    ;(headRef.current.material as THREE.MeshBasicMaterial).opacity = opacity
  })

  return (
    <group ref={groupRef}>
      <mesh ref={shaftRef} rotation={[0, 0, -Math.PI / 2]}>
        <cylinderGeometry args={[0.075, 0.075, 1, 10]} />
        <meshBasicMaterial color="#F0B429" transparent opacity={0.9} toneMapped={false} />
      </mesh>
      <mesh ref={headRef} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.2, 0.34, 12]} />
        <meshBasicMaterial color="#F0B429" transparent opacity={0.9} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** Roots and a warm glow behind the glass, so the chamber sits somewhere. */
function SoilSurround() {
  const glow = useMemo(
    () => glowTexture('rgba(120, 84, 52, 0.55)', 'rgba(74, 52, 34, 0.25)', 'soil'),
    [],
  )
  const roots = useMemo(
    () =>
      [-3.1, -0.4, 2.6].map((x, i) => {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(x, 6.4, -2.6),
          new THREE.Vector3(x + (i - 1) * 0.7, 4.4, -2.3),
          new THREE.Vector3(x * 0.75, 2.6, -2.6),
          new THREE.Vector3(x * 0.5, 1.2, -2.4),
        ])
        return new THREE.TubeGeometry(curve, 20, 0.17 - i * 0.03, 8, false)
      }),
    [],
  )

  return (
    <group>
      <mesh position={[0, 0, -6]}>
        <planeGeometry args={[34, 22]} />
        <meshBasicMaterial map={glow} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      {roots.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial color="#8A5A34" roughness={0.95} />
        </mesh>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* The chamber                                                         */
/* ------------------------------------------------------------------ */

interface Props {
  sim: PhotoSim
  demo: MembraneDemoId
  membraneId: string
}

export default function MembraneWorld({ sim, demo, membraneId }: Props) {
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as {
    target: THREE.Vector3
    update: () => void
  } | null

  const meshRefs = {
    water: useRef<THREE.InstancedMesh>(null),
    glucose: useRef<THREE.InstancedMesh>(null),
    starch: useRef<THREE.InstancedMesh>(null),
  }
  const labelRefs = {
    water: useRef<THREE.InstancedMesh>(null),
    glucose: useRef<THREE.InstancedMesh>(null),
    starch: useRef<THREE.InstancedMesh>(null),
  }

  const dummy = useMemo(() => new THREE.Object3D(), [])
  const scratch = useMemo(() => new THREE.Vector3(), [])
  const particles = useMemo<Particle[]>(
    () =>
      SPECIES_ORDER.flatMap((id) =>
        Array.from({ length: COUNTS[id] }, () => ({
          species: id,
          x: 0,
          y: 0,
          z: 0,
          vx: 0,
          vy: 0,
          vz: 0,
          flash: 0,
        })),
      ),
    [],
  )
  const lastReset = useRef(-1)
  const crossAcc = useRef(0)
  const crossWindow = useRef(0)

  useEffect(() => {
    scene.background = new THREE.Color('#3E2C22')
    scene.fog = null
    camera.position.set(0, 0.9, 10.5)
    controls?.target.set(0, 0, 0)
    controls?.update()
  }, [scene, camera, controls])

  /** Lay the chamber out for whichever demo is selected. */
  const reset = () => {
    particles.forEach((p) => {
      p.flash = 0
      scatter(p, 1)
      p.y = -HALF_Y + 0.3 + Math.random() * (HALF_Y * 2 - 0.6)
      p.z = -HALF_Z + 0.3 + Math.random() * (HALF_Z * 2 - 0.6)
      if (demo === 'diffusion') {
        // Everything the learner is watching starts crowded on the left.
        if (p.species === 'glucose') p.x = -HALF_X + 0.3 + Math.random() * 1.5
        else if (p.species === 'starch') p.x = -HALF_X + 0.3 + Math.random() * 1.2
        else p.x = (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 3.3)
      } else {
        // Osmosis: water even, all the big solute on the right.
        if (p.species === 'water')
          p.x = (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 3.3)
        else p.x = 0.4 + Math.random() * 3.2
      }
    })
    sim.mCrossings = 0
    sim.mNetFlow = 0
    sim.mEquilibrium = false
    crossAcc.current = 0
  }

  useFrame((state, rawDt) => {
    // Wall-clock, not the tight animation clamp: on a slow machine the clamp
    // alone made the bench run at a quarter speed, so a "20 second" experiment
    // took a minute and a half.
    const frameDt = Math.min(rawDt, 0.2)
    // Sub-step the physics so a fast particle can never tunnel through the
    // membrane in a single long frame.
    const subSteps = Math.min(4, Math.max(1, Math.ceil(frameDt / 0.05)))
    const dt = frameDt / subSteps
    if (lastReset.current !== sim.demoReset) {
      reset()
      lastReset.current = sim.demoReset
    }

    const membrane = MEMBRANE_BY_ID[membraneId] ?? MEMBRANE_BY_ID.visking
    const running = sim.demoRunning && sim.started && !sim.paused
    if (running) sim.demoTime += frameDt

    // Warmer chamber, faster spreading. Speed is scaled by √D so that the
    // spreading rate itself (D ≈ v·λ/3) tracks the diffusion coefficient.
    const warmth = Math.sqrt(diffusionFactor(sim.membraneTempC))
    const baseSpeed = (running ? 1.9 : 0.12) * warmth
    /** Collisions per second — sets how far a particle travels between turns. */
    const collisionRate = 2

    // Water crossing depends on how free the water is on the side it starts —
    // the mechanism behind osmosis, applied symmetrically.
    const leftWater = sim.mLeft[0] || 1
    const rightWater = sim.mRight[0] || 1
    const leftSolute = (sim.mLeft[1] || 0) + (sim.mLeft[2] || 0)
    const rightSolute = (sim.mRight[1] || 0) + (sim.mRight[2] || 0)
    const freeLeft = freeWaterFraction(leftWater, leftSolute)
    const freeRight = freeWaterFraction(rightWater, rightSolute)

    const counts = { left: [0, 0, 0], right: [0, 0, 0] }
    // Only the tracer's crossings drive the arrow. Counting every species let
    // the eighty water molecules drown out the signal the panel was describing.
    const tracer = MEMBRANE_DEMOS[demo].tracer
    let net = 0

    for (let step = 0; step < subSteps; step++) {
      for (const p of particles) {
        const species = SPECIES[p.species]
        const fits = canCross(species, membrane)

        // Heavier molecules move more slowly at the same temperature (Graham's law).
        const ownSpeed = baseSpeed / Math.sqrt(species.size)
        if (p.vx === 0 && p.vy === 0 && p.vz === 0) scatter(p, ownSpeed)

        if (running) {
          // Occasional collisions send it off in a new direction.
          if (Math.random() < collisionRate * dt) scatter(p, ownSpeed)
          const prevX = p.x
          let nx = p.x + p.vx * dt
          p.y += p.vy * dt
          p.z += p.vz * dt

          const crossing = (prevX < 0 && nx >= 0) || (prevX > 0 && nx <= 0)
          if (crossing) {
            let allowed = fits
            if (allowed && p.species === 'water') {
              // Leaving the crowded side is harder: less of its water is free.
              const freedom = prevX < 0 ? freeLeft : freeRight
              allowed = Math.random() < freedom
            }
            if (allowed) {
              p.flash = 0.45
              if (p.species === tracer) {
                sim.mCrossings += 1
                net += prevX < 0 ? 1 : -1
              }
            } else {
              // Bounced off the membrane and sent back the way it came.
              nx = prevX < 0 ? -0.08 : 0.08
              p.vx = -p.vx
            }
          }
          p.x = nx
        }
        if (p.flash > 0) p.flash = Math.max(0, p.flash - dt)

        // Chamber walls: bounce rather than stick, or particles pile up on them.
        if (p.x < -HALF_X + 0.14) {
          p.x = -HALF_X + 0.14
          p.vx = Math.abs(p.vx)
        } else if (p.x > HALF_X - 0.14) {
          p.x = HALF_X - 0.14
          p.vx = -Math.abs(p.vx)
        }
        if (p.y < -HALF_Y + 0.14) {
          p.y = -HALF_Y + 0.14
          p.vy = Math.abs(p.vy)
        } else if (p.y > HALF_Y - 0.14) {
          p.y = HALF_Y - 0.14
          p.vy = -Math.abs(p.vy)
        }
        if (p.z < -HALF_Z + 0.14) {
          p.z = -HALF_Z + 0.14
          p.vz = Math.abs(p.vz)
        } else if (p.z > HALF_Z - 0.14) {
          p.z = HALF_Z - 0.14
          p.vz = -Math.abs(p.vz)
        }
      }
    }

    for (const p of particles) {
      const side = p.x < 0 ? counts.left : counts.right
      side[SPECIES_ORDER.indexOf(p.species)] += 1
    }

    sim.mLeft = counts.left
    sim.mRight = counts.right

    // Net flow, averaged over a short window so the arrow reads a trend.
    crossAcc.current += net
    crossWindow.current += frameDt
    if (crossWindow.current >= 0.35) {
      const rate = crossAcc.current / crossWindow.current
      sim.mNetFlow += (rate - sim.mNetFlow) * 0.55
      crossAcc.current = 0
      crossWindow.current = 0
    }
    sim.mEquilibrium = running && sim.demoTime > 6 && Math.abs(sim.mNetFlow) < 0.55

    // Draw, one instanced mesh per species.
    for (const id of SPECIES_ORDER) {
      const mesh = meshRefs[id].current
      const label = labelRefs[id].current
      if (!mesh || !label) continue
      const r = RADIUS[id]
      let index = 0
      for (const p of particles) {
        if (p.species !== id) continue
        const flash = p.flash > 0 ? 1 + (p.flash / 0.45) * 0.7 : 1
        scratch.set(p.x, p.y, p.z)
        dummy.position.copy(scratch)
        dummy.rotation.set(p.x, p.y * 1.4, p.z)
        dummy.scale.setScalar(r * flash)
        dummy.updateMatrix()
        mesh.setMatrixAt(index, dummy.matrix)
        // Only a few of each species carry their formula.
        if (index % 6 === 0) {
          writeGlyph(label, index, dummy, state.camera, scratch, 1, r + 0.1)
        } else {
          hideGlyph(label, index, dummy)
        }
        index += 1
      }
      mesh.instanceMatrix.needsUpdate = true
      label.instanceMatrix.needsUpdate = true
    }
  })

  const setup = MEMBRANE_DEMOS[demo]
  void setup

  return (
    <group>
      <ambientLight intensity={0.8} color="#FFE8C8" />
      <directionalLight position={[4, 8, 6]} intensity={1.15} color="#FFD9A0" />
      <pointLight position={[0, 0, 5]} intensity={0.6} color="#FFF3DC" distance={18} />

      {/* The chamber */}
      <mesh>
        <boxGeometry args={[HALF_X * 2, HALF_Y * 2, HALF_Z * 2]} />
        <meshPhysicalMaterial
          color="#CFE3D8"
          transparent
          opacity={0.12}
          roughness={0.15}
          side={THREE.DoubleSide}
        />
        <Edges color="#FBF5EA" />
      </mesh>

      <SoilSurround />
      <Membrane sim={sim} />
      <NetFlowArrow sim={sim} />

      {SPECIES_ORDER.map((id) => (
        <group key={id}>
          <instancedMesh
            ref={meshRefs[id]}
            args={[undefined, undefined, COUNTS[id]]}
            frustumCulled={false}
          >
            {id === 'starch' ? (
              <icosahedronGeometry args={[1, 0]} />
            ) : (
              <sphereGeometry args={[1, 10, 8]} />
            )}
            <meshStandardMaterial
              color={SPECIES[id].color}
              roughness={0.35}
              flatShading={id === 'starch'}
            />
          </instancedMesh>
          <GlyphInstances
            ref={labelRefs[id]}
            text={SPECIES[id].label}
            color={SPECIES[id].labelColor}
            count={COUNTS[id]}
            size={id === 'water' ? 0.15 : 0.13}
          />
        </group>
      ))}

      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={4}
        maxDistance={20}
        minPolarAngle={0.1}
        maxPolarAngle={Math.PI * 0.82}
      />
    </group>
  )
}

export { TOTAL as MEMBRANE_PARTICLE_TOTAL }
