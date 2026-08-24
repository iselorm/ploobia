import { SkipForward } from 'lucide-react'
import { Tile } from '@/components/ui/tile'
import { SUGAR_DEMO } from '@/lib/sugarsim'

/**
 * Narration for the guided demo.
 *
 * The demo drives the real handlers, so the sliders visibly move and a real
 * trial really runs — never a video. Low-centre so it never covers the
 * specimen, and always skippable.
 */
export default function DemoOverlay({
  step,
  progress,
  onSkip,
}: {
  step: number
  progress: number
  onSkip: () => void
}) {
  const current = SUGAR_DEMO[Math.min(step, SUGAR_DEMO.length - 1)]
  if (!current) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex justify-center px-4">
      <div className="atlas-plate atlas-arrive pointer-events-auto w-full max-w-[30rem] p-3">
        <div className="flex items-start gap-3">
          <span className="atlas-eyebrow mt-[3px] shrink-0">
            {step + 1}/{SUGAR_DEMO.length}
          </span>
          <p className="min-w-0 flex-1 text-[13px] leading-snug font-extrabold text-[#2A2823]">
            {current.say}
          </p>
          <Tile
            onClick={onSkip}
            aria-label="Skip the demo"
            className="flex shrink-0 items-center gap-1 rounded-full border border-[#E4DCC9] bg-[#FCFAF4] px-2.5 py-1 text-[11px] font-extrabold text-[#8B8471] hover:text-[#2F6134]"
          >
            <SkipForward className="h-3 w-3" />
            Skip
          </Tile>
        </div>
        <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-[#EDE6D5]">
          <div
            className="h-full rounded-full bg-[#3E7C43] transition-[width] duration-150"
            style={{ width: `${Math.min(1, progress) * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}
