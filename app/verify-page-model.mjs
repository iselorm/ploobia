/**
 * The field guide's book, tested out of band.
 *
 * The rule of the guide is that a word on a page is a verb in the world, so
 * the checks here are about honesty rather than prose: every braced term in
 * every layer of every page resolves to a verb the Sugar Line declares (or a
 * layer of the page's own figure); every practical's level exists in the
 * cabinet and every stamp it names is a real syllabus statement; every band
 * has a non-empty layer; no syllabus number leaks into learner-facing text;
 * and the ledger's four-line record behaves — a hand-in alone stamps
 * nothing, the explanation closes it, a check page stamps on commit.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const OUT = '/tmp/page-bundle-suite.mjs'
fs.writeFileSync(
  '/tmp/page-barrel.ts',
  `export * from '${path.resolve('src/lib/page')}'
export * from '${path.resolve('src/lib/curriculum')}'
export * from '${path.resolve('src/lib/verbs')}'
export * from '${path.resolve('src/lib/sugarverbs')}'
export { BOOK_0610 } from '${path.resolve('src/books/biology/index')}'
export { SUGAR_CHALLENGES } from '${path.resolve('src/lib/sugarchallenge')}'
`,
)
execSync(`npx esbuild /tmp/page-barrel.ts --bundle --format=esm --outfile=${OUT} --alias:@=${path.resolve('src')}`, {
  stdio: 'pipe',
})
const M = await import(OUT)

let fails = 0
let passes = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)
  if (ok) passes += 1
  else fails += 1
}

const BANDS = ['explorer', 'scientist', 'analyst']
const book = M.BOOK_0610
const sections = M.sectionsOf(book)
const verbs = new Set(M.SUGAR_VERBS)
const statements = new Set(M.STATEMENTS.map((s) => s.id))
const levels = new Set((M.SUGAR_CHALLENGES ?? []).map((p) => p.id))

/* ------------------------------------------------------------------ */
/* The markup                                                          */
/* ------------------------------------------------------------------ */
{
  const t = M.parseMarkup('A {leaf:plant/canopy} is a {factory:x/y|the gloss}. Plain {broken} text.')
  check('parses a term', t[1]?.kind === 'term' && t[1].verb === 'plant/canopy' && t[1].text === 'leaf')
  check('parses a gloss', t[3]?.kind === 'term' && t[3].gloss === 'the gloss')
  check('leaves a brace that is not a term as text', t.some((x) => x.kind === 'text' && x.text.includes('{broken}')))
  check('plainText strips the braces', M.plainText('{Xylem:stem/xylem} carries {water:xylem/flow}') === 'Xylem carries water')
  check('verbsIn lists each verb once', M.verbsIn('{a:x/y} {b:x/y} {c:p/q}').join(',') === 'x/y,p/q')
  check('digits stay Western in every language', Object.values(M.DIGITS).every((d) => d === 'western'))
  check('formatDigits is the identity for Arabic while the flag says so', M.formatDigits('12 mg', 'ar') === '12 mg')
  check('Arabic is the right-to-left layout case', M.isRtl('ar') && !M.isRtl('sw'))
}

