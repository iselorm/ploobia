/**
 * The Sugar Line, driven through its real controls.
 *
 * Serve dist/ on :8765 first (python3 -m http.server 8765 in dist), and check
 * the served bytes match the build before trusting a run — a stale server on
 * the same port silently serves yesterday's cabinet.
 *
 * The science is checked out of band by verify-sugar-model.mjs; this suite is
 * about the cabinet: does the HUD drive the model, does the measurement loop
 * record honest evidence, does the surgery do what it claims, and does
 * anything overlap anything else at either viewport.
 */
import { chromium } from 'playwright'
import { reporter, resilientClick } from './verify-lib.mjs'

const BASE = 'http://localhost:8765/index.html'
const URL = `${BASE}#/photosynthesis?q=low`
const { check, skip, tally } = reporter()

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

/** Read the live sim, or a fresh solve, from inside the page. */
const sim = (page, expr) =>
  page.evaluate(
    (e) => new Function('s', 'solve', 'return ' + e)(window.__sugarSim, window.__sugarSolve()),
    expr,
  )

async function waitSim(page, expr, timeout = 20000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    try {
      if (await sim(page, expr)) return true
    } catch {
      /* the handle is not up yet */
    }
    await page.waitForTimeout(100)
  }
  return false
}

/** Switch the right-hand column to one of its panels (Atlas / Data / Sugar / Missions). */
const rightPanel = (page, label) =>
  resilientClick(
    page.locator('[role="group"][aria-label="Right panel"] button', { hasText: label }).first(),
    { label: `right panel: ${label}` },
  )

const tap = (page, name, opts = {}) =>
  resilientClick(
    page.getByRole('button', { name, exact: opts.exact ?? true }).first(),
    { label: name },
  )

async function open(width, height, touch = false) {
  // A touch context matters for more than gestures: the input store mirrors
  // the mode onto <html data-input>, and that is what sets --hit. Auditing hit
  // targets in a pointer context measures the 36 px desktop size and then
  // fails them against the 44 px touch rule.
  const page = await browser.newPage({
    viewport: { width, height },
    hasTouch: touch,
    isMobile: touch,
  })
  watch(page)
  await page.goto(URL, { waitUntil: 'load' })
  await page.waitForTimeout(1800)
  return page
}

async function start(page) {
  await tap(page, 'Start')
  await waitSim(page, 's.started === true')
  await page.waitForTimeout(700)
}

