import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { BIOME_BY_ID, LEAF_BY_ID, type BiomeId, type BiomePreset, type LeafPreset } from '@/lib/leaves'
import type { PhotoSim } from '@/lib/photo'
import { registerCamera } from '@/lib/input'
import { EQUATION_VIEW, VIEW_BY_ID } from '@/lib/viewpoints'
import { Co2Molecules, WaterDroplets, OxygenBubbles, GlucoseCubes } from './MoleculeFlows'
import Chloroplast from './Chloroplast'
import BubbleTube from './BubbleTube'
import { glowTexture, leafTexture, leafThicknessTexture, shadowTexture, starburstTexture } from './Sprites'
import { WORLD_PRESETS, WorldState } from '@/lib/world'
import Atmosphere from './world/Atmosphere'
import Terrain from './world/Terrain'
import Grass from './world/Grass'
import Stones from './world/Stones'
import Weather from './world/Weather'
import LightShafts from './world/LightShafts'
import EquationStage from './EquationStage'
import PostFX from './world/PostFX'
import StereoRig from './world/StereoRig'
import { useStereo } from '@/lib/stereo'
import { SUN_DIR, SUN_DISTANCE, SUN_POS, SUN_STATE, SUN_TINT } from '@/lib/sunlight'
import { OCC_SLOT, setOccluder } from '@/lib/occluders'
import { applyContactAO, applyLeafTranslucency, syncSunUniforms } from './world/shading'

/** World-space anchor points shared by everything in the garden. */
export const LEAF_CENTER = new THREE.Vector3(0, 2.55, 0)

/* ------------------------------------------------------------------ */
/* Camera rig: orbits the leaf, or flies inside to meet a chloroplast  */
/* ------------------------------------------------------------------ */

const OVERVIEW_POS = new THREE.Vector3(0.8, 3.1, 8.4)
const OVERVIEW_TARGET = new THREE.Vector3(0, 2.05, 0)
const ZOOM_POS = new THREE.Vector3(0.2, 3.2, 3.4)
const ZOOM_TARGET = new THREE.Vector3(0, 2.8, 0.45)

export const MIN_ORBIT = 1.6
export const MAX_ORBIT = 36

interface OrbitLike {
  target: THREE.Vector3
  autoRotate: boolean
  autoRotateSpeed: number
  update: () => void
}

/**
 * Camera rig.
 *
 * The previous version lerped toward a fixed viewpoint on *every* frame, which
 * quietly fought the user: you could orbit, but the rig dragged you straight
 * back. Scripted movement now runs only for a short window after an explicit
 * request (zooming into a chloroplast, or pressing reset); the rest of the
 * time OrbitControls owns the camera completely, so you can orbit a full 360°
 * and dolly freely.
 */
