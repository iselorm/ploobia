import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import ploobUrl from '@/assets/ploob.glb?url'
import type { PloobTint } from './Ploob'

/**
 * Ploob3D — the real model, dropped into any cabinet.
 *
 * `ploob.glb` is the sculpted Ploobian, optimised to ~180 KB (meshopt geometry
 * + WebP textures) and inlined into the single-file build as a data URI.
 *
 * Two things must always be done to it:
 *
 * 1. **Sanitise the materials.** The generator exports roughness 0.9, opaque,
 *    no clearcoat — which throws away the entire reason Ploob is made of
 *    jelly. Keep the base-colour map (the eyes are baked into it) and rebuild
 *    the material as physical jelly. A little `emissive` is not decoration: it
 *    stops the amber reading as dull olive under ACES tone mapping.
 * 2. **Tint by region.** The map is amber, so a region tint is a hue rotation
 *    applied in the fragment shader, skipping near-neutral pixels so the eyes
 *    stay black and white.
 *
 * The model has no rig and no morph targets, so all life comes from the
 * transform: an idle squish, a slow bob, and a yaw toward the camera.
 */

export type { PloobTint }

/** Target hue (0–1) per tint. `gold` is the texture's own hue: no shift. */
const HUE: Record<PloobTint, number | null> = {
  gold: null,
  green: 0.28,
  red: 0.99,
  blue: 0.58,
  violet: 0.74,
}

const ATTENUATION: Record<PloobTint, string> = {
  gold: '#E8A33D',
  green: '#4E9A4A',
  red: '#C13B33',
  blue: '#2E6DA8',
  violet: '#7B57C8',
}

/**
 * Rewrite the fragment shader to rotate the hue of saturated pixels only.
 * Anything close to grey — the whites of the eyes, the pupils — is left alone.
 */
function applyHueShift(material: THREE.Material, hue: number) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHue = { value: hue }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uHue;
         vec3 ploobHue(vec3 c){
           float mx = max(c.r, max(c.g, c.b));
           float mn = min(c.r, min(c.g, c.b));
           float d  = mx - mn;
           float sat = mx > 0.0 ? d / mx : 0.0;
           // Leave the eyes (near-neutral, or very dark) exactly as painted.
           if (sat < 0.22 || mx < 0.18) return c;
           // The source map is a single amber hue, so the shift is a
           // replacement rather than a rotation: keep value and saturation,
           // take the region's hue.
           float h = uHue * 6.0;
           float f = h - floor(h);
           float p = mx * (1.0 - sat);
           float q = mx * (1.0 - f * sat);
           float t = mx * (1.0 - (1.0 - f) * sat);
           int i = int(mod(floor(h), 6.0));
           if (i == 0) return vec3(mx, t, p);
           if (i == 1) return vec3(q, mx, p);
           if (i == 2) return vec3(p, mx, t);
           if (i == 3) return vec3(p, q, mx);
           if (i == 4) return vec3(t, p, mx);
           return vec3(mx, p, q);
         }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         diffuseColor.rgb = ploobHue(diffuseColor.rgb);`,
      )
  }
  material.needsUpdate = true
}

interface Props {
  position?: [number, number, number]
  /** Height of the whole creature in world units (feet on `position`). */
  height?: number
  tint?: PloobTint
  /** Extra inner glow, 0–1 — Ploob as a little lantern at dusk. */
  glow?: number
  /** Eased size multiplier: a Ploob in the desert is a Ploob drying out. */
  size?: number
  /** Turn to face the camera. Off for a Ploob that belongs to the scenery. */
  faceCamera?: boolean
  /** Fixed yaw when `faceCamera` is off. */
  rotationY?: number
}

export default function PloobModel({
  position = [0, 0, 0],
  height = 1.4,
  tint = 'gold',
  glow = 0,
  size = 1,
  faceCamera = true,
  rotationY = 0,
}: Props) {
  const camera = useThree((s) => s.camera)
  const gltf = useLoader(GLTFLoader, ploobUrl, (loader) => {
    ;(loader as GLTFLoader).setMeshoptDecoder(MeshoptDecoder)
  })

  /** One private copy per instance, with its own sanitised materials. */
  const model = useMemo(() => {
    const root = gltf.scene.clone(true)
    const hue = HUE[tint]
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const map = (mesh.material as THREE.MeshStandardMaterial).map
      const mat = new THREE.MeshPhysicalMaterial({
        map,
        metalness: 0,
        roughness: 0.09,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        transmission: 0.4,
        thickness: 0.5,
        ior: 1.44,
        attenuationColor: new THREE.Color(ATTENUATION[tint]),
        attenuationDistance: 1.1,
        sheen: 0.35,
        sheenColor: new THREE.Color('#FFF6DC'),
        specularIntensity: 1,
        emissive: new THREE.Color(ATTENUATION[tint]),
        emissiveMap: map,
        emissiveIntensity: 0.3,
        side: THREE.FrontSide,
      })
      if (hue !== null) applyHueShift(mat, hue)
      mesh.material = mat
      mesh.castShadow = true
    })
    // Normalise: 1 unit tall, feet on the origin, centred in x/z.
    const box = new THREE.Box3().setFromObject(root)
    const span = box.getSize(new THREE.Vector3())
    const centre = box.getCenter(new THREE.Vector3())
    const k = 1 / Math.max(span.y, 1e-6)
    root.scale.setScalar(k)
    root.position.set(-centre.x * k, -box.min.y * k, -centre.z * k)
    return root
  }, [gltf, tint])

  useEffect(
    () => () => {
      model.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (mesh.isMesh) (mesh.material as THREE.Material).dispose()
      })
    },
    [model],
  )

  const group = useRef<THREE.Group>(null)
  const eased = useRef(size)
  const clock = useRef(0)

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    // Desynchronise several Ploobs without reaching for Math.random().
    if (clock.current === 0) clock.current = position[0] * 1.7 + position[2] * 0.9 + 0.001
    clock.current += dt
    const t = clock.current
    const g = group.current
    if (!g) return

    eased.current += (size - eased.current) * (1 - Math.exp(-dt * 2))
    const s = eased.current * height
    const squish = Math.sin(t * 2.1) * 0.028
    g.scale.set(s * (1 + squish), s * (1 - squish), s * (1 + squish))
    g.position.set(position[0], position[1] + Math.abs(Math.sin(t * 1.0)) * 0.035 * height, position[2])
    g.rotation.y = faceCamera
      ? Math.atan2(camera.position.x - position[0], camera.position.z - position[2])
      : rotationY
  })

  // Glow is a live property: dusk can turn Ploob into a lantern mid-scene.
  useEffect(() => {
    model.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const mat = mesh.material as THREE.MeshPhysicalMaterial
      mat.emissiveIntensity = 0.3 + glow * 0.9
      mat.transmission = 0.4 + glow * 0.2
    })
  }, [model, glow])

  return (
    <group ref={group} position={position}>
      <primitive object={model} />
    </group>
  )
}
