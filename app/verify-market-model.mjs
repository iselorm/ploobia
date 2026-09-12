/**
 * The Numberworks' rules, tested out of band.
 *
 * One day, one solve: the replay and the whole-day solve agree to the pesewa;
 * the crowd comes from the seed; the till has a hump in price; level 1 is
 * reachable on every seed with a full basin and a fair price and never a dead
 * end after a thin catch; level 2's mark-up and discount move profit and
 * leftovers the way the round says; level 3's board is a geometric sequence
 * and its bound is half a scale step at Thursday's price; a link carries the
 * whole level and refuses a fiddled one; Ploob never prints the number being
 * guessed; one hand-in opens the next door. Pure claims, proved in Node
 * against the bundled model the way the Foundry's are.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const TMP = os.tmpdir()
const OUT = path.join(TMP, 'market-bundle-suite.mjs')
fs.writeFileSync(
  path.join(TMP, 'market-barrel.ts'),
  `export * from '${path.resolve('src/lib/market').replace(/\\/g, '/')}'
export * from '${path.resolve('src/lib/numberworkscampaign').replace(/\\/g, '/')}'
export * from '${path.resolve('src/lib/challenge').replace(/\\/g, '/')}'
`,
)
execSync(`npx esbuild "${path.join(TMP, 'market-barrel.ts')}" --bundle --format=esm --outfile="${OUT}" --alias:@=${path.resolve('src')}`, { stdio: 'pipe' })
const M = await import(`file://${OUT.replace(/\\/g, '/')}`)

let fails = 0
let passes = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)
  if (ok) passes += 1
  else fails += 1
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps

/* ---- doors and levels ---- */
check('six doors, one of them built', M.DOORS.length === 6 && M.DOORS.filter((d) => d.built).length === 1 && M.DOORS[0].built)
check('three levels behind door 1, tiers 1..3', M.LEVELS.filter((l) => l.door === 1).map((l) => l.tier).join() === '1,2,3')
for (const l of M.LEVELS) {
  check(`level ${l.id}: title is seven words or fewer`, l.title.split(/\s+/).length <= 7, l.title)
  check(`level ${l.id}: guess is a number inside its own dial`, l.guess.answer >= l.guess.min && l.guess.answer <= l.guess.max)
  const shown = l.guess.step < 1 ? l.guess.answer.toFixed(2) : String(l.guess.answer)
  const printed = (s) => s.includes(shown) || new RegExp(`\\b${l.guess.answer}\\b`).test(s)
  check(`level ${l.id}: the brief never prints the number being guessed`, !printed(l.blurb) && !printed(l.title) && !printed(l.guess.question))
  // Review 1: Ploob repeats the LEARNER's number back; the open line never answers.
  const WORDS = { 50: 'Fifty', 3: 'Three' }
  check(`level ${l.id}: the open line never answers the brief`, !printed(l.open) && !(WORDS[l.guess.answer] && l.open.includes(WORDS[l.guess.answer])))
  check(`level ${l.id}: prices are in cedis on the board`, /₵/.test(l.blurb + l.guess.question + l.open) || l.kind === 'harmattan')
}
check('explorer opens on fill-the-till, scientist on wholesale-ratio, analyst on harmattan-price',
  M.levelForBand('explorer').id === 'fill-the-till' && M.levelForBand('scientist').id === 'wholesale-ratio' && M.levelForBand('analyst').id === 'harmattan-price')
check('the venue is Kejetia, the currency the cedi', M.VENUE.name === 'Kejetia' && M.CURRENCY.symbol === '₵' && M.cedis(200) === '₵200')
check('the price source is dated and says the numbers are placeholders', /\d{4}-\d{2}-\d{2}/.test(M.PRICE_SOURCE.date) && /placeholder/.test(M.PRICE_SOURCE.note))

/* ---- the crowd and the day ---- */
const A = M.shoppersFor(12345)
const B = M.shoppersFor(12345)
const C = M.shoppersFor(54321)
check('the crowd comes from the seed and nothing else', JSON.stringify(A) === JSON.stringify(B) && JSON.stringify(A) !== JSON.stringify(C))
check('forty shoppers a day, sorted by when they arrive', A.length === M.SHOPPERS_PER_DAY && A.every((s, i) => i === 0 || s.at >= A[i - 1].at))
check('every limit sits between ₵3.20 and the ceiling; wants are 1..4', A.every((s) => s.limit >= 3.2 && s.limit <= M.PRICE_CEILING && s.want >= 1 && s.want <= 4))

