import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { SimState } from '@/lib/sim'
import { VESSEL_RADIUS } from '@/lib/sim'
import { LAP_LENGTH, STAGE_ENDS, nowS, radiusAtDist } from '@/lib/journey'
import { getQualityCaps } from '@/lib/quality'

/**
 * Racetrack chevrons for the gas story — the direction arrows of the circuit:
 *
 *  - LUNGS: blue O₂ chevron trains streaming in through the wall, red CO₂
 *    trains streaming out (breathed away).
 *  - TISSUE: the mirror — O₂ chevrons out into the waiting cells, CO₂ in.
 *  - ARTERY floor: forward chevrons in O₂ blue (the cargo being carried out),
 *    VEIN floor: forward chevrons in CO₂ red (the waste being carried home) —
 *    classic track-direction arrows with a chasing-light pulse.
 *
 * One InstancedMesh, one draw call; per-instance colour carries species tint
 * and the animation brightness.
 */

const LUNGS = { z0: 6, z1: STAGE_ENDS[0] - 6 }
const TISSUE = { z0: STAGE_ENDS[3] + 6, z1: STAGE_ENDS[4] - 6 }
const ARTERY = { z0: STAGE_ENDS[1] + 4, z1: STAGE_ENDS[2] - 4 }
const VEIN = { z0: STAGE_ENDS[4] + 4, z1: STAGE_ENDS[5] - 4 }

const O2_TINT = new THREE.Color('#7EC8EE')
const CO2_TINT = new THREE.Color('#FF7A66')

const FIELD_HALF = 140

function nearestWorldZ(localD: number, camZ: number): number | null {
  const camDist = -camZ
  const baseLap = Math.floor((camDist - localD) / LAP_LENGTH + 0.5)
  for (const lap of [baseLap, baseLap + 1, baseLap - 1]) {
    if (lap < 0) continue
    const z = -(lap * LAP_LENGTH + localD)
    if (Math.abs(z - camZ) < FIELD_HALF) return z
  }
  return null
}

/** Bold ">" chevron on a transparent canvas, white — tinted per instance. */
function chevronTexture(): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.shadowColor = 'rgba(255,255,255,0.85)'
    ctx.shadowBlur = 10
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 24
    ctx.beginPath()
    ctx.moveTo(38, 26)
    ctx.lineTo(96, 64)
    ctx.lineTo(38, 102)
    ctx.stroke()
  }
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.minFilter = THREE.LinearFilter
  t.magFilter = THREE.LinearFilter
  return t
}

interface RadialLane {
  zone: { z0: number; z1: number }
  angle: number
  localZ: number
  /** 1 = inward (into the blood), -1 = outward */
  dir: 1 | -1
  tint: THREE.Color
  phase: number
}

const CHEVRONS_PER_LANE = 4
/**
 * Wall-sign spacing widens on weaker devices, so the low tier draws roughly a
 * third of the track signs. The arrows still read as a continuous direction
 * cue — they just sit further apart, which is how real track signage works
 * anyway. (Quality tiers must never make a scene look unintentional.)
 */
const TRACK_SPACING_BY_TIER = { 1: 9, 0.7: 13, 0.45: 20 }

