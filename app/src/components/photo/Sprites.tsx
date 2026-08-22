import * as THREE from 'three'

/**
 * Canvas-drawn sprite textures shared across the garden.
 *
 * Everything here is generated once at runtime and cached, so the single-file
 * build stays self-contained — no image assets to inline.
 */

const cache = new Map<string, THREE.CanvasTexture>()

function makeTexture(key: string, size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void) {
  const cached = cache.get(key)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) draw(ctx, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  cache.set(key, texture)
  return texture
}

/**
 * A crisp four-point starburst with a bright core — the classic "sparkle"
 * shape. Drawn once and reused for every mote of sunlight.
 */
export function starburstTexture(): THREE.CanvasTexture {
  return makeTexture('starburst', 128, (ctx, s) => {
    const c = s / 2
    ctx.clearRect(0, 0, s, s)

    // Soft halo so the star reads against a bright sky as well as a dark leaf.
    const halo = ctx.createRadialGradient(c, c, 0, c, c, c)
    halo.addColorStop(0, 'rgba(255, 246, 210, 0.95)')
    halo.addColorStop(0.22, 'rgba(255, 233, 163, 0.45)')
    halo.addColorStop(1, 'rgba(255, 226, 140, 0)')
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.arc(c, c, c, 0, Math.PI * 2)
    ctx.fill()

    // Four tapered points: long vertical and horizontal, short diagonals.
    const spike = (angle: number, length: number, width: number) => {
      ctx.save()
      ctx.translate(c, c)
      ctx.rotate(angle)
      ctx.beginPath()
      ctx.moveTo(0, -length)
      ctx.quadraticCurveTo(width, 0, 0, length)
      ctx.quadraticCurveTo(-width, 0, 0, -length)
      ctx.closePath()
      ctx.fillStyle = 'rgba(255, 252, 232, 0.96)'
      ctx.fill()
      ctx.restore()
    }
    spike(0, c * 0.94, c * 0.11)
    spike(Math.PI / 2, c * 0.72, c * 0.09)
    spike(Math.PI / 4, c * 0.34, c * 0.05)
    spike(-Math.PI / 4, c * 0.34, c * 0.05)

    // Bright core.
    const core = ctx.createRadialGradient(c, c, 0, c, c, c * 0.16)
    core.addColorStop(0, 'rgba(255, 255, 255, 1)')
    core.addColorStop(1, 'rgba(255, 250, 220, 0)')
    ctx.fillStyle = core
    ctx.beginPath()
    ctx.arc(c, c, c * 0.16, 0, Math.PI * 2)
    ctx.fill()
  })
}

/** A soft round glow, used for the sun's halo and for contact shadows. */
export function glowTexture(inner: string, outer: string, key: string): THREE.CanvasTexture {
  return makeTexture(`glow-${key}`, 128, (ctx, s) => {
    const c = s / 2
    ctx.clearRect(0, 0, s, s)
    const g = ctx.createRadialGradient(c, c, 0, c, c, c)
    g.addColorStop(0, inner)
    g.addColorStop(0.55, outer)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(c, c, c, 0, Math.PI * 2)
    ctx.fill()
  })
}

/** A soft dark ellipse that grounds an object against the floor. */
export function shadowTexture(): THREE.CanvasTexture {
  return makeTexture('contact-shadow', 128, (ctx, s) => {
    const c = s / 2
    ctx.clearRect(0, 0, s, s)
    const g = ctx.createRadialGradient(c, c, 0, c, c, c)
    g.addColorStop(0, 'rgba(24, 32, 20, 0.42)')
    g.addColorStop(0.5, 'rgba(24, 32, 20, 0.18)')
    g.addColorStop(1, 'rgba(24, 32, 20, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(c, c, c, 0, Math.PI * 2)
    ctx.fill()
  })
}

/**
 * A procedural leaf surface: base colour with a subtle lamina gradient, a
 * midrib and pinnate veins that lighten toward the tip, and slightly darker
 * margins. Drawn in UV space (0..1 across the leaf's bounding box; the leaf
 * points +v). Keyed by colour so each specimen gets its own.
 */
export function leafTexture(base: string, accent: string): THREE.CanvasTexture {
  return makeTexture(`leaf-${base}-${accent}`, 512, (ctx, s) => {
    const baseC = new THREE.Color(base)
    const accC = new THREE.Color(accent)
    // Lift the whole lamina: filmic tone mapping sits midtones lower than the
    // old linear pipeline did, and a leaf should read fresh, not bottle-green.
    const baseC0 = baseC.clone()
    baseC.lerp(new THREE.Color('#DFF5B0'), 0.28)
    const light = baseC0.clone().lerp(new THREE.Color('#F4FFDF'), 0.55)
    const dark = baseC0.clone().lerp(new THREE.Color('#1A3A1C'), 0.2)
    const rgb = (c: THREE.Color, a = 1) => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`

    // Lamina: gradient from a slightly darker base to a lighter tip.
    const g = ctx.createLinearGradient(0, s, 0, 0)
    g.addColorStop(0, rgb(dark.clone().lerp(baseC, 0.6)))
    g.addColorStop(0.55, rgb(baseC))
    g.addColorStop(1, rgb(baseC.clone().lerp(light, 0.35)))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)

    // Cellular mottling.
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * s
      const y = Math.random() * s
      const r = 4 + Math.random() * 14
      ctx.fillStyle = rgb(Math.random() < 0.5 ? light : dark, 0.05 + Math.random() * 0.06)
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    // Veins: midrib up the centre, pinnate secondaries curving to the margin.
    const cx = s / 2
    ctx.lineCap = 'round'
    const vein = (w: number, a: number) => {
      ctx.strokeStyle = rgb(light, a)
      ctx.lineWidth = w
    }
    // secondaries
    const n = 11
    for (let i = 0; i < n; i++) {
      const t = 0.08 + (i / n) * 0.84
      const y0 = s * (1 - t)
      for (const side of [-1, 1]) {
        vein(2.2 - t * 0.8, 0.55)
        ctx.beginPath()
        ctx.moveTo(cx, y0)
        const len = s * 0.46 * (1 - Math.abs(t - 0.5) * 1.1)
        ctx.quadraticCurveTo(cx + side * len * 0.55, y0 - s * 0.06, cx + side * len, y0 - s * 0.16)
        ctx.stroke()
        // tertiary hairlines
        vein(0.8, 0.28)
        for (let k = 1; k <= 3; k++) {
          const f = k / 4
          const px = cx + side * len * f * 0.9
          const py = y0 - s * 0.14 * f
          ctx.beginPath()
          ctx.moveTo(px, py)
          ctx.lineTo(px + side * 12, py - 22)
          ctx.stroke()
        }
      }
    }
    // midrib
    ctx.strokeStyle = rgb(accC.clone().lerp(light, 0.5), 0.9)
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(cx, s)
    ctx.lineTo(cx, s * 0.03)
    ctx.stroke()
    ctx.strokeStyle = rgb(light, 0.5)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx, s)
    ctx.lineTo(cx, s * 0.03)
    ctx.stroke()

    // Darker margins.
    const edge = ctx.createRadialGradient(cx, s * 0.5, s * 0.25, cx, s * 0.5, s * 0.62)
    edge.addColorStop(0, 'rgba(0,0,0,0)')
    edge.addColorStop(1, rgb(dark, 0.35))
    ctx.fillStyle = edge
    ctx.fillRect(0, 0, s, s)
  })
}
