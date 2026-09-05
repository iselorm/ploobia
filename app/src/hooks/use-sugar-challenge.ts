import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  challengeId,
  meetsGoal,
  scoreAttempt,
  type Challenge,
  type ChallengeAttempt,
  type ChallengeScore,
  type ResourceBudget,
} from '@/lib/challenge'
import { drawDown, spentSoFar, type SugarResource } from '@/lib/sugarchallenge'

/**
 * The state machine behind a Sugar Line challenge run.
 *
 * It lives in a hook rather than in the page for one reason: the page is
 * already a thousand lines of *lab*, and the challenge must remain something
 * bolted onto the side of it that can be removed without disturbing anything.
 * The lab never asks whether a challenge is running; the page asks, and passes
 * caps down. That is what keeps "a mode you choose" true in the code and not
 * just in the copy.
 *
 * ```
 *   off  →  brief  →  gather  →  lab  →  scored
 *            ↑                            │
 *            └────────── play again ──────┘
 * ```
 */
export type ChallengePhase = 'off' | 'brief' | 'gather' | 'lab' | 'scored'

/** How often the gather clock ticks. Fine enough to look live, coarse enough to be cheap. */
const TICK_MS = 100

export interface SugarChallengeRun {
  phase: ChallengePhase
  challenge: Challenge | null
  /** What the gather round has banked so far, and what the lab has left. */
  bank: ResourceBudget
  /** What the gather round finished with — the denominator for "spent". */
  granted: ResourceBudget
  spent: ResourceBudget
  trials: number
  /** The best value of the goal metric reached so far, or null. */
  best: number | null
  hit: boolean
  secondsLeft: number
  score: ChallengeScore | null
  /** A score sent by whoever shared the link, to beat. */
  rival: number | null

  open: (rival?: number | null) => void
  close: () => void
  begin: (c: Challenge) => void
  /** Fired by the gather round on every interception. */
  catchOne: (kind: SugarResource, amount: number) => void
  /** Cut the gathering short — a learner who has what they need should not wait. */
  endGather: () => void
  /** Draw a trial's cost out of the bank and count it. */
  spend: (cost: ResourceBudget) => void
  /**
   * Draw resources without counting a trial — watering the pot, and anything
   * else that consumes the bank but produces no reading. Kept separate because
   * `trials` is a scoring term, and a learner who watered four times has not
   * run four experiments.
   */
  draw: (cost: ResourceBudget) => void
  /** Offer a value of the goal metric; kept only if it is better. */
  offer: (value: number) => void
  finish: () => void
  attempt: () => ChallengeAttempt | null
}

