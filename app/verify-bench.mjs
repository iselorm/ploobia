/**
 * S2 round A1 — the cold bench, walked in the browser (storyboard v3.1 §03 M3,
 * §07; the mock reviews of 28–29 Sep). Build the world edition (`VITE_WORLD=1
 * npx vite build --outDir dist-world`), serve dist-world on :8766, then
 * `node verify-bench.mjs`. Env: BENCH_Q (quality, default low), BENCH_SHOTS.
 *
 * Pins: the bench opens at copper heat and the quest becomes the cart; the
 * verb cuts into the room and the explorer is hidden (never through the jug);
 * sink · mark · lift · six drops · done; the balance levels at ten, offers the
 * runner, charges 9,856 g and the wet set stays; the Analyst's lump is found by
 * inspecting, never marked before; the reading tags are anchored on the
 * objects and stay visible; a reload mid-bench comes back whole; phones fold to
 * the pill away from the bench and keep the strip clear of the stick.
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { reporter, resilientClick } from './verify-lib.mjs'

const BASE = process.env.WORLD_BASE ?? 'http://localhost:8766/index.html'
const SHOTS = path.resolve(process.env.BENCH_SHOTS ?? 'shots')
fs.mkdirSync(SHOTS, { recursive: true })
const { check, tally } = reporter()
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })

async function open(viewport, { touch = false, q = process.env.BENCH_Q ?? 'low' } = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_TUNNEL|favicon|WebGL|GPU|swiftshader|503|api\/why/i.test(m.text())) errors.push(m.text())
  })
  await page.goto(`${BASE}?q=${q}#/world`, { waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__world, null, { timeout: 60000 })
  await resilientClick(page.getByTestId('play'), { label: 'Play' })
  await page.waitForFunction(() => window.__world.get().phase === 'play')
  return { page, ctx, errors }
}
/** The courtyard after the pour with the child come across from S0, the furnace holding at charcoal heat. */
async function afterThePour(page, band = 'explorer') {
  await page.evaluate((b) => {
    window.__world.setBand(b)
    window.__world.set((s) => ({
      zone: 'foundry', prediction: 1000, step: 'done', fed: ['scrap.a', 'scrap.b'], lit: ['wetwood', 'drywood', 'charcoal'], hearths: { wetwood: 550, drywood: 900, charcoal: 1200 },
      bellowsSeen: true, pipeFixed: true, air: 1, poured: true, pourSeen: true, whys: [0, 0, 1], furnace: { lit: true, fuel: 'charcoal', temp: 1200 }, plot: { ...s.plot, sent: true },
    }))
  }, band)
  await page.waitForTimeout(600)
  await page.evaluate(() => document.querySelector('[data-testid=codex-close]')?.click())
  // The three whys and the stamp, as a child would click through them.
  for (let i = 0; i < 4; i++) {
    const next = page.locator('[data-testid=why-next], [data-testid=stamp] button').first()
    if (await next.count().catch(() => 0)) await next.click({ timeout: 2000 }).catch(() => {})
    await page.waitForTimeout(150)
  }
}
const waitFor = (page, fn, ms = 15000, arg) => page.waitForFunction(fn, arg, { timeout: ms })
const w = (page) => page.evaluate(() => window.__world.get())
const bench = (page) => page.evaluate(() => window.__world.get().supply?.bench ?? null)
const tap = (page, id) => resilientClick(page.getByTestId(id), { label: id })
const text = (page, id) => page.getByTestId(id).textContent().catch(() => null)
const has = (page, id) => page.getByTestId(id).count().then((n) => n > 0)
const walkTo = async (page, x, z, yaw) => {
  await page.evaluate(([x, z, yaw]) => { window.__world.live.camYaw = yaw; window.__world.setPos(x, 0.6, z) }, [x, z, yaw])
  await page.waitForTimeout(700)
}
const AT_JUG = [-9.6, 3.6, -Math.PI / 2 + 0.3]
const AT_BALANCE = [-9.6, 6.9, -Math.PI / 2 - 0.2]
/** An object's on-screen box, from its tag (a DOM node projected by the scene). */
const box = (page, id) => page.getByTestId(id).boundingBox().catch(() => null)
const overlaps = (a, b) => !!a && !!b && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
const smallTargets = (page, root) =>
  page.evaluate((sel) => {
    const r = document.querySelector(sel)
    if (!r) return ['(no root)']
    return [...r.querySelectorAll('button')].filter((b) => { const bb = b.getBoundingClientRect(); return bb.width > 0 && (bb.width < 36 || bb.height < 36) }).map((b) => `${b.textContent?.trim()} ${Math.round(b.getBoundingClientRect().width)}×${Math.round(b.getBoundingClientRect().height)}`)
  }, root)

