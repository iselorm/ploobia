import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import GlyphInstances, { hideGlyph, writeGlyph } from '@/components/world/Glyphs'
import type { SugarSim } from '@/lib/sugarsim'
import { simSpecimen } from '@/lib/sugarsim'
import { ATLAS, cortexTexture, glowSprite, stemSectionTexture } from './atlas'
import { getQualityCaps } from '@/lib/quality'

/**
 * The stem, cut open and blown up until one sieve tube is the size of a
 * drainpipe.
 *
 * Three things have to land here, and none of them survive a diagram:
 *
 * 1. **There are two pipes and they run opposite ways.** Water climbs the
 *    xylem under tension; sucrose descends the phloem under pressure.
 * 2. **The phloem is a mass flow, and water is what does the pushing.** Sugar
 *    loaded at the top drags water in osmotically from the xylem next door,
 *    that raises the pressure, and the whole column moves. At the far end the
 *    sugar is unloaded and the water goes straight back to the xylem. It is a
 *    circuit, not a one-way street.
 * 3. **Girdling takes the phloem and leaves the xylem**, because the phloem is
 *    on the outside. Cut the ring and the sugar column stops dead while the
 *    water column carries on untouched. Cut the wood instead and the water
 *    stops — and the sugar column fails a plant-hour later, from the top.
 *
 * **The section is laid on its side** (decided 2026-09-06, for landscape).
 * At 100 µm this is a microscope slide and a slide has no up: the leaf end is
 * on the left, the roots on the right, water runs right-to-left in the wood
 * and sugar left-to-right in the bark, and the tracer marks read like gate
 * splits. Everything below is still authored in the stem's own frame (y is
 * the axis, `TOP` is the leaf end) and the whole subject is rotated once —
 * so the geometry, the squash through the plates and the queue at the cut
 * did not have to be rewritten, only turned.
 */

/** Local → world: the subject is rotated +90° about z, so (x, y) lands at (−y, x). */
const LAID_FLAT: [number, number, number] = [0, 0, Math.PI / 2]
/**
 * Billboards must live in a frame with no rotation, or the glyph writer's
 * camera-facing quaternion is applied on top of the turn and every label
 * comes out on its side. A child group rotated back by −90° is that frame;
 * a point in the stem's own frame is written into it as (−y, x).
 */
const UPRIGHT: [number, number, number] = [0, 0, -Math.PI / 2]
const toUpright = (v: THREE.Vector3) => v.set(-v.y, v.x, v.z)

const TOP = 1.85
const BOTTOM = -1.85
const XYLEM_X = -0.62
const PHLOEM_X = 0.42
const COMPANION_X = 0.98
const XYLEM_R = 0.24
const PHLOEM_R = 0.2

/** Where the girdle removes the phloem, in this view's own coordinates. */
const CUT_TOP = 0.26
const CUT_BOTTOM = -0.26

/* ------------------------------------------------------------------ */
/* The tissue around the pipes                                        */
/* ------------------------------------------------------------------ */

