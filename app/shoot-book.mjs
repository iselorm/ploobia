/** Screenshots of the book on the three tiers, for review. */
import { chromium } from 'playwright'
import fs from 'node:fs'

const BASE = 'http://localhost:8765/index.html'
const out = process.argv[2] || 'shots/book'
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const TWO_DOORS = { handedIn: { 'first-light': 700, 'open-the-hatches': 700 } }

async function open(width, height, touch, band) {
  const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch, isMobile: touch })
  await page.goto(`${BASE}#/photosynthesis?q=low`, { waitUntil: 'load' })
  await page.evaluate(
    ([b, p]) => {
      localStorage.setItem('ploobia.band.v1', JSON.stringify(b))
      localStorage.setItem('ploobia.campaign.photosynthesis.v1', JSON.stringify(p))
      localStorage.removeItem('ploobia.stamps.v1')
    },
    [band, TWO_DOORS],
  )
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(2000)
  return page
}
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png` })
const openSection = async (page, id, i = 0) => {
  await page.evaluate(([s, k]) => window.__book?.open(s, k), [id, i])
  await page.waitForTimeout(2500)
}
const goPage = async (page, i) => {
  await page.evaluate((k) => window.__book?.page(k), i)
  await page.waitForTimeout(2000)
}

const shots = [
  ['desktop', 1440, 900, false],
  ['tablet', 1180, 820, true],
  ['phone', 844, 390, true],
]
for (const [tier, w, h, touch] of shots) {
  const page = await open(w, h, touch, tier === 'phone' ? 'explorer' : 'analyst')
  await shot(page, `${tier}-welcome`)
  await page.getByRole('button', { name: 'Read the field guide', exact: true }).click({ force: true }).catch(() => {})
  await page.waitForTimeout(800)
  await shot(page, `${tier}-contents`)
  await openSection(page, '8.1', 0)
  await shot(page, `${tier}-8.1-story`)
  await page.locator('[data-term="stem/xylem"]').first().click({ force: true }).catch(() => {})
  await page.waitForTimeout(1200)
  await shot(page, `${tier}-8.1-xylem-lit`)
  await openSection(page, '6.2', 1)
  await page.locator('[data-term="figure/palisade"]').first().click({ force: true }).catch(() => {})
  await page.waitForTimeout(800)
  await shot(page, `${tier}-6.2-rule-figure`)
  await openSection(page, '6.1', 0)
  await shot(page, `${tier}-6.1-story`)
  await goPage(page, 2)
  await shot(page, `${tier}-6.1-practical`)
  await goPage(page, 3)
  await shot(page, `${tier}-6.1-check`)
  await openSection(page, '8.2', 1)
  await shot(page, `${tier}-8.2-undiscovered`)
  await openSection(page, '8.4', 0)
  await shot(page, `${tier}-8.4-story`)
  await page.close()
}
await browser.close()
console.log('done', out)
