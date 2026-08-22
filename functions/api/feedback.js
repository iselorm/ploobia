/**
 * POST /api/feedback — where the in-app report tab sends a tester's report.
 *
 * A Cloudflare Pages Function. It needs one binding, a KV namespace called
 * REPORTS; without it the endpoint returns 503 and the app falls back to
 * clipboard + mailto, which is the honest behaviour — better a tester who is
 * told to paste it than a "thanks, sent!" over a black hole.
 *
 * Deliberately minimal: no auth (an unlisted pilot link), no third party, no
 * cookies, no IP logging. Reports are keyed by timestamp so `wrangler kv key
 * list` reads back in order.
 */

const MAX_BYTES = 32 * 1024
const RETAIN_DAYS = 120

export async function onRequestPost({ request, env }) {
  if (!env.REPORTS) {
    return json({ error: 'no REPORTS KV namespace bound' }, 503)
  }

  const body = await request.text()
  if (body.length > MAX_BYTES) return json({ error: 'too large' }, 413)

  let report
  try {
    report = JSON.parse(body)
  } catch {
    return json({ error: 'not json' }, 400)
  }
  if (typeof report?.note !== 'string' || !report.note.trim()) {
    return json({ error: 'empty report' }, 400)
  }

  const at = Number(report.at) || Date.now()
  const key = `report:${new Date(at).toISOString()}:${String(report.id ?? '').slice(0, 24)}`

  // The country header is the one thing worth adding server-side: it tells you
  // whether a slow report came from a distant network. Nothing else is added.
  const stored = {
    ...report,
    receivedAt: Date.now(),
    country: request.headers.get('cf-ipcountry') ?? null,
  }

  await env.REPORTS.put(key, JSON.stringify(stored), {
    expirationTtl: RETAIN_DAYS * 24 * 60 * 60,
  })

  return json({ ok: true })
}

/** A browser preflight only happens if the app is served from another origin. */
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
  return json({ error: 'post reports here; read them with wrangler kv key list' }, 405)
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
    },
  })
}
