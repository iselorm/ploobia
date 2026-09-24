/**
 * The Roots model and the plot, tested out of band.
 *
 * Pins the Roots prototype's figures (numbers.json, 23 Sep 2026) on the trunk
 * copy, so a change to the physics must change these numbers on purpose; then
 * the rules the S0 storyboard (v4) rests on: rescue and care as two lines, the
 * first stand as an event, the memorisation check across the retry range, the
 * far bed's week, the failure path, closed water accounting, and the plot's
 * day loop driving the same model to the same figures. Pure claims, proved in
 * Node against the bundled model the way the Foundry's are.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const OUT = '/tmp/roots-bundle-suite.mjs'
fs.writeFileSync(
  '/tmp/roots-barrel.ts',
  `export * from '${path.resolve('src/lib/roots')}'
export * as plot from '${path.resolve('src/lib/plot')}'
`,
)
execSync(`npx esbuild /tmp/roots-barrel.ts --bundle --format=esm --outfile=${OUT} --alias:@=${path.resolve('src')}`, { stdio: 'pipe' })
const M = await import(OUT)
const P = M.plot

let fails = 0
let passes = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)
  if (ok) passes += 1
  else fails += 1
}
const r2 = (x) => Math.round(x * 100) / 100
const N = 14
const z = () => new Array(N).fill(0)
const plan = (...days) => {
  const c = z()
  for (const d of days) c[d - 1] = 1
  return c
}
const SOAKED = { airStart: 0.06, o2: 0.4 }
const OK = (r) => r.firmEnd >= 0.8 && r.minFirm >= 0.6 && r.health >= 0.95
const RESCUE = (r) => r.firmEnd >= 0.8
const CARE = (r) => r.minFirm >= 0.6

/* ---- the register ---- */
check('every constant carries a basis and a source', M.ROOTS_CONSTANTS.every((c) => (c.basis === 'measured' || c.basis === 'modelled') && c.source.length > 20))
check('the two owed sources say so', M.ROOTS_CONSTANTS.filter((c) => /owed/.test(c.source)).map((c) => c.id).sort().join() === 'eto,rot')
check('measured constants are Rawls, AHDB, UW, FAO-56 Kc and p', M.ROOTS_CONSTANTS.filter((c) => c.basis === 'measured').map((c) => c.id).join() === 'soils,airOk,o2Gone,kc,p')
check('a can is 10 mm and the edging is 40 mm', M.CAN === 10 && M.EDGING === 40)

