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
import { cansUsed, recoveryLine, methodReply, methodSteps, type MethodSteps, type PlotRun } from './plot'
import { contradicts, type CareMode, type HandoffChoice, type KeepReport } from './keep'
import type { ProbeWord } from './roots'

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
  if (mood === 'stood' && s.plot.run) return [recoveryLine(s.plot.run, 'nara')]
  if (mood === 'taught') return [methodReply(methodSteps([s.plot.first, s.plot.run].filter((r): r is PlotRun => !!r)))]
  if (mood !== 'fortnight') return lines
  const run = s.plot.first ?? s.plot.run
  const cans = run ? cansUsed(run) : 0
  return lines.map((l) => l.replace('{cans}', cans === 1 ? 'One can' : `${numberWord(cans)} cans`))
}

function numberWord(n: number): string {
  const words = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']
  return words[n] ?? String(n)
}

/* ----------------------------------------------------------------------------
 * S1 — The Handoff (storyboard v3.1). Same rule: Nara reports what she saw
 * and did; the child supplies the explanation. Every day and count in a
 * report comes from the stored marks, never from these templates.
 * ------------------------------------------------------------------------- */

/** Her question, at the plot, once S0 is done. */
export const HANDOFF_ASK = 'So what do I do each morning?'

/** Nara's say-back for each choice. Nothing runs until the child answers "Yes, that". */
export const SAY_BACK: Readonly<Record<HandoffChoice, string>> = {
  right: 'Probe first. Soaked or damp, I wait. Dry, one can. Check again tomorrow. On both beds. Yes?',
  daily: "One can every morning, whatever the probe says. I'll test that on the far bed. Yes?",
  droop: "When the leaves go down, one can the next morning. I'll test that on the far bed. Yes?",
  leave: "Leave the far bed without watering. I'll watch it and stop if it gets too low. Yes?",
  supervised: "I'll keep doing what you showed me, with Sela's people helping when I'm unsure. Yes?",
}

/** Said before any trial begins: her mother's bed stays safe, and the two stops. */
export const TRIAL_TERMS: readonly string[] = [
  "My mother's bed stays on what you showed me. I'll only try this on the far bed.",
  "If the probe says soaked, I won't pour, whatever the rule says — I've seen what that does. And if the leaves go too low, Sela's people take over.",
]

/** When a rule goes against what the child did at the beds: the difference, never a verdict. */
export const CONTRADICTION: Readonly<Record<'daily' | 'droop' | 'leave', string>> = {
  daily: 'On soaked mornings you probed and waited. This says a can every morning. Which should I try on the far bed?',
  droop: 'You looked at the probe before you looked at the leaves. This waits for the leaves. Which should I try on the far bed?',
  leave: 'On dry mornings you gave it a can. This says leave it. Which should I try on the far bed?',
}

/** The line for a rule that contradicts the demonstration, or null. */
export function contradictionLine(choice: HandoffChoice, steps: MethodSteps): string | null {
  return choice !== 'right' && choice !== 'supervised' && contradicts(choice, steps) ? CONTRADICTION[choice] : null
}

/** Sela at her board, before the child goes. */
export const SELA_DISPATCH = {
  brief: "The watch needs a workshop kit, and the Foundry is cold. Go and light it. A fortnight passes here while you're away.",
  /** By the far bed's care: how many of her four stay on the beds. */
  independent: 'If Nara keeps both beds, I need one of mine carrying for her. Three go to packing.',
  supervised: 'If Nara wants my people beside her, three stay on the beds. One packs. One crate.',
  trial: "If she's trying something new, I keep three here. One crate.",
} as const

/** Sela at the jetty, on the return — about the child first, the crates after. */
export const SELA_RETURN = {
  held: 'What you taught her held. Two of mine came back to packing — three crates ready.',
  heldCrew: 'She kept it most of the way. My people stepped in near the end. Three crates ready all the same.',
  supervised: 'They kept the beds together. One crate ready.',
  stopped: "My people took over the far bed. It's fine. One crate ready.",
  trialRan: 'Her trial ran the whole fortnight. My people stayed by it. One crate ready.',
  practice: 'No crates from a practice fortnight. The beds are where you left them, two weeks on.',
} as const

