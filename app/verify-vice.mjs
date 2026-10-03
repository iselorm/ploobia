/**
 * S2 round A3 — the rusted strap, the vice and the repair drawing, walked in
 * the browser (storyboard v3.1 §03 M1 and M5; the design of 2 Oct). Build the
 * world edition (`VITE_WORLD=1 npx vite build --outDir dist-world`), serve
 * dist-world on :8766, then `node verify-vice.mjs`. Env: VICE_Q (quality,
 * default low), VICE_SHOTS, VICE_ONLY (a comma list of section numbers).
 *
 * Pins: on Sela's errand the first step into the Foundry cuts to the rusted
 * strap before the brief, one tap takes it, and the brief follows; after the
 * kit the plate points at the vice and Sefu stands there; the copper strip is
 * cut from the runner; the child says which gives first before any weight;
 * ingots hang on all four, the arms dip (copper further than iron), and on the
 * lift they spring back or keep the bend, the reading tagged on the strip; a
 * big step leaves a coarse record and fresh strips mend it; the drawing is
 * pointed at and moves; the why is three taps, or the child's own words
 * through the judge; the plate moves to "Bring them to Sela"; a reload keeps
 * the record; phones keep the strip at the top and fold to a pill.
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { reporter, resilientClick } from './verify-lib.mjs'

const BASE = process.env.WORLD_BASE ?? 'http://localhost:8766/index.html'
const SHOTS = path.resolve(process.env.VICE_SHOTS ?? 'shots')
const ONLY = process.env.VICE_ONLY ? new Set(process.env.VICE_ONLY.split(',')) : null
const runs = (n) => !ONLY || ONLY.has(String(n))
fs.mkdirSync(SHOTS, { recursive: true })
const { check, tally } = reporter()
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })

async function open(viewport, { touch = false, q = process.env.VICE_Q ?? 'low', judge = null } = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_TUNNEL|favicon|WebGL|GPU|swiftshader|503|api\/why/i.test(m.text())) errors.push(m.text())
  })
  const asked = []
  await page.route('**/api/why', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}')
    asked.push(body)
    const answer = judge?.(body, asked.length)
    if (!answer) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'no TYPESAFE_API_KEY secret' }) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, ...answer }) })
  })
  await page.goto(`${BASE}?q=${q}#/world`, { waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__world, null, { timeout: 60000 })
  await resilientClick(page.getByTestId('play'), { label: 'Play' })
  await page.waitForFunction(() => window.__world.get().phase === 'play')
  return { page, ctx, errors, asked }
}

const SIX = ['scrap.nugget', 'scrap.pin', 'scrap.offcut', 'scrap.knob', 'scrap.drip', 'scrap.bell']
const NEW_BEND = { cut: false, guess: null, load: 0, on: false, readings: { copper: { back: 0, gaveAt: null }, oldCopper: { back: 0, gaveAt: null }, iron: { back: 0, gaveAt: null }, rusted: { back: 0, gaveAt: null } }, sets: 1, done: false, pick: null, why: -1, whyText: null }

/** Sela's errand, the relight done, the kit cast from a level charge of ten, Sefu's measure question answered. */
async function kitDone(page, band = 'explorer') {
  await page.evaluate(
    ([b, inJug, bend]) => {
      window.__world.setBand(b)
      window.__world.set((s) => ({
        zone: 'foundry', prediction: 1000, step: 'done', fed: ['scrap.a', 'scrap.b'], lit: ['wetwood', 'drywood', 'charcoal'], hearths: { wetwood: 550, drywood: 900, charcoal: 1200 },
        bellowsSeen: true, pipeFixed: true, air: 1, poured: true, pourSeen: true, whys: [0, 1, 1], strap: 'taken', furnace: { lit: true, fuel: 'charcoal', temp: 1200 }, plot: { ...s.plot, sent: true },
        supply: {
          bench: { phase: 'charged', inJug, patternIn: false, marked: true, matched: 1000, dry: 10, runner: true, inspected: [], sentUnlevel: false, charge: 9856, recasts: 0, castDry: 0 },
          cast: { pours: [{ fraction: 1, short: false, pinSeatMissing: false, spareG: 896, dry: 10, chargeG: 9856, guess: false }], why: 0, whyText: null },
          pouredAt: null,
          bend,
        },
      }))
    },
    [band, SIX, NEW_BEND],
  )
  await page.waitForTimeout(600)
  await page.evaluate(() => document.querySelector('[data-testid=codex-close]')?.click())
  // The HUD mounted before this state was set, so it still holds the three whys and the stamp open
  // (a real reload restores first and never shows them): step through them as a child would.
  for (let i = 0; i < 4; i++) {
    const next = page.locator('[data-testid=why-next], [data-testid=stamp] button').first()
    if (await next.count().catch(() => 0)) await resilientClick(next, { label: 'old whys' })
    await page.waitForTimeout(250)
  }
}
const waitFor = (page, fn, ms = 20000, arg) => page.waitForFunction(fn, arg, { timeout: ms })
const w = (page) => page.evaluate(() => window.__world.get())
const bend = (page) => page.evaluate(() => window.__world.get().supply?.bend ?? null)
const node = (page, name) => page.evaluate((n) => window.__world.scene?.getObjectByName?.(n)?.userData ?? null, name)
const exists = (page, name) => page.evaluate((n) => !!window.__world.scene?.getObjectByName?.(n), name)
const tap = (page, id) => resilientClick(page.getByTestId(id), { label: id })
const text = (page, id) => page.getByTestId(id).first().textContent().catch(() => null)
const has = (page, id) => page.getByTestId(id).count().then((n) => n > 0)
const walkTo = async (page, x, z, yaw) => {
  await page.evaluate(([x, z, yaw]) => { window.__world.live.camYaw = yaw; window.__world.setPos(x, 0.6, z) }, [x, z, yaw])
  await page.waitForTimeout(700)
}
const AT_VICE = [10.9, -4.2, -Math.PI / 2]
const AT_DRAWING = [11.1, -1.25, -Math.PI / 2]
const AT_STRAP = [4.75, 9.3, Math.PI]
const box = (page, id) => page.getByTestId(id).first().boundingBox().catch(() => null)
const smallTargets = (page, root) =>
  page.evaluate((sel) => {
    const r = document.querySelector(sel)
    if (!r) return ['(no root)']
    return [...r.querySelectorAll('button')].filter((b) => { const bb = b.getBoundingClientRect(); return bb.width > 0 && (bb.width < 36 || bb.height < 36) }).map((b) => `${b.textContent?.trim()} ${Math.round(b.getBoundingClientRect().width)}×${Math.round(b.getBoundingClientRect().height)}`)
  }, root)
