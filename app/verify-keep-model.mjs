/**
 * S1 — The Handoff, tested out of band (storyboard v3.1, 25 Sep 2026).
 *
 * The starting beds come from S0's own day loop (lib/plot.ts: probe, choose,
 * advance), never from hand-made states. Pins: the time convention, the v2
 * fixture under the three guards, the copies pause, the reward rules and the
 * settle-once transition; then sweeps EVERY valid S0 ending of both beds and
 * requires that no rule loses roots on either bed and that the demonstrated
 * method never drops below the care line. `node verify-keep-model.mjs`.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const OUT = '/tmp/keep-bundle-suite.mjs'
fs.writeFileSync(
  '/tmp/keep-barrel.ts',
  `export * from '${path.resolve('src/lib/keep')}'
export * as roots from '${path.resolve('src/lib/roots')}'
export * as plot from '${path.resolve('src/lib/plot')}'
`,
)
execSync(`npx esbuild /tmp/keep-barrel.ts --bundle --format=esm --outfile=${OUT} --alias:@=${path.resolve('src')}`, { stdio: 'pipe' })
const K = await import(OUT)
const R = K.roots
const P = K.plot

let fails = 0
let passes = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)
  if (ok) passes += 1
  else fails += 1
}
const r2 = (x) => Math.round(x * 100) / 100
const r3 = (x) => Math.round(x * 1000) / 1000
const cansOf = (run) => run.marks.filter((m) => m.action === 'can').map((m) => `${m.day}${m.actor === 'crew' ? 'c' : ''}`).join(',')

/** Play an S0 run through the real day loop: probe every dawn, pour on `canDays`. */
function playS0(run, canDays) {
  const seen = new Set()
  while (run.phase === 'dawn') {
    P.probe(run)
    const word = run.today.word
    const pour = canDays.includes(run.day)
    seen.add(word) // every dawn is probed here, so every word read was acted on
    P.choose(run, pour ? 'pour' : 'wait')
    while (run.phase === 'running') P.advance(run, 6)
  }
  return { run, bed: run.b, seen: [...seen] }
}
const s0First = (cans, start = P.BASELINE_START) => playS0(P.newRun('first', start, P.FORTNIGHT, 1), cans)
const s0Far = (cans) => playS0(P.secondBed(1), cans)

/* --------------------------------------------------------------------------
 * 1. The S0 fixture, from S0's loop
 * ------------------------------------------------------------------------ */
const nara = s0First([7, 10])
const far = s0Far([1, 3, 5])
check('fixture: Nara\'s bed after cans on 7 and 10 → θ 0.314, DRY, standing', r3(nara.bed.theta) === 0.314 && R.probeWord(nara.bed) === 'DRY' && nara.run.phase === 'done', `θ ${r3(nara.bed.theta)} air ${r3(R.airOf(nara.bed))}`)
check('fixture: far bed after cans on 1, 3, 5 → θ 0.330, DRY, standing', r3(far.bed.theta) === 0.33 && R.probeWord(far.bed) === 'DRY' && far.run.phase === 'done', `θ ${r3(far.bed.theta)} air ${r3(R.airOf(far.bed))}`)

/* --------------------------------------------------------------------------
 * 2. The time convention
 * ------------------------------------------------------------------------ */
