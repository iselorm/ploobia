import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { registerCamera } from '@/lib/input'
import { MAP_Y } from './ValleyTerrain'
import {
  bedH,
  CHECKPOINTS,
  channelW,
  COURSE,
  fallsAt,
  meanderX,
  profileH,
  valleyH,
  STATION_BY_ID,
  waterY,
  worldZ,
  type RiverSim,
  type RiverViewId,
} from '@/lib/river'

export interface RiverViewpoint {
  id: RiverViewId
  label: string
  hint: string
  position: [number, number, number]
  target: [number, number, number]
}

export const RIVER_VIEWS: RiverViewpoint[] = [
  { id: 'overview', label: 'Basin', hint: 'The whole drainage basin — every tributary, source to sea.', position: [128, 108, 150], target: [0, 8, -6] },
  { id: 'head', label: 'Moor', hint: 'The headwaters: springs, burns and the first confluences.', position: [30, 54, -86], target: [0, 30, -58] },
  { id: 'gorge', label: 'Gorge', hint: 'The upper course: strata, white water and the falls.', position: [15, 31, -10], target: [0.4, 18, -28] },
  { id: 'overlook', label: 'Overlook', hint: 'The middle course, its meanders and the big confluence.', position: [32, 27, -6], target: [0, 6, 16] },
  { id: 'village', label: 'Village', hint: 'The floodplain, the gauge and the people on it.', position: [16, 9, 38], target: [3, 1, 56] },
  { id: 'mouth', label: 'Delta', hint: 'The channel splits and builds new land in the sea.', position: [26, 22, 50], target: [0, 0.3, 84] },
  { id: 'follow', label: 'Follow', hint: 'Ride along with whatever is moving.', position: [6, 34, -62], target: [0, 30, -56] },
]
export const RIVER_VIEW_BY_ID: Record<string, RiverViewpoint> = Object.fromEntries(RIVER_VIEWS.map((v) => [v.id, v]))

const OVERVIEW = RIVER_VIEWS[0]
export const MIN_ORBIT = 0.5
export const MAX_ORBIT = 300

interface OrbitLike {
  target: THREE.Vector3
  autoRotate: boolean
  autoRotateSpeed: number
  update: () => void
  /** OrbitControls recomputes position from its own spherical every update —
   *  so a straight-down view keeps the previous azimuth (the map came out
   *  rotated). Set the angle explicitly when a shot needs a fixed bearing. */
  setAzimuthalAngle?: (a: number) => void
  setPolarAngle?: (a: number) => void
}

