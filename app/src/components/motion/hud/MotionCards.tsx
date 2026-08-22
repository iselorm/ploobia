import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, CheckCircle2, ChevronDown, ChevronUp, Circle, PlayCircle, SkipForward, Timer, Trophy, X, Zap } from 'lucide-react'
import BandSwitch from '@/components/hud/BandSwitch'
import { Tile } from '@/components/ui/tile'
import { useBand, useBandCaps } from '@/lib/bands'
import { logEvent } from '@/lib/events'
import { median, setReaction, useReactionMs } from '@/lib/practical'
import {
  EQUATION_BEATS,
  MOTION_DEMO,
  motionMissionsForBand,
  SEGUE_COPY,
  type EquationBeat,
  type MissionContext,
} from '@/lib/motion'

/* ------------------------------------------------------------------ */
/* Welcome                                                            */
/* ------------------------------------------------------------------ */

export function MotionWelcome({ onStart, onDemo }: { onStart: () => void; onDemo: () => void }) {
  const [leaving, setLeaving] = useState(false)
  const go = (fn: () => void) => {
    setLeaving(true)
    window.setTimeout(fn, 420)
  }
  return (
    <div
      data-focus-layer={leaving ? undefined : ''}
      className={`hud fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-[6px] transition-opacity ${leaving ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      style={{
        transitionDuration: '420ms',
        background: 'radial-gradient(ellipse at center, rgba(46, 84, 120, 0.5) 0%, rgba(20, 34, 50, 0.84) 100%)',
      }}
    >
      <div
        className={`welcome-pop max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-[28px] border border-[#F3E9D7] bg-[#FBF5EA] p-6 text-center shadow-2xl transition-all sm:p-9 ${leaving ? 'scale-95 opacity-0' : ''}`}
        style={{ transitionDuration: '420ms' }}
      >
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#2E6DA8] shadow-lg">
          <Timer className="h-8 w-8 text-[#FBF5EA]" />
        </div>
        <h1 className="text-4xl font-black tracking-tight text-[#402222] sm:text-5xl">Motion Yard</h1>
        <p className="mt-2 text-lg font-bold text-[#2E6DA8]">Measuring motion · I</p>
        <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed font-semibold text-[#7A5252]">
          A racing lane, a launch pad and Scout the drone. Race the car, sling the ball, call the landing —
          everything that moves wears its own glowing numbers. Find out why your stopwatch lies, and what
          happens when you turn gravity itself.
        </p>
        <div className="mx-auto mt-5">
          <BandSwitch variant="full" />
        </div>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            onClick={() => go(onDemo)}
            className="group flex items-center gap-2 rounded-full border-2 border-[#2E6DA8] px-6 py-3.5 text-base font-extrabold text-[#2E6DA8] transition-all duration-200 hover:scale-[1.03] hover:bg-[#E4EEF7] active:scale-[0.97]"
          >
            <PlayCircle className="h-5 w-5" />
            Show me how it works
          </button>
          <button
            onClick={() => go(onStart)}
            className="group flex items-center gap-2 rounded-full bg-[#2E6DA8] px-7 py-3.5 text-base font-extrabold text-[#FBF5EA] shadow-lg transition-all duration-200 hover:scale-[1.04] hover:bg-[#245685] active:scale-[0.97]"
          >
            Start measuring
            <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
          </button>
        </div>
        <p className="mt-4 text-xs font-semibold text-[#B08A7A]">
          First we measure <em>you</em>: five taps to find your reaction time. Drag to orbit, scroll to zoom.
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Catch the light — reaction-time calibration                        */
/* ------------------------------------------------------------------ */

const TRIALS = 5

/**
 * The lamp on the wall lights after a random 1–3 s; the learner taps. Five
 * trials, median kept. Taps are stamped on pointerdown (not click) and on the
 * wall clock, so what is stored is the learner's real latency — shown back
 * exactly the way a rhythm game shows early/late.
 */
export function CalibrationCard({
  onLamp,
  onDone,
  onSkip,
}: {
  onLamp: (on: boolean) => void
  onDone: (samples: number[]) => void
  onSkip?: () => void
}) {
  const [samples, setSamples] = useState<number[]>([])
  const [phase, setPhase] = useState<'idle' | 'waiting' | 'lit' | 'early' | 'done'>('idle')
  const litAt = useRef(0)
  const timer = useRef(0)
  const caps = useBandCaps()

  const arm = () => {
    setPhase('waiting')
    onLamp(false)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      litAt.current = performance.now()
      onLamp(true)
      setPhase('lit')
    }, 1000 + Math.random() * 2000)
  }

  useEffect(() => {
    return () => {
      window.clearTimeout(timer.current)
      onLamp(false)
    }
  }, [onLamp])

  const tap = () => {
    if (phase === 'idle' || phase === 'early') {
      arm()
      return
    }
    if (phase === 'waiting') {
      window.clearTimeout(timer.current)
      setPhase('early')
      return
    }
    if (phase === 'lit') {
      const ms = performance.now() - litAt.current
      onLamp(false)
      const next = [...samples, Math.round(ms)]
      setSamples(next)
      if (next.length >= TRIALS) {
        setPhase('done')
      } else {
        arm()
      }
    }
  }

  const med = samples.length ? Math.round(median(samples)) : null
  const last = samples[samples.length - 1]

  const bg =
    phase === 'lit'
      ? '#FFD25A'
      : phase === 'waiting'
        ? '#2F3A44'
        : phase === 'early'
          ? '#C13B33'
          : '#2E6DA8'
  const label =
    phase === 'idle'
      ? 'Tap to start'
      : phase === 'waiting'
        ? 'Wait for the light…'
        : phase === 'lit'
          ? 'TAP!'
          : phase === 'early'
            ? 'Too early — tap to try again'
            : 'Done'

  return (
    <div
      className="hud fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-[3px]"
      data-focus-layer=""
      style={{ background: 'radial-gradient(ellipse at center, rgba(20, 34, 50, 0.25) 0%, rgba(20, 34, 50, 0.7) 100%)' }}
    >
      <div className="welcome-pop w-full max-w-md rounded-[28px] border border-[#F3E9D7] bg-[#FBF5EA] p-6 text-center shadow-2xl">
        <div className="text-[10px] font-black tracking-widest text-[#2E6DA8] uppercase">Before anything else · catch the light</div>
        <h2 className="mt-1 text-2xl font-black text-[#402222]">How fast are you?</h2>
        <p className="mx-auto mt-2 max-w-sm text-[13px] leading-snug font-semibold text-[#7A5252]">
          {caps.vocab === 'simple'
            ? 'When Scout\u2019s belly lamp lights up, tap the big button as fast as you can. Five goes.'
            : 'Scout\u2019s lamp lights after a random delay. Tap on pointer-down as fast as you can — five trials, and we keep the median. Every hand-timed reading in this yard carries this number.'}
        </p>

        {phase !== 'done' ? (
          <button
            data-testid="catch-button"
            onPointerDown={(e) => {
              e.preventDefault()
              tap()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                tap()
              }
            }}
            className="tile mx-auto mt-4 flex h-40 w-full max-w-xs items-center justify-center rounded-[26px] text-3xl font-black text-[#FBF5EA] shadow-xl transition-colors select-none"
            style={{ background: bg, touchAction: 'manipulation' }}
          >
            {label}
          </button>
        ) : (
          <div className="mx-auto mt-4 rounded-[20px] border border-[#D3E2F0] bg-[#EDF4FA] px-4 py-4">
            <div className="text-[10px] font-black tracking-widest text-[#2E6DA8] uppercase">Your reaction time</div>
            <div className="mt-1 text-4xl font-black text-[#1F3E5C] tabular-nums">{((med ?? 0) / 1000).toFixed(2)} s</div>
            <p className="mt-1 text-[11.5px] leading-snug font-semibold text-[#3C5A75]">
              That is how late every hand-timed tap will be, give or take. It is not a fault — it is a
              measurement, and now it is yours to allow for.
            </p>
          </div>
        )}

        <div className="mt-3 flex items-center justify-center gap-1.5">
          {Array.from({ length: TRIALS }, (_, i) => (
            <span
              key={i}
              className={`rounded-full px-2 py-0.5 text-[10.5px] font-black tabular-nums ${
                samples[i] !== undefined ? 'bg-[#EAF3E6] text-[#2E7D32]' : 'bg-[#F3E9D7] text-[#B08A7A]'
              }`}
            >
              {samples[i] !== undefined ? `${(samples[i] / 1000).toFixed(2)} s` : '·'}
            </span>
          ))}
        </div>
        {last !== undefined && phase !== 'done' && (
          <p className="mt-1.5 text-[11px] font-bold text-[#7A5252]">Last tap: {(last / 1000).toFixed(2)} s</p>
        )}

        <div className="mt-4 flex items-center justify-center gap-2">
          {phase === 'done' && (
            <Tile
              onClick={() => onDone(samples)}
              className="flex items-center gap-2 rounded-full bg-[#2E6DA8] px-6 py-2.5 text-[13px] font-black text-[#FBF5EA] shadow hover:bg-[#245685]"
            >
              To the yard <ArrowRight className="h-4 w-4" />
            </Tile>
          )}
          {onSkip && phase !== 'done' && (
            <button onClick={onSkip} className="text-[11px] font-black text-[#B08A7A] uppercase">
              Skip for now
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Reaction chip — the videogame-style latency readout                */
/* ------------------------------------------------------------------ */

export function ReactionChip({ onRecalibrate }: { onRecalibrate: () => void }) {
  const ms = useReactionMs()
  return (
    <button
      onClick={onRecalibrate}
      title="Your measured reaction time — tap to measure it again"
      className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-[#F3E9D7] bg-[#FBF5EA]/90 px-3 py-1.5 text-[11px] font-extrabold text-[#7A5252] shadow-lg backdrop-blur-md transition-all hover:scale-[1.04]"
    >
      <Zap className="h-3.5 w-3.5 text-[#E8A33D]" />
      {ms === null ? 'Reaction: not measured' : `Your reaction: ${(ms / 1000).toFixed(2)} s`}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Missions                                                           */
/* ------------------------------------------------------------------ */

export function MotionMissionCard({ ctx, embedded = false }: { ctx: MissionContext; embedded?: boolean }) {
  const [band] = useBand()
  const missions = useMemo(() => motionMissionsForBand(band), [band])
  const done = useMemo(() => new Set(missions.filter((m) => m.check(ctx)).map((m) => m.id)), [missions, ctx])
  const [openState, setOpen] = useState(true)
  const open = embedded || openState
  const [expanded, setExpanded] = useState<string | null>(null)
  const seen = useRef<Set<string>>(new Set())
  const [justDone, setJustDone] = useState<string | null>(null)

  useEffect(() => {
    const fresh = [...done].find((id) => !seen.current.has(id))
    done.forEach((id) => seen.current.add(id))
    if (fresh) {
      const m = missions.find((x) => x.id === fresh)
      if (m) logEvent('motion', band, 'mission.completed', { missionId: m.id, title: m.title, skill: m.skill })
      setJustDone(fresh)
      setExpanded(fresh)
      setOpen(true)
      const t = window.setTimeout(() => setJustDone(null), 4200)
      return () => window.clearTimeout(t)
    }
  }, [done, missions, band])

  const completed = done.size
  return (
    <div
      className={
        embedded
          ? 'pointer-events-auto flex w-full flex-col'
          : 'pointer-events-auto flex max-h-full w-full max-w-[21rem] flex-col rounded-[20px] border border-[#F3E9D7] bg-[#FBF5EA]/95 shadow-xl backdrop-blur-md'
      }
    >
      {!embedded && (
        <button onClick={() => setOpen((o) => !o)} className="flex w-full shrink-0 items-center justify-between gap-2 px-4 py-3 text-left" aria-expanded={open}>
          <span className="flex items-center gap-2 text-sm font-extrabold text-[#402222]">
            <Trophy className={`h-4 w-4 ${justDone ? 'counter-pop text-[#E8A33D]' : 'text-[#B97D10]'}`} />
            Missions
            <span className="rounded-full bg-[#FBEBD2] px-2 py-0.5 text-[10px] font-black text-[#B97D10] tabular-nums">
              {completed}/{missions.length}
            </span>
          </span>
          {open ? <ChevronDown className="h-4 w-4 shrink-0 text-[#7A5252]" /> : <ChevronUp className="h-4 w-4 shrink-0 text-[#7A5252]" />}
        </button>
      )}
      {open && (
        <div className={embedded ? 'space-y-1.5 px-1 pt-1 pb-2' : 'max-h-[30dvh] space-y-1.5 overflow-y-auto px-3 pb-3'}>
          {missions.map((m) => {
            const isDone = done.has(m.id)
            const isOpen = expanded === m.id
            return (
              <div
                key={m.id}
                data-mission={m.id}
                data-done={isDone ? '1' : '0'}
                className={`rounded-[14px] border px-2.5 py-2 transition-colors ${isDone ? 'border-[#D3E2F0] bg-[#EDF4FA]' : 'border-[#F0E6D2] bg-[#FFFDF7]'} ${justDone === m.id ? 'fact-pop' : ''}`}
              >
                <button onClick={() => setExpanded(isOpen ? null : m.id)} className="flex w-full items-start gap-2 text-left">
                  {isDone ? <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-[#2E6DA8]" /> : <Circle className="mt-px h-3.5 w-3.5 shrink-0 text-[#C4AF95]" />}
                  <span className="min-w-0">
                    <span className={`block text-[12px] font-black ${isDone ? 'text-[#245685]' : 'text-[#402222]'}`}>
                      {m.title}
                      <span className="ml-1.5 rounded-full bg-[#F3E9D7] px-1.5 py-px text-[9px] font-black text-[#7A5252] uppercase">{m.mode === 'roll' ? 'drive' : m.mode}</span>
                    </span>
                    {(!isDone || isOpen) && <span className="mt-0.5 block text-[11px] leading-snug font-semibold text-[#7A5252]">{m.brief}</span>}
                  </span>
                </button>
                {isDone && isOpen && <p className="mt-1.5 border-t border-[#D3E2F0] pt-1.5 text-[11px] leading-snug font-semibold text-[#3C5A75]">{m.reward}</p>}
                {isDone && !isOpen && (
                  <button onClick={() => setExpanded(m.id)} className="mt-0.5 ml-[22px] text-[10px] font-black text-[#2E6DA8] uppercase">
                    Why it matters →
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Equation beat                                                      */
/* ------------------------------------------------------------------ */

export function EquationBeatCard({ beat, onClose }: { beat: EquationBeat['id']; onClose: () => void }) {
  const caps = useBandCaps()
  const b = EQUATION_BEATS[beat]
  return (
    <div className="fact-pop pointer-events-auto w-[min(30rem,calc(100vw-1.5rem))] rounded-[22px] border border-[#D3E2F0] bg-[#FBF5EA]/97 p-4 shadow-2xl backdrop-blur-md" data-focus-layer="">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-black tracking-widest text-[#2E6DA8] uppercase">Equation earned</div>
          <h3 className="mt-0.5 text-[15px] leading-tight font-black text-[#402222]">{b.title}</h3>
        </div>
        <Tile round onClick={onClose} aria-label="Close the equation" className="flex items-center justify-center rounded-full text-[#7A5252] hover:bg-[#F3E9D7]">
          <X className="h-4 w-4" />
        </Tile>
      </div>
      <div className="mt-2 rounded-[14px] border border-[#D3E2F0] bg-[#EDF4FA] px-3 py-2 text-center text-[20px] font-black text-[#1F3E5C]">{b.equation}</div>
      <p className="mt-2 text-[12.5px] leading-snug font-semibold text-[#5C3A3A]">{b.body[caps.vocab]}</p>
      <p className="mt-1.5 text-[10.5px] font-bold text-[#B08A7A]">It is on the chalkboard now.</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Segue                                                              */
/* ------------------------------------------------------------------ */

export function SegueCard({ onClose }: { onClose: () => void }) {
  const caps = useBandCaps()
  const copy = SEGUE_COPY[caps.vocab]
  return (
    <div className="hud fixed inset-0 z-40 flex items-center justify-center p-4" data-focus-layer="">
      <div className="welcome-pop w-full max-w-lg rounded-[28px] border border-[#F3E9D7] bg-[#FBF5EA] p-6 shadow-2xl sm:p-8">
        <div className="text-[10px] font-black tracking-widest text-[#2E6DA8] uppercase">The drawer clicks open</div>
        <h2 className="mt-1 text-2xl font-black text-[#402222]">So how do you time things properly?</h2>
        <div className="mt-3 space-y-2">
          {copy.map((p, i) => (
            <p key={i} className="text-[13.5px] leading-snug font-semibold text-[#5C3A3A]">
              {p}
            </p>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Tile onClick={onClose} data-testid="segue-close" className="flex items-center gap-2 rounded-full bg-[#2E6DA8] px-5 py-2.5 text-[13px] font-black text-[#FBF5EA] shadow hover:bg-[#245685]">
            Back to the yard
          </Tile>
          <span className="rounded-full bg-[#F3E9D7] px-3 py-2 text-[11px] font-extrabold text-[#7A5252]">Next cabinet: the Pendulum Practical · coming soon</span>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Demo narration                                                     */
/* ------------------------------------------------------------------ */

export function MotionDemoOverlay({ step, progress, onSkip }: { step: number; progress: number; onSkip: () => void }) {
  const current = MOTION_DEMO[step]
  if (!current) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4">
      <div className="pointer-events-auto w-[min(34rem,calc(100vw-2rem))] overflow-hidden rounded-[22px] border border-[#F3E9D7] bg-[#FBF5EA]/96 shadow-2xl backdrop-blur-md">
        <div className="flex items-start gap-3 p-4">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2E6DA8]">
            <PlayCircle className="h-5 w-5 text-[#FBF5EA]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[10px] font-black tracking-widest text-[#2E6DA8] uppercase">
                Guided demo · {step + 1} of {MOTION_DEMO.length}
              </span>
              <button onClick={onSkip} className="flex shrink-0 items-center gap-1 rounded-full bg-[#F3E9D7] px-2.5 py-1 text-[10.5px] font-extrabold text-[#7A5252] transition-colors hover:bg-[#EBDFC8]">
                <SkipForward className="h-3 w-3" />
                Skip to the controls
              </button>
            </div>
            <p className="mt-1 text-[13.5px] leading-snug font-semibold text-[#402222]">{current.text}</p>
          </div>
        </div>
        <div className="h-1 w-full bg-[#F0E6D2]">
          <div className="h-full bg-[#2E6DA8] transition-[width] duration-200 ease-linear" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      </div>
    </div>
  )
}

/** Small helper the page uses to store calibration and emit the event. */
export function commitReaction(samples: number[], band: Parameters<typeof logEvent>[1]) {
  setReaction(samples)
  const med = median(samples) / 1000
  logEvent('motion', band, 'reading.recorded', {
    variable: 'reaction',
    x: 0,
    y: Number(med.toFixed(3)),
    repeats: samples.map((s) => s / 1000),
    uncertainty: Number(((Math.max(...samples) - Math.min(...samples)) / 2000).toFixed(3)),
    controls: {},
    predicted: null,
    predictionClose: null,
    anomalous: false,
  })
}
