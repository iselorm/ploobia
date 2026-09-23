/**
 * The crane's hand: take the piece under a low hook, or let go. Lives apart
 * from the Courtyard so the explorer can call it without pulling the whole
 * zone into the first chunk.
 */
import { RigidBodyType } from '@dimforge/rapier3d-compat'
import { CRANE, craneRelease, craneTake, craneTip, getWorld } from '@/lib/archipelago'
import { bodies } from './bodies'

/** The hook takes what is under it — the nearest loose piece within reach. */
export function pieceUnderHook(): string | null {
  const c = getWorld().crane
  const [tx, tz] = craneTip(c.yaw)
  let best: string | null = null
  let bestD = CRANE.grab
  for (const id of ['scrap.a', 'scrap.b', 'scrap.heavy']) {
    const b = bodies.get(id)
    if (!b || getWorld().fed.includes(id)) continue
    const t = b.translation()
    const d = Math.hypot(t.x - tx, t.z - tz)
    // Low enough to reach it: the hook must be within a metre above the piece.
    if (d < bestD && c.hookY - t.y < 1.2 && c.hookY - t.y > -0.2) {
      best = id
      bestD = d
    }
  }
  return best
}

export function craneGrabOrRelease(): void {
  const c = getWorld().crane
  if (c.holding) {
    const b = bodies.get(c.holding)
    if (b) {
      b.setBodyType(RigidBodyType.Dynamic, true)
      b.setLinvel({ x: 0, y: 0, z: 0 }, true)
    }
    craneRelease()
    return
  }
  const id = pieceUnderHook()
  if (!id) return
  const b = bodies.get(id)
  if (!b) return
  b.setBodyType(RigidBodyType.KinematicPositionBased, true)
  craneTake(id)
}

