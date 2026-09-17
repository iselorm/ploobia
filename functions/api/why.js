/**
 * POST /api/why — a learner's explanation, in their own words, judged as a
 * typed decision rather than a chat reply.
 *
 * A Cloudflare Pages Function. It needs one secret, TYPESAFE_API_KEY (set in
 * the dashboard — secrets are the one thing a wrangler config does not lock).
 * Without it the endpoint returns 503 and the app falls back to the three
 * written options, which is the honest behaviour: the world never depends on
 * a server to be playable.
 *
 * Why a System One model and not a chat model: the app needs a VERDICT it can
 * act on — right / partial / a named misconception / off — with a probability
 * it can threshold, and Ploob's line comes from the quest's own data, never
 * from generated text. Nothing the model says reaches the learner; only what
 * it decides does. TypeSafe API v1, `POST /v1/systemone`, model `jev-latest`
 * (contract read from @typesafe-ai/sdk 0.6.0 types, 2026-09-17).
 *
 * The client sends the question, the learner's answer, the facts the learner
 * could have observed in the world, the target explanation and the named
 * misconceptions. Nothing is stored here; no learner identity is sent on.
 */

const MAX_BYTES = 16 * 1024
const MAX_ANSWER = 600
const TYPESAFE_URL = 'https://api.typesafe.ai/v1/systemone'

export async function onRequestPost({ request, env }) {
  if (!env.TYPESAFE_API_KEY) return json({ error: 'no TYPESAFE_API_KEY secret' }, 503)

  const raw = await request.text()
  if (raw.length > MAX_BYTES) return json({ error: 'too large' }, 413)
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ error: 'not json' }, 400)
  }
  const answer = String(body?.answer ?? '').trim().slice(0, MAX_ANSWER)
  const ask = String(body?.ask ?? '').trim()
  const target = String(body?.target ?? '').trim()
  const misconceptions = Array.isArray(body?.misconceptions)
    ? body.misconceptions.filter((m) => m && typeof m.key === 'string' && typeof m.text === 'string').slice(0, 6)
    : []
  const facts = body?.facts && typeof body.facts === 'object' ? body.facts : {}
  if (!answer || !ask || !target) return json({ error: 'need ask, target and answer' }, 400)

  // One narrow judgment per question. The verdict is a Choice; each named
  // misconception is its own Noul so more than one can hold; evidence use is
  // a Noul the Investigator/Engineer stamp can read.
  const questions = {
    verdict: {
      type: 'choice',
      instructions: {
        task: 'Judge whether `learner_answer` explains the cause asked about in `question`, against `target_explanation`. Judge the physical reasoning, not spelling, grammar or length. A learner aged 10–17 wrote it in a hurry.',
      },
      criteria: {
        right: 'The answer names the actual cause in the target explanation (in any words), even if briefly or with a small slip that does not change the mechanism.',
        partial: 'On the right track — points at the right part of the world — but does not name the mechanism, or stops at restating what happened.',
        misconception: 'The answer asserts one of the `misconceptions` as the cause.',
        off: 'The answer does not address the question, is empty of reasoning, or is about something else.',
      },
    },
    uses_evidence: {
      type: 'noul',
      instructions: 'Does `learner_answer` use something the learner measured or saw in `facts` — a reading, a comparison between fuels, the pipe, the air — as support?',
      criteria: { true: 'It cites or clearly relies on an observation or reading from the world.', false: 'It reasons without reference to anything observed.' },
    },
  }
  for (const m of misconceptions) {
    questions[`says_${m.key}`] = {
      type: 'noul',
      instructions: `Does \`learner_answer\` assert this misconception as the cause: "${m.text}"?`,
      criteria: { true: 'The answer states or relies on that claim.', false: 'It does not make that claim.' },
    }
  }

  const payload = {
    model: env.TYPESAFE_MODEL || 'jev-latest',
    state: {
      question: ask,
      learner_answer: answer,
      target_explanation: target,
      misconceptions: misconceptions.map((m) => m.text),
      facts,
    },
    questions,
  }

  let res
  try {
    res = await fetch(TYPESAFE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.TYPESAFE_API_KEY}` },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    return json({ error: 'judge unreachable', detail: String(e) }, 502)
  }
  if (!res.ok) return json({ error: 'judge refused', status: res.status }, 502)
  let data
  try {
    data = await res.json()
  } catch {
    return json({ error: 'judge not json' }, 502)
  }
  const a = data?.answers ?? {}
  const verdict = a.verdict
  if (!verdict || typeof verdict.choice !== 'string') return json({ error: 'no verdict' }, 502)

  // The most-asserted misconception, if any Noul says so with p ≥ 0.5.
  let misconception = null
  let best = 0.5
  for (const m of misconceptions) {
    const p = Number(a[`says_${m.key}`]?.noul ?? 0)
    if (p >= best) {
      best = p
      misconception = m.key
    }
  }

  return json({
    ok: true,
    verdict: verdict.choice,
    confidence: Number(verdict.confidence ?? 0),
    probabilities: verdict.probabilities ?? null,
    misconception,
    usesEvidence: Number(a.uses_evidence?.noul ?? 0),
    model: data.model ?? null,
  })
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '86400',
    },
  })
}

export function onRequestGet() {
  return json({ error: 'post a learner answer here' }, 405)
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
  })
}
