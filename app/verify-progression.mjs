import { chromium, devices } from 'playwright'
import { resilientClick } from './verify-lib.mjs'

const BASE = 'http://localhost:8765/index.html'
const out = (n) => `/tmp/arcade/shots/${n}.png`
const results = []
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })

/* ---------- Desktop end-to-end ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text())
  })
  try {
    // Hall
    await page.goto(`${BASE}#/`)
    await page.waitForTimeout(1200)
    await page.screenshot({ path: out('p3-01-hall') })
    check('hall shows four cabinets', (await page.getByText(/Sugar Line|Blood Voyage|Motion Yard|River|Atom Foundry|Circuit/).count()) >= 4)
    // The hall grows: assert that *some* cabinet is still under the mist, not an exact count.
    check('locked cabinets marked coming soon', (await page.getByText('Coming soon').count()) >= 1)
    check('sponsor plaques present', (await page.getByText(/Sponsor this cabinet/).count()) >= 2)
    check('progress chip in hall header', (await page.getByLabel(/Your progress/).count()) === 1)
    // attract mode after idle
    await page.waitForTimeout(7500)
    const demoTag = await page.getByText('Demo', { exact: true }).count()
    check('attract mode lights a cabinet after idle', demoTag >= 1)
    await page.screenshot({ path: out('p3-02-hall-attract') })

    // Watch demo link opens cabinet in demo mode
    await page.getByRole('link', { name: /watch it play itself/i }).first().click()
    const skip = page.getByRole('button', { name: /skip/i }).first()
    await skip.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {})
    check('demo link starts the guided demo', (await skip.count()) >= 1)
    await page.screenshot({ path: out('p3-03-demo-autostart') })
    // The biology cabinet renders at about a frame a second under SwiftShader
    // and a plain click cannot complete inside any sane timeout, though the
    // button is perfectly fine.
    await resilientClick(skip, { label: 'demo skip' })
    await page.waitForTimeout(1500)

    // Run one real trial: commit a prediction, start the trial, wait for the
    // reading. The Sugar Line commits a point prediction on its own dial
    // rather than by clicking the graph.
    // Drive the dial by its *thumb* and the keyboard, which is the house rule
    // for Radix sliders. Clicking the track works, but it depends on the plate
    // having finished re-laying out after the demo tore its readings down —
    // and a click that lands mid-layout looks exactly like a broken control.
    const thumb = page.locator('[aria-label="Predicted reading"] [data-slot="slider-thumb"]').first()
    await thumb.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {})
    await resilientClick(thumb, { label: 'prediction thumb' })
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(120)
    }
    await page.waitForTimeout(600)
    const evAfterPredict = await page.evaluate(() => JSON.parse(localStorage.getItem('ploobia.events.v1') || '[]').map((e) => e.type))
    check('prediction.committed logged', evAfterPredict.includes('prediction.committed'), evAfterPredict.join(','))
    await resilientClick(page.getByRole('button', { name: /run measurement/i }).first(), {
      label: 'run measurement',
    })
    // wait for the trial to finish (6 s on hardware; SwiftShader can take far longer) — poll up to 120 s
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(2000)
      const has = await page.evaluate(() => JSON.parse(localStorage.getItem('ploobia.events.v1') || '[]').some((e) => e.type === 'reading.recorded'))
      if (has) break
    }
    await page.waitForTimeout(1500)
    const evAfterTrial = await page.evaluate(() => JSON.parse(localStorage.getItem('ploobia.events.v1') || '[]').map((e) => e.type))
    check('reading.recorded logged after trial', evAfterTrial.includes('reading.recorded'), evAfterTrial.join(','))
    check('mission.completed logged from evidence', evAfterTrial.includes('mission.completed'), '')
    check('demo.watched logged (skipped)', evAfterTrial.includes('demo.watched'))
    check('session.started logged', evAfterTrial.includes('session.started'))
    await page.screenshot({ path: out('p3-04-after-trial') })
    // Progress chip reflects XP
    const chipText = await page.getByLabel(/^Progress:/).first().textContent()
    check('progress chip shows non-zero standing', /[1-9]/.test(chipText || ''), chipText)

    // Home digest
    await page.goto(`${BASE}#/home`)
    await page.waitForTimeout(800)
    await page.screenshot({ path: out('p3-05-home'), fullPage: true })
    const readingsTile = await page.locator('text=Readings').first().locator('..').textContent()
    check('digest counts readings this week', /[1-9]/.test(readingsTile || ''), readingsTile)
    check('dinner question rendered', (await page.getByText(/Something to ask at dinner/).count()) === 1)
    check('skill bars rendered', (await page.getByText(/Controlling variables/).count()) >= 1)
    // Add learner and switch — events are per profile
    await page.getByRole('button', { name: /add a learner/i }).click()
    await page.getByPlaceholder(/Kofi/).fill('Ama')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await page.waitForTimeout(400)
    const readingsTile2 = await page.locator('text=Readings').first().locator('..').textContent()
    check('new learner starts with an empty digest', /^0/.test(readingsTile2 || ''), readingsTile2)
    check('band store follows the new learner (Explorer)', (await page.getByText(/Explorer ·/).count()) >= 1)
    // Support card via ?support=1
    await page.goto(`${BASE}#/home?support=1`)
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: /GH₵25/ }).click()
    check('support amounts render and acknowledge (mock)', (await page.getByText(/nothing was charged/).count()) === 1)
    await page.screenshot({ path: out('p3-06-support'), fullPage: true })

    // Persistence across reload
    await page.goto(`${BASE}#/`)
    await page.reload()
    await page.waitForTimeout(1200)
    const impact = await page.getByText(/This device has run/).count()
    check('hall impact line survives reload (persistence)', impact === 1)
    check('no console errors (desktop e2e)', errors.length === 0, errors.slice(0, 3).join(' | '))
  } catch (e) {
    // Keep the call log. The first line of a Playwright timeout says only
    // "locator.dispatchEvent timed out" — which locator is in the lines under
    // it, and without them a crash here is undiagnosable and gets waved away
    // as flakiness. It was not flakiness the last two times it was checked.
    const detail = String(e)
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith('    at '))
      .slice(0, 4)
      .join(' ⏎ ')
    results.push('FAIL desktop section crashed — ' + detail)
    await page.screenshot({ path: out('p3-crash') }).catch(() => {})
  }
  await ctx.close()
}

/* ---------- Phone hall + home ---------- */
{
  const ctx = await browser.newContext({ ...devices['Pixel 7'] })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  try {
    await page.goto(`${BASE}#/`)
    await page.waitForTimeout(1200)
    await page.screenshot({ path: out('p3-07-hall-phone'), fullPage: true })
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    check('hall has no horizontal page overflow on phone', scrollW)
    await page.goto(`${BASE}#/home`)
    await page.waitForTimeout(800)
    await page.screenshot({ path: out('p3-08-home-phone'), fullPage: true })
    check('no page errors (phone)', errors.length === 0, errors.slice(0, 2).join(' | '))
  } catch (e) {
    results.push('FAIL phone section crashed — ' + String(e).split('\n')[0])
  }
  await ctx.close()
}

await browser.close()
console.log(results.join('\n'))
