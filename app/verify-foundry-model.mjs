/**
 * The Foundry Game's rules, tested out of band.
 *
 * Identity is proton count and nothing else; the gauge and the score read the
 * same number; a link carries the whole level and refuses a fiddled one; the
 * catch comes from the seed; Ploob never prints the number being guessed;
 * one hand-in opens the next door. Pure claims, proved in Node against the
 * bundled model the way the Sugar Line's are.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const OUT = '/tmp/foundry-bundle-suite.mjs'
fs.writeFileSync(
  '/tmp/foundry-barrel.ts',
  `export * from '${path.resolve('src/lib/foundry')}'
export * from '${path.resolve('src/lib/foundrycampaign')}'
export * from '${path.resolve('src/lib/challenge')}'
export { shellsFor, stabilityOf, ELEMENT_BY_Z } from '${path.resolve('src/lib/atoms')}'
export * from '${path.resolve('src/lib/matter')}'
`,
)
execSync(`npx esbuild /tmp/foundry-barrel.ts --bundle --format=esm --outfile=${OUT} --alias:@=${path.resolve('src')}`, { stdio: 'pipe' })
const M = await import(OUT)

let fails = 0
let passes = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)
  if (ok) passes += 1
  else fails += 1
}

/* ---- doors and levels ---- */
check('five doors, two of them built', M.DOORS.length === 5 && M.DOORS.filter((d) => d.built).length === 2)
check('three levels behind door 1, tiers 1..3', M.LEVELS.filter((l) => l.door === 1).map((l) => l.tier).join() === '1,2,3')
check('three levels behind door 2 as well', M.LEVELS.filter((l) => l.door === 2).map((l) => l.tier).join() === '1,2,3')
for (const l of M.LEVELS) {
  check(`level ${l.id}: title is seven words or fewer`, l.title.split(/\s+/).length <= 7, l.title)
  check(`level ${l.id}: guess is a number inside its own dial`, l.guess.answer >= l.guess.min && l.guess.answer <= l.guess.max)
  const numberInBlurb = new RegExp(`\\b${l.guess.answer}\\b`).test(l.blurb) || new RegExp(`\\b${l.guess.answer}\\b`).test(l.title)
  check(`level ${l.id}: the brief never prints the number being guessed`, !numberInBlurb)
}
check('explorer opens on helium, scientist on keep-carbon, analyst on to-order',
  M.levelForBand('explorer').id === 'forge-helium' && M.levelForBand('scientist').id === 'keep-carbon' && M.levelForBand('analyst').id === 'to-order')

/* ---- identity, charge, mass ---- */
const He = { protons: 2, neutrons: 2, electrons: 2 }
const C12 = { protons: 6, neutrons: 6, electrons: 6 }
const C13p = { protons: 6, neutrons: 7, electrons: 5 }
check('identity follows protons: 6·6·6 is carbon', M.identityOf(C12)?.symbol === 'C')
check('identity follows protons: 6·7·5 is still carbon', M.identityOf(C13p)?.symbol === 'C')
check('charge is protons minus electrons', M.chargeOf(C13p) === 1 && M.chargeOf(C12) === 0)
check('mass number is protons plus neutrons of THIS isotope', M.massNumberOf(C13p) === 13 && M.massNumberOf(He) === 4)
check('nuclide label: 13 C +', JSON.stringify(M.nuclide(C13p)) === JSON.stringify({ a: 13, symbol: 'C', charge: '+' }))
check('nuclide label: 2−', M.nuclide({ protons: 8, neutrons: 8, electrons: 10 }).charge === '2−')
check('no nucleus has no identity', M.identityOf({ protons: 0, neutrons: 0, electrons: 1 }) === null)
check('stability is a label, not a countdown: helium-4 stable', M.stabilityWord(He) === 'stable')
check('stability label: carbon-14 (8 n) is known to decay', M.stabilityWord({ protons: 6, neutrons: 8, electrons: 6 }) === 'known to decay')

/* ---- the gauge ---- */
const helium = M.LEVEL_BY_ID['forge-helium']
let g = M.gaugeFor(helium, { protons: 1, neutrons: 0, electrons: 1 })
check('helium gauge: 0 of 3 met from hydrogen', g.met === 0 && g.of === 3 && !g.hit)
check('helium gauge says what is left in the learner\'s words', g.cells[0].todo === '1 to go' && g.cells[1].todo === '2 to go')
g = M.gaugeFor(helium, He)
check('helium gauge: 3 of 3 met, hit', g.met === 3 && g.hit)
g = M.gaugeFor(helium, { protons: 3, neutrons: 2, electrons: 2 })
check('one too many protons is not a hit and says so', !g.hit && g.cells[0].todo === '1 too many')

