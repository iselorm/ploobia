import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { registerInteractable, useWorld } from '@/lib/archipelago'
import { registerBody } from './bodies'
import Sky from './Sky'

/**
 * The Landing — the hub island. Previz: a plaza on a floating rock, a lift
 * pad where you arrive, the portal gate to the Foundry, and the Foundry's own
 * island visible across the water with its stack cold. When the furnace
 * pours, that island lights (the store's `poured`), which is the whole point
 * of a hub you can see the zones from.
 */

const PORTAL: [number, number, number] = [0, 0, -11.5]

export default function Landing() {
  const s = useWorld()
  useEffect(
    () => registerInteractable({ id: 'portal.foundry', verb: 'portal', label: 'The Foundry', pos: PORTAL, radius: 1.3 }),
    [],
  )
  return (
    <>
      <Sky />
      <ambientLight intensity={0.55} color="#FFF4E0" />
      <hemisphereLight args={['#BFD8F5', '#8A6A3F', 0.9]} />
      <directionalLight
        position={[18, 26, 10]}
        intensity={2.6}
        color="#FFE9C4"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-bias={-0.0008}
      />

      {/* the island: plaza disc on a rock */}
      <RigidBody type="fixed" colliders={false} name="landing-island">
        <CylinderCollider args={[0.6, 14]} position={[0, -0.6, 0]} />
        <mesh position={[0, -0.6, 0]} receiveShadow>
          <cylinderGeometry args={[14, 13.2, 1.2, 40]} />
          <meshStandardMaterial color="#D9C9A4" roughness={0.95} />
        </mesh>
        <mesh position={[0, -4.6, 0]}>
          <coneGeometry args={[12.6, 8, 14]} />
          <meshStandardMaterial color="#7A5A3C" roughness={1} flatShading />
        </mesh>
        {/* grass ring */}
        <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <ringGeometry args={[9.5, 14, 48]} />
          <meshStandardMaterial color="#6FA55A" roughness={1} />
        </mesh>
        {/* arrival pad */}
        <mesh position={[0, 0.06, 4]} receiveShadow>
          <cylinderGeometry args={[1.6, 1.6, 0.12, 24]} />
          <meshStandardMaterial color="#E8A33D" roughness={0.6} emissive="#E8A33D" emissiveIntensity={0.15} />
        </mesh>
        {/* the gate: two pillars and a lintel */}
        <Gate />
      </RigidBody>

      {/* a few blocks on the plaza — the Grab tool's first minute */}
      <PlazaBlock id="crate.1" position={[3, 1, -2]} color="#B97D10" />
      <PlazaBlock id="crate.2" position={[-3.4, 1, -3]} color="#2F7F7A" />
      <PlazaBlock id="crate.3" position={[4.2, 1, 1.5]} color="#4A5E7A" size={0.45} />

      {/* the Foundry across the water */}
      <FarIsland lit={s.poured} />
      <FloatingRocks />
    </>
  )
}

function Gate() {
  return (
    <group position={PORTAL}>
      <mesh position={[-1.4, 1.6, 0]} castShadow>
        <boxGeometry args={[0.5, 3.2, 0.5]} />
        <meshStandardMaterial color="#CDBB92" roughness={0.9} />
      </mesh>
      <mesh position={[1.4, 1.6, 0]} castShadow>
        <boxGeometry args={[0.5, 3.2, 0.5]} />
        <meshStandardMaterial color="#CDBB92" roughness={0.9} />
      </mesh>
      <mesh position={[0, 3.3, 0]} castShadow>
        <boxGeometry args={[3.5, 0.4, 0.6]} />
        <meshStandardMaterial color="#C8552E" roughness={0.8} />
      </mesh>
      {/* the shimmer — a portal you walk into */}
      <mesh position={[0, 1.55, 0]}>
        <planeGeometry args={[2.3, 2.9]} />
        <meshBasicMaterial color="#F0B354" transparent opacity={0.28} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <CuboidCollider args={[0.25, 1.6, 0.25]} position={[-1.4, 1.6, 0]} />
      <CuboidCollider args={[0.25, 1.6, 0.25]} position={[1.4, 1.6, 0]} />
    </group>
  )
}

function PlazaBlock({ id, position, color, size = 0.6 }: { id: string; position: [number, number, number]; color: string; size?: number }) {
  const ref = useRef<RapierRigidBody>(null)
  const it = useMemo(
    () => ({ id, verb: 'grab' as const, label: 'Lift', pos: [...position] as [number, number, number], radius: 1.4, mass: 12 }),
    [id, position],
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
  })
  return (
    <RigidBody ref={ref} position={position} colliders={false} name={id}>
      <CuboidCollider args={[size / 2, size / 2, size / 2]} mass={12} />
      <mesh castShadow receiveShadow>
        <boxGeometry args={[size, size, size]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
    </RigidBody>
  )
}

function FarIsland({ lit }: { lit: boolean }) {
  const smoke = useRef<THREE.Group>(null)
  useFrame((st) => {
    const g = smoke.current
    if (!g) return
    g.visible = lit
    g.children.forEach((c, i) => {
      const t = (st.clock.elapsedTime * 0.4 + i * 0.33) % 1
      c.position.y = 6 + t * 6
      c.scale.setScalar(0.8 + t * 1.6)
      const mat = (c as THREE.Mesh).material as THREE.MeshBasicMaterial
      mat.opacity = 0.5 * (1 - t)
    })
  })
  return (
    <group position={[-38, -6, -52]}>
      <mesh>
        <cylinderGeometry args={[11, 10, 1.4, 20]} />
        <meshStandardMaterial color="#C9B58E" roughness={1} />
      </mesh>
      <mesh position={[0, -4.5, 0]}>
        <coneGeometry args={[10, 7, 10]} />
        <meshStandardMaterial color="#6F5236" roughness={1} flatShading />
      </mesh>
      {/* the furnace hall and its stack */}
      <mesh position={[0, 2.2, 0]}>
        <boxGeometry args={[7, 3, 6]} />
        <meshStandardMaterial color="#A9885F" roughness={0.9} />
      </mesh>
      <mesh position={[2, 5, -1]}>
        <cylinderGeometry args={[0.7, 0.9, 6, 12]} />
        <meshStandardMaterial color={lit ? '#C8552E' : '#5B4A3A'} emissive={lit ? '#C8552E' : '#000000'} emissiveIntensity={lit ? 0.8 : 0} roughness={0.8} />
      </mesh>
      <group ref={smoke} position={[2, 2, -1]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.8, 8, 6]} />
            <meshBasicMaterial color="#F1EADB" transparent opacity={0.4} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function FloatingRocks() {
  const rocks = useMemo(
    () => [
      [22, -3, -8, 1.6],
      [-19, 2, 6, 1.1],
      [12, 5, -30, 2.2],
      [-8, -8, 24, 1.4],
    ],
    [],
  )
  const g = useRef<THREE.Group>(null)
  useFrame((st) => {
    const grp = g.current
    if (!grp) return
    grp.children.forEach((c, i) => {
      c.position.y = rocks[i][1] + Math.sin(st.clock.elapsedTime * 0.5 + i) * 0.35
      c.rotation.y += 0.0015
    })
  })
  return (
    <group ref={g}>
      {rocks.map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]}>
          <dodecahedronGeometry args={[r, 0]} />
          <meshStandardMaterial color="#8C6A46" roughness={1} flatShading />
        </mesh>
      ))}
    </group>
  )
}
