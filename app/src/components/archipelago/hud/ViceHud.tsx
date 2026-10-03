import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Tile } from '@/components/ui/tile'
import Ploob2 from '@/components/brand/Ploob2'
import { useBandCaps } from '@/lib/bands'
import {
  BEND_NUDGE,
  BEND_SHORT,
  BEND_WHY,
  answerBendWhy,
  answerBendWhyText,
  bendOf,
  bendWhyLine,
  drawingBeatOf,
  drawingPick,
  drawingReplay,
  leaveRoom,
  openDrawing,
  openVice,
  runnerBack,
  takeStrap,
  viceCut,
  viceFresh,
  viceHang,
  viceLift,
  vicePredict,
  type WorldState,
} from '@/lib/archipelago'
import { BEND_SOURCES, HANGER_MAX, STRIP, STRIPS, bendStage, firstToGive, guessRight, readingText, type BandId, type Bend, type Guess, type StripId } from '@/lib/bend'
import { viceHint, vicePill } from '@/lib/benchui'
import { judgeBendWhy, TRUST } from '@/lib/whyjudge'
import { SEFU_LINES } from '@/lib/sefu'
import { Btn, Strip } from './BenchHud'

/**
 * S2 round A3 — the strap, the vice and the repair drawing on screen
 * (storyboard v3.1 §03 M1 and M5; the design of 2 Oct). Object first: the
 * strap, the strips, their readings and the drawing are in the scene. This
 * file is the STRIP for each of the three cuts — one line and the verbs — the
 * things to POINT at (a strip before the first weight; the brace or a strap on
 * the drawing), the child's own record pinned beside the why, and the PILL a
 * phone keeps while the child is elsewhere in the yard. Sefu's lines are
 * lib/sefu.ts's; nothing here states a number the child has not measured.
 */

const SEFU = 'Sefu · the Foreman'
const SWATCH: Record<StripId, string> = { copper: '#C8743A', oldCopper: '#5FA08C', iron: '#8D9299', rusted: '#7A3F22' }

/** Ploob's line under the strip's own: his mark, then the words. */
function PloobLine({ children, compact, testid, good }: { children: React.ReactNode; compact: boolean; testid: string; good?: boolean }) {
  return (
    <span className="mt-1 flex items-start gap-2">
      <Ploob2 size={compact ? 18 : 22} />
      <span className={cn('leading-snug font-extrabold', compact ? 'text-[11.5px]' : 'text-[12.5px]', good ? 'text-[#2F6B3A]' : 'text-[#2A2823]')} data-testid={testid}>
        {children}
      </span>
    </span>
  )
}

/* ---- the strap (moment 1) ---------------------------------------------------- */

export function StrapStrip({ s, compact }: { s: WorldState; compact: boolean }) {
  const arriving = s.prediction == null
  if (s.strap !== 'taken') {
    return (
      <Strip who={SEFU} line={`“${SEFU_LINES.strap[0]}”`} compact={compact} testid="strap-strip" lineTestid="strap-line" low>
        <Btn primary onClick={() => takeStrap()} data-testid="strap-take">
          Take it
        </Btn>
        <Btn onClick={() => leaveRoom()} data-testid="strap-back">
          {arriving ? 'Back to work' : 'Step back'}
        </Btn>
      </Strip>
    )
  }
  return (
    <Strip who={arriving ? SEFU : 'The rusted strap'} line={arriving ? `“${SEFU_LINES.strap[1]}”` : "Off the watch's jetty gate. Snapped at the pin hole."} compact={compact} testid="strap-strip" lineTestid="strap-line" low>
      <Btn primary={arriving} onClick={() => leaveRoom()} data-testid="strap-back">
        {arriving ? 'Back to work' : 'Step back'}
      </Btn>
    </Strip>
  )
}

/* ---- the vice (moment 5) ------------------------------------------------------ */

/** The guess against the record, said plainly: compared, never scored. */
function guessLine(v: Bend): string | null {
  const right = guessRight(v)
  if (right == null || v.guess == null || v.guess === 'unsure') return null
  const said = STRIP[v.guess].label
  return right ? `You said the ${said}. It gave first.` : `You said the ${said}. The ${STRIP[firstToGive()].label} gave first.`
}

