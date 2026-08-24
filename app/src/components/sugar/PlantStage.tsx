import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import GlyphInstances, { hideGlyph, writeGlyph } from '@/components/world/Glyphs'
import { getQualityCaps } from '@/lib/quality'
import type { SugarSim } from '@/lib/sugarsim'
import { DEFAULT_SPECIMEN, SPECIMEN_BY_ID, type Specimen } from '@/lib/specimens'
import { ATLAS, glowSprite, laminaTexture, podiumShadow, ringSprite, soilTexture, stemTexture } from './atlas'
import { buildRig, METRES_PER_UNIT, type SugarRig } from './rig'

/**
 * The whole-plant plate.
 *
 * One specimen on a podium, cut open down the front so the two pipes inside
 * the stem are visible, with sugar visibly leaving the leaves and arriving
 * somewhere. Everything that moves is driven by the live solve, so the picture
 * and the instruments cannot disagree.
 */

/* ------------------------------------------------------------------ */
/* Ground line                                                        */
/* ------------------------------------------------------------------ */

/**
 * The plate view's ground, which is a *line* rather than a plinth.
 *
 * The plinth this replaces was the single most derivative thing in the scene —
 * subject centred on a disc, lit from three-quarters, the house style of every
 * 3D component gallery on the internet. A botanical plate does not put its
 * specimen on furniture; it draws the soil line it was growing at and lets the
 * roots hang below it. That is cheaper, it is older than any of the references,
 * and it stops the cabinet looking like somebody else's demo.
 */
