import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Download, LineChart, Trash2, X } from 'lucide-react'
import { Tile } from '@/components/ui/tile'
import { useBand, useBandCaps } from '@/lib/bands'
import { logEvent } from '@/lib/events'
import { GRIP_MAX, gripScale, MAX_Z, type GripReading } from '@/lib/atoms'

/**
 * The evidence half of the foundry: every probe reading lands here, plotted
 * against atomic number. With enough points the sawtooth appears — the climb
 * across each row, the collapse after each noble gas.
 */

interface Props {
  readings: GripReading[]
  onDelete: (id: number) => void
  onClear: () => void
  embedded?: boolean
}

const W = 296
const H = 168
const PAD_L = 34
const PAD_B = 22
const PAD_T = 10
const PAD_R = 8

const PERIOD_TINT: Record<number, string> = { 1: '#C97F1F', 2: '#3E7C43', 3: '#2E6DA8', 4: '#8A5FA8' }
const NOBLES = [
  { z: 2, label: 'He' },
  { z: 10, label: 'Ne' },
  { z: 18, label: 'Ar' },
]

function GripGraph({ readings, friendly }: { readings: GripReading[]; friendly: boolean }) {
  const x = (z: number) => PAD_L + ((z - 0) / (MAX_Z + 1)) * (W - PAD_L - PAD_R)
  const y = (v: number) => H - PAD_B - (Math.min(v, GRIP_MAX) / GRIP_MAX) * (H - PAD_B - PAD_T)
  const sorted = useMemo(() => {
    const best = new Map<number, GripReading>()
    readings.forEach((r) => best.set(r.z, r))
    return [...best.values()].sort((a, b) => a.z - b.z)
  }, [readings])
  const path = sorted.length >= 2 ? sorted.map((r, i) => `${i === 0 ? 'M' : 'L'}${x(r.z).toFixed(1)},${y(r.y).toFixed(1)}`).join(' ') : null

  const yTicks = friendly ? [0, 5, 10] : [0, 500, 1000, 1500, 2000, 2500]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Grip against atomic number">
      {/* axes */}
      <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="#D9C9AE" strokeWidth="1" />
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="#D9C9AE" strokeWidth="1" />
      {yTicks.map((v) => {
        const yy = friendly ? y((v / 10) * GRIP_MAX) : y(v)
        return (
          <g key={v}>
            <line x1={PAD_L} y1={yy} x2={W - PAD_R} y2={yy} stroke="#EFE4CE" strokeWidth="0.7" />
            <text x={PAD_L - 4} y={yy + 3} textAnchor="end" fontSize="7.5" fontWeight="800" fill="#A08A6E">
              {v}
            </text>
          </g>
        )
      })}
      {[1, 5, 10, 15, 20].map((z) => (
        <text key={z} x={x(z)} y={H - PAD_B + 10} textAnchor="middle" fontSize="7.5" fontWeight="800" fill="#A08A6E">
          {z}
        </text>
      ))}
      {/* noble-gas cliff markers */}
      {NOBLES.map((n) => (
        <g key={n.z}>
          <line x1={x(n.z)} y1={PAD_T} x2={x(n.z)} y2={H - PAD_B} stroke="#4C7FB5" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.45" />
          <text x={x(n.z)} y={PAD_T + 7} textAnchor="middle" fontSize="7" fontWeight="800" fill="#4C7FB5" opacity="0.8">
            {n.label}
          </text>
        </g>
      ))}
      {/* the learner's curve */}
      {path && <path d={path} fill="none" stroke="#B97D10" strokeWidth="1.6" opacity="0.7" />}
      {/* predictions as hollow diamonds */}
      {readings
        .filter((r) => r.predicted !== null)
        .map((r) => (
          <path key={`p-${r.id}`} d={`M${x(r.z)},${y(r.predicted!) - 4} l4,4 l-4,4 l-4,-4 Z`} fill="none" stroke="#7A5252" strokeWidth="1.2" opacity="0.8" />
        ))}
      {/* points */}
      {readings.map((r) => (
        <circle key={r.id} cx={x(r.z)} cy={y(r.y)} r="3.2" fill={PERIOD_TINT[r.period] ?? '#B97D10'} stroke="#FBF5EA" strokeWidth="1" />
      ))}
      <text x={W / 2} y={H - 1} textAnchor="middle" fontSize="7.5" fontWeight="800" fill="#7A5252">
        atomic number Z (protons)
      </text>
      <text x={9} y={H / 2} textAnchor="middle" fontSize="7.5" fontWeight="800" fill="#7A5252" transform={`rotate(-90 9 ${H / 2})`}>
        {friendly ? 'grip (0–10)' : 'grip / kJ·mol⁻¹'}
      </text>
    </svg>
  )
}

