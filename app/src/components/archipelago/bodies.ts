/**
 * Grabbable rigid bodies by interactable id. The scene registers a body when
 * it mounts; the explorer reaches in to lift it. Rapier owns the motion.
 */
import type { RapierRigidBody } from '@react-three/rapier'

export const bodies = new Map<string, RapierRigidBody>()

export function registerBody(id: string, body: RapierRigidBody): () => void {
  bodies.set(id, body)
  return () => {
    bodies.delete(id)
  }
}
