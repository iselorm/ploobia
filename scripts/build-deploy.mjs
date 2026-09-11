#!/usr/bin/env node
/**
 * Assemble the hostable bundle.
 *
 *   dist/index.html      the public site   (ploobia.com)
 *   dist/og.png          social card, referenced absolutely by the site's meta
 *   dist/app/index.html  the arcade        (ploobia.com/app/)
 *   dist/app/models/…    the cabinets' generated props (loaded on demand)
 *   dist/app/art/…       the cabinets' painted cards, cutouts and thumbnails
 *   dist/_headers        Cloudflare Pages cache + security headers
 *   dist/robots.txt      whether crawlers are welcome
 *
 * Both halves are single-file builds, so "assembly" is placing two HTML files
 * and their headers — plus the on-demand asset folders the Numberworks
 * introduced: meshes and painted art too big to inline, fetched by the page
 * when it needs them and stood in for by procedural props until they arrive.
 * The app never fails for their absence; the offline copy simply ships
 * without them.
 *
 * Env:
 *   PLOOBIA_BUILD   build id stamped into the app (CI passes the short sha)
 *   VITE_PILOT      '1' to include the in-app report tab
 *   VITE_FEEDBACK_URL, VITE_FEEDBACK_EMAIL   where reports go
 *   PLOOBIA_INDEXABLE  '1' to let search engines in (default: keep it unlisted)
 */

import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

/**
 * Node 20.12 / 21.7 / 22 refuse to `execFileSync` a `.cmd` or `.bat` without a
 * shell — the fix for CVE-2024-27980 ("BatBadBut"), which made argument
 * injection through cmd.exe possible. On Windows that turns this call into
 * `spawnSync npm.cmd EINVAL`, which reads like a broken install and is not.
 *
 * `shell` is therefore on for win32 only. It is safe here because every
 * argument is a hard-coded literal — never interpolate user input into an
 * argv that runs through a shell.
 */
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function run(cwd, args, env = {}) {
  console.log(`\n▸ ${args.join(' ')}  (${cwd.replace(root, '.')})`)
  execFileSync(npm, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...env },
    shell: process.platform === 'win32',
  })
}

function kb(path) {
  return `${(statSync(path).size / 1024).toFixed(0)} kB`
}

/* ---------------------------------------------------------------- */

rmSync(dist, { recursive: true, force: true })
mkdirSync(join(dist, 'app'), { recursive: true })

run(join(root, 'app'), ['run', 'build'])
run(join(root, 'site'), ['run', 'build'])

cpSync(join(root, 'site', 'dist'), dist, { recursive: true })
cpSync(join(root, 'app', 'dist', 'index.html'), join(dist, 'app', 'index.html'))
// On-demand assets: content is versioned by the build, so they can be cached
// hard; a changed prop gets a new file name in the manifest, not a new byte
// pattern under an old one.
for (const folder of ['models', 'art']) {
  const src = join(root, 'app', 'dist', folder)
  try {
    statSync(src)
  } catch {
    continue
  }
  cpSync(src, join(dist, 'app', folder), { recursive: true })
}

/* -- Headers ------------------------------------------------------ *
 * The two HTML files are the whole app, so they must never be served
 * stale: a pilot tester who reloads after a fix has to actually get
 * the fix. Everything else is content-addressed or rarely changes.  */
writeFileSync(
  join(dist, '_headers'),
  `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=()

/index.html
  Cache-Control: no-cache

/app/index.html
  Cache-Control: no-cache

/og.png
  Cache-Control: public, max-age=86400

/app/models/*
  Cache-Control: public, max-age=604800

/app/art/*
  Cache-Control: public, max-age=604800
`,
)

const indexable = process.env.PLOOBIA_INDEXABLE === '1'
writeFileSync(
  join(dist, 'robots.txt'),
  indexable
    ? 'User-agent: *\nAllow: /\n'
    : '# Pilot: the link is unlisted, so keep it out of search results.\nUser-agent: *\nDisallow: /\n',
)

/* A hash-routed SPA needs no rewrite rules — every route is one file —
 * but a mistyped path should still land somewhere useful. */
writeFileSync(join(dist, '_redirects'), '/app  /app/  301\n')

const siteSize = kb(join(dist, 'index.html'))
const appSize = kb(join(dist, 'app', 'index.html'))
const build = process.env.PLOOBIA_BUILD ?? 'local'
const pilot = process.env.VITE_PILOT === '1'

console.log(
  [
    '',
    '─'.repeat(56),
    `  build      ${build}${pilot ? '  · pilot report tab ON' : ''}`,
    `  site       dist/index.html      ${siteSize}`,
    `  arcade     dist/app/index.html  ${appSize}`,
    `  robots     ${indexable ? 'indexable' : 'unlisted (Disallow: /)'}`,
    `  feedback   ${process.env.VITE_FEEDBACK_URL || 'no endpoint — clipboard + mailto fallback'}`,
    '─'.repeat(56),
    '',
  ].join('\n'),
)

// Fail loudly rather than shipping half a bundle.
for (const f of ['index.html', 'app/index.html', 'og.png']) {
  const p = join(dist, f)
  try {
    if (statSync(p).size < 1000) throw new Error('suspiciously small')
  } catch (e) {
    console.error(`\n✗ dist/${f} is missing or broken: ${e.message}`)
    process.exit(1)
  }
}

// The site links to ./app/ — if that ever drifts, the bundle is incoherent.
const siteHtml = readFileSync(join(dist, 'index.html'), 'utf8')
if (!siteHtml.includes('./app/')) {
  console.error('\n✗ the site build does not reference ./app/ — check APP_URL in site/main.js')
  process.exit(1)
}
