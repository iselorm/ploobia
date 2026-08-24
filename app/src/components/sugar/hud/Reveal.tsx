import { useEffect, useMemo, useRef } from 'react'
import { Target, X } from 'lucide-react'
import { Tile } from '@/components/ui/tile'
import { cn } from '@/lib/utils'
import {
  MEASURES,
  predictionClose,
  seriesFor,
  type SugarReading,
} from '@/lib/sugarline'
import { SUGAR_VARS } from '@/lib/sugarsim'
import { AtlasButton } from './AtlasKit'
import { Graph } from './DataPlate'

/**
 * What happened to your guess.
 *
 * The prediction marker used to live only on the graph in a tab a learner had
 * to go and find, which meant that for most of them the prediction was
 * something they set and never heard about again — and a prediction nobody
 * checks is not a prediction, it is a form field.
 *
 * So the graph comes to *them*, once, at the only moment it is interesting:
 * the instant the trial ends. The card shows the number they committed to, the
 * number that arrived, the gap between the two drawn as an actual length on
 * the axis, and — the part that makes an eleven-year-old want another go —
 * whether they are getting better at this.
 *
 * It dismisses itself. An overlay that has to be closed before the next action
 * is a modal, and this is a result, not a question.
 */

const LINGER_MS = 9000

function verdictFor(gap: number, y: number): { label: string; tone: 'good' | 'warn' | 'neutral'; line: string } {
  const relative = Math.abs(y) > 0.01 ? gap / Math.abs(y) : gap
  if (relative <= 0.06) return { label: 'Bullseye', tone: 'good', line: 'That is a real prediction, not a lucky one.' }
  if (relative <= 0.18) return { label: 'Close', tone: 'good', line: 'Near enough to say you understood what would happen.' }
  if (relative <= 0.45)
    return { label: 'Out a bit', tone: 'warn', line: 'The direction was the interesting part. Was it right?' }
  return {
    label: 'Way out',
    tone: 'neutral',
    line: 'Good. A prediction that misses badly is the one that teaches you something.',
  }
}

