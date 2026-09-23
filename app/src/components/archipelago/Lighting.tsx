import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { lightingFor, useSun, type LightZone } from '@/lib/looks'

/**
 * The world's lighting rig, driven by the Looks slider (`lib/looks.ts`):
 * sky dome, fog, ambient, hemisphere and the key light, all read from one
 * `sun` scalar. The sky's colours are uniforms updated in place — a slider
 * drag must not rebuild a shader per frame.
 */
export default function Lighting({ zone }: { zone: LightZone }) {
  const sun = useSun()
  const L = lightingFor(sun, zone)
  const scene = useThree((s) => s.scene)

  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { uTop: { value: new THREE.Color(L.sky.top) }, uHorizon: { value: new THREE.Color(L.sky.horizon) } },
        vertexShader: `varying float vY; void main(){ vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 uTop; uniform vec3 uHorizon; varying float vY; void main(){ float t = smoothstep(-0.05, 0.55, vY); gl_FragColor = vec4(mix(uHorizon, uTop, t), 1.0); }`,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  useEffect(() => {
    ;(mat.uniforms.uTop.value as THREE.Color).set(L.sky.top)
    ;(mat.uniforms.uHorizon.value as THREE.Color).set(L.sky.horizon)
  }, [mat, L.sky.top, L.sky.horizon])

  // The fog is the scene's; set it once and move its colour and distances.
  const fog = useRef<THREE.Fog | null>(null)
  useEffect(() => {
    const f = new THREE.Fog(L.sky.fog, L.fog[0], L.fog[1])
    fog.current = f
    scene.fog = f
    return () => {
      if (scene.fog === f) scene.fog = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene])
  useEffect(() => {
    const f = fog.current
    if (!f) return
    f.color.set(L.sky.fog)
    f.near = L.fog[0]
    f.far = L.fog[1]
  }, [L.sky.fog, L.fog])

  return (
    <>
      <mesh material={mat} frustumCulled={false} renderOrder={-10}>
        <sphereGeometry args={[220, 24, 12]} />
      </mesh>
      <ambientLight intensity={L.ambient.intensity} color={L.ambient.color} />
      <hemisphereLight args={[L.hemi.sky, L.hemi.ground, L.hemi.intensity]} />
      <directionalLight
        position={L.key.position}
        intensity={L.key.intensity}
        color={L.key.color}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-bias={-0.0008}
      />
    </>
  )
}

/**
 * A lamp: a warm point light on a post or bracket, up as the sun goes down.
 * The head glows so the light has a source to be seen from.
 */
export function Lamp({ position, up, distance = 9, power = 6 }: { position: [number, number, number]; up: number; distance?: number; power?: number }) {
  const on = up > 0.02
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.13, 10, 8]} />
        <meshStandardMaterial color="#FFE2A8" emissive="#FFC46A" emissiveIntensity={up * 3} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.16, 0]}>
        <coneGeometry args={[0.24, 0.16, 12, 1, true]} />
        <meshStandardMaterial color="#3A2E24" roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
      {on && <pointLight intensity={up * power} distance={distance} decay={1.6} color="#FFC46A" />}
    </group>
  )
}
