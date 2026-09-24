/**
 * The Landing plot — S0, "The Drooping Cassava" — in a real browser.
 *
 * The storyboard's §11 list, checked against dist-world on :8766: the spawn
 * faces the trail and the chevrons run; Nara's card carries her testimony and
 * the stake; the marker takes a cleaned nickname; the brief cannot open before
 * the first probe and refuses to proceed without a number; the number can be
 * revised and the record shows the sequence; the Lens shows the air with no
 * lab-phase text naming the cause; a pour on dawn 1 lowers firm at once; two
 * pours collapse the roots and offer the retry with the failed try in the
 * journal; waiting stands the plant on day 3 (chime, glyph); the probe reads
 * DRY at dawn 7 with firm still 1.0; cans on 7 and 10 end standing; three
 * unprobed dawns bring "Shall we look first?"; the far bed reads DRY at 0.65
 * and one can lifts it then lets it fall; the method card lists the four
 * steps; Nara's pause plays before the record; the record precedes the
 * fence; the fence rises, the cutting is planted, Sela names the Foundry;
 * a reload resumes the same day with the same cans and revisions. Then the
 * phone sizes: the plate's one-line form, nothing over the stick.
 *
 * Days are run by the suite handle (`__world.plot.runDay`), which steps the
 * same ticker the scene does; the walk is real where the storyboard says the
 * gesture matters (the probe at the bed, the marker), teleported elsewhere.
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { reporter, resilientClick } from './verify-lib.mjs'

const BASE = process.env.WORLD_BASE ?? 'http://localhost:8766/index.html'
const SHOTS = path.resolve('shots')
fs.mkdirSync(SHOTS, { recursive: true })
const { check, tally } = reporter()

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })

async function open(viewport, { touch = false } = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_TUNNEL|favicon|WebGL|GPU|swiftshader|503/i.test(m.text())) errors.push(m.text())
  })
  await page.goto(`${BASE}?q=low#/world`, { waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__world, null, { timeout: 60000 })
  return { page, ctx, errors }
}

const world = (page) => page.evaluate(() => window.__world.get())
const plot = (page) => page.evaluate(() => window.__world.get().plot)
const run = (page) => page.evaluate(() => window.__world.plot.run())
const waitFor = (page, fn, ms = 15000) => page.waitForFunction(fn, null, { timeout: ms })
const goto = async (page, x, z) => {
  await page.evaluate(([x, z]) => window.__world.setPos(x, 0.6, z), [x, z])
  await page.waitForTimeout(650)
}
/** Probe (through the handle), then pour or wait, then run the day to its next dawn. */
async function dawn(page, choice, { probe = true } = {}) {
  await page.evaluate(
    ([c, p]) => {
      if (p) window.__world.plot.probe()
      window.__world.plot.choose(c)
      window.__world.plot.runDay()
    },
    [choice, probe],
  )
  await page.waitForTimeout(120)
}
const GATE = /\b(drown\w*|air|airless|oxygen|roots?)\b/i

/** Play to the first bed's brief said, with the marker in: the common opening. */
async function toTrial(page, { name = 'Leafy 7', said = 3 } = {}) {
  await resilientClick(page.getByTestId('play'), { label: 'Play' })
  await waitFor(page, () => window.__world.get().phase === 'play')
  await page.evaluate(() => window.__world.setBand('explorer'))
  // Nara
  await goto(page, 1.9, 1.9)
  await waitFor(page, () => window.__world.get().near === 'talk.nara', 8000)
  await page.keyboard.press('KeyE')
  await waitFor(page, () => window.__world.get().talk === 'talk.nara')
  for (let i = 0; i < 4; i += 1) {
    await resilientClick(page.getByTestId('talk-next'), { label: 'Go on' })
    await page.waitForTimeout(120)
  }
  await waitFor(page, () => window.__world.get().talk === null)
  // the marker
  await goto(page, -1.2, 3.4)
  await waitFor(page, () => window.__world.get().near === 'marker.plot', 8000)
  await page.keyboard.press('KeyE')
  await waitFor(page, () => !!document.querySelector('[data-testid=naming]'))
  await page.getByTestId('nickname').fill(name)
  await resilientClick(page.getByTestId('name-plant'), { label: 'Put the name up' })
  await waitFor(page, () => window.__world.get().plot.stage === 'first')
  // the first probe, at the bed, with the key
  await goto(page, 1.6, 2.4)
  await waitFor(page, () => window.__world.get().near === 'bed.nara', 8000)
  await page.keyboard.press('KeyE')
  await waitFor(page, () => window.__world.get().plot.probes >= 1)
  await waitFor(page, () => !!document.querySelector('[data-testid=plot-brief]'))
  await page.getByTestId('plot-cans').fill(String(said))
  await resilientClick(page.getByTestId('plot-say'), { label: 'Say it' })
  await waitFor(page, () => (window.__world.plot.run()?.said.length ?? 0) >= 1)
  await page.waitForTimeout(200)
  check('a child who never raises the Lens is not held at it: the number said, the step is the fortnight', (await plot(page)).step === 'fortnight', (await plot(page)).step)
}