const overflowX = (page) => page.evaluate(() => [...document.querySelectorAll('.hud [data-testid]')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > window.innerWidth + 1 || b.left < -1) }).map((e) => e.getAttribute('data-testid')))
/** Into the vice's room by the verb. */
async function toVice(page, { touch = false } = {}) {
  await walkTo(page, ...AT_VICE)
  await waitFor(page, () => window.__world.get().near === 'vice.strips')
  if (touch) await tap(page, 'interact')
  else await page.keyboard.press('e')
  await waitFor(page, () => window.__world.get().room === 'vice')
  await page.waitForTimeout(400)
}
/** The arm's angle once it has stopped moving (radians of dip). */
async function settled(page, id) {
  let last = null
  for (let i = 0; i < 40; i++) {
    const a = (await node(page, `vice-strip-${id}`))?.angle ?? null
    if (last != null && a != null && Math.abs(a - last) < 0.002) return a
    last = a
    await page.waitForTimeout(160)
  }
  return last
}
/** One more ingot, then lift, waiting for the arms each time. */
async function step(page) {
  await tap(page, 'vice-hang')
  await waitFor(page, () => window.__world.get().supply.bend.on)
  await settled(page, 'iron')
  await tap(page, 'vice-lift')
  await waitFor(page, () => !window.__world.get().supply.bend.on)
  await settled(page, 'iron')
}

