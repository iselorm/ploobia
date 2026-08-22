import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
export default defineConfig({
  // No boot guard here: the site is static HTML that reads perfectly with no
  // JavaScript at all — a script failure costs it the 3D hero, not the page. The
  // guard exists for the app, which is a bare <div id="root"> until React mounts.
  plugins: [viteSingleFile()],
  build: { assetsInlineLimit: 100 * 1024 * 1024, chunkSizeWarningLimit: 4000 },
})
