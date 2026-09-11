import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useQualityCaps } from '@/lib/quality'
import { glowTexture, shadowTexture } from '@/components/photo/Sprites'

/**
 * The foundry venue: a bright workshop late in the afternoon.
 *
 * Two lifts, and the second is the one that matters. The first pass was a
 * near-black hall ("not as friendly as it should" — Selorm); the second was
 * golden-hour but still a lit island in a dark void, which left the periodic
 * table hanging in nothing. The room now has a **back wall**: a warm plaster
 * plane the table board is hung on, with a screened window beside it throwing
 * a shaft across the floor.
 *
 * That is what makes the table a *hint* rather than a hole. A dark board on a
 * bright wall reads as a thing in a room; the same board in a void reads as
 * the only thing there is, which is how a reference wall ends up competing
 * with the atom the learner is supposed to be looking at.
 *
 * The atom survives the daylight because its nucleons are lit spheres with
 * modest emissive, not lamps — so they read as objects on a bench, and the
 * stage's light pool plus a contact shadow keep them sitting in the room.
 */

/** The plaster plane the table board hangs on — just behind the board itself. */
export const WALL_PLANE_Z = -6.05
export const FLOOR_COLOR = '#A9835A'
export const FOG_COLOR = '#D9BC93'

/** Six-stop vertical gradient painted onto the inside of a dome. */
function domeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const g = ctx.createLinearGradient(0, 512, 0, 0)
    // Plaster in late-afternoon light: warm and bright at eye level, only
    // gently deeper overhead. Nothing here is allowed to go dark — the wall
    // behind the table has to read as a wall.
    g.addColorStop(0, '#F6E6C9')
    g.addColorStop(0.14, '#EFDCBB')
    g.addColorStop(0.32, '#E3CCA0')
    g.addColorStop(0.55, '#D3B389')
    g.addColorStop(0.8, '#C09C76')
    g.addColorStop(1, '#B08D6B')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 4, 512)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function Motes({ scale }: { scale: number }) {
  const count = Math.round(70 * scale)
  const ref = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: Math.sin(i * 12.9898) * 8,
        y: 0.4 + ((i * 0.618) % 1) * 3.6,
        z: Math.sin(i * 78.233) * 6 - 1,
        speed: 0.05 + ((i * 0.377) % 1) * 0.08,
        phase: i * 1.7,
      })),
    [count],
  )
  const map = useMemo(() => glowTexture('rgba(255, 226, 170, 0.9)', 'rgba(255, 226, 170, 0)', 'mote-amber'), [])

  useFrame(({ clock }) => {
    const mesh = ref.current
    if (!mesh) return
    const t = clock.elapsedTime
    seeds.forEach((s, i) => {
      dummy.position.set(
        s.x + Math.sin(t * s.speed + s.phase) * 0.6,
        s.y + Math.sin(t * s.speed * 1.4 + s.phase * 2.1) * 0.4,
        s.z + Math.cos(t * s.speed * 0.8 + s.phase) * 0.6,
      )
      dummy.scale.setScalar(0.05 + 0.03 * Math.sin(t * 0.6 + s.phase))
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={map} transparent opacity={0.35} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
    </instancedMesh>
  )
}

function Lamp({ position, tint }: { position: [number, number, number]; tint: string }) {
  const halo = useMemo(() => glowTexture('rgba(255, 214, 150, 0.85)', 'rgba(255, 214, 150, 0)', 'lamp-halo'), [])
  return (
    <group position={position}>
      {/* pole */}
      <mesh position={[0, -position[1] / 2, 0]}>
        <cylinderGeometry args={[0.035, 0.05, position[1], 8]} />
        <meshStandardMaterial color="#4A3A2C" roughness={0.8} metalness={0.4} />
      </mesh>
      {/* glowing head */}
      <mesh>
        <sphereGeometry args={[0.16, 18, 14]} />
        <meshBasicMaterial color={tint} toneMapped={false} />
      </mesh>
      <sprite scale={[1.6, 1.6, 1]}>
        <spriteMaterial map={halo} transparent opacity={0.6} depthWrite={false} toneMapped={false} />
      </sprite>
    </group>
  )
}

/**
 * A screened window: the lattice a Ghanaian workshop actually has, and the
 * reason the light in here has a direction. Drawn as one canvas texture on
 * one plane rather than geometry — a screen is a pattern, and 200 little
 * boxes would cost draw calls the atoms budget wants for atoms.
 */
function screenTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#FFF3D6'
    ctx.fillRect(0, 0, 256, 256)
    ctx.strokeStyle = 'rgba(150, 106, 58, 0.55)'
    ctx.lineWidth = 7
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        ctx.beginPath()
        ctx.arc(26 + x * 51, 26 + y * 51, 18, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/**
 * The back wall, and the window in it.
 *
 * A single large plane behind the table, plus the window, its frame and the
 * shaft it throws onto the floor. Cheap — five meshes and two textures — and
 * it is the whole difference between "a room" and "a lit object in a void".
 */
function BackWall() {
  const screen = useMemo(() => screenTexture(), [])
  const shaft = useMemo(() => glowTexture('rgba(255, 243, 214, 0.55)', 'rgba(255, 243, 214, 0)', 'window-shaft'), [])
  return (
    <group>
      {/* plaster */}
      <mesh position={[0, 4.4, WALL_PLANE_Z]} receiveShadow>
        <planeGeometry args={[34, 15]} />
        <meshStandardMaterial color="#EBD6B4" roughness={0.96} metalness={0} />
      </mesh>
      {/* skirting, so the wall meets the floor rather than floating */}
      <mesh position={[0, -1.31, WALL_PLANE_Z + 0.02]}>
        <planeGeometry args={[34, 0.32]} />
        <meshStandardMaterial color="#B99268" roughness={0.9} />
      </mesh>

      {/* The window: frame behind, screen in front.
          It was built the other way round — a solid box "frame" the full size
          of the opening, with the screen drawn over it — so the window was a
          brown slab on the wall, which is what a phone's wider field of view
          made impossible to miss. The frame is now four bars around an
          opening, and the light comes through it. */}
      {[
        [0, 1.92, 3.46, 0.14],
        [0, -1.92, 3.46, 0.14],
        [-1.66, 0, 0.14, 3.98],
        [1.66, 0, 0.14, 3.98],
      ].map(([dx, dy, w, h], i) => (
        <mesh key={i} position={[-6.7 + (dx as number), 3.1 + (dy as number), WALL_PLANE_Z + 0.06]}>
          <boxGeometry args={[w as number, h as number, 0.09]} />
          <meshStandardMaterial color="#B98B4E" roughness={0.7} />
        </mesh>
      ))}
      {/* the glazing bar across the middle */}
      <mesh position={[-6.7, 3.1, WALL_PLANE_Z + 0.05]}>
        <boxGeometry args={[3.34, 0.09, 0.07]} />
        <meshStandardMaterial color="#B98B4E" roughness={0.7} />
      </mesh>
      <mesh position={[-6.7, 3.1, WALL_PLANE_Z + 0.03]}>
        <planeGeometry args={[3.34, 3.9]} />
        <meshBasicMaterial map={screen} toneMapped={false} />
      </mesh>

      {/* the shaft it throws across the floor */}
      <mesh position={[-5.6, -1.46, 0.4]} rotation={[-Math.PI / 2, 0, 0.32]}>
        <planeGeometry args={[7.5, 9]} />
        <meshBasicMaterial map={shaft} transparent opacity={0.5} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

/**
 * The bench's whole top surface, baked into one texture.
 *
 * It began as four full-width layers stacked on the slab — terrazzo speckle,
 * a painted work zone, a teal band at the back, a falloff at the front — and
 * each was right on its own. Together they were four transparent planes the
 * width of the picture, and on a software rasteriser that overdraw was enough
 * to drag the frame rate down far enough that the twenty-second catch took
 * closer to a minute. A catch that runs slow on a weak device is a bug in the
 * game, not in the test, so all four are drawn once into a single opaque
 * canvas and the bench wears one mesh.
 *
 * The canvas is laid out in bench coordinates: x −9.7 … 9.7 across, z −2.92
 * (the back, against the wall) … 2.92 (the front edge) down.
 */
const SURFACE_W = 19.4
const SURFACE_D = 5.84

function benchSurfaceTexture(): THREE.CanvasTexture {
  const cw = 1024
  const ch = 310
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  const px = (x: number): number => ((x + SURFACE_W / 2) / SURFACE_W) * cw
  const pz = (z: number): number => ((z + SURFACE_D / 2) / SURFACE_D) * ch
  if (ctx) {
    ctx.fillStyle = '#E4D3B2'
    ctx.fillRect(0, 0, cw, ch)

    // terrazzo chips: the scale cue that makes this a worktop and not a floor
    const chips = ['#C9B08A', '#A98F6E', '#F2E7D2', '#B5977A', '#8E7A5E', '#D8C6A2']
    let seed = 20260907
    const rnd = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }
    for (let i = 0; i < 1100; i++) {
      const x = rnd() * cw
      const y = rnd() * ch
      const r = 1.4 + rnd() * 3.6
      ctx.globalAlpha = 0.26 + rnd() * 0.4
      ctx.fillStyle = chips[Math.floor(rnd() * chips.length)]
      ctx.beginPath()
      ctx.ellipse(x, y, r, r * (0.55 + rnd() * 0.6), rnd() * Math.PI, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // the painted band along the back edge
    ctx.fillStyle = 'rgba(31, 111, 115, 0.5)'
    ctx.fillRect(0, pz(-2.2), cw, pz(-1.78) - pz(-2.2))

    // the work zone: an outline, never a filled mat — a dark rectangle here is
    // most of the picture, and it simply becomes the new floor
    const zx = px(-3.9)
    const zz = pz(-0.8)
    const zw = px(3.9) - zx
    const zh = pz(3.1) - zz
    ctx.strokeStyle = 'rgba(31, 111, 115, 0.5)'
    ctx.lineWidth = 4
    ctx.setLineDash([22, 14])
    ctx.strokeRect(zx, zz, zw, zh)
    ctx.setLineDash([])
    ctx.strokeStyle = 'rgba(31, 111, 115, 0.7)'
    ctx.lineWidth = 6
    for (const [cx, cy, sx, sy] of [
      [zx, zz, 1, 1],
      [zx + zw, zz, -1, 1],
      [zx, zz + zh, 1, -1],
      [zx + zw, zz + zh, -1, -1],
    ] as Array<[number, number, number, number]>) {
      ctx.beginPath()
      ctx.moveTo(cx + sx * 40, cy)
      ctx.lineTo(cx, cy)
      ctx.lineTo(cx, cy + sy * 34)
      ctx.stroke()
    }

    // the near half darkens: a surface receding under the light
    const g = ctx.createLinearGradient(0, pz(0), 0, ch)
    g.addColorStop(0, 'rgba(122, 92, 58, 0)')
    g.addColorStop(1, 'rgba(104, 76, 46, 0.42)')
    ctx.fillStyle = g
    ctx.fillRect(0, pz(0), cw, ch - pz(0))
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/**
 * The bench.
 *
 * Built so that **its top surface is y = 0** — the plane the crucibles and the
 * contact shadows already stand on. That is the whole trick: the room gains a
 * bench without a single object moving, and the floor simply drops below it.
 * Positioning the bench anywhere else would mean re-siting the crucibles, the
 * shadows, the light pool and the camera framings, and the framing rules in
 * this cabinet were expensive to get right.
 *
 * A terrazzo top with a lip, a painted cupboard beneath it, two panelled
 * doors and brass knobs. Boxes, because a bench IS boxes — the one thing
 * script-built geometry does honestly. The organic props (glassware, a plant,
 * a mortar) are a separate import job; nothing here pretends to be them.
 */
const BENCH_TOP_Y = 0
const BENCH_FRONT_Z = 3.4
const BENCH_BACK_Z = -2.2
const BENCH_H = 1.35

function Bench() {
  const top = useMemo(() => benchSurfaceTexture(), [])
  const doors: Array<[number, number]> = [
    [-4.6, 3.4],
    [-0.85, 3.4],
    [2.9, 3.4],
  ]
  return (
    <group>
      {/* the slab, wearing its whole surface as one baked texture */}
      <mesh position={[0, BENCH_TOP_Y - 0.06, (BENCH_FRONT_Z + BENCH_BACK_Z) / 2]} receiveShadow>
        <boxGeometry args={[SURFACE_W, 0.12, SURFACE_D]} />
        <meshStandardMaterial color="#E4D3B2" roughness={0.62} metalness={0.06} />
      </mesh>
      <mesh position={[0, BENCH_TOP_Y + 0.002, (BENCH_FRONT_Z + BENCH_BACK_Z) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[SURFACE_W, SURFACE_D]} />
        <meshBasicMaterial map={top} toneMapped={false} />
      </mesh>
      {/* a darker under-edge: the shadow line that stops the slab looking painted on */}
      <mesh position={[0, BENCH_TOP_Y - 0.14, BENCH_FRONT_Z + 0.1]}>
        <boxGeometry args={[19.4, 0.05, 0.06]} />
        <meshStandardMaterial color="#9A8A6E" roughness={0.9} />
      </mesh>

      {/* the cupboard carcass */}
      <mesh position={[0, BENCH_TOP_Y - 0.12 - BENCH_H / 2, (BENCH_FRONT_Z + BENCH_BACK_Z) / 2 - 0.06]} receiveShadow>
        <boxGeometry args={[19, BENCH_H, BENCH_FRONT_Z - BENCH_BACK_Z]} />
        <meshStandardMaterial color="#256C6E" roughness={0.72} metalness={0.05} />
      </mesh>

      {/* panelled doors + knobs on the face the camera sees */}
      {doors.map(([x, z], i) => (
        <group key={i} position={[x, BENCH_TOP_Y - 0.12 - BENCH_H / 2, z + 0.005]}>
          <mesh>
            <planeGeometry args={[3.3, BENCH_H - 0.3]} />
            <meshStandardMaterial color="#2E7B7D" roughness={0.68} />
          </mesh>
          <mesh position={[0, 0, 0.006]}>
            <planeGeometry args={[2.9, BENCH_H - 0.62]} />
            <meshStandardMaterial color="#1F5E60" roughness={0.75} />
          </mesh>
          <mesh position={[0, 0, 0.02]}>
            <sphereGeometry args={[0.075, 14, 12]} />
            <meshStandardMaterial color="#D9A867" roughness={0.35} metalness={0.65} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/**
 * A jar: a warm cylinder, a lighter shoulder of liquid, a stopper. No glass
 * shader — at this distance refraction costs more than it says, and the thing
 * a jar has to communicate here is *somebody works at this bench*.
 */
function Jar({ position, height, color }: { position: [number, number, number]; height: number; color: string }) {
  return (
    <group position={position}>
      <mesh>
        <cylinderGeometry args={[0.15, 0.16, height, 14]} />
        <meshStandardMaterial color={color} roughness={0.32} metalness={0.12} transparent opacity={0.88} />
      </mesh>
      <mesh position={[0, height / 2 + 0.04, 0]}>
        <cylinderGeometry args={[0.11, 0.12, 0.08, 12]} />
        <meshStandardMaterial color="#8A5410" roughness={0.7} />
      </mesh>
    </group>
  )
}

/**
 * What is actually on the bench.
 *
 * The first pass put a long shelf of jars across the back wall and it was
 * simply wrong: at the overview camera it drew a plank straight through the
 * middle of the periodic table and stood jars on top of the tiles. The table
 * is the one thing in this room that must never be occluded — it is the
 * record of what the player has forged.
 *
 * So the dressing obeys three rules, all of them learned from the shot.
 *
 * **Nothing stands where the table is.** Standing props live in the narrow
 * band between the board's edge and the frame's edge (|x| about 4.2–5.1 at
 * the back of the bench), which flanks the board rather than crossing it.
 *
 * **Nothing in the middle band stands up.** Behind the crucibles the board
 * fills the frame, so anything there must stay under about a fifth of a unit
 * high: trays, a notebook, tools lying down. Silhouettes there would read as
 * clutter on the periodic table.
 *
 * **The bench is drawn on, not covered over.** The work zone is a painted
 * outline, not a mat; the terrazzo stays visible, which is what stops the
 * surface reading as floor.
 */
function BenchDressing() {

  /** Jars, in the two narrow clear zones either side of the board. */
  const jars = useMemo(
    () =>
      [
        [-4.98, 0.44, '#C98C3A'],
        [-4.42, 0.3, '#8FB08A'],
        [4.45, 0.34, '#A9C2C6'],
        [5.02, 0.46, '#D9A867'],
      ] as Array<[number, number, string]>,
    [],
  )

  return (
    <group>
      {/* two short risers in the flanking bands */}
      {[-4.68, 4.72].map((x, i) => (
        <mesh key={i} position={[x, BENCH_TOP_Y + 0.09, -1.6]} receiveShadow>
          <boxGeometry args={[1.5, 0.18, 0.85]} />
          <meshStandardMaterial color="#B98B4E" roughness={0.82} />
        </mesh>
      ))}

      {jars.map(([x, h, color], i) => (
        <Jar key={i} position={[x, BENCH_TOP_Y + 0.18 + h / 2, -1.6]} height={h} color={color} />
      ))}

      {/* low, flat things in the middle band, all under 0.2 high */}
      {/* a tool tray with two tongs lying in it */}
      <group position={[-3.45, BENCH_TOP_Y, -1.3]} rotation={[0, 0.12, 0]}>
        <mesh position={[0, 0.045, 0]} receiveShadow>
          <boxGeometry args={[1.7, 0.09, 0.62]} />
          <meshStandardMaterial color="#4E5B5E" roughness={0.55} metalness={0.35} />
        </mesh>
        {[-0.12, 0.12].map((dz, i) => (
          <mesh key={i} position={[0, 0.115, dz]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.035, 0.035, 1.4, 8]} />
            <meshStandardMaterial color="#C9CDD2" roughness={0.3} metalness={0.6} />
          </mesh>
        ))}
      </group>

      {/* an open notebook, pages up */}
      <group position={[3.4, BENCH_TOP_Y, -1.35]} rotation={[0, -0.18, 0]}>
        <mesh position={[0, 0.03, 0]} receiveShadow>
          <boxGeometry args={[1.5, 0.06, 0.95]} />
          <meshStandardMaterial color="#F4EAD6" roughness={0.95} />
        </mesh>
        <mesh position={[0, 0.062, 0]}>
          <boxGeometry args={[0.05, 0.01, 0.95]} />
          <meshStandardMaterial color="#B8543F" roughness={0.9} />
        </mesh>
      </group>

    </group>
  )
}

/**
 * One short shelf, high on the plaster to the right of the table — the depth
 * cue that says this is a workshop wall and not a backdrop. It is on the
 * right only: the window is on the left, and the space between them is the
 * table's.
 */
function WallShelf() {
  return (
    <group position={[5.95, 0, WALL_PLANE_Z + 0.4]}>
      <mesh position={[0, 2.5, 0]}>
        <boxGeometry args={[2.7, 0.1, 0.62]} />
        <meshStandardMaterial color="#B98B4E" roughness={0.82} />
      </mesh>
      {[
        [-0.95, 0.42, '#8FB08A'],
        [-0.34, 0.3, '#C98C3A'],
        [0.28, 0.5, '#6A9EA6'],
        [0.92, 0.34, '#B9773B'],
      ].map(([x, h, color], i) => (
        <Jar key={i} position={[x as number, 2.56 + (h as number) / 2, 0]} height={h as number} color={color as string} />
      ))}
      {/* the bracket under it */}
      <mesh position={[0, 2.3, -0.2]}>
        <boxGeometry args={[2.1, 0.32, 0.1]} />
        <meshStandardMaterial color="#A57B42" roughness={0.85} />
      </mesh>
    </group>
  )
}

/** Soft dark ellipse that grounds an object on the floor. */
export function ContactShadow({ position, radius = 0.7, opacity = 0.42 }: { position: [number, number, number]; radius?: number; opacity?: number }) {
  const map = useMemo(() => shadowTexture(), [])
  return (
    <mesh position={[position[0], 0.012, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[radius * 2, radius * 2 * 0.86]} />
      <meshBasicMaterial map={map} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  )
}

export default function FoundryWorld() {
  const quality = useQualityCaps()
  const dome = useMemo(() => domeTexture(), [])
  const stageGlow = useMemo(() => glowTexture('rgba(232, 163, 61, 0.5)', 'rgba(232, 163, 61, 0)', 'stage-glow'), [])

  return (
    <group>
      <fog attach="fog" args={[FOG_COLOR, 22, 62]} />
      {/* dome */}
      <mesh scale={[48, 48, 48]}>
        <sphereGeometry args={[1, 24, 18]} />
        <meshBasicMaterial map={dome} side={THREE.BackSide} fog={false} toneMapped={false} />
      </mesh>
      <BackWall />
      {/* the floor now sits below the bench top, not at it */}
      <mesh position={[0, -BENCH_H - 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[46, 48]} />
        <meshStandardMaterial color={FLOOR_COLOR} roughness={0.94} metalness={0.05} />
      </mesh>
      <Bench />
      <BenchDressing />
      <WallShelf />
      {/* warm pool of light around the stage — it has to work harder now that
          the room is bright, or the atom stops sitting anywhere in particular */}
      <mesh position={[0, 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[10, 10]} />
        <meshBasicMaterial map={stageGlow} transparent opacity={0.8} depthWrite={false} toneMapped={false} />
      </mesh>

      {/* lighting */}
      <ambientLight intensity={1.35} color="#FFF1DC" />
      <hemisphereLight args={['#FFF3E0', '#A98055', 0.7]} />
      {/* keyed from the window, so the shaft on the floor and the shading agree */}
      <directionalLight
        position={[-7, 7, 4]}
        intensity={1.6}
        color="#FFE2B0"
        castShadow={quality.shadows}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={24}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
      />
      {/* one warm fill over the bench; the blue rim on the wall is gone with the
          darkness that needed it */}
      <pointLight position={[0, 3.4, 0.6]} intensity={5} color="#FFD79A" distance={11} decay={2} />

      <Lamp position={[4.9, 3.2, 2.2]} tint="#FFDFA6" />

      <Motes scale={quality.particleScale} />
    </group>
  )
}