export default function RiverCamera({ sim }: { sim: RiverSim }) {
  const controls = useThree((s) => s.controls) as OrbitLike | null
  const camera = useThree((s) => s.camera)
  const mounted = useRef(false)
  const transition = useRef(0)
  const lastReset = useRef(sim.viewReset)
  const lastViewSeq = useRef(sim.viewSeq)
  const lastLens = useRef(sim.lens)
  const lastMap = useRef(sim.mapOn)
  const lastCpSeq = useRef(sim.cpSeq)
  const fwd = useMemo(() => new THREE.Vector3(), [])
  const right = useMemo(() => new THREE.Vector3(), [])
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
    // Camera telemetry for verify-river.mjs (position + orbit target).
    ;(window as unknown as Record<string, unknown>).__cam = [...camera.position.toArray(), ...(controls ? controls.target.toArray() : [])]
    // A looser clamp than the 0.05 idle rule: a fly-to that takes 2 s on a
    // desktop must not take 25 s on a slow one.
    const dt = Math.min(rawDt, 0.12)
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
      const v = RIVER_VIEW_BY_ID[sim.viewId]
      if (v && sim.viewId !== 'follow') {
        flyPos.set(...v.position)
        flyTarget.set(...v.target)
        transition.current = 1.8
      }
    }
    if (sim.viewReset !== lastReset.current) {
      lastReset.current = sim.viewReset
      flyPos.set(...OVERVIEW.position)
      flyTarget.set(...OVERVIEW.target)
      transition.current = 1.2
    }
    // The living map pulls the camera to a reading desk overhead.
    if (sim.mapOn !== lastMap.current) {
      lastMap.current = sim.mapOn
      if (sim.mapOn) {
        // Straight overhead, north-up: force the bearing, don't just place the
        // camera — OrbitControls would otherwise keep its previous azimuth.
        flyPos.set(0, 168, 3.4)
        flyTarget.set(0, MAP_Y, 4)
        controls?.setAzimuthalAngle?.(0)
        controls?.setPolarAngle?.(0.035)
        transition.current = 2.2
      } else {
        flyPos.set(...OVERVIEW.position)
        flyTarget.set(...OVERVIEW.target)
        transition.current = 1.6
      }
    }
    // Checkpoint stepping: fly to the gate and frame it from the bank.
    if (sim.cpSeq !== lastCpSeq.current) {
      lastCpSeq.current = sim.cpSeq
      const cp = CHECKPOINTS[Math.max(0, sim.atCp)]
      if (cp) {
        const cs = cp.id === 'falls' ? fallsAt(sim.years) : cp.s
        const cx = meanderX(cs, sim.years)
        const cz = worldZ(cs)
        const ground = profileH(cs, sim.years)
        const back = 15 + channelW(cs) * 3.2
        flyTarget.set(cx, ground + 0.6, cz)
        flyPos.set(cx + back * 0.85, ground + back * 0.75, cz - back * 0.8)
        transition.current = 2.2
      }
    }
    // The underwater lens dives at the current station.
    if (sim.lens !== lastLens.current) {
      const st = STATION_BY_ID[sim.station]
      if (sim.lens === 'under') {
        const cx = meanderX(st.s, sim.years)
        const bed = bedH(st.s, sim.years)
        const eye = Math.min(waterY(sim, st.s) - 0.05, bed + 0.16)
        flyPos.set(cx, eye, worldZ(st.s) - 1.4)
        flyTarget.set(meanderX(st.s + 5, sim.years), eye + 0.1, worldZ(st.s) + 5)
        transition.current = 2.0
      } else if (lastLens.current === 'under') {
        flyPos.set(cxAbove(st.s) + 9, bedH(st.s, 0) + 6, worldZ(st.s) - 6)
        flyTarget.set(cxAbove(st.s), bedH(st.s, 0) + 1, worldZ(st.s))
        transition.current = 1.4
      }
      lastLens.current = sim.lens
    }
    // The ride: Ploob's point of view — low over the water, looking downstream.
    if (sim.rideActive && sim.follow.active) {
      const k = 1 - Math.exp(-dt * 3.4)
      const s = sim.ploobS
      const ahead = Math.min(COURSE - 2, s + 8)
      if (controls) {
        controls.target.lerp(
          new THREE.Vector3(meanderX(ahead, sim.years), waterY(sim, ahead) + 0.35, worldZ(ahead)),
          k,
        )
      }
      const back = Math.max(1, s - 3)
      const px = meanderX(back, sim.years)
      const pz = worldZ(back)
      // Never sink the eye into a bank on a tight bend.
      const py = Math.max(waterY(sim, s) + 1.15, valleyH(px, pz, sim.years) + 0.6)
      camera.position.lerp(new THREE.Vector3(px, py, pz), k)
      transition.current = 0
    } else if (sim.viewId === 'follow' && sim.follow.active) {
      const k = 1 - Math.exp(-dt * 2.4)
      if (controls) controls.target.lerp(new THREE.Vector3(sim.follow.x, sim.follow.y + 0.3, sim.follow.z), k)
      const want = new THREE.Vector3(sim.follow.x + 3.6, sim.follow.y + 3.4, sim.follow.z - 6.5)
      camera.position.lerp(want, k * 0.9)
      transition.current = 0
    }
    if (transition.current > 0) {
      transition.current -= dt
      const k = 1 - Math.exp(-dt * 3.0)
      camera.position.lerp(flyPos, k)
      if (controls) controls.target.lerp(flyTarget, k)
    }
    // Free navigation: the arrow pad and arrow keys pan over the basin.
    if ((sim.panX !== 0 || sim.panZ !== 0) && controls) {
      camera.getWorldDirection(fwd)
      fwd.y = 0
      fwd.normalize()
      right.set(fwd.z, 0, -fwd.x)
      // Pan speed scales with how far out you are, so it feels the same close
      // to a bank and high over the whole basin.
      const reach = Math.max(6, camera.position.distanceTo(controls.target)) * 0.06
      const dx = right.x * sim.panX + fwd.x * sim.panZ
      const dz = right.z * sim.panX + fwd.z * sim.panZ
      camera.position.x += dx * reach
      camera.position.z += dz * reach
      controls.target.x = THREE.MathUtils.clamp(controls.target.x + dx * reach, -80, 80)
      controls.target.z = THREE.MathUtils.clamp(controls.target.z + dz * reach, -110, 128)
      controls.target.y = valleyH(controls.target.x, controls.target.z, sim.years) + 0.5
      sim.panX = 0
      sim.panZ = 0
      sim.atCp = -1
      transition.current = 0
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
    // Never let the eye sink into the ground — every viewpoint, every drag.
    const groundHere = valleyH(camera.position.x, camera.position.z, sim.years)
    const floorY = groundHere + (sim.lens === 'under' ? -99 : 1.8)
    if (camera.position.y < floorY) camera.position.y = floorY

    if (controls) {
      controls.autoRotate = sim.autoOrbit
      controls.autoRotateSpeed = 0.7
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
      minPolarAngle={0.02}
      maxPolarAngle={Math.PI * 0.86}
      zoomSpeed={0.9}
      rotateSpeed={0.85}
    />
  )
}

function cxAbove(s: number): number {
  return meanderX(s, 0)
}
