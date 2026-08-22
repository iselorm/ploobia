/**
 * Procedural textures for the Motion Lab. Everything the learner reads in the
 * room — the rule's scale, the marker numbers on the bench, the stopwatch
 * digits, the dial's labels, the chalkboard — is drawn onto a canvas and
 * mapped onto geometry, so it lives in the world, is subject to depth, and
 * never floats as an overlay.
 */

import * as THREE from 'three'

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { c, ctx: c.getContext('2d')! }
}

function tex(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/** Warm lab floor: large pale tiles with a faint grout grid. */
export function floorTexture(): THREE.CanvasTexture {
  const { c, ctx } = canvas(512, 512)
  ctx.fillStyle = '#9E9280'
  ctx.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = `rgba(${60 + Math.random() * 40},${50 + Math.random() * 30},${40 + Math.random() * 20},${Math.random() * 0.08})`
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2)
  }
  ctx.strokeStyle = 'rgba(70,58,44,0.35)'
  ctx.lineWidth = 3
  for (let i = 0; i <= 512; i += 128) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i, 512)
    ctx.moveTo(0, i)
    ctx.lineTo(512, i)
    ctx.stroke()
  }
  const t = tex(c, true)
  t.repeat.set(5, 4)
  return t
}

/** Bench top: pale beech with a subtle grain. */
export function woodTexture(): THREE.CanvasTexture {
  const { c, ctx } = canvas(1024, 256)
  ctx.fillStyle = '#C9A46E'
  ctx.fillRect(0, 0, 1024, 256)
  for (let i = 0; i < 90; i++) {
    const y = Math.random() * 256
    ctx.strokeStyle = `rgba(${120 + Math.random() * 40},${80 + Math.random() * 30},40,${0.08 + Math.random() * 0.12})`
    ctx.lineWidth = 1 + Math.random() * 3
    ctx.beginPath()
    ctx.moveTo(0, y)
    for (let x = 0; x <= 1024; x += 64) ctx.lineTo(x, y + Math.sin(x * 0.01 + i) * 6)
    ctx.stroke()
  }
  return tex(c)
}

/**
 * The scale painted along the bench's front edge: "0" at the start line and a
 * tick every 10 cm, numbered every 50 cm in metres. `metres` = length of the
 * strip; `origin` = where 0 sits, as a fraction of the strip.
 */
export function edgeScaleTexture(metres: number, originFrac: number): THREE.CanvasTexture {
  const W = 2048
  const H = 128
  const { c, ctx } = canvas(W, H)
  ctx.fillStyle = '#F4EBD8'
  ctx.fillRect(0, 0, W, H)
  const px = (m: number) => (originFrac + m / metres) * W
  ctx.strokeStyle = '#2B2B2B'
  ctx.fillStyle = '#2B2B2B'
  for (let cm = -50; cm <= metres * 100; cm += 10) {
    const x = px(cm / 100)
    if (x < 0 || x > W) continue
    const major = cm % 50 === 0
    ctx.lineWidth = major ? 4 : 2
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, major ? 52 : 30)
    ctx.stroke()
    if (major && cm >= 0) {
      ctx.font = 'bold 56px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText((cm / 100).toFixed(1), x, 112)
    }
  }
  ctx.font = 'bold 34px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('m', px(metres) - 60, 112)
  // Start line marker.
  ctx.fillStyle = '#C13B33'
  ctx.fillRect(px(0) - 5, 0, 10, H)
  return tex(c)
}

/** A metre rule: mm-ish ticks, numbered every 10 cm. */
export function ruleTexture(): THREE.CanvasTexture {
  const W = 2048
  const H = 96
  const { c, ctx } = canvas(W, H)
  ctx.fillStyle = '#EAD9A8'
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = '#1F1F1F'
  ctx.fillStyle = '#1F1F1F'
  for (let mm = 0; mm <= 1000; mm += 5) {
    const x = (mm / 1000) * (W - 40) + 20
    const ten = mm % 10 === 0
    const cm = mm % 100 === 0
    ctx.lineWidth = cm ? 3 : ten ? 2 : 1
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, cm ? 44 : ten ? 28 : 16)
    ctx.stroke()
    if (cm) {
      ctx.font = 'bold 30px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(String(mm / 10), x, 82)
    }
  }
  ctx.font = 'bold 22px system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText('cm', W - 6, 82)
  return tex(c)
}

