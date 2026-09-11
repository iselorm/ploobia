/**
 * The counting rule, tested out of band.
 *
 * Every trap in the Matter Works notes is a check in here, because each one was
 * paid for once already and the notes are the only place the receipts survive:
 * boron is not B₂O₅, ammonia is not H₃N, water is bent for a reason, salt has no
 * molecules in it, and the five pairs the rule cannot settle say so out loud.
 *
 * And THE SPOILER CHECK, which is the reason this file is worth its runtime.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const OUT = '/tmp/matter-bundle-suite.mjs'
fs.writeFileSync(
  '/tmp/matter-barrel.ts',
  `export * from '${path.resolve('src/lib/matter')}'
export { ELEMENTS, ELEMENT_BY_Z } from '${path.resolve('src/lib/atoms')}'
`,
)
execSync(`npx esbuild /tmp/matter-barrel.ts --bundle --format=esm --outfile=${OUT} --alias:@=${path.resolve('src')}`, { stdio: 'pipe' })
const M = await import(OUT)

let passes = 0
let fails = 0
function check(label, ok, detail) {
  if (ok) {
    passes += 1
    console.log(`PASS ${label}`)
  } else {
    fails += 1
    console.log(`FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const Z = Object.fromEntries(M.ELEMENTS.map((e) => [e.symbol, e.z]))
const f = (a, b) => M.formulaFor(Z[a], Z[b])?.text ?? null
const r = (a, b) => M.reactionFor(Z[a], Z[b])

/* ---- appetite: outer, room, valency ---- */
check('valency is min(outer, room) — boron is 3, not 5', M.valencyOf(Z.B) === 3)
check('and so boron oxide is not B₂O₅', f('B', 'O') === 'B₂O₃')
check('carbon is a four-bonder', M.valencyOf(Z.C) === 4)
check('sodium gives one, chlorine takes one', M.valencyOf(Z.Na) === 1 && M.valencyOf(Z.Cl) === 1)
check('helium is full at two — not eight', M.roomOf(Z.He) === 0 && M.isNoble(Z.He))
check('calcium has two outer electrons, not eight', M.outerOf(Z.Ca) === 2)
check('the appetite line never prints the partner or the answer', M.appetiteOf(Z.Na) === '1 outer · gives 1' && M.appetiteOf(Z.O) === '6 outer · takes 2')
check('a noble gas states a full shell rather than an appetite', M.appetiteOf(Z.Ne) === '8 outer · full shell')

/* ---- formulae and IUPAC ordering ---- */
check('water', f('H', 'O') === 'H₂O')
check('ammonia is NH₃, never H₃N (the H_FOLLOWS set)', f('H', 'N') === 'NH₃' && f('N', 'H') === 'NH₃')
check('methane is CH₄', f('C', 'H') === 'CH₄')
check('phosphine is PH₃', f('P', 'H') === 'PH₃')
check('but hydrogen leads a halogen: HCl', f('H', 'Cl') === 'HCl')
check('and hydrogen leads oxygen and sulfur', f('H', 'S') === 'H₂S')
check('a metal always leads: NaCl, CaO, MgCl₂', f('Na', 'Cl') === 'NaCl' && f('Ca', 'O') === 'CaO' && f('Mg', 'Cl') === 'MgCl₂')
check('the order does not depend on which pad you filled first', f('Cl', 'Na') === 'NaCl' && f('O', 'Ca') === 'CaO')
check('valencies cross and cancel: Al₂O₃, not Al₆O₆', f('Al', 'O') === 'Al₂O₃')
check('silica', f('Si', 'O') === 'SiO₂')
check('two of the same element make a pair: O₂, N₂, H₂', f('O', 'O') === 'O₂' && f('N', 'N') === 'N₂' && f('H', 'H') === 'H₂')
check('a noble gas has no formula at all', f('Ne', 'O') === null && f('He', 'H') === null)
check('two metals have no formula — they mix', f('Na', 'K') === null && f('Ca', 'Mg') === null)

