import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import {
  BALL_RADIUS,
  flightElapsed,
  rollPathAt,
  SURFACE_BY_ID,
  simNow,
  type MotionSim,
} from '@/lib/motion'
import { flightAt } from '@/lib/yard'
import { CAR_Y, LANE_TOP, LANE_Z, PAD_POS, worldX } from './YardKit'
import { launchWorld } from './Launchers'
import { telemetryTag } from './textures'

const HOLO = '#5FE0D2'
const VEL = '#3BD2FF'
const GRAV = '#FF9A4A'
const FRICTION = '#FF5A4A'

const UP = new THREE.Vector3(0, 1, 0)

/* ------------------------------------------------------------------ */
/* Arrows — one reusable shaft+head group                              */
/* ------------------------------------------------------------------ */

function makeArrow(color: string): THREE.Group {
  const g = new THREE.Group()
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false })
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 8), mat)
  shaft.name = 'shaft'
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.1, 12), mat)
  head.name = 'head'
  g.add(shaft)
  g.add(head)
  g.visible = false
  return g
}

const scratchDir = new THREE.Vector3()

function setArrow(g: THREE.Group, from: THREE.Vector3, dir: THREE.Vector3, len: number): void {
  if (len < 0.06) {
    g.visible = false
    return
  }
  g.visible = true
  g.position.copy(from)
  scratchDir.copy(dir).normalize()
  g.quaternion.setFromUnitVectors(UP, scratchDir)
  const head = 0.1
  const shaft = g.children[0] as THREE.Mesh
  const cone = g.children[1] as THREE.Mesh
  shaft.scale.set(1, Math.max(0.01, len - head), 1)
  shaft.position.y = (len - head) / 2
  cone.position.y = len - head / 2
}

/* ------------------------------------------------------------------ */
/* Telemetry tag — the racing-HUD readout on whatever is moving        */
/* ------------------------------------------------------------------ */

function TelemetryTags({ sim }: { sim: MotionSim }) {
  const tag = useMemo(() => telemetryTag(), [])
  const sprite = useRef<THREE.Sprite>(null)
  const lastDraw = useRef(0)

  useFrame(() => {
    const s = sprite.current
    if (!s) return
    const now = simNow(sim)
    let show = false
    let px = 0
    let py = 0
    let pz = 0
    let big = ''
    let small = ''
    let bar = 0
    let delta: string | null = null

    if (sim.mode === 'roll' && sim.rollPath.length > 1) {
      const dur = sim.rollPath[sim.rollPath.length - 1].t
      const t = sim.rolling ? Math.min(now - sim.rollStartAt, dur) : dur
      const cur = rollPathAt(sim.rollPath, t)
      show = true
      px = worldX(cur.x)
      py = CAR_Y + 0.42
      pz = LANE_Z
      big = `${cur.v.toFixed(2)}`
      small = `${t.toFixed(1)} s · ${Math.max(0, cur.x).toFixed(2)} m · m/s`
      bar = cur.v / 1.7
      // Ghost delta: when did the ghost pass this point?
      if (sim.ghostRoll && sim.rolling && cur.x > 0.02) {
        const gs = sim.ghostRoll
        for (let i = 1; i < gs.length; i++) {
          if (gs[i].x >= cur.x) {
            const a = gs[i - 1]
            const b = gs[i]
            const u = (cur.x - a.x) / Math.max(1e-9, b.x - a.x)
            const gt = a.t + (b.t - a.t) * u
            const d = t - gt
            delta = `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(2)} s`
            break
          }
        }
      }
    } else if (sim.mode === 'launch' && sim.flight) {
      const t = flightElapsed(sim)
      const f = flightAt(sim.flight, t)
      const v = Math.hypot(f.vx, f.vy)
      show = true
      const [x, y, z] = launchWorld(f.x, f.y + 0.45)
      px = x
      py = y
      pz = z
      big = `${v.toFixed(2)}`
      small = `${t.toFixed(1)} s · ${f.x.toFixed(2)} m · m/s`
      bar = v / 12
    } else if (sim.mode === 'drop' && (sim.dropping || sim.landedAt !== null)) {
      const t = sim.dropping ? now - sim.dropStartAt : (sim.landedAt ?? now) - sim.dropStartAt
      const v = Math.min(sim.g * t, Math.sqrt(2 * sim.g * sim.dropH0))
      show = true
      px = PAD_POS[0] - 0.12
      py = PAD_POS[1] + 0.1 + sim.ballAY + 0.35
      pz = PAD_POS[2]
      big = `${v.toFixed(2)}`
      small = `${Math.min(t, 99).toFixed(2)} s · ${sim.ballAY.toFixed(2)} m up · m/s`
      bar = v / 8
    }

    s.visible = show
    if (show) {
      s.position.set(px, py, pz)
      const wall = performance.now()
      if (wall - lastDraw.current > 90) {
        lastDraw.current = wall
        tag.draw(big, small, bar, delta)
      }
    }
  })

  return (
    <sprite ref={sprite} scale={[0.82, 0.42, 1]} visible={false}>
      <spriteMaterial map={tag.texture} transparent depthWrite={false} toneMapped={false} />
    </sprite>
  )
}

