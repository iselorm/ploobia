import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import GlyphInstances, { glyphTexture, hideGlyph, writeGlyph } from '@/components/photo/Glyphs'
import { glowTexture } from '@/components/photo/Sprites'
import {
  ELEMENT_BY_Z,
  PLACE_SECONDS,
  SHELL_CAPS,
  shellsFor,
  stabilityOf,
  wallSlot,
  CATEGORY_META,
  type AtomSim,
} from '@/lib/atoms'
import { SHELL_RADII, SHELL_SPEEDS, STAGE_POS, tileCenter } from './layout'
import { ContactShadow } from './FoundryWorld'

/**
 * The atom under construction: a luminous, deliberately diagrammatic model.
 * Nucleus cluster (p⁺ amber, n⁰ slate), glowing shell rings, orbiting
 * electrons — every label a world object, never an HTML overlay.
 */

const MAX_P = 22
const MAX_N = 30
const MAX_E = 22

/** Deterministic direction on a sphere (golden-spiral), for packing nucleons. */
function fibDir(i: number, n: number, out: THREE.Vector3): THREE.Vector3 {
  const golden = Math.PI * (3 - Math.sqrt(5))
  const y = n <= 1 ? 0 : 1 - (2 * i) / (n - 1)
  const r = Math.sqrt(Math.max(0, 1 - y * y))
  const a = golden * i
  return out.set(Math.cos(a) * r, y, Math.sin(a) * r)
}

const Y_AXIS = new THREE.Vector3(0, 1, 0)

/** Thin dark outline — the fat cream halo swallowed small letterforms (review note). */
const CRISP = { strokeWidth: 6, strokeColor: 'rgba(38, 24, 12, 0.9)' }

const SHELL_TILTS = [
  new THREE.Euler(0.42, 0, 0.1),
  new THREE.Euler(-0.34, 0.5, -0.08),
  new THREE.Euler(0.18, -0.4, 0.3),
  new THREE.Euler(-0.12, 0.2, -0.35),
].map((e) => new THREE.Quaternion().setFromEuler(e))

interface Props {
  sim: AtomSim
  protons: number
  neutrons: number
  electrons: number
  cloudView: boolean
  showMass: boolean
  onFact: (kind: 'nucleus' | 'electron') => void
}

