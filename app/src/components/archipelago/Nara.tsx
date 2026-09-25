import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { getWorld, pauseDone, registerInteractable, useWorld, type PlotStage } from '@/lib/archipelago'
import Prop from './Prop'
import { live } from './live'
import { BEDS, SELA_AT } from './landingLayout'

/**
 * Nara, and later Sela — the people of the Landing. Nara stands where the
 * round has her: at her mother's bed with the can, at the far bed when it
 * droops, at the child's plot with the rails. Between places she walks. Her
 * mesh is the Meshy rig when the S0 spend is made; until then a capsule in
 * her colours through the same `Prop`, so the swap is a manifest entry.
 *
 * The pause (stage `pause`) is the round's filmable moment and is played
 * here, in the scene, not on a card: she picks the can up at her mother's
 * bed, stops, puts it down, pushes the probe in, reads it, nods — and walks
 * to the far bed instead. About seven seconds; then the record.
 */

const NARA_AT: Record<PlotStage, [number, number, number]> = {
  arrive: [BEDS.nara[0] + 1.5, 0, BEDS.nara[2] - 0.6],
  met: [BEDS.nara[0] + 1.5, 0, BEDS.nara[2] - 0.6],
  first: [BEDS.nara[0] + 1.5, 0, BEDS.nara[2] - 0.6],
  second: [BEDS.far[0] + 1.4, 0, BEDS.far[2] + 0.9],
  method: [BEDS.nara[0] + 1.5, 0, BEDS.nara[2] - 0.6],
  pause: [BEDS.nara[0] + 1.5, 0, BEDS.nara[2] - 0.6],
  record: [BEDS.far[0] + 1.4, 0, BEDS.far[2] + 0.9],
  page: [BEDS.far[0] + 1.4, 0, BEDS.far[2] + 0.9],
  reward: [BEDS.mine[0] - 1.5, 0, BEDS.mine[2] + 0.4],
  done: [BEDS.mine[0] - 1.5, 0, BEDS.mine[2] + 0.4],
}

const WALK = 1.9

