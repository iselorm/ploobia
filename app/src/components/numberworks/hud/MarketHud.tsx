import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Flag, Lock, Play, Send, Share2, Store, X } from 'lucide-react'
import { Tile } from '@/components/ui/tile'
import Ploob2 from '@/components/brand/Ploob2'
import { cn } from '@/lib/utils'
import type { ChallengeScore } from '@/lib/challenge'
import {
  DAY1_PRICE,
  DISCOUNT_HOUR,
  DOORS,
  FEW_LEFT,
  HARMATTAN,
  NICKNAME_MAX,
  PRICE_CEILING,
  PRICE_MIN,
  PRICE_SOFT_CEILING,
  WHOLESALE,
  cedis,
  cleanNickname,
  clockLabel,
  costPerTomato,
  gaugeFor,
  harmattanBoard,
  kiloPrice,
  scheduleOf,
  type Door,
  type Level,
  type ShareCard,
  type StallState,
} from '@/lib/market'
import { thumbUrl, type ThumbId } from '@/lib/marketassets'
import { doorState, nextDoor, useNumberworksCampaign, type DoorState } from '@/lib/numberworkscampaign'
import { AtlasButton, Chip, Dial } from '@/components/sugar/hud/AtlasKit'

/**
 * The Market's HUD — round A.2, after review 1. The three plates and the
 * cards are in `MarketCards.tsx`; this file keeps the way in (welcome, the
 * door map), the board panel (the dials), the till (the instrument's
 * buttons), Days, Our Space, the score and the send card. The world owns the
 * frame while it moves: no column touches it, Days and Our Space are behind
 * an edge tab, and the score card explains its three words in the stall's.
 */

export const TINT = '#B5541C'
const TINT_SOFT = '#F6E3D7'

/* ------------------------------------------------------------------ */
/* Welcome — Play first, six doors in one town                         */
/* ------------------------------------------------------------------ */

const STATE_LABEL: Record<DoorState, string> = { done: 'handed in', open: 'open', shut: 'shut', undiscovered: 'not yet discovered' }
const THUMB_OF: Record<number, ThumbId> = { 1: '1-market', 2: '2-algebra-machines', 3: '3-geometry-workshop', 4: '4-probability-fair', 5: '5-data-detective', 6: '6-modelling-studio' }

export function DoorMap({ onEnter, onShut }: { onEnter: (door: Door) => void; onShut: (why: string) => void }) {
  useNumberworksCampaign()
  return (
    <div className="mt-4" data-testid="door-map">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="atlas-eyebrow">Six doors, one town</span>
        <span className="text-[9.5px] font-extrabold text-[#8B8471]">one hand-in opens the next</span>
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {DOORS.map((d) => {
          const state = doorState(d)
          const enterable = state === 'open' || state === 'done'
          return (
            <Tile
              key={d.id}
              data-testid={`door-${d.id}`}
              data-state={state}
              aria-label={`${d.name}, ${STATE_LABEL[state]}`}
              onClick={() => {
                if (enterable) onEnter(d)
                else if (state === 'shut') onShut(`Hand in any level of door ${d.id - 1} to open ${d.name}.`)
                else onShut(`${d.name} is shut. Nobody has discovered what is behind it yet.`)
              }}
              className={cn(
                'relative flex flex-col items-stretch overflow-hidden rounded-[12px] border text-center transition-all active:scale-[0.98]',
                state === 'done' && 'border-[#3E7C43] bg-[#E7F1E3]',
                state === 'open' && 'atlas-invite border-[#B5541C] bg-[#FCFAF4]',
                state === 'shut' && 'border-[#E4DCC9] bg-[#F6F2E8]',
                state === 'undiscovered' && 'border-dashed border-[#D8D0BC] bg-[#F6F2E8]/60 opacity-80',
              )}
            >
              <span
                aria-hidden
                className={cn('block h-9 w-full bg-cover bg-center', state === 'undiscovered' && 'grayscale')}
                style={{ backgroundColor: TINT_SOFT, backgroundImage: `url(${thumbUrl(THUMB_OF[d.id])})` }}
              />
              <span className="flex items-center justify-center gap-1 px-1 pt-1">
                <span
                  className={cn(
                    'flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black',
                    state === 'done' && 'bg-[#2F6134] text-[#FBF8EF]',
                    state === 'open' && 'bg-[#F6E3D7] text-[#B5541C]',
                    state === 'shut' && 'bg-[#EAE4D4] text-[#8B8471]',
                    state === 'undiscovered' && 'bg-transparent text-[#B9B09A]',
                  )}
                >
                  {state === 'done' ? <Check className="h-2.5 w-2.5" /> : state === 'shut' ? <Lock className="h-2 w-2" /> : d.id}
                </span>
                <span className={cn('atlas-serif block text-[10px] leading-tight font-semibold', enterable ? 'text-[#2A2823]' : 'text-[#8B8471]')}>{d.name.replace(/^The /, '')}</span>
              </span>
              <span className="block px-1 pb-1 text-[8.5px] leading-tight font-bold text-[#8B8471]">{d.game}</span>
            </Tile>
          )
        })}
      </div>
    </div>
  )
}

