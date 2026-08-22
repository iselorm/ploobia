import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { SimState } from '@/lib/sim'
import { heartbeat } from '@/lib/sim'
import { registerCamera } from '@/lib/input'
import { reportFrame } from '@/lib/quality'
import { heartThump } from '@/lib/audio'
import { colorAt, getJourney, journeyFlowK, paramAt, tickJourney, beatsPerSecond } from '@/lib/journey'

/**
 * On-rails forward drift with pointer-drag look control. Dragging rotates the
 * view (yaw/pitch, clamped); on release the view eases back toward the
 * direction of travel. Camera bob is synced to the heartbeat. Warm lights
 * travel with the camera so cells are always lit as they pass.
 *
 * The rig also owns the journey clock: it advances the stage machine, sets
 * this frame's flow speed, retints fog + key light to the current stop, and —
 * during the meet-the-cell story — steers the gaze gently toward the featured
 * body cell (a drag always wins; scripted look only while the beat runs).
 */
export default function CameraRig({ sim }: { sim: SimState }) {
  const { camera, gl, scene } = useThree()
  const lightsRef = useRef<THREE.Group>(null)

  const look = useRef({ yaw: 0, pitch: 0 })
  const target = useRef({ yaw: 0, pitch: 0 })
  const drag = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 })

  const keyLight = useMemo(() => new THREE.PointLight('#FF9A76', 320, 70, 1.8), [])
  const rimLight = useMemo(() => new THREE.PointLight('#B2242A', 200, 60, 1.8), [])

  // Controller / keyboard look: the same yaw/pitch targets the drag uses.
  useEffect(
    () =>
      registerCamera({
        orbit: (dx, dy) => {
          target.current.yaw = THREE.MathUtils.clamp(target.current.yaw - dx * 1.6, -1.05, 1.05)
          target.current.pitch = THREE.MathUtils.clamp(target.current.pitch - dy * 1.6, -0.62, 0.62)
        },
      }),
    [],
  )

  useEffect(() => {
    const el = gl.domElement
    const onDown = (e: PointerEvent) => {
      drag.current = { active: true, x: e.clientX, y: e.clientY }
    }
    const onMove = (e: PointerEvent) => {
      if (!drag.current.active) return
      const dx = e.clientX - drag.current.x
      const dy = e.clientY - drag.current.y
      drag.current.x = e.clientX
      drag.current.y = e.clientY
      target.current.yaw = THREE.MathUtils.clamp(target.current.yaw - dx * 0.0042, -1.05, 1.05)
      target.current.pitch = THREE.MathUtils.clamp(target.current.pitch - dy * 0.0042, -0.62, 0.62)
    }
    const onUp = () => {
      drag.current.active = false
    }
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [gl])

  // Heart-sound scheduling: fire "lub" and "dub" as the beat phase passes
  // their peaks in lib/sim.ts's waveform, so sound and wall share one beat.
  const beatPhase = useRef({ last: 0, lubDone: false, dubDone: false })

  const fogColor = useMemo(() => new THREE.Color(), [])
  const lightColor = useMemo(() => new THREE.Color(), [])
  const toFocus = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, rawDt) => {
    reportFrame(rawDt)
    /**
     * Two different clamps, on purpose.
     *
     * `dt` drives MOTION and the clocks, and is clamped generously (0.25 s) so
     * that a slow device rides the circuit in the same wall-clock time as a
     * fast one. The old 0.05 s clamp silently ran the whole journey in slow
     * motion on weak hardware — which does not just feel bad, it makes the lap
     * timer lie, and this cabinet now uses lap time as a measurement.
     *
     * `smoothDt` drives the eased look/colour terms, and stays small so a
     * single long frame cannot make them overshoot.
     *
     * Stage boundaries survive the bigger step because crossings are detected
     * by comparing distances (crossedBoundary), never by assuming a small move.
     */
    const dt = Math.min(rawDt, 0.25)
    const smoothDt = Math.min(rawDt, 0.05)
    sim.time += dt

    const journey = getJourney()
    const beat = heartbeat(sim.time, beatsPerSecond(sim))

    if (sim.started && !sim.paused) {
      sim.flowTime += dt
      // Stage pace × slider, with an extra shove on each heartbeat while the
      // pulse is strong (i.e. inside the heart) — the pump you can FEEL.
      const pulseK = paramAt(journey.dist, (s) => s.pulseK)
      const surge = 1 + beat * 0.45 * Math.max(0, pulseK - 1)
      sim.flowNow = sim.speed * 6 * journeyFlowK(sim) * surge
      sim.camZ -= sim.flowNow * dt
    } else {
      sim.flowNow = 0
    }

    // audible heartbeat, locked to the same phase the wall pulses on
    if (sim.started && !sim.paused) {
      const phase = ((sim.time * beatsPerSecond(sim)) % 1 + 1) % 1
      const bp = beatPhase.current
      if (phase < bp.last) {
        bp.lubDone = false
        bp.dubDone = false
      }
      if (!bp.lubDone && phase >= 0.12) {
        heartThump(1, true)
        bp.lubDone = true
      }
      if (!bp.dubDone && phase >= 0.34) {
        heartThump(0.55, false)
        bp.dubDone = true
      }
      bp.last = phase
    }

    tickJourney(sim, dt)

    // Stage atmosphere: fog + key light retinted to the current stop.
    const fog = scene.fog as THREE.FogExp2 | null
    if (fog) {
      colorAt(journey.dist, (s) => s.fog, fogColor)
      fog.color.lerp(fogColor, Math.min(1, smoothDt * 2.2))
      const targetDensity = paramAt(journey.dist, (s) => s.fogDensity)
      fog.density += (targetDensity - fog.density) * Math.min(1, smoothDt * 2.2)
    }
    colorAt(journey.dist, (s) => s.light, lightColor)
    keyLight.color.lerp(lightColor, Math.min(1, smoothDt * 2.2))

    // ease the look target: toward the featured cell during the story beat,
    // back to centre otherwise. A live drag always wins.
    if (!drag.current.active) {
      if (journey.beatActive) {
        toFocus.copy(journey.cellFocus).sub(camera.position)
        const wantYaw = THREE.MathUtils.clamp(Math.atan2(-toFocus.x, -toFocus.z), -1.05, 1.05)
        const wantPitch = THREE.MathUtils.clamp(
          Math.atan2(toFocus.y, Math.hypot(toFocus.x, toFocus.z)),
          -0.62,
          0.62,
        )
        const kf = Math.min(1, smoothDt * 1.6)
        target.current.yaw += (wantYaw - target.current.yaw) * kf
        target.current.pitch += (wantPitch - target.current.pitch) * kf
      } else {
        const decay = Math.max(0, 1 - smoothDt * 0.45)
        target.current.yaw *= decay
        target.current.pitch *= decay
      }
    }
    const k = Math.min(1, smoothDt * 6)
    look.current.yaw += (target.current.yaw - look.current.yaw) * k
    look.current.pitch += (target.current.pitch - look.current.pitch) * k

    const sway = Math.sin(sim.time * 0.22) * 0.14
    const drift = Math.sin(sim.time * 0.37) * 0.1

    // At 180 bpm a full-amplitude bob is nauseating, so the throb gets
    // *faster* with heart rate but not bigger — comfort over spectacle.
    const bobK = Math.sqrt(70 / Math.max(50, sim.bpm))
    camera.position.set(sway * 0.6 + beat * 0.07 * bobK, drift + beat * 0.12 * bobK, sim.camZ)
    camera.rotation.order = 'YXZ'
    camera.rotation.y = look.current.yaw + sway * 0.35
    camera.rotation.x = look.current.pitch + drift * 0.25 + beat * 0.015 * bobK
    camera.rotation.z = Math.sin(sim.time * 0.18) * 0.02

    if (lightsRef.current) {
      lightsRef.current.position.z = sim.camZ
      lightsRef.current.position.x = camera.position.x
      lightsRef.current.position.y = camera.position.y
    }
  })

  return (
    <>
      <ambientLight intensity={0.55} color="#FFC9B0" />
      <group ref={lightsRef}>
        <primitive object={keyLight} position={[0, 2.5, -14]} />
        <primitive object={rimLight} position={[0, -2, 12]} />
      </group>
    </>
  )
}
