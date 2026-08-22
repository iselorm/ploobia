import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import type { WorldState } from '@/lib/world'
import {
  bedH,
  channelW,
  DEFENCES,
  FLOAT_RUN,
  GAUGE_S,
  LEVEE_H,
  meanderX,
  profileH,
  stageAt,
  STATION_BY_ID,
  STATIONS,
  VILLAGE_S,
  valleyH,
  waterY,
  worldZ,
  type RiverSim,
} from '@/lib/river'

/* ------------------------------------------------------------------ */
/* World-space text tags (canvas texture, depth-tested — never <Html>) */
/* ------------------------------------------------------------------ */

export function makeTag(width = 256, height = 96): { tex: THREE.CanvasTexture; draw: (lines: string[], accent?: string) => void } {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d')!
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  let last = ''
  const draw = (lines: string[], accent = '#7FD4FF') => {
    const key = lines.join('|') + accent
    if (key === last) return
    last = key
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = 'rgba(10, 22, 32, 0.72)'
    ctx.beginPath()
    ctx.roundRect(2, 2, width - 4, height - 4, 14)
    ctx.fill()
    ctx.strokeStyle = accent
    ctx.lineWidth = 2.5
    ctx.stroke()
    ctx.textAlign = 'center'
    lines.forEach((line, i) => {
      ctx.fillStyle = i === 0 ? accent : '#EAF4F8'
      ctx.font = i === 0 ? 'bold 26px system-ui, sans-serif' : 'bold 22px system-ui, sans-serif'
      ctx.fillText(line, width / 2, 34 + i * 28)
    })
    tex.needsUpdate = true
  }
  return { tex, draw }
}

function Tag({
  getLines,
  accent,
  scale = [1.5, 0.56],
  offset = [0, 0.5, 0],
  getPos,
  visible,
}: {
  getLines: (t: number) => string[]
  accent?: string
  scale?: [number, number]
  offset?: [number, number, number]
  getPos: (out: THREE.Vector3) => void
  visible: (t: number) => boolean
}) {
  const { tex, draw } = useMemo(() => makeTag(), [])
  const ref = useRef<THREE.Mesh>(null)
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime
    const on = visible(t)
    ref.current.visible = on
    if (!on) return
    draw(getLines(t), accent)
    getPos(v)
    ref.current.position.set(v.x + offset[0], v.y + offset[1], v.z + offset[2])
    ref.current.quaternion.copy(camera.quaternion)
  })
  return (
    <mesh ref={ref}>
      <planeGeometry args={scale} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ */
/* Stations: poles, tape, sounding rule, the float                     */
/* ------------------------------------------------------------------ */

function Pole({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <group position={[x, y, z]}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[0, 0.14 + i * 0.28, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 0.28, 8]} />
          <meshStandardMaterial color={i % 2 ? '#E8E4DA' : '#C13B33'} roughness={0.7} />
        </mesh>
      ))}
    </group>
  )
}

