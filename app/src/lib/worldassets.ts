/**
 * The Archipelago's generated assets — offered on demand, never load-bearing.
 *
 * Same contract as `marketassets.ts`: every asset was made through Higgsfield
 * (see `public/models/world/manifest.json` for job ids, views, verbs and
 * states), repacked with gltf-transform to Meshopt + 768 px WebP, and served
 * beside the app as plain files. The world is online-first, but a file that
 * fails, times out, or is switched off resolves to `null` and the scene keeps
 * its procedural stand-in. Nothing waits on it; nothing breaks without it.
 *
 * The rule that decided the list: an asset earns its place by a verb or a
 * model-driven state. Fuel piles (their fill is the state) and signage (its
 * text is the language file's) stay procedural.
 */

import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

export type WorldMeshId = 'furnace' | 'crane' | 'crate' | 'ingot' | 'bellows' | 'explorer' | 'foreman' | 'nara'

const MODELS = 'models/world/'

/**
 * `widthM` is the footprint the stand-in occupies (max of x/z), so the real
 * thing lands in the same place at the same size; `heightM` instead pins the
 * height when that is the honest measure (the explorer).
 */
export type WorldMeshSpec = {
  file: string
  widthM?: number
  heightM?: number
  /** Rotation about Y that turns the generator's "front" toward +Z (Tripo fronts face +X). */
  yaw?: number
  /** False keeps the file's own x/z pivot (the crane's mast axis is baked at the origin). */
  center?: boolean
  copy: string
  /** The file is not in the folder yet: never fetched, the stand-in stays. Drop the flag when it lands. */
  missing?: boolean
}

export const WORLD_MESHES: Record<WorldMeshId, WorldMeshSpec> = {
  furnace: { file: 'furnace.glb', widthM: 5.2, yaw: -Math.PI / 2, copy: 'Bricking the furnace…' },
  crane: { file: 'crane.glb', heightM: 6.2, yaw: Math.PI, center: false, copy: 'Raising the mast…' },
  crate: { file: 'crate.glb', widthM: 1.6, yaw: -Math.PI / 2, copy: 'Nailing the crate…' },
  ingot: { file: 'ingot.glb', widthM: 0.6, copy: 'Casting the ingot…' },
  bellows: { file: 'bellows.glb', widthM: 1.9, yaw: Math.PI, copy: 'Stitching the bellows…' },
  explorer: { file: 'explorer.glb', heightM: 1.45, copy: 'Lacing the boots…' },
  /** Sefu — the same Meshy route as the explorer; his idle rides in the file. */
  foreman: { file: 'foreman.glb', heightM: 1.8, copy: 'Tying the apron…' },
  /** Nara — the Meshy route on her four-view turnaround, when the S0 spend is made (storyboard §10). */
  nara: { file: 'nara.glb', heightM: 1.7, copy: 'Tying the head-wrap…', missing: true },
}

function base(): string {
  if (typeof document === 'undefined') return './'
  const b = document.querySelector('base')?.getAttribute('href')
  if (b) return b
  const href = window.location.href.split('#')[0].split('?')[0]
  return href.replace(/[^/]*$/, '')
}

export function worldMeshUrl(id: WorldMeshId): string {
  return `${base()}${MODELS}${WORLD_MESHES[id].file}`
}

/** `?standins=1` keeps the grey-box on screen — the suite and weak tiers use it. */
let disabled = typeof window !== 'undefined' && /(\?|&)standins=1/.test(window.location.search)
export function setWorldAssetsDisabled(v: boolean): void {
  disabled = v
}
export function worldAssetsDisabled(): boolean {
  return disabled
}

export type LoadedMesh = {
  /** Normalised: pivot at the base, centred on x/z, scaled to the manifest size. */
  group: THREE.Group
  /** Clips baked into the file (the explorer's idle), untouched. */
  clips: THREE.AnimationClip[]
}

const cache = new Map<WorldMeshId, Promise<LoadedMesh | null>>()

let loader: GLTFLoader | null = null
function gltfLoader(): GLTFLoader {
  if (!loader) {
    loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
  }
  return loader
}

const TIMEOUT_MS = 15_000

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      () => {
        clearTimeout(t)
        resolve(null)
      },
    )
  })
}

function normalise(id: WorldMeshId, gltf: GLTF): LoadedMesh {
  const spec = WORLD_MESHES[id]
  const scene = gltf.scene
  // A rigged file measures wrong mid-pose; the bind pose is what the box should see.
  scene.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(scene)
  const size = new THREE.Vector3()
  box.getSize(size)
  const k = spec.heightM ? spec.heightM / Math.max(size.y, 1e-6) : (spec.widthM ?? 1) / Math.max(size.x, size.z, 1e-6)
  const center = new THREE.Vector3()
  box.getCenter(center)
  const holder = new THREE.Group()
  const c = spec.center === false
  holder.position.set(c ? 0 : -center.x * k, -box.min.y * k, c ? 0 : -center.z * k)
  holder.scale.setScalar(k)
  holder.add(scene)
  scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) {
      m.castShadow = true
      m.receiveShadow = true
      // A skinned mesh culled by its bind-pose bounds vanishes mid-walk.
      if ((m as THREE.SkinnedMesh).isSkinnedMesh) m.frustumCulled = false
    }
  })
  const group = new THREE.Group()
  group.rotation.y = spec.yaw ?? 0
  group.add(holder)
  return { group, clips: gltf.animations ?? [] }
}