function GardenCamera({ sim }: { sim: PhotoSim }) {
  const stereo = useStereo()
  const controls = useThree((s) => s.controls) as OrbitLike | null
  const camera = useThree((s) => s.camera)
  const mounted = useRef(false)
  const lastZoomed = useRef(sim.zoomed)
  const lastReset = useRef(sim.viewReset)
  const lastViewSeq = useRef(sim.viewSeq)
  const lastEquation = useRef(sim.equationOpen)
  const flyPos = useMemo(() => new THREE.Vector3().copy(OVERVIEW_POS), [])
  const flyTarget = useMemo(() => new THREE.Vector3().copy(OVERVIEW_TARGET), [])
  /**
   * A flight is a GSAP-eased progress 0→1 along a gently arched path from
   * where the camera *is* to the destination — anticipation, ease-in, ease-out,
   * the way a camera operator moves — rather than an exponential slide.
   */
  const flight = useMemo(
    () => ({
      t: 1,
      duration: 1.6,
      active: false,
      fromPos: new THREE.Vector3(),
      fromTarget: new THREE.Vector3(),
      arc: 0,
    }),
    [],
  )
  // power2.inOut — the same curve GSAP calls by that name; driven from the
  // frame loop so it stays in lock-step with the render.
  const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)
  const startFlight = (seconds: number, arc = 0.6) => {
    flight.fromPos.copy(camera.position)
    flight.fromTarget.copy(controls ? controls.target : OVERVIEW_TARGET)
    flight.arc = arc * Math.min(1, flight.fromPos.distanceTo(flyPos) / 6)
    flight.t = 0
    flight.duration = seconds
    flight.active = true
  }
  const offset = useMemo(() => new THREE.Vector3(), [])
  const spherical = useMemo(() => new THREE.Spherical(), [])
  /** Orbit deltas queued by the input model (right stick, keyboard); drained each frame. */
  const pendingOrbit = useRef({ dx: 0, dy: 0 })

  // The input model's orbit/zoom actions feed the same rig the mouse drives:
  // deltas are queued and applied once per frame, so nothing fights OrbitControls.
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
    // Wait for OrbitControls to register itself before claiming the framing is
    // set. Flipping this flag on frame one left the orbit target at the world
    // origin, which quietly aimed the camera at the ground below the plant.
    if (!mounted.current) {
      if (!controls) return
      camera.position.copy(OVERVIEW_POS)
      controls.target.copy(OVERVIEW_TARGET)
      controls.update()
      mounted.current = true
      return
    }

    // Authored flights: a viewpoint request, the equation stage opening or
    // closing, the chloroplast zoom, or a reset. Each sets a destination and a
    // short window; after the window OrbitControls owns the camera again.
    let requested = false
    if (sim.viewSeq !== lastViewSeq.current) {
      lastViewSeq.current = sim.viewSeq
      const v = VIEW_BY_ID[sim.viewId]
      if (v) {
        flyPos.set(...v.position)
        flyTarget.set(...v.target)
        startFlight(1.7)
        requested = true
      }
    }
    if (sim.equationOpen !== lastEquation.current) {
      lastEquation.current = sim.equationOpen
      if (sim.equationOpen) {
        // Portrait screens see a narrower wedge: back off so the whole stage fits.
        const aspect = (camera as THREE.PerspectiveCamera).aspect || 1
        const back = THREE.MathUtils.clamp(1.6 / aspect, 1, 2.6)
        flyPos.set(EQUATION_VIEW.position[0], EQUATION_VIEW.position[1] + (back - 1) * 0.3, EQUATION_VIEW.position[2] * back)
        flyTarget.set(...EQUATION_VIEW.target)
      } else {
        flyPos.copy(OVERVIEW_POS)
        flyTarget.copy(OVERVIEW_TARGET)
      }
      startFlight(1.9, 0.9)
    }
    if (sim.zoomed !== lastZoomed.current) {
      lastZoomed.current = sim.zoomed
      // A viewpoint request in the same frame already chose the destination.
      if (!requested) {
        if (sim.zoomed) {
          flyPos.copy(ZOOM_POS)
          flyTarget.copy(ZOOM_TARGET)
        } else if (!sim.equationOpen) {
          flyPos.copy(OVERVIEW_POS)
          flyTarget.copy(OVERVIEW_TARGET)
        }
        startFlight(1.5, 0.3)
      }
    }
    if (sim.viewReset !== lastReset.current) {
      lastReset.current = sim.viewReset
      flyPos.copy(OVERVIEW_POS)
      flyTarget.copy(OVERVIEW_TARGET)
      startFlight(1.3, 0.5)
    }

    if (flight.active) {
      flight.t = Math.min(1, flight.t + rawDt / flight.duration)
      const t = easeInOut(flight.t)
      if (flight.t >= 1) flight.active = false
      camera.position.lerpVectors(flight.fromPos, flyPos, t)
      camera.position.y += Math.sin(t * Math.PI) * flight.arc
      if (controls) controls.target.lerpVectors(flight.fromTarget, flyTarget, t)
    }

    // Orbit requests from a controller stick or the keyboard.
    const po = pendingOrbit.current
    if (controls && (po.dx !== 0 || po.dy !== 0)) {
      offset.copy(camera.position).sub(controls.target)
      spherical.setFromVector3(offset)
      spherical.theta -= po.dx
      spherical.phi = THREE.MathUtils.clamp(spherical.phi + po.dy, 0.06, Math.PI * 0.86)
      offset.setFromSpherical(spherical)
      camera.position.copy(controls.target).add(offset)
      po.dx = 0
      po.dy = 0
      flight.active = false
    }

    // Dolly requests from the on-screen zoom buttons.
    if (controls && sim.viewZoom !== 0) {
      offset.copy(camera.position).sub(controls.target)
      const distance = offset.length()
      const next = THREE.MathUtils.clamp(distance * (1 + sim.viewZoom), MIN_ORBIT, MAX_ORBIT)
      offset.setLength(next)
      camera.position.copy(controls.target).add(offset)
      sim.viewZoom = 0
      // A manual dolly means the learner has taken over.
      flight.active = false
    }

    // In stereo the head owns orientation; OrbitControls.update() would re-aim
    // the camera at its target every frame.
    if (controls && !stereo.on) {
      controls.autoRotate = sim.autoOrbit
      controls.autoRotateSpeed = 0.9
      controls.update()
    }
  })

  return (
    <OrbitControls
      makeDefault
      enabled={!stereo.on}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={MIN_ORBIT}
      maxDistance={MAX_ORBIT}
      // Nearly the full vertical sweep — overhead down to just above ground
      // level, stopping short of putting the camera underneath the world.
      minPolarAngle={0.06}
      maxPolarAngle={Math.PI * 0.86}
      zoomSpeed={0.9}
      rotateSpeed={0.85}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Sky + lighting: tinted by the climate, dimmed by the light slider   */
/* ------------------------------------------------------------------ */

/**
 * Drives the interpolated world state from the biome preset and the light
 * slider, and moves the sun with it. Everything atmospheric reads `world`.
 */
function WorldDriver({ sim, world, biome }: { sim: PhotoSim; world: WorldState; biome: BiomePreset }) {
  const dir = useMemo(() => new THREE.Vector3(), [])
  // The things near the subject that block sky light. Static, so they are
  // declared once; the apparatus registers itself as it rises.
  useEffect(() => {
    setOccluder(OCC_SLOT.mound, 0, -0.32, 0, 1.2, 0.7)
    setOccluder(OCC_SLOT.stem, 0, 0.45, 0, 0.42, 0.45)
    setOccluder(OCC_SLOT.canopy, 0, 2.35, 0, 1.1, 0.32)
  }, [])
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const k = 1 - Math.exp(-dt * 2.2)
    world.step(WORLD_PRESETS[biome.id], sim.light, k)
    world.sunDirection(dir)
    SUN_DIR.copy(dir)
    SUN_POS.copy(dir).multiplyScalar(SUN_DISTANCE)
    SUN_TINT.copy(world.sun).lerp(new THREE.Color('#FFE27A'), 0.35 * world.daylight)
    SUN_STATE.daylight = world.daylight
    syncSunUniforms(sim.light)
  })
  return null
}

