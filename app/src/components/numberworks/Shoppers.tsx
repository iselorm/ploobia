import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { artUrl, loadTexture, type ArtAssetId } from '@/lib/marketassets'
import type { MarketSim } from '@/lib/marketsim'
import { SHOPPERS_PER_DAY } from '@/lib/market'

/**
 * The crowd: painted cutouts that walk the alley as bobbing billboards.
 *
 * A shopper is a silhouette that walks past; a rigged mesh is the wrong cost
 * for that (the asset brief), so each is a plane with a cutout texture — or,
 * until the cutout arrives, a plain capsule in one of three colours. Where
 * each one is comes from the day run: they reach the stall at their `at`, the
 * buyers pause there for a moment, everyone else keeps walking.
 *
 * Between days the same crowd drifts through slowly, so the alley is never
 * empty and the stall never looks abandoned.
 */

const LOOKS: ArtAssetId[] = ['shopper-woman-basket', 'shopper-man-bag', 'shopper-elder-stick']
const STANDIN: string[] = ['#3F5F8C', '#8A5A2B', '#2F6134']
const ASPECT = 573 / 768
const HEIGHT = 1.62
const STALL_X = 1.15
/**
 * The alley runs BEHIND the stall. The camera is on the seller's side of the
 * table, so the shoppers are the people the board faces: they walk past on
 * the far side, above the table top, and a buyer stops at the counter. With
 * the alley in front of the table the first build put a wall of cutouts
 * between the learner and the basin — the crowd hid the instrument.
 */
const ALLEY_Z = -2.3
/** World units of alley one day-fraction of walking covers. */
const SPEED = 46

function useCutouts(): (THREE.Texture | null)[] {
  const [texs, setTexs] = useState<(THREE.Texture | null)[]>([null, null, null])
  useEffect(() => {
    let live = true
    Promise.all(LOOKS.map((id) => loadTexture(artUrl(id)))).then((t) => {
      if (live) setTexs(t)
    })
    return () => {
      live = false
    }
  }, [])
  return texs
}

function Shopper({ sim, index, texture, color }: { sim: MarketSim; index: number; texture: THREE.Texture | null; color: string }) {
  const group = useRef<THREE.Group>(null)
  const camera = useThree((s) => s.camera)
  useFrame(() => {
    const g = group.current
    if (!g) return
    const s = sim.shoppers[index]
    if (!s) {
      g.visible = false
      return
    }
    const run = sim.run
    // Between days: a slow drift on the sim clock so the alley breathes.
    const t = run ? run.t : (sim.time * 0.012 + index * 0.025) % 1
    let x = STALL_X + (s.at - t) * SPEED
    // A buyer pauses at the stall for a moment.
    if (run) {
      const sale = run.sales.find((sl) => sl.shopper === index)
      if (sale && t >= s.at && t < s.at + 0.02) x = STALL_X
      else if (sale && t >= s.at + 0.02) x = STALL_X + (s.at + 0.02 - t) * SPEED
    }
    if (x > 9.5 || x < -9.5) {
      g.visible = false
      return
    }
    g.visible = true
    const bob = Math.abs(Math.sin(sim.time * 7 + index)) * 0.03
    g.position.set(x, bob, ALLEY_Z + Math.sin(index * 1.7) * 0.35)
    // face the camera, stay upright, and face the way they walk
    g.rotation.y = Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z)
    g.scale.x = camera.position.z > g.position.z ? 1 : -1
  })
  return (
    <group ref={group} visible={false}>
      {texture ? (
        <mesh position={[0, HEIGHT / 2, 0]} castShadow>
          <planeGeometry args={[HEIGHT * ASPECT, HEIGHT]} />
          <meshBasicMaterial map={texture} transparent alphaTest={0.4} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ) : (
        <mesh position={[0, HEIGHT / 2, 0]} castShadow>
          <capsuleGeometry args={[0.17, HEIGHT - 0.34, 4, 10]} />
          <meshStandardMaterial color={color} roughness={0.9} />
        </mesh>
      )}
    </group>
  )
}

export default function Shoppers({ sim }: { sim: MarketSim }) {
  const texs = useCutouts()
  const indices = useMemo(() => Array.from({ length: SHOPPERS_PER_DAY }, (_, i) => i), [])
  return (
    <group name="shoppers">
      {indices.map((i) => {
        const look = sim.shoppers[i]?.look ?? (i % 3)
        return <Shopper key={i} sim={sim} index={i} texture={texs[look]} color={STANDIN[look]} />
      })}
    </group>
  )
}
