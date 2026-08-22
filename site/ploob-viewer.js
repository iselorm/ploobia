/**
 * The live Ploob on ploobia.com.
 *
 * Loads the optimised GLB, replaces Tripo's matte export materials with the
 * jelly recipe (transmission + clearcoat + a little inner glow), and gives the
 * visitor something to do on the very first screen: drag to spin him, poke him
 * to squish him, and he watches the cursor while you read.
 *
 * If WebGL is unavailable the caller's <img> fallback is left in place.
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

const GOLD = '#E8A33D'

/** A soft gradient dome for reflections — no studio window streaks. */
function skyEnvironment(renderer) {
  const c = document.createElement('canvas')
  c.width = 16
  c.height = 64
  const g = c.getContext('2d')
  const grd = g.createLinearGradient(0, 0, 0, 64)
  grd.addColorStop(0, '#FFF6E2')
  grd.addColorStop(0.55, '#F0D9AE')
  grd.addColorStop(1, '#5A4632')
  g.fillStyle = grd
  g.fillRect(0, 0, 16, 64)
  const tex = new THREE.CanvasTexture(c)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.colorSpace = THREE.SRGBColorSpace
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromEquirectangular(tex).texture
  pmrem.dispose()
  tex.dispose()
  return env
}

/**
 * Material sanitiser. The Tripo export ships roughness 0.9, opaque, no
 * clearcoat — which throws away the whole reason Ploob is made of jelly.
 * Keep the baked base-colour map (the eyes live in it) and rebuild everything
 * around it.
 */
function jellyfy(root) {
  root.traverse((o) => {
    if (!o.isMesh) return
    const map = o.material.map
    o.material = new THREE.MeshPhysicalMaterial({
      map,
      metalness: 0,
      roughness: 0.09,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      transmission: 0.42,
      thickness: 0.5,
      ior: 1.44,
      attenuationColor: new THREE.Color(GOLD),
      attenuationDistance: 1.1,
      sheen: 0.35,
      sheenColor: new THREE.Color('#FFF6DC'),
      specularIntensity: 1,
      emissive: new THREE.Color(GOLD),
      emissiveMap: map,
      emissiveIntensity: 0.1,
      side: THREE.FrontSide,
    })
  })
}

export async function mountPloob(canvas, { onReady, modelUrl } = {}) {
  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  } catch {
    return null
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.06

  const scene = new THREE.Scene()
  scene.environment = skyEnvironment(renderer)

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)
  camera.position.set(0, 0.75, 5.2)
  camera.lookAt(0, 0, 0)

  scene.add(new THREE.DirectionalLight('#FFEDC0', 2.4).translateX(3).translateY(5).translateZ(4))
  const rim = new THREE.DirectionalLight('#CFE6FF', 0.9)
  rim.position.set(-4, 2.5, -3)
  scene.add(rim)
  const fill = new THREE.DirectionalLight('#FFFFFF', 0.5)
  fill.position.set(-2, 1, 4)
  scene.add(fill)

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  let gltf
  try {
    gltf = await loader.loadAsync(modelUrl)
  } catch {
    return null
  }

  const pivot = new THREE.Group()
  const body = new THREE.Group()
  pivot.add(body)
  scene.add(pivot)

  const root = gltf.scene
  jellyfy(root)
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const centre = box.getCenter(new THREE.Vector3())
  const s = 2 / Math.max(size.x, size.y, size.z)
  root.scale.setScalar(s)
  root.position.set(-centre.x * s, -centre.y * s, -centre.z * s)
  body.add(root)

  /* ---- interaction ---- */
  let spin = 0 // current yaw
  let spinVel = 0 // inertia
  let dragging = false
  let lastX = 0
  let dragged = false
  let pokeAt = -10
  const pointer = { x: 0, y: 0 } // -1..1, where the cursor is on screen

  const onDown = (e) => {
    dragging = true
    dragged = false
    lastX = (e.touches ? e.touches[0].clientX : e.clientX)
    canvas.setPointerCapture?.(e.pointerId ?? 1)
  }
  const onMove = (e) => {
    const cx = e.touches ? e.touches[0].clientX : e.clientX
    const cy = e.touches ? e.touches[0].clientY : e.clientY
    const r = canvas.getBoundingClientRect()
    pointer.x = ((cx - r.left) / r.width) * 2 - 1
    pointer.y = ((cy - r.top) / r.height) * 2 - 1
    if (!dragging) return
    const dx = cx - lastX
    lastX = cx
    if (Math.abs(dx) > 2) dragged = true
    spinVel = dx * 0.012
  }
  const onUp = () => {
    if (dragging && !dragged) pokeAt = clock
    dragging = false
  }
  canvas.addEventListener('pointerdown', onDown)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  canvas.addEventListener('touchstart', onDown, { passive: true })
  window.addEventListener('touchmove', onMove, { passive: true })
  window.addEventListener('touchend', onUp)

  /* ---- loop ---- */
  let clock = 0
  let raf = 0
  let visible = true
  const io = new IntersectionObserver((entries) => { visible = entries[0].isIntersecting }, { threshold: 0 })
  io.observe(canvas)

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function resize() {
    const r = canvas.getBoundingClientRect()
    const w = Math.max(1, Math.round(r.width))
    const h = Math.max(1, Math.round(r.height))
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      renderer.setPixelRatio(dpr)
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
  }

  function frame(ms) {
    raf = requestAnimationFrame(frame)
    if (!visible) return
    const t = ms / 1000
    const dt = Math.min(0.05, t - clock || 0.016)
    clock = t
    resize()

    // spin: dragged directly, then coasts
    if (!dragging) {
      spinVel *= Math.exp(-dt * 2.2)
      if (!reduce) spinVel += 0.0009 // a slow drift so he is never quite still
    }
    spin += spinVel
    pivot.rotation.y = spin

    // watch the cursor
    const targetYaw = pointer.x * 0.22
    const targetPitch = pointer.y * 0.14
    body.rotation.y += (targetYaw - body.rotation.y) * (1 - Math.exp(-dt * 4))
    body.rotation.x += (targetPitch - body.rotation.x) * (1 - Math.exp(-dt * 4))

    // idle breathing + poke squish
    const breathe = reduce ? 0 : Math.sin(t * 1.9) * 0.022
    const since = t - pokeAt
    const squish = since < 0.7 ? Math.sin(since / 0.7 * Math.PI) * Math.cos(since * 26) * 0.16 * (1 - since / 0.7) : 0
    const sx = 1 + breathe + squish
    const sy = 1 - breathe - squish
    body.scale.set(sx, sy, sx)
    body.position.y = reduce ? 0 : Math.abs(Math.sin(t * 0.95)) * 0.05

    renderer.render(scene, camera)
  }
  raf = requestAnimationFrame(frame)
  onReady?.()

  return {
    destroy() {
      cancelAnimationFrame(raf)
      io.disconnect()
      renderer.dispose()
    },
  }
}
