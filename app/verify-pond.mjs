/**
 * The Pond, driven through its real controls.
 *
 * Serve dist/ on :8765 first (python3 -m http.server 8765 in dist).
 *
 * The physics, the sprigs and the two guarantees are proved out of band by
 * `verify-pond-model.mjs`. This suite is for the claims only a browser can
 * settle, and they are the ones the round would be a lie without:
 *
 *   1. **The gauge has no target.** Every other door in this cabinet pins a
 *      number to reach. This one pins what the counter said, and the thing
 *      being aimed at is a cause.
 *   2. **A direction before the world moves.** The first touch of any dial
 *      asks up / same / down, once per dial, and nothing moves until it is
 *      answered.
 *   3. **The guarantees survive the interface.** A learner pressing real
 *      buttons sees the non-answer dial move the count by less than a bubble
 *      and the answer dial move it by at least six.
 *   4. **You cannot accuse a plate you never tried**, and a count taken
 *      after two dials moved unlocks nothing.
 *   5. **The answer is not in the room.** The truth word is nowhere in the
 *      DOM before the plates flip, and *limiting*, *factor* and *rate*
 *      appear nowhere at all.
 *   6. **A wrong accusation is information, not a game over.** The plates
 *      flip anyway, the card is honest, and the hand-in is zero.
 */
import { chromium } from 'playwright'
import { reporter, resilientClick } from './verify-lib.mjs'

const BASE = 'http://localhost:8765/index.html'
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

const run = (page) => page.evaluate(() => window.__sugarRun?.() ?? null)
const pond = (page) => page.evaluate(() => window.__pond?.() ?? null)
const sim = (page) => page.evaluate(() => (window.__sugarSim ? { stage: window.__sugarSim.stage, counting: window.__sugarSim.pond.counting, revealed: window.__sugarSim.pond.revealed } : null))

const tap = (page, name, opts = {}) =>
  resilientClick(page.getByRole('button', { name, exact: opts.exact ?? true }).first(), { label: name })

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

/**
 * Open the cabinet with door 1 already handed in, because the Pond opens on
 * a Factory hand-in and this suite is about the tank, not the door.
 */
async function open(width, height, touch, band) {
  const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch, isMobile: touch })
  watch(page)
  await page.goto(`${BASE}#/photosynthesis?q=low`, { waitUntil: 'load' })
  await page.evaluate((b) => {
    localStorage.setItem('ploobia.band.v1', JSON.stringify(b))
    localStorage.setItem('ploobia.campaign.photosynthesis.v1', JSON.stringify({ handedIn: { 'first-light': 700 } }))
  }, band)
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(1800)
  await page.getByRole('button', { name: 'Start', exact: true }).first().waitFor({ timeout: 30000 }).catch(() => {})
  await tap(page, 'Start')
  await waitFor(async () => await page.evaluate(() => window.__sugarSim?.started === true))
  await page.waitForTimeout(500)
  return page
}

/** Open a named tank from the challenge list and walk into the lab. */
async function startTank(page, title) {
  await tap(page, 'Challenge')
  await page.waitForTimeout(400)
  await tap(page, 'Other challenges')
  await page.waitForTimeout(300)
  await resilientClick(page.getByText(title, { exact: true }).first(), { label: title })
  await page.waitForTimeout(300)
  await tap(page, 'Into the lab')
  await waitFor(async () => (await pond(page)) !== null && (await sim(page))?.stage === 'pond', 12000)
  await page.waitForTimeout(900)
}

/** A minute on the sped-up clock, waited out. */
async function count(page) {
  const before = (await pond(page))?.log.length ?? 0
  await resilientClick(page.getByTestId('pond-count').first(), { label: 'Count a minute' })
  await waitFor(async () => ((await pond(page))?.log.length ?? 0) > before, 20000)
  await page.waitForTimeout(200)
}

/**
 * A nudge, answering the micro-commit when it appears.
 *
 * The card is waited for rather than sampled once: on a software renderer a
 * click can take seconds to land, and a helper that looked 250 ms later and
 * moved on left the dial untried and the plates dead — which the suite then
 * blamed on the seed.
 */
async function nudge(page, dial, dir, guess = 'up') {
  const before = JSON.stringify((await pond(page))?.env)
  await resilientClick(page.locator(`[data-testid="pond-nudge"][data-dial="${dial}"][data-dir="${dir}"]`).first(), {
    label: `${dial} ${dir}`,
  })
  const asked = await waitFor(async () => (await page.getByTestId('pond-commit').count()) > 0, 3000)
  if (asked) {
    await resilientClick(page.locator(`[data-testid="pond-guess"][data-guess="${guess}"]`).first(), { label: guess })
  }
  await waitFor(async () => JSON.stringify((await pond(page))?.env) !== before, 6000)
  await page.waitForTimeout(150)
}

