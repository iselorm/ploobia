/**
 * The Pond's rules, tested out of band.
 *
 * The round is a diagnosis, so the model owes the learner two guarantees and
 * the suite is where they are kept: on every sprig, a dial that is not the
 * answer moves the count by less than a bubble (at Analyst, by less than the
 * spread of the repeats), and the dial that IS the answer moves it by six or
 * more. Everything else here is the same kind of claim: the lamp's rail is a
 * distance and the light falls as 1/d²; a plate cannot be accused until every
 * dial has been tried; a count taken after two dials moved is evidence for
 * neither; a wrong accusation stamps nothing and keeps its record; the
 * renumbered doors cost no learner a hand-in.
 *
 * Run: node verify-pond-model.mjs
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const TMP = os.tmpdir()
const OUT = path.join(TMP, 'pond-bundle-suite.mjs')
fs.writeFileSync(
  path.join(TMP, 'pond-barrel.ts'),
  `export * from '${path.resolve('src/lib/pond').replace(/\\/g, '/')}'
export * from '${path.resolve('src/lib/campaign').replace(/\\/g, '/')}'
export * from '${path.resolve('src/lib/sugarchallenge').replace(/\\/g, '/')}'
export * from '${path.resolve('src/lib/challenge').replace(/\\/g, '/')}'
`,
)
execSync(`npx esbuild "${path.join(TMP, 'pond-barrel.ts')}" --bundle --format=esm --outfile="${OUT}" --alias:@=${path.resolve('src')}`, { stdio: 'pipe' })
const M = await import(`file://${OUT.replace(/\\/g, '/')}`)

let fails = 0
let passes = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)
  if (ok) passes += 1
  else fails += 1
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps
const bandOf = (id) => (id === 'why-so-quiet' ? 'explorer' : id === 'three-patients' ? 'scientist' : 'analyst')

/* ---- the lamp is a distance, and light falls as 1/d² ---- */
{
  check('the lamp rail is five distances in centimetres, far to near', M.LAMP_RAIL.length === 5 && M.LAMP_RAIL[0] === 45 && M.LAMP_RAIL[4] === 10 && M.LAMP_RAIL.every((c, i) => i === 0 || c < M.LAMP_RAIL[i - 1]))
  check('the light at the sprig goes as 1/d² — halve the distance, four times the light', near(M.parAt(20) / M.parAt(40), 4, 0.01) && near(M.parAt(15) * 225, M.LAMP_K, 1))
  check('a notch inward is roughly double the light (which is why a count can move)', M.LAMP_RAIL.slice(1).every((c, i) => {
    const ratio = M.parAt(c) / M.parAt(M.LAMP_RAIL[i])
    return ratio > 1.7 && ratio < 2.4
  }), M.LAMP_RAIL.map((c) => `${c}cm=${M.parAt(c)}`).join(' '))
  check('brighter moves the lamp IN, dimmer moves it out', M.nudge({ lampCm: 45, spoons: 0, bathC: 27 }, 'lamp', 'up').lampCm === 30 && M.nudge({ lampCm: 15, spoons: 0, bathC: 27 }, 'lamp', 'down').lampCm === 20)
  check('a rail has ends, and a nudge at the end does nothing', M.atEnd({ lampCm: 10, spoons: 0, bathC: 27 }, 'lamp', 'up') && M.atEnd({ lampCm: 45, spoons: 3, bathC: 27 }, 'soda', 'up') && !M.atEnd({ lampCm: 45, spoons: 1, bathC: 27 }, 'soda', 'up'))
  check('the cloth stops the bubbles altogether', M.bubblesPerMinute({ lampCm: 10, spoons: 3, bathC: 27, covered: true }) === 0)
}

/* ---- the two guarantees, on every sprig ---- */
{
  for (const p of M.PATIENTS) {
    const band = p.id === 'the-ceiling' || p.id === 'at-its-best' ? 'analyst' : p.dials.length === 2 ? 'explorer' : 'scientist'
    if (p.truth === 'none') {
      check(`${p.id}: nothing is holding it back — no dial improves it by a jump`, M.atCeiling(p.setup, p.dials), M.DIALS.map((d) => `${d} +${M.riseOf(p.setup, d)}`).join(' '))
      continue
    }
    check(`${p.id}: the dial that IS the answer moves the count by ${M.MOVES_MIN} or more`, M.movesEnough(p.setup, p.truth), `${p.truth} ${M.swingOf(p.setup, p.truth)}`)
    const others = p.dials.filter((d) => d !== p.truth)
    check(`${p.id}: every other dial does nothing a learner could see`, others.every((d) => M.flatEnough(p.setup, d, band)), others.map((d) => `${d} ${M.swingOf(p.setup, d)}`).join(' '))
  }
  check('every sprig starts slow enough to be worth asking about', M.PATIENTS.filter((p) => p.truth !== 'none').every((p) => M.bubblesPerMinute(p.setup) <= 12))
  check('and every one of them can be brought back up', M.PATIENTS.filter((p) => p.truth !== 'none').every((p) => M.riseOf(p.setup, p.truth) >= M.MOVES_MIN))
}

