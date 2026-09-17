/**
 * The Market's live state — the mutable object the scene reads every frame.
 *
 * Same pattern as `createAtomSim`: the page owns it, the scene ticks it, and
 * the HUD reads snapshots. The day itself is `lib/market`'s `DayRun`, replayed
 * on wall time so that a day is DAY_SECONDS long on a fast laptop and on a
 * slow tablet alike; only the picture runs on frame time.
 */

import { DAY_SECONDS, EVENT_T, stepDay, type DayRun, type Shopper } from './market'

export type MarketViewId = 'stall' | 'alley' | 'board'

export interface MarketSim {
  /** Frame-clamped time for idle motion. */
  time: number
  /** The day being replayed, or null between days. */
  run: DayRun | null
  /** Wall-clock ms at which the run started. */
  runStartedMs: number
  /** How far the run had got when it was last stepped, as a day fraction. */
  runSteppedTo: number
  /** The crowd for the seed — drawn even between days so the alley is never empty. */
  shoppers: Shopper[]
  /** Which lighting card is up: morning until the day passes noon. */
  late: boolean
  viewId: MarketViewId
  viewSeq: number
  viewReset: number
  viewZoom: number
  autoOrbit: boolean
  /** A beat the scene plays once: the till ringing open on the target. */
  ringAt: number
  /** The last sale, for the needle and the coins. */
  lastSaleN: number
  lastSaleAt: number
  /** Tomatoes in the basin right now (the count is the state). */
  stock: number
  /** Cedis in the till right now. */
  till: number
  /**
   * The four o'clock event (review 1): when a day has an event pending, the
   * replay stops EXACTLY at EVENT_T and waits — every shopper before four is
   * settled at the old price and none after it, so the day is still one solve
   * whichever way the learner decides. Wall time spent paused is given back to
   * the run on resume.
   */
  eventPending: boolean
  paused: boolean
  pausedMs: number
  /** The price on the lever before the stall opens — the alley thins and thickens to it (a head-count, not a list). */
  previewPrice: number | null
  /** The last few settlements, for the bubbles over the shoppers' heads. */
  recent: Array<{ shopper: number; kind: 'sale' | 'pass'; n: number; paid: number; at: number; seq: number }>
  recentSeq: number
  /**
   * Review 2's hero: the run is a REPLAY — the same crowd at the board the
   * learner did not choose. The scene draws it with the chrome gone and the
   * buyers' counts over their heads; the page records nothing from it.
   */
  replay: boolean
}

export function createMarketSim(): MarketSim {
  return {
    time: 0,
    run: null,
    runStartedMs: 0,
    runSteppedTo: 0,
    shoppers: [],
    late: false,
    viewId: 'stall',
    viewSeq: 0,
    viewReset: 0,
    viewZoom: 0,
    autoOrbit: false,
    ringAt: -1,
    lastSaleN: 0,
    lastSaleAt: -1,
    stock: 0,
    till: 0,
    eventPending: false,
    paused: false,
    pausedMs: 0,
    previewPrice: null,
    recent: [],
    recentSeq: 0,
    replay: false,
  }
}

/** Called once per frame by the scene. */
export function stepMarket(sim: MarketSim, rawDt: number, nowMs: number): void {
  sim.time += Math.min(rawDt, 0.05)
  const run = sim.run
  if (!run || run.done || sim.paused) return
  let target = Math.min(1, (nowMs - sim.runStartedMs) / 1000 / DAY_SECONDS)
  if (sim.eventPending) target = Math.min(target, EVENT_T)
  const dt = target - sim.runSteppedTo
  if (dt > 0) {
    const sales0 = run.sales.length
    const passes0 = run.passes.length
    stepDay(run, dt)
    sim.runSteppedTo = run.t
    if (run.last?.kind === 'sale') {
      sim.lastSaleN = run.last.n
      sim.lastSaleAt = sim.time
    }
    for (let i = sales0; i < run.sales.length; i++) {
      const sl = run.sales[i]
      sim.recent.push({ shopper: sl.shopper, kind: 'sale', n: sl.n, paid: sl.paid, at: sim.time, seq: sim.recentSeq++ })
    }
    for (let i = passes0; i < run.passes.length; i++) sim.recent.push({ shopper: run.passes[i], kind: 'pass', n: 0, paid: 0, at: sim.time, seq: sim.recentSeq++ })
    if (sim.recent.length > 12) sim.recent.splice(0, sim.recent.length - 12)
    sim.stock = run.unsold
    sim.till = run.till
    sim.late = run.t > 0.5
  }
  if (sim.eventPending && run.t >= EVENT_T - 1e-9) {
    if (run.unsold > 0) {
      sim.paused = true
      sim.pausedMs = nowMs
    } else {
      // nothing left to decide about — the day runs on
      sim.eventPending = false
    }
  }
}

/** The learner has decided at four: give the paused wall time back and run on. */
export function resumeRun(sim: MarketSim, nowMs: number): void {
  if (sim.paused) sim.runStartedMs += nowMs - sim.pausedMs
  sim.paused = false
  sim.eventPending = false
}

export function beginRun(sim: MarketSim, run: DayRun, nowMs: number, withEvent = false, replay = false): void {
  sim.run = run
  sim.replay = replay
  sim.runStartedMs = nowMs
  sim.runSteppedTo = 0
  sim.stock = run.stock0
  sim.till = 0
  sim.late = false
  sim.lastSaleN = 0
  sim.eventPending = withEvent
  sim.paused = false
  sim.previewPrice = null
  sim.recent = []
}