function StationKit({ sim, id }: { sim: RiverSim; id: 'st1' | 'st2' | 'st3' }) {
  const st = STATION_BY_ID[id]
  const group = useRef<THREE.Group>(null)
  const tapeRef = useRef<THREE.Mesh>(null)
  const ruleRef = useRef<THREE.Mesh>(null)
  const floatRef = useRef<THREE.Mesh>(null)
  const active = () => sim.station === id

  const sUp = st.s - FLOAT_RUN / 2
  const sDown = st.s + FLOAT_RUN / 2

  useFrame(() => {
    if (!group.current) return
    group.current.visible = sim.mapT < 0.55
    const w = channelW(st.s)
    // Tape across the channel (animated when measuring width).
    if (tapeRef.current) {
      const on = active() && sim.tapeT >= 0
      tapeRef.current.visible = on
      if (on) {
        const p = Math.min(1, sim.tapeT / 1.1)
        tapeRef.current.scale.x = Math.max(0.02, p)
        tapeRef.current.position.x = meanderX(st.s, sim.years) - (w / 2) * (1 - p)
      }
    }
    // Sounding rule stepping across the bed.
    if (ruleRef.current) {
      const on = active() && sim.soundT >= 0
      ruleRef.current.visible = on
      if (on) {
        const p = Math.min(0.999, sim.soundT / 2.2)
        const step = Math.floor(p * 5) / 4
        const x = meanderX(st.s, sim.years) + (step - 0.5) * w * 0.9
        const bed = bedH(st.s, sim.years) + Math.cos((step - 0.5) * Math.PI) * -0.06
        ruleRef.current.position.set(x, bed + 0.55, worldZ(st.s))
      }
    }
    // The orange float rides the current between the poles.
    if (floatRef.current) {
      const on = sim.floatActive && sim.station === id
      floatRef.current.visible = on
      if (on) {
        floatRef.current.position.set(
          meanderX(sim.floatS, sim.years),
          waterY(sim, sim.floatS) + 0.05,
          worldZ(sim.floatS),
        )
      }
    }
  })

  const w0 = channelW(st.s)
  const bankX = meanderX(st.s) + w0 / 2 + 1.0
  const y = valleyH(bankX, worldZ(st.s)) + 0.02
  const upX = meanderX(sUp) + channelW(sUp) / 2 + 0.8
  const downX = meanderX(sDown) + channelW(sDown) / 2 + 0.8

  return (
    <group ref={group}>
      <Pole x={upX} y={valleyH(upX, worldZ(sUp))} z={worldZ(sUp)} />
      <Pole x={downX} y={valleyH(downX, worldZ(sDown))} z={worldZ(sDown)} />
      {/* Station marker stone */}
      <mesh position={[bankX + 0.6, y + 0.12, worldZ(st.s)]}>
        <boxGeometry args={[0.5, 0.26, 0.36]} />
        <meshStandardMaterial color="#8A8578" roughness={0.9} />
      </mesh>
      <Tag
        getLines={() => [st.name.split(' — ')[0], st.name.split(' — ')[1] ?? '']}
        accent={active() ? '#FFD87E' : '#9ABFD4'}
        getPos={(v) => v.set(bankX + 0.6, y + 0.7, worldZ(st.s))}
        visible={() => sim.mapT < 0.5}
        scale={[1.7, 0.62]}
      />
      {/* Fastest-water prediction flag */}
      {sim.fastestFlag === id && (
        <group position={[bankX + 1.3, y, worldZ(st.s)]}>
          <mesh position={[0, 0.55, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 1.1, 6]} />
            <meshStandardMaterial color="#E8E4DA" />
          </mesh>
          <mesh position={[0.22, 0.92, 0]}>
            <planeGeometry args={[0.44, 0.28]} />
            <meshStandardMaterial color="#E8A33D" emissive="#E8A33D" emissiveIntensity={0.7} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}
      <mesh ref={tapeRef} position={[meanderX(st.s), profileH(st.s) + 0.16, worldZ(st.s)]} visible={false}>
        <boxGeometry args={[w0, 0.015, 0.06]} />
        <meshStandardMaterial color="#F2EDE0" emissive="#F2EDE0" emissiveIntensity={0.25} />
      </mesh>
      <mesh ref={ruleRef} visible={false}>
        <boxGeometry args={[0.04, 1.1, 0.04]} />
        <meshStandardMaterial color="#E8C24A" emissive="#E8C24A" emissiveIntensity={0.35} />
      </mesh>
      <mesh ref={floatRef} visible={false}>
        <sphereGeometry args={[0.09, 12, 10]} />
        <meshStandardMaterial color="#F08A2E" emissive="#F08A2E" emissiveIntensity={0.55} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* The gauge station — the flood's telemetry instrument                */
/* ------------------------------------------------------------------ */

function GaugeStation({ sim, world }: { sim: RiverSim; world: WorldState }) {
  const group = useRef<THREE.Group>(null)
  const lampRef = useRef<THREE.MeshStandardMaterial>(null)
  const floodLineRef = useRef<THREE.Mesh>(null)
  const s = GAUGE_S
  const x = meanderX(s) + channelW(s) / 2 + 1.1
  const y = valleyH(x, worldZ(s))

  useFrame(() => {
    if (!group.current) return
    group.current.visible = sim.mapT < 0.55
    if (lampRef.current) {
      const night = world.daylight < 0.35
      lampRef.current.emissiveIntensity = night ? 1.6 + Math.sin(sim.time * 2) * 0.2 : 0.15
    }
    if (floodLineRef.current) {
      floodLineRef.current.visible = sim.floodLine !== null && sim.mapT < 0.5
      if (sim.floodLine !== null) floodLineRef.current.position.y = y + sim.floodLine
    }
  })

  return (
    <group ref={group}>
      {/* The post, marked in stage bands */}
      <group position={[x, y, worldZ(s)]}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh key={i} position={[0, 0.11 + i * 0.22, 0]}>
            <boxGeometry args={[0.09, 0.22, 0.09]} />
            <meshStandardMaterial color={i % 2 ? '#EAE6DA' : '#2E6DA8'} roughness={0.6} />
          </mesh>
        ))}
        <mesh position={[0, 1.5, 0]}>
          <sphereGeometry args={[0.09, 10, 8]} />
          <meshStandardMaterial ref={lampRef} color="#FFE9B0" emissive="#FFD87E" emissiveIntensity={0.2} />
        </mesh>
      </group>
      {/* The hut */}
      <group position={[x + 0.9, y, worldZ(s) + 0.6]}>
        <mesh position={[0, 0.4, 0]}>
          <boxGeometry args={[0.8, 0.8, 0.7]} />
          <meshStandardMaterial color="#B7AB92" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.92, 0]} rotation={[0, Math.PI / 4, 0]}>
          <coneGeometry args={[0.68, 0.4, 4]} />
          <meshStandardMaterial color="#7A5A42" roughness={0.8} />
        </mesh>
      </group>
      <Tag
        getLines={() => {
          const st = stageAt(sim, s)
          return ['Gauge station', `Q ${sim.q.toFixed(2)} m³/s`, st > 1 ? 'OVER BANKFULL' : `stage ${(st * 100).toFixed(0)}%`]
        }}
        accent={stageAt(sim, s) > 1 ? '#FF8A7A' : '#7FD4FF'}
        getPos={(v) => v.set(x, y + 2.0, worldZ(s))}
        visible={() => sim.visionOn && sim.mapT < 0.5}
        scale={[1.8, 0.68]}
      />
      {/* The learner's called flood line */}
      <mesh ref={floodLineRef} position={[x - 1.2, y + 0.4, worldZ(s)]} visible={false}>
        <boxGeometry args={[2.6, 0.02, 0.06]} />
        <meshStandardMaterial color="#FFD87E" emissive="#FFD87E" emissiveIntensity={1.2} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* The village and its defences                                        */
