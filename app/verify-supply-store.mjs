/**
 * S2 round A1 — the cold bench through the world store and the save, in Node.
 * The bench opens at copper heat; the quest becomes the cart once the child has
 * come across from S0; actions move the bench; the save carries the block and
 * salvages a bad one. `node verify-supply-store.mjs`.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const OUT = '/tmp/supply-store-suite.mjs'
fs.writeFileSync(
  '/tmp/supply-store-barrel.ts',
  `export * as A from '${path.resolve('src/lib/archipelago')}'
export * as S from '${path.resolve('src/lib/worldsave')}'
export * as M from '${path.resolve('src/lib/supply')}'
export * as F from '${path.resolve('src/lib/sefu')}'
export * as U from '${path.resolve('src/lib/benchui')}'
`,
)
execSync(`npx esbuild /tmp/supply-store-barrel.ts --bundle --format=esm --outfile=${OUT} --alias:@=${path.resolve('src')} --define:import.meta.env={}`, { stdio: 'pipe' })
const { A, S, M, F, U } = await import(OUT)

let fails = 0
let passes = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)
  if (ok) passes += 1
  else fails += 1
}
const roundTrip = (x) => JSON.parse(JSON.stringify(x))
const w = () => A.getWorld()
const bench = () => w().supply?.bench

/** The courtyard at copper heat with the S1 fortnight out (the child came across from S0). */
function atCopperHeat({ poured = false, across = true } = {}) {
  A.resetWorld()
  A.setWorld((s) => ({
    phase: 'play',
    zone: 'foundry',
    step: poured ? 'done' : 'feed',
    lit: ['wetwood', 'drywood', 'charcoal'],
    pipeFixed: true,
    poured,
    pourSeen: poured,
    furnace: { lit: true, fuel: 'charcoal', temp: poured ? 1200 : 1085 },
    plot: { ...s.plot, sent: across },
  }))
}

/* 1 · availability and the quest ------------------------------------------- */
A.resetWorld()
A.setWorld({ phase: 'play', zone: 'foundry', furnace: { lit: true, fuel: 'charcoal', temp: 900 } })
check('no bench at 900 °C', !A.benchAvailable(w()))
A.openBench('bench')
check('…and openBench does nothing', w().supply === null && w().room === 'none')
check('…the quest is the relight when nobody came across from S0', A.activeQuest(w()).id === 'foundry.relight')

atCopperHeat()
check('the bench opens at copper heat', A.benchAvailable(w()))
check('the quest is the cart once the child came across; its current step is the relight\'s until done', A.activeQuest(w()).id === 'foundry.cart' && A.currentStepId(w()) === 'feed')
check('the cart lists the relight\'s steps and then measure · cast · test · deliver', A.CART_QUEST.steps.map((s) => s.id).slice(-4).join(',') === 'measure,cast,test,deliver' && A.CART_QUEST.steps.length === A.RELIGHT.steps.length + 4)

atCopperHeat({ poured: true })
check('once poured, the current step is measure', A.currentStepId(w()) === 'measure')
check('an old save that poured before S1 still gets the bench', A.benchAvailable(w()))

/* 2 · the bench through the store -------------------------------------------- */
A.openBench('bench')
check('openBench: a fresh bench, the bench room, nothing held', bench()?.phase === 'idle' && w().room === 'bench' && w().held === null)
A.benchDrop('scrap.nugget')
check('dropping scrap before the pattern is a no-op', bench().inJug.length === 0)
A.benchSink()
A.benchMark()
A.benchLift()
check('sink, mark, lift → matching with the mark', bench().phase === 'matching' && bench().marked && !bench().patternIn)
for (const p of M.SCRAP) A.benchDrop(p.id)
check('six pieces in → at the mark', M.benchReached(bench()) && bench().inJug.length === 6)
A.benchDone()
check('done → balancing, and the camera goes to the balance', bench().phase === 'balancing' && w().room === 'balance')
for (let i = 0; i < 10; i++) A.balanceAdd()
check('ten ingots: level; Sefu offers the runner', M.benchLevel_(bench()) && M.runnerOffered(bench()))
check('…the quest step is still measure', A.currentStepId(w()) === 'measure')
A.balanceToFire()
check('to the fire → charged 9,856 g; the wet set stays; the step moves to cast', bench().phase === 'charged' && bench().charge === 9856 && bench().inJug.length === 6 && A.currentStepId(w()) === 'cast')
A.leaveRoom()
check('leaving the room keeps the bench', w().room === 'none' && bench().phase === 'charged')