/* ---- the story each level tells, in the model's own counts ---- */
{
  const walk = (env, steps) => {
    let e = { ...env }
    const out = [M.bubblesPerMinute(e)]
    for (const [d, dir] of steps) {
      e = M.nudge(e, d, dir)
      out.push(M.bubblesPerMinute(e))
    }
    return out
  }
  const shady = walk(M.PATIENT_BY_ID['shady'].setup, [['lamp', 'up'], ['lamp', 'up'], ['lamp', 'up'], ['lamp', 'up']])
  check('the shady sprig climbs with the lamp and then stops — a ceiling the learner can see', shady[0] < 5 && shady[3] - shady[0] >= 20 && shady[4] - shady[3] < 3, shady.join(' → '))
  const stuffy = walk(M.PATIENT_BY_ID['stuffy'].setup, [['soda', 'up'], ['soda', 'up'], ['soda', 'up']])
  check('one spoon of baking soda is most of the story, and the third does almost nothing', stuffy[1] - stuffy[0] >= 15 && stuffy[3] - stuffy[2] <= 2, stuffy.join(' → '))
  const veranda = walk(M.PATIENT_BY_ID['veranda'].setup, [['bath', 'down'], ['bath', 'down'], ['bath', 'down']])
  check('the veranda sprig recovers as the bath cools', veranda[1] - veranda[0] >= M.MOVES_MIN, veranda.join(' → '))
  const ceiling = walk(M.PATIENT_BY_ID['the-ceiling'].setup, [['soda', 'up'], ['soda', 'up'], ['soda', 'up'], ['lamp', 'up'], ['lamp', 'up']])
  check('the Analyst sprig: the soda first, then it flattens, then the LAMP takes over by a jump', ceiling[1] - ceiling[0] >= M.MOVES_MIN && ceiling[3] - ceiling[2] < 1 && ceiling[4] - ceiling[3] >= M.MOVES_MIN, ceiling.join(' → '))
  check('nothing in the model can beat the plant itself', M.bubblesPerMinute({ lampCm: 10, spoons: 3, bathC: 28 }) <= 42)
  check('too hot brings it down again — the enzymes, not the supply', M.bubblesPerMinute({ lampCm: 10, spoons: 3, bathC: 38 }) < M.bubblesPerMinute({ lampCm: 10, spoons: 3, bathC: 27 }) - M.MOVES_MIN)
}

/* ---- the counts are honest about being counts ---- */
{
  let rand = 1
  const rng = () => ((rand = (rand * 1664525 + 1013904223) >>> 0) / 4294967296)
  const env = M.PATIENT_BY_ID['stuffy'].setup
  const truth = M.solvePond(env).bubbles
  const draws = Array.from({ length: 400 }, () => M.countWith(env, rng))
  const mean = draws.reduce((a, b) => a + b, 0) / draws.length
  check('a noisy count scatters around the truth and does not drift', Math.abs(mean - truth) < 1, `${mean.toFixed(2)} vs ${truth.toFixed(2)}`)
  check('the scatter is about one in twenty — which is why the Analyst repeats', draws.every((d) => Math.abs(d - truth) <= M.spreadAt(truth) + 1))
  check('the spread grows with the count, and never goes to nothing', M.spreadAt(40) > M.spreadAt(10) && M.spreadAt(0) > 0)
  check('warm water gives some gas back on its own — and it is not photosynthesis', M.solvePond({ lampCm: 10, spoons: 3, bathC: 38 }).degassing > 0 && M.solvePond({ lampCm: 10, spoons: 3, bathC: 27 }).degassing === 0)
}

/* ---- the indicator tube is its own tube ---- */
{
  const lit = { lampCm: 15, spoons: 3, bathC: 27 }
  check('the indicator reads the tube, never the tank: soda in the tank cannot turn it purple', M.indicatorColour(lit) === M.indicatorColour({ ...lit, spoons: 0 }))
  check('lit it goes purple — carbon dioxide is being taken out of the water', M.indicatorColour(lit) === 'purple')
  check('under the cloth it goes yellow — carbon dioxide is going back in', M.indicatorColour({ ...lit, covered: true }) === 'yellow')
  check('and in between it is red', M.indicatorColour({ lampCm: 45, spoons: 0, bathC: 27 }) === 'red', M.indicatorColour({ lampCm: 45, spoons: 0, bathC: 27 }))
  check('every colour says what it means in plain words, with no jargon', ['purple', 'red', 'yellow'].every((c) => M.indicatorSays(c).length > 20 && !/photosynthesis|limiting/.test(M.indicatorSays(c))))
}

