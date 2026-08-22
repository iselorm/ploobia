import { PlayCircle, SkipForward } from 'lucide-react'
import { DEMO_STEPS } from '@/lib/demo'

interface Props {
  step: number
  /** 0–1 progress through the current step. */
  progress: number
  onSkip: () => void
}

/**
 * Narration for the guided demo. It sits low and centred, clear of the control
 * panel on the left and the data lab on the right, so it never covers anything
 * the learner is being asked to look at.
 */
export default function DemoOverlay({ step, progress, onSkip }: Props) {
  const current = DEMO_STEPS[step]
  if (!current) return null

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4">
      <div className="pointer-events-auto w-[min(34rem,calc(100vw-2rem))] overflow-hidden rounded-[22px] border border-[#F3E9D7] bg-[#FBF5EA]/96 shadow-2xl backdrop-blur-md">
        <div className="flex items-start gap-3 p-4">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#3E7C43]">
            <PlayCircle className="h-5 w-5 text-[#FBF5EA]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[10px] font-black tracking-widest text-[#3E7C43] uppercase">
                Guided demo · {step + 1} of {DEMO_STEPS.length}
              </span>
              <button
                onClick={onSkip}
                className="flex shrink-0 items-center gap-1 rounded-full bg-[#F3E9D7] px-2.5 py-1 text-[10.5px] font-extrabold text-[#7A5252] transition-colors hover:bg-[#EBDFC8]"
              >
                <SkipForward className="h-3 w-3" />
                Skip to the controls
              </button>
            </div>
            <p className="mt-1 text-[13.5px] leading-snug font-semibold text-[#402222]">
              {current.text}
            </p>
          </div>
        </div>
        <div className="h-1 w-full bg-[#F0E6D2]">
          <div
            className="h-full bg-[#3E7C43] transition-[width] duration-200 ease-linear"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>
    </div>
  )
}
