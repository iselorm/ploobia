import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getQualityCaps, reportFrame, useQualityCaps } from '@/lib/quality'
import { stepMotion, type MassId, type MotionSim, type SurfaceId, type WorldId } from '@/lib/motion'
import type { LauncherId, VenueId } from '@/lib/yard'
import PostFX from '@/components/photo/world/PostFX'
import YardWorld from './YardWorld'
import YardKit from './YardKit'
import Launchers from './Launchers'
import Scout from './Scout'
import Vision from './Vision'
import MotionCamera from './MotionCamera'

/**
 * Advances the sim clock and every analytic motion in the yard. Idle
 * animation uses the tight clamp; the motion itself the looser one, so a
 * "0.45 s" fall still takes about 0.45 real seconds on slow hardware.
 */
function SimTicker({ sim }: { sim: MotionSim }) {
  useFrame((_, rawDt) => {
    reportFrame(rawDt)
    const stepDt = Math.min(rawDt, 0.25)
    stepMotion(sim, stepDt)
    sim.lastWall = performance.now()
  })
  return null
}

interface Props {
  sim: MotionSim
  world: WorldId
  venue: VenueId
  visionOn: boolean
  surface: SurfaceId
  mass: MassId
  target: number
  gatesUnlocked: boolean
  gateDist: number
  paired: boolean
  padUnlocked: boolean
  sensorUnlocked: boolean
  extraWorlds: boolean
  showComponents: boolean
  launcher: LauncherId
  launchAngle: number
  launchPower: number
  trebuchetUnlocked: boolean
  targetDist: number
  ringAt: number | null
  dropHeight: number
  g: number
  earned: string[]
  onPlaceRing: (d: number) => void
  onContextLost: () => void
}

/** Full-viewport canvas for the Motion Yard. Code-split via React.lazy by the page. */
export default function MotionScene({
  sim,
  world,
  venue,
  visionOn,
  surface,
  mass,
  target,
  gatesUnlocked,
  gateDist,
  paired,
  padUnlocked,
  sensorUnlocked,
  extraWorlds,
  showComponents,
  launcher,
  launchAngle,
  launchPower,
  trebuchetUnlocked,
  targetDist,
  ringAt,
  dropHeight,
  g,
  earned,
  onPlaceRing,
  onContextLost,
}: Props) {
  const quality = useQualityCaps()
  return (
    <Canvas
      dpr={[1, quality.maxDpr]}
      camera={{ fov: 46, near: 0.05, far: 400, position: [1.6, 2.6, 6.9] }}
      gl={{ antialias: getQualityCaps().antialias, powerPreference: 'high-performance' }}
      shadows={quality.shadows ? { type: THREE.PCFSoftShadowMap } : false}
      style={{ position: 'fixed', inset: 0 }}
      onCreated={({ gl }) => {
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
      <MotionCamera sim={sim} />
      <YardWorld sim={sim} venue={venue} />
      <YardKit
        sim={sim}
        world={world}
        surface={surface}
        mass={mass}
        target={target}
        gatesUnlocked={gatesUnlocked}
        gateDist={gateDist}
        paired={paired}
        padUnlocked={padUnlocked}
        sensorUnlocked={sensorUnlocked}
        extraWorlds={extraWorlds}
        earned={earned}
        g={g}
      />
      <Launchers
        sim={sim}
        launcher={launcher}
        angle={launchAngle}
        power={launchPower}
        mass={mass}
        venue={venue}
        trebuchetUnlocked={trebuchetUnlocked}
        targetDist={targetDist}
        ringAt={ringAt}
        onPlaceRing={onPlaceRing}
      />
      <Scout sim={sim} mass={mass} dropHeight={dropHeight} />
      <Vision sim={sim} on={visionOn} showComponents={showComponents} />
      <PostFX />
    </Canvas>
  )
}
