import { useMemo, useState } from 'react'
import { ArrowRight, Check, Lock, X } from 'lucide-react'
import { Tile } from '@/components/ui/tile'
import { cn } from '@/lib/utils'
import { CATEGORY_META, ELEMENT_BY_Z, ELEMENTS } from '@/lib/atoms'
import { appetiteOf, pairOutlook, reactionFor, ratioQuestion, STRUCTURE_NOTES, type Outlook } from '@/lib/matter'
import type { Bench, Level } from '@/lib/foundry'
import { AtlasButton, Chip, Dial } from '@/components/sugar/hud/AtlasKit'

/**
 * Door 2's HUD — the picker, the dial and the readout.
 *
 * The whole of this file is arranged around one rule, and it is worth stating
 * where the components live rather than only in the model:
 *
 *   **Say what will happen and why. Never say the number being predicted.**
 *
 * So `ElementPicker` tags every tile with what it would *do* against whatever
 * is in the other slot — swaps, shares, mixes only, refuses — and never with
 * what would form. `RatioDial` asks the question. And `Readout` is the only
 * component here that may name a formula, which is why it takes `locked` and
 * renders nothing at all until it is true.
 *
 * The bug this shape exists to prevent had no error and nothing visibly wrong:
 * a readout that read `sim.product ?? sim.pair` printed the answer above the
 * dial that was asking for it, and every prediction in the cabinet quietly
 * became a reading-comprehension exercise.
 */

const OUTLOOK_TONE: Record<Outlook, 'good' | 'sugar' | 'neutral'> = {
  swap: 'good',
  share: 'good',
  mix: 'neutral',
  refuse: 'neutral',
}

/** The elements the bench offers. Z ≤ 20, minus nothing — the refusals teach too. */
const BENCH_ELEMENTS = [1, 6, 7, 8, 11, 12, 16, 17, 20, 10]

