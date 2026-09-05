import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  ArrowRight,
  Award,
  Droplets,
  FlaskConical,
  Heart,
  Leaf,
  Lock,
  Play,
  Sparkles,
  Sun,
  Ticket,
  Waves,
  Zap,
  Timer,
} from 'lucide-react'
import BandSwitch from '@/components/hud/BandSwitch'
import Wordmark from '@/components/brand/Wordmark'
import { PloobEyes } from '@/components/brand/Ploob'
import { Tile } from '@/components/ui/tile'
import { BAND_META, useBand } from '@/lib/bands'
import { CABINETS, type CabinetMeta } from '@/lib/cabinets'
import { CABINET_SPONSORS, SPONSOR_CONTACT } from '@/lib/sponsors'
import { countInvestigations, useAllEvents } from '@/lib/events'
import { faceFor, useProgress } from '@/lib/progression'
import { updateLearner, useActiveLearner } from '@/lib/profiles'

const ICONS: Record<string, React.ReactNode> = {
  photosynthesis: (
    <span className="relative flex items-center justify-center">
      <Leaf className="h-9 w-9" />
      <Sun className="absolute -top-3 -right-3 h-4 w-4 text-[#E8A33D]" />
    </span>
  ),
  blood: <Droplets className="h-9 w-9" />,
  motion: <Timer className="h-9 w-9" />,
  rivers: <Waves className="h-9 w-9" />,
  circuits: <Zap className="h-9 w-9" />,
}

/* ------------------------------------------------------------------ */
/* One arcade machine                                                 */
/* ------------------------------------------------------------------ */