/* ---- the seven baseline figures (numbers.json L1) ---- */
const nothing = M.runDays('clay', z(), SOAKED)
check('as found: leaves at 0.49 on the first noon', r2(nothing.daily[0].firm13) === 0.49, String(r2(nothing.daily[0].firm13)))
check('as found: air 6 %, O₂ 0.40, the probe says SOAKED', r2(nothing.daily[0].air) <= 0.07 && M.probeWord(M.newBed('clay', SOAKED)) === 'SOAKED')
check('do nothing: recovers by day 3', nothing.daily.findIndex((d) => d.firm13 >= 0.95) + 1 === 3)
check('do nothing: the dry droop begins on day 9', nothing.daily.findIndex((d, i) => i > 3 && d.firm13 < 0.8) + 1 === 9)
check('do nothing: ends at 0.20', r2(nothing.firmEnd) === 0.2, String(r2(nothing.firmEnd)))
const every = M.runDays('clay', new Array(N).fill(1), SOAKED)
check('a can every morning: roots below half by day 3', P.rootsBelowHalfOn(every) === 3)
check('a can every morning: plant at 0 by the end, 127 mm wasted', r2(every.firmEnd) === 0 && Math.round(every.wasted) === 127, `${r2(every.firmEnd)} / ${Math.round(every.wasted)}`)
const hab = []
for (let d = 0; d < N; d += 1) {
  const r = M.runDays('clay', [...hab, 0], SOAKED)
  hab.push(r.daily[d].firm13 < 0.8 ? 1 : 0)
}
const habit = [0, ...hab.slice(0, N - 1)]
const habitR = M.runDays('clay', habit, SOAKED)
check("the gardener's habit (water when it droops): 13 cans, roots below half by day 5, dead", habitR.cans === 13 && P.rootsBelowHalfOn(habitR) === 5 && r2(habitR.firmEnd) === 0)
let wins = 0
let fewest = 99
let earliest = 99
let rescues = 0
let careWins = 0
for (const c of M.binarySchedules(N)) {
  const r = M.runDays('clay', c, SOAKED)
  if (RESCUE(r)) rescues += 1
  if (RESCUE(r) && CARE(r)) {
    careWins += 1
    earliest = Math.min(earliest, c.indexOf(1) + 1)
  }
  if (OK(r)) {
    wins += 1
    fewest = Math.min(fewest, r.cans)
  }
}
check('676 winning schedules of 16,384 under the prototype OK rule', wins === 676, String(wins))
check('fewest cans that work: 2', fewest === 2)
check('under steady hands, no winning plan pours before day 3', earliest === 3, String(earliest))
check('more plans rescue than keep steady hands', rescues > careWins && careWins >= wins, `${rescues} / ${careWins} / ${wins}`)
const cf = M.runDays('clay', plan(4, 7), SOAKED)
check('the counterfactual, days 4 + 7: ends at 0.81, roots 1.00 — a win', r2(cf.firmEnd) === 0.81 && r2(cf.health) === 1 && OK(cf), `${r2(cf.firmEnd)} / ${r2(cf.health)}`)

/* ---- the fortnight as the storyboard tables it ---- */
const words = nothing.daily.map((d) => d.word.slice(0, 2)).join(' ')
check('wait throughout — the probe: SO SO SO DA DA DR ×9', words === 'SO SO SO DA DA DR DR DR DR DR DR DR DR DR', words)
const firms = nothing.daily.map((d) => Math.round(d.firm13 * 100)).join(' ')
check('wait throughout — firm: 49 79 100 ×5 89 72 57 45 35 26 20', firms === '49 79 100 100 100 100 100 89 72 57 45 35 26 20', firms)
const w69 = M.runDays('clay', plan(6, 9), SOAKED)
check('cans on 6 and 9: 1.0 through day 12, then .98, .82', w69.daily.slice(2, 12).every((d) => d.firm13 >= 0.995) && r2(w69.daily[12].firm13) === 0.98 && r2(w69.firmEnd) === 0.82)
const w58 = M.runDays('clay', plan(5, 8), SOAKED)
check('cans on 5 and 8 also win', RESCUE(w58) && CARE(w58) && r2(w58.firmEnd) === 0.82, String(r2(w58.firmEnd)))
const w5811 = M.runDays('clay', plan(5, 8, 11), SOAKED)
check('cans on 5, 8, 11: 1.0 to the end', w5811.daily.slice(2).every((d) => d.firm13 >= 0.995))
check('the probe reads DRY on day 6 with firm still 1.0', nothing.daily[5].word === 'DRY' && nothing.daily[5].firm13 >= 0.995)
check('the probe reads DAMP on days 4–5, before the leaves show anything', nothing.daily[3].word === 'DAMP' && nothing.daily[4].word === 'DAMP' && nothing.daily[4].firm13 >= 0.995)

