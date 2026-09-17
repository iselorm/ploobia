/**
 * The Archipelago — round W0, the Foundry Courtyard walked end to end.
 *
 * Serve a WORLD build on :8766 first:
 *   VITE_WORLD=1 npx vite build --outDir dist-world && node ../serve.mjs
 *   (or: cd dist-world && python3 -m http.server 8766)
 *
 * What only a browser can settle: that the route mounts a scene with a
 * canvas and Rapier alive; that Play is the front door; that the explorer
 * walks on the keys and the camera follows; that the portal is walked into
 * and loads the courtyard; that the brief asks for a typed number before the
 * work; that a light block can be lifted and a heavy one cannot; that the
 * belt feeds what is put on it; that the hearths light and climb; that the
 * Lens is the only way to see the air and the pipe cannot be fixed before it
 * is seen; that a fed furnace on charcoal pours and the card scores in the
 * three words; and that every control on the phone tier is under the finger.
 *
 * Movement is driven with real key events; the suite also teleports the
 * explorer (`__world.setPos`) to keep the walk short on a software renderer.
 * Physics is Rapier's; nothing here fakes a collision.
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { reporter, resilientClick } from './verify-lib.mjs'

const BASE = process.env.WORLD_BASE ?? 'http://localhost:8766/index.html'
const SHOTS = path.resolve('shots')
fs.mkdirSync(SHOTS, { recursive: true })
const { check, tally } = reporter()

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })

async function open(viewport, { touch = false } = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_TUNNEL|favicon|WebGL|GPU|swiftshader/i.test(m.text())) errors.push(m.text())
  })
  await page.goto(`${BASE}?q=low#/world`, { waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__world, null, { timeout: 60000 })
  return { page, ctx, errors }
}

const world = (page) => page.evaluate(() => window.__world.get())
const pos = (page) => page.evaluate(() => { const p = window.__world.live.pos; return [p.x, p.y, p.z] })
const waitFor = (page, fn, ms = 15000) => page.waitForFunction(fn, null, { timeout: ms })

/** Hold a key for `ms` of wall time. */
async function hold(page, code, ms) {
  await page.keyboard.down(code)
  await page.waitForTimeout(ms)
  await page.keyboard.up(code)
}