const w20 = K.rainOn(1, 20)
check('rain: 20 mm on night 1 falls in hours 20–23 of day 1', JSON.stringify(Object.keys(w20).map(Number)) === '[20,21,22,23]' && r2(K.weatherMm(w20)) === 20)
{
  const dry = K.runBed(far.bed, { target: 'far', mode: 'independent', rule: 'right' })
  const wet = K.runBed(far.bed, { target: 'far', mode: 'independent', rule: 'right' }, { weather: w20 })
  check('dawn 1 reads the bed as the child left it (DRY), before any rain', dry.marks[0].word === 'DRY' && wet.marks[0].word === 'DRY')
  const firstSoaked = wet.marks.find((m) => m.word === 'SOAKED')?.day
  check('dawn 2 is the first reading after the rain: wetter than without it', wet.marks[1].word !== 'DRY' && dry.marks[1].word === 'DRY', `${dry.marks[1].word} → ${wet.marks[1].word}`)
  check('the far bed first reads SOAKED at dawn 3 (clay takes the night to fill)', firstSoaked === 3, `dawn ${firstSoaked}`)
  check('without rain the far bed never reads SOAKED under the method', !dry.marks.some((m) => m.word === 'SOAKED'))
  // Same loop as S0: the keep's runner, fed S0's cans, lands on S0's own end state.
  const s0start = P.newRun('first', P.BASELINE_START, P.FORTNIGHT, 1).b
  const viaKeep = K.runBed(s0start, { target: 'nara', mode: 'independent', rule: 'right' }, { unguarded: true })
  const viaPlot = s0First(viaKeep.marks.filter((m) => m.action === 'can').map((m) => m.day))
  check('the keep\'s day loop reproduces S0\'s advance() to the millilitre', r3(viaKeep.endBed.theta) === r3(viaPlot.bed.theta) && r3(viaKeep.endBed.o2) === r3(viaPlot.bed.o2) && r3(viaKeep.endBed.health) === r3(viaPlot.bed.health), `θ ${r3(viaKeep.endBed.theta)} vs ${r3(viaPlot.bed.theta)}`)
}

/* --------------------------------------------------------------------------
 * 3. The fixture under v3.1
 * ------------------------------------------------------------------------ */
const pick = K.chooseWeather(nara.bed, far.bed, K.plans('daily', 'runs', far.seen).far)
check('Guard 3: the fixture keeps the full 20 mm on night 1 (checked with the harshest plan, daily)', pick.mm === 20 && pick.night === 1, `${pick.mm} mm night ${pick.night}`)
const W = pick.weather
const rows = {}
rows.nara = K.runBed(nara.bed, { target: 'nara', mode: 'independent', rule: 'right' }, { weather: W })
for (const rule of K.RULES) rows[rule] = K.runBed(far.bed, { target: 'far', mode: rule === 'right' ? 'independent' : 'trial', rule }, { weather: W })
rows.supervised = K.runBed(far.bed, { target: 'far', mode: 'supervised', rule: 'right' }, { weather: W })
console.log('\n  bed / rule        cans          low (day)   end   roots  stop')
for (const [k, r] of Object.entries(rows)) console.log(`  ${k.padEnd(16)}  ${cansOf(r).padEnd(12)}  ${r2(r.low13).toFixed(2)} (d${r.lowDay})  ${r2(r.end13).toFixed(2)}  ${r2(r.health).toFixed(2)}   ${r.stop ? `${r.stop.by} → crew d${r.stop.day}` : r.crewCalled ? `crew called d${r.crewCalled}` : '—'}`)
console.log('')
check('Nara\'s bed under the method: kept', K.kept(rows.nara), `low ${r2(rows.nara.low13)}`)
check('far bed, right: kept, no crew', K.kept(rows.right) && rows.right.crewCalled == null, `low ${r2(rows.right.low13)}`)
check('far bed, supervised: same water as right', cansOf(rows.supervised) === cansOf(rows.right) && K.kept(rows.supervised))
check('daily: Nara refuses the SOAKED pour on dawn 3 and the crew takes it', rows.daily.stop?.by === 'soaked-refusal' && rows.daily.stop.day === 3 && rows.daily.marks[2].intended === 'can' && rows.daily.marks[2].action === 'wait' && rows.daily.marks[2].event === 'soaked-refusal')
check('daily: the far bed keeps its roots', rows.daily.health >= K.KEEP.keptHealth, `roots ${r2(rows.daily.health)}`)
{
  const cf = K.runBed(far.bed, { target: 'far', mode: 'trial', rule: 'daily' }, { weather: W, unguarded: true })
  check('daily, unguarded (the counterfactual line): the roots die', K.dead(cf), `low ${r2(cf.low13)} roots ${r2(cf.health)}`)
}
check('leave: stopped by the noon bound, roots kept', rows.leave.stop?.by === 'noon-stop' && rows.leave.health >= K.KEEP.keptHealth, rows.leave.stop ? `crew d${rows.leave.stop.day}` : '')
check('droop: roots kept', rows.droop.health >= K.KEEP.keptHealth, `low ${r2(rows.droop.low13)} end ${r2(rows.droop.end13)}`)

