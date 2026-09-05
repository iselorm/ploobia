/**
 * The Hatches, driven through its real controls.
 *
 * Serve dist/ on :8765 first (python3 -m http.server 8765 in dist).
 *
 * The physics and the levels are proved out of band by
 * `verify-hatches-model.mjs`. This suite is for the claims only a browser can
 * settle: that the stage exists and its pore follows the model, that a day
 * can be *played* with a finger on one slider, that the slider is a ceiling
 * (the plant's own hold is drawn when it closes further), that the HUD's
 * meters are the model's numbers, that the weather is announced, that the
 * day ends on a tally with the leaf's state and the hand-in, and that an
 * Explorer's finger holds the day while an Analyst's does not.
 */
import { chromium } from 'playwright'
import { reporter, resilientClick } from './verify-lib.mjs'

const BASE = 'http://localhost:8765/index.html'
const { check, tally } = reporter()

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
})

const consoleErrors = []
function watch(page) {
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('ERR_TUNNEL_CONNECTION_FAILED'))
      consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => consoleErrors.push(String(e)))
}

const run = (page) => page.evaluate(() => window.__sugarRun?.() ?? null)
const hatch = (page) => page.evaluate(() => window.__hatch ?? null)
const day = (page) =>
  page.evaluate(() => {
    const d = window.__sugarSim?.day
    return d ? { hour: d.hour, sugar: d.sugarMg, water: d.waterMl, wilted: d.wilted, done: d.done, spec: d.spec } : null
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

async function open(width, height, touch, band) {
  const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch, isMobile: touch })
  watch(page)
  await page.goto(`${BASE}#/photosynthesis?q=low`, { waitUntil: 'load' })
  await page.evaluate((b) => {
    localStorage.setItem('ploobia.band.v1', JSON.stringify(b))
    // Stage 2 sits behind one hand-in at stage 1; this suite is about the
    // stage, not the door, so walk through it first.
    localStorage.setItem('ploobia.campaign.photosynthesis.v1', JSON.stringify({ handedIn: { 'first-light': 700 } }))
  }, band)
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1800)
  return page
}

async function start(page) {
  await page.getByRole('button', { name: 'Start', exact: true }).first().waitFor({ timeout: 30000 }).catch(() => {})
  await tap(page, 'Start')
  await waitFor(async () => await page.evaluate(() => window.__sugarSim?.started === true))
  await page.waitForTimeout(500)
}

/** Open the brief on a named level and start its day. */
async function startLevel(page, title) {
  await tap(page, 'Challenge')
  await page.waitForTimeout(400)
  await tap(page, 'Other challenges')
  await page.waitForTimeout(300)
  await resilientClick(page.getByText(title, { exact: true }).first(), { label: title })
  await page.waitForTimeout(300)
  await tap(page, 'Start the day')
  await waitFor(async () => (await run(page))?.phase === 'ready', 8000)
}

/** Drive the one slider by its thumb and the keyboard, never the track. */
async function setCeiling(page, percent) {
  const thumb = page.locator('[aria-label="Hatches may open to"] [data-slot="slider-thumb"]').first()
  await thumb.focus()
  // Home = 0, then steps of 5.
  await page.keyboard.press('Home')
  for (let i = 0; i < Math.round(percent / 5); i++) await page.keyboard.press('ArrowRight')
}

