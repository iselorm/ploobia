/**
 * S2 round A3 — the vice, tested out of band (storyboard v3.1 §03 M5, and the
 * design Selorm approved on 2 Oct: predict first, ingots as the weights, the
 * old samples in the vice too, the new copper strip cut from the runner).
 * Pins the four strips and what they give at, the hang / lift record, the
 * coarse record a big step leaves, the band's own finish, the prediction that
 * is compared and never scored, and the drawing's pick. `node verify-bend-model.mjs`.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const OUT = '/tmp/bend-bundle-suite.mjs'
fs.writeFileSync('/tmp/bend-barrel.ts', `export * from '${path.resolve('src/lib/bend')}'\nexport * as M from '${path.resolve('src/lib/supply')}'\n`)
execSync(`npx esbuild /tmp/bend-barrel.ts --bundle --format=esm --outfile=${OUT} --alias:@=${path.resolve('src')}`, { stdio: 'pipe' })
const B = await import(OUT)
const M = B.M

let fails = 0
let passes = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)
  if (ok) passes += 1
  else fails += 1
}
const spec = (id) => B.STRIPS.find((s) => s.id === id)
const times = (n, f, v) => {
  for (let i = 0; i < n; i++) v = f(v)
  return v
}
/** A record with one pour on it: a runner is in the tray. */
const poured = () => {
  let b = M.initialBench()
  b = M.sinkPattern(b)
  b = M.markRise(b)
  b = M.liftPattern(b)
  for (const p of M.SCRAP) b = M.drop(b, p.id)
  b = M.done(b)
  b = times(10, M.addIngot, b)
  b = M.toFire(b)
  return M.pourCharge(b, M.initialCast())
}
/** The vice with the copper strip cut and a guess made: ready for the first ingot. */
const ready = (guess = 'copper') => B.predict(B.cutStrip(B.initialBend(), poured()), guess)
/** One ingot more, then lift: the careful way. */
const step = (v, band = 'explorer') => B.lift(B.hang(v), band)

/* 1 · the four strips ------------------------------------------------------- */
check('four strips in the vice: new copper, old copper, new iron, rusted iron', B.STRIPS.map((s) => s.id).join() === 'copper,oldCopper,iron,rusted')
check('new copper gives at 3 ingots, old copper at 3, new iron at 8, rusted iron at 2', spec('copper').givesAt === 3 && spec('oldCopper').givesAt === 3 && spec('iron').givesAt === 8 && spec('rusted').givesAt === 2)
check('the three sound strips keep a bend; the rusted one cracks', ['copper', 'oldCopper', 'iron'].every((id) => spec(id).gives === 'bends') && spec('rusted').gives === 'cracks')
check('under the same load copper dips further than iron, and rusted iron furthest', spec('copper').flex > spec('iron').flex && spec('oldCopper').flex === spec('copper').flex && spec('rusted').flex > spec('copper').flex)
check('copper against iron: 1.6 to 1 (190 GPa over about 117)', spec('iron').flex === 1 && spec('copper').flex === 1.6)
check('the hanger holds eight ingots: enough to bend new iron', B.HANGER_MAX === 8 && B.HANGER_MAX >= spec('iron').givesAt)
check('the rusted strip is the first to give', B.firstToGive() === 'rusted')
check('the test strip is 10 cm³ of the runner: 90 g', B.TEST_STRIP_CM3 === 10 && B.TEST_STRIP_G === 90)

