import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { getQualityCaps } from '@/lib/quality'
import type { SugarSim } from '@/lib/sugarsim'
import {
  HABITAT_FLOOR,
  HABITAT_GROUND,
  HABITAT_HORIZON,
  HABITAT_INNER,
  HABITAT_OUTER,
  habitatForSpecimen,
  sunPosition,
  type HabitatPreset,
} from '@/lib/sugarworld'
import { WORLD_PRESETS } from '@/lib/world'
import PloobModel from '@/components/brand/PloobModel'
import { moteSprite, skylineTexture } from './atlas'

/**
 * The place the specimen grows in.
 *
 * Everything here answers one worry: **does the scenery drown the subject on a
 * tablet?** The answers are structural rather than a matter of taste —
 *
 *  · Ground cover lives in an annulus that starts outside the learner's
 *    working radius, so it physically cannot stand in front of the plant.
 *  · Fog closes at 58 units and starts at 12, so the horizon is always a pale
 *    suggestion and the plant is always the only thing at full contrast.
 *  · Motion is house-standard *orderly*: one wind direction, one speed, no
 *    turbulence and no gusts. Fixed lanes read as calm; scatter reads as noise.
 *  · Every part is tiered, and the whole thing is one boolean away from the
 *    original white plate.
 *
 * Cost at the low tier is six draw calls and about twelve thousand triangles,
 * against a cabinet budget of 120 and 120k.
 */

/* ------------------------------------------------------------------ */
/* Ground height                                                      */
/* ------------------------------------------------------------------ */

/**
 * Gentle undulation, flat where it matters.
 *
 * The inner disc is held dead level so the root ball and the soil mound have
 * something honest to sit in; the swell only starts once the ground is behind
 * the plant. A visibly bumpy floor under the specimen would fight the cutaway.
 */
function groundHeight(x: number, z: number): number {
  const r = Math.hypot(x, z)
  const ease = THREE.MathUtils.smoothstep(r, HABITAT_INNER, HABITAT_INNER + 7)
  const swell =
    Math.sin(x * 0.14 + 1.3) * 0.55 +
    Math.cos(z * 0.11 - 0.7) * 0.48 +
    Math.sin((x + z) * 0.07) * 0.7
  return swell * ease
}

/* ------------------------------------------------------------------ */
/* Sky                                                                */
/* ------------------------------------------------------------------ */

/** Multiplied into the ground's vertex colours while the x-ray is fading it. */
const SOIL_VEIL = new THREE.Color('#7A5E42')
const WHITE = new THREE.Color('#FFFFFF')

const SKY_RADIUS = 150
const STOP_POS = [0, 0.3, 0.52, 0.68, 0.84, 1]

/**
 * A six-stop gradient dome.
 *
 * The stops lerp between the habitat's daylight and dusk palettes on the
 * cabinet's own light dial, so turning the light down actually turns the *day*
 * down — the plant does not simply get darker in a permanently blue afternoon.
 * The canvas is repainted only when the blend moves by a visible step, because
 * repainting a canvas texture every frame is a silent frame-rate tax.
 */
function SkyDome({ habitat, daylight }: { habitat: HabitatPreset; daylight: React.RefObject<number> }) {
  const dusk = WORLD_PRESETS[habitat.id].skyDusk

  const { ctx, texture } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 8
    canvas.height = 512
    const ctx = canvas.getContext('2d')!
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = THREE.ClampToEdgeWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
    return { ctx, texture }
  }, [])

  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(SKY_RADIUS, 24, 16)
    const pos = g.attributes.position
    const uv = g.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / SKY_RADIUS
      const v = THREE.MathUtils.clamp(0.16 + y * 0.84 + (y < 0 ? y * 0.16 : 0), 0, 1)
      uv.setXY(i, 0.5, v)
    }
    uv.needsUpdate = true
    return g
  }, [])

  const painted = useRef(-1)
  const colours = useMemo(
    () => ({
      day: habitat.sky.map((c) => new THREE.Color(c)),
      night: dusk.map((c) => new THREE.Color(c)),
      work: new THREE.Color(),
    }),
    [habitat, dusk],
  )

  const paint = (t: number) => {
    const grd = ctx.createLinearGradient(0, 0, 0, 512)
    for (let i = 0; i < 6; i++) {
      colours.work.copy(colours.night[i]).lerp(colours.day[i], t)
      grd.addColorStop(STOP_POS[i], `#${colours.work.getHexString()}`)
    }
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, 8, 512)
    texture.needsUpdate = true
  }

  // Paint once up front so the very first frame is never an unpainted canvas.
  useEffect(() => {
    painted.current = -1
    paint(daylight.current ?? 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habitat])

  useFrame(() => {
    const t = daylight.current ?? 1
    const step = Math.round(t * 16)
    if (step === painted.current) return
    painted.current = step
    paint(step / 16)
  })

  useEffect(() => () => { geo.dispose(); texture.dispose() }, [geo, texture])

  return (
    <mesh geometry={geo} frustumCulled={false} renderOrder={-10}>
      <meshBasicMaterial
        map={texture}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
        toneMapped={false}
      />
    </mesh>
  )
}

