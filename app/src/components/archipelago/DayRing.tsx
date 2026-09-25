import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { getWorld } from '@/lib/archipelago'
import { DAY_PHASES, HOURS_PER_SECOND, dayPhaseIndex, plateUp } from '@/lib/plot'
import type { ProbeWord } from '@/lib/roots'
import { BEDS } from './landingLayout'
import { PLOT_AMBER, PLOT_CREAM, WORD_COLOR } from './plotColors'

/**
 * The day ring (Selorm, 25 Sep: "the dials and the ring on the bed or the
 * plant, whichever works best"). A ring around the plant in play, facing
 * the camera, standing just in front of the bed so it never cuts the
 * leaves: it is the day's clock where the child is already looking. It is
 * drawn over everything, like the guide chevrons, so the explorer standing
 * at the bed never hides the word — and it marks the bed from anywhere.
 *
 *   running  — an amber arc fills clockwise from the top through the six-
 *              second day; inside, the phase word and the seconds to dawn
 *   dawn     — before the probe: a dashed amber ring that breathes and
 *              says PROBE; after it: a solid ring in the word's colour
 *              with the word inside
 *   outside  — one tick per day of the run, filled up to today
 *
 * The scene renders state and computes nothing: the run is read from the
 * store (the ticker mutates it in place between flushes, so the arc is
 * smooth). No allocation per frame; the label canvas is redrawn only when
 * its words change, a handful of times a day.
 */

const R = 0.55 // ring radius, m
const BAND = 0.07 // ring thickness, m
const CENTRE_Y = 2.05 // floating over the plant (the cutting stands 0.25 → 1.4), clear of the explorer's head
const LOWEST_Y = 0.85 // on a short screen it comes down toward the plant rather than under the top HUD
const TOP_NDC = 0.52 // the ring's top edge stays below this on screen (the wordmark, plate and toolbelt live above)
const TOWARD = 0.2 // a touch toward the camera, so it reads as the bed's
const SIZE = 2 * (R + BAND * 3.2) // the quad the shader draws on

const WORDS: ProbeWord[] = ['SOAKED', 'DAMP', 'DRY']
const MODE = { running: 0, word: 1, probe: 2 } as const

/** Raw sRGB components — the shader writes them straight out, so the hex shows as written. */
function srgb(hex: string): THREE.Vector3 {
  const n = parseInt(hex.slice(1), 16)
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}
const COL = {
  amber: srgb(PLOT_AMBER),
  cream: srgb(PLOT_CREAM),
  word: WORDS.map((w) => srgb(WORD_COLOR[w])),
}

