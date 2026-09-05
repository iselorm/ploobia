/**
 * Challenges — the platform's competitive spine.
 *
 * A challenge is a *goal stated in a cabinet's own units*, on a world both
 * players can reproduce exactly: "get sugar export above 18 mg per hour, with
 * this much light and this much carbon, on this plant." You play it, you get a
 * score, you send the link, your friend plays the identical world.
 *
 * Three rules shaped this module, and they are worth stating because each one
 * closed off an easier design:
 *
 * 1. **A room is many people on one seed.** There is no separate multiplayer
 *    model. Two friends comparing a link and a classroom of thirty on a big
 *    screen are the same data structure — one `Challenge`, many
 *    `ChallengeAttempt`s, ranked by the same pure function. That is why
 *    `rank()` exists here and not in some future server.
 *
 * 2. **The world comes from a seed, never from a server.** Everything that
 *    varies is derived from one integer, so a challenge is fully described by
 *    a short string that fits in a URL fragment. No backend, no accounts, no
 *    data stored about a child, and it works on a bad connection or none —
 *    which is the difference between shipping in Accra and shipping in theory.
 *
 * 3. **Score is not XP.** `lib/events.ts` guarantees that nothing is earned
 *    for clicks "by construction rather than by policy", and a fast reflex is
 *    a click. So a challenge awards a *score* and a journal card; XP still
 *    comes only from recorded evidence, which a challenge happens to produce
 *    because hitting a target requires running real trials.
 *
 * Pure module — no React, no three, no browser, no cabinet knowledge. It does
 * not know what "export" means; only that it is a number a cabinet reports.
 * Checked out of band by `verify-challenge.mjs`.
 */

import type { Band } from './bands'

export const CHALLENGE_VERSION = 1

/* ------------------------------------------------------------------ */
/* Deterministic randomness                                            */
/* ------------------------------------------------------------------ */

/**
 * mulberry32 — small, fast, and good enough for placing motes and gusts.
 *
 * `Math.random()` cannot be used anywhere a challenge world is built: two
 * people opening the same link must get the same world, or the score means
 * nothing. Any cabinet building a challenge world takes its randomness from
 * here and from nowhere else.
 */