/* ---- the accusation: ruling out is the game ---- */
{
  const p = M.PATIENT_BY_ID['patient-a']
  const count = (env, did, dial, confounded = false) => ({ did, dial, env, bubbles: M.bubblesPerMinute(env), confounded })
  const asFound = count(p.setup, 'as found', null)
  const afterLamp = count(M.nudge(p.setup, 'lamp', 'down'), 'dimmer', 'lamp')
  const afterSoda = count(M.nudge(p.setup, 'soda', 'up'), 'a spoon', 'soda')
  const afterBath = count(M.nudge(p.setup, 'bath', 'up'), 'warmer', 'bath')
  check('a plate cannot be accused before every dial has been tried', !M.canAccuse(p, [asFound, afterSoda]) && M.canAccuse(p, [asFound, afterLamp, afterSoda, afterBath]))
  check('and the round can say which ones are still untried', M.untried(p, [asFound, afterSoda]).sort().join() === 'bath,lamp')
  check('a count taken after two dials moved is evidence for neither', M.confounded(['lamp', 'soda']) && !M.confounded(['soda', 'soda']))
  const confoundedLog = [asFound, afterLamp, afterBath, { ...afterSoda, confounded: true }]
  check('a confounded count does not unlock the plates either', !M.canAccuse(p, confoundedLog))
  const full = [asFound, afterLamp, afterSoda, afterBath]
  check('the right plate, with the jump in the log, is a hit that stamps', M.verdictOf(p, 'soda', full).right && M.verdictOf(p, 'soda', full).stamps)
  check('the right plate with no jump behind it is a guess — right, but it stamps nothing', M.verdictOf(p, 'soda', [asFound, afterLamp, afterBath]).stamps === false)
  const wrong = M.verdictOf(p, 'lamp', full)
  check('a wrong accusation is not a game over: the plates flip anyway', wrong.right === false && wrong.plates.length === p.dials.length)
  check('the accused plate flips first', wrong.plates[0].dial === 'lamp')
  check('and the line sends them back to their own counts, never to a lecture', /look at the step that moved/i.test(wrong.line) && !/limiting|factor|photosynthesis/i.test(wrong.line))
  check('a miss stamps nothing', wrong.stamps === false)
  const best = M.PATIENT_BY_ID['at-its-best']
  const bestLog = [count(best.setup, 'as found', null), count(M.nudge(best.setup, 'lamp', 'down'), 'dimmer', 'lamp'), count(M.nudge(best.setup, 'soda', 'down'), 'less soda', 'soda'), count(M.nudge(best.setup, 'bath', 'up'), 'warmer', 'bath')]
  check('“nothing is holding it back” is a real answer, and it needs every dial tried', M.verdictOf(best, 'none', bestLog).right && M.verdictOf(best, 'none', bestLog).stamps)
  check('… and it is refused once something DID jump', M.hasEvidenceFor(best, 'none', [...bestLog, { ...count(M.nudge(best.setup, 'soda', 'down'), 'a spoon', 'soda'), bubbles: bestLog[0].bubbles + 20 }]) === false)
  check('the plates read their real values at the reveal, and never before', M.verdictOf(p, 'soda', full).plates.map((x) => x.reads).join(' · ').includes('spoons'))
}