const VERT = /* glsl */ `
varying vec2 vP;
void main() {
  vP = (uv - 0.5) * ${SIZE.toFixed(4)};
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const FRAG = /* glsl */ `
uniform float uMode;      // 0 running, 1 probed word, 2 waiting on the probe
uniform float uProgress;  // 0..1 through the day
uniform float uDay;       // days done
uniform float uLen;       // days in the run
uniform float uPulse;     // 0..1 breathing, 1 when reduced motion
uniform float uOpacity;
uniform vec3 uColor;      // the word's colour
uniform vec3 uAmber;
uniform vec3 uCream;
varying vec2 vP;
const float R = ${R.toFixed(4)};
const float B = ${BAND.toFixed(4)};
const float TAU = 6.28318530718;
void main() {
  float r = length(vP);
  // clockwise from the top
  float t = fract(atan(vP.x, vP.y) / TAU + 1.0);
  float aa = fwidth(r) * 1.2;
  float band = 1.0 - smoothstep(B * 0.5 - aa, B * 0.5 + aa, abs(r - R));
  // a faint dark halo round the band so it reads on bright soil and leaves
  float halo = (1.0 - smoothstep(B * 0.5, B * 1.3, abs(r - R))) * 0.18;
  vec3 ink = vec3(0.11, 0.094, 0.078);
  vec3 col = ink;
  float a = 0.0;
  if (uMode < 0.5) {
    // the day so far in amber; what is left of it a dark track
    float lit = step(t, uProgress);
    col = mix(ink, uAmber, lit);
    a = band * mix(0.45, 1.0, lit);
  } else if (uMode < 1.5) {
    col = uColor;
    a = band * 0.95;
  } else {
    // dashes that breathe, on a dark track, until the probe goes in
    float dash = step(0.42, fract(t * 24.0));
    col = mix(ink, uAmber, dash);
    a = band * mix(0.4, mix(0.6, 1.0, uPulse), dash);
  }
  // the run's days, one tick each, just outside the ring: amber for the days gone
  float n = max(uLen, 1.0);
  float k = t * n;
  float i = floor(k + 0.5);
  float onTick = 1.0 - smoothstep(0.08 - fwidth(k), 0.08 + fwidth(k), abs(k - i));
  float inRadial = step(R + B * 1.0, r) * step(r, R + B * 2.2);
  float tick = onTick * inRadial;
  float done = step(mod(i, n) + 0.5, uDay);
  vec3 tickCol = mix(ink, uAmber, done);
  float tickA = tick * mix(0.5, 1.0, done);
  vec3 outCol = mix(col, tickCol, step(0.001, tickA));
  float outA = max(a, tickA);
  float haloA = halo * (1.0 - step(0.001, outA));
  gl_FragColor = vec4(mix(ink, outCol, step(0.001, outA)), max(outA, haloA) * uOpacity);
}`

export default function DayRing() {
  const group = useRef<THREE.Group>(null)
  const reduced = useMemo(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, [])
  const uniforms = useMemo(
    () => ({
      uMode: { value: 0 },
      uProgress: { value: 0 },
      uDay: { value: 0 },
      uLen: { value: 14 },
      uPulse: { value: 1 },
      uOpacity: { value: 0 },
      uColor: { value: COL.word[0].clone() },
      uAmber: { value: COL.amber },
      uCream: { value: COL.cream },
    }),
    [],
  )
  const ring = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        // information, not scenery: drawn over the explorer when they stand between it and the camera
        depthTest: false,
      }),
    [uniforms],
  )
  // the words inside the ring: one small canvas, redrawn only when they change
  const canvas = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 256
    return c
  }, [])
  const tex = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  }, [canvas])
  const labelMat = useMemo(() => new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, opacity: 0 }), [tex])
  useEffect(
    () => () => {
      ring.dispose()
      labelMat.dispose()
      tex.dispose()
    },
    [ring, labelMat, tex],
  )

  const shown = useRef({ key: -1, opacity: 0 })
  const bedPos = useRef(new THREE.Vector3())
  const dir = useRef(new THREE.Vector3())
  const probe = useRef(new THREE.Vector3())

  useFrame(({ camera, clock }, dtRaw) => {
    const g = group.current
    if (!g) return
    const dt = Math.min(0.05, dtRaw)
    const s = getWorld()
    const p = s.plot
    const run = p.run
    const live = s.zone === 'landing' && s.phase === 'play' && !!run && plateUp(p) && (run.phase === 'dawn' || run.phase === 'running')
    const target = live ? 1 : 0
    const st = shown.current
    st.opacity += (target - st.opacity) * (1 - Math.pow(0.001, dt))
    g.visible = st.opacity > 0.01
    uniforms.uOpacity.value = st.opacity
    labelMat.opacity = st.opacity
    if (!run || !g.visible) return

    // where: the bed in play, a step toward the camera, facing it
    const b = run.bed === 'first' ? BEDS.nara : BEDS.far
    bedPos.current.set(b[0], CENTRE_Y, b[2])
    dir.current.set(camera.position.x - b[0], 0, camera.position.z - b[2])
    const len = dir.current.length()
    if (len > 1e-3) dir.current.multiplyScalar(TOWARD / len)
    g.position.copy(bedPos.current).add(dir.current)
    g.quaternion.copy(camera.quaternion)
    // keep the ring's top under the top HUD: step it down toward the plant while it would sit too high
    for (let i = 0; i < 8 && g.position.y > LOWEST_Y; i += 1) {
      probe.current.copy(camera.up).applyQuaternion(camera.quaternion).multiplyScalar(R + BAND * 2.3).add(g.position).project(camera)
      if (probe.current.y <= TOP_NDC) break
      g.position.y = Math.max(LOWEST_Y, g.position.y - 0.15)
    }

    // what: the day's state
    const running = run.phase === 'running'
    const probed = run.today.probed
    const mode = running ? MODE.running : probed ? MODE.word : MODE.probe
    const hour = run.hour + run.acc
    const w = Math.max(0, WORDS.indexOf(run.today.word))
    uniforms.uMode.value = mode
    uniforms.uProgress.value = running ? Math.min(1, hour / 24) : 0
    uniforms.uDay.value = running ? run.day : run.day - 1
    uniforms.uLen.value = run.length
    uniforms.uPulse.value = reduced ? 1 : 0.5 + 0.5 * Math.sin(clock.elapsedTime * 3.2)
    uniforms.uColor.value.copy(COL.word[w])

    const secs = running ? Math.max(1, Math.ceil((24 - hour) / HOURS_PER_SECOND)) : 0
    const phase = running ? dayPhaseIndex(hour) : 0
    const key = ((mode * 4 + w) * 8 + phase) * 16 + secs
    if (key !== st.key) {
      st.key = key
      drawLabel(canvas, mode, WORDS[w], DAY_PHASES[phase], secs)
      tex.needsUpdate = true
      g.userData.mode = mode === MODE.running ? 'day' : mode === MODE.word ? 'word' : 'probe'
      g.userData.label = mode === MODE.running ? `${DAY_PHASES[phase]} · ${secs} s` : mode === MODE.word ? WORDS[w] : 'PROBE'
      g.userData.bed = run.bed
    }
  })

  return (
    <group ref={group} name="day-ring" visible={false} renderOrder={20}>
      <mesh material={ring} renderOrder={20}>
        <planeGeometry args={[SIZE, SIZE]} />
      </mesh>
      <mesh material={labelMat} renderOrder={21} position={[0, 0, 0.002]}>
        <planeGeometry args={[R * 1.7, R * 0.85]} />
      </mesh>
    </group>
  )
}

/** The words inside the ring, on a transparent canvas, with a dark edge so they read on leaves. */
function drawLabel(c: HTMLCanvasElement, mode: number, word: ProbeWord, phase: string, secs: number) {
  const ctx = c.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, c.width, c.height)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  const face = 'Nunito, ui-rounded, system-ui, -apple-system, "Segoe UI", sans-serif'
  const say = (text: string, y: number, size: number, fill: string) => {
    ctx.font = `900 ${size}px ${face}`
    ctx.lineWidth = size * 0.22
    ctx.strokeStyle = 'rgba(28,24,20,0.78)'
    ctx.strokeText(text, c.width / 2, y)
    ctx.fillStyle = fill
    ctx.fillText(text, c.width / 2, y)
  }
  if (mode === MODE.running) {
    say(phase, c.height * 0.4, 84, PLOT_CREAM)
    say(`${secs} s`, c.height * 0.78, 66, PLOT_AMBER)
  } else if (mode === MODE.word) {
    say(word, c.height * 0.52, 96, WORD_COLOR[word])
  } else {
    say('PROBE', c.height * 0.52, 96, PLOT_AMBER)
  }
}