/* --------------------------------------------------------------------------
 * 4. The copies pause
 * ------------------------------------------------------------------------ */
{
  const p = K.plans('right', 'copies', far.seen)
  const r = K.runBed(far.bed, p.far, { weather: W })
  check('copies: S0\'s far bed never showed SOAKED', !far.seen.includes('SOAKED'), `seen ${far.seen.join('/')}`)
  check('copies: Nara pauses at the first SOAKED dawn on the far bed (dawn 3)', r.pause === 3 && r.marks[2].event === 'pause' && r.marks[2].word === 'SOAKED', `pause d${r.pause}`)
  check('copies: the pause changes no water', cansOf(r) === cansOf(rows.right))
  const pr = K.plans('right', 'runs', far.seen)
  check('runs: no pause', K.runBed(far.bed, pr.far, { weather: W }).pause == null)
}

/* --------------------------------------------------------------------------
 * 5. The keep: one story award, practice free, settle once
 * ------------------------------------------------------------------------ */
{
  let k = K.initialKeep(nara.bed, far.bed, far.seen)
  check('no dispatch before a confirmed handoff', K.beginDispatch(k, 'runs') === k)
  k = K.confirmChoice(k, 'right')
  k = K.beginDispatch(k, 'runs')
  check('story dispatch begun with the checked weather', k.dispatch.kind === 'story' && k.dispatch.weatherCheck.chosenMm === 20 && k.storyDispatchId === 1)
  const once = K.settleDispatch(k, 'runs')
  const twice = K.settleDispatch(once, 'runs')
  check('independent right: three packers, one lot of three crates', once.dispatch.packingCrew === 3 && K.totalCrates(once) === 3 && once.crates.length === 1)
  check('settling twice changes nothing', twice === once && once.campaignDay === 14)
  let k2 = K.readReport(once)
  check('begin refused until the next instruction is confirmed', K.beginDispatch(k2, 'runs') === k2)
  k2 = K.beginDispatch(K.confirmChoice(k2, 'right'), 'runs')
  check('the next dispatch is practice, dry by default', k2.dispatch.kind === 'practice' && K.weatherMm(k2.dispatch.weather) === 0)
  k2 = K.settleDispatch(k2, 'runs')
  check('practice adds no crates; the story lot stands', K.totalCrates(k2) === 3 && k2.dispatch.awardedLots.length === 0 && k2.campaignDay === 28)
  const trial = K.settleDispatch(K.beginDispatch(K.confirmChoice(K.initialKeep(nara.bed, far.bed, far.seen), 'daily'), 'runs'), 'runs')
  check('a trial story dispatch: one crate, far job blocked with its stop', K.totalCrates(trial) === 1 && trial.dispatch.jobs[1].state === 'blocked' && trial.dispatch.jobs[1].blockedBy === 'soaked-refusal' && trial.dispatch.report.counterfactual != null)
  const sup = K.settleDispatch(K.beginDispatch(K.confirmChoice(K.initialKeep(nara.bed, far.bed, far.seen), 'supervised'), 'copies'), 'copies')
  check('supervised: one crate, no pause, ability untouched by the model', K.totalCrates(sup) === 1 && sup.dispatch.report.pauseDay == null)
}

/* --------------------------------------------------------------------------
 * 6. Every valid S0 ending
 * ------------------------------------------------------------------------ */
// A valid ending: the run finished standing (noon ≥ RESCUE_FIRM at the last noon) with roots intact.
function endings(make, n) {
  const out = []
  for (let m = 0; m < 1 << n; m += 1) {
    const days = []
    for (let i = 0; i < n; i += 1) if ((m >> i) & 1) days.push(i + 1)
    const s = make(days)
    const last = s.run.days[s.run.days.length - 1]
    if (s.run.phase === 'done' && last.firm13 >= P.RESCUE_FIRM && s.bed.health > 0.99) out.push({ days, bed: s.bed, seen: s.seen })
  }
  return out
}
const t0 = Date.now()
const naraEnds = endings((d) => s0First(d), 14)
const farEnds = endings((d) => s0Far(d), 7)
console.log(`\n  valid S0 endings: Nara's bed ${naraEnds.length}, far bed ${farEnds.length} (${((Date.now() - t0) / 1000).toFixed(1)} s)`)

