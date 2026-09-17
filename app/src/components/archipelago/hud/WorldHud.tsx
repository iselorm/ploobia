import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, BookOpen, Eye, Hand, Ruler, Thermometer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isCoarse, useInputMode } from '@/lib/input'
import { useBandCaps } from '@/lib/bands'
import {
  COPPER_MELT_C,
  FUELS,
  FUEL_ORDER,
  RELIGHT,
  WHYS,
  answerWhy,
  answerWhyText,
  commitPrediction,
  craneLeave,
  craneTip,
  currentStep,
  evalPredicate,
  fallTimes,
  feedFurnace,
  interactables,
  leaveRoom,
  scoreRelight,
  setAir,
  setWorld,
  stampReady,
  useWorld,
  worldStore,
  type CurvePoint,
  type FuelId,
  type Journal,
  type WorldState,
} from '@/lib/archipelago'
import { judgeWhy, TRUST } from '@/lib/whyjudge'
import Ploob2 from '@/components/brand/Ploob2'
import { Tile } from '@/components/ui/tile'
import { control, live } from '../live'

/**
 * The world's HUD, on the layout Selorm drew (2026-09-17): wordmark and zone
 * top-left with the quest checklist under it; a compass minimap top-right;
 * the toolbelt bottom-left (Lens · Probe · Measure · Journal, with keys);
 * Ploob's hint bottom-right; the one verb prompt low-centre. The world fills
 * the frame; nothing here is a dashboard around a game.
 */

