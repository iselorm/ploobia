import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { Check, Copy, Mail, MessageSquarePlus, Send, X } from 'lucide-react'
import { Tile } from '@/components/ui/tile'
import { useBand } from '@/lib/bands'
import { CABINETS } from '@/lib/cabinets'
import { useActiveLearner } from '@/lib/profiles'
import { getEvents } from '@/lib/events'
import {
  MOODS,
  PILOT,
  buildReport,
  hasEndpoint,
  mailtoFor,
  reportText,
  sampleFrame,
  submitReport,
  type Mood,
  type Report,
  type SendOutcome,
} from '@/lib/pilot'

/**
 * The pilot report sheet.
 *
 * Present only in a pilot build (`VITE_PILOT=1`). A tester taps the tab, says
 * what happened in their own words, and the report carries the context that
 * makes it actionable — which cabinet, which band, the GPU, the frame rate, and
 * anything that threw — without ever collecting a thing on its own.
 *
 * Placement was measured, not guessed. Every corner is already spoken for: the
 * back chip and level card sit top-left, the fact card and mission rail
 * top-right, the coach chip bottom-centre, the control panel bottom-left on
 * desktop, and the drawer tab bar across the bottom on compact — a bottom-left
 * button covered "Clear stage" in the Foundry and the "Controls" tab on a
 * phone, and the atoms suite caught it. The one strip free in every cabinet at
 * every size is the left edge at mid-height, so this is a slim tab flush to it
 * that widens on hover.
 */
