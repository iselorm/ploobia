import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import type { SimState } from '@/lib/sim'
import { VESSEL_RADIUS } from '@/lib/sim'
import { LAP_LENGTH, STAGE_ENDS, nowS, radiusAtDist } from '@/lib/journey'
import { getQualityCaps } from '@/lib/quality'
import { attachFade, commitFade, makeFadeMaterial } from './fadeMaterial'

/**
 * Tunnel-wall direction signs — the racetrack arrows of the circuit.
 *
 * Two runs of signs, mounted on both walls at eye level (cell orbits are
 * clamped away from the wall, so they stay readable through the traffic):
 *
 *   ARTERY — blue "O₂ ❯" signs: the cargo being carried OUT to the body.
 *   VEIN   — red  "CO₂ ❯" signs: the waste being carried HOME to the lungs.
 *
 * Every sign carries the name of what is travelling, because an unlabelled
 * arrow is a puzzle rather than a signpost. A chasing-light pulse runs along
 * each row in the direction of travel.
 *
 * Signs fade with an `aFade` attribute, never by darkening their colour — see
 * fadeMaterial.ts for why that distinction matters.
 */

const ARTERY = { z0: STAGE_ENDS[1] + 4, z1: STAGE_ENDS[2] - 4 }
const VEIN = { z0: STAGE_ENDS[4] + 4, z1: STAGE_ENDS[5] - 4 }

const O2_TINT = '#8FD2F2'
const CO2_TINT = '#FF8E78'

const FIELD_HALF = 140

/** How far each sign is turned back down the tunnel to face the rider. */
const SIGN_YAW = 0.72
/**
 * Signs hang just inside the wall, in the verge the cell fields leave clear
 * (see CELL_VERGE in sim.ts). Mounted any further in they are simply buried
 * in the traffic, which is how the first version managed to be invisible.
 */
const SIGN_INSET = 0.5

/** Sign spacing widens on weaker devices; the row still reads as continuous. */
const SPACING_BY_TIER: Record<string, number> = { '1': 9, '0.7': 13, '0.45': 20 }

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

/**
 * A road sign: the formula, then a chevron pointing the way. Drawn white so a
 * per-instance tint can colour it, with a soft glow so it survives the dark
 * tunnel without needing a background plate.
 */
function signTexture(label: string): { texture: THREE.CanvasTexture; aspect: number } {
  const h = 128
  const w = 320
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.shadowColor = 'rgba(255,255,255,0.9)'
    ctx.shadowBlur = 12
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#ffffff'
    ctx.font = '800 86px Nunito, ui-rounded, system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, 16, h / 2 + 2)
    const textW = ctx.measureText(label).width
    // chevron, just to the right of the formula
    const cx = Math.min(w - 60, 16 + textW + 44)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 20
    ctx.beginPath()
    ctx.moveTo(cx - 26, h / 2 - 34)
    ctx.lineTo(cx + 22, h / 2)
    ctx.lineTo(cx - 26, h / 2 + 34)
    ctx.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  return { texture, aspect: w / h }
}

interface Spot {
  localZ: number
  side: -1 | 1
}

function SignRow({
  sim,
  zone,
  label,
  tint,
}: {
  sim: SimState
  zone: { z0: number; z1: number }
  label: string
  tint: string
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const { texture, aspect } = useMemo(() => signTexture(label), [label])

  const spots: Spot[] = useMemo(() => {
    const key = String(getQualityCaps().particleScale)
    const spacing = SPACING_BY_TIER[key] ?? 9
    const out: Spot[] = []
    for (let d = zone.z0; d <= zone.z1; d += spacing) {
      out.push({ localZ: d, side: -1 }, { localZ: d, side: 1 })
    }
    return out
  }, [zone])

  const geometry = useMemo(() => new THREE.PlaneGeometry(2.1 * aspect, 2.1), [aspect])
  const material = useMemo(() => makeFadeMaterial(texture), [texture])
  const fade = useMemo(() => attachFade(geometry, spots.length), [geometry, spots.length])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(tint), [tint])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const t = nowS()
    for (let i = 0; i < spots.length; i++) {
      const spot = spots[i]
      const z = nearestWorldZ(spot.localZ, sim.camZ)
      if (z === null) {
        fade[i] = 0
        dummy.scale.setScalar(0)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        continue
      }
      const localR = radiusAtDist(-z, VESSEL_RADIUS)
      const dz = z - sim.camZ // negative while still ahead
      const behind = dz > -2
      dummy.position.set(spot.side * (localR - SIGN_INSET), 0.6, z)
      /**
       * Angle the sign toward oncoming traffic, exactly like a motorway sign.
       * Mounted flat against the wall (normal pointing straight across the
       * tunnel) it is seen edge-on from the middle of the vessel and reads as
       * a meaningless sliver — which is precisely how these first shipped.
       * Turned ~40° back down the tunnel, the face is presented to the rider
       * while the chevron still sweeps forward.
       */
      dummy.rotation.set(0, -spot.side * SIGN_YAW, 0)
      dummy.scale.setScalar(behind ? 0 : 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      // colour stays at full strength; only alpha carries the fade
      mesh.setColorAt(i, color)
      const chase = 0.55 + 0.45 * Math.max(0, Math.sin(t * 3.2 + spot.localZ * 0.45))
      const far = Math.min(1, Math.max(0, (100 + dz) / 40))
      fade[i] = behind ? 0 : chase * far
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    commitFade(geometry)
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, spots.length]}
      frustumCulled={false}
      renderOrder={2}
    />
  )
}

export default function ChevronFlow({ sim }: { sim: SimState }) {
  return (
    <group>
      <SignRow sim={sim} zone={ARTERY} label="O₂" tint={O2_TINT} />
      <SignRow sim={sim} zone={VEIN} label="CO₂" tint={CO2_TINT} />
    </group>
  )
}