export default function WorldHud({ compact }: { compact: boolean }) {
  const s = useWorld()
  const mode = useInputMode()
  const coarse = isCoarse(mode)
  const step = currentStep(s)
  const [note, setNote] = useState<string | null>(null)
  const [seenPour, setSeenPour] = useState(false)
  const [briefed, setBriefed] = useState(false)
  /** After the pour: 0–2 the whys, 3 the stamp, 4 done. */
  const [after, setAfter] = useState(0)
  const [journalOpen, setJournalOpen] = useState(false)

  // Ploob's one-off lines, spoken over the coach line for a moment.
  useEffect(() => {
    const say = (text: string, ms = 3600) => {
      setNote(text)
      window.setTimeout(() => setNote((n) => (n === text ? null : n)), ms)
    }
    const heavy = () => say('Too heavy for you. The crane over the belt can lift it — the post beside the mast drives it.')
    const look = () => say('Look first. Raise the Lens by the furnace and follow the air.')
    window.addEventListener('ploobia:tooheavy', heavy)
    window.addEventListener('ploobia:lookfirst', look)
    // The bet: said when the heavy piece hangs high; settled when both falls are timed.
    let bet = false
    let settled = false
    let firstDrop = false
    const unsub = worldStore.subscribe((w) => {
      if (!bet && w.crane.holding === 'scrap.heavy' && w.crane.hookY > 3.2) {
        bet = true
        say('Bet you that big one falls faster than a small one. Drop it from up there — I will time it.', 6000)
      }
      const h = w.crane.drops['scrap.heavy']
      if (bet && !firstDrop && h && h.t1 != null) {
        firstDrop = true
        say(`${(h.t1 - h.t0).toFixed(2)} s from ${h.from.toFixed(1)} m. Now a small one — same height.`, 6000)
      }
      const ft = fallTimes(w)
      if (ft && !settled) {
        settled = true
        say(
          `Same time! Heavy ${ft.heavy.toFixed(2)} s, light ${ft.light.toFixed(2)} s, from ${ft.from.toFixed(1)} m. In our simulation there is no air — a feather would tell a different story. That one is SkyLab's.`,
          10000,
        )
      }
    })
    return () => {
      window.removeEventListener('ploobia:tooheavy', heavy)
      window.removeEventListener('ploobia:lookfirst', look)
      unsub()
    }
  }, [])

  // J opens the journal anywhere.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (control.journal) {
        control.journal = false
        setJournalOpen((o) => !o)
      }
    }, 80)
    return () => window.clearInterval(id)
  }, [])

  const near = s.near ? interactables.get(s.near) : null
  const verbLabel = s.held ? 'Put it down' : near && near.verb !== 'portal' && near.verb !== 'talk' ? near.label : null
  const showGauge = s.zone === 'foundry' && (s.lit.length > 0 || s.furnace.lit)
  const brief = s.zone === 'foundry' && s.prediction == null && !briefed && s.phase === 'play'
  const inRoom = s.room === 'furnace'
  const driving = s.crane.active
  const afterPour = s.poured && seenPour && after < 4
  const playing = s.phase === 'play'
  const hintText = note ?? step.coach

  return (
    <div className="hud pointer-events-none fixed inset-0 z-20 select-none">
      {/* the System ring cools the world a step so the flows lead */}
      {s.ring === 'system' && <div className="absolute inset-0 bg-[#1B2A3A]/25" data-testid="system-tint" />}

      {/* top-left: wordmark + zone, then the checklist */}
      <div className="absolute top-3 left-3 flex flex-col items-start gap-2">
        <div className="atlas-plate pointer-events-auto flex items-center gap-2 rounded-[16px] px-2.5 py-1.5" data-testid="wordmark">
          <Link to="/" aria-label="Back to the hall" className="grid h-10 w-10 place-items-center rounded-full bg-[#2A2823] text-[#F6F2E8]">
            <ArrowLeft size={16} />
          </Link>
          <div className="leading-tight">
            <span className="block text-[13px] font-black tracking-[0.08em] text-[#2A2823]">
              PL<span className="text-[#E8A33D]">OO</span>BIA
            </span>
            <span className="block text-[11px] font-bold text-[#5F5A4E]">{s.zone === 'landing' ? 'The Landing' : 'The Foundry'}</span>
          </div>
        </div>
        {playing && (
          <div className="atlas-plate pointer-events-auto w-[15.5rem] max-w-[calc(100vw-1.5rem)] rounded-[18px] px-3 py-2" data-testid="quest-plate">
            <p className="text-[13px] leading-tight font-extrabold text-[#2A2823]">{RELIGHT.title}</p>
            {!compact && <Checklist s={s} />}
            {showGauge && <Gauge fuel={s.furnace.fuel} temp={s.furnace.temp} hearths={s.hearths} lit={s.lit} compact={compact} />}
          </div>
        )}
      </div>

      {/* top-right: the compass minimap */}
      {playing && !compact && <Minimap s={s} />}

      {/* bottom-left: the toolbelt */}
      {playing && !inRoom && !driving && (
        <div className="absolute bottom-3 left-3 flex items-end gap-1.5" data-testid="toolbelt">
          <Tool label="Lens" keyHint={coarse ? undefined : 'Q'} active={s.ring === 'system'} testid="lens" onClick={() => (control.lens = true)}>
            <Eye size={18} />
          </Tool>
          <Tool label="Probe" keyHint={coarse ? undefined : 'E'} dim={s.zone !== 'foundry'} testid="probe" onClick={() => (control.interact = true)}>
            <Thermometer size={18} />
          </Tool>
          <Tool label="Measure" locked testid="measure">
            <Ruler size={18} />
          </Tool>
          <Tool label="Journal" keyHint={coarse ? undefined : 'J'} testid="journal" active={journalOpen} onClick={() => setJournalOpen((o) => !o)}>
            <BookOpen size={18} />
          </Tool>
          {coarse && <Stick />}
        </div>
      )}

      {/* low-centre: the one verb, near the thing */}
      {playing && !inRoom && !driving && (
        <div className="absolute inset-x-0 flex justify-center" style={{ bottom: compact ? 16 : 22 }}>
          <Tile
            aria-label={verbLabel ?? 'Nothing near'}
            data-testid="interact"
            disabled={!verbLabel}
            className={cn(
              'pointer-events-auto flex h-11 items-center gap-2 rounded-full bg-[#2A2823]/85 px-4 text-[13px] font-extrabold text-[#F6F2E8] transition-opacity',
              !verbLabel && 'opacity-0',
            )}
            onClick={() => (control.interact = true)}
          >
            {!coarse && <kbd className="rounded bg-[#F6F2E8] px-1.5 py-0.5 text-[11px] font-black text-[#2A2823]">E</kbd>}
            <Hand size={16} />
            {verbLabel ?? 'Nothing near'}
          </Tile>
          {coarse && (
            <Tile
              aria-label="Jump"
              className="pointer-events-auto ml-2 grid h-11 w-11 place-items-center rounded-full bg-[#2A2823]/85 text-[11px] font-extrabold text-[#F6F2E8]"
              onPointerDown={() => (control.jump = true)}
              onPointerUp={() => (control.jump = false)}
            >
              Jump
            </Tile>
          )}
        </div>
      )}

      {/* bottom-right: Ploob's hint */}
      {playing && !brief && !inRoom && !afterPour && (
        <div className="absolute right-3 bottom-3 max-w-[min(24rem,calc(100vw-1.5rem))]">
          <div className="pointer-events-auto flex items-center gap-2.5 rounded-[18px] bg-[#2A2823]/85 px-3 py-2 text-[#F6F2E8]" data-testid="coach">
            <Ploob2 size={compact ? 26 : 34} />
            <p className="text-[12.5px] leading-snug font-extrabold">{hintText}</p>
          </div>
        </div>
      )}

      {/* the crane: key hints while driving */}
      {playing && driving && <CranePanel coarse={coarse} s={s} />}

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
              {coarse ? 'Stick to walk · drag to look · the prompt to act' : 'WASD to walk · drag to look · E to act · Q for the Lens · J for the journal · Space to jump'}
            </p>
            <Tile autoFocus data-testid="play" className="mt-4 w-full rounded-full bg-[#E8A33D] px-5 py-3 text-[15px] font-extrabold text-[#2A2823]" onClick={() => setWorld({ phase: 'play' })}>
              Play
            </Tile>
          </div>
        </div>
      )}

      {/* the brief — the foreman's ask, a number you type */}
      {brief && <Brief onDone={() => setBriefed(true)} />}

      {/* the furnace room — a cabinet interior, entered by a cut */}
      {inRoom && !s.poured && <Room lit={s.lit} hearths={s.hearths} fuel={s.furnace.fuel} air={s.air} pipeFixed={s.pipeFixed} />}

      {/* the pour — the hand-in card, then the three whys, then the stamp */}
      {s.poured && !seenPour && (
        <Pour
          onClose={() => {
            setSeenPour(true)
            leaveRoom()
          }}
        />
      )}
      {afterPour && after < 3 && <WhyCard index={after} onNext={() => setAfter(after + 1)} />}
      {afterPour && after === 3 && <Stamp journal={s.journal} onClose={() => setAfter(4)} />}
      {journalOpen && !afterPour && <Stamp journal={s.journal} onClose={() => setJournalOpen(false)} />}
    </div>
  )
}

