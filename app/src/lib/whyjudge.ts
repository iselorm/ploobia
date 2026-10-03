/**
 * The judge for a why answered in the learner's own words.
 *
 * The world never depends on a server to be playable: this returns `null` on
 * any failure — no endpoint, no key on the server (503), a slow network — and
 * the card falls back to the three written options. When it answers, it
 * answers with a typed verdict the card can act on, never with text to show.
 *
 * Endpoint: `functions/api/why.js` (a Pages Function holding the key), which
 * asks a TypeSafe System One model. `VITE_WHY_URL` overrides the path for a
 * hosted world served from another origin; unset → same-origin `/api/why`.
 */
import { BEND_WHY, HANDOFF_WHY, MEASURE_WHY, WHYS, bendFacts, castFacts, whyFacts, getWorld, type Why } from './archipelago'
import { methodSteps, type PlotRun } from './plot'
import { interpretHandoff, type HandoffOffer } from './keep'

export type Verdict = 'right' | 'partial' | 'misconception' | 'off'

export interface Judgement {
  verdict: Verdict
  confidence: number
  misconception: string | null
  usesEvidence: number
}

const URL = (import.meta.env.VITE_WHY_URL as string | undefined) || '/api/why'
const TIMEOUT_MS = 9000
/** Below this the verdict is not trusted to mark anything; the card asks again. */
export const TRUST = 0.55

export async function judgeWhy(index: number, answer: string): Promise<Judgement | null> {
  return judgeWhyOf(WHYS[index], answer, whyFacts(getWorld()), 'foundry.relight', index)
}

/** Any quest's why, judged the same way: the question, the target, the named misconceptions, the facts the learner could have seen. */
export async function judgeWhyOf(why: Why, answer: string, facts: Record<string, string | number | boolean>, quest: string, index = 0): Promise<Judgement | null> {
  const right = why.options.find((o) => o.right)
  if (!right) return null
  const body = {
    quest,
    index,
    ask: why.ask,
    answer: answer.trim().slice(0, 600),
    target: right.text,
    misconceptions: why.options.filter((o) => !o.right).map((o) => ({ key: o.key, text: o.text })),
    facts,
  }
  const ctl = new AbortController()
  const timer = window.setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal })
    if (!res.ok) return null
    const data = (await res.json()) as Partial<Judgement> & { ok?: boolean }
    if (!data.ok || !data.verdict) return null
    const verdict = data.verdict
    if (verdict !== 'right' && verdict !== 'partial' && verdict !== 'misconception' && verdict !== 'off') return null
    return {
      verdict,
      confidence: Number(data.confidence ?? 0),
      misconception: typeof data.misconception === 'string' ? data.misconception : null,
      usesEvidence: Number(data.usesEvidence ?? 0),
    }
  } catch {
    return null
  } finally {
    window.clearTimeout(timer)
  }
}

/**
 * S2 — Sefu's "Which measurement told you how much?" in the child's own
 * words, against what they measured on the way to the pour (the jug's rise,
 * the wet set's weight, the ingots, the pours). Same judge, same contract.
 */
export async function judgeCastWhy(answer: string): Promise<Judgement | null> {
  return judgeWhyOf(MEASURE_WHY, answer, castFacts(getWorld()), 'foundry.cart.measure', 0)
}

/**
 * S2 round A3 — "Why does the gate still get copper?" in the child's own
 * words, against their own four readings at the vice and what they pointed at
 * on the drawing. Same judge, same contract.
 */
export async function judgeBendWhy(answer: string): Promise<Judgement | null> {
  return judgeWhyOf(BEND_WHY, answer, bendFacts(getWorld()), 'foundry.cart.bend', 0)
}

/**
 * S1 — Nara's "So what do I do each morning?" in the child's own words.
 * Returns which say-back(s) to show; never runs a rule, never raises
 * ability (storyboard v3.1 §03). No network, a 503, or a low-confidence
 * verdict → all five choices.
 */
export async function judgeHandoff(answer: string): Promise<HandoffOffer & { verdict: Judgement | null }> {
  const s = getWorld()
  const steps = methodSteps([s.plot.first, s.plot.run].filter((r): r is PlotRun => !!r))
  const facts = {
    probedEachDawn: steps.probe,
    waitedWhenSoaked: steps.soakedWait,
    pouredWhenDry: steps.dryCan,
    checkedAgainAfterPouring: steps.checkAgain,
    beds: "Nara's bed and the far bed",
  }
  const verdict = answer.trim() ? await judgeWhyOf(HANDOFF_WHY, answer, facts, 'landing.handoff', 0) : null
  return { ...interpretHandoff(verdict, TRUST), verdict }
}