/** Clip-only files (skeleton + animation, no mesh) that ride the explorer's rig by bone name. */
export const WORLD_CLIPS: Record<string, string> = {
  idle: 'explorer-idle.glb',
  walk: 'explorer-walk.glb',
  jump: 'explorer-jump.glb',
}

const clipCache = new Map<string, Promise<THREE.AnimationClip[]>>()

export function loadWorldClips(name: keyof typeof WORLD_CLIPS): Promise<THREE.AnimationClip[]> {
  if (disabled) return Promise.resolve([])
  const cached = clipCache.get(name)
  if (cached) return cached
  const p = withTimeout(
    gltfLoader()
      .loadAsync(`${base()}${MODELS}${WORLD_CLIPS[name]}`)
      .then((gltf) => gltf.animations.map((c) => { c.name = name; return c })),
    TIMEOUT_MS,
  ).then((r) => r ?? [])
  clipCache.set(name, p)
  return p
}

/**
 * Loads once per id and shares the promise. Callers that need their own copy
 * (several ingots) should `SkeletonUtils.clone` or `clone()` the group; the
 * scene's `Prop` does that for static props.
 */
export function loadWorldMesh(id: WorldMeshId): Promise<LoadedMesh | null> {
  if (disabled || WORLD_MESHES[id].missing) return Promise.resolve(null)
  const cached = cache.get(id)
  if (cached) return cached
  const p = withTimeout(
    gltfLoader()
      .loadAsync(worldMeshUrl(id))
      .then((gltf) => normalise(id, gltf)),
    TIMEOUT_MS,
  )
  cache.set(id, p)
  return p
}

/* ---------------------------------------------------------------------------
 * Batch 2 — the place around the things. Nothing here has a verb, so nothing
 * here is a mesh: painted stills on white, keyed out, served as WebP and put
 * on procedural geometry (the wall texture) or on flat cards (the rest).
 * Signage carries no lettering; the words are drawn on at runtime from
 * `lib/worldtext.ts`, the language file's slot.
 * ------------------------------------------------------------------------ */

export type WorldTextureId =
  | 'wall'
  | 'banner'
  | 'rack'
  | 'landing-card'
  | 'ancient-card'
  // batch 3 — S0, the Landing plot (Selorm's generator, 2026-09-23)
  | 'landing-cutout'
  | 'landing-cutout-lit'
  | 'store-card'
  | 'codex-page'
  | 'cassava-up'
  | 'cassava-down'
  | 'soil-dry'
  | 'soil-wet'
  | 'path'
  | 'water'

export type WorldTextureSpec = {
  file: string
  /** Width over height of the keyed image — the card's plane is cut to it. */
  aspect: number
  /** Tiling texture: mirror-repeat, `metres` per tile. */
  metres?: number
}

export const WORLD_TEXTURES: Record<WorldTextureId, WorldTextureSpec> = {
  wall: { file: 'wall.webp', aspect: 1, metres: 2.6 },
  banner: { file: 'banner.webp', aspect: 400 / 768 },
  rack: { file: 'rack.webp', aspect: 1024 / 733 },
  'landing-card': { file: 'landing-card.webp', aspect: 732 / 1024 },
  'ancient-card': { file: 'ancient-card.webp', aspect: 1280 / 681 },
  'landing-cutout': { file: 'landing-cutout.webp', aspect: 1280 / 720 },
  'landing-cutout-lit': { file: 'landing-cutout-lit.webp', aspect: 1280 / 720 },
  'store-card': { file: 'store-card.webp', aspect: 1024 / 683 },
  'codex-page': { file: 'codex-page.webp', aspect: 1 },
  'cassava-up': { file: 'cassava-up.webp', aspect: 1 },
  'cassava-down': { file: 'cassava-down.webp', aspect: 1 },
  'soil-dry': { file: 'soil-dry.webp', aspect: 1, metres: 1.2 },
  'soil-wet': { file: 'soil-wet.webp', aspect: 1, metres: 1.2 },
  path: { file: 'path.webp', aspect: 1, metres: 2.2 },
  water: { file: 'water.webp', aspect: 1, metres: 9 },
}

/** Portraits for the HUD's talk cards — plain image URLs, beside the textures. */
export const PORTRAITS = {
  nara: 'nara.webp',
  sela: 'sela.webp',
} as const

export function portraitUrl(who: keyof typeof PORTRAITS): string {
  return `${base()}${MODELS}${PORTRAITS[who]}`
}

const texCache = new Map<WorldTextureId, Promise<THREE.Texture | null>>()
let texLoader: THREE.TextureLoader | null = null

export function loadWorldTexture(id: WorldTextureId): Promise<THREE.Texture | null> {
  if (disabled) return Promise.resolve(null)
  const cached = texCache.get(id)
  if (cached) return cached
  if (!texLoader) texLoader = new THREE.TextureLoader()
  const spec = WORLD_TEXTURES[id]
  const p = withTimeout(
    texLoader.loadAsync(`${base()}${MODELS}${spec.file}`).then((t) => {
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 4
      if (spec.metres) t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping
      return t
    }),
    TIMEOUT_MS,
  )
  texCache.set(id, p)
  return p
}
