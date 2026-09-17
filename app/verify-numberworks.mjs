/**
 * The Numberworks — The Market, driven through its real controls.
 *
 * Serve dist/ on :8765 first (python3 -m http.server 8765 in dist).
 *
 * The rules are proved out of band by `verify-market-model.mjs`. This suite
 * is for what only a browser can settle (round A.2, after review 1): that
 * Play is the front door and the free stall is one tap away; that EVERY
 * depth opens on a typed number — an Explorer included — and Ploob repeats it
 * back; that the catch has that number as its target and the count layer
 * stands the basin up in rows of ten; that the board is locked on day 1 and
 * the lever thins the alley when it is free; that a day runs on the wall
 * clock with the three plates reading it, and ends on the reconstruction
 * before any score, then one why-question; that a hand-in scores in the
 * stall's words and lands a strategy card; that Send makes a link the same
 * page reads back onto the same crowd; that level 3 is a prediction locked
 * before it is read; that the stand-ins hold the scene; and that every
 * control on the phone layout is actually under the finger.
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
    // With the props kept off on purpose (STANDINS=1) a missing model is a 404, not a bug.
    if (m.type() === 'error' && !m.text().includes('ERR_TUNNEL_CONNECTION_FAILED') && !(process.env.STANDINS === '1' && /404/.test(m.text()))) consoleErrors.push(m.text())
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
const till = (page) => page.evaluate(() => Number(document.querySelector('[data-testid=numberworks]')?.getAttribute('data-till') ?? 'NaN'))
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
  // STANDINS=1 keeps the generated props off everywhere (a machine without public/models — the cloud build box).
  const standins = process.env.STANDINS === '1' && !/standins=/.test(extra) ? (extra.includes('?') ? '&standins=1' : '?standins=1') : ''
  await page.goto(`${BASE}#/numberworks${extra}${standins}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1800)
  return page
}

/* A seed on which level 1 is a hit at the board's starting price (₵4) with a
   full basin on the LINK's day-1 crowd — so the walk below is about the page,
   not the dice. Day 1's crowd is the guaranteed one (D5). */
const fill = M.LEVEL_BY_ID['fill-the-till']
const crowd1 = (s) => M.shoppersFor(M.crowdSeedFor(s, fill, 1))
let seed = 1
while (M.simulateDay(crowd1(seed), 60, { price: 4, discount: 0 }).till < 200 && seed < 500) seed += 1
check('a seed exists on which ₵4 × a full basin fills the till on day 1', seed < 500, `seed ${seed}`)
const linkFor = (level, band, s = seed) => {
  const url = M.challengeLink('http://localhost:8765', '/numberworks', M.challengeFor(level, band, s))
  return url.slice(url.indexOf('?c='))
}
/** Run a day to its close, answering four o'clock if it comes (keep the price). */
const throughTheDay = async (page, timeout = 25000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    if ((await phase(page)) === 'close') return true
    if ((await page.getByTestId('event').count()) === 1) {
      await page.getByTestId('event').getByRole('button').first().click()
      await page.waitForTimeout(200)
    }
    await page.waitForTimeout(150)
  }
  return (await phase(page)) === 'close'
}
/** Leave the why: through the replay when the market has one (day 2+, or a four o'clock choice), else straight back. */
const leaveExplain = async (page) => {
  const btn = page.locator('[data-testid=explain] button[aria-label^="Replay"]')
  if ((await btn.count()) === 1) {
    await btn.click()
    await waitFor(async () => (await root(page, 'data-replay')) === 'done', 15000)
    await tap(page, 'Stamped — back to the stall')
  } else await tap(page, 'Back to the stall')
  await page.waitForTimeout(300)
}
const plate = (page, id) => page.evaluate((i) => document.querySelector(`[data-testid=cell-${i}]`)?.textContent ?? '', id)
const typeNumber = async (page, n) => {
  await page.getByTestId('typed').fill(String(n))
  await page.waitForTimeout(150)
  await tap(page, 'Commit')
}
/* mission → predict → (typed) → beat */
const throughTheNumber = async (page, n) => {
  check('play → the mission card, the world at rest, the three plates at zero', (await phase(page)) === 'mission' && (await page.getByTestId('mission').count()) === 1 && (await page.getByTestId('gauge').count()) === 1)
  await tap(page, 'First, a number')
  await page.waitForTimeout(300)
  check('the mission asks for a number before anything moves', (await phase(page)) === 'predict' && (await page.getByTestId('brief').count()) === 1)
  const briefText = (await page.getByTestId('brief').textContent()) ?? ''
  check('the number is typed — a keypad, no options', (await page.getByTestId('keypad').count()) === 1 && (await page.getByTestId('typed').count()) === 1 && (await page.getByTestId('why-option').count()) === 0)
  check('Commit is disabled until a number is typed', await page.evaluate(() => !!document.querySelector('button[aria-label=Commit]')?.hasAttribute('disabled')))
  await typeNumber(page, n)
  await page.waitForTimeout(300)
  return briefText
}

