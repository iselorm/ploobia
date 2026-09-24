import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { WORLD_TEXTURES, type WorldTextureId } from '@/lib/worldassets'
import { WORLD_TEXT } from '@/lib/worldtext'
import { useWorldTexture } from './useWorldMesh'

/**
 * The place around the things — W2 batch 2. Nothing here has a verb, so
 * nothing here is a mesh: five painted stills, keyed out, on flat cards or
 * tiled over the procedural walls. Every card keeps a stand-in until its
 * texture lands, and `?standins=1` keeps the stand-ins for good.
 *
 * Signage is lettering-free art; the words come from `lib/worldtext.ts`
 * and are drawn on at runtime, so a language file owns every word.
 */

/** A one-sided painted card, `height` metres tall, cut to the still's aspect. */
export function Card({
  id,
  height,
  position,
  rotation = [0, 0, 0],
  billboard = false,
  lit = false,
  children,
}: {
  id: WorldTextureId
  height: number
  position: [number, number, number]
  rotation?: [number, number, number]
  /** Turn about Y to face the camera — for the skyline cards far off. */
  billboard?: boolean
  /** Lit by the scene's lights (a wall relief) or painted flat (a matte far away). */
  lit?: boolean
  children?: ReactNode
}) {
  const tex = useWorldTexture(id)
  const g = useRef<THREE.Group>(null)
  const w = height * WORLD_TEXTURES[id].aspect
  useFrame(({ camera }) => {
    const grp = g.current
    if (!grp || !billboard) return
    grp.rotation.y = Math.atan2(camera.position.x - grp.position.x, camera.position.z - grp.position.z)
  })
  return (
    <group ref={g} position={position} rotation={rotation} name={`card-${id}`} userData={{ generated: !!tex }}>
      {tex ? (
        // Keyed so React never reuses the stand-in's material: R3F resets a dropped `color` prop to black.
        <mesh key="painted" castShadow={lit} receiveShadow={lit}>
          <planeGeometry args={[w, height]} />
          {lit ? (
            <meshStandardMaterial map={tex} color="#ffffff" transparent alphaTest={0.35} roughness={0.9} side={THREE.DoubleSide} />
          ) : (
            <meshBasicMaterial map={tex} color="#ffffff" transparent alphaTest={0.2} side={THREE.DoubleSide} />
          )}
        </mesh>
      ) : (
        <group key="standin">{children}</group>
      )}
    </group>
  )
}

/* ------------------------------------------------------------------ text */

let fontReady: Promise<void> | null = null
function ensureFont(): Promise<void> {
  if (!fontReady) {
    const fonts = (document as Document & { fonts?: { load: (f: string) => Promise<unknown> } }).fonts
    fontReady = fonts ? fonts.load('700 48px Nunito').then(() => undefined, () => undefined) : Promise.resolve()
  }
  return fontReady
}

/** Lines of text drawn once onto a transparent canvas, sized to `w`×`h` px. */
function drawText(canvas: HTMLCanvasElement, lines: readonly string[], opts: { color: string; px: number; w: number; h: number; weight?: number; shadow?: string }) {
  const g = canvas.getContext('2d')
  if (!g) return
  g.clearRect(0, 0, opts.w, opts.h)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = opts.color
  const lineH = opts.px * 1.25
  const y0 = opts.h / 2 - ((lines.length - 1) * lineH) / 2
  lines.forEach((line, i) => {
    let px = opts.px
    g.font = `${opts.weight ?? 800} ${px}px Nunito, "Segoe UI", sans-serif`
    while (g.measureText(line).width > opts.w * 0.9 && px > 10) {
      px -= 2
      g.font = `${opts.weight ?? 800} ${px}px Nunito, "Segoe UI", sans-serif`
    }
    if (opts.shadow) {
      g.fillStyle = opts.shadow
      g.fillText(line, opts.w / 2 + 2, y0 + i * lineH + 3)
      g.fillStyle = opts.color
    }
    g.fillText(line, opts.w / 2, y0 + i * lineH)
  })
}

/** A transparent text plane. Redraws once Nunito is in, so the words match the HUD. */
export function TextPlane({ lines, width, height, color, px = 64, weight, shadow, position, rotation }: { lines: readonly string[]; width: number; height: number; color: string; px?: number; weight?: number; shadow?: string; position?: [number, number, number]; rotation?: [number, number, number] }) {
  const w = 512
  const h = Math.max(64, Math.round((w * height) / width))
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  }, [w, h])
  const key = lines.join('\n')
  useEffect(() => {
    const canvas = tex.image as HTMLCanvasElement
    const paint = () => {
      drawText(canvas, lines, { color, px, w, h, weight, shadow })
      tex.needsUpdate = true
    }
    paint()
    let live = true
    ensureFont().then(() => live && paint())
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, w, h, color, px, weight, shadow, tex])
  return (
    <mesh position={position} rotation={rotation} renderOrder={2}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={tex} color="#ffffff" transparent depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  )
}

