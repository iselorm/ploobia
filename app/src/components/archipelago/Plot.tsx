import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { registerInteractable, useWorld, type PlotState } from '@/lib/archipelago'
import { SOIL, type Bed as BedModel } from '@/lib/roots'
import { WORLD_TEXT } from '@/lib/worldtext'
import { Card, TextPlane } from './Dressing'
import { useWorldTexture } from './useWorldMesh'
import { BEDS, MARKER_IN, MARKER_LEAN, PAGE, WELL } from './landingLayout'
import DayRing from './DayRing'

/**
 * The plot's things — S0. Three raised beds on the Landing: Nara's by the
 * well (her mother's cutting, drowning), the empty plot beside it (the
 * child's), and the far bed down the path past the store. The plant is two
 * keyed stills cross-faded by `firm` until its meshes land; the soil darkens
 * with `theta`; nothing here computes a number. The marker, the leaning
 * rails, the fence that rises at the reward and the page by the well are all
 * here too, because they are the plot's, and they read the store's stage.
 */

/** A bed's look, from the model: soil wetness 0..1 and the leaf's firmness, or no plant. */
function bedLook(p: PlotState, which: keyof typeof BEDS): { wet: number; firm: number | null; pond: number } {
  const clay = SOIL.clay
  const wetOf = (b: BedModel) => Math.max(0, Math.min(1, (b.theta - clay.wp) / (clay.fc - clay.wp)))
  const run = p.run
  if (which === 'nara') {
    const b = run?.bed === 'first' ? run.b : p.first?.b
    return b ? { wet: wetOf(b), firm: b.firm, pond: b.pond } : { wet: 1, firm: 0.49, pond: 0 }
  }
  if (which === 'far') {
    if (run?.bed === 'second') return { wet: wetOf(run.b), firm: run.b.firm, pond: run.b.pond }
    // watered every morning until the first stand; healthy on arrival
    return { wet: 0.85, firm: 1, pond: 0 }
  }
  return { wet: 0.2, firm: p.planted ? 1 : null, pond: 0 }
}

export default function Plot() {
  const s = useWorld()
  const p = s.plot
  const nara = bedLook(p, 'nara')
  const far = bedLook(p, 'far')
  const mine = bedLook(p, 'mine')
  const probing = (id: string) => (p.run && (p.run.bed === 'first' ? 'bed.nara' : 'bed.far') === id ? 'Probe the bed' : 'Look at the bed')
  return (
    <group name="plot">
      <Bed id="bed.nara" position={BEDS.nara} wet={nara.wet} firm={nara.firm} pond={nara.pond} verb="probe" label={probing('bed.nara')} />
      <Bed id="bed.far" position={BEDS.far} wet={far.wet} firm={far.firm} pond={far.pond} verb="probe" label={probing('bed.far')} />
      <Bed
        id="bed.mine"
        position={BEDS.mine}
        wet={mine.wet}
        firm={mine.firm}
        pond={0}
        verb="plant"
        label="Plant the cutting"
        registered={p.stage === 'reward'}
        small
      />
      <Marker named={p.name} stage={p.stage} />
      <Fence up={p.stage === 'reward' || p.stage === 'done'} />
      <WetStreak visible={p.stage === 'arrive' || p.stage === 'met'} />
      <Page visible={p.stage === 'page'} />
      <DayRing />
    </group>
  )
}

/* ------------------------------------------------------------------ bed */

const BED_W = 1.5
const EDGE = 0.3

