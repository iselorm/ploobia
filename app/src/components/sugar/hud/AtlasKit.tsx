import type { ReactNode } from 'react'
import { Slider } from '@/components/ui/slider'
import Ploob2 from '@/components/brand/Ploob2'
import { Tile } from '@/components/ui/tile'
import { cn } from '@/lib/utils'

/**
 * The Sugar Line's HUD primitives.
 *
 * Everything on screen is a *plate* — a cream card with a hairline rule, an
 * uppercase letterspaced eyebrow, and content that reads like a field guide
 * entry rather than a control panel. The chrome is deliberately quiet so the
 * specimen is the loudest thing in the frame, which is the whole trick the
 * Seed Atlas reference pulls off.
 */

/* ------------------------------------------------------------------ */

export function Eyebrow({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      {icon ? <span className="text-[#8B8471]">{icon}</span> : null}
      <span className="atlas-eyebrow">{children}</span>
    </div>
  )
}

export function Plate({
  eyebrow,
  icon,
  action,
  children,
  className,
  quiet = false,
}: {
  eyebrow?: string
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  quiet?: boolean
}) {
  return (
    <div className={cn(quiet ? 'atlas-plate-quiet' : 'atlas-plate', 'p-3', className)}>
      {(eyebrow || action) && (
        <div className="mb-2 flex items-start justify-between gap-2">
          {eyebrow ? <Eyebrow icon={icon}>{eyebrow}</Eyebrow> : <span />}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

export function Chip({
  children,
  tone = 'neutral',
  title,
}: {
  children: ReactNode
  tone?: 'neutral' | 'good' | 'warn' | 'sugar' | 'water'
  title?: string
}) {
  const tones: Record<string, string> = {
    neutral: 'border-[#E4DCC9] bg-[#F6F2E8] text-[#7C8177]',
    good: 'border-[#C8DFC2] bg-[#E7F1E3] text-[#2F6134]',
    warn: 'border-[#EFC9A6] bg-[#FBEEE0] text-[#96591C]',
    sugar: 'border-[#EAD0A0] bg-[#FBEBD2] text-[#8A5A0B]',
    water: 'border-[#BFD8EC] bg-[#E4EFF8] text-[#12496F]',
  }
  return (
    <span className={cn('atlas-chip', tones[tone])} title={title}>
      {children}
    </span>
  )
}

export function Rule({ className }: { className?: string }) {
  return <div className={cn('atlas-rule my-2', className)} />
}

/** Label on the left, value on the right — the key-facts block. */
export function FactRow({
  label,
  value,
  tone,
  title,
}: {
  label: string
  value: ReactNode
  tone?: string
  title?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px]" title={title}>
      <span className="text-[11px] font-semibold text-[#8B8471]">{label}</span>
      <span
        className="text-[12px] font-extrabold tabular-nums"
        style={{ color: tone ?? '#2A2823' }}
      >
        {value}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */

export function AtlasButton({
  children,
  onClick,
  tone = 'quiet',
  disabled,
  invite = false,
  className,
  ariaLabel,
}: {
  children: ReactNode
  onClick: () => void
  tone?: 'primary' | 'quiet' | 'danger'
  disabled?: boolean
  /** Pulse a ring so the eye lands on the one thing to do next. */
  invite?: boolean
  className?: string
  ariaLabel?: string
}) {
  const tones: Record<string, string> = {
    primary: 'bg-[#2F6134] text-[#FBF8EF] hover:bg-[#24512A] border-transparent',
    quiet: 'bg-[#FCFAF4] text-[#4A4438] hover:bg-[#F1ECDE] border-[#E4DCC9]',
    danger: 'bg-[#FBEEEC] text-[#9A302A] hover:bg-[#F6E0DC] border-[#EFC7C1]',
  }
  return (
    <Tile
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        'flex items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-extrabold transition-all active:scale-95 disabled:opacity-45',
        tones[tone],
        invite && 'atlas-invite',
        className,
      )}
    >
      {children}
    </Tile>
  )
}

/** A row of mutually exclusive pills. */
export function PillGroup<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'md',
}: {
  options: Array<{ id: T; label: string; title?: string }>
  value: T
  onChange: (id: T) => void
  ariaLabel: string
  size?: 'sm' | 'md'
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex flex-wrap gap-1 rounded-full border border-[#E4DCC9] bg-[#F3EEE0] p-1"
    >
      {options.map((o) => {
        const on = o.id === value
        return (
          <Tile
            key={o.id}
            onClick={() => onChange(o.id)}
            title={o.title}
            aria-pressed={on}
            className={cn(
              'rounded-full font-extrabold transition-all active:scale-95',
              size === 'sm' ? 'px-2.5 py-1 text-[10.5px]' : 'px-3 py-1.5 text-[11.5px]',
              on
                ? 'bg-[#FCFAF4] text-[#2F6134] shadow-[0_1px_2px_rgba(74,62,40,0.12)]'
                : 'text-[#8B8471] hover:text-[#4A4438]',
            )}
          >
            {o.label}
          </Tile>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */

/**
 * A labelled control. The aria-label on the wrapper is what the harness and a
 * screen reader both find, and it names the quantity rather than the widget.
 */
export function Dial({
  label,
  value,
  display,
  min,
  max,
  step,
  color,
  onChange,
  note,
  disabled,
  ceiling,
}: {
  label: string
  value: number
  display: string
  min: number
  max: number
  step: number
  color: string
  onChange: (v: number) => void
  note?: string
  disabled?: boolean
  /**
   * Where this dial stops, in the dial's own units, when a challenge has
   * capped it. Drawn as a hard stop and a hatched dead zone over the track,
   * so a slider that will not go further reads as *caused* rather than
   * broken — the one sentence that used to carry this was folded inside a
   * collapsed strip, and a learner whose light stopped at a third had no way
   * to know the gather round was why.
   */
  ceiling?: number | null
}) {
  const capped = ceiling !== undefined && ceiling !== null && ceiling < max - 1e-9
  const capFrac = capped ? Math.max(0, Math.min(1, (ceiling - min) / (max - min))) : 1
  const atCeiling = capped && value >= ceiling - step / 2
  return (
    <div aria-label={label} className="py-1" data-ceiling={capped ? ceiling : undefined}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[11.5px] font-bold text-[#4A4438]">{label}</span>
        <span className="text-[12px] font-extrabold tabular-nums" style={{ color }}>
          {display}
          {atCeiling && (
            <span className="ml-1 text-[9.5px] font-black tracking-[0.06em] text-[#8B8471] uppercase">
              · ceiling
            </span>
          )}
        </span>
      </div>
      <div className="relative">
        <Slider
          value={[value]}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onValueChange={(v) => onChange(v[0])}
          className="[&_[data-slot=slider-range]]:bg-[color:var(--dial)] [&_[data-slot=slider-thumb]]:border-[color:var(--dial)] [&_[data-slot=slider-track]]:bg-[#E7E1D2]"
          style={{ ['--dial' as string]: color }}
        />
        {capped && (
          <>
            {/* The dead zone: the part of the track your gathering did not buy. */}
            <span
              aria-hidden
              data-testid="dial-dead-zone"
              className="pointer-events-none absolute top-1/2 right-0 h-1.5 -translate-y-1/2 rounded-r-full"
              style={{
                left: `${capFrac * 100}%`,
                backgroundImage:
                  'repeating-linear-gradient(90deg, #D8D0BC 0 3px, transparent 3px 6px)',
              }}
            />
            {/* The hard stop. */}
            <span
              aria-hidden
              className="pointer-events-none absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2A2823]"
              style={{ left: `${capFrac * 100}%` }}
            />
          </>
        )}
      </div>
      {note ? <p className="mt-1 text-[10.5px] leading-snug font-semibold text-[#9A9482]">{note}</p> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */

/**
 * The scale bar in the corner of the plate.
 *
 * Cheap to draw and it does more teaching than a paragraph: without it a
 * chloroplast and a stem look like objects of the same size, which is exactly
 * the misconception this cabinet spends three views trying to undo.
 */
export function ScaleBar({ label }: { label: string }) {
  return (
    <div className="pointer-events-none flex flex-col items-end gap-1">
      <span className="text-[10.5px] font-bold tracking-wide text-[#8B8471]">{label}</span>
      <div className="flex items-end">
        <div className="h-2 w-px bg-[#8B8471]" />
        <div className="h-px w-16 bg-[#8B8471]" />
        <div className="h-2 w-px bg-[#8B8471]" />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

/**
 * A horizontal fill meter. Used for sink stores, the leaf's starch bank and
 * the trial's progress — one shape, so a learner learns to read it once.
 */
export function Meter({
  value,
  color = '#D99B2B',
  track = '#EDE6D5',
  height = 6,
}: {
  value: number
  color?: string
  track?: string
  height?: number
}) {
  return (
    <div
      className="w-full overflow-hidden rounded-full"
      style={{ background: track, height }}
      role="presentation"
    >
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */

/**
 * The coach chip: one line, always naming the single next action.
 *
 * This exists because a welcome card and a mission brief were not enough —
 * a learner needs to be told what to do *now*, at the moment they are looking
 * for it, and the button it points at gets a ring at the same time.
 */
export function Coach({ text, hint, who = 'Ploob' }: { text: string; hint?: string; who?: string }) {
  return (
    <div
      data-testid="coach"
      className="atlas-plate atlas-arrive pointer-events-none flex max-w-[min(30rem,calc(100vw-2rem))] items-center gap-2.5 px-3 py-2"
    >
      {/* Ploob 2.0 is the face of the chip. He never speaks on camera, so the
          line is not in a bubble from his mouth — it is the coach's line, and
          he is the one standing beside it. */}
      <Ploob2 size={22} />
      <div className="min-w-0">
        <span className="atlas-eyebrow block leading-none">{who}</span>
        <p className="text-[12.5px] leading-snug font-extrabold text-[#2A2823]">{text}</p>
        {hint ? <p className="text-[11px] leading-snug font-semibold text-[#8B8471]">{hint}</p> : null}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The mission ring                                                   */
/* ------------------------------------------------------------------ */

/**
 * Puts an amber ring round whatever control the active mission step needs.
 *
 * A wrapper rather than a prop on every control, because the set of things a
 * step can point at is open-ended (a dial, a pill group, a button, the whole
 * specimen rail) and threading an `aim` flag through all of them would be
 * eleven edits and eleven chances to miss one.
 */
export function Aim({
  on,
  inline = false,
  children,
}: {
  on: boolean
  inline?: boolean
  children: ReactNode
}) {
  if (!on) return <>{children}</>
  return <span className={inline ? 'atlas-aim inline-flex' : 'atlas-aim block'}>{children}</span>
}
