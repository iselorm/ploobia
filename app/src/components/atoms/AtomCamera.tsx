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
  { id: 'overview', label: 'Foundry', hint: 'The whole foundry: stage, crucibles and the table wall.', position: [0, 2.5, 7.8], target: [0, 1.6, -0.6] },
  { id: 'stage', label: 'Atom', hint: 'Up close with the atom on the build stage.', position: [1.7, 2.2, 3.1], target: [0, 1.9, 0] },
  { id: 'wall', label: 'Wall', hint: 'Face the periodic table wall.', position: [0, 2.3, 1.7], target: [0, 2.3, -5.6] },
]
export const ATOM_VIEW_BY_ID: Record<string, AtomViewpoint> = Object.fromEntries(ATOM_VIEWS.map((v) => [v.id, v]))

const OVERVIEW = ATOM_VIEWS[0]
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
export default function AtomCamera({ sim }: { sim: AtomSim }) {
  const controls = useThree((s) => s.controls) as OrbitLike | null
  const camera = useThree((s) => s.camera)
  const mounted = useRef(false)
  const transition = useRef(0)
  const lastReset = useRef(sim.viewReset)
  const lastViewSeq = useRef(sim.viewSeq)
  const flyPos = useMemo(() => new THREE.Vector3(...OVERVIEW.position), [])
  const flyTarget = useMemo(() => new THREE.Vector3(...OVERVIEW.target), [])
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

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
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
