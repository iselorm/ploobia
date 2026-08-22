import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import type { WorldState } from '@/lib/world'
import { useQualityCaps } from '@/lib/quality'
import {
  channelW,
  COURSE,
  DELTA0,
  floodplainW,
  GORGE0,
  GORGE1,
  meanderX,
  profileH,
  SEA_Y,
  tribCarve,
  valleyH,
  worldZ,
  type RiverSim,
} from '@/lib/river'

/**
 * The carved valley — a rectangular heightfield densest around the channel,
 * coloured by slope and moisture, with three extra layers baked in:
 *  - gorge strata: bands coloured by rock hardness (the waterfall's teacher),
 *  - fresh silt: a brown wash over the floodplain after a flood,
 *  - the living map: uniform uMap flattens the world into a paper map with
 *    contour lines, the blue channel and woodland stipple, then lifts it back.
 */

/** Height the flattened map sits at (a table under the camera). */
export const MAP_Y = 2.0

function axisSamples(min: number, max: number, dense0: number, dense1: number, fine: number, coarse: number): number[] {
  const xs: number[] = []
  let x = min
  while (x < max) {
    xs.push(x)
    const inDense = x >= dense0 && x <= dense1
    const edge = Math.min(Math.abs(x - dense0), Math.abs(x - dense1))
    x += inDense ? fine : Math.min(coarse, fine + (edge / 18) * coarse)
  }
  xs.push(max)
  return xs
}

function buildValley(quality: number) {
  const fine = quality >= 1 ? 0.8 : quality >= 0.7 ? 1.1 : 1.6
  const xs = axisSamples(-104, 104, -26, 26, fine, 6)
  const zs = axisSamples(-118, 138, -76, 88, fine * 1.15, 6)
  const nx = xs.length
  const nz = zs.length
  const count = nx * nz
  const positions = new Float32Array(count * 3)
  const normals = new Float32Array(count * 3)
  /** slope, moisture(dist-to-river 1→0), gorge-strata mask */
  const params = new Float32Array(count * 3)
  /** height (for contours), riverMask (in-channel), floodplain/silt mask */
  const extras = new Float32Array(count * 3)
  /** Baked concavity AO: hollows and the gorge base sit in their own shade. */
  const occ = new Float32Array(count)
  const index: number[] = []

  // ---- pass 1: positions (columns warped to follow the meanders) ----
  const xw = new Float32Array(count)
  let v = 0
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x0 = xs[i]
      const z = zs[j]
      const sWarp = THREE.MathUtils.clamp(z + 74, 0, COURSE)
      const warp = 1 - THREE.MathUtils.smoothstep(Math.abs(x0), 14, 34)
      const x = x0 + meanderX(sWarp) * warp
      const h = valleyH(x, z)
      xw[v] = x
      positions[v * 3] = x
      positions[v * 3 + 1] = h
      positions[v * 3 + 2] = z
      v++
    }
  }

  // ---- pass 2: normals from the ACTUAL grid neighbours ----
  // Sampling the height function at ±0.3 m gives micro-slopes that disagree
  // with metre-scale triangles: the lighting then breaks into false blades.
  const n = new THREE.Vector3()
  const ux = new THREE.Vector3()
  const uz = new THREE.Vector3()
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i
      const iL = i > 0 ? k - 1 : k
      const iR = i < nx - 1 ? k + 1 : k
      const jD = j > 0 ? k - nx : k
      const jU = j < nz - 1 ? k + nx : k
      ux.set(positions[iR * 3] - positions[iL * 3], positions[iR * 3 + 1] - positions[iL * 3 + 1], 0)
      uz.set(0, positions[jU * 3 + 1] - positions[jD * 3 + 1], positions[jU * 3 + 2] - positions[jD * 3 + 2])
      n.crossVectors(uz, ux).normalize()
      if (n.y < 0) n.negate()
      normals[k * 3] = n.x
      normals[k * 3 + 1] = n.y
      normals[k * 3 + 2] = n.z
    }
  }

  // ---- pass 3: shading params, from those same normals ----
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i
      const x = xw[k]
      const z = zs[j]
      const h = positions[k * 3 + 1]
      const s = THREE.MathUtils.clamp(z + 74, 0, COURSE)
      const lat = Math.abs(x - meanderX(s))
      const fp = floodplainW(s)
      const slope = 1 - normals[k * 3 + 1]
      const tc = tribCarve(x, z)
      const nearRiver = Math.max(1 - THREE.MathUtils.smoothstep(lat, 0, fp + 6), tc.mask * 0.9)
      const inGorge = s > GORGE0 - 2 && s < GORGE1 + 3 && lat < fp + 9 && h > profileH(s) + 0.6 ? 1 : 0
      params[k * 3] = slope
      params[k * 3 + 1] = nearRiver
      params[k * 3 + 2] = inGorge * THREE.MathUtils.smoothstep(slope, 0.28, 0.62)
      extras[k * 3] = h
      extras[k * 3 + 1] = 1 - THREE.MathUtils.smoothstep(lat, channelW(s) * 0.5, channelW(s) * 0.5 + 0.5)
      const deltaM = THREE.MathUtils.smoothstep(z, worldZ(DELTA0) - 4, worldZ(DELTA0) + 12)
      extras[k * 3 + 2] = Math.max(
        lat < fp ? 1 : Math.max(0, 1 - THREE.MathUtils.smoothstep(lat, fp, fp + 2)),
        Math.max(tc.mask * 0.8, deltaM * (h < SEA_Y + 0.5 ? 1 : 0.35)),
      )
      // Concavity AO from the grid itself (hollows sit in their own shade).
      const iL = i > 2 ? k - 3 : k
      const iR = i < nx - 3 ? k + 3 : k
      const jD = j > 2 ? k - 3 * nx : k
      const jU = j < nz - 3 ? k + 3 * nx : k
      const avg = (positions[iL * 3 + 1] + positions[iR * 3 + 1] + positions[jD * 3 + 1] + positions[jU * 3 + 1]) / 4
      occ[k] = THREE.MathUtils.clamp(1 + (h - avg) * 0.09, 0.55, 1.12)
    }
  }

  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a0 = j * nx + i
      const a1 = j * nx + i + 1
      const b0 = (j + 1) * nx + i
      const b1 = (j + 1) * nx + i + 1
      // Winding must make the TOP face front-facing: (a0,b0,b1) and (a0,b1,a1)
      // give +y normals for this x-major / z-minor grid. The polar terrain in
      // the Rate Lab uses the opposite order — copying it here rendered the
      // whole landscape back-faced, so only ridge undersides were visible.
      index.push(a0, b0, b1, a0, b1, a1)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geo.setAttribute('aParams', new THREE.BufferAttribute(params, 3))
  geo.setAttribute('aExtra', new THREE.BufferAttribute(extras, 3))
  geo.setAttribute('aOcc', new THREE.BufferAttribute(occ, 1))
  geo.setIndex(index)
  return geo
}

