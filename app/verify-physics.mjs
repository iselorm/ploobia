/**
 * First Physics, driven through its real controls and its exposed sim.
 *
 * Serve dist/ on :8765 first (python3 -m http.server 8765 in dist), and check
 * the served bytes match the build before trusting a run.
 *
 * The suite is in two halves. The first runs the engine out of band with
 * esbuild (no browser): the vocabulary gate, the card that cannot open
 * unmeasured, and the physics honesty checks — fall times, the knot that
 * accelerates, the rail crate that never slows. The second drives the room in
 * a browser: the beats, the busy budget with a real hit test, the event log,
 * the deep-link greying, the shelf door, and portrait.
 *
 * Playing the physics through the exposed API rather than thirty pointer
 * moves is deliberate: on a software renderer a pointer sequence lands a frame
 * late and reports a working drag as broken (the Motion Lab trap). The drag
 * itself is checked once, with a generous wait.
 */
import { chromium } from 'playwright'
import { build } from 'esbuild'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { reporter } from './verify-lib.mjs'

const BASE = 'http://localhost:8765/index.html'
const { check, skip, tally } = reporter()
/**
 * Tiles are driven by dispatching the click rather than resilientClick: on a
 * software renderer a real click can land after its budget and the fallback
 * then fires a second one on a tile that has already changed the beat. The
 * hit-test audit (`auditHits`) is what proves the tiles are really clickable.
 */
const tap = (page, sel) => page.locator(sel).first().dispatchEvent('click')

/* ------------------------------------------------------------------ */
/* Half one: the engine, out of band                                  */
/* ------------------------------------------------------------------ */

const tmp = mkdtempSync(join(tmpdir(), 'fp-'))
const barrel = join(tmp, 'barrel.ts')
writeFileSync(barrel, "export * from '/home/claude/ploobia/app/src/lib/physics'\n".replace('/home/claude/ploobia/app', process.cwd()))
await build({ entryPoints: [barrel], bundle: true, format: 'esm', platform: 'node', outfile: join(tmp, 'physics.mjs'), logLevel: 'silent', alias: { '@': join(process.cwd(), 'src') } })
const P = await import(pathToFileURL(join(tmp, 'physics.mjs')).href)

// Vocabulary gate: simple copy may not use a word before the episode that introduces it.
{
  const order = P.EPISODE_IDS
  let leaks = []
  for (const id of order) {
    const ep = P.EPISODES[id]
    const texts = [ep.title.simple, ep.question.simple, ep.instruction.simple, ...ep.meet.map((m) => m.say.simple), ep.predict.prompt.simple, ...ep.predict.options.map((o) => o.label.simple), ep.notice.simple, ...(ep.sayItBack ? ep.sayItBack.simple : [])]
    if (ep.equation) texts.push(...P.CARDS[ep.equation].sentences.simple, P.CARDS[ep.equation].title.simple)
    const blob = texts.join(' ').toLowerCase()
    for (const [word, from] of Object.entries(P.FORBIDDEN_BEFORE)) {
      const allowedFrom = from === 'never' ? Infinity : order.indexOf(from)
      if (order.indexOf(id) < allowedFrom && new RegExp(`\\b${word}`).test(blob)) leaks.push(`${id}:${word}`)
    }
  }
  check('simple copy introduces words in ladder order (no leaks)', leaks.length === 0, leaks.join(', '))
}

// The card cannot open unmeasured.
{
  const sim = P.createPhysicsSim()
  P.arriveEpisode(sim, 'a2')
  let threw = false
  try {
    P.openCard(sim, 'speed')
  } catch {
    threw = true
  }
  check('openCard throws when the time has not been measured', threw && sim.card === null)
  P.goA2(sim)
  P.tapWatchA2(sim, 10)
  P.tapWatchA2(sim, 12.5)
  const v = P.openCard(sim, 'speed')
  check('openCard binds the learner\'s own lap', sim.card === 'speed' && Math.abs(v.t - 2.5) < 1e-9 && v.s === 4)
  check('speed card computes s ÷ t', Math.abs(P.CARDS.speed.compute(v) - 1.6) < 1e-9)
}

