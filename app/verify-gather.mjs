/**
 * The challenge layer, driven through its real controls.
 *
 * Serve dist/ on :8765 first (python3 -m http.server 8765 in dist).
 *
 * The economy and the scoring are checked out of band by
 * `verify-challenge.mjs`, which can run the model thousands of times in a
 * second. This suite exists for the claims that only a browser can settle:
 * that the opt-in really is opt-in, that the gather round can be *played* with
 * a pointer, that the dials actually stop where the gathering ran out, that a
 * trial draws the bank down, and that a link carries a challenge to someone
 * else's browser.
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

const sim = (page, expr) =>
  page.evaluate(
    (e) => new Function('s', 'solve', 'return ' + e)(window.__sugarSim, window.__sugarSolve()),
    expr,
  )

/** The live challenge run, straight out of the hook. */
const run = (page) => page.evaluate(() => window.__sugarRun?.() ?? null)

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
  resilientClick(page.getByRole('button', { name, exact: opts.exact ?? true }).first(), {
    label: name,
  })

async function open(width, height, touch = false, hash = '#/photosynthesis?q=low') {
  const page = await browser.newPage({
    viewport: { width, height },
    hasTouch: touch,
    isMobile: touch,
  })
  watch(page)
  await page.goto(`${BASE}${hash}`, { waitUntil: 'load' })
  await page.waitForTimeout(1800)
  return page
}

async function start(page) {
  await page
    .getByRole('button', { name: 'Start', exact: true })
    .first()
    .waitFor({ timeout: 30000 })
    .catch(() => {})
  await tap(page, 'Start')
  await waitFor(async () => await sim(page, 's.started === true'))
  await page.waitForTimeout(600)
}

/**
 * Play the gather round the way a finger does: sweep the pointer across the
 * canvas so the collector passes through where things are falling.
 *
 * Counted in **moves, not seconds**. Under SwiftShader a single
 * `mouse.move` can take the better part of a second to round-trip, so a
 * wall-clock budget yields a dozen pointer positions and then reports a
 * mechanic that works as one that does not. Moves are what the game actually
 * consumes, and they are the same number on a fast machine and a slow one.
 *
 * It stops if the round ends underneath it, so a slow host cannot turn this
 * into a test of what happens after the timer.
 */
async function sweepPointer(page, moves) {
  const box = await page.locator('canvas').first().boundingBox()
  for (let k = 0; k < moves; k++) {
    // A lissajous path covers the frame without ever retracing the same line,
    // which is what a person waving at falling motes actually does.
    const u = k / 9
    const x = box.x + box.width * (0.5 + 0.42 * Math.sin(u * 1.7))
    const y = box.y + box.height * (0.45 + 0.34 * Math.sin(u * 1.1 + 1))
    await page.mouse.move(x, y)
    if (k % 12 === 11 && (await run(page)).phase !== 'gather') return k
  }
  return moves
}

/* ================================================================== */
/* The lab is untouched until you ask for a challenge                 */
/* ================================================================== */
{
  const page = await open(1440, 900)
  await start(page)

  const r0 = await run(page)
  check('a fresh cabinet is not in a challenge', r0 && r0.phase === 'off', String(r0?.phase))
  check('no timer is on screen', (await page.getByText(/^\d+\.\d s$/).count()) === 0)
  check(
    'nothing caps the dials in the plain lab',
    r0 && r0.caps === null,
    JSON.stringify(r0?.caps),
  )
  check(
    'and the way in is one chip, not an interstitial',
    (await page.getByRole('button', { name: 'Challenge' }).count()) === 1,
  )

  /* ---- open the brief ---- */
  await tap(page, 'Challenge')
  await page.waitForTimeout(500)
  check('the brief opens', (await run(page)).phase === 'brief')
  check(
    'it offers more than one brief to choose from',
    (await page.getByText('First light').count()) >= 1 &&
      (await page.getByText('Land it exactly').count()) >= 1,
  )
  check(
    'and a room code box, so a class can share one world',
    (await page.getByLabel('Room code').count()) === 1,
  )

  // Backing out must leave the cabinet exactly as it was.
  await tap(page, 'Close the challenge brief')
  await page.waitForTimeout(400)
  check('closing the brief returns to the plain lab', (await run(page)).phase === 'off')

  await page.close()
}

