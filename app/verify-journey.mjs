/**
 * Blood Voyage — Oxygen Journey verification.
 * Serves dist/ over HTTP, rides the loop by warping the sim, and checks the
 * journey machine, hero cargo, meet-the-cell story and HUD against reality.
 * Run: node verify-journey.mjs   (symlink global playwright as node_modules)
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const html = readFileSync(resolve('dist/index.html'))
const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end(html)
})
await new Promise((r) => server.listen(4173, r))

const results = []
const check = (name, ok, extra = '') => {
  results.push([name, ok])
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('ERR_TUNNEL_CONNECTION_FAILED')) errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://127.0.0.1:4173/index.html#/blood')
await page.waitForTimeout(4000)

// 1 — welcome overlay
check('welcome shows the journey framing', await page.getByText('The Oxygen Journey').count() > 0)
const startBtn = page.getByRole('button', { name: /Start in the lungs/i })
check('start button present', await startBtn.count() === 1)
await startBtn.click({ force: true })
await page.waitForTimeout(2500)

// 2 — journey state exists and starts in the lungs
let j = await page.evaluate(() => {
  const j = window.__journey
  return j ? { stage: j.stageIndex, lap: j.lap, o2: j.o2, co2: j.co2, dist: j.dist } : null
})
check('journey handle exposed', !!j)
check('ride starts in the lungs (stage 0, lap 0)', j && j.stage === 0 && j.lap === 0)
check('starts part-loaded at rest (venous reserve, not empty)', j && j.o2 === 3 && j.co2 <= 1, JSON.stringify(j))
check('HUD shows The lungs', await page.getByText('The lungs').count() > 0)
check('race HUD shows next checkpoint', await page.getByText(/^Next$/i).count() > 0)
check('race HUD names the left heart as next', await page.getByText(/The left heart/i).count() > 0)
await page.screenshot({ path: 'shots/journey-lungs.png' })

// 3 — mid-lungs: O₂ loading up
await page.evaluate(() => { window.__bloodSim.camZ = -40 })
await page.waitForTimeout(1500)
j = await page.evaluate(() => ({ o2: window.__journey.o2, co2: window.__journey.co2 }))
check('late lungs: O₂ topped up, CO₂ breathed out', j.o2 === 4 && j.co2 === 0, JSON.stringify(j))

// 4 — heart
await page.evaluate(() => { window.__bloodSim.camZ = -60 })
await page.waitForTimeout(1500)
j = await page.evaluate(() => ({ stage: window.__journey.stageIndex, o2: window.__journey.o2 }))
check('left heart reached with full O₂', j.stage === 1 && j.o2 === 4, JSON.stringify(j))
check('HUD shows The left heart', await page.getByText('The left heart').count() > 0)
const race1 = await page.evaluate(() => ({
  split: window.__journey.lastSplit,
  crossed: window.__journey.crossedIndex,
}))
// Intent is "crossing a gate records a split", not "exactly one gate has been
// passed": camZ −60 clears two of them, so the old `crossed === 1` made this a
// test of the ride's pacing rather than of the split timer. Stale since the
// gates were respaced — reproduced identically on an unmerged blood6 build, so
// it is not a merge regression.
check('checkpoint crossing recorded a sector split', race1.crossed >= 1 && typeof race1.split === 'number', JSON.stringify(race1))
check('checkpoint banner shown', await page.getByText(/Checkpoint/i).count() > 0)
await page.screenshot({ path: 'shots/journey-heart.png' })

// 4b — gate beacon visible ahead (approaching the capillary gate at 280)
await page.evaluate(() => { window.__bloodSim.camZ = -112 })
await page.waitForTimeout(1500)
await page.screenshot({ path: 'shots/journey-gate-ahead.png' })

// 5 — capillary: bore must be narrow in the sim AND stage detected
await page.evaluate(() => { window.__bloodSim.camZ = -145 })
await page.waitForTimeout(1500)
j = await page.evaluate(() => ({ stage: window.__journey.stageIndex }))
check('capillary stage reached', j.stage === 3)
check('HUD shows A capillary', await page.getByText('A capillary').count() > 0)
await page.screenshot({ path: 'shots/journey-capillary.png' })

// 6 — tissue + meet-the-cell story (focus dist = 357 + 0.34×115 ≈ 396)
await page.evaluate(() => { window.__bloodSim.camZ = -188 })
await page.waitForTimeout(2500)
let story = await page.evaluate(() => ({
  active: window.__journey.beatActive,
  line: window.__journey.beatLine,
}))
check('meet-the-cell story activates at the featured cell', story.active === true, JSON.stringify(story))
check('story narration on screen', await page.getByText(/body cell — a tiny living unit|slow down/i).count() > 0)
check('flow crawls during the story', await page.evaluate(() => window.__bloodSim.flowNow < 1))
await page.screenshot({ path: 'shots/journey-cell-story.png' })

// let two lines play, then skip
await page.waitForTimeout(9000)
await page.screenshot({ path: 'shots/journey-cell-labels.png' })
const skip = page.getByRole('button', { name: /Skip story/i })
check('skip button present', await skip.count() === 1)
await skip.click({ force: true })
await page.waitForTimeout(1200)
story = await page.evaluate(() => ({
  active: window.__journey.beatActive,
  done: window.__journey.beatDone,
  o2: window.__journey.o2,
  co2: window.__journey.co2,
}))
check('skip ends the story for good', !story.active && story.done)
check('resting handover: 1 of 4 given up, not all', story.o2 === 3 && story.co2 === 1, JSON.stringify(story))

// 6c — seven stages: the heart is crossed TWICE (double circulation)
const stages = await page.evaluate(() => window.__stages)
check('seven stages on the lap', Array.isArray(stages) && stages.length === 7, JSON.stringify(stages))
check('both heart crossings present', Array.isArray(stages) && stages.includes('leftHeart') && stages.includes('rightHeart'))

// 6d — demand dial drives heart rate, flow and extraction
const restBpm = await page.evaluate(() => window.__bloodSim.bpm)
check('resting heart rate is 70 bpm', restBpm === 70, `bpm=${restBpm}`)
await page.getByRole('radio', { name: /Sprinting/i }).click({ force: true })
await page.waitForTimeout(900)
const sprint = await page.evaluate(() => ({
  bpm: window.__bloodSim.bpm,
  speed: window.__bloodSim.speed,
  breaths: window.__bloodSim.breathsPerMin,
  demand: window.__journey.demand,
}))
check('sprinting raises heart rate to 180', sprint.bpm === 180, JSON.stringify(sprint))
check('sprinting speeds the flow', sprint.speed > 2)
check('sprinting raises the breathing rate', sprint.breaths >= 40)
await page.screenshot({ path: 'shots/journey-sprint.png' })
// extraction climbs with demand: 3 of 4 handed over
await page.evaluate(() => { window.__bloodSim.camZ = -250 })
await page.waitForTimeout(1200)
const sprintCargo = await page.evaluate(() => ({ o2: window.__journey.o2, co2: window.__journey.co2 }))
check('sprinting extracts 3 of 4 (venous sat ~25%)', sprintCargo.o2 === 1, JSON.stringify(sprintCargo))
// mixed-demand lap must not set a per-demand best
check('changing demand mid-lap voids the clean-lap flag', await page.evaluate(() => window.__journey.lapDemand === -1))
await page.getByRole('radio', { name: /Resting/i }).click({ force: true })
await page.waitForTimeout(700)
check('back to resting: 70 bpm', await page.evaluate(() => window.__bloodSim.bpm) === 70)

// 7 — vein
await page.evaluate(() => { window.__bloodSim.camZ = -245 })
await page.waitForTimeout(1500)
j = await page.evaluate(() => ({ stage: window.__journey.stageIndex, o2: window.__journey.o2, co2: window.__journey.co2 }))
check('vein at rest: still 3 of 4 loaded (venous reserve)', j.stage === 5 && j.o2 === 3 && j.co2 === 1, JSON.stringify(j))
check('delivery counted on leaving the tissue', await page.evaluate(() => window.__journey.o2Delivered) >= 1)
await page.screenshot({ path: 'shots/journey-vein.png' })

// 8 — lap 2: back at the lungs, story never replays
await page.evaluate(() => { window.__bloodSim.camZ = -320 })
await page.waitForTimeout(1500)
j = await page.evaluate(() => ({ stage: window.__journey.stageIndex, lap: window.__journey.lap }))
check('loop completes — lap 2 back in the lungs', j.stage === 0 && j.lap === 1, JSON.stringify(j))
check('HUD shows Lap 2', await page.getByText(/Lap 2/).count() > 0)
// A lap reached by warping the camera is NOT a lap that was ridden, and the
// cabinet must refuse to time it — otherwise the race HUD and the data table
// could both be gamed by anything that moves the camera.
const race2 = await page.evaluate(() => ({
  lastLap: window.__journey.lastLap,
  best: window.__journey.bestLap,
  measurable: window.__journey.lapMeasurable,
}))
check('a warped lap is refused as a timed lap', race2.best === null, JSON.stringify(race2))
check('lap counter still advances for the ride', await page.getByText(/Lap 2/).count() > 0)
await page.screenshot({ path: 'shots/journey-lap-banner.png' })
await page.evaluate(() => { window.__bloodSim.camZ = -(299 + 188) })
await page.waitForTimeout(2000)
check('story does not replay on lap 2', await page.evaluate(() => !window.__journey.beatActive))

// 9 — cells still flowing and counted
const passed = await page.evaluate(() => window.__bloodSim.cellsPassed)
check('red cells counted past the camera', passed > 0, `cellsPassed=${passed}`)

// 10 — controls still work (pause)
const pause = page.getByRole('button', { name: /^Pause$/ })
if (await pause.count()) {
  await pause.click({ force: true })
  await page.waitForTimeout(400)
  check('pause stops the flow', await page.evaluate(() => window.__bloodSim.flowNow === 0))
} else {
  check('pause button found', false)
}

// 11 — no console errors
check('zero console errors', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()
server.close()
const fails = results.filter(([, ok]) => !ok).length
console.log(`\n${results.length - fails}/${results.length} checks passed`)
process.exit(fails ? 1 : 0)
