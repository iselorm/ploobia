import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { OCC_SLOT, clearOccluder, setOccluder } from '@/lib/occluders'
import type { PhotoSim } from '@/lib/photo'
import { glyphTexture } from './Glyphs'
import { shadowTexture } from './Sprites'

const BUBBLES = 42
const TUBE_H = 2.6
const TUBE_R = 0.22

/**
 * The measuring apparatus, on stage.
 *
 * A graduated tube standing beside the plant, collecting the oxygen the leaf
 * gives off. When a trial is running, bubbles climb it and the gas column
 * grows — so the number in the data table has a visible physical origin
 * instead of appearing out of nowhere.
 */
/**
 * The apparatus is only on stage while a measurement is being taken (and for
 * a moment after, so the reading has somewhere to come from). The rest of the
 * time the learner looks at a plant in a place, not a plant beside a beaker.
 */
const LINGER_SECONDS = 4

export default function BubbleTube({ sim, position }: { sim: PhotoSim; position: [number, number, number] }) {
  const bubblesRef = useRef<THREE.InstancedMesh>(null)
  const rigRef = useRef<THREE.Group>(null)
  const presence = useRef(0)
  const lastTrialAt = useRef(-Infinity)
  const labelRef = useRef<THREE.Mesh>(null)
  const { texture: labelTexture, aspect: labelAspect } = useMemo(
    () => glyphTexture('O₂', '#14567D'),
    [],
  )
  const columnRef = useRef<THREE.Mesh>(null)
  const shadowTex = useMemo(() => shadowTexture(), [])
  const glassRef = useRef<THREE.MeshStandardMaterial>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const seeds = useMemo(
    () =>
      Array.from({ length: BUBBLES }, () => ({
        t: Math.random(),
        speed: 0.35 + Math.random() * 0.5,
        offset: (Math.random() - 0.5) * TUBE_R * 1.1,
        phase: Math.random() * Math.PI * 2,
        size: 0.035 + Math.random() * 0.045,
      })),
    [],
  )

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const mesh = bubblesRef.current
    if (!mesh) return

    // Presence: rise out of the ground when a trial starts, sink after it ends.
    if (sim.trialRunning) lastTrialAt.current = sim.time
    const wanted = sim.trialRunning || sim.time - lastTrialAt.current < LINGER_SECONDS || sim.demoMode ? 1 : 0
    presence.current += (wanted - presence.current) * (1 - Math.exp(-dt * 3.2))
    const rig = rigRef.current
    if (rig) {
      const p = presence.current
      rig.visible = p > 0.01
      // Ease with a little overshoot: it arrives like a prop being set down.
      const e = p < 1 ? 1 - Math.pow(1 - p, 2.2) : 1
      rig.scale.set(0.6 + e * 0.4, Math.max(0.001, e), 0.6 + e * 0.4)
      rig.position.y = (e - 1) * (TUBE_H * 0.5 + 0.3)
      // Occlude the ground it stands on, and stop occluding as it sinks away.
      if (p > 0.01) setOccluder(OCC_SLOT.apparatus, position[0], position[1] - TUBE_H * 0.5, position[2], 0.75, e * 0.8)
      else clearOccluder(OCC_SLOT.apparatus)
    }

    // How many bubbles are in flight tracks the measured rate.
    const active = sim.trialRunning
      ? Math.min(BUBBLES, Math.max(0, Math.round(sim.trialBubbles * 2.2)))
      : 0

    for (let i = 0; i < BUBBLES; i++) {
      const s = seeds[i]
      if (i < active) {
        s.t += dt * s.speed
        if (s.t > 1) s.t -= 1
        dummy.position.set(
          s.offset + Math.sin(s.t * 7 + s.phase) * 0.04,
          -TUBE_H / 2 + s.t * TUBE_H,
          Math.cos(s.t * 5 + s.phase) * 0.05,
        )
        dummy.scale.setScalar(s.size)
      } else {
        dummy.scale.setScalar(0)
      }
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true

    // The gas column collected at the top of the tube.
    if (columnRef.current) {
      const frac = Math.min(0.82, sim.trialBubbles / 26)
      columnRef.current.scale.y = Math.max(0.001, frac)
      columnRef.current.position.y = TUBE_H / 2 - (frac * TUBE_H) / 2
    }
    // Keep the apparatus label facing the camera as the scene is orbited.
    if (labelRef.current) labelRef.current.quaternion.copy(state.camera.quaternion)
    if (glassRef.current) {
      glassRef.current.emissiveIntensity = sim.trialRunning
        ? 0.25 + Math.sin(sim.time * 4) * 0.12
        : 0.05
    }
  })

  return (
    <group position={position}>
    <group ref={rigRef} visible={false}>
      {/* Contact shadow travels with the prop */}
      <mesh position={[0, -TUBE_H / 2 - 0.235, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.1, 2.1]} />
        <meshBasicMaterial map={shadowTex} transparent depthWrite={false} fog={false} />
      </mesh>
      {/* Stand */}
      <mesh position={[0, -TUBE_H / 2 - 0.12, 0]}>
        <cylinderGeometry args={[0.42, 0.5, 0.24, 16]} />
        <meshStandardMaterial color="#8A7A66" roughness={0.9} />
      </mesh>

      {/* Water in the tube */}
      <mesh>
        <cylinderGeometry args={[TUBE_R * 0.92, TUBE_R * 0.92, TUBE_H, 18, 1, true]} />
        <meshStandardMaterial color="#9BD3E8" transparent opacity={0.38} side={THREE.DoubleSide} />
      </mesh>

      {/* Collected oxygen column */}
      <mesh ref={columnRef} position={[0, TUBE_H / 2, 0]}>
        <cylinderGeometry args={[TUBE_R * 0.9, TUBE_R * 0.9, TUBE_H, 18]} />
        <meshStandardMaterial color="#EAF6FB" transparent opacity={0.72} />
      </mesh>

      {/* Rising bubbles */}
      <instancedMesh ref={bubblesRef} args={[undefined, undefined, BUBBLES]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color="#FFFFFF" transparent opacity={0.85} roughness={0.2} />
      </instancedMesh>

      {/* Glass */}
      <mesh>
        <cylinderGeometry args={[TUBE_R, TUBE_R, TUBE_H, 20, 1, true]} />
        <meshStandardMaterial
          ref={glassRef}
          color="#DFF1F7"
          transparent
          opacity={0.28}
          roughness={0.1}
          metalness={0.1}
          emissive="#BFE6F2"
          emissiveIntensity={0.05}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Graduation marks */}
      {[0.2, 0.4, 0.6, 0.8].map((f) => (
        <mesh key={f} position={[0, -TUBE_H / 2 + f * TUBE_H, TUBE_R]} rotation={[0, 0, Math.PI / 2]}>
          <boxGeometry args={[0.012, 0.16, 0.012]} />
          <meshBasicMaterial color="#6E8B96" />
        </mesh>
      ))}

      {/* Labelled in 3D rather than with an HTML overlay, so it is occluded by
          the scene like everything else and can never sit on top of the HUD. */}
      {/* Sits below the tube, where nothing drifts past — a label floating above
          the apparatus would keep colliding with passing molecules. */}
      <mesh ref={labelRef} position={[0, -TUBE_H / 2 - 0.5, 0]}>
        <planeGeometry args={[0.42 * labelAspect, 0.42]} />
        <meshBasicMaterial map={labelTexture} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
    </group>
  )
}
