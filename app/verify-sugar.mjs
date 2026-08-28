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

async function open(width, height, touch = false, quality = 'low') {
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
  await page.goto(`${BASE}#/photosynthesis?q=${quality}`, { waitUntil: 'load' })
  await page.waitForTimeout(1800)
  return page
}

async function start(page) {
  // Wait for the welcome to exist before reaching for it. `resilientClick`
  // has a 90 s budget, but it spends it *waiting for a locator*, so a page
  // that is merely slow to mount burns the whole budget and then reports a
  // timeout that reads like a missing button.
  await page
    .getByRole('button', { name: 'Start', exact: true })
    .first()
    .waitFor({ timeout: 30000 })
    .catch(() => {})
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
  // Through `resilientClick`, not a raw forced click: on a saturated software
  // renderer a real click can land without the React handler ever running, and
  // the failure then looks like a broken feature rather than a slow frame.
  await resilientClick(page.locator('[aria-label="Reaction Vision"]').first(), {
    label: 'Reaction Vision',
  })
  check('Reaction Vision turns on', await waitSim(page, 's.vision === true'))
  check('and its wavefront climbs', await waitSim(page, 's.pulse > 0.05', 12000))
  await resilientClick(page.locator('[aria-label="Reaction Vision"]').first(), {
    label: 'Reaction Vision off',
  })
  await waitSim(page, 's.vision === false')

  /* ---- the habitat, and the way back to the plate ---- */
  {
    await tap(page, 'Whole plant')
    await waitSim(page, "s.stage === 'plant'")
    check('the specimen starts in its habitat', await sim(page, 's.habitat === true'))

    // The habitat follows the specimen rather than being a dial. Proved by
    // the scene's own fog, which is built from the biome preset: swap a
    // temperate crop for a desert one and the air has to change colour.
    const fogOf = () =>
      page.evaluate(() => {
        const f = window.__sugarScene?.fog
        return f ? f.color.getHexString() : null
      })
    await tap(page, 'Specimen: Common bean', { exact: false })
    await page.waitForTimeout(1500)
    const beanFog = await fogOf()
    await tap(page, 'Specimen: Prickly pear', { exact: false })
    await page.waitForTimeout(1800)
    const cactusFog = await fogOf()
    check('the whole-plant stage really is fogged outdoor air', beanFog !== null, String(beanFog))
    check(
      'and the air changes when the specimen does — habitat follows the plant',
      Boolean(beanFog && cactusFog && beanFog !== cactusFog),
      `${beanFog} → ${cactusFog}`,
    )
    await tap(page, 'Specimen: Common bean', { exact: false })
    await page.waitForTimeout(1500)

    await resilientClick(page.locator('[aria-label="Switch to the plain plate"]').first(), {
      label: 'plate view',
    })
    check('the habitat can be switched off', await waitSim(page, 's.habitat === false'))
    check(
      'and the toggle then offers the way back',
      (await page.locator('[aria-label="Show the habitat"]').count()) === 1,
    )
    await resilientClick(page.locator('[aria-label="Show the habitat"]').first(), {
      label: 'field view',
    })
    check('the habitat comes back', await waitSim(page, 's.habitat === true'))
    // Scenery belongs to the whole-plant view only; a landscape behind a
    // chloroplast would be fiction, so the toggle must not be offered there.
    await tap(page, 'Inside a leaf')
    await waitSim(page, "s.stage === 'leaf'")
    check(
      'the habitat toggle is not offered inside a leaf',
      (await page.locator('[aria-label="Switch to the plain plate"]').count()) === 0,
    )
    await tap(page, 'Whole plant')
    await waitSim(page, "s.stage === 'plant'")
  }

  /* ---- sunlight actually arrives ----
     The light dial used to move a number and nothing else on this stage, which
     teaches that light is a setting rather than something arriving from
     somewhere and landing on a leaf. Asserted as the house rule it follows:
     more light lights MORE lanes, it does not make the same ones brighter or
     faster. And night is dark. */
  const rays = () =>
    page.evaluate(() => {
      const m = window.__sugarScene?.getObjectByName('sun-beams')
      if (!m) return null
      const a = m.instanceMatrix.array
      let visible = 0
      for (let i = 0; i < m.count; i++) {
        const o = i * 16
        if (Math.hypot(a[o], a[o + 1], a[o + 2]) > 1e-4) visible++
      }
      return { count: m.count, visible, opacity: m.material.opacity }
    })

  const setLight = async (v, night = false) => {
    await page.evaluate(
      ([x, n]) => {
        window.__sugarSim.light = x
        window.__sugarSim.night = n
      },
      [v, night],
    )
    await page.waitForTimeout(500)
  }

  await setLight(1)
  const bright = await rays()
  check('sunlight is drawn arriving on the leaves', bright && bright.visible > 0, JSON.stringify(bright))
  check(
    'and there is one lane per leaf, not one per allocated instance',
    bright && bright.count > 0 && bright.count <= 7,
    `count ${bright?.count}`,
  )
  await setLight(0.4)
  const dim = await rays()
  check(
    'turning the light down lights fewer lanes',
    bright && dim && dim.visible < bright.visible,
    `${bright?.visible} → ${dim?.visible}`,
  )
  await setLight(0.4, true)
  const dark = await rays()
  check('and at night no light arrives at all', dark && dark.visible === 0, JSON.stringify(dark))
  await setLight(1)


  /* ---- missions are jobs you can pick up ---- */
  {
    await rightPanel(page, 'Missions')
    await page.waitForTimeout(500)
    // Deliberately a mission the suite cannot have finished by accident: the
    // light curve needs five readings across the range, and "Take on: …" is
    // only the label while a mission is still outstanding.
    check(
      'a mission that is not yet done invites you to take it on',
      (await page.locator('[aria-label="Take on: Find the ceiling"]').count()) === 1,
    )
    await resilientClick(page.locator('[aria-label="Take on: Find the ceiling"]').first(), {
      label: 'take on a mission',
    })
    check('taking one on records it on the sim', await waitSim(page, "s.activeMission === 'light-curve'"))
    // The point of the whole feature: one named control is ringed, and it is
    // the one the current step actually needs.
    const aimed = await page.evaluate(() => {
      const el = document.querySelector('.atlas-aim')
      if (!el) return null
      const labelled = el.matches('[aria-label]') ? el : el.querySelector('[aria-label]')
      return labelled?.getAttribute('aria-label') ?? el.className
    })
    check('exactly one control is ringed', (await page.locator('.atlas-aim').count()) === 1, String(aimed))
    check(
      'and it is a control the step names',
      ['Independent variable', 'Light intensity', 'Run measurement'].includes(String(aimed)),
      String(aimed),
    )
    check(
      'the steps are listed, not just the finish line',
      // `>= 1`, not `=== 1`: getByText matches every ancestor whose text
      // contains the string, and a step line sits inside a span inside a tile.
      (await page.getByText('Take readings right across the light range').count()) >= 1,
    )
    // Tapping it again puts it back down.
    await resilientClick(page.locator('[aria-label="Take on: Find the ceiling"]').first(), {
      label: 'put the mission down',
    })
    check('and it can be put down again', await waitSim(page, 's.activeMission === null'))
    check('no control is ringed once it is', (await page.locator('.atlas-aim').count()) === 0)
  }

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
/* The gases say what they are                                        */
/* ================================================================== */
/**
 * On its own page at the medium tier, because the gas field is a particle
 * budget: `particleScale` at the low tier is 0.45 and the field is gated above
 * 0.5, so at `?q=low` there are no molecules to label and asserting on them
 * fails perfectly correct code. That is the same trap `verify-bundle` hits
 * when it is run against a non-pilot build.
 */
{
  const page = await open(1280, 800, false, 'medium')
  await start(page)
  await page.evaluate(() => {
    window.__sugarSim.light = 1
    window.__sugarSim.night = false
    window.__sugarSim.co2 = 0.9
  })
  await page.waitForTimeout(1500)

  const gas = await page.evaluate(() => {
    const read = (name) => {
      const m = window.__sugarScene?.getObjectByName(name)
      if (!m) return null
      const a = m.instanceMatrix.array
      let visible = 0
      let scale = 0
      for (let i = 0; i < m.count; i++) {
        const o = i * 16
        const s = Math.hypot(a[o], a[o + 1], a[o + 2])
        if (s > 1e-4) visible++
        scale = Math.max(scale, s)
      }
      return {
        visible,
        // The rendered height is the geometry's height times the instance
        // scale. Checking it catches the failure these labels actually had:
        // present in the graph, correct in every other respect, and drawn at
        // 0.0085 world units because the per-instance scale had been confused
        // with the `size` prop.
        worldHeight: +(scale * (m.geometry.parameters?.height ?? 0)).toFixed(3),
      }
    }
    return { co2: read('gas-label-co2'), o2: read('gas-label-o2') }
  })

  check('the inbound gas is labelled CO₂', !!gas.co2, JSON.stringify(gas.co2))
  check('the outbound gas is labelled O₂', !!gas.o2, JSON.stringify(gas.o2))
  check(
    'at least one CO₂ label is actually drawn',
    (gas.co2?.visible ?? 0) > 0,
    `${gas.co2?.visible} of them`,
  )
  check(
    'and the labels are a readable size, not a sub-millimetre one',
    (gas.co2?.worldHeight ?? 0) > 0.05,
    `${gas.co2?.worldHeight} world units`,
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

  /* ---- and every control can actually be touched ----
     The check above, and the two overlap checks before it, all passed while
     stage navigation was completely dead on every phone: the tabs were the
     right size, in the right place, overlapping nothing — and had no pointer
     events, because the HUD root is `pointer-events-none` and the compact
     branch forgot to opt them back in. Geometry cannot catch that. Hit-testing
     can: whatever is at a control's own centre must be that control. */
  const unreachable = await page.evaluate(() => {
    const out = []
    for (const el of document.querySelectorAll('.hud button, .hud a')) {
      const r = el.getBoundingClientRect()
      if (r.width < 2 || r.height < 2) continue
      const cx = r.x + r.width / 2
      const cy = r.y + r.height / 2
      if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) continue
      const hit = document.elementFromPoint(cx, cy)
      if (!hit || !(el.contains(hit) || hit.contains(el)))
        out.push((el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24))
    }
    return out
  })
  check(
    'every control on a phone is hit-testable, not just well placed',
    unreachable.length === 0,
    unreachable.slice(0, 6).join(', '),
  )

  /* ---- the stages are reachable on a phone ----
     Stated as the behaviour rather than the mechanism: tapping the tab must
     change the stage. This is the check that would have caught the bug. */
  for (const [label, want] of [
    ['Inside a leaf', 'leaf'],
    ['The stem, cut', 'stem'],
    ['Whole plant', 'plant'],
  ]) {
    await tap(page, label)
    await page.waitForTimeout(700)
    check(`on a phone, "${label}" switches the stage`, await sim(page, `s.stage === '${want}'`))
  }

  /* ---- the controls sheet leaves the specimen visible ---- */
  await tap(page, 'Controls')
  await page.waitForTimeout(800)
  const sheet = await page.evaluate(() => {
    const cam = window.__sugarCam
    const closer = document.querySelector('[aria-label="Close panel"]')
    const panel = closer?.closest('div[class*="rounded-t-"]')
    const box = panel?.getBoundingClientRect()
    // Project the specimen's own bounding box, so "visible" is measured rather
    // than assumed.
    let top = null
    const subject = window.__sugarScene?.getObjectByName('subject')
    if (subject && cam) {
      const pts = []
      const b = { min: subject.position.clone(), max: subject.position.clone() }
      subject.traverse((o) => {
        if (!o.geometry) return
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
        const bb = o.geometry.boundingBox
        if (!bb) return
        for (const x of [bb.min.x, bb.max.x])
          for (const y of [bb.min.y, bb.max.y])
            for (const z of [bb.min.z, bb.max.z]) {
              const v = bb.min.clone().set(x, y, z)
              o.localToWorld(v)
              pts.push(v)
            }
      })
      void b
      let best = Infinity
      for (const v of pts) {
        const p = v.clone().project(cam)
        best = Math.min(best, ((1 - p.y) / 2) * window.innerHeight)
      }
      top = pts.length ? Math.round(best) : null
    }
    return {
      hasCloseButton: !!closer,
      hasGrabHandle: !!document.querySelector('.cursor-grab'),
      sheetTop: box ? Math.round(box.top) : null,
      viewportH: window.innerHeight,
      lifted: cam?.view?.enabled === true,
      subjectTop: top,
    }
  })
  /* ---- the tab opens on what you opened it for ----
     The controls sheet used to lead with the five-row specimen library, which
     put the light dial's track at y = 861 on an 844 px screen: present,
     correctly sized, and reachable only by scrolling a panel that had just
     appeared. A panel whose primary control is off screen on open is the same
     failure as the desktop column that pushed "Run measurement" to y ≈ 934. */
  const firstControl = await page.evaluate(() => {
    const track = document.querySelector('[data-slot="slider-track"]')
    if (!track) return null
    const b = track.getBoundingClientRect()
    const cx = b.x + b.width * 0.85
    const cy = b.y + b.height / 2
    const hit = document.elementFromPoint(cx, cy)
    return {
      y: Math.round(b.y),
      viewportH: window.innerHeight,
      reachable: !!hit && (track.contains(hit) || hit.contains(track)),
      label: track.closest('[aria-label]')?.getAttribute('aria-label') ?? null,
    }
  })
  check(
    'the controls sheet opens with a condition dial already on screen',
    firstControl && firstControl.y > 0 && firstControl.y < firstControl.viewportH,
    JSON.stringify(firstControl),
  )
  check(
    'and that dial can be touched where it is drawn',
    firstControl?.reachable === true,
    `${firstControl?.label} at y ${firstControl?.y}`,
  )

  check('the controls sheet offers an explicit close', sheet.hasCloseButton)
  check('and a grab handle to swipe it away', sheet.hasGrabHandle)
  check(
    'the sheet leaves at least a third of the screen to the scene',
    sheet.sheetTop !== null && sheet.sheetTop > sheet.viewportH * 0.33,
    `top ${sheet.sheetTop} of ${sheet.viewportH}`,
  )
  check('opening the sheet lifts the scene', sheet.lifted)
  check(
    'and the specimen is still on screen with the sheet open',
    sheet.subjectTop !== null && sheet.subjectTop >= 0 && sheet.subjectTop < sheet.sheetTop,
    `subject top ${sheet.subjectTop}, sheet top ${sheet.sheetTop}`,
  )

  await tap(page, 'Close panel')
  await page.waitForTimeout(600)
  check(
    'closing it puts the scene back',
    (await page.evaluate(() => window.__sugarCam?.view?.enabled)) !== true,
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