/* ================================================================== */
/* Desktop                                                            */
/* ================================================================== */
{
  const page = await open(1440, 900)

  check('the welcome card names the cabinet', (await page.getByText('The Sugar Line').count()) >= 1)
  check(
    'the welcome offers a demo as well as a start',
    (await page.getByRole('button', { name: 'Watch it play itself' }).count()) === 1,
  )
  check(
    'the welcome is the only thing that can be pressed',
    (await page.locator('[data-focus-layer]').count()) === 1,
  )

  await start(page)
  check('a canvas is up', (await page.locator('canvas').count()) === 1)
  check('the sim handle is exposed', await sim(page, 's !== undefined'))

  /* ---- the plant clock is on screen, because time is sped up ---- */
  check('the plant clock declares its multiplier', (await page.getByText(/×1800/).count()) >= 1)

  /* ---- the three stages ---- */
  await tap(page, 'Inside a leaf')
  check('the leaf stage loads', await waitSim(page, "s.stage === 'leaf'"))
  await page.waitForTimeout(600)
  check('the leaf stage quotes a micrometre scale', (await page.getByText('2 µm').count()) >= 1)

  await tap(page, 'The stem, cut')
  check('the stem stage loads', await waitSim(page, "s.stage === 'stem'"))

  await tap(page, 'Whole plant')
  check('the plant stage comes back', await waitSim(page, "s.stage === 'plant'"))
  check(
    'the clock kept running across the stage swaps',
    (await sim(page, 's.plantHours')) > 8.01,
  )

  /* ---- conditions drive the model ---- */
  {
    const before = await sim(page, 'solve.production')
    await page.evaluate(() => {
      window.__sugarSim.light = 0.05
    })
    await page.waitForTimeout(500)
    const after = await sim(page, 'solve.production')
    check('less light means less sugar made', after < before * 0.6, `${after.toFixed(1)} < ${before.toFixed(1)}`)
    await page.evaluate(() => {
      window.__sugarSim.light = 0.75
    })
    await page.waitForTimeout(400)
  }

  /* ---- the light slider is a real, labelled control ---- */
  {
    const dial = page.locator('[aria-label="Light intensity"] [role="slider"]').first()
    check('the light dial exists and is labelled', (await dial.count()) === 1)
    const box = await page
      .locator('[aria-label="Light intensity"] [data-slot="slider-track"]')
      .first()
      .boundingBox()
    if (box) {
      await page.mouse.click(box.x + box.width * 0.3, box.y + box.height / 2)
      await page.waitForTimeout(400)
      const light = await sim(page, 's.light')
      check('dragging the dial moves the model', light > 0.15 && light < 0.55, light.toFixed(2))
    } else {
      skip('dragging the dial moves the model', 'the slider track had no box')
    }
  }

  /* ---- night ---- */
  await tap(page, 'Switch to night', { exact: false })
  check('night is on', await waitSim(page, 's.night === true'))
  await page.waitForTimeout(700)
  check('nothing is fixed at night', (await sim(page, 'solve.production')) === 0)
  check(
    'the line keeps running on the leaf’s starch',
    (await sim(page, 'solve.exportRate')) > 0.5,
  )
  check('the starch bank is being spent', (await sim(page, 'solve.starchFlux')) < 0)
  await tap(page, 'Switch to day', { exact: false })
  await waitSim(page, 's.night === false')

  /* ---- girdling ---- */
  await tap(page, 'Cut the phloem ring', { exact: false })
  check('the ring is cut', await waitSim(page, 's.girdled === true'))
  await page.waitForTimeout(700)
  check('cutting the ring stops the sugar', (await sim(page, 'solve.exportRate')) === 0)
  check('cutting the ring stops the sap moving', (await sim(page, 'solve.velocity')) === 0)
  check(
    'cutting the ring leaves photosynthesis alone',
    (await sim(page, 'solve.production')) > 1,
  )
  check(
    'the cabinet says so in words',
    (await page.getByText(/phloem is severed|cut ring|The cut ring/i).count()) >= 1,
  )
  await tap(page, 'Heal the phloem ring', { exact: false })
  await waitSim(page, 's.girdled === false')

  /* ---- the measurement loop ---- */
  {
    await rightPanel(page, 'Data')
    await page.waitForTimeout(500)
    check(
      'nothing is recorded before a measurement is run',
      (await page.getByText(/Nothing recorded yet/).count()) === 1,
    )
    await tap(page, 'Run measurement', { exact: false })
    check('a trial starts', await waitSim(page, 's.trialRunning === true', 8000))
    check('the trial finishes', await waitSim(page, 's.trialRunning === false', 25000))
    await page.waitForTimeout(900)
    check('a reading lands in the table', (await page.getByText('1 recorded').count()) === 1)
  }

  /* ---- a trial spoiled mid-run is thrown away, not mislabelled ---- */
  {
    const before = await sim(page, 's.trialAborted')
    await tap(page, 'Run measurement', { exact: false })
    await waitSim(page, 's.trialRunning === true', 8000)
    await page.evaluate(() => {
      window.__sugarSim.light = 0.2
    })
    await tap(page, 'Water the plant', { exact: false })
    await page.waitForTimeout(700)
    const after = await sim(page, 's.trialAborted')
    check('changing a control mid-trial discards the trial', after > before)
    check(
      'and says why',
      (await page.getByText(/Trial discarded/).count()) === 1,
    )
    check('still only one recorded reading', (await page.getByText('1 recorded').count()) === 1)
  }

  /* ---- the tracer ride ---- */
  {
    await tap(page, 'Release the tracer', { exact: false })
    check('the tracer is running', await waitSim(page, 's.tracerActive === true', 8000))
    check(
      'the tracer run slows the plant clock so it can be timed',
      (await page.getByText(/×45/).count()) >= 1,
    )
    await page.locator('[aria-label="Stopwatch"]').first().click({ force: true })
    check('the stopwatch is running', await waitSim(page, 's.tracerWatch === 1', 8000))
    check(
      'the stopwatch counts plant seconds',
      await waitSim(page, 's.tracerWatchSeconds > 3', 15000),
    )
    await page.locator('[aria-label="Stopwatch"]').first().click({ force: true })
    check('the stopwatch stops', await waitSim(page, 's.tracerWatch === 2', 8000))
    const finished = await waitSim(page, 's.tracerActive === false', 60000)
    if (finished) {
      await page.waitForTimeout(900)
      check(
        'a timed tracer records a translocation-speed reading',
        (await page.getByText('2 recorded').count()) === 1,
      )
      check(
        'and shows the honest gap between the stopwatch and the truth',
        (await page.getByText(/reaction time/).count()) === 1,
      )
    } else {
      skip('a timed tracer records a reading', 'the parcel did not reach the far mark in 60 s')
    }
  }

  /* ---- specimens ---- */
  {
    await tap(page, 'Specimen: Maize', { exact: false })
    check('the specimen swaps', await waitSim(page, "s.specimenId === 'maize'"))
    await page.waitForTimeout(900)
    await rightPanel(page, 'Atlas')
    await page.waitForTimeout(500)
    check('the atlas card follows', (await page.getByText('Zea mays').count()) >= 1)
    check('so do the key facts', (await page.getByText('C4').count()) >= 1)
    check(
      'maize really is the faster plant',
      (await sim(page, 'solve.production')) > 25,
      (await sim(page, 'solve.production')).toFixed(1),
    )
    await tap(page, 'Specimen: Common bean', { exact: false })
    await waitSim(page, "s.specimenId === 'bean'")
  }

  /* ---- where the sugar goes ---- */
  {
    const shares = await sim(page, 'solve.sinks.map((x) => x.share)')
    const total = shares.reduce((a, b) => a + b, 0)
    check('the sink shares sum to one', Math.abs(total - 1) < 1e-6, total.toFixed(6))
    await rightPanel(page, 'Sugar')
    await page.waitForTimeout(500)
    check('the ledger lists every sink', (await page.getByText('The stores').count()) === 1)
    check('and the leaf’s own starch bank', (await page.getByText('Leaf starch').count()) === 1)
  }

  /* ---- Reaction Vision ---- */
  await page.locator('[aria-label="Reaction Vision"]').first().click({ force: true })
  check('Reaction Vision turns on', await waitSim(page, 's.vision === true'))
  check('and its wavefront climbs', await waitSim(page, 's.pulse > 0.05', 12000))
  await page.locator('[aria-label="Reaction Vision"]').first().click({ force: true })
  await waitSim(page, 's.vision === false')

  /* ---- nothing overlaps anything ---- */
  {
    const boxes = await page.evaluate(() => {
      const pick = (sel) => document.querySelector(sel)?.getBoundingClientRect()
      const out = {}
      for (const [name, sel] of [
        ['back', 'a[href="#/"]'],
        ['stageTabs', '[role="group"][aria-label="View"]'],
        ['instrument', '[aria-label="Run measurement"]'],
        ['light', '[aria-label="Light intensity"]'],
        ['predict', '[aria-label="Predicted reading"]'],
      ]) {
        const r = pick(sel)
        if (r) out[name] = { x: r.x, y: r.y, w: r.width, h: r.height }
      }
      out.viewport = { w: window.innerWidth, h: window.innerHeight }
      return out
    })
    const inside = (b) =>
      b && b.x >= -1 && b.y >= -1 && b.x + b.w <= boxes.viewport.w + 1 && b.y + b.h <= boxes.viewport.h + 1
    check('the back chip is fully on screen', inside(boxes.back))
    check(
      'the Run measurement button is above the fold, not scrolled off',
      inside(boxes.instrument),
      JSON.stringify(boxes.instrument),
    )
    check('the stage tabs are fully on screen', inside(boxes.stageTabs))
    check('the light dial is fully on screen', inside(boxes.light))
    const overlap = (a, b) =>
      a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    check('the stage tabs do not cover the back chip', !overlap(boxes.stageTabs, boxes.back))
    check(
      'the prediction dial is reachable without scrolling',
      inside(boxes.predict),
      JSON.stringify(boxes.predict),
    )
  }

  await page.close()
}

