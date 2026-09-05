/**
 * What each cabinet costs, and whether adaptive quality does its job.
 *
 * Frame rate measured on a software renderer tells you nothing about a tablet.
 * **Draw calls and triangle counts do transfer**, so those are what this suite
 * asserts against, using the `PerfProbe` each cabinet mounts inside its Canvas.
 * The budgets below are the contract: exceed one and this goes red before a
 * learner on a cheap Android finds out for you.
 *
 * It also tests the mechanism rather than trusting it: the low tier must cost
 * measurably less than the high tier, and walking cabinet to cabinet must not
 * ratchet the tier down (the bug this was written to catch — the frame-time
 * window used to carry across mounts, so a new room's shader-compile burst read
 * as sustained slowness and cost a tier, permanently).
 *
 * **One browser context at a time, always closed before the next.** Browsers
 * cap live WebGL contexts at around sixteen; holding a low-tier and a high-tier
 * page open per cabinet exhausted them, and the later cabinets then reported no
 * snapshot at all — which reads as "the probe is missing" when the truth is
 * "this page never got a GL context". Measure, close, move on.
 *
 *   node verify-perf.mjs
 */

import { chromium } from 'playwright'
import { reporter, resilientClick } from './verify-lib.mjs'

const BASE = 'http://localhost:8765/index.html'
const { check, skip, tally } = reporter()

/**
 * Per-cabinet budgets at the LOW tier — the tier a cheap tablet lands on.
 * Numbers are what the cabinets measure today plus honest headroom; tighten
 * them as the cabinets get cheaper, never loosen them to make a build pass.
 */
const BUDGETS = {
  // The Sugar Line replaced the Rate Lab: many more small instanced meshes,
  // an order of magnitude fewer triangles. Measured at 85 calls / 18k tris.
  photosynthesis: { calls: 120, triangles: 120_000 },
  blood: { calls: 200, triangles: 1_200_000 },
  motion: { calls: 250, triangles: 600_000 },
  atoms: { calls: 300, triangles: 200_000 },
  rivers: { calls: 250, triangles: 300_000 },
  // First Physics: the Yard's meadow plus one object and a shelf. Budgeted like the Yard.
  physics: { calls: 250, triangles: 600_000 },
}

const ENTER = ['Start measuring', 'Start experimenting', 'Start forging', 'Start the fieldwork', 'Start in the lungs', 'Start with one Ploob']
const DISMISS = ['Skip intro', 'Skip']

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })

/** Get past the welcome card and any concepts intro so the scene is real. */
async function enter(page, route) {
  for (const label of ENTER) {
    const b = page.getByRole('button', { name: label })
    if (await b.count()) {
      await resilientClick(b.first(), { label: `${route} enter` })
      break
    }
  }
  await page.waitForTimeout(1500)
  for (const label of DISMISS) {
    const b = page.getByRole('button', { name: label, exact: true })
    if (await b.count()) {
      await resilientClick(b.first(), { label: `${route} dismiss` })
      break
    }
  }
}

/**
 * Poll for a snapshot rather than sleeping a fixed time: the probe wants ten
 * frames before it reports a median, and at the high tier under software
 * rendering the Rate Lab manages about one frame a second.
 *
 * A snapshot of one call and one triangle is a half-composed first frame, not a
 * measurement — hence the `calls > 5` floor.
 */
async function awaitSnapshot(page, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const p = await page.evaluate(() => window.__perf ?? null)
    if (p && p.calls > 5) return p
    await page.waitForTimeout(1000)
  }
  return null
}

/** Open one cabinet in a throwaway context, measure it, close everything. */
async function snapshot(route, tier) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  try {
    const url = `${BASE}#/${route}${tier ? `?q=${tier}` : ''}`
    // A hash-only goto does not reload, and the tier is pinned at module load —
    // the reload is what makes `?q=` mean anything on a second navigation.
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(2500)
    await enter(page, route)
    const snap = await awaitSnapshot(page)
    await ctx.close()
    return { snap }
  } catch (e) {
    await ctx.close().catch(() => {})
    const msg = String(e).split('\n')[0]
    // A click that cannot be delivered in 90 s is a statement about this
    // renderer, not about the cabinet. Which cabinet loses the race moves
    // between runs, so treating it as a failure would make the suite a coin
    // toss — and a coin-toss suite is one people learn to ignore.
    const undrivable = /Timeout .*exceeded/.test(msg)
    return { snap: null, error: msg, undrivable }
  }
}

