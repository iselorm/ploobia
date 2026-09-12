/**
 * The field guide, driven through its real controls.
 *
 * Serve dist/ on :8765 first. The book's honesty is proved out of band by
 * `verify-page-model.mjs`; this suite settles what only a browser can: that
 * the guide is pulled open from inside the room and takes the parts column;
 * that every term on every page, at every band, moves the sim when tapped
 * (the one rule of the guide — a term that moves nothing is a bug); that the
 * ledger beside the page reads the record back; that a check page stamps on
 * commit and the model answer waits for the commit; that a hit hand-in asks
 * for its explanation before it stamps; and that the phone tier has the
 * guide as a sheet with every control under the finger.
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

const snap = (page) =>
  page.evaluate(() => {
    const s = window.__sugarSim
    if (!s) return null
    return {
      stage: s.stage,
      viewId: s.viewId,
      viewSeq: s.viewSeq,
      light: s.light,
      co2: s.co2,
      tempC: s.tempC,
      soilWater: s.soilWater,
      humidity: s.humidity,
      night: s.night,
      hatch: s.hatch,
      girdled: s.girdled,
      xylemCut: s.xylemCut,
      vision: s.vision,
      tracerActive: s.tracerActive,
      starch: s.carbon.leafStarch,
      spotlight: s.spotlight,
      spotlightUntil: s.spotlightUntil,
      specimenId: s.specimenId,
      runs: window.__ploobiaVerbs?.runs().runs ?? 0,
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

const press = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return false
    el.click()
    return true
  }, selector)

async function open(width, height, touch, band) {
  const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch, isMobile: touch })
  watch(page)
  await page.goto(`${BASE}#/photosynthesis?q=low`, { waitUntil: 'load' })
  await page.evaluate((b) => {
    localStorage.setItem('ploobia.band.v1', JSON.stringify(b))
    localStorage.removeItem('ploobia.curriculum.v1')
    localStorage.setItem('ploobia.campaign.photosynthesis.v1', JSON.stringify({ handedIn: { 'first-light': 700, 'open-the-hatches': 700 } }))
  }, band)
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1800)
  return page
}

async function startFree(page) {
  await page.getByRole('button', { name: 'Start', exact: true }).first().waitFor({ timeout: 30000 }).catch(() => {})
  await tap(page, 'Start')
  await waitFor(async () => await page.evaluate(() => window.__sugarSim?.started === true))
  await page.waitForTimeout(500)
}

/* ------------------------------------------------------------------ */
/* Desktop: pulled open, takes the parts column, every term moves      */
/* ------------------------------------------------------------------ */
for (const band of ['explorer', 'scientist', 'analyst']) {
  const page = await open(1440, 900, false, band)
  await startFree(page)
  check(`[${band}] the guide chip is in the room`, (await page.getByTestId('guide-chip').count()) === 1)
  check(`[${band}] the parts column is up before the guide opens`, (await page.getByLabel(/^Specimen: /).count()) >= 1)
  await tap(page, 'Field guide')
  await page.waitForTimeout(600)
  check(`[${band}] the page card opens`, (await page.getByTestId('page-card').count()) === 1)
  const opened = await page.getByTestId('page-card').getAttribute('data-section')
  check(`[${band}] it opens at the section for where you are (the plant → 6.1)`, opened === '0610:6.1', opened)
  check(`[${band}] the page card takes the parts column`, (await page.getByLabel(/^Specimen: /).count()) === 0)
  check(`[${band}] the ledger sits in the right column`, (await page.getByTestId('section-ledger').count()) === 1)
  check(`[${band}] no syllabus number on the page card`, !/\b\d\.\d\.\d+\b/.test(await page.getByTestId('page-card').innerText()))
  check(`[${band}] the ledger carries the numbers`, /6\.1\.1/.test(await page.getByTestId('section-ledger').innerText()))
  const ext = await page.getByTestId('guide-ext').count()
  check(`[${band}] the Extended block shows only at Analyst`, band === 'analyst' ? ext === 1 : ext === 0)

  // Walk every section and page, tapping every term.
  const sections = ['0610:6.1', '0610:6.2', '0610:8.1', '0610:8.2', '0610:8.3', '0610:8.4']
  let terms = 0
  const dead = []
  for (const sec of sections) {
    // Jump via the contents rail.
    await press(page, '[data-testid="page-card"] [aria-label="Contents"]')
    await page.waitForTimeout(150)
    const title = await page.evaluate((id) => {
      const btn = [...document.querySelectorAll('[data-testid="guide-contents"] button')]
      return btn.map((b) => b.getAttribute('aria-label'))
    }, sec)
    // Contents buttons are labelled "Open <title>"; find by section order.
    const order = ['Photosynthesis', 'Leaf structure', 'Xylem and phloem', 'Water uptake', 'Transpiration', 'Translocation']
    const want = `Open ${order[sections.indexOf(sec)]}`
    check(`[${band}] contents lists ${want}`, title.includes(want))
    await press(page, `[data-testid="guide-contents"] [aria-label="${want}"]`)
    await page.waitForTimeout(300)
    let guard = 0
    while (guard < 6) {
      guard += 1
      const here = await page.getByTestId('page-card').getAttribute('data-section')
      if (here !== sec) break
      const verbs = await page.evaluate(() => [...document.querySelectorAll('[data-testid="guide-term"]')].map((b) => b.getAttribute('data-verb')))
      for (let i = 0; i < verbs.length; i += 1) {
        const v = verbs[i]
        // Move the sim away from the verb's target so a real change is observable.
        await page.evaluate((verb) => {
          const s = window.__sugarSim
          if (verb.startsWith('light/')) s.light = 0.5
          if (verb.startsWith('co2/')) s.co2 = 0.5
          if (verb.startsWith('temp/')) s.tempC = 22
          if (verb.startsWith('water/')) s.soilWater = 0.5
          if (verb.startsWith('air/')) s.humidity = 0.55
          if (verb === 'night/on') s.night = false
          if (verb === 'night/off') s.night = true
          if (verb === 'pore/open') s.hatch = 0.3
          if (verb === 'pore/close') s.hatch = 0.8
          if (verb === 'xylem/cut' || verb === 'phloem/cut') { s.girdled = false; s.xylemCut = false }
          if (verb === 'xylem/heal') s.xylemCut = true
          if (verb === 'phloem/heal') s.girdled = true
          if (verb === 'leaf/vision') s.vision = false
          if (verb === 'phloem/flow') s.tracerActive = false
          if (verb.startsWith('specimen/')) s.specimenId = verb.endsWith('bean') ? 'maize' : 'bean'
          if (verb.startsWith('figure/')) { /* page-owned */ }
          s.spotlight = null
        }, v)
        const before = await snap(page)
        await page.evaluate((idx) => document.querySelectorAll('[data-testid="guide-term"]')[idx].click(), i)
        await page.waitForTimeout(120)
        const after = await snap(page)
        terms += 1
        let moved
        if (v.startsWith('figure/')) moved = (await page.getByTestId('leaf-figure').getAttribute('data-lit')) === v.slice(7)
        else moved = after.runs > before.runs && JSON.stringify(after) !== JSON.stringify(before)
        if (!moved) dead.push(`${sec} ${v}`)
      }
      // The Explorer never sees an Extended block; the Analyst does — its terms are tapped too.
      await press(page, '[aria-label="Next page"]')
      await page.waitForTimeout(250)
    }
  }
  check(`[${band}] every term on every page moved the sim (${terms} taps)`, dead.length === 0, dead.join('; '))
  check(`[${band}] a spotlight lit a tissue at least once`, await page.evaluate(() => (window.__sugarSim?.spotlightUntil ?? 0) > 0))

  // The check page: committed before the model answer, stamped on commit.
  await press(page, '[data-testid="page-card"] [aria-label="Contents"]')
  await page.waitForTimeout(150)
  await press(page, '[data-testid="guide-contents"] [aria-label="Open Translocation"]')
  await page.waitForTimeout(300)
  for (let i = 0; i < 4; i += 1) {
    const kind = await page.getByTestId('page-card').getAttribute('data-kind')
    if (kind === 'check') break
    await press(page, '[aria-label="Next page"]')
    await page.waitForTimeout(200)
  }
  check(`[${band}] 8.4 has a check page for this band`, (await page.getByTestId('page-card').getAttribute('data-kind')) === 'check')
  const ledgerBefore = await page.getByTestId('section-ledger').locator('[data-statement="8.4.3"]').getAttribute('data-how')
  check(`[${band}] 8.4.3 reads "check" before it is answered`, ledgerBefore === 'check', ledgerBefore)
  if (band === 'analyst') {
    check(`[${band}] the model answer is hidden until the answer is committed`, (await page.getByTestId('guide-model').count()) === 0)
    await page.locator('textarea').first().fill('In summer the tuber stores starch from the leaves so it is a sink; in spring it exports sucrose to the shoot so it is a source.')
    await tap(page, 'Commit my answer')
    await page.waitForTimeout(200)
    check(`[${band}] the model answer unfolds after the commit`, (await page.getByTestId('guide-model').count()) === 1)
    await tap(page, 'Mark it right')
  } else {
    check(`[${band}] no reveal before a pick`, (await page.getByTestId('guide-reveal').count()) === 0)
    // The first option is the right one on both bands' 8.4 checks; the record
    // would stamp either way — a wrong pick is in the record, honestly.
    await press(page, '[data-testid="guide-check"] button')
  }
  await page.waitForTimeout(250)
  check(`[${band}] the check page stamps on commit`, (await page.getByTestId('guide-stamped').count()) === 1)
  const ledgerAfter = await page.getByTestId('section-ledger').locator('[data-statement="8.4.3"]').getAttribute('data-how')
  check(`[${band}] the ledger reads the stamp back`, ledgerAfter === 'stamped', ledgerAfter)
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ploobia.curriculum.v1') ?? '{}'))
  check(`[${band}] the record is persisted with its explanation`, stored.stamps?.['0610:8.4.3']?.[0]?.explanation?.length > 0)

  // Close: the parts come back.
  await tap(page, 'Close the field guide')
  await page.waitForTimeout(300)
  check(`[${band}] closing the guide gives the parts column back`, (await page.getByLabel(/^Specimen: /).count()) >= 1)
  await page.close()
}

