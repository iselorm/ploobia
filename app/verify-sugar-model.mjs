/**
 * The Sugar Line's science, tested out of band.
 *
 * The model is pure, so it does not need a browser to check — and checking it
 * here rather than through the HUD is the only way to assert the things that
 * actually matter: that the units are right, that the carbon balances, that a
 * full sink really does push back, and that cutting the phloem stops the sugar
 * without touching the water.
 *
 * Bundles `lib/sugarline.ts` with esbuild and asserts against it in Node —
 * the same technique that caught every wrong address in the periodic table.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const OUT = '/tmp/sugarline-bundle.mjs'
// esbuild wants a single entry point, so bundle a one-line barrel.
fs.writeFileSync(
  '/tmp/sugar-barrel.ts',
  `export * from '${path.resolve('src/lib/sugarline')}'
export * from '${path.resolve('src/lib/specimens')}'
export * from '${path.resolve('src/lib/ratelab')}'
export * from '${path.resolve('src/lib/sugarnarrate')}'
`,
)
execSync(
  `npx esbuild /tmp/sugar-barrel.ts --bundle --format=esm --outfile=${OUT} --alias:@=${path.resolve('src')}`,
  { stdio: 'pipe' },
)

const M = await import(OUT)

const results = []
let fails = 0
const check = (name, ok, extra = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`
  results.push(line)
  if (!ok) fails += 1
  console.log(line)
}
const near = (a, b, tol) => Math.abs(a - b) <= tol

const env = (over = {}) => ({
  light: 0.6,
  co2: 425 / 1500,
  tempC: 24,
  humidity: 0.55,
  soilWater: 0.7,
  turgor: 1,
  ...over,
})

/* ------------------------------------------------------------------ */
/* Units and chemistry                                                */
/* ------------------------------------------------------------------ */

check(
  'one µmol CO₂ fixed is 0.0300 mg of glucose (Mr 180.16 ÷ 6)',
  near(M.MG_GLUCOSE_PER_UMOL_CO2, 0.030027, 1e-5),
  M.MG_GLUCOSE_PER_UMOL_CO2.toFixed(6),
)

{
  // van 't Hoff: 240 g/L sucrose at 25 °C ≈ 1.74 MPa. Real phloem source
  // pressures are quoted at 1–1.5 MPa, so this is the right order.
  const p = M.osmoticPressure(240, 25)
  check('osmotic pressure of 240 g/L sucrose at 25 °C is 1.6–1.9 MPa', p > 1.6 && p < 1.9, `${p.toFixed(2)} MPa`)
  check('osmotic pressure is linear in concentration', near(M.osmoticPressure(120, 25) * 2, p, 1e-6))
}

check('sap is thicker when cold', M.viscosityFactor(5) > M.viscosityFactor(30))
check('viscosity factor is 1 at the reference temperature', near(M.viscosityFactor(20), 1, 1e-9))

/* ------------------------------------------------------------------ */
/* Every specimen behaves plausibly                                   */
/* ------------------------------------------------------------------ */

for (const sp of M.SPECIMENS) {
  const state = M.createCarbonState(sp)
  const solve = M.solveSugarLine(sp, env(), state, { girdled: false })

  check(
    `${sp.id}: translocation speed is in the measured range (0.2–4 m/h)`,
    solve.velocity > 0.2 && solve.velocity < 4,
    `${solve.velocity.toFixed(2)} m h⁻¹`,
  )
  check(
    `${sp.id}: export rate is positive and under the loading ceiling`,
    solve.exportRate > 0 && solve.exportRate <= sp.loadingMax + 1e-6,
    `${solve.exportRate.toFixed(1)} of ${sp.loadingMax} mg h⁻¹`,
  )
  check(
    `${sp.id}: source pressure exceeds sink pressure`,
    solve.sourcePressure > solve.sinkPressure,
    `${solve.sourcePressure.toFixed(2)} > ${solve.sinkPressure.toFixed(2)} MPa`,
  )
  const shares = solve.sinks.reduce((a, s) => a + s.share, 0)
  check(`${sp.id}: sink shares sum to 1`, near(shares, 1, 1e-6), shares.toFixed(6))
  check(
    `${sp.id}: production is a plausible whole-plant rate (2–120 mg h⁻¹)`,
    solve.production > 2 && solve.production < 120,
    `${solve.production.toFixed(1)} mg h⁻¹`,
  )
}

/* ------------------------------------------------------------------ */
/* The claims the cabinet actually makes                              */
/* ------------------------------------------------------------------ */

const bean = M.SPECIMEN_BY_ID.bean

{
  const state = M.createCarbonState(bean)
  const open = M.solveSugarLine(bean, env(), state, { girdled: false })
  const cut = M.solveSugarLine(bean, env(), state, { girdled: true })
  check('girdling stops the sugar dead', cut.exportRate === 0 && cut.velocity === 0)
  check(
    'girdling leaves the xylem completely alone',
    near(cut.leaf.transpiration, open.leaf.transpiration, 1e-9),
  )
  check('girdling does not stop photosynthesis itself', near(cut.production, open.production, 1e-9))
}

