/**
 * The Motion Yard's economy, tested out of band.
 *
 * Same technique as `verify-challenge.mjs`: esbuild the pure modules and
 * assert against them in Node. Two things are being checked that nothing else
 * can check.
 *
 * The first is that the **physics is honest**. This economy's whole claim on a
 * learner's attention is that ½mv² and mgh are real, so a cost function that
 * merely *looked* like energy would be worse than no game at all — it would
 * teach a wrong relationship with the authority of a scoreboard behind it.
 *
 * The second is that every brief is **winnable, affordable, missable, and not
 * already won**, checked by sweeping the dials the budget actually permits and
 * running each setting through the cabinet's own `solveFlight`. The Sugar Line
 * shipped three briefs that failed one of those four and nobody could have
 * told by reading them.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const OUT = '/tmp/motionchallenge-bundle.mjs'
fs.writeFileSync(
  '/tmp/motionchallenge-barrel.ts',
  `export * from '${path.resolve('src/lib/challenge')}'
export * as MC from '${path.resolve('src/lib/motionchallenge')}'
export * as YARD from '${path.resolve('src/lib/yard')}'
export * as MOTION from '${path.resolve('src/lib/motion')}'
`,
)
execSync(
  `npx esbuild /tmp/motionchallenge-barrel.ts --bundle --format=esm --outfile=${OUT} --alias:@=${path.resolve('src')}`,
  { stdio: 'pipe' },
)
const M = await import(OUT)
const { MC, YARD, MOTION } = M

let fails = 0
let count = 0
const check = (name, ok, extra = '') => {
  count += 1
  if (!ok) fails += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)
}
const near = (a, b, tol) => Math.abs(a - b) <= tol

/* ------------------------------------------------------------------ */
/* The physics is real, not a costume                                  */
/* ------------------------------------------------------------------ */
{
  // 100 g at 10 m/s is 5 J. If this line is wrong the whole feature teaches a
  // falsehood, so it is checked against arithmetic done by hand.
  check('½mv² is ½mv²', near(MC.kineticEnergy(10, 'steel'), 5, 1e-9), String(MC.kineticEnergy(10, 'steel')))
  check('and for the wooden ball', near(MC.kineticEnergy(10, 'wood'), 1, 1e-9))

  const v1 = MC.kineticEnergy(3, 'steel')
  const v2 = MC.kineticEnergy(6, 'steel')
  check(
    'doubling the speed quadruples the cost — the lesson the game exists to teach',
    near(v2 / v1, 4, 1e-9),
    `${v1.toFixed(3)} J → ${v2.toFixed(3)} J`,
  )
  check(
    'and doubling the mass only doubles it',
    near(MC.kineticEnergy(5, 'steel') / MC.kineticEnergy(5, 'wood'), 5, 1e-9),
    'steel is 5× the wooden ball',
  )

  check('mgh is mgh', near(MC.liftEnergy(2, 9.81, 'steel'), 0.1 * 9.81 * 2, 1e-9))
  check(
    'lifting is cheaper on the Moon',
    MC.liftEnergy(1, 1.62, 'steel') < MC.liftEnergy(1, 9.81, 'steel'),
  )
  check(
    'and dearer on Jupiter, by exactly the ratio of the gravities',
    near(MC.liftEnergy(1, 24.79, 'steel') / MC.liftEnergy(1, 9.81, 'steel'), 24.79 / 9.81, 1e-9),
  )

  check('nothing costs a negative amount', MC.kineticEnergy(-4, 'steel') === 0)
}

/* ------------------------------------------------------------------ */
/* The ceiling matches the dial it is capping                          */
/* ------------------------------------------------------------------ */
{
  /* The Sugar Line shipped a cost computed on a different scale from the
     control it capped, so the dial stopped at a number the learner was not
     looking at. Here the inverse is found by bisecting the cabinet's own
     `launchSpeed`, and this is the check that it really inverts it. */
  for (const launcher of ['slingshot', 'catapult', 'trebuchet']) {
    const meta = YARD.LAUNCHER_BY_ID[launcher]
    let worst = 0
    for (const g of [1.62, 9.81, 24.79]) {
      for (let i = 0; i <= 8; i++) {
        const power = meta.power.min + ((meta.power.max - meta.power.min) * i) / 8
        const speed = YARD.launchSpeed(launcher, power, g, MC.massKg('steel'))
        const back = MC.powerForSpeed(launcher, speed, g, 'steel')
        worst = Math.max(worst, Math.abs(back - power))
      }
    }
    check(
      `  ${launcher}: the power ceiling round-trips through the real speed model`,
      worst < meta.power.step / 4,
      `worst error ${worst.toFixed(5)} vs step ${meta.power.step}`,
    )
  }

  check(
    'a speed past the launcher’s limit pins the dial at its maximum',
    MC.powerForSpeed('slingshot', 999, 9.81, 'steel') === YARD.LAUNCHER_BY_ID.slingshot.power.max,
  )
  check(
    'and an empty bank pins it at its minimum',
    MC.powerForSpeed('slingshot', 0, 9.81, 'steel') === YARD.LAUNCHER_BY_ID.slingshot.power.min,
  )

  // The trebuchet is thrown by a falling weight, so its ceiling must move with
  // gravity. A launcher whose dial capped identically everywhere would be
  // quietly contradicting the cabinet's own headline fact about it.
  const onEarth = MC.powerForSpeed('trebuchet', 6, 9.81, 'steel')
  const onMoon = MC.powerForSpeed('trebuchet', 6, 1.62, 'steel')
  check(
    'the trebuchet needs a heavier counterweight on the Moon for the same speed',
    onMoon > onEarth,
    `${onEarth.toFixed(2)} kg on Earth vs ${onMoon.toFixed(2)} kg on the Moon`,
  )
}

