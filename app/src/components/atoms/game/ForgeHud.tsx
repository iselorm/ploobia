import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, Check, Copy, Flag, FlaskConical, Grid2x2, Lock, PanelBottom, PanelLeft, PanelRight, Play, RotateCcw, Send, Share2, Users, X } from 'lucide-react'
import { Tile } from '@/components/ui/tile'
import Ploob2 from '@/components/brand/Ploob2'
import { cn } from '@/lib/utils'
import { BAND_META, type Band } from '@/lib/bands'
import { ELEMENT_BY_Z, CATEGORY_META } from '@/lib/atoms'
import type { ChallengeScore, ResourceBudget } from '@/lib/challenge'
import {
  DOORS,
  fmtCharge,
  gaugeFor,
  identityOf,
  cleanNickname,
  NICKNAME_MAX,
  nuclide,
  stabilityWord,
  type Bench,
  type Build,
  type Door,
  type Gauge,
  type Kind,
  type Level,
  type ShareCard,
} from '@/lib/foundry'
import { doorState, nextDoor, useFoundryCampaign, type DoorState } from '@/lib/foundrycampaign'
import { AtlasButton, Chip, Dial } from '@/components/sugar/hud/AtlasKit'
import { drawShareCard } from './shareCard'
import type { CoachDock } from './coachDock'

/**
 * The Foundry Game's HUD — the storyboard "Foundry Way In", frame by frame.
 *
 * Every piece here is a plate on the merged three-column look: Elements on
 * the left, Our Space on the right, the bench between them with one target
 * plate, one bottom toolbar and Ploob's line. Nothing is behind a tab; the
 * target and the reading share one gauge; the coach is on in every phase.
 */

const TEAL = '#1F6F73'
const KIND_COLOR: Record<Kind, string> = { proton: '#E8A33D', neutron: '#9AA4B2', electron: '#63E0FF' }
const KIND_GLYPH: Record<Kind, string> = { proton: 'p⁺', neutron: 'n⁰', electron: 'e⁻' }
const KIND_NAME: Record<Kind, string> = { proton: 'Proton', neutron: 'Neutron', electron: 'Electron' }

/* ------------------------------------------------------------------ */
/* Top bar                                                             */
/* ------------------------------------------------------------------ */

