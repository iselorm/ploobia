import { Routes, Route } from 'react-router'
import Menu from './pages/Menu'
import BloodVoyage from './pages/BloodVoyage'
import SugarLine from './pages/SugarLine'
import Home from './pages/Home'
import MotionLab from './pages/MotionLab'
import AtomFoundry from './pages/AtomFoundry'
import RiverBasin from './pages/RiverBasin'
import Brand from './pages/Brand'
import PilotReport from './components/hud/PilotReport'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Menu />} />
        <Route path="/blood" element={<BloodVoyage />} />
        <Route path="/photosynthesis" element={<SugarLine />} />
        <Route path="/motion" element={<MotionLab />} />
        <Route path="/atoms" element={<AtomFoundry />} />
        <Route path="/rivers" element={<RiverBasin />} />
        <Route path="/home" element={<Home />} />
        <Route path="/brand" element={<Brand />} />
      </Routes>
      {/* Pilot builds only — renders nothing when VITE_PILOT is unset. */}
      <PilotReport />
    </>
  )
}
