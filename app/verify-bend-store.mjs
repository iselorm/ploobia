/**
 * S2 round A3 — the strap, the vice and the repair drawing through the world
 * store and the save, in Node. The strap is the arrival beat for a child on
 * Sela's errand; the vice opens its test once a pour has put a runner in the
 * tray; the plate moves from "Test the straps" to "Bring them to Sela" on the
 * bend's why; the save carries all of it and an A2 save loads unchanged.
 * `node verify-bend-store.mjs`.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const OUT = '/tmp/bend-store-suite.mjs'
fs.writeFileSync(
  '/tmp/bend-store-barrel.ts',
  `export * as A from '${path.resolve('src/lib/archipelago')}'
export * as S from '${path.resolve('src/lib/worldsave')}'
export * as M from '${path.resolve('src/lib/supply')}'
export * as B from '${path.resolve('src/lib/bend')}'
export * as F from '${path.resolve('src/lib/sefu')}'
export * as U from '${path.resolve('src/lib/benchui')}'
`,
)
execSync(`npx esbuild /tmp/bend-store-barrel.ts --bundle --format=esm --outfile=${OUT} --alias:@=${path.resolve('src')} --define:import.meta.env={}`, { stdio: 'pipe' })
const { A, S, M, B, F, U } = await import(OUT)

let fails = 0
let passes = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)
  if (ok) passes += 1
  else fails += 1
}
const roundTrip = (x) => JSON.parse(JSON.stringify(x))
const w = () => A.getWorld()
const bend = () => A.bendOf(w())
const tick = (seconds) => {
  for (let t = 0; t < seconds; t += 0.25) A.tickWorld(0.25)
}

/** The Landing, S0 done, the child sent across: Sela's errand is on. */
function onErrand() {
  A.resetWorld()
  A.setWorld((s) => ({ phase: 'play', zone: 'landing', plot: { ...s.plot, sent: true } }))
}
/** The cart story's courtyard with the furnace burning charcoal on full air, just under copper heat. */
function climbing({ across = true } = {}) {
  A.resetWorld()
  A.setWorld((s) => ({
    phase: 'play',
    zone: 'foundry',
    step: 'feed',
    fed: ['scrap.a', 'scrap.b'],
    lit: ['wetwood', 'drywood', 'charcoal'],
    bellowsSeen: true,
    pipeFixed: true,
    air: 1,
    prediction: 1000,
    furnace: { lit: true, fuel: 'charcoal', temp: 1040 },
    plot: { ...s.plot, sent: across },
  }))
}
function chargeWith(pieces, dry) {
  A.openBench('bench')
  A.benchSink()
  A.benchMark()
  A.benchLift()
  for (const p of pieces) A.benchDrop(p.id)
  A.benchDone()
  for (let i = 0; i < dry; i++) A.balanceAdd()
  A.balanceToFire()
  A.leaveRoom()
}
/** The kit is cast and Sefu's measure question is answered: the plate reads "Test the straps". */
function kitCast() {
  climbing()
  tick(2)
  chargeWith(M.SCRAP, 10)
  A.openMould()
  A.castPour()
  tick(7.5)
  A.answerCastWhy(0)
  A.leaveRoom()
}
/** The vice, cut and guessed, ready for the first ingot. */
function atVice(guess = 'copper') {
  kitCast()
  A.openVice()
  A.viceCut()
  A.vicePredict(guess)
}
const step = (band = 'explorer') => {
  A.viceHang()
  A.viceLift(band)
}

/* 1 · the strap is the arrival beat ----------------------------------------- */
A.resetWorld()
check('a new world: the strap has not been seen', w().strap === 'unseen')
onErrand()
A.crossPortal('foundry')
check('on the errand, the first step into the Foundry cuts to the strap', w().zone === 'foundry' && w().room === 'strap' && w().strap === 'shown')
check('…the strap bench stands in the yard for an errand child', A.strapShown(w()))
check('…and Sefu speaks of the strap', F.sefuMood(w()) === 'strap' && /Off the watch's jetty gate\. Rusted through\. Sela wants ones that won't\./.test(F.sefuLines(w())[0]) && /I can't pour a thing cold\. And I've forty bells waiting behind it\./.test(F.sefuLines(w())[1]))
A.takeStrap()
check('one tap takes it', w().strap === 'taken' && w().room === 'strap')
A.takeStrap()
check('…once', w().strap === 'taken')
A.leaveRoom()
check('back to work: the yard, and the brief can open', w().room === 'none' && w().prediction === null)
A.crossPortal('landing')
A.crossPortal('foundry')
check('a second crossing does not replay it', w().room === 'none' && w().strap === 'taken')

