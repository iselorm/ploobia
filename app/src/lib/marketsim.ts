/**
 * The Market's live state — the mutable object the scene reads every frame.
 *
 * Same pattern as `createAtomSim`: the page owns it, the scene ticks it, and
 * the HUD reads snapshots. The day itself is `lib/market`'s `DayRun`, replayed
 * on wall time so that a day is DAY_SECONDS long on a fast laptop and on a
 * slow tablet alike; only the picture runs on frame time.
 */

import { DAY_SECONDS, stepDay, type DayRun, type Shopper } from './market'

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
  }
}

/** Called once per frame by the scene. */
export function stepMarket(sim: MarketSim, rawDt: number, nowMs: number): void {
  sim.time += Math.min(rawDt, 0.05)
  const run = sim.run
  if (!run || run.done) return
  const target = Math.min(1, (nowMs - sim.runStartedMs) / 1000 / DAY_SECONDS)
  const dt = target - sim.runSteppedTo
  if (dt > 0) {
    stepDay(run, dt)
    sim.runSteppedTo = run.t
    if (run.last?.kind === 'sale') {
      sim.lastSaleN = run.last.n
      sim.lastSaleAt = sim.time
    }
    sim.stock = run.unsold
    sim.till = run.till
    sim.late = run.t > 0.5
  }
}

export function beginRun(sim: MarketSim, run: DayRun, nowMs: number): void {
  sim.run = run
  sim.runStartedMs = nowMs
  sim.runSteppedTo = 0
  sim.stock = run.stock0
  sim.till = 0
  sim.late = false
  sim.lastSaleN = 0
}