const CLAIMS = [
  'grip climbs across a row, then collapses after each noble gas',
  'grip climbs steadily from hydrogen to calcium',
  'grip is random — there is no pattern',
]
const REASONS = [
  'each new row starts a new shell: its first electron sits far out and is easy to remove',
  'heavier atoms always hold electrons more tightly',
  'the probe is unreliable, so any shape can appear',
]
const LIMITATIONS = ['only 20 elements measured', 'one reading per element (no repeats)', 'the probe adds noise to every reading', 'boron and oxygen sit below the simple-model line']

function ConclusionBuilder({ readings }: { readings: GripReading[] }) {
  const [band] = useBand()
  const [claim, setClaim] = useState<number | null>(null)
  const [reason, setReason] = useState<number | null>(null)
  const [limits, setLimits] = useState<Set<number>>(new Set())
  const [sent, setSent] = useState(false)
  const enough = new Set(readings.map((r) => r.z)).size >= 5
  if (!enough) return <p className="px-1 text-[11px] font-semibold text-[#B08A7A]">Record five different elements to unlock the write-up.</p>
  if (sent) return <p className="px-1 text-[11.5px] font-bold text-[#2E7D32]">Write-up recorded. The strongest conclusions name their own limitations — you just did.</p>
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10.5px] font-black tracking-wide text-[#7A5252] uppercase">Claim</span>
      {CLAIMS.map((c, i) => (
        <button key={c} onClick={() => setClaim(i)} className={`rounded-[10px] px-2 py-1.5 text-left text-[11px] leading-snug font-bold transition-colors ${claim === i ? 'bg-[#FBEBD2] text-[#7A5E1E]' : 'bg-white/60 text-[#5C3A3A] hover:bg-[#F3E9D7]'}`}>
          {c}
        </button>
      ))}
      <span className="mt-1 text-[10.5px] font-black tracking-wide text-[#7A5252] uppercase">Because…</span>
      {REASONS.map((r, i) => (
        <button key={r} onClick={() => setReason(i)} className={`rounded-[10px] px-2 py-1.5 text-left text-[11px] leading-snug font-bold transition-colors ${reason === i ? 'bg-[#FBEBD2] text-[#7A5E1E]' : 'bg-white/60 text-[#5C3A3A] hover:bg-[#F3E9D7]'}`}>
          {r}
        </button>
      ))}
      <span className="mt-1 text-[10.5px] font-black tracking-wide text-[#7A5252] uppercase">Limitations (pick honestly)</span>
      <div className="flex flex-wrap gap-1">
        {LIMITATIONS.map((l, i) => (
          <button
            key={l}
            onClick={() =>
              setLimits((prev) => {
                const next = new Set(prev)
                if (next.has(i)) next.delete(i)
                else next.add(i)
                return next
              })
            }
            className={`rounded-full px-2 py-1 text-[10px] font-extrabold transition-colors ${limits.has(i) ? 'bg-[#B97D10] text-white' : 'bg-white/60 text-[#7A5252] hover:bg-[#F3E9D7]'}`}
          >
            {l}
          </button>
        ))}
      </div>
      <button
        disabled={claim === null || reason === null}
        onClick={() => {
          logEvent('atoms', band, 'writeup.completed', {
            variable: 'grip',
            claim: CLAIMS[claim!],
            reason: REASONS[reason!],
            limitations: [...limits].map((i) => LIMITATIONS[i]),
            ownWords: false,
          })
          setSent(true)
        }}
        className="mt-1 rounded-full bg-[#B97D10] px-4 py-2 text-[12px] font-extrabold text-white transition-all hover:bg-[#95650C] active:scale-[0.97] disabled:bg-[#F3E9D7] disabled:text-[#B08A7A]"
      >
        Record my conclusion
      </button>
    </div>
  )
}