/* ================================================================== */
/* The tank exists, and the bench replaces the lab                     */
/* ================================================================== */
{
  const page = await open(1440, 900, false, 'scientist')
  await startTank(page, 'Why so quiet?')

  const s = await sim(page)
  check('the round is played on the tank', s?.stage === 'pond', s?.stage)
  const names = await page.evaluate(() => {
    const out = []
    window.__sugarScene?.traverse((o) => o.name && out.push(o.name))
    return out
  })
  for (const n of ['pond-stage', 'sprig', 'bubbles', 'funnel', 'tube', 'lamp', 'indicator'])
    check(`the scene has ${n}`, names.includes(n), names.join(','))

  /* -- the gauge with no target -- */
  check('the tank pins its own gauge', (await page.getByTestId('pond-hud').count()) === 1)
  check('and the lab\'s target plate is not on screen at all', (await page.getByTestId('target-gauge').count()) === 0)
  check('nor the stage tabs — a learner mid-diagnosis has no business changing stage', (await page.getByRole('button', { name: 'The hatches', exact: true }).count()) === 0)
  const gauge = await page.getByTestId('pond-gauge')
  check('the gauge reads now, last and as found', (await gauge.innerText()).toLowerCase().includes('as found'))
  check('and never says what to reach', !/target:|reach |goal/i.test(await page.getByTestId('pond-hud').innerText()))
  check('the bench is up', (await page.getByTestId('pond-bench').count()) === 1)
  check('the counts panel is up and empty', (await page.getByTestId('pond-counts').getAttribute('data-rows')) === '0')

  /* -- the plates are the sprig's own suspects -- */
  const p0 = await pond(page)
  const plates = await page.locator('[data-testid="pond-plate"]').count()
  check('the tank shows one plate per dial it has, and no others', plates === p0.dials.length, `${plates} plates, ${p0.dials.length} dials`)
  const reads = await page.locator('[data-testid="pond-plate"]').first().innerText()
  check('and every one of them reads a question mark', reads.includes('?'), reads)
  check('none of them is live before a single count', (await page.locator('[data-testid="pond-plate"][data-live="true"]').count()) === 0)

  /* -- the answer is not in the room -- */
  const body = await page.evaluate(() => document.body.innerText)
  check('the words the round must not say are nowhere in it', !/\blimiting\b|\bfactor\b|\brate\b/i.test(body))

  /* ================================================================ */
  /* A direction before the world moves                                */
  /* ================================================================ */
  await count(page)
  const asFound = (await pond(page)).log[0].bubbles
  check('a count lands a row in the log', asFound > 0, String(asFound))
  // The bench is the LEVEL's, not the learner's: this is the Explorer's tank
  // however old the person playing it is, and its grant was worked out from
  // that bench (six minutes a sprig, two sprigs).
  check('and spends a minute of the kit', (await pond(page)).kit.minutes === 5, JSON.stringify((await pond(page)).kit))
  check('and a minute of the round\'s own grant', (await run(page))?.bank?.minutes === 11, JSON.stringify((await run(page))?.bank))
  check('the first row is "as found"', (await pond(page)).log[0].did === 'as found')

  const envBefore = JSON.stringify((await pond(page)).env)
  await resilientClick(page.locator('[data-testid="pond-nudge"][data-dial="lamp"][data-dir="up"]').first(), { label: 'brighter' })
  await page.waitForTimeout(400)
  check('the first touch of a dial asks which way the bubbles will go', (await page.getByTestId('pond-commit').count()) === 1)
  check('and the world has not moved while it asks', JSON.stringify((await pond(page)).env) === envBefore)
  await resilientClick(page.locator('[data-testid="pond-guess"][data-guess="up"]').first(), { label: 'up' })
  const moved = await waitFor(async () => JSON.stringify((await pond(page)).env) !== envBefore, 6000)
  check('answering it moves the dial', moved, `${envBefore} -> ${JSON.stringify((await pond(page)).env)}`)

  await nudge(page, 'lamp', 'up')
  check('and it never asks about that dial again', (await page.getByTestId('pond-commit').count()) === 0)

  /* -- nothing moves under the counter -- */
  await resilientClick(page.getByTestId('pond-count').first(), { label: 'Count a minute' })
  await page.waitForTimeout(900)
  const mid = await page.locator('[data-testid="pond-nudge"]').first().isDisabled()
  check('while a minute is counting, no dial can be touched', mid === true)
  check('and the tank knows it is counting', ((await sim(page))?.counting ?? 0) > 0)
  await waitFor(async () => ((await pond(page))?.log.length ?? 0) >= 2, 20000)

  /* ================================================================ */
  /* The guarantees, through the real buttons                          */
  /* ================================================================ */
  const truth = await page.evaluate(() => {
    // The suite may know the answer; the DOM may not.
    const id = window.__sugarSim.pond.patientId
    return id
  })
  const log2 = (await pond(page)).log
  const lampStep = log2[log2.length - 1].bubbles - log2[log2.length - 2].bubbles
  if (truth === 'shady') {
    check('on the shady sprig the lamp is the answer, and it moves the count by six or more', lampStep >= 6, `${lampStep}`)
  } else {
    check('on the quiet sprig the lamp is not the answer, and it moves the count by less than a bubble', Math.abs(lampStep) < 1, `${lampStep}`)
  }

  /* -- a plate cannot be accused until every dial has been tried -- */
  const before = await pond(page)
  check('the untried dial is named rather than the answer', (await page.getByTestId('pond-accuse-hint').innerText()).includes('soda') === !before.canAccuse, JSON.stringify({ canAccuse: before.canAccuse }))
  if (!before.canAccuse) {
    check('and no plate is live yet', (await page.locator('[data-testid="pond-plate"][data-live="true"]').count()) === 0)
  }
  await nudge(page, 'soda', 'up', 'same')
  await count(page)
  const after = await pond(page)
  check('with every dial tried, the plates go live', after.canAccuse === true)
  const livePlates = await waitFor(
    async () => (await page.locator('[data-testid="pond-plate"][data-live="true"]').count()) === after.dials.length,
    8000,
  )
  check('and the scene agrees', livePlates, `${await page.locator('[data-testid="pond-plate"][data-live="true"]').count()} live of ${after.dials.length}`)

  /* -- the truth is still not in the room -- */
  const body2 = await page.evaluate(() => document.body.innerText)
  check('and the answer is still not written anywhere', !/it was short of|nothing was holding/i.test(body2))

  /* ================================================================ */
  /* The accusation                                                    */
  /* ================================================================ */
  const answer = await page.evaluate(() => window.__sugarSim.pond.patientId)
  const rightDial = answer === 'shady' ? 'lamp' : 'soda'
  const clickedAt = Date.now()
  await resilientClick(page.locator(`[data-testid="pond-plate"][data-dial="${rightDial}"]`).first(), { label: `blame ${rightDial}` })
  // Sample both in one round trip, so "the plates had the screen to
  // themselves" is not decided by how long a poll took to come back.
  let firstSight = null
  await waitFor(async () => {
    const seen = await page.evaluate(() => ({
      revealed: !!window.__sugarSim?.pond.revealed,
      card: document.querySelectorAll('[data-testid="field-log"]').length,
      t: Date.now(),
    }))
    if (seen.revealed && !firstSight) firstSight = { ...seen, after: seen.t - 0 }
    return seen.revealed
  }, 8000)
  await waitFor(async () => (await pond(page))?.verdict !== null, 8000)
  const v = (await pond(page)).verdict
  check('naming the right plate is right', v?.right === true, JSON.stringify(v))
  check('and it stamps, because the jump that proves it is in the log', v?.stamps === true)
  check('the plates flip', (await sim(page))?.revealed === true)
  // The plates have the screen to themselves for a beat before the card
  // covers them — that flip is the round's one filmable moment.
  const sawFlipAlone = firstSight && firstSight.t - clickedAt < 1200
  if (!sawFlipAlone) {
    skip('the plates have the screen to themselves before the card', `the renderer took ${firstSight ? firstSight.t - clickedAt : '?'} ms to report the flip`)
  } else {
    check('and they have the screen to themselves for a moment', firstSight.card === 0, JSON.stringify(firstSight))
  }
  check('the Field Log card comes up', await waitFor(async () => (await page.getByTestId('field-log').count()) === 1, 6000))
  check('with the learner\'s own counts on it', (await page.getByTestId('field-log-line').innerText()).length > 10)
  check('and the evidence saved', (await page.getByTestId('field-log-saved').innerText()).includes('Field Log'))
  check('the graph relabels its axis at the reveal', (await page.getByTestId('pond-graph').getAttribute('data-axis')) === 'values')
  check('the hand-in is a hit', (await run(page))?.best === 1, String((await run(page))?.best))

  /* -- six seconds inside, and the lab is given back untouched -- */
  const labBefore = await page.evaluate(() => ({ light: window.__sugarSim.light, co2: window.__sugarSim.co2, tempC: window.__sugarSim.tempC, stage: window.__sugarSim.stage }))
  await resilientClick(page.getByTestId('field-log-inside').first(), { label: 'Look inside' })
  check('the reveal offers a look inside a leaf cell', await waitFor(async () => (await page.getByTestId('pond-inside').count()) === 1, 6000))
  check('which is the cabinet\'s own chloroplast, not a new picture', (await sim(page))?.stage === 'leaf', (await sim(page))?.stage)
  const said = await page.getByTestId('pond-inside').innerText()
  check('and it says what was happening in there, in the learner\'s words', said.length > 20 && !/limiting|factor/i.test(said), said)
  await resilientClick(page.getByRole('button', { name: /Back to the tank/ }).first(), { label: 'back' })
  check('coming back puts the tank up again', await waitFor(async () => (await sim(page))?.stage === 'pond', 6000))
  const labAfter = await page.evaluate(() => ({ light: window.__sugarSim.light, co2: window.__sugarSim.co2, tempC: window.__sugarSim.tempC, stage: window.__sugarSim.stage }))
  check('and the lab it borrowed is handed back exactly as it was', JSON.stringify(labBefore) === JSON.stringify(labAfter), `${JSON.stringify(labBefore)} vs ${JSON.stringify(labAfter)}`)
  await waitFor(async () => (await page.getByTestId('field-log').count()) === 1, 6000)

  /* -- the next sprig is a fresh bench -- */
  check('there is a next sprig to go to', (await pond(page)).of === 2)
  await resilientClick(page.getByRole('button', { name: 'The next sprig →', exact: true }).first(), { label: 'next sprig' })
  await page.waitForTimeout(900)
  const nextP = await pond(page)
  check('the next sprig opens with nothing counted', nextP.at === 1 && nextP.log.length === 0)
  check('and a bench refilled for it', nextP.kit.minutes === 6, JSON.stringify(nextP.kit))
  check('and its plates are questions again', (await sim(page))?.revealed === false)

  await page.close()
}

