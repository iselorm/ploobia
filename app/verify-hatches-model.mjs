/**
 * The Hatches, out of band.
 *
 * Same technique as `verify-sugar-model.mjs`: esbuild the pure modules and
 * drive whole plant-days in Node. A day is the trial in this round, so the
 * things that have to be true are things no browser suite can settle in
 * under a minute: that light is never in the trade, that the ceiling really
 * is a ceiling, that the leaf's own reflexes still close the hatches under
 * it, that the water is conserved in millilitres, and — for every level —
 * that the brief is winnable, missable and not won by leaving the slider
 * alone. The tuning in `WATER_TUNE` was searched into place against the two
 * sentences at the top of the stage; the last block holds it there.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const OUT = '/tmp/hatches-bundle.mjs'
fs.writeFileSync(
  '/tmp/hatches-barrel.ts',
  `export * from '${path.resolve('src/lib/hatches')}'
export * from '${path.resolve('src/lib/hatchesReplay')}'
export * from '${path.resolve('src/lib/ratelab')}'
export * from '${path.resolve('src/lib/challenge')}'
export * from '${path.resolve('src/lib/sugarchallenge')}'
export * from '${path.resolve('src/lib/specimens')}'
export * as SIM from '${path.resolve('src/lib/sugarsim')}'
`,
)
execSync(
  `npx esbuild /tmp/hatches-barrel.ts --bundle --format=esm --outfile=${OUT} --alias:@=${path.resolve('src')}`,
  { stdio: 'pipe' },
)
const M = await import(OUT)

let fails = 0
let passes = 0
function check(name, ok, detail = '') {
  if (ok) passes++
  else fails++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

/** Run a day with a policy: (hour, weather, sim) → ceiling. */
function runDay(specimenId, habitat, seed, policy, hours = 12, dt = 1 / 30) {
  const sim = M.SIM.createSugarSim()
  M.SIM.loadSpecimen(sim, specimenId)
  sim.started = true
  const spec = M.buildDay(seed, habitat, hours)
  const run = M.startDay(sim, spec, 1)
  let guard = 0
  while (!run.done && guard++ < 200000) {
    sim.hatch = policy(run.hour, M.weatherAt(spec, run.hour), sim)
    M.SIM.stepSim(sim, dt)
  }
  return { sim, spec, run, tally: M.dayTally(run, sim.turgor) }
}

/* ================================================================== */
/* The weather                                                        */
/* ================================================================== */
{
  const a = M.buildDay(42, 'savanna')
  const b = M.buildDay(42, 'savanna')
  check('a day is a function of its seed', JSON.stringify(a) === JSON.stringify(b))
  const c = M.buildDay(43, 'savanna')
  check('and a different seed is a different day', a.wind.start !== c.wind.start || a.wind.humidity !== c.wind.humidity)
  check('the savanna wind is the Harmattan', a.wind.name === 'the Harmattan', a.wind.name)
  check('a temperate day names its own wind', M.buildDay(1, 'temperate').wind.name === 'a dry afternoon wind')
  const noon = M.weatherAt(a, 12)
  const dawn = M.weatherAt(a, 6)
  const night = M.weatherAt(a, 23)
  check('the sun climbs from dawn to noon', noon.light > dawn.light && dawn.light === 0)
  check('and is off at night', night.light === 0 && night.night)
  check('the wind is drier than the day around it', M.weatherAt(a, a.wind.start + 0.5).humidity < M.weatherAt(a, a.wind.start - 0.5).humidity)
  check('and pulls harder on the leaf (VPD)', M.weatherAt(a, a.wind.start + 0.5).vpdKpa > M.weatherAt(a, a.wind.start - 0.5).vpdKpa)
}

