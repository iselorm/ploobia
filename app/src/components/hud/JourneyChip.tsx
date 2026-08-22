import { useEffect, useState } from 'react'
import type { SimState } from '@/lib/sim'
import { LAP_LENGTH, STAGES, STAGE_ENDS, getJourney, ghostState, lapDist } from '@/lib/journey'

/**
 * The journey map — a little circular circuit of the loop with a travelling
 * dot, the current stop's name, the lap count, and the hero cell's O₂/CO₂
 * cargo. The learner can always answer "where am I, and what is my red cell
 * carrying right now?" at a glance.
 */

const R = 26
const CX = 32
const CY = 32

/** Angle (radians) on the map circle for a lap distance. Lungs sit at the top. */
function angleFor(d: number): number {
  return (lapDist(d) / LAP_LENGTH) * Math.PI * 2 - Math.PI / 2
}

function arcPath(d0: number, d1: number): string {
  const a0 = angleFor(d0)
  const a1 = angleFor(d1)
  const x0 = CX + Math.cos(a0) * R
  const y0 = CY + Math.sin(a0) * R
  const x1 = CX + Math.cos(a1) * R
  const y1 = CY + Math.sin(a1) * R
  const large = (d1 - d0) / LAP_LENGTH > 0.5 ? 1 : 0
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

/** Stage arc colours: oxygen-rich half bright, oxygen-poor half dark. */
const STAGE_ARC: string[] = [
  '#E08A94', // lungs
  '#C13B33', // left heart
  '#E23A31', // artery
  '#D96C50', // capillary
  '#C98A5E', // tissue
  '#8A2B33', // vein
  '#6B1F28', // right heart
]

export default function JourneyChip({ sim }: { sim: SimState }) {
  const [, force] = useState(0)

  useEffect(() => {
    const t = window.setInterval(() => force((n) => n + 1), 250)
    return () => window.clearInterval(t)
  }, [])

  const j = getJourney()
  const stage = STAGES[j.stageIndex]
  const a = angleFor(j.dist)
  const dotX = CX + Math.cos(a) * R
  const dotY = CY + Math.sin(a) * R
  // Your best lap at this demand, running alongside you.
  const ghost = ghostState()
  const ga = ghost ? ghost.frac * Math.PI * 2 - Math.PI / 2 : 0
  const ghostX = CX + Math.cos(ga) * R
  const ghostY = CY + Math.sin(ga) * R

  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-[20px] border border-[#F3E9D7]/60 bg-[#FBF5EA]/70 px-3.5 py-2.5 shadow-xl backdrop-blur-xl">
      <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
        {STAGES.map((s, i) => {
          const start = i === 0 ? 0 : STAGE_ENDS[i - 1]
          return (
            <path
              key={s.id}
              d={arcPath(start + 1.5, STAGE_ENDS[i] - 1.5)}
              fill="none"
              stroke={STAGE_ARC[i]}
              strokeWidth={i === j.stageIndex ? 6 : 3.5}
              strokeLinecap="round"
              opacity={i === j.stageIndex ? 1 : 0.55}
            />
          )
        })}
        {/* checkpoint ticks at every stage boundary; the next one glows */}
        {STAGE_ENDS.map((end, i) => {
          const ba = angleFor(end)
          const bx = CX + Math.cos(ba) * R
          const by = CY + Math.sin(ba) * R
          const isNext = i === j.stageIndex
          return (
            <circle
              key={`cp-${i}`}
              cx={bx}
              cy={by}
              r={isNext ? 3.4 : 2}
              fill={isNext ? '#E8A33D' : '#FBF5EA'}
              stroke={isNext ? '#B0741B' : '#C9AE96'}
              strokeWidth={isNext ? 1.4 : 1}
            >
              {isNext && (
                <animate attributeName="r" values="3;3.9;3" dur="1.2s" repeatCount="indefinite" />
              )}
            </circle>
          )
        })}
        {ghost && (
          <circle
            cx={ghostX}
            cy={ghostY}
            r="3.6"
            fill="none"
            stroke="#7A5252"
            strokeWidth="1.8"
            strokeDasharray="2 2"
            opacity={0.8}
          />
        )}
        <circle cx={dotX} cy={dotY} r="4.6" fill="#402222" stroke="#FBF5EA" strokeWidth="2" />
        {/* lungs marker at the top */}
        <text x={CX} y={9} textAnchor="middle" fontSize="7" fontWeight="800" fill="#7A5252" stroke="#FBF5EA" strokeWidth="2.6" paintOrder="stroke">
          lungs
        </text>
        <text x={CX} y={62} textAnchor="middle" fontSize="7" fontWeight="800" fill="#7A5252" stroke="#FBF5EA" strokeWidth="2.6" paintOrder="stroke">
          body
        </text>
      </svg>
      <div className="min-w-[8.5rem]">
        <div className="text-[10px] font-extrabold tracking-wider text-[#8A5F4C] uppercase">
          Lap {j.lap + 1} · The oxygen journey
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[15px] leading-tight font-black text-[#402222]">{stage.title}</span>
          <span className="text-[10px] font-extrabold text-[#C13B33] tabular-nums">
            {sim.bpm} bpm
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[10px] font-extrabold text-[#14567D]">O₂</span>
          <span className="flex gap-0.5" aria-label={`Oxygen aboard: ${j.o2} of 4`}>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="inline-block h-2.5 w-2.5 rounded-full border transition-colors duration-500"
                style={{
                  background: i < j.o2 ? '#7EC8EE' : 'transparent',
                  borderColor: i < j.o2 ? '#4E9CC8' : '#D8C7B4',
                }}
              />
            ))}
          </span>
          <span className="ml-1 text-[10px] font-extrabold text-[#7A1E14]">CO₂</span>
          {/* CO₂ is a plasma LOAD, not four sockets: most of it travels
              dissolved as bicarbonate, not clipped to haemoglobin sites. */}
          <span
            className="h-2.5 w-12 overflow-hidden rounded-full border border-[#D8C7B4] bg-[#F3E9D7]/60"
            role="img"
            aria-label={`Carbon dioxide load: ${Math.round((j.co2 / 4) * 100)} per cent`}
          >
            <span
              className="block h-full rounded-full bg-[#E14B3C] transition-[width] duration-500"
              style={{ width: `${Math.min(100, (j.co2 / 4) * 100)}%` }}
            />
          </span>
        </div>
      </div>
    </div>
  )
}
