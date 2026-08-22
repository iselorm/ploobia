import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getQualityCaps, reportFrame, useQualityCaps } from '@/lib/quality'
import { simEnv, simLeaf, type LabMode, type MembraneDemo, type PhotoSim } from '@/lib/photo'
import { BIOME_BY_ID } from '@/lib/leaves'
import { solveLeaf, stepWater } from '@/lib/ratelab'
import GardenWorld from './GardenWorld'
import MembraneWorld from './MembraneWorld'

/**
 * Advances the shared wall-clock, the plant's water balance, and any running
 * measurement trial. Everything time-dependent in the cabinet lives here, so
 * the numbers stay in step with the visuals the learner is watching.
 */
function SimTicker({ sim }: { sim: PhotoSim }) {
  useFrame((_, rawDt) => {
    reportFrame(rawDt)
    // Idle animation uses a tight clamp so nothing jumps after a stall. The
    // water budget and the trial clock use a looser one, so that on a slow
    // machine a "6 second" trial still takes about six real seconds rather
    // than stretching out with the frame rate.
    const dt = Math.min(rawDt, 0.05)
    const stepDt = Math.min(rawDt, 0.25)
    sim.time += dt
    if (sim.paused || !sim.started) return

    const leaf = simLeaf(sim)
    const env = simEnv(sim)
    const phys = solveLeaf(leaf, env)

    // Water balance: transpiration drains the leaf and the soil, roots and
    // rainfall push back. A succulent's reservoir makes this very slow.
    const rain = BIOME_BY_ID[sim.biomeId]?.rainRate ?? 0
    const next = stepWater(leaf, env, phys, rain, stepDt)
    sim.turgor = next.turgor
    sim.water = next.soilWater

    // A trial averages the rate over its whole duration — exactly like counting
    // bubbles for a fixed time in a real lab.
    if (sim.trialRunning) {
      sim.trialElapsed += stepDt
      sim.trialRateSum += phys.reading * stepDt
      sim.trialSamples += stepDt
      if (phys.reading > 0) sim.trialBubbles += (phys.reading * stepDt) / 60
      if (sim.trialElapsed >= sim.trialLength) {
        sim.lastTrueValue = sim.trialSamples > 0 ? sim.trialRateSum / sim.trialSamples : 0
        sim.trialRunning = false
        sim.trialCompleted += 1
      }
    }
  })
  return null
}

interface Props {
  sim: PhotoSim
  mode: LabMode
  demo: MembraneDemo
  zoomed: boolean
  equationOpen: boolean
  /** React-state mirrors so the scene re-renders when the specimen changes. */
  leafId: string
  biomeId: string
  membraneId: string
  onChloroplastFact: () => void
  onContextLost: () => void
}

/**
 * Full-viewport 3D canvas for the Photosynthesis Lab. Swaps between the
 * sunny garden and the underground membrane chamber. Code-split via
 * React.lazy by the page.
 */
export default function PhotoScene({
  sim,
  mode,
  demo,
  zoomed,
  equationOpen,
  leafId,
  biomeId,
  membraneId,
  onChloroplastFact,
  onContextLost,
}: Props) {
  // Quality tier: DPR follows the tier live (a downgrade mid-session takes
  // effect at once); antialias is fixed at context creation, so it reads the
  // boot-time guess.
  const quality = useQualityCaps()
  return (
    <Canvas
      dpr={[1, quality.maxDpr]}
      camera={{ fov: 50, near: 0.1, far: 400, position: [0, 3.4, 10.5] }}
      gl={{ antialias: getQualityCaps().antialias, powerPreference: 'high-performance' }}
      shadows={quality.shadows ? { type: THREE.PCFSoftShadowMap } : false}
      style={{ position: 'fixed', inset: 0 }}
      onCreated={({ gl }) => {
        // Renderer pipeline first, materials second (see vault: Rendering Craft).
        gl.outputColorSpace = THREE.SRGBColorSpace
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.04
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault()
          onContextLost()
        })
      }}
    >
      <SimTicker sim={sim} />
      {mode === 'garden' ? (
        <GardenWorld
          sim={sim}
          zoomed={zoomed}
          equationOpen={equationOpen}
          leafId={leafId}
          biomeId={biomeId}
          onChloroplastFact={onChloroplastFact}
        />
      ) : (
        <MembraneWorld sim={sim} demo={demo} membraneId={membraneId} />
      )}
    </Canvas>
  )
}
