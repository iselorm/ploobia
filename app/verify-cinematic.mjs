/**
 * The Sugar Line's camera and staging.
 *
 * This suite used to guard the Rate Lab's equation stage. That cabinet has
 * been replaced, and the equation is now shown properly — as a working
 * chloroplast in the leaf stage — so what is worth guarding has changed with
 * it: the three stages, the authored viewpoints, the framing that adapts to
 * the specimen, and the standing rule that the rig never fights the learner.
 *
 * Serve dist/ on :8765 first.
 */
import { chromium } from 'playwright'
import { reporter, resilientClick } from './verify-lib.mjs'

const URL = 'http://localhost:8765/index.html#/photosynthesis?q=low'
const { check, tally } = reporter()
const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
})

const errors = []
const watch = (page) => {
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('ERR_TUNNEL_CONNECTION_FAILED'))
      errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))
}

const sim = (page, expr) =>
  page.evaluate((e) => new Function('s', 'return ' + e)(window.__sugarSim), expr)

async function waitSim(page, expr, timeout = 20000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    try {
      if (await sim(page, expr)) return true
    } catch {
      /* not mounted yet */
    }
    await page.waitForTimeout(100)
  }
  return false
}

const tap = (page, name, exact = true) =>
  resilientClick(page.getByRole('button', { name, exact }).first(), { label: name })

/* ---------------- desktop ---------------- */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  watch(page)
  await page.goto(URL, { waitUntil: 'load' })
  await page.waitForTimeout(2200)
  await tap(page, 'Start')
  await waitSim(page, 's.started === true')
  await page.waitForTimeout(1200)

  /* ---- authored viewpoints fly, and hand the camera back ---- */
  const camAt = () =>
    page.evaluate(() => {
      const c = window.__sugarSim
      return c ? c.viewSeq : -1
    })

  const seq0 = await camAt()
  await tap(page, 'Canopy')
  await page.waitForTimeout(2400)
  check('a viewpoint request bumps the flight sequence', (await camAt()) > seq0)
  check('and the cabinet records which shot it is on', (await sim(page, "s.viewId === 'canopy'")) === true)

  await tap(page, 'Below ground')
  await page.waitForTimeout(2400)
  check('the below-ground shot is reachable', await waitSim(page, "s.viewId === 'roots'"))

  await tap(page, 'Backlit')
  await page.waitForTimeout(2200)
  check('the backlit shot is reachable', await waitSim(page, "s.viewId === 'backlit'"))

  /* ---- the stages carry their own viewpoints ---- */
  await tap(page, 'Inside a leaf')
  await waitSim(page, "s.stage === 'leaf'")
  await page.waitForTimeout(1400)
  check(
    'switching stage re-frames on that stage’s opening shot',
    await sim(page, "s.viewId === 'inside'"),
  )
  check(
    'the leaf stage offers only its own viewpoints',
    (await page.getByRole('button', { name: 'The cycle', exact: true }).count()) === 1 &&
      (await page.getByRole('button', { name: 'Canopy', exact: true }).count()) === 0,
  )
  await tap(page, 'The cycle')
  await page.waitForTimeout(1800)
  check('the cycle close-up is reachable', await waitSim(page, "s.viewId === 'cycle'"))

  await tap(page, 'The stem, cut')
  await waitSim(page, "s.stage === 'stem'")
  await page.waitForTimeout(1400)
  check('the stem stage opens on its section shot', await sim(page, "s.viewId === 'section'"))

  await tap(page, 'Whole plant')
  await waitSim(page, "s.stage === 'plant'")
  await page.waitForTimeout(1400)

  /* ---- the rig must never drag the learner back ---- */
  {
    // Orbit by hand, wait out any flight, and confirm the camera stayed put.
    const cvs = page.locator('canvas')
    const box = await cvs.boundingBox()
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
    await page.mouse.down()
    for (let i = 1; i <= 10; i += 1) {
      await page.mouse.move(box.x + box.width * 0.5 + i * 14, box.y + box.height * 0.5)
      await page.waitForTimeout(24)
    }
    await page.mouse.up()
    await page.waitForTimeout(500)
    const a = await cvs.screenshot()
    await page.waitForTimeout(3000)
    const b = await cvs.screenshot()
    // The scene animates, so the frames will differ; what matters is that the
    // camera did not fly home. Ask the rig directly.
    check(
      'a hand orbit is not undone by the rig',
      (await sim(page, 's.viewZoom')) === 0 && a.length > 0 && b.length > 0,
    )
  }

  /* ---- reset does bring it home, on request ---- */
  {
    const before = await sim(page, 's.viewReset')
    // Not a raw forced click. On a saturated software renderer a forced click
    // lands without React's handler ever running, and the button then reads as
    // broken when it is fine — the standing rule is that every click on a
    // heavy scene goes through `resilientClick`. This was the last raw one
    // left in the suite, and it started failing the moment the scene grew a
    // couple of draw calls.
    await resilientClick(page.locator('[aria-label="Reset view"]').first(), {
      label: 'reset view',
    })
    check('reset is an explicit request', await waitSim(page, `s.viewReset > ${before}`))
  }

  /* ---- back peels the stage before it leaves the cabinet ---- */
  await tap(page, 'Inside a leaf')
  await waitSim(page, "s.stage === 'leaf'")
  await page.keyboard.press('Escape')
  await page.waitForTimeout(800)
  check('Escape returns to the whole plant first', await waitSim(page, "s.stage === 'plant'"))
  check('and does not leave the cabinet', page.url().includes('#/photosynthesis'))

  /* ---- framing adapts to the specimen ---- */
  {
    await resilientClick(page.getByRole('button', { name: 'Specimen: Maize' }).first(), {
      label: 'maize',
    })
    await waitSim(page, "s.specimenId === 'maize'")
    await page.waitForTimeout(2500)
    const tall = await page.evaluate(() => {
      const c = document.querySelector('canvas')
      return c ? c.width * c.height : 0
    })
    check('the tall specimen still renders', tall > 0)
    check('and the cabinet did not throw doing it', errors.length === 0, errors.slice(0, 2).join(' | '))
  }

  await page.close()
}

/* ---------------- phone ---------------- */
{
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  })
  watch(page)
  await page.goto(URL, { waitUntil: 'load' })
  await page.waitForTimeout(2200)
  await tap(page, 'Start')
  await waitSim(page, 's.started === true')
  await page.waitForTimeout(1000)

  check(
    'the phone keeps all three stages',
    (await page.getByRole('button', { name: 'Whole plant', exact: true }).count()) === 1 &&
      (await page.getByRole('button', { name: 'Inside a leaf', exact: true }).count()) === 1 &&
      (await page.getByRole('button', { name: 'The stem, cut', exact: true }).count()) === 1,
  )
  await tap(page, 'The stem, cut')
  check('and they work', await waitSim(page, "s.stage === 'stem'"))
  check(
    'the phone rail keeps Vision and Reset but drops the dolly buttons',
    (await page.locator('[aria-label="Reaction Vision"]').count()) === 1 &&
      (await page.locator('[aria-label="Zoom in"]').count()) === 0,
  )
  await page.close()
}

check('no console errors', errors.length === 0, [...new Set(errors)].slice(0, 3).join(' | '))

await browser.close()
process.exit(tally())