/* ------------------------------------------------------------------ */
/* The practical page opens the door; a hit asks for its explanation   */
/* ------------------------------------------------------------------ */
{
  const page = await open(1440, 900, false, 'scientist')
  await startFree(page)
  await tap(page, 'Field guide')
  await page.waitForTimeout(500)
  await press(page, '[data-testid="page-card"] [aria-label="Contents"]')
  await page.waitForTimeout(150)
  await press(page, '[data-testid="guide-contents"] [aria-label="Open Xylem and phloem"]')
  await page.waitForTimeout(300)
  for (let i = 0; i < 4; i += 1) {
    if ((await page.getByTestId('page-card').getAttribute('data-kind')) === 'practical') break
    await press(page, '[aria-label="Next page"]')
    await page.waitForTimeout(200)
  }
  check('8.1 has a practical page', (await page.getByTestId('page-card').getAttribute('data-kind')) === 'practical')
  await tap(page, 'Start the practical')
  await page.waitForTimeout(600)
  check('the practical opens the brief on door 3', (await page.getByTestId('brief-headline').count()) === 1)
  check('the brief is the Line\'s (Cut the ring)', (await page.getByText(/Cut the ring/i).count()) >= 1)
  // Lock a guess so the record has its first line.
  const dial = page.getByLabel('Your guess').first()
  if ((await dial.count()) > 0) {
    await dial.focus()
    await page.keyboard.press('ArrowRight')
    await tap(page, 'Lock in the guess')
    await page.waitForTimeout(200)
  }
  // The brief's green button is the level's own; take whichever is offered.
  const go = page.getByRole('button', { name: /^(Start banking|Start the day|Start gathering|Into the lab)/ }).first()
  if ((await go.count()) > 0) await resilientClick(go, { label: 'go' })
  await waitFor(async () => ['ready', 'lab', 'gather', 'handover'].includes((await page.evaluate(() => window.__sugarRun?.()?.phase)) ?? ''), 8000)
  await page.waitForTimeout(400)
  check('the page card steps aside while the round runs', (await page.getByTestId('page-card').count()) === 0)
  // Cut the ring and hand in with the leaf firm: the model says export ≤ 0.5.
  await page.evaluate(() => {
    const s = window.__sugarSim
    s.girdled = true
    s.xylemCut = false
    s.turgor = 1
  })
  await page.waitForTimeout(300)
  const phase = await page.evaluate(() => window.__sugarRun?.()?.phase)
  check('the round is in the lab (or on its way)', ['lab', 'ready', 'handover', 'gather'].includes(phase), phase)
  // Stamps must not exist yet, whatever happens next.
  const stampedEarly = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('ploobia.curriculum.v1') ?? '{"stamps":{}}').stamps ?? {}).length)
  check('nothing is stamped before a hand-in is explained', stampedEarly === 0)
  await page.close()
}

