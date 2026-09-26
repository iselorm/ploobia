import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useBandCaps } from '@/lib/bands'
import { Tile } from '@/components/ui/tile'
import Ploob2 from '@/components/brand/Ploob2'
import { portraitUrl } from '@/lib/worldassets'
import { WORLD_TEXT } from '@/lib/worldtext'
import {
  COUNTERFACTUAL_LABEL,
  HANDOFF_ASK,
  RULE_SHORT,
  SAY_BACK,
  SELA_DISPATCH,
  TRIAL_TERMS,
  contradictionLine,
  naraReportLine,
  selaReturnLine,
} from '@/lib/nara'
import { CHOICES, KEEP, farMode, nextKind, packingCrew, runBed, totalCrates, type BedRun, type DawnMark, type HandoffChoice, type KeepReport } from '@/lib/keep'
import { methodSteps, type PlotRun } from '@/lib/plot'
import { judgeHandoff } from '@/lib/whyjudge'
import {
  PLOT_WHY,
  answerKeepPause,
  beginKeep,
  confirmKeep,
  openKeep,
  readKeep,
  talkTo,
  type WorldState,
} from '@/lib/archipelago'
import { WORD_COLOR } from '../plotColors'
import { KEEP_CARD, firstDecisive, reviewTimeline } from '@/lib/keepui'

/**
 * S1 — The Handoff, on screen (storyboard v3.1 §05; Mock B, Selorm
 * 2026-09-26). Six moments: Nara asks · her say-back · Sela's board · the
 * fortnight in review · the report · the copies pause. Cards are liquid
 * glass (`.lg`, solid on low quality). On a phone the three that ask nothing
 * of the child — the review, the report, Sela's board — fold to a pill in
 * Ploob's slot between the stick and the verb, and open as a sheet from the
 * bottom; the three that ask for an answer stay open. While any card is open
 * the explorer is held (as the talk card holds it) and the phone's quest list
 * and tools step back.
 *
 * Every line is `lib/nara.ts` / `lib/worldtext.ts`; every day and number is
 * the stored report's. Nothing here computes a fortnight except the labelled
 * counterfactual, from the stored starting bed.
 */

const K = WORLD_TEXT.keep
const WORD_INK: Record<DawnMark['word'], string> = { SOAKED: '#3F7A96', DAMP: '#2F8A4A', DRY: '#B8741A' }
const WORD_SHORT: Record<DawnMark['word'], string> = { SOAKED: 'S', DAMP: 'Dm', DRY: 'D' }

/* -------------------------------------------------------------------------- */

function Btn({ primary, className, ...p }: React.ComponentProps<typeof Tile> & { primary?: boolean }) {
  return <Tile {...p} className={cn('rounded-full px-4 py-2 text-[13px] font-extrabold text-[#2A2823]', primary ? 'lg-btn-amber' : 'lg-btn', className)} />
}

function Said({ children, small }: { children: string; small?: boolean }) {
  return <p className={cn('mt-1 leading-snug font-semibold text-[#2A2823]', small ? 'text-[13px]' : 'text-[15px]')}>“{children}”</p>
}

function Who({ who, compact, children }: { who: 'nara' | 'sela'; compact: boolean; children: React.ReactNode }) {
  const p = WORLD_TEXT.people[who]
  return (
    <div className="flex items-start gap-3">
      {!compact && <img src={portraitUrl(who)} alt="" width={52} height={52} className="h-13 w-13 shrink-0 rounded-full bg-[#EEE7D8] object-cover" />}
      <div className="min-w-0 flex-1">
        <span className="atlas-eyebrow block">
          {p.name} · {p.title}
        </span>
        {children}
      </div>
    </div>
  )
}

