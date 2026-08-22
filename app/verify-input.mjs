import { chromium, devices } from 'playwright'

const URL = 'http://localhost:8765/index.html#/photosynthesis'
const out = (n) => `/tmp/arcade/shots/${n}.png`
const results = []
const check = (name, ok, extra = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)
}

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
  }
  await page.close()
}

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })

/* ---------- 1. Desktop pointer: nothing should have changed ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  await withPage(ctx, async (page, errors) => {
    await page.goto(URL)
    await page.waitForTimeout(3000)
    const mode = await page.evaluate(() => document.documentElement.dataset.input)
    check('pointer mode detected on desktop', mode === 'pointer', mode)
    await page.screenshot({ path: out('01-desktop-welcome') })
    // Welcome overlay is a focus layer: arrow key lands inside it.
    await page.keyboard.press('ArrowDown')
    const inLayer = await page.evaluate(() => !!document.activeElement?.closest('[data-focus-layer]'))
    check('arrow focus stays inside welcome layer', inLayer)
    await page.getByRole('button', { name: /start|enter|play/i }).first().click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: out('02-desktop-lab') })
    // Keyboard spatial nav across the HUD.
    await page.keyboard.press('ArrowDown')
    const first = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim().slice(0, 30))
    await page.keyboard.press('ArrowRight')
    const second = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim().slice(0, 30))
    check('keyboard spatial focus moves', !!first && first !== second, `${first} → ${second}`)
    // Slider owns horizontal arrows.
    const thumb = page.locator('[aria-label="Light intensity"] [role="slider"], [role="slider"]').first()
    await thumb.focus()
    const before = await thumb.getAttribute('aria-valuenow')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    const after = await thumb.getAttribute('aria-valuenow')
    check('focused slider keeps ArrowRight', Number(after) > Number(before), `${before} → ${after}`)
    // Escape = back: nothing zoomed, so it should navigate to the menu.
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
    check('Escape leaves cabinet to menu', page.url().endsWith('#/'), page.url())
    check('no console errors (desktop)', errors.length === 0, errors.slice(0, 3).join(' | '))
  })
  await ctx.close()
}

/* ---------- 2. Tablet touch ---------- */
{
  const ctx = await browser.newContext({ ...devices['iPad Pro 11'], viewport: { width: 1194, height: 834 } })
  await withPage(ctx, async (page, errors) => {
    await page.goto(URL)
    await page.waitForTimeout(3000)
    const mode = await page.evaluate(() => document.documentElement.dataset.input)
    check('touch mode detected on tablet', mode === 'touch', mode)
    await page.getByRole('button', { name: /start|enter|play/i }).first().tap()
    await page.waitForTimeout(800)
    await page.screenshot({ path: out('03-tablet-lab') })
    // Hit target audit: every visible button/link/slider thumb in the HUD ≥ 44px effective.
    const audit = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('.hud button, .hud a, [role="slider"]'))
      const small = []
      for (const el of els) {
        const r = el.getBoundingClientRect()
        if (r.width < 2 || r.height < 2) continue
        const cs = getComputedStyle(el, '::after')
        const w = cs.content !== 'none' ? Math.max(r.width, parseFloat(cs.width) || 0) : r.width
        const h = cs.content !== 'none' ? Math.max(r.height, parseFloat(cs.height) || 0) : r.height
        if (w < 44 || h < 44) small.push(`${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 20)} ${Math.round(w)}x${Math.round(h)}`)
      }
      return { total: els.length, small }
    })
    check(`touch hit targets ≥44px (${audit.total} controls)`, audit.small.length === 0, audit.small.slice(0, 6).join(', '))
    const thumb = await page.evaluate(() => {
      const t = document.querySelector('[data-slot="slider-thumb"]')
      const r = t.getBoundingClientRect()
      return `${Math.round(r.width)}x${Math.round(r.height)}`
    })
    check('slider thumb enlarged on touch', thumb.startsWith('28'), thumb)
    // Tap a slider track and confirm the value changes.
    const slider = page.locator('[role="slider"]').first()
    const before = await slider.getAttribute('aria-valuenow')
    const box = await page.locator('[data-slot="slider-track"]').first().boundingBox()
    await page.touchscreen.tap(box.x + box.width * 0.9, box.y + box.height / 2)
    const after = await slider.getAttribute('aria-valuenow')
    check('tap on slider track sets value', after !== before, `${before} → ${after}`)
    check('no console errors (tablet)', errors.length === 0, errors.slice(0, 3).join(' | '))
  })
  await ctx.close()
}

