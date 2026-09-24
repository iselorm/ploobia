import { useEffect, useMemo, useState } from 'react'
import { Droplets } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBandCaps } from '@/lib/bands'
import { cleanNickname } from '@/lib/foundry'
import { Tile } from '@/components/ui/tile'
import Ploob2 from '@/components/brand/Ploob2'
import {
  PLOT,
  PLOT_WHY,
  namePlot,
  plotAnswerWhy,
  plotChoose,
  plotRecorded,
  plotRetry,
  plotSay,
  plotToFarBed,
  plotToMethod,
  probeBed,
  runBedId,
  teachNara,
  useWorld,
  type PlotState,
  type WorldState,
} from '@/lib/archipelago'
import { CARE_FIRM, RESCUE_FIRM, cansUsed, everyMorning, methodSteps, methodReply, plateUp, recordOf, saidNow, secondsToDawn, steadyHands, type PlotRecord, type PlotRun } from '@/lib/plot'
import { ROOTS_CONSTANTS, SOIL, airOf, newBed, storedOf } from '@/lib/roots'
import { judgeWhyOf, TRUST } from '@/lib/whyjudge'
import { WORLD_TEXT } from '@/lib/worldtext'
import { interactables } from '@/lib/archipelago'
import { live } from '../live'

/**
 * The plot's HUD — S0. The plate under the wordmark while the trial runs
 * (one gauge, one control), and the cards the round passes through: the
 * marker's name, the brief, the retry, the rescue line, the method, the
 * record with its why and the counterfactual, the page. Nothing here
 * computes a day: `lib/plot.ts` does, and the store publishes it.
 *
 * The explanation gate: no string in this file names the cause before the
 * first stand and a DRY read. The rule line is the one exception and is
 * gated on both. Measurements are evidence and are shown from the first dawn.
 */

/** Within reach of the bed the run is on — the probe and the can are physical. */
function atBed(s: WorldState): boolean {
  const id = runBedId(s)
  if (!id) return false
  const it = interactables.get(id)
  if (!it) return false
  return Math.hypot(it.pos[0] - live.pos.x, it.pos[2] - live.pos.z) <= it.radius + 0.6
}

/* --------------------------------------------------------------- plate */

/**
 * The plate under the wordmark. Desktop and tablet: the whole body. Phone:
 * one line that toggles; the body then opens in the coach's slot at the
 * bottom (WorldHud places it), so nothing covers the stick.
 */
export function PlotPlate({ compact, open, onToggle, onRevise }: { compact: boolean; open: boolean; onToggle: () => void; onRevise: () => void }) {
  const s = useWorld()
  const p = s.plot
  const run = p.run
  if (!run || !plateUp(p)) return null
  const said = saidNow(run)
  const used = cansUsed(run)
  const day = Math.min(run.day, run.length)
  const one =
    run.phase === 'running'
      ? `Day ${day} of ${run.length} · ${secondsToDawn(run)} s to dawn`
      : run.phase === 'dawn' && !run.today.probed
        ? `Dawn ${day} of ${run.length} · probe first`
        : `Dawn ${day} of ${run.length} · ${run.today.word} · cans ${used}${said != null ? ` of ${said}` : ''}`
  return (
    <div className="mt-2 border-t border-[#F6F2E8]/15 pt-2" data-testid="plot-plate" data-day={run.day} data-phase={run.phase}>
      {compact ? (
        <button type="button" className="flex min-h-[36px] w-full items-center justify-between gap-2 text-left text-[11px] font-extrabold text-[#F6F2E8]" data-testid="plot-line" aria-expanded={open} onClick={onToggle}>
          <span>{one}</span>
          <span className="text-[#F0B354]">{open ? '▾' : '▸'}</span>
        </button>
      ) : (
        <PlotBody onRevise={onRevise} />
      )}
    </div>
  )
}