export function ViceStrip({ s, band, compact }: { s: WorldState; band: BandId; compact: boolean }) {
  const v = bendOf(s)
  const stage = bendStage(v, band)
  const hint = viceHint(s, band)
  const back = (
    <Btn onClick={() => leaveRoom()} data-testid="vice-back">
      Step back
    </Btn>
  )
  const said = guessLine(v)
  const more = v.load < HANGER_MAX
  const hang = (primary: boolean) =>
    more ? (
      <Btn primary={primary} onClick={() => viceHang()} data-testid="vice-hang">
        {v.load > 0 ? 'One more ingot' : 'Hang an ingot'}
      </Btn>
    ) : null
  const lift = (
    <Btn primary onClick={() => viceLift(band)} data-testid="vice-lift">
      Lift them off
    </Btn>
  )
  const guessed = said && (
    <span className={cn('mt-0.5 block font-semibold text-[#6F6857]', compact ? 'text-[11px]' : 'text-[12px]')} data-testid="vice-guess-line">
      {said}
    </span>
  )

  switch (stage) {
    case 'uncut':
      return (
        <Strip who="The vice · Test" line={<span data-testid="vice-ploob">{hint}</span>} compact={compact} testid="vice-strip" lineTestid="vice-line" low>
          {runnerBack(s) && (
            <Btn primary onClick={() => viceCut()} data-testid="vice-cut">
              Cut a strip from the runner
            </Btn>
          )}
          {back}
        </Strip>
      )
    case 'predict':
      return (
        <>
          <Strip
            who={SEFU}
            line={
              <>
                “{SEFU_LINES.vice[0]}” <span className="font-semibold text-[#6F6857]">Point at it.</span>
              </>
            }
            compact={compact}
            testid="vice-strip"
            lineTestid="vice-line"
            low
          >
            {back}
          </Strip>
          <Guesses compact={compact} />
        </>
      )
    case 'testing':
      return (
        <Strip
          who="The vice · Test"
          line={
            <>
              <span data-testid="vice-ploob">{hint}</span>
              {guessed}
            </>
          }
          compact={compact}
          testid="vice-strip"
          lineTestid="vice-line"
          low
        >
          {v.on ? lift : hang(true)}
          {v.on && hang(false)}
          {back}
        </Strip>
      )
    case 'stuck':
      return (
        <Strip who="The vice · Test" line={<span data-testid="vice-ploob">{hint}</span>} compact={compact} testid="vice-strip" lineTestid="vice-line" low>
          <Btn primary onClick={() => viceFresh()} data-testid="vice-fresh">
            Fresh strips
          </Btn>
          {back}
        </Strip>
      )
    case 'tested':
      return (
        <Strip
          who={SEFU}
          line={
            <>
              “{SEFU_LINES.bent[0]}”
              {hint && (
                <PloobLine compact={compact} testid="vice-ploob">
                  {hint}
                </PloobLine>
              )}
              {guessed}
            </>
          }
          compact={compact}
          testid="vice-strip"
          lineTestid="vice-line"
          low
        >
          {v.on ? (
            lift
          ) : (
            <Btn primary onClick={() => openDrawing(band)} data-testid="vice-to-drawing">
              To the drawing
            </Btn>
          )}
          {/* an Explorer who wants to see new iron give can go on */}
          {hang(false)}
          {back}
        </Strip>
      )
    case 'drawn':
    case 'answered':
      return (
        <Strip who="The vice" line="The strips stay in the vice: that is the record." compact={compact} testid="vice-strip" lineTestid="vice-line" low>
          {/* a hanger left on comes off: nothing stays loaded for good */}
          {v.on && lift}
          {stage === 'drawn' && (
            <Btn primary onClick={() => openDrawing(band)} data-testid="vice-to-drawing">
              To the drawing
            </Btn>
          )}
          {back}
        </Strip>
      )
  }
}