/* ---- rescue and care, two lines ---- */
const late = M.runDays('clay', plan(1, 8, 11), SOAKED)
check('pour on 1, cans on 8 and 11: rescued (1.00) but not steady hands (min 0.19)', RESCUE(late) && !CARE(late) && r2(late.firmEnd) === 1 && r2(late.minFirm) === 0.19, `${r2(late.firmEnd)} / ${r2(late.minFirm)}`)
const abuse = M.runDays('clay', plan(13, 14), SOAKED)
check('let it droop, pour on 13 and 14: rescued (1.00) but steady hands fails at 0.34', RESCUE(abuse) && !CARE(abuse) && r2(abuse.firmEnd) === 1 && r2(abuse.minFirm) === 0.34, `${r2(abuse.firmEnd)} / ${r2(abuse.minFirm)}`)
let fiveCare = null
let fiveCount = 0
for (const c of M.binarySchedules(N)) {
  if (c.reduce((a, b) => a + b, 0) !== 5) continue
  const r = M.runDays('clay', c, SOAKED)
  if (RESCUE(r) && CARE(r)) {
    fiveCount += 1
    if (!fiveCare) fiveCare = c
  }
}
check('five cans can still save the plant with steady hands — a rescue is a rescue', fiveCount > 0 && !!fiveCare, `${fiveCount} plans, e.g. ${fiveCare?.map((x, i) => (x ? i + 1 : 0)).filter(Boolean).join('+')}`)
check('but a can every other day from day 4 re-drowns soaked clay', !RESCUE(M.runDays('clay', plan(4, 6, 8, 10, 12), SOAKED)))

/* ---- the failure path ---- */
const pour1 = M.runDays('clay', plan(1), SOAKED)
check('a pour on dawn 1: from 0.49 as found the noons read 0.33, then 0.20 — the strange result', r2(pour1.daily[0].firm13) === 0.33 && r2(pour1.daily[1].firm13) === 0.2 && pour1.daily[1].firm13 < nothing.daily[1].firm13, pour1.daily.slice(0, 3).map((d) => r2(d.firm13)).join(' '))
check('a pour on dawn 1: recovers by day 5', pour1.daily.findIndex((d) => d.firm13 >= 0.95) + 1 === 5, String(pour1.daily.findIndex((d) => d.firm13 >= 0.95) + 1))
const pour12 = M.runDays('clay', plan(1, 2), SOAKED)
check('pours on dawns 1 and 2: O₂ near 0.02, roots 0.85 → 0.35 → 0 by day 4', Math.min(...pour12.daily.map((d) => d.o2)) < 0.05 && r2(pour12.daily[1].health) === 0.85 && r2(pour12.daily[2].health) === 0.35 && pour12.daily[3].health === 0, pour12.daily.slice(0, 4).map((d) => r2(d.health)).join(' '))
const late10 = M.runDays('clay', plan(10), SOAKED)
check('pour only when it droops again (day 10): up that noon, 0.89 the next, 0.45 at the end', late10.daily[9].firm13 >= 0.95 && r2(late10.daily[10].firm13) === 0.89 && r2(late10.firmEnd) === 0.45, `${r2(late10.daily[9].firm13)} / ${r2(late10.daily[10].firm13)} / ${r2(late10.firmEnd)}`)

/* ---- the first stand is an event ---- */
const standDay = (r) => r.daily.findIndex((d) => d.firm13 >= 0.95) + 1
check('baseline: stands on day 3', standDay(nothing) === 3)
check('after a mistaken first pour: stands on day 5', standDay(pour1) === 5)
let standMax = 0
let standMin = 99
let firstNoonMax = 0
let allHaveCareWin = true
let dryEarliest = 99
let dryLatest = 0
const grid = []
for (const air of [0.05, 0.055, 0.06, 0.064, 0.067, 0.07]) for (const o2 of [0.35, 0.4, 0.45, 0.5]) grid.push({ airStart: air, o2 })
for (const st of grid) {
  const r = M.runDays('clay', z(), st)
  standMax = Math.max(standMax, standDay(r))
  standMin = Math.min(standMin, standDay(r))
  firstNoonMax = Math.max(firstNoonMax, r.daily[0].firm13)
  const dry = r.daily.findIndex((d) => d.word === 'DRY') + 1
  dryEarliest = Math.min(dryEarliest, dry)
  dryLatest = Math.max(dryLatest, dry)
  let care = false
  for (const c of M.binarySchedules(N)) {
    if (c.reduce((a, b) => a + b, 0) > 3) continue
    const rr = M.runDays('clay', c, st)
    if (RESCUE(rr) && CARE(rr)) {
      care = true
      break
    }
  }
  if (!care) allHaveCareWin = false
}
check('across the D1 range (air 0.05–0.07) the plant droops on the first noon (firm ≤ 0.72)', firstNoonMax <= 0.72, String(r2(firstNoonMax)))
check('at air 0.075 and above it would not droop (first noon 0.8+) — why the range stops at 0.07', M.runDays('clay', z(), { airStart: 0.075, o2: 0.4 }).daily[0].firm13 >= 0.8 && P.START_RANGE.air[1] === 0.07)
check('across the D1 range it stands by day 4 and not before day 2', standMax <= 4 && standMin >= 2, `${standMin}–${standMax}`)
check('across the D1 range DRY arrives at the close of day 5 or 6', dryEarliest >= 5 && dryLatest <= 6, `${dryEarliest}–${dryLatest}`)
check('every point in the range has a steady-hands win in three cans or fewer', allHaveCareWin)