function Cabinet({ c, attract }: { c: CabinetMeta; attract: boolean }) {
  const live = c.status === 'live'
  const sponsor = CABINET_SPONSORS[c.id]

  return (
    <div
      className={`group relative flex w-[17rem] shrink-0 snap-center flex-col rounded-[26px] border border-white/10 bg-[#25201B] shadow-[0_30px_60px_rgba(0,0,0,0.45)] transition-all duration-300 ${
        live ? 'hover:-translate-y-2' : 'opacity-70'
      }`}
      style={
        attract
          ? { boxShadow: `0 0 0 2px ${c.tint}, 0 30px 60px rgba(0,0,0,.45), 0 0 48px ${c.tint}66` }
          : undefined
      }
    >
      {/* Marquee */}
      <div
        className="rounded-t-[26px] px-4 py-3 text-center"
        style={{ background: `linear-gradient(180deg, ${c.tint} 0%, ${c.tint}CC 100%)` }}
      >
        <div className="text-[10px] font-black tracking-[0.25em] text-white/70 uppercase">{c.subject}</div>
        <div className="text-[15px] leading-tight font-black text-[#FBF5EA]">{c.title}</div>
      </div>

      {/* Screen */}
      <div className="relative mx-3 mt-3 aspect-[4/3] overflow-hidden rounded-[16px] border border-white/10 bg-[#0F1D14]">
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at 50% 35%, ${c.tint}66 0%, transparent 60%), linear-gradient(180deg, #16261B 0%, #0B140F 100%)`,
          }}
        />
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background:repeating-linear-gradient(0deg,#fff_0_1px,transparent_1px_3px)]" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
          <span
            className={attract ? 'attract-bob' : ''}
            style={{ color: c.tint, filter: `drop-shadow(0 0 12px ${c.tint})` }}
          >
            {ICONS[c.id]}
          </span>
          <p className="px-4 text-[11px] leading-snug font-bold text-[#E9E1CF]/90">{c.tagline}</p>
        </div>
        {!live && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45">
            <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-[11px] font-black text-white/85">
              <Lock className="h-3.5 w-3.5" /> Coming soon
            </span>
          </div>
        )}
        {live && attract && (
          <span className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[9.5px] font-black tracking-widest text-white/85 uppercase">
            Demo
          </span>
        )}
      </div>

      {/* Topics */}
      <div className="mx-3 mt-2 flex flex-wrap gap-1">
        {c.topics.slice(0, 3).map((t) => (
          <span key={t} className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[9.5px] font-extrabold text-white/60">
            {t}
          </span>
        ))}
      </div>

      {/* Control deck */}
      <div className="mx-3 mt-3 mb-3 flex flex-col gap-2">
        {live ? (
          <>
            <Tile asChild>
              <Link
                to={c.route}
                className="flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-black text-[#FBF5EA] shadow transition-all group-hover:gap-3"
                style={{ background: c.tint }}
              >
                <Play className="h-4 w-4 fill-current" /> {c.cta}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Tile>
            {c.hasDemo && (
              <Tile asChild>
                <Link
                  to={`${c.route}?demo=1`}
                  className="flex items-center justify-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[12px] font-extrabold text-white/80 transition-colors hover:bg-white/10"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Watch it play itself
                </Link>
              </Tile>
            )}
          </>
        ) : (
          <div className="rounded-full border border-white/10 px-4 py-2 text-center text-[12px] font-extrabold text-white/50">
            In the workshop
          </div>
        )}
      </div>

      {/* Sponsor plaque */}
      <div className="mx-3 mb-3 rounded-[10px] border border-[#8C7A5B]/40 bg-[#3A3128] px-3 py-1.5 text-center">
        {sponsor ? (
          <p className="text-[10px] font-bold text-[#E9D9B5]">
            <span className="tracking-widest uppercase opacity-70">Brought to you by</span>{' '}
            <span className="font-black">{sponsor.name}</span>
          </p>
        ) : (
          <a href={SPONSOR_CONTACT} className="text-[10px] font-bold text-[#C9B58F] underline-offset-2 hover:underline">
            Sponsor this cabinet · put your name on the plaque
          </a>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The hall                                                           */
/* ------------------------------------------------------------------ */

export default function Menu() {
  const [band] = useBand()
  const learner = useActiveLearner()
  const progress = useProgress()
  const face = faceFor(band, progress)
  const all = useAllEvents()
  const investigations = countInvestigations(all)
  const readings = all.filter((e) => e.type === 'reading.recorded').length

  // The menu's level choice belongs to the active learner profile.
  useEffect(() => {
    if (learner && learner.band !== band) updateLearner(learner.id, { band })
  }, [band, learner])

  // Attract mode: after a few idle seconds the live cabinets take turns lighting up.
  const [attract, setAttract] = useState<string | null>(null)
  useEffect(() => {
    let idle = 0
    const live = CABINETS.filter((c) => c.status === 'live' && !c.hidden)
    const tick = window.setInterval(() => {
      idle += 1
      if (idle >= 6) setAttract(live[Math.floor((idle - 6) / 4) % live.length].id)
    }, 1000)
    const wake = () => {
      idle = 0
      setAttract(null)
    }
    window.addEventListener('pointerdown', wake)
    window.addEventListener('keydown', wake)
    return () => {
      window.clearInterval(tick)
      window.removeEventListener('pointerdown', wake)
      window.removeEventListener('keydown', wake)
    }
  }, [])

  const Icon = band === 'explorer' ? Ticket : band === 'scientist' ? FlaskConical : Award

  return (
    <div
      className="hud relative flex min-h-[100dvh] flex-col overflow-x-hidden"
      style={{
        background:
          'radial-gradient(ellipse at 50% -10%, #4A3B2A 0%, transparent 55%), radial-gradient(ellipse at 50% 110%, #1E3422 0%, transparent 55%), #17130F',
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 [background:radial-gradient(ellipse_at_20%_0%,rgba(232,163,61,.18),transparent_50%),radial-gradient(ellipse_at_80%_0%,rgba(62,124,67,.18),transparent_50%)]" />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between gap-3 px-5 pt-5 sm:px-8">
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-black tracking-widest text-white/70 uppercase backdrop-blur">
          <PloobEyes size={14} /> Ploobia · the school arcade
        </div>
        <div className="flex items-center gap-2">
          <Tile asChild>
            <Link
              to="/home"
              aria-label="Your progress and family home"
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] font-extrabold text-white/85 backdrop-blur transition-colors hover:bg-white/10"
            >
              <span className="text-base leading-none">{learner.avatar}</span>
              <span className="hidden sm:inline">{learner.nickname}</span>
              <span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] tabular-nums">
                <Icon className="h-3 w-3" style={{ color: BAND_META[band].tint }} />
                {face.headline}
              </span>
            </Link>
          </Tile>
          <Tile asChild>
            <Link
              to="/home?support=1"
              aria-label="Support Ploobia"
              className="flex items-center gap-1.5 rounded-full border border-[#E8A33D]/40 bg-[#E8A33D]/15 px-3 py-1.5 text-[12px] font-extrabold text-[#F5D28C] backdrop-blur transition-colors hover:bg-[#E8A33D]/25"
            >
              <Heart className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Support</span>
            </Link>
          </Tile>
        </div>
      </header>

      {/* Title */}
      <div className="welcome-pop relative z-10 mt-8 flex flex-col items-center px-6 text-center">
        <h1 className="drop-shadow-[0_4px_24px_rgba(232,163,61,0.35)]">
          <Wordmark size={54} className="sm:hidden" />
          <Wordmark size={70} className="hidden sm:inline-flex" />
        </h1>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed font-semibold text-[#E9E1CF]/75">
          Welcome to Ploobia — a world where nothing works until you find out why. Pick a cabinet, change something, measure what happens.
        </p>
        <div className="mt-6 w-full max-w-2xl rounded-[22px] border border-white/10 bg-[#FBF5EA]/95 p-4 shadow-2xl">
          <BandSwitch variant="full" />
        </div>
      </div>

      {/* Cabinet row */}
      <div className="relative z-10 mt-8 flex snap-x snap-mandatory gap-6 overflow-x-auto px-6 pb-8 sm:justify-center sm:px-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CABINETS.filter((c) => !c.hidden).map((c) => (
          <Cabinet key={c.id} c={c} attract={attract === c.id} />
        ))}
      </div>

      {/* Floor line + impact */}
      <footer className="relative z-10 mt-auto flex flex-col items-center gap-2 px-6 pb-8 text-center">
        <p className="text-[12px] font-bold text-[#E9E1CF]/60">
          {readings > 0
            ? `This device has run ${investigations} investigation${investigations === 1 ? '' : 's'} and recorded ${readings} reading${readings === 1 ? '' : 's'} — all free.`
            : 'Free for every learner. Kept free by sponsors and by families who can chip in.'}
        </p>
        <p className="text-[11px] font-bold text-[#E9E1CF]/40">
          Biology wing open · Geography and Physics wings under construction
        </p>
      </footer>
    </div>
  )
}