const full = M.simulateDay(A, 60, { price: 4, discount: 0 })
check('a day: sold + unsold = stock, till = Σ paid', full.sold + full.unsold === 60 && near(full.till, full.sales.reduce((t, s) => t + s.paid, 0), 0.005))
check('above the ceiling nobody buys', M.simulateDay(A, 60, { price: 6, discount: 0 }).sold === 0)
check('at ₵1 the basin empties (or the crowd runs out)', (() => {
  const d = M.simulateDay(A, 60, { price: 1, discount: 0 })
  const wanted = A.reduce((t, s) => t + s.want, 0)
  return d.unsold === Math.max(0, 60 - wanted) || d.unsold === 0
})())
check('the till has a hump: ₵4 beats both ₵2 and ₵5.40 on this crowd', (() => {
  const t = (p) => M.simulateDay(A, 60, { price: p, discount: 0 }).till
  return t(4) > t(2) && t(4) > t(5.4)
})())

/* ---- replay agrees with the solve ---- */
{
  const run = M.startDay(A, 60, { price: 4, discount: 0 })
  for (let i = 0; i < 97; i++) M.stepDay(run, 0.0104)
  check('the replay ends done at t = 1', run.done && run.t === 1)
  check('the replay agrees with the whole-day solve to the pesewa', near(run.till, full.till, 0.005) && run.sold === full.sold && run.unsold === full.unsold && run.passed === full.passed)
  const early = M.closeDay(M.stepDay(M.startDay(A, 60, { price: 4, discount: 0 }), 0.5))
  check('closing early settles the day as it stands', early.done && early.till <= full.till && early.sold <= full.sold)
  const stepped = M.stepDay(M.startDay(A, 60, { price: 4, discount: 0 }), 0.3)
  const solved = M.simulateDay(A.filter((s) => s.at <= 0.3), 60, { price: 4, discount: 0 })
  check('a part-day replay is the solve over the shoppers who have arrived', near(stepped.till, solved.till, 0.005) && stepped.sold === solved.sold)
}

/* ---- the discount is a price schedule ---- */
{
  const sched = { price: 4, discount: 0.25 }
  check('the discount applies from four o\'clock and not before', M.priceAt(sched, M.dayFractionOfHour(15.9)) === 4 && M.priceAt(sched, M.dayFractionOfHour(16)) === 3)
  const withCut = M.simulateDay(A, 60, sched)
  const noCut = M.simulateDay(A, 60, { price: 4, discount: 0 })
  check('a four o\'clock cut sells at least as many', withCut.sold >= noCut.sold)
}