export function ElementPicker({
  bench,
  slot,
  allowance,
  compact,
  onPick,
  onClear,
}: {
  bench: Bench
  /** Which pad the next pick lands on. */
  slot: 'a' | 'b'
  /** How many of each element this job allows, by symbol. */
  allowance: Record<string, number>
  compact: boolean
  onPick: (z: number) => void
  onClear: (slot: 'a' | 'b') => void
}) {
  const other = slot === 'a' ? bench.b : bench.a
  return (
    <div className="atlas-plate pointer-events-auto flex h-full flex-col gap-2 p-3" data-testid="picker">
      <div className="flex items-baseline justify-between">
        <span className="atlas-serif text-[17px] font-semibold text-[#2A2823]">Elements</span>
        <Chip>pad {slot === 'a' ? 'one' : 'two'}</Chip>
      </div>
      {/* The rule of thumb, in full, above the tiles that apply it. */}
      <span className="text-[11px] font-bold text-[#8B8471]">
        {other === null
          ? 'Pick one for each pad. Each tile says what that atom has and what it wants.'
          : `Against ${ELEMENT_BY_Z[other]?.name}: a metal and a non-metal swap electrons, two non-metals share them, two metals only mix, and a full shell refuses.`}
      </span>

      <div className={cn('grid gap-1.5 overflow-y-auto', compact ? 'grid-cols-2' : 'grid-cols-2')}>
        {BENCH_ELEMENTS.map((z) => {
          const el = ELEMENT_BY_Z[z]
          if (!el) return null
          const left = allowance[el.symbol]
          const out = left !== undefined && left <= 0
          const look = other === null ? null : pairOutlook(z, other)
          return (
            <Tile
              key={z}
              onClick={() => onPick(z)}
              disabled={out}
              aria-label={`Put ${el.name} on pad ${slot === 'a' ? 'one' : 'two'}`}
              data-testid={`pick-${el.symbol}`}
              data-outlook={look?.kind ?? ''}
              className="flex flex-col items-start gap-0.5 rounded-[12px] border border-[#E4DCC9] bg-[#FBF8EF] p-2 text-left active:scale-[0.98] disabled:opacity-35"
            >
              <div className="flex w-full items-baseline justify-between">
                <span className="atlas-serif text-[19px] leading-none font-semibold text-[#2A2823]">{el.symbol}</span>
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: CATEGORY_META[el.category].tint }}
                  aria-hidden
                />
              </div>
              {/* The appetite: the material a learner needs to derive the answer,
                  and never the answer. */}
              <span className="text-[9.5px] font-extrabold text-[#8B8471]">{appetiteOf(z)}</span>
              {look && (
                <Chip tone={OUTLOOK_TONE[look.kind]}>
                  <span className="text-[9px]">{look.tag}</span>
                </Chip>
              )}
            </Tile>
          )
        })}
      </div>

      <div className="min-h-0 grow" />
      <div className="flex gap-1.5">
        {(['a', 'b'] as const).map((s) => {
          const z = s === 'a' ? bench.a : bench.b
          const el = z === null ? null : ELEMENT_BY_Z[z]
          return (
            <Tile
              key={s}
              onClick={() => onClear(s)}
              disabled={z === null}
              aria-label={`Clear pad ${s === 'a' ? 'one' : 'two'}`}
              data-testid={`pad-${s}`}
              data-z={z ?? ''}
              className={cn(
                'flex flex-1 items-center justify-center gap-1 rounded-[12px] border py-2 text-[13px] font-black',
                z === null ? 'border-dashed border-[#D8D0BC] text-[#B9B09A]' : 'border-[#E4DCC9] bg-[#FBF8EF] text-[#2A2823]',
              )}
            >
              {el ? (
                <>
                  <span className="atlas-serif text-[17px] leading-none font-semibold">{el.symbol}</span>
                  <X className="h-3.5 w-3.5 opacity-50" />
                </>
              ) : (
                <span className="text-[11px] font-bold">pad {s === 'a' ? 'one' : 'two'}</span>
              )}
            </Tile>
          )
        })}
      </div>
    </div>
  )
}

/**
 * The picker, for a layout with no side columns.
 *
 * A phone has no left column, so the panel above simply did not render and
 * Door 2 could not be played at all on a phone — the elements were in a place
 * the layout does not have. This is the same content laid along the bottom:
 * the pads, then a strip of tiles that still carry the appetite and the
 * outlook, scrolling sideways under a thumb.
 */
export function ElementStrip({
  bench,
  slot,
  allowance,
  onPick,
  onClear,
}: {
  bench: Bench
  slot: 'a' | 'b'
  allowance: Record<string, number>
  onPick: (z: number) => void
  onClear: (s: 'a' | 'b') => void
}) {
  const other = slot === 'a' ? bench.b : bench.a
  return (
    <div className="atlas-plate pointer-events-auto flex w-full flex-col gap-1.5 px-2 py-1.5" data-testid="picker">
      <div className="flex items-center gap-1.5">
        {(['a', 'b'] as const).map((sl) => {
          const z = sl === 'a' ? bench.a : bench.b
          const el = z === null ? null : ELEMENT_BY_Z[z]
          return (
            <Tile
              key={sl}
              onClick={() => onClear(sl)}
              disabled={z === null}
              aria-label={`Clear pad ${sl === 'a' ? 'one' : 'two'}`}
              data-testid={`pad-${sl}`}
              data-z={z ?? ''}
              className={cn(
                'flex min-h-[--hit] flex-1 items-center justify-center gap-1 rounded-[12px] border text-[13px] font-black',
                z === null ? 'border-dashed border-[#D8D0BC] text-[#B9B09A]' : 'border-[#E4DCC9] bg-[#FBF8EF] text-[#2A2823]',
              )}
            >
              {el ? (
                <>
                  <span className="atlas-serif text-[16px] leading-none font-semibold">{el.symbol}</span>
                  <X className="h-3 w-3 opacity-50" />
                </>
              ) : (
                <span className="text-[10.5px] font-bold">pad {sl === 'a' ? 'one' : 'two'}</span>
              )}
            </Tile>
          )
        })}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {BENCH_ELEMENTS.map((z) => {
          const el = ELEMENT_BY_Z[z]
          if (!el) return null
          const left = allowance[el.symbol]
          const out = left !== undefined && left <= 0
          const look = other === null ? null : pairOutlook(z, other)
          return (
            <Tile
              key={z}
              onClick={() => onPick(z)}
              disabled={out}
              aria-label={`Put ${el.name} on pad ${slot === 'a' ? 'one' : 'two'}`}
              data-testid={`pick-${el.symbol}`}
              data-outlook={look?.kind ?? ''}
              className="flex min-h-[--hit] shrink-0 flex-col items-center justify-center rounded-[12px] border border-[#E4DCC9] bg-[#FBF8EF] px-2.5 py-1 disabled:opacity-35"
            >
              <span className="atlas-serif text-[16px] leading-none font-semibold text-[#2A2823]">{el.symbol}</span>
              <span className="text-[8.5px] font-extrabold text-[#8B8471]">{look ? look.tag : appetiteOf(z).split(' · ')[1]}</span>
            </Tile>
          )
        })}
      </div>
    </div>
  )
}

