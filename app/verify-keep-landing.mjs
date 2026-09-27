/**
 * S1 — The Handoff, walked in a browser (storyboard v3.1 §05, Mock B).
 * Serve a WORLD build on :8766 first (`VITE_WORLD=1 npx vite build --outDir
 * dist-world`, then serve dist-world). S0's end comes from the suite handle
 * `__world.keep.endOfS0` (the v2 fixture through S0's own loop).
 *   desktop: ask → daily → say-back (contradiction, terms) → Sela's board
 *     (3 on the beds, the trade) → begin → Foundry and back → review → report
 *     (marks, refusal day 3, crew from 3, 1 crate, counterfactual for the
 *     Scientist) → every day → next → practice → reload with a report waiting
 *   phones 844×390 and 740×360: copies → the cards fit, the tools step back,
 *     the board folds to a pill in Ploob's slot, the review is a pill, the
 *     pause asks, a right answer raises to runs, the report is a pill that
 *     pulls up into a sheet, every control ≥ 36 px
 *   glass: liquid on medium quality, solid on low
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { reporter, resilientClick } from './verify-lib.mjs'

const BASE = process.env.WORLD_BASE ?? 'http://localhost:8766/index.html'
const SHOTS = path.resolve(process.env.KEEP_SHOTS ?? 'shots')
fs.mkdirSync(SHOTS, { recursive: true })
const { check, tally } = reporter()
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })

async function open(viewport, { touch = false, q = process.env.KEEP_Q ?? 'low' } = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_TUNNEL|favicon|WebGL|GPU|swiftshader|503|api\/why/i.test(m.text())) errors.push(m.text())
  })
  await page.goto(`${BASE}?q=${q}#/world`, { waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__world, null, { timeout: 60000 })
  await resilientClick(page.getByTestId('play'), { label: 'Play' })
  await page.waitForFunction(() => window.__world.get().phase === 'play')
  return { page, ctx, errors }
}
/** The end of S0 in one call — and the Codex page the jump re-opens, closed (real play closed it long ago). */
async function endOfS0(page, competence) {
  await page.evaluate((c) => window.__world.keep.endOfS0(c), competence)
  await page.waitForTimeout(300)
  await page.evaluate(() => document.querySelector('[data-testid=codex-close]')?.click())
}
const waitFor = (page, fn, ms = 15000, arg) => page.waitForFunction(fn, arg, { timeout: ms })
const keep = (page) => page.evaluate(() => window.__world.get().keep)
const tap = (page, id) => resilientClick(page.getByTestId(id), { label: id })
const stage = (page) =>
  page.evaluate(() => {
    const k = window.__world.get().keep
    if (!k) return null
    const d = k.dispatch
    return d?.status === 'begun' ? 'away' : d?.status === 'settled' ? 'report' : k.confirmed ? 'ready' : d ? 'read' : 'ask'
  })