/* 2 · the strip comes off the runner ---------------------------------------- */
const v0 = B.initialBend()
check('a new vice: no copper strip cut, no guess, nothing hung', !v0.cut && v0.guess === null && v0.load === 0 && !v0.on && v0.sets === 1 && !v0.done && v0.pick === null && v0.why === -1)
check('nothing poured, no runner: the strip cannot be cut', !B.runnerInTray(M.initialCast()) && B.cutStrip(v0, M.initialCast()) === v0)
check('one pour puts a runner in the tray', B.runnerInTray(poured()))
const vCut = B.cutStrip(v0, poured())
check('…and the strip is cut from it, once', vCut.cut && B.cutStrip(vCut, poured()) === vCut)
check('the tray gives up the strip’s 90 g once it is cut, and not before', B.trayG(896, v0) === 896 && B.trayG(896, vCut) === 806)
check('no guess before the strip is cut', B.predict(v0, 'copper') === v0)
check('no ingot before the strip is cut', B.hang(v0) === v0)
check('stage: uncut, then predict', B.bendStage(v0) === 'uncut' && B.bendStage(vCut) === 'predict')

/* 3 · the guess, before the first weight ------------------------------------ */
check('no ingot before the guess', B.hang(vCut) === vCut)
const vG = B.predict(vCut, 'copper')
check('the guess is one of the four strips', vG.guess === 'copper' && B.bendStage(vG) === 'testing')
check('…or "not sure"', B.predict(vCut, 'unsure').guess === 'unsure')
check('…and nothing else', B.predict(vCut, 'brass') === vCut)
check('…and it is made once', B.predict(vG, 'iron') === vG)
check('before anything gives, the guess is not compared', B.guessRight(vG) === null)

/* 4 · hang and lift --------------------------------------------------------- */
const h1 = B.hang(vG)
check('an ingot on the hanger: one on every strip', h1.load === 1 && h1.on)
check('under one ingot every strip is flexed, none has given', B.STRIPS.every((s) => B.stripState(h1, s.id) === 'flexed'))
check('the dip is the load times the strip’s flex', B.dip(h1, 'iron') === 1 && B.dip(h1, 'copper') === 1.6 && B.dip(B.hang(h1), 'copper') === 3.2)
const l1 = B.lift(h1, 'explorer')
check('lifted at one: every strip came back', !l1.on && l1.load === 1 && B.STRIPS.every((s) => l1.readings[s.id].back === 1 && l1.readings[s.id].gaveAt === null && B.stripState(l1, s.id) === 'straight'))
check('a lifted strip does not dip', B.dip(l1, 'copper') === 0)
check('lifting with nothing hung changes nothing', B.lift(vG, 'explorer') === vG && B.lift(l1, 'explorer') === l1)
const h2 = B.hang(l1)
check('the next ingot goes on with the first: two', h2.load === 2 && h2.on)
check('at two the rusted strip is giving under the load; the others only flex', B.stripState(h2, 'rusted') === 'giving' && B.stripState(h2, 'copper') === 'flexed' && B.stripState(h2, 'iron') === 'flexed')
const l2 = B.lift(h2, 'explorer')
check('lifted at two: the rusted strip cracked at 2, and the record is exact', l2.readings.rusted.gaveAt === 2 && l2.readings.rusted.back === 1 && B.exact(l2.readings.rusted) && B.stripState(l2, 'rusted') === 'cracked')
check('…the other three came back from two', ['copper', 'oldCopper', 'iron'].every((id) => l2.readings[id].back === 2 && l2.readings[id].gaveAt === null))
check('…and the guess (new copper) is compared: it was not the first', B.guessRight(l2) === false)
check('a guess of the rusted strip is the first', B.guessRight(step(step(ready('rusted')))) === true)
check('"not sure" is never right or wrong', B.guessRight(step(step(ready('unsure')))) === null)
const l3 = step(l2)
check('lifted at three: both coppers stayed bent at 3, exact', ['copper', 'oldCopper'].every((id) => l3.readings[id].gaveAt === 3 && l3.readings[id].back === 2 && B.exact(l3.readings[id]) && B.stripState(l3, id) === 'bent'))
check('…new iron came back from three', l3.readings.iron.back === 3 && l3.readings.iron.gaveAt === null && B.stripState(l3, 'iron') === 'straight')
check('…and the cracked strip’s record does not move', l3.readings.rusted.gaveAt === 2 && l3.readings.rusted.back === 1)
check('a strip that has given stays as it is under a later load', B.stripState(B.hang(l3), 'copper') === 'bent' && B.stripState(B.hang(l3), 'rusted') === 'cracked' && B.stripState(B.hang(l3), 'iron') === 'flexed')
check('a bent strip’s dip no longer follows the load', B.dip(B.hang(l3), 'copper') === B.dip(l3, 'copper'))

