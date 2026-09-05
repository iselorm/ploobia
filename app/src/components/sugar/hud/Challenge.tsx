import { useMemo, useState } from 'react'
import { Check, Copy, Flag, Hourglass, Swords, Target, X } from 'lucide-react'
import { Tile } from '@/components/ui/tile'
import { cn } from '@/lib/utils'
import type { Band } from '@/lib/bands'
import {
  encodeChallenge,
  roomCode,
  seedFromCode,
  type Challenge,
  type ChallengeScore,
  type ResourceBudget,
} from '@/lib/challenge'
import {
  SUGAR_RESOURCES,
  challengesForBand,
  metricLabel,
  type SugarResource,
} from '@/lib/sugarchallenge'
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

function goalSentence(c: Challenge): string {
  const what = metricLabel(c.goal.metric).toLowerCase()
  const n = `${c.goal.target} ${c.goal.unit}`
  if (c.goal.direction === 'near') return `Land ${what} within ${c.goal.tolerance} of ${n}`
  if (c.goal.direction === 'atMost') return `Keep ${what} at or under ${n}`
  return `Get ${what} to ${n} or better`
}

export function ChallengeBrief({
  band,
  incoming,
  rival,
  onBegin,
  onClose,
}: {
  band: Band
  /** A challenge that arrived by link. Offered first, and cannot be edited. */
  incoming: Challenge | null
  rival: number | null
  onBegin: (c: Challenge) => void
  onClose: () => void
}) {
  const presets = useMemo(() => challengesForBand(band), [band])
  const [code, setCode] = useState('')
  const [pickedId, setPickedId] = useState(presets[0]?.id ?? '')

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
    return picked.build(seed ?? seedFromCode(`${SESSION_SEED}:${picked.id}`))
    // A new object per keystroke is fine — it is three numbers and a string.
  }, [picked, seed])

  const offer = incoming ?? built

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[#2A2823]/35 p-3 backdrop-blur-[2px]">
      <div className="atlas-plate atlas-arrive max-h-[92vh] w-full max-w-md overflow-y-auto p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="atlas-eyebrow">
              <Swords className="h-3 w-3" /> Challenge
            </span>
            <h2 className="atlas-serif text-[21px] leading-tight font-semibold text-[#2A2823]">
              {incoming ? 'Someone sent you this one' : 'Gather, then hit the mark'}
            </h2>
          </div>
          <Tile
            onClick={onClose}
            aria-label="Close the challenge brief"
            className="rounded-full px-2 text-[15px] font-bold text-[#B9B09A] hover:text-[#4A4438]"
          >
            <X className="h-4 w-4" />
          </Tile>
        </div>

        <p className="mt-1.5 text-[12px] leading-relaxed font-semibold text-[#8B8471]">
          A short round where you catch light, carbon and water out of the air — then the dials
          only go as far as what you caught. Same cabinet, same physics; the difference is that
          this time you can run out.
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

        {!incoming && (
          <>
            <div className="mt-3 flex flex-col gap-1.5">
              {presets.map((p) => (
                <Tile
                  key={p.id}
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

            <label className="mt-3 block">
              <span className="atlas-eyebrow">Room code — optional</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 8))}
                placeholder="Leave blank for your own world"
                aria-label="Room code"
                className="mt-1 w-full rounded-xl border border-[#E4DCC9] bg-[#FCFAF4] px-3 py-2 text-[13px] font-extrabold tracking-[0.14em] text-[#2A2823] placeholder:font-semibold placeholder:tracking-normal placeholder:text-[#B9B09A] focus:border-[#2F6134] focus:outline-none"
              />
            </label>
            <p className="mt-1 text-[11px] leading-snug font-semibold text-[#8B8471]">
              Everyone who types the same code gets the same sky and the same budget — that is what
              makes the scores comparable.
            </p>
          </>
        )}

        {offer && (
          <>
            <div className="atlas-rule my-3" />
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip tone="good">
                <Target className="h-3 w-3" /> {goalSentence(offer)}
              </Chip>
              <Chip>
                <Hourglass className="h-3 w-3" /> {offer.gatherSeconds}s to gather
              </Chip>
              <Chip title="The world this challenge builds">Room {roomCode(offer.seed)}</Chip>
            </div>
            <AtlasButton
              tone="primary"
              invite
              onClick={() => onBegin(offer)}
              className="mt-3 w-full py-2.5 text-[13px]"
            >
              Start gathering
            </AtlasButton>
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
 * The gather round's own HUD: a clock and three filling jars.
 *
 * Kept out of the drawer and off the sides on purpose. During this round the
 * whole screen is the playfield, and a panel anywhere near the middle would be
 * both in the way of the finger and in the way of the eye.
 */
export function GatherHud({
  secondsLeft,
  total,
  bank,
  budget,
  caught,
  onDone,
}: {
  secondsLeft: number
  total: number
  bank: ResourceBudget
  budget: ResourceBudget
  /** The most recent catch, for the little flash. */
  caught: { kind: SugarResource; n: number } | null
  onDone: () => void
}) {
  const frac = total > 0 ? secondsLeft / total : 0
  const urgent = secondsLeft <= 5
  return (
    <div className="pointer-events-none fixed inset-0 z-30">
      <div className="absolute inset-x-3 top-3 mx-auto flex max-w-[36rem] flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-full border border-[#E4DCC9] bg-[#FCFAF4]/92 px-3 py-1.5 backdrop-blur-md">
            <span
              className={cn(
                'text-[13px] font-black tabular-nums',
                urgent ? 'text-[#9A302A]' : 'text-[#2A2823]',
              )}
            >
              {secondsLeft.toFixed(1)}s
            </span>
            <div className="flex-1">
              <Meter value={frac} color={urgent ? '#C0453C' : '#3E7C43'} height={5} />
            </div>
          </div>
          <AtlasButton onClick={onDone} className="pointer-events-auto shrink-0">
            To the lab
          </AtlasButton>
        </div>
        <BankRow bank={bank} budget={budget} compact />
      </div>

      <div className="absolute inset-x-0 bottom-8 flex flex-col items-center gap-1.5 px-4">
        {caught && (
          <span
            key={caught.n}
            className="fact-pop rounded-full border border-[#C8DFC2] bg-[#E7F1E3]/95 px-3 py-1 text-[12px] font-extrabold text-[#2F6134] backdrop-blur-md"
          >
            +{caught.kind === 'light' ? 'light' : caught.kind === 'co2' ? 'carbon' : 'water'}
          </span>
        )}
        <p className="atlas-serif max-w-[26rem] text-center text-[12px] leading-snug font-semibold text-[#5A5445] italic">
          Sweep the ring through the light, the carbon and the water. A leaf does not grab —
          it holds out area and catches what falls through it.
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The lab strip                                                       */
/* ------------------------------------------------------------------ */

/**
 * What sits over the lab while a challenge is being spent.
 *
 * Three facts and one button, because everything else the learner needs is
 * already the cabinet's own instruments. Deliberately not a scoreboard: the
 * score is computed once, at the end, so that nobody plays the number instead
 * of the plant.
 */
export function ChallengeBar({
  challenge,
  bank,
  ceiling,
  best,
  hit,
  trials,
  affordable,
  compact,
  bottomPx = 0,
  onFinish,
  onQuit,
}: {
  challenge: Challenge
  bank: ResourceBudget
  /** What the gather round bought — `capsFor(granted)`, not of the balance. */
  ceiling: { light: number; co2ppm: number; water: number }
  best: number | null
  hit: boolean
  trials: number
  affordable: boolean
  compact: boolean
  /** How far up the compact strip must sit to clear the drawer. */
  bottomPx?: number
  onFinish: () => void
  onQuit: () => void
}) {
  /**
   * On a phone this opens as one line and expands on a tap.
   *
   * The last round of mobile feedback on this cabinet was entirely about
   * panels covering the specimen, and a permanently-open five-row card
   * floating over a 390 px screen would have earned exactly the same
   * complaint. Everything the learner needs *at a glance* — the target, their
   * best, their trial count — is on the closed line; the bank and the hand-in
   * button are one tap away, and on desktop there is room for all of it.
   */
  const [open, setOpen] = useState(!compact)
  const expanded = open || !compact

  return (
    /* Bottom centre, which is the slot the coach chip and the result card
       already share. That is deliberate: it is where a learner in this cabinet
       is trained to look for "what now", and putting a fourth thing anywhere
       else would only add a place to check. The page stands this down while a
       result card is up, exactly as it stands the coach down. */
    <div
      className={cn(
        'pointer-events-none fixed z-30 flex justify-center px-2 transition-[bottom] duration-200',
        compact ? 'inset-x-0' : 'inset-x-0',
      )}
      style={{ bottom: compact ? `calc(4.2rem + ${bottomPx}px)` : '1.25rem' }}
    >
      <div className="atlas-plate pointer-events-auto flex w-full max-w-[30rem] flex-col gap-1.5 px-3 py-2">
        <div className="flex items-center gap-2">
          <Tile
            onClick={() => setOpen((v) => !v)}
            aria-label={expanded ? 'Collapse the challenge strip' : 'Expand the challenge strip'}
            aria-expanded={expanded}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span className="atlas-eyebrow shrink-0">
              <Target className="h-3 w-3" /> Target
            </span>
            <span className="min-w-0 flex-1 truncate text-[11.5px] font-extrabold text-[#2A2823]">
              {goalSentence(challenge)}
            </span>
          </Tile>
          <Tile
            onClick={onQuit}
            aria-label="Leave the challenge"
            className="shrink-0 rounded-full px-1.5 text-[13px] font-bold text-[#B9B09A] hover:text-[#4A4438]"
          >
            <X className="h-3.5 w-3.5" />
          </Tile>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone={hit ? 'good' : 'neutral'} title="The best you have reached so far">
            {hit && <Check className="h-3 w-3" />}
            Best {best === null ? '—' : best.toFixed(1)} {challenge.goal.unit}
          </Chip>
          <Chip tone={trials >= 5 ? 'warn' : 'neutral'} title="Fewer trials scores higher">
            {trials} {trials === 1 ? 'trial' : 'trials'}
          </Chip>
          {!affordable && (
            <Chip tone="warn" title="Turn something down, or run the trial at night">
              Too dear to run
            </Chip>
          )}
        </div>

        {expanded && (
          <>
            {/* The one sentence that connects the two halves of the game.
                Without it a learner whose light dial stops at a third has no
                way to know that the gather round is why, and reads a capped
                control as a broken one. */}
            <p className="text-[10.5px] leading-snug font-semibold text-[#8B8471]">
              Your gathering set the ceilings: light stops at{' '}
              <strong className="text-[#4A4438]">{Math.round(ceiling.light * 100)}%</strong>, carbon
              at <strong className="text-[#4A4438]">{Math.round(ceiling.co2ppm)} ppm</strong>, soil
              at <strong className="text-[#4A4438]">{Math.round(ceiling.water * 100)}%</strong>.
            </p>
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
          </>
        )}
      </div>
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
}) {
  const [copied, setCopied] = useState(false)

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

        <p className="mt-2 text-[12.5px] leading-relaxed font-semibold text-[#5A5445]">
          {score.hit
            ? `You landed it: ${best?.toFixed(1)} ${challenge.goal.unit}, in ${trials} ${trials === 1 ? 'trial' : 'trials'}.`
            : `Best you reached was ${best === null ? '—' : best.toFixed(1)} ${challenge.goal.unit}. Missing is the useful kind of wrong — it tells you which input was actually holding the line back.`}
        </p>

        {thinGather && (
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
            label="Economy"
            value={score.economy}
            why="How few trials it took. Reasoning your way there beats trying everything."
          />
          <Part
            label="Thrift"
            value={score.thrift}
            why="How little of what you gathered you burnt. Light you could not use was light you wasted."
          />
        </div>

        <p className="mt-2.5 text-[10.5px] leading-snug font-semibold text-[#8B8471]">
          Nothing here is scored on speed. The XP on your record came from the measurements you
          recorded, exactly as it does in the plain lab — a challenge cannot buy it.
        </p>

        <div className="mt-3 flex gap-2">
          <AtlasButton onClick={copyLink} className="flex-1">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Link copied' : 'Challenge a friend'}
          </AtlasButton>
          <AtlasButton tone="primary" onClick={onAgain} className="flex-1">
            Play again
          </AtlasButton>
        </div>
      </div>
    </div>
  )
}
