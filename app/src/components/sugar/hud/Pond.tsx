import { Clock, Droplets, Lightbulb, Thermometer, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tile } from '@/components/ui/tile'
import type { Band } from '@/lib/bands'
import { POND_KIT, atEnd, indicatorSays, riseLine, type Dial, type IndicatorColour, type PondCount, type PondEnv, type PondPatient, type Verdict } from '@/lib/pond'

/**
 * The Pond's HUD — the one door in this cabinet with no target on its gauge.
 *
 * Everywhere else in the Sugar Line the pinned gauge says *what you are
 * trying to reach*. Here there is nothing to reach: the round is a
 * diagnosis, so the gauge says what the counter says — now, last, and as
 * found — and the thing being aimed at is a cause. The plates in the scene
 * are the commit; this is the bench beside them.
 *
 * Three rules the copy keeps (they are checked by the browser suite):
 *
 * 1. **Ploob reacts and asks; he never states the rule or draws the
 *    inference.** No line in the lab contains *limiting*, *factor* or
 *    *rate*, and none of them names the answer before the accusation.
 * 2. **A direction before the first nudge of any dial** — up, same or down.
 *    One tap, once per dial, and the world moves after it, not before.
 * 3. **The words the learner has.** Lamp, baking soda, bath, bubbles at
 *    Explorer; carbon dioxide and temperature arrive on the page afterwards.
 */

const INK = '#2A2118'
const QUIET = '#5C4F3F'
const POND = '#2F6E8F'

const DIAL_META: Record<Dial, { label: string; down: string; up: string; icon: typeof Lightbulb }> = {
  lamp: { label: 'the lamp', down: 'dimmer', up: 'brighter', icon: Lightbulb },
  soda: { label: 'the baking soda', down: 'less soda', up: 'more soda', icon: Droplets },
  bath: { label: 'the bath', down: 'cooler', up: 'warmer', icon: Thermometer },
}

/* ------------------------------------------------------------------ */
/* The gauge: what the counter says, and no target at all              */
/* ------------------------------------------------------------------ */