/**
 * The dial. Asked before any readout exists, and it takes its own wording from
 * `ratioQuestion`, so the label, the recorded answer and the marking cannot
 * drift apart — which is how a learner who correctly predicted 2 for water was
 * once told they were wrong.
 */
export function RatioDial({ level, bench, compact, onLock }: { level: Level; bench: Bench; compact: boolean; onLock: (n: number) => void }) {
  const q = useMemo(() => {
    if (level.target.kind !== 'pair' || bench.a === null || bench.b === null) return null
    const r = reactionFor(bench.a, bench.b)
    return r.formula ? ratioQuestion(r.formula) : null
  }, [level, bench])
  const [n, setN] = useState(1)
  if (!q) return null
  const why = bench.a !== null && bench.b !== null ? pairOutlook(bench.a, bench.b) : null
  return (
    <div
      className={cn(
        'atlas-plate atlas-arrive pointer-events-auto flex w-full max-w-[30rem] flex-col p-4',
        // A landscape phone is 390 px tall and this card was taller than that,
        // which put "Lock it in" below the fold — the one control the round
        // cannot continue without. So on compact the *body* scrolls and the
        // button is pinned outside it: a control that is always reachable
        // matters more than a card that is always whole.
        compact ? 'max-h-[74vh] gap-2 p-3' : 'gap-3',
      )}
      data-testid="dial"
    >
      <div className={cn('flex min-h-0 flex-col', compact ? 'gap-2 overflow-y-auto' : 'gap-3')}>
      <div>
        <span className="atlas-eyebrow">Before the bench tells you</span>
        <p className="text-[15px] leading-snug font-black text-[#2A2823]">{q.text}</p>
      </div>
      {/* The reasoning in full — what will happen and why, never the number. */}
      {why && !compact && <p className="text-[11.5px] leading-snug font-bold text-[#5A5445]">{why.why}</p>}
      {!compact && (
        <div className="flex items-center gap-2 text-[11px] font-extrabold text-[#8B8471]">
          {bench.a !== null && <span>{ELEMENT_BY_Z[bench.a]?.symbol}: {appetiteOf(bench.a)}</span>}
          <span aria-hidden>·</span>
          {bench.b !== null && <span>{ELEMENT_BY_Z[bench.b]?.symbol}: {appetiteOf(bench.b)}</span>}
        </div>
      )}
      <Dial
        label={`${q.askSymbol} per one ${q.perSymbol}`}
        value={n}
        display={`${n} ${q.askSymbol}`}
        min={1}
        max={6}
        step={1}
        color="#1F6F73"
        onChange={setN}
        note={compact ? undefined : 'Nothing on this bench has told you the answer. Work it out from what each atom wants.'}
      />
      </div>
      <AtlasButton onClick={() => onLock(n)} tone="primary" invite className={cn('w-full py-2.5', compact && 'mt-2')} ariaLabel="Lock in the prediction">
        <Lock className="h-4 w-4" /> Lock it in
      </AtlasButton>
      {!compact && <p className="text-[10.5px] font-bold text-[#8B8471]">Say it before you see it. That is the whole of the round.</p>}
    </div>
  )
}

