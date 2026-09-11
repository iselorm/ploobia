/**
 * The Line — door 3 — driven through its real controls.
 *
 * Serve dist/ on :8765 first. The science behind the levels is proved out of
 * band by `verify-sugar-model.mjs` (the wood cut, the bank); this suite is
 * for what only a browser can settle: that door 3 opens on the map and Play
 * names it; that the night shift banks daylight, runs a night on the cut
 * stem with the thermostat as its lever, and ends on a tally; that the knife
 * has two blades and the gauge refuses a reading taken with limp leaves;
 * that the tracer brief spends parcels and reads its speed onto the gauge;
 * that the section is laid flat with its labels upright; and that the target
 * plate sits top-left with the stage tabs still in the strip.
 */
import { chromium } from 'playwright'
import { reporter, resilientClick } from './verify-lib.mjs'

const BASE = 'http://localhost:8765/index.html'
const { check, tally } = reporter()

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })

const consoleErrors = []
function watch(page) {
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('ERR_TUNNEL_CONNECTION_FAILED')) consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => consoleErrors.push(String(e)))
}

const run = (page) => page.evaluate(() => window.__sugarRun?.() ?? null)
const simState = (page) =>
  page.evaluate(() => {
    const s = window.__sugarSim
    if (!s) return null
    return {
      stage: s.stage,
      night: s.night,
      girdled: s.girdled,
      xylemCut: s.xylemCut,
      turgor: s.turgor,
      tempC: s.tempC,
      starch: s.carbon.leafStarch,
      tracerActive: s.tracerActive,
      tracerDistance: s.tracerDistance,
      markA: s.tracerMarkA,
      markB: s.tracerMarkB,
      trueSpeed: s.tracerTrueSeconds > 0.01 ? ((s.tracerMarkB - s.tracerMarkA) / s.tracerTrueSeconds) * 3600 : null,
      day: s.day ? { hour: s.day.hour, done: s.day.done, exported: s.day.exportedMg, night: !!s.day.spec.night } : null,
    }
  })

async function waitFor(fn, timeout = 20000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    try {
      if (await fn()) return true
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 120))
  }
  return false
}

const tap = (page, name, opts = {}) =>
  resilientClick(page.getByRole('button', { name, exact: opts.exact ?? true }).first(), { label: name })

/**
 * A toggle is pressed once, from inside the page. `resilientClick` can fire
 * twice on a saturated renderer (the real click lands late *and* the
 * fallback dispatches), which silently un-toggles the thing it toggled.
 */
const press = (page, label) =>
  page.evaluate((l) => {
    const el = document.querySelector(`[aria-label="${l}"]`)
    if (!el) return false
    el.click()
    return true
  }, label)

/** Hurry a span along: N frames of the real step, then let the page's own tick notice. */
const hurry = (page, frames) => page.evaluate((n) => window.__sugarStep?.(0.25, n), frames)

async function open(width, height, touch, band, progress) {
  const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch, isMobile: touch })
  watch(page)
  await page.goto(`${BASE}#/photosynthesis?q=low`, { waitUntil: 'load' })
  await page.evaluate(
    ([b, p]) => {
      localStorage.setItem('ploobia.band.v1', JSON.stringify(b))
      localStorage.setItem('ploobia.campaign.photosynthesis.v1', JSON.stringify(p))
    },
    [band, progress],
  )
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1800)
  return page
}

/** Doors 1 and 2 walked through, so door 3 is the open one. */
const TWO_DOORS = { handedIn: { 'first-light': 700, 'open-the-hatches': 700 } }

async function startFree(page) {
  await page.getByRole('button', { name: 'Start', exact: true }).first().waitFor({ timeout: 30000 }).catch(() => {})
  await tap(page, 'Start')
  await waitFor(async () => await page.evaluate(() => window.__sugarSim?.started === true))
  await page.waitForTimeout(500)
}

/** Open the brief on a named level and press its green button. */
async function startLevel(page, title, button) {
  await tap(page, 'Challenge')
  await page.waitForTimeout(400)
  await tap(page, 'Other challenges')
  await page.waitForTimeout(300)
  await resilientClick(page.getByText(title, { exact: true }).first(), { label: title })
  await page.waitForTimeout(300)
  await tap(page, button)
  await waitFor(async () => ['ready', 'lab', 'gather'].includes((await run(page))?.phase), 8000)
}

