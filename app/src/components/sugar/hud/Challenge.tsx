import { useMemo, useState, type ReactNode } from 'react'
import { Check, Copy, Flag, Hourglass, Swords, Target, X } from 'lucide-react'
import Ploob2 from '@/components/brand/Ploob2'
import { Tile } from '@/components/ui/tile'
import { cn } from '@/lib/utils'
import type { Band } from '@/lib/bands'
import { BAND_META } from '@/lib/bands'
import {
  encodeChallenge,
  meetsGoal,
  roomCode,
  seedFromCode,
  type Challenge,
  type ChallengeScore,
  type ResourceBudget,
} from '@/lib/challenge'
import {
  STAGE_NAMES,
  SUGAR_RESOURCES,
  challengesForBand,
  levelForBand,
  metricLabel,
  type SugarChallengePreset,
  type SugarResource,
} from '@/lib/sugarchallenge'
import { isStageOpen } from '@/lib/campaign'
import { AtlasButton, Chip, Meter } from './AtlasKit'

/**
 * The challenge layer's whole user interface.
 *
 * Four pieces, in the order a run meets them: the brief you pick from, the
 * gather round's clock and bank, the strip that sits over the lab while you
 * spend, and the card that scores you.
 *
 * **Everything here is `pointer-events-none` by default.** The gather round is
 * played by dragging across the canvas, so a HUD that ate the pointer would
 * make the game unplayable in exactly the pretty places — the top strip where
 * the timer is, the bottom strip where the bank is. Only actual buttons opt
 * back in. This has bitten this codebase once already, on the portrait stage
 * tabs, and the lesson was to make the component own it rather than trust
 * every caller to remember.
 */

/* ------------------------------------------------------------------ */
/* The brief                                                           */
/* ------------------------------------------------------------------ */

/**
 * The world a learner playing alone gets, drawn once when the page loads.
 *
 * At module scope rather than in a hook on purpose. Render has to be pure — a
 * `Math.random()` in the body would hand the brief a different sky from the one
 * the round then builds — and an effect that set it afterwards would make the
 * first paint describe a world that no longer exists. One value for the life of
 * the tab is both honest and enough: different every visit, identical
 * throughout, and irrelevant the moment a room code is typed.
 */
const SESSION_SEED = (Date.now() ^ 0x9e3779b9) >>> 0

/** A preset built for this tab's own world — what *Play* opens on. */
export function soloChallenge(preset: SugarChallengePreset): Challenge {
  return preset.build(seedFromCode(`${SESSION_SEED}:${preset.id}`))
}

/** The band's stage-1 level, built for this tab. */
export function playChallengeFor(band: Band): Challenge {
  return soloChallenge(levelForBand(band))
}

/**
 * The measured thing, in the learner's words.
 *
 * One name for it everywhere — the brief, the gauge, the handover, the coach
 * — so nothing has to be re-learned between screens. The instrument's formal
 * label ("Sugar export rate") stays on the instrument.
 */
export function metricPhrase(metric: string): string {
  if (metric === 'export') return 'sugar leaving the leaf'
  if (metric === 'velocity') return 'sap speed'
  if (metric === 'gain') return 'net carbon gain'
  if (metric === 'sugarDay') return 'sugar banked'
  if (metric === 'mgPerMl') return 'sugar per water'
  return metricLabel(metric).toLowerCase()
}

/** "by dusk" / "by the next dawn", for a keep round. */
function spanWord(c: Challenge): string {
  const hours = Number((c.world ?? '').split(':')[1])
  return hours > 12 ? 'by the next dawn' : 'by dusk'
}

export function goalSentence(c: Challenge): string {
  const what = metricPhrase(c.goal.metric)
  const n = `${c.goal.target} ${c.goal.unit}`
  if (c.loop === 'keep' && c.goal.metric === 'sugarDay') return `Bank ${n} ${spanWord(c)}`
  if (c.goal.direction === 'near') return `Land ${what} within ${c.goal.tolerance} of ${n}`
  if (c.goal.direction === 'atMost') return `Keep ${what} at or under ${n}`
  return `Get ${what} to ${n} or better`
}

/** The goal as a headline: "Make sugar leave the leaf at 10 mg h⁻¹ or better." */
function goalHeadline(c: Challenge): { lead: string; number: string; tail: string } {
  const n = `${c.goal.target} ${c.goal.unit}`
  const what = metricPhrase(c.goal.metric)
  if (c.loop === 'keep' && c.goal.metric === 'sugarDay')
    return { lead: 'Bank ', number: n, tail: ` of sugar ${spanWord(c)}${c.condition === 'leafFirm' ? ' — with the leaf still firm' : ''}.` }
  if (c.goal.direction === 'near')
    return { lead: `Land ${what} at `, number: n, tail: `, give or take ${c.goal.tolerance}.` }
  if (c.goal.direction === 'atMost') return { lead: `Keep ${what} under `, number: n, tail: '.' }
  return { lead: `Get ${what} to `, number: n, tail: ' or better.' }
}

