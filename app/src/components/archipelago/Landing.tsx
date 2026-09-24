import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { registerInteractable, useWorld } from '@/lib/archipelago'
import { registerBody } from './bodies'
import Lighting, { Lamp } from './Lighting'
import { lightingFor, useSun } from '@/lib/looks'
import { Card } from './Dressing'
import { useWorldTexture } from './useWorldMesh'
import Plot from './Plot'
import Nara from './Nara'
import { JETTY_X, PORTAL, WELL } from './landingLayout'

/**
 * The Landing — the hub island, and from S0 a place: the jetty the child
 * steps off, the harbour path up from it, the well half-way, and the three
 * raised beds (`Plot.tsx`) with Nara beside them (`Nara.tsx`). The
 * settlement stands behind as a painted cut-out with its beacon dark; the
 * Foundry's own island is across the water with its stack cold, and lights
 * when the furnace pours. The gate to the Foundry stays where it was — the
 * crossing is S2's, but the harbour can be explored on its own.
 *
 * Coordinates: the plaza is a disc of radius 14 at y = 0; the gate is at
 * z = −11.5 with a clear walk to it down x = 0; the jetty runs out over the
 * water to the south-east.
 */

export default function Landing() {
  const s = useWorld()
  useEffect(
    () => registerInteractable({ id: 'portal.foundry', verb: 'portal', label: 'The Foundry', pos: PORTAL, radius: 1.3 }),
    [],
  )
  const lamps = lightingFor(useSun(), 'landing').lamps
  return (
    <>
      <Lighting zone="landing" />
      <Lamp position={[PORTAL[0] - 1.6, 3, PORTAL[2] + 0.4]} up={lamps} />
      <Lamp position={[PORTAL[0] + 1.6, 3, PORTAL[2] + 0.4]} up={lamps} />
      <LampPost position={[JETTY_X + 1.5, 0, 12.2]} up={lamps} />

      {/* the sea */}
      <Water />

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
        <Gate />
        <Jetty />
        <HarbourPath />
        <Well />
      </RigidBody>

      {/* the beds, the marker, the fence, the page */}
      <Plot />
      <Nara />

      {/* a few crates off the path — the Grab tool's first minute */}
      <PlazaBlock id="crate.1" position={[7, 1, -6]} color="#B97D10" />
      <PlazaBlock id="crate.2" position={[-6, 1, -7.5]} color="#2F7F7A" />
      <PlazaBlock id="crate.3" position={[8.5, 1, -1]} color="#4A5E7A" size={0.45} />

      {/* the settlement behind, beacon dark until the pour lights the water */}
      <Settlement lit={s.poured} />
      {/* the store platform down the path, past the far bed */}
      <Card id="store-card" height={3.6} position={[-8.6, 1.7, -6.2]} rotation={[0, 0.55, 0]} lit>
        <group>
          <mesh position={[0, -0.9, 0]} castShadow>
            <boxGeometry args={[4.2, 0.5, 2.6]} />
            <meshStandardMaterial color="#8A6A45" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.9, 0]}>
            <boxGeometry args={[4.6, 0.12, 3]} />
            <meshStandardMaterial color="#E9DCC0" roughness={0.9} />
          </mesh>
        </group>
      </Card>

      {/* the Foundry across the water */}
      <FarIsland lit={s.poured} />
      <FloatingRocks />
    </>
  )
}

/** A lamp on a post at the jetty's landward end. */
function LampPost({ position, up }: { position: [number, number, number]; up: number }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.5, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.07, 3, 8]} />
        <meshStandardMaterial color="#3A2E24" roughness={0.8} />
      </mesh>
      <Lamp position={[0, 3.05, 0]} up={up} distance={12} power={7} />
    </group>
  )
}

/** The sea: one big tile, drifting slowly. Flat teal until the texture lands. */
function Water() {
  const tex = useWorldTexture('water')
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  useEffect(() => {
    if (!tex) return
    tex.repeat.set(240 / 9, 240 / 9)
  }, [tex])
  useFrame((st) => {
    if (!tex) return
    tex.offset.set((st.clock.elapsedTime * 0.006) % 1, (st.clock.elapsedTime * 0.004) % 1)
  })
  return (
    <mesh position={[0, -1.1, 0]} rotation={[-Math.PI / 2, 0, 0]} name="water" receiveShadow>
      <planeGeometry args={[240, 240]} />
      {tex ? (
        <meshStandardMaterial key="tiled" ref={mat} map={tex} color="#ffffff" roughness={0.35} metalness={0.05} />
      ) : (
        <meshStandardMaterial key="flat" color="#3FA7A4" roughness={0.4} />
      )}
    </mesh>
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

/** The jetty: planks on posts from the island's edge out over the water, and the boat that brought them. */
function Jetty() {
  const posts = useMemo(() => {
    const p: [number, number][] = []
    for (let z = 13; z <= 20; z += 1.75) {
      p.push([JETTY_X - 1.1, z])
      p.push([JETTY_X + 1.1, z])
    }
    return p
  }, [])
  return (
    <group name="jetty">
      <CuboidCollider args={[1.3, 0.12, 4.2]} position={[JETTY_X, -0.12, 16.6]} />
      <mesh position={[JETTY_X, -0.12, 16.6]} receiveShadow castShadow>
        <boxGeometry args={[2.6, 0.22, 8.4]} />
        <meshStandardMaterial color="#9C7A50" roughness={0.9} />
      </mesh>
      {/* plank lines */}
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={i} position={[JETTY_X, 0, 12.8 + i * 0.7]}>
          <boxGeometry args={[2.62, 0.02, 0.05]} />
          <meshStandardMaterial color="#6E5232" roughness={1} />
        </mesh>
      ))}
      {posts.map(([x, z], i) => (
        <mesh key={i} position={[x, -0.9, z]} castShadow>
          <cylinderGeometry args={[0.12, 0.14, 1.9, 8]} />
          <meshStandardMaterial color="#6E5232" roughness={1} />
        </mesh>
      ))}
      {/* the boat, moored on the far side */}
      <group position={[JETTY_X + 3.1, -0.85, 18.6]} rotation={[0, 0.1, 0]}>
        <mesh castShadow>
          <boxGeometry args={[1.8, 0.7, 4.6]} />
          <meshStandardMaterial color="#A8552E" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.4, 0]}>
          <boxGeometry args={[1.4, 0.1, 4.2]} />
          <meshStandardMaterial color="#E0C79A" roughness={0.9} />
        </mesh>
        <mesh position={[0, 2.1, -0.4]}>
          <cylinderGeometry args={[0.05, 0.07, 3.6, 6]} />
          <meshStandardMaterial color="#5A3E24" roughness={1} />
        </mesh>
      </group>
    </group>
  )
}