/* ------------------------------------------------------------------ */
/* Scientist on a level-1 link: number → beat → count → a day → close → explain → hand in → send */
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
  await page.waitForTimeout(500)
  const briefText = await throughTheNumber(page, 50)
  check('the brief never prints the number being asked for', !/\b50\b/.test(briefText))
  check('the brief prices in cedis', /₵/.test(briefText))
  check('commit → the beat', (await phase(page)) === 'beat' && (await page.getByTestId('beat').count()) === 1)
  check('the number stays on screen as a chip', /you said 50 tomatoes/.test((await page.getByTestId('said').textContent()) ?? ''))
  const predicted = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('ploobia.events.v1')
      return (raw ? JSON.parse(raw) : []).filter((e) => e.type === 'prediction.committed' && e.cabinet === 'numberworks').length
    } catch {
      return -1
    }
  })
  check('the number is recorded as a prediction (evidence, not decoration)', predicted >= 1, `${predicted}`)
  check('after the beat a scientist gets no catch — the count layer stands the full basin up', await waitPhase(page, 'count', 8000) && (await page.getByTestId('count-lift').count()) === 1)
  check('rows of ten: a basin of 60 is 6 rows', (await page.locator('[data-testid=count-lift] [data-rows]').getAttribute('data-rows')) === '6')
  check('the count line names the learner\'s number', /your 50/.test((await page.getByTestId('count-line').textContent()) ?? ''))
  check('then the stall', await waitPhase(page, 'lab', 8000))
  await page.waitForTimeout(300)
  check('a scientist starts with a full basin', /60 in the basin/.test((await page.getByTestId('stall-plate').textContent()) ?? ''))
  check('Ploob does not answer the number — he sends you to the stall', !/Fifty/.test(await coach(page)) && /Open the stall/.test(await coach(page)))
  let g = await gauge(page)
  check('the plates before the day: target · stock · till, 0 of 1', g && g.met === 0 && g.of === 1 && !g.hit && (await page.getByTestId('cell-target').count()) === 1 && (await page.getByTestId('cell-stock').count()) === 1 && (await page.getByTestId('cell-till').count()) === 1)
  check('the till reads empty', (await till(page)) === 0)
  check('the aim ring is on "Open the stall"', (await page.locator('button[aria-label="Open the stall"].atlas-aim').count()) === 1)
  check('day 1: the board is locked at ₵4 — observe first', (await page.locator('[data-testid=price-dial][data-locked=true]').count()) === 1 && /observe at ₵4/.test((await page.getByTestId('stall-plate').textContent()) ?? ''))
  check('no column touches the world: no Our Space, no Days on screen', (await page.getByTestId('our-space').count()) === 0 && (await page.getByTestId('days').count()) === 0 && (await page.getByTestId('edge-tab').count()) === 1)
  await page.screenshot({ path: path.join(SHOTS, 'numberworks-lab-desktop.png') })

  await tap(page, 'Open the stall')
  await page.waitForTimeout(1200)
  check('the stall opens: the day runs', (await running(page)) === 'true' && (await page.getByRole('button', { name: 'Close early' }).count()) === 1)
  check('the till plate reads while the day runs', await waitFor(async () => (await till(page)) > 0, 8000))
  check('the price dial is locked while the stall is open', await page.evaluate(() => !!document.querySelector('[data-testid=price-dial] [data-disabled]')))
  check('the shoppers settle as bubbles over the counter — a sum or a walk-on', await waitFor(async () => (await page.getByTestId('bubble').count()) > 0, 6000))
  check('the day closes on its own in about eight seconds (four o\'clock answered) and lands on the closing card', await throughTheDay(page))
  const closing = await till(page)
  const expected = M.simulateDay(crowd1(seed), 60, { price: 4, discount: 0 }).till
  check('the till at closing is the model\'s to the pesewa', Math.abs(closing - expected) < 0.006, `${closing} vs ${expected}`)
  check('the closing card reconstructs before it scores — the product is the till', (await page.getByTestId('close').getAttribute('data-hit')) === 'true' && /working strategy/.test((await page.getByTestId('close-headline').textContent()) ?? '') && new RegExp(`= ${M.cedis(expected).replace('₵', '₵')}`).test((await page.getByTestId('reconstruction').textContent()) ?? ''))
  check('no score on the closing card', !/\/ 1000/.test((await page.getByTestId('close').textContent()) ?? ''))
  await page.screenshot({ path: path.join(SHOTS, 'numberworks-close.png') })
  const closeText = (await page.getByTestId('close').textContent()) ?? ''
  const alley = ['Bought', 'Walked past', 'Too late'].map((k) => Number((closeText.match(new RegExp(`${k}[^0-9]*(\\d+)`)) ?? [])[1]))
  check('the alley adds up to forty on the closing card — bought · walked past · too late (review 2)', alley.every((n) => Number.isFinite(n)) && alley[0] + alley[1] + alley[2] === M.SHOPPERS_PER_DAY, alley.join(' + '))
  check('buyers are people, sold is tomatoes — both on the card', /people/.test(closeText) && /tomatoes/.test(closeText))
  await tap(page, 'Why did it work?')
  await page.waitForTimeout(300)
  check('then one why-question, three options', (await phase(page)) === 'explain' && (await page.getByTestId('why-option').count()) === 3)
  check('day 1 asks "What happened today?" — never "1 of 3" (review 2)', /What happened today\?/.test((await page.getByTestId('explain').textContent()) ?? '') && !/1 of 3/.test((await page.getByTestId('explain').textContent()) ?? '') && (await page.getByTestId('explain').getAttribute('data-kind')) === 'sum')
  check('the stamp\'s fourth line is still open', /still to choose/.test((await page.getByTestId('stamp').textContent()) ?? ''))
  await page.locator('[data-testid=why-option][data-right=false]').first().click()
  await page.waitForTimeout(250)
  check('a distractor is answered from the day, never marked wrong', (await page.getByTestId('why-answer').count()) === 1 && !/wrong/i.test((await page.getByTestId('why-answer').textContent()) ?? ''))
  await page.locator('[data-testid=why-option][data-right=true]').click()
  await page.waitForTimeout(250)
  check('the right option is the sum, and the stamp closes on it', (await page.getByTestId('explain').getAttribute('data-chosen')) === 'right' && /Explained: 50 tomatoes/.test((await page.getByTestId('stamp').textContent()) ?? ''))
  check('the explanation is recorded as a write-up (evidence)', await page.evaluate(() => {
    const raw = localStorage.getItem('ploobia.events.v1')
    return (raw ? JSON.parse(raw) : []).filter((e) => e.type === 'writeup.completed' && e.cabinet === 'numberworks').length >= 1
  }))
  // Day 1's board was locked, so the only choice made was four o'clock — if the day paused there, that is what replays.
  const day1Replay = (await page.getByRole('button', { name: 'Replay four o’clock the other way ›' }).count()) === 1
  check('day 1 has no price to replay — only the four o\'clock choice, when there was one', day1Replay || (await page.getByRole('button', { name: 'Back to the stall' }).count()) === 1)
  await page.screenshot({ path: path.join(SHOTS, 'numberworks-explain.png') })
  if (day1Replay) {
    await tap(page, 'Replay four o’clock the other way ›')
    check('the four o\'clock replay runs with the chrome gone', (await waitFor(async () => (await root(page, 'data-replay')) === 'running', 3000)) && (await page.getByTestId('gauge').count()) === 0)
    check('… and ends on the split result — kept against dropped', await waitFor(async () => (await root(page, 'data-replay')) === 'done', 15000))
    check('the four o\'clock split names both branches', /You kept ₵4\.00/.test((await page.getByTestId('replay-card').textContent()) ?? '') && /dropped to ₵3\.50/.test((await page.getByTestId('replay-card').textContent()) ?? ''))
    await tap(page, 'Stamped — back to the stall')
  } else await tap(page, 'Back to the stall')
  await page.waitForTimeout(300)
  g = await gauge(page)
  check('back at the stall the plates read the day: 1 of 1, hit', (await phase(page)) === 'lab' && g && g.hit && g.met === 1)
  check('Ploob says the done line', /Hand it in/.test(await coach(page)))
  check('the day was recorded as a reading (evidence)', await page.evaluate(() => {
    const raw = localStorage.getItem('ploobia.events.v1')
    return (raw ? JSON.parse(raw) : []).filter((e) => e.type === 'reading.recorded' && e.cabinet === 'numberworks').length === 1
  }))
  check('Hand in wears the aim ring once the target is met', (await page.locator('button[aria-label="Hand in"].atlas-aim').count()) === 1)
  await page.getByTestId('edge-tab').click()
  await page.waitForTimeout(250)
  check('the edge tab opens Days and Our Space as a sheet, and the day is in it', (await page.getByTestId('side-sheet').count()) === 1 && (await page.getByTestId('reading').count()) === 1 && /Day 1/.test((await page.getByTestId('reading').first().textContent()) ?? ''))
  await tap(page, 'Close the sheet')
  await page.waitForTimeout(200)
  await tap(page, 'Hand in')
  await page.waitForTimeout(500)
  check('hand in → the score card', (await phase(page)) === 'scored' && (await page.getByTestId('score').count()) === 1)
  const total = Number(await page.getByTestId('score').getAttribute('data-total'))
  check('a hit in one day scores high', total >= 800, `${total}`)
  const scoreText = (await page.getByTestId('score').textContent()) ?? ''
  check('the three words are explained through the stall', /how near the till came/.test(scoreText) && /how few days/.test(scoreText) && /how little you wasted/.test(scoreText))
  check('the card carries the strategy, and a mathematical dare', (await page.getByTestId('strategy').count()) === 1 && /stocked/.test(scoreText) && /at ₵4\.20/.test(scoreText))
  check('the next experiment is offered: day 2 at ₵4.50', (await page.getByRole('button', { name: 'Next day' }).count()) === 1 && /what if ₵4\.50/.test(scoreText))
  check('door 2 opens but is undiscovered — the card says so and keeps the hand-in in the journal', (await page.getByTestId('door-opened').count()) === 1 && /Nobody has discovered/.test((await page.getByTestId('door-opened').textContent()) ?? '') && /journal/.test(scoreText))
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
  check('unsigned, the card still says something true — a strategy, with the price', /Someone/.test((await page.getByTestId('headline').textContent()) ?? '') && /selling at ₵4\.00/.test((await page.getByTestId('headline').textContent()) ?? ''))
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
  await page2.waitForTimeout(500)
  check('an explorer on a link is asked for the number too — nobody skips it', (await phase(page2)) === 'mission')
  await tap(page2, 'First, a number')
  await page2.waitForTimeout(300)
  await typeNumber(page2, 50)
  check("but the world is the link's: no catch, the count then a full basin", (await waitPhase(page2, 'lab', 12000)) && /60 in the basin/.test((await page2.getByTestId('stall-plate').textContent()) ?? ''))
  await page2.waitForTimeout(300)
  await tap(page2, 'Open the stall')
  check('the same seed runs the same day', (await throughTheDay(page2)) && Math.abs((await till(page2)) - expected) < 0.006, `${await till(page2)} vs ${expected}`)
  await page2.close()
  await page.close()
}

