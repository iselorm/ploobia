/**
 * Canvas textures for the market — the things whose *text or pattern is the
 * state*: the chalk board (its number changes), the stall sign (language-keyed
 * later), the roof cloth stripes. Drawn once, redrawn only when the state
 * changes, so they cost no draw calls of their own.
 */

import * as THREE from 'three'

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  return [c, ctx]
}

function texture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/**
 * Red-and-cream stripes for the canopy — sun-faded a third (review 1: the
 * awnings dominated the composition; Ploob, the basin and the plates lead).
 */
export function stripesTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 64)
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#EDE5D6' : '#B9605A'
    ctx.fillRect(i * 32, 0, 32, 64)
  }
  // faded cloth: a warm wash over the whole thing
  ctx.fillStyle = 'rgba(230, 205, 170, 0.18)'
  ctx.fillRect(0, 0, 256, 64)
  // a little wear along the hem
  ctx.fillStyle = 'rgba(60, 30, 10, 0.12)'
  ctx.fillRect(0, 56, 256, 8)
  const t = texture(c)
  t.wrapS = THREE.RepeatWrapping
  t.repeat.set(3, 1)
  return t
}

/** The stall's hand-painted sign. */
export function signTexture(text: string): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 128)
  ctx.fillStyle = '#F6E7C6'
  ctx.fillRect(0, 0, 512, 128)
  ctx.strokeStyle = '#8A5A2B'
  ctx.lineWidth = 8
  ctx.strokeRect(6, 6, 500, 116)
  ctx.fillStyle = '#B5541C'
  ctx.font = '900 76px Nunito, ui-rounded, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 256, 68)
  return texture(c)
}

/** The chalk board. Called again whenever the price changes. */
export function drawBoard(c: HTMLCanvasElement, eyebrow: string, big: string, small?: string): void {
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#2A2823'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.strokeStyle = '#8A5A2B'
  ctx.lineWidth = 14
  ctx.strokeRect(7, 7, c.width - 14, c.height - 14)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#F0D39A'
  ctx.font = '800 34px Nunito, ui-rounded, system-ui, sans-serif'
  ctx.fillText(eyebrow.toUpperCase(), c.width / 2, 58)
  ctx.fillStyle = '#FBF8EF'
  ctx.font = `900 ${big.length > 7 ? 104 : 128}px Nunito, ui-rounded, system-ui, sans-serif`
  ctx.fillText(big, c.width / 2, c.height / 2 + 12)
  if (small) {
    ctx.fillStyle = '#D8D0BC'
    ctx.font = '800 30px Nunito, ui-rounded, system-ui, sans-serif'
    ctx.fillText(small, c.width / 2, c.height - 52)
  }
}

export function boardTexture(eyebrow: string, big: string, small?: string): { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture } {
  const [c] = canvas(512, 400)
  drawBoard(c, eyebrow, big, small)
  return { canvas: c, texture: texture(c) }
}

/** A stand-in for a painted back card: the alley as a soft gradient with stall shapes. */
export function backCardStandIn(late: boolean): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 288)
  const sky = ctx.createLinearGradient(0, 0, 0, 288)
  if (late) {
    sky.addColorStop(0, '#8FA6C9')
    sky.addColorStop(0.45, '#E9C5A0')
    sky.addColorStop(0.52, '#D9A77A')
    sky.addColorStop(1, '#B9834F')
  } else {
    sky.addColorStop(0, '#BFD6EA')
    sky.addColorStop(0.48, '#E9D9C2')
    sky.addColorStop(0.52, '#D8B98F')
    sky.addColorStop(1, '#C79A66')
  }
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, 512, 288)
  // rows of stalls, receding
  for (let i = 0; i < 7; i++) {
    const k = i / 7
    const y = 120 + k * 60
    const h = 70 - k * 44
    const wl = 160 - k * 120
    ctx.fillStyle = `rgba(138, 90, 43, ${0.55 - k * 0.4})`
    ctx.fillRect(40 + k * 60, y, wl, h)
    ctx.fillRect(472 - k * 60 - wl, y, wl, h)
    ctx.fillStyle = `rgba(192, 69, 60, ${0.5 - k * 0.35})`
    ctx.fillRect(40 + k * 60 - 6, y - 10, wl + 12, 12)
    ctx.fillRect(472 - k * 60 - wl - 6, y - 10, wl + 12, 12)
  }
  return texture(c)
}
