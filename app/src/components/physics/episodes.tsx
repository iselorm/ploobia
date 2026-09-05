import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import PloobModel from '@/components/brand/PloobModel'
import {
  A3_LANE,
  A6_HALF,
  BALLS,
  CRATE_MASS,
  FLAG_AT,
  FLOORS,
  LANE,
  LEDGE_H,
  PLOOB_PULL,
  dragA1,
  holdArrowA4,
  releaseArrowA4,
  tapRunnerA3,
  tugAcceleration,
  type PhysicsSim,
  type Vocab,
} from '@/lib/physics'
import { Anchor, Ball, Crate, CRATE, Flag, FLOOR, ForceArrow, Label, Lane, Post, Pulse, Ruler, useDragLock, type AnchorMap } from './objects'

/**
 * The seven episode objects. Each is the one thing on the floor while its
 * episode runs, and each reads the sim directly in its frame loop so the
 * picture never lags the physics.
 */

export interface EpisodeProps {
  sim: PhysicsSim
  anchors: AnchorMap
  pulseId: string | null
  vocab: Vocab
  /** Whether the learner may act (Play beat and after, not during a card). */
  live: boolean
}

const PLOOB_H = 0.5
const FORCE_SCALE = 0.06

/* ------------------------------------------------------------------ */
/* Floor drag helper — projects the pointer onto the floor plane      */
/* ------------------------------------------------------------------ */

function useFloorPoint() {
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -FLOOR), [])
  const hit = useMemo(() => new THREE.Vector3(), [])
  return (e: ThreeEvent<PointerEvent>): THREE.Vector3 | null => {
    if (e.ray.intersectPlane(plane, hit)) return hit
    return null
  }
}

/** A Ploob that moves. `posRef` is written by the parent's frame loop. */
function MovingPloob({ posRef, tint = 'gold', height = PLOOB_H }: { posRef: React.MutableRefObject<THREE.Vector3>; tint?: 'gold' | 'blue' | 'green' | 'red' | 'violet'; height?: number }) {
  const g = useRef<THREE.Group>(null)
  useFrame(() => {
    if (g.current) g.current.position.copy(posRef.current)
  })
  return (
    <group ref={g}>
      <PloobModel position={[0, 0, 0]} height={height} tint={tint} faceCamera />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* A1 — Where is it?                                                  */
/* ------------------------------------------------------------------ */

export function EpisodeA1({ sim, anchors, pulseId, live }: EpisodeProps) {
  const x0 = -LANE / 2
  const pos = useRef(new THREE.Vector3(x0, FLOOR, 0))
  const floorPoint = useFloorPoint()
  const [reading, setReading] = useState(0)
  const dragging = useRef(false)
  const [lock, unlock] = useDragLock()

  useFrame(() => {
    pos.current.set(x0 + sim.a1.x, FLOOR, 0)
    if (Math.abs(sim.a1.x - reading) > 0.01) setReading(sim.a1.x)
  })

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (!live) return
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    lock()
    dragging.current = true
    sim.a1.dragging = true
  }
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return
    const p = floorPoint(e)
    if (p) dragA1(sim, p.x - x0)
  }
  const onUp = () => {
    if (!dragging.current) return
    dragging.current = false
    sim.a1.dragging = false
    unlock()
  }

  return (
    <group name="subject">
      <Lane x0={x0} length={LANE} />
      <Anchor id="post" anchors={anchors} position={[x0, FLOOR, 0.25]}>
        <Post position={[0, 0, 0]} />
        <Label text="start" size={0.15} position={[0, 0.66, 0]} color="#5C4A35" />
        <Pulse active={pulseId === 'post'} radius={0.35} />
      </Anchor>
      <Flag position={[x0 + FLAG_AT, FLOOR, -0.32]} />
      <Ruler x0={x0} reading={reading} max={LANE} />
      {/* Footprints along the path, so path and distance-from-post are visibly different things */}
      <Footprints sim={sim} x0={x0} />
      {/* The draggable Ploob and a generous grab volume */}
      <Anchor id="runner" anchors={anchors}>
        <MovingPloob posRef={pos} />
      </Anchor>
      <mesh position={[0, FLOOR + 0.3, 0]} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}  name="a1-grab">
        <boxGeometry args={[LANE + 1, 1.2, 1.2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <group position={[x0, FLOOR, 0]}>
        <Pulse active={pulseId === 'runner' || pulseId === 'ruler'} radius={0.4} />
      </group>
    </group>
  )
}

function Footprints({ sim, x0 }: { sim: PhysicsSim; x0: number }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const N = 60
  const last = useRef(-1)
  const count = useRef(0)
  useFrame(() => {
    if (!ref.current) return
    const x = sim.a1.x
    if (last.current < 0 || Math.abs(x - last.current) > 0.12) {
      last.current = x
      const i = count.current % N
      dummy.position.set(x0 + x, FLOOR + 0.004, (count.current % 2 ? 0.07 : -0.07))
      dummy.rotation.set(-Math.PI / 2, 0, 0)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      ref.current.setMatrixAt(i, dummy.matrix)
      count.current++
      ref.current.instanceMatrix.needsUpdate = true
    }
  })
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, N]} frustumCulled={false}>
      <circleGeometry args={[0.045, 10]} />
      <meshBasicMaterial color="#B79A6E" transparent opacity={0.55} depthWrite={false} />
    </instancedMesh>
  )
}