export default function Reveal({
  reading,
  readings,
  onClose,
  onSeeData,
  compact = false,
}: {
  reading: SugarReading
  readings: SugarReading[]
  onClose: () => void
  onSeeData: () => void
  compact?: boolean
}) {
  const meta = SUGAR_VARS[reading.xVar]
  const mm = MEASURES[reading.measure]
  const predicted = reading.predicted
  const series = useMemo(
    () => seriesFor(readings, reading.xVar, reading.measure),
    [readings, reading.xVar, reading.measure],
  )

  // Are they getting better? Compare this miss with the previous one on the
  // same instrument — improvement is the thing worth telling a learner about.
  const improvement = useMemo(() => {
    if (predicted === null) return null
    const priors = readings.filter(
      (r) => r.id !== reading.id && r.measure === reading.measure && r.predicted !== null,
    )
    if (!priors.length) return null
    const last = priors[priors.length - 1]
    const before = Math.abs((last.predicted as number) - last.y)
    const now = Math.abs(predicted - reading.y)
    if (before - now > Math.max(0.15, before * 0.12)) return { better: true, before, now }
    if (now - before > Math.max(0.15, now * 0.12)) return { better: false, before, now }
    return null
  }, [readings, reading, predicted])

  // The timer must key off the *reading*, not off `onClose`. An inline arrow
  // handler is a new function every render, so depending on it re-ran this
  // effect continuously and the card never dismissed itself.
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const t = window.setTimeout(() => closeRef.current(), LINGER_MS)
    return () => window.clearTimeout(t)
  }, [reading.id])

  const gap = predicted === null ? 0 : Math.abs(predicted - reading.y)
  const verdict = predicted === null ? null : verdictFor(gap, reading.y)
  const close = predicted !== null && predictionClose(predicted, reading.y)

  return (
    <div
      data-testid="reveal"
      role="status"
      className={cn(
        'atlas-plate atlas-arrive pointer-events-auto p-3',
        compact ? 'w-full' : 'w-[19rem]',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="atlas-eyebrow">
            Reading {series.length} ·{' '}
            <span className="normal-case">
              {meta.format(reading.x)} {meta.chipUnit}
            </span>
          </span>
          <p className="atlas-serif mt-0.5 text-[15px] leading-tight font-semibold text-[#2A2823]">
            {mm.label}
          </p>
        </div>
        <Tile onClick={onClose} aria-label="Dismiss the result" className="rounded-full p-1 text-[#B3AB97] hover:text-[#2A2823]">
          <X className="h-3.5 w-3.5" />
        </Tile>
      </div>

      {predicted === null ? (
        <p className="mt-1.5 text-[11.5px] leading-snug font-semibold text-[#8B8471]">
          Recorded {reading.y.toFixed(mm.decimals)} {mm.unit}. Next time, set a prediction first — the
          measurement is far more interesting when you have something riding on it.
        </p>
      ) : (
        <>
          <div className="mt-2 flex items-end gap-3">
            <div>
              <span className="block text-[10px] font-extrabold tracking-[0.09em] text-[#2E6DA8] uppercase">
                You said
              </span>
              <span className="block text-[19px] leading-tight font-black text-[#2E6DA8] tabular-nums">
                {predicted.toFixed(mm.decimals)}
              </span>
            </div>
            <span className="pb-1 text-[13px] font-black text-[#C6BDA6]">→</span>
            <div>
              <span className="block text-[10px] font-extrabold tracking-[0.09em] text-[#8A5A0B] uppercase">
                It was
              </span>
              <span className="block text-[19px] leading-tight font-black text-[#8A5A0B] tabular-nums">
                {reading.y.toFixed(mm.decimals)}
                <span className="ml-1 text-[10px] font-bold text-[#9A9482]">{mm.unit}</span>
              </span>
            </div>
            <span
              className={cn(
                'mb-1 ml-auto flex items-center gap-1 rounded-full px-2 py-1 text-[10.5px] font-extrabold',
                verdict!.tone === 'good'
                  ? 'bg-[#DCEBD6] text-[#2C5C31]'
                  : verdict!.tone === 'warn'
                    ? 'bg-[#FBF0D8] text-[#8A5A0B]'
                    : 'bg-[#EFEADC] text-[#8B8471]',
              )}
            >
              {close && <Target className="h-3 w-3" />}
              {verdict!.label}
            </span>
          </div>

          <div className="mt-1.5 -ml-1">
            <Graph
              series={series}
              xVar={reading.xVar}
              measure={reading.measure}
              prediction={predicted}
              currentX={reading.x}
              showUncertainty={false}
              showFit={false}
              landing={reading}
            />
          </div>

          <p className="text-[11px] leading-snug font-semibold text-[#8B8471]">
            You were out by {gap.toFixed(mm.decimals)} {mm.unit}. {verdict!.line}
          </p>
          {improvement && (
            <p
              className={cn(
                'mt-1 rounded-lg px-2 py-1 text-[11px] leading-snug font-extrabold',
                improvement.better ? 'bg-[#DCEBD6] text-[#2C5C31]' : 'bg-[#F3EEE0] text-[#8B8471]',
              )}
            >
              {improvement.better
                ? `Getting closer — last time you were out by ${improvement.before.toFixed(mm.decimals)}.`
                : `Further off than last time (${improvement.before.toFixed(mm.decimals)}). What changed?`}
            </p>
          )}
        </>
      )}

      <div className="mt-2 flex gap-1.5">
        <AtlasButton onClick={onClose} tone="primary" ariaLabel="Keep going" className="flex-1">
          Keep going
        </AtlasButton>
        <AtlasButton onClick={onSeeData} ariaLabel="See all the data">
          See the data
        </AtlasButton>
      </div>
    </div>
  )
}
