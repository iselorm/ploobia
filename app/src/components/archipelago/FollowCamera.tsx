import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { control, live } from './live'

/**
 * Third-person follow camera: three-quarter high, behind the explorer, with a
 * drag to look. Never lerps to a fixed viewpoint every frame (house trap) —
 * it lerps toward a target that the explorer moves, which is a different
 * thing: the learner's drag is added to the yaw and stays.
 *
 * `hudBottom` lifts the framing above a bottom toolbar on phones with
 * `setViewOffset`, the Foundry's trick, so the explorer is never under a chip.
 */
const DIST = 6.2
const HEIGHT = 2.9
const TARGET = new THREE.Vector3()
const WANT = new THREE.Vector3()
const LOOK = new THREE.Vector3()

export default function FollowCamera({ hudBottom = 0 }: { hudBottom?: number }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const gl = useThree((s) => s.gl)
  const first = useRef(true)

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    if (hudBottom > 0) cam.setViewOffset(size.width, size.height + hudBottom, 0, hudBottom, size.width, size.height)
    else cam.clearViewOffset()
    cam.updateProjectionMatrix()
    return () => {
      cam.clearViewOffset()
      cam.updateProjectionMatrix()
    }
  }, [camera, size.width, size.height, hudBottom])

  // Look drag on the canvas (pointer, not the stick).
  useEffect(() => {
    const el = gl.domElement
    let dragging = false
    let lx = 0
    let ly = 0
    let pid = -1
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest('.hud')) return
      dragging = true
      pid = e.pointerId
      lx = e.clientX
      ly = e.clientY
    }
    const move = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== pid) return
      control.yaw -= (e.clientX - lx) * 0.006
      control.pitch += (e.clientY - ly) * 0.004
      lx = e.clientX
      ly = e.clientY
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId === pid) dragging = false
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [gl])

  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw)
    live.camYaw += control.yaw
    live.camPitch = THREE.MathUtils.clamp(live.camPitch + control.pitch, 0.12, 1.1)
    control.yaw = 0
    control.pitch = 0
    TARGET.copy(live.pos)
    TARGET.y += 0.6
    const d = DIST * Math.cos(live.camPitch)
    WANT.set(
      TARGET.x - Math.sin(live.camYaw) * d,
      TARGET.y + HEIGHT * Math.sin(live.camPitch) * 1.6,
      TARGET.z - Math.cos(live.camYaw) * d,
    )
    if (first.current) {
      camera.position.copy(WANT)
      first.current = false
    } else {
      camera.position.lerp(WANT, 1 - Math.pow(0.001, dt))
    }
    LOOK.lerpVectors(camera.position, TARGET, 1)
    camera.lookAt(LOOK)
  })
  return null
}