function Checklist({ s }: { s: WorldState }) {
  const steps = RELIGHT.steps.filter((st) => st.id !== 'arrive' && st.id !== 'done')
  const idx = RELIGHT.steps.findIndex((st) => st.id === s.step)
  return (
    <ul className="mt-1.5 grid gap-1" data-testid="checklist">
      {steps.map((st) => {
        const i = RELIGHT.steps.findIndex((x) => x.id === st.id)
        const done = i < idx || evalPredicate(st.until, s)
        const current = st.id === s.step
        return (
          <li
            key={st.id}
            className={cn('flex items-center gap-2 text-[11.5px] leading-tight', done ? 'text-[#8B8471] line-through' : current ? 'font-extrabold text-[#2A2823]' : 'text-[#5F5A4E]')}
            data-done={done}
          >
            <span className={cn('grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[4px] border', done ? 'border-[#4E8A3E] bg-[#4E8A3E] text-white' : current ? 'border-[#E8A33D]' : 'border-[#C9BFA8]')}>
              {done && <span className="text-[9px] leading-none">✓</span>}
            </span>
            {st.label}
          </li>
        )
      })}
    </ul>
  )
}

/** The compass: the zone from above, the explorer as the arrow, things you can act on as dots. */
function Minimap({ s }: { s: WorldState }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 250)
    return () => window.clearInterval(id)
  }, [])
  void tick
  const R = 44
  const range = s.zone === 'landing' ? 16 : 14
  const px = (x: number, z: number): [number, number] => [R + (x / range) * (R - 6), R + (z / range) * (R - 6)]
  const [ex, ez] = px(live.pos.x, live.pos.z)
  const items = [...interactables.values()].filter((it) => it.radius > 0)
  const [hx, hz] = s.zone === 'foundry' ? px(...craneTip(s.crane.yaw)) : [0, 0]
  return (
    <div className="absolute top-3 right-3" data-testid="minimap">
      <svg viewBox={`0 0 ${R * 2} ${R * 2}`} width={R * 2} height={R * 2} role="img" aria-label="Map of the zone">
        <circle cx={R} cy={R} r={R - 1} fill="rgba(246,242,232,0.92)" stroke="#D9CFBC" />
        <circle cx={R} cy={R} r={R - 7} fill="none" stroke="#E3D8BF" strokeDasharray="2 3" />
        {items.map((it) => {
          const [x, z] = px(it.pos[0], it.pos[2])
          const c = it.verb === 'portal' ? '#E8A33D' : it.verb === 'grab' ? '#B5652E' : it.verb === 'probe' ? '#C8552E' : '#2F7F7A'
          return <circle key={it.id} cx={x} cy={z} r={it.id === s.near ? 3.2 : 2} fill={c} />
        })}
        {s.zone === 'foundry' && <circle cx={hx} cy={hz} r={1.6} fill="none" stroke="#4A5E7A" />}
        <g transform={`translate(${ex} ${ez}) rotate(${(-live.facing * 180) / Math.PI + 180})`}>
          <path d="M0 -5 L4 4 L0 2 L-4 4 Z" fill="#2A2823" />
        </g>
        <text x={R} y={9} textAnchor="middle" fontSize={7} fontWeight={800} fill="#8A5A0E">
          N
        </text>
      </svg>
    </div>
  )
}

