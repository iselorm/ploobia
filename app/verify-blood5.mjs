/**
 * Blood Voyage — Build B checks: named rivals, audio, ghost/persistence,
 * compact drawer, and the low-tier draw-call budget.
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'

const html = readFileSync('dist/index.html')
const server = createServer((q, r) => { r.writeHead(200, {'content-type':'text/html'}); r.end(html) })
await new Promise((r) => server.listen(4177, r))

const results = []
const check = (n, ok, extra = '') => { results.push([n, ok]); console.log(`${ok?'PASS':'FAIL'}  ${n}${extra?'  — '+extra:''}`) }

const browser = await chromium.launch()
const errors = []

// ---------- desktop ----------
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
// The sandbox has no outbound network; ignore its tunnel failures.
const realError = (t) => !t.includes('ERR_TUNNEL_CONNECTION_FAILED') && !t.includes('ERR_NAME_NOT_RESOLVED')
page.on('console', (m) => { if (m.type() === 'error' && realError(m.text())) errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://127.0.0.1:4177/index.html#/blood')
await page.waitForTimeout(3500)
await page.getByRole('button', { name: /Start in the lungs/i }).click({ force: true })
await page.waitForTimeout(3000)

// 1 — named white-cell rivals
const roster = await page.evaluate(() => window.__wbcRoster)
check('white cells are real types, not clones',
  Array.isArray(roster) && new Set(roster).size >= 4, JSON.stringify(roster))
await page.evaluate(() => { window.__bloodSim.camZ = -100 })
await page.waitForTimeout(2500)
const plates = await page.evaluate(() => window.__tagNames || [])
check('rival nameplates carry distinct names', new Set(plates).size >= 4, JSON.stringify(plates))
await page.screenshot({ path: 'shots/b5-rivals.png' })

// 2 — audio layer present, muted state honoured and persisted
const audio = await page.evaluate(() => ({ started: window.__audioStarted, muted: window.__audioMuted }))
check('audio context started from the Start gesture', audio.started === true, JSON.stringify(audio))
check('audio starts unmuted', audio.muted === false)
const muteBtn = page.getByRole('button', { name: /Mute sound/i })
check('mute control present', await muteBtn.count() === 1)
await muteBtn.click({ force: true })
await page.waitForTimeout(400)
check('mute takes effect', await page.evaluate(() => window.__audioMuted) === true)
const persisted = await page.evaluate(() => window.localStorage.getItem('ploobia.audio.v1'))
check('mute setting is persisted', persisted === 'muted', String(persisted))
await page.getByRole('button', { name: /Unmute sound/i }).click({ force: true })
await page.waitForTimeout(300)

// 3 — a lap that was jumped rather than ridden must not become a record.
//     (Honest lap timing and the ghost are covered in verify-blood6, which
//      rides real laps rather than warping.)
await page.evaluate(() => { window.__bloodSim.camZ = -400 })
await page.waitForTimeout(2000)
const bests = await page.evaluate(() => ({
  mem: window.__journey.bestByDemand,
  measurable: window.__journey.lapMeasurable,
}))
check('a jumped lap sets no per-demand best', bests.mem.every((b) => b === null), JSON.stringify(bests))
check('ghost stays absent without a genuine best',
  await page.evaluate(() => (window.__ghost ? window.__ghost() : null)) === null)

// 4 — the stop arms on approach, then becomes replayable
await page.evaluate(() => { window.__bloodSim.camZ = -190 })
await page.waitForTimeout(2500)
check('cell stop armed by reaching the featured cell',
  await page.evaluate(() => window.__journey.beatActive === true))
const skipBtn = page.getByRole('button', { name: /Skip story/i })
check('skip control available while the stop plays', await skipBtn.count() === 1)
await skipBtn.click({ force: true })
await page.waitForTimeout(800)
check('skipping marks the stop as done', await page.evaluate(() => window.__journey.beatDone === true))
await page.waitForTimeout(700)
const replay = page.getByRole('button', { name: /Replay the cell stop/i })
check('replay control appears after the stop has played', await replay.count() === 1)
if (await replay.count()) {
  await replay.click({ force: true })
  await page.waitForTimeout(400)
  check('replay re-arms the stop', await page.evaluate(() => window.__journey.beatDone === false))
}

// 5 — the bests store round-trips through a reload
await page.evaluate(() => {
  window.localStorage.setItem('ploobia.blood.bests.v1', JSON.stringify([42.5, null, null]))
})
await page.reload()
await page.waitForTimeout(3500)
const afterReload = await page.evaluate(() => window.__journey.bestByDemand)
check('saved bests are restored on reload', afterReload?.[0] === 42.5, JSON.stringify(afterReload))

// 6 — draw-call budget at the low quality tier
await page.evaluate(() => { window.__setTier && window.__setTier('low') })
await page.waitForTimeout(3000)
const perf = await page.evaluate(() => window.__renderInfo && window.__renderInfo())
check('low tier reports render stats', !!perf, JSON.stringify(perf))
if (perf) {
  check('low-tier draw calls within budget (<160)', perf.calls < 160, `calls=${perf.calls}`)
  check('low-tier triangle count within budget (<700k)', perf.triangles < 700000, `tris=${perf.triangles}`)
}
await page.screenshot({ path: 'shots/b5-lowtier.png' })
await page.close()

// ---------- phone ----------
const phone = await browser.newPage({ viewport: { width: 390, height: 720 } })
phone.on('pageerror', (e) => errors.push(String(e)))
phone.on('console', (m) => { if (m.type() === 'error' && realError(m.text())) errors.push(m.text()) })
await phone.goto('http://127.0.0.1:4177/index.html#/blood')
await phone.waitForTimeout(4000)
await phone.getByRole('button', { name: /Start in the lungs/i }).click({ force: true })
await phone.waitForTimeout(2500)
const drawerTab = phone.getByRole('button', { name: /Controls/i })
check('phone gets the compact bottom drawer', await drawerTab.count() >= 1)
await drawerTab.first().click({ force: true })
await phone.waitForTimeout(600)
check('demand dial reachable inside the drawer',
  await phone.getByRole('radio', { name: /Sprinting/i }).count() === 1)
await phone.screenshot({ path: 'shots/b5-phone.png' })
await phone.close()

check('zero console errors', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()
server.close()
const fails = results.filter(([, ok]) => !ok).length
console.log(`\n${results.length - fails}/${results.length} checks passed`)
process.exit(fails ? 1 : 0)
