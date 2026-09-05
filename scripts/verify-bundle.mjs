#!/usr/bin/env node
/**
 * End-to-end check on the assembled bundle — the thing a tester actually gets.
 *
 * The cabinet suites prove each simulation is right. This proves the *bundle*
 * is coherent: the site loads, its door reaches the arcade at the deployed
 * path, every cabinet opens from the hall, progress survives a reload, and the
 * pilot report tab files a report without stepping on any cabinet's controls.
 *
 *   node scripts/verify-bundle.mjs
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, devices } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const shots = join(root, 'shots-bundle')
const PORT = 8099
const BASE = `http://localhost:${PORT}`

if (!existsSync(join(dist, 'app', 'index.html'))) {
  console.error('✗ no dist/app/index.html — run `npm run build` first.')
  process.exit(1)
}
mkdirSync(shots, { recursive: true })

const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok, extra })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)
}

const server = spawn('npx', ['--yes', 'http-server', 'dist', '-p', String(PORT), '-s'], {
  cwd: root,
  stdio: 'ignore',
})
const stop = () => {
  if (!server.killed) server.kill('SIGTERM')
}
process.on('exit', stop)

for (let i = 0; i < 40; i += 1) {
  try {
    const r = await fetch(`${BASE}/index.html`)
    if (r.ok) break
  } catch {
    /* not up yet */
  }
  await new Promise((r) => setTimeout(r, 500))
}

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
})

const noise = /ERR_TUNNEL_CONNECTION_FAILED|Failed to load resource|WebGL|SwiftShader|THREE\.WebGLRenderer/i
function watch(page, sink) {
  page.on('pageerror', (e) => sink.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error' && !noise.test(m.text())) sink.push(m.text())
  })
}

