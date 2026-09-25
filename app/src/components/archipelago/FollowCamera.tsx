import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { CRANE, craneTip, getWorld } from '@/lib/archipelago'
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
/** The furnace room's viewpoint: just outside the mouth, looking onto the bed. */
const ROOM_POS = new THREE.Vector3(0.2, 1.7, -4.3)
const ROOM_LOOK = new THREE.Vector3(0, 0.9, -8.4)

export default function FollowCamera({ hudBottom = 0, active = true }: { hudBottom?: number; active?: boolean }) {
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

  const wasRoom = useRef(false)
  useFrame((_, dtRaw) => {
    if (!active) { first.current = true; return }
    const dt = Math.min(0.05, dtRaw)
    const inRoom = getWorld().room === 'furnace'
    if (inRoom) {
      // A room is a CUT, not a glide: the first frame snaps, then it holds.
      if (!wasRoom.current) {
        camera.position.copy(ROOM_POS)
        wasRoom.current = true
      }
      camera.lookAt(ROOM_LOOK)
      control.yaw = 0
      control.pitch = 0
      return
    }
    if (wasRoom.current) {
      // Cut back out to the follow shot, no glide from inside the furnace.
      wasRoom.current = false
      first.current = true
    }
    live.camYaw += control.yaw
    live.camPitch = THREE.MathUtils.clamp(live.camPitch + control.pitch, 0.12, 1.1)
    control.yaw = 0
    control.pitch = 0
    const c = getWorld().crane
    if (c.active) {
      // Driving: the shot is on the hook, a little higher and further back.
      const [tx, tz] = craneTip(c.yaw)
      TARGET.set(tx, Math.max(1.2, c.hookY * 0.6), tz)
    } else {
      TARGET.copy(live.pos)
      TARGET.y += 0.6
    }
    void CRANE
    const d = (c.active ? DIST * 1.5 : DIST) * Math.cos(live.camPitch)
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
