/**
 * Door 3's science, tested out of band.
 *
 * The wood cut, the starch bank and the night shift are claims about the
 * model, and the model is pure — so they are proved here in Node against the
 * bundled sim, the way the carbon audit and the Hatches' water are. Nothing
 * here needs a browser, and nothing here can be satisfied by the HUD.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const OUT = '/tmp/sugarsim-bundle-suite.mjs'
fs.writeFileSync(
  '/tmp/line-barrel.ts',
  `export * from '${path.resolve('src/lib/sugarsim')}'
export * from '${path.resolve('src/lib/sugarline')}'
export * from '${path.resolve('src/lib/hatches')}'
export * from '${path.resolve('src/lib/sugarchallenge')}'
export * from '${path.resolve('src/lib/campaign')}'
`,
)
execSync(`npx esbuild /tmp/line-barrel.ts --bundle --format=esm --outfile=${OUT} --alias:@=${path.resolve('src')}`, {
  stdio: 'pipe',
})
// `lib/campaign` reads persisted progress through `lib/persist`, which probes
// localStorage at import; in Node there is none, and the memory fallback is
// exactly what a suite wants.
const M = await import(OUT)

let fails = 0
const check = (name, ok, extra = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`
  console.log(line)
  if (!ok) fails += 1
}

const mk = (over = {}) => {
  const s = M.createSugarSim()
  s.started = true
  Object.assign(s, over)
  return s
}
/** Advance by plant hours through the real step (0.25 s frames at the live clock). */
const tick = (s, plantHours) => {
  const per = 0.25 * M.CLOCK_LIVE_HOURS_PER_SECOND
  for (let h = 0; h < plantHours; h += per) M.stepSim(s, 0.25)
  return M.simSolve(s)
}

/* ------------------------------------------------------------------ */
/* The knife has two blades                                           */
/* ------------------------------------------------------------------ */
{
  const s = mk()
  M.setCut(s, 'phloem')
  check('cutting the bark ring girdles and leaves the wood whole', s.girdled && !s.xylemCut)
  M.setCut(s, 'xylem')
  check('cutting the wood heals the ring — one cut at a time', !s.girdled && s.xylemCut)
  check('cutOf reads it back', M.cutOf(s) === 'xylem')
  M.setCut(s, 'none')
  check('and none is none', M.cutOf(s) === 'none' && !s.girdled && !s.xylemCut)
}
{
  // The bark ring: sugar stops at once, water and the factory carry on.
  const ring = mk()
  M.setCut(ring, 'phloem')
  const r0 = M.simSolve(ring)
  const r3 = tick(ring, 3)
  check('bark ring cut: export below the cut is zero at once', r0.exportRate === 0)
  check('bark ring cut: the factory keeps making sugar', r3.production > 15, r3.production.toFixed(1))
  check('bark ring cut: the leaves stay firm for hours', ring.turgor > 0.9, ring.turgor.toFixed(2))
  // The wood: the leaf loses its water, then the line fails from the top.
  const wood = mk()
  M.setCut(wood, 'xylem')
  const w0 = M.simSolve(wood)
  check('wood cut: the leaf sees no root water', w0.leaf.uptake === 0, String(w0.leaf.uptake))
  check('wood cut: sugar still leaves at first — the pipe is whole', w0.exportRate > 8, w0.exportRate.toFixed(1))
  tick(wood, 3)
  const w3 = M.simSolve(wood)
  check('wood cut: after three plant hours the leaves are limp', wood.turgor < M.FIRM_TURGOR, wood.turgor.toFixed(2))
  check('wood cut: and export has fallen with them', w3.exportRate < w0.exportRate * 0.5, `${w0.exportRate.toFixed(1)} → ${w3.exportRate.toFixed(1)}`)
  tick(wood, 5)
  const w8 = M.simSolve(wood)
  check('wood cut: by eight hours the line has stalled', w8.exportRate < 0.2 && wood.turgor < 0.2, `${w8.exportRate.toFixed(2)} at turgor ${wood.turgor.toFixed(2)}`)
  check('wood cut: the stomata have shut, so production fell too', w8.production < w0.production * 0.6, `${w0.production.toFixed(1)} → ${w8.production.toFixed(1)}`)
  check('the bottleneck finder names the cut wood', M.findBottleneck(M.simSpecimen(wood), M.simEnv(wood), wood.carbon, M.simSurgery(wood)).id === 'xylem')
  const healed = mk()
  M.setCut(healed, 'xylem')
  tick(healed, 3)
  M.setCut(healed, 'none')
  tick(healed, 5)
  // The plain lab's turgor is a nudge, not the Hatches' water balance: a
  // healed leaf holds where a cut one collapses, and only the pot decides
  // whether it stands back up. That is the honest claim.
  check('healing the wood halts the collapse — the leaf holds where a cut one goes flat', healed.turgor > 0.3 && healed.turgor > wood.turgor + 0.25, `healed ${healed.turgor.toFixed(2)} vs cut ${wood.turgor.toFixed(2)}`)
}

/* ------------------------------------------------------------------ */
/* The bank                                                            */
/* ------------------------------------------------------------------ */
{
  const s = mk()
  const max = M.simSpecimen(s).starchMax
  M.bankStarch(s, 38)
  check('banking 38 mg puts 38 mg of starch in the leaf', Math.abs(s.carbon.leafStarch - 38) < 1e-9)
  M.bankStarch(s, 1000)
  check('the bank is clamped to what the leaf can hold', s.carbon.leafStarch === max, `${s.carbon.leafStarch} / ${max}`)
  check('a full grant of light banks 60 mg', M.bankFromLight(M.NIGHT_LIGHT_GRANT) === 60)
  check('half the light banks half the starch — the jar reads straight', M.bankFromLight(M.NIGHT_LIGHT_GRANT / 2) === 30)
}