/* ------------------------------------------------------------------ */
/* What a bank buys                                                    */
/* ------------------------------------------------------------------ */
{
  const bank = { energy: 5 }
  const steel = MC.capsFor(bank, { mass: 'steel', g: 9.81, launcher: 'slingshot' })
  const wood = MC.capsFor(bank, { mass: 'wood', g: 9.81, launcher: 'slingshot' })

  check('five joules launches the steel ball at 10 m/s', near(steel.speed, 10, 1e-9), steel.speed.toFixed(3))
  check(
    'the same five joules send the wooden ball faster, by √5',
    near(wood.speed / steel.speed, Math.sqrt(5), 1e-9),
    `${steel.speed.toFixed(2)} vs ${wood.speed.toFixed(2)} m/s`,
  )

  /* Measured on a bank small enough for the physics to be what limits it.
     At five joules both planets saturate the cabinet's own two-metre drop rig
     and tie — which is correct behaviour and a useless test, so the first
     version of this check failed for the right reason. */
  const thin = { energy: 1 }
  const moon = MC.capsFor(thin, { mass: 'steel', g: 1.62, launcher: 'slingshot' })
  const jupiter = MC.capsFor(thin, { mass: 'steel', g: 24.79, launcher: 'slingshot' })
  check(
    'the same bank lifts the ball higher on the Moon',
    moon.height > jupiter.height,
    `${moon.height.toFixed(2)} m vs ${jupiter.height.toFixed(2)} m`,
  )
  check(
    'and the rig’s own two metres is what stops it, not the budget',
    MC.capsFor({ energy: 5 }, { mass: 'steel', g: 1.62, launcher: 'slingshot' }).height ===
      MC.DIAL_LIMITS.drop.max,
  )
  check(
    'and the drop ceiling never exceeds the cabinet’s own',
    moon.height <= MC.DIAL_LIMITS.drop.max + 1e-9,
    `${moon.height.toFixed(2)} m vs ${MC.DIAL_LIMITS.drop.max} m`,
  )
  check(
    'nor does the push ceiling',
    MC.capsFor({ energy: 999 }, { mass: 'steel', g: 9.81, launcher: 'slingshot' }).push <=
      MC.DIAL_LIMITS.push.max + 1e-9,
  )
  check('an empty bank buys nothing', MC.capsFor({ energy: 0 }, { mass: 'steel', g: 9.81, launcher: 'slingshot' }).speed === 0)
}

/* ------------------------------------------------------------------ */
/* A shot can be taken twice                                           */
/* ------------------------------------------------------------------ */
{
  /* The bug the Sugar Line had to fix twice: priced at the raw value, a
     full-strength trial costs the entire grant and the comparison the cabinet
     teaches is unaffordable by construction. */
  for (const preset of MC.MOTION_CHALLENGES) {
    const c = preset.build(11)
    const setup = MC.parseSetup(c.setup)
    const g = MOTION.WORLD_BY_ID[setup.world].g
    const caps = MC.capsFor(c.budget, { mass: setup.mass, g, launcher: setup.launcher })
    const flatOut = MC.trialCost({ kind: 'launch', mass: setup.mass, g, speed: caps.speed })
    const afterOne = M.drawDown(c.budget, flatOut)
    check(
      `  ${preset.id}: affords a second shot at the same setting`,
      M.canAfford(afterOne, flatOut),
      `${c.budget.energy} J → ${afterOne.energy} J, shot costs ${flatOut.energy} J`,
    )
  }
}