/** A live stopwatch face. Call `draw` whenever the reading changes. */
export function stopwatchFace(): { texture: THREE.CanvasTexture; draw: (seconds: number, running: boolean, flick: number | null) => void } {
  const S = 512
  const { c, ctx } = canvas(S, S)
  const texture = tex(c)
  let last = ''
  const draw = (seconds: number, running: boolean, flick: number | null) => {
    const key = `${seconds.toFixed(2)}|${running}|${flick === null ? '' : flick.toFixed(2)}`
    if (key === last) return
    last = key
    ctx.clearRect(0, 0, S, S)
    ctx.fillStyle = '#F7F1E4'
    ctx.beginPath()
    ctx.arc(S / 2, S / 2, S / 2 - 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#8A8378'
    ctx.lineWidth = 10
    ctx.stroke()
    // Ticks
    ctx.strokeStyle = '#3B3A36'
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2
      const r0 = i % 5 === 0 ? S * 0.40 : S * 0.44
      ctx.lineWidth = i % 5 === 0 ? 5 : 2
      ctx.beginPath()
      ctx.moveTo(S / 2 + Math.cos(a) * r0, S / 2 + Math.sin(a) * r0)
      ctx.lineTo(S / 2 + Math.cos(a) * S * 0.47, S / 2 + Math.sin(a) * S * 0.47)
      ctx.stroke()
    }
    // Digital reading
    ctx.fillStyle = running ? '#1F5F2A' : '#2B2B2B'
    ctx.font = 'bold 118px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textAlign = 'center'
    ctx.fillText(seconds.toFixed(2), S / 2, S / 2 + 42)
    ctx.font = 'bold 34px system-ui, sans-serif'
    ctx.fillStyle = '#7A5252'
    ctx.fillText(running ? 'RUNNING' : 'seconds', S / 2, S / 2 + 96)
    // Sweep hand
    const a = (seconds % 60) / 60 * Math.PI * 2 - Math.PI / 2
    ctx.strokeStyle = '#C13B33'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(S / 2, S / 2)
    ctx.lineTo(S / 2 + Math.cos(a) * S * 0.42, S / 2 + Math.sin(a) * S * 0.42)
    ctx.stroke()
    // Early/late flick
    if (flick !== null) {
      const late = flick > 0
      ctx.fillStyle = Math.abs(flick) < 0.12 ? '#2E7D32' : late ? '#B97D10' : '#2E6DA8'
      ctx.font = 'bold 40px system-ui, sans-serif'
      ctx.fillText(`${late ? 'late' : 'early'} ${Math.abs(flick).toFixed(2)} s`, S / 2, S * 0.30)
    }
    texture.needsUpdate = true
  }
  draw(0, false, null)
  return { texture, draw }
}

/** The gravity dial's ring of world names. */
export function dialTexture(labels: string[]): THREE.CanvasTexture {
  const S = 512
  const { c, ctx } = canvas(S, S)
  ctx.fillStyle = '#EDE4D2'
  ctx.beginPath()
  ctx.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#6E655A'
  ctx.lineWidth = 8
  ctx.stroke()
  ctx.fillStyle = '#2B2B2B'
  ctx.font = 'bold 44px system-ui, sans-serif'
  ctx.textAlign = 'center'
  const n = labels.length
  labels.forEach((l, i) => {
    // Spread across the top 200° of the dial like a real rotary switch.
    const a = -Math.PI * 0.5 - THREE.MathUtils.degToRad(100) + (i / Math.max(1, n - 1)) * THREE.MathUtils.degToRad(200)
    const x = S / 2 + Math.cos(a) * S * 0.36
    const y = S / 2 + Math.sin(a) * S * 0.36 + 14
    ctx.fillText(l, x, y)
    ctx.beginPath()
    ctx.arc(S / 2 + Math.cos(a) * S * 0.25, S / 2 + Math.sin(a) * S * 0.25, 7, 0, Math.PI * 2)
    ctx.fill()
  })
  ctx.font = 'bold 30px system-ui, sans-serif'
  ctx.fillStyle = '#7A5252'
  ctx.fillText('gravity', S / 2, S * 0.86)
  return tex(c)
}

