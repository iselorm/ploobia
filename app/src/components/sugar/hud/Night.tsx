import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import Ploob2 from '@/components/brand/Ploob2'
import { Tile } from '@/components/ui/tile'
import { cn } from '@/lib/utils'
import type { Challenge } from '@/lib/challenge'
import { clock, type DayRun, type DayTally } from '@/lib/hatches'
import { Chip, Dial, Meter } from './AtlasKit'

/**
 * The night shift's HUD — what sits over the cut stem while the night runs.
 *
 * Three pieces, on the Hatches' pattern. The **night strip** at the top: the
 * hours from dusk to dawn, the two meters (sugar sent down the line against
 * the target; starch left in the bank), and the live tap and sap speed
 * beneath. The **thermostat** at the bottom: the one lever, with a finger
 * on the thumb holding the night for an Explorer. And **Ploob**, reading the
 * meters and saying the honest thing about the trade — cool nights burn
 * less of the bank, but cold sap is thick sap.
 *
 * `pointer-events-none` everywhere except the slider and the quit button,
 * so the stem behind stays orbitable.
 */

export interface NightState {
  /** Starch left in the leaf, mg. */
  bankMg: number
  /** What the bank was when the night began, mg. */
  bankStartMg: number
  /** Free sugar in the leaf right now, mg — the part of the store the meter does not draw. */
  sugarMg: number
  /** Starch plus free sugar at dusk, mg: everything the night could send or burn. */
  totalStartMg: number
  /** mg h⁻¹ down the phloem right now. */
  exportRate: number
  /** m h⁻¹. */
  velocity: number
  tempC: number
}

