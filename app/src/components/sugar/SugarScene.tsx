import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import PerfProbe from '@/components/PerfProbe'
import SharedStereoRig from '@/components/world/StereoRig'
import { getQualityCaps, reportFrame, useQualityCaps } from '@/lib/quality'
import { useStereo } from '@/lib/stereo'
import { registerCamera } from '@/lib/input'
import { stepSim, type StageId, type SugarSim } from '@/lib/sugarsim'
import { SPECIMEN_BY_ID } from '@/lib/specimens'
import { habitatForSpecimen } from '@/lib/sugarworld'
import type { SugarResource } from '@/lib/sugarchallenge'
import { ATLAS, atlasEnvironment, DOT_GRID_FRAG, DOT_GRID_VERT } from './atlas'
import Habitat from './Habitat'
import PlantStage from './PlantStage'
import LeafStage from './LeafStage'
import StemStage from './StemStage'
import { defaultViewFor, VIEW_BY_ID } from './views'

/**
 * The Sugar Line's canvas.
 *
 * One plate, three stages, one camera. The stage swap is a component swap
 * rather than a route change, so the sim keeps running underneath and the
 * plant does not restart its day every time a learner looks inside a leaf.
 */

/* ------------------------------------------------------------------ */
/* Clock                                                              */
/* ------------------------------------------------------------------ */

function Ticker({ sim }: { sim: SugarSim }) {
  useFrame((_, rawDt) => {
    reportFrame(rawDt)
    stepSim(sim, rawDt)
  })
  return null
}

/* ------------------------------------------------------------------ */
/* The plate the specimen sits on                                     */
/* ------------------------------------------------------------------ */

/**
 * The backdrop: a warm cream field with a slow pulse grid on it, a long way
 * behind the subject.
 *
 * The grid shader is ThreeUI's Dot Matrix (MIT, Meng To), re-tuned from cyan
 * on black to graphite on cream and pushed back until it reads as the squared
 * paper a field sketch is drawn on rather than as an effect in its own right.
 */
function Backdrop({ tint }: { tint?: string }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uGridScale: { value: 104 },
      uPulseSpeed: { value: 0.28 },
      uRadius: { value: 0.05 },
      uOpacity: { value: 0.17 },
      uColor: { value: new THREE.Color('#9A8F76') },
    }),
    [],
  )

  // A microscope view has no scenery, but it should still remember which
  // habitat it was reached from — a chloroplast lit by desert light is a
  // truthful continuity cue, where a painted desert behind it would be a lie.
  const dome = useMemo(() => {
    const c = new THREE.Color(ATLAS.paper)
    if (tint) c.lerp(new THREE.Color(tint), 0.3)
    return c
  }, [tint])

  useFrame((_, rawDt) => {
    uniforms.uTime.value += Math.min(rawDt, 0.05)
  })

  return (
    <group>
      {/* A big cream dome, so there is no hard edge anywhere and no black void
          when the camera swings past the backdrop plane. */}
      <mesh>
        <sphereGeometry args={[80, 24, 16]} />
        <meshBasicMaterial color={dome} side={THREE.BackSide} fog={false} />
      </mesh>
      <mesh position={[0, 2.2, -9]}>
        <planeGeometry args={[34, 22]} />
        <shaderMaterial
          ref={materialRef}
          uniforms={uniforms}
          vertexShader={DOT_GRID_VERT}
          fragmentShader={DOT_GRID_FRAG}
          transparent
          depthWrite={false}
        />
      </mesh>
      {/* A pool of warmth on the floor, set below the deepest root ball so it
          never slices through the soil section. */}
      <mesh position={[0, -2.6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[13, 48]} />
        <meshBasicMaterial color={ATLAS.paperDeep} fog={false} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Lighting                                                           */
/* ------------------------------------------------------------------ */

/**
 * A five-light studio rig plus a procedural environment map.
 *
 * Bright and warm by default: this codebase has already learned that a moody
 * dark hall reads as unfriendly rather than atmospheric, and the whole atlas
 * look depends on the paper being paper-coloured. The accent light is tinted
 * by the stage, which is a cheap way of telling the eye it has moved.
 */
function AtlasEnv() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const env = atlasEnvironment(gl)
    scene.environment = env
    scene.environmentIntensity = 0.75
    return () => {
      scene.environment = null
      env.dispose()
    }
  }, [gl, scene])
  return null
}

