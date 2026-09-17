import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier'
import {
  CARRY_KG,
  craneDrive,
  craneEnter,
  craneLeave,
  crossPortal,
  enterRoom,
  fixPipe,
  leaveRoom,
  getWorld,
  interactables,
  lightHearth,
  nearestInteractable,
  setWorld,
  toggleLens,
  type FuelId,
  type ZoneId,
} from '@/lib/archipelago'
import { SPAWNS, control, live } from './live'
import { bodies } from './bodies'
import { craneGrabOrRelease } from './crane'

/**
 * The explorer — a kinematic character on Rapier's controller, driven by the
 * stick/WASD in the camera's frame. Third person; the camera is its own
 * component and reads `live`.
 *
 * Previz rig: a capsule with a head and a visor. The real explorer (a stylised
 * human with the toolbelt and the Lens on a strap) is round W2's job through
 * the Higgsfield pipeline — this one exists so movement can be judged now.
 */

const SPEED = 4.2
const JUMP = 5.2
const GRAVITY = -14
const HAND = new THREE.Vector3()
const MOVE = new THREE.Vector3()
const FWD = new THREE.Vector3()
const RIGHT = new THREE.Vector3()

export default function Explorer({ onPortal }: { onPortal?: (to: ZoneId) => void }) {
  const body = useRef<RapierRigidBody>(null)
  const mesh = useRef<THREE.Group>(null)
  const { world, rapier } = useRapier()
  const camera = useThree((s) => s.camera)
  const vy = useRef(0)
  const nearId = useRef<string | null>(null)
  const zoneRef = useRef<ZoneId | null>(null)
  /** Seconds left to hold still after a zone change, while its floor mounts. */
  const settle = useRef(0)

  const controller = useMemo(() => {
    const c = world.createCharacterController(0.02)
    c.setUp({ x: 0, y: 1, z: 0 })
    c.enableAutostep(0.45, 0.25, true)
    c.enableSnapToGround(0.35)
    c.setApplyImpulsesToDynamicBodies(true)
    c.setMaxSlopeClimbAngle((50 * Math.PI) / 180)
    return c
  }, [world])
  useEffect(() => () => world.removeCharacterController(controller), [world, controller])

  useFrame((_, dtRaw) => {
    const b = body.current
    if (!b) return
    const dt = Math.min(0.05, dtRaw)
    const s = getWorld()
    // Step out of a mode on Escape.
    if (control.exit) {
      control.exit = false
      if (s.crane.active) craneLeave()
      else if (s.room !== 'none') leaveRoom()
    }
    // At the crane the keys drive the crane; in a room the room's controls take over.
    if (s.crane.active && s.phase === 'play') {
      craneDrive(control.x, control.y, dt)
      if (control.interact) {
        control.interact = false
        craneGrabOrRelease()
      }
      control.jump = false
      control.lens = false
    }
    const playing = s.phase === 'play' && s.room === 'none' && !s.crane.active

    // A zone change is a teleport to that zone's spawn — the load is the walk.
    if (zoneRef.current !== s.zone) {
      zoneRef.current = s.zone
      const sp = SPAWNS[s.zone]
      live.spawn.set(sp[0], sp[1], sp[2])
      b.setNextKinematicTranslation({ x: sp[0], y: sp[1], z: sp[2] })
      live.pos.copy(live.spawn)
      live.ploob.set(sp[0] + 1, 0, sp[2] + 1)
      vy.current = 0
      settle.current = 0.5
      return
    }
    if (settle.current > 0) {
      settle.current -= dt
      return
    }
    if (live.requestPos) {
      const [x, y, z] = live.requestPos
      live.requestPos = null
      b.setNextKinematicTranslation({ x, y, z })
      live.pos.set(x, y, z)
      vy.current = 0
      return
    }

    // Camera-relative move vector on the ground plane.
    camera.getWorldDirection(FWD)
    FWD.y = 0
    FWD.normalize()
    RIGHT.set(FWD.z, 0, -FWD.x)
    MOVE.set(0, 0, 0)
    if (playing) {
      MOVE.addScaledVector(FWD, control.y).addScaledVector(RIGHT, -control.x)
    }
    const moving = MOVE.lengthSq() > 1e-4
    if (moving) {
      MOVE.normalize().multiplyScalar(SPEED * dt)
      live.facing = Math.atan2(MOVE.x, MOVE.z)
    }

    // Vertical: our own gravity on the kinematic body, jump on the edge.
    if (live.grounded && vy.current <= 0) {
      vy.current = 0
      if (control.jump && playing) {
        vy.current = JUMP
        control.jump = false
      }
    }
    vy.current += GRAVITY * dt
    MOVE.y = vy.current * dt

    const collider = b.collider(0)
    // The block in hand is kinematic and in front of the capsule; without the
    // filter the controller walks into it and the explorer freezes mid-carry.
    const heldBody = s.held ? bodies.get(s.held) : undefined
    controller.computeColliderMovement(
      collider,
      MOVE,
      undefined,
      undefined,
      heldBody ? (c) => c.parent()?.handle !== heldBody.handle : undefined,
    )
    const m = controller.computedMovement()
    const t = b.translation()
    const nx = t.x + m.x
    const ny = t.y + m.y
    const nz = t.z + m.z
    b.setNextKinematicTranslation({ x: nx, y: ny, z: nz })
    live.grounded = controller.computedGrounded()
    if (live.grounded && vy.current < 0) vy.current = 0
    live.pos.set(nx, ny, nz)

    // Fell off the island: back to the spawn, no fuss.
    if (ny < -12) {
      b.setNextKinematicTranslation({ x: live.spawn.x, y: live.spawn.y, z: live.spawn.z })
      vy.current = 0
    }

    // The held block rides the hand.
    if (s.held) {
      const hb = bodies.get(s.held)
      if (hb) {
        HAND.set(nx + Math.sin(live.facing) * 0.75, ny + 0.35, nz + Math.cos(live.facing) * 0.75)
        hb.setNextKinematicTranslation({ x: HAND.x, y: HAND.y, z: HAND.z })
        const it = interactables.get(s.held)
        if (it) it.pos = [HAND.x, HAND.y, HAND.z]
      }
    }

    // What is in reach — one write per change, not per frame.
    const near = playing ? nearestInteractable(nx, nz) : null
    const id = near?.id ?? null
    if (id !== nearId.current) {
      nearId.current = id
      setWorld({ near: id })
    }

    // Verbs on the edge.
    if (control.lens) {
      control.lens = false
      if (playing) toggleLens()
    }
    if (control.interact) {
      control.interact = false
      if (playing) act(near?.id ?? null, s.held, onPortal)
    }

    // Portals are walked into, not pressed.
    if (near?.verb === 'portal' && playing) {
      control.interact = false
      act(near.id, s.held, onPortal)
    }

    const g = mesh.current
    if (g) {
      g.position.set(nx, ny, nz)
      g.rotation.y = live.facing
      g.visible = s.room === 'none'
    }
  })

  return (
    <>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[0, 0.6, 4]} name="explorer">
        <CapsuleCollider args={[0.28, 0.24]} />
      </RigidBody>
      <group ref={mesh} name="explorer-mesh">
        <mesh position={[0, 0, 0]} castShadow>
          <capsuleGeometry args={[0.24, 0.56, 6, 12]} />
          <meshStandardMaterial color="#3E5E8A" roughness={0.55} />
        </mesh>
        <mesh position={[0, 0.52, 0]} castShadow>
          <sphereGeometry args={[0.2, 16, 12]} />
          <meshStandardMaterial color="#8A5A3B" roughness={0.6} />
        </mesh>
        {/* the visor says which way is forward */}
        <mesh position={[0, 0.56, 0.16]}>
          <boxGeometry args={[0.24, 0.08, 0.1]} />
          <meshStandardMaterial color="#F3C77A" emissive="#E8A33D" emissiveIntensity={0.6} roughness={0.2} />
        </mesh>
      </group>
    </>
  )

  function act(id: string | null, held: string | null, portal?: (to: ZoneId) => void) {
    // Holding something: the button drops it, whatever else is near.
    if (held) {
      const hb = bodies.get(held)
      if (hb) {
        hb.setBodyType(rapier.RigidBodyType.Dynamic, true)
        hb.setLinvel({ x: Math.sin(live.facing) * 1.2, y: 0.5, z: Math.cos(live.facing) * 1.2 }, true)
      }
      setWorld({ held: null })
      return
    }
    if (!id) return
    const it = interactables.get(id)
    if (!it) return
    switch (it.verb) {
      case 'grab': {
        const hb = bodies.get(id)
        if (!hb) return
        if ((it.mass ?? hb.mass()) > CARRY_KG) {
          setWorld({ near: id })
          window.dispatchEvent(new CustomEvent('ploobia:tooheavy', { detail: id }))
          return
        }
        hb.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true)
        setWorld({ held: id })
        return
      }
      case 'probe':
        lightHearth(id.slice('hearth.'.length) as FuelId)
        return
      case 'build':
        if (getWorld().bellowsSeen) fixPipe()
        else window.dispatchEvent(new CustomEvent('ploobia:lookfirst'))
        return
      case 'feed':
        enterRoom('furnace')
        return
      case 'crane':
        craneEnter()
        return
      case 'portal': {
        const to = id.slice('portal.'.length) as ZoneId
        crossPortal(to)
        portal?.(to)
        return
      }
      case 'talk':
        return
    }
  }
}
