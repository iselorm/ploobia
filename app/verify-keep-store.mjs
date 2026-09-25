/**
 * S1 — The Handoff: the store, the save and Nara's lines, tested out of band
 * (storyboard v3.1 §07, §10 round 2). No browser: the Zustand store, the save
 * snapshot/validate/restore path and the text functions run in Node against
 * the bundled sources, with S0's end state built through plot.ts's own loop.
 * `node verify-keep-store.mjs`.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const OUT = '/tmp/keep-store-suite.mjs'
fs.writeFileSync(
  '/tmp/keep-store-barrel.ts',
  `export * as A from '${path.resolve('src/lib/archipelago')}'
export * as S from '${path.resolve('src/lib/worldsave')}'
export * as K from '${path.resolve('src/lib/keep')}'
export * as N from '${path.resolve('src/lib/nara')}'
export * as P from '${path.resolve('src/lib/plot')}'
export { WORLD_TEXT } from '${path.resolve('src/lib/worldtext')}'
`,
)
execSync(`npx esbuild /tmp/keep-store-barrel.ts --bundle --format=esm --outfile=${OUT} --alias:@=${path.resolve('src')} --define:import.meta.env={}`, { stdio: 'pipe' })
const { A, S, K, N, P, WORLD_TEXT } = await import(OUT)

let fails = 0
let passes = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)
  if (ok) passes += 1
  else fails += 1
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const roundTrip = (x) => JSON.parse(JSON.stringify(x))

/** An S0 run through the real day loop: probe every dawn, pour on `cans`. */
function play(run, cans) {
  while (run.phase === 'dawn') {
    P.probe(run)
    P.choose(run, cans.includes(run.day) ? 'pour' : 'wait')
    while (run.phase === 'running') P.advance(run, 6)
  }
  return run
}

/** A world at the end of S0 (the v2 fixture: cans 7, 10 and 1, 3, 5), Sela's line heard. */
function endOfS0(competence) {
  A.resetWorld()
  const first = play(P.firstBed(1), [7, 10])
  const far = play(P.secondBed(1), [1, 3, 5])
  const plot = A.getWorld().plot
  A.setWorld({
    phase: 'play',
    zone: 'landing',
    plot: { ...plot, stage: 'done', met: true, first, run: far, rescuedFirst: true, rescuedSecond: true, taught: true, competence, recorded: true, pageRead: true, planted: true, sent: true },
  })
}

/** Save and load as a reload would: snapshot → JSON → validate → restore. */
function reload() {
  const snap = roundTrip(S.snapshot(A.getWorld(), null))
  const ok = S.validSave(snap)
  if (ok) S.restoreWorld(snap)
  A.setWorld({ phase: 'play' })
  return ok
}

/* --------------------------------------------------------------------------
 * 1. Opening the keep from S0
 * ------------------------------------------------------------------------ */
A.resetWorld()
check('no keep before S0 is done', !A.keepAvailable(A.getWorld()) && (A.openKeep(), A.getWorld().keep === null))
endOfS0('runs')
const s0First = roundTrip(A.getWorld().plot.first.b)
const s0Far = roundTrip(A.getWorld().plot.run.b)
check('after Sela\'s line the handoff is available', A.keepAvailable(A.getWorld()))
A.openKeep()
let k = A.getWorld().keep
check('Nara asks: keep opened, stage ask', k != null && A.keepStageOf(A.getWorld()) === 'ask')
check('beds copied from S0\'s own end state', same(k.beds.nara, s0First) && same(k.beds.far, s0Far))
check('far-bed words the child read in S0: DRY and DAMP, never SOAKED', !k.farSeen.includes('SOAKED') && k.farSeen.includes('DRY'), k.farSeen.join('/'))
A.openKeep()
check('opening twice changes nothing', A.getWorld().keep === k)

/* --------------------------------------------------------------------------
 * 2. The story dispatch — begin, away, reload, return once
 * ------------------------------------------------------------------------ */