/* ------------------------------------------------------------------ */
/* Explorer solo: the number, the catch with it as the target, the count, day 1 locked, day 2 the experiment */
/* ------------------------------------------------------------------ */
{
  const page = await open('explorer')
  check('explorer welcome names level 1', /Fill the till by closing time/.test((await page.getByTestId('play').textContent()) ?? ''))
  await page.getByTestId('play').click()
  await page.waitForTimeout(500)
  check('an explorer does NOT skip the number (review 1)', (await phase(page)) === 'mission')
  await tap(page, 'First, a number')
  await page.waitForTimeout(300)
  await typeNumber(page, 50)
  check('Ploob repeats the number back and sets it as the catch', /50\. Then let/.test(await coach(page)) || (await waitPhase(page, 'gather', 8000)))
  check('after the beat, the catch', await waitPhase(page, 'gather', 8000))
  check('the plates during the catch: NEEDED is the learner\'s number, IN THE BASIN counts toward it', /50/.test(await plate(page, 'needed')) && /you said/.test(await plate(page, 'needed')) && /0 \/ 50/.test(await plate(page, 'basin')))
  check('the rain is in the scene', await page.evaluate(() => !!window.__marketScene?.getObjectByName('rain')))
  const t0 = Date.now()
  while (Date.now() - t0 < 12000 && (await phase(page)) === 'gather') {
    await page.mouse.click(300 + Math.random() * 840, 120 + Math.random() * 380)
    await page.waitForTimeout(160)
  }
  check('the catch ends on its own and the count layer stands the basin up', await waitPhase(page, 'count', 60000) && (await page.getByTestId('count-lift').count()) === 1)
  check('then the stall', await waitPhase(page, 'lab', 8000))
  await page.waitForTimeout(300)
  const basin = Number((((await page.getByTestId('stall-plate').textContent()) ?? '').match(/(\d+) in the basin/) ?? [])[1])
  check('a thin catch is topped up to the number the learner said — never a dead end, never more than they said', basin === 50, `${basin}`)
  check('Ploob names the top-up, or the basin', /basin/.test(await coach(page)) || /stall/.test(await coach(page)))
  check('day 1: the board is locked — the lever cannot move', (await page.locator('[data-testid=price-dial][data-locked=true]').count()) === 1)
  await tap(page, 'Open the stall')
  check('a day runs and closes on the reconstruction', await throughTheDay(page))
  const hit1 = (await page.getByTestId('close').getAttribute('data-hit')) === 'true'
  check('day 1 with the right number is proved right — the crowd is guaranteed (D5)', hit1)
  await page.getByTestId('close').getByRole('button').click()
  await page.waitForTimeout(250)
  await page.locator('[data-testid=why-option][data-right=true]').click()
  await page.waitForTimeout(200)
  await leaveExplain(page)
  check('after day 1 the next move is another day', (await page.getByRole('button', { name: 'Run another day' }).count()) === 1)
  await tap(page, 'Run another day')
  await page.waitForTimeout(300)
  check('day 2 opens on a typed till at ₵4.50 — the experiment', (await phase(page)) === 'predict' && /4\.50/.test((await page.getByTestId('brief').textContent()) ?? '') && /What will the till say/.test((await page.getByTestId('brief').textContent()) ?? ''))
  await typeNumber(page, 200)
  await page.waitForTimeout(600)
  check('the till is typed, then the day runs at ₵4.50', (await running(page)) === 'true' && /₵4\.50/.test((await page.getByTestId('stall-plate').textContent()) ?? ''))
  check('the number is on screen as a chip', /you said ₵200/.test((await page.getByTestId('said').textContent()) ?? ''))
  // four o'clock: when stock remains the day pauses for a decision
  const hadEvent = await waitFor(async () => (await page.getByTestId('event').count()) === 1 || (await phase(page)) === 'close', 20000)
  if ((await page.getByTestId('event').count()) === 1) {
    check('at four the day pauses: keep, or drop to ₵3.50 — both sums', /Keep ₵4\.50/.test((await page.getByTestId('event').textContent()) ?? '') && /Drop to ₵3\.50/.test((await page.getByTestId('event').textContent()) ?? ''))
    check('paused means paused: the clock stands still', await page.evaluate(() => window.__marketSim?.paused === true))
    await page.getByRole('button', { name: 'Drop to ₵3.50' }).click()
    check('the day runs on after the decision', await waitPhase(page, 'close', 20000))
    check('the reconstruction says both products when the price dropped at four', /₵3\.50/.test((await page.getByTestId('reconstruction').textContent()) ?? '') && /\+/.test((await page.getByTestId('reconstruction').textContent()) ?? ''))
  } else {
    check('day 2 closed (sold out before four, so no event)', hadEvent && (await phase(page)) === 'close')
  }
  check('the closing card says what was said and what the day made', /you said ₵200/.test((await page.getByTestId('reconstruction').textContent()) ?? ''))
  await page.screenshot({ path: path.join(SHOTS, 'numberworks-day2-close.png') })
  const day2Till = await till(page)
  await page.getByTestId('close').getByRole('button').click()
  await page.waitForTimeout(250)
  const ex2 = (await page.getByTestId('explain').textContent()) ?? ''
  check('day 2\'s why is the scenario — "Something … happened" — with the alley as people and tomatoes', (await page.getByTestId('explain').getAttribute('data-kind')) === 'scenario' && /happened/.test(ex2) && /people bought/.test(ex2) && !/2 of 3/.test(ex2), ex2.slice(0, 80))
  await page.locator('[data-testid=why-option][data-right=false]').first().click()
  await page.waitForTimeout(200)
  check('the scenario\'s distractor is answered by the same forty', /forty/.test((await page.getByTestId('why-answer').textContent()) ?? ''))
  check('the button hands over to the replay at ₵4.00 — the price not chosen', (await page.getByRole('button', { name: 'Replay it at ₵4.00 ›' }).count()) === 1)
  await tap(page, 'Replay it at ₵4.00 ›')
  await page.waitForTimeout(400)
  check('the replay runs with the chrome gone: no plates, no board, no edge tab, no Ploob', (await root(page, 'data-replay')) === 'running' && (await page.getByTestId('gauge').count()) === 0 && (await page.getByTestId('stall-plate').count()) === 0 && (await page.getByTestId('edge-tab').count()) === 0 && (await page.getByTestId('coach').count()) === 0)
  check('a banner names the replay — same market, same forty, ₵4.00 — and the till counts', (await page.getByTestId('replay-banner').count()) === 1 && /same forty/i.test((await page.getByTestId('replay-banner').textContent()) ?? '') && /₵4\.00/.test((await page.getByTestId('replay-banner').textContent()) ?? ''))
  check('the replay is flagged in the sim and recorded nowhere', await page.evaluate(() => window.__marketSim?.replay === true && !!window.__marketSim?.run))
  check('the buyers show what they take — a count over the head', await waitFor(async () => /takes \d/.test((await page.locator('[data-testid=bubble]').allTextContents()).join(' ')), 8000))
  await page.screenshot({ path: path.join(SHOTS, 'numberworks-replay.png') })
  check('the replay ends on its own in about eight seconds', await waitFor(async () => (await root(page, 'data-replay')) === 'done', 15000))
  const rc = (await page.getByTestId('replay-card').textContent()) ?? ''
  check('the split result: you chose ₵4.50 · same market at ₵4.00', (await page.getByTestId('replay-chosen').count()) === 1 && (await page.getByTestId('replay-other').count()) === 1 && /You chose ₵4\.50/.test(rc) && /Same market at ₵4\.00/.test(rc))
  const chosenTill = Number(await page.locator('[data-testid=replay-chosen] [data-till]').getAttribute('data-till'))
  check('the chosen half is the day as it was sold, to the pesewa', Math.abs(chosenTill - day2Till) < 0.006, `${chosenTill} vs ${day2Till}`)
  check('the market\'s one line is from the numbers, on nobody\'s side', /same forty would have left/.test(rc) || /same till either way/.test(rc))
  check('the stamp closes here, after the child has seen the answer', /Your stamp/.test(rc) && !/still to choose/.test(rc))
  check('nothing from the replay became a day: still one day-2 reading', await page.evaluate(() => {
    const raw = localStorage.getItem('ploobia.events.v1')
    return (raw ? JSON.parse(raw) : []).filter((e) => e.type === 'reading.recorded' && e.cabinet === 'numberworks').length === 2
  }))
  await page.screenshot({ path: path.join(SHOTS, 'numberworks-replay-card.png') })
  await tap(page, 'Stamped — back to the stall')
  await page.waitForTimeout(300)
  check('after the replay, the stall — the sim is a stall again, not a replay', (await phase(page)) === 'lab' && (await root(page, 'data-replay')) === 'no' && (await page.evaluate(() => window.__marketSim?.run === null)))
  await tap(page, 'Run another day')
  await page.waitForTimeout(300)
  const q3 = (await page.getByTestId('brief').textContent()) ?? ''
  check('day 3 asks a number again: the learner\'s own price and the till — or, after a miss, the count', (await phase(page)) === 'predict' && (/Your price is/.test(q3) || /how many must we sell/.test(q3)), q3.slice(0, 60))
  await tap(page, 'Close')
  await page.waitForTimeout(250)
  check('closing the question leaves the lever free on day 3', (await phase(page)) === 'lab' && (await page.locator('[data-testid=price-dial][data-locked=true]').count()) === 0)
  // the alley between days: the heads in the frame, sampled over a second (they drift)
  const heads = async () => {
    let best = 0
    for (let i = 0; i < 7; i++) {
      best = Math.max(best, await page.evaluate(() => { const s = window.__marketScene; const g = s?.getObjectByName('shoppers'); return g ? g.children.filter((c) => c.visible && c.name !== 'bubbles').length : -1 }))
      await page.waitForTimeout(150)
    }
    return best
  }
  const priceOf = async () => Number((((await page.getByTestId('stall-plate').textContent()) ?? '').match(/₵(\d+\.\d\d)/) ?? [])[1])
  const p0 = await priceOf()
  await nudge(page, 'Price · each', 'ArrowRight', 3)
  await page.waitForTimeout(300)
  const p1 = await priceOf()
  check('the price dial moves the board', Math.abs(p1 - p0 - 0.3) < 0.011 || p1 >= 5.0, `${p0} → ${p1}`)
  const dear = await heads()
  await nudge(page, 'Price · each', 'ArrowLeft', 15)
  await page.waitForTimeout(300)
  const p2 = await priceOf()
  const cheap = await heads()
  const dbg = await page.evaluate(() => { const m = window.__marketSim; const s = window.__marketScene; const g = s?.getObjectByName('shoppers'); return JSON.stringify({ preview: m?.previewPrice, run: !!m?.run, n: g?.children.length, vis: g?.children.filter((c) => c.visible).length, crowd: m?.shoppers?.length, phase: document.querySelector('[data-testid=numberworks]')?.getAttribute('data-phase'), stock: m?.stock }) })
  check('the lever thins the alley: fewer heads at a dearer price (a head-count, not a list)', p2 < p1 && cheap > dear, `${cheap} at ${p2} vs ${dear} at ${p1} · ${dbg}`)
  // day 3, at the learner's own price: the third why is "best for what?"
  await tap(page, 'Run another day')
  await page.waitForTimeout(300)
  const q3b = (await page.getByTestId('brief').textContent()) ?? ''
  check('day 3 opens on the till at the learner\'s price — still day 3, the question closed earlier did not spend a day', (await phase(page)) === 'predict' && /Your price is ₵3\.30|how many must we sell/.test(q3b) && (await root(page, 'data-day')) === '3', `${await root(page, 'data-day')} · ${q3b.slice(0, 60)}`)
  await typeNumber(page, 200)
  await page.waitForTimeout(500)
  // A till day opens the stall itself; a count day (the retry after a miss) hands
  // the stall back, and the same button then OPENS today rather than asking again.
  if ((await running(page)) !== 'true') {
    await tap(page, 'Run another day')
    await page.waitForTimeout(500)
    check('a day already answered opens when asked again — never the same question twice', (await running(page)) === 'true' && (await root(page, 'data-day')) === '3', `${await phase(page)} · day ${await root(page, 'data-day')}`)
  }
  check('day 3 runs and closes', await throughTheDay(page), `${await phase(page)} · running ${await running(page)}`)
  await page.getByTestId('close').getByRole('button').click()
  await page.waitForTimeout(250)
  const ex3 = (await page.getByTestId('explain').textContent()) ?? ''
  check('three market days later: "best for what?" — four lenses over a table of the three days', (await page.getByTestId('explain').getAttribute('data-kind')) === 'best' && /Three market days later/.test(ex3) && /Best for what\?/.test(ex3) && (await page.getByTestId('why-option').count()) === 4 && (await page.getByTestId('days-table').count()) === 1 && /3 of 3/.test(ex3) === false)
  await page.locator('[data-testid=why-option]').first().click()
  await page.waitForTimeout(200)
  const ans3 = (await page.getByTestId('why-answer').textContent()) ?? ''
  check('a lens names its own computed winner — a day, or a tie — never a hard-coded best', /Most in the till → (day \d|days [\d, and]+|all three)/.test(ans3), ans3)
  check('the stamp records which "best" was meant', /Explained: best for most in the till/.test((await page.getByTestId('stamp').textContent()) ?? ''))

  /* ---- the Stall Book: a field journal, filled by the days ---- */
  check('the third why offers the book, with the pages it has filled', (await page.getByTestId('explain-book').count()) === 1 && /What Kejetia taught you/.test((await page.getByTestId('explain-book').textContent()) ?? ''))
  await tap(page, 'Open the Stall Book')
  await page.waitForTimeout(400)
  check('the book opens on its contents — seven pages, named', (await page.getByTestId('stall-book').count()) === 1 && (await page.getByTestId('book-page-row').count()) === 7)
  const rows = await page.locator('[data-testid=book-page-row]').evaluateAll((els) => els.map((e) => ({ page: e.getAttribute('data-page'), found: e.getAttribute('data-found') === 'true', text: e.textContent ?? '' })))
  check('the pages the days wrote are filled, in the learner\'s own numbers', rows.filter((r) => r.found).length >= 3 && /you discovered/.test(rows.find((r) => r.page === 'the-till')?.text ?? ''), rows.filter((r) => r.found).map((r) => r.page).join())
  check('a page nobody has earned shows its NAME and nothing else — never the formula', rows.filter((r) => !r.found).every((r) => /not discovered yet/.test(r.text) && !/[=×÷%]/.test(r.text)) && rows.some((r) => r.page === 'profit' && !r.found))
  check('no syllabus chips anywhere in the book (review 2: the lens retreats)', !/Cambridge|Ghana|0580|NaCCA/.test((await page.getByTestId('stall-book').textContent()) ?? ''))
  await page.locator('[data-testid=book-page-row][data-page=the-till]').click()
  await page.waitForTimeout(300)
  const pageText = (await page.getByTestId('book-page').textContent()) ?? ''
  check('a page opens on the discovery, then the name — not on a rule', (await page.getByTestId('book-discovery').count()) === 1 && /You discovered/.test(pageText) && /× ₵4\.00 = ₵200/.test(pageText) && /This is called/.test(pageText))
  check('the method is FOLDED until asked for', (await page.getByTestId('book-how').count()) === 0 && (await page.getByTestId('book-how-toggle').count()) === 1 && !/price × sold/.test(pageText))
  await tap(page, 'Show me how')
  await page.waitForTimeout(250)
  const opened = (await page.getByTestId('book-page').textContent()) ?? ''
  check('"Show me how →" unfolds the method in their figures, with the notation under it', (await page.getByTestId('book-how').count()) === 1 && /price × sold = till/.test(opened) && /₵4\.00 × 50 = ₵200/.test(opened) && /R = p × q/.test(opened))
  check('one quiet strand label, and it is a name, never a code', (await page.getByTestId('book-strand').count()) === 1 && !/0580|C1\./.test((await page.getByTestId('book-strand').textContent()) ?? ''))
  check('read-aloud is a tap, never automatic (D6)', (await page.getByTestId('book-read').count()) <= 1 && (await page.evaluate(() => !window.speechSynthesis || !window.speechSynthesis.speaking)))
  // the remote control: a term sends the reader back into the world
  check('the stall declares exactly the verbs the book asks for', await page.evaluate(() => {
    const want = ['board/price', 'alley/replay', 'till/count', 'basin/count', 'scale/weigh']
    const have = window.__ploobiaVerbs?.list() ?? []
    return want.every((v) => have.includes(v))
  }))
  const before = await page.evaluate(() => window.__ploobiaVerbs?.runs().runs ?? -1)
  await page.locator('[data-testid=book-term][data-verb="till/count"]').first().click()
  await page.waitForTimeout(400)
  check('tapping a term fires the stall\'s verb and the book says what the world did', (await page.evaluate(() => window.__ploobiaVerbs?.runs().runs ?? -1)) > before && /coins count up to/.test((await page.getByTestId('book-echo').textContent()) ?? ''))
  await page.locator('[data-testid=book-try][data-verb="alley/replay"]').first().click()
  await page.waitForTimeout(500)
  check('"Try it · replay the alley" replays the day behind the page — flagged, and recorded nowhere', await page.evaluate(() => window.__marketSim?.replay === true && !!window.__marketSim?.run))
  const readings = await page.evaluate(() => {
    const raw = localStorage.getItem('ploobia.events.v1')
    return (raw ? JSON.parse(raw) : []).filter((e) => e.type === 'reading.recorded' && e.cabinet === 'numberworks').length
  })
  check('a replay from the book is not a day: the readings are unchanged', readings === 3, `${readings}`)
  await page.screenshot({ path: path.join(SHOTS, 'numberworks-book-page.png') })
  await tap(page, 'Contents')
  await page.waitForTimeout(250)
  await page.locator('[data-testid=book-page-row][data-page=profit]').click()
  await page.waitForTimeout(250)
  check('an undiscovered page is a name and an invitation — no formula, no preview', (await page.getByTestId('book-locked').count()) === 1 && !/[=×÷]/.test((await page.getByTestId('book-page').textContent()) ?? ''))
  await page.screenshot({ path: path.join(SHOTS, 'numberworks-book-contents.png') })
  await tap(page, 'Close the Stall Book')
  await page.waitForTimeout(300)
  check('closing the book leaves the stall where it was', (await page.getByTestId('stall-book').count()) === 0 && (await phase(page)) === 'explain')
  await page.close()
}