/* ------------------------------------------------------------------ */
/* Every term is a verb; every band has words; no numbers leak         */
/* ------------------------------------------------------------------ */
{
  check('the book has two chapters, 6 then 8', book.chapters.map((c) => c.code).join(',') === '6,8')
  check('six sections', sections.length === 6, sections.map((s) => s.code).join(' '))
  const bad = []
  const numberLeak = []
  let terms = 0
  for (const s of sections) {
    for (const p of s.pages) {
      const texts = []
      if (p.text) for (const b of BANDS) texts.push([b, M.layerFor(p.text, b).en])
      if (p.ext) texts.push(['ext', p.ext.en])
      for (const [b, src] of texts) {
        for (const v of M.verbsIn(src)) {
          terms += 1
          if (!verbs.has(v) && !v.startsWith('figure/')) bad.push(`${s.code} ${p.id} [${b}] ${v}`)
        }
        if (/\b\d\.\d\.\d+\b/.test(M.plainText(src))) numberLeak.push(`${s.code} ${p.id} [${b}]`)
      }
      if (p.figure && !verbs.has(p.figure)) bad.push(`${s.code} ${p.id} figure ${p.figure}`)
    }
  }
  check(`every braced term resolves to a Sugar Line verb (${terms} terms)`, bad.length === 0, bad.join('; '))
  check('no syllabus number appears in learner-facing text', numberLeak.length === 0, numberLeak.join('; '))
  const thin = []
  for (const s of sections)
    for (const p of s.pages)
      if (p.text)
        for (const b of BANDS) {
          const words = M.plainText(M.layerFor(p.text, b).en).split(/\s+/).length
          if (words < 25) thin.push(`${s.code} ${p.id} ${b} ${words}w`)
        }
  check('every reading page has at least 25 words at every band', thin.length === 0, thin.join('; '))
  const long = []
  for (const s of sections)
    for (const p of s.pages)
      if (p.text) {
        const words = M.plainText(M.layerFor(p.text, 'explorer').en).split(/\s+/).length
        if (words > 90) long.push(`${s.code} ${p.id} ${words}w`)
      }
  check('no Explorer page is a wall of text (≤ 90 words)', long.length === 0, long.join('; '))
  const figureVerbs = M.bookVerbs(book).filter((v) => v.startsWith('figure/'))
  check('the leaf figure has its layers as verbs', ['figure/palisade', 'figure/stoma', 'figure/vascular'].every((v) => figureVerbs.includes(v)))
  const declaredUnused = M.SUGAR_VERBS.filter((v) => !M.bookVerbs(book).includes(v))
  check('most declared verbs are used by a page', declaredUnused.length <= 8, `unused: ${declaredUnused.join(', ')}`)
}

/* ------------------------------------------------------------------ */
/* Practicals and stamps                                               */
/* ------------------------------------------------------------------ */
{
  const bad = []
  for (const s of sections)
    for (const p of s.pages) {
      if (p.practical) {
        for (const [b, lv] of Object.entries(p.practical.level)) if (!levels.has(lv)) bad.push(`${s.code} ${b} level ${lv}`)
        for (const id of p.practical.stamps) if (!statements.has(id)) bad.push(`${s.code} stamp ${id}`)
        for (const id of p.practical.stamps) if (!s.statements.includes(id)) bad.push(`${s.code} stamps a statement outside itself: ${id}`)
      }
      if (p.check)
        for (const [b, item] of Object.entries(p.check)) {
          for (const id of item.stamps) if (!statements.has(id)) bad.push(`${s.code} check ${b} stamp ${id}`)
          if (item.kind === 'pick' && (item.answer < 0 || item.answer >= item.options.length)) bad.push(`${s.code} check ${b} answer index`)
          if (item.kind === 'write' && item.points.length < 2) bad.push(`${s.code} check ${b} needs points`)
        }
    }
  check('every practical level exists and every stamp is a real statement of its own section', bad.length === 0, bad.join('; '))

  const undiscovered = sections.find((s) => s.code === '8.2')
  const pr = undiscovered.pages.find((p) => p.practical)
  check('8.2 points at an undiscovered door with no level and no stamps', pr && Object.keys(pr.practical.level).length === 0 && pr.practical.stamps.length === 0)
  const built = sections.filter((s) => s.code !== '8.2')
  check('every other section has a level for every band', built.every((s) => s.pages.some((p) => p.practical && BANDS.every((b) => p.practical.level[b]))))
  check('every practical carries an explanation item for every band', built.every((s) => s.pages.some((p) => p.practical && BANDS.every((b) => p.practical.explain?.[b]))))
  check('the explanation items stamp the section\'s statements', built.every((s) => s.pages.every((p) => !p.practical || BANDS.every((b) => JSON.stringify(p.practical.explain[b].stamps) === JSON.stringify(p.practical.stamps)))))

  // The check page only where the practical cannot stamp a statement on its own (decision 3).
  for (const s of sections) {
    const door = new Set(s.pages.flatMap((p) => p.practical?.stamps ?? []))
    const checkPage = s.pages.find((p) => p.kind === 'check')
    if (!checkPage) continue
    const checkIds = new Set(Object.values(checkPage.check).flatMap((i) => i.stamps))
    const overlap = [...checkIds].filter((id) => door.has(id))
    check(`${s.code}: the check page covers only what the door cannot`, overlap.length === 0, overlap.join(','))
  }
  // Supplement statements are set only to Analyst.
  const suppToLower = []
  for (const s of sections)
    for (const p of s.pages) {
      if (!p.check) continue
      for (const b of ['explorer', 'scientist'])
        for (const id of p.check[b]?.stamps ?? []) if (M.STATEMENT_BY_ID[id].tier === 'supplement') suppToLower.push(`${s.code} ${b} ${id}`)
    }
  check('no Supplement statement is set below Analyst on a check page', suppToLower.length === 0, suppToLower.join('; '))
  check('pagesFor hides the check page from a band that has none', M.pagesFor(sections.find((s) => s.code === '8.1'), 'explorer').every((p) => p.kind !== 'check') && M.pagesFor(sections.find((s) => s.code === '8.1'), 'analyst').some((p) => p.kind === 'check'))
  check('sectionForStage opens the stem on 8.1', M.sectionForStage(book, 'stem')?.code === '8.1')
  check('sectionForStage opens the plant on 6.1', M.sectionForStage(book, 'plant')?.code === '6.1')
}

