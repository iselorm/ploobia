import { useEffect, useRef } from 'react'
import { recoveryLine } from '@/lib/plot'
import { lapChime } from '@/lib/audio'
import { getWorld, plotNudge, useWorld } from '@/lib/archipelago'

/**
 * Ploob's one-off lines for the plot, said over the coach line: the first
 * stand (with the chime), the strange result, the nudge to look first. All
 * pass the explanation gate.
 */
export function usePlotMoments(say: (text: string, ms?: number) => void) {
  const s = useWorld()
  const run = s.plot.run
  const lastDays = useRef(0)
  const lastBed = useRef<string | null>(null)
  useEffect(() => {
    const onStand = () => {
      lapChime()
      const current = getWorld().plot.run
      if (current) say(recoveryLine(current), 5000)
    }
    const notYet = () => say('Let the day run first.', 2500)
    window.addEventListener('ploobia:stand', onStand)
    window.addEventListener('ploobia:notyet', notYet)
    return () => {
      window.removeEventListener('ploobia:stand', onStand)
      window.removeEventListener('ploobia:notyet', notYet)
    }
  }, [say])
  useEffect(() => {
    if (!run) return
    const key = `${run.bed}-${run.attempt}`
    if (lastBed.current !== key) {
      lastBed.current = key
      lastDays.current = 0
    }
    if (run.days.length === lastDays.current) return
    lastDays.current = run.days.length
    const last = run.days[run.days.length - 1]
    if (!last) return
    // the strange result: a pour and the leaf lower than the morning before
    const prev = run.days[run.days.length - 2]
    if (last.cans > 0 && prev && last.firm13 < prev.firm13 - 0.05) say('You gave it water and it drooped more. Hm.', 4500)
    else if (last.cans > 0 && !prev && last.firm13 < 0.45) say('You gave it water and it drooped more. Hm.', 4500)
    if (run.phase === 'dawn' && plotNudge()) say('Shall we look first?', 4500)
  }, [run, say])
}