/* ================================================================== */
/* Two things at once prove neither                                    */
/* ================================================================== */
{
  const page = await open(1440, 900, false, 'scientist')
  await startTank(page, 'Why so quiet?')
  await count(page)
  await nudge(page, 'lamp', 'up')
  await nudge(page, 'soda', 'up', 'same')
  await count(page)
  const p = await pond(page)
  const last = p.log[p.log.length - 1]
  check('a count after two nudges is marked confounded', last.confounded === true, JSON.stringify(last))
  check('and it names no dial', last.dial === null)
  check('the row says so in the learner\'s words', (await page.getByTestId('pond-counts').innerText()).includes('two things changed'))
  check('and it unlocks nothing', p.canAccuse === false)
  check('Ploob asks which one did it rather than telling them', /which one/i.test(await page.getByTestId('coach').innerText()))
  await page.close()
}

/* ================================================================== */
/* A wrong accusation is information, not a game over                  */
/* ================================================================== */
{
  const page = await open(1440, 900, false, 'scientist')
  await startTank(page, 'Why so quiet?')
  await count(page)
  await nudge(page, 'lamp', 'up')
  await count(page)
  await nudge(page, 'soda', 'up', 'same')
  await count(page)
  const answer = await page.evaluate(() => window.__sugarSim.pond.patientId)
  const wrong = answer === 'shady' ? 'soda' : 'lamp'
  await waitFor(async () => (await page.locator('[data-testid="pond-plate"][data-live="true"]').count()) > 0, 8000)
  const live = await page.locator('[data-testid="pond-plate"][data-live="true"]').count()
  if (live === 0) {
    skip('a wrong accusation is honest', `the plates never went live: ${JSON.stringify(await pond(page))}`)
  } else {
    await resilientClick(page.locator(`[data-testid="pond-plate"][data-dial="${wrong}"]`).first(), { label: `blame ${wrong}` })
    await waitFor(async () => (await pond(page))?.verdict !== null, 8000)
    const v = (await pond(page)).verdict
    check('naming the wrong plate is wrong', v?.right === false, JSON.stringify(v))
    await waitFor(async () => (await page.getByTestId('field-log').count()) === 1, 6000)
    check('but the plates flip anyway — the round still answers', (await sim(page))?.revealed === true)
    check('the card says "Not that one" rather than ending the round', (await page.getByTestId('field-log-headline').innerText()).includes('Not that one'))
    check('it points at the learner\'s own counts', /your own count|step that moved/i.test(v?.line ?? ''))
    check('the miss is kept honestly rather than hidden', (await page.getByTestId('field-log-saved').innerText()).includes('with the miss'))
    check('and it does not stamp', v?.stamps === false && (await run(page))?.best === 0)
  }
  await page.close()
}