function NightMeter({
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
    <div className="rounded-xl border border-[#3A4466]/60 bg-[#1B2136]/85 px-2 py-1.5 text-[#EDE7D9] backdrop-blur-md">
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[9.5px] font-black tracking-[0.08em] text-[#B9B09A] uppercase">{label}</span>
        <span className={cn('text-[12px] font-black tabular-nums', bad ? 'text-[#F2A79F]' : 'text-[#FBF5EA]')}>
          {value}
          {display && <span className="ml-0.5 text-[9px] font-bold text-[#B9B09A]">{display}</span>}
        </span>
      </div>
      <div className="relative mt-1">
        <Meter value={Math.max(0, Math.min(1, frac))} color={bad ? '#C0453C' : color} height={5} />
        <span
          aria-hidden
          className="absolute top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FBF5EA]"
          style={{ left: `${Math.max(0, Math.min(100, lineFrac * 100))}%` }}
        />
      </div>
      <div className="mt-0.5 flex justify-between text-[8.5px] font-extrabold text-[#B9B09A]">
        <span className={cn(note && bad && 'text-[#F2A79F]')}>{note ?? ''}</span>
        <span>{lineLabel}</span>
      </div>
    </div>
  )
}

/** The hours from dusk to dawn, with the moon where the hour is. */
function NightArc({ from, to, hour }: { from: number; to: number; hour: number }) {
  const f = Math.max(0, Math.min(1, (hour - from) / Math.max(1e-6, to - from)))
  return (
    <div className="relative h-11 overflow-hidden rounded-xl border border-[#3A4466]/60 bg-[#1B2136]/85 backdrop-blur-md">
      <svg viewBox="0 0 320 44" className="absolute inset-0 h-full w-full" aria-hidden>
        <path d="M 14 38 Q 160 -18 306 38" fill="none" stroke="#3A4466" strokeWidth="1.5" strokeDasharray="3 4" />
        <circle
          cx={14 + 292 * f}
          cy={38 - Math.sin(f * Math.PI) * 30}
          r="5"
          fill="#EDE7D9"
          stroke="#8FA0CC"
          strokeWidth="1.5"
        />
      </svg>
      <div className="absolute inset-x-3 bottom-1 flex justify-between text-[9px] font-black tracking-[0.08em] text-[#B9B09A] uppercase">
        <span>dusk</span>
        <span className="text-[11px] tracking-normal text-[#FBF5EA] normal-case tabular-nums">{clock(hour)}</span>
        <span>dawn</span>
      </div>
    </div>
  )
}

function nightLine(
  run: DayRun | null,
  state: NightState,
  target: number,
  ready: boolean,
  band: 'explorer' | 'scientist' | 'analyst',
): string {
  if (ready) return 'The sun is going. Whatever the leaf banked today is what the line runs on tonight.'
  if (!run) return ''
  const sent = run.exportedMg
  const left = state.bankMg
  const hoursLeft = Math.max(0, run.spec.to - run.hour)
  if (left < 2 && state.exportRate < 0.5)
    return 'The bank is empty. The tap has stopped — nothing is left to send. More daylight next time, or a cooler night.'
  if (sent >= target) return `${Math.round(sent)} mg down the line — that is the target. Let the night run out, then hand it in.`
  if (state.tempC >= 26)
    return band === 'explorer'
      ? 'Warm night. The leaf is burning its bank fast — try turning the temperature down.'
      : 'A warm night respires the bank away. Every 10 °C roughly doubles what the tissue burns — cool it.'
  if (state.tempC <= 10)
    return band === 'explorer'
      ? 'Very cold. The sap has gone thick and slow — a little warmer keeps it moving.'
      : 'Cold sap is thick sap: the same pressure moves it more slowly. There is an optimum, and this is below it.'
  const need = target - sent
  if (hoursLeft > 0 && state.exportRate * hoursLeft < need * 0.9)
    return `${Math.round(sent)} of ${target} mg sent, ${Math.round(hoursLeft)} hours left at ${state.exportRate.toFixed(1)} mg an hour. That will fall short — the bank decides, and the thermostat is the only lever.`
  return `${Math.round(sent)} of ${target} mg sent. The bank is going down — ${Math.round(left)} mg left — that is today's starch being spent.`
}

export function NightHud({
  challenge,
  run,
  state,
  ready,
  readyLeft,
  band,
  compact,
  onQuit,
}: {
  challenge: Challenge
  run: DayRun | null
  state: NightState
  ready: boolean
  readyLeft: number
  band: 'explorer' | 'scientist' | 'analyst'
  compact: boolean
  onQuit: () => void
}) {
  const target = challenge.goal.target
  const sent = run?.exportedMg ?? 0
  const line = nightLine(run, state, target, ready, band)
  const bankFrac = state.bankStartMg > 0 ? state.bankMg / state.bankStartMg : 0
  const empty = state.bankMg < 2 && state.exportRate < 0.5

  return (
    <div className="pointer-events-none fixed inset-0 z-30" data-testid="night-hud">
      <div className={cn('absolute inset-x-3 top-3 mx-auto flex max-w-[36rem] flex-col gap-1.5', !compact && 'top-4')}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {run ? (
              <NightArc from={run.spec.from} to={run.spec.to} hour={run.hour} />
            ) : (
              <div className="h-11 rounded-xl border border-[#3A4466]/60 bg-[#1B2136]/85 px-3 py-2 text-[11px] font-black text-[#B9B09A]">
                DUSK · the night starts when the count ends
              </div>
            )}
          </div>
          <Tile
            onClick={onQuit}
            aria-label="Leave the challenge"
            className="pointer-events-auto mt-2 rounded-full bg-[#1B2136]/85 px-2 py-1 text-[#B9B09A] hover:text-[#FBF5EA]"
          >
            <X className="h-3.5 w-3.5" />
          </Tile>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <NightMeter
            label="Sent down the line"
            value={sent.toFixed(0)}
            display="mg"
            frac={sent / (target * 1.25)}
            color="#D9A441"
            lineFrac={1 / 1.25}
            lineLabel={`target ${target}`}
            note={empty ? 'stopped' : undefined}
            bad={empty}
          />
          <NightMeter
            label="Starch in the bank"
            value={state.bankMg.toFixed(0)}
            display="mg"
            frac={bankFrac}
            color="#E8A33D"
            lineFrac={0}
            lineLabel={`started ${Math.round(state.bankStartMg)} mg`}
            bad={state.bankMg < 5}
            note={state.bankMg < 5 ? 'nearly spent' : undefined}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip tone={empty ? 'warn' : 'neutral'}>tap: {state.exportRate.toFixed(1)} mg h⁻¹</Chip>
          <Chip tone="neutral">sap: {state.velocity.toFixed(2)} m h⁻¹</Chip>
          <Chip tone={state.tempC >= 26 || state.tempC <= 10 ? 'warn' : 'neutral'}>night air: {Math.round(state.tempC)} °C</Chip>
        </div>
      </div>

      {ready && (
        <div className="absolute inset-x-4 top-[11.5rem] flex justify-center">
          <div data-testid="get-ready" className="atlas-plate atlas-arrive w-full max-w-[22rem] px-4 py-3 text-center">
            <span className="atlas-serif block text-[44px] leading-none font-semibold text-[#2F6134] tabular-nums" aria-live="polite">
              {Math.max(1, Math.ceil(readyLeft))}
            </span>
            <p className="mt-1 text-[13px] leading-snug font-black text-[#2A2823]">The sun is going. Hold the thermostat.</p>
            <p className="mt-0.5 text-[11.5px] leading-snug font-semibold text-[#8B8471]">
              Send {target} {challenge.goal.unit} down the line before dawn.
            </p>
          </div>
        </div>
      )}

      <div className={cn('absolute inset-x-0 flex justify-center px-4', compact ? 'bottom-[9.6rem]' : 'bottom-[8.4rem]')}>
        <div data-testid="night-coach" className="atlas-plate flex max-w-[min(30rem,calc(100vw-2rem))] items-center gap-2.5 px-3 py-2">
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
/* The thermostat                                                      */
/* ------------------------------------------------------------------ */

/**
 * The night's one control. A finger on the thumb holds the night for an
 * Explorer, exactly as the hatch slider holds the day — the release listener
 * reads its handler through a ref for the same reason (see HatchPlate).
 */
export function ThermostatPlate({
  tempC,
  canHold,
  onChange,
  onHold,
  compact,
}: {
  tempC: number
  canHold: boolean
  onChange: (tempC: number) => void
  onHold: (held: boolean) => void
  compact: boolean
}) {
  const held = useRef(false)
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
      data-testid="thermostat-plate"
      className={cn('atlas-plate pointer-events-auto px-3 pt-2 pb-2.5', compact ? 'w-full' : 'w-[24rem]')}
      onPointerDown={() => {
        if (!canHold) return
        held.current = true
        onHoldRef.current(true)
      }}
    >
      <Dial
        label="Night air"
        value={tempC}
        display={`${Math.round(tempC)} °C`}
        min={4}
        max={34}
        step={1}
        color="#8FA0CC"
        onChange={onChange}
        note={
          canHold
            ? 'Cool nights burn less of the bank. Too cold and the sap thickens. A finger on the thumb holds the night.'
            : 'Respiration roughly doubles every 10 °C; viscosity climbs as it cools. Somewhere between is the night that sends most.'
        }
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The tally                                                           */
/* ------------------------------------------------------------------ */

export function NightTallyBlock({
  challenge,
  tally,
  bankStartMg,
  totalStartMg,
  totalEndMg,
  tempC,
}: {
  challenge: Challenge
  tally: DayTally
  /** Starch banked at dusk, mg — the number the gather round showed. */
  bankStartMg: number
  /** Starch plus the leaf's free sugar at dusk and at dawn, mg — the honest books. */
  totalStartMg: number
  totalEndMg: number
  tempC: number
}) {
  const hit = tally.exportedMg >= challenge.goal.target
  // Everything the leaf had, minus what it still has, minus what it sent:
  // what it burnt keeping itself alive through the night.
  const burnt = Math.max(0, totalStartMg - totalEndMg - tally.exportedMg)
  return (
    <div data-testid="night-tally" className="mt-2 rounded-xl border border-[#E4DCC9] bg-[#F6F2E8] px-3 py-2">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <span className="atlas-eyebrow block">Sent down the line</span>
          <span className={cn('text-[16px] font-black tabular-nums', hit ? 'text-[#2F6134]' : 'text-[#9A302A]')}>
            {tally.exportedMg.toFixed(0)} <span className="text-[10px] text-[#8B8471]">mg</span>
          </span>
        </div>
        <div>
          <span className="atlas-eyebrow block">Bank at dusk</span>
          <span className="text-[16px] font-black text-[#2A2823] tabular-nums">
            {bankStartMg.toFixed(0)} <span className="text-[10px] text-[#8B8471]">mg</span>
          </span>
        </div>
        <div>
          <span className="atlas-eyebrow block">Night air</span>
          <span className="text-[16px] font-black text-[#2A2823] tabular-nums">
            {Math.round(tempC)} <span className="text-[10px] text-[#8B8471]">°C</span>
          </span>
        </div>
      </div>
      <p className="mt-2 text-[11.5px] leading-snug font-semibold text-[#5F5A4E]">
        {hit
          ? `${tally.exportedMg.toFixed(0)} mg went down the phloem with the sun off. The leaf started the night holding ${totalStartMg.toFixed(0)} mg (${bankStartMg.toFixed(0)} banked as starch, the rest free sugar) and burnt ${burnt.toFixed(0)} mg keeping itself alive.`
          : `The leaf started the night with ${totalStartMg.toFixed(0)} mg (${bankStartMg.toFixed(0)} of it banked) and burnt ${burnt.toFixed(0)} mg at ${Math.round(tempC)} °C instead of sending it. More light before dusk fills the bank; a cooler night keeps more of it for the line.`}
      </p>
    </div>
  )
}
