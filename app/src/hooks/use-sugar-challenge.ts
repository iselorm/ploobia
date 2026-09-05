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
import type { DayTally } from '@/lib/hatches'

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
 *   off  →  brief  →  ready  →  gather  →  handover  →  lab  →  scored
 *            ↑                                                    │
 *            └──────────────────── play again ────────────────────┘
 * ```
 *
 * `ready` is the three-second beat before the clock, with the collector
 * already live: the first catch ends it early, because a learner who has
 * found the gesture should not be made to wait for a countdown to tell them
 * about it. `handover` is the card between the round and the lab that says
 * what was caught and why the dials are about to stop where they stop —
 * without it the round ended cold and a capped dial read as a broken one.
 */
export type ChallengePhase =
  | 'off'
  | 'brief'
  | 'ready'
  | 'gather'
  | 'handover'
  | 'lab'
  | 'day'
  | 'scored'

/*
 * A keep round has its own spine through the same states:
 *
 *   off → brief → ready → day → scored
 *
 * `day` is the scripted span the sim runs on its own; the page owns the sim,
 * so the page starts the day when this hook enters the phase and calls
 * `finishDay` with the tally when the sim reports the span done.
 */

/** How long the get-ready beat lasts before the clock starts on its own. */
export const READY_SECONDS = 3

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
  /** The get-ready countdown, counting down to the clock. */
  readyLeft: number
  score: ChallengeScore | null
  /** A score sent by whoever shared the link, to beat. */
  rival: number | null
  /** A keep round's day, once it has been tallied. */
  tally: DayTally | null

  /** Open the brief — on a rival's score, and/or on a campaign stage's level. */
  open: (rival?: number | null, stage?: 1 | 2) => void
  /** Which stage the brief was opened for, so it can pick the right level. */
  stage: 1 | 2
  close: () => void
  begin: (c: Challenge) => void
  /** Fired by the gather round on every interception. */
  catchOne: (kind: SugarResource, amount: number) => void
  /** Cut the gathering short — a learner who has what they need should not wait. */
  endGather: () => void
  /** Leave the handover card and take the capped lab. */
  enterLab: () => void
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
  /** Score a keep round from its tally: the goal metric's value and whether the condition held. */
  finishDay: (tally: DayTally, value: number, conditionMet: boolean, waterMl: number) => void
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
  const [readyLeft, setReadyLeft] = useState(0)
  const [score, setScore] = useState<ChallengeScore | null>(null)
  const [rival, setRival] = useState<number | null>(null)
  const [tally, setTally] = useState<DayTally | null>(null)

  const labStartedAt = useRef(0)
  /** Whether the current challenge is a keep round — read from the tick, which cannot see state. */
  const keepRef = useRef(false)
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

  /* ---- the get-ready beat ---- */
  useEffect(() => {
    if (phase !== 'ready') return
    // Wall clock, not tick count: on a slow renderer the timer callbacks are
    // starved by the frames between them, and a beat counted in ticks ran
    // for six seconds where three were promised.
    const startedAt = performance.now()
    const t = window.setInterval(() => {
      const next = Math.max(0, READY_SECONDS - (performance.now() - startedAt) / 1000)
      setReadyLeft(next)
      // The tick that reaches zero is the one that starts the clock — done
      // here rather than in a second effect so the transition is one event.
      if (next <= 0) setPhase((p) => (p === 'ready' ? (keepRef.current ? 'day' : 'gather') : p))
    }, TICK_MS)
    return () => window.clearInterval(t)
  }, [phase])

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
    setPhase('handover')
  }, [phase, secondsLeft])

  const enterLab = useCallback(() => {
    if (phase !== 'handover') return
    labStartedAt.current = performance.now()
    setPhase('lab')
  }, [phase])

  const [stage, setStage] = useState<1 | 2>(1)
  const open = useCallback((r: number | null = null, s: 1 | 2 = 1) => {
    setRival(r ?? null)
    setStage(s)
    setPhase('brief')
  }, [])

  const close = useCallback(() => {
    setPhase('off')
    setChallenge(null)
    setScore(null)
    setTally(null)
    setBest(null)
    setTrials(0)
    setBank({})
    bankRef.current = {}
    setGranted({})
  }, [])

  const begin = useCallback((c: Challenge) => {
    setChallenge(c)
    setScore(null)
    setTally(null)
    setBest(null)
    setTrials(0)
    keepRef.current = c.loop === 'keep'
    const empty: ResourceBudget = {}
    for (const k of Object.keys(c.budget)) empty[k] = 0
    setBank(empty)
    bankRef.current = empty
    setGranted(empty)
    if (c.loop === 'keep') {
      // The day is the trial. The budget is the water a wide-open leaf would
      // lose, which thrift is measured against; nothing is gathered.
      setGranted({ ...c.budget })
      setBank({ ...c.budget })
      bankRef.current = { ...c.budget }
      setReadyLeft(READY_SECONDS)
      labStartedAt.current = performance.now()
      setPhase('ready')
    } else if (c.gatherSeconds > 0) {
      setSecondsLeft(c.gatherSeconds)
      setReadyLeft(READY_SECONDS)
      setPhase('ready')
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
      // The first catch is the learner saying "I have found the gesture" —
      // the countdown has nothing left to teach, so the clock starts now.
      setReadyLeft(0)
      setPhase((p) => (p === 'ready' ? 'gather' : p))
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
      hit: best !== null && meetsGoal(c.goal, best) && (!c.condition || tally?.leafFirm === true),
      trials,
      spent,
      gathered: granted,
      seconds: Math.max(0, (performance.now() - labStartedAt.current) / 1000),
      conditionMet: c.condition ? tally?.leafFirm === true : undefined,
    }
  }, [challenge, best, trials, spent, granted, tally])

  const finish = useCallback(() => {
    const c = challenge
    const a = attempt()
    if (!c || !a) return
    setScore(scoreAttempt(c, a))
    setPhase('scored')
  }, [challenge, attempt])

  const finishDay = useCallback(
    (t: DayTally, value: number, conditionMet: boolean, waterMl: number) => {
      const c = challenge
      if (!c) return
      const spentNow: ResourceBudget = { water: Math.round(waterMl * 100) / 100 }
      const a: ChallengeAttempt = {
        challengeId: challengeId(c),
        best: value,
        hit: meetsGoal(c.goal, value) && conditionMet,
        trials: 1,
        spent: spentNow,
        gathered: { ...c.budget },
        seconds: Math.max(0, (performance.now() - labStartedAt.current) / 1000),
        conditionMet,
      }
      setBest(value)
      setTrials(1)
      const left = drawDown({ ...c.budget }, spentNow)
      setBank(left)
      bankRef.current = left
      setTally(t)
      setScore(scoreAttempt(c, a))
      setPhase('scored')
    },
    [challenge],
  )

  const hit =
    challenge !== null &&
    best !== null &&
    meetsGoal(challenge.goal, best) &&
    (!challenge.condition || tally?.leafFirm === true)

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
    readyLeft,
    score,
    rival,
    tally,
    stage,
    open,
    close,
    begin,
    catchOne,
    endGather,
    enterLab,
    spend,
    draw,
    offer,
    finish,
    finishDay,
    attempt,
  }
}
