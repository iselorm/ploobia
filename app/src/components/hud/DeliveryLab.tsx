import { useEffect, useState } from 'react'
import { BarChart3, CheckCircle2, CircleDashed, FlaskConical } from 'lucide-react'
import { useBandCaps } from '@/lib/bands'
import { DEMANDS, getJourney } from '@/lib/journey'
import {
  LAB_MISSIONS,
  bestTrials,
  commitPrediction,
  getLab,
  needsPrediction,
  setWriteUp,
  subscribeLab,
  type PredictionDir,
} from '@/lib/bloodlab'

/**
 * The delivery lab — Blood Voyage's measurement loop.
 *
 * One independent variable (body demand), one dependent variable (oxygen
 * delivered per minute), and a trial that IS the ride: a lap completed
 * without touching the dial. The table deliberately shows the two factors
 * separately — trips per minute and oxygen per trip — because their product
 * is the answer, and a learner who can see both columns can discover that
 * for themselves rather than being told it.
 */

const DEMAND_TINT = ['#3E7C43', '#E8A33D', '#C13B33']

function fmt(n: number, dp = 1): string {
  return n.toFixed(dp)
}

/* ------------------------------------------------------------------ */

function Chart({ rows }: { rows: ReturnType<typeof bestTrials> }) {
  const max = Math.max(1, ...rows.map((r) => (r ? r.rate : 0)))
  const W = 240
  const H = 118
  const padL = 30
  const padB = 22
  const barW = 42

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Oxygen delivered per minute at each body demand"
      className="mt-2"
    >
      {/* axes */}
      <line x1={padL} y1={4} x2={padL} y2={H - padB} stroke="#D8C7B4" strokeWidth="1.5" />
      <line x1={padL} y1={H - padB} x2={W - 4} y2={H - padB} stroke="#D8C7B4" strokeWidth="1.5" />
      <text x={4} y={12} fontSize="8" fontWeight="800" fill="#8A5F4C">
        O₂/min
      </text>
      {rows.map((r, i) => {
        const x = padL + 16 + i * (barW + 22)
        if (!r) {
          return (
            <g key={i}>
              <rect
                x={x}
                y={H - padB - 10}
                width={barW}
                height={10}
                rx={3}
                fill="none"
                stroke="#D8C7B4"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
              <text
                x={x + barW / 2}
                y={H - padB + 11}
                fontSize="8"
                fontWeight="800"
                textAnchor="middle"
                fill="#B08A7A"
              >
                {DEMANDS[i].label}
              </text>
            </g>
          )
        }
        const h = Math.max(4, ((H - padB - 8) * r.rate) / max)
        return (
          <g key={i}>
            <rect
              x={x}
              y={H - padB - h}
              width={barW}
              height={h}
              rx={3}
              fill={DEMAND_TINT[i]}
              opacity={0.9}
            />
            <text
              x={x + barW / 2}
              y={H - padB - h - 3}
              fontSize="9"
              fontWeight="900"
              textAnchor="middle"
              fill="#402222"
            >
              {fmt(r.rate)}
            </text>
            <text
              x={x + barW / 2}
              y={H - padB + 11}
              fontSize="8"
              fontWeight="800"
              textAnchor="middle"
              fill="#7A5252"
            >
              {DEMANDS[i].label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/* ------------------------------------------------------------------ */

export default function DeliveryLab({ embedded = false }: { embedded?: boolean } = {}) {
  const [, force] = useState(0)
  const caps = useBandCaps()

  useEffect(() => {
    const un = subscribeLab(() => force((n) => n + 1))
    const t = window.setInterval(() => force((n) => n + 1), 600)
    return () => {
      un()
      window.clearInterval(t)
    }
  }, [])

  const lab = getLab()
  const rows = bestTrials()
  const j = getJourney()
  const asking = needsPrediction()
  const measured = rows.filter(Boolean).length

  const predict = (dir: PredictionDir) => commitPrediction(dir)

  return (
    <div
      className={
        embedded
          ? 'pointer-events-auto w-full'
          : 'pointer-events-auto w-[min(22rem,calc(100vw-2rem))] rounded-[20px] border border-[#F3E9D7]/60 bg-[#FBF5EA]/70 p-4 shadow-xl backdrop-blur-xl'
      }
    >
      <div className="mb-1 flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-[#C13B33]" />
        <span className="text-sm font-black tracking-tight text-[#402222]">Delivery lab</span>
        <span className="ml-auto text-[10px] font-extrabold text-[#8A5F4C]">
          {measured}/3 measured
        </span>
      </div>
      <p className="text-[11px] leading-snug font-semibold text-[#8A5F4C]">
        A trial is one full lap without touching the dial. Change it half-way and the lap is
        thrown away — same rule a real experiment follows.
      </p>

      {/* prediction gate */}
      {asking && (
        <div className="mt-2 rounded-[14px] border border-[#E8A33D]/60 bg-[#FBEBD2]/70 p-2.5">
          <p className="text-[11px] leading-snug font-extrabold text-[#8A5F4C]">
            Before you ride: at {DEMANDS[j.demand].label.toLowerCase()}, will oxygen delivered per
            minute be…
          </p>
          <div className="mt-1.5 flex gap-1.5">
            {(['lower', 'same', 'higher'] as PredictionDir[]).map((d) => (
              <button
                key={d}
                onClick={() => predict(d)}
                className="flex-1 rounded-full bg-[#FBF5EA] px-2 py-1 text-[11px] font-extrabold text-[#7A5252] capitalize shadow-sm transition-all hover:scale-[1.03] hover:text-[#C13B33]"
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      )}
      {lab.prediction && (
        <p className="mt-2 rounded-full bg-[#F3E9D7]/70 px-2.5 py-1 text-[11px] font-extrabold text-[#8A5F4C]">
          Predicted: {lab.prediction.dir} · now ride a clean lap
        </p>
      )}

      <Chart rows={rows} />

      {/* the table — the two factors kept in separate columns on purpose */}
      {caps.dataTable && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-[10px] tabular-nums">
            <thead>
              <tr className="text-left text-[#8A5F4C]">
                <th className="py-1 pr-1 font-extrabold">Demand</th>
                <th className="py-1 pr-1 font-extrabold">bpm</th>
                <th className="py-1 pr-1 font-extrabold">Lap</th>
                <th className="py-1 pr-1 font-extrabold">Trips/min</th>
                <th className="py-1 pr-1 font-extrabold">O₂/trip</th>
                <th className="py-1 font-extrabold">O₂/min</th>
              </tr>
            </thead>
            <tbody className="font-bold text-[#402222]">
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-[#E4D5C0]">
                  <td className="py-1 pr-1">{DEMANDS[i].label}</td>
                  <td className="py-1 pr-1">{DEMANDS[i].bpm}</td>
                  <td className="py-1 pr-1">{r ? `${fmt(r.lapTime)}s` : '—'}</td>
                  <td className="py-1 pr-1">{r ? fmt(r.tripsPerMin) : '—'}</td>
                  <td className="py-1 pr-1">{r ? r.extraction : '—'}</td>
                  <td className="py-1 font-black text-[#2E6DA8]">{r ? fmt(r.rate) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* the relationship, offered only once there is data to see it in */}
      {measured >= 2 && (
        <p className="mt-2 rounded-[12px] bg-[#DDEBD9]/70 px-2.5 py-1.5 text-[11px] leading-snug font-bold text-[#2C5A31]">
          Look at your last two columns: delivery per minute is trips per minute{' '}
          <strong>×</strong> oxygen per trip. Both go up together — which is why sprinting
          multiplies delivery instead of just adding to it.
        </p>
      )}

      {/* missions complete on evidence, never on button presses */}
      <ul className="mt-2 space-y-1">
        {LAB_MISSIONS.map((m) => {
          const done = lab.done.includes(m.id)
          return (
            <li key={m.id} className="flex items-start gap-1.5">
              {done ? (
                <CheckCircle2 className="mt-[1px] h-3.5 w-3.5 shrink-0 text-[#3E7C43]" />
              ) : (
                <CircleDashed className="mt-[1px] h-3.5 w-3.5 shrink-0 text-[#C9AE96]" />
              )}
              <span
                className={`text-[11px] leading-snug font-bold ${
                  done ? 'text-[#3E7C43] line-through' : 'text-[#7A5252]'
                }`}
              >
                {m.title}
              </span>
            </li>
          )
        })}
      </ul>

      {/* write-up, once there is something to write about */}
      {caps.conclusion && measured >= 2 && (
        <div className="mt-3 space-y-1.5">
          <label className="flex items-center gap-1.5 text-[11px] font-extrabold text-[#8A5F4C]">
            <BarChart3 className="h-3 w-3" /> What did you find?
          </label>
          <textarea
            value={lab.claim}
            onChange={(e) => setWriteUp(e.target.value, lab.reason)}
            placeholder="Claim: when the body works harder, oxygen delivery…"
            rows={2}
            className="w-full resize-none rounded-[12px] border border-[#E4D5C0] bg-[#FBF5EA]/80 p-2 text-[11px] font-semibold text-[#402222] outline-none focus:border-[#C13B33]"
          />
          <textarea
            value={lab.reason}
            onChange={(e) => setWriteUp(lab.claim, e.target.value)}
            placeholder="Because… (use the numbers in your table)"
            rows={2}
            className="w-full resize-none rounded-[12px] border border-[#E4D5C0] bg-[#FBF5EA]/80 p-2 text-[11px] font-semibold text-[#402222] outline-none focus:border-[#C13B33]"
          />
        </div>
      )}
    </div>
  )
}