export function rngFor(seed: number): () => number {
  let a = (seed >>> 0) || 1
  return function next() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A seed from a human-typed room code, so "MANGO" always means one world. */
export function seedFromCode(code: string): number {
  let h = 0x811c9dc5
  for (const ch of code.trim().toUpperCase()) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Five letters, no vowels-only collisions with rude words by construction. */
const CODE_ALPHABET = 'BCDFGHJKMNPQRSTVWXYZ23456789'

/** A room code a teacher can read out loud. Ambiguous glyphs are excluded. */
export function roomCode(seed: number): string {
  const next = rngFor(seed)
  let out = ''
  for (let i = 0; i < 5; i++) out += CODE_ALPHABET[Math.floor(next() * CODE_ALPHABET.length)]
  return out
}

/* ------------------------------------------------------------------ */
/* The challenge                                                       */
/* ------------------------------------------------------------------ */

/**
 * How the target is met.
 *
 * `near` is the interesting one and the reason `atLeast` alone was not enough:
 * "get it as high as possible" rewards shoving every dial to maximum, which
 * teaches nothing. "Land on 12.0" forces the learner to reason about which
 * variable moves the number and by how much — the model, not the extremes.
 */
export type GoalDirection = 'atLeast' | 'atMost' | 'near'

export interface ChallengeGoal {
  /** A metric id the cabinet understands. The spine never interprets it. */
  metric: string
  direction: GoalDirection
  target: number
  /** Half-width of the acceptable band, for `near`. */
  tolerance: number
  /** For display: "mg h⁻¹". */
  unit: string
}

/**
 * What the gather round supplies and the lab may then spend.
 *
 * Deliberately generic (`Record<string, number>`) rather than a fixed
 * light/CO₂/water triple: the Motion Yard will bank launches and the Atom
 * Foundry will bank protons, and a spine that knew about photosynthesis would
 * have to be rewritten for the second cabinet that used it.
 */
export type ResourceBudget = Record<string, number>

export interface Challenge {
  v: number
  cabinet: string
  /** Every varying thing in the world derives from this. */
  seed: number
  /** Which specimen / setup, chosen by the challenge author. */
  setup: string
  band: Band
  goal: ChallengeGoal
  budget: ResourceBudget
  /** Seconds of gathering before the lab opens. 0 = no gather round. */
  gatherSeconds: number
  /** A label for the author. A nickname, never a real name. */
  by?: string
}

/** A short stable id, so an attempt can be matched to the challenge it answers. */
export function challengeId(c: Challenge): string {
  const canonical = [
    c.v,
    c.cabinet,
    c.seed,
    c.setup,
    c.band,
    c.goal.metric,
    c.goal.direction,
    c.goal.target,
    c.goal.tolerance,
    c.gatherSeconds,
    ...Object.keys(c.budget).sort().map((k) => `${k}:${c.budget[k]}`),
  ].join('|')
  let h = 0x811c9dc5
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/* ------------------------------------------------------------------ */
/* Attempts and scoring                                                */
/* ------------------------------------------------------------------ */

export interface ChallengeAttempt {
  challengeId: string
  /** The best value the learner actually reached. */
  best: number
  hit: boolean
  /** Recorded trials it took. Fewer is better — it means they reasoned. */
  trials: number
  /** What they spent of the budget. */
  spent: ResourceBudget
  /** What the gather round actually banked. */
  gathered: ResourceBudget
  /** Wall seconds, for a tiebreak only. Never a scoring term of its own. */
  seconds: number
}

export interface ChallengeScore {
  /** 0–1000. */
  total: number
  /** The parts, so the HUD can show WHY — a bare number teaches nothing. */
  accuracy: number
  economy: number
  thrift: number
  stars: 0 | 1 | 2 | 3
  hit: boolean
}

/** Trials at which the economy term reaches zero. */
const TRIAL_FLOOR = 6

/**
 * How close is close, as a fraction of the target.
 *
 * For `near` the tolerance is given. For the open-ended directions there is no
 * natural band, so closeness is measured against the target itself.
 */
function accuracyOf(goal: ChallengeGoal, best: number): number {
  const span = Math.max(Math.abs(goal.target), 1e-9)
  if (goal.direction === 'near') {
    const tol = Math.max(goal.tolerance, 1e-9)
    const miss = Math.abs(best - goal.target)
    if (miss <= tol) return 1
    // Falls off over three tolerances, then nothing.
    return clamp01(1 - (miss - tol) / (tol * 3))
  }
  if (goal.direction === 'atLeast') {
    if (best >= goal.target) return 1
    return clamp01(best / span)
  }
  if (best <= goal.target) return 1
  return clamp01(1 - (best - goal.target) / span)
}

export function meetsGoal(goal: ChallengeGoal, best: number): boolean {
  // The epsilon is not defensive coding, it is a correctness fix. A target of
  // 12 with a tolerance of 0.3 rejects 12.3, because `12.3 - 12` is
  // 0.30000000000000027 in binary floating point. A learner who lands exactly
  // on the edge of the band the cabinet drew for them must be told they hit
  // it — being failed by the last bit of a double is indefensible.
  const slack = Math.abs(goal.target) * 1e-12 + 1e-12
  if (goal.direction === 'near') return Math.abs(best - goal.target) <= goal.tolerance + slack
  if (goal.direction === 'atLeast') return best >= goal.target - slack
  return best <= goal.target + slack
}

/**
 * Score an attempt.
 *
 * The weighting is the argument of the whole feature, so it is worth being
 * explicit about it: **accuracy is most of the score, and the rest rewards
 * doing it with less.** Nothing rewards speed, because a cabinet that pays for
 * fast fingers is a cabinet that stops paying for thinking — and the sixteen
 * year olds are the first to notice.
 *
 * - accuracy (up to 600) — did you hit it, or how near did you get
 * - economy  (up to 250) — how few trials it took, because guessing costs runs
 * - thrift   (up to 150) — how little of the banked budget you burned
 *
 * A miss still scores. "Way out" is framed everywhere in this codebase as the
 * useful kind of wrong, and zeroing it would contradict that in the one place
 * a learner is most likely to be watching.
 */
export function scoreAttempt(challenge: Challenge, attempt: ChallengeAttempt): ChallengeScore {
  const hit = meetsGoal(challenge.goal, attempt.best)
  const accuracy = accuracyOf(challenge.goal, attempt.best)

  const trials = Math.max(1, Math.round(attempt.trials))
  const economy = clamp01((TRIAL_FLOOR - trials) / (TRIAL_FLOOR - 1))

  // Thrift is measured only against what the budget actually offered; a
  // resource the challenge did not grant cannot be wasted.
  const keys = Object.keys(challenge.budget)
  const thrift = keys.length
    ? clamp01(
        keys.reduce((sum, k) => {
          const cap = challenge.budget[k]
          if (!cap) return sum + 1
          return sum + clamp01(1 - (attempt.spent[k] ?? 0) / cap)
        }, 0) / keys.length,
      )
    : 1

  const total = Math.round(accuracy * 600 + (hit ? economy * 250 + thrift * 150 : 0))
  return {
    total,
    accuracy: round3(accuracy),
    economy: round3(economy),
    thrift: round3(thrift),
    stars: hit ? (total >= 900 ? 3 : total >= 750 ? 2 : 1) : 0,
    hit,
  }
}

/* ------------------------------------------------------------------ */
/* Rooms — which is to say, several attempts at one challenge          */
/* ------------------------------------------------------------------ */

export interface RoomEntry {
  /** A nickname. Learner profiles carry no real names by design. */
  player: string
  attempt: ChallengeAttempt
}

export interface RankedEntry extends RoomEntry {
  score: ChallengeScore
  place: number
}

/**
 * Rank a set of attempts at one challenge.
 *
 * Used identically for two friends comparing a link and for a classroom on a
 * shared screen — that is the whole reason there is no separate multiplayer
 * model to build later. Ties break on fewer trials, then on time, so the
 * learner who reasoned it out in two runs beats the one who brute-forced it in
 * five with the same result.
 */
export function rank(entries: RoomEntry[], challenge: Challenge): RankedEntry[] {
  return entries
    .map((e) => ({ ...e, score: scoreAttempt(challenge, e.attempt), place: 0 }))
    .sort(
      (a, b) =>
        b.score.total - a.score.total ||
        a.attempt.trials - b.attempt.trials ||
        a.attempt.seconds - b.attempt.seconds ||
        a.player.localeCompare(b.player),
    )
    .map((e, i) => ({ ...e, place: i + 1 }))
}

/* ------------------------------------------------------------------ */
/* The link                                                            */
/* ------------------------------------------------------------------ */

/**
 * A challenge as a URL-safe string.
 *
 * Positional rather than JSON, because the string ends up in a link a child
 * pastes into a chat app: 60-odd characters survives that, 200 characters of
 * base64'd JSON gets truncated by something along the way. The leading version
 * is what makes it safe to change this layout later.
 */
export function encodeChallenge(c: Challenge): string {
  const budget = Object.keys(c.budget)
    .sort()
    .map((k) => `${k}~${round3(c.budget[k])}`)
    .join('!')
  const parts = [
    c.v,
    c.cabinet,
    c.seed.toString(36),
    c.setup,
    c.band,
    c.goal.metric,
    c.goal.direction,
    c.goal.target,
    c.goal.tolerance,
    c.goal.unit,
    c.gatherSeconds,
    budget,
    c.by ?? '',
  ]
  // NOT '.', which is one of the characters `encodeURIComponent` leaves
  // alone — so a tolerance of 0.5 became two fields and every value after it
  // was read out of the wrong slot. A comma IS escaped (%2C), so splitting on
  // it can never be ambiguous.
  return parts.map((p) => encodeURIComponent(String(p))).join(',')
}

export function decodeChallenge(text: string): Challenge | null {
  try {
    const p = text.split(',').map(decodeURIComponent)
    if (p.length < 12) return null
    const v = Number(p[0])
    // An older or newer link is refused rather than half-read: a challenge
    // that silently decodes into a different world is worse than one that
    // says it cannot be opened.
    if (v !== CHALLENGE_VERSION) return null

    const budget: ResourceBudget = {}
    if (p[11]) {
      for (const pair of p[11].split('!')) {
        const [k, val] = pair.split('~')
        if (k) budget[k] = Number(val)
      }
    }
    const goal: ChallengeGoal = {
      metric: p[5],
      direction: p[6] as GoalDirection,
      target: Number(p[7]),
      tolerance: Number(p[8]),
      unit: p[9],
    }
    if (!['atLeast', 'atMost', 'near'].includes(goal.direction)) return null
    if (!Number.isFinite(goal.target) || !Number.isFinite(goal.tolerance)) return null

    const seed = parseInt(p[2], 36)
    if (!Number.isFinite(seed)) return null

    return {
      v,
      cabinet: p[1],
      seed,
      setup: p[3],
      band: p[4] as Band,
      goal,
      gatherSeconds: Number(p[10]),
      budget,
      by: p[12] || undefined,
    }
  } catch {
    return null
  }
}

/** The whole link, ready to paste. */
export function challengeLink(origin: string, route: string, c: Challenge): string {
  return `${origin}/app/#${route}?c=${encodeChallenge(c)}`
}

/* ------------------------------------------------------------------ */

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