/* ---- level 1: fill the till ---- */
const fill = M.LEVEL_BY_ID['fill-the-till']
{
  let reachable = 0
  let dead = 0
  for (let seed = 1; seed <= 60; seed++) {
    const crowd = M.shoppersFor(seed)
    let best = 0
    for (let p = 3.2; p <= 5.5; p += 0.1) best = Math.max(best, M.simulateDay(crowd, 60, { price: Math.round(p * 10) / 10, discount: 0 }).till)
    if (best >= 200) reachable += 1
    const thin = M.topUp(12, fill)
    let bestThin = 0
    for (let p = 3.2; p <= 5.5; p += 0.1) bestThin = Math.max(bestThin, M.simulateDay(crowd, thin.stock, { price: Math.round(p * 10) / 10, discount: 0 }).till)
    if (bestThin < 200) dead += 1
  }
  check('level 1 is reachable with a full basin on every seed tried', reachable === 60, `${reachable} / 60`)
  check('a thin catch with no number is topped up a little past the sum (the free stall\'s rule)', M.topUp(12, fill).topped && M.topUp(12, fill).stock === 56 && !M.topUp(58, fill).topped)
  check('a thin catch is topped up to the number the learner SAID — capped at the basin', M.topUp(12, fill, 50).stock === 50 && M.topUp(12, fill, 50).topped && M.topUp(54, fill, 50).stock === 54 && !M.topUp(54, fill, 50).topped && M.topUp(3, fill, 90).stock === 60)
  check('after a top-up level 1 is still reachable on every seed', dead === 0, `${dead} dead seeds`)
  const s0 = M.startStall(fill, 60)
  let g = M.gaugeFor(fill, s0)
  check('level 1 gauge before a day: 0 of 1, "open the stall"', g.met === 0 && g.of === 1 && g.cells[0].todo === 'open the stall')
  const s1 = { ...s0, day: M.simulateDay(A, 60, { price: 4, discount: 0 }) }
  g = M.gaugeFor(fill, s1)
  check('level 1 gauge reads the till and says what is short in cedis', g.best === s1.day.till && (g.hit || /₵\d+ short/.test(g.cells[0].todo)))
  check('the aim is open, then price, then hand', M.aimFor(fill, s0, 'lab') === 'open' && (g.hit ? M.aimFor(fill, s1, 'lab') === 'hand' : M.aimFor(fill, s1, 'lab') === 'price') && M.aimFor(fill, s0, 'gather') === 'catch')
  check('a basin under fifty is named as the ceiling before the day', /ceiling/.test(M.ploobLine(fill, M.startStall(fill, 30), null)))
}

/* ---- level 2: the wholesale ratio ---- */
const ratio = M.LEVEL_BY_ID['wholesale-ratio']
{
  check('cost per tomato is the basin shared sixty ways', near(M.costPerTomato(), 3) && near(M.kiloPrice(3), 24))
  const s0 = M.startStall(ratio, 60)
  check('level 2 starts at 30 % mark-up, no discount, board by mark-up', s0.markup === 0.3 && s0.discount === 0 && near(M.scheduleOf(ratio, s0).price, 3.9))
  const day = (markup, discount) => M.simulateDay(A, 60, M.scheduleOf(ratio, { ...s0, markup, discount }))
  const p = (d) => M.profitOf(d.till, M.WHOLESALE.price)
  check('profit is (till − cost) ÷ cost', near(M.profitOf(225, 180), 0.25))
  check('no mark-up cannot make a profit', p(day(0, 0)) <= 0)
  check('a higher mark-up raises the price per kilo and, past the ceiling, leaves more in the basin', day(0.8, 0).unsold > day(0.2, 0).unsold)
  check('a four o\'clock discount leaves fewer in the basin than none at the same mark-up', day(0.6, 0.4).unsold <= day(0.6, 0).unsold)
  let feasible = 0
  for (let seed = 1; seed <= 40; seed++) {
    const crowd = M.shoppersFor(seed)
    let ok = false
    for (let mu = 0.25; mu <= 0.8 && !ok; mu += 0.05) {
      for (let dc = 0; dc <= 0.5 && !ok; dc += 0.05) {
        const d = M.simulateDay(crowd, 60, M.scheduleOf(ratio, { ...s0, markup: mu, discount: dc }))
        if (M.profitOf(d.till, M.WHOLESALE.price) >= 0.25 && d.unsold <= M.FEW_LEFT) ok = true
      }
    }
    if (ok) feasible += 1
  }
  check('level 2 (25 % up, ≤ 5 left) is reachable on every seed tried', feasible === 40, `${feasible} / 40`)
  const g = M.gaugeFor(ratio, { ...s0, day: day(0.3, 0) })
  check('level 2 gauge has two cells: profit and left', g.of === 2 && g.cells.map((c) => c.id).join() === 'profit,left')
}