/** Angle (radians, for a mesh rotated about z) that points the dial's knob at label i of n. */
export function dialAngle(i: number, n: number): number {
  const a = -Math.PI * 0.5 - THREE.MathUtils.degToRad(100) + (i / Math.max(1, n - 1)) * THREE.MathUtils.degToRad(200)
  // Canvas y is down; the mesh's +y is up.
  return -a - Math.PI / 2
}

/** The chalkboard: equations earned so far, drawn as chalk. */
export function chalkboard(): { texture: THREE.CanvasTexture; draw: (lines: string[], title: string) => void } {
  const W = 1024
  const H = 640
  const { c, ctx } = canvas(W, H)
  const texture = tex(c)
  let last = ''
  const draw = (lines: string[], title: string) => {
    const key = title + '|' + lines.join('|')
    if (key === last) return
    last = key
    ctx.fillStyle = '#28372F'
    ctx.fillRect(0, 0, W, H)
    for (let i = 0; i < 1500; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`
      ctx.fillRect(Math.random() * W, Math.random() * H, 3, 3)
    }
    ctx.fillStyle = '#F2EBDD'
    ctx.font = 'bold 44px "Segoe Print", "Comic Sans MS", cursive, system-ui'
    ctx.textAlign = 'left'
    ctx.fillText(title, 40, 80)
    ctx.strokeStyle = 'rgba(242,235,221,0.6)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(40, 100)
    ctx.lineTo(W - 40, 100)
    ctx.stroke()
    ctx.font = 'bold 60px "Segoe Print", "Comic Sans MS", cursive, system-ui'
    if (lines.length === 0) {
      ctx.fillStyle = 'rgba(242,235,221,0.55)'
      ctx.font = 'italic 40px "Segoe Print", "Comic Sans MS", cursive, system-ui'
      ctx.fillText('nothing earned yet — go and measure something', 40, 200)
    }
    lines.forEach((l, i) => {
      ctx.fillStyle = '#F7F1E4'
      ctx.fillText(l, 60, 200 + i * 105)
    })
    texture.needsUpdate = true
  }
  draw([], 'Earned so far')
  return { texture, draw }
}

/** Sky gradient through the window: repainted when the world changes. */
export function skyTexture(): { texture: THREE.CanvasTexture; draw: (zenith: THREE.Color, horizon: THREE.Color, ground: THREE.Color) => void } {
  const { c, ctx } = canvas(8, 512)
  const texture = tex(c)
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
  let last = ''
  const draw = (z: THREE.Color, h: THREE.Color, g: THREE.Color) => {
    const key = z.getHexString() + h.getHexString() + g.getHexString()
    if (key === last) return
    last = key
    const grd = ctx.createLinearGradient(0, 0, 0, 512)
    grd.addColorStop(0, `#${z.getHexString()}`)
    grd.addColorStop(0.7, `#${h.getHexString()}`)
    grd.addColorStop(0.86, `#${g.getHexString()}`)
    grd.addColorStop(1, `#${g.clone().multiplyScalar(0.7).getHexString()}`)
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, 8, 512)
    texture.needsUpdate = true
  }
  return { texture, draw }
}

/* ------------------------------------------------------------------ */
/* Motion Yard — holographic / AR canvases                             */
/* ------------------------------------------------------------------ */

const HOLO = '#5FE0D2'
const HOLO_DIM = 'rgba(95,224,210,0.55)'

/** The holo-board: earned equations written in light on a translucent pane. */
export function holoBoard(): { texture: THREE.CanvasTexture; draw: (lines: string[], title: string) => void } {
  const W = 1024
  const H = 640
  const { c, ctx } = canvas(W, H)
  const texture = tex(c)
  let last = ''
  const draw = (lines: string[], title: string) => {
    const key = title + '|' + lines.join('|')
    if (key === last) return
    last = key
    ctx.clearRect(0, 0, W, H)
    // Faint holo grid
    ctx.strokeStyle = 'rgba(95,224,210,0.10)'
    ctx.lineWidth = 2
    for (let x = 0; x <= W; x += 64) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, H)
      ctx.stroke()
    }
    for (let y = 0; y <= H; y += 64) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.stroke()
    }
    ctx.shadowColor = HOLO
    ctx.shadowBlur = 18
    ctx.fillStyle = HOLO_DIM
    ctx.font = 'bold 40px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(title.toUpperCase(), 44, 78)
    ctx.strokeStyle = HOLO_DIM
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(44, 100)
    ctx.lineTo(W - 44, 100)
    ctx.stroke()
    if (lines.length === 0) {
      ctx.fillStyle = 'rgba(95,224,210,0.45)'
      ctx.font = 'italic 38px system-ui, sans-serif'
      ctx.fillText('nothing earned yet — go and measure something', 44, 205)
    }
    ctx.fillStyle = HOLO
    ctx.font = 'bold 62px ui-monospace, SFMono-Regular, Menlo, monospace'
    lines.forEach((l, i) => {
      ctx.fillText(l, 60, 210 + i * 108)
    })
    ctx.shadowBlur = 0
    texture.needsUpdate = true
  }
  draw([], 'Earned so far')
  return { texture, draw }
}

