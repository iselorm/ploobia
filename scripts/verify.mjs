#!/usr/bin/env node
/**
 * Run the cabinet suites against a real build over real HTTP.
 *
 * Every suite drives `http://localhost:8765/index.html#/<route>` with
 * Playwright and asserts on the simulation handles the cabinets expose on
 * `window`. They judge correctness, not frame rate.
 *
 * Two house rules are baked in here because both have cost real hours:
 *  - the served bytes are compared against the built file before anything is
 *    trusted, since a stale server on the same port serves the old build and
 *    every assertion then lies;
 *  - the server is a child process we hold and kill by handle, never a pkill
 *    pattern (a pattern that appears in your own command line kills the shell).
 *
 *   node scripts/verify.mjs                 all suites
 *   node scripts/verify.mjs atoms river     just those
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const appDir = join(root, 'app')
const built = join(appDir, 'dist', 'index.html')
const PORT = 8765

const ALL = [
  'input',
  'touch',
  'progression',
  'cinematic',
  'light',
  'stereo',
  'journey',
  'blood5',
  'blood6',
  'motion',
  'atoms',
  'river',
  // Last, because it is the slow one and its failures are budgets rather than
  // correctness — you want the correctness answer first.
  'perf',
]

const want = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const suites = want.length ? want : ALL

/* -- Playwright has to resolve from app/, where the suites live ---- */
const require = createRequire(import.meta.url)
for (const pkg of ['playwright', 'playwright-core']) {
  const target = join(appDir, 'node_modules', pkg)
  if (existsSync(target)) continue
  try {
    const resolved = dirname(require.resolve(`${pkg}/package.json`))
    symlinkSync(resolved, target, 'junction')
    console.log(`· linked ${pkg} into app/node_modules`)
  } catch {
    if (pkg === 'playwright') {
      console.error('✗ playwright is not installed. Run `npm install` at the repo root.')
      process.exit(1)
    }
  }
}

if (!existsSync(built)) {
  console.error('✗ app/dist/index.html not found. Run `npm run build` first.')
  process.exit(1)
}
mkdirSync(join(appDir, 'shots'), { recursive: true })

/* -- Serve the built app ------------------------------------------ */
const server = spawn('npx', ['--yes', 'http-server', 'dist', '-p', String(PORT), '-s'], {
  cwd: appDir,
  stdio: 'ignore',
})
const stop = () => {
  if (!server.killed) server.kill('SIGTERM')
}
process.on('exit', stop)
process.on('SIGINT', () => {
  stop()
  process.exit(130)
})

async function waitForServer() {
  const expected = readFileSync(built).length
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`http://localhost:${PORT}/index.html`)
      const served = (await res.arrayBuffer()).byteLength
      if (served === expected) return
      // Same port, different bytes: something else is already serving here.
      throw new Error(`served ${served} bytes, built file is ${expected} — stale server on :${PORT}?`)
    } catch (e) {
      if (String(e.message).includes('stale server')) {
        console.error(`✗ ${e.message}`)
        process.exit(1)
      }
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  console.error(`✗ nothing answering on :${PORT} after 20s`)
  process.exit(1)
}

await waitForServer()
console.log(`· serving app/dist on :${PORT}\n`)

/* -- Run each suite ------------------------------------------------ */
const results = []
for (const name of suites) {
  const file = join(appDir, `verify-${name}.mjs`)
  if (!existsSync(file)) {
    console.log(`· skipping ${name} (no verify-${name}.mjs)`)
    continue
  }
  process.stdout.write(`▸ ${name} … `)
  const out = await new Promise((resolve) => {
    let buf = ''
    const p = spawn(process.execPath, [file], { cwd: appDir })
    p.stdout.on('data', (d) => (buf += d))
    p.stderr.on('data', (d) => (buf += d))
    p.on('close', (code) => resolve({ buf, code }))
  })
  const lines = out.buf.split('\n')
  const fails = lines.filter((l) => l.trimStart().startsWith('FAIL'))
  const skips = lines.filter((l) => l.trimStart().startsWith('SKIP'))
  const tally = out.buf.match(/(\d+)\/(\d+) checks passed/)
  const line = tally ? tally[0] : out.code === 0 ? 'completed' : `exited ${out.code}`
  const mark = fails.length ? '✗' : skips.length ? '⚠' : '✓'
  console.log(`${line}${skips.length ? `, ${skips.length} skipped` : ''}  ${mark}`)
  fails.forEach((f) => console.log(`    ${f.trim()}`))
  // Skips are printed too: a skip that becomes permanent is a test nobody runs.
  skips.forEach((s) => console.log(`    ${s.trim()}`))
  results.push({ name, fails: fails.length, skips: skips.length, line })
}

stop()

const broken = results.filter((r) => r.fails > 0)
const skipped = results.reduce((n, r) => n + (r.skips ?? 0), 0)
console.log(
  `\n${results.length - broken.length}/${results.length} suites clean` +
    (broken.length ? ` — failing: ${broken.map((b) => b.name).join(', ')}` : '') +
    (skipped
      ? `\n${skipped} check${skipped === 1 ? '' : 's'} skipped because this renderer is too slow to measure them — VERIFY_STRICT=1 demands them on real hardware.`
      : ''),
)
process.exit(broken.length ? 1 : 0)
