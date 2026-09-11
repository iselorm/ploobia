import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { registerCamera } from '@/lib/input'
import type { MarketSim, MarketViewId } from '@/lib/marketsim'

/**
 * Authored shots for the Market. A door is a viewpoint: the stall on the left
 * third, the alley of shoppers running away to the right, the price board the
 * thing you change. Same rig discipline as the Foundry — scripted movement for
 * a short window after an explicit request; OrbitControls owns the camera the
 * rest of the time.
 */
export interface MarketViewpoint {
  id: MarketViewId
  label: string
  position: [number, number, number]
  target: [number, number, number]
}

export const MARKET_VIEWS: MarketViewpoint[] = [
  { id: 'stall', label: 'The stall', position: [2.9, 2.05, 4.3], target: [0.55, 0.95, 0.1] },
  { id: 'alley', label: 'The alley', position: [4.5, 2.6, 5.5], target: [1.0, 1.1, -2.0] },
  { id: 'board', label: 'The board', position: [1.2, 1.5, 2.2], target: [0.45, 1.1, -0.15] },
]

const PHONE_STALL: MarketViewpoint = { ...MARKET_VIEWS[0], position: [3.2, 2.2, 4.9], target: [0.5, 1.15, 0.1] }

export const MARKET_VIEW_BY_ID: Record<string, MarketViewpoint> = Object.fromEntries(MARKET_VIEWS.map((v) => [v.id, v]))

export const MIN_ORBIT = 1.2
export const MAX_ORBIT = 18

interface OrbitLike {
  target: THREE.Vector3
  autoRotate: boolean
  autoRotateSpeed: number
  update: () => void
}

export default function MarketCamera({ sim, phone = false, hudBottom = 0 }: { sim: MarketSim; phone?: boolean; hudBottom?: number }) {
  const controls = useThree((s) => s.controls) as OrbitLike | null
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const OVERVIEW = phone ? PHONE_STALL : MARKET_VIEWS[0]

  // Compose above the HUD, not behind it (see AtomCamera for the reasoning).
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
      const v = MARKET_VIEW_BY_ID[sim.viewId]
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
      maxPolarAngle={Math.PI * 0.49}
      zoomSpeed={0.9}
      rotateSpeed={0.85}
    />
  )
}