/* ---- the levels, the kit and the floor ---- */
{
  for (const id of ['why-so-quiet', 'three-patients', 'the-ceiling']) {
    const preset = M.SUGAR_CHALLENGE_BY_ID[id]
    check(`${id} is a level on door 2, at the band it is for`, !!preset && preset.stage === 2 && preset.band === bandOf(id))
    const c = preset.build(4242)
    check(`${id} is a diagnosis, not a number to reach`, c.goal.metric === 'diagnosis' && c.goal.direction === 'atLeast' && c.goal.target === 1)
    check(`${id} pays in kit: minutes, spoons and jugs`, ['minutes', 'spoons', 'jugs'].every((k) => typeof c.budget[k] === 'number' && c.budget[k] > 0))
    check(`${id} opens on a number the learner types, and the brief never prints it`, !!preset.guess && !preset.brief.includes(String(preset.guess.answer)))
  }
  const ex = M.sprigsFor('why-so-quiet', 1)
  check('the Explorer meets two sprigs, and the second is the one that adds the bath', ex.length === 2 && ex[0].dials.length === 2 && ex[1].dials.length === 3)
  check('a different seed is a different first mystery — a replay is not the same puzzle', M.sprigsFor('why-so-quiet', 1)[0].id !== M.sprigsFor('why-so-quiet', 2)[0].id)
  const sci = M.sprigsFor('three-patients', 7)
  check('the Scientist gets three patients, and no two have the same answer', sci.length === 3 && new Set(sci.map((p) => p.truth)).size === 3)
  check('the Analyst gets one sprig, and on some seeds the answer is “nothing at all”', M.sprigsFor('the-ceiling', 2).length === 1 && [0, 1, 2, 3, 4, 5].some((s) => M.sprigsFor('the-ceiling', s)[0].truth === 'none'))
  check('the floor is one count as found plus one per suspect — ruling out is what scores', M.countFloor(M.PATIENT_BY_ID['shady']) === 3 && M.countFloor(M.PATIENT_BY_ID['patient-a']) === 4)
  check('moving the lamp is free; a spoon and a bath change are not', M.costOf('lamp').spoons === 0 && M.costOf('lamp').jugs === 0 && M.costOf('soda').spoons === 1 && M.costOf('bath').jugs === 1)
  check('the Analyst is given enough kit to repeat every count three times', M.POND_KIT.analyst.minutes >= 3 * M.countFloor(M.PATIENT_BY_ID['the-ceiling']))
}

/* ---- the renumbered doors ---- */
{
  const names = M.CAMPAIGN.map((s) => `${s.id} ${s.name}`).join(' · ')
  check('the doors are 1 Factory · 2 Pond · 3 Hatches · 4 Line · 5 Roots · 6 Stand', names === '1 The Factory · 2 The Pond · 3 The Hatches · 4 The Line · 5 The Roots · 6 The Stand', names)
  check('the Pond is built and opens onto its own stage tab', M.CAMPAIGN_BY_ID[2].built === true && M.CAMPAIGN_BY_ID[2].tab === 'pond')
  check('the last door still says nobody has discovered it', M.CAMPAIGN_BY_ID[6].built === false)
  check('every built door has levels, and every level names a door that exists', M.CAMPAIGN.filter((s) => s.built).every((s) => M.levelsOfStage(s.id).length === 3) && M.SUGAR_CHALLENGES.every((p) => !p.stage || !!M.CAMPAIGN_BY_ID[p.stage]))
  check('every band has a level at every built door', M.CAMPAIGN.filter((s) => s.built).every((s) => ['explorer', 'scientist', 'analyst'].every((b) => M.levelForBand(b, s.id).stage === s.id)))
  check('the stage names read the same on the brief as on the map', Object.entries(M.STAGE_NAMES).every(([id, name]) => M.CAMPAIGN_BY_ID[Number(id)].name === name))
  // The renumber must cost nobody a hand-in: progress is keyed by preset id.
  M.resetCampaign()
  M.recordHandIn('open-the-hatches', M.stageOfPresetId('open-the-hatches'), 700)
  check('a hand-in at the Hatches still counts after they moved from door 2 to door 3', M.isStageHandedIn(3) && M.isStageOpen(4))
  check('and it did not open a door it never opened before — the Pond is still unhanded', !M.isStageHandedIn(2) && M.isStageOpen(3) === false)
  M.resetCampaign()
  check('door 1 is always open, the Pond opens on a Factory hand-in', M.isStageOpen(1) && !M.isStageOpen(2))
  M.recordHandIn('first-light', M.stageOfPresetId('first-light'), 800)
  check('… and a Factory hand-in opens it', M.isStageOpen(2) && M.nextDoor().id === 2)
  M.resetCampaign()
}

