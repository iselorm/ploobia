import { Suspense, lazy } from 'react'
import { Routes, Route } from 'react-router'
import Menu from './pages/Menu'
import BloodVoyage from './pages/BloodVoyage'
import SugarLine from './pages/SugarLine'
import Home from './pages/Home'
import MotionLab from './pages/MotionLab'
import FirstPhysics from './pages/FirstPhysics'
import AtomFoundry from './pages/AtomFoundry'
import RiverBasin from './pages/RiverBasin'
import Numberworks from './pages/Numberworks'
import Brand from './pages/Brand'
import PilotReport from './components/hud/PilotReport'
import { WORLD_ENABLED } from './lib/cabinets'

// The world branch rides behind a build flag: `VITE_WORLD=1` builds it in,
// anything else tree-shakes the whole chunk (Rapier included) out of the
// classroom single-file arcade. See lib/cabinets.ts.
const World = WORLD_ENABLED ? lazy(() => import('./pages/World')) : null

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Menu />} />
        <Route path="/blood" element={<BloodVoyage />} />
        <Route path="/photosynthesis" element={<SugarLine />} />
        <Route path="/physics" element={<FirstPhysics />} />
        <Route path="/physics/:episode" element={<FirstPhysics />} />
        <Route path="/motion" element={<MotionLab />} />
        <Route path="/atoms" element={<AtomFoundry />} />
        <Route path="/rivers" element={<RiverBasin />} />
        <Route path="/numberworks" element={<Numberworks />} />
        <Route path="/home" element={<Home />} />
        <Route path="/brand" element={<Brand />} />
        {World && (
          <Route
            path="/world"
            element={
              <Suspense fallback={null}>
                <World />
              </Suspense>
            }
          />
        )}
      </Routes>
      {/* Pilot builds only — renders nothing when VITE_PILOT is unset. */}
      <PilotReport />
    </>
  )
}
