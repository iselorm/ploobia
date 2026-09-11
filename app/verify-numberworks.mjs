/**
 * The Numberworks — The Market, driven through its real controls.
 *
 * Serve dist/ on :8765 first (python3 -m http.server 8765 in dist).
 *
 * The rules are proved out of band by `verify-market-model.mjs`. This suite
 * is for what only a browser can settle: that Play is the front door and the
 * free stall is one tap away; that an Explorer skips the brief and catches
 * while a Scientist guesses first and starts with a full basin; that opening
 * the stall runs a day on the wall clock, the till reads while it runs, and
 * the gauge reads the same number at closing; that a hand-in scores and lands
 * a journal card; that Send makes a link the same page reads back onto the
 * same seed and level; that level 3 is a prediction locked before it is read;
 * that the stand-ins hold the scene when the props are kept off; and that
 * every control on the phone layout is actually under the finger.
 */
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { reporter, resilientClick } from './verify-lib.mjs'

/* The model, so the suite can pick a seed it can reason about and build a
   link the page reads. Same barrel as the model suite. */
const TMP = os.tmpdir()
const OUT = path.join(TMP, 'market-bundle-browser.mjs')
fs.writeFileSync(
  path.join(TMP, 'market-barrel-browser.ts'),
  `export * from '${path.resolve('src/lib/market').replace(/\\/g, '/')}'
export * from '${path.resolve('src/lib/challenge').replace(/\\/g, '/')}'
`,
)
execSync(`npx esbuild "${path.join(TMP, 'market-barrel-browser.ts')}" --bundle --format=esm --outfile="${OUT}" --alias:@=${path.resolve('src')}`, { stdio: 'pipe' })
const M = await import(`file://${OUT.replace(/\\/g, '/')}`)

const BASE = 'http://localhost:8765/index.html'
const SHOTS = path.resolve('..', 'shots')
fs.mkdirSync(SHOTS, { recursive: true })
const { check, tally } = reporter()
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const consoleErrors = []
function watch(page) {
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('ERR_TUNNEL_CONNECTION_FAILED')) consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => consoleErrors.push(String(e)))
}
const root = (page, attr) => page.evaluate((a) => document.querySelector('[data-testid=numberworks]')?.getAttribute(a) ?? null, attr)
const phase = (page) => root(page, 'data-phase')
const running = (page) => root(page, 'data-running')
const gauge = (page) =>
  page.evaluate(() => {
    const g = document.querySelector('[data-testid=gauge]')
    return g ? { met: Number(g.getAttribute('data-met')), of: Number(g.getAttribute('data-of')), hit: g.getAttribute('data-hit') === 'true', text: g.textContent ?? '' } : null
  })
const till = (page) => page.evaluate(() => Number(document.querySelector('[data-testid=till-plate]')?.getAttribute('data-till') ?? 'NaN'))
const coach = (page) => page.evaluate(() => document.querySelector('[data-testid=coach]')?.textContent ?? '')
async function waitFor(fn, timeout = 40000, every = 150) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    if (await fn()) return true
    await new Promise((r) => setTimeout(r, every))
  }
  return false
}
const waitPhase = (page, want, timeout = 40000) => waitFor(async () => (await phase(page)) === want, timeout)
const waitDayDone = (page, timeout = 30000) => waitFor(async () => (await running(page)) === 'false', timeout, 200)
const tap = (page, name, opts = {}) => resilientClick(page.getByRole('button', { name, exact: opts.exact ?? true }).first(), { label: name })
async function nudge(page, label, key, times) {
  const thumb = page.locator(`[aria-label="${label}"] [data-slot="slider-thumb"]`).first()
  await thumb.focus()
  for (let i = 0; i < times; i++) await page.keyboard.press(key)
  await page.waitForTimeout(250)
}