/* ================================================================== */
/* A full run: gather, spend, hand in                                 */
/* ================================================================== */
{
  const page = await open(1440, 900)
  await start(page)
  await tap(page, 'Challenge')
  await page.waitForTimeout(400)

  // A typed room code must produce a reproducible world, and the brief has to
  // show which one before the learner commits to it.
  await page.getByLabel('Room code').fill('MANGO')
  await page.waitForTimeout(300)
  check('a room code names a room', (await page.getByText(/^Room [A-Z0-9]{5}$/).count()) >= 1)

  await tap(page, 'Start gathering')
  await waitFor(async () => (await run(page)).phase === 'gather')
  const g0 = await run(page)
  check('the gather round starts', g0.phase === 'gather')
  check('the clock is set from the brief', g0.secondsLeft > 0)
  check(
    'the lab HUD stands down so the whole screen is playfield',
    (await page.getByRole('button', { name: 'Run measurement' }).count()) === 0,
  )
  check('the bank starts empty', Object.values(g0.bank).every((v) => v === 0))

  /* ---- the drag belongs to the game, not to the camera ---- */
  {
    // A drag across the glass is both the orbit gesture and the catch gesture.
    // With orbit live, every sweep tumbles the scene under the collector and
    // the round is unplayable — and nothing overlaps, nothing is off screen,
    // so no geometry check can see it. Only this can.
    const before = await page.evaluate(() => {
      const c = window.__sugarCam
      return c ? [c.position.x, c.position.y, c.position.z] : null
    })
    const box = await page.locator('canvas').first().boundingBox()
    await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.35)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.65, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(700)
    const after = await page.evaluate(() => {
      const c = window.__sugarCam
      return c ? [c.position.x, c.position.y, c.position.z] : null
    })
    const moved = before && after ? Math.hypot(...before.map((v, i) => v - after[i])) : -1
    check(
      'dragging during the round does not spin the camera',
      moved >= 0 && moved < 0.05,
      `camera moved ${moved.toFixed(3)}`,
    )
  }

  await sweepPointer(page, 48)
  const g1 = await run(page)
  const banked = Object.values(g1.bank).reduce((a, b) => a + b, 0)
  check('sweeping the collector banks resources', banked > 0, JSON.stringify(g1.bank))
  check(
    'and never more than the brief offers',
    Object.keys(g1.bank).every((k) => g1.bank[k] <= g1.challenge.budget[k] + 1e-6),
  )
  check('the clock is running down', g1.secondsLeft < g0.secondsLeft)

  await tap(page, 'To the lab')
  await waitFor(async () => (await run(page)).phase === 'lab')
  const lab = await run(page)
  check('finishing early opens the lab', lab.phase === 'lab')
  check('what was banked becomes the grant', lab.granted.light === g1.bank.light)
  check('and the grant sets a ceiling on the dials', lab.caps !== null && lab.caps.light <= 1)

  /* ---- and the camera is handed back when the round ends ---- */
  {
    const before = await page.evaluate(() => {
      const c = window.__sugarCam
      return c ? [c.position.x, c.position.y, c.position.z] : null
    })
    const box = await page.locator('canvas').first().boundingBox()
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(700)
    const after = await page.evaluate(() => {
      const c = window.__sugarCam
      return c ? [c.position.x, c.position.y, c.position.z] : null
    })
    const moved = before && after ? Math.hypot(...before.map((v, i) => v - after[i])) : -1
    check(
      'and the orbit is handed back in the lab',
      moved > 0.05,
      `camera moved ${moved.toFixed(3)}`,
    )
  }

  /* ---- the ceiling is real, not decorative ---- */
  const ceiling = lab.caps.light
  {
    // Driven through the real dial, not by poking a value into state. The
    // first version of this check reached for an `input[type=range]` that does
    // not exist — the dial is a Radix slider — so it silently changed nothing
    // and then passed, because zero is under every ceiling. A control test
    // that cannot fail is worse than no test.
    const track = page
      .locator('[aria-label="Light intensity"] [data-slot="slider-track"]')
      .first()
    check('the light dial is on screen during a challenge', (await track.count()) === 1)
    const box = await track.boundingBox()
    // Shoved hard against the right-hand end, which is full sun.
    await page.mouse.click(box.x + box.width * 0.98, box.y + box.height / 2)
    await page.waitForTimeout(600)
    const pushed = await sim(page, 's.light')
    check(
      'the light dial stops where the gathering ran out',
      pushed <= ceiling + 1e-6,
      `dial ${pushed.toFixed(3)} vs ceiling ${ceiling.toFixed(3)}`,
    )
    check(
      'and it does reach that ceiling, rather than being stuck',
      pushed > ceiling - 0.02,
      `dial ${pushed.toFixed(3)} vs ceiling ${ceiling.toFixed(3)}`,
    )
  }

  /* ---- a trial draws the bank down ---- */
  const before = (await run(page)).bank.light
  await tap(page, 'Run measurement')
  await waitFor(async () => (await run(page)).trials >= 1, 90000)
  const after = await run(page)
  check('a recorded trial counts', after.trials === 1, String(after.trials))
  check('and is paid for out of the bank', after.bank.light < before, `${before} → ${after.bank.light}`)
  check('the goal metric is read off the model', typeof after.best === 'number')
  check(
    'the ceiling does not fall as the bank drains',
    Math.abs(after.caps.light - ceiling) < 1e-9,
    `${after.caps.light} vs ${ceiling}`,
  )

  /* ---- and the reading still lands in the learner's own evidence ---- */
  check(
    'a challenge trial is still a real reading',
    (await page.evaluate(() => document.body.innerText.includes('Sugar export'))) === true,
  )

  /* ---- hand it in ---- */
  await page.getByRole('button', { name: /Hand it in/ }).first().waitFor({ timeout: 15000 })
  await resilientClick(page.getByRole('button', { name: /Hand it in/ }).first(), {
    label: 'Hand it in',
  })
  await waitFor(async () => (await run(page)).phase === 'scored')
  const scored = await run(page)
  check('handing in scores the run', scored.phase === 'scored' && scored.score !== null)
  check(
    'the score is inside its range',
    scored.score.total >= 0 && scored.score.total <= 1000,
    String(scored.score.total),
  )
  check(
    'the card shows why, not just a number',
    (await page.getByText('Accuracy').count()) >= 1 &&
      (await page.getByText('Economy').count()) >= 1 &&
      (await page.getByText('Thrift').count()) >= 1,
  )
  check(
    'and says plainly that nothing was scored on speed',
    (await page.getByText(/scored on speed/i).count()) >= 1,
  )
  check(
    'there is a way to send it to someone',
    (await page.getByRole('button', { name: /Challenge a friend/ }).count()) === 1,
  )
  // A miss has two causes and they need different advice. When the gather came
  // up short the card has to say so, or a learner reads a hard ceiling as a
  // broken cabinet and goes back to fiddling with reasoning that was fine.
  if (!scored.score.hit) {
    const keys = Object.keys(scored.challenge.budget).filter((k) => scored.challenge.budget[k] > 0)
    const share =
      keys.reduce((n, k) => n + Math.min(1, (scored.granted[k] ?? 0) / scored.challenge.budget[k]), 0) /
      keys.length
    if (share < 0.6) {
      check(
        'a miss after a thin gather names the ceiling as the reason',
        (await page.getByText(/You gathered about \d+% of what was on offer/).count()) >= 1,
        `gathered ${Math.round(share * 100)}%`,
      )
    }
  }

  await page.close()
}

