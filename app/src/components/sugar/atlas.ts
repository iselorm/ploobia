/**
 * The Sugar Line's visual kit: palette, canvas textures and the small shader
 * chunks the stage is built from.
 *
 * The look is a **field-guide plate**, not a diorama. A cream ground, a
 * specimen floating over a pale podium, hairline rules, a scale bar, and
 * annotation that behaves like a plate caption. Two references shaped it:
 *
 * — *Seed Atlas* (seedsatlas.vercel.app) for the chrome: warm #F6F2E8 ground,
 *   white cards with hairline borders, a serif display face over a rounded
 *   sans, letterspaced uppercase eyebrows, tiny chips, and a specimen on a
 *   soft podium with a scale bar in the corner.
 * — *ThreeUI* (github.com/MengTo/threeui, MIT) for the motion vocabulary. Its
 *   components are sandboxed background documents rather than R3F primitives,
 *   so what is imported here is the technique, ported into the cabinet's own
 *   single canvas: the Dot Matrix pulse grid becomes the plate's backdrop, the
 *   Structure Flow particle dome becomes the CO₂ field, Orbital Sphere becomes
 *   the electron-transport rings, and the Sylva survey pulse becomes Reaction
 *   Vision's travelling wavefront.
 *
 * Every texture here is generated on a canvas at runtime, because the whole
 * arcade ships as one self-contained HTML file with no external assets.
 */

import * as THREE from 'three'

/* ------------------------------------------------------------------ */
/* Palette                                                            */
/* ------------------------------------------------------------------ */

export const ATLAS = {
  /** Page ground — Seed Atlas's cream. */
  paper: '#F6F2E8',
  paperDeep: '#EDE7D8',
  card: '#FCFAF4',
  rule: '#E4DCC9',
  ink: '#2A2823',
  muted: '#7C8177',
  faint: '#A9A395',

  /** Chlorophyll green — the house accent, kept from Ploobia. */
  green: '#3E7C43',
  greenDeep: '#255730',
  greenSoft: '#DDEBD9',

  /** Sugar. Everything carbon-bearing on its way somewhere is this gold. */
  sugar: '#D99B2B',
  sugarLight: '#F3C05A',
  sugarDeep: '#8A5A0B',
  sugarSoft: '#FBEBD2',

  /** Water and the xylem. */
  water: '#3E90D0',
  waterDeep: '#12496F',
  waterSoft: '#DCEAF6',

  /** Gases. */
  co2: '#6C7480',
  oxygen: '#7EC8EE',

  /** Warnings and the cut. */
  alert: '#C13B33',
  alertSoft: '#F6DEDC',
} as const

/** Display face for specimen names and eyebrows. Falls back cleanly offline. */
export const SERIF = "'Fraunces', 'Iowan Old Style', Georgia, 'Times New Roman', serif"

/* ------------------------------------------------------------------ */
/* Texture cache                                                      */
/* ------------------------------------------------------------------ */

const cache = new Map<string, THREE.CanvasTexture>()

function make(
  key: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  configure?: (t: THREE.CanvasTexture) => void,
): THREE.CanvasTexture {
  const hit = cache.get(key)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (ctx) draw(ctx, width, height)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.anisotropy = 4
  configure?.(texture)
  texture.needsUpdate = true
  cache.set(key, texture)
  return texture
}

/**
 * The underside of a leaf: pavement cells, drawn once.
 *
 * Epidermal cells are the jigsaw pieces every microscope slide shows — here
 * as a field of soft irregular blobs with a darker wall between them, on the
 * pale green of a leaf's lower surface. Seeded by hand so the picture is the
 * same on every visit; the stoma the stage draws sits in the middle of it.
 */
