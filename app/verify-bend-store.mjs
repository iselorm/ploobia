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
const optionOf = (key) => A.BEND_WHY.options.findIndex((o) => o.key === key)
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

onErrand()
A.crossPortal('foundry')
A.crossPortal('landing')
check('crossing back with the strap still up closes it: no room rides to the Landing', w().zone === 'landing' && w().room === 'none' && w().strap === 'shown')

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
A.openDrawing('explorer')
check('the drawing does not open before the test is done', w().room === 'vice')
A.drawingReplay()
check('…and has nothing to replay', (w().supply.drawnAt ?? null) === null && A.drawingBeatOf(w()) === 'still')
step()
step()
step()
A.openDrawing('explorer')
check('…and opens after it: a camera cut', w().room === 'drawing')
A.drawingPick('brace')
check('the child points at the brace', bend().pick === 'brace')
check('Sefu closes it', F.sefuMood(w()) === 'gate' && /The brace carries the gate\. These keep it straight\. Smaller job\./.test(F.sefuLines(w())[0]))
check('Ploob: one question left, at the drawing', /why copper/i.test(U.viceHint(w(), 'explorer') ?? ''), U.viceHint(w(), 'explorer') ?? 'null')

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
check('the why: "Why does the gate still get copper?", three answers', A.BEND_WHY.ask === 'Why does the gate still get copper?' && A.BEND_WHY.options.length === 3 && A.BEND_WHY.options.filter((o) => o.right).length === 1)
check('…the right one is not the first on the list', !A.BEND_WHY.options[0].right && /No rust/.test(A.BEND_SHORT[optionOf('right')]))
check('…with short labels to tap', A.BEND_SHORT.length === 3 && A.BEND_SHORT.every((t) => t.length <= 40), A.BEND_SHORT.join(' | '))
check('Ploob’s reasoned line carries the child’s own numbers', /cracked at 2/.test(A.bendWhyLine(w(), optionOf('right'))) && / 3/.test(A.bendWhyLine(w(), optionOf('right'))), A.bendWhyLine(w(), optionOf('right')))
check('…for "stronger than iron": copper stayed bent, iron came back', /copper stayed bent at 3/i.test(A.bendWhyLine(w(), optionOf('copper_stronger'))) && /came back/.test(A.bendWhyLine(w(), optionOf('copper_stronger'))), A.bendWhyLine(w(), optionOf('copper_stronger')))
check('…for "what Sefu had": the iron is in the vice', /iron/.test(A.bendWhyLine(w(), optionOf('only_metal'))), A.bendWhyLine(w(), optionOf('only_metal')))
const facts = A.bendFacts(w())
check('the judge is told what the child measured', facts.new_copper === 'stayed bent at 3' && facts.rusted_iron === 'cracked at 2' && facts.new_iron === 'came back from 3' && facts.old_copper === 'stayed bent at 3' && facts.guessed_first_to_give === 'new copper' && facts.pointed_at_on_the_drawing === 'brace', JSON.stringify(facts))
A.answerBendWhy(optionOf('copper_stronger'))
check('answered once; the plate moves to "Bring them to Sela"', A.BEND_WHY.options[bend().why].key === 'copper_stronger' && A.currentStepId(w()) === 'deliver' && A.currentStep(w()).target === 'portal.landing')
A.answerBendWhy(optionOf('right'))
check('…and stays answered', A.BEND_WHY.options[bend().why].key === 'copper_stronger')
check('Sefu stays by the vice', A.sefuSpot(w()) === 'vice')

atVice()
step()
step()
step()
A.answerBendWhy(optionOf('right'))
check('no answer before the drawing', bend().why === -1)
A.openDrawing('explorer')
A.drawingPick('strap')
A.answerBendWhyText('copper does not rust and the brace holds the weight', 'right', null)
check('in their own words, judged right: the right option, their sentence kept', A.BEND_WHY.options[bend().why].right && bend().whyText === 'copper does not rust and the brace holds the weight')
atVice()
step()
step()
step()
A.openDrawing('explorer')
A.drawingPick('brace')
A.answerBendWhyText('copper is the strongest', 'misconception', 'copper_stronger')
check('…judged a misconception: the option that names it', A.BEND_WHY.options[bend().why].key === 'copper_stronger' && bend().whyText === null)
atVice()
step()
step()
step()
A.openDrawing('explorer')
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
hung.s.supply.bend.load = 3
hung.s.supply.bend.on = true
A.resetWorld()
S.restoreWorld(hung)
check('a save taken with the hanger on comes back with it on', bend().on && bend().load === 3)