/* ------------------------------------------------------------------ */
/* Scientist solo: level 2, the mark-up and the discount                */
/* ------------------------------------------------------------------ */
{
  const page = await open('scientist')
  check('scientist welcome names level 2', /Make a quarter more than you paid/.test((await page.getByTestId('play').textContent()) ?? ''))
  await page.getByTestId('play').click()
  await page.waitForTimeout(500)
  await tap(page, 'First, a number')
  await page.waitForTimeout(300)
  check('level 2 asks the unit cost, typed with pesewas', /cost you/.test((await page.getByTestId('brief').textContent()) ?? '') && (await page.getByRole('button', { name: 'Key .' }).count()) === 1)
  await typeNumber(page, 3)
  check('after the beat, the stall', await waitPhase(page, 'lab', 8000))
  await page.waitForTimeout(300)
  check('level 2 has a mark-up and a discount dial, no price dial', (await page.getByTestId('markup-dial').count()) === 1 && (await page.getByTestId('discount-dial').count()) === 1 && (await page.getByTestId('price-dial').count()) === 0)
  check('the plate says what was paid wholesale', /₵180 for 60/.test((await page.getByTestId('stall-plate').textContent()) ?? ''))
  const g0 = await gauge(page)
  check('the plates carry two targets: profit and left', g0 && g0.of === 2 && (await page.getByTestId('cell-profit').count()) === 1 && (await page.getByTestId('cell-left').count()) === 1)
  await nudge(page, 'Mark-up', 'ArrowRight', 2)
  check('the mark-up dial moves the kilo price', /\+40 %/.test((await page.getByTestId('stall-plate').textContent()) ?? ''))
  await nudge(page, 'Discount from 4 pm', 'ArrowRight', 4)
  check('the discount dial reads as a percentage decrease', /−20 %/.test((await page.getByTestId('stall-plate').textContent()) ?? ''))
  await tap(page, 'Open the stall')
  await page.waitForTimeout(600)
  check('a day runs on level 2', (await running(page)) === 'true')
  await tap(page, 'Close early')
  check('Close early settles the day on the closing card', await waitPhase(page, 'close', 5000))
  check('level 2 reconstructs profit as till − paid, ÷ paid', /−/.test((await page.getByTestId('reconstruction').textContent()) ?? '') && /÷ ₵180/.test((await page.getByTestId('reconstruction').textContent()) ?? ''))
  await page.getByTestId('close').getByRole('button').click()
  await page.waitForTimeout(250)
  check('level 2\'s question is the discount', /discount/.test((await page.getByTestId('explain').textContent()) ?? ''))
  await page.locator('[data-testid=why-option][data-right=true]').click()
  await page.waitForTimeout(200)
  await tap(page, 'Back to the stall')
  await page.waitForTimeout(300)
  const g1 = await gauge(page)
  check('after a closed day the plates read a profit and a leftover', g1 && /%/.test(g1.text) && /Left/.test(g1.text) && (await page.getByTestId('cell-left').count()) === 1, g1?.text?.slice(0, 60))
  check('the plates never truncate a label: the short names fit (review 2 owed)', await page.evaluate(() => [...document.querySelectorAll('[data-testid^=cell-] .atlas-eyebrow')].every((e) => e.scrollWidth <= e.clientWidth + 1)))
  await page.getByTestId('edge-tab').click()
  await page.waitForTimeout(250)
  check('a reading names the mark-up and the discount', /\+40 %/.test((await page.getByTestId('reading').first().textContent()) ?? '') && /−20 %/.test((await page.getByTestId('reading').first().textContent()) ?? ''))
  await tap(page, 'Close the sheet')
  await page.waitForTimeout(200)
  await tap(page, 'Hand in')
  await page.waitForTimeout(500)
  check('a hand-in on a miss says why, in the round\'s words', (await page.getByTestId('score').count()) === 1 && ((await page.getByTestId('score').getAttribute('data-hit')) === 'true' || (await page.getByTestId('bottleneck').count()) === 1))
  check('a miss offers Play again, never a menu', (await page.getByRole('button', { name: 'Play again' }).count()) === 1 || (await page.getByRole('button', { name: 'Back to the stall' }).count()) === 1)
  await page.close()
}

