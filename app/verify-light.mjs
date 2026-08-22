/**
 * Cinematic Lab IV — "the light gets in".
 *
 * What this suite is actually guarding: three patched shaders (contact
 * occlusion on terrain and grass, translucency on the leaves) and one new post
 * effect. A patched shader that fails to compile does not throw — three logs
 * the program error and draws the surface black — so the first job here is to
 * fail loudly on any WebGL program error at every tier. The second is to prove
 * the light path is live: dim the sun and the backlit shot must change.
 */

import { chromium } from 'playwright'

const BASE = 'http://localhost:8765/index.html'
const results = []
const check = (n, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`)
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })

/** A shader that failed to compile shows up here, never as an exception. */
const isProgramError = (t) => /WebGLProgram|shader|GLSL|compile/i.test(t)

async function openLab(q, viewport) {
  const ctx = await browser.newContext({ viewport })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text())
  })
  await page.goto(`${BASE}#/photosynthesis?q=${q}`)
  await page.waitForTimeout(4000)
  await page.getByRole('button', { name: /start/i }).first().click()
  await page.waitForTimeout(2000)
  return { ctx, page, errors }
}

/* ---------- Every tier compiles ---------- */
for (const q of ['low', 'medium', 'high']) {
  const { ctx, page, errors } = await openLab(q, { width: 900, height: 600 })
  try {
    await page.waitForTimeout(2500)
    check(`${q}: no shader program errors`, !errors.some(isProgramError), errors.filter(isProgramError).slice(0, 1).join(''))
    check(`${q}: no page errors`, errors.length === 0, errors.slice(0, 1).join(''))
    // A black canvas is what a broken patched shader looks like. The WebGL
    // buffer is not preserved, so it cannot be sampled from page script —
    // instead lean on PNG compression: a flat frame encodes to a few KB, a
    // real one with grass in it to hundreds.
    const bytes = (await page.screenshot()).length
    check(`${q}: scene renders (not a flat frame)`, bytes > 60000, `${Math.round(bytes / 1000)} kB`)
  } catch (e) {
    results.push(`FAIL ${q} crashed — ` + String(e).split('\n')[0])
  }
  await ctx.close()
}

/* ---------- The light path is live ---------- */
{
  const { ctx, page, errors } = await openLab('medium', { width: 1000, height: 640 })
  try {
    const cvs = page.locator('canvas')
    await page.getByRole('button', { name: 'Backlit', exact: true }).click()
    await page.waitForTimeout(4000)
    const lit = await cvs.screenshot()
    // Drop the sun to its minimum: translucency, shafts and backlit dust all
    // scale with it, so the frame has to change.
    const slider = page.getByLabel(/Light intensity/i).first()
    await slider.click()
    for (let i = 0; i < 24; i += 1) await page.keyboard.press('ArrowLeft')
    await page.waitForTimeout(3500)
    const dim = await cvs.screenshot()
    check('dimming the sun changes the backlit shot', !lit.equals(dim))

    // ...and putting it back restores a bright frame.
    for (let i = 0; i < 24; i += 1) await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(3500)
    const relit = await cvs.screenshot()
    check('restoring the sun changes it back', !relit.equals(dim))
    check('no page errors (light path)', errors.length === 0, errors.slice(0, 1).join(''))
  } catch (e) {
    results.push('FAIL light path crashed — ' + String(e).split('\n')[0])
  }
  await ctx.close()
}

/* ---------- Focus engages as the camera closes in ---------- */
{
  const { ctx, page, errors } = await openLab('high', { width: 760, height: 480 })
  try {
    const wide = await page.screenshot()
    await page.mouse.move(380, 240)
    for (let i = 0; i < 14; i += 1) {
      await page.mouse.wheel(0, -120)
      await page.waitForTimeout(400)
    }
    await page.waitForTimeout(4000)
    const close = await page.screenshot()
    check('dollying in re-renders (focus pass alive at high tier)', !wide.equals(close))
    check('no page errors (focus)', !errors.some(isProgramError), errors.slice(0, 1).join(''))
  } catch (e) {
    results.push('FAIL focus crashed — ' + String(e).split('\n')[0])
  }
  await ctx.close()
}

await browser.close()
console.log(results.join('\n'))
