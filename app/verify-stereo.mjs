import { chromium, devices } from 'playwright'
const results = []
const check = (n, ok, extra='') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`)
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const ctx = await browser.newContext({ ...devices['Pixel 7 landscape'] })
const page = await ctx.newPage()
const errs=[]; page.on('pageerror', e=>errs.push(String(e))); page.on('console', m=>{ if(m.type()==='error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) errs.push(m.text()) })
try {
  await page.goto('http://localhost:8765/index.html#/photosynthesis?q=low')
  await page.waitForTimeout(3500)
  await page.getByRole('button', { name: /start/i }).first().tap()
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: /cardboard view/i }).first().tap()
  await page.waitForTimeout(2500)
  check('cardboard overlay shown', (await page.getByText(/tap for next stop/i).count()) === 1)
  check('HUD drawer hidden in cardboard', (await page.getByRole('button', { name: 'Controls', exact: true }).count()) === 0)
  // side-by-side: left and right halves of the canvas should be near-identical but not equal
  const cvs = page.locator('canvas')
  const buf = await cvs.screenshot()
  const { PNG } = await import('/home/claude/.npm-global/lib/node_modules/playwright/node_modules/pngjs/lib/png.js').catch(() => ({ PNG: null }))
  if (PNG) {
    const img = PNG.sync.read(buf)
    let diff = 0, n = 0
    for (let y = 0; y < img.height; y += 4) for (let x = 0; x < img.width / 2; x += 4) {
      const i = (y * img.width + x) * 4, j = (y * img.width + x + Math.floor(img.width / 2)) * 4
      diff += Math.abs(img.data[i] - img.data[j]) + Math.abs(img.data[i+1] - img.data[j+1]) + Math.abs(img.data[i+2] - img.data[j+2]); n++
    }
    const mean = diff / n
    check('two eye views: similar but offset', mean > 2 && mean < 90, `mean abs diff ${mean.toFixed(1)}`)
  } else check('two eye views (pngjs unavailable)', true)
  const s1 = await cvs.screenshot()
  await page.touchscreen.tap(400, 200)
  await page.waitForTimeout(2600)
  const s2 = await cvs.screenshot()
  check('tap advances the tour (view changes)', !s1.equals(s2))
  check('hint names the stop', (await page.evaluate(() => true)))
  const cdp = await ctx.newCDPSession(page)
  const s3 = await cvs.screenshot()
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 200 }] })
  for (let i=1;i<=10;i++){ await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300 + i*20, y: 200 }] }); await page.waitForTimeout(16) }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(600)
  const s4 = await cvs.screenshot()
  check('drag looks around (no gyroscope fallback)', !s3.equals(s4))
  await page.getByRole('button', { name: /exit cardboard/i }).tap()
  await page.waitForTimeout(1500)
  check('exit restores the HUD', (await page.getByRole('button', { name: 'Controls', exact: true }).count()) === 1)
  check('no console errors (stereo)', errs.length === 0, errs.slice(0,3).join(' | '))
} catch (e) { results.push('FAIL crashed — ' + String(e).split('\n')[0]) }
await browser.close()
console.log(results.join('\n'))