function GroundLine({ radius }: { radius: number }) {
  const shadow = useMemo(() => podiumShadow(), [])
  return (
    <group position={[0, -0.035, 0]}>
      {/* The soil line itself: a hairline that stops short of a full circle,
          the way a hand-drawn ground line always trails off. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 0.995, radius * 1.02, 64, 1, 0.35, Math.PI * 2 - 0.7]} />
        <meshBasicMaterial color="#B9AF95" transparent opacity={0.85} />
      </mesh>
      <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[radius * 2.6, radius * 2.6]} />
        <meshBasicMaterial map={shadow} transparent depthWrite={false} opacity={0.55} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Soil, cut away at the front                                        */
/* ------------------------------------------------------------------ */

/**
 * Soil, and the root ball left in the open.
 *
 * Two earlier passes tried to bury the roots in a sectioned block of earth,
 * and both read as a chocolate drum with a chip out of it: at this scale the
 * curved back wall is most of what you see, and the thing the drawing exists
 * to show — the roots — spends its time hidden inside it.
 *
 * So the block is gone. What is left is the idiom the reference atlas uses for
 * a germinating seed: a low mound at the surface to say "this is where the
 * ground was", and the root system hanging below it in open air, lit and
 * legible, exactly as a specimen looks when it has just been lifted.
 */
function SoilMound({ radius, outdoors }: { radius: number; outdoors: boolean }) {
  const texture = useMemo(() => soilTexture(), [])
  // Outdoors the plant is *planted*, so the mound flattens to a collar of
  // turned earth at ground level. Left at its plate height it read as a muffin
  // with a stem in it — the chocolate-drum failure in miniature, and for the
  // same reason: a curved brown volume is the loudest thing in any frame.
  const rise = outdoors ? 0.055 : 0.26
  const dome = useMemo(() => {
    const g = new THREE.SphereGeometry(1, 34, 16, 0, Math.PI * 2, 0, Math.PI / 2)
    g.scale(radius * (outdoors ? 0.9 : 1), rise, radius * (outdoors ? 0.9 : 1))
    g.computeVertexNormals()
    return g
  }, [radius, rise, outdoors])
  useEffect(() => () => dome.dispose(), [dome])
  const patch = useMemo(() => podiumShadow(), [])

  return (
    <group>
      <mesh geometry={dome} position={[0, -0.03, 0]} receiveShadow castShadow>
        <meshStandardMaterial map={texture} color={outdoors ? '#C7AE92' : '#D0AC85'} roughness={1} metalness={0} />
      </mesh>
      {/* The underside, so the mound is not an open shell from below. */}
      <mesh position={[0, -0.032, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius * (outdoors ? 0.9 : 1), 34]} />
        <meshStandardMaterial color="#8A6749" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      {/* A soft stain on the ground plane under the root ball. */}
      <mesh position={[0, -0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[radius * 3.4, radius * 3.4]} />
        <meshBasicMaterial map={patch} transparent depthWrite={false} opacity={outdoors ? 0.22 : 0.35} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* The plant body                                                     */
/* ------------------------------------------------------------------ */

function PlantBody({
  sim,
  specimen,
  rig,
}: {
  sim: SugarSim
  specimen: Specimen
  rig: SugarRig
}) {
  const swayRef = useRef<THREE.Group>(null)
  const leafRefs = useRef<Array<THREE.Group | null>>([])
  const colors = specimen.build.colors

  const lamina = useMemo(
    () => laminaTexture(colors.leaf, colors.vein, colors.leafBack),
    [colors.leaf, colors.vein, colors.leafBack],
  )
  const bark = useMemo(() => stemTexture(colors.stem, colors.vein), [colors.stem, colors.vein])

  const leafMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: lamina,
        roughness: 0.62,
        metalness: 0,
        side: THREE.DoubleSide,
        transparent: true,
      }),
    [lamina],
  )
  useEffect(() => () => leafMaterial.dispose(), [leafMaterial])

  const stemMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ map: bark, color: colors.stem, roughness: 0.72, metalness: 0 }),
    [bark, colors.stem],
  )
  useEffect(() => () => stemMaterial.dispose(), [stemMaterial])

  const healthy = useMemo(() => new THREE.Color(colors.leaf), [colors.leaf])
  const wilted = useMemo(() => new THREE.Color(specimen.leaf.colors.leafDry), [specimen.leaf.colors.leafDry])
  const tint = useMemo(() => new THREE.Color(), [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = sim.time
    const vigour = 0.35 + sim.turgor * 0.65
    if (swayRef.current) {
      swayRef.current.rotation.z = Math.sin(t * 0.62) * 0.028 * vigour
      swayRef.current.rotation.x = Math.sin(t * 0.44 + 1.1) * 0.017 * vigour
    }
    // Wilt: the leaves fold down and lose colour together.
    const wilt = 1 - sim.turgor
    rig.leaves.forEach((leaf, i) => {
      const g = leafRefs.current[i]
      if (!g) return
      const target = leaf.droop + wilt * 0.85
      g.rotation.z += (-target - g.rotation.z) * (1 - Math.exp(-dt * 2.4))
    })
    tint.copy(healthy).lerp(wilted, Math.min(1, wilt * 1.15))
    leafMaterial.color.lerp(
      tint.clone().lerp(new THREE.Color('#FFFFFF'), 0.62),
      1 - Math.exp(-dt * 2),
    )
  })

  return (
    <group>
      {/* Roots, drawn before the soil section closes over them. */}
      {rig.rootGeometry.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial color={colors.root} roughness={0.95} metalness={0} />
        </mesh>
      ))}

      <group ref={swayRef}>
        {/* The pith fills the cutaway so the stem never reads as a hollow shell. */}
        <mesh geometry={rig.pithGeometry}>
          <meshStandardMaterial color="#B7CF9C" roughness={0.86} metalness={0} side={THREE.DoubleSide} />
        </mesh>
        <mesh geometry={rig.stemGeometry} material={stemMaterial} castShadow />

        {/* Xylem strands: dead open vessels, pale and glassy. */}
        {rig.xylem.map((curve, i) => (
          <mesh key={`x${i}`}>
            <tubeGeometry args={[curve, 30, specimen.build.stemR0 * 0.26, 9, false]} />
            <meshStandardMaterial
              color="#BFD8EB"
              roughness={0.28}
              metalness={0}
              transparent
              opacity={0.95}
            />
          </mesh>
        ))}
        {/* Phloem strands: living sieve tubes, sitting outside the xylem. */}
        {rig.phloem.map((curve, i) => (
          <mesh key={`p${i}`}>
            <tubeGeometry args={[curve, 30, specimen.build.stemR0 * 0.28, 9, false]} />
            <meshStandardMaterial
              color="#E0B65F"
              roughness={0.42}
              metalness={0}
              emissive="#8A5A0B"
              emissiveIntensity={0.1}
            />
          </mesh>
        ))}

        {/* Leaves. */}
        {rig.leaves.map((leaf, i) => (
          <group key={i} position={leaf.base} rotation={[0, leaf.azimuth, 0]}>
            <mesh geometry={rig.petioleGeometry}>
              <meshStandardMaterial color={colors.stem} roughness={0.78} metalness={0} />
            </mesh>
            <group
              ref={(el) => {
                leafRefs.current[i] = el
              }}
              position={[0.3, 0.02, 0]}
              rotation={[0, 0, -leaf.droop]}
            >
              <group scale={leaf.scale}>
                {specimen.build.arrangement === 'trifoliate' ? (
                  [-0.62, 0, 0.62].map((spread, k) => (
                    <mesh
                      key={k}
                      geometry={rig.leafGeometry}
                      material={leafMaterial}
                      rotation={[0, spread, k === 1 ? 0 : spread * 0.2]}
                      position={[0.12, 0, 0]}
                      castShadow
                    />
                  ))
                ) : (
                  <mesh
                    geometry={rig.leafGeometry}
                    material={leafMaterial}
                    rotation={[0, 0, 0]}
                    castShadow
                  />
                )}
              </group>
            </group>
          </group>
        ))}
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* The girdle                                                         */
/* ------------------------------------------------------------------ */