/* 5 · the finish, by band --------------------------------------------------- */
check('Explorer is done at three: copper and the old samples gave, iron came back from copper’s load', l3.done && B.tested(l3, 'explorer') && B.bendStage(l3) === 'tested')
const s3 = step(step(step(ready(), 'scientist'), 'scientist'), 'scientist')
check('Scientist is not: new iron has not given yet', !s3.done && !B.tested(s3, 'scientist') && B.bendStage(s3, 'scientist') === 'testing')
const s8 = times(5, (v) => step(v, 'scientist'), s3)
check('…eight ingots, one at a time: new iron stayed bent at 8, exact', s8.readings.iron.gaveAt === 8 && s8.readings.iron.back === 7 && B.exact(s8.readings.iron))
check('…and the Scientist is done: four exact readings', s8.done && B.tested(s8, 'scientist') && B.tested(s8, 'analyst'))
check('the hanger takes no ninth ingot', B.hang(s8) === s8)
const jump = B.lift(B.hang(times(4, (v) => step(v, 'scientist'), s3)), 'scientist')
check('a shortcut is allowed: 7 lifted, then 8', jump.readings.iron.gaveAt === 8 && jump.readings.iron.back === 7 && jump.done)

/* 6 · a big step leaves a coarse record ------------------------------------- */
const c5 = B.lift(times(5, B.hang, ready()), 'explorer')
check('five at once: the coppers and the rusted strip gave, somewhere from 1 to 5', ['copper', 'oldCopper', 'rusted'].every((id) => c5.readings[id].gaveAt === 5 && c5.readings[id].back === 0 && !B.exact(c5.readings[id])))
check('…new iron came back from five', c5.readings.iron.back === 5 && c5.readings.iron.gaveAt === null)
check('…which is enough for an Explorer', c5.done)
const c5s = B.lift(times(5, B.hang, ready()), 'scientist')
check('…and not for a Scientist: the readings are not exact', !c5s.done && !B.tested(c5s, 'scientist'))
check('…with three bent and no way to an exact reading, the vice is stuck', B.bendStage(c5s, 'scientist') === 'stuck')
check('…the guess cannot be compared: three gave together', B.guessRight(c5) === null)
const c8 = B.lift(times(8, B.hang, ready()), 'explorer')
check('eight at once: all four gave, and nothing tells them apart', B.STRIPS.every((s) => c8.readings[s.id].gaveAt === 8) && !c8.done && B.bendStage(c8, 'explorer') === 'stuck')
const f = B.fresh(c5s)
check('fresh strips: a second set, straight, the hanger empty, the guess kept', f.sets === 2 && f.load === 0 && !f.on && f.guess === 'copper' && f.cut && B.STRIPS.every((s) => f.readings[s.id].back === 0 && f.readings[s.id].gaveAt === null) && B.bendStage(f, 'scientist') === 'testing')
check('no fresh strips before anything has given', B.fresh(l1) === l1)
const e2 = B.lift(B.hang(B.hang(ready())), 'explorer')
check('two at once leaves the rusted strip coarse, and an Explorer is not stuck: copper has still to give', !e2.done && !B.exact(e2.readings.rusted) && B.bendStage(e2, 'explorer') === 'testing' && step(e2).done)
check('…the same record stops a Scientist', B.bendStage(B.lift(B.hang(B.hang(ready())), 'scientist'), 'scientist') === 'stuck')
check('no fresh strips once the test is done: the record stays in the vice', B.fresh(l3) === l3 && B.fresh(s8) === s8)
const hung = B.hang(c5s)
check('no fresh strips while a load hangs', B.fresh(hung) === hung)
const f8 = times(8, (v) => step(v, 'scientist'), f)
check('the second set, one at a time, finishes it', f8.done && f8.sets === 2)
check('done is latched: a band change afterwards does not reopen the test', B.bendStage(l3) === 'tested' && B.lift(B.hang(l3), 'analyst').done)