/* ------------------------------------------------------------------------ */
/* 1. Desktop — the whole measure, Explorer                                  */
/* ------------------------------------------------------------------------ */
{
  const { page, ctx, errors } = await open({ width: 1280, height: 800 })
  // Before the pour and below copper heat: no bench, the relight's own quest.
  await page.evaluate(() => window.__world.set({ zone: 'foundry', prediction: 1000, lit: ['wetwood'], furnace: { lit: true, fuel: 'drywood', temp: 700 } }))
  await walkTo(page, ...AT_JUG)
  check('below copper heat: nothing to measure, the relight holds the plate', (await w(page)).near !== 'bench.jug' && /Relight the furnace/.test((await text(page, 'quest-plate')) ?? ''))

  await afterThePour(page)
  await walkTo(page, ...AT_JUG)
  let plate = (await text(page, 'quest-plate')) ?? ''
  check('after the pour the plate reads The cart that must leave, Measure the pattern current', /The cart that must leave/.test(plate) && /Measure the pattern/.test(plate) && /Cast the fittings/.test(plate), plate.slice(0, 80))
  check('by the jug the verb reads Measure the pattern', (await w(page)).near === 'bench.jug' && /Measure the pattern/.test((await text(page, 'interact')) ?? ''))
  check('the Measure tool is unlocked here', await page.getByTestId('measure').evaluate((el) => !el.hasAttribute('disabled') && !/locked/i.test(el.getAttribute('aria-label') ?? '')).catch(() => false))
  await page.screenshot({ path: path.join(SHOTS, 'bench-yard-desktop.png') })

  await page.keyboard.press('e')
  await waitFor(page, () => window.__world.get().room === 'bench')
  check('E cuts into the bench room; a fresh bench; the explorer hidden, not walking', (await w(page)).room === 'bench' && (await bench(page))?.phase === 'idle' && (await page.evaluate(() => window.__world.get().held)) === null)
  check('the strip: Sefu\'s line and Sink the pattern; the furnace plate folded to one line', /Water first/.test((await text(page, 'bench-strip')) ?? '') && /Furnace ready/.test((await text(page, 'furnace-ready')) ?? ''))
  check('no stick, no verb, no coach in the room', !(await has(page, 'stick')) && !(await has(page, 'interact')) && !(await has(page, 'coach')))
  check('the jug\'s tag reads 1,500', /1,500/.test((await text(page, 'jug-tag')) ?? ''))
  await tap(page, 'bench-sink')
  await page.waitForTimeout(900)
  check('sink the pattern: the water rises to 2,500', (await bench(page)).phase === 'pattern' && /2,500/.test((await text(page, 'jug-tag')) ?? '') && (await page.evaluate(() => Math.abs((window.__world.scene?.getObjectByName?.('bench-jug')?.userData.level ?? 2500) - 2500) < 5)))
  await page.screenshot({ path: path.join(SHOTS, 'bench-pattern-desktop.png') })
  await tap(page, 'bench-mark')
  check('mark the rise', (await bench(page)).marked === true && /2,500/.test((await text(page, 'jug-tag')) ?? ''))
  await tap(page, 'bench-lift')
  await page.waitForTimeout(600)
  check('lift it out: back to 1,500 with the mark kept, 1,000 to go', (await bench(page)).phase === 'matching' && /1,500 · 1,000 to the mark/.test((await text(page, 'jug-tag')) ?? ''))
  for (const id of ['nugget', 'pin', 'offcut', 'knob', 'drip']) await tap(page, `drop-${id}`)
  await page.waitForTimeout(500)
  check('five pieces in: 2,300, 200 to the mark, "Take it as it is" offered', /2,300 · 200 to the mark/.test((await text(page, 'jug-tag')) ?? '') && /Take it as it is/.test((await text(page, 'bench-done')) ?? ''))
  await tap(page, 'bench-take')
  check('take one out: the last one comes back to the tray', (await bench(page)).inJug.length === 4 && (await has(page, 'drop-drip')))
  await tap(page, 'drop-drip')
  await tap(page, 'drop-bell')
  await page.waitForTimeout(500)
  check('six pieces in: at the mark; the primary reads That\'s the mark', /at the mark/.test((await text(page, 'jug-tag')) ?? '') && /That's the mark/.test((await text(page, 'bench-done')) ?? ''))
  await page.screenshot({ path: path.join(SHOTS, 'bench-match-desktop.png') })
  // The tag is anchored on the jug: it sits above the strip and never under it.
  const tagBox = await box(page, 'jug-tag')
  const stripBox = await box(page, 'bench-strip')
  check('the jug\'s reading stays visible above the strip', !!tagBox && !!stripBox && tagBox.y + tagBox.height < stripBox.y, JSON.stringify({ tag: tagBox && Math.round(tagBox.y), strip: stripBox && Math.round(stripBox.y) }))
  await tap(page, 'bench-done')
  await waitFor(page, () => window.__world.get().room === 'balance')
  check('That\'s the mark: the set goes to the balance and the camera cuts with it', (await bench(page)).phase === 'balancing' && (await bench(page)).matched === 1000)
  check('the balance\'s tag: nothing on the dry pan yet, Explorer wording', /0 dry ingots/.test((await text(page, 'balance-tag')) ?? ''), await text(page, 'balance-tag'))
  for (let i = 0; i < 9; i++) await tap(page, 'balance-add')
  await page.waitForTimeout(700)
  check('nine ingots: dry side light, Send it anyway', /9 dry ingots · dry side light/.test((await text(page, 'balance-tag')) ?? '') && /Send it anyway/.test((await text(page, 'balance-fire')) ?? ''))
  check('…and the beam leans', (await page.evaluate(() => window.__world.scene?.getObjectByName?.('bench-balance')?.userData.tilt ?? -1)) < 0)
  await tap(page, 'balance-add')
  await page.waitForTimeout(700)
  check('ten ingots: level; Sefu offers the runner; To the fire is primary', /10 dry ingots · level/.test((await text(page, 'balance-tag')) ?? '') && /one more for the channel/.test((await text(page, 'balance-strip')) ?? '') && /To the fire/.test((await text(page, 'balance-fire')) ?? ''))
  check('the runner ingot shows beside the base', await page.evaluate(() => !!window.__world.scene?.getObjectByName?.('bench-runner')))
  await page.screenshot({ path: path.join(SHOTS, 'bench-level-desktop.png') })
  await tap(page, 'balance-fire')
  await page.waitForTimeout(400)
  const b = await bench(page)
  check('to the fire: charged 9,856 g, the wet set stays, not a guess', b.phase === 'charged' && b.charge === 9856 && b.inJug.length === 6 && !b.sentUnlevel)
  check('Sefu: Sela\'s, this one — and the plate moves to Cast the fittings', /Sela's, this one/.test((await text(page, 'balance-strip')) ?? '') && (await page.evaluate(() => window.__world.get().step)) === 'done')
  await page.screenshot({ path: path.join(SHOTS, 'bench-charged-desktop.png') })
  await tap(page, 'bench-back')
  await waitFor(page, () => window.__world.get().room === 'none')
  check('step back: out of the room, the bench kept', (await bench(page)).phase === 'charged' && (await has(page, 'interact')))

  // A reload mid-bench: start over on a fresh set, stop at the balance, reload.
  await page.evaluate(() => window.__world.set({ supply: null }))
  await walkTo(page, ...AT_JUG)
  await page.keyboard.press('e')
  await waitFor(page, () => window.__world.get().room === 'bench')
  await tap(page, 'bench-sink'); await tap(page, 'bench-mark'); await tap(page, 'bench-lift')
  for (const id of ['nugget', 'pin', 'offcut']) await tap(page, `drop-${id}`)
  await page.waitForTimeout(1200) // the throttled save
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  await page.waitForTimeout(300)
  await page.reload({ waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__world, null, { timeout: 60000 })
  const cont = page.getByTestId('play')
  await resilientClick(cont, { label: 'Continue' })
  await waitFor(page, () => window.__world.get().phase === 'play')
  const rb = await bench(page)
  check('after a reload the bench is where it was: three pieces in, the mark kept, out of the room', !!rb && rb.phase === 'matching' && rb.inJug.length === 3 && rb.marked && (await w(page)).room === 'none', JSON.stringify(rb && { phase: rb.phase, n: rb.inJug.length }))
  check('no console errors across the desktop walk', errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

/* ------------------------------------------------------------------------ */
/* 2. Desktop — the Analyst's grey lump: notice → inspect → examine           */
/* ------------------------------------------------------------------------ */
{
  const { page, ctx, errors } = await open({ width: 1280, height: 800 })
  await afterThePour(page, 'analyst')
  await walkTo(page, ...AT_JUG)
  await page.keyboard.press('e')
  await waitFor(page, () => window.__world.get().room === 'bench')
  check('the Analyst\'s tray carries a seventh piece, the grey lump', (await page.evaluate(() => window.__world.scene?.getObjectByName?.('bench-tray')?.userData.left)) === 7)
  await tap(page, 'bench-sink'); await tap(page, 'bench-mark'); await tap(page, 'bench-lift')
  for (const id of ['pin', 'offcut', 'knob', 'drip', 'bell', 'grey']) await tap(page, `drop-${id}`)
  await page.waitForTimeout(400)
  check('five copper + the lump reach the mark', /at the mark/.test((await text(page, 'jug-tag')) ?? ''))
  await tap(page, 'bench-done')
  await waitFor(page, () => window.__world.get().room === 'balance')
  for (let i = 0; i < 10; i++) await tap(page, 'balance-add')
  await page.waitForTimeout(700)
  const tag = (await text(page, 'balance-tag')) ?? ''
  check('ten ingots: Measured 8,851 · Predicted 8,960 · 109 g below prediction, grouped in one readout', /Measured 8,851 g/.test(tag) && /Predicted 8,960 g/.test(tag) && /109 g below prediction/.test(tag), tag)
  check('…the beam is not level: the dry side sits heavy, Send it anyway', (await page.evaluate(() => window.__world.scene?.getObjectByName?.('bench-balance')?.userData.tilt ?? 0)) > 0 && /Send it anyway/.test((await text(page, 'balance-fire')) ?? ''))
  check('nothing marks the lump before the child looks: no inspect sheet, no red ring', !(await has(page, 'inspect-sheet')) && !(await page.evaluate(() => !!document.querySelector('[data-testid^=inspect-]'))))
  await page.screenshot({ path: path.join(SHOTS, 'bench-lump-desktop.png') })
  await tap(page, 'balance-inspect')
  check('Inspect the set: the sheet names the discrepancy and lists the pieces, none judged yet', /109 g less/.test((await text(page, 'inspect-sheet')) ?? '') && !/not copper/.test((await text(page, 'inspect-sheet')) ?? ''))
  await tap(page, 'weigh-pin')
  check('a copper piece weighed alone reads 8.96', /8\.96 g\/cm³/.test((await text(page, 'inspect-pin')) ?? ''), await text(page, 'inspect-pin'))
  await tap(page, 'weigh-grey')
  check('the grey lump weighed alone reads 7.9 g/cm³, not copper, and only now is marked', /7\.87 g\/cm³/.test((await text(page, 'inspect-grey')) ?? '') && /not copper/.test((await text(page, 'inspect-grey')) ?? '') && (await has(page, 'out-grey')))
  await page.screenshot({ path: path.join(SHOTS, 'bench-inspect-desktop.png') })
  await tap(page, 'out-grey')
  await waitFor(page, () => window.__world.get().room === 'bench')
  check('take it out: back at the jug at 2,400, the ingots kept', (await bench(page)).phase === 'matching' && /2,400 · 100 to the mark/.test((await text(page, 'jug-tag')) ?? '') && (await bench(page)).dry === 10)
  await tap(page, 'drop-nugget')
  await tap(page, 'bench-done')
  await waitFor(page, () => window.__world.get().room === 'balance')
  await page.waitForTimeout(600)
  check('the sixth copper piece in: level at ten, Measured 8,960 · Predicted 8,960', /Measured 8,960 g · Predicted 8,960 g · level/.test((await text(page, 'balance-tag')) ?? ''), await text(page, 'balance-tag'))
  // Send a guess anyway: allowed, flagged.
  await tap(page, 'balance-take')
  await tap(page, 'balance-fire')
  check('sent unlevel at nine: charged, flagged as a guess', (await bench(page)).sentUnlevel === true && /You sent me a guess/.test((await text(page, 'balance-strip')) ?? ''))
  check('no console errors across the Analyst walk', errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

/* ------------------------------------------------------------------------ */
/* 3. Phones — the strip at the top, the pill away from the bench            */
/* ------------------------------------------------------------------------ */
for (const [name, width, height] of [['844', 844, 390], ['740', 740, 360]]) {
  const { page, ctx, errors } = await open({ width, height }, { touch: true })
  await afterThePour(page, 'analyst')
  await walkTo(page, ...AT_JUG)
  await tap(page, 'interact')
  await waitFor(page, () => window.__world.get().room === 'bench')
  const strip = await box(page, 'bench-strip')
  check(`${name}: the strip sits at the top; no stick, no verb`, !!strip && strip.y < 40 && !(await has(page, 'stick')) && !(await has(page, 'interact')), JSON.stringify(strip && { y: Math.round(strip.y), h: Math.round(strip.height) }))
  check(`${name}: the plate and wordmark step back`, await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid=quest-plate]')).opacity === '0'))
  await tap(page, 'bench-sink'); await tap(page, 'bench-mark'); await tap(page, 'bench-lift')
  for (const id of ['pin', 'offcut', 'knob']) await tap(page, `drop-${id}`)
  await page.waitForTimeout(500)
  const tagBox = await box(page, 'jug-tag')
  check(`${name}: the jug's reading is visible and clear of the strip`, !!tagBox && !!strip && !overlaps(tagBox, await box(page, 'bench-strip')), JSON.stringify(tagBox && { y: Math.round(tagBox.y) }))
  check(`${name}: no strip control under 36 px`, (await smallTargets(page, '[data-testid=bench-strip]')).length === 0, (await smallTargets(page, '[data-testid=bench-strip]')).join(', '))
  await page.screenshot({ path: path.join(SHOTS, `bench-match-phone-${name}.png`) })
  await tap(page, 'bench-back')
  await waitFor(page, () => window.__world.get().room === 'none')
  await page.waitForTimeout(400)
  const pill = (await text(page, 'bench-pill')) ?? ''
  check(`${name}: away from the bench the reading folds to a pill with its unit`, /Jug/.test(pill) && /2,000 \/ 2,500 cm³/.test(pill), pill)
  const pillBox = await box(page, 'bench-pill')
  const stick = await box(page, 'stick')
  check(`${name}: the pill clears the stick and the verb`, !!pillBox && !overlaps(pillBox, stick) && !overlaps(pillBox, await box(page, 'interact')))
  await page.screenshot({ path: path.join(SHOTS, `bench-pill-phone-${name}.png`) })
  await tap(page, 'bench-pill')
  await waitFor(page, () => window.__world.get().room === 'bench')
  check(`${name}: the pill opens the bench again where it was`, (await bench(page)).inJug.length === 3)
  for (const id of ['drip', 'bell', 'grey']) await tap(page, `drop-${id}`)
  await tap(page, 'bench-done')
  await waitFor(page, () => window.__world.get().room === 'balance')
  for (let i = 0; i < 10; i++) await tap(page, 'balance-add')
  await page.waitForTimeout(500)
  await tap(page, 'balance-inspect')
  await tap(page, 'weigh-grey')
  const sheet = await box(page, 'inspect-sheet')
  const bstrip = await box(page, 'balance-strip')
  check(`${name}: the inspect sheet fits below the strip, inside the screen`, !!sheet && !!bstrip && sheet.y >= bstrip.y + bstrip.height - 8 && sheet.y + sheet.height <= height + 1, JSON.stringify({ sheet: sheet && [Math.round(sheet.y), Math.round(sheet.height)], strip: bstrip && [Math.round(bstrip.y), Math.round(bstrip.height)] }))
  await page.screenshot({ path: path.join(SHOTS, `bench-inspect-phone-${name}.png`) })
  check(`${name}: no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

await browser.close()
process.exit(tally())
