/**
 * Blood Voyage — Build C: the measurement loop.
 * Rides real laps (no warping through the finish line) so trials are honest.
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'

const html = readFileSync('dist/index.html')
const server = createServer((q, r) => { r.writeHead(200, {'content-type':'text/html'}); r.end(html) })
await new Promise((r) => server.listen(4178, r))

const results = []
const check = (n, ok, extra = '') => { results.push([n, ok]); console.log(`${ok?'PASS':'FAIL'}  ${n}${extra?'  — '+extra:''}`) }
const realError = (t) => !t.includes('ERR_TUNNEL_CONNECTION_FAILED') && !t.includes('ERR_NAME_NOT_RESOLVED')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1366, height: 860 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error' && realError(m.text())) errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://127.0.0.1:4178/index.html#/blood')
await page.waitForTimeout(3500)
await page.getByRole('button', { name: /Start in the lungs/i }).click({ force: true })
// Cell crowd is the controlled variable: held at its lowest setting for every
// trial, which also keeps this software-rendered sandbox above 4 fps so the
// ride advances in real time rather than in slow motion.
await page.evaluate(() => { window.__bloodSim.density = 600 })
await page.waitForTimeout(2000)

check('delivery lab is on screen', await page.getByText('Delivery lab').count() > 0)
check('lab starts with nothing measured', await page.getByText('0/3 measured').count() > 0)

/**
 * Ride a real lap. No warping: the sim now refuses to record a lap that was
 * jumped or joined part-way, so the only way to get a measurement is to
 * actually ride one — which is also the only honest way to test it.
 *
 * The meet-the-cell stop is skipped as soon as it appears, the way a learner
 * who has already seen it would.
 */
async function rideALap(label, budgetMs) {
  const startTrials = (await page.evaluate(() => window.__bloodLab())).trials.length
  const t0 = Date.now()
  while (Date.now() - t0 < budgetMs) {
    await page.waitForTimeout(700)
    const skip = page.getByRole('button', { name: /Skip story/i })
    if (await skip.count()) await skip.click({ force: true }).catch(() => {})
    const n = (await page.evaluate(() => window.__bloodLab())).trials.length
    if (n > startTrials) {
      const t = await page.evaluate(() => window.__journey.lastLap)
      console.log(`   (${label} lap: ${t?.toFixed(1)}s)`)
      return true
    }
  }
  console.log(`   (${label} lap did NOT complete in ${budgetMs}ms)`)
  return false
}

// --- trial 1: resting
check('resting lap completes under its own power', await rideALap('resting', 100000))
let lab = await page.evaluate(() => window.__bloodLab())
check('a clean lap becomes a recorded trial', lab.trials.length === 1, JSON.stringify(lab.trials))
check('resting trial delivers 1 O₂ per trip', lab.trials[0]?.extraction === 1)
check('mission: first circuit completes on evidence', lab.done.includes('first-lap'))
await page.screenshot({ path: 'shots/b6-lab-one.png' })

// --- prediction gate appears for the next level
await page.getByRole('radio', { name: /Jogging/i }).click({ force: true })
await page.waitForTimeout(900)
check('prediction is requested before an untried demand',
  await page.getByText(/will oxygen delivered per minute be/i).count() > 0)
await page.getByRole('button', { name: /^higher$/i }).click({ force: true })
await page.waitForTimeout(500)
check('prediction is committed', (await page.evaluate(() => window.__bloodLab())).predicted.includes(1))
check('mission: predicting completes', (await page.evaluate(() => window.__bloodLab())).done.includes('predict-once'))

// --- trial 2: jogging
check('jogging lap completes', await rideALap('jogging', 95000))
lab = await page.evaluate(() => window.__bloodLab())
check('second trial recorded', lab.trials.length === 2)
const rest = lab.trials.find((t) => t.demand === 0)
const jog = lab.trials.find((t) => t.demand === 1)
check('jogging is a faster lap than resting', jog.lapTime < rest.lapTime, `${jog.lapTime} < ${rest.lapTime}`)
check('jogging delivers 2 O₂ per trip', jog.extraction === 2)
check('delivery rate rises faster than trips alone',
  jog.rate / rest.rate > jog.tripsPerMin / rest.tripsPerMin,
  `rate×${(jog.rate/rest.rate).toFixed(2)} vs trips×${(jog.tripsPerMin/rest.tripsPerMin).toFixed(2)}`)
check('the relationship prompt appears once two levels exist',
  await page.getByText(/trips per minute/i).count() > 0)