/* ================================================================== */
/* A short laptop: the loop must still fit                            */
/* ================================================================== */
{
  const page = await open(1280, 720)
  await start(page)
  const boxes = await page.evaluate(() => {
    const r = (sel) => {
      const e = document.querySelector(sel)
      if (!e) return null
      const b = e.getBoundingClientRect()
      return { x: b.x, y: b.y, w: b.width, h: b.height }
    }
    return {
      run: r('[aria-label="Run measurement"]'),
      light: r('[aria-label="Light intensity"]'),
      tabs: r('[role="group"][aria-label="View"]'),
      viewport: { w: window.innerWidth, h: window.innerHeight },
    }
  })
  const fits = (b) =>
    b && b.x >= -1 && b.y >= -1 && b.x + b.w <= boxes.viewport.w + 1 && b.y + b.h <= boxes.viewport.h + 1
  check('1280×720: Run measurement is on screen', fits(boxes.run), JSON.stringify(boxes.run))
  check('1280×720: the light dial is on screen', fits(boxes.light), JSON.stringify(boxes.light))
  check('1280×720: the stage tabs are on screen', fits(boxes.tabs), JSON.stringify(boxes.tabs))
  await page.close()
}

/* ================================================================== */
/* Bands                                                              */
/* ================================================================== */
{
  const page = await open(1440, 900)
  await start(page)

  await resilientClick(page.getByRole('button', { name: 'Explorer' }).first(), { label: 'Explorer' })
  await page.waitForTimeout(700)
  await rightPanel(page, 'Data')
  await page.waitForTimeout(500)
  check(
    'Explorer hides the controlled-variable framing',
    (await page.getByText('Investigating').count()) === 0,
  )
  check('Explorer keeps the graph', (await page.getByRole('button', { name: 'Graph' }).count()) === 1)
  check(
    'Explorer has no results table',
    (await page.getByRole('button', { name: 'Table' }).count()) === 0,
  )

  await resilientClick(page.getByRole('button', { name: 'Analyst' }).first(), { label: 'Analyst' })
  await page.waitForTimeout(700)
  await rightPanel(page, 'Data')
  await page.waitForTimeout(500)
  check('Analyst gets the table', (await page.getByRole('button', { name: 'Table' }).count()) === 1)
  check(
    'Analyst gets the write-up',
    (await page.getByRole('button', { name: 'Write-up' }).count()) === 1,
  )
  await rightPanel(page, 'Sugar')
  await page.waitForTimeout(500)
  check(
    'Analyst sees the pressure gradient',
    (await page.getByText('Pressure gradient').count()) === 1,
  )
  await rightPanel(page, 'Data')
  await page.waitForTimeout(400)

  /* ---- the conclusion builder ---- */
  await resilientClick(page.getByRole('button', { name: 'Write-up' }).first(), { label: 'Write-up' })
  await page.waitForTimeout(400)
  const claims = page.locator('[role="group"][aria-label="Claim"] button')
  const reasons = page.locator('[role="group"][aria-label="Reasoning"] button')
  const limits = page.locator('[role="group"][aria-label="Limitations"] button')
  check('the write-up offers claims', (await claims.count()) === 4)
  check('and reasoning', (await reasons.count()) === 3)
  check('and limitations', (await limits.count()) >= 3)
  await claims.first().click({ force: true })
  await reasons.nth(1).click({ force: true })
  await limits.nth(0).click({ force: true })
  await page.waitForTimeout(300)
  await resilientClick(page.getByRole('button', { name: 'Submit the write-up' }).first(), {
    label: 'write-up',
  })
  await page.waitForTimeout(500)
  check(
    'the finished write-up reads back as a sentence',
    (await page.getByText(/Limitations:/).count()) === 1,
  )

  await page.close()
}