/* ------------------------------------------------------------------ */
/* A2 — How fast?                                                     */
/* ------------------------------------------------------------------ */

export function EpisodeA2({ sim, anchors, pulseId }: EpisodeProps) {
  const x0 = -LANE / 2
  const blue = useRef(new THREE.Vector3(x0, FLOOR, -0.31))
  const gold = useRef(new THREE.Vector3(x0, FLOOR, 0.31))
  const [reading, setReading] = useState(0)
  useFrame(() => {
    blue.current.set(x0 + sim.a2.x[0], FLOOR, -0.31)
    gold.current.set(x0 + sim.a2.x[1], FLOOR, 0.31)
    const r = sim.a2.runs > 0 ? sim.a2.x[0] : 0
    if (Math.abs(r - reading) > 0.01) setReading(r)
  })
  return (
    <group name="subject">
      <Lane x0={x0} length={LANE} lanes={2} />
      <Post position={[x0, FLOOR, -0.62]} />
      <Post position={[x0, FLOOR, 0.62]} />
      <Post position={[x0 + LANE, FLOOR, -0.62]} color="#2E6DA8" />
      <Post position={[x0 + LANE, FLOOR, 0.62]} color="#2E6DA8" />
      <Label text="finish" size={0.15} position={[x0 + LANE, FLOOR + 0.66, 0]} color="#2E6DA8" />
      <Anchor id="ruler" anchors={anchors} position={[x0 + LANE / 2, FLOOR, 0.78]}>
        <Pulse active={pulseId === 'ruler'} radius={0.5} />
      </Anchor>
      <Ruler x0={x0} reading={reading} max={LANE} z={0.78} color="#F2A25C" showTenths={sim.a2.runs > 0} />
      <Anchor id="runner" anchors={anchors}>
        <MovingPloob posRef={blue} tint="blue" />
      </Anchor>
      <MovingPloob posRef={gold} tint="gold" />
      <group position={[x0 + LANE, FLOOR, -0.31]}>
        <Pulse active={pulseId === 'runner'} radius={0.4} />
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* A3 — The line it leaves behind                                     */
/* ------------------------------------------------------------------ */

const BOARD_W = 2.6
const BOARD_H = 1.7
const BOARD_X = 0
const BOARD_Z = -1.45
const BOARD_Y = FLOOR + 0.25

export function EpisodeA3({ sim, anchors, pulseId, live }: EpisodeProps) {
  const x0 = -A3_LANE / 2
  const pos = useRef(new THREE.Vector3(x0, FLOOR, 0))
  const canvas = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 768
    c.height = 502
    return c
  }, [])
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [canvas])
  const guide = useRef<THREE.Line>(null)
  const guideGeom = useMemo(() => new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), [])
  const guideLine = useMemo(() => new THREE.Line(guideGeom, new THREE.LineBasicMaterial({ color: '#2E6DA8', transparent: true, opacity: 0.7 })), [guideGeom])
  const lastDrawn = useRef(-1)

  const T_MAX = 8
  const toBoard = (t: number, x: number): [number, number] => {
    // Board-local: x across from -W/2..W/2, y up from 0..H (graph area inset)
    const gx = -BOARD_W / 2 + 0.28 + (t / T_MAX) * (BOARD_W - 0.4)
    const gy = 0.22 + (x / A3_LANE) * (BOARD_H - 0.42)
    return [gx, gy]
  }

  useFrame(() => {
    const a = sim.a3
    pos.current.set(x0 + a.x, FLOOR, 0)
    // Redraw the board when the trace grew.
    const key = a.trace.length * 1000 + a.ghost.length
    if (key !== lastDrawn.current) {
      lastDrawn.current = key
      drawBoard(canvas, a.trace, a.ghost, T_MAX, A3_LANE)
      texture.needsUpdate = true
    }
    // The pen guide: a thin line from the runner to the pen on the board.
    if (guide.current && a.trace.length) {
      const p = a.trace[a.trace.length - 1]
      const [bx, by] = toBoard(Math.min(T_MAX, p.t), p.x)
      const arr = guideGeom.attributes.position as THREE.BufferAttribute
      arr.setXYZ(0, pos.current.x, FLOOR + 0.5, 0)
      arr.setXYZ(1, BOARD_X + bx, BOARD_Y + by, BOARD_Z + 0.02)
      arr.needsUpdate = true
      guide.current.visible = a.running || a.t > 0
    }
  })

  const onTap = (e: ThreeEvent<PointerEvent>) => {
    if (!live) return
    e.stopPropagation()
    tapRunnerA3(sim)
  }

  return (
    <group name="subject">
      <Lane x0={x0} length={A3_LANE} />
      <Post position={[x0, FLOOR, 0.35]} />
      <Post position={[x0 + A3_LANE, FLOOR, 0.35]} color="#2E6DA8" />
      <Ruler x0={x0} reading={sim.a3.x} max={A3_LANE} z={0.45} showTenths={false} />
      {/* The board */}
      <Anchor id="board" anchors={anchors} position={[BOARD_X, BOARD_Y + BOARD_H / 2, BOARD_Z]}>
        <mesh>
          <planeGeometry args={[BOARD_W, BOARD_H]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0, -0.03]}>
          <boxGeometry args={[BOARD_W + 0.12, BOARD_H + 0.12, 0.04]} />
          <meshStandardMaterial color="#5C4A35" roughness={0.85} />
        </mesh>
      </Anchor>
      {[-BOARD_W / 2 + 0.2, BOARD_W / 2 - 0.2].map((x, i) => (
        <Post key={i} position={[BOARD_X + x, FLOOR, BOARD_Z - 0.06]} height={BOARD_Y - FLOOR + 0.1} color="#5C4A35" />
      ))}
      <primitive object={guideLine} ref={guide} />
      <Anchor id="runner" anchors={anchors}>
        <MovingPloob posRef={pos} tint="blue" />
      </Anchor>
      <mesh position={[0, FLOOR + 0.3, 0]} onPointerDown={onTap}  name="a3-tap">
        <boxGeometry args={[A3_LANE + 1, 1.2, 1.0]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <group position={[x0, FLOOR, 0]}>
        <Pulse active={pulseId === 'runner'} radius={0.4} />
      </group>
      <group position={[BOARD_X, FLOOR, BOARD_Z]}>
        <Pulse active={pulseId === 'board'} radius={1.0} />
      </group>
    </group>
  )
}

