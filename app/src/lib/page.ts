/**
 * The page grammar of the field guide.
 *
 * A section of the guide is three or four pages — the story, the rule, the
 * practical (which is a cabinet door, run exactly as the game grammar runs
 * it) and, only where the door cannot stamp a statement on its own, a check.
 * One page source carries all three band layers; `BAND_CAPS` never picks a
 * separate book, it picks a layer.
 *
 * The markup is StoryComet's, grown up:
 *
 *   {term:object/verb}            a tappable term; the narrator reaching it fires the verb
 *   {term:object/verb|gloss}      with a gloss (shown as a title / on long-press)
 *   {{ext}} … {{/ext}}            Supplement text — Analyst only
 *
 * The practical and figure directives live as typed fields on the page rather
 * than in the text, so the model suite can read them without parsing prose.
 *
 * Text is language-keyed per line (`en`, and slots for `tw`, `ha`, `fr`, `sw`,
 * `ar`); the verbs are not. Digits stay Western in every language (decision 4,
 * 11 Sep) — kept as a formatter flag so it can be revisited without touching a
 * page.
 *
 * Rule of the house: a term that cannot be a verb in the scene is not a term.
 * The parser never invents one; the suites check that every term resolves.
 */

import type { Band } from './bands'

export type Lang = 'en' | 'tw' | 'ha' | 'fr' | 'sw' | 'ar'

/** One line of text in every language it has. English is the build language. */
export type Localised = { en: string } & Partial<Record<Exclude<Lang, 'en'>, string>>

/** The band layers of one page's text. A layer left out falls back downward. */
export interface Layered {
  explorer: Localised
  scientist?: Localised
  analyst?: Localised
}

export type PageKind = 'story' | 'rule' | 'practical' | 'check' | 'journal'

/**
 * A journal page (The Stall Book, review 2, 13 Sep).
 *
 * A field guide explains and then asks; a field JOURNAL records what you
 * found and then names it. So the order on the page is fixed: the discovery
 * in the learner's own numbers, one sentence that gives it a name, and only
 * then — folded, behind "Show me how →" — the method, the prose and the
 * Analyst's notation. A page nobody has earned shows its name and nothing
 * else: never the formula before the day that produced it.
 *
 * `${key}` in any line is replaced from the learner's own record by `fill`.
 * A page with no record is LOCKED: `locked` is all that is shown.
 */
export interface JournalPage {
  /** What the day proved, big, in their numbers — `${sum}` is the usual fill. */
  discovery: Localised
  /** Which day it came from, and what the alley did. */
  provenance: Localised
  /** One sentence that names it. Page markup: the term is a verb. */
  names: Layered
  /** Folded under "Show me how →": the method with `${key}` fills. */
  how: Layered
  /** The Analyst's notation, folded with the method, never missing. */
  notation?: Localised
  /** The remote control back into the world: label → verb id. */
  tryIt?: Array<{ label: Localised; verb: string }>
  /** What an undiscovered page says — a name, and no more. */
  locked: Localised
  /** Which syllabus statements a filled page is evidence for (ledger only). */
  stamps?: string[]
}

export interface Practical {
  /** The cabinet door, by campaign stage tab (`plant`, `hatches`, `stem` …). */
  door: string
  /** Level preset ids by band — the practical is the band's own level. */
  level: Partial<Record<Band, string>>
  /** Which syllabus statement ids a hit hand-in is evidence for. */
  stamps: string[]
  /**
   * When a door proves different statements at different depths, the
   * statements each band's hand-in actually evidences — a subset of `stamps`
   * (which stays the union the ledger lists). Absent means every band stamps
   * all of `stamps`. The Pond needs it: an Explorer never meets the indicator
   * tube (6.1.9) or the ceiling (6.1.11), so their hit must not claim them.
   */
  stampsBy?: Partial<Record<Band, string[]>>
  /** What the round wants, in the learner's words. */
  line: Localised
  /**
   * The fourth line of the evidence record. After a hit hand-in the page asks
   * the learner to explain what happened — a pick at Explorer and Scientist,
   * a written line marked against its points at Analyst — and only then does
   * the hand-in stamp. Keyed by band, falling back downward like text layers.
   */
  explain?: Partial<Record<Band, CheckPick | CheckWrite>>
}

export interface CheckPick {
  kind: 'pick'
  /** Statement ids this check is evidence for. */
  stamps: string[]
  question: Localised
  options: Localised[]
  /** Index into `options`. */
  answer: number
  /** Said the moment the pick is committed, right or wrong. */
  reveal: Localised
}

export interface CheckWrite {
  kind: 'write'
  stamps: string[]
  question: Localised
  marks: number
  /** The model answer, unfolded only after the learner has committed a line. */
  model: Localised
  /** The points the mark scheme wants, one per line, for self-marking. */
  points: Localised[]
}

export type Check = Partial<Record<Band, CheckPick | CheckWrite>>

export interface Page {
  id: string
  kind: PageKind
  title: Localised
  /** The page's text, in band layers, in the page markup. Empty for a practical page. */
  text?: Layered
  /** Supplement (Extended) text — rendered only at Analyst. In the page markup. */
  ext?: Localised
  /** A scene state the page sets when it opens — a verb id. */
  figure?: string
  practical?: Practical
  check?: Check
  journal?: JournalPage
}