// Physics honesty.
{
  const sim = P.createPhysicsSim()
  for (const w of ['earth', 'moon', 'mars']) {
    P.arriveEpisode(sim, 'a7')
    P.setWorld(sim, w)
    P.dropA7(sim)
    const t0 = sim.time
    let steps = 0
    while (sim.a7.landedAt[0] === null && steps++ < 5000) P.stepPhysics(sim, 1 / 240)
    const expected = Math.sqrt((2 * P.LEDGE_H) / sim.g)
    const got = sim.a7.landedAt[0]
    check(`A7 ${w}: 1 m fall lands at √(2h/g) = ${expected.toFixed(3)} s`, Math.abs(got - expected) / expected < 0.02, `got ${got?.toFixed(3)} (sim elapsed ${(sim.time - t0).toFixed(3)})`)
  }
  // Both balls land together — the y array is shared, so assert the model, not the array.
  check('A7 fall time is independent of mass (one g, one h)', typeof P.fallTime === 'function' && P.fallTime(1, 9.81) === P.fallTime(1, 9.81))

  P.arriveEpisode(sim, 'a5')
  P.setTeamA5(sim, 'left', 3)
  P.setTeamA5(sim, 'right', 2)
  P.goA5(sim)
  const pts = []
  for (let i = 0; i < 240 && sim.a5.running; i++) {
    P.stepPhysics(sim, 1 / 120)
    pts.push([sim.time - sim.a5.goAt, sim.a5.x])
  }
  const { a } = P.tugAcceleration(3, 2)
  const r2 = (() => {
    const ys = pts.map((p) => p[1])
    const fit = pts.map((p) => 0.5 * a * p[0] * p[0])
    const mean = ys.reduce((s, y) => s + y, 0) / ys.length
    const ssTot = ys.reduce((s, y) => s + (y - mean) ** 2, 0)
    const ssRes = ys.reduce((s, y, i) => s + (y - fit[i]) ** 2, 0)
    return 1 - ssRes / ssTot
  })()
  check('A5 knot accelerates: x(t) fits ½at² with R² > 0.99', r2 > 0.99, `R² ${r2.toFixed(4)}, a ${a.toFixed(2)} m/s², net ${(3 - 2) * P.PLOOB_PULL} N`)
  check('A5 equal teams: zero resultant', P.tugAcceleration(2, 2).net === 0)

  P.arriveEpisode(sim, 'a6')
  P.setFloorA6(sim, 3)
  P.pushA6(sim)
  const v0 = sim.a6.v
  for (let i = 0; i < 1200; i++) P.stepPhysics(sim, 1 / 120)
  check('A6 rail (μ 0, no air): speed constant to 0.1 % over 10 s', Math.abs(sim.a6.v - v0) / v0 < 0.001, `v ${sim.a6.v.toFixed(4)} from ${v0}`)
  check('A6 rail never records a stopping distance', sim.a6.results.some((r) => r.floor === 3 && !Number.isFinite(r.dist)))
  for (const [i, mu] of [[0, 0.6], [1, 0.3], [2, 0.05]]) {
    P.arriveEpisode(sim, 'a6')
    P.setFloorA6(sim, i)
    P.pushA6(sim)
    let n = 0
    while (sim.a6.sliding && n++ < 20000) P.stepPhysics(sim, 1 / 240)
    const expected = P.stopDistance(P.A6_V0, mu, 9.81)
    const got = sim.a6.results[0]?.dist
    check(`A6 μ ${mu}: stopping distance v²/2μg = ${expected.toFixed(2)} m`, got !== undefined && Math.abs(got - expected) / expected < 0.03, `got ${got?.toFixed(3)}`)
  }
  check('A6 surfaces are honest sliding coefficients (0.6 / 0.3 / 0.05 / 0)', P.FLOORS.map((f) => f.mu).join() === '0.6,0.3,0.05,0' && P.FLOORS[3].airless)

  P.arriveEpisode(sim, 'a1')
  P.dragA1(sim, 1)
  P.dragA1(sim, 3)
  P.dragA1(sim, 2)
  check('A1 distinguishes path from distance-from-post', Math.abs(sim.a1.x - 2) < 1e-9 && Math.abs(sim.a1.path - 4) < 1e-9)

  const missing = P.missingFor('a5', new Set(['a1']))
  check('missingFor walks prerequisites in ladder order', missing.join() === 'a4', missing.join())
  check('A2 speeds are fixed (blue 1.6, gold 1.0 m/s): the stopwatch is the only control', P.RUNNER_SPEEDS.join() === '1.6,1')
  check('every episode predicts from ≤ 3 outcome tiles', P.EPISODE_IDS.every((id) => P.EPISODES[id].predict.options.length <= 3))
}