export function PondHud({
  patient,
  now,
  last,
  asFound,
  kit,
  band,
  compact,
  counting,
  onQuit,
}: {
  patient: PondPatient
  now: number | null
  last: number | null
  asFound: number | null
  kit: { minutes: number; spoons: number; jugs: number }
  band: Band
  compact: boolean
  counting: boolean
  onQuit: () => void
}) {
  const cell = (label: string, value: string) => (
    <div className="flex flex-col items-center" key={label}>
      <span className="text-[9px] font-bold tracking-[0.1em] text-[#8B8471] uppercase">{label}</span>
      <span className="atlas-serif text-[17px] leading-none font-semibold tabular-nums" style={{ color: INK }}>
        {value}
      </span>
    </div>
  )
  return (
    <div className={cn('pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-center px-3', compact ? 'pt-2' : 'pt-3')} data-testid="pond-hud">
      <div className="atlas-plate pointer-events-auto flex items-center gap-4 px-4 py-2">
        <div className="min-w-0">
          <span className="text-[9px] font-bold tracking-[0.1em] text-[#8B8471] uppercase">The Pond · {patient.name}</span>
          <p className="max-w-[16rem] truncate text-[11.5px] font-semibold" style={{ color: QUIET }}>
            {counting ? 'Counting…' : 'Bubbles a minute. No target on this one.'}
          </p>
        </div>
        <div className="flex items-center gap-3" data-testid="pond-gauge" data-now={now ?? ''} data-found={asFound ?? ''}>
          {cell('now', now === null ? '—' : String(now))}
          {cell('last', last === null ? '—' : String(last))}
          {cell('as found', asFound === null ? '—' : String(asFound))}
        </div>
        <div className="flex items-center gap-2 border-l border-[#E4DCC9] pl-3 text-[10.5px] font-extrabold" style={{ color: QUIET }} data-testid="pond-kit">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> {kit.minutes}
          </span>
          <span>🥄 {kit.spoons}</span>
          <span>🫙 {kit.jugs}</span>
          {band !== 'explorer' && <span className="text-[#8B8471]">of {POND_KIT[band].minutes}</span>}
        </div>
        <Tile onClick={onQuit} aria-label="Leave the tank" className="rounded-full px-1.5 text-[#B9B09A] hover:text-[#4A4438]">
          <X className="h-4 w-4" />
        </Tile>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The micro-commit: a direction, before the first nudge of a dial      */
/* ------------------------------------------------------------------ */

export type Guess = 'up' | 'same' | 'down'

export function MicroCommit({ dial, dir, onPick }: { dial: Dial; dir: 'up' | 'down'; onPick: (g: Guess) => void }) {
  const m = DIAL_META[dial]
  return (
    <div data-focus-layer="" className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[#2A2118]/35 p-3 backdrop-blur-[2px]">
      <div className="atlas-plate atlas-arrive w-full max-w-[22rem] p-4 text-center" data-testid="pond-commit" data-dial={dial}>
        <span className="atlas-eyebrow">Before you touch it</span>
        <h2 className="atlas-serif text-[18px] leading-tight font-semibold" style={{ color: INK }}>
          {dir === 'up' ? m.up[0].toUpperCase() + m.up.slice(1) : m.down[0].toUpperCase() + m.down.slice(1)}. What will the bubbles do?
        </h2>
        <div className="mt-3 flex justify-center gap-2">
          {(['up', 'same', 'down'] as Guess[]).map((g) => (
            <Tile
              key={g}
              onClick={() => onPick(g)}
              aria-label={g === 'up' ? 'Go up' : g === 'same' ? 'Stay the same' : 'Go down'}
              data-testid="pond-guess"
              data-guess={g}
              className="flex-1 rounded-[12px] border border-[#E4DCC9] bg-[#FCFAF4] px-3 py-2 text-[12.5px] font-extrabold text-[#4A4438] hover:bg-[#F1ECDE]"
            >
              {g === 'up' ? 'Up' : g === 'same' ? 'Same' : 'Down'}
            </Tile>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The bench: six verbs, and the minute                                 */
/* ------------------------------------------------------------------ */

export function PondPlate({
  dials,
  env,
  kit,
  counting,
  canCount,
  covered,
  indicator,
  band,
  compact,
  onNudge,
  onCount,
  onCloth,
}: {
  dials: Dial[]
  env: PondEnv
  kit: { minutes: number; spoons: number; jugs: number }
  counting: boolean
  canCount: boolean
  covered: boolean
  indicator: IndicatorColour
  band: Band
  compact: boolean
  onNudge: (dial: Dial, dir: 'up' | 'down') => void
  onCount: () => void
  onCloth: () => void
}) {
  const afford = (dial: Dial) => (dial === 'soda' ? kit.spoons > 0 : dial === 'bath' ? kit.jugs > 0 : true)
  /**
   * A button at the end of its rail is disabled and says so.
   *
   * It used to be live and do nothing — and on the veranda sprig, whose lamp,
   * soda and bath all start at the top of their rails, three of the six
   * buttons were dead and silent. A learner cannot tell a designed flat result
   * from a broken control, which poisons the one thing this round is teaching.
   */
  const stopped = (dial: Dial, dir: 'up' | 'down') => atEnd(env, dial, dir)
  const END_WORDS: Record<Dial, { up: string; down: string }> = {
    lamp: { up: 'as close as it goes', down: 'as far as it goes' },
    soda: { up: 'no more will dissolve', down: 'no soda in it' },
    bath: { up: 'as warm as it goes', down: 'as cool as it goes' },
  }
  // The bench stands to the right, not across the middle: the plates are on
  // the tank's own glass and they are what the round is aimed at, so nothing
  // the learner has to press may sit on top of them.
  return (
    <div className={cn('pointer-events-none fixed inset-x-0 z-30 flex justify-end px-3', compact ? 'bottom-3' : 'bottom-5')}>
      <div className="atlas-plate pointer-events-auto flex max-w-[26rem] flex-col gap-2 p-3" data-testid="pond-bench">
        {/* Three dials do not fit one row of the plate — a bench that ran off
            the right of a 1440 px screen hid the bath's buttons entirely — so
            the row wraps and the third dial takes a line of its own. */}
        <div className={cn('flex gap-2', compact ? 'flex-col' : 'flex-row flex-wrap')}>
          {dials.map((d) => {
            const m = DIAL_META[d]
            const Icon = m.icon
            return (
              <div key={d} className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: QUIET }} />
                {(['down', 'up'] as const).map((dir) => {
                  const end = stopped(d, dir)
                  return (
                    <Tile
                      key={dir}
                      onClick={() => onNudge(d, dir)}
                      disabled={counting || !afford(d) || end}
                      aria-label={end ? `${dir === 'up' ? m.up : m.down} — ${END_WORDS[d][dir]}` : dir === 'up' ? m.up : m.down}
                      data-testid="pond-nudge"
                      data-dial={d}
                      data-dir={dir}
                      data-end={end ? 'true' : 'false'}
                      className="min-h-[2.6rem] rounded-full border border-[#E4DCC9] bg-[#FCFAF4] px-3 py-1.5 text-[12px] font-extrabold text-[#4A4438] hover:bg-[#F1ECDE] disabled:opacity-40"
                    >
                      {end ? END_WORDS[d][dir] : dir === 'up' ? m.up : m.down}
                    </Tile>
                  )
                })}
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-2">
          <Tile
            onClick={onCount}
            disabled={!canCount || counting}
            aria-label="Count a minute"
            data-testid="pond-count"
            className="atlas-invite min-h-[2.6rem] flex-1 rounded-full border border-transparent bg-[#2F6134] px-4 py-2 text-[13px] font-extrabold text-[#FBF8EF] disabled:opacity-45"
          >
            {counting ? 'Counting…' : kit.minutes > 0 ? 'Count a minute' : 'No minutes left'}
          </Tile>
          {band !== 'explorer' && (
            <Tile
              onClick={onCloth}
              disabled={counting}
              aria-label={covered ? 'Take the cloth off' : 'Put a cloth over it'}
              data-testid="pond-cloth"
              className="min-h-[2.6rem] rounded-full border border-[#E4DCC9] bg-[#FCFAF4] px-3 py-1.5 text-[11.5px] font-extrabold text-[#4A4438]"
            >
              {covered ? 'Cloth off' : 'Cloth on'}
            </Tile>
          )}
        </div>
        {band !== 'explorer' && (
          <p className="max-w-[22rem] text-[10.5px] font-semibold" style={{ color: QUIET }} data-testid="pond-indicator">
            The tube beside the tank: {indicatorSays(indicator)}
          </p>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The counts, and the graph that draws itself                          */
/* ------------------------------------------------------------------ */

/**
 * The x-axis is not a variable — it is *what the learner did*, in order,
 * because the values are hidden. The flat run and the jump are visible
 * before any number is; the reveal relabels the axis and the picture becomes
 * the curve, drawn from counts they took themselves.
 */
export function PondCounts({ log, revealed, compact }: { log: PondCount[]; revealed: boolean; compact: boolean }) {
  const max = Math.max(10, ...log.map((c) => c.bubbles))
  const w = compact ? 170 : 230
  const h = 92
  const x = (i: number) => 22 + (log.length <= 1 ? 0 : (i / (log.length - 1)) * (w - 34))
  const y = (v: number) => h - 16 - (v / max) * (h - 30)
  return (
    <div className="atlas-plate-quiet w-full p-2" data-testid="pond-counts" data-rows={log.length}>
      <span className="atlas-eyebrow">Your counts</span>
      <div className="mt-1 flex flex-col gap-0.5">
        {log.map((c, i) => (
          <div key={i} className="flex flex-col" data-testid="pond-row" data-did={c.did}>
            <div className="flex items-baseline justify-between gap-2 text-[11px] font-extrabold tabular-nums">
              <span className="truncate" style={{ color: c.confounded ? '#96591C' : QUIET }}>
                {c.did}
                {c.confounded ? ' · two things changed' : ''}
              </span>
              <span className="flex-none" style={{ color: INK }}>
                {c.bubbles} /min
              </span>
            </div>
            {/* The call, on its own line: the prediction the round asked for
                is worth nothing unless the learner is told whether they were
                right, and worth less if it squeezes the count off the row. */}
            {c.called && (
              <span
                className="text-[10px] font-bold"
                data-testid="pond-called"
                data-right={c.called.right ? 'true' : 'false'}
                style={{ color: c.called.right ? '#2F6134' : '#96591C' }}
              >
                you said {c.called.guess} {c.called.right ? '✓' : '✗'}
              </span>
            )}
          </div>
        ))}
        {log.length === 0 && <span className="text-[11px] font-semibold text-[#8B8471]">Nothing counted yet.</span>}
      </div>
      {log.length >= 2 && (
        <svg viewBox={`0 0 ${w} ${h}`} className="mt-1 w-full" role="img" aria-label="Your counts, in the order you took them" data-testid="pond-graph" data-axis={revealed ? 'values' : 'steps'}>
          <line x1="20" y1={h - 16} x2={w - 8} y2={h - 16} stroke="#D9CFBB" />
          <line x1="20" y1="8" x2="20" y2={h - 16} stroke="#D9CFBB" />
          <polyline points={log.map((c, i) => `${x(i)},${y(c.bubbles)}`).join(' ')} fill="none" stroke={POND} strokeWidth="2" />
          {log.map((c, i) => (
            <circle key={i} cx={x(i)} cy={y(c.bubbles)} r="3.2" fill={POND} stroke="#2A2118" strokeWidth="0.8" />
          ))}
          <text x="2" y="14" fontSize="8" fill="#8B8471">
            {max}
          </text>
          <text x="20" y={h - 4} fontSize="8" fill="#8B8471">
            {revealed ? 'what each plate actually read' : 'what I did'}
          </text>
        </svg>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The accusation, and what comes back                                  */
/* ------------------------------------------------------------------ */

export function AccusePrompt({ untriedDials, compact }: { untriedDials: Dial[]; compact: boolean }) {
  return (
    <div className={cn('pointer-events-none fixed inset-x-0 z-20 flex justify-center px-3', compact ? 'bottom-[9.5rem]' : 'bottom-[11rem]')}>
      <p className="atlas-plate-quiet px-3 py-1.5 text-[11.5px] font-extrabold" style={{ color: QUIET }} data-testid="pond-accuse-hint">
        {untriedDials.length === 0
          ? 'Tap the plate you blame.'
          : `Try ${untriedDials.map((d) => DIAL_META[d].label).join(' and ')} first — then you can name one.`}
      </p>
    </div>
  )
}

/**
 * What the round says it found, in the learner's own nouns.
 *
 * Two things this must not say. Not *"it was short of baking soda"* — the
 * plant is not short of baking soda, it is short of carbon dioxide, and the
 * soda is only where that comes from; substituting the reagent for the
 * requirement is the exact misconception 6.1.8 exists to prevent. And not
 * *"nothing was holding it back"* — a living plant is always held back by
 * something; what is true is that this bench had nothing left to give it.
 */
function headlineFor(patient: PondPatient): string {
  if (patient.truth === 'none') return 'Nothing on this bench could make it faster.'
  if (patient.truth === 'lamp') return 'It was short of light.'
  if (patient.truth === 'soda') return 'It was short of carbon dioxide — the baking soda is where that comes from.'
  return patient.setup.bathC > 27 ? 'It was too warm.' : 'It was too cold.'
}

/**
 * The Field Log card: the learner's evidence first, the score on the back.
 *
 * This is the reconstruction card the grammar demands before any score, with
 * the four-line record the field guide already keeps — guessed, set, saw,
 * explained — and the learner's own counts on top. "Evidence saved to Field
 * Log" is literally true: the record goes into the same store the guide's
 * ledger reads.
 */
export function FieldLogCard({
  patient,
  verdict,
  log,
  band,
  onNext,
  onScore,
  onClose,
  onInside,
  nextLabel,
}: {
  patient: PondPatient
  verdict: Verdict
  log: PondCount[]
  band: Band
  onNext?: () => void
  onScore: () => void
  onClose: () => void
  /** Six seconds inside a chloroplast in the state this sprig was in. */
  onInside?: () => void
  nextLabel?: string
}) {
  const first = log[0]?.bubbles ?? 0
  const best = log.reduce((m, c) => Math.max(m, c.bubbles), first)
  const tried = new Set(log.map((c) => c.dial).filter(Boolean)).size
  // Eliminating is the game; the card used to name only the answer.
  const ruledOut = Math.max(0, tried - (verdict.right && patient.truth !== 'none' ? 1 : 0))
  return (
    <div data-focus-layer="" className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[#2A2118]/38 p-3 backdrop-blur-[2px]">
      <div className="atlas-plate atlas-arrive max-h-[92vh] w-full max-w-[27rem] overflow-y-auto p-4" data-testid="field-log" data-right={verdict.right ? 'true' : 'false'}>
        <span className="atlas-eyebrow">Your experiment · the Pond · {patient.name}</span>
        <h2 className="atlas-serif text-[20px] leading-tight font-semibold" style={{ color: INK }} data-testid="field-log-headline">
          {verdict.right ? headlineFor(patient) : 'Not that one.'}
        </h2>
        <div className="mt-2 flex flex-wrap gap-4">
          {[
            [String(log.length), 'counts'],
            [String(tried), 'dials tried'],
            [`${first} → ${best}`, 'bubbles a minute'],
          ].map(([v, l]) => (
            <span key={l} className="flex flex-col">
              <b className="atlas-serif text-[17px] font-semibold tabular-nums" style={{ color: INK }}>
                {v}
              </b>
              <span className="text-[10px] font-bold text-[#8B8471]">{l}</span>
            </span>
          ))}
        </div>
        <p className="mt-2 border-t border-[#E4DCC9] pt-2 text-[12px] leading-snug font-semibold" style={{ color: QUIET }} data-testid="field-log-line">
          {verdict.line}
        </p>
        <p className="mt-1 text-[11px] font-bold" style={{ color: QUIET }}>
          {riseLine(first, best, band)}
        </p>
        {/* What the dials said when the sprig arrived — not where they are
            now. The tank's own plates flip to the current setting, because a
            label on a dial reads the dial; this row is the diagnosis, and the
            diagnosis is about what it was found with. */}
        <span className="atlas-eyebrow mt-2 block">The dials, as you found them</span>
        <div className="mt-1 flex flex-wrap gap-1.5" data-testid="field-log-plates">
          {verdict.plates.map((p) => (
            <span key={p.dial} className="rounded-full border border-[#E4DCC9] bg-[#FBF8F1] px-2.5 py-0.5 font-mono text-[11px] font-semibold" style={{ color: INK }}>
              {p.dial === 'none' ? 'nothing' : DIAL_META[p.dial].label} · {p.reads}
            </span>
          ))}
        </div>
        {ruledOut > 0 && (
          <p className="mt-1 text-[11px] font-bold" style={{ color: QUIET }} data-testid="field-log-ruled">
            And you ruled out {ruledOut === 1 ? 'one' : ruledOut === 2 ? 'two' : String(ruledOut)} — which is how you knew.
          </p>
        )}
        <p className="mt-2 text-[11px] font-extrabold text-[#2F6134]" data-testid="field-log-saved">
          {verdict.stamps ? 'Evidence saved to Field Log' : 'Kept in your Field Log — with the miss, honestly'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {onNext && nextLabel && (
            <Tile onClick={onNext} aria-label={nextLabel} className="atlas-invite flex-1 rounded-full border border-transparent bg-[#2F6134] px-3 py-2 text-[12.5px] font-extrabold text-[#FBF8EF]">
              {nextLabel}
            </Tile>
          )}
          {onInside && (
            <Tile
              onClick={onInside}
              aria-label="Look inside a leaf cell"
              data-testid="field-log-inside"
              className="flex-1 rounded-full border border-[#E4DCC9] bg-[#FCFAF4] px-3 py-2 text-[12.5px] font-extrabold text-[#4A4438]"
            >
              Look inside →
            </Tile>
          )}
          <Tile onClick={onScore} aria-label="Turn the card over" data-testid="field-log-score" className="flex-1 rounded-full border border-[#E4DCC9] bg-[#FCFAF4] px-3 py-2 text-[12.5px] font-extrabold text-[#4A4438]">
            Turn the card over · score
          </Tile>
          <Tile onClick={onClose} aria-label="Back to the room" className="rounded-full border border-[#E4DCC9] bg-[#FCFAF4] px-3 py-2 text-[12.5px] font-extrabold text-[#4A4438]">
            Back to the room
          </Tile>
        </div>
      </div>
    </div>
  )
}

/**
 * Six seconds inside a chloroplast, in the state the sprig was found in.
 *
 * The only place in this round where a bubble count is joined to a mechanism.
 * It is deliberately a caption over the cabinet's existing chloroplast stage
 * rather than a new picture: the same model, driven to the same conditions,
 * drawing what it says happens.
 */
export function InsideCard({ line, compact, onDone }: { line: string; compact: boolean; onDone: () => void }) {
  return (
    <div className={cn('pointer-events-none fixed inset-x-0 z-40 flex justify-center px-3', compact ? 'bottom-4' : 'bottom-8')}>
      <div className="atlas-plate atlas-arrive pointer-events-auto max-w-[28rem] p-3 text-center" data-testid="pond-inside">
        <span className="atlas-eyebrow">Inside one of its cells</span>
        <p className="atlas-serif text-[15px] leading-snug font-semibold" style={{ color: INK }}>
          {line}
        </p>
        <Tile
          onClick={onDone}
          aria-label="Back to the tank"
          className="mt-2 rounded-full border border-[#E4DCC9] bg-[#FCFAF4] px-3 py-1.5 text-[11.5px] font-extrabold text-[#4A4438]"
        >
          Back to the tank
        </Tile>
      </div>
    </div>
  )
}

/**
 * The count in progress, as a ring the learner can watch fill — with the
 * running total inside it.
 *
 * Six seconds of a silent, numberless ring was the round's dead time. The
 * number is already being computed for the tube's gas column; putting it here
 * turns the wait into the one beat where the learner is guessing ahead of the
 * game.
 */
export function CountRing({ k, released, compact }: { k: number; released: number; compact: boolean }) {
  const r = compact ? 22 : 28
  const c = 2 * Math.PI * r
  return (
    <div className={cn('pointer-events-none fixed inset-x-0 z-30 flex justify-center', compact ? 'bottom-[11rem]' : 'bottom-[13rem]')} data-testid="pond-ring" data-released={released}>
      <svg width={r * 2 + 8} height={r * 2 + 8} role="img" aria-label={`Counting a minute — ${released} so far`}>
        <circle cx={r + 4} cy={r + 4} r={r} fill="rgba(251,248,241,.85)" stroke="#E4DCC9" strokeWidth="2" />
        <circle
          cx={r + 4}
          cy={r + 4}
          r={r}
          fill="none"
          stroke={POND}
          strokeWidth="3"
          strokeDasharray={`${c * Math.min(1, k)} ${c}`}
          transform={`rotate(-90 ${r + 4} ${r + 4})`}
        />
        <text
          x={r + 4}
          y={r + 4}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={compact ? 17 : 21}
          fontWeight="700"
          fill={INK}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {released}
        </text>
      </svg>
    </div>
  )
}