// Guard 3 is a pairwise choice, but each condition belongs to one bed: tabulate per bed, then intersect.
const ladder = []
for (const night of K.KEEP.rainNights) for (const mm of K.rainLadder()) ladder.push({ night, mm, w: K.rainOn(night, mm) })
const naraOK = naraEnds.map((e) => ladder.map((l) => K.methodKeeps(e.bed, l.w)))
const farOK = farEnds.map((e) => ladder.map((l) => K.methodKeeps(e.bed, l.w) && K.soakedDawn(e.bed, l.w)))
const planOK = (j, r, rule) => farRuns[j][r][rule].health >= K.KEEP.keptHealth
// Per far ending × ladder rung: every rule's run (cached).
const farRuns = farEnds.map((e) => ladder.map((l) => {
  const o = {}
  for (const rule of K.RULES) o[rule] = K.runBed(e.bed, { target: 'far', mode: rule === 'right' ? 'independent' : 'trial', rule }, { weather: l.w })
  return o
}))
const naraRuns = naraEnds.map((e, i) => new Map())
let pairs = 0
const unplaced = { right: 0, daily: 0, droop: 0, leave: 0 }
const lost = { nara: 0, right: 0, daily: 0, droop: 0, leave: 0 }
const below = { nara: 0, right: 0 }
const chosen = {}
const lowered = { right: 0, daily: 0, droop: 0, leave: 0 }
for (let i = 0; i < naraEnds.length; i += 1) {
  for (let j = 0; j < farEnds.length; j += 1) {
    pairs += 1
    // The weather is chosen per confirmed rule, as beginDispatch does.
    for (const rule of K.RULES) {
      let rung = -1
      for (let r = 0; r < ladder.length; r += 1) if (naraOK[i][r] && farOK[j][r] && planOK(j, r, rule)) { rung = r; break }
      if (rung < 0) { unplaced[rule] += 1; continue }
      if (rung > 0) lowered[rule] += 1
      if (rule === 'right') {
        const key = `${ladder[rung].mm} mm n${ladder[rung].night}`
        chosen[key] = (chosen[key] ?? 0) + 1
      }
      let nr = naraRuns[i].get(rung)
      if (!nr) { nr = K.runBed(naraEnds[i].bed, { target: 'nara', mode: 'independent', rule: 'right' }, { weather: ladder[rung].w }); naraRuns[i].set(rung, nr) }
      if (nr.health < K.KEEP.keptHealth) lost.nara += 1
      if (nr.low13 < K.KEEP.stopFirm) below.nara += 1
      const fr = farRuns[j][rung][rule]
      if (fr.health < K.KEEP.keptHealth) lost[rule] += 1
      if (rule === 'right' && fr.low13 < K.KEEP.stopFirm) below.right += 1
    }
  }
}
console.log(`  pairings ${pairs} × 4 rules in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
console.log(`  story weather under right: ${Object.entries(chosen).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ×${v}`).join(', ')}`)
console.log(`  pairings where the rain was lowered or moved: ${Object.entries(lowered).map(([k, v]) => `${k} ${v}`).join(' · ')}\n`)
check('Guard 3 finds a rain for every pairing and every rule', Object.values(unplaced).every((v) => v === 0), JSON.stringify(unplaced))
check("sweep: Nara's bed never loses roots", lost.nara === 0, `${lost.nara}`)
check("sweep: Nara's bed never below 0.6 at noon", below.nara === 0, `${below.nara}`)
check('sweep: far bed under right — roots kept, never below 0.6', lost.right === 0 && below.right === 0, `${lost.right} / ${below.right}`)
for (const rule of ['daily', 'droop', 'leave']) check(`sweep: far bed under a ${rule} trial keeps its roots`, lost[rule] === 0, `${lost[rule]} of ${pairs}`)

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