const keep = M.LEVEL_BY_ID['keep-carbon']
check('keep-carbon starts from carbon-12', JSON.stringify(M.startBuild(keep)) === JSON.stringify(C12))
g = M.gaugeFor(keep, C12)
check('keep-carbon at start: identity held, nothing changed yet', g.cells[0].met && g.met === 1 && g.of === 3 && !g.hit)
g = M.gaugeFor(keep, { protons: 6, neutrons: 6, electrons: 5 })
check('keep-carbon: one electron away → charge changed, mass not', g.cells[1].met && !g.cells[2].met && !g.hit)
g = M.gaugeFor(keep, C13p)
check('keep-carbon: charge and mass changed, protons kept → hit', g.hit && g.met === 3)
g = M.gaugeFor(keep, { protons: 7, neutrons: 7, electrons: 5 })
check('keep-carbon: changing two things but losing carbon is NOT a hit', !g.hit && !g.cells[0].met)
check('identity cell asks to put one back when a proton is missing', M.gaugeFor(keep, { protons: 5, neutrons: 7, electrons: 5 }).cells[0].todo === 'put one back')

/* ---- the aim ring ---- */
check('helium: aim points at protons first', M.nextPart(helium, M.EMPTY) === 'proton')
check('helium: then neutrons', M.nextPart(helium, { protons: 2, neutrons: 0, electrons: 0 }) === 'neutron')
check('helium: then electrons', M.nextPart(helium, { protons: 2, neutrons: 2, electrons: 0 }) === 'electron')
check('helium: met → Hand in wears the ring', M.nextPart(helium, He) === null)
check('keep-carbon: after charge, aim points at neutron', M.nextPart(keep, { protons: 6, neutrons: 6, electrons: 5 }) === 'neutron')

/* ---- Ploob ---- */
const line = (lvl, b, prev) => M.ploobLine(lvl, b, prev)
check('Ploob names the change: hydrogen → helium', /Hydrogen became helium/.test(line(helium, { protons: 2, neutrons: 0, electrons: 1 }, { protons: 1, neutrons: 0, electrons: 1 })))
check('Ploob: an electron changes charge, not the name', /Charge \+1/.test(line(keep, { protons: 6, neutrons: 6, electrons: 5 }, C12)) && /Still carbon/.test(line(keep, { protons: 6, neutrons: 6, electrons: 5 }, C12)))
check('Ploob: a neutron changes mass, not the name', /Mass number 13/.test(line(keep, { protons: 6, neutrons: 7, electrons: 6 }, C12)))
check('Ploob on a hit says the level\'s done line', line(helium, He, null) === helium.done)
check('Ploob never praises a click', !/great|well done|awesome|good job/i.test([line(helium, He, null), line(keep, C13p, C12), helium.open, keep.open].join(' ')))

/* ---- the catch ---- */
const r1 = M.rain(12345, helium)
const r2 = M.rain(12345, helium)
check('rain is a function of the seed', r1.join() === r2.join() && r1.length === 40)
check('a different seed rains differently', M.rain(54321, helium).join() !== r1.join())
check('rain holds every kind', new Set(r1).size === 3)
const bank = M.bankOf(['proton', 'proton', 'proton', 'proton', 'proton', 'neutron', 'electron'], helium)
check('the bank caps at the budget', bank.proton === 4 && bank.neutron === 1 && bank.electron === 1)
check('affordable: helium from 2·2·2 bank', M.affordable(helium, { proton: 2, neutron: 2, electron: 2 }, He))
check('not affordable: helium from a bank with one neutron', !M.affordable(helium, { proton: 2, neutron: 1, electron: 2 }, He))
check('helium needs 2·2·2 from the bank', JSON.stringify(M.needOf(helium)) === JSON.stringify({ proton: 2, neutron: 2, electron: 2 }))
check('keep-carbon needs one neutron and one electron at most', JSON.stringify(M.needOf(keep)) === JSON.stringify({ proton: 0, neutron: 1, electron: 1 }))
const thin = M.topUp({ proton: 0, neutron: 1, electron: 0 }, helium)
check('a thin catch is topped up to the need, and says so', thin.topped && thin.bank.proton === 2 && thin.bank.neutron === 2 && thin.bank.electron === 2)
const fat = M.topUp({ proton: 4, neutron: 3, electron: 2 }, helium)
check('a good catch is left alone', !fat.topped && fat.bank.proton === 4)
check('keep-carbon spends against its start build', JSON.stringify(M.spentOf(keep, C13p)) === JSON.stringify({ proton: 0, neutron: 1, electron: 0 }))

