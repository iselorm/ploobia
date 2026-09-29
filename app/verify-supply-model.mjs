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
const eSent = S.toFire(e)
check('…sent anyway at ten: charged full but flagged as a guess', eSent.phase === 'charged' && eSent.sentUnlevel && S.castOf(eSent.dry).fraction === 1)
e = S.inspect(e, S.GREY_LUMP.id)
check('…inspect the grey lump: it is recorded, and reads 7.9', e.inspected.includes(S.GREY_LUMP.id) && Math.round(S.densityOf(S.GREY_LUMP) * 10) / 10 === 7.9)
e = S.take(e, S.GREY_LUMP.id)
check('…take it out → back to matching at 900 cm³, the ingots kept', e.phase === 'matching' && S.benchLevel(e) === 2400 && e.dry === 10)
e = S.done(S.drop(e, tray[0].id))
check('…drop the sixth copper piece, done → level at ten again', e.phase === 'balancing' && S.benchLevel_(e) && S.benchGap(e) === 0)

/* 7 · availability ----------------------------------------------------------- */
check('the bench opens at copper heat or once poured', S.benchOpens({ temp: 1085, poured: false }) && S.benchOpens({ temp: 20, poured: true }) && !S.benchOpens({ temp: 900, poured: false }))

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
