import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Tile } from '@/components/ui/tile'
import {
  balanceAdd,
  balanceInspect,
  balanceTake,
  balanceToFire,
  benchDone,
  benchDrop,
  benchLift,
  benchMark,
  benchSink,
  benchTake,
  leaveRoom,
  openBench,
  type WorldState,
} from '@/lib/archipelago'
import { PIECES, benchGap, benchLevel_, benchReached, benchToMark, densityOf, kitCast, massOf, runnerOffered, tooHeavy, trayFor, type Bench, type Piece } from '@/lib/supply'
import { benchPill, type BenchRoom } from '@/lib/benchui'

/**
 * S2 — the cold bench on screen (storyboard v3.1 §07; the mock reviews of
 * 28–29 Sep). Object first: the jug, the tray and the balance are in the
 * scene with their readings tagged on them (BenchScene). This file is only
 * the STRIP — one line and the verbs — at the bottom on a wide screen, at the
 * top on a phone with a scrim to calm the furnace; and the PILL a phone keeps
 * while the child has stepped away. Every number is the store's.
 */

const PIECE_NAME: Record<Piece['shape'], string> = { nugget: 'Nugget', pin: 'Pin', offcut: 'Offcut', knob: 'Knob', drip: 'Drip', bell: 'Bell piece', lump: 'Grey lump' }
const fmt = (n: number): string => n.toLocaleString('en-GB')

export function Btn({ primary, className, ...p }: React.ComponentProps<typeof Tile> & { primary?: boolean }) {
  return <Tile {...p} className={cn('rounded-full px-3.5 py-2 text-[12.5px] font-extrabold whitespace-nowrap text-[#2A2823]', primary ? 'lg-btn-amber' : 'lg-btn', className)} />
}

/**
 * The strip's frame: eyebrow + line left, verbs right; phones put it at the top under a scrim.
 * `top` keeps it at the top on a wide screen too (the furnace room's own plate has the bottom);
 * `narrow` keeps it clear of the quest plate there.
 */
