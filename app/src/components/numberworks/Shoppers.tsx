import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { artUrl, loadTexture, type ArtAssetId } from '@/lib/marketassets'
import type { MarketSim } from '@/lib/marketsim'
import { SHOPPERS_PER_DAY, cedis } from '@/lib/market'

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
 * empty and the stall never looks abandoned — and (review 1) the crowd is the
 * lever's answer: at the price on the board, only the shoppers who would stop
 * are in the alley. A head-count, never a list: which ones buy is the day's
 * own reveal, as a bubble over each head as it settles.
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
/** How long a bubble stays over a head, in sim seconds. */
const BUBBLE_S = 1.4

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

interface Bubble {
  text: string
  tone: 'buy' | 'pass' | 'think'
  until: number
}

/**
 * What a settlement says over the head. One in four is a thought, not a sum.
 * In a replay (review 2's hero) every buyer shows the COUNT they take —
 * buyers are people, sold is tomatoes, and the alley must be seen to add up.
 */
function bubbleFor(kind: 'sale' | 'pass', n: number, paid: number, seq: number, replay: boolean): Bubble {
  const think = !replay && seq % 4 === 3
  if (kind === 'sale') {
    const each = n > 0 ? Math.round((paid / n) * 100) / 100 : paid
    if (replay) return { text: `takes ${n} · ${cedis(paid, 2)}`, tone: 'buy', until: 0 }
    return { text: think ? `${cedis(each, 2)} ✓` : n > 1 ? `${n} × ${cedis(each, 2)} = ${cedis(paid, 2)}` : `${cedis(paid, 2)}`, tone: think ? 'think' : 'buy', until: 0 }
  }
  return { text: think ? 'too much' : 'walks on', tone: think ? 'think' : 'pass', until: 0 }
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
    // Between days: the lever's answer — only the shoppers who would stop at
    // the price on the board are in the alley.
    if (!run && sim.previewPrice !== null && sim.previewPrice > s.limit + 1e-9) {
      g.visible = false
      return
    }
    let x: number
    if (run) {
      const t = run.t
      x = STALL_X + (s.at - t) * SPEED
      // A buyer pauses at the stall for a moment.
      const sale = run.sales.find((sl) => sl.shopper === index)
      if (sale && t >= s.at && t < s.at + 0.02) x = STALL_X
      else if (sale && t >= s.at + 0.02) x = STALL_X + (s.at + 0.02 - t) * SPEED
    } else {
      // Between days: the whole crowd strolls the alley, spread by a golden
      // ratio so it never bunches — the crowd `at` is sorted, and a drift
      // keyed on the index walked everyone off together, which left the
      // alley empty for most of a minute. What the lever thins is this.
      const k = (((index * 0.6180339887) % 1) + sim.time * 0.02) % 1
      x = 9.5 - k * 19
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

interface Floating extends Bubble {
  seq: number
  at: number
}

/**
 * The settlements, as lines that rise from the counter: every shopper
 * settles at the stall (that is what `at` is), so the line floats up from
 * where the sale happened and fades — a walker who has moved on is not
 * chased across the alley. Driven from the sim's log a few times a second.
 */
function Bubbles({ sim }: { sim: MarketSim }) {
  const [list, setList] = useState<Floating[]>([])
  const listRef = useRef(list)
  useEffect(() => {
    listRef.current = list
  }, [list])
  const seen = useRef(-1)
  const lastSweep = useRef(0)
  const lastTick = useRef(0)
  const [, setTick] = useState(0)
  const group = useRef<THREE.Group>(null)
  useFrame(() => {
    let next = listRef.current
    let changed = false
    // While anything is floating, re-render a dozen times a second so it rises.
    if (next.length && sim.time - lastTick.current > 0.08) {
      lastTick.current = sim.time
      setTick((t) => t + 1)
    }
    for (const r of sim.recent) {
      if (r.seq <= seen.current) continue
      seen.current = r.seq
      next = [...next, { ...bubbleFor(r.kind, r.n, r.paid, r.seq, sim.replay), seq: r.seq, at: r.at, until: r.at + BUBBLE_S }].slice(-4)
      changed = true
    }
    if (sim.time - lastSweep.current > 0.2) {
      lastSweep.current = sim.time
      const kept = next.filter((b) => b.until > sim.time)
      if (kept.length !== next.length) {
        next = kept
        changed = true
      }
    }
    if (changed) setList(next)
  })
  return (
    <group ref={group} position={[STALL_X, HEIGHT + 0.15, ALLEY_Z]} name="bubbles">
      {list.map((b, i) => {
        const age = Math.max(0, sim.time - b.at)
        const k = Math.min(1, age / BUBBLE_S)
        return (
          <Html key={b.seq} position={[(i % 2 === 0 ? -0.75 : 0.75) + (i - (list.length - 1) / 2) * 0.35, k * 0.9 + (list.length - 1 - i) * 0.32, 0]} center zIndexRange={[15, 10]} style={{ pointerEvents: 'none' }}>
            <span
              data-testid="bubble"
              data-tone={b.tone}
              style={{
                display: 'inline-block',
                whiteSpace: 'nowrap',
                padding: '3px 9px',
                borderRadius: 999,
                fontFamily: 'Nunito, system-ui, sans-serif',
                fontWeight: 900,
                fontSize: 13,
                lineHeight: 1.2,
                border: '1px solid',
                opacity: 1 - k * k,
                background: b.tone === 'buy' ? '#E7F1E3' : b.tone === 'pass' ? '#F7E3E0' : '#FCFAF4',
                borderColor: b.tone === 'buy' ? '#C8DFC2' : b.tone === 'pass' ? '#EDC2BC' : '#E4DCC9',
                color: b.tone === 'buy' ? '#2F6134' : b.tone === 'pass' ? '#9A302A' : '#5F5A4E',
                boxShadow: '0 2px 6px rgba(40,30,10,.18)',
              }}
            >
              {b.text}
            </span>
          </Html>
        )
      })}
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
      <Bubbles sim={sim} />
    </group>
  )
}
