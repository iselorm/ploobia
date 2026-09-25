/**
 * S1 — The Handoff: the fortnight Nara keeps while the child is at the Foundry.
 *
 * Pure model, no store, no rendering (storyboard v3.1, 25 Sep 2026). The
 * child confirms one instruction; Nara runs it on the far bed (her mother's
 * bed always runs the demonstrated method); a dispatch is fourteen campaign
 * days computed once, from the beds as the child left them.
 *
 * Time follows S0's own day loop (`advance` in lib/plot.ts) so the two
 * chapters read the same bed the same way:
 *   - the dawn word is read at the day's hour 0, before anything is stepped;
 *   - the can goes in at POUR_HOUR (07:00);
 *   - "noon" is the firmness after READ_HOUR (13:00) is stepped;
 *   - rain for "the night the child left" falls in hours 20–23 of day 1, so
 *     dawn 2's probe is the first reading that sees it.
 *
 * Three guards keep every valid save alive (v3.1 §04, D5′/D14):
 *   1. Nara will not pour onto SOAKED. A trial whose rule says pour on a
 *      SOAKED dawn stops at that dawn; the crew keeps the bed by the method.
 *   2. A noon below CARE_FIRM stops a trial at the next dawn.
 *      Independent care gets the same watch (the crew steps in; the
 *      allocation fixed at departure does not change).
 *   3. The story's rain is checked against the saved beds at departure:
 *      the target, lowered in steps, then moved to night 3, until the
 *      demonstrated method keeps both beds, the far bed still meets a
 *      SOAKED dawn, and the confirmed plan (guards on) keeps the far bed.
 *
 * `verify-keep-model.mjs` pins the figures and sweeps every valid S0 ending.
 */
import { CAN, probeWord, stepHour, type Bed, type ProbeWord } from './roots'
import { CARE_FIRM, DEAD_HEALTH, FORTNIGHT, POUR_HOUR, READ_HOUR, RESCUE_FIRM, type Competence, type MethodSteps, type PlotRun } from './plot'

/* ----------------------------------------------------------------------------
 * Vocabulary
 * ------------------------------------------------------------------------- */

export type Ability = Competence
export type Rule = 'right' | 'daily' | 'droop' | 'leave'
export type HandoffChoice = Rule | 'supervised'
export type CareMode = 'independent' | 'supervised' | 'trial'
export type JobState = 'available' | 'assigned' | 'executing' | 'blocked' | 'completed'
export type BedKey = 'nara' | 'far'
export type Actor = 'nara' | 'crew'
export type MarkEvent = 'pause' | 'soaked-refusal' | 'noon-stop' | 'crew-takeover' | 'crew-called'

export const RULES: readonly Rule[] = ['right', 'daily', 'droop', 'leave']
export const CHOICES: readonly HandoffChoice[] = ['right', 'daily', 'droop', 'leave', 'supervised']

export const KEEP = {
  days: FORTNIGHT,
  /** Noon below this stops a trial next dawn (and calls the crew on independent care). */
  stopFirm: CARE_FIRM,
  /** `droop` pours the dawn after a noon below this. */
  droopFirm: RESCUE_FIRM,
  /** A bed "kept": roots at or above this after the fortnight. */
  keptHealth: 0.99,
  /** The story's night-1 rain, mm, before the departure check. */
  rainTargetMm: 20,
  rainStepMm: 2,
  /** Hours of the night (day-clock) the rain falls in. */
  rainHours: [20, 21, 22, 23] as readonly number[],
  /** Nights tried, in order, by the departure check. */
  rainNights: [1, 3] as readonly number[],
  /** Sela's four workers. */
  crew: 4,
  /** Authored economy: one crate per packing worker per fortnight (labelled in the journal). */
  cratesPerPacker: 1,
  site: 'landing.jetty',
} as const

/** Weather: mm arriving in each absolute hour of the dispatch (0 = day 1, 00:00). */
export type Weather = Record<number, number>

/** `mm` spread evenly over KEEP.rainHours of `night` (night n = the night after day n). */
export function rainOn(night: number, mm: number): Weather {
  const w: Weather = {}
  if (mm <= 0) return w
  const per = mm / KEEP.rainHours.length
  for (const h of KEEP.rainHours) w[(night - 1) * 24 + h] = per
  return w
}

