import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { artUrl, loadTexture } from '@/lib/marketassets'
import type { MarketSim } from '@/lib/marketsim'
import { backCardStandIn } from './textures'

/**
 * The venue: Kejetia's alley as a place — sky dome, packed-earth ground, the
 * alley strip, one painted back card behind the fog, and a warm rig.
 *
 * Bright by rule (dark reads unfriendly); the one dark thing in the frame is
 * the chalk board, which is the thing that pops. Nothing here is more than a
 * handful of draw calls: the dome, the ground, the alley, the card.
 */

const SKY_VERT = `
varying float vH;
void main(){ vH = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const SKY_FRAG = `
uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; varying float vH;
void main(){
  float h = clamp(vH, -1.0, 1.0);
  vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, ground, pow(-h, 0.6));
  gl_FragColor = vec4(c, 1.0);
}`

function Sky({ late }: { late: boolean }) {
  const mat = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(
    () => ({
      top: { value: new THREE.Color('#9FC3E6') },
      horizon: { value: new THREE.Color('#EFD9BF') },
      ground: { value: new THREE.Color('#C79A66') },
    }),
    [],
  )
  const want = useMemo(
    () => ({
      top: new THREE.Color(late ? '#8FA6C9' : '#9FC3E6'),
      horizon: new THREE.Color(late ? '#EDC39C' : '#EFD9BF'),
      ground: new THREE.Color(late ? '#B9834F' : '#C79A66'),
    }),
    [late],
  )
  useFrame((_, rawDt) => {
    const k = 1 - Math.exp(-Math.min(rawDt, 0.05) * 1.2)
    uniforms.top.value.lerp(want.top, k)
    uniforms.horizon.value.lerp(want.horizon, k)
    uniforms.ground.value.lerp(want.ground, k)
  })
  return (
    <mesh scale={[60, 60, 60]} renderOrder={-10}>
      <sphereGeometry args={[1, 24, 14]} />
      <shaderMaterial ref={mat} vertexShader={SKY_VERT} fragmentShader={SKY_FRAG} uniforms={uniforms} side={THREE.BackSide} depthWrite={false} fog={false} />
    </mesh>
  )
}

/** The painted alley behind the stall — the generated card, or its stand-in. */
function BackCard({ late }: { late: boolean }) {
  const standIn = useMemo(() => backCardStandIn(late), [late])
  const [tex, setTex] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    let live = true
    loadTexture(artUrl(late ? 'kejetia-late' : 'kejetia-morning')).then((t) => {
      if (live) setTex(t)
    })
    return () => {
      live = false
    }
  }, [late])
  return (
    <mesh position={[3.5, 4.2, -14]} rotation={[0, -0.12, 0]} name="backcard" userData={{ generated: !!tex }}>
      <planeGeometry args={[28, 15.75]} />
      <meshBasicMaterial map={tex ?? standIn} toneMapped={false} fog />
    </mesh>
  )
}

export default function MarketWorld({ sim }: { sim: MarketSim }) {
  const [late, setLate] = useState(false)
  useFrame(() => {
    if (sim.late !== late) setLate(sim.late)
  })
  return (
    <group name="world">
      <Sky late={late} />
      {/* depth haze from the mid-ground back — the neighbours sit two stops behind the stall (review 1) */}
      <fog attach="fog" args={[late ? '#E6C39E' : '#EBD8BE', 6, 22]} />
      <hemisphereLight args={['#DDEBFF', '#9A6A3A', 0.95]} />
      <directionalLight
        position={late ? [-6, 5, 2] : [4, 7, 3]}
        intensity={late ? 2.6 : 3.1}
        color={late ? '#FFD39A' : '#FFF1D6'}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={20}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-bias={-0.0008}
      />
      <ambientLight intensity={0.35} color="#FFE9CF" />
      {/* packed earth */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#C79A66" roughness={1} metalness={0} />
      </mesh>
      {/* the alley: a lighter, trodden strip the shoppers walk */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, -2.3]} receiveShadow>
        <planeGeometry args={[30, 2.2]} />
        <meshStandardMaterial color="#D3AC7A" roughness={1} metalness={0} />
      </mesh>
      <BackCard late={late} />
    </group>
  )
}