/* ================================================================== */
/* The door is on the map and Play names it                            */
/* ================================================================== */
{
  const page = await open(1440, 900, false, 'explorer', TWO_DOORS)
  const body = await page.evaluate(() => document.body.innerText)
  check('the welcome names door 3 on the Play button', /Play — stage 3|The Line/i.test(body), body.slice(0, 200))
  check('nothing on the welcome says coming soon', !/coming soon/i.test(body))
  await page.close()
}

/* ================================================================== */
/* Level 1 — the night shift, as an Explorer                           */
/* ================================================================== */
{
  const page = await open(1440, 900, false, 'explorer', TWO_DOORS)
  const play = page.getByRole('button', { name: /^Play/ }).first()
  await play.waitFor({ timeout: 30000 })
  await resilientClick(play, { label: 'Play' })
  const ready = await waitFor(async () => ['ready', 'gather'].includes((await run(page))?.phase), 12000)
  check('Play opens straight onto the bank-the-daylight round for an Explorer', ready, (await run(page))?.phase)
  let r = await run(page)
  check('the night shift is a keep round that opens on a gather', r?.challenge?.loop === 'keep' && r?.challenge?.gatherSeconds > 0)
  check('it banks light only', r && Object.keys(r.challenge.budget).join() === 'light', JSON.stringify(r?.challenge?.budget))
  check('the round is played on the whole plant (the sky is where the light is)', (await simState(page))?.stage === 'plant')
  const hud = await page.evaluate(() => document.body.innerText)
  check('the jar reads as starch banked', /Starch banked/i.test(hud))
  // Bank most of the light by hand — the collector's own maths — then end the round early.
  await page.evaluate(() => {
    // Catches go through the run's own handler; a suite that reached into the
    // bank would be testing its own arithmetic.
    const c = window.__sugarRun().challenge
    window.__catch?.('light', c.budget.light * 0.8)
  })
  const landed = await waitFor(async () => ((await run(page))?.bank?.light ?? 0) > 0, 8000)
  r = await run(page)
  const banked = r?.bank?.light ?? 0
  check('a catch lands in the light jar', landed && banked > 0, String(banked))
  await tap(page, 'To the lab')
  const handed = await waitFor(async () => (await run(page))?.phase === 'handover', 8000)
  check('the round ends on a handover', handed)
  const hand = await page.evaluate(() => document.body.innerText)
  check('the handover says it is dusk and what was banked', /dusk/i.test(hand) && /starch banked/i.test(hand), hand.slice(0, 120))
  check('and offers the night, not the lab', /Into the night/.test(hand))
  await tap(page, 'Into the night')
  const nightOn = await waitFor(async () => (await run(page))?.phase === 'day' && (await simState(page))?.day?.night === true, 12000)
  check('the night runs as the span', nightOn)
  const s0 = await simState(page)
  check('the stage flew to the cut stem', s0?.stage === 'stem', s0?.stage)
  check('the sun is off', s0?.night === true)
  check('the bank is the starch the gather put away', s0 && s0.starch > 10 && s0.starch <= 95, String(s0?.starch))
  check('the night HUD is up', (await page.getByTestId('night-hud').count()) === 1)
  check('the thermostat is the one control', (await page.getByTestId('thermostat-plate').count()) === 1)
  // The lever works: the thermostat drives the sim's temperature.
  const thumb = page.locator('[aria-label="Night air"] [data-slot="slider-thumb"]').first()
  await thumb.focus()
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(300)
  const s1 = await simState(page)
  check('the thermostat moved the night air', s1 && s1.tempC < 20, String(s1?.tempC))
  // Let the night run out. It advances by frame dt, which on a software
  // renderer is a frame a second — so the suite hurries it with the real
  // step, a few hundred frames at a time, until the page's tick sees dawn.
  const done = await waitFor(async () => {
    await hurry(page, 60)
    return (await run(page))?.phase === 'scored'
  }, 120000)
  check('the night ends on a score card', done, (await run(page))?.phase)
  r = await run(page)
  check('the score is on sugar sent down the line', r?.challenge?.goal?.metric === 'sugarNight')
  check('the tally block is the night\'s', (await page.getByTestId('night-tally').count()) === 1)
  const card = await page.evaluate(() => document.body.innerText)
  check('the tally names the bank', /bank at dusk/i.test(card))
  check('hand-in from a 80% bank on a cool night is a hit', r?.score?.hit === true, JSON.stringify(r?.score))
  check('a hand-in opens door 4', /door has opened|Roots/i.test(card))
  await page.close()
}