/* ================================================================== */
/* The stage exists, and the pore is the model's                       */
/* ================================================================== */
{
  const page = await open(1440, 900, false, 'scientist')
  await start(page)
  check('the hatches are a stage tab', (await page.getByRole('button', { name: 'The hatches', exact: true }).count()) === 1)
  await tap(page, 'The hatches')
  await page.waitForTimeout(1500)
  const names = await page.evaluate(() => {
    const out = []
    window.__sugarScene?.traverse((o) => o.name && out.push(o.name))
    return out
  })
  for (const n of ['stoma', 'guard-left', 'guard-right', 'pore', 'hatch-co2', 'hatch-water', 'skin-sun'])
    check(`the scene has ${n}`, names.includes(n))
  const h = await hatch(page)
  check('the pore reports the plant\'s own opening', h && h.pore > 0.5 && Math.abs(h.pore - h.plant) < 1e-9, JSON.stringify(h))
  check('with no ceiling in the plain lab', h && h.ceiling === 1)
  // The pore follows turgor: a wilted leaf shuts it.
  const shut = await page.evaluate(() => {
    const s = window.__sugarSim
    const before = s.turgor
    s.turgor = 0.05
    return new Promise((r) =>
      setTimeout(() => {
        const h = window.__hatch
        const p = window.__sugarScene?.getObjectByName('pore')
        const gap = p ? p.scale.x : null
        s.turgor = before
        r({ ...h, gap })
      }, 400),
    )
  })
  check('a limp leaf shuts the pore whatever the lab says', shut && shut.pore < 0.03, JSON.stringify(shut))
  check('and the gap on screen follows the model', shut && shut.gap !== null && shut.gap < 0.2, String(shut?.gap))
  await page.waitForTimeout(500)
  const tip = await page.evaluate(() => document.body.innerText.includes('Light never touches it'))
  check('the tip says light never touches it', tip)
  await page.close()
}

/* ================================================================== */
/* A day, played with a finger                                        */
/* ================================================================== */
{
  const page = await open(390, 844, true, 'explorer')
  await start(page)
  await startLevel(page, 'Open the hatches')

  const r0 = await run(page)
  check('the level opens on a get-ready beat', r0?.phase === 'ready' && r0.challenge?.loop === 'keep', String(r0?.phase))
  check('on the stoma stage', await page.evaluate(() => window.__sugarSim?.stage === 'hatches'))
  check('the day HUD is up', (await page.getByTestId('day-hud').count()) === 1)
  check('with a voice in it', (await page.getByTestId('day-coach').count()) === 1)
  check('and one slider', (await page.locator('[aria-label="Hatches may open to"]').count()) === 1)
  check('the lab drawer is out of the way', (await page.getByRole('button', { name: /Controls/ }).count()) === 0)

  await waitFor(async () => (await run(page))?.phase === 'day', 15000)
  await waitFor(async () => (await day(page)) !== null, 5000)
  const d0 = await day(page)
  check('the day starts at dawn', d0 && Math.abs(d0.hour - 6) < 0.6, String(d0?.hour))
  check('and the sun is a script, not a dial', await page.evaluate(() => window.__sugarSim.light < 0.12 && window.__sugarSim.day.spec.peakLight > 0.4), String(await page.evaluate(() => window.__sugarSim.light)))
  check('the day arc is on screen', (await page.getByTestId('day-arc').count()) === 1)

  await page.waitForTimeout(6000)
  const d1 = await day(page)
  check('the day runs on its own', d1 && d1.hour > d0.hour + 0.3, `${d0?.hour} → ${d1?.hour}`)
  check('sugar banks as the sun climbs', d1 && d1.sugar > 0)
  check('and water leaves', d1 && d1.water > 0)
  check('the meters are the model\'s numbers', await page.evaluate(() => {
    const d = window.__sugarSim.day
    return document.body.innerText.includes(`${d.sugarMg.toFixed(0)}`)
  }))

  /* -- the slider is a ceiling -- */
  await setCeiling(page, 40)
  await page.waitForTimeout(700)
  const h1 = await hatch(page)
  check('the slider sets the ceiling', h1 && Math.abs(h1.ceiling - 0.4) < 1e-6, JSON.stringify(h1))
  check('and the pore obeys it', h1 && h1.pore <= 0.4 + 1e-6, JSON.stringify(h1))
  check('but never past the plant', h1 && h1.pore <= h1.plant + 1e-9)

  /* -- an Explorer's finger holds the day -- */
  const thumb = page.locator('[aria-label="Hatches may open to"] [data-slot="slider-thumb"]').first()
  const box = await thumb.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(400)
  const paused = await page.evaluate(() => window.__sugarSim.paused)
  const hA = (await day(page)).hour
  await page.waitForTimeout(1500)
  const hB = (await day(page)).hour
  await page.mouse.up()
  await page.waitForTimeout(300)
  check('an Explorer holding the thumb pauses the day', paused === true && Math.abs(hB - hA) < 0.05, `paused ${paused}, ${hA} → ${hB}`)
  check('and letting go resumes it', (await page.evaluate(() => window.__sugarSim.paused)) === false)

  /* -- the wind is announced, and the plant closes on its own -- */
  await setCeiling(page, 100)
  const windAt = d1.spec.wind.start
  await waitFor(async () => ((await day(page))?.hour ?? 0) >= windAt + 0.2, 60000)
  await page.waitForTimeout(400)
  check('the wind is announced when it arrives', (await page.getByTestId('day-card-wind').count()) === 1)
  check('and named as the habitat\'s own', await page.evaluate(() => /dry afternoon wind/i.test(document.body.innerText)))
  const hw = await hatch(page)
  check('the plant closes its hatches under the wind', hw && hw.plant < 0.95, JSON.stringify(hw))
  const holdMark = await page.getByTestId('hatch-hold-mark').count()
  check('and its hold is drawn on the track', holdMark === 1 || (hw && hw.plant >= hw.ceiling - 0.08), `mark ${holdMark}, plant ${hw?.plant}`)

  /* -- dusk: the tally -- */
  await waitFor(async () => (await run(page))?.phase === 'scored', 120000)
  const rs = await run(page)
  check('the day ends on a score', rs?.phase === 'scored' && rs.score !== null)
  check('with the day\'s tally on the card', (await page.getByTestId('day-tally').count()) === 1)
  check('the tally names the leaf\'s state', await page.evaluate(() => /firm|limp|wilted/.test(document.body.innerText)))
  check('and water in millilitres', await page.evaluate(() => /\d+ mL/i.test(document.body.innerText)))
  check('and the parts are the day\'s', await page.evaluate(() => document.body.innerText.includes('Standing') && document.body.innerText.includes('Water')))
  check('the sim has its dials back', await page.evaluate(() => window.__sugarSim.day === null && window.__sugarSim.hatch === 1 && !window.__sugarSim.night))
  check('play again is offered', (await page.getByRole('button', { name: 'Play the day again', exact: true }).count()) === 1)
  await page.close()
}