export default function Nara() {
  const s = useWorld()
  const stage = s.plot.stage
  const pos = useRef(new THREE.Vector3(...NARA_AT.arrive))
  const it = useMemo(() => ({ id: 'talk.nara', verb: 'talk' as const, label: 'Nara', pos: [...NARA_AT.arrive] as [number, number, number], radius: 1.9 }), [])
  useEffect(() => registerInteractable(it), [it])
  const g = useRef<THREE.Group>(null)
  const can = useRef<THREE.Group>(null)
  const probe = useRef<THREE.Mesh>(null)
  const head = useRef<THREE.Group>(null)
  const yaw = useRef(Math.PI)
  const pause = useRef({ t0: -1, done: false })

  useFrame((state, dtRaw) => {
    // A walk is paced by wall time, clamped only against a hitch, so she crosses the
    // plaza at the same speed on a slow frame as a fast one.
    const dt = Math.min(0.25, dtRaw)
    const w = getWorld()
    const st = w.plot.stage
    if (live.arrivalWalk) {
      live.arrivalWalk = false
      if (st === 'arrive') pos.current.set(6.2, 0, 11.5)
    }
    const grp = g.current
    if (!grp) return

    // Where she should be — the pause has its own path, timed on the clock.
    let target: [number, number, number] = NARA_AT[st]
    let canUp = 0
    let probeDown = 0
    let nod = 0
    if (st === 'pause') {
      const pz = pause.current
      if (pz.t0 < 0) pz.t0 = state.clock.elapsedTime
      const t = state.clock.elapsedTime - pz.t0
      // 0–1.5 s: at the bed, reaches for the can · 1.5–3: holds it, stops · 3–4: puts it down ·
      // 4–5.5: probes, reads · 5.5–6.3: nods · then walks to the far bed · 7.5 s: done
      canUp = t < 1.5 ? t / 1.5 : t < 3 ? 1 : t < 4 ? 1 - (t - 3) : 0
      probeDown = t < 4 ? 0 : t < 4.6 ? (t - 4) / 0.6 : t < 5.5 ? 1 : Math.max(0, 1 - (t - 5.5) / 0.4)
      nod = t > 5.5 && t < 6.3 ? Math.sin(((t - 5.5) / 0.8) * Math.PI * 2) * 0.2 : 0
      if (t > 6.3) target = NARA_AT.record
      if (t > 7.6 && !pz.done) {
        pz.done = true
        pauseDone()
      }
    } else {
      pause.current.t0 = -1
      pause.current.done = false
    }

    // Walk toward the target; face the way she walks, or the explorer when talking.
    const p = pos.current
    const dx = target[0] - p.x
    const dz = target[2] - p.z
    const d = Math.hypot(dx, dz)
    let wantYaw = yaw.current
    if (d > 0.05) {
      const step = Math.min(d, WALK * dt)
      p.x += (dx / d) * step
      p.z += (dz / d) * step
      wantYaw = Math.atan2(dx, dz)
    } else if (w.talk === 'talk.nara') {
      wantYaw = Math.atan2(live.pos.x - p.x, live.pos.z - p.z)
    } else if (st === 'pause') {
      wantYaw = Math.atan2(BEDS.nara[0] - p.x, BEDS.nara[2] - p.z)
    }
    let dy = wantYaw - yaw.current
    dy = Math.atan2(Math.sin(dy), Math.cos(dy))
    yaw.current += dy * Math.min(1, dt * 6)
    grp.position.set(p.x, 0, p.z)
    grp.rotation.y = yaw.current
    it.pos[0] = p.x
    it.pos[2] = p.z
    grp.visible = w.room === 'none'

    const c = can.current
    if (c) c.position.set(0.42, 0.25 + 0.55 * canUp, 0.2)
    const pr = probe.current
    if (pr) {
      pr.visible = probeDown > 0.01
      pr.position.set(0.1, 0.9 - 0.7 * probeDown, 0.55)
      pr.rotation.x = 0.2 + 0.9 * probeDown
    }
    const h = head.current
    if (h) h.rotation.x = nod
  })

  return (
    <>
      <group ref={g} name="nara" position={NARA_AT.arrive}>
        <Prop id="nara" animate>
          <group>
            {/* teal wrap skirt, mustard top, cream apron, indigo head-wrap */}
            <mesh position={[0, 0.42, 0]} castShadow>
              <cylinderGeometry args={[0.3, 0.34, 0.84, 12]} />
              <meshStandardMaterial color="#2F7F7A" roughness={0.8} />
            </mesh>
            <mesh position={[0, 1.05, 0]} castShadow>
              <capsuleGeometry args={[0.27, 0.42, 6, 12]} />
              <meshStandardMaterial color="#D9A83A" roughness={0.7} />
            </mesh>
            <mesh position={[0, 1.0, 0.2]} castShadow>
              <boxGeometry args={[0.34, 0.5, 0.06]} />
              <meshStandardMaterial color="#F1E7D2" roughness={0.9} />
            </mesh>
            <group ref={head} position={[0, 1.52, 0]}>
              <mesh castShadow>
                <sphereGeometry args={[0.2, 14, 10]} />
                <meshStandardMaterial color="#6E4A2E" roughness={0.6} />
              </mesh>
              <mesh position={[0, 0.14, -0.02]} castShadow>
                <sphereGeometry args={[0.24, 14, 10]} />
                <meshStandardMaterial color="#2D3A6B" roughness={0.8} />
              </mesh>
            </group>
          </group>
        </Prop>
        {/* the watering can, at her side; lifted in the pause */}
        <group ref={can} position={[0.42, 0.25, 0.2]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.16, 0.14, 0.3, 10]} />
            <meshStandardMaterial color="#8A8F93" roughness={0.5} metalness={0.5} />
          </mesh>
          <mesh position={[0.2, 0.08, 0]} rotation={[0, 0, -0.6]}>
            <cylinderGeometry args={[0.025, 0.03, 0.34, 6]} />
            <meshStandardMaterial color="#8A8F93" roughness={0.5} metalness={0.5} />
          </mesh>
        </group>
        {/* the probe, only in the pause */}
        <mesh ref={probe} visible={false} position={[0.1, 0.9, 0.55]} castShadow>
          <cylinderGeometry args={[0.02, 0.02, 0.7, 6]} />
          <meshStandardMaterial color="#D8D2C4" roughness={0.5} metalness={0.3} />
        </mesh>
      </group>
      {(stage === 'done' || s.plot.sent) && <Sela />}
    </>
  )
}

/** Sela, at the jetty, once the plot is done — the next task in one line. */
function Sela() {
  const it = useMemo(() => ({ id: 'talk.sela', verb: 'talk' as const, label: 'Sela', pos: [...SELA_AT] as [number, number, number], radius: 1.9 }), [])
  useEffect(() => registerInteractable(it), [it])
  const g = useRef<THREE.Group>(null)
  useFrame(() => {
    const grp = g.current
    if (!grp) return
    const w = getWorld()
    if (w.talk === 'talk.sela') grp.rotation.y = Math.atan2(live.pos.x - SELA_AT[0], live.pos.z - SELA_AT[2])
  })
  return (
    <group ref={g} position={SELA_AT} rotation={[0, Math.PI, 0]} name="sela">
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.32, 1.0, 12]} />
        <meshStandardMaterial color="#3A3F5C" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.15, 0]} castShadow>
        <capsuleGeometry args={[0.27, 0.4, 6, 12]} />
        <meshStandardMaterial color="#C8552E" roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.62, 0]} castShadow>
        <sphereGeometry args={[0.2, 14, 10]} />
        <meshStandardMaterial color="#5A3A26" roughness={0.6} />
      </mesh>
    </group>
  )
}
