import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { installInputRuntime } from './lib/input'
import { installPilotRuntime } from './lib/pilot'
import './lib/profiles'

function start() {
  const root = document.getElementById('root')
  if (!root) {
    // The boot guard in index.html is watching for exactly this and will say so
    // on screen rather than leaving a blank rectangle.
    console.error('Ploobia: #root is missing from the document')
    return
  }
  installInputRuntime()
  installPilotRuntime()
  createRoot(root).render(
    <HashRouter>
      <App />
    </HashRouter>,
  )
}

/**
 * Wait for the DOM rather than assuming it.
 *
 * A `type="module"` script is deferred, so `#root` is always there by the time
 * this runs — but the offline build (see PLOOBIA_OFFLINE in vite.config.ts)
 * ships a *classic* script so that Safari will run it from a `file://` origin,
 * and a classic inline script is not deferred. Without this guard that build
 * died on `createRoot(null)` before the page had a body to mount into.
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true })
} else {
  start()
}