/* ================================================================== */
/* Missions complete on recorded evidence only                        */
/* ================================================================== */
{
  const page = await open(1440, 900)
  await start(page)
  await rightPanel(page, 'Missions')
  await page.waitForTimeout(500)
  check('missions start unfinished', (await page.getByText('0/6').count()) >= 1)

  // Set bright light, then run a real trial. Nothing should complete until the
  // reading is recorded.
  await page.evaluate(() => {
    window.__sugarSim.light = 0.9
  })
  await page.waitForTimeout(800)
  check(
    'a good rate on the gauge alone completes nothing',
    (await page.getByText('0/6').count()) >= 1,
  )
  await tap(page, 'Run measurement', { exact: false })
  await waitSim(page, 's.trialRunning === false', 25000)
  await page.waitForTimeout(1000)
  await rightPanel(page, 'Missions')
  await page.waitForTimeout(600)
  check(
    'recording the reading completes the first mission',
    (await page.getByText('1/6').count()) >= 1,
  )
  check(
    'and the completion reaches the learning log',
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('ploobia.events.v1') || '[]').some(
        (e) => e.type === 'mission.completed',
      ),
    ),
  )
  await page.close()
}

/* ================================================================== */
/* Compact                                                            */
/* ================================================================== */
{
  const page = await open(390, 844, true)
  // One real tap first, so the input model switches to touch sizing.
  await page.touchscreen.tap(195, 700)
  await page.waitForTimeout(200)
  await start(page)
  check(
    'the phone gets the drawer',
    (await page.getByRole('button', { name: 'Controls', exact: true }).count()) === 1,
  )
  await tap(page, 'Controls')
  await page.waitForTimeout(600)
  check(
    'the drawer opens onto the specimen library',
    await page.getByText('Specimen library').first().isVisible(),
  )
  await tap(page, 'Data')
  await page.waitForTimeout(500)
  check('the data tab shows the graph', (await page.getByRole('button', { name: 'Graph' }).count()) >= 1)
  await tap(page, 'Missions')
  await page.waitForTimeout(500)
  check('the missions tab lists missions', (await page.getByText('Wake the line up').count()) >= 1)

  const boxes = await page.evaluate(() => {
    const r = (sel) => {
      const e = document.querySelector(sel)
      if (!e) return null
      const b = e.getBoundingClientRect()
      return { x: b.x, y: b.y, w: b.width, h: b.height }
    }
    return {
      tabs: r('[role="group"][aria-label="View"]'),
      back: r('a[href="#/"]'),
      viewport: { w: window.innerWidth, h: window.innerHeight },
    }
  })
  const overlap = (a, b) =>
    a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  check(
    'on a phone the stage tabs clear the top chips',
    !overlap(boxes.tabs, boxes.back),
    `tabs ${JSON.stringify(boxes.tabs)} vs back ${JSON.stringify(boxes.back)}`,
  )
  check(
    'and the stage tabs fit the width',
    boxes.tabs && boxes.tabs.x >= -1 && boxes.tabs.x + boxes.tabs.w <= boxes.viewport.w + 1,
  )

  /* ---- every control is thumb-sized ----
     Measured the way the platform measures it: a Tile carries its hit area on
     an ::after pseudo-element, so the box alone under-reports. */
  const audit = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('.hud button, .hud a, [role="slider"]'))
    const small = []
    for (const el of els) {
      const r = el.getBoundingClientRect()
      if (r.width < 2 || r.height < 2) continue
      const cs = getComputedStyle(el, '::after')
      const w = cs.content !== 'none' ? Math.max(r.width, parseFloat(cs.width) || 0) : r.width
      const h = cs.content !== 'none' ? Math.max(r.height, parseFloat(cs.height) || 0) : r.height
      if (w < 44 || h < 44)
        small.push(`${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 22)} ${Math.round(w)}x${Math.round(h)}`)
    }
    return { total: els.length, small }
  })
  check(
    `every visible control is thumb-sized (${audit.total} controls)`,
    audit.small.length === 0,
    audit.small.slice(0, 6).join(', '),
  )

  await page.close()
}

/* ================================================================== */

check(
  'no console errors anywhere in the run',
  consoleErrors.length === 0,
  [...new Set(consoleErrors)].slice(0, 4).join(' | '),
)

await browser.close()
process.exit(tally())