/* ------------------------------------------------------------------ */
/* The four-line record                                                */
/* ------------------------------------------------------------------ */
{
  M.resetCurriculum()
  M.notePrediction('cut-the-ring', '0.4 (it is 0.5)')
  M.noteHandIn({ cabinet: 'photosynthesis', source: 'cut-the-ring', action: 'ring cut', observed: 'export 0.4', stamps: ['0610:8.1.1', '0610:8.1.2'] })
  check('a hand-in alone stamps nothing', !M.isStamped('0610:8.1.1'))
  check('the hand-in waits as a pending record with three lines', M.pendingFor('cut-the-ring')?.prediction === '0.4 (it is 0.5)' && M.pendingFor('cut-the-ring')?.observed === 'export 0.4')
  const rec = M.explainHandIn('cut-the-ring', 'sugar in the phloem, water in the xylem', 'right')
  check('the explanation closes the record and stamps every statement it named', M.isStamped('0610:8.1.1') && M.isStamped('0610:8.1.2') && rec.kind === 'practical')
  check('the record carries all four lines', rec.prediction && rec.action && rec.observed && rec.explanation)
  check('the pending slot is cleared', M.pendingFor('cut-the-ring') === null)
  M.noteHandIn({ cabinet: 'photosynthesis', source: 'x', action: '', observed: '', stamps: [] })
  check('a hand-in with no stamps records nothing', M.pendingAll().length === 0)
  M.stampCheck({ cabinet: 'photosynthesis', source: '0610:8.4:8.4.check', stamps: ['0610:8.4.3'], explanation: 'A sink', grade: 'right' })
  check('a check page stamps on commit, as a check record', M.stampsFor('0610:8.4.3')[0]?.kind === 'check')
  check('a wrong answer still goes in the record, honestly', (M.stampCheck({ cabinet: 'p', source: 's', stamps: ['0610:6.1.6'], explanation: 'Iron', grade: 'wrong' }).grade === 'wrong') && M.stampsFor('0610:6.1.6')[0].grade === 'wrong')
  M.resetCurriculum()
  check('reset clears it', M.pendingAll().length === 0 && !M.isStamped('0610:8.1.1'))
}

/* ------------------------------------------------------------------ */
/* The registry                                                        */
/* ------------------------------------------------------------------ */
{
  let moved = 0
  const off = M.registerVerbs('t', { 'a/b': () => { moved += 1 } })
  check('runVerb fires a registered verb', M.runVerb('a/b') && moved === 1)
  check('runVerb refuses an unknown verb', M.runVerb('no/such') === false)
  check('verbRuns counts', M.verbRuns().runs >= 1 && M.verbRuns().last === 'a/b')
  off()
  check('unregisterScope clears a scope', !M.hasVerb('a/b'))
  check('parseVerbId splits', M.parseVerbId('stem/xylem').verb === 'xylem' && M.parseVerbId('bad') === null)
  check('the Sugar Line declares every verb the storyboard catalogued', ['stem/xylem', 'phloem/flow', 'starch/bank', 'leaf/wilt', 'specimen/cactus', 'air/dry'].every((v) => verbs.has(v)))
}

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
