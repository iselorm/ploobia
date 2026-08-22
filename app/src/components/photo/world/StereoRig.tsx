import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import { glyphTexture } from '../Glyphs'
import { setTracking, useStereo } from '@/lib/stereo'
import type { PhotoSim } from '@/lib/photo'
import { VIEW_BY_ID } from '@/lib/viewpoints'

/**
 * Renders the scene side by side for a cardboard viewer and points the camera
 * where the head points. Position still comes from the authored viewpoint
 * flights (GardenCamera); this rig owns orientation only, and only while stereo
 * is on. Drag is the fallback when there is no gyroscope.
 *
 * Comfort rules: fixed horizon (no roll from drag), no orientation smoothing
 * lag beyond one frame, no scripted rotation — the learner's head is the only
 * thing that turns the view.
 */
export default function StereoRig({ sim }: { sim: PhotoSim }) {
  const stereo = useStereo()
  const { gl, scene, camera, size } = useThree()
  const stereoCam = useMemo(() => {
    const s = new THREE.StereoCamera()
    s.aspect = 0.5 // each eye gets half the width
    return s
  }, [])
  const device = useRef<{ alpha: number; beta: number; gamma: number; has: boolean; lastAt: number }>({ alpha: 0, beta: 0, gamma: 0, has: false, lastAt: 0 })
  const drag = useRef({ active: false, x: 0, y: 0, yaw: 0, pitch: 0, moved: 0 })
  const calib = useRef({ yaw: 0, viewSeq: -1 })
  const q = useMemo(() => ({ device: new THREE.Quaternion(), zee: new THREE.Vector3(0, 0, 1), euler: new THREE.Euler(), q0: new THREE.Quaternion(), q1: new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)), look: new THREE.Quaternion(), m: new THREE.Matrix4(), yawQ: new THREE.Quaternion(), fwd: new THREE.Vector3(), target: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }), [])

  // Children of the camera (reticle, hint) only render if the camera is in the scene graph.
  useEffect(() => {
    if (!stereo.on) return
    scene.add(camera)
    return () => {
      scene.remove(camera)
    }
  }, [stereo.on, scene, camera])

  /* ---- device orientation ---- */
  useEffect(() => {
    if (!stereo.on) return
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.alpha === null || e.beta === null || e.gamma === null) return
      const d = device.current
      d.alpha = THREE.MathUtils.degToRad(e.alpha)
      d.beta = THREE.MathUtils.degToRad(e.beta)
      d.gamma = THREE.MathUtils.degToRad(e.gamma)
      d.has = true
      d.lastAt = performance.now()
    }
    window.addEventListener('deviceorientation', onOrient, true)
    const t = window.setInterval(() => {
      const fresh = performance.now() - device.current.lastAt < 1500
      setTracking(device.current.has && fresh)
    }, 500)
    return () => {
      window.removeEventListener('deviceorientation', onOrient, true)
      window.clearInterval(t)
    }
  }, [stereo.on])

  /* ---- drag fallback (yaw/pitch, no roll) ---- */
  useEffect(() => {
    if (!stereo.on) return
    const el = gl.domElement
    const down = (e: PointerEvent) => {
      drag.current.active = true
      drag.current.x = e.clientX
      drag.current.y = e.clientY
      drag.current.moved = 0
    }
    const move = (e: PointerEvent) => {
      if (!drag.current.active) return
      const dx = e.clientX - drag.current.x
      const dy = e.clientY - drag.current.y
      drag.current.x = e.clientX
      drag.current.y = e.clientY
      drag.current.moved += Math.abs(dx) + Math.abs(dy)
      drag.current.yaw -= dx * 0.004
      drag.current.pitch = THREE.MathUtils.clamp(drag.current.pitch - dy * 0.004, -1.2, 1.2)
    }
    const up = () => {
      drag.current.active = false
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [stereo.on, gl])

  /* ---- orientation + stereo render ---- */
  useFrame(() => {
    if (!stereo.on) return
    const d = device.current
    const tracking = d.has && performance.now() - d.lastAt < 1500

    // Where should "forward" be? Toward the current viewpoint's target — so a
    // new stop in the tour recalibrates the head's forward to face the subject.
    const v = VIEW_BY_ID[sim.viewId]
    q.target.set(v ? v.target[0] : 0, v ? v.target[1] : 2.2, v ? v.target[2] : 0)
    if (calib.current.viewSeq !== sim.viewSeq) {
      calib.current.viewSeq = sim.viewSeq
      // Yaw of the device (or drag) at this moment becomes "facing the target",
      // measured from the viewpoint's *destination* (the flight has only begun).
      const dest = v ? v.position : [camera.position.x, camera.position.y, camera.position.z]
      q.fwd.subVectors(q.target, q.up.set(dest[0], dest[1], dest[2]))
      q.up.set(0, 1, 0)
      const wantYaw = Math.atan2(-q.fwd.x, -q.fwd.z)
      const wantPitch = Math.atan2(q.fwd.y, Math.hypot(q.fwd.x, q.fwd.z))
      if (tracking) {
        // Compute the device's current yaw and store the difference.
        computeDeviceQuaternion(d, q)
        q.fwd.set(0, 0, -1).applyQuaternion(q.device)
        const devYaw = Math.atan2(-q.fwd.x, -q.fwd.z)
        calib.current.yaw = wantYaw - devYaw
      } else {
        drag.current.yaw = wantYaw
        drag.current.pitch = wantPitch
      }
    }

    if (tracking) {
      computeDeviceQuaternion(d, q)
      q.yawQ.setFromAxisAngle(q.up, calib.current.yaw)
      camera.quaternion.copy(q.yawQ).multiply(q.device)
    } else {
      q.euler.set(drag.current.pitch, drag.current.yaw, 0, 'YXZ')
      camera.quaternion.setFromEuler(q.euler)
    }
    camera.updateMatrixWorld()

    // Side-by-side render. Eye separation in world units: the scene's plant is
    // ~2.5 units tall ≈ 25 cm, so 1 unit ≈ 10 cm and IPD ≈ 0.64 units — but a
    // smaller separation reads more comfortably for a hand-held viewer.
    stereoCam.eyeSep = stereo.eyeSep * 4
    stereoCam.update(camera as THREE.PerspectiveCamera)
    const w = size.width
    const h = size.height
    const dpr = gl.getPixelRatio()
    const W = Math.floor(w * dpr)
    const H = Math.floor(h * dpr)
    gl.setScissorTest(true)
    gl.setScissor(0, 0, W / 2, H)
    gl.setViewport(0, 0, W / 2, H)
    gl.render(scene, stereoCam.cameraL)
    gl.setScissor(W / 2, 0, W / 2, H)
    gl.setViewport(W / 2, 0, W / 2, H)
    gl.render(scene, stereoCam.cameraR)
    gl.setScissorTest(false)
    gl.setViewport(0, 0, W, H)
  }, 1)

  // Reticle + hint fixed in front of the eyes (children of the camera).
  const hint = useMemo(() => {
    const v = VIEW_BY_ID[sim.viewId]
    return glyphTexture(v ? `${v.label} · tap for next` : 'tap for next', '#FBF5EA')
  }, [sim.viewId])

  if (!stereo.on) return null
  return createPortal(
    <group>
      <mesh position={[0, 0, -2]}>
        <ringGeometry args={[0.012, 0.02, 24]} />
        <meshBasicMaterial color="#FBF5EA" transparent opacity={0.6} depthTest={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, -0.62, -2]}>
        <planeGeometry args={[0.15 * hint.aspect, 0.15]} />
        <meshBasicMaterial map={hint.texture} transparent depthTest={false} toneMapped={false} />
      </mesh>
    </group>,
    camera,
  )
}

/** Standard device-orientation → world quaternion (as the old DeviceOrientationControls did). */
function computeDeviceQuaternion(
  d: { alpha: number; beta: number; gamma: number },
  q: { device: THREE.Quaternion; euler: THREE.Euler; q0: THREE.Quaternion; q1: THREE.Quaternion; zee: THREE.Vector3 },
) {
  const orient = typeof window !== 'undefined' && window.screen?.orientation ? THREE.MathUtils.degToRad(window.screen.orientation.angle || 0) : 0
  q.euler.set(d.beta, d.alpha, -d.gamma, 'YXZ')
  q.device.setFromEuler(q.euler)
  q.device.multiply(q.q1)
  q.q0.setFromAxisAngle(q.zee, -orient)
  q.device.multiply(q.q0)
}
