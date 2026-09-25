import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import Ploob2 from '@/components/brand/Ploob2'
import PloobCutout from '@/components/brand/PloobCutout'
import { audioGraph, isMuted, onMuteChange, setMuted } from '@/lib/audio'
import { ARRIVAL_SECONDS, PLANE_DOCK, arrivalBeat, arrivalPose, flight } from '@/lib/arrival'
import { control } from './live'

function useFlightAudio(active: boolean) {
  useEffect(() => {
    if (!active) return
    const graph = audioGraph()
    if (!graph) return
    const { ctx, master } = graph
    const engine = ctx.createOscillator()
    const filter = ctx.createBiquadFilter()
    const gain = ctx.createGain()
    engine.type = 'sawtooth'
    engine.frequency.value = 65
    filter.type = 'lowpass'
    filter.frequency.value = 180
    gain.gain.value = 0
    engine.connect(filter).connect(gain).connect(master)
    engine.start()
    const id = window.setInterval(() => {
      const silent = document.hidden || flight.paused
      gain.gain.setTargetAtTime(silent ? 0 : flight.seconds < 20 ? 0.035 : 0.015, ctx.currentTime, 0.2)
      engine.frequency.setTargetAtTime(flight.seconds < 20 ? 65 : 42, ctx.currentTime, 0.4)
    }, 100)
    return () => {
      window.clearInterval(id)
      engine.stop()
      engine.disconnect()
      filter.disconnect()
      gain.disconnect()
    }
  }, [active])
}

/** One lightweight aircraft, kept at the jetty after the flight. Nose points along −Z. */
export function ArrivalAircraft({ active, onFinish }: { active: boolean; onFinish: () => void }) {
  const plane = useRef<THREE.Group>(null)
  const propeller = useRef<THREE.Group>(null)
  const spray = useRef<THREE.Group>(null)
  const look = useRef(new THREE.Vector3())
  const gaze = useRef({ yaw: 0, pitch: 0 })
  const finished = useRef(false)
  useFlightAudio(active)
  useFrame(({ camera }, dt) => {
    if (!plane.current) return
    if (!active) {
      plane.current.position.set(...PLANE_DOCK)
      plane.current.rotation.set(0, 0, 0)
      if (spray.current) spray.current.visible = false
      return
    }
    if (document.hidden || flight.paused) { control.yaw = 0; control.pitch = 0; return }
    flight.seconds = Math.min(ARRIVAL_SECONDS, flight.seconds + Math.min(dt, 0.1))
    const t = flight.seconds
    const pose = arrivalPose(t)
    plane.current.position.set(...pose.plane)
    const next = arrivalPose(Math.min(26, t + 0.2)).plane
    if (t < 25.8) plane.current.rotation.y = Math.atan2(pose.plane[0] - next[0], pose.plane[2] - next[2])
    else plane.current.rotation.y *= Math.max(0, 1 - dt * 4)
    if (propeller.current) propeller.current.rotation.z += dt * (t < 20 ? 45 : 16)
    if (spray.current) {
      spray.current.visible = t >= 19.7 && t < 26
      spray.current.scale.setScalar(0.7 + Math.sin(t * 18) * 0.15)
    }
    gaze.current.yaw = THREE.MathUtils.clamp(gaze.current.yaw + control.yaw, -0.5, 0.5)
    gaze.current.pitch = THREE.MathUtils.clamp(gaze.current.pitch + control.pitch, -0.2, 0.2)
    control.yaw = 0; control.pitch = 0
    // The last four seconds return to the exact gameplay framing.
    const freedom = Math.min(1, Math.max(0, (30 - t) / 4))
    camera.position.set(...pose.camera)
    look.current.set(...pose.look)
    look.current.x += gaze.current.yaw * 35 * freedom
    look.current.y += gaze.current.pitch * 25 * freedom
    camera.lookAt(look.current)
    if (t >= ARRIVAL_SECONDS && !finished.current) { finished.current = true; onFinish() }
  })
  return (
    <group ref={plane} position={PLANE_DOCK} name="arrival-seaplane">
      <mesh scale={[0.7, 0.7, 2.25]} castShadow><sphereGeometry args={[1, 16, 10]} /><meshStandardMaterial color="#F4E8CA" roughness={0.65} /></mesh>
      <mesh position={[0, 0.28, -0.7]} scale={[0.61, 0.55, 0.7]}><sphereGeometry args={[1, 12, 8]} /><meshStandardMaterial color="#427C89" metalness={0.25} roughness={0.2} /></mesh>
      <mesh position={[0, 0.7, 0]} castShadow><boxGeometry args={[7, 0.12, 1.15]} /><meshStandardMaterial color="#DEA23C" /></mesh>
      <mesh position={[0, 0.25, 1.7]}><boxGeometry args={[2.7, 0.1, 0.65]} /><meshStandardMaterial color="#DEA23C" /></mesh>
      <mesh position={[0, 0.7, 1.75]}><boxGeometry args={[0.12, 1.1, 0.75]} /><meshStandardMaterial color="#C86E42" /></mesh>
      {[-0.75, 0.75].map((x) => <group key={x}>
        <mesh position={[x, -0.9, 0]} scale={[0.27, 0.24, 1.8]}><sphereGeometry args={[1, 12, 8]} /><meshStandardMaterial color="#35505B" /></mesh>
        <mesh position={[x, -0.45, 0]}><boxGeometry args={[0.07, 0.8, 0.07]} /><meshStandardMaterial color="#53666B" /></mesh>
      </group>)}
      <group ref={propeller} position={[0, 0, -2.28]}>
        <mesh><boxGeometry args={[0.12, 2.1, 0.07]} /><meshStandardMaterial color="#39454C" /></mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}><boxGeometry args={[0.12, 2.1, 0.07]} /><meshStandardMaterial color="#39454C" /></mesh>
      </group>
      {active && <group position={[-0.7, 0.45, -0.3]}><PloobCutout height={0.65} /></group>}
      <group ref={spray} visible={false} position={[0, -0.65, 0.9]}>
        {Array.from({ length: 12 }, (_, i) => <mesh key={i} position={[(i % 2 ? -1 : 1) * (0.8 + (i % 3) * 0.3), (i % 3) * 0.13, i * 0.15]} scale={[0.12, 0.08, 0.35]}><sphereGeometry args={[1, 6, 4]} /><meshBasicMaterial color="#E2F6ED" transparent opacity={0.7} /></mesh>)}
      </group>
    </group>
  )
}