/**
 * A telemetry tag — the racing-HUD readout tethered to a moving object:
 * a big speed, a small time · distance line, and a speed bar on the left.
 */
export function telemetryTag(): {
  texture: THREE.CanvasTexture
  draw: (big: string, small: string, barFrac: number, delta: string | null) => void
} {
  const W = 512
  const H = 264
  const { c, ctx } = canvas(W, H)
  const texture = tex(c)
  let last = ''
  const draw = (big: string, small: string, barFrac: number, delta: string | null) => {
    const key = `${big}|${small}|${barFrac.toFixed(2)}|${delta ?? ''}`
    if (key === last) return
    last = key
    ctx.clearRect(0, 0, W, H)
    // Panel
    ctx.fillStyle = 'rgba(8, 24, 28, 0.45)'
    ctx.strokeStyle = HOLO_DIM
    ctx.lineWidth = 3
    const r = 26
    ctx.beginPath()
    ctx.roundRect(4, 4, W - 8, H - 8, r)
    ctx.fill()
    ctx.stroke()
    // Speed bar (left edge)
    const f = Math.max(0, Math.min(1, barFrac))
    ctx.fillStyle = 'rgba(95,224,210,0.16)'
    ctx.fillRect(18, 24, 26, H - 48)
    ctx.fillStyle = HOLO
    ctx.shadowColor = HOLO
    ctx.shadowBlur = 12
    ctx.fillRect(18, 24 + (H - 48) * (1 - f), 26, (H - 48) * f)
    // Big value
    ctx.font = 'bold 92px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textAlign = 'left'
    ctx.fillText(big, 68, 116)
    ctx.shadowBlur = 0
    ctx.font = 'bold 40px system-ui, sans-serif'
    ctx.fillStyle = HOLO_DIM
    ctx.fillText(small, 70, 178)
    if (delta) {
      ctx.fillStyle = delta.startsWith('-') ? '#7CE07C' : '#FFB86B'
      ctx.font = 'bold 42px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.fillText(`${delta} vs ghost`, 70, 232)
    }
    texture.needsUpdate = true
  }
  draw('0.00', '', 0, null)
  return { texture, draw }
}

/** A timing gate's split display. */
export function gateDisplay(): { texture: THREE.CanvasTexture; draw: (text: string, lit: boolean) => void } {
  const W = 256
  const H = 96
  const { c, ctx } = canvas(W, H)
  const texture = tex(c)
  let last = ''
  const draw = (text: string, lit: boolean) => {
    const key = `${text}|${lit}`
    if (key === last) return
    last = key
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = lit ? 'rgba(12, 34, 30, 0.9)' : 'rgba(10, 22, 26, 0.75)'
    ctx.strokeStyle = lit ? HOLO : 'rgba(95,224,210,0.35)'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.roundRect(4, 4, W - 8, H - 8, 14)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = lit ? HOLO : HOLO_DIM
    if (lit) {
      ctx.shadowColor = HOLO
      ctx.shadowBlur = 10
    }
    ctx.font = 'bold 52px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textAlign = 'center'
    ctx.fillText(text, W / 2, H / 2 + 18)
    ctx.shadowBlur = 0
    texture.needsUpdate = true
  }
  draw('— s', false)
  return { texture, draw }
}

