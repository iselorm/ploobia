/**
 * Pilot instrumentation — for the first closed round of testers only.
 *
 * Two jobs:
 *  1. Collect what a tester says, from inside the cabinet they said it about,
 *     with the context that makes the words actionable (which cabinet, which
 *     band, what the device is, what the renderer is, whether anything threw).
 *  2. Never lose it. Every report is written to this device first; sending is
 *     a best-effort second step.
 *
 * There is no analytics here and there never should be: nothing is recorded
 * unless a human deliberately writes a note and presses send. The error ring
 * buffer lives in memory only and is attached to a report the tester chooses to
 * file — it is not shipped on its own.
 *
 * Transport is configurable at build time so the same source works before and
 * after an endpoint exists:
 *   VITE_FEEDBACK_URL set  → POST the report as JSON
 *   unset                  → clipboard + mailto, so a pilot can run today
 */

import { read, write, available as storageAvailable } from './persist'

/* ------------------------------------------------------------------ */
/* Build-time configuration                                           */
/* ------------------------------------------------------------------ */

const ENDPOINT = (import.meta.env.VITE_FEEDBACK_URL as string | undefined) ?? ''
const MAILTO = (import.meta.env.VITE_FEEDBACK_EMAIL as string | undefined) ?? 'hello@ploobia.com'

/** True while this build is a pilot build — gates the in-app report button. */
export const PILOT: boolean = String(import.meta.env.VITE_PILOT ?? '') === '1'

/** Stamped by `define` in vite.config.ts so a report names the exact build. */
export const BUILD: string = typeof __PLOOBIA_BUILD__ === 'string' ? __PLOOBIA_BUILD__ : 'dev'

/* ------------------------------------------------------------------ */
/* Error ring buffer                                                  */
/* ------------------------------------------------------------------ */

export interface CapturedError {
  at: number
  kind: 'error' | 'rejection' | 'console' | 'scene'
  message: string
}

const MAX_ERRORS = 12
let errors: CapturedError[] = []

function capture(kind: CapturedError['kind'], message: string) {
  const text = String(message).slice(0, 600)
  const last = errors[errors.length - 1]
  if (last && last.kind === kind && last.message === text) return // don't let a render loop flood it
  errors = [...errors, { at: Date.now(), kind, message: text }].slice(-MAX_ERRORS)
}

/** Called by SceneErrorBoundary so a black screen is reportable. */
export function captureSceneError(message: unknown): void {
  capture('scene', message instanceof Error ? `${message.name}: ${message.message}` : String(message))
}

export function getErrors(): CapturedError[] {
  return errors
}

let installed = false

/** Installed once from main.tsx. Listeners only — nothing is sent anywhere. */
export function installPilotRuntime(): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  window.addEventListener('error', (e) => {
    capture('error', e.message || String(e.error))
  })
  window.addEventListener('unhandledrejection', (e) => {
    capture('rejection', String((e as PromiseRejectionEvent).reason))
  })

  const original = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    capture(
      'console',
      args
        .map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === 'string' ? a : ''))
        .filter(Boolean)
        .join(' '),
    )
    original(...args)
  }
}

/* ------------------------------------------------------------------ */
/* Frame-rate sample                                                  */
/* ------------------------------------------------------------------ */

let fpsSum = 0
let fpsCount = 0
let lastFrame = 0

/**
 * Cheap rolling average, fed from a rAF loop that only runs while the report
 * sheet is closed. "It was slow" is the most common tester report and the
 * least useful without a number.
 */
export function sampleFrame(now: number): void {
  if (lastFrame) {
    const dt = now - lastFrame
    if (dt > 0 && dt < 500) {
      fpsSum += 1000 / dt
      fpsCount += 1
    }
  }
  lastFrame = now
  if (fpsCount > 600) {
    fpsSum = fpsSum / fpsCount
    fpsCount = 1
  }
}

function meanFps(): number | null {
  return fpsCount > 20 ? Math.round(fpsSum / fpsCount) : null
}

/* ------------------------------------------------------------------ */
/* Device snapshot                                                    */
/* ------------------------------------------------------------------ */

export interface DeviceInfo {
  ua: string
  screen: string
  viewport: string
  dpr: number
  touch: boolean
  cores: number | null
  memoryGb: number | null
  renderer: string | null
  fps: number | null
  storage: boolean
  language: string
}

let cachedRenderer: string | null | undefined

function glRenderer(): string | null {
  if (cachedRenderer !== undefined) return cachedRenderer
  cachedRenderer = null
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      cachedRenderer = ext
        ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
        : String(gl.getParameter(gl.RENDERER))
      const lose = gl.getExtension('WEBGL_lose_context')
      lose?.loseContext()
    }
  } catch {
    cachedRenderer = null
  }
  return cachedRenderer
}