/* ------------------------------------------------------------------ */

const HOUSE_SHAPE = [
  { off: 3.6, w: 0.9, d: 0.7, rot: 0.2 },
  { off: 5.4, w: 1.1, d: 0.8, rot: -0.3 },
  { off: 4.0, w: 0.8, d: 0.7, rot: 0.5 },
  { off: 3.4, w: 1.0, d: 0.75, rot: 0 },
  { off: 5.8, w: 0.9, d: 0.7, rot: 0.8 },
  { off: 4.4, w: 1.2, d: 0.85, rot: -0.5 },
  { off: 3.6, w: 0.85, d: 0.65, rot: 0.3 },
  { off: 5.2, w: 1.0, d: 0.75, rot: -0.2 },
]
const HOUSES = VILLAGE_S.map((s, i) => ({ s, ...HOUSE_SHAPE[i % HOUSE_SHAPE.length] }))

function Village({ sim, world }: { sim: RiverSim; world: WorldState }) {
  const group = useRef<THREE.Group>(null)
  const windowMats = useRef<Array<THREE.MeshStandardMaterial | null>>([])
  const bodyMats = useRef<Array<THREE.MeshStandardMaterial | null>>([])
  const tint = useMemo(() => new THREE.Color(), [])

  useFrame(() => {
    if (!group.current) return
    group.current.visible = sim.mapT < 0.55
    const night = 1 - THREE.MathUtils.smoothstep(world.daylight, 0.2, 0.5)
    for (const m of windowMats.current) if (m) m.emissiveIntensity = 0.1 + night * (1.8 + Math.sin(sim.time * 0.7) * 0.15)
    tint.set('#C9B594').lerp(new THREE.Color('#6E5844'), sim.damage * 0.8)
    for (const m of bodyMats.current) if (m) m.color.copy(tint)
  })

  return (
    <group ref={group}>
      {HOUSES.map((h, i) => {
        const x = meanderX(h.s) + channelW(h.s) / 2 + h.off
        const y = valleyH(x, worldZ(h.s))
        return (
          <group key={i} position={[x, y, worldZ(h.s)]} rotation={[0, h.rot, 0]}>
            <mesh position={[0, 0.32, 0]} castShadow>
              <boxGeometry args={[h.w, 0.64, h.d]} />
              <meshStandardMaterial ref={(el) => void (bodyMats.current[i] = el)} color="#C9B594" roughness={0.85} />
            </mesh>
            <mesh position={[0, 0.78, 0]} rotation={[0, 0, 0]}>
              <coneGeometry args={[Math.max(h.w, h.d) * 0.78, 0.42, 4]} />
              <meshStandardMaterial color="#8A5A3E" roughness={0.8} />
            </mesh>
            <mesh position={[0, 0.34, h.d / 2 + 0.006]}>
              <planeGeometry args={[0.2, 0.22]} />
              <meshStandardMaterial ref={(el) => void (windowMats.current[i] = el)} color="#3A3226" emissive="#FFC873" emissiveIntensity={0.1} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

function Defences({ sim }: { sim: RiverSim }) {
  const group = useRef<THREE.Group>(null)
  const refs = useRef<Record<string, THREE.Group | null>>({})
  useFrame(() => {
    if (!group.current) return
    group.current.visible = sim.mapT < 0.55
    for (const d of DEFENCES) {
      const g = refs.current[d.id]
      if (g) g.visible = sim.defences.has(d.id)
    }
  })
  const leveeSegs = useMemo(() => {
    const out: Array<{ x: number; y: number; z: number; rot: number; side: number }> = []
    for (let s = GAUGE_S - 8; s <= GAUGE_S + 14; s += 2.1) {
      for (const side of [-1, 1]) {
        const x = meanderX(s) + side * (channelW(s) / 2 + 0.55)
        out.push({ x, y: profileH(s) + LEVEE_H / 2, z: worldZ(s), rot: -(meanderX(s + 1) - meanderX(s - 1)) / 2, side })
      }
    }
    return out
  }, [])
  return (
    <group ref={group}>
      {/* Levées: earth banks either side of the village reach */}
      <group ref={(el) => void (refs.current.levee = el)} visible={false}>
        {leveeSegs.map((l, i) => (
          <mesh key={i} position={[l.x, l.y, l.z]} rotation={[0, l.rot, 0]}>
            <boxGeometry args={[0.55, LEVEE_H, 2.3]} />
            <meshStandardMaterial color="#8A7A5A" roughness={0.95} />
          </mesh>
        ))}
      </group>
      {/* The dam across the gorge mouth */}
      <group ref={(el) => void (refs.current.dam = el)} visible={false} position={[meanderX(64), 0, worldZ(64)]}>
        <mesh position={[0, profileH(64) + 0.8, 0]}>
          <boxGeometry args={[7, 2.6, 0.8]} />
          <meshStandardMaterial color="#AFAA9E" roughness={0.6} />
        </mesh>
        <mesh position={[0, profileH(64) + 2.15, 0]}>
          <boxGeometry args={[7.2, 0.16, 1.0]} />
          <meshStandardMaterial color="#8F8A80" roughness={0.6} />
        </mesh>
      </group>
      {/* The storage basin */}
      <group ref={(el) => void (refs.current.basin = el)} visible={false} position={[meanderX(108) - channelW(108) / 2 - 3.8, profileH(108) - 0.12, worldZ(108)]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[2.1, 24]} />
          <meshStandardMaterial color="#3E5866" roughness={0.2} />
        </mesh>
        <mesh position={[0, 0.1, 0]}>
          <torusGeometry args={[2.15, 0.14, 8, 24]} />
          <meshStandardMaterial color="#8A7A5A" roughness={0.95} />
        </mesh>
      </group>
      {/* Afforestation: a young plantation on the headwater slopes */}
      <group ref={(el) => void (refs.current.trees = el)} visible={false}>
        {Array.from({ length: 26 }, (_, i) => {
          const s = 6 + (i % 13) * 2.4
          const side = i < 13 ? -1 : 1
          const x = meanderX(s) + side * (3.2 + (i % 5))
          return (
            <mesh key={i} position={[x, valleyH(x, worldZ(s)) + 0.35, worldZ(s)]}>
              <coneGeometry args={[0.22, 0.7, 6]} />
              <meshStandardMaterial color="#3E7C43" roughness={0.85} />
            </mesh>
          )
        })}
      </group>
      {/* Channelisation: pale straight training walls through the village */}
      <group ref={(el) => void (refs.current.channel = el)} visible={false}>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[meanderX(GAUGE_S) + side * (channelW(GAUGE_S) / 2), profileH(GAUGE_S) + 0.12, worldZ(GAUGE_S)]} rotation={[0, -0.06, 0]}>
            <boxGeometry args={[0.24, 0.5, 14]} />
            <meshStandardMaterial color="#C9C4B8" roughness={0.5} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* The hero pebble                                                     */
/* ------------------------------------------------------------------ */

function Pebble({ sim }: { sim: RiverSim }) {
  const ref = useRef<THREE.Mesh>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  useFrame(() => {
    const p = sim.pebble
    if (ref.current) {
      ref.current.visible = sim.mapT < 0.55
      const hop = p.mode === 'saltation' ? Math.abs(Math.sin(sim.time * 6)) * 0.18 : p.mode === 'suspension' ? 0.25 + Math.sin(sim.time * 3) * 0.08 : 0
      ref.current.position.set(meanderX(p.s, sim.years) + 0.2, bedH(p.s, sim.years) + 0.07 + hop, worldZ(p.s))
      const k = 0.1 + p.size * 0.12
      ref.current.scale.setScalar(k / 0.12)
    }
    if (ringRef.current) {
      ringRef.current.visible = sim.pebbleRing !== null && sim.mapT < 0.5
      if (sim.pebbleRing !== null) {
        ringRef.current.position.set(meanderX(sim.pebbleRing, sim.years), profileH(sim.pebbleRing) + 0.06, worldZ(sim.pebbleRing))
      }
    }
  })
  return (
    <group>
      <mesh ref={ref}>
        <icosahedronGeometry args={[0.12, 0]} />
        <meshStandardMaterial color="#7A8490" roughness={0.7} flatShading />
      </mesh>
      <Tag
        getLines={() => {
          const p = sim.pebble
          const mode = p.mode === 'rest' ? 'at rest' : p.mode
          return ['Your pebble', `${mode} · round ${(p.roundness * 100).toFixed(0)}%`]
        }}
        accent="#C9D4DE"
        getPos={(v) => v.set(meanderX(sim.pebble.s, sim.years) + 0.2, bedH(sim.pebble.s, sim.years) + 0.75, worldZ(sim.pebble.s))}
        visible={() => sim.visionOn && sim.mapT < 0.5 && !sim.rideActive}
        scale={[1.5, 0.56]}
      />
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.5, 0.68, 32]} />
        <meshBasicMaterial color="#FFD87E" transparent opacity={0.85} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Ploob — the raindrop who narrates the demo                          */
/* ------------------------------------------------------------------ */

function Ploob({ sim }: { sim: RiverSim }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(({ camera }) => {
    if (!ref.current) return
    ref.current.visible = sim.ploobActive && sim.mapT < 0.6
    if (!sim.ploobActive) {
      sim.follow.active = false
      return
    }
    const s = sim.ploobS
    const x = meanderX(s, sim.years)
    const y = waterY(sim, s) + 0.16 + Math.sin(sim.time * 2.2) * 0.04
    const z = worldZ(s)
    ref.current.position.set(x, y, z)
    ref.current.lookAt(camera.position.x, y + 0.4, camera.position.z)
    sim.follow.x = x
    sim.follow.y = y
    sim.follow.z = z
    sim.follow.active = true
  })
  return (
    <group ref={ref} visible={false}>
      {/* the droplet */}
      <mesh position={[0, 0.09, 0]} scale={[1, 1.2, 1]}>
        <sphereGeometry args={[0.16, 16, 14]} />
        <meshStandardMaterial color="#7FC4EE" roughness={0.25} emissive="#3E7CA8" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0, 0.29, 0]} rotation={[0, 0, 0]}>
        <coneGeometry args={[0.09, 0.16, 12]} />
        <meshStandardMaterial color="#7FC4EE" roughness={0.25} emissive="#3E7CA8" emissiveIntensity={0.3} />
      </mesh>
      {/* the "oo" eyes */}
      {[-0.055, 0.055].map((ex, i) => (
        <group key={i} position={[ex, 0.12, 0.145]}>
          <mesh>
            <sphereGeometry args={[0.038, 10, 8]} />
            <meshStandardMaterial color="#FBF5EA" />
          </mesh>
          <mesh position={[0, 0, 0.026]}>
            <sphereGeometry args={[0.018, 8, 6]} />
            <meshStandardMaterial color="#2A2A33" />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Everything on the ground, in one mount                              */
/* ------------------------------------------------------------------ */

export default function FieldKit({ sim, world }: { sim: RiverSim; world: WorldState }) {
  return (
    <group>
      {STATIONS.map((st) => (
        <StationKit key={st.id} sim={sim} id={st.id} />
      ))}
      <GaugeStation sim={sim} world={world} />
      <Village sim={sim} world={world} />
      <Defences sim={sim} />
      <Pebble sim={sim} />
      <Ploob sim={sim} />
    </group>
  )
}
