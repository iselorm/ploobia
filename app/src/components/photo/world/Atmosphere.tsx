import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { PhotoSim } from '@/lib/photo'
import type { WorldState } from '@/lib/world'
import { useQualityCaps } from '@/lib/quality'

/* ------------------------------------------------------------------ */
/* Sky dome: six stops on an 8×512 canvas, repainted only when moved   */
/* ------------------------------------------------------------------ */

const SKY_RADIUS = 160
const STOP_POS = [0, 0.3, 0.52, 0.68, 0.84, 1]

function paintSky(ctx: CanvasRenderingContext2D, stops: THREE.Color[]) {
  const grd = ctx.createLinearGradient(0, 0, 0, 512)
  for (let i = 0; i < 6; i++) grd.addColorStop(STOP_POS[i], `#${stops[i].getHexString()}`)
  ctx.fillStyle = grd
  ctx.fillRect(0, 0, 8, 512)
}

/**
 * Sky, stars, sun light rig, fog and a procedural environment map — all
 * driven by the interpolated `WorldState`. Nothing here is a switch.
 */
export default function Atmosphere({ sim, world }: { sim: PhotoSim; world: WorldState }) {
  const { scene, gl } = useThree()
  const quality = useQualityCaps()

  /* ---- sky canvas ---- */
  const { canvas, ctx, texture } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 8
    canvas.height = 512
    const ctx = canvas.getContext('2d')!
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = THREE.ClampToEdgeWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
    return { canvas, ctx, texture }
  }, [])
  void canvas
  const skyMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false }),
    [texture],
  )
  // Map the gradient's v onto elevation: top of canvas = zenith. The horizon
  // stop (0.84) lands slightly *below* the geometric horizon so fog and sky
  // meet without a line.
  const skyGeo = useMemo(() => {
    const geo = new THREE.SphereGeometry(SKY_RADIUS, 32, 24)
    const pos = geo.attributes.position
    const uv = geo.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / SKY_RADIUS // -1..1
      // elevation 1 → v=1 (top of canvas), horizon (0) → v≈0.16 (stop 0.84 from top)
      const v = THREE.MathUtils.clamp(0.16 + y * 0.84 + (y < 0 ? y * 0.16 : 0), 0, 1)
      uv.setXY(i, 0.5, v)
    }
    uv.needsUpdate = true
    return geo
  }, [])
  const lastSkyHash = useRef('')

  /* ---- stars: confined to the band the camera can see ---- */
  const stars = useMemo(() => {
    const classes = [
      { n: 2600, size: 1.2, a: 0.55 },
      { n: 900, size: 2.0, a: 0.8 },
      { n: 220, size: 3.1, a: 1 },
    ]
    return classes.map((c) => {
      const pos = new Float32Array(c.n * 3)
      for (let i = 0; i < c.n; i++) {
        // elevation 4°..75°, all azimuths (the camera can look almost anywhere)
        const el = THREE.MathUtils.degToRad(4 + Math.pow(Math.random(), 0.8) * 71)
        const az = Math.random() * Math.PI * 2
        const r = SKY_RADIUS * 0.96
        pos[i * 3] = Math.cos(el) * Math.sin(az) * r
        pos[i * 3 + 1] = Math.sin(el) * r
        pos[i * 3 + 2] = Math.cos(el) * Math.cos(az) * r
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      const mat = new THREE.PointsMaterial({
        color: '#F4F1FF',
        size: c.size * (typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio) : 1),
        sizeAttenuation: false,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      })
      return { geo, mat, base: c.a }
    })
  }, [])

  /* ---- environment map: tiny gradient probe through PMREM ---- */
  const envRef = useRef<{ rt: THREE.WebGLRenderTarget | null; data: Uint8Array; source: THREE.DataTexture; pmrem: THREE.PMREMGenerator } | null>(null)
  useEffect(() => {
    const width = 16
    const height = 32
    const data = new Uint8Array(width * height * 4)
    const source = new THREE.DataTexture(data, width, height)
    source.mapping = THREE.EquirectangularReflectionMapping
    source.colorSpace = THREE.SRGBColorSpace
    const pmrem = new THREE.PMREMGenerator(gl)
    envRef.current = { rt: null, data, source, pmrem }
    return () => {
      pmrem.dispose()
      source.dispose()
      envRef.current?.rt?.dispose()
      scene.environment = null
    }
  }, [gl, scene])
  const lastEnvHash = useRef('')

  /* ---- light rig ---- */
  const keyRef = useRef<THREE.DirectionalLight>(null)
  const fillRef = useRef<THREE.DirectionalLight>(null)
  const hemiRef = useRef<THREE.HemisphereLight>(null)
  const ambRef = useRef<THREE.AmbientLight>(null)
  const fog = useMemo(() => new THREE.Fog('#ffffff', 22, 70), [])
  const dir = useMemo(() => new THREE.Vector3(), [])
  const scratch = useMemo(() => new THREE.Color(), [])
  const shadowsOn = quality.shadows

  useEffect(() => {
    scene.fog = fog
    return () => {
      if (scene.fog === fog) scene.fog = null
    }
  }, [scene, fog])

  useFrame(() => {
    // Sky repaint only when the stops actually moved.
    const hash = world.sky.map((c) => c.getHex()).join(',')
    if (hash !== lastSkyHash.current) {
      lastSkyHash.current = hash
      paintSky(ctx, world.sky)
      texture.needsUpdate = true
      // Environment probe: zenith → horizon → ground, coarse, cheap.
      const env = envRef.current
      if (env) {
        const w = 16
        const h = 32
        const top = world.sky[1]
        const mid = world.sky[4]
        const ground = scratch.copy(world.grass).lerp(world.sand, 0.4).multiplyScalar(0.7)
        for (let y = 0; y < h; y++) {
          const t = y / (h - 1) // 0 = top row (zenith) .. 1 = bottom (nadir)
          const c =
            t < 0.5
              ? scratch.copy(top).lerp(mid, t / 0.5)
              : scratch.copy(mid).lerp(ground, (t - 0.5) / 0.5)
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4
            env.data[i] = c.r * 255
            env.data[i + 1] = c.g * 255
            env.data[i + 2] = c.b * 255
            env.data[i + 3] = 255
          }
        }
        // Rebuild at most every so often — PMREM is a few ms.
        const q = (c: THREE.Color) => `${Math.round(c.r * 12)}${Math.round(c.g * 12)}${Math.round(c.b * 12)}`
        const envHash = `${q(top)}-${q(mid)}-${Math.round(world.daylight * 6)}`
        if (envHash !== lastEnvHash.current) {
          lastEnvHash.current = envHash
          env.source.needsUpdate = true
          const rt = env.pmrem.fromEquirectangular(env.source)
          env.rt?.dispose()
          env.rt = rt
          scene.environment = rt.texture
          scene.environmentIntensity = 0.55 + world.daylight * 0.35
        }
      }
    }
    // Background follows the horizon stop; fog follows the horizon too.
    scene.background = world.sky[4]
    fog.color.copy(world.sky[4])
    fog.near = world.fogNear
    fog.far = world.fogFar

    // Sun rig.
    world.sunDirection(dir)
    const light = sim.light
    if (keyRef.current) {
      keyRef.current.position.copy(dir).multiplyScalar(30)
      keyRef.current.color.copy(world.sun)
      keyRef.current.intensity = 0.55 + light * 2.4 * (0.35 + world.daylight * 0.65)
    }
    if (fillRef.current) {
      fillRef.current.position.set(-dir.x * 20, 8, -dir.z * 20)
      fillRef.current.color.copy(world.sky[1])
      fillRef.current.intensity = 0.25 + world.daylight * 0.35
    }
    if (hemiRef.current) {
      hemiRef.current.color.copy(world.hemiSky)
      hemiRef.current.groundColor.copy(world.hemiGround)
      hemiRef.current.intensity = 0.35 + world.daylight * 0.5
    }
    if (ambRef.current) ambRef.current.intensity = 0.12 + world.daylight * 0.3

    for (const s of stars) s.mat.opacity = world.stars * s.base
  })

  return (
    <>
      <mesh geometry={skyGeo} material={skyMat} renderOrder={-10} frustumCulled={false} />
      {stars.map((s, i) => (
        <points key={i} geometry={s.geo} material={s.mat} frustumCulled={false} renderOrder={-9} />
      ))}
      <ambientLight ref={ambRef} intensity={0.3} color="#FFF6E0" />
      <hemisphereLight ref={hemiRef} args={['#CFEAF5', '#7CB56B', 0.6]} />
      <directionalLight
        ref={keyRef}
        position={[8, 10, 3]}
        intensity={1.6}
        color="#FFEFC4"
        castShadow={shadowsOn}
        shadow-mapSize-width={shadowsOn ? 2048 : 512}
        shadow-mapSize-height={shadowsOn ? 2048 : 512}
        shadow-camera-near={5}
        shadow-camera-far={70}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
      />
      <directionalLight ref={fillRef} position={[-8, 8, -3]} intensity={0.4} color="#DCE9F5" />
    </>
  )
}