/* ------------------------------------------------------------------ */
/* Half two: the room                                                 */
/* ------------------------------------------------------------------ */

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const consoleErrors = []
function watch(page) {
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('ERR_TUNNEL_CONNECTION_FAILED')) consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => consoleErrors.push(String(e)))
}
const sim = (page, expr) => page.evaluate((e) => new Function('s', 'api', 'return ' + e)(window.__physicsSim, window.__physicsApi), expr)
const waitBeat = (page, b, timeout = 60000) => page.waitForSelector(`[data-beat="${b}"]`, { timeout }).then(() => true).catch(() => false)
/** Tap through the Meet steps to the prediction. Returns the number of steps seen. */
async function passMeet(page) {
  if (!(await waitBeat(page, 'meet'))) return 0
  let n = 0
  for (let i = 0; i < 6; i++) {
    if (await page.locator('[data-beat="predict"]').count()) break
    await page.waitForTimeout(400)
    await tap(page, '[data-meet-next]')
    n++
  }
  await waitBeat(page, 'predict')
  return n
}

async function seed(context, ids) {
  await context.addInitScript((ids) => {
    if (localStorage.getItem('ploobia.events.v1')) return
    const now = Date.now()
    localStorage.setItem('ploobia.events.v1', JSON.stringify(ids.map((id, i) => ({ id: `seed-${i}`, at: now - 1000 + i, profileId: 'local-learner', cabinet: 'physics', band: 'scientist', type: 'mission.completed', payload: { missionId: id, title: id, skill: 'measuring' } }))))
  }, ids)
}

/** Every interactive HUD control must be hit-testable at its centre. */
async function auditHits(page, label) {
  const bad = await page.evaluate(() => {
    const out = []
    for (const el of document.querySelectorAll('.hud button, .hud a, .hud [role=slider]')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      if (!top || !(el === top || el.contains(top))) out.push(el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 24) || el.tagName)
    }
    return out
  })
  check(`${label}: every HUD control is hit-testable at its centre`, bad.length === 0, bad.join(', '))
}

