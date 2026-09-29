import { benchAvailable, type WorldState } from './archipelago'
import { benchGap, benchLevel, benchLevel_, benchReached, benchToMark, markLevel, type Bench } from './supply'

/**
 * S2's HUD helpers, outside the components so react-refresh stays happy and
 * the suites can read them: Ploob's line for the bench, the phone pill's text,
 * and which room a bench is in.
 */

export type BenchRoom = 'bench' | 'balance'

export function benchRoomOf(s: WorldState): BenchRoom | null {
  return s.room === 'bench' || s.room === 'balance' ? s.room : null
}

const fmt = (n: number): string => n.toLocaleString('en-GB')

/** Ploob's coach line while the bench has something to say (null → the quest's own coach line). */
export function benchHint(s: WorldState, band: string): string | null {
  if (s.zone !== 'foundry' || !benchAvailable(s)) return null
  const b = s.supply?.bench
  if (!b) return s.step === 'done' ? 'The cold bench by the west wall: water first.' : null
  switch (b.phase) {
    case 'idle':
      return 'Sink the pattern. Watch the water.'
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