/* ================================================================== */
/* Level 2 — cut the ring, as a Scientist                              */
/* ================================================================== */
{
  const page = await open(1440, 900, false, 'scientist', TWO_DOORS)
  await startFree(page)
  await startLevel(page, 'Cut the ring', 'Into the lab')
  let r = await run(page)
  check('the brief opens straight into the lab (nothing to gather)', r?.phase === 'lab', r?.phase)
  check('with the leaves-firm condition', r?.challenge?.condition === 'leafFirm')
  const s0 = await simState(page)
  check('level 2 is played on the cut stem', s0?.stage === 'stem', s0?.stage)
  check('the target plate is up and the stage tabs are still in the strip', (await page.getByTestId('target-gauge').count()) === 1 && (await page.getByRole('button', { name: 'The stem, cut', exact: true }).count()) === 1)
  const plate = await page.getByTestId('target-gauge').boundingBox()
  const tabs = await page.getByRole('button', { name: 'The stem, cut', exact: true }).boundingBox()
  check('the plate sits top-left of the scene, clear of the tabs', plate && tabs && plate.x < tabs.x && plate.x + plate.width <= tabs.x + 2 && plate.y < 120, JSON.stringify({ plate, tabs }))
  check('the knife has two blades', (await page.getByRole('button', { name: 'Cut the phloem ring', exact: true }).count()) === 1 && (await page.getByRole('button', { name: 'Cut the wood', exact: true }).count()) === 1)
  // The right pipe.
  await press(page, 'Cut the phloem ring')
  await page.waitForTimeout(400)
  let s = await simState(page)
  check('the bark ring is cut and the wood is whole', s?.girdled === true && s?.xylemCut === false)
  await press(page, 'Run measurement')
  const ran = await waitFor(async () => {
    await hurry(page, 8)
    return ((await run(page))?.trials ?? 0) >= 1
  }, 60000)
  check('a trial ran', ran)
  r = await run(page)
  check('export below the cut reads zero', r?.goalLast !== null && r.goalLast <= 0.5, String(r?.goalLast))
  check('the leaves were firm, so it counts: hit', r?.hit === true, JSON.stringify({ best: r?.best, hit: r?.hit }))
  // The wrong pipe.
  await press(page, 'Heal the phloem ring')
  await page.waitForTimeout(300)
  await press(page, 'Cut the wood')
  await page.waitForTimeout(400)
  s = await simState(page)
  check('the wood is cut and the ring is whole', s?.xylemCut === true && s?.girdled === false)
  // Let the leaf lose its water, then measure.
  const limp = await waitFor(async () => {
    await hurry(page, 12)
    return ((await simState(page))?.turgor ?? 1) < 0.5
  }, 60000)
  check('with the wood cut the leaves go limp', limp, String((await simState(page))?.turgor))
  const labels = await page.evaluate(() => document.body.innerText)
  check('the conditions plate says the wood is severed', /wood is severed/.test(labels))
  const before = (await run(page))?.trials ?? 0
  await press(page, 'Run measurement')
  await waitFor(async () => {
    await hurry(page, 8)
    return ((await run(page))?.trials ?? 0) > before
  }, 60000)
  await page.waitForTimeout(800)
  const refused = await page.getByTestId('gauge-refused').count()
  check('the gauge refuses a reading taken with limp leaves', refused === 1)
  r = await run(page)
  check('and the hit still stands on the earlier, firm reading', r?.hit === true && r?.best <= 0.5)
  await page.close()
}