export function MarketWelcome({ level, incoming, onPlay, onExplore }: { level: Level; incoming: { by?: string; title: string } | null; onPlay: () => void; onExplore: () => void }) {
  const [shutNote, setShutNote] = useState<string | null>(null)
  const door = nextDoor()
  return (
    <div data-focus-layer="" className="fixed inset-0 z-40 flex items-center justify-center bg-[#F6F2E8]/82 p-4 backdrop-blur-[3px]">
      <div className="atlas-plate welcome-pop max-h-[94vh] w-full max-w-[32rem] overflow-y-auto p-4 text-center sm:p-6">
        <div className="flex items-center justify-center gap-3">
          <Ploob2 size={44} />
          <div className="text-left">
            <span className="atlas-eyebrow">Mathematics · Number</span>
            <h1 className="atlas-serif text-[32px] leading-none font-semibold text-[#2A2823]">The Numberworks</h1>
          </div>
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed font-semibold text-[#5F5A4E]">
          A stall at Kejetia. Put a price on the board, open the stall, and count the till — the market has been teaching ratio and percentage since before anyone wrote them down.
        </p>
        {incoming && (
          <div className="mt-3 rounded-[12px] border border-[#EDC9B6] bg-[#F6E3D7] px-3 py-2 text-left" data-testid="incoming">
            <span className="atlas-eyebrow">{incoming.by ? `${incoming.by} sent you a market day` : 'A market day arrived'}</span>
            <p className="text-[12.5px] font-black text-[#2A2823]">{incoming.title}</p>
            <p className="text-[10.5px] font-bold text-[#8B8471]">Same shoppers, same day. Beat it, then send yours back.</p>
          </div>
        )}
        <DoorMap onEnter={() => onPlay()} onShut={setShutNote} />
        {shutNote && (
          <p data-testid="door-note" className="mt-1.5 text-[11px] leading-snug font-bold text-[#8B8471]">
            {shutNote}
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2">
          <Tile
            onClick={onPlay}
            aria-label="Play"
            data-testid="play"
            className="atlas-invite flex items-center justify-center gap-2 rounded-full px-6 py-3 text-[14px] font-extrabold text-[#FBF8EF] shadow transition-all active:scale-95"
            style={{ background: TINT }}
          >
            <Play className="h-4 w-4" />
            {incoming ? `Play — ${incoming.by ? `${incoming.by}'s market day` : 'the day you were sent'}` : `Play — ${level.title}`}
          </Tile>
          <Tile
            onClick={onExplore}
            aria-label="Run a stall on your own"
            className="flex items-center justify-center gap-2 rounded-full border border-[#E4DCC9] bg-[#FCFAF4] px-5 py-2.5 text-[13px] font-extrabold text-[#5F5A4E] transition-all hover:bg-[#F1ECDE] active:scale-95"
          >
            <Store className="h-4 w-4" />
            Run a stall on your own
          </Tile>
          <span className="text-[10.5px] font-bold text-[#8B8471]">
            Door {door.id} · {door.name} · {door.game}
          </span>
        </div>
      </div>
    </div>
  )
}

export function MarketBeat({ count }: { count: number }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center">
      <div className="atlas-plate flex h-36 w-36 flex-col items-center justify-center rounded-full border-4" style={{ borderColor: TINT }} data-testid="beat">
        <span className="atlas-serif text-[64px] leading-none font-semibold text-[#2A2823]">{count}</span>
        <span className="atlas-eyebrow">get ready</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The stall — the parts and the dials                                 */
/* ------------------------------------------------------------------ */

export interface StallControls {
  onPrice: (v: number) => void
  onMarkup: (v: number) => void
  onDiscount: (v: number) => void
  onPredict: (v: number) => void
  onBound: (v: number) => void
}

export function StallPlate({ level, stall, running, free, aim, compact, ctl, priceLock = null, dayIndex = 1 }: { level: Level | null; stall: StallState; running: boolean; free: boolean; aim: string | null; compact: boolean; ctl: StallControls; priceLock?: number | null; dayIndex?: number }) {
  const kind = level?.kind ?? 'fill'
  const perTomato = level ? scheduleOf(level, stall).price : stall.price
  const locked = priceLock !== null
  return (
    <div className="atlas-plate-quiet pointer-events-auto flex max-h-full flex-col gap-2 overflow-y-auto p-3" data-testid="stall-plate">
      <div className="flex items-baseline justify-between">
        <span className="atlas-serif text-[15px] font-semibold text-[#2A2823]">The board</span>
        <Chip>{stall.day && !running ? `${stall.day.unsold} left` : `${stall.stock} in the basin`}</Chip>
      </div>
      {(kind === 'fill' || free) && (
        <div className={cn(aim === 'price' && !locked && 'atlas-aim rounded-[12px] px-1')} data-testid="price-dial" data-locked={locked ? 'true' : undefined}>
          <Dial
            label="Price · each"
            value={stall.price}
            display={cedis(stall.price, 2)}
            min={PRICE_MIN}
            max={PRICE_CEILING}
            step={0.1}
            color={TINT}
            ceiling={PRICE_SOFT_CEILING}
            disabled={running || locked}
            onChange={ctl.onPrice}
            note={locked ? (dayIndex === 1 ? `Day 1: observe at ${cedis(DAY1_PRICE)}. The lever is yours from day 2.` : `Day ${dayIndex}: the experiment — ${cedis(stall.price, 2)}, locked. Say the till, then open.`) : 'Cheaper — more shoppers stop. Dearer — fewer. Drag it and watch the alley.'}
          />
          {!compact && !locked && <p className="-mt-0.5 flex justify-between text-[9px] font-extrabold text-[#8B8471]"><span>{cedis(PRICE_MIN)} · more shoppers</span><span>{cedis(PRICE_SOFT_CEILING, 2)} · fewer</span></p>}
        </div>
      )}
      {kind === 'ratio' && !free && (
        <>
          <div className="rounded-[12px] border border-[#E4DCC9] bg-[#FBF8EF] px-2.5 py-2">
            <span className="atlas-eyebrow">Paid wholesale</span>
            <p className="text-[13px] font-black text-[#2A2823]">
              {cedis(WHOLESALE.price)} for {WHOLESALE.count} · {cedis(costPerTomato(), 2)} each · {cedis(kiloPrice(costPerTomato()), 2)} a kilo
            </p>
          </div>
          <div className={cn(aim === 'markup' && 'atlas-aim rounded-[12px] px-1')} data-testid="markup-dial">
            <Dial label="Mark-up" value={stall.markup * 100} display={`+${Math.round(stall.markup * 100)} % → ${cedis(kiloPrice(perTomato), 2)} / kg`} min={0} max={80} step={5} color={TINT} disabled={running} onChange={(v) => ctl.onMarkup(v / 100)} />
          </div>
          <div className={cn(aim === 'discount' && 'atlas-aim rounded-[12px] px-1')} data-testid="discount-dial">
            <Dial label={`Discount from ${DISCOUNT_HOUR - 12} pm`} value={stall.discount * 100} display={stall.discount ? `−${Math.round(stall.discount * 100)} %` : 'none'} min={0} max={50} step={5} color="#2E6DA8" disabled={running} onChange={(v) => ctl.onDiscount(v / 100)} note="A percentage decrease, once, on what is left." />
          </div>
        </>
      )}
      {kind === 'harmattan' && !free && (
        <>
          <div className="rounded-[12px] border border-[#E4DCC9] bg-[#2A2823] px-2.5 py-2 text-[#FBF8EF]" data-testid="harmattan-board">
            <span className="atlas-eyebrow" style={{ color: '#F0D39A' }}>
              The board, four mornings · {CURRENCY_LABEL} per kilo
            </span>
            <div className="mt-1 grid grid-cols-4 gap-1 text-center">
              {harmattanBoard().map((p, i) => (
                <div key={i} className="rounded bg-[#3B3733] px-1 py-1">
                  <span className="block text-[9.5px] font-extrabold text-[#D8D0BC]">{HARMATTAN.days[i]}</span>
                  <span className="block text-[14px] font-black tabular-nums">{p.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <p className="mt-1 text-[10px] font-bold text-[#D8D0BC]">Today {HARMATTAN.kilos.toFixed(2)} kg went, on a scale that reads to the nearest {HARMATTAN.scaleStep * 1000} g.</p>
          </div>
          <div className={cn(aim === 'predict' && 'atlas-aim rounded-[12px] px-1')} data-testid="predict-dial">
            <Dial label="Friday's price" value={stall.prediction ?? 36.5} display={stall.prediction === null ? 'not set' : cedis(stall.prediction, 2)} min={30} max={55} step={0.05} color={TINT} onChange={ctl.onPredict} note={stall.prediction === null ? 'Move it, then lock it in below.' : undefined} />
          </div>
          <div className={cn(aim === 'bound' && 'atlas-aim rounded-[12px] px-1')} data-testid="bound-dial">
            <Dial label="Today's takings could be off by" value={stall.bound ?? 0} display={stall.bound === null ? 'not set' : `± ${cedis(stall.bound, 2)}`} min={0} max={5} step={0.05} color="#2E6DA8" onChange={ctl.onBound} note="Half a step on the scale, in kilos, times the price." />
          </div>
        </>
      )}
      {!compact && kind !== 'fill' && !free && (
        <p className="text-[10.5px] font-bold text-[#8B8471]">
          {kind === 'ratio' ? `Profit = (till − ${cedis(WHOLESALE.price)}) ÷ ${cedis(WHOLESALE.price)}. Fewer than ${FEW_LEFT + 1} left counts.` : 'Each morning is the one before, times the same number.'}
        </p>
      )}
    </div>
  )
}

const CURRENCY_LABEL = '₵'

/* ------------------------------------------------------------------ */
/* The till — the instrument                                           */
/* ------------------------------------------------------------------ */

export function TillPlate({ level, stall, live, running, free, aim, compact, onOpen, onClose, onLock, onHandIn, onSend, onNextDay }: { level: Level | null; stall: StallState; live: { t: number; till: number; sold: number; unsold: number } | null; running: boolean; free: boolean; aim: string | null; compact: boolean; onOpen: () => void; onClose: () => void; onLock: () => void; onHandIn: () => void; onSend: () => void; onNextDay?: () => void }) {
  const kind = level?.kind ?? 'fill'
  const g = level ? gaugeFor(level, stall) : null
  const till = live ? live.till : (stall.day?.till ?? 0)
  // The plates carry the reading; this is the instrument's buttons only, one
  // row, so the till never covers the stall it measures.
  const openBtn = running ? (
    <AtlasButton onClick={onClose} className={cn('py-2', compact ? 'flex-1' : 'flex-1')} ariaLabel="Close early">
      ■ Close early
    </AtlasButton>
  ) : stall.day && onNextDay ? (
    <AtlasButton onClick={onNextDay} tone={g?.hit ? 'quiet' : 'primary'} invite={aim === 'open' || aim === 'price'} className={cn('flex-1 py-2', (aim === 'open' || aim === 'price') && !g?.hit && 'atlas-aim')} ariaLabel="Run another day">
      ▶ {compact ? 'Another day' : 'Run another day'}
    </AtlasButton>
  ) : (
    <AtlasButton onClick={onOpen} tone="primary" invite={aim === 'open'} className={cn('flex-1 py-2', aim === 'open' && 'atlas-aim')} ariaLabel={stall.day ? 'Run another day' : 'Open the stall'}>
      ▶ {stall.day ? (compact ? 'Another day' : 'Run another day') : 'Open the stall'}
    </AtlasButton>
  )
  return (
    <div className="atlas-plate-quiet pointer-events-auto flex flex-col gap-1.5 p-2" data-testid="till-plate" data-till={till.toFixed(2)}>
      {kind === 'harmattan' && (
        <div className="text-[11px] font-black text-[#2A2823]">
          {stall.prediction === null && stall.bound === null ? 'Nothing locked yet.' : stall.prediction === null ? `Bounds locked: ± ${cedis(stall.bound ?? 0, 2)} on today. Friday still to name.` : `Locked: ${cedis(stall.prediction, 2)} a kilo${stall.bound === null ? '' : `, ± ${cedis(stall.bound, 2)} on today`}`}
        </div>
      )}
      <div className="flex gap-1.5 whitespace-nowrap">
        {!free && (
          <AtlasButton onClick={onSend} ariaLabel="Send to a friend" className={cn('py-2', compact ? 'w-11 px-0' : 'px-3')} disabled={!stall.day && stall.prediction === null}>
            <Send className="h-4 w-4" />
            {!compact && 'Send'}
          </AtlasButton>
        )}
        {kind !== 'harmattan' ? (
          openBtn
        ) : (
          <AtlasButton onClick={onLock} tone="primary" invite={aim === 'predict' || aim === 'bound'} className="flex-1 py-2" ariaLabel="Lock it in">
            Lock it in
          </AtlasButton>
        )}
        {!free && (
          <AtlasButton onClick={onHandIn} tone="primary" invite={!!g?.hit} ariaLabel="Hand in" className={cn('flex-1 py-2', aim === 'hand' && 'atlas-aim')} disabled={running}>
            <Flag className="h-4 w-4" />
            Hand in
          </AtlasButton>
        )}
      </div>
      {!compact && live && <span className="text-[9.5px] font-bold text-[#8B8471]">{clockLabel(live.t)} · {live.sold} sold, {live.unsold} in the basin</span>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Days — the readings                                                 */
/* ------------------------------------------------------------------ */

export interface DayReading {
  id: number
  label: string
  result: string
  hit: boolean
}

export function DaysPlate({ readings, compact }: { readings: DayReading[]; compact: boolean }) {
  return (
    <div className="atlas-plate pointer-events-auto flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden p-3" data-testid="days">
      <div className="flex items-baseline justify-between">
        <span className="atlas-serif text-[17px] font-semibold text-[#2A2823]">Days</span>
        <Chip>{readings.length ? `${readings.length} run` : 'none yet'}</Chip>
      </div>
      {readings.length === 0 && <p className="text-[11px] font-bold text-[#8B8471]">Every day you run lands here: what was on the board, what the till said.</p>}
      <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
        {readings.slice(0, compact ? 3 : 8).map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-[#E9E2D1] bg-[#FBF8EF] px-2 py-1 text-[11px] font-bold" data-testid="reading">
            <span className="truncate text-[#5A5445]">{r.label}</span>
            <span className={cn('shrink-0 tabular-nums', r.hit ? 'text-[#2F6134]' : 'text-[#8A5410]')}>{r.result}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Our Space                                                           */
/* ------------------------------------------------------------------ */

export interface JournalEntry {
  id: string
  levelId: string
  title: string
  figure: string
  /** price · stock · till · left — the strategy, which is what a friend beats (D6). */
  strategy?: string
  dare?: string
  score: ChallengeScore
  trials: number
  by?: string
}

export function OurSpace({ entries, incoming, onPlay, onRemix, compact }: { entries: JournalEntry[]; incoming: { by?: string; title: string } | null; onPlay: () => void; onRemix: (e: JournalEntry) => void; compact: boolean }) {
  return (
    <div className="atlas-plate pointer-events-auto flex h-full flex-col gap-2 p-3" data-testid="our-space">
      <div className="flex items-baseline justify-between">
        <span className="atlas-serif text-[17px] font-semibold text-[#2A2823]">Our Space</span>
        <Chip>{entries.length ? `${entries.length} handed in` : 'nothing yet'}</Chip>
      </div>
      {incoming && (
        <div className="rounded-[14px] border border-[#EDC9B6] bg-[#F6E3D7] p-3" data-testid="incoming">
          <span className="atlas-eyebrow">{incoming.by ? `${incoming.by}'s market day` : 'A market day for you'}</span>
          <p className="mt-0.5 text-[12.5px] font-black text-[#2A2823]">{incoming.title}</p>
          <p className="text-[10.5px] font-bold text-[#8B8471]">Same shoppers, same day. Beat it, then send it back.</p>
          <AtlasButton onClick={onPlay} tone="primary" invite className="mt-2 w-full">
            <Flag className="h-3.5 w-3.5" /> Beat that
          </AtlasButton>
        </div>
      )}
      {entries.length === 0 && !incoming && (
        <p className="text-[11.5px] leading-snug font-bold text-[#8B8471]">Your strategies land here — the price, the stock, the till, what was left. Send one and a friend's lands beside it. No feed, no strangers, no scores to compare — just the sums.</p>
      )}
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
        {entries.slice(0, compact ? 2 : 4).map((e) => (
          <div key={e.id} className="rounded-[14px] border border-[#E4DCC9] bg-white p-2.5" data-testid="journal-card">
            <div className="flex items-center justify-between">
              <span className="min-w-0 truncate text-[12.5px] font-black text-[#2A2823]">{e.by ? `${e.by} · ` : ''}{e.title}</span>
              <span className="text-[13px] tracking-widest text-[#D99B2B]">
                {'★'.repeat(e.score.stars)}
                <span className="text-[#D8D0BC]">{'★'.repeat(3 - e.score.stars)}</span>
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3">
              <span className="atlas-serif text-[22px] leading-none font-semibold text-[#2A2823]">{e.figure}</span>
              <span className="text-[10.5px] font-bold text-[#8B8471]">{e.strategy ?? `${e.trials} ${e.trials === 1 ? 'day' : 'days'}`}</span>
            </div>
            {e.dare && <p className="mt-0.5 text-[10.5px] font-extrabold text-[#8A5410]">{e.dare}</p>}
            <AtlasButton onClick={() => onRemix(e)} className="mt-2 w-full py-1.5" ariaLabel={`Beat ${e.title}`}>
              <Share2 className="h-3.5 w-3.5" /> Send the strategy
            </AtlasButton>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Score                                                               */
/* ------------------------------------------------------------------ */

export function MarketScore({ level, stall, score, trials, opened, why, strategy, taught, onBook, onNext, onSend, onAgain, onNextDay, nextDayLabel, onClose }: { level: Level; stall: StallState; score: ChallengeScore; trials: number; opened: Door | null; why: string; strategy?: ShareCard | null; taught?: string[]; onBook?: () => void; onNext: () => void; onSend: () => void; onAgain: () => void; onNextDay?: () => void; nextDayLabel?: string; onClose: () => void }) {
  const g = gaugeFor(level, stall)
  const unit = level.kind === 'harmattan' ? 'predictions' : 'days'
  // The three words, explained through the stall (D3): how near the till
  // came, how few days it took, how little was left in the basin.
  const rows: Array<[string, number, string, string]> = [
    ['Accuracy', score.accuracy, level.kind === 'fill' ? 'how near the till came' : level.kind === 'ratio' ? 'how near the profit came' : 'how near Friday came', g.hit ? `${g.cells.map((c) => `${c.label} ${c.value}`).join(' · ')}.` : `${g.met} of ${g.of} met. ${g.cells.find((c) => !c.met)?.todo ?? ''}`],
    ['Economy', score.economy, `how few ${unit} it took`, trials === 1 ? `One ${unit.slice(0, -1)}. Fewer means you reasoned it out.` : `${trials} ${unit}. Fewer next time means you reasoned it out.`],
    ['Thrift', score.thrift, level.kind === 'harmattan' ? 'how few spare predictions' : 'how little you wasted', level.kind === 'harmattan' ? (trials === 1 ? 'Named in one.' : `${trials - 1} spare prediction${trials === 2 ? '' : 's'} used.`) : stall.day ? (stall.day.unsold === 0 ? 'Basin empty — nothing wasted.' : `${stall.day.unsold} left in the basin, and unsold is wasted.`) : 'No day run.'],
  ]
  return (
    <div data-focus-layer="" className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[#2A2823]/35 p-3 backdrop-blur-[2px]">
      <div className="atlas-plate atlas-arrive max-h-[92vh] w-full max-w-md overflow-y-auto p-5" data-testid="score" data-total={score.total} data-hit={g.hit ? 'true' : 'false'}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="atlas-eyebrow">Result · Door {level.door} · Level {level.tier}</span>
            <h2 className="atlas-serif text-[30px] leading-tight font-semibold text-[#2A2823]">
              {score.total} <span className="text-[15px] text-[#8B8471]">/ 1000</span>
            </h2>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span aria-label={`${score.stars} of 3 stars`} className="text-[20px] leading-none tracking-widest text-[#D99B2B]">
              {'★'.repeat(score.stars)}
              <span className="text-[#D8D0BC]">{'★'.repeat(3 - score.stars)}</span>
            </span>
            <Tile onClick={onClose} aria-label="Close" className="rounded-full px-2 text-[15px] font-bold text-[#B9B09A] hover:text-[#4A4438]">
              <X className="h-4 w-4" />
            </Tile>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2.5">
          {rows.map(([label, v, means, text]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] font-black text-[#2A2823]">
                  {label} <span className="text-[10px] font-bold text-[#8B8471]">· {means}</span>
                </span>
                <span className="text-[11px] font-extrabold text-[#8B8471] tabular-nums">{Math.round(v * 100)} / 100</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#EDE6D6]">
                <div className="h-full rounded-full bg-[#3E7C43]" style={{ width: `${Math.round(v * 100)}%` }} />
              </div>
              <span className="text-[10.5px] font-semibold text-[#8B8471]">{text}</span>
            </div>
          ))}
        </div>
        {!g.hit && (
          <p className="mt-3 rounded-xl border border-[#EDC9B6] bg-[#F6E3D7] px-3 py-2 text-[11.5px] font-bold text-[#8A5410]" data-testid="bottleneck">
            {why}
          </p>
        )}
        {opened ? (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-[#C8DFC2] bg-[#E7F1E3] px-3 py-2" data-testid="door-opened">
            <span className="text-[20px]" aria-hidden>
              🚪
            </span>
            <div>
              <p className="text-[12.5px] font-black text-[#2F6134]">A door has opened · Door {opened.id}, {opened.name}</p>
              <p className="text-[11px] font-bold text-[#2F6134]">{opened.game}. {opened.built ? 'Go through.' : 'Nobody has discovered what is behind it yet — your hand-in is in the journal.'}</p>
            </div>
          </div>
        ) : (
          g.hit && <p className="mt-3 text-[11px] font-bold text-[#8B8471]">Handed in. Your day went into the journal.</p>
        )}
        {onBook && taught && taught.length > 0 && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-[#C8DFC2] bg-[#FBF8EF] px-3 py-2" data-testid="taught">
            <span className="text-[18px]" aria-hidden>
              📖
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-black text-[#2A2823]">What Kejetia taught you</p>
              <p className="truncate text-[10.5px] font-extrabold text-[#8B8471]">
                {taught.length} page{taught.length === 1 ? '' : 's'} carry your numbers now: {taught.join(' · ')}
              </p>
            </div>
            <AtlasButton onClick={onBook} tone="quiet" className="shrink-0 py-1.5" ariaLabel="Open the Stall Book">
              Open the book
            </AtlasButton>
          </div>
        )}
        {strategy && g.hit && (
          <div className="mt-3 rounded-xl border border-[#E4DCC9] bg-[#FBF8EF] px-3 py-2" data-testid="strategy">
            <span className="atlas-eyebrow">Your strategy</span>
            <p className="text-[12px] font-black text-[#2A2823]">{strategy.sub}</p>
            <p className="text-[10.5px] font-extrabold text-[#8A5410]">{strategy.dare}</p>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {onNextDay && nextDayLabel && (
            <AtlasButton onClick={onNextDay} tone={g.hit ? 'primary' : 'quiet'} invite={g.hit} className="flex-1 py-2.5" ariaLabel="Next day">
              {nextDayLabel}
            </AtlasButton>
          )}
          {opened?.built ? (
            <AtlasButton onClick={onNext} tone="primary" invite className="flex-1 py-2.5">
              Go through
            </AtlasButton>
          ) : (
            <AtlasButton onClick={onAgain} tone={g.hit ? 'quiet' : 'primary'} invite={!g.hit} className="flex-1 py-2.5" ariaLabel="Play again">
              {g.hit ? 'Back to the stall' : 'Play again'}
            </AtlasButton>
          )}
          <AtlasButton onClick={onSend} className="flex-1 py-2.5" ariaLabel="Send to a friend">
            <Send className="h-4 w-4" /> Send my strategy
          </AtlasButton>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Send — the card and the link                                        */
/* ------------------------------------------------------------------ */

export function drawMarketCard(canvas: HTMLCanvasElement, card: ShareCard): void {
  const W = 640
  const H = 800
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = '#F6F2E8'
  ctx.fillRect(0, 0, W, H)
  // canopy stripes
  for (let i = 0; i < 20; i++) {
    ctx.fillStyle = i % 2 ? '#F4EBDD' : '#C0453C'
    ctx.fillRect(i * 32, 0, 32, 70)
  }
  ctx.fillStyle = '#2A2823'
  ctx.font = '600 26px Fraunces, Georgia, serif'
  ctx.textAlign = 'left'
  ctx.fillText('THE NUMBERWORKS · KEJETIA', 40, 130)
  ctx.font = '900 30px Nunito, sans-serif'
  wrap(ctx, card.headline, 40, 190, 560, 38)
  // the board
  ctx.fillStyle = '#2A2823'
  ctx.fillRect(80, 280, 480, 300)
  ctx.strokeStyle = '#8A5A2B'
  ctx.lineWidth = 12
  ctx.strokeRect(86, 286, 468, 288)
  ctx.fillStyle = '#FBF8EF'
  ctx.textAlign = 'center'
  ctx.font = '900 110px Nunito, sans-serif'
  ctx.fillText(card.figure, 320, 460)
  ctx.fillStyle = '#F0D39A'
  ctx.font = '800 26px Nunito, sans-serif'
  ctx.fillText(card.sub, 320, 530)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#8A5410'
  ctx.font = '800 26px Nunito, sans-serif'
  wrap(ctx, card.dare, 40, 640, 560, 34)
  ctx.fillStyle = '#D99B2B'
  ctx.font = '900 40px sans-serif'
  ctx.fillText('★'.repeat(card.stars) + '☆'.repeat(3 - card.stars), 40, 730)
  ctx.fillStyle = '#8B8471'
  ctx.font = '700 20px Nunito, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(`${card.trials} ${card.trials === 1 ? 'day' : 'days'} · ploobia.com`, 600, 730)
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number): void {
  const words = text.split(' ')
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y)
      line = w
      y += lh
    } else line = test
  }
  if (line) ctx.fillText(line, x, y)
}

export function MarketSend({ card, link, by, onBy, onClose }: { card: ShareCard; link: string; by: string; onBy: (next: string) => void; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState<string | null>(null)
  useEffect(() => {
    if (canvasRef.current) drawMarketCard(canvasRef.current, card)
  }, [card])
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const share = async () => {
    const canvas = canvasRef.current
    try {
      let files: File[] = []
      if (canvas && typeof navigator.canShare === 'function') {
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
        if (blob) {
          const f = new File([blob], 'ploobia-market.png', { type: 'image/png' })
          if (navigator.canShare({ files: [f] })) files = [f]
        }
      }
      await navigator.share({ title: card.headline, text: `${card.headline}. ${card.dare}`, url: link, ...(files.length ? { files } : {}) })
      setShared('Sent.')
    } catch {
      setShared(null)
    }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div data-focus-layer="" className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[#2A2823]/35 p-3 backdrop-blur-[2px]">
      <div className="atlas-plate atlas-arrive flex max-h-[92vh] w-full max-w-[44rem] flex-col gap-3 overflow-y-auto p-4 sm:flex-row" data-testid="send">
        <canvas ref={canvasRef} className="w-full max-w-[16rem] self-center rounded-[16px] border border-[#E4DCC9]" aria-label="Your share card" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-start justify-between">
            <div>
              <span className="atlas-eyebrow">Send to a friend</span>
              <p className="text-[14px] font-black text-[#2A2823]" data-testid="headline">{card.headline}</p>
              <p className="text-[11.5px] font-bold text-[#8A5410]">{card.dare}</p>
            </div>
            <Tile onClick={onClose} aria-label="Close" className="rounded-full px-2 text-[15px] font-bold text-[#B9B09A] hover:text-[#4A4438]">
              <X className="h-4 w-4" />
            </Tile>
          </div>
          <label className="flex flex-col gap-1">
            <span className="atlas-eyebrow">From</span>
            <input
              data-testid="by"
              value={by}
              onChange={(e) => onBy(cleanNickname(e.target.value))}
              maxLength={NICKNAME_MAX}
              placeholder="Your nickname"
              aria-label="Your nickname, for the card"
              autoComplete="off"
              spellCheck={false}
              className="min-h-[--hit] w-full rounded-[12px] border border-[#E4DCC9] bg-[#FBF8EF] px-2.5 py-1.5 text-[13px] font-extrabold text-[#2A2823] placeholder:font-bold placeholder:text-[#B9B09A] focus:border-[#B5541C] focus:outline-none"
            />
          </label>
          {canShare && (
            <AtlasButton onClick={share} tone="primary" invite className="w-full py-2.5" ariaLabel="Share the card and the link">
              <Share2 className="h-4 w-4" /> WhatsApp, or wherever — the card and the link
            </AtlasButton>
          )}
          <AtlasButton onClick={copy} className="w-full py-2.5" ariaLabel="Copy link">
            <Copy className="h-4 w-4" /> {copied ? 'Copied' : 'Copy the link'}
          </AtlasButton>
          <p className="break-all rounded-lg border border-[#E9E2D1] bg-[#F6F2E8] px-2 py-1.5 font-mono text-[10px] text-[#5A5445]" data-testid="link">
            {link}
          </p>
          {shared && <p className="text-[11px] font-bold text-[#2F6134]">{shared}</p>}
          <p className="text-[10.5px] font-bold text-[#8B8471]">The link opens the identical market day — same shoppers, same limits — with your dare on the gauge. Nickname only; nothing else about you leaves this device.</p>
        </div>
      </div>
    </div>
  )
}
