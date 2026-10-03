/**
 * S2 — the cold bench and the balance, tested out of band (storyboard v3.1
 * §03 M3, §04, §06; the mock review of 28–29 Sep). Pins the worked batch
 * (1,000 cm³ · 8.96 g/cm³ · 8,960 g · +896 g), the jug's arithmetic, the
 * beam, the Engineer's grey lump (level never at whole ingots), the short
 * and full charges, and the bench's own transitions. `node verify-supply-model.mjs`.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const OUT = '/tmp/supply-bundle-suite.mjs'
fs.writeFileSync('/tmp/supply-barrel.ts', `export * from '${path.resolve('src/lib/supply')}'\n`)
execSync(`npx esbuild /tmp/supply-barrel.ts --bundle --format=esm --outfile=${OUT} --alias:@=${path.resolve('src')}`, { stdio: 'pipe' })
const S = await import(OUT)

let fails = 0
let passes = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)
  if (ok) passes += 1
  else fails += 1
}
const ids = (ps) => ps.map((p) => p.id)

/* 1 · the batch ----------------------------------------------------------- */
check('copper 8.96 g/cm³, iron 7.87, the pattern 1,000 cm³', S.RHO_CU === 8.96 && S.RHO_FE === 7.87 && S.PATTERN_CM3 === 1000)
check('an ingot is 100 cm³ of copper, 896 g; the runner is one ingot', S.INGOT_G === 896 && S.RUNNER_G === 896)
check('the mould needs 8,960 g of copper', S.needG() === 8960)
check('the mark stands at 2,500 (1,500 + the pattern)', S.markLevel() === 2500)

/* 2 · the tray ------------------------------------------------------------- */
const tray = S.trayFor('explorer')
const trayA = S.trayFor('analyst')
check('six copper pieces for Explorer and Scientist; they add to exactly the pattern', tray.length === 6 && tray.every((p) => p.metal === 'copper') && S.matchedCm3(tray) === 1000, `${S.matchedCm3(tray)} cm³`)
check('the Analyst tray adds one grey lump of 100 cm³, iron', trayA.length === 7 && trayA.filter((p) => p.metal === 'iron').length === 1 && S.GREY_LUMP.cm3 === 100)
check('any five copper pieces stop short of the mark', [0, 1, 2, 3, 4, 5].every((skip) => !S.reachedMark(tray.filter((_, i) => i !== skip))))
check('a piece knows its mass and density', S.massOf(S.GREY_LUMP) === 787 && S.densityOf(S.GREY_LUMP) === 7.87 && S.massOf(tray[0]) === 896)

/* 3 · the jug ---------------------------------------------------------------- */
check('empty jug reads 1,500; the pattern under reads 2,500', S.jugLevel([], false) === 1500 && S.jugLevel([], true) === 2500)
const five = tray.slice(1) // the pin and the four 200s: 900 cm³
check('five pieces in: 2,400, 100 to the mark', S.jugLevel(five, false) === 2400 && S.toMark(five) === 100)
check('six pieces in: at the mark', S.reachedMark(tray) && S.toMark(tray) === 0)
check('the wet set of six weighs 8,960 g and predicts 8,960 g', S.wetMass(tray) === 8960 && S.predictedMass(S.matchedCm3(tray)) === 8960)

/* 4 · the balance ------------------------------------------------------------ */
check('ten dry ingots level the six-piece set; nine is light, eleven heavy', S.isLevel(10, 8960) && !S.isLevel(9, 8960) && !S.isLevel(11, 8960) && S.beamTilt(9, 8960) < 0 && S.beamTilt(11, 8960) > 0 && S.beamTilt(10, 8960) === 0)
check('the nearest level count is ten', S.nearestLevel(8960) === 10)
// The Engineer's lump: five copper + the grey lump reach the mark, but weigh 8,851.
const greySet = [...tray.slice(1), S.GREY_LUMP] // 900 of copper + the lump
check('five copper + the grey lump reach the mark (1,000 cm³)', S.reachedMark(greySet) && S.matchedCm3(greySet) === 1000)
check('…but weigh 8,851 g, 109 g under the prediction', S.wetMass(greySet) === 8851 && S.predictedMass(1000) - S.wetMass(greySet) === 109)
check('…and the beam never sits level at whole ingots (10 heavy, 9 light)', !S.isLevel(10, 8851) && !S.isLevel(9, 8851) && S.beamTilt(10, 8851) > 0 && S.beamTilt(9, 8851) < 0)
check('the lump alone: 100 cm³, 787 g → 7.9 g/cm³', Math.round(S.densityOf(S.GREY_LUMP) * 10) / 10 === 7.9)