/* ------------------------------------------------------------------------ */
/* Desktop: the way in, the fortnight, the far bed, the ending               */
/* ------------------------------------------------------------------------ */
{
  const { page, ctx, errors } = await open({ width: 1440, height: 900 })
  check('the welcome leads with the question', (await page.locator('h1', { hasText: "Why is Nara's cassava drooping?" }).count()) === 1)
  check('the hook names the wet streak, not the cause', await page.getByTestId('welcome-line').textContent().then((t) => /wet streak/.test(t) && !GATE.test(t)))
  await resilientClick(page.getByTestId('play'), { label: 'Play' })
  await waitFor(page, () => window.__world.get().phase === 'play')
  await page.evaluate(() => window.__world.setBand('explorer'))
  await page.waitForTimeout(1200)
  const p0 = await page.evaluate(() => { const p = window.__world.live.pos; return [p.x, p.y, p.z] })
  check('the child spawns on the jetty, facing the settlement', p0[2] > 14 && Math.abs(p0[0] - 5) < 1 && (await page.evaluate(() => Math.abs(Math.abs(window.__world.live.facing) - Math.PI) < 0.3)), JSON.stringify(p0.map((v) => v.toFixed(1))))
  check('the quest plate carries the question and a checklist with nothing ticked', (await page.getByTestId('quest-plate').textContent()).includes("Why is Nara's cassava drooping?") && (await page.locator('[data-testid=checklist] li[data-done=true]').count()) === 0)
  check('the first step is the trail, in Ploob\'s words, cause unnamed', await page.getByTestId('coach').textContent().then((t) => /spilling water/.test(t) && !GATE.test(t)))
  const chevrons = await page.evaluate(() => {
    let n = 0
    window.__world.scene.traverse((o) => {
      if (o.isInstancedMesh && o.visible && o.material?.opacity > 0.2) n += 1
    })
    return n
  })
  check('the chevrons run at the start', chevrons >= 1, String(chevrons))
  check('the Probe tool is dim with no bed in reach', (await page.getByTestId('probe').getAttribute('class')).includes('opacity-45'))
  await page.screenshot({ path: path.join(SHOTS, 'landing-arrive.png') })

  // Nara
  await goto(page, 1.9, 1.9)
  await waitFor(page, () => window.__world.get().near === 'talk.nara', 8000)
  check('the verb at Nara is Talk', await page.getByTestId('interact').textContent().then((t) => /Talk to Nara/.test(t)))
  await page.keyboard.press('KeyE')
  await waitFor(page, () => window.__world.get().talk === 'talk.nara')
  const l1 = await page.getByTestId('talk-line').textContent()
  check("Nara's card opens on her testimony", /I gave this one more this morning/.test(l1), l1)
  check('with her portrait', (await page.getByTestId('talk-portrait').count()) === 1)
  await resilientClick(page.getByTestId('talk-next'), { label: 'Go on' })
  const l2 = await page.getByTestId('talk-line').textContent()
  check('then the stake, in one line', /last cutting from my mother/.test(l2), l2)
  await page.screenshot({ path: path.join(SHOTS, 'landing-nara.png') })
  for (let i = 0; i < 3; i += 1) {
    await resilientClick(page.getByTestId('talk-next'), { label: 'Go on' })
    await page.waitForTimeout(120)
  }
  await waitFor(page, () => window.__world.get().talk === null)
  check('meeting Nara moves the plot on: the marker is the next step', (await plot(page)).met && (await plot(page)).step === 'claim')

  // the marker + a cleaned nickname
  await goto(page, -1.2, 3.4)
  await waitFor(page, () => window.__world.get().near === 'marker.plot', 8000)
  await page.keyboard.press('KeyE')
  await waitFor(page, () => !!document.querySelector('[data-testid=naming]'))
  await page.getByTestId('nickname').fill('Kofi!! 12345 <b>')
  const cleaned = await page.getByTestId('nickname').inputValue()
  check('the nickname is cleaned as the courtyard cleans it (no symbols, no long numbers)', cleaned === 'Kofi  b' || cleaned === 'Kofi b', JSON.stringify(cleaned))
  await page.getByTestId('nickname').fill('Leafy 7')
  await resilientClick(page.getByTestId('name-plant'), { label: 'Put the name up' })
  await waitFor(page, () => window.__world.get().plot.stage === 'first')
  const named = await plot(page)
  check('the plot is named and the fortnight is set up on the baseline bed', named.name === 'Leafy 7' && named.run?.bed === 'first' && named.run?.length === 14 && named.run?.start.airStart === 0.06)
  check('the checklist reveals the next investigation step', (await page.getByTestId('checklist').textContent()).includes("Probe Nara's bed") && (await page.getByTestId('checklist').textContent()).includes('The page by the well') === false)
  check('the brief cannot open before the first probe', (await page.getByTestId('plot-brief').count()) === 0)
  check('Pour and Wait are shut before a number', await page.getByTestId('plot-wait').isDisabled())
  await page.screenshot({ path: path.join(SHOTS, 'landing-named.png') })

  // the first probe, at the bed
  await goto(page, 1.6, 2.4)
  await waitFor(page, () => window.__world.get().near === 'bed.nara', 8000)
  check('the verb at the bed is Probe', await page.getByTestId('interact').textContent().then((t) => /Probe the bed/.test(t)))
  await page.keyboard.press('KeyE')
  await waitFor(page, () => window.__world.get().plot.probes >= 1)
  check('the probe reads SOAKED on the plate', await page.getByTestId('plot-word').textContent().then((t) => /SOAKED/.test(t)))
  check('Explorer sees the word, not θ', await page.getByTestId('plot-word').textContent().then((t) => !/θ/.test(t)))
  await waitFor(page, () => !!document.querySelector('[data-testid=plot-brief]'))
  check('the brief opens after the first probe', await page.getByTestId('plot-brief').isVisible())
  check('and refuses to proceed without a number', await page.getByTestId('plot-say').isDisabled())
  check('the brief carries the probe\'s word back, not a cause', await page.getByTestId('plot-brief').textContent().then((t) => /The probe says SOAKED/.test(t) && !GATE.test(t)))

  // the Lens: evidence, no sentence (the toolbelt button — the brief's input holds the keys)
  await resilientClick(page.getByTestId('lens'), { label: 'Lens' })
  await waitFor(page, () => window.__world.get().ring === 'system')
  await waitFor(page, () => !!document.querySelector('[data-testid=bed-scope]'))
  const scopeAir = await page.getByTestId('scope-air').textContent()
  check('the Lens System ring shows the air in the pores at 6 %', /6 %/.test(scopeAir), scopeAir)
  check('and the O₂ and root bars', (await page.getByTestId('scope-o2').count()) === 1 && (await page.getByTestId('scope-roots').count()) === 1)
  const hudText = await page.evaluate(() => [...document.querySelectorAll('[data-testid=coach], [data-testid=talk-line], [data-testid=plot-rule], [data-testid=welcome-line]')].map((e) => e.textContent).join(' | '))
  check('no dialogue or rule text names the cause before the first stand and a DRY read', !GATE.test(hudText), hudText.slice(0, 120))
  check('the Lens counts as seen', (await plot(page)).lensSeen)
  await page.screenshot({ path: path.join(SHOTS, 'landing-lens.png') })
  await resilientClick(page.getByTestId('lens'), { label: 'Lens' })
  await waitFor(page, () => window.__world.get().ring === 'world')

  // the number, typed; revised later
  await page.getByTestId('plot-cans').fill('3')
  await resilientClick(page.getByTestId('plot-say'), { label: 'Say it' })
  await waitFor(page, () => (window.__world.plot.run()?.said.length ?? 0) === 1)
  check('the number is recorded as typed', (await run(page)).said.join() === '3' && (await page.getByTestId('plot-said').textContent()) === '3')
  check('the checklist now shows the fortnight objective', (await page.getByTestId('checklist').textContent()).includes('Keep it standing for a fortnight'))

  // a pour on dawn 1: the strange result, at once
  await resilientClick(page.getByTestId('plot-pour'), { label: 'Pour' })
  await waitFor(page, () => window.__world.plot.run()?.phase === 'running')
  check('the plate says the day is running', await page.getByTestId('plot-plate').getAttribute('data-phase').then((v) => v === 'running'))
  check('… with a countdown to the next dawn', await page.getByTestId('plot-countdown').textContent().then((t) => /\d s to dawn/.test(t)))
  const sunRunning = await page.evaluate(() => window.__world.sun())
  await page.evaluate(() => window.__world.plot.runDay())
  await waitFor(page, () => window.__world.plot.run()?.phase === 'dawn')
  await page.waitForTimeout(250)
  check('Ploob names what happened, not why', await page.getByTestId('coach').textContent().then((t) => /drooped more/.test(t) && !GATE.test(t)))
  const r1 = await run(page)
  check('a pour on dawn 1 lowers firm at once: 0.33 at the first noon', r1.days.length === 1 && Math.abs(r1.days[0].firm13 - 0.33) < 0.02, String(r1.days[0]?.firm13?.toFixed(2)))
  check('the plate reads it', await page.getByTestId('plot-firm').textContent().then((t) => /0\.3[2-4]/.test(t)))
  check('the sky is the trial\'s: dawn glow at the pause, brighter as the day ran', Math.abs((await page.evaluate(() => window.__world.sun())) - 0.46) < 0.03 && sunRunning > 0.5, `${sunRunning} → ${await page.evaluate(() => window.__world.sun())}`)
  check('a new dawn asks for the probe first, and the water and air bars are greyed until it goes in', (await page.getByTestId('plot-clock').getAttribute('data-state')) === 'unprobed' && (await page.getByTestId('plot-word').textContent()).includes('probe first') && (await page.getByTestId('plot-eq').getAttribute('data-stale')) === 'true')
  check('the equaliser has water, air and the leaf, the goal on the leaf', (await page.getByTestId('eq-water').count()) === 1 && (await page.getByTestId('eq-air').count()) === 1 && (await page.getByTestId('eq-firm').textContent()).toLowerCase().includes('standing'))
  // change my number
  await resilientClick(page.getByTestId('plot-revise'), { label: 'change my number' })
  await waitFor(page, () => !!document.querySelector('[data-testid=plot-brief]'))
  await page.getByTestId('plot-cans').fill('2')
  await resilientClick(page.getByTestId('plot-say'), { label: 'Say it' })
  await waitFor(page, () => (window.__world.plot.run()?.said.length ?? 0) === 2)
  check('the revision is kept as a sequence, 3 → 2', (await run(page)).said.join() === '3,2')

  // a second pour: the roots collapse, the retry on day 4, the failed try in the journal
  await dawn(page, 'pour')
  await dawn(page, 'wait')
  await dawn(page, 'wait')
  await waitFor(page, () => window.__world.plot.run()?.phase === 'dead')
  const dead = await run(page)
  check('two pours on dawns 1 and 2 collapse the roots by day 4', dead.days.length === 4 && dead.b.health === 0, `${dead.days.length} days, roots ${dead.b.health}`)
  await waitFor(page, () => !!document.querySelector('[data-testid=retry]'))
  check('the plate offers the retry on day 4', await page.getByTestId('retry').getAttribute('data-dead').then((v) => v === 'true'))
  check('the failed try is in the journal', (await plot(page)).attempts.length === 1 && (await plot(page)).attempts[0].rescued === false)
  await page.screenshot({ path: path.join(SHOTS, 'landing-retry.png') })
  await page.keyboard.press('KeyJ')
  await waitFor(page, () => !!document.querySelector('[data-testid=plot-journal]'))
  check('the journal shows it, curve and all', (await page.locator('[data-testid=journal-try]').count()) === 1 && (await page.getByTestId('journal-try').getAttribute('data-rescued')) === 'false')
  await resilientClick(page.getByTestId('plot-journal-close'), { label: 'Close' })
  await page.waitForTimeout(400)
  await resilientClick(page.getByTestId('retry-replay'), { label: 'Replay this fortnight' })
  await waitFor(page, () => window.__world.plot.run()?.attempt === 2)
  const again = await run(page)
  check('Replay keeps the same bed and seed, day 1 again, nothing said yet', again.start.airStart === 0.06 && again.day === 1 && again.said.length === 0 && again.phase === 'dawn')

  // waiting stands the plant on day 3
  await page.evaluate(() => window.__world.plot.probe())
  await page.evaluate(() => window.__world.plot.say(2))
  await dawn(page, 'wait')
  await dawn(page, 'wait')
  check('no stand yet after two dawns', !(await plot(page)).stood)
  await dawn(page, 'wait')
  await waitFor(page, () => window.__world.get().plot.stood === true)
  check('waiting stands the plant on day 3 — the event fires', (await run(page)).stood === 3)
  check('the leaf glyph goes green', (await page.getByTestId('plot-leaf').getAttribute('data-stood')) === 'true')
  await page.waitForTimeout(200)
  check('Ploob marks it without the cause', await page.getByTestId('coach').textContent().then((t) => /came up/.test(t) && !GATE.test(t)))
  check('the rule line is still shut (no DRY read yet)', (await page.getByTestId('plot-rule').count()) === 0)
  await page.screenshot({ path: path.join(SHOTS, 'landing-stand.png') })
  // Nara's line at the stand
  await goto(page, 1.9, 1.9)
  await waitFor(page, () => window.__world.get().near === 'talk.nara', 8000)
  await page.keyboard.press('KeyE')
  await waitFor(page, () => window.__world.get().talk === 'talk.nara')
  check("Nara: 'You gave it nothing. And look.'", await page.getByTestId('talk-line').textContent().then((t) => /gave it nothing/.test(t)))
  await page.keyboard.press('Escape')
  await waitFor(page, () => window.__world.get().talk === null)

  // dawns 4–6: DAMP, DAMP, then DRY at dawn 7 with firm still 1.0
  await dawn(page, 'wait')
  await dawn(page, 'wait')
  await dawn(page, 'wait')
  await page.evaluate(() => window.__world.plot.probe())
  const r7 = await run(page)
  check('the probe reads DRY at dawn 7 with firm still 1.0', r7.day === 7 && r7.today.word === 'DRY' && r7.firm13 >= 0.99, `${r7.day} ${r7.today.word} ${r7.firm13.toFixed(2)}`)
  check('the dawns before read DAMP', r7.days[4].word === 'DAMP' && r7.days[5].word === 'DAMP')
  await waitFor(page, () => !!document.querySelector('[data-testid=plot-rule]'))
  check('now the rule line opens: Roots need air as well as water', await page.getByTestId('plot-rule').textContent().then((t) => /Roots need air as well as water/.test(t)))
  // a can on a DRY morning, then check, then another when DRY again (7 + 10 wins)
  await page.evaluate(() => { window.__world.plot.choose('pour'); window.__world.plot.runDay() })
  await page.waitForTimeout(120)
  await dawn(page, 'wait')
  await dawn(page, 'wait')
  await page.evaluate(() => window.__world.plot.probe())
  const r10 = await run(page)
  check('two dawns on it reads DRY again', r10.day === 10 && r10.today.word === 'DRY', `${r10.day} ${r10.today.word}`)
  await page.evaluate(() => { window.__world.plot.choose('pour'); window.__world.plot.runDay() })
  await page.waitForTimeout(120)
  for (let d = 11; d <= 14; d += 1) await dawn(page, 'wait')
  await waitFor(page, () => window.__world.plot.run()?.phase === 'done')
  const done = await run(page)
  check('cans on 7 and 10 end standing (firm ≥ 0.8 at the last noon)', done.days[13].firm13 >= 0.8 && (await plot(page)).rescuedFirst, done.days[13].firm13.toFixed(2))
  await page.waitForTimeout(300)
  check("the run over, the child's own Look is back (Day)", (await page.evaluate(() => window.__world.sun())) === 1)
  await waitFor(page, () => !!document.querySelector('[data-testid=rescue-line]'))
  const rl = await page.getByTestId('rescue-line').textContent()
  check('the rescue line: Still standing · 2 cans · you said 2', /Still standing · 2 cans · you said 2/.test(rl), rl)
  check('steady hands, earned', (await page.getByTestId('rescue-line').getAttribute('data-care')) === 'true')
  await page.screenshot({ path: path.join(SHOTS, 'landing-fortnight.png') })
  await resilientClick(page.getByTestId('rescue-next'), { label: 'Next morning' })
  await waitFor(page, () => window.__world.get().plot.stage === 'second')

  // the far bed: DRY at 0.65; one can lifts it, then it falls; three cans hold it
  const far = await run(page)
  check('the far bed opens DRY at 0.65 for a week', far.bed === 'second' && far.length === 7 && far.today.word === 'DRY' && Math.abs(far.b.firm - 0.65) < 0.08, `${far.today.word} ${far.b.firm.toFixed(2)}`)
  await goto(page, -8.4, 0.4)
  await waitFor(page, () => window.__world.get().near === 'talk.nara' || window.__world.get().near === 'bed.far', 8000)
  check('the verb at the far bed is Probe', await page.getByTestId('interact').textContent().then((t) => /Probe the bed/.test(t)))
  await page.evaluate(() => window.__world.set({ talk: 'talk.nara' }))
  await waitFor(page, () => !!document.querySelector('[data-testid=talk-line]'))
  check("Nara's over-correction, in her mouth", await page.getByTestId('talk-line').textContent().then((t) => /gone the same way/.test(t) && /Both of them/.test(t)))
  await page.keyboard.press('Escape')
  await waitFor(page, () => window.__world.get().talk === null)
  check('the far bed has no brief before its first probe', (await page.getByTestId('plot-brief').count()) === 0)
  await page.evaluate(() => window.__world.plot.probe())
  await waitFor(page, () => document.querySelector('[data-testid=plot-brief]')?.getAttribute('data-bed') === 'second')
  check('the far bed asks for its own number after the first probe', await page.getByTestId('plot-brief').textContent().then((t) => /this bed take to stay standing for the week/.test(t)))
  check('Pour and Wait are shut until it is said', await page.getByTestId('plot-wait').isDisabled())
  await page.getByTestId('plot-cans').fill('3')
  await resilientClick(page.getByTestId('plot-say'), { label: 'Say it' })
  await waitFor(page, () => (window.__world.plot.run()?.said.length ?? 0) === 1)
  await dawn(page, 'pour')
  await dawn(page, 'wait')
  const f2 = await run(page)
  check('one can lifts it to 1.0 that noon', f2.days[0].firm13 >= 0.99, f2.days[0].firm13.toFixed(2))
  await dawn(page, 'pour')
  await dawn(page, 'wait')
  await dawn(page, 'pour')
  await dawn(page, 'wait')
  await dawn(page, 'wait')
  await waitFor(page, () => window.__world.plot.run()?.phase === 'done')
  check('three cans on 1, 3, 5 hold it for the week', (await plot(page)).rescuedSecond)
  await waitFor(page, () => !!document.querySelector('[data-testid=rescue-line]'))
  await resilientClick(page.getByTestId('rescue-next'), { label: 'Go on' })
  await waitFor(page, () => window.__world.get().plot.stage === 'method')

  // the method card, the pause, the record
  await waitFor(page, () => !!document.querySelector('[data-testid=method]'))
  const steps = await page.locator('[data-testid^=method-step-]').allTextContents()
  check('the method card lists the four steps', steps.length === 4 && /Probe/.test(steps[0]) && /Soaked/.test(steps[1]) && /Dry/.test(steps[2]) && /Check again/.test(steps[3]))
  check('all four are ticked from the child\'s own dawns', (await page.locator('[data-testid^=method-step-][data-on=true]').count()) === 4)
  await page.screenshot({ path: path.join(SHOTS, 'landing-method.png') })
  await resilientClick(page.getByTestId('method-handin'), { label: 'Hand it to Nara' })
  await waitFor(page, () => window.__world.get().plot.stage === 'pause')
  check("Nara's pause plays before the record: the chrome is down", (await page.getByTestId('toolbelt').count()) === 0 && (await page.getByTestId('record').count()) === 0)
  check("her competence is 'runs' — both beds held, the far bed probed before poured", (await plot(page)).competence === 'runs')
  await page.waitForTimeout(3000)
  await page.screenshot({ path: path.join(SHOTS, 'landing-pause.png') })
  await waitFor(page, () => window.__world.get().plot.stage === 'record', 12000)
  await waitFor(page, () => !!document.querySelector('[data-testid=record]'))
  const said = await page.getByTestId('record-said').textContent()
  check('the record: you said 2 · hers took 2 · the far bed took 3 (you said 3)', /You said 2 · hers took 2 · the far bed took 3 \(you said 3\)/.test(said), said)
  check('Explorer sees care first and optional economy detail', (await page.getByTestId('record-care').textContent()).includes('Steady hands') && (await page.getByTestId('record-accuracy').textContent()).includes('spot on') && (await page.getByTestId('record-economy').textContent()).includes('fewest'))
  check('the record precedes the fence', (await page.evaluate(() => { let v = false; window.__world.scene.traverse((o) => { if (o.name === 'fence' && o.visible) v = true }); return v })) === false)
  await resilientClick(page.getByTestId('record-next'), { label: 'One question' })
  await waitFor(page, () => !!document.querySelector('[data-testid=plot-why-0]'))
  await resilientClick(page.getByTestId('plot-why-0'), { label: 'It was thirsty' })
  await waitFor(page, () => window.__world.get().plot.why === 0)
  check("'it was thirsty' is disproved by the world, in Ploob's line", await page.getByTestId('plot-why-line').textContent().then((t) => /probe showed water was already there/.test(t)))
  await resilientClick(page.getByTestId('plot-why-next'), { label: 'Watch the other way' })
  await waitFor(page, () => !!document.querySelector('[data-testid=counterfactual]'))
  await waitFor(page, () => document.querySelector('[data-testid=counterfactual]')?.getAttribute('data-finished') === 'true', 15000)
  const split = await page.getByTestId('cf-split').textContent()
  check('the split card: YOU 2 cans standing · EVERY MORNING 14 cans gone', /2 cans · standing/.test(split) && /14 cans · gone/.test(split), split)
  await page.screenshot({ path: path.join(SHOTS, 'landing-record.png') })
  await resilientClick(page.getByTestId('cf-next'), { label: 'Into the journal' })
  await waitFor(page, () => window.__world.get().plot.stage === 'page')

  // the page by the well
  check('Ploob points at the page by the well', await page.getByTestId('coach').textContent().then((t) => /mud by the well/.test(t)))
  await goto(page, 4.9, 4.6)
  await waitFor(page, () => window.__world.get().near === 'page.well', 8000)
  await page.keyboard.press('KeyE')
  await waitFor(page, () => !!document.querySelector('[data-testid=codex-page]'))
  check('the Codex page: the world\'s line, the discovery, the rule', (await page.getByTestId('codex-page').textContent()).includes('A soaked bed wants air before it wants water') && (await page.getByTestId('codex-discovered').textContent()).includes('check before you pour') && (await page.getByTestId('codex-rule').textContent()).includes('Roots need air'))
  check('Explorer has no Show me how', (await page.getByTestId('codex-how').count()) === 0)
  await page.screenshot({ path: path.join(SHOTS, 'landing-page.png') })
  await resilientClick(page.getByTestId('codex-close'), { label: 'Keep it' })
  await waitFor(page, () => window.__world.get().plot.stage === 'reward')

  // the reward: the fence rises, the cutting is planted, Sela at the jetty
  await page.waitForTimeout(1500)
  check('the fence rises', await page.evaluate(() => { let v = false; window.__world.scene.traverse((o) => { if (o.name === 'fence' && o.visible) v = true }); return v }))
  await goto(page, -2.4, 3.2)
  await waitFor(page, () => window.__world.get().near === 'bed.mine', 8000)
  check('the verb at your plot is Plant', await page.getByTestId('interact').textContent().then((t) => /Plant the cutting/.test(t)))
  await page.keyboard.press('KeyE')
  await waitFor(page, () => window.__world.get().plot.planted === true)
  check('the cutting is planted; the stage is done', (await plot(page)).stage === 'done')
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(SHOTS, 'landing-reward.png') })
  await goto(page, 5, 12.6)
  await waitFor(page, () => window.__world.get().near === 'talk.sela', 8000)
  await page.keyboard.press('KeyE')
  await waitFor(page, () => window.__world.get().talk === 'talk.sela')
  const sela = await page.getByTestId('talk-line').textContent()
  check("Sela's line names the workshop kit and the cold Foundry", /workshop kit/.test(sela) && /Foundry is cold/.test(sela), sela)
  await resilientClick(page.getByTestId('talk-next'), { label: 'Go on' })
  await resilientClick(page.getByTestId('talk-next'), { label: 'Back to work' })
  await waitFor(page, () => window.__world.get().plot.sent === true)
  check("after Sela, the furnace's quest takes the plate", (await page.getByTestId('quest-plate').textContent()).includes('Relight the furnace') && (await world(page)).step === 'arrive')
  check('the beacon across the water is still dark', (await world(page)).poured === false)
  check('no console errors on the desktop walk', errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

/* ------------------------------------------------------------------------ */
/* The retry that varies the bed; the nudge; the save                        */
/* ------------------------------------------------------------------------ */
{
  const { page, ctx, errors } = await open({ width: 1280, height: 800 })
  await toTrial(page, { said: 3 })
  // three unprobed dawns bring the nudge (dawn 1 was probed at the brief)
  await dawn(page, 'wait', { probe: false })
  await dawn(page, 'wait', { probe: false })
  await dawn(page, 'wait', { probe: false })
  await page.waitForTimeout(300)
  check('two unprobed dawns: no nudge yet', !/Shall we look first\?/.test(await page.getByTestId('coach').textContent()))
  await dawn(page, 'wait', { probe: false })
  await page.waitForTimeout(300)
  check("three unprobed dawns: Ploob asks 'Shall we look first?'", await page.getByTestId('coach').textContent().then((t) => /Shall we look first\?/.test(t)))
  // let it droop to the end without a can
  for (let d = 5; d <= 14; d += 1) await dawn(page, 'wait', { probe: true })
  await waitFor(page, () => window.__world.plot.run()?.phase === 'done')
  await waitFor(page, () => !!document.querySelector('[data-testid=retry]'))
  check('doing nothing ends not standing: the retry is offered', (await page.getByTestId('retry').getAttribute('data-dead')) === 'false' && !(await plot(page)).rescuedFirst)
  await page.waitForTimeout(500) // the card's entrance
  await resilientClick(page.getByTestId('retry-fresh'), { label: 'A new bed' })
  await waitFor(page, () => window.__world.plot.run()?.attempt === 2)
  const fresh = await run(page)
  check('A new bed draws from the drier band, so the first fortnight\'s calendar fails', fresh.start.airStart >= 0.064 && fresh.start.airStart <= 0.07 && fresh.start.airStart !== 0.06, JSON.stringify(fresh.start))
  await page.evaluate(() => window.__world.plot.probe())
  check('it still reads SOAKED at first', (await run(page)).today.word === 'SOAKED')
  // reload mid-fortnight: the same day, the same cans and revisions
  await page.evaluate(() => window.__world.plot.say(2))
  await page.evaluate(() => window.__world.plot.say(3))
  for (const c of ['wait', 'wait', 'wait', 'wait', 'wait', 'pour']) await dawn(page, c)
  const before = await run(page)
  await page.waitForTimeout(1500)
  const saved = await page.evaluate(() => localStorage.getItem('ploobia.world.v2'))
  check('the plot is worth a save', saved !== null)
  await page.reload({ waitUntil: 'load' })
  await page.waitForFunction(() => !!window.__world, null, { timeout: 60000 })
  await page.waitForTimeout(800)
  check('after a reload the welcome offers Continue and says the day', await page.getByTestId('play').textContent().then((t) => /Continue/.test(t)) && (await page.getByTestId('welcome-line').textContent().then((t) => /Day 7 of 14/.test(t))))
  await resilientClick(page.getByTestId('play'), { label: 'Continue' })
  await waitFor(page, () => window.__world.get().phase === 'play')
  const after = await run(page)
  check('reload resumes at the same day with the same cans and revisions', after.day === before.day && after.days.length === before.days.length && after.said.join() === '2,3' && after.attempt === 2 && Math.abs(after.b.theta - before.b.theta) < 1e-9, `${after.day} ${after.said.join()}`)
  check('the name and the attempts survive', (await plot(page)).name === 'Leafy 7' && (await plot(page)).attempts.length === 1)
  check('no console errors on the retry walk', errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

/* ------------------------------------------------------------------------ */
/* Investigator: numbers beside the words                                   */
/* ------------------------------------------------------------------------ */
{
  const { page, ctx } = await open({ width: 1280, height: 800 })
  await resilientClick(page.getByTestId('play'), { label: 'Play' })
  await waitFor(page, () => window.__world.get().phase === 'play')
  await page.evaluate(() => window.__world.setBand('scientist'))
  await page.evaluate(() => window.__world.set((s) => ({ plot: { ...s.plot, met: true, stage: 'met' } })))
  await goto(page, -1.2, 3.4)
  await waitFor(page, () => window.__world.get().near === 'marker.plot', 8000)
  await page.keyboard.press('KeyE')
  await waitFor(page, () => !!document.querySelector('[data-testid=naming]'))
  await page.getByTestId('nickname').fill('Sci')
  await resilientClick(page.getByTestId('name-plant'), { label: 'Put the name up' })
  await waitFor(page, () => window.__world.get().plot.stage === 'first')
  await page.evaluate(() => window.__world.plot.probe())
  await waitFor(page, () => /θ/.test(document.querySelector('[data-testid=plot-word]')?.textContent ?? ''))
  const w = await page.getByTestId('plot-word').textContent()
  check('Investigator sees θ 0.42 and air 6 % beside SOAKED', /SOAKED/.test(w) && /θ 0\.4[12]/.test(w) && /air 6 %/.test(w), w)
  await ctx.close()
}

/* ------------------------------------------------------------------------ */
/* Phone sizes: the plate's one-line form, nothing over the stick            */
/* ------------------------------------------------------------------------ */
for (const [name, width, height] of [
  ['phone-844', 844, 390],
  ['phone-740', 740, 360],
]) {
  const { page, ctx, errors } = await open({ width, height }, { touch: true })
  await toTrial(page, { said: 2 })
  await waitFor(page, () => !!document.querySelector('[data-testid=plot-line]'))
  const line = await page.getByTestId('plot-line').textContent()
  check(`${name}: the plate collapses to one line`, /Dawn 1 of 14 · SOAKED · cans 0 of 2/.test(line), line)
  await page.getByTestId('plot-line').tap()
  await waitFor(page, () => !!document.querySelector('[data-testid=plot-sheet] [data-testid=plot-wait]'))
  check(`${name}: it opens on tap into the coach's slot, with the controls`, (await page.getByTestId('plot-sheet').count()) === 1 && (await page.getByTestId('plot-wait').count()) === 1 && (await page.getByTestId('coach').count()) === 0)
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('.hud button, .hud [role=button]')]
      .filter((b) => b.offsetParent !== null && !b.disabled)
      .map((b) => ({ id: b.dataset.testid || b.getAttribute('aria-label') || b.textContent.trim().slice(0, 12), r: b.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.width < 36 || r.height < 36))
      .map((x) => `${x.id} ${Math.round(x.r.width)}×${Math.round(x.r.height)}`),
  )
  check(`${name}: every plate control is at least 36 px`, small.length === 0, small.join(', '))
  const clear = await page.evaluate(() => {
    const st = document.querySelector('[data-testid="stick"]')?.getBoundingClientRect()
    if (!st) return null
    const hits = []
    const stick = document.querySelector('[data-testid="stick"]')
    for (const id of ['coach', 'interact', 'toolbelt', 'quest-plate', 'plot-brief', 'plot-sheet']) {
      const el = document.querySelector(`[data-testid="${id}"]`)
      if (!el || el.contains(stick)) continue
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.left < st.right && r.right > st.left && r.top < st.bottom && r.bottom > st.top) hits.push(id)
    }
    return hits
  })
  check(`${name}: nothing covers the stick`, clear !== null && clear.length === 0, JSON.stringify(clear))
  await page.screenshot({ path: path.join(SHOTS, `landing-${name}.png`) })
  check(`${name}: no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '))
  await ctx.close()
}

{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
  const page = await ctx.newPage()
  await page.goto(`${BASE}?q=low#/world`, { waitUntil: 'load' })
  await page.waitForTimeout(1500)
  check('portrait: the turn card shows, no canvas', (await page.getByTestId('turn-card').count()) === 1 && (await page.locator('canvas').count()) === 0)
  await ctx.close()
}

await browser.close()
process.exit(tally())