A.beginKeep()
check('no dispatch before the say-back is confirmed', A.getWorld().keep.dispatch === null)
A.confirmKeep('right', { text: 'probe it first and only water when dry', verdict: 'right', shown: ['right'], confirmed: 'right' })
check('confirmed: stage ready, the handoff record kept', A.keepStageOf(A.getWorld()) === 'ready' && A.getWorld().keep.handoff.text.startsWith('probe it first'))
A.beginKeep()
k = A.getWorld().keep
check('story dispatch begun with the checked 20 mm, three packers', k.dispatch.kind === 'story' && k.dispatch.weatherCheck.chosenMm === 20 && k.dispatch.packingCrew === 3 && A.keepStageOf(A.getWorld()) === 'away')
A.confirmKeep('daily')
check('the instruction cannot change while a fortnight is out', A.getWorld().keep.choice === 'right')
check('describeSave while away', S.describeSave(A.getWorld()).startsWith('A fortnight is running'))
check('reload while away: valid, still away, same starting beds', reload() && A.keepStageOf(A.getWorld()) === 'away' && same(A.getWorld().keep.dispatch.startingBeds, k.dispatch.startingBeds))
A.crossPortal('foundry')
check('crossing to the Foundry settles nothing', A.keepStageOf(A.getWorld()) === 'away' && A.getWorld().keep.campaignDay === 0)
check('reload in the Foundry: still away', reload() && A.keepStageOf(A.getWorld()) === 'away')
A.crossPortal('landing')
k = A.getWorld().keep
check('the return settles fourteen days: report, 3 crates in one lot', A.keepStageOf(A.getWorld()) === 'report' && k.campaignDay === 14 && K.totalCrates(k) === 3 && k.crates.length === 1)
check('early return does not complete RELIGHT', A.getWorld().poured === false && A.getWorld().step === 'arrive')
check('S0\'s own record is untouched', same(A.getWorld().plot.first.b, s0First) && same(A.getWorld().plot.run.b, s0Far))
const report1 = roundTrip(k.dispatch.report)
A.crossPortal('foundry')
A.crossPortal('landing')
check('crossing again adds no days and no crates', A.getWorld().keep.campaignDay === 14 && K.totalCrates(A.getWorld().keep) === 3)
check('reload mid-review replays the stored report, unchanged', reload() && same(A.getWorld().keep.dispatch.report, report1) && A.keepStageOf(A.getWorld()) === 'report')
check('describeSave with a report waiting', S.describeSave(A.getWorld()).startsWith("Nara's report"))

/* --------------------------------------------------------------------------
 * 3. Read, reteach, practice
 * ------------------------------------------------------------------------ */
A.readKeep()
check('read: stage read, instruction must be given again', A.keepStageOf(A.getWorld()) === 'read' && A.getWorld().keep.confirmed === false)
A.beginKeep()
check('no dispatch until the next instruction is confirmed', A.getWorld().keep.dispatch.status === 'read')
check('reload after reading', reload() && A.keepStageOf(A.getWorld()) === 'read')
A.confirmKeep('daily')
A.beginKeep()
k = A.getWorld().keep
check('practice: computed at once, dry, straight to its report', k.dispatch.kind === 'practice' && k.dispatch.status === 'settled' && K.weatherMm(k.dispatch.weather) === 0)
check('practice adds no crates; the story lot stands', K.totalCrates(k) === 3 && k.dispatch.awardedLots.length === 0 && k.campaignDay === 28)
check('practice on daily is a trial: one packer shown as capacity, not stock', k.dispatch.packingCrew === 1 && k.dispatch.report.crates === 0)
check('a runs player trialling daily keeps runs', A.getWorld().plot.competence === 'runs')
check('Nara\'s bed always runs the method', k.dispatch.jobs[0].rule === 'right' && k.dispatch.jobs[0].mode === 'independent')
A.readKeep()
A.confirmKeep('right')
A.beginKeep({ rain: true })
check('practice with the story\'s rain goes through the same check', A.getWorld().keep.dispatch.kind === 'practice' && A.getWorld().keep.dispatch.weatherCheck.targetMm === 20 && K.totalCrates(A.getWorld().keep) === 3)
check('reload after reteaching: crates and days applied once', reload() && K.totalCrates(A.getWorld().keep) === 3 && A.getWorld().keep.campaignDay === 42)