export function weatherMm(w: Weather): number {
  return Object.values(w).reduce((a, x) => a + x, 0)
}

/* ----------------------------------------------------------------------------
 * One bed through a fortnight
 * ------------------------------------------------------------------------- */

export interface DawnMark {
  /** 1-based campaign day of the dispatch. */
  day: number
  /** The probe word at this dawn. */
  word: ProbeWord
  /** What the rule in force said. */
  intended: 'can' | 'wait'
  /** What happened. */
  action: 'can' | 'wait'
  actor: Actor
  /** Firmness at 13:00. */
  firm13: number
  /** Living root fraction at the day's end. */
  health: number
  event?: MarkEvent
}

export interface BedPlan {
  target: BedKey
  mode: CareMode
  rule: Rule
  /**
   * Words Nara has seen the child act on at this bed. A `copies` Nara pauses
   * (mark only; the method's action stands) at the first dawn outside them.
   * Absent = no pause.
   */
  seen?: readonly ProbeWord[]
}

export interface BedRun {
  target: BedKey
  mode: CareMode
  rule: Rule
  marks: DawnMark[]
  endBed: Bed
  /** Day the trial stopped (the first crew dawn), and why. */
  stop: { day: number; by: 'soaked-refusal' | 'noon-stop' } | null
  /** Day the crew was called to independent care (the first crew dawn). */
  crewCalled: number | null
  /** Day of the copies pause. */
  pause: number | null
  /** Lowest noon after day 1, and its day. */
  low13: number
  lowDay: number
  end13: number
  health: number
  cans: number
}

function ruleSays(rule: Rule, word: ProbeWord, prevNoon: number | null): boolean {
  switch (rule) {
    case 'right':
      return word === 'DRY'
    case 'daily':
      return true
    case 'droop':
      return prevNoon != null && prevNoon < KEEP.droopFirm
    case 'leave':
      return false
  }
}

export interface RunOptions {
  weather?: Weather
  days?: number
  /** Turn the guards off — for the report's "if she had kept going" line only. */
  unguarded?: boolean
}

const cloneBed = (b: Bed): Bed => ({ ...b })

/**
 * Run one bed from `start` (not mutated). Nara's bed and supervised care run
 * `right`; a trial runs its rule until a guard stops it, then the crew runs
 * `right`.
 */
export function runBed(start: Bed, plan: BedPlan, opts: RunOptions = {}): BedRun {
  const b = cloneBed(start)
  const days = opts.days ?? KEEP.days
  const weather = opts.weather ?? {}
  const trial = plan.mode === 'trial'
  const marks: DawnMark[] = []
  let stop: BedRun['stop'] = null
  let crewCalled: number | null = null
  let pause: number | null = null
  let crewFrom: number | null = null
  let prevNoon: number | null = null
  let low13 = 1
  let lowDay = 0
  let firm13 = b.firm
  for (let day = 1; day <= days; day += 1) {
    const word = probeWord(b)
    const crew = crewFrom != null && day >= crewFrom
    const rule: Rule = crew ? 'right' : plan.rule
    const says = ruleSays(rule, word, prevNoon)
    let pour = says
    let event: MarkEvent | undefined
    if (crew && day === crewFrom) event = stop ? 'crew-takeover' : 'crew-called'
    if (!crew && trial && !opts.unguarded && says && word === 'SOAKED') {
      // Guard 1 — her mother's bed taught her this; the trial ends here.
      pour = false
      stop = { day, by: 'soaked-refusal' }
      crewFrom = day
      event = 'soaked-refusal'
    }
    if (!crew && pause == null && plan.seen && !plan.seen.includes(word)) {
      pause = day
      event = event ?? 'pause'
    }
    for (let h = 0; h < 24; h += 1) {
      const abs = (day - 1) * 24 + h
      stepHour(b, abs, h === POUR_HOUR && pour ? CAN : 0, weather[abs] ?? 0)
      if (h === READ_HOUR) firm13 = b.firm
    }
    if (day === 1) b.minFirm = 1
    if (day > 1 && firm13 < low13) {
      low13 = firm13
      lowDay = day
    }
    const actor: Actor = crewFrom != null && day >= crewFrom ? 'crew' : 'nara'
    marks.push({ day, word, intended: says ? 'can' : 'wait', action: pour ? 'can' : 'wait', actor, firm13, health: b.health, ...(event ? { event } : {}) })
    // Guard 2 — the noon bound, and the same watch on independent care.
    if (!opts.unguarded && crewFrom == null && firm13 < KEEP.stopFirm && day < days) {
      if (trial) {
        stop = { day: day + 1, by: 'noon-stop' }
        crewFrom = day + 1
      } else if (plan.mode === 'independent') {
        crewCalled = day + 1
        crewFrom = day + 1
      }
    }
    prevNoon = firm13
  }
  return {
    target: plan.target,
    mode: plan.mode,
    rule: plan.rule,
    marks,
    endBed: b,
    stop,
    crewCalled,
    pause,
    low13,
    lowDay,
    end13: firm13,
    health: b.health,
    cans: marks.filter((m) => m.action === 'can').length,
  }
}