/* 5 · the charge and the cast --------------------------------------------- */
check('ten ingots + the runner = 9,856 g to the fire', S.chargeOf(10, true) === 9856)
const full = S.castOf(10)
check('ten ingots fill the mould; the runner comes back', full.fraction === 1 && !full.short && full.spareG === 896)
const short = S.castOf(9)
check('nine ingots cast short: 90 %, no pin seat missing yet', short.short && short.fraction === 0.9 && !short.pinSeatMissing)
const shorter = S.castOf(8)
check('eight ingots: 80 %, the last pin seat never fills', shorter.short && shorter.fraction === 0.8 && shorter.pinSeatMissing)
check('eleven ingots: full, 1,792 g spare', S.castOf(11).fraction === 1 && S.castOf(11).spareG === 1792)

/* 6 · the bench, as transitions ---------------------------------------------- */
let b = S.initialBench()
check('a bench starts idle, jug at 1,500, nothing in it', b.phase === 'idle' && S.benchLevel(b) === 1500 && b.inJug.length === 0)
b = S.sinkPattern(b)
check('sink the pattern → the water stands at 2,500', b.phase === 'pattern' && b.patternIn && S.benchLevel(b) === 2500)
check('you cannot drop scrap while the pattern is under', S.drop(b, tray[0].id) === b)
b = S.markRise(b)
check('mark the rise → the mark is set', b.phase === 'marked' && b.marked)
b = S.liftPattern(b)
check('lift it out → matching, the water back at 1,500, the mark still there', b.phase === 'matching' && !b.patternIn && S.benchLevel(b) === 1500 && b.marked)
for (const p of tray.slice(1)) b = S.drop(b, p.id)
check('five in → 2,400, 100 to the mark, not reached', S.benchLevel(b) === 2400 && S.benchToMark(b) === 100 && !S.benchReached(b))
const bShort = S.done(b)
check('done below the mark is allowed (the short-strap lesson): matched 900 cm³', bShort.phase === 'balancing' && bShort.matched === 900)
b = S.drop(b, tray[0].id)
check('six in → at the mark; dropping the same piece twice is a no-op', S.benchReached(b) && S.drop(b, tray[0].id) === b && b.inJug.length === 6)
b = S.take(b, tray[0].id)
b = S.drop(b, tray[0].id)
check('take one out and drop it back', b.inJug.length === 6 && S.benchReached(b))
b = S.done(b)
check('done → balancing with the wet set on the pan (8,960 g), no ingots yet', b.phase === 'balancing' && b.matched === 1000 && S.benchWetMass(b) === 8960 && b.dry === 0)
for (let i = 0; i < 9; i++) b = S.addIngot(b)
check('nine ingots: light, not level, no runner offered', b.dry === 9 && !S.benchLevel_(b) && !S.runnerOffered(b))
b = S.addIngot(b)
check('ten ingots: level, Sefu offers the runner', b.dry === 10 && S.benchLevel_(b) && S.runnerOffered(b))
b = S.addIngot(b)
b = S.takeIngot(b)
check('eleven then back to ten', b.dry === 10)
const fired = S.toFire(b)
check('to the fire → charged: 10 ingots + runner = 9,856 g, level, the wet set stays', fired.phase === 'charged' && fired.charge === 9856 && fired.runner && !fired.sentUnlevel && fired.inJug.length === 6)
check('nothing changes after charged', S.addIngot(fired) === fired && S.drop(fired, tray[0].id) === fired)

// The Engineer's path: five copper + the grey lump; inspect; remove; finish.
let e = S.liftPattern(S.markRise(S.sinkPattern(S.initialBench())))
for (const p of greySet) e = S.drop(e, p.id)
e = S.done(e)
check('Engineer: the grey set reaches the mark and goes to the balance at 8,851 g', e.phase === 'balancing' && S.benchWetMass(e) === 8851 && S.benchPredicted(e) === 8960)
for (let i = 0; i < 10; i++) e = S.addIngot(e)
check('…ten ingots: heavy, never level; the discrepancy reads 109 g under', !S.benchLevel_(e) && S.benchTilt(e) > 0 && S.benchGap(e) === -109)
// A dry-heavy pan is never sent (Selorm, 2 Oct): Sefu melts no more than was measured. A light one still goes.
check('…ten is heavy: the pan is refused, nothing is charged', S.tooHeavy(e) && S.toFire(e) === e)
const eSent = S.toFire(S.takeIngot(e))
check('…nine is light: sent anyway, flagged as a guess, and it will cast short', eSent.phase === 'charged' && eSent.sentUnlevel && eSent.dry === 9 && S.castOf(eSent.dry).short)
e = S.inspect(e, S.GREY_LUMP.id)
check('…inspect the grey lump: it is recorded, and reads 7.9', e.inspected.includes(S.GREY_LUMP.id) && Math.round(S.densityOf(S.GREY_LUMP) * 10) / 10 === 7.9)
e = S.take(e, S.GREY_LUMP.id)
check('…take it out → back to matching at 900 cm³, the ingots kept', e.phase === 'matching' && S.benchLevel(e) === 2400 && e.dry === 10)
e = S.done(S.drop(e, tray[0].id))
check('…drop the sixth copper piece, done → level at ten again', e.phase === 'balancing' && S.benchLevel_(e) && S.benchGap(e) === 0)

