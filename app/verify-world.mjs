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
const COPPER = 1085

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })

async function open(viewport, { touch = false } = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_TUNNEL|favicon|WebGL|GPU|swiftshader|503/i.test(m.text())) errors.push(m.text())
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
  // This walk is the Explorer's: three written options at the whys.
  await page.evaluate(() => window.__world.setBand('explorer'))
  check('the wordmark names the zone', await page.getByTestId('wordmark').textContent().then((t) => /Landing/.test(t)))
  check('the checklist is up with nothing ticked', (await page.locator('[data-testid=checklist] li').count()) === 5 && (await page.locator('[data-testid=checklist] li[data-done=true]').count()) === 0)
  check('the toolbelt shows Lens · Probe · Measure · Journal', (await page.getByTestId('toolbelt').textContent()) .replace(/\s+/g, ' ').includes('Lens') && (await page.getByTestId('measure').isDisabled()))
  check('the minimap is up', (await page.getByTestId('minimap').count()) === 1)

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

  // Step: clear. The heavy piece refuses the hand; a light one lifts.
  await page.evaluate(() => window.__world.setPos(-5.2, 0.6, -9.6))
  await page.waitForTimeout(700)
  check('near the heavy scrap', (await world(page)).near === 'scrap.heavy', (await world(page)).near ?? 'nothing')
  await page.keyboard.press('KeyE')
  await page.waitForTimeout(300)
  check('the heavy scrap cannot be carried', (await world(page)).held === null)
  check('Ploob points at the crane', await page.getByTestId('coach').textContent().then((t) => /crane/i.test(t)))

  await page.evaluate(() => window.__world.setPos(-5, 0.6, -0.4))
  await page.waitForTimeout(700)
  check('near a light scrap', (await world(page)).near === 'scrap.b', (await world(page)).near ?? 'nothing')
  await page.keyboard.press('KeyE')
  await waitFor(page, () => window.__world.get().held === 'scrap.b')
  check('a light scrap lifts', (await world(page)).held === 'scrap.b')
  check('the verb prompt reads Put it down', await page.getByTestId('interact').textContent().then((t) => /put it down/i.test(t)))
  await page.keyboard.press('KeyE')
  await waitFor(page, () => window.__world.get().held === null)
  check('and puts down', (await world(page)).held === null)

  // The crane: driven from the post. W/S raise and lower, A/D swing, E takes and releases.
  await page.evaluate(() => window.__world.setPos(-8.6, 0.6, -8.2))
  await page.waitForTimeout(700)
  check('near the crane post', (await world(page)).near === 'crane.controls', (await world(page)).near ?? 'nothing')
  await page.keyboard.press('KeyE')
  await waitFor(page, () => window.__world.get().crane.active)
  check('E at the post takes the controls', (await world(page)).crane.active)
  check('the crane panel names the keys', await page.getByTestId('crane-panel').textContent().then((t) => /Raise/.test(t) && /Rotate/.test(t)))
  const c0 = (await world(page)).crane
  await hold(page, 'KeyD', 400)
  await hold(page, 'KeyW', 400)
  const c1 = (await world(page)).crane
  check('D swings the boom and W raises the hook', c1.yaw > c0.yaw && c1.hookY > c0.hookY, `yaw ${c0.yaw.toFixed(2)}→${c1.yaw.toFixed(2)} hook ${c0.hookY.toFixed(2)}→${c1.hookY.toFixed(2)}`)
  const p2 = await pos(page)
  check('the explorer stays at the post while driving', Math.hypot(p2[0] + 8.6, p2[2] + 8.2) < 0.6)
  // Over the heavy piece, hook low: take it.
  await page.evaluate(() => { const w = window.__world.get(); window.__world.set({ crane: { ...w.crane, yaw: 1.222, hookY: 1.5 } }) })
  await page.waitForTimeout(400)
  await page.keyboard.press('KeyE')
  await waitFor(page, () => window.__world.get().crane.holding === 'scrap.heavy')
  check('a low hook over the heavy piece takes it', (await world(page)).crane.holding === 'scrap.heavy')
  await page.evaluate(() => { const w = window.__world.get(); window.__world.set({ crane: { ...w.crane, hookY: 4.4 } }) })
  await page.waitForTimeout(600)
  check('Ploob makes his bet when it hangs high', await page.getByTestId('coach').textContent().then((t) => /falls faster/i.test(t)))
  await page.screenshot({ path: path.join(SHOTS, 'world-crane.png') })
  // Swing over the belt and let go: the fall is timed.
  await page.evaluate(() => { const w = window.__world.get(); window.__world.set({ crane: { ...w.crane, yaw: 0.2 } }) })
  await page.waitForTimeout(400)
  await page.keyboard.press('KeyE')
  await waitFor(page, () => window.__world.get().crane.holding === null)
  await waitFor(page, () => window.__world.get().crane.drops['scrap.heavy']?.t1 != null, 20000).catch(() => {})
  const dh = (await world(page)).crane.drops['scrap.heavy']
  check('the heavy drop is timed', !!dh && dh.t1 != null && dh.t1 > dh.t0, JSON.stringify(dh))
  // Now the light one from the same height.
  await page.evaluate(() => { const w = window.__world.get(); window.__world.set({ crane: { ...w.crane, yaw: 0.9, hookY: 1.4 } }) })
  await page.waitForTimeout(500)
  await page.keyboard.press('KeyE')
  await waitFor(page, () => window.__world.get().crane.holding === 'scrap.a', 8000).catch(() => {})
  check('the hook takes a light piece too', (await world(page)).crane.holding === 'scrap.a', (await world(page)).crane.holding ?? 'nothing')
  await page.evaluate(() => { const w = window.__world.get(); window.__world.set({ crane: { ...w.crane, hookY: 4.4, yaw: 0.2 } }) })
  await page.waitForTimeout(500)
  await page.keyboard.press('KeyE')
  await waitFor(page, () => window.__world.get().crane.drops['scrap.a']?.t1 != null, 20000).catch(() => {})
  const ft = await page.evaluate(() => { const w = window.__world.get(); const h = w.crane.drops['scrap.heavy']; const a = w.crane.drops['scrap.a']; return h && a && h.t1 != null && a.t1 != null ? { heavy: h.t1 - h.t0, light: a.t1 - a.t0, from: [h.from, a.from] } : null })
  check('two masses, same height, same fall time', !!ft && Math.abs(ft.heavy - ft.light) < 0.15, JSON.stringify(ft))
  await page.waitForTimeout(400)
  check('Ploob says same time, and no air', await page.getByTestId('coach').textContent().then((t) => /same time/i.test(t) && /no air/i.test(t)))
  await page.keyboard.press('Escape')
  await waitFor(page, () => !window.__world.get().crane.active)
  check('Escape steps down from the crane (and does not leave the world)', !(await world(page)).crane.active && /#\/world/.test(page.url()))

  // Both landed on the belt: fed.
  await waitFor(page, () => window.__world.get().fed.length >= 2, 25000).catch(() => {})
  await waitFor(page, () => window.__world.get().step === 'probe', 3000).catch(() => {})
  const s1 = await world(page)
  check('the belt feeds what the crane dropped → the probe step', s1.fed.length >= 2 && s1.step === 'probe', `fed=${JSON.stringify(s1.fed)} step=${s1.step}`)
  check('the checklist ticks the jam', (await page.locator('[data-testid=checklist] li[data-done=true]').count()) >= 1)

  // Step: probe. Light all three hearths.
  for (const [i, f] of ['wetwood', 'drywood', 'charcoal'].entries()) {
    await page.evaluate((x) => window.__world.setPos(x, 0.6, 4), 6 + i * 2.3)
    await page.waitForTimeout(400)
    await page.keyboard.press('KeyE')
    await page.waitForFunction((f2) => window.__world.get().lit.includes(f2), f, { timeout: 5000 }).catch(() => {})
  }
  const s2 = await world(page)
  check('three hearths lit → the Lens step', s2.lit.length === 3 && s2.step === 'lens', `lit=${s2.lit.length} step=${s2.step}`)
  await waitFor(page, () => { const h = window.__world.get().hearths; return h.charcoal > h.drywood && h.drywood > h.wetwood }, 25000).catch(() => {})
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
  await page.keyboard.press('KeyQ')
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

  // Feed: the furnace is a ROOM — a camera cut into the same tree, no reload.
  await page.evaluate(() => window.__world.setPos(0, 0.6, -5.2))
  await page.waitForTimeout(500)
  check('near the furnace mouth', (await world(page)).near === 'feed.furnace', (await world(page)).near ?? 'nothing')
  const urlBefore = page.url()
  await page.keyboard.press('KeyE')
  await waitFor(page, () => window.__world.get().room === 'furnace')
  check('E on the furnace enters the room', (await world(page)).room === 'furnace')
  check('the room is a cut, not a route', page.url() === urlBefore)
  await page.waitForTimeout(200)
  const roomCam = await page.evaluate(() => window.__world.cam())
  check('the camera cut to the interior viewpoint', !!roomCam && Math.abs(roomCam[2] - -4.3) < 0.6 && Math.abs(roomCam[1] - 1.7) < 0.6, JSON.stringify(roomCam))
  const explorerHidden = await page.evaluate(() => { const m = window.__world.scene.getObjectByName('explorer-mesh'); return m ? !m.visible : null })
  check('the explorer is out of frame inside the room', explorerHidden === true)
  await waitFor(page, () => !!document.querySelector('[data-testid=room]'))
  check('the room panel shows what was read', await page.getByTestId('feed-charcoal').textContent().then((t) => /°C/.test(t)))
  await page.screenshot({ path: path.join(SHOTS, 'world-room.png') })
  await resilientClick(page.getByTestId('feed-charcoal'), { label: 'Charcoal' })
  await waitFor(page, () => window.__world.get().furnace.lit)
  // Bellows shut: it warms but never reaches copper. Then pump.
  await page.waitForTimeout(2500)
  const cold = await world(page)
  check('with the bellows shut the furnace warms but stays under copper', cold.furnace.temp > 30 && cold.furnace.temp < COPPER, `temp=${Math.round(cold.furnace.temp)}`)
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid=air]')
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    set.call(el, '100')
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await waitFor(page, () => window.__world.get().air >= 0.99)
  check('the bellows slider sets the air', (await world(page)).air >= 0.99)
  await waitFor(page, () => window.__world.get().poured, 40000).catch(() => {})
  const s4 = await world(page)
  check('charcoal with air pours', s4.poured, `temp=${Math.round(s4.furnace.temp)}`)
  await waitFor(page, () => !!document.querySelector('[data-testid=pour-card]'), 5000).catch(() => {})
  const card = await page.getByTestId('pour-card').textContent().catch(() => '')
  check('the pour card scores in the three words', /Accuracy/.test(card) && /Economy/.test(card) && /Thrift/.test(card))
  check('the pour card shows the prediction against the reading', /1000 °C/.test(card) && /1085 °C/.test(card))
  check('the curve comes to the learner', (await page.getByTestId('curve').count()) === 1 && s4.curve.length >= 4, `${s4.curve.length} points`)
  await page.screenshot({ path: path.join(SHOTS, 'world-pour-desktop.png') })
  await resilientClick(page.getByRole('button', { name: 'Step out' }), { label: 'Step out' })
  await waitFor(page, () => window.__world.get().room === 'none')
  check('stepping out returns to the courtyard', (await world(page)).room === 'none')

  // Three whys, growing; a wrong answer gets a reasoned line, not a buzzer.
  await waitFor(page, () => !!document.querySelector('[data-testid=why-0]'))
  await resilientClick(page.getByTestId('why-0-1'), { label: 'wrong answer' })
  await waitFor(page, () => !!document.querySelector('[data-testid=why-line]'))
  check('a wrong why gets Ploob reasoning back', await page.getByTestId('why-line').textContent().then((t) => /same charcoal/i.test(t)))
  await resilientClick(page.getByTestId('why-next'), { label: 'Next' })
  await waitFor(page, () => !!document.querySelector('[data-testid=why-1]'))
  check('the second why is the heavier-wet-wood misconception', await page.getByTestId('why-1').textContent().then((t) => /heavier/i.test(t)))
  await resilientClick(page.getByTestId('why-1-1'), { label: 'water' })
  await waitFor(page, () => !!document.querySelector('[data-testid=why-line]'))
  await resilientClick(page.getByTestId('why-next'), { label: 'Next' })
  await waitFor(page, () => !!document.querySelector('[data-testid=why-2]'))
  await resilientClick(page.getByTestId('why-2-1'), { label: 'tin' })
  await waitFor(page, () => !!document.querySelector('[data-testid=why-line]'))
  check('the third why points at the Bench', await page.getByTestId('why-line').textContent().then((t) => /Bench/.test(t)))
  await resilientClick(page.getByTestId('why-next'), { label: 'To the journal' })
  await waitFor(page, () => !!document.querySelector('[data-testid=stamp]'))
  const j = (await world(page)).journal
  check('the journal has prediction and action', !!j.prediction && !!j.action)
  check('observed is earned by the pour itself, in the reading', !!j.observed && /°C/.test(j.observed))
  check('explanation is earned by the right second why', !!j.explanation)
  check('four lines earned → STAMPED', await page.getByTestId('stamp-state').textContent().then((t) => /^STAMPED$/.test(t.trim())))
  await page.screenshot({ path: path.join(SHOTS, 'world-stamp.png') })
  await resilientClick(page.getByRole('button', { name: 'Close' }), { label: 'Close' })

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
/* Own words: an Investigator writes the why; a typed judge decides          */
/* ------------------------------------------------------------------------ */
{
  const { page, ctx, errors } = await open({ width: 1440, height: 900 })
  // The judge is mocked at the route: what arrives at /api/why is asserted, and
  // the verdicts are scripted — partial, then right, then a 503 (no key).
  const seen = []
  let n = 0
  await page.route('**/api/why', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}')
    seen.push(body)
    n++
    if (n === 1) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, verdict: 'partial', confidence: 0.82, misconception: null, usesEvidence: 0.3 }) })
    if (n === 2) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, verdict: 'right', confidence: 0.91, misconception: null, usesEvidence: 0.7 }) })
    if (n === 3) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, verdict: 'misconception', confidence: 0.88, misconception: 'mass_burns_slower', usesEvidence: 0.1 }) })
    return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'no TYPESAFE_API_KEY secret' }) })
  })
  await resilientClick(page.getByTestId('play'), { label: 'Play' })
  await waitFor(page, () => window.__world.get().phase === 'play')
  await page.evaluate(() => {
    window.__world.setBand('scientist')
    window.__world.set({
      zone: 'foundry', prediction: 1000, lit: ['wetwood', 'drywood', 'charcoal'], hearths: { wetwood: 550, drywood: 900, charcoal: 1200 },
      pipeFixed: true, bellowsSeen: true, air: 1, fed: ['scrap.a', 'scrap.heavy'], step: 'done',
      furnace: { lit: true, fuel: 'charcoal', temp: 1150 }, poured: true, room: 'furnace',
      curve: [[0, 20], [1, 400], [2, 800], [3, 1150]],
      journal: { prediction: 'Said 1000 °C.', action: 'Fed charcoal, pipe whole.', observed: 'Read 1150 °C.', explanation: null },
    })
  })
  await waitFor(page, () => !!document.querySelector('[data-testid=pour-card]'))
  await resilientClick(page.getByRole('button', { name: 'Step out' }), { label: 'Step out' })
  await waitFor(page, () => !!document.querySelector('[data-testid=why-0]'))
  check('own words: an Investigator gets a text box, not three options', (await page.getByTestId('own-words').count()) === 1 && (await page.getByTestId('why-0-0').count()) === 0)
  await page.getByTestId('why-text').fill('it got hotter')
  await resilientClick(page.getByTestId('why-say'), { label: 'Say it' })
  await waitFor(page, () => !!document.querySelector('[data-testid=why-nudge]'))
  check('a partial answer gets a nudge back, not a mark', await page.getByTestId('why-nudge').textContent().then((t) => /reached the fire/i.test(t)))
  check('the judge was sent the ask, the target and the misconceptions by key', seen[0]?.ask === 'What happened when the pipe was whole again?' && /More air/.test(seen[0]?.target) && seen[0]?.misconceptions?.map((m) => m.key).join() === 'fuel_changed,copper_changed')
  check('the judge was sent only facts the learner could have seen', seen[0]?.facts?.furnace_reading_c >= 1150 && /Charcoal reached 1200/.test(seen[0]?.facts?.fuels_tested) && seen[0]?.facts?.pipe.includes('fixed'), JSON.stringify(seen[0]?.facts))
  await page.getByTestId('why-text').fill('more air reached the fire so the charcoal burned hotter')
  await resilientClick(page.getByTestId('why-say'), { label: 'Say it' })
  await waitFor(page, () => !!document.querySelector('[data-testid=why-line]'))
  check('a right answer gets Ploob\'s reasoned line from the quest data', await page.getByTestId('why-line').textContent().then((t) => /More air, more of the charcoal/.test(t)))
  check('the card keeps the learner\'s own sentence', await page.getByTestId('why-0').textContent().then((t) => /“more air reached the fire so the charcoal burned hotter”/.test(t)))
  await resilientClick(page.getByTestId('why-next'), { label: 'Next' })
  await waitFor(page, () => !!document.querySelector('[data-testid=why-1]'))
  await page.getByTestId('why-text').fill('because it is heavier so it burns slower')
  await resilientClick(page.getByTestId('why-say'), { label: 'Say it' })
  await waitFor(page, () => !!document.querySelector('[data-testid=why-line]'))
  check('a named misconception maps onto its option and Ploob answers it', await page.getByTestId('why-line').textContent().then((t) => /Weight is not the reason/.test(t)))
  check('a wrong why leaves the explanation unearned', (await world(page)).journal.explanation === null)
  await resilientClick(page.getByTestId('why-next'), { label: 'Next' })
  await waitFor(page, () => !!document.querySelector('[data-testid=why-2]'))
  await page.getByTestId('why-text').fill('tin and the bench')
  await resilientClick(page.getByTestId('why-say'), { label: 'Say it' })
  await waitFor(page, () => !!document.querySelector('[data-testid=why-2-0]'), 8000).catch(() => {})
  check('no judge (503) → the three options, silently', (await page.getByTestId('why-2-0').count()) === 1)
  check('no console errors on the own-words path', errors.length === 0, errors.slice(0, 2).join(' | '))
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
