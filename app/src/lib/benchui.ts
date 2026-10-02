import { benchAvailable, mouldLookOf, pourBlocked, type WorldState } from './archipelago'
import { benchGap, benchLevel, benchLevel_, benchReached, benchToMark, castCm3, lastPour, markLevel, PATTERN_CM3, type Bench, type CastRecord, type MouldLook } from './supply'

/**
 * S2's HUD helpers, outside the components so react-refresh stays happy and
 * the suites can read them: Ploob's line for the bench, the phone pill's text,
 * and which room a bench is in.
 */

export type BenchRoom = 'bench' | 'balance'

/** A room whose task belongs to S2: the two benches and the mould. The furnace's own plate folds while one is open. */
export function supplyRoomOf(s: WorldState): BenchRoom | 'mould' | null {
  return s.room === 'bench' || s.room === 'balance' || s.room === 'mould' ? s.room : null
}

export function benchRoomOf(s: WorldState): BenchRoom | null {
  return s.room === 'bench' || s.room === 'balance' ? s.room : null
}

const fmt = (n: number): string => n.toLocaleString('en-GB')

/** Ploob's coach line while the bench has something to say (null → the quest's own coach line). */
export function benchHint(s: WorldState, band: string): string | null {
  if (s.zone !== 'foundry' || !benchAvailable(s)) return null
  const sup = s.supply
  const b = sup?.bench
  if (!sup || !b) return s.step === 'done' ? 'The cold bench by the west wall: water first.' : null
  // The mould leads once a charge has gone to the fire.
  switch (mouldLookOf(s)) {
    case 'waiting':
      return pourBlocked(s) ? "The fire's dropped. Back to the bellows: air sets how close it gets." : "Sefu's got the dry pan. The mould's at the furnace foot."
    case 'run':
      return "The channel's running."
    case 'cool':
    case 'open':
      return 'Wait for it to dull. Nobody touches it bright.'
    case 'short':
      return benchReached(b) ? 'Short. Was the beam level?' : "Short. Where's the water against the mark?"
    case 'full':
      return sup.cast.why < 0 ? "Sefu's asking. Point at what told you." : null
    case 'cold':
      break
  }
  switch (b.phase) {
    case 'idle':
      return s.room === 'bench' ? 'Sink the pattern. Watch the water.' : 'The cold bench by the west wall: water first.'
    case 'pattern':
      return 'Mark where the water stands now.'
    case 'marked':
      return 'Lift it out. The mark stays.'
    case 'matching':
      return benchReached(b) ? "That's the mark. Take the set to the balance." : `Drop scrap in until the water reaches the mark — ${fmt(benchToMark(b))} to go.`
    case 'balancing':
      if (benchLevel_(b)) return "Level. Sefu's got one more for the channel."
      if (band === 'analyst' && benchGap(b) !== 0 && b.dry > 0) return 'That grey one. Is it even copper?'
      return 'Add dry ingots until the beam sits level.'
    case 'charged':
      return 'Sefu takes the dry pan. The wet set stays here.'
  }
}

/** The phone pill: what the bench reads while the child has stepped away. */
export function benchPill(b: Bench): { text: string; sub: string } | null {
  switch (b.phase) {
    case 'pattern':
    case 'marked':
      return { text: 'Jug', sub: `${fmt(benchLevel(b))} / ${fmt(markLevel())} cm³` }
    case 'matching':
      return { text: 'Jug', sub: `${fmt(benchLevel(b))} / ${fmt(markLevel())} cm³` }
    case 'balancing':
      return { text: 'Balance', sub: `${b.dry} dry · ${benchLevel_(b) ? 'level' : 'not level'}` }
    case 'charged':
      return { text: 'Charged', sub: `${fmt(b.charge ?? 0)} g to the fire` }
    default:
      return null
  }
}

/** The phone pill for the mould: what stands at the furnace foot while the child is elsewhere in the yard. */
export function mouldPill(look: MouldLook, c: CastRecord): { text: string; sub: string } | null {
  const p = lastPour(c)
  switch (look) {
    case 'waiting':
      return { text: 'Mould', sub: 'the charge is in' }
    case 'run':
    case 'cool':
    case 'open':
      return { text: 'Mould', sub: 'pouring' }
    case 'short':
      return p ? { text: 'Mould', sub: `${fmt(castCm3(p))} of ${fmt(PATTERN_CM3)} cm³` } : null
    case 'full':
      return c.why < 0 ? { text: 'Mould', sub: 'Sefu has a question' } : null
    default:
      return null
  }
}