function Tool({
  label,
  keyHint,
  active,
  dim,
  locked,
  testid,
  onClick,
  children,
}: {
  label: string
  keyHint?: string
  active?: boolean
  dim?: boolean
  locked?: boolean
  testid: string
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <Tile
      aria-label={label}
      data-testid={testid}
      disabled={locked}
      className={cn(
        'pointer-events-auto flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-[14px] bg-[#2A2823]/85 text-[#F6F2E8]',
        active && 'ring-2 ring-[#E8A33D]',
        (dim || locked) && 'opacity-45',
      )}
      onClick={onClick}
    >
      {children}
      <span className="text-[9px] leading-none font-extrabold">{label}</span>
      {keyHint && <kbd className="rounded bg-[#F6F2E8] px-1 text-[8px] leading-[12px] font-black text-[#2A2823]">{keyHint}</kbd>}
    </Tile>
  )
}

function Key({ k, label }: { k: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#F6F2E8]">
      <kbd className="rounded bg-[#F6F2E8] px-1.5 py-0.5 text-[10px] font-black text-[#2A2823]">{k}</kbd>
      {label}
    </span>
  )
}

function CranePanel({ coarse, s }: { coarse: boolean; s: WorldState }) {
  const holding = s.crane.holding
  return (
    <div className="absolute inset-x-0 bottom-3 flex items-end justify-center gap-2 px-3" data-testid="crane-panel">
      {coarse && <Stick />}
      <div className="pointer-events-auto rounded-[18px] bg-[#2A2823]/85 px-4 py-2.5">
        <span className="block text-[10px] font-extrabold tracking-[0.1em] text-[#E8A33D] uppercase">The crane · hook at {s.crane.hookY.toFixed(1)} m</span>
        {!coarse ? (
          <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
            <Key k="W" label="Raise" />
            <Key k="S" label="Lower" />
            <Key k="A" label="Rotate left" />
            <Key k="D" label="Rotate right" />
            <Key k="E" label={holding ? 'Release' : 'Take'} />
            <Key k="Esc" label="Step down" />
          </div>
        ) : (
          <p className="mt-1 text-[11px] font-bold text-[#F6F2E8]">Stick up/down raises · left/right swings</p>
        )}
      </div>
      <Tile data-testid="crane-take" className="pointer-events-auto h-11 rounded-full bg-[#E8A33D] px-4 text-[13px] font-extrabold text-[#2A2823]" onClick={() => (control.interact = true)}>
        {holding ? 'Release' : 'Take'}
      </Tile>
      <Tile data-testid="crane-leave" className="pointer-events-auto h-11 rounded-full bg-[#F6F2E8] px-4 text-[13px] font-extrabold text-[#2A2823]" onClick={craneLeave}>
        Step down
      </Tile>
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
        <p className="mt-1 text-[14px] leading-snug font-semibold text-[#2A2823]">“It went cold in the night. Forty bells due Friday. I have fed it everything and nothing.”</p>
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
    commitPrediction(n)
    onDone()
  }
}

