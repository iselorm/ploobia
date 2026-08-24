import { useMemo, useState } from 'react'
import { Download, LineChart, Table2, Trash2 } from 'lucide-react'
import { Tile } from '@/components/ui/tile'
import { cn } from '@/lib/utils'
import type { BandCaps } from '@/lib/bands'
import {
  MEASURES,
  readingsToCsv,
  seriesFor,
  type MeasureId,
  type SugarReading,
  type SugarVarId,
} from '@/lib/sugarline'
import { SUGAR_VARS } from '@/lib/sugarsim'
import { AtlasButton, Chip, Plate, Rule } from './AtlasKit'

/**
 * The learner's own data.
 *
 * Two layers, kept strictly apart, which is the platform's standing rule:
 * *telemetry* is the live gauge on the instrument plate and is ephemeral;
 * *data* is what has been deliberately recorded, and only recorded data can
 * complete a mission or go into a conclusion.
 */

/* ------------------------------------------------------------------ */
/* Graph                                                              */
/* ------------------------------------------------------------------ */

const W = 268
const H = 150
const PAD_L = 34
const PAD_B = 26
const PAD_T = 10
const PAD_R = 8

function Graph({
  series,
  xVar,
  measure,
  prediction,
  currentX,
  showUncertainty,
  showFit,
}: {
  series: SugarReading[]
  xVar: SugarVarId
  measure: MeasureId
  prediction: number | null
  currentX: number
  showUncertainty: boolean
  showFit: boolean
}) {
  const meta = SUGAR_VARS[xVar]
  const mm = MEASURES[measure]
  const yMax = Math.max(
    1,
    ...series.map((r) => r.y + r.uncertainty),
    prediction ?? 0,
  )
  const yMin = Math.min(0, ...series.map((r) => r.y - r.uncertainty))
  const sx = (x: number) => PAD_L + ((x - meta.min) / (meta.max - meta.min)) * (W - PAD_L - PAD_R)
  const sy = (y: number) => H - PAD_B - ((y - yMin) / (yMax - yMin || 1)) * (H - PAD_B - PAD_T)

  // A least-squares line, offered only where a band asks the learner to fit one.
  const fit = useMemo(() => {
    if (!showFit || series.length < 3) return null
    const n = series.length
    const mx = series.reduce((a, r) => a + r.x, 0) / n
    const my = series.reduce((a, r) => a + r.y, 0) / n
    let num = 0
    let den = 0
    series.forEach((r) => {
      num += (r.x - mx) * (r.y - my)
      den += (r.x - mx) ** 2
    })
    if (den === 0) return null
    const m = num / den
    return { m, c: my - m * mx }
  }, [series, showFit])

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`${mm.label} against ${meta.label}`}
    >
      {/* Grid. */}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <line
          key={t}
          x1={PAD_L}
          x2={W - PAD_R}
          y1={PAD_T + t * (H - PAD_B - PAD_T)}
          y2={PAD_T + t * (H - PAD_B - PAD_T)}
          stroke="#EDE6D5"
          strokeWidth={1}
        />
      ))}
      <line x1={PAD_L} x2={W - PAD_R} y1={sy(0)} y2={sy(0)} stroke="#CFC6AE" strokeWidth={1.2} />
      <line x1={PAD_L} x2={PAD_L} y1={PAD_T} y2={H - PAD_B} stroke="#CFC6AE" strokeWidth={1.2} />

      {/* Where the controls are sitting right now. */}
      <line
        x1={sx(currentX)}
        x2={sx(currentX)}
        y1={PAD_T}
        y2={H - PAD_B}
        stroke="#3E7C43"
        strokeWidth={1}
        strokeDasharray="3 3"
        opacity={0.55}
      />

      {fit && (
        <line
          x1={sx(meta.min)}
          y1={sy(fit.m * meta.min + fit.c)}
          x2={sx(meta.max)}
          y2={sy(fit.m * meta.max + fit.c)}
          stroke="#2E6DA8"
          strokeWidth={1.4}
          opacity={0.75}
        />
      )}

      {/* Joining line, so a curve reads as a curve. */}
      {series.length > 1 && (
        <polyline
          fill="none"
          stroke="#D99B2B"
          strokeWidth={1.6}
          strokeLinejoin="round"
          points={series.map((r) => `${sx(r.x)},${sy(r.y)}`).join(' ')}
        />
      )}

      {series.map((r) => (
        <g key={r.id}>
          {showUncertainty && r.uncertainty > 0 && (
            <line
              x1={sx(r.x)}
              x2={sx(r.x)}
              y1={sy(r.y - r.uncertainty)}
              y2={sy(r.y + r.uncertainty)}
              stroke="#8A5A0B"
              strokeWidth={1.1}
              opacity={0.7}
            />
          )}
          <circle
            cx={sx(r.x)}
            cy={sy(r.y)}
            r={r.anomalous ? 4.6 : 3.4}
            fill={r.anomalous ? '#FBEEEC' : '#D99B2B'}
            stroke={r.anomalous ? '#C13B33' : '#8A5A0B'}
            strokeWidth={1.2}
          />
        </g>
      ))}

      {prediction !== null && (
        <g>
          <line
            x1={sx(currentX) - 8}
            x2={sx(currentX) + 8}
            y1={sy(prediction)}
            y2={sy(prediction)}
            stroke="#2E6DA8"
            strokeWidth={2}
          />
          <text x={sx(currentX) + 11} y={sy(prediction) + 3} fontSize={8} fill="#2E6DA8" fontWeight={700}>
            you
          </text>
        </g>
      )}

      <text x={PAD_L} y={H - 6} fontSize={8} fill="#8B8471" fontWeight={700}>
        {meta.min}
      </text>
      <text x={W - PAD_R} y={H - 6} fontSize={8} fill="#8B8471" fontWeight={700} textAnchor="end">
        {meta.max} {meta.chipUnit}
      </text>
      <text x={4} y={PAD_T + 8} fontSize={8} fill="#8B8471" fontWeight={700}>
        {yMax.toFixed(mm.decimals)}
      </text>
      <text x={4} y={H - PAD_B} fontSize={8} fill="#8B8471" fontWeight={700}>
        {yMin.toFixed(mm.decimals)}
      </text>
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Conclusion builder                                                 */
/* ------------------------------------------------------------------ */