/* ---- the memorisation check ---- */
const calendars = [plan(4, 7), plan(5, 8), plan(6, 9), plan(7, 10), plan(6, 10)]
check('the five two-can calendars all rescue at air 0.06', calendars.every((c) => RESCUE(M.runDays('clay', c, SOAKED))))
let memorisedFails = true
for (const air of [0.07, 0.08]) for (const o2 of [0.35, 0.4, 0.45, 0.5]) for (const c of calendars) if (RESCUE(M.runDays('clay', c, { airStart: air, o2 }))) memorisedFails = false
check('the same five calendars all fail at air 0.07 and 0.08', memorisedFails)
const dry07 = M.runDays('clay', z(), { airStart: 0.07, o2: 0.4 }).daily.findIndex((d) => d.word === 'DRY') + 1
const dry08 = M.runDays('clay', z(), { airStart: 0.08, o2: 0.5 }).daily.findIndex((d) => d.word === 'DRY') + 1
check('at air 0.07–0.08 DRY arrives on day 4–5 instead of 6', dry07 >= 4 && dry07 <= 5 && dry08 >= 4 && dry08 <= 5, `${dry07} / ${dry08}`)
const hot = M.runDays('clay', plan(6, 9), SOAKED, {}, 1.25)
check('a hot fortnight (+25 %) defeats the two-can plan too', !RESCUE(hot), String(r2(hot.firmEnd)))

/* ---- the far bed ---- */
const st7 = M.asFound('clay', 7)
const bed7 = M.newBed('clay', st7)
const n7 = M.runDays('clay', new Array(7).fill(0), st7)
check('the far bed as found: firm 0.65 and DRY', r2(n7.daily[0].firm13) === 0.65 && M.probeWord(bed7) === 'DRY', `${r2(n7.daily[0].firm13)} / ${M.probeWord(bed7)}`)
const one7 = M.runDays('clay', [1, 0, 0, 0, 0, 0, 0], st7)
check('one can lifts it to 1.0 that noon and 0.97 the next, then it falls (0.80, 0.64…)', one7.daily[0].firm13 >= 0.995 && r2(one7.daily[1].firm13) === 0.97 && r2(one7.daily[2].firm13) === 0.8 && r2(one7.daily[3].firm13) === 0.64, one7.daily.map((d) => r2(d.firm13)).join(' '))
check('one can alone ends at 0.30', r2(one7.firmEnd) === 0.3, String(r2(one7.firmEnd)))
const three7 = M.runDays('clay', [1, 0, 1, 0, 1, 0, 0], st7)
const three7b = M.runDays('clay', [1, 1, 0, 0, 1, 0, 0], st7)
check('three cans on 1, 3, 5 hold it (never below 0.97); 1, 2, 5 hold it at 1.0', three7.daily.every((d) => d.firm13 >= 0.96) && three7b.daily.every((d) => d.firm13 >= 0.995) && RESCUE(three7) && CARE(three7), three7.daily.map((d) => r2(d.firm13)).join(' '))
let fewest7 = 99
for (const c of M.binarySchedules(7)) if (RESCUE(M.runDays('clay', c, st7))) fewest7 = Math.min(fewest7, c.reduce((a, b) => a + b, 0))
check('the far bed needs at least two cans in the week', fewest7 >= 2, String(fewest7))
const st8 = M.asFound('clay', 8)
const r8 = M.runDays('clay', [1, 1, 0, 0, 1, 0, 0], st8)
check('a day longer (asFound 8) is still rescuable in three cans: 1+2+5 ends at 0.94', RESCUE(r8) && r2(r8.firmEnd) === 0.94, String(r2(r8.firmEnd)))

