import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Bloom, DepthOfField, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import type { DepthOfFieldEffect } from 'postprocessing'
import { useQualityCaps } from '@/lib/quality'

/**
 * Focus, driven by how close you are rather than by which button you pressed.
 *
 * A macro shot has a shallow depth of field; a wide shot does not. Rather than
 * special-casing viewpoints, the blur is a function of the distance from the
 * camera to whatever it is orbiting: fly in to the leaf and the background
 * softens on its own, dolly back out and it sharpens. Focus sits on the orbit
 * target, which is the thing the shot is about, so the subject is never the
 * part that goes soft.
 */
function Focus() {
  const ref = useRef<DepthOfFieldEffect>(null)
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3 } | null
  const camera = useThree((s) => s.camera)
  const smoothed = useRef({ distance: 8, bokeh: 0 })

  useFrame((_, rawDt) => {
    const effect = ref.current
    if (!effect) return
    const dt = Math.min(rawDt, 0.05)
    const k = 1 - Math.exp(-dt * 3.5)
    const distance = controls ? camera.position.distanceTo(controls.target) : 8
    // Below ~6 units the shot is a close-up; below 2.5 it is a macro.
    const want = THREE.MathUtils.clamp((6 - distance) / 3, 0, 1)
    smoothed.current.distance += (distance - smoothed.current.distance) * k
    smoothed.current.bokeh += (want * 3.2 - smoothed.current.bokeh) * k
    const coc = effect.cocMaterial as unknown as { worldFocusDistance: number; worldFocusRange: number }
    coc.worldFocusDistance = smoothed.current.distance
    // Keep the whole subject sharp: the range grows with the distance to it.
    coc.worldFocusRange = 0.3 + smoothed.current.distance * 0.16
    effect.bokehScale = smoothed.current.bokeh
  })

  return <DepthOfField ref={ref} worldFocusDistance={8} worldFocusRange={1.6} bokehScale={0} resolutionScale={0.5} />
}

/**
 * The post chain, gated by quality tier. High tier: focus, bloom on the
 * luminous layer (sun, sparks, glowing thylakoids, molecule labels) and a soft
 * vignette. Medium: bloom only. Low: nothing — the scene must read as
 * intentional without it, which is why nothing structural depends on this.
 *
 * Cardboard stereo renders without any of it (two eyes cost two renders), so
 * everything that carries the *look* — contact occlusion, leaf translucency,
 * the sun shafts — lives in materials and geometry instead.
 */
export default function PostFX() {
  const quality = useQualityCaps()
  if (!quality.postFx && quality.maxDpr < 1.5) return null
  return (
    <EffectComposer multisampling={quality.antialias ? 4 : 0}>
      {quality.postFx ? <Focus /> : <></>}
      <Bloom
        mipmapBlur
        intensity={quality.postFx ? 0.55 : 0.35}
        luminanceThreshold={0.86}
        luminanceSmoothing={0.2}
        radius={0.6}
      />
      {quality.postFx ? <Vignette eskil={false} offset={0.28} darkness={0.55} /> : <></>}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}
