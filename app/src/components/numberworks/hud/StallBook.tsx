/**
 * The Stall Book — the Market's field journal (round A.3, after review 2).
 *
 * A field guide explains and then asks. A field JOURNAL records what you
 * found and then names it, so every page runs in one order and only one:
 *
 *   YOU DISCOVERED   50 × ₵4.00 = ₵200          ← the learner's own figures
 *   Your day 1 · 22 people bought 50 tomatoes    ← where it came from
 *   This is called revenue.                      ← one sentence, the name
 *   Show me how →                                ← folded: method, then notation
 *   Try it · price · sold · till                 ← back into the world
 *
 * A page nobody has earned shows its NAME and nothing else — never the
 * formula before the day that produced it. The terms are the remote control:
 * tapping one fires the Market's verb (the board lights, the shoppers replay,
 * the coins count), which is why the book sits over the stall rather than
 * beside it. Read-aloud is a tap, never automatic (D6). The syllabus retreats
 * to one quiet strand label; the codes live in the ledger a parent reads.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, Square, Volume2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Band } from '@/lib/bands'
import { fill, layerFor, lineIn, parseMarkup, sectionsOf, type Book, type Page, type Token } from '@/lib/page'
import { hasVerb, runVerb } from '@/lib/verbs'
import { narrationAvailable, readAloud, stopNarration } from '@/lib/narrator'
import { strandFor, type SyllabusLens } from '@/lib/curriculum'
import type { Discovery } from '@/lib/market'
import { Tile } from '@/components/ui/tile'

const INK = '#2A2823'
const QUIET = '#8B8471'
const GOOD = '#2F6134'

/** The journal pages of the book, in order. */
function journalPages(book: Book): Page[] {
  return sectionsOf(book)
    .flatMap((s) => s.pages)
    .filter((p) => !!p.journal)
}

function Terms({ src, keys, onTerm, className }: { src: string; keys: Record<string, string>; onTerm: (verb: string) => void; className?: string }) {
  const tokens: Token[] = useMemo(() => parseMarkup(fill(src, keys)), [src, keys])
  return (
    <p className={cn('text-[12.5px] leading-snug font-semibold text-[#2A2823]', className)}>
      {tokens.map((t, i) =>
        t.kind === 'term' && hasVerb(t.verb) ? (
          <button
            key={i}
            type="button"
            onClick={() => onTerm(t.verb)}
            title={t.gloss}
            data-testid="book-term"
            data-verb={t.verb}
            className="cursor-pointer border-0 border-b-[1.5px] border-dotted border-[#B5541C] bg-transparent p-0 font-extrabold text-[#B5541C]"
          >
            {t.text}
          </button>
        ) : (
          <span key={i}>{t.text}</span>
        ),
      )}
    </p>
  )
}

/* ------------------------------------------------------------------ */
/* Contents — what the days have written so far                        */
/* ------------------------------------------------------------------ */