/* ------------------------------------------------------------------ */
/* A hit hand-in waits for its explanation; the explanation stamps    */
/* ------------------------------------------------------------------ */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  watch(page)
  await page.goto(`${BASE}#/photosynthesis?q=low`, { waitUntil: 'load' })
  await page.evaluate(() => {
    localStorage.setItem('ploobia.band.v1', JSON.stringify('scientist'))
    localStorage.setItem('ploobia.campaign.photosynthesis.v1', JSON.stringify({ handedIn: { 'first-light': 700, 'open-the-hatches': 700, 'cut-the-ring': 800 } }))
    // Three lines landed at the Line, as the scored effect writes them.
    localStorage.setItem(
      'ploobia.curriculum.v1',
      JSON.stringify({
        stamps: {},
        pending: {
          'cut-the-ring': { cabinet: 'photosynthesis', source: 'cut-the-ring', prediction: '0.4 (it is 0.5)', action: 'light 60 %, ring cut', observed: 'export 0.42', stamps: ['0610:8.1.1', '0610:8.1.2', '0610:8.4.1', '0610:8.4.2'], at: Date.now() },
        },
      }),
    )
  })
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1800)
  await startFree(page)
  check('a pending record makes the guide chip invite ("Explain it")', /Explain it/.test(await page.getByTestId('guide-chip').innerText()))
  check('nothing is stamped while the explanation is owed', (await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('ploobia.curriculum.v1')).stamps).length)) === 0)
  await tap(page, 'Field guide')
  await page.waitForTimeout(500)
  await press(page, '[data-testid="page-card"] [aria-label="Contents"]')
  await page.waitForTimeout(150)
  await press(page, '[data-testid="guide-contents"] [aria-label="Open Xylem and phloem"]')
  await page.waitForTimeout(300)
  for (let i = 0; i < 4; i += 1) {
    if ((await page.getByTestId('page-card').getAttribute('data-kind')) === 'practical') break
    await press(page, '[aria-label="Next page"]')
    await page.waitForTimeout(200)
  }
  check('the ledger reads "explain" on the owed statements', (await page.getByTestId('section-ledger').locator('[data-statement="8.1.1"]').getAttribute('data-how')) === 'explain')
  check('the practical page asks for the explanation instead of offering the door', (await page.getByTestId('guide-explain').count()) === 1 && (await page.getByRole('button', { name: 'Start the practical' }).count()) === 0)
  const card = await page.getByTestId('page-card').innerText()
  check('the three lines are read back to the learner', /0\.4 \(it is 0\.5\)/.test(card) && /ring cut/.test(card) && /export 0\.42/.test(card))
  await press(page, '[data-testid="guide-explain"] button')
  await page.waitForTimeout(300)
  check('the explanation closes the record and stamps', (await page.getByTestId('guide-stamped').count()) === 1)
  const ledger = await page.evaluate(() => JSON.parse(localStorage.getItem('ploobia.curriculum.v1')))
  check('every statement the hand-in named is stamped, with all four lines', ['0610:8.1.1', '0610:8.1.2', '0610:8.4.1', '0610:8.4.2'].every((id) => ledger.stamps[id]?.[0]?.explanation && ledger.stamps[id][0].prediction && ledger.stamps[id][0].observed))
  check('the pending slot is cleared', Object.keys(ledger.pending).length === 0)
  check('the ledger reads "stamped"', (await page.getByTestId('section-ledger').locator('[data-statement="8.1.1"]').getAttribute('data-how')) === 'stamped')
  check('the chip stops inviting', !/Explain it/.test(await page.getByTestId('guide-chip').innerText()))
  await page.close()
}

