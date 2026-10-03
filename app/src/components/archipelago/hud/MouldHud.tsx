import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Tile } from '@/components/ui/tile'
import Ploob2 from '@/components/brand/Ploob2'
import { useBandCaps } from '@/lib/bands'
import { MEASURE_NUDGE, MEASURE_POINTS, MEASURE_WHY, answerCastWhy, answerCastWhyText, castBack, castPour, leaveRoom, mouldLookOf, openMould, pourBlocked, type WorldState } from '@/lib/archipelago'
import { benchReached, lastPour } from '@/lib/supply'
import { mouldPill } from '@/lib/benchui'
import { judgeCastWhy, TRUST } from '@/lib/whyjudge'
import { SEFU_LINES } from '@/lib/sefu'
import { Btn, Strip } from './BenchHud'

/**
 * S2 round A2 — the mould on screen (storyboard v3.1 §03 M4, §07; mock v2
 * frames 6 and 7). Object first: the mould, the short cast and the gap are in
 * the scene with their readings tagged on them (MouldScene). This file is the
 * STRIP — one line and the verb — the three things to POINT at when Sefu asks
 * which measurement told you, and the PILL a phone keeps while the child is
 * elsewhere in the yard. Sefu's lines are lib/sefu.ts's; nothing here states a
 * number the child has not measured.
 */

const SEFU = 'Sefu · the Foreman'