A.resetWorld()
A.setWorld({ phase: 'play', zone: 'landing' })
A.crossPortal('foundry')
check('nobody sent by Sela: no strap beat, no strap bench', w().room === 'none' && w().strap === 'unseen' && !A.strapShown(w()) && F.sefuMood(w()) === 'clear')
A.openStrap()
check('…and the bench does not open for them', w().room === 'none')

onErrand()
A.setWorld({ prediction: 1000 })
A.crossPortal('foundry')
check('after the brief (an old save mid-relight) the beat does not interrupt', w().room === 'none' && w().strap === 'unseen')
A.openStrap()
check('…but the bench opens when the child walks up to it', w().room === 'strap' && w().strap === 'shown')
A.leaveRoom()
A.setWorld({ held: 'scrap.a' })
A.openStrap()
check('not with a piece in hand', w().room === 'none')
A.setWorld({ held: null })

onErrand()
A.crossPortal('foundry')
A.leaveRoom()
check('stepping away without taking it leaves it shown, not taken', w().strap === 'shown')
A.takeStrap()
check('…and it is only taken at the bench', w().strap === 'shown')

/* 2 · the vice stands in the yard; the strip waits for a runner -------------- */
climbing()
check('the vice stands for an errand child before any heat', A.viceShown(w()) && w().supply === null)
check('…its state reads as a new vice', bend().cut === false && bend().guess === null && B.bendStage(bend()) === 'uncut')
A.openVice()
check('the vice is a station: a camera cut', w().room === 'vice')
A.viceCut()
check('nothing poured: no strip is cut', !bend().cut && w().supply === null)
check('Ploob says where the strip comes from', /runner/.test(U.viceHint(w(), 'explorer') ?? ''), U.viceHint(w(), 'explorer') ?? 'null')
A.leaveRoom()
A.setWorld({ held: 'scrap.a' })
A.openVice()
check('the vice does not open with a piece in hand', w().room === 'none')
A.setWorld({ held: null })
A.resetWorld()
A.setWorld({ phase: 'play', zone: 'foundry' })
A.openVice()
check('no errand, no bench opened: no vice', !A.viceShown(w()) && w().room === 'none')

// A short pour is a pour: its runner is in the tray.
climbing()
tick(2)
chargeWith(M.SCRAP.slice(1), 9)
A.openMould()
A.castPour()
tick(7.5)
A.leaveRoom()
A.openVice()
A.viceCut()
check('a short pour leaves a runner too: the strip can be cut', bend().cut && A.mouldLookOf(w()) === 'short')
check('…and the tray gives up 90 g for it', B.trayG(M.lastPour(w().supply.cast).spareG, bend()) === M.lastPour(w().supply.cast).spareG - 90)

/* 3 · the quest and Sefu's place ---------------------------------------------- */
kitCast()
check('the kit cast and the question answered: the plate reads "Test the straps", at the vice', A.currentStepId(w()) === 'test' && A.currentStep(w()).target === 'vice.strips')
check('Sefu stands at the vice', A.sefuSpot(w()) === 'vice')
check('…and asks for the guess', F.sefuMood(w()) === 'vice' && /You tell me which gives first\./.test(F.sefuLines(w())[0]))
A.openMould()
check('while the child is back at the mould, so is he', A.sefuSpot(w()) === 'mould')
A.leaveRoom()
climbing()
check('before the heat he is at the gate', A.sefuSpot(w()) === 'gate')
tick(2)
chargeWith(M.SCRAP, 10)
check('with a charge on the fire he is at the mould', A.sefuSpot(w()) === 'mould')