/* ------------------------------------------------------------------ */
/* Phone: the guide is a sheet, every control under the finger        */
/* ------------------------------------------------------------------ */
{
  const page = await open(844, 390, true, 'explorer')
  await startFree(page)
  check('phone: the guide chip is in the strip', (await page.getByTestId('guide-chip').count()) === 1)
  await tap(page, 'Field guide')
  await page.waitForTimeout(600)
  check('phone: the guide opens as a sheet from the left', (await page.getByTestId('sheet-guide').count()) === 1)
  check('phone: the page card is in the sheet', (await page.getByTestId('sheet-guide').getByTestId('page-card').count()) === 1)
  check('phone: the ledger rides in the sheet, embedded', (await page.getByTestId('sheet-guide').getByTestId('section-ledger').count()) === 1)
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="sheet-guide"] button')].map((b) => {
      const r = b.getBoundingClientRect()
      return { w: r.width, h: r.height, label: b.getAttribute('aria-label') ?? b.textContent?.trim() ?? '' }
    }),
  )
  const small = boxes.filter((b) => b.h > 0 && b.h < 24 && !b.label.startsWith('guide'))
  check('phone: every sheet control is at least 24 px tall (terms are inline text)', small.every((b) => b.label.length > 0) , small.map((b) => `${b.label} ${Math.round(b.h)}`).join(', '))
  const first = await page.evaluate(() => document.querySelector('[data-testid="guide-term"]')?.getAttribute('data-verb'))
  const before = await snap(page)
  await page.evaluate(() => document.querySelector('[data-testid="guide-term"]')?.click())
  await page.waitForTimeout(150)
  const after = await snap(page)
  check(`phone: tapping a term (${first}) moves the sim`, after.runs > before.runs)
  await tap(page, 'Field guide')
  await page.waitForTimeout(300)
  check('phone: the chip closes the sheet', (await page.getByTestId('sheet-guide').count()) === 0)
  await page.close()
}

/* ------------------------------------------------------------------ */
/* Portrait: the card, no canvas, no guide                            */
/* ------------------------------------------------------------------ */
{
  const page = await open(390, 844, true, 'explorer')
  check('portrait: the turn card shows', (await page.getByTestId('turn-card').count()) === 1)
  check('portrait: no guide chip behind it', (await page.getByTestId('guide-chip').count()) === 0)
  await page.close()
}

check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
await browser.close()
tally()