/* ------------------------------------------------------------------ */
/* Strobe trail — the multi-flash photograph, every 0.1 s              */
/* ------------------------------------------------------------------ */

const STROBE_MAX = 160

function StrobeTrail({ sim }: { sim: MotionSim }) {
  const inst = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame(() => {
    const m = inst.current
    if (!m) return
    const now = simNow(sim)
    let n = 0
    const put = (x: number, y: number, z: number) => {
      if (n >= STROBE_MAX) return
      dummy.position.set(x, y, z)
      dummy.updateMatrix()
      m.setMatrixAt(n, dummy.matrix)
      n++
    }
    if (sim.mode === 'roll' && sim.rollPath.length > 1) {
      const dur = sim.rollPath[sim.rollPath.length - 1].t
      const t = sim.rolling ? Math.min(now - sim.rollStartAt, dur) : dur
      for (let ts = 0; ts <= t + 1e-9; ts += 0.1) {
        const p = rollPathAt(sim.rollPath, ts)
        put(worldX(p.x), CAR_Y + 0.02, LANE_Z)
      }
    } else if (sim.mode === 'launch' && sim.flight) {
      const t = flightElapsed(sim)
      for (let ts = 0; ts <= Math.min(t, sim.flight.T) + 1e-9; ts += 0.1) {
        const f = flightAt(sim.flight, ts)
        const [x, y, z] = launchWorld(f.x, f.y)
        put(x, y, z)
      }
    } else if (sim.mode === 'drop' && (sim.dropping || sim.landedAt !== null)) {
      const tl = sim.landedAt === null ? now - sim.dropStartAt : (sim.landedAt - sim.dropStartAt)
      const y0 = PAD_POS[1] + 0.06 + BALL_RADIUS
      for (let ts = 0; ts <= tl + 1e-9; ts += 0.1) {
        const h = Math.max(0, sim.dropH0 - 0.5 * sim.g * ts * ts)
        put(PAD_POS[0] - 0.12, y0 + h, PAD_POS[2])
      }
    }
    m.count = n
    m.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={inst} args={[undefined, undefined, STROBE_MAX]} frustumCulled={false}>
      <sphereGeometry args={[0.02, 10, 8]} />
      <meshBasicMaterial color={HOLO} transparent opacity={0.85} toneMapped={false} depthWrite={false} />
    </instancedMesh>
  )
}

/* ------------------------------------------------------------------ */
/* Ghost run — the previous run's faded trail, racing you              */
/* ------------------------------------------------------------------ */

const GHOST_MAX = 600

function useGhostLine(color: string) {
  return useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(GHOST_MAX * 3), 3))
    geo.setDrawRange(0, 0)
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.3, toneMapped: false })
    return new THREE.Line(geo, mat)
  }, [color])
}