/* ---- level 3: the Harmattan price ---- */
const harm = M.LEVEL_BY_ID['harmattan-price']
{
  const board = M.harmattanBoard()
  check('four mornings on the board, each 1.15 × the one before', board.length === 4 && board.every((v, i) => i === 0 || near(v / board[i - 1], 1.15, 0.002)))
  check('Friday is Monday × 1.15⁴', near(M.harmattanFriday(), 24 * 1.15 ** 4, 0.01))
  check('a straight line from four points undershoots Friday', (() => {
    const slope = (board[3] - board[0]) / 3
    return board[3] + slope < M.harmattanFriday() - 0.5
  })())
  check('the bound is half a scale step at Thursday\'s price', near(M.harmattanBound(), board[3] * 0.025, 0.01))
  const s0 = M.startStall(harm, 60)
  let g = M.gaugeFor(harm, s0)
  check('level 3 gauge: nothing set → carry the ratio', g.of === 2 && !g.hit && /carry/.test(g.cells[0].todo) && /bounds/.test(g.cells[1].todo))
  const straight = board[3] + (board[3] - board[0]) / 3
  g = M.gaugeFor(harm, { ...s0, prediction: straight })
  check('a straight-line Friday is told to multiply', !g.cells[0].met && /multiply/.test(g.cells[0].todo), `${straight.toFixed(2)} vs ${M.harmattanFriday().toFixed(2)}`)
  check('and Ploob says the same once the bounds are stated (bounds come first)', /bounds/.test(M.ploobLine(harm, { ...s0, prediction: straight }, null)) && /multipl/.test(M.ploobLine(harm, { ...s0, prediction: straight, bound: 0.9 }, null)))
  g = M.gaugeFor(harm, { ...s0, prediction: M.harmattanFriday() + 0.3, bound: M.harmattanBound() + 0.05 })
  check('within fifty pesewas and a fair bound → hit', g.hit && g.met === 2)
  check('the aim runs predict → bound → hand', M.aimFor(harm, s0, 'lab') === 'predict' && M.aimFor(harm, { ...s0, prediction: 40 }, 'lab') === 'bound' && M.aimFor(harm, { ...s0, prediction: M.harmattanFriday(), bound: M.harmattanBound() }, 'lab') === 'hand')
  check('Ploob never prints Friday\'s price before it is met', !M.ploobLine(harm, s0, null).includes(M.harmattanFriday().toFixed(2)) && !M.ploobLine(harm, { ...s0, prediction: 40 }, null).includes(M.harmattanFriday().toFixed(2)))
  const close = M.gaugeFor(harm, { ...s0, prediction: M.harmattanFriday() - 0.8, bound: M.harmattanBound() })
  check('the gauge never prints the size of the miss — direction only', !/₵/.test(close.cells[0].todo) && /low/.test(close.cells[0].todo) && !/₵0\.8/.test(M.ploobLine(harm, { ...s0, prediction: M.harmattanFriday() - 0.8, bound: M.harmattanBound() }, null)))
  check('a bound a quarter-cedi off is not a bound', !M.gaugeFor(harm, { ...s0, prediction: M.harmattanFriday(), bound: M.harmattanBound() + 0.25 }).cells[1].met)
}

/* ---- the challenge: link, budget, score ---- */
{
  const c = M.challengeFor(fill, 'explorer', 777)
  check('an explorer challenge gathers; a scientist one does not', c.gatherSeconds === 45 && M.challengeFor(fill, 'scientist', 777).gatherSeconds === 0)
  check('the cabinet is numberworks and the goal is the level\'s', c.cabinet === 'numberworks' && c.goal.metric === 'till' && c.goal.target === 200)
  const link = M.challengeLink('https://ploobia.com', '/numberworks', c)
  const back = M.decodeChallenge(link.split('?c=')[1])
  check('a link round-trips the challenge', back && back.seed === 777 && back.setup === c.setup && M.levelFromSetup(back.setup)?.id === 'fill-the-till')
  check('a fiddled setup is refused, never guessed', M.levelFromSetup('fill-the-till:20') === null && M.levelFromSetup('nonsense') === null)
  const s = { ...M.startStall(fill, 60), day: M.simulateDay(M.shoppersFor(777), 60, { price: 4, discount: 0 }) }
  const { attempt, score } = M.attemptFor(fill, c, s, 1, 60)
  check('a hand-in reads the gauge: hit iff till ≥ 200', attempt.hit === (s.day.till >= 200) && attempt.best === s.day.till)
  check('score is out of 1000 with three terms', score.total >= 0 && score.total <= 1000 && score.accuracy >= 0 && score.economy >= 0 && score.thrift >= 0)
  check('unsold tomatoes are what thrift reads', M.spentOf(fill, s, 1).tomatoes === s.day.unsold)
  const ratioMiss = { ...M.startStall(ratio, 60), day: M.simulateDay(M.shoppersFor(777), 60, M.scheduleOf(ratio, { ...M.startStall(ratio, 60), markup: 0.8 })) }
  const r = M.attemptFor(ratio, M.challengeFor(ratio, 'scientist', 777), ratioMiss, 1, 60)
  check('level 2\'s condition (≤ 5 left) gates the hit', r.attempt.conditionMet === (ratioMiss.day.unsold <= M.FEW_LEFT) && (r.attempt.conditionMet || !r.attempt.hit))
  check('the same seed gives the same day on two machines', M.simulateDay(M.shoppersFor(777), 60, { price: 4.2, discount: 0 }).till === M.simulateDay(M.shoppersFor(777), 60, { price: 4.2, discount: 0 }).till)
  check('the rain comes from the seed', JSON.stringify(M.rain(9)) === JSON.stringify(M.rain(9)) && JSON.stringify(M.rain(9)) !== JSON.stringify(M.rain(10)) && M.rain(9).every((d) => d.at >= 0 && d.at <= 1))
}

