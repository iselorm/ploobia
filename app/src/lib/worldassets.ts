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

export type WorldMeshId = 'furnace' | 'crane' | 'crate' | 'ingot' | 'bellows' | 'explorer'

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
}

export const WORLD_MESHES: Record<WorldMeshId, WorldMeshSpec> = {
  furnace: { file: 'furnace.glb', widthM: 5.2, yaw: -Math.PI / 2, copy: 'Bricking the furnace…' },
  crane: { file: 'crane.glb', heightM: 6.2, yaw: Math.PI, center: false, copy: 'Raising the mast…' },
  crate: { file: 'crate.glb', widthM: 1.6, yaw: -Math.PI / 2, copy: 'Nailing the crate…' },
  ingot: { file: 'ingot.glb', widthM: 0.6, copy: 'Casting the ingot…' },
  bellows: { file: 'bellows.glb', widthM: 1.9, yaw: Math.PI, copy: 'Stitching the bellows…' },
  explorer: { file: 'explorer.glb', heightM: 1.45, copy: 'Lacing the boots…' },
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

/**
 * Loads once per id and shares the promise. Callers that need their own copy
 * (several ingots) should `SkeletonUtils.clone` or `clone()` the group; the
 * scene's `Prop` does that for static props.
 */
export function loadWorldMesh(id: WorldMeshId): Promise<LoadedMesh | null> {
  if (disabled) return Promise.resolve(null)
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