/* ---------- 3. Fake gamepad ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } })
  await ctx.addInitScript(() => {
    const pad = {
      id: 'Fake Xbox Wireless Controller (STANDARD GAMEPAD)',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    }
    window.__pad = pad
    window.__padOn = false
    navigator.getGamepads = () => (window.__padOn ? [pad, null, null, null] : [null, null, null, null])
    window.__press = (i, ms = 80) =>
      new Promise((res) => {
        pad.buttons[i] = { pressed: true, touched: true, value: 1 }
        setTimeout(() => {
          pad.buttons[i] = { pressed: false, touched: false, value: 0 }
          setTimeout(res, 60)
        }, ms)
      })
  })
  await withPage(ctx, async (page, errors) => {
    await page.goto(URL)
    await page.waitForTimeout(3000)
    await page.evaluate(() => {
      window.__padOn = true
      window.dispatchEvent(new Event('gamepadconnected'))
    })
    // gamepadconnected handler reads e.gamepad — our synthetic Event lacks it, so press a button instead.
    await page.evaluate(() => window.__press(0))
    await page.waitForTimeout(300)
    const mode = await page.evaluate(() => document.documentElement.dataset.input)
    check('gamepad/tv mode after pad input', mode === 'tv' || mode === 'gamepad', mode)
    // Welcome layer: D-pad down focuses a button, A confirms.
    let focused = ''
    for (const btn of [13, 13, 13, 13, 15, 15, 14, 14]) {
      await page.evaluate((b) => window.__press(b), btn)
      await page.waitForTimeout(150)
      focused = await page.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 30) || '')
      if (/start|enter|play/i.test(focused)) break
    }
    check('D-pad reaches the start button', /start|enter|play/i.test(focused), focused)
    await page.screenshot({ path: out('04-gamepad-welcome-focus') })
    await page.evaluate(() => window.__press(0))
    await page.waitForTimeout(900)
    const started = await page.evaluate(() => !document.querySelector('[data-focus-layer]'))
    check('A confirms the focused button', started)
    const glyphs = await page.locator('text=Orbit').count()
    check('glyph bar visible in gamepad mode', glyphs > 0)
    // Move focus into the HUD and nudge a slider with the D-pad.
    for (let i = 0; i < 3; i++) await page.evaluate(() => window.__press(13))
    await page.waitForTimeout(200)
    const thumb = page.locator('[role="slider"]').first()
    await thumb.focus()
    const before = await thumb.getAttribute('aria-valuenow')
    await page.evaluate(() => window.__press(15))
    await page.evaluate(() => window.__press(15))
    await page.waitForTimeout(200)
    const after = await thumb.getAttribute('aria-valuenow')
    check('D-pad right nudges focused slider', Number(after) > Number(before), `${before} → ${after}`)
    // Y = coarse step
    await page.evaluate(() => window.__press(3))
    await page.waitForTimeout(150)
    const after2 = await thumb.getAttribute('aria-valuenow')
    check('Y gives coarse slider step', Number(after2) > Number(after), `${after} → ${after2}`)
    // Right stick orbits: camera position should change.
    const cam0 = await page.evaluate(() => JSON.stringify(window.__camPos?.() ?? null))
    await page.evaluate(() => { window.__pad.axes[2] = 0.9 })
    await page.waitForTimeout(700)
    await page.evaluate(() => { window.__pad.axes[2] = 0 })
    await page.screenshot({ path: out('05-gamepad-lab') })
    check('right stick orbit ran without error', errors.length === 0, errors.slice(0, 3).join(' | '))
    // B = back → menu
    await page.evaluate(() => window.__press(1))
    await page.waitForTimeout(700)
    check('B leaves cabinet to menu', page.url().endsWith('#/'), page.url())
    void cam0
  })
  await ctx.close()
}

await browser.close()
console.log(results.join('\n'))
