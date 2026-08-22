/**
 * Progression — everything derived from the learning-event log.
 *
 * One computation, three presentations keyed off the band, exactly like
 * `BAND_CAPS`. Explorer sees tickets and badges; Scientist a lab record with
 * skill levels; Analyst ranks that require write-ups, not just points.
 * Nothing here is stored — call `deriveProgress(events)` whenever you need it.
 */

import { useMemo } from 'react'
import type { Band } from './bands'
import { isType, useEvents, type LearningEvent, type SkillId } from './events'

/* ------------------------------------------------------------------ */
/* XP rules                                                           */
/* ------------------------------------------------------------------ */

export const XP = {
  reading: 10,
  prediction: 5,
  predictionClose: 5,
  mission: 25,
  missionAnalyst: 40,
  writeup: 30,
  demo: 5,
} as const

export const SKILLS: Record<SkillId, { label: string; blurb: string; tint: string }> = {
  measuring: { label: 'Measuring', blurb: 'Running trials and recording readings', tint: '#2E6DA8' },
  predicting: { label: 'Predicting', blurb: 'Committing to a value before you measure', tint: '#E8A33D' },
  controlling: { label: 'Controlling variables', blurb: 'Changing one thing at a time', tint: '#3E7C43' },
  interpreting: { label: 'Interpreting data', blurb: 'Reading graphs, spotting patterns and anomalies', tint: '#8E5CB5' },
  explaining: { label: 'Explaining', blurb: 'Writing a claim, evidence and reasoning', tint: '#C13B33' },
}

export const SKILL_IDS = Object.keys(SKILLS) as SkillId[]

/** Skill points needed for each level (cumulative). */
const SKILL_LEVELS = [0, 20, 60, 140, 260]

export interface Progress {
  xp: number
  readings: number
  predictions: number
  closePredictions: number
  missions: number
  writeups: number
  demos: number
  anomalies: number
  skills: Record<SkillId, { points: number; level: number; next: number | null }>
  /** Explorer badges earned (ids). */
  badges: string[]
  /** Analyst rank index into ANALYST_RANKS. */
  rank: number
  /** Explorer tickets = xp; Scientist lab level; Analyst rank — presented by band. */
  cabinetsVisited: string[]
}

export const EXPLORER_BADGES: Array<{ id: string; label: string; test: (p: Progress) => boolean; hint: string }> = [
  { id: 'first-reading', label: 'First reading', test: (p) => p.readings >= 1, hint: 'Record one measurement.' },
  { id: 'predictor', label: 'Fortune teller', test: (p) => p.closePredictions >= 3, hint: 'Get three predictions close.' },
  { id: 'ten-readings', label: 'Ten trials', test: (p) => p.readings >= 10, hint: 'Record ten measurements.' },
  { id: 'mission-3', label: 'Mission trio', test: (p) => p.missions >= 3, hint: 'Complete three missions.' },
  { id: 'demo', label: 'Watched & learned', test: (p) => p.demos >= 1, hint: 'Watch the guided demo.' },
  { id: 'writer', label: 'Wrote it up', test: (p) => p.writeups >= 1, hint: 'Build a conclusion.' },
]

export const ANALYST_RANKS: Array<{ label: string; xp: number; writeups: number; unlocks: string }> = [
  { label: 'Technician', xp: 0, writeups: 0, unlocks: 'Instruments and the results table' },
  { label: 'Researcher', xp: 150, writeups: 1, unlocks: 'CSV export and repeat trials with uncertainty' },
  { label: 'Senior Researcher', xp: 400, writeups: 3, unlocks: 'Model fitting and anomaly flags' },
  { label: 'Principal Investigator', xp: 900, writeups: 6, unlocks: 'Competing-model challenges' },
]

/* ------------------------------------------------------------------ */
/* Derivation                                                         */
/* ------------------------------------------------------------------ */

function emptySkills() {
  const s = {} as Progress['skills']
  for (const id of SKILL_IDS) s[id] = { points: 0, level: 0, next: SKILL_LEVELS[1] }
  return s
}

function levelFor(points: number) {
  let level = 0
  for (let i = 1; i < SKILL_LEVELS.length; i++) if (points >= SKILL_LEVELS[i]) level = i
  const next = level + 1 < SKILL_LEVELS.length ? SKILL_LEVELS[level + 1] : null
  return { level, next }
}

