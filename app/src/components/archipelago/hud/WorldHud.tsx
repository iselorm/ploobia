import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, Compass, Hand, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isCoarse, useInputMode } from '@/lib/input'
import {
  COPPER_MELT_C,
  FUELS,
  FUEL_ORDER,
  RELIGHT,
  currentStep,
  feedFurnace,
  interactables,
  scoreRelight,
  setWorld,
  useWorld,
  type FuelId,
} from '@/lib/archipelago'
import { PloobLine } from '@/components/atoms/game/ForgeHud'
import Ploob2 from '@/components/brand/Ploob2'
import { Tile } from '@/components/ui/tile'
import { control } from '../live'

/**
 * The world's HUD — as little as the bible allows: a quest plate top-left
 * (with the pinned gauge when a number matters), Ploob's line low-centre,
 * two verbs bottom-right, a stick bottom-left on touch. The world fills the
 * frame; nothing here is a dashboard around a game.
 */

export default function WorldHud({ compact }: { compact: boolean }) {
  const s = useWorld()
  const mode = useInputMode()
  const coarse = isCoarse(mode)
  const step = currentStep(s)
  const stepIndex = RELIGHT.steps.findIndex((st) => st.id === step.id)
  const [note, setNote] = useState<string | null>(null)
  const [feeding, setFeeding] = useState(false)
  const [seenPour, setSeenPour] = useState(false)
  const [briefed, setBriefed] = useState(false)

  // Ploob's one-off lines, spoken over the coach line for a moment.
  useEffect(() => {
    const say = (text: string) => {
      setNote(text)
      window.setTimeout(() => setNote((n) => (n === text ? null : n)), 3600)
    }
    const heavy = () => say('Too heavy for you — that one needs the crane. Take the small ones.')
    const look = () => say('Look first. Raise the Lens by the furnace and follow the air.')
    const feed = () => setFeeding(true)
    window.addEventListener('ploobia:tooheavy', heavy)
    window.addEventListener('ploobia:lookfirst', look)
    window.addEventListener('ploobia:feed', feed)
    return () => {
      window.removeEventListener('ploobia:tooheavy', heavy)
      window.removeEventListener('ploobia:lookfirst', look)
      window.removeEventListener('ploobia:feed', feed)
    }
  }, [])

  const near = s.near ? interactables.get(s.near) : null
  const verbLabel = s.held ? 'Put it down' : near && near.verb !== 'portal' && near.verb !== 'talk' ? near.label : null
  const showGauge = s.zone === 'foundry' && (s.lit.length > 0 || s.furnace.lit)
  const brief = s.zone === 'foundry' && s.prediction == null && !briefed && s.phase === 'play'

  return (
    <div className="hud pointer-events-none fixed inset-0 z-20 select-none">
      {/* the System ring cools the world a step so the flows lead */}
      {s.ring === 'system' && <div className="absolute inset-0 bg-[#1B2A3A]/25 transition-opacity" data-testid="system-tint" />}
      {/* top-left: back + the quest */}
      <div className="absolute top-3 left-3 flex flex-col items-start gap-2">
        <Tile asChild className="pointer-events-auto atlas-plate-quiet flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-extrabold text-[#2A2823]">
          <Link to="/" aria-label="Back to the hall">
            <ArrowLeft size={14} /> Hall
          </Link>
        </Tile>
        {s.phase === 'play' && (
          <div className="atlas-plate pointer-events-auto max-w-[17rem] rounded-[18px] px-3 py-2" data-testid="quest-plate">
            <div className="flex items-center gap-1.5">
              <Compass size={13} className="text-[#8A5A0E]" />
              <span className="atlas-eyebrow leading-none">{s.zone === 'landing' ? 'The Landing' : 'The Foundry'}</span>
            </div>
            <p className="mt-1 text-[13px] leading-tight font-extrabold text-[#2A2823]">{RELIGHT.title}</p>
            {!compact && (
              <p className="mt-0.5 text-[11px] leading-snug text-[#5F5A4E]">
                Step {Math.min(stepIndex + 1, RELIGHT.steps.length - 1)} of {RELIGHT.steps.length - 1}
                {s.ring === 'system' && <span className="ml-1.5 rounded-full bg-[#CFE6FF] px-1.5 py-0.5 text-[10px] font-extrabold text-[#2F4F7A]">SYSTEM RING</span>}
              </p>
            )}
            {showGauge && <Gauge fuel={s.furnace.fuel} temp={s.furnace.temp} hearths={s.hearths} lit={s.lit} compact={compact} />}
          </div>
        )}
      </div>

      {/* low-centre: Ploob's line */}
      {s.phase === 'play' && !brief && !feeding && (
        <div className="absolute inset-x-0 flex justify-center px-3" style={{ bottom: compact ? 74 : 20 }}>
          <PloobLine text={note ?? step.coach} compact={compact} />
        </div>
      )}

      {/* bottom-right: the verbs */}
      {s.phase === 'play' && (
        <div className="absolute right-3 bottom-3 flex items-end gap-2">
          <Tile
            round
            aria-label="Lens"
            data-testid="lens"
            className={cn('pointer-events-auto grid h-12 w-12 place-items-center rounded-full atlas-plate', s.ring === 'system' && 'ring-2 ring-[#2F7F7A]')}
            onClick={() => {
              control.lens = true
            }}
          >
            <Eye size={20} />
          </Tile>
          {coarse && (
            <Tile
              round
              aria-label="Jump"
              className="pointer-events-auto grid h-12 w-12 place-items-center rounded-full atlas-plate text-[11px] font-extrabold"
              onPointerDown={() => {
                control.jump = true
              }}
              onPointerUp={() => {
                control.jump = false
              }}
            >
              Jump
            </Tile>
          )}
          <Tile
            aria-label={verbLabel ?? 'Interact'}
            data-testid="interact"
            disabled={!verbLabel}
            className={cn(
              'pointer-events-auto flex h-12 items-center gap-2 rounded-full px-4 text-[13px] font-extrabold atlas-plate transition-opacity',
              !verbLabel && 'opacity-40',
            )}
            onClick={() => {
              control.interact = true
            }}
          >
            <Hand size={18} />
            {verbLabel ?? (coarse ? 'Nothing near' : 'E')}
          </Tile>
        </div>
      )}

      {/* bottom-left: the stick, on touch only */}
      {s.phase === 'play' && coarse && <Stick />}

      {/* the welcome — play first */}
      {s.phase === 'welcome' && (
        <div className="pointer-events-auto absolute inset-0 grid place-items-center bg-[#2A2823]/35 p-4" data-focus-layer="">
          <div className="atlas-plate w-full max-w-[24rem] rounded-[22px] px-6 py-6 text-center">
            <div className="flex justify-center">
              <Ploob2 size={56} />
            </div>
            <span className="atlas-eyebrow mt-3 block">The Ploobia Archipelago · previz</span>
            <h1 className="atlas-serif mt-1 text-[26px] leading-tight font-semibold text-[#2A2823]">{RELIGHT.title}</h1>
            <p className="mt-2 text-[13px] leading-relaxed font-semibold text-[#5F5A4E]">{RELIGHT.hook}</p>
            <p className="mt-2 text-[11px] leading-relaxed text-[#8B8471]">
              {coarse ? 'Stick to walk · drag to look · the hand button to act' : 'WASD to walk · drag to look · E to act · L for the Lens · Space to jump'}
            </p>
            <Tile
              autoFocus
              data-testid="play"
              className="mt-4 w-full rounded-full bg-[#E8A33D] px-5 py-3 text-[15px] font-extrabold text-[#2A2823]"
              onClick={() => setWorld({ phase: 'play' })}
            >
              Play
            </Tile>
          </div>
        </div>
      )}

      {/* the brief — the foreman's ask, a number you type */}
      {brief && <Brief onDone={() => setBriefed(true)} />}

      {/* the feed sheet */}
      {feeding && (
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex justify-center p-3">
          <div className="atlas-plate w-full max-w-[26rem] rounded-[20px] px-4 py-3" data-testid="feed-sheet">
            <span className="atlas-eyebrow block">Feed the furnace</span>
            <p className="mt-1 text-[12px] font-semibold text-[#5F5A4E]">Which fuel? The gauge only knows what you read.</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {FUEL_ORDER.map((f) => {
                const read = s.lit.includes(f)
                return (
                  <Tile
                    key={f}
                    data-testid={`feed-${f}`}
                    className="rounded-[14px] bg-[#FBEBD2] px-2 py-2 text-left"
                    onClick={() => {
                      feedFurnace(f)
                      setFeeding(false)
                    }}
                  >
                    <span className="block text-[12px] font-extrabold text-[#2A2823]">{FUELS[f].name}</span>
                    <span className="block text-[11px] tabular-nums text-[#5F5A4E]">{read ? `${Math.round(s.hearths[f])} °C` : 'not read'}</span>
                  </Tile>
                )
              })}
            </div>
            <Tile className="mt-2 text-[12px] font-bold text-[#8B8471]" onClick={() => setFeeding(false)}>
              Not yet
            </Tile>
          </div>
        </div>
      )}

      {/* the pour — the hand-in card */}
      {s.poured && !seenPour && <Pour onClose={() => setSeenPour(true)} />}
    </div>
  )
}

