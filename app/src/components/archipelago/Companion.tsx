import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import PloobCutout from '@/components/brand/PloobCutout'
import { getWorld, questTarget } from '@/lib/archipelago'
import { live } from './live'

/**
 * Ploob, the companion. He runs ahead to the quest's current target and
 * bounces there; with nothing to point at he trots beside the explorer.
 * This IS the coach chip's arrow, in the world: the marker is a creature
 * standing next to the thing, not an icon over it.
 *
 * The cutout is the existing Ploob 2.0 billboard — no new rig in W0.
 */
const AHEAD = new THREE.Vector3()

/** A soft radial disc, drawn once, for the glow at Ploob's feet. */
let halo: THREE.Texture | null = null
function haloTexture(): THREE.Texture {
  if (halo) return halo
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 6, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,220,150,1)')
  grad.addColorStop(0.45, 'rgba(255,190,90,0.55)')
  grad.addColorStop(1, 'rgba(255,170,60,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  halo = new THREE.CanvasTexture(c)
  halo.colorSpace = THREE.SRGBColorSpace
  return halo
}

export default function Companion() {
  const g = useRef<THREE.Group>(null)
  const glow = useRef<THREE.Mesh>(null)
  const glowAmt = useRef(0)
  const t = useRef(0)
  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw)
    t.current += dt
    const s = getWorld()
    const target = questTarget(s, [live.pos.x, live.pos.z])
    if (target) {
      // Stand a step to the side of the target, on the explorer's side of it.
      AHEAD.set(target[0] - live.pos.x, 0, target[2] - live.pos.z)
      const len = AHEAD.length() || 1
      AHEAD.multiplyScalar(-0.9 / len)
      live.ploobTarget.set(target[0] + AHEAD.x + 0.5, 0, target[2] + AHEAD.z)
    } else {
      live.ploobTarget.set(live.pos.x - Math.cos(live.facing) * 1.1, 0, live.pos.z + Math.sin(live.facing) * 1.1)
    }
    const k = 1 - Math.pow(0.02, dt)
    live.ploob.x += (live.ploobTarget.x - live.ploob.x) * k
    live.ploob.z += (live.ploobTarget.z - live.ploob.z) * k
    const far = Math.hypot(live.ploobTarget.x - live.ploob.x, live.ploobTarget.z - live.ploob.z)
    // Waiting at the thing: a slow breath and a glow at his feet, not a hop.
    // (His son, 2026-09-19: the bounce was too fast. A glow reads as "here".)
    const waiting = !!target && far < 0.6
    const breathe = waiting ? Math.sin(t.current * 1.4) * 0.04 + 0.04 : 0
    const grp = g.current
    if (grp) {
      grp.position.set(live.ploob.x, Math.max(0, live.pos.y - 0.6) + breathe, live.ploob.z)
      grp.visible = s.room === 'none'
    }
    const halo = glow.current
    if (halo) {
      const target01 = waiting ? 1 : 0
      glowAmt.current += (target01 - glowAmt.current) * (1 - Math.pow(0.05, dt))
      const a = glowAmt.current
      const pulse = 1 + 0.12 * Math.sin(t.current * 1.4)
      halo.scale.setScalar(a * pulse)
      halo.visible = a > 0.02
      ;(halo.material as THREE.MeshBasicMaterial).opacity = 0.55 * a
    }
  })
  return (
    <group ref={g} name="companion">
      <PloobCutout position={[0, 0, 0]} height={0.9} />
      <mesh ref={glow} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={3}>
        <circleGeometry args={[0.7, 32]} />
        <meshBasicMaterial map={haloTexture()} color="#FFC46A" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}