export interface Section {
  id: string
  /** Syllabus sub-topic number, e.g. `8.1` — ledger and parent view only. */
  code: string
  title: Localised
  /** Statement ids this section covers, in the syllabus's order. */
  statements: string[]
  pages: Page[]
  /** The cabinet stage this section reads best from. */
  stage: string
}

export interface Chapter {
  id: string
  code: string
  title: Localised
  sections: Section[]
}

export interface Book {
  id: string
  subject: string
  /** Syllabus code, e.g. `0610`. */
  syllabus: string
  cabinet: string
  chapters: Chapter[]
}

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

export type Token =
  | { kind: 'text'; text: string }
  | { kind: 'term'; text: string; verb: string; gloss?: string }

/**
 * Parse one page's markup into tokens.
 *
 * `{term:object/verb}` and `{term:object/verb|gloss}` become terms; anything
 * else is text. A brace that does not parse is left as text rather than
 * swallowed — the suite will notice, and a learner sees words, not a hole.
 */
export function parseMarkup(src: string): Token[] {
  const out: Token[] = []
  const re = /\{([^{}:]+):([^{}|]+?)(?:\|([^{}]*))?\}/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ kind: 'text', text: src.slice(last, m.index) })
    const verb = m[2].trim()
    if (!/^[a-z0-9_-]+\/[a-z0-9_-]+$/i.test(verb)) {
      out.push({ kind: 'text', text: m[0] })
    } else {
      out.push({ kind: 'term', text: m[1], verb, gloss: m[3]?.trim() || undefined })
    }
    last = m.index + m[0].length
  }
  if (last < src.length) out.push({ kind: 'text', text: src.slice(last) })
  return out
}

/** Every verb id a page's markup names, in order, without repeats. */
export function verbsIn(src: string): string[] {
  const seen = new Set<string>()
  for (const t of parseMarkup(src)) if (t.kind === 'term') seen.add(t.verb)
  return [...seen]
}

/** The markup with the braces removed — what a narrator reads and a suite greps. */
export function plainText(src: string): string {
  return parseMarkup(src)
    .map((t) => t.text)
    .join('')
}

/* ------------------------------------------------------------------ */
/* Layers and languages                                                */
/* ------------------------------------------------------------------ */

const BAND_ORDER: Band[] = ['explorer', 'scientist', 'analyst']

/** The text layer for a band, falling back to the nearest simpler layer. */
export function layerFor(layered: Layered, band: Band): Localised {
  const i = BAND_ORDER.indexOf(band)
  for (let k = i; k >= 0; k -= 1) {
    const l = layered[BAND_ORDER[k]]
    if (l) return l
  }
  return layered.explorer
}

/** A line in the wanted language, or English. The academic term stays English either way. */
export function lineIn(l: Localised, lang: Lang = 'en'): string {
  return l[lang] ?? l.en
}

/**
 * Digits: Western everywhere (decision 4, 11 Sep). The flag exists so the
 * Arabic voice can be revisited without touching a page.
 */
export const DIGITS: Record<Lang, 'western' | 'eastern-arabic'> = {
  en: 'western',
  tw: 'western',
  ha: 'western',
  fr: 'western',
  sw: 'western',
  ar: 'western',
}

const EASTERN = '٠١٢٣٤٥٦٧٨٩'

export function formatDigits(text: string, lang: Lang = 'en'): string {
  if (DIGITS[lang] !== 'eastern-arabic') return text
  return text.replace(/[0-9]/g, (d) => EASTERN[Number(d)])
}

/** Right-to-left is a layout case, not a patch: the page card and the ledger swap sides. */
export function isRtl(lang: Lang): boolean {
  return lang === 'ar'
}

/* ------------------------------------------------------------------ */
/* Walking a book                                                      */
/* ------------------------------------------------------------------ */

export function sectionsOf(book: Book): Section[] {
  return book.chapters.flatMap((c) => c.sections)
}

export function findSection(book: Book, id: string): Section | undefined {
  return sectionsOf(book).find((s) => s.id === id)
}

/**
 * Substitute `${key}` from a record of the learner's own figures. A key with
 * no value leaves the page honest rather than wrong: the line is dropped by
 * the caller (a locked page), never printed with a hole in it.
 */
export function fill(src: string, keys: Record<string, string>): string {
  return src.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (whole, k: string) => keys[k] ?? whole)
}

/** Every `${key}` a line asks for. */
export function fillKeys(src: string): string[] {
  const out = new Set<string>()
  for (const m of src.matchAll(/\$\{([a-zA-Z0-9_]+)\}/g)) out.add(m[1])
  return [...out]
}

/** The pages a band sees: the check page only where that band has one. */
export function pagesFor(section: Section, band: Band): Page[] {
  return section.pages.filter((p) => p.kind !== 'check' || !!p.check?.[band])
}

/** Every verb a book asks of its cabinet — for the suites and the registry. */
export function bookVerbs(book: Book): string[] {
  const seen = new Set<string>()
  for (const s of sectionsOf(book))
    for (const p of s.pages) {
      if (p.text) for (const l of Object.values(p.text)) if (l) for (const v of verbsIn(l.en)) seen.add(v)
      if (p.ext) for (const v of verbsIn(p.ext.en)) seen.add(v)
      if (p.figure) seen.add(p.figure)
    }
  return [...seen]
}

/** The section that reads best from a cabinet stage — the guide opens here. */
export function sectionForStage(book: Book, stage: string): Section | undefined {
  return sectionsOf(book).find((s) => s.stage === stage)
}
