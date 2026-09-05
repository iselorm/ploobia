import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import Ploob2 from '@/components/brand/Ploob2'
import { Slider } from '@/components/ui/slider'
import { Tile } from '@/components/ui/tile'
import { cn } from '@/lib/utils'
import type { Challenge } from '@/lib/challenge'
import { DAWN, DUSK, clock, type DayRun, type DaySpec, type DayTally, type Weather } from '@/lib/hatches'
import { Chip, Meter } from './AtlasKit'

/**
 * The Hatches' HUD — what sits over the stoma while a day runs.
 *
 * Four pieces. The **day strip** at the top: the sun's arc with the hour on
 * it, the two meters (sugar banked, water in the leaf) each with its line
 * (the target, the wilt point), and the live rates and the air beneath. The
 * **hatch plate** at the bottom: the one slider, with the plant's own hold
 * drawn on the track as a hard mark when the leaf is closing further than
 * the slider allows. A **weather card** that names an event when it arrives
 * — the wind, the wilt — and then gets out of the way. And **Ploob**, who
 * reads the meters and says the honest strategy for the air right now.
 *
 * Everything is `pointer-events-none` except the slider and the two buttons,
 * for the same reason the gather HUD is: the stage behind is draggable and a
 * strip that ate the pointer would make the pore un-orbitable.
 */

/* ------------------------------------------------------------------ */
/* Ploob's line                                                        */
/* ------------------------------------------------------------------ */

export interface HatchState {
  /** The learner's ceiling, 0–1. */
  ceiling: number
  /** What the pore actually is, 0–1, and what the plant alone would hold. */
  pore: number
  plant: number
  turgor: number
}