/**
 * The patch of ground an object sits on.
 *
 * Not a fixed blob: it stretches away from the sun and softens as the sun
 * drops, so the plant stays planted whichever way the light slider is pushed.
 * The shadow map handles the crisp shape; this is the ambient darkening
 * underneath that a shadow map alone never gives you.
 */
function ContactShadow({
  position,
  radius,
}: {
  position: [number, number, number]
  radius: number
}) {
  const texture = useMemo(() => shadowTexture(), [])
  const ref = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.MeshBasicMaterial>(null)
  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    // Ground-projected sun direction: the patch leans the opposite way.
    const azimuth = Math.atan2(SUN_DIR.x, SUN_DIR.z)
    const elevation = Math.max(0.08, SUN_DIR.y)
    const stretch = THREE.MathUtils.clamp(1 / (elevation + 0.55), 1, 1.7)
    mesh.rotation.set(-Math.PI / 2, 0, azimuth)
    mesh.scale.set(1, stretch, 1)
    mesh.position.set(
      position[0] - SUN_DIR.x * radius * (stretch - 1) * 0.45,
      position[1],
      position[2] - SUN_DIR.z * radius * (stretch - 1) * 0.45,
    )
    if (matRef.current) matRef.current.opacity = 0.22 + SUN_STATE.daylight * 0.3
  })
  return (
    <mesh ref={ref} position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[radius * 2, radius * 2]} />
      <meshBasicMaterial ref={matRef} map={texture} transparent depthWrite={false} fog={false} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ */
/* Leaf shapes — one per morphology                                    */
/* ------------------------------------------------------------------ */

function makeLeafGeometry(length: number, width: number): THREE.ShapeGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.bezierCurveTo(width * 0.62, length * 0.18, width * 0.6, length * 0.62, 0, length)
  shape.bezierCurveTo(-width * 0.6, length * 0.62, -width * 0.62, length * 0.18, 0, 0)
  const geo = new THREE.ShapeGeometry(shape, 28)
  // Cup the leaf slightly: lift edges up along z; a gentle arch along its length.
  const pos = geo.attributes.position
  const uv = geo.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    pos.setZ(i, Math.abs(x) * 0.12 + Math.sin((y / length) * Math.PI) * 0.06)
    // UVs in leaf space: u across the width, v along the length (tip = 1).
    uv.setXY(i, 0.5 + x / (width * 1.3), y / length)
  }
  uv.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

/** A flattened ellipsoid, baked once — the succulent pad's body. */
const padGeometry = (() => {
  const geo = new THREE.SphereGeometry(1, 22, 18)
  geo.scale(1.05, 1.4, 0.4)
  geo.computeVertexNormals()
  return geo
})()

/** Spine positions dotted across the front face of the pad. */
const SPINES: Array<[number, number, number]> = (() => {
  const out: Array<[number, number, number]> = []
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 4; col++) {
      const x = (col - 1.5) * 0.46
      const y = (row - 2) * 0.58
      const inside = 1 - (x / 1.05) ** 2 - (y / 1.4) ** 2
      if (inside <= 0.08) continue
      out.push([x, y, 0.4 * Math.sqrt(inside) + 0.06])
    }
  }
  return out
})()

