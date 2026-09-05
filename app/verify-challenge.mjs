/**
 * The challenge spine, tested out of band.
 *
 * Same technique as `verify-sugar-model.mjs`: esbuild the pure module and
 * assert against it in Node. This is the only place the claims that actually
 * matter can be checked at all — that two people get the same world, that a
 * link survives being pasted into a chat app, that the score rewards reasoning
 * rather than grinding, and that a classroom and a pair of friends are the
 * same data structure.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const OUT = '/tmp/challenge-bundle.mjs'
fs.writeFileSync(
  '/tmp/challenge-barrel.ts',
  `export * from '${path.resolve('src/lib/challenge')}'
export * from '${path.resolve('src/lib/sugarchallenge')}'
export * from '${path.resolve('src/lib/ratelab')}'
export * from '${path.resolve('src/lib/sugarline')}'
export * from '${path.resolve('src/lib/specimens')}'
export * as SIM from '${path.resolve('src/lib/sugarsim')}'
`,
)
execSync(
  `npx esbuild /tmp/challenge-barrel.ts --bundle --format=esm --outfile=${OUT} --alias:@=${path.resolve('src')}`,
  { stdio: 'pipe' },
)
const M = await import(OUT)

let fails = 0
let count = 0
const check = (name, ok, extra = '') => {
  count += 1
  if (!ok) fails += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)
}

const base = () => ({
  v: M.CHALLENGE_VERSION,
  cabinet: 'photosynthesis',
  seed: 123456,
  setup: 'bean',
  band: 'scientist',
  goal: { metric: 'export', direction: 'atLeast', target: 18, tolerance: 0.5, unit: 'mg h⁻¹' },
  budget: { light: 800, co2: 600, water: 70 },
  gatherSeconds: 45,
  by: 'Kofi',
})

/* ---------------- one seed, one world ---------------- */
{
  const a = M.rngFor(42)
  const b = M.rngFor(42)
  const seqA = Array.from({ length: 200 }, () => a())
  const seqB = Array.from({ length: 200 }, () => b())
  check('the same seed gives the same world', seqA.every((v, i) => v === seqB[i]))

  const c = M.rngFor(43)
  const seqC = Array.from({ length: 200 }, () => c())
  check('a different seed gives a different one', seqA.some((v, i) => v !== seqC[i]))

  check('values stay in [0,1)', seqA.every((v) => v >= 0 && v < 1))
  // A generator that drifts toward one end makes a world that is not varied.
  const mean = seqA.reduce((s, v) => s + v, 0) / seqA.length
  check('and are not biased', Math.abs(mean - 0.5) < 0.08, mean.toFixed(3))
}

/* ---------------- room codes a teacher can read out ---------------- */
{
  const code = M.roomCode(999)
  check('a room code is five characters', code.length === 5, code)
  check('with no ambiguous glyphs', !/[AEIOU01IL]/.test(code), code)
  check('and is stable for a seed', M.roomCode(999) === code)
  // The round trip is what lets a teacher say a code aloud and everyone land
  // in the same world without a server telling them what it is.
  check(
    'a spoken code reproduces its world',
    M.seedFromCode('mango') === M.seedFromCode('MANGO '),
  )
  check('and different codes do not collide', M.seedFromCode('MANGO') !== M.seedFromCode('MANGU'))
}

