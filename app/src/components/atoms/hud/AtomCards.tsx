import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Atom, CheckCircle2, ChevronDown, ChevronUp, Circle, Lightbulb, PlayCircle, SkipForward, Sparkles, Trophy, X } from 'lucide-react'
import BandSwitch from '@/components/hud/BandSwitch'
import { useBand } from '@/lib/bands'
import { logEvent } from '@/lib/events'
import {
  addressLogic,
  ATOM_DEMO,
  ATOM_TICKER,
  INTRO_STEPS,
  atomMissionsForBand,
  CATEGORY_META,
  ELEMENT_BY_Z,
  OBJECT_FACTS,
  type AtomFact,
  type AtomMissionContext,
} from '@/lib/atoms'

/* ------------------------------------------------------------------ */
/* Welcome                                                            */
/* ------------------------------------------------------------------ */

export function AtomWelcome({ onStart, onDemo }: { onStart: () => void; onDemo: () => void }) {
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
        background: 'radial-gradient(ellipse at center, rgba(120, 82, 28, 0.5) 0%, rgba(42, 28, 12, 0.86) 100%)',
      }}
    >
      <div
        className={`welcome-pop max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-[28px] border border-[#F3E9D7] bg-[#FBF5EA] p-6 text-center shadow-2xl transition-all sm:p-9 ${leaving ? 'scale-95 opacity-0' : ''}`}
        style={{ transitionDuration: '420ms' }}
      >
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#B97D10] shadow-lg">
          <Atom className="h-8 w-8 text-[#FBF5EA]" />
        </div>
        <h1 className="text-4xl font-black tracking-tight text-[#402222] sm:text-5xl">Atom Foundry</h1>
        <p className="mt-2 text-lg font-bold text-[#B97D10]">Where the periodic table comes from</p>
        <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed font-semibold text-[#7A5252]">
          Three crucibles, an empty stage, and a dark wall of sockets. Stack protons to name an atom, pour in
          electrons and watch the shells fill — then forge your atom into the one slot on the wall it could
          possibly live in. The table isn&apos;t a poster here. You build it.
        </p>
        <div className="mx-auto mt-5">
          <BandSwitch variant="full" />
        </div>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            onClick={() => go(onDemo)}
            className="group flex items-center gap-2 rounded-full border-2 border-[#B97D10] px-6 py-3.5 text-base font-extrabold text-[#B97D10] transition-all duration-200 hover:scale-[1.03] hover:bg-[#FBEBD2] active:scale-[0.97]"
          >
            <PlayCircle className="h-5 w-5" />
            Show me how it works
          </button>
          <button
            onClick={() => go(onStart)}
            className="group flex items-center gap-2 rounded-full bg-[#B97D10] px-7 py-3.5 text-base font-extrabold text-[#FBF5EA] shadow-lg transition-all duration-200 hover:scale-[1.04] hover:bg-[#95650C] active:scale-[0.97]"
          >
            Start forging
            <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
          </button>
        </div>
        <p className="mt-4 text-xs font-semibold text-[#B08A7A]">
          Tap the crucibles to add particles. Drag to orbit, scroll to zoom.
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Missions                                                           */
/* ------------------------------------------------------------------ */

export function AtomMissionCard({ ctx, embedded = false }: { ctx: AtomMissionContext; embedded?: boolean }) {
  const [band] = useBand()
  const missions = useMemo(() => atomMissionsForBand(band), [band])
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
      if (m) logEvent('atoms', band, 'mission.completed', { missionId: m.id, title: m.title, skill: m.skill })
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
          {open ? <ChevronUp className="h-4 w-4 text-[#7A5252]" /> : <ChevronDown className="h-4 w-4 text-[#7A5252]" />}
        </button>
      )}
      {open && (
        <div className={`min-h-0 overflow-y-auto ${embedded ? 'py-1' : 'px-2.5 pb-2.5'}`}>
          {missions.map((m) => {
            const isDone = done.has(m.id)
            const isOpen = expanded === m.id
            return (
              <button
                key={m.id}
                onClick={() => setExpanded((cur) => (cur === m.id ? null : m.id))}
                className={`mb-1 flex w-full items-start gap-2.5 rounded-[14px] px-2.5 py-2 text-left transition-colors ${
                  isDone ? 'bg-[#FBEBD2]/70' : 'hover:bg-[#F3E9D7]/60'
                } ${justDone === m.id ? 'mission-flash' : ''}`}
              >
                {isDone ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#B97D10]" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[#C9B8A4]" />
                )}
                <span className="min-w-0">
                  <span className={`block text-[13px] leading-snug font-extrabold ${isDone ? 'text-[#7A5E1E]' : 'text-[#402222]'}`}>{m.title}</span>
                  {(isOpen || (!isDone && expanded === null)) && !isDone && (
                    <span className="mt-0.5 block text-[12px] leading-snug font-semibold text-[#7A5252]">{m.brief}</span>
                  )}
                  {isOpen && isDone && (
                    <span className="mt-0.5 block text-[12px] leading-snug font-semibold text-[#7A5E1E]">{m.reward}</span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Fact cards (in-world taps)                                         */
/* ------------------------------------------------------------------ */

export interface ActiveAtomFact {
  fact: AtomFact
  accent: string
  key: number
}

let factRotation: Record<string, number> = {}

/** Pick the next fact for a tapped object, rotating through its list. */
export function nextObjectFact(kind: keyof typeof OBJECT_FACTS): AtomFact {
  const list = OBJECT_FACTS[kind]
  const i = factRotation[kind] ?? 0
  factRotation = { ...factRotation, [kind]: i + 1 }
  return list[i % list.length]
}

/** Fact for a lit wall tile. */
export function elementFact(z: number): AtomFact | null {
  const el = ELEMENT_BY_Z[z]
  if (!el) return null
  return { title: `${el.name} · ${CATEGORY_META[el.category].label}`, body: el.fact }
}

export function AtomFactCard({ active, onClose, onSummon }: { active: ActiveAtomFact; onClose: () => void; onSummon?: () => void }) {
  return (
    <div key={active.key} className="fact-pop pointer-events-auto w-[min(26rem,calc(100vw-2rem))] rounded-[22px] border border-[#F3E9D7] bg-[#FBF5EA] p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: active.accent }} />
          <span className="text-sm font-black tracking-wide text-[#402222] uppercase">{active.fact.title}</span>
          <Sparkles className="h-4 w-4 shrink-0 text-[#E8A33D]" />
        </div>
        <button onClick={onClose} aria-label="Close fact" className="rounded-full p-1.5 text-[#7A5252] transition-colors hover:bg-[#F3E9D7]">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-3 text-[15px] leading-relaxed font-semibold text-[#5C3A3A]">{active.fact.body}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-[#B08A7A]">Tap the nucleus, the rings, or a lit tile for more.</p>
        {onSummon && (
          <button onClick={onSummon} className="shrink-0 rounded-full bg-[#B97D10] px-3 py-1.5 text-[11px] font-extrabold text-white transition-all hover:bg-[#95650C] active:scale-[0.96]">
            Summon to stage
          </button>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Concepts intro — atom, element, compound, and the table's sides    */
/* ------------------------------------------------------------------ */

export function IntroCards({ step, onNext, onSkip }: { step: number; onNext: () => void; onSkip: () => void }) {
  const current = INTRO_STEPS[step]
  if (!current) return null
  const last = step === INTRO_STEPS.length - 1
  return (
    <div data-focus-layer="" className="hud fixed inset-0 z-40 flex items-center justify-center p-6" style={{ background: 'radial-gradient(ellipse at center, rgba(80, 56, 24, 0.35) 0%, rgba(46, 30, 12, 0.6) 100%)' }}>
      <div key={step} className="welcome-pop pointer-events-auto w-full max-w-lg rounded-[26px] border border-[#F3E9D7] bg-[#FBF5EA] p-7 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <span className="text-[11px] font-black tracking-widest text-[#B97D10] uppercase">{current.kicker}</span>
          <span className="shrink-0 rounded-full bg-[#F3E9D7] px-2 py-0.5 text-[10px] font-black text-[#7A5252] tabular-nums">
            {step + 1} / {INTRO_STEPS.length}
          </span>
        </div>
        <h2 className="mt-1.5 text-[26px] leading-tight font-black text-[#402222]">{current.title}</h2>
        <p className="mt-3 text-[14.5px] leading-relaxed font-semibold text-[#5C3A3A]">{current.body}</p>
        <div className="mt-6 flex items-center justify-between gap-3">
          <button onClick={onSkip} className="rounded-full px-3 py-2 text-[12px] font-extrabold text-[#B08A7A] transition-colors hover:bg-[#F3E9D7] hover:text-[#7A5252]">
            Skip intro
          </button>
          <button
            onClick={onNext}
            className="group flex items-center gap-2 rounded-full bg-[#B97D10] px-6 py-3 text-[14px] font-extrabold text-[#FBF5EA] shadow-lg transition-all duration-200 hover:scale-[1.03] hover:bg-[#95650C] active:scale-[0.97]"
          >
            {last ? 'To the crucibles!' : 'Next'}
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Element completion pop                                             */
/* ------------------------------------------------------------------ */

/**
 * The celebration card: fires the moment protons and electrons balance into a
 * real element. Big nuclide notation (ᴬ_Z X), the name in lights, and the
 * family it belongs to. Purely informational — it never blocks input.
 */
export function ElementPop({ z, a }: { z: number; a: number }) {
  const el = ELEMENT_BY_Z[z]
  if (!el) return null
  const meta = CATEGORY_META[el.category]
  // A neutral atom has z electrons, so the address follows from z alone here.
  const addr = addressLogic(z)
  return (
    <div className="pointer-events-none flex justify-center">
      <div key={`${z}-${a}`} className="welcome-pop flex items-center gap-4 rounded-[24px] border-2 bg-[#FBF5EA]/95 px-6 py-4 shadow-2xl backdrop-blur-md" style={{ borderColor: meta.tint }}>
        {/* nuclide notation: mass number over atomic number, then the symbol */}
        <div className="flex items-center">
          <div className="flex flex-col items-end justify-center leading-none">
            <span className="text-[20px] font-black text-[#5C3A3A] tabular-nums">{a}</span>
            <span className="mt-1 text-[20px] font-black text-[#B08A7A] tabular-nums">{z}</span>
          </div>
          <span className="ml-1 text-[64px] leading-none font-black" style={{ color: meta.tint }}>
            {el.symbol}
          </span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 shrink-0 text-[#E8A33D]" />
            <span className="text-[26px] leading-tight font-black text-[#402222]">{el.name}!</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full px-2.5 py-0.5 text-[11px] font-black text-white" style={{ background: meta.tint }}>
              {meta.label}
            </span>
            <span className="text-[11.5px] font-bold text-[#7A5252]">
              {z} proton{z === 1 ? '' : 's'} · {z} electron{z === 1 ? '' : 's'} balanced
            </span>
          </div>
          {addr && (
            <p className="mt-1 text-[11.5px] leading-snug font-bold text-[#8A6A3A]">
              {addr.outer} of {addr.outerCap} in the outer shell → <span className="text-[#B97D10]">column {addr.col}</span> · {addr.shells} shell
              {addr.shells === 1 ? '' : 's'} → <span className="text-[#B97D10]">row {addr.row}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Coach chip — always says the next move                             */
/* ------------------------------------------------------------------ */

export function CoachChip({ text, glow = false }: { text: string; glow?: boolean }) {
  return (
    <div className="pointer-events-none flex justify-center">
      <div
        className={`flex max-w-[min(30rem,calc(100vw-2rem))] items-center gap-2 rounded-full border px-4 py-2 shadow-lg backdrop-blur-md ${
          glow ? 'border-[#E8A33D] bg-[#FBEBD2]/95' : 'border-[#F3E9D7] bg-[#FBF5EA]/95'
        }`}
      >
        <Lightbulb className={`h-4 w-4 shrink-0 ${glow ? 'text-[#B97D10]' : 'text-[#C9A96A]'}`} />
        <span className="text-[12.5px] leading-snug font-extrabold text-[#5C3A3A]">{text}</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Ticker + about                                                     */
/* ------------------------------------------------------------------ */

export function AtomTicker() {
  const [pool, setPool] = useState<string[]>(ATOM_TICKER)
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const shuffleTimer = window.setTimeout(() => {
      const arr = [...ATOM_TICKER]
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      }
      setPool(arr)
    }, 50)
    const timer = window.setInterval(() => setIdx((i) => i + 1), 12000)
    return () => {
      window.clearTimeout(shuffleTimer)
      window.clearInterval(timer)
    }
  }, [])
  return (
    <div className="pointer-events-auto flex w-[min(21rem,calc(100vw-2rem))] items-start gap-3 rounded-[20px] border border-[#F3E9D7] bg-[#FBF5EA]/90 p-4 shadow-xl backdrop-blur-md">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E8A33D]/20">
        <Sparkles className="h-4 w-4 text-[#E8A33D]" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-black tracking-widest text-[#B97D10] uppercase">Did you know?</div>
        <p key={idx} className="ticker-fade mt-1 text-[13px] leading-snug font-semibold text-[#5C3A3A]">
          {pool[idx % pool.length]}
        </p>
      </div>
    </div>
  )
}

export function AtomAboutCard() {
  const [open, setOpen] = useState(false)
  return (
    <div className="pointer-events-auto w-[min(21rem,calc(100vw-2rem))] rounded-[20px] border border-[#F3E9D7] bg-[#FBF5EA]/90 shadow-xl backdrop-blur-md">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left" aria-expanded={open}>
        <span className="flex items-center gap-2 text-sm font-extrabold text-[#402222]">
          <Atom className="h-4 w-4 text-[#B97D10]" />
          About the foundry
        </span>
        {open ? <ChevronDown className="h-4 w-4 text-[#7A5252]" /> : <ChevronUp className="h-4 w-4 text-[#7A5252]" />}
      </button>
      {open && (
        <div className="px-4 pb-4 text-[13px] leading-relaxed font-semibold text-[#5C3A3A]">
          <p>
            Every atom is three particles arranged one way: <strong>protons</strong> (positive) and <strong>neutrons</strong> (neutral)
            packed into a tiny nucleus, with <strong>electrons</strong> (negative) stacked around it in <strong>shells</strong> that
            hold 2, then 8, then 8. The proton count — the <strong>atomic number</strong> — is the element&apos;s identity.
          </p>
          <p className="mt-2">
            The wall is the <strong>periodic table</strong>: rows count shells, columns count outer electrons. The probe measures
            <strong> first ionisation energy</strong> — the real, measured energy (kJ/mol) needed to steal an atom&apos;s outermost
            electron — and its zig-zag across the table is the experimental evidence that shells exist.
          </p>
          <p className="mt-2">
            Honesty note: the glowing rings are the <strong>Bohr model</strong> — a brilliant simplification. Real electrons are
            fuzzy clouds of probability (try the cloud view at Analyst level), and beyond element 20 the filling order gets
            subtler. Good models earn trust by working, and earn respect by admitting where they stop.
          </p>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Demo narration                                                     */
/* ------------------------------------------------------------------ */

export function AtomDemoOverlay({ step, progress, onSkip }: { step: number; progress: number; onSkip: () => void }) {
  const current = ATOM_DEMO[step]
  if (!current) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4">
      <div className="pointer-events-auto w-[min(34rem,calc(100vw-2rem))] overflow-hidden rounded-[22px] border border-[#F3E9D7] bg-[#FBF5EA]/96 shadow-2xl backdrop-blur-md">
        <div className="flex items-start gap-3 p-4">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#B97D10]">
            <PlayCircle className="h-5 w-5 text-[#FBF5EA]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[10px] font-black tracking-widest text-[#B97D10] uppercase">
                Guided demo · {step + 1} of {ATOM_DEMO.length}
              </span>
              <button onClick={onSkip} className="flex shrink-0 items-center gap-1 rounded-full bg-[#F3E9D7] px-2.5 py-1 text-[10.5px] font-extrabold text-[#7A5252] transition-colors hover:bg-[#EBDFC8]">
                <SkipForward className="h-3 w-3" />
                Skip to the crucibles
              </button>
            </div>
            <p className="mt-1 text-[13.5px] leading-snug font-semibold text-[#402222]">{current.text}</p>
          </div>
        </div>
        <div className="h-1 w-full bg-[#F0E6D2]">
          <div className="h-full bg-[#B97D10] transition-[width] duration-200 ease-linear" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      </div>
    </div>
  )
}
