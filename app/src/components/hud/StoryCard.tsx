import { useEffect, useState } from 'react'
import { CheckCircle2, FastForward, Flag } from 'lucide-react'
import type { SimState } from '@/lib/sim'
import {
  CELL_STORY,
  DEMANDS,
  STAGES,
  fmtRace,
  getJourney,
  nowS,
  skipCellStory,
  storyLine,
} from '@/lib/journey'

/**
 * Low-centre narration, shared by the stage toasts and the meet-the-cell
 * story (same pattern as every cabinet's guided-demo narrator). Toasts
 * announce each stop as you arrive; the story takes over once, at the
 * featured body cell, with a skip button.
 */
/**
 * What the lap you just rode means against the real body. A resting circuit
 * really does take about a minute; hard exercise really does cut it to
 * roughly twenty seconds. The ride is tuned so those two numbers land, which
 * makes the lap timer something a learner can check against the world.
 */
function lapVerdict(lapTime: number, demand: number): string {
  if (demand === 0) {
    return lapTime > 45 && lapTime < 80
      ? `A minute for one circuit — that is what a real red blood cell takes at rest, too.`
      : `At rest, one full circuit of a real body takes about 60 seconds.`
  }
  if (demand === 1) {
    return `Working muscle speeds everything up: the same circuit in well under a minute.`
  }
  return `Flat out, a real circuit drops to roughly 20 seconds — blood is racing round you.`
}

export default function StoryCard(_props: { sim: SimState }) {
  const [, force] = useState(0)

  useEffect(() => {
    const t = window.setInterval(() => force((n) => n + 1), 200)
    return () => window.clearInterval(t)
  }, [])

  const j = getJourney()

  // The story owns the card while it runs.
  if (j.beatActive && j.beatLine < CELL_STORY.length) {
    const line = CELL_STORY[j.beatLine]
    return (
      <div className="pointer-events-auto mx-auto flex w-full max-w-[34rem] flex-col items-center gap-2">
        <div
          key={j.beatLine}
          className="fact-pop w-full rounded-[20px] border border-[#F3E9D7] bg-[#2E080B]/68 px-5 py-3.5 text-center shadow-2xl backdrop-blur-xl"
        >
          <p className="text-[15px] leading-snug font-bold text-[#FBF5EA]">{storyLine(line.text)}</p>
        </div>
        <button
          onClick={skipCellStory}
          className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-[#F3E9D7] bg-[#FBF5EA]/80 px-3 py-1 text-[11px] font-extrabold text-[#7A5252] shadow transition-all hover:scale-[1.04]"
        >
          <FastForward className="h-3 w-3" /> Skip story
        </button>
      </div>
    )
  }

  // Otherwise: a checkpoint / lap banner when a gate is crossed.
  const stage = j.toastStage >= 0 ? STAGES[j.toastStage] : null
  const age = stage ? nowS() - j.toastAt : Infinity
  if (!stage || age > 5.5) return null
  const leaving = age > 4.8
  const crossed = j.crossedIndex === j.toastStage && j.lastSplit !== null
  const isLap = crossed && j.crossedLap && j.lastLap !== null
  return (
    <div
      className={`mx-auto w-full max-w-[30rem] rounded-[20px] border border-[#FBF5EA]/25 bg-[#2E080B]/68 px-5 py-3 text-center shadow-2xl backdrop-blur-xl transition-opacity duration-700 ${
        leaving ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {isLap ? (
        <div className="fact-pop">
          <div className="flex items-center justify-center gap-2">
            <Flag className="h-4 w-4 text-[#FF9A8A]" />
            <span className="text-[13px] font-black tracking-widest text-[#FF9A8A] uppercase">
              Lap {j.lap} complete
            </span>
            <span className="rounded-full bg-[#FBF5EA]/18 px-2.5 py-0.5 text-[13px] font-black text-[#FFD9A0] tabular-nums">
              {fmtRace(j.lastLap ?? 0)}
            </span>
            {j.bestLap !== null && (
              <span className="text-[11px] font-extrabold text-[#E8C9B4] tabular-nums">
                best {fmtRace(j.bestLap)}
              </span>
            )}
          </div>
          <p className="mt-1 text-[12px] leading-snug font-bold text-[#F3DBC8]">
            {lapVerdict(j.lastLap ?? 0, j.demand)}
          </p>
        </div>
      ) : (
        <div className="fact-pop">
          <div className="flex items-center justify-center gap-2">
            {crossed && <CheckCircle2 className="h-4 w-4 text-[#8FD694]" />}
            <span className="text-[11px] font-black tracking-widest text-[#FF9A8A] uppercase">
              {crossed ? 'Checkpoint' : stage.title}
            </span>
            {crossed && (
              <span className="text-[13px] font-black tracking-wider text-[#FBF5EA] uppercase">
                {stage.title}
              </span>
            )}
            {crossed && (
              <span className="rounded-full bg-[#FBF5EA]/18 px-2 py-0.5 text-[11px] font-black text-[#FFD9A0] tabular-nums">
                {fmtRace(j.lastSplit ?? 0)}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[13px] leading-snug font-bold text-[#F3DBC8]">{stage.toast}</p>
          {/* Leaving the tissue: say how much was actually handed over, and
              why that number changes with what the body is doing. */}
          {stage.id === 'vein' && crossed && (
            <p className="mt-1 text-[12px] leading-snug font-bold text-[#9FD4F5]">
              Delivered {j.lastDelivery} of 4 · {DEMANDS[j.demand].tissueLine}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
