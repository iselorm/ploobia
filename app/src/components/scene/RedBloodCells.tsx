import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import type { SimState, Highlight } from '@/lib/sim'
import { FIELD_LENGTH, MAX_RBC, VESSEL_RADIUS, heartbeat } from '@/lib/sim'
import { getJourney, oxygenationAt, radiusAtDist, beatsPerSecond } from '@/lib/journey'
import { getQualityCaps } from '@/lib/quality'
import type { CellType } from '@/lib/facts'

/** Oxygen-rich arterial red vs oxygen-poor venous red. Never blue! */
const OXY_COLOR = new THREE.Color('#E23A31')
const DEOXY_COLOR = new THREE.Color('#7E2730')
const GLOW_COLOR = new THREE.Color('#FFB45E')

/** Maximum orbit radius for cells so they never pierce the pulsing wall. */
const MAX_ORBIT = VESSEL_RADIUS * 0.66

/**
 * Builds the true biconcave red-blood-cell shape with a LatheGeometry,
 * using the classic Evans–Fung thickness profile:
 *   d(rho) = sqrt(1 - rho^2) * (c0 + c2*rho^2 + c4*rho^4), rho = r / R
 * (c0 = 0.81, c2 = 7.83, c4 = -4.39 microns, R = 3.91 microns — normalized
 * here so the cell diameter is 2 world units).
 */
function buildBiconcaveGeometry(radialSegments: number): THREE.LatheGeometry {
  const half = (rho: number) =>
    (Math.sqrt(Math.max(0, 1 - rho * rho)) *
      (0.81 + 7.83 * rho * rho - 4.39 * rho * rho * rho * rho)) /
    (3.91 * 2)

  const SEG = 10
  const pts: THREE.Vector2[] = []
  for (let i = 0; i <= SEG; i++) {
    const rho = i / SEG
    pts.push(new THREE.Vector2(rho, half(rho)))
  }
  for (let i = SEG; i >= 0; i--) {
    const rho = i / SEG
    pts.push(new THREE.Vector2(Math.max(rho, 1e-4), -half(rho)))
  }
  const geo = new THREE.LatheGeometry(pts, radialSegments)
  geo.computeVertexNormals()
  return geo
}

interface Props {
  sim: SimState
  highlighted: Highlight | null
  onCellClick: (type: CellType, id: number) => void
}