/* ================================================================== */
/* An Analyst's day does not wait, and the desert has a cactus         */
/* ================================================================== */
{
  // A small window: a day-and-night is three minutes of real time at full
  // speed, and SwiftShader at 1440×900 does not run at full speed.
  const page = await open(900, 640, false, 'analyst')
  await start(page)
  await startLevel(page, 'Night shift, cactus rules')
  await waitFor(async () => (await run(page))?.phase === 'day', 15000)
  await waitFor(async () => (await day(page)) !== null, 5000)
  const thumb = page.locator('[aria-label="Hatches may open to"] [data-slot="slider-thumb"]').first()
  const box = await thumb.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(400)
  const paused = await page.evaluate(() => window.__sugarSim.paused)
  await page.mouse.up()
  check('an Analyst\'s finger does not hold the day', paused === false)
  check('the day and night run is a day and a night', (await day(page)).spec.to - (await day(page)).spec.from === 24)
  check('the VPD is on the air chip for older bands', await page.evaluate(() => /kPa/.test(document.body.innerText)))
  await setCeiling(page, 5)
  await waitFor(async () => (await run(page))?.phase === 'scored', 480000)
  const rd = await run(page)
  check('the desert day ends on a score', rd?.phase === 'scored', `${rd?.phase} at hour ${(await day(page))?.hour}`)
  check('with the cactus beside the bean', (await page.getByTestId('cactus-compare').count()) === 1)
  await page.close()
}

/* ================================================================== */

check('no console errors anywhere in the run', consoleErrors.length === 0, [...new Set(consoleErrors)].slice(0, 4).join(' | '))

await browser.close()
process.exit(tally())
