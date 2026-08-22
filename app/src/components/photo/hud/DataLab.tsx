import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Download,
  LineChart,
  PenLine,
  Table2,
  Target,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { useBand, useBandCaps } from '@/lib/bands'
import { logEvent } from '@/lib/events'
import { useInputMode } from '@/lib/input'
import { LEAF_BY_ID } from '@/lib/leaves'
import { readingsToCsv, seriesFor, VARS, type Reading, type VarId } from '@/lib/ratelab'

interface Props {
  readings: Reading[]
  xVar: VarId
  leafId: string
  /** Current real-world value of the investigated variable. */
  currentX: number
  prediction: number | null
  predictionPending: boolean
  /** The previous reading, so the youngest band can guess a direction. */
  lastY: number | null
  onPredict: (value: number | null) => void
  onDelete: (id: number) => void
  onClear: () => void
  /** Inside the compact drawer: always open, no card chrome. */
  embedded?: boolean
}

/* ------------------------------------------------------------------ */
/* Curve fitting (Analyst band, light series only)                     */
/* ------------------------------------------------------------------ */

interface Fit {
  /** Light-saturated net rate (the asymptote). */
  asymptote: number
  /** Half-saturation constant, in the x variable's units. */
  half: number
  /** Respiration offset — where the curve crosses at zero light. */
  offset: number
  r2: number
}

/**
 * Least-squares fit of a rectangular hyperbola with a respiration offset:
 *   y = a·x/(x + b) − c
 * `a` is solved analytically for each (b, c) on a coarse grid, which is fast
 * enough to run on every render and honest enough to quote in a write-up.
 */
function fitHyperbola(points: Array<{ x: number; y: number }>): Fit | null {
  if (points.length < 4) return null
  const meanY = points.reduce((s, p) => s + p.y, 0) / points.length
  const ssTot = points.reduce((s, p) => s + (p.y - meanY) ** 2, 0)
  if (ssTot <= 0) return null

  let best: Fit | null = null
  let bestSse = Infinity
  for (let c = 0; c <= 24; c += 0.5) {
    for (let b = 25; b <= 1600; b += 25) {
      let num = 0
      let den = 0
      for (const p of points) {
        const u = p.x / (p.x + b)
        num += (p.y + c) * u
        den += u * u
      }
      if (den <= 0) continue
      const a = num / den
      let sse = 0
      for (const p of points) {
        const pred = (a * p.x) / (p.x + b) - c
        sse += (pred - p.y) ** 2
      }
      if (sse < bestSse) {
        bestSse = sse
        best = { asymptote: a - c, half: b, offset: c, r2: 1 - sse / ssTot }
      }
    }
  }
  return best
}

/* ------------------------------------------------------------------ */
/* Graph                                                              */
/* ------------------------------------------------------------------ */

const W = 392
const H = 214
const PAD = { l: 44, r: 10, t: 12, b: 34 }