function Bed({
  id,
  position,
  wet,
  firm,
  pond,
  verb,
  label,
  registered = true,
  small = false,
}: {
  id: string
  position: [number, number, number]
  wet: number
  firm: number | null
  pond: number
  verb: 'probe' | 'plant'
  label: string
  registered?: boolean
  small?: boolean
}) {
  useEffect(() => {
    if (!registered) return
    return registerInteractable({ id, verb, label, pos: position, radius: 2.1 })
  }, [id, verb, label, position, registered])
  const dry = useWorldTexture('soil-dry')
  const wetTex = useWorldTexture('soil-wet')
  const wetMat = useRef<THREE.MeshStandardMaterial>(null)
  const pondMesh = useRef<THREE.Mesh>(null)
  const shown = useRef({ wet, pond })
  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw)
    const k = 1 - Math.pow(0.02, dt)
    shown.current.wet += (wet - shown.current.wet) * k
    shown.current.pond += (pond - shown.current.pond) * k
    if (wetMat.current) wetMat.current.opacity = shown.current.wet
    const pm = pondMesh.current
    if (pm) {
      const a = Math.min(1, shown.current.pond / 6)
      pm.visible = a > 0.02
      ;(pm.material as THREE.MeshStandardMaterial).opacity = 0.7 * a
    }
  })
  useEffect(() => {
    for (const t of [dry, wetTex]) if (t) t.repeat.set(BED_W / 1.2, BED_W / 1.2)
  }, [dry, wetTex])
  const inner = BED_W - 0.16
  return (
    <group position={position} name={id}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[BED_W / 2, 0.3, BED_W / 2]} position={[0, 0.3, 0]} />
      </RigidBody>
      {/* brick edging */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i * Math.PI) / 2
        return (
          <mesh key={i} position={[Math.sin(a) * (BED_W / 2 - 0.08), EDGE / 2, Math.cos(a) * (BED_W / 2 - 0.08)]} rotation={[0, a, 0]} castShadow receiveShadow>
            <boxGeometry args={[BED_W, EDGE, 0.16]} />
            <meshStandardMaterial color="#B5652E" roughness={0.9} />
          </mesh>
        )
      })}
      {/* the soil: dry underneath, the wet tile fading in over it */}
      <mesh position={[0, EDGE - 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[inner, inner]} />
        {dry ? <meshStandardMaterial key="t" map={dry} color="#ffffff" roughness={1} /> : <meshStandardMaterial key="f" color="#8A6A45" roughness={1} />}
      </mesh>
      <mesh position={[0, EDGE - 0.055, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[inner, inner]} />
        {wetTex ? (
          <meshStandardMaterial key="t" ref={wetMat} map={wetTex} color="#ffffff" roughness={1} transparent opacity={wet} depthWrite={false} />
        ) : (
          <meshStandardMaterial key="f" ref={wetMat} color="#3E2A1A" roughness={1} transparent opacity={wet} depthWrite={false} />
        )}
      </mesh>
      {/* standing water, when there is any */}
      <mesh ref={pondMesh} position={[0, EDGE - 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <planeGeometry args={[inner - 0.1, inner - 0.1]} />
        <meshStandardMaterial color="#2F5A66" roughness={0.15} metalness={0.2} transparent opacity={0} depthWrite={false} />
      </mesh>
      {firm != null && <Cassava firm={firm} height={small ? 0.55 : 1.15} position={[0, EDGE - 0.05, 0]} />}
    </group>
  )
}

/* --------------------------------------------------------------- cassava */

/**
 * The plant: the healthy and drooping stills on one billboard, cross-faded by
 * firmness. Until the textures land, a procedural cutting whose leaves hang
 * by the same number.
 */
function Cassava({ firm, height, position }: { firm: number; height: number; position: [number, number, number] }) {
  const up = useWorldTexture('cassava-up')
  const down = useWorldTexture('cassava-down')
  const g = useRef<THREE.Group>(null)
  const upMat = useRef<THREE.MeshStandardMaterial>(null)
  const downMat = useRef<THREE.MeshStandardMaterial>(null)
  const leaves = useRef<THREE.Group>(null)
  const shown = useRef(firm)
  useFrame(({ camera }, dtRaw) => {
    const dt = Math.min(0.05, dtRaw)
    shown.current += (firm - shown.current) * (1 - Math.pow(0.05, dt))
    const f = shown.current
    const grp = g.current
    if (grp) {
      // turn about Y toward the camera, and sag a little as the leaves go
      grp.rotation.y = Math.atan2(camera.position.x - grp.getWorldPosition(TMP).x, camera.position.z - TMP.z)
      grp.scale.set(1, 0.9 + 0.1 * f, 1)
    }
    // the healthy still leads above 0.75; the drooping one below 0.45; a blend between
    const k = Math.max(0, Math.min(1, (f - 0.45) / 0.3))
    if (upMat.current) upMat.current.opacity = k
    if (downMat.current) downMat.current.opacity = 1 - k
    const lv = leaves.current
    if (lv) {
      lv.children.forEach((c, i) => {
        const hang = (1 - f) * 1.25
        c.rotation.x = 0.35 + hang
        c.rotation.z = Math.sin(i * 1.7) * 0.3
      })
    }
  })
  const w = height
  return (
    <group ref={g} position={position} name="cassava">
      {up && down ? (
        <group position={[0, height / 2, 0]}>
          <mesh renderOrder={2}>
            <planeGeometry args={[w, height]} />
            <meshStandardMaterial ref={upMat} map={up} color="#ffffff" transparent alphaTest={0.08} opacity={1} roughness={0.85} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <mesh position={[0, 0, 0.012]} renderOrder={3}>
            <planeGeometry args={[w, height]} />
            <meshStandardMaterial ref={downMat} map={down} color="#ffffff" transparent alphaTest={0.08} opacity={0} roughness={0.85} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        </group>
      ) : (
        <group>
          <mesh position={[0, height * 0.4, 0]} castShadow>
            <cylinderGeometry args={[0.025, 0.04, height * 0.8, 6]} />
            <meshStandardMaterial color="#7A6A3A" roughness={1} />
          </mesh>
          <group ref={leaves} position={[0, height * 0.75, 0]}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <group key={i} rotation={[0.35, (i * Math.PI) / 3, 0]}>
                <mesh position={[0, 0, height * 0.22]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
                  <planeGeometry args={[height * 0.16, height * 0.44]} />
                  <meshStandardMaterial color="#5E9B3C" roughness={0.9} side={THREE.DoubleSide} />
                </mesh>
              </group>
            ))}
          </group>
        </group>
      )}
    </group>
  )
}
const TMP = new THREE.Vector3()

