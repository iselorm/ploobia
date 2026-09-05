import { Check, Lock } from 'lucide-react'
import { Tile } from '@/components/ui/tile'
import { cn } from '@/lib/utils'
import { CAMPAIGN, doorState, useCampaign, type CampaignStage, type DoorState } from '@/lib/campaign'

/**
 * Five doors in a row.
 *
 * A learner who has finished stage 1 should see where they are going: the
 * doors are on the card from the first visit, every one of them named, and
 * the shut ones say honestly why they are shut. A tick is a stage handed in;
 * an open frame is a stage they may walk into; a lock is one more hand-in
 * away; a dim door with no lock is a place nobody has discovered yet — the
 * house rule against "coming soon".
 *
 * Tapping an open or ticked door plays that stage's level for the band.
 * Tapping a shut one does nothing but say what would open it; a door that
 * does nothing when tapped is worse than one that explains itself.
 */

const STATE_LABEL: Record<DoorState, string> = {
  done: 'handed in',
  open: 'open',
  shut: 'shut',
  undiscovered: 'not yet discovered',
}

export default function CampaignMap({
  onEnter,
  onShut,
  compact = false,
}: {
  onEnter: (stage: CampaignStage) => void
  /** A shut door was tapped: say what opens it. */
  onShut: (stage: CampaignStage, why: string) => void
  compact?: boolean
}) {
  useCampaign()
  return (
    <div className="mt-4" data-testid="campaign-map">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="atlas-eyebrow">The journey</span>
        <span className="text-[9.5px] font-extrabold text-[#8B8471]">a hand-in opens the next door</span>
      </div>
      <div className={cn('mt-1.5 grid gap-1.5', compact ? 'grid-cols-5' : 'grid-cols-5')}>
        {CAMPAIGN.map((s) => {
          const state = doorState(s)
          const enterable = state === 'open' || state === 'done'
          return (
            <Tile
              key={s.id}
              data-testid={`door-${s.id}`}
              data-state={state}
              aria-label={`${s.name}, ${STATE_LABEL[state]}`}
              onClick={() => {
                if (enterable) onEnter(s)
                else if (state === 'shut')
                  onShut(s, `Hand in any level of stage ${s.id - 1} to open ${s.name}.`)
                else onShut(s, `${s.name} is shut. Nobody has discovered what is behind it yet.`)
              }}
              className={cn(
                'flex flex-col items-center rounded-[12px] border px-1 py-1.5 text-center transition-all active:scale-[0.98]',
                state === 'done' && 'border-[#3E7C43] bg-[#E7F1E3]',
                state === 'open' && 'atlas-invite border-[#2F6134] bg-[#FCFAF4]',
                state === 'shut' && 'border-[#E4DCC9] bg-[#F6F2E8]',
                state === 'undiscovered' && 'border-dashed border-[#D8D0BC] bg-[#F6F2E8]/60 opacity-75',
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black',
                  state === 'done' && 'bg-[#2F6134] text-[#FBF8EF]',
                  state === 'open' && 'bg-[#E7F1E3] text-[#2F6134]',
                  state === 'shut' && 'bg-[#EAE4D4] text-[#8B8471]',
                  state === 'undiscovered' && 'bg-transparent text-[#B9B09A]',
                )}
              >
                {state === 'done' ? <Check className="h-3 w-3" /> : state === 'shut' ? <Lock className="h-2.5 w-2.5" /> : s.id}
              </span>
              <span
                className={cn(
                  'atlas-serif mt-1 block text-[10.5px] leading-tight font-semibold',
                  enterable ? 'text-[#2A2823]' : 'text-[#8B8471]',
                )}
              >
                {s.name.replace(/^The /, '')}
              </span>
              <span className="mt-0.5 block text-[8.5px] leading-tight font-bold text-[#8B8471]">{s.where}</span>
            </Tile>
          )
        })}
      </div>
    </div>
  )
}