/* ------------------------------------------------------------------ */
/* Every brief is well formed and survives a link                      */
/* ------------------------------------------------------------------ */
{
  check('there are challenges to play', MC.MOTION_CHALLENGES.length >= 5, String(MC.MOTION_CHALLENGES.length))
  for (const preset of MC.MOTION_CHALLENGES) {
    const c = preset.build(4242)
    check(`  ${preset.id}: is a well-formed challenge`, c.cabinet === 'motion' && c.goal.target > 0)
    const round = M.decodeChallenge(M.encodeChallenge(c))
    check(`  ${preset.id}: survives a link`, !!round && round.goal.target === c.goal.target)
    check(
      `  ${preset.id}: its setup survives too`,
      !!round && MC.parseSetup(round.setup).world === MC.parseSetup(c.setup).world,
    )
    check(
      `  ${preset.id}: its metric is one the cabinet displays`,
      MC.metricUnit(c.goal.metric) !== '',
      c.goal.metric,
    )
    check(
      `  ${preset.id}: and the stated unit matches`,
      c.goal.unit === MC.metricUnit(c.goal.metric),
      `${c.goal.unit} vs ${MC.metricUnit(c.goal.metric)}`,
    )
  }

  const forExplorer = MC.challengesForBand('explorer')
  check('an explorer gets only explorer briefs', forExplorer.every((c) => c.band === 'explorer'))
  check('an analyst gets everything', MC.challengesForBand('analyst').length === MC.MOTION_CHALLENGES.length)
  check(
    'and there is something at every band',
    forExplorer.length > 0 && MC.challengesForBand('scientist').length > forExplorer.length,
  )
}

/* ------------------------------------------------------------------ */
/* Every brief can be won, and none of them for free                   */
/* ------------------------------------------------------------------ */

/**
 * Sweep the dials the budget permits, through the cabinet's own flight solver.
 *
 * `solveFlight` is what the sim itself calls, so a brief that passes here is
 * reachable with the real physics rather than with a model written to agree
 * with the answer.
 */
{
  function sweep(c) {
    const setup = MC.parseSetup(c.setup)
    const g = MOTION.WORLD_BY_ID[setup.world].g
    const caps = MC.capsFor(c.budget, { mass: setup.mass, g, launcher: setup.launcher })
    const meta = YARD.LAUNCHER_BY_ID[setup.launcher]
    const powerMax = Math.min(caps.power, meta.power.max)
    const angles = setup.launcher === 'trebuchet' ? [45] : []
    if (!angles.length) for (let a = MC.DIAL_LIMITS.angle.min; a <= MC.DIAL_LIMITS.angle.max; a += 5) angles.push(a)

    const out = []
    for (let i = 0; i <= 16; i++) {
      const power = meta.power.min + ((powerMax - meta.power.min) * i) / 16
      if (power < meta.power.min) continue
      const v0 = YARD.launchSpeed(setup.launcher, power, g, MC.massKg(setup.mass))
      for (const angle of angles) {
        const flight = YARD.solveFlight(v0, angle, g, (d) => YARD.groundAlongRange('outdoors', d))
        // Read through the same registry the HUD reads, on a reading shaped
        // exactly as the page would record one.
        const reading = { kind: 'launch', x: flight.range, t: flight.T, speed: v0 }
        out.push({
          power,
          angle,
          v0,
          value: MC.metricValue(reading, c.goal.metric),
          cost: MC.trialCost({ kind: 'launch', mass: setup.mass, g, speed: v0 }),
        })
      }
    }
    return out
  }

  for (const preset of MC.MOTION_CHALLENGES) {
    const c = preset.build(7)
    const grid = sweep(c)
    const winners = grid.filter((r) => r.value !== null && M.meetsGoal(c.goal, r.value))
    check(`  ${preset.id}: is winnable at all`, winners.length > 0, `${grid.length} settings tried`)
    check(
      `  ${preset.id}: and affordable on its own budget`,
      winners.some((r) => M.canAfford(c.budget, r.cost)),
      `${winners.filter((r) => M.canAfford(c.budget, r.cost)).length}/${winners.length} winning settings`,
    )
    check(
      `  ${preset.id}: can be missed`,
      grid.some((r) => r.value === null || !M.meetsGoal(c.goal, r.value)),
    )
    // The weakest legal setting must not already satisfy it, or there is
    // nothing to work out.
    const idle = grid[0]
    check(
      `  ${preset.id}: is not already won at the lowest setting`,
      !(idle && idle.value !== null && M.meetsGoal(c.goal, idle.value)),
      `weakest shot reads ${idle?.value?.toFixed(2)}`,
    )
  }
}

console.log(`\n${count - fails}/${count} motion challenge checks passed`)
process.exit(fails ? 1 : 0)
