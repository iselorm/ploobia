import { chromium, devices } from 'playwright'

const URL = 'http://localhost:8765/index.html#/photosynthesis'
const out = (n) => `/tmp/arcade/shots/${n}.png`
const results = []
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)

async function withPage(ctx, fn) {
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text())
  })
  try {
    await fn(page, errors)
  } catch (e) {
    results.push('FAIL section crashed — ' + String(e).split('\n')[0])
    await page.screenshot({ path: out('crash') }).catch(() => {})
  }
  await page.close()
}

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })

/* ---------- Pixel 7 portrait ---------- */
{
  const ctx = await browser.newContext({ ...devices['Pixel 7'] })
  await withPage(ctx, async (page, errors) => {
    await page.goto(URL)
    await page.waitForTimeout(3500)
    await page.screenshot({ path: out('p2-01-phone-welcome') })
    await page.getByRole('button', { name: /start/i }).first().tap()
    await page.waitForTimeout(900)
    await page.screenshot({ path: out('p2-02-phone-lab-closed') })
    const drawer = page.getByRole('button', { name: 'Controls', exact: true })
    check('drawer tab bar present on phone', (await drawer.count()) === 1)
    // Side panel must not be present in compact layout
    const sideOpen = await page.locator('.hud >> text=Specimen library').count()
    check('controls hidden until drawer opens', sideOpen === 0)
    await drawer.tap()
    await page.waitForTimeout(500)
    await page.screenshot({ path: out('p2-03-phone-controls') })
    const visible = await page.getByText('Specimen library', { exact: false }).first().isVisible()
    check('controls tab shows the specimen panel', visible)
    // Drawer content scrolls, sheet is capped in height
    const sheetH = await page.evaluate(() => {
      const el = document.querySelector('.hud .overflow-y-auto.overscroll-contain')
      return el ? el.getBoundingClientRect().height / window.innerHeight : 0
    })
    check('sheet body capped below 70% of viewport', sheetH > 0.1 && sheetH < 0.72, sheetH.toFixed(2))
    // Slider works inside the drawer
    const slider = page.locator('[role="slider"]').first()
    const before = await slider.getAttribute('aria-valuenow')
    const box = await page.locator('[data-slot="slider-track"]').first().boundingBox()
    await page.touchscreen.tap(box.x + box.width * 0.85, box.y + box.height / 2)
    const after = await slider.getAttribute('aria-valuenow')
    check('slider inside drawer responds to tap', after !== before, `${before} → ${after}`)
    // Data tab
    await page.getByRole('button', { name: 'Data' }).tap()
    await page.waitForTimeout(400)
    await page.screenshot({ path: out('p2-04-phone-data') })
    check('data tab shows graph', await page.getByRole('button', { name: /graph/i }).first().isVisible())
    // Write-up composer (Scientist band has conclusion)
    const wu = page.getByRole('button', { name: /write-up/i })
    if (await wu.count()) {
      await wu.first().tap()
      await page.waitForTimeout(300)
      const claims = page.locator('[role="group"][aria-label="Claim"] button')
      check('claim tiles rendered', (await claims.count()) >= 4, String(await claims.count()))
      await claims.nth(0).tap()
      await page.locator('[role="group"][aria-label="Reasoning"] button').nth(1).tap()
      await page.locator('[role="group"][aria-label="Limitations"] button').nth(0).tap()
      await page.locator('[role="group"][aria-label="Limitations"] button').nth(2).tap()
      const text = await page.getByTestId('conclusion').textContent()
      check(
        'conclusion assembles from tiles',
        /increased|levelled off|reduced/.test(text) && /Limitations:/.test(text),
        text.slice(0, 80),
      )
      await page.screenshot({ path: out('p2-05-phone-writeup') })
    } else {
      check('write-up tab available', false)
    }
    // Missions tab and collapse
    await page.getByRole('button', { name: 'Missions' }).tap()
    await page.waitForTimeout(300)
    check('missions tab lists missions', (await page.getByText(/why it matters|mission/i).count()) > 0)
    await page.getByRole('button', { name: 'Missions' }).tap() // same tab again = collapse
    await page.waitForTimeout(300)
    const closed = await page.locator('.hud .overflow-y-auto.overscroll-contain').count()
    check('tapping active tab collapses sheet', closed === 0)
    // One-finger drag orbits the camera: compare screenshots of the scene region
    const cvs = page.locator('canvas')
    const shot1 = await cvs.screenshot()
    await page.touchscreen.tap(200, 300) // focus
    const cdp = await ctx.newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 120, y: 320 }] })
    for (let i = 1; i <= 12; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 120 + i * 18, y: 320 }] })
      await page.waitForTimeout(16)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForTimeout(400)
    const shot2 = await cvs.screenshot()
    check('one-finger drag changes the scene (orbit)', !shot1.equals(shot2))
    // Pinch zoom
    const shot3 = await cvs.screenshot()
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 300 }, { x: 220, y: 340 }] })
    for (let i = 1; i <= 12; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180 - i * 6, y: 300 - i * 6 }, { x: 220 + i * 6, y: 340 + i * 6 }] })
      await page.waitForTimeout(16)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForTimeout(400)
    const shot4 = await cvs.screenshot()
    check('pinch changes the scene (zoom)', !shot3.equals(shot4))
    await page.screenshot({ path: out('p2-06-phone-after-gestures') })
    const q = await page.evaluate(() => document.querySelector('canvas').width / window.innerWidth)
    check('quality tier clamps DPR on phone (≤2)', q <= 2.01, `canvas px ratio ${q.toFixed(2)}`)
    check('no console errors (phone portrait)', errors.length === 0, errors.slice(0, 3).join(' | '))
  })
  await ctx.close()
}