/* ================================================================== */
/* Level 3 — time the sugar, as an Analyst                             */
/* ================================================================== */
{
  const page = await open(1440, 900, false, 'analyst', TWO_DOORS)
  await startFree(page)
  await startLevel(page, 'Time the sugar', 'Into the lab')
  let r = await run(page)
  check('the tracer brief grants three parcels', r?.challenge?.budget?.parcels === 3 && r?.bank?.parcels === 3, JSON.stringify(r?.bank))
  check('and targets sap speed, near', r?.challenge?.goal?.metric === 'velocity' && r?.challenge?.goal?.direction === 'near')
  check('played on the cut stem', (await simState(page))?.stage === 'stem')
  const names = await page.evaluate(() => {
    const out = []
    window.__sugarScene?.traverse((o) => o.name && out.push(o.name))
    return out
  })
  check('the stem section is the subject', names.includes('subject'))
  const flat = await page.evaluate(() => {
    const s = window.__sugarScene?.getObjectByName('subject')
    return s ? Math.abs(s.rotation.z) : null
  })
  check('the section is laid on its side', flat !== null && Math.abs(flat - Math.PI / 2) < 1e-6, String(flat))
  // Cold sap: the target is 0.75 ± 0.05, which the sweep puts near 14 °C.
  const temp = page.locator('[aria-label="Temperature"] [data-slot="slider-thumb"]').first()
  await temp.focus()
  await page.keyboard.press('Home')
  const step = await page.evaluate(() => {
    const el = document.querySelector('[aria-label="Temperature"] [data-slot="slider-thumb"]')
    return el ? Number(el.getAttribute('aria-valuemin')) : null
  })
  // Home lands on the minimum; step up to 14 °C one key at a time.
  for (let i = 0; i < 40; i++) {
    const now = await page.evaluate(() => Number(document.querySelector('[aria-label="Temperature"] [data-slot="slider-thumb"]')?.getAttribute('aria-valuenow')))
    if (now >= 14) break
    await page.keyboard.press('ArrowRight')
  }
  await page.waitForTimeout(300)
  const s0 = await simState(page)
  check('the temperature dial set the sim near 14 °C', s0 && Math.abs(s0.tempC - 14) <= 1.5, `${s0?.tempC} (min ${step})`)
  // Release, and time it at the marks by watching the parcel itself.
  await press(page, 'Release the tracer')
  await waitFor(async () => (await simState(page))?.tracerActive === true, 8000)
  r = await run(page)
  check('a release spends a parcel', r?.bank?.parcels === 2 && r?.trials === 1, JSON.stringify(r?.bank))
  const passedA = await waitFor(async () => {
    await hurry(page, 2)
    const s = await simState(page)
    return s && s.tracerDistance >= s.markA
  }, 90000)
  await press(page, 'Stopwatch')
  const passedB = await waitFor(async () => {
    await hurry(page, 2)
    const s = await simState(page)
    return s && s.tracerDistance >= s.markB
  }, 120000)
  await press(page, 'Stopwatch')
  check('the parcel passed both marks', passedA && passedB)
  const read = await waitFor(async () => {
    await hurry(page, 4)
    return (await run(page))?.goalLast !== null
  }, 60000)
  check('the timed run reads its speed onto the gauge', read, String((await run(page))?.goalLast))
  r = await run(page)
  const st = await simState(page)
  check('the speed is a sap speed, not a number the gauge invented', r && r.goalLast > 0.1 && r.goalLast < 2, String(r?.goalLast))
  // The harness taps late by whole hurried frames, so its own reading is
  // slow; the parcel's true speed is what the temperature set.
  check('the parcel really travelled at the cold-sap speed the brief wants (14 °C ≈ 0.75)', st && st.trueSpeed !== null && Math.abs(st.trueSpeed - 0.75) <= 0.08, String(st?.trueSpeed))
  check('the reading is the learner\'s own timing, within a tenth of the truth', r && st && Math.abs(r.goalLast - st.trueSpeed) <= 0.1, `${r?.goalLast} vs ${st?.trueSpeed}`)
  await page.close()
}

/* ================================================================== */
/* The three tiers, and portrait                                       */
/* ================================================================== */
for (const [w, h, touch] of [
  [1440, 900, false],
  [1180, 820, false],
  [915, 412, true],
]) {
  const page = await open(w, h, touch, 'scientist', TWO_DOORS)
  await startFree(page)
  await tap(page, 'The stem, cut').catch(() => {})
  await page.waitForTimeout(1500)
  // Hit-test every control: a button that cannot be hit is not on screen.
  const dead = await page.evaluate(() => {
    const out = []
    document.querySelectorAll('.hud button, .hud a').forEach((el) => {
      const b = el.getBoundingClientRect()
      if (b.width === 0 || b.height === 0) return
      if (b.left < 0 || b.top < 0 || b.right > innerWidth || b.bottom > innerHeight) return
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
      if (!hit || !(el === hit || el.contains(hit))) out.push(el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 30))
    })
    return out
  })
  check(`${w}×${h}: every on-screen control can be hit`, dead.length === 0, dead.join(' | '))
  await page.screenshot({ path: `shots/line-${w}x${h}.png` }).catch(() => {})
  await page.close()
}
{
  const page = await open(412, 915, true, 'explorer', TWO_DOORS)
  const body = await page.evaluate(() => document.body.innerText)
  check('portrait shows the turn-your-phone card', /Turn your phone/i.test(body), body.slice(0, 80))
  check('and mounts no canvas behind it', (await page.locator('canvas').count()) === 0)
  await page.screenshot({ path: 'shots/line-portrait.png' }).catch(() => {})
  await page.close()
}

check('no console errors across the suite', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))

await browser.close()
tally()