/* 7 · availability ----------------------------------------------------------- */
check('the bench opens at copper heat or once poured', S.benchOpens({ temp: 1085, poured: false }) && S.benchOpens({ temp: 20, poured: true }) && !S.benchOpens({ temp: 900, poured: false }))

/* 8 · the mould (round A2) ------------------------------------------------------
 * A pour is recorded; a short one sends the cold cast back to the dry pan and
 * the child back to the bench; a full one is the kit, once.
 */
/** A bench charged from `pieces` in the water and `dry` ingots on the pan. */
const charged = (pieces, dry) => {
  let x = S.liftPattern(S.markRise(S.sinkPattern(S.initialBench())))
  for (const p of pieces) x = S.drop(x, p.id)
  x = S.done(x)
  for (let i = 0; i < dry; i++) x = S.addIngot(x)
  return S.toFire(x)
}
const none = S.initialCast()
check('a cast record starts empty: no pours, the why unanswered', none.pours.length === 0 && none.why === -1 && none.whyText === null && !S.kitCast(none))
check('the mould is empty until a charge arrives', S.mouldStage(S.initialBench(), none) === 'empty' && S.mouldStage(null, null) === 'empty')
check('pouring with nothing charged changes nothing', S.pourCharge(S.initialBench(), none) === none)

// the right charge: six pieces, ten ingots
const okBench = charged(tray, 10)
check('a charged bench waits at the mould', S.mouldStage(okBench, none) === 'charged')
const okCast = S.pourCharge(okBench, none)
const okPour = S.lastPour(okCast)
check('ten ingots poured: one pour on the record, full, 9,856 g in', okCast.pours.length === 1 && okPour.fraction === 1 && !okPour.short && okPour.chargeG === 9856 && okPour.dry === 10 && !okPour.guess)
check('…the mould is full and the kit is cast', S.mouldStage(okBench, okCast) === 'full' && S.kitCast(okCast))
check('…1,000 of 1,000 cm³; nothing missing; the runner back in the tray', S.castCm3(okPour) === 1000 && S.missingG(okPour) === 0 && okPour.spareG === 896)
check('one kit: a second pour is refused', S.pourCharge(okBench, okCast) === okCast)
check('one kit: nothing goes back to the bench from a full mould', S.backToBench(okBench, okCast) === okBench)

// short at the water: five pieces (900 cm³), nine ingots level
const shortBench = charged(five, 9)
check('five pieces and nine ingots: level, charged as measured', shortBench.phase === 'charged' && !shortBench.sentUnlevel && shortBench.charge === 8960)
check('nothing goes back to the bench before the pour', S.backToBench(shortBench, none) === shortBench)
const shortCast = S.pourCharge(shortBench, none)
const shortPour = S.lastPour(shortCast)
check('…poured: short, 900 of 1,000 cm³, 896 g missing, the pin seat there', S.mouldStage(shortBench, shortCast) === 'short' && shortPour.short && S.castCm3(shortPour) === 900 && S.missingG(shortPour) === 896 && !shortPour.pinSeatMissing && !S.kitCast(shortCast))
check('…pouring again without going back changes nothing', S.pourCharge(shortBench, shortCast) === shortCast)
let again = S.backToBench(shortBench, shortCast)
check('back to the jug: matching again, the cold cast on the dry pan as nine ingots’ worth', again.phase === 'matching' && again.dry === 9 && again.castDry === 9 && again.recasts === 1 && !again.runner && again.charge === null && again.inJug.length === 5)
check('…the mould is empty again', S.mouldStage(again, shortCast) === 'empty')
again = S.done(S.drop(again, tray[0].id))
check('…the missing piece in: at the mark, on the balance, one ingot light', again.phase === 'balancing' && S.benchReached(again) && S.benchTilt(again) < 0)
check('…the cast is one piece: no ingot comes off below it', S.takeIngot(again) === again)
again = S.addIngot(again)
check('…one more ingot: level at ten', again.dry === 10 && S.benchLevel_(again))
check('…and that one can come off again', S.takeIngot(again).dry === 9)
again = S.toFire(again)
check('…to the fire: the whole charge again, 9,856 g', again.phase === 'charged' && again.charge === 9856 && S.mouldStage(again, shortCast) === 'charged')
const second = S.pourCharge(again, shortCast)
check('the second pour fills the mould: two pours on the record, the kit cast', second.pours.length === 2 && S.kitCast(second) && S.mouldStage(again, second) === 'full' && S.lastPour(second).dry === 10)