/* ------------------------------------------------------------------ */
/* Ground                                                             */
/* ------------------------------------------------------------------ */

/**
 * One polar heightfield, dense near the plant and coarse at the horizon.
 *
 * Colour is a vertex attribute rather than a texture: near ground takes the
 * habitat's soil colour, far ground drifts toward its sand and then into the
 * fog, which is what stops the disc having a visible rim.
 */
function Ground({ habitat }: { habitat: HabitatPreset }) {
  const quality = getQualityCaps()
  const camera = useThree((s) => s.camera)
  const matRef = useRef<THREE.MeshStandardMaterial>(null)
  const xray = useRef(0)
  const geo = useMemo(() => {
    const angular = quality.particleScale > 0.6 ? 56 : 40
    const radial = quality.particleScale > 0.6 ? 16 : 11
    const positions: number[] = []
    const normals: number[] = []
    const colors: number[] = []
    const index: number[] = []

    // Everything is pulled toward the habitat's own haze and away from full
    // saturation. The subject is a green plant; a fully saturated green field
    // behind it is the fastest way to lose the thing being measured.
    const hsl = { h: 0, s: 0, l: 0 }
    const near = new THREE.Color(habitat.soilNear)
    near.getHSL(hsl)
    near.setHSL(hsl.h, hsl.s * 0.5, Math.min(0.86, hsl.l * 1.34))
    const far = new THREE.Color(habitat.soilFar)
    far.getHSL(hsl)
    far.setHSL(hsl.h, hsl.s * 0.44, Math.min(0.88, hsl.l * 1.22))
    const fog = new THREE.Color(habitat.fogColor)
    // Bare, trodden ground immediately around the specimen — the patch a
    // botanist has cleared to work in. It also stops the plant's own green
    // sitting on top of the field's green.
    const bare = near.clone().lerp(new THREE.Color('#F0E7D2'), 0.42)
    const c = new THREE.Color()

    for (let r = 0; r <= radial; r++) {
      const t = r / radial
      // Cubic-ish spacing: lots of resolution where the learner is looking.
      const rad = 0.15 + (HABITAT_GROUND - 0.15) * Math.pow(t, 2.6)
      for (let a = 0; a < angular; a++) {
        const th = (a / angular) * Math.PI * 2
        const x = Math.cos(th) * rad
        const z = Math.sin(th) * rad
        const y = HABITAT_FLOOR + groundHeight(x, z)
        positions.push(x, y, z)
        const e = 0.4 + t * 2.2
        const hx = groundHeight(x + e, z) - groundHeight(x - e, z)
        const hz = groundHeight(x, z + e) - groundHeight(x, z - e)
        const n = new THREE.Vector3(-hx, 2 * e, -hz).normalize()
        normals.push(n.x, n.y, n.z)
        // Near → far → fog, with a slow wobble so the bands never read as rings.
        const mix = THREE.MathUtils.clamp(rad / 26 + Math.sin(x * 0.2) * 0.06, 0, 1)
        c.copy(near).lerp(far, mix)
        c.lerp(fog, THREE.MathUtils.smoothstep(rad, 26, HABITAT_GROUND * 0.85))
        // The cleared working patch, blended out over the last unit so it has
        // no rim — a hard-edged disc under the plant is a plinth by another name.
        c.lerp(bare, 1 - THREE.MathUtils.smoothstep(rad, HABITAT_INNER * 0.3, HABITAT_INNER * 1.15))
        colors.push(c.r, c.g, c.b)
      }
    }
    for (let r = 0; r < radial; r++) {
      for (let a = 0; a < angular; a++) {
        const a1 = (a + 1) % angular
        const i0 = r * angular + a
        const i1 = r * angular + a1
        const i2 = (r + 1) * angular + a
        const i3 = (r + 1) * angular + a1
        index.push(i0, i2, i1, i1, i2, i3)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    g.setIndex(index)
    return g
  }, [habitat, quality.particleScale])

  useEffect(() => () => geo.dispose(), [geo])

  /**
   * Duck below the surface and the ground goes to glass.
   *
   * The roots are half the cabinet — the sinks the sugar is actually walking
   * to — so burying them is not an option, but neither is standing the plant
   * on a plinth with its root ball dangling in the air once there is a field
   * around it. Two earlier passes tried to solve this by sectioning a block of
   * earth and both read as a chocolate drum with a bite out of it. Fading the
   * ground out as the camera drops below it costs one uniform, works from
   * every angle, and is how a soil pit is drawn in every field guide anyway.
   */
  useFrame((_, rawDt) => {
    const mat = matRef.current
    if (!mat) return
    // NOTE the inversion. `THREE.MathUtils.smoothstep(x, min, max)` early-returns
    // 1 for any `x >= max`, so passing reversed edges to "invert" it does not
    // invert anything — it returns 1 everywhere above the *lower* number. The
    // first pass wrote `smoothstep(y, 0.5, -0.15)` and got a permanently
    // transparent ground: the whole field was 14% opaque and showing sky
    // through itself, which is why the roots hung visibly in mid-air.
    const below = 1 - THREE.MathUtils.smoothstep(camera.position.y, -0.15, 0.9)
    xray.current += (below - xray.current) * (1 - Math.exp(-Math.min(rawDt, 0.05) * 5))
    mat.opacity = 1 - xray.current * 0.86
    mat.transparent = xray.current > 0.02
    mat.depthWrite = xray.current < 0.35
    // Tint toward earth as it fades, not just toward nothing. A ground plane
    // that only loses opacity leaves the roots pale-on-pale; a brown veil says
    // "you are looking *through* soil" and gives the root ball something to
    // read against, which is the entire point of going down there.
    mat.color.copy(SOIL_VEIL).lerp(WHITE, 1 - xray.current * 0.55)
  })

  return (
    <mesh geometry={geo} receiveShadow={quality.shadows} frustumCulled={false} renderOrder={-1}>
      <meshStandardMaterial
        ref={matRef}
        vertexColors
        roughness={0.94}
        metalness={0}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

/* ------------------------------------------------------------------ */
/* Horizon                                                            */
/* ------------------------------------------------------------------ */

/**
 * The silhouette band.
 *
 * Flat masks on a ring, each turned to face the middle of the scene. The
 * camera never leaves a 22-unit orbit and these stand at 44, so facing the
 * origin is indistinguishable from facing the camera and costs nothing per
 * frame. They are tinted most of the way to the fog colour on purpose: a
 * crisp treeline would pull the eye straight off the plant.
 */
function Skyline({ habitat }: { habitat: HabitatPreset }) {
  const quality = getQualityCaps()
  const texture = useMemo(() => skylineTexture(habitat.skyline), [habitat.skyline])
  const count = Math.max(14, Math.round(64 * habitat.skylineDensity * (quality.particleScale > 0.6 ? 1 : 0.6)))
  const meshRef = useRef<THREE.InstancedMesh>(null)

  const material = useMemo(() => {
    const hills = new THREE.Color(habitat.hills)
    const fog = new THREE.Color(habitat.fogColor)
    // Only a nudge toward the haze here: the *scene* fog is already pulling
    // this band most of the way to the sky colour, and doing it twice is what
    // turned the first two passes' treeline into a row of clouds.
    hills.lerp(fog, 0.12)
    return new THREE.MeshBasicMaterial({
      map: texture,
      color: hills,
      transparent: true,
      depthWrite: false,
      alphaTest: 0.28,
      fog: true,
      side: THREE.DoubleSide,
    })
  }, [texture, habitat])

  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const pos = new THREE.Vector3()
    const scale = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)
    for (let i = 0; i < count; i++) {
      // Even spacing with a deterministic jitter — a random ring clumps and
      // leaves gaps, and a perfectly even one reads as a fence.
      const base = (i / count) * Math.PI * 2
      const jitter = Math.sin(i * 12.9898) * 0.5
      const th = base + jitter * (Math.PI * 2) / count
      const radius = HABITAT_HORIZON * (0.82 + ((Math.sin(i * 78.233) + 1) / 2) * 0.5)
      const h = habitat.skylineHeight * (5.2 + ((Math.sin(i * 39.425) + 1) / 2) * 5)
      const w = h * (habitat.skyline === 'butte' ? 1.5 : 0.82)
      pos.set(Math.cos(th) * radius, HABITAT_FLOOR + h * 0.5 - 0.3, Math.sin(th) * radius)
      q.setFromAxisAngle(up, Math.atan2(pos.x, pos.z))
      scale.set(w, h, 1)
      m.compose(pos, q, scale)
      mesh.setMatrixAt(i, m)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.count = count
  }, [count, habitat])

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, count]}
      material={material}
      frustumCulled={false}
      renderOrder={-5}
    >
      <planeGeometry args={[1, 1]} />
    </instancedMesh>
  )
}