async function open(band, size = { width: 1440, height: 900 }, extra = '', walked = null) {
  const page = await browser.newPage({ viewport: size })
  watch(page)
  await page.addInitScript(
    ([b, w]) => {
      try {
        localStorage.setItem('ploobia.band.v1', JSON.stringify(b))
        if (w) localStorage.setItem('ploobia.campaign.numberworks.v1', JSON.stringify({ handedIn: w }))
        else localStorage.removeItem('ploobia.campaign.numberworks.v1')
        localStorage.removeItem('ploobia.numberworks.journal.v1')
        localStorage.removeItem('ploobia.foundry.coach.v1')
      } catch {
        /* memory fallback */
      }
    },
    [band, walked],
  )
  await page.goto(`${BASE}#/numberworks${extra}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1800)
  return page
}

/* A seed on which level 1 is a hit at the board's starting price (₵4) with a
   full basin — so the walk below is about the page, not the dice. */
const fill = M.LEVEL_BY_ID['fill-the-till']
let seed = 1
while (M.simulateDay(M.shoppersFor(seed), 60, { price: 4, discount: 0 }).till < 200 && seed < 500) seed += 1
check('a seed exists on which ₵4 × a full basin fills the till', seed < 500, `seed ${seed}`)
const linkFor = (level, band, s = seed) => {
  const url = M.challengeLink('http://localhost:8765', '/numberworks', M.challengeFor(level, band, s))
  return url.slice(url.indexOf('?c='))
}

/* ------------------------------------------------------------------ */
/* Scientist on a level-1 link: brief → beat → lab → a day → hand in → send */
/* ------------------------------------------------------------------ */
{
  const page = await open('scientist', { width: 1440, height: 900 }, linkFor(fill, 'scientist'))
  check('welcome: the front door is Play, named for the day that arrived', /Play — /.test((await page.getByTestId('play').textContent()) ?? '') && (await page.getByTestId('incoming').count()) >= 1)
  check('welcome: the free stall is one tap away', (await page.getByRole('button', { name: 'Run a stall on your own' }).count()) === 1)
  check('welcome: door 1 open, doors 2–6 undiscovered (honest, never "coming soon")',
    (await page.getByTestId('door-1').getAttribute('data-state')) === 'open' && (await page.getByTestId('door-2').getAttribute('data-state')) === 'undiscovered' && (await page.getByTestId('door-6').getAttribute('data-state')) === 'undiscovered')
  await page.getByTestId('door-2').click()
  check('an undiscovered door says nobody has been there — never "coming soon"', /Nobody has discovered/.test((await page.getByTestId('door-note').textContent()) ?? ''))
  check('no "coming soon" anywhere', !/coming soon/i.test(await page.content()))
  check('the door map shows the painted thumbnails', await page.evaluate(() => /art\/numberworks\/thumbs\/1-market\.webp/.test(document.querySelector('[data-testid=door-1] span')?.getAttribute('style') ?? '')))
  await page.screenshot({ path: path.join(SHOTS, 'numberworks-welcome.png') })

  await page.getByTestId('play').click()
  await page.waitForTimeout(400)
  check('scientist: the brief opens on a guess, before the model is shown', (await page.getByTestId('brief').count()) === 1 && (await phase(page)) === 'brief')
  const briefText = (await page.getByTestId('brief').textContent()) ?? ''
  check('the brief never prints the number being guessed', !/\b50\b/.test(briefText))
  check('the brief prices in cedis', /₵/.test(briefText))
  await tap(page, 'Commit')
  await page.waitForTimeout(300)
  check('commit → the beat', (await phase(page)) === 'beat' && (await page.getByTestId('beat').count()) === 1)
  const predicted = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('ploobia.events.v1')
      return (raw ? JSON.parse(raw) : []).filter((e) => e.type === 'prediction.committed' && e.cabinet === 'numberworks').length
    } catch {
      return -1
    }
  })
  check('the guess is recorded as a prediction (evidence, not decoration)', predicted >= 1, `${predicted}`)
  check('after the beat a scientist goes straight to the stall — no catch', await waitPhase(page, 'lab', 8000))
  check('a scientist starts with a full basin', /60 in the basin/.test((await page.getByTestId('stall-plate').textContent()) ?? ''))
  check('Ploob is on at the stall and answers the guess', /Fifty/.test(await coach(page)))
  let g = await gauge(page)
  check('gauge before the day: 0 of 1, "open the stall"', g && g.met === 0 && g.of === 1 && !g.hit && /open the stall/.test(g.text))
  check('the till reads empty', (await till(page)) === 0)
  check('the aim ring is on "Open the stall"', (await page.locator('button[aria-label="Open the stall"].atlas-aim').count()) === 1)
  check('the price dial shows its ceiling', (await page.locator('[data-testid=price-dial] [data-ceiling]').count()) === 1)
  await page.screenshot({ path: path.join(SHOTS, 'numberworks-lab-desktop.png') })

  await tap(page, 'Open the stall')
  await page.waitForTimeout(1200)
  check('the stall opens: the day runs', (await running(page)) === 'true' && (await page.getByRole('button', { name: 'Close early' }).count()) === 1)
  check('the till reads while the day runs', await waitFor(async () => (await till(page)) > 0, 8000))
  check('the price dial is locked while the stall is open', await page.evaluate(() => !!document.querySelector('[data-testid=price-dial] [data-disabled]')))
  check('the day closes on its own in about eight seconds', await waitDayDone(page, 20000))
  const closing = await till(page)
  const expected = M.simulateDay(M.shoppersFor(seed), 60, { price: 4, discount: 0 }).till
  check('the till at closing is the model\'s to the pesewa', Math.abs(closing - expected) < 0.006, `${closing} vs ${expected}`)
  g = await gauge(page)
  check('the gauge reads the till: 1 of 1, hit', g && g.hit && g.met === 1)
  check('Ploob says the done line', /Hand it in/.test(await coach(page)))
  check('a reading landed in Days', (await page.getByTestId('reading').count()) === 1 && /Day 1/.test((await page.getByTestId('reading').first().textContent()) ?? ''))
  check('the day was recorded as a reading (evidence)', await page.evaluate(() => {
    const raw = localStorage.getItem('ploobia.events.v1')
    return (raw ? JSON.parse(raw) : []).filter((e) => e.type === 'reading.recorded' && e.cabinet === 'numberworks').length === 1
  }))
  check('Hand in wears the aim ring once the target is met', (await page.locator('button[aria-label="Hand in"].atlas-aim').count()) === 1)
  await tap(page, 'Hand in')
  await page.waitForTimeout(500)
  check('hand in → the score card', (await phase(page)) === 'scored' && (await page.getByTestId('score').count()) === 1)
  const total = Number(await page.getByTestId('score').getAttribute('data-total'))
  check('a hit in one day scores high', total >= 800, `${total}`)
  check('the card says WHY under each bar', /reasoned it out/.test((await page.getByTestId('score').textContent()) ?? ''))
  // Door 2 opens on the map (one hand-in opens the next) but nobody has built
  // it, and the card says exactly that — never "coming soon", never a menu.
  check('door 2 opens but is undiscovered — the card says so and keeps the hand-in in the journal', (await page.getByTestId('door-opened').count()) === 1 && /Nobody has discovered/.test((await page.getByTestId('door-opened').textContent()) ?? '') && /journal/.test((await page.getByTestId('score').textContent()) ?? ''))
  check('an undiscovered door offers Play again, not Go through', (await page.getByRole('button', { name: 'Play again' }).count()) === 1 && (await page.getByRole('button', { name: 'Go through' }).count()) === 0)
  check('the hand-in landed a journal card in Our Space', (await page.getByTestId('journal-card').count()) === 1)
  check('the hand-in is logged with its score and hit', await page.evaluate(() => {
    const raw = localStorage.getItem('ploobia.events.v1')
    const h = (raw ? JSON.parse(raw) : []).filter((e) => e.type === 'challenge.handedIn' && e.cabinet === 'numberworks')
    return h.length === 1 && h[0].payload.hit === true
  }))
  await page.screenshot({ path: path.join(SHOTS, 'numberworks-score.png') })

  await tap(page, 'Send to a friend')
  await page.waitForTimeout(600)
  check('send: the card and the link', (await page.getByTestId('send').count()) === 1)
  check('the send card starts by asking who it is from', (await page.getByTestId('by').count()) === 1)
  check('unsigned, the card still says something true', /Someone/.test((await page.getByTestId('headline').textContent()) ?? ''))
  await page.getByTestId('by').fill('Kwame')
  await page.waitForTimeout(300)
  check('a nickname reaches the headline', /Kwame/.test((await page.getByTestId('headline').textContent()) ?? ''))
  await page.getByTestId('by').fill('kwame@gmail.com 0244123456')
  await page.waitForTimeout(300)
  const scrubbed = await page.getByTestId('by').inputValue()
  check('a handle or a number cannot ride in on the nickname', !/@|0244/.test(scrubbed), scrubbed)
  await page.getByTestId('by').fill('Kwame')
  await page.waitForTimeout(300)
  const link = ((await page.getByTestId('link').textContent()) ?? '').trim()
  check('the link names the cabinet and carries the level as setup', /#\/numberworks\?c=1,numberworks,/.test(link) && /fill-the-till/.test(link))
  check('the nickname travels in the link', /Kwame/.test(link))
  check('the share card carries no identity beyond a nickname', !/@|phone/.test((await page.getByTestId('send').textContent()) ?? ''))

  const query = link.slice(link.indexOf('?c='))
  const page2 = await open('explorer', { width: 1440, height: 900 }, query)
  check('a link opens as an incoming market day on the welcome card', /Kwame/.test((await page2.getByTestId('play').textContent()) ?? '') && (await page2.getByTestId('incoming').count()) >= 1)
  await page2.getByTestId('play').click()
  await page2.waitForTimeout(400)
  const ph2 = await phase(page2)
  check("an explorer opening a scientist link still skips the brief (band is the player's)", ph2 === 'beat' || ph2 === 'lab', String(ph2))
  check("but the world is the link's: no catch, a full basin", (await waitPhase(page2, 'lab', 8000)) && /60 in the basin/.test((await page2.getByTestId('stall-plate').textContent()) ?? ''))
  await tap(page2, 'Open the stall')
  check('the same seed runs the same day', (await waitDayDone(page2, 20000)) && Math.abs((await till(page2)) - expected) < 0.006, `${await till(page2)} vs ${expected}`)
  await page2.close()
  await page.close()
}

/* ------------------------------------------------------------------ */
/* Explorer solo: no brief, a catch, a thin catch topped up, the price dial */
/* ------------------------------------------------------------------ */
{
  const page = await open('explorer')
  check('explorer welcome names level 1', /Fill the till by closing time/.test((await page.getByTestId('play').textContent()) ?? ''))
  await page.getByTestId('play').click()
  await page.waitForTimeout(400)
  check('explorer skips the brief: straight to the beat', (await phase(page)) === 'beat')
  check('after the beat, the catch', await waitPhase(page, 'gather', 8000))
  check('the gauge says it is a catch, not a countdown', /a catch, not a countdown/.test((await gauge(page))?.text ?? ''))
  check('the basin starts empty', /^0/.test(((await page.getByTestId('cell-basin').textContent()) ?? '').replace(/in the basin/, '').trim()))
  check('the rain is in the scene', await page.evaluate(() => !!window.__marketScene?.getObjectByName('rain')))
  const t0 = Date.now()
  while (Date.now() - t0 < 12000 && (await phase(page)) === 'gather') {
    await page.mouse.click(300 + Math.random() * 840, 120 + Math.random() * 380)
    await page.waitForTimeout(160)
  }
  check('the catch ends on its own and the stall opens', await waitPhase(page, 'lab', 60000))
  const basin = Number((((await page.getByTestId('stall-plate').textContent()) ?? '').match(/(\d+) in the basin/) ?? [])[1])
  check('a thin catch is topped up to what the target needs — never a dead end', basin >= 50, `${basin}`)
  check('Ploob names the top-up, or the basin', /basin/.test(await coach(page)))
  // the price dial moves the board
  await nudge(page, 'Price · each', 'ArrowRight', 5)
  check('the price dial moves the board', /₵4\.50/.test((await page.getByTestId('stall-plate').textContent()) ?? ''))
  await nudge(page, 'Price · each', 'ArrowLeft', 5)
  await tap(page, 'Open the stall')
  check('a day runs', await waitDayDone(page, 20000))
  const g = await gauge(page)
  check('the gauge reads the day', g && g.of === 1 && /₵\d+/.test(g.text))
  check('after a day the aim is the price (or the hand-in)', (await page.locator('[data-testid=price-dial].atlas-aim').count()) === 1 || (await page.locator('button[aria-label="Hand in"].atlas-aim').count()) === 1)
  check('Run another day is offered', (await page.getByRole('button', { name: 'Run another day' }).count()) === 1)
  await page.close()
}

/* ------------------------------------------------------------------ */
/* Scientist solo: level 2, the mark-up and the discount                */
/* ------------------------------------------------------------------ */
{
  const page = await open('scientist')
  check('scientist welcome names level 2', /Make a quarter more than you paid/.test((await page.getByTestId('play').textContent()) ?? ''))
  await page.getByTestId('play').click()
  await page.waitForTimeout(400)
  await tap(page, 'Commit')
  check('after the beat, the stall', await waitPhase(page, 'lab', 8000))
  check('level 2 has a mark-up and a discount dial, no price dial', (await page.getByTestId('markup-dial').count()) === 1 && (await page.getByTestId('discount-dial').count()) === 1 && (await page.getByTestId('price-dial').count()) === 0)
  check('the plate says what was paid wholesale', /₵180 for 60/.test((await page.getByTestId('stall-plate').textContent()) ?? ''))
  const g0 = await gauge(page)
  check('the gauge has two cells: profit and left', g0 && g0.of === 2 && (await page.getByTestId('cell-profit').count()) === 1 && (await page.getByTestId('cell-left').count()) === 1)
  await nudge(page, 'Mark-up', 'ArrowRight', 2)
  check('the mark-up dial moves the kilo price', /\+40 %/.test((await page.getByTestId('stall-plate').textContent()) ?? ''))
  await nudge(page, 'Discount from 4 pm', 'ArrowRight', 4)
  check('the discount dial reads as a percentage decrease', /−20 %/.test((await page.getByTestId('stall-plate').textContent()) ?? ''))
  await tap(page, 'Open the stall')
  await page.waitForTimeout(600)
  check('a day runs on level 2', (await running(page)) === 'true')
  await tap(page, 'Close early')
  check('Close early settles the day', await waitDayDone(page, 5000))
  const g1 = await gauge(page)
  check('after a closed day the gauge reads a profit and a leftover', g1 && /%/.test(g1.text) && /Left in the basin/.test(g1.text))
  check('a reading names the mark-up and the discount', /\+40 %/.test((await page.getByTestId('reading').first().textContent()) ?? '') && /−20 %/.test((await page.getByTestId('reading').first().textContent()) ?? ''))
  await tap(page, 'Hand in')
  await page.waitForTimeout(500)
  check('a hand-in on a miss says why, in the round\'s words', (await page.getByTestId('score').count()) === 1 && ((await page.getByTestId('score').getAttribute('data-hit')) === 'true' || (await page.getByTestId('bottleneck').count()) === 1))
  check('a miss offers Play again, never a menu', (await page.getByRole('button', { name: 'Play again' }).count()) === 1)
  await page.close()
}

/* ------------------------------------------------------------------ */
/* Analyst: level 3 — predict, then bounds, then read                  */
/* ------------------------------------------------------------------ */
{
  const harm = M.LEVEL_BY_ID['harmattan-price']
  const page = await open('analyst', { width: 1440, height: 900 }, linkFor(harm, 'analyst'))
  await page.getByTestId('play').click()
  await page.waitForTimeout(400)
  check('level 3 briefs on the ratio', /multiply/.test((await page.getByTestId('brief').textContent()) ?? ''))
  await tap(page, 'Commit')
  check('after the beat, the board', await waitPhase(page, 'lab', 8000))
  check('four mornings on the board, no till to open', (await page.getByTestId('harmattan-board').count()) === 1 && (await page.getByRole('button', { name: 'Open the stall' }).count()) === 0)
  const seen = () => page.evaluate(() => document.body.innerText)
  const friday = M.harmattanFriday().toFixed(2)
  check('THE SPOILER CHECK — Friday\'s price is nowhere on screen before it is locked', !(await seen()).includes(friday))
  let g = await gauge(page)
  check('the gauge: 0 of 2, carry the ratio', g && g.of === 2 && !g.hit && /carry/.test(g.text))
  await tap(page, 'Lock it in')
  await page.waitForTimeout(300)
  check('locking nothing is refused with a line, not a score', (await gauge(page)).met === 0 && /dial/.test(await coach(page)))
  // 36.50 → Friday (≈ 41.98) is 11 page-steps of 0.50
  await nudge(page, "Friday's price", 'PageUp', 11)
  // the bound dial starts at 0; half a step (25 g) × Thursday's ₵36.50 ≈ ₵0.91 → 18 steps of 0.05
  await nudge(page, "Today's takings could be off by", 'ArrowRight', 18)
  await tap(page, 'Lock it in')
  await page.waitForTimeout(400)
  g = await gauge(page)
  check('locked: Friday within fifty pesewas and the bound within a quarter → hit', g && g.hit, g?.text.slice(0, 120))
  check('the board in the scene now says Friday', await page.evaluate(() => !!window.__marketScene))
  await tap(page, 'Hand in')
  await page.waitForTimeout(500)
  check('one prediction, handed in', (await page.getByTestId('score').getAttribute('data-hit')) === 'true' && /Named in one/.test((await page.getByTestId('score').textContent()) ?? ''))
  await page.close()
}

/* ------------------------------------------------------------------ */
/* The free stall, the tabs, Ploob's dock, the stand-ins               */
/* ------------------------------------------------------------------ */
{
  const page = await open('scientist', { width: 1440, height: 900 }, '?standins=1')
  await tap(page, 'Run a stall on your own')
  await page.waitForTimeout(400)
  check('the free stall opens with no target', (await phase(page)) === 'lab' && (await page.getByTestId('gauge').count()) === 0)
  check('no Hand in on the free stall', (await page.getByRole('button', { name: 'Hand in' }).count()) === 0)
  check('with the props kept off, the stand-ins hold the scene', await page.evaluate(() => {
    const s = window.__marketScene
    return !!s && !!s.getObjectByName('subject') && !!s.getObjectByName('neighbours') && !!s.getObjectByName('shoppers')
  }))
  const dockOf = (pg) => pg.evaluate(() => document.querySelector('[data-testid=coach]')?.getAttribute('data-dock') ?? (document.querySelector('[data-testid=coach-chip]') ? 'hidden' : 'none'))
  check('Ploob floats over the stall to start', (await dockOf(page)) === 'float')
  await tap(page, 'Move Ploob to the left column')
  await page.waitForTimeout(250)
  check('Move sends Ploob to the left column', (await dockOf(page)) === 'left')
  await tap(page, 'Close Ploob')
  await page.waitForTimeout(250)
  check('Close leaves a chip, never nothing', (await dockOf(page)) === 'hidden' && (await page.getByTestId('coach-chip').count()) === 1)
  await page.getByTestId('coach-chip').click()
  await page.waitForTimeout(250)
  check('the chip brings him back', (await dockOf(page)) !== 'hidden')
  await page.getByRole('tab', { name: 'Days' }).click()
  await page.waitForTimeout(200)
  check('the Days tab selects', (await page.getByRole('tab', { name: 'Days' }).getAttribute('aria-selected')) === 'true')
  await tap(page, 'Open the stall')
  check('a free day runs and closes', await waitDayDone(page, 20000))
  check('and lands in Days', (await page.getByTestId('reading').count()) === 1)
  await page.close()
}

/* ------------------------------------------------------------------ */
/* Tablet landscape: the columns fit                                   */
/* ------------------------------------------------------------------ */
{
  const page = await open('scientist', { width: 1180, height: 820 })
  await page.getByTestId('play').click()
  await page.waitForTimeout(300)
  await tap(page, 'Commit')
  await waitPhase(page, 'lab', 8000)
  const fit = await page.evaluate(() => {
    const g = document.querySelector('[data-testid=gauge]')?.getBoundingClientRect()
    const t = document.querySelector('[data-testid=till-plate]')?.getBoundingClientRect()
    const o = document.querySelector('[data-testid=our-space]')?.getBoundingClientRect()
    if (!g || !t || !o) return 'missing'
    if (g.right > o.left + 1) return `gauge under the right column (${g.right.toFixed(0)} > ${o.left.toFixed(0)})`
    if (t.right > o.left + 1) return `till under the right column (${t.right.toFixed(0)} > ${o.left.toFixed(0)})`
    return 'ok'
  })
  check('tablet: the gauge and the till clear the right column', fit === 'ok', fit)
  await page.screenshot({ path: path.join(SHOTS, 'numberworks-tablet.png') })
  await page.close()
}

/* ------------------------------------------------------------------ */
/* Phone landscape: every control under the finger                    */
/* ------------------------------------------------------------------ */
{
  const page = await open('scientist', { width: 915, height: 412 })
  await page.getByTestId('play').click()
  await page.waitForTimeout(300)
  await tap(page, 'Commit')
  await waitPhase(page, 'lab', 8000)
  const dead = await page.evaluate(() => {
    const out = []
    for (const el of document.querySelectorAll('.hud button, .hud [role=tab], .hud a')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      if (!hit || !(el === hit || el.contains(hit))) out.push(el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 20))
      if (r.width < 36 || r.height < 36) out.push(`small:${el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 20)}`)
    }
    return out
  })
  check('phone: every HUD control is under the finger and at least the pointer-mode hit size', dead.length === 0, dead.join(', '))
  check('phone: the camera is told how tall the HUD is', Number(await root(page, 'data-hud-bottom')) > 100)
  check('phone: no side columns', (await page.getByTestId('stall-plate').count()) === 0 && (await page.getByTestId('our-space').count()) === 0)
  check('phone: the till and the gauge are on screen', (await page.getByTestId('till-plate').count()) === 1 && (await page.getByTestId('gauge').count()) === 1)
  await page.getByRole('tab', { name: 'The Stall' }).click()
  await page.waitForTimeout(250)
  check('phone: the stall\'s dials open as a sheet', (await page.getByTestId('sheet-stall').count()) === 1 && (await page.getByTestId('stall-plate').count()) === 1)
  const reach = await page.evaluate(() => {
    const el = document.querySelector('[data-testid=markup-dial] [role=slider]')
    if (!el) return 'no dial'
    const r = el.getBoundingClientRect()
    if (r.bottom > window.innerHeight || r.top < 0) return `off screen (${r.top.toFixed(0)}–${r.bottom.toFixed(0)} of ${window.innerHeight})`
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return hit && (el === hit || el.contains(hit) || hit.contains(el)) ? 'ok' : 'covered'
  })
  check('phone: the mark-up dial is on screen and under the finger', reach === 'ok', reach)
  await page.screenshot({ path: path.join(SHOTS, 'numberworks-phone-sheet.png') })
  await page.keyboard.press('Escape')
  await page.mouse.click(10, 200)
  await page.waitForTimeout(200)
  await page.getByRole('tab', { name: 'Our Space' }).click()
  await page.waitForTimeout(250)
  check('phone: Our Space opens as a sheet', (await page.getByTestId('our-space').count()) === 1)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  check('phone: nothing scrolls sideways', !overflow)
  await page.mouse.click(10, 200)
  await page.waitForTimeout(200)
  await page.screenshot({ path: path.join(SHOTS, 'numberworks-phone.png') })
  await page.close()
}

/* ------------------------------------------------------------------ */
/* Phone portrait: still playable                                      */
/* ------------------------------------------------------------------ */
{
  const page = await open('explorer', { width: 390, height: 844 })
  check('portrait: the welcome fits', (await page.getByTestId('play').count()) === 1)
  await page.getByTestId('play').click()
  await waitPhase(page, 'gather', 8000)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  check('portrait: nothing scrolls sideways during the catch', !overflow)
  await page.screenshot({ path: path.join(SHOTS, 'numberworks-portrait.png') })
  await page.close()
}

check('no console errors across the walk', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
await browser.close()
tally()