/* --------------------------------------------------------------- pieces */

/** A red cloth banner on the wall; the words sit on the lower half, where the still left the cloth plain. */
export function Banner({ lines, position, rotation, height = 2.4 }: { lines: readonly string[]; position: [number, number, number]; rotation?: [number, number, number]; height?: number }) {
  const w = height * WORLD_TEXTURES.banner.aspect
  return (
    <group position={position} rotation={rotation}>
      <Card id="banner" height={height} position={[0, 0, 0]} lit>
        <mesh>
          <planeGeometry args={[w, height]} />
          <meshStandardMaterial color="#9E2F27" roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
      </Card>
      <TextPlane lines={lines} width={w * 0.8} height={height * 0.36} color="#F2D28B" shadow="rgba(60,10,5,0.55)" px={lines.length > 1 ? 54 : 72} position={[0, -height * 0.1, 0.012]} />
    </group>
  )
}

/** A wall-mounted rack — a relief card 15 cm off the stone. */
export function ToolRack({ position, rotation }: { position: [number, number, number]; rotation?: [number, number, number] }) {
  return (
    <Card id="rack" height={1.5} position={position} rotation={rotation} lit>
      <mesh>
        <planeGeometry args={[2.1, 1.5]} />
        <meshStandardMaterial color="#5A3E2A" roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
    </Card>
  )
}

/** A chalkboard on a frame; the line is a language-file slot. */
export function Chalkboard({ position, rotation, lines = WORLD_TEXT.foundry.chalkboard }: { position: [number, number, number]; rotation?: [number, number, number]; lines?: readonly string[] }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 1.55, 0]} castShadow>
        <boxGeometry args={[2.1, 1.35, 0.08]} />
        <meshStandardMaterial color="#6B4A30" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.55, 0.045]}>
        <planeGeometry args={[1.92, 1.17]} />
        <meshStandardMaterial color="#2E3A32" roughness={1} />
      </mesh>
      {[-0.85, 0.85].map((x) => (
        <mesh key={x} position={[x, 0.45, 0]} castShadow>
          <boxGeometry args={[0.09, 0.9, 0.09]} />
          <meshStandardMaterial color="#6B4A30" roughness={0.9} />
        </mesh>
      ))}
      <TextPlane lines={lines} width={1.8} height={1.0} color="#F3EBD6" px={72} weight={700} position={[0, 1.55, 0.05]} />
    </group>
  )
}

/** The rule on a plank over the gate. */
export function Lintel({ position, rotation, text = WORLD_TEXT.foundry.rule }: { position: [number, number, number]; rotation?: [number, number, number]; text?: string }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow>
        <boxGeometry args={[5.2, 0.6, 0.14]} />
        <meshStandardMaterial color="#5E4128" roughness={0.9} />
      </mesh>
      <TextPlane lines={[text]} width={4.9} height={0.5} color="#F2D28B" px={40} position={[0, 0, 0.075]} />
      <TextPlane lines={[text]} width={4.9} height={0.5} color="#F2D28B" px={40} position={[0, 0, -0.075]} rotation={[0, Math.PI, 0]} />
    </group>
  )
}

/**
 * Iron braces: a dark strap with three rivets every few metres along a wall —
 * the frames' vertical rhythm. One instanced draw for straps, one for rivets.
 */