const orphan = roundTrip(snap)
orphan.s.supply.cast = { pours: [], why: -1, whyText: null }
orphan.s.supply.bench = M.initialBench()
A.resetWorld()
S.restoreWorld(orphan)
check('a cut strip with no pour on record is nobody’s strip: the vice starts again', bend().cut === false)

const lies = roundTrip(snap)
lies.s.supply.bend.why = 1
A.resetWorld()
S.restoreWorld(lies)
check('an answer with no test done and no drawing is not kept', bend().why === -1 && bend().pick === null)

/* 9 · what the review found -------------------------------------------------------- */
// The strip comes off the runner, and the runner is only in the tray once the mould has opened on a pour.
climbing()
tick(2)
chargeWith(M.SCRAP.slice(1), 9)
A.openMould()
A.castPour()
A.leaveRoom()
A.openVice()
A.viceCut()
check('while the channel is still running there is no runner to cut', !bend().cut && A.mouldLookOf(w()) === 'run')
tick(7.5)
A.leaveRoom()
A.openMould()
A.castBack()
A.leaveRoom()
A.openVice()
A.viceCut()
check('with the short cast back on the pan the tray is empty: no cut', !bend().cut && A.mouldLookOf(w()) === 'cold' && !A.runnerBack(w()))
check('…and Ploob says the tray has no runner', /no runner/.test(U.viceHint(w(), 'explorer') ?? ''), U.viceHint(w(), 'explorer') ?? 'null')
A.leaveRoom()
A.openBench('bench')
A.benchDrop(M.SCRAP[0].id)
A.benchDone()
A.balanceAdd()
A.balanceToFire()
A.leaveRoom()
A.openVice()
A.viceCut()
check('with the next charge on the fire the runner is in the crucible: no cut', !bend().cut && A.mouldLookOf(w()) === 'waiting')
A.leaveRoom()

// Used before the kit: Sefu is where the child is working, and Ploob does not put him elsewhere.
climbing()
tick(2)
chargeWith(M.SCRAP.slice(1), 9)
A.openMould()
A.castPour()
tick(7.5)
A.leaveRoom()
check('a short cast in the mould, the child in the yard: Sefu is at the mould', A.sefuSpot(w()) === 'mould')
A.openVice()
check('…the child at the vice: he comes over', A.sefuSpot(w()) === 'vice')
A.viceCut()
A.vicePredict('iron')
step()
step()
step()
A.leaveRoom()
check('…and goes back to the mould when the child steps away', A.sefuSpot(w()) === 'mould')
check('Ploob points at the drawing without saying where Sefu is', /drawing/.test(U.viceHint(w(), 'explorer') ?? '') && !/Sefu/.test(U.viceHint(w(), 'explorer') ?? ''), U.viceHint(w(), 'explorer') ?? 'null')
check('…and the pill does not either', !/Sefu/.test(U.vicePill(bend(), 'explorer')?.sub ?? ''), JSON.stringify(U.vicePill(bend(), 'explorer')))
check('the drawing has its verb only once the test is done', A.drawingShown(w()))
A.openDrawing('explorer')
A.drawingPick('brace')
check('the why is Ploob’s to ask: his line does not say Sefu is asking', !/Sefu/.test(U.viceHint(w(), 'explorer') ?? ''), U.viceHint(w(), 'explorer') ?? 'null')
A.answerBendWhy(optionOf('right'))
check('the vice answered before the kit: the plate is still on the cast', A.currentStepId(w()) === 'cast' || A.currentStepId(w()) === 'measure', A.currentStepId(w()))
atVice()
check('before the test is done the drawing has no verb', !A.drawingShown(w()))

