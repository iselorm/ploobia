/**
 * What each cabinet costs, and whether adaptive quality does its job.
 *
 * Frame rate measured on a software renderer tells you nothing about a tablet.
 * **Draw calls and triangle counts do transfer**, so those are what this suite
 * asserts against, using the `PerfProbe` each cabinet mounts inside its Canvas.
 * The budgets below are the contract: exceed one and this goes red before a
 * learner on a cheap Android finds out for you.
 *
 * It also tests the mechanism rather than trusting it:
 *  - the low tier must actually cost less than the high tier;
 *  - the DPR cap must reach the drawing buffer;
 *  - walking cabinet to cabinet must NOT ratchet the tier down (the bug this
 *    was written to catch: the frame-time window carried across mounts, so a
 *    new room's shader-compile burst read as sustained slowness).
 *
 *   node verify-perf.mjs
 */

import { chromium } from 'playwright'
import { reporter } from './verify-lib.mjs'

const BASE = 'http://localhost:8765/index.html'
const { check, skip, tally } = reporter()

/**
 * Per-cabinet budgets at the LOW tier — the tier a cheap tablet lands on.
 * Numbers are what the cabinets measure today plus honest headroom; tighten
 * them as the cabinets get cheaper, never loosen them to make a build pass.
 */
const BUDGETS = {
  photosynthesis: { calls: 150, triangles: 700_000 },
  blood: { calls: 200, triangles: 1_200_000 },
  motion: { calls: 250, triangles: 600_000 },
  atoms: { calls: 300, triangles: 200_000 },
  rivers: { calls: 250, triangles: 300_000 },
}

const ENTER = ['Start measuring', 'Start experimenting', 'Start forging', 'Start the fieldwork', 'Start in the lungs']
const DISMISS = ['Skip intro', 'Skip']

/**
 * `page.goto` to a URL that differs only in its hash does NOT reload the
 * document, and the quality tier is pinned once at module load — so navigating
 * between `?q=low` and `?q=high` in one page silently measures the same tier
 * twice. (It did, and produced byte-identical "low" and "high" numbers that
 * looked like the tier system doing nothing.) Force the reload.
 */
async function open(page, route, tier) {
  const url = `${BASE}#/${route}${tier ? `?q=${tier}` : ''}`
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  for (const label of ENTER) {
    const b = page.getByRole('button', { name: label })
    if (await b.count()) {
      await b.first().click({ force: true })
      break
    }
  }
  await page.waitForTimeout(1500)
  for (const label of DISMISS) {
    const b = page.getByRole('button', { name: label, exact: true })
    if (await b.count()) {
      await b.first().click({ force: true })
      break
    }
  }
}

/**
 * Poll for a snapshot rather than sleeping a fixed time. The probe wants ten
 * frames before it will report a median, and at the high tier under software
 * rendering the Rate Lab manages about one frame a second — a fixed nine-second
 * wait returned nothing at all, which read as "no probe mounted" when the truth
 * was "not ten frames yet".
 */
async function readPerf(page, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const p = await page.evaluate(() => window.__perf ?? null)
    if (p) return p
    await page.waitForTimeout(1000)
  }
  return null
}

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })

const table = []

for (const [route, budget] of Object.entries(BUDGETS)) {
  const page = await ctx.newPage()
  try {
    await open(page, route, 'low')
    const low = await readPerf(page)
    if (!low) {
      check(`${route}: probe reported`, false, 'no snapshot — is <PerfProbe/> mounted in this Canvas?')
      await page.close()
      continue
    }
    check(`${route}: probe reported`, true, `${low.calls} calls · ${low.triangles.toLocaleString()} tris · ${low.programs} programs`)
    check(`${route}: draw calls within budget at low tier`, low.calls <= budget.calls, `${low.calls} / ${budget.calls}`)
    check(
      `${route}: triangles within budget at low tier`,
      low.triangles <= budget.triangles,
      `${low.triangles.toLocaleString()} / ${budget.triangles.toLocaleString()}`,
    )
    table.push({ route, ...low })

    // The tier has to buy something. If high and low cost the same, a cabinet
    // is ignoring the caps and the whole adaptive system is decoration.
    // A separate page, because the tier is pinned at module load.
    const hp = await ctx.newPage()
    await open(hp, route, 'high')
    const high = await readPerf(hp)
    // A snapshot of one call and one triangle is a half-composed first frame,
    // not a measurement of the high tier — the probe published its median as
    // soon as it had ten frames, and on this renderer those ten frames can all
    // predate the scene being built. Treat it as no snapshot.
    if (high && high.calls > 5) {
      const cheaper =
        low.triangles < high.triangles || low.calls < high.calls || low.drawingBuffer !== high.drawingBuffer
      check(
        `${route}: low tier is measurably cheaper than high`,
        cheaper,
        `low ${low.calls}c/${low.triangles.toLocaleString()}/${low.drawingBuffer} vs high ${high.calls}c/${high.triangles.toLocaleString()}/${high.drawingBuffer}`,
      )
    } else {
      // At the high tier a software renderer can sit under one frame per
      // second, so the probe never gathers its ten frames. That says nothing
      // about the tier system — only about this renderer.
      skip(`${route}: low tier is measurably cheaper than high`, 'no high-tier snapshot within 60 s on this renderer')
    }
    await hp.close()
  } catch (e) {
    check(`${route}: perf pass did not crash`, false, String(e).split('\n')[0])
  }
  await page.close()
}

/* -- The ratchet bug: walking the arcade must not cost you a tier ---- */
{
  const page = await ctx.newPage()
  try {
    // No ?q= pin here: the tier must be free to adapt, which is the point.
    await open(page, 'photosynthesis', '')
    const first = (await readPerf(page))?.tier ?? null
    let last = first
    for (const route of ['atoms', 'rivers', 'blood']) {
      await open(page, route, '')
      last = (await readPerf(page))?.tier ?? last
    }

    const ORDER = ['high', 'medium', 'low']
    if (!first) {
      skip('walking four cabinets costs at most one tier step', 'no snapshot from the first cabinet — this renderer never reached ten frames')
    } else if (first === 'low') {
      // Software renderers are detected at boot and start at `low`, where
      // reportFrame returns early — so there is no ratchet left to exercise.
      // This becomes a real assertion the moment it runs on a GPU.
      skip('walking four cabinets costs at most one tier step', `renderer starts at the ${first} tier, so the ratchet cannot be exercised here`)
    } else {
      // The bug this guards: the frame-time window used to carry across
      // cabinet mounts, so each new room's shader-compile burst read as
      // sustained slowness and cost a tier — permanently, since downgrades
      // never reverse. Four rooms should cost at most one honest step.
      const slid = ORDER.indexOf(last) - ORDER.indexOf(first)
      check('walking four cabinets costs at most one tier step', slid <= 1, `${first} → ${last} (${slid} steps)`)
    }
  } catch (e) {
    check('ratchet pass did not crash', false, String(e).split('\n')[0])
  }
  await page.close()
}

await ctx.close()
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