/** The bed kept: roots intact and never below the care line at noon. */
export function kept(r: BedRun): boolean {
  return r.health >= KEEP.keptHealth && r.low13 >= KEEP.stopFirm
}

export function dead(r: BedRun): boolean {
  return r.health <= DEAD_HEALTH
}

/* ----------------------------------------------------------------------------
 * Guard 3 — the weather, checked at departure
 * ------------------------------------------------------------------------- */

export interface WeatherPick {
  weather: Weather
  targetMm: number
  mm: number
  /** 0 = no rain passed the check. */
  night: number
}

/** Rain amounts the target down to one step, largest first. */
export function rainLadder(target: number = KEEP.rainTargetMm): number[] {
  const out: number[] = []
  for (let mm = target; mm >= KEEP.rainStepMm; mm -= KEEP.rainStepMm) out.push(mm)
  return out
}

/** Does the demonstrated method keep this bed under this rain? */
export function methodKeeps(start: Bed, w: Weather): boolean {
  return kept(runBed(start, { target: 'nara', mode: 'independent', rule: 'right' }, { weather: w, unguarded: true }))
}

/** Does the far bed meet a SOAKED dawn under the method with this rain? */
export function soakedDawn(far: Bed, w: Weather): boolean {
  return runBed(far, { target: 'far', mode: 'independent', rule: 'right' }, { weather: w, unguarded: true }).marks.some((m) => m.word === 'SOAKED')
}

/**
 * The largest rain, night 1 before night 3, under which the method keeps both
 * beds, the far bed meets a SOAKED dawn, and — when `farPlan` is given — the
 * child's confirmed plan, guards on, keeps the far bed's roots. The last
 * condition matters: a trial that wetted the bed for a few dawns can meet a
 * rain the method alone would have shrugged off.
 */
export function chooseWeather(nara: Bed, far: Bed, farPlan?: BedPlan, targetMm: number = KEEP.rainTargetMm): WeatherPick {
  for (const night of KEEP.rainNights) {
    for (const mm of rainLadder(targetMm)) {
      const w = rainOn(night, mm)
      if (!methodKeeps(nara, w) || !methodKeeps(far, w) || !soakedDawn(far, w)) continue
      if (farPlan && runBed(far, farPlan, { weather: w }).health < KEEP.keptHealth) continue
      return { weather: w, targetMm, mm, night }
    }
  }
  return { weather: {}, targetMm, mm: 0, night: 0 }
}

/* ----------------------------------------------------------------------------
 * The dispatch: jobs, crew, lots
 * ------------------------------------------------------------------------- */

export interface Lot {
  id: string
  dispatchId: number
  crates: number
  site: typeof KEEP.site
}

export interface NaraJob {
  target: BedKey
  mode: CareMode
  rule: Rule
  state: JobState
  blockedBy?: 'soaked-refusal' | 'noon-stop'
  stopDay?: number
  marks: DawnMark[]
}

export interface KeepReport {
  dispatchId: number
  kind: 'story' | 'practice'
  choice: HandoffChoice
  weatherMm: number
  weatherNight: number
  beds: Record<BedKey, Omit<BedRun, 'endBed'>>
  /** The far trial as it would have gone with no guards — never happened, labelled so. */
  counterfactual: { low13: number; end13: number; health: number } | null
  packingCrew: 1 | 3
  crates: number
  /** Nara's pause: the question waiting for the child. */
  pauseDay: number | null
  /** The child's answer to the pause, once given. */
  pauseAnswer?: PauseAnswer
}

