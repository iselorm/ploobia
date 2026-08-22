import { useMemo } from 'react'
import { LineChart, Trash2 } from 'lucide-react'
import { Tile } from '@/components/ui/tile'
import { useBandCaps } from '@/lib/bands'
import {
  bankfullQ,
  GAUGE_S,
  STATION_BY_ID,
  STATIONS,
  type HydroSample,
  type RiverReading,
  type StormLog,
} from '@/lib/river'

interface Props {
  readings: RiverReading[]
  hydro: HydroSample[]
  storms: StormLog[]
  basin: string
  pebbleSizeMm: number
  pebbleV: number
  onDelete: (id: number) => void
  onClear: () => void
  onComputeDischarge: (station: 'st1' | 'st2' | 'st3') => void
  embedded?: boolean
}

const KIND_LABEL: Record<string, string> = {
  width: 'Width',
  section: 'Cross-section',
  velocity: 'Velocity',
  discharge: 'Discharge',
  gradient: 'Gradient',
  pebble: 'Pebble',
  hydro: 'Storm peak',
}

/* ------------------------------------------------------------------ */
/* Hydrograph — the flood as telemetry                                 */
/* ------------------------------------------------------------------ */

function Hydrograph({ hydro, basin }: { hydro: HydroSample[]; basin: string }) {
  const W = 252
  const H = 110
  const window_ = 110
  const now = hydro.length ? hydro[hydro.length - 1].t : 0
  const t0 = now - window_
  const pts = hydro.filter((h) => h.t >= t0)
  const qbf = bankfullQ(GAUGE_S, basin as 'temperate')
  const qMax = Math.max(qbf * 1.4, ...pts.map((p) => p.q * 1.15), 1)
  const x = (t: number) => ((t - t0) / window_) * W
  const y = (q: number) => H - (q / qMax) * (H - 14)
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.q).toFixed(1)}`).join('')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl border border-[#EFE3CE] bg-[#FFFDF7]">
      {/* rain from the top */}
      {pts.map((p, i) =>
        p.rain > 0.02 ? <rect key={i} x={x(p.t) - 1} y={0} width={2.2} height={p.rain * 26} fill="#7FB4D8" opacity={0.8} /> : null,
      )}
      {/* bankfull */}
      <line x1={0} x2={W} y1={y(qbf)} y2={y(qbf)} stroke="#C13B33" strokeDasharray="5 4" strokeWidth={1.4} />
      <text x={W - 4} y={y(qbf) - 3} textAnchor="end" fontSize={8.5} fontWeight={800} fill="#C13B33">
        bankfull
      </text>
      <path d={path} fill="none" stroke="#2E6DA8" strokeWidth={2.2} strokeLinejoin="round" />
      <text x={4} y={H - 4} fontSize={8.5} fontWeight={800} fill="#B08A7A">
        discharge at the gauge · last {window_} s
      </text>
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Velocity downstream — the Bradshaw payoff from the learner's data   */
/* ------------------------------------------------------------------ */

function VelocityChart({ readings }: { readings: RiverReading[] }) {
  const byStation = STATIONS.map((st) => {
    const vs = readings.filter((r) => r.kind === 'velocity' && r.station === st.id)
    return { st, v: vs.length ? vs.reduce((a, r) => a + r.value, 0) / vs.length : null }
  })
  if (!byStation.some((b) => b.v !== null)) return null
  const W = 252
  const H = 96
  const vMax = Math.max(1, ...byStation.map((b) => b.v ?? 0)) * 1.25
  const x = (s: number) => 18 + (s / 120) * (W - 30)
  const y = (v: number) => H - 16 - (v / vMax) * (H - 34)
  const pts = byStation.filter((b) => b.v !== null)
  const path = pts.map((b, i) => `${i ? 'L' : 'M'}${x(b.st.s)},${y(b.v!)}`).join('')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl border border-[#EFE3CE] bg-[#FFFDF7]">
      <text x={4} y={10} fontSize={8.5} fontWeight={800} fill="#B08A7A">
        velocity (m/s) downstream →
      </text>
      {pts.length > 1 && <path d={path} fill="none" stroke="#3E7C43" strokeWidth={2} strokeDasharray="4 3" />}
      {byStation.map((b) =>
        b.v !== null ? (
          <g key={b.st.id}>
            <circle cx={x(b.st.s)} cy={y(b.v)} r={4} fill="#3E7C43" />
            <text x={x(b.st.s)} y={y(b.v) - 7} textAnchor="middle" fontSize={9} fontWeight={800} fill="#402222">
              {b.v.toFixed(2)}
            </text>
            <text x={x(b.st.s)} y={H - 4} textAnchor="middle" fontSize={8.5} fontWeight={800} fill="#B08A7A">
              {b.st.id.replace('st', 'S')}
            </text>
          </g>
        ) : null,
      )}
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Hjulström — Analyst only                                            */
/* ------------------------------------------------------------------ */

function Hjulstrom({ sizeMm, v }: { sizeMm: number; v: number }) {
  const W = 252
  const H = 120
  // log axes: x 0.001..100 mm, y 0.01..10 m/s
  const lx = (mm: number) => ((Math.log10(Math.max(0.001, mm)) + 3) / 5) * (W - 34) + 26
  const ly = (ms: number) => H - 16 - ((Math.log10(Math.max(0.01, ms)) + 2) / 3) * (H - 34)
  // Approximate curves: erosion (with the fine-cohesive rise) and settling.
  const ero = [
    [0.001, 3.2], [0.01, 1.1], [0.1, 0.32], [0.5, 0.25], [2, 0.35], [10, 0.9], [60, 2.6], [100, 3.6],
  ]
  const set = [
    [0.01, 0.001 * 10], [0.1, 0.008], [0.5, 0.045], [2, 0.15], [10, 0.55], [60, 1.7], [100, 2.6],
  ]
  const path = (pts: number[][]) => pts.map((p, i) => `${i ? 'L' : 'M'}${lx(p[0]).toFixed(1)},${ly(p[1]).toFixed(1)}`).join('')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl border border-[#EFE3CE] bg-[#FFFDF7]">
      <text x={4} y={10} fontSize={8.5} fontWeight={800} fill="#B08A7A">
        Hjulström: grain size (mm, log) vs velocity (m/s, log)
      </text>
      <path d={path(ero)} fill="none" stroke="#C13B33" strokeWidth={1.8} />
      <path d={path(set)} fill="none" stroke="#2E6DA8" strokeWidth={1.8} />
      <text x={lx(0.02)} y={ly(2.2)} fontSize={8.5} fontWeight={800} fill="#C13B33">erosion</text>
      <text x={lx(0.02)} y={ly(0.02)} fontSize={8.5} fontWeight={800} fill="#2E6DA8">deposition</text>
      <text x={lx(3)} y={ly(0.09)} fontSize={8.5} fontWeight={800} fill="#7A5252">transport</text>
      <circle cx={lx(sizeMm)} cy={ly(Math.max(0.011, v))} r={4.5} fill="#E8A33D" stroke="#402222" strokeWidth={1} />
      <text x={lx(sizeMm)} y={ly(Math.max(0.011, v)) - 7} textAnchor="middle" fontSize={8.5} fontWeight={800} fill="#402222">
        your pebble
      </text>
    </svg>
  )
}

/* ------------------------------------------------------------------ */

export default function RiverData({
  readings,
  hydro,
  storms,
  basin,
  pebbleSizeMm,
  pebbleV,
  onDelete,
  onClear,
  onComputeDischarge,
  embedded = false,
}: Props) {
  const caps = useBandCaps()
  const dischargeReady = useMemo(() => {
    const out: Array<'st1' | 'st2' | 'st3'> = []
    for (const st of STATIONS) {
      const hasA = readings.some((r) => r.kind === 'section' && r.station === st.id)
      const hasV = readings.some((r) => r.kind === 'velocity' && r.station === st.id)
      const hasQ = readings.some((r) => r.kind === 'discharge' && r.station === st.id)
      if (hasA && hasV && !hasQ) out.push(st.id)
    }
    return out
  }, [readings])

  return (
    <div
      className={
        embedded
          ? 'flex w-full flex-col gap-2'
          : 'pointer-events-auto flex max-h-[46dvh] w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 overflow-y-auto rounded-[22px] border border-[#F3E9D7] bg-[#FBF5EA]/95 p-3 shadow-xl backdrop-blur-md'
      }
    >
      <div className="flex items-center gap-2">
        <LineChart className="h-4 w-4 text-[#2E6DA8]" />
        <p className="grow text-[13px] font-black text-[#402222]">Field data</p>
        {readings.length > 0 && (
          <Tile onClick={onClear} className="text-[10px] font-extrabold text-[#B08A7A] hover:text-[#C13B33]">
            clear all
          </Tile>
        )}
      </div>

      <Hydrograph hydro={hydro} basin={basin} />
      <VelocityChart readings={readings} />

      {dischargeReady.map((stId) => (
        <Tile
          key={stId}
          onClick={() => onComputeDischarge(stId)}
          className="rounded-full border-2 border-[#3E7C43] px-4 py-2 text-[11.5px] font-extrabold text-[#3E7C43] transition-all hover:bg-[#DDEBD9]"
        >
          {STATION_BY_ID[stId].name.split(' — ')[0]}: compute discharge = A × v̄
        </Tile>
      ))}

      {caps.hjulstrom && <Hjulstrom sizeMm={pebbleSizeMm} v={pebbleV} />}

      {caps.dataTable && readings.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-[#EFE3CE] bg-[#FFFDF7]">
          <table className="w-full text-left text-[10.5px] font-bold text-[#402222]">
            <thead>
              <tr className="border-b border-[#EFE3CE] text-[#B08A7A]">
                <th className="px-2 py-1">#</th>
                <th className="px-2 py-1">What</th>
                <th className="px-2 py-1">Where</th>
                <th className="px-2 py-1">Value</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {readings.map((r) => (
                <tr key={r.id} className="border-b border-[#F6F0E2] last:border-0">
                  <td className="px-2 py-1 text-[#B08A7A]">{r.id}</td>
                  <td className="px-2 py-1">{KIND_LABEL[r.kind]}</td>
                  <td className="px-2 py-1">{r.station === '—' ? '—' : r.station.replace('st', 'S')}</td>
                  <td className="px-2 py-1 font-mono">
                    {r.value.toFixed(r.kind === 'velocity' ? 2 : r.kind === 'pebble' ? 0 : 2)} {r.unit}
                  </td>
                  <td className="px-1 py-1">
                    <Tile onClick={() => onDelete(r.id)} round className="text-[#C9B49E] hover:text-[#C13B33]">
                      <Trash2 className="h-3 w-3" />
                    </Tile>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {storms.length > 0 && (
        <div className="flex flex-col gap-1 rounded-xl border border-[#EFE3CE] bg-[#FFFDF7] p-2">
          <p className="text-[10.5px] font-black text-[#7A5252]">Storm log</p>
          {storms.slice(-4).map((s) => (
            <p key={s.id} className="text-[10px] leading-snug font-bold text-[#402222]">
              #{s.id} {s.landUse}
              {s.wet ? ' · wet' : ''} — peak {s.peakQ.toFixed(2)} m³/s, lag {s.lagS.toFixed(0)} s{s.flooded ? ' · FLOODED' : ''}
              {s.damage > 0 ? ` · damage ${(s.damage * 100).toFixed(0)}%` : ''}
              {s.defences.length ? ` · [${s.defences.join(', ')}] downstream peak ${s.downstreamPeak.toFixed(2)}` : ''}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