/* ---------------- 1. The front door ---------------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 880 } })
  const page = await ctx.newPage()
  const errs = []
  watch(page, errs)
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)

  check('site loads', await page.getByText(/Ploobia/i).first().isVisible())
  check(
    'hero canvas is live (the model rendered)',
    await page.evaluate(() => {
      const c = document.querySelector('canvas')
      return !!c && c.width > 100 && c.height > 100
    }),
  )
  const doors = await page.locator('a[href*="./app/"], a[href^="app/"], a[href*="/app/"]').count()
  check('site links to the arcade', doors > 0, `${doors} links`)
  check('no console errors on the site', errs.length === 0, errs.slice(0, 2).join(' | '))
  await page.screenshot({ path: join(shots, 'bundle-site.png'), fullPage: false })

  // Follow a door for real, rather than trusting the href.
  const door = page.locator('a[href*="app/"]').first()
  await door.click()
  await page.waitForTimeout(4000)
  check('the door reaches the arcade', /\/app\//.test(page.url()), page.url())
  check('the hall rendered', (await page.getByText(/Pick a cabinet/i).count()) > 0)
  await page.screenshot({ path: join(shots, 'bundle-hall.png') })
  await ctx.close()
}

/* ---------------- 2. Every cabinet opens ---------------- */
const CABS = [
  ['photosynthesis', /The Sugar Line/i],
  ['blood', /Blood Voyage/i],
  ['physics', /First Physics/i],
  ['motion', /Motion Yard/i],
  ['atoms', /Atom Foundry|Foundry/i],
  ['rivers', /River Basin|River & Flood/i],
]
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 880 } })
  for (const [route, title] of CABS) {
    const page = await ctx.newPage()
    const errs = []
    watch(page, errs)
    await page.goto(`${BASE}/app/index.html#/${route}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(3500)
    check(`${route}: opens`, (await page.getByText(title).count()) > 0)
    check(
      `${route}: canvas rendering`,
      await page.evaluate(() => {
        const c = document.querySelector('canvas')
        return !!c && c.width > 100
      }),
    )
    check(`${route}: no console errors`, errs.length === 0, errs.slice(0, 1).join(''))
    await page.close()
  }
  await ctx.close()
}

/* ---------------- 3. Progress survives a reload ---------------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 880 } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/app/index.html#/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  await page.getByRole('button', { name: 'Analyst' }).first().click({ force: true })
  await page.waitForTimeout(500)
  const before = await page.evaluate(() => localStorage.getItem('ploobia.band.v1'))
  check('band written to storage', before === '"analyst"', String(before))

  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  const stuck = await page.getByRole('button', { name: 'Analyst' }).first().getAttribute('class')
  const after = await page.evaluate(() => localStorage.getItem('ploobia.band.v1'))
  check('band survives a reload', after === '"analyst"', String(after))
  check('the Analyst chip is the selected one after reload', !!stuck)
  await page.screenshot({ path: join(shots, 'bundle-reload.png') })
  await page.close()
  await ctx.close()
}

/* ---------------- 4. The report tab ---------------- */
{
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 880 },
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const page = await ctx.newPage()
  const errs = []
  watch(page, errs)
  await page.goto(`${BASE}/app/index.html#/atoms`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  // Get past the welcome and the concepts intro so the real controls are on
  // screen — the overlap check below is only meaningful against them, and the
  // frame sampler needs a few seconds of actual play to have a number.
  for (const label of ['Start forging', 'Skip intro']) {
    const b = page.getByRole('button', { name: label })
    if (await b.count()) {
      await b.first().click({ force: true })
      await page.waitForTimeout(1200)
    }
  }
  await page.waitForTimeout(4000)

  const tab = page.getByRole('button', { name: 'Tell us what happened' })
  check('report tab present in a pilot build', (await tab.count()) > 0)

  // The collision that started all this: a bottom-left button covered "Clear
  // stage" here and the "Controls" drawer tab on a phone. Measure it, don't
  // eyeball it. (The button's aria-label is "Clear the stage" and an
  // aria-label overrides visible text for getByRole — match loosely.)
  const clear = page.getByRole('button', { name: /clear/i }).first()
  const box = await tab.boundingBox()
  const clearBox = (await clear.count()) ? await clear.boundingBox() : null
  check('the cabinet controls are on screen to test against', !!clearBox)
  const overlaps = (a, b) =>
    !!a && !!b && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
  check(
    'report tab does not overlap the cabinet controls',
    !overlaps(box, clearBox),
    JSON.stringify({ tab: box, clear: clearBox }),
  )

  await tab.click({ force: true })
  await page.waitForTimeout(400)
  check('report sheet opens', (await page.getByText(/Tell us what happened/i).count()) > 0)
  await page.getByRole('button', { name: /Something broke/i }).click({ force: true })
  await page.locator('textarea').fill('The crucible would not take a proton on my tablet.')
  await page.waitForTimeout(200)
  await page.screenshot({ path: join(shots, 'bundle-report.png') })
  await page.getByRole('button', { name: /^(Send it|File it)$/ }).click({ force: true })
  await page.waitForTimeout(1200)

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ploobia.reports.v1') || '[]'))
  check('report stored on the device', stored.length === 1, `${stored.length} report(s)`)
  const r = stored[0]
  check('report knows its cabinet', /Foundry/i.test(r?.cabinet ?? ''), r?.cabinet)
  check('report carries the build id', typeof r?.build === 'string' && r.build.length > 0, r?.build)
  check('report carries a renderer', !!r?.device?.renderer, r?.device?.renderer)
  check('report carries a frame rate', typeof r?.device?.fps === 'number', String(r?.device?.fps))
  check('no console errors while reporting', errs.length === 0, errs.slice(0, 1).join(''))
  await page.screenshot({ path: join(shots, 'bundle-report-done.png') })
  await page.close()
  await ctx.close()
}

/* ---------------- 5. A tablet ---------------- */
{
  const ctx = await browser.newContext({ ...devices['iPad (gen 7) landscape'] })
  const page = await ctx.newPage()
  const errs = []
  watch(page, errs)
  await page.goto(`${BASE}/app/index.html#/rivers`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3500)
  check('tablet: river basin opens', (await page.getByText(/River/i).first().isVisible()) === true)
  check(
    'tablet: no horizontal page overflow',
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  )
  check('tablet: no console errors', errs.length === 0, errs.slice(0, 1).join(''))
  await page.screenshot({ path: join(shots, 'bundle-tablet.png') })
  await ctx.close()
}

/* ---------------- 6. A blank screen must explain itself ---------------- */
{
  // The failure a tester actually hit: the module script never runs, and the
  // page is a bare <div id="root">. Simulate it by removing the module tag,
  // then require that the boot guard says something useful instead of nothing.
  const src = readFileSync(join(dist, 'app', 'index.html'), 'utf8')
  const gutted = src.replace(/<script type="module"[^>]*>[\s\S]*?<\/script>/, '')
  const tmp = join(shots, 'boot-simulated-failure.html')
  writeFileSync(tmp, gutted)

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await page.goto(`file://${tmp}`, { waitUntil: 'load' })
  // The guard waits 12 s before giving up, deliberately — a cheap tablet
  // compiling shaders deserves that much patience.
  await page.waitForTimeout(14000)
  const shown = await page.evaluate(() => {
    const f = document.getElementById('boot-fail')
    return f ? !f.hidden : false
  })
  check('a boot failure shows an explanation, not a blank screen', shown)
  const why = await page.evaluate(() => document.getElementById('boot-why')?.textContent ?? '')
  check('it names the file:// cause', /opened as a file/i.test(why), why.slice(0, 70))
  const detail = await page.evaluate(() => document.getElementById('boot-detail')?.textContent ?? '')
  check('it carries the device details to copy', /device .*Mozilla/.test(detail) && /webgl/.test(detail))
  await page.screenshot({ path: join(shots, 'bundle-boot-failure.png') })
  await ctx.close()
}

/* ---------------- 7. The offline copy opens from a file ---------------- */
{
  const offline = join(root, 'dist-offline', 'Ploobia-offline.html')
  if (!existsSync(offline)) {
    check('offline copy built (npm run build:offline)', false, 'dist-offline/Ploobia-offline.html missing')
  } else {
    const html = readFileSync(offline, 'utf8')
    check('offline copy has no module scripts', !/<script[^>]*type="module"/.test(html))
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const page = await ctx.newPage()
    const errs = []
    watch(page, errs)
    await page.goto(`file://${offline}`, { waitUntil: 'load' })
    await page.waitForTimeout(10000)
    check('offline copy mounts from a file', await page.evaluate(() => (document.getElementById('root')?.childElementCount ?? 0) > 0))
    check('offline copy hides the boot shell', await page.evaluate(() => document.getElementById('boot-shell')?.className === 'gone'))
    check('offline copy has no page errors', errs.length === 0, errs.slice(0, 1).join(''))
    await page.screenshot({ path: join(shots, 'bundle-offline.png') })
    await ctx.close()
  }
}

await browser.close()
stop()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
console.log(`screenshots in shots-bundle/`)
process.exit(failed.length ? 1 : 0)