export function deriveProgress(events: LearningEvent[]): Progress {
  const p: Progress = {
    xp: 0,
    readings: 0,
    predictions: 0,
    closePredictions: 0,
    missions: 0,
    writeups: 0,
    demos: 0,
    anomalies: 0,
    skills: emptySkills(),
    badges: [],
    rank: 0,
    cabinetsVisited: [],
  }
  const skillPts: Record<SkillId, number> = {
    measuring: 0,
    predicting: 0,
    controlling: 0,
    interpreting: 0,
    explaining: 0,
  }
  const cabs = new Set<string>()

  for (const e of events) {
    cabs.add(e.cabinet)
    if (isType(e, 'reading.recorded')) {
      p.readings += 1
      p.xp += XP.reading
      skillPts.measuring += 6
      if (e.payload.repeats.length > 1) skillPts.measuring += 4
      if (e.payload.anomalous) {
        p.anomalies += 1
        skillPts.interpreting += 4
      }
      if (e.payload.predicted !== null && e.payload.predictionClose) {
        p.closePredictions += 1
        p.xp += XP.predictionClose
        skillPts.predicting += 6
      }
    } else if (isType(e, 'prediction.committed')) {
      p.predictions += 1
      p.xp += XP.prediction
      skillPts.predicting += 3
    } else if (isType(e, 'mission.completed')) {
      p.missions += 1
      p.xp += e.band === 'analyst' ? XP.missionAnalyst : XP.mission
      skillPts[e.payload.skill] += 15
    } else if (isType(e, 'writeup.completed')) {
      p.writeups += 1
      p.xp += XP.writeup
      skillPts.explaining += 20
      skillPts.interpreting += 8
      if (e.payload.limitations.length) skillPts.interpreting += 4
    } else if (isType(e, 'demo.watched')) {
      p.demos += 1
      if (e.payload.completed) p.xp += XP.demo
    }
  }

  for (const id of SKILL_IDS) {
    const { level, next } = levelFor(skillPts[id])
    p.skills[id] = { points: skillPts[id], level, next }
  }
  p.cabinetsVisited = [...cabs]
  p.badges = EXPLORER_BADGES.filter((b) => b.test(p)).map((b) => b.id)
  let rank = 0
  ANALYST_RANKS.forEach((r, i) => {
    if (p.xp >= r.xp && p.writeups >= r.writeups) rank = i
  })
  p.rank = rank
  return p
}

export function useProgress(profileId?: string): Progress {
  const events = useEvents(profileId)
  return useMemo(() => deriveProgress(events), [events])
}

/* ------------------------------------------------------------------ */
/* Band-skinned presentation                                          */
/* ------------------------------------------------------------------ */

export interface ProgressFace {
  /** Headline the HUD chip shows, e.g. "240 tickets", "Lab level 3", "Researcher". */
  headline: string
  sub: string
  /** 0–1 progress toward the next milestone. */
  ratio: number
  nextLabel: string
}

export function faceFor(band: Band, p: Progress): ProgressFace {
  if (band === 'explorer') {
    const nextBadge = EXPLORER_BADGES.find((b) => !p.badges.includes(b.id))
    return {
      headline: `${p.xp} tickets`,
      sub: `${p.badges.length}/${EXPLORER_BADGES.length} badges`,
      ratio: p.badges.length / EXPLORER_BADGES.length,
      nextLabel: nextBadge ? `Next badge: ${nextBadge.label} — ${nextBadge.hint}` : 'All badges earned!',
    }
  }
  if (band === 'scientist') {
    const total = SKILL_IDS.reduce((a, id) => a + p.skills[id].level, 0)
    const maxTotal = SKILL_IDS.length * (SKILL_LEVELS.length - 1)
    const weakest = SKILL_IDS.map((id) => ({ id, ...p.skills[id] })).sort((a, b) => a.points - b.points)[0]
    return {
      headline: `Lab level ${1 + Math.floor(total / 2)}`,
      sub: `${p.xp} XP · ${p.readings} readings · ${p.writeups} write-ups`,
      ratio: total / maxTotal,
      nextLabel: `Weakest skill: ${SKILLS[weakest.id].label} — ${SKILLS[weakest.id].blurb.toLowerCase()}`,
    }
  }
  const rank = ANALYST_RANKS[p.rank]
  const next = ANALYST_RANKS[p.rank + 1]
  const ratio = next
    ? Math.min(1, Math.min(p.xp / next.xp, next.writeups ? p.writeups / next.writeups : 1))
    : 1
  return {
    headline: rank.label,
    sub: `${p.xp} XP · ${p.writeups} write-ups`,
    ratio,
    nextLabel: next
      ? `${next.label} at ${next.xp} XP and ${next.writeups} write-up${next.writeups === 1 ? '' : 's'} — unlocks ${next.unlocks.toLowerCase()}`
      : 'Top rank reached.',
  }
}

/** Toast wording for a fresh event, per band. Returns null for silent events. */
export function toastFor(band: Band, e: LearningEvent): { title: string; detail: string } | null {
  const unit = band === 'explorer' ? 'tickets' : 'XP'
  if (isType(e, 'reading.recorded')) {
    const close = e.payload.predicted !== null && e.payload.predictionClose
    const gained = XP.reading + (close ? XP.predictionClose : 0)
    return {
      title: band === 'explorer' ? `+${gained} ${unit}!` : `+${gained} ${unit}`,
      detail:
        band === 'analyst'
          ? `Reading logged${close ? ' · prediction within tolerance' : ''}`
          : close
            ? 'Reading recorded — and your prediction was close!'
            : 'Reading recorded',
    }
  }
  if (isType(e, 'mission.completed')) {
    return {
      title: `+${e.band === 'analyst' ? XP.missionAnalyst : XP.mission} ${unit}`,
      detail: band === 'explorer' ? `Mission done: ${e.payload.title}` : `Mission complete · ${SKILLS[e.payload.skill].label}`,
    }
  }
  if (isType(e, 'writeup.completed')) {
    return {
      title: `+${XP.writeup} ${unit}`,
      detail: band === 'analyst' ? 'Conclusion filed' : 'You wrote a conclusion!',
    }
  }
  if (isType(e, 'demo.watched') && e.payload.completed) {
    return { title: `+${XP.demo} ${unit}`, detail: 'Guided demo watched' }
  }
  return null
}