export function leafSkinTexture(): THREE.CanvasTexture {
  return make(
    'leaf-skin',
    1024,
    1024,
    (ctx, w, h) => {
      ctx.fillStyle = '#B9D19E'
      ctx.fillRect(0, 0, w, h)
      let seed = 20260905
      const rnd = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0
        return seed / 4294967296
      }
      // Cells: a jittered grid of blobs, each a few overlapping ellipses.
      const cols = 9
      const rows = 9
      for (let r = -1; r <= rows; r++) {
        for (let c = -1; c <= cols; c++) {
          const cx = ((c + 0.5 + (rnd() - 0.5) * 0.7) / cols) * w
          const cy = ((r + 0.5 + (rnd() - 0.5) * 0.7) / rows) * h
          // Leave the middle clear for the stoma.
          const dx = cx - w / 2
          const dy = cy - h / 2
          if (Math.hypot(dx / 1.35, dy) < 150) continue
          const rx = (w / cols) * (0.55 + rnd() * 0.35)
          const ry = (h / rows) * (0.5 + rnd() * 0.35)
          ctx.save()
          ctx.translate(cx, cy)
          ctx.rotate(rnd() * Math.PI)
          ctx.beginPath()
          ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255,255,255,${0.09 + rnd() * 0.08})`
          ctx.fill()
          ctx.lineWidth = 6
          ctx.strokeStyle = 'rgba(70,110,60,0.35)'
          ctx.stroke()
          ctx.restore()
        }
      }
      // A soft vignette so the edges of the field fall away.
      const v = ctx.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.75)
      v.addColorStop(0, 'rgba(0,0,0,0)')
      v.addColorStop(1, 'rgba(60,90,50,0.35)')
      ctx.fillStyle = v
      ctx.fillRect(0, 0, w, h)
    },
    (t) => {
      t.wrapS = THREE.ClampToEdgeWrapping
      t.wrapT = THREE.ClampToEdgeWrapping
    },
  )
}

/* ------------------------------------------------------------------ */
/* Sprites                                                            */
/* ------------------------------------------------------------------ */

/** A soft radial blob — glows, pools of light, sink haloes. */
export function glowSprite(inner: string, outer: string, key: string): THREE.CanvasTexture {
  return make(`glow:${key}`, 128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    g.addColorStop(0, inner)
    g.addColorStop(0.45, outer)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  })
}

/**
 * The shadow the specimen casts onto its podium. Elliptical and soft-edged: a
 * hard disc reads as a sticker, and without any contact patch at all the plant
 * looks like it is hovering.
 */
export function podiumShadow(): THREE.CanvasTexture {
  return make('podium-shadow', 256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    g.addColorStop(0, 'rgba(74, 62, 40, 0.42)')
    g.addColorStop(0.4, 'rgba(74, 62, 40, 0.2)')
    g.addColorStop(0.75, 'rgba(74, 62, 40, 0.05)')
    g.addColorStop(1, 'rgba(74, 62, 40, 0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  })
}

/** A thin bright ring — the survey wavefront, and the press-me rings on sinks. */
export function ringSprite(color = 'rgba(217, 155, 43, 0.95)'): THREE.CanvasTexture {
  return make(`ring:${color}`, 160, 160, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.strokeStyle = color
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.arc(w / 2, h / 2, w / 2 - 10, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 0.34
    ctx.lineWidth = 18
    ctx.stroke()
  })
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                           */
/* ------------------------------------------------------------------ */

/**
 * A leaf lamina with venation. The midrib and the secondaries are drawn, not
 * bump-mapped: at the scale this cabinet frames a leaf, real veins are the
 * thing a learner is being asked to look at — they are the pipes.
 */
export function laminaTexture(base: string, vein: string, back: string): THREE.CanvasTexture {
  return make(`lamina:${base}:${vein}:${back}`, 256, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, back)
    g.addColorStop(0.35, base)
    g.addColorStop(1, base)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)

    // Mottling, so the surface is not a flat swatch.
    ctx.globalAlpha = 0.06
    for (let i = 0; i < 220; i++) {
      const x = Math.random() * w
      const y = Math.random() * h
      const r = 6 + Math.random() * 26
      ctx.fillStyle = Math.random() > 0.5 ? '#FFFFFF' : '#14320F'
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // Midrib up the centre.
    ctx.strokeStyle = vein
    ctx.lineCap = 'round'
    ctx.globalAlpha = 0.85
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.moveTo(w / 2, h)
    ctx.lineTo(w / 2, 6)
    ctx.stroke()

    // Secondaries, sweeping toward the tip.
    ctx.lineWidth = 3
    ctx.globalAlpha = 0.6
    for (let i = 1; i <= 9; i++) {
      const t = i / 10
      const y = h - t * h * 0.95
      const reach = w * 0.44 * Math.sin(Math.PI * Math.min(1, t * 1.15))
      for (const side of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(w / 2, y)
        ctx.quadraticCurveTo(w / 2 + side * reach * 0.6, y - h * 0.03, w / 2 + side * reach, y - h * 0.09)
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
  })
}

/** Longitudinal grain for a stem or a root. */
export function stemTexture(base: string, dark: string): THREE.CanvasTexture {
  return make(
    `stem:${base}:${dark}`,
    128,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = base
      ctx.fillRect(0, 0, w, h)
      ctx.globalAlpha = 0.16
      ctx.strokeStyle = dark
      for (let i = 0; i < 26; i++) {
        const x = Math.random() * w
        ctx.lineWidth = 0.6 + Math.random() * 2.4
        ctx.beginPath()
        ctx.moveTo(x, -10)
        ctx.bezierCurveTo(x + 8, h * 0.3, x - 8, h * 0.7, x, h + 10)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    },
    (t) => {
      t.wrapS = THREE.RepeatWrapping
      t.wrapT = THREE.RepeatWrapping
    },
  )
}

/**
 * The cut face of a stem, drawn as real tissue: an epidermis, a cortex, then a
 * ring of vascular bundles each with phloem on the outside and xylem on the
 * inside, around a pale pith. Getting that order right matters — it is the
 * whole reason ring-barking removes the phloem and leaves the xylem behind.
 */
export function stemSectionTexture(): THREE.CanvasTexture {
  return make('stem-section', 512, 512, (ctx, w) => {
    const c = w / 2
    const R = w * 0.46
    ctx.clearRect(0, 0, w, w)

    // Pith and cortex.
    ctx.fillStyle = '#EFE6CE'
    ctx.beginPath()
    ctx.arc(c, c, R, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#DCE8CC'
    ctx.beginPath()
    ctx.arc(c, c, R * 0.9, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#F3EEDC'
    ctx.beginPath()
    ctx.arc(c, c, R * 0.52, 0, Math.PI * 2)
    ctx.fill()

    // Cortex cells.
    ctx.strokeStyle = 'rgba(90, 110, 70, 0.25)'
    ctx.lineWidth = 1.4
    for (let ring = 0; ring < 4; ring++) {
      const rr = R * (0.58 + ring * 0.08)
      const n = 22 + ring * 6
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        ctx.beginPath()
        ctx.arc(c + Math.cos(a) * rr, c + Math.sin(a) * rr, R * 0.035, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    // Eight vascular bundles: phloem outside, cambium, xylem inside.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2
      const bx = c + Math.cos(a) * R * 0.68
      const by = c + Math.sin(a) * R * 0.68
      ctx.save()
      ctx.translate(bx, by)
      ctx.rotate(a + Math.PI / 2)

      // Phloem — the sugar pipe, on the outside.
      ctx.fillStyle = '#E8C173'
      ctx.beginPath()
      ctx.ellipse(0, -R * 0.055, R * 0.075, R * 0.05, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#B8862B'
      ctx.lineWidth = 2
      ctx.stroke()
      // Sieve plates.
      ctx.fillStyle = '#B8862B'
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath()
        ctx.arc(k * R * 0.038, -R * 0.055, R * 0.014, 0, Math.PI * 2)
        ctx.fill()
      }

      // Xylem — the water pipe, on the inside, with big open vessels.
      ctx.fillStyle = '#CFE0EF'
      ctx.beginPath()
      ctx.ellipse(0, R * 0.055, R * 0.085, R * 0.062, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#5C86A8'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = '#8FB4D2'
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath()
        ctx.arc(k * R * 0.04, R * 0.055, R * 0.02, 0, Math.PI * 2)
        ctx.fill()
      }

      // The cambium between them.
      ctx.strokeStyle = 'rgba(70, 100, 60, 0.6)'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(-R * 0.08, 0)
      ctx.lineTo(R * 0.08, 0)
      ctx.stroke()
      ctx.restore()
    }

    // Epidermis.
    ctx.strokeStyle = '#5F7A4A'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(c, c, R, 0, Math.PI * 2)
    ctx.stroke()
  })
}

/** Soil: a warm, grainy band with a few stones. Drawn once, used on the cut face. */
export function soilTexture(): THREE.CanvasTexture {
  return make(
    'soil',
    256,
    256,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, '#B08A63')
      g.addColorStop(0.5, '#9C7752')
      g.addColorStop(1, '#8A6749')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      for (let i = 0; i < 900; i++) {
        ctx.globalAlpha = 0.05 + Math.random() * 0.14
        ctx.fillStyle = Math.random() > 0.6 ? '#A88055' : '#3E2A1A'
        const r = 0.7 + Math.random() * 2.6
        ctx.beginPath()
        ctx.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    },
    (t) => {
      t.wrapS = THREE.RepeatWrapping
      t.wrapT = THREE.RepeatWrapping
    },
  )
}

/**
 * The thylakoid membrane sheet, seen from inside the chloroplast: a dense
 * green quilt with the photosystem complexes embedded in it as darker studs.
 */
export function thylakoidTexture(): THREE.CanvasTexture {
  return make(
    'thylakoid',
    256,
    256,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, h)
      g.addColorStop(0, '#2F6B36')
      g.addColorStop(0.5, '#3F8A44')
      g.addColorStop(1, '#2A5E31')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      for (let i = 0; i < 60; i++) {
        ctx.globalAlpha = 0.5
        ctx.fillStyle = '#1E4A25'
        const x = Math.random() * w
        const y = Math.random() * h
        ctx.beginPath()
        ctx.ellipse(x, y, 7 + Math.random() * 8, 5 + Math.random() * 6, Math.random() * 3, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 0.28
        ctx.fillStyle = '#8FD07A'
        ctx.beginPath()
        ctx.arc(x - 2, y - 2, 2.6, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    },
    (t) => {
      t.wrapS = THREE.RepeatWrapping
      t.wrapT = THREE.RepeatWrapping
    },
  )
}

/* ------------------------------------------------------------------ */
/* Backdrop                                                           */
/* ------------------------------------------------------------------ */

/**
 * The plate's dot grid.
 *
 * Ported from ThreeUI's Dot Matrix (MIT, Meng To): a fragment shader that
 * tiles the plane, measures the distance to each cell centre and swells the
 * dot with a slow travelling pulse. The original is cyan on black; this one is
 * warm graphite on cream and sits a long way behind the specimen, so it reads
 * as squared paper rather than as an effect.
 */
export const DOT_GRID_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const DOT_GRID_FRAG = /* glsl */ `
uniform float uTime;
uniform float uGridScale;
uniform float uPulseSpeed;
uniform float uRadius;
uniform float uOpacity;
uniform vec3  uColor;
varying vec2 vUv;

void main() {
  vec2 uv = vUv * uGridScale;
  vec2 cell = fract(uv) - 0.5;
  vec2 id = floor(uv);
  float dist = length(cell);
  float pulse = sin(uTime * uPulseSpeed + id.x * 0.35 + id.y * 0.21) * 0.5 + 0.5;
  float radius = 0.055 + pulse * uRadius;
  float alpha = smoothstep(radius, radius - 0.035, dist);
  // The grid fades out toward the edges so it never fights the specimen.
  float vignette = smoothstep(1.0, 0.25, length(vUv - 0.5) * 1.9);
  gl_FragColor = vec4(uColor, alpha * vignette * uOpacity * (0.55 + pulse * 0.45));
}
`

/**
 * Reaction Vision's travelling wavefront.
 *
 * The idea is Sylva's survey pulse (ThreeUI, MIT): a bright ring exactly on the
 * wavefront over a dim cage that burns off behind it. Here the wavefront runs
 * up the plant, and what it lights as it passes is the chemistry happening at
 * that height — so the annotation arrives in the order the carbon does.
 */
export function pulseStrength(height01: number, pulse: number, width = 0.11): number {
  const d = Math.abs(height01 - pulse)
  return Math.max(0, 1 - d / width)
}

/* ------------------------------------------------------------------ */
/* Lighting                                                           */
/* ------------------------------------------------------------------ */

/**
 * A tiny procedural environment map: a 16×32 warm-to-cool vertical gradient run
 * through PMREM. Physically based materials look wrong without *something* to
 * reflect, and this is the whole environment in a few hundred bytes — no HDRI,
 * no download, nothing to break the single-file build. (The recipe is the one
 * distilled from the Anatomy Atelier study in the vault.)
 */
export function atlasEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const width = 16
  const height = 32
  const data = new Uint8Array(width * height * 4)
  const top = new THREE.Color('#FFF3D8')
  const mid = new THREE.Color('#F6F2E8')
  const bottom = new THREE.Color('#D9D2BF')
  const c = new THREE.Color()
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1)
    if (t < 0.5) c.copy(top).lerp(mid, t * 2)
    else c.copy(mid).lerp(bottom, (t - 0.5) * 2)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      data[i] = Math.round(c.r * 255)
      data[i + 1] = Math.round(c.g * 255)
      data[i + 2] = Math.round(c.b * 255)
      data[i + 3] = 255
    }
  }
  const source = new THREE.DataTexture(data, width, height)
  source.colorSpace = THREE.SRGBColorSpace
  source.needsUpdate = true
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromEquirectangular(source).texture
  pmrem.dispose()
  source.dispose()
  return env
}

/* ------------------------------------------------------------------ */
/* Habitat                                                            */
/* ------------------------------------------------------------------ */

/**
 * The silhouette standing on the horizon, as a white alpha mask to be tinted
 * per instance.
 *
 * A distant skyline is the cheapest possible way to say *where you are*: five
 * quads' worth of shape does more for "this is a desert" than any amount of
 * ground shader. Drawn as flat masks rather than modelled, because at forty
 * units away nobody can tell and one instanced draw call is the whole cost.
 */
export function skylineTexture(kind: string): THREE.CanvasTexture {
  return make(
    `skyline:${kind}`,
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#FFFFFF'
      const base = h * 0.98
      const cx = w / 2

      const trunk = (topY: number, halfWidth: number) => {
        ctx.beginPath()
        ctx.moveTo(cx - halfWidth, base)
        ctx.lineTo(cx - halfWidth * 0.55, topY)
        ctx.lineTo(cx + halfWidth * 0.55, topY)
        ctx.lineTo(cx + halfWidth, base)
        ctx.closePath()
        ctx.fill()
      }
      const blob = (x: number, y: number, rx: number, ry: number) => {
        ctx.beginPath()
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
        ctx.fill()
      }

      if (kind === 'conifer') {
        trunk(h * 0.72, w * 0.035)
        // Three stacked skirts, each narrower than the one below.
        for (let i = 0; i < 4; i++) {
          const t = i / 3
          const y0 = h * (0.82 - t * 0.24)
          const y1 = y0 - h * 0.24
          const halfWidth = w * (0.3 - t * 0.19)
          ctx.beginPath()
          ctx.moveTo(cx - halfWidth, y0)
          ctx.lineTo(cx, y1)
          ctx.lineTo(cx + halfWidth, y0)
          ctx.closePath()
          ctx.fill()
        }
      } else if (kind === 'acacia') {
        // The flat-topped umbrella that says savanna at any distance.
        trunk(h * 0.5, w * 0.045)
        ctx.beginPath()
        ctx.moveTo(cx - w * 0.44, h * 0.42)
        ctx.quadraticCurveTo(cx - w * 0.3, h * 0.24, cx, h * 0.25)
        ctx.quadraticCurveTo(cx + w * 0.3, h * 0.24, cx + w * 0.44, h * 0.42)
        ctx.quadraticCurveTo(cx, h * 0.36, cx - w * 0.44, h * 0.42)
        ctx.closePath()
        ctx.fill()
        // A second, thinner branch line under the canopy.
        ctx.lineWidth = w * 0.02
        ctx.strokeStyle = '#FFFFFF'
        ctx.beginPath()
        ctx.moveTo(cx, h * 0.62)
        ctx.lineTo(cx - w * 0.24, h * 0.4)
        ctx.moveTo(cx, h * 0.62)
        ctx.lineTo(cx + w * 0.26, h * 0.41)
        ctx.stroke()
      } else if (kind === 'butte') {
        // Flat-topped mesa with a talus skirt, plus one saguaro to the side.
        ctx.beginPath()
        ctx.moveTo(cx - w * 0.46, base)
        ctx.lineTo(cx - w * 0.34, h * 0.46)
        ctx.lineTo(cx - w * 0.3, h * 0.36)
        ctx.lineTo(cx + w * 0.22, h * 0.36)
        ctx.lineTo(cx + w * 0.28, h * 0.5)
        ctx.lineTo(cx + w * 0.42, base)
        ctx.closePath()
        ctx.fill()
        const sx = cx + w * 0.4
        ctx.fillRect(sx - w * 0.03, h * 0.6, w * 0.06, base - h * 0.6)
        ctx.fillRect(sx - w * 0.13, h * 0.68, w * 0.035, h * 0.12)
        ctx.fillRect(sx - w * 0.13, h * 0.68, w * 0.1, h * 0.035)
      } else if (kind === 'canopy') {
        // Rainforest: a tall emergent with a wide crown, buttressed at the foot.
        trunk(h * 0.4, w * 0.05)
        blob(cx, h * 0.3, w * 0.34, h * 0.16)
        blob(cx - w * 0.24, h * 0.38, w * 0.2, h * 0.11)
        blob(cx + w * 0.25, h * 0.36, w * 0.21, h * 0.12)
        blob(cx, h * 0.5, w * 0.3, h * 0.1)
        ctx.beginPath()
        ctx.moveTo(cx - w * 0.16, base)
        ctx.lineTo(cx - w * 0.05, h * 0.74)
        ctx.lineTo(cx + w * 0.05, h * 0.74)
        ctx.lineTo(cx + w * 0.16, base)
        ctx.closePath()
        ctx.fill()
      } else {
        // broadleaf: the hedgerow oak.
        trunk(h * 0.56, w * 0.05)
        blob(cx, h * 0.42, w * 0.32, h * 0.2)
        blob(cx - w * 0.22, h * 0.5, w * 0.19, h * 0.14)
        blob(cx + w * 0.22, h * 0.49, w * 0.2, h * 0.14)
      }
    },
    (t) => {
      t.wrapS = THREE.ClampToEdgeWrapping
      t.wrapT = THREE.ClampToEdgeWrapping
    },
  )
}

/**
 * One shaft of sunlight, drawn as a strip.
 *
 * Soft down both long edges so the beam has no hard sides, and fading out at
 * both ends: the top so it emerges from nowhere in particular rather than
 * starting at a visible line, the bottom so it dissolves into the leaf it
 * lands on instead of stopping dead against it.
 */
export function beamTexture(): THREE.CanvasTexture {
  return make('sun-beam', 64, 256, (ctx, w, h) => {
    // Across: bright core, soft shoulders.
    const across = ctx.createLinearGradient(0, 0, w, 0)
    across.addColorStop(0, 'rgba(255,255,255,0)')
    across.addColorStop(0.34, 'rgba(255,246,214,0.55)')
    across.addColorStop(0.5, 'rgba(255,252,236,0.95)')
    across.addColorStop(0.66, 'rgba(255,246,214,0.55)')
    across.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = across
    ctx.fillRect(0, 0, w, h)

    // Along: fade both ends. `destination-in` keeps the shape and multiplies
    // the alpha, which is what makes the two gradients compose.
    ctx.globalCompositeOperation = 'destination-in'
    const along = ctx.createLinearGradient(0, 0, 0, h)
    along.addColorStop(0, 'rgba(0,0,0,0)')
    along.addColorStop(0.22, 'rgba(0,0,0,0.85)')
    along.addColorStop(0.78, 'rgba(0,0,0,1)')
    along.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = along
    ctx.fillRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'source-over'
  })
}

/** A soft round mote — pollen, dust, spores, snow. One sprite, tinted per habitat. */
export function moteSprite(): THREE.CanvasTexture {
  return make('habitat-mote', 64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.35, 'rgba(255,255,255,0.7)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  })
}