/* ---- the four outlooks ---- */
check('metal + non-metal swaps', M.pairOutlook(Z.Na, Z.Cl).kind === 'swap')
check('two non-metals share', M.pairOutlook(Z.H, Z.O).kind === 'share')
check('two metals mix only', M.pairOutlook(Z.Na, Z.K).kind === 'mix')
check('anything + a noble gas refuses', M.pairOutlook(Z.Ne, Z.Na).kind === 'refuse' && M.pairOutlook(Z.C, Z.Ar).kind === 'refuse')
check('the outlook is the same whichever pad an element sits on', M.pairOutlook(Z.Cl, Z.Na).kind === 'swap')

/* ---- THE SPOILER CHECK ---- */
/*
 * A readout once printed "H₂O · Ratio 2 : 1" directly above a dial asking the
 * learner to guess the ratio. No error, no visible fault, and every prediction
 * in the cabinet silently became a reading-comprehension exercise.
 *
 * So: walk all 400 ordered pairs and fail if any outlook — tag or reasoning —
 * carries a subscript, the word "ratio", or the formula it precedes.
 */
{
  const SUBS = /[₀₁₂₃₄₅₆₇₈₉]/
  const bad = []
  for (const a of M.ELEMENTS) {
    for (const b of M.ELEMENTS) {
      const look = M.pairOutlook(a.z, b.z)
      const said = `${look.tag} ${look.why}`
      const formula = M.formulaFor(a.z, b.z)
      if (SUBS.test(said)) bad.push(`${a.symbol}+${b.symbol}: subscript in "${said}"`)
      if (/\bratios?\b/i.test(said)) bad.push(`${a.symbol}+${b.symbol}: the word "ratio"`)
      if (formula && said.includes(formula.text)) bad.push(`${a.symbol}+${b.symbol}: prints ${formula.text}`)
      if (/\b\d+\s*:\s*\d+\b/.test(said)) bad.push(`${a.symbol}+${b.symbol}: a ratio pair in "${said}"`)
    }
  }
  check(`THE SPOILER CHECK — all ${M.ELEMENTS.length ** 2} pairs say what happens, never the number`, bad.length === 0, bad.slice(0, 3).join(' | '))
}
{
  // The same rule for the appetite lines: they are on screen beside the dial.
  const SUBS = /[₀₁₂₃₄₅₆₇₈₉]/
  const bad = M.ELEMENTS.filter((e) => SUBS.test(M.appetiteOf(e.z)) || /\bratios?\b/i.test(M.appetiteOf(e.z)))
  check('THE SPOILER CHECK — no appetite line carries a subscript or a ratio', bad.length === 0, bad.map((e) => e.symbol).join(','))
}

/* ---- where the counting rule runs out ---- */
// Sulfur's valency is min(6 outer, 2 room) = 2, so the counting rule really does
// say SO — the note's prose said SO₂ and the note's prose was recalling the
// answer, not the rule. What matters is that the caveat names what is real.
check('S + O is named as unsettled, with the real answer said out loud', /SO₂/.test(r('S', 'O').caveat ?? '') && /SO₃/.test(r('S', 'O').caveat ?? ''))
check('N + O is named as unsettled', /NO₂|N₂O/.test(r('N', 'O').caveat ?? ''))
check('Ca + C names calcium carbide', /CaC₂/.test(r('Ca', 'C').caveat ?? ''))
check('Mg + C and Li + C are named too', r('Mg', 'C').caveat !== null && r('Li', 'C').caveat !== null)
check('a pair the rule handles has no caveat', r('Na', 'Cl').caveat === null && r('H', 'O').caveat === null)
check('a caveat is a footnote, not a refusal — the rule still shows its working', r('S', 'O').formula?.text === 'SO' && r('N', 'O').formula?.text === 'N₂O₃')