/**
 * What formed.
 *
 * The only component in this file allowed to name a formula — and it renders
 * nothing until `locked`. That guard is not defensive programming; it is the
 * single rule the cabinet is built on, expressed where it can be seen.
 */
export function Readout({ bench, locked, compact, onHandIn }: { bench: Bench; locked: boolean; compact: boolean; onHandIn: () => void }) {
  const r = useMemo(() => (bench.a !== null && bench.b !== null ? reactionFor(bench.a, bench.b) : null), [bench])
  if (!locked || !r) return null
  const pct = r.ionic === null ? null : Math.round(r.ionic * 100)
  const q = r.formula ? ratioQuestion(r.formula) : null
  const held = q && bench.predicted !== null ? bench.predicted === q.answer : null
  return (
    <div
      className={cn(
        'atlas-plate atlas-arrive pointer-events-auto flex w-full max-w-[32rem] flex-col p-4',
        compact ? 'max-h-[74vh] gap-1.5 p-3' : 'gap-2.5',
      )}
      data-testid="readout"
    >
      <div className={cn('flex min-h-0 flex-col', compact ? 'gap-1.5 overflow-y-auto' : 'gap-2.5')}>
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <span className="atlas-eyebrow">What formed</span>
          {/* Never through atlas-eyebrow: it uppercases, and "Na₃N" becomes
              "NA₃N" with the subscript mangled. */}
          <p className="atlas-serif text-[26px] leading-none font-semibold text-[#2A2823]" data-testid="formula">
            {r.formula?.text ?? 'nothing'}
          </p>
          {r.name && <p className="text-[12px] font-extrabold text-[#8A5410]">{r.name}</p>}
        </div>
        {held !== null && (
          <Chip tone={held ? 'good' : 'neutral'}>
            {held ? (
              <>
                <Check className="h-3 w-3" /> you said {bench.predicted}
              </>
            ) : (
              <>you said {bench.predicted}</>
            )}
          </Chip>
        )}
      </div>

      {r.structure && (
        <p className="text-[11.5px] leading-snug font-bold text-[#5A5445]">
          <span className="font-black text-[#2A2823]">{r.structure}. </span>
          {STRUCTURE_NOTES[r.structure]}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {r.shape !== 'none' && <Chip>shape · {r.shape}</Chip>}
        <Chip>{pct === null ? 'ionic character · not measured here' : `${pct}% ionic`}</Chip>
      </div>

      {/* Where the counting rule runs out, said plainly rather than fudged. */}
      {r.caveat && (
        <div className="rounded-[12px] border border-[#E0C89A] bg-[#FDF6E7] px-3 py-2" data-testid="caveat">
          <span className="atlas-eyebrow">The rule reaches its edge</span>
          <p className="text-[11.5px] leading-snug font-bold text-[#5A5445]">{r.caveat}</p>
        </div>
      )}

      </div>
      <AtlasButton onClick={onHandIn} tone="primary" invite className={cn('w-full py-2.5', compact && 'mt-2')} ariaLabel="Hand in">
        Hand it in <ArrowRight className="h-4 w-4" />
      </AtlasButton>
    </div>
  )
}

/** Everything the bench offers, so the page can allow what a job allows. */
export const BENCH_PICKS = BENCH_ELEMENTS.map((z) => ELEMENTS.find((e) => e.z === z)!).filter(Boolean)
