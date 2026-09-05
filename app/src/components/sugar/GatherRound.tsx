import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { getQualityCaps } from '@/lib/quality'
import { rngFor } from '@/lib/challenge'
import type { SugarResource } from '@/lib/sugarchallenge'
import { glowSprite } from './atlas'
import type { SugarRig } from './rig'

/**
 * The gather round — where a plant's inputs stop being dials and become scarce.
 *
 * **Why interception and not tapping.** The obvious mechanic is tap-the-falling-
 * mote, and it is wrong twice over: on a phone it means stabbing at 6-pixel
 * dots, and biologically it says nothing. A leaf does not *tap* photons, it
 * *intercepts* them — it holds out area and catches what falls through it. So
 * the learner drags a collector through the light, and the verb they perform is
 * the verb the plant performs. Forgiving on touch, and honest.
 *
 * **Why its own particles.** It would be tidier-sounding to make the existing
 * sun motes and gas molecules catchable, but those are decoration written
 * fresh every frame by `SunRays` and `GasField` and owning their own lifetimes.
 * Reaching in to mark one "collected" would couple the game to the scenery and
 * break both. These are separate catchables spawned along the *same* lanes and
 * dome, so it reads as one scene and behaves as two systems.
 *
 * **Why the seed matters.** Every position and phase comes from the challenge
 * seed, never `Math.random()`. Two friends opening one link must gather from an
 * identical sky, or comparing their scores is meaningless.
 */

const CATCHABLES = 30

/** How near the collector's centre counts as caught, in normalised screen units. */
const CATCH_RADIUS = 0.11

/**
 * How far a mote is from the path the finger swept this frame.
 *
 * Point-to-*segment*, not point-to-point, and that difference is the whole
 * fix. A frame is a snapshot: test only where the finger is *now* and a drag
 * that crosses half the screen in one frame passes straight through
 * everything in between without touching it. On a phone at thirty frames a
 * second that is most of a fast sweep, and the round feels broken in a way the
 * player can neither see nor correct — they went through the light and it did
 * not count.
 *
 * Aspect is applied to x so the catch area is a circle on the glass rather
 * than an ellipse that is fair only on a square screen.
 */
function distToSweep(
  mx: number,
  my: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  aspect: number,
): number {
  const pax = (mx - ax) * aspect
  const pay = my - ay
  const bax = (bx - ax) * aspect
  const bay = by - ay
  const len = bax * bax + bay * bay
  // A stationary finger is a point, and the projection below would divide by
  // zero rather than saying so.
  const t = len > 1e-12 ? Math.max(0, Math.min(1, (pax * bax + pay * bay) / len)) : 0
  const dx = pax - bax * t
  const dy = pay - bay * t
  return Math.sqrt(dx * dx + dy * dy)
}

/** What one catch banks, per resource. Tuned so a good round funds a bright trial. */
const WORTH: Record<SugarResource, number> = { light: 95, co2: 26, water: 4 }

/**
 * Where one catchable comes from and where it is going. Derived from the seed
 * and then never touched — two players on one link must gather from an
 * identical sky, and a plan that could be edited would not stay identical.
 */
interface Spawn {
  kind: SugarResource
  from: THREE.Vector3
  to: THREE.Vector3
  speed: number
  /** Its starting place along the path, 0–1. */
  phase: number
}

/**
 * The part that moves, kept deliberately apart from the plan.
 *
 * Two arrays rather than one mutable one, because the plan is a memo and a memo
 * is a value React may hand back to anyone: mutating it is the kind of thing
 * that works until the day the component re-renders for an unrelated reason.
 * The runtime state lives in a ref, which is what a ref is for.
 */
interface Motion {
  /** 0–1 along the path. */
  t: number
  /** Caught ones fade out and respawn, so the sky never empties. */
  dead: number
}