export function StallBookContents({ book, discoveries, onOpen }: { book: Book; discoveries: Record<string, Discovery>; onOpen: (index: number) => void }) {
  const pages = journalPages(book)
  return (
    <div data-testid="book-contents">
      <h3 className="atlas-serif text-[17px] leading-tight font-semibold text-[#2A2823]">What Kejetia taught you</h3>
      <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {pages.map((p, i) => {
          const d = discoveries[p.id]
          return (
            <Tile
              key={p.id}
              onClick={() => onOpen(i)}
              aria-label={`Open ${lineIn(p.title)}`}
              data-testid="book-page-row"
              data-page={p.id}
              data-found={d ? 'true' : 'false'}
              className={cn('rounded-[12px] border px-3 py-2 text-left', d ? 'border-[#E4DCC9] bg-[#FCFAF4]' : 'border-[#E9E2D1] bg-[#F6F2E8] opacity-60')}
            >
              <b className="block text-[12px] font-black" style={{ color: INK }}>
                {lineIn(p.title)}
              </b>
              {d ? (
                <>
                  <span className="block text-[10.5px] font-extrabold" style={{ color: '#5F5A4E' }}>
                    you discovered {d.sum}
                  </span>
                  <span className="block text-[10px] font-extrabold" style={{ color: GOOD }}>
                    {d.note.split(' · ')[0]}
                  </span>
                </>
              ) : (
                <span className="block text-[10.5px] font-extrabold" style={{ color: '#B9B09A' }}>
                  not discovered yet
                </span>
              )}
            </Tile>
          )
        })}
      </div>
      <p className="mt-2 text-[10.5px] font-extrabold" style={{ color: QUIET }}>
        A page is written by a day at the stall. A greyed page is one the market has not shown you yet — it says its name and no more.
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* A page                                                              */
/* ------------------------------------------------------------------ */

function JournalPageView({
  page,
  index,
  of,
  band,
  lens,
  discovery,
  onGo,
  onContents,
}: {
  page: Page
  index: number
  of: number
  band: Band
  lens: SyllabusLens
  discovery: Discovery | undefined
  onGo: (delta: number) => void
  onContents: () => void
}) {
  const j = page.journal!
  const [open, setOpen] = useState(false)
  const [reading, setReading] = useState(false)
  const keys = useMemo(() => discovery?.keys ?? {}, [discovery])
  const strand = j.stamps?.length ? strandFor(j.stamps[0], lens) : null

  // Page state is per page: the parent keys this component on the page id, so
  // turning a page remounts it — "show me how" folds itself away, and the
  // voice stops, without an effect that sets state on every render.
  useEffect(() => () => stopNarration(), [])

  const fire = useCallback((verb: string) => {
    runVerb(verb)
  }, [])

  const names = lineIn(layerFor(j.names, band))
  const how = lineIn(layerFor(j.how, band))

  const read = useCallback(() => {
    if (reading) {
      stopNarration()
      setReading(false)
      return
    }
    const plain = [discovery ? `${lineIn(j.discovery, 'en').replace('${sum}', discovery.sum)}.` : '', parseMarkup(fill(names, keys)).map((t) => t.text).join('')].filter(Boolean).join(' ')
    setReading(readAloud(plain, { onEnd: () => setReading(false) }))
  }, [reading, discovery, j.discovery, names, keys])

  if (!discovery) {
    return (
      <div data-testid="book-page" data-page={page.id} data-found="false">
        <Header index={index} of={of} strand={null} onContents={onContents} />
        <h3 className="atlas-serif mt-1 text-[18px] leading-tight font-semibold" style={{ color: '#B9B09A' }}>
          {lineIn(j.locked)}
        </h3>
        <p className="mt-1 text-[12px] font-extrabold" style={{ color: '#B9B09A' }} data-testid="book-locked">
          Not discovered yet — run the day that writes it.
        </p>
        <Footer index={index} of={of} onGo={onGo} read={null} reading={false} />
      </div>
    )
  }

  return (
    <div data-testid="book-page" data-page={page.id} data-found="true">
      <Header index={index} of={of} strand={strand} onContents={onContents} />
      <h3 className="atlas-serif mt-1 text-[18px] leading-tight font-semibold text-[#2A2823]">{lineIn(page.title)}</h3>
      <div className="mt-1.5 rounded-[10px] border border-[#C8DFC2] bg-[#E7F1E3] px-3 py-2" data-testid="book-discovery">
        <span className="atlas-eyebrow" style={{ color: GOOD }}>
          You discovered
        </span>
        <div className="atlas-serif text-[17px] leading-tight font-semibold tabular-nums" style={{ color: GOOD }}>
          {fill(lineIn(j.discovery), { ...keys, sum: discovery.sum })}
        </div>
        <div className="text-[10.5px] font-extrabold" style={{ color: '#5F5A4E' }}>
          {fill(lineIn(j.provenance), { ...keys, note: discovery.note })}
        </div>
      </div>
      <Terms src={names} keys={keys} onTerm={fire} className="mt-2 text-[13px]" />
      <div className="mt-2 rounded-[10px] border border-dashed border-[#D8D0BC] bg-[#F6F2E8] px-3 py-2">
        <Tile onClick={() => setOpen((v) => !v)} aria-label={open ? 'Fold it away' : 'Show me how'} aria-expanded={open} data-testid="book-how-toggle" className="atlas-eyebrow flex w-full items-center justify-between bg-transparent p-0 text-left">
          <span>{open ? 'That is how' : 'Show me how →'}</span>
          <span style={{ color: '#B9B09A' }}>{open ? 'fold it away' : ''}</span>
        </Tile>
        {open && (
          <div className="mt-1" data-testid="book-how">
            <Terms src={how} keys={keys} onTerm={fire} className="tabular-nums" />
            {j.notation && (
              <p className="mt-1.5 border-t border-dashed border-[#E4DCC9] pt-1.5 text-[10.5px] font-extrabold" style={{ color: QUIET }} data-testid="book-notation">
                Analyst · {fill(lineIn(j.notation), keys)}
              </p>
            )}
          </div>
        )}
      </div>
      {j.tryIt && j.tryIt.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="book-tryit">
          <span className="atlas-eyebrow whitespace-nowrap" style={{ color: '#B5541C' }}>
            Try it
          </span>
          {j.tryIt.map((t) => (
            <Tile
              key={t.verb}
              onClick={() => fire(t.verb)}
              aria-label={lineIn(t.label)}
              data-testid="book-try"
              data-verb={t.verb}
              className="rounded-full border border-[#F0D39A] bg-[#FBEBD0] px-2.5 py-1 text-[11px] font-extrabold text-[#8A5A12]"
            >
              {lineIn(t.label)}
            </Tile>
          ))}
        </div>
      )}
      <Footer index={index} of={of} onGo={onGo} read={narrationAvailable() ? read : null} reading={reading} />
    </div>
  )
}

function Header({ index, of, strand, onContents }: { index: number; of: number; strand: string | null; onContents: () => void }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <Tile onClick={onContents} aria-label="Contents" data-testid="book-contents-button" className="atlas-eyebrow flex items-center gap-1.5 bg-transparent p-0 text-left">
        <BookOpen className="h-3 w-3" /> The Stall Book · page {index + 1} of {of}
      </Tile>
      {strand && (
        <span className="text-[9px] font-extrabold tracking-[0.06em]" style={{ color: '#B9B09A' }} data-testid="book-strand">
          {strand}
        </span>
      )}
    </div>
  )
}