/* ---------------- the link survives a chat app ---------------- */
{
  const c = base()
  const text = M.encodeChallenge(c)
  const back = M.decodeChallenge(text)
  check('a challenge round-trips through a link', !!back)
  check('  cabinet', back.cabinet === c.cabinet)
  check('  seed', back.seed === c.seed, `${c.seed} → ${back.seed}`)
  check('  setup', back.setup === c.setup)
  check('  band', back.band === c.band)
  check('  goal', JSON.stringify(back.goal) === JSON.stringify(c.goal))
  // Compared by content, not by key order: the encoder sorts keys on purpose
  // so that `challengeId` is stable however the author's object was built.
  // Insisting on order here would be testing the test, not the code.
  const sameBudget = (a, b) => {
    const ka = Object.keys(a).sort()
    const kb = Object.keys(b).sort()
    return ka.join() === kb.join() && ka.every((k) => a[k] === b[k])
  }
  check('  budget', sameBudget(back.budget, c.budget), JSON.stringify(back.budget))
  check(
    '  and its keys come back sorted, so the id is stable',
    Object.keys(back.budget).join() === Object.keys(back.budget).sort().join(),
  )
  check('  author', back.by === c.by)
  check('  gather length', back.gatherSeconds === c.gatherSeconds)
  check(
    'the link is short enough to paste',
    text.length < 140,
    `${text.length} chars: ${text.slice(0, 60)}…`,
  )
  // Comma is the field separator and is a legal sub-delimiter in a URL.
  check('it is URL-safe', !/[^A-Za-z0-9._~!*'(),%-]/.test(text), text.slice(0, 40))

  // A link from a future build must refuse rather than half-decode: a
  // challenge that silently becomes a DIFFERENT world scores nothing honestly.
  const future = M.encodeChallenge({ ...c, v: 99 })
  check('a link from another version is refused, not half-read', M.decodeChallenge(future) === null)
  check('garbage is refused', M.decodeChallenge('nonsense') === null)
  check('an unknown direction is refused', M.decodeChallenge(text.replace('atLeast', 'sideways')) === null)

  const id1 = M.challengeId(c)
  const id2 = M.challengeId(M.decodeChallenge(text))
  check('the id survives the round trip', id1 === id2, id1)
  check('and changes when the goal does', M.challengeId({ ...c, goal: { ...c.goal, target: 19 } }) !== id1)
  // The author is a label, not part of the challenge: two people setting the
  // same task must produce the same id, or a shared board splits in two.
  check('but not when only the author does', M.challengeId({ ...c, by: 'Ama' }) === id1)
}

/* ---------------- the goal ---------------- */
{
  const at = { metric: 'x', direction: 'atLeast', target: 18, tolerance: 0, unit: '' }
  check('atLeast: over the line hits', M.meetsGoal(at, 18.4))
  check('atLeast: exactly on it hits', M.meetsGoal(at, 18))
  check('atLeast: under it misses', !M.meetsGoal(at, 17.9))

  const most = { metric: 'x', direction: 'atMost', target: 5, tolerance: 0, unit: '' }
  check('atMost: under the line hits', M.meetsGoal(most, 4.2))
  check('atMost: over it misses', !M.meetsGoal(most, 5.1))

  const near = { metric: 'x', direction: 'near', target: 12, tolerance: 0.3, unit: '' }
  check('near: inside the band hits', M.meetsGoal(near, 12.25))
  check('near: on the edge hits', M.meetsGoal(near, 12.3))
  check('near: outside misses', !M.meetsGoal(near, 12.4))
  check('near: and it is two-sided', M.meetsGoal(near, 11.8) === true && !M.meetsGoal(near, 11.6))
}

/* ---------------- the score rewards reasoning ---------------- */
{
  const c = base()
  const attempt = (over) => ({
    challengeId: M.challengeId(c),
    best: 18.5,
    hit: true,
    trials: 2,
    spent: { light: 400, co2: 300, water: 35 },
    gathered: { light: 800, co2: 600, water: 70 },
    seconds: 60,
    ...over,
  })

  const good = M.scoreAttempt(c, attempt())
  check('a hit scores', good.hit && good.total > 0, String(good.total))
  check('and earns stars', good.stars >= 1, `${good.stars}★ / ${good.total}`)

  // The claim the whole feature rests on: fewer trials scores higher, because
  // fewer trials means the learner reasoned instead of sweeping the dials.
  const few = M.scoreAttempt(c, attempt({ trials: 1 }))
  const many = M.scoreAttempt(c, attempt({ trials: 6 }))
  check(
    'reaching it in one trial beats brute force in six',
    few.total > many.total,
    `${few.total} vs ${many.total}`,
  )
  check('and the trial term bottoms out rather than going negative', many.economy === 0)

  // Spending less of the budget scores higher, which is what makes a limiting
  // factor something you feel rather than something you are told.
  const thrifty = M.scoreAttempt(c, attempt({ spent: { light: 100, co2: 80, water: 10 } }))
  const wasteful = M.scoreAttempt(c, attempt({ spent: { light: 800, co2: 600, water: 70 } }))
  check(
    'hitting it on less scores higher than burning the lot',
    thrifty.total > wasteful.total,
    `${thrifty.total} vs ${wasteful.total}`,
  )

  // Speed is deliberately NOT a term. A cabinet that pays for fast fingers
  // stops paying for thinking.
  const slow = M.scoreAttempt(c, attempt({ seconds: 600 }))
  check('taking longer costs nothing', slow.total === good.total)

  // A miss still scores, because "way out" is framed everywhere else in this
  // codebase as the useful kind of wrong.
  const nearMiss = M.scoreAttempt(c, attempt({ best: 17, hit: false }))
  const wildMiss = M.scoreAttempt(c, attempt({ best: 2, hit: false }))
  check('a miss still scores something', nearMiss.total > 0, String(nearMiss.total))
  check('a near miss beats a wild one', nearMiss.total > wildMiss.total, `${nearMiss.total} vs ${wildMiss.total}`)
  check('but a miss never beats a hit', nearMiss.total < good.total)
  check('and a miss earns no stars', nearMiss.stars === 0)

  check('the score never exceeds 1000', M.scoreAttempt(c, attempt({ trials: 1, spent: { light: 0, co2: 0, water: 0 } })).total <= 1000)
  check('and never goes below 0', wildMiss.total >= 0)
}

/* ---------------- a room is many people on one seed ---------------- */
{
  const c = base()
  const mk = (player, trials, best) => ({
    player,
    attempt: {
      challengeId: M.challengeId(c),
      best,
      hit: best >= 18,
      trials,
      spent: { light: 400, co2: 300, water: 35 },
      gathered: { light: 800, co2: 600, water: 70 },
      seconds: 60,
    },
  })
  const board = M.rank([mk('Ama', 4, 18.2), mk('Kofi', 1, 18.2), mk('Yaw', 3, 9)], c)
  check('a room ranks everyone', board.length === 3)
  check('places are 1..n', board.map((e) => e.place).join(',') === '1,2,3')
  check(
    'the one who reasoned it out in one trial wins',
    board[0].player === 'Kofi',
    board.map((e) => `${e.player}:${e.score.total}`).join(' '),
  )
  check('and the one who missed is last', board[2].player === 'Yaw')

  // Two friends comparing a link use the identical function — which is the
  // reason there is no separate multiplayer model waiting to be written.
  const pair = M.rank([mk('Ama', 4, 18.2), mk('Kofi', 1, 18.2)], c)
  check('two friends are the same structure as a classroom', pair[0].player === 'Kofi' && pair.length === 2)
  check('and one player alone still ranks', M.rank([mk('Ama', 2, 18.5)], c)[0].place === 1)
  check('an empty room is not a crash', M.rank([], c).length === 0)
}

/* ---------------- the link a child actually pastes ---------------- */
{
  const url = M.challengeLink('https://ploobia.pages.dev', '/photosynthesis', base())
  check('the link points into the cabinet', url.includes('/app/#/photosynthesis?c='), url.slice(0, 60))
  const param = url.split('?c=')[1]
  check('and its payload decodes', !!M.decodeChallenge(param))
  check('the whole link stays under 200 characters', url.length < 200, `${url.length}`)
}

/* ---------------- the Sugar Line's economy ---------------- */
{
  // Scarcity is the whole teaching device: the dial stops where your gathering
  // ran out. If banking more did not raise the ceiling, the round would be
  // decoration.
  const poor = M.capsFor({ light: 500, co2: 0, water: 0 })
  const rich = M.capsFor({ light: M.PAR_FULL_SUN, co2: 600, water: 60 })
  check('banking little caps the light dial low', poor.light < 0.3, poor.light.toFixed(2))
  check('banking a full sun opens it all the way', rich.light === 1, String(rich.light))
  check('gathering more raises the ceiling', rich.light > poor.light)

  // Ambient carbon and some soil moisture are free, because they are free to a
  // real plant. You bank the enrichment, not the air.
  check('ambient carbon is free', poor.co2ppm === M.CO2_AMBIENT_PPM, String(poor.co2ppm))
  check('and enrichment is what you banked', rich.co2ppm === M.CO2_AMBIENT_PPM + 600)
  check('carbon cannot exceed the cabinet ceiling', M.capsFor({ co2: 99999 }).co2ppm === M.CO2_MAX_PPM)
  check('a dry start is still wet enough to live', poor.water === M.BASE_SOIL_WATER)

  // Running bright is expensive and running dark is free — that is the trade
  // the whole round turns on.
  const bright = M.trialCost({ light: 1, co2: 0, night: false })
  const dim = M.trialCost({ light: 0.25, co2: 0, night: false })
  const dark = M.trialCost({ light: 1, co2: 0, night: true })
  check('a bright trial costs light', bright.light > 0, String(bright.light))
  check('a dim one costs less', dim.light < bright.light, `${dim.light} < ${bright.light}`)
  check('and at night no light is spent, because none arrives', dark.light === 0)

  // Leaving CO2 alone must cost nothing, or a learner is punished for the
  // control-variable discipline the cabinet is trying to teach.
  check('leaving carbon at ambient is free', M.trialCost({ light: 0.5, co2: 0, night: false }).co2 === 0)
  check('enriching it is not', M.trialCost({ light: 0.5, co2: 1, night: false }).co2 > 0)

  // The bank draws down and never goes negative.
  const bank = { light: 1000, co2: 100, water: 40 }
  const after = M.drawDown(bank, M.trialCost({ light: 0.25, co2: 0, night: false }))
  check('a trial draws the bank down', after.light < bank.light, `${bank.light} → ${after.light}`)
  check('and never below zero', M.drawDown(bank, { light: 99999, co2: 0, water: 0 }).light === 0)
  // To the cent, not to the last bit: `spentSoFar` rounds for display, so a
  // strict equality here would be testing IEEE-754 rather than the ledger.
  check(
    'spending is the difference',
    Math.abs(M.spentSoFar(bank, after).light - (bank.light - after.light)) < 0.01,
    `${M.spentSoFar(bank, after).light} vs ${bank.light - after.light}`,
  )

  check('an affordable trial is allowed', M.canAfford(bank, { light: 500 }))
  check('an unaffordable one is refused before it runs', !M.canAfford(bank, { light: 5000 }))
  // Told BEFORE, not after: a trial that starts and then fails has burned a
  // run off the economy score for nothing.
  check('exactly affordable counts as affordable', M.canAfford({ light: 500 }, { light: 500 }))

  // Every preset must be playable and honest.
  check('there are challenges to play', M.SUGAR_CHALLENGES.length >= 5, String(M.SUGAR_CHALLENGES.length))
  for (const preset of M.SUGAR_CHALLENGES) {
    const c = preset.build(12345)
    const ok =
      c.cabinet === 'photosynthesis' &&
      c.goal.target > 0 &&
      c.gatherSeconds > 0 &&
      Object.keys(c.budget).length === 3
    check(`  ${preset.id}: is a well-formed challenge`, ok)
    check(`  ${preset.id}: survives a link`, !!M.decodeChallenge(M.encodeChallenge(c)))
    // A goal stated in units the instruments do not show would be a second,
    // invisible model the learner could not reason about.
    check(`  ${preset.id}: its metric is one the cabinet displays`, M.metricUnit(c.goal.metric) !== '')
    check(`  ${preset.id}: and the stated unit matches`, c.goal.unit === M.metricUnit(c.goal.metric), `${c.goal.unit} vs ${M.metricUnit(c.goal.metric)}`)
  }

  // Bands gate upward only: an Explorer must never be handed an Analyst brief.
  const forExplorer = M.challengesForBand('explorer')
  const forAnalyst = M.challengesForBand('analyst')
  check('an explorer gets only explorer briefs', forExplorer.every((c) => c.band === 'explorer'))
  check('an analyst gets everything', forAnalyst.length === M.SUGAR_CHALLENGES.length)
  check('and there is something at every band', forExplorer.length > 0 && M.challengesForBand('scientist').length > forExplorer.length)

  // The drought brief only teaches its lesson if it is actually short of water.
  const drought = M.SUGAR_CHALLENGES.find((c) => c.id === 'drought').build(1)
  check('the drought brief really is dry', M.capsFor(drought.budget).water < 0.5, String(M.capsFor(drought.budget).water))
  const thin = M.SUGAR_CHALLENGES.find((c) => c.id === 'thin-air').build(1)
  check('and thin air really is thin', M.capsFor(thin.budget).co2ppm < M.CO2_AMBIENT_PPM + 100)
}


/* ------------------------------------------------------------------ */
/* Every brief can actually be won — and none of them for free         */
/* ------------------------------------------------------------------ */

/**
 * The one check that stops this feature being a cruelty.
 *
 * A challenge is a promise: gather well and you can hit this. Nothing in the
 * types enforces that promise — a budget typed one digit short makes a brief
 * that no amount of skill can satisfy, and a learner has no way to tell that
 * from their own failure. So the model is run directly, over the whole space
 * of conditions the budget permits, and every brief has to be reachable
 * somewhere inside it.
 *
 * The mirror check matters as much: a brief that is met at the *bottom* of the
 * range is met by doing nothing, and teaches nothing.
 */
{
  const CO2_AMBIENT_DIAL = M.CO2_AMBIENT_PPM / M.CO2_MAX_PPM

  /**
   * Every condition set the budget allows, on a coarse grid.
   *
   * The real simulation is driven rather than the solver called once. Export
   * rate and translocation speed are functions of the leaf's sugar pool, and
   * that pool only moves when the sim is stepped — so `solveSugarLine` on a
   * fresh specimen reports the same export in pitch darkness as in full sun.
   * An earlier version of this check did exactly that, and cheerfully blessed
   * briefs that were unreachable while passing briefs that were already won
   * before the learner touched anything.
   *
   * A hundred and sixty steps of 0.05 s is eight wall seconds, which the
   * cabinet runs as four plant hours: what a learner gets by setting the
   * conditions and leaving them there. Soil water is allowed to drain over
   * those hours rather than being topped up, so a brief that only works on a
   * pot nobody can afford to fill will fail here rather than in a classroom.
   */
  function sweep(c) {
    const caps = M.capsFor(c.budget)
    const co2Cap = M.co2DialFor(caps.co2ppm)
    const out = []
    for (let li = 0; li <= 8; li++) {
      for (let ci = 0; ci <= 4; ci++) {
        for (const tempC of [18, 24, 30]) {
          const light = (caps.light * li) / 8
          const co2 = CO2_AMBIENT_DIAL + ((co2Cap - CO2_AMBIENT_DIAL) * ci) / 4
          const sim = M.SIM.createSugarSim()
          M.SIM.loadSpecimen(sim, c.setup)
          sim.soilWater = caps.water
          sim.turgor = 1
          sim.night = false
          // Nothing advances until the cabinet has been started — `stepSim`
          // returns early otherwise, which is correct behaviour and was
          // quietly making every reading here the cold one.
          sim.started = true
          for (let k = 0; k < 160; k++) {
            sim.light = light
            sim.co2 = co2
            sim.tempC = tempC
            M.SIM.stepSim(sim, 0.05)
          }
          out.push({
            light,
            co2,
            tempC,
            value: M.metricValue(M.SIM.simSolve(sim), c.goal.metric),
            cost: M.trialCost({ light, co2, night: false }),
          })
        }
      }
    }
    return out
  }

  for (const preset of M.SUGAR_CHALLENGES) {
    const c = preset.build(7)
    const grid = sweep(c)
    const winners = grid.filter((g) => M.meetsGoal(c.goal, g.value))
    check(`  ${preset.id}: is winnable at all`, winners.length > 0)

    // Winnable is not enough — it has to be winnable and *payable*, because a
    // condition set the bank cannot fund is one the dials will not reach.
    const payable = winners.filter((g) => M.canAfford(c.budget, g.cost))
    check(
      `  ${preset.id}: and affordable on its own budget`,
      payable.length > 0,
      `${payable.length}/${winners.length} of the winning setups`,
    )

    // Two readings at the ceiling must both be affordable, or the cabinet is
    // forbidding the comparison it exists to teach.
    const caps = M.capsFor(c.budget)
    const flatOut = M.trialCost({ light: caps.light, co2: M.co2DialFor(caps.co2ppm), night: false })
    const afterOne = M.drawDown(c.budget, flatOut)
    check(
      `  ${preset.id}: affords a second reading at the same intensity`,
      M.canAfford(afterOne, flatOut),
    )

    // A challenge met by leaving everything alone is not a challenge.
    const idle = grid.find((g) => g.light === 0 && Math.abs(g.co2 - CO2_AMBIENT_DIAL) < 1e-9 && g.tempC === 24)
    check(
      `  ${preset.id}: is not already won before you touch anything`,
      !M.meetsGoal(c.goal, idle.value),
      `idle reads ${idle.value.toFixed(2)}`,
    )

    // And there has to be some way to lose it, or the score is decoration.
    check(
      `  ${preset.id}: can be missed`,
      grid.some((g) => !M.meetsGoal(c.goal, g.value)),
    )
  }
}

console.log(`\n${count - fails}/${count} challenge checks passed`)
process.exit(fails ? 1 : 0)
