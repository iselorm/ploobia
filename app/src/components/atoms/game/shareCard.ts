import { CATEGORY_META, ELEMENT_BY_Z } from '@/lib/atoms'
import type { Build, ShareCard } from '@/lib/foundry'

/** Draw the share card on a 2D canvas — the picture that travels on a status where a link is not tapped. */
export function drawShareCard(canvas: HTMLCanvasElement, card: ShareCard, build: Build): void {
  const W = 720
  const H = 900
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#F6E6C9')
  bg.addColorStop(1, '#DDBE8E')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  // the atom
  const cx = W / 2
  const cy = 300
  ctx.strokeStyle = 'rgba(138, 84, 16, 0.6)'
  ctx.lineWidth = 3
  const shells = Math.max(1, Math.ceil(build.electrons / 2))
  for (let s = 0; s < Math.min(shells, 3); s++) {
    ctx.beginPath()
    ctx.arc(cx, cy, 120 + s * 70, 0, Math.PI * 2)
    ctx.stroke()
  }
  const drawBall = (x: number, y: number, r: number, color: string, glyph: string) => {
    const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r)
    grad.addColorStop(0, '#fff')
    grad.addColorStop(0.35, color)
    grad.addColorStop(1, 'rgba(40, 26, 8, 0.9)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = `900 ${Math.round(r * 0.9)}px Nunito, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.strokeStyle = 'rgba(40,26,8,0.8)'
    ctx.lineWidth = 3
    ctx.strokeText(glyph, x, y)
    ctx.fillText(glyph, x, y)
  }
  const nucleons = [...Array(build.protons).fill('p'), ...Array(build.neutrons).fill('n')] as Array<'p' | 'n'>
  nucleons.forEach((k, i) => {
    const a = (i / Math.max(1, nucleons.length)) * Math.PI * 2
    const rr = nucleons.length === 1 ? 0 : 26 + (i % 2) * 14
    drawBall(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 26, k === 'p' ? '#E8A33D' : '#9AA4B2', k === 'p' ? 'p⁺' : 'n⁰')
  })
  for (let i = 0; i < build.electrons; i++) {
    const shell = Math.min(2, Math.floor(i / 2))
    const a = (i * 2.4) % (Math.PI * 2)
    const rr = 120 + shell * 70
    drawBall(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 16, '#63E0FF', 'e⁻')
  }
  // the plate
  ctx.fillStyle = '#FCFAF4'
  ctx.beginPath()
  ctx.roundRect(40, 560, W - 80, 300, 24)
  ctx.fill()
  ctx.fillStyle = '#2A2823'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = '600 40px Fraunces, Georgia, serif'
  ctx.fillText(card.headline, 70, 622)
  ctx.font = '800 22px Nunito, system-ui, sans-serif'
  ctx.fillStyle = '#8B8471'
  ctx.fillText(`${card.nuclide.a}${card.nuclide.symbol}${card.nuclide.charge} · ${card.trials} trial${card.trials === 1 ? '' : 's'} · ${'★'.repeat(card.stars)}`, 70, 662)
  ctx.font = '900 28px Nunito, system-ui, sans-serif'
  ctx.fillStyle = '#8A5410'
  ctx.fillText(card.dare, 70, 720)
  // the lit wall
  const tiles = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  tiles.forEach((z, i) => {
    const e = ELEMENT_BY_Z[z]
    ctx.fillStyle = CATEGORY_META[e.category].tint
    ctx.globalAlpha = card.lit.includes(z) ? 1 : 0.18
    ctx.beginPath()
    ctx.roundRect(70 + i * 56, 748, 48, 48, 8)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = '#fff'
    ctx.font = '900 18px Nunito, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(e.symbol, 94 + i * 56, 780)
  })
  ctx.textAlign = 'left'
  ctx.font = '800 18px Nunito, system-ui, sans-serif'
  ctx.fillStyle = '#8B8471'
  ctx.fillText('Made in Ploobia · the link is the challenge', 70, 838)
}

