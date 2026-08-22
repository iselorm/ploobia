import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ChevronDown, ChevronUp, Download, LineChart, PenLine, Table2, Trash2 } from 'lucide-react'
import { useBand, useBandCaps } from '@/lib/bands'
import { logEvent } from '@/lib/events'
import { useReactionMs, fitLine, halfRange, lineClose, lineFromHandles, mean, withUncertainty, type Handles, type Point } from '@/lib/practical'
import {
  gFromTrace,
  groupBySetup,
  MASS_BY_ID,
  SURFACE_BY_ID,
  traceToVt,
  WORLD_BY_ID,
  type LabMode,
  type MotionReading,
} from '@/lib/motion'

/* ------------------------------------------------------------------ */
/* Plot surface — points, a learner-drawn line, gradient triangle      */
/* ------------------------------------------------------------------ */

const W = 392
const H = 222
const PAD = { l: 46, r: 12, t: 12, b: 36 }

interface PlotProps {
  points: Point[]
  others?: Point[]
  curve?: Point[]
  xLabel: string
  yLabel: string
  xMax: number
  yMax: number
  colors?: string[]
  /** Learner-drawn line (data units). */
  handles?: Handles | null
  onHandles?: (h: Handles) => void
  /** Draw a gradient triangle and read the gradient off it. */
  triangle?: boolean
  /** Shade the area under the learner line from 0 to `shadeTo`. */
  shadeTo?: number | null
  fitted?: { gradient: number; intercept: number } | null
  ariaLabel: string
}