/* 4 · predict, hang, lift ------------------------------------------------------ */
kitCast()
A.openVice()
A.viceHang()
check('no ingot before the strip is cut', bend().load === 0)
A.viceCut()
check('Sefu cuts the strip from the runner', bend().cut && B.bendStage(bend()) === 'predict')
check('Ploob asks for the guess', /first/.test(U.viceHint(w(), 'explorer') ?? ''), U.viceHint(w(), 'explorer') ?? 'null')
A.viceHang()
check('no ingot before the guess', bend().load === 0)
A.vicePredict('copper')
check('the guess is kept', bend().guess === 'copper')
A.viceHang()
check('an ingot on all four', bend().load === 1 && bend().on)
check('Ploob: lift them off', /Lift/.test(U.viceHint(w(), 'explorer') ?? ''), U.viceHint(w(), 'explorer') ?? 'null')
A.viceLift('explorer')
check('lifted: all four came back', !bend().on && B.STRIPS.every((s) => bend().readings[s.id].back === 1))
step()
check('at two the rusted strip cracked', bend().readings.rusted.gaveAt === 2)
check('Ploob says what happened', /cracked/i.test(U.viceHint(w(), 'explorer') ?? ''), U.viceHint(w(), 'explorer') ?? 'null')
step()
check('at three the coppers stayed bent: the Explorer’s test is done', bend().done && bend().readings.copper.gaveAt === 3)
check('Ploob: it stayed bent', /It stayed bent\./.test(U.viceHint(w(), 'explorer') ?? ''), U.viceHint(w(), 'explorer') ?? 'null')
check('Sefu asks what the strip is not for', F.sefuMood(w()) === 'bent' && /So what would you never make from that strip\?/.test(F.sefuLines(w())[0]))
check('the plate still reads "Test the straps"', A.currentStepId(w()) === 'test')

atVice()
for (let i = 0; i < 5; i++) A.viceHang()
A.viceLift('scientist')
check('five at once, as a Scientist: stuck, and Ploob names the range', B.bendStage(bend(), 'scientist') === 'stuck' && /between 1 and 5/.test(U.viceHint(w(), 'scientist') ?? ''), U.viceHint(w(), 'scientist') ?? 'null')
A.viceFresh()
check('fresh strips through the store', bend().sets === 2 && bend().load === 0)
for (let i = 0; i < 8; i++) step('scientist')
check('eight, one at a time: four exact readings', bend().done && B.STRIPS.every((s) => B.exact(bend().readings[s.id])))

/* 5 · the drawing ------------------------------------------------------------- */
atVice()
A.openDrawing()
check('the drawing does not open before the test is done', w().room === 'vice')
A.drawingReplay()
check('…and has nothing to replay', (w().supply.drawnAt ?? null) === null && A.drawingBeatOf(w()) === 'still')
step()
step()
step()
A.openDrawing()
check('…and opens after it: a camera cut', w().room === 'drawing')
A.drawingPick('brace')
check('the child points at the brace', bend().pick === 'brace')
check('Sefu closes it', F.sefuMood(w()) === 'gate' && /The brace carries the gate\. These keep it straight\. Smaller job\./.test(F.sefuLines(w())[0]))
check('Ploob: Sefu is asking', /Sefu/.test(U.viceHint(w(), 'explorer') ?? ''), U.viceHint(w(), 'explorer') ?? 'null')

check('the pick starts the drawing\'s clip on the sim clock', typeof w().supply.drawnAt === 'number' && A.drawingBeatOf(w()) === 'copper')
{
  const t0 = w().time
  tick(1)
  check('…the store\'s clock is kept fresh while it plays, so the HUD can read the beat', w().time > t0 && A.drawingBeatOf(w()) === 'sag', `${t0} → ${w().time} ${A.drawingBeatOf(w())}`)
  tick(4)
  check('…and it ends square', A.drawingBeatOf(w()) === 'square')
  A.drawingReplay()
  check('"Watch again" restarts it', A.drawingBeatOf(w()) === 'copper')
  tick(5)
}

/* 6 · the why ------------------------------------------------------------------ */
check('the why: "Why does the gate still get copper?", three answers', A.BEND_WHY.ask === 'Why does the gate still get copper?' && A.BEND_WHY.options.length === 3 && A.BEND_WHY.options[0].right && A.BEND_WHY.options.filter((o) => o.right).length === 1)
check('…with short labels to tap', A.BEND_SHORT.length === 3 && A.BEND_SHORT.every((t) => t.length <= 40), A.BEND_SHORT.join(' | '))
check('Ploob’s reasoned line carries the child’s own numbers', /cracked at 2/.test(A.bendWhyLine(w(), 0)) && / 3/.test(A.bendWhyLine(w(), 0)), A.bendWhyLine(w(), 0))
check('…for "stronger than iron": copper stayed bent, iron came back', /copper stayed bent at 3/i.test(A.bendWhyLine(w(), 1)) && /came back/.test(A.bendWhyLine(w(), 1)), A.bendWhyLine(w(), 1))
check('…for "what Sefu had": the iron is in the vice', /iron/.test(A.bendWhyLine(w(), 2)), A.bendWhyLine(w(), 2))
const facts = A.bendFacts(w())
check('the judge is told what the child measured', facts.new_copper === 'stayed bent at 3' && facts.rusted_iron === 'cracked at 2' && facts.new_iron === 'came back from 3' && facts.old_copper === 'stayed bent at 3' && facts.guessed_first_to_give === 'new copper' && facts.pointed_at_on_the_drawing === 'brace', JSON.stringify(facts))
A.answerBendWhy(1)
check('answered once; the plate moves to "Bring them to Sela"', bend().why === 1 && A.currentStepId(w()) === 'deliver' && A.currentStep(w()).target === 'portal.landing')
A.answerBendWhy(0)
check('…and stays answered', bend().why === 1)
check('Sefu stays by the vice', A.sefuSpot(w()) === 'vice')