/* ------------------------------------------------------------------------ */
/* 1. Desktop — the strap is the arrival beat                                */
/* ------------------------------------------------------------------------ */
if (runs(1)) {
  const { page, ctx, errors } = await open({ width: 1280, height: 800 })
  await page.evaluate(() => window.__world.set((s) => ({ plot: { ...s.plot, sent: true } })))
  await page.evaluate(() => window.__world.keep.cross('foundry'))
  await waitFor(page, () => window.__world.get().zone === 'foundry' && !!window.__world.scene.getObjectByName('strap-bench'), 60000)
  await page.waitForTimeout(900)
  let s = await w(page)
  check('on Sela\'s errand the first step into the Foundry cuts to the strap', s.room === 'strap' && s.strap === 'shown', `${s.room} ${s.strap}`)
  check('…before the brief', !(await has(page, 'brief')))
  check('…Sefu: "Off the watch\'s jetty gate. Rusted through. Sela wants ones that won\'t."', /Off the watch's jetty gate\. Rusted through\. Sela wants ones that won't\./.test((await text(page, 'strap-line')) ?? ''), await text(page, 'strap-line'))
  check('…no stick, no verb, no coach while it is up', !(await has(page, 'stick')) && !(await has(page, 'interact')) && !(await has(page, 'coach')))
  check('…the strap lies on the bench beside him, in two pieces', (await exists(page, 'strap-rusted')) && (await exists(page, 'strap-end')) && (await node(page, 'sefu'))?.at === 'post')
  await page.screenshot({ path: path.join(SHOTS, 'vice-strap-desktop.png') })
  await tap(page, 'strap-take')
  await waitFor(page, () => window.__world.get().strap === 'taken')
  await page.waitForTimeout(1500)
  check('one tap takes it: it lifts off the bench', ((await node(page, 'strap-rusted'))?.lift ?? 0) > 0.05, JSON.stringify(await node(page, 'strap-rusted')))
  check('…what it is, tagged on it: snapped at the pin hole; flakes come off in your fingers', /snapped at the pin hole/.test((await text(page, 'strap-tag-break')) ?? '') && /flakes come off in your fingers/.test((await text(page, 'strap-tag-flakes')) ?? ''))
  check('…Sefu: "I can\'t pour a thing cold. And I\'ve forty bells waiting behind it."', /I can't pour a thing cold\. And I've forty bells waiting behind it\./.test((await text(page, 'strap-line')) ?? ''), await text(page, 'strap-line'))
  await page.screenshot({ path: path.join(SHOTS, 'vice-strap-taken-desktop.png') })
  await tap(page, 'strap-back')
  await waitFor(page, () => window.__world.get().room === 'none')
  await page.waitForTimeout(500)
  check('"Back to work": the yard, and now the brief', await has(page, 'brief'))
  // Walk up to it again later: it opens by its own verb, with nothing to take.
  await page.evaluate(() => window.__world.set({ prediction: 1000 }))
  await page.waitForTimeout(300)
  await walkTo(page, ...AT_STRAP)
  await waitFor(page, () => window.__world.get().near === 'strap.bench')
  check('by the bench the verb reads The rusted strap', /The rusted strap/.test((await text(page, 'interact')) ?? ''), await text(page, 'interact'))
  await page.keyboard.press('e')
  await waitFor(page, () => window.__world.get().room === 'strap')
  await page.waitForTimeout(300)
  check('…it opens again: the tags, no second take', (await has(page, 'strap-tag-break')) && !(await has(page, 'strap-take')))
  await tap(page, 'strap-back')
  check('no console errors across the strap', errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

/* ------------------------------------------------------------------------ */
/* 2. Desktop — the vice and the drawing, Explorer                           */
/* ------------------------------------------------------------------------ */
if (runs(2)) {
  const { page, ctx, errors } = await open({ width: 1280, height: 800 })
  await kitDone(page)
  let plate = (await text(page, 'quest-plate')) ?? ''
  check('after the kit the plate reads Test the straps', /Test the straps/.test(plate), plate.slice(0, 140))
  check('…Ploob points at the vice', /vice/i.test((await text(page, 'coach')) ?? ''), await text(page, 'coach'))
  check('…and Sefu stands by it', (await node(page, 'sefu'))?.at === 'vice', JSON.stringify(await node(page, 'sefu')))
  await walkTo(page, ...AT_VICE)
  await waitFor(page, () => window.__world.get().near === 'vice.strips')
  check('by the vice the verb reads The vice', /The vice/.test((await text(page, 'interact')) ?? ''), await text(page, 'interact'))
  await page.keyboard.press('e')
  await waitFor(page, () => window.__world.get().room === 'vice')
  await page.waitForTimeout(500)
  check('E cuts into the vice\'s room: the strip, no stick, no verb, no coach', (await has(page, 'vice-strip')) && !(await has(page, 'stick')) && !(await has(page, 'interact')) && !(await has(page, 'coach')))
  check('…three strips clamped and tagged, one clamp empty', (await exists(page, 'vice-strip-oldCopper')) && (await exists(page, 'vice-strip-iron')) && (await exists(page, 'vice-strip-rusted')) && !(await exists(page, 'vice-strip-copper')) && /old copper/.test((await text(page, 'strip-tag-oldCopper')) ?? '') && /rusted iron/.test((await text(page, 'strip-tag-rusted')) ?? ''))
  check('…no ingot to hang yet', !(await has(page, 'vice-hang')))
  await page.screenshot({ path: path.join(SHOTS, 'vice-uncut-desktop.png') })
  await tap(page, 'vice-cut')
  await waitFor(page, () => window.__world.get().supply.bend.cut)
  await page.waitForTimeout(400)
  check('Sefu cuts a strip off the runner: the fourth clamp is filled', (await exists(page, 'vice-strip-copper')) && /new copper/.test((await text(page, 'strip-tag-copper')) ?? ''))
  check('…and the tray knows it gave 90 g', (await node(page, 'cast-tray'))?.stripCut === true, JSON.stringify(await node(page, 'cast-tray')))
  check('…Sefu: "You tell me which gives first."', /You tell me which gives first\./.test((await text(page, 'vice-line')) ?? ''), await text(page, 'vice-line'))
  check('…four strips to point at, and "not sure"; still no ingot', (await has(page, 'vice-guess-copper')) && (await has(page, 'vice-guess-oldCopper')) && (await has(page, 'vice-guess-iron')) && (await has(page, 'vice-guess-rusted')) && (await has(page, 'vice-guess-unsure')) && !(await has(page, 'vice-hang')))
  await page.screenshot({ path: path.join(SHOTS, 'vice-predict-desktop.png') })
  await tap(page, 'vice-guess-copper')
  await waitFor(page, () => window.__world.get().supply.bend.guess === 'copper')
  await page.waitForTimeout(300)
  check('the guess is made; now the ingots', (await has(page, 'vice-hang')) && !(await has(page, 'vice-guess-copper')))

  // One ingot: every arm dips, copper further than iron, the rusted one furthest.
  await tap(page, 'vice-hang')
  await waitFor(page, () => window.__world.get().supply.bend.on)
  let cu = await settled(page, 'copper')
  let fe = await settled(page, 'iron')
  let ru = await settled(page, 'rusted')
  check('one ingot on each: every arm dips', cu > 0.01 && fe > 0.01 && ru > 0.01, `cu ${cu?.toFixed(3)} fe ${fe?.toFixed(3)} ru ${ru?.toFixed(3)}`)
  check('…copper further than iron, rusted iron furthest', cu > fe * 1.3 && ru > cu, `cu ${cu?.toFixed(3)} fe ${fe?.toFixed(3)} ru ${ru?.toFixed(3)}`)
  check('…the load is on the object: "1 ingot on each"', /1 ingot on each/.test((await text(page, 'vice-tag')) ?? ''), await text(page, 'vice-tag'))
  check('…and the verb is the lift', (await has(page, 'vice-lift')))
  await page.screenshot({ path: path.join(SHOTS, 'vice-loaded-desktop.png') })
  await tap(page, 'vice-lift')
  await waitFor(page, () => !window.__world.get().supply.bend.on)
  cu = await settled(page, 'copper')
  check('lifted: the arms spring back', Math.abs(cu) < 0.01 && Math.abs(await settled(page, 'rusted')) < 0.01, `cu ${cu?.toFixed(3)}`)
  check('…each strip says so: "came back from 1"', /came back from 1/.test((await text(page, 'strip-tag-copper')) ?? '') && /came back from 1/.test((await text(page, 'strip-tag-iron')) ?? ''), await text(page, 'strip-tag-copper'))

  await step(page)
  ru = await settled(page, 'rusted')
  check('two: the rusted strip cracked, and stays down', ru > 0.4 && (await node(page, 'vice-strip-rusted'))?.state === 'cracked', `${ru?.toFixed(3)} ${JSON.stringify(await node(page, 'vice-strip-rusted'))}`)
  check('…tagged "cracked at 2"; Ploob: "It cracked."', /cracked at 2/.test((await text(page, 'strip-tag-rusted')) ?? '') && /It cracked\./.test((await text(page, 'vice-ploob')) ?? ''), `${await text(page, 'strip-tag-rusted')} | ${await text(page, 'vice-ploob')}`)
  check('…the guess is compared, not scored: "You said the new copper."', /You said the new copper/.test((await text(page, 'vice-guess-line')) ?? ''), await text(page, 'vice-guess-line'))
  await page.screenshot({ path: path.join(SHOTS, 'vice-cracked-desktop.png') })

  await step(page)
  cu = await settled(page, 'copper')
  fe = await settled(page, 'iron')
  check('three: both coppers keep the bend, new iron comes back', cu > 0.12 && (await settled(page, 'oldCopper')) > 0.12 && Math.abs(fe) < 0.01, `cu ${cu?.toFixed(3)} fe ${fe?.toFixed(3)}`)
  check('…the bend that stayed is marked on the object', (await exists(page, 'vice-wedge-copper')) && (await exists(page, 'vice-wedge-oldCopper')) && !(await exists(page, 'vice-wedge-iron')))
  check('…tagged "stayed bent at 3" / "came back from 3"', /stayed bent at 3/.test((await text(page, 'strip-tag-copper')) ?? '') && /stayed bent at 3/.test((await text(page, 'strip-tag-oldCopper')) ?? '') && /came back from 3/.test((await text(page, 'strip-tag-iron')) ?? ''))
  check('…Ploob: "It stayed bent."', /It stayed bent\./.test((await text(page, 'vice-ploob')) ?? ''), await text(page, 'vice-ploob'))
  check('the Explorer\'s test is done; Sefu: "So what would you never make from that strip?"', (await bend(page)).done && /So what would you never make from that strip\?/.test((await text(page, 'vice-line')) ?? ''), await text(page, 'vice-line'))
  await page.screenshot({ path: path.join(SHOTS, 'vice-bent-desktop.png') })

  // The drawing.
  await tap(page, 'vice-to-drawing')
  await waitFor(page, () => window.__world.get().room === 'drawing')
  await page.waitForTimeout(500)
  check('"To the drawing" cuts to the board', (await has(page, 'drawing-strip')) && (await exists(page, 'vice-drawing')))
  check('…two things to point at: the brace, a strap', (await has(page, 'drawing-pick-brace')) && (await has(page, 'drawing-pick-strap')))
  check('…the leaf hangs square', Math.abs((await node(page, 'vice-drawing'))?.sag ?? 1) < 0.005, JSON.stringify(await node(page, 'vice-drawing')))
  await page.screenshot({ path: path.join(SHOTS, 'vice-drawing-desktop.png') })
  await tap(page, 'drawing-pick-brace')
  await waitFor(page, () => window.__world.get().supply.bend.pick === 'brace')
  const moved = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let max = 0
        const t0 = performance.now()
        const t = setInterval(() => {
          const d = window.__world.scene.getObjectByName('vice-drawing')?.userData ?? {}
          max = Math.max(max, d.sag ?? 0)
          if (d.phase === 'square' || performance.now() - t0 > 30000) {
            clearInterval(t)
            resolve({ max, end: d.sag ?? null, phase: d.phase })
          }
        }, 60)
      }),
  )
  check('the drawing moves: a copper brace lets the leaf sag…', moved.max > 0.05, JSON.stringify(moved))
  check('…and with the timber brace it comes back square', moved.phase === 'square' && Math.abs(moved.end) < 0.01, JSON.stringify(moved))
  check('…Sefu: "The brace carries the gate. These keep it straight. Smaller job."', /The brace carries the gate\. These keep it straight\. Smaller job\./.test((await text(page, 'drawing-line')) ?? ''), await text(page, 'drawing-line'))
  check('…the child asks for the why when ready; the clip can be watched again', (await has(page, 'drawing-ask')) && (await has(page, 'drawing-again')))
  await tap(page, 'drawing-ask')
  await waitFor(page, () => !!document.querySelector('[data-testid=bend-why-0]'), 20000)
  check('then the why: "Why does the gate still get copper?", three short answers, no typing for an Explorer', /Why does the gate still get copper\?/.test((await text(page, 'drawing-line')) ?? '') && (await has(page, 'bend-why-1')) && (await has(page, 'bend-why-2')) && !(await has(page, 'bend-why-text')), await text(page, 'drawing-line'))
  const rec = (await text(page, 'bend-record')) ?? ''
  check('…with the child\'s four readings pinned beside it', /new copper/.test(rec) && /stayed bent at 3/.test(rec) && /cracked at 2/.test(rec) && /came back from 3/.test(rec), rec)
  await page.screenshot({ path: path.join(SHOTS, 'vice-why-desktop.png') })
  check('…the right answer is not the first one', /Stronger than iron/.test((await text(page, 'bend-why-0')) ?? '') && /No rust/.test((await text(page, 'bend-why-1')) ?? ''))
  await tap(page, 'bend-why-0')
  await waitFor(page, () => window.__world.get().supply.bend.why === 0)
  await page.waitForTimeout(300)
  check('"Stronger than iron": Ploob reasons from the record, no buzzer', /copper stayed bent at 3/.test((await text(page, 'bend-why-line')) ?? '') && /Iron is the stronger/.test((await text(page, 'bend-why-line')) ?? ''), await text(page, 'bend-why-line'))
  check('…no extra line for an Explorer', !(await has(page, 'bend-seed')))
  await tap(page, 'drawing-back')
  await waitFor(page, () => window.__world.get().room === 'none')
  await page.waitForTimeout(500)
  plate = (await text(page, 'quest-plate')) ?? ''
  check('stepping back: the plate reads Bring them to Sela', /Bring them to Sela/.test(plate), plate.slice(0, 160))

  // A reload keeps the record.
  await page.waitForTimeout(1200)
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  await page.waitForTimeout(300)
  await page.reload({ waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__world, null, { timeout: 60000 })
  await resilientClick(page.getByTestId('play'), { label: 'Continue' })
  await waitFor(page, () => window.__world.get().phase === 'play')
  await page.waitForTimeout(800)
  const b = await bend(page)
  check('after a reload: the readings, the pick and the answer are kept', b?.readings.copper.gaveAt === 3 && b.readings.rusted.gaveAt === 2 && b.pick === 'brace' && b.why === 0 && (await w(page)).strap === 'taken', JSON.stringify(b))
  check('…and the bent strips are still bent in the vice', ((await settled(page, 'copper')) ?? 0) > 0.12)
  check('no console errors across the desktop walk', errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

/* ------------------------------------------------------------------------ */
/* 3. Desktop — a big step, fresh strips, the judge (Scientist)              */
/* ------------------------------------------------------------------------ */
if (runs(3)) {
  const { page, ctx, errors, asked } = await open({ width: 1280, height: 800 }, { judge: () => ({ verdict: 'right', confidence: 0.9, misconception: null, usesEvidence: 1 }) })
  await kitDone(page, 'scientist')
  await toVice(page)
  await tap(page, 'vice-cut')
  await waitFor(page, () => window.__world.get().supply.bend.cut)
  await tap(page, 'vice-guess-unsure')
  await waitFor(page, () => window.__world.get().supply.bend.guess === 'unsure')
  for (let i = 0; i < 5; i++) {
    await tap(page, 'vice-hang')
    await waitFor(page, (n) => window.__world.get().supply.bend.load === n, 20000, i + 1)
  }
  check('five at once: "5 ingots on each"', /5 ingots on each/.test((await text(page, 'vice-tag')) ?? ''), await text(page, 'vice-tag'))
  await tap(page, 'vice-lift')
  await waitFor(page, () => !window.__world.get().supply.bend.on)
  await settled(page, 'copper')
  check('…lifted: three gave together, tagged as a range', /between 1 and 5/.test((await text(page, 'strip-tag-copper')) ?? '') && /cracked between 1 and 5/.test((await text(page, 'strip-tag-rusted')) ?? ''), await text(page, 'strip-tag-copper'))
  check('…Ploob names it and offers fresh strips; no ingot, no drawing', /between 1 and 5/.test((await text(page, 'vice-ploob')) ?? '') && (await has(page, 'vice-fresh')) && !(await has(page, 'vice-hang')) && !(await has(page, 'vice-to-drawing')), await text(page, 'vice-ploob'))
  check('…"not sure" is never compared', !(await has(page, 'vice-guess-line')))
  await page.screenshot({ path: path.join(SHOTS, 'vice-stuck-desktop.png') })
  await tap(page, 'vice-fresh')
  await waitFor(page, () => window.__world.get().supply.bend.sets === 2)
  check('fresh strips: straight again', Math.abs(await settled(page, 'copper')) < 0.01 && Math.abs(await settled(page, 'rusted')) < 0.01)
  for (let i = 0; i < 3; i++) await step(page)
  check('three, one at a time: not done for a Scientist — new iron has not given', !(await bend(page)).done && !(await has(page, 'vice-to-drawing')) && (await has(page, 'vice-hang')))
  // The rest by the store (the gesture is pinned above): 4 to 8.
  await page.evaluate(() => {
    const A = window.__world
    for (let n = 4; n <= 7; n++) A.set((s) => ({ supply: { ...s.supply, bend: { ...s.supply.bend, load: n, readings: { ...s.supply.bend.readings, iron: { back: n, gaveAt: null } } } } }))
  })
  await step(page)
  const fe = await settled(page, 'iron')
  check('eight: new iron keeps a bend at last', (await bend(page)).readings.iron.gaveAt === 8 && fe > 0.12 && /stayed bent at 8/.test((await text(page, 'strip-tag-iron')) ?? ''), `${fe?.toFixed(3)} ${await text(page, 'strip-tag-iron')}`)
  check('…four exact readings: the Scientist\'s test is done', (await bend(page)).done && (await has(page, 'vice-to-drawing')))
  await page.screenshot({ path: path.join(SHOTS, 'vice-eight-desktop.png') })
  await tap(page, 'vice-to-drawing')
  await waitFor(page, () => window.__world.get().room === 'drawing')
  await page.waitForTimeout(400)
  await tap(page, 'drawing-pick-strap')
  await waitFor(page, () => window.__world.get().supply.bend.pick === 'strap')
  check('pointing at a strap: the drawing says what it will show', /straps are copper already/i.test((await text(page, 'drawing-line')) ?? ''), await text(page, 'drawing-line'))
  await waitFor(page, () => !!document.querySelector('[data-testid=drawing-ask]'), 40000)
  await tap(page, 'drawing-ask')
  await waitFor(page, () => !!document.querySelector('[data-testid=bend-why-text]'), 30000)
  check('a Scientist says it first: a text box, no buttons yet', (await has(page, 'bend-why-text')) && !(await has(page, 'bend-why-0')))
  await page.getByTestId('bend-why-text').fill('copper does not rust and the brace holds the weight')
  await tap(page, 'bend-why-say')
  await waitFor(page, () => window.__world.get().supply.bend.why === 1, 20000)
  await page.waitForTimeout(300)
  check('the judge takes it: the right option, their sentence kept and shown', (await bend(page)).whyText === 'copper does not rust and the brace holds the weight' && /copper does not rust and the brace holds the weight/.test((await text(page, 'bend-why-line')) ?? ''), await text(page, 'bend-why-line'))
  check('…the judge was asked about this quest, with the child\'s readings', asked.length === 1 && asked[0].quest === 'foundry.cart.bend' && asked[0].facts?.new_iron === 'stayed bent at 8' && asked[0].facts?.rusted_iron === 'cracked at 2' && asked[0].ask === 'Why does the gate still get copper?', JSON.stringify(asked[0]?.facts ?? null))
  check('no console errors across the Scientist walk', errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

/* ------------------------------------------------------------------------ */
/* 4. Desktop — no judge, and the Analyst's extra line; the gate on the cut   */
/* ------------------------------------------------------------------------ */
if (runs(4)) {
  const { page, ctx, errors } = await open({ width: 1280, height: 800 })
  // Before any heat: the vice stands there, but the strip cannot be cut.
  await page.evaluate(() => {
    window.__world.setBand('analyst')
    window.__world.set((s) => ({ zone: 'foundry', prediction: 1000, step: 'feed', strap: 'taken', plot: { ...s.plot, sent: true } }))
  })
  await page.waitForTimeout(700)
  await page.evaluate(() => document.querySelector('[data-testid=codex-close]')?.click())
  await toVice(page)
  check('before any pour the vice opens, with nothing to cut', !(await has(page, 'vice-cut')) && !(await has(page, 'vice-hang')) && /runner/.test((await text(page, 'vice-ploob')) ?? ''), await text(page, 'vice-ploob'))
  await tap(page, 'vice-back')
  await waitFor(page, () => window.__world.get().room === 'none')

  await kitDone(page, 'analyst')
  // The Analyst's record, set by the store: four exact readings.
  await page.evaluate(() =>
    window.__world.set((s) => ({
      supply: { ...s.supply, bend: { ...s.supply.bend, cut: true, guess: 'rusted', load: 8, on: false, done: true, readings: { copper: { back: 2, gaveAt: 3 }, oldCopper: { back: 2, gaveAt: 3 }, iron: { back: 7, gaveAt: 8 }, rusted: { back: 1, gaveAt: 2 } } } },
    })),
  )
  await page.waitForTimeout(400)
  await walkTo(page, ...AT_DRAWING)
  await waitFor(page, () => window.__world.get().near === 'vice.drawing')
  check('by the board the verb reads The repair drawing', /The repair drawing/.test((await text(page, 'interact')) ?? ''), await text(page, 'interact'))
  await page.keyboard.press('e')
  await waitFor(page, () => window.__world.get().room === 'drawing')
  await page.waitForTimeout(400)
  await tap(page, 'drawing-pick-brace')
  await waitFor(page, () => !!document.querySelector('[data-testid=drawing-ask]'), 40000)
  await tap(page, 'drawing-ask')
  await waitFor(page, () => !!document.querySelector('[data-testid=bend-why-text]'), 30000)
  await page.getByTestId('bend-why-text').fill('it lasts longer')
  await tap(page, 'bend-why-say')
  await waitFor(page, () => !!document.querySelector('[data-testid=bend-why-0]'), 20000)
  check('no judge: the three answers take over without a word', (await has(page, 'bend-why-0')) && !(await has(page, 'bend-why-text')) && (await bend(page)).why === -1)
  await tap(page, 'bend-why-1')
  await waitFor(page, () => window.__world.get().supply.bend.why === 1)
  await page.waitForTimeout(300)
  check('"No rust, and the brace takes the weight": Ploob gives it back in their readings', /cracked at 2/.test((await text(page, 'bend-why-line')) ?? '') && /stayed bent at 3/.test((await text(page, 'bend-why-line')) ?? ''), await text(page, 'bend-why-line'))
  check('…and the Analyst gets one more: what a better gate metal would need', /better gate metal/i.test((await text(page, 'bend-seed')) ?? ''), await text(page, 'bend-seed'))
  await page.screenshot({ path: path.join(SHOTS, 'vice-answered-desktop.png') })
  check('no console errors across the Analyst walk', errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

/* ------------------------------------------------------------------------ */
/* 5. Phones — the strap, the vice, the drawing, the pill                    */
/* ------------------------------------------------------------------------ */
for (const [n, vp] of [[5, { width: 844, height: 390 }], [6, { width: 740, height: 360 }]]) {
  if (!runs(n)) continue
  const tag = `${vp.width}`
  const { page, ctx, errors } = await open(vp, { touch: true })
  await page.evaluate(() => window.__world.set((s) => ({ plot: { ...s.plot, sent: true } })))
  await page.evaluate(() => window.__world.keep.cross('foundry'))
  await waitFor(page, () => window.__world.get().zone === 'foundry' && !!window.__world.scene.getObjectByName('strap-bench'), 60000)
  await page.waitForTimeout(900)
  let sb = await box(page, 'strap-strip')
  check(`[${tag}] the strap's strip is at the top, in the top two fifths`, !!sb && sb.y < 20 && sb.y + sb.height < vp.height * 0.4, JSON.stringify(sb))
  check(`[${tag}] …its buttons are thumb-sized and nothing runs off the screen`, (await smallTargets(page, '[data-testid=strap-strip]')).length === 0 && (await overflowX(page)).length === 0, `${(await smallTargets(page, '[data-testid=strap-strip]')).join(', ')} | ${(await overflowX(page)).join(', ')}`)
  await page.screenshot({ path: path.join(SHOTS, `vice-strap-${tag}.png`) })
  await tap(page, 'strap-take')
  await waitFor(page, () => window.__world.get().strap === 'taken')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: path.join(SHOTS, `vice-strap-taken-${tag}.png`) })
  await tap(page, 'strap-back')
  await waitFor(page, () => window.__world.get().room === 'none')

  await kitDone(page)
  await toVice(page, { touch: true })
  sb = await box(page, 'vice-strip')
  check(`[${tag}] the vice's strip is at the top`, !!sb && sb.y < 20 && sb.y + sb.height < vp.height * 0.45, JSON.stringify(sb))
  await tap(page, 'vice-cut')
  await waitFor(page, () => window.__world.get().supply.bend.cut)
  await page.waitForTimeout(400)
  sb = await box(page, 'vice-strip')
  check(`[${tag}] the guess: five thumb-sized choices, on the screen`, (await smallTargets(page, '[data-testid=vice-guesses]')).length === 0 && (await overflowX(page)).length === 0 && (await has(page, 'vice-guess-unsure')), `${(await smallTargets(page, '[data-testid=vice-guesses]')).join(', ')} | ${(await overflowX(page)).join(', ')}`)
  await page.screenshot({ path: path.join(SHOTS, `vice-predict-${tag}.png`) })
  await tap(page, 'vice-guess-rusted')
  await waitFor(page, () => window.__world.get().supply.bend.guess === 'rusted')
  await step(page)
  await tap(page, 'vice-hang')
  await waitFor(page, () => window.__world.get().supply.bend.on)
  await settled(page, 'iron')
  sb = await box(page, 'vice-strip')
  const tags = await Promise.all(['copper', 'oldCopper', 'iron', 'rusted'].map((id) => box(page, `strip-tag-${id}`)))
  check(`[${tag}] the four strip tags are on the screen and clear of the strip`, tags.every((t) => !!t && t.x >= 0 && t.x + t.width <= vp.width && t.y >= sb.y + sb.height - 2), JSON.stringify({ strip: sb && Math.round(sb.y + sb.height), tags: tags.map((t) => t && [Math.round(t.x), Math.round(t.y), Math.round(t.width)]) }))
  check(`[${tag}] …and do not sit on one another`, tags.every((a, i) => tags.every((b, j) => i >= j || !a || !b || a.x + a.width <= b.x + 1 || b.x + b.width <= a.x + 1 || a.y + a.height <= b.y + 1 || b.y + b.height <= a.y + 1)), JSON.stringify(tags.map((t) => t && [Math.round(t.x), Math.round(t.width)])))
  await page.screenshot({ path: path.join(SHOTS, `vice-loaded-${tag}.png`) })
  // Step away with the hanger on: the pill keeps the vice.
  await tap(page, 'vice-back')
  await waitFor(page, () => window.__world.get().room === 'none')
  await page.waitForTimeout(400)
  check(`[${tag}] stepped away mid-test: a pill in Ploob's slot says where the vice stands`, /Vice/.test((await text(page, 'vice-pill')) ?? '') && /2 on the hanger/.test((await text(page, 'vice-pill')) ?? ''), await text(page, 'vice-pill'))
  await tap(page, 'vice-pill')
  await waitFor(page, () => window.__world.get().room === 'vice')
  await page.waitForTimeout(300)
  check(`[${tag}] …and tapping it goes back, the hanger still on`, (await bend(page)).on && (await has(page, 'vice-lift')))
  await tap(page, 'vice-lift')
  await waitFor(page, () => !window.__world.get().supply.bend.on)
  check(`[${tag}] the guess was the rusted strip: "You said the rusted iron. It gave first."`, /You said the rusted iron\. It gave first\./.test((await text(page, 'vice-guess-line')) ?? ''), await text(page, 'vice-guess-line'))
  await step(page)
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(SHOTS, `vice-bent-${tag}.png`) })
  await tap(page, 'vice-to-drawing')
  await waitFor(page, () => window.__world.get().room === 'drawing')
  await page.waitForTimeout(500)
  sb = await box(page, 'drawing-strip')
  const picks = await box(page, 'drawing-picks')
  check(`[${tag}] the drawing: the strip at the top, the two things to point at down the right side, clear of it`, !!sb && sb.y < 20 && !!picks && picks.y >= sb.y + sb.height && picks.x > vp.width * 0.72 && picks.y + picks.height <= vp.height && (await overflowX(page)).length === 0, JSON.stringify({ sb, picks }))
  await page.screenshot({ path: path.join(SHOTS, `vice-drawing-${tag}.png`) })
  await tap(page, 'drawing-pick-brace')
  await waitFor(page, () => !!document.querySelector('[data-testid=drawing-ask]'), 40000)
  await page.screenshot({ path: path.join(SHOTS, `vice-drawn-${tag}.png`) })
  await tap(page, 'drawing-ask')
  await waitFor(page, () => !!document.querySelector('[data-testid=bend-why-0]'), 30000)
  await page.waitForTimeout(300)
  check(`[${tag}] the why: three thumb-sized answers and the record, all on the screen`, (await smallTargets(page, '[data-testid=bend-whys]')).length === 0 && (await overflowX(page)).length === 0 && (await has(page, 'bend-record')), `${(await smallTargets(page, '[data-testid=bend-whys]')).join(', ')} | ${(await overflowX(page)).join(', ')}`)
  {
    const st = await box(page, 'drawing-strip')
    const rc = await box(page, 'bend-record')
    check(`[${tag}] …the record stands clear of the strip, to the right of the board`, !!st && !!rc && rc.y >= st.y + st.height && rc.x > vp.width * 0.6 && rc.y + rc.height <= vp.height, JSON.stringify({ st, rc }))
  }
  await page.screenshot({ path: path.join(SHOTS, `vice-why-${tag}.png`) })
  await tap(page, 'bend-why-1')
  await waitFor(page, () => window.__world.get().supply.bend.why === 1)
  await page.waitForTimeout(300)
  sb = await box(page, 'drawing-strip')
  check(`[${tag}] answered: Ploob's line fits the strip`, !!sb && sb.y + sb.height < vp.height * 0.6 && /brace takes the weight/.test((await text(page, 'bend-why-line')) ?? ''), JSON.stringify(sb))
  await page.screenshot({ path: path.join(SHOTS, `vice-answered-${tag}.png`) })
  await tap(page, 'drawing-back')
  await waitFor(page, () => window.__world.get().room === 'none')
  await page.waitForTimeout(400)
  check(`[${tag}] no pill once the why is answered`, !(await has(page, 'vice-pill')))
  check(`[${tag}] no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

await browser.close()
process.exit(tally())