function Cortex({ sim }: { sim: SugarSim }) {
  const section = useMemo(() => stemSectionTexture(), [])
  const tissue = useMemo(() => cortexTexture(), [])
  const wallRef = useRef<THREE.MeshStandardMaterial>(null)
  const nightGlow = useMemo(() => new THREE.Color('#1A2238'), [])
  const none = useMemo(() => new THREE.Color('#000000'), [])
  useFrame((_, rawDt) => {
    // At night the tissue keeps a faint blue self-light so the trough never
    // goes to a black hole under the dimmed key.
    const m = wallRef.current
    if (!m) return
    m.emissive.lerp(sim.night ? nightGlow : none, 1 - Math.exp(-Math.min(rawDt, 0.05) * 2.2))
  })
  return (
    <group>
      {/* The stem wall, opened toward the camera. The inside of the trough is
          parenchyma — the same creams and sages as the two cut faces — drawn
          as tissue rather than as a flat green, so the section reads as one
          organ opened up and not as a tin. */}
      <mesh rotation={[0, 0, 0]}>
        <cylinderGeometry args={[1.78, 1.78, TOP - BOTTOM, 44, 1, true, Math.PI * 0.26, Math.PI * 1.48]} />
        <meshStandardMaterial
          ref={wallRef}
          map={tissue}
          bumpMap={tissue}
          bumpScale={0.02}
          color="#F1ECDC"
          roughness={0.82}
          metalness={0}
          emissiveIntensity={0.8}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Cut faces at top and bottom, wearing the real transverse section. */}
      {[TOP, BOTTOM].map((y, i) => (
        <mesh key={i} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1.78, 44]} />
          <meshStandardMaterial map={section} roughness={0.8} metalness={0} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}

/**
 * The pipe materials, by tier.
 *
 * Transmission means three renders the whole opaque scene into a texture
 * every frame before it draws the pipe — a second render pass, which is why
 * Ploob's jelly is medium tier and up. The low tier gets the same colours
 * as plain transparency; medium and high get real refraction with the sap
 * tinting the depth (attenuation), a soft membrane rim (sheen) on the living
 * sieve tube and a hard lacquer (clearcoat) on the dead, lignified vessel.
 */
function pipeMaterials() {
  const rich = getQualityCaps().shadows
  return {
    phloem: rich
      ? {
          color: '#F3D9A0',
          roughness: 0.28,
          metalness: 0,
          ior: 1.38,
          transmission: 0.6,
          thickness: 0.35,
          attenuationColor: new THREE.Color('#E0A83C'),
          attenuationDistance: 0.8,
          sheen: 0.4,
          sheenColor: new THREE.Color('#FFE9B8'),
          sheenRoughness: 0.6,
          clearcoat: 0.25,
          clearcoatRoughness: 0.4,
          transparent: false,
          opacity: 1,
        }
      : { color: '#F0D49A', roughness: 0.35, metalness: 0, transmission: 0, sheen: 0.4, sheenColor: new THREE.Color('#FFE9B8'), sheenRoughness: 0.6, transparent: true, opacity: 0.58 },
    xylem: rich
      ? {
          color: '#C6DCEE',
          roughness: 0.12,
          metalness: 0,
          transmission: 0.5,
          thickness: 0.25,
          attenuationColor: new THREE.Color('#9CC5E6'),
          attenuationDistance: 1.2,
          clearcoat: 0.6,
          clearcoatRoughness: 0.2,
          transparent: false,
          opacity: 1,
        }
      : { color: '#B3D2EA', roughness: 0.2, metalness: 0, transmission: 0, clearcoat: 0.6, clearcoatRoughness: 0.2, transparent: true, opacity: 0.55 },
  }
}

/* ------------------------------------------------------------------ */
/* The spotlight                                                      */
/* ------------------------------------------------------------------ */

/**
 * One pipe lit for a few seconds when the field guide names it. An additive
 * halo sleeve round the pipe rather than a material swap: the pipes' physical
 * materials are per-mesh instances, and a sleeve costs one draw call while
 * it is visible and none when it is not. Transparent, `depthTest` off, like
 * the other halos — the transmission buffer ignores it.
 */
function Spotlight({ sim }: { sim: SugarSim }) {
  const ref = useRef<THREE.Mesh>(null)
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#FFD98A', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
    [],
  )
  useFrame(() => {
    const m = ref.current
    if (!m) return
    const left = sim.spotlightUntil - sim.time
    const on = !!sim.spotlight && left > 0
    m.visible = on
    if (!on) return
    const x = sim.spotlight === 'xylem' ? XYLEM_X : PHLOEM_X
    const r = (sim.spotlight === 'xylem' ? XYLEM_R : PHLOEM_R) * 1.35
    m.position.x = x
    m.scale.set(r, 1, r)
    mat.color.set(sim.spotlight === 'xylem' ? '#9BD0FF' : '#FFD98A')
    // In fast, out slow: a pulse the eye catches, then a fade.
    mat.opacity = Math.min(1, left) * 0.28
  })
  return (
    <mesh ref={ref} position={[XYLEM_X, 0, 0]} visible={false} renderOrder={5}>
      <cylinderGeometry args={[1, 1, TOP - BOTTOM, 24, 1, true]} />
      <primitive object={mat} attach="material" />
    </mesh>
  )
}

/* ------------------------------------------------------------------ */
/* The two pipes                                                      */
/* ------------------------------------------------------------------ */