/* ------------------------------------------------------------------ */
/* Ground cover                                                       */
/* ------------------------------------------------------------------ */

function bladeGeometry() {
  const segs = 3
  const positions: number[] = []
  const uvs: number[] = []
  const index: number[] = []
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const w = i === segs ? 0 : 0.5 * (1 - t * t * 0.8)
    positions.push(-w, t, 0, w, t, 0)
    uvs.push(0, t, 1, t)
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(index)
  geo.computeVertexNormals()
  return geo
}

/**
 * Instanced ground cover in a ring.
 *
 * Adapted from the Rate Lab garden's grass, with the wind simplified to a
 * single travelling wave — one direction, one speed, no gusts. The house rule
 * from the diffusion work applies just as well to a meadow: orderly motion
 * reads as a breeze, scattered motion reads as static.
 *
 * The blade transform is baked in the vertex shader and the instance matrices
 * are left as identity, which keeps the stock normal and shadow paths happy.
 */
function GroundCover({ habitat, wind }: { habitat: HabitatPreset; wind: React.RefObject<number> }) {
  const quality = getQualityCaps()
  // Density is the preset's, honestly: a desert's 0.12 has to *look* like 0.12,
  // and the first pass floored it at 0.6 so the Opuntia stood in a wheat field.
  const total = Math.round(
    (quality.particleScale > 0.9 ? 4800 : quality.particleScale > 0.6 ? 3000 : 1500) *
      (0.08 + habitat.bladeDensity * 0.92),
  )
  const meshRef = useRef<THREE.InstancedMesh>(null)

  const { geo, mat, uniforms } = useMemo(() => {
    const geo = bladeGeometry()
    const p0 = new Float32Array(total * 4) // x, z, height, phase
    const p1 = new Float32Array(total * 4) // lean, tint, y, yaw
    let n = 0
    let guard = 0
    while (n < total && guard < total * 8) {
      guard++
      // Bias toward the inner edge of the ring: cover thins with distance, the
      // way a clearing's edge actually looks, and the far field costs nothing.
      const u = Math.random()
      const rad = HABITAT_INNER + (HABITAT_OUTER - HABITAT_INNER) * Math.pow(u, 0.62)
      const th = Math.random() * Math.PI * 2
      const x = Math.cos(th) * rad
      const z = Math.sin(th) * rad
      p0[n * 4] = x
      p0[n * 4 + 1] = z
      // Scaled against the specimen, not against a meadow: a bean plant is
      // 2.4 units tall, so ankle-high cover is about a tenth of that. The
      // first pass used 0.22–0.52 and grew grass to the height of the crop.
      p0[n * 4 + 2] = 0.07 + Math.random() * 0.13
      p0[n * 4 + 3] = Math.random() * Math.PI * 2
      p1[n * 4] = (Math.random() - 0.5) * 0.3
      p1[n * 4 + 1] = Math.random()
      p1[n * 4 + 2] = HABITAT_FLOOR + groundHeight(x, z) - 0.03
      p1[n * 4 + 3] = Math.random() * Math.PI
      n++
    }
    geo.setAttribute('aP0', new THREE.InstancedBufferAttribute(p0, 4))
    geo.setAttribute('aP1', new THREE.InstancedBufferAttribute(p1, 4))

    const uniforms = {
      uTime: { value: 0 },
      uWindAmp: { value: 0.22 },
      uHeight: { value: habitat.bladeHeight },
      uBase: { value: new THREE.Color(habitat.bladeBase) },
      uTip: { value: new THREE.Color(habitat.bladeTip) },
    }

    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide })
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           attribute vec4 aP0; attribute vec4 aP1;
           uniform float uTime; uniform float uWindAmp; uniform float uHeight;
           varying float vT; varying float vTint;`,
        )
        .replace(
          '#include <begin_vertex>',
          `
           float gT = position.y;
           vT = gT; vTint = aP1.y;
           float bh = aP0.z * uHeight;
           float yaw = aP1.w;
           float cy = cos(yaw), sy = sin(yaw);
           // One travelling wave across the field. No second harmonic, no gust
           // term: this is a breeze, not weather.
           float wave = sin(uTime * 1.15 + aP0.x * 0.42 + aP0.y * 0.28) * uWindAmp;
           float bend = (aP1.x + wave) * gT * gT;
           // Blades within a couple of units of the eye shrink away to nothing.
           // Without this, ducking to the root viewpoint puts one blade of
           // grass across the entire frame — the ring being outside the working
           // radius is no help once the camera itself moves into the ring.
           float near = smoothstep(1.6, 3.2, distance(cameraPosition, vec3(aP0.x, aP1.z, aP0.y)));
           bh *= near;
           vec3 local = vec3(position.x * 0.035 * (0.5 + bh * 3.0), gT * bh, 0.0);
           vec3 rotated = vec3(local.x * cy - local.z * sy, local.y, local.x * sy + local.z * cy);
           rotated.x += bend * bh * 0.85;
           rotated.z += bend * bh * 0.3;
           rotated.y -= abs(bend) * bh * 0.22;
           vec3 transformed = rotated + vec3(aP0.x, aP1.z, aP0.y);
          `,
        )
        .replace(
          '#include <project_vertex>',
          `
           vec4 mvPosition = vec4( transformed, 1.0 );
           mvPosition = modelViewMatrix * mvPosition;
           gl_Position = projectionMatrix * mvPosition;`,
        )
        .replace(
          '#include <worldpos_vertex>',
          `
           #if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
             vec4 worldPosition = vec4( transformed, 1.0 );
             worldPosition = modelMatrix * worldPosition;
           #endif`,
        )
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform vec3 uBase; uniform vec3 uTip;
           varying float vT; varying float vTint;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
           {
             // Seen from above at a grazing angle you are mostly looking at
             // blade *bases*, so a realistic base-to-tip ramp turns the whole
             // ring into a dark lawn that the specimen's own leaves vanish
             // into. Lift the base most of the way to the tip and keep the
             // shading shallow: the field has to stay lighter than the plant.
             vec3 base = mix(mix(uBase, uTip, 0.42), uBase * 1.16, vTint * 0.45);
             vec3 tip  = mix(uTip, uTip * 0.94, vTint * 0.4);
             vec3 c = mix(base, tip, smoothstep(0.0, 1.0, vT));
             c *= 0.88 + vT * 0.12;
             diffuseColor.rgb *= c;
           }`,
        )
    }
    mat.customProgramCacheKey = () => 'sugar-cover-v1'
    return { geo, mat, uniforms }
  }, [total, habitat])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const id = new THREE.Matrix4()
    for (let i = 0; i < total; i++) mesh.setMatrixAt(i, id)
    mesh.instanceMatrix.needsUpdate = true
  }, [total, geo])

  useEffect(() => () => { geo.dispose(); mat.dispose() }, [geo, mat])

  useFrame((_, rawDt) => {
    uniforms.uTime.value += Math.min(rawDt, 0.05)
    uniforms.uWindAmp.value = wind.current ?? 0.22
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[geo, mat, total]}
      frustumCulled={false}
      receiveShadow={quality.shadows}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Clutter                                                            */
/* ------------------------------------------------------------------ */

/**
 * Stones and tussocks scattered on the ring.
 *
 * A ground plane with nothing on it reads as a plate however well it is
 * coloured. Two dozen lumps at varying scale are what convince the eye it is
 * looking at terrain, and one instanced draw call buys all of them.
 */
function Clutter({ habitat }: { habitat: HabitatPreset }) {
  const quality = getQualityCaps()
  const count = Math.round(46 * habitat.clutter * (quality.particleScale > 0.6 ? 1 : 0.55))
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(() => new THREE.IcosahedronGeometry(0.5, 0), [])

  useEffect(() => () => geo.dispose(), [geo])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const pos = new THREE.Vector3()
    const scale = new THREE.Vector3()
    const colour = new THREE.Color()
    const base = new THREE.Color(habitat.clutterColor)
    for (let i = 0; i < count; i++) {
      const rad = HABITAT_INNER + 0.6 + Math.pow((i * 0.618) % 1, 0.7) * (HABITAT_OUTER - HABITAT_INNER)
      const th = i * 2.39996
      const x = Math.cos(th) * rad
      const z = Math.sin(th) * rad
      const s = 0.16 + ((Math.sin(i * 45.233) + 1) / 2) * 0.4
      pos.set(x, HABITAT_FLOOR + groundHeight(x, z) + s * 0.28, z)
      e.set(i * 0.7, i * 1.3, i * 0.4)
      q.setFromEuler(e)
      scale.set(s * 1.3, s * 0.72, s * 1.15)
      m.compose(pos, q, scale)
      mesh.setMatrixAt(i, m)
      colour.copy(base).offsetHSL(0, 0, ((Math.sin(i * 9.77) + 1) / 2 - 0.5) * 0.14)
      mesh.setColorAt(i, colour)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.count = count
  }, [count, habitat])

  if (count === 0) return null

  return (
    <instancedMesh ref={meshRef} args={[geo, undefined, count]} castShadow={false} receiveShadow={false}>
      <meshStandardMaterial roughness={0.95} metalness={0} flatShading />
    </instancedMesh>
  )
}

/* ------------------------------------------------------------------ */
/* Air                                                                */
/* ------------------------------------------------------------------ */

/**
 * Whatever is drifting through the air here — pollen, dust, spores, snow.
 *
 * One `Points` draw call. They travel in the same direction as the wind at one
 * speed and wrap around a box centred on the plant, so there is always
 * something moving near the subject without anything ever crossing in front of
 * it fast enough to distract.
 */
function Air({ habitat, daylight }: { habitat: HabitatPreset; daylight: React.RefObject<number> }) {
  const quality = getQualityCaps()
  const count = Math.round(170 * habitat.airDensity * quality.particleScale)
  const pointsRef = useRef<THREE.Points>(null)
  const sprite = useMemo(() => moteSprite(), [])

  const { geo, speeds } = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const speeds = new Float32Array(count * 2)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 14
      positions[i * 3 + 1] = HABITAT_FLOOR + 0.2 + Math.random() * 5.2
      positions[i * 3 + 2] = (Math.random() - 0.5) * 14
      speeds[i * 2] = 0.35 + Math.random() * 0.5
      speeds[i * 2 + 1] = Math.random() * Math.PI * 2
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return { geo: g, speeds }
  }, [count])

  useEffect(() => () => geo.dispose(), [geo])

  const materialRef = useRef<THREE.PointsMaterial>(null)

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const attr = geo.attributes.position as THREE.BufferAttribute
    const arr = attr.array as Float32Array
    // Snow falls; everything else drifts sideways and sags a little.
    const fall = habitat.air === 'flakes' ? 0.85 : 0.12
    for (let i = 0; i < count; i++) {
      const s = speeds[i * 2]
      arr[i * 3] += dt * s * 0.55
      arr[i * 3 + 1] -= dt * fall * s
      arr[i * 3 + 2] += dt * s * 0.16
      if (arr[i * 3] > 7) arr[i * 3] = -7
      if (arr[i * 3 + 2] > 7) arr[i * 3 + 2] = -7
      if (arr[i * 3 + 1] < HABITAT_FLOOR) arr[i * 3 + 1] = HABITAT_FLOOR + 5.4
    }
    attr.needsUpdate = true
    const mat = materialRef.current
    // Motes catch the light: they all but vanish at night, which is exactly
    // what makes turning the light back up feel like the air filling again.
    if (mat) mat.opacity = 0.16 + (daylight.current ?? 1) * 0.5
  })

  if (count === 0) return null

  return (
    <points ref={pointsRef} geometry={geo} frustumCulled={false}>
      <pointsMaterial
        ref={materialRef}
        map={sprite}
        color={habitat.airColor}
        size={habitat.air === 'flakes' ? 0.1 : 0.055}
        sizeAttenuation
        transparent
        depthWrite={false}
        opacity={0.55}
        toneMapped={false}
      />
    </points>
  )
}

/* ------------------------------------------------------------------ */
/* Rain                                                               */
/* ------------------------------------------------------------------ */

/**
 * Rain, on the high tier only and only where it actually rains.
 *
 * The whole curtain is one instanced draw whose *group* is yawed to face the
 * camera each frame — a hundred individual billboard matrices for something
 * this incidental would be a poor trade.
 */
function Rain({ habitat }: { habitat: HabitatPreset }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const groupRef = useRef<THREE.Group>(null)
  const camera = useThree((s) => s.camera)
  const count = Math.round(150 * habitat.rain)
  const offsets = useMemo(() => {
    const a = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      a[i * 3] = (Math.random() - 0.5) * 13
      a[i * 3 + 1] = Math.random() * 8
      a[i * 3 + 2] = (Math.random() - 0.5) * 6
    }
    return a
  }, [count])

  useFrame((_, rawDt) => {
    const mesh = meshRef.current
    const group = groupRef.current
    if (!mesh || !group) return
    group.rotation.y = Math.atan2(camera.position.x, camera.position.z)
    const dt = Math.min(rawDt, 0.05)
    const m = new THREE.Matrix4()
    for (let i = 0; i < count; i++) {
      offsets[i * 3 + 1] -= dt * 11
      if (offsets[i * 3 + 1] < 0) offsets[i * 3 + 1] += 8
      m.makeTranslation(offsets[i * 3], HABITAT_FLOOR + offsets[i * 3 + 1], offsets[i * 3 + 2])
      mesh.setMatrixAt(i, m)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  if (count === 0) return null

  return (
    <group ref={groupRef}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <planeGeometry args={[0.012, 0.42]} />
        <meshBasicMaterial color="#CFE2EE" transparent opacity={0.4} depthWrite={false} toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Light                                                              */
/* ------------------------------------------------------------------ */

/**
 * The habitat's own sun, plus a bounce and a sky fill.
 *
 * This *replaces* the studio rig on the plant stage rather than adding to it.
 * Two lighting schemes stacked on one subject is how a scene ends up looking
 * washed out and placeless, and the whole point of the habitat is that the
 * light in a desert is not the light in a rainforest.
 */
function HabitatLight({
  habitat,
  daylight,
}: {
  habitat: HabitatPreset
  daylight: React.RefObject<number>
}) {
  const quality = getQualityCaps()
  const keyRef = useRef<THREE.DirectionalLight>(null)
  const hemiRef = useRef<THREE.HemisphereLight>(null)
  const bounceRef = useRef<THREE.DirectionalLight>(null)
  const sun = useMemo(() => sunPosition(habitat), [habitat])
  const duskColour = useMemo(() => new THREE.Color(WORLD_PRESETS[habitat.id].sunDusk), [habitat])
  const dayColour = useMemo(() => new THREE.Color(habitat.sun), [habitat])
  const work = useMemo(() => new THREE.Color(), [])

  useFrame(() => {
    const t = daylight.current ?? 1
    if (keyRef.current) {
      // Tuned against sampled pixels, not by eye, and the numbers are much
      // larger than they look like they should be. Swapping the ground to an
      // unlit material rendered it at the pale sage its vertex colours actually
      // are; under `MeshStandardMaterial` the same ground came back six times
      // darker. Three's lighting units are not lux, the studio rig this
      // replaces leant on a close point light at intensity 6, and an outdoor
      // scene has no such crutch — so the sun here has to be worth a sun.
      keyRef.current.intensity = 2.2 + t * 7.4
      work.copy(duskColour).lerp(dayColour, t)
      keyRef.current.color.copy(work)
    }
    if (hemiRef.current) hemiRef.current.intensity = 1.4 + t * 2.7
    if (bounceRef.current) bounceRef.current.intensity = 0.7 + t * 1.7
  })

  return (
    <group>
      <hemisphereLight ref={hemiRef} args={[habitat.hemiSky, habitat.hemiGround, 0.8]} />
      <directionalLight
        ref={keyRef}
        position={sun}
        intensity={2.2}
        color={habitat.sun}
        castShadow={quality.shadows}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={1}
        shadow-camera-far={30}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={9}
        shadow-camera-bottom={-5}
        shadow-bias={-0.0012}
      />
      {/* Bounce off the ground, tinted by it: this is most of why a plant in a
          desert looks warm underneath and one in a rainforest looks green. */}
      {/* A soft frontal fill so the specimen never goes to silhouette when the
          learner orbits into the sun. */}
      <directionalLight position={[-sun[0] * 0.5, 3.4, -sun[2] * 0.5]} intensity={1.3} color={habitat.hemiSky} />
      <directionalLight
        ref={bounceRef}
        position={[-sun[0] * 0.4, -2, -sun[2] * 0.4]}
        intensity={0.5}
        color={habitat.soilNear}
      />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Fog                                                                */
/* ------------------------------------------------------------------ */

function HabitatFog({ habitat, daylight }: { habitat: HabitatPreset; daylight: React.RefObject<number> }) {
  const scene = useThree((s) => s.scene)
  const fog = useMemo(
    () => new THREE.Fog(habitat.fogColor, habitat.fogNear, habitat.fogFar),
    [habitat],
  )
  const day = useMemo(() => new THREE.Color(habitat.fogColor), [habitat])
  const night = useMemo(() => new THREE.Color(WORLD_PRESETS[habitat.id].skyDusk[4]), [habitat])

  useEffect(() => {
    const previous = scene.fog
    scene.fog = fog
    return () => {
      scene.fog = previous
    }
  }, [scene, fog])

  useFrame(() => {
    fog.color.copy(night).lerp(day, daylight.current ?? 1)
  })

  return null
}

/* ------------------------------------------------------------------ */
/* Ploob in the field                                                 */
/* ------------------------------------------------------------------ */

/**
 * The Ploobian, standing in the crop, watching the plant work.
 *
 * This is the cheapest and by far the strongest answer to "make it not look
 * like everyone else's demo": no other 3D scene on the internet has Ploob in
 * it. He is also a scale reference — a knee-high creature next to a bean plant
 * tells a twelve-year-old how big the specimen is faster than the bar in the
 * corner does — and he gives the composition something to be off-centre
 * *from*.
 *
 * He stands to one side of the working radius so he never occludes the stem,
 * and he is medium-tier and up because his jelly is a transmission material
 * and transmission costs a whole extra render pass.
 */
function PloobInTheField({ habitat }: { habitat: HabitatPreset }) {
  // Green in the green places, gold where it is dry: he belongs to the biome
  // rather than being pasted on top of it.
  const tint = habitat.id === 'desert' || habitat.id === 'savanna' ? 'gold' : 'green'
  return (
    <Suspense fallback={null}>
      <PloobModel
        position={[1.32, HABITAT_FLOOR, 0.86]}
        height={0.52}
        tint={tint}
        faceCamera
      />
    </Suspense>
  )
}

/* ------------------------------------------------------------------ */
/* Composed habitat                                                   */
/* ------------------------------------------------------------------ */

export default function Habitat({ sim, specimenId }: { sim: SugarSim; specimenId: string }) {
  const habitat = useMemo(() => habitatForSpecimen(specimenId), [specimenId])
  const quality = getQualityCaps()

  // One shared, smoothed daylight value. Every part reads it from a ref rather
  // than a prop, so turning the light dial never re-renders the scene graph.
  const daylight = useRef(1)
  const wind = useRef(0.22)

  useFrame((_, rawDt) => {
    const target = sim.night ? 0.06 : 0.28 + sim.light * 0.72
    const k = 1 - Math.exp(-Math.min(rawDt, 0.05) * 2.4)
    daylight.current += (target - daylight.current) * k
    // A hot dry day moves the air more. Small, but it is one more place the
    // conditions show up somewhere other than a number.
    const target2 = 0.16 + (1 - sim.humidity) * 0.2 + (sim.tempC > 30 ? 0.06 : 0)
    wind.current += (target2 - wind.current) * k
  })

  return (
    <group>
      <HabitatFog habitat={habitat} daylight={daylight} />
      <SkyDome habitat={habitat} daylight={daylight} />
      <HabitatLight habitat={habitat} daylight={daylight} />
      <Ground habitat={habitat} />
      <Skyline habitat={habitat} />
      <GroundCover habitat={habitat} wind={wind} />
      {quality.particleScale > 0.5 && <Clutter habitat={habitat} />}
      {quality.particleScale > 0.5 && <PloobInTheField habitat={habitat} />}
      <Air habitat={habitat} daylight={daylight} />
      {quality.postFx && habitat.rain > 0.2 && <Rain habitat={habitat} />}
    </group>
  )
}
