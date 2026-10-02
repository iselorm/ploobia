import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { CRANE, craneTip, getWorld, type RoomId } from '@/lib/archipelago'
import { BALANCE_CAM, BALANCE_CAM_PHONE, BENCH_CAM, BENCH_CAM_PHONE } from './benchLayout'
import { MOULD_CAM, MOULD_CAM_PHONE } from './mouldLayout'
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
/**
 * Each room's viewpoint. The furnace: just outside the mouth, looking onto the
 * bed. The benches (S2): close on the instrument from the yard side.
 */
type Cut = { pos: THREE.Vector3; look: THREE.Vector3 }
const cut = (c: { pos: [number, number, number]; look: [number, number, number] }): Cut => ({ pos: new THREE.Vector3(...c.pos), look: new THREE.Vector3(...c.look) })
const ROOMS: Record<Exclude<RoomId, 'none'>, { wide: Cut; phone: Cut }> = {
  furnace: { wide: { pos: new THREE.Vector3(0.2, 1.7, -4.3), look: new THREE.Vector3(0, 0.9, -8.4) }, phone: { pos: new THREE.Vector3(0.2, 1.7, -4.3), look: new THREE.Vector3(0, 0.9, -8.4) } },
  bench: { wide: cut(BENCH_CAM), phone: cut(BENCH_CAM_PHONE) },
  balance: { wide: cut(BALANCE_CAM), phone: cut(BALANCE_CAM_PHONE) },
  mould: { wide: cut(MOULD_CAM), phone: cut(MOULD_CAM_PHONE) },
}

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

  const wasRoom = useRef<RoomId | null>(null)
  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw)
    const room = getWorld().room
    if (room !== 'none') {
      // A room is a CUT, not a glide: the first frame snaps, then it holds.
      const r = size.height < 500 ? ROOMS[room].phone : ROOMS[room].wide
      if (wasRoom.current !== room) {
        camera.position.copy(r.pos)
        wasRoom.current = room
      }
      camera.lookAt(r.look)
      control.yaw = 0
      control.pitch = 0
      return
    }
    if (wasRoom.current) {
      // Cut back out to the follow shot, no glide from inside the room.
      wasRoom.current = null
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
