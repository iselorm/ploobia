/**
 * Sefu's lines — the Foreman's own account of the stall, as data.
 *
 * Sefu is the client, not the coach: Ploob says what to do next; Sefu says
 * what he saw. He ran this furnace for years and never asked why it worked,
 * which is the Great Stall in one man — so his lines are testimony, not
 * explanation. Some of it is EVIDENCE the whys later lean on (the wet stack
 * was the heaviest wood and never passed five hundred; the bellows boy
 * pumped till his arms gave and the fire never noticed). None of it is the
 * answer. He never states a number the learner has not measured.
 *
 * Content, not scene logic: the courtyard registers `talk.foreman`, the
 * explorer opens the card, the card reads these. A language file replaces
 * the strings; the name is fixed across languages (the bible).
 */

import { DOORS, type StepId, type WorldState } from './archipelago'

/** Which set of lines a state calls for. `arrive` and `done` never reach him: he is only in the courtyard, and `done` is the pour. */
export type SefuMood = Exclude<StepId, 'arrive' | 'done'> | 'poured' | 'bench'

export const SEFU_LINES: Record<SefuMood, readonly string[]> = {
  clear: [
    'The belt stopped when the copper fell off it. The small pieces you can lift — the big one wants the crane.',
    'Forty bells due Friday. I have fed this furnace everything I own and it sits there cold.',
    'My father had a rule for a machine that hides its fault: raise the Lens. It shows the air and the heat — what the eye cannot.',
  ],
  probe: [
    'I burned the wet stack first. Heaviest wood I had. The gauge never got past five hundred.',
    'Then the dry wood. Better. Still nowhere near a melt.',
    'The charcoal is the last of it. Do not waste it on guesses.',
  ],
  lens: [
    'The bellows boy pumped until his arms gave out. The fire never noticed.',
    'Good fuel, cold furnace. Three nights I have stared at it and I cannot tell you why.',
    'Raise the Lens by the furnace and follow the air. If it is going somewhere it should not, you will see it.',
  ],
  build: [
    'That pipe has been split since the rains. I never thought it mattered.',
    'If the air is going somewhere else, the fire is not getting it. Is that what you are telling me?',
  ],
  feed: [
    'I can hear the air at the mouth now. Feed it, and watch the gauge — I will watch the channel.',
    'When the copper lets go you will know. The channel lights.',
  ],
  poured: [
    'There it goes. Forty bells by Friday after all.',
    'Now tell me what you changed. I want to know it, not guess it.',
  ],
  bench: [
    'A trader wants bells that ring harder. Copper alone rings dull.',
    'There is tin on the bench. The question is how much of it — and that I have never known either.',
  ],
}

/** Sefu's lines for the state: the Bench once its door is open, the pour once it has happened, else the step. */
export function sefuMood(s: WorldState): SefuMood {
  if (DOORS['door.bench'].unlocked(s)) return 'bench'
  if (s.poured) return 'poured'
  return s.step === 'arrive' || s.step === 'done' ? 'clear' : s.step
}

export function sefuLines(s: WorldState): readonly string[] {
  return SEFU_LINES[sefuMood(s)]
}
