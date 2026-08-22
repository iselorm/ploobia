import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useQualityCaps } from '@/lib/quality'

/**
 * The post chain, gated by quality tier. High tier: bloom on the luminous
 * layer (sun, sparks, glowing thylakoids, molecule labels) plus a soft
 * vignette. Medium: bloom only. Low: nothing — the scene must read as
 * intentional without it, which is why nothing structural depends on this.
 */
export default function PostFX() {
  const quality = useQualityCaps()
  if (!quality.postFx && quality.maxDpr < 1.5) return null
  return (
    <EffectComposer multisampling={quality.antialias ? 4 : 0}>
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