/** A card: low-centre on wide screens (the talk card's place), at the top on a phone. */
function Card({ compact, width = 28, top, testid, children }: { compact: boolean; width?: number; top?: boolean; testid: string; children: React.ReactNode }) {
  return (
    <div className={cn('pointer-events-auto absolute inset-x-0 z-30 flex justify-center px-3', compact ? 'top-2' : top ? 'top-14' : 'bottom-24')} data-focus-layer="">
      <div className={cn('lg w-full overflow-y-auto rounded-[22px]', compact ? 'max-h-[calc(100vh-1rem)] px-3.5 py-2.5' : 'max-h-[calc(100vh-4.5rem)] px-5 py-4')} style={{ maxWidth: `${compact ? 44 : width}rem` }} data-testid={testid}>
        {children}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ 1–2 handoff */

export function HandoffCard({ s, compact }: { s: WorldState; compact: boolean }) {
  const caps = useBandCaps()
  const [picked, setPicked] = useState<HandoffChoice | null>(null)
  const [offer, setOffer] = useState<HandoffChoice[]>([...CHOICES])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [verdict, setVerdict] = useState<string | null>(null)
  useEffect(() => {
    if (!s.keep) openKeep()
  }, [s.keep])
  const steps = useMemo(() => methodSteps([s.plot.first, s.plot.run].filter((r): r is PlotRun => !!r)), [s.plot.first, s.plot.run])
  const typed = caps.conclusion
  async function tell() {
    if (busy || text.trim().length < 3) return
    setBusy(true)
    const r = await judgeHandoff(text)
    setBusy(false)
    setVerdict(r.verdict?.verdict ?? null)
    setOffer(r.offer)
    if (r.candidate) setPicked(r.candidate)
  }
  if (picked) {
    const contra = contradictionLine(picked, steps)
    const trial = farMode(picked) === 'trial'
    return (
      <Card compact={compact} testid="keep-sayback">
        <Who who="nara" compact={compact}>
          {contra && <Said small={compact}>{contra}</Said>}
          <p className={cn('mt-1.5 leading-snug font-extrabold text-[#2A2823]', compact ? 'text-[13px]' : 'text-[14.5px]')} data-testid="keep-sayback-line">
            “{SAY_BACK[picked]}”
          </p>
        </Who>
        {trial && (
          <ul className={cn('mt-2 list-disc pl-5 font-semibold text-[#5F5A4E]', compact ? 'text-[11px]' : 'text-[12px]')} data-testid="keep-terms">
            {TRIAL_TERMS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
        <div className={cn('flex justify-end gap-2', compact ? 'mt-2' : 'mt-3')}>
          <Btn data-testid="keep-revise" onClick={() => setPicked(null)}>
            {K.revise}
          </Btn>
          <Btn
            primary
            autoFocus
            data-testid="keep-confirm"
            onClick={() => {
              confirmKeep(picked, { text: text.trim() || null, verdict, shown: offer, confirmed: picked })
              talkTo(null)
            }}
          >
            {K.confirm}
          </Btn>
        </div>
      </Card>
    )
  }
  return (
    <Card compact={compact} testid="keep-ask">
      <Who who="nara" compact={compact}>
        <Said small={compact}>{HANDOFF_ASK}</Said>
      </Who>
      {typed && (
        <div className="mt-2 flex items-center gap-2" data-testid="keep-own-words">
          <input
            data-testid="keep-text"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 600))}
            onKeyDown={(e) => e.key === 'Enter' && tell()}
            placeholder="Say it in your own words…"
            aria-label={HANDOFF_ASK}
            className="lg-chip min-h-9 min-w-0 flex-1 rounded-xl px-3 py-2 text-[13px] font-semibold text-[#2A2823] outline-none focus:border-[#E8A33D]"
          />
          <Btn primary data-testid="keep-tell" disabled={busy || text.trim().length < 3} onClick={tell}>
            {busy ? '…' : 'Tell her'}
          </Btn>
        </div>
      )}
      <div className={cn('mt-2 grid gap-1.5', compact ? 'grid-cols-2' : 'grid-cols-1')}>
        {offer.map((c) => (
          <Tile
            key={c}
            data-testid={`keep-choice-${c}`}
            className={cn('lg-chip rounded-xl px-3 text-left font-bold text-[#2A2823]', compact ? 'py-1.5 text-[11.5px]' : 'py-2 text-[13px]', c === 'supervised' && '!bg-[#D6ECE8]/70')}
            onClick={() => setPicked(c)}
          >
            {K.choice[c]}
          </Tile>
        ))}
      </div>
      {offer.length < CHOICES.length && (
        <Tile className="mt-1.5 text-[11.5px] font-bold text-[#6F6857] underline" data-testid="keep-all" onClick={() => setOffer([...CHOICES])}>
          Show all five
        </Tile>
      )}
    </Card>
  )
}

/* ---------------------------------------------------------------- 3 board */

function Pegs({ onBeds, compact }: { onBeds: number; compact: boolean }) {
  const peg = (c: string, i: number) => <span key={i} className="mr-1 inline-block rounded-t-[7px] rounded-b-[4px]" style={{ width: compact ? 14 : 18, height: compact ? 22 : 28, background: c }} />
  return (
    <div className="mt-2 grid grid-cols-2 gap-2.5" data-testid="keep-pegs" data-on-beds={onBeds}>
      <div className="lg-chip rounded-xl px-2.5 py-1.5">
        <span className="block text-[9.5px] font-black tracking-wider text-[#8B8471] uppercase">On the beds</span>
        {[0, 1, 2, 3].map((i) => peg(i < onBeds ? '#2F7F7A' : '#D8CFBC', i))}
      </div>
      <div className="lg-chip rounded-xl px-2.5 py-1.5">
        <span className="block text-[9.5px] font-black tracking-wider text-[#8B8471] uppercase">Packing</span>
        {[0, 1, 2, 3].map((i) => peg(i < KEEP.crew - onBeds ? '#E8A33D' : '#D8CFBC', i))}
      </div>
    </div>
  )
}

export function SelaBoard({ s, compact }: { s: WorldState; compact: boolean }) {
  const k = s.keep
  if (!k?.choice) return null
  const practice = nextKind(k) === 'practice'
  const packing = packingCrew(k.choice)
  const mode = farMode(k.choice)
  const go = (rain?: boolean) => {
    beginKeep({ rain })
    talkTo(null)
  }
  return (
    <Card compact={compact} testid="keep-board">
      <Who who="sela" compact={compact}>
        <Said small={compact}>{practice ? 'Another fortnight, for practice? My people stay on the beds either way — nothing gets packed from practice.' : SELA_DISPATCH.brief}</Said>
      </Who>
      <Pegs onBeds={KEEP.crew - packing} compact={compact} />
      {!practice && <p className={cn('mt-1.5 font-bold text-[#2A2823]', compact ? 'text-[11.5px]' : 'text-[12.5px]')}>“{SELA_DISPATCH[mode]}”</p>}
      {!practice && mode !== 'independent' && (
        <p className="mt-0.5 text-[11px] leading-snug font-semibold text-[#6F6857]" data-testid="keep-trade">
          Keeping both beds instead: 1 on the beds · 3 packing · three crates. {K.economyNote}
        </p>
      )}
      <p className={cn('font-extrabold text-[#6F6857]', compact ? 'mt-1 text-[11px]' : 'mt-2 text-[12px]')} data-testid="keep-instruction">
        Far bed: {K.choice[k.choice].replace(/\.$/, '').toLowerCase()} · her mother's bed: the method
      </p>
      <div className={cn('flex flex-wrap justify-end gap-2', compact ? 'mt-1.5' : 'mt-3')}>
        <Btn data-testid="keep-notyet" onClick={() => talkTo(null)}>
          {K.notYet}
        </Btn>
        {practice && (
          <Btn data-testid="keep-practice-rain" onClick={() => go(true)}>
            {K.practiceRain}
          </Btn>
        )}
        <Btn primary autoFocus className="whitespace-nowrap" data-testid="keep-begin" onClick={() => go()}>
          {practice ? K.practice : K.begin}
        </Btn>
      </div>
    </Card>
  )
}

/* -------------------------------------------------------- 4 the review */

function reviewLine(r: KeepReport, day: number): string {
  const far = r.beds.far
  const m = far.marks[day - 1]
  const w = m.word
  if (m.event === 'soaked-refusal') return `Far bed · dawn ${day} · ${w} — the rule says pour. Nara puts the can down.`
  if (m.event === 'pause') return `Far bed · dawn ${day} · ${w} — she has never seen that here. She waits, and makes a note.`
  if (m.event === 'crew-takeover' || m.event === 'crew-called') return `Far bed · day ${day} · Sela's people take over.`
  const next = far.marks[day]
  if (next?.event === 'crew-takeover' && far.stop?.by === 'noon-stop') return `Far bed · day ${day} · the leaves at noon ${m.firm13.toFixed(2)} — below the line. Nara stops the rule.`
  if (r.weatherNight > 0 && day === r.weatherNight + 1) return `Rain in the night — ${Math.round(r.weatherMm)} mm. Far bed · dawn ${day} · ${w}.`
  return `Far bed · dawn ${day} · ${w} · ${m.action === 'can' ? 'one can' : 'wait'}${m.actor === 'crew' ? ' · Sela\'s people' : ''}.`
}

export function ReviewBar({ r, compact, onDone }: { r: KeepReport; compact: boolean; onDone: () => void }) {
  const timeline = useMemo(() => reviewTimeline(r), [r])
  const [i, setI] = useState(0)
  const [folded, setFolded] = useState(compact)
  const [run, setRun] = useState(0)
  // The parent re-renders on every store write; a fresh callback must not restart the day's timer.
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  })
  useEffect(() => {
    if (i >= timeline.length) {
      const t = window.setTimeout(() => done.current(), 900)
      return () => window.clearTimeout(t)
    }
    const t = window.setTimeout(() => setI(i + 1), timeline[i].ms)
    return () => window.clearTimeout(t)
  }, [i, timeline, run])
  const day = Math.min(i + 1, timeline.length)
  const marks = r.beds.far.marks
  const segs = (h: number, w?: number) => (
    <span className="flex gap-[3px]" style={w ? { width: w } : { flex: 1 }}>
      {marks.map((m, j) => (
        <i key={j} className="block flex-1 rounded-[3px]" style={{ height: h, background: j < day ? WORD_COLOR[m.word] : 'rgba(246,242,232,.22)', outline: j === day - 1 ? '2px solid #F6F2E8' : undefined, outlineOffset: 1 }} />
      ))}
    </span>
  )
  if (compact && folded) {
    return (
      <div className="pointer-events-auto absolute bottom-3 left-[9rem] right-[13.5rem] flex justify-center">
        <Tile className="lg lg-dark flex h-11 items-center gap-2.5 !rounded-full px-3.5 text-[12.5px] font-extrabold" data-testid="keep-review-pill" data-day={day} onClick={() => setFolded(false)}>
          {segs(10, 84)}
          Away · day {day}
          <span aria-hidden>▴</span>
        </Tile>
      </div>
    )
  }
  return (
    <div className={cn('pointer-events-auto absolute inset-x-0 z-30 flex justify-center px-3', compact ? 'top-2' : 'top-4')}>
      <div className={cn('lg lg-dark w-full', compact ? 'max-w-[30rem] px-3 py-2' : 'max-w-[34rem] px-4 py-3')} data-testid="keep-review" data-day={day}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="glass-eyebrow">
            While you were away · day {day} of {timeline.length}
          </span>
          <span className="flex gap-1">
            <Tile className="rounded-full px-2 text-[11px] font-extrabold text-[#F6F2E8]/80" data-testid="keep-replay" onClick={() => { setI(0); setRun(run + 1) }}>
              {K.replay} ↺
            </Tile>
            <Tile className="rounded-full px-2 text-[11px] font-extrabold text-[#F6F2E8]/80" data-testid="keep-skip" onClick={onDone}>
              Skip
            </Tile>
            {compact && (
              <Tile className="rounded-full px-2 text-[11px] font-extrabold text-[#F6F2E8]/80" aria-label="Fold" onClick={() => setFolded(true)}>
                ▾
              </Tile>
            )}
          </span>
        </div>
        <div className="mt-1.5 flex">{segs(compact ? 6 : 8)}</div>
        <p className={cn('mt-1.5 leading-snug font-extrabold text-[#F6F2E8]', compact ? 'text-[13px]' : 'text-[15px]')} data-testid="keep-review-line">
          {reviewLine(r, day)}
        </p>
        {r.weatherMm > 0 && (
          <p className="mt-0.5 text-[11.5px] font-semibold text-[#F6F2E8]/80">
            {K.rain}: {Math.round(r.weatherMm)} mm · noon on day {day}: {marks[day - 1].firm13.toFixed(2)}
          </p>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------- 5 the report */

/** One bed's fortnight: the probe word, a can (or the refused one), who cared — and the noon line against 0.6. */
function Strip({ bed, label, compact, counter }: { bed: Omit<BedRun, 'endBed'>; label: string; compact: boolean; counter?: BedRun | null }) {
  const caps = useBandCaps()
  const W = compact ? 16 : 22
  const H = compact ? 26 : 34
  const x = (i: number) => i * W + W / 2
  const y = (f: number) => H - 2 - f * (H - 4)
  const line = (ms: { firm13: number }[]) => ms.map((m, i) => `${x(i)},${y(m.firm13)}`).join(' ')
  return (
    <div className={compact ? 'mt-1' : 'mt-2'} data-testid={`keep-strip-${bed.target}`}>
      <div className="flex justify-between text-[10.5px] font-extrabold text-[#5F5A4E]">
        <span>{label}</span>
        {!compact && caps.quantitative && <span className="font-bold text-[#8B8471]">noon firmness · - - 0.6</span>}
      </div>
      <div className="mt-0.5 flex">
        {bed.marks.map((m) => {
          const ev = m.event === 'soaked-refusal' || m.event === 'pause' || m.event === 'crew-takeover' || m.event === 'crew-called'
          return (
            <div key={m.day} style={{ width: W }} className="text-center" data-testid="keep-mark" data-day={m.day} data-actor={m.actor} data-action={m.action} data-event={m.event ?? ''}>
              <div className="mx-px rounded-[5px] font-black text-white" style={{ height: compact ? 15 : 18, lineHeight: `${compact ? 15 : 18}px`, fontSize: compact ? 8.5 : 9.5, background: WORD_INK[m.word], outline: ev ? '2px solid #2A2823' : undefined, outlineOffset: 1 }} title={`Day ${m.day} · ${m.word}`}>
                {WORD_SHORT[m.word]}
              </div>
              <div className="font-black" style={{ height: compact ? 12 : 14, lineHeight: `${compact ? 12 : 14}px`, fontSize: compact ? 10 : 11, color: m.action === 'can' ? '#2A2823' : m.intended === 'can' ? '#C0392B' : '#B9B09C' }}>
                {m.action === 'can' ? '●' : m.intended === 'can' ? '✕' : '·'}
              </div>
              <div className="mx-0.5 mt-px rounded-sm" style={{ height: compact ? 3 : 4, background: m.actor === 'crew' ? '#2F7F7A' : '#E8A33D' }} />
            </div>
          )
        })}
      </div>
      {caps.quantitative && (
        <svg width={bed.marks.length * W} height={H} className="block" aria-label={`${label}: noon firmness`}>
          <line x1={0} x2={bed.marks.length * W} y1={y(0.6)} y2={y(0.6)} stroke="#C0392B" strokeWidth={1} strokeDasharray="3 3" opacity={0.55} />
          {counter && <polyline fill="none" stroke="#8B8471" strokeWidth={1.5} strokeDasharray="1.5 3" points={line(counter.marks)} data-testid="keep-counterfactual" />}
          <polyline fill="none" stroke="#2F8A4A" strokeWidth={2.2} points={line(bed.marks)} />
        </svg>
      )}
    </div>
  )
}

function Legend({ compact }: { compact: boolean }) {
  return (
    <div className={cn('flex flex-wrap gap-x-3 gap-y-0.5 font-bold text-[#5F5A4E]', compact ? 'mt-1 text-[9.5px]' : 'mt-1.5 text-[10.5px]')}>
      <span>
        <b style={{ color: WORD_INK.SOAKED }}>S</b> soaked · <b style={{ color: WORD_INK.DAMP }}>Dm</b> damp · <b style={{ color: WORD_INK.DRY }}>D</b> dry
      </span>
      <span>
        ● a can · <b className="text-[#C0392B]">✕</b> rule said pour, she didn't
      </span>
      <span>
        <i className="inline-block h-1 w-3.5 rounded-sm bg-[#E8A33D] align-middle" /> Nara · <i className="inline-block h-1 w-3.5 rounded-sm bg-[#2F7F7A] align-middle" /> Sela's people
      </span>
    </div>
  )
}

function Dates({ r }: { r: KeepReport }) {
  return (
    <div className="mt-2 max-h-44 overflow-y-auto">
    <table className="w-full text-left text-[11px] tabular-nums text-[#2A2823]" data-testid="keep-dates">
      <thead className="text-[9.5px] font-black tracking-wide text-[#8B8471] uppercase">
        <tr>
          <th>Day</th>
          <th>Far bed</th>
          <th>Who</th>
          <th>Noon</th>
          <th>Her mother's</th>
        </tr>
      </thead>
      <tbody>
        {r.beds.far.marks.map((m, i) => {
          const n = r.beds.nara.marks[i]
          return (
            <tr key={m.day} className="font-semibold">
              <td>{m.day}</td>
              <td>
                {m.word.toLowerCase()} · {m.action === 'can' ? 'a can' : m.intended === 'can' ? 'refused' : 'wait'}
              </td>
              <td>{m.actor === 'crew' ? "Sela's people" : 'Nara'}</td>
              <td>{m.firm13.toFixed(2)}</td>
              <td>
                {n.word.toLowerCase()} · {n.action === 'can' ? 'a can' : 'wait'}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
    </div>
  )
}

export function ReportBody({ s, r, compact, onNext }: { s: WorldState; r: KeepReport; compact: boolean; onNext: () => void }) {
  const [dates, setDates] = useState(false)
  const far = r.beds.far
  // The labelled counterfactual: the far trial from the stored starting bed, guards off. Never happened.
  const counter = useMemo(() => {
    const d = s.keep?.dispatch
    if (!r.counterfactual || !d || d.id !== r.dispatchId) return null
    return runBed(d.startingBeds.far, { target: 'far', mode: 'trial', rule: far.rule }, { weather: d.weather, unguarded: true })
  }, [r, s.keep?.dispatch, far.rule])
  const farLabel = `Far bed · ${far.mode === 'supervised' ? 'the method, with help' : RULE_SHORT[far.rule]}`
  const ploob = far.stop || far.crewCalled || far.mode === 'supervised' ? 'Who was caring for it when it came back up?' : 'What did she do after the rain?'
  const strips = (
    <>
      <Strip bed={far} label={compact ? farLabel.replace('Far bed · ', 'Far · ') : farLabel} compact={compact} counter={counter} />
      {counter && <p className="mt-0.5 text-[10px] font-semibold text-[#6F6857]">┄ {COUNTERFACTUAL_LABEL}</p>}
      <Strip bed={r.beds.nara} label={compact ? "Mother's bed · the method" : "Her mother's bed · the method"} compact={compact} />
      <Legend compact={compact} />
    </>
  )
  const words = (
    <>
      <span className="atlas-eyebrow block">{r.kind === 'practice' ? "Nara's report · practice" : "Nara's report · the story fortnight"}</span>
      <Said small={compact}>{naraReportLine(r)}</Said>
    </>
  )
  const sela = (
    <div className={cn('flex items-center gap-2.5', !compact && 'mt-2.5 border-t border-white/60 pt-2.5')}>
      {!compact && <img src={portraitUrl('sela')} alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-full bg-[#EEE7D8] object-cover" />}
      <div>
        <p className={cn('leading-snug font-bold text-[#2A2823]', compact ? 'mt-1.5 text-[11.5px]' : 'text-[13px]')} data-testid="keep-sela-line">
          {compact ? 'Sela: ' : ''}“{selaReturnLine(r)}”
        </p>
        <p className="text-[11px] font-extrabold text-[#6F6857]" data-testid="keep-crates">
          {K.crates}: {s.keep ? totalCrates(s.keep) : 0}
          {r.crates > 0 ? ` · ${r.crates} from this fortnight` : ' · none from this fortnight'}
        </p>
      </div>
    </div>
  )
  const actions = (
    <div className={cn('flex justify-between gap-2', compact ? 'mt-2' : 'mt-3')}>
      <Btn data-testid="keep-dates-toggle" aria-expanded={dates} className={compact ? 'px-3 text-[11.5px]' : ''} onClick={() => setDates(!dates)}>
        {K.dates}
      </Btn>
      <Btn primary data-testid="keep-next" className={compact ? 'px-3 text-[11.5px]' : ''} onClick={onNext}>
        {compact ? 'What next time?' : K.next}
      </Btn>
    </div>
  )
  const ploobLine = (
    <p className={cn('flex items-start gap-1.5 font-bold text-[#5F5A4E]', compact ? 'mt-1.5 text-[11px]' : 'mt-2 text-[12px]')} data-testid="keep-ploob">
      <Ploob2 size={compact ? 16 : 20} /> “{ploob}”
    </p>
  )
  if (compact) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_240px] items-start gap-3.5">
        <div>
          {words}
          {sela}
          {ploobLine}
          {actions}
        </div>
        <div className="max-h-[calc(100vh-5rem)] overflow-y-auto">
          {strips}
          {dates && <Dates r={r} />}
        </div>
      </div>
    )
  }
  return (
    <>
      {words}
      {strips}
      {dates && <Dates r={r} />}
      {sela}
      {ploobLine}
      {actions}
    </>
  )
}

/* ---------------------------------------------------------- 6 the pause */

export function PauseCard({ r, compact }: { r: KeepReport; compact: boolean }) {
  const caps = useBandCaps()
  const [text, setText] = useState('')
  const answer = (i: number) => answerKeepPause({ choice: i, text: text.trim() || null, right: PLOT_WHY.options[i]?.right === true })
  return (
    <Card compact={compact} testid="keep-pause">
      <Who who="nara" compact={compact}>
        <span className="sr-only">Nara's report · she stopped to ask</span>
        <Said small={compact}>{naraReportLine(r)}</Said>
      </Who>
      {!compact && <Strip bed={{ ...r.beds.far, marks: r.beds.far.marks.slice(0, r.pauseDay ?? 14) }} label="Far bed · the method, Nara alone" compact={false} />}
      {caps.conclusion && (
        <input
          data-testid="keep-pause-text"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 600))}
          placeholder="Why — in your own words (optional)…"
          className="lg-chip mt-2 min-h-9 w-full rounded-xl px-3 py-2 text-[13px] font-semibold text-[#2A2823] outline-none"
        />
      )}
      <div className={cn('mt-2 grid gap-1.5', compact ? 'grid-cols-3' : 'grid-cols-1')}>
        {PLOT_WHY.options.map((o, i) => (
          <Tile key={o.key} data-testid={`keep-pause-${o.key}`} className={cn('lg-chip rounded-xl px-3 text-left font-bold text-[#2A2823]', compact ? 'py-1.5 text-[11px]' : 'py-2 text-[12.5px]')} onClick={() => answer(i)}>
            {o.text}
          </Tile>
        ))}
      </div>
    </Card>
  )
}

/* ------------------------------------------------ the return, end to end */

/**
 * On the Landing with a report waiting: the review plays, then the pause (if
 * Nara stopped to ask), then the report — on a phone folded to its pill until
 * pulled up.
 */
export function KeepReturn({ s, compact }: { s: WorldState; compact: boolean }) {
  const d = s.keep?.dispatch
  const r = d?.status === 'settled' ? d.report : undefined
  const id = r?.dispatchId ?? -1
  const [reviewed, setReviewed] = useState<number>(-1)
  const [open, setOpen] = useState(!compact)
  const reviewing = !!r && reviewed !== id
  const pause = !!r && !reviewing && r.pauseDay != null && !r.pauseAnswer
  const reporting = !!r && !reviewing && !pause
  const folded = compact && !open
  // An open report or pause card holds the explorer, the way a talk card does; the review and the pills do not.
  const hold = s.zone === 'landing' && (pause || (reporting && !folded))
  useEffect(() => {
    if (hold && s.talk == null) talkTo(KEEP_CARD)
    if (!hold && s.talk === KEEP_CARD) talkTo(null)
  }, [hold, s.talk])
  if (!r || s.zone !== 'landing') return null
  if (reviewing) return <ReviewBar key={id} r={r} compact={compact} onDone={() => setReviewed(id)} />
  if (pause) return <PauseCard r={r} compact={compact} />
  const next = () => {
    readKeep()
    setOpen(!compact)
    talkTo('talk.nara')
  }
  if (compact && !open) {
    return (
      <div className="pointer-events-auto absolute bottom-3 left-[9rem] right-[13.5rem] flex justify-center">
        <Tile className="lg flex h-11 items-center gap-2 !rounded-full pr-3.5 pl-2 text-[12.5px] font-extrabold text-[#2A2823]" data-testid="keep-report-pill" onClick={() => setOpen(true)}>
          <img src={portraitUrl('nara')} alt="" width={26} height={26} className="h-6.5 w-6.5 rounded-full object-cover" />
          Nara's report
          <span className="font-bold text-[#6F6857]">· day {firstDecisive(r)}</span>
          <span aria-hidden>▴</span>
        </Tile>
      </div>
    )
  }
  if (compact) {
    return (
      <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex justify-center px-2.5" data-focus-layer="">
        <div className="lg w-full max-w-[46rem] rounded-t-[22px] rounded-b-none px-3.5 pt-4 pb-2.5" data-testid="keep-report" data-sheet="">
          <Tile className="absolute top-0 left-1/2 z-10 flex w-20 -translate-x-1/2 items-start justify-center pt-1.5" aria-label="Fold the report" data-testid="keep-report-fold" onClick={() => setOpen(false)}>
            <span className="lg-grab block" />
          </Tile>
          <ReportBody s={s} r={r} compact onNext={next} />
        </div>
      </div>
    )
  }
  return (
    <Card compact={false} width={30} top testid="keep-report">
      <ReportBody s={s} r={r} compact={false} onNext={next} />
    </Card>
  )
}

/** Sela's board folded on a phone: a pill until pulled up (the board asks nothing yet). */
export function BoardPill({ s, onOpen }: { s: WorldState; onOpen: () => void }) {
  if (!s.keep?.choice) return null
  const packing = packingCrew(s.keep.choice)
  return (
    <div className="pointer-events-auto absolute bottom-3 left-[9rem] right-[13.5rem] flex justify-center">
      <Tile className="lg flex h-11 items-center gap-2 !rounded-full pr-3.5 pl-2 text-[12.5px] font-extrabold text-[#2A2823]" data-testid="keep-board-pill" onClick={onOpen}>
        <img src={portraitUrl('sela')} alt="" width={26} height={26} className="h-6.5 w-6.5 rounded-full object-cover" />
        Sela's board
        <span className="font-bold text-[#6F6857]">
          · {KEEP.crew - packing} + {packing} · ready
        </span>
        <span aria-hidden>▴</span>
      </Tile>
    </div>
  )
}

/** The refraction behind `.lg` — drawn once; Chromium bends the scene through it, others ignore it. */
export function GlassFilter() {
  return (
    <svg width={0} height={0} className="absolute" aria-hidden focusable="false">
      <filter id="lg-refract" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves={2} seed={7} result="n" />
        <feGaussianBlur in="n" stdDeviation={3} result="nb" />
        <feDisplacementMap in="SourceGraphic" in2="nb" scale={16} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  )
}