/* ---- the link ---- */
const c = M.challengeFor(helium, 'explorer', 777, 'Kwame')
check('challenge: cabinet atoms, goal parts atLeast 3, gather for explorer', c.cabinet === 'atoms' && c.goal.metric === 'parts' && c.goal.target === 3 && c.gatherSeconds === 20)
check('challenge: scientist does not gather', M.challengeFor(keep, 'scientist', 1).gatherSeconds === 0)
const text = M.encodeChallenge(c)
const back = M.decodeChallenge(text)
check('link round-trips through lib/challenge', back && back.setup === c.setup && back.seed === 777 && back.by === 'Kwame')
check('setup carries the level and target', M.levelFromSetup(back.setup)?.id === 'forge-helium')
check('a fiddled setup is refused, not half-read', M.levelFromSetup('forge-helium:2.2.3') === null && M.levelFromSetup('nope:1') === null)
check('link is short enough for a chat app', text.length < 120, `${text.length} chars`)
check('keep-carbon setup names what must change', M.setupOf(keep) === 'keep-carbon:6.6.6:charge+mass')

/* ---- the score ---- */
let s = M.attemptFor(helium, c, He, 1, { proton: 2, neutron: 2, electron: 2 }, 30)
check('a hit in one trial with nothing spare: full accuracy, full economy', s.attempt.hit && s.score.accuracy === 1 && s.score.economy === 1, JSON.stringify(s.score))
check('score is out of 1000 with stars', s.score.total > 0 && s.score.total <= 1000 && s.score.stars >= 1)
s = M.attemptFor(helium, c, { protons: 2, neutrons: 2, electrons: 1 }, 3, { proton: 4, neutron: 4, electron: 4 }, 30)
check('a miss is not a hit and accuracy is under full', !s.attempt.hit && s.score.accuracy < 1)
const miss = M.attemptFor(keep, M.challengeFor(keep, 'scientist', 1), { protons: 7, neutrons: 7, electrons: 5 }, 1, keep.budget, 10)
check('losing carbon can never score as a hit', !miss.attempt.hit && miss.attempt.best < 3)

/* ---- rank, two friends on one seed ---- */
const a = M.attemptFor(helium, c, He, 1, { proton: 2, neutron: 2, electron: 2 }, 40).attempt
const b = M.attemptFor(helium, c, He, 3, { proton: 2, neutron: 2, electron: 2 }, 20).attempt
const ranked = M.rank([{ player: 'Ama', attempt: b }, { player: 'Kwame', attempt: a }], c)
check('fewer trials beats faster hands', ranked[0].player === 'Kwame')

/* ---- the share card ---- */
const card = M.shareCardFor(helium, He, 'Kwame', [1, 2], 1, 3)
check('share card headline and dare', card.headline === 'Kwame forged helium' && card.dare === 'Can you do it in one trial?')
check('share card carries no identity beyond the nickname', !JSON.stringify(card).match(/@|phone|email/))