function Gauge({ fuel, temp, hearths, lit, compact }: { fuel: FuelId | null; temp: number; hearths: Record<FuelId, number>; lit: FuelId[]; compact: boolean }) {
  const pct = Math.min(1, temp / (COPPER_MELT_C + 300))
  return (
    <div className="mt-2 border-t border-[#E3D8BF] pt-2" data-testid="gauge">
      <div className="flex items-baseline justify-between">
        <span className="atlas-eyebrow">Furnace</span>
        <span className="text-[15px] font-extrabold tabular-nums text-[#2A2823]" data-testid="furnace-temp">
          {Math.round(temp)} °C
        </span>
      </div>
      <div className="relative mt-1 h-2 w-full overflow-hidden rounded-full bg-[#EEE7D8]">
        <div className="h-full rounded-full bg-[#E8A33D]" style={{ width: `${pct * 100}%` }} />
        <div className="absolute top-0 h-full w-0.5 bg-[#C8552E]" style={{ left: `${(COPPER_MELT_C / (COPPER_MELT_C + 300)) * 100}%` }} title="copper melts" />
      </div>
      <p className="mt-0.5 text-[10px] text-[#8B8471]">
        {fuel ? `burning ${FUELS[fuel].name.toLowerCase()}` : 'cold'} · copper melts at {COPPER_MELT_C} °C
      </p>
      {!compact && lit.length > 0 && (
        <div className="mt-1 grid grid-cols-3 gap-1">
          {FUEL_ORDER.map((f) => (
            <div key={f} className="rounded-md bg-[#FBEBD2] px-1.5 py-1">
              <span className="block text-[9px] font-extrabold tracking-wide text-[#8A5A0E] uppercase">{FUELS[f].name}</span>
              <span className="block text-[11px] font-extrabold tabular-nums text-[#2A2823]" data-testid={`hearth-${f}`}>
                {lit.includes(f) ? `${Math.round(hearths[f])}°` : '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Brief({ onDone }: { onDone: () => void }) {
  const [v, setV] = useState('')
  const n = Number(v)
  const ok = v.trim() !== '' && Number.isFinite(n) && n > 0
  return (
    <div className="pointer-events-auto absolute inset-0 grid place-items-center bg-[#2A2823]/25 p-4" data-focus-layer="">
      <div className="atlas-plate w-full max-w-[24rem] rounded-[22px] px-6 py-5" data-testid="brief">
        <span className="atlas-eyebrow block">The Foreman</span>
        <p className="mt-1 text-[14px] leading-snug font-semibold text-[#2A2823]">
          “It went cold in the night. Forty bells due Friday. I have fed it everything and nothing.”
        </p>
        <p className="mt-3 text-[13px] font-extrabold text-[#2A2823]">{RELIGHT.predict.ask}</p>
        <div className="mt-2 flex items-center gap-2">
          <input
            id="world-prediction"
            data-testid="prediction"
            inputMode="numeric"
            autoFocus
            value={v}
            onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && ok) commit()
            }}
            className="w-28 rounded-xl border border-[#D9CFBC] bg-white px-3 py-2 text-[18px] font-extrabold tabular-nums text-[#2A2823] outline-none focus:border-[#E8A33D]"
            placeholder="?"
            aria-label={RELIGHT.predict.ask}
          />
          <span className="text-[14px] font-bold text-[#5F5A4E]">{RELIGHT.predict.unit}</span>
          <Tile data-testid="commit" disabled={!ok} className={cn('ml-auto rounded-full bg-[#E8A33D] px-4 py-2 text-[13px] font-extrabold text-[#2A2823]', !ok && 'opacity-40')} onClick={commit}>
            Say it
          </Tile>
        </div>
        <p className="mt-2 text-[11px] text-[#8B8471]">Say it first. The furnace will tell you.</p>
      </div>
    </div>
  )
  function commit() {
    setWorld({ prediction: n })
    onDone()
  }
}

function Pour({ onClose }: { onClose: () => void }) {
  const s = useWorld()
  const sc = scoreRelight(s)
  const t = useRef<number | null>(null)
  useEffect(() => {
    t.current = window.setTimeout(onClose, 12000)
    return () => {
      if (t.current) window.clearTimeout(t.current)
    }
  }, [onClose])
  return (
    <div className="pointer-events-auto absolute inset-x-0 top-14 flex justify-center px-3">
      <div className="atlas-plate atlas-arrive w-full max-w-[26rem] rounded-[22px] px-5 py-4" data-testid="pour-card">
        <span className="atlas-eyebrow block">The pour</span>
        <h2 className="atlas-serif mt-0.5 text-[22px] leading-tight font-semibold text-[#2A2823]">The furnace is lit.</h2>
        <p className="mt-1 text-[12.5px] font-semibold text-[#5F5A4E]">
          You said <b className="tabular-nums text-[#2A2823]">{s.prediction ?? '—'} °C</b>. Copper went at <b className="tabular-nums text-[#2A2823]">{COPPER_MELT_C} °C</b>; the gauge read{' '}
          <b className="tabular-nums text-[#2A2823]">{sc.reading} °C</b> on {s.furnace.fuel ? FUELS[s.furnace.fuel].name.toLowerCase() : 'nothing'}.
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          {(
            [
              ['Accuracy', sc.accuracy],
              ['Economy', sc.economy],
              ['Thrift', sc.thrift],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="rounded-xl bg-[#FBEBD2] px-2 py-1.5">
              <span className="block text-[9px] font-extrabold tracking-wide text-[#8A5A0E] uppercase">{k}</span>
              <span className="block text-[16px] font-extrabold tabular-nums text-[#2A2823]">{v}%</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-[#8B8471]">Walk back through the gate and look across the water.</p>
        <Tile className="mt-2 rounded-full bg-[#E8A33D] px-4 py-2 text-[12px] font-extrabold text-[#2A2823]" onClick={onClose}>
          Keep going
        </Tile>
      </div>
    </div>
  )
}

/** A thumb-stick: pointer down anywhere on it, drag, release. Writes `control`. */
function Stick() {
  const base = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState<[number, number]>([0, 0])
  const pid = useRef(-1)
  const R = 46
  function set(e: React.PointerEvent) {
    const el = base.current
    if (!el) return
    const r = el.getBoundingClientRect()
    let dx = e.clientX - (r.left + r.width / 2)
    let dy = e.clientY - (r.top + r.height / 2)
    const len = Math.hypot(dx, dy)
    if (len > R) {
      dx = (dx / len) * R
      dy = (dy / len) * R
    }
    control.x = dx / R
    control.y = -dy / R
    setKnob([dx, dy])
  }
  function end(e: React.PointerEvent) {
    if (e.pointerId !== pid.current) return
    pid.current = -1
    control.x = 0
    control.y = 0
    setKnob([0, 0])
  }
  return (
    <div
      ref={base}
      data-testid="stick"
      className="pointer-events-auto absolute bottom-4 left-4 h-[7.5rem] w-[7.5rem] touch-none rounded-full border-2 border-[#2A2823]/15 bg-[#FBF5EA]/60"
      onPointerDown={(e) => {
        pid.current = e.pointerId
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        set(e)
      }}
      onPointerMove={(e) => {
        if (e.pointerId === pid.current) set(e)
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div
        className="absolute top-1/2 left-1/2 h-12 w-12 rounded-full bg-[#E8A33D] shadow"
        style={{ transform: `translate(calc(-50% + ${knob[0]}px), calc(-50% + ${knob[1]}px))` }}
      />
    </div>
  )
}
