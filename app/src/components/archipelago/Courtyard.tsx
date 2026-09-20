import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody, useAfterPhysicsStep, type RapierRigidBody } from '@react-three/rapier'
import {
  COPPER_MELT_C,
  FUELS,
  FUEL_ORDER,
  fedBlock,
  getWorld,
  CRANE,
  craneTip,
  noteLanding,
  registerInteractable,
  stepPhysicsClock,
  useWorld,
  type FuelId,
  DOORS,
} from '@/lib/archipelago'
import { bodies, registerBody } from './bodies'
import { interactables as interactableMap } from '@/lib/archipelago'
import Sky from './Sky'
import Prop from './Prop'
import { Banner, Braces, Chalkboard, Lintel, Skyline, ToolRack } from './Dressing'
import { useWorldMesh, useWorldTexture } from './useWorldMesh'
import { WORLD_TEXTURES } from '@/lib/worldassets'
import { WORLD_TEXT } from '@/lib/worldtext'

/**
 * The Foundry Courtyard — the vertical slice, as previz. Boards 0–6 of the
 * world bible in grey-box: the cold furnace, the jammed conveyor, three pieces
 * of copper scrap (one too heavy — the crane is W1), the fuel yard with three
 * test hearths, the bellows with its split pipe, and the pour channel.
 *
 * Scrap, not ore: melting copper is not smelting copper ore. Ore is Foundry
 * quest 3, "Metal hidden in stone".
 *
 * Everything here has a verb. Nothing here is a candidate final.
 */

const BELT = { x0: -10, x1: -2, z: -6, halfW: 0.7, top: 0.5, speed: 1.6 }
const MOUTH_X = -2.4

/** Where the explorer stands to drive the crane. */
const CRANE_POST: [number, number, number] = [-8.6, 0, -9.4]