function ticks(max: number): number[] {
  const raw = max / 5
  const pow = Math.pow(10, Math.floor(Math.log10(raw || 1)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? pow
  const out: number[] = []
  for (let v = 0; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(6)))
  return out
}

function PlotSurface({ points, others = [], curve, xLabel, yLabel, xMax, yMax, colors, handles, onHandles, triangle, shadeTo, fitted, ariaLabel }: PlotProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<'a' | 'b' | null>(null)
  const px = (x: number) => PAD.l + (x / (xMax || 1)) * (W - PAD.l - PAD.r)
  const py = (y: number) => H - PAD.b - (y / (yMax || 1)) * (H - PAD.t - PAD.b)
  const toData = (clientX: number, clientY: number) => {
    const svg = svgRef.current!
    const r = svg.getBoundingClientRect()
    const sx = ((clientX - r.left) / r.width) * W
    const sy = ((clientY - r.top) / r.height) * H
    return {
      x: Math.max(0, Math.min(xMax, ((sx - PAD.l) / (W - PAD.l - PAD.r)) * xMax)),
      y: Math.max(0, Math.min(yMax, ((H - PAD.b - sy) / (H - PAD.t - PAD.b)) * yMax)),
    }
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !handles || !onHandles) return
    const p = toData(e.clientX, e.clientY)
    onHandles(drag.current === 'a' ? { a: p, b: handles.b } : { a: handles.a, b: p })
  }
  const ln = handles ? lineFromHandles(handles) : null

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full touch-none select-none"
      role="img"
      aria-label={ariaLabel}
      onPointerMove={onMove}
      onPointerUp={() => (drag.current = null)}
      onPointerLeave={() => (drag.current = null)}
    >
      <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} fill="#FFFDF7" />
      {ticks(yMax).map((v) => (
        <g key={`y${v}`}>
          <line x1={PAD.l} x2={W - PAD.r} y1={py(v)} y2={py(v)} stroke={v === 0 ? '#C9B896' : '#EFE4CE'} strokeWidth={v === 0 ? 1.4 : 1} />
          <text x={PAD.l - 5} y={py(v) + 3} textAnchor="end" fontSize="9" fontWeight="700" fill="#A08750">
            {v}
          </text>
        </g>
      ))}
      {ticks(xMax).map((v) => (
        <g key={`x${v}`}>
          <line x1={px(v)} x2={px(v)} y1={PAD.t} y2={H - PAD.b} stroke="#F3EBDD" />
          <text x={px(v)} y={H - PAD.b + 14} textAnchor="middle" fontSize="9" fontWeight="700" fill="#A08750">
            {v}
          </text>
        </g>
      ))}
      <text x={(W + PAD.l) / 2} y={H - 4} textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#7A5252">
        {xLabel}
      </text>
      <text x={10} y={(H - PAD.b + PAD.t) / 2} transform={`rotate(-90 10 ${(H - PAD.b + PAD.t) / 2})`} textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#7A5252">
        {yLabel}
      </text>

      {/* Shaded area under the learner line */}
      {ln && shadeTo != null && shadeTo > 0 && (
        <polygon
          points={`${px(0)},${py(0)} ${px(0)},${py(Math.max(0, ln.intercept))} ${px(shadeTo)},${py(Math.max(0, ln.gradient * shadeTo + ln.intercept))} ${px(shadeTo)},${py(0)}`}
          fill="#3BA0FF"
          opacity={0.25}
        />
      )}

      {curve && curve.length > 1 && <polyline fill="none" stroke="#2E6DA8" strokeWidth="1.8" points={curve.map((p) => `${px(p.x)},${py(p.y)}`).join(' ')} />}

      {fitted && (
        <line x1={px(0)} y1={py(fitted.intercept)} x2={px(xMax)} y2={py(fitted.gradient * xMax + fitted.intercept)} stroke="#2E7D32" strokeWidth="1.4" strokeDasharray="5 3" opacity={0.8} />
      )}

      {others.map((p, i) => (
        <circle key={`o${i}`} cx={px(p.x)} cy={py(p.y)} r={3} fill="none" stroke="#B08A7A" strokeWidth="1.4" opacity={0.55} />
      ))}
      {points.map((p, i) => (
        <circle key={`p${i}`} cx={px(p.x)} cy={py(p.y)} r={3.8} fill={colors?.[i] ?? '#2E6DA8'} stroke="#1F3E5C" strokeWidth="1" />
      ))}

      {/* Learner line and handles */}
      {handles && ln && (
        <g>
          <line x1={px(0)} y1={py(ln.intercept)} x2={px(xMax)} y2={py(ln.gradient * xMax + ln.intercept)} stroke="#B97D10" strokeWidth="2" />
          {triangle && (
            <g>
              <line x1={px(handles.a.x)} y1={py(handles.a.y)} x2={px(handles.b.x)} y2={py(handles.a.y)} stroke="#B97D10" strokeWidth="1.2" strokeDasharray="3 3" />
              <line x1={px(handles.b.x)} y1={py(handles.a.y)} x2={px(handles.b.x)} y2={py(handles.b.y)} stroke="#B97D10" strokeWidth="1.2" strokeDasharray="3 3" />
              <text x={(px(handles.a.x) + px(handles.b.x)) / 2} y={py(handles.a.y) + 11} textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#B97D10">
                Δx = {(handles.b.x - handles.a.x).toFixed(2)}
              </text>
              <text x={px(handles.b.x) + 4} y={(py(handles.a.y) + py(handles.b.y)) / 2} fontSize="8.5" fontWeight="800" fill="#B97D10">
                Δy = {(handles.b.y - handles.a.y).toFixed(2)}
              </text>
            </g>
          )}
          {(['a', 'b'] as const).map((k) => (
            <circle
              key={k}
              cx={px(handles[k].x)}
              cy={py(handles[k].y)}
              r={9}
              fill="#FBEBD2"
              stroke="#B97D10"
              strokeWidth="2"
              className="cursor-grab"
              data-testid={`handle-${k}`}
              onPointerDown={(e) => {
                ;(e.target as Element).setPointerCapture?.(e.pointerId)
                drag.current = k
              }}
            />
          ))}
        </g>
      )}
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Write-up                                                           */
/* ------------------------------------------------------------------ */

const TOPICS = {
  mass: {
    prompt: 'Does the mass of a ball change how fast it falls?',
    claims: ['the heavy ball landed first', 'the light ball landed first', 'both balls landed together'],
    reasons: [
      'gravity pulls harder on heavier things, so they speed up more',
      'gravity pulls harder on heavier things but they also need more force to speed up — the two cancel exactly',
      'lighter things always move faster',
    ],
    correct: { claim: 2, reason: 1 },
  },
  gradient: {
    prompt: 'What does the gradient of a speed–time graph tell you?',
    claims: ['the gradient was a constant, so the speed rose steadily', 'the gradient kept changing', 'the graph was flat'],
    reasons: ['the ball gained the same amount of speed every second — a constant acceleration, g', 'the ball moved at a constant speed', 'gravity switched off after a while'],
    correct: { claim: 0, reason: 0 },
  },
} as const
type TopicId = keyof typeof TOPICS