function GhostRun({ sim }: { sim: MotionSim }) {
  const rollLine = useGhostLine('#BFE8FF')
  const arcLine = useGhostLine('#BFE8FF')
  const ghostCar = useRef<THREE.Mesh>(null)
  const ghostBall = useRef<THREE.Mesh>(null)
  const lastRoll = useRef<unknown>(null)
  const lastArc = useRef<unknown>(null)

  useFrame(() => {
    const now = simNow(sim)
    // Roll ghost
    if (sim.ghostRoll !== lastRoll.current) {
      lastRoll.current = sim.ghostRoll
      const pos = rollLine.geometry.getAttribute('position') as THREE.BufferAttribute
      const gs = sim.ghostRoll ?? []
      const n = Math.min(gs.length, GHOST_MAX)
      for (let i = 0; i < n; i++) pos.setXYZ(i, worldX(gs[i].x), CAR_Y, LANE_Z + 0.09)
      pos.needsUpdate = true
      rollLine.geometry.setDrawRange(0, n)
    }
    rollLine.visible = sim.mode === 'roll' && !!sim.ghostRoll
    if (ghostCar.current) {
      const showGhost = sim.mode === 'roll' && sim.rolling && !!sim.ghostRoll
      ghostCar.current.visible = showGhost
      if (showGhost && sim.ghostRoll) {
        const p = rollPathAt(sim.ghostRoll, now - sim.rollStartAt)
        ghostCar.current.position.set(worldX(p.x), CAR_Y, LANE_Z + 0.09)
      }
    }
    // Launch ghost
    if (sim.ghostFlight !== lastArc.current) {
      lastArc.current = sim.ghostFlight
      const pos = arcLine.geometry.getAttribute('position') as THREE.BufferAttribute
      const path = sim.ghostFlight?.path ?? []
      const n = Math.min(path.length, GHOST_MAX)
      for (let i = 0; i < n; i++) {
        const [x, y, z] = launchWorld(path[i].x, path[i].y)
        pos.setXYZ(i, x, y, z + 0.06)
      }
      pos.needsUpdate = true
      arcLine.geometry.setDrawRange(0, n)
    }
    arcLine.visible = sim.mode === 'launch' && !!sim.ghostFlight
    if (ghostBall.current) {
      const show = sim.mode === 'launch' && sim.launching && !!sim.ghostFlight
      ghostBall.current.visible = show
      if (show && sim.ghostFlight) {
        const f = flightAt(sim.ghostFlight, now - sim.launchStartAt)
        const [x, y, z] = launchWorld(f.x, f.y)
        ghostBall.current.position.set(x, y, z + 0.06)
      }
    }
  })

  return (
    <group>
      <primitive object={rollLine} />
      <primitive object={arcLine} />
      <mesh ref={ghostCar} visible={false}>
        <boxGeometry args={[0.2, 0.1, 0.1]} />
        <meshBasicMaterial color="#BFE8FF" transparent opacity={0.3} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh ref={ghostBall} visible={false}>
        <sphereGeometry args={[BALL_RADIUS, 16, 12]} />
        <meshBasicMaterial color="#BFE8FF" transparent opacity={0.3} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* The v–t curtain — the graph standing on the lane where it happened  */
/* ------------------------------------------------------------------ */

const CURTAIN_Z = LANE_Z - 0.42
const V_SCALE = 0.55

function VtCurtain({ sim }: { sim: MotionSim }) {
  const mesh = useRef<THREE.Mesh>(null)
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const maxV = 620
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxV * 2 * 3), 3))
    const idx: number[] = []
    for (let i = 0; i < maxV - 1; i++) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    g.setIndex(idx)
    g.setDrawRange(0, 0)
    return g
  }, [])
  const topLine = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(620 * 3), 3))
    g.setDrawRange(0, 0)
    const mat = new THREE.LineBasicMaterial({ color: HOLO, transparent: true, opacity: 0.95, toneMapped: false })
    return new THREE.Line(g, mat)
  }, [])
  const built = useRef<unknown>(null)
  const samples = useRef(0)

  useFrame(() => {
    const m = mesh.current
    if (!m) return
    if (sim.rollPath !== built.current) {
      built.current = sim.rollPath
      const pos = geo.getAttribute('position') as THREE.BufferAttribute
      const top = topLine.geometry.getAttribute('position') as THREE.BufferAttribute
      const path = sim.rollPath
      const n = Math.min(path.length, 618)
      for (let i = 0; i < n; i++) {
        const x = worldX(path[i].x)
        pos.setXYZ(i * 2, x, LANE_TOP, CURTAIN_Z)
        pos.setXYZ(i * 2 + 1, x, LANE_TOP + path[i].v * V_SCALE, CURTAIN_Z)
        top.setXYZ(i, x, LANE_TOP + path[i].v * V_SCALE, CURTAIN_Z)
      }
      pos.needsUpdate = true
      top.needsUpdate = true
      samples.current = n
    }
    const visible = sim.mode === 'roll' && samples.current > 1
    m.visible = visible
    topLine.visible = visible
    if (visible) {
      const dur = sim.rollPath[sim.rollPath.length - 1].t
      const t = sim.rolling ? Math.min(simNow(sim) - sim.rollStartAt, dur) : dur
      const upto = Math.max(0, Math.min(samples.current - 1, Math.floor(t / 0.05)))
      geo.setDrawRange(0, upto * 6)
      topLine.geometry.setDrawRange(0, upto + 1)
    }
  })

  return (
    <group>
      <mesh ref={mesh} geometry={geo} frustumCulled={false} visible={false}>
        <meshBasicMaterial color={HOLO} transparent opacity={0.2} side={THREE.DoubleSide} toneMapped={false} depthWrite={false} />
      </mesh>
      <primitive object={topLine} />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Flight arc + vectors                                               */
/* ------------------------------------------------------------------ */

function LaunchArc({ sim, showComponents }: { sim: MotionSim; showComponents: boolean }) {
  const line = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(GHOST_MAX * 3), 3))
    g.setDrawRange(0, 0)
    const mat = new THREE.LineBasicMaterial({ color: HOLO, transparent: true, opacity: 0.9, toneMapped: false })
    return new THREE.Line(g, mat)
  }, [])
  const built = useRef<unknown>(null)
  const vArrow = useMemo(() => makeArrow(VEL), [])
  const gArrow = useMemo(() => makeArrow(GRAV), [])
  const vxArrow = useMemo(() => makeArrow('#8FD8E8'), [])
  const vyArrow = useMemo(() => makeArrow('#8FD8E8'), [])
  const from = useMemo(() => new THREE.Vector3(), [])
  const dir = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    if (sim.flight !== built.current) {
      built.current = sim.flight
      const pos = line.geometry.getAttribute('position') as THREE.BufferAttribute
      const path = sim.flight?.path ?? []
      const n = Math.min(path.length, GHOST_MAX)
      for (let i = 0; i < n; i++) {
        const [x, y, z] = launchWorld(path[i].x, path[i].y)
        pos.setXYZ(i, x, y, z)
      }
      pos.needsUpdate = true
    }
    const active = sim.mode === 'launch' && sim.flight !== null
    line.visible = active
    if (!active || !sim.flight) {
      vArrow.visible = gArrow.visible = vxArrow.visible = vyArrow.visible = false
      return
    }
    const t = flightElapsed(sim)
    const upto = Math.max(1, Math.min(sim.flight.path.length, Math.floor(t / 0.02) + 1))
    line.geometry.setDrawRange(0, upto)
    const f = flightAt(sim.flight, t)
    const [x, y, z] = launchWorld(f.x, f.y)
    from.set(x, y, z)
    if (sim.launching) {
      setArrow(vArrow, from, dir.set(f.vx, f.vy, 0), Math.hypot(f.vx, f.vy) * 0.1)
      setArrow(gArrow, from, dir.set(0, -1, 0), Math.min(1.1, 0.045 * sim.g + 0.12))
      if (showComponents) {
        setArrow(vxArrow, from, dir.set(1, 0, 0), Math.abs(f.vx) * 0.1)
        setArrow(vyArrow, from, dir.set(0, Math.sign(f.vy) || 1, 0), Math.abs(f.vy) * 0.1)
      } else {
        vxArrow.visible = vyArrow.visible = false
      }
    } else {
      vArrow.visible = gArrow.visible = vxArrow.visible = vyArrow.visible = false
    }
  })

  return (
    <group>
      <primitive object={line} />
      <primitive object={vArrow} />
      <primitive object={gArrow} />
      <primitive object={vxArrow} />
      <primitive object={vyArrow} />
    </group>
  )
}