export function useSugarChallenge(): SugarChallengeRun {
  const [phase, setPhase] = useState<ChallengePhase>('off')
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [bank, setBank] = useState<ResourceBudget>({})
  const [granted, setGranted] = useState<ResourceBudget>({})
  const [trials, setTrials] = useState(0)
  const [best, setBest] = useState<number | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [score, setScore] = useState<ChallengeScore | null>(null)
  const [rival, setRival] = useState<number | null>(null)

  const labStartedAt = useRef(0)
  /**
   * The bank, mirrored where the render loop can read it.
   *
   * The catch handler is called many times a second from inside a frame, and
   * it needs to know the current bank to enforce the ceiling. Reading it out of
   * state there would read whatever the last committed render saw, which during
   * a burst of catches is behind. Every writer below updates this alongside the
   * state, and nothing writes one without the other.
   */
  const bankRef = useRef<ResourceBudget>({})

  /* ---- the gather clock ---- */
  useEffect(() => {
    if (phase !== 'gather') return
    const t = window.setInterval(() => {
      setSecondsLeft((s) => {
        const next = Math.max(0, s - TICK_MS / 1000)
        return next
      })
    }, TICK_MS)
    return () => window.clearInterval(t)
  }, [phase])

  // Ending the round is a separate effect from counting it down, so that the
  // transition happens exactly once however many ticks land on zero.
  useEffect(() => {
    if (phase !== 'gather' || secondsLeft > 0) return
    setGranted({ ...bankRef.current })
    labStartedAt.current = performance.now()
    setPhase('lab')
  }, [phase, secondsLeft])

  const open = useCallback((r: number | null = null) => {
    setRival(r ?? null)
    setPhase('brief')
  }, [])

  const close = useCallback(() => {
    setPhase('off')
    setChallenge(null)
    setScore(null)
    setBest(null)
    setTrials(0)
    setBank({})
    bankRef.current = {}
    setGranted({})
  }, [])

  const begin = useCallback((c: Challenge) => {
    setChallenge(c)
    setScore(null)
    setBest(null)
    setTrials(0)
    const empty: ResourceBudget = {}
    for (const k of Object.keys(c.budget)) empty[k] = 0
    setBank(empty)
    bankRef.current = empty
    setGranted(empty)
    if (c.gatherSeconds > 0) {
      setSecondsLeft(c.gatherSeconds)
      setPhase('gather')
    } else {
      // A challenge with no gather round hands the whole budget over: the
      // scarcity is then the budget itself, which is a legitimate shape.
      setGranted({ ...c.budget })
      setBank({ ...c.budget })
      bankRef.current = { ...c.budget }
      labStartedAt.current = performance.now()
      setPhase('lab')
    }
  }, [])

  /**
   * Bank one catch, never past what the challenge offers.
   *
   * The cap is what makes a *good* gather round distinguishable from a frantic
   * one: past the ceiling, more catching buys nothing, so the skill being
   * rewarded is reading the sky rather than waving.
   */
  const catchOne = useCallback(
    (kind: SugarResource, amount: number) => {
      const c = challenge
      if (!c) return
      const ceiling = c.budget[kind]
      if (ceiling === undefined) return
      const now = bankRef.current[kind] ?? 0
      if (now >= ceiling) return
      const next = { ...bankRef.current, [kind]: Math.min(ceiling, now + amount) }
      bankRef.current = next
      setBank(next)
    },
    [challenge],
  )

  const endGather = useCallback(() => {
    if (phase === 'gather') setSecondsLeft(0)
  }, [phase])

  const draw = useCallback((cost: ResourceBudget) => {
    setBank((prev) => {
      const next = drawDown(prev, cost)
      bankRef.current = next
      return next
    })
  }, [])

  const spend = useCallback(
    (cost: ResourceBudget) => {
      draw(cost)
      setTrials((n) => n + 1)
    },
    [draw],
  )

  const offer = useCallback(
    (value: number) => {
      const c = challenge
      if (!c || !Number.isFinite(value)) return
      setBest((prev) => {
        if (prev === null) return value
        // "Best" depends on which way the goal points: on an `atMost` target,
        // the smaller number is the better one, and on a `near` target it is
        // whichever sits closer to the mark. Taking the maximum every time
        // would quietly tell a learner chasing 12.0 that their wild 40 was
        // their finest attempt.
        if (c.goal.direction === 'atMost') return Math.min(prev, value)
        if (c.goal.direction === 'near')
          return Math.abs(value - c.goal.target) < Math.abs(prev - c.goal.target) ? value : prev
        return Math.max(prev, value)
      })
    },
    [challenge],
  )

  const spent = useMemo(() => spentSoFar(granted, bank), [granted, bank])

  const attempt = useCallback((): ChallengeAttempt | null => {
    const c = challenge
    if (!c) return null
    return {
      challengeId: challengeId(c),
      best: best ?? 0,
      hit: best !== null && meetsGoal(c.goal, best),
      trials,
      spent,
      gathered: granted,
      seconds: Math.max(0, (performance.now() - labStartedAt.current) / 1000),
    }
  }, [challenge, best, trials, spent, granted])

  const finish = useCallback(() => {
    const c = challenge
    const a = attempt()
    if (!c || !a) return
    setScore(scoreAttempt(c, a))
    setPhase('scored')
  }, [challenge, attempt])

  const hit = challenge !== null && best !== null && meetsGoal(challenge.goal, best)

  return {
    phase,
    challenge,
    bank,
    granted,
    spent,
    trials,
    best,
    hit,
    secondsLeft,
    score,
    rival,
    open,
    close,
    begin,
    catchOne,
    endGather,
    spend,
    draw,
    offer,
    finish,
    attempt,
  }
}