{
  // More light, more sugar — until something else becomes the constraint.
  const state = M.createCarbonState(bean)
  const dim = M.solveSugarLine(bean, env({ light: 0.1 }), state, { girdled: false })
  const bright = M.solveSugarLine(bean, env({ light: 0.9 }), state, { girdled: false })
  check('brighter light means more sugar made', bright.production > dim.production * 1.5)
}

{
  // Cold sap moves more slowly at the same pressure.
  const state = M.createCarbonState(bean)
  const warm = M.solveSugarLine(bean, env({ tempC: 28 }), state, { girdled: false })
  const cold = M.solveSugarLine(bean, env({ tempC: 8 }), state, { girdled: false })
  check('cold slows translocation', cold.velocity < warm.velocity, `${cold.velocity.toFixed(2)} < ${warm.velocity.toFixed(2)}`)
}

{
  // A drought plant cannot hold its sieve tubes pressurised.
  const state = M.createCarbonState(bean)
  const wet = M.solveSugarLine(bean, env(), state, { girdled: false })
  const dry = M.solveSugarLine(bean, env({ soilWater: 0.05, turgor: 0.15 }), state, { girdled: false })
  check('drought cuts the export rate', dry.exportRate < wet.exportRate * 0.75)
  check('drought lowers the source pressure', dry.sourcePressure < wet.sourcePressure)
}

{
  // A full store pushes back: same leaf, same light, slower line.
  const empty = M.createCarbonState(bean)
  const full = M.createCarbonState(bean)
  const rootIndex = bean.sinks.findIndex((s) => s.id === 'roots')
  const podIndex = bean.sinks.findIndex((s) => s.id === 'pods')
  full.sinkStore[rootIndex] = bean.sinks[rootIndex].capacity
  full.sinkStore[podIndex] = bean.sinks[podIndex].capacity
  const a = M.solveSugarLine(bean, env(), empty, { girdled: false })
  const b = M.solveSugarLine(bean, env(), full, { girdled: false })
  check(
    'a full store slows the whole line',
    b.exportRate < a.exportRate,
    `${b.exportRate.toFixed(1)} < ${a.exportRate.toFixed(1)} mg h⁻¹`,
  )
  check('a full store raises the pressure at the sink end', b.sinkPressure > a.sinkPressure)
  check('the model reports it as sink-limited', b.sinkLimited === true)
}

{
  // Night: the sun is off, the line keeps running on the leaf's starch bank.
  const state = M.createCarbonState(bean)
  state.leafStarch = bean.starchMax * 0.8
  state.leafSugar = 40
  const night = M.solveSugarLine(bean, env({ light: 0 }), state, { girdled: false })
  check('at night nothing is fixed', night.production === 0)
  check('at night the line still runs', night.exportRate > 0, `${night.exportRate.toFixed(1)} mg h⁻¹`)
  check('at night the leaf spends its starch', night.starchFlux < 0, night.starchFlux.toFixed(2))
  check('at night the plant is losing carbon overall', night.netGain < 0)
}

{
  // The books balance. Integrate an hour of plant time and check the audit.
  const state = M.createCarbonState(bean)
  const before = {
    leaf: state.leafSugar + state.leafStarch,
    sinks: state.sinkStore.reduce((a, b) => a + b, 0),
  }
  let steps = 0
  for (let t = 0; t < 3600; t += 1) {
    const solve = M.solveSugarLine(bean, env(), state, { girdled: false })
    M.stepCarbon(bean, state, solve, 1)
    steps += 1
  }
  const after = {
    leaf: state.leafSugar + state.leafStarch,
    sinks: state.sinkStore.reduce((a, b) => a + b, 0),
  }
  const stored = after.leaf - before.leaf + (after.sinks - before.sinks)
  const balance = state.totalFixed - state.totalRespired - stored
  check(
    'carbon in = carbon burnt + carbon kept, over an hour',
    Math.abs(balance) < Math.max(0.6, state.totalFixed * 0.06),
    `fixed ${state.totalFixed.toFixed(1)}, burnt ${state.totalRespired.toFixed(1)}, kept ${stored.toFixed(1)}, residual ${balance.toFixed(2)} mg over ${steps} steps`,
  )
  check('the sinks gained sugar over the hour', after.sinks > before.sinks)
  check('no store ever went negative', state.sinkStore.every((s) => s >= 0) && state.leafSugar >= 0)
  check(
    'no store ever exceeded its capacity',
    state.sinkStore.every((s, i) => s <= bean.sinks[i].capacity + 1e-9),
  )
}