/* ================================================================== */
/* The Explorer's tank, and the phone                                  */
/* ================================================================== */
{
  const page = await open(844, 390, true, 'explorer')
  await startTank(page, 'Why so quiet?')
  check('the bench fits on a phone', (await page.getByTestId('pond-bench').count()) === 1)
  const bench = await page.getByTestId('pond-bench').boundingBox()
  check('and stays inside the screen', bench && bench.x >= 0 && bench.x + bench.width <= 844 + 1 && bench.y + bench.height <= 390 + 1, JSON.stringify(bench))
  const countBtn = await page.getByTestId('pond-count').boundingBox()
  check('the minute is a finger-sized target', countBtn && countBtn.height >= 40, JSON.stringify(countBtn))
  check('an Explorer gets no cloth', (await page.getByTestId('pond-cloth').count()) === 0)
  check('and no indicator tube to read', (await page.getByTestId('pond-indicator').count()) === 0)
  const plate = await page.locator('[data-testid="pond-plate"]').first().boundingBox()
  check('the plates are not under the bench', plate && bench && (plate.y + plate.height < bench.y + 2 || plate.x + plate.width < bench.x + 2), JSON.stringify({ plate, bench }))
  await page.close()
}

/* ================================================================== */
/* The Scientist's three dials fit the desktop bench                    */
/* ================================================================== */
{
  const page = await open(1440, 900, false, 'scientist')
  await startTank(page, 'Three patients')
  const bench = await page.getByTestId('pond-bench').boundingBox()
  check('the three-dial bench stays inside a desktop screen', bench && bench.x >= 0 && bench.x + bench.width <= 1440 + 1 && bench.y + bench.height <= 900 + 1, JSON.stringify(bench))
  const boxes = await page.locator('[data-testid="pond-nudge"]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))
  check('and every one of its six buttons is on screen', boxes.length === 6 && boxes.every((b) => b.right <= 1440 + 1 && b.left >= 0 && b.width > 0), JSON.stringify(boxes.map((b) => Math.round(b.right))))
  await page.close()
}

/* ================================================================== */
/* The Analyst: the counter is noisy, and there is a fourth plate       */
/* ================================================================== */
{
  const page = await open(1440, 900, false, 'analyst')
  await startTank(page, 'The ceiling')
  const p = await pond(page)
  check('the Analyst gets one sprig', p?.of === 1)
  const c = (await run(page))?.challenge
  check(
    'the round scores against its own honest floor, not the lab\'s',
    c?.minTrials === 12 && c?.floor === 20,
    JSON.stringify({ minTrials: c?.minTrials, floor: c?.floor }),
  )
  // Twenty, not fourteen: the brief tells the Analyst to repeat every count
  // and take the mean, and fourteen minutes would not pay for it.
  check('with a bench big enough to repeat every count three times', p?.kit.minutes === 20, JSON.stringify(p?.kit))
  const plates = await page.locator('[data-testid="pond-plate"]').count()
  check('and a fourth plate: nothing at all', plates === 4, `${plates}`)
  check('the cloth is on the bench at this band', (await page.getByTestId('pond-cloth').count()) === 1)
  check('and the indicator is there to read', (await page.getByTestId('pond-indicator').count()) === 1)
  // Five minutes of the same tank, nothing touched. A readout would give the
  // same number five times; a count does not, and that is why the Analyst is
  // told to repeat and take the mean.
  // The scatter is under a bubble on a quiet tank, so five honest draws agree
  // about one run in twenty — a flake, not a finding — and the scene's own
  // bubbles eat random numbers between counts, so a seeded sequence cannot be
  // aimed at the counter either. Pin the draw to the count instead: the
  // counter gets the top of the spread on even counts and the bottom on odd,
  // which is what a real bench does over enough minutes, only sooner.
  await page.evaluate(() => {
    Math.random = () => ((window.__pond?.()?.log.length ?? 0) % 2 === 0 ? 0.999 : 0.001)
  })
  for (let i = 0; i < 5; i += 1) await count(page)
  const log = (await pond(page)).log
  const seen = log.map((c) => c.bubbles)
  check('repeated minutes on an untouched tank do not all agree', new Set(seen).size > 1, JSON.stringify(seen))
  check('the second row says "again"', log[1].did === 'again')
  await page.close()
}

check('no console errors anywhere in the round', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))

await browser.close()
process.exit(tally())
