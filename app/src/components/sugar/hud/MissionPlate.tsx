import { useMemo, useState } from 'react'
import { Check, Trophy } from 'lucide-react'
import { Tile } from '@/components/ui/tile'
import { cn } from '@/lib/utils'
import type { Band } from '@/lib/bands'
import type { SugarReading } from '@/lib/sugarline'
import { missionsForBand } from '@/lib/sugarsim'
import { Chip, Meter, Plate } from './AtlasKit'

/**
 * Missions.
 *
 * Every one completes on **recorded evidence**, never on a control happening
 * to sit in the right place. You have to measure it and keep the data, which
 * is the habit the whole cabinet exists to build. The payoff line is only
 * revealed on completion — that is where the idea actually lands, and giving
 * it away in the brief would turn the mission into an instruction to follow.
 */
export default function MissionPlate({
  readings,
  band,
  embedded = false,
}: {
  readings: SugarReading[]
  band: Band
  embedded?: boolean
}) {
  const missions = useMemo(() => missionsForBand(band), [band])
  const done = useMemo(() => missions.map((m) => m.check(readings)), [missions, readings])
  const count = done.filter(Boolean).length
  const [open, setOpen] = useState<string | null>(null)

  // The completion *events* are emitted by the page, not here: this panel is
  // only mounted while its tab is open, and a mission that completed behind a
  // closed tab still has to reach the learning log.

  return (
    <Plate
      eyebrow="Missions"
      icon={<Trophy className="h-3 w-3" />}
      className={embedded ? '' : 'w-full'}
      action={
        <Chip tone={count === missions.length ? 'good' : 'neutral'}>
          {count}/{missions.length}
        </Chip>
      }
    >
      <Meter value={count / Math.max(1, missions.length)} color="#3E7C43" />
      <div className="mt-2 flex max-h-[15rem] flex-col gap-1 overflow-y-auto">
        {missions.map((m, i) => {
          const complete = done[i]
          const expanded = open === m.id
          return (
            <Tile
              key={m.id}
              onClick={() => setOpen(expanded ? null : m.id)}
              aria-label={m.title}
              aria-expanded={expanded}
              className={cn(
                'rounded-xl border px-2.5 py-2 text-left transition-all',
                complete
                  ? 'border-[#C8DFC2] bg-[#EFF6EC]'
                  : 'border-[#E4DCC9] bg-[#FCFAF4] hover:bg-[#F3EEE0]',
              )}
            >
              <span className="flex items-start gap-2">
                <span
                  className={cn(
                    'mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-black',
                    complete
                      ? 'border-[#3E7C43] bg-[#3E7C43] text-white'
                      : 'border-[#D6CDB6] text-[#B9B09A]',
                  )}
                >
                  {complete ? <Check className="h-2.5 w-2.5" /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block text-[12px] leading-tight font-extrabold',
                      complete ? 'text-[#2F6134]' : 'text-[#2A2823]',
                    )}
                  >
                    {m.title}
                  </span>
                  <span className="mt-0.5 block text-[10.5px] leading-snug font-semibold text-[#8B8471]">
                    {m.brief}
                  </span>
                  {complete && (
                    <span className="mt-1 block rounded-lg bg-[#DCEBD6] px-2 py-1 text-[10.5px] leading-snug font-semibold text-[#2C5C31]">
                      {m.reward}
                    </span>
                  )}
                </span>
              </span>
            </Tile>
          )
        })}
      </div>
    </Plate>
  )
}