/* ---- water accounting closes ---- */
const closes = (r, st) => {
  const stored0 = M.newBed('clay', st).theta * M.Z
  const lhs = r.arrived + stored0
  const rhs = r.stored + r.taken + r.drained + r.spilled
  return Math.abs(lhs - rhs) < 0.01
}
check('arrived + stored₀ = stored + taken + drained + spilled (nothing)', closes(nothing, SOAKED))
check('… and with a can every morning', closes(every, SOAKED))
check('… and on the far bed', closes(three7, st7))
const flood = M.runDays('clay', [8, 0, 0, 0, 0, 0, 0], SOAKED)
check('eight cans at once overflow the 40 mm edging and the spill is recorded', flood.spilled > 0 && closes(flood, SOAKED), `${r2(flood.spilled)} mm`)
check('a single can on a soaked bed never spills', every.spilled === 0)
check('wasted is drained plus spilled', Math.abs(every.wasted - (every.drained + every.spilled)) < 1e-9)

/* ---- the plot: the day loop drives the same model ---- */
const playRun = (run, choices, probeAll = true) => {
  const events = []
  while (run.phase === 'dawn' || run.phase === 'running') {
    if (run.phase === 'dawn') {
      if (probeAll) P.probe(run)
      const c = choices[run.day - 1] ?? 'wait'
      P.choose(run, c)
    }
    for (const e of P.advance(run, 0.5)) events.push(`${e}@${run.days.length}`)
    if (events.length > 2000) throw new Error('runaway')
  }
  return events
}
const waitRun = P.firstBed(1)
check('a fresh first bed: dawn 1, SOAKED, nothing said', waitRun.phase === 'dawn' && waitRun.day === 1 && waitRun.today.word === 'SOAKED' && P.saidNow(waitRun) == null)
check('the number is typed and every revision is kept', P.say(waitRun, 3) && P.say(waitRun, 2) && !P.say(waitRun, 2) && waitRun.said.join(',') === '3,2' && P.saidNow(waitRun) === 2)
check('a silly number is refused', !P.say(waitRun, -1) && !P.say(waitRun, NaN))
const waitEvents = playRun(waitRun, [])
check('wait throughout in the plot: the stand fires on day 3', waitEvents.includes('stand@2'), waitEvents.filter((e) => e.startsWith('stand')).join())
check('… fourteen days close and the run is done, not rescued', waitRun.phase === 'done' && waitRun.days.length === 14 && !P.rescued(waitRun))
check('… the plot reproduces runDays day for day', waitRun.days.map((d) => r2(d.firm13)).join() === nothing.daily.map((d) => r2(d.firm13)).join())
check('… the child first reads DRY on dawn 7 (a dawn reads the previous close: day 6)', waitRun.dryRead === 7 && waitRun.days[5].word === 'DAMP' && waitRun.days[6].word === 'DRY')
const rec0 = P.recordOf(waitRun)
check('… the record: not saved, 0 cans, you said 3 then 2', rec0.economy === 'not saved' && rec0.cans === 0 && rec0.said.join() === '3,2' && rec0.accuracy === 'off')

