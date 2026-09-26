/**
 * S1 — the handoff's screen logic that is not a component (the HUD's KeepHud
 * reads these): who owns a conversation, Ploob's hint, the review's clock.
 */
import { keepAvailable, keepStageOf, type WorldState } from './archipelago'
import { nextKind, type KeepReport } from './keep'

/** Does the keep own this conversation (instead of the plain talk card)? */
export function keepOwnsTalk(s: WorldState): boolean {
  if (!keepAvailable(s)) return false
  const st = keepStageOf(s)
  if (s.talk === 'talk.nara') return st === null || st === 'ask' || st === 'read'
  if (s.talk === 'talk.sela') return st === 'ready'
  return false
}

/** Ploob's hint while the handoff is the Landing's business; null leaves the quest's own. */
export function keepHint(s: WorldState): string | null {
  if (s.zone !== 'landing' || !keepAvailable(s)) return null
  const st = keepStageOf(s)
  if (st === null || st === 'ask') return 'Nara has a question for you, by her bed.'
  if (st === 'read') return 'Tell Nara what to do next time — or try another fortnight.'
  if (st === 'ready') return s.keep && nextKind(s.keep) === 'practice' ? "Sela's board at the jetty: begin a practice fortnight when you are ready." : 'Sela is at the jetty. Tell her when you are going.'
  if (st === 'away') return 'Through the gate: the Foundry is cold. The fortnight runs here while you are away.'
  return null
}

/** The talk id a report or pause card holds the explorer with (the talk card's own hold). */
export const KEEP_CARD = 'keep.card'

/** The review's clock: half a second a day, held on the rain and on the first decisive mark (§05, D10). */
export function reviewTimeline(r: KeepReport): { day: number; ms: number }[] {
  const decisive = firstDecisive(r)
  const rainDay = r.weatherNight > 0 ? r.weatherNight + 1 : 0
  return r.beds.far.marks.map((m) => ({ day: m.day, ms: 500 + (m.day === decisive ? 2200 : 0) + (m.day === rainDay && m.day !== decisive ? 1200 : 0) }))
}

export function firstDecisive(r: KeepReport): number {
  const far = r.beds.far
  const ev = far.marks.find((m) => m.event === 'soaked-refusal' || m.event === 'pause' || m.event === 'crew-called' || m.event === 'crew-takeover')
  if (ev) return ev.event === 'crew-takeover' && far.stop?.by === 'noon-stop' ? ev.day - 1 : ev.day
  return r.weatherNight > 0 ? r.weatherNight + 1 : far.lowDay || 1
}