/* ------------------------------------------------------------------ */
/* The night                                                           */
/* ------------------------------------------------------------------ */
const night = (bank, tempC, hours = 10) => {
  const s = mk({ night: true, tempC })
  M.bankStarch(s, bank)
  const spec = M.buildNight(8081, 'temperate', hours)
  const run = M.startDay(s, spec, 1)
  s.tempC = tempC
  let guard = 0
  while (!run.done && guard++ < 20000) M.stepSim(s, 0.25)
  return { run, tally: M.dayTally(run, s.turgor), s }
}
{
  const spec = M.buildNight(8081, 'temperate', 10)
  check('a night runs from dusk for ten plant hours', spec.from === M.DUSK && spec.to === M.DUSK + 10 && spec.night === true)
  const w = M.weatherAt(spec, spec.from + 3)
  check('with the sun off the whole way', w.light === 0 && w.night === true)
  const s = mk({ tempC: 9 })
  M.startDay(s, spec, 1)
  M.stepSim(s, 0.25)
  check('the night leaves the thermostat in the learner\'s hand', s.tempC === 9, String(s.tempC))
  check('and the day would not', (() => { const d = mk({ tempC: 9 }); M.startDay(d, M.buildDay(1, 'temperate'), 1); return d.tempC !== 9 })())
}
{
  const a = night(38, 20)
  const b = night(60, 20)
  check('a bigger bank sends more down the line overnight', b.tally.exportedMg > a.tally.exportedMg + 5, `${a.tally.exportedMg} vs ${b.tally.exportedMg}`)
  const cool = night(38, 10)
  const warm = night(38, 28)
  check('a cool night sends more than a warm one from the same bank', cool.tally.exportedMg > warm.tally.exportedMg + 5, `${cool.tally.exportedMg} vs ${warm.tally.exportedMg}`)
  const huge = night(95, 8)
  const mild = night(95, 20)
  check('but with a big bank the coldest night is not the best — cold sap is thick sap', mild.tally.exportedMg > huge.tally.exportedMg, `${huge.tally.exportedMg} (8 °C) vs ${mild.tally.exportedMg} (20 °C)`)
  check('the tally reads the exported total as the night\'s metric', M.dayMetricValue(a.tally, 'sugarNight') === a.tally.exportedMg)
  check('the night\'s advice speaks of the bank', /starch|bank/i.test(a.tally.advice))
}

/* ------------------------------------------------------------------ */
/* The levels are reachable, and not free                              */
/* ------------------------------------------------------------------ */
{
  const l1 = M.SUGAR_CHALLENGE_BY_ID['night-shift'].build(1)
  const full = night(M.bankFromLight(l1.budget.light), 20)
  const poor = night(M.bankFromLight(l1.budget.light * 0.5), 20)
  const poorCool = night(M.bankFromLight(l1.budget.light * 0.5), 8)
  check('level 1: a full bank at a mild night hits the target', full.tally.exportedMg >= l1.goal.target, `${full.tally.exportedMg} ≥ ${l1.goal.target}`)
  check('level 1: half a bank at a mild night misses', poor.tally.exportedMg < l1.goal.target, `${poor.tally.exportedMg} < ${l1.goal.target}`)
  check('level 1: the same half bank on a cool night gets closer — the lever is real', poorCool.tally.exportedMg > poor.tally.exportedMg + 3, `${poor.tally.exportedMg} → ${poorCool.tally.exportedMg}`)
  const l3 = M.SUGAR_CHALLENGE_BY_ID['time-the-sugar'].build(1)
  const at = (tempC) => {
    const s = mk({ tempC, light: M.capsFor(l3.budget).light, soilWater: M.capsFor(l3.budget).water })
    tick(s, 1)
    return M.simSolve(s).velocity
  }
  const hits = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32].filter((t) => Math.abs(at(t) - l3.goal.target) <= l3.goal.tolerance)
  check('level 3: some temperature lands the sap in the band', hits.length >= 1, `hits at ${hits.join(', ')} °C`)
  check('level 3: the default 24 °C does not', Math.abs(at(24) - l3.goal.target) > l3.goal.tolerance, at(24).toFixed(2))
  check('level 3: the band is narrow enough to need the thermometer', hits.length <= 3)
  // The Line became door 4 when the Pond took door 2 (13 Sep 2026). Progress
  // is keyed by preset id, so the move cost no learner a hand-in.
  check('stage 4 has three levels, one per band', M.levelsOfStage(4).map((p) => p.band).join() === 'explorer,scientist,analyst')
  check('door 4 is the Line, and it is built on the map', M.CAMPAIGN_BY_ID[4].built === true && M.CAMPAIGN_BY_ID[4].tab === 'stem' && M.CAMPAIGN_BY_ID[4].name === 'The Line')
  check('the level-2 goal carries the leaves-firm condition', M.SUGAR_CHALLENGE_BY_ID['cut-the-ring'].build(1).condition === 'leafFirm')
  const ids = new Set(M.SUGAR_CHALLENGES.map((c) => c.id))
  check('every Line preset is found again from its own challenge', ['night-shift', 'cut-the-ring', 'time-the-sugar'].every((id) => ids.has(id) && M.presetIdFor(M.SUGAR_CHALLENGE_BY_ID[id].build(7)) === id))
}

console.log(`\n${fails === 0 ? 'ALL PASS' : `${fails} FAIL`}`)
process.exit(fails ? 1 : 0)
