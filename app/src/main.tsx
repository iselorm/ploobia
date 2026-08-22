import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { installInputRuntime } from './lib/input'
import { installPilotRuntime } from './lib/pilot'
import './lib/profiles'

installInputRuntime()
installPilotRuntime()

createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <App />
  </HashRouter>,
)