export function dayLine(
  run: DayRun | null,
  w: Weather | null,
  h: HatchState,
  target: number,
  ready: boolean,
  band: 'explorer' | 'scientist' | 'analyst',
): string {
  if (ready || !run || !w)
    return 'Open, and carbon comes in and sugar gets made. But water leaves the same way — and a leaf that runs dry shuts its hatches and stops. Both meters move at once.'
  const wilted = h.turgor < 0.35
  const holding = h.plant < h.ceiling - 0.08
  const frac = run.sugarMg / Math.max(1, target)
  if (wilted)
    return 'It did not die — it shut. That is the plant saving itself. Bring the slider down and let it drink back up; you lose the sugar until it does.'
  if (w.windOn && holding)
    return `${cap(run.spec.wind?.name ?? 'the wind')} is here. The leaf is shutting down on its own — you can let it, or bring the slider down and stop bleeding water now, before it decides for you.`
  if (w.windOn) return 'Dry air pulls water out faster. Watch the water meter, not the sugar meter.'
  if (h.turgor < 0.6) return 'The leaf is going soft. Less open for a while — it can only drink so fast.'
  if (w.night) return band === 'explorer' ? 'Night. No sun, so no sugar — and cool, damp air. Whatever is open now costs almost nothing.' : 'Night: no light, so no sugar; but the air has stopped pulling. This is the hour a cactus does its shopping.'
  if (run.hour < DAWN + 2) return 'Morning air is kind. Open wide while it is.'
  if (run.hour > DUSK - 2.5) return frac >= 1 ? 'You are over the mark. Ease off and bring the leaf home firm.' : 'Last of the light. Open what the leaf can bear.'
  if (frac < (run.hour - DAWN) / (DUSK - DAWN) - 0.15) return 'The sugar is behind. If the leaf is firm, there is room to open.'
  return 'Both meters move at once — that is the whole trade. Keep the water above the line.'
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/* ------------------------------------------------------------------ */
/* The day strip                                                       */
/* ------------------------------------------------------------------ */

function DayArc({ spec, hour, w }: { spec: DaySpec; hour: number; w: Weather | null }) {
  const span = spec.to - spec.from
  const x = (h: number) => 8 + (284 * (h - spec.from)) / span
  const sunX = x(Math.min(hour, DUSK))
  const sunY = 40 - 34 * Math.max(0, Math.sin(((Math.min(hour, DUSK) - DAWN) / (DUSK - DAWN)) * Math.PI))
  const wind = spec.wind
  const label = w?.windOn
    ? `${clock(hour)} · ${wind ? wind.name.replace(/^(a |the )/, '').toUpperCase() : 'DRY WIND'}`
    : w?.night
      ? `${clock(hour)} · NIGHT`
      : clock(hour)
  return (
    <div className="relative h-11 overflow-hidden rounded-xl border border-[#E4DCC9] bg-[#FCFAF4]/92 backdrop-blur-md" data-testid="day-arc">
      <svg viewBox="0 0 300 44" className="absolute inset-0 h-full w-full" aria-hidden>
        {/* the wind, as a band on the day */}
        {wind && (
          <rect x={x(wind.start)} y="0" width={Math.max(2, x(wind.start + wind.hours) - x(wind.start))} height="44" fill="#F6E4C0" opacity="0.8" />
        )}
        {/* night, if the run goes into it */}
        {spec.to > DUSK && <rect x={x(DUSK)} y="0" width={x(spec.to) - x(DUSK)} height="44" fill="#3B4A66" opacity="0.14" />}
        <path d={`M${x(DAWN)} 40 Q ${x((DAWN + DUSK) / 2)} -28 ${x(DUSK)} 40`} fill="none" stroke="#E8A33D" strokeWidth="2" />
        {hour <= DUSK && <circle cx={sunX} cy={sunY} r="5" fill="#E8A33D" />}
        <line x1={x(hour)} y1="0" x2={x(hour)} y2="44" stroke="#2A2823" strokeWidth="2" />
      </svg>
      <span className="absolute bottom-0.5 left-2 text-[8.5px] font-black tracking-[0.06em] text-[#8B8471]">DAWN</span>
      {spec.to > DUSK ? (
        <span className="absolute right-2 bottom-0.5 text-[8.5px] font-black tracking-[0.06em] text-[#8B8471]">NEXT DAWN</span>
      ) : (
        <span className="absolute right-2 bottom-0.5 text-[8.5px] font-black tracking-[0.06em] text-[#8B8471]">DUSK</span>
      )}
      <span
        className={cn(
          'absolute top-0.5 rounded-full bg-[#FCFAF4]/85 px-1.5 text-[9px] font-black tracking-[0.04em]',
          w?.windOn ? 'text-[#9A302A]' : 'text-[#2A2823]',
        )}
        style={{ left: `${Math.min(70, Math.max(2, ((hour - spec.from) / span) * 100 + 1))}%` }}
      >
        {label}
      </span>
    </div>
  )
}

function DayMeter({
  label,
  value,
  display,
  frac,
  color,
  lineFrac,
  lineLabel,
  bad,
  note,
}: {
  label: string
  value: string
  display?: string
  frac: number
  color: string
  lineFrac: number
  lineLabel: string
  bad?: boolean
  note?: string
}) {
  return (
    <div className="rounded-xl border border-[#E4DCC9] bg-[#FCFAF4]/92 px-2 py-1.5 backdrop-blur-md">
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[9.5px] font-black tracking-[0.08em] text-[#6B6555] uppercase">{label}</span>
        <span className={cn('text-[12px] font-black tabular-nums', bad ? 'text-[#9A302A]' : 'text-[#2A2823]')}>
          {value}
          {display && <span className="ml-0.5 text-[9px] font-bold text-[#8B8471]">{display}</span>}
        </span>
      </div>
      <div className="relative mt-1">
        <Meter value={Math.max(0, Math.min(1, frac))} color={bad ? '#C0453C' : color} height={5} />
        <span
          aria-hidden
          className="absolute top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2A2823]"
          style={{ left: `${Math.max(0, Math.min(100, lineFrac * 100))}%` }}
        />
      </div>
      <div className="mt-0.5 flex justify-between text-[8.5px] font-extrabold text-[#8B8471]">
        <span className={cn(note && bad && 'text-[#9A302A]')}>{note ?? ''}</span>
        <span>{lineLabel}</span>
      </div>
    </div>
  )
}

export function DayHud({
  challenge,
  run,
  weather,
  hatch,
  ready,
  readyLeft,
  band,
  compact,
  onQuit,
}: {
  challenge: Challenge
  run: DayRun | null
  weather: Weather | null
  hatch: HatchState
  ready: boolean
  readyLeft: number
  band: 'explorer' | 'scientist' | 'analyst'
  compact: boolean
  onQuit: () => void
}) {
  const target = challenge.goal.target
  const spec = run?.spec ?? null
  const hour = run?.hour ?? DAWN
  const sugar = run?.sugarMg ?? 0
  const wilted = hatch.turgor < 0.35
  const line = dayLine(run, weather, hatch, target, ready, band)

  /* A weather card when something arrives, then out of the way. */
  const [card, setCard] = useState<{ kind: 'wind' | 'wilt' | 'night'; until: number } | null>(null)
  const windSeen = useRef(false)
  const wiltSeen = useRef(false)
  const nightSeen = useRef(false)
  useEffect(() => {
    if (!run || !weather) return
    const now = performance.now()
    if (weather.windOn && !windSeen.current) {
      windSeen.current = true
      setCard({ kind: 'wind', until: now + 6500 })
    } else if (wilted && !wiltSeen.current) {
      wiltSeen.current = true
      setCard({ kind: 'wilt', until: now + 8000 })
    } else if (weather.night && !nightSeen.current && run.spec.to > DUSK) {
      nightSeen.current = true
      setCard({ kind: 'night', until: now + 6500 })
    }
  }, [run, weather, wilted])
  useEffect(() => {
    if (!card) return
    const t = window.setTimeout(() => setCard(null), Math.max(0, card.until - performance.now()))
    return () => window.clearTimeout(t)
  }, [card])

  const rateSugar = run?.samples[run.samples.length - 1]?.sugarRate ?? 0
  const rateWater = run?.samples[run.samples.length - 1]?.waterRate ?? 0

  return (
    <div className="pointer-events-none fixed inset-0 z-30" data-testid="day-hud">
      <div className={cn('absolute inset-x-3 top-3 mx-auto flex max-w-[36rem] flex-col gap-1.5', !compact && 'top-4')}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {spec ? (
              <DayArc spec={spec} hour={hour} w={weather} />
            ) : (
              <div className="h-11 rounded-xl border border-[#E4DCC9] bg-[#FCFAF4]/92 px-3 py-2 text-[11px] font-black text-[#8B8471]">
                DAWN · the day starts when the count ends
              </div>
            )}
          </div>
          <Tile
            onClick={onQuit}
            aria-label="Leave the challenge"
            className="pointer-events-auto mt-2 rounded-full bg-[#FCFAF4]/92 px-2 py-1 text-[#B9B09A] hover:text-[#4A4438]"
          >
            <X className="h-3.5 w-3.5" />
          </Tile>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <DayMeter
            label="Sugar banked"
            value={sugar.toFixed(0)}
            display="mg"
            frac={sugar / (target * 1.25)}
            color="#E8A33D"
            lineFrac={1 / 1.25}
            lineLabel={`target ${target}`}
            note={wilted ? 'stopped' : undefined}
            bad={wilted}
          />
          <DayMeter
            label="Water in leaf"
            value={`${Math.round(hatch.turgor * 100)}%`}
            frac={hatch.turgor}
            color="#2E6DA8"
            lineFrac={0.35}
            lineLabel="wilts under 35%"
            bad={hatch.turgor < 0.5}
            note={wilted ? 'wilted' : hatch.turgor < 0.6 ? 'going soft' : undefined}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip tone={wilted ? 'warn' : 'neutral'}>making {rateSugar.toFixed(1)} mg h⁻¹</Chip>
          <Chip tone={rateWater > 8 ? 'warn' : 'neutral'}>losing {rateWater.toFixed(1)} mL h⁻¹</Chip>
          {weather && (
            <Chip tone={weather.windOn ? 'warn' : 'neutral'}>
              air: {weather.night ? 'cool' : weather.tempC > 30 ? 'hot' : 'mild'}, {Math.round(weather.humidity * 100)}% humid
              {band !== 'explorer' ? ` · ${weather.vpdKpa.toFixed(1)} kPa` : ''}
            </Chip>
          )}
        </div>
      </div>

      {/* The countdown, before the day. */}
      {ready && (
        <div className="absolute inset-x-4 top-[11.5rem] flex justify-center">
          <div data-testid="get-ready" className="atlas-plate atlas-arrive w-full max-w-[22rem] px-4 py-3 text-center">
            <span className="atlas-serif block text-[44px] leading-none font-semibold text-[#2F6134] tabular-nums" aria-live="polite">
              {Math.max(1, Math.ceil(readyLeft))}
            </span>
            <p className="mt-1 text-[13px] leading-snug font-black text-[#2A2823]">Hold the hatches. The day will not wait.</p>
            <p className="mt-0.5 text-[11.5px] leading-snug font-semibold text-[#8B8471]">
              Bank {target} {challenge.goal.unit} by {run && run.spec.to > DUSK ? 'the next dawn' : 'dusk'}, with the leaf still firm.
            </p>
          </div>
        </div>
      )}

      {/* The event card. */}
      {card && !ready && (
        <div className="absolute inset-x-6 top-[11.5rem] flex justify-center">
          <div
            data-testid={`day-card-${card.kind}`}
            className={cn(
              'atlas-plate atlas-arrive w-full max-w-[22rem] px-3 py-2.5 text-center',
              card.kind === 'wind' && 'border-[#F0D39A]',
              card.kind === 'wilt' && 'border-[#EDC2BC]',
            )}
          >
            {card.kind === 'wind' && (
              <>
                <span className="atlas-eyebrow" style={{ color: '#8A5A0B' }}>Weather</span>
                <p className="text-[12.5px] leading-snug font-black text-[#2A2823]">
                  {cap(spec?.wind?.name ?? 'A dry wind')} has arrived. Dry air pulls water out faster.
                </p>
              </>
            )}
            {card.kind === 'wilt' && (
              <>
                <span className="atlas-eyebrow" style={{ color: '#9A302A' }}>The leaf has wilted</span>
                <p className="atlas-serif text-[15px] leading-tight font-semibold text-[#2A2823]">
                  A limp guard cell cannot hold a hatch open. The factory is shut until the leaf drinks back up.
                </p>
                <p className="mt-1 text-[11px] leading-snug font-semibold text-[#5F5A4E]">
                  Recovery takes a while — the roots have to catch up. Nothing you do to the slider opens them before it does.
                </p>
              </>
            )}
            {card.kind === 'night' && (
              <>
                <span className="atlas-eyebrow" style={{ color: '#3B4A66' }}>Night</span>
                <p className="text-[12.5px] leading-snug font-black text-[#2A2823]">
                  The sun is off, so no sugar — but the air has stopped pulling. Water is nearly free now.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Ploob. */}
      <div
        className={cn('absolute inset-x-0 flex justify-center px-4', compact ? 'bottom-[9.6rem]' : 'bottom-[8.4rem]')}
      >
        <div data-testid="day-coach" className="atlas-plate flex max-w-[min(30rem,calc(100vw-2rem))] items-center gap-2.5 px-3 py-2">
          <Ploob2 size={22} />
          <div className="min-w-0">
            <span className="atlas-eyebrow block leading-none">Ploob</span>
            <p className="text-[12px] leading-snug font-extrabold text-[#2A2823]">{line}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The hatch plate                                                     */
/* ------------------------------------------------------------------ */

/**
 * The one control.
 *
 * The slider is the learner's ceiling; the hard mark on the track is where
 * the plant itself is holding the hatches when that is lower — the stage-1
 * ceiling device, now moved by the weather instead of the jars. When the
 * leaf is limp the whole track goes hatched, because nothing the slider
 * says can open a hatch a limp cell cannot hold.
 *
 * Holding the thumb pauses the day for an Explorer (a finger on the control
 * is a reasonable "wait"); older bands get no such mercy, because reading
 * the weather ahead is the skill.
 */
export function HatchPlate({
  hatch,
  wilted,
  canHold,
  onChange,
  onHold,
  compact,
}: {
  hatch: HatchState
  wilted: boolean
  canHold: boolean
  onChange: (ceiling: number) => void
  onHold: (held: boolean) => void
  compact: boolean
}) {
  const holding = !wilted && hatch.plant < hatch.ceiling - 0.08
  const held = useRef(false)
  // The release listener is registered once, so it must read the *current*
  // handler through a ref: the plate mounts during the countdown, and a
  // handler captured then still thought the day had not started — which
  // left an Explorer's day paused for good after the first touch.
  const onHoldRef = useRef(onHold)
  onHoldRef.current = onHold
  useEffect(() => {
    const release = () => {
      if (!held.current) return
      held.current = false
      onHoldRef.current(false)
    }
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    return () => {
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
      release()
    }
  }, [])

  return (
    <div
      data-testid="hatch-plate"
      className={cn('atlas-plate pointer-events-auto px-3 py-2.5', compact ? 'w-full' : 'w-[24rem]')}
      onPointerDown={() => {
        if (!canHold) return
        held.current = true
        onHold(true)
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11.5px] font-black text-[#2A2823]">Hatches may open to</span>
        <span className="text-[12px] font-black tabular-nums" style={{ color: '#2E6DA8' }}>
          {Math.round(hatch.ceiling * 100)}%
          {wilted ? (
            <span className="ml-1 text-[9.5px] font-black tracking-[0.06em] text-[#9A302A] uppercase">· locked shut</span>
          ) : holding ? (
            <span className="ml-1 text-[9.5px] font-black tracking-[0.06em] text-[#8B8471] uppercase">
              · leaf holding at {Math.round(hatch.plant * 100)}%
            </span>
          ) : null}
        </span>
      </div>
      <div className="relative mt-2" aria-label="Hatches may open to" data-plant={Math.round(hatch.plant * 100)} data-pore={Math.round(hatch.pore * 100)}>
        <Slider
          value={[Math.round(hatch.ceiling * 100)]}
          min={0}
          max={100}
          step={5}
          onValueChange={(v) => onChange(v[0] / 100)}
          className="[&_[data-slot=slider-range]]:bg-[#2E6DA8] [&_[data-slot=slider-thumb]]:border-[#2E6DA8] [&_[data-slot=slider-track]]:bg-[#E7E1D2]"
        />
        {wilted && (
          <span
            aria-hidden
            data-testid="hatch-dead-zone"
            className="pointer-events-none absolute top-1/2 right-0 left-0 h-1.5 -translate-y-1/2 rounded-full"
            style={{ backgroundImage: 'repeating-linear-gradient(90deg, #D8D0BC 0 3px, transparent 3px 6px)' }}
          />
        )}
        {holding && (
          <span
            aria-hidden
            data-testid="hatch-hold-mark"
            className="pointer-events-none absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2A2823]"
            style={{ left: `${hatch.plant * 100}%` }}
          />
        )}
      </div>
      <p className="mt-1.5 text-[10px] leading-snug font-bold text-[#8B8471]">
        {wilted
          ? 'The slider still says what it says; a limp leaf cannot obey it.'
          : holding
            ? `The leaf is closing its hatches itself. Your slider says ${Math.round(hatch.ceiling * 100)}; it is holding at ${Math.round(hatch.plant * 100)}.`
            : 'The leaf can close them further on its own. It cannot open them past this.'}
        {canHold && !wilted ? ' Hold the thumb to pause the day.' : ''}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The tally                                                           */
/* ------------------------------------------------------------------ */

/**
 * The day's numbers on the result card: the total on the same gauge as
 * stage 1, the condition, the thrift, and one sentence computed from the
 * run's own log — the moment it went wrong and the move that would have
 * fixed it. For level 3, the cactus's day beside the bean's.
 */
export function DayTallyBlock({
  challenge,
  tally,
  safest,
  cactus,
}: {
  challenge: Challenge
  tally: DayTally
  /** The most open constant ceiling the replay found that keeps the leaf firm, and what it banks. */
  safest: { ceiling: number; sugarMg: number } | null
  cactus: DayTally | null
}) {
  const target = challenge.goal.target
  const axisMax = Math.max(target * 1.5, tally.sugarMg * 1.1, 1)
  const x = (v: number) => 6 + (280 * Math.max(0, Math.min(axisMax, v))) / axisMax
  const hit = tally.sugarMg >= target - 1e-9
  const gap = hit ? (tally.leafFirm ? 'on the mark' : 'on the mark — but limp') : `${(target - tally.sugarMg).toFixed(0)} short`
  return (
    <div data-testid="day-tally" className="mt-2 flex flex-col gap-2">
      <svg viewBox="0 0 292 58" className="block h-auto w-full" aria-hidden>
        <rect x="6" y="22" width="280" height="10" rx="5" fill="#EAE4D4" />
        <rect x={x(target)} y="22" width={286 - x(target)} height="10" rx="5" fill="#C8DFC2" />
        <rect x="6" y="22" width={Math.max(0, x(tally.sugarMg) - 6)} height="10" rx="5" fill={hit ? '#3E7C43' : '#E8A33D'} opacity={hit ? 1 : 0.85} />
        {!hit && <line x1={x(tally.sugarMg)} y1="27" x2={x(target)} y2="27" stroke="#FCFAF4" strokeWidth="2" strokeDasharray="3 3" />}
        <line x1={x(target)} y1="12" x2={x(target)} y2="42" stroke="#2F6134" strokeWidth="2" />
        <text x={x(target)} y="9" textAnchor={x(target) > 250 ? 'end' : 'middle'} fontSize="9.5" fontWeight="900" fill="#2F6134" fontFamily="Nunito, system-ui, sans-serif">
          TARGET {target}
        </text>
        <circle cx={x(tally.sugarMg)} cy="27" r={hit ? 8 : 7} fill="#FCFAF4" stroke={hit ? '#2F6134' : '#2A2823'} strokeWidth={hit ? 3 : 2.5} />
        <text x="6" y="53" fontSize="9" fontWeight="800" fill="#B9B09A" fontFamily="Nunito, system-ui, sans-serif">0</text>
        <text x="286" y="53" textAnchor="end" fontSize="9" fontWeight="800" fill="#B9B09A" fontFamily="Nunito, system-ui, sans-serif">
          {Math.round(axisMax)} {challenge.goal.unit}
        </text>
      </svg>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[19px] leading-none font-black text-[#2A2823] tabular-nums">
          {tally.sugarMg.toFixed(0)} <span className="text-[10.5px] font-bold text-[#8B8471]">mg banked</span>
        </span>
        <Chip tone={hit ? 'good' : 'warn'}>{gap}</Chip>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded-lg border border-[#E4DCC9] bg-[#FCFAF4] px-2 py-1">
          <div className="flex items-baseline justify-between text-[9.5px] font-black tracking-[0.08em] text-[#6B6555] uppercase">
            <span>Leaf at the end</span>
            <span className={tally.leafFirm ? 'text-[#2F6134]' : 'text-[#9A302A]'}>{tally.leafFirm ? 'firm ✓' : tally.wilted ? 'wilted' : 'limp'}</span>
          </div>
          <div className="text-[10px] font-bold text-[#8B8471]">
            {tally.wiltedAt !== null ? `wilted at ${clock(tally.wiltedAt)} for ${tally.wiltHours.toFixed(1)} h` : `${Math.round(tally.turgorAtEnd * 100)}% firm`}
          </div>
        </div>
        <div className="rounded-lg border border-[#E4DCC9] bg-[#FCFAF4] px-2 py-1">
          <div className="flex items-baseline justify-between text-[9.5px] font-black tracking-[0.08em] text-[#6B6555] uppercase">
            <span>Water used</span>
            <span className="text-[#2A2823]">{tally.waterMl.toFixed(0)} mL</span>
          </div>
          <div className="text-[10px] font-bold text-[#8B8471]">{tally.mgPerMl.toFixed(2)} mg per mL</div>
        </div>
      </div>
      <p className="text-[11.5px] leading-snug font-semibold text-[#5F5A4E]">
        {tally.advice}
        {safest && !tally.leafFirm
          ? ` On this day, holding the hatches at ${Math.round(safest.ceiling * 100)}% all day keeps the leaf firm and banks ${safest.sugarMg.toFixed(0)} mg.`
          : ''}
      </p>
      {cactus && (
        <div className="rounded-xl border border-[#F0D39A] bg-[#FBF0D8] px-3 py-2" data-testid="cactus-compare">
          <span className="atlas-eyebrow" style={{ color: '#8A5A0B' }}>The same day, as a prickly pear</span>
          <p className="mt-0.5 text-[11.5px] leading-snug font-bold text-[#4A4438]">
            {cactus.sugarMg.toFixed(0)} mg on {cactus.waterMl.toFixed(0)} mL — {cactus.mgPerMl.toFixed(2)} mg per mL, and {cactus.leafFirm ? 'firm at the end' : 'limp'}. Your bean: {tally.mgPerMl.toFixed(2)} mg per mL.
          </p>
          <p className="mt-1 text-[10.5px] leading-snug font-semibold text-[#8B8471]">
            The cactus opened its hatches only at night, when the air had stopped pulling, and banked the carbon as acid for the day. The bean cannot. (The model assumes the cactus's night bank is full; it does not yet run it down.)
          </p>
        </div>
      )}
    </div>
  )
}