/** The target as a chip: "Target 12 ± 0.4", "Target 10 or better". */
function targetChip(c: Challenge): string {
  if (c.goal.direction === 'near') return `Target ${c.goal.target} ± ${c.goal.tolerance} ${c.goal.unit}`
  if (c.goal.direction === 'atMost') return `Target ${c.goal.target} ${c.goal.unit} or under`
  return `Target ${c.goal.target} ${c.goal.unit} or better`
}

/** How far a reading is from the mark, signed the way the learner reads it. */
export function shortfall(c: Challenge, value: number | null): { hit: boolean; text: string } {
  if (value === null) return { hit: false, text: 'no reading yet' }
  const hit = meetsGoal(c.goal, value)
  const d = value - c.goal.target
  const abs = Math.abs(d).toFixed(1)
  if (hit) return { hit: true, text: 'on the mark' }
  if (c.goal.direction === 'atMost') return { hit: false, text: `${abs} over` }
  if (c.goal.direction === 'near') return { hit: false, text: d < 0 ? `${abs} short` : `${abs} over` }
  return { hit: false, text: `${abs} short` }
}

export function ChallengeBrief({
  band,
  incoming,
  rival,
  stage = 1,
  onBegin,
  onClose,
}: {
  band: Band
  /** A challenge that arrived by link. Offered first, and cannot be edited. */
  incoming: Challenge | null
  rival: number | null
  /** The campaign stage the brief opens on. */
  stage?: 1 | 2
  onBegin: (c: Challenge) => void
  onClose: () => void
}) {
  const presets = useMemo(() => challengesForBand(band), [band])
  const [code, setCode] = useState('')
  const [pickedId, setPickedId] = useState(levelForBand(band, stage).id)
  /**
   * The list and the room code are folded away. The brief opens on **one**
   * challenge — the band's own level — with the target as the headline and
   * one green button, because a wall of four cards with the target at the
   * very bottom was the first thing a learner saw and the last thing they
   * read. Choosing is still there for anyone who wants it, one link away.
   */
  const [showList, setShowList] = useState(false)
  const [showRoom, setShowRoom] = useState(false)

  const picked = presets.find((p) => p.id === pickedId) ?? presets[0]
  /**
   * The seed comes from the room code when there is one.
   *
   * That is the whole of "a classroom in one room": thirty phones typing
   * MANGO build thirty identical skies, with no server, no accounts and no
   * connection required. An empty box means a private world, so a learner on
   * their own is never made to invent a code first.
   */
  const seed = code.trim() ? seedFromCode(code) : null
  const built = useMemo(() => {
    if (!picked) return null
    // Solo worlds still differ between challenges, so playing all six in one
    // sitting is six different skies rather than the same one relabelled.
    return seed === null ? soloChallenge(picked) : picked.build(seed)
    // A new object per keystroke is fine — it is three numbers and a string.
  }, [picked, seed])

  const offer = incoming ?? built
  const headline = offer ? goalHeadline(offer) : null
  const eyebrow = incoming
    ? 'Someone sent you this one'
    : picked?.stage && picked.level
      ? `Stage ${picked.stage} · ${STAGE_NAMES[picked.stage]} · Level ${picked.level}`
      : (picked?.title ?? 'Challenge')

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[#2A2823]/35 p-3 backdrop-blur-[2px]">
      <div className="atlas-plate atlas-arrive max-h-[92vh] w-full max-w-md overflow-y-auto p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="atlas-eyebrow">
            <Swords className="h-3 w-3" /> {eyebrow}
          </span>
          <Tile
            onClick={onClose}
            aria-label="Close the challenge brief"
            className="rounded-full px-2 text-[15px] font-bold text-[#B9B09A] hover:text-[#4A4438]"
          >
            <X className="h-4 w-4" />
          </Tile>
        </div>

        {headline && (
          <h2
            data-testid="brief-headline"
            className="atlas-serif mt-1 text-[22px] leading-tight font-semibold text-[#2A2823]"
          >
            {picked && !incoming && <span className="text-[#8B8471]">{picked.title}. </span>}
            {headline.lead}
            <span className="text-[#2F6134]">{headline.number}</span>
            {headline.tail}
          </h2>
        )}

        <p className="mt-2 text-[12px] leading-relaxed font-semibold text-[#5F5A4E]">
          {incoming
            ? offer!.loop === 'keep'
              ? 'A whole day plays out on its own. You hold one slider — how far the hatches may open — and the plant closes them further whenever it must.'
              : `${offer!.gatherSeconds} seconds to gather light, carbon and water out of the air. After that the dials only go as far as what you caught — so this time you can run out.`
            : picked?.brief}
        </p>

        {incoming && (
          <div className="mt-3 rounded-xl border border-[#C8DFC2] bg-[#E7F1E3] px-3 py-2">
            <p className="text-[12px] leading-snug font-bold text-[#2F6134]">
              {goalSentence(incoming)}
              {incoming.by ? ` — set by ${incoming.by}` : ''}
            </p>
            {rival !== null && (
              <p className="mt-0.5 text-[11px] font-bold text-[#3E7C43]">
                Score to beat: {rival}
              </p>
            )}
          </div>
        )}

        {offer && (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Chip tone="good">
                <Target className="h-3 w-3" /> Target: {goalSentence(offer).replace(/^(Get|Land|Keep) /, '')}
              </Chip>
              {offer.loop === 'keep' ? (
                <>
                  {offer.condition === 'leafFirm' && <Chip tone="good">💧 leaf firm at the end</Chip>}
                  <Chip>
                    <Hourglass className="h-3 w-3" />{' '}
                    {Number((offer.world ?? '').split(':')[1]) > 12 ? 'a day and a night · 3 min' : 'one plant-day · 90 s'}
                  </Chip>
                </>
              ) : (
                <Chip>
                  <Hourglass className="h-3 w-3" /> {offer.gatherSeconds}s to gather
                </Chip>
              )}
              <Chip>{BAND_META[offer.band].label}</Chip>
              <Chip title="The world this challenge builds">Room {roomCode(offer.seed)}</Chip>
            </div>
            <AtlasButton
              tone="primary"
              invite
              onClick={() => onBegin(offer)}
              className="mt-3 w-full py-2.5 text-[13px]"
            >
              {offer.loop === 'keep' ? 'Start the day' : 'Start gathering'}
            </AtlasButton>
          </>
        )}

        {!incoming && (
          <>
            <div className="mt-3 flex items-center justify-between gap-2">
              <Tile
                onClick={() => setShowList((v) => !v)}
                aria-expanded={showList}
                aria-label="Other challenges"
                className="text-[11px] font-extrabold text-[#8B8471] hover:text-[#2F6134]"
              >
                Other challenges {showList ? '▾' : '▸'}
              </Tile>
              <Tile
                onClick={() => setShowRoom((v) => !v)}
                aria-expanded={showRoom}
                aria-label="Join a room"
                className="text-[11px] font-extrabold text-[#8B8471] hover:text-[#2F6134]"
              >
                Join a room code {showRoom ? '▾' : '▸'}
              </Tile>
            </div>

            {showList && (
              <div className="mt-2 flex flex-col gap-1.5">
                {presets.map((p) => (
                  <Tile
                    key={p.id}
                    disabled={!!p.stage && !isStageOpen(p.stage)}
                    title={p.stage && !isStageOpen(p.stage) ? `Hand in any level of stage ${p.stage - 1} first` : undefined}
                    onClick={() => setPickedId(p.id)}
                    className={cn(
                      'rounded-xl border px-3 py-2 text-left transition-all active:scale-[0.99]',
                      p.id === picked?.id
                        ? 'border-[#2F6134] bg-[#E7F1E3]'
                        : 'border-[#E4DCC9] bg-[#FCFAF4] hover:bg-[#F1ECDE]',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="atlas-serif text-[15px] font-semibold text-[#2A2823]">
                        {p.title}
                      </span>
                      {p.stage && p.level && (
                        <Chip tone={isStageOpen(p.stage) ? 'good' : 'neutral'}>
                          {isStageOpen(p.stage) ? '' : '🔒 '}Stage {p.stage} · L{p.level}
                        </Chip>
                      )}
                      <Chip tone={p.band === 'explorer' ? 'good' : p.band === 'analyst' ? 'warn' : 'neutral'}>
                        {p.band}
                      </Chip>
                    </div>
                    <p className="mt-0.5 text-[11.5px] leading-snug font-semibold text-[#8B8471]">
                      {p.brief}
                    </p>
                  </Tile>
                ))}
              </div>
            )}

            {showRoom && (
              <label className="mt-2 block">
                <span className="atlas-eyebrow">Room code</span>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 8))}
                  placeholder="Leave blank for your own world"
                  aria-label="Room code"
                  className="mt-1 w-full rounded-xl border border-[#E4DCC9] bg-[#FCFAF4] px-3 py-2 text-[13px] font-extrabold tracking-[0.14em] text-[#2A2823] placeholder:font-semibold placeholder:tracking-normal placeholder:text-[#B9B09A] focus:border-[#2F6134] focus:outline-none"
                />
              </label>
            )}
            {showRoom && (
              <p className="mt-1 text-[11px] leading-snug font-semibold text-[#8B8471]">
                Everyone who types the same code gets the same sky and the same budget — that is
                what makes the scores comparable.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The gather round                                                    */
/* ------------------------------------------------------------------ */

function BankRow({
  bank,
  budget,
  compact,
}: {
  bank: ResourceBudget
  budget: ResourceBudget
  compact?: boolean
}) {
  return (
    <div className={cn('grid gap-1.5', compact ? 'grid-cols-3' : 'grid-cols-3')}>
      {SUGAR_RESOURCES.map((r) => {
        const have = bank[r.id] ?? 0
        const cap = budget[r.id] ?? 0
        const full = cap > 0 && have >= cap - 1e-6
        return (
          <div
            key={r.id}
            className="rounded-lg border border-[#E4DCC9] bg-[#FCFAF4]/92 px-2 py-1 backdrop-blur-md"
          >
            <div className="flex items-baseline justify-between gap-1">
              <span className="text-[10.5px] font-black tracking-[0.08em] text-[#6B6555] uppercase">
                {r.label}
              </span>
              <span className="text-[11px] font-extrabold text-[#2A2823] tabular-nums">
                {Math.round(have)}
              </span>
            </div>
            <div className="mt-1">
              <Meter value={cap > 0 ? have / cap : 0} color={full ? '#3E7C43' : r.tint} height={4} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * What Ploob says during the round, read off the jars.
 *
 * The geography is the biology's: light comes down the sun's own lanes, high
 * up; carbon drifts across the canopy; water rises out of the soil, low down.
 * So the emptiest jar names a *place* to sweep, not just a thing to want.
 */
function gatherLine(
  bank: ResourceBudget,
  budget: ResourceBudget,
  secondsLeft: number,
  ready: boolean,
): string {
  if (ready)
    return 'Light comes down in shafts. Carbon drifts across the leaves. Water rises off the soil. Catch all three — you will need all three.'
  const frac = (k: SugarResource) => ((budget[k] ?? 0) > 0 ? (bank[k] ?? 0) / (budget[k] as number) : 1)
  const order: SugarResource[] = ['light', 'co2', 'water']
  const lowest = order.reduce((a, b) => (frac(b) < frac(a) ? b : a))
  const full = order.filter((k) => frac(k) >= 0.999)
  const where: Record<SugarResource, string> = {
    light: 'Light comes down the sun lanes, up high — sweep through the shafts.',
    co2: 'Carbon drifts across the leaves — sweep at leaf height.',
    water: 'Water rises off the soil, low down — sweep near the ground.',
  }
  if (secondsLeft <= 5) {
    const name = lowest === 'co2' ? 'carbon' : lowest
    return full.length === 3 ? 'Every jar is full. Take it to the lab.' : `Last few seconds — grab ${name}.`
  }
  if (full.length === 3) return 'Every jar is full. Nothing more to catch — take it to the lab.'
  if (frac(lowest) < 0.15) {
    const name = lowest === 'co2' ? 'carbon' : lowest
    return `You have barely any ${name}. ${where[lowest]}`
  }
  return where[lowest]
}

/**
 * The gather round's own HUD: a clock, three filling jars, and a voice.
 *
 * Kept out of the drawer and off the sides on purpose. During this round the
 * whole screen is the playfield, and a panel anywhere near the middle would be
 * both in the way of the finger and in the way of the eye. The coach line at
 * the bottom is the one exception, because a HUD with nobody talking in it
 * was the round's biggest fault: a learner who had never met a jar was left
 * to work out what the three bars were for.
 */
export function GatherHud({
  secondsLeft,
  total,
  readyLeft,
  ready,
  bank,
  budget,
  caught,
  onDone,
}: {
  secondsLeft: number
  total: number
  /** The get-ready countdown, while `ready` is true. */
  readyLeft: number
  ready: boolean
  bank: ResourceBudget
  budget: ResourceBudget
  /** The most recent catch, for the little flash. */
  caught: { kind: SugarResource; n: number } | null
  onDone: () => void
}) {
  const frac = total > 0 ? secondsLeft / total : 0
  const urgent = !ready && secondsLeft <= 5
  const line = gatherLine(bank, budget, secondsLeft, ready)
  return (
    <div className="pointer-events-none fixed inset-0 z-30" data-testid="gather-hud">
      <div className="absolute inset-x-3 top-3 mx-auto flex max-w-[36rem] flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-full border border-[#E4DCC9] bg-[#FCFAF4]/92 px-3 py-1.5 backdrop-blur-md">
            <span
              className={cn(
                'text-[13px] font-black tabular-nums',
                urgent ? 'text-[#9A302A]' : ready ? 'text-[#B9B09A]' : 'text-[#2A2823]',
              )}
            >
              {secondsLeft.toFixed(1)}s
            </span>
            <div className="flex-1">
              <Meter value={frac} color={urgent ? '#C0453C' : '#3E7C43'} height={5} />
            </div>
          </div>
          <AtlasButton onClick={onDone} className="pointer-events-auto shrink-0" disabled={ready}>
            To the lab
          </AtlasButton>
        </div>
        <BankRow bank={bank} budget={budget} compact />
        <p className="px-1 text-center text-[10.5px] font-bold text-[#6B6555]">
          What you catch is what the dials will reach.
        </p>
      </div>

      {/* The get-ready beat. The clock waits for it, or for the first catch —
          whichever comes first — so a learner who has found the gesture is
          never held up by a countdown telling them about it. */}
      {ready && (
        <div className="absolute inset-x-4 top-[8.6rem] flex justify-center">
          <div
            data-testid="get-ready"
            className="atlas-plate atlas-arrive w-full max-w-[22rem] px-4 py-3 text-center"
          >
            <span
              className="atlas-serif block text-[44px] leading-none font-semibold text-[#2F6134] tabular-nums"
              aria-live="polite"
            >
              {Math.max(1, Math.ceil(readyLeft))}
            </span>
            <p className="mt-1 text-[13px] leading-snug font-black text-[#2A2823]">
              Drag the ring through the light.
            </p>
            <p className="mt-0.5 text-[11.5px] leading-snug font-semibold text-[#8B8471]">
              A leaf does not grab. It holds out area and catches what falls through it.
            </p>
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-1.5 px-4">
        {caught && !ready && (
          <span
            key={caught.n}
            className="fact-pop rounded-full border border-[#C8DFC2] bg-[#E7F1E3]/95 px-3 py-1 text-[12px] font-extrabold text-[#2F6134] backdrop-blur-md"
          >
            +{caught.kind === 'light' ? 'light' : caught.kind === 'co2' ? 'carbon' : 'water'}
          </span>
        )}
        <div
          data-testid="gather-coach"
          className="atlas-plate flex max-w-[min(30rem,calc(100vw-2rem))] items-center gap-2.5 px-3 py-2"
        >
          <Ploob2 size={22} />
          <div className="min-w-0">
            <span className="atlas-eyebrow block leading-none">Ploob</span>
            <p className="text-[12px] leading-snug font-extrabold text-[#2A2823]">{line}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The handover                                                        */
/* ------------------------------------------------------------------ */

/**
 * The card between the round and the lab.
 *
 * The one moment the first build skipped. The round ended, the lab appeared
 * with the dials capped, and nothing said why — the only sentence connecting
 * the two halves was folded inside a collapsed strip. This says: here is what
 * you caught, here is what it is for, and here are the three moves.
 */
export function Handover({
  challenge,
  granted,
  onEnter,
}: {
  challenge: Challenge
  granted: ResourceBudget
  onEnter: () => void
}) {
  const h = goalHeadline(challenge)
  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[#F6F2E8]/72 p-3 backdrop-blur-[3px]">
      <div
        data-testid="handover"
        className="atlas-plate atlas-arrive w-full max-w-md p-4"
      >
        <span className="atlas-eyebrow">Round over · here is what you caught</span>
        <div className="mt-2">
          <BankRow bank={granted} budget={challenge.budget} />
        </div>
        <h2 className="atlas-serif mt-3.5 text-[21px] leading-tight font-semibold text-[#2A2823]">
          Now use it. {h.lead}
          <span className="text-[#2F6134]">{h.number}</span>
          {h.tail}
        </h2>
        <p className="mt-2 text-[12px] leading-relaxed font-semibold text-[#5F5A4E]">
          The dials only go as far as your jars. Each measurement spends a little of them, so a
          few good trials beat many wild ones.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <ol className="flex-1 text-[11.5px] leading-relaxed font-extrabold text-[#8B8471]">
            <li>1 &nbsp;Set the dials</li>
            <li>
              2 &nbsp;Press <span className="text-[#2A2823]">Run measurement</span>
            </li>
            <li>3 &nbsp;Read the gauge</li>
          </ol>
          <AtlasButton tone="primary" invite onClick={onEnter} className="flex-1 py-2.5 text-[13px]">
            Into the lab
          </AtlasButton>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The target gauge                                                    */
/* ------------------------------------------------------------------ */

/** A round-number axis top that leaves the target and the readings room. */
function niceAxisMax(c: Challenge, best: number | null, last: number | null): number {
  const need = Math.max(c.goal.target * 1.5, (best ?? 0) * 1.1, (last ?? 0) * 1.1, c.goal.target + 2 * c.goal.tolerance)
  const steps = [1, 2, 5, 10, 16, 20, 25, 30, 40, 50, 100]
  for (const st of steps) if (need <= st) return st
  return Math.ceil(need / 10) * 10
}

/**
 * The target and the reading on one bar.
 *
 * Pinned to the top of the screen for the whole lab phase, in the strip the
 * stage tabs use — never behind a tab. The target is a line with the "or
 * better" zone shaded beside it (or a tolerance band, for a `near` goal); the
 * last reading is a ring; the best so far is a tick; the gap is a chip in the
 * learner's own words. The number being chased and the number just measured
 * are read off the same axis, which is the whole reason this exists: before,
 * the target lived in a bottom strip and the reading lived in an instrument
 * plate behind the Data tab, and a learner was told to hit a number they
 * could not see.
 *
 * Deliberately not a scoreboard. The score is computed once, at hand-in, so
 * nobody plays the number instead of the plant.
 */
export function TargetGauge({
  challenge,
  bank,
  best,
  last,
  hit,
  trials,
  affordable,
  compact,
  onFinish,
  onQuit,
}: {
  challenge: Challenge
  bank: ResourceBudget
  best: number | null
  /** The most recent reading of the goal metric, or null before the first. */
  last: number | null
  hit: boolean
  trials: number
  affordable: boolean
  compact: boolean
  onFinish: () => void
  onQuit: () => void
}) {
  const [open, setOpen] = useState(false)
  const g = challenge.goal
  const axisMax = niceAxisMax(challenge, best, last)
  const W = 292
  const x = (v: number) => 6 + (280 * Math.max(0, Math.min(axisMax, v))) / axisMax
  const tx = x(g.target)
  const gap = shortfall(challenge, last)
  const showBest = best !== null && last !== null && Math.abs(best - last) > 1e-6
  const phrase = metricPhrase(g.metric)

  return (
    <div
      data-testid="target-gauge"
      className={cn(
        'atlas-plate pointer-events-auto px-3 pt-2 pb-2',
        compact ? 'w-full' : 'w-[24rem]',
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="atlas-eyebrow">
          <Target className="h-3 w-3" /> {phrase}
        </span>
        <span className="flex items-center gap-2 text-[10.5px] font-black text-[#8B8471]">
          {trials} {trials === 1 ? 'trial' : 'trials'}
          <Tile
            onClick={onQuit}
            aria-label="Leave the challenge"
            className="rounded-full px-1 text-[13px] font-bold text-[#B9B09A] hover:text-[#4A4438]"
          >
            <X className="h-3.5 w-3.5" />
          </Tile>
        </span>
      </div>

      <svg viewBox={`0 0 ${W} 56`} className="mt-1 block h-auto w-full" aria-hidden>
        <rect x="6" y="22" width="280" height="10" rx="5" fill="#EAE4D4" />
        {/* the zone that counts */}
        {g.direction === 'atLeast' && (
          <rect x={tx} y="22" width={286 - tx} height="10" rx="5" fill="#C8DFC2" />
        )}
        {g.direction === 'atMost' && <rect x="6" y="22" width={tx - 6} height="10" rx="5" fill="#C8DFC2" />}
        {g.direction === 'near' && (
          <rect
            x={x(g.target - g.tolerance)}
            y="22"
            width={Math.max(4, x(g.target + g.tolerance) - x(g.target - g.tolerance))}
            height="10"
            rx="5"
            fill="#C8DFC2"
          />
        )}
        {/* what the last reading reached */}
        {last !== null && (
          <rect
            x="6"
            y="22"
            width={Math.max(0, x(last) - 6)}
            height="10"
            rx="5"
            fill={gap.hit ? '#3E7C43' : '#E8A33D'}
            opacity={gap.hit ? 1 : 0.85}
          />
        )}
        {/* the miss, drawn as a length */}
        {last !== null && !gap.hit && (
          <line
            x1={x(last)}
            y1="27"
            x2={g.direction === 'near' && last > g.target ? x(g.target + g.tolerance) : tx}
            y2="27"
            stroke="#FCFAF4"
            strokeWidth="2"
            strokeDasharray="3 3"
          />
        )}
        {/* the target */}
        <line x1={tx} y1="12" x2={tx} y2="42" stroke="#2F6134" strokeWidth="2" />
        <text
          x={tx}
          y="9"
          textAnchor={tx > W - 40 ? 'end' : tx < 40 ? 'start' : 'middle'}
          fontSize="9.5"
          fontWeight="900"
          fill="#2F6134"
          fontFamily="Nunito, system-ui, sans-serif"
        >
          TARGET {g.target}
        </text>
        {/* best so far */}
        {showBest && (
          <>
            <polygon points={`${x(best!)},18 ${x(best!) + 5},12 ${x(best!) - 5},12`} fill="#8B8471" />
            <text
              x={x(best!)}
              y="53"
              textAnchor="middle"
              fontSize="9"
              fontWeight="800"
              fill="#8B8471"
              fontFamily="Nunito, system-ui, sans-serif"
            >
              best {best!.toFixed(1)}
            </text>
          </>
        )}
        {/* the last reading */}
        {last !== null && (
          <circle
            cx={x(last)}
            cy="27"
            r={gap.hit ? 8 : 7}
            fill="#FCFAF4"
            stroke={gap.hit ? '#2F6134' : '#2A2823'}
            strokeWidth={gap.hit ? 3 : 2.5}
          />
        )}
        <text x="6" y="53" fontSize="9" fontWeight="800" fill="#B9B09A" fontFamily="Nunito, system-ui, sans-serif">
          0
        </text>
        <text
          x="286"
          y="53"
          textAnchor="end"
          fontSize="9"
          fontWeight="800"
          fill="#B9B09A"
          fontFamily="Nunito, system-ui, sans-serif"
        >
          {axisMax} {g.unit}
        </text>
      </svg>

      <div className="flex items-center justify-between gap-2">
        {last === null ? (
          <span className="text-[12px] leading-none font-extrabold text-[#8B8471]">No reading yet</span>
        ) : (
          <span className="text-[19px] leading-none font-black text-[#2A2823] tabular-nums">
            {last.toFixed(1)}{' '}
            <span className="text-[10.5px] font-bold text-[#8B8471]">{g.unit} · last reading</span>
          </span>
        )}
        <Chip tone={gap.hit ? 'good' : last === null ? 'neutral' : 'warn'} title="How far the last reading was from the mark">
          {gap.hit && <Check className="h-3 w-3" />}
          {last === null ? targetChip(challenge) : gap.text}
        </Chip>
      </div>

      {!affordable && (
        <p className="mt-1 text-[10.5px] leading-snug font-bold text-[#96591C]">
          Too dear to run at these settings — turn something down, or run it at night.
        </p>
      )}

      {/* On a phone the bank and the hand-in fold behind a tap; on desktop
          there is room for all of it. Hand-in also lives on every result
          card, so nobody has to find this. */}
      {compact && (
        <Tile
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open || hit}
          aria-label={open ? 'Fold the gauge' : 'What is left in the jars'}
          className="mt-1 w-full text-left text-[10.5px] font-extrabold text-[#8B8471]"
        >
          {open || hit ? 'Jars and hand-in ▾' : 'Jars and hand-in ▸'}
        </Tile>
      )}
      {(!compact || open || hit) && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          <BankRow bank={bank} budget={challenge.budget} />
          <AtlasButton
            tone="primary"
            onClick={onFinish}
            invite={hit}
            disabled={trials === 0}
            className="w-full"
          >
            <Flag className="h-3.5 w-3.5" />
            {trials === 0 ? 'Run a measurement first' : 'Hand it in'}
          </AtlasButton>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The score                                                           */
/* ------------------------------------------------------------------ */

function Stars({ n }: { n: number }) {
  return (
    <span aria-label={`${n} of 3 stars`} className="text-[18px] leading-none">
      {'★'.repeat(n)}
      <span className="text-[#D8D0BC]">{'★'.repeat(3 - n)}</span>
    </span>
  )
}

function Part({ label, value, why }: { label: string; value: number; why: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-extrabold text-[#4A4438]">{label}</span>
        <span className="text-[11px] font-extrabold text-[#8B8471] tabular-nums">
          {Math.round(value * 100)}%
        </span>
      </div>
      <div className="mt-0.5">
        <Meter value={value} color="#3E7C43" height={5} />
      </div>
      <p className="mt-0.5 text-[10.5px] leading-snug font-semibold text-[#8B8471]">{why}</p>
    </div>
  )
}

export function ScoreCard({
  challenge,
  score,
  best,
  trials,
  granted,
  rival,
  onAgain,
  onClose,
  tally = null,
  opened = null,
  onNext,
}: {
  challenge: Challenge
  score: ChallengeScore
  best: number | null
  trials: number
  /** What the gather round actually banked, against what was on offer. */
  granted: ResourceBudget
  rival: number | null
  onAgain: () => void
  onClose: () => void
  /** A keep round's day, drawn in place of the gather round's summary. */
  tally?: ReactNode
  /** A door this hand-in opened, and the way through it. */
  opened?: { name: string; id: number } | null
  onNext?: () => void
}) {
  const [copied, setCopied] = useState(false)
  const keep = challenge.loop === 'keep'

  /**
   * How much of what was on offer the learner actually caught.
   *
   * A miss has two quite different causes and they need different advice. If
   * the dials could reach and the number still would not come, that is a
   * reasoning problem and the score breakdown is the right feedback. If the
   * gather round came up short, the ceiling is why — and saying so is the
   * difference between a learner who goes back and gathers harder and one who
   * concludes the challenge is broken.
   */
  const share = useMemo(() => {
    const keys = Object.keys(challenge.budget).filter((k) => challenge.budget[k] > 0)
    if (!keys.length) return 1
    return (
      keys.reduce((sum, k) => sum + Math.min(1, (granted[k] ?? 0) / challenge.budget[k]), 0) /
      keys.length
    )
  }, [challenge.budget, granted])
  const thinGather = !score.hit && share < 0.6

  /**
   * The link is built from where the page actually is, not from a guess.
   *
   * This app is served as one file under a hash route and may sit at a
   * different path on a school's own server; hard-coding the prefix would
   * produce links that work for us and nobody else.
   */
  const link = useMemo(() => {
    const { origin, pathname } = window.location
    return `${origin}${pathname}#/photosynthesis?c=${encodeChallenge(challenge)}&r=${score.total}`
  }, [challenge, score.total])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2200)
    } catch {
      // Clipboard permission can simply be refused. Showing the link is a
      // worse experience than copying it, and a much better one than nothing.
      setCopied(false)
      window.prompt('Copy this challenge link', link)
    }
  }

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[#2A2823]/35 p-3 backdrop-blur-[2px]">
      <div className="atlas-plate atlas-arrive max-h-[92vh] w-full max-w-md overflow-y-auto p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="atlas-eyebrow">Result</span>
            <h2 className="atlas-serif text-[24px] leading-tight font-semibold text-[#2A2823]">
              {score.total} <span className="text-[15px] text-[#8B8471]">/ 1000</span>
            </h2>
            <Stars n={score.stars} />
          </div>
          <Tile
            onClick={onClose}
            aria-label="Close the result"
            className="rounded-full px-2 text-[15px] font-bold text-[#B9B09A] hover:text-[#4A4438]"
          >
            <X className="h-4 w-4" />
          </Tile>
        </div>

        {keep ? (
          tally
        ) : (
          <p className="mt-2 text-[12.5px] leading-relaxed font-semibold text-[#5A5445]">
            {score.hit
              ? `You landed it: ${best?.toFixed(1)} ${challenge.goal.unit}, in ${trials} ${trials === 1 ? 'trial' : 'trials'}.`
              : `Best you reached was ${best === null ? '—' : best.toFixed(1)} ${challenge.goal.unit}. Missing is the useful kind of wrong — it tells you which input was actually holding the line back.`}
          </p>
        )}

        {thinGather && !keep && (
          <p className="mt-2 rounded-xl border border-[#EFC9A6] bg-[#FBEEE0] px-3 py-2 text-[11.5px] leading-snug font-bold text-[#96591C]">
            You gathered about {Math.round(share * 100)}% of what was on offer, so the dials never
            got far. That ceiling is most of why the number would not come — go back and gather
            harder before you change your reasoning.
          </p>
        )}

        {rival !== null && (
          <p
            className={cn(
              'mt-1.5 text-[12px] font-extrabold',
              score.total >= rival ? 'text-[#2F6134]' : 'text-[#96591C]',
            )}
          >
            {score.total >= rival
              ? `You beat their ${rival}.`
              : `Their score was ${rival} — ${rival - score.total} ahead.`}
          </p>
        )}

        <div className="atlas-rule my-3" />

        <div className="flex flex-col gap-2.5">
          <Part
            label="Accuracy"
            value={score.accuracy}
            why="How near the mark you got. Worth the most, because it is the only part that is about understanding the plant."
          />
          <Part
            label={keep ? 'Standing' : 'Economy'}
            value={score.economy}
            why={
              keep
                ? 'Whether the leaf was firm at the end. A number banked by a plant that is dying is not banked.'
                : 'How few trials it took. Reasoning your way there beats trying everything.'
            }
          />
          <Part
            label={keep ? 'Water' : 'Thrift'}
            value={score.thrift}
            why={
              keep
                ? 'How much of the water a wide-open leaf would have lost you kept in the pot.'
                : 'How little of what you gathered you burnt. Light you could not use was light you wasted.'
            }
          />
        </div>

        <p className="mt-2.5 text-[10.5px] leading-snug font-semibold text-[#8B8471]">
          Nothing here is scored on speed. The XP on your record came from the measurements you
          recorded, exactly as it does in the plain lab — a challenge cannot buy it.
        </p>

        {opened && onNext && (
          <div
            data-testid="door-opened"
            className="mt-3 flex items-center gap-2 rounded-xl border border-[#C8DFC2] bg-[#E7F1E3] px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <span className="atlas-eyebrow" style={{ color: '#2F6134' }}>A door has opened</span>
              <p className="text-[12px] leading-snug font-extrabold text-[#2A2823]">
                Stage {opened.id} · {opened.name}
              </p>
            </div>
            <AtlasButton tone="primary" invite onClick={onNext} className="shrink-0">
              Go through
            </AtlasButton>
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <AtlasButton onClick={copyLink} className="flex-1">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Link copied' : 'Challenge a friend'}
          </AtlasButton>
          <AtlasButton tone="primary" onClick={onAgain} className="flex-1" invite={keep && !score.hit}>
            {keep ? 'Play the day again' : 'Play again'}
          </AtlasButton>
        </div>
      </div>
    </div>
  )
}
