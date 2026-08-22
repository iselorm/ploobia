import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'plugin-inspect-react-code'
import { viteSingleFile } from 'vite-plugin-singlefile'

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

export default defineConfig(({ command }) => ({
  base: './',
  plugins: [...(command === 'serve' ? [inspectAttr()] : []), react(), viteSingleFile()],
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
    assetsInlineLimit: 4 * 1024 * 1024,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
