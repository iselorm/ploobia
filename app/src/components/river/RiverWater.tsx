import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { WorldState } from '@/lib/world'
import {
  BASIN_PRESETS,
  bedH,
  COURSE,
  DELTA0,
  DISTRIBUTARIES,
  distribW,
  distribX,
  distribZ,
  SEA_Y,
  TRIBUTARIES,
  tribH,
  tribPoint,
  tribW,

  fallsAt,
  FALLS_DROP,
  FALLS_S0,
  meanderX,
  oxbowCentre,
  oxbowT,
  profileH,
  turbidityNow,
  velocityAt,
  waterW,
  waterY,
  worldZ,
  type RiverSim,
} from '@/lib/river'

/* ------------------------------------------------------------------ */
/* The river ribbon — rebuilt every frame from the 1D model            */
/* ------------------------------------------------------------------ */

const S0 = 3
const DS = 0.55
const ROWS = Math.floor((DELTA0 + 2 - S0) / DS)
const ACROSS = 7

function makeWaterMaterial() {
  const uniforms = {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color('#3E6E86') },
    uFlood: { value: new THREE.Color('#7A6242') },
    uTurb: { value: 0.25 },
    uSilk: { value: 0 },
    uDay: { value: 1 },
    uFade: { value: 1 },
  }
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec3 aInfo; // speed, foam, edge(0 centre..1 bank)
      varying vec3 vInfo;
      varying vec2 vUvw;
      varying vec3 vWPos;
      void main() {
        vInfo = aInfo;
        vUvw = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor; uniform vec3 uFlood;
      uniform float uTurb; uniform float uSilk; uniform float uDay; uniform float uFade;
      varying vec3 vInfo; varying vec2 vUvw; varying vec3 vWPos;
      float hashW(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noiseW(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hashW(i), hashW(i+vec2(1,0)), f.x), mix(hashW(i+vec2(0,1)), hashW(i+vec2(1,1)), f.x), f.y); }
      void main() {
        float speed = vInfo.x;
        float foam = vInfo.y;
        float edge = vInfo.z;
        // Flow streaks scroll downstream at the local speed — the water itself
        // is the speedometer.
        float flowU = vUvw.y * 46.0 - uTime * speed * 3.2;
        float freq = mix(6.0, 1.6, uSilk);
        float n1 = noiseW(vec2(vUvw.x * 5.0, flowU) * vec2(1.0, freq) * 0.6);
        float n2 = noiseW(vec2(vUvw.x * 11.0 + 7.0, flowU * 1.7));
        vec3 deep = mix(uColor, uFlood, clamp(uTurb, 0.0, 1.0));
        vec3 c = deep * (0.75 + n1 * 0.35);
        // Thalweg sheen: the centre runs a little lighter and livelier.
        c += vec3(0.06, 0.08, 0.09) * (1.0 - edge) * (0.4 + n2 * 0.6) * uDay;
        // Foam: white water in the gorge, at the fall, at the flooded margins.
        float f = clamp(foam * (0.6 + n2 * 0.8), 0.0, 1.0);
        c = mix(c, vec3(0.92, 0.95, 0.96), f);
        // Sun glitter — cheap sparkle in place of true reflections.
        float g = pow(noiseW(vWPos.xz * 8.0 + vec2(uTime * 1.6, -uTime * 2.1)), 16.0);
        c += vec3(1.0, 0.95, 0.8) * g * uDay * (1.0 - uSilk) * 0.9;
        // Long-exposure: silky ribbons, gently brightened.
        c = mix(c, c * 1.25 + vec3(0.08), uSilk * 0.6);
        float alpha = (0.82 + f * 0.15) * uFade;
        gl_FragColor = vec4(c, alpha);
      }
    `,
  })
  return { mat, uniforms }
}

export default function RiverWater({ sim, world }: { sim: RiverSim; world: WorldState }) {
  const { mat, uniforms } = useMemo(makeWaterMaterial, [])
  const geo = useMemo(() => {
    const count = ROWS * ACROSS
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    g.setAttribute('aInfo', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    const uv = new Float32Array(count * 2)
    for (let r = 0; r < ROWS; r++) {
      for (let a = 0; a < ACROSS; a++) {
        const i = r * ACROSS + a
        uv[i * 2] = a / (ACROSS - 1)
        uv[i * 2 + 1] = (S0 + r * DS) / COURSE
      }
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    const index: number[] = []
    for (let r = 0; r < ROWS - 1; r++) {
      for (let a = 0; a < ACROSS - 1; a++) {
        const a0 = r * ACROSS + a
        const a1 = a0 + 1
        const b0 = a0 + ACROSS
        const b1 = b0 + 1
        index.push(a0, b1, b0, a0, a1, b1)
      }
    }
    g.setIndex(index)
    return g
  }, [])
  const waterCol = useMemo(() => new THREE.Color(), [])
  const floodCol = useMemo(() => new THREE.Color(), [])
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame((_, rawDt) => {
    void rawDt
    const pos = geo.attributes.position as THREE.BufferAttribute
    const info = geo.attributes.aInfo as THREE.BufferAttribute
    const years = sim.years
    const wfNow = fallsAt(years)
    for (let r = 0; r < ROWS; r++) {
      const s = S0 + r * DS
      const cx = meanderX(s, years)
      const z = worldZ(s)
      const y = waterY(sim, s)
      // The cascade spreads as it goes over the lip — the falls read wide and white.
      const fallsK = Math.exp(-Math.pow((s - wfNow) / 1.7, 2))
      const w = waterW(sim, s) * (1 + fallsK * 0.4)
      const v = velocityAt(sim, s)
      // Foam: steep bed (the falls, the gorge) + flood margins.
      const gradUp = profileH(s - 1.2, years) - profileH(s + 1.2, years)
      const foamBase = THREE.MathUtils.clamp((gradUp - 1.05) * 1.3, 0, 1) + fallsK * 0.55
      for (let a = 0; a < ACROSS; a++) {
        const t = a / (ACROSS - 1)
        const off = (t - 0.5) * w
        const i = r * ACROSS + a
        // Hug the bed near the banks so the ribbon meets the ground.
        const edge = Math.abs(t - 0.5) * 2
        pos.setXYZ(i, cx + off, y - edge * edge * 0.04, z)
        const foam = Math.min(1, foamBase + Math.max(0, edge - 0.82) * 2.2 * Math.min(1, v))
        info.setXYZ(i, v, foam, edge)
      }
    }
    pos.needsUpdate = true
    info.needsUpdate = true
    geo.computeBoundingSphere()

    const p = BASIN_PRESETS[sim.basin]
    waterCol.set(p.water)
    floodCol.set(p.waterFlood)
    uniforms.uColor.value.lerp(waterCol, 0.08)
    uniforms.uFlood.value.lerp(floodCol, 0.08)
    uniforms.uTime.value = sim.time
    uniforms.uTurb.value = turbidityNow(sim)
    uniforms.uSilk.value += ((sim.lens === 'lapse' ? 1 : 0) - uniforms.uSilk.value) * 0.06
    uniforms.uDay.value = world.daylight
    uniforms.uFade.value = Math.max(0, 1 - sim.mapT * 1.6)
    if (meshRef.current) meshRef.current.visible = sim.mapT < 0.9
  })

  return (
    <group>
      <mesh ref={meshRef} geometry={geo} material={mat} frustumCulled={false} renderOrder={2} />
      <Tributaries sim={sim} mat={mat} />
      <Distributaries sim={sim} mat={mat} />
      <Sea sim={sim} />
      <Waterfall sim={sim} world={world} />
      <Oxbow sim={sim} />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Tributaries — the network that makes the river                      */
/* ------------------------------------------------------------------ */

const TB_ROWS = 26
const TB_ACROSS = 5

/** One buffer for every tributary: each is a ribbon down its own valley. */
function Tributaries({ sim, mat }: { sim: RiverSim; mat: THREE.ShaderMaterial }) {
  const geo = useMemo(() => {
    const per = TB_ROWS * TB_ACROSS
    const count = per * TRIBUTARIES.length
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    g.setAttribute('aInfo', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    const uv = new Float32Array(count * 2)
    const index: number[] = []
    for (let tb = 0; tb < TRIBUTARIES.length; tb++) {
      const base = tb * per
      for (let r = 0; r < TB_ROWS; r++) {
        for (let a = 0; a < TB_ACROSS; a++) {
          const i = base + r * TB_ACROSS + a
          uv[i * 2] = a / (TB_ACROSS - 1)
          uv[i * 2 + 1] = (r / TB_ROWS) * 0.6
        }
        if (r < TB_ROWS - 1) {
          for (let a = 0; a < TB_ACROSS - 1; a++) {
            const a0 = base + r * TB_ACROSS + a
            index.push(a0, a0 + TB_ACROSS + 1, a0 + TB_ACROSS, a0, a0 + 1, a0 + TB_ACROSS + 1)
          }
        }
      }
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    g.setIndex(index)
    return g
  }, [])
  const ref = useRef<THREE.Mesh>(null)
  const pA = useMemo(() => ({ x: 0, z: 0 }), [])
  const pB = useMemo(() => ({ x: 0, z: 0 }), [])

  useFrame(() => {
    if (!ref.current) return
    ref.current.visible = sim.mapT < 0.9
    if (!ref.current.visible) return
    const pos = geo.attributes.position as THREE.BufferAttribute
    const info = geo.attributes.aInfo as THREE.BufferAttribute
    const per = TB_ROWS * TB_ACROSS
    // Tributaries rise with the storm too — the flood is basin-wide.
    const surge = 1 + Math.min(1.6, sim.qStorm * 0.5)
    for (let tbi = 0; tbi < TRIBUTARIES.length; tbi++) {
      const tb = TRIBUTARIES[tbi]
      const base = tbi * per
      for (let r = 0; r < TB_ROWS; r++) {
        const t = r / (TB_ROWS - 1)
        tribPoint(tb, Math.max(0, t - 0.004), pA)
        tribPoint(tb, Math.min(1, t + 0.004), pB)
        // Tangent → the across direction is its perpendicular.
        let nx = -(pB.z - pA.z)
        let nz = pB.x - pA.x
        const nl = Math.hypot(nx, nz) || 1
        nx /= nl
        nz /= nl
        tribPoint(tb, t, pA)
        const w = tribW(tb, t) * surge
        const bed = tribH(tb, t, sim.years)
        const y = bed + 0.12 + 0.2 * Math.pow(t, 0.7) * surge
        // Upland burns are steep and white; the tail is calmer.
        const v = 0.35 + 0.9 * (1 - t) * (0.6 + tb.share * 3)
        for (let a = 0; a < TB_ACROSS; a++) {
          const u = a / (TB_ACROSS - 1)
          const off = (u - 0.5) * 2 * w
          const i = base + r * TB_ACROSS + a
          const edge = Math.abs(u - 0.5) * 2
          pos.setXYZ(i, pA.x + nx * off, y - edge * edge * 0.03, pA.z + nz * off)
          info.setXYZ(i, v, Math.min(1, 0.45 * (1 - t) + Math.max(0, edge - 0.8) * 2), edge)
        }
      }
    }
    pos.needsUpdate = true
    info.needsUpdate = true
    geo.computeBoundingSphere()
  })

  return <mesh ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={2} />
}

/* ------------------------------------------------------------------ */
/* The delta — distributaries spreading over their own new land        */
/* ------------------------------------------------------------------ */

const DB_ROWS = 22
const DB_ACROSS = 5

function Distributaries({ sim, mat }: { sim: RiverSim; mat: THREE.ShaderMaterial }) {
  const geo = useMemo(() => {
    const per = DB_ROWS * DB_ACROSS
    const count = per * DISTRIBUTARIES.length
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    g.setAttribute('aInfo', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    const uv = new Float32Array(count * 2)
    const index: number[] = []
    for (let d = 0; d < DISTRIBUTARIES.length; d++) {
      const base = d * per
      for (let r = 0; r < DB_ROWS; r++) {
        for (let a = 0; a < DB_ACROSS; a++) {
          const i = base + r * DB_ACROSS + a
          uv[i * 2] = a / (DB_ACROSS - 1)
          uv[i * 2 + 1] = 0.9 + (r / DB_ROWS) * 0.1
        }
        if (r < DB_ROWS - 1) {
          for (let a = 0; a < DB_ACROSS - 1; a++) {
            const a0 = base + r * DB_ACROSS + a
            index.push(a0, a0 + DB_ACROSS + 1, a0 + DB_ACROSS, a0, a0 + 1, a0 + DB_ACROSS + 1)
          }
        }
      }
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    g.setIndex(index)
    return g
  }, [])
  const ref = useRef<THREE.Mesh>(null)

  useFrame(() => {
    if (!ref.current) return
    ref.current.visible = sim.mapT < 0.9
    if (!ref.current.visible) return
    const pos = geo.attributes.position as THREE.BufferAttribute
    const info = geo.attributes.aInfo as THREE.BufferAttribute
    const per = DB_ROWS * DB_ACROSS
    const surge = 1 + Math.min(1.2, sim.qStorm * 0.35)
    const vMouth = velocityAt(sim, DELTA0) * 0.5
    for (let d = 0; d < DISTRIBUTARIES.length; d++) {
      const k = DISTRIBUTARIES[d]
      const base = d * per
      for (let r = 0; r < DB_ROWS; r++) {
        const t = r / (DB_ROWS - 1)
        const x0 = distribX(k, Math.max(0, t - 0.01))
        const z0 = distribZ(Math.max(0, t - 0.01))
        const x1 = distribX(k, Math.min(1, t + 0.01))
        const z1 = distribZ(Math.min(1, t + 0.01))
        let nx = -(z1 - z0)
        let nz = x1 - x0
        const nl = Math.hypot(nx, nz) || 1
        nx /= nl
        nz /= nl
        const cx = distribX(k, t)
        const cz = distribZ(t)
        const w = distribW(k, t) * surge
        // The distributary surface eases down to sea level.
        const y = THREE.MathUtils.lerp(waterY(sim, DELTA0), SEA_Y + 0.02, Math.pow(t, 0.7))
        for (let a = 0; a < DB_ACROSS; a++) {
          const u = a / (DB_ACROSS - 1)
          const off = (u - 0.5) * 2 * w
          const i = base + r * DB_ACROSS + a
          const edge = Math.abs(u - 0.5) * 2
          pos.setXYZ(i, cx + nx * off, y - edge * edge * 0.02, cz + nz * off)
          info.setXYZ(i, vMouth * (1 - t * 0.5), Math.max(0, edge - 0.86) * 1.6, edge)
        }
      }
    }
    pos.needsUpdate = true
    info.needsUpdate = true
    geo.computeBoundingSphere()
  })

  return <mesh ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={2} />
}

/** The sea the river hands its load to — flat, patient, slightly turbid at the plume. */
function Sea({ sim }: { sim: RiverSim }) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null)
  const ref = useRef<THREE.Mesh>(null)
  const c = useMemo(() => new THREE.Color(), [])
  useFrame(() => {
    if (!ref.current || !matRef.current) return
    ref.current.visible = sim.mapT < 0.9
    ref.current.position.y = SEA_Y
    const p = BASIN_PRESETS[sim.basin]
    c.set('#2E5E78').lerp(new THREE.Color(p.waterFlood), turbidityNow(sim) * 0.35)
    matRef.current.color.lerp(c, 0.06)
    matRef.current.opacity = Math.max(0, 0.92 - sim.mapT * 1.4)
  })
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, SEA_Y, worldZ(COURSE) + 46]}>
      <planeGeometry args={[340, 120]} />
      <meshStandardMaterial ref={matRef} color="#2E5E78" transparent opacity={0.92} roughness={0.18} metalness={0.05} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ */
/* The waterfall — face, spray, mist and the honest rainbow            */
/* ------------------------------------------------------------------ */

function mistTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 32)
  g.addColorStop(0, 'rgba(240,248,252,0.55)')
  g.addColorStop(0.6, 'rgba(235,245,250,0.22)')
  g.addColorStop(1, 'rgba(235,245,250,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function rainbowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')!
  const bands = ['rgba(255,60,60,', 'rgba(255,160,40,', 'rgba(250,235,80,', 'rgba(90,200,90,', 'rgba(80,140,240,', 'rgba(150,90,220,']
  for (let i = 0; i < bands.length; i++) {
    ctx.strokeStyle = `${bands[i]}0.5)`
    ctx.lineWidth = 3.4
    ctx.beginPath()
    ctx.arc(64, 128, 52 - i * 3.6, Math.PI, Math.PI * 2)
    ctx.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const SPRAY_N = 160

function Waterfall({ sim, world }: { sim: RiverSim; world: WorldState }) {
  const group = useRef<THREE.Group>(null)
  const sprayRef = useRef<THREE.Points>(null)
  const mistTex = useMemo(mistTexture, [])
  const rainbowTex = useMemo(rainbowTexture, [])
  const rainbowMat = useRef<THREE.MeshBasicMaterial>(null)
  const mistMats = useRef<Array<THREE.SpriteMaterial | null>>([null, null, null])
  const { camera } = useThree()

  const churnRef = useRef<THREE.Mesh>(null)
  const churnMat = useRef<THREE.MeshBasicMaterial>(null)
  const spray = useMemo(() => {
    const pos = new Float32Array(SPRAY_N * 3)
    const seed = new Float32Array(SPRAY_N)
    for (let i = 0; i < SPRAY_N; i++) seed[i] = (i * 0.6180339887) % 1
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return { g, seed }
  }, [])
  const sprayMat = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: '#EAF4F8',
        size: 3,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        map: mistTex,
      }),
    [mistTex],
  )

  useFrame(() => {
    if (!group.current) return
    const wf = fallsAt(sim.years)
    const cx = meanderX(wf, sim.years)
    const z = worldZ(wf)
    const top = profileH(wf - 1.2, sim.years)
    const bottom = bedH(wf + 1.4, sim.years)
    group.current.position.set(cx, 0, z)
    group.current.visible = sim.mapT < 0.55
    // Spray particles cycle down the face.
    const pos = spray.g.attributes.position as THREE.BufferAttribute
    const h = top - bottom
    for (let i = 0; i < SPRAY_N; i++) {
      const t = (spray.seed[i] + sim.time * 0.55) % 1
      const wob = Math.sin(i * 12.9898 + sim.time * 2) * 0.22
      pos.setXYZ(i, (spray.seed[i] - 0.5) * 1.6 + wob * t, top - t * t * h - 0.1, 0.5 + t * 1.4)
    }
    pos.needsUpdate = true
    // The plunge pool churns white.
    if (churnRef.current) {
      churnRef.current.position.set(0, bottom + 0.1, 2.0)
      churnRef.current.visible = sim.mapT < 0.55
    }
    if (churnMat.current) churnMat.current.opacity = 0.5 + Math.sin(sim.time * 4.2) * 0.12
    // Mist breathes at the plunge pool — and gets out of the way of a close
    // camera instead of white-washing the whole frame.
    const camDist = Math.hypot(camera.position.x - cx, camera.position.y - (top + bottom) / 2, camera.position.z - z)
    const near = THREE.MathUtils.smoothstep(camDist, 4, 11)
    for (let m = 0; m < 3; m++) {
      const mm = mistMats.current[m]
      if (mm) mm.opacity = (0.24 + Math.sin(sim.time * 0.7 + m * 2.1) * 0.1) * near
    }
    sprayMat.opacity = 0.35 + near * 0.4
    // The rainbow appears only when the sun is out and you stand off-axis —
    // honest optics, lightly simplified.
    if (rainbowMat.current) {
      const clear = (1 - BASIN_PRESETS[sim.basin].haze * 0.6) * world.daylight
      const camDx = camera.position.x - cx
      const facing = THREE.MathUtils.clamp(Math.abs(camDx) / 8, 0, 1)
      rainbowMat.current.opacity = THREE.MathUtils.clamp(clear * (0.25 + facing * 0.5), 0, 0.8) * (sim.mapT < 0.4 ? 1 : 0)
    }
  })

  const top0 = profileH(FALLS_S0 - 1.2)
  const drop = FALLS_DROP + 0.8

  return (
    <group ref={group}>
      <points ref={sprayRef} geometry={spray.g} material={sprayMat} frustumCulled={false} />
      {/* the churning plunge pool */}
      <mesh ref={churnRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <circleGeometry args={[1.7, 26]} />
        <meshBasicMaterial ref={churnMat} color="#F2F7F9" transparent opacity={0.5} depthWrite={false} />
      </mesh>
      {[0, 1, 2].map((m) => (
        <sprite key={m} position={[(m - 1) * 0.9, top0 - drop + 0.6 + m * 0.2, 1.4 + m * 0.4]} scale={[1.9 + m * 0.6, 1.3 + m * 0.4, 1]}>
          <spriteMaterial ref={(el) => void (mistMats.current[m] = el)} map={mistTex} transparent depthWrite={false} opacity={0.3} />
        </sprite>
      ))}
      {/* The rainbow stands in the mist */}
      <mesh position={[0, top0 - drop + 1.6, 2.4]}>
        <planeGeometry args={[5, 2.5]} />
        <meshBasicMaterial ref={rainbowMat} map={rainbowTex} transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* The ox-bow lake — appears as the lens cuts the bend off             */
/* ------------------------------------------------------------------ */

function Oxbow({ sim }: { sim: RiverSim }) {
  const ref = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(() => {
    const t = oxbowT(sim.years)
    if (!ref.current || !matRef.current) return
    const c = oxbowCentre(sim.years)
    ref.current.visible = t > 0.05 && sim.mapT < 0.55
    ref.current.position.set(c.x, profileH(84, sim.years) + 0.08, c.z)
    matRef.current.opacity = t * 0.85
  })
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0.4]} visible={false}>
      <ringGeometry args={[1.3, 2.5, 40, 1, 0, Math.PI * 1.5]} />
      <meshStandardMaterial ref={matRef} color="#41616E" transparent opacity={0} roughness={0.15} side={THREE.DoubleSide} />
    </mesh>
  )
}
