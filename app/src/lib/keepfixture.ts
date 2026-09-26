/**
 * Suites only: the end of S0 in one call — the v2 fixture (Nara's bed with
 * cans on 7 and 10, the far bed with cans on 1, 3, 5), played through S0's
 * own day loop, Sela's line heard. Lets verify-landing reach S1 without the
 * S0 walk in front of it. Nothing in the app calls this.
 */
import { choose, firstBed, probe, secondBed, advance, type Competence, type PlotRun } from './plot'
import { getWorld, setWorld } from './archipelago'

function play(run: PlotRun, cans: number[]): PlotRun {
  while (run.phase === 'dawn') {
    probe(run)
    choose(run, cans.includes(run.day) ? 'pour' : 'wait')
    while ((run.phase as string) === 'running') advance(run, 6)
  }
  return run
}

export function endOfS0(competence: Competence = 'runs'): void {
  const first = play(firstBed(1), [7, 10])
  const far = play(secondBed(1), [1, 3, 5])
  const p = getWorld().plot
  setWorld({
    zone: 'landing',
    keep: null,
    plot: { ...p, stage: 'done', met: true, name: p.name ?? 'Kofi', first, run: far, rescuedFirst: true, rescuedSecond: true, taught: true, competence, recorded: true, pageRead: true, planted: true, sent: true },
  })
}
