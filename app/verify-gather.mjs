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
  // Every page starts with no doors walked through, so the map's state is
  // the run's doing and not a previous run's.
  await page.evaluate(() => localStorage.removeItem('ploobia.campaign.photosynthesis.v1'))
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1800)
  return page
}

/**
 * End the round and take the handover.
 *
 * Since Sugar Line VI the round hands over through a card — what you caught,
 * what to do with it — before the capped lab appears. Every path into the lab
 * goes through it, so the suites do too.
 */
async function toTheLab(page) {
  await tap(page, 'To the lab')
  await waitFor(async () => (await run(page)).phase === 'handover')
  const h = await run(page)
  check('the round hands over through a card, not a cold cut', h.phase === 'handover', String(h.phase))
  check('and the handover names what was caught', (await page.getByTestId('handover').count()) === 1)
  await tap(page, 'Into the lab')
  await waitFor(async () => (await run(page)).phase === 'lab')
}

/**
 * Press Start gathering and wait through the get-ready beat.
 *
 * The clock does not run until the three-second beat ends or the first catch
 * lands, so a suite that expects `gather` straight away is testing a build
 * that no longer exists.
 */
async function startGathering(page) {
  await tap(page, 'Start gathering')
  await waitFor(async () => (await run(page)).phase === 'ready', 8000)
  const r = await run(page)
  check('the round opens on a get-ready beat, with the clock held', r.phase === 'ready' && r.secondsLeft === r.challenge.gatherSeconds, `${r.phase} ${r.secondsLeft}`)
  check('and the beat says what to do', (await page.getByTestId('get-ready').count()) === 1)
  await waitFor(async () => (await run(page)).phase === 'gather', 15000)
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
/* The front door: Play first, and an Explorer never sees the brief   */
/* ================================================================== */
{
  const page = await open(390, 844, true)
  await page.evaluate(() => localStorage.setItem('ploobia.band.v1', JSON.stringify('explorer')))
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1800)

  const doors = await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .map((b) => b.getAttribute('aria-label'))
      .filter((l) => l === 'Play' || l === 'Start' || l === 'Watch it play itself'),
  )
  check('the welcome card leads with Play', doors[0] === 'Play', doors.join(' → '))
  check('and keeps the free lab one tap away', doors.includes('Start'))

  /* -- the map: five doors, named, honestly shut -- */
  const states = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="door-"]')].map((d) => d.getAttribute('data-state')),
  )
  check('the welcome card shows five doors', states.length === 5, states.join(','))
  check('the first is open and the second is shut', states[0] === 'open' && states[1] === 'shut', states.join(','))
  check('the unbuilt ones are on the map, undiscovered', states.slice(2).every((s) => s === 'undiscovered'))
  check('and none of them says coming soon', !(await page.evaluate(() => /coming soon/i.test(document.body.innerText))))
  await resilientClick(page.getByTestId('door-2'), { label: 'door 2' })
  await page.waitForTimeout(300)
  const note = await page.getByTestId('door-note').textContent().catch(() => '')
  check('a shut door says what opens it', /stage 1/i.test(note || ''), note || '')
  check('and does not open', (await run(page))?.phase === 'off')

  await tap(page, 'Play')
  await waitFor(async () => (await run(page))?.phase === 'ready', 8000)
  const r = await run(page)
  check('an Explorer goes straight from Play into the countdown', r?.phase === 'ready', String(r?.phase))
  check('on the band\'s own level', r?.challenge?.band === 'explorer' && r?.challenge?.goal?.target === 10, JSON.stringify(r?.challenge?.goal))
  check('with no brief in the way', (await page.getByTestId('brief-headline').count()) === 0)
  check('and a voice in the round', (await page.getByTestId('gather-coach').count()) === 1)
  check('the clock is held during the beat', r?.secondsLeft === r?.challenge?.gatherSeconds)

  // A catch made without moving is not a gesture, so it must not end the beat.
  await page.waitForTimeout(800)
  const still = await run(page)
  check('a still finger does not start the clock', still?.phase === 'ready' || still?.readyLeft < 1, `${still?.phase} readyLeft ${still?.readyLeft}`)
  await page.close()
}

