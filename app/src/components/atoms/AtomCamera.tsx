import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { registerCamera } from '@/lib/input'
import type { AtomSim, AtomViewId } from '@/lib/atoms'

/** Authored shots for the Atom Foundry. */
export interface AtomViewpoint {
  id: AtomViewId
  label: string
  hint: string
  position: [number, number, number]
  target: [number, number, number]
}

export const ATOM_VIEWS: AtomViewpoint[] = [
  { id: 'overview', label: 'Foundry', hint: 'The whole foundry: stage, launchers and the wall.', position: [0, 2.5, 7.8], target: [0, 1.6, -0.6] },
  { id: 'stage', label: 'Atom', hint: 'Up close with the atom on the build stage.', position: [1.7, 2.2, 3.1], target: [0, 1.9, 0] },
  { id: 'wall', label: 'Wall', hint: 'Face the periodic table wall.', position: [0, 2.3, 1.7], target: [0, 2.3, -5.6] },
]

/**
 * Door 2's shot.
 *
 * The stages are places in one room, so the camera moves and the workshop does
 * not. The bench's subjects are low and close together — two atoms on pads and
 * a jar behind them — so this shot stands nearer and looks further down than
 * the forge's, which was framed for an atom floating at chest height.
 */
const BENCH_VIEW: AtomViewpoint = {
  id: 'overview',
  label: 'Bench',
  hint: 'The two pads and the jar.',
  position: [0, 2.35, 6.4],
  target: [0, 0.95, -0.3],
}

const PHONE_BENCH_VIEW: AtomViewpoint = {
  ...BENCH_VIEW,
  position: [0, 2.4, 6.9],
  target: [0, 1.3, -0.3],
}

/**
 * The phone's own overview.
 *
 * A phone held sideways is 844 x 390: the same shot that composes on a desktop
 * puts a postage-stamp atom in the middle of a room nobody can see.
 *
 * The magnification is not done here, though — `setViewOffset` below already
 * frames a taller picture and shows the lower window of it, which crops in by
 * about a third on its own. Moving the camera closer as well was too much of
 * both, and put the atom behind the tab bar. So the phone stands where the
 * desktop stands, a touch further back, and only the *aim* changes: it looks
 * a little higher, which drops the atom off the top edge and into the clear
 * band between the tabs and Ploob's line.
 */
const PHONE_OVERVIEW: AtomViewpoint = {
  ...ATOM_VIEWS[0],
  position: [0, 2.6, 8.4],
  target: [0, 2.28, -0.5],
}
export const ATOM_VIEW_BY_ID: Record<string, AtomViewpoint> = Object.fromEntries(ATOM_VIEWS.map((v) => [v.id, v]))


export const MIN_ORBIT = 1.1
export const MAX_ORBIT = 24

interface OrbitLike {
  target: THREE.Vector3
  autoRotate: boolean
  autoRotateSpeed: number
  update: () => void
}

/**
 * Same rig discipline as the yard: scripted movement only for a short window
 * after an explicit request; the rest of the time OrbitControls owns the
 * camera. Waits for OrbitControls to register before framing.
 */
export default function AtomCamera({
  sim,
  phone = false,
  hudBottom = 0,
  bench = false,
}: {
  sim: AtomSim
  phone?: boolean
  hudBottom?: number
  /** True on a Door 2 level: the bench's own shot rather than the forge's. */
  bench?: boolean
}) {
  const controls = useThree((s) => s.controls) as OrbitLike | null
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const OVERVIEW = bench ? (phone ? PHONE_BENCH_VIEW : BENCH_VIEW) : phone ? PHONE_OVERVIEW : ATOM_VIEWS[0]

  /**
   * Compose above the HUD, not behind it.
   *
   * The canvas is the whole screen but the bottom strip of it is under the
   * tray and Ploob's line, so anything the camera centres there is furniture
   * the player never sees. `setViewOffset` frames as if the picture were
   * `hudBottom` pixels taller and then shows the lower window of it: the shot's
   * centre lands above the tray, and — because the same field of view now
   * spans more pixels — what is left is a little larger. One call does the two
   * things the phone needed.
   */
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    if (!cam.isPerspectiveCamera) return
    if (hudBottom > 0 && size.height > hudBottom + 80) {
      cam.setViewOffset(size.width, size.height + hudBottom, 0, hudBottom, size.width, size.height)
    } else {
      cam.clearViewOffset()
    }
    cam.updateProjectionMatrix()
    return () => {
      cam.clearViewOffset()
      cam.updateProjectionMatrix()
    }
  }, [camera, hudBottom, size.width, size.height])
  const mounted = useRef(false)
  const transition = useRef(0)
  const lastReset = useRef(sim.viewReset)
  const lastViewSeq = useRef(sim.viewSeq)
  const flyPos = useMemo(() => new THREE.Vector3(...OVERVIEW.position), [OVERVIEW])
  const flyTarget = useMemo(() => new THREE.Vector3(...OVERVIEW.target), [OVERVIEW])
  const offset = useMemo(() => new THREE.Vector3(), [])
  const spherical = useMemo(() => new THREE.Spherical(), [])
  const pendingOrbit = useRef({ dx: 0, dy: 0 })

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

  const lastOverview = useRef(OVERVIEW)

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    if (lastOverview.current !== OVERVIEW) {
      lastOverview.current = OVERVIEW
      flyPos.set(...OVERVIEW.position)
      flyTarget.set(...OVERVIEW.target)
      transition.current = 1.2
    }
    if (!mounted.current) {
      if (!controls) return
      camera.position.set(...OVERVIEW.position)
      controls.target.set(...OVERVIEW.target)
      controls.update()
      mounted.current = true
      return
    }
    if (sim.viewSeq !== lastViewSeq.current) {
      lastViewSeq.current = sim.viewSeq
      const v = ATOM_VIEW_BY_ID[sim.viewId]
      if (v) {
        flyPos.set(...v.position)
        flyTarget.set(...v.target)
        transition.current = 1.7
      }
    }
    if (sim.viewReset !== lastReset.current) {
      lastReset.current = sim.viewReset
      flyPos.set(...OVERVIEW.position)
      flyTarget.set(...OVERVIEW.target)
      transition.current = 1.2
    }
    if (transition.current > 0) {
      transition.current -= dt
      const k = 1 - Math.exp(-dt * 3.2)
      camera.position.lerp(flyPos, k)
      if (controls) controls.target.lerp(flyTarget, k)
    }
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
      transition.current = 0
    }
    if (controls && sim.viewZoom !== 0) {
      offset.copy(camera.position).sub(controls.target)
      const next = THREE.MathUtils.clamp(offset.length() * (1 + sim.viewZoom), MIN_ORBIT, MAX_ORBIT)
      offset.setLength(next)
      camera.position.copy(controls.target).add(offset)
      sim.viewZoom = 0
      transition.current = 0
    }
    if (controls) {
      controls.autoRotate = sim.autoOrbit
      controls.autoRotateSpeed = 0.9
      controls.update()
    }
  })

  return (
    <OrbitControls
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={MIN_ORBIT}
      maxDistance={MAX_ORBIT}
      minPolarAngle={0.06}
      maxPolarAngle={Math.PI * 0.86}
      zoomSpeed={0.9}
      rotateSpeed={0.85}
    />
  )
}
