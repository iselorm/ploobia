/**
 * Replaying a day, out of band.
 *
 * Two things the tally wants that only a second run can supply: *which
 * constant ceiling would have kept this leaf standing* (so the advice names
 * a number the model actually stands behind, not a rule of thumb), and *what
 * the cactus would have done with the same day* (the level-3 comparison).
 *
 * Kept apart from `hatches.ts` because it drives the sim — `hatches.ts` is
 * driven *by* the sim, and a module that did both would import itself.
 * Coarse steps: a day at ten steps a second is nine hundred solves, a few
 * milliseconds, which is cheap enough to run at hand-in on a phone.
 */

import { buildDay, dayTally, startDay, type DaySpec, type DayTally } from './hatches'
import { createSugarSim, loadSpecimen, stepSim } from './sugarsim'

const REPLAY_DT = 0.1

/** Run one whole day with the ceiling held constant. */
export function replayDay(specimenId: string, spec: DaySpec, ceiling: number): DayTally {
  const sim = createSugarSim()
  loadSpecimen(sim, specimenId)
  sim.started = true
  const run = startDay(sim, spec, ceiling)
  let guard = 0
  while (!run.done && guard++ < 100000) stepSim(sim, REPLAY_DT)
  return dayTally(run, sim.turgor)
}

/**
 * The most open constant ceiling that ends the day firm with no wilt spell,
 * and what it banks — or null if no ceiling on the ladder manages it.
 */
export function safestCeiling(
  specimenId: string,
  spec: DaySpec,
): { ceiling: number; tally: DayTally } | null {
  for (const c of [0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.25, 0.2, 0.15, 0.1, 0.05]) {
    const t = replayDay(specimenId, spec, c)
    if (t.leafFirm && t.wiltHours < 0.5) return { ceiling: c, tally: t }
  }
  return null
}

/** The cactus's day, for the level-3 card: same seed, same desert, its own rules. */
export function cactusDay(seed: number, hours: number): DayTally {
  return replayDay('opuntia', buildDay(seed, 'desert', hours), 1)
}