/* 3 · the Analyst's lump, through the store ----------------------------------- */
atCopperHeat({ poured: true })
A.openBench('bench')
A.benchSink()
A.benchMark()
A.benchLift()
for (const p of [...M.SCRAP.slice(1), M.GREY_LUMP]) A.benchDrop(p.id)
A.benchDone()
for (let i = 0; i < 10; i++) A.balanceAdd()
check('grey set at ten: not level, 109 g under the prediction', !M.benchLevel_(bench()) && M.benchGap(bench()) === -109)
A.balanceInspect('scrap.grey')
A.benchTake('scrap.grey')
check('inspect, take it out → back to matching, ingots kept, room back at the bench', bench().phase === 'matching' && bench().inspected.includes('scrap.grey') && bench().dry === 10)
A.benchDrop('scrap.nugget')
A.benchDone()
check('the sixth copper piece in, done → level at ten', M.benchLevel_(bench()) && w().room === 'balance')

/* 4 · the save ------------------------------------------------------------- */
const snap = roundTrip(S.snapshot(w(), null))
check('the snapshot carries the supply block', snap.s.supply?.bench?.phase === 'balancing' && snap.s.supply.bench.dry === 10)
A.resetWorld()
check('validSave accepts it', S.validSave(snap))
S.restoreWorld(snap)
check('restore brings the bench back whole', bench()?.phase === 'balancing' && bench().dry === 10 && bench().inJug.length === 6 && bench().inspected.includes('scrap.grey'))
check('…the room is not saved: a reload stands in the yard', w().room === 'none')

const bad = roundTrip(snap)
bad.s.supply = { bench: { phase: 'flying', inJug: 'no' } }
A.resetWorld()
check('a bad supply block still validates (the world is never lost)', S.validSave(bad))
S.restoreWorld(bad)
check('…and restores as a fresh bench', bench()?.phase === 'idle' && bench().inJug.length === 0)

const none = roundTrip(snap)
delete none.s.supply
A.resetWorld()
S.restoreWorld(none)
check('a save without the block (S1-era) restores with no supply', w().supply === null)

/* ============================================================================
 * Round A2 — the held pour and the mould
 * ========================================================================= */