{
  const page = await open(1440, 900)
  await page.evaluate(() => localStorage.setItem('ploobia.band.v1', JSON.stringify('scientist')))
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1800)
  await tap(page, 'Play')
  await waitFor(async () => (await run(page))?.phase === 'brief', 8000)
  const r = await run(page)
  check('a Scientist\'s Play opens the brief', r?.phase === 'brief', String(r?.phase))
  check('on level 2, with the target as the headline', /12 mg h⁻¹/.test((await page.getByTestId('brief-headline').textContent()) || ''))
  await page.close()
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
  // The brief opens on one challenge — the band's own level — with the
  // target as the headline. The list and the room code are one tap away.
  const headline = await page.getByTestId('brief-headline').textContent()
  check('the brief opens on one challenge with the target as the headline', /12 mg h⁻¹/.test(headline || ''), headline || '')
  check('the list is folded away until asked for', (await page.getByText('Thin air').count()) === 0)
  await tap(page, 'Other challenges')
  await page.waitForTimeout(300)
  check(
    'and offers more than one brief to choose from',
    (await page.getByText('First light').count()) >= 1 &&
      (await page.getByText('Find the ceiling').count()) >= 1,
  )
  await tap(page, 'Join a room')
  await page.waitForTimeout(300)
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
  await tap(page, 'Join a room')
  await page.waitForTimeout(300)
  await page.getByLabel('Room code').fill('MANGO')
  await page.waitForTimeout(300)
  check('a room code names a room', (await page.getByText(/^Room [A-Z0-9]{5}$/).count()) >= 1)

  await startGathering(page)
  {
    // The pointer is left wherever the button was — mid-screen, which is now
    // the middle of the field — so the collector starts catching immediately.
    // That is right for a player and wrong for this assertion, which is about
    // what `begin()` sets up, not about how fast the game starts working.
    const box = await page.locator('canvas').first().boundingBox()
    await page.mouse.move(box.x + 16, box.y + box.height - 16)
  }
  const g0 = await run(page)
  check('the gather round starts', g0.phase === 'gather')
  check('the clock is set from the brief', g0.secondsLeft > 0)
  check(
    'the lab HUD stands down so the whole screen is playfield',
    (await page.getByRole('button', { name: 'Run measurement' }).count()) === 0,
  )
  check('the bank starts empty', Object.values(g0.bank).every((v) => v === 0))

  /* ---- the playfield and the frame are the same thing ---- */
  {
    /* The bug this replaces: motes streamed in from far above the frame while
       the camera framed the plant, so most of a mote's catchable life happened
       off screen. Two full sweeps of the visible grass on the deployed build
       caught nothing at all, and every existing check passed throughout —
       nothing overlapped, nothing was mis-sized, the camera was where it
       should be. Only projecting the paths through the live camera can see it. */
    await page.waitForTimeout(2200) // let the opening framing settle
    const shot = await page.evaluate(() => {
      const f = window.__gatherField?.()
      const cam = window.__sugarCam
      if (!f || !cam) return null
      cam.updateMatrixWorld()
      cam.updateProjectionMatrix()
      const m = new (Object.getPrototypeOf(cam.projectionMatrix).constructor)()
      m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
      const project = (p) => {
        const v = { x: p[0], y: p[1], z: p[2], w: 1 }
        const e = m.elements
        const x = e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12]
        const y = e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13]
        const w = e[3] * v.x + e[7] * v.y + e[11] * v.z + e[15]
        return w !== 0 ? [x / w, y / w] : [99, 99]
      }
      const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
      const off = []
      let sampled = 0
      for (const it of f.items) {
        for (let k = 0; k <= 10; k++) {
          const t = f.window.lo + ((f.window.hi - f.window.lo) * k) / 10
          const [nx, ny] = project(lerp(it.from, it.to, t))
          sampled++
          if (Math.abs(nx) > 1 || Math.abs(ny) > 1)
            off.push(`${it.kind}@${t.toFixed(2)} (${nx.toFixed(2)},${ny.toFixed(2)})`)
        }
      }
      return { sampled, off, count: f.items.length }
    })
    check('the field handle is exposed', shot !== null)
    if (shot) {
      check(
        'there is a field worth sweeping',
        shot.count >= 18,
        `${shot.count} catchables`,
      )
      check(
        'every catchable stays on screen for the whole time it can be caught',
        shot.off.length === 0,
        `${shot.off.length}/${shot.sampled} samples off screen: ${shot.off.slice(0, 4).join(', ')}`,
      )
    }
  }

  /* ---- the drag belongs to the game, not to the camera ---- */
  {
    /* Measured as a *direction*, not a position.
       Orbit rotates the camera about its target; the round's framing only ever
       changes the distance along the ray the learner was already on. So the
       question "did the drag orbit?" is exactly "did the direction change?",
       and asking it that way is immune to the framing ease still settling —
       which under SwiftShader takes several seconds and is otherwise
       indistinguishable from a small orbit nudge. */
    const dirOf = () =>
      page.evaluate(() => {
        const c = window.__sugarCam
        const f = window.__gatherField?.()
        if (!c || !f) return null
        const cx = (f.bounds.min[0] + f.bounds.max[0]) / 2
        const cy = (f.bounds.min[1] + f.bounds.max[1]) / 2
        const cz = (f.bounds.min[2] + f.bounds.max[2]) / 2
        const v = [c.position.x - cx, c.position.y - cy, c.position.z - cz]
        const n = Math.hypot(...v)
        return n > 1e-6 ? v.map((k) => k / n) : null
      })

    const before = await dirOf()
    const box = await page.locator('canvas').first().boundingBox()
    await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.35)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.7, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(900)
    const after = await dirOf()
    const dot = before && after ? before.reduce((n, v, i) => n + v * after[i], 0) : -1
    const degrees = dot >= -1 ? (Math.acos(Math.min(1, dot)) * 180) / Math.PI : 999
    check(
      'dragging during the round does not spin the camera',
      degrees < 0.5,
      `camera direction turned ${degrees.toFixed(2)}°`,
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

  await toTheLab(page)
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

  /* ---- the ceiling is drawn on the dial, and the reveal answers on the target ---- */
  {
    const dial = await page.evaluate(() => {
      const el = document.querySelector('[aria-label="Light intensity"]')
      if (!el) return null
      const dead = el.querySelector('[data-testid="dial-dead-zone"]')
      return { ceiling: el.getAttribute('data-ceiling'), dead: !!dead, text: el.textContent || '' }
    })
    check('the ceiling is drawn on the light dial', dial !== null && dial.dead && dial.ceiling !== null, JSON.stringify(dial))
    check('and the dial says so at the stop', dial !== null && /ceiling/i.test(dial.text), dial?.text.slice(0, 60))
    const reveal = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="reveal-challenge"]')
      return el ? el.textContent || '' : null
    })
    check('the result card answers against the target', reveal !== null && /target/i.test(reveal), reveal?.slice(0, 80))
    check('and names the gap in the learner\'s words', reveal !== null && /(short|over|on the mark)/.test(reveal), reveal?.slice(0, 80))
    check('and offers the hand-in on the card', (await page.getByRole('button', { name: 'Hand it in', exact: true }).count()) >= 1)
    const gaugeText = await page.evaluate(() => document.querySelector('[data-testid="target-gauge"]')?.textContent || '')
    check('the gauge shows the reading beside the target', /last reading/.test(gaugeText) && /TARGET/.test(gaugeText), gaugeText.slice(0, 80))
  }

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
  await page.waitForTimeout(400)
  check('the hand-in opens the next door on the card', (await page.getByTestId('door-opened').count()) === 1)
  check('with a way through it', (await page.getByRole('button', { name: 'Go through', exact: true }).count()) === 1)
  const walked = await page.evaluate(() => JSON.parse(localStorage.getItem('ploobia.campaign.photosynthesis.v1') || '{}'))
  check('and is remembered', walked.handedIn && Object.keys(walked.handedIn).length === 1, JSON.stringify(walked))
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
  await startGathering(page)

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

  await toTheLab(page)
  await page.waitForTimeout(600)

  /* ---- the target gauge is on screen, at the top, never behind a tab ---- */
  const gauge = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="target-gauge"]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 12)
    return { top: r.top, bottom: r.bottom, h: r.height, onTop: !!hit && el.contains(hit) }
  })
  check('the target gauge is on screen', gauge !== null && gauge.top >= 0 && gauge.bottom <= 844, JSON.stringify(gauge))
  check('and nothing is drawn over it', gauge !== null && gauge.onTop)
  check('and it is not behind a tab', gauge !== null && gauge.top < 300, `top ${Math.round(gauge?.top ?? 0)}`)
  check('and folds so the specimen stays visible', gauge !== null && gauge.h < 230, `${Math.round(gauge?.h ?? 0)}px tall`)
  check('the coach is still talking inside the challenge', (await page.getByTestId('coach').count()) === 1)

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