/* ------------------------------------------------------------------ */
/* Analyst: level 3 — predict, then bounds, then read                  */
/* ------------------------------------------------------------------ */
{
  const harm = M.LEVEL_BY_ID['harmattan-price']
  const page = await open('analyst', { width: 1440, height: 900 }, linkFor(harm, 'analyst'))
  await page.getByTestId('play').click()
  await page.waitForTimeout(500)
  await tap(page, 'First, a number')
  await page.waitForTimeout(300)
  check('level 3 asks the ratio, typed with decimals', /multiply/.test((await page.getByTestId('brief').textContent()) ?? '') && (await page.getByRole('button', { name: 'Key .' }).count()) === 1)
  await typeNumber(page, 1.15)
  check('after the beat, the board', await waitPhase(page, 'lab', 8000))
  await page.waitForTimeout(300)
  check('four mornings on the board, no till to open', (await page.getByTestId('harmattan-board').count()) === 1 && (await page.getByRole('button', { name: 'Open the stall' }).count()) === 0)
  const seen = () => page.evaluate(() => document.body.innerText)
  const friday = M.harmattanFriday().toFixed(2)
  check('THE SPOILER CHECK — Friday\'s price is nowhere on screen before it is locked', !(await seen()).includes(friday))
  let g = await gauge(page)
  check('the plates: 0 of 2, carry the ratio', g && g.of === 2 && !g.hit && /carry/.test(g.text))
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
  check('level 3 hands in through the reconstruction: 24 × 1.15⁴', (await phase(page)) === 'close' && /1\.15⁴/.test((await page.getByTestId('reconstruction').textContent()) ?? ''))
  await page.getByTestId('close').getByRole('button').click()
  await page.waitForTimeout(250)
  check('level 3\'s question is the straight line', /straight line/.test((await page.getByTestId('explain').textContent()) ?? ''))
  await page.locator('[data-testid=why-option][data-right=true]').click()
  await page.waitForTimeout(200)
  await tap(page, 'Back to the stall')
  await page.waitForTimeout(400)
  check('one prediction, handed in', (await phase(page)) === 'scored' && (await page.getByTestId('score').getAttribute('data-hit')) === 'true' && /Named in one/.test((await page.getByTestId('score').textContent()) ?? ''))
  await page.close()
}