export default function RedBloodCells({ sim, highlighted, onCellClick }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null)

  // The red-cell field IS the triangle budget of this cabinet — nothing else
  // is close. Weak devices get a coarser lathe and a smaller crowd; the
  // biconcave silhouette survives both, so the scene still reads as intended.
  const geometry = useMemo(() => {
    const scale = getQualityCaps().particleScale
    return buildBiconcaveGeometry(scale >= 1 ? 16 : scale >= 0.7 ? 12 : 9)
  }, [])
  const material = useMemo(
    () =>
      // Lambert keeps the fragment shader cheap — thousands of overlapping
      // cells mean huge overdraw, and StandardMaterial's GGX is wasted on them.
      new THREE.MeshLambertMaterial({
        color: new THREE.Color('#ffffff'), // instance colors supply the red
      }),
    [],
  )

  // Per-instance simulation data (stable across renders).
  const data = useMemo(() => {
    const angle = new Float32Array(MAX_RBC)
    const orbit = new Float32Array(MAX_RBC)
    const z = new Float32Array(MAX_RBC)
    const speedK = new Float32Array(MAX_RBC)
    const swirl = new Float32Array(MAX_RBC)
    const wobblePhase = new Float32Array(MAX_RBC)
    const wobbleSpeed = new Float32Array(MAX_RBC)
    const scale = new Float32Array(MAX_RBC)
    const tumbleRate = new Float32Array(MAX_RBC)
    const vr = new Float32Array(MAX_RBC)
    const vg = new Float32Array(MAX_RBC)
    const vb = new Float32Array(MAX_RBC)
    const quats: THREE.Quaternion[] = []
    const axes: THREE.Vector3[] = []
    for (let i = 0; i < MAX_RBC; i++) {
      angle[i] = Math.random() * Math.PI * 2
      // sqrt distribution => uniform disk coverage, biased away from exact center;
      // minimum keeps cells from clipping through the camera on the axis
      orbit[i] = 2.0 + Math.sqrt(Math.random()) * (MAX_ORBIT - 2.0)
      z[i] = (Math.random() - 0.5) * FIELD_LENGTH
      speedK[i] = 0.78 + Math.random() * 0.14 // slower than the camera
      swirl[i] = (Math.random() - 0.5) * 0.35
      wobblePhase[i] = Math.random() * Math.PI * 2
      wobbleSpeed[i] = 0.8 + Math.random() * 1.6
      scale[i] = 0.72 + Math.random() * 0.36
      tumbleRate[i] = (Math.random() - 0.5) * 1.6
      vr[i] = 0.94 + Math.random() * 0.12
      vg[i] = 0.94 + Math.random() * 0.12
      vb[i] = 0.94 + Math.random() * 0.12
      quats.push(new THREE.Quaternion().random())
      axes.push(
        new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      )
    }
    return { angle, orbit, z, speedK, swirl, wobblePhase, wobbleSpeed, scale, tumbleRate, vr, vg, vb, quats, axes }
  }, [])

  // Seed instance colours once so instanceColor exists before the first frame.
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    for (let i = 0; i < MAX_RBC; i++) mesh.setColorAt(i, OXY_COLOR)
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [])

  const dummy = useMemo(() => new THREE.Object3D(), [])
  const dq = useMemo(() => new THREE.Quaternion(), [])
  const cellColor = useMemo(() => new THREE.Color(), [])

  useFrame((_, rawDt) => {
    const mesh = meshRef.current
    if (!mesh) return
    const dt = Math.min(rawDt, 0.25)
    const tierCap = Math.round(MAX_RBC * getQualityCaps().particleScale)
    const count = Math.min(Math.max(Math.round(sim.density), 1), tierCap, MAX_RBC)
    mesh.count = count

    const flow = sim.flowNow
    const beat = heartbeat(sim.time, beatsPerSecond(sim))
    const hiId = highlighted?.type === 'rbc' ? highlighted.id : -1
    const journey = getJourney()
    const clearing = journey.beatActive || (journey.beatDone && Math.abs(journey.cellFocus.z - sim.camZ) < 40)
    const fx = journey.cellFocus.x
    const fy = journey.cellFocus.y
    const fz = journey.cellFocus.z

    let nearest = -1
    let nearestDz = Infinity

    for (let i = 0; i < count; i++) {
      // axial drift (cells stream backward relative to the camera)
      data.z[i] -= flow * data.speedK[i] * dt
      if (data.z[i] > sim.camZ + 14) {
        data.z[i] -= FIELD_LENGTH
        sim.cellsPassed++
      } else if (data.z[i] < sim.camZ - FIELD_LENGTH) {
        data.z[i] += FIELD_LENGTH
      }

      const dz = Math.abs(data.z[i] - sim.camZ)
      if (dz < nearestDz) {
        nearestDz = dz
        nearest = i
      }

      // gentle swirl around the vessel axis + wobble, clamped to the LOCAL
      // bore — through the capillary squeeze this forces single file.
      data.angle[i] += data.swirl[i] * dt
      const wob = Math.sin(sim.time * data.wobbleSpeed[i] + data.wobblePhase[i]) * 0.18
      const localR = radiusAtDist(-data.z[i], VESSEL_RADIUS)
      const maxR = Math.max(0.55, localR - 1.15 * data.scale[i] - 0.4)
      const minR = Math.min(2.0, maxR * 0.5)
      const r = Math.min(Math.max(data.orbit[i] + wob, minR), maxR)

      // slow tumble
      dq.setFromAxisAngle(data.axes[i], data.tumbleRate[i] * dt)
      data.quats[i].premultiply(dq)

      dummy.position.set(Math.cos(data.angle[i]) * r, Math.sin(data.angle[i]) * r, data.z[i])
      dummy.quaternion.copy(data.quats[i])
      // cells fold slightly to fit the narrow vessels
      const squeeze = Math.min(1, Math.max(0, (localR - 2.2) / 6.8))
      let s = data.scale[i] * (i === hiId ? 1.45 : 1) * (1 + beat * 0.03) * (0.78 + 0.22 * squeeze)
      // never let a cell swallow the camera: shrink smoothly as it passes
      const pdx = dummy.position.x
      const pdy = dummy.position.y
      const pdz = data.z[i] - sim.camZ
      const dCam = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz)
      if (dCam < 3.2) s *= Math.max(0, Math.min(1, (dCam - 1.1) / 2.1))
      // during the meet-the-cell story, open a clearing around the featured
      // cell so the learner can actually see the handover
      if (clearing) {
        const cdx = dummy.position.x - fx
        const cdy = dummy.position.y - fy
        const cdz = data.z[i] - fz
        const dF = Math.sqrt(cdx * cdx + cdy * cdy + cdz * cdz)
        if (dF < 14) s *= 0.22 + 0.78 * Math.max(0, Math.min(1, (dF - 5) / 9))
      }
      dummy.scale.setScalar(s)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)

      // Oxygenation paints the crowd: bright arterial red out of the lungs,
      // dusky venous red after the tissue drop-off. Highlight glows gold.
      if (i === hiId) {
        cellColor.copy(GLOW_COLOR)
      } else {
        const oxy = oxygenationAt(-data.z[i])
        cellColor.copy(DEOXY_COLOR).lerp(OXY_COLOR, oxy)
        cellColor.r *= data.vr[i]
        cellColor.g *= data.vg[i]
        cellColor.b *= data.vb[i]
      }
      mesh.setColorAt(i, cellColor)
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true

    if (nearest >= 0) {
      sim.labelRbc.set(
        Math.cos(data.angle[nearest]) * data.orbit[nearest],
        Math.sin(data.angle[nearest]) * data.orbit[nearest],
        data.z[nearest],
      )
    }

    mesh.instanceMatrix.needsUpdate = true
  })

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 8) return // it was a drag, not a tap
    if (e.instanceId === undefined || e.instanceId >= (meshRef.current?.count ?? 0)) return
    e.stopPropagation()
    onCellClick('rbc', e.instanceId)
  }

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, MAX_RBC]}
      frustumCulled={false}
      onClick={handleClick}
    />
  )
}
