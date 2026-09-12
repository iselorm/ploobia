/**
 * The page card — one page of the field guide, pulled open inside a cabinet.
 *
 * It takes the parts column while the learner reads (decision 2, 11 Sep) and
 * gives it back the moment a practical starts. Every braced term on the page
 * is a button: tapping it fires the term's verb on the cabinet's sim through
 * `lib/verbs`, and "Read to me" lights each term as the voice reaches it and
 * fires the same verb — text, voice and scene sharing one vocabulary.
 *
 * Four kinds of page: the story and the rule read; the practical is the
 * door (it opens the cabinet's own brief, unchanged, and afterwards asks for
 * the explanation that closes the evidence record); the check is the quiz
 * grown up — Explorer picks, Analyst writes and marks against the points,
 * always committed before the model answer unfolds.
 *
 * Chapter and statement numbers never appear here: they live in the ledger
 * beside the page, which is the grown-ups' view.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, Play, Square, Volume2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Band } from '@/lib/bands'
import { BAND_META } from '@/lib/bands'
import {
  layerFor,
  lineIn,
  pagesFor,
  parseMarkup,
  sectionsOf,
  type Book,
  type CheckPick,
  type CheckWrite,
  type Page,
  type Section,
  type Token,
} from '@/lib/page'
import { hasVerb, runVerb } from '@/lib/verbs'
import { readAloud, stopNarration, narrationAvailable } from '@/lib/narrator'
import { explainHandIn, pendingFor, stampCheck, useCurriculum, type Grade } from '@/lib/curriculum'
import { Tile } from '@/components/ui/tile'
import { Chip } from '@/components/sugar/hud/AtlasKit'
import SectionFigure from './SectionFigure'
import { FIGURE_LAYERS, type FigureKind } from './figures'

export interface GuideLocation {
  sectionId: string
  page: number
}

interface Props {
  book: Book
  band: Band
  cabinet: string
  where: GuideLocation
  onNavigate: (to: GuideLocation) => void
  onClose: () => void
  /** Open the cabinet's brief for a door (the campaign stage tab). */
  onStartPractical: (door: string) => void
  /** Phone tier: tighter type, no contents rail. */
  compact?: boolean
}

/* ------------------------------------------------------------------ */
/* The figure verbs the page answers itself                            */
/* ------------------------------------------------------------------ */

/** Which of the page's own figures a set of `figure/<layer>` verbs belongs to. */
function figureKindFor(keys: string[]): FigureKind | null {
  for (const kind of Object.keys(FIGURE_LAYERS) as FigureKind[])
    if (keys.some((k) => FIGURE_LAYERS[kind].some((l) => l.key === k))) return kind
  return null
}

function figureSays(kind: FigureKind, key: string | null): string {
  if (!key) return 'tap a term, or a layer'
  return FIGURE_LAYERS[kind].find((l) => l.key === key)?.says ?? ''
}

/* ------------------------------------------------------------------ */
/* Text with terms                                                     */
/* ------------------------------------------------------------------ */

interface Segment {
  token: Token
  /** Character offset of this token in the plain text the narrator reads. */
  start: number
  end: number
}

function segment(src: string): Segment[] {
  let pos = 0
  return parseMarkup(src).map((token) => {
    const start = pos
    pos += token.text.length
    return { token, start, end: pos }
  })
}

function Terms({
  segments,
  now,
  onTerm,
  compact,
}: {
  segments: Segment[]
  now: number | null
  onTerm: (verb: string, index: number) => void
  compact?: boolean
}) {
  return (
    <p className={cn('atlas-serif leading-relaxed text-[#2A2823]', compact ? 'text-[13px]' : 'text-[14.5px]')}>
      {segments.map((s, i) => {
        if (s.token.kind === 'text') return <span key={i}>{s.token.text}</span>
        const verb = s.token.verb
        const live = hasVerb(verb) || verb.startsWith('figure/')
        if (!live) return <span key={i}>{s.token.text}</span>
        const tone = verb.startsWith('xylem') || verb.startsWith('water') || verb.startsWith('air')
          ? 'border-[#2E6DA8]'
          : verb.startsWith('leaf') || verb.startsWith('plant') || verb.startsWith('figure')
            ? 'border-[#2F6134]'
            : 'border-[#D9A441]'
        return (
          <button
            key={i}
            type="button"
            data-verb={verb}
            data-testid="guide-term"
            title={s.token.gloss}
            onClick={() => onTerm(verb, i)}
            className={cn(
              'guide-term inline cursor-pointer border-b-2 border-dotted bg-transparent p-0 font-semibold text-inherit transition-colors',
              tone,
              now === i && 'rounded-sm bg-[#F3DFB2] px-0.5',
            )}
          >
            {s.token.text}
          </button>
        )
      })}
    </p>
  )
}