export function deviceInfo(): DeviceInfo {
  const nav = navigator as Navigator & { deviceMemory?: number }
  return {
    ua: navigator.userAgent.slice(0, 300),
    screen: `${window.screen.width}×${window.screen.height}`,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    dpr: Math.round(window.devicePixelRatio * 100) / 100,
    touch: matchMedia('(pointer: coarse)').matches,
    cores: navigator.hardwareConcurrency ?? null,
    memoryGb: nav.deviceMemory ?? null,
    renderer: glRenderer(),
    fps: meanFps(),
    storage: storageAvailable,
    language: navigator.language,
  }
}

/* ------------------------------------------------------------------ */
/* Reports                                                            */
/* ------------------------------------------------------------------ */

export type Mood = 'loved' | 'confused' | 'broken'

export const MOODS: { id: Mood; label: string; hint: string; emoji: string }[] = [
  { id: 'loved', label: 'I liked this', hint: 'What was good?', emoji: '🤩' },
  { id: 'confused', label: "I didn't get it", hint: 'What was confusing?', emoji: '🤔' },
  { id: 'broken', label: 'Something broke', hint: 'What went wrong?', emoji: '💥' },
]

export interface Report {
  id: string
  at: number
  build: string
  route: string
  cabinet: string
  band: string
  learner: string
  mood: Mood
  note: string
  device: DeviceInfo
  errors: CapturedError[]
  /** Counts only — never the readings themselves. */
  activity: { events: number; readings: number; missions: number }
  sent: boolean
}

const REPORT_KEY = 'ploobia.reports.v1'

export function getReports(): Report[] {
  return read<Report[]>(REPORT_KEY, [])
}

function saveReports(list: Report[]) {
  write(REPORT_KEY, list.slice(-40))
}

export interface ReportDraft {
  route: string
  cabinet: string
  band: string
  learner: string
  mood: Mood
  note: string
  activity: Report['activity']
}

export function buildReport(draft: ReportDraft): Report {
  return {
    id: `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    at: Date.now(),
    build: BUILD,
    ...draft,
    device: deviceInfo(),
    errors: getErrors(),
    sent: false,
  }
}

export type SendOutcome = 'sent' | 'saved' | 'copied'

/**
 * Store first, then try to send. Returns what actually happened so the UI can
 * tell the truth instead of always saying "thanks, sent!".
 */
export async function submitReport(report: Report): Promise<SendOutcome> {
  const list = [...getReports(), report]
  saveReports(list)

  if (ENDPOINT) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(report),
      })
      if (res.ok) {
        report.sent = true
        saveReports(list.map((r) => (r.id === report.id ? report : r)))
        return 'sent'
      }
    } catch {
      /* offline or blocked — it is already on the device */
    }
    return 'saved'
  }

  const copied = await copyToClipboard(reportText(report))
  return copied ? 'copied' : 'saved'
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Human-readable form — what lands in an email or a paste. */
export function reportText(r: Report): string {
  const d = r.device
  return [
    `Ploobia report · ${new Date(r.at).toISOString()}`,
    `${MOODS.find((m) => m.id === r.mood)?.label ?? r.mood} — ${r.cabinet} (${r.band})`,
    '',
    r.note || '(no note)',
    '',
    `route ${r.route} · build ${r.build} · learner ${r.learner}`,
    `${d.ua}`,
    `screen ${d.screen} · viewport ${d.viewport} · dpr ${d.dpr} · ${d.touch ? 'touch' : 'pointer'} · ${d.language}`,
    `gpu ${d.renderer ?? 'unknown'} · fps ${d.fps ?? '—'} · cores ${d.cores ?? '—'} · ram ${d.memoryGb ?? '—'}GB · storage ${d.storage ? 'on' : 'OFF'}`,
    `activity ${r.activity.events} events · ${r.activity.readings} readings · ${r.activity.missions} missions`,
    r.errors.length
      ? `\nerrors:\n${r.errors.map((e) => `  [${e.kind}] ${e.message}`).join('\n')}`
      : '\nno errors captured',
  ].join('\n')
}

export function mailtoFor(r: Report): string {
  const subject = `Ploobia pilot — ${r.cabinet} — ${r.mood}`
  return `mailto:${MAILTO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(reportText(r).slice(0, 1800))}`
}

/** Everything this device has ever filed, as one pasteable block. */
export function allReportsText(): string {
  const list = getReports()
  if (!list.length) return 'No reports on this device.'
  return list.map(reportText).join('\n\n' + '─'.repeat(48) + '\n\n')
}

export function hasEndpoint(): boolean {
  return Boolean(ENDPOINT)
}
