import { Canvas } from '@react-three/fiber'
import { getQualityCaps, setQualityTier, useQualityCaps } from '@/lib/quality'
import type { SimState, Highlight } from '@/lib/sim'
import type { CellType } from '@/lib/facts'
import Vessel from './Vessel'
import RedBloodCells from './RedBloodCells'
import WhiteBloodCells from './WhiteBloodCells'
import Platelets from './Platelets'
import CameraRig from './CameraRig'
import RacerTags from './RacerTags'
import ChevronFlow from './ChevronFlow'
import HeroCell from './HeroCell'
import JourneyWorld from './JourneyWorld'
import CheckpointGates from './CheckpointGates'

interface Props {
  sim: SimState
  highlighted: Highlight | null
  /** kept for API stability; tags read sim.labels directly each frame */
  labelsOn?: boolean
  onCellClick: (type: CellType, id: number) => void
  onContextLost: () => void
}

/**
 * Full-viewport 3D blood-vessel ride. Composed inside a React.lazy boundary
 * by the page so the WebGL bundle is code-split.
 */
export default function BloodVesselScene({
  sim,
  highlighted,
  onCellClick,
  onContextLost,
}: Props) {
  const quality = useQualityCaps()
  return (
    <Canvas
      dpr={[1, quality.maxDpr]}
      camera={{ fov: 62, near: 0.1, far: 160, position: [0, 0, 0] }}
      gl={{ antialias: getQualityCaps().antialias, powerPreference: 'high-performance' }}
      style={{ position: 'fixed', inset: 0 }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault()
          onContextLost()
        })
        if (typeof window !== 'undefined') {
          // Test handles: the render budget this cabinet actually costs, and
          // a way to force a quality tier for the low-end device pass.
          const w = window as unknown as Record<string, unknown>
          w.__renderInfo = () => ({
            calls: gl.info.render.calls,
            triangles: gl.info.render.triangles,
            programs: gl.info.programs?.length ?? 0,
          })
          w.__setTier = (t: 'high' | 'medium' | 'low') => setQualityTier(t)
        }
      }}
    >
      <color attach="background" args={['#4A0E12']} />
      <fogExp2 attach="fog" args={['#4A0E12', 0.042]} />
      <CameraRig sim={sim} />
      <Vessel sim={sim} />
      <RedBloodCells sim={sim} highlighted={highlighted} onCellClick={onCellClick} />
      <WhiteBloodCells sim={sim} highlighted={highlighted} onCellClick={onCellClick} />
      <Platelets sim={sim} highlighted={highlighted} onCellClick={onCellClick} />
      <HeroCell sim={sim} />
      <JourneyWorld sim={sim} onCellClick={onCellClick} />
      <CheckpointGates sim={sim} />
      <RacerTags sim={sim} />
      <ChevronFlow sim={sim} />
    </Canvas>
  )
}