/* ------------------------------------------------------------------ */
/* The free stall, the edge tab, Ploob's chip, the stand-ins           */
/* ------------------------------------------------------------------ */
{
  const page = await open('scientist', { width: 1440, height: 900 }, '?standins=1')
  await tap(page, 'Run a stall on your own')
  await page.waitForTimeout(400)
  check('the free stall opens with no target', (await phase(page)) === 'lab' && (await gauge(page)).of === 0 && /none/.test(await plate(page, 'target')))
  check('no Hand in on the free stall', (await page.getByRole('button', { name: 'Hand in' }).count()) === 0)
  check('the lever is free at the free stall', (await page.locator('[data-testid=price-dial][data-locked=true]').count()) === 0)
  check('with the props kept off, the stand-ins hold the scene', await page.evaluate(() => {
    const s = window.__marketScene
    return !!s && !!s.getObjectByName('subject') && !!s.getObjectByName('neighbours') && !!s.getObjectByName('shoppers')
  }))
  const dockOf = (pg) => pg.evaluate(() => document.querySelector('[data-testid=coach]')?.getAttribute('data-dock') ?? (document.querySelector('[data-testid=coach-chip]') ? 'hidden' : 'none'))
  check('Ploob floats low over the stall — no columns to dock in', (await dockOf(page)) === 'float' && (await page.getByRole('button', { name: 'Move Ploob to the left column' }).count()) === 0)
  await tap(page, 'Close Ploob')
  await page.waitForTimeout(250)
  check('Close leaves a chip, never nothing', (await dockOf(page)) === 'hidden' && (await page.getByTestId('coach-chip').count()) === 1)
  await page.getByTestId('coach-chip').click()
  await page.waitForTimeout(250)
  check('the chip brings him back', (await dockOf(page)) !== 'hidden')
  await tap(page, 'Open the stall')
  check('a free day runs and closes at the stall, no card', await waitDayDone(page, 20000) && (await phase(page)) === 'lab')
  await page.getByTestId('edge-tab').click()
  await page.waitForTimeout(250)
  check('and lands in Days behind the edge tab', (await page.getByTestId('reading').count()) === 1)
  await page.close()
}