export function MouldStrip({ s, compact }: { s: WorldState; compact: boolean }) {
  const sup = s.supply
  const look = mouldLookOf(s)
  const back = <Btn onClick={() => leaveRoom()} data-testid="mould-back">Step back</Btn>
  const pour = lastPour(sup?.cast)
  if (!sup || look === 'cold') {
    return (
      <Strip who="The gate mould" line={sup && sup.bench.recasts > 0 ? 'Empty again. The cold cast is on the dry pan.' : 'Open and empty. Nothing to pour until the bench says how much.'} compact={compact} testid="mould-strip" lineTestid="mould-line" low>
        {back}
      </Strip>
    )
  }
  switch (look) {
    case 'waiting': {
      const cold = pourBlocked(s) === 'cold'
      return (
        <Strip who={SEFU} line={`“${cold ? SEFU_LINES.cold[0] : 'The charge is in. Stand clear, and say the word.'}”`} compact={compact} testid="mould-strip" lineTestid="mould-line" low>
          {!cold && (
            <Btn primary onClick={() => castPour()} data-testid="mould-pour">
              Pour
            </Btn>
          )}
          {back}
        </Strip>
      )
    }
    case 'run':
      return <Strip who="The gate mould" line="The channel runs." compact={compact} testid="mould-strip" lineTestid="mould-line" low />
    case 'cool':
    case 'open':
      return <Strip who="The gate mould" line="Let it dull. Nobody touches it bright." compact={compact} testid="mould-strip" lineTestid="mould-line" low />
    case 'short':
      return (
        <Strip
          who={SEFU}
          line={
            <>
              “{SEFU_LINES.short[0]}”{pour?.guess && <span className="font-semibold text-[#B8741A]"> “You sent me a guess. The beam wasn't level.”</span>}
            </>
          }
          compact={compact}
          testid="mould-strip"
          lineTestid="mould-line"
          low
        >
          <Btn primary onClick={() => castBack()} data-testid="mould-recast">
            {benchReached(sup.bench) ? 'Back to the balance' : 'Back to the jug'}
          </Btn>
          {back}
        </Strip>
      )
    case 'full':
      return sup.cast.why < 0 ? <MeasureWhy compact={compact} /> : <KitLine s={s} compact={compact} back={back} />
  }
}

/** After the answer: Ploob's reasoned line, then Sefu's — the pour is Sela's. */
function KitLine({ s, compact, back }: { s: WorldState; compact: boolean; back: React.ReactNode }) {
  const c = s.supply!.cast
  const pour = lastPour(c)
  const chosen = MEASURE_WHY.options[c.why]
  return (
    <Strip
      who={SEFU}
      line={
        <>
          “{SEFU_LINES.kit[0]}”
          {/* a kit cast by a guess is still a guess: the beam said so before the fire did */}
          {pour?.guess && <span className="font-semibold text-[#B8741A]"> “You sent me a guess. The beam wasn't level.”</span>}
          <span className="mt-1 flex items-start gap-2">
            <Ploob2 size={compact ? 18 : 22} />
            <span className={cn('leading-snug font-extrabold', compact ? 'text-[11.5px]' : 'text-[12.5px]', chosen?.right ? 'text-[#2F6B3A]' : 'text-[#2A2823]')} data-testid="mould-why-line">
              {c.whyText ? `“${c.whyText}” ` : ''}
              {chosen?.line}
            </span>
          </span>
        </>
      }
      compact={compact}
      testid="mould-strip"
      lineTestid="mould-line"
      low
    >
      {back}
    </Strip>
  )
}

/**
 * Sefu's question at the full mould. An Explorer points; an Investigator or
 * Engineer says it first and a typed judge decides (right, on the right
 * track, a named misconception, off). No judge — offline, no key, slow — and
 * the pointing takes over without a word: the world owes nobody a server.
 */
function MeasureWhy({ compact }: { compact: boolean }) {
  const caps = useBandCaps()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [nudge, setNudge] = useState<string | null>(null)
  const [tries, setTries] = useState(0)
  const [pointing, setPointing] = useState(false)
  const ownWords = caps.conclusion && !pointing

  async function say() {
    if (busy || text.trim().length < 3) return
    setBusy(true)
    const j = await judgeCastWhy(text)
    setBusy(false)
    if (!j) return setPointing(true)
    const trusted = j.confidence >= TRUST
    if (j.verdict === 'right' && trusted) return answerCastWhyText(text, 'right', null)
    if (j.verdict === 'misconception' && trusted && j.misconception) return answerCastWhyText(text, 'misconception', j.misconception)
    // On the right track, off, or not trusted: one nudge and another go; then point.
    if (tries === 0) {
      setTries(1)
      setNudge(j.verdict === 'off' ? 'Which thing did you MEASURE that gave you the amount? Name it.' : MEASURE_NUDGE)
      return
    }
    setPointing(true)
  }

  return (
    <>
      <Strip
        who={SEFU}
        line={
          <>
            “{MEASURE_WHY.ask}” {!ownWords && <span className="font-semibold text-[#6F6857]">Point at it.</span>}
            {ownWords && nudge && (
              <span className="mt-1 flex items-start gap-2">
                <Ploob2 size={compact ? 18 : 22} />
                <span className={cn('leading-snug font-extrabold text-[#2A2823]', compact ? 'text-[11.5px]' : 'text-[12.5px]')} data-testid="cast-why-nudge">
                  {nudge}
                </span>
              </span>
            )}
          </>
        }
        compact={compact}
        testid="mould-strip"
        lineTestid="mould-line"
        low
      >
        {ownWords && (
          <>
            <input
              data-testid="cast-why-text"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 300))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void say()
                e.stopPropagation()
              }}
              placeholder="In your own words…"
              aria-label={MEASURE_WHY.ask}
              className={cn('h-10 rounded-full border border-[#D9CFBC] bg-white px-3.5 text-[13px] font-semibold text-[#2A2823] outline-none focus:border-[#E8A33D]', compact ? 'w-[13rem]' : 'w-[17rem]')}
            />
            <Btn primary onClick={() => void say()} disabled={busy || text.trim().length < 3} data-testid="cast-why-say" className={cn((busy || text.trim().length < 3) && 'opacity-40')}>
              {busy ? 'Ploob is thinking…' : 'Say it'}
            </Btn>
            <Btn onClick={() => setPointing(true)} data-testid="cast-why-point">
              Point instead
            </Btn>
          </>
        )}
      </Strip>
      {!ownWords && <Points compact={compact} />}
    </>
  )
}

