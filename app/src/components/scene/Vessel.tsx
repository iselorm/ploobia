import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import type { SimState } from '@/lib/sim'
import { VESSEL_LENGTH, VESSEL_RADIUS, heartbeat } from '@/lib/sim'
import { BLEND, LAP_LENGTH, STAGES, STAGE_ENDS, beatsPerSecond } from '@/lib/journey'

// Ashima / Ian McEwan 3D simplex noise (GLSL), injected into the standard material.
const SNOISE = /* glsl */ `
vec3 mod289(vec3 x){return x - floor(x * (1.0/289.0)) * 289.0;}
vec4 mod289(vec4 x){return x - floor(x * (1.0/289.0)) * 289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`

/**
 * Journey-aware stage blending in GLSL — the same piecewise-smoothstep the JS
 * side uses (lib/journey.ts paramAt/colorAt), so the wall the learner sees and
 * the sim the cells obey agree exactly. Stage data arrives as uniform arrays.
 */
const N = STAGES.length
const LAST = N - 1

const STAGE_GLSL = /* glsl */ `
uniform float uEnds[${N}];
uniform float uRadiusKs[${N}];
uniform float uWindows[${N}];
uniform float uPulseKs[${N}];
uniform vec3 uWallCols[${N}];

float lapLocal(float wz) {
  float d = -wz;
  return mod(mod(d, ${LAP_LENGTH.toFixed(1)}) + ${LAP_LENGTH.toFixed(1)}, ${LAP_LENGTH.toFixed(1)});
}

void stageBlend(float ld, out float rk, out vec3 col, out float win, out float pk) {
  int idx = ${LAST};
  for (int i = 0; i < ${N}; i++) {
    if (ld < uEnds[i]) { idx = i; break; }
  }
  float sStart = idx == 0 ? 0.0 : uEnds[idx - 1];
  float sEnd = uEnds[idx];
  int prev = idx == 0 ? ${LAST} : idx - 1;
  int next = idx == ${LAST} ? 0 : idx + 1;
  float halfBlend = ${(BLEND / 2).toFixed(1)};
  float t = 1.0;
  int other = idx;
  if (ld - sStart < halfBlend) {
    other = prev;
    t = smoothstep(0.0, 1.0, 0.5 + (ld - sStart) / ${BLEND.toFixed(1)});
  } else if (sEnd - ld < halfBlend) {
    other = next;
    t = smoothstep(0.0, 1.0, 0.5 + (sEnd - ld) / ${BLEND.toFixed(1)});
  }
  rk  = mix(uRadiusKs[other], uRadiusKs[idx], t);
  col = mix(uWallCols[other], uWallCols[idx], t);
  win = mix(uWindows[other],  uWindows[idx],  t);
  pk  = mix(uPulseKs[other],  uPulseKs[idx],  t);
}
`

/**
 * The endless blood-vessel tunnel, now journey-aware. A fixed-length open
 * cylinder re-centered on the camera every frame; its noise is anchored to
 * *world* Z so the wall streams past. The journey stage machine shapes it:
 * the bore funnels down to a capillary squeeze, the wall colour shifts stop
 * by stop, and along the lungs/tissue stretches the wall turns translucent —
 * a window onto the alveoli and body cells living just outside.
 */
export default function Vessel({ sim }: { sim: SimState }) {
  const meshRef = useRef<THREE.Mesh>(null)

  const uniforms = useMemo(
    () => ({
      uCenterZ: { value: 0 },
      uPulse: { value: 0 },
      uEnds: { value: STAGE_ENDS.slice() },
      uRadiusKs: { value: STAGES.map((s) => s.radiusK) },
      uWindows: { value: STAGES.map((s) => s.window) },
      uPulseKs: { value: STAGES.map((s) => s.pulseK) },
      uWallCols: { value: STAGES.map((s) => new THREE.Color(s.wall)) },
    }),
    [],
  )

  const geometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(VESSEL_RADIUS, VESSEL_RADIUS, VESSEL_LENGTH, 72, 200, true)
    g.rotateX(Math.PI / 2) // align the axis with Z
    return g
  }, [])

  const material = useMemo(() => {
    const m = new THREE.MeshLambertMaterial({
      color: new THREE.Color('#ffffff'),
      side: THREE.BackSide,
      transparent: true,
      // The wall must not write depth: the world outside (alveoli, body
      // cells) is drawn before it and shows through the window stretches.
      depthWrite: false,
    })
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uCenterZ = uniforms.uCenterZ
      shader.uniforms.uPulse = uniforms.uPulse
      shader.uniforms.uEnds = uniforms.uEnds
      shader.uniforms.uRadiusKs = uniforms.uRadiusKs
      shader.uniforms.uWindows = uniforms.uWindows
      shader.uniforms.uPulseKs = uniforms.uPulseKs
      shader.uniforms.uWallCols = uniforms.uWallCols
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uCenterZ;
uniform float uPulse;
varying float vDisp;
varying vec3 vWall;
varying float vWin;
${STAGE_GLSL}
${SNOISE}`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
{
  float ang = atan(transformed.y, transformed.x);
  float wz = transformed.z + uCenterZ;
  float ld = lapLocal(wz);
  float rk; vec3 wallCol; float win; float pk;
  stageBlend(ld, rk, wallCol, win, pk);
  vWall = wallCol;
  vWin = win;
  transformed.xy *= rk;
  vec3 dir = vec3(cos(ang), sin(ang), 0.0);
  float amp = max(0.35, rk);
  float n = snoise(vec3(dir.x * 1.7, dir.y * 1.7, wz * 0.045)) * 0.85
          + snoise(vec3(dir.x * 4.3 + 17.3, dir.y * 4.3, wz * 0.16)) * 0.32;
  vDisp = n;
  transformed += dir * (n * amp + uPulse * pk * 0.38);
}`,
        )
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uPulse;
varying float vDisp;
varying vec3 vWall;
varying float vWin;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
diffuseColor.rgb = vWall;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.32, 0.32), smoothstep(0.05, 0.85, vDisp) * 0.55);
diffuseColor.rgb *= 1.0 + uPulse * 0.10;
diffuseColor.a = 1.0 - vWin;`,
        )
    }
    return m
  }, [uniforms])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return
    mesh.position.z = sim.camZ
    uniforms.uCenterZ.value = sim.camZ
    const bps = beatsPerSecond(sim)
    // A single global beat; the per-stage gain (pk) shapes it along the wall,
    // so the heart chamber slams while the capillary barely breathes.
    uniforms.uPulse.value = heartbeat(sim.time, bps)
  })

  return <mesh ref={meshRef} geometry={geometry} material={material} frustumCulled={false} renderOrder={1} />
}