/** The furnace room's controls: what to burn, and how hard to work the bellows. */
function Room({ lit, hearths, fuel, air, pipeFixed }: { lit: FuelId[]; hearths: Record<FuelId, number>; fuel: FuelId | null; air: number; pipeFixed: boolean }) {
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex justify-center p-3">
      <div className="atlas-plate w-full max-w-[30rem] rounded-[20px] px-4 py-3" data-testid="room">
        <div className="flex items-baseline justify-between">
          <span className="atlas-eyebrow">Inside the furnace</span>
          <Tile className="rounded-full px-3 py-1 text-[11px] font-extrabold text-[#8B8471]" data-testid="step-out" onClick={leaveRoom}>
            Step out
          </Tile>
        </div>
        <p className="mt-1 text-[12px] font-semibold text-[#5F5A4E]">What goes on the bed, and how hard you work the bellows. The gauge only knows what you read.</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {FUEL_ORDER.map((f) => {
            const read = lit.includes(f)
            const on = fuel === f
            return (
              <Tile key={f} data-testid={`feed-${f}`} aria-pressed={on} className={cn('rounded-[14px] px-2 py-2 text-left', on ? 'bg-[#E8A33D]' : 'bg-[#FBEBD2]')} onClick={() => feedFurnace(f)}>
                <span className="block text-[12px] font-extrabold text-[#2A2823]">{FUELS[f].name}</span>
                <span className="block text-[11px] tabular-nums text-[#5F5A4E]">{read ? `${Math.round(hearths[f])} °C` : 'not read'}</span>
              </Tile>
            )
          })}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <label htmlFor="world-air" className="atlas-eyebrow whitespace-nowrap">
            Bellows
          </label>
          <input
            id="world-air"
            data-testid="air"
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(air * 100)}
            onChange={(e) => setAir(Number(e.target.value) / 100)}
            className="h-2 w-full accent-[#2F7F7A]"
            aria-label="Bellows stroke"
          />
          <span className="w-12 text-right text-[12px] font-extrabold tabular-nums text-[#2A2823]">{Math.round(air * 100)}%</span>
        </div>
        <p className="mt-1 text-[10px] text-[#8B8471]">{pipeFixed ? 'The pipe is whole: what you pump arrives.' : 'The pipe is split: most of what you pump leaves before the fire.'}</p>
      </div>
    </div>
  )
}

function Pour({ onClose }: { onClose: () => void }) {
  const s = useWorld()
  const sc = scoreRelight(s)
  const t = useRef<number | null>(null)
  useEffect(() => {
    t.current = window.setTimeout(onClose, 14000)
    return () => {
      if (t.current) window.clearTimeout(t.current)
    }
  }, [onClose])
  return (
    <div className="pointer-events-auto absolute inset-x-0 top-14 flex justify-center px-3">
      <div className="atlas-plate atlas-arrive w-full max-w-[26rem] rounded-[22px] px-5 py-4" data-testid="pour-card">
        <span className="atlas-eyebrow block">The pour · copper melted</span>
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
        <Curve points={s.curve} />
        <p className="mt-2 text-[11px] text-[#8B8471]">Step out. Then walk back through the gate and look across the water.</p>
        <Tile className="mt-2 rounded-full bg-[#E8A33D] px-4 py-2 text-[12px] font-extrabold text-[#2A2823]" onClick={onClose}>
          Step out
        </Tile>
      </div>
    </div>
  )
}

/** Temperature against time — the result comes to the learner, drawn as a length. */
function Curve({ points }: { points: CurvePoint[] }) {
  if (points.length < 2) return null
  const W = 320
  const H = 90
  const tMax = Math.max(10, points[points.length - 1][0])
  const yMax = Math.max(COPPER_MELT_C + 200, ...points.map((p) => p[1]))
  const x = (t: number) => 28 + (t / tMax) * (W - 36)
  const y = (v: number) => H - 14 - (v / yMax) * (H - 22)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label="Furnace temperature against time" data-testid="curve">
      <line x1={x(0)} x2={W - 8} y1={y(COPPER_MELT_C)} y2={y(COPPER_MELT_C)} stroke="#C8552E" strokeDasharray="3 3" strokeWidth={1} />
      <text x={W - 8} y={y(COPPER_MELT_C) - 3} textAnchor="end" fontSize={8} fill="#C8552E" fontWeight={800}>
        copper melts · {COPPER_MELT_C} °C
      </text>
      <line x1={x(0)} x2={x(0)} y1={8} y2={H - 14} stroke="#D9CFBC" strokeWidth={1} />
      <line x1={x(0)} x2={W - 8} y1={H - 14} y2={H - 14} stroke="#D9CFBC" strokeWidth={1} />
      <path d={d} fill="none" stroke="#E8A33D" strokeWidth={2.2} strokeLinejoin="round" />
      <text x={x(0) - 4} y={12} textAnchor="end" fontSize={8} fill="#8B8471">
        {Math.round(yMax)}°
      </text>
      <text x={W - 8} y={H - 3} textAnchor="end" fontSize={8} fill="#8B8471">
        {Math.round(tMax)} s
      </text>
    </svg>
  )
}

