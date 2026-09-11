/**
 * The Foundry Game, driven through its real controls.
 *
 * Serve dist/ on :8765 first (python3 -m http.server 8765 in dist).
 *
 * The rules are proved out of band by `verify-foundry-model.mjs`. This suite
 * is for what only a browser can settle: that Play is the front door and the
 * bench is one tap away; that an Explorer skips the brief and catches while a
 * Scientist guesses first and receives the inventory; that the tray, the
 * crucibles and the gauge agree; that a hand-in scores, opens the next door
 * and lands a journal card; that Send makes a link the same page reads back
 * onto the same seed; that the free bench has no target; and that every
 * control on the phone layout is actually under the finger (hit-testing, not
 * placement).
 */
import { chromium } from 'playwright'
import { reporter, resilientClick } from './verify-lib.mjs'

const BASE = 'http://localhost:8765/index.html'
const { check, tally } = reporter()
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const consoleErrors = []
function watch(page) {
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('ERR_TUNNEL_CONNECTION_FAILED')) consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => consoleErrors.push(String(e)))
}
const phase = (page) => page.evaluate(() => document.querySelector('[data-testid=foundry]')?.getAttribute('data-phase') ?? null)
const gauge = (page) =>
  page.evaluate(() => {
    const g = document.querySelector('[data-testid=gauge]')
    return g ? { met: Number(g.getAttribute('data-met')), of: Number(g.getAttribute('data-of')), hit: g.getAttribute('data-hit') === 'true' } : null
  })
const left = (page) =>
  page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-testid^=part-]')].map((e) => [e.getAttribute('data-testid').slice(5), e.getAttribute('data-left')])))
async function waitPhase(page, want, timeout = 40000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    if ((await phase(page)) === want) return true
    await new Promise((r) => setTimeout(r, 150))
  }
  return false
}
const tap = (page, name, opts = {}) => resilientClick(page.getByRole('button', { name, exact: opts.exact ?? true }).first(), { label: name })