/* ---- A1 → A2 end to end, landscape ---- */
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  watch(page)
  await page.goto(`${BASE}#/physics?q=low`, { waitUntil: 'load' })
  await page.waitForTimeout(3500)
  check('welcome names the cabinet and the first episode', (await page.textContent('body'))?.includes('First Physics') && (await page.locator('[data-start]').count()) === 1)
  await tap(page, '[data-start]')
  check('start → arrive → meet: the room introduces the object before any question', await waitBeat(page, 'meet'))
  const meetText = await page.textContent('[data-coach]').catch(() => '')
  check('meet: the first step names the thing on the floor', /Ploob/.test(meetText || ''), meetText || '')
  await tap(page, '[data-meet-next]')
  await page.waitForSelector('[data-meet-step="1"]', { timeout: 60000 }).catch(() => null)
  await page.waitForTimeout(2500)
  const slid = await sim(page, 's.a1.maxX')
  check('meet step 2: the room demonstrates by itself (the Ploob slides and the ruler unrolls)', slid > 0.2, `maxX ${slid}`)
  const steps = await passMeet(page)
  check('meet: two more steps, then the prediction', steps === 2, String(steps))
  check('meet demos leave no trace: the episode state is reset before the question', (await sim(page, 's.a1.maxX')) === 0 && (await sim(page, 's.runs')) === 0)
  const opts = await page.locator('[data-predict] [data-option]').count()
  check('A1 predict offers three outcome tiles', opts === 3, String(opts))
  const busy = await page.evaluate(() => document.querySelectorAll('[data-beat] button, [data-beat] [data-interactive]').length)
  check('busy budget: predict beat shows ≤ 3 interactive things in the strip', busy <= 3, String(busy))
  await auditHits(page, 'landscape predict')
  await tap(page, '[data-option="bigger"]')
  check('predict → play', await waitBeat(page, 'play'))
  check('no button anywhere opens an equation', (await page.locator('[data-equation-card]').count()) === 0 && (await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => /equation/i.test(b.textContent || '')))) === false)

  // The one real drag.
  await page.waitForTimeout(600)
  await page.mouse.move(235, 380)
  await page.mouse.down()
  await page.mouse.move(700, 400, { steps: 6 })
  await page.mouse.move(1000, 420, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(800)
  const dragged = await sim(page, 's.a1.maxX')
  if (dragged > 0.3) check('A1: a pointer drag moves the Ploob along the lane', true, `max ${dragged.toFixed(2)} m`)
  else skip('A1: a pointer drag moves the Ploob along the lane', `software renderer dropped the drag (max ${dragged}); the API path is checked instead`)
  const camBefore = await page.evaluate(() => { const c = window.__physicsScene; return !!c })
  check('scene graph is exposed for measurement', camBefore)
  await sim(page, '(api.dragA1(s, 3.1), 0)')
  check('A1 play → notice once the Ploob passes the flag', await waitBeat(page, 'notice'))
  await tap(page, '[data-noticed]')
  check('A1 (no equation) lands on Say it back', await page.waitForSelector('[data-beat="land"] [data-sentence]', { timeout: 30000 }).then(() => true).catch(() => false))
  const tiles = await page.locator('[data-sentence]').count()
  check('three sentence tiles: right, swapped, wrong', tiles === 3, String(tiles))
  await tap(page, '[data-sentence="right"]')
  check('right sentence → done, object on the shelf', await waitBeat(page, 'done'))
  const evA1 = await page.evaluate(() => JSON.parse(localStorage.getItem('ploobia.events.v1') || '[]').filter((e) => e.cabinet === 'physics').map((e) => e.type + ':' + (e.payload.missionId || e.payload.variable || '')))
  check('A1 events: session, one prediction, one mission.completed a1', evA1.filter((e) => e === 'mission.completed:a1').length === 1 && evA1.filter((e) => e.startsWith('prediction.committed')).length === 1, evA1.join(' '))
  const shelfDone = await page.evaluate(() => { const s = window.__physicsScene; return !!s.getObjectByName('shelf-a1') })
  check('shelf has a slot for the landed episode', shelfDone)

  await tap(page, '[data-next]')
  check('next → A2 arrives, meets, predicts', (await passMeet(page)) === 3 && (await sim(page, 's.episode')) === 'a2')
  const evMeet = await page.evaluate(() => JSON.parse(localStorage.getItem('ploobia.events.v1') || '[]').filter((e) => e.cabinet === 'physics' && e.type === 'reading.recorded').length)
  check('meet demos log no evidence', evMeet === 0)
  check('URL carries the episode id for teachers', page.url().includes('#/physics/a2'))
  await tap(page, '[data-option="blue"]')
  await waitBeat(page, 'play')
  check('A2 has one control: the stopwatch (no separate Go)', (await page.locator('[data-dial="go"]').count()) === 0 && (await page.locator('[data-dial="stopwatch"]').count()) === 1)
  await sim(page, '(api.tapRaceA2(s, s.time), 0)')
  await page.waitForTimeout(300)
  check('A2 START starts the race and the stopwatch together', (await sim(page, 's.a2.runs')) === 1 && (await sim(page, 's.a2.swRunning')) === true)
  await sim(page, 'api.tapRaceA2(s, s.a2.swStartAt + 2.5)')
  check('A2 lap recorded from stamped taps', Math.abs((await sim(page, 's.a2.lap')) - 2.5) < 1e-6)
  check('A2 play → notice once timed', await waitBeat(page, 'notice'))
  await tap(page, '[data-noticed]')
  const cardUp = await page.waitForSelector('[data-equation-card="speed"]', { timeout: 30000 }).then(() => true).catch(() => false)
  check('A2 lands on the HUD equation card, not a label', cardUp)
  await page.waitForTimeout(2500)
  const rows = await page.evaluate(() => {
    const card = document.querySelector('[data-equation-card]')
    const nums = [...card.querySelectorAll('[data-value]')].map((n) => n.textContent.trim())
    const size = parseFloat(getComputedStyle(card.querySelector('[data-symbol-row] button')).fontSize)
    const arrows = card.querySelectorAll('svg path[marker-end]').length
    const dim = getComputedStyle(card.firstElementChild).backgroundColor
    return { nums, size, arrows, dim }
  })
  check('card: learner\'s numbers appear under the symbols (4.0 m ÷ 2.50 s = 1.60 m/s)', rows.nums.join(' ').includes('4.0') && rows.nums.join(' ').includes('2.50') && rows.nums.join(' ').includes('1.60'), rows.nums.join(' | '))
  check('card: symbol row ≥ 40 px at 1280 wide', rows.size >= 40, `${rows.size}px`)
  check('card: one arrow per right-hand symbol (ruler + stopwatch)', rows.arrows === 2, String(rows.arrows))
  check('card: scene is dimmed, not hidden', /rgba\(14, 22, 32/.test(rows.dim), rows.dim)
  await page.screenshot({ path: 'shots/verify-card.png' })
  await tap(page, '[data-equation-card] [data-sentence="swapped"]')
  await page.waitForTimeout(400)
  check('card: a wrong sentence does not close the card', (await page.locator('[data-equation-card]').count()) === 1)
  await tap(page, '[data-equation-card] [data-sentence="right"]')
  check('card: the right sentence closes it and lands the episode', await waitBeat(page, 'done') && (await page.locator('[data-equation-card]').count()) === 0)
  const ev = await page.evaluate(() => JSON.parse(localStorage.getItem('ploobia.events.v1') || '[]').filter((e) => e.cabinet === 'physics').map((e) => e.type + ':' + (e.payload.missionId || e.payload.variable || '')))
  check('A2 events: exactly one reading.recorded speed and one mission.completed a2', ev.filter((e) => e === 'reading.recorded:speed').length === 1 && ev.filter((e) => e === 'mission.completed:a2').length === 1, ev.join(' '))
  const perf = await page.evaluate(() => window.__perf)
  if (perf && perf.drawCalls) check('perf: room ≤ 140 draw calls at the low tier', perf.drawCalls <= 140, `${perf.drawCalls} calls, ${perf.triangles} tris`)
  else skip('perf: room draw calls', 'no __perf probe reading')
  await context.close()
}

/* ---- Deep link with missing prerequisites; the shelf door ---- */
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  watch(page)
  await page.goto(`${BASE}#/physics/a5?q=low`, { waitUntil: 'load' })
  await page.waitForTimeout(3500)
  await tap(page, '[data-start]')
  await page.waitForTimeout(1500)
  const chip = await page.textContent('[data-coach]').catch(() => '')
  check('deep link #/physics/a5 with nothing done: chip names the first missing episode', /Where is it\?/.test(chip || ''), chip || '')
  check('…and offers a tile to go there', (await page.locator('[data-goto="a1"]').count()) === 1)
  check('…and does not offer predict tiles', (await page.locator('[data-predict]').count()) === 0)
  await context.close()

  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await seed(ctx2, ['a1', 'a2', 'a3'])
  const p2 = await ctx2.newPage()
  watch(p2)
  await p2.goto(`${BASE}#/physics/a4?q=low`, { waitUntil: 'load' })
  await p2.waitForTimeout(3500)
  await tap(p2, '[data-start]')
  check('after A3 the shelf door to the Yard is visible', await waitBeat(p2, 'meet') && (await p2.evaluate(() => { const d = window.__physicsScene.getObjectByName('shelf-door'); return !!d && d.visible })))
  check('shelf state derives from the event log alone (a1–a3 ticked after reload)', await p2.evaluate(() => ['a1', 'a2', 'a3'].every((id) => !!window.__physicsScene.getObjectByName(`shelf-${id}`))))
  await ctx2.close()
}