export function Braces({ walls, every = 4.3 }: { walls: { position: [number, number, number]; size: [number, number, number] }[]; every?: number }) {
  const spots = useMemo(() => {
    const out: { p: THREE.Vector3; yaw: number }[] = []
    for (const w of walls) {
      const alongX = w.size[0] > w.size[2]
      const len = alongX ? w.size[0] : w.size[2]
      const n = Math.max(1, Math.round(len / every))
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n - 0.5
        // Both faces of the wall, 5 cm proud of the stone.
        for (const side of [-1, 1]) {
          const p = alongX
            ? new THREE.Vector3(w.position[0] + t * len, w.position[1], w.position[2] + side * (w.size[2] / 2 + 0.05))
            : new THREE.Vector3(w.position[0] + side * (w.size[0] / 2 + 0.05), w.position[1], w.position[2] + t * len)
          out.push({ p, yaw: alongX ? 0 : Math.PI / 2 })
        }
      }
    }
    return out
  }, [walls, every])
  const straps = useRef<THREE.InstancedMesh>(null)
  const rivets = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    const s = straps.current
    const r = rivets.current
    if (!s || !r) return
    const m = new THREE.Object3D()
    spots.forEach((sp, i) => {
      m.position.copy(sp.p)
      m.rotation.set(0, sp.yaw, 0)
      m.updateMatrix()
      s.setMatrixAt(i, m.matrix)
      for (let k = 0; k < 3; k++) {
        m.position.copy(sp.p)
        m.position.y += (k - 1) * 1.0
        m.updateMatrix()
        r.setMatrixAt(i * 3 + k, m.matrix)
      }
    })
    s.instanceMatrix.needsUpdate = true
    r.instanceMatrix.needsUpdate = true
  }, [spots])
  return (
    <>
      {/* not culled: an instanced mesh's bounds are its geometry's, at the origin */}
      <instancedMesh ref={straps} args={[undefined, undefined, spots.length]} frustumCulled={false} castShadow receiveShadow>
        <boxGeometry args={[0.26, 3.05, 0.1]} />
        <meshStandardMaterial color="#3A3532" roughness={0.6} metalness={0.5} />
      </instancedMesh>
      <instancedMesh ref={rivets} args={[undefined, undefined, spots.length * 3]} frustumCulled={false}>
        <boxGeometry args={[0.11, 0.11, 0.16]} />
        <meshStandardMaterial color="#5A524C" roughness={0.5} metalness={0.6} />
      </instancedMesh>
    </>
  )
}

/**
 * The skyline: the Landing across the water to the south-east (where the
 * explorer came from) and the Ancient Furnace on its hill to the north-west.
 * Two big painted cards that turn to face the camera; the hill's mouth glows
 * once the pour has happened — the same additive bloom as the furnace mouth.
 */
export function Skyline({ poured }: { poured: boolean }) {
  return (
    <>
      <Card id="landing-card" height={34} position={[40, 8, 56]} billboard>
        <group>
          <mesh position={[0, -4, 0]}>
            <cylinderGeometry args={[11, 10, 1.4, 20]} />
            <meshStandardMaterial color="#C9B58E" roughness={1} />
          </mesh>
          <mesh position={[0, -9, 0]}>
            <coneGeometry args={[10, 8, 10]} />
            <meshStandardMaterial color="#6F5236" roughness={1} flatShading />
          </mesh>
          <mesh position={[0, 2, 0]}>
            <boxGeometry args={[1.2, 12, 1.2]} />
            <meshStandardMaterial color="#4A3A2C" roughness={0.9} />
          </mesh>
        </group>
      </Card>
      <group position={[-34, 9, -78]}>
        <Card id="ancient-card" height={34} position={[0, 0, 0]} billboard>
          <group>
            <mesh position={[0, -12, 0]}>
              <coneGeometry args={[26, 16, 12]} />
              <meshStandardMaterial color="#6E7A4A" roughness={1} flatShading />
            </mesh>
            <mesh position={[0, 0, 0]}>
              <cylinderGeometry args={[3, 4, 10, 10]} />
              <meshStandardMaterial color="#4B463E" roughness={1} />
            </mesh>
          </group>
        </Card>
        <AncientGlow on={poured} />
      </group>
    </>
  )
}

let halo: THREE.Texture | null = null
function haloTexture(): THREE.Texture {
  if (halo) return halo
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,225,160,1)')
  grad.addColorStop(0.35, 'rgba(255,170,70,0.7)')
  grad.addColorStop(1, 'rgba(255,120,40,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  halo = new THREE.CanvasTexture(c)
  halo.colorSpace = THREE.SRGBColorSpace
  return halo
}

/** The hill furnace's mouth, breathing amber after the pour — it sits over the card's mouth, always facing the camera. */
function AncientGlow({ on }: { on: boolean }) {
  const m = useRef<THREE.Mesh>(null)
  const amt = useRef(0)
  useFrame(({ camera, clock }, dtRaw) => {
    const mesh = m.current
    if (!mesh) return
    const dt = Math.min(0.05, dtRaw)
    amt.current += ((on ? 1 : 0) - amt.current) * (1 - Math.pow(0.1, dt))
    const a = amt.current
    mesh.visible = a > 0.02
    if (!mesh.visible) return
    const t = clock.elapsedTime
    const breathe = 1 + 0.15 * Math.sin(t * 1.1) + 0.05 * Math.sin(t * 3.7)
    mesh.scale.setScalar(6 * a * breathe)
    ;(mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * a
    mesh.quaternion.copy(camera.quaternion)
  })
  // The mouth sits a little below the card's centre and toward the camera side.
  return (
    <mesh ref={m} position={[0, -6.5, 1.5]} visible={false} renderOrder={4}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={haloTexture()} color="#FFB347" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}
