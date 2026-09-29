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
`,
)
execSync(`npx esbuild /tmp/supply-store-barrel.ts --bundle --format=esm --outfile=${OUT} --alias:@=${path.resolve('src')} --define:import.meta.env={}`, { stdio: 'pipe' })
const { A, S, M } = await import(OUT)

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

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