/* --------------------------------------------------------------------------
 * 4. The copies pause and ability
 * ------------------------------------------------------------------------ */
endOfS0('copies')
A.openKeep()
A.confirmKeep('right')
A.beginKeep()
A.crossPortal('foundry')
A.crossPortal('landing')
let rep = A.getWorld().keep.dispatch.report
check('copies + right: independent, three crates, pause on dawn 3', rep.packingCrew === 3 && rep.crates === 3 && rep.pauseDay === 3)
check('Nara\'s pause line names the day and the word', N.naraReportLine(rep) === 'Day 3 the far bed read soaked. You never showed me soaked on that bed. I waited. Was that right — and why?', N.naraReportLine(rep))
A.answerKeepPause({ choice: 0, text: null, right: false })
check('a wrong answer leaves copies, and is kept', A.getWorld().plot.competence === 'copies' && A.getWorld().keep.dispatch.report.pauseAnswer.right === false)
A.answerKeepPause({ choice: 1, text: null, right: true })
check('the pause is answered once only', A.getWorld().plot.competence === 'copies')
endOfS0('copies')
A.openKeep()
A.confirmKeep('right')
A.beginKeep()
A.crossPortal('landing')
A.answerKeepPause({ choice: 1, text: 'the soil had no air so it could not drink', right: true })
check('a right answer raises copies to runs', A.getWorld().plot.competence === 'runs' && A.getWorld().keep.reports[0].pauseAnswer.right === true)
check('the raise survives a reload', reload() && A.getWorld().plot.competence === 'runs')
endOfS0('copies')
A.openKeep()
A.confirmKeep('supervised')
A.beginKeep()
A.crossPortal('landing')
rep = A.getWorld().keep.dispatch.report
check('copies + supervised: one crate, no pause, ability unchanged', rep.crates === 1 && rep.pauseDay == null && A.getWorld().plot.competence === 'copies')

/* --------------------------------------------------------------------------
 * 5. Old and malformed saves
 * ------------------------------------------------------------------------ */
endOfS0('runs')
{
  const snap = roundTrip(S.snapshot(A.getWorld(), null))
  delete snap.s.keep
  check('a v2 save from before S1 is valid and restores with no keep', S.validSave(snap) && (S.restoreWorld(snap), A.getWorld().keep === null))
}
endOfS0('runs')
A.openKeep()
A.confirmKeep('right')
A.beginKeep()
A.crossPortal('landing')
{
  const snap = roundTrip(S.snapshot(A.getWorld(), null))
  snap.s.keep.beds.far.theta = 'wet'
  snap.s.keep.storyDispatchId = 'one'
  check('a damaged keep does not cost the world', S.validSave(snap))
  S.restoreWorld(snap)
  const kk = A.getWorld().keep
  check('salvaged: crates kept, far bed from S0, the story award treated as given', K.totalCrates(kk) === 3 && same(kk.beds.far, s0Far) && kk.storyDispatchId === -1 && kk.dispatch === null)
  A.setWorld({ phase: 'play' })
  A.confirmKeep('right')
  A.beginKeep()
  check('after salvage the next dispatch is practice: no second story award', A.getWorld().keep.dispatch.kind === 'practice' && K.totalCrates(A.getWorld().keep) === 3)
}
{
  const sal = K.salvageKeep({ junk: true }, { nara: s0First, far: s0Far, farSeen: ['DRY'] })
  check('a keep with no trace of a dispatch salvages to a fresh one', sal.storyDispatchId === null && sal.nextDispatchId === 1 && sal.crates.length === 0)
}