/**
 * One why. An Explorer picks from three; an Investigator or Engineer writes
 * it in their own words first, and a typed judge decides — right, partial,
 * a named misconception, or off — with Ploob's line always coming from the
 * quest's own data. No judge (offline, no key, slow): the three options.
 */
function WhyCard({ index, onNext }: { index: number; onNext: () => void }) {
  const s = useWorld()
  const caps = useBandCaps()
  const why = WHYS[index]
  const chosen = s.whys[index]
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [nudge, setNudge] = useState<string | null>(null)
  const [tries, setTries] = useState(0)
  const [fallback, setFallback] = useState(false)
  const ownWords = caps.conclusion && !fallback && chosen < 0
  const line = chosen >= 0 ? why.options[chosen].line : null

  async function say() {
    if (busy || text.trim().length < 3) return
    setBusy(true)
    const j = await judgeWhy(index, text)
    setBusy(false)
    if (!j) {
      // No judge: the written options, silently. The world owes nobody a server.
      setFallback(true)
      return
    }
    const trusted = j.confidence >= TRUST
    if (j.verdict === 'right' && trusted) {
      answerWhyText(index, text, 'right', null)
      return
    }
    if (j.verdict === 'misconception' && trusted && j.misconception) {
      answerWhyText(index, text, 'misconception', j.misconception)
      return
    }
    // Partial, off, or not trusted: one nudge and another go; then the options.
    if (tries === 0) {
      setTries(1)
      setNudge(j.verdict === 'off' ? 'Say what you think CAUSED it, not what you did. What changed in the world?' : PARTIAL_NUDGE[index])
      return
    }
    setFallback(true)
  }

  return (
    <div className="pointer-events-auto absolute inset-x-0 top-14 flex justify-center px-3">
      <div className="atlas-plate atlas-arrive w-full max-w-[28rem] rounded-[22px] px-5 py-4" data-testid={`why-${index}`}>
        <span className="atlas-eyebrow block">{['What happened?', 'Something strange', 'Three days later'][index]}</span>
        <p className="mt-1 text-[14px] leading-snug font-extrabold text-[#2A2823]">{why.ask}</p>

        {ownWords && (
          <div className="mt-2" data-testid="own-words">
            <textarea
              id={`world-why-${index}`}
              data-testid="why-text"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 600))}
              rows={3}
              placeholder="In your own words…"
              aria-label={why.ask}
              className="w-full resize-none rounded-xl border border-[#D9CFBC] bg-white px-3 py-2 text-[13px] font-semibold text-[#2A2823] outline-none focus:border-[#E8A33D]"
            />
            {nudge && (
              <div className="mt-1.5 flex items-start gap-2">
                <Ploob2 size={22} />
                <p className="text-[12px] leading-snug font-extrabold text-[#2A2823]" data-testid="why-nudge">
                  {nudge}
                </p>
              </div>
            )}
            <div className="mt-1.5 flex items-center justify-between">
              <Tile className="text-[11px] font-bold text-[#8B8471]" data-testid="why-pick" onClick={() => setFallback(true)}>
                Pick from three instead
              </Tile>
              <Tile
                data-testid="why-say"
                disabled={busy || text.trim().length < 3}
                className={cn('rounded-full bg-[#E8A33D] px-4 py-2 text-[12px] font-extrabold text-[#2A2823]', (busy || text.trim().length < 3) && 'opacity-40')}
                onClick={say}
              >
                {busy ? 'Ploob is thinking…' : 'Say it'}
              </Tile>
            </div>
          </div>
        )}

        {!ownWords && chosen < 0 && (
          <div className="mt-2 grid gap-1.5">
            {why.options.map((o, i) => (
              <Tile key={i} data-testid={`why-${index}-${i}`} className="rounded-[14px] bg-[#FBEBD2] px-3 py-2 text-left text-[12.5px] font-semibold text-[#2A2823]" onClick={() => answerWhy(index, i)}>
                {o.text}
              </Tile>
            ))}
          </div>
        )}

        {chosen >= 0 && (
          <div className="mt-2 grid gap-1.5">
            {why.options.map((o, i) => (
              <div key={i} className={cn('rounded-[14px] px-3 py-2 text-[12.5px] font-semibold text-[#2A2823]', i === chosen ? (o.right ? 'bg-[#DDEBD9]' : 'bg-[#F6DEDC]') : 'bg-[#EEE7D8] opacity-60')}>
                {i === chosen && text.trim() && o.right ? `“${text.trim()}”` : o.text}
              </div>
            ))}
          </div>
        )}
        {line && (
          <div className="mt-2 flex items-start gap-2">
            <Ploob2 size={26} />
            <p className="text-[12px] leading-snug font-extrabold text-[#2A2823]" data-testid="why-line">
              {line}
            </p>
          </div>
        )}
        {chosen >= 0 && (
          <Tile className="mt-2 rounded-full bg-[#E8A33D] px-4 py-2 text-[12px] font-extrabold text-[#2A2823]" data-testid="why-next" onClick={onNext}>
            {index < 2 ? 'Next' : 'To the journal'}
          </Tile>
        )}
      </div>
    </div>
  )
}

