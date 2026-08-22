/**
 * Motion Lab checks. Serve dist/ on :8765 first (python3 -m http.server 8765 in dist).
 * The harness taps the stopwatch "like a human": it reads the sim's exact
 * crossing times from window.__motionSim and taps ~0.2 s after each event.
 */
import { chromium, devices } from 'playwright'

const URL = 'http://localhost:8765/index.html#/motion'
const results = []
const check = (n, ok, extra = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`
  results.push(line)
  console.log(line)
}
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })

const simNow = (page) => page.evaluate(() => {
  const s = window.__motionSim
  return s.time + Math.min(0.25, (performance.now() - s.lastWall) / 1000)
})
const simGet = (page, expr) => page.evaluate((e) => new Function('s', 'return ' + e)(window.__motionSim), expr)
const tap = (page) => page.locator('[data-testid="stopwatch"]').dispatchEvent('pointerdown', { button: 0, pointerType: 'mouse' })

async function waitSim(page, expr, timeout = 15000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    if (await simGet(page, expr)) return true
    await page.waitForTimeout(40)
  }
  return false
}

/** Push, tap ~0.2 s after the start-line crossing and ~0.2 s after the target crossing. */
async function timedRoll(page, reaction = 0.2) {
  await page.locator('[data-testid="push"]').click({ force: true })
  await waitSim(page, 's.rolling && s.crossAt["0"] != null')
  const target = await simGet(page, 's.target')
  const t0 = await simGet(page, 's.crossAt["0"]')
  const t1 = await simGet(page, `s.crossAt["${target}"]`)
  await waitSim(page, `s.time + Math.min(0.25,(performance.now()-s.lastWall)/1000) >= ${t0 + reaction}`)
  await tap(page)
  if (t1 == null) return null
  await waitSim(page, `s.time + Math.min(0.25,(performance.now()-s.lastWall)/1000) >= ${t1 + reaction}`)
  await tap(page)
  await waitSim(page, '!s.rolling', 20000)
  await page.waitForTimeout(150)
  return { trueT: t1 - t0 }
}

async function timedDrop(page, reaction = 0.2, both = false) {
  await page.locator(both ? '[data-testid="release-both"]' : '[data-testid="release"]').click({ force: true })
  await waitSim(page, 's.dropping')
  const t0 = await simGet(page, 's.dropStartAt')
  const tl = await simGet(page, 's.dropStartAt + Math.sqrt(2*s.dropH0/s.g)')
  await waitSim(page, `s.time + Math.min(0.25,(performance.now()-s.lastWall)/1000) >= ${t0 + reaction}`)
  await tap(page)
  await waitSim(page, `s.time + Math.min(0.25,(performance.now()-s.lastWall)/1000) >= ${tl + reaction}`)
  await tap(page)
  await waitSim(page, '!s.dropping', 20000)
  await page.waitForTimeout(150)
  return { trueT: tl - t0 }
}

async function calibrate(page) {
  const btn = page.locator('[data-testid="catch-button"]')
  await btn.dispatchEvent('pointerdown')
  for (let i = 0; i < 5; i++) {
    await page.waitForFunction(() => document.querySelector('[data-testid="catch-button"]')?.textContent?.includes('TAP'), null, { timeout: 8000 })
    await page.waitForTimeout(120)
    await btn.dispatchEvent('pointerdown')
    await page.waitForTimeout(150)
  }
  await page.getByRole('button', { name: /to the yard/i }).click({ force: true })
  await page.waitForTimeout(800)
}

const missionDone = (page, id) => page.locator(`[data-mission="${id}"][data-done="1"]`).count().then((n) => n > 0)

/* ---------- Desktop: the whole loop ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await ctx.newPage()
  page.setDefaultTimeout(25000)
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()) })
  try {
    await page.goto(URL)
    await page.waitForTimeout(4500)
    check('welcome renders', (await page.getByText('Motion Yard').count()) >= 1)
    await page.getByRole('button', { name: /start measuring/i }).click({ force: true })
    await page.waitForSelector('[data-testid="catch-button"]', { timeout: 15000 })
    check('calibration card appears', (await page.locator('[data-testid="catch-button"]').count()) === 1)
    await calibrate(page)
    const reactionText = await page.getByText(/Your reaction:/).first().textContent()
    const reaction = Number(/([\d.]+) s/.exec(reactionText)?.[1])
    check('reaction time measured and in range', reaction > 0.05 && reaction < 5, reactionText + ' (SwiftShader inflates harness tap latency)')

    // 1. Hand-timed roll
    const r1 = await timedRoll(page, 0.2)
    check('roll reaches the 1 m marker on felt', r1 !== null)
    await page.waitForTimeout(400)
    check('mission "Time a roll" completes on a recorded reading', await missionDone(page, 'first-time'))
    const readingText = await page.locator('[data-testid="stopwatch-reading"]').textContent()
    const measured = Number(readingText)
    check('stopwatch reading ≈ true interval (taps both ~0.2 s late)', r1 && Math.abs(measured - r1.trueT) < 0.35, `${measured} vs ${r1?.trueT.toFixed(2)}`)
    check('early/late flick shown', /late|early|on it/.test(await page.locator('[data-testid="flick"]').textContent()))

    // 2. Two more identical rolls with different "reaction" -> spread, gates unlock
    await timedRoll(page, 0.32)
    await timedRoll(page, 0.14)
    await page.waitForTimeout(500)
    check('mission "Do it again" completes on three same-setup readings', await missionDone(page, 'same-roll-thrice'))
    check('photogates unlock after the spread is felt', await simGet(page, 's.gatesUnlocked'))
    // Results table: repeats summary
    await page.getByRole('button', { name: /^Results$/ }).click({ force: true })
    await page.waitForTimeout(300)
    check('results table shows the three rolls', (await page.locator('[data-testid="results"] tbody tr').count()) >= 3)
    check('repeat summary with mean and range', (await page.locator('[data-testid="repeat-summary"]').count()) >= 1)
    await page.getByRole('button', { name: /^Graph$/ }).click({ force: true })

    // 3. Gate reading (gates are on by default once unlocked)
    await page.locator('[data-testid="push"]').click({ force: true })
    await waitSim(page, '!s.rolling && s.gateDone > 0', 20000)
    await page.waitForTimeout(400)
    const rows = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="results"] tbody tr')).length)
    check('photogate produces an exact reading', await missionDone(page, 'beat-the-watch'), `rows now ${rows}`)

    // 4. Other distances -> speed equation earned
    await page.getByRole('button', { name: '0.5 m', exact: true }).first().click({ force: true })
    await timedRoll(page, 0.2)
    await page.getByRole('button', { name: '1.5 m', exact: true }).first().click({ force: true })
    await timedRoll(page, 0.2)
    await page.waitForTimeout(600)
    check('mission "Speed needs two numbers" completes', await missionDone(page, 'two-numbers'))
    check('equation beat card appears', (await page.getByText('Equation earned').count()) === 1)
    check('learner best-fit handles present (Scientist)', (await page.locator('[data-testid="handle-a"]').count()) === 1)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    await page.screenshot({ path: '/tmp/arcade/shots/verify-roll.png' })

    // 5. Drop bench: predict, drop both, hand-time five, unlock pad+sensor
    await page.getByRole('button', { name: /^Drop$/ }).first().click({ force: true })
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: 'Together', exact: true }).click({ force: true })
    await page.locator('[data-testid="release-both"]').click({ force: true })
    await waitSim(page, 's.dropping')
    const dAB = await simGet(page, 'Math.abs(s.ballAY - s.ballBY)')
    check('heavy and light fall together', dAB < 1e-6)
    await waitSim(page, '!s.dropping', 20000)
    await page.waitForTimeout(400)
    check('mission "Heavy or light?" completes', await missionDone(page, 'heavy-light'))
    for (const r of [0.2, 0.28, 0.16, 0.24, 0.3]) await timedDrop(page, r)
    await page.waitForTimeout(600)
    check('mission "Time a fall" completes on five hand timings', await missionDone(page, 'time-a-fall'))
    check('pad and sensor unlock', (await simGet(page, 's.padUnlocked')) && (await simGet(page, 's.sensorUnlocked')))
    const earthFall = await simGet(page, 'Math.sqrt(2*s.dropH0/s.g)')
    check('Earth 1 m fall ≈ 0.45 s', Math.abs(earthFall - 0.4515) < 0.01, earthFall.toFixed(3))

    // 6. Moon: sensor trace, drawer opens, segue
    await page.getByRole('button', { name: /^Moon/ }).click({ force: true })
    await page.waitForTimeout(300)
    await page.locator('[data-testid="release"]').click({ force: true })
    await waitSim(page, '!s.dropping && s.traceDone > 0', 25000)
    await page.waitForTimeout(600)
    const moonFall = await simGet(page, 'Math.sqrt(2*s.dropH0/s.g)')
    check('Moon 1 m fall ≈ 1.11 s', Math.abs(moonFall - 1.111) < 0.01, moonFall.toFixed(3))
    check('mission "Drop it on the Moon" completes', await missionDone(page, 'moon-drop'))
    check('drawer opens (segue)', await simGet(page, 's.drawerOpen'))
    await page.waitForTimeout(1500)
    check('segue card appears', (await page.getByText(/So how do you time things properly/).count()) >= 1)
    await page.screenshot({ path: '/tmp/arcade/shots/verify-segue.png' })
    await page.locator('[data-testid="segue-close"]').click({ force: true })
    await page.waitForTimeout(300)
    // Trace tab
    await page.getByRole('button', { name: /^Trace/ }).click({ force: true })
    await page.waitForTimeout(300)
    await page.locator('[data-testid="vt-toggle"]').click({ force: true })
    await page.waitForTimeout(300)
    check('v–t plot with learner handles', (await page.locator('[data-testid="handle-a"]').count()) === 1)
    const trace = await simGet(page, 's.traceSnapshot')
    const dts = trace.samples.slice(1).map((p, i) => p.t - trace.samples[i].t)
    check('trace samples every 20 ms', dts.slice(0, -1).every((d) => Math.abs(d - 0.02) < 1e-6))
    // g from a least-squares fit to the noisy sensor v–t points, within 2 %
    const gfit = await page.evaluate(() => {
      const s = window.__motionSim.traceSnapshot.samples
      const pts = []
      for (let i = 1; i < s.length - 1; i++) pts.push({ x: s[i].t, y: (s[i - 1].h - s[i + 1].h) / (s[i + 1].t - s[i - 1].t) })
      const n = pts.length, mx = pts.reduce((a, p) => a + p.x, 0) / n, my = pts.reduce((a, p) => a + p.y, 0) / n
      let sxx = 0, sxy = 0
      for (const p of pts) { sxx += (p.x - mx) ** 2; sxy += (p.x - mx) * (p.y - my) }
      return sxy / sxx
    })
    check('sensor trace fits g within 2 %', Math.abs(gfit - 1.62) / 1.62 < 0.02, gfit.toFixed(3))
    await page.screenshot({ path: '/tmp/arcade/shots/verify-trace.png' })

    // 7. Band switch keeps physics, changes controls
    await page.getByRole('button', { name: 'Explorer', exact: true }).first().click({ force: true })
    await page.getByRole('button', { name: /^Drive$/ }).first().click({ force: true })
    await page.waitForTimeout(400)
    check('Explorer sees push buttons, not a slider', (await page.getByRole('button', { name: 'Gentle', exact: true }).count()) === 1)
    check('band switch leaves g untouched', Math.abs((await simGet(page, 's.g')) - 1.62) < 1e-6)
    await page.getByRole('button', { name: 'Analyst', exact: true }).first().click({ force: true })
    await page.waitForTimeout(400)
    check('Analyst sees Jupiter/Sun on the dial', (await page.getByRole('button', { name: /^Jupiter/ }).count()) === 1)

    check('no console errors (desktop)', errors.length === 0, errors.slice(0, 3).join(' | '))
  } catch (e) {
    results.push('FAIL desktop crashed — ' + String(e).split('\n')[0])
    await page.screenshot({ path: '/tmp/arcade/shots/verify-crash.png' }).catch(() => {})
  }
  await ctx.close()
}

/* ---------- Guided demo (attract mode) leaves no readings ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await ctx.newPage()
  page.setDefaultTimeout(25000)
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  try {
    await page.goto(URL + '?demo=1')
    await page.waitForTimeout(5000)
    check('demo starts from ?demo=1', (await page.getByText(/Guided demo ·/).count()) >= 1)
    const t0 = Date.now()
    while (Date.now() - t0 < 120000) {
      if ((await page.getByText(/Guided demo ·/).count()) === 0) break
      await page.waitForTimeout(500)
    }
    check('demo finishes on its own', (await page.getByText(/Guided demo ·/).count()) === 0)
    await page.waitForTimeout(800)
    check('demo leaves zero readings', (await page.getByText(/0 readings/).count()) >= 1)
    check('demo hands over to calibration', (await page.locator('[data-testid="catch-button"]').count()) === 1)
    check('no console errors (demo)', errors.length === 0, errors.slice(0, 3).join(' | '))
  } catch (e) {
    results.push('FAIL demo crashed — ' + String(e).split('\n')[0])
  }
  await ctx.close()
}

/* ---------- Tablet: compact drawer ---------- */
{
  const ctx = await browser.newContext({ ...devices['iPad (gen 7)'] })
  const page = await ctx.newPage()
  page.setDefaultTimeout(25000)
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  try {
    await page.goto(URL)
    await page.waitForTimeout(4500)
    await page.getByRole('button', { name: /start measuring/i }).click({ force: true })
    await page.waitForTimeout(1200)
    await calibrate(page)
    check('tablet: stopwatch tile in the drawer', (await page.locator('[data-testid="stopwatch"]').count()) >= 1)
    await page.screenshot({ path: '/tmp/arcade/shots/verify-ipad.png' })
    check('no console errors (tablet)', errors.length === 0, errors.slice(0, 3).join(' | '))
  } catch (e) {
    results.push('FAIL tablet crashed — ' + String(e).split('\n')[0])
  }
  await ctx.close()
}


/* ---------- Motion Yard: venues, launch family, Physics Vision ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await ctx.newPage()
  page.setDefaultTimeout(25000)
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()) })
  const slide = async (label, rights) => {
    const th = page.locator(`[aria-label="${label}"] [role="slider"]`).first()
    await th.focus()
    await page.keyboard.press('Home')
    for (let i = 0; i < rights; i++) await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(150)
  }
  try {
    await page.goto(URL)
    await page.waitForTimeout(4500)
    await page.getByRole('button', { name: /start measuring/i }).click({ force: true })
    await page.waitForTimeout(1200)
    await calibrate(page)

    // Venue toggle
    await page.locator('[data-testid="venue-workshop"]').click({ force: true })
    await page.waitForTimeout(800)
    check('yard: venue switches to the workshop', (await simGet(page, 's.venue')) === 'workshop')

    // Launch tab, slingshot 6.5 m/s at 30 deg, target 4.5 m, ring called at 4.4 m
    await page.locator('[data-testid="tab-launch"]').click({ force: true })
    await page.waitForTimeout(900)
    await slide('Pull-back', 9) // 0.2 + 9*0.05 = 0.65 -> 6.5 m/s
    check('yard: launch-speed readout follows the pull', /6\.5/.test(await page.locator('[data-testid="launch-speed"]').textContent()))
    await slide('Launch angle', 15) // 15 + 15 = 30 deg
    await page.getByRole('button', { name: '4.5 m', exact: true }).click({ force: true })
    await slide('Landing call distance', 34) // 1.0 + 34*0.1 = 4.4 m
    check('yard: prediction ring committed', Math.abs((await simGet(page, 's.predictRing')) - 4.4) < 1e-6)

    await page.locator('[data-testid="fire"]').click({ force: true })
    await waitSim(page, '!s.launching && s.launchDone > 0', 25000)
    await page.waitForTimeout(600)
    const log = await simGet(page, 's.launchLog[s.launchLog.length-1]')
    // Flat-floor model: R = vx*(vy+sqrt(vy^2+2 g h0))/g with v0 6.5 at 30 deg from 0.5 m
    const th = Math.PI / 6, v0 = 6.5, g = 9.81, h0 = 0.5
    const vx = v0 * Math.cos(th), vy = v0 * Math.sin(th)
    const T = (vy + Math.sqrt(vy * vy + 2 * g * h0)) / g
    const R = vx * T
    check('yard: launch lands where the model says', Math.abs(log.range - R) < 0.05, `${log.range.toFixed(3)} vs ${R.toFixed(3)}`)
    check('yard: time of flight matches', Math.abs(log.tof - T) < 0.02, `${log.tof.toFixed(3)} vs ${T.toFixed(3)}`)
    check('yard: mission "Hit the ring" completes', await missionDone(page, 'hit-target'))
    check('yard: mission "Call the landing" completes', await missionDone(page, 'place-it'), `gap ${log.ringGap}`)
    check('yard: Scout records a launch reading', (await page.evaluate(() => document.body.textContent.includes('Scout measured'))))

    // Best angle: two more angles at the same speed
    await slide('Launch angle', 30) // 45 deg
    await page.locator('[data-testid="fire"]').click({ force: true })
    await waitSim(page, '!s.launching && s.launchDone > 1', 25000)
    await slide('Launch angle', 45) // 60 deg
    await page.locator('[data-testid="fire"]').click({ force: true })
    await waitSim(page, '!s.launching && s.launchDone > 2', 25000)
    await page.waitForTimeout(600)
    check('yard: mission "Find the best angle" completes', await missionDone(page, 'best-angle'))
    check('yard: ghost arc kept from the previous flight', (await simGet(page, 's.ghostFlight !== null')))

    // Same arc, different toy: catapult wound to the same 6.5 m/s at 60 deg
    check('yard: trebuchet unlocks after Hit the ring', await simGet(page, 's.trebuchetUnlocked'))
    await page.locator('[data-testid="launcher-catapult"]').click({ force: true })
    await page.waitForTimeout(400)
    await slide('Tension', 9) // 1 + 9*0.25 = 3.25 -> 6.5 m/s
    await slide('Launch angle', 45) // 60 deg
    await page.locator('[data-testid="fire"]').click({ force: true })
    await waitSim(page, '!s.launching && s.launchDone > 3', 25000)
    await page.waitForTimeout(600)
    check('yard: mission "Same arc, different toy" completes', await missionDone(page, 'same-arc'))

    // Trebuchet on Earth and Moon (Analyst): speed honestly depends on g
    await page.getByRole('button', { name: 'Analyst', exact: true }).first().click({ force: true })
    await page.waitForTimeout(400)
    await page.locator('[data-testid="launcher-trebuchet"]').click({ force: true })
    await page.waitForTimeout(400)
    await page.locator('[data-testid="fire"]').click({ force: true })
    await waitSim(page, '!s.launching && s.launchDone > 4', 25000)
    const vEarth = await simGet(page, 's.launchLog[s.launchLog.length-1].v0')
    await page.getByRole('button', { name: /^Moon/ }).click({ force: true })
    await page.waitForTimeout(400)
    await page.locator('[data-testid="fire"]').click({ force: true })
    await waitSim(page, '!s.launching && s.launchDone > 5', 30000)
    await page.waitForTimeout(600)
    const vMoon = await simGet(page, 's.launchLog[s.launchLog.length-1].v0')
    check('yard: trebuchet throws slower on the Moon (v ∝ √g)', Math.abs(vEarth / vMoon - Math.sqrt(9.81 / 1.62)) < 0.02, `${vEarth.toFixed(2)} vs ${vMoon.toFixed(2)}`)
    check('yard: mission "A trebuchet on the Moon" completes', await missionDone(page, 'trebuchet-moon'))

    // Physics Vision is one toggle
    await page.locator('[data-testid="vision-toggle"]').click({ force: true })
    await page.waitForTimeout(300)
    check('yard: Physics Vision toggles off', (await simGet(page, 's.visionOn')) === false)
    await page.locator('[data-testid="vision-toggle"]').click({ force: true })
    await page.waitForTimeout(300)
    check('yard: Physics Vision toggles back on', (await simGet(page, 's.visionOn')) === true)

    await page.screenshot({ path: '/tmp/arcade/shots/verify-yard.png' })
    check('no console errors (yard)', errors.length === 0, errors.slice(0, 3).join(' | '))
  } catch (e) {
    results.push('FAIL yard crashed — ' + String(e).split('\n')[0])
    console.log(results[results.length - 1])
    await page.screenshot({ path: '/tmp/arcade/shots/verify-yard-crash.png' }).catch(() => {})
  }
  await ctx.close()
}

await browser.close()
console.log(results.join('\n'))
const fails = results.filter((r) => r.startsWith('FAIL')).length
console.log(`\n${results.length - fails}/${results.length} passed`)