/* ---------- iPhone landscape (short viewport) ---------- */
{
  const ctx = await browser.newContext({ ...devices['iPhone 14 landscape'] })
  await withPage(ctx, async (page, errors) => {
    await page.goto(URL)
    await page.waitForTimeout(3500)
    await page.getByRole('button', { name: /start/i }).first().tap()
    await page.waitForTimeout(800)
    check('landscape phone uses drawer', (await page.getByRole('button', { name: 'Controls', exact: true }).count()) === 1)
    await page.getByRole('button', { name: 'Controls', exact: true }).tap()
    await page.waitForTimeout(400)
    await page.screenshot({ path: out('p2-07-phone-landscape') })
    const sheetH = await page.evaluate(() => {
      const el = document.querySelector('.hud .overflow-y-auto.overscroll-contain')
      return el ? el.getBoundingClientRect().height / window.innerHeight : 0
    })
    check('landscape sheet leaves scene visible', sheetH < 0.72, sheetH.toFixed(2))
    check('no console errors (landscape)', errors.length === 0, errors.slice(0, 3).join(' | '))
  })
  await ctx.close()
}

/* ---------- Tablet keeps wide layout ---------- */
{
  const ctx = await browser.newContext({ ...devices['iPad Pro 11'], viewport: { width: 1194, height: 834 } })
  await withPage(ctx, async (page, errors) => {
    await page.goto(URL)
    await page.waitForTimeout(3000)
    await page.getByRole('button', { name: /start/i }).first().tap()
    await page.waitForTimeout(600)
    check('tablet keeps side columns (no drawer)', (await page.getByRole('button', { name: 'Controls', exact: true }).count()) === 0)
    check('no console errors (tablet)', errors.length === 0)
  })
  await ctx.close()
}

/* ---------- Desktop unchanged ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  await withPage(ctx, async (page, errors) => {
    await page.goto(URL)
    await page.waitForTimeout(3000)
    await page.getByRole('button', { name: /start/i }).first().click()
    await page.waitForTimeout(600)
    check('desktop keeps side columns', (await page.getByRole('button', { name: 'Controls', exact: true }).count()) === 0)
    await page.getByRole('button', { name: /data lab/i }).first().click().catch(() => {})
    await page.screenshot({ path: out('p2-08-desktop') })
    check('no console errors (desktop)', errors.length === 0, errors.slice(0, 2).join(' | '))
  })
  await ctx.close()
}

await browser.close()
console.log(results.join('\n'))
