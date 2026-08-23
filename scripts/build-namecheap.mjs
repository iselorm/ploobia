#!/usr/bin/env node
/**
 * Build the folder that goes into public_html on Namecheap shared hosting.
 *
 * Different host, different rules. Cloudflare Pages reads `_headers` and runs
 * `functions/`; Apache reads `.htaccess` and runs PHP. Same two HTML files
 * either way — only the plumbing around them changes, so this reuses the same
 * app and site builds and swaps the envelope.
 *
 * Produces `dist-namecheap/` and a zip cPanel's File Manager can extract in
 * one go, because uploading 2.5 MB through a browser file picker is fine and
 * uploading it repeatedly is not.
 *
 *   npm run build:namecheap
 *
 * Env:
 *   PLOOBIA_BUILD       build id stamped into the app and every report
 *   PLOOBIA_NOINDEX=1   keep it out of search (default here is indexable —
 *                       this build is the public teaser)
 *   VITE_PILOT=0        drop the in-app report tab
 */

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'dist-namecheap')
const hosting = join(root, 'hosting', 'namecheap')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const SITE = 'https://ploobia.com'
const pilot = process.env.VITE_PILOT !== '0'
const indexable = process.env.PLOOBIA_NOINDEX !== '1'
const build = process.env.PLOOBIA_BUILD ?? new Date().toISOString().slice(0, 10)

function run(cwd, args, env = {}) {
  console.log(`\n▸ ${args.join(' ')}  (${cwd.replace(root, '.')})`)
  execFileSync(npm, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } })
}

rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, 'app'), { recursive: true })

/* -- The two builds ------------------------------------------------- */
run(join(root, 'app'), ['run', 'build'], {
  PLOOBIA_BUILD: build,
  VITE_PILOT: pilot ? '1' : '',
  // Same-origin PHP endpoint. Relative on purpose: it keeps working if the
  // site is ever moved to a subdomain or a staging folder.
  VITE_FEEDBACK_URL: process.env.VITE_FEEDBACK_URL ?? '/api/feedback.php',
  VITE_FEEDBACK_EMAIL: process.env.VITE_FEEDBACK_EMAIL ?? 'hello@ploobia.com',
})
run(join(root, 'site'), ['run', 'build'], { PLOOBIA_BUILD: build })

cpSync(join(root, 'site', 'dist'), out, { recursive: true })
cpSync(join(root, 'app', 'dist', 'index.html'), join(out, 'app', 'index.html'))

/* -- The Apache envelope -------------------------------------------- */
cpSync(join(hosting, '.htaccess'), join(out, '.htaccess'))
cpSync(join(hosting, 'api'), join(out, 'api'), { recursive: true })

/* -- Search ---------------------------------------------------------- */
writeFileSync(
  join(out, 'robots.txt'),
  indexable
    ? `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`
    : '# Not ready for search yet.\nUser-agent: *\nDisallow: /\n',
)

if (indexable) {
  const today = new Date().toISOString().slice(0, 10)
  // Only the two real pages. The cabinets live behind a hash route, which
  // crawlers do not index separately, so listing them would be noise.
  writeFileSync(
    join(out, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${today}</lastmod><priority>1.0</priority></url>
  <url><loc>${SITE}/app/</loc><lastmod>${today}</lastmod><priority>0.8</priority></url>
</urlset>
`,
  )
}

/* -- A 404 that belongs to the same world ---------------------------- */
writeFileSync(
  join(out, '404.html'),
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nothing here yet — Ploobia</title>
<meta name="robots" content="noindex">
<style>
  body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;text-align:center;
    padding:2rem;background:#17130F;color:#E9E1CF;
    font:600 16px/1.6 Nunito,system-ui,-apple-system,"Segoe UI",sans-serif}
  .eyes{display:flex;gap:.55rem;justify-content:center;margin-bottom:1.2rem}
  .eyes i{width:2.1rem;height:2.5rem;border-radius:50%;display:block;
    background:radial-gradient(circle at 38% 30%,#FFF3CF,#F5C862 45%,#C97A1F);border:2px solid #8A5410;position:relative}
  .eyes i::after{content:"";position:absolute;left:52%;top:52%;width:.6rem;height:.6rem;border-radius:50%;background:#2A1A08}
  h1{font-size:1.5rem;font-weight:900;color:#FBF5EA;margin:0 0 .5rem}
  p{opacity:.7;max-width:26rem;margin:0 auto 1.6rem}
  a{display:inline-block;background:#E8A33D;color:#17130F;font-weight:900;text-decoration:none;
    padding:.9rem 1.6rem;border-radius:999px}
</style>
</head>
<body>
  <div>
    <div class="eyes"><i></i><i></i></div>
    <h1>This part of Ploobia hasn't been discovered yet</h1>
    <p>Nothing lives at that address. Ploob looked.</p>
    <a href="/">Back to the border</a>
  </div>
</body>
</html>
`,
)

/* -- Sanity, then a zip --------------------------------------------- */
for (const f of ['index.html', 'app/index.html', 'og.png', '.htaccess', 'api/feedback.php']) {
  const p = join(out, f)
  if (!existsSync(p) || statSync(p).size < 100) {
    console.error(`\n✗ dist-namecheap/${f} is missing or truncated`)
    process.exit(1)
  }
}

const zip = join(root, 'ploobia-public_html.zip')
rmSync(zip, { force: true })
try {
  // -r includes dotfiles inside directories, but .htaccess sits at the top
  // level, so name it explicitly — this is exactly the file people forget.
  execFileSync('zip', ['-qr', zip, '.', '-x', '.DS_Store'], { cwd: out })
  console.log('')
} catch {
  console.warn('  (zip not available — upload the dist-namecheap folder contents instead)')
}

const kb = (f) => `${(statSync(join(out, f)).size / 1024).toFixed(0)} kB`
console.log(
  [
    '─'.repeat(62),
    `  build       ${build}${pilot ? '  · report tab ON → /api/feedback.php' : '  · no report tab'}`,
    `  site        index.html         ${kb('index.html')}`,
    `  arcade      app/index.html     ${kb('app/index.html')}`,
    `  apache      .htaccess          gzip · caching · https · www→apex`,
    `  search      ${indexable ? 'indexable, with sitemap.xml' : 'noindex (PLOOBIA_NOINDEX=1)'}`,
    existsSync(zip) ? `  upload      ploobia-public_html.zip  → extract in public_html/` : '',
    '─'.repeat(62),
    '',
    '  Next: hosting/namecheap/UPLOAD.md',
    '',
  ]
    .filter(Boolean)
    .join('\n'),
)

console.log('  contents:', readdirSync(out).sort().join('  '))