atVice()
step()
step()
step()
A.answerBendWhy(0)
check('no answer before the drawing', bend().why === -1)
A.openDrawing()
A.drawingPick('strap')
A.answerBendWhyText('copper does not rust and the brace holds the weight', 'right', null)
check('in their own words, judged right: the right option, their sentence kept', bend().why === 0 && bend().whyText === 'copper does not rust and the brace holds the weight')
atVice()
step()
step()
step()
A.openDrawing()
A.drawingPick('brace')
A.answerBendWhyText('copper is the strongest', 'misconception', 'copper_stronger')
check('…judged a misconception: the option that names it', A.BEND_WHY.options[bend().why].key === 'copper_stronger' && bend().whyText === null)
atVice()
step()
step()
step()
A.openDrawing()
A.drawingPick('brace')
A.answerBendWhyText('because', 'partial', null)
check('…judged partial: nothing recorded, the nudge is Ploob’s', bend().why === -1 && typeof A.BEND_NUDGE === 'string' && A.BEND_NUDGE.length > 10)

/* 7 · the rooms belong to S2 ---------------------------------------------------- */
atVice()
check('the vice is an S2 room', U.supplyRoomOf(w()) === 'vice')
A.leaveRoom()
check('away from the vice mid-test, the pill says where it stands', U.vicePill(bend(), 'explorer')?.text === 'Vice', JSON.stringify(U.vicePill(bend(), 'explorer')))

/* 8 · the save ------------------------------------------------------------------ */
atVice()
step()
step()
const snap = roundTrip(S.snapshot({ ...w(), strap: 'taken' }, null))
check('the snapshot carries the strap and the vice', snap.s.strap === 'taken' && snap.s.supply.bend.readings.rusted.gaveAt === 2 && snap.s.supply.bend.guess === 'copper')
A.resetWorld()
S.restoreWorld(snap)
check('a restored drawing is not mid-clip', w().supply.drawnAt === null && A.drawingBeatOf(w()) === 'still')
check('restore: the strap taken, the vice where it stood', w().strap === 'taken' && bend().cut && bend().load === 2 && !bend().on && bend().readings.rusted.gaveAt === 2 && bend().readings.copper.back === 2)
A.setWorld({ phase: 'play' })
A.openVice()
step()
check('…and the test carries on', bend().done)

const a2 = roundTrip(snap)
delete a2.s.strap
delete a2.s.supply.bend
A.resetWorld()
S.restoreWorld(a2)
check('an A2 save (no strap, no bend): loads whole, the vice new', w().strap === 'unseen' && M.kitCast(w().supply.cast) && bend().cut === false && A.currentStepId({ ...w(), phase: 'play' }) === 'test')

const bad = roundTrip(snap)
bad.s.strap = 'eaten'
bad.s.supply.bend = { cut: 'yes', readings: { copper: {} }, load: 99 }
A.resetWorld()
S.restoreWorld(bad)
check('a damaged strap or bend block: the kit is kept, the vice starts again', w().strap === 'unseen' && M.kitCast(w().supply.cast) && bend().cut === false && bend().load === 0)

const hung = roundTrip(snap)
hung.s.supply.bend.on = true
A.resetWorld()
S.restoreWorld(hung)
check('a save taken with the hanger on comes back with it on', bend().on && bend().load === 2)

const orphan = roundTrip(snap)
orphan.s.supply.cast = { pours: [], why: -1, whyText: null }
orphan.s.supply.bench = M.initialBench()
A.resetWorld()
S.restoreWorld(orphan)
check('a cut strip with no pour on record is nobody’s strip: the vice starts again', bend().cut === false)

const lies = roundTrip(snap)
lies.s.supply.bend.why = 0
A.resetWorld()
S.restoreWorld(lies)
check('an answer with no test done and no drawing is not kept', bend().why === -1 && bend().pick === null)

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