export function TopBar({
  tab,
  onTab,
  band,
  compact,
  presence,
  left,
}: {
  tab: 'wall' | 'bench' | 'space'
  onTab: (t: 'wall' | 'bench' | 'space') => void
  band: Band
  compact: boolean
  /** How many are in the room — 1 when alone. */
  presence: number
  left?: ReactNode
}) {
  const meta = BAND_META[band]
  const tabs: Array<{ id: 'wall' | 'bench' | 'space'; label: string; icon: ReactNode }> = [
    { id: 'wall', label: 'The Wall', icon: <Grid2x2 className="h-4 w-4" /> },
    { id: 'bench', label: 'My Bench', icon: <FlaskConical className="h-4 w-4" /> },
    { id: 'space', label: 'Our Space', icon: <Users className="h-4 w-4" /> },
  ]
  return (
    <div className="pointer-events-auto flex items-center justify-between gap-2" data-testid="topbar">
      <div className="flex items-center gap-2">
        {left}
        <div className="flex items-center gap-2 pl-1">
          <Ploob2 size={compact ? 22 : 28} />
          {!compact && <span className="atlas-serif text-[20px] leading-none font-semibold text-[#2A2823]">The Foundry</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 rounded-full border border-[#E9E2D1] bg-[#FCFAF4]/90 p-1 backdrop-blur-md" role="tablist" aria-label="Places">
        {tabs.map((t) => (
          <Tile
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            aria-label={t.label}
            onClick={() => onTab(t.id)}
            className={cn(
              'flex items-center gap-2 rounded-full px-3 py-2 text-[13px] font-extrabold transition-all active:scale-95',
              tab === t.id ? 'text-[#FBF8EF]' : 'text-[#5A5445] hover:bg-[#F1ECDE]',
            )}
            style={tab === t.id ? { background: TEAL } : undefined}
          >
            {t.icon}
            {(!compact || tab === t.id) && <span>{compact ? t.label.replace(/^(The |My |Our )/, '') : t.label}</span>}
          </Tile>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="atlas-chip hidden sm:inline-flex" title="Who is in the room">
          <Users className="h-3 w-3" /> {presence === 1 ? 'just you' : `${presence} together`}
        </span>
        <span className="atlas-chip" style={{ borderColor: meta.tint, color: meta.tint }}>
          {meta.label}
          {!compact && ` · ${meta.ages}`}
        </span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Welcome — Play first                                                */
/* ------------------------------------------------------------------ */

const STATE_LABEL: Record<DoorState, string> = {
  done: 'handed in',
  open: 'open',
  shut: 'shut',
  undiscovered: 'not yet discovered',
}

export function DoorMap({ onEnter, onShut }: { onEnter: (door: Door) => void; onShut: (why: string) => void }) {
  useFoundryCampaign()
  return (
    <div className="mt-4" data-testid="door-map">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="atlas-eyebrow">Five doors</span>
        <span className="text-[9.5px] font-extrabold text-[#8B8471]">one hand-in opens the next</span>
      </div>
      <div className="mt-1.5 grid grid-cols-5 gap-1.5">
        {DOORS.map((d) => {
          const state = doorState(d)
          const enterable = state === 'open' || state === 'done'
          return (
            <Tile
              key={d.id}
              data-testid={`door-${d.id}`}
              data-state={state}
              aria-label={`${d.name}, ${STATE_LABEL[state]}`}
              onClick={() => {
                if (enterable) onEnter(d)
                else if (state === 'shut') onShut(`Hand in any level of door ${d.id - 1} to open ${d.name}.`)
                else onShut(`${d.name} is shut. Nobody has discovered what is behind it yet.`)
              }}
              className={cn(
                'relative flex flex-col items-center rounded-[12px] border px-1 py-1.5 text-center transition-all active:scale-[0.98]',
                state === 'done' && 'border-[#3E7C43] bg-[#E7F1E3]',
                state === 'open' && 'atlas-invite border-[#2F6134] bg-[#FCFAF4]',
                state === 'shut' && 'border-[#E4DCC9] bg-[#F6F2E8]',
                state === 'undiscovered' && 'border-dashed border-[#D8D0BC] bg-[#F6F2E8]/60 opacity-75',
              )}
            >
              {d.id === 2 && (
                <span className="absolute -top-1.5 right-0.5 rotate-6 rounded border border-[#B9A98A] bg-[#F3EEE3] px-1 text-[8px] font-black text-[#5A5445]" aria-hidden>
                  NaCl
                </span>
              )}
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black',
                  state === 'done' && 'bg-[#2F6134] text-[#FBF8EF]',
                  state === 'open' && 'bg-[#E7F1E3] text-[#2F6134]',
                  state === 'shut' && 'bg-[#EAE4D4] text-[#8B8471]',
                  state === 'undiscovered' && 'bg-transparent text-[#B9B09A]',
                )}
              >
                {state === 'done' ? <Check className="h-3 w-3" /> : state === 'shut' ? <Lock className="h-2.5 w-2.5" /> : d.id}
              </span>
              <span className={cn('atlas-serif mt-1 block text-[10.5px] leading-tight font-semibold', enterable ? 'text-[#2A2823]' : 'text-[#8B8471]')}>
                {d.name.replace(/^The /, '')}
              </span>
              <span className="mt-0.5 block text-[8.5px] leading-tight font-bold text-[#8B8471]">{d.game}</span>
            </Tile>
          )
        })}
      </div>
    </div>
  )
}

export function ForgeWelcome({
  level,
  incoming,
  onPlay,
  onExplore,
}: {
  /** The level Play opens: the band's, or the incoming challenge's. */
  level: Level
  /** A challenge that arrived by link — offered first. */
  incoming: { by?: string; title: string } | null
  onPlay: () => void
  onExplore: () => void
}) {
  const [shutNote, setShutNote] = useState<string | null>(null)
  const door = nextDoor()
  return (
    <div data-focus-layer="" className="fixed inset-0 z-40 flex items-center justify-center bg-[#F6F2E8]/82 p-4 backdrop-blur-[3px]">
      <div className="atlas-plate welcome-pop w-full max-w-[30rem] p-6 text-center">
        <div className="flex items-center justify-center gap-3">
          <Ploob2 size={44} />
          <div className="text-left">
            <span className="atlas-eyebrow">Chemistry · Build an atom</span>
            <h1 className="atlas-serif text-[32px] leading-none font-semibold text-[#2A2823]">The Foundry</h1>
          </div>
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed font-semibold text-[#5F5A4E]">
          Five doors. Behind the second one is the salt in your jollof. Every door opens with one hand-in — and the bench is yours whenever you want it.
        </p>

        {incoming && (
          <div className="mt-3 rounded-[12px] border border-[#C8DFC2] bg-[#E7F1E3] px-3 py-2 text-left" data-testid="incoming">
            <span className="atlas-eyebrow">{incoming.by ? `${incoming.by} sent you a challenge` : 'A challenge arrived'}</span>
            <p className="text-[12.5px] font-black text-[#2A2823]">{incoming.title}</p>
            <p className="text-[10.5px] font-bold text-[#8B8471]">Same seed, same catch. Play it, then send yours back.</p>
          </div>
        )}
        <DoorMap onEnter={() => onPlay()} onShut={setShutNote} />
        {shutNote && (
          <p data-testid="door-note" className="mt-1.5 text-[11px] leading-snug font-bold text-[#8B8471]">
            {shutNote}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <Tile
            onClick={onPlay}
            aria-label="Play"
            data-testid="play"
            className="atlas-invite flex items-center justify-center gap-2 rounded-full bg-[#2F6134] px-6 py-3 text-[14px] font-extrabold text-[#FBF8EF] shadow transition-all hover:bg-[#24512A] active:scale-95"
          >
            <Play className="h-4 w-4" />
            {incoming ? `Play — ${incoming.by ? `${incoming.by}'s challenge` : 'the challenge you were sent'}` : `Play — ${level.title}`}
          </Tile>
          <Tile
            onClick={onExplore}
            aria-label="Explore the Foundry on your own"
            className="flex items-center justify-center gap-2 rounded-full border border-[#E4DCC9] bg-[#FCFAF4] px-5 py-2.5 text-[13px] font-extrabold text-[#5F5A4E] transition-all hover:bg-[#F1ECDE] active:scale-95"
          >
            <FlaskConical className="h-4 w-4" />
            Explore the Foundry on your own
          </Tile>
          <span className="text-[10.5px] font-bold text-[#8B8471]">
            Door {door.id} · {door.name} · {door.game}
          </span>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Brief — the guess                                                   */
/* ------------------------------------------------------------------ */

export function ForgeBrief({ level, onCommit, onClose }: { level: Level; onCommit: (guess: number) => void; onClose: () => void }) {
  const g = level.guess
  const [value, setValue] = useState(Math.round((g.min + g.max) / 2))
  return (
    <div data-focus-layer="" className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[#2A2823]/35 p-3 backdrop-blur-[2px]">
      <div className="atlas-plate atlas-arrive w-full max-w-md p-5" data-testid="brief">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="atlas-eyebrow">Door {level.door} · The Forge · Level {level.tier}</span>
            <h2 className="atlas-serif text-[22px] leading-tight font-semibold text-[#2A2823]">{level.title}</h2>
          </div>
          <Tile onClick={onClose} aria-label="Close" className="rounded-full px-2 text-[15px] font-bold text-[#B9B09A] hover:text-[#4A4438]">
            <X className="h-4 w-4" />
          </Tile>
        </div>
        <p className="mt-1.5 text-[12px] leading-relaxed font-semibold text-[#8B8471]">{level.blurb}</p>
        <div className="atlas-rule my-3" />
        <p className="text-[13px] leading-snug font-extrabold text-[#2A2823]">{g.question}</p>
        <div className="mt-3">
          <Dial label="Your guess" value={value} display={`${value} ${g.unit}`} min={g.min} max={g.max} step={1} color="#D99B2B" onChange={(v) => setValue(Math.round(v))} />
        </div>
        <AtlasButton tone="primary" invite className="mt-4 w-full py-2.5 text-[13px]" onClick={() => onCommit(value)} ariaLabel="Commit">
          Commit {value} — then Ploob answers
        </AtlasButton>
        <p className="mt-2 text-center text-[10.5px] font-bold text-[#8B8471]">Explorers skip this card. Your guess is kept as a prediction, not a mark.</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The beat                                                            */
/* ------------------------------------------------------------------ */

export function ForgeBeat({ count }: { count: number }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center">
      <div className="atlas-plate flex h-36 w-36 flex-col items-center justify-center rounded-full border-4 border-[#D99B2B]" data-testid="beat">
        <span className="atlas-serif text-[64px] leading-none font-semibold text-[#2A2823]">{count}</span>
        <span className="atlas-eyebrow">get ready</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The gauge                                                           */
/* ------------------------------------------------------------------ */

export function ForgeGauge({
  level,
  build,
  bench,
  trials,
  gather,
  compact,
}: {
  level: Level
  build: Build
  /** Door 2's two pads and the prediction, when this is a bench level. */
  bench?: Bench
  trials: number
  /** Seconds left in the catch, or null outside the gather round. */
  gather: { left: number; total: number } | null
  compact: boolean
}) {
  const g: Gauge = useMemo(() => gaugeFor(level, build, bench), [level, build, bench])
  return (
    <div
      className={cn(
        'atlas-plate pointer-events-auto flex max-w-full min-w-0 items-center gap-x-3 gap-y-1.5 px-3 py-2',
        // Wrapping is for the narrow columns only. On the desktop the row fits
        // and wrapping it just made the plate twice as tall for nothing.
        compact && 'flex-wrap',
      )}
      data-testid="gauge"
      data-met={g.met}
      data-of={g.of}
      data-hit={g.hit ? 'true' : 'false'}
    >
      {/* the title is the part that gives way when the column is tight: the
          numbers a learner is reading are never the thing that truncates */}
      <div className="flex min-w-0 shrink flex-col">
        <span className="atlas-eyebrow truncate">Target · Door {level.door} · Level {level.tier}</span>
        <span className="truncate text-[12.5px] font-black text-[#2A2823]">{gather ? 'Catch what falls' : level.title}</span>
        {!compact && <span className="text-[10.5px] font-bold text-[#8B8471]">≈ 0.1 nm, enlarged</span>}
      </div>
      <div className="atlas-rule hidden h-9 w-px sm:block" />
      {/* The cells wrap rather than being overrun. They were shrink-0 inside a
          row that could not fit them, so on a 1024 tablet the "to go" chip sat
          on top of the mass-number cell — the two numbers a learner is reading
          in the same square inch. A second line costs nothing. */}
      <div className={cn('flex items-center gap-x-3 gap-y-1.5', compact && 'flex-wrap')}>
        {g.cells.map((c) => (
          <div key={c.id} className={cn('flex shrink-0 flex-col gap-0.5', compact ? 'w-[5.3rem]' : 'w-[6.4rem]')} data-testid={`cell-${c.id}`} data-met={c.met ? 'true' : 'false'}>
            <div className="flex items-baseline justify-between gap-1">
              <span className="truncate text-[10.5px] font-extrabold text-[#8B8471]">{c.label}</span>
              {c.met ? (
                <Chip tone="good">
                  <Check className="h-2.5 w-2.5" />
                </Chip>
              ) : null}
            </div>
            <span className={cn('text-[18px] leading-none font-black tabular-nums', c.met ? 'text-[#2F6134]' : 'text-[#8A5410]')}>
              {c.value}
              <span className="ml-1 text-[10px] font-extrabold text-[#8B8471]">{c.want}</span>
            </span>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#EDE6D6]">
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: c.met ? '100%' : '35%', background: c.met ? '#3E7C43' : '#D99B2B' }} />
            </div>
            {!compact && <span className="truncate text-[9.5px] font-bold text-[#8A5410]">{c.met ? '' : c.todo}</span>}
          </div>
        ))}
      </div>
      <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
        {gather ? (
          <>
            <Chip tone="sugar">catching · {Math.ceil(gather.left)} s left</Chip>
            {!compact && <span className="text-[9.5px] font-bold text-[#8B8471]">a catch, not a countdown</span>}
          </>
        ) : (
          <>
            <Chip tone={g.hit ? 'good' : 'neutral'}>{g.hit ? 'all met · hand in' : `${g.of - g.met} to go`}</Chip>
            {/* the trial counter is a nicety and the score card says it again;
                on a narrow column it is what pushed the numbers out of view */}
            {!compact && <Chip>trial {trials} · score at hand-in</Chip>}
          </>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The tray                                                            */
/* ------------------------------------------------------------------ */

export function ForgeTray({
  bank,
  spent,
  aim,
  canUndo,
  canRedo,
  hit,
  free,
  compact,
  onAdd,
  onRemove,
  onUndo,
  onRedo,
  onReset,
  onSend,
  onHandIn,
}: {
  bank: ResourceBudget | null
  spent: ResourceBudget
  aim: Kind | 'hand' | null
  canUndo: boolean
  canRedo: boolean
  hit: boolean
  /** The free bench: no target, no bank, no hand-in. */
  free: boolean
  compact: boolean
  onAdd: (k: Kind) => void
  onRemove: (k: Kind) => void
  onUndo: () => void
  onRedo: () => void
  onReset: () => void
  onSend: () => void
  onHandIn: () => void
}) {
  const kinds: Kind[] = ['proton', 'neutron', 'electron']
  // The tray wraps. On a 1024-wide tablet the row was wider than the middle
  // column and "Hand in" — the one control the whole round is aiming at — went
  // off the edge of the screen. Wrapping keeps every control at full size and
  // under the finger; a second line is a much smaller price than a button a
  // learner cannot reach.
  return (
    <div
      className={cn(
        'atlas-plate pointer-events-auto flex items-center justify-between gap-2 px-2 py-1.5 sm:px-3',
        compact && 'flex-wrap',
      )}
      data-testid="tray"
    >
      <div className="flex items-center gap-0.5">
        <Tool label="Undo" icon={<RotateCcw className="h-4 w-4" />} onClick={onUndo} disabled={!canUndo} />
        {!compact && <Tool label="Redo" icon={<RotateCcw className="h-4 w-4 -scale-x-100" />} onClick={onRedo} disabled={!canRedo} />}
        {!compact && <Tool label="Reset" icon={<X className="h-4 w-4" />} onClick={onReset} />}
      </div>
      <div className="atlas-rule hidden h-10 w-px sm:block" />
      <div className={cn('flex items-center gap-2', compact && 'flex-wrap')} data-testid="parts">
        {kinds.map((k) => {
          const left = bank ? Math.max(0, (bank[k] ?? 0) - (spent[k] ?? 0)) : null
          const none = left !== null && left <= 0
          return (
            <div key={k} className={cn('relative flex items-center gap-0.5 rounded-[14px] border p-0.5', aim === k ? 'atlas-aim border-[#D99B2B]' : 'border-[#E4DCC9]')} data-testid={`part-${k}`} data-left={left ?? ''}>
              <Tile
                onClick={() => onRemove(k)}
                aria-label={`Take a ${k} away`}
                className="flex h-11 w-9 items-center justify-center rounded-l-[12px] text-[18px] font-black text-[#5A5445] hover:bg-[#F1ECDE] active:scale-95"
              >
                −
              </Tile>
              <div className="flex h-11 min-w-[3.2rem] flex-col items-center justify-center">
                <span className="h-5 w-5 rounded-full" style={{ background: `radial-gradient(circle at 35% 30%, #fff, ${KIND_COLOR[k]} 50%, rgba(0,0,0,0.45))` }} aria-hidden />
                <span className="text-[10.5px] font-black text-[#2A2823]">{compact ? KIND_GLYPH[k] : `${KIND_NAME[k]} ${KIND_GLYPH[k]}`}</span>
              </div>
              <Tile
                onClick={() => onAdd(k)}
                disabled={none}
                aria-label={`Add a ${k}`}
                className="flex h-11 w-9 items-center justify-center rounded-r-[12px] text-[18px] font-black text-[#5A5445] hover:bg-[#F1ECDE] active:scale-95 disabled:opacity-40"
              >
                +
              </Tile>
              {left !== null && (
                <span
                  className="absolute -top-2 -right-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-black text-[#FBF8EF]"
                  style={{ background: none ? '#9A9288' : TEAL }}
                  title={`${left} left in the hopper`}
                >
                  {left}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <div className="atlas-rule h-10 w-px" />
      <div className="flex items-center gap-2">
        {!free && (
          <AtlasButton onClick={onSend} ariaLabel="Send to a friend" className={cn('py-2', compact && 'w-11 px-0')}>
            <Send className="h-4 w-4" />
            {!compact && 'Send'}
          </AtlasButton>
        )}
        {!free && (
          <AtlasButton onClick={onHandIn} tone="primary" invite={hit} ariaLabel="Hand in" className={cn('py-2', aim === 'hand' && 'atlas-aim')}>
            <Flag className="h-4 w-4" />
            Hand in
          </AtlasButton>
        )}
      </div>
    </div>
  )
}

function Tool({ label, icon, onClick, disabled }: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <Tile onClick={onClick} disabled={disabled} aria-label={label} className="flex min-h-[3rem] min-w-[3rem] flex-col items-center justify-center gap-0.5 rounded-[12px] text-[10px] font-extrabold text-[#5A5445] hover:bg-[#F1ECDE] active:scale-95 disabled:opacity-35">
      {icon}
      {label}
    </Tile>
  )
}

/* ------------------------------------------------------------------ */
/* Ploob's line                                                        */
/* ------------------------------------------------------------------ */

/**
 * Where Ploob's line sits. It floats over the bench by default, and the player
 * can send it to a side column or shut it altogether.
 *
 * Selorm's note: a banner over the launchers is in the way of the thing the
 * player is aiming at. But a coach that can only be dismissed is a coach that
 * gets dismissed once and never comes back, and Ploob is how the chemistry is
 * taught. So the line is **movable before it is closable**: one button walks it
 * float → left column → right column → float, and only then a second button
 * shuts it down to a chip that says a new line is waiting.
 */
export function PloobLine({
  text,
  action,
  compact,
  dock = 'float',
  columns = false,
  onDock,
  onHide,
}: {
  text: string
  action?: { label: string; onClick: () => void }
  compact: boolean
  dock?: CoachDock
  columns?: boolean
  onDock?: () => void
  onHide?: () => void
}) {
  // In a column the plate fills the column and the text can breathe downward;
  // floating, it stays a single band so it covers as little bench as possible.
  const docked = dock === 'left' || dock === 'right'
  return (
    <div
      data-testid="coach"
      data-dock={dock}
      className={cn(
        'atlas-plate atlas-arrive pointer-events-auto flex gap-2.5 rounded-[20px] px-3 py-2',
        docked ? 'w-full items-start' : 'max-w-[min(34rem,calc(100vw-1.5rem))] items-center',
      )}
    >
      <Ploob2 size={compact ? 26 : 34} />
      <div className="min-w-0 flex-1">
        {!compact && <span className="atlas-eyebrow block leading-none">Ploob</span>}
        <p className="text-[12.5px] leading-snug font-extrabold text-[#2A2823]">{text}</p>
        {action && docked && (
          <AtlasButton onClick={action.onClick} className="mt-2 py-1.5">
            {action.label}
          </AtlasButton>
        )}
      </div>
      {action && !docked && (
        <AtlasButton onClick={action.onClick} className="shrink-0 py-1.5">
          {action.label}
        </AtlasButton>
      )}
      {(onDock || onHide) && (
        <div className="flex shrink-0 items-center gap-0.5 self-start">
          {onDock && columns && (
            <Tile
              onClick={onDock}
              aria-label={dock === 'float' ? 'Move Ploob to the left column' : dock === 'left' ? 'Move Ploob to the right column' : 'Float Ploob over the bench'}
              title="Move Ploob"
              className="flex h-[--hit] w-[--hit] shrink-0 items-center justify-center rounded-[10px] text-[#5A5445] hover:bg-[#F1ECDE] active:scale-95"
            >
              {dock === 'right' ? <PanelBottom size={15} /> : dock === 'left' ? <PanelRight size={15} /> : <PanelLeft size={15} />}
            </Tile>
          )}
          {onHide && (
            <Tile
              onClick={onHide}
              aria-label="Close Ploob"
              title="Close Ploob"
              className="flex h-[--hit] w-[--hit] shrink-0 items-center justify-center rounded-[10px] text-[#5A5445] hover:bg-[#F1ECDE] active:scale-95"
            >
              <X size={15} />
            </Tile>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * What is left when Ploob is closed: a chip the size of a thumb, with a dot
 * when there is something new to hear. Never a nag, never in the way, and
 * never a dead end — the whole point is that the way back is one tap.
 */
export function PloobChip({ unread, onOpen }: { unread: boolean; onOpen: () => void }) {
  return (
    <Tile
      onClick={onOpen}
      aria-label={unread ? 'Open Ploob — he has something new to say' : 'Open Ploob'}
      title="Open Ploob"
      data-testid="coach-chip"
      className="atlas-plate pointer-events-auto relative flex h-[--hit] min-h-[2.6rem] w-auto items-center gap-1.5 rounded-[20px] px-2.5 py-1.5 active:scale-95"
    >
      <Ploob2 size={24} />
      <span className="atlas-eyebrow leading-none">Ploob</span>
      {unread && <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#E8A33D] ring-2 ring-[#FBF8EF]" />}
    </Tile>
  )
}

/* ------------------------------------------------------------------ */
/* Side columns                                                        */
/* ------------------------------------------------------------------ */

const STARTER: number[] = [1, 8, 6, 11, 17]
const CARD_COLOR: Record<number, { bg: string; ink: string }> = {
  1: { bg: '#FCFAF4', ink: '#2A2823' },
  8: { bg: '#E8503F', ink: '#FBF8EF' },
  6: { bg: '#3B3733', ink: '#FBF8EF' },
  11: { bg: '#9A7BD1', ink: '#FBF8EF' },
  17: { bg: '#6FB24E', ink: '#FBF8EF' },
}

export function ElementsPanel({ onLook, onWall, compact }: { onLook: (z: number) => void; onWall: () => void; compact: boolean }) {
  return (
    <div className="atlas-plate pointer-events-auto flex h-full flex-col gap-2 p-3" data-testid="elements">
      <div className="flex items-baseline justify-between">
        <span className="atlas-serif text-[17px] font-semibold text-[#2A2823]">Elements</span>
        <Chip>starter five</Chip>
      </div>
      <span className="text-[11px] font-bold text-[#8B8471]">Tap one to look closer. The wall behind you lights the tile when you forge it.</span>
      <div className={cn('grid gap-2', compact ? 'grid-cols-1' : 'grid-cols-2')}>
        {STARTER.slice(0, compact ? 4 : 5).map((z) => {
          const e = ELEMENT_BY_Z[z]
          const c = CARD_COLOR[z]
          return (
            <Tile
              key={z}
              onClick={() => onLook(z)}
              aria-label={`Look closer at ${e.name}`}
              className="relative flex min-h-[5.2rem] flex-col items-start justify-between rounded-[14px] border border-[#E4DCC9] p-2.5 text-left transition-all active:scale-[0.98]"
              style={{ background: c.bg, color: c.ink }}
            >
              <span className="text-[11px] font-extrabold opacity-85">{z}</span>
              <span className="atlas-serif text-[26px] leading-none font-semibold">{e.symbol}</span>
              <span className="text-[11px] font-extrabold opacity-90">{e.name}</span>
              <span
                className="absolute top-7 right-3 h-8 w-8 rounded-full"
                style={{ background: `radial-gradient(circle at 35% 30%, #fff 0, ${CATEGORY_META[e.category].tint} 45%, rgba(0,0,0,0.35) 100%)`, boxShadow: '0 6px 10px -6px rgba(0,0,0,0.5)' }}
                aria-hidden
              />
            </Tile>
          )
        })}
      </div>
      <div className="min-h-0 grow" />
      <AtlasButton onClick={onWall} ariaLabel="See the whole wall" className="w-full justify-between">
        <Grid2x2 className="h-4 w-4" /> See the whole wall <ArrowRight className="h-4 w-4" />
      </AtlasButton>
    </div>
  )
}

export interface JournalEntry {
  id: string
  levelId: string
  title: string
  build: Build
  score: ChallengeScore
  trials: number
  by?: string
}

export function OurSpace({
  entries,
  incoming,
  onPlay,
  onRemix,
  compact,
}: {
  entries: JournalEntry[]
  incoming: { by?: string; title: string } | null
  onPlay: () => void
  onRemix: (e: JournalEntry) => void
  compact: boolean
}) {
  return (
    <div className="atlas-plate pointer-events-auto flex h-full flex-col gap-2 p-3" data-testid="our-space">
      <div className="flex items-baseline justify-between">
        <span className="atlas-serif text-[17px] font-semibold text-[#2A2823]">Our Space</span>
        <Chip>{entries.length ? `${entries.length} handed in` : 'nothing yet'}</Chip>
      </div>
      {incoming && (
        <div className="rounded-[14px] border border-[#C8DFC2] bg-[#E7F1E3] p-3" data-testid="incoming">
          <span className="atlas-eyebrow">{incoming.by ? `${incoming.by}'s challenge` : 'A challenge for you'}</span>
          <p className="mt-0.5 text-[12.5px] font-black text-[#2A2823]">{incoming.title}</p>
          <p className="text-[10.5px] font-bold text-[#8B8471]">Same seed, same catch. Beat it, then send it back.</p>
          <AtlasButton onClick={onPlay} tone="primary" invite className="mt-2 w-full">
            <Flag className="h-3.5 w-3.5" /> Beat that
          </AtlasButton>
        </div>
      )}
      {entries.length === 0 && !incoming && (
        <p className="text-[11.5px] leading-snug font-bold text-[#8B8471]">
          Your hand-ins land here as cards. Send one and a friend's answer lands beside it. No feed, no strangers — just the people you send to.
        </p>
      )}
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
        {entries.slice(0, compact ? 2 : 4).map((e) => {
          const n = nuclide(e.build)
          const id = identityOf(e.build)
          return (
            <div key={e.id} className="rounded-[14px] border border-[#E4DCC9] bg-white p-2.5" data-testid="journal-card">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-black text-[#2A2823]">{e.by ? `${e.by}'s ` : 'Your '}{id ? id.name.toLowerCase() : 'atom'}</span>
                <span className="text-[13px] tracking-widest text-[#D99B2B]">{'★'.repeat(e.score.stars)}<span className="text-[#D8D0BC]">{'★'.repeat(3 - e.score.stars)}</span></span>
              </div>
              <div className="mt-1 flex items-center gap-3">
                <span className="atlas-serif text-[22px] leading-none font-semibold text-[#2A2823]">
                  <sup className="text-[10px]">{n.a}</sup>{n.symbol}<sup className="text-[10px]">{n.charge}</sup>
                </span>
                <span className="text-[10.5px] font-bold text-[#8B8471]">{e.title} · {e.trials} trial{e.trials === 1 ? '' : 's'} · {e.score.total}</span>
              </div>
              <AtlasButton onClick={() => onRemix(e)} className="mt-2 w-full py-1.5" ariaLabel={`Beat ${e.title}`}>
                <Share2 className="h-3.5 w-3.5" /> Send · beat that
              </AtlasButton>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Score                                                               */
/* ------------------------------------------------------------------ */

export function ForgeScore({
  level,
  build,
  score,
  trials,
  spent,
  bank,
  opened,
  onNext,
  onSend,
  onAgain,
  onClose,
}: {
  level: Level
  build: Build
  score: ChallengeScore
  trials: number
  spent: ResourceBudget
  bank: ResourceBudget | null
  /** The door this hand-in opened, if any. */
  opened: Door | null
  onNext: () => void
  onSend: () => void
  onAgain: () => void
  onClose: () => void
}) {
  const g = gaugeFor(level, build)
  const left = bank ? (['proton', 'neutron', 'electron'] as Kind[]).reduce((a, k) => a + Math.max(0, (bank[k] ?? 0) - (spent[k] ?? 0)), 0) : 0
  const id = identityOf(build)
  const n = nuclide(build)
  const rows: Array<[string, number, string]> = [
    ['Accuracy', score.accuracy, g.hit ? `${g.of} of ${g.of} — exactly ${id ? id.name.toLowerCase() : 'the target'}${n.charge ? `, charge ${fmtCharge(build.protons - build.electrons)}` : ''}.` : `${g.met} of ${g.of} parts met. ${g.cells.find((c) => !c.met)?.todo ?? ''}`],
    ['Economy', score.economy, trials === 1 ? 'One trial. Fewer trials means you reasoned it out.' : `${trials} trials. Fewer next time means you reasoned it out.`],
    ['Thrift', score.thrift, bank ? `${left} particle${left === 1 ? '' : 's'} left in the hopper.` : 'No catch this round — thrift is full.'],
  ]
  return (
    <div data-focus-layer="" className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[#2A2823]/35 p-3 backdrop-blur-[2px]">
      <div className="atlas-plate atlas-arrive max-h-[92vh] w-full max-w-md overflow-y-auto p-5" data-testid="score" data-total={score.total} data-hit={g.hit ? 'true' : 'false'}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="atlas-eyebrow">Result · Door {level.door} · Level {level.tier}</span>
            <h2 className="atlas-serif text-[30px] leading-tight font-semibold text-[#2A2823]">
              {score.total} <span className="text-[15px] text-[#8B8471]">/ 1000</span>
            </h2>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span aria-label={`${score.stars} of 3 stars`} className="text-[20px] leading-none tracking-widest text-[#D99B2B]">
              {'★'.repeat(score.stars)}
              <span className="text-[#D8D0BC]">{'★'.repeat(3 - score.stars)}</span>
            </span>
            <Tile onClick={onClose} aria-label="Close" className="rounded-full px-2 text-[15px] font-bold text-[#B9B09A] hover:text-[#4A4438]">
              <X className="h-4 w-4" />
            </Tile>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2.5">
          {rows.map(([label, v, why]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] font-black text-[#2A2823]">{label}</span>
                <span className="text-[11px] font-extrabold text-[#8B8471] tabular-nums">{Math.round(v * 100)} / 100</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#EDE6D6]">
                <div className="h-full rounded-full bg-[#3E7C43]" style={{ width: `${Math.round(v * 100)}%` }} />
              </div>
              <span className="text-[10.5px] font-semibold text-[#8B8471]">{why}</span>
            </div>
          ))}
        </div>
        {opened ? (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-[#C8DFC2] bg-[#E7F1E3] px-3 py-2" data-testid="door-opened">
            <span className="text-[20px]" aria-hidden>🚪</span>
            <div>
              <p className="text-[12.5px] font-black text-[#2F6134]">A door has opened · Door {opened.id}, {opened.name}</p>
              <p className="text-[11px] font-bold text-[#2F6134]">{opened.game}. {opened.built ? 'Go through.' : 'Nobody has built what is behind it yet — your hand-in is in the journal.'}</p>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-[11px] font-bold text-[#8B8471]">{g.hit ? 'Handed in. Your atom went into the journal.' : 'Not there yet — the gauge says what is missing. Try again; the seed is the same.'}</p>
        )}
        <div className="mt-3 flex gap-2">
          {opened?.built ? (
            <AtlasButton onClick={onNext} tone="primary" invite className="flex-1 py-2.5">
              Go through
            </AtlasButton>
          ) : (
            <AtlasButton onClick={onAgain} tone={g.hit ? 'quiet' : 'primary'} invite={!g.hit} className="flex-1 py-2.5" ariaLabel="Play again">
              Play again
            </AtlasButton>
          )}
          <AtlasButton onClick={onSend} className="flex-1 py-2.5" ariaLabel="Send to a friend">
            <Send className="h-4 w-4" /> Send to a friend
          </AtlasButton>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Send — the card and the link                                        */
/* ------------------------------------------------------------------ */

export function ForgeSend({
  card,
  build,
  link,
  by,
  onBy,
  onClose,
}: {
  card: ShareCard
  build: Build
  link: string
  /** The sender's nickname — the only thing about them that travels. */
  by: string
  onBy: (next: string) => void
  onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState<string | null>(null)
  useEffect(() => {
    if (canvasRef.current) drawShareCard(canvasRef.current, card, build)
  }, [card, build])
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const share = async () => {
    const canvas = canvasRef.current
    try {
      let files: File[] = []
      if (canvas && typeof navigator.canShare === 'function') {
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
        if (blob) {
          const f = new File([blob], 'ploobia-forge.png', { type: 'image/png' })
          if (navigator.canShare({ files: [f] })) files = [f]
        }
      }
      await navigator.share({ title: card.headline, text: `${card.headline}. ${card.dare}`, url: link, ...(files.length ? { files } : {}) })
      setShared('Sent.')
    } catch {
      setShared(null)
    }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div data-focus-layer="" className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[#2A2823]/35 p-3 backdrop-blur-[2px]">
      <div className="atlas-plate atlas-arrive flex max-h-[92vh] w-full max-w-[44rem] flex-col gap-3 overflow-y-auto p-4 sm:flex-row" data-testid="send">
        <canvas ref={canvasRef} className="w-full max-w-[16rem] self-center rounded-[16px] border border-[#E4DCC9]" aria-label="Your share card" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-start justify-between">
            <div>
              <span className="atlas-eyebrow">Send to a friend</span>
              <p className="text-[14px] font-black text-[#2A2823]" data-testid="headline">{card.headline}</p>
              <p className="text-[11.5px] font-bold text-[#8A5410]">{card.dare}</p>
            </div>
            <Tile onClick={onClose} aria-label="Close" className="rounded-full px-2 text-[15px] font-bold text-[#B9B09A] hover:text-[#4A4438]">
              <X className="h-4 w-4" />
            </Tile>
          </div>
          {/* Who it is from. The card said "Someone forged helium" because
              nothing ever asked; a child who has just made an atom would
              rather it said their name on it. `cleanNickname` decides what is
              allowed in, so the promise under this field stays literally true. */}
          <label className="flex flex-col gap-1">
            <span className="atlas-eyebrow">From</span>
            <input
              data-testid="by"
              value={by}
              onChange={(e) => onBy(cleanNickname(e.target.value))}
              maxLength={NICKNAME_MAX}
              placeholder="Your nickname"
              aria-label="Your nickname, for the card"
              autoComplete="off"
              spellCheck={false}
              className="min-h-[--hit] w-full rounded-[12px] border border-[#E4DCC9] bg-[#FBF8EF] px-2.5 py-1.5 text-[13px] font-extrabold text-[#2A2823] placeholder:font-bold placeholder:text-[#B9B09A] focus:border-[#1F6F73] focus:outline-none"
            />
          </label>
          {canShare && (
            <AtlasButton onClick={share} tone="primary" invite className="w-full py-2.5" ariaLabel="Share the card and the link">
              <Share2 className="h-4 w-4" /> WhatsApp, or wherever — the card and the link
            </AtlasButton>
          )}
          <AtlasButton onClick={copy} className="w-full py-2.5" ariaLabel="Copy link">
            <Copy className="h-4 w-4" /> {copied ? 'Copied' : 'Copy the link'}
          </AtlasButton>
          <p className="break-all rounded-lg border border-[#E9E2D1] bg-[#F6F2E8] px-2 py-1.5 font-mono text-[10px] text-[#5A5445]" data-testid="link">
            {link}
          </p>
          {shared && <p className="text-[11px] font-bold text-[#2F6134]">{shared}</p>}
          <p className="text-[10.5px] font-bold text-[#8B8471]">
            The link opens the identical world — same seed, same catch — with your dare on the gauge. Nickname only; nothing else about you leaves this device.
          </p>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The brass tag, in HUD form for the compact layouts                  */
/* ------------------------------------------------------------------ */

export function IdentityChip({ build }: { build: Build }) {
  const id = identityOf(build)
  const n = nuclide(build)
  return (
    <div className="atlas-plate-quiet pointer-events-none flex items-center gap-2 px-3 py-1.5" data-testid="identity">
      <span className="atlas-serif text-[20px] leading-none font-semibold text-[#2A2823]">
        <sup className="text-[10px]">{n.a}</sup>
        {n.symbol}
        <sup className="text-[10px]">{n.charge}</sup>
      </span>
      <div className="flex flex-col">
        <span className="text-[11.5px] font-black text-[#2A2823]">{id ? `${id.name}${n.charge ? ' ion' : ''}` : 'No atom yet'}</span>
        <span className="text-[10px] font-bold text-[#8B8471]">
          {build.protons} p⁺ · {build.neutrons} n⁰ · {build.electrons} e⁻ · {stabilityWord(build)}
        </span>
      </div>
    </div>
  )
}