const winRun = P.firstBed(1)
P.say(winRun, 2)
playRun(winRun, ['wait', 'wait', 'wait', 'wait', 'wait', 'pour', 'wait', 'wait', 'pour'])
check('cans on 6 and 9 in the plot: rescued, steady hands, ends at 0.82', P.rescued(winRun) && P.steadyHands(winRun) && r2(winRun.days[13].firm13) === 0.82)
const rec = P.recordOf(winRun)
check('… the record: fewest (2 of 2), spot on, 2 cans', rec.fewest === 2 && rec.economy === 'fewest' && rec.accuracy === 'spot on' && rec.cans === 2)
check('… thrift: 20 mm arrived, none of it drained or spilled; the 2.4 mm the soaked bed drained by itself is inherited, not theirs', rec.thrift.drained < 0.5 && rec.thrift.spilled === 0 && Math.round(rec.thrift.arrived) === 20 && r2(rec.thrift.inherited) === 2.4, `${r2(rec.thrift.drained)} / ${r2(rec.thrift.inherited)} / ${r2(rec.thrift.arrived)}`)
check('… every pour was on a probed dawn and checked the next', P.pouredOnProbedDawns(winRun) && P.checkedAfterPouring(winRun))
const ms = P.methodSteps([winRun])
check('… the method card assembles all four steps from those dawns', ms.probe && ms.soakedWait && ms.dryCan && ms.checkAgain)

const fiveRun = P.firstBed(1)
playRun(fiveRun, fiveCare.map((x) => (x ? 'pour' : 'wait')))
check('five cans in the plot: rescued, economy says more than needed, never "not saved"', P.rescued(fiveRun) && P.recordOf(fiveRun).economy === 'more than needed' && P.recordOf(fiveRun).cans === 5)

const deadRun = P.firstBed(1)
const deadEvents = playRun(deadRun, ['pour', 'pour'])
check('pours on dawns 1 and 2 in the plot: dead on day 4, the retry is offered', deadRun.phase === 'dead' && deadRun.days.length === 4 && deadEvents.includes('dead@4'))
check('… no stand fired, nothing rescued', deadRun.stood == null && !P.rescued(deadRun))
const again = P.replay(deadRun)
check('Replay this fortnight keeps the bed and the seed, counts the attempt', again.seed === deadRun.seed && again.start === deadRun.start && again.attempt === 2 && again.day === 1)
const fresh = P.freshBed(deadRun)
check('A new bed draws a different start inside the range', fresh.start.airStart !== deadRun.start.airStart && fresh.start.airStart >= 0.05 && fresh.start.airStart <= 0.08 && fresh.start.o2 >= 0.35 && fresh.start.o2 <= 0.5, JSON.stringify(fresh.start))
check('the same seed gives the same bed', JSON.stringify(P.startFor(42)) === JSON.stringify(P.startFor(42)) && JSON.stringify(P.startFor(42)) !== JSON.stringify(P.startFor(43)))
const p1 = P.firstBed(1)
playRun(p1, ['pour'])
check('a pour on dawn 1 in the plot: stands on day 5, rescued by 8 + 11 would still be possible', p1.stood === 5)

const unprobed = P.firstBed(1)
P.choose(unprobed, 'wait')
P.advance(unprobed, 6)
P.choose(unprobed, 'wait')
P.advance(unprobed, 6)
check('two unprobed dawns: no nudge yet', !P.takeNudge(unprobed) && unprobed.unprobed === 2)
P.choose(unprobed, 'wait')
P.advance(unprobed, 6)
check('three unprobed dawns: Ploob asks to look first, once', P.takeNudge(unprobed) && !P.takeNudge(unprobed))
check('a probe resets the count', P.probe(unprobed) && P.choose(unprobed, 'wait') && unprobed.unprobed === 0)
check('probing twice in a dawn is one probe', (() => { const r = P.firstBed(1); return P.probe(r) && !P.probe(r) })())
check('a day takes six seconds of ticks', (() => { const r = P.firstBed(1); P.choose(r, 'wait'); let t = 0; while (r.phase === 'running' && t < 100) { P.advance(r, 1 / 60); t += 1 / 60 } return Math.abs(t - 6) < 0.05 })())

