import { useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getQualityCaps, reportFrame, useQualityCaps } from '@/lib/quality'
import PerfProbe from '@/components/PerfProbe'
import { WorldState } from '@/lib/world'
import { stepRiver, type RiverSim } from '@/lib/river'
import PostFX from '@/components/photo/world/PostFX'
import BasinWorld from './BasinWorld'
import { MapSheet } from './ValleyTerrain'
import RiverWater from './RiverWater'
import Detail from './Detail'
import FieldKit from './FieldKit'
import HydroVision from './HydroVision'
import RiverCamera from './RiverCamera'

/**
 * Advances the model. SUB-STEPS on slow frames (house rule): a storm must take
 * the same wall-clock time on a phone as on a desktop, so we run the model in
 * ≤0.1 s chunks up to the real elapsed time rather than throwing the rest away.
 */
function SimTicker({ sim }: { sim: RiverSim }) {
  useFrame((_, rawDt) => {
    reportFrame(rawDt)
    let left = Math.min(rawDt, 1.5)
    while (left > 1e-4) {
      const step = Math.min(left, 0.1)
      stepRiver(sim, step)
      left -= step
    }
    sim.lastWall = performance.now()
  })
  return null
}

interface Props {
  sim: RiverSim
  sections: Partial<Record<'st1' | 'st2' | 'st3', number[]>>
  onContextLost: () => void
}

export default function RiverScene({ sim, sections, onContextLost }: Props) {
  const quality = useQualityCaps()
  const world = useMemo(() => new WorldState(), [])
  return (
    <Canvas
      dpr={[1, quality.maxDpr]}
      camera={{ fov: 46, near: 0.05, far: 900, position: [128, 108, 150] }}
      gl={{ antialias: getQualityCaps().antialias, powerPreference: 'high-performance' }}
      shadows={quality.shadows ? { type: THREE.PCFSoftShadowMap } : false}
      style={{ position: 'fixed', inset: 0 }}
      onCreated={({ gl, scene, camera }) => {
        // Debug handles for verify-river.mjs and visual bisection.
        const w = window as unknown as Record<string, unknown>
        w.__riverScene = scene
        w.__riverCam = camera
        gl.outputColorSpace = THREE.SRGBColorSpace
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.0
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault()
          onContextLost()
        })
      }}
    >
      <SimTicker sim={sim} />
      <PerfProbe cabinet="rivers" />
      <RiverCamera sim={sim} />
      <BasinWorld sim={sim} world={world} />
      <MapSheet sim={sim} />
      <RiverWater sim={sim} world={world} />
      <FieldKit sim={sim} world={world} />
      <Detail sim={sim} />
      <HydroVision sim={sim} sections={sections} />
      <PostFX />
    </Canvas>
  )
}
