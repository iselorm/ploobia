/**
 * Nara's lines — the grower's own account of the drooping cassava, as data.
 *
 * Sefu's rule, unchanged: the client, never the coach. Testimony that is
 * evidence, never an instruction, never a number the child has not measured.
 * Her habit (a can every morning), her stake (her mother's last cutting) and
 * her over-correction (she stops watering both beds the day the first one
 * stands) are the round's three turns, and each is in her mouth, not a
 * card's. The explanation gate (storyboard §05, S0-D15) is on these strings:
 * before the first stand and a DRY read, none may name the cause —
 * `verify-roots-model.mjs` runs `explainsCause` over the gated moods.
 *
 * Content, not scene logic: the Landing registers `talk.nara`, the explorer
 * opens the card, the card reads these. A language file replaces the
 * strings; the name is fixed across languages (the bible).
 */

import type { WorldState } from './archipelago'
import { cansUsed } from './plot'

export type NaraMood =
  | 'meet'
  | 'marker'
  | 'probeSeen'
  | 'poured'
  | 'waiting'
  | 'stood'
  | 'dry'
  | 'fortnight'
  | 'secondDroop'
  | 'secondLifted'
  | 'taught'
  | 'reward'
  | 'sent'

export const NARA_LINES: Record<NaraMood, readonly string[]> = {
  meet: [
    'I gave this one more this morning. It looks worse.',
    "It's the last cutting from my mother's garden. If it goes, that's the end of hers.",
    'She watered every day and hers grew. The soil here was heavy when I dug it — it holds on to water.',
    'Help me work out what it needs. Take the plot — we can keep this patch together.',
  ],
  marker: ['Help me work out what it needs. Take the plot — we can keep this patch together.'],
  probeSeen: ['Wet, is it. I thought so — it never looks dry.'],
  poured: ["That's what I did."],
  waiting: ["You're not giving it anything?"],
  stood: ['You gave it nothing. And look.'],
  dry: ["Dry already? It doesn't look thirsty."],
  fortnight: ['{cans} cans. My mother would have used twenty.'],
  secondDroop: ["Now this one's gone the same way. You said not to water — so I stopped. Both of them."],
  secondLifted: ["It came up. — It's going down again."],
  taught: ['Probe. Soaked, wait. Dry, one can. Look again tomorrow. — I can do that.'],
  reward: ["These rails were hers. They should go round yours. And take a cutting — it's time it had a second garden."],
  sent: ['Go on. Sela does not wait twice.'],
}

/** Moods a child can hear before the first stand and a DRY read — the gate runs over these. */
export const GATED_MOODS: readonly NaraMood[] = ['meet', 'marker', 'probeSeen', 'poured', 'waiting', 'stood']

/** Sela, at the jetty, with the next task — S2's brief in one line. */
export const SELA_LINES: readonly string[] = [
  'The watch needs a workshop kit and the Foundry is cold.',
  "Nara says you're the one who looks before you pour. The gate is across the water.",
]

/** Nara's mood for the state: the round's turns in order, the trial's moments in between. */
export function naraMood(s: WorldState): NaraMood {
  const p = s.plot
  if (p.sent) return 'sent'
  if (p.stage === 'reward' || p.stage === 'done') return 'reward'
  if (p.taught || p.stage === 'record' || p.stage === 'page' || p.stage === 'pause') return 'taught'
  if (p.stage === 'second' || p.stage === 'method') {
    const run = p.run
    if (run && run.days.some((d) => d.cans > 0) && run.firm13 < 0.9 && run.days.length > 1) return 'secondLifted'
    return 'secondDroop'
  }
  if (p.stage === 'first' && p.run) {
    const run = p.run
    if (run.phase === 'done' && p.rescuedFirst) return 'fortnight'
    if (p.stood && p.dryRead) return 'dry'
    if (p.stood) return 'stood'
    if (run.days.some((d) => d.cans > 0)) return 'poured'
    if (run.days.length > 0) return 'waiting'
    if (run.today.probed) return 'probeSeen'
    return 'marker'
  }
  // before the marker is in, the whole meeting — testimony, stake, habit, offer — whenever she is asked
  return 'meet'
}

export function naraLines(s: WorldState): readonly string[] {
  const mood = naraMood(s)
  const lines = NARA_LINES[mood]
  if (mood !== 'fortnight') return lines
  const run = s.plot.first ?? s.plot.run
  const cans = run ? cansUsed(run) : 0
  return lines.map((l) => l.replace('{cans}', cans === 1 ? 'One can' : `${numberWord(cans)} cans`))
}

function numberWord(n: number): string {
  const words = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']
  return words[n] ?? String(n)
}