// --- trial 3: sprinting
await page.getByRole('radio', { name: /Sprinting/i }).click({ force: true })
await page.waitForTimeout(700)
const pbtn = page.getByRole('button', { name: /^higher$/i })
if (await pbtn.count()) await pbtn.click({ force: true })
check('sprinting lap completes', await rideALap('sprinting', 75000))
lab = await page.evaluate(() => window.__bloodLab())
check('all three demand levels measured', new Set(lab.trials.map((t) => t.demand)).size === 3)
check('mission: measure all three completes', lab.done.includes('three-levels'))
check('mission: both factors identified', lab.done.includes('both-factors'))
check('lab header shows 3/3', await page.getByText('3/3 measured').count() > 0)
await page.screenshot({ path: 'shots/b6-lab-full.png' })

// --- a lap with the dial moved mid-way must NOT be recorded
const before = lab.trials.length
await page.waitForTimeout(9000) // get clear of the lap-start grace window
await page.getByRole('radio', { name: /Resting/i }).click({ force: true })
await page.waitForTimeout(500)
check('moving the dial mid-lap voids the trial',
  await page.evaluate(() => window.__journey.lapDemand === -1))
/**
 * Watch the specific lap rollover rather than "wait for a trial to appear":
 * a discarded lap is silent, so waiting for a trial just catches the NEXT,
 * clean lap and looks like a pass-through failure.
 */
const lapBefore = await page.evaluate(() => window.__journey.lap)
let rolled = false
const tMix = Date.now()
while (Date.now() - tMix < 95000) {
  await page.waitForTimeout(700)
  if ((await page.evaluate(() => window.__journey.lap)) > lapBefore) { rolled = true; break }
}
lab = await page.evaluate(() => window.__bloodLab())
check('the mixed-demand lap did complete', rolled)
check('a mixed-demand lap is discarded, not recorded', lab.trials.length === before,
  `${before} → ${lab.trials.length}`)

// --- and a lap that was jumped rather than ridden is refused too.
// Park mid-lap first so the jump cannot roll the lap over (which legitimately
// resets the flag for the fresh lap).
await page.evaluate(() => {
  const lap = Math.floor(window.__journey.dist / 299)
  window.__bloodSim.camZ = -(lap * 299 + 90)
})
await page.waitForTimeout(1200)
await page.evaluate(() => { window.__bloodSim.camZ -= 40 })
await page.waitForTimeout(600)
check('a jumped lap is marked unmeasurable',
  await page.evaluate(() => window.__journey.lapMeasurable === false))

// --- write-up gates the explaining mission
const claim = page.getByPlaceholder(/Claim:/i)
if (await claim.count()) {
  await claim.fill('Working harder makes oxygen delivery go up a lot.')
  await page.getByPlaceholder(/Because/i).fill('Trips per minute went up AND each trip handed over more oxygen.')
  await page.waitForTimeout(600)
  lab = await page.evaluate(() => window.__bloodLab())
  check('mission: explaining completes on a real write-up', lab.done.includes('explain'))
} else {
  check('write-up available at this band', false)
}

// --- learning events reached the platform log
const evts = await page.evaluate(() => {
  const raw = window.localStorage.getItem('ploobia.events.v1')
  if (!raw) return null
  const all = JSON.parse(raw).filter((e) => e.cabinet === 'blood')
  return all.reduce((acc, e) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc }, {})
})
check('readings logged to the platform event log', !!evts && evts['reading.recorded'] >= 3, JSON.stringify(evts))
check('predictions logged', !!evts && evts['prediction.committed'] >= 1)
check('missions logged', !!evts && evts['mission.completed'] >= 4)
check('write-up logged', !!evts && evts['writeup.completed'] >= 1)

// --- honest laps DO produce bests, a ghost, and survive a reload
const real = await page.evaluate(() => ({
  bests: window.__journey.bestByDemand,
  stored: window.localStorage.getItem('ploobia.blood.bests.v1'),
  ghost: window.__ghost ? window.__ghost() : null,
  hudBest: window.__journey.bestLap,
}))
check('ridden laps set per-demand bests', real.bests.filter(Boolean).length === 3, JSON.stringify(real.bests))
check('HUD best lap is a real time', typeof real.hudBest === 'number' && real.hudBest > 5, String(real.hudBest))
check('bests written to storage', typeof real.stored === 'string' && real.stored.includes('.'), String(real.stored))
check('ghost lap exists once a best is set', real.ghost !== null && typeof real.ghost.frac === 'number')
await page.reload()
await page.waitForTimeout(3000)
const reloaded = await page.evaluate(() => window.__journey.bestByDemand)
check('bests survive a reload', Array.isArray(reloaded) && reloaded.filter(Boolean).length === 3, JSON.stringify(reloaded))

check('zero console errors', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()
server.close()
const fails = results.filter(([, ok]) => !ok).length
console.log(`\n${results.length - fails}/${results.length} checks passed`)
process.exit(fails ? 1 : 0)