export default function PilotReport() {
  const { pathname } = useLocation()
  const [band] = useBand()
  const learner = useActiveLearner()
  const [open, setOpen] = useState(false)
  const [mood, setMood] = useState<Mood>('confused')
  const [note, setNote] = useState('')
  const [outcome, setOutcome] = useState<SendOutcome | null>(null)
  const [pending, setPending] = useState(false)
  const [filed, setFiled] = useState<Report | null>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const cabinet = useMemo(() => {
    const match = CABINETS.find((c) => c.route === pathname)
    if (match) return match.title
    if (pathname === '/') return 'The hall'
    return pathname.replace('/', '') || 'The hall'
  }, [pathname])

  const tint = useMemo(() => CABINETS.find((c) => c.route === pathname)?.tint ?? '#E8A33D', [pathname])

  // Frame sampling runs only while the sheet is shut, so the numbers describe
  // playing rather than typing.
  useEffect(() => {
    if (open) return
    let raf = 0
    const loop = (t: number) => {
      sampleFrame(t)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [open])

  useEffect(() => {
    if (open) setTimeout(() => areaRef.current?.focus(), 120)
  }, [open])

  const close = useCallback(() => {
    setOpen(false)
    setOutcome(null)
    setFiled(null)
    setNote('')
  }, [])

  const send = useCallback(async () => {
    if (pending) return
    setPending(true)
    const mine = getEvents()
    const report = buildReport({
      route: pathname,
      cabinet,
      band,
      learner: learner?.nickname ?? 'unknown',
      mood,
      note: note.trim(),
      activity: {
        events: mine.length,
        readings: mine.filter((e) => e.type === 'reading.recorded').length,
        missions: mine.filter((e) => e.type === 'mission.completed').length,
      },
    })
    const result = await submitReport(report)
    setFiled(report)
    setOutcome(result)
    setPending(false)
  }, [band, cabinet, learner, mood, note, pathname, pending])

  if (!PILOT) return null

  if (!open) {
    return (
      <Tile
        onClick={() => setOpen(true)}
        aria-label="Tell us what happened"
        className="group/pilot fixed top-1/2 left-0 z-[60] flex -translate-y-1/2 items-center gap-1.5 rounded-r-2xl border border-l-0 border-white/20 bg-black/55 py-3 pr-1.5 pl-1 text-[11px] font-extrabold text-white/85 shadow-lg backdrop-blur transition-all hover:bg-black/80 hover:pr-3"
        style={{ boxShadow: `0 0 0 1px ${tint}44, 0 8px 24px rgba(0,0,0,.35)` }}
      >
        <MessageSquarePlus className="h-4 w-4 shrink-0" style={{ color: tint }} />
        <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all group-hover/pilot:max-w-[5rem] group-hover/pilot:opacity-100">
          Tell us
        </span>
      </Tile>
    )
  }

  const hint = MOODS.find((m) => m.id === mood)?.hint ?? ''

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6" data-focus-layer="">
      <button
        aria-label="Close the report"
        onClick={close}
        className="absolute inset-0 cursor-default bg-black/45 backdrop-blur-[2px]"
      />
      <div className="relative w-full max-w-md rounded-[24px] border border-[#F3E9D7] bg-[#FBF5EA] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[17px] leading-tight font-black text-[#402222]">Tell us what happened</h2>
            <p className="mt-0.5 text-[12px] font-bold text-[#7A5252]">
              You're in <span style={{ color: tint }}>{cabinet}</span> · {band}
            </p>
          </div>
          <Tile round onClick={close} aria-label="Close" className="rounded-full p-1.5 text-[#7A5252] hover:bg-black/5">
            <X className="h-5 w-5" />
          </Tile>
        </div>

        {outcome ? (
          <div className="mt-4">
            <div className="flex items-center gap-2 rounded-2xl bg-[#3E7C43]/10 px-4 py-3">
              <Check className="h-5 w-5 shrink-0 text-[#3E7C43]" />
              <p className="text-[13px] leading-snug font-bold text-[#2C4A30]">
                {outcome === 'sent'
                  ? 'Sent. Thank you — that genuinely helps.'
                  : outcome === 'copied'
                    ? 'Copied to your clipboard and saved on this device. Paste it to us, or use the email button.'
                    : 'Saved on this device. Use the email or copy button to get it to us.'}
              </p>
            </div>
            {outcome !== 'sent' && filed && (
              <div className="mt-3 flex gap-2">
                <Tile asChild>
                  <a
                    href={mailtoFor(filed)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#402222] px-4 py-2.5 text-[13px] font-extrabold text-[#FBF5EA]"
                  >
                    <Mail className="h-4 w-4" /> Email it
                  </a>
                </Tile>
                <Tile
                  onClick={() => navigator.clipboard?.writeText(reportText(filed)).catch(() => {})}
                  className="flex items-center justify-center gap-2 rounded-full border border-[#D8CBB4] px-4 py-2.5 text-[13px] font-extrabold text-[#7A5252]"
                >
                  <Copy className="h-4 w-4" /> Copy
                </Tile>
              </div>
            )}
            <Tile
              onClick={close}
              className="mt-3 w-full rounded-full px-4 py-2.5 text-[13px] font-extrabold text-[#7A5252] hover:bg-black/5"
            >
              Back to it
            </Tile>
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {MOODS.map((m) => {
                const on = m.id === mood
                return (
                  <Tile
                    key={m.id}
                    onClick={() => setMood(m.id)}
                    aria-pressed={on}
                    className={`flex flex-col items-center gap-1 rounded-2xl border px-2 py-2.5 text-[11px] leading-tight font-extrabold transition-colors ${
                      on
                        ? 'border-transparent bg-[#402222] text-[#FBF5EA]'
                        : 'border-[#E3D8C2] bg-white text-[#7A5252] hover:bg-[#F3E9D7]'
                    }`}
                  >
                    <span className="text-lg leading-none">{m.emoji}</span>
                    {m.label}
                  </Tile>
                )
              })}
            </div>

            <label className="mt-3 block">
              <span className="sr-only">{hint}</span>
              <textarea
                ref={areaRef}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                maxLength={1200}
                placeholder={hint}
                className="w-full resize-none rounded-2xl border border-[#E3D8C2] bg-white px-3.5 py-3 text-[14px] leading-relaxed font-semibold text-[#402222] outline-none placeholder:text-[#B6A48D] focus:border-[#E8A33D]"
              />
            </label>

            <p className="mt-2 text-[11px] leading-snug font-semibold text-[#9A7F7F]">
              We attach your device, browser, frame rate and any error — never your readings or anything you wrote in a
              cabinet.
            </p>

            <Tile
              onClick={send}
              disabled={pending || !note.trim()}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-[#C13B33] px-4 py-3 text-[14px] font-black text-[#FBF5EA] shadow transition-all active:scale-[0.98] disabled:opacity-40"
            >
              <Send className="h-4 w-4" /> {hasEndpoint() ? 'Send it' : 'File it'}
            </Tile>
          </>
        )}
      </div>
    </div>
  )
}
