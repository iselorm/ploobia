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
import { WHYS, whyFacts, getWorld, type Why } from './archipelago'

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