/* ================================================================== */
/* The hatch is a ceiling, and light is not in the trade              */
/* ================================================================== */
{
  const leaf = M.SPECIMEN_BY_ID.bean.leaf
  const base = { light: 0.8, co2: 425 / 1500, tempC: 24, humidity: 0.55, soilWater: 0.8, turgor: 1 }
  const open = M.solveLeaf(leaf, { ...base, hatch: 1 })
  const half = M.solveLeaf(leaf, { ...base, hatch: 0.5 })
  const shut = M.solveLeaf(leaf, { ...base, hatch: 0.02 })
  check('no ceiling is the plain lab', Math.abs(M.stomatalConductance(leaf, base) - open.conductance) < 1e-12)
  check('a ceiling caps the conductance', half.conductance < open.conductance && shut.conductance < half.conductance)
  check('the ceiling never opens the hatch past the plant', M.poreOpening(leaf, { ...base, hatch: 1.5 }) <= M.stomatalGates(leaf, base).plant + 1e-12)
  check('light reaching the leaf is the same open or shut', open.par === shut.par, `${open.par} vs ${shut.par}`)
  check('carbon inside the leaf is not', shut.ciPpm < half.ciPpm && half.ciPpm < open.ciPpm)
  check('so shutting the hatches costs sugar', shut.gross < 0.55 * open.gross, `${shut.gross.toFixed(2)} vs ${open.gross.toFixed(2)}`)
  check('and saves water', shut.transpiration < 0.1 * open.transpiration)
  // The plant's reflexes still apply under the ceiling.
  const wilting = M.stomatalGates(leaf, { ...base, turgor: 0.05 })
  check('a limp leaf cannot hold its hatches open', wilting.plant < 0.02, String(wilting.plant))
  const dry = M.stomatalGates(leaf, { ...base, tempC: 34, humidity: 0.12 })
  const mild = M.stomatalGates(leaf, base)
  check('dry air closes them part way on its own', dry.vpd < 0.5 && dry.vpd < mild.vpd, `${dry.vpd.toFixed(2)} vs ${mild.vpd.toFixed(2)}`)
  const cactus = M.SPECIMEN_BY_ID.opuntia.leaf
  check('a cactus keeps them shut by day', M.stomatalGates(cactus, base).cam < 0.2)
  check('and opens them at night', M.stomatalGates(cactus, { ...base, night: true }).cam > 0.7)
}

/* ================================================================== */
/* Water, in millilitres                                              */
/* ================================================================== */
{
  const bean = M.SPECIMEN_BY_ID.bean
  const gsMax = 0.2 + 0.8 * bean.leaf.stomatalDensity
  const ml = M.transpirationMlPerHour(gsMax, 1.5, bean.leafAreaM2)
  check('a wide-open bean leaf in 1.5 kPa air loses about ten mL an hour', ml > 6 && ml < 16, `${ml.toFixed(1)} mL h⁻¹`)
  check('nothing leaves a shut stoma', M.transpirationMlPerHour(0, 3, bean.leafAreaM2) === 0)
  check('drier air takes more', M.transpirationMlPerHour(0.5, 3, 0.03) > M.transpirationMlPerHour(0.5, 1, 0.03))

  // Conservation over a day: what left the leaf is what the pot lost plus
  // what the leaf itself is short, to within the integration's rounding.
  const { run } = runDay('bean', 'temperate', 7, () => 1)
  const potUsed = run.potCapacityMl * M.DAY_SOIL_WATER - run.potMl
  const balance = potUsed + run.leafDeficitMl - run.waterMl
  check('water is conserved across the day', Math.abs(balance) < 1.5, `${balance.toFixed(2)} mL unaccounted of ${run.waterMl.toFixed(1)}`)
  check('the pot drains through the day', run.potMl < run.potCapacityMl * M.DAY_SOIL_WATER)
}

/* ================================================================== */
/* The two sentences the tuning was searched against                  */
/* ================================================================== */
{
  for (const seed of [7, 11, 23, 99, 3]) {
    const open = runDay('bean', 'temperate', seed, () => 1)
    const half = runDay('bean', 'temperate', seed, () => 0.5)
    check(`bean, wide open, goes limp (seed ${seed})`, open.tally.wiltHours >= 0.9 && !open.tally.leafFirm, `${open.tally.wiltHours} h wilted, end ${open.tally.turgorAtEnd}`)
    check(`  and not before the wind`, open.tally.wiltedAt === null || open.tally.wiltedAt >= open.spec.wind.start - 0.5, `wilt ${open.tally.wiltedAt} wind ${open.spec.wind.start}`)
    check(`  at half it stays firm`, half.tally.leafFirm && half.tally.wiltHours < 1, `${half.tally.wiltHours} h, end ${half.tally.turgorAtEnd}`)
    check(`  and still makes most of the sugar`, half.tally.sugarMg > 0.8 * open.tally.sugarMg, `${half.tally.sugarMg} vs ${open.tally.sugarMg}`)
    const maize = runDay('maize', 'savanna', seed, () => 1)
    const third = runDay('maize', 'savanna', seed, () => 0.3)
    check(`maize in the Harmattan, wide open, goes limp (seed ${seed})`, maize.tally.wiltHours >= 1.5 && !maize.tally.leafFirm)
    check(`  and not before the wind`, maize.tally.wiltedAt === null || maize.tally.wiltedAt >= maize.spec.wind.start - 0.5, `wilt ${maize.tally.wiltedAt} wind ${maize.spec.wind.start}`)
    check(`  at a third it stays firm`, third.tally.leafFirm && third.tally.wiltHours < 0.6, `${third.tally.wiltHours} h`)
  }
  // Wilting is a shutdown, not a death: close the hatches and the leaf comes back.
  const recover = runDay('bean', 'temperate', 7, (h, w, sim) => (sim.turgor < 0.3 ? 0.05 : 1))
  check('a wilted leaf recovers once the hatches shut', recover.tally.leafFirm || recover.run.minTurgor < 0.35, `end ${recover.tally.turgorAtEnd}, min ${recover.run.minTurgor}`)
  check('the tally names the wilt and the wind', /wilt/.test(runDay('bean', 'temperate', 7, () => 1).tally.advice) && /wind/.test(runDay('bean', 'temperate', 7, () => 1).tally.advice))
}