/**
 * The specimen's shape is not decoration — it IS the adaptation. A rainforest
 * blade is enormous and paper-thin because light is scarce; a needle and a
 * succulent pad are small and thick because water is scarce. Same machinery
 * inside, completely different hardware around it.
 */
function LeafShape({
  leaf,
  matRef,
}: {
  leaf: LeafPreset
  matRef: React.RefObject<THREE.MeshPhysicalMaterial | null>
}) {
  const length = leaf.form === 'blade' ? 5.2 : 3.6 * Math.sqrt(leaf.leafArea)
  const geo = useMemo(() => {
    if (leaf.form === 'blade') return makeLeafGeometry(5.2, 0.78)
    return makeLeafGeometry(3.6 * Math.sqrt(leaf.leafArea), 2.3 * Math.sqrt(leaf.leafArea))
  }, [leaf.form, leaf.leafArea])

  const roughness = leaf.cuticle > 0.7 ? 0.25 : 0.6

  // The specimen blade is built imperatively rather than in JSX because it
  // carries a shader patch (translucency), and a patched material has to be
  // created once rather than reconciled every render.
  const thickness = useMemo(() => leafThicknessTexture(), [])
  const bladeMat = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      color: '#FFFFFF',
      map: leafTexture(leaf.colors.leaf, leaf.colors.accent),
      roughness,
      sheen: 0.55,
      sheenRoughness: 0.6,
      sheenColor: new THREE.Color('#B9E58A'),
      side: THREE.DoubleSide,
      transparent: true,
    })
    // A waxy cuticle passes less light than a thin rainforest lamina.
    applyLeafTranslucency(m, thickness, 'blade', 1.15 - leaf.cuticle * 0.35)
    return m
  }, [leaf.colors.leaf, leaf.colors.accent, leaf.cuticle, roughness, thickness])
  useEffect(() => {
    matRef.current = bladeMat
    return () => {
      bladeMat.dispose()
    }
  }, [bladeMat, matRef])

  if (leaf.form === 'needle') {
    // A fascicle of needles: almost no surface area, thickly waxed.
    return (
      <group position={[0, 0.55, 0]}>
        {Array.from({ length: 9 }, (_, i) => {
          const a = (i / 9) * Math.PI * 1.6 - Math.PI * 0.8
          return (
            <mesh
              key={i}
              position={[Math.sin(a) * 0.5, 0.5 + Math.cos(a) * 0.25, Math.sin(a * 1.7) * 0.18]}
              rotation={[0.12, 0, -a * 0.85]}
            >
              <cylinderGeometry args={[0.028, 0.05, 2.1, 6]} />
              <meshStandardMaterial
                ref={i === 0 ? matRef : undefined}
                color={leaf.colors.leaf}
                roughness={roughness}
                transparent
              />
            </mesh>
          )
        })}
      </group>
    )
  }

  if (leaf.form === 'pad') {
    // A succulent pad: a fat water store with spines instead of leaves.
    // The flattening lives in the geometry rather than a `scale` prop, so the
    // mesh keeps a clean unit transform like every other shape here.
    return (
      <group position={[0, 1.15, 0]}>
        <mesh geometry={padGeometry}>
          <meshStandardMaterial
            ref={matRef}
            color={leaf.colors.leaf}
            roughness={roughness}
            transparent
          />
        </mesh>
        {SPINES.map((s, i) => (
          <mesh key={i} position={s} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.035, 0.3, 5]} />
            <meshStandardMaterial color="#EFE2C0" roughness={0.7} />
          </mesh>
        ))}
      </group>
    )
  }

  return (
    <group>
      <mesh geometry={geo} material={bladeMat} castShadow />
      {/* Midrib */}
      <mesh position={[0, length * 0.5, 0.04]}>
        <cylinderGeometry args={[0.032, 0.065, length * 0.92, 8]} />
        <meshStandardMaterial color={leaf.colors.accent} roughness={0.7} />
      </mesh>
      {/* Rainforest leaves shed rain from a pointed drip tip. */}
      {leaf.id === 'rainforest' && (
        <mesh position={[0, length + 0.22, 0]} rotation={[0, 0, Math.PI]}>
          <coneGeometry args={[0.15, 0.6, 8]} />
          <meshStandardMaterial color={leaf.colors.leaf} roughness={0.6} />
        </mesh>
      )}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* The plant                                                           */
/* ------------------------------------------------------------------ */

/** A tube whose radius tapers along the curve — stems and petioles. */
function taperedTube(curve: THREE.Curve<THREE.Vector3>, segs: number, radial: number, r0: number, r1: number) {
  const frames = curve.computeFrenetFrames(segs, false)
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const index: number[] = []
  const P = new THREE.Vector3()
  const N = new THREE.Vector3()
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    curve.getPointAt(t, P)
    const r = r0 + (r1 - r0) * t
    for (let j = 0; j <= radial; j++) {
      const v = (j / radial) * Math.PI * 2
      const sin = Math.sin(v)
      const cos = -Math.cos(v)
      N.set(cos * frames.normals[i].x + sin * frames.binormals[i].x, cos * frames.normals[i].y + sin * frames.binormals[i].y, cos * frames.normals[i].z + sin * frames.binormals[i].z)
      normals.push(N.x, N.y, N.z)
      positions.push(P.x + r * N.x, P.y + r * N.y, P.z + r * N.z)
      uvs.push(j / radial, t)
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j
      const b = a + radial + 1
      index.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(index)
  return geo
}

/** Side leaves in a phyllotactic spiral: height along the stem, azimuth, size, droop. */
const SIDE_LEAVES = [0.85, 1.25, 1.62, 1.98, 2.28].map((h, i) => ({
  h,
  az: (i * 137.5 * Math.PI) / 180 + 0.6,
  size: 1.05 - i * 0.12,
  droop: 0.55 + i * 0.05,
}))

/**
 * The plant. A tapered stem on a gentle S-curve, a spiral of petiolate side
 * leaves that shrink toward the top, and the specimen leaf mounted at the tip.
 * Wilt lowers everything and shrinks the pad; a leaf between the camera and
 * the sun glows a little from behind, because a real leaf is translucent.
 */
function Plant({ sim, leaf }: { sim: PhotoSim; leaf: LeafPreset }) {
  const swayRef = useRef<THREE.Group>(null)
  const leafGroupRef = useRef<THREE.Group>(null)
  const leafMatRef = useRef<THREE.MeshPhysicalMaterial>(null)
  const leafTex = useMemo(() => leafTexture(leaf.colors.leaf, leaf.colors.accent), [leaf.colors.leaf, leaf.colors.accent])
  const sideMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map: leafTex, roughness: 0.58, side: THREE.DoubleSide, emissiveIntensity: 0 })
    applyLeafTranslucency(m, leafThicknessTexture(), 'side', 0.95)
    return m
  }, [leafTex])
  const moundMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#6E4630', roughness: 1 })
    applyContactAO(m, 'mound', 0.5)
    return m
  }, [])
  const sideMatRef = useRef<THREE.MeshStandardMaterial>(sideMat)
  sideMatRef.current = sideMat
  const healthy = useMemo(() => new THREE.Color(leaf.colors.leaf), [leaf.colors.leaf])
  const dried = useMemo(() => new THREE.Color(leaf.colors.leafDry), [leaf.colors.leafDry])
  const scratch = useMemo(() => new THREE.Color(), [])
  const tint = useMemo(() => new THREE.Color(), [])
  const tmp = useMemo(() => ({ toCam: new THREE.Vector3(), sun: new THREE.Vector3() }), [])

  const stemCurve = useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -0.15, 0),
        new THREE.Vector3(0.14, 0.7, 0.05),
        new THREE.Vector3(-0.08, 1.55, -0.03),
        new THREE.Vector3(0.02, 2.5, 0),
      ]),
    [],
  )
  const stemGeo = useMemo(() => taperedTube(stemCurve, 40, 12, 0.19, 0.075), [stemCurve])
  const petiole = useMemo(() => {
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.22, 0.06, 0), new THREE.Vector3(0.44, 0.02, 0)])
    return taperedTube(c, 8, 8, 0.045, 0.028)
  }, [])
  const smallLeafGeo = useMemo(() => makeLeafGeometry(1.5, 1.0), [])
  const isFlat = leaf.form === 'broad' || leaf.form === 'blade'
  const restRotation = isFlat ? -Math.PI / 2.4 : 0
  const showSideLeaves = isFlat

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    if (!swayRef.current) return
    const t = sim.time
    const vigour = 0.3 + sim.turgor * 0.7
    swayRef.current.rotation.z = Math.sin(t * 0.7) * 0.035 * vigour
    swayRef.current.rotation.x = Math.sin(t * 0.5 + 1.3) * 0.02 * vigour

    const wilt = 1 - sim.turgor
    if (leafGroupRef.current) {
      const droop = restRotation + wilt * (isFlat ? 0.6 : 0.22)
      leafGroupRef.current.rotation.x += (droop - leafGroupRef.current.rotation.x) * (1 - Math.exp(-dt * 2.5))
      const shrink = 1 - wilt * (isFlat ? 0.06 : 0.22)
      leafGroupRef.current.scale.setScalar(leafGroupRef.current.scale.x + (shrink - leafGroupRef.current.scale.x) * (1 - Math.exp(-dt * 2)))
    }
    // Colour: fresh → dried with wilt; the map supplies the detail, so this tints.
    scratch.copy(healthy).lerp(dried, Math.min(1, wilt * 1.15))
    tint.set('#FFFFFF').lerp(scratch, Math.min(1, wilt * 1.15) * 0.75)
    // Backlight: camera looking through the leaf toward the sun.
    tmp.toCam.copy(state.camera.position).sub(LEAF_CENTER).normalize()
    tmp.sun.copy(SUN_POS).normalize()
    const backlit = Math.max(0, -tmp.toCam.dot(tmp.sun)) * sim.light * SUN_STATE.daylight
    // The shader now scatters real light through the lamina, so the old
    // whole-leaf emissive lift is only a floor under it — enough to keep the
    // needle and pad forms (which have no thickness map) reading translucent.
    if (leafMatRef.current) {
      const m = leafMatRef.current
      m.color.lerp(tint, 1 - Math.exp(-dt * 2))
      m.emissive.copy(healthy).multiplyScalar(0.55)
      const lift = isFlat ? 0.22 : 0.85
      m.emissiveIntensity += (backlit * lift - m.emissiveIntensity) * (1 - Math.exp(-dt * 4))
      const targetOpacity = sim.zoomed || sim.equationOpen ? 0.14 : 1
      m.opacity += (targetOpacity - m.opacity) * (1 - Math.exp(-dt * 4))
    }
    if (sideMatRef.current) {
      sideMatRef.current.color.lerp(tint, 1 - Math.exp(-dt * 2))
      sideMatRef.current.emissive.copy(healthy).multiplyScalar(0.55)
      sideMatRef.current.emissiveIntensity += (backlit * 0.15 - sideMatRef.current.emissiveIntensity) * (1 - Math.exp(-dt * 4))
    }
  })

  return (
    <group>
      {/* Soil mound */}
      <mesh position={[0, -0.35, 0]} scale={[1.6, 0.55, 1.6]} material={moundMat} receiveShadow>
        <sphereGeometry args={[1.2, 28, 18]} />
      </mesh>
      <group ref={swayRef}>
        <mesh geometry={stemGeo} castShadow>
          <meshStandardMaterial color={leaf.colors.accent} roughness={0.72} />
        </mesh>
        <group ref={leafGroupRef} position={[0.02, 2.5, 0]} rotation={[restRotation, 0, isFlat ? 0.12 : 0]}>
          <LeafShape leaf={leaf} matRef={leafMatRef} />
        </group>
        {showSideLeaves &&
          SIDE_LEAVES.map((sl, i) => {
            const p = stemCurve.getPointAt(Math.min(1, (sl.h + 0.15) / 2.65))
            return (
              <group key={i} position={[p.x, p.y, p.z]} rotation={[0, sl.az, 0]}>
                <mesh geometry={petiole} castShadow>
                  <meshStandardMaterial color={leaf.colors.accent} roughness={0.75} />
                </mesh>
                <group position={[0.44, 0.02, 0]} rotation={[0, -Math.PI / 2, -sl.droop]} scale={sl.size}>
                  <mesh geometry={smallLeafGeo} material={sideMat} castShadow />
                </group>
              </group>
            )
          })}
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* The sun, and the sunlight falling onto the leaf                     */
/* ------------------------------------------------------------------ */

/**
 * A clean, stylised sun: a bright disc inside a soft halo. The old version had
 * eight spinning boxes around it, which read as clutter rather than light.
 */
function Sun({ sim }: { sim: PhotoSim }) {
  const coreRef = useRef<THREE.Mesh>(null)
  const haloRef = useRef<THREE.Mesh>(null)
  const halo = useMemo(
    () => glowTexture('rgba(255, 244, 190, 0.95)', 'rgba(255, 214, 110, 0.30)', 'sun'),
    [],
  )

  useFrame((state) => {
    const t = sim.time
    const breathe = 1 + Math.sin(t * 1.6) * 0.025
    if (coreRef.current) {
      coreRef.current.scale.setScalar(breathe * (0.82 + sim.light * 0.26))
      ;(coreRef.current.material as THREE.MeshBasicMaterial).color.copy(SUN_TINT)
    }
    if (haloRef.current) {
      haloRef.current.quaternion.copy(state.camera.quaternion)
      const s = (3.6 + sim.light * 2.6) * breathe * (1.25 - SUN_STATE.daylight * 0.25)
      haloRef.current.scale.set(s, s, s)
      const mat = haloRef.current.material as THREE.MeshBasicMaterial
      mat.opacity = 0.28 + sim.light * 0.42
      mat.color.copy(SUN_TINT)
    }
  })

  const groupRef = useRef<THREE.Group>(null)
  useFrame(() => {
    if (groupRef.current) groupRef.current.position.copy(SUN_POS)
  })

  return (
    <group ref={groupRef}>
      <mesh ref={haloRef}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={halo} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={coreRef}>
        <sphereGeometry args={[1.15, 28, 20]} />
        <meshBasicMaterial color="#FFE27A" toneMapped={false} />
      </mesh>
    </group>
  )
}

const SPARK_LANES = 7
const SPARKS_PER_LANE = 5
const SPARK_TOTAL = SPARK_LANES * SPARKS_PER_LANE

/**
 * Sunlight as orderly falling starbursts.
 *
 * Sparks are grouped into fixed lanes running from the sun down to the leaf,
 * evenly spaced within each lane and travelling at a steady speed — so they
 * drop in tidy columns, the way icicles hang and fall, instead of scattering
 * everywhere. Brighter light adds lanes rather than making the existing ones
 * busier, which keeps the scene readable at every setting.
 */
function SunSparks({ sim }: { sim: PhotoSim }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const texture = useMemo(() => starburstTexture(), [])

  const lanes = useMemo(
    () =>
      Array.from({ length: SPARK_LANES }, (_, i) => ({
        start: new THREE.Vector3(),
        end: new THREE.Vector3(),
        phase: i * 0.37,
      })),
    [],
  )
  const basis = useMemo(
    () => ({ forward: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), Y: new THREE.Vector3(0, 1, 0) }),
    [],
  )

  const progress = useRef(0)

  useFrame((state, rawDt) => {
    const mesh = meshRef.current
    if (!mesh) return
    const dt = Math.min(rawDt, 0.05)
    const camera = state.camera

    // Lanes follow the live sun: fan them evenly across the beam.
    basis.forward.subVectors(LEAF_CENTER, SUN_POS).normalize()
    basis.right.crossVectors(basis.forward, basis.Y).normalize()
    basis.up.crossVectors(basis.right, basis.forward).normalize()
    for (let i = 0; i < SPARK_LANES; i++) {
      const spread = (i - (SPARK_LANES - 1) / 2) / ((SPARK_LANES - 1) / 2)
      lanes[i].start
        .copy(SUN_POS)
        .addScaledVector(basis.right, spread * 1.15)
        .addScaledVector(basis.up, Math.abs(spread) * 0.35 - 0.2)
      lanes[i].end.copy(LEAF_CENTER).addScaledVector(basis.right, spread * 1.05).addScaledVector(basis.up, 0.05)
    }
    if (sim.started && !sim.paused) progress.current += dt * (0.16 + sim.light * 0.3)

    // Light level decides how many lanes are lit, never how chaotic they are.
    const activeLanes = Math.max(1, Math.round(SPARK_LANES * sim.light))

    for (let lane = 0; lane < SPARK_LANES; lane++) {
      const l = lanes[lane]
      for (let k = 0; k < SPARKS_PER_LANE; k++) {
        const index = lane * SPARKS_PER_LANE + k
        if (lane >= activeLanes) {
          dummy.scale.setScalar(0)
          dummy.updateMatrix()
          mesh.setMatrixAt(index, dummy.matrix)
          continue
        }
        // Evenly spaced along the lane, all moving together.
        const t = (progress.current + l.phase + k / SPARKS_PER_LANE) % 1
        position.lerpVectors(l.start, l.end, t)
        // Fade in as it leaves the sun and out as it reaches the leaf.
        const fade = Math.min(1, t * 6) * Math.min(1, (1 - t) * 14)
        const twinkle = 0.82 + Math.sin(sim.time * 5 + index * 1.7) * 0.18
        dummy.position.copy(position)
        dummy.quaternion.copy(camera.quaternion)
        // Grow a little on the way down, so arriving light feels like it lands.
        const growth = 0.86 + t * 0.3
        dummy.scale.setScalar((0.3 + sim.light * 0.18) * fade * twinkle * growth)
        dummy.updateMatrix()
        mesh.setMatrixAt(index, dummy.matrix)
      }
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, SPARK_TOTAL]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </instancedMesh>
  )
}

/**
 * Slow drifting motes. They are not decoration: dust is how you *see* a beam
 * of light, so a mote is dim across the light and bright when you look into
 * it — the same reason a sunbeam appears in a dusty room and nowhere else.
 */
function Pollen({ sim }: { sim: PhotoSim }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const matRef = useRef<THREE.MeshBasicMaterial>(null)
  const toSun = useMemo(() => new THREE.Vector3(), [])
  const fwd = useMemo(() => new THREE.Vector3(), [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const motes = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        x: ((i * 7919) % 100) / 100 * 14 - 7,
        y: ((i * 6271) % 100) / 100 * 4 + 0.4,
        z: ((i * 5387) % 100) / 100 * 8 - 4,
        phase: (i * 1.7) % (Math.PI * 2),
      })),
    [],
  )

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh) return
    const t = sim.time
    // Backlit dust: bright looking into the sun, nearly invisible away from it.
    toSun.subVectors(SUN_POS, state.camera.position).normalize()
    state.camera.getWorldDirection(fwd)
    const glow = Math.pow(Math.max(0, fwd.dot(toSun)), 2.2) * sim.light * SUN_STATE.daylight
    if (matRef.current) matRef.current.opacity = 0.16 + glow * 0.7
    const size = 0.035 + glow * 0.03
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i]
      dummy.position.set(
        m.x + Math.sin(t * 0.22 + m.phase) * 0.5,
        m.y + Math.sin(t * 0.3 + m.phase * 1.4) * 0.35,
        m.z + Math.cos(t * 0.19 + m.phase) * 0.4,
      )
      dummy.quaternion.copy(state.camera.quaternion)
      dummy.scale.setScalar(size + Math.sin(t * 1.6 + m.phase) * 0.012)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, 26]} frustumCulled={false}>
      <circleGeometry args={[1, 8]} />
      <meshBasicMaterial ref={matRef} color="#FFF6DA" transparent opacity={0.5} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  )
}


