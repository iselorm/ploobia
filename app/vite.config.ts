import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'plugin-inspect-react-code'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { bootGuard } from '../boot-guard.js'

// https://vite.dev/config/
//
// NOTE: `inspectAttr` injects a `code-path` attribute onto every JSX element.
// react-three-fiber forwards unknown props straight onto the underlying three.js
// object, so when such an element updates it throws
// `R3F: Cannot set "code-path"` and drops the whole scene into the error
// boundary. The inspector is a dev-time convenience, so it now runs only while
// serving and never ships inside the single-file build.
//
// Build stamp: a pilot report is only actionable if it names the build it came
// from, and a single-file bundle carries no other version marker. CI sets
// PLOOBIA_BUILD to the short commit sha; a local build gets a timestamp.
const BUILD_ID =
  process.env.PLOOBIA_BUILD ?? `${new Date().toISOString().slice(0, 16).replace('T', ' ')} local`

/**
 * Offline build (`PLOOBIA_OFFLINE=1`) — a copy that survives being opened as a
 * FILE rather than served.
 *
 * Safari refuses `<script type="module">` on a `file://` origin: it treats file
 * as an opaque origin and applies CORS to module fetches, inline ones included.
 * So an .html emailed to an iPhone shows a blank screen, while the same file on
 * a laptop works — which is exactly how a tester found it. Chromium is more
 * permissive, so this never shows up in local testing.
 *
 * The fix is to stop being a module: bundle as an IIFE and drop the
 * `type="module" crossorigin` attributes, leaving a classic script, which every
 * browser will run from a file. Nothing in the app needs module semantics once
 * it is a single bundled chunk.
 *
 * The hosted build stays a module — this variant exists for handing the arcade
 * to someone with no reliable connection, which for this product is a real case
 * and not an edge one.
 */
const OFFLINE = process.env.PLOOBIA_OFFLINE === '1'

/**
 * Turns the emitted module tag into a classic one. Offline builds only.
 *
 * This runs while the tag still carries its `src` — vite-plugin-singlefile
 * inlines the code later, in generateBundle — so it strips the attributes and
 * leaves the tag itself alone, rather than trying to match the finished inline
 * form.
 */
const classicScript = {
  name: 'ploobia-classic-script',
  enforce: 'post' as const,
  transformIndexHtml(html: string) {
    return html.replace(/<script\b[^>]*>/g, (tag) =>
      /type="module"/.test(tag) ? tag.replace(/\s+type="module"/, '').replace(/\s+crossorigin/, '') : tag,
    )
  },
}

export default defineConfig(({ command }) => ({
  base: './',
  plugins: [
    ...(command === 'serve' ? [inspectAttr()] : []),
    bootGuard(BUILD_ID),
    react(),
    viteSingleFile(),
    ...(OFFLINE ? [classicScript] : []),
  ],
  define: {
    __PLOOBIA_BUILD__: JSON.stringify(BUILD_ID),
  },
  server: {
    port: 3000,
  },
  // The whole app ships as ONE html file, so binary assets (ploob.glb) must be
  // inlined as data URIs rather than emitted beside it — vite-plugin-singlefile
  // only folds in JS and CSS.
  build: {
    // Measured, not guessed: esbuild reports nothing to lower for Safari 14
    // and above, and only ~6 kB for Safari 13 — so an explicit floor here is
    // almost free and removes "the parser choked" from the list of reasons a
    // learner's phone shows nothing. three.js needs WebGL2 (iOS 15+) in
    // practice, so 13 is a courtesy rather than a promise.
    target: ['es2020', 'safari13', 'chrome87', 'firefox78', 'edge88'],
    assetsInlineLimit: 4 * 1024 * 1024,
    // An IIFE has no import/export to resolve, so it can run as a classic
    // script — which is what makes the offline copy openable from a file.
    ...(OFFLINE ? { rollupOptions: { output: { format: 'iife' as const } } } : {}),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