/* ================================================================== */
/* Every level: winnable, missable, not already won                   */
/* ================================================================== */
{
  const levels = M.SUGAR_CHALLENGES.filter((p) => p.stage === 2)
  check('stage 2 has three levels', levels.length === 3 && levels.map((l) => l.level).join() === '1,2,3')
  for (const preset of levels) {
    for (const seed of [7, 23, 99]) {
      const c = preset.build(seed)
      const world = M.dayWorldOf(c)
      const cond = M.CONDITIONS[c.condition]
      const results = [1, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.25, 0.2, 0.15, 0.1, 0.05].map((ceil) => {
        const r = runDay(c.setup, world.habitat, seed, () => ceil, world.hours)
        return { ceil, value: M.dayMetricValue(r.tally, c.goal.metric), met: cond.met(r.tally), tally: r.tally }
      })
      const winners = results.filter((r) => M.meetsGoal(c.goal, r.value) && r.met)
      check(`${preset.id} (seed ${seed}): is winnable at some ceiling`, winners.length > 0, results.map((r) => `${r.ceil}:${r.value.toFixed(0)}${r.met ? '✓' : '✗'}`).join(' '))
      const idle = results[0]
      check(`  and not won by leaving the slider wide open`, !(M.meetsGoal(c.goal, idle.value) && idle.met), `open reads ${idle.value.toFixed(0)}, firm ${idle.met}`)
      check(`  and can be missed`, results.some((r) => !(M.meetsGoal(c.goal, r.value) && r.met)))
      const safest = M.safestCeiling(c.setup, M.buildDay(seed, world.habitat, world.hours))
      check(`  the replay finds a ceiling that keeps the leaf standing`, safest !== null && safest.tally.leafFirm, safest ? `${safest.ceiling} → ${safest.tally.sugarMg} mg` : 'none')
      // Thrift's reference is what a wide-open leaf loses; a real day can never
      // spend much more than it, so thrift stays a number between 0 and 1.
      check(`  the water reference is near what wide open loses`, Math.abs(idle.tally.waterMl - c.budget.water) / c.budget.water < 0.15, `${idle.tally.waterMl} vs ${c.budget.water}`)
    }
  }
  // Level 3's card compares the bean with the cactus on the same day.
  const cactus = M.cactusDay(7, 24)
  const bean = runDay('bean', 'desert', 7, () => 0.05, 24).tally
  check('the cactus beats the bean on sugar per water in the desert', cactus.mgPerMl > 2 * bean.mgPerMl, `${cactus.mgPerMl} vs ${bean.mgPerMl}`)
  check('and stays firm doing it', cactus.leafFirm)
}

/* ================================================================== */
/* Scoring a keep round                                               */
/* ================================================================== */
{
  const c = M.SUGAR_CHALLENGE_BY_ID['open-the-hatches'].build(7)
  const base = { challengeId: M.challengeId(c), best: 110, hit: true, trials: 1, spent: { water: 45 }, gathered: { ...c.budget }, seconds: 90 }
  const firm = M.scoreAttempt(c, { ...base, conditionMet: true })
  const limp = M.scoreAttempt(c, { ...base, conditionMet: false })
  check('a target met with the leaf firm is a hit', firm.hit && firm.total > 600)
  check('the same number with a limp leaf is not', !limp.hit && limp.total <= 600, String(limp.total))
  check('thrift rewards water left in the pot', M.scoreAttempt(c, { ...base, conditionMet: true, spent: { water: 20 } }).thrift > firm.thrift)
  const link = M.decodeChallenge(M.encodeChallenge(c))
  check('the level survives a link with its condition', link && link.condition === 'leafFirm' && link.loop === 'keep' && link.world === 'temperate:12')
}

console.log(`\n${passes}/${passes + fails} hatches model checks passed`)
process.exit(fails ? 1 : 0)