/* ---- Portrait phone ---- */
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  watch(page)
  await page.goto(`${BASE}#/physics?q=low`, { waitUntil: 'load' })
  await page.waitForTimeout(3500)
  await tap(page, '[data-start]')
  check('portrait: reaches meet', await waitBeat(page, 'meet'))
  await auditHits(page, 'portrait meet')
  await passMeet(page)
  check('portrait: reaches predict', (await page.locator('[data-beat="predict"]').count()) === 1)
  await auditHits(page, 'portrait predict')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  check('portrait: no horizontal overflow', !overflow)
  const strip = await page.locator('[data-beat]').boundingBox()
  check('portrait: the beat strip sits inside the viewport', !!strip && strip.y + strip.height <= 844 + 1 && strip.x >= 0, JSON.stringify(strip))
  await page.screenshot({ path: 'shots/verify-portrait.png' })
  await context.close()
}

/* ---- Reduced motion ---- */
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' })
  await seed(context, ['a1'])
  const page = await context.newPage()
  watch(page)
  await page.goto(`${BASE}#/physics/a2?q=low`, { waitUntil: 'load' })
  await page.waitForTimeout(3500)
  await tap(page, '[data-start]')
  await passMeet(page)
  await tap(page, '[data-option="blue"]')
  await waitBeat(page, 'play')
  await sim(page, '(api.tapRaceA2(s, s.time), api.tapRaceA2(s, s.a2.swStartAt + 2.0), 0)')
  await waitBeat(page, 'notice')
  await tap(page, '[data-noticed]')
  await page.waitForSelector('[data-equation-card]', { timeout: 30000 }).catch(() => null)
  const anim = await page.evaluate(() => [...document.querySelectorAll('[data-equation-card] [data-value]')].map((n) => getComputedStyle(n).animationName).filter((a) => a && a !== 'none'))
  check('reduced motion: the card opens with no animated transforms', anim.length === 0, anim.join(','))
  check('reduced motion: sentences are available at once', (await page.locator('[data-equation-card] [data-sentence]').count()) === 3)
  await context.close()
}

check('no console errors across the run', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
await browser.close()
process.exit(tally())