const CLAIMS = [
  'raising it increased the sugar export rate',
  'raising it increased the rate at first and then levelled off',
  'raising it made no difference at all',
  'raising it reduced the sugar export rate',
]
const REASONS = [
  'it was the factor in shortest supply, so more of it let every later stage run faster',
  'something further down the line — loading, the pipe or the sinks — had become the constraint instead',
  'it pushed the plant past its optimum and the enzymes started to fail',
]
const LIMITS = [
  'only one specimen was tested',
  'the readings were single, not repeated',
  'the plant clock runs far faster than a real plant',
  'the other conditions drifted a little between trials',
]

function ConclusionBuilder({
  onDone,
  variable,
}: {
  onDone: (c: { claim: string; reason: string; limits: string[] }) => void
  variable: string
}) {
  const [claim, setClaim] = useState<number | null>(null)
  const [reason, setReason] = useState<number | null>(null)
  const [limits, setLimits] = useState<number[]>([])
  const [done, setDone] = useState(false)

  const toggleLimit = (i: number) =>
    setLimits((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))

  const ready = claim !== null && reason !== null && limits.length > 0

  /**
   * The sentence assembles live as the tiles are chosen rather than appearing
   * only after a submit. Seeing it build is most of the teaching — a claim,
   * a because, and an honest limitation are three separate moves, and watching
   * them join up is what makes that structure stick.
   */
  const sentence = ready || done ? (
      <div
        data-testid="conclusion"
        className="rounded-xl border border-[#C8DFC2] bg-[#EFF6EC] p-2.5"
      >
        <p className="text-[11.5px] leading-relaxed font-semibold text-[#2F6134]">
          <strong>
            When {variable} was changed, {CLAIMS[claim ?? 0]}
          </strong>
          , because {REASONS[reason ?? 0]}. Limitations: {limits.map((i) => LIMITS[i]).join(', and ')}.
        </p>
      </div>
    ) : null

  if (done) return sentence

  return (
    <div className="space-y-1.5">
      <span className="atlas-eyebrow">Claim</span>
      <div role="group" aria-label="Claim" className="flex flex-col gap-1">
        {CLAIMS.map((c, i) => (
          <Tile
            key={c}
            onClick={() => setClaim(i)}
            aria-pressed={claim === i}
            className={cn(
              'rounded-lg border px-2 py-1.5 text-left text-[11px] font-semibold transition-all',
              claim === i
                ? 'border-[#3E7C43] bg-[#E7F1E3] text-[#2F6134]'
                : 'border-[#E4DCC9] bg-[#FCFAF4] text-[#5F5A4E] hover:bg-[#F3EEE0]',
            )}
          >
            {c}
          </Tile>
        ))}
      </div>

      <span className="atlas-eyebrow">Reasoning</span>
      <div role="group" aria-label="Reasoning" className="flex flex-col gap-1">
        {REASONS.map((r, i) => (
          <Tile
            key={r}
            onClick={() => setReason(i)}
            aria-pressed={reason === i}
            className={cn(
              'rounded-lg border px-2 py-1.5 text-left text-[11px] font-semibold transition-all',
              reason === i
                ? 'border-[#3E7C43] bg-[#E7F1E3] text-[#2F6134]'
                : 'border-[#E4DCC9] bg-[#FCFAF4] text-[#5F5A4E] hover:bg-[#F3EEE0]',
            )}
          >
            {r}
          </Tile>
        ))}
      </div>

      <span className="atlas-eyebrow">Limitations</span>
      <div role="group" aria-label="Limitations" className="flex flex-wrap gap-1">
        {LIMITS.map((l, i) => (
          <Tile
            key={l}
            onClick={() => toggleLimit(i)}
            aria-pressed={limits.includes(i)}
            className={cn(
              'rounded-full border px-2 py-1 text-[10.5px] font-bold transition-all',
              limits.includes(i)
                ? 'border-[#3E7C43] bg-[#E7F1E3] text-[#2F6134]'
                : 'border-[#E4DCC9] bg-[#FCFAF4] text-[#8B8471] hover:bg-[#F3EEE0]',
            )}
          >
            {l}
          </Tile>
        ))}
      </div>

      {sentence}
      <AtlasButton
        tone="primary"
        disabled={!ready}
        onClick={() => {
          setDone(true)
          onDone({
            claim: CLAIMS[claim ?? 0],
            reason: REASONS[reason ?? 0],
            limits: limits.map((i) => LIMITS[i]),
          })
        }}
        ariaLabel="Submit the write-up"
        className="w-full"
      >
        Finish the write-up
      </AtlasButton>
    </div>
  )
}