/** The three things a child can point at: pictures of the objects, not sentences. */
function Points({ compact }: { compact: boolean }) {
  return (
    <div className={cn('pointer-events-auto absolute inset-x-0 z-30 flex justify-center gap-5 px-3', compact ? 'bottom-3' : 'top-[4.5rem]')} data-testid="points" data-focus-layer="">
      {MEASURE_POINTS.map((p, i) => (
        <Tile
          key={p.id}
          aria-label={`Point at ${p.label}`}
          data-testid={`point-${p.id}`}
          className={cn('lg flex flex-col items-center gap-1 !rounded-[22px] px-3 text-[#2A2823]', compact ? 'py-1.5' : 'py-2.5')}
          onClick={() => answerCastWhy(i)}
        >
          <span className={cn('grid place-items-center rounded-full border-2 border-dashed border-[#E8A33D] bg-white/55', compact ? 'h-12 w-12' : 'h-[5.5rem] w-[5.5rem]')}>
            <PointIcon id={p.id} size={compact ? 34 : 60} />
          </span>
          <span className={cn('font-extrabold', compact ? 'text-[12px]' : 'text-[13.5px]')}>{p.label}</span>
        </Tile>
      ))}
    </div>
  )
}

function PointIcon({ id, size }: { id: 'water' | 'gauge' | 'sefu'; size: number }) {
  if (id === 'water') {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
        <path d="M13 8h22l-2 32H15z" fill="#F1E9D7" stroke="#3D332A" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M14.2 22h19.6l-1.1 17H15.3z" fill="#6FA8CF" />
        <path d="M11 22h26" stroke="#E8A33D" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="4 3" />
        <path d="M37 13v24M37 16h3M37 22h4M37 28h3M37 34h4" stroke="#3D332A" strokeWidth="1.6" strokeLinecap="round" />
        <rect x="19" y="28" width="11" height="4" rx="1.5" fill="#C8743A" />
      </svg>
    )
  }
  if (id === 'gauge') {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
        <circle cx="24" cy="26" r="17" fill="#2A2823" stroke="#3D332A" strokeWidth="2" />
        <path d="M11 30a13 13 0 0 1 26 0" fill="none" stroke="#F6F2E8" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M33.5 21a13 13 0 0 1 3.5 9" fill="none" stroke="#FF7A2E" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M24 30l8-9" stroke="#E8A33D" strokeWidth="2.8" strokeLinecap="round" />
        <circle cx="24" cy="30" r="2.6" fill="#E8A33D" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path d="M8 44c1-10 7-15 16-15s15 5 16 15z" fill="#C8552E" />
      <path d="M17 31h14v13H17z" fill="#6B4A2F" opacity=".55" />
      <circle cx="24" cy="18" r="10" fill="#5A3A26" />
      <path d="M14 15c2-7 18-7 20 0-5-3-15-3-20 0z" fill="#2A2018" />
      <path d="M18 24c3 3 9 3 12 0-1 5-11 5-12 0z" fill="#2A2018" />
    </svg>
  )
}

/** The moment the heat arrives on Sela's errand: Sefu holds the pour and asks. Shown once, at the top, wherever the child is. */
export function HeatStrip({ compact, onGo }: { compact: boolean; onGo: () => void }) {
  return (
    <Strip who={SEFU} line={`“${SEFU_LINES.heat[0]}”`} compact={compact} testid="heat-strip" top narrow>
      <Btn primary onClick={onGo} data-testid="heat-to-bench">
        To the cold bench
      </Btn>
    </Strip>
  )
}

/** Phones: what stands at the furnace foot while the child is elsewhere in the yard, in Ploob's slot. */
export function MouldPill({ s }: { s: WorldState }) {
  const sup = s.supply
  const pill = sup ? mouldPill(mouldLookOf(s), sup.cast) : null
  if (!pill) return null
  return (
    <div className="pointer-events-auto absolute bottom-3 left-[9rem] right-[13.5rem] flex justify-center">
      <Tile className="lg flex h-11 items-center gap-2 !rounded-full px-3.5 text-[14px] font-extrabold text-[#2A2823]" data-testid="mould-pill" onClick={() => openMould()}>
        <span className="inline-block h-2.5 w-5 rounded-sm border-2 border-[#3D332A] bg-[#857E73]" aria-hidden />
        {pill.text}
        <span className="font-bold text-[#6F6857]">· {pill.sub}</span>
        <span aria-hidden>▴</span>
      </Tile>
    </div>
  )
}