function Pipes({ sim }: { sim: SugarSim }) {
  const mats = useMemo(() => pipeMaterials(), [])
  const bridgeRef = useRef<THREE.Mesh>(null)
  const woodBridgeRef = useRef<THREE.Mesh>(null)
  const bulgeRef = useRef<THREE.Group>(null)

  const plates = useMemo(() => {
    const out: number[] = []
    for (let y = TOP - 0.55; y > BOTTOM; y -= 0.7) out.push(y)
    return out
  }, [])

  useFrame(() => {
    const solve = sim.solve
    // The source end of a loaded sieve tube is genuinely fatter: the osmotic
    // inrush stretches it. Turgor you can see.
    const swell = solve ? 1 + THREE.MathUtils.clamp(solve.sourcePressure / 2.4, 0, 1) * 0.13 : 1
    if (bulgeRef.current) {
      bulgeRef.current.scale.x += (swell - bulgeRef.current.scale.x) * 0.08
      bulgeRef.current.scale.z = bulgeRef.current.scale.x
    }
    // The sieve tube is drawn in three pieces so the middle one can vanish
    // when the ring is cut. Leaving that gap open all the time — which the
    // first pass did — put a hole in a perfectly healthy stem.
    if (bridgeRef.current) bridgeRef.current.visible = !sim.girdled
    if (woodBridgeRef.current) woodBridgeRef.current.visible = !sim.xylemCut
  })

  return (
    <group>
      {/* Xylem — a dead, open pipe. Wide bore, no end walls, thick lignin rings.
          Drawn in three pieces, like the sieve tube, so the wood cut can open. */}
      {[
        [(TOP + CUT_TOP) / 2, TOP - CUT_TOP],
        [(BOTTOM + CUT_BOTTOM) / 2, CUT_BOTTOM - BOTTOM],
      ].map(([y, h], i) => (
        <mesh key={i} position={[XYLEM_X, y, 0]}>
          <cylinderGeometry args={[XYLEM_R, XYLEM_R, h, 24, 1, true]} />
          <meshPhysicalMaterial {...mats.xylem} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <mesh ref={woodBridgeRef} position={[XYLEM_X, 0, 0]}>
        <cylinderGeometry args={[XYLEM_R, XYLEM_R, CUT_TOP - CUT_BOTTOM, 24, 1, true]} />
        <meshPhysicalMaterial {...mats.xylem} side={THREE.DoubleSide} />
      </mesh>
      <LigninRings />

      {/* Phloem — living sieve tube, split so the cut can open in the middle. */}
      <group ref={bulgeRef} position={[PHLOEM_X, 0, 0]}>
        <mesh position={[0, (TOP + CUT_TOP) / 2, 0]}>
          <cylinderGeometry args={[PHLOEM_R, PHLOEM_R, TOP - CUT_TOP, 22, 1, true]} />
          <meshPhysicalMaterial {...mats.phloem} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, (BOTTOM + CUT_BOTTOM) / 2, 0]}>
          <cylinderGeometry args={[PHLOEM_R, PHLOEM_R, CUT_BOTTOM - BOTTOM, 22, 1, true]} />
          <meshPhysicalMaterial {...mats.phloem} side={THREE.DoubleSide} />
        </mesh>
        <mesh ref={bridgeRef}>
          <cylinderGeometry args={[PHLOEM_R, PHLOEM_R, CUT_TOP - CUT_BOTTOM, 22, 1, true]} />
          <meshPhysicalMaterial {...mats.phloem} side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* Sieve plates: perforated end walls. These are the resistance that makes
          phloem sap crawl at a metre an hour instead of tearing along. */}
      <SievePlates plates={plates} />
      <CompanionCells />
      <Spotlight sim={sim} />
    </group>
  )
}

/**
 * Repeated parts are instanced — the plates alone were thirty draw calls as
 * loose meshes, on a stage that has to fit a 120-call budget with the labels
 * and the traffic on top.
 */
function useInstanced(count: number, place: (i: number, dummy: THREE.Object3D) => void) {
  const ref = useRef<THREE.InstancedMesh>(null)
  // The placement is geometry, fixed for the life of the stage; keying the
  // effect on the callback would re-place every render for nothing.
  useEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    for (let i = 0; i < count; i++) {
      dummy.position.set(0, 0, 0)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.setScalar(1)
      place(i, dummy)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count])
  return ref
}

const LIGNIN_Y = Array.from({ length: 11 }, (_, i) => BOTTOM + 0.2 + i * 0.38).filter((y) => y < CUT_BOTTOM || y > CUT_TOP)

function LigninRings() {
  const ref = useInstanced(LIGNIN_Y.length, (i, d) => {
    d.position.set(XYLEM_X, LIGNIN_Y[i], 0)
    d.rotation.set(Math.PI / 2, 0, 0)
  })
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, LIGNIN_Y.length]} frustumCulled={false}>
      <torusGeometry args={[XYLEM_R * 1.02, 0.02, 6, 22]} />
      <meshStandardMaterial color="#7FA6C8" roughness={0.35} metalness={0} envMapIntensity={1.3} />
    </instancedMesh>
  )
}