function makeValleyMaterial() {
  const uniforms = {
    uGrass: { value: new THREE.Color('#6FAE5A') },
    uRock: { value: new THREE.Color('#8B8A78') },
    uSand: { value: new THREE.Color('#B7A97D') },
    uMoisture: { value: 0.6 },
    uWet: { value: 0 },
    uSilt: { value: 0 },
  }
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, metalness: 0 })
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec3 aParams; attribute vec3 aExtra; attribute float aOcc;
        varying vec3 vParams; varying vec3 vExtra; varying vec3 vWPos; varying float vOcc;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vParams = aParams;
        vExtra = aExtra;
        vOcc = aOcc;
        vWPos = (modelMatrix * vec4(position, 1.0)).xyz;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uGrass; uniform vec3 uRock; uniform vec3 uSand;
        uniform float uMoisture; uniform float uWet; uniform float uSilt;
        varying vec3 vParams; varying vec3 vExtra; varying vec3 vWPos; varying float vOcc;
        float hashT(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noiseT(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(hashT(i), hashT(i+vec2(1,0)), f.x), mix(hashT(i+vec2(0,1)), hashT(i+vec2(1,1)), f.x), f.y); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float slope = vParams.x;
          float near = vParams.y;
          float strata = vParams.z;
          float alt = vWPos.y;
          // One noise lookup, reused everywhere below: this shader covers the
          // whole screen, so each extra sample costs a full frame's worth.
          float nA = noiseT(vWPos.xz * 0.42);
          float nB = noiseT(vWPos.xz * 1.7);
          float grain = nA * 0.5 + nB * 0.5;
          // Vegetation first: this is green country unless the basin is dry.
          float moist = clamp(0.42 + near * 0.45 + (uMoisture - 0.6) * 1.15, 0.0, 1.0);
          float dry = clamp(0.62 - moist * 1.05 + grain * 0.26, 0.0, 1.0);
          vec3 c = mix(uGrass, uSand, dry);
          // Uplands: cooler, sparser grass as you climb toward the watershed.
          c = mix(c, mix(uGrass * 0.78, uRock * 0.92, 0.45), smoothstep(26.0, 62.0, alt) * 0.8);
          // Bare rock only where it is genuinely steep, or high, or in the gorge.
          float bare = clamp(slope * 2.4 - 0.62 + grain * 0.16, 0.0, 1.0);
          bare = max(bare, smoothstep(58.0, 88.0, alt) * 0.75);
          c = mix(c, uRock * 0.88, clamp(max(bare, strata * 0.9), 0.0, 1.0));
          // Gorge strata: bands by height — pale hard caps over dark soft shale.
          float band = fract(vWPos.y * 0.9 + nA * 0.3);
          float hard = smoothstep(0.55, 0.65, band) * (1.0 - smoothstep(0.84, 0.95, band));
          vec3 strataC = mix(vec3(0.34, 0.25, 0.19), vec3(0.62, 0.55, 0.44), hard);
          strataC *= 0.9 + nB * 0.2;
          c = mix(c, strataC * (0.9 + grain * 0.2), clamp(strata, 0.0, 1.0) * 0.8);
          // Sand along the shoreline and over the delta.
          c = mix(c, uSand * 1.02, smoothstep(1.6, 0.35, alt) * vExtra.z * 0.55);
          // Fresh silt: the flood's gift, brushed over the floodplain.
          float siltMask = vExtra.z * uSilt;
          c = mix(c, vec3(0.42, 0.32, 0.20), clamp(siltMask * 0.85, 0.0, 1.0));
          c *= 0.94 + nA * 0.12;
          c *= vOcc;
          diffuseColor.rgb *= c;
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.55, uWet * clamp(vParams.y, 0.0, 1.0));`,
      )
  }
  mat.customProgramCacheKey = () => 'valley-v1'
  return { mat, uniforms }
}

export default function ValleyTerrain({ sim, world }: { sim: RiverSim; world: WorldState }) {
  const quality = useQualityCaps()
  const geo = useMemo(() => buildValley(quality.particleScale), [quality.particleScale])
  const { mat, uniforms } = useMemo(makeValleyMaterial, [])
  const meshRef = useRef<THREE.Mesh>(null)

  const groupRef = useRef<THREE.Group>(null)

  useFrame(() => {
    uniforms.uGrass.value.copy(world.grass)
    uniforms.uRock.value.copy(world.rock)
    uniforms.uSand.value.copy(world.sand)
    uniforms.uMoisture.value = world.moisture
    uniforms.uWet.value = Math.max(world.rain, sim.rainNow)
    uniforms.uSilt.value = sim.siltFresh
    // The living map: the relief presses flat (scale the GROUP — never the
    // mesh) while the drawn sheet fades in above it.
    if (groupRef.current) {
      const t = sim.mapT
      groupRef.current.scale.y = Math.max(0.015, 1 - t * 0.985)
      groupRef.current.position.y = t * MAP_Y
    }
  })

  return (
    <group ref={groupRef}>
      <mesh ref={meshRef} geometry={geo} material={mat} receiveShadow frustumCulled={false} />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* The map sheet — real cartography, painted once from the model      */
/* ------------------------------------------------------------------ */

const MAP_X0 = -54
const MAP_X1 = 54
const MAP_Z0 = -84
const MAP_Z1 = 94
const MAP_PW = 720
const MAP_PH = 1186
/** The sheet is a scaled survey — world metres × MAP_K on the table. */
export const MAP_K = 0.62

import { GAUGE_S, STATIONS, VILLAGE_S, fallsAt, oxbowCentre, CHECKPOINTS, TRIBUTARIES, tribPoint, tribW, DISTRIBUTARIES, distribX, distribZ, distribW, catchmentAt } from '@/lib/river'

function paintMap(ctx: CanvasRenderingContext2D): void {
  const px2x = (px: number) => MAP_X0 + ((MAP_X1 - MAP_X0) * px) / MAP_PW
  const py2z = (py: number) => MAP_Z0 + ((MAP_Z1 - MAP_Z0) * py) / MAP_PH
  const x2px = (x: number) => ((x - MAP_X0) / (MAP_X1 - MAP_X0)) * MAP_PW
  const z2py = (z: number) => ((z - MAP_Z0) / (MAP_Z1 - MAP_Z0)) * MAP_PH
  const mPerPx = (MAP_X1 - MAP_X0) / MAP_PW
  const img = ctx.createImageData(MAP_PW, MAP_PH)
  const d = img.data
  const noise = (x: number, z: number) => {
    const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453
    return s - Math.floor(s)
  }
  for (let py = 0; py < MAP_PH; py++) {
    for (let px = 0; px < MAP_PW; px++) {
      const x = px2x(px)
      const z = py2z(py)
      const h = valleyH(x, z)
      // Paper with a faint hypsometric tint.
      let r = 243
      let g = 233
      let b = 205
      const tint = THREE.MathUtils.clamp(h / 20, 0, 1)
      r -= tint * 26
      g -= tint * 34
      b -= tint * 30
      // Woods stipple on moister low ground.
      if (h < 8 && h > SEA_Y + 0.6 && noise(Math.floor(x * 1.6), Math.floor(z * 1.6)) > 0.84) {
        r = 168
        g = 196
        b = 152
      }
      // Contours: minor every 2 m, index every 10 m.
      const f2 = Math.abs((((h / 5) % 1) + 1) % 1 - 0.5)
      const f10 = Math.abs((((h / 25) % 1) + 1) % 1 - 0.5)
      const grad = Math.abs(valleyH(x + 0.4, z) - h) + Math.abs(valleyH(x, z + 0.4) - h)
      const wLine = Math.max(0.012, Math.min(0.055, grad * 0.1))
      if (f10 > 0.5 - wLine * 1.4) {
        r = 150
        g = 96
        b = 54
      } else if (f2 > 0.5 - wLine) {
        r = 189
        g = 148
        b = 102
      }
      // The sea and anything below sea level.
      if (h <= SEA_Y + 0.02) {
        r = 92
        g = 138
        b = 178
      }
      const i = (py * MAP_PW + px) * 4
      d[i] = r
      d[i + 1] = g
      d[i + 2] = b
      d[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)

  // Grid every 20 m.
  ctx.strokeStyle = 'rgba(90, 110, 130, 0.25)'
  ctx.lineWidth = 1
  for (let gx = Math.ceil(MAP_X0 / 20) * 20; gx <= MAP_X1; gx += 20) {
    ctx.beginPath()
    ctx.moveTo(x2px(gx), 0)
    ctx.lineTo(x2px(gx), MAP_PH)
    ctx.stroke()
  }
  for (let gz = Math.ceil(MAP_Z0 / 20) * 20; gz <= MAP_Z1; gz += 20) {
    ctx.beginPath()
    ctx.moveTo(0, z2py(gz))
    ctx.lineTo(MAP_PW, z2py(gz))
    ctx.stroke()
  }

  /* ---- the drainage network, drawn as a cartographer would ---- */
  const BLUE = '#5C8AB2'
  const stroke = (pts: Array<[number, number]>, wm: number) => {
    ctx.strokeStyle = BLUE
    ctx.lineWidth = Math.max(1.4, (wm / mPerPx) * 0.9)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    pts.forEach(([x, z], i) => (i ? ctx.lineTo(x2px(x), z2py(z)) : ctx.moveTo(x2px(x), z2py(z))))
    ctx.stroke()
  }
  // Main stem, widening downstream (drawn in segments so the width grows).
  for (let s0 = 2; s0 < DELTA0; s0 += 4) {
    const seg: Array<[number, number]> = []
    for (let s1 = s0; s1 <= Math.min(DELTA0, s0 + 4.2); s1 += 1) seg.push([meanderX(s1, 0), worldZ(s1)])
    stroke(seg, channelW((s0 + 2) as number))
  }
  // Tributaries.
  const tp = { x: 0, z: 0 }
  for (const tb of TRIBUTARIES) {
    for (let k = 0; k < 8; k++) {
      const seg: Array<[number, number]> = []
      for (let i = 0; i <= 3; i++) {
        tribPoint(tb, Math.min(1, (k + i / 3) / 8), tp)
        seg.push([tp.x, tp.z])
      }
      stroke(seg, tribW(tb, (k + 0.5) / 8) * 2)
    }
  }
  // Distributaries over the delta.
  for (const k of DISTRIBUTARIES) {
    const seg: Array<[number, number]> = []
    for (let i = 0; i <= 12; i++) seg.push([distribX(k, i / 12), distribZ(i / 12)])
    stroke(seg, distribW(k, 0.5) * 2)
  }

  /* ---- marks and labels ---- */
  const label = (text: string, x: number, z: number, size = 20, color = '#4A3A28', bold = true) => {
    ctx.font = `${bold ? 'bold ' : ''}${size}px Georgia, serif`
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.fillText(text, x2px(x), z2py(z))
  }
  const mark = (x: number, z: number, color: string) => {
    ctx.beginPath()
    ctx.arc(x2px(x), z2py(z), 6, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = '#3A2A1A'
    ctx.lineWidth = 1.4
    ctx.stroke()
  }
  // Tributary names, set along their courses.
  for (const tb of TRIBUTARIES) {
    tribPoint(tb, 0.42, tp)
    label(tb.name, tp.x + tb.side * 5.5, tp.z, 15, '#3A5A7A', false)
  }
  // Region labels.
  label('T H E   M O O R', 20, worldZ(14), 17, '#6A523A')
  label('T H E   G O R G E', meanderX(46, 0) + 17, worldZ(46), 17, '#6A523A')
  label('F L O O D P L A I N', meanderX(120, 0) + 22, worldZ(120), 16, '#6A523A')
  label('T H E   D E L T A', 0, worldZ(146), 17, '#2A4A6A')
  // Checkpoints.
  for (const cp of CHECKPOINTS) {
    const s = cp.id === 'falls' ? fallsAt(0) : cp.s
    mark(meanderX(s, 0) + channelW(s) / 2 + 1, worldZ(s), cp.id.startsWith('st') ? '#E8A33D' : '#7FB4D8')
  }
  for (const st of STATIONS) {
    label(st.id.replace('st', 'S'), meanderX(st.s, 0) + channelW(st.s) / 2 + 6, worldZ(st.s) + 1.5, 19, '#8A4A1A')
  }
  label('the falls', meanderX(fallsAt(0), 0) + 9, worldZ(fallsAt(0)) + 1, 16, '#3A5A7A', false)
  label('gauge', meanderX(GAUGE_S, 0) + 10, worldZ(GAUGE_S) - 3, 16, '#3A5A7A', false)
  // Village squares.
  ctx.fillStyle = '#8A5A3E'
  for (const hs of VILLAGE_S) {
    const hx = meanderX(hs, 0) + channelW(hs) / 2 + 4.2
    ctx.fillRect(x2px(hx) - 3.5, z2py(worldZ(hs)) - 3.5, 7, 7)
  }
  label('the village', meanderX(130, 0) + 15, worldZ(130), 16, '#6A4A32')
  const ox = oxbowCentre(0)
  label('ox-bow bend', ox.x + 14, ox.z, 15, '#6A523A', false)

  /* ---- title block, north arrow, scale bar ---- */
  ctx.font = 'bold 30px Georgia, serif'
  ctx.fillStyle = '#4A3A28'
  ctx.textAlign = 'left'
  ctx.fillText('THE RIVER BASIN', 22, 44)
  ctx.font = 'italic 16px Georgia, serif'
  ctx.fillText('surveyed by the learner · contours every 5 m', 22, 68)
  ctx.fillText(`${TRIBUTARIES.length} named tributaries · catchment ${(catchmentAt(COURSE) * 100).toFixed(0)}% at the mouth`, 22, 90)
  ctx.save()
  ctx.translate(MAP_PW - 40, 48)
  ctx.strokeStyle = '#4A3A28'
  ctx.fillStyle = '#4A3A28'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, 18)
  ctx.lineTo(0, -16)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(0, -18)
  ctx.lineTo(-6, -7)
  ctx.lineTo(6, -7)
  ctx.closePath()
  ctx.fill()
  ctx.font = 'bold 18px Georgia, serif'
  ctx.textAlign = 'center'
  ctx.fillText('N', 0, 34)
  ctx.restore()
  const sbx = 22
  const sby = MAP_PH - 26
  const sbw = x2px(MAP_X0 + 20) - x2px(MAP_X0)
  ctx.strokeStyle = '#4A3A28'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(sbx, sby)
  ctx.lineTo(sbx + sbw, sby)
  ctx.stroke()
  ctx.font = 'bold 15px Georgia, serif'
  ctx.textAlign = 'left'
  ctx.fillText('0', sbx - 2, sby - 8)
  ctx.fillText('20 m', sbx + sbw - 12, sby - 8)
}

export function MapSheet({ sim }: { sim: RiverSim }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.MeshBasicMaterial>(null)
  const painted = useRef(false)
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = MAP_PW
    c.height = MAP_PH
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  }, [])

  useFrame(() => {
    const on = sim.mapT > 0.02
    if (on && !painted.current) {
      painted.current = true
      const ctx = (tex.image as HTMLCanvasElement).getContext('2d')!
      paintMap(ctx)
      tex.needsUpdate = true
    }
    if (meshRef.current) meshRef.current.visible = sim.mapT > 0.35
    if (matRef.current) matRef.current.opacity = THREE.MathUtils.smoothstep(sim.mapT, 0.45, 1)
  })

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, MAP_Y + 0.55, 4]}
      visible={false}
      renderOrder={5}
    >
      <planeGeometry args={[(MAP_X1 - MAP_X0) * MAP_K, (MAP_Z1 - MAP_Z0) * MAP_K]} />
      <meshBasicMaterial ref={matRef} map={tex} transparent opacity={0} depthWrite={false} toneMapped={false} fog={false} />
    </mesh>
  )
}
