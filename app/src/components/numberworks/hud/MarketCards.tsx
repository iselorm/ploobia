import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronRight, Delete, Users, X } from 'lucide-react'
import { Tile } from '@/components/ui/tile'
import Ploob2 from '@/components/brand/Ploob2'
import { cn } from '@/lib/utils'
import {
  BASIN_MAX,
  EVENT_DROP_TO,
  cedis,
  clockLabel,
  eventLines,
  gaugeFor,
  rowsOf,
  type DayQuestion,
  type DayRun,
  type Level,
  type Reconstruction,
  type StallState,
  type Counterfactual,
  type DayRecord,
  type WhyOption,
  type WhyQuestion,
} from '@/lib/market'
import { AtlasButton, Chip } from '@/components/sugar/hud/AtlasKit'

/**
 * Round A.2 — the cards review 1 asked for, in the order a learner meets
 * them: the mission at rest, the number typed, the three plates that are the
 * whole HUD while the day runs, the count layer, the four o'clock event, the
 * reconstruction before the score, and the one why-question that becomes
 * the stamp. Nothing here names a syllabus.
 */

export const TINT = '#B5541C'

/* ------------------------------------------------------------------ */
/* The three plates — level 1 of the HUD                               */
/* ------------------------------------------------------------------ */

export interface Plate {
  id: string
  label: string
  value: string
  unit?: string
  sub?: string
  progress: number
  color: string
  met?: boolean
}

/**
 * TARGET · STOCK · TILL, and nothing else, while the world is moving. The
 * plates carry the gauge's attributes (met / of / hit) so the target and the
 * reading are still one instrument, as the grammar requires.
 */