/* ------------------------------------------------------------------ */
/* Checks                                                              */
/* ------------------------------------------------------------------ */

function PickItem({
  item,
  source,
  cabinet,
  onDone,
  mode,
}: {
  item: CheckPick
  source: string
  cabinet: string
  mode: 'check' | 'explain'
  onDone?: (grade: Grade) => void
}) {
  const [picked, setPicked] = useState<number | null>(null)
  const commit = (i: number) => {
    if (picked !== null) return
    setPicked(i)
    const grade: Grade = i === item.answer ? 'right' : 'wrong'
    const explanation = lineIn(item.options[i])
    if (mode === 'check') stampCheck({ cabinet, source, stamps: item.stamps, explanation, grade })
    else explainHandIn(source, explanation, grade)
    onDone?.(grade)
  }
  return (
    <div data-testid={`guide-${mode}`}>
      <p className="atlas-serif text-[14px] leading-snug font-semibold text-[#2A2823]">{lineIn(item.question)}</p>
      <div className="mt-2 flex flex-col gap-1.5">
        {item.options.map((o, i) => (
          <Tile
            key={i}
            onClick={() => commit(i)}
            disabled={picked !== null}
            aria-label={lineIn(o)}
            className={cn(
              'rounded-xl border px-3 py-1.5 text-left text-[12.5px] font-bold transition-colors',
              picked === null && 'border-[#E4DCC9] bg-[#FCFAF4] text-[#4A4438] hover:bg-[#F1ECDE]',
              picked !== null && i === item.answer && 'border-[#C8DFC2] bg-[#E7F1E3] text-[#2F6134]',
              picked !== null && i === picked && i !== item.answer && 'border-[#EFC9A6] bg-[#FBEEE0] text-[#96591C]',
              picked !== null && i !== picked && i !== item.answer && 'border-[#E4DCC9] bg-[#F6F2E8] text-[#B9B09A]',
            )}
          >
            {lineIn(o)}
          </Tile>
        ))}
      </div>
      {picked !== null && (
        <p data-testid="guide-reveal" className="mt-2 text-[12px] leading-snug font-semibold text-[#4A4438]">
          {lineIn(item.reveal)}
        </p>
      )}
    </div>
  )
}