export function Strip({
  who,
  line,
  compact,
  children,
  testid,
  lineTestid = 'bench-line',
  top = false,
  narrow = false,
  low = false,
}: {
  who: string
  line: React.ReactNode
  compact: boolean
  children?: React.ReactNode
  testid: string
  lineTestid?: string
  top?: boolean
  narrow?: boolean
  /** Sit lower on a wide screen: for a room whose object needs the middle of the frame. */
  low?: boolean
}) {
  return (
    <>
      {compact && <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#14100C]/45 to-transparent" />}
      <div className={cn('pointer-events-auto absolute inset-x-0 z-30 flex justify-center px-3', compact ? 'top-2' : top ? 'top-16' : low ? 'bottom-6' : 'bottom-[5.5rem]')} data-focus-layer="">
        <div className={cn('lg flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-[20px]', compact ? 'max-w-[52rem] px-3.5 py-2' : narrow ? 'max-w-[30rem] px-4.5 py-3' : 'max-w-[46rem] px-4.5 py-3')} data-testid={testid}>
          <div className={cn('flex-1', narrow ? 'min-w-[11rem] basis-[12rem]' : 'min-w-[14rem] basis-[16rem]')}>
            <span className="atlas-eyebrow block">{who}</span>
            <span className={cn('block leading-snug font-bold text-[#2A2823]', compact ? 'text-[13px]' : 'text-[15px]')} data-testid={lineTestid}>
              {line}
            </span>
          </div>
          <div className="flex flex-none flex-wrap justify-end gap-2">{children}</div>
        </div>
      </div>
    </>
  )
}

export function BenchStrip({ s, room, band, compact }: { s: WorldState; room: BenchRoom; band: string; compact: boolean }) {
  const b = s.supply?.bench
  const [inspecting, setInspecting] = useState(false)
  if (!b) return null
  const back = <Btn onClick={() => leaveRoom()} data-testid="bench-back">Step back</Btn>

  if (room === 'bench') {
    switch (b.phase) {
      case 'idle':
        return (
          <Strip who="The cold bench · Measure" line="“Water first. Water tells you what copper will.”" compact={compact} testid="bench-strip">
            <Btn primary onClick={() => benchSink()} data-testid="bench-sink">Sink the pattern</Btn>
            {back}
          </Strip>
        )
      case 'pattern':
        return (
          <Strip who="The cold bench · Measure" line="The pattern is under. The water rose to the line it stands at now." compact={compact} testid="bench-strip">
            <Btn primary onClick={() => benchMark()} data-testid="bench-mark">Mark the rise</Btn>
            {back}
          </Strip>
        )
      case 'marked':
        return (
          <Strip who="The cold bench · Measure" line="Marked. Now lift it out; the mark stays." compact={compact} testid="bench-strip">
            <Btn primary onClick={() => benchLift()} data-testid="bench-lift">Lift it out</Btn>
            {back}
          </Strip>
        )
      case 'matching': {
        const reached = benchReached(b)
        const tray = trayFor(band as 'explorer').filter((p) => !b.inJug.includes(p.id))
        return (
          <Strip
            who="The cold bench · Measure"
            line={reached ? "That's the mark." : `Drop scrap in until the water reaches the mark. ${fmt(benchToMark(b))} to go.`}
            compact={compact}
            testid="bench-strip"
          >
            {/* tap alternatives to the scene's pieces (the drag is shown by the ghost hand) */}
            {tray.map((p) => (
              <Btn key={p.id} onClick={() => benchDrop(p.id)} data-testid={`drop-${p.id.slice(6)}`} className="px-3">
                {PIECE_NAME[p.shape]} ↓
              </Btn>
            ))}
            {b.inJug.length > 0 && (
              <Btn onClick={() => benchTake(b.inJug[b.inJug.length - 1])} data-testid="bench-take">
                Take one out
              </Btn>
            )}
            <Btn primary={reached} onClick={() => benchDone()} data-testid="bench-done" disabled={b.inJug.length === 0}>
              {reached ? "That's the mark" : 'Take it as it is'}
            </Btn>
            {back}
          </Strip>
        )
      }
      case 'balancing':
      case 'charged':
        return (
          <Strip who="The cold bench" line={b.phase === 'charged' ? 'The wet set stays here. The dry pan has gone to the fire.' : 'The set is on the balance.'} compact={compact} testid="bench-strip">
            {b.phase === 'balancing' && <Btn primary onClick={() => openBench('balance')} data-testid="bench-to-balance">To the balance</Btn>}
            {back}
          </Strip>
        )
    }
  }

  // the balance room
  if (b.phase !== 'balancing' && b.phase !== 'charged') {
    return (
      <Strip who="The balance" line={b.castDry > 0 ? 'The short cast is on the dry pan. The jug first.' : 'Nothing on the pans yet. The jug first.'} compact={compact} testid="balance-strip">
        <Btn primary onClick={() => openBench('bench')} data-testid="balance-to-jug">To the jug</Btn>
        {back}
      </Strip>
    )
  }
  if (b.phase === 'charged' && kitCast(s.supply?.cast)) {
    // After the kit: the pan is gone and the pour is made — nothing here still points at the mould.
    return (
      <Strip who="The balance" line="The dry pan went to the fire, and the fittings are cast. The wet set stays." compact={compact} testid="balance-strip">
        {back}
      </Strip>
    )
  }
  if (b.phase === 'charged') {
    return (
      <Strip
        who="Sefu · the Foreman"
        line={
          <>
            “Dry goes to the fire.” <span className="font-semibold text-[#6F6857]">{fmt(b.charge ?? 0)} g, the runner in. The wet set stays. Sefu pours at the mould, by the furnace foot.</span>
            {b.sentUnlevel && <span className="font-semibold text-[#B8741A]"> “You sent me a guess. The beam wasn't level.”</span>}
          </>
        }
        compact={compact}
        testid="balance-strip"
      >
        {back}
      </Strip>
    )
  }
  const level = benchLevel_(b)
  const gap = benchGap(b)
  const canInspect = band === 'analyst' && b.dry > 0 && !level
  // A dry-heavy pan is never sent: Sefu melts no more than was measured (Selorm, 2 Oct).
  const heavy = tooHeavy(b)
  return (
    <>
      <Strip
        who="Sefu · the Foreman"
        line={
          level ? (
            <>
              “Wet stays here. Dry goes to the fire.” <span className="font-semibold text-[#6F6857]">{runnerOffered(b) ? '“And one more for the channel. It comes back.”' : ''}</span>
            </>
          ) : heavy ? (
            "“Dry side's heavy. I'll not melt more than you measured.”"
          ) : (
            '“Wet stays here. Dry goes to the fire.”'
          )
        }
        compact={compact}
        testid="balance-strip"
      >
        <Btn onClick={() => balanceAdd()} data-testid="balance-add">Add a dry ingot</Btn>
        <Btn onClick={() => balanceTake()} data-testid="balance-take" disabled={b.dry <= b.castDry}>Take one off</Btn>
        {canInspect && (
          <Btn onClick={() => setInspecting((v) => !v)} data-testid="balance-inspect" className={cn(inspecting && 'ring-2 ring-[#E8A33D]')}>
            Inspect the set
          </Btn>
        )}
        {!heavy && (
          <Btn primary={level} onClick={() => balanceToFire()} data-testid="balance-fire" disabled={b.dry === 0}>
            {level ? 'To the fire' : 'Send it anyway'}
          </Btn>
        )}
        {back}
      </Strip>
      {canInspect && inspecting && <InspectSheet b={b} compact={compact} gap={gap} />}
    </>
  )
}

/** The Analyst's second look: each piece of the wet set, weighed and sunk alone. Only here does a suspect get its mark. */
function InspectSheet({ b, compact, gap }: { b: Bench; compact: boolean; gap: number }) {
  return (
    <div className={cn('pointer-events-auto absolute z-30 flex justify-center px-3', compact ? 'inset-x-0 bottom-2' : 'inset-x-0 bottom-[13rem]')}>
      <div className={cn('lg w-full rounded-[18px] px-3.5 py-2.5', compact ? 'max-w-[52rem]' : 'max-w-[46rem]')} data-testid="inspect-sheet">
        <p className={cn('font-bold text-[#2A2823]', compact ? 'text-[11px]' : 'text-[12px]')}>
          The set weighs {fmt(Math.abs(gap))} g {gap < 0 ? 'less' : 'more'} than its volume says. Weigh each piece alone, and sink it alone.
        </p>
        <div className={cn('flex flex-wrap', compact ? 'mt-1 gap-1.5' : 'mt-2 gap-2')}>
          {b.inJug.map((id) => {
            const p = PIECES[id]
            if (!p) return null
            const seen = b.inspected.includes(id)
            const off = p.metal !== 'copper'
            return (
              <div key={id} className={cn('flex items-center gap-2 rounded-full border px-2 py-1', seen && off ? 'border-[#C0392B] bg-[#C0392B]/10' : 'border-white/60 bg-white/40')} data-testid={`inspect-${id.slice(6)}`}>
                <span className="text-[12px] font-extrabold text-[#2A2823]">{PIECE_NAME[p.shape]}</span>
                {seen ? (
                  <span className={cn('text-[11.5px] font-bold tabular-nums', off ? 'text-[#C0392B]' : 'text-[#6F6857]')}>
                    {p.cm3} cm³ · {fmt(massOf(p))} g · {densityOf(p).toFixed(2)} g/cm³{off ? ' · not copper' : ''}
                  </span>
                ) : (
                  <Btn onClick={() => balanceInspect(id)} className="px-2.5 py-1 text-[11px]" data-testid={`weigh-${id.slice(6)}`}>
                    Weigh it alone
                  </Btn>
                )}
                {seen && off && (
                  <Btn onClick={() => benchTake(id)} className="px-2.5 py-1 text-[11px]" data-testid={`out-${id.slice(6)}`}>
                    Take it out
                  </Btn>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Phones: the bench's reading while the child has stepped away, in Ploob's slot. */
export function BenchPill({ s }: { s: WorldState }) {
  const b = s.supply?.bench
  const pill = b ? benchPill(b) : null
  if (!b || !pill) return null
  return (
    <div className="pointer-events-auto absolute bottom-3 left-[9rem] right-[13.5rem] flex justify-center">
      <Tile className="lg flex h-11 items-center gap-2 !rounded-full px-3.5 text-[14px] font-extrabold text-[#2A2823]" data-testid="bench-pill" onClick={() => openBench(b.phase === 'balancing' ? 'balance' : 'bench')}>
        <span className={cn('inline-block h-4 w-2.5 rounded-b-sm border-2', b.phase === 'balancing' ? 'border-[#3D332A] bg-[#C8743A]' : 'border-[#2F6F94] bg-[#6FA8CF]/70')} aria-hidden />
        {pill.text}
        <span className="font-bold text-[#6F6857]">· {pill.sub}</span>
        <span aria-hidden>▴</span>
      </Tile>
    </div>
  )
}

/** The furnace plate, folded to one line while one of S2's rooms is open: the furnace is not the task now — unless its fire has dropped. */
export function FurnaceReady({ temp, ready }: { temp: number; ready: boolean }) {
  return (
    <p className={cn('mt-1.5 border-t border-[#F6F2E8]/15 pt-1.5 text-[11px] font-extrabold', ready ? 'text-[#F6F2E8]/85' : 'text-[#F0B354]')} data-testid="furnace-ready">
      {ready ? 'Furnace ready' : 'Fire low'} · {Math.round(temp)} °C
    </p>
  )
}
