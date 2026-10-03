import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { CuboidCollider } from '@react-three/rapier'
import { bendOf, drawingBeatOf, drawingElapsed, drawingPick, getWorld, registerInteractable, useWorld, viceShown } from '@/lib/archipelago'
import { braceCopper, drawBeat, drawSag, type DrawingPart } from '@/lib/bend'
import Tag from './SceneTag'
import { DRAWING, DRAWING_AT, DRAWING_REACH, DRAWING_VERB_AT } from './viceLayout'

/**
 * S2 round A3 — the repair drawing on its board beside the vice (storyboard
 * v3.1 §03 M5; the design of 2 Oct: the drawing moves). A gate leaf of timber
 * boards hung from a post, a timber brace from the hinge foot up to the latch
 * corner, two copper straps held by copper pins. No iron touches copper.
 *
 * The child points at the brace or a strap, and the drawing answers by
 * moving: the brace is redrawn in copper and bows, the leaf sags and the
 * straps kink; then the timber brace goes back in and the leaf comes up
 * square. The beats are lib/bend.ts's, read off the sim clock. Stand-in
 * props. Scene handle for suites: `vice-drawing` (userData.sag, .phase —
 * written per frame, no prop).
 */

const PAPER = '#F1E8D4'
const INK = '#3D332A'
const TIMBER = '#C9A26B'
const BRACE = '#8A5A32'
const COPPER = '#C8743A'
const PIN = '#7A4424'
const AMBER = '#E8A33D'

/** The leaf, in the drawing's own plane: its hinge foot, and its size. */
const LEAF = { x: -0.46, y: -0.36, w: 0.98, h: 0.7 }
const B0: [number, number] = [0.04, 0.04]
const B1: [number, number] = [LEAF.w - 0.04, LEAF.h - 0.04]
const B_LEN = Math.hypot(B1[0] - B0[0], B1[1] - B0[1])
const B_ANG = Math.atan2(B1[1] - B0[1], B1[0] - B0[0])
const STRAP_Y = [0.14, 0.56] as const
const STRAP_LEN = LEAF.w - 0.04

