import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import {
  COPPER_MELT_C,
  FUELS,
  FUEL_ORDER,
  fedBlock,
  getWorld,
  registerInteractable,
  useWorld,
  type FuelId,
} from '@/lib/archipelago'
import { bodies, registerBody } from './bodies'
import Sky from './Sky'

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

export default function Courtyard() {
  const s = useWorld()
  useEffect(() => {
    const offs = [
      registerInteractable({ id: 'feed.furnace', verb: 'feed', label: 'Feed the furnace', pos: [0, 0, -6], radius: 2.4 }),
      registerInteractable({ id: 'build.pipe', verb: 'build', label: 'Fix the pipe', pos: [3.2, 0, -7], radius: 1.7 }),
      registerInteractable({ id: 'portal.landing', verb: 'portal', label: 'Back to the Landing', pos: [0, 0, 12.6], radius: 1.1 }),
      registerInteractable({ id: 'talk.foreman', verb: 'talk', label: 'The Foreman', pos: [3.2, 0, 8], radius: 1.4 }),
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
        <Wall position={[0, 1.5, -13]} size={[26, 3, 0.6]} />
        <Wall position={[-13, 1.5, 0]} size={[0.6, 3, 26]} />
        <Wall position={[13, 1.5, 0]} size={[0.6, 3, 26]} />
        <Wall position={[-8, 1.5, 13]} size={[10, 3, 0.6]} />
        <Wall position={[8, 1.5, 13]} size={[10, 3, 0.6]} />

        {/* the furnace */}
        <CuboidCollider args={[2, 2, 1.5]} position={[0, 2, -8.5]} />
        <mesh position={[0, 2, -8.5]} castShadow receiveShadow>
          <boxGeometry args={[4, 4, 3]} />
          <meshStandardMaterial
            color={new THREE.Color('#6B5443').lerp(new THREE.Color('#FF7A2E'), heat * 0.55)}
            emissive="#FF5A1E"
            emissiveIntensity={heat * 1.2}
            roughness={0.85}
          />
        </mesh>
        {/* the mouth */}
        <mesh position={[0, 1.1, -6.98]}>
          <boxGeometry args={[1.8, 1.4, 0.1]} />
          <meshStandardMaterial color="#1E140C" emissive="#FF6A1E" emissiveIntensity={heat * 3} toneMapped={false} />
        </mesh>
        {/* the stack */}
        <CuboidCollider args={[0.7, 3, 0.7]} position={[1.2, 7, -9]} />
        <mesh position={[1.2, 7, -9]} castShadow>
          <cylinderGeometry args={[0.6, 0.85, 6, 12]} />
          <meshStandardMaterial color="#5B4A3A" roughness={0.9} />
        </mesh>
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
        <mesh position={[6, 0.6, -8]} castShadow>
          <boxGeometry args={[1.8, 1.2, 1.4]} />
          <meshStandardMaterial color="#8A5A3B" roughness={0.9} />
        </mesh>
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

      {/* the copper scrap — metal, not ore: this quest is melting, not smelting */}
      <Scrap id="scrap.a" position={[-7, 1, -2]} mass={12} size={0.6} />
      <Scrap id="scrap.b" position={[-5, 1, -1.4]} mass={12} size={0.6} />
      <Scrap id="scrap.heavy" position={[-8.6, 1, -3.4]} mass={120} size={0.95} />
      <ConveyorDrive />
    </>
  )
}

function Wall({ position, size }: { position: [number, number, number]; size: [number, number, number] }) {
  return (
    <>
      <CuboidCollider args={[size[0] / 2, size[1] / 2, size[2] / 2]} position={position} />
      <mesh position={position} castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color="#D8C39A" roughness={1} />
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
  return (
    <group position={position}>
      <CuboidCollider args={[0.55, 0.15, 0.55]} position={[0, 0.15, 0]} />
      <mesh position={[0, 0.15, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[0.6, 0.65, 0.3, 14]} />
        <meshStandardMaterial color="#A28A66" roughness={1} />
      </mesh>
      <mesh position={[0, 0.42, 0]} castShadow>
        <dodecahedronGeometry args={[0.28, 0]} />
        <meshStandardMaterial color={pile} roughness={1} flatShading />
      </mesh>
      {lit && (
        <mesh position={[0, 0.55 + h * 0.5, 0]} scale={[0.5 + h, 0.6 + h * 1.4, 0.5 + h]}>
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
  useFrame(() => {
    const b = ref.current
    if (!b) return
    const t = b.translation()
    it.pos[0] = t.x
    it.pos[1] = t.y
    it.pos[2] = t.z
    // A fed block is inside the furnace and out of reach for good.
    if (getWorld().fed.includes(id)) it.radius = 0
  })
  return (
    <RigidBody ref={ref} position={position} colliders={false} name={id}>
      <CuboidCollider args={[size / 2, size / 2, size / 2]} mass={mass} />
      <mesh castShadow receiveShadow>
        <boxGeometry args={[size, size * 0.7, size * 0.8]} />
        <meshStandardMaterial color="#B5652E" roughness={0.35} metalness={0.7} />
      </mesh>
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