function Billboard({ children, position }: { children: React.ReactNode; position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(({ camera }) => {
    ref.current?.quaternion.copy(camera.quaternion)
  })
  return (
    <group ref={ref} position={position}>
      {children}
    </group>
  )
}

function GlyphPlane({ text, color, size = 0.3, position = [0, 0, 0] as [number, number, number], opacity = 1, stroke }: { text: string; color: string; size?: number; position?: [number, number, number]; opacity?: number; stroke?: { strokeWidth?: number; strokeColor?: string } }) {
  const { texture, aspect } = useMemo(() => glyphTexture(text, color, stroke), [text, color, stroke])
  return (
    <mesh position={position} renderOrder={3}>
      <planeGeometry args={[size * aspect, size]} />
      <meshBasicMaterial map={texture} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

export default function BuildAtom({ sim, protons, neutrons, electrons, cloudView, showMass, onFact }: Props) {
  const group = useRef<THREE.Group>(null)
  const protonMesh = useRef<THREE.InstancedMesh>(null)
  const neutronMesh = useRef<THREE.InstancedMesh>(null)
  const electronMesh = useRef<THREE.InstancedMesh>(null)
  const cloudMesh = useRef<THREE.InstancedMesh>(null)
  const ringRefs = useRef<Array<THREE.Mesh | null>>([null, null, null, null])
  const ringMats = useRef<Array<THREE.MeshBasicMaterial | null>>([null, null, null, null])
  const flashSprite = useRef<THREE.SpriteMaterial>(null)
  const flashSpriteObj = useRef<THREE.Sprite>(null)
  const flashRing = useRef<THREE.Mesh>(null)
  const flashRingMat = useRef<THREE.MeshBasicMaterial>(null)
  const labelP = useRef<THREE.InstancedMesh>(null)
  const labelN = useRef<THREE.InstancedMesh>(null)
  const labelE = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const v = useMemo(() => new THREE.Vector3(), [])
  const v2 = useMemo(() => new THREE.Vector3(), [])
  const stagePos = useMemo(() => new THREE.Vector3(...STAGE_POS), [])
  const slotPos = useMemo(() => new THREE.Vector3(), [])
  const cloudMap = useMemo(() => glowTexture('rgba(96, 205, 235, 0.9)', 'rgba(96, 205, 235, 0)', 'e-cloud'), [])
  const flashMap = useMemo(() => glowTexture('rgba(255, 240, 200, 0.95)', 'rgba(255, 210, 120, 0)', 'complete-flash'), [])

  const el = ELEMENT_BY_Z[protons]
  const charge = protons > 0 ? protons - electrons : 0
  const stability = protons > 0 ? stabilityOf(protons, neutrons) : 'stable'
  const shells = shellsFor(electrons)

  // Interleaved packing slots — a bijection into 0..total-1 so no two nucleons
  // ever share a position. Counts change rarely, so this is a cheap memo.
  const { protonSlots, neutronSlots } = useMemo(() => {
    const ps: number[] = []
    const ns: number[] = []
    let pi = 0
    let ni = 0
    const total = protons + neutrons
    for (let s = 0; s < total; s++) {
      const wantProton = (s % 2 === 0 && pi < protons) || ni >= neutrons
      if (wantProton && pi < protons) {
        ps.push(s)
        pi++
      } else {
        ns.push(s)
        ni++
      }
    }
    return { protonSlots: ps, neutronSlots: ns }
  }, [protons, neutrons])

  useFrame(({ camera }) => {
    const t = sim.time
    const g = group.current
    if (!g) return

    /* ---- placement flight: stage → the atom's one possible address ---- */
    if (sim.placing) {
      const slot = wallSlot(sim.placing.z)
      const p = Math.min(1, (t - sim.placing.startAt) / PLACE_SECONDS)
      const ease = p * p * (3 - 2 * p)
      if (slot) {
        const c = tileCenter(slot.row, slot.col)
        slotPos.set(c[0], c[1], c[2] + 0.3)
        g.position.lerpVectors(stagePos, slotPos, ease)
        // rise a little first so the flight reads as a throw, not a slide
        g.position.y += Math.sin(p * Math.PI) * 0.7
        g.scale.setScalar(1 - ease * 0.82)
      }
    } else {
      g.position.set(STAGE_POS[0], STAGE_POS[1] + Math.sin(t * 0.7) * 0.04, STAGE_POS[2])
      g.scale.setScalar(1)
    }

    /* ---- nucleus ---- */
    const total = protons + neutrons
    const nucleusR = total > 1 ? 0.085 * Math.cbrt(total) + 0.045 : 0
    const wobbleAmp = stability === 'stable' ? 0.004 : stability === 'unstable' ? 0.016 : 0.038
    const rotY = t * 0.14
    const pop = (added: number) => 1 + 0.7 * Math.max(0, 1 - (t - added) * 3.2)

    const pm = protonMesh.current
    if (pm) {
      for (let i = 0; i < MAX_P; i++) {
        if (i >= protons) {
          hideGlyph(pm, i, dummy)
          continue
        }
        const slot = protonSlots[i] ?? i
        fibDir(slot, Math.max(1, total), v)
        const rad = total <= 1 ? 0 : nucleusR * Math.cbrt(slot / total + 0.12) * 0.92
        v.multiplyScalar(rad)
        v.applyAxisAngle(Y_AXIS, rotY)
        v.x += Math.sin(t * 9 + i * 2.3) * wobbleAmp
        v.y += Math.sin(t * 11 + i * 1.7) * wobbleAmp
        dummy.position.copy(v)
        dummy.quaternion.identity()
        dummy.scale.setScalar(i === protons - 1 ? pop(sim.lastAddP) : 1)
        dummy.updateMatrix()
        pm.setMatrixAt(i, dummy.matrix)
      }
      pm.instanceMatrix.needsUpdate = true
    }
    const nm = neutronMesh.current
    if (nm) {
      for (let i = 0; i < MAX_N; i++) {
        if (i >= neutrons) {
          hideGlyph(nm, i, dummy)
          continue
        }
        const slot = neutronSlots[i] ?? i
        fibDir(slot, Math.max(1, total), v)
        const rad = total <= 1 ? 0 : nucleusR * Math.cbrt(slot / total + 0.12) * 0.92
        v.multiplyScalar(rad)
        v.applyAxisAngle(Y_AXIS, rotY)
        v.x += Math.sin(t * 10 + i * 2.9) * wobbleAmp
        v.z += Math.sin(t * 12 + i * 2.1) * wobbleAmp
        dummy.position.copy(v)
        dummy.quaternion.identity()
        dummy.scale.setScalar(i === neutrons - 1 ? pop(sim.lastAddN) : 1)
        dummy.updateMatrix()
        nm.setMatrixAt(i, dummy.matrix)
      }
      nm.instanceMatrix.needsUpdate = true
    }

    /* ---- electrons on their rings ---- */
    const em = electronMesh.current
    let ei = 0
    let outerFirstPos: THREE.Vector3 | null = null
    if (em) {
      for (let s = 0; s < shells.length; s++) {
        const inShell = shells[s]
        for (let k = 0; k < inShell; k++) {
          if (ei >= MAX_E) break
          const angle = (k / inShell) * Math.PI * 2 + t * SHELL_SPEEDS[s] * (s % 2 === 0 ? 1 : -1) + s * 0.9
          v.set(Math.cos(angle) * SHELL_RADII[s], Math.sin(angle) * SHELL_RADII[s], 0)
          v.applyQuaternion(SHELL_TILTS[s])
          // The probe tugs the outermost electron toward the emitter.
          const isOuterFirst = s === shells.length - 1 && k === 0
          if (isOuterFirst && sim.probing) {
            const pull = Math.min(1, (t - sim.probeStartAt) / 1.4) * 0.34
            v2.set(1.4, -0.15, -0.5).normalize()
            v.addScaledVector(v2, pull)
          }
          if (isOuterFirst) outerFirstPos = v2.copy(v)
          dummy.position.copy(v)
          dummy.quaternion.identity()
          dummy.scale.setScalar(ei === electrons - 1 ? pop(sim.lastAddE) : 1)
          if (cloudView) dummy.scale.setScalar(0)
          dummy.updateMatrix()
          em.setMatrixAt(ei, dummy.matrix)
          ei++
        }
      }
      for (; ei < MAX_E; ei++) hideGlyph(em, ei, dummy)
      em.instanceMatrix.needsUpdate = true
    }

    /* ---- completion celebration: bloom + expanding ring when an element forms ---- */
    const flash = Math.max(0, 1 - (t - sim.completeFlashAt) / 1.2)
    if (flashSpriteObj.current && flashSprite.current) {
      flashSpriteObj.current.visible = flash > 0
      if (flash > 0) {
        const grow = 1 - flash
        flashSpriteObj.current.scale.setScalar(1.6 + grow * 2.6)
        flashSprite.current.opacity = flash * 0.9
      }
    }
    if (flashRing.current && flashRingMat.current) {
      flashRing.current.visible = flash > 0
      if (flash > 0) {
        const grow = 1 - flash
        flashRing.current.scale.setScalar(0.4 + grow * 2.4)
        flashRing.current.quaternion.copy(camera.quaternion)
        flashRingMat.current.opacity = flash * 0.85
      }
    }

    /* ---- rings: visible when occupied; ignition flash when a shell opens ---- */
    for (let s = 0; s < 4; s++) {
      const ring = ringRefs.current[s]
      const mat = ringMats.current[s]
      if (!ring || !mat) continue
      const occupied = s < shells.length
      ring.visible = occupied && !cloudView
      if (!occupied) continue
      const ignite = s === sim.shellIgniteIndex ? Math.max(0, 1 - (t - sim.shellIgniteAt) / 1.6) : 0
      mat.opacity = 0.32 + ignite * 0.6 + flash * 0.5
      const sc = 1 + ignite * 0.12 * Math.sin((t - sim.shellIgniteAt) * 18)
      ring.scale.setScalar(sc)
    }

    /* ---- electron cloud (the honest picture) ---- */
    const cm = cloudMesh.current
    if (cm) {
      const per = 6
      const want = cloudView ? electrons * per : 0
      for (let i = 0; i < MAX_E * per; i++) {
        if (i >= want) {
          hideGlyph(cm, i, dummy)
          continue
        }
        const eIndex = Math.floor(i / per)
        // which shell does electron eIndex belong to?
        let s = 0
        let acc = 0
        for (let j = 0; j < shells.length; j++) {
          if (eIndex < acc + shells[j]) {
            s = j
            break
          }
          acc += shells[j]
        }
        const h1 = Math.sin(i * 127.1) * 43758.5453
        const h2 = Math.sin(i * 269.5) * 43758.5453
        const h3 = Math.sin(i * 419.2) * 43758.5453
        const theta = (h1 - Math.floor(h1)) * Math.PI * 2 + t * 0.15
        const phi = Math.acos(2 * (h2 - Math.floor(h2)) - 1)
        const rr = SHELL_RADII[s] * (0.75 + (h3 - Math.floor(h3)) * 0.5)
        dummy.position.set(rr * Math.sin(phi) * Math.cos(theta), rr * Math.cos(phi), rr * Math.sin(phi) * Math.sin(theta))
        dummy.quaternion.copy(camera.quaternion)
        dummy.scale.setScalar(0.09)
        dummy.updateMatrix()
        cm.setMatrixAt(i, dummy.matrix)
      }
      cm.instanceMatrix.needsUpdate = true
    }

    /* ---- in-world particle labels (subset, never a wall of text) ---- */
    const hideLabels = !!sim.placing
    const lp = labelP.current
    if (lp) {
      if (protons > 0 && pm && !hideLabels) {
        pm.getMatrixAt(0, dummy.matrix)
        v.setFromMatrixPosition(dummy.matrix).add(g.position)
        writeGlyph(lp, 0, dummy, camera, v, 0.55, 0.16)
      } else hideGlyph(lp, 0, dummy)
      lp.instanceMatrix.needsUpdate = true
    }
    const ln = labelN.current
    if (ln) {
      if (neutrons > 0 && nm && !hideLabels) {
        // Label the LAST neutron (outermost packing slot) so p⁺ and n⁰ never collide.
        nm.getMatrixAt(neutrons - 1, dummy.matrix)
        v.setFromMatrixPosition(dummy.matrix).add(g.position)
        writeGlyph(ln, 0, dummy, camera, v, 0.55, 0.16)
      } else hideGlyph(ln, 0, dummy)
      ln.instanceMatrix.needsUpdate = true
    }
    const le = labelE.current
    if (le) {
      if (electrons > 0 && outerFirstPos && !cloudView && !hideLabels) {
        v.copy(outerFirstPos).add(g.position)
        writeGlyph(le, 0, dummy, camera, v, 0.5, 0.12)
      } else hideGlyph(le, 0, dummy)
      le.instanceMatrix.needsUpdate = true
    }
  })

  const chargeText = charge === 0 ? null : charge > 0 ? `+${charge}` : `${charge}`
  const tint = el ? CATEGORY_META[el.category].tint : '#E8A33D'
  const outerCount = shells.length ? shells[shells.length - 1] : 0
  const outerCap = shells.length ? SHELL_CAPS[shells.length - 1] : 0

  return (
    <group>
      {/* plinth */}
      <group>
        <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.5, 0.6, 0.84, 28]} />
          <meshStandardMaterial color="#4E3A2A" roughness={0.6} metalness={0.25} />
        </mesh>
        <mesh position={[0, 0.855, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.42, 0.5, 40]} />
          <meshBasicMaterial color="#E8A33D" toneMapped={false} transparent opacity={0.9} />
        </mesh>
        <ContactShadow position={[0, 0, 0]} radius={1.0} />
      </group>

      {/* nameplate — in the world, in front of the plinth */}
      {el && (
        <Billboard position={[0, 1.14, 0.8]}>
          <GlyphPlane text={el.symbol} color={tint} size={0.34} position={[0, 0.06, 0]} />
          <GlyphPlane text={el.name} color="#FFF6E8" size={0.13} position={[0, -0.17, 0]} stroke={CRISP} />
          {chargeText && <GlyphPlane text={chargeText} color={charge > 0 ? '#FF8A66' : '#7FD8F5'} size={0.16} position={[0.42, 0.1, 0]} stroke={CRISP} />}
          {showMass && <GlyphPlane text={`A ${protons + neutrons}`} color="#F3E4CE" size={0.11} position={[0, -0.31, 0]} stroke={CRISP} />}
          {/* The outer shell's occupancy AND its ceiling — the number that fixes the column. */}
          {electrons > 0 && (
            <GlyphPlane
              text={`outer shell ${outerCount}/${outerCap}`}
              color={outerCount === outerCap ? '#9BE8A8' : '#9FEBFF'}
              size={0.1}
              position={[0, showMass ? -0.44 : -0.31, 0]}
              stroke={CRISP}
            />
          )}
        </Billboard>
      )}

      {/* the atom itself */}
      <group ref={group} position={STAGE_POS}>
        <group
          onClick={(e) => {
            e.stopPropagation()
            onFact('nucleus')
          }}
        >
          <instancedMesh ref={protonMesh} args={[undefined, undefined, MAX_P]} frustumCulled={false} castShadow>
            <sphereGeometry args={[0.078, 20, 16]} />
            <meshStandardMaterial color="#E8A33D" emissive="#B96A18" emissiveIntensity={0.55} roughness={0.35} />
          </instancedMesh>
          <instancedMesh ref={neutronMesh} args={[undefined, undefined, MAX_N]} frustumCulled={false} castShadow>
            <sphereGeometry args={[0.078, 20, 16]} />
            <meshStandardMaterial color="#9AA4B2" emissive="#4A5563" emissiveIntensity={0.4} roughness={0.4} />
          </instancedMesh>
        </group>

        <group
          onClick={(e) => {
            e.stopPropagation()
            onFact('electron')
          }}
        >
          {SHELL_RADII.map((r, i) => (
            <mesh
              key={r}
              ref={(m) => {
                ringRefs.current[i] = m
              }}
              quaternion={SHELL_TILTS[i]}
            >
              <torusGeometry args={[r, 0.0085, 10, 72]} />
              <meshBasicMaterial
                ref={(mat) => {
                  ringMats.current[i] = mat
                }}
                color="#7FD8EE"
                transparent
                opacity={0.32}
                toneMapped={false}
              />
            </mesh>
          ))}
          <instancedMesh ref={electronMesh} args={[undefined, undefined, MAX_E]} frustumCulled={false}>
            <sphereGeometry args={[0.042, 14, 12]} />
            <meshBasicMaterial color="#63E0FF" toneMapped={false} />
          </instancedMesh>
          <instancedMesh ref={cloudMesh} args={[undefined, undefined, MAX_E * 6]} frustumCulled={false}>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial map={cloudMap} transparent opacity={0.3} depthWrite={false} toneMapped={false} />
          </instancedMesh>
        </group>

        {/* completion celebration */}
        <sprite ref={flashSpriteObj} visible={false} renderOrder={4}>
          <spriteMaterial ref={flashSprite} map={flashMap} transparent opacity={0} depthWrite={false} toneMapped={false} />
        </sprite>
        <mesh ref={flashRing} visible={false} renderOrder={4}>
          <ringGeometry args={[0.92, 1.0, 48]} />
          <meshBasicMaterial ref={flashRingMat} color="#FFE9B8" transparent opacity={0} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>

        {/* labels ride in world space (group position added manually) */}
      </group>

      <GlyphInstances ref={labelP} text="p⁺" color="#FFC873" count={1} size={0.2} style={CRISP} />
      <GlyphInstances ref={labelN} text="n⁰" color="#D9E2EE" count={1} size={0.2} style={CRISP} />
      <GlyphInstances ref={labelE} text="e⁻" color="#9FEBFF" count={1} size={0.2} style={CRISP} />
    </group>
  )
}