/* ---- the card and the nickname ---- */
{
  const s = { ...M.startStall(fill, 60), day: M.simulateDay(A, 60, { price: 4, discount: 0 }) }
  const card = M.shareCardFor(fill, s, 'Ama', 2, 3)
  check('the card is a strategy: the price in the headline, stock · sold · left under it, a mathematical dare', /selling at ₵4\.00/.test(card.headline) && card.figure.startsWith('₵') && /stocked/.test(card.sub) && /₵4\.20/.test(card.dare))
  check('empty in → "Someone"', M.shareCardFor(fill, s, '', 1, 1).headline.startsWith('Someone'))
  check('a phone number cannot ride in on a nickname', M.sendableNickname('Ama 0244123456') === 'Ama')
  check('a nickname is capped', M.cleanNickname('a'.repeat(60)).length === M.NICKNAME_MAX)
}

/* ---- the doors ---- */
M.resetNumberworks()
check('door 1 open, door 2 undiscovered at the start', M.doorState(M.DOOR_BY_ID[1]) === 'open' && M.doorState(M.DOOR_BY_ID[2]) === 'undiscovered' && M.nextDoor().id === 1)
const opened = M.recordHandIn('fill-the-till', 800)
check('a hand-in records and reports whether the next door opened', M.isDoorHandedIn(1) && M.isDoorOpen(2) && opened === true)
check('door 1 reads done after a hand-in; best score kept', M.doorState(M.DOOR_BY_ID[1]) === 'done' && M.getNumberworksProgress().handedIn['fill-the-till'] === 800)
M.recordHandIn('fill-the-till', 500)
check('a worse hand-in never lowers the best', M.getNumberworksProgress().handedIn['fill-the-till'] === 800)
/* ---- round A.2: the number first, the crowd as a lever, the day reconstructed ---- */
{
  const s0 = M.startStall(fill, 60)
  check('a fresh stall has no number yet, on day 1', s0.guess === null && s0.tillGuess === null && s0.dayIndex === 1 && s0.lastHit === null)
  const q1 = M.dayQuestion(fill, s0, A)
  check('day 1 asks the count, at ₵4, board locked, and the answer is 200 ÷ 4', q1 && q1.kind === 'count' && q1.answer === 50 && q1.lockPrice === 4 && /How many tomatoes/.test(q1.question))
  check('the question never prints its answer', q1 && !/\b50\b/.test(q1.question))
  check('Ploob repeats the number back, whatever it is', /Forty/.test(M.repeatBack(q1, 40)) === false && /40\. Then let/.test(M.repeatBack(q1, 40)) && /50\. Then let/.test(M.repeatBack(q1, 50)))
  // day 1's crowd is guaranteed: fifty at ₵4 sells fifty, on every link seed tried
  let guaranteed = 0
  for (let seed = 1; seed <= 40; seed++) {
    const c = M.shoppersFor(M.crowdSeedFor(seed, fill, 1))
    const r = M.simulateDay(c, 50, { price: 4, discount: 0 })
    if (r.sold === 50 && r.till >= 200) guaranteed += 1
  }
  check('day 1\'s crowd proves a right first number on every seed (D5)', guaranteed === 40, `${guaranteed} / 40`)
  check('later days are the seed\'s own (not the same crowd)', M.crowdSeedFor(7, fill, 2) !== M.crowdSeedFor(7, fill, 1) && M.crowdSeedFor(7, fill, 2) === M.crowdSeedFor(7, fill, 2))
  // the day after a hit is the ₵4.50 experiment; after a miss, the count again
  const hitDay = { ...s0, guess: 50, day: M.simulateDay(A, 56, { price: 4, discount: 0 }), lastHit: true, dayIndex: 2, stock: 56 }
  const q2 = M.dayQuestion(fill, hitDay, A)
  check('day 2 after a hit asks the till at ₵4.50, board locked', q2 && q2.kind === 'till' && q2.lockPrice === 4.5 && /4\.50/.test(q2.question))
  const missDay = { ...s0, guess: 40, day: M.simulateDay(A, 40, { price: 4, discount: 0 }), lastHit: false, dayIndex: 2, stock: 40, price: 4 }
  const q2m = M.dayQuestion(fill, missDay, A)
  check('a day after a miss asks the count again — a guided retry, lever free', q2m && q2m.kind === 'count' && q2m.answer === 50 && q2m.lockPrice === null)
  const day3 = { ...hitDay, dayIndex: 3, price: 4.2 }
  const q3 = M.dayQuestion(fill, day3, A)
  check('day 3 is the learner\'s own price, and the till is typed before opening', q3 && q3.kind === 'till' && q3.lockPrice === null && /4\.20/.test(q3.question))
  // the lever: the alley thins as the price rises, a head-count
  const d3 = M.demandAt(A, 3)
  const d4 = M.demandAt(A, 4)
  const d5 = M.demandAt(A, 5)
  const d6 = M.demandAt(A, 5.6)
  check('the alley thins as the price rises: ₵3 > ₵4 > ₵5 > nobody above ₵5.50', d3.stop === 40 && d3.stop > d4.stop && d4.stop > d5.stop && d6.stop === 0 && d4.of === 40)
  // ₵4.50 is a near miss on most crowds; ₵4 with fifty hits on most; ₵5 fails
  let hit4 = 0
  let miss45 = 0
  let fail5 = 0
  for (let seed = 1; seed <= 60; seed++) {
    const c = M.shoppersFor(seed)
    if (M.simulateDay(c, 56, { price: 4, discount: 0 }).till >= 200) hit4 += 1
    if (M.simulateDay(c, 56, { price: 4.5, discount: 0 }).till < 200) miss45 += 1
    if (M.simulateDay(c, 56, { price: 5, discount: 0 }).till < 200) fail5 += 1
  }
  check('₵4 with 56 in the basin fills the till on at least nine crowds in ten', hit4 >= 54, `${hit4} / 60`)
  check('₵4.50 is a near miss on many crowds and a hit on others — the experiment teaches', miss45 >= 20 && miss45 <= 50, `${miss45} / 60`)
  check('₵5 fails on almost every crowd — what a child discovers on day 3', fail5 >= 57, `${fail5} / 60`)
  // the four o'clock event: the run pauses exactly at four; the drop is a discount from four; one solve still holds
  const run = M.startDay(A, 56, { price: 4, discount: 0 })
  M.stepDay(run, M.EVENT_T)
  check('the event is due at four when stock remains', M.eventDue(run, fill) === (run.unsold > 0))
  const dropped = M.eventDrop(run)
  check('the drop prices the rest at ₵3.50 from four', Math.abs(M.priceAt(dropped, M.EVENT_T + 0.01) - 3.5) < 0.006 && M.priceAt(dropped, M.EVENT_T - 0.01) === 4)
  run.schedule = dropped
  M.stepDay(run, 1)
  const whole = M.simulateDay(A, 56, dropped)
  check('a day that dropped at four is still one solve — replay = whole day', run.till === whole.till && run.sold === whole.sold)
  check('the run records who walked on, in order', run.passes.length === run.passed && run.passes.every((i, k) => k === 0 || i > run.passes[k - 1]))
  // the reconstruction: the product is the till, to the pesewa
  const s1 = { ...s0, guess: 50, stock: 56, price: 4, day: M.simulateDay(A, 56, { price: 4, discount: 0 }) }
  const rc = M.reconstructionOf(fill, s1)
  check('the reconstruction says the sum that was said and the sum the day made', rc.lines.length >= 2 && rc.lines[0].text === '50 × ₵4.00 = ₵200' && rc.lines[1].text === `${s1.day.sold} × ₵4.00 = ${M.cedis(s1.day.till)}`)
  check('the reconstruction\'s product is the till', s1.day.sold * 4 === s1.day.till)
  check('the reconstruction\'s grid is sold of stocked', rc.grid && rc.grid.lit === s1.day.sold && rc.grid.of === 56)
  check('a hit says "working strategy"; a miss says what is short, in cedis', /working strategy/.test(rc.headline) && /₵40 short/.test(M.reconstructionOf(fill, { ...s1, stock: 40, day: M.simulateDay(A, 40, { price: 4, discount: 0 }) }).headline))
  // one why-question, three options, one right, every option answered from the day
  const w = M.whyQuestion(fill, s1)
  check('one why-question with three options and exactly one right', w.options.length === 3 && w.options.filter((o) => o.right).length === 1)
  check('every option has a world-answer, never "wrong"', w.options.every((o) => o.answer.length > 10 && !/wrong/i.test(o.answer)))
  check('the right option is the sum', /50 tomatoes at ₵4\.00 each is ₵200/.test(w.options.find((o) => o.right).text))
  const wm = M.whyQuestion(fill, { ...s1, stock: 40, day: M.simulateDay(A, 40, { price: 4, discount: 0 }) })
  check('a miss asks why it fell short', /fall short/.test(wm.question) && wm.options.filter((o) => o.right).length === 1)
  // the stamp: four lines — prediction · action · observed · explanation
  const st = M.stampOf(fill, s1, w.options[0])
  check('the stamp is four lines: predicted · did · observed · explained', st.length === 4 && /^Predicted 50/.test(st[0]) && /^Stocked 56/.test(st[1]) && /sold/.test(st[2]) && /^Explained:/.test(st[3]))
  check('an unexplained stamp says so on its fourth line', /still to choose/.test(M.stampOf(fill, s1, null)[3]))
  // the count layer: rows of ten, the spare ghosted
  check('rows of ten: 56 with 50 needed is 6 rows, 50 lit, 6 spare', JSON.stringify(M.rowsOf(56, 50)) === JSON.stringify({ rows: 6, full: 50, spare: 6 }))
  check('rows of ten with no number: all lit', JSON.stringify(M.rowsOf(37, null)) === JSON.stringify({ rows: 4, full: 37, spare: 0 }))
  // levels 2 and 3 inherit the reconstruction and the question
  const rs0 = M.startStall(ratio, 60)
  const ratioHit = { ...rs0, markup: 0.3, discount: 0.2, day: M.simulateDay(A, 60, M.scheduleOf(ratio, { ...rs0, markup: 0.3, discount: 0.2 })) }
  const r2 = M.reconstructionOf(ratio, ratioHit)
  check('level 2 reconstructs profit as till − paid, then ÷ paid', /−/.test(r2.lines[0].text) && /÷ ₵180/.test(r2.lines[1].text))
  check('level 2\'s question is the discount', /discount/.test(M.whyQuestion(ratio, ratioHit).question))
  const r3 = M.reconstructionOf(harm, { ...M.startStall(harm, 60), prediction: M.harmattanFriday(), bound: M.harmattanBound() })
  check('level 3 reconstructs Friday as 24 × 1.15⁴', /24 × 1\.15⁴/.test(r3.lines[0].text) && r3.lines[0].text.includes(M.harmattanFriday().toFixed(2)))
  check('level 3\'s question is the straight line', /straight line/.test(M.whyQuestion(harm, M.startStall(harm, 60)).question))
}

M.resetNumberworks()
check('reset forgets the walk', !M.isDoorHandedIn(1))

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
