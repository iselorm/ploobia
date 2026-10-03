/**
 * S2 round A2 — the held pour and the gate mould, walked in the browser
 * (storyboard v3.1 §03 M4, §09; mock v2 frames 6 and 7). Build the world
 * edition (`VITE_WORLD=1 npx vite build --outDir dist-world`), serve
 * dist-world on :8766, then `node verify-cast.mjs`. Env: CAST_Q (quality,
 * default low), CAST_SHOTS.
 *
 * Pins: on Sela's errand copper heat does not pour — Sefu asks how much
 * copper and the bench opens; the mould is a station at the furnace foot
 * with its own cut; Sefu will not pour cold; a full charge fills the mould,
 * the runner comes back, `poured` follows the reveal and the pour card waits
 * until the child steps back; a short charge gives a short strap, the gap
 * marked on the object, and a way back to the jug or the balance; the cold
 * cast rides the dry pan; the second pour fills it; Sefu's question is
 * answered by pointing, or in the child's own words through the judge; one
 * kit, through a second pour and a reload; an old save gets the kit once and
 * no second pour card; phones keep the strip at the top and fold to a pill.
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { reporter, resilientClick } from './verify-lib.mjs'

const BASE = process.env.WORLD_BASE ?? 'http://localhost:8766/index.html'
const SHOTS = path.resolve(process.env.CAST_SHOTS ?? 'shots')
fs.mkdirSync(SHOTS, { recursive: true })
const { check, tally } = reporter()
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })

async function open(viewport, { touch = false, q = process.env.CAST_Q ?? 'low', judge = null } = {}) {
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

/** The courtyard on Sela's errand (the child came across from S0), the furnace burning charcoal on full air at `temp`. */
async function onTheErrand(page, { band = 'explorer', temp = 1000 } = {}) {
  await page.evaluate(
    ([b, t]) => {
      window.__world.setBand(b)
      window.__world.set((s) => ({
        zone: 'foundry', prediction: 1000, step: 'feed', fed: ['scrap.a', 'scrap.b'], lit: ['wetwood', 'drywood', 'charcoal'], hearths: { wetwood: 550, drywood: 900, charcoal: 1200 },
        bellowsSeen: true, pipeFixed: true, air: 1, furnace: { lit: true, fuel: 'charcoal', temp: t }, plot: { ...s.plot, sent: true },
      }))
    },
    [band, temp],
  )
  await page.waitForTimeout(600)
  await page.evaluate(() => document.querySelector('[data-testid=codex-close]')?.click())
}
/** A save that poured before S2: the relight done, its whys answered, the channel full of copper. */
async function afterAnOldPour(page, band = 'explorer') {
  await page.evaluate((b) => {
    window.__world.setBand(b)
    window.__world.set((s) => ({
      zone: 'foundry', prediction: 1000, step: 'done', fed: ['scrap.a', 'scrap.b'], lit: ['wetwood', 'drywood', 'charcoal'], hearths: { wetwood: 550, drywood: 900, charcoal: 1200 },
      bellowsSeen: true, pipeFixed: true, air: 1, poured: true, pourSeen: true, whys: [0, 1, 1], furnace: { lit: true, fuel: 'charcoal', temp: 1200 }, plot: { ...s.plot, sent: true },
    }))
  }, band)
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
const SIX = ['scrap.nugget', 'scrap.pin', 'scrap.offcut', 'scrap.knob', 'scrap.drip', 'scrap.bell']
const FIVE = SIX.slice(1)
/** The bench already walked to a charge (verify-bench walks it by hand): `pieces` in the water, `dry` ingots sent. */
async function charge(page, pieces, dry) {
  await page.evaluate(
    ([inJug, n]) => {
      const small = (id) => id === 'scrap.nugget' || id === 'scrap.pin' || id === 'scrap.grey'
      const cm3 = inJug.reduce((a, id) => a + (small(id) ? 100 : 200), 0)
      const wet = inJug.reduce((a, id) => a + (id === 'scrap.grey' ? 787 : Math.round((small(id) ? 100 : 200) * 8.96)), 0)
      window.__world.set({
        supply: {
          bench: { phase: 'charged', inJug, patternIn: false, marked: true, matched: cm3, dry: n, runner: true, inspected: [], sentUnlevel: Math.abs(n * 896 - wet) > 50, charge: n * 896 + 896, recasts: 0, castDry: 0 },
          cast: { pours: [], why: -1, whyText: null },
          pouredAt: null,
        },
      })
    },
    [pieces, dry],
  )
  await page.waitForTimeout(300)
}
const waitFor = (page, fn, ms = 20000, arg) => page.waitForFunction(fn, arg, { timeout: ms })
const w = (page) => page.evaluate(() => window.__world.get())
const cast = (page) => page.evaluate(() => window.__world.get().supply?.cast ?? null)
const bench = (page) => page.evaluate(() => window.__world.get().supply?.bench ?? null)
const look = (page) => page.evaluate(() => window.__world.cast.look())
const node = (page, name) => page.evaluate((n) => window.__world.scene?.getObjectByName?.(n)?.userData ?? null, name)
const tap = (page, id) => resilientClick(page.getByTestId(id), { label: id })
const text = (page, id) => page.getByTestId(id).first().textContent().catch(() => null)
const has = (page, id) => page.getByTestId(id).count().then((n) => n > 0)
const walkTo = async (page, x, z, yaw) => {
  await page.evaluate(([x, z, yaw]) => { window.__world.live.camYaw = yaw; window.__world.setPos(x, 0.6, z) }, [x, z, yaw])
  await page.waitForTimeout(700)
}
const AT_MOULD = [0.3, -0.35, Math.PI]
const AT_FURNACE = [1.6, -4.4, Math.PI]
const AT_JUG = [-9.6, 3.6, -Math.PI / 2 + 0.3]
const box = (page, id) => page.getByTestId(id).first().boundingBox().catch(() => null)
const overlaps = (a, b) => !!a && !!b && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
const smallTargets = (page, root) =>
  page.evaluate((sel) => {
    const r = document.querySelector(sel)
    if (!r) return ['(no root)']
    return [...r.querySelectorAll('button')].filter((b) => { const bb = b.getBoundingClientRect(); return bb.width > 0 && (bb.width < 36 || bb.height < 36) }).map((b) => `${b.textContent?.trim()} ${Math.round(b.getBoundingClientRect().width)}×${Math.round(b.getBoundingClientRect().height)}`)
  }, root)
/** Into the mould's room by the verb. */
async function toMould(page, { touch = false } = {}) {
  await walkTo(page, ...AT_MOULD)
  if (touch) await tap(page, 'interact')
  else await page.keyboard.press('e')
  await waitFor(page, () => window.__world.get().room === 'mould')
  await page.waitForTimeout(400)
}
/** Tell Sefu to pour and wait for the mould to open on what it gave. */
async function pour(page) {
  await tap(page, 'mould-pour')
  await waitFor(page, () => ['run', 'cool', 'open'].includes(window.__world.cast.look()), 20000)
  const seen = await page.evaluate(
    () =>
      new Promise((resolve) => {
        // Sample the scene while the pour plays: the channel must glow and the lid must be shut.
        const s = { glow: 0, shut: false, looks: new Set() }
        const t = setInterval(() => {
          const l = window.__world.cast.look()
          s.looks.add(l)
          s.glow = Math.max(s.glow, window.__world.scene.getObjectByName('cast-channel')?.userData.glow ?? 0)
          if (l === 'run' || l === 'cool') s.shut = s.shut || window.__world.scene.getObjectByName('cast-mould')?.userData.lid === 'shut'
          if (l === 'short' || l === 'full') {
            clearInterval(t)
            resolve({ glow: s.glow, shut: s.shut, looks: [...s.looks] })
          }
        }, 60)
      }),
  )
  await page.waitForTimeout(700)
  return seen
}

/* ------------------------------------------------------------------------ */
/* 1. Desktop — the held pour and a full cast, Explorer                      */
/* ------------------------------------------------------------------------ */
{
  const { page, ctx, errors } = await open({ width: 1280, height: 800 })
  await onTheErrand(page)
  await waitFor(page, () => window.__world.get().furnace.temp >= 1046, 40000)
  await page.waitForTimeout(700)
  let s = await w(page)
  check('on Sela\'s errand, copper heat does not pour: no pour card, `poured` unset', !s.poured && !(await has(page, 'pour-card')), `${Math.round(s.furnace.temp)} °C`)
  check('…it opens the bench instead', s.supply?.bench?.phase === 'idle' && s.supply.cast.pours.length === 0)
  check('…Sefu asks, in a strip of his own: "We have the heat. Now: how much copper?"', /We have the heat\. Now: how much copper\?/.test((await text(page, 'heat-strip')) ?? ''), await text(page, 'heat-strip'))
  let plate = (await text(page, 'quest-plate')) ?? ''
  check('…the plate: The cart that must leave · Reach 1085 °C done · Measure the pattern next', /The cart that must leave/.test(plate) && /Reach 1085 °C(?! and pour)/.test(plate) && /Measure the pattern/.test(plate), plate.slice(0, 120))
  await page.screenshot({ path: path.join(SHOTS, 'cast-heat-desktop.png') })
  await tap(page, 'heat-to-bench')
  check('…"To the cold bench" puts the strip away and Ploob points west', !(await has(page, 'heat-strip')) && /cold bench/i.test((await text(page, 'coach')) ?? ''), await text(page, 'coach'))

  // The mould stands at the furnace foot from the start: open, empty, the shape to fill.
  let m = await node(page, 'cast-mould')
  check('the mould lies at the furnace foot: cold, its lid open on the empty cavity', m?.look === 'cold' && m?.lid === 'open' && m?.fraction === 0, JSON.stringify(m))
  await walkTo(page, ...AT_MOULD)
  check('by the mould the verb reads The gate mould', (await w(page)).near === 'cast.mould' && /The gate mould/.test((await text(page, 'interact')) ?? ''), `${(await w(page)).near}`)
  await page.keyboard.press('e')
  await waitFor(page, () => window.__world.get().room === 'mould')
  await page.waitForTimeout(400)
  check('E cuts into the mould\'s room: the strip, no stick, no verb, no coach', (await has(page, 'mould-strip')) && !(await has(page, 'stick')) && !(await has(page, 'interact')) && !(await has(page, 'coach')))
  check('…nothing to pour yet: no Pour, the tag reads empty', !(await has(page, 'mould-pour')) && /empty/i.test((await text(page, 'mould-tag')) ?? ''), await text(page, 'mould-tag'))
  await page.screenshot({ path: path.join(SHOTS, 'cast-cold-desktop.png') })
  await tap(page, 'mould-back')
  await waitFor(page, () => window.__world.get().room === 'none')

  // The bench, by hand, to a level charge of ten.
  await walkTo(page, ...AT_JUG)
  await page.keyboard.press('e')
  await waitFor(page, () => window.__world.get().room === 'bench')
  await tap(page, 'bench-sink'); await tap(page, 'bench-mark'); await tap(page, 'bench-lift')
  for (const id of ['nugget', 'pin', 'offcut', 'knob', 'drip', 'bell']) await tap(page, `drop-${id}`)
  await tap(page, 'bench-done')
  await waitFor(page, () => window.__world.get().room === 'balance')
  for (let i = 0; i < 11; i++) await tap(page, 'balance-add')
  await page.waitForTimeout(600)
  check('eleven ingots against a ten-ingot set: the dry side is heavy, no way to send it, and Sefu says why', (await node(page, 'bench-balance'))?.tilt > 0 && !(await has(page, 'balance-fire')) && /I'll not melt more than you measured/.test((await text(page, 'balance-strip')) ?? ''), await text(page, 'balance-strip'))
  await page.screenshot({ path: path.join(SHOTS, 'cast-heavy-desktop.png') })
  await tap(page, 'balance-take')
  await page.waitForTimeout(500)
  check('…take one off: level at ten, To the fire is back', (await node(page, 'bench-balance'))?.level === true && /To the fire/.test((await text(page, 'balance-fire')) ?? ''))
  await tap(page, 'balance-fire')
  await page.waitForTimeout(400)
  check('charged at ten: the plate moves to Cast the fittings and Sefu goes to the mould', (await bench(page)).charge === 9856 && (await look(page)) === 'waiting' && (await node(page, 'sefu'))?.at === 'mould', JSON.stringify(await node(page, 'sefu')))
  check('…the balance strip says where the dry pan went', /furnace foot|mould/i.test((await text(page, 'balance-strip')) ?? ''), await text(page, 'balance-strip'))
  await tap(page, 'bench-back')
  await waitFor(page, () => window.__world.get().room === 'none')
  check('…Ploob: Sefu has the dry pan, the mould is at the furnace foot', /furnace foot/.test((await text(page, 'coach')) ?? ''), await text(page, 'coach'))

  await toMould(page)
  m = await node(page, 'cast-mould')
  check('at the mould: clamped shut, the charge on the fire, Pour offered', m?.look === 'waiting' && m?.lid === 'shut' && (await has(page, 'mould-pour')), JSON.stringify(m))
  await page.screenshot({ path: path.join(SHOTS, 'cast-waiting-desktop.png') })

  // The fire drops: Sefu will not pour.
  await page.evaluate(() => window.__world.set((x) => ({ air: 0, furnace: { ...x.furnace, temp: 600 } })))
  await page.waitForTimeout(500)
  check('the fire has dropped: no Pour, Sefu says why', !(await has(page, 'mould-pour')) && /can't pour a thing cold/.test((await text(page, 'mould-line')) ?? ''), await text(page, 'mould-line'))
  check('…and the furnace plate stops calling it ready', /Fire low · \d+ °C/.test((await text(page, 'furnace-ready')) ?? ''), await text(page, 'furnace-ready'))
  await page.evaluate(() => window.__world.set((x) => ({ air: 1, furnace: { ...x.furnace, temp: 1200 } })))
  await page.waitForTimeout(500)
  check('…back at heat: ready again', /Furnace ready · 1200 °C/.test((await text(page, 'furnace-ready')) ?? ''), await text(page, 'furnace-ready'))

  const seen = await pour(page)
  check('the pour plays: the channel glows, the mould stays shut while it is bright', seen.glow > 0.5 && seen.shut && seen.looks.includes('cool'), JSON.stringify(seen))
  m = await node(page, 'cast-mould')
  s = await w(page)
  check('the mould opens on the fittings: full, 1,000 of 1,000 cm³ on the object', m?.look === 'full' && m?.lid === 'open' && m?.fraction === 1 && /1,000 of 1,000 cm³/.test((await text(page, 'mould-tag')) ?? ''), `${JSON.stringify(m)} ${await text(page, 'mould-tag')}`)
  check('…the runner is in the recovery tray, and the tray says it comes back', (await node(page, 'cast-tray'))?.spareG === 896 && /comes back/.test((await text(page, 'tray-tag')) ?? ''), await text(page, 'tray-tag'))
  check('…`poured` is set now, and the pour card waits while the child is at the mould', s.poured && s.step === 'done' && !(await has(page, 'pour-card')))
  check('Sefu asks which measurement; three things to point at; no sentence options', /Which measurement told you how much\?/.test((await text(page, 'mould-line')) ?? '') && (await has(page, 'point-water')) && (await has(page, 'point-gauge')) && (await has(page, 'point-sefu')))
  await page.screenshot({ path: path.join(SHOTS, 'cast-full-desktop.png') })
  await tap(page, 'point-gauge')
  await page.waitForTimeout(300)
  check('pointing at the gauge: recorded, and Ploob reasons back (no buzzer)', (await cast(page)).why === 1 && /says when copper will run/.test((await text(page, 'mould-why-line')) ?? ''), await text(page, 'mould-why-line'))
  check('…then Sefu: "Sela\'s, this one. The bells can wait for a better metal."', /Sela's, this one\. The bells can wait for a better metal\./.test((await text(page, 'mould-line')) ?? ''), await text(page, 'mould-line'))
  check('one kit: no Pour at a full mould', !(await has(page, 'mould-pour')))
  await page.screenshot({ path: path.join(SHOTS, 'cast-answered-desktop.png') })
  await tap(page, 'mould-back')
  await waitFor(page, () => window.__world.get().room === 'none')
  await page.waitForTimeout(500)
  check('stepping back: the pour card comes now, as built', await has(page, 'pour-card'))
  check('…the dry pan is not still on the balance: it went to the fire', (await node(page, 'bench-balance'))?.dry === 0 && (await node(page, 'bench-balance'))?.gone === true, JSON.stringify(await node(page, 'bench-balance')))
  plate = (await text(page, 'quest-plate')) ?? ''
  check('…and the plate has moved on to Test the straps', (await page.evaluate(() => window.__world.get().supply.cast.why)) >= 0 && /Test the straps/.test(plate))

  // A reload: the kit is still one kit.
  await page.waitForTimeout(1200)
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  await page.waitForTimeout(300)
  await page.reload({ waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__world, null, { timeout: 60000 })
  await resilientClick(page.getByTestId('play'), { label: 'Continue' })
  await waitFor(page, () => window.__world.get().phase === 'play')
  await page.waitForTimeout(800)
  check('after a reload: one pour on the record, the mould still full, the answer kept', (await cast(page))?.pours.length === 1 && (await look(page)) === 'full' && (await cast(page)).why === 1)
  check('no console errors across the desktop walk', errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

/* ------------------------------------------------------------------------ */
/* 2. Desktop — short copper, the way back, the second pour (Scientist)      */
/* ------------------------------------------------------------------------ */
{
  const { page, ctx, errors, asked } = await open({ width: 1280, height: 800 }, { judge: (_b, n) => (n === 1 ? { verdict: 'partial', confidence: 0.8, misconception: null, usesEvidence: 0.4 } : { verdict: 'right', confidence: 0.93, misconception: null, usesEvidence: 0.8 }) })
  await onTheErrand(page, { band: 'scientist', temp: 1200 })
  await charge(page, FIVE, 9)
  await toMould(page)
  await pour(page)
  let m = await node(page, 'cast-mould')
  check('five pieces, nine ingots: the cast stops short at nine tenths', m?.look === 'short' && m?.fraction === 0.9 && m?.lid === 'open', JSON.stringify(m))
  check('…the object says so: 900 of 1,000 cm³; the end never filled — and no grams: what is missing is theirs to find', /900 of 1,000 cm³/.test((await text(page, 'mould-tag')) ?? '') && !/ g/.test((await text(page, 'mould-tag')) ?? '') && /the end never filled/.test((await text(page, 'missing-tag')) ?? ''), `${await text(page, 'mould-tag')} | ${await text(page, 'missing-tag')}`)
  check('…Sefu: "Short copper, short strap. Find what\'s missing." and a way back to the jug', /Short copper, short strap\. Find what's missing\./.test((await text(page, 'mould-line')) ?? '') && /Back to the jug/.test((await text(page, 'mould-recast')) ?? ''))
  check('…a short pour is not the pour: `poured` unset, no question, no pour card', !(await w(page)).poured && !(await has(page, 'point-water')) && !(await has(page, 'pour-card')))
  const tagBox = await box(page, 'mould-tag')
  const stripBox = await box(page, 'mould-strip')
  check('the reading sits on the object, clear of the strip', !!tagBox && !!stripBox && !overlaps(tagBox, stripBox), JSON.stringify({ tag: tagBox && Math.round(tagBox.y), strip: stripBox && Math.round(stripBox.y) }))
  await page.screenshot({ path: path.join(SHOTS, 'cast-short-desktop.png') })

  await tap(page, 'mould-recast')
  await waitFor(page, () => window.__world.get().room === 'bench')
  await page.waitForTimeout(500)
  check('back at the jug: 2,400, 100 to the mark; the cold cast is on the dry pan', /2,400 · 100 to the mark/.test((await text(page, 'jug-tag')) ?? '') && (await bench(page)).castDry === 9 && (await look(page)) === 'cold')
  check('…and it can be seen there while the child is at the jug', (await page.evaluate(() => !!window.__world.scene.getObjectByName('pan-cast'))) && (await node(page, 'bench-balance'))?.castDry === 9)
  await tap(page, 'drop-nugget')
  await tap(page, 'bench-done')
  await waitFor(page, () => window.__world.get().room === 'balance')
  await page.waitForTimeout(600)
  check('at the balance the short cast lies on the dry pan and will not come off', (await node(page, 'bench-balance'))?.castDry === 9 && (await page.getByTestId('balance-take').isDisabled()))
  await page.screenshot({ path: path.join(SHOTS, 'cast-recast-balance-desktop.png') })
  await tap(page, 'balance-add')
  await page.waitForTimeout(600)
  check('…one more ingot levels the beam', (await node(page, 'bench-balance'))?.level === true)
  await tap(page, 'balance-fire')
  await page.waitForTimeout(300)
  check('…the whole charge again: 9,856 g', (await bench(page)).charge === 9856 && (await look(page)) === 'waiting')
  await tap(page, 'bench-back')
  await waitFor(page, () => window.__world.get().room === 'none')
  await toMould(page)
  await pour(page)
  check('the second pour fills the mould: two pours on the record', (await cast(page)).pours.length === 2 && (await look(page)) === 'full' && (await w(page)).poured)
  check('…the Scientist\'s tag carries the mass record: in = cast + tray', /9,856 g/.test((await text(page, 'mould-tag')) ?? '') && /8,960 g/.test((await text(page, 'mould-tag')) ?? '') && /896 g/.test((await text(page, 'tray-tag')) ?? ''), `${await text(page, 'mould-tag')} | ${await text(page, 'tray-tag')}`)

  // The why, in their own words, through the judge: partial → one nudge → right.
  check('a Scientist is asked to say it: a text box, with the pointing still there to fall back on', (await has(page, 'cast-why-text')) && (await has(page, 'cast-why-point')))
  await page.getByTestId('cast-why-text').fill('the balance told me, it was level')
  await tap(page, 'cast-why-say')
  await waitFor(page, () => !!document.querySelector('[data-testid=cast-why-nudge]'), 15000)
  check('"the balance": on the right track, one nudge, nothing recorded yet', /What told you how big the set had to be\?/.test((await text(page, 'cast-why-nudge')) ?? '') && (await cast(page)).why === -1)
  await page.getByTestId('cast-why-text').fill('the water rose to the mark with the pattern in, so the scrap had to raise it the same')
  await tap(page, 'cast-why-say')
  await waitFor(page, () => window.__world.get().supply.cast.why === 0, 15000)
  const c = await cast(page)
  check('the second sentence is judged right: their words are kept', c.why === 0 && /the water rose to the mark/.test(c.whyText ?? ''))
  check('…the judge was sent the question, the target and what they measured (never a learner id)', asked.length === 2 && asked[0].quest === 'foundry.cart.measure' && /Which measurement/.test(asked[0].ask) && asked[0].facts?.water_with_the_pattern_under_cm3 === 2500 && asked[0].misconceptions.length === 2)
  check('…Ploob\'s reasoned line, then Sefu\'s', /same space/i.test((await text(page, 'mould-why-line')) ?? '') && /Sela's, this one/.test((await text(page, 'mould-line')) ?? ''))
  check('no console errors across the short-pour walk', errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

/* ------------------------------------------------------------------------ */
/* 3. Desktop — the guess at the balance; the judge away; an old save         */
/* ------------------------------------------------------------------------ */
{
  const { page, ctx, errors } = await open({ width: 1280, height: 800 })
  await onTheErrand(page, { band: 'analyst', temp: 1200 })
  await charge(page, SIX, 8)
  await toMould(page)
  await pour(page)
  const m = await node(page, 'cast-mould')
  check('six pieces but eight ingots sent anyway: 800 of 1,000, the last pin seat never filled', m?.look === 'short' && m?.fraction === 0.8 && /800 of 1,000 cm³/.test((await text(page, 'mould-tag')) ?? '') && /the last pin seat never filled/.test((await text(page, 'missing-tag')) ?? ''), `${await text(page, 'mould-tag')} | ${await text(page, 'missing-tag')}`)
  check('…the first pin was cast, the second was not', await page.evaluate(() => !!window.__world.scene.getObjectByName('cast-pin-0') && !window.__world.scene.getObjectByName('cast-pin-1')))
  check('…Sefu names the guess, and the way back is to the BALANCE', /You sent me a guess/.test((await text(page, 'mould-line')) ?? '') && /Back to the balance/.test((await text(page, 'mould-recast')) ?? ''))
  await page.screenshot({ path: path.join(SHOTS, 'cast-pinseat-desktop.png') })
  await tap(page, 'mould-recast')
  await waitFor(page, () => window.__world.get().room === 'balance')
  check('…and that is where the camera goes', (await bench(page)).phase === 'balancing' && (await bench(page)).castDry === 8)
  await tap(page, 'balance-add'); await tap(page, 'balance-add')
  await tap(page, 'balance-fire')
  await tap(page, 'bench-back')
  await waitFor(page, () => window.__world.get().room === 'none')
  await toMould(page)
  await pour(page)
  check('ten on the pan: full, both pins cast', (await look(page)) === 'full' && (await page.evaluate(() => !!window.__world.scene.getObjectByName('cast-pin-0') && !!window.__world.scene.getObjectByName('cast-pin-1'))))
  // No judge (503): the Analyst's text box gives way to pointing, silently.
  await page.getByTestId('cast-why-text').fill('the water')
  await tap(page, 'cast-why-say')
  await waitFor(page, () => !document.querySelector('[data-testid=cast-why-text]') && !!document.querySelector('[data-testid=point-water]'), 15000)
  check('no judge: the three things to point at, no error shown', (await has(page, 'point-water')) && (await cast(page)).why === -1)
  await tap(page, 'point-water')
  check('pointing at the water: right', (await cast(page)).why === 0)
  check('no console errors across the guess walk', errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}
for (const [name, width, height, touch] of [['desktop', 1280, 800, false], ['740', 740, 360, true]]) {
  // The heat arrives while the child is at the bellows, in the furnace's own room.
  const { page, ctx, errors } = await open({ width, height }, { touch })
  await onTheErrand(page, { temp: 300 })
  // Hold the fire low (little air) until the child is in the room; then the room's own control gives it air.
  await page.evaluate(() => window.__world.set({ air: 0.2 }))
  await walkTo(page, 0.2, -4.4, Math.PI)
  await waitFor(page, () => window.__world.get().near === 'feed.furnace', 15000).catch(() => {})
  check(`${name}: with Sefu at his post, the furnace's verb is the one at the mouth`, (await w(page)).near === 'feed.furnace' && !(await w(page)).supply, `${(await w(page)).near}`)
  if (touch) await tap(page, 'interact')
  else await page.keyboard.press('e')
  await waitFor(page, () => window.__world.get().room === 'furnace')
  check(`${name}: below copper heat there is no ask yet`, !(await has(page, 'heat-strip')) && (await has(page, 'room')))
  await tap(page, 'air-hard')
  await waitFor(page, () => !!document.querySelector('[data-testid=heat-strip]'), 90000)
  const heat = await box(page, 'heat-strip')
  const room = await box(page, 'room')
  check(`${name}: in the furnace room the heat strip sits above the room's own plate, both on screen`, !!heat && !!room && !overlaps(heat, room) && heat.y >= 0 && room.y + room.height <= height + 1 && !(await has(page, 'pour-card')), JSON.stringify({ heat: heat && [Math.round(heat.y), Math.round(heat.height)], room: room && [Math.round(room.y), Math.round(room.height)] }))
  await page.screenshot({ path: path.join(SHOTS, `cast-heat-room-${name}.png`) })
  await tap(page, 'heat-to-bench')
  await waitFor(page, () => window.__world.get().room === 'none')
  check(`${name}: "To the cold bench" steps out of the furnace room`, !(await has(page, 'heat-strip')) && !(await w(page)).poured)
  // With a charge on the fire Sefu is at the mould — and the mouth still gives the furnace, not Sefu.
  await charge(page, SIX, 10)
  await walkTo(page, 0.2, -4.4, Math.PI)
  check(`${name}: with Sefu at the mould, the mouth still gives the furnace's verb`, (await node(page, 'sefu'))?.at === 'mould' && (await w(page)).near === 'feed.furnace', `${(await w(page)).near}`)
  check(`${name}: no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}
{
  const { page, ctx, errors } = await open({ width: 1280, height: 800 })
  await afterAnOldPour(page)
  check('an old save that already poured: no held pour to replay, the bench open, the mould cold', (await w(page)).poured && (await look(page)) === 'cold' && (await node(page, 'cast-mould'))?.look === 'cold')
  // Two ingots, sent anyway: the copper never reaches the first pin's sprue, so no pin is drawn.
  await charge(page, SIX, 2)
  await toMould(page)
  await pour(page)
  check('two ingots: a fifth of a strap and no pin at all, and the object says so', (await node(page, 'cast-mould'))?.fraction === 0.2 && !(await page.evaluate(() => !!window.__world.scene.getObjectByName('cast-pin-0') || !!window.__world.scene.getObjectByName('cast-pin-1'))) && /no pin seat filled/.test((await text(page, 'missing-tag')) ?? ''), await text(page, 'missing-tag'))
  await page.screenshot({ path: path.join(SHOTS, 'cast-two-ingots-desktop.png') })
  await tap(page, 'mould-back')
  await waitFor(page, () => window.__world.get().room === 'none')
  // The one guess that can still fill the mould: a wet set over the mark (all six and the grey lump), ten ingots light.
  await charge(page, [...SIX, 'scrap.grey'], 10)
  await toMould(page)
  await pour(page)
  check('Sefu melts what they left: the kit is cast, once', (await look(page)) === 'full' && (await cast(page)).pours.length === 1)
  check('…only the runner comes back: nothing over ten ingots ever reaches the fire', (await node(page, 'cast-tray'))?.spareG === 896, JSON.stringify(await node(page, 'cast-tray')))
  await tap(page, 'point-water')
  await page.waitForTimeout(300)
  check('…a kit cast by a guess is still named a guess', /You sent me a guess/.test((await text(page, 'mould-line')) ?? '') && !/More than the mould holds/.test((await text(page, 'mould-line')) ?? ''), await text(page, 'mould-line'))
  await tap(page, 'mould-back')
  await waitFor(page, () => window.__world.get().room === 'none')
  await page.waitForTimeout(500)
  check('…and no second pour card, no whys again', !(await has(page, 'pour-card')) && !(await page.evaluate(() => !!document.querySelector('[data-testid^=why-]'))))
  check('no console errors across the old-save walk', errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

/* ------------------------------------------------------------------------ */
/* 4. Phones — the strip at the top, the pill away from the mould            */
/* ------------------------------------------------------------------------ */
for (const [name, width, height] of [['844', 844, 390], ['740', 740, 360]]) {
  const { page, ctx, errors } = await open({ width, height }, { touch: true })
  await onTheErrand(page, { temp: 1200 })
  await charge(page, FIVE, 9)
  await page.waitForTimeout(400)
  let pill = (await text(page, 'mould-pill')) ?? ''
  check(`${name}: in the yard with a charge on the fire, the pill says so`, /Mould/.test(pill) && /the charge is in/.test(pill), pill)
  await toMould(page, { touch: true })
  const strip = await box(page, 'mould-strip')
  check(`${name}: the strip sits at the top; no stick, no verb`, !!strip && strip.y < 40 && !(await has(page, 'stick')) && !(await has(page, 'interact')), JSON.stringify(strip && { y: Math.round(strip.y), h: Math.round(strip.height) }))
  check(`${name}: the plate and wordmark step back`, await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid=quest-plate]')).opacity === '0'))
  check(`${name}: no strip control under 36 px`, (await smallTargets(page, '[data-testid=mould-strip]')).length === 0, (await smallTargets(page, '[data-testid=mould-strip]')).join(', '))
  await page.screenshot({ path: path.join(SHOTS, `cast-waiting-phone-${name}.png`) })
  await pour(page)
  const tagBox = await box(page, 'mould-tag')
  const missBox = await box(page, 'missing-tag')
  const strip2 = await box(page, 'mould-strip')
  check(`${name}: the short cast's reading is on screen and clear of the strip`, !!tagBox && tagBox.y + tagBox.height <= height && tagBox.x >= 0 && tagBox.x + tagBox.width <= width && !overlaps(tagBox, strip2), JSON.stringify(tagBox && { x: Math.round(tagBox.x), y: Math.round(tagBox.y) }))
  check(`${name}: the missing end is named on the object, on screen`, !!missBox && missBox.y + missBox.height <= height && missBox.x + missBox.width <= width && !overlaps(missBox, strip2), JSON.stringify(missBox && { x: Math.round(missBox.x), y: Math.round(missBox.y) }))
  check(`${name}: no strip control under 36 px at the short cast`, (await smallTargets(page, '[data-testid=mould-strip]')).length === 0, (await smallTargets(page, '[data-testid=mould-strip]')).join(', '))
  await page.screenshot({ path: path.join(SHOTS, `cast-short-phone-${name}.png`) })
  await tap(page, 'mould-back')
  await waitFor(page, () => window.__world.get().room === 'none')
  await page.waitForTimeout(400)
  pill = (await text(page, 'mould-pill')) ?? ''
  check(`${name}: away from the mould the short cast folds to a pill with its unit`, /Mould/.test(pill) && /900 of 1,000 cm³/.test(pill), pill)
  const pillBox = await box(page, 'mould-pill')
  check(`${name}: the pill clears the stick and the verb`, !!pillBox && !overlaps(pillBox, await box(page, 'stick')) && !overlaps(pillBox, await box(page, 'interact')))
  await page.screenshot({ path: path.join(SHOTS, `cast-pill-phone-${name}.png`) })
  await tap(page, 'mould-pill')
  await waitFor(page, () => window.__world.get().room === 'mould')
  await tap(page, 'mould-recast')
  await waitFor(page, () => window.__world.get().room === 'bench')
  check(`${name}: the pill opens the mould again, and the way back leads to the jug`, (await bench(page)).phase === 'matching' && (await bench(page)).recasts === 1)
  // The full cast and the question, on the phone.
  await charge(page, SIX, 10)
  await page.evaluate(() => window.__world.set({ room: 'none' }))
  await toMould(page, { touch: true })
  await pour(page)
  const points = await Promise.all(['point-water', 'point-gauge', 'point-sefu'].map((id) => box(page, id)))
  const strip3 = await box(page, 'mould-strip')
  check(`${name}: the three things to point at fit the screen, each at least 44 px, clear of the strip`, points.every((b) => !!b && b.width >= 44 && b.height >= 44 && b.y + b.height <= height && b.x >= 0 && b.x + b.width <= width && !overlaps(b, strip3)), JSON.stringify(points.map((b) => b && [Math.round(b.x), Math.round(b.y), Math.round(b.width)])))
  await page.screenshot({ path: path.join(SHOTS, `cast-full-phone-${name}.png`) })
  await tap(page, 'point-water')
  await page.waitForTimeout(300)
  const lineBox = await box(page, 'mould-why-line')
  check(`${name}: Ploob's line fits the screen`, !!lineBox && lineBox.y + lineBox.height <= height, JSON.stringify(lineBox && { y: Math.round(lineBox.y), h: Math.round(lineBox.height) }))
  await page.screenshot({ path: path.join(SHOTS, `cast-answered-phone-${name}.png`) })
  check(`${name}: no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

await browser.close()
process.exit(tally())
