/**
 * Shared harness helpers.
 *
 * The problem this exists for: several assertions in the Motion Yard measure
 * *hand timing* — the harness taps a stopwatch a fixed delay after a simulated
 * event and checks the reading. Sim time only advances on rendered frames, so
 * on a software renderer at 5 fps a tap can land a whole 200 ms frame late and
 * the assertion fails on a build that is perfectly correct. It has done exactly
 * that, identically, on a pristine build of the previous head.
 *
 * A test that fails for reasons unrelated to the code is worse than no test:
 * people learn to ignore it, and then it cannot tell them anything. So instead
 * of loosening the tolerance until it passes everywhere — which would let a
 * real regression through — the suite now **measures the renderer first and
 * reports these checks as SKIP when the frame rate cannot support them**, with
 * the measured number in the line.
 *
 * A skip is never a pass. It is counted separately, printed in the tally, and
 * `VERIFY_STRICT=1` turns every skip into a failure so that a run on real
 * hardware — or in CI on a GPU runner — demands them.
 */

/**
 * A click that survives a renderer running at one frame per second.
 *
 * Playwright's `click()` makes several round-trips to the page — scroll into
 * view, hit test, dispatch — and each one queues behind the main thread. In the
 * Rate Lab under SwiftShader a trivial `evaluate(() => 1)` took **4.2 seconds**,
 * so even a forced click blew a 30 s budget on a button that was visible,
 * enabled, unobstructed and worked perfectly when the event was dispatched
 * directly. The app was never the problem.
 *
 * So: try the real click first, because it is the one that proves the element
 * is genuinely clickable, and fall back to dispatching the event rather than
 * failing a correct build. The fallback is reported, so a suite that quietly
 * starts needing it everywhere is visible rather than silent.
 */
/**
 * The real click's budget.
 *
 * 8 s was tuned on a fast host and is the wrong number, because the cost of
 * being too low is not "a slower test" — it is a **double click**. Playwright
 * throws when its own round trip overruns, not when the click fails, so a
 * successful-but-slow click falls into the fallback and gets dispatched a
 * second time. On anything that toggles, that turns the feature on and
 * immediately off again, and the suite then reports a working control as
 * broken. It did exactly that to "take on a mission" on a rehosted container,
 * where a successful click measured 8.6 s against this 8 s budget.
 *
 * So the budget is generous. A genuinely stuck element still reaches the
 * fallback, just later; a slow healthy one no longer gets clicked twice.
 */
const CLICK_BUDGET_MS = 25000

export async function resilientClick(locator, { timeout = CLICK_BUDGET_MS, label = 'element' } = {}) {
  try {
    await locator.click({ timeout })
    return 'click'
  } catch {
    // FIRST: did the click actually land?
    //
    // `click()` throws when *Playwright's* round trip overruns the budget —
    // which is not the same as the click failing. On a slow host the event is
    // dispatched, React unmounts the thing that was clicked, and only then does
    // the timeout fire. We arrive here with the work already done and the
    // element gone, and the fallback below then waits the full 90 s for a
    // button that no longer exists. That is not a slow test, it is a hang, and
    // it took down `verify-sugar` at its very first click on a rehosted
    // container while the identical build had passed 115/115 an hour earlier.
    //
    // An element that has vanished is the evidence that the click worked.
    if ((await locator.count()) === 0) {
      console.log(`   · ${label}: click landed, but Playwright's own round trip overran the budget`)
      return 'click'
    }

    // Otherwise the element is still there and the click really did not take.
    // Let the main thread breathe before trying again: dispatching immediately
    // queues behind the same saturated thread that just refused the click.
    // Measured on a slow host — back-to-back the fallback hung, with a
    // two-second pause the identical dispatch landed in 1.6 s. It costs nothing
    // on a fast machine, because a fast machine never gets here.
    await locator.page().waitForTimeout(2000)

    // The fallback needs a *longer* budget than the real click, not the same
    // one: it is used precisely when the main thread is saturated, and the
    // Motion Yard has gone over 30 s at its welcome card.
    // dispatchEvent(type, eventInit, options) — the timeout belongs in the
    // THIRD argument. Passing it second makes it an event property and leaves
    // the default 30 s in force, which is how a "90 s" fallback timed out at
    // exactly 30.
    await locator.dispatchEvent('click', undefined, { timeout: 90000 })
    console.log(`   · ${label}: real click timed out on a slow renderer, dispatched the event instead`)
    return 'dispatched'
  }
}

/** Frames per second the page is actually managing, measured over ~1.2 s. */
export async function measureFps(page, ms = 1200) {
  return page.evaluate(
    (duration) =>
      new Promise((resolve) => {
        let frames = 0
        const t0 = performance.now()
        const tick = () => {
          frames += 1
          if (performance.now() - t0 >= duration) {
            resolve(Math.round((frames * 1000) / (performance.now() - t0)))
          } else {
            requestAnimationFrame(tick)
          }
        }
        requestAnimationFrame(tick)
      }),
    ms,
  )
}

/**
 * Below this, one frame is longer than the tolerance these assertions allow,
 * so the harness cannot tap accurately enough to measure anything. 25 fps = a
 * 40 ms frame against tolerances of 0.35 s and up, which leaves ample room.
 */
export const HAND_TIMING_MIN_FPS = 25

/**
 * Build the reporting trio for a suite.
 *
 *   const { check, checkTimed, tally } = reporter()
 *   checkTimed(fps, 'stopwatch ≈ true interval', ok, extra)
 *   process.exit(tally())
 */
export function reporter() {
  const results = []
  let skipped = 0

  const check = (name, ok, extra = '') => {
    const line = `${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`
    results.push({ name, ok, line })
    console.log(line)
    return ok
  }

  /**
   * An assertion that only means something when the renderer is fast enough.
   * Skips loudly below the threshold — unless VERIFY_STRICT=1, which makes the
   * skip a failure so real-hardware runs still demand it.
   */
  const checkTimed = (fps, name, ok, extra = '') => {
    const usable = fps >= HAND_TIMING_MIN_FPS
    if (usable) return check(name, ok, extra)
    if (process.env.VERIFY_STRICT === '1') {
      return check(name, ok, `${extra} [STRICT: run at ${fps} fps, below the ${HAND_TIMING_MIN_FPS} fps this needs]`)
    }
    skipped += 1
    const line = `SKIP ${name} — needs ${HAND_TIMING_MIN_FPS} fps to hand-time, renderer managed ${fps}`
    results.push({ name, ok: true, skipped: true, line })
    console.log(line)
    return true
  }

  /**
   * Record that a check could not be run, and why. Never a pass: it is counted
   * apart, printed, and turned into a failure by VERIFY_STRICT=1.
   */
  const skip = (name, reason) => {
    if (process.env.VERIFY_STRICT === '1') return check(name, false, `[STRICT] ${reason}`)
    skipped += 1
    const line = `SKIP ${name} — ${reason}`
    results.push({ name, ok: true, skipped: true, line })
    console.log(line)
    return true
  }

  const tally = () => {
    const fails = results.filter((r) => !r.ok)
    const ran = results.length - skipped
    console.log(
      `\n${ran - fails.length}/${ran} checks passed` +
        (skipped ? `, ${skipped} skipped (renderer too slow to measure — set VERIFY_STRICT=1 to demand them)` : ''),
    )
    if (fails.length) console.log(fails.map((f) => '  ' + f.line).join('\n'))
    return fails.length ? 1 : 0
  }

  return { check, checkTimed, skip, tally, results }
}