export interface PauseAnswer {
  /** Option index (Explorer) or -1 for own words only. */
  choice: number
  text: string | null
  right: boolean
}

export interface Dispatch {
  id: number
  kind: 'story' | 'practice'
  status: 'begun' | 'settled' | 'read'
  begun: number
  choice: HandoffChoice
  weather: Weather
  weatherCheck: { targetMm: number; chosenMm: number; night: number }
  startingBeds: Record<BedKey, Bed>
  jobs: NaraJob[]
  packingCrew: 1 | 3
  report?: KeepReport
  awardedLots: Lot[]
}

/** Care workers on the far bed, and so who is left to pack. Fixed at departure. */
export function packingCrew(choice: HandoffChoice): 1 | 3 {
  return choice === 'right' ? 3 : 1
}

export function farMode(choice: HandoffChoice): CareMode {
  return choice === 'right' ? 'independent' : choice === 'supervised' ? 'supervised' : 'trial'
}

export function farRule(choice: HandoffChoice): Rule {
  return choice === 'supervised' ? 'right' : choice
}

export function plans(choice: HandoffChoice, ability: Ability, farSeen: readonly ProbeWord[]): Record<BedKey, BedPlan> {
  const mode = farMode(choice)
  return {
    nara: { target: 'nara', mode: 'independent', rule: 'right' },
    far: {
      target: 'far',
      mode,
      rule: farRule(choice),
      ...(ability === 'copies' && mode === 'independent' ? { seen: farSeen } : {}),
    },
  }
}

/* ----------------------------------------------------------------------------
 * The keep: pure transitions the store calls
 * ------------------------------------------------------------------------- */

export interface Keep {
  choice: HandoffChoice | null
  confirmed: boolean
  campaignDay: number
  beds: Record<BedKey, Bed>
  /** Probe words the child acted on at the far bed in S0 (the copies pause). */
  farSeen: ProbeWord[]
  dispatch: Dispatch | null
  nextDispatchId: number
  storyDispatchId: number | null
  crates: Lot[]
  reports: KeepReport[]
  /** The handoff as the journal keeps it. */
  handoff: { text: string | null; verdict: string | null; shown: HandoffChoice[]; confirmed: HandoffChoice | null } | null
}

export function initialKeep(nara: Bed, far: Bed, farSeen: ProbeWord[]): Keep {
  return {
    choice: null,
    confirmed: false,
    campaignDay: 0,
    beds: { nara: cloneBed(nara), far: cloneBed(far) },
    farSeen: [...farSeen],
    dispatch: null,
    nextDispatchId: 1,
    storyDispatchId: null,
    crates: [],
    reports: [],
    handoff: null,
  }
}

/** Nara's say-back confirmed. Refused while a dispatch is out. */
export function confirmChoice(k: Keep, choice: HandoffChoice, record?: Keep['handoff']): Keep {
  if (k.dispatch && k.dispatch.status !== 'read') return k
  return { ...k, choice, confirmed: true, handoff: record ?? { text: null, verdict: null, shown: [...CHOICES], confirmed: choice } }
}

/** The story dispatch is the first; every later one is practice. */
export function nextKind(k: Keep): 'story' | 'practice' {
  return k.storyDispatchId == null ? 'story' : 'practice'
}

/**
 * Begin a dispatch: the weather check, the starting beds, the jobs, the crew.
 * Practice defaults to a dry fortnight; `rain` asks for the story's rain as a
 * labelled comparison (it goes through the same check).
 */
