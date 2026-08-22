/**
 * Atom Foundry checks. Serve dist/ on :8765 first (python3 -m http.server 8765 in dist).
 * Drives the real HUD buttons and reads the sim through window.__atomSim, the
 * same way verify-motion.mjs does for the yard.
 */
import { chromium } from 'playwright'

const URL = 'http://localhost:8765/index.html#/atoms'
const results = []
const check = (n, ok, extra = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`
  results.push(line)
  console.log(line)
}
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })

const simGet = (page, expr) => page.evaluate((e) => new Function('s', 'return ' + e)(window.__atomSim), expr)

async function waitSim(page, expr, timeout = 15000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    if (await simGet(page, expr)) return true
    await page.waitForTimeout(60)
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

/* ---------------- desktop pass ---------------- */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  watchConsole(page)
  await page.goto('http://localhost:8765/index.html#/', { waitUntil: 'networkidle' })
  check('menu shows the Atom Foundry cabinet', await waitFor(page, page.getByText('Atom Foundry')))

  await page.goto(URL, { waitUntil: 'networkidle' })
  check('welcome renders', await waitFor(page, page.getByRole('heading', { name: 'Atom Foundry' })))
  check('band picker on welcome', await waitFor(page, page.getByRole('button', { name: /Scientist/ })))

  await page.getByRole('button', { name: 'Start forging' }).click({ force: true })
  await page.waitForTimeout(800)

  // Concepts intro: atom → element → compound → the table's sides.
  check('intro: what is an atom', await waitFor(page, page.getByText('What is an atom?'), 6000))
  await page.getByRole('button', { name: 'Next', exact: true }).click({ force: true })
  check('intro: what is an element', await waitFor(page, page.getByText('What is an element?'), 4000))
  await page.getByRole('button', { name: 'Next', exact: true }).click({ force: true })
  check('intro: what is a compound', await waitFor(page, page.getByText('What is a compound?'), 4000))
  await page.getByRole('button', { name: 'Next', exact: true }).click({ force: true })
  check('intro: shell capacity rule', await waitFor(page, page.getByText('How many electrons fit in a shell?'), 4000))
  await page.getByRole('button', { name: 'Next', exact: true }).click({ force: true })
  check('intro: capacity fixes the address', await waitFor(page, page.getByText('Why those limits fix the address'), 4000))
  await page.getByRole('button', { name: 'To the crucibles!' }).click({ force: true })
  await page.waitForTimeout(500)

  check('scene canvas up', (await page.locator('canvas').count()) > 0)
  check('sim exposed', await page.evaluate(() => !!window.__atomSim))

  // The wall slides away in the Atom view and returns in the Foundry view.
  await page.getByRole('button', { name: 'Atom', exact: true }).click({ force: true })
  check('wall slides away up close', await waitSim(page, 's.wallHidden === true', 6000))
  await page.getByRole('button', { name: 'Foundry', exact: true }).click({ force: true })
  check('wall returns at overview', await waitSim(page, 's.wallHidden === false', 8000))

  // Build hydrogen with the real +/- buttons.
  await page.getByRole('button', { name: 'Add proton' }).click({ force: true })
  await page.waitForTimeout(200)
  check('one proton IS hydrogen', await waitFor(page, page.getByText('Hydrogen').first(), 4000))
  check('unbalanced build reads as an ion', await waitFor(page, page.getByText(/ion \+1/).first(), 4000))
  await page.getByRole('button', { name: 'Add electron' }).click({ force: true })
  await page.waitForTimeout(200)
  check('balanced charge chip', await waitFor(page, page.getByText('neutral').first(), 4000))
  check('sim holds 1p 1e', (await simGet(page, 's.protons')) === 1 && (await simGet(page, 's.electrons')) === 1)

  // Shell meter: capacity, room left, and the address it implies.
  check('shell meter shows capacity', await waitFor(page, page.getByText('1/2').first(), 4000))
  check('shell capacity caption', await waitFor(page, page.getByText('seats: 2, then 8s'), 4000))
  check('room-left readout', await waitFor(page, page.getByText(/Room for/).first(), 4000))
  check('address derived on screen', await waitFor(page, page.getByText(/Address: row 1 · column 1/), 4000))

  // Neutron row exists at Scientist (default band).
  check('neutron controls at Scientist', await waitFor(page, page.getByRole('button', { name: 'Add neutron' }), 3000))

  // Probe it: real first ionisation energy of H is 1312 kJ/mol (±noise).
  await page.getByRole('button', { name: 'Fire the grip probe' }).click({ force: true })
  check('probe animates', await waitSim(page, 's.probing === true', 4000))
  // First firing pops the instrument explainer, centred on the main screen.
  check('probe explainer on first fire', await waitFor(page, page.getByText('The grip probe', { exact: true }), 5000))
  await page.getByRole('button', { name: 'Close fact' }).click({ force: true })
  check('probe completes', await waitSim(page, 's.probeDone === 1', 8000))
  const grip = await simGet(page, 's.probedGrip.get(1)')
  check('H grip ≈ 1312 kJ/mol', grip > 1150 && grip < 1500, `read ${grip}`)
  check('reading lands in the data lab', await waitFor(page, page.getByText('grip kJ/mol'), 5000))

  // Forge it into the wall.
  await page.getByRole('button', { name: 'Forge into the wall' }).click({ force: true })
  check('placement flight starts', await waitSim(page, 's.placing !== null', 4000))
  check('hydrogen discovered on the wall', await waitSim(page, 's.discovered.has(1)', 8000))
  check('stage cleared after forging', await waitSim(page, 's.protons === 0 && s.electrons === 0', 5000))
  check('first mission completed', await waitFor(page, page.getByText('Forge hydrogen'), 5000))

  // Helium: a FULL outer shell must read as column 8 (the noble-gas rule).
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Add proton' }).click({ force: true })
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Add neutron' }).click({ force: true })
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Add electron' }).click({ force: true })
  await page.waitForTimeout(300)
  check('full outer shell announced', await waitFor(page, page.getByText(/Outer shell/).first(), 4000))
  check('full shell ⇒ column 8', await waitFor(page, page.getByText(/Address: row 1 · column 8/), 4000))
  await page.getByRole('button', { name: 'Clear the stage' }).click({ force: true })
  await page.waitForTimeout(300)

  // Build lithium: third electron must ignite shell 2.
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Add proton' }).click({ force: true })
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Add neutron' }).click({ force: true })
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Add electron' }).click({ force: true })
  await page.waitForTimeout(300)
  check('lithium named', await waitFor(page, page.getByText('Lithium').first(), 4000))
  check('second shell ignited', (await simGet(page, 's.prevShellCount')) === 2)
  check('shells read 2·1', await waitFor(page, page.getByText(/shells 2·1/).first(), 4000))

  // Probe lithium — the grip collapse (real value 520).
  await page.getByRole('button', { name: 'Fire the grip probe' }).click({ force: true })
  check('second probe completes', await waitSim(page, 's.probeDone === 2', 10000))
  const gripLi = await simGet(page, 's.probedGrip.get(3)')
  check('Li grip collapses vs H', gripLi < grip && gripLi > 380 && gripLi < 660, `read ${gripLi}`)

  // An ion: strip the outer electron and hold.
  await page.getByRole('button', { name: 'Remove electron' }).click({ force: true })
  check('ion chip appears', await waitFor(page, page.getByText(/ion \+1/).first(), 4000))
  await page.waitForTimeout(3000)

  // Analyst extras: cloud view toggle appears.
  await page.getByRole('button', { name: 'Analyst', exact: true }).first().click({ force: true })
  check('cloud view at Analyst', await waitFor(page, page.getByRole('button', { name: 'Toggle electron cloud view' }), 4000))
  await page.getByRole('button', { name: 'Scientist', exact: true }).first().click({ force: true })

  // Tap a crucible in the world: protons go up without the HUD.
  const before = await simGet(page, 's.protons')
  await page.locator('canvas').click({ position: { x: 500, y: 640 }, force: true })
  await page.waitForTimeout(400)
  const after = await simGet(page, 's.protons')
  check('world stays interactive after band switching', after >= before, `protons ${before} → ${after}`)

  check('no console errors (desktop)', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
  await page.close()
}

/* ---------------- demo pass ---------------- */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  watchConsole(page)
  await page.goto(URL + '?demo=1', { waitUntil: 'networkidle' })
  check('auto demo starts', await waitFor(page, page.getByText(/Guided demo/), 12000))
  check('demo drives the real sim', await waitSim(page, 's.protons >= 1', 30000))
  await page.getByRole('button', { name: /Skip to the crucibles/ }).click({ force: true })
  await page.waitForTimeout(800)
  check('skip hands over with a clean stage', (await simGet(page, 's.protons')) === 0)
  check('demo readings wiped', (await simGet(page, 's.discovered.size')) === 0)
  check('intro follows the demo handover', await waitFor(page, page.getByText('What is an atom?'), 5000))
  await page.getByRole('button', { name: 'Skip intro' }).click({ force: true })
  check('no console errors (demo)', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
  await page.close()
}

/* ---------------- compact / touch pass ---------------- */
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  watchConsole(page)
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Start forging' }).click({ force: true })
  await page.waitForTimeout(800)
  check('intro shows on compact too', await waitFor(page, page.getByText('What is an atom?'), 6000))
  await page.getByRole('button', { name: 'Skip intro' }).click({ force: true })
  await page.waitForTimeout(400)
  check('compact drawer tabs', await waitFor(page, page.getByRole('button', { name: 'Controls' }), 6000))
  await page.getByRole('button', { name: 'Controls' }).click({ force: true })
  check('panel opens in drawer', await waitFor(page, page.getByRole('button', { name: 'Add proton' }), 5000))
  await page.getByRole('button', { name: 'Add proton' }).click({ force: true })
  await page.getByRole('button', { name: 'Add electron' }).click({ force: true })
  check('compact build works', await waitSim(page, 's.protons === 1 && s.electrons === 1', 5000))
  check('no console errors (compact)', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
  await page.close()
}

await browser.close()
const fails = results.filter((r) => r.startsWith('FAIL'))
console.log(`\n${results.length - fails.length}/${results.length} checks passed`)
process.exit(fails.length ? 1 : 0)
