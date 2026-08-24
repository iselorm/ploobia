/**
 * The eyeball pass for The Sugar Line.
 *
 * `verify-sugar.mjs` proves the cabinet *works*; this proves it *looks right*,
 * which is a different question and the one that has caught the most real
 * bugs in this codebase — a 52/52-green Atom Foundry still had calcium's shell
 * capacity wrong, and only the picture showed it. It drives the cabinet through
 * every stage, viewpoint and specimen at desktop and phone and drops the frames
 * in `shots/` (gitignored) to be looked at.
 *
 *   node probe.mjs      # with dist/ served on :8765
 */
import { chromium } from 'playwright'
import fs from 'node:fs'

const BASE = 'http://localhost:8765/index.html'
fs.mkdirSync('shots', { recursive: true })

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
})
const errors = []

async function open(width, height) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('ERR_TUNNEL_CONNECTION_FAILED'))
      errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(`${BASE}#/photosynthesis?q=high`, { waitUntil: 'load' })
  await page.waitForTimeout(2600)
  return page
}

/** A click that survives a renderer running at a frame a second. */
const tap = async (page, name, opts = {}) => {
  const loc = opts.label
    ? page.getByLabel(opts.label)
    : page.getByRole('button', { name, exact: opts.exact ?? true })
  try {
    await loc.first().click({ force: true, timeout: 6000 })
  } catch {
    await loc.first().dispatchEvent('click', undefined, { timeout: 60000 })
  }
}

const shot = async (page, name) => {
  await page.screenshot({ path: `shots/${name}.png` })
  console.log(`  · shots/${name}.png`)
}

/* ---------------- desktop ---------------- */
{
  const page = await open(1440, 900)
  await tap(page, 'Start')
  await page.waitForTimeout(4500)
  await shot(page, '10-plant')

  // Give the sim time to move sugar around.
  await page.waitForTimeout(5000)
  await shot(page, '11-plant-running')

  await tap(page, 'Canopy')
  await page.waitForTimeout(2600)
  await shot(page, '12-canopy')

  await tap(page, 'Stem')
  await page.waitForTimeout(2600)
  await shot(page, '13-stem-view')

  await tap(page, 'Below ground')
  await page.waitForTimeout(2600)
  await shot(page, '14-roots')

  await tap(page, 'Inside a leaf')
  await page.waitForTimeout(3200)
  await shot(page, '15-leaf-stage')

  await tap(page, 'The cycle')
  await page.waitForTimeout(2600)
  await shot(page, '16-cycle')

  await tap(page, 'The stem, cut')
  await page.waitForTimeout(3200)
  await shot(page, '17-stem-stage')

  await tap(page, 'Cut the phloem ring', { exact: false })
  await page.waitForTimeout(3000)
  await shot(page, '18-girdled')

  await tap(page, 'Heal the phloem ring', { exact: false })
  await tap(page, 'Whole plant')
  await page.waitForTimeout(2600)
  await tap(page, 'Specimen: Maize', { exact: false })
  await page.waitForTimeout(3400)
  await shot(page, '19-maize')

  await tap(page, 'Specimen: Potato', { exact: false })
  await page.waitForTimeout(3000)
  await shot(page, '20-potato')

  await tap(page, 'Specimen: Prickly pear', { exact: false })
  await page.waitForTimeout(3000)
  await shot(page, '21-opuntia')

  await tap(page, 'Specimen: Tomato', { exact: false })
  await page.waitForTimeout(3000)
  await shot(page, '22-tomato')

  await tap(page, 'Reaction Vision', { exact: false })
  await page.waitForTimeout(2200)
  await shot(page, '23-vision')

  await page.close()
}

/* ---------------- phone ---------------- */
{
  const page = await open(390, 844)
  await tap(page, 'Start')
  await page.waitForTimeout(4000)
  await shot(page, '30-phone')
  await tap(page, 'Controls')
  await page.waitForTimeout(900)
  await shot(page, '31-phone-controls')
  await page.close()
}

console.log(errors.length ? `\nCONSOLE ERRORS (${errors.length}):\n` + [...new Set(errors)].slice(0, 15).join('\n') : '\nno console errors')
await browser.close()