export function Plates({ level, stall, live, gather, compact }: { level: Level | null; stall: StallState; live: { t: number; till: number; sold: number; unsold: number } | null; gather: { needed: number | null; caught: number; left: number } | null; compact: boolean }) {
  const g = level ? gaugeFor(level, stall) : null
  const plates: Plate[] = []
  if (gather) {
    const need = gather.needed
    plates.push({ id: 'needed', label: 'Needed', value: need === null ? '—' : `${need}`, unit: 'you said', progress: need === null ? 0 : 1, color: '#2F6134' })
    plates.push({ id: 'basin', label: 'In the basin', value: `${gather.caught}`, unit: 'tomatoes', sub: need === null ? `of ${BASIN_MAX}` : gather.caught >= need ? 'target stock reached' : `${gather.caught} / ${need}`, progress: need === null ? gather.caught / BASIN_MAX : Math.min(1, gather.caught / need), color: '#C93B2A', met: need !== null && gather.caught >= need })
    plates.push({ id: 'time', label: 'Time', value: `${Math.ceil(gather.left)} s`, unit: 'left', progress: 0, color: '#8B8471' })
  } else if (!level || level.kind === 'fill') {
    const target = level ? level.target.value : null
    const till = live ? live.till : (stall.day?.till ?? 0)
    const stock = live ? live.unsold : stall.day ? stall.day.unsold : stall.stock
    plates.push({ id: 'target', label: 'Target', value: target === null ? 'none' : cedis(target), sub: target === null ? 'a free stall' : 'by closing', progress: target === null ? 0 : Math.min(1, till / target), color: '#2F6134', met: target === null ? undefined : live ? live.till >= target - 1e-9 : g?.hit })
    plates.push({ id: 'stock', label: 'Stock', value: `${stock}`, unit: 'tomatoes', sub: live ? `${live.sold} sold` : stall.day ? `${stall.day.sold} sold` : undefined, progress: stock / BASIN_MAX, color: '#C93B2A' })
    plates.push({ id: 'till', label: 'Till', value: cedis(till), unit: live ? 'so far' : stall.day ? 'at closing' : 'empty', sub: live ? clockLabel(live.t) : target !== null && stall.day && till < target ? `${cedis(target - till)} short` : undefined, progress: target === null ? (till > 0 ? 1 : 0) : Math.min(1, till / target), color: TINT })
  } else if (level.kind === 'ratio' && g) {
    const till = live ? live.till : (stall.day?.till ?? 0)
    for (const c of g.cells) plates.push({ id: c.id, label: c.short, value: c.value, unit: c.want, sub: c.met ? undefined : c.todo, progress: c.progress, color: c.met ? '#2F6134' : '#D99B2B', met: c.met })
    plates.push({ id: 'till', label: 'Till', value: cedis(till), unit: live ? 'so far' : `paid ${cedis(180)}`, sub: live ? clockLabel(live.t) : undefined, progress: Math.min(1, till / 300), color: TINT })
  } else if (g) {
    for (const c of g.cells) plates.push({ id: c.id, label: c.short, value: c.value, unit: c.want, sub: c.met ? undefined : c.todo, progress: c.progress, color: c.met ? '#2F6134' : '#D99B2B', met: c.met })
  }
  return (
    <div className={cn('pointer-events-auto flex max-w-full items-stretch gap-1.5 sm:gap-2', compact && 'gap-1')} data-testid="gauge" data-met={g?.met ?? 0} data-of={g?.of ?? 0} data-hit={g?.hit ? 'true' : 'false'}>
      {plates.map((p) => (
        <div key={p.id} className={cn('atlas-plate-quiet flex min-w-0 flex-col', compact ? 'w-[6.4rem] px-2 py-1' : 'w-[8.6rem] px-3 py-1.5')} data-testid={`cell-${p.id}`} data-met={p.met ? 'true' : p.met === false ? 'false' : undefined}>
          <div className="flex items-baseline justify-between gap-1">
            <span className="atlas-eyebrow truncate">{compact ? p.label.split(' ')[0] : p.label}</span>
            {p.met && (
              <Chip tone="good">
                <Check className="h-2.5 w-2.5" />
              </Chip>
            )}
          </div>
          <span className={cn('truncate leading-none font-black tabular-nums text-[#2A2823]', compact ? 'text-[15px]' : 'text-[19px]')}>
            {p.value}
            {p.unit && <span className="ml-1 text-[9.5px] font-extrabold text-[#8B8471]">{p.unit}</span>}
          </span>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#EDE6D6]">
            <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.round(Math.max(0, Math.min(1, p.progress)) * 100)}%`, background: p.color }} />
          </div>
          {p.sub && <span className={cn('truncate text-[9.5px] font-bold', p.met ? 'text-[#2F6134]' : 'text-[#8B8471]')}>{p.sub}</span>}
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Mission — the world at rest, one line                               */
/* ------------------------------------------------------------------ */

export function MissionCard({ level, onNext }: { level: Level; onNext: () => void }) {
  const fill = level.kind === 'fill'
  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex items-start justify-center pt-[22vh]" data-testid="mission">
      <div className="atlas-plate atlas-arrive pointer-events-auto w-full max-w-[22rem] p-4 text-center">
        <span className="atlas-eyebrow">Door {level.door} · The Market</span>
        <h2 className="atlas-serif mt-0.5 text-[19px] leading-tight font-semibold text-[#2A2823]">
          {fill ? (
            <>
              Market closes at six. The till needs <span style={{ color: TINT }}>{cedis(level.target.value)}</span>.
            </>
          ) : (
            level.title
          )}
        </h2>
        <p className="mt-1 text-[11.5px] font-bold text-[#5F5A4E]">{fill ? `One tomato sells for ${cedis(4)}. The basin is empty.` : level.blurb}</p>
        <AtlasButton onClick={onNext} tone="primary" invite className="mt-3 w-full py-2.5 text-[13px]" ariaLabel="First, a number">
          First — a number <ChevronRight className="h-4 w-4" />
        </AtlasButton>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Predict — a typed number, no options                                */
/* ------------------------------------------------------------------ */

function Keypad({ onKey, decimals }: { onKey: (k: string) => void; decimals: boolean }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', decimals ? '.' : '', '0', '⌫']
  return (
    <div className="grid grid-cols-3 gap-1" data-testid="keypad">
      {keys.map((k, i) =>
        k ? (
          <Tile
            key={i}
            onClick={() => onKey(k)}
            aria-label={k === '⌫' ? 'Delete' : `Key ${k}`}
            className="flex h-10 items-center justify-center rounded-[10px] border border-[#E4DCC9] bg-[#F6F2E8] text-[14px] font-black text-[#2A2823] active:scale-95"
          >
            {k === '⌫' ? <Delete className="h-4 w-4" /> : k}
          </Tile>
        ) : (
          <span key={i} />
        ),
      )}
    </div>
  )
}

/**
 * The number, typed. Never four options: a child who picks is guessing at
 * the page, a child who types is doing the sum. Ploob repeats it back
 * whatever it is; the world checks it.
 */
export function PredictCard({ eyebrow, question, unit, decimals, prefix, onCommit, onClose }: { eyebrow: string; question: string; unit: string; decimals: boolean; prefix?: string; onCommit: (n: number) => void; onClose?: () => void }) {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
  }, [])
  const value = text === '' || text === '.' ? null : Number(text)
  const ok = value !== null && Number.isFinite(value) && value > 0
  const key = (k: string) => {
    if (k === '⌫') setText((t) => t.slice(0, -1))
    else if (k === '.') setText((t) => (t.includes('.') ? t : t === '' ? '0.' : t + '.'))
    else setText((t) => (t.length >= 6 ? t : t === '0' ? k : t + k))
  }
  return (
    <div data-focus-layer="" className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[#2A2823]/38 p-3 backdrop-blur-[2px]">
      <div className="atlas-plate atlas-arrive w-full max-w-[26rem] p-4 sm:p-5" data-testid="brief">
        <div className="flex items-start justify-between gap-2">
          <span className="atlas-eyebrow">{eyebrow}</span>
          {onClose && (
            <Tile onClick={onClose} aria-label="Close" className="rounded-full px-2 text-[15px] font-bold text-[#B9B09A] hover:text-[#4A4438]">
              <X className="h-4 w-4" />
            </Tile>
          )}
        </div>
        <div className="mt-1 flex gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="atlas-serif text-[18px] leading-tight font-semibold text-[#2A2823]">{question}</h2>
            <p className="mt-2 text-[10.5px] font-bold text-[#8B8471]">Type it. Ploob will hold you to it — the day is what checks it, not a mark.</p>
            <form
              className="mt-2 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (ok && value !== null) onCommit(value)
              }}
            >
              <label className="flex items-center gap-1 rounded-[10px] border-2 border-[#2A2823] bg-[#FCFAF4] px-2">
                {prefix && <span className="text-[16px] font-black text-[#8B8471]">{prefix}</span>}
                <input
                  ref={inputRef}
                  data-testid="typed"
                  aria-label="Your number"
                  inputMode={decimals ? 'decimal' : 'numeric'}
                  autoComplete="off"
                  value={text}
                  onChange={(e) => {
                    const raw = e.target.value.replace(decimals ? /[^\d.]/g : /\D/g, '').slice(0, 6)
                    setText(raw)
                  }}
                  placeholder="?"
                  className="h-10 w-20 bg-transparent text-center text-[22px] font-black text-[#2A2823] tabular-nums placeholder:text-[#B9B09A] focus:outline-none"
                />
              </label>
              <span className="text-[11px] font-extrabold text-[#8B8471]">{unit}</span>
            </form>
          </div>
          <div className="w-[8.2rem] shrink-0">
            <Keypad onKey={key} decimals={decimals} />
            <AtlasButton onClick={() => ok && value !== null && onCommit(value)} tone="primary" invite={ok} disabled={!ok} className="mt-1 w-full py-2" ariaLabel="Commit">
              <Check className="h-4 w-4" /> Commit
            </AtlasButton>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The count layer — rows of ten                                       */
/* ------------------------------------------------------------------ */

/**
 * Ploob touches the scale; the market dulls; the tomatoes stand in rows of
 * ten and the spare row ghosts. Three seconds, no label, no mode name (D7).
 * Drawn over the world rather than lifted out of the basin in three: the
 * rows are the point, and a card that lands over the basin reads as the
 * basin's own contents standing up.
 */
export function CountLift({ count, need, line, onDone, ms = 3400 }: { count: number; need: number | null; line: string; onDone: () => void; ms?: number }) {
  const r = rowsOf(count, need)
  useEffect(() => {
    const id = setTimeout(onDone, ms)
    return () => clearTimeout(id)
  }, [onDone, ms])
  const cells = Array.from({ length: r.rows * 10 }, (_, i) => i)
  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center" data-testid="count-lift" style={{ background: 'rgba(60,48,30,0.28)', backdropFilter: 'saturate(0.45) brightness(0.85)' }}>
      <div className="atlas-plate atlas-arrive p-4" style={{ background: 'rgba(252,250,244,0.9)' }}>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(10, 22px)' }} data-rows={r.rows}>
          {cells.map((i) => {
            const there = i < count
            const spare = i >= r.full
            return (
              <span
                key={i}
                className="market-count-tom"
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: there ? 'radial-gradient(circle at 35% 35%, #FF8A6A, #C93B2A)' : 'transparent',
                  opacity: !there ? 0 : spare ? 0.25 : 1,
                  boxShadow: there ? '0 1px 1px rgba(0,0,0,.25)' : 'none',
                  animation: there ? `market-count-in 320ms ${Math.min(1200, i * 22)}ms cubic-bezier(0.16,1,0.3,1) both` : undefined,
                }}
              />
            )
          })}
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <span className="atlas-serif text-[24px] font-semibold tabular-nums text-[#2A2823]" data-testid="count-line">
            {line}
          </span>
          {r.spare > 0 && need !== null && <Chip>+ {r.spare} spare</Chip>}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Four o'clock — keep, or drop                                        */
/* ------------------------------------------------------------------ */

export function EventCard({ run, target, onKeep, onDrop }: { run: DayRun; target: number; onKeep: () => void; onDrop: () => void }) {
  const l = eventLines(run, target)
  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex items-start justify-center pt-[24vh]" data-testid="event">
      <div className="atlas-plate atlas-arrive pointer-events-auto w-full max-w-[20rem] p-3 text-center">
        <span className="atlas-eyebrow">Four o'clock</span>
        <p className="atlas-serif mt-0.5 text-[15px] leading-tight font-semibold text-[#2A2823]">{l.headline}</p>
        <div className="mt-2 flex gap-2">
          <AtlasButton onClick={onKeep} tone="primary" className="flex-1 flex-col gap-0 py-1.5" ariaLabel={`Keep ${cedis(run.schedule.price, 2)}`}>
            <span>Keep {cedis(run.schedule.price, 2)}</span>
            <span className="text-[9.5px] font-bold opacity-80">{l.keep}</span>
          </AtlasButton>
          <AtlasButton onClick={onDrop} className="flex-1 flex-col gap-0 py-1.5" ariaLabel={`Drop to ${cedis(EVENT_DROP_TO, 2)}`}>
            <span>Drop to {cedis(EVENT_DROP_TO, 2)}</span>
            <span className="text-[9.5px] font-bold opacity-80">{l.drop}</span>
          </AtlasButton>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Closing — the reconstruction before the score                       */
/* ------------------------------------------------------------------ */

export function CloseCard({ level, recon, hit, dayIndex, onNext }: { level: Level; recon: Reconstruction; hit: boolean; dayIndex: number; onNext: () => void }) {
  const grid = recon.grid
  const rows = grid ? Math.ceil(Math.max(1, grid.of) / 10) : 0
  return (
    <div data-focus-layer="" className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[#2A2823]/38 p-3 backdrop-blur-[2px]">
      <div className="atlas-plate atlas-arrive max-h-[92vh] w-full max-w-[26rem] overflow-y-auto p-4" data-testid="close" data-hit={hit ? 'true' : 'false'}>
        <span className="atlas-eyebrow" style={{ color: hit ? '#2F6134' : '#8A5410' }}>
          Closing time · {level.kind === 'harmattan' ? 'the board' : `day ${dayIndex}`}
        </span>
        <h2 className="atlas-serif text-[20px] leading-tight font-semibold text-[#2A2823]" data-testid="close-headline">
          {recon.headline}
        </h2>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5">
          {recon.rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-2 text-[11px] font-extrabold">
              <span className="truncate text-[#5F5A4E]">{k}</span>
              <span className="shrink-0 tabular-nums text-[#2A2823]">{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-[12px] bg-[#F6F2E8] px-3 py-2" data-testid="reconstruction">
          {grid && (
            <div className="grid shrink-0 gap-[2px]" style={{ gridTemplateColumns: 'repeat(10, 8px)' }} aria-hidden>
              {Array.from({ length: rows * 10 }, (_, i) => (
                <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: i < grid.of ? 'radial-gradient(circle at 35% 35%, #FF8A6A, #C93B2A)' : 'transparent', opacity: i < grid.lit ? 1 : i < grid.of ? 0.22 : 0 }} />
              ))}
            </div>
          )}
          <div className="min-w-0">
            {recon.lines.map((l, i) => (
              <div key={i} className={cn('atlas-serif truncate font-semibold tabular-nums', l.tone === 'said' ? 'text-[13px] text-[#8B8471]' : 'text-[17px] text-[#B5541C]')} data-tone={l.tone}>
                {l.text}
              </div>
            ))}
          </div>
        </div>
        <AtlasButton onClick={onNext} tone="primary" invite className="mt-3 w-full py-2.5 text-[13px]" ariaLabel={hit ? 'Why did it work?' : 'Continue'}>
          {hit ? 'Why did it work?' : 'What went short?'} <ChevronRight className="h-4 w-4" />
        </AtlasButton>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Explain — one question, answered by the day                         */
/* ------------------------------------------------------------------ */

/**
 * The why, after the day. Review 2: no "1 of 3" — the eyebrow is the day's
 * own question. For the third why the days sit above the lenses as a table,
 * and the button hands over to the replay when the market has one to show.
 */
export function ExplainCard({ why, eyebrow, kind, days, stamp, chosen, next, taught, onBook, onChoose, onDone }: { why: WhyQuestion; eyebrow: string; kind: 'sum' | 'scenario' | 'best'; days: DayRecord[]; stamp: string[]; chosen: WhyOption | null; next: string | null; taught?: string[]; onBook?: () => void; onChoose: (o: WhyOption) => void; onDone: () => void }) {
  return (
    <div data-focus-layer="" className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[#2A2823]/38 p-3 backdrop-blur-[2px]">
      <div className="atlas-plate atlas-arrive max-h-[92vh] w-full max-w-[26rem] overflow-y-auto p-4" data-testid="explain" data-kind={kind} data-chosen={chosen ? (chosen.right ? 'right' : 'other') : 'none'}>
        <span className="atlas-eyebrow">{eyebrow}</span>
        <h2 className="atlas-serif text-[19px] leading-tight font-semibold text-[#2A2823]">{why.question}</h2>
        {kind === 'best' && days.length > 0 && (
          <div className="mt-2 grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-3 gap-y-0.5 text-[10.5px] font-extrabold tabular-nums" data-testid="days-table">
            <span className="atlas-eyebrow">day</span>
            <span className="atlas-eyebrow">price · stock</span>
            <span className="atlas-eyebrow">till</span>
            <span className="atlas-eyebrow">each</span>
            <span className="atlas-eyebrow">left</span>
            {days.map((d) => (
              <Fragment key={d.dayIndex}>
                <span>{d.dayIndex}</span>
                <span className="truncate">
                  {cedis(d.result.schedule.price, 2)}
                  {d.result.schedule.discount > 0 ? ` → ${cedis(EVENT_DROP_TO, 2)} at 4` : ''} · {d.stock}
                </span>
                <span>{cedis(d.result.till, 2)}</span>
                <span>{d.result.sold > 0 ? cedis(d.result.till / d.result.sold, 2) : '—'}</span>
                <span>{d.result.unsold}</span>
              </Fragment>
            ))}
          </div>
        )}
        {kind === 'best' && (
          <div className="mt-2 flex items-center gap-2">
            <Ploob2 size={22} />
            <span className="text-[12px] font-black text-[#2A2823]">Best for what?</span>
          </div>
        )}
        <div className={cn('mt-2 gap-1.5', kind === 'best' ? 'grid grid-cols-2' : 'flex flex-col')}>
          {why.options.map((o, i) => (
            <Tile
              key={i}
              onClick={() => onChoose(o)}
              aria-label={o.text}
              data-testid="why-option"
              data-right={o.right ? 'true' : 'false'}
              className={cn(
                'rounded-[12px] border px-3 py-2 text-left text-[12px] font-extrabold transition-all active:scale-[0.99]',
                chosen === o ? (o.right ? 'border-[#3E7C43] bg-[#E7F1E3] text-[#2F6134]' : 'border-[#F0D39A] bg-[#FBEBD0] text-[#8A5A12]') : 'border-[#E4DCC9] bg-[#FCFAF4] text-[#2A2823] hover:bg-[#F1ECDE]',
              )}
            >
              {o.text}
            </Tile>
          ))}
        </div>
        {chosen && (
          <div className="mt-2 flex items-start gap-2" data-testid="why-answer">
            <Ploob2 size={26} />
            <p className="text-[11.5px] font-extrabold text-[#2A2823]">{chosen.answer}</p>
          </div>
        )}
        <div className="mt-3 rounded-[12px] border border-dashed border-[#D8D0BC] bg-[#F6F2E8] px-3 py-2" data-testid="stamp">
          <span className="atlas-eyebrow">Your stamp · four lines</span>
          <ol className="mt-0.5 list-none space-y-0.5 text-[10.5px] font-bold text-[#5F5A4E]">
            {stamp.map((l, i) => (
              <li key={i} className={cn(i === 3 && !chosen && 'text-[#B9B09A]')}>
                {l}
              </li>
            ))}
          </ol>
        </div>
        {kind === 'best' && chosen && onBook && taught && taught.length > 0 && (
          <div className="mt-2 flex items-center gap-2 rounded-[12px] border border-[#C8DFC2] bg-[#FBF8EF] px-3 py-2" data-testid="explain-book">
            <span className="text-[15px]" aria-hidden>
              📖
            </span>
            <div className="min-w-0 flex-1">
              <b className="block text-[11px] font-black text-[#2A2823]">What Kejetia taught you</b>
              <span className="block truncate text-[10px] font-extrabold text-[#8B8471]">
                {taught.length} page{taught.length === 1 ? '' : 's'} carry your numbers: {taught.join(' · ')}
              </span>
            </div>
            <AtlasButton onClick={onBook} tone="quiet" className="shrink-0 py-1" ariaLabel="Open the Stall Book">
              Open the book
            </AtlasButton>
          </div>
        )}
        {next && chosen && <p className="mt-2 text-[11px] font-extrabold text-[#8B8471]">Now the market replays the price you did not choose — on the same forty.</p>}
        <AtlasButton onClick={onDone} tone="primary" invite={!!chosen} disabled={!chosen} className="mt-3 w-full py-2.5 text-[13px]" ariaLabel={next && chosen ? next : 'Back to the stall'}>
          {next && chosen ? next : chosen?.right ? 'Stamped — back to the stall' : chosen ? 'Noted — back to the stall' : 'Choose one'} <ChevronRight className="h-4 w-4" />
        </AtlasButton>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The replay — review 2's hero: the same forty, the other board         */
/* ------------------------------------------------------------------ */

/**
 * While the replay runs the chrome is gone: one banner naming what is being
 * replayed, and the till counting in a corner. The world does the rest.
 */
export function ReplayBanner({ c, till, t }: { c: Counterfactual; till: number; t: number }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-30 flex flex-col items-center" data-testid="replay-banner">
      <div className="flex w-full items-center justify-center gap-3 bg-[#2A2823]/85 px-3 py-2 text-[11px] font-black tracking-[0.1em] text-[#FCFAF4] uppercase">
        <span>Same market · same forty · {c.kind === 'price' ? `at ${c.other.label}` : c.other.label}</span>
        <span className="opacity-60">{clockLabel(t)}</span>
      </div>
      <div className="atlas-plate mt-2 flex items-baseline gap-1.5 self-end px-3 py-1.5 mr-3" style={{ color: '#2F6134' }}>
        <span className="atlas-serif text-[20px] leading-none font-semibold tabular-nums" data-testid="replay-till">
          {cedis(till, 2)}
        </span>
        <span className="text-[9.5px] font-black tracking-[0.08em] text-[#8B8471] uppercase">counting</span>
      </div>
    </div>
  )
}

function Half({ eyebrow, till, sub, tone }: { eyebrow: string; till: number; sub: string; tone: 'chosen' | 'other' }) {
  const c = tone === 'chosen' ? { bg: '#FBEBD0', border: '#F0D39A', ink: '#8A5A12' } : { bg: '#E7F1E3', border: '#C8DFC2', ink: '#2F6134' }
  return (
    <div className="min-w-0 rounded-[12px] border px-3 py-2" style={{ background: c.bg, borderColor: c.border }} data-testid={`replay-${tone}`}>
      <span className="atlas-eyebrow block" style={{ color: c.ink }}>
        {eyebrow}
      </span>
      <div className="atlas-serif text-[26px] leading-none font-semibold tabular-nums" style={{ color: c.ink }} data-till={till.toFixed(2)}>
        {cedis(till)}
      </div>
      <div className="mt-1 text-[10px] font-extrabold text-[#5F5A4E]">{sub}</div>
    </div>
  )
}

function alleyOf(r: Counterfactual['other']['result']): string {
  return `${r.buyers} bought ${r.sold} · ${r.passed} walked past${r.missed ? ` · ${r.missed} too late` : ''}${r.unsold ? ` · ${r.unsold} left` : ''}`
}

/**
 * After the replay: the split result, the market's one line, the other four
 * o'clock branch if there was one, and the stamp — closed here, after the
 * child has SEEN the answer, not before.
 */
export function ReplayCard({ c, second, stamp, onDone }: { c: Counterfactual; second: Counterfactual | null; stamp: string[]; onDone: () => void }) {
  return (
    <div data-focus-layer="" className="pointer-events-auto fixed inset-0 z-40 flex items-end justify-center bg-gradient-to-t from-[#2A2823]/85 via-[#2A2823]/40 to-transparent p-3 sm:items-center">
      <div className="atlas-plate atlas-arrive max-h-[92vh] w-full max-w-[26rem] overflow-y-auto p-4" data-testid="replay-card">
        <span className="atlas-eyebrow">The same forty, the other board</span>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <Half eyebrow={c.kind === 'price' ? `You chose ${c.chosen.label}` : `You ${c.chosen.label}`} till={c.chosen.result.till} sub={alleyOf(c.chosen.result)} tone="chosen" />
          <Half eyebrow={c.kind === 'price' ? `Same market at ${c.other.label}` : `Same market, ${c.other.label}`} till={c.other.result.till} sub={alleyOf(c.other.result)} tone="other" />
        </div>
        <div className="mt-2 flex items-start gap-2" data-testid="replay-verdict">
          <Ploob2 size={26} />
          <p className="text-[11.5px] font-extrabold text-[#2A2823]">{c.verdict}</p>
        </div>
        {second && (
          <div className="mt-2 rounded-[12px] border border-[#E4DCC9] bg-[#F6F2E8] px-3 py-2" data-testid="replay-second">
            <span className="atlas-eyebrow">And at four o’clock</span>
            <div className="mt-0.5 flex items-baseline justify-between text-[11px] font-extrabold">
              <span className="text-[#5F5A4E]">You {second.chosen.label}</span>
              <span className="tabular-nums text-[#8A5A12]">
                {cedis(second.chosen.result.till)} · {second.chosen.result.unsold} left
              </span>
            </div>
            <div className="flex items-baseline justify-between text-[11px] font-extrabold">
              <span className="text-[#5F5A4E]">Had you {second.other.label}</span>
              <span className="tabular-nums text-[#2F6134]">
                {cedis(second.other.result.till)} · {second.other.result.unsold} left
              </span>
            </div>
          </div>
        )}
        <div className="mt-3 rounded-[12px] border border-dashed border-[#D8D0BC] bg-[#F6F2E8] px-3 py-2" data-testid="stamp">
          <span className="atlas-eyebrow">Your stamp · four lines</span>
          <ol className="mt-0.5 list-none space-y-0.5 text-[10.5px] font-bold text-[#5F5A4E]">
            {stamp.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>
        </div>
        <AtlasButton onClick={onDone} tone="primary" invite className="mt-3 w-full py-2.5 text-[13px]" ariaLabel="Stamped — back to the stall">
          Stamped — back to the stall <ChevronRight className="h-4 w-4" />
        </AtlasButton>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The edge tab and its sheet — level 3 of the HUD                     */
/* ------------------------------------------------------------------ */

export function EdgeTab({ open, count, onOpen }: { open: boolean; count: number; onOpen: () => void }) {
  return (
    <Tile
      onClick={onOpen}
      aria-label="Days and Our Space"
      aria-expanded={open}
      data-testid="edge-tab"
      className="atlas-plate-quiet pointer-events-auto flex min-h-[3rem] items-center gap-1.5 rounded-l-[14px] rounded-r-none border-r-0 px-2 py-2 text-[10.5px] font-black tracking-[0.06em] text-[#5F5A4E] uppercase active:scale-95"
      style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
    >
      <Users className="h-3.5 w-3.5 rotate-180" />
      Days · Our Space{count > 0 ? ` · ${count}` : ''}
    </Tile>
  )
}

export function SideSheet({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: ReactNode; title: string }) {
  if (!open) return null
  return (
    <div className="pointer-events-auto fixed inset-0 z-30 flex justify-end bg-[#2A2823]/25" onClick={onClose} data-testid="side-sheet">
      <div className="flex h-full w-full max-w-[22rem] flex-col gap-2 overflow-y-auto bg-[#F6F2E8] p-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="atlas-serif text-[17px] font-semibold text-[#2A2823]">{title}</span>
          <Tile onClick={onClose} aria-label="Close the sheet" className="rounded-full px-2 text-[15px] font-bold text-[#B9B09A] hover:text-[#4A4438]">
            <X className="h-4 w-4" />
          </Tile>
        </div>
        {children}
      </div>
    </div>
  )
}

/** The typed prediction's chip, kept on screen from the beat to the card. */
export function SaidChip({ q, typed }: { q: DayQuestion; typed: number }) {
  return (
    <span className="atlas-chip pointer-events-none" data-testid="said" style={{ borderColor: '#C8DFC2', background: '#E7F1E3', color: '#2F6134' }}>
      you said {q.unit.startsWith('₵') ? `${cedis(typed, 2)} each` : q.kind === 'count' ? `${Math.round(typed)} ${q.unit}` : q.unit === '×' ? `× ${typed.toFixed(2)}` : cedis(typed)}
    </span>
  )
}
