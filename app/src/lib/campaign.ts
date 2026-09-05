/**
 * The campaign map — five doors, one plant.
 *
 * The Sugar Line's game layer is five stages in the order the sugar takes:
 * made in the leaf, rationed by the hatches, pushed down the line, banked in
 * the roots, multiplied across a plot. This module is the map of them and
 * the one rule that walks a learner along it.
 *
 * **The gate is light, and it is the only gate.** One hand-in at any level of
 * a stage opens the next. Not "finish every level" — a Scientist who wants
 * the stem must not grind the leaf's Explorer levels first — and not "all
 * open" either, because the roots make no sense to someone who has never
 * seen what the sugar is for. Five minutes of the loop, once, is the price
 * of the next door.
 *
 * Doors that are not built yet are on the map, named, and shut. Never
 * "coming soon": in Ploobia a shut door is a place nobody has discovered
 * yet, which is a truer thing to tell a ten-year-old than a release date.
 *
 * Progress is a small record in local storage, keyed by preset id. Nothing
 * here is XP — that still comes only from recorded evidence (`lib/events`).
 * This is just which doors have been walked through.
 */

import { useCallback, useSyncExternalStore } from 'react'
import { read, write } from './persist'
import { stageOfPresetId } from './sugarchallenge'

export type CampaignStageId = 1 | 2 | 3 | 4 | 5

export interface CampaignStage {
  id: CampaignStageId
  name: string
  /** What it is, in four words or so. */
  where: string
  /** The question the stage asks. */
  question: string
  /** Whether the cabinet has this stage yet. */
  built: boolean
  /** The cabinet's stage tab this door opens onto, when built. */
  tab?: 'plant' | 'leaf' | 'hatches' | 'stem'
}

export const CAMPAIGN: CampaignStage[] = [
  {
    id: 1,
    name: 'The Factory',
    where: 'the leaf',
    question: 'Air, water and light go in. What comes out, and how much?',
    built: true,
    tab: 'plant',
  },
  {
    id: 2,
    name: 'The Hatches',
    where: 'the stomata',
    question: 'Open, and the carbon comes in but the water goes out. How open, and when?',
    built: true,
    tab: 'hatches',
  },
  {
    id: 3,
    name: 'The Line',
    where: 'xylem & phloem',
    question: 'Two pipes, opposite directions. Which carries what, and what pushes it?',
    built: false,
    tab: 'stem',
  },
  {
    id: 4,
    name: 'The Roots',
    where: 'soil & store',
    question: 'Roots drink, anchor and bank. What happens when the soil is too dry — and too wet?',
    built: false,
  },
  {
    id: 5,
    name: 'The Stand',
    where: 'field → forest',
    question: 'One plant makes sugar. What does a field do to the air — and what does clearing it do?',
    built: false,
  },
]

export const CAMPAIGN_BY_ID: Record<number, CampaignStage> = Object.fromEntries(
  CAMPAIGN.map((s) => [s.id, s]),
)

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

const KEY = 'ploobia.campaign.photosynthesis.v1'

export interface CampaignProgress {
  /** Best score handed in, by preset id. Presence is what opens doors. */
  handedIn: Record<string, number>
}

let current: CampaignProgress = read<CampaignProgress>(KEY, { handedIn: {} })
const listeners = new Set<() => void>()

export function getCampaignProgress(): CampaignProgress {
  return current
}

/** Record a hand-in. Returns whether it opened a door that was shut before. */
export function recordHandIn(presetId: string, stage: CampaignStageId | undefined, score: number): boolean {
  const before = stage ? isStageOpen(stage + 1) : false
  const best = Math.max(current.handedIn[presetId] ?? 0, score)
  current = { handedIn: { ...current.handedIn, [presetId]: best } }
  write(KEY, current)
  listeners.forEach((l) => l())
  return !!stage && !before && isStageOpen(stage + 1)
}

/** For the suite and the pilot: forget the walk. */
export function resetCampaign(): void {
  current = { handedIn: {} }
  write(KEY, current)
  listeners.forEach((l) => l())
}

export function isStageHandedIn(stage: number): boolean {
  return Object.keys(current.handedIn).some((id) => stageOfPresetId(id) === stage)
}

/** Stage 1 is always open; every other door opens on a hand-in at the one before. */
export function isStageOpen(stage: number): boolean {
  if (stage <= 1) return true
  if (stage > 5) return false
  return isStageHandedIn(stage - 1)
}

export type DoorState = 'done' | 'open' | 'shut' | 'undiscovered'

/** What the map draws for a door. */
export function doorState(stage: CampaignStage): DoorState {
  if (!stage.built) return 'undiscovered'
  if (isStageHandedIn(stage.id)) return 'done'
  if (isStageOpen(stage.id)) return 'open'
  return 'shut'
}

/** The door Play should open: the first built stage that is open and not yet handed in, else the last open one. */
export function nextDoor(): CampaignStage {
  const built = CAMPAIGN.filter((s) => s.built)
  return (
    built.find((s) => doorState(s) === 'open') ??
    [...built].reverse().find((s) => doorState(s) === 'done') ??
    built[0]
  )
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The live progress, re-rendering on any hand-in. */
export function useCampaign(): [CampaignProgress, () => void] {
  const progress = useSyncExternalStore(subscribe, getCampaignProgress, getCampaignProgress)
  const reset = useCallback(() => resetCampaign(), [])
  return [progress, reset]
}
