import { useMemo } from 'react'
import { Check, Target, Trophy } from 'lucide-react'
import { Tile } from '@/components/ui/tile'
import { cn } from '@/lib/utils'
import type { Band } from '@/lib/bands'
import type { SugarReading } from '@/lib/sugarline'
import { missionsForBand, type SugarSim } from '@/lib/sugarsim'
import { Chip, Meter, Plate } from './AtlasKit'

/**
 * Missions — a job list you can pick up, not a scoreboard you read.
 *
 * Every one still completes on **recorded evidence**, never on a control
 * happening to sit in the right place: you have to measure it and keep the
 * data, which is the habit the whole cabinet exists to build. What changed is
 * the front of the loop. Tapping a mission *takes it on*: its steps unfold in
 * the tile, the coach chip starts naming the next one, and the control that
 * step needs lights up in the panel. Before that, a learner could read "show
 * the curve levelling off" and have no idea which of eleven controls to touch.
 *
 * The payoff line is still only revealed on completion — that is where the
 * idea actually lands, and giving it away in the brief would turn the mission
 * into an instruction to follow rather than a thing to find out.
 */
export default function MissionPlate({
  sim,
  readings,
  band,
  activeId,
  onPick,
  embedded = false,
}: {
  sim: SugarSim
  readings: SugarReading[]
  band: Band
  activeId: string | null
  onPick: (id: string | null) => void
  embedded?: boolean
}) {
  const missions = useMemo(() => missionsForBand(band), [band])
  const done = useMemo(() => missions.map((m) => m.check(readings)), [missions, readings])
  const count = done.filter(Boolean).length

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
      <p className="mt-1.5 text-[10.5px] leading-snug font-semibold text-[#9A9482]">
        Tap one to take it on — the steps appear here and the control you need lights up.
      </p>
      <div className="mt-2 flex max-h-[15rem] flex-col gap-1 overflow-y-auto">
        {missions.map((m, i) => {
          const complete = done[i]
          const active = activeId === m.id
          // Which step is next, recomputed live so the tile walks backwards
          // too if the learner undoes something.
          const stepDone = active && !complete ? m.steps.map((s) => s.done(sim, readings)) : []
          const current = stepDone.findIndex((d) => !d)
          return (
            <Tile
              key={m.id}
              onClick={() => onPick(active ? null : m.id)}
              aria-label={complete ? m.title : `Take on: ${m.title}`}
              aria-expanded={active}
              aria-pressed={active}
              className={cn(
                // `shrink-0` is load-bearing: the list is a flex column with a
                // max height, and without it the tiles compress past their own
                // content and the briefs overlap the row below.
                'shrink-0 rounded-xl border px-2.5 py-2 text-left transition-all',
                complete
                  ? 'border-[#C8DFC2] bg-[#EFF6EC]'
                  : active
                    ? 'border-[#D99B2B] bg-[#FDF6E6] shadow-sm'
                    : 'border-[#E4DCC9] bg-[#FCFAF4] hover:bg-[#F3EEE0]',
              )}
            >
              <span className="flex items-start gap-2">
                <span
                  className={cn(
                    'mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-black',
                    complete
                      ? 'border-[#3E7C43] bg-[#3E7C43] text-white'
                      : active
                        ? 'border-[#D99B2B] bg-[#D99B2B] text-white'
                        : 'border-[#D6CDB6] text-[#B9B09A]',
                  )}
                >
                  {complete ? <Check className="h-2.5 w-2.5" /> : active ? <Target className="h-2.5 w-2.5" /> : i + 1}
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

                  {active && !complete && (
                    <span className="mt-1.5 block border-l-2 border-[#EBD5A6] pl-2">
                      {m.steps.map((s, si) => (
                        <span
                          key={si}
                          className={cn(
                            'mt-0.5 flex items-start gap-1.5 text-[10.5px] leading-snug font-semibold',
                            stepDone[si]
                              ? 'text-[#8FA98C] line-through'
                              : si === current
                                ? 'text-[#8A5A0B]'
                                : 'text-[#B3AB97]',
                          )}
                        >
                          <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ background: stepDone[si] ? '#8FA98C' : si === current ? '#D99B2B' : '#DCD4C0' }}
                          />
                          {s.say}
                        </span>
                      ))}
                    </span>
                  )}

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
