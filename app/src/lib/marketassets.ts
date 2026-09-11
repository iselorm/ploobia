/**
 * The Market's generated assets — fetched on demand, never load-bearing.
 *
 * Every prop here was made through Higgsfield (see the vault brief and
 * `public/models/numberworks/manifest.json` for job ids, hashes, verbs and
 * states), repacked with gltf-transform to Meshopt + 768 px WebP, and served
 * beside the app as plain files rather than inlined into the single HTML.
 * A 2.5 MB arcade should not become a 4 MB one for one cabinet's furniture,
 * and the offline copy has no files beside it at all.
 *
 * So every asset has a **procedural stand-in** drawn by the scene, and this
 * module only ever *offers* the real thing: a load that fails, times out, or
 * is running on a tier that does not want it resolves to `null` and the scene
 * keeps its stand-in. Nothing waits on it; nothing breaks without it.
 *
 * The rule that decided what got generated in the first place: an asset earns
 * its place by what the learner can do to it — a verb and a state — which is
 * why the tomatoes (their *count* is the state) and the chalk board (its text
 * is the state) are procedural and not in this list.
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

export type MeshAssetId = 'basin' | 'till' | 'scale' | 'onions' | 'yam' | 'plantain'
export type ArtAssetId = 'kejetia-morning' | 'kejetia-late' | 'shopper-woman-basket' | 'shopper-man-bag' | 'shopper-elder-stick'
export type ThumbId = '1-market' | '2-algebra-machines' | '3-geometry-workshop' | '4-probability-fair' | '5-data-detective' | '6-modelling-studio'

/** Relative to the app's base (`./`), so it works at `/app/` and at the root alike. */
const MODELS = 'models/numberworks/'
const ART = 'art/numberworks/'

export const MESH_FILES: Record<MeshAssetId, { file: string; widthM: number; copy: string }> = {
  basin: { file: 'basin.glb', widthM: 0.55, copy: 'Filling the basin…' },
  till: { file: 'till.glb', widthM: 0.3, copy: 'Counting the till…' },
  scale: { file: 'scale.glb', widthM: 0.26, copy: 'Zeroing the scale…' },
  onions: { file: 'onions.glb', widthM: 0.4, copy: 'Stacking the onions…' },
  yam: { file: 'yam.glb', widthM: 0.5, copy: 'Tying the yam…' },
  plantain: { file: 'plantain.glb', widthM: 0.4, copy: 'Hanging the plantain…' },
}

export const ART_FILES: Record<ArtAssetId, string> = {
  'kejetia-morning': 'kejetia-morning.webp',
  'kejetia-late': 'kejetia-late.webp',
  'shopper-woman-basket': 'shopper-woman-basket.webp',
  'shopper-man-bag': 'shopper-man-bag.webp',
  'shopper-elder-stick': 'shopper-elder-stick.webp',
}

export const THUMB_FILES: Record<ThumbId, string> = {
  '1-market': '1-market.webp',
  '2-algebra-machines': '2-algebra-machines.webp',
  '3-geometry-workshop': '3-geometry-workshop.webp',
  '4-probability-fair': '4-probability-fair.webp',
  '5-data-detective': '5-data-detective.webp',
  '6-modelling-studio': '6-modelling-studio.webp',
}

/** Where the files live, from the page's point of view. Resolved once. */
function base(): string {
  if (typeof document === 'undefined') return './'
  const b = document.querySelector('base')?.getAttribute('href')
  if (b) return b
  // The app is one file at .../app/index.html (or opened straight from disk);
  // its siblings are the models and art folders.
  const href = window.location.href.split('#')[0].split('?')[0]
  return href.replace(/[^/]*$/, '')
}

export function meshUrl(id: MeshAssetId): string {
  return `${base()}${MODELS}${MESH_FILES[id].file}`
}
export function artUrl(id: ArtAssetId): string {
  return `${base()}${ART}${ART_FILES[id]}`
}
export function thumbUrl(id: ThumbId): string {
  return `${base()}${ART}thumbs/${THUMB_FILES[id]}`
}

/** Set by the test harness or a tier to keep the stand-ins on screen. */
let disabled = typeof window !== 'undefined' && /(\?|&)standins=1/.test(window.location.search)
export function setAssetsDisabled(v: boolean): void {
  disabled = v
}
export function assetsDisabled(): boolean {
  return disabled
}

const meshCache = new Map<MeshAssetId, Promise<THREE.Group | null>>()
const texCache = new Map<string, Promise<THREE.Texture | null>>()

let loader: GLTFLoader | null = null
function gltfLoader(): GLTFLoader {
  if (!loader) {
    loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
  }
  return loader
}

/** A short budget: a prop that has not arrived in this long is not worth the wait — the stand-in stays. */
const TIMEOUT_MS = 12_000

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

/**
 * The generated mesh, normalised: pivot at the base, scaled so its width is
 * `widthM` metres, centred on x/z. Materials are left as the PBR the generator
 * baked — the light in the market is the light they were made for.
 */
export function loadMesh(id: MeshAssetId): Promise<THREE.Group | null> {
  if (disabled) return Promise.resolve(null)
  const cached = meshCache.get(id)
  if (cached) return cached
  const p = withTimeout(
    gltfLoader()
      .loadAsync(meshUrl(id))
      .then((gltf) => {
        const root = new THREE.Group()
        const scene = gltf.scene
        const box = new THREE.Box3().setFromObject(scene)
        const size = new THREE.Vector3()
        box.getSize(size)
        const width = Math.max(size.x, size.z, 1e-6)
        const k = MESH_FILES[id].widthM / width
        const center = new THREE.Vector3()
        box.getCenter(center)
        scene.position.set(-center.x * k, -box.min.y * k, -center.z * k)
        scene.scale.setScalar(k)
        scene.traverse((o) => {
          const m = o as THREE.Mesh
          if (m.isMesh) {
            m.castShadow = true
            m.receiveShadow = true
          }
        })
        root.add(scene)
        return root
      }),
    TIMEOUT_MS,
  )
  meshCache.set(id, p)
  return p
}

/** A WebP painting or cutout, colour-managed for the scene. */
export function loadTexture(url: string): Promise<THREE.Texture | null> {
  if (disabled) return Promise.resolve(null)
  const cached = texCache.get(url)
  if (cached) return cached
  const p = withTimeout(
    new THREE.TextureLoader().loadAsync(url).then((t) => {
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 4
      return t
    }),
    TIMEOUT_MS,
  )
  texCache.set(url, p)
  return p
}
