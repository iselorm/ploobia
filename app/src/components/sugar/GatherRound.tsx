import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { getQualityCaps } from '@/lib/quality'
import type { SugarResource } from '@/lib/sugarchallenge'
import { glowSprite } from './atlas'
import { buildGatherField, CATCH_WINDOW, framingFor } from './gatherfield'
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
  const fieldSize = Math.max(18, Math.round(CATCHABLES * Math.max(0.6, quality.particleScale)))

  const tmp = useMemo(
    () => ({ at: new THREE.Vector3(), ndc: new THREE.Vector3(), aim: new THREE.Vector3() }),
    [],
  )

  /**
   * The world, built once from the seed.
   *
   * The geometry lives in `gatherfield.ts` because the camera needs the same
   * answer — see that module for why one definition matters here.
   */
  const field = useMemo(
    () => buildGatherField(rig, seed, elevation, azimuth, fieldSize),
    [rig, seed, elevation, azimuth, fieldSize],
  )
  const items = field.items

  const motion = useRef<Motion[]>([])
  /** The pointer's place last frame, so a sweep is a segment and not a dot. */
  const prev = useRef({ x: 0, y: 0, has: 0 })

  /* ------------------------------------------------------------------ */
  /* Framing                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * The round frames the field, and hands the view back when it ends.
   *
   * Camera work inside what is otherwise a particle component looks out of
   * place, and the alternative — threading a bounding box up through
   * `PlantStage` into `SugarScene` — is worse: two components would have to
   * agree about a volume only this one computes, which is the arrangement that
   * produced the bug in the first place. The whole feature stays in one file
   * and one mount point instead.
   *
   * Orbit is already disabled for the duration of the round, so nothing fights
   * this. On unmount the camera is put back exactly where it was, because a
   * learner who spent a minute finding an angle they liked should not lose it
   * to a game they chose to play.
   */
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const controls = useThree((s) => s.controls) as
    | { target: THREE.Vector3; update: () => void }
    | null
  const wanted = useMemo(
    () => ({ position: new THREE.Vector3(), target: new THREE.Vector3() }),
    [],
  )
  const saved = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null)

  useEffect(() => {
    if (!running) return
    saved.current = {
      position: camera.position.clone(),
      target: controls ? controls.target.clone() : new THREE.Vector3(),
    }
    return () => {
      const back = saved.current
      saved.current = null
      if (!back) return
      camera.position.copy(back.position)
      if (controls) {
        controls.target.copy(back.target)
        controls.update()
      }
      camera.lookAt(back.target)
    }
    // The camera object is stable for the life of the canvas; `controls` may
    // arrive a frame late, which is why it is a dependency.
  }, [running, camera, controls])

  /**
   * The field, for the suite.
   *
   * The claim that has to be checkable is *every catchable is on screen while
   * it can be caught*. That is a projection of world paths through the live
   * camera, so it cannot be asserted from the DOM and it cannot be asserted
   * from outside the page. Hence a handle.
   */
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    w.__gatherField = () => ({
      window: CATCH_WINDOW,
      bounds: {
        min: field.bounds.min.toArray(),
        max: field.bounds.max.toArray(),
      },
      items: field.items.map((it) => ({
        kind: it.kind,
        from: it.from.toArray(),
        to: it.to.toArray(),
      })),
    })
    return () => {
      delete w.__gatherField
    }
  }, [field])

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

    if (running) {
      // Eased rather than snapped: the round opens by drawing back to take in
      // the whole sky, which reads as the game beginning. An exponential ease
      // is frame-rate independent, which a plain lerp is not.
      framingFor(field.bounds, camera.position, camera.fov, aspect, wanted)
      const k = 1 - Math.exp(-dt * 3.2)
      camera.position.lerp(wanted.position, k)
      camera.lookAt(wanted.target)
    }

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