/** The harbour path: two tiled strips, jetty → well → plaza, laid a hair above the plaza. */
function HarbourPath() {
  const tex = useWorldTexture('path')
  const strips = useMemo(
    () => [
      { from: [JETTY_X, 12.6], to: [WELL[0] + 0.4, WELL[2] + 1.2], w: 2.3 },
      { from: [WELL[0] - 0.8, WELL[2] - 0.2], to: [0.4, -8.6], w: 2.1 },
    ],
    [],
  )
  return (
    <group name="harbour-path">
      {strips.map((st, i) => {
        const dx = st.to[0] - st.from[0]
        const dz = st.to[1] - st.from[1]
        const len = Math.hypot(dx, dz)
        const yaw = Math.atan2(dx, dz)
        return (
          <mesh key={i} position={[(st.from[0] + st.to[0]) / 2, 0.012, (st.from[1] + st.to[1]) / 2]} rotation={[-Math.PI / 2, 0, yaw]} receiveShadow>
            <planeGeometry args={[st.w, len]} />
            {tex ? (
              <meshStandardMaterial key="tiled" map={tex} color="#ffffff" roughness={0.95} polygonOffset polygonOffsetFactor={-1} />
            ) : (
              <meshStandardMaterial key="flat" color="#C9A070" roughness={1} polygonOffset polygonOffsetFactor={-1} />
            )}
          </mesh>
        )
      })}
    </group>
  )
}

/** The well half-way up the path: a stone ring, a frame, a bucket. */
function Well() {
  return (
    <group position={WELL} name="well">
      <CylinderCollider args={[0.4, 0.62]} position={[0, 0.4, 0]} />
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.58, 0.62, 0.8, 16, 1, true]} />
        <meshStandardMaterial color="#B9A98A" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.8, 0]}>
        <torusGeometry args={[0.58, 0.08, 8, 18]} />
        <meshStandardMaterial color="#8E7E60" roughness={1} />
      </mesh>
      <mesh position={[0, 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.5, 16]} />
        <meshStandardMaterial color="#1F3A44" roughness={0.2} metalness={0.2} />
      </mesh>
      {[-0.5, 0.5].map((x) => (
        <mesh key={x} position={[x, 1.2, 0]} castShadow>
          <boxGeometry args={[0.1, 1.6, 0.1]} />
          <meshStandardMaterial color="#6E5232" roughness={1} />
        </mesh>
      ))}
      <mesh position={[0, 2.0, 0]} castShadow>
        <boxGeometry args={[1.3, 0.08, 0.4]} />
        <meshStandardMaterial color="#C8552E" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.65, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.04, 0.04, 1.1, 6]} />
        <meshStandardMaterial color="#5A3E24" roughness={1} />
      </mesh>
      {/* the bucket, resting on the rim */}
      <mesh position={[0.42, 0.92, 0.28]} castShadow>
        <cylinderGeometry args={[0.13, 0.11, 0.24, 10]} />
        <meshStandardMaterial color="#7A5A3C" roughness={0.9} />
      </mesh>
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

/** The settlement, a painted cut-out on the rock behind the beds; the lit one takes over with the pour. */
function Settlement({ lit }: { lit: boolean }) {
  return (
    <group position={[15, 5.6, -21]} rotation={[0, -0.42, 0]} name="settlement">
      <Card id={lit ? 'landing-cutout-lit' : 'landing-cutout'} height={12.5} position={[0, 0, 0]}>
        <group>
          <mesh position={[0, -3.5, 0]}>
            <boxGeometry args={[12, 5, 4]} />
            <meshStandardMaterial color="#C9B58E" roughness={1} />
          </mesh>
          <mesh position={[-3, 1, 0]}>
            <boxGeometry args={[4, 4, 3.5]} />
            <meshStandardMaterial color="#D9A26A" roughness={1} />
          </mesh>
          <mesh position={[5.5, 2, 0]}>
            <cylinderGeometry args={[0.9, 1.1, 8, 10]} />
            <meshStandardMaterial color="#B98A5A" roughness={1} />
          </mesh>
        </group>
      </Card>
    </group>
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
    <group position={[-38, -2.5, -52]}>
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
      [26, 0.4, -6, 1.6],
      [-21, 1.2, 8, 1.1],
      [-17, 2.5, -34, 2.2],
      [-10, 0.6, 26, 1.4],
    ],
    [],
  )
  const g = useRef<THREE.Group>(null)
  useFrame((st) => {
    const grp = g.current
    if (!grp) return
    grp.children.forEach((c, i) => {
      c.position.y = rocks[i][1] + Math.sin(st.clock.elapsedTime * 0.5 + i) * 0.2
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