/* --------------------------------------------------------------------------
 * 6. The handoff's judge, read conservatively
 * ------------------------------------------------------------------------ */
{
  const T = 0.55
  const all = ['right', 'daily', 'droop', 'leave', 'supervised']
  const I = (j) => K.interpretHandoff(j, T)
  check('no judge (offline, 503): all five choices', same(I(null).offer, all) && I(null).candidate === null)
  check('below TRUST: all five', same(I({ verdict: 'right', confidence: 0.5, misconception: null }).offer, all))
  check('right: the method\'s say-back only', same(I({ verdict: 'right', confidence: 0.9, misconception: null }).offer, ['right']))
  for (const key of ['daily', 'droop', 'leave']) check(`misconception ${key}: that rule's say-back`, I({ verdict: 'misconception', confidence: 0.9, misconception: key }).candidate === key)
  check('misconception with no usable key ("when it looks thirsty"): daily and droop side by side', same(I({ verdict: 'misconception', confidence: 0.9, misconception: null }).offer, ['daily', 'droop']))
  check('partial / off: all five', same(I({ verdict: 'partial', confidence: 0.95, misconception: null }).offer, all) && same(I({ verdict: 'off', confidence: 0.99, misconception: null }).offer, all))
  check('HANDOFF_WHY: one right option and the three rules as named wrong answers', A.HANDOFF_WHY.options.filter((o) => o.right).length === 1 && same(A.HANDOFF_WHY.options.filter((o) => !o.right).map((o) => o.key), ['daily', 'droop', 'leave']))
}

/* --------------------------------------------------------------------------
 * 7. The lines
 * ------------------------------------------------------------------------ */
{
  const choices = ['right', 'daily', 'droop', 'leave', 'supervised']
  check('a say-back and an Explorer label for every choice', choices.every((c) => N.SAY_BACK[c]?.endsWith('Yes?') && WORLD_TEXT.keep.choice[c]))
  const steps = { probe: true, soakedWait: true, dryCan: true, checkAgain: true }
  check('contradictions name the difference for each trial rule', ['daily', 'droop', 'leave'].every((c) => N.contradictionLine(c, steps)?.endsWith('Which should I try on the far bed?')) && N.contradictionLine('right', steps) === null)
  check('no contradiction where the child never showed that step', N.contradictionLine('daily', { ...steps, soakedWait: false }) === null)
  // Reports from the fixture, through the model directly.
  const nara = play(P.firstBed(1), [7, 10]).b
  const far = play(P.secondBed(1), [1, 3, 5]).b
  const lineFor = (choice, ability = 'runs') => {
    let kk = K.confirmChoice(K.initialKeep(nara, far, ['DRY', 'DAMP']), choice)
    kk = K.settleDispatch(K.beginDispatch(kk, ability), ability)
    return { nara: N.naraReportLine(kk.dispatch.report), sela: N.selaReturnLine(kk.dispatch.report), r: kk.dispatch.report }
  }
  const held = lineFor('right')
  check('independent: "After the rain…" because the marks show the wait', held.nara.startsWith('After the rain') && held.sela === N.SELA_RETURN.held, held.nara)
  const refused = lineFor('daily')
  check('daily: Nara names the day she refused', refused.nara === "Day 3 the probe said soaked. Your rule said pour. I stopped, and Sela's people have it now." && refused.sela === N.SELA_RETURN.stopped, refused.nara)
  check('daily: the counterfactual is on the report', refused.r.counterfactual != null && refused.r.counterfactual.health < 0.5)
  const left = lineFor('leave')
  check('leave: Nara names the noon that stopped it', left.nara.startsWith('I left it without water. Day 9 the leaves went too low'), left.nara)
  const droop = lineFor('droop')
  check('droop, no stop: the see-saw', droop.nara.startsWith('I waited for the leaves'), droop.nara)
  const sup = lineFor('supervised')
  check('supervised: teamwork', sup.sela === N.SELA_RETURN.supervised && sup.nara.includes("Sela's people stayed with me"))
  const everyLine = [held, refused, left, droop, sup].flatMap((x) => [x.nara, x.sela]).concat(Object.values(N.SAY_BACK), N.TRIAL_TERMS, Object.values(N.CONTRADICTION), Object.values(N.SELA_DISPATCH), Object.values(N.SELA_RETURN))
  check('no template left unfilled', everyLine.every((l) => !/[{}]|Day \?/.test(l)))
}

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
