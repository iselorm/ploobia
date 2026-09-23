import { useEffect, useState } from 'react'
import type * as THREE from 'three'
import { loadWorldMesh, loadWorldTexture, type LoadedMesh, type WorldMeshId, type WorldTextureId } from '@/lib/worldassets'

/**
 * A generated prop with its procedural stand-in as children. The stand-in is
 * drawn at once; if the real mesh arrives (see `lib/worldassets.ts`) it takes
 * the stand-in's place with a short grow, footprint-matched by the manifest.
 * A load that fails or is switched off leaves the children alone.
 */
export function useWorldMesh(id: WorldMeshId, own = false): LoadedMesh | null {
  const [m, setM] = useState<LoadedMesh | null>(null)
  useEffect(() => {
    let live = true
    loadWorldMesh(id).then((r) => {
      if (!live || !r) return
      setM(own ? { group: r.group.clone(true), clips: r.clips } : r)
    })
    return () => {
      live = false
    }
  }, [id, own])
  return m
}

/** A generated texture, or null while it loads / when it is off — the caller keeps its flat colour until then. */
export function useWorldTexture(id: WorldTextureId): THREE.Texture | null {
  const [t, setT] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    let live = true
    loadWorldTexture(id).then((r) => {
      if (live && r) setT(r)
    })
    return () => {
      live = false
    }
  }, [id])
  return t
}