export type ReportOutcome = 'held' | 'heldCrew' | 'pause' | 'supervised' | 'refused' | 'noonStop' | 'droopRan' | 'trialRan'

export function reportOutcome(r: KeepReport): ReportOutcome {
  const far = r.beds.far
  if (far.mode === 'supervised') return 'supervised'
  if (far.mode === 'trial') {
    if (far.stop?.by === 'soaked-refusal') return 'refused'
    if (far.stop?.by === 'noon-stop') return 'noonStop'
    return far.rule === 'droop' ? 'droopRan' : 'trialRan'
  }
  if (r.pauseDay != null) return 'pause'
  return far.crewCalled != null ? 'heldCrew' : 'held'
}

/** Sela's first words on the return. */
export function selaReturnLine(r: KeepReport): string {
  if (r.kind === 'practice') return SELA_RETURN.practice
  switch (reportOutcome(r)) {
    case 'held':
    case 'pause':
      return SELA_RETURN.held
    case 'heldCrew':
      return SELA_RETURN.heldCrew
    case 'supervised':
      return SELA_RETURN.supervised
    case 'refused':
    case 'noonStop':
      return SELA_RETURN.stopped
    default:
      return SELA_RETURN.trialRan
  }
}

const WORD_SAID: Readonly<Record<ProbeWord, string>> = { SOAKED: 'soaked', DAMP: 'damp', DRY: 'dry' }

/**
 * Nara's first line of the report, from the far bed's marks. Templates carry
 * {day} and {word}; the words she uses are the probe's own.
 */
export function naraReportLine(r: KeepReport): string {
  const far = r.beds.far
  const at = (day: number | null | undefined) => (day != null ? far.marks.find((m) => m.day === day) : undefined)
  switch (reportOutcome(r)) {
    case 'refused': {
      const m = at(far.stop?.day)
      return `Day ${m?.day ?? '?'} the probe said soaked. Your rule said pour. I stopped, and Sela's people have it now.`
    }
    case 'noonStop': {
      const trig = far.stop ? at(far.stop.day - 1) : undefined
      return far.rule === 'leave'
        ? `I left it without water. Day ${trig?.day ?? '?'} the leaves went too low, so I stopped. Sela's people watered it and it came back.`
        : `Day ${trig?.day ?? '?'} the leaves went too low, so I stopped your rule. Sela's people took over and it came back.`
    }
    case 'pause': {
      const m = at(r.pauseDay)
      const w = m ? WORD_SAID[m.word] : 'something new'
      const did = m?.action === 'can' ? 'gave it a can' : 'waited'
      return `Day ${m?.day ?? '?'} the far bed read ${w}. You never showed me ${w} on that bed. I ${did}. Was that right — and why?`
    }
    case 'supervised':
      return "I wasn't sure how to use the method here. Sela's people stayed with me. We kept it up together."
    case 'droopRan':
      return 'I waited for the leaves to go down, then watered next morning. They came up, then drooped again.'
    case 'trialRan':
      return 'I kept to your rule the whole fortnight. Look at the marks.'
    case 'heldCrew': {
      return `I kept to the method. Day ${far.crewCalled != null ? far.crewCalled - 1 : '?'} the leaves went low all the same, so Sela's people came.`
    }
    case 'held': {
      // "After the rain…" only when the marks show it: a wait on a wet reading after rain fell.
      const waited = r.weatherMm > 0 ? far.marks.find((m) => m.day > 1 && m.word !== 'DRY' && m.intended === 'wait' && far.marks.some((p) => p.day < m.day && p.action === 'can')) : undefined
      if (waited) return 'After the rain, I had the can ready. I checked the probe — and waited.'
      const cans = far.marks.filter((m) => m.action === 'can').length
      return `I probed every morning. Dry, one can; otherwise I waited. ${cans === 1 ? 'One can' : `${cans} cans`} in fourteen days.`
    }
  }
}

/** The faint second line on a stopped trial's report: labelled, never presented as what happened. */
export const COUNTERFACTUAL_LABEL = 'If she had kept to the rule — this did not happen.'

/** Portrait label by the far bed's care. */
export const ASSIGNMENT_LABEL: Readonly<Record<CareMode, string>> = {
  independent: 'Keeping both beds',
  supervised: "Working with Sela's people",
  trial: 'Trying your rule on the far bed',
}