export default function Courtyard() {
  const s = useWorld()
  useEffect(() => {
    const offs = [
      registerInteractable({ id: 'feed.furnace', verb: 'feed', label: 'Feed the furnace', pos: [0, 0, -6], radius: 2.4 }),
      registerInteractable({ id: 'build.pipe', verb: 'build', label: 'Fix the pipe', pos: [3.2, 0, -7], radius: 1.7 }),
      registerInteractable({ id: 'portal.landing', verb: 'portal', label: 'Back to the Landing', pos: [0, 0, 12.6], radius: 1.1 }),
      registerInteractable({ id: 'talk.foreman', verb: 'talk', label: 'The Foreman', pos: [3.2, 0, 8], radius: 1.4 }),
      registerInteractable({ id: 'crane.controls', verb: 'crane', label: 'Drive the crane', pos: CRANE_POST, radius: 1.4 }),
      // The door to the Bench cabinet — shut until the foreman asks for bronze (the third why).
      registerInteractable({ id: 'door.bench', verb: 'door', label: DOORS['door.bench'].label, pos: [11.3, 0, 5.6], radius: 1.5 }),
    ]
    return () => offs.forEach((f) => f())
  }, [])
  const heat = THREE.MathUtils.clamp((s.furnace.temp - 20) / (COPPER_MELT_C + 200), 0, 1)
  return (
    <>
      <Sky top="#F0B354" horizon="#F6E3C6" fog="#EBD6B4" />
      <ambientLight intensity={0.5} color="#FFF0D8" />
      <hemisphereLight args={['#F8DDB0', '#7A5A3C', 0.9]} />
      <directionalLight
        position={[-14, 22, 12]}
        intensity={2.4}
        color="#FFE2B0"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-bias={-0.0008}
      />
      {s.furnace.lit && <pointLight position={[0, 1.6, -5.5]} intensity={6 + heat * 30} distance={14} color="#FF8A3D" />}

      {/* floor and walls */}
      <RigidBody type="fixed" colliders={false} name="courtyard">
        <CuboidCollider args={[13, 0.5, 13]} position={[0, -0.5, 0]} />
        <mesh position={[0, -0.5, 0]} receiveShadow>
          <boxGeometry args={[26, 1, 26]} />
          <meshStandardMaterial color="#C9A97A" roughness={1} />
        </mesh>
        {/* the island beneath */}
        <mesh position={[0, -5.5, 0]}>
          <coneGeometry args={[15, 9, 8]} />
          <meshStandardMaterial color="#6F5236" roughness={1} flatShading />
        </mesh>
        {WALLS.map((w, i) => (
          <Wall key={i} position={w.position} size={w.size} />
        ))}
        <Braces walls={WALLS} />

        {/* the furnace — the W2 mesh (banner, stack and mouth baked) over the previz box */}
        <CuboidCollider args={[2, 2, 2.2]} position={[0, 2, -8.5]} />
        <Prop id="furnace" position={[0, 0, -8.5]} visible={s.room !== 'furnace'}>
          <mesh position={[0, 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[4, 4, 4.4]} />
            <meshStandardMaterial
              color={new THREE.Color('#6B5443').lerp(new THREE.Color('#FF7A2E'), heat * 0.55)}
              emissive="#FF5A1E"
              emissiveIntensity={heat * 1.2}
              roughness={0.85}
            />
          </mesh>
          {/* the stack */}
          <mesh position={[1.2, 7, -0.5]} castShadow>
            <cylinderGeometry args={[0.6, 0.85, 6, 12]} />
            <meshStandardMaterial color="#5B4A3A" roughness={0.9} />
          </mesh>
        </Prop>
        <CuboidCollider args={[0.7, 3, 0.7]} position={[1.2, 7, -9]} />
        {/* the mouth: the glow is the state, an additive bloom over either body's mouth — nothing when cold */}
        <MouthGlow heat={heat} visible={s.room !== 'furnace'} />
        {/* the room: the same furnace, cut open — what the camera sees from inside the mouth */}
        {s.room === 'furnace' && <FurnaceRoom heat={heat} air={s.air} lit={s.furnace.lit} fuel={s.furnace.fuel} />}
        {/* the pour channel */}
        <mesh position={[0, 0.06, -4.6]} receiveShadow>
          <boxGeometry args={[0.9, 0.12, 4.4]} />
          <meshStandardMaterial
            color={s.poured ? '#FFB347' : '#8A6A48'}
            emissive={s.poured ? '#FF7A2E' : '#000000'}
            emissiveIntensity={s.poured ? 1.4 : 0}
            roughness={0.5}
            toneMapped={!s.poured}
          />
        </mesh>

        {/* the conveyor bed */}
        <CuboidCollider args={[(BELT.x1 - BELT.x0) / 2, 0.25, BELT.halfW]} position={[(BELT.x0 + BELT.x1) / 2, 0.25, BELT.z]} />
        <mesh position={[(BELT.x0 + BELT.x1) / 2, 0.25, BELT.z]} receiveShadow castShadow>
          <boxGeometry args={[BELT.x1 - BELT.x0, 0.5, BELT.halfW * 2]} />
          <meshStandardMaterial color="#3B3A3A" roughness={0.8} />
        </mesh>
        <BeltStripes />

        {/* the bellows and the split pipe */}
        <CuboidCollider args={[0.9, 0.6, 0.7]} position={[6, 0.6, -8]} />
        <Prop id="bellows" position={[6, 0, -8]}>
          <mesh position={[0, 0.6, 0]} castShadow>
            <boxGeometry args={[1.8, 1.2, 1.4]} />
            <meshStandardMaterial color="#8A5A3B" roughness={0.9} />
          </mesh>
        </Prop>
        <Pipe x0={4.5} x1={3.6} />
        <Pipe x0={2.9} x1={2.0} />
        {s.pipeFixed ? (
          <Pipe x0={3.6} x1={2.9} fresh />
        ) : (
          <mesh position={[3.25, 0.55, -8]} rotation={[0, 0, 0.5]}>
            <cylinderGeometry args={[0.2, 0.2, 0.7, 10]} />
            <meshStandardMaterial color="#4A5E7A" roughness={0.6} />
          </mesh>
        )}

        {/* the fuel yard: three test hearths */}
        {FUEL_ORDER.map((f, i) => (
          <Hearth key={f} fuel={f} position={[6 + i * 2.3, 0, 3]} />
        ))}

        {/* the foreman — a stand-in until the language file names him */}
        <group position={[3.2, 0, 8]}>
          <mesh position={[0, 0.7, 0]} castShadow>
            <capsuleGeometry args={[0.28, 0.7, 6, 12]} />
            <meshStandardMaterial color="#C8552E" roughness={0.6} />
          </mesh>
          <mesh position={[0, 1.4, 0]} castShadow>
            <sphereGeometry args={[0.22, 14, 10]} />
            <meshStandardMaterial color="#5A3A26" roughness={0.6} />
          </mesh>
        </group>

        {/* the gate back */}
        <mesh position={[0, 1.55, 12.7]}>
          <planeGeometry args={[2.6, 2.9]} />
          <meshBasicMaterial color="#F0B354" transparent opacity={0.25} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      </RigidBody>

      <AirLanes />
      <Smoke lit={s.furnace.lit} />

      {/* the place around the things (W2 batch 2): banners either side of the mouth, racks and the
          chalkboard on the east wall, the rule over the gate, the skyline beyond the walls */}
      <Banner lines={WORLD_TEXT.foundry.bannerTitle} position={[-4.4, 1.65, -12.62]} />
      <Banner lines={WORLD_TEXT.foundry.bannerMotto} position={[4.4, 1.65, -12.62]} />
      <ToolRack position={[12.55, 1.7, -4]} rotation={[0, -Math.PI / 2, 0]} />
      <ToolRack position={[12.55, 1.7, 7.5]} rotation={[0, -Math.PI / 2, 0]} />
      <Chalkboard position={[12.2, 0, 1.6]} rotation={[0, -Math.PI / 2, 0]} />
      <Lintel position={[0, 3.25, 13]} />
      <Skyline poured={s.poured} />
      <BenchDoor open={DOORS['door.bench'].unlocked(s)} />

      {/* the copper scrap — metal, not ore: this quest is melting, not smelting */}
      <Scrap id="scrap.a" position={[-7, 1, -7.7]} mass={12} size={0.6} />
      <Scrap id="scrap.b" position={[-5, 1, -1.4]} mass={12} size={0.6} />
      <Scrap id="scrap.heavy" position={[-6.3, 0.8, -9]} mass={120} size={0.95} />
      <Crane />
      <ConveyorDrive />
    </>
  )
}

/**
 * The crane — a mast, a boom that swings, a hook that rises and falls. The
 * explorer drives it from the post (§ his panel 3: W raise · S lower · A/D
 * rotate · E take/release). A piece under a low hook is taken; released from
 * height it falls under Rapier, and the landing is timed — that is board 1's
 * bet, measured: same height, two masses, two fall times.
 *
 * Holding is the hand trick: the piece goes kinematic and rides the hook.
 */
/** One fixed step of the physics world (see `<Physics timeStep>`). */
const PHYSICS_STEP = 1 / 60

function Crane() {
  const s = useWorld()
  const falling = useRef(new Set<string>())
  // The clock and the landings advance per physics step, not per frame: a
  // slow frame can hold several steps, and a landing stamped a frame late
  // would read as a slower fall.
  useAfterPhysicsStep(() => {
    stepPhysicsClock(PHYSICS_STEP)
    const c = getWorld().crane
    for (const id of Object.keys(c.drops)) {
      const d = c.drops[id]
      if (d.t1 != null) continue
      const b = bodies.get(id)
      if (!b) continue
      const t = b.translation()
      const v = b.linvel()
      // Landed = it has actually fallen (seen moving down) and then stopped.
      // Without the first half, the step of release reads as a landing.
      if (v.y < -0.5) falling.current.add(id)
      if (falling.current.has(id) && Math.abs(v.y) < 0.15 && t.y < d.from - 0.4) {
        falling.current.delete(id)
        noteLanding(id)
      }
    }
  })
  const generated = !!useWorldMesh('crane')
  const rig = useRef<THREE.Group>(null)
  const boom = useRef<THREE.Group>(null)
  const hook = useRef<THREE.Group>(null)
  const cable = useRef<THREE.Mesh>(null)
  useFrame(() => {
    const w = getWorld()
    const c = w.crane
    const [tx, tz] = craneTip(c.yaw)
    if (boom.current) boom.current.rotation.y = c.yaw
    if (rig.current) rig.current.rotation.y = c.yaw
    if (hook.current) hook.current.position.set(tx, c.hookY, tz)
    if (cable.current) {
      const len = CRANE.boomY - c.hookY
      cable.current.position.set(tx, c.hookY + len / 2, tz)
      cable.current.scale.y = Math.max(0.01, len)
    }
    // The held piece rides the hook.
    if (c.holding) {
      const b = bodies.get(c.holding)
      if (b) {
        b.setNextKinematicTranslation({ x: tx, y: c.hookY - 0.55, z: tz })
        const it = interactablesFor(c.holding)
        if (it) it.pos = [tx, c.hookY - 0.55, tz]
      }
    }
  })
  const [tx, tz] = craneTip(s.crane.yaw)
  return (
    <group>
      {/* mast — the W2 crane is one mesh pivoted on the mast axis: it swings whole, the cable and hook stay ours */}
      <CuboidCollider args={[0.35, 3, 0.35]} position={[CRANE.mast[0], 3, CRANE.mast[2]]} />
      <group ref={rig} position={CRANE.mast} rotation={[0, s.crane.yaw, 0]}>
        <Prop id="crane">
          <mesh position={[0, 3, 0]} castShadow>
            <boxGeometry args={[0.7, 6, 0.7]} />
            <meshStandardMaterial color="#8A6A3F" roughness={0.9} />
          </mesh>
        </Prop>
      </group>
      {/* the post you drive it from */}
      <CuboidCollider args={[0.25, 0.5, 0.25]} position={[CRANE_POST[0], 0.5, CRANE_POST[2]]} />
      <mesh position={[CRANE_POST[0], 0.5, CRANE_POST[2]]} castShadow>
        <boxGeometry args={[0.5, 1, 0.5]} />
        <meshStandardMaterial color="#5E5346" roughness={0.9} />
      </mesh>
      <mesh position={[CRANE_POST[0], 1.05, CRANE_POST[2]]}>
        <boxGeometry args={[0.6, 0.1, 0.4]} />
        <meshStandardMaterial color={s.crane.active ? '#E8A33D' : '#C8552E'} emissive={s.crane.active ? '#E8A33D' : '#000'} emissiveIntensity={0.6} roughness={0.5} />
      </mesh>
      {/* boom, swinging about the mast — the previz boom; the generated crane carries its own */}
      <group ref={boom} position={[CRANE.mast[0], CRANE.boomY, CRANE.mast[2]]} rotation={[0, s.crane.yaw, 0]} visible={!generated}>
        <mesh position={[0, 0, CRANE.reach / 2 - 0.6]} castShadow>
          <boxGeometry args={[0.4, 0.4, CRANE.reach + 1.2]} />
          <meshStandardMaterial color="#B97D10" roughness={0.7} />
        </mesh>
        {/* counterweight */}
        <mesh position={[0, -0.3, -1.4]} castShadow>
          <boxGeometry args={[0.8, 0.6, 0.8]} />
          <meshStandardMaterial color="#5E5346" roughness={0.9} />
        </mesh>
      </group>
      {/* cable and hook */}
      <mesh ref={cable} position={[tx, (CRANE.boomY + s.crane.hookY) / 2, tz]}>
        <cylinderGeometry args={[0.03, 0.03, 1, 6]} />
        <meshStandardMaterial color="#2A2622" roughness={0.9} />
      </mesh>
      <group ref={hook} position={[tx, s.crane.hookY, tz]}>
        <mesh castShadow>
          <boxGeometry args={[0.35, 0.25, 0.35]} />
          <meshStandardMaterial color="#4A5E7A" roughness={0.5} metalness={0.4} />
        </mesh>
        <mesh position={[0, -0.25, 0]}>
          <torusGeometry args={[0.16, 0.05, 8, 12]} />
          <meshStandardMaterial color="#4A5E7A" roughness={0.5} metalness={0.4} />
        </mesh>
      </group>
    </group>
  )
}

/** A radial glow, drawn once. */
let glowTex: THREE.Texture | null = null
function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,240,200,1)')
  grad.addColorStop(0.35, 'rgba(255,150,60,0.85)')
  grad.addColorStop(1, 'rgba(255,90,30,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  glowTex = new THREE.CanvasTexture(c)
  glowTex.colorSpace = THREE.SRGBColorSpace
  return glowTex
}