export default function ChevronFlow({ sim }: { sim: SimState }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const { camera } = useThree()

  const texture = useMemo(() => chevronTexture(), [])

  const radialLanes: RadialLane[] = useMemo(() => {
    const lanes: RadialLane[] = []
    // Each angle repeats at several depths through the zone, so a lane is
    // always crossing the wall somewhere near the rider. Weaker devices get
    // fewer depths rather than fewer lanes — direction stays legible.
    const SLOTS = getQualityCaps().particleScale >= 1 ? 3 : 2
    const mk = (
      zone: { z0: number; z1: number },
      angles: number[],
      dir: 1 | -1,
      tint: THREE.Color,
    ) => {
      angles.forEach((angle, i) => {
        for (let sIdx = 0; sIdx < SLOTS; sIdx++) {
          const t = (sIdx + (i + 0.5) / angles.length) / SLOTS
          lanes.push({
            zone,
            angle: angle + sIdx * 0.9,
            localZ: zone.z0 + t * (zone.z1 - zone.z0),
            dir,
            tint,
            phase: (i * 0.37 + sIdx * 0.23) % 1,
          })
        }
      })
    }
    // lungs: O₂ in, CO₂ out
    mk(LUNGS, [0.7, 2.4, 4.4], 1, O2_TINT)
    mk(LUNGS, [1.55, 5.4], -1, CO2_TINT)
    // tissue: O₂ out, CO₂ in
    mk(TISSUE, [0.9, 2.6, 4.6], -1, O2_TINT)
    mk(TISSUE, [1.8, 5.6], 1, CO2_TINT)
    return lanes
  }, [])

  const trackSpots = useMemo(() => {
    const scale = getQualityCaps().particleScale as 1 | 0.7 | 0.45
    const spacing = TRACK_SPACING_BY_TIER[scale] ?? 9
    const spots: { localZ: number; side: -1 | 1; tint: THREE.Color }[] = []
    const mk = (zone: { z0: number; z1: number }, tint: THREE.Color) => {
      for (let d = zone.z0; d <= zone.z1; d += spacing) {
        spots.push({ localZ: d, side: -1, tint })
        spots.push({ localZ: d, side: 1, tint })
      }
    }
    mk(ARTERY, O2_TINT)
    mk(VEIN, CO2_TINT)
    return spots
  }, [])

  const COUNT = radialLanes.length * CHEVRONS_PER_LANE + trackSpots.length

  const scratch = useMemo(
    () => ({
      dummy: new THREE.Object3D(),
      color: new THREE.Color(),
      dir: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      qz: new THREE.Quaternion(),
      zAxis: new THREE.Vector3(0, 0, 1),
    }),
    [],
  )

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const { dummy, color, dir, right, up, qz, zAxis } = scratch
    const t = nowS()
    right.set(1, 0, 0).applyQuaternion(camera.quaternion)
    up.set(0, 1, 0).applyQuaternion(camera.quaternion)

    let idx = 0

    // --- radial gas lanes: chevrons travelling across the wall
    for (const lane of radialLanes) {
      const z = nearestWorldZ(lane.localZ, sim.camZ)
      for (let k = 0; k < CHEVRONS_PER_LANE; k++, idx++) {
        if (z === null) {
          dummy.scale.setScalar(0)
          dummy.updateMatrix()
          mesh.setMatrixAt(idx, dummy.matrix)
          continue
        }
        const localR = radiusAtDist(-z, VESSEL_RADIUS)
        const rOuter = localR + 3.0
        const rInner = Math.max(0.8, localR * 0.32)
        const p = (lane.phase + k / CHEVRONS_PER_LANE + t * 0.16) % 1
        const r = lane.dir === 1 ? rOuter - (rOuter - rInner) * p : rInner + (rOuter - rInner) * p
        const cx = Math.cos(lane.angle)
        const sy = Math.sin(lane.angle)
        dummy.position.set(cx * r, sy * r, z)
        // point along the direction of travel, in screen space
        dir.set(cx * -lane.dir, sy * -lane.dir, 0)
        const ang = Math.atan2(dir.dot(up), dir.dot(right))
        dummy.quaternion.copy(camera.quaternion).multiply(qz.setFromAxisAngle(zAxis, ang))
        const endFade = Math.min(1, Math.min(p, 1 - p) * 5)
        const dz = z - sim.camZ
        const nearFade = Math.min(1, Math.max(0, (Math.abs(dz) - 3) / 8))
        const farFade = Math.min(1, Math.max(0, (110 - Math.abs(dz)) / 40))
        dummy.scale.setScalar(1.25 * (0.7 + 0.3 * endFade))
        dummy.updateMatrix()
        mesh.setMatrixAt(idx, dummy.matrix)
        color.copy(lane.tint).multiplyScalar((0.35 + 0.65 * endFade) * nearFade * farFade)
        mesh.setColorAt(idx, color)
      }
    }

    // --- track-floor chevrons: forward direction with a chasing pulse
    for (const spot of trackSpots) {
      const z = nearestWorldZ(spot.localZ, sim.camZ)
      if (z === null) {
        dummy.scale.setScalar(0)
        dummy.updateMatrix()
        mesh.setMatrixAt(idx, dummy.matrix)
        idx++
        continue
      }
      const localR = radiusAtDist(-z, VESSEL_RADIUS)
      // tunnel-wall direction signs at eye level — cells are clamped away
      // from the wall, so these stay readable through the traffic
      const x = spot.side * (localR - 1.4)
      const y = spot.side * 0.9
      dummy.position.set(x, y, z)
      dummy.rotation.set(0, Math.PI / 2, 0) // chevron +x → world −z (forward)
      const dz = z - sim.camZ
      const behind = dz > -2
      const chase = 0.62 + 0.38 * Math.max(0, Math.sin(t * 3.2 + spot.localZ * 0.45))
      const farFade = Math.min(1, Math.max(0, (95 + dz) / 35)) // dz negative ahead
      dummy.scale.setScalar(behind ? 0 : 2.4)
      dummy.updateMatrix()
      mesh.setMatrixAt(idx, dummy.matrix)
      color.copy(spot.tint).multiplyScalar(behind ? 0 : chase * farFade)
      mesh.setColorAt(idx, color)
      idx++
    }

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  const material = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    })
    m.fog = false
    return m
  }, [texture])

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, COUNT]}
      frustumCulled={false}
      renderOrder={2}
    >
      <planeGeometry args={[1, 1]} />
      <primitive object={material} attach="material" />
    </instancedMesh>
  )
}