/* ================================================================== */
/* A challenge that arrives in a link                                 */
/* ================================================================== */
{
  // Built by hand in the encoder's own format, so this tests the wire format
  // and not a value that happens to have survived a round trip in one tab.
  const enc = [
    '1',
    'photosynthesis',
    (123456).toString(36),
    'bean',
    'scientist',
    'export',
    'near',
    '12',
    '0.4',
    'mg h⁻¹',
    '40',
    'co2~350!light~1500!water~40',
    'Ama',
  ]
    .map(encodeURIComponent)
    .join(',')

  const page = await open(1440, 900, false, `#/photosynthesis?q=low&c=${enc}&r=612`)
  await page.waitForTimeout(1200)
  const r = await run(page)
  check('a link opens straight into the brief', r && r.phase === 'brief', String(r?.phase))
  check(
    'and says who sent it',
    (await page.getByText(/set by Ama/).count()) >= 1,
  )
  check(
    'and what there is to beat',
    (await page.getByText(/Score to beat: 612/).count()) >= 1,
  )
  check(
    'the goal survived the wire intact',
    (await page.getByText(/within 0\.4 of 12 mg/).count()) >= 1,
  )

  await page.close()
}

/* ================================================================== */
/* Portrait: the round has to be playable on the phone it was made for */
/* ================================================================== */
{
  const page = await open(390, 844, true)
  await start(page)
  await tap(page, 'Challenge')
  await page.waitForTimeout(400)
  await tap(page, 'Start gathering')
  await waitFor(async () => (await run(page)).phase === 'gather')

  // The HUD must not eat the pointer, or the game cannot be played at all.
  const centre = await page.evaluate(() => {
    const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)
    return el ? el.tagName : null
  })
  check('the middle of the screen is the playfield, not a panel', centre === 'CANVAS', String(centre))

  const timerRow = await page.evaluate(() => {
    const el = document.elementFromPoint(window.innerWidth / 2, 120)
    return el ? el.tagName : null
  })
  check('and so is the space under the clock strip', timerRow === 'CANVAS', String(timerRow))

  // Every button in the round has to be reachable with a thumb.
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter((b) => b.offsetParent !== null)
      .map((b) => ({ t: (b.innerText || b.ariaLabel || '?').slice(0, 24), r: b.getBoundingClientRect() }))
      .filter((b) => b.r.width > 0 && (b.r.height < 40 || b.r.width < 40))
      .map((b) => `${b.t} ${Math.round(b.r.width)}×${Math.round(b.r.height)}`),
  )
  check('every control in the round is thumb-sized', small.length === 0, small.join(' | '))

  const offscreen = await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter((b) => b.offsetParent !== null)
      .map((b) => ({ t: (b.innerText || b.ariaLabel || '?').slice(0, 24), r: b.getBoundingClientRect() }))
      .filter((b) => b.r.bottom > window.innerHeight || b.r.top < 0 || b.r.right > window.innerWidth)
      .map((b) => `${b.t} @${Math.round(b.r.top)}`),
  )
  check('and none of it is off the screen', offscreen.length === 0, offscreen.join(' | '))

  await sweepPointer(page, 36)
  check('the round can be played with a finger', Object.values((await run(page)).bank).some((v) => v > 0))

  await tap(page, 'To the lab')
  await waitFor(async () => (await run(page)).phase === 'lab')
  await page.waitForTimeout(600)

  const bar = await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find((b) =>
      (b.ariaLabel || '').includes('challenge strip'),
    )
    if (!el) return null
    const card = el.closest('.atlas-plate').getBoundingClientRect()
    return { top: card.top, bottom: card.bottom, h: card.height }
  })
  check('the lab strip is on screen', bar !== null && bar.top >= 0 && bar.bottom <= 844, JSON.stringify(bar))
  check(
    'and opens as one line rather than covering the specimen',
    bar !== null && bar.h < 160,
    `${Math.round(bar?.h ?? 0)}px tall`,
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