/** The four strips to point at, and "not sure": the things themselves, not sentences. */
function Guesses({ compact }: { compact: boolean }) {
  const all: { id: Guess; label: string }[] = [...STRIPS.map((st) => ({ id: st.id as Guess, label: st.label })), { id: 'unsure', label: 'not sure' }]
  return (
    <div className={cn('pointer-events-auto absolute inset-x-0 z-30 flex justify-center px-3', compact ? 'bottom-3 gap-2' : 'top-[4.5rem] gap-4')} data-testid="vice-guesses" data-focus-layer="">
      {all.map((g) => (
        <Tile
          key={g.id}
          aria-label={g.id === 'unsure' ? 'Not sure' : `Point at the ${g.label}`}
          data-testid={`vice-guess-${g.id}`}
          className={cn('lg flex flex-col items-center gap-1 !rounded-[18px] text-[#2A2823]', compact ? 'min-w-[5.4rem] px-2 py-1.5' : 'min-w-[7rem] px-3 py-2.5')}
          onClick={() => vicePredict(g.id)}
        >
          <span className={cn('grid place-items-center rounded-full border-2 border-dashed border-[#E8A33D] bg-white/55', compact ? 'h-9 w-14' : 'h-12 w-20')}>
            {g.id === 'unsure' ? (
              <span className={cn('font-black text-[#8A5A0E]', compact ? 'text-[16px]' : 'text-[20px]')}>?</span>
            ) : (
              <span className={cn('block rounded-[2px]', compact ? 'h-1.5 w-9' : 'h-2 w-12', g.id === 'rusted' && 'opacity-90')} style={{ background: SWATCH[g.id], height: g.id === 'rusted' ? (compact ? 4 : 5) : undefined }} aria-hidden />
            )}
          </span>
          <span className={cn('font-extrabold whitespace-nowrap', compact ? 'text-[11.5px]' : 'text-[13px]')}>{g.label}</span>
        </Tile>
      ))}
    </div>
  )
}

/* ---- the repair drawing --------------------------------------------------------- */

export function DrawingStrip({ s, band, compact }: { s: WorldState; band: BandId; compact: boolean }) {
  const v = bendOf(s)
  const beat = drawingBeatOf(s)
  const [asked, setAsked] = useState(false)
  const back = (
    <Btn onClick={() => leaveRoom()} data-testid="drawing-back">
      Step back
    </Btn>
  )
  const again = (
    <Btn onClick={() => drawingReplay()} data-testid="drawing-again">
      Watch again
    </Btn>
  )
  if (v.pick == null) {
    return (
      <>
        <Strip
          who={SEFU}
          line={
            <>
              “{SEFU_LINES.bent[0]}” <span className="font-semibold text-[#6F6857]">Point at it.</span>
            </>
          }
          compact={compact}
          testid="drawing-strip"
          lineTestid="drawing-line"
          low
        >
          {back}
        </Strip>
        <Picks compact={compact} />
      </>
    )
  }
  if (v.why >= 0) return <Answered s={s} band={band} compact={compact} back={back} again={again} />
  // The drawing is moving: say what to watch, and nothing else.
  if (beat !== 'square') {
    return (
      <Strip
        who="The repair drawing"
        line={v.pick === 'brace' ? 'The brace, drawn in copper. Watch the leaf.' : 'The straps are copper already. Watch the brace drawn in copper.'}
        compact={compact}
        testid="drawing-strip"
        lineTestid="drawing-line"
        low
      />
    )
  }
  if (!asked) {
    return (
      <Strip who={SEFU} line={`“${SEFU_LINES.gate[0]}”`} compact={compact} testid="drawing-strip" lineTestid="drawing-line" low>
        <Btn primary onClick={() => setAsked(true)} data-testid="drawing-ask">
          Ploob has a question
        </Btn>
        {again}
        {back}
      </Strip>
    )
  }
  return <BendWhy s={s} compact={compact} back={back} />
}

/** The two things a child can point at on the drawing. */
function Picks({ compact }: { compact: boolean }) {
  return (
    // A phone is wide and short: the two things to point at stand to the right of the board, not on it.
    <div className={cn('pointer-events-auto absolute z-30 flex', compact ? 'top-[5.5rem] right-3 flex-col gap-2' : 'inset-x-0 top-[4.5rem] justify-center gap-5 px-3')} data-testid="drawing-picks" data-focus-layer="">
      {(['brace', 'strap'] as const).map((part) => (
        <Tile
          key={part}
          aria-label={part === 'brace' ? 'Point at the brace' : 'Point at a strap'}
          data-testid={`drawing-pick-${part}`}
          className={cn('lg flex flex-col items-center gap-1 !rounded-[22px] px-3 text-[#2A2823]', compact ? 'py-1.5' : 'py-2.5')}
          onClick={() => drawingPick(part)}
        >
          <span className={cn('grid place-items-center rounded-full border-2 border-dashed border-[#E8A33D] bg-white/55', compact ? 'h-12 w-12' : 'h-[5.5rem] w-[5.5rem]')}>
            <PartIcon part={part} size={compact ? 34 : 60} />
          </span>
          <span className={cn('font-extrabold', compact ? 'text-[12px]' : 'text-[13.5px]')}>{part === 'brace' ? 'the brace' : 'a strap'}</span>
        </Tile>
      ))}
    </div>
  )
}