export function beginDispatch(k: Keep, ability: Ability, opts: { rain?: boolean } = {}): Keep {
  if (!k.confirmed || !k.choice) return k
  if (k.dispatch && k.dispatch.status !== 'read') return k
  const kind = nextKind(k)
  const p = plans(k.choice, ability, k.farSeen)
  const pick = kind === 'story' || opts.rain ? chooseWeather(k.beds.nara, k.beds.far, p.far) : { weather: {}, targetMm: 0, mm: 0, night: 0 }
  const d: Dispatch = {
    id: k.nextDispatchId,
    kind,
    status: 'begun',
    begun: k.campaignDay,
    choice: k.choice,
    weather: pick.weather,
    weatherCheck: { targetMm: pick.targetMm, chosenMm: pick.mm, night: pick.night },
    startingBeds: { nara: cloneBed(k.beds.nara), far: cloneBed(k.beds.far) },
    jobs: (['nara', 'far'] as const).map((t) => ({ target: t, mode: p[t].mode, rule: p[t].rule, state: 'assigned' as const, marks: [] })),
    packingCrew: packingCrew(k.choice),
    awardedLots: [],
  }
  return {
    ...k,
    dispatch: d,
    nextDispatchId: k.nextDispatchId + 1,
    storyDispatchId: kind === 'story' ? d.id : k.storyDispatchId,
  }
}

/**
 * Settle: fourteen days, once. Computed from the stored starting beds and
 * weather; beds, report, lots, campaign day and status land together. A
 * settled or read dispatch is returned unchanged.
 */
export function settleDispatch(k: Keep, ability: Ability): Keep {
  const d = k.dispatch
  if (!d || d.status !== 'begun' || !k.choice) return k
  const p = plans(d.choice, ability, k.farSeen)
  const runs = {
    nara: runBed(d.startingBeds.nara, p.nara, { weather: d.weather }),
    far: runBed(d.startingBeds.far, p.far, { weather: d.weather }),
  }
  const cf = p.far.mode === 'trial' && runs.far.stop ? runBed(d.startingBeds.far, p.far, { weather: d.weather, unguarded: true }) : null
  const crates = d.kind === 'story' && d.id === k.storyDispatchId ? d.packingCrew * KEEP.cratesPerPacker : 0
  const lots: Lot[] = crates > 0 ? [{ id: `lot-${d.id}`, dispatchId: d.id, crates, site: KEEP.site }] : []
  const strip = (r: BedRun): Omit<BedRun, 'endBed'> => {
    const out: Partial<BedRun> = { ...r }
    delete out.endBed
    return out as Omit<BedRun, 'endBed'>
  }
  const report: KeepReport = {
    dispatchId: d.id,
    kind: d.kind,
    choice: d.choice,
    weatherMm: weatherMm(d.weather),
    weatherNight: d.weatherCheck.night,
    beds: { nara: strip(runs.nara), far: strip(runs.far) },
    counterfactual: cf ? { low13: cf.low13, end13: cf.end13, health: cf.health } : null,
    packingCrew: d.packingCrew,
    crates,
    pauseDay: runs.far.pause,
  }
  const jobs: NaraJob[] = (['nara', 'far'] as const).map((t) => {
    const r = runs[t]
    return r.stop
      ? { target: t, mode: r.mode, rule: r.rule, state: 'blocked', blockedBy: r.stop.by, stopDay: r.stop.day, marks: r.marks }
      : { target: t, mode: r.mode, rule: r.rule, state: 'completed', marks: r.marks }
  })
  return {
    ...k,
    beds: { nara: runs.nara.endBed, far: runs.far.endBed },
    campaignDay: d.begun + KEEP.days,
    dispatch: { ...d, status: 'settled', jobs, report, awardedLots: lots },
    crates: [...k.crates, ...lots],
    reports: [...k.reports, report],
  }
}

/** The report acknowledged; a new instruction may be confirmed. */
export function readReport(k: Keep): Keep {
  if (!k.dispatch || k.dispatch.status !== 'settled') return k
  return { ...k, dispatch: { ...k.dispatch, status: 'read' }, confirmed: false }
}

export function totalCrates(k: Keep): number {
  return k.crates.reduce((a, l) => a + l.crates, 0)
}

/* ----------------------------------------------------------------------------
 * From S0, and back to the store
 * ------------------------------------------------------------------------- */

/** Probe words the child read, and so acted on, at a bed in S0 — the copies pause's reference. */
export function seenWords(run: PlotRun | null): ProbeWord[] {
  if (!run) return []
  const out = new Set<ProbeWord>()
  for (const d of run.days) if (d.probed) out.add(d.word)
  if (run.today.probed) out.add(run.today.word)
  return [...out]
}

/** Where the handoff stands, for the quest and the HUD. */
export type KeepStage = 'ask' | 'ready' | 'away' | 'report' | 'read'

