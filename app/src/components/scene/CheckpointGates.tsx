import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { SimState } from '@/lib/sim'
import { VESSEL_RADIUS } from '@/lib/sim'
import {
  LAP_LENGTH,
  STAGES,
  STAGE_ENDS,
  getJourney,
  nowS,
  radiusAtDist,
} from '@/lib/journey'
import { glyphTexture } from '@/components/photo/Glyphs'
import { getQualityCaps } from '@/lib/quality'

/**
 * Race-style checkpoint gates: a glowing ring at every stage boundary, sized
 * to the local bore, wearing the name of the stretch you are about to enter.
 * Fog is disabled on gate materials so the next gate reads as a beacon far
 * down the tunnel — exactly like a checkpoint in a tunnel racer. The ring
 * pulses on approach, its dash lights slowly orbit, and passing it fires a
 * short swell-and-flash driven by the journey's crossing timestamp.
 *
 * Structure per gate: an outer group (position only) holding a spinner group
 * (ring + dash lights, scaled to the bore, rotating) and a separate label
 * quad that billboards without inheriting the spin.
 */

const GATE_TINTS = ['#F2A9B4', '#FF8A7A', '#FF6B5E', '#F0B08E', '#E8B990', '#C97A88', '#B4626F']
/** One gate per stage boundary, doubled so the next lap's gates already stand. */
const NB = STAGES.length
const GATES = NB * 2
const DASH_COUNT = getQualityCaps().particleScale >= 1 ? 8 : 4

export default function CheckpointGates({ sim }: { sim: SimState }) {
  const { camera } = useThree()
  const outerRefs = useRef<(THREE.Group | null)[]>([])
  const spinnerRefs = useRef<(THREE.Group | null)[]>([])
  const labelRefs = useRef<(THREE.Mesh | null)[]>([])

  const ringGeo = useMemo(() => new THREE.TorusGeometry(1, 0.085, 10, 56), [])
  const dashGeo = useMemo(() => new THREE.TorusGeometry(0.88, 0.03, 8, 6, Math.PI / 7), [])

  const ringMats = useMemo(
    () =>
      Array.from({ length: GATES }, (_, k) => {
        const m = new THREE.MeshBasicMaterial({
          color: new THREE.Color(GATE_TINTS[k % NB]),
          transparent: true,
          opacity: 0.85,
          toneMapped: false,
          side: THREE.DoubleSide,
        })
        m.fog = false // beacons must glow through the tunnel haze
        return m
      }),
    [],
  )
  const dashMat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#FBF5EA'),
      transparent: true,
      opacity: 0.85,
      toneMapped: false,
      side: THREE.DoubleSide,
    })
    m.fog = false
    return m
  }, [])

  const labels = useMemo(
    () =>
      Array.from({ length: NB }, (_, b) =>
        glyphTexture(STAGES[(b + 1) % STAGES.length].title.toUpperCase(), '#5C2430'),
      ),
    [],
  )

  useFrame(() => {
    const j = getJourney()
    const t = nowS()
    const camDist = -sim.camZ
    for (let k = 0; k < GATES; k++) {
      const outer = outerRefs.current[k]
      const spinner = spinnerRefs.current[k]
      const label = labelRefs.current[k]
      if (!outer || !spinner || !label) continue
      const b = k % NB
      const copy = Math.floor(k / NB)
      const baseLap = Math.floor((camDist - STAGE_ENDS[b]) / LAP_LENGTH + 0.5) + copy
      const d = baseLap * LAP_LENGTH + STAGE_ENDS[b]
      const z = -d
      const dz = z - sim.camZ // negative while the gate is still ahead
      if (baseLap < 0 || dz < -140 || dz > 10) {
        outer.visible = false
        continue
      }
      outer.visible = true
      outer.position.set(0, 0, z)

      const gateR = radiusAtDist(d, VESSEL_RADIUS) + 0.55
      const enteredIdx = (b + 1) % STAGES.length
      const flashing = j.crossedIndex === enteredIdx && t - j.crossedAt < 0.9
      const pulse = 1 + Math.sin(t * 2.6 + b) * 0.035
      const flash = flashing ? 1 + (0.35 * (0.9 - (t - j.crossedAt))) / 0.9 : 1
      spinner.scale.setScalar(gateR * pulse * flash)
      spinner.rotation.z = t * 0.35 * (b % 2 === 0 ? 1 : -1)
      ringMats[k].opacity = flashing
        ? 1
        : 0.68 + 0.3 * Math.min(1, Math.max(0, (-dz - 6) / 60))

      // label: billboarded, above the ring, growing as you approach
      const labelScale = Math.min(2.4, Math.max(1.0, -dz / 20))
      label.position.set(0, gateR + 0.9 + labelScale * 0.4, 0)
      label.quaternion.copy(camera.quaternion)
      label.scale.setScalar(labelScale)
    }
  })

  return (
    <group>
      {Array.from({ length: GATES }, (_, k) => {
        const { texture, aspect } = labels[k % NB]
        return (
          <group
            key={k}
            ref={(el) => {
              outerRefs.current[k] = el
            }}
          >
            <group
              ref={(el) => {
                spinnerRefs.current[k] = el
              }}
            >
              <mesh geometry={ringGeo} material={ringMats[k]} />
              {Array.from({ length: DASH_COUNT }, (_, di) => (
                <mesh
                  key={di}
                  geometry={dashGeo}
                  material={dashMat}
                  rotation={[0, 0, (di / DASH_COUNT) * Math.PI * 2]}
                />
              ))}
            </group>
            <mesh
              ref={(el) => {
                labelRefs.current[k] = el
              }}
              renderOrder={2}
            >
              <planeGeometry args={[0.55 * aspect, 0.55]} />
              <meshBasicMaterial
                map={texture}
                transparent
                depthWrite={false}
                toneMapped={false}
                alphaTest={0.02}
                fog={false}
              />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
