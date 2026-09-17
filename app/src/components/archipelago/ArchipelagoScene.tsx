import { Suspense, lazy, useEffect } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import PerfProbe from '@/components/PerfProbe'
import { getQualityCaps, useQualityCaps } from '@/lib/quality'
import { getWorld, tickWorld, useWorld } from '@/lib/archipelago'
import Explorer from './Explorer'
import FollowCamera from './FollowCamera'
import Companion from './Companion'
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
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    w.__world = {
      get: getWorld,
      live,
      control,
      scene,
      setPos: (x: number, y: number, z: number) => {
        live.requestPos = [x, y, z]
      },
    }
    return () => {
      delete w.__world
    }
  }, [scene])
  return null
}

export default function ArchipelagoScene({ hudBottom = 0, onContextLost }: { hudBottom?: number; onContextLost?: () => void }) {
  const quality = useQualityCaps()
  const s = useWorld()
  return (
    <Canvas
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
      <FollowCamera hudBottom={hudBottom} />
    </Canvas>
  )
}