/** The gauge, the reading and the controls. */
export function PlotBody({ onRevise }: { onRevise: () => void }) {
  const s = useWorld()
  const caps = useBandCaps()
  const p = s.plot
  const run = p.run
  const [near, setNear] = useState(false)
  // Nearness is a per-frame value; sample it a few times a second, no store write.
  useEffect(() => {
    const id = window.setInterval(() => setNear(atBed(s)), 250)
    return () => window.clearInterval(id)
  }, [s])
  if (!run || !plateUp(p)) return null
  const said = saidNow(run)
  const used = cansUsed(run)
  const firm = run.firm13
  const dawn = run.phase === 'dawn'
  // the first bed wants the number first; the far bed is the changed case
  const canAct = run.bed !== 'first' || said != null
  const reading = run.today.probed ? run.today : null
  const title = run.bed === 'first' ? (p.name ? `${p.name} · Nara's bed` : "Nara's bed") : 'The far bed'
  const day = Math.min(run.day, run.length)
  const ruleOpen = p.stood && p.dryRead
  const running = run.phase === 'running'
  // The last probe's reading, for the water and air bars: today's if probed, else yesterday's, greyed until the probe goes in again.
  const lastProbed = reading ?? [...run.days].reverse().find((d) => d.probed) ?? null
  const stale = !reading
  return (
    <div data-testid="plot-body">
      {(
        <>
          <div className="flex items-baseline justify-between">
            <span className="glass-eyebrow">{title}</span>
            <span className="text-[11px] font-extrabold text-[#F6F2E8]/80" data-testid="plot-day">
              {running ? `Day ${day} of ${run.length}` : `Dawn ${day} of ${run.length}`}
            </span>
          </div>
          {/* the clock: the day running down to the next dawn, or the dawn waiting on the probe */}
          <div className="mt-1" data-testid="plot-clock" data-state={running ? 'running' : reading ? 'read' : 'unprobed'}>
            {running ? (
              <>
                <div className="flex items-baseline justify-between text-[11px] font-extrabold text-[#F6F2E8]">
                  <span>{dayPhase(run.hour + run.acc)}</span>
                  <span className="tabular-nums" data-testid="plot-countdown">
                    {secondsToDawn(run)} s to dawn
                  </span>
                </div>
                <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-[#F6F2E8]/15">
                  <div className="h-full rounded-full bg-[#F0B354] transition-[width] duration-150" style={{ width: `${((run.hour + run.acc) / 24) * 100}%` }} />
                </div>
              </>
            ) : reading ? (
              <p className="text-[11px] font-extrabold text-[#F6F2E8]" data-testid="plot-word">
                <span className="text-[#F0B354]">Probe</span> · {reading.word}
                {caps.quantitative && (
                  <span className="text-[#F6F2E8]/75">
                    {' '}
                    · θ {reading.theta.toFixed(2)} · air {Math.round(reading.air * 100)} %
                  </span>
                )}
                {caps.vocab === 'technical' && <span className="text-[#F6F2E8]/75"> · O₂ {reading.o2.toFixed(2)}</span>}
                <span className="text-[#F6F2E8]/60"> · now pour, or wait</span>
              </p>
            ) : (
              <p className="text-[11px] font-extrabold text-[#F0B354]" data-testid="plot-word">
                A new morning · probe first{!near ? ' — walk to the bed' : ''}
              </p>
            )}
          </div>
          {/* the equaliser: water and air from the last probe, the leaf live, the goal on it */}
          <Equalizer theta={lastProbed?.theta ?? null} air={lastProbed?.air ?? null} stale={stale} firm={firm} worst={run.worst13} stood={p.stood} numbers={caps.quantitative} />
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-[10px] font-extrabold tracking-wide text-[#F0B354] uppercase">Cans</span>
            <span className="text-[12px] font-extrabold tabular-nums text-[#F6F2E8]">
              <span data-testid="plot-used">{used}</span> used · <span data-testid="plot-said">{said ?? '—'}</span> said
              {said != null && dawn && run.bed === 'first' && (
                <button type="button" className="ml-1.5 inline-flex min-h-[36px] items-center rounded-full px-2 text-[10px] font-bold text-[#F0B354] underline-offset-2 hover:underline" data-testid="plot-revise" onClick={onRevise}>
                  change my number
                </button>
              )}
            </span>
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-1">
            <Tile
              data-testid="plot-probe"
              disabled={!dawn || !near || run.today.probed}
              className={cn(
                'h-9 rounded-full bg-[#F6F2E8]/15 text-[11px] font-extrabold text-[#F6F2E8]',
                (!dawn || !near || run.today.probed) && 'opacity-40',
                dawn && near && !run.today.probed && 'animate-pulse ring-2 ring-[#F0B354]',
              )}
              onClick={() => probeBed(runBedId(s) ?? '')}
            >
              Probe
            </Tile>
            <Tile
              data-testid="plot-pour"
              disabled={!dawn || !near || !canAct}
              className={cn('flex h-9 items-center justify-center gap-1 rounded-full bg-[#4F8AA8] text-[11px] font-extrabold text-[#F6F2E8]', (!dawn || !near || !canAct) && 'opacity-40')}
              onClick={() => plotChoose('pour')}
            >
              <Droplets size={13} /> Pour
            </Tile>
            <Tile
              data-testid="plot-wait"
              disabled={!dawn || !canAct}
              className={cn('h-9 rounded-full bg-[#E8A33D] text-[11px] font-extrabold text-[#2A2823]', (!dawn || !canAct) && 'opacity-40')}
              onClick={() => plotChoose('wait')}
            >
              Wait
            </Tile>
          </div>
          {!near && dawn && reading && <p className="mt-1 text-[10px] text-[#F6F2E8]/60">Walk to the bed to pour; you can wait from anywhere.</p>}
          {ruleOpen && (
            <p className="mt-1.5 text-[11px] font-extrabold text-[#F0B354]" data-testid="plot-rule">
              Roots need air as well as water.
            </p>
          )}
        </>
      )}
    </div>
  )
}

/** The leaf: droops with the value, green at the first stand. */
function LeafGauge({ firm, stood, small = false }: { firm: number; stood: boolean; small?: boolean }) {
  const angle = (1 - Math.max(0, Math.min(1, firm))) * 70
  const hue = 40 + 60 * firm
  const size = small ? 26 : 44
  return (
    <svg viewBox="0 0 44 44" width={size} height={size} role="img" aria-label={`Leaf firmness ${firm.toFixed(2)}`} data-testid="plot-leaf" data-stood={stood}>
      <line x1={22} y1={40} x2={22} y2={18} stroke="#8A6A45" strokeWidth={3} strokeLinecap="round" />
      <g transform={`rotate(${angle} 22 18)`}>
        <path d="M22 18 C 22 8, 36 6, 40 2 C 38 12, 30 20, 22 18 Z" fill={`hsl(${hue} 55% ${38 + 12 * firm}%)`} stroke={stood ? '#7BD389' : 'none'} strokeWidth={1.5} />
        <path d="M22 18 C 22 8, 8 6, 4 2 C 6 12, 14 20, 22 18 Z" fill={`hsl(${hue} 55% ${34 + 12 * firm}%)`} stroke={stood ? '#7BD389' : 'none'} strokeWidth={1.5} />
      </g>
    </svg>
  )
}

/** The hour of the running day, in words a child reads at a glance. */
function dayPhase(hour: number): string {
  const h = ((hour % 24) + 24) % 24
  if (h < 2) return 'Sunrise'
  if (h < 11) return 'Morning'
  if (h < 15) return 'Afternoon'
  if (h < 19.5) return 'Sunset'
  if (h < 22) return 'Night'
  return 'Before dawn'
}

/**
 * The equaliser (Selorm, after the first test): three bars that rise and
 * fall as the fortnight goes — WATER and AIR from the last probe (greyed
 * until the probe goes in again), the LEAF live with the goal drawn on it.
 * No good/bad zone on water or air: those are readings; the goal is on the
 * leaf, where the goal is. The bars move together, and that is the lesson
 * arriving without a sentence.
 */
function Equalizer({ theta, air, stale, firm, worst, stood, numbers }: { theta: number | null; air: number | null; stale: boolean; firm: number; worst: number; stood: boolean; numbers: boolean }) {
  const clay = SOIL.clay
  // water: wilting point → porosity across the bar; the probe's words at their thresholds
  const water = theta == null ? null : Math.max(0, Math.min(1, (theta - clay.wp) / (clay.phi - clay.wp)))
  const soakedAt = (clay.phi - 0.1 - clay.wp) / (clay.phi - clay.wp)
  const dryAt = (clay.fc - 0.35 * (clay.fc - clay.wp) - clay.wp) / (clay.phi - clay.wp)
  const airBar = air == null ? null : Math.max(0, Math.min(1, air / 0.25))
  return (
    <div className="mt-1.5 grid grid-cols-3 gap-2" data-testid="plot-eq" data-stale={stale}>
      <Column label="Water" testid="eq-water" value={water} text={theta == null ? 'probe' : numbers ? `θ ${theta.toFixed(2)}` : wordFor(water, soakedAt, dryAt)} color="#4F8AA8" stale={stale} marks={[{ at: soakedAt, label: 'soaked' }, { at: dryAt, label: 'dry' }]} />
      <Column label="Air" testid="eq-air" value={airBar} text={air == null ? 'probe' : numbers ? `${Math.round(air * 100)} %` : air < 0.1 ? 'little' : air < 0.16 ? 'some' : 'plenty'} color="#F6F2E8" stale={stale} />
      <Column
        label="Leaf"
        testid="eq-firm"
        value={firm}
        text={firm.toFixed(2)}
        color={stood ? '#7BD389' : '#E8A33D'}
        stale={false}
        goal={{ from: RESCUE_FIRM, label: 'standing' }}
        floor={CARE_FIRM}
        worst={worst}
        icon={<LeafGauge firm={firm} stood={stood} small />}
        valueTestid="plot-firm"
      />
    </div>
  )
}

function wordFor(water: number | null, soakedAt: number, dryAt: number): string {
  if (water == null) return 'probe'
  return water >= soakedAt ? 'soaked' : water <= dryAt ? 'dry' : 'damp'
}

function Column({ label, testid, value, text, color, stale, marks = [], goal, floor, worst, icon, valueTestid }: { label: string; testid: string; value: number | null; text: string; color: string; stale: boolean; marks?: { at: number; label: string }[]; goal?: { from: number; label: string }; floor?: number; worst?: number; icon?: React.ReactNode; valueTestid?: string }) {
  const h = 60
  const v = value ?? 0
  return (
    <div className="flex flex-col items-center" data-testid={testid} data-value={value == null ? '' : v.toFixed(3)} data-stale={stale}>
      <span className="text-[9px] font-extrabold tracking-wide text-[#F0B354] uppercase">{label}</span>
      <div className="relative mt-0.5 w-full overflow-hidden rounded-md bg-[#F6F2E8]/12" style={{ height: h }}>
        {goal && <div className="absolute inset-x-0 top-0 bg-[#7BD389]/25" style={{ height: `${(1 - goal.from) * 100}%` }} title={goal.label} />}
        {goal && <span className="absolute right-1 top-0.5 text-[8px] font-extrabold uppercase text-[#7BD389]">{goal.label}</span>}
        {floor != null && <div className="absolute inset-x-0 h-px bg-[#FF8A5C]" style={{ bottom: `${floor * 100}%` }} title="steady hands" />}
        {marks.map((m) => (
          <div key={m.label} className="absolute inset-x-0 h-px bg-[#F6F2E8]/35" style={{ bottom: `${m.at * 100}%` }} title={m.label} />
        ))}
        {value != null && (
          <div className={cn('absolute inset-x-0 bottom-0 rounded-md transition-[height] duration-300', stale && 'opacity-35')} style={{ height: `${v * 100}%`, background: color }} />
        )}
        {worst != null && worst < 1 && <div className="absolute inset-x-0 h-px bg-[#F6F2E8]/80" style={{ bottom: `${worst * 100}%` }} title="lowest since day 1" />}
        {icon && <div className="absolute left-0.5 bottom-0.5">{icon}</div>}
      </div>
      <span className={cn('mt-0.5 text-[11px] font-extrabold tabular-nums', stale ? 'text-[#F6F2E8]/50' : 'text-[#F6F2E8]')} data-testid={valueTestid}>
        {text}
      </span>
    </div>
  )
}

/* --------------------------------------------------------------- brief */

/** The number the child types — after the first probe, revisable at any dawn; every revision kept. */
export function Brief({ revise = false, onDone }: { revise?: boolean; onDone?: () => void }) {
  const s = useWorld()
  const run = s.plot.run
  const [v, setV] = useState('')
  const n = Number(v)
  const ok = v.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 99
  if (!run) return null
  const commit = () => {
    if (!ok) return
    plotSay(n)
    onDone?.()
  }
  return (
    <div className={cn('pointer-events-auto absolute inset-x-0 flex justify-center px-4', revise ? 'top-14' : 'bottom-24 sm:bottom-28')} data-focus-layer="">
      <div className="atlas-plate w-full max-w-[24rem] rounded-[22px] px-6 py-5" data-testid="plot-brief">
        <span className="atlas-eyebrow block">{revise ? 'Change my number' : 'Say it first'}</span>
        <p className="mt-1 text-[13.5px] leading-snug font-extrabold text-[#2A2823]">{PLOT.predict.ask}</p>
        {run.today.probed && (
          <p className="mt-1 text-[12px] font-semibold text-[#5F5A4E]">
            The probe says <span className="font-extrabold">{run.today.word}</span>.
          </p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <input
            id="plot-cans"
            data-testid="plot-cans"
            inputMode="numeric"
            autoFocus
            value={v}
            onChange={(e) => setV(e.target.value.replace(/[^\d]/g, '').slice(0, 2))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && ok) commit()
            }}
            className="w-24 rounded-xl border border-[#D9CFBC] bg-white px-3 py-2 text-[18px] font-extrabold tabular-nums text-[#2A2823] outline-none focus:border-[#E8A33D]"
            placeholder="?"
            aria-label={PLOT.predict.ask}
          />
          <span className="text-[14px] font-bold text-[#5F5A4E]">{PLOT.predict.unit}</span>
          <Tile data-testid="plot-say" disabled={!ok} className={cn('ml-auto rounded-full bg-[#E8A33D] px-4 py-2 text-[13px] font-extrabold text-[#2A2823]', !ok && 'opacity-40')} onClick={commit}>
            Say it
          </Tile>
        </div>
        <p className="mt-2 text-[11px] text-[#8B8471]">{revise ? 'Changing your mind on evidence is progress. Every number you said is kept.' : 'Ploob will say it back. You can change it at any dawn.'}</p>
        {revise && (
          <Tile className="mt-1 text-[11px] font-bold text-[#8B8471]" data-testid="plot-keep" onClick={() => onDone?.()}>
            Keep {saidNow(run)}
          </Tile>
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- naming */

/** The marker is in: a name for the plot. Nickname rules, no personal details (S0-D3). */
export function Naming() {
  const [v, setV] = useState('')
  const clean = cleanNickname(v).trim()
  return (
    <div className="pointer-events-auto absolute inset-0 grid place-items-center bg-[#2A2823]/25 p-4" data-focus-layer="">
      <div className="atlas-plate w-full max-w-[22rem] rounded-[22px] px-6 py-5" data-testid="naming">
        <span className="atlas-eyebrow block">Your plot</span>
        <p className="mt-1 text-[14px] leading-snug font-extrabold text-[#2A2823]">The marker is in. What will the plate say?</p>
        <input
          id="plot-nickname"
          data-testid="nickname"
          autoFocus
          value={v}
          onChange={(e) => setV(cleanNickname(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && clean) namePlot(clean)
          }}
          maxLength={24}
          className="mt-2 w-full rounded-xl border border-[#D9CFBC] bg-white px-3 py-2 text-[16px] font-extrabold text-[#2A2823] outline-none focus:border-[#E8A33D]"
          placeholder="A nickname — not your real name"
          aria-label="A name for your plot"
        />
        <p className="mt-1 text-[11px] text-[#8B8471]">A nickname, not a real name. Letters and numbers, nothing else.</p>
        <Tile data-testid="name-plant" disabled={!clean} className={cn('mt-3 w-full rounded-full bg-[#E8A33D] px-4 py-2.5 text-[13px] font-extrabold text-[#2A2823]', !clean && 'opacity-40')} onClick={() => namePlot(clean)}>
          Put the name up
        </Tile>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- retry */

/** The run ended without a rescue: the two retries, named. The failed attempt is already in the journal. */
export function Retry({ run, p }: { run: PlotRun; p: PlotState }) {
  const dead = run.phase === 'dead'
  const rec = p.attempts[p.attempts.length - 1]
  return (
    <div className="pointer-events-auto absolute inset-x-0 top-14 flex justify-center px-3">
      <div className="atlas-plate atlas-arrive w-full max-w-[26rem] rounded-[22px] px-5 py-4" data-testid="retry" data-dead={dead}>
        <span className="atlas-eyebrow block">{run.bed === 'first' ? "Nara's bed" : 'The far bed'} · attempt {run.attempt}</span>
        <p className="mt-1 text-[14px] leading-snug font-extrabold text-[#2A2823]">
          {dead ? `The roots are gone — day ${run.days.length}.` : `Day ${run.length}: firm ${run.days[run.days.length - 1]?.firm13.toFixed(2)} — not standing.`}
        </p>
        {rec && (
          <p className="mt-1 text-[12px] font-semibold text-[#5F5A4E]" data-testid="retry-record">
            {rec.cans} {rec.cans === 1 ? 'can' : 'cans'}
            {rec.said.length ? ` · you said ${rec.said.join(' → ')}` : ''} · kept in your journal as try {rec.attempt}
          </p>
        )}
        <div className="mt-3 grid gap-1.5">
          <Tile data-testid="retry-replay" className="rounded-full bg-[#E8A33D] px-4 py-2 text-[12.5px] font-extrabold text-[#2A2823]" onClick={() => plotRetry('replay')}>
            {run.bed === 'first' ? 'Replay this fortnight' : 'Replay the week'} — the same bed
          </Tile>
          {run.bed === 'first' && (
            <Tile data-testid="retry-fresh" className="rounded-full bg-[#FBEBD2] px-4 py-2 text-[12.5px] font-extrabold text-[#2A2823]" onClick={() => plotRetry('fresh')}>
              A new bed — a different start
            </Tile>
          )}
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------- rescue line */

/** Quiet confirmation at the last noon: the rescue line and, if earned, the care line. */
export function RescueLine({ run, p }: { run: PlotRun; p: PlotState }) {
  const care = steadyHands(run)
  const said = saidNow(run)
  const used = cansUsed(run)
  const first = run.bed === 'first'
  return (
    <div className="pointer-events-auto absolute inset-x-0 top-14 flex justify-center px-3">
      <div className="atlas-plate atlas-arrive w-full max-w-[26rem] rounded-[22px] px-5 py-4" data-testid="rescue-line" data-care={care}>
        <span className="atlas-eyebrow block">{first ? `Day ${run.length}` : `Day ${run.length} · the far bed`}</span>
        <p className="mt-1 text-[15px] leading-snug font-extrabold text-[#2A2823]">
          {first ? 'Still standing' : 'Held for the week'} · {used} {used === 1 ? 'can' : 'cans'}
          {said != null ? ` · you said ${p.attempts.length && run.said.length > 1 ? run.said.join(' → ') : said}` : ''}
        </p>
        {care ? (
          <p className="mt-1 text-[12px] font-extrabold text-[#2F7F7A]">Steady hands — never below {CARE_FIRM.toFixed(1)} after the first day.</p>
        ) : (
          <p className="mt-1 text-[12px] font-semibold text-[#5F5A4E]">It dipped below {CARE_FIRM.toFixed(1)} on the way — saved, all the same.</p>
        )}
        <Tile data-testid="rescue-next" className="mt-3 rounded-full bg-[#E8A33D] px-4 py-2 text-[12.5px] font-extrabold text-[#2A2823]" onClick={() => (first ? plotToFarBed() : plotToMethod())}>
          {first ? 'Next morning' : 'Go on'}
        </Tile>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- method */

/** The method card, assembled from the child's own dawns; Nara reads it back. */
export function MethodCard({ p }: { p: PlotState }) {
  const runs = [p.first, p.run].filter((r): r is PlotRun => !!r)
  const m = methodSteps(runs)
  const steps: [string, boolean][] = [
    ['Probe.', m.probe],
    ['Soaked → wait.', m.soakedWait],
    ['Dry → one can.', m.dryCan],
    ['Check again tomorrow.', m.checkAgain],
  ]
  return (
    <div className="pointer-events-auto absolute inset-x-0 top-14 flex justify-center px-3">
      <div className="atlas-plate atlas-arrive w-full max-w-[26rem] rounded-[22px] px-5 py-4" data-testid="method">
        <span className="atlas-eyebrow block">The method · from your mornings</span>
        <ul className="mt-2 grid gap-1">
          {steps.map(([t, on], i) => (
            <li key={t} className={cn('flex items-center gap-2 text-[13px] font-extrabold', on ? 'text-[#2A2823]' : 'text-[#8B8471] line-through')} data-testid={`method-step-${i}`} data-on={on}>
              <span className={cn('grid h-5 w-5 place-items-center rounded-full text-[11px]', on ? 'bg-[#DDEBD9] text-[#2F7F7A]' : 'bg-[#EEE7D8]')}>{on ? '✓' : '·'}</span>
              {t}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11.5px] font-semibold text-[#5F5A4E]">Never “stop when firm” — the leaves lag the soil by days, both ways.</p>
        <div className="mt-2 flex items-start gap-2">
          <span className="atlas-eyebrow">Nara</span>
          <p className="text-[12px] leading-snug font-semibold text-[#2A2823]">“{methodReply(m)}”</p>
        </div>
        <Tile data-testid="method-handin" className="mt-3 rounded-full bg-[#E8A33D] px-4 py-2 text-[12.5px] font-extrabold text-[#2A2823]" onClick={teachNara}>
          Hand it to Nara
        </Tile>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- record */

const ACCURACY_WORDS = { 'spot on': 'spot on', close: 'close', off: 'a way off' } as const
const ECONOMY_WORDS = { fewest: 'the fewest that work', 'one over': 'one over the fewest', 'more than needed': 'more than it needed', 'not saved': 'not saved' } as const

/** The closing record: said · cans · accuracy / economy / thrift → one why → the counterfactual → the journal. */
export function RecordCard({ p, compact }: { p: PlotState; compact: boolean }) {
  const caps = useBandCaps()
  const first = p.first
  const far = p.run?.bed === 'second' ? p.run : null
  const rec = useMemo(() => (first ? recordOf(first) : null), [first])
  const farRec = useMemo(() => (far ? recordOf(far) : null), [far])
  const [step, setStep] = useState<'score' | 'why' | 'split'>('score')
  if (!rec || !first) return null
  const thrift = rec.thrift
  return (
    <div className={cn('pointer-events-auto absolute inset-x-0 flex justify-center px-3', compact ? 'top-2' : 'top-14')}>
      <div className="atlas-plate atlas-arrive w-full max-w-[28rem] rounded-[22px] px-5 py-4" data-testid="record" data-step={step}>
        {step === 'score' && (
          <>
            <span className="atlas-eyebrow block">The record · {p.name ?? 'your plot'}</span>
            <p className="mt-1 text-[14px] leading-snug font-extrabold text-[#2A2823]" data-testid="record-said">
              {rec.said.length ? `You said ${rec.said.join(', then ')}` : 'You said nothing'} · hers took {rec.cans} · the far bed took {farRec?.cans ?? '—'}
            </p>
            <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
              <Score label="Accuracy" word={rec.accuracy ? ACCURACY_WORDS[rec.accuracy] : '—'} num={caps.quantitative && rec.accuracy && rec.said.length ? `${Math.abs(rec.said[rec.said.length - 1] - rec.cans)} off` : null} testid="record-accuracy" />
              <Score label="Care" word={rec.steadyHands ? 'Steady hands' : 'Plant rescued'} num={null} testid="record-care" />
              <Score label="Thrift" word={thrift.drained + thrift.spilled < 1 ? 'nothing wasted' : `${Math.round(thrift.drained + thrift.spilled)} mm lost`} num={caps.quantitative ? `${Math.round(thrift.arrived)} mm in` : null} testid="record-thrift" />
            </div>
            {caps.quantitative && (
              <p className="mt-1.5 text-[11px] font-semibold text-[#5F5A4E]" data-testid="record-water">
                The bed began with {storedOf(newBed(first.b.texture, first.start)).toFixed(1)} mm of water. You added {thrift.arrived.toFixed(1)} mm. Total uptake: {thrift.taken.toFixed(1)} mm; drainage: {first.b.drained.toFixed(1)} mm; overflow: {thrift.spilled.toFixed(1)} mm. Water remaining: {(storedOf(first.b) + first.b.pond).toFixed(1)} mm. Storage change: {thrift.stored > 0 ? '+' : ''}{thrift.stored.toFixed(1)} mm. Uptake includes water already in the bed.
                {caps.vocab === 'technical' ? ` Ions leached: ${thrift.leached.toFixed(1)} (game units).` : ''}
              </p>
            )}
            <details className="mt-2 text-[11.5px] text-[#5F5A4E]">
              <summary className="cursor-pointer font-bold">Optional challenge: use less water</summary>
              <p data-testid="record-economy">Your {rec.cans} cans: {rec.steadyHands ? ECONOMY_WORDS[rec.economy] : 'try steady care before optimising water'}. The model’s minimum for rescue with steady care is {rec.fewest ?? 'unknown'}. A reliable probe-and-check routine can use more than this minimum and still be successful care.</p>
            </details>
            {rec.steadyHands ? (
              <p className="mt-1.5 text-[11.5px] font-extrabold text-[#2F7F7A]">Steady hands.</p>
            ) : (
              <p className="mt-1.5 text-[11.5px] font-semibold text-[#5F5A4E]">Day 1 never counts against you; the dip came later.</p>
            )}
            <Tile data-testid="record-next" className="mt-3 rounded-full bg-[#E8A33D] px-4 py-2 text-[12.5px] font-extrabold text-[#2A2823]" onClick={() => setStep('why')}>
              One question
            </Tile>
          </>
        )}
        {step === 'why' && <PlotWhy p={p} onNext={() => setStep('split')} />}
        {step === 'split' && first && <Counterfactual run={first} onNext={plotRecorded} />}
      </div>
    </div>
  )
}

function Score({ label, word, num, testid }: { label: string; word: string; num: string | null; testid: string }) {
  return (
    <div className="rounded-[12px] bg-[#EEE7D8] px-2 py-1.5" data-testid={testid}>
      <span className="block text-[9px] font-extrabold tracking-wide text-[#8B8471] uppercase">{label}</span>
      <span className="block text-[12px] font-extrabold text-[#2A2823]">{word}</span>
      {num && <span className="block text-[10px] font-semibold tabular-nums text-[#5F5A4E]">{num}</span>}
    </div>
  )
}

/** The facts the judge may weigh: what the child measured and did, never the answer. */
function plotFacts(p: PlotState): Record<string, string | number | boolean> {
  const first = p.first
  if (!first) return {}
  const rec = recordOf(first)
  return {
    first_probe: `${first.days[0]?.word ?? 'SOAKED'}${first.days[0] ? ` (air ${Math.round(first.days[0].air * 100)} %)` : ''}`,
    dawns_probed: rec.probed.filter(Boolean).length,
    cans_poured: rec.cans,
    days_poured: rec.cansByDay.map((c, i) => (c ? i + 1 : 0)).filter(Boolean).join(', ') || 'none',
    stood_on_day: first.stood ?? 'never',
    first_dry_read: first.dryRead ?? 'never',
    firm_at_end: rec.firm13[rec.firm13.length - 1]?.toFixed(2) ?? '',
    lens_seen: p.lensSeen,
  }
}

function PlotWhy({ p, onNext }: { p: PlotState; onNext: () => void }) {
  const caps = useBandCaps()
  const why = PLOT_WHY
  const chosen = p.why
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [nudge, setNudge] = useState<string | null>(null)
  const [tries, setTries] = useState(0)
  const [fallback, setFallback] = useState(false)
  const ownWords = caps.conclusion && !fallback && chosen < 0
  const line = chosen >= 0 ? why.options[chosen].line : null
  async function say() {
    if (busy || text.trim().length < 3) return
    setBusy(true)
    const j = await judgeWhyOf(why, text, plotFacts(p), PLOT.id)
    setBusy(false)
    if (!j) {
      setFallback(true)
      return
    }
    const trusted = j.confidence >= TRUST
    if (j.verdict === 'right' && trusted) {
      plotAnswerWhy(why.options.findIndex((o) => o.right), text.trim())
      return
    }
    if (j.verdict === 'misconception' && trusted && j.misconception) {
      const i = why.options.findIndex((o) => o.key === j.misconception)
      if (i >= 0) {
        plotAnswerWhy(i, text.trim())
        return
      }
    }
    if (tries === 0) {
      setTries(1)
      setNudge(j.verdict === 'off' ? 'Say what you think happened IN THE SOIL, not what you did.' : 'Nearly. What was the soil full of on the first morning — and what was there too little of?')
      return
    }
    setFallback(true)
  }
  return (
    <>
      <span className="atlas-eyebrow block">What happened?</span>
      <p className="mt-1 text-[14px] leading-snug font-extrabold text-[#2A2823]">{why.ask}</p>
      {ownWords && (
        <div className="mt-2" data-testid="plot-own-words">
          <textarea
            id="plot-why-text"
            data-testid="plot-why-text"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 600))}
            rows={3}
            placeholder="In your own words…"
            aria-label={why.ask}
            className="w-full resize-none rounded-xl border border-[#D9CFBC] bg-white px-3 py-2 text-[13px] font-semibold text-[#2A2823] outline-none focus:border-[#E8A33D]"
          />
          {nudge && (
            <div className="mt-1.5 flex items-start gap-2">
              <Ploob2 size={22} />
              <p className="text-[12px] leading-snug font-extrabold text-[#2A2823]" data-testid="plot-why-nudge">
                {nudge}
              </p>
            </div>
          )}
          <div className="mt-1.5 flex items-center justify-between">
            <Tile className="text-[11px] font-bold text-[#8B8471]" data-testid="plot-why-pick" onClick={() => setFallback(true)}>
              Pick from three instead
            </Tile>
            <Tile data-testid="plot-why-say" disabled={busy || text.trim().length < 3} className={cn('rounded-full bg-[#E8A33D] px-4 py-2 text-[12px] font-extrabold text-[#2A2823]', (busy || text.trim().length < 3) && 'opacity-40')} onClick={say}>
              {busy ? 'Ploob is thinking…' : 'Say it'}
            </Tile>
          </div>
        </div>
      )}
      {!ownWords && chosen < 0 && (
        <div className="mt-2 grid gap-1.5">
          {why.options.map((o, i) => (
            <Tile key={i} data-testid={`plot-why-${i}`} className="rounded-[14px] bg-[#FBEBD2] px-3 py-2 text-left text-[12.5px] font-semibold text-[#2A2823]" onClick={() => plotAnswerWhy(i, null)}>
              {o.text}
            </Tile>
          ))}
        </div>
      )}
      {chosen >= 0 && (
        <div className="mt-2 grid gap-1.5">
          {why.options.map((o, i) => (
            <div key={i} className={cn('rounded-[14px] px-3 py-2 text-[12.5px] font-semibold text-[#2A2823]', i === chosen ? (o.right ? 'bg-[#DDEBD9]' : 'bg-[#F6DEDC]') : 'bg-[#EEE7D8] opacity-60')}>
              {i === chosen && p.whyText && o.right ? `“${p.whyText}”` : o.text}
            </div>
          ))}
        </div>
      )}
      {line && (
        <div className="mt-2 flex items-start gap-2">
          <Ploob2 size={26} />
          <p className="text-[12px] leading-snug font-extrabold text-[#2A2823]" data-testid="plot-why-line">
            {line}
          </p>
        </div>
      )}
      {chosen >= 0 && (
        <Tile className="mt-2 rounded-full bg-[#E8A33D] px-4 py-2 text-[12px] font-extrabold text-[#2A2823]" data-testid="plot-why-next" onClick={onNext}>
          Watch the other way
        </Tile>
      )}
    </>
  )
}

/** The counterfactual on the first play: the same bed with a can every morning, about eight seconds, then the split. */
function Counterfactual({ run, onNext }: { run: PlotRun; onNext: () => void }) {
  const every = useMemo(() => everyMorning(run.start, run.length), [run.start, run.length])
  const [day, setDay] = useState(0)
  const total = every.daily.length
  // Paced on the clock — about eight seconds whatever the frame rate.
  useEffect(() => {
    const t0 = Date.now()
    const id = window.setInterval(() => {
      const d = Math.min(total, Math.floor(((Date.now() - t0) / 8000) * total) + 1)
      setDay(d)
      if (d >= total) window.clearInterval(id)
    }, 100)
    return () => window.clearInterval(id)
  }, [total])
  const d = every.daily[Math.max(0, Math.min(total - 1, day - 1))]
  const finished = day >= total
  const you = recordOf(run)
  const deathIndex = every.daily.findIndex((d) => d.health <= 0.001)
  const gone = deathIndex < 0 ? null : deathIndex + 1
  return (
    <div data-testid="counterfactual" data-day={day} data-finished={finished}>
      <span className="atlas-eyebrow block">The same bed · a can every morning</span>
      <div className="mt-2 flex items-center gap-3">
        <LeafGauge firm={day === 0 ? run.days[0]?.firm13 ?? 0.5 : d.firm13} stood={false} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between text-[11px] font-extrabold text-[#2A2823]">
            <span>Day {Math.min(total, Math.max(1, day))}</span>
            <span className="tabular-nums">firm {(day === 0 ? run.days[0]?.firm13 ?? 0.5 : d.firm13).toFixed(2)}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[10px] font-extrabold text-[#8B8471] uppercase">
            Roots
            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-[#EEE7D8]">
              <div className="h-full rounded-full bg-[#B5652E]" style={{ width: `${(day === 0 ? 1 : d.health) * 100}%` }} data-testid="cf-roots" />
            </div>
          </div>
        </div>
      </div>
      {finished && (
        <div className="mt-2 grid grid-cols-2 gap-1.5 text-center" data-testid="cf-split">
          <div className="rounded-[12px] bg-[#DDEBD9] px-2 py-2" data-testid="cf-you">
            <span className="block text-[9px] font-extrabold tracking-wide text-[#2F7F7A] uppercase">You</span>
            <span className="block text-[13px] font-extrabold text-[#2A2823]">
              {you.cans} {you.cans === 1 ? 'can' : 'cans'} · standing
            </span>
          </div>
          <div className="rounded-[12px] bg-[#F6DEDC] px-2 py-2" data-testid="cf-every">
            <span className="block text-[9px] font-extrabold tracking-wide text-[#A23B2E] uppercase">Every morning</span>
            <span className="block text-[13px] font-extrabold text-[#2A2823]">
              {every.cans} cans · gone{gone ? ` by day ${gone}` : ''}
            </span>
          </div>
        </div>
      )}
      <Tile data-testid="cf-next" disabled={!finished} className={cn('mt-3 rounded-full bg-[#E8A33D] px-4 py-2 text-[12.5px] font-extrabold text-[#2A2823]', !finished && 'opacity-40')} onClick={onNext}>
        Into the journal
      </Tile>
    </div>
  )
}

/* ---------------------------------------------------------------- page */

/** The first Codex page: the world's line, the child's discovery, the rule; folded for the band. */
export function PageCard({ p, onClose }: { p: PlotState; onClose: () => void }) {
  const caps = useBandCaps()
  const t = WORLD_TEXT.landing.codexPage
  const rec = p.first ? recordOf(p.first) : null
  return (
    <div className="pointer-events-auto absolute inset-0 grid place-items-center bg-[#2A2823]/35 p-4" data-focus-layer="">
      <div className="atlas-plate atlas-arrive w-full max-w-[26rem] rounded-[22px] px-6 py-5" data-testid="codex-page">
        <span className="atlas-eyebrow block">Codex · page one · author: {t.author}</span>
        <p className="atlas-serif mt-1 text-[20px] leading-tight font-semibold text-[#2A2823]">{t.title}</p>
        <p className="mt-1 text-[13px] font-semibold text-[#5F5A4E]">{t.line}</p>
        <div className="mt-3 rounded-[12px] bg-[#EEE7D8] px-3 py-2">
          <span className="block text-[9px] font-extrabold tracking-wide text-[#8B8471] uppercase">You discovered</span>
          <p className="text-[13px] font-extrabold text-[#2A2823]" data-testid="codex-discovered">
            {t.discovered.replace('You discovered: ', '')}
          </p>
          {rec && (
            <p className="mt-0.5 text-[11px] font-semibold text-[#5F5A4E]">
              First stood on day {rec.stood ?? '—'}; {rec.cans} {rec.cans === 1 ? 'can' : 'cans'} used in total. {rec.steadyHands ? 'Steady care after day one.' : 'Recovered by the final day.'}
            </p>
          )}
        </div>
        <p className="mt-2 text-[12.5px] font-extrabold text-[#2A2823]" data-testid="codex-rule">
          {t.rule}
        </p>
        {caps.quantitative && (
          <details className="mt-2 rounded-[12px] bg-[#EEE7D8] px-3 py-1.5" data-testid="codex-how">
            <summary className="cursor-pointer text-[11px] font-extrabold text-[#5F5A4E]">Show me how</summary>
            <p className="mt-1 text-[11.5px] leading-snug text-[#2A2823]">
              Air-filled porosity is the share of the soil that is pore space with air in it: porosity minus the water content. Below about {Math.round(0.1 * 100)} % the roots run short. Roots grow fine in water that carries air — the problem is airless soil, not wetness.
              {caps.vocab === 'technical' ? ` Dry-side stress follows FAO-56: Ks = (TAW − Dr) / ((1 − p)·TAW) with p = 0.35; clay here has TAW ${Math.round((SOIL.clay.fc - SOIL.clay.wp) * 300)} mm over the 300 mm root zone.` : ''}
            </p>
          </details>
        )}
        {caps.vocab === 'technical' && (
          <details className="mt-1.5 rounded-[12px] bg-[#EEE7D8] px-3 py-1.5" data-testid="codex-sources">
            <summary className="cursor-pointer text-[11px] font-extrabold text-[#5F5A4E]">Where the numbers come from</summary>
            <ul className="mt-1 grid gap-1">
              {ROOTS_CONSTANTS.map((c) => (
                <li key={c.id} className="text-[10.5px] leading-snug text-[#2A2823]">
                  <span className={cn('mr-1 inline-block h-2 w-2 rounded-full align-middle', c.basis === 'measured' ? 'bg-[#2F7F7A]' : 'bg-[#E8A33D]')} />
                  <span className="font-extrabold">{c.name}</span> — {c.value}. <span className="text-[#5F5A4E]">{c.source}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        <Tile autoFocus data-testid="codex-close" className="mt-3 w-full rounded-full bg-[#E8A33D] px-4 py-2.5 text-[13px] font-extrabold text-[#2A2823]" onClick={onClose}>
          Keep it
        </Tile>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- scope */

/** The Lens's System ring at a bed: the bed in section, the pores, the air and O₂ and root bars — evidence, no sentence. */
export function BedScope({ compact }: { compact: boolean }) {
  const s = useWorld()
  const caps = useBandCaps()
  const run = s.plot.run
  if (!run) return null
  const b = run.b
  const clay = SOIL.clay
  const waterShare = b.theta / clay.phi
  const air = airOf(b)
  const airShare = Math.max(0, air) / clay.phi
  const W = 240
  const H = 96
  return (
    <div className={cn('pointer-events-none absolute left-3 z-10', compact ? 'top-24' : 'top-[19rem]')}>
      <div className={cn('glass w-full px-3 py-2.5', compact ? 'max-w-[18rem]' : 'max-w-[20rem]')} data-testid="bed-scope">
        <span className="glass-eyebrow block">The Lens · the bed in section</span>
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full" role="img" aria-label="The bed in section">
          <rect x={0} y={0} width={W} height={H} rx={8} fill="#5A3E24" />
          {/* pores: a grid; water fills from the bottom in proportion to θ/φ, the rest is air */}
          {Array.from({ length: 6 }, (_, r) =>
            Array.from({ length: 15 }, (_, c) => {
              const y = 12 + r * 14
              const x = 10 + c * 15
              const wet = 1 - r / 6 < waterShare
              return <circle key={`${r}-${c}`} cx={x} cy={y} r={4.2} fill={wet ? '#3E7A93' : '#F6F2E8'} opacity={wet ? 0.95 : 0.55} />
            }),
          )}
          {/* the roots: bright when alive, fading with health */}
          <path d={`M${W / 2} 0 v${H - 10} M${W / 2} 30 l -40 30 M${W / 2} 30 l 40 30 M${W / 2} 55 l -25 30 M${W / 2} 55 l 25 30`} stroke="#F1E7D2" strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.25 + 0.75 * b.health} />
        </svg>
        <div className="mt-1.5 grid gap-1">
          <Bar label="Air in the pores" value={Math.min(1, airShare / 0.5)} text={`${Math.round(air * 100)} %`} color="#F6F2E8" testid="scope-air" />
          <Bar label="Oxygen at the roots" value={b.o2} text={b.o2.toFixed(2)} color="#7BD389" testid="scope-o2" />
          <Bar label="Living roots" value={b.health} text={`${Math.round(b.health * 100)} %`} color="#B5652E" testid="scope-roots" />
          {caps.quantitative && <Bar label="Water θ" value={waterShare} text={`${b.theta.toFixed(2)} of φ ${clay.phi}`} color="#3E7A93" testid="scope-theta" />}
          {caps.vocab === 'technical' && (
            <p className="text-[10px] text-[#F6F2E8]/70">stored {Math.round(storedOf(b))} mm · pond {b.pond.toFixed(1)} mm</p>
          )}
        </div>
      </div>
    </div>
  )
}

function Bar({ label, value, text, color, testid }: { label: string; value: number; text: string; color: string; testid: string }) {
  return (
    <div data-testid={testid} data-value={value.toFixed(3)}>
      <div className="flex items-baseline justify-between text-[10px] font-extrabold text-[#F6F2E8]">
        <span className="uppercase tracking-wide text-[#F0B354]">{label}</span>
        <span className="tabular-nums">{text}</span>
      </div>
      <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-[#F6F2E8]/15">
        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- journal */

/** The plot's journal: every attempt, curve and all, the failed ones kept. */
export function PlotJournal({ p, onClose }: { p: PlotState; onClose: () => void }) {
  const live = p.run && p.run.days.length > 0 && p.run.phase !== 'done' && p.run.phase !== 'dead' ? recordOf(p.run) : null
  const rows = [...p.attempts, ...(live ? [live] : [])]
  return (
    <div className="pointer-events-auto absolute inset-0 grid place-items-center bg-[#2A2823]/35 p-4" data-focus-layer="">
      <div className="atlas-plate w-full max-w-[28rem] rounded-[22px] px-5 py-4" data-testid="plot-journal">
        <span className="atlas-eyebrow block">Journal · The Drooping Cassava</span>
        {rows.length === 0 && <p className="mt-2 text-[12.5px] font-semibold text-[#5F5A4E]">Nothing yet. Each simulated day takes about six seconds, then pauses for your decision. The journal records the leaves at one o’clock.</p>}
        <div className="mt-2 grid max-h-[60vh] gap-2 overflow-y-auto">
          {rows.map((r, i) => (
            <JournalRow key={i} r={r} current={!!live && i === rows.length - 1} />
          ))}
        </div>
        <Tile autoFocus data-testid="plot-journal-close" className="mt-3 rounded-full bg-[#E8A33D] px-4 py-2 text-[12.5px] font-extrabold text-[#2A2823]" onClick={onClose}>
          Close
        </Tile>
      </div>
    </div>
  )
}

function JournalRow({ r, current }: { r: PlotRecord; current: boolean }) {
  const W = 220
  const H = 44
  const n = Math.max(1, r.firm13.length)
  const pts = r.firm13.map((f, i) => `${(i / Math.max(1, n - 1)) * W},${H - f * H}`).join(' ')
  return (
    <div className="rounded-[12px] bg-[#EEE7D8] px-3 py-2" data-testid="journal-try" data-bed={r.bed} data-rescued={r.rescued}>
      <div className="flex items-baseline justify-between text-[11px] font-extrabold text-[#2A2823]">
        <span>
          {r.bed === 'first' ? "Nara's bed" : 'The far bed'} · try {r.attempt}
          {current ? ' · now' : ''}
        </span>
        <span className={cn(r.rescued ? 'text-[#2F7F7A]' : current ? 'text-[#8B8471]' : 'text-[#A23B2E]')}>{r.rescued ? 'standing' : current ? `day ${r.firm13.length}` : 'not saved'}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full" role="img" aria-label="Firmness by day">
        <line x1={0} y1={H - RESCUE_FIRM * H} x2={W} y2={H - RESCUE_FIRM * H} stroke="#7BD389" strokeDasharray="3 3" />
        <line x1={0} y1={H - CARE_FIRM * H} x2={W} y2={H - CARE_FIRM * H} stroke="#FF8A5C" strokeDasharray="2 4" />
        <polyline points={pts} fill="none" stroke="#B5652E" strokeWidth={2} />
        {r.cansByDay.map((c, i) => (c ? <circle key={i} cx={(i / Math.max(1, n - 1)) * W} cy={H - r.firm13[i] * H} r={3} fill="#3E7A93" /> : null))}
      </svg>
      <p className="mt-0.5 text-[10.5px] font-semibold text-[#5F5A4E]">
        {r.cans} {r.cans === 1 ? 'can' : 'cans'}
        {r.said.length ? ` · said ${r.said.join(' → ')}` : ''} · probed {r.probed.filter(Boolean).length} of {r.probed.length} mornings
        {r.words.length ? ` · ${r.words.map((w) => w[0] + w.slice(1, 2).toLowerCase()).join(' ')}` : ''}
      </p>
    </div>
  )
}
