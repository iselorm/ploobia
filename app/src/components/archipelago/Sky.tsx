import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * Gradient sky dome + horizon-tinted fog — the house rule against a flat
 * background and a hard-edged ground disc. One draw call.
 */
export default function Sky({ top = '#8FBBE8', horizon = '#F3E4C4', fog = '#EDDDBE' }: { top?: string; horizon?: string; fog?: string }) {
  const mat = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uTop: { value: new THREE.Color(top) }, uHorizon: { value: new THREE.Color(horizon) } },
      vertexShader: `varying float vY; void main(){ vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uTop; uniform vec3 uHorizon; varying float vY; void main(){ float t = smoothstep(-0.05, 0.55, vY); gl_FragColor = vec4(mix(uHorizon, uTop, t), 1.0); }`,
    })
    return m
  }, [top, horizon])
  return (
    <>
      <mesh material={mat} frustumCulled={false} renderOrder={-10}>
        <sphereGeometry args={[220, 24, 12]} />
      </mesh>
      <fog attach="fog" args={[fog, 40, 190]} />
    </>
  )
}