function Graph({
  readings,
  xVar,
  leafId,
  currentX,
  prediction,
  predictionPending,
  onPredict,
  showFit,
}: {
  readings: Reading[]
  xVar: VarId
  leafId: string
  currentX: number
  prediction: number | null
  predictionPending: boolean
  onPredict: (v: number | null) => void
  showFit: boolean
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const meta = VARS[xVar]
  const all = useMemo(() => seriesFor(readings, xVar), [readings, xVar])
  const mine = useMemo(() => all.filter((r) => r.leafId === leafId), [all, leafId])
  const others = useMemo(() => all.filter((r) => r.leafId !== leafId), [all, leafId])

  const values = [
    ...all.map((r) => r.y),
    ...all.map((r) => r.y + r.uncertainty),
    ...all.map((r) => r.y - r.uncertainty),
    prediction ?? 0,
    0,
    18,
  ]
  const yMax = Math.max(...values) * 1.12
  const yMin = Math.min(...values, 0) * 1.12
  const xMax = meta.max

  const px = (x: number) => PAD.l + (x / xMax) * (W - PAD.l - PAD.r)
  const py = (y: number) => H - PAD.b - ((y - yMin) / (yMax - yMin || 1)) * (H - PAD.t - PAD.b)

  const fit = useMemo(
    () => (showFit && xVar === 'light' ? fitHyperbola(mine.map((r) => ({ x: r.x, y: r.y }))) : null),
    [showFit, xVar, mine],
  )

  const yTicks = useMemo(() => {
    const ticks: number[] = []
    const step = yMax - yMin > 120 ? 40 : yMax - yMin > 60 ? 20 : 10
    for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) ticks.push(v)
    return ticks
  }, [yMin, yMax])

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!predictionPending) return
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const yPix = ((e.clientY - rect.top) / rect.height) * H
    const value = yMin + ((H - PAD.b - yPix) / (H - PAD.t - PAD.b)) * (yMax - yMin)
    onPredict(Number(value.toFixed(1)))
  }

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={`w-full ${predictionPending ? 'cursor-crosshair' : ''}`}
        onClick={handleClick}
        role="img"
        aria-label={`Net oxygen release against ${meta.label}`}
      >
        <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} fill="#FFFDF7" />

        {/* Gridlines and y ticks */}
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={py(v)}
              y2={py(v)}
              stroke={v === 0 ? '#C9B896' : '#EFE4CE'}
              strokeWidth={v === 0 ? 1.4 : 1}
              strokeDasharray={v === 0 ? '4 3' : undefined}
            />
            <text x={PAD.l - 5} y={py(v) + 3} textAnchor="end" fontSize="9" fontWeight="700" fill="#A08750">
              {v}
            </text>
          </g>
        ))}

        {/* x ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              x1={px(xMax * f)}
              x2={px(xMax * f)}
              y1={H - PAD.b}
              y2={H - PAD.b + 4}
              stroke="#C9B896"
            />
            <text
              x={px(xMax * f)}
              y={H - PAD.b + 14}
              textAnchor="middle"
              fontSize="9"
              fontWeight="700"
              fill="#A08750"
            >
              {Math.round(xMax * f)}
            </text>
          </g>
        ))}
        <text x={(W + PAD.l) / 2} y={H - 3} textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#7A5252">
          {meta.axis}
        </text>
        <text
          x={10}
          y={(H - PAD.b + PAD.t) / 2}
          transform={`rotate(-90 10 ${(H - PAD.b + PAD.t) / 2})`}
          textAnchor="middle"
          fontSize="9.5"
          fontWeight="800"
          fill="#7A5252"
        >
          Net O₂ (bubbles min⁻¹)
        </text>

        {/* Fitted curve */}
        {fit && (
          <polyline
            fill="none"
            stroke="#2E6DA8"
            strokeWidth="1.6"
            strokeDasharray="5 3"
            opacity={0.85}
            points={Array.from({ length: 61 }, (_, i) => {
              const x = (i / 60) * xMax
              const y = ((fit.asymptote + fit.offset) * x) / (x + fit.half) - fit.offset
              return `${px(x)},${py(y)}`
            }).join(' ')}
          />
        )}

        {/* Other leaves, for comparison */}
        {others.map((r) => (
          <circle
            key={r.id}
            cx={px(r.x)}
            cy={py(r.y)}
            r={3}
            fill="none"
            strokeWidth="1.5"
            stroke={LEAF_BY_ID[r.leafId]?.colors.accent ?? '#B08A7A'}
            opacity={0.6}
          />
        ))}

        {/* This leaf: line + error bars + points */}
        {mine.length > 1 && (
          <polyline
            fill="none"
            stroke="#3E7C43"
            strokeWidth="1.8"
            opacity={0.5}
            points={mine.map((r) => `${px(r.x)},${py(r.y)}`).join(' ')}
          />
        )}
        {mine.map((r) => (
          <g key={r.id}>
            {r.uncertainty > 0 && (
              <line
                x1={px(r.x)}
                x2={px(r.x)}
                y1={py(r.y - r.uncertainty)}
                y2={py(r.y + r.uncertainty)}
                stroke="#3E7C43"
                strokeWidth="1.2"
              />
            )}
            <circle
              cx={px(r.x)}
              cy={py(r.y)}
              r={r.anomalous ? 4.6 : 3.6}
              fill={r.anomalous ? '#FBF5EA' : '#3E7C43'}
              stroke={r.anomalous ? '#C13B33' : '#2F6134'}
              strokeWidth={r.anomalous ? 2 : 1}
            />
          </g>
        ))}

        {/* Prediction marker */}
        {prediction !== null && (
          <g>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={py(prediction)}
              y2={py(prediction)}
              stroke="#E8A33D"
              strokeWidth="1.3"
              strokeDasharray="3 3"
            />
            <rect
              x={px(currentX) - 4}
              y={py(prediction) - 4}
              width={8}
              height={8}
              transform={`rotate(45 ${px(currentX)} ${py(prediction)})`}
              fill="#E8A33D"
              stroke="#B97D10"
            />
          </g>
        )}
      </svg>

      {fit && (
        <div className="mt-1 rounded-[12px] border border-[#D3E2F0] bg-[#EDF4FA] px-2.5 py-2">
          <div className="text-[9.5px] font-black tracking-wider text-[#2E6DA8] uppercase">
            Model fitted to your points
          </div>
          <p className="mt-0.5 text-[10.5px] leading-snug font-bold text-[#3C5A75]">
            y = {(fit.asymptote + fit.offset).toFixed(1)}·x / (x + {fit.half.toFixed(0)}) −{' '}
            {fit.offset.toFixed(1)} &nbsp;·&nbsp; R² = {fit.r2.toFixed(3)}
          </p>
          <p className="mt-0.5 text-[10px] leading-snug font-semibold text-[#5E7F97]">
            Saturated net rate ≈ {fit.asymptote.toFixed(1)} bubbles min⁻¹, half-saturation at{' '}
            {fit.half.toFixed(0)} {VARS.light.unit}, and a dark respiration intercept of{' '}
            {fit.offset.toFixed(1)}. A low R² means your points are not following this model —
            check whether a second factor changed mid-experiment.
          </p>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Write-up                                                           */
/* ------------------------------------------------------------------ */

const CLAIMS = [
  'the rate rose and then levelled off at a plateau',
  'the rate rose steadily right across the range tested',
  'the rate rose to a peak and then fell sharply',
  'the rate barely changed at all',
  'the rate stayed negative until a threshold value, then turned positive',
]

const REASONS = [
  'above the plateau a different factor had become limiting',
  'the enzymes involved were denatured at the highest values tested',
  'the stomata closed, so CO₂ could no longer reach the chloroplasts',
  'respiration continued throughout and was subtracted from the gross rate',
  'this leaf’s photosynthetic pathway concentrates CO₂, so extra CO₂ changed little',
]

const LIMITS = [
  'only one trial per value — repeats would show the spread',
  'the bubbles were counted by eye, so small ones may have been missed',
  'the leaf may have warmed up under the lamp during the run',
  'the range tested was narrow, so the shape beyond it is a guess',
  'a second factor may have shifted while I changed the first',
]

/**
 * Sentence tiles: the learner *builds* the conclusion by tapping phrases,
 * which works with a thumb or a controller as well as a mouse, and — for the
 * Explorer and Scientist bands — is better pedagogy than a blank box. Free
 * text stays available for anyone with a keyboard.
 */
function TileRow<T extends string | number>({
  options,
  value,
  onChange,
  prefix,
  multi = false,
  label,
}: {
  options: readonly string[]
  value: T[]
  onChange: (next: T[]) => void
  prefix?: string
  multi?: boolean
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((opt, i) => {
        const key = i as unknown as T
        const on = value.includes(key)
        return (
          <button
            key={i}
            type="button"
            aria-pressed={on}
            onClick={() => {
              if (multi) onChange(on ? value.filter((v) => v !== key) : [...value, key])
              else onChange([key])
            }}
            className={`rounded-[12px] border px-2.5 py-1.5 text-left text-[11px] leading-snug font-bold transition-all ${
              on
                ? 'border-[#3E7C43] bg-[#3E7C43] text-[#FBF5EA] shadow'
                : 'border-[#E8DFC8] bg-[#FFFDF7] text-[#5C3A3A] hover:bg-[#F6EFE0]'
            }`}
          >
            {prefix ? <span className="opacity-70">{prefix} </span> : null}
            {opt}
          </button>
        )
      })}
    </div>
  )
}

function WriteUp({ readings, xVar }: { readings: Reading[]; xVar: VarId }) {
  const [claim, setClaim] = useState<number[]>([])
  const [reason, setReason] = useState<number[]>([])
  const [limits, setLimits] = useState<number[]>([])
  const [notes, setNotes] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const series = seriesFor(readings, xVar)
  const meta = VARS[xVar]

  const evidence =
    series.length >= 2
      ? `Between ${meta.format(series[0].x)} and ${meta.format(
          series[series.length - 1].x,
        )} ${meta.unit}, the net rate went from ${series[0].y.toFixed(1)} to ${series[
          series.length - 1
        ].y.toFixed(1)} bubbles min⁻¹ (${series.length} trials).`
      : 'Not enough trials yet — record at least two readings on this variable.'

  const heading = 'text-[9.5px] font-black tracking-wider text-[#A08750] uppercase'
  const claimText = claim.length ? `As ${meta.label.toLowerCase()} increased, ${CLAIMS[claim[0]]}.` : ''
  const reasonText = reason.length ? ` This happened because ${REASONS[reason[0]]}.` : ''
  const limitText = limits.length
    ? ` Limitations: ${limits.map((i) => LIMITS[i]).join('; ')}.`
    : ''
  const complete = claim.length > 0 && reason.length > 0 && series.length >= 2

  // The write-up is a learning artefact: log it the first time it becomes
  // complete for this variable (edits afterwards do not re-award).
  const [band] = useBand()
  const logged = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!complete || logged.current.has(xVar)) return
    logged.current.add(xVar)
    logEvent('photosynthesis', band, 'writeup.completed', {
      variable: xVar,
      claim: CLAIMS[claim[0]],
      reason: REASONS[reason[0]],
      limitations: limits.map((i) => LIMITS[i]),
      ownWords: notes.trim().length > 0,
    })
  }, [complete, xVar, band, claim, reason, limits, notes])

  return (
    <div className="space-y-2.5">
      <div>
        <div className={heading}>Claim — what did the data show?</div>
        <p className="mt-0.5 mb-1 text-[11px] font-bold text-[#5C3A3A]">
          As {meta.label.toLowerCase()} increased…
        </p>
        <TileRow label="Claim" options={CLAIMS} value={claim} onChange={setClaim} />
      </div>
      <div>
        <div className={heading}>Evidence — from your own table</div>
        <p className="mt-0.5 rounded-[10px] border border-[#E8DFC8] bg-[#FFFDF7] px-2 py-1.5 text-[11px] leading-snug font-semibold text-[#5C3A3A]">
          {evidence}
        </p>
      </div>
      <div>
        <div className={heading}>Reasoning — why does that happen?</div>
        <p className="mt-0.5 mb-1 text-[11px] font-bold text-[#5C3A3A]">This happened because…</p>
        <TileRow label="Reasoning" options={REASONS} value={reason} onChange={setReason} />
      </div>
      <div>
        <div className={heading}>Limitations — pick any that apply</div>
        <div className="mt-1">
          <TileRow label="Limitations" options={LIMITS} value={limits} onChange={setLimits} multi />
        </div>
        {showNotes ? (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            autoFocus
            placeholder="Anything else that would make these results more trustworthy?"
            className="mt-1.5 w-full resize-none rounded-[10px] border border-[#E8DFC8] bg-[#FFFDF7] px-2 py-1.5 text-[11px] font-semibold text-[#5C3A3A] placeholder:text-[#C4AF95]"
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="mt-1.5 text-[10px] font-black text-[#3E7C43] uppercase"
          >
            + add your own words
          </button>
        )}
      </div>
      <div
        className={`rounded-[12px] border px-2.5 py-2 transition-colors ${
          complete ? 'border-[#DDEAD8] bg-[#EAF3E6]' : 'border-[#EFE6D2] bg-[#FBF7EE]'
        }`}
      >
        <div className={`text-[9.5px] font-black tracking-wider uppercase ${complete ? 'text-[#2E7D32]' : 'text-[#A08750]'}`}>
          {complete ? 'Your conclusion' : 'Your conclusion — pick a claim and a reason'}
        </div>
        <p data-testid="conclusion" className="mt-0.5 text-[11px] leading-snug font-semibold text-[#3D5B3F]">
          {claimText || <span className="text-[#B08A7A]">Tap a claim above to begin.</span>}{' '}
          {claim.length ? evidence : ''}
          {reasonText}
          {limitText}
          {notes ? ` ${notes}` : ''}
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Data Lab shell                                                     */
/* ------------------------------------------------------------------ */

export default function DataLab({
  readings,
  xVar,
  leafId,
  currentX,
  prediction,
  predictionPending,
  lastY,
  onPredict,
  onDelete,
  onClear,
  embedded = false,
}: Props) {
  const caps = useBandCaps()
  const inputMode = useInputMode()
  const verb = inputMode === 'touch' ? 'Tap' : inputMode === 'pointer' ? 'Click' : 'Choose a point'
  const [openState, setOpen] = useState(() => (typeof window === 'undefined' ? false : window.innerWidth > 1100))
  const open = embedded || openState
  const [tab, setTab] = useState<'graph' | 'table' | 'writeup'>('graph')

  // Feedback on the most recent committed prediction.
  const lastPredicted = useMemo(() => {
    for (let i = readings.length - 1; i >= 0; i--) {
      if (readings[i].predicted !== null) return readings[i]
    }
    return null
  }, [readings])
  const lastPredictedClose =
    lastPredicted !== null &&
    lastPredicted.predicted !== null &&
    Math.abs(lastPredicted.predicted - lastPredicted.y) <=
      Math.max(1.5, Math.abs(lastPredicted.y) * 0.15)

  function download() {
    const blob = new Blob([readingsToCsv(readings)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'rate-lab-results.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const tabBtn = (active: boolean) =>
    `flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-extrabold transition-all ${
      active ? 'bg-[#3E7C43] text-[#FBF5EA] shadow' : 'bg-[#F3E9D7] text-[#7A5252] hover:bg-[#EBDFC8]'
    }`

  return (
    <div
      className={
        embedded
          ? 'pointer-events-auto w-full'
          : 'pointer-events-auto w-full max-w-[27rem] rounded-[20px] border border-[#F3E9D7] bg-[#FBF5EA]/95 shadow-xl backdrop-blur-md'
      }
    >
      {!embedded && (
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-extrabold text-[#402222]">
          <LineChart className="h-4 w-4 text-[#3E7C43]" />
          Data lab
          <span className="rounded-full bg-[#EAF3E6] px-2 py-0.5 text-[10px] font-black text-[#2E7D32]">
            {readings.length} {readings.length === 1 ? 'trial' : 'trials'}
          </span>
          {predictionPending && (
            <span className="animate-pulse rounded-full bg-[#FBEBD2] px-2 py-0.5 text-[10px] font-black text-[#B97D10]">
              predict!
            </span>
          )}
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-[#7A5252]" />
        ) : (
          <ChevronUp className="h-4 w-4 shrink-0 text-[#7A5252]" />
        )}
      </button>
      )}

      {open && (
        <div className={embedded ? 'px-1 pb-2 pt-1' : 'max-h-[52dvh] overflow-y-auto px-4 pb-4'}>
          <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
            <button onClick={() => setTab('graph')} className={tabBtn(tab === 'graph')}>
              <LineChart className="h-3 w-3" /> Graph
            </button>
            {caps.dataTable && (
              <button onClick={() => setTab('table')} className={tabBtn(tab === 'table')}>
                <Table2 className="h-3 w-3" /> Results
              </button>
            )}
            {caps.conclusion && (
              <button onClick={() => setTab('writeup')} className={tabBtn(tab === 'writeup')}>
                <PenLine className="h-3 w-3" /> Write-up
              </button>
            )}
            <span className="grow" />
            {caps.exportData && readings.length > 0 && (
              <button
                onClick={download}
                title="Download results as CSV"
                className="flex items-center gap-1 rounded-full bg-[#F3E9D7] px-2 py-1 text-[10.5px] font-extrabold text-[#7A5252] hover:bg-[#EBDFC8]"
              >
                <Download className="h-3 w-3" /> CSV
              </button>
            )}
            {readings.length > 0 && (
              <button
                onClick={onClear}
                title="Clear all results"
                className="rounded-full bg-[#F3E9D7] p-1 text-[#B08A7A] hover:bg-[#F6DEDC] hover:text-[#C13B33]"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>

          {predictionPending && (
            <div className="mb-2 rounded-[12px] border border-[#F0DFC0] bg-[#FDF6E7] px-2.5 py-2">
              <div className="flex items-start gap-2">
                <Target className="mt-px h-3.5 w-3.5 shrink-0 text-[#B97D10]" />
                <p className="text-[11px] leading-snug font-bold text-[#8A6A32]">
                  {caps.prediction === 'point'
                    ? `${verb} on the graph where you think this trial will land. Committing to a number before you measure is the only honest way to find out whether you understand the mechanism — or are just describing a shape after the fact.`
                    : 'Guess first: will this reading be higher, lower, or about the same as your last one?'}
                </p>
              </div>
              {caps.prediction === 'direction' && lastY !== null && (
                <div className="mt-2 flex gap-1.5">
                  {[
                    { label: 'Higher', factor: 1.35 },
                    { label: 'About the same', factor: 1 },
                    { label: 'Lower', factor: 0.65 },
                  ].map((o) => (
                    <button
                      key={o.label}
                      onClick={() =>
                        onPredict(
                          Number(
                            (lastY === 0 ? (o.factor - 1) * 12 : lastY * o.factor).toFixed(1),
                          ),
                        )
                      }
                      className="rounded-full bg-[#FBEBD2] px-2.5 py-1 text-[10.5px] font-extrabold text-[#B97D10] transition-all hover:bg-[#F6DEB8] active:scale-95"
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'graph' && lastPredicted && (
            <div
              className="mb-2 rounded-[12px] border px-2.5 py-1.5"
              style={
                lastPredictedClose
                  ? { borderColor: '#DDEAD8', background: '#EAF3E6' }
                  : { borderColor: '#F0D9C0', background: '#FDF1E4' }
              }
            >
              <p className="text-[11px] leading-snug font-bold text-[#5C3A3A]">
                <strong>{lastPredictedClose ? 'Called it.' : 'Not quite.'}</strong> You predicted{' '}
                {lastPredicted.predicted?.toFixed(1)} and measured {lastPredicted.y.toFixed(1)}{' '}
                bubbles min⁻¹.
                {!lastPredictedClose &&
                  ' A prediction that misses is the most useful result you can get — something in your model of the leaf is wrong. Which factor did you underestimate?'}
              </p>
            </div>
          )}

          {tab === 'graph' && (
            <Graph
              readings={readings}
              xVar={xVar}
              leafId={leafId}
              currentX={currentX}
              prediction={prediction}
              predictionPending={predictionPending && caps.prediction === 'point'}
              onPredict={onPredict}
              showFit={caps.vocab === 'technical'}
            />
          )}

          {tab === 'table' && (
            <div className="overflow-x-auto">
              {readings.length === 0 ? (
                <p className="py-4 text-center text-[11.5px] font-bold text-[#B08A7A]">
                  No trials yet. Set your conditions, then run one.
                </p>
              ) : (
                <table className="w-full text-[10.5px]">
                  <thead>
                    <tr className="text-left text-[9px] font-black tracking-wider text-[#A08750] uppercase">
                      <th className="py-1 pr-1">#</th>
                      <th className="py-1 pr-1">Varying</th>
                      <th className="py-1 pr-1 text-right">x</th>
                      <th className="py-1 pr-1 text-right">Net O₂</th>
                      {caps.repeats && <th className="py-1 pr-1 text-right">±</th>}
                      {caps.repeats && <th className="py-1 pr-1">Repeats</th>}
                      <th className="py-1 pr-1">Leaf</th>
                      <th className="py-1" />
                    </tr>
                  </thead>
                  <tbody className="font-semibold text-[#5C3A3A]">
                    {readings.map((r, i) => (
                      <tr
                        key={r.id}
                        className={`border-t border-[#F0E6D2] ${r.anomalous ? 'bg-[#FDF0EE]' : ''}`}
                      >
                        <td className="py-1 pr-1 tabular-nums">{i + 1}</td>
                        <td className="py-1 pr-1">{VARS[r.xVar].label.split(' ')[0]}</td>
                        <td className="py-1 pr-1 text-right tabular-nums">
                          {VARS[r.xVar].format(r.x)}
                        </td>
                        <td className="py-1 pr-1 text-right font-black tabular-nums">
                          {r.y.toFixed(1)}
                          {r.anomalous && (
                            <TriangleAlert className="ml-0.5 inline h-2.5 w-2.5 text-[#C13B33]" />
                          )}
                        </td>
                        {caps.repeats && (
                          <td className="py-1 pr-1 text-right tabular-nums">
                            {r.uncertainty.toFixed(1)}
                          </td>
                        )}
                        {caps.repeats && (
                          <td className="py-1 pr-1 tabular-nums text-[9.5px]">
                            {r.repeats.join(', ')}
                          </td>
                        )}
                        <td className="py-1 pr-1">
                          {(LEAF_BY_ID[r.leafId]?.name ?? r.leafId).split(' ')[0]}
                        </td>
                        <td className="py-1 text-right">
                          <button
                            onClick={() => onDelete(r.id)}
                            aria-label={`Delete trial ${i + 1}`}
                            className="rounded p-0.5 text-[#C4AF95] hover:text-[#C13B33]"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {readings.some((r) => r.anomalous) && (
                <p className="mt-2 text-[10px] leading-snug font-bold text-[#C13B33]">
                  Highlighted rows contain a repeat far outside the others. Decide whether to
                  discard it — and say why in your write-up. Never delete a result just because it
                  is inconvenient.
                </p>
              )}
            </div>
          )}

          {tab === 'writeup' && <WriteUp readings={readings} xVar={xVar} />}
        </div>
      )}
    </div>
  )
}