/**
 * The furnace mouth's glow: additive, breathing, scaled by heat. At 20 °C it
 * is not there at all — the cold mouth is the mesh's own.
 */
function MouthGlow({ heat, visible }: { heat: number; visible: boolean }) {
  const ref = useRef<THREE.Mesh>(null)
  const tex = useMemo(() => glowTexture(), [])
  useFrame((st) => {
    const m = ref.current
    if (!m) return
    const breathe = 1 + 0.08 * Math.sin(st.clock.elapsedTime * 7) + 0.05 * Math.sin(st.clock.elapsedTime * 11.3)
    const k = (0.6 + heat * 1.6) * breathe
    m.scale.set(2.2 * k, 1.7 * k, 1)
    ;(m.material as THREE.MeshBasicMaterial).opacity = Math.min(1, heat * 1.4)
  })
  return (
    <mesh ref={ref} position={[0, 1.05, -6.25]} visible={visible && heat > 0.01}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={tex} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

function interactablesFor(id: string) {
  return interactableMap.get(id)
}

/** The furnace, cut open: the bed, the flames, the nozzle where the air arrives. */
function FurnaceRoom({ heat, air, lit, fuel }: { heat: number; air: number; lit: boolean; fuel: FuelId | null }) {
  const flames = useRef<THREE.Group>(null)
  useFrame((st) => {
    const g = flames.current
    if (!g) return
    g.visible = lit
    g.children.forEach((c, i) => {
      const t = st.clock.elapsedTime * (2 + air * 4) + i
      const h = 0.25 + heat * 0.9 + air * 0.5
      c.scale.set(0.5 + Math.sin(t * 1.3) * 0.1, h * (0.8 + Math.abs(Math.sin(t)) * 0.4), 0.5)
    })
  })
  const stone = '#3A2E26'
  const pile = fuel === 'wetwood' ? '#5E4A36' : fuel === 'drywood' ? '#A8804E' : '#2A2622'
  return (
    <group position={[0, 0, -8.5]}>
      {/* the cavity: floor, back, sides, roof */}
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <boxGeometry args={[3.6, 0.1, 2.8]} />
        <meshStandardMaterial color={stone} roughness={1} />
      </mesh>
      <mesh position={[0, 2, -1.4]}>
        <boxGeometry args={[3.6, 4, 0.2]} />
        <meshStandardMaterial color={stone} roughness={1} emissive="#FF5A1E" emissiveIntensity={heat * 0.35} />
      </mesh>
      <mesh position={[-1.8, 2, 0]}>
        <boxGeometry args={[0.2, 4, 2.8]} />
        <meshStandardMaterial color={stone} roughness={1} />
      </mesh>
      <mesh position={[1.8, 2, 0]}>
        <boxGeometry args={[0.2, 4, 2.8]} />
        <meshStandardMaterial color={stone} roughness={1} />
      </mesh>
      <mesh position={[0, 4, 0]}>
        <boxGeometry args={[3.6, 0.2, 2.8]} />
        <meshStandardMaterial color={stone} roughness={1} />
      </mesh>
      {/* the bed of fuel */}
      {[-0.6, 0, 0.6, -0.3, 0.3].map((x, i) => (
        <mesh key={i} position={[x, 0.3, (i % 2) * 0.4 - 0.2]} castShadow>
          <dodecahedronGeometry args={[0.28, 0]} />
          <meshStandardMaterial color={fuel ? pile : '#5E5346'} emissive="#FF6A1E" emissiveIntensity={fuel ? heat * 2.2 : 0} roughness={1} flatShading />
        </mesh>
      ))}
      {/* the copper on the bed */}
      <mesh position={[0, 0.55, 0.2]} castShadow>
        <boxGeometry args={[0.9, 0.35, 0.6]} />
        <meshStandardMaterial color={new THREE.Color('#B5652E').lerp(new THREE.Color('#FFB347'), heat)} emissive="#FF8A3D" emissiveIntensity={heat * heat * 2} roughness={0.35} metalness={0.7} />
      </mesh>
      <group ref={flames} position={[0, 0.5, 0]}>
        {[-0.5, 0, 0.5, -0.25, 0.25].map((x, i) => (
          <mesh key={i} position={[x, 0.5, (i % 2) * 0.3 - 0.15]}>
            <coneGeometry args={[0.28, 1, 8]} />
            <meshBasicMaterial color={new THREE.Color('#FF7A2E').lerp(new THREE.Color('#FFE08A'), heat)} transparent opacity={0.85} toneMapped={false} />
          </mesh>
        ))}
      </group>
      {/* the nozzle on the right wall — where the pipe comes in */}
      <mesh position={[1.7, 0.8, 0.5]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.2, 0.2, 0.3, 10]} />
        <meshStandardMaterial color="#4A5E7A" roughness={0.5} metalness={0.3} />
      </mesh>
      <pointLight position={[0, 1.4, 0.4]} intensity={2 + heat * 24} distance={8} color="#FF8A3D" />
    </group>
  )
}

/**
 * The Bench — a workbench under an awning against the east wall, the door
 * into the atoms cabinet (its Door 2, the Bench). Copper and tin wait on it:
 * the bronze question is a counting question, and this is where it goes.
 * Shut (awning down, lamp cold) until the third why; open, the lamp burns.
 */
function BenchDoor({ open }: { open: boolean }) {
  return (
    <group position={[11.7, 0, 5.6]} rotation={[0, -Math.PI / 2, 0]} name="door-bench">
      {/* bench */}
      <mesh position={[0, 0.82, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.3, 0.12, 0.9]} />
        <meshStandardMaterial color="#6B4A30" roughness={0.9} />
      </mesh>
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * 1.0, 0.38, sz * 0.35]} castShadow>
            <boxGeometry args={[0.1, 0.76, 0.1]} />
            <meshStandardMaterial color="#5A3E2A" roughness={0.9} />
          </mesh>
        )),
      )}
      {/* copper and tin — the two halves of the question */}
      <mesh position={[-0.55, 0.96, 0.1]} rotation={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.5, 0.16, 0.22]} />
        <meshStandardMaterial color="#B5652E" roughness={0.45} metalness={0.6} />
      </mesh>
      <mesh position={[0.45, 0.94, -0.1]} rotation={[0, -0.2, 0]} castShadow>
        <boxGeometry args={[0.32, 0.12, 0.18]} />
        <meshStandardMaterial color="#B9BCC0" roughness={0.35} metalness={0.8} />
      </mesh>
      {/* the awning on two posts */}
      {[-1.2, 1.2].map((x) => (
        <mesh key={x} position={[x, 1.5, -0.55]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 3, 8]} />
          <meshStandardMaterial color="#4A3A2C" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 2.7, 0.15]} rotation={[-Math.PI / 2 + (open ? 0.3 : 1.05), 0, 0]} castShadow>
        <planeGeometry args={[2.9, 1.6]} />
        <meshStandardMaterial color="#C8552E" roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      {/* the lamp: cold while shut, burning when open */}
      <mesh position={[0, 2.2, 0.3]}>
        <sphereGeometry args={[0.14, 12, 8]} />
        <meshBasicMaterial color={open ? '#FFD27A' : '#5C5646'} toneMapped={false} />
      </mesh>
      {open && <pointLight position={[0, 2.3, 0.3]} intensity={3} distance={5} color="#FFC46A" />}
    </group>
  )
}

