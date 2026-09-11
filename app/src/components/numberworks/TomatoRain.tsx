import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import type { MarketSim } from '@/lib/marketsim'
import { rain as rainFor } from '@/lib/market'

/**
 * The gather round: tomatoes fall over the alley; tap one and it is in the
 * basin. Seeded, so two people on one link catch from the same sky; tapped,
 * not timed, so the clock is a catch and never a countdown. The bank is the
 * page's — this only reports taps. (Same shape as the Foundry's rain.)
 */

interface Drop {
  x: number
  z: number
  at: number
  dur: number
}

export default function TomatoRain({ sim, seed, startAt, seconds, onCatch }: { sim: MarketSim; seed: number; startAt: number; seconds: number; onCatch: () => void }) {
  const drops = useMemo<Drop[]>(() => {
    return rainFor(seed).map((r) => ({ x: -2.6 + r.lane * 5.2, z: 0.4 + ((r.lane * 7.3) % 1) * 1.6, at: startAt + r.at * seconds, dur: r.dur }))
  }, [seed, startAt, seconds])
  return (
    <group name="rain">
      {drops.map((d, i) => (
        <Tomato key={i} d={d} sim={sim} onCatch={onCatch} />
      ))}
    </group>
  )
}

function Tomato({ d, sim, onCatch }: { d: Drop; sim: MarketSim; onCatch: () => void }) {
  const group = useRef<THREE.Group>(null)
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  const caughtAt = useRef<number | null>(null)
  useFrame(() => {
    const g = group.current
    if (!g) return
    const t = sim.time
    if (t < d.at) {
      g.visible = false
      return
    }
    if (caughtAt.current !== null) {
      const k = Math.min(1, (t - caughtAt.current) / 0.3)
      g.visible = k < 1
      g.scale.setScalar(1 + k * 1.4)
      if (mat.current) mat.current.opacity = 1 - k
      return
    }
    const k = (t - d.at) / d.dur
    if (k > 1.1) {
      g.visible = false
      return
    }
    g.visible = true
    const y = 4.4 - Math.min(1, k) * 4.1
    g.position.set(d.x + Math.sin(t * 0.8 + d.z) * 0.1, y, d.z)
    g.rotation.set(t * 1.3, t * 0.7, 0)
    const fade = k > 1 ? 1 - (k - 1) / 0.1 : 1
    g.scale.setScalar(fade)
    if (mat.current) mat.current.opacity = fade
  })
  return (
    <group
      ref={group}
      visible={false}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        if (caughtAt.current !== null) return
        const t = sim.time
        if (t < d.at || (t - d.at) / d.dur > 1.1) return
        caughtAt.current = t
        onCatch()
      }}
    >
      <mesh>
        <sphereGeometry args={[0.32, 8, 6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh castShadow>
        <sphereGeometry args={[0.12, 16, 12]} />
        <meshStandardMaterial ref={mat} color="#E0432A" emissive="#7A1F12" emissiveIntensity={0.35} roughness={0.4} transparent />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <coneGeometry args={[0.05, 0.06, 5]} />
        <meshStandardMaterial color="#3E7C43" />
      </mesh>
    </group>
  )
}
