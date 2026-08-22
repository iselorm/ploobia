import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * Injects boot-guard.html at the top of <body>.
 *
 * Shared by the app and the site because both fail the same way: a single empty
 * root div and a module script, so anything that stops the bundle running leaves
 * a black rectangle and no way to report it. See the comment in boot-guard.html.
 *
 * `order: 'pre'` so the guard's classic script is in the document before Vite's
 * module script, and can therefore catch its errors.
 */
export function bootGuard(buildId = 'dev') {
  return {
    name: 'ploobia-boot-guard',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const guard = readFileSync(join(here, 'boot-guard.html'), 'utf8')
        const stamp = `<script>window.__PLOOBIA_BUILD_ID__=${JSON.stringify(buildId)}</script>\n`
        return html.replace(/<body([^>]*)>/i, (m, attrs) => `<body${attrs}>\n${stamp}${guard}`)
      },
    },
  }
}