export function keepStage(k: Keep): KeepStage {
  const d = k.dispatch
  if (d?.status === 'begun') return 'away'
  if (d?.status === 'settled') return 'report'
  if (k.confirmed) return 'ready'
  return d ? 'read' : 'ask'
}

/** Record the child's answer to Nara's pause on the report it came from. Once only. */
export function answerPause(k: Keep, dispatchId: number, answer: PauseAnswer): Keep {
  const i = k.reports.findIndex((r) => r.dispatchId === dispatchId)
  if (i < 0 || k.reports[i].pauseDay == null || k.reports[i].pauseAnswer) return k
  const reports = k.reports.slice()
  reports[i] = { ...reports[i], pauseAnswer: answer }
  const dispatch = k.dispatch && k.dispatch.id === dispatchId && k.dispatch.report ? { ...k.dispatch, report: reports[i] } : k.dispatch
  return { ...k, reports, dispatch }
}

/* ----------------------------------------------------------------------------
 * The handoff's judge, read conservatively (v3.1 §03)
 * ------------------------------------------------------------------------- */

export interface HandoffVerdict {
  verdict: 'right' | 'partial' | 'misconception' | 'off'
  confidence: number
  misconception: string | null
}

export interface HandoffOffer {
  /** The one say-back to offer, when the judge is sure enough; otherwise null. */
  candidate: HandoffChoice | null
  /** The choices shown, in order. The child always confirms before anything runs. */
  offer: HandoffChoice[]
}

/**
 * What to put in front of the child after a typed answer. Never runs a rule
 * and never raises ability: a verdict only chooses which say-back(s) to show.
 */
export function interpretHandoff(j: HandoffVerdict | null, trust: number): HandoffOffer {
  const all: HandoffChoice[] = [...CHOICES]
  if (!j || j.confidence < trust) return { candidate: null, offer: all }
  if (j.verdict === 'right') return { candidate: 'right', offer: ['right'] }
  if (j.verdict === 'misconception') {
    const key = j.misconception
    if (key === 'daily' || key === 'droop' || key === 'leave') return { candidate: key, offer: [key] }
    // "when it looks thirsty" and its kind: two readings, two rules — the child picks.
    return { candidate: null, offer: ['daily', 'droop'] }
  }
  return { candidate: null, offer: all }
}

/** The steps of the demonstration a rule contradicts, for Nara's "which should I try?" (v3.1 §03). */
export const CONTRADICTS: Readonly<Record<Rule, keyof MethodSteps | null>> = {
  right: null,
  daily: 'soakedWait',
  droop: 'probe',
  leave: 'dryCan',
}

export function contradicts(choice: HandoffChoice, steps: MethodSteps): boolean {
  if (choice === 'supervised') return false
  const k = CONTRADICTS[choice]
  return k != null && steps[k]
}

/* ----------------------------------------------------------------------------
 * The save's view of a keep
 * ------------------------------------------------------------------------- */

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isBool = (v: unknown): v is boolean => typeof v === 'boolean'
const BED_KEYS = ['theta', 'pond', 'o2', 'anox', 'health', 'firm', 'drained', 'spilled', 'taken', 'arrived', 'minFirm', 'pool', 'leached'] as const
const WORDS: readonly string[] = ['SOAKED', 'DAMP', 'DRY']

export function validBed(x: unknown): x is Bed {
  const b = x as Record<string, unknown> | null
  return !!b && typeof b === 'object' && b.texture === 'clay' && isBool(b.mound) && BED_KEYS.every((k) => isNum(b[k]))
}

function validLot(x: unknown): x is Lot {
  const l = x as Record<string, unknown> | null
  return !!l && typeof l === 'object' && typeof l.id === 'string' && isNum(l.dispatchId) && isNum(l.crates) && l.crates >= 0 && l.site === KEEP.site
}

function validMarks(x: unknown): boolean {
  return Array.isArray(x) && x.every((m) => m && typeof m === 'object' && isNum(m.day) && WORDS.includes(m.word) && (m.action === 'can' || m.action === 'wait') && (m.actor === 'nara' || m.actor === 'crew') && isNum(m.firm13))
}

