import { useEffect, useState } from 'react'
import { ChevronsRight, Flag, Timer } from 'lucide-react'
import type { SimState } from '@/lib/sim'
import { fmtRace, getJourney, ghostState, nextCheckpoint } from '@/lib/journey'

/**
 * The race strip — top centre, like a tunnel racer: which checkpoint is next,
 * a live countdown to it at the current pace, a sector progress bar, and the
 * lap / best-lap times. During the meet-the-cell story it flips to PIT STOP.
 */
export default function RaceHud({ sim }: { sim: SimState }) {
  const [, force] = useState(0)

  useEffect(() => {
    const t = window.setInterval(() => force((n) => n + 1), 120)
    return () => window.clearInterval(t)
  }, [])

  const j = getJourney()
  const cp = nextCheckpoint(sim)
  const ghost = ghostState()

  const pit = j.beatActive
  const paused = sim.paused

  return (
    <div className="pointer-events-none flex flex-col items-center gap-1">
      <div className="flex items-center gap-2 rounded-full border border-[#F3E9D7] bg-[#2E080B]/72 px-4 py-1.5 shadow-xl backdrop-blur-md">
        {pit ? (
          <>
            <Timer className="h-3.5 w-3.5 text-[#F0B08E]" />
            <span className="text-[12px] font-black tracking-widest text-[#FBF5EA] uppercase">
              Pit stop — oxygen delivery
            </span>
          </>
        ) : paused ? (
          <span className="text-[12px] font-black tracking-widest text-[#FBF5EA] uppercase">
            Paused
          </span>
        ) : (
          <>
            <span className="text-[10px] font-extrabold tracking-widest text-[#E8A33D] uppercase">
              Next
            </span>
            <ChevronsRight className="h-3.5 w-3.5 text-[#E8A33D]" />
            <span className="text-[13px] font-black tracking-wider text-[#FBF5EA] uppercase">
              {cp.next.title}
            </span>
            <span className="ml-1 rounded-full bg-[#FBF5EA]/14 px-2 py-0.5 text-[13px] font-black text-[#FFD9A0] tabular-nums">
              {fmtRace(cp.eta)}
            </span>
          </>
        )}
      </div>
      {/* sector progress bar */}
      <div className="h-1.5 w-44 overflow-hidden rounded-full bg-[#2E080B]/55 shadow-inner sm:w-56">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#E8A33D] to-[#FF6B5E] transition-[width] duration-300"
          style={{ width: `${Math.round(Math.min(1, Math.max(0, cp.frac)) * 100)}%` }}
        />
      </div>
      {(j.lastLap !== null || j.bestLap !== null) && (
        <div className="flex items-center gap-1.5 rounded-full bg-[#2E080B]/55 px-2.5 py-0.5 backdrop-blur-sm">
          <Flag className="h-3 w-3 text-[#FBF5EA]/80" />
          <span className="text-[10px] font-extrabold text-[#FBF5EA]/90 tabular-nums">
            LAP {j.lastLap !== null ? fmtRace(j.lastLap) : '—'}
          </span>
          <span className="text-[10px] font-extrabold text-[#FFD9A0] tabular-nums">
            · BEST {j.bestLap !== null ? fmtRace(j.bestLap) : '—'}
          </span>
          {/* Delta to your own ghost — only interesting once you start
              changing the demand dial part-way round. */}
          {ghost && Math.abs(ghost.delta) > 0.15 && (
            <span
              className={`text-[10px] font-black tabular-nums ${
                ghost.delta < 0 ? 'text-[#8FD694]' : 'text-[#FF9A8A]'
              }`}
            >
              {ghost.delta < 0 ? '−' : '+'}
              {Math.abs(ghost.delta).toFixed(1)}s
            </span>
          )}
        </div>
      )}
    </div>
  )
}
