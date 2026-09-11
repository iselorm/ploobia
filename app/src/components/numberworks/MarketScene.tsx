import { useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getQualityCaps, reportFrame, useQualityCaps } from '@/lib/quality'
import PerfProbe from '@/components/PerfProbe'
import PloobCutout from '@/components/brand/PloobCutout'
import { stepMarket, type MarketSim } from '@/lib/marketsim'
import MarketCamera from './MarketCamera'
import MarketWorld from './MarketWorld'
import Stall, { type StallVerb } from './Stall'
import Neighbours, { type Neighbour } from './Neighbours'
import Shoppers from './Shoppers'
import TomatoRain from './TomatoRain'

/**
 * The Market's scene — Kejetia's alley with the learner's stall on the left
 * third. One model (`lib/market`), one live object (`lib/marketsim`) the page
 * owns and this scene ticks; the HUD reads snapshots. The generated props
 * arrive when they arrive; the stand-ins are already there.
 */

function SimTicker({ sim }: { sim: MarketSim }) {
  useFrame((_, rawDt) => {
    reportFrame(rawDt)
    stepMarket(sim, rawDt, Date.now())
  })
  return null
}

/** For the suites: the scene graph and the sim on the window. */
function Expose({ sim }: { sim: MarketSim }) {
  useFrame((state) => {
    const w = window as unknown as { __marketScene?: THREE.Scene; __marketSim?: MarketSim }
    if (!w.__marketScene) w.__marketScene = state.scene
    if (!w.__marketSim) w.__marketSim = sim
  })
  return null
}

interface Props {
  sim: MarketSim
  board: { eyebrow: string; big: string; small?: string }
  aim: StallVerb | null
  hovered: StallVerb | null
  rain: { seed: number; startAt: number; seconds: number } | null
  phone: boolean
  hudBottom: number
  onHover: (v: StallVerb | null) => void
  onTap: (v: StallVerb) => void
  onCompare: (n: Neighbour) => void
  onCatch: () => void
  onContextLost: () => void
}

export default function MarketScene({ sim, board, aim, hovered, rain, phone, hudBottom, onHover, onTap, onCompare, onCatch, onContextLost }: Props) {
  const quality = useQualityCaps()
  useEffect(() => {
    document.body.style.cursor = hovered ? 'pointer' : ''
    return () => {
      document.body.style.cursor = ''
    }
  }, [hovered])
  return (
    <Canvas
      dpr={[1, quality.maxDpr]}
      camera={{ fov: 44, near: 0.05, far: 120, position: [2.9, 2.05, 4.3] }}
      gl={{ antialias: getQualityCaps().antialias, powerPreference: 'high-performance' }}
      shadows={quality.shadows ? { type: THREE.PCFSoftShadowMap } : false}
      style={{ position: 'fixed', inset: 0 }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault()
          onContextLost()
        })
      }}
    >
      <SimTicker sim={sim} />
      <Expose sim={sim} />
      <PerfProbe cabinet="numberworks" />
      <MarketCamera sim={sim} phone={phone} hudBottom={hudBottom} />
      <MarketWorld sim={sim} />
      <Stall sim={sim} board={board} aim={aim} hovered={hovered} onHover={onHover} onTap={onTap} />
      <Neighbours onCompare={onCompare} />
      <Shoppers sim={sim} />
      {/* Ploob minds the stall — at the seller's end of the table, the scale
          reference in the frame and never between the camera and the basin */}
      <PloobCutout position={[-1.45, 0, -0.3]} height={0.95} />
      {rain && <TomatoRain sim={sim} seed={rain.seed} startAt={rain.startAt} seconds={rain.seconds} onCatch={onCatch} />}
    </Canvas>
  )
}