/** The nudge for a partial answer: a question back, pointing at the mechanism. */
const PARTIAL_NUDGE = [
  'Nearly. WHAT reached the fire that was not reaching it before?',
  'You are near it. What is the wet wood heavy WITH — and what has to happen to that before the wood can burn?',
  'Closer. Bronze is not one metal. What is the second one, and where would you work out how much?',
]

/** The four-line record. A stamp needs prediction · action · observed · explanation. */
function Stamp({ journal, onClose }: { journal: Journal; onClose: () => void }) {
  const s = useWorld()
  const ready = stampReady(journal)
  const ft = fallTimes(s)
  const rows: [string, string | null][] = [
    ['Prediction', journal.prediction],
    ['Action', journal.action],
    ['Observed', journal.observed],
    ['Explanation', journal.explanation],
  ]
  return (
    <div className="pointer-events-auto absolute inset-x-0 top-14 flex justify-center px-3">
      <div className="atlas-plate atlas-arrive w-full max-w-[28rem] rounded-[22px] px-5 py-4" data-testid="stamp">
        <span className="atlas-eyebrow block">Field journal · Relight the furnace</span>
        <div className="mt-2 grid gap-1.5">
          {rows.map(([k, v]) => (
            <div key={k} className={cn('rounded-[12px] px-3 py-1.5', v ? 'bg-[#FBEBD2]' : 'bg-[#EEE7D8]')}>
              <span className="block text-[9px] font-extrabold tracking-wide text-[#8A5A0E] uppercase">{k}</span>
              <span className={cn('block text-[12px] font-semibold', v ? 'text-[#2A2823]' : 'text-[#8B8471]')}>{v ?? 'not yet earned — "eventually got the number" is not evidence'}</span>
            </div>
          ))}
          {ft && (
            <div className="rounded-[12px] bg-[#E3ECF8] px-3 py-1.5" data-testid="drop-record">
              <span className="block text-[9px] font-extrabold tracking-wide text-[#2F4F7A] uppercase">Side note · the crane</span>
              <span className="block text-[12px] font-semibold text-[#2A2823]">
                Heavy piece fell {ft.from.toFixed(1)} m in {ft.heavy.toFixed(2)} s; a light one in {ft.light.toFixed(2)} s. In our simulation there is no air.
              </span>
            </div>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className={cn('atlas-collected text-[12px]', !ready && 'opacity-40')} data-testid="stamp-state">
            {ready ? 'STAMPED' : 'not stamped'}
          </span>
          <Tile className="rounded-full bg-[#E8A33D] px-4 py-2 text-[12px] font-extrabold text-[#2A2823]" onClick={onClose}>
            Close
          </Tile>
        </div>
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
      className="pointer-events-auto ml-2 h-[7.5rem] w-[7.5rem] touch-none rounded-full border-2 border-[#2A2823]/15 bg-[#FBF5EA]/60"
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
      <div className="relative h-full w-full">
        <div className="absolute top-1/2 left-1/2 h-12 w-12 rounded-full bg-[#E8A33D] shadow" style={{ transform: `translate(calc(-50% + ${knob[0]}px), calc(-50% + ${knob[1]}px))` }} />
      </div>
    </div>
  )
}