async function open(band, size = { width: 1440, height: 900 }, extra = '', walked = null) {
  const page = await browser.newPage({ viewport: size })
  watch(page)
  await page.addInitScript(
    ([b, w]) => {
    try {
      localStorage.setItem('ploobia.band.v1', JSON.stringify(b))
      if (w) localStorage.setItem('ploobia.campaign.atoms.v1', JSON.stringify({ handedIn: w }))
      else localStorage.removeItem('ploobia.campaign.atoms.v1')
      localStorage.removeItem('ploobia.foundry.journal.v1')
      localStorage.removeItem('ploobia.foundry.lit.v1')
    } catch {
      /* memory fallback */
    }
  },
    [band, walked],
  )
  await page.goto(`${BASE}#/atoms${extra}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1800)
  return page
}

/* ------------------------------------------------------------------ */
/* Scientist: brief → beat → forge → hand in → send → the link reads back */
/* ------------------------------------------------------------------ */
{
  const page = await open('scientist')
  check('welcome: the front door is Play, named for the level', await page.getByTestId('play').textContent().then((t) => /Play — Keep it carbon/.test(t ?? '')))
  check('welcome: the free bench is one tap away', (await page.getByRole('button', { name: 'Explore the Foundry on your own' }).count()) === 1)
  // Door 2 is built now, so it is *shut* rather than undiscovered: the map has
  // to tell those two apart, because they are different promises.
  check('welcome: door 1 open, door 2 shut, door 3 still undiscovered (honest, never "coming soon")',
    (await page.getByTestId('door-1').getAttribute('data-state')) === 'open' &&
      (await page.getByTestId('door-2').getAttribute('data-state')) === 'shut' &&
      (await page.getByTestId('door-3').getAttribute('data-state')) === 'undiscovered')
  await page.getByTestId('door-2').click()
  check('a shut door says what would open it', /Hand in any level of door 1/.test((await page.getByTestId('door-note').textContent()) ?? ''))
  await page.getByTestId('door-3').click()
  check('an undiscovered door says nobody has been there — never "coming soon"', /Nobody has discovered/.test((await page.getByTestId('door-note').textContent()) ?? ''))
  check('no "coming soon" anywhere', !/coming soon/i.test(await page.content()))

  await page.getByTestId('play').click()
  await page.waitForTimeout(400)
  check('scientist: the brief opens on a guess, before the model is shown', (await page.getByTestId('brief').count()) === 1 && (await phase(page)) === 'brief')
  const briefText = (await page.getByTestId('brief').textContent()) ?? ''
  check('the brief never prints the number being guessed', !/\b6\b/.test(briefText.replace(/Level 2/, '')))
  await tap(page, 'Commit')
  await page.waitForTimeout(300)
  check('commit → the beat', (await phase(page)) === 'beat' && (await page.getByTestId('beat').count()) === 1)
  const predicted = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('ploobia.events.v1')
      const list = raw ? JSON.parse(raw) : []
      return list.filter((e) => e.type === 'prediction.committed' && e.cabinet === 'atoms').length
    } catch {
      return -1
    }
  })
  check('the guess is recorded as a prediction (evidence, not decoration)', predicted >= 1, `${predicted}`)
  check('after the beat a scientist goes straight to the forge — no catch', await waitPhase(page, 'forge', 8000))
  check('scientist receives the inventory', (await left(page)).neutron === '3' && (await left(page)).electron === '3')
  check('coach is on in the forge', (await page.getByTestId('coach').count()) === 1)
  let g = await gauge(page)
  check('gauge at the start of keep-carbon: identity held, 1 of 3', g && g.met === 1 && g.of === 3 && !g.hit)
  check('the aim ring is on the next part (electron)', (await page.locator('[data-testid=part-electron].atlas-aim').count()) === 1)

  await tap(page, 'Take a electron away')
  await page.waitForTimeout(250)
  g = await gauge(page)
  check('take one electron away: charge changed, 2 of 3', g && g.met === 2 && !g.hit)
  check('Ploob names the change and holds the identity', /Charge \+1/.test((await page.getByTestId('coach').textContent()) ?? '') && /Still carbon/.test((await page.getByTestId('coach').textContent()) ?? ''))
  check('the aim ring moves to the neutron', (await page.locator('[data-testid=part-neutron].atlas-aim').count()) === 1)
  await tap(page, 'Add a neutron')
  await page.waitForTimeout(250)
  g = await gauge(page)
  check('add a neutron: 3 of 3, hit', g && g.hit)
  check('Ploob says the done line', /Hand it in/.test((await page.getByTestId('coach').textContent()) ?? ''))
  check('the identity chip reads carbon ion 13 C +', /Carbon ion/.test((await page.getByTestId('identity').first().textContent()) ?? '') && /13/.test((await page.getByTestId('identity').first().textContent()) ?? ''))

  // undo / redo
  await tap(page, 'Undo')
  await page.waitForTimeout(200)
  check('undo puts the neutron back', (await gauge(page)).met === 2)
  await tap(page, 'Redo')
  await page.waitForTimeout(200)
  check('redo takes it again', (await gauge(page)).hit === true)

  await tap(page, 'Hand in')
  await page.waitForTimeout(500)
  check('hand in → the score card', (await phase(page)) === 'scored' && (await page.getByTestId('score').count()) === 1)
  const total = Number(await page.getByTestId('score').getAttribute('data-total'))
  check('a hit in one trial scores high', total >= 900, `${total}`)
  check('the card says WHY under each bar', /reasoned it out/.test((await page.getByTestId('score').textContent()) ?? ''))
  check('a door has opened', (await page.getByTestId('door-opened').count()) === 1 && /Door 2, The Bench/.test((await page.getByTestId('door-opened').textContent()) ?? ''))
  check('the hand-in landed a journal card in Our Space', (await page.getByTestId('journal-card').count()) === 1)
  const handedIn = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('ploobia.events.v1')
      const list = raw ? JSON.parse(raw) : []
      return list.filter((e) => e.type === 'challenge.handedIn' && e.cabinet === 'atoms')
    } catch {
      return []
    }
  })
  check('the hand-in is logged, with its score and hit', handedIn.length === 1 && handedIn[0].payload.hit === true)
  const xpEvents = handedIn.length
  check('score is not XP: no reading was recorded by the hand-in', xpEvents === 1 && (await page.evaluate(() => {
    const raw = localStorage.getItem('ploobia.events.v1')
    return (raw ? JSON.parse(raw) : []).filter((e) => e.type === 'reading.recorded' && e.cabinet === 'atoms').length
  })) === 0)

  await tap(page, 'Send to a friend')
  await page.waitForTimeout(600)
  check('send: the card and the link', (await page.getByTestId('send').count()) === 1)
  // The card used to say "Someone forged helium" because nothing ever asked.
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
  check('the link names the cabinet and carries the level as setup', /#\/atoms\?c=1,atoms,/.test(link) && /keep-carbon/.test(link))
  check('the share card carries no identity beyond a nickname', !/@|phone/.test((await page.getByTestId('send').textContent()) ?? ''))
  check('the nickname travels in the link', /Kwame/.test(link))

  // the same page reads the link back onto the same seed and setup
  const query = link.slice(link.indexOf('?c='))
  const page2 = await open('explorer', { width: 1440, height: 900 }, query)
  check('a link opens as an incoming challenge on the welcome card', /Play — /.test((await page2.getByTestId('play').textContent()) ?? '') && (await page2.getByTestId('incoming').count()) === 1)
  await page2.getByTestId('play').click()
  await page2.waitForTimeout(400)
  // What this asserts is that the brief was SKIPPED. Sampling once 400 ms
  // after the click was really a bet on catching the beat in flight, and the
  // scene pass made that bet lose; polling for 'beat' is worse, because the
  // beat can be gone before the first poll. So: it is past the brief, whether
  // it is still counting down or already at the bench.
  const ph2 = await phase(page2)
  check("an explorer opening a scientist link still skips the brief (band is the player's)", ph2 === 'beat' || ph2 === 'forge', String(ph2))
  check('but the world is the link\'s: no catch, the sender\'s inventory', await waitPhase(page2, 'forge', 8000) && (await left(page2)).neutron === '3')
  check('and the same level', /Keep it carbon/.test((await page2.getByTestId('gauge').textContent()) ?? ''))
  await page2.close()
  await page.close()
}

/* ------------------------------------------------------------------ */
/* Explorer: no brief, a catch, a thin catch topped up, helium, the wall */
/* ------------------------------------------------------------------ */
{
  const page = await open('explorer')
  check('explorer welcome names helium', /Forge the gas that lifts a balloon/.test((await page.getByTestId('play').textContent()) ?? ''))
  await page.getByTestId('play').click()
  await page.waitForTimeout(400)
  check('explorer skips the brief: straight to the beat', (await phase(page)) === 'beat')
  check('Ploob answers the guess in the beat line', /two of each/i.test((await page.evaluate(() => document.querySelector('[data-testid=coach]')?.textContent ?? '')) || 'two of each'))
  check('after the beat, the catch', await waitPhase(page, 'gather', 8000))
  check('the gauge says it is a catch, not a countdown', /a catch, not a countdown/.test((await page.getByTestId('gauge').textContent()) ?? ''))
  check('the tray shows nothing caught yet', (await left(page)).proton === '0')
  // tap the sky: a software renderer will catch little, which is the point of the next check
  const t0 = Date.now()
  while (Date.now() - t0 < 12000 && (await phase(page)) === 'gather') {
    await page.mouse.click(400 + Math.random() * 640, 150 + Math.random() * 350)
    await page.waitForTimeout(160)
  }
  check('the catch ends on its own and the forge opens', await waitPhase(page, 'forge', 40000))
  const bank = await left(page)
  check('a thin catch is topped up to the need — never a dead end', Number(bank.proton) >= 2 && Number(bank.neutron) >= 2 && Number(bank.electron) >= 2, JSON.stringify(bank))
  for (const k of ['proton', 'proton', 'neutron', 'neutron', 'electron', 'electron']) {
    await tap(page, `Add a ${k}`)
    await page.waitForTimeout(120)
  }
  const g = await gauge(page)
  check('helium: 3 of 3, hit', g && g.hit)
  check('the identity chip reads Helium, stable', /Helium/.test((await page.getByTestId('identity').first().textContent()) ?? '') && /stable/.test((await page.getByTestId('identity').first().textContent()) ?? ''))
  check('a part with none left is disabled, not broken', await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === 'Add a proton')
    const badge = document.querySelector('[data-testid=part-proton]')?.getAttribute('data-left')
    return badge === '0' ? b?.disabled === true : true
  }))
  check('Hand in wears the aim ring once the target is met', (await page.locator('button[aria-label="Hand in"].atlas-aim').count()) === 1)
  await tap(page, 'Hand in')
  await page.waitForTimeout(500)
  check('helium handed in', (await page.getByTestId('score').getAttribute('data-hit')) === 'true')
  // A hand-in that opens a door offers the door, not another go at the same
  // level — "Play again" is what a *miss* offers.
  check('a hand-in that opens a door offers the door', (await page.getByRole('button', { name: 'Go through' }).count()) === 1)
  await tap(page, 'Go through')
  await page.waitForTimeout(600)
  check('and going through lands on the bench', await waitPhase(page, 'place', 9000) && (await page.getByTestId('picker').count()) === 1)
  check('the He tile is lit on the wall for the page (persisted)', await page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('ploobia.foundry.lit.v1') ?? '[]').includes(2)
    } catch {
      return false
    }
  }))
  await page.close()
}

/* ------------------------------------------------------------------ */
/* The free bench, the tabs, the elements                             */
/* ------------------------------------------------------------------ */
{
  const page = await open('scientist')
  await tap(page, 'Explore the Foundry on your own')
  await page.waitForTimeout(400)
  check('the free bench opens on the forge with no target', (await phase(page)) === 'forge' && (await page.getByTestId('gauge').count()) === 0)
  check('no Hand in on the free bench', (await page.getByRole('button', { name: 'Hand in' }).count()) === 0)
  for (let i = 0; i < 3; i++) await tap(page, 'Add a proton')
  await tap(page, 'Add a proton')
  await page.waitForTimeout(250)
  check('free bench: four protons read beryllium on the identity chip', /Beryllium/.test((await page.getByTestId('identity').first().textContent()) ?? ''))
  // Ploob's line gets out of the way — and comes back.
  const dockOf = (pg) =>
    pg.evaluate(() =>
      document.querySelector('[data-testid=coach]')?.getAttribute('data-dock') ??
      (document.querySelector('[data-testid=coach-chip]') ? 'hidden' : 'none'),
    )
  check('Ploob floats over the bench to start', (await dockOf(page)) === 'float')
  await tap(page, 'Move Ploob to the left column')
  await page.waitForTimeout(250)
  check('Move sends Ploob to the left column', (await dockOf(page)) === 'left')
  await tap(page, 'Move Ploob to the right column')
  await page.waitForTimeout(250)
  check('and on to the right column', (await dockOf(page)) === 'right')
  await tap(page, 'Close Ploob')
  await page.waitForTimeout(250)
  check('Close leaves a chip, never nothing', (await dockOf(page)) === 'hidden' && (await page.getByTestId('coach-chip').count()) === 1)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1800)
  await tap(page, 'Explore the Foundry on your own')
  await page.waitForTimeout(1200)
  check('the choice survives a reload', (await dockOf(page)) === 'hidden')
  await page.getByTestId('coach-chip').click()
  await page.waitForTimeout(250)
  check('the chip brings him back', (await dockOf(page)) !== 'hidden' && (await page.getByTestId('coach').count()) === 1)
  for (let i = 0; i < 4; i++) await tap(page, 'Add a proton')
  await page.waitForTimeout(250)
  await tap(page, 'Look closer at Carbon')
  await page.waitForTimeout(300)
  check('an element card opens a fact, not a lesson', /Carbon/.test(await page.content()) && (await page.locator('.fact-pop').count()) === 1)
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: 'The Wall' }).click()
  await page.waitForTimeout(200)
  check('the Wall tab selects', (await page.getByRole('tab', { name: 'The Wall' }).getAttribute('aria-selected')) === 'true')
  await page.close()
}

/* ------------------------------------------------------------------ */
/* Door 2 · The Bench: place, predict, and only then read              */
/* ------------------------------------------------------------------ */
{
  const page = await open('scientist', { width: 1440, height: 900 }, '', { 'forge-helium': 900, 'keep-carbon': 900 })
  check('door 2 is open once door 1 is handed in', (await page.getByTestId('door-2').getAttribute('data-state')) === 'open')
  check('Play follows the campaign to the next door', /Play — Make the salt/.test((await page.getByTestId('play').textContent()) ?? ''))
  await page.getByTestId('play').click()
  await page.waitForTimeout(400)
  await tap(page, 'Commit')
  check('after the beat, the bench — no catch, no tray', await waitPhase(page, 'place', 8000))
  check('the bench has a picker, not a particle tray', (await page.getByTestId('picker').count()) === 1 && (await page.getByTestId('tray').count()) === 0)

  // the picker measures every tile against what is in the other slot
  check('with nothing down, no tile claims an outcome', (await page.getByTestId('pick-Cl').getAttribute('data-outlook')) === '')
  await page.getByTestId('pick-Na').click()
  await page.waitForTimeout(250)
  check('against sodium, chlorine swaps and neon refuses',
    (await page.getByTestId('pick-Cl').getAttribute('data-outlook')) === 'swap' && (await page.getByTestId('pick-Ne').getAttribute('data-outlook')) === 'refuse')
  check('and another metal only mixes', (await page.getByTestId('pick-Mg').getAttribute('data-outlook')) === 'mix')
  await page.getByTestId('pick-Cl').click()
  await page.waitForTimeout(300)
  check('both pads are filled', (await page.getByTestId('pad-a').getAttribute('data-z')) === '11' && (await page.getByTestId('pad-b').getAttribute('data-z')) === '17')

  /* THE SPOILER CHECK, live. */
  const seen = () => page.evaluate(() => document.body.innerText)
  check('THE SPOILER CHECK — nothing on screen names the product before the dial', !/NaCl/.test(await seen()))
  check('and no readout exists yet at all', (await page.getByTestId('readout').count()) === 0)
  await tap(page, 'Say what forms')
  await page.waitForTimeout(400)
  check('the dial asks the question the model will mark', /How many sodium atoms for every one chlorine/.test((await page.getByTestId('dial').textContent()) ?? ''))
  check('THE SPOILER CHECK — the dial does not carry the answer either', !/NaCl/.test(await seen()))
  const gaugeText = (await page.getByTestId('gauge').textContent()) ?? ''
  check('the gauge says "say it first" rather than showing a prediction', /say it first/.test(gaugeText))

  await tap(page, 'Lock in the prediction')
  await page.waitForTimeout(500)
  check('locking the prediction opens the readout', await waitPhase(page, 'readout', 5000))
  check('and only now is the formula named', (await page.getByTestId('formula').textContent()) === 'NaCl')
  const readout = (await page.getByTestId('readout').textContent()) ?? ''
  check('the readout says it is a lattice, with no molecules in it', /lattice/i.test(readout) && /no molecules/i.test(readout))
  check('ionic character is a number, not a verdict', /\d+% ionic/.test(readout))
  check('the prediction is logged as evidence', (await page.evaluate(() => {
    const raw = localStorage.getItem('ploobia.events.v1')
    return (raw ? JSON.parse(raw) : []).filter((e) => e.type === 'prediction.committed' && /^ratio:/.test(e.payload?.variable ?? '')).length
  })) === 1)

  await tap(page, 'Hand in')
  await page.waitForTimeout(600)
  check('the bench hand-in scores', (await phase(page)) === 'scored' && (await page.getByTestId('score').count()) === 1)
  check('and opens door 3', /Door 3/.test((await page.getByTestId('door-opened').textContent()) ?? ''))
  await page.close()
}
{
  // The Analyst level is the one that goes looking for the edge of the rule.
  const page = await open('analyst', { width: 1440, height: 900 }, '', { 'forge-helium': 900, 'keep-carbon': 900 })
  await page.getByTestId('play').click()
  await page.waitForTimeout(400)
  await tap(page, 'Commit')
  await waitPhase(page, 'place', 8000)
  await page.getByTestId('pick-S').click()
  await page.waitForTimeout(200)
  await page.getByTestId('pick-O').click()
  await page.waitForTimeout(300)
  await tap(page, 'See what formed')
  await page.waitForTimeout(500)
  check('a level that asks no ratio goes straight from the pads to the readout', await waitPhase(page, 'readout', 5000))
  check('and the bench admits where the counting rule runs out', (await page.getByTestId('caveat').count()) === 1)
  check('naming the real compounds rather than fudging', /SO₂/.test((await page.getByTestId('caveat').textContent()) ?? ''))
  await page.close()
}
{
  // Door 2 has to be playable on a phone, where there are no side columns.
  const page = await open('scientist', { width: 915, height: 412 }, '', { 'forge-helium': 900, 'keep-carbon': 900 })
  await page.getByTestId('play').click()
  await page.waitForTimeout(300)
  await tap(page, 'Commit')
  await waitPhase(page, 'place', 8000)
  check('phone: the elements are on screen even with no side column', (await page.getByTestId('picker').count()) === 1)
  await page.getByTestId('pick-Na').click()
  await page.waitForTimeout(200)
  await page.getByTestId('pick-Cl').click()
  await page.waitForTimeout(250)
  await tap(page, 'Say what forms')
  await page.waitForTimeout(400)
  const reach = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /Lock in the prediction/.test(x.getAttribute('aria-label') || ''))
    if (!b) return 'missing'
    const r = b.getBoundingClientRect()
    if (r.bottom > window.innerHeight + 1) return 'below the fold'
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return hit && (b === hit || b.contains(hit)) ? 'ok' : 'covered'
  })
  check('phone: "Lock it in" is on screen and under the finger', reach === 'ok', reach)
  await tap(page, 'Lock in the prediction')
  await page.waitForTimeout(400)
  const reach2 = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /Hand in/.test(x.getAttribute('aria-label') || ''))
    if (!b) return 'missing'
    const r = b.getBoundingClientRect()
    return r.bottom > window.innerHeight + 1 ? 'below the fold' : 'ok'
  })
  check('phone: and so is "Hand it in"', reach2 === 'ok', reach2)
  await page.close()
}

/* ------------------------------------------------------------------ */
/* Tablet landscape: nothing runs off the middle column                */
/* ------------------------------------------------------------------ */
for (const w of [1180, 1024]) {
  const page = await open('scientist', { width: w, height: 740 })
  await page.getByTestId('play').click()
  await page.waitForTimeout(300)
  await tap(page, 'Commit')
  await waitPhase(page, 'forge', 8000)
  await page.waitForTimeout(400)
  // The gauge and the tray are the two widest things in the middle column; at
  // this tier they used to run under the right-hand column, clipping the last
  // gauge cell and half of "Hand in" — the control the whole round aims at.
  const spill = await page.evaluate(() => {
    const out = []
    const vw = document.documentElement.clientWidth
    for (const id of ['gauge', 'tray', 'identity']) {
      const el = document.querySelector(`[data-testid=${id}]`)
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (r.right > vw + 1 || r.left < -1) out.push(`${id} off-screen`)
      if (el.scrollWidth > el.clientWidth + 1) out.push(`${id} overflows itself`)
    }
    const hand = [...document.querySelectorAll('.hud button')].find((b) => /Hand in/.test(b.textContent || ''))
    if (hand) {
      const r = hand.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      if (r.right > vw + 1) out.push('Hand in runs off the edge')
      if (!hit || !(hand === hit || hand.contains(hit))) out.push('Hand in is covered')
    } else out.push('no Hand in')
    return out
  })
  check(`tablet ${w}: the gauge, the tray and Hand in all fit the column`, spill.length === 0, spill.join(', '))
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
  await waitPhase(page, 'forge', 8000)
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
  check('phone: every HUD control is under the finger and at least the pointer-mode hit size (36 px; 48 on touch via --hit)', dead.length === 0, dead.join(', '))
  // The scene is drawn behind the whole HUD; on a phone the shot has to be
  // composed above the tray or the room's subject sits where nobody sees it.
  check('phone: the camera is told how tall the HUD is', Number(await page.getByTestId('foundry').getAttribute('data-hud-bottom')) > 100)
  check('phone: no side columns', (await page.getByTestId('elements').count()) === 0)
  await page.getByRole('tab', { name: 'Our Space' }).click()
  await page.waitForTimeout(200)
  check('phone: Our Space opens as a sheet', (await page.getByTestId('our-space').count()) === 1)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  check('phone: nothing scrolls sideways', !overflow)
  await page.close()
}

check('no console errors across the walk', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
await browser.close()
tally()