const LIMITS = [
  'my reaction time is a large fraction of the times measured',
  'only a few repeats — more would tighten the mean',
  'the marker was judged by eye from an angle (parallax)',
  'the sensor samples every 20 ms, so the last point before landing is uncertain',
  'no air in this lab — a feather would tell a different story',
]

function TileRow({ options, value, onChange, multi = false, label }: { options: readonly string[]; value: number[]; onChange: (v: number[]) => void; multi?: boolean; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((opt, i) => {
        const on = value.includes(i)
        return (
          <button
            key={i}
            type="button"
            aria-pressed={on}
            onClick={() => (multi ? onChange(on ? value.filter((v) => v !== i) : [...value, i]) : onChange([i]))}
            className={`rounded-[12px] border px-2.5 py-1.5 text-left text-[11px] leading-snug font-bold transition-all ${on ? 'border-[#2E6DA8] bg-[#2E6DA8] text-[#FBF5EA] shadow' : 'border-[#E8DFC8] bg-[#FFFDF7] text-[#5C3A3A] hover:bg-[#F6EFE0]'}`}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}

function WriteUp({ readings }: { readings: MotionReading[] }) {
  const [topic, setTopic] = useState<TopicId>('mass')
  const [claim, setClaim] = useState<number[]>([])
  const [reason, setReason] = useState<number[]>([])
  const [limits, setLimits] = useState<number[]>([])
  const [notes, setNotes] = useState('')
  const [band] = useBand()
  const logged = useRef<Set<string>>(new Set())
  const t = TOPICS[topic]
  const drops = readings.filter((r) => r.kind === 'drop' || r.kind === 'trace')
  const evidence =
    topic === 'mass'
      ? drops.length
        ? `${drops.length} drop${drops.length === 1 ? '' : 's'} recorded, from ${Math.min(...drops.map((d) => d.x)).toFixed(2)}–${Math.max(...drops.map((d) => d.x)).toFixed(2)} m; steel and wooden balls released together landed within a frame of each other.`
        : 'No drops recorded yet.'
      : readings.some((r) => r.kind === 'trace')
        ? `Sensor trace: v–t points lie on a straight line; fitted gradient ${(gFromTrace(readings.filter((r) => r.kind === 'trace').slice(-1)[0].trace!)?.g ?? 0).toFixed(1)} m/s².`
        : 'No sensor trace recorded yet.'
  const complete = claim.length > 0 && reason.length > 0
  useEffect(() => {
    if (!complete || logged.current.has(topic)) return
    logged.current.add(topic)
    logEvent('motion', band, 'writeup.completed', {
      variable: topic,
      claim: t.claims[claim[0]],
      reason: t.reasons[reason[0]],
      limitations: limits.map((i) => LIMITS[i]),
      ownWords: notes.trim().length > 0,
    })
  }, [complete, topic, band, claim, reason, limits, notes, t])
  const right = complete && claim[0] === t.correct.claim && reason[0] === t.correct.reason
  const heading = 'text-[9.5px] font-black tracking-wider text-[#A08750] uppercase'
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(TOPICS) as TopicId[]).map((id) => (
          <button
            key={id}
            onClick={() => {
              setTopic(id)
              setClaim([])
              setReason([])
            }}
            className={`rounded-full px-2.5 py-1 text-[10.5px] font-extrabold ${topic === id ? 'bg-[#2E6DA8] text-[#FBF5EA]' : 'bg-[#F3E9D7] text-[#7A5252]'}`}
          >
            {id === 'mass' ? 'Mass and falling' : 'The v–t gradient'}
          </button>
        ))}
      </div>
      <p className="text-[11.5px] font-black text-[#402222]">{t.prompt}</p>
      <div>
        <div className={heading}>Claim</div>
        <TileRow label="Claim" options={t.claims} value={claim} onChange={setClaim} />
      </div>
      <div>
        <div className={heading}>Evidence — from your own table</div>
        <p className="mt-0.5 rounded-[10px] border border-[#E8DFC8] bg-[#FFFDF7] px-2 py-1.5 text-[11px] leading-snug font-semibold text-[#5C3A3A]">{evidence}</p>
      </div>
      <div>
        <div className={heading}>Reasoning</div>
        <TileRow label="Reasoning" options={t.reasons} value={reason} onChange={setReason} />
      </div>
      <div>
        <div className={heading}>Limitations</div>
        <div className="mt-1">
          <TileRow label="Limitations" options={LIMITS} value={limits} onChange={setLimits} multi />
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Your own words (optional)"
          className="mt-1.5 w-full resize-none rounded-[10px] border border-[#E8DFC8] bg-[#FFFDF7] px-2 py-1.5 text-[11px] font-semibold text-[#5C3A3A] placeholder:text-[#C4AF95]"
        />
      </div>
      {complete && (
        <div className={`rounded-[12px] border px-2.5 py-2 ${right ? 'border-[#D3E2F0] bg-[#EDF4FA]' : 'border-[#F0D9C0] bg-[#FDF1E4]'}`}>
          <p className="text-[11px] leading-snug font-semibold text-[#3C5A75]" data-testid="conclusion">
            {right ? 'That is the conclusion the evidence supports.' : 'Written up — but look again at your evidence before you defend it. Which claim do the drops actually support?'}
          </p>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Data lab                                                           */
/* ------------------------------------------------------------------ */

export interface LineState {
  rollLineOk: boolean
  vtLineOk: boolean
  areaOk: boolean
}

interface Props {
  readings: MotionReading[]
  mode: LabMode
  /** Readings that match the current set-up are drawn solid; others faded. */
  matches: (r: MotionReading) => boolean
  g: number
  /** Launch speed the current settings would give — groups the range–angle graph. */
  launchSpeed: number
  onDelete: (id: number) => void
  onClear: () => void
  onLineState: (s: LineState) => void
  embedded?: boolean
}

export default function MotionDataLab({ readings, mode, matches, g, launchSpeed, onDelete, onClear, onLineState, embedded = false }: Props) {
  const caps = useBandCaps()
  const reaction = useReactionMs()
  const [openState, setOpen] = useState(() => (typeof window === 'undefined' ? false : window.innerWidth > 1100))
  const open = embedded || openState
  const [tab, setTab] = useState<'graph' | 'table' | 'trace' | 'writeup'>('graph')
  const [rollHandles, setRollHandles] = useState<Handles | null>(null)
  const [vtHandles, setVtHandles] = useState<Handles | null>(null)
  const [vtMode, setVtMode] = useState(false)
  const [shade, setShade] = useState(false)

  const traces = useMemo(() => readings.filter((r) => r.kind === 'trace'), [readings])
  const trace = traces[traces.length - 1] ?? null

  /* ---- roll graph: distance against time ---- */
  const rolls = useMemo(() => readings.filter((r) => r.kind === 'roll'), [readings])
  const rollMine = useMemo(() => rolls.filter(matches), [rolls, matches])
  const rollPts = useMemo(() => rollMine.map((r) => ({ x: r.t, y: r.x })), [rollMine])
  const rollOthers = useMemo(() => rolls.filter((r) => !matches(r)).map((r) => ({ x: r.t, y: r.x })), [rolls, matches])
  const rollXMax = Math.max(1, ...rolls.map((r) => r.t)) * 1.15
  const rollYMax = 2.2

  // The learner's line starts flat through the mean: they must tilt it themselves.
  const rollDefault = useMemo<Handles | null>(() => {
    if (!(caps.learnerPlotsGraph && rollPts.length >= 3)) return null
    const my = mean(rollPts.map((p) => p.y))
    return { a: { x: rollXMax * 0.2, y: my }, b: { x: rollXMax * 0.8, y: my } }
  }, [caps.learnerPlotsGraph, rollPts, rollXMax])
  const rollHandlesShown = rollHandles ?? rollDefault
  const rollJudge = useMemo(() => (rollHandlesShown && rollPts.length >= 3 ? lineClose(rollHandlesShown, rollPts, 0.15) : null), [rollHandlesShown, rollPts])

  /* ---- launch graph: range against angle, grouped by launch speed ---- */
  const launches = useMemo(() => readings.filter((r) => r.kind === 'launch'), [readings])
  const launchMine = useMemo(
    () => launches.filter((r) => r.speed !== undefined && Math.abs(r.speed - launchSpeed) <= 0.15),
    [launches, launchSpeed],
  )
  const launchPts = useMemo(() => launchMine.map((r) => ({ x: r.angle ?? 0, y: r.x })), [launchMine])
  const launchOthers = useMemo(
    () => launches.filter((r) => !launchMine.includes(r)).map((r) => ({ x: r.angle ?? 0, y: r.x })),
    [launches, launchMine],
  )
  const launchYMax = Math.max(4, ...launches.map((r) => r.x)) * 1.15

  /* ---- drop graph: fall time against height ---- */
  const drops = useMemo(() => readings.filter((r) => r.kind === 'drop' || r.kind === 'trace'), [readings])
  const dropPts = drops.map((r) => ({ x: r.x, y: r.t }))
  const dropColors = drops.map((r) => (r.world === 'moon' ? '#8E97A3' : r.world === 'mars' ? '#C96A3B' : '#2E6DA8'))
  const dropYMax = Math.max(0.6, ...drops.map((r) => r.t)) * 1.15

  /* ---- trace ---- */
  const vtPts = useMemo(() => (trace?.trace ? traceToVt(trace.trace) : []), [trace])
  const vtXMax = trace ? trace.t * 1.1 : 1
  const vtYMax = trace ? Math.max(0.5, ...vtPts.map((p) => p.y)) * 1.2 : 1
  const vtDefault = useMemo<Handles | null>(() => {
    if (!trace || vtPts.length < 3) return null
    const my = mean(vtPts.map((p) => p.y))
    return { a: { x: vtXMax * 0.2, y: my }, b: { x: vtXMax * 0.8, y: my } }
  }, [trace, vtPts, vtXMax])
  const vtHandlesShown = vtHandles ?? vtDefault
  const vtJudge = useMemo(() => (vtHandlesShown && vtPts.length >= 3 ? lineClose(vtHandlesShown, vtPts, 0.1) : null), [vtHandlesShown, vtPts])
  const vtLine = vtHandlesShown ? lineFromHandles(vtHandlesShown) : null
  const area = vtLine && trace ? 0.5 * trace.t * (vtLine.gradient * trace.t + vtLine.intercept) + Math.min(0, vtLine.intercept) * 0 : null
  const areaOk = !!(shade && area !== null && trace && Math.abs(area - trace.x) <= trace.x * 0.08 && vtJudge?.ok)
  const gFit = useMemo(() => (trace?.trace ? gFromTrace(trace.trace) : null), [trace])

  const lineState = useRef<LineState>({ rollLineOk: false, vtLineOk: false, areaOk: false })
  useEffect(() => {
    const next: LineState = {
      rollLineOk: lineState.current.rollLineOk || !!rollJudge?.ok,
      vtLineOk: lineState.current.vtLineOk || !!vtJudge?.ok,
      areaOk: lineState.current.areaOk || areaOk,
    }
    if (next.rollLineOk !== lineState.current.rollLineOk || next.vtLineOk !== lineState.current.vtLineOk || next.areaOk !== lineState.current.areaOk) {
      lineState.current = next
      onLineState(next)
    }
  }, [rollJudge, vtJudge, areaOk, onLineState])

  const download = useCallback(() => {
    const rows = [
      ['#', 'kind', 'method', 'x / m', 't / s', 'world', 'g / m s^-2', 'ball', 'surface', 'push / m s^-1', 'predicted / s'],
      ...readings.map((r, i) => [i + 1, r.kind, r.method, r.x.toFixed(2), r.t.toFixed(3), r.world, r.g, r.mass, r.surface, r.push.toFixed(2), r.predicted ?? '']),
    ]
    const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'motion-lab-results.csv'
    a.click()
    URL.revokeObjectURL(url)
  }, [readings])

  const groups = useMemo(() => groupBySetup(readings.filter((r) => r.kind !== 'trace')).filter((gp) => gp.length >= 2), [readings])
  const tabBtn = (active: boolean) => `flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-extrabold transition-all ${active ? 'bg-[#2E6DA8] text-[#FBF5EA] shadow' : 'bg-[#F3E9D7] text-[#7A5252] hover:bg-[#EBDFC8]'}`
  const unc = (r: MotionReading) => (r.method === 'hand' ? (reaction ?? 250) / 1000 : r.method === 'gate' ? 0.001 : 0.02)

  return (
    <div className={embedded ? 'pointer-events-auto w-full' : 'pointer-events-auto w-full max-w-[27rem] rounded-[20px] border border-[#F3E9D7] bg-[#FBF5EA]/95 shadow-xl backdrop-blur-md'}>
      {!embedded && (
        <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left" aria-expanded={open}>
          <span className="flex items-center gap-2 text-sm font-extrabold text-[#402222]">
            <LineChart className="h-4 w-4 text-[#2E6DA8]" />
            Data lab
            <span className="rounded-full bg-[#EDF4FA] px-2 py-0.5 text-[10px] font-black text-[#245685]">
              {readings.length} {readings.length === 1 ? 'reading' : 'readings'}
            </span>
          </span>
          {open ? <ChevronDown className="h-4 w-4 shrink-0 text-[#7A5252]" /> : <ChevronUp className="h-4 w-4 shrink-0 text-[#7A5252]" />}
        </button>
      )}
      {open && (
        <div className={embedded ? 'px-1 pt-1 pb-2' : 'max-h-[52dvh] overflow-y-auto px-4 pb-4'}>
          <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
            <button onClick={() => setTab('graph')} className={tabBtn(tab === 'graph')}>
              <LineChart className="h-3 w-3" /> Graph
            </button>
            {caps.dataTable && (
              <button onClick={() => setTab('table')} className={tabBtn(tab === 'table')}>
                <Table2 className="h-3 w-3" /> Results
              </button>
            )}
            {caps.motionSensor && (
              <button onClick={() => setTab('trace')} className={tabBtn(tab === 'trace')}>
                <Activity className="h-3 w-3" /> Trace {traces.length ? `(${traces.length})` : ''}
              </button>
            )}
            {caps.conclusion && (
              <button onClick={() => setTab('writeup')} className={tabBtn(tab === 'writeup')}>
                <PenLine className="h-3 w-3" /> Write-up
              </button>
            )}
            <span className="grow" />
            {caps.exportData && readings.length > 0 && (
              <button onClick={download} title="Download results as CSV" className="flex items-center gap-1 rounded-full bg-[#F3E9D7] px-2 py-1 text-[10.5px] font-extrabold text-[#7A5252] hover:bg-[#EBDFC8]">
                <Download className="h-3 w-3" /> CSV
              </button>
            )}
            {readings.length > 0 && (
              <button onClick={onClear} title="Clear all results" className="rounded-full bg-[#F3E9D7] p-1 text-[#B08A7A] hover:bg-[#F6DEDC] hover:text-[#C13B33]">
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>

          {tab === 'graph' && mode === 'roll' && (
            <div>
              <PlotSurface
                points={rollPts}
                others={rollOthers}
                xLabel="time / s"
                yLabel="distance / m"
                xMax={rollXMax}
                yMax={rollYMax}
                handles={caps.learnerPlotsGraph ? rollHandlesShown : null}
                onHandles={setRollHandles}
                triangle={caps.uncertainty}
                fitted={rollJudge?.ok && caps.uncertainty ? fitLine(rollPts) : null}
                ariaLabel="Distance against time for the rolling ball"
              />
              {rollPts.length < 3 && caps.learnerPlotsGraph && <p className="mt-1 text-[10.5px] font-bold text-[#B08A7A]">Three readings with the same push and you can draw the best-fit line.</p>}
              {rollJudge && rollHandlesShown && (
                <div className={`mt-1 rounded-[12px] border px-2.5 py-2 ${rollJudge.ok ? 'border-[#D3E2F0] bg-[#EDF4FA]' : 'border-[#F0DFC0] bg-[#FDF6E7]'}`} data-testid="roll-line">
                  <p className="text-[11px] leading-snug font-bold text-[#3C5A75]">
                    Your line: gradient {rollJudge.learner.toFixed(2)} m/s.{' '}
                    {rollJudge.ok ? 'That is a best-fit line — and its gradient is the ball’s speed.' : 'Drag the two handles until the line runs through the middle of your points.'}
                  </p>
                </div>
              )}
              {!caps.learnerPlotsGraph && rollPts.length >= 2 && <p className="mt-1 text-[10.5px] font-bold text-[#7A5252]">Further markers take longer — the points climb. Steeper means faster.</p>}
            </div>
          )}

          {tab === 'graph' && mode === 'launch' && (
            <div>
              <PlotSurface
                points={launchPts}
                others={launchOthers}
                xLabel="launch angle / °"
                yLabel="range / m"
                xMax={90}
                yMax={launchYMax}
                ariaLabel="Range against launch angle"
              />
              <p className="mt-1 text-[10.5px] font-bold text-[#7A5252]">
                Solid points share your current launch speed ({launchSpeed.toFixed(1)} m/s). {launchPts.length >= 3 ? 'Where does the crown of the curve sit?' : 'Three angles at one speed and a shape appears.'}
              </p>
            </div>
          )}

          {tab === 'graph' && mode === 'drop' && (
            <div>
              <PlotSurface points={dropPts} colors={dropColors} xLabel="height / m" yLabel="fall time / s" xMax={2.1} yMax={dropYMax} ariaLabel="Fall time against height" />
              <p className="mt-1 text-[10.5px] font-bold text-[#7A5252]">Blue Earth · grey Moon · orange Mars. Hand timings scatter by about your reaction time; the pad and sensor do not.</p>
            </div>
          )}

          {tab === 'trace' && (
            <div>
              {!trace ? (
                <p className="py-4 text-center text-[11.5px] font-bold text-[#B08A7A]">No sensor trace yet. Arm the motion sensor on the drop tower and release.</p>
              ) : (
                <div>
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <button onClick={() => setVtMode(false)} className={tabBtn(!vtMode)}>
                      height–time
                    </button>
                    <button onClick={() => setVtMode(true)} className={tabBtn(vtMode)} data-testid="vt-toggle">
                      speed–time
                    </button>
                    {vtMode && vtJudge?.ok && (
                      <button onClick={() => setShade((s) => !s)} className={tabBtn(shade)} data-testid="shade">
                        shade area
                      </button>
                    )}
                    <span className="ml-auto text-[10px] font-bold text-[#B08A7A]">
                      {WORLD_BY_ID[trace.world].label} · {trace.x.toFixed(2)} m · {trace.t.toFixed(3)} s
                    </span>
                  </div>
                  {!vtMode ? (
                    <PlotSurface curve={trace.trace!.map((s) => ({ x: s.t, y: s.h }))} points={[]} xLabel="time / s" yLabel="height / m" xMax={vtXMax} yMax={trace.x * 1.1} ariaLabel="Height against time from the motion sensor" />
                  ) : (
                    <PlotSurface
                      points={vtPts}
                      xLabel="time / s"
                      yLabel="speed / m/s"
                      xMax={vtXMax}
                      yMax={vtYMax}
                      handles={vtHandlesShown}
                      onHandles={setVtHandles}
                      triangle={caps.uncertainty}
                      shadeTo={shade ? trace.t : null}
                      fitted={vtJudge?.ok && caps.uncertainty ? fitLine(vtPts) : null}
                      ariaLabel="Speed against time from the motion sensor"
                    />
                  )}
                  {vtMode && vtJudge && (
                    <div className={`mt-1 rounded-[12px] border px-2.5 py-2 ${vtJudge.ok ? 'border-[#D3E2F0] bg-[#EDF4FA]' : 'border-[#F0DFC0] bg-[#FDF6E7]'}`} data-testid="vt-line">
                      <p className="text-[11px] leading-snug font-bold text-[#3C5A75]">
                        Your line: gradient {vtJudge.learner.toFixed(2)} m/s².{' '}
                        {vtJudge.ok ? `A best-fit line — and its gradient is the acceleration. On ${WORLD_BY_ID[trace.world].label} the dial says ${g.toFixed(2)}.` : 'Drag the handles through the middle of the points.'}
                      </p>
                      {shade && area !== null && (
                        <p className="mt-1 text-[11px] font-bold text-[#3C5A75]" data-testid="area">
                          Area under your line to {trace.t.toFixed(2)} s = {area.toFixed(2)} m · you dropped it from {trace.x.toFixed(2)} m.{' '}
                          {areaOk ? 'They agree: area under speed–time is distance.' : 'They should agree — check your line.'}
                        </p>
                      )}
                      {caps.uncertainty && gFit && (
                        <p className="mt-1 text-[10.5px] font-bold text-[#5E7F97]">
                          Least-squares fit to the sensor points: g = {withUncertainty(gFit.g, gFit.unc)} m/s².
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'table' && (
            <div className="overflow-x-auto">
              {readings.length === 0 ? (
                <p className="py-4 text-center text-[11.5px] font-bold text-[#B08A7A]">No readings yet. Time a roll or a drop.</p>
              ) : (
                <table className="w-full text-[10.5px]" data-testid="results">
                  <thead>
                    <tr className="text-left text-[9px] font-black tracking-wider text-[#A08750] uppercase">
                      <th className="py-1 pr-1">#</th>
                      <th className="py-1 pr-1">What</th>
                      <th className="py-1 pr-1">How</th>
                      <th className="py-1 pr-1 text-right">{mode === 'roll' ? 'd / m' : mode === 'launch' ? 'R / m' : 'h / m'}</th>
                      <th className="py-1 pr-1 text-right">t / s</th>
                      {caps.uncertainty && <th className="py-1 pr-1 text-right">± / s</th>}
                      <th className="py-1 pr-1">World</th>
                      <th className="py-1" />
                    </tr>
                  </thead>
                  <tbody className="font-semibold text-[#5C3A3A]">
                    {readings.map((r, i) => (
                      <tr key={r.id} className="border-t border-[#F0E6D2]">
                        <td className="py-1 pr-1 tabular-nums">{i + 1}</td>
                        <td className="py-1 pr-1">
                          {r.kind === 'roll'
                            ? `run · ${SURFACE_BY_ID[r.surface].label.split(' ')[0].toLowerCase()} · ${MASS_BY_ID[r.mass].label.split(' ')[0].toLowerCase()}`
                            : r.kind === 'launch'
                              ? `launch · ${r.launcher ?? ''} · ${(r.angle ?? 0).toFixed(0)}° · ${(r.speed ?? 0).toFixed(1)} m/s`
                              : r.kind === 'trace'
                                ? 'drop · trace'
                                : 'drop'}
                        </td>
                        <td className="py-1 pr-1">{r.method}</td>
                        <td className="py-1 pr-1 text-right tabular-nums">{r.x.toFixed(2)}</td>
                        <td className="py-1 pr-1 text-right font-black tabular-nums">{r.method === 'hand' ? r.t.toFixed(2) : r.t.toFixed(3)}</td>
                        {caps.uncertainty && <td className="py-1 pr-1 text-right tabular-nums">{unc(r).toFixed(r.method === 'hand' ? 2 : 3)}</td>}
                        <td className="py-1 pr-1">{WORLD_BY_ID[r.world].label}</td>
                        <td className="py-1 text-right">
                          <button onClick={() => onDelete(r.id)} aria-label={`Delete reading ${i + 1}`} className="rounded p-0.5 text-[#C4AF95] hover:text-[#C13B33]">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {groups.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-[9.5px] font-black tracking-wider text-[#A08750] uppercase">Repeats</div>
                  {groups.map((gp, i) => {
                    const ts = gp.map((r) => r.t)
                    return (
                      <p key={i} className="text-[10.5px] font-bold text-[#5C3A3A]" data-testid="repeat-summary">
                        {gp[0].kind} {gp[0].x.toFixed(2)} m ({gp[0].method}, {WORLD_BY_ID[gp[0].world].label}) × {gp.length}: mean {mean(ts).toFixed(2)} s, range ±{halfRange(ts).toFixed(2)} s
                        {gp[0].method === 'hand' && reaction !== null && caps.reactionFeedback === 'spread' && ` — your reaction time is ${(reaction / 1000).toFixed(2)} s, so that spread is about what you would expect.`}
                      </p>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'writeup' && <WriteUp readings={readings} />}
        </div>
      )}
    </div>
  )
}