function validReport(x: unknown): x is KeepReport {
  const r = x as Record<string, unknown> | null
  if (!r || typeof r !== 'object' || !isNum(r.dispatchId) || (r.kind !== 'story' && r.kind !== 'practice')) return false
  if (!(CHOICES as readonly unknown[]).includes(r.choice) || !isNum(r.crates) || !isNum(r.weatherMm)) return false
  const beds = r.beds as Record<string, Record<string, unknown>> | undefined
  if (!beds || typeof beds !== 'object') return false
  return (['nara', 'far'] as const).every((t) => beds[t] && validMarks(beds[t].marks) && isNum(beds[t].health))
}

function validDispatch(x: unknown): x is Dispatch {
  const d = x as Record<string, unknown> | null
  if (!d || typeof d !== 'object' || !isNum(d.id) || !isNum(d.begun)) return false
  if (d.kind !== 'story' && d.kind !== 'practice') return false
  if (d.status !== 'begun' && d.status !== 'settled' && d.status !== 'read') return false
  if (!(CHOICES as readonly unknown[]).includes(d.choice) || (d.packingCrew !== 1 && d.packingCrew !== 3)) return false
  const w = d.weather as Record<string, unknown> | undefined
  if (!w || typeof w !== 'object' || !Object.entries(w).every(([h, mm]) => isNum(Number(h)) && isNum(mm))) return false
  const sb = d.startingBeds as Record<string, unknown> | undefined
  if (!sb || !validBed(sb.nara) || !validBed(sb.far)) return false
  if (!Array.isArray(d.awardedLots) || !d.awardedLots.every(validLot)) return false
  if (d.status !== 'begun' && !validReport(d.report)) return false
  return Array.isArray(d.jobs)
}

export function validKeep(x: unknown): x is Keep {
  const k = x as Record<string, unknown> | null
  if (!k || typeof k !== 'object') return false
  if (k.choice != null && !(CHOICES as readonly unknown[]).includes(k.choice)) return false
  if (!isBool(k.confirmed) || !isNum(k.campaignDay) || !isNum(k.nextDispatchId)) return false
  const beds = k.beds as Record<string, unknown> | undefined
  if (!beds || !validBed(beds.nara) || !validBed(beds.far)) return false
  if (!Array.isArray(k.farSeen) || !k.farSeen.every((w) => WORDS.includes(w as string))) return false
  if (k.dispatch != null && !validDispatch(k.dispatch)) return false
  if (k.storyDispatchId != null && !isNum(k.storyDispatchId)) return false
  if (!Array.isArray(k.crates) || !k.crates.every(validLot)) return false
  if (!Array.isArray(k.reports) || !k.reports.every(validReport)) return false
  return true
}

/**
 * A keep block that does not validate: restore what does, and never let the
 * story award be earned twice. If whether it was awarded cannot be read, it is
 * treated as awarded (`storyDispatchId` −1). Beds that do not validate come
 * back from S0's own end state (`fallback`).
 */
export function salvageKeep(x: unknown, fallback: { nara: Bed; far: Bed; farSeen: ProbeWord[] }): Keep {
  const k = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
  const beds = k.beds as Record<string, unknown> | undefined
  const crates = Array.isArray(k.crates) ? k.crates.filter(validLot) : []
  const reports = Array.isArray(k.reports) ? k.reports.filter(validReport) : []
  const traces = k.dispatch != null || crates.length > 0 || reports.length > 0 || (isNum(k.nextDispatchId) && k.nextDispatchId > 1) || k.storyDispatchId != null
  const storyDispatchId = isNum(k.storyDispatchId) ? k.storyDispatchId : traces ? -1 : null
  const maxId = Math.max(0, ...crates.map((l) => l.dispatchId), ...reports.map((r) => r.dispatchId), isNum(k.nextDispatchId) ? k.nextDispatchId - 1 : 0)
  return {
    ...initialKeep(beds && validBed(beds.nara) ? beds.nara : fallback.nara, beds && validBed(beds.far) ? beds.far : fallback.far, fallback.farSeen),
    campaignDay: isNum(k.campaignDay) ? k.campaignDay : 0,
    // A dispatch that did not validate is dropped; a new one must be confirmed and begun.
    nextDispatchId: maxId + 1,
    storyDispatchId,
    crates,
    reports,
  }
}
