import { useWorld } from '@/lib/archipelago'
import { KEEP, packingCrew, totalCrates } from '@/lib/keep'
import { BEDS, JETTY_X, SELA_AT } from './landingLayout'

/**
 * S1 in the world (storyboard v3.1 §05): what the child sees before any card.
 * Sela's board of four pegs (teal on the beds, amber packing); the crates the
 * story fortnight packed, on the jetty's planks; Sela's people at the far bed
 * while they care for it, with a small flag in the bed where Nara stopped the
 * rule. Primitives, a handful of meshes — the Landing's own register.
 * Scene handles for suites: `keep-board` (userData.onBeds), `keep-crates`
 * (userData.count), `keep-crew` (userData.why).
 */
export default function KeepScene() {
  const s = useWorld()
  const k = s.keep
  if (!k) return null
  const choice = k.dispatch && k.dispatch.status !== 'read' ? k.dispatch.choice : k.choice
  const onBeds = choice ? KEEP.crew - packingCrew(choice) : null
  const crates = totalCrates(k)
  const far = k.dispatch?.report?.beds.far
  const crewWhy = k.dispatch && k.dispatch.status !== 'read' && far ? (far.stop ? far.stop.by : far.crewCalled ? 'crew-called' : far.mode === 'supervised' || far.mode === 'trial' ? far.mode : null) : null
  return (
    <group name="keep">
      {onBeds != null && <Board onBeds={onBeds} />}
      <Crates count={crates} />
      {crewWhy && <Crew why={crewWhy} flag={!!far?.stop} />}
    </group>
  )
}

const TEAL = '#2F7F7A'
const AMBER = '#E8A33D'

function Board({ onBeds }: { onBeds: number }) {
  return (
    <group position={[SELA_AT[0] + 1.25, 0, SELA_AT[2] - 0.2]} rotation={[0, Math.PI + 0.35, 0]} name="keep-board" userData={{ onBeds }}>
      <mesh position={[0, 0.7, 0]} castShadow>
        <boxGeometry args={[0.08, 1.4, 0.08]} />
        <meshStandardMaterial color="#6B4A2E" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.35, 0.02]} castShadow>
        <boxGeometry args={[0.9, 0.5, 0.05]} />
        <meshStandardMaterial color="#8A6440" roughness={0.85} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[-0.3 + i * 0.2, 1.35, 0.08]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 0.22, 10]} />
          <meshStandardMaterial color={i < onBeds ? TEAL : AMBER} roughness={0.6} />
        </mesh>
      ))}
    </group>
  )
}

function Crates({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <group position={[JETTY_X - 0.7, 0, 13.4]} name="keep-crates" userData={{ count }}>
      {Array.from({ length: Math.min(count, 12) }, (_, i) => (
        <mesh key={i} position={[(i % 3) * 0.5, 0.2 + Math.floor(i / 3) * 0.4, 0]} rotation={[0, (i % 2) * 0.12, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.44, 0.38, 0.4]} />
          <meshStandardMaterial color="#B98A4E" roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

function Crew({ why, flag }: { why: string; flag: boolean }) {
  const [x, , z] = BEDS.far
  return (
    <group name="keep-crew" userData={{ why }}>
      <group position={[x + 1.25, 0, z + 0.5]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh position={[0, 0.45, 0]} castShadow>
          <cylinderGeometry args={[0.24, 0.28, 0.9, 12]} />
          <meshStandardMaterial color="#3A3F5C" roughness={0.8} />
        </mesh>
        <mesh position={[0, 1.05, 0]} castShadow>
          <capsuleGeometry args={[0.24, 0.36, 6, 12]} />
          <meshStandardMaterial color={TEAL} roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.48, 0]} castShadow>
          <sphereGeometry args={[0.18, 14, 10]} />
          <meshStandardMaterial color="#4A3020" roughness={0.6} />
        </mesh>
      </group>
      {flag && (
        <group position={[x - 0.55, 0.3, z - 0.55]} name="keep-flag">
          <mesh position={[0, 0.35, 0]}>
            <cylinderGeometry args={[0.015, 0.015, 0.7, 6]} />
            <meshStandardMaterial color="#6B4A2E" />
          </mesh>
          <mesh position={[0.11, 0.6, 0]}>
            <boxGeometry args={[0.22, 0.14, 0.01]} />
            <meshStandardMaterial color={TEAL} side={2} />
          </mesh>
        </group>
      )}
    </group>
  )
}
