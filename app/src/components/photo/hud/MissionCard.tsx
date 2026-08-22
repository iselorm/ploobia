import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Trophy } from 'lucide-react'
import { useBand } from '@/lib/bands'
import { logEvent } from '@/lib/events'
import { missionsForBand } from '@/lib/missions'
import type { Reading } from '@/lib/ratelab'

/**
 * Missions exist because a sandbox with no goal is delightful at ten and boring
 * at sixteen. Each one completes on recorded evidence, and each one pays out
 * with the idea it was quietly teaching.
 */
export default function MissionCard({ readings, embedded = false }: { readings: Reading[]; embedded?: boolean }) {
  const [band] = useBand()
  const missions = useMemo(() => missionsForBand(band), [band])
  const done = useMemo(
    () => new Set(missions.filter((m) => m.check(readings)).map((m) => m.id)),
    [missions, readings],
  )

  const [openState, setOpen] = useState(false)
  const open = embedded || openState
  const [expanded, setExpanded] = useState<string | null>(null)
  const seen = useRef<Set<string>>(new Set())
  const [justDone, setJustDone] = useState<string | null>(null)

  useEffect(() => {
    const fresh = [...done].find((id) => !seen.current.has(id))
    done.forEach((id) => seen.current.add(id))
    if (fresh) {
      const m = missions.find((x) => x.id === fresh)
      if (m) logEvent('photosynthesis', band, 'mission.completed', { missionId: m.id, title: m.title, skill: m.skill })
      setJustDone(fresh)
      setExpanded(fresh)
      setOpen(true)
      const t = window.setTimeout(() => setJustDone(null), 4200)
      return () => window.clearTimeout(t)
    }
  }, [done, missions, band])

  const completed = done.size

  return (
    <div
      className={
        embedded
          ? 'pointer-events-auto flex w-full flex-col'
          : 'pointer-events-auto flex max-h-full w-full max-w-[21rem] flex-col rounded-[20px] border border-[#F3E9D7] bg-[#FBF5EA]/95 shadow-xl backdrop-blur-md'
      }
    >
      {!embedded && (
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full shrink-0 items-center justify-between gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-extrabold text-[#402222]">
          <Trophy className={`h-4 w-4 ${justDone ? 'counter-pop text-[#E8A33D]' : 'text-[#B97D10]'}`} />
          Missions
          <span className="rounded-full bg-[#FBEBD2] px-2 py-0.5 text-[10px] font-black text-[#B97D10] tabular-nums">
            {completed}/{missions.length}
          </span>
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-[#7A5252]" />
        ) : (
          <ChevronUp className="h-4 w-4 shrink-0 text-[#7A5252]" />
        )}
      </button>
      )}

      {open && (
        <div className={embedded ? 'space-y-1.5 px-1 pb-2 pt-1' : 'max-h-[30dvh] space-y-1.5 overflow-y-auto px-3 pb-3'}>
          {missions.map((m) => {
            const isDone = done.has(m.id)
            const isOpen = expanded === m.id
            return (
              <div
                key={m.id}
                className={`rounded-[14px] border px-2.5 py-2 transition-colors ${
                  isDone ? 'border-[#DDEAD8] bg-[#EAF3E6]' : 'border-[#F0E6D2] bg-[#FFFDF7]'
                } ${justDone === m.id ? 'fact-pop' : ''}`}
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : m.id)}
                  className="flex w-full items-start gap-2 text-left"
                >
                  {isDone ? (
                    <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-[#3E7C43]" />
                  ) : (
                    <Circle className="mt-px h-3.5 w-3.5 shrink-0 text-[#C4AF95]" />
                  )}
                  <span className="min-w-0">
                    <span
                      className={`block text-[12px] font-black ${
                        isDone ? 'text-[#2E7D32]' : 'text-[#402222]'
                      }`}
                    >
                      {m.title}
                    </span>
                    {(!isDone || isOpen) && (
                      <span className="mt-0.5 block text-[11px] leading-snug font-semibold text-[#7A5252]">
                        {m.brief}
                      </span>
                    )}
                  </span>
                </button>
                {isDone && isOpen && (
                  <p className="mt-1.5 border-t border-[#D3E3CE] pt-1.5 text-[11px] leading-snug font-semibold text-[#3D5B3F]">
                    {m.reward}
                  </p>
                )}
                {isDone && !isOpen && (
                  <button
                    onClick={() => setExpanded(m.id)}
                    className="mt-0.5 ml-[22px] text-[10px] font-black text-[#3E7C43] uppercase"
                  >
                    Why it matters →
                  </button>
                )}
              </div>
            )
          })}
          <p className="px-1 pt-1 text-[10px] leading-snug font-bold text-[#B08A7A]">
            Missions unlock as you change level. Analyst adds the ones that need repeats,
            uncertainty and a written conclusion.
          </p>
        </div>
      )}
    </div>
  )
}