/* ---- Door 2 · The Bench ---- */
{
  const water = M.LEVEL_BY_ID['bench-water']
  const salt = M.LEVEL_BY_ID['bench-salt']
  const limits = M.LEVEL_BY_ID['bench-limits']
  check('Door 2 has three levels, one per band', water && salt && limits && [water, salt, limits].every((l) => l.door === 2))
  check('a pair level is played on the bench, not the forge', M.isPairLevel(salt) && !M.isPairLevel(M.LEVEL_BY_ID['forge-helium']))

  const empty = M.EMPTY_BENCH
  const B = (a, b, predicted = null) => ({ a, b, predicted })
  const g = (level, bench) => M.gaugeFor(level, { protons: 0, neutrons: 0, electrons: 0 }, bench)

  check('an empty bench meets nothing', g(salt, empty).met === 0 && !g(salt, empty).hit)
  check('the pads do not care which one you filled first', M.pairMatches(B(11, 17), [11, 17]) && M.pairMatches(B(17, 11), [11, 17]))
  check('the wrong pair is not the right pair', !M.pairMatches(B(11, 8), [11, 17]))

  // THE SPOILER CHECK, in the gauge this time.
  {
    const placed = g(salt, B(11, 17))
    const shown = placed.cells.map((c) => `${c.label} ${c.value} ${c.want} ${c.todo}`).join(' ')
    const answer = M.pairAnswer([11, 17])
    check('THE SPOILER CHECK — the gauge shows no formula before the dial is locked', !/NaCl/.test(shown))
    check('THE SPOILER CHECK — and no answer before the dial is locked', !new RegExp(`\\b${answer}\\b`).test(placed.cells.find((c) => c.id === 'ratio').value))
    check('the prediction cell says "say it first" until one is said', placed.cells.find((c) => c.id === 'ratio').value === '—')
  }
  check('a locked prediction that holds meets the cell', g(salt, B(11, 17, M.pairAnswer([11, 17]))).hit)
  check('a locked prediction that misses does not', !g(salt, B(11, 17, 3)).hit)
  check('the ratio the gauge marks is the one the dial asked for', M.pairAnswer([1, 8]) === 2 && M.pairAnswer([11, 17]) === 1)
  check('the Analyst level asks no ratio — its job is the edge of the rule', limits.target.askRatio === false && g(limits, B(8, 16)).hit)

  // the setup still carries the whole world
  check('a pair level round-trips through its setup', M.levelFromSetup(M.setupOf(salt))?.id === 'bench-salt' && M.levelFromSetup(M.setupOf(limits))?.id === 'bench-limits')
  check('a fiddled pair setup is refused, not half-read', M.levelFromSetup('bench-salt:11+8:ratio') === null)

  // Ploob at the bench
  {
    const lines = [
      M.benchLine(salt, empty),
      M.benchLine(salt, B(11, null)),
      M.benchLine(salt, B(11, 17)),
      M.benchLine(salt, B(11, 8)),
      M.benchLine(water, B(1, 8)),
    ]
    check('Ploob talks about appetite before a prediction, never the answer', /gives 1/.test(M.benchLine(salt, B(11, 17))) && /takes 1/.test(M.benchLine(salt, B(11, 17))))
    check('THE SPOILER CHECK — no bench line prints the formula or a subscript', lines.every((l) => !/NaCl|H₂O/.test(l) && !/[₀₁₂₃₄₅₆₇₈₉]/.test(l)))
    check('a wrong pair is named and not scolded', /Not the pair this job asked for/.test(M.benchLine(salt, B(11, 8))))
    check('the done line is only said once the job is done', M.benchLine(salt, B(11, 17, 1)) === salt.done)
  }
  check('the done line may name the product — the prediction is over by then', /Salt/.test(salt.done))
}

/* ---- the nickname: the one thing about a child that travels ---- */
check('a nickname keeps ordinary names whole', M.cleanNickname("Ama-Serwaa O'Bri") === "Ama-Serwaa O'Bri")
check('a nickname keeps non-Latin letters', M.cleanNickname('Kofi Ɛ') === 'Kofi Ɛ')
check('a handle is not a nickname', M.cleanNickname('kwame@gmail.com') === 'kwamegmailcom')
check('a phone number cannot ride in on a nickname', M.sendableNickname('Ama 0244123456') === 'Ama')
check('typing keeps the space that a second name needs', M.cleanNickname('Ama ') === 'Ama ' && M.cleanNickname('Ama Serwaa') === 'Ama Serwaa')
check('a nickname is capped, so it cannot become a sentence', M.cleanNickname('a'.repeat(60)).length === M.NICKNAME_MAX)
check('empty in, empty out — the card then says "Someone"', M.cleanNickname('   ') === '' && M.shareCardFor(helium, He, '', [1], 1, 3).headline.startsWith('Someone'))
check('a cleaned nickname is stable under a second pass', M.cleanNickname(M.cleanNickname('Ama!! 0244123456 <script>')) === M.cleanNickname('Ama!! 0244123456 <script>'))

/* ---- the doors ---- */
M.resetFoundry()
// Door 2 is built now, so at the start it is *shut* — a promise that can be
// kept — where door 3 is still undiscovered, which is a different promise.
check('door 1 open, door 2 shut, door 3 undiscovered at the start',
  M.doorState(M.DOOR_BY_ID[1]) === 'open' && M.doorState(M.DOOR_BY_ID[2]) === 'shut' && M.doorState(M.DOOR_BY_ID[3]) === 'undiscovered' && M.nextDoor().id === 1)
const opened = M.recordHandIn('forge-helium', 800)
check('a hand-in records and reports whether the next door opened', M.isDoorHandedIn(1) && M.isDoorOpen(2) && opened === true)
check('door 1 reads done after a hand-in; best score kept', M.doorState(M.DOOR_BY_ID[1]) === 'done' && M.getFoundryProgress().handedIn['forge-helium'] === 800)
M.recordHandIn('forge-helium', 500)
check('a worse hand-in never lowers the best', M.getFoundryProgress().handedIn['forge-helium'] === 800)
M.resetFoundry()
check('reset forgets the walk', !M.isDoorHandedIn(1))

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