// Ploob's lines are true of the record.
atVice()
step()
step()
for (let i = 0; i < 6; i++) A.viceHang()
A.viceLift('explorer')
check('an Explorer who lifts at 1, 2, then 8: stuck, and Ploob does not say all four gave together', B.bendStage(bend(), 'explorer') === 'stuck' && !/All four/.test(U.viceHint(w(), 'explorer') ?? '') && /New iron/.test(U.viceHint(w(), 'explorer') ?? '') && /Fresh strips/.test(U.viceHint(w(), 'explorer') ?? ''), U.viceHint(w(), 'explorer') ?? 'null')
atVice()
for (let i = 0; i < 8; i++) A.viceHang()
A.viceLift('explorer')
check('…eight at once: all four did give together, and he says so', /All four gave together/.test(U.viceHint(w(), 'explorer') ?? ''), U.viceHint(w(), 'explorer') ?? 'null')
atVice()
for (let i = 0; i < 4; i++) step('scientist')
check('a Scientist at four: new iron came back — not "they all came back"', /New iron came back/.test(U.viceHint(w(), 'scientist') ?? '') && !/all came back/.test(U.viceHint(w(), 'scientist') ?? ''), U.viceHint(w(), 'scientist') ?? 'null')
atVice()
step('scientist')
check('…at one, all four did', /all came back/.test(U.viceHint(w(), 'scientist') ?? ''), U.viceHint(w(), 'scientist') ?? 'null')

// Sefu's own line moves on once the guess is made.
kitCast()
A.openVice()
A.viceCut()
A.leaveRoom()
check('before the guess Sefu asks for it', F.sefuMood(w()) === 'vice')
A.openVice()
A.vicePredict('copper')
A.leaveRoom()
check('after it he does not ask again', F.sefuMood(w()) === 'testing' && !/which gives first/.test(F.sefuLines(w())[0]), F.sefuLines(w())[0])

// A band change mid-test: the drawing opens on a record that satisfies the new band.
atVice()
for (let i = 0; i < 3; i++) step('scientist')
for (let i = 0; i < 5; i++) A.viceHang()
A.viceLift('scientist')
check('a Scientist’s 1, 2, 3, then 8: not done', !bend().done)
A.openDrawing('scientist')
check('…the drawing stays shut for a Scientist', w().room === 'vice')
A.openDrawing('explorer')
check('…and opens for an Explorer: the test is settled as done', w().room === 'drawing' && bend().done)

// The clip ends with a store write of its own, whatever the furnace is doing.
atVice()
step()
step()
step()
A.openDrawing('explorer')
A.setWorld((s) => ({ furnace: { ...s.furnace, lit: false }, lit: [] }))
A.drawingPick('strap')
for (let i = 0; i < 20; i++) A.tickWorld(0.25)
check('with nothing burning the clip still ends in the store: its clock is cleared', w().supply.drawnAt === null && A.drawingBeatOf(w()) === 'square')

// A saved vice is believed only when play could have left it.
atVice()
step()
step()
{
  const base = roundTrip(S.snapshot(w(), null))
  const restore = (edit) => {
    const x = roundTrip(base)
    edit(x.s.supply.bend)
    A.resetWorld()
    S.restoreWorld(x)
    return bend()
  }
  check('a coherent block comes back whole', restore(() => {}).readings.rusted.gaveAt === 2)
  check('a hanger of eight over readings that never saw it: the vice starts again', restore((v) => { v.load = 8 }).cut === false)
  check('a finished test with nothing tested: the vice starts again', restore((v) => { v.done = true; v.pick = 'brace'; v.why = 1; v.readings = B.initialBend().readings; v.load = 0 }).cut === false)
  check('readings no lift could leave: the vice starts again', restore((v) => { v.readings.iron = { back: 5, gaveAt: null } }).cut === false)
  check('a real hanger-on state comes back on', (() => { const v = restore((x) => { x.load = 3; x.on = true }); return v.on && v.load === 3 })())
  const long = 'x'.repeat(5000)
  A.resetWorld()
  const y = roundTrip(base)
  y.s.supply.bend = { ...y.s.supply.bend, load: 3, done: true, pick: 'brace', why: 1, whyText: long, readings: { copper: { back: 2, gaveAt: 3 }, oldCopper: { back: 2, gaveAt: 3 }, iron: { back: 3, gaveAt: null }, rusted: { back: 1, gaveAt: 2 } } }
  S.restoreWorld(y)
  check('a kept sentence is kept to a sentence’s length', bend().why === 1 && bend().whyText.length === 300)
}

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
