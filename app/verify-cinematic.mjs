import { chromium, devices } from 'playwright'

const URL = 'http://localhost:8765/index.html#/photosynthesis'
const results = []
const check = (n, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`)
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })

/* ---------- Desktop ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()) })
  try {
    await page.goto(URL)
    await page.waitForTimeout(4000)
    await page.getByRole('button', { name: /start/i }).first().click()
    await page.waitForTimeout(1200)
    const cvs = page.locator('canvas')
    const s0 = await cvs.screenshot()
    await page.getByRole('button', { name: 'Leaf', exact: true }).click()
    await page.waitForTimeout(3000)
    const s1 = await cvs.screenshot()
    check('viewpoint "Leaf" moves the camera', !s0.equals(s1))
    await page.getByRole('button', { name: 'Inside', exact: true }).click()
    await page.waitForTimeout(3000)
    check('viewpoint "Inside" mounts the chloroplast', (await page.getByRole('button', { name: /back out/i }).count()) === 1)
    await page.getByRole('button', { name: 'Overview', exact: true }).click()
    await page.waitForTimeout(2500)
    // Equation stage
    await page.getByRole('button', { name: /expand the equation/i }).click()
    await page.waitForTimeout(3000)
    check('equation card opens at step 1', (await page.getByText(/expanded · 1\/4/i).count()) === 1)
    const panelOpacity = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('.hud div')).find((d) => d.textContent?.includes('Leaf in the apparatus'))
      let n = el
      while (n && n !== document.body) { if (getComputedStyle(n).opacity === '0') return 0; n = n.parentElement }
      return 1
    })
    check('side panels hidden in focus mode', panelOpacity === 0)
    await page.getByRole('button', { name: /next step/i }).click()
    await page.waitForTimeout(800)
    check('next step advances to 2/4', (await page.getByText(/expanded · 2\/4/i).count()) === 1)
    const card = page.locator('[data-focus-layer]')
    await card.getByRole('button', { name: /pause/i }).click()
    await page.waitForTimeout(300)
    check('pause toggles to play', (await card.getByRole('button', { name: /^play$/i }).count()) === 1)
    await card.getByRole('button', { name: /next step/i }).click()
    await card.getByRole('button', { name: /next step/i }).click()
    await page.waitForTimeout(800)
    check('reaches the equation step 4/4', (await page.getByText(/expanded · 4\/4/i).count()) === 1)
    await page.screenshot({ path: '/tmp/arcade/shots/cin-eq.png' })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(1500)
    check('Escape closes the equation stage', (await page.getByText(/expanded ·/i).count()) === 0)
    check('panels return after closing', (await page.getByText('Leaf in the apparatus', { exact: false }).count()) >= 1)
    // Biome change + light slider drive the world (no crash, no errors)
    await page.getByRole('button', { name: /^Boreal$/ }).click()
    await page.waitForTimeout(1500)
    const th = page.locator('[aria-label="Light intensity"] [role="slider"]').first()
    await th.focus()
    await page.keyboard.press('Home')
    await page.waitForTimeout(2500)
    await page.screenshot({ path: '/tmp/arcade/shots/cin-boreal-dusk.png' })
    check('no console errors (cinematic desktop)', errors.length === 0, errors.slice(0, 3).join(' | '))
  } catch (e) {
    results.push('FAIL desktop crashed — ' + String(e).split('\n')[0])
  }
  await ctx.close()
}

/* ---------- Phone: equation fits ---------- */
{
  const ctx = await browser.newContext({ ...devices['Pixel 7'] })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  try {
    await page.goto(URL)
    await page.waitForTimeout(4000)
    await page.getByRole('button', { name: /start/i }).first().tap()
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: 'Controls', exact: true }).tap()
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: /expand the equation/i }).tap()
    await page.waitForTimeout(3000)
    check('phone: equation card visible and drawer hidden', (await page.getByText(/expanded · 1\/4/i).count()) === 1 && (await page.getByRole('button', { name: 'Controls', exact: true }).count()) === 0)
    await page.screenshot({ path: '/tmp/arcade/shots/cin-eq-phone.png' })
    await page.getByRole('button', { name: /close the equation/i }).tap()
    await page.waitForTimeout(1200)
    check('phone: drawer returns after close', (await page.getByRole('button', { name: 'Controls', exact: true }).count()) === 1)
    check('no page errors (phone)', errors.length === 0, errors.slice(0, 2).join(' | '))
  } catch (e) {
    results.push('FAIL phone crashed — ' + String(e).split('\n')[0])
  }
  await ctx.close()
}

await browser.close()
console.log(results.join('\n'))