function PartIcon({ part, size }: { part: 'brace' | 'strap'; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <rect x="8" y="9" width="32" height="30" rx="2" fill="#E9D2A6" stroke="#3D332A" strokeWidth="1.6" />
      <path d="M16 9v30M24 9v30M32 9v30" stroke="#B48C56" strokeWidth="1.2" />
      <path d="M10 37L38 11" stroke="#8A5A32" strokeWidth={part === 'brace' ? 6 : 3.4} strokeLinecap="round" opacity={part === 'brace' ? 1 : 0.4} />
      <path d="M9 15h30M9 33h30" stroke="#C8743A" strokeWidth={part === 'strap' ? 5 : 2.6} strokeLinecap="round" opacity={part === 'strap' ? 1 : 0.4} />
      <path d="M4 6v36" stroke="#6B4A30" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

/** The child's own four readings, pinned while the why is asked: the evidence, not a sentence. */
function Record({ v, compact }: { v: Bend; compact: boolean }) {
  return (
    // On a phone the record is a column to the right of the board; on a wide screen, a row above it.
    <div className={cn('pointer-events-none absolute z-30 flex', compact ? 'right-3 bottom-3' : 'inset-x-0 top-[4.5rem] justify-center px-3')}>
      <div className={cn('lg grid gap-x-4 gap-y-1 rounded-[16px] text-[#2A2823]', compact ? 'grid-cols-1 px-3 py-1.5' : 'grid-cols-4 px-4 py-2.5')} data-testid="bend-record">
        {STRIPS.map((st) => (
          <span key={st.id} className="flex items-center gap-2 whitespace-nowrap">
            <span className="inline-block h-1.5 w-5 rounded-[2px]" style={{ background: SWATCH[st.id] }} aria-hidden />
            <span className={cn('leading-tight', compact ? 'text-[11px]' : 'text-[12.5px]')}>
              <span className="block font-extrabold">{st.label}</span>
              <span className="block font-semibold text-[#5C5646]">{readingText(st, v.readings[st.id]) || 'not loaded'}</span>
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * The bend's why. An Explorer taps one of three short answers; an
 * Investigator or Engineer says it first and a typed judge decides. No judge
 * — offline, no key, slow — and the three answers take over without a word.
 */
function BendWhy({ s, compact, back }: { s: WorldState; compact: boolean; back: React.ReactNode }) {
  const caps = useBandCaps()
  const v = bendOf(s)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [nudge, setNudge] = useState<string | null>(null)
  const [tries, setTries] = useState(0)
  const [tapping, setTapping] = useState(false)
  const ownWords = caps.conclusion && !tapping

  async function say() {
    if (busy || text.trim().length < 3) return
    setBusy(true)
    const j = await judgeBendWhy(text)
    setBusy(false)
    if (!j) return setTapping(true)
    const trusted = j.confidence >= TRUST
    if (j.verdict === 'right' && trusted) return answerBendWhyText(text, 'right', null)
    // A misconception the judge names must be one of ours; anything else is treated as off the mark.
    if (j.verdict === 'misconception' && trusted && BEND_WHY.options.some((o) => !o.right && o.key === j.misconception)) return answerBendWhyText(text, 'misconception', j.misconception)
    // On the right track, off, or not trusted: one nudge and another go; then the three answers.
    if (tries === 0) {
      setTries(1)
      setNudge(j.verdict === 'off' ? 'Look at your four readings. Which strips had been out in the wet?' : BEND_NUDGE)
      return
    }
    setTapping(true)
  }

  return (
    <>
      <Strip
        who="Ploob · the why"
        line={
          <>
            {BEND_WHY.ask}
            {ownWords && nudge && (
              <PloobLine compact={compact} testid="bend-why-nudge">
                {nudge}
              </PloobLine>
            )}
          </>
        }
        compact={compact}
        testid="drawing-strip"
        lineTestid="drawing-line"
        low
      >
        {ownWords ? (
          <>
            <input
              data-testid="bend-why-text"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 300))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void say()
                e.stopPropagation()
              }}
              placeholder="In your own words…"
              aria-label={BEND_WHY.ask}
              className={cn('h-10 rounded-full border border-[#D9CFBC] bg-white px-3.5 text-[13px] font-semibold text-[#2A2823] outline-none focus:border-[#E8A33D]', compact ? 'w-[13rem]' : 'w-[17rem]')}
            />
            <Btn primary onClick={() => void say()} disabled={busy || text.trim().length < 3} data-testid="bend-why-say" className={cn((busy || text.trim().length < 3) && 'opacity-40')}>
              {busy ? 'Ploob is thinking…' : 'Say it'}
            </Btn>
            <Btn onClick={() => setTapping(true)} data-testid="bend-why-tap">
              Choose instead
            </Btn>
            {back}
          </>
        ) : (
          <span className="flex flex-wrap justify-end gap-2" data-testid="bend-whys">
            {BEND_SHORT.map((label, i) => (
              <Btn key={label} onClick={() => answerBendWhy(i)} data-testid={`bend-why-${i}`}>
                {label}
              </Btn>
            ))}
            {back}
          </span>
        )}
      </Strip>
      <Record v={v} compact={compact} />
    </>
  )
}

/** After the answer: Ploob's line in the child's own readings; for an Engineer, one more to carry away. */
function Answered({ s, band, compact, back, again }: { s: WorldState; band: BandId; compact: boolean; back: React.ReactNode; again: React.ReactNode }) {
  const v = bendOf(s)
  const chosen = BEND_WHY.options[v.why]
  return (
    <Strip
      who="Ploob · the why"
      line={
        <>
          <span className={cn(chosen?.right && 'text-[#2F6B3A]')} data-testid="bend-why-line">
            {v.whyText ? `“${v.whyText}” ` : ''}
            {bendWhyLine(s, v.why)}
          </span>
          {band === 'analyst' && (
            <span className={cn('mt-1 block font-semibold text-[#6F6857]', compact ? 'text-[11px]' : 'text-[12.5px]')} data-testid="bend-seed">
              One more to carry: what would a better gate metal need?
            </span>
          )}
        </>
      }
      compact={compact}
      testid="drawing-strip"
      lineTestid="drawing-line"
      low
    >
      {again}
      {back}
    </Strip>
  )
}

/* ---- the pill, and the journal's sources ----------------------------------------- */

/** Phones: where the vice stands while the child is elsewhere in the yard, in Ploob's slot. */
export function VicePill({ s, band }: { s: WorldState; band: BandId }) {
  const pill = vicePill(bendOf(s), band)
  if (!pill) return null
  const drawing = bendOf(s).done
  return (
    <div className="pointer-events-auto absolute bottom-3 left-[9rem] right-[13.5rem] flex justify-center">
      <Tile className="lg flex h-11 items-center gap-2 !rounded-full px-3.5 text-[14px] font-extrabold text-[#2A2823]" data-testid="vice-pill" onClick={() => (drawing ? openDrawing(band) : openVice())}>
        <span className="inline-block h-1.5 w-6 rounded-[2px] bg-[#C8743A]" aria-hidden />
        {pill.text}
        <span className="font-bold text-[#6F6857]">· {pill.sub}</span>
        <span aria-hidden>▴</span>
      </Tile>
    </div>
  )
}

/** The journal: what at the vice is sourced, and what is ours. */
export function BendSources() {
  return (
    <details className="mt-2 rounded-[12px] bg-[#EEE7D8] px-3 py-1.5" data-testid="bend-sources">
      <summary className="cursor-pointer text-[9px] font-extrabold tracking-wide text-[#8A5A0E] uppercase">The vice · where the numbers come from</summary>
      <div className="mt-1 grid gap-1">
        {BEND_SOURCES.map((b) => (
          <p key={b.claim} className="text-[11px] leading-snug text-[#2A2823]">
            {b.claim} · <span className={cn('font-extrabold', b.basis === 'sourced' ? 'text-[#2F6B3A]' : 'text-[#8A5A0E]')}>{b.basis}</span>
            <span className="block text-[10px] text-[#5C5646]">{b.source}</span>
          </p>
        ))}
      </div>
    </details>
  )
}