const WALLS: { position: [number, number, number]; size: [number, number, number] }[] = [
  { position: [0, 1.5, -13], size: [26, 3, 0.6] },
  { position: [-13, 1.5, 0], size: [0.6, 3, 26] },
  { position: [13, 1.5, 0], size: [0.6, 3, 26] },
  { position: [-8, 1.5, 13], size: [10, 3, 0.6] },
  { position: [8, 1.5, 13], size: [10, 3, 0.6] },
]

/** A courtyard wall: the collider, and sandstone blocks (the batch-2 tile) over the flat colour once it lands. */
function Wall({ position, size }: { position: [number, number, number]; size: [number, number, number] }) {
  const tile = useWorldTexture('wall')
  const map = useMemo(() => {
    if (!tile) return null
    const t = tile.clone()
    const len = Math.max(size[0], size[2])
    const m = WORLD_TEXTURES.wall.metres ?? 3
    t.repeat.set(len / m, size[1] / m)
    t.needsUpdate = true
    return t
  }, [tile, size])
  return (
    <>
      <CuboidCollider args={[size[0] / 2, size[1] / 2, size[2] / 2]} position={position} />
      <mesh position={position} castShadow receiveShadow userData={{ generated: !!map }}>
        <boxGeometry args={size} />
        {/* keyed: R3F resets a dropped `color` prop to black when it reuses the material */}
        {map ? <meshStandardMaterial key="tiled" map={map} color="#ffffff" roughness={0.95} /> : <meshStandardMaterial key="flat" color="#D8C39A" roughness={1} />}
      </mesh>
    </>
  )
}