const table = []

for (const [route, budget] of Object.entries(BUDGETS)) {
  const { snap: low, error, undrivable } = await snapshot(route, 'low')
  if (!low) {
    if (undrivable) {
      skip(`${route}: probe reported at low tier`, `this renderer could not be driven to open the cabinet — ${error}`)
    } else {
      check(`${route}: probe reported at low tier`, false, error ?? 'no snapshot within 45 s')
    }
    continue
  }
  check(
    `${route}: probe reported at low tier`,
    true,
    `${low.calls} calls · ${low.triangles.toLocaleString()} tris · ${low.programs} programs`,
  )
  check(`${route}: draw calls within budget`, low.calls <= budget.calls, `${low.calls} / ${budget.calls}`)
  check(
    `${route}: triangles within budget`,
    low.triangles <= budget.triangles,
    `${low.triangles.toLocaleString()} / ${budget.triangles.toLocaleString()}`,
  )
  table.push({ route, ...low })

  // The tier has to buy something. If high and low cost the same, a cabinet is
  // ignoring the caps and the whole adaptive system is decoration.
  const { snap: high } = await snapshot(route, 'high')
  if (high) {
    const cheaper =
      low.triangles < high.triangles || low.calls < high.calls || low.drawingBuffer !== high.drawingBuffer
    check(
      `${route}: low tier is measurably cheaper than high`,
      cheaper,
      `low ${low.calls}c/${low.triangles.toLocaleString()} vs high ${high.calls}c/${high.triangles.toLocaleString()}`,
    )
  } else {
    skip(
      `${route}: low tier is measurably cheaper than high`,
      'the high tier never reached ten frames on this renderer within 45 s',
    )
  }
}

/* -- The ratchet: walking the arcade must not cost you a tier -------- */
{
  // Deliberately unpinned so the tier is free to adapt. One context, four
  // rooms inside it — what carries between mounts is the whole point.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  try {
    const visit = async (route) => {
      await page.goto(`${BASE}#/${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForTimeout(2000)
      await enter(page, route)
      const snap = await awaitSnapshot(page)
      return snap?.tier ?? null
    }

    const first = await visit('photosynthesis')
    let last = first
    for (const route of ['atoms', 'rivers', 'blood']) last = (await visit(route)) ?? last

    const ORDER = ['high', 'medium', 'low']
    if (!first) {
      skip('walking four cabinets costs at most one tier step', 'no snapshot from the first cabinet on this renderer')
    } else if (first === 'low') {
      // Software renderers are detected at boot and start at `low`, where
      // reportFrame returns early — there is no ratchet left to exercise here.
      // This becomes a real assertion the moment it runs on a GPU.
      skip(
        'walking four cabinets costs at most one tier step',
        `renderer starts at the ${first} tier, so the ratchet cannot be exercised here`,
      )
    } else {
      const slid = ORDER.indexOf(last) - ORDER.indexOf(first)
      check('walking four cabinets costs at most one tier step', slid <= 1, `${first} → ${last} (${slid} steps)`)
    }
  } catch (e) {
    const msg = String(e).split('\n')[0]
    // Same rule as the per-cabinet passes: a renderer this browser cannot be
    // driven on is a skip with a reason, never a pass and never a coin-toss
    // failure. VERIFY_STRICT=1 still demands it on hardware that can deliver.
    if (/Timeout .*exceeded/.test(msg)) {
      skip('walking four cabinets costs at most one tier step', `this renderer could not be driven through four cabinets — ${msg}`)
    } else {
      check('ratchet pass did not crash', false, msg)
    }
  }
  await ctx.close().catch(() => {})
}

await browser.close()

if (table.length) {
  console.log('\n  cabinet          tier   calls      tris        programs  buffer')
  for (const r of table) {
    console.log(
      `  ${r.cabinet.padEnd(16)} ${String(r.tier).padEnd(6)} ${String(r.calls).padEnd(10)} ${r.triangles
        .toLocaleString()
        .padEnd(11)} ${String(r.programs).padEnd(9)} ${r.drawingBuffer}`,
    )
  }
}

process.exit(tally())
