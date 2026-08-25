#!/usr/bin/env node
/**
 * Build the offline copy — one file a person can be handed and open.
 *
 * A tester on an iPhone was emailed `index.html`, tapped it, and got a blank
 * screen. Safari refuses `<script type="module">` on a `file://` origin (it
 * treats file as an opaque origin and applies CORS to module fetches, inline
 * ones included), so the bundle never ran and there was nothing on screen to
 * explain why. Chromium is permissive here, which is why it had passed every
 * local file:// test.
 *
 * `PLOOBIA_OFFLINE=1` bundles as an IIFE and strips `type="module"`, leaving a
 * classic script that every browser will run from a file. The output is named
 * so nobody confuses it with the hosted build.
 *
 *   npm run build:offline   →  dist-offline/Ploobia-offline.html
 */

import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'dist-offline')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

execFileSync(npm, ['run', 'build'], {
  cwd: join(root, 'app'),
  stdio: 'inherit',
  env: {
    ...process.env,
    PLOOBIA_OFFLINE: '1',
    // The report tab still works offline: it falls back to clipboard + mailto.
    VITE_PILOT: process.env.VITE_PILOT ?? '1',
  },
  // See the note in build-deploy.mjs: Node >= 20.12 will not exec a .cmd
  // without a shell, so on Windows this is `spawnSync npm.cmd EINVAL` otherwise.
  shell: process.platform === 'win32',
})

const file = join(out, 'Ploobia-offline.html')
cpSync(join(root, 'app', 'dist', 'index.html'), file)

console.log(
  [
    '',
    '─'.repeat(56),
    `  dist-offline/Ploobia-offline.html   ${(statSync(file).size / 1024).toFixed(0)} kB`,
    '  Classic script, no modules — opens from a file on iOS Safari.',
    '  Hand this one out. Serve dist/ for everything else.',
    '─'.repeat(56),
    '',
  ].join('\n'),
)