function Pipe({ x0, x1, fresh = false }: { x0: number; x1: number; fresh?: boolean }) {
  return (
    <mesh position={[(x0 + x1) / 2, 0.8, -8]} rotation={[0, 0, Math.PI / 2]} castShadow>
      <cylinderGeometry args={[0.2, 0.2, Math.abs(x0 - x1), 10]} />
      <meshStandardMaterial color={fresh ? '#6FA55A' : '#4A5E7A'} roughness={0.5} metalness={0.3} />
    </mesh>
  )
}

function BeltStripes() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const N = 12
  const m = useMemo(() => new THREE.Object3D(), [])
  useFrame((st) => {
    const im = ref.current
    if (!im) return
    const span = BELT.x1 - BELT.x0
    for (let i = 0; i < N; i++) {
      const t = ((st.clock.elapsedTime * BELT.speed) / span + i / N) % 1
      m.position.set(BELT.x0 + t * span, BELT.top + 0.01, BELT.z)
      m.updateMatrix()
      im.setMatrixAt(i, m.matrix)
    }
    im.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, N]}>
      <boxGeometry args={[0.12, 0.02, BELT.halfW * 1.8]} />
      <meshStandardMaterial color="#8A8A8A" roughness={0.9} />
    </instancedMesh>
  )
}