/* ---- structure: four words for four things ---- */
check('salt is a lattice, and the note says it has no molecules in it', r('Na', 'Cl').structure === 'lattice' && /no molecules/i.test(M.STRUCTURE_NOTES.lattice))
check('water is separate molecules', r('H', 'O').structure === 'molecule')
check('silica is a giant network, not a molecule', r('Si', 'O').structure === 'network')
check('O₂ is an element, not a compound', r('O', 'O').structure === 'free molecules')
check('two metals make a mixture', r('Na', 'K').structure === 'mixture')
check('a noble gas makes nothing at all', r('Ne', 'Na').structure === null)

/* ---- shape: VSEPR, counted ---- */
check('water is bent — two neighbours, two lone pairs', r('H', 'O').shape === 'bent')
check('ammonia is trigonal pyramidal', r('H', 'N').shape === 'trigonal pyramidal')
check('methane is tetrahedral', r('C', 'H').shape === 'tetrahedral')
check('carbon dioxide is linear', r('C', 'O').shape === 'linear')
check('shapes are counted, not looked up: 2 neighbours + 2 lone pairs is always bent', M.shapeOf(Z.O, 2, 2) === 'bent' && M.shapeOf(Z.S, 2, 2) === 'bent')
check('and 4 neighbours with none left over is always tetrahedral', M.shapeOf(Z.C, 4, 0) === 'tetrahedral')
check('a lattice has no molecular shape', r('Na', 'Cl').shape === 'none')

/* ---- ionic character: a slope, not a switch ---- */
{
  const naCl = M.ionicCharacter(Z.Na, Z.Cl)
  const hCl = M.ionicCharacter(Z.H, Z.Cl)
  const oo = M.ionicCharacter(Z.O, Z.O)
  check('NaCl is strongly ionic', naCl > 0.65 && naCl < 1)
  check('HCl is the same kind of bond, weaker — not a different kind', hCl > 0.1 && hCl < naCl)
  check('an element with itself has no ionic character at all', oo === 0)
  check('a noble gas has no electronegativity to compare', M.ionicCharacter(Z.Ne, Z.Na) === null)
}

/* ---- the ratio question, asked the way it is answered ---- */
{
  const water = M.ratioQuestion(M.formulaFor(Z.H, Z.O))
  check('water asks for the hydrogens, per one oxygen', water.askSymbol === 'H' && water.perSymbol === 'O' && water.answer === 2)
  check('and the question text names the element being counted first', /hydrogen atoms for every one oxygen/.test(water.text))
  const salt = M.ratioQuestion(M.formulaFor(Z.Na, Z.Cl))
  check('salt is one for one, and the question still parses', salt.answer === 1)
  const alumina = M.ratioQuestion(M.formulaFor(Z.Al, Z.O))
  check('alumina, where neither subscript is 1, still asks a question it can mark', alumina.answer === 2 || alumina.answer === 3)
  // the bug this function exists to prevent
  let backwards = 0
  for (const a of M.ELEMENTS) {
    for (const b of M.ELEMENTS) {
      const fo = M.formulaFor(a.z, b.z)
      if (!fo || fo.parts.length !== 2) continue
      const q = M.ratioQuestion(fo)
      const want = fo.parts.find(([sym]) => sym === q.askSymbol)?.[1]
      if (q.answer !== want) backwards += 1
    }
  }
  check('every ratio question is marked against the subscript it actually asked for', backwards === 0, `${backwards} backwards`)
}

/* ---- the ratio question never leaks the answer either ---- */
{
  const SUBS = /[₀₁₂₃₄₅₆₇₈₉]/
  const bad = []
  for (const a of M.ELEMENTS) {
    for (const b of M.ELEMENTS) {
      const fo = M.formulaFor(a.z, b.z)
      if (!fo || fo.parts.length !== 2) continue
      const q = M.ratioQuestion(fo)
      if (SUBS.test(q.text) || q.text.includes(fo.text) || new RegExp(`\\b${q.answer}\\b`).test(q.text)) {
        bad.push(`${a.symbol}+${b.symbol}: "${q.text}"`)
      }
    }
  }
  check('THE SPOILER CHECK — no ratio question contains its own answer', bad.length === 0, bad.slice(0, 3).join(' | '))
}

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