/* ------------------------------------------------------------------------ */
/* Desktop: the whole quest                                                  */
/* ------------------------------------------------------------------------ */
{
  const { page, ctx, errors } = await open({ width: 1440, height: 900 })
  check('route mounts a canvas', (await page.locator('canvas').count()) >= 1)
  check('welcome is play-first', await page.getByTestId('play').isVisible())
  await page.screenshot({ path: path.join(SHOTS, 'world-welcome.png') })
  await resilientClick(page.getByTestId('play'), { label: 'Play' })
  await waitFor(page, () => window.__world.get().phase === 'play')
  check('quest plate names the zone', await page.getByTestId('quest-plate').textContent().then((t) => /Landing/.test(t)))

  // Walk: W for a second must move the explorer along the camera's forward.
  const p0 = await pos(page)
  await hold(page, 'KeyW', 900)
  await page.waitForTimeout(200)
  const p1 = await pos(page)
  const moved = Math.hypot(p1[0] - p0[0], p1[2] - p0[2])
  check('explorer walks on W', moved > 0.8, `${moved.toFixed(2)} m`)
  check('explorer stays on the island', p1[1] > -1 && p1[1] < 3, `y=${p1[1].toFixed(2)}`)

  // Jump: Space lifts y.
  const y0 = (await pos(page))[1]
  await page.keyboard.down('Space')
  await page.waitForTimeout(260)
  const y1 = (await pos(page))[1]
  await page.keyboard.up('Space')
  check('space jumps', y1 > y0 + 0.15, `${y0.toFixed(2)} → ${y1.toFixed(2)}`)
  await page.waitForTimeout(900)

  // Portal: walk into the gate at (0,0,-11.5). Point the camera, then walk.
  await page.evaluate(() => {
    window.__world.live.camYaw = Math.PI // camera behind, facing -z
  })
  await page.evaluate(() => window.__world.setPos(0, 0.6, -8.5))
  await hold(page, 'KeyW', 1400)
  await waitFor(page, () => window.__world.get().zone === 'foundry', 20000)
  check('walking into the gate loads the Foundry', (await world(page)).zone === 'foundry')
  await waitFor(page, () => !!document.querySelector('[data-testid=brief]'), 10000)
  check('the brief asks for a number before the work', await page.getByTestId('brief').isVisible())
  await page.getByTestId('prediction').fill('1000')
  await resilientClick(page.getByTestId('commit'), { label: 'Say it' })
  await waitFor(page, () => window.__world.get().prediction === 1000)
  check('prediction is recorded as typed', (await world(page)).prediction === 1000)
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(SHOTS, 'world-courtyard-desktop.png') })

  // Step: clear. The heavy block refuses; a light one lifts.
  await page.evaluate(() => window.__world.setPos(-8.6, 0.6, -2.4))
  await page.waitForTimeout(500)
  check('near the heavy scrap', (await world(page)).near === 'scrap.heavy', (await world(page)).near ?? 'nothing')
  await page.keyboard.press('KeyE')
  await page.waitForTimeout(300)
  check('the heavy scrap cannot be carried', (await world(page)).held === null)
  check('Ploob says it needs the crane', await page.getByTestId('coach').textContent().then((t) => /crane/i.test(t)))

  await page.evaluate(() => window.__world.setPos(-7, 0.6, -1))
  await page.waitForTimeout(500)
  check('near a light scrap', (await world(page)).near === 'scrap.a', (await world(page)).near ?? 'nothing')
  await page.keyboard.press('KeyE')
  await waitFor(page, () => window.__world.get().held === 'scrap.a')
  check('a light scrap lifts', (await world(page)).held === 'scrap.a')
  check('the verb button reads Put it down', await page.getByTestId('interact').textContent().then((t) => /put it down/i.test(t)))

  // Carry it onto the belt and drop it there: face -z so the hand is over the belt.
  await page.evaluate(() => { window.__world.live.facing = Math.PI; window.__world.setPos(-6, 0.6, -4.9) })
  await page.waitForTimeout(400)
  await page.keyboard.press('KeyE')
  await waitFor(page, () => window.__world.get().held === null)
  await waitFor(page, () => window.__world.get().fed.includes('scrap.a'), 20000).catch(() => {})
  check('the belt carries a dropped scrap into the mouth', (await world(page)).fed.includes('scrap.a'), JSON.stringify((await world(page)).fed))

  // Second piece.
  await page.evaluate(() => window.__world.setPos(-5, 0.6, -0.4))
  await page.waitForTimeout(500)
  await page.keyboard.press('KeyE')
  await waitFor(page, () => window.__world.get().held === 'scrap.b')
  await page.evaluate(() => { window.__world.live.facing = Math.PI; window.__world.setPos(-5.5, 0.6, -4.9) })
  await page.waitForTimeout(400)
  await page.keyboard.press('KeyE')
  await waitFor(page, () => window.__world.get().fed.length >= 2, 20000).catch(() => {})
  await waitFor(page, () => window.__world.get().step === 'probe', 3000).catch(() => {})
  const s1 = await world(page)
  check('two fed pieces complete the clear step', s1.fed.length >= 2 && s1.step === 'probe', `fed=${s1.fed.length} step=${s1.step}`)

  // Step: probe. Light all three hearths.
  for (const [i, f] of ['wetwood', 'drywood', 'charcoal'].entries()) {
    await page.evaluate((x) => window.__world.setPos(x, 0.6, 4), 6 + i * 2.3)
    await page.waitForTimeout(400)
    await page.keyboard.press('KeyE')
    await page.waitForFunction((f2) => window.__world.get().lit.includes(f2), f, { timeout: 5000 }).catch(() => {})
  }
  const s2 = await world(page)
  check('three hearths lit → the Lens step', s2.lit.length === 3 && s2.step === 'lens', `lit=${s2.lit.length} step=${s2.step}`)
  await page.waitForTimeout(2500)
  const s3 = await world(page)
  check('hearths climb and charcoal leads', s3.hearths.charcoal > s3.hearths.drywood && s3.hearths.drywood > s3.hearths.wetwood, JSON.stringify(s3.hearths))
  check('the gauge shows the hearths', (await page.getByTestId('hearth-charcoal').textContent()) !== '—')

  // Build before Lens: refused with a line.
  await page.evaluate(() => window.__world.setPos(3.2, 0.6, -6))
  await page.waitForTimeout(400)
  check('near the split pipe', (await world(page)).near === 'build.pipe', (await world(page)).near ?? 'nothing')
  await page.keyboard.press('KeyE')
  await page.waitForTimeout(300)
  check('the pipe cannot be fixed before it is seen', !(await world(page)).pipeFixed)
  check('Ploob says look first', await page.getByTestId('coach').textContent().then((t) => /look first/i.test(t)))

  // Lens on: the System ring, the air lanes visible.
  await page.keyboard.press('KeyL')
  await waitFor(page, () => window.__world.get().ring === 'system')
  const lanesVisible = await page.evaluate(() => {
    let v = false
    window.__world.scene.traverse((o) => { if (o.isInstancedMesh && o.geometry?.type === 'CapsuleGeometry' && o.visible) v = true })
    return v
  })
  check('the System ring shows the air lanes', lanesVisible)
  check('seeing the air completes the Lens step', (await world(page)).step === 'build')
  await page.screenshot({ path: path.join(SHOTS, 'world-lens-system.png') })
  await page.keyboard.press('KeyE')
  await waitFor(page, () => window.__world.get().pipeFixed)
  check('the pipe is fixed after the Lens', (await world(page)).pipeFixed && (await world(page)).step === 'feed')
  await page.keyboard.press('KeyL')

  // Feed on charcoal: pours.
  await page.evaluate(() => window.__world.setPos(0, 0.6, -5.2))
  await page.waitForTimeout(400)
  check('near the furnace mouth', (await world(page)).near === 'feed.furnace', (await world(page)).near ?? 'nothing')
  await page.keyboard.press('KeyE')
  await waitFor(page, () => !!document.querySelector('[data-testid=feed-sheet]'))
  check('the feed sheet shows what was read', await page.getByTestId('feed-charcoal').textContent().then((t) => /°C/.test(t)))
  await resilientClick(page.getByTestId('feed-charcoal'), { label: 'Charcoal' })
  await waitFor(page, () => window.__world.get().furnace.lit)
  await waitFor(page, () => window.__world.get().poured, 30000).catch(() => {})
  const s4 = await world(page)
  check('charcoal with air pours', s4.poured, `temp=${Math.round(s4.furnace.temp)}`)
  await waitFor(page, () => !!document.querySelector('[data-testid=pour-card]'), 5000).catch(() => {})
  const card = await page.getByTestId('pour-card').textContent().catch(() => '')
  check('the pour card scores in the three words', /Accuracy/.test(card) && /Economy/.test(card) && /Thrift/.test(card))
  check('the pour card shows the prediction against the reading', /1000 °C/.test(card) && /1085 °C/.test(card))
  await page.screenshot({ path: path.join(SHOTS, 'world-pour-desktop.png') })

  // Back through the gate: the far island is lit.
  await page.evaluate(() => { window.__world.live.camYaw = 0; window.__world.setPos(0, 0.6, 11.2) })
  await hold(page, 'KeyW', 1200)
  await waitFor(page, () => window.__world.get().zone === 'landing', 20000).catch(() => {})
  check('the gate back returns to the Landing', (await world(page)).zone === 'landing')
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(SHOTS, 'world-landing-lit.png') })

  const perf = await page.evaluate(() => window.__perf ?? null)
  check('perf probe publishes', !!perf, perf ? `calls=${perf.calls ?? perf.drawCalls ?? '?'} tris=${perf.triangles ?? '?'}` : 'no __perf')
  check('no console errors across the walk', errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

/* ------------------------------------------------------------------------ */
/* Tablet + phone: layout, touch controls, hit sizes, portrait card          */
/* ------------------------------------------------------------------------ */
for (const [name, viewport, touch] of [
  ['tablet', { width: 1180, height: 820 }, true],
  ['phone', { width: 915, height: 412 }, true],
]) {
  const { page, ctx, errors } = await open(viewport, { touch })
  await resilientClick(page.getByTestId('play'), { label: 'Play' })
  await waitFor(page, () => window.__world.get().phase === 'play')
  await page.waitForTimeout(500)
  if (touch) {
    check(`${name}: the stick is on screen`, await page.getByTestId('stick').isVisible())
    // Drag the stick up: the explorer should walk.
    const box = await page.getByTestId('stick').boundingBox()
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    const p0 = await pos(page)
    await page.touchscreen.tap(cx, cy)
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx, cy - 40, { steps: 4 })
    await page.waitForTimeout(800)
    await page.mouse.up()
    await page.waitForTimeout(200)
    const p1 = await pos(page)
    const moved = Math.hypot(p1[0] - p0[0], p1[2] - p0[2])
    check(`${name}: the stick walks the explorer`, moved > 0.5, `${moved.toFixed(2)} m`)
  }
  // Every HUD button under the finger — audited in a touch context, where the
  // platform's --hit applies (pointer mode keeps 32 px icons by design).
  await page.touchscreen.tap(viewport.width / 2, 8)
  await page.waitForTimeout(150)
  const small = await page.evaluate(() => {
    const min = 40
    return [...document.querySelectorAll('.hud button:not([disabled]), .hud a')]
      .map((el) => ({ label: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 20), r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.width < min || r.height < min))
      .map((x) => x.label)
  })
  check(`${name}: every control is at least 40 px`, small.length === 0, small.join(', '))
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  check(`${name}: nothing scrolls sideways`, !overflow)
  await page.screenshot({ path: path.join(SHOTS, `world-${name}.png`) })
  check(`${name}: no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '))
  await ctx.close()
}

{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
  const page = await ctx.newPage()
  await page.goto(`${BASE}?q=low#/world`, { waitUntil: 'load' })
  await page.waitForTimeout(1500)
  check('portrait: the turn card shows', (await page.getByTestId('turn-card').count()) === 1)
  check('portrait: no canvas is mounted', (await page.locator('canvas').count()) === 0)
  await ctx.close()
}

await browser.close()
process.exit(tally())
