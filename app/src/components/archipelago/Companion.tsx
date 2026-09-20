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

export default function Companion() {
  const g = useRef<THREE.Group>(null)
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
    // Excited hop when he has somewhere to be and is nearly there.
    const hop = target && far < 0.6 ? Math.abs(Math.sin(t.current * 6)) * 0.22 : 0
    const grp = g.current
    if (grp) {
      grp.position.set(live.ploob.x, Math.max(0, live.pos.y - 0.6) + hop, live.ploob.z)
      grp.visible = s.room === 'none'
    }
  })
  return (
    <group ref={g} name="companion">
      <PloobCutout position={[0, 0, 0]} height={0.9} />
    </group>
  )
}
