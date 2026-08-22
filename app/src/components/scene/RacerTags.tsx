import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { SimState } from '@/lib/sim'
import { WBC_KINDS, WBC_ROSTER } from '@/lib/facts'
import { getQualityCaps } from '@/lib/quality'

/**
 * Racing nameplates — the way a racer labels the other cars on track. A gold
 * YOU plate rides over the hero cell; every white blood cell and the three
 * nearest platelets wear their own plate: dark glass pill, accent dot, name,
 * and a pointer chevron aimed at the cell. Distance-scaled so plates keep a
 * readable on-screen size, fading out beyond tag range. Toggled by the same
 * Labels switch as before (now default ON).
 */

const tagCache = new Map<string, { texture: THREE.CanvasTexture; aspect: number }>()

function tagTexture(name: string, accent: string, gold = false): { texture: THREE.CanvasTexture; aspect: number } {
  const key = `${name}|${accent}|${gold}`
  const hit = tagCache.get(key)
  if (hit) return hit

  const h = 148
  const font = `800 52px Nunito, ui-rounded, system-ui, sans-serif`
  const probe = document.createElement('canvas').getContext('2d')
  if (probe) probe.font = font
  const textW = probe ? probe.measureText(name.toUpperCase()).width : name.length * 30
  const padX = 44
  const dotSpace = 44
  const w = Math.ceil(textW + padX * 2 + dotSpace)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const pillH = 92
    const r = pillH / 2
    // pill
    ctx.beginPath()
    ctx.roundRect(4, 4, w - 8, pillH, r)
    ctx.fillStyle = gold ? 'rgba(64, 34, 8, 0.82)' : 'rgba(36, 8, 12, 0.78)'
    ctx.fill()
    ctx.lineWidth = 4
    ctx.strokeStyle = gold ? 'rgba(255, 217, 160, 0.95)' : 'rgba(251, 245, 234, 0.55)'
    ctx.stroke()
    // accent dot
    ctx.beginPath()
    ctx.arc(padX - 8, 4 + pillH / 2, 13, 0, Math.PI * 2)
    ctx.fillStyle = accent
    ctx.fill()
    // name
    ctx.font = font
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = gold ? '#FFD9A0' : '#FBF5EA'
    ctx.fillText(name.toUpperCase(), padX + 18, 4 + pillH / 2 + 3)
    // pointer chevron under the pill
    ctx.beginPath()
    ctx.moveTo(w / 2 - 20, pillH + 2)
    ctx.lineTo(w / 2, h - 12)
    ctx.lineTo(w / 2 + 20, pillH + 2)
    ctx.closePath()
    ctx.fillStyle = gold ? 'rgba(255, 217, 160, 0.95)' : 'rgba(251, 245, 234, 0.8)'
    ctx.fill()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  const entry = { texture, aspect: w / h }
  tagCache.set(key, entry)
  if (typeof window !== 'undefined') {
    // Test handle: which nameplates the scene has actually rendered.
    const w2 = window as unknown as { __tagNames?: string[] }
    w2.__tagNames = [...new Set([...(w2.__tagNames ?? []), name])]
  }
  return entry
}

interface TagSpec {
  name: string
  accent: string
  gold?: boolean
  /** world-units lift above the cell before the camera-ray lift */
  above: number
  maxDist: number
}

function Tag({
  sim,
  source,
  spec,
}: {
  sim: SimState
  source: THREE.Vector3
  spec: TagSpec
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.MeshBasicMaterial>(null)
  const { camera } = useThree()
  const { texture, aspect } = useMemo(
    () => tagTexture(spec.name, spec.accent, spec.gold),
    [spec],
  )
  const toCam = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    const mesh = meshRef.current
    const mat = matRef.current
    if (!mesh || !mat) return
    if (!sim.labels || source.lengthSq() === 0) {
      mesh.visible = false
      return
    }
    toCam.copy(camera.position).sub(source)
    const dist = toCam.length()
    if (dist > spec.maxDist || dist < 1.2) {
      mesh.visible = false
      return
    }
    mesh.visible = true
    mesh.position.copy(source)
    mesh.position.y += spec.above
    if (dist > 1e-4) mesh.position.addScaledVector(toCam, Math.min(1.8, dist * 0.1) / dist)
    mesh.quaternion.copy(camera.quaternion)
    mesh.scale.setScalar(THREE.MathUtils.clamp(dist / 15, 0.65, 2.2))
    mat.opacity = THREE.MathUtils.clamp((spec.maxDist - dist) / 14, 0, 1)
  })

  return (
    <mesh ref={meshRef} renderOrder={3}>
      <planeGeometry args={[0.5 * aspect, 0.5]} />
      <meshBasicMaterial
        ref={matRef}
        map={texture}
        transparent
        depthWrite={false}
        depthTest={false}
        toneMapped={false}
        alphaTest={0.02}
      />
    </mesh>
  )
}

/** One plate per white cell, named for what it actually is. */
const WBC_SPECS: TagSpec[] = WBC_ROSTER.map((k) => ({
  name: WBC_KINDS[k].name,
  accent: WBC_KINDS[k].accent,
  above: 2.6,
  maxDist: 70,
}))
const PLT_SPEC: TagSpec = { name: 'Platelet', accent: '#EFA9A0', above: 0.9, maxDist: 40 }
const YOU_SPEC: TagSpec = { name: 'You', accent: '#E23A31', gold: true, above: 1.7, maxDist: 30 }

export default function RacerTags({ sim }: { sim: SimState }) {
  // Every plate is its own depth-test-off draw call. The named white cells
  // and YOU carry the teaching; platelet plates are decoration, so they are
  // the first thing dropped when the device is struggling.
  const plateletPlates = getQualityCaps().particleScale >= 1 ? sim.plateletTagPos.length : 1
  return (
    <group>
      <Tag sim={sim} source={sim.heroPos} spec={YOU_SPEC} />
      {sim.wbcPos.map((p, i) => (
        <Tag key={`w${i}`} sim={sim} source={p} spec={WBC_SPECS[i] ?? WBC_SPECS[0]} />
      ))}
      {sim.plateletTagPos.slice(0, plateletPlates).map((p, i) => (
        <Tag key={`p${i}`} sim={sim} source={p} spec={PLT_SPEC} />
      ))}
    </group>
  )
}