function Hearth({ fuel, position }: { fuel: FuelId; position: [number, number, number] }) {
  const s = useWorld()
  const temp = s.hearths[fuel]
  const lit = s.lit.includes(fuel)
  const id = `hearth.${fuel}`
  const it = useMemo(
    () => ({ id, verb: 'probe' as const, label: `Light ${FUELS[fuel].name.toLowerCase()}`, pos: [...position] as [number, number, number], radius: 1.3 }),
    [id, fuel, position],
  )
  useEffect(() => registerInteractable(it), [it])
  const h = THREE.MathUtils.clamp((temp - 20) / 1400, 0, 1)
  const pile = fuel === 'wetwood' ? '#5E4A36' : fuel === 'drywood' ? '#A8804E' : '#2A2622'
  // The W2 crate (one mesh, three fills) stands in for the slab; the pile
  // rises to sit inside it and the collider grows to its box.
  const crated = !!useWorldMesh('crate')
  const top = crated ? 0.95 : 0.42
  return (
    <group position={position}>
      {crated ? <CuboidCollider args={[0.7, 0.55, 0.8]} position={[0, 0.55, 0]} /> : <CuboidCollider args={[0.55, 0.15, 0.55]} position={[0, 0.15, 0]} />}
      <Prop id="crate" own>
        <mesh position={[0, 0.15, 0]} receiveShadow castShadow>
          <cylinderGeometry args={[0.6, 0.65, 0.3, 14]} />
          <meshStandardMaterial color="#A28A66" roughness={1} />
        </mesh>
      </Prop>
      <mesh position={[0, top, 0]} castShadow>
        <dodecahedronGeometry args={[0.28, 0]} />
        <meshStandardMaterial color={pile} roughness={1} flatShading />
      </mesh>
      {lit && (
        <mesh position={[0, top + 0.13 + h * 0.5, 0]} scale={[0.5 + h, 0.6 + h * 1.4, 0.5 + h]}>
          <sphereGeometry args={[0.35, 10, 8]} />
          <meshBasicMaterial color={new THREE.Color('#FF7A2E').lerp(new THREE.Color('#FFE08A'), h)} transparent opacity={0.85} toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}

/**
 * The System ring's picture of the draught: air as lanes into the furnace.
 * They stop at the split until the pipe is fixed, then run through. Visible
 * only on the System ring — the Lens is the only way to see this.
 */
function AirLanes() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const N = 72
  const m = useMemo(() => new THREE.Object3D(), [])
  useFrame((st) => {
    const im = ref.current
    if (!im) return
    const s = getWorld()
    im.visible = s.ring === 'system'
    if (!im.visible) return
    const x0 = 6.4
    const BREAK = 3.6
    for (let i = 0; i < N; i++) {
      const lane = i % 6
      const t = (st.clock.elapsedTime * 0.3 + i / N) % 1
      const x = x0 - t * (x0 - 0.3)
      // Past the split with the pipe still open, the air escapes: it lifts
      // and scatters instead of reaching the furnace. That leak IS the
      // diagnosis — the learner sees where the draught goes.
      const leak = !s.pipeFixed && x < BREAK ? (BREAK - x) : 0
      const px = leak ? BREAK - leak * 0.35 : x
      const py = 0.8 + (lane - 2.5) * 0.07 + leak * 1.1
      const pz = -8 + ((i * 7) % 5 - 2) * 0.06 + (leak ? Math.sin(i * 1.7) * leak * 0.6 : 0)
      m.position.set(px, py, pz)
      m.rotation.set(0, 0, leak ? Math.PI / 2 - Math.min(1.2, leak) : Math.PI / 2)
      const fade = leak ? Math.max(0, 1 - leak / 2.6) : 1
      m.scale.setScalar(fade < 0.02 ? 0.0001 : fade)
      m.updateMatrix()
      im.setMatrixAt(i, m.matrix)
    }
    im.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, N]} frustumCulled={false}>
      <capsuleGeometry args={[0.055, 0.34, 3, 6]} />
      <meshBasicMaterial color="#4FC3FF" toneMapped={false} />
    </instancedMesh>
  )
}

function Smoke({ lit }: { lit: boolean }) {
  const g = useRef<THREE.Group>(null)
  useFrame((st) => {
    const grp = g.current
    if (!grp) return
    grp.visible = lit
    grp.children.forEach((c, i) => {
      const t = (st.clock.elapsedTime * 0.35 + i * 0.25) % 1
      c.position.set(Math.sin(t * 3 + i) * 0.3, 10.2 + t * 5, 0)
      c.scale.setScalar(0.6 + t * 1.8)
      const mat = (c as THREE.Mesh).material as THREE.MeshBasicMaterial
      mat.opacity = 0.45 * (1 - t)
    })
  })
  return (
    <group ref={g} position={[1.2, 0, -9]}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i}>
          <sphereGeometry args={[0.7, 8, 6]} />
          <meshBasicMaterial color="#F1EADB" transparent opacity={0.4} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

function Scrap({ id, position, mass, size }: { id: string; position: [number, number, number]; mass: number; size: number }) {
  const ref = useRef<RapierRigidBody>(null)
  const it = useMemo(
    () => ({ id, verb: 'grab' as const, label: mass > 40 ? 'Too heavy — needs the crane' : 'Lift', pos: [...position] as [number, number, number], radius: 1.4, mass }),
    [id, position, mass],
  )
  useEffect(() => registerInteractable(it), [it])
  useEffect(() => {
    if (ref.current) return registerBody(id, ref.current)
  }, [id])
  const meshRef = useRef<THREE.Group>(null)
  useFrame(() => {
    const b = ref.current
    if (!b) return
    const t = b.translation()
    it.pos[0] = t.x
    it.pos[1] = t.y
    it.pos[2] = t.z
    // A fed piece is inside the furnace and out of reach for good — and out
    // of sight: the room draws the copper on the bed as one melting mass.
    const fed = getWorld().fed.includes(id)
    if (fed) it.radius = 0
    if (meshRef.current) meshRef.current.visible = !fed
  })
  // The ingot mesh is normalised to 0.6 m; the heavy billet is the same casting, larger.
  const k = size / 0.6
  return (
    <RigidBody ref={ref} position={position} colliders={false} name={id}>
      <CuboidCollider args={[size / 2, size / 2, size / 2]} mass={mass} />
      <group ref={meshRef}>
        <Prop id="ingot" own scale={k} position={[0, -size / 2, 0]}>
          <mesh position={[0, size / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[size, size * 0.7, size * 0.8]} />
            <meshStandardMaterial color="#B5652E" roughness={0.35} metalness={0.7} />
          </mesh>
        </Prop>
      </group>
    </RigidBody>
  )
}

/**
 * The belt: an ore block resting on it is driven toward the mouth. A block
 * that reaches the mouth is fed — it goes dark inside the furnace and out of
 * play, and the store counts it. Not Rapier's job; the belt is a rule.
 */
function ConveyorDrive() {
  useFrame(() => {
    const s = getWorld()
    for (const id of ['scrap.a', 'scrap.b', 'scrap.heavy']) {
      if (s.held === id || s.fed.includes(id)) continue
      const b = bodies.get(id)
      if (!b) continue
      const t = b.translation()
      const onBelt = t.x >= BELT.x0 && t.x <= BELT.x1 + 0.6 && Math.abs(t.z - BELT.z) <= BELT.halfW + 0.2 && t.y > BELT.top && t.y < BELT.top + 1.4
      if (!onBelt) continue
      const v = b.linvel()
      b.setLinvel({ x: BELT.speed, y: v.y, z: (BELT.z - t.z) * 2 }, true)
      if (t.x > MOUTH_X) {
        fedBlock(id)
        b.setTranslation({ x: 0, y: 1, z: -8.5 }, false)
        b.setEnabled(false)
      }
    }
  })
  return null
}