/* 7 · what a reading says ---------------------------------------------------- */
check('a reading reads: nothing yet', B.readingText(spec('copper'), { back: 0, gaveAt: null }) === '')
check('…came back', B.readingText(spec('iron'), { back: 3, gaveAt: null }) === 'came back from 3')
check('…stayed bent, exact', B.readingText(spec('copper'), { back: 2, gaveAt: 3 }) === 'stayed bent at 3')
check('…cracked, exact', B.readingText(spec('rusted'), { back: 1, gaveAt: 2 }) === 'cracked at 2')
check('…stayed bent, coarse', B.readingText(spec('copper'), { back: 0, gaveAt: 5 }) === 'stayed bent between 1 and 5')
check('…cracked, coarse', B.readingText(spec('rusted'), { back: 0, gaveAt: 5 }) === 'cracked between 1 and 5')

/* 8 · the drawing and the why ------------------------------------------------ */
check('no pick on the drawing before the test is done', B.pickDrawing(l2, 'brace') === l2)
const d = B.pickDrawing(l3, 'brace')
check('the child points at the brace or a strap', d.pick === 'brace' && B.pickDrawing(l3, 'strap').pick === 'strap' && B.pickDrawing(l3, 'pin') === l3)
check('…once', B.pickDrawing(d, 'strap') === d)
check('stage: drawn', B.bendStage(d) === 'drawn')
check('no answer before the drawing', B.answerBend(l3, 0) === l3)
const a = B.answerBend(d, 0)
check('the why is answered once', a.why === 0 && B.answerBend(a, 1) === a && B.bendStage(a) === 'answered')
check('an answer off the list is nothing', B.answerBend(d, 7) === d && B.answerBend(d, -1) === d)
check('nothing is hung once the test is answered', B.hang(a) === a)

/* 9 · the drawing moves, by the clock ------------------------------------------ */
check('the clip: copper brace, sag, hold, timber brace, square — 4.3 s in all', B.DRAW_TOTAL === 4.3 && Math.abs(B.DRAW_BEATS.copper + B.DRAW_BEATS.sag + B.DRAW_BEATS.hold + B.DRAW_BEATS.timber + B.DRAW_BEATS.back - B.DRAW_TOTAL) < 1e-9)
check('no clock: the drawing is still', B.drawBeat(null) === 'still' && B.drawSag(null) === 0)
check('the beats in order', B.drawBeat(0) === 'copper' && B.drawBeat(0.6) === 'sag' && B.drawBeat(2.1) === 'hold' && B.drawBeat(2.9) === 'timber' && B.drawBeat(3.5) === 'back' && B.drawBeat(4.3) === 'square' && B.drawBeat(60) === 'square')
check('the leaf hangs square while the brace turns to copper', B.drawSag(0) === 0 && B.drawSag(0.5) === 0)
check('…sags as the copper brace gives, to the full sag by the hold', B.drawSag(1.2) > 0 && B.drawSag(1.2) < B.SAG_MAX && B.drawSag(2.0) === B.SAG_MAX && B.drawSag(2.6) === B.SAG_MAX)
check('…stays down while the timber brace goes back in, then comes up square', B.drawSag(3.2) === B.SAG_MAX && B.drawSag(3.8) < B.SAG_MAX && B.drawSag(3.8) > 0 && B.drawSag(4.3) === 0 && B.drawSag(99) === 0)
check('the brace is copper from the first beat until the timber one goes back', B.braceCopper(0.2) && B.braceCopper(2.5) && !B.braceCopper(3.0) && !B.braceCopper(null) && !B.braceCopper(9))

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