export default function GatherRound({
  rig,
  seed,
  elevation,
  azimuth,
  running,
  onCatch,
}: {
  rig: SugarRig
  seed: number
  elevation: number
  azimuth: number
  running: boolean
  /** Fired for each catch, so the HUD can bank it and celebrate. */
  onCatch: (kind: SugarResource, amount: number) => void
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const quality = getQualityCaps()

  // One neutral sprite for every catchable: the per-instance colour carries the
  // meaning, so three resources still cost one draw call.
  const mote = useMemo(() => glowSprite('rgba(255,255,255,0.98)', 'rgba(255,255,255,0.35)', 'catch-mote'), [])
  const ringTex = useMemo(() => glowSprite('rgba(255,255,255,0.0)', 'rgba(120,200,140,0.55)', 'catch-ring'), [])

  /**
   * A weak device gets fewer things in the sky, never fewer *kinds*.
   *
   * Thinning the field is a frame-rate decision; dropping a resource would be a
   * gameplay one, and the two must not be confused. The floor is high enough
   * that the round is still playable on the lowest tier.
   */
  const fieldSize = Math.max(14, Math.round(CATCHABLES * Math.max(0.5, quality.particleScale)))

  const tmp = useMemo(
    () => ({ at: new THREE.Vector3(), ndc: new THREE.Vector3(), aim: new THREE.Vector3() }),
    [],
  )

  /** Where the light comes from — the same angle the shafts use. */
  const travel = useMemo(() => {
    const v = new THREE.Vector3(
      Math.cos(elevation) * Math.sin(azimuth),
      Math.sin(elevation),
      Math.cos(elevation) * Math.cos(azimuth),
    )
    return v.normalize().multiplyScalar(-1)
  }, [elevation, azimuth])

  /**
   * The world, built once from the seed.
   *
   * Light falls down the lanes onto leaves, carbon drifts in across the canopy,
   * water rises out of the soil. Each stream comes from where that resource
   * really comes from, because a game whose geography contradicts the science
   * is teaching the wrong thing quietly.
   */
  const items = useMemo<Spawn[]>(() => {
    const next = rngFor(seed)
    const leaves = [...rig.leaves].sort((a, b) => b.source.y - a.source.y)
    const canopy = rig.height * 0.7
    const out: Spawn[] = []
    for (let i = 0; i < fieldSize; i++) {
      const roll = next()
      const kind: SugarResource = roll < 0.5 ? 'light' : roll < 0.82 ? 'co2' : 'water'
      const leaf = leaves[i % Math.max(1, leaves.length)]
      const to = leaf ? leaf.source.clone() : new THREE.Vector3(0, canopy, 0)
      let from: THREE.Vector3

      if (kind === 'light') {
        from = to.clone().addScaledVector(travel, -(rig.height * 1.4 + 1.4))
      } else if (kind === 'co2') {
        const a = next() * Math.PI * 2
        const r = 1.5 + next() * 0.8
        from = new THREE.Vector3(Math.cos(a) * r, canopy + (next() - 0.5) * 0.8, Math.sin(a) * r)
      } else {
        const a = next() * Math.PI * 2
        const r = 0.25 + next() * 0.5
        from = new THREE.Vector3(Math.cos(a) * r, -0.35, Math.sin(a) * r)
      }
      out.push({
        kind,
        from,
        to: kind === 'water' ? new THREE.Vector3(from.x * 0.3, canopy * 0.8, from.z * 0.3) : to,
        phase: next(),
        speed: 0.16 + next() * 0.16,
      })
    }
    return out
  }, [rig, seed, travel, fieldSize])

  const motion = useRef<Motion[]>([])
  /** The pointer's place last frame, so a sweep is a segment and not a dot. */
  const prev = useRef({ x: 0, y: 0, has: 0 })

  useEffect(() => {
    motion.current = items.map((it) => ({ t: it.phase, dead: 0 }))
    prev.current.has = 0
    // The cap matters: an InstancedMesh renders every instance it was allocated,
    // and an unwritten one is an identity matrix — a full-size sprite sitting at
    // the origin. This cabinet has shipped that bug once already.
    if (meshRef.current) meshRef.current.count = items.length
  }, [items])

  useFrame((state, rawDt) => {
    const mesh = meshRef.current
    if (!mesh) return
    const dt = Math.min(rawDt, 0.05)
    const px = state.pointer.x
    const py = state.pointer.y
    const aspect = state.size.width / Math.max(1, state.size.height)

    // The collector sits a fixed way in front of the camera, so it is always
    // in view and always the same size to aim with.
    if (ringRef.current) {
      tmp.aim.set(px, py, 0.5).unproject(state.camera)
      const dir = tmp.aim.sub(state.camera.position).normalize()
      ringRef.current.position.copy(state.camera.position).addScaledVector(dir, 3.2)
      ringRef.current.quaternion.copy(state.camera.quaternion)
      ringRef.current.visible = running
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.04
      ringRef.current.scale.setScalar(0.62 * pulse)
    }

    const mo = motion.current
    if (mo.length !== items.length) return

    // Where the finger was last frame. On the first frame of a round there is
    // no segment yet, so the test degenerates to a point — which is correct,
    // not a special case.
    const lastX = prev.current.has ? prev.current.x : px
    const lastY = prev.current.has ? prev.current.y : py

    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const m = mo[i]

      if (m.dead > 0) {
        m.dead -= dt
        if (m.dead <= 0) {
          m.t = 0
          m.dead = 0
        }
        dummy.scale.setScalar(0)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        continue
      }

      if (running) m.t += dt * it.speed
      if (m.t > 1) m.t -= 1

      tmp.at.lerpVectors(it.from, it.to, m.t)
      dummy.position.copy(tmp.at)
      dummy.quaternion.copy(state.camera.quaternion)
      const fade = Math.min(1, m.t * 5) * Math.min(1, (1 - m.t) * 5)
      dummy.scale.setScalar((it.kind === 'light' ? 0.13 : 0.11) * fade)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)

      /* -- interception --
         Screen space, not world space: the learner is aiming with a finger on
         glass, so the test has to be the one their eye is making. The aspect
         correction stops the catch area being an ellipse on a wide screen. */
      if (!running || fade < 0.4) continue
      tmp.ndc.copy(tmp.at).project(state.camera)
      if (tmp.ndc.z > 1) continue
      if (distToSweep(tmp.ndc.x, tmp.ndc.y, lastX, lastY, px, py, aspect) < CATCH_RADIUS) {
        m.dead = 1.1 + it.speed
        onCatch(it.kind, WORTH[it.kind])
      }
    }

    // Remembered for the next frame's sweep. Written after the loop so every
    // mote in this frame is tested against the same segment.
    prev.current.x = px
    prev.current.y = py
    prev.current.has = 1

    mesh.instanceMatrix.needsUpdate = true
  })

  // Three sheets would be three draw calls; one sheet with a neutral sprite and
  // per-instance colour is one. The colour is what tells a learner which
  // resource they are chasing, so it cannot be dropped at the low tier.
  const colors = useMemo(() => {
    const arr = new Float32Array(items.length * 3)
    const c = new THREE.Color()
    items.forEach((it, i) => {
      c.set(it.kind === 'light' ? '#FFD98A' : it.kind === 'co2' ? '#D8DDE4' : '#9AD1F5')
      arr[i * 3] = c.r
      arr[i * 3 + 1] = c.g
      arr[i * 3 + 2] = c.b
    })
    return arr
  }, [items])

  return (
    <group name="gather-round">
      <instancedMesh
        ref={meshRef}
        name="gather-catchables"
        args={[undefined, undefined, CATCHABLES]}
        frustumCulled={false}
        renderOrder={6}
      >
        <planeGeometry args={[1, 1]}>
          <instancedBufferAttribute attach="attributes-color" args={[colors, 3]} />
        </planeGeometry>
        <meshBasicMaterial
          map={mote}
          vertexColors
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>

      {/* The collector. A ring rather than a solid disc, so it never hides the
          thing the learner is aiming at. */}
      <mesh ref={ringRef} renderOrder={7} visible={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={ringTex}
          transparent
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