function SievePlates({ plates }: { plates: number[] }) {
  const ringRef = useInstanced(plates.length, (i, d) => {
    d.position.set(PHLOEM_X, plates[i], 0)
    d.rotation.set(-Math.PI / 2, 0, 0)
  })
  const poreRef = useInstanced(plates.length * 5, (i, d) => {
    const y = plates[Math.floor(i / 5)]
    const a = ((i % 5) / 5) * Math.PI * 2
    d.position.set(PHLOEM_X + Math.cos(a) * PHLOEM_R * 0.62, y, Math.sin(a) * PHLOEM_R * 0.62)
  })
  return (
    <group>
      <instancedMesh ref={ringRef} args={[undefined, undefined, plates.length]} frustumCulled={false}>
        <ringGeometry args={[PHLOEM_R * 0.24, PHLOEM_R * 0.99, 20]} />
        <meshStandardMaterial color="#C79A3E" roughness={0.6} metalness={0} side={THREE.DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={poreRef} args={[undefined, undefined, plates.length * 5]} frustumCulled={false}>
        <cylinderGeometry args={[PHLOEM_R * 0.14, PHLOEM_R * 0.14, 0.04, 8]} />
        <meshBasicMaterial color="#F7E7C2" />
      </instancedMesh>
    </group>
  )
}

const COMPANION_Y = [1.2, 0.4, -0.4, -1.2]

/** Companion cells: the pumps. A sieve element has no nucleus and cannot run
    its own loading, so the cell strapped to its side does it. */
function CompanionCells() {
  const bodyRef = useInstanced(COMPANION_Y.length, (i, d) => d.position.set(COMPANION_X, COMPANION_Y[i], 0))
  const nucleusRef = useInstanced(COMPANION_Y.length, (i, d) => d.position.set(COMPANION_X, COMPANION_Y[i], 0))
  // Plasmodesmata — the doorways sugar is pumped through.
  const doorRef = useInstanced(COMPANION_Y.length, (i, d) => {
    d.position.set(COMPANION_X - 0.29, COMPANION_Y[i], 0)
    d.rotation.set(0, 0, Math.PI / 2)
  })
  return (
    <group>
      <instancedMesh ref={bodyRef} args={[undefined, undefined, COMPANION_Y.length]} frustumCulled={false}>
        <capsuleGeometry args={[0.14, 0.42, 6, 12]} />
        <meshStandardMaterial color="#8FC080" roughness={0.6} metalness={0} />
      </instancedMesh>
      <instancedMesh ref={nucleusRef} args={[undefined, undefined, COMPANION_Y.length]} frustumCulled={false}>
        <sphereGeometry args={[0.055, 10, 8]} />
        <meshStandardMaterial color="#4A7C43" roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={doorRef} args={[undefined, undefined, COMPANION_Y.length]} frustumCulled={false}>
        <cylinderGeometry args={[0.022, 0.022, 0.28, 6]} />
        <meshStandardMaterial color="#B7D8A8" roughness={0.6} />
      </instancedMesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* The cut                                                            */
/* ------------------------------------------------------------------ */

function Cut({ sim }: { sim: SugarSim }) {
  const groupRef = useRef<THREE.Group>(null)
  const woodRef = useRef<THREE.Group>(null)
  const glowRefs = useRef<Array<THREE.Mesh | null>>([])
  const glow = useMemo(() => glowSprite('rgba(193,59,51,0.5)', 'rgba(193,59,51,0.12)', 'cut'), [])
  // The moment a cut lands the glow blooms and settles: an event, not a state.
  const landed = useRef({ girdled: false, xylemCut: false, at: -10 })
  useFrame(() => {
    if (groupRef.current) groupRef.current.visible = sim.girdled
    if (woodRef.current) woodRef.current.visible = sim.xylemCut
    const l = landed.current
    if (sim.girdled !== l.girdled || sim.xylemCut !== l.xylemCut) {
      if ((sim.girdled && !l.girdled) || (sim.xylemCut && !l.xylemCut)) l.at = sim.time
      l.girdled = sim.girdled
      l.xylemCut = sim.xylemCut
    }
    const since = sim.time - l.at
    const bloom = since < 0.6 ? 1 + (1 - since / 0.6) * 1.2 : 1 + Math.sin(sim.time * 3) * 0.08
    glowRefs.current.forEach((m) => m && m.scale.setScalar(bloom))
  })
  return (
    <>
      <group ref={groupRef} position={[PHLOEM_X, 0, 0]} visible={false}>
        {[CUT_TOP, CUT_BOTTOM].map((y, i) => (
          <mesh key={i} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[PHLOEM_R, 22]} />
            <meshStandardMaterial color="#B08A55" roughness={0.9} side={THREE.DoubleSide} />
          </mesh>
        ))}
        <mesh
          ref={(el) => {
            glowRefs.current[0] = el
          }}
        >
          <planeGeometry args={[1.6, 1.6]} />
          <meshBasicMaterial map={glow} transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>
      {/* The other blade: the wood, severed. The vessel is open at both faces
          of the cut and nothing crosses the gap. */}
      <group ref={woodRef} position={[XYLEM_X, 0, 0]} visible={false}>
        {[CUT_TOP, CUT_BOTTOM].map((y, i) => (
          <mesh key={i} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[XYLEM_R, 24]} />
            <meshStandardMaterial color="#8C7A5B" roughness={0.9} side={THREE.DoubleSide} />
          </mesh>
        ))}
        <mesh
          ref={(el) => {
            glowRefs.current[1] = el
          }}
        >
          <planeGeometry args={[1.7, 1.7]} />
          <meshBasicMaterial map={glow} transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Traffic                                                            */
/* ------------------------------------------------------------------ */

const SAP_POOL = 26
const WATER_POOL = 20
const OSMO_POOL = 12

/**
 * Sucrose descending the sieve tube. When the ring is cut the column simply
 * stops above the gap and piles up — which is what really happens, and why a
 * girdled trunk swells above the cut and starves below it.
 */
function SapFlow({ sim }: { sim: SugarSim }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const haloRef = useRef<THREE.InstancedMesh>(null)
  const labelRef = useRef<THREE.InstancedMesh>(null)
  const haloDummy = useMemo(() => new THREE.Object3D(), [])
  const halo = useMemo(() => glowSprite('rgba(255,214,110,0.9)', 'rgba(217,155,43,0.0)', 'sap-halo'), [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const scratch = useMemo(() => new THREE.Vector3(), [])
  const parcels = useMemo(
    () =>
      Array.from({ length: SAP_POOL }, (_, i) => ({
        y: TOP - (i / SAP_POOL) * (TOP - BOTTOM),
        lane: (i % 4) / 4,
        wobble: (i * 2.399) % (Math.PI * 2),
      })),
    [],
  )

  useFrame((state, rawDt) => {
    const mesh = meshRef.current
    const label = labelRef.current
    const glow = haloRef.current
    if (!mesh || !label || !glow) return
    const dt = Math.min(rawDt, 0.05)
    const solve = sim.solve
    const moving = sim.started && !sim.paused
    const speed = solve ? THREE.MathUtils.clamp(solve.velocity * 0.34, 0, 1.6) : 0
    const density = solve ? THREE.MathUtils.clamp(solve.exportRate / 26, 0.08, 1) : 0.08
    const active = Math.max(3, Math.round(SAP_POOL * density))
    // At night the sugar is the lamp: the halo swells and the parcels burn brighter.
    const lamp = sim.night ? 1.8 : 1
    const mat = mesh.material as THREE.MeshStandardMaterial
    mat.emissiveIntensity += ((sim.night ? 1.4 : 0.6) - mat.emissiveIntensity) * (1 - Math.exp(-dt * 2))

    for (let i = 0; i < SAP_POOL; i++) {
      const p = parcels[i]
      if (i >= active) {
        dummy.scale.setScalar(0)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        glow.setMatrixAt(i, dummy.matrix)
        hideGlyph(label, i, dummy)
        continue
      }
      if (moving) {
        // Girdled: everything above the cut queues up against it.
        const blocked = sim.girdled && p.y > CUT_TOP
        const stop = CUT_TOP + 0.1 + (i % 5) * 0.16
        if (blocked) {
          if (p.y > stop) p.y -= dt * speed * 0.5
        } else {
          p.y -= dt * speed
          if (p.y < BOTTOM) p.y = TOP
        }
        // A parcel below the cut drains away and is not replaced.
        if (sim.girdled && p.y < CUT_BOTTOM && p.y > BOTTOM + 0.05) p.y -= dt * speed * 0.6
      }
      const a = p.lane * Math.PI * 2 + Math.sin(sim.time * 0.6 + p.wobble) * 0.4
      const r = PHLOEM_R * 0.52
      scratch.set(PHLOEM_X + Math.cos(a) * r, p.y, Math.sin(a) * r)
      // Nothing may be drawn inside the gap the cut leaves behind.
      const inGap = sim.girdled && p.y < CUT_TOP && p.y > CUT_BOTTOM
      dummy.position.copy(scratch)
      dummy.rotation.set(sim.time * 0.8 + p.wobble, p.y * 2, 0.3)
      // Squash through the sieve plates.
      //
      // The plates are the resistance the whole Münch model turns on, and up
      // to now they were scenery a parcel slid through as if they were not
      // there. Pinching each parcel as it crosses one is the cheapest possible
      // way to *show* that this pipe has doors in it — and it is the beat that
      // makes a twelve-year-old keep watching a stem section, which is not
      // nothing.
      const toPlate = ((p.y - (TOP - 0.55)) % 0.7 + 0.7) % 0.7
      const near = Math.min(toPlate, 0.7 - toPlate)
      const pinch = Math.max(0, 1 - near / 0.075)
      const base = inGap ? 0 : 0.078
      dummy.scale.set(base * (1 - pinch * 0.45), base * (1 + pinch * 0.5), base * (1 - pinch * 0.45))
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      // The halo: a billboard three times the parcel, additive, in the
      // upright frame (a plane in the turned frame would face sideways).
      haloDummy.position.set(-scratch.y, scratch.x, scratch.z + 0.02)
      haloDummy.quaternion.copy(state.camera.quaternion)
      haloDummy.scale.setScalar(inGap ? 0 : base * 3.4 * lamp)
      haloDummy.updateMatrix()
      glow.setMatrixAt(i, haloDummy.matrix)

      if (i === 2 || i === 12) {
        scratch.x += 0.16
        writeGlyph(label, i, dummy, state.camera, toUpright(scratch), inGap ? 0 : 1, 0.16)
      } else {
        hideGlyph(label, i, dummy)
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    glow.instanceMatrix.needsUpdate = true
    label.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={meshRef} args={[undefined, undefined, SAP_POOL]} frustumCulled={false}>
        <dodecahedronGeometry args={[0.62, 0]} />
        <meshStandardMaterial
          color={ATLAS.sugarLight}
          emissive={ATLAS.sugar}
          emissiveIntensity={0.6}
          roughness={0.3}
        />
      </instancedMesh>
      <group rotation={UPRIGHT}>
        <instancedMesh ref={haloRef} args={[undefined, undefined, SAP_POOL]} frustumCulled={false}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={halo} transparent depthWrite={false} depthTest={false} toneMapped={false} blending={THREE.AdditiveBlending} />
        </instancedMesh>
      </group>
      <group rotation={UPRIGHT}>
        <GlyphInstances
          ref={labelRef}
          text="sucrose"
          color={ATLAS.sugarDeep}
          count={SAP_POOL}
          size={0.11}
          style={{ strokeWidth: 7, strokeColor: 'rgba(252,250,244,0.96)' }}
        />
      </group>
    </group>
  )
}

/** Water climbing the xylem, at the speed transpiration is pulling it. */
function XylemFlow({ sim }: { sim: SugarSim }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const drops = useMemo(
    () =>
      Array.from({ length: WATER_POOL }, (_, i) => ({
        y: BOTTOM + (i / WATER_POOL) * (TOP - BOTTOM),
        lane: (i % 5) / 5,
      })),
    [],
  )

  useFrame((_, rawDt) => {
    const mesh = meshRef.current
    if (!mesh) return
    const dt = Math.min(rawDt, 0.05)
    const solve = sim.solve
    const moving = sim.started && !sim.paused
    const pull = THREE.MathUtils.clamp((solve?.leaf.transpiration ?? 0) * 0.9, 0.04, 1.4)
    for (let i = 0; i < WATER_POOL; i++) {
      const d = drops[i]
      if (moving) {
        if (sim.xylemCut) {
          // The wood is cut: what is below the gap queues against it, what is
          // above drains into the leaf and is not replaced — the vessel empties
          // from the cut up, which is the whole of why the leaves go limp.
          if (d.y < CUT_BOTTOM) {
            const stop = CUT_BOTTOM - 0.08 - (i % 5) * 0.14
            if (d.y < stop) d.y += dt * (0.25 + pull * 1.5) * 0.5
          } else if (d.y <= TOP) {
            d.y += dt * (0.25 + pull * 1.5)
          }
        } else {
          d.y += dt * (0.25 + pull * 1.5)
          if (d.y > TOP) d.y = BOTTOM
        }
      }
      const inGap = sim.xylemCut && d.y > CUT_BOTTOM && d.y < CUT_TOP
      const drained = sim.xylemCut && d.y > TOP
      const a = d.lane * Math.PI * 2
      dummy.position.set(XYLEM_X + Math.cos(a) * XYLEM_R * 0.5, Math.min(d.y, TOP), Math.sin(a) * XYLEM_R * 0.5)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.setScalar(inGap || drained ? 0 : 0.058)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, WATER_POOL]} frustumCulled={false}>
      <sphereGeometry args={[1, 10, 8]} />
      {/* Not transparent: a transparent object is left out of the transmission
          buffer on the medium and high tiers, so the front wall of the vessel
          would hide the very drops it exists to show. */}
      <meshStandardMaterial color={ATLAS.water} roughness={0.15} metalness={0} />
    </instancedMesh>
  )
}

/**
 * The Münch circuit: water crossing from the xylem into the sieve tube at the
 * loaded end, and crossing straight back at the unloading end.
 *
 * This is the part every diagram leaves out, and without it "pressure flow"
 * is just a phrase. The sugar does not push itself along — the water that the
 * sugar drags in does the pushing.
 */
function OsmoticCircuit({ sim }: { sim: SugarSim }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const scratch = useMemo(() => new THREE.Vector3(), [])
  const hops = useMemo(
    () =>
      Array.from({ length: OSMO_POOL }, (_, i) => ({
        t: i / OSMO_POOL,
        // Half cross in at the top, half cross back at the bottom.
        top: i % 2 === 0,
        row: ((i * 7) % 5) / 5,
      })),
    [],
  )

  useFrame((_, rawDt) => {
    const mesh = meshRef.current
    if (!mesh) return
    const dt = Math.min(rawDt, 0.05)
    const solve = sim.solve
    const moving = sim.started && !sim.paused
    const drive = solve ? THREE.MathUtils.clamp(solve.pressureGradient / 1.4, 0, 1.2) : 0
    for (let i = 0; i < OSMO_POOL; i++) {
      const h = hops[i]
      if (moving) {
        h.t += dt * (0.18 + drive * 0.5)
        if (h.t > 1) h.t = 0
      }
      const y = h.top ? TOP - 0.35 - h.row * 0.5 : BOTTOM + 0.35 + h.row * 0.5
      // Top: xylem → phloem. Bottom: phloem → xylem.
      const x = h.top
        ? THREE.MathUtils.lerp(XYLEM_X + XYLEM_R, PHLOEM_X - PHLOEM_R, h.t)
        : THREE.MathUtils.lerp(PHLOEM_X - PHLOEM_R, XYLEM_X + XYLEM_R, h.t)
      scratch.set(x, y, 0.06)
      dummy.position.copy(scratch)
      dummy.rotation.set(0, 0, 0)
      const fade = Math.min(1, h.t * 5) * Math.min(1, (1 - h.t) * 5)
      dummy.scale.setScalar(0.042 * fade * (sim.girdled ? 0.35 : 1))
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, OSMO_POOL]} frustumCulled={false}>
      <sphereGeometry args={[1, 8, 6]} />
      <meshStandardMaterial color="#8FC8F0" roughness={0.15} metalness={0} emissive="#3E90D0" emissiveIntensity={0.2} />
    </instancedMesh>
  )
}

/* ------------------------------------------------------------------ */
/* The tracer, at this scale                                          */
/* ------------------------------------------------------------------ */

/**
 * The timed parcel and its two marks, on the sieve tube itself. The
 * whole-plant stage draws the same run on the strand; here the marks are
 * rings scribed on the pipe and read like gate splits along the track —
 * green A at the leaf end, red B toward the roots. The distance is the
 * specimen's real path length mapped onto the drawn tube.
 */
function StemTracer({ sim }: { sim: SugarSim }) {
  const parcelRef = useRef<THREE.Group>(null)
  const markARef = useRef<THREE.Mesh>(null)
  const markBRef = useRef<THREE.Mesh>(null)
  const glow = useMemo(() => glowSprite('rgba(255,214,110,0.95)', 'rgba(217,155,43,0.3)', 'stem-tracer'), [])
  const yFor = (metres: number) => {
    const len = Math.max(0.001, simSpecimen(sim).pathLengthM)
    return TOP - THREE.MathUtils.clamp(metres / len, 0, 1) * (TOP - BOTTOM)
  }
  const crossed = useRef({ a: -10, b: -10, wasA: false, wasB: false })
  useFrame((state) => {
    const g = parcelRef.current
    // A ring flares as the parcel crosses it — the split, made visible.
    const c = crossed.current
    const pastA = sim.tracerActive && sim.tracerDistance >= sim.tracerMarkA
    const pastB = sim.tracerActive && sim.tracerDistance >= sim.tracerMarkB
    if (pastA && !c.wasA) c.a = sim.time
    if (pastB && !c.wasB) c.b = sim.time
    c.wasA = pastA
    c.wasB = pastB
    const flare = (at: number) => {
      const t = sim.time - at
      return t < 0.5 ? 1 + Math.sin((t / 0.5) * Math.PI) * 0.7 : 1
    }
    if (markARef.current) {
      markARef.current.position.y = yFor(sim.tracerMarkA)
      markARef.current.scale.setScalar(flare(c.a))
      ;(markARef.current.material as THREE.MeshBasicMaterial).opacity = sim.tracerActive ? 0.95 : 0.35
    }
    if (markBRef.current) {
      markBRef.current.position.y = yFor(sim.tracerMarkB)
      markBRef.current.scale.setScalar(flare(c.b))
      ;(markBRef.current.material as THREE.MeshBasicMaterial).opacity = sim.tracerActive ? 0.95 : 0.35
    }
    if (!g) return
    g.visible = sim.tracerActive
    if (!sim.tracerActive) return
    g.position.set(-yFor(sim.tracerDistance), PHLOEM_X, 0)
    g.children.forEach((child) => child.quaternion.copy(state.camera.quaternion))
    g.scale.setScalar(1 + Math.sin(sim.time * 7) * 0.12)
  })
  return (
    <group>
      <mesh ref={markARef} position={[PHLOEM_X, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[PHLOEM_R * 1.25, PHLOEM_R * 1.55, 28]} />
        <meshBasicMaterial color={ATLAS.green} transparent opacity={0.35} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={markBRef} position={[PHLOEM_X, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[PHLOEM_R * 1.25, PHLOEM_R * 1.55, 28]} />
        <meshBasicMaterial color={ATLAS.alert} transparent opacity={0.35} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <group rotation={UPRIGHT}>
        <group ref={parcelRef} visible={false}>
          <mesh>
            <planeGeometry args={[0.7, 0.7]} />
            <meshBasicMaterial map={glow} transparent depthWrite={false} depthTest={false} toneMapped={false} blending={THREE.AdditiveBlending} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.085, 14, 11]} />
            <meshStandardMaterial color="#FFD86E" emissive="#E0951F" emissiveIntensity={1.1} roughness={0.2} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Labels                                                             */
/* ------------------------------------------------------------------ */

/**
 * Captions live in the world, not in an overlay — but they are pushed out in
 * front of the cortex on +Z so the stem wall never eats them, which is exactly
 * what happened to XYLEM and SOURCE END the first time round.
 */
/*
 * Positions are given in the *laid-flat* frame (x along the stem, leaf end at
 * −x; y across it, phloem above the xylem), which is the upright label
 * group's own frame — so they are written as they are.
 */
const flat = (X: number, Y: number, Z = 1.15): [number, number, number] => [X, Y, Z]
const TAGS: Array<{ text: string; at: [number, number, number]; color: string; size: number }> = [
  { text: '◀ LEAF END', at: flat(-TOP + 0.05, 1.24), color: ATLAS.ink, size: 0.15 },
  { text: 'ROOT END ▶', at: flat(TOP - 0.05, 1.24), color: ATLAS.ink, size: 0.15 },
  { text: 'PHLOEM — sugar, to the roots ▶', at: flat(1.0, PHLOEM_X - 0.36), color: ATLAS.sugarDeep, size: 0.17 },
  { text: '◀ water, to the leaves — XYLEM', at: flat(0.35, XYLEM_X - 0.5), color: ATLAS.waterDeep, size: 0.17 },
  { text: 'companion cell', at: flat(-0.85, COMPANION_X + 0.36, 1.1), color: ATLAS.greenDeep, size: 0.13 },
  { text: 'sieve plate', at: flat(-(TOP - 0.55), PHLOEM_X + 0.36, 1.1), color: ATLAS.sugarDeep, size: 0.13 },
  { text: 'A', at: flat(-(TOP - 0.18 * (TOP - BOTTOM) / 1), PHLOEM_X - 0.42, 1.1), color: ATLAS.green, size: 0.15 },
  { text: 'B', at: flat(-(TOP - 0.48 * (TOP - BOTTOM) / 1), PHLOEM_X - 0.42, 1.1), color: ATLAS.alert, size: 0.15 },
]

function Tags({ sim }: { sim: SugarSim }) {
  const refs = useRef<Array<THREE.InstancedMesh | null>>([])
  const firmRef = useRef<THREE.InstancedMesh>(null)
  const limpRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const scratch = useMemo(() => new THREE.Vector3(), [])
  useFrame((state) => {
    TAGS.forEach((tag, i) => {
      const mesh = refs.current[i]
      if (!mesh) return
      scratch.set(...tag.at)
      writeGlyph(mesh, 0, dummy, state.camera, scratch, 1, 0.12)
      mesh.instanceMatrix.needsUpdate = true
    })
    // What the leaves are doing, at the leaf end — the one fact the wood cut
    // turns on, and it is off-stage otherwise.
    const limp = sim.turgor < 0.6
    scratch.set(...flat(-TOP + 0.05, 0.98))
    if (firmRef.current) {
      if (limp) hideGlyph(firmRef.current, 0, dummy)
      else writeGlyph(firmRef.current, 0, dummy, state.camera, scratch, 1, 0.12)
      firmRef.current.instanceMatrix.needsUpdate = true
    }
    if (limpRef.current) {
      if (limp) writeGlyph(limpRef.current, 0, dummy, state.camera, scratch, 1, 0.12)
      else hideGlyph(limpRef.current, 0, dummy)
      limpRef.current.instanceMatrix.needsUpdate = true
    }
  })
  return (
    <group rotation={UPRIGHT}>
      <GlyphInstances ref={firmRef} text="leaves firm" color={ATLAS.greenDeep} count={1} size={0.13} style={{ strokeWidth: 8, strokeColor: 'rgba(252,250,244,0.97)' }} />
      <GlyphInstances ref={limpRef} text="leaves limp" color="#9A302A" count={1} size={0.13} style={{ strokeWidth: 8, strokeColor: 'rgba(252,250,244,0.97)' }} />
      {TAGS.map((tag, i) => (
        <GlyphInstances
          key={tag.text}
          ref={(el) => {
            refs.current[i] = el
          }}
          text={tag.text}
          color={tag.color}
          count={1}
          size={tag.size}
          style={{ strokeWidth: 8, strokeColor: 'rgba(252,250,244,0.97)' }}
        />
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ */

export default function StemStage({ sim }: { sim: SugarSim }) {
  const specimen = simSpecimen(sim)
  // Keep a reference to the specimen so a swap re-renders this stage's colour.
  useEffect(() => undefined, [specimen.id])
  return (
    <group name="subject" position={[0, 2.02, 0]} rotation={LAID_FLAT}>
      <Cortex sim={sim} />
      <Pipes sim={sim} />
      <Cut sim={sim} />
      <XylemFlow sim={sim} />
      <SapFlow sim={sim} />
      <OsmoticCircuit sim={sim} />
      <StemTracer sim={sim} />
      <Tags sim={sim} />
    </group>
  )
}