const smallTargets = (page, root) =>
  page.evaluate((sel) => {
    const r = document.querySelector(sel)
    if (!r) return ['(no root)']
    return [...r.querySelectorAll('button, [role=button], input')]
      .filter((b) => b.offsetParent !== null)
      .map((b) => ({ id: b.dataset.testid || b.getAttribute('aria-label') || b.textContent.trim().slice(0, 14), r: b.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.height < 35.5 || r.width < 35.5))
      .map((x) => `${x.id} ${Math.round(x.r.width)}×${Math.round(x.r.height)}`)
  }, root)
const inView = (page, id) =>
  page.evaluate((t) => {
    const e = document.querySelector(`[data-testid="${t}"]`)
    if (!e) return false
    const r = e.getBoundingClientRect()
    return r.top >= -1 && r.left >= -1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1
  }, id)
const sceneObj = (page, name) => page.evaluate((n) => window.__world.scene.getObjectByName(n)?.userData ?? null, name)

/* ------------------------------------------------------------------------ */
/* Desktop — the story fortnight on a daily trial, then practice             */
/* ------------------------------------------------------------------------ */
{
  const { page, ctx, errors } = await open({ width: 1280, height: 800 })
  await page.evaluate(() => window.__world.setBand('scientist'))
  await endOfS0(page, 'runs')
  await waitFor(page, () => /Nara has a question/.test(document.querySelector('[data-testid=coach]')?.textContent ?? ''))
  check('after S0, Ploob points to Nara\'s question', true)
  const questNow = () => page.evaluate(() => ({ title: document.querySelector('[data-testid=quest-plate] p')?.textContent ?? '', items: [...document.querySelectorAll('[data-testid=checklist] li')].map((l) => ({ t: l.textContent, done: l.dataset.done })) }))
  let q = await questNow()
  check('the quest is The Handoff, four steps, the first open', /The Handoff/.test(q.title) && q.items.length === 4 && /Tell Nara what to do each morning/.test(q.items[0].t) && q.items[0].done === 'false', JSON.stringify(q))
  await page.evaluate(() => window.__world.keep.talk('talk.nara'))
  await waitFor(page, () => !!document.querySelector('[data-testid=keep-ask]'))
  check('Nara asks: five choices and a box for own words', (await page.locator('[data-testid^=keep-choice-]').count()) === 5 && (await page.getByTestId('keep-text').count()) === 1)
  check('the keep opened from S0\'s beds', (await stage(page)) === 'ask')
  check('the explorer is held while she asks', (await page.evaluate(() => window.__world.get().talk)) === 'talk.nara')
  await tap(page, 'keep-choice-daily')
  await waitFor(page, () => !!document.querySelector('[data-testid=keep-sayback]'))
  const sb = await page.getByTestId('keep-sayback').textContent()
  check('say-back: she names the difference first', /On soaked mornings you probed and waited/.test(sb), sb.slice(0, 80))
  check('say-back: the rule, then her two stops', /One can every morning, whatever the probe says/.test(sb) && (await page.getByTestId('keep-terms').count()) === 1)
  check('nothing runs before "Yes, that"', (await stage(page)) === 'ask')
  await tap(page, 'keep-revise')
  check('"No — let me say it again" goes back to the choices', (await page.getByTestId('keep-ask').count()) === 1)
  await tap(page, 'keep-choice-daily')
  await tap(page, 'keep-confirm')
  await waitFor(page, () => window.__world.get().keep?.confirmed === true)
  check('confirmed: stage ready, the card closes', (await stage(page)) === 'ready' && (await page.evaluate(() => window.__world.get().talk)) === null)
  check('Ploob points to Sela', /Sela is at the jetty/.test((await page.getByTestId('coach').textContent()) ?? ''))
  q = await questNow()
  check('the checklist ticks Nara off and moves to Sela', q.items[0].done === 'true' && q.items[1].done === 'false')
  await page.evaluate(() => window.__world.keep.talk('talk.sela'))
  await waitFor(page, () => !!document.querySelector('[data-testid=keep-board]'))
  check('Sela\'s board: three on the beds for a trial', (await page.getByTestId('keep-pegs').getAttribute('data-on-beds')) === '3')
  check('the trade is spelled out', /three crates/.test((await page.getByTestId('keep-trade').textContent()) ?? ''))
  check('the peg board stands in the world', (await sceneObj(page, 'keep-board'))?.onBeds === 3)
  await page.screenshot({ path: path.join(SHOTS, 'keep-board-desktop.png') })
  await tap(page, 'keep-begin')
  await waitFor(page, () => window.__world.get().keep?.dispatch?.status === 'begun')
  check('begin: the story fortnight is out', (await stage(page)) === 'away')
  await page.evaluate(() => window.__world.keep.cross('foundry'))
  await page.waitForTimeout(800)
  check('in the Foundry nothing settles', (await stage(page)) === 'away')
  await page.evaluate(() => window.__world.keep.cross('landing'))
  await waitFor(page, () => !!document.querySelector('[data-testid=keep-review]'))
  check('the return settles it and the review plays', (await stage(page)) === 'report')
  const d0 = Number(await page.getByTestId('keep-review').getAttribute('data-day'))
  // day 2 is the rain night's hold (1.7 s); the next day must come within a few seconds
  await waitFor(page, (d) => Number(document.querySelector('[data-testid=keep-review]')?.getAttribute('data-day')) > d, 4000, d0).catch(() => {})
  const d1 = Number(await page.getByTestId('keep-review').getAttribute('data-day'))
  check('the review moves through the days', d1 > d0, `${d0} → ${d1}`)
  await waitFor(page, () => document.querySelector('[data-testid=keep-review]')?.getAttribute('data-day') === '3', 6000)
  await page.waitForTimeout(400)
  const rl = await page.getByTestId('keep-review-line').textContent()
  check('held on dawn 3: the refusal', /dawn 3 · SOAKED — the rule says pour\. Nara puts the can down/.test(rl), rl)
  check('the review does not hold the explorer', (await page.evaluate(() => window.__world.get().talk)) === null)
  await page.screenshot({ path: path.join(SHOTS, 'keep-review-desktop.png') })
  await tap(page, 'keep-skip')
  await waitFor(page, () => !!document.querySelector('[data-testid=keep-report]'))
  const marks = await page.evaluate(() => [...document.querySelectorAll('[data-testid=keep-strip-far] [data-testid=keep-mark]')].map((e) => ({ d: +e.dataset.day, a: e.dataset.actor, x: e.dataset.action, ev: e.dataset.event })))
  check('report: fourteen marks on each bed', marks.length === 14 && (await page.locator('[data-testid=keep-strip-nara] [data-testid=keep-mark]').count()) === 14)
  check('day 3 is the refusal, Sela\'s people from day 3', marks[2].ev === 'soaked-refusal' && marks[2].x === 'wait' && marks.slice(2).every((m) => m.a === 'crew') && marks.slice(0, 2).every((m) => m.a === 'nara'))
  const rep = await page.getByTestId('keep-report').textContent()
  check('Nara\'s line names the day', /Day 3 the probe said soaked\. Your rule said pour\. I stopped/.test(rep))
  check('Sela: taken over, one crate', /My people took over the far bed/.test(rep) && /Crates at the jetty: 1 · 1 from this fortnight/.test((await page.getByTestId('keep-crates').textContent()) ?? ''))
  check('the Scientist sees the labelled counterfactual', (await page.getByTestId('keep-counterfactual').count()) === 1 && /this did not happen/.test(rep))
  check('Ploob asks who was caring for it', /Who was caring for it when it came back up/.test((await page.getByTestId('keep-ploob').textContent()) ?? ''))
  check('the report holds the explorer', (await page.evaluate(() => window.__world.get().talk)) === 'keep.card')
  check('in the world: one crate on the jetty, Sela\'s person at the far bed, the flag', (await sceneObj(page, 'keep-crates'))?.count === 1 && (await sceneObj(page, 'keep-crew'))?.why === 'soaked-refusal' && !!(await page.evaluate(() => window.__world.scene.getObjectByName('keep-flag'))))
  await tap(page, 'keep-dates-toggle')
  check('every day: a row per day', (await page.locator('[data-testid=keep-dates] tbody tr').count()) === 14)
  await page.screenshot({ path: path.join(SHOTS, 'keep-report-desktop.png') })
  // a reload with the report waiting: the stored report, reviewed again
  await page.waitForTimeout(900)
  await page.reload({ waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__world, null, { timeout: 60000 })
  check('reload: the welcome says the report is waiting', /Nara's report is waiting/.test((await page.getByTestId('welcome-line').textContent()) ?? ''))
  await resilientClick(page.getByTestId('play'), { label: 'Continue' })
  await waitFor(page, () => !!document.querySelector('[data-testid=keep-review]'))
  check('reload: the same report, one crate still', (await stage(page)) === 'report' && (await keep(page)).crates.length === 1)
  await tap(page, 'keep-skip')
  await waitFor(page, () => !!document.querySelector('[data-testid=keep-next]'))
  await tap(page, 'keep-next')
  await waitFor(page, () => !!document.querySelector('[data-testid=keep-ask]'))
  check('"So — what should I do next time?" goes back to Nara', (await stage(page)) === 'read')
  q = await questNow()
  check('the story fortnight read: the quest hands back to the Foundry errand', /Relight the furnace/.test(q.title), q.title)
  await tap(page, 'keep-choice-right')
  await tap(page, 'keep-confirm')
  await page.evaluate(() => window.__world.keep.talk('talk.sela'))
  await waitFor(page, () => !!document.querySelector('[data-testid=keep-board]'))
  check('the next fortnight is practice', /practice/.test((await page.getByTestId('keep-begin').textContent()) ?? '') && (await page.getByTestId('keep-practice-rain').count()) === 1)
  await tap(page, 'keep-begin')
  await waitFor(page, () => !!document.querySelector('[data-testid=keep-review]'))
  await tap(page, 'keep-skip')
  await waitFor(page, () => !!document.querySelector('[data-testid=keep-report]'))
  check('practice: no new crates', /none from this fortnight/.test((await page.getByTestId('keep-crates').textContent()) ?? '') && (await keep(page)).crates.length === 1)
  check('desktop: no console errors', errors.length === 0, errors.slice(0, 2).join(' | '))
  await ctx.close()
}

/* ------------------------------------------------------------------------ */
/* Phones — copies: pills, the pause, the pull-up sheet                      */
/* ------------------------------------------------------------------------ */
for (const [name, width, height] of [
  ['phone-844', 844, 390],
  ['phone-740', 740, 360],
]) {
  const { page, ctx, errors } = await open({ width, height }, { touch: true })
  await page.evaluate(() => window.__world.setBand('explorer'))
  await endOfS0(page, 'copies')
  await page.evaluate(() => window.__world.keep.talk('talk.nara'))
  await waitFor(page, () => !!document.querySelector('[data-testid=keep-ask]'))
  check(`${name}: Nara's card fits the screen`, await inView(page, 'keep-ask'))
  check(`${name}: while she asks, the wordmark, tools, stick and verb step back`, (await page.getByTestId('wordmark').evaluate((e) => getComputedStyle(e).opacity)) === '0' && (await page.getByTestId('toolbelt').count()) === 0 && (await page.getByTestId('stick').count()) === 0 && (await page.getByTestId('interact').count()) === 0)
  check(`${name}: every choice at least 36 px`, (await smallTargets(page, '[data-testid=keep-ask]')).length === 0, (await smallTargets(page, '[data-testid=keep-ask]')).join(', '))
  await page.screenshot({ path: path.join(SHOTS, `keep-ask-${name}.png`) })
  await tap(page, 'keep-choice-right')
  check(`${name}: the say-back fits`, await inView(page, 'keep-sayback'))
  await tap(page, 'keep-confirm')
  await page.evaluate(() => window.__world.keep.talk('talk.sela'))
  await waitFor(page, () => !!document.querySelector('[data-testid=keep-board]'))
  check(`${name}: Sela's board fits, controls ≥ 36 px`, (await inView(page, 'keep-board')) && (await smallTargets(page, '[data-testid=keep-board]')).length === 0, (await smallTargets(page, '[data-testid=keep-board]')).join(', '))
  await tap(page, 'keep-notyet')
  await waitFor(page, () => !!document.querySelector('[data-testid=keep-board-pill]'))
  check(`${name}: "Not yet" folds the board to a pill in Ploob's slot`, (await page.getByTestId('coach').count()) === 0 && (await page.getByTestId('stick').count()) === 1)
  const clear = await page.evaluate(() => {
    const a = document.querySelector('[data-testid=keep-board-pill]').getBoundingClientRect()
    const b = document.querySelector('[data-testid=stick]').getBoundingClientRect()
    return a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom
  })
  check(`${name}: the pill is clear of the stick`, clear)
  await page.screenshot({ path: path.join(SHOTS, `keep-board-pill-${name}.png`) })
  await tap(page, 'keep-board-pill')
  await waitFor(page, () => !!document.querySelector('[data-testid=keep-board]'))
  await tap(page, 'keep-begin')
  await page.evaluate(() => {
    window.__world.keep.cross('foundry')
    window.__world.keep.cross('landing')
  })
  await waitFor(page, () => !!document.querySelector('[data-testid=keep-review-pill]'))
  check(`${name}: the review runs as a pill; the explorer can walk`, (await page.evaluate(() => window.__world.get().talk)) === null && (await page.getByTestId('stick').count()) === 1)
  await page.screenshot({ path: path.join(SHOTS, `keep-review-pill-${name}.png`) })
  // The review keeps time while the world writes its store (a regression: a fresh callback reset each day's timer).
  const t0 = await page.getByTestId('keep-review-pill').getAttribute('data-day')
  await page.evaluate(() => {
    const id = setInterval(() => window.__world.set((s) => ({ time: s.time + 0.01 })), 50)
    setTimeout(() => clearInterval(id), 3000)
  })
  await page.waitForTimeout(3000)
  const t1 = await page.getByTestId('keep-review-pill').getAttribute('data-day').catch(() => '15')
  check(`${name}: the review keeps time through store writes`, Number(t1) > Number(t0), `${t0} → ${t1}`)
  await waitFor(page, () => !!document.querySelector('[data-testid=keep-pause]'), 20000)
  const pl = await page.getByTestId('keep-pause').textContent()
  check(`${name}: copies — Nara stops to ask about dawn 3`, /Day 3 the far bed read soaked\. You never showed me soaked on that bed\. I waited/.test(pl), pl.slice(0, 90))
  check(`${name}: the pause fits and holds the explorer`, (await inView(page, 'keep-pause')) && (await page.evaluate(() => window.__world.get().talk)) === 'keep.card')
  await page.screenshot({ path: path.join(SHOTS, `keep-pause-${name}.png`) })
  await tap(page, 'keep-pause-right')
  await waitFor(page, () => !!document.querySelector('[data-testid=keep-report-pill]'))
  check(`${name}: a right answer raises Nara to runs`, (await page.evaluate(() => window.__world.get().plot.competence)) === 'runs')
  check(`${name}: the page card is not over the S1 cards`, (await page.getByTestId('codex-close').count()) === 0)
  check(`${name}: the report waits as a pill; the explorer can walk`, (await page.evaluate(() => window.__world.get().talk)) === null)
  await page.screenshot({ path: path.join(SHOTS, `keep-report-pill-${name}.png`) })
  await tap(page, 'keep-report-pill')
  await waitFor(page, () => !!document.querySelector('[data-testid=keep-report][data-sheet]'))
  check(`${name}: pulled up, the report is a sheet that fits`, await inView(page, 'keep-report'))
  check(`${name}: the sheet's controls ≥ 36 px`, (await smallTargets(page, '[data-testid=keep-report]')).length === 0, (await smallTargets(page, '[data-testid=keep-report]')).join(', '))
  check(`${name}: after the answer, Nara's line moves on`, /You told me why/.test((await page.getByTestId('keep-report').textContent()) ?? ''))
  check(`${name}: independent right — three crates, Sela says it held`, /What you taught her held/.test((await page.getByTestId('keep-sela-line').textContent()) ?? '') && /Crates at the jetty: 3/.test((await page.getByTestId('keep-crates').textContent()) ?? ''))
  await page.screenshot({ path: path.join(SHOTS, `keep-report-${name}.png`) })
  await tap(page, 'keep-report-fold')
  await waitFor(page, () => !!document.querySelector('[data-testid=keep-report-pill]'))
  check(`${name}: folds back to its pill`, true)
  check(`${name}: no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '))
  await ctx.close()
}

/* ------------------------------------------------------------------------ */
/* Preview: the welcome card's jump to S1 (localhost counts as a preview)    */
/* ------------------------------------------------------------------------ */
{
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true })
  const page = await ctx.newPage()
  await page.goto(`${BASE}?q=low#/world`, { waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__world, null, { timeout: 60000 })
  check('preview: the welcome offers a jump to S1', (await page.getByTestId('chapters').count()) === 1)
  await page.getByTestId('start-s1-runs').scrollIntoViewIfNeeded()
  const reach = await page.evaluate(() => {
    const r = document.querySelector('[data-testid=start-s1-runs]').getBoundingClientRect()
    return r.bottom <= innerHeight && r.top >= 0
  })
  check('a 390 px phone can scroll the welcome to its buttons', reach)
  await resilientClick(page.getByTestId('start-s1-runs'), { label: 'Start at S1' })
  await waitFor(page, () => window.__world.get().phase === 'play' && window.__world.get().plot.sent)
  check('Start at S1: S0 finished, no Codex card in the way', (await page.getByTestId('codex-close').count()) === 0)
  await waitFor(page, () => /Nara has a question/.test(document.querySelector('[data-testid=coach]')?.textContent ?? ''))
  check('Start at S1: Ploob points to Nara', true)
  await page.screenshot({ path: path.join(SHOTS, 'keep-start-s1.png') })
  await ctx.close()
}

/* ------------------------------------------------------------------------ */
/* Glass — liquid where the quality allows it, solid where it doesn't        */
/* ------------------------------------------------------------------------ */
for (const q of ['medium', 'low']) {
  const { page, ctx } = await open({ width: 1280, height: 800 }, { q })
  await endOfS0(page, 'runs')
  await page.evaluate(() => window.__world.keep.talk('talk.nara'))
  await waitFor(page, () => !!document.querySelector('[data-testid=keep-ask]'))
  const g = await page.evaluate(() => ({ mode: document.querySelector('.hud')?.dataset.glass, bf: getComputedStyle(document.querySelector('[data-testid=keep-ask]')).backdropFilter }))
  if (q === 'medium') {
    check('medium quality: liquid glass (blur + the refraction filter)', g.mode === 'liquid' && /blur/.test(g.bf) && /lg-refract/.test(g.bf), JSON.stringify(g))
    await page.waitForTimeout(1500)
    await page.screenshot({ path: path.join(SHOTS, 'keep-ask-glass.png') })
  } else check('low quality: the solid plate, nothing sampled behind it', g.mode === 'solid' && (g.bf === 'none' || g.bf === ''), JSON.stringify(g))
  await ctx.close()
}

await browser.close()
process.exit(tally())
