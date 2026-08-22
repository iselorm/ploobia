import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getQualityCaps, reportFrame, useQualityCaps } from '@/lib/quality'
import PerfProbe from '@/components/PerfProbe'
import { stepAtoms, type AtomSim } from '@/lib/atoms'
import PostFX from '@/components/photo/world/PostFX'
import FoundryWorld from './FoundryWorld'
import BuildAtom from './BuildAtom'
import TableWall from './TableWall'
import Dispensers, { type ParticleKind } from './Dispensers'
import Probe from './Probe'
import AtomCamera from './AtomCamera'

/** Advances the sim clock. Probe and placement timers use the loose clamp so
 *  a 2-second probe takes about 2 real seconds even on slow hardware. */
function SimTicker({ sim }: { sim: AtomSim }) {
  useFrame((_, rawDt) => {
    reportFrame(rawDt)
    stepAtoms(sim, Math.min(rawDt, 0.25))
  })
  return null
}

interface Props {
  sim: AtomSim
  protons: number
  neutrons: number
  electrons: number
  cloudView: boolean
  showMass: boolean
  showNeutrons: boolean
  discovered: number[]
  probed: Record<number, number>
  onAdd: (kind: ParticleKind) => void
  onTile: (z: number) => void
  onFact: (kind: 'nucleus' | 'electron' | 'wall' | 'probe') => void
  onContextLost: () => void
}

/** Full-viewport canvas for the Atom Foundry. Code-split via React.lazy by the page. */
export default function AtomScene({
  sim,
  protons,
  neutrons,
  electrons,
  cloudView,
  showMass,
  showNeutrons,
  discovered,
  probed,
  onAdd,
  onTile,
  onFact,
  onContextLost,
}: Props) {
  const quality = useQualityCaps()
  return (
    <Canvas
      dpr={[1, quality.maxDpr]}
      camera={{ fov: 46, near: 0.05, far: 200, position: [0, 2.5, 7.8] }}
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
      <PerfProbe cabinet="atoms" />
      <AtomCamera sim={sim} />
      <FoundryWorld />
      <BuildAtom sim={sim} protons={protons} neutrons={neutrons} electrons={electrons} cloudView={cloudView} showMass={showMass} onFact={onFact} />
      <TableWall
        sim={sim}
        discovered={discovered}
        probed={probed}
        ghostElectrons={electrons}
        ghostBalanced={protons === electrons && protons > 0}
        onTile={onTile}
        onWallFact={() => onFact('wall')}
      />
      <Dispensers sim={sim} showNeutrons={showNeutrons} onAdd={onAdd} />
      <Probe sim={sim} onFact={() => onFact('probe')} />
      <PostFX />
    </Canvas>
  )
}
