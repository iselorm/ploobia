import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { getWorld, questTarget } from '@/lib/archipelago'
import { control, live } from './live'

/**
 * The way-finder: AR-style chevrons flowing along the ground from the
 * explorer toward the current step's target, and a small arrow floating over
 * the explorer's head that points the same way.
 *
 * Selorm 2026-09-19: "arrow hints indicating where to go … flash for like
 * 3 seconds and become guides for navigation to tasks." So it shows itself
 * for ~3 s whenever the step changes, again on H (or a tap on Ploob's hint),
 * and gives a quieter nudge if the explorer has drifted far from the target
 * and stopped. It never stays up: the world should be read, not followed.
 */

const SHOW_S = 3
const FADE_S = 0.6
const N = 7
const SPACING = 0.85
const START = 1.3
const NEAR = 2.2
const NUDGE_AFTER_S = 9
const NUDGE_EVERY_S = 14
const NUDGE_FROM_M = 5

const COLOR = new THREE.Color('#FFB347')
const INK = new THREE.Color('#2A1E14')
const DIR = new THREE.Vector3()
const M = new THREE.Matrix4()
const Q = new THREE.Quaternion()
const P = new THREE.Vector3()
const S = new THREE.Vector3(1, 1, 1)
/** The chevron geometry points −Z after it is laid flat. */
const FWD = new THREE.Vector3(0, 0, -1)

function chevron(): THREE.BufferGeometry {
  // A flat chevron pointing along +Z, 0.5 m wide.
  const shape = new THREE.Shape()
  shape.moveTo(-0.25, -0.12)
  shape.lineTo(0, 0.12)
  shape.lineTo(0.25, -0.12)
  shape.lineTo(0.25, -0.26)
  shape.lineTo(0, -0.02)
  shape.lineTo(-0.25, -0.26)
  shape.closePath()
  const g = new THREE.ShapeGeometry(shape)
  g.rotateX(-Math.PI / 2) // lay it on the ground; shape +y → world +z
  return g
}

export default function Guide() {
  const inst = useRef<THREE.InstancedMesh>(null)
  const instInk = useRef<THREE.InstancedMesh>(null)
  const arrow = useRef<THREE.Group>(null)
  const geo = useMemo(() => chevron(), [])
  // Two tones so it reads on sand and on stone: an ink chevron a little larger, amber on top.
  const fill = useMemo(() => new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0, toneMapped: false, depthWrite: false, side: THREE.DoubleSide }), [])
  const ink = useMemo(() => new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0, toneMapped: false, depthWrite: false, side: THREE.DoubleSide }), [])
  const st = useRef({ step: '', until: 0, t: 0, still: 0, lastNudge: -99, lastPos: new THREE.Vector3() })

  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw)
    const m = st.current
    m.t += dt
    const s = getWorld()
    const playing = s.phase === 'play' && s.room === 'none' && !s.crane.active
    const target = playing ? questTarget(s, [live.pos.x, live.pos.z]) : null

    // Triggers: a new step, the key, or a nudge when far and stopped.
    if (s.step !== m.step) {
      m.step = s.step
      m.until = m.t + SHOW_S
    }
    if (control.hint) {
      control.hint = false
      if (playing) m.until = m.t + SHOW_S
    }
    const moved = m.lastPos.distanceToSquared(live.pos) > 0.01
    m.still = moved ? 0 : m.still + dt
    m.lastPos.copy(live.pos)
    const dist = target ? Math.hypot(target[0] - live.pos.x, target[2] - live.pos.z) : 0
    if (target && dist > NUDGE_FROM_M && m.still > NUDGE_AFTER_S && m.t - m.lastNudge > NUDGE_EVERY_S) {
      m.lastNudge = m.t
      m.until = m.t + SHOW_S
    }

    const remaining = m.until - m.t
    const alpha = !target || !playing || dist < NEAR || remaining <= 0 ? 0 : Math.min(1, remaining / FADE_S)
    const mesh = inst.current
    const meshInk = instInk.current
    const grp = arrow.current
    if (!mesh || !meshInk || !grp) return
    mesh.visible = meshInk.visible = grp.visible = alpha > 0
    if (alpha <= 0) return
    fill.opacity = 0.95 * alpha
    ink.opacity = 0.6 * alpha

    DIR.set(target![0] - live.pos.x, 0, target![2] - live.pos.z)
    const len = DIR.length() || 1
    DIR.divideScalar(len)
    Q.setFromUnitVectors(FWD, DIR)
    // Chevrons flow toward the target; the first fades in, the last fades out.
    const flow = (m.t * 1.6) % SPACING
    const reach = Math.min(len - 1.0, START + (N - 1) * SPACING)
    for (let i = 0; i < N; i++) {
      const d = START + i * SPACING + flow
      const k = d > reach ? 0 : 1.4 * (0.9 + 0.1 * Math.sin(m.t * 5 + i))
      // 3 cm above the explorer's feet (the capsule's bottom), whatever the ground here is.
      P.set(live.pos.x + DIR.x * d, live.pos.y - 0.49, live.pos.z + DIR.z * d)
      S.setScalar(k)
      M.compose(P, Q, S)
      mesh.setMatrixAt(i, M)
      P.y -= 0.005
      S.setScalar(k * 1.28)
      M.compose(P, Q, S)
      meshInk.setMatrixAt(i, M)
    }
    mesh.instanceMatrix.needsUpdate = true
    meshInk.instanceMatrix.needsUpdate = true
    // The arrow overhead, bobbing, pointing the same way.
    grp.position.set(live.pos.x, live.pos.y + 1.2 + Math.sin(m.t * 3) * 0.05, live.pos.z)
    grp.quaternion.copy(Q)
    const pulse = 1.5 + 0.12 * Math.sin(m.t * 6)
    grp.scale.setScalar(pulse)
  })

  return (
    <>
      <instancedMesh ref={instInk} args={[geo, ink, N]} frustumCulled={false} renderOrder={4} />
      <instancedMesh ref={inst} args={[geo, fill, N]} frustumCulled={false} renderOrder={5} />
      {/* the marker over the explorer: the same chevron, on an ink disc, lying flat so the game camera reads it */}
      <group ref={arrow} visible={false} renderOrder={6}>
        <mesh material={ink} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0.04]} renderOrder={6}>
          <circleGeometry args={[0.36, 24]} />
        </mesh>
        <mesh geometry={geo} material={fill} position={[0, 0, 0.02]} renderOrder={7} />
      </group>
    </>
  )
}