/* ---- what the round costs, and what it says ---- */
{
  // The grant is the bench times the sprigs, because the bench is refilled
  // for each patient: a mystery you cannot afford to finish is not a mystery.
  for (const [id, band] of [['why-so-quiet', 'explorer'], ['three-patients', 'scientist'], ['the-ceiling', 'analyst']]) {
    const sprigs = M.sprigsFor(id, 0)
    const grant = M.pondBudgetFor(id, band)
    check(`${id}: the grant covers a full bench for every sprig`, grant.minutes === M.POND_KIT[band].minutes * sprigs.length)
    const t = M.pondTrialsFor(id, band)
    const honest = sprigs.reduce((n, p) => n + M.countFloor(p) * (band === 'analyst' ? 3 : 1), 0)
    check(`${id}: perfect play is the honest floor, not one lucky count`, t.minTrials === honest, `${t.minTrials} vs ${honest}`)
    check(`${id}: and the economy term only runs out when the grant does`, t.floor >= t.minTrials + 2 && t.floor >= grant.minutes - 1, JSON.stringify(t))
    // Under the spine's own default floor of six, every one of these scored
    // zero economy under perfect play — the scoreboard punishing the
    // discipline the round exists to teach.
    const c = M.SUGAR_CHALLENGES.find((x) => x.id === id).build(7)
    const perfect = M.scoreAttempt(c, { best: 1, trials: t.minTrials, spent: {}, conditionMet: true })
    check(`${id}: playing it perfectly is worth more than one star`, perfect.stars >= 2, `${perfect.total} (${perfect.stars}★), economy ${perfect.economy.toFixed(2)}`)
  }

  // The guess the brief opens on must be true of every seed. It used to state
  // the sick sprig's count — which varies by seed, is handed over before the
  // learner's first count, and on one seed of `the-ceiling` announced the
  // answer of the one sprig whose answer is "nothing".
  const healthy = M.bubblesPerMinute(M.PATIENT_BY_ID['at-its-best'].setup)
  for (const [id, expect] of [['why-so-quiet', healthy], ['the-ceiling', healthy], ['three-patients', M.bubblesPerMinute(M.PATIENT_BY_ID['patient-a'].setup)]]) {
    const g = M.SUGAR_CHALLENGES.find((x) => x.id === id).guess
    check(`${id}: the opening guess states a number the model actually gives`, g.answer === expect, `${g.answer} vs ${expect}`)
  }
  for (const p of M.PATIENTS) {
    check(`${p.id}: its story does not give the answer away`, !/nothing wrong|short of|too warm|too cold/i.test(p.story), p.story)
  }

  // Evidence is what the learner watched, never what the model would have
  // done. This used to ask `swingOf` about the environment, which credited a
  // jump nobody saw and refused one seen under a cloth.
  const q = M.PATIENT_BY_ID['stuffy']
  const row = (env, did, dial, bubbles) => ({ did, dial, env, bubbles: bubbles ?? M.bubblesPerMinute(env), confounded: false })
  const flat = [row(q.setup, 'as found', null), row(M.nudge(q.setup, 'lamp', 'up'), 'moved the lamp', 'lamp'), row(M.nudge(q.setup, 'soda', 'up'), 'a spoon', 'soda', M.bubblesPerMinute(q.setup))]
  check('a right plate whose count never actually jumped does not stamp', M.hasEvidenceFor(q, 'soda', flat) === false)
  const seen = [row(q.setup, 'as found', null), row(M.nudge(q.setup, 'lamp', 'up'), 'moved the lamp', 'lamp'), row(M.nudge(q.setup, 'soda', 'up'), 'a spoon', 'soda')]
  check('… and one that did jump, in the learner\'s own log, does', M.hasEvidenceFor(q, 'soda', seen))

  // The tube reads light and dark. It used to inherit the tank's bath and
  // soda, so a sprig on a hot veranda turned it yellow while the tank beside
  // it bubbled under a full lamp.
  const veranda = M.PATIENT_BY_ID['veranda'].setup
  check('the indicator is purple in the light, whatever the bath is doing', M.indicatorColour(veranda) === 'purple', M.indicatorColour(veranda))
  check('and yellow under the cloth, which is the whole of 6.1.9', M.indicatorColour({ ...veranda, covered: true }) === 'yellow')
  check('it never claims nothing is taking carbon out', !/nothing is taking it out/i.test(M.indicatorSays('yellow')))

  // The fourth plate says what is true: this bench has nothing left to give.
  const noneLine = M.verdictOf(M.PATIENT_BY_ID['at-its-best'], 'none', [row(M.PATIENT_BY_ID['at-its-best'].setup, 'as found', null)]).line
  check('“nothing at all” is never claimed', !/nothing was holding it back/i.test(noneLine), noneLine)
  check('and the line uses the learner\'s first and last counts, not the same one twice', /when you found it/.test(noneLine))

  check('a called direction is judged against what the count did', M.calledIt('up', 9) && M.calledIt('same', 0.4) && !M.calledIt('same', 9) && M.calledIt('down', -4))
  const explorerRise = M.riseLine(8, 20, 'explorer')
  check('the Explorer is not told 2.5× is “nearly 3×”', !/nearly 3/.test(explorerRise), explorerRise)
  check('and the percentage is to the nearest ten, not the nearest one', /0 % more$/.test(M.riseLine(8, 30, 'analyst')), M.riseLine(8, 30, 'analyst'))
}

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
