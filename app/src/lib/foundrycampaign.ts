/**
 * The Foundry's doors — which have been walked through.
 *
 * Same shape as the Sugar Line's `lib/campaign`: one hand-in at any level of a
 * door opens the next; unbuilt doors are on the map, named and dashed, never
 * "coming soon"; progress is a small local record keyed by level id and is not
 * XP. Kept separate from the Sugar Line's module because that one is bound to
 * its own presets and storage key; when a third cabinet needs this, the two
 * fold into one generic campaign store.
 */

import { useCallback, useSyncExternalStore } from 'react'
import { read, write } from './persist'
import { DOORS, LEVEL_BY_ID, type Door, type DoorId } from './foundry'

const KEY = 'ploobia.campaign.atoms.v1'

export interface FoundryProgress {
  /** Best score handed in, by level id. Presence is what opens doors. */
  handedIn: Record<string, number>
}

let current: FoundryProgress = read<FoundryProgress>(KEY, { handedIn: {} })
const listeners = new Set<() => void>()

export function getFoundryProgress(): FoundryProgress {
  return current
}

function doorOfLevel(levelId: string): DoorId | undefined {
  return LEVEL_BY_ID[levelId]?.door
}

export function isDoorHandedIn(door: number): boolean {
  return Object.keys(current.handedIn).some((id) => doorOfLevel(id) === door)
}

/** Door 1 is always open; every other door opens on a hand-in at the one before. */
export function isDoorOpen(door: number): boolean {
  if (door <= 1) return true
  if (door > DOORS.length) return false
  return isDoorHandedIn(door - 1)
}

/** Record a hand-in. Returns whether it opened a door that was shut before. */
export function recordHandIn(levelId: string, score: number): boolean {
  const door = doorOfLevel(levelId)
  const before = door ? isDoorOpen(door + 1) : false
  const best = Math.max(current.handedIn[levelId] ?? 0, score)
  current = { handedIn: { ...current.handedIn, [levelId]: best } }
  write(KEY, current)
  listeners.forEach((l) => l())
  return !!door && !before && isDoorOpen(door + 1)
}

export function resetFoundry(): void {
  current = { handedIn: {} }
  write(KEY, current)
  listeners.forEach((l) => l())
}

export type DoorState = 'done' | 'open' | 'shut' | 'undiscovered'

export function doorState(door: Door): DoorState {
  if (!door.built) return 'undiscovered'
  if (isDoorHandedIn(door.id)) return 'done'
  if (isDoorOpen(door.id)) return 'open'
  return 'shut'
}

/** The door Play should open: the first built door that is open and not handed in, else the last done one. */
export function nextDoor(): Door {
  const built = DOORS.filter((d) => d.built)
  return built.find((d) => doorState(d) === 'open') ?? [...built].reverse().find((d) => doorState(d) === 'done') ?? built[0]
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useFoundryCampaign(): [FoundryProgress, () => void] {
  const progress = useSyncExternalStore(subscribe, getFoundryProgress, getFoundryProgress)
  const reset = useCallback(() => resetFoundry(), [])
  return [progress, reset]
}