/**
 * The cut ring. Ring-barking removes the bark and the phloem inside it and
 * leaves the xylem — so the ring is drawn as a band of missing tissue with the
 * pale wood still running through the middle of it, which is exactly why the
 * leaves above stay alive and everything below starves.
 */
function Girdle({ sim, specimen, rig }: { sim: SugarSim; specimen: Specimen; rig: SugarRig }) {
  const groupRef = useRef<THREE.Group>(null)
  const glow = useMemo(() => glowSprite('rgba(193,59,51,0.55)', 'rgba(193,59,51,0.18)', 'girdle'), [])
  const point = useMemo(() => rig.stem.getPointAt(rig.girdleT), [rig])
  const radius = specimen.build.stemR0 * (1 - rig.girdleT * 0.4)

  useFrame(() => {
    if (groupRef.current) groupRef.current.visible = sim.girdled
  })

  return (
    <group ref={groupRef} position={point} visible={false}>
      <mesh>
        <cylinderGeometry args={[radius * 1.02, radius * 1.02, 0.09, 20, 1, true]} />
        <meshStandardMaterial color="#C9B79A" roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      {[-0.045, 0.045].map((y, i) => (
        <mesh key={i} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius * 0.55, radius * 1.05, 20]} />
          <meshStandardMaterial color="#8A5A3B" roughness={1} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <mesh>
        <planeGeometry args={[radius * 7, radius * 7]} />
        <meshBasicMaterial map={glow} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Sinks                                                              */
/* ------------------------------------------------------------------ */

/**
 * The customers. Each one is a real organ with a real shape, wearing a small
 * arc meter that fills as sugar arrives — the celebration beat the house style
 * asks for, and the answer to "so where did it actually go?".
 */
function Sinks({ sim, specimen, rig }: { sim: SugarSim; specimen: Specimen; rig: SugarRig }) {
  const meterRefs = useRef<Array<THREE.Mesh | null>>([])
  const meterGroups = useRef<Array<THREE.Group | null>>([])
  const haloRefs = useRef<Array<THREE.Mesh | null>>([])
  const bodyRefs = useRef<Array<THREE.Group | null>>([])
  const halo = useMemo(() => glowSprite('rgba(243,192,90,0.85)', 'rgba(217,155,43,0.24)', 'sink'), [])
  const colors = specimen.build.colors

  useFrame((state) => {
    const solve = sim.solve
    specimen.sinks.forEach((preset, i) => {
      const fill = Math.min(1, sim.carbon.sinkStore[i] / preset.capacity)
      const flow = solve?.sinks[i]
      const meter = meterRefs.current[i]
      if (meter) {
        // A ring whose swept angle is the fill. Rebuilding geometry every frame
        // would be wasteful, so the arc is a scaled bar instead — honest,
        // cheap, and readable from any angle because it faces the camera.
        meter.scale.set(Math.max(0.001, fill), 1, 1)
      }
      const h = haloRefs.current[i]
      if (h) {
        h.quaternion.copy(state.camera.quaternion)
        const arriving = flow ? Math.min(1, flow.inflow / 12) : 0
        const pulse = 0.9 + Math.sin(sim.time * 2.4 + i) * 0.1
        const s = (0.55 + arriving * 0.85) * pulse
        h.scale.set(s, s, s)
        ;(h.material as THREE.MeshBasicMaterial).opacity = 0.12 + arriving * 0.55
      }
      // A meter that is edge-on to the lens is a white line. Billboard it.
      const mg = meterGroups.current[i]
      if (mg) mg.quaternion.copy(state.camera.quaternion)
      const body = bodyRefs.current[i]
      if (body) {
        // A filling store visibly swells. A tuber that never changes size while
        // its meter fills is a chart, not a plant.
        const grow = 0.72 + fill * 0.5
        const k = preset.kind === 'growth' ? 0.85 + fill * 0.2 : grow
        body.scale.setScalar(body.scale.x + (k - body.scale.x) * 0.05)
      }
    })
  })

  return (
    <group>
      {specimen.sinks.map((preset, i) => {
        const at = rig.sinkAt[preset.id]
        if (!at) return null
        return (
          <group key={preset.id} position={at}>
            <mesh
              ref={(el) => {
                haloRefs.current[i] = el
              }}
            >
              <planeGeometry args={[1.4, 1.4]} />
              <meshBasicMaterial map={halo} transparent depthWrite={false} toneMapped={false} opacity={0.2} />
            </mesh>

            <group
              ref={(el) => {
                bodyRefs.current[i] = el
              }}
            >
              <SinkBody preset={preset.kind} specimenId={specimen.id} colors={colors} index={i} />
            </group>

            {/* Fill meter: a track with a bar that grows along it. */}
            <group
              ref={(el) => {
                meterGroups.current[i] = el
              }}
              position={[0, preset.kind === 'store' ? -0.28 : 0.32, 0]}
            >
              <mesh>
                <planeGeometry args={[0.44, 0.045]} />
                <meshBasicMaterial color="#EFE7D4" transparent opacity={0.9} depthWrite={false} />
              </mesh>
              <mesh
                ref={(el) => {
                  meterRefs.current[i] = el
                }}
                position={[-0.22, 0, 0.002]}
              >
                {/* Anchored at its left edge so scaling x fills rightward. */}
                <planeGeometry args={[0.44, 0.045, 1, 1]} />
                <meshBasicMaterial color={ATLAS.sugar} transparent depthWrite={false} />
              </mesh>
            </group>
          </group>
        )
      })}
    </group>
  )
}

/** The organ itself. Cheap primitives, but the right shape for the right plant. */
function SinkBody({
  preset,
  specimenId,
  colors,
  index,
}: {
  preset: 'store' | 'fruit' | 'growth'
  specimenId: string
  colors: Specimen['build']['colors']
  index: number
}) {
  if (preset === 'fruit' && specimenId === 'maize') {
    return (
      <group rotation={[0, 0, -0.4]}>
        <mesh>
          <capsuleGeometry args={[0.11, 0.34, 6, 14]} />
          <meshStandardMaterial color={colors.fruitRipe} roughness={0.55} metalness={0} />
        </mesh>
        <mesh position={[0, -0.05, 0]}>
          <coneGeometry args={[0.15, 0.62, 10, 1, true]} />
          <meshStandardMaterial color={colors.leaf} roughness={0.7} side={THREE.DoubleSide} />
        </mesh>
      </group>
    )
  }
  if (preset === 'fruit' && specimenId === 'bean') {
    return (
      <group>
        {[0, 1, 2].map((k) => (
          <mesh key={k} position={[k * 0.07 - 0.07, -k * 0.05, k * 0.05 - 0.05]} rotation={[0.2, k * 0.7, -0.9]}>
            <capsuleGeometry args={[0.045, 0.34, 5, 10]} />
            <meshStandardMaterial color={colors.fruit} roughness={0.5} metalness={0} />
          </mesh>
        ))}
      </group>
    )
  }
  if (preset === 'fruit') {
    return (
      <group>
        {[0, 1, 2].map((k) => (
          <mesh key={k} position={[Math.cos(k * 2.1) * 0.13, -Math.abs(Math.sin(k * 1.3)) * 0.12, Math.sin(k * 2.1) * 0.13]}>
            <sphereGeometry args={[0.115, 16, 12]} />
            <meshStandardMaterial color={k === 0 ? colors.fruitRipe : colors.fruit} roughness={0.35} metalness={0} />
          </mesh>
        ))}
      </group>
    )
  }
  if (preset === 'growth') {
    return (
      <group>
        <mesh>
          <coneGeometry args={[0.06, 0.2, 8]} />
          <meshStandardMaterial color={colors.leafBack} roughness={0.5} emissive={colors.leaf} emissiveIntensity={0.18} />
        </mesh>
        {[0, 1].map((k) => (
          <mesh key={k} position={[0, 0.06, 0]} rotation={[0, k * Math.PI, k ? 0.6 : -0.6]}>
            <sphereGeometry args={[0.05, 10, 8]} />
            <meshStandardMaterial color={colors.leaf} roughness={0.55} />
          </mesh>
        ))}
      </group>
    )
  }
  // Storage organ: a cluster of lumps. Tubers get bigger ones than root stores.
  const big = specimenId === 'potato' && index === 0
  return (
    <group>
      {[0, 1, 2].map((k) => (
        <mesh
          key={k}
          position={[Math.cos(k * 2.4) * 0.14, -0.03 * k, Math.sin(k * 2.4) * 0.12]}
          rotation={[k * 0.4, k * 0.9, 0.2]}
        >
          <sphereGeometry args={[big ? 0.18 : 0.12, 16, 12]} />
          <meshStandardMaterial color={big ? '#E0BE8E' : '#D9B489'} roughness={0.9} metalness={0} />
        </mesh>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Flows                                                              */
/* ------------------------------------------------------------------ */

const SUGAR_POOL = 44
const WATER_POOL = 26
const LABEL_EVERY = 7

interface Parcel {
  /** Which precomputed leaf→sink path it is on. */
  path: number
  /** Progress along it, 0–1. */
  u: number
  alive: boolean
  wobble: number
}

/**
 * The sugar.
 *
 * Each parcel is loaded at a leaf, carried down (or up) a phloem strand and
 * unloaded at one particular sink, chosen with the same share the model gives
 * that sink this instant. So the traffic on screen is not a decoration of the
 * numbers — it *is* the numbers: when the pods take 70% of the export, seven
 * parcels in ten visibly go to the pods.
 */
function SugarFlow({ sim, specimen, rig }: { sim: SugarSim; specimen: Specimen; rig: SugarRig }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const labelRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const scratch = useMemo(() => new THREE.Vector3(), [])

  /** One curve per (leaf, sink) pair — the real route a parcel takes. */
  const paths = useMemo(() => {
    const out: Array<{ curve: THREE.CatmullRomCurve3; sink: number }> = []
    specimen.sinks.forEach((sink, si) => {
      const target = rig.sinkAt[sink.id]
      if (!target) return
      // Where on the stem this sink unloads.
      const targetT =
        sink.kind === 'growth' ? 1 : sink.id === 'roots' || sink.id === 'tubers' ? 0.02 : undefined
      rig.leaves.forEach((leaf, li) => {
        const strand = rig.phloem[li % rig.phloem.length]
        const from = THREE.MathUtils.clamp(leaf.t, 0.03, 0.97)
        const to =
          targetT ?? THREE.MathUtils.clamp((target.y / Math.max(0.001, rig.height)) * 0.96, 0.03, 0.97)
        const points: THREE.Vector3[] = [leaf.source.clone()]
        // Into the petiole, then onto the strand.
        points.push(leaf.base.clone().lerp(leaf.source, 0.45))
        const steps = 10
        for (let i = 0; i <= steps; i++) {
          const t = from + (to - from) * (i / steps)
          points.push(strand.getPointAt(THREE.MathUtils.clamp(t, 0, 1)))
        }
        points.push(target.clone())
        out.push({ curve: new THREE.CatmullRomCurve3(points), sink: si })
      })
    })
    return out
  }, [rig, specimen])

  const parcels = useMemo<Parcel[]>(
    () =>
      Array.from({ length: SUGAR_POOL }, () => ({
        path: 0,
        u: 0,
        alive: false,
        wobble: Math.random() * Math.PI * 2,
      })),
    [],
  )
  const spawnAcc = useRef(0)

  useFrame((state, rawDt) => {
    const mesh = meshRef.current
    const label = labelRef.current
    if (!mesh || !label || paths.length === 0) return
    const dt = Math.min(rawDt, 0.05)
    const solve = sim.solve
    const moving = sim.started && !sim.paused && !!solve
    const exportRate = solve?.exportRate ?? 0
    const velocity = solve?.velocity ?? 0

    if (moving) {
      // Spawn rate follows the mass flow; travel speed follows the sap speed.
      spawnAcc.current += dt * Math.min(9, exportRate * 0.42)
      while (spawnAcc.current >= 1) {
        spawnAcc.current -= 1
        const free = parcels.find((p) => !p.alive)
        if (!free) break
        // Choose a sink with the model's own share, then a leaf at random.
        const r = Math.random()
        let acc = 0
        let sinkIndex = 0
        for (let i = 0; i < specimen.sinks.length; i++) {
          acc += solve?.sinks[i].share ?? 0
          if (r <= acc) {
            sinkIndex = i
            break
          }
        }
        const options = paths
          .map((p, i) => (p.sink === sinkIndex ? i : -1))
          .filter((i) => i >= 0)
        if (options.length === 0) continue
        free.path = options[Math.floor(Math.random() * options.length)]
        free.u = 0
        free.alive = true
      }
    }

    const speed = THREE.MathUtils.clamp(velocity * 0.22, 0.03, 0.9)
    let labelled = 0
    for (let i = 0; i < SUGAR_POOL; i++) {
      const p = parcels[i]
      if (!p.alive) {
        dummy.scale.setScalar(0)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        hideGlyph(label, i, dummy)
        continue
      }
      if (moving) {
        p.u += dt * speed
        if (p.u >= 1) {
          p.alive = false
          continue
        }
      }
      const entry = paths[p.path]
      if (!entry) {
        // The specimen changed under us and the route table was rebuilt. A
        // parcel holding a stale index has nowhere to be; retire it.
        p.alive = false
        dummy.scale.setScalar(0)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        hideGlyph(label, i, dummy)
        continue
      }
      const curve = entry.curve
      curve.getPointAt(THREE.MathUtils.clamp(p.u, 0, 1), scratch)
      scratch.x += Math.sin(sim.time * 2.1 + p.wobble) * 0.006
      dummy.position.copy(scratch)
      dummy.rotation.set(p.wobble + sim.time * 0.9, p.u * 6, 0.4)
      // Fade in as it loads and out as it unloads, so nothing pops.
      const ends = Math.min(1, p.u * 9) * Math.min(1, (1 - p.u) * 9)
      dummy.scale.setScalar(0.045 * ends)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)

      if (i % LABEL_EVERY === 0 && labelled < 4 && p.u > 0.18 && p.u < 0.8) {
        labelled += 1
        scratch.y += 0.055
        writeGlyph(label, i, dummy, state.camera, scratch, ends, 0.1)
      } else {
        hideGlyph(label, i, dummy)
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    label.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={meshRef} args={[undefined, undefined, SUGAR_POOL]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color={ATLAS.sugarLight}
          emissive={ATLAS.sugarDeep}
          emissiveIntensity={0.5}
          roughness={0.3}
          metalness={0}
        />
      </instancedMesh>
      <GlyphInstances
        ref={labelRef}
        text="C₁₂H₂₂O₁₁"
        color={ATLAS.sugarDeep}
        count={SUGAR_POOL}
        size={0.05}
        style={{ strokeWidth: 6, strokeColor: 'rgba(252,250,244,0.95)' }}
      />
    </group>
  )
}

/**
 * The water. Climbing, always, in the other pipe — because the single most
 * common misconception about a stem is that there is only one pipe in it.
 */
function WaterFlow({ sim, specimen, rig }: { sim: SugarSim; specimen: Specimen; rig: SugarRig }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const labelRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const scratch = useMemo(() => new THREE.Vector3(), [])
  const drops = useMemo(
    () =>
      Array.from({ length: WATER_POOL }, (_, i) => ({
        strand: i % 3,
        u: i / WATER_POOL,
        wobble: (i * 2.399) % (Math.PI * 2),
      })),
    [],
  )
  void specimen

  useFrame((state, rawDt) => {
    const mesh = meshRef.current
    const label = labelRef.current
    if (!mesh || !label) return
    const dt = Math.min(rawDt, 0.05)
    const solve = sim.solve
    const moving = sim.started && !sim.paused
    // Transpiration drives the xylem, so the column speeds up in dry, bright,
    // hot air and stalls when the stomata shut.
    const pull = THREE.MathUtils.clamp((solve?.leaf.transpiration ?? 0) * 0.8, 0.02, 1)
    const active = Math.max(3, Math.round(WATER_POOL * (0.25 + pull * 0.75)))

    for (let i = 0; i < WATER_POOL; i++) {
      const d = drops[i]
      if (i >= active) {
        dummy.scale.setScalar(0)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        hideGlyph(label, i, dummy)
        continue
      }
      if (moving) {
        d.u += dt * (0.08 + pull * 0.42)
        if (d.u > 1) d.u -= 1
      }
      rig.xylem[d.strand % rig.xylem.length].getPointAt(THREE.MathUtils.clamp(d.u, 0, 1), scratch)
      dummy.position.copy(scratch)
      dummy.rotation.set(0, 0, 0)
      const ends = Math.min(1, d.u * 10) * Math.min(1, (1 - d.u) * 10)
      dummy.scale.setScalar(0.034 * (0.7 + ends * 0.5))
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      if (i === 4 || i === 16) {
        scratch.x += 0.1
        writeGlyph(label, i, dummy, state.camera, scratch, ends, 0.08)
      } else {
        hideGlyph(label, i, dummy)
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    label.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={meshRef} args={[undefined, undefined, WATER_POOL]} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color={ATLAS.water} roughness={0.16} metalness={0} transparent opacity={0.92} />
      </instancedMesh>
      <GlyphInstances
        ref={labelRef}
        text="H₂O"
        color={ATLAS.waterDeep}
        count={WATER_POOL}
        size={0.055}
        style={{ strokeWidth: 6, strokeColor: 'rgba(252,250,244,0.95)' }}
      />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* The gas field                                                      */
/* ------------------------------------------------------------------ */

const GAS_COUNT = 18

/**
 * CO₂ drifting in and O₂ drifting out, in one instanced field with two
 * materials' worth of colour baked per instance.
 *
 * The drift pattern is ThreeUI's Structure Flow dome (MIT) re-lit: a masked
 * shell of particles that eases across the canopy rather than swarming it.
 * Orderly motion — the house rule that a busy scene reads as noise.
 */
function GasField({ sim, rig }: { sim: SugarSim; rig: SugarRig }) {
  const inRef = useRef<THREE.InstancedMesh>(null)
  const outRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const half = GAS_COUNT
  const seeds = useMemo(
    () =>
      Array.from({ length: half * 2 }, (_, i) => ({
        // A dome around the canopy: even in angle, jittered in radius.
        theta: (i * 137.5 * Math.PI) / 180,
        phi: 0.2 + ((i * 41) % 100) / 100 * 1.1,
        radius: 0.95 + ((i * 71) % 100) / 100 * 0.6,
        phase: ((i * 53) % 100) / 100,
      })),
    [half],
  )
  const canopyY = rig.height * 0.72

  useFrame((_, rawDt) => {
    const inMesh = inRef.current
    const outMesh = outRef.current
    if (!inMesh || !outMesh) return
    const dt = Math.min(rawDt, 0.05)
    const solve = sim.solve
    const moving = sim.started && !sim.paused
    const co2Level = sim.co2
    // Oxygen only leaves when the light reactions are actually running.
    const o2 = solve ? THREE.MathUtils.clamp(solve.production / 22, 0, 1) : 0
    const inCount = Math.max(4, Math.round(half * (0.2 + co2Level * 0.8)))
    const outCount = Math.round(half * o2)

    for (let i = 0; i < half; i++) {
      const s = seeds[i]
      if (moving) s.phase = (s.phase + dt * 0.09) % 1
      // Inbound: spirals from the dome toward the canopy.
      const r = s.radius * (1 - s.phase * 0.82)
      const y = canopyY + Math.cos(s.phi) * 0.7 * (1 - s.phase * 0.5)
      dummy.position.set(Math.cos(s.theta + s.phase * 0.5) * r, y, Math.sin(s.theta + s.phase * 0.5) * r)
      dummy.rotation.set(0, 0, 0)
      const fade = Math.min(1, s.phase * 6) * Math.min(1, (1 - s.phase) * 4)
      dummy.scale.setScalar(i < inCount ? 0.032 * fade : 0)
      dummy.updateMatrix()
      inMesh.setMatrixAt(i, dummy.matrix)

      // Outbound: the reverse, leaving the canopy and dispersing upward.
      const t = seeds[half + i]
      if (moving) t.phase = (t.phase + dt * 0.13) % 1
      const r2 = 0.35 + t.phase * t.radius
      dummy.position.set(
        Math.cos(t.theta - t.phase * 0.4) * r2,
        canopyY + t.phase * 1.15 + Math.cos(t.phi) * 0.2,
        Math.sin(t.theta - t.phase * 0.4) * r2,
      )
      const fade2 = Math.min(1, t.phase * 5) * Math.min(1, (1 - t.phase) * 3)
      dummy.scale.setScalar(i < outCount ? 0.03 * fade2 : 0)
      dummy.updateMatrix()
      outMesh.setMatrixAt(i, dummy.matrix)
    }
    inMesh.instanceMatrix.needsUpdate = true
    outMesh.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={inRef} args={[undefined, undefined, half]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color={ATLAS.co2} roughness={0.5} metalness={0} transparent opacity={0.75} />
      </instancedMesh>
      <instancedMesh ref={outRef} args={[undefined, undefined, half]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial
          color={ATLAS.oxygen}
          roughness={0.14}
          metalness={0}
          transparent
          opacity={0.8}
          emissive={ATLAS.oxygen}
          emissiveIntensity={0.2}
        />
      </instancedMesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* The tracer run                                                     */
/* ------------------------------------------------------------------ */

/**
 * A labelled parcel of sugar and the two marks it is timed between.
 *
 * This is the translocation experiment as it is really done: feed one leaf
 * ¹⁴CO₂, then follow the radioactive sugar down the stem. Here the parcel
 * glows, the marks are scribed rings, and the stopwatch counts plant seconds
 * so the learner's division needs no conversion factor.
 */
function Tracer({ sim, specimen, rig }: { sim: SugarSim; specimen: Specimen; rig: SugarRig }) {
  const parcelRef = useRef<THREE.Group>(null)
  const markRefs = useRef<Array<THREE.Mesh | null>>([])
  const glow = useMemo(() => glowSprite('rgba(255,214,110,0.95)', 'rgba(217,155,43,0.3)', 'tracer'), [])
  const strand = rig.phloem[1] ?? rig.phloem[0]
  const point = useMemo(() => new THREE.Vector3(), [])

  /** Distance in metres → parameter along the strand, top to bottom. */
  const paramFor = (metres: number) =>
    THREE.MathUtils.clamp(0.96 - metres / Math.max(0.001, specimen.pathLengthM) * 0.94, 0.02, 0.96)

  useFrame((state) => {
    const g = parcelRef.current
    if (!g) return
    g.visible = sim.tracerActive
    if (!sim.tracerActive) return
    strand.getPointAt(paramFor(sim.tracerDistance), point)
    g.position.copy(point)
    g.children.forEach((child) => {
      if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).material) {
        child.quaternion.copy(state.camera.quaternion)
      }
    })
    const beat = 1 + Math.sin(sim.time * 7) * 0.12
    g.scale.setScalar(beat)
  })

  const marks = [sim.tracerMarkA, sim.tracerMarkB]

  return (
    <group>
      {marks.map((m, i) => {
        strand.getPointAt(paramFor(m), point)
        const r = specimen.build.stemR0 * 1.35
        return (
          <mesh
            key={i}
            ref={(el) => {
              markRefs.current[i] = el
            }}
            position={[0, point.y, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[r, r * 1.22, 28]} />
            <meshBasicMaterial
              color={i === 0 ? ATLAS.green : ATLAS.alert}
              transparent
              // Scribed marks are quiet until a run is actually under way.
              opacity={sim.tracerActive ? 0.95 : 0.3}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        )
      })}
      <group ref={parcelRef} visible={false}>
        <mesh>
          <planeGeometry args={[0.42, 0.42]} />
          <meshBasicMaterial map={glow} transparent depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.05, 14, 11]} />
          <meshStandardMaterial
            color="#FFD86E"
            emissive="#E0951F"
            emissiveIntensity={1.1}
            roughness={0.2}
          />
        </mesh>
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Reaction Vision                                                    */
/* ------------------------------------------------------------------ */

/**
 * The survey pulse: a bright ring that climbs the specimen, and behind it a
 * faint cage. As it passes each height it lights what is happening there —
 * annotation delivered in the order the carbon travels rather than all at once.
 *
 * The device is Sylva's survey pulse (ThreeUI, MIT), rebuilt as a rising disc
 * because a plant is a vertical thing and the reference's was horizontal.
 */
function SurveyPulse({ sim, rig }: { sim: SugarSim; rig: SugarRig }) {
  const ringRef = useRef<THREE.Mesh>(null)
  const groupRef = useRef<THREE.Group>(null)
  const texture = useMemo(() => ringSprite('rgba(62,124,67,0.9)'), [])
  const low = -0.9
  const high = rig.height + 0.6

  useFrame(() => {
    const g = groupRef.current
    if (!g) return
    g.visible = sim.vision && sim.pulse >= 0 && sim.pulse <= 1.2
    if (!g.visible) return
    const y = low + (high - low) * THREE.MathUtils.clamp(sim.pulse, 0, 1.2)
    g.position.y = y
    const ring = ringRef.current
    if (ring) {
      const swell = 1 + Math.sin(sim.pulse * Math.PI) * 0.25
      ring.scale.set(swell, swell, 1)
      ;(ring.material as THREE.MeshBasicMaterial).opacity =
        0.85 * Math.min(1, sim.pulse * 6) * Math.min(1, (1.15 - sim.pulse) * 5)
    }
  })

  return (
    <group ref={groupRef} visible={false}>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.4, 3.4]} />
        <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Composed stage                                                     */
/* ------------------------------------------------------------------ */

export default function PlantStage({
  sim,
  specimenId,
  outdoors = false,
}: {
  sim: SugarSim
  specimenId: string
  /** True when the habitat ring is drawn: the ground line is then real ground. */
  outdoors?: boolean
}) {
  const specimen = useMemo(
    () => SPECIMEN_BY_ID[specimenId] ?? SPECIMEN_BY_ID[DEFAULT_SPECIMEN],
    [specimenId],
  )
  const rig = useMemo(() => buildRig(specimen), [specimen])
  useEffect(() => () => rig.dispose(), [rig])
  const quality = getQualityCaps()
  const soilRadius = Math.max(0.42, specimen.build.rootSpread * 0.6)

  return (
    <group>
      {!outdoors && <GroundLine radius={Math.max(0.9, specimen.build.rootSpread * 1.3)} />}
      <SoilMound radius={soilRadius} outdoors={outdoors} />
      <PlantBody sim={sim} specimen={specimen} rig={rig} />
      <Girdle sim={sim} specimen={specimen} rig={rig} />
      <Sinks sim={sim} specimen={specimen} rig={rig} />
      <WaterFlow sim={sim} specimen={specimen} rig={rig} />
      <SugarFlow sim={sim} specimen={specimen} rig={rig} />
      {quality.particleScale > 0.5 && <GasField sim={sim} rig={rig} />}
      <Tracer sim={sim} specimen={specimen} rig={rig} />
      <SurveyPulse sim={sim} rig={rig} />
    </group>
  )
}

export { METRES_PER_UNIT }
