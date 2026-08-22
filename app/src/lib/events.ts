/**
 * Learning events — the platform's single source of truth for progress.
 *
 * Every cabinet appends events; everything else (XP, skill tracks, ranks,
 * missions display, the parent digest, the hall's impact line) is *derived*
 * from this log and never stored separately. Only the measurement loop emits,
 * so nothing can be earned for clicks, logins or time on page — by
 * construction rather than by policy.
 *
 * Persistence: an adapter that uses browser storage where it exists (real
 * devices) and silently falls back to memory where it does not (the preview
 * sandbox). Later a backend replaces the adapter; the schema does not change.
 */

import { useSyncExternalStore } from 'react'
import type { Band } from './bands'

/* ------------------------------------------------------------------ */
/* Schema                                                             */
/* ------------------------------------------------------------------ */

export type CabinetId = 'photosynthesis' | 'blood' | 'motion' | (string & {})

export type SkillId = 'measuring' | 'predicting' | 'controlling' | 'interpreting' | 'explaining'

export type EventPayloads = {
  'session.started': Record<string, never>
  'demo.watched': { completed: boolean }
  'prediction.committed': { variable: string; x: number; predicted: number; kind: 'point' | 'direction' }
  'reading.recorded': {
    variable: string
    x: number
    y: number
    repeats: number[]
    uncertainty: number
    controls: Record<string, number>
    predicted: number | null
    /** |predicted − y| within tolerance — set by the cabinet, which knows its scale. */
    predictionClose: boolean | null
    anomalous: boolean
  }
  'mission.completed': { missionId: string; title: string; skill: SkillId }
  'writeup.completed': {
    variable: string
    claim: string
    reason: string
    limitations: string[]
    ownWords: boolean
  }
}

export type EventType = keyof EventPayloads

export interface LearningEvent<T extends EventType = EventType> {
  id: string
  /** Epoch ms. */
  at: number
  profileId: string
  cabinet: CabinetId
  band: Band
  type: T
  payload: EventPayloads[T]
}

/* ------------------------------------------------------------------ */
/* Persistence adapter                                                */
/* ------------------------------------------------------------------ */

const KEY = 'ploobia.events.v1'

interface Adapter {
  load(): LearningEvent[]
  save(events: LearningEvent[]): void
}

function makeAdapter(): Adapter {
  let memory: LearningEvent[] = []
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const probe = '__sa_probe__'
      window.localStorage.setItem(probe, '1')
      window.localStorage.removeItem(probe)
      return {
        load() {
          try {
            const raw = window.localStorage.getItem(KEY)
            return raw ? (JSON.parse(raw) as LearningEvent[]) : []
          } catch {
            return []
          }
        },
        save(events) {
          try {
            window.localStorage.setItem(KEY, JSON.stringify(events))
          } catch {
            /* quota or private mode: keep going in memory */
          }
        },
      }
    }
  } catch {
    /* storage blocked */
  }
  return {
    load: () => memory,
    save: (e) => {
      memory = e
    },
  }
}

const adapter = makeAdapter()

/* ------------------------------------------------------------------ */
/* Store                                                              */
/* ------------------------------------------------------------------ */

let events: LearningEvent[] = adapter.load()
let currentProfile = 'local-learner'
const listeners = new Set<() => void>()
const eventListeners = new Set<(e: LearningEvent) => void>()

function notify() {
  listeners.forEach((l) => l())
}

let seq = events.length
function nextId() {
  seq += 1
  return `${Date.now().toString(36)}-${seq.toString(36)}`
}

/** The learner profile new events are attributed to. */
export function setActiveProfile(id: string): void {
  if (id === currentProfile) return
  currentProfile = id
  notify()
}

export function getActiveProfile(): string {
  return currentProfile
}

/** Append an event. Returns it. */
export function logEvent<T extends EventType>(
  cabinet: CabinetId,
  band: Band,
  type: T,
  payload: EventPayloads[T],
): LearningEvent<T> {
  const e: LearningEvent<T> = {
    id: nextId(),
    at: Date.now(),
    profileId: currentProfile,
    cabinet,
    band,
    type,
    payload,
  }
  events = [...events, e as LearningEvent]
  adapter.save(events)
  eventListeners.forEach((l) => l(e as LearningEvent))
  notify()
  return e
}

/** Every event ever logged (all profiles). */
export function getAllEvents(): LearningEvent[] {
  return events
}

/** Events for one profile (defaults to the active one). */
export function getEvents(profileId: string = currentProfile): LearningEvent[] {
  return events.filter((e) => e.profileId === profileId)
}

/** Wipe a profile's history (used by the parent home's "start fresh"). */
export function clearEvents(profileId: string): void {
  events = events.filter((e) => e.profileId !== profileId)
  adapter.save(events)
  notify()
}

/** Fire-and-forget subscription to new events (toasts, sounds). */
export function onEvent(fn: (e: LearningEvent) => void): () => void {
  eventListeners.add(fn)
  return () => {
    eventListeners.delete(fn)
  }
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** Re-renders whenever the log changes. */
export function useEvents(profileId?: string): LearningEvent[] {
  const all = useSyncExternalStore(subscribe, getAllEvents, getAllEvents)
  const pid = profileId ?? currentProfile
  return all.filter((e) => e.profileId === pid)
}

export function useAllEvents(): LearningEvent[] {
  return useSyncExternalStore(subscribe, getAllEvents, getAllEvents)
}

export function useActiveProfile(): string {
  return useSyncExternalStore(subscribe, getActiveProfile, getActiveProfile)
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

export function isType<T extends EventType>(e: LearningEvent, t: T): e is LearningEvent<T> {
  return e.type === t
}

const DAY = 86_400_000

/** Events since `days` days ago. */
export function since(list: LearningEvent[], days: number, now = Date.now()): LearningEvent[] {
  const cutoff = now - days * DAY
  return list.filter((e) => e.at >= cutoff)
}

/**
 * An "investigation" is a stretch of activity in one cabinet with gaps under
 * 30 minutes — what a parent would recognise as one sitting.
 */
export function countInvestigations(list: LearningEvent[]): number {
  const sorted = [...list].sort((a, b) => a.at - b.at)
  let n = 0
  let lastAt = -Infinity
  let lastCab = ''
  for (const e of sorted) {
    if (e.type === 'session.started' && e.cabinet === lastCab && e.at - lastAt < 30 * 60_000) {
      lastAt = e.at
      continue
    }
    if (e.cabinet !== lastCab || e.at - lastAt > 30 * 60_000) n += 1
    lastAt = e.at
    lastCab = e.cabinet
  }
  return n
}