export default function DrawingBoard() {
  const s = useWorld()
  const shown = viceShown(s) && s.zone === 'foundry'
  useEffect(() => {
    if (!shown) return
    return registerInteractable({ id: 'vice.drawing', verb: 'measure', label: 'The repair drawing', pos: DRAWING_VERB_AT, radius: DRAWING_REACH })
  }, [shown])
  const root = useRef<THREE.Group>(null)
  const leaf = useRef<THREE.Group>(null)
  const timber = useRef<THREE.Mesh>(null)
  const copper = useRef<THREE.Group>(null)
  const halfA = useRef<THREE.Mesh>(null)
  const halfB = useRef<THREE.Mesh>(null)
  const strapsA = useRef<(THREE.Group | null)[]>([])
  const strapsB = useRef<(THREE.Group | null)[]>([])
  const halo = useRef<THREE.MeshStandardMaterial[]>([])
  const reduced = useMemo(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, [])
  const v = bendOf(s)
  const inRoom = s.room === 'drawing'
  const pickable = inRoom && v.done && v.pick == null
  useFrame((state) => {
    const w = getWorld()
    const el = drawingElapsed(w)
    const sag = drawSag(el)
    const inCopper = braceCopper(el)
    const g = leaf.current
    if (g) {
      // A shear about the hinge: the latch side drops, the hinge side stays on its post.
      g.matrix.set(1, 0, 0, LEAF.x, -sag, 1, 0, LEAF.y, 0, 0, 1, 0.012, 0, 0, 0, 1)
      g.matrixWorldNeedsUpdate = true
    }
    if (timber.current) timber.current.visible = !inCopper
    if (copper.current) copper.current.visible = inCopper
    // The copper brace is too long for the sagging leaf: it bows out of line, as the strip did.
    const bow = (B_LEN / 2) * Math.tan(sag * 2.4)
    const mx = (B0[0] + B1[0]) / 2 + Math.sin(B_ANG) * bow
    const my = (B0[1] + B1[1]) / 2 - Math.cos(B_ANG) * bow
    const place = (m: THREE.Mesh | null, from: [number, number], to: [number, number]) => {
      if (!m) return
      m.position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, 0.012)
      m.rotation.z = Math.atan2(to[1] - from[1], to[0] - from[0])
      m.scale.x = Math.hypot(to[0] - from[0], to[1] - from[1])
    }
    place(halfA.current, B0, [mx, my])
    place(halfB.current, [mx, my], B1)
    // The straps kink at the middle as the leaf racks.
    const kink = sag * 1.5
    strapsA.current.forEach((h) => h && (h.rotation.z = -kink))
    strapsB.current.forEach((h) => h && (h.rotation.z = kink))
    const pulse = pickable ? (reduced ? 0.45 : 0.25 + 0.25 * Math.sin(state.clock.elapsedTime * 3.2)) : 0
    halo.current.forEach((m) => m && (m.opacity = pulse))
    const r = root.current
    if (r) {
      // Written here, never as a prop: a prop would wipe it on every re-render.
      r.userData.sag = sag
      r.userData.phase = el == null ? (bendOf(w).pick != null ? 'square' : 'still') : drawBeat(el)
    }
  })
  if (!shown) return null
  const beat = drawingBeatOf(s)
  const pick = (part: DrawingPart) => (e: { stopPropagation: () => void }) => {
    if (!pickable) return
    e.stopPropagation()
    drawingPick(part)
  }
  const haloMat = (i: number) => (
    <meshStandardMaterial
      ref={(m) => {
        if (m) halo.current[i] = m
      }}
      color={AMBER}
      emissive={AMBER}
      emissiveIntensity={0.8}
      transparent
      opacity={0}
      toneMapped={false}
      depthWrite={false}
    />
  )
  return (
    <group position={DRAWING_AT} rotation={[0, -Math.PI / 2, 0]}>
      <CuboidCollider args={[DRAWING.w / 2, 1.1, 0.12]} position={[0, 1.1, 0]} />
      {/* the board on its frame */}
      <mesh position={[0, DRAWING.y, 0]} castShadow>
        <boxGeometry args={[DRAWING.w, DRAWING.h, 0.06]} />
        <meshStandardMaterial color="#6B4A30" roughness={0.9} />
      </mesh>
      <mesh position={[0, DRAWING.y, 0.032]}>
        <planeGeometry args={[DRAWING.w - 0.14, DRAWING.h - 0.14]} />
        <meshStandardMaterial color={PAPER} roughness={1} />
      </mesh>
      {[-0.7, 0.7].map((x) => (
        <mesh key={x} position={[x, (DRAWING.y - DRAWING.h / 2) / 2, 0]} castShadow>
          <boxGeometry args={[0.09, DRAWING.y - DRAWING.h / 2, 0.09]} />
          <meshStandardMaterial color="#6B4A30" roughness={0.9} />
        </mesh>
      ))}

      {/* the drawing itself, a few millimetres proud of the paper */}
      <group ref={root} position={[0, DRAWING.y, 0.036]} name="vice-drawing">
        {/* the ground and the post the leaf hangs from */}
        <mesh position={[0.02, LEAF.y - 0.07, 0.004]}>
          <boxGeometry args={[1.36, 0.012, 0.004]} />
          <meshStandardMaterial color={INK} roughness={1} />
        </mesh>
        <mesh position={[LEAF.x - 0.075, 0.0, 0.006]}>
          <boxGeometry args={[0.1, LEAF.h + 0.2, 0.008]} />
          <meshStandardMaterial color="#6B4A30" roughness={1} />
        </mesh>

        <group ref={leaf} matrixAutoUpdate={false}>
          {/* six boards */}
          {Array.from({ length: 6 }, (_, i) => (
            <mesh key={i} position={[(i + 0.5) * (LEAF.w / 6), LEAF.h / 2, 0]}>
              <boxGeometry args={[LEAF.w / 6 - 0.012, LEAF.h, 0.006]} />
              <meshStandardMaterial color={TIMBER} roughness={1} />
            </mesh>
          ))}
          {/* the brace: timber, from the hinge foot to the latch corner */}
          <mesh ref={timber} position={[(B0[0] + B1[0]) / 2, (B0[1] + B1[1]) / 2, 0.01]} rotation={[0, 0, B_ANG]} onClick={pick('brace')} name="drawing-brace">
            <boxGeometry args={[B_LEN, 0.085, 0.008]} />
            <meshStandardMaterial color={BRACE} roughness={1} />
          </mesh>
          {/* …and the same brace drawn in copper: thin, and bowing */}
          <group ref={copper} visible={false}>
            <mesh ref={halfA}>
              <boxGeometry args={[1, 0.03, 0.008]} />
              <meshStandardMaterial color={COPPER} roughness={0.6} metalness={0.4} emissive={AMBER} emissiveIntensity={0.25} />
            </mesh>
            <mesh ref={halfB}>
              <boxGeometry args={[1, 0.03, 0.008]} />
              <meshStandardMaterial color={COPPER} roughness={0.6} metalness={0.4} emissive={AMBER} emissiveIntensity={0.25} />
            </mesh>
          </group>
          {/* a halo behind the brace while it can be pointed at */}
          <mesh position={[(B0[0] + B1[0]) / 2, (B0[1] + B1[1]) / 2, 0.008]} rotation={[0, 0, B_ANG]}>
            <planeGeometry args={[B_LEN + 0.08, 0.17]} />
            {haloMat(0)}
          </mesh>
          {/* two copper straps, each held by copper pins; each in two halves so it can kink */}
          {STRAP_Y.map((y, i) => (
            <group key={y} position={[0.02, y, 0.016]} onClick={pick('strap')} name={`drawing-strap-${i}`}>
              <mesh position={[STRAP_LEN / 2, 0, -0.004]}>
                <planeGeometry args={[STRAP_LEN + 0.06, 0.13]} />
                {haloMat(1 + i)}
              </mesh>
              <group
                ref={(g) => {
                  strapsA.current[i] = g
                }}
              >
                <mesh position={[STRAP_LEN / 4, 0, 0]}>
                  <boxGeometry args={[STRAP_LEN / 2, 0.05, 0.008]} />
                  <meshStandardMaterial color={COPPER} roughness={0.6} metalness={0.4} />
                </mesh>
                {[0.06, 0.3].map((px) => (
                  <mesh key={px} position={[px, 0, 0.006]} rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.014, 0.014, 0.006, 10]} />
                    <meshStandardMaterial color={PIN} roughness={0.6} />
                  </mesh>
                ))}
              </group>
              <group
                position={[STRAP_LEN, 0, 0]}
                ref={(g) => {
                  strapsB.current[i] = g
                }}
              >
                <mesh position={[-STRAP_LEN / 4, 0, 0]}>
                  <boxGeometry args={[STRAP_LEN / 2, 0.05, 0.008]} />
                  <meshStandardMaterial color={COPPER} roughness={0.6} metalness={0.4} />
                </mesh>
                {[-0.06, -0.3].map((px) => (
                  <mesh key={px} position={[px, 0, 0.006]} rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.014, 0.014, 0.006, 10]} />
                    <meshStandardMaterial color={PIN} roughness={0.6} />
                  </mesh>
                ))}
              </group>
            </group>
          ))}
        </group>
      </group>

      {inRoom && (
        <>
          <Html position={[LEAF.x + LEAF.w * 0.36, DRAWING.y + LEAF.y + LEAF.h * 0.3, 0.1]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
            <Tag small testid="drawing-tag-brace">
              {beat === 'copper' || beat === 'sag' || beat === 'hold' ? 'the brace · in copper' : 'the brace · timber'}
            </Tag>
          </Html>
          <Html position={[LEAF.x + LEAF.w * 0.72, DRAWING.y + LEAF.y + STRAP_Y[1] + 0.1, 0.1]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
            <Tag small testid="drawing-tag-strap">
              straps and pins · copper
            </Tag>
          </Html>
        </>
      )}
    </group>
  )
}