/** The g-meter on the gravity totem: a vertical bar with the planets marked. */
export function gMeterTexture(): { texture: THREE.CanvasTexture; draw: (g: number) => void } {
  const W = 192
  const H = 512
  const { c, ctx } = canvas(W, H)
  const texture = tex(c)
  const marks: Array<[number, string]> = [
    [1.6, 'Moon'],
    [3.7, 'Mars'],
    [9.8, 'Earth'],
    [24.8, 'Jup'],
  ]
  const top = 30
  const bot = H - 46
  const yFor = (g: number) => bot - (Math.log10(Math.max(0.5, g)) - Math.log10(0.5)) / (Math.log10(300) - Math.log10(0.5)) * (bot - top)
  let last = ''
  const draw = (g: number) => {
    const key = g.toFixed(2)
    if (key === last) return
    last = key
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = 'rgba(8, 24, 28, 0.45)'
    ctx.strokeStyle = HOLO_DIM
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.roundRect(4, 4, W - 8, H - 8, 18)
    ctx.fill()
    ctx.stroke()
    // Track
    ctx.fillStyle = 'rgba(95,224,210,0.14)'
    ctx.fillRect(30, top, 20, bot - top)
    // Fill up to g
    const y = yFor(g)
    ctx.fillStyle = HOLO
    ctx.shadowColor = HOLO
    ctx.shadowBlur = 10
    ctx.fillRect(30, y, 20, bot - y)
    ctx.shadowBlur = 0
    // Marks
    ctx.font = 'bold 24px system-ui, sans-serif'
    ctx.textAlign = 'left'
    for (const [mg, label] of marks) {
      const my = yFor(mg)
      ctx.fillStyle = Math.abs(mg - g) < 0.4 ? HOLO : 'rgba(95,224,210,0.45)'
      ctx.fillRect(24, my - 2, 32, 4)
      ctx.fillText(label, 64, my + 8)
    }
    ctx.fillStyle = HOLO
    ctx.font = 'bold 34px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textAlign = 'center'
    ctx.fillText(g.toFixed(1), W / 2, H - 14)
    texture.needsUpdate = true
  }
  draw(9.81)
  return { texture, draw }
}

/** Live angle readout for the launcher's angle ladder. */
export function angleReadout(): { texture: THREE.CanvasTexture; draw: (deg: number, v0: number) => void } {
  const W = 256
  const H = 128
  const { c, ctx } = canvas(W, H)
  const texture = tex(c)
  let last = ''
  const draw = (deg: number, v0: number) => {
    const key = `${deg.toFixed(0)}|${v0.toFixed(1)}`
    if (key === last) return
    last = key
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = 'rgba(8, 24, 28, 0.45)'
    ctx.strokeStyle = HOLO_DIM
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.roundRect(4, 4, W - 8, H - 8, 14)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = HOLO
    ctx.shadowColor = HOLO
    ctx.shadowBlur = 8
    ctx.font = 'bold 56px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textAlign = 'center'
    ctx.fillText(`${deg.toFixed(0)}°`, W / 2, 60)
    ctx.shadowBlur = 0
    ctx.fillStyle = HOLO_DIM
    ctx.font = 'bold 30px system-ui, sans-serif'
    ctx.fillText(`${v0.toFixed(1)} m/s`, W / 2, 104)
    texture.needsUpdate = true
  }
  draw(40, 6)
  return { texture, draw }
}

/** The ring-gap bar shown on the ground after a called landing. */
export function gapReadout(): { texture: THREE.CanvasTexture; draw: (gap: number | null) => void } {
  const W = 384
  const H = 96
  const { c, ctx } = canvas(W, H)
  const texture = tex(c)
  let last = ''
  const draw = (gap: number | null) => {
    const key = gap === null ? 'null' : gap.toFixed(2)
    if (key === last) return
    last = key
    ctx.clearRect(0, 0, W, H)
    if (gap === null) {
      texture.needsUpdate = true
      return
    }
    const close = Math.abs(gap) <= 0.2
    const color = close ? '#7CE07C' : '#FFB86B'
    ctx.fillStyle = 'rgba(8, 24, 28, 0.45)'
    ctx.strokeStyle = color
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.roundRect(4, 4, W - 8, H - 8, 14)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = color
    ctx.shadowColor = color
    ctx.shadowBlur = 8
    ctx.font = 'bold 44px system-ui, sans-serif'
    ctx.textAlign = 'center'
    const text = close ? `called it — ${Math.abs(gap).toFixed(2)} m off` : `${Math.abs(gap).toFixed(2)} m ${gap > 0 ? 'long' : 'short'}`
    ctx.fillText(text, W / 2, H / 2 + 16)
    ctx.shadowBlur = 0
    texture.needsUpdate = true
  }
  draw(null)
  return { texture, draw }
}
