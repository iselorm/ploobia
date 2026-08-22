import { useEffect, useRef, useState } from 'react'
import { ArrowRight, CheckCircle2, Circle, PlayCircle, SkipForward, Trophy, Waves } from 'lucide-react'
import BandSwitch from '@/components/hud/BandSwitch'
import { Tile } from '@/components/ui/tile'
import { useBand } from '@/lib/bands'
import { logEvent } from '@/lib/events'
import { RIVER_DEMO, riverMissionsForBand, type RiverContext } from '@/lib/river'

/* ------------------------------------------------------------------ */
/* Welcome                                                            */
/* ------------------------------------------------------------------ */

export function RiverWelcome({ onStart, onDemo }: { onStart: () => void; onDemo: () => void }) {
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
        background: 'radial-gradient(ellipse at center, rgba(38, 76, 104, 0.5) 0%, rgba(16, 32, 46, 0.84) 100%)',
      }}
    >
      <div
        className={`welcome-pop max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-[28px] border border-[#F3E9D7] bg-[#FBF5EA] p-6 text-center shadow-2xl transition-all sm:p-9 ${leaving ? 'scale-95 opacity-0' : ''}`}
        style={{ transitionDuration: '420ms' }}
      >
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#2E6DA8] shadow-lg">
          <Waves className="h-8 w-8 text-[#FBF5EA]" />
        </div>
        <h1 className="text-4xl font-black tracking-tight text-[#402222] sm:text-5xl">The River Basin</h1>
        <p className="mt-2 text-lg font-bold text-[#2E6DA8]">River &amp; Flood Bench · I</p>
        <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed font-semibold text-[#7A5252]">
          One river, source to sea — a gorge that cuts, meanders that wander, a floodplain with a village on it.
          Time the float, sound the bed, follow your pebble. Then make it rain, read the gauge, and find out
          why the fastest-looking water isn&apos;t — and why floods come from the whole basin, not the sky above you.
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
            Let Ploob show me
          </button>
          <button
            onClick={() => go(onStart)}
            className="group flex items-center gap-2 rounded-full bg-[#2E6DA8] px-7 py-3.5 text-base font-extrabold text-[#FBF5EA] shadow-lg transition-all duration-200 hover:scale-[1.04] hover:bg-[#245685] active:scale-[0.97]"
          >
            Start the fieldwork
            <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
          </button>
        </div>
        <p className="mt-4 text-xs font-semibold text-[#B08A7A]">Drag to orbit, scroll to zoom. The basin dial retunes the whole world.</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Demo overlay — Ploob narrates from low-centre, with a skip          */
/* ------------------------------------------------------------------ */

export function RiverDemoOverlay({ step, progress, onSkip }: { step: number; progress: number; onSkip: () => void }) {
  const s = RIVER_DEMO[Math.min(step, RIVER_DEMO.length - 1)]
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-end pb-8">
      <div className="pointer-events-auto mx-4 flex max-w-xl flex-col gap-2 rounded-[22px] border border-[#F3E9D7] bg-[#FBF5EA]/95 p-4 shadow-2xl backdrop-blur-md">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2E6DA8]">
            <Waves className="h-5 w-5 text-[#FBF5EA]" />
          </div>
          <p className="text-[13.5px] leading-relaxed font-bold text-[#402222]">{s?.text}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-1.5 grow overflow-hidden rounded-full bg-[#EFE3CE]">
            <div className="h-full rounded-full bg-[#2E6DA8] transition-[width]" style={{ width: `${progress * 100}%` }} />
          </div>
          <span className="text-[10px] font-extrabold text-[#B08A7A]">
            {Math.min(step + 1, RIVER_DEMO.length)}/{RIVER_DEMO.length}
          </span>
          <Tile onClick={onSkip} className="flex items-center gap-1 rounded-full border border-[#E3D5BC] px-3 py-1 text-[11px] font-extrabold text-[#7A5252] hover:text-[#2E6DA8]">
            <SkipForward className="h-3 w-3" />
            Skip
          </Tile>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Missions                                                           */
/* ------------------------------------------------------------------ */

export function RiverMissionCard({ ctx, embedded = false }: { ctx: RiverContext; embedded?: boolean }) {
  const [band] = useBand()
  const missions = riverMissionsForBand(band)
  const [open, setOpen] = useState<string | null>(null)
  const logged = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (ctx.sim.demoMode) return
    for (const m of missions) {
      if (!logged.current.has(m.id) && m.check(ctx)) {
        logged.current.add(m.id)
        logEvent('rivers', band, 'mission.completed', { missionId: m.id, title: m.title, skill: m.skill })
      }
    }
  }, [ctx, missions, band])
  return (
    <div
      className={
        embedded
          ? 'flex w-full flex-col gap-1.5'
          : 'pointer-events-auto flex max-h-[38dvh] w-[min(24rem,calc(100vw-2rem))] flex-col gap-1.5 overflow-y-auto rounded-[22px] border border-[#F3E9D7] bg-[#FBF5EA]/95 p-3 shadow-xl backdrop-blur-md'
      }
    >
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4 text-[#E8A33D]" />
        <p className="text-[13px] font-black text-[#402222]">Missions</p>
        <p className="ml-auto text-[10.5px] font-extrabold text-[#B08A7A]">
          {missions.filter((m) => m.check(ctx)).length}/{missions.length}
        </p>
      </div>
      {missions.map((m) => {
        const done = m.check(ctx)
        const isOpen = open === m.id
        return (
          <div key={m.id} className={`rounded-xl border p-2 ${done ? 'border-[#CBE3C8] bg-[#EDF6EA]' : 'border-[#EFE3CE] bg-[#FFFDF7]'}`}>
            <Tile onClick={() => setOpen(isOpen ? null : m.id)} className="flex w-full items-start gap-2 text-left">
              {done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#3E7C43]" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[#C9B49E]" />}
              <span className={`text-[12px] font-extrabold ${done ? 'text-[#3E7C43]' : 'text-[#402222]'}`}>{m.title}</span>
            </Tile>
            {(isOpen || done) && (
              <p className="mt-1 pl-6 text-[11px] leading-snug font-semibold text-[#7A5252]">{done ? m.reward : m.brief}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