const SHIMMER_COUNT = 36

/** Heat haze, but only when the air is genuinely hot AND dry. */
function HeatShimmer({ sim }: { sim: PhotoSim }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const seeds = useMemo(
    () =>
      Array.from({ length: SHIMMER_COUNT }, () => ({
        x: (Math.random() - 0.5) * 16,
        z: (Math.random() - 0.5) * 12,
        t: Math.random(),
        speed: 0.2 + Math.random() * 0.3,
      })),
    [],
  )

  useFrame((_, rawDt) => {
    const mesh = meshRef.current
    if (!mesh) return
    const dt = Math.min(rawDt, 0.05)
    const strength =
      Math.max(0, Math.min(1, (sim.tempC - 30) / 14)) * Math.max(0, 1 - sim.humidity * 1.2)
    const active = Math.round(SHIMMER_COUNT * strength)
    for (let i = 0; i < SHIMMER_COUNT; i++) {
      const s = seeds[i]
      if (i < active) {
        s.t += dt * s.speed
        if (s.t > 1) s.t = 0
        dummy.position.set(s.x, -0.5 + s.t * 2.4, s.z)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(0.5 + s.t * 0.6, 0.035, 0.5)
      } else {
        dummy.scale.setScalar(0)
      }
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, SHIMMER_COUNT]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color="#FFF3D8" transparent opacity={0.17} depthWrite={false} />
    </instancedMesh>
  )
}

/* ------------------------------------------------------------------ */
/* Composed garden world                                               */
/* ------------------------------------------------------------------ */

interface GardenProps {
  sim: PhotoSim
  /** React-state mirror of sim.zoomed so this component re-renders. */
  zoomed: boolean
  /** React-state mirror of sim.equationOpen. */
  equationOpen: boolean
  leafId: string
  biomeId: string
  onChloroplastFact: () => void
}

/** The stylised world: climate, specimen, apparatus, and all the molecule flows. */
export default function GardenWorld({
  sim,
  zoomed,
  equationOpen,
  leafId,
  biomeId,
  onChloroplastFact,
}: GardenProps) {
  const leaf = LEAF_BY_ID[leafId] ?? LEAF_BY_ID.temperate
  const biome = BIOME_BY_ID[biomeId as BiomeId] ?? BIOME_BY_ID.temperate
  const world = useMemo(() => new WorldState(), [])
  const stereo = useStereo()

  return (
    <group>
      <WorldDriver sim={sim} world={world} biome={biome} />
      <Atmosphere sim={sim} world={world} />
      <GardenCamera sim={sim} />
      <Terrain world={world} />
      <Grass sim={sim} world={world} />
      <Stones world={world} />
      <Weather sim={sim} world={world} />
      <ContactShadow position={[0, -0.6, 0]} radius={2.6} />
      <Plant sim={sim} leaf={leaf} />
      <BubbleTube sim={sim} position={[2.5, 0.92, 0.6]} />
      <Sun sim={sim} />
      <LightShafts sim={sim} world={world} />
      <SunSparks sim={sim} />
      <Pollen sim={sim} />
      <HeatShimmer sim={sim} />
      <group visible={!equationOpen}>
        <Co2Molecules sim={sim} />
        <WaterDroplets sim={sim} />
        <OxygenBubbles sim={sim} />
        <GlucoseCubes sim={sim} />
      </group>
      {zoomed && !equationOpen && <Chloroplast sim={sim} onFact={onChloroplastFact} />}
      {equationOpen && <EquationStage sim={sim} />}
      {stereo.on ? <StereoRig sim={sim} /> : <PostFX />}
    </group>
  )
}