/* ------------------------------------------------------------------ */

export default function DataPlate({
  readings,
  xVar,
  measure,
  currentX,
  prediction,
  caps,
  onDelete,
  onClear,
  onWriteup,
  embedded = false,
}: {
  readings: SugarReading[]
  xVar: SugarVarId
  measure: MeasureId
  currentX: number
  prediction: number | null
  caps: BandCaps
  onDelete: (id: number) => void
  onClear: () => void
  onWriteup: (c: { claim: string; reason: string; limits: string[] }) => void
  embedded?: boolean
}) {
  const [tab, setTab] = useState<'graph' | 'table' | 'writeup'>('graph')
  const series = useMemo(() => seriesFor(readings, xVar, measure), [readings, xVar, measure])
  const meta = MEASURES[measure]

  const download = () => {
    const csv = readingsToCsv(readings, SUGAR_VARS)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sugar-line-readings.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Plate
      eyebrow="Your data"
      icon={<LineChart className="h-3 w-3" />}
      className={embedded ? '' : 'w-full'}
      action={
        <div className="flex items-center gap-1">
          <Chip>{readings.length} recorded</Chip>
          {caps.exportData && readings.length > 0 && (
            <Tile onClick={download} aria-label="Download the data as CSV" className="rounded-full p-1 text-[#8B8471] hover:text-[#2F6134]">
              <Download className="h-3.5 w-3.5" />
            </Tile>
          )}
          {readings.length > 0 && (
            <Tile onClick={onClear} aria-label="Clear the table" className="rounded-full p-1 text-[#8B8471] hover:text-[#9A302A]">
              <Trash2 className="h-3.5 w-3.5" />
            </Tile>
          )}
        </div>
      }
    >
      <div role="group" aria-label="Data view" className="mb-2 flex gap-1">
        {(
          [
            ['graph', 'Graph', <LineChart key="g" className="h-3 w-3" />],
            ...(caps.dataTable ? [['table', 'Table', <Table2 key="t" className="h-3 w-3" />] as const] : []),
            ...(caps.conclusion ? [['writeup', 'Write-up', null] as const] : []),
          ] as Array<[string, string, React.ReactNode]>
        ).map(([id, label, icon]) => (
          <Tile
            key={id}
            onClick={() => setTab(id as 'graph' | 'table' | 'writeup')}
            aria-pressed={tab === id}
            className={cn(
              'flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-extrabold transition-all',
              tab === id
                ? 'border-[#3E7C43] bg-[#E7F1E3] text-[#2F6134]'
                : 'border-[#E4DCC9] bg-[#FCFAF4] text-[#8B8471] hover:bg-[#F3EEE0]',
            )}
          >
            {icon}
            {label}
          </Tile>
        ))}
      </div>

      {tab === 'graph' && (
        <>
          {series.length === 0 ? (
            <p className="py-4 text-center text-[11.5px] leading-snug font-semibold text-[#9A9482]">
              Nothing recorded yet for {meta.label.toLowerCase()} against {SUGAR_VARS[xVar].label.toLowerCase()}.
              <br />
              Set the conditions, predict, then run a measurement.
            </p>
          ) : (
            <Graph
              series={series}
              xVar={xVar}
              measure={measure}
              prediction={prediction}
              currentX={currentX}
              showUncertainty={caps.uncertainty}
              showFit={caps.learnerPlotsGraph}
            />
          )}
          <p className="mt-1 text-center text-[10px] font-bold text-[#9A9482]">{meta.axis}</p>
        </>
      )}

      {tab === 'table' && (
        <div className="max-h-[13rem] overflow-y-auto">
          <table className="w-full text-left text-[10.5px]">
            <thead className="sticky top-0 bg-[#FCFAF4]">
              <tr className="text-[#8B8471]">
                <th className="py-1 font-bold">{SUGAR_VARS[xVar].chipUnit}</th>
                <th className="py-1 font-bold">{meta.unit}</th>
                {caps.uncertainty && <th className="py-1 font-bold">±</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {series.map((r) => (
                <tr key={r.id} className="border-t border-[#EDE6D5]">
                  <td className="py-1 font-extrabold tabular-nums text-[#4A4438]">{r.x.toFixed(0)}</td>
                  <td className="py-1 font-extrabold tabular-nums text-[#8A5A0B]">
                    {r.y.toFixed(meta.decimals)}
                    {r.anomalous && <span className="ml-1 text-[#C13B33]">!</span>}
                  </td>
                  {caps.uncertainty && (
                    <td className="py-1 tabular-nums text-[#8B8471]">{r.uncertainty.toFixed(2)}</td>
                  )}
                  <td className="py-1 text-right">
                    <Tile
                      onClick={() => onDelete(r.id)}
                      aria-label={`Delete reading ${r.id}`}
                      className="rounded px-1 text-[#C0B79E] hover:text-[#9A302A]"
                    >
                      ×
                    </Tile>
                  </td>
                </tr>
              ))}
              {series.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-3 text-center font-semibold text-[#9A9482]">
                    No readings yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'writeup' && (
        <>
          <Rule className="mt-0" />
          <ConclusionBuilder variable={SUGAR_VARS[xVar].label.toLowerCase()} onDone={onWriteup} />
        </>
      )}
    </Plate>
  )
}
