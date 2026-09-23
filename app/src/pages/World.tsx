import { useEffect, useState } from 'react'
import { useLayoutTier, usePortraitPhone } from '@/hooks/use-layout'
import { getWorld, resetWorld, returnFromCabinet } from '@/lib/archipelago'
import { loadSave, restoreWorld, watchWorld } from '@/lib/worldsave'
import { installWorldAudio } from '@/lib/worldaudio'
import SceneErrorBoundary from '@/components/SceneErrorBoundary'
import TurnCard from '@/components/game/TurnCard'
import ArchipelagoScene from '@/components/archipelago/ArchipelagoScene'
import WorldHud from '@/components/archipelago/hud/WorldHud'
import { installWorldKeys, live } from '@/components/archipelago/live'

/**
 * `#/world` — the Ploobia Archipelago, round W0 (previz).
 *
 * Composition only: the scene, the HUD, the keys, the portrait card. Behind
 * `VITE_WORLD=1` so the classroom single-file arcade never carries Rapier.
 */
export default function World() {
  const tier = useLayoutTier()
  const portrait = usePortraitPhone()
  const [lost, setLost] = useState(false)
  // Back through a door from a cabinet: the world resumes where it stood.
  // Otherwise a save, if there is one, is restored behind the welcome card
  // (Continue / Start over); any other arrival is a fresh start. Decided at
  // render time, before any child mounts: children's effects run before this
  // page's own, and the HUD's door effect would see `cabinet` still set and
  // bounce straight back.
  useState(() => {
    if (getWorld().cabinet) {
      const at = returnFromCabinet()
      if (at) live.requestPos = at
      return null
    }
    const save = loadSave()
    if (save) {
      const spot = restoreWorld(save)
      if (spot) {
        live.requestPos = spot.pos
        live.facing = spot.facing
        live.camYaw = spot.cam[0]
        live.camPitch = spot.cam[1]
      }
    } else {
      resetWorld()
    }
    return null
  })
  useEffect(() => installWorldKeys(), [])
  useEffect(() => watchWorld(() => ({ pos: [live.pos.x, live.pos.y, live.pos.z], facing: live.facing, cam: [live.camYaw, live.camPitch] })), [])
  useEffect(() => installWorldAudio(() => ({ speed: live.speed, grounded: live.grounded })), [])
  if (portrait) return <TurnCard line="The Archipelago is explored the wide way round." />
  const compact = tier === 'phone'
  return (
    <div className="fixed inset-0 bg-[#F6F2E8]" data-cabinet="world">
      <SceneErrorBoundary key={lost ? 'lost' : 'ok'}>
        <ArchipelagoScene hudBottom={compact ? 72 : 0} onContextLost={() => setLost(true)} />
      </SceneErrorBoundary>
      <WorldHud compact={compact} />
    </div>
  )
}