/** Distant regional silhouettes only; these are not new playable islands. */
export function ArrivalIslands() {
  return <group name="archipelago-horizon">
    {[{ x: 55, z: -38, r: 13, kind: 'forest' }, { x: -72, z: 5, r: 11, kind: 'city' }, { x: 47, z: -90, r: 12, kind: 'sky' }].map(({ x, z, r, kind }) => <group key={kind} position={[x, -1, z]}>
      <mesh position={[0, -2, 0]}><cylinderGeometry args={[r, r * 0.7, 4, 12]} /><meshStandardMaterial color="#748A75" flatShading /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[r, 16]} /><meshStandardMaterial color={kind === 'forest' ? '#52885F' : '#C0B58F'} /></mesh>
      {Array.from({ length: kind === 'forest' ? 13 : 6 }, (_, i) => {
        const a = i * 2.4, radius = 2 + (i % 3) * 2
        return <mesh key={i} position={[Math.sin(a) * radius, 2 + i % 4, Math.cos(a) * radius]}>
          {kind === 'forest' ? <coneGeometry args={[2.3, 5 + i % 4, 7]} /> : <boxGeometry args={[1.7, 4 + i % 4 * 2, 1.7]} />}
          <meshStandardMaterial color={kind === 'forest' ? '#2F684C' : '#6F9DA8'} emissive={kind === 'city' ? '#78D7D1' : '#000000'} emissiveIntensity={0.3} flatShading />
        </mesh>
      })}
      {kind === 'sky' && <group position={[0, 13, 0]}>
        <mesh><cylinderGeometry args={[0.35, 2, 26, 8]} /><meshStandardMaterial color="#DCDDCB" /></mesh>
        <mesh position={[0, 12, 0]} rotation={[Math.PI / 3, 0, 0]}><torusGeometry args={[3, 0.15, 6, 20]} /><meshStandardMaterial color="#E8B45C" /></mesh>
      </group>}
    </group>)}
    {[[-20, 17, -45], [25, 25, -67], [54, 37, 95], [42, 31, 90]].map((p, i) => <mesh key={i} position={p as [number, number, number]} scale={[12, 2.3, 5]}><sphereGeometry args={[1, 10, 6]} /><meshBasicMaterial color="#F8F2DF" transparent opacity={0.66} depthWrite={false} /></mesh>)}
  </group>
}

export function ArrivalHud({ onSkip }: { onSkip: () => void }) {
  const [seconds, setSeconds] = useState(0)
  const [paused, setPaused] = useState(false)
  const [muted, updateMuted] = useState(isMuted)
  useEffect(() => onMuteChange(updateMuted), [])
  useEffect(() => {
    const id = window.setInterval(() => setSeconds(flight.seconds), 100)
    return () => window.clearInterval(id)
  }, [])
  const beat = arrivalBeat(seconds)
  return <div className="pointer-events-none fixed inset-0 z-30 text-[#F6F2E8]" data-testid="arrival">
    <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#132F3B]/80 to-transparent" />
    <div className="absolute left-5 top-5"><p className="text-xs tracking-[0.3em]">PLOOBIA</p><p className="mt-1 text-xs opacity-80">Drag to look around · 30-second arrival</p></div>
    <div className="pointer-events-auto absolute right-4 top-16 flex gap-2 sm:top-4">
      <button type="button" className="rounded-full bg-[#163844]/90 px-4 py-3 text-sm" aria-label={muted ? 'Turn sound on' : 'Mute sound'} onClick={() => setMuted(!muted)}>{muted ? 'Sound off' : 'Sound on'}</button>
      <button type="button" className="rounded-full bg-[#163844]/90 px-4 py-3 text-sm" onClick={() => { flight.paused = !paused; setPaused(!paused) }}>{paused ? 'Resume' : 'Pause'}</button>
      <button type="button" autoFocus className="rounded-full bg-[#E8A33D] px-4 py-3 text-sm font-bold text-[#22333B]" onClick={onSkip}>Skip arrival</button>
    </div>
    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#132F3B] to-transparent px-6 pb-6 pt-16">
      <p className="text-xs uppercase tracking-[0.2em] text-[#E8BD73]">{beat.title}</p>
      <div className="mt-2 flex items-center gap-3"><Ploob2 size={42} /><p className="max-w-xl text-base font-semibold sm:text-xl" aria-live="polite">{beat.line}</p></div>
      <div className="mt-4 h-0.5 bg-white/20"><div className="h-full bg-[#E8BD73]" style={{ width: `${seconds / ARRIVAL_SECONDS * 100}%` }} /></div>
    </div>
  </div>
}