function drawBoard(canvas: HTMLCanvasElement, trace: Array<{ t: number; x: number }>, ghost: Array<{ t: number; x: number }>, tMax: number, xMax: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const W = canvas.width
  const H = canvas.height
  ctx.fillStyle = '#FCFAF4'
  ctx.fillRect(0, 0, W, H)
  const L = 82
  const B = H - 66
  const R = W - 36
  const T = 40
  // grid
  ctx.strokeStyle = '#E4DCC9'
  ctx.lineWidth = 2
  for (let s = 0; s <= tMax; s++) {
    const x = L + ((R - L) * s) / tMax
    ctx.beginPath()
    ctx.moveTo(x, T)
    ctx.lineTo(x, B)
    ctx.stroke()
  }
  for (let m = 0; m <= xMax; m++) {
    const y = B - ((B - T) * m) / xMax
    ctx.beginPath()
    ctx.moveTo(L, y)
    ctx.lineTo(R, y)
    ctx.stroke()
  }
  // axes
  ctx.strokeStyle = '#2A2823'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(L, T)
  ctx.lineTo(L, B)
  ctx.lineTo(R, B)
  ctx.stroke()
  ctx.fillStyle = '#2A2823'
  ctx.font = '700 26px Nunito, ui-rounded, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('time (s)', (L + R) / 2, H - 18)
  for (let s = 0; s <= tMax; s += 2) ctx.fillText(String(s), L + ((R - L) * s) / tMax, B + 30)
  ctx.save()
  ctx.translate(26, (T + B) / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText('distance (m)', 0, 0)
  ctx.restore()
  ctx.textAlign = 'right'
  for (let m = 0; m <= xMax; m += 2) ctx.fillText(String(m), L - 12, B - ((B - T) * m) / xMax + 9)
  const plot = (pts: Array<{ t: number; x: number }>, color: string, width: number) => {
    if (pts.length < 2) return
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.lineJoin = 'round'
    ctx.beginPath()
    pts.forEach((p, i) => {
      const x = L + ((R - L) * Math.min(tMax, p.t)) / tMax
      const y = B - ((B - T) * p.x) / xMax
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
  }
  plot(ghost, '#B8B1A0', 4)
  plot(trace, '#2E6DA8', 7)
  if (trace.length) {
    const p = trace[trace.length - 1]
    const x = L + ((R - L) * Math.min(tMax, p.t)) / tMax
    const y = B - ((B - T) * p.x) / xMax
    ctx.fillStyle = '#2E6DA8'
    ctx.beginPath()
    ctx.arc(x, y, 9, 0, Math.PI * 2)
    ctx.fill()
  }
}

/* ------------------------------------------------------------------ */
/* A4 — A push is a force                                             */
/* ------------------------------------------------------------------ */

export function EpisodeA4({ sim, anchors, pulseId, live, vocab }: EpisodeProps) {
  const crate = useRef<THREE.Group>(null)
  const floorPoint = useFloorPoint()
  const [force, setForce] = useState(0)
  const [x, setX] = useState(0)
  const dragging = useRef(false)
  const [lock, unlock] = useDragLock()
  const pushFlash = useRef(0)
  const [flash, setFlash] = useState(0)

  useFrame((_, dt) => {
    const a = sim.a4
    if (crate.current) crate.current.position.set(a.x, FLOOR, 0)
    if (Math.abs(a.x - x) > 0.005) setX(a.x)
    const f = a.holding ? a.force : sim.time < a.pushUntil ? a.force : 0
    if (Math.abs(f - force) > 0.05) setForce(f)
    pushFlash.current = Math.max(0, pushFlash.current - dt)
    if (Math.abs(pushFlash.current - flash) > 0.05) setFlash(pushFlash.current)
  })

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (!live || sim.a4.v !== 0) return
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    lock()
    dragging.current = true
    holdArrowA4(sim, 0)
  }
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return
    const p = floorPoint(e)
    if (!p) return
    const dx = p.x - sim.a4.x
    const dead = Math.sign(dx) * Math.max(0, Math.abs(dx) - CRATE / 2)
    holdArrowA4(sim, dead / FORCE_SCALE)
  }
  const onUp = () => {
    if (!dragging.current) return
    dragging.current = false
    unlock()
    releaseArrowA4(sim)
    pushFlash.current = 0.5
  }

  // While the arrow is held the spring balance is the readout; the arrow only labels itself once released.
  const label = vocab === 'simple' || sim.a4.holding ? undefined : `${Math.abs(force).toFixed(0)} N`

  return (
    <group name="subject">
      <Lane x0={-3.4} length={6.8} color="#D6EAF5" width={0.9} />
      <Label text={vocab === 'simple' ? 'ice' : 'ice · μ 0.05'} size={0.15} position={[-3.0, FLOOR + 0.02, 0.6]} billboard={false} flat color="#5C7EA6" />
      <Anchor id="crate" anchors={anchors}>
        <group ref={crate}>
          <Crate />
          <Pulse active={pulseId === 'crate'} radius={0.45} />
        </group>
      </Anchor>
      <ForceArrow newtons={force} origin={[x + Math.sign(force || 1) * CRATE / 2, FLOOR + CRATE / 2, 0]} scale={FORCE_SCALE} label={label} />
      {/* Spring balance: reads the pull while the arrow is held */}
      {sim.a4.holding && (
        <Label text={`${Math.abs(sim.a4.force).toFixed(0)} N`} color="#C13B33" size={0.28} position={[x, FLOOR + CRATE + 0.35, 0]} outline="rgba(251,245,234,0.95)" />
      )}
      <mesh position={[0, FLOOR + 0.3, 0]} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}  name="a4-grab">
        <boxGeometry args={[8, 1.4, 1.6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* A5 — Two pushes                                                    */
/* ------------------------------------------------------------------ */

export function EpisodeA5({ sim, anchors, pulseId, vocab }: EpisodeProps) {
  const knot = useRef<THREE.Group>(null)
  const [kx, setKx] = useState(0)
  const [counts, setCounts] = useState<[number, number]>([sim.a5.left, sim.a5.right])
  useFrame(() => {
    if (knot.current) knot.current.position.set(sim.a5.x, FLOOR + 0.42, 0)
    if (Math.abs(sim.a5.x - kx) > 0.004) setKx(sim.a5.x)
    if (counts[0] !== sim.a5.left || counts[1] !== sim.a5.right) setCounts([sim.a5.left, sim.a5.right])
  })
  const { net } = tugAcceleration(counts[0], counts[1])
  const bigSide: 'left' | 'right' = counts[0] >= counts[1] ? 'left' : 'right'
  const showN = vocab !== 'simple'
  const teamX = (side: 'left' | 'right', i: number) => (side === 'left' ? -0.8 - i * 0.5 : 0.8 + i * 0.5) + kx

  return (
    <group name="subject">
      <Lane x0={-3.6} length={7.2} color="#EDE4D2" width={0.9} />
      {/* Centre line the knot is judged against */}
      <mesh position={[0, FLOOR + 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.03, 1.1]} />
        <meshBasicMaterial color="#C13B33" toneMapped={false} />
      </mesh>
      {/* Rope */}
      <mesh position={[kx, FLOOR + 0.42, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.02, 0.02, 6.4, 8]} />
        <meshStandardMaterial color="#B79A6E" roughness={0.9} />
      </mesh>
      <Anchor id="knot" anchors={anchors}>
        <group ref={knot}>
          <mesh castShadow>
            <sphereGeometry args={[0.09, 16, 12]} />
            <meshStandardMaterial color="#C13B33" roughness={0.6} />
          </mesh>
          <Pulse active={pulseId === 'knot'} radius={0.3} y={-0.4} />
        </group>
      </Anchor>
      {/* Teams: each Ploob's own pull is drawn as its own arrow on the rope */}
      {(['left', 'right'] as const).map((side) =>
        Array.from({ length: counts[side === 'left' ? 0 : 1] }, (_, i) => (
          <group key={`${side}${i}`}>
            <group position={[teamX(side, i), FLOOR, 0.02]}>
              <PloobModel position={[0, 0, 0]} height={0.46} tint={side === 'left' ? 'blue' : 'gold'} faceCamera={false} rotationY={side === 'left' ? -Math.PI / 2 : Math.PI / 2} />
            </group>
            <ForceArrow newtons={side === 'left' ? -PLOOB_PULL : PLOOB_PULL} origin={[teamX(side, i), FLOOR + 0.62, 0]} scale={0.018} thickness={0.03} color={side === 'left' ? '#2E6DA8' : '#B97D10'} />
          </group>
        )),
      )}
      <Anchor id="teamBig" anchors={anchors} position={[bigSide === 'left' ? -1.3 : 1.3, FLOOR + 0.3, 0]}>
        <Pulse active={pulseId === 'teamBig'} radius={0.7} y={FLOOR - (FLOOR + 0.3) + 0.02} />
      </Anchor>
      <Anchor id="teamSmall" anchors={anchors} position={[bigSide === 'left' ? 1.3 : -1.3, FLOOR + 0.3, 0]}>
        <Pulse active={pulseId === 'teamSmall'} radius={0.7} y={FLOOR - (FLOOR + 0.3) + 0.02} />
      </Anchor>
      {/* Resultant: the thicker arrow above the knot, only when the teams differ */}
      {net !== 0 && (
        <ForceArrow newtons={net} origin={[kx, FLOOR + 1.05, 0]} scale={0.02} thickness={0.07} color="#C13B33" label={showN ? `${Math.abs(net)} N` : undefined} />
      )}
      {net === 0 && counts[0] > 0 && <Label text={vocab === 'simple' ? 'equal' : 'balanced'} color="#3E7C43" size={0.24} position={[kx, FLOOR + 1.1, 0]} />}
      {showN && counts[0] > 0 && <Label text={`${counts[0] * PLOOB_PULL} N`} color="#2E6DA8" size={0.2} position={[-1.3 + kx, FLOOR + 0.95, 0]} />}
      {showN && counts[1] > 0 && <Label text={`${counts[1] * PLOOB_PULL} N`} color="#B97D10" size={0.2} position={[1.3 + kx, FLOOR + 0.95, 0]} />}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* A6 — Why does it stop?                                             */
/* ------------------------------------------------------------------ */

export function EpisodeA6({ sim, anchors, pulseId, vocab }: EpisodeProps) {
  const crate = useRef<THREE.Group>(null)
  const [x, setX] = useState(sim.a6.x)
  const [v, setV] = useState(0)
  const [floorIdx, setFloorIdx] = useState(sim.a6.floor)
  const pushAt = useRef(-10)
  const [pushVisible, setPushVisible] = useState(false)
  useFrame(() => {
    const a = sim.a6
    if (crate.current) crate.current.position.set(a.x, FLOOR, 0)
    if (Math.abs(a.x - x) > 0.004) setX(a.x)
    if (Math.abs(a.v - v) > 0.02) setV(a.v)
    if (a.floor !== floorIdx) setFloorIdx(a.floor)
    if (a.sliding && sim.time - pushAt.current > 3 && Math.abs(a.x - a.startX) < 0.02) pushAt.current = sim.time
    const vis = sim.time - pushAt.current < 0.35
    if (vis !== pushVisible) setPushVisible(vis)
  })
  const floor = FLOORS[floorIdx]
  const friction = sim.a6.sliding ? floor.mu * CRATE_MASS * sim.g : 0
  const last = [...sim.a6.results].reverse().find((r) => r.floor === floorIdx)
  const showN = vocab !== 'simple'

  return (
    <group name="subject">
      <Lane x0={-A6_HALF - 0.4} length={2 * A6_HALF + 0.8} color={floor.color} width={0.9} />
      {floor.id === 'rail' && (
        <mesh position={[0, FLOOR + 0.02, 0]}>
          <boxGeometry args={[2 * A6_HALF + 0.8, 0.02, 0.06]} />
          <meshStandardMaterial color="#6B7684" metalness={0.8} roughness={0.3} />
        </mesh>
      )}
      <Anchor id="floor" anchors={anchors} position={[-A6_HALF + 0.2, FLOOR, 0.7]}>
        <Label text={floor.label[vocab]} size={0.18} position={[0.4, 0.02, 0]} billboard={false} flat color="#5C4A35" />
        <Pulse active={pulseId === 'floor'} radius={0.5} />
      </Anchor>
      <Anchor id="crate" anchors={anchors}>
        <group ref={crate}>
          <Crate />
          <Pulse active={pulseId === 'crate'} radius={0.45} />
        </group>
      </Anchor>
      {/* Your push, briefly */}
      {pushVisible && <ForceArrow newtons={12} origin={[x - CRATE / 2, FLOOR + CRATE / 2, 0]} scale={0.05} color="#2E6DA8" label={vocab === 'simple' ? 'push' : undefined} />}
      {/* Friction: backwards, only while sliding, only when there is any */}
      <ForceArrow newtons={-friction} origin={[x - CRATE / 2, FLOOR + CRATE * 0.8, 0]} scale={0.07} color="#C13B33" label={friction > 0.01 ? (showN ? `${friction.toFixed(1)} N` : vocab === 'simple' ? 'pushes back' : 'friction') : undefined} />
      {last && Number.isFinite(last.dist) && !sim.a6.sliding && (
        <Label text={`${last.dist.toFixed(2)} m`} color="#F2A25C" size={0.26} position={[x, FLOOR + CRATE + 0.4, 0]} outline="rgba(20,34,50,0.85)" />
      )}
      {last && !Number.isFinite(last.dist) && (
        <Label text={vocab === 'simple' ? 'never stops' : 'no stopping distance'} color="#F2A25C" size={0.26} position={[x, FLOOR + CRATE + 0.4, 0]} outline="rgba(20,34,50,0.85)" />
      )}
      {/* Air: a few drifting motes that fade as the air drains */}
      <Motes sim={sim} />
    </group>
  )
}

function Motes({ sim }: { sim: PhysicsSim }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const N = 40
  const seeds = useMemo(() => {
    // A tiny deterministic hash: motes should not reshuffle on every mount.
    const r = (i: number, k: number) => ((Math.sin(i * 127.1 + k * 311.7) * 43758.5453) % 1 + 1) % 1
    return Array.from({ length: N }, (_, i) => ({ x: (r(i, 1) - 0.5) * 7, y: r(i, 2) * 1.6, z: (r(i, 3) - 0.5) * 2.5, p: i }))
  }, [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  useFrame(() => {
    if (!ref.current) return
    const vis = 1 - sim.a6.airDrain
    seeds.forEach((s, i) => {
      const t = sim.time * 0.3 + s.p
      dummy.position.set(s.x + Math.sin(t) * 0.2, FLOOR + 0.2 + s.y + Math.sin(t * 0.7) * 0.1, s.z)
      dummy.scale.setScalar(0.012 * vis)
      dummy.updateMatrix()
      ref.current!.setMatrixAt(i, dummy.matrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, N]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 4]} />
      <meshBasicMaterial color="#FFF6E4" transparent opacity={0.7} depthWrite={false} />
    </instancedMesh>
  )
}

/* ------------------------------------------------------------------ */
/* A7 — Gravity is a pull                                             */
/* ------------------------------------------------------------------ */

export function EpisodeA7({ sim, anchors, pulseId, vocab }: EpisodeProps) {
  const steel = useRef<THREE.Group>(null)
  const wood = useRef<THREE.Group>(null)
  const [y, setY] = useState(LEDGE_H)
  useFrame(() => {
    const a = sim.a7
    if (steel.current) steel.current.position.set(-0.28, FLOOR + a.y[0] + 0.09, 0)
    if (wood.current) wood.current.position.set(0.28, FLOOR + a.y[1] + 0.09, 0)
    if (Math.abs(a.y[0] - y) > 0.004) setY(a.y[0])
  })
  const g = sim.g
  const showN = vocab !== 'simple'
  const landed = sim.a7.landedAt[0]
  return (
    <group name="subject">
      {/* Ledge: a bracket at LEDGE_H the balls sit on until Drop */}
      <group position={[0, FLOOR, 0]}>
        <mesh position={[0, LEDGE_H - 0.03, -0.25]} castShadow>
          <boxGeometry args={[1.0, 0.06, 0.3]} />
          <meshStandardMaterial color="#5C4A35" roughness={0.85} />
        </mesh>
        <Post position={[-0.45, 0, -0.35]} height={LEDGE_H} color="#5C4A35" />
        <Post position={[0.45, 0, -0.35]} height={LEDGE_H} color="#5C4A35" />
        {/* Height marks */}
        {[0, 0.5, 1.0].map((h) => (
          <Label key={h} text={`${h.toFixed(1)} m`} size={0.13} position={[-0.75, h + 0.02, -0.2]} color="#5C4A35" />
        ))}
        <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[0.7, 32]} />
          <meshStandardMaterial color="#EDE4D2" roughness={0.95} />
        </mesh>
      </group>
      <Anchor id="ball" anchors={anchors}>
        <group ref={steel}>
          <Ball radius={0.09} color={BALLS[0].color} metal />
          <Pulse active={pulseId === 'ball'} radius={0.3} y={-0.09 - (y) + 0.02} />
        </group>
      </Anchor>
      <group ref={wood}>
        <Ball radius={0.09} color={BALLS[1].color} />
      </group>
      {/* Weight arrows: down, length ∝ m g. Drawn below each ball. */}
      <DownArrow x={-0.28} top={FLOOR + sim.a7.y[0]} newtons={BALLS[0].kg * g} label={showN ? `${(BALLS[0].kg * g).toFixed(2)} N` : undefined} />
      <DownArrow x={0.28} top={FLOOR + sim.a7.y[1]} newtons={BALLS[1].kg * g} label={showN ? `${(BALLS[1].kg * g).toFixed(2)} N` : undefined} />
      {/* Mass labels never change with the dial */}
      <Label text={vocab === 'technical' ? '0.100 kg' : '100 g'} size={0.16} position={[-0.28, FLOOR + sim.a7.y[0] + 0.32, 0]} color="#2A2823" />
      <Label text={vocab === 'technical' ? '0.020 kg' : '20 g'} size={0.16} position={[0.28, FLOOR + sim.a7.y[1] + 0.32, 0]} color="#2A2823" />
      {landed !== null && <Label text={`${landed.toFixed(2)} s`} color="#7CC283" size={0.28} position={[0.95, FLOOR + 0.35, 0.2]} outline="rgba(20,34,50,0.85)" />}
      <Anchor id="dial" anchors={anchors} position={[1.2, FLOOR + 0.2, 0]}>
        <Pulse active={pulseId === 'dial'} radius={0.4} y={-0.18} />
      </Anchor>
    </group>
  )
}

function DownArrow({ x, top, newtons, label }: { x: number; top: number; newtons: number; label?: string }) {
  const len = Math.max(0.02, newtons * 0.55)
  const y0 = top
  return (
    <group>
      <mesh position={[x, y0 - len / 2, 0.1]}>
        <boxGeometry args={[0.035, len, 0.035]} />
        <meshStandardMaterial color="#C13B33" emissive="#C13B33" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[x, y0 - len - 0.06, 0.1]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.07, 0.14, 12]} />
        <meshStandardMaterial color="#C13B33" emissive="#C13B33" emissiveIntensity={0.3} />
      </mesh>
      {label && <Label text={label} color="#C13B33" size={0.15} position={[x + 0.22, y0 - len / 2, 0.1]} />}
    </group>
  )
}

/* Re-exported so the scene can switch on the id. */
export const EPISODE_COMPONENTS = {
  a1: EpisodeA1,
  a2: EpisodeA2,
  a3: EpisodeA3,
  a4: EpisodeA4,
  a5: EpisodeA5,
  a6: EpisodeA6,
  a7: EpisodeA7,
} as const