function WriteItem({
  item,
  source,
  cabinet,
  mode,
  onDone,
}: {
  item: CheckWrite
  source: string
  cabinet: string
  mode: 'check' | 'explain'
  onDone?: (grade: Grade) => void
}) {
  const [text, setText] = useState('')
  const [committed, setCommitted] = useState(false)
  const [grade, setGrade] = useState<Grade | null>(null)
  const mark = (g: Grade) => {
    if (grade) return
    setGrade(g)
    if (mode === 'check') stampCheck({ cabinet, source, stamps: item.stamps, explanation: text, grade: g })
    else explainHandIn(source, text, g)
    onDone?.(g)
  }
  return (
    <div data-testid={`guide-${mode}`}>
      <p className="atlas-serif text-[14px] leading-snug font-semibold text-[#2A2823]">
        {lineIn(item.question)} <span className="text-[#8B8471]">[{item.marks}]</span>
      </p>
      <textarea
        id={`guide-write-${source}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={committed}
        rows={3}
        placeholder="Write your answer first — the model answer unfolds after you commit."
        className="mt-2 w-full rounded-xl border border-[#E4DCC9] bg-[#FCFAF4] px-3 py-2 text-[12.5px] leading-snug text-[#2A2823] disabled:opacity-70"
      />
      {!committed ? (
        <Tile
          onClick={() => setCommitted(true)}
          disabled={text.trim().length < 12}
          aria-label="Commit my answer"
          className="mt-2 rounded-full border border-transparent bg-[#2F6134] px-3 py-1.5 text-[12px] font-extrabold text-[#FBF8EF] disabled:opacity-45"
        >
          Commit my answer
        </Tile>
      ) : (
        <div className="mt-2 rounded-xl border border-[#E4DCC9] bg-[#F6F2E8] px-3 py-2" data-testid="guide-model">
          <p className="atlas-eyebrow">Model answer</p>
          <p className="mt-1 text-[12.5px] leading-snug text-[#2A2823]">{lineIn(item.model)}</p>
          <ul className="mt-1.5 list-disc pl-4 text-[11.5px] leading-snug text-[#4A4438]">
            {item.points.map((p, i) => (
              <li key={i}>{lineIn(p)}</li>
            ))}
          </ul>
          <p className="atlas-eyebrow mt-2">Mark yourself</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {(['right', 'partly', 'wrong'] as Grade[]).map((g) => (
              <Tile
                key={g}
                onClick={() => mark(g)}
                disabled={grade !== null}
                aria-label={`Mark it ${g}`}
                className={cn(
                  'rounded-full border px-3 py-1 text-[11.5px] font-extrabold',
                  grade === g ? 'border-[#2F6134] bg-[#E7F1E3] text-[#2F6134]' : 'border-[#E4DCC9] bg-[#FCFAF4] text-[#4A4438]',
                  grade !== null && grade !== g && 'opacity-40',
                )}
              >
                {g === 'right' ? 'All the points' : g === 'partly' ? 'Some of them' : 'None of them'}
              </Tile>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function bandItem<T>(items: Partial<Record<Band, T>> | undefined, band: Band): T | undefined {
  if (!items) return undefined
  const order: Band[] = ['explorer', 'scientist', 'analyst']
  for (let i = order.indexOf(band); i >= 0; i -= 1) {
    const it = items[order[i]]
    if (it) return it
  }
  return undefined
}

/* ------------------------------------------------------------------ */
/* The card                                                            */
/* ------------------------------------------------------------------ */

export function PageCard({ book, band, cabinet, where, onNavigate, onClose, onStartPractical, compact }: Props) {
  const sections = useMemo(() => sectionsOf(book), [book])
  const section: Section = useMemo(
    () => sections.find((s) => s.id === where.sectionId) ?? sections[0],
    [sections, where.sectionId],
  )
  const pages = useMemo(() => pagesFor(section, band), [section, band])
  const pageIndex = Math.min(where.page, pages.length - 1)
  const page: Page = pages[pageIndex]
  const [contents, setContents] = useState(false)
  const [lit, setLit] = useState<string | null>(null)
  const [now, setNow] = useState<number | null>(null)
  const [reading, setReading] = useState(false)
  const [done, setDone] = useState<Grade | null>(null)
  const ledger = useCurriculum()

  const layer = page.text ? layerFor(page.text, band) : null
  const segments = useMemo(() => (layer ? segment(lineIn(layer)) : []), [layer])
  const extSegments = useMemo(() => (page.ext && band === 'analyst' ? segment(lineIn(page.ext)) : []), [page.ext, band])
  const figureKeys = segments.filter((s) => s.token.kind === 'term' && s.token.verb.startsWith('figure/')).map((s) => (s.token as { verb: string }).verb.slice('figure/'.length))
  const figureKind = figureKeys.length ? figureKindFor(figureKeys) : null

  // A new page: stop reading, clear the highlight, set the page's own figure.
  const figureRan = useRef<string | null>(null)
  useEffect(() => {
    stopNarration()
    setReading(false)
    setNow(null)
    setLit(null)
    setDone(null)
    setContents(false)
    const key = `${section.id}:${page.id}`
    if (page.figure && figureRan.current !== key) {
      figureRan.current = key
      runVerb(page.figure)
    }
  }, [section.id, page.id, page.figure])

  useEffect(() => () => stopNarration(), [])

  const fire = useCallback(
    (verb: string) => {
      if (verb.startsWith('figure/')) {
        const l = verb.slice('figure/'.length)
        setLit(l)
        // The figure's stoma opens the real stoma on the stage beside it.
        if (l === 'stoma') runVerb('pore/open')
        return true
      }
      return runVerb(verb)
    },
    [],
  )

  const onTerm = useCallback(
    (verb: string, index: number) => {
      setNow(index)
      fire(verb)
      window.setTimeout(() => setNow((n) => (n === index ? null : n)), 1400)
    },
    [fire],
  )

  const read = useCallback(() => {
    if (reading) {
      stopNarration()
      setReading(false)
      setNow(null)
      return
    }
    const plain = segments.map((s) => s.token.text).join('')
    const fired = new Set<number>()
    const ok = readAloud(plain, {
      onWord: (charIndex) => {
        const i = segments.findIndex((s) => s.token.kind === 'term' && charIndex >= s.start && charIndex < s.end)
        if (i < 0) return
        setNow(i)
        if (!fired.has(i)) {
          fired.add(i)
          const t = segments[i].token
          if (t.kind === 'term') fire(t.verb)
        }
      },
      onEnd: () => {
        setReading(false)
        setNow(null)
      },
    })
    setReading(ok)
  }, [reading, segments, fire])

  const go = (delta: number) => {
    const next = pageIndex + delta
    if (next >= 0 && next < pages.length) return onNavigate({ sectionId: section.id, page: next })
    const si = sections.indexOf(section) + delta
    if (si < 0 || si >= sections.length) return
    const target = sections[si]
    onNavigate({ sectionId: target.id, page: delta > 0 ? 0 : pagesFor(target, band).length - 1 })
  }

  const kindLabel = page.kind === 'story' ? 'The story' : page.kind === 'rule' ? 'The rule' : page.kind === 'practical' ? 'The practical' : 'The check'
  const practical = page.practical
  const levelId = practical ? practical.level[band] : undefined
  const pending = levelId ? (ledger.pending[levelId] ?? pendingFor(levelId)) : null
  const explain = practical ? bandItem(practical.explain, band) : undefined
  const checkItem = page.check ? page.check[band] : undefined

  return (
    <div
      className={cn('atlas-plate atlas-arrive flex flex-col', compact ? 'shrink-0 p-2.5' : 'min-h-0 p-3')}
      data-testid="page-card"
      data-section={section.id}
      data-page={page.id}
      data-kind={page.kind}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => setContents((v) => !v)}
          aria-expanded={contents}
          aria-label="Contents"
          className="atlas-eyebrow flex items-center gap-1.5 bg-transparent p-0 text-left"
        >
          <BookOpen className="h-3 w-3" /> Field guide · {lineIn(section.title)}
        </button>
        <Tile onClick={onClose} aria-label="Close the field guide" className="rounded-full px-1.5 text-[#B9B09A] hover:text-[#4A4438]">
          <X className="h-4 w-4" />
        </Tile>
      </div>

      {contents && (
        <div className="mt-2 flex flex-wrap gap-1" data-testid="guide-contents">
          {sections.map((s) => (
            <Tile
              key={s.id}
              onClick={() => onNavigate({ sectionId: s.id, page: 0 })}
              aria-label={`Open ${lineIn(s.title)}`}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold',
                s.id === section.id ? 'border-[#2A2823] bg-[#2A2823] text-[#FBF8EF]' : 'border-[#E4DCC9] bg-[#FCFAF4] text-[#4A4438]',
              )}
            >
              {lineIn(s.title)}
            </Tile>
          ))}
        </div>
      )}

      <div className="mt-1.5 flex items-baseline justify-between gap-2">
        <h3 className={cn('atlas-serif leading-tight font-semibold text-[#2A2823]', compact ? 'text-[15px]' : 'text-[17px]')}>{lineIn(page.title)}</h3>
        <span className="text-[10.5px] font-bold tracking-[0.06em] text-[#8B8471] uppercase">
          {kindLabel} · {pageIndex + 1}/{pages.length}
        </span>
      </div>

      <div className={cn('mt-2 pr-0.5', compact ? '' : 'min-h-0 flex-1 overflow-y-auto')}>
        {layer && <Terms segments={segments} now={now} onTerm={onTerm} compact={compact} />}

        {figureKind && (
          <div className="mt-2 rounded-lg border border-[#E4DCC9] bg-[#FCFAF4] p-1.5" data-testid="leaf-figure" data-lit={lit ?? ''}>
            <SectionFigure kind={figureKind} lit={lit} onTap={(l) => fire(`figure/${l}`)} />
            <p className="mt-1 px-1 text-[10.5px] leading-snug text-[#8B8471]">{figureSays(figureKind, lit)}</p>
          </div>
        )}

        {extSegments.length > 0 && (
          <div className="mt-2 border-l-[3px] border-[#D9A441] bg-[#F3DFB2]/60 px-2.5 py-2" data-testid="guide-ext">
            <p className="atlas-eyebrow">Extended</p>
            <Terms segments={extSegments} now={null} onTerm={onTerm} compact />
          </div>
        )}

        {practical && (
          <div className="mt-1 flex flex-col gap-2">
            <p className="text-[12.5px] leading-snug font-semibold text-[#4A4438]">{lineIn(practical.line)}</p>
            {levelId ? (
              <>
                {!pending && (
                  <Tile
                    onClick={() => onStartPractical(practical.door)}
                    aria-label="Start the practical"
                    className="atlas-invite flex items-center justify-center gap-1.5 rounded-full border border-transparent bg-[#2F6134] px-3 py-2 text-[12.5px] font-extrabold text-[#FBF8EF]"
                  >
                    <Play className="h-3.5 w-3.5" /> Start the practical
                  </Tile>
                )}
                {pending && explain && !done && (
                  <div className="rounded-xl border border-[#EAD0A0] bg-[#FBEBD2]/70 px-3 py-2">
                    <p className="atlas-eyebrow">Hand-in landed · now explain it</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-[#8A5A0B]">
                      You guessed <b>{pending.prediction}</b>; you set <b>{pending.action}</b>; you saw <b>{pending.observed}</b>.
                    </p>
                    <div className="mt-2">
                      {explain.kind === 'pick' ? (
                        <PickItem item={explain} source={levelId} cabinet={cabinet} mode="explain" onDone={setDone} />
                      ) : (
                        <WriteItem item={explain} source={levelId} cabinet={cabinet} mode="explain" onDone={setDone} />
                      )}
                    </div>
                  </div>
                )}
                {done && (
                  <div className="flex flex-wrap items-center gap-1.5" data-testid="guide-stamped">
                    <Chip tone="good">stamped · evidence, not XP</Chip>
                    <span className="text-[11px] font-semibold text-[#8B8471]">
                      {done === 'right' ? 'and the explanation held.' : done === 'partly' ? 'explanation partly there — it is in the record.' : 'the explanation missed — it is in the record, honestly.'}
                    </span>
                  </div>
                )}
                {pending && !explain && (
                  <p className="text-[11.5px] text-[#8B8471]">Hand-in landed. Nothing to explain at this door yet.</p>
                )}
              </>
            ) : (
              <p className="rounded-xl border border-dashed border-[#D9CFBB] px-3 py-2 text-[12px] leading-snug font-semibold text-[#8B8471]" data-testid="guide-undiscovered">
                Nobody has discovered what is behind this door yet.
              </p>
            )}
          </div>
        )}

        {page.kind === 'check' && checkItem && (
          <div className="mt-1">
            {checkItem.kind === 'pick' ? (
              <PickItem item={checkItem} source={`${section.id}:${page.id}`} cabinet={cabinet} mode="check" onDone={setDone} />
            ) : (
              <WriteItem item={checkItem} source={`${section.id}:${page.id}`} cabinet={cabinet} mode="check" onDone={setDone} />
            )}
            {done && (
              <div className="mt-2" data-testid="guide-stamped">
                <Chip tone="good">stamped · evidence, not XP</Chip>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-1.5">
        <Tile onClick={() => go(-1)} aria-label="Previous page" className="rounded-full border border-[#E4DCC9] bg-[#FCFAF4] px-2 py-1 text-[#4A4438]">
          <ChevronLeft className="h-4 w-4" />
        </Tile>
        {layer && narrationAvailable() ? (
          <Tile
            onClick={read}
            aria-label={reading ? 'Stop reading' : 'Read to me'}
            aria-pressed={reading}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-extrabold',
              reading ? 'border-[#2A2823] bg-[#2A2823] text-[#FBF8EF]' : 'border-[#D9A441] bg-[#D9A441] text-[#1c1408]',
            )}
          >
            {reading ? <Square className="h-3 w-3" /> : <Volume2 className="h-3.5 w-3.5" />}
            {reading ? 'Stop' : 'Read to me'}
          </Tile>
        ) : (
          <span className="text-[10.5px] text-[#8B8471]">{BAND_META[band].label}</span>
        )}
        <Tile onClick={() => go(1)} aria-label="Next page" className="rounded-full border border-[#E4DCC9] bg-[#FCFAF4] px-2 py-1 text-[#4A4438]">
          <ChevronRight className="h-4 w-4" />
        </Tile>
      </div>
    </div>
  )
}
