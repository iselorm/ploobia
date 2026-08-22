import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { installInputRuntime } from './lib/input'
import { installPilotRuntime } from './lib/pilot'
import './lib/profiles'

declare global {
  interface Window {
    /** Read by the boot guard so a startup crash is shown, not swallowed. */
    __ploobiaBootError?: string
  }
}

function start() {
  const root = document.getElementById('root')
  if (!root) {
    console.error('Ploobia: #root is missing from the document')
    return
  }
  // Anything that throws in here leaves the page on the boot shell forever,
  // and the shell's watchdog can only guess at why. Hand it the real message.
  try {
    installInputRuntime()
    installPilotRuntime()
    createRoot(root).render(
      <HashRouter>
        <App />
      </HashRouter>,
    )
  } catch (e) {
    window.__ploobiaBootError = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    throw e
  }
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