function RollVectors({ sim }: { sim: MotionSim }) {
  const vArrow = useMemo(() => makeArrow(VEL), [])
  const fArrow = useMemo(() => makeArrow(FRICTION), [])
  const from = useMemo(() => new THREE.Vector3(), [])
  const dir = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    if (sim.mode !== 'roll' || !sim.rolling) {
      vArrow.visible = fArrow.visible = false
      return
    }
    const t = simNow(sim) - sim.rollStartAt
    const p = rollPathAt(sim.rollPath, t)
    from.set(worldX(p.x) + 0.12, CAR_Y + 0.09, LANE_Z)
    setArrow(vArrow, from, dir.set(1, 0, 0), p.v * 0.45)
    const mu = SURFACE_BY_ID[sim.surface].mu
    from.set(worldX(p.x) - 0.12, CAR_Y + 0.02, LANE_Z)
    setArrow(fArrow, from, dir.set(-1, 0, 0), p.v > 0.01 ? Math.max(0.09, mu * sim.g * 1.6) : 0)
  })
  return (
    <group>
      <primitive object={vArrow} />
      <primitive object={fArrow} />
    </group>
  )
}

function DropVectors({ sim }: { sim: MotionSim }) {
  const vArrow = useMemo(() => makeArrow(VEL), [])
  const from = useMemo(() => new THREE.Vector3(), [])
  const dir = useMemo(() => new THREE.Vector3(0, -1, 0), [])
  useFrame(() => {
    if (sim.mode !== 'drop' || !sim.dropping) {
      vArrow.visible = false
      return
    }
    const t = simNow(sim) - sim.dropStartAt
    const v = sim.g * t
    from.set(PAD_POS[0] - 0.12, PAD_POS[1] + 0.1 + sim.ballAY - BALL_RADIUS, PAD_POS[2])
    setArrow(vArrow, from, dir, v * 0.08)
  })
  return <primitive object={vArrow} />
}

/* ------------------------------------------------------------------ */

export default function Vision({ sim, on, showComponents }: { sim: MotionSim; on: boolean; showComponents: boolean }) {
  if (!on) return null
  return (
    <group>
      <TelemetryTags sim={sim} />
      <StrobeTrail sim={sim} />
      <GhostRun sim={sim} />
      <VtCurtain sim={sim} />
      <LaunchArc sim={sim} showComponents={showComponents} />
      <RollVectors sim={sim} />
      <DropVectors sim={sim} />
    </group>
  )
}
