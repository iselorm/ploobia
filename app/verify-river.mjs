/**
 * River & Flood Bench checks. Serve dist/ on :8765 first
 * (python3 -m http.server 8765 in dist). Drives the real HUD controls and
 * reads the model through window.__riverSim / window.__riverModel, the same
 * way verify-motion.mjs does for the yard.
 */
import { chromium } from 'playwright'

const URL = 'http://localhost:8765/index.html#/rivers'
const results = []
const check = (n, ok, extra = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`
  results.push(line)
  console.log(line)
}
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })

const simGet = (page, expr) => page.evaluate((e) => new Function('s', 'm', 'return ' + e)(window.__riverSim, window.__riverModel), expr)

async function waitSim(page, expr, timeout = 15000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    if (await simGet(page, expr)) return true
    await page.waitForTimeout(80)
  }
  return false
}

async function waitFor(page, locator, timeout = 12000) {
  try {
    await locator.first().waitFor({ state: 'visible', timeout })
    return true
  } catch {
    return false
  }
}

const consoleErrors = []
function watchConsole(page) {
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('ERR_TUNNEL_CONNECTION_FAILED')) consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => consoleErrors.push(String(e)))
}

/** Time the float at the current station with real stopwatch taps. */
async function timeFloat(page) {
  await page.getByRole('button', { name: 'Release the float' }).click({ force: true })
  await page.waitForTimeout(250)
  await page.locator('[aria-label="Stopwatch"]').click({ force: true })
  await waitSim(page, 's.floatActive === false', 25000)
  await page.waitForTimeout(250)
  await page.locator('[aria-label="Stopwatch"]').click({ force: true })
  await page.waitForTimeout(600)
}

/* ---------------- desktop pass ---------------- */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  watchConsole(page)
  await page.goto('http://localhost:8765/index.html#/', { waitUntil: 'networkidle' })
  check('hall shows the River & Flood Bench live', await waitFor(page, page.getByText('Enter the basin')))

  await page.goto(URL, { waitUntil: 'networkidle' })
  check('welcome renders', await waitFor(page, page.getByRole('heading', { name: 'The River Basin' })))
  check('band picker on welcome', await waitFor(page, page.getByRole('button', { name: /Scientist/ })))

  await page.getByRole('button', { name: 'Start the fieldwork' }).click({ force: true })
  await page.waitForTimeout(1200)
  check('scene canvas up', (await page.locator('canvas').count()) > 0)
  check('sim + model exposed', await page.evaluate(() => !!window.__riverSim && !!window.__riverModel))

  /* --- the model itself: Bradshaw, bankfull, catchment --- */
  const v1 = await simGet(page, 'm.velocityAt(56)')
  const v2 = await simGet(page, 'm.velocityAt(88)')
  const v3 = await simGet(page, 'm.velocityAt(124)')
  check('velocity rises downstream (the misconception payoff)', v1 < v2 && v2 < v3, `${v1.toFixed(2)} < ${v2.toFixed(2)} < ${v3.toFixed(2)}`)
  const vMouth = await simGet(page, 'm.velocityAt(150)')
  check('the estuary slows the river (deposition)', vMouth < v3, `${vMouth.toFixed(2)} at the mouth`)
  check('baseflow sits well under bankfull', await simGet(page, 'm.stageAt(124) > 0.2 && m.stageAt(124) < 0.7'))
  const cForest = await page.evaluate(() => {
    window.__riverSim.landUse = 'forest'
    return window.__riverModel.catchmentNow()
  })
  const cTown = await page.evaluate(() => {
    window.__riverSim.landUse = 'town'
    const c = window.__riverModel.catchmentNow()
    window.__riverSim.landUse = 'farm'
    return c
  })
  check('town runs off harder and faster than forest', cTown.runoff > cForest.runoff * 2 && cTown.lag < cForest.lag * 0.5)
  check('waterfall retreats under the years', (await simGet(page, 'm.fallsAt(30)')) < (await simGet(page, 'm.fallsAt(0)')))

  /* --- lenses locked before evidence --- */
  check('underwater lens locked at first', await page.getByRole('button', { name: /Underwater lens/ }).isDisabled())
  check('time-lapse locked at first', await page.getByRole('button', { name: /Time-lapse/ }).isDisabled())

  /* --- the field kit: tape, sounding, float, discharge --- */
  await page.getByRole('button', { name: 'Tape the width' }).click({ force: true })
  check('width reading lands', await waitFor(page, page.getByText('Width'), 25000))
  await page.getByRole('button', { name: 'Sound the bed' }).click({ force: true })
  check('cross-section reading lands', await waitFor(page, page.getByText('Cross-section'), 25000))

  await timeFloat(page)
  check('float timing becomes a velocity reading', await waitFor(page, page.getByText('Velocity'), 5000))
  check('velocity chart appears', await waitFor(page, page.getByText(/velocity \(m\/s\) downstream/), 5000))

  check('discharge composer offers A × v̄', await waitFor(page, page.getByText(/compute discharge/), 5000))
  await page.getByText(/compute discharge/).click({ force: true })
  check('discharge reading lands', await waitFor(page, page.getByText('Discharge'), 5000))

  /* --- fastest-water prediction + all three stations --- */
  await page.getByRole('button', { name: 'S1', exact: true }).click({ force: true })
  check('flag committed', await waitSim(page, 's.fastestFlag === "st1"', 3000))
  await page.getByRole('button', { name: 'Station 1' }).click({ force: true })
  await page.waitForTimeout(400)
  await timeFloat(page)
  await page.getByRole('button', { name: 'Station 3' }).click({ force: true })
  await page.waitForTimeout(400)
  await timeFloat(page)
  check('three hand timings earn the flow meter', await waitSim(page, 's.meterUnlocked === true', 8000))
  check('fastest-water mission complete (with the flag on the wrong horse)', await waitFor(page, page.getByText(/Never trust "looks fast"/), 8000))
  check('underwater lens now earned', !(await page.getByRole('button', { name: /Underwater lens/ }).isDisabled()))

  /* --- the flood: storm, hydrograph, silt --- */
  const hydroBefore = await simGet(page, 's.hydro.length')
  await page.getByRole('button', { name: 'Run a storm' }).click({ force: true })
  check('storm starts', await waitSim(page, 's.stormActive === true', 4000))
  check('the gauge climbs past bankfull', await waitSim(page, 's.stage > 1', 120000))
  check('hydrograph series grows', (await simGet(page, 's.hydro.length')) > hydroBefore)
  check('the pebble moves in high water', await waitSim(page, 's.pebble.travelled > 0.5', 90000))
  check('storm ends and is logged', await waitSim(page, 's.storms.length === 1', 200000))
  check('the flood is on the record', await simGet(page, 's.storms[0].flooded === true'))
  check('fresh silt on the floodplain', (await simGet(page, 's.siltFresh')) > 0.5)
  check('make-it-rain mission complete', await waitFor(page, page.getByText(/free topsoil/), 8000))

  /* --- time-lapse lens (earned by now), ox-bow, long exposure --- */
  check('time-lapse now earned', !(await page.getByRole('button', { name: /Time-lapse/ }).isDisabled()))
  await page.getByRole('button', { name: /Time-lapse/ }).click({ force: true })
  check('years advance under the lens', await waitSim(page, 's.years > 1', 8000))
  await page.evaluate(() => {
    window.__riverSim.years = 29
  })
  check('the ox-bow pinches past year 24', await waitSim(page, 'm.oxbowT(s.years) > 0.5', 15000))
  check('cut-the-corner mission completes', await waitSim(page, 's.years > 30', 15000) && (await waitFor(page, page.getByText(/abandoned its own channel/), 9000)))
  await page.getByRole('button', { name: /Time-lapse/ }).click({ force: true })

  /* --- the living map --- */
  await page.getByRole('button', { name: 'Map', exact: true }).click({ force: true })
  check('the world flattens into the map', await waitSim(page, 's.mapT > 0.9', 8000))
  const camY = await page.evaluate(() => window.__cam?.[1] ?? 0)
  check('camera reads the map from above', camY > 50, `camera y ${camY.toFixed(0)}`)
  await page.getByRole('button', { name: 'Map', exact: true }).click({ force: true })
  await waitSim(page, 's.mapT < 0.2', 8000)

  /* --- underwater lens --- */
  await page.getByRole('button', { name: /Underwater lens/ }).click({ force: true })
  check('lens dives', await waitSim(page, 's.lens === "under"', 3000))
  const dived = await waitSim(
    page,
    '(window.__cam?.[1] ?? 99) < m.profileH({ st1: 56, st2: 88, st3: 124 }[s.station]) + 0.6',
    45000,
  )
  const underY = await page.evaluate(() => window.__cam?.[1] ?? 99)
  check('camera sinks into the water column', dived, `y ${underY.toFixed(2)}`)
  await page.getByRole('button', { name: /Underwater lens/ }).click({ force: true })

  /* --- pebble measured twice = diary mission needs distance; check reading --- */
  await page.getByRole('button', { name: 'Your pebble', exact: true }).click({ force: true })
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Measure it' }).click({ force: true })
  check('pebble reading lands', await waitFor(page, page.getByText('Pebble'), 5000))

  /* --- night + the wadi --- */
  await page.getByRole('button', { name: 'Night' }).click({ force: true })
  check('night falls', await waitSim(page, '(window.__riverWorld?.daylight ?? 1) < 0.35', 40000))
  await page.getByRole('button', { name: 'Night' }).click({ force: true })
  await page.getByRole('button', { name: 'Desert wadi' }).click({ force: true })
  check('the wadi runs nearly dry', await waitSim(page, 'm.totalQ(124) < 0.4', 8000))
  check('wadi storms fall on the headwaters only', await simGet(page, 's.basin === "wadi"'))
  await page.getByRole('button', { name: 'Temperate valley' }).click({ force: true })

  /* --- Analyst layer --- */
  await page.getByRole('button', { name: 'Analyst', exact: true }).first().click({ force: true })
  await page.waitForTimeout(600)
  check('Hjulström curve for the Analyst', await waitFor(page, page.getByText(/Hjulström/), 6000))
  check('defences carry a budget', await waitFor(page, page.getByText(/budget \d+\/150/), 6000))
  await page.getByRole('button', { name: /^Defences/ }).click({ force: true })
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /Levées/ }).click({ force: true })
  check('levée placed', await waitSim(page, 's.defences.has("levee")', 3000))
  await page.getByRole('button', { name: /Dam \+ reservoir/ }).click({ force: true })
  await page.waitForTimeout(300)
  const spent = await simGet(page, '[...s.defences].length')
  check('budget blocks over-spending (levée 40 + dam 120 > 150)', spent === 1, `${spent} defences placed`)
  await page.getByRole('button', { name: 'Scientist', exact: true }).first().click({ force: true })

  /* --- the drainage network and the delta --- */
  const net = await page.evaluate(() => {
    const m = window.__riverModel
    return {
      tribs: m.tributaries.length,
      catSource: m.catchmentAt(6),
      catMouth: m.catchmentAt(150),
      qAbove: m.totalQ(78),
      qBelow: m.totalQ(86),
      wAbove: m.channelW(78),
      wBelow: m.channelW(86),
      deltaLand: m.valleyH(m.distribX(0, 0.5), m.distribZ(0.5)),
      seaFloor: m.valleyH(0, 120),
    }
  })
  check('six tributaries in the model', net.tribs === 6, `${net.tribs}`)
  check('catchment grows source → mouth', net.catSource < 0.12 && net.catMouth > 0.95, `${net.catSource.toFixed(2)} → ${net.catMouth.toFixed(2)}`)
  check('discharge STEPS at the Ash Water confluence', net.qBelow > net.qAbove * 1.25, `${net.qAbove.toFixed(2)} → ${net.qBelow.toFixed(2)} m³/s`)
  check('the channel widens below the confluence too', net.wBelow > net.wAbove * 1.06, `${net.wAbove.toFixed(2)} → ${net.wBelow.toFixed(2)} m`)
  check('the delta is land, just above the sea', net.deltaLand > net.seaFloor && net.deltaLand < 1.2, `delta ${net.deltaLand.toFixed(2)} vs sea floor ${net.seaFloor.toFixed(2)}`)
  check('confluence checkpoint reports both sides', await page.evaluate(() => {
    const m = window.__riverModel
    const rows = m.checkpointData(m.checkpointById('conf'))
    return rows.some((r) => r[0] === 'Q above the join') && rows.some((r) => r[0] === 'Q below the join')
  }))

  /* --- free navigation and checkpoint stepping --- */
  const camBefore = await page.evaluate(() => window.__cam.slice(3))
  await page.locator('[aria-label="Next checkpoint"]').click({ force: true })
  check('next checkpoint selects the first gate', await waitSim(page, 's.atCp === 0', 4000))
  check('camera flies to it', await waitSim(page, 'Math.abs((window.__cam?.[5] ?? 0) - (-70)) < 30', 40000))
  await page.locator('[aria-label="Next checkpoint"]').click({ force: true })
  check('stepping advances along the course', await waitSim(page, 's.atCp === 1', 4000))
  await page.locator('[aria-label="Previous checkpoint"]').click({ force: true })
  check('stepping back works', await waitSim(page, 's.atCp === 0', 4000))
  const tgt0 = await page.evaluate(() => window.__cam.slice(3))
  await page.locator('[aria-label="Pan right"]').click({ force: true })
  await page.locator('[aria-label="Pan right"]').click({ force: true })
  await page.waitForTimeout(700)
  const tgt1 = await page.evaluate(() => window.__cam.slice(3))
  check('arrow pad pans the view', Math.hypot(tgt1[0] - tgt0[0], tgt1[2] - tgt0[2]) > 0.8, `moved ${Math.hypot(tgt1[0] - tgt0[0], tgt1[2] - tgt0[2]).toFixed(1)} m`)
  check('panning leaves checkpoint mode', await simGet(page, 's.atCp === -1'))
  // One frame can be ~0.6 s under SwiftShader, so poll rather than sleep.
  await page.keyboard.press('ArrowLeft')
  const keyMoved = await (async () => {
    const t0 = Date.now()
    while (Date.now() - t0 < 12000) {
      const t = await page.evaluate(() => window.__cam.slice(3))
      if (Math.hypot(t[0] - tgt1[0], t[2] - tgt1[2]) > 0.3) return true
      await page.waitForTimeout(200)
    }
    return false
  })()
  check('arrow KEYS pan too', keyMoved)
  void camBefore

  /* --- the camera never sinks into the ground --- */
  const sunk = await page.evaluate(() => {
    const c = window.__cam
    return c[1] - window.__riverTerrain(c[0], c[2])
  })
  check('camera stays above the land', sunk > 0.5, `${sunk.toFixed(1)} m clearance`)

  /* --- the journey map chip (collapsed by default, expands on tap) --- */
  check('journey chip on the HUD', await waitFor(page, page.getByRole('button', { name: 'The Journey' }), 6000))
  await page.getByRole('button', { name: 'The Journey' }).click({ force: true })
  check('journey map expands', await waitFor(page, page.getByText('THE JOURNEY · source → sea'), 5000))

  check('no console errors (desktop)', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
  await page.close()
}

/* ---------------- ride pass: source to sea in Ploob's wake ---------------- */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  watchConsole(page)
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Start the fieldwork' }).click({ force: true })
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: /Ride the river/ }).click({ force: true })
  check('ride starts', await waitSim(page, 's.rideActive === true && s.ploobActive === true', 5000))
  check('journey map open during the ride', await waitFor(page, page.getByText('THE JOURNEY · source → sea'), 6000))
  check('end-the-ride pill up', await waitFor(page, page.getByRole('button', { name: 'End the ride' }), 5000))
  check('first checkpoint card narrates', await waitFor(page, page.getByText('The Source'), 9000))
  check('checkpoint data is live', await waitFor(page, page.getByText('Discharge now'), 5000))
  // POV camera rides low, near the channel.
  await waitSim(page, 's.ploobS > 8', 20000)
  const dove = await waitSim(page, '(window.__cam?.[1] ?? 99) < m.profileH(Math.max(1, s.ploobS - 3)) + 4', 45000)
  const povY = await page.evaluate(() => window.__cam?.[1] ?? 99)
  check('camera flies Ploob-height, not overview-height', dove, `y ${povY.toFixed(1)}`)
  // Fast-forward down the course: checkpoints accumulate, then the sea ends it.
  await page.evaluate(() => { window.__riverSim.ploobS = 110 })
  check('big-bend gate passes', await waitSim(page, 's.rideCp >= 4', 8000))
  check('big-bend card shows', await waitFor(page, page.getByText('The Big Bend'), 6000))
  await page.evaluate(() => { window.__riverSim.ploobS = 152 })
  check('the sea ends the ride', await waitSim(page, 's.rideActive === false && s.ridesDone === 1', 10000))
  check('ride-complete notice', await waitFor(page, page.getByText(/Ride complete/), 8000))
  check('no console errors (ride)', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
  await page.close()
}

/* ---------------- demo pass ---------------- */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  watchConsole(page)
  await page.goto(URL + '?demo=1', { waitUntil: 'networkidle' })
  check('demo autostarts: Ploob speaks', await waitFor(page, page.getByText(/Ploob here/), 15000))
  check('Ploob rides the river', await waitSim(page, 's.ploobActive === true && s.ploobS > 5', 20000))
  check('demo drives the real world (gorge → follow)', await waitSim(page, 's.demoMode === true', 3000))
  await page.getByRole('button', { name: 'Skip' }).click({ force: true })
  await page.waitForTimeout(800)
  check('skip ends the demo and clears its traces', await simGet(page, 's.demoMode === false && s.ploobActive === false && s.storms.length === 0'))
  check('no console errors (demo)', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
  await page.close()
}

/* ---------------- compact pass ---------------- */
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  watchConsole(page)
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Start the fieldwork' }).click({ force: true })
  await page.waitForTimeout(1500)
  check('compact drawer: Controls tab', await waitFor(page, page.getByRole('button', { name: /Controls|Kit/ }), 9000))
  check('compact drawer: Data tab', await waitFor(page, page.getByRole('button', { name: 'Data' }), 5000))
  check('compact drawer: Missions tab', await waitFor(page, page.getByRole('button', { name: /Missions/ }), 5000))
  check('no console errors (compact)', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
  await page.close()
}

await browser.close()
const fails = results.filter((r) => r.startsWith('FAIL')).length
console.log(`\n${results.length - fails}/${results.length} checks passed`)
process.exit(fails ? 1 : 0)