const second = P.secondBed(1)
check('the far bed opens DRY, a week long, on the far bed', second.today.word === 'DRY' && second.length === 7 && second.bed === 'second')
playRun(second, ['pour', 'wait', 'pour', 'wait', 'pour'])
check('three cans on 1, 3, 5 in the plot hold the far bed', P.rescued(second) && P.steadyHands(second) && second.days.every((d) => d.firm13 >= 0.96))
check('the far bed record: fewest is 2 or 3, said nothing → no accuracy', [2, 3].includes(P.recordOf(second).fewest) && P.recordOf(second).accuracy === null)
check("Nara runs the method when both beds were held and the far bed's pours were probed first", P.competence(winRun, second) === 'runs')
const secondBlind = P.secondBed(1)
playRun(secondBlind, ['pour', 'wait', 'pour', 'wait', 'pour'], false)
check('… and copies a routine when the far bed was poured unprobed', P.competence(winRun, secondBlind) === 'copies' && P.raiseCompetence('copies', true) === 'runs' && P.raiseCompetence('copies', false) === 'copies')
check('… and copies when the first bed was not rescued, whatever the second', P.competence(waitRun, second) === 'copies')

/* ---- the method itself, played by the book ---- */
// Probe every dawn; pour on DRY; otherwise wait. The dawn reads the previous close.
const byTheBook = (run) => {
  const cans = []
  while (run.phase === 'dawn' || run.phase === 'running') {
    if (run.phase === 'dawn') {
      P.probe(run)
      const c = run.today.word === 'DRY' ? 'pour' : 'wait'
      if (c === 'pour') cans.push(run.day)
      P.choose(run, c)
    }
    P.advance(run, 0.5)
  }
  return cans
}
const book = P.firstBed(1)
const bookCans = byTheBook(book)
check('the method on the baseline: cans on 7, 9, 12; rescued, steady hands, 1.0 from day 3 on', bookCans.join('+') === '7+9+12' && P.rescued(book) && P.steadyHands(book) && book.days.slice(2).every((d) => d.firm13 >= 0.995), bookCans.join('+'))
check('… three cans is one over the fewest, and the record says so', P.recordOf(book).economy === 'one over' && P.recordOf(book).fewest === 2)
let bookEverywhere = true
let bookCansMax = 0
for (const st of grid) {
  const r = P.firstBed(1, 1, st)
  const c = byTheBook(r)
  bookCansMax = Math.max(bookCansMax, c.length)
  if (!(P.rescued(r) && P.steadyHands(r))) bookEverywhere = false
}
check('the method rescues with steady hands at every point in the range, in four cans or fewer', bookEverywhere && bookCansMax <= 4, `up to ${bookCansMax} cans`)
const bookFar = P.secondBed(1)
const bookFarCans = byTheBook(bookFar)
check('the method on the far bed: probe, pour on DRY, check — holds it all week', P.rescued(bookFar) && P.steadyHands(bookFar) && bookFar.days.every((d) => d.firm13 >= 0.96), bookFarCans.join('+'))
check('… and it is what Nara learns: every pour on a probed dawn, checked the next', P.pouredOnProbedDawns(bookFar) && P.checkedAfterPouring(bookFar) && P.competence(book, bookFar) === 'runs')