// short at the balance: the water was right, the ingots were the guess
const guessBench = charged(tray, 8)
check('six pieces but eight ingots sent anyway: a guess', guessBench.sentUnlevel && guessBench.charge === 8064)
const guessCast = S.pourCharge(guessBench, none)
check('…800 of 1,000 cm³, the last pin seat never filled, flagged as a guess', S.castCm3(S.lastPour(guessCast)) === 800 && S.lastPour(guessCast).pinSeatMissing && S.lastPour(guessCast).guess && S.missingG(S.lastPour(guessCast)) === 1792)
const guessBack = S.backToBench(guessBench, guessCast)
check('…back to the BALANCE (the water was at the mark), eight ingots’ worth kept', guessBack.phase === 'balancing' && guessBack.dry === 8 && guessBack.castDry === 8 && !guessBack.sentUnlevel)

// too much: twelve ingots sent anyway
const fat = charged(tray, 12)
check('twelve ingots against a ten-ingot set: the dry side is heavy, the pan stays on the balance', fat.phase === 'balancing' && S.tooHeavy(fat) && fat.charge === null && S.pourCharge(fat, none) === none)
check('…eleven is refused too; ten level is sent; nine light is sent', charged(tray, 11).phase === 'balancing' && charged(tray, 10).phase === 'charged' && charged(tray, 9).phase === 'charged')
check('a level or a light pan is never "too heavy"', !S.tooHeavy(S.takeIngot(S.takeIngot(fat))) && !S.tooHeavy(S.initialBench()))
// What a guess can still do: the Analyst's set over the mark (all six and the grey lump), ten ingots — light, sent, and full.
const over = charged([...tray, S.GREY_LUMP], 10)
const overCast = S.pourCharge(over, none)
check('the one guess that still fills the mould: a set over the mark, ten ingots light — full, and flagged', over.phase === 'charged' && over.sentUnlevel && S.kitCast(overCast) && S.lastPour(overCast).guess && S.lastPour(overCast).spareG === 896)

// the mass record: what went in is what came out, at every charge
check(
  'the mass record balances for every charge: in = cast + tray',
  Array.from({ length: 10 }, (_, i) => i + 1).every((n) => {
    const p = S.lastPour(S.pourCharge(charged(tray, n), none))
    return p.chargeG === n * 896 + 896 && S.castG(p) + p.spareG === p.chargeG
  }),
)
check('the pour needs copper heat, by the relight’s own tolerance (1,045)', S.hotEnough(1045) && S.hotEnough(1200) && !S.hotEnough(1044))
// the pour's beats: the run, the cooling, the mould opening — read off sim time
check('a pour runs 2.6 s, dulls for 3.4 s, opens in 0.8 s: 6.8 s in all', S.POUR_BEATS.run === 2.6 && S.POUR_BEATS.cool === 3.4 && S.POUR_BEATS.open === 0.8 && S.POUR_TOTAL === 6.8)
check('…the beat by elapsed time', S.pourBeat(0) === 'run' && S.pourBeat(2.59) === 'run' && S.pourBeat(2.6) === 'cool' && S.pourBeat(5.99) === 'cool' && S.pourBeat(6.0) === 'open' && S.pourBeat(6.79) === 'open' && S.pourBeat(6.8) === 'done' && S.pourBeat(60) === 'done')
check('the mould’s look: cold, waiting, the beats of the pour, then what it gave', S.mouldLook('empty', null) === 'cold' && S.mouldLook('charged', null) === 'waiting' && S.mouldLook('short', 1) === 'run' && S.mouldLook('full', 3) === 'cool' && S.mouldLook('short', 6.2) === 'open' && S.mouldLook('short', 7) === 'short' && S.mouldLook('full', 7) === 'full')
check('…a restored pour with no clock is already settled', S.mouldLook('short', null) === 'short' && S.mouldLook('full', null) === 'full')
check('a bench that has been opened stays open', S.benchOpens({ temp: 600, poured: false, opened: true }) && !S.benchOpens({ temp: 600, poured: false, opened: false }))

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