const cast = () => w().supply?.cast
const tick = (seconds) => {
  for (let t = 0; t < seconds; t += 0.25) A.tickWorld(0.25)
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
/** Walk the bench to a charge: `pieces` in the water, `dry` ingots on the pan, to the fire. */
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
const FIVE = M.SCRAP.slice(1)

/* 5 · the held pour ------------------------------------------------------------ */
climbing({ across: false })
tick(2)
check('nobody came across from S0: the relight pours by itself at copper heat, as built', w().poured && w().supply === null && w().step === 'done')

climbing()
tick(2)
check('the cart story: copper heat does NOT pour', !w().poured && w().furnace.temp >= 1045, `${Math.round(w().furnace.temp)} °C`)
check('…it opens the bench instead: a fresh bench and an empty cast record', bench()?.phase === 'idle' && cast()?.pours.length === 0 && w().supply.pouredAt === null)
check('…the relight step stays at feed; the cart’s current step is measure', w().step === 'feed' && A.currentStepId(w()) === 'measure')
check('…the cart calls that step "Reach 1085 °C" (the pour is the cast)', A.CART_QUEST.steps.find((x) => x.id === 'feed').label === 'Reach 1085 °C' && A.RELIGHT.steps.find((x) => x.id === 'feed').label === 'Reach 1085 °C and pour')
check('…the heat Sefu holds the pour at is the relight\'s own hand-in reading', M.POUR_AT_C === A.COPPER_MELT_C - A.HANDIN_TOLERANCE_C)
check('…Sefu: "We have the heat. Now: how much copper?"', F.sefuMood(w()) === 'heat' && F.sefuLines(w())[0] === 'We have the heat. Now: how much copper?')
check('…Ploob points at the cold bench', /cold bench/i.test(U.benchHint(w(), 'explorer') ?? ''))
A.setWorld((s) => ({ air: 0, furnace: { ...s.furnace, temp: 600 } }))
check('…once opened, the bench stays open if the fire drops', A.benchAvailable(w()))

/* 6 · the mould: a full pour ----------------------------------------------------- */
climbing()
tick(2)
A.openMould()
check('the mould is a room of its own', w().room === 'mould')
A.castPour()
check('nothing pours before a charge', cast().pours.length === 0 && A.mouldLookOf(w()) === 'cold')
A.leaveRoom()
chargeWith(M.SCRAP, 10)
check('charged: the step is cast and the mould waits', A.currentStepId(w()) === 'cast' && A.mouldLookOf(w()) === 'waiting')
check('…Ploob: Sefu has the dry pan, the mould is at the furnace foot', /furnace foot/.test(U.benchHint(w(), 'explorer') ?? ''))
A.setWorld((s) => ({ air: 0, furnace: { ...s.furnace, temp: 600 } }))
A.castPour()
check('the fire has dropped: Sefu will not pour', cast().pours.length === 0 && A.pourBlocked(w()) === 'cold')
check('…Sefu: "Fire\'s dropped. I can\'t pour a thing cold."', F.sefuMood(w()) === 'cold' && /can't pour a thing cold/.test(F.sefuLines(w())[0]))
A.setWorld((s) => ({ air: 1, furnace: { ...s.furnace, temp: 1200 } }))
check('…back at heat, nothing blocks it', A.pourBlocked(w()) === null)
A.castPour()
check('the pour: one pour on the record, its clock started, the channel running', cast().pours.length === 1 && w().supply.pouredAt !== null && A.mouldLookOf(w()) === 'run')
check('…`poured` waits for the mould to open', !w().poured)
A.castBack()
check('…and nothing goes back to the bench', bench().phase === 'charged' && bench().recasts === 0)
tick(3)
check('…it dulls', A.mouldLookOf(w()) === 'cool' && !w().poured)
tick(4.5)
check('the mould opens on the fittings: the look is full, `poured` is set, the relight is done', A.mouldLookOf(w()) === 'full' && w().poured && w().step === 'done')
check('…the journal has what was watched', /copper/.test(w().journal.observed ?? ''))
check('…the step holds at cast until Sefu\'s question is answered', A.currentStepId(w()) === 'cast')
check('…the measure why: three things to point at, the water is right', A.MEASURE_WHY.options.length === 3 && A.MEASURE_WHY.options[0].key === 'right' && A.MEASURE_WHY.ask === 'Which measurement told you how much?')
A.answerCastWhy(1)
check('answered (the gauge): recorded as chosen, the step moves on to the straps', cast().why === 1 && A.currentStepId(w()) === 'test')
check('…Sefu: "Sela\'s, this one. The bells can wait for a better metal."', F.sefuMood(w()) === 'kit' && F.sefuLines(w())[0] === "Sela's, this one. The bells can wait for a better metal.")
A.castPour()
check('one kit: a second pour is refused', cast().pours.length === 1)

/* 7 · a short pour, and the re-pour ---------------------------------------------- */
climbing()
tick(2)
chargeWith(FIVE, 9)
A.openMould()
A.castPour()
tick(7.5)
check('five pieces, nine ingots: the cast is short and `poured` stays unset', A.mouldLookOf(w()) === 'short' && !w().poured && M.castCm3(M.lastPour(cast())) === 900)
check('…Sefu: "Short copper, short strap. Find what\'s missing."', F.sefuMood(w()) === 'short' && F.sefuLines(w())[0] === "Short copper, short strap. Find what's missing.")
A.castBack()
check('back: the cold cast on the dry pan, the child at the jug, the camera with them', bench().phase === 'matching' && bench().castDry === 9 && bench().recasts === 1 && w().room === 'bench' && w().supply.pouredAt === null)
check('…the step is measure again', A.currentStepId(w()) === 'measure' && A.mouldLookOf(w()) === 'cold')
A.benchDrop('scrap.nugget')
A.benchDone()
A.balanceAdd()
A.balanceToFire()
check('the missing piece and one more ingot: the whole charge again, 9,856 g', bench().phase === 'charged' && bench().charge === 9856 && bench().dry === 10)
A.openMould()
A.castPour()
tick(7.5)
check('the second pour fills the mould: two pours on the record, `poured` set', cast().pours.length === 2 && A.mouldLookOf(w()) === 'full' && w().poured)

climbing()
tick(2)
chargeWith(M.SCRAP, 8)
A.openMould()
A.castPour()
tick(7.5)
A.castBack()
check('the water was right and the ingots were the guess: back to the BALANCE', bench().phase === 'balancing' && w().room === 'balance' && bench().castDry === 8)

/* 8 · a save that already poured (before S2, or on A1) ---------------------------- */
atCopperHeat({ poured: true })
A.setWorld({ air: 1 })
check('an old pour, nothing measured: Sefu left with good copper', F.sefuMood(w()) === 'left' && /You left me good copper/.test(F.sefuLines(w())[0]))
chargeWith(M.SCRAP, 10)
A.openMould()
A.castPour()
tick(7.5)
check('Sefu melts what they left: the kit is cast; the pour card never returns', A.mouldLookOf(w()) === 'full' && M.kitCast(cast()) && w().pourSeen && w().poured)
A.answerCastWhyText('the water went up by the size of the pattern', 'right', null)
check('the why in their own words, judged right: the right option, their sentence kept', cast().why === 0 && cast().whyText === 'the water went up by the size of the pattern')
atCopperHeat({ poured: true })
A.setWorld({ air: 1 })
chargeWith(M.SCRAP, 10)
A.castPour()
tick(7.5)
A.answerCastWhyText('sefu said so', 'misconception', 'sefu_told')
check('…judged a misconception: the option that names it', A.MEASURE_WHY.options[cast().why].key === 'sefu_told' && cast().whyText === null)

/* 9 · the save carries the mould ------------------------------------------------- */
climbing()
tick(2)
chargeWith(FIVE, 9)
A.castPour()
tick(7.5)
const castSnap = roundTrip(S.snapshot(w(), null))
check('the snapshot carries the cast record and its clock', castSnap.s.supply.cast.pours.length === 1 && typeof castSnap.s.supply.pouredAt === 'number')
A.resetWorld()
S.restoreWorld(castSnap)
check('restore: the short cast is still in the mould, settled', A.mouldLookOf(w()) === 'short' && cast().pours[0].dry === 9 && !w().poured)
A.castBack()
check('…and the child can still take it back', bench().recasts === 1 && bench().phase === 'matching')

const a1 = roundTrip(castSnap)
delete a1.s.supply.cast
delete a1.s.supply.pouredAt
delete a1.s.supply.bench.recasts
delete a1.s.supply.bench.castDry
A.resetWorld()
S.restoreWorld(a1)
check('an A1 save (no cast block): the bench comes back whole with an empty record', bench()?.phase === 'charged' && bench().recasts === 0 && bench().castDry === 0 && cast().pours.length === 0 && w().supply.pouredAt === null && A.mouldLookOf(w()) === 'waiting')

const badCast = roundTrip(castSnap)
badCast.s.supply.cast = { pours: [{ dry: 'nine' }], why: 'x' }
badCast.s.supply.pouredAt = 'yesterday'
A.resetWorld()
S.restoreWorld(badCast)
check('a damaged cast block: the bench is kept, the record starts again', bench()?.phase === 'charged' && cast().pours.length === 0 && cast().why === -1 && w().supply.pouredAt === null)

/* 10 · what the review of A2 found ------------------------------------------------- */
// The fire drops before the charge is sent: Sefu does not go on saying he has the heat.
climbing()
tick(2)
A.setWorld((s) => ({ air: 0, furnace: { ...s.furnace, temp: 114 } }))
check('the bench open, the fire fallen to 114 °C: Sefu says the fire has dropped, not "We have the heat"', F.sefuMood(w()) === 'cold', F.sefuMood(w()))
check('…and the furnace is not called ready', !A.furnaceReady(w()))
A.setWorld((s) => ({ air: 1, furnace: { ...s.furnace, temp: 1200 } }))
check('…back at heat it is ready, and he asks again', A.furnaceReady(w()) && F.sefuMood(w()) === 'heat')
chargeWith(M.SCRAP, 10)
A.setWorld((s) => ({ air: 0, furnace: { ...s.furnace, temp: 600 } }))
check('…Ploob\'s line for a dropped fire names the furnace, the fuel and the air (not only the bellows)', /furnace/.test(U.benchHint(w(), 'explorer') ?? '') && /fuel/.test(U.benchHint(w(), 'explorer') ?? '') && /air/.test(U.benchHint(w(), 'explorer') ?? ''), U.benchHint(w(), 'explorer'))
A.setWorld((s) => ({ air: 1, furnace: { ...s.furnace, temp: 1200 } }))
A.castPour()
tick(1)
check('while the channel runs Sefu says to stand clear, not to say the word', F.sefuMood(w()) === 'pouring' && /Stand clear/.test(F.sefuLines(w())[0]), F.sefuMood(w()))

// Nobody on the errand: Sefu never mentions Sela's copper, and keeps his bronze line.
atCopperHeat({ poured: true, across: false })
A.openBench('bench')
A.leaveRoom()
check('not on the errand, bench opened: Sefu keeps the relight\'s own line', F.sefuMood(w()) === 'poured', F.sefuMood(w()))
A.setWorld({ whys: [0, 1, 1] })
check('…and his bronze line once the third why is answered', F.sefuMood(w()) === 'bench', F.sefuMood(w()))
atCopperHeat({ poured: true })
check('on the errand with an old pour he still says "You left me good copper"', F.sefuMood(w()) === 'left')

// A child who skipped the belt: once the bench is open, the cart's own steps lead the plate.
climbing()
A.setWorld({ step: 'clear', fed: [] })
tick(2)
check('heat with the relight step still behind: the cart\'s step is measure', w().step === 'clear' && A.currentStepId(w()) === 'measure', `${w().step} → ${A.currentStepId(w())}`)
chargeWith(M.SCRAP, 10)
A.castPour()
tick(7.5)
A.answerCastWhy(0)
check('…and after the kit it is the straps, not the belt', A.currentStepId(w()) === 'test', A.currentStepId(w()))

// The curve is the climb to heat, not the minutes at the bench.
climbing()
A.setWorld((s) => ({ furnace: { ...s.furnace, lit: false, temp: 900 } }))
A.feedFurnace('charcoal') // the store's own verb: it starts the curve's clock
tick(4)
const curveAtHeat = w().curve.length
tick(60)
check('while Sefu holds the pour the curve stops growing', !!w().supply && !w().poured && w().curve.length === curveAtHeat && curveAtHeat > 1, `${curveAtHeat} → ${w().curve.length}`)
chargeWith(M.SCRAP, 10)
A.castPour()
tick(7.5)
tick(3)
check('…and carries on once the pour is made', w().poured && w().curve.length > curveAtHeat, `${curveAtHeat} → ${w().curve.length}`)

// The judge is told whether the beam was level.
climbing()
tick(2)
chargeWith([M.SCRAP[0]], 14)
A.castPour()
tick(7.5)
check('a kit cast by a guess: the judge\'s facts say the beam was not level and the scrap never reached the mark', A.castFacts(w()).beam_was_level === false && A.castFacts(w()).scrap_reached_the_mark === false && M.lastPour(cast()).guess)
climbing()
tick(2)
chargeWith(M.SCRAP, 10)
A.castPour()
tick(7.5)
check('…and for a measured kit, that it was', A.castFacts(w()).beam_was_level === true)

// Carrying scrap: a station does not open and leave the piece hanging.
climbing()
tick(2)
A.setWorld({ held: 'scrap.a' })
A.openMould()
A.openBench('bench')
check('holding a piece: neither the mould nor the bench opens, and the piece stays in hand', w().room === 'none' && w().held === 'scrap.a')

// Damaged saves: a lost record never swallows pours, and never makes a second kit.
climbing()
tick(2)
chargeWith(FIVE, 9)
A.castPour()
tick(7.5)
A.castBack()
const lost = roundTrip(S.snapshot(w(), null))
lost.s.supply.cast.why = 9
A.resetWorld()
S.restoreWorld(lost)
check('a bench that had been back once, its record unreadable: the count of returns starts again with the record', bench().recasts === 0 && bench().castDry === 0 && cast().pours.length === 0 && bench().dry === 9)
A.setWorld({ zone: 'foundry', phase: 'play' })
A.benchDrop('scrap.nugget')
A.benchDone()
A.balanceAdd()
A.balanceToFire()
A.setWorld((s) => ({ air: 1, furnace: { ...s.furnace, lit: true, fuel: 'charcoal', temp: 1200 } }))
A.castPour()
check('…so the next pour is seen, not swallowed', cast().pours.length === 1 && A.mouldLookOf(w()) === 'run', A.mouldLookOf(w()))

climbing()
tick(2)
chargeWith(M.SCRAP, 10)
A.castPour()
tick(7.5)
const kitSave = roundTrip(S.snapshot(w(), null))
kitSave.s.supply.bench.dry = -1
A.resetWorld()
S.restoreWorld(kitSave)
check('a kit on the record beside an unreadable bench: the kit is kept', M.kitCast(cast()) && cast().pours.length === 1 && A.mouldLookOf(w()) === 'full')
A.castPour()
check('…and there is still one kit', cast().pours.length === 1)

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