{
  // The bottleneck finder has to name the thing that would actually help.
  const state = M.createCarbonState(bean)
  check(
    'in deep shade the bottleneck is light',
    M.findBottleneck(bean, env({ light: 0.03 }), state, { girdled: false }).id === 'light',
  )
  check(
    'with the ring cut the bottleneck is the cut',
    M.findBottleneck(bean, env(), state, { girdled: true }).id === 'girdle',
  )
  check(
    'in a drought the bottleneck is water',
    M.findBottleneck(bean, env({ soilWater: 0.02, turgor: 0.1 }), state, { girdled: false }).id === 'water',
  )
  const cold = M.findBottleneck(bean, env({ tempC: 4 }), state, { girdled: false })
  check('in the cold the bottleneck is temperature', cold.id === 'temp', cold.label)
}

{
  // A C4 plant should not care much about today's CO₂; a C3 plant should.
  const maize = M.SPECIMEN_BY_ID.maize
  const s1 = M.createCarbonState(maize)
  const s2 = M.createCarbonState(bean)
  const lift = (sp, st) =>
    M.solveSugarLine(sp, env({ co2: 0.9, light: 0.9 }), st, { girdled: false }).production /
    M.solveSugarLine(sp, env({ co2: 425 / 1500, light: 0.9 }), st, { girdled: false }).production
  const maizeLift = lift(maize, s1)
  const beanLift = lift(bean, s2)
  check(
    'extra CO₂ helps a C3 bean more than a C4 maize',
    beanLift > maizeLift,
    `bean ×${beanLift.toFixed(2)} vs maize ×${maizeLift.toFixed(2)}`,
  )
}

{
  // CAM: today's air barely matters, and everything is slow.
  const cactus = M.SPECIMEN_BY_ID.opuntia
  const st = M.createCarbonState(cactus)
  const s = M.solveSugarLine(cactus, env(), st, { girdled: false })
  const beanState = M.createCarbonState(bean)
  const b = M.solveSugarLine(bean, env(), beanState, { girdled: false })
  check('the cactus runs far slower than the bean', s.exportRate < b.exportRate * 0.6, `${s.exportRate.toFixed(1)} vs ${b.exportRate.toFixed(1)}`)
}

/* ------------------------------------------------------------------ */
/* The narration                                                       */
/* ------------------------------------------------------------------ */

/**
 * The narrator's whole claim is that it explains the result rather than
 * decorating it. That is only checkable here: through the HUD you can see that
 * *a* sentence was spoken, not that it named the constraint that was actually
 * limiting the line.
 */
{
  const st = M.createCarbonState(bean)

  // Deep shade: light must be the named constraint, and the suggestion must be
  // about light. A narrator that says "raise the CO2" to a plant in the dark
  // is worse than silence.
  const dark = env({ light: 0.05 })
  const shadeSolve = M.solveSugarLine(bean, dark, st, { girdled: false })
  const shadeNeck = M.findBottleneck(bean, dark, st, { girdled: false })
  const ctx = {
    specimen: bean,
    solve: shadeSolve,
    bottleneck: shadeNeck,
    measure: 'export',
    xVar: 'light',
    reading: { id: 1, xVar: 'light', x: 55, y: shadeSolve.exportRate, predicted: null },
    readings: [],
    prediction: null,
    night: false,
    girdled: false,
  }
  check('in deep shade the constraint named is light', shadeNeck.id === 'light', shadeNeck.id)
  const why = M.narrateResult(ctx)
  check('the result line quotes the measured number', why.includes(shadeSolve.exportRate.toFixed(1)), why.slice(0, 60))
  check('and gives the reason, not just the number', why.includes(shadeNeck.because), why.slice(-60))
  const next = M.narrateNext(ctx)
  check('the suggestion names light when light is the limit', /light/i.test(next), next.slice(0, 70))

  // Girdled: the explanation must say the ring is cut, and the suggestion must
  // be to heal it — the comparison that proves what the phloem was doing.
  const cut = { ...ctx, girdled: true, bottleneck: M.findBottleneck(bean, env(), st, { girdled: true }) }
  check('a girdled plant is explained by the cut ring', /ring is cut|severed/i.test(M.narrateResult(cut)))
  check('and the suggestion is to heal it', /heal/i.test(M.narrateNext(cut)))

  // Four points on one variable: finish the curve rather than open a new question.
  const four = {
    ...ctx,
    readings: [1, 2, 3, 4].map((i) => ({ id: i, xVar: 'light', x: i * 200, y: i, predicted: null })),
  }
  check('with four points it asks for the fifth', /one more|curve/i.test(M.narrateNext(four)), M.narrateNext(four).slice(0, 60))

  // Every line short enough to listen to.
  const lines = [
    M.narrateOpening(bean),
    M.narrateTrialStart({ measure: 'export', prediction: 9 }),
    why,
    next,
  ]
  check('every spoken line stays under 300 characters', lines.every((l) => l.length <= 300), String(Math.max(...lines.map((l) => l.length))))
  check('and none is empty', lines.every((l) => l.trim().length > 20))

  // The opening names this plant and where its sugar goes.
  const open = M.narrateOpening(bean)
  check('the opening names the specimen', /bean/i.test(open), open.slice(0, 70))
}

/* ------------------------------------------------------------------ */

console.log(`\n${results.length - fails}/${results.length} model checks passed`)
process.exit(fails ? 1 : 0)