function Footer({ index, of, onGo, read, reading }: { index: number; of: number; onGo: (d: number) => void; read: (() => void) | null; reading: boolean }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-1.5">
      <Tile onClick={() => onGo(-1)} disabled={index === 0} aria-label="Previous page" className="rounded-full border border-[#E4DCC9] bg-[#FCFAF4] px-2 py-1 text-[#4A4438] disabled:opacity-40">
        <ChevronLeft className="h-4 w-4" />
      </Tile>
      {read ? (
        <Tile
          onClick={read}
          aria-label={reading ? 'Stop reading' : 'Read it to me'}
          aria-pressed={reading}
          data-testid="book-read"
          className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-extrabold', reading ? 'border-[#2A2823] bg-[#2A2823] text-[#FBF8EF]' : 'border-[#E4DCC9] bg-[#FCFAF4] text-[#4A4438]')}
        >
          {reading ? <Square className="h-3 w-3" /> : <Volume2 className="h-3.5 w-3.5" />}
          {reading ? 'Stop' : 'Read it to me'}
        </Tile>
      ) : (
        <span />
      )}
      <Tile onClick={() => onGo(1)} disabled={index === of - 1} aria-label="Next page" className="rounded-full border border-[#E4DCC9] bg-[#FCFAF4] px-2 py-1 text-[#4A4438] disabled:opacity-40">
        <ChevronRight className="h-4 w-4" />
      </Tile>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The book, over the stall                                            */
/* ------------------------------------------------------------------ */

export function StallBook({
  book,
  band,
  lens,
  discoveries,
  open,
  at,
  echo,
  onAt,
  onClose,
}: {
  book: Book
  band: Band
  lens: SyllabusLens
  discoveries: Record<string, Discovery>
  open: boolean
  /** null = contents; a number = that page. */
  at: number | null
  /** What the last tapped term just did in the world — the book says it out loud. */
  echo?: string
  onAt: (at: number | null) => void
  onClose: () => void
}) {
  const pages = journalPages(book)
  if (!open) return null
  const index = at === null ? null : Math.max(0, Math.min(pages.length - 1, at))
  return (
    <div data-focus-layer="" className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[#2A2823]/30 p-3 backdrop-blur-[1px]" data-testid="stall-book">
      <div className="atlas-plate atlas-arrive max-h-[92vh] w-full max-w-[27rem] overflow-y-auto p-4">
        <div className="mb-1 flex items-start justify-between gap-2">
          <span className="atlas-eyebrow">{index === null ? 'The Stall Book · contents' : ''}</span>
          <Tile onClick={onClose} aria-label="Close the Stall Book" className="rounded-full px-1.5 text-[#B9B09A] hover:text-[#4A4438]">
            <X className="h-4 w-4" />
          </Tile>
        </div>
        {index === null ? (
          <StallBookContents book={book} discoveries={discoveries} onOpen={(i) => onAt(i)} />
        ) : (
          <JournalPageView
            key={pages[index].id}
            page={pages[index]}
            index={index}
            of={pages.length}
            band={band}
            lens={lens}
            discovery={discoveries[pages[index].id]}
            onGo={(d) => onAt(Math.max(0, Math.min(pages.length - 1, index + d)))}
            onContents={() => onAt(null)}
          />
        )}
        {echo && (
          <p className="mt-2 rounded-[10px] border border-[#F0D39A] bg-[#FBEBD0] px-3 py-1.5 text-[11px] font-extrabold text-[#8A5A12]" data-testid="book-echo">
            {echo}
          </p>
        )}
      </div>
    </div>
  )
}