export default function AtomDataLab({ readings, onDelete, onClear, embedded = false }: Props) {
  const caps = useBandCaps()
  const [openState, setOpen] = useState(true)
  const open = embedded || openState

  const exportCsv = () => {
    const rows = [['element', 'Z', 'period', 'outer_electrons', 'grip_kJ_per_mol', 'predicted_kJ_per_mol'], ...readings.map((r) => [r.symbol, r.z, r.period, r.outer, r.y, r.predicted ?? ''])]
    const csv = rows.map((r) => r.join(',')).join('\n')
    const a = document.createElement('a')
    a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`
    a.download = 'atom-foundry-grip.csv'
    a.click()
  }

  return (
    <div className={embedded ? 'pointer-events-auto flex w-full flex-col py-1' : 'pointer-events-auto flex max-h-full w-full max-w-[21rem] flex-col rounded-[20px] border border-[#F3E9D7] bg-[#FBF5EA]/95 shadow-xl backdrop-blur-md'}>
      {!embedded && (
        <button onClick={() => setOpen((o) => !o)} className="flex w-full shrink-0 items-center justify-between gap-2 px-4 py-3 text-left" aria-expanded={open}>
          <span className="flex items-center gap-2 text-sm font-extrabold text-[#402222]">
            <LineChart className="h-4 w-4 text-[#B97D10]" />
            Data lab
            {readings.length > 0 && <span className="rounded-full bg-[#EAF3E6] px-2 py-0.5 text-[10px] font-black text-[#2E7D32] tabular-nums">{readings.length}</span>}
          </span>
          {open ? <ChevronUp className="h-4 w-4 text-[#7A5252]" /> : <ChevronDown className="h-4 w-4 text-[#7A5252]" />}
        </button>
      )}
      {open && (
        <div className={`min-h-0 overflow-y-auto ${embedded ? '' : 'px-3 pb-3'}`}>
          {readings.length === 0 ? (
            <p className="px-1 py-2 text-[12px] leading-snug font-semibold text-[#B08A7A]">
              No readings yet. Build a neutral atom and fire the grip probe — every reading becomes a point here, plotted against the proton count.
            </p>
          ) : (
            <>
              <div className="rounded-[14px] border border-[#F3E9D7] bg-white/60 p-1.5">
                <GripGraph readings={readings} friendly={!caps.quantitative} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1 text-[9.5px] font-bold text-[#A08A6E]">
                <span>rows:</span>
                {Object.entries(PERIOD_TINT).map(([p, c]) => (
                  <span key={p} className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: c }} />
                    {p}
                  </span>
                ))}
                <span className="ml-auto">◇ = your prediction</span>
              </div>
              {caps.dataTable && (
                <table className="mt-2 w-full text-[11px]">
                  <thead>
                    <tr className="text-left text-[9.5px] font-black tracking-wide text-[#A08A6E] uppercase">
                      <th className="px-1 py-0.5">El</th>
                      <th className="px-1 py-0.5">Z</th>
                      <th className="px-1 py-0.5">{caps.quantitative ? 'grip kJ/mol' : 'grip'}</th>
                      <th className="px-1 py-0.5">called</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {[...readings].reverse().map((r) => (
                      <tr key={r.id} className="border-t border-[#F3E9D7] font-bold text-[#5C3A3A]">
                        <td className="px-1 py-1">{r.symbol}</td>
                        <td className="px-1 py-1 tabular-nums">{r.z}</td>
                        <td className="px-1 py-1 tabular-nums">{caps.quantitative ? r.y : `${gripScale(r.y)}/10`}</td>
                        <td className="px-1 py-1 tabular-nums">{r.predicted ?? '—'}</td>
                        <td className="px-1 py-1 text-right">
                          <button onClick={() => onDelete(r.id)} aria-label={`Delete ${r.symbol} reading`} className="rounded-full p-1 text-[#B08A7A] transition-colors hover:bg-[#F3E9D7] hover:text-[#C13B33]">
                            <X className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="mt-1.5 flex items-center gap-1.5">
                {caps.exportData && (
                  <Tile aria-label="Download readings as CSV" onClick={exportCsv} className="flex items-center gap-1 rounded-full bg-[#F3E9D7] px-2.5 py-1 text-[10.5px] font-extrabold text-[#7A5252] transition-colors hover:bg-[#EBDFC8]">
                    <Download className="h-3 w-3" />
                    CSV
                  </Tile>
                )}
                <Tile aria-label="Clear all readings" onClick={onClear} className="flex items-center gap-1 rounded-full bg-[#F3E9D7] px-2.5 py-1 text-[10.5px] font-extrabold text-[#7A5252] transition-colors hover:bg-[#EBDFC8]">
                  <Trash2 className="h-3 w-3" />
                  Clear
                </Tile>
              </div>
              {caps.conclusion && (
                <div className="mt-2 border-t border-[#F3E9D7] pt-2">
                  <ConclusionBuilder readings={readings} />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