/* ---------------------------------------------------------------- marker */

/**
 * The plot marker: leaning on the child's rail until it is pushed in, then
 * standing at the plot's corner with the name plate up. The ghost fence
 * flickers once when the name lands — the transformation, promised.
 */
function Marker({ named, stage }: { named: string | null; stage: PlotState['stage'] }) {
  const lean = !named
  useEffect(() => {
    if (!lean || stage === 'arrive') return
    return registerInteractable({ id: 'marker.plot', verb: 'marker', label: 'Plant the marker', pos: MARKER_LEAN, radius: 1.7 })
  }, [lean, stage])
  const ghost = useRef<THREE.Group>(null)
  const namedAt = useRef<number | null>(null)
  const plate = useRef<THREE.Group>(null)
  const rise = useRef(0)
  useFrame((st, dtRaw) => {
    const dt = Math.min(0.05, dtRaw)
    if (named && namedAt.current == null) namedAt.current = st.clock.elapsedTime
    if (!named) {
      namedAt.current = null
      rise.current = 0
    }
    const gh = ghost.current
    if (gh) {
      const t = namedAt.current == null ? 99 : st.clock.elapsedTime - namedAt.current
      const a = t < 2.4 ? Math.abs(Math.sin(t * 9)) * (1 - t / 2.4) * 0.6 : 0
      gh.visible = a > 0.01
      gh.children.forEach((c) => (((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = a))
    }
    if (named) rise.current = Math.min(1, rise.current + dt * 1.6)
    const pl = plate.current
    if (pl) {
      pl.position.y = 0.55 + 0.5 * (1 - Math.pow(1 - rise.current, 3))
      pl.visible = rise.current > 0.02
    }
  })
  const posts = useMemo(() => fencePosts(), [])
  return (
    <>
      {lean ? (
        <group position={MARKER_LEAN} rotation={[0.35, 0.6, 0]} name="marker-lean">
          <mesh position={[0, 0.5, 0]} castShadow>
            <boxGeometry args={[0.08, 1.05, 0.08]} />
            <meshStandardMaterial color="#8A6A45" roughness={1} />
          </mesh>
          <mesh position={[0, 0.95, 0]} castShadow>
            <boxGeometry args={[0.36, 0.22, 0.05]} />
            <meshStandardMaterial color="#E9DCC0" roughness={0.9} />
          </mesh>
        </group>
      ) : (
        <group position={MARKER_IN} name="marker">
          <mesh position={[0, 0.55, 0]} castShadow>
            <boxGeometry args={[0.08, 1.1, 0.08]} />
            <meshStandardMaterial color="#8A6A45" roughness={1} />
          </mesh>
          <group ref={plate} position={[0, 0.55, 0]} visible={false}>
            <mesh castShadow>
              <boxGeometry args={[0.9, 0.34, 0.05]} />
              <meshStandardMaterial color="#E9DCC0" roughness={0.9} />
            </mesh>
            <TextPlane lines={[named]} width={0.84} height={0.28} color="#2A2823" px={56} position={[0, 0, 0.03]} />
            <TextPlane lines={[named]} width={0.84} height={0.28} color="#2A2823" px={56} position={[0, 0, -0.03]} rotation={[0, Math.PI, 0]} />
          </group>
        </group>
      )}
      {/* the ghost fence */}
      <group ref={ghost} visible={false}>
        {posts.map(([x, z], i) => (
          <mesh key={i} position={[x, 0.45, z]}>
            <boxGeometry args={[0.1, 0.9, 0.1]} />
            <meshBasicMaterial color="#F0B354" transparent opacity={0} toneMapped={false} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </>
  )
}

/* ----------------------------------------------------------------- fence */

function fencePosts(): [number, number][] {
  const [cx, , cz] = BEDS.mine
  const r = BED_W / 2 + 0.35
  const out: [number, number][] = []
  for (let i = 0; i < 4; i += 1) {
    const a = (i * Math.PI) / 2 + Math.PI / 4
    out.push([cx + Math.cos(a) * r * 1.2, cz + Math.sin(a) * r * 1.2])
  }
  for (let i = 0; i < 4; i += 1) {
    const a = (i * Math.PI) / 2
    out.push([cx + Math.cos(a) * r * 1.05, cz + Math.sin(a) * r * 1.05])
  }
  return out
}

/** Her mother's rails: two lean on the plot's edge; at the reward the fence rises post by post. */
function Fence({ up }: { up: boolean }) {
  const posts = useMemo(() => fencePosts(), [])
  const g = useRef<THREE.Group>(null)
  const amt = useRef(0)
  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw)
    amt.current = up ? Math.min(1, amt.current + dt / 5) : 0
    const grp = g.current
    if (!grp) return
    grp.visible = amt.current > 0
    grp.children.forEach((c, i) => {
      // each post gets its own slice of the rise
      const k = Math.max(0, Math.min(1, (amt.current * posts.length - i) / 1.2))
      c.scale.y = Math.max(0.001, k)
      c.position.y = 0.45 * k
      c.visible = k > 0
    })
  })
  return (
    <>
      {!up && (
        <group name="rails-leaning">
          <mesh position={[BEDS.mine[0] + 0.55, 0.42, BEDS.mine[2] + 0.95]} rotation={[0.5, 0.2, 0]} castShadow>
            <boxGeometry args={[0.07, 1.3, 0.07]} />
            <meshStandardMaterial color="#8A6A45" roughness={1} />
          </mesh>
          <mesh position={[BEDS.mine[0] + 0.85, 0.4, BEDS.mine[2] + 0.9]} rotation={[0.5, -0.1, 0]} castShadow>
            <boxGeometry args={[0.07, 1.3, 0.07]} />
            <meshStandardMaterial color="#8A6A45" roughness={1} />
          </mesh>
        </group>
      )}
      <group ref={g} name="fence" visible={false}>
        {posts.map(([x, z], i) => (
          <mesh key={i} position={[x, 0, z]} castShadow>
            <boxGeometry args={[0.1, 0.9, 0.1]} />
            <meshStandardMaterial color="#8A6A45" roughness={1} />
          </mesh>
        ))}
      </group>
    </>
  )
}

/* ------------------------------------------------------------ wet streak */

/** The spilled water from the well to Nara's bed — the pull, not a prompt. */
function WetStreak({ visible }: { visible: boolean }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  const amt = useRef(visible ? 1 : 0)
  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw)
    amt.current += ((visible ? 1 : 0) - amt.current) * (1 - Math.pow(0.3, dt))
    if (mat.current) mat.current.opacity = 0.55 * amt.current
  })
  const from = [WELL[0] - 0.4, WELL[2] - 0.3]
  const to = [BEDS.nara[0] + 0.7, BEDS.nara[2] + 0.5]
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  const len = Math.hypot(dx, dz)
  const yaw = Math.atan2(dx, dz)
  return (
    <mesh position={[(from[0] + to[0]) / 2, 0.02, (from[1] + to[1]) / 2]} rotation={[-Math.PI / 2, 0, yaw]} name="wet-streak" renderOrder={1}>
      <planeGeometry args={[0.55, len]} />
      <meshStandardMaterial ref={mat} color="#2B1E12" roughness={0.3} transparent opacity={0.55} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ page */

/** The torn page in the mud by the well: read, it becomes the first Codex page. */
function Page({ visible }: { visible: boolean }) {
  useEffect(() => {
    if (!visible) return
    return registerInteractable({ id: 'page.well', verb: 'read', label: 'Read the page', pos: PAGE, radius: 1.6 })
  }, [visible])
  const g = useRef<THREE.Group>(null)
  useFrame((st) => {
    const grp = g.current
    if (!grp) return
    grp.visible = visible
    grp.position.y = PAGE[1] + 0.03 + Math.sin(st.clock.elapsedTime * 2) * 0.01
  })
  const t = WORLD_TEXT.landing.codexPage
  return (
    <group ref={g} position={PAGE} rotation={[-Math.PI / 2 + 0.25, 0.4, 0]} visible={false} name="page">
      <Card id="codex-page" height={0.6} position={[0, 0, 0]} lit>
        <mesh>
          <planeGeometry args={[0.6, 0.6]} />
          <meshStandardMaterial color="#EBDDB8" roughness={0.95} side={THREE.DoubleSide} />
        </mesh>
      </Card>
      <TextPlane lines={[t.title, t.line]} width={0.5} height={0.3} color="#3A2E1E" px={40} weight={700} position={[0, 0.02, 0.006]} />
    </group>
  )
}