function Lights({ stage }: { stage: StageId }) {
  const accentRef = useRef<THREE.PointLight>(null)
  const quality = getQualityCaps()

  const accent = stage === 'leaf' ? '#8FD07A' : stage === 'stem' ? '#F3C05A' : '#FFE7A8'

  useFrame((_, rawDt) => {
    const light = accentRef.current
    if (!light) return
    const target = new THREE.Color(accent)
    light.color.lerp(target, 1 - Math.exp(-Math.min(rawDt, 0.05) * 3))
  })

  return (
    <group>
      <hemisphereLight args={['#FFF6E2', '#C8C2AC', 0.75]} />
      <directionalLight
        position={[5.2, 8.4, 4.6]}
        intensity={2.1}
        color="#FFF2D2"
        castShadow={quality.shadows}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={1}
        shadow-camera-far={26}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={8}
        shadow-camera-bottom={-4}
        shadow-bias={-0.0012}
      />
      <directionalLight position={[-5.4, 3.2, -2.6]} intensity={0.6} color="#D7E4F2" />
      <directionalLight position={[0.4, 2.2, -6.5]} intensity={0.85} color="#FFD9A8" />
      <pointLight ref={accentRef} position={[1.4, 2.6, 2.4]} intensity={6} distance={11} decay={2} />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Camera                                                             */
/* ------------------------------------------------------------------ */

interface OrbitLike {
  target: THREE.Vector3
  autoRotate: boolean
  autoRotateSpeed: number
  update: () => void
}

const MIN_ORBIT = 0.9
const MAX_ORBIT = 22

/**
 * Free orbit and free zoom, always, with short authored flights on request.
 *
 * A flight is a GSAP-shaped ease along a gently arched path from wherever the
 * camera is; when it lands, OrbitControls owns the camera again. Nothing is
 * lerped toward a home position every frame, because that quietly drags a
 * learner back out of whatever they were looking at.
 *
 * The one exception is the gather round, and it is not a preference — a drag
 * across the glass is *both* the orbit gesture and the catch gesture, so with
 * orbit live every sweep tumbles the scene under the collector and the round
 * is unplayable. For those forty seconds the drag belongs to the game. Found
 * by playing it on real hardware; no amount of geometry checking would have
 * shown it, because nothing overlaps and nothing is off screen.
 */
function SugarCamera({ sim, frame, orbit = true }: { sim: SugarSim; frame: number; orbit?: boolean }) {
  const stereo = useStereo()
  const controls = useThree((s) => s.controls) as OrbitLike | null
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const mounted = useRef(false)
  const lastViewSeq = useRef(sim.viewSeq)
  const lastReset = useRef(sim.viewReset)
  const flyPos = useMemo(() => new THREE.Vector3(), [])
  const flyTarget = useMemo(() => new THREE.Vector3(), [])
  const flight = useMemo(
    () => ({
      t: 1,
      duration: 1.5,
      active: false,
      fromPos: new THREE.Vector3(),
      fromTarget: new THREE.Vector3(),
      arc: 0,
    }),
    [],
  )
  const offset = useMemo(() => new THREE.Vector3(), [])
  const spherical = useMemo(() => new THREE.Spherical(), [])
  const pendingOrbit = useRef({ dx: 0, dy: 0 })

  const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)

  /**
   * Whole-plant shots are framed against the specimen's own height. Maize is
   * a third taller than a bean and was losing its top leaves off the top of
   * the plate at the bean's framing; the other two stages are drawn at a fixed
   * scale, so they are left alone.
   *
   * **The off-centre composition is a landscape idea, and it is centred on a
   * phone.** Putting the subject on a third and opening the field out beside
   * it is what stopped this cabinet reading as every other 3D gallery on the
   * internet — but that argument assumes there is room beside the subject. On
   * a 412 px portrait screen there is none: measured, the plant's box ran from
   * x = −330 to x = 409, i.e. a third of it off the left edge, with the "open
   * field" it was making room for entirely off-screen. So the sideways offset
   * fades out as the frame gets narrower and is gone by the time it is a
   * phone. Wide screens keep the composed shot.
   */
  const applyFrame = (v: { position: [number, number, number]; target: [number, number, number]; stage: string }) => {
    const k = v.stage === 'plant' ? frame : 1
    // 1 on a landscape frame, 0 at 3:4 and narrower.
    const wide = THREE.MathUtils.clamp((size.width / size.height - 0.75) / 0.55, 0, 1)
    flyPos.set(v.position[0] * wide, v.position[1] * k, v.position[2] * k)
    flyTarget.set(v.target[0] * wide, v.target[1] * k, v.target[2])
  }

  const startFlight = (seconds: number, arc = 0.55) => {
    flight.fromPos.copy(camera.position)
    flight.fromTarget.copy(controls ? controls.target : flyTarget)
    flight.arc = arc * Math.min(1, flight.fromPos.distanceTo(flyPos) / 5)
    flight.t = 0
    flight.duration = seconds
    flight.active = true
  }

  useEffect(
    () =>
      registerCamera({
        orbit: (dx, dy) => {
          pendingOrbit.current.dx += dx
          pendingOrbit.current.dy += dy
        },
        zoom: (delta) => {
          sim.viewZoom += delta
        },
      }),
    [sim],
  )

  useFrame((_, rawDt) => {
    // Wait for OrbitControls to register before claiming the framing is set —
    // flipping this on frame one leaves the orbit target at the world origin.
    if (!mounted.current) {
      if (!controls) return
      const v = defaultViewFor(sim.stage)
      applyFrame(v)
      camera.position.copy(flyPos)
      controls.target.copy(flyTarget)
      controls.update()
      mounted.current = true
      return
    }

    if (sim.viewSeq !== lastViewSeq.current) {
      lastViewSeq.current = sim.viewSeq
      const v = VIEW_BY_ID[sim.viewId] ?? defaultViewFor(sim.stage)
      applyFrame(v)
      startFlight(1.5)
    }
    if (sim.viewReset !== lastReset.current) {
      lastReset.current = sim.viewReset
      applyFrame(defaultViewFor(sim.stage))
      startFlight(1.2, 0.4)
    }

    if (flight.active) {
      flight.t = Math.min(1, flight.t + rawDt / flight.duration)
      const t = easeInOut(flight.t)
      if (flight.t >= 1) flight.active = false
      camera.position.lerpVectors(flight.fromPos, flyPos, t)
      camera.position.y += Math.sin(t * Math.PI) * flight.arc
      if (controls) controls.target.lerpVectors(flight.fromTarget, flyTarget, t)
    }

    const po = pendingOrbit.current
    if (controls && (po.dx !== 0 || po.dy !== 0)) {
      offset.copy(camera.position).sub(controls.target)
      spherical.setFromVector3(offset)
      spherical.theta -= po.dx
      spherical.phi = THREE.MathUtils.clamp(spherical.phi + po.dy, 0.06, Math.PI * 0.9)
      offset.setFromSpherical(spherical)
      camera.position.copy(controls.target).add(offset)
      po.dx = 0
      po.dy = 0
      flight.active = false
    }

    if (controls && sim.viewZoom !== 0) {
      offset.copy(camera.position).sub(controls.target)
      const next = THREE.MathUtils.clamp(offset.length() * (1 + sim.viewZoom), MIN_ORBIT, MAX_ORBIT)
      offset.setLength(next)
      camera.position.copy(controls.target).add(offset)
      sim.viewZoom = 0
      flight.active = false
    }

    // In stereo the head owns orientation; OrbitControls.update() would re-aim
    // the camera at its target every frame and fight it.
    if (controls && !stereo.on) {
      controls.autoRotate = sim.autoOrbit
      controls.autoRotateSpeed = 0.75
      controls.update()
    }
  })

  return (
    <OrbitControls
      makeDefault
      enabled={!stereo.on && orbit}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={MIN_ORBIT}
      maxDistance={MAX_ORBIT}
      minPolarAngle={0.06}
      maxPolarAngle={Math.PI * 0.9}
      zoomSpeed={0.9}
      rotateSpeed={0.85}
    />
  )
}

/* ------------------------------------------------------------------ */

interface Props {
  sim: SugarSim
  /** React-state mirrors so the scene re-renders when they change. */
  stage: StageId
  specimenId: string
  /** False puts the specimen back on the plain field-guide plate. */
  habitat: boolean
  /** Pixels of viewport bottom hidden behind a panel — see `SceneLift`. */
  obstructBottom?: number
  /** The gather round, when a challenge is running. Null in the plain lab. */
  gather?: {
    seed: number
    running: boolean
    onCatch: (kind: SugarResource, amount: number) => void
  } | null
  onContextLost: () => void
}

/**
 * Keeps the subject out from behind the bottom sheet.
 *
 * On a phone the controls sheet covers the lower half of the screen, which is
 * exactly where the plant was — so a learner dragging the light slider could
 * not see the thing the slider was changing. Moving the camera or the orbit
 * target to compensate would fight OrbitControls and quietly relocate "home"
 * for the rest of the session.
 *
 * `setViewOffset` is the right tool: it shifts the *projection* by rendering
 * the frustum as a window offset within a larger notional frame. Position,
 * target and orbit are all untouched, so the learner's own framing survives —
 * the picture simply slides up while the panel is open, and slides back when
 * it closes.
 *
 * **How far is not half the obstruction.** Half re-centres the subject in the
 * strip that is left, which is only right if the subject fits in that strip —
 * and it does not. Measured on a 390×844 phone, the plant spans 691 px of an
 * 844 px screen, so with a 62% sheet no shift can show all of it. Shifting by
 * half (262 px) put the canopy 118 px off the top of the screen: the learner
 * dragging the light slider then saw roots, which is the one part of the plant
 * light does nothing to.
 *
 * So the shift is clamped to the **headroom** — the gap between the top of the
 * screen and the top of the subject, measured by projecting the subject's own
 * bounding box. The picture rises until the specimen's crown is just inside
 * the frame and no further. What is lost is the bottom of the plant, which is
 * the correct thing to lose while a control panel is open.
 */
const TOP_MARGIN = 10

/** Re-measure this often while a panel is open. */
const REMEASURE_S = 0.4
/** Ignore changes smaller than this, so the picture does not jitter. */
const SETTLE_PX = 3

function SceneLift({ px }: { px: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const scene = useThree((s) => s.scene)
  const size = useThree((s) => s.size)
  const shift = useRef(0)
  const since = useRef(REMEASURE_S)
  const box = useMemo(() => new THREE.Box3(), [])
  const corner = useMemo(() => new THREE.Vector3(), [])

  const apply = (next: number) => {
    shift.current = next
    if (next <= 0) {
      // `clearViewOffset` is a no-op when none is set, so this is safe on mount.
      camera.clearViewOffset()
    } else {
      camera.setViewOffset(size.width, size.height, 0, next, size.width, size.height)
    }
    camera.updateProjectionMatrix()
  }

  useEffect(() => {
    if (px <= 0) apply(0)
    // Force a measurement on the next frame rather than measuring here: the
    // panel usually opens while the camera is still flying to a viewpoint, and
    // a single measurement taken mid-flight is simply wrong and then sticks.
    // That is exactly how the lift once reported "not lifted" on a phone while
    // every other check passed.
    since.current = REMEASURE_S
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [px, size.width, size.height])

  useEffect(
    () => () => {
      camera.clearViewOffset()
      camera.updateProjectionMatrix()
    },
    [camera],
  )

  useFrame((_, dt) => {
    if (px <= 0) {
      if (shift.current !== 0) apply(0)
      return
    }
    since.current += dt
    if (since.current < REMEASURE_S) return
    since.current = 0

    const subject = scene.getObjectByName('subject')
    let headroom = Infinity
    if (subject) {
      box.setFromObject(subject)
      if (!box.isEmpty()) {
        // Project all eight corners: the topmost on screen is not always the
        // one with the largest world y once the camera is tilted.
        //
        // Measured through the *current* projection, offset included, then the
        // current shift is added back — that recovers where the subject would
        // sit at rest without clearing and rebuilding the projection matrix
        // twice a second just to ask a question about it.
        let top = Infinity
        for (const x of [box.min.x, box.max.x])
          for (const y of [box.min.y, box.max.y])
            for (const z of [box.min.z, box.max.z]) {
              corner.set(x, y, z).project(camera)
              top = Math.min(top, ((1 - corner.y) / 2) * size.height)
            }
        if (Number.isFinite(top)) headroom = top + shift.current - TOP_MARGIN
      }
    }

    const want = Math.round(Math.max(0, Math.min(px / 2, headroom)))
    if (Math.abs(want - shift.current) > SETTLE_PX) apply(want)
  })

  return null
}

/** Renders the two eyes when Cardboard is on. Nothing at all when it is off. */
function Stereo({ sim }: { sim: SugarSim }) {
  const v = VIEW_BY_ID[sim.viewId]
  return (
    <SharedStereoRig
      view={v ? { label: v.label, position: v.position, target: v.target } : null}
      viewSeq={sim.viewSeq}
    />
  )
}

export default function SugarScene({
  sim,
  stage,
  specimenId,
  habitat,
  obstructBottom = 0,
  gather = null,
  onContextLost,
}: Props) {
  const quality = useQualityCaps()
  const stereo = useStereo()
  const frame = THREE.MathUtils.clamp(
    (SPECIMEN_BY_ID[specimenId]?.build.stemHeight ?? 2.4) / 2.4,
    0.86,
    1.34,
  )
  // Scenery belongs to the whole-plant view only. The other two stages are a
  // chloroplast and a stem section; a landscape behind either would be fiction.
  const outdoors = habitat && stage === 'plant'
  const place = useMemo(() => habitatForSpecimen(specimenId), [specimenId])

  return (
    <Canvas
      dpr={[1, quality.maxDpr]}
      camera={{ fov: 46, near: 0.05, far: 200, position: [0.8, 2.35, 6.9] }}
      gl={{ antialias: getQualityCaps().antialias, powerPreference: 'high-performance' }}
      shadows={quality.shadows ? { type: THREE.PCFSoftShadowMap } : false}
      style={{ position: 'fixed', inset: 0 }}
      onCreated={({ gl, scene, camera }) => {
        // Renderer pipeline first, materials second.
        gl.outputColorSpace = THREE.SRGBColorSpace
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.02
        scene.background = new THREE.Color(ATLAS.paper)
        scene.fog = null
        // A test handle for the scene graph itself. The suites already reach
        // the sim and the model this way; being able to measure where things
        // actually *are* is what turns "the roots look wrong" into a number.
        ;(window as unknown as Record<string, unknown>).__sugarScene = scene
        // The camera is not in the scene graph, and the projection offset that
        // lifts the subject above the controls sheet lives on it. Without this
        // handle "is the plant visible?" is only answerable by eye.
        ;(window as unknown as Record<string, unknown>).__sugarCam = camera
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault()
          onContextLost()
        })
      }}
    >
      <Ticker sim={sim} />
      <PerfProbe cabinet="photosynthesis" />
      <AtlasEnv />
      {outdoors ? (
        <Habitat sim={sim} specimenId={specimenId} />
      ) : (
        <>
          <Backdrop tint={habitat ? place.sky[3] : undefined} />
          <Lights stage={stage} />
        </>
      )}
      <SugarCamera sim={sim} frame={frame} orbit={!gather?.running} />
      {/* Stereo owns the projection matrices per eye; a view offset on the
          shared camera would be applied twice and skew the pair. */}
      {!stereo.on && <SceneLift px={obstructBottom} />}
      {stage === 'plant' && (
        <PlantStage sim={sim} specimenId={specimenId} outdoors={outdoors} gather={gather} />
      )}
      {stage === 'leaf' && <LeafStage sim={sim} />}
      {stage === 'stem' && <StemStage sim={sim} />}
      {stereo.on && <Stereo sim={sim} />}
    </Canvas>
  )
}