/* ---- A new bed defeats the first fortnight's calendar ---- */
let calendarsFailInBand = true
for (const air of [0.064, 0.066, 0.068, 0.07]) for (const o2 of [0.35, 0.5]) for (const c of calendars) if (RESCUE(M.runDays('clay', c, { airStart: air, o2 }))) calendarsFailInBand = false
check('the early two-can calendars all fail across the drier band (air 0.064–0.070)', calendarsFailInBand)
const drawn = []
for (let seed = 1; seed <= 40; seed += 1) drawn.push(P.startFor(seed, P.BASELINE_START))
check('after the baseline, A new bed always draws from the drier band', drawn.every((d) => d.airStart >= 0.064 && d.airStart <= 0.07 && d.o2 >= 0.35 && d.o2 <= 0.5))
let apart = true
for (let seed = 1; seed <= 40; seed += 1) {
  const a = P.startFor(seed)
  const b = P.startFor(seed + 100, a)
  if (Math.abs(a.airStart - b.airStart) < 0.0059 || b.airStart < 0.05 || b.airStart > 0.07) apart = false
}
check('two beds in a row are never within 0.006 in air, and stay inside the range', apart)
const chain = P.freshBed(P.freshBed(P.firstBed(1)))
check('a fresh bed after a fresh bed is still a first bed in the range, attempt 3', chain.bed === 'first' && chain.attempt === 3 && chain.start.airStart >= 0.05 && chain.start.airStart <= 0.07)

/* ---- the counterfactual and the gate ---- */
const cfEvery = P.everyMorning(SOAKED)
check('the split card: every morning, 14 cans, roots below half by day 3, gone', cfEvery.cans === 14 && P.rootsBelowHalfOn(cfEvery) === 3 && cfEvery.firmEnd < 0.05)
check('the gate catches drown, air, oxygen, roots', ['It is drowning', 'Roots need air', 'no oxygen down there', 'the root hairs'].every((t) => P.explainsCause(t)))
check('the gate lets testimony through', ["I gave this one more this morning. It looks worse.", 'Wet, is it. I thought so — it never looks dry.', "You gave it nothing. And look.", "Dry already? It doesn't look thirsty.", 'Shall we look first?', 'You gave it water and it drooped more. Hm.'].every((t) => !P.explainsCause(t)))
check('the gate is not fooled by "airy" or "fair"', !P.explainsCause('a fair day, airy and bright'))

/* ---- action-dependent feedback and record accounting regressions ---- */
{
  const play = (run, choose) => {
    P.say(run, 3)
    const announcements = []
    while (run.phase === 'dawn') {
      P.probe(run)
      P.choose(run, choose(run))
      if (P.advance(run, 6).includes('stand')) announcements.push(P.recoveryLine(run))
    }
    return { run, announcements }
  }
  const first = play(P.firstBed(), (r) => r.today.word === 'DRY' ? 'pour' : 'wait')
  const far = play(P.secondBed(), (r) => r.today.word === 'DRY' ? 'pour' : 'wait')
  const mistaken = play(P.firstBed(), (r) => r.day === 1 ? 'pour' : 'wait')
  check('unwatered first recovery acknowledges no water', first.announcements[0].includes('gave it nothing'))
  check('watered far-bed recovery acknowledges watering', far.announcements[0].includes('gave this bed water') && !far.announcements[0].includes('nothing'))
  check('recovery after a mistaken pour does not claim no water', mistaken.announcements.length === 1 && !mistaken.announcements[0].includes('nothing'))
  check('recovery testimony never reveals the gated explanation', [...first.announcements, ...far.announcements, ...mistaken.announcements].every((line) => !P.explainsCause(line)))
  const m = P.methodSteps([first.run, far.run])
  check('complete demonstrated method gets a confident reply', P.methodReply(m).includes('I can do that'))
  check('incomplete method identifies the missing observation', P.methodReply({ ...m, checkAgain: false }).includes('checking again after watering') && !P.methodReply({ ...m, checkAgain: false }).includes('I can do that'))
  const t = P.thriftOf(first.run)
  const initial = M.storedOf(M.newBed('clay', first.run.start))
  const remaining = M.storedOf(first.run.b) + first.run.b.pond
  check('record separates initial water, additions, losses and remaining storage', Math.abs(initial + t.arrived - t.taken - first.run.b.drained - t.spilled - remaining) < 1e-8)
  check('negative storage change is not negative remaining water', t.stored < 0 && remaining > 0 && Math.abs(t.stored - (remaining - initial)) < 1e-8)
}

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
