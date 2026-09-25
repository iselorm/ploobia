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
  plantCutting,
  probeBed,
  pushMarker,
  readPage,
  setWorld,
  talkTo,
  toggleLens,
  type FuelId,
  type ZoneId,
  enterDoor,
} from '@/lib/archipelago'
import { SPAWNS, control, live } from './live'
import { LANDING_SPAWN } from './landingLayout'
import { bodies } from './bodies'
import { craneGrabOrRelease } from './crane'
import { useWorldMesh } from './useWorldMesh'
import { loadWorldClips } from '@/lib/worldassets'

/**
 * The explorer — a kinematic character on Rapier's controller, driven by the
 * stick/WASD in the camera's frame. Third person; the camera is its own
 * component and reads `live`.
 *
 * The body is the W2 generated character (rigged, with an idle clip) when it
 * arrives; until then, or offline, the previz capsule with a head and a visor.
 */

/** Feet sit at the bottom of the capsule collider (half-height + radius). */
const FEET = -0.52

/** Casual_Walk covers about this much ground per second at 1.0× on a 1.45 m rig. */
const WALK_CLIP_MPS = 1.4

function ExplorerBody() {
  const generated = useWorldMesh('explorer')
  const mixer = useRef<THREE.AnimationMixer | null>(null)
  const actions = useRef<{ idle?: THREE.AnimationAction; walk?: THREE.AnimationAction; jump?: THREE.AnimationAction }>({})
  const airborne = useRef(false)
  const blend = useRef({ walk: 0, jump: 0 })
  useEffect(() => {
    if (!generated) return
    let alive = true
    const m = new THREE.AnimationMixer(generated.group)
    // The file's own idle starts at once; the posture-corrected idle (pelvis
    // back, chest ahead — the same correction the walk and jump carry) takes
    // over when it arrives.
    const idle = generated.clips[0]
    const a: typeof actions.current = {}
    if (idle) {
      a.idle = m.clipAction(idle)
      a.idle.play()
    }
    mixer.current = m
    actions.current = a
    loadWorldClips('idle').then((clips) => {
      if (!alive || !clips[0]) return
      const next = m.clipAction(clips[0])
      next.play()
      next.setEffectiveWeight(a.idle?.getEffectiveWeight() ?? 1)
      a.idle?.stop()
      a.idle = next
    })
    // The walk and jump ride the same rig by bone name; each is a separate
    // small file, and the idle alone is fine until they arrive.
    loadWorldClips('walk').then((clips) => {
      if (!alive || !clips[0]) return
      a.walk = m.clipAction(clips[0])
      a.walk.play()
      a.walk.setEffectiveWeight(0)
    })
    loadWorldClips('jump').then((clips) => {
      if (!alive || !clips[0]) return
      a.jump = m.clipAction(clips[0])
      a.jump.setLoop(THREE.LoopOnce, 1)
      a.jump.clampWhenFinished = true
    })
    return () => {
      alive = false
      m.stopAllAction()
      mixer.current = null
      actions.current = {}
    }
  }, [generated])
  useFrame((_, dtRaw) => {
    const m = mixer.current
    if (!m) return
    const dt = Math.min(0.05, dtRaw)
    const a = actions.current
    const moving = live.speed > 0
    const inAir = !!a.jump && !live.grounded
    if (inAir && !airborne.current) {
      // Launch: skip the clip's crouch (we are already off the ground) and run
      // its flight at a rate that fits the body's ~0.75 s in the air.
      a.jump!.reset().play()
      a.jump!.time = 0.45
      a.jump!.setEffectiveTimeScale(1.6)
    }
    airborne.current = inAir
    const b = blend.current
    b.jump = a.jump ? THREE.MathUtils.damp(b.jump, inAir ? 1 : 0, 18, dt) : 0
    const jw = b.jump
    a.jump?.setEffectiveWeight(jw)
    if (a.walk && a.idle) {
      // Crossfade by weight; the walk's rate follows the ground speed.
      b.walk = THREE.MathUtils.damp(b.walk, moving ? 1 : 0, 14, dt)
      const w = b.walk
      a.walk.setEffectiveWeight(w * (1 - jw))
      a.idle.setEffectiveWeight((1 - w) * (1 - jw))
      a.walk.setEffectiveTimeScale(Math.max(0.6, live.speed / WALK_CLIP_MPS))
    } else if (a.idle) {
      // Only the idle so far: run it faster on the move so the legs agree with the ground.
      a.idle.setEffectiveTimeScale(moving ? 2.2 : 1)
      a.idle.setEffectiveWeight(1 - jw)
    }
    m.update(dt)
  })
  if (generated) {
    return (
      <group position={[0, FEET, 0]}>
        <primitive object={generated.group} />
      </group>
    )
  }
  return (
    <>
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
    </>
  )
}

const SPEED = 4.2
const JUMP = 5.2
const GRAVITY = -14
const HAND = new THREE.Vector3()
const MOVE = new THREE.Vector3()
const FWD = new THREE.Vector3()
const RIGHT = new THREE.Vector3()

export default function Explorer({ onPortal, frozen = false }: { onPortal?: (to: ZoneId) => void; frozen?: boolean }) {
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
    if (frozen) { if (mesh.current) mesh.current.visible = false; return }
    // Real time, clamped against a hitch, not against a slow frame: on a weak
    // machine at 10 fps the walk must still cover the ground it would at 60.
    // The character controller shape-casts the whole move, so a long step
    // stops at the first wall like a short one.
    const dt = Math.min(0.25, dtRaw)
    const s = getWorld()
    // Step out of a mode on Escape.
    if (control.exit) {
      control.exit = false
      if (s.crane.active) craneLeave()
      else if (s.room !== 'none') leaveRoom()
      else if (s.talk) talkTo(null)
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
    // Talking holds the explorer still; the card takes the keys.
    const playing = s.phase === 'play' && s.room === 'none' && !s.crane.active && !s.talk

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
    live.speed = moving ? SPEED : 0

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

    // Fell off the island — into the sea, or off the world: back to the spawn, no fuss.
    if (ny < -1.5) {
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
      <RigidBody ref={body} type="kinematicPosition" colliders={false} position={LANDING_SPAWN} name="explorer">
        <CapsuleCollider args={[0.28, 0.24]} />
      </RigidBody>
      <group ref={mesh} name="explorer-mesh">
        <ExplorerBody />
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
        // A hearth is lit with the probe; a bed is read with it (the plate keeps the reading).
        if (id.startsWith('bed.')) {
          if (!probeBed(id)) window.dispatchEvent(new CustomEvent('ploobia:notyet', { detail: id }))
        } else lightHearth(id.slice('hearth.'.length) as FuelId)
        return
      case 'marker':
        pushMarker()
        return
      case 'read':
        readPage()
        return
      case 'plant':
        plantCutting()
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
      case 'door': {
        // Shut doors say why; open ones hand the route to the HUD.
        // Come back a step outside the door's reach, so a tap does not walk straight back in.
        if (!enterDoor(id, [it.pos[0] - 2.2, 0.6, it.pos[2]])) window.dispatchEvent(new CustomEvent('ploobia:doorshut', { detail: id }))
        return
      }
      case 'talk':
        talkTo(id)
        return
    }
  }
}