/* ------------------------------------------------------------------ */
/* Tablet landscape: the plates, the board and the till clear each other */
/* ------------------------------------------------------------------ */
{
  const page = await open('scientist', { width: 1180, height: 820 })
  await page.getByTestId('play').click()
  await page.waitForTimeout(400)
  await tap(page, 'First, a number')
  await page.waitForTimeout(300)
  await typeNumber(page, 3)
  await waitPhase(page, 'lab', 8000)
  await page.waitForTimeout(300)
  const fit = await page.evaluate(() => {
    const g = document.querySelector('[data-testid=gauge]')?.getBoundingClientRect()
    const t = document.querySelector('[data-testid=till-plate]')?.getBoundingClientRect()
    const b = document.querySelector('[data-testid=stall-plate]')?.getBoundingClientRect()
    if (!g || !t || !b) return 'missing'
    if (g.bottom > b.top + 1) return `plates over the board (${g.bottom.toFixed(0)} > ${b.top.toFixed(0)})`
    if (b.right > t.left + 1) return `board under the till (${b.right.toFixed(0)} > ${t.left.toFixed(0)})`
    if (g.right > window.innerWidth) return 'plates off screen'
    return 'ok'
  })
  check('tablet: the plates, the board and the till clear each other', fit === 'ok', fit)
  await page.screenshot({ path: path.join(SHOTS, 'numberworks-tablet.png') })
  await page.close()
}

