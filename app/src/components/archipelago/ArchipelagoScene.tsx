import { Suspense, lazy, useEffect } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { WebglFallback } from '@/components/SceneErrorBoundary'
import PerfProbe from '@/components/PerfProbe'
import { getQualityCaps, useQualityCaps } from '@/lib/quality'
import { getWorld, plotChoose, plotSay, probeBed, runBedId, setWorld, tickWorld, useWorld } from '@/lib/archipelago'
import { setBand } from '@/lib/bands'
import { getSun, setSun } from '@/lib/looks'
import { bedLevel } from '@/lib/worldaudio'
import Explorer from './Explorer'
import FollowCamera from './FollowCamera'
import Companion from './Companion'
import Guide from './Guide'
import Landing from './Landing'
import { control, live } from './live'

/**
 * One Canvas, one Physics world, and a zone that swaps under the explorer.
 * The Courtyard is a lazy chunk on purpose: in the hosted world it is the
 * second download and the walk through the gate is the load. (The single-file
 * arcade folds it in anyway — that build does not carry the world at all.)
 */
const Courtyard = lazy(() => import('./Courtyard'))

function Ticker() {
  useFrame((_, dt) => tickWorld(dt))
  return null
}

/** Suites read the world through this; nothing in the app does. */
function Expose() {
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    w.__world = {
      get: getWorld,
      live,
      control,
      scene,
      cam: () => [camera.position.x, camera.position.y, camera.position.z],
      // Suites only: jump the world to a state and pick a band, so a late beat
      // can be tested without the two-minute walk in front of it.
      set: setWorld,
      setBand,
      setPos: (x: number, y: number, z: number) => {
        live.requestPos = [x, y, z]
      },
      setSun,
      sun: getSun,
      bed: bedLevel,
      // S0, suites only: the plot's verbs without the walk, and a day run in one call.
      plot: {
        probe: () => probeBed(runBedId(getWorld()) ?? ''),
        say: plotSay,
        choose: plotChoose,
        run: () => getWorld().plot.run,
        runDay: () => {
          for (let i = 0; i < 40 && getWorld().plot.run?.phase === 'running'; i += 1) tickWorld(0.25)
        },
      },
    }
    return () => {
      delete w.__world
    }
  }, [scene, camera])
  return null
}

export default function ArchipelagoScene({ hudBottom = 0, onContextLost }: { hudBottom?: number; onContextLost?: () => void }) {
  const quality = useQualityCaps()
  const s = useWorld()
  return (
    <Canvas
      fallback={<WebglFallback />}
      dpr={[1, quality.maxDpr]}
      camera={{ fov: 46, near: 0.1, far: 400, position: [0, 4, 10] }}
      gl={{ antialias: getQualityCaps().antialias, powerPreference: 'high-performance' }}
      shadows={quality.shadows ? { type: THREE.PCFSoftShadowMap } : false}
      style={{ position: 'fixed', inset: 0 }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.02
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault()
          onContextLost?.()
        })
      }}
    >
      <PerfProbe cabinet="world" />
      <Expose />
      <Ticker />
      <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60}>
        <Suspense fallback={null}>{s.zone === 'landing' ? <Landing /> : <Courtyard />}</Suspense>
        <Explorer />
      </Physics>
      <Companion />
      <Guide />
      <FollowCamera hudBottom={hudBottom} />
    </Canvas>
  )
}
