import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import type { PhotoSim } from '@/lib/photo'
import type { WorldState } from '@/lib/world'
import { CLEARING, GROUND_Y } from '@/lib/world'
import { useQualityCaps } from '@/lib/quality'

/* ------------------------------------------------------------------ */
/* Sprites                                                            */
/* ------------------------------------------------------------------ */

function streakTexture() {
  const c = document.createElement('canvas')
  c.width = 16
  c.height = 64
  const ctx = c.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, 64)
  g.addColorStop(0, 'rgba(220,235,255,0)')
  g.addColorStop(0.5, 'rgba(220,235,255,0.9)')
  g.addColorStop(1, 'rgba(220,235,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(6, 0, 4, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
function ringTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  ctx.strokeStyle = 'rgba(235,245,255,0.9)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(32, 32, 24, 0, Math.PI * 2)
  ctx.stroke()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
function flakeTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 32
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(16, 16, 2, 16, 16, 16)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.7)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 32, 32)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * Rain and snow as one narrow, deep, tall volume carried in front of the
 * camera (a world-sized box would put almost every drop off screen). Density
 * is a draw range, never a new buffer. Snow that has *settled* is a separate
 * slow variable owned by WorldState (terrain and grass read it) — this file
 * only draws what is falling.
 */
export default function Weather({ sim, world }: { sim: PhotoSim; world: WorldState }) {
  const quality = useQualityCaps()
  const RAIN_N = Math.round(1800 * quality.particleScale)
  const SNOW_N = Math.round(900 * quality.particleScale)
  const W = 14
  const D = 26
  const TOP = 12

  const rain = useMemo(() => {
    const pos = new Float32Array(RAIN_N * 3)
    const vel = new Float32Array(RAIN_N)
    for (let i = 0; i < RAIN_N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * W
      pos[i * 3 + 1] = Math.random() * TOP
      pos[i * 3 + 2] = (Math.random() - 0.5) * D
      vel[i] = 9 + Math.random() * 5
    }
    const geo = new THREE.BufferGeometry()
    const attr = new THREE.Float32BufferAttribute(pos, 3)
    attr.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('position', attr)
    const mat = new THREE.PointsMaterial({
      map: streakTexture(),
      size: 0.55,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      color: '#DCE9FF',
    })
    return { geo, mat, pos: attr.array as Float32Array, vel, attr }
  }, [RAIN_N])

  const snow = useMemo(() => {
    const pos = new Float32Array(SNOW_N * 3)
    const seed = new Float32Array(SNOW_N * 2)
    for (let i = 0; i < SNOW_N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * W
      pos[i * 3 + 1] = Math.random() * TOP
      pos[i * 3 + 2] = (Math.random() - 0.5) * D
      seed[i * 2] = Math.random() * Math.PI * 2
      seed[i * 2 + 1] = 0.6 + Math.random() * 0.9
    }
    const geo = new THREE.BufferGeometry()
    const attr = new THREE.Float32BufferAttribute(pos, 3)
    attr.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('position', attr)
    const mat = new THREE.PointsMaterial({
      map: flakeTexture(),
      size: 0.16,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      color: '#FFFFFF',
    })
    return { geo, mat, pos: attr.array as Float32Array, seed, attr }
  }, [SNOW_N])

  const rainRef = useRef<THREE.Points>(null)
  const snowRef = useRef<THREE.Points>(null)
  // Splash rings on the clearing: what makes rain read as *falling* rain.
  const SPLASH_N = 48
  const splashRef = useRef<THREE.InstancedMesh>(null)
  const splashes = useMemo(
    () =>
      Array.from({ length: SPLASH_N }, () => ({
        x: 0,
        z: 0,
        t: Math.random(),
        speed: 1.6 + Math.random() * 1.2,
      })),
    [],
  )
  const ringTex = useMemo(() => ringTexture(), [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const anchor = useMemo(() => new THREE.Vector3(), [])
  const fwd = useMemo(() => new THREE.Vector3(), [])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const cam = state.camera
    cam.getWorldDirection(fwd)
    fwd.y = 0
    fwd.normalize()
    anchor.copy(cam.position).addScaledVector(fwd, D * 0.42)
    anchor.y = 0
    // The volume rides near the clearing, which is flat; a fixed floor is fine.
    const floor = GROUND_Y - 0.4

    // Rain
    const rp = rainRef.current
    if (rp) {
      const density = THREE.MathUtils.clamp((world.rain - 0.28) * 2.6, 0, 1)
      const n = Math.round(RAIN_N * density)
      rain.geo.setDrawRange(0, n)
      rp.visible = n > 0
      rp.position.copy(anchor)
      rp.rotation.y = Math.atan2(fwd.x, fwd.z)
      if (n > 0 && !sim.paused) {
        const wind = 0.9 + world.rain * 2.2
        for (let i = 0; i < n; i++) {
          let y = rain.pos[i * 3 + 1] - rain.vel[i] * dt * (0.8 + world.rain * 0.7)
          rain.pos[i * 3] += wind * dt * 0.35
          if (rain.pos[i * 3] > W / 2) rain.pos[i * 3] -= W
          if (y < floor) y = TOP + Math.random() * 2
          rain.pos[i * 3 + 1] = y
        }
        rain.attr.needsUpdate = true
      }
      rain.mat.opacity = 0.25 + density * 0.4
      rain.mat.size = 0.45 + world.rain * 0.4
    }

    // Splashes
    const sm = splashRef.current
    if (sm) {
      const density = THREE.MathUtils.clamp((world.rain - 0.28) * 2.6, 0, 1)
      const active = Math.round(SPLASH_N * density)
      sm.visible = active > 0
      for (let i = 0; i < SPLASH_N; i++) {
        const sp = splashes[i]
        if (i < active) {
          if (!sim.paused) sp.t += dt * sp.speed
          if (sp.t > 1) {
            sp.t = 0
            const r = Math.sqrt(Math.random()) * CLEARING * 0.7
            const a = Math.random() * Math.PI * 2
            sp.x = Math.cos(a) * r
            sp.z = Math.sin(a) * r
          }
          const grow = 0.08 + sp.t * 0.3
          dummy.position.set(sp.x, GROUND_Y + 0.02, sp.z)
          dummy.rotation.set(-Math.PI / 2, 0, 0)
          dummy.scale.set(grow, grow, 1)
        } else {
          dummy.scale.setScalar(0)
        }
        dummy.updateMatrix()
        sm.setMatrixAt(i, dummy.matrix)
      }
      sm.instanceMatrix.needsUpdate = true
      ;(sm.material as THREE.MeshBasicMaterial).opacity = 0.35 + density * 0.3
    }

    // Snow
    const sp = snowRef.current
    if (sp) {
      const density = THREE.MathUtils.clamp(world.snow * 1.2, 0, 1)
      const n = Math.round(SNOW_N * density)
      snow.geo.setDrawRange(0, n)
      sp.visible = n > 0
      sp.position.copy(anchor)
      if (n > 0 && !sim.paused) {
        const t = sim.time
        for (let i = 0; i < n; i++) {
          const s0 = snow.seed[i * 2]
          const s1 = snow.seed[i * 2 + 1]
          let y = snow.pos[i * 3 + 1] - s1 * dt * 1.1
          snow.pos[i * 3] += Math.sin(t * 0.8 + s0) * dt * 0.6 + dt * 0.25
          snow.pos[i * 3 + 2] += Math.cos(t * 0.6 + s0 * 1.3) * dt * 0.4
          if (snow.pos[i * 3] > W / 2) snow.pos[i * 3] -= W
          if (snow.pos[i * 3 + 2] > D / 2) snow.pos[i * 3 + 2] -= D
          if (y < floor) y = TOP + Math.random()
          snow.pos[i * 3 + 1] = y
        }
        snow.attr.needsUpdate = true
      }
    }
  })

  return (
    <>
      <points ref={rainRef} geometry={rain.geo} material={rain.mat} frustumCulled={false} />
      <points ref={snowRef} geometry={snow.geo} material={snow.mat} frustumCulled={false} />
      <instancedMesh ref={splashRef} args={[undefined, undefined, SPLASH_N]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={ringTex} transparent depthWrite={false} opacity={0.5} />
      </instancedMesh>
    </>
  )
}