/* ------------------------------------------------------------------ */
/* Phone landscape: every control under the finger                    */
/* ------------------------------------------------------------------ */
{
  const page = await open('scientist', { width: 915, height: 412 })
  await page.getByTestId('play').click()
  await page.waitForTimeout(400)
  await tap(page, 'First, a number')
  await page.waitForTimeout(300)
  check('phone: the typed field and keypad fit', (await page.getByTestId('keypad').count()) === 1 && (await page.evaluate(() => { const r = document.querySelector('[data-testid=brief]')?.getBoundingClientRect(); return !!r && r.bottom <= window.innerHeight + 1 && r.top >= -1 })))
  await typeNumber(page, 3)
  await waitPhase(page, 'lab', 8000)
  await page.waitForTimeout(300)
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
  check('phone: no board panel on the world — a button', (await page.getByTestId('stall-plate').count()) === 0 && (await page.getByTestId('board-button').count()) === 1 && (await page.getByTestId('our-space').count()) === 0)
  check('phone: the till and the plates are on screen', (await page.getByTestId('till-plate').count()) === 1 && (await page.getByTestId('gauge').count()) === 1)
  await page.getByTestId('board-button').click()
  await page.waitForTimeout(250)
  check('phone: the board\'s dials open as a sheet', (await page.getByTestId('sheet-board').count()) === 1 && (await page.getByTestId('stall-plate').count()) === 1)
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
  await page.getByTestId('edge-tab').click()
  await page.waitForTimeout(250)
  check('phone: Our Space opens from the edge tab', (await page.getByTestId('our-space').count()) === 1)
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
  await page.waitForTimeout(400)
  await tap(page, 'First, a number')
  await page.waitForTimeout(300)
  check('portrait: the keypad fits', await page.evaluate(() => { const r = document.querySelector('[data-testid=brief]')?.getBoundingClientRect(); return !!r && r.bottom <= window.innerHeight + 1 && r.right <= window.innerWidth + 1 }))
  await typeNumber(page, 50)
  await waitPhase(page, 'gather', 8000)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  check('portrait: nothing scrolls sideways during the catch', !overflow)
  await page.screenshot({ path: path.join(SHOTS, 'numberworks-portrait.png') })
  await page.close()
}

check('no console errors across the walk', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
await browser.close()
tally()
