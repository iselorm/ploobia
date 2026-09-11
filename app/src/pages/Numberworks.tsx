import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { getBand, useBand, type Band } from '@/lib/bands'
import { useActiveLearner } from '@/lib/profiles'
import { logEvent } from '@/lib/events'
import { useBackHandler } from '@/lib/input'
import { useLayoutTier } from '@/hooks/use-layout'
import { read, write } from '@/lib/persist'
import { cn } from '@/lib/utils'
import { challengeLink, decodeChallenge, type Challenge, type ChallengeScore } from '@/lib/challenge'
import {
  BASIN_MAX,
  DOORS,
  DOOR_BY_ID,
  LEVELS,
  TOMATOES_PER_KG,
  aimFor,
  attemptFor,
  cedis,
  challengeFor,
  cleanNickname,
  closeDay,
  gaugeFor,
  harmattanBoard,
  kiloPrice,
  levelForBand,
  levelFromSetup,
  ploobLine,
  scheduleOf,
  sendableNickname,
  shareCardFor,
  shoppersFor,
  soloSeed,
  startDay,
  startStall,
  stockOf,
  topUp,
  type Aim,
  type DayResult,
  type Level,
  type StallState,
} from '@/lib/market'
import { createMarketSim, beginRun, type MarketSim, type MarketViewId } from '@/lib/marketsim'
import { setAssetsDisabled } from '@/lib/marketassets'
import { nextDoor, recordHandIn } from '@/lib/numberworkscampaign'
import { COACH_KEY, nextDock, type CoachDock } from '@/components/atoms/game/coachDock'
import { PloobChip, PloobLine } from '@/components/atoms/game/ForgeHud'
import SceneErrorBoundary from '@/components/SceneErrorBoundary'
import InputHints from '@/components/hud/InputHints'
import ProgressToasts from '@/components/hud/ProgressToasts'
import type { StallVerb } from '@/components/numberworks/Stall'
import type { Neighbour } from '@/components/numberworks/Neighbours'
import {
  DaysPlate,
  MarketBeat,
  MarketBrief,
  MarketGauge,
  MarketScore,
  MarketSend,
  MarketWelcome,
  OurSpace,
  StallPlate,
  TillPlate,
  TopBar,
  type DayReading,
  type JournalEntry,
  type MarketTab,
  type StallControls,
} from '@/components/numberworks/hud/MarketHud'

const MarketScene = lazy(() => import('@/components/numberworks/MarketScene'))

/**
 * The Numberworks — Door 1, The Market.
 *
 * The storyboard "The Numberworks — The Market", as a phase machine:
 *
 *   welcome → (brief) → beat → (gather) → lab → scored → send
 *
 * Play is the front door. Explorer skips the brief and catches tomatoes into
 * the basin; the other bands guess first and start with a full basin. In the
 * lab the learner writes a price (or a mark-up, or a prediction), opens the
 * stall, and watches a day at Kejetia go by in eight seconds. The target and
 * the reading share one gauge; the till is the instrument; a hand-in scores
 * through `lib/challenge` and opens the next door through
 * `lib/numberworkscampaign`. Score is not XP.
 *
 * A link (`?c=…`) is the whole world: same seed, same shoppers, the dare on
 * the gauge. Nothing here talks to a server.
 */
type Phase = 'welcome' | 'brief' | 'beat' | 'gather' | 'lab' | 'scored' | 'send'

const SESSION_CODE = String((Date.now() ^ 0x5eed0bad) >>> 0)
const JOURNAL_KEY = 'ploobia.numberworks.journal.v1'
const BY_KEY = 'ploobia.numberworks.by.v1'
/** How often the HUD reads the running day off the sim, in ms. */
const LIVE_MS = 100

function SceneFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#E9CFA3]">
      <div className="atlas-plate flex items-center gap-3 px-4 py-3">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#E4DCC9] border-t-[#B5541C]" />
        <span className="text-[12px] font-extrabold text-[#5A5445]">Setting out the stall…</span>
      </div>
    </div>
  )
}

function WebglFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#F6F2E8]/90 p-6">
      <div className="atlas-plate max-w-md p-5 text-center">
        <p className="text-[14px] font-black text-[#2A2823]">The 3D view stopped.</p>
        <p className="mt-1 text-[12px] font-semibold text-[#8B8471]">Your device paused the graphics. Reload to set the stall out again — nothing you handed in is lost.</p>
      </div>
    </div>
  )
}

function BackToMenu() {
  return (
    <Link
      to="/"
      aria-label="Back to the arcade"
      className="tile pointer-events-auto flex items-center gap-1.5 rounded-full border border-[#E9E2D1] bg-[#FCFAF4]/90 px-3 py-2 text-[12px] font-extrabold text-[#5A5445] backdrop-blur-md transition-all hover:bg-[#F1ECDE] active:scale-95"
    >
      <ArrowLeft className="h-4 w-4" />
      Arcade
    </Link>
  )
}

/* The sim is a mutable object the scene reads every frame; these are the only
   writes the page makes to it outside `beginRun`, kept out of the callbacks so
   the compiler's immutability rule can see they are deliberate. */
function setSimView(sim: MarketSim, id: MarketViewId): void {
  sim.viewId = id
  sim.viewSeq += 1
  sim.autoOrbit = false
}
function setSimCrowd(sim: MarketSim, seed: number, stock: number): void {
  sim.shoppers = shoppersFor(seed)
  sim.run = null
  sim.stock = stock
  sim.till = 0
  sim.late = false
  sim.ringAt = -1
}
function setSimStock(sim: MarketSim, stock: number): void {
  if (!sim.run) sim.stock = stock
}
function ringTill(sim: MarketSim): void {
  sim.ringAt = sim.time
}

/** Which part of the stall the aim ring sits on. */
function verbOfAim(aim: Aim): StallVerb | null {
  switch (aim) {
    case 'catch':
      return 'basin'
    case 'price':
    case 'markup':
    case 'discount':
      return 'board'
    case 'predict':
    case 'bound':
      return 'scale'
    case 'open':
    case 'hand':
      return 'till'
    default:
      return null
  }
}

/** What the chalk board in the scene says, from the same state the HUD reads. */
function boardOf(level: Level | null, stall: StallState): { eyebrow: string; big: string; small?: string } {
  if (!level || level.kind === 'fill') return { eyebrow: 'tomatoes · each', big: cedis(stall.price, 2) }
  if (level.kind === 'ratio') {
    const each = scheduleOf(level, stall).price
    return { eyebrow: 'tomatoes · kilo', big: cedis(kiloPrice(each), 2), small: `${cedis(each, 2)} each${stall.discount ? ` · −${Math.round(stall.discount * 100)} % at 4` : ''}` }
  }
  const board = harmattanBoard()
  return { eyebrow: 'tomatoes · kilo · Thu', big: cedis(board[board.length - 1], 2), small: stall.prediction === null ? 'Friday — ?' : `Friday — ${cedis(stall.prediction, 2)}` }
}

/** Ploob at the free stall: no target, so what he names is the trade-off itself. */
function freeLine(stall: StallState, run: ReturnType<typeof startDay> | null): string {
  if (run && !run.done) return `${run.sold} sold, ${run.unsold} in the basin.`
  const d = stall.day
  if (!d) return `${stall.stock} in the basin at ${cedis(stall.price, 2)} each. Open the stall and see who stops.`
  if (d.unsold === 0) return `Sold out at ${cedis(stall.price, 2)} — ${cedis(d.till)} in the till. A higher price sells fewer; would it still make more?`
  return `${d.sold} sold for ${cedis(d.till)}, ${d.passed} walked past, ${d.unsold} left. Move the price and run another day.`
}

function readingOf(id: number, level: Level | null, stall: StallState, day: DayResult): DayReading {
  if (!level || level.kind === 'fill') {
    const hit = !!level && day.till >= level.target.value - 1e-9
    return { id, label: `Day ${id} · ${cedis(stall.price, 2)} each`, result: `${cedis(day.till)} · ${day.sold} sold`, hit }
  }
  const g = gaugeFor(level, { ...stall, day })
  return { id, label: `Day ${id} · +${Math.round(stall.markup * 100)} %${stall.discount ? ` · −${Math.round(stall.discount * 100)} % at 4` : ''}`, result: `${g.cells[0].value} · ${day.unsold} left`, hit: g.hit }
}

export default function Numberworks() {
  const sim = useMemo(() => createMarketSim(), [])
  const [band] = useBand()
  const tier = useLayoutTier()
  const compact = tier === 'phone'
  const dense = tier !== 'desktop'
  const columns = tier === 'desktop' || tier === 'tablet'

  /* ---- where Ploob's line sits (the player's call, remembered) ---- */
  const [dock, setDock] = useState<CoachDock>(() => {
    const saved = read<CoachDock>(COACH_KEY, 'float')
    return saved === 'float' || saved === 'left' || saved === 'right' || saved === 'hidden' ? saved : 'float'
  })
  const setDockAnd = useCallback((next: CoachDock) => {
    setDock(next)
    write(COACH_KEY, next)
  }, [])
  const learner = useActiveLearner()
  const [heard, setHeard] = useState('')

  /* ---- who the card is from (the only thing about a child that travels) ---- */
  const [by, setByRaw] = useState<string>(() => {
    const saved = read<string>(BY_KEY, '')
    if (typeof saved === 'string' && saved.trim()) return cleanNickname(saved)
    const nick = learner.nickname
    return nick && nick !== 'Player 1' ? cleanNickname(nick) : ''
  })
  const setBy = useCallback((next: string) => {
    const clean = cleanNickname(next)
    setByRaw(clean)
    write(BY_KEY, clean)
  }, [])
  const [searchParams] = useSearchParams()

  /* ---- the incoming link, if any ---- */
  const incoming = useMemo<{ challenge: Challenge; level: Level } | null>(() => {
    const c = searchParams.get('c')
    if (!c) return null
    const decoded = decodeChallenge(c)
    if (!decoded || decoded.cabinet !== 'numberworks') return null
    const level = levelFromSetup(decoded.setup)
    if (!level) return null
    // Only the seed, the sender and the catch length travel; the goal, the
    // budget and the condition are the LEVEL's, rebuilt here, so the gauge and
    // the score can never read different targets off a fiddled link.
    const challenge: Challenge = {
      ...challengeFor(level, decoded.band, decoded.seed, decoded.by),
      gatherSeconds: Math.max(0, Math.min(level.gatherSeconds, Number.isFinite(decoded.gatherSeconds) ? decoded.gatherSeconds : 0)),
    }
    return { challenge, level }
  }, [searchParams])
  // A link is played once. After that, Play is the player's own campaign
  // again — otherwise every "Play again" with ?c= in the URL replays the dare.
  const [incomingUsed, setIncomingUsed] = useState(false)
  const inbound = incomingUsed ? null : incoming
  // `?standins=1` keeps the generated props off — the suites and a slow line.
  useEffect(() => {
    setAssetsDisabled(searchParams.get('standins') === '1')
  }, [searchParams])

  /* ---- state ---- */
  const [phase, setPhase] = useState<Phase>('welcome')
  const [level, setLevel] = useState<Level | null>(null)
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [stall, setStall] = useState<StallState>(() => startStall(LEVELS[0], BASIN_MAX))
  /** Level 3's dials, before "Lock it in" makes them the stall's. */
  const [draft, setDraft] = useState<{ prediction: number | null; bound: number | null }>({ prediction: null, bound: null })
  const [caught, setCaught] = useState(0)
  const [rain, setRain] = useState<{ seed: number; startAt: number; startedAtMs: number; seconds: number } | null>(null)
  const [gatherLeft, setGatherLeft] = useState(0)
  const [beat, setBeat] = useState(3)
  const [running, setRunning] = useState(false)
  const [live, setLive] = useState<{ t: number; till: number; sold: number; unsold: number } | null>(null)
  const [trials, setTrials] = useState(0)
  const [readings, setReadings] = useState<DayReading[]>([])
  const [score, setScore] = useState<ChallengeScore | null>(null)
  const [opened, setOpened] = useState<number | null>(null)
  const [journal, setJournal] = useState<JournalEntry[]>(() => read<JournalEntry[]>(JOURNAL_KEY, []))
  const [tab, setTab] = useState<MarketTab>('stall')
  const [sheet, setSheet] = useState<MarketTab | null>(null)
  const [hovered, setHovered] = useState<StallVerb | null>(null)
  const [contextLost, setContextLost] = useState(false)
  const [line, setLine] = useState('')
  const startedAt = useRef(0)

  useEffect(() => {
    logEvent('numberworks', getBand(), 'session.started', {})
  }, [])

  /* ---- starting a level ---- */
  const begin = useCallback(
    (lvl: Level, c: Challenge) => {
      setLevel(lvl)
      setChallenge(c)
      setTrials(0)
      setReadings([])
      setScore(null)
      setOpened(null)
      setCaught(0)
      setRain(null)
      setRunning(false)
      setLive(null)
      setDraft({ prediction: null, bound: null })
      const gathers = c.gatherSeconds > 0
      const s = startStall(lvl, gathers ? 0 : BASIN_MAX)
      setStall(s)
      setSimCrowd(sim, c.seed, s.stock)
      startedAt.current = Date.now()
      setBeat(3)
      if (band === 'explorer') {
        setPhase('beat')
        setLine(lvl.open)
      } else {
        setPhase('brief')
        setLine(lvl.blurb)
      }
    },
    [sim, band],
  )

  const play = useCallback(() => {
    if (inbound) {
      setIncomingUsed(true)
      begin(inbound.level, inbound.challenge)
      return
    }
    const door = nextDoor().id
    const lvl = levelForBand(band as Band, door)
    begin(lvl, challengeFor(lvl, band, soloSeed(SESSION_CODE, lvl)))
  }, [inbound, band, begin])

  const explore = useCallback(() => {
    setLevel(null)
    setChallenge(null)
    setRain(null)
    setRunning(false)
    setLive(null)
    setTrials(0)
    setReadings([])
    const s = startStall(LEVELS[0], BASIN_MAX)
    setStall(s)
    setSimCrowd(sim, soloSeed(SESSION_CODE, LEVELS[0]) ^ 0x51a11, s.stock)
    setPhase('lab')
    setLine('The stall is yours. Write a price, open it, and count the till. Whatever you learn here is yours to keep.')
  }, [sim])

  /* ---- the brief → the beat ---- */
  const commitGuess = useCallback(
    (guess: number) => {
      if (!level) return
      logEvent('numberworks', band, 'prediction.committed', { variable: `guess:${level.id}`, x: level.tier, predicted: guess, kind: 'point' })
      const right = Math.abs(guess - level.guess.answer) < level.guess.step / 2
      setLine(right ? `${level.guess.step < 1 ? level.guess.answer.toFixed(2) : level.guess.answer} — right. ${level.open}` : `You said ${level.guess.step < 1 ? guess.toFixed(2) : guess}. ${level.open}`)
      setBeat(3)
      setPhase('beat')
    },
    [level, band],
  )

  /* ---- the beat: three seconds, then catch or lab ---- */
  useEffect(() => {
    if (phase !== 'beat') return
    const t1 = setTimeout(() => setBeat(2), 1000)
    const t2 = setTimeout(() => setBeat(1), 2000)
    const t3 = setTimeout(() => {
      if (!level || !challenge) return
      if (challenge.gatherSeconds > 0) {
        setRain({ seed: challenge.seed, startAt: sim.time, startedAtMs: Date.now(), seconds: challenge.gatherSeconds })
        setGatherLeft(challenge.gatherSeconds)
        setLine('Tap a tomato and it is in the basin. Fifty at ₵4 is the sum; sixty is all the basin holds.')
        setPhase('gather')
      } else {
        setPhase('lab')
      }
    }, 3000)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [phase, level, challenge, sim])

  /* ---- the gather round: a catch, not a countdown ---- */
  const onCatch = useCallback(() => {
    if (phase !== 'gather') return
    setCaught((c) => {
      const next = Math.min(BASIN_MAX, c + 1)
      setSimStock(sim, next)
      return next
    })
  }, [phase, sim])
  useEffect(() => {
    if (phase !== 'gather' || !rain || !level) return
    // Timed on the wall clock, not on rendered-frame time (see the Foundry).
    const id = setInterval(() => {
      const left = rain.seconds + 4 - (Date.now() - rain.startedAtMs) / 1000
      setGatherLeft(Math.max(0, left))
      if (left <= 0) {
        const { stock, topped } = topUp(stockOf(caught), level)
        setStall((s) => ({ ...s, stock }))
        setSimStock(sim, stock)
        setRain(null)
        setPhase('lab')
        setLine(topped ? `You caught ${caught}. The wholesaler tops the basin up to ${stock} this time — it costs you thrift, not the round.` : `${stock} in the basin. Write a price and open the stall.`)
      }
    }, 150)
    return () => clearInterval(id)
  }, [phase, rain, level, caught, sim])

  /* ---- the dials ---- */
  const ctl: StallControls = useMemo(
    () => ({
      onPrice: (v) => setStall((s) => ({ ...s, price: Math.round(v * 100) / 100 })),
      onMarkup: (v) => setStall((s) => ({ ...s, markup: Math.round(v * 100) / 100 })),
      onDiscount: (v) => setStall((s) => ({ ...s, discount: Math.round(v * 100) / 100 })),
      onPredict: (v) => setDraft((d) => ({ ...d, prediction: Math.round(v * 100) / 100 })),
      onBound: (v) => setDraft((d) => ({ ...d, bound: Math.round(v * 100) / 100 })),
    }),
    [],
  )
  // The dials are read by the day-close interval, which must see the stall as
  // it was when the day ran and not a stale closure of it.
  const stallRef = useRef(stall)
  useEffect(() => {
    stallRef.current = stall
  }, [stall])

  /* ---- a day at the stall ---- */
  const openStall = useCallback(() => {
    if (running || phase !== 'lab') return
    const lvl = level ?? LEVELS[0]
    const run = startDay(sim.shoppers, stall.stock, scheduleOf(lvl, stall))
    beginRun(sim, run, Date.now())
    setRunning(true)
    setLive({ t: 0, till: 0, sold: 0, unsold: run.stock0 })
    setLine('')
  }, [running, phase, level, sim, stall])
  const closeEarly = useCallback(() => {
    if (sim.run) closeDay(sim.run)
  }, [sim])
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const run = sim.run
      if (!run) return
      setLive({ t: run.t, till: run.till, sold: run.sold, unsold: run.unsold })
      if (run.done) {
        // First thing: this tick is the only one that may record the day. The
        // cleanup below runs after the re-render, and a long frame (a prop
        // arriving mid-day) can let a second tick see the same done run.
        clearInterval(id)
        const day: DayResult = { sold: run.sold, till: run.till, unsold: run.unsold, passed: run.passed, sales: run.sales }
        const t = trials + 1
        const s = stallRef.current
        const next = { ...s, day }
        setTrials(t)
        setStall(next)
        setReadings((r) => [readingOf(t, level, s, day), ...r].slice(0, 12))
        setLive(null)
        setRunning(false)
        setLine('')
        if (level) {
          const g = gaugeFor(level, next)
          if (g.hit) ringTill(sim)
          // A day run is a reading: what was on the board, what the till said.
          logEvent('numberworks', band, 'reading.recorded', {
            variable: level.metric.id,
            x: scheduleOf(level, s).price,
            y: g.best,
            repeats: [g.best],
            uncertainty: 0,
            controls: { stock: s.stock, markup: s.markup, discount: s.discount },
            predicted: null,
            predictionClose: null,
            anomalous: false,
          })
        }
      }
    }, LIVE_MS)
    return () => clearInterval(id)
  }, [running, sim, trials, level, band])

  /* ---- level 3: lock a prediction ---- */
  const lock = useCallback(() => {
    if (!level || level.kind !== 'harmattan') return
    if (draft.prediction === null && draft.bound === null) {
      setLine('Move Friday\'s dial first — a prediction is a number you commit to before you look.')
      return
    }
    const predicted = draft.prediction !== null && draft.prediction !== stall.prediction
    setStall((s) => ({ ...s, prediction: draft.prediction ?? s.prediction, bound: draft.bound ?? s.bound }))
    if (predicted) {
      setTrials((t) => t + 1)
      logEvent('numberworks', band, 'prediction.committed', { variable: `friday:${level.id}`, x: level.tier, predicted: draft.prediction ?? 0, kind: 'point' })
    }
    setLine('')
  }, [level, draft, stall.prediction, band])

  /* ---- hand in ---- */
  const handIn = useCallback(() => {
    if (!level || !challenge || running) return
    const t = Math.max(1, trials)
    const seconds = (Date.now() - startedAt.current) / 1000
    const { attempt, score: s } = attemptFor(level, challenge, stall, t, seconds)
    setScore(s)
    logEvent('numberworks', band, 'challenge.handedIn', { presetId: level.id, stage: level.door, score: s.total, hit: attempt.hit })
    if (attempt.hit) {
      const openedDoor = recordHandIn(level.id, s.total)
      setOpened(openedDoor ? level.door + 1 : null)
      const figure = shareCardFor(level, stall, undefined, t, s.stars).figure
      const entry: JournalEntry = { id: `${level.id}:${Date.now()}`, levelId: level.id, title: level.title, figure, score: s, trials: t, by: challenge.by }
      setJournal((j) => {
        const next = [entry, ...j].slice(0, 12)
        write(JOURNAL_KEY, next)
        return next
      })
    } else {
      setOpened(null)
    }
    setPhase('scored')
  }, [level, challenge, running, trials, stall, band])

  /* ---- the link and the card ---- */
  const link = useMemo(() => {
    if (!level || !challenge) return ''
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return challengeLink(origin, '/numberworks', { ...challenge, by: sendableNickname(by) || undefined })
  }, [level, challenge, by])
  const card = useMemo(() => {
    if (!level) return null
    return shareCardFor(level, stall, sendableNickname(by) || undefined, Math.max(1, trials), score?.stars ?? 0)
  }, [level, stall, by, trials, score])

  /* ---- views and taps ---- */
  const view = useCallback((id: MarketViewId) => setSimView(sim, id), [sim])
  const onTab = useCallback(
    (t: MarketTab) => {
      setTab(t)
      if (columns) {
        if (t === 'stall') view('stall')
        else if (t === 'days') view('alley')
      } else {
        setSheet(t)
      }
    },
    [columns, view],
  )
  const onTap = useCallback(
    (v: StallVerb) => {
      if (v === 'till') {
        if (phase !== 'lab') return
        if (running) return
        if (level && gaugeFor(level, stall).hit) handIn()
        else openStall()
      } else if (v === 'board') {
        view('board')
        if (!columns) setSheet('stall')
      } else if (v === 'basin') {
        view('stall')
        setLine(stall.day ? `${stall.day.unsold} left in the basin after the day. Unsold is wasted.` : `${stall.stock} tomatoes in the basin. Sixty is all it holds.`)
      } else if (v === 'scale') {
        setLine(level?.kind === 'harmattan' ? 'The scale reads to the nearest fifty grams. Half of that, either way, is how far a weight could be off.' : `Eight tomatoes make about a kilo here. A price each is a price per kilo × ${TOMATOES_PER_KG}.`)
      }
    },
    [phase, running, level, stall, columns, handIn, openStall, view],
  )
  const onCompare = useCallback((n: Neighbour) => {
    setLine(`${n.name}: ${n.price} ${n.eyebrow.split('·')[1]?.trim() ?? ''}. Every stall on the alley is a price somebody chose — and a shopper who walks on is the ceiling talking.`)
  }, [])

  useBackHandler(
    useCallback(() => {
      if (sheet) {
        setSheet(null)
        return true
      }
      if (phase === 'send') {
        setPhase(score ? 'scored' : 'lab')
        return true
      }
      if (phase === 'scored') {
        setPhase('lab')
        return true
      }
      if (phase === 'brief') {
        setBeat(3)
        setPhase('beat')
        return true
      }
      return false
    }, [sheet, phase, score]),
  )

  /* ---- derived ---- */
  const shownDock: CoachDock = !columns && (dock === 'left' || dock === 'right') ? 'float' : dock
  const hudBottom = tier === 'phone' ? (shownDock === 'float' ? 190 : 130) : tier === 'tablet' ? 80 : 0
  const inGame = level !== null
  const free = !inGame && phase === 'lab'
  const aim: Aim = useMemo(() => {
    if (!level) return free ? (stall.day ? 'price' : 'open') : null
    if (phase === 'gather') return 'catch'
    if (phase !== 'lab' || running) return null
    return aimFor(level, stall, 'lab')
  }, [level, free, stall, phase, running])
  const aimVerb = verbOfAim(aim)
  const board = useMemo(() => boardOf(level, stall), [level, stall])
  const stallForPlate = useMemo<StallState>(
    () => (level?.kind === 'harmattan' ? { ...stall, prediction: draft.prediction ?? stall.prediction, bound: draft.bound ?? stall.bound } : stall),
    [level, stall, draft],
  )
  const shownLine = phase === 'lab' ? line || (level ? ploobLine(level, stall, sim.run) : freeLine(stall, sim.run)) : line
  const showHud = phase !== 'welcome'
  const doorOpened = opened ? DOOR_BY_ID[opened] ?? null : null
  const why = useMemo(() => {
    if (!level) return ''
    const g = gaugeFor(level, stall)
    const c = g.cells.find((x) => !x.met)
    return c ? `${c.label}: ${c.todo || 'not met'}.` : ''
  }, [level, stall])
  const remix = useCallback(() => {
    if (!level) {
      play()
      return
    }
    setPhase('send')
  }, [level, play])

  const ourSpace = (
    <OurSpace
      entries={journal}
      incoming={inbound && !inGame ? { by: inbound.challenge.by, title: inbound.level.title } : null}
      onPlay={() => {
        setSheet(null)
        play()
      }}
      onRemix={remix}
      compact={compact}
    />
  )
  const stallPlate = <StallPlate level={level} stall={stallForPlate} running={running} free={free} aim={aim} compact={dense} ctl={ctl} />
  const daysPlate = <DaysPlate readings={readings} compact={dense} />

  /* ---- Ploob's line, wherever the player has put it ---- */
  const coachNode =
    phase !== 'beat' && shownLine ? (
      shownDock === 'hidden' ? (
        <PloobChip
          unread={heard !== shownLine}
          onOpen={() => {
            setHeard(shownLine)
            setDockAnd(columns ? 'left' : 'float')
          }}
        />
      ) : (
        <PloobLine
          text={shownLine}
          compact={compact}
          dock={shownDock}
          columns={columns}
          onDock={() => setDockAnd(nextDock(shownDock, columns))}
          onHide={() => {
            setHeard(shownLine)
            setDockAnd('hidden')
          }}
        />
      )
    ) : null

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#E9CFA3]" data-phase={phase} data-hud-bottom={hudBottom} data-running={running ? 'true' : 'false'} data-testid="numberworks">
      <SceneErrorBoundary>
        <Suspense fallback={<SceneFallback />}>
          <MarketScene
            sim={sim}
            board={board}
            aim={aimVerb}
            hovered={hovered}
            rain={rain}
            phone={tier === 'phone'}
            hudBottom={hudBottom}
            onHover={setHovered}
            onTap={onTap}
            onCompare={onCompare}
            onCatch={onCatch}
            onContextLost={() => setContextLost(true)}
          />
        </Suspense>
      </SceneErrorBoundary>

      {/* the HUD: three columns, one toolbar, Ploob's line */}
      {showHud && (
        <div className="hud pointer-events-none fixed inset-0 z-20 flex flex-col gap-2 p-2 sm:gap-3 sm:p-3">
          <TopBar tab={tab} onTab={onTab} band={band} compact={compact} left={<BackToMenu />} />
          <div className="flex min-h-0 flex-1 gap-3">
            {columns && (
              <div className={cn('flex min-h-0 flex-col gap-2', tier === 'desktop' ? 'w-[18.5rem] shrink-0' : 'w-[12.5rem] shrink-0')}>
                <div className="min-h-0 flex-1 overflow-hidden">{stallPlate}</div>
                {shownDock === 'left' && coachNode}
              </div>
            )}
            <div className="flex min-w-0 flex-1 flex-col justify-between">
              <div className="flex items-start justify-between gap-2">
                {inGame && level && phase !== 'brief' && (
                  <MarketGauge level={level} stall={stall} trials={Math.max(1, trials + (running ? 1 : 0))} gather={phase === 'gather' ? { left: gatherLeft, total: challenge?.gatherSeconds ?? 0, caught } : null} compact={dense} />
                )}
              </div>
              <div className="flex flex-col gap-2">
                {(shownDock === 'float' || shownDock === 'hidden') && coachNode && <div className="flex justify-start pl-2 sm:pl-8">{coachNode}</div>}
                {phase === 'lab' && (
                  <div className={cn('w-full', columns ? 'max-w-[30rem]' : '')}>
                    <TillPlate
                      level={level}
                      stall={stall}
                      live={live}
                      running={running}
                      free={free}
                      aim={aim}
                      compact={dense}
                      onOpen={openStall}
                      onClose={closeEarly}
                      onLock={lock}
                      onHandIn={handIn}
                      onSend={() => setPhase('send')}
                    />
                  </div>
                )}
              </div>
            </div>
            {columns && (
              <div className={cn('flex min-h-0 flex-col gap-2', tier === 'desktop' ? 'w-[18.5rem] shrink-0' : 'w-[12rem] shrink-0')}>
                <div className="min-h-0 flex-1 overflow-hidden">{ourSpace}</div>
                {tier === 'desktop' && daysPlate}
                {shownDock === 'right' && coachNode}
              </div>
            )}
          </div>
        </div>
      )}

      {/* the phone's plates, as sheets */}
      {sheet && !columns && (
        <div className="pointer-events-auto fixed inset-0 z-30 flex items-end justify-center bg-[#2A2823]/35 p-2" onClick={() => setSheet(null)} data-testid={`sheet-${sheet}`}>
          <div className="max-h-[80vh] w-full max-w-md overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {sheet === 'stall' && stallPlate}
            {sheet === 'days' && daysPlate}
            {sheet === 'space' && ourSpace}
          </div>
        </div>
      )}

      {phase === 'welcome' && (
        <MarketWelcome level={inbound ? inbound.level : levelForBand(band as Band, nextDoor().id)} incoming={inbound ? { by: inbound.challenge.by, title: inbound.level.title } : null} onPlay={play} onExplore={explore} />
      )}
      {phase === 'brief' && level && (
        <MarketBrief
          level={level}
          onCommit={commitGuess}
          onClose={() => {
            // Skipping the guess still goes through the beat: the beat is what
            // starts the catch, and a link with a catch must never land in the
            // lab with an empty basin and no rain.
            setBeat(3)
            setPhase('beat')
          }}
        />
      )}
      {phase === 'beat' && <MarketBeat count={beat} />}
      {phase === 'scored' && level && score && (
        <MarketScore
          level={level}
          stall={stall}
          score={score}
          trials={Math.max(1, trials)}
          opened={doorOpened}
          why={why}
          onNext={() => {
            const door = nextDoor()
            if (door.built && doorOpened && door.id === doorOpened.id) {
              const lvl = levelForBand(band as Band, door.id)
              begin(lvl, challengeFor(lvl, band, soloSeed(SESSION_CODE, lvl)))
              return
            }
            setPhase('welcome')
          }}
          onSend={() => setPhase('send')}
          onAgain={() => setPhase('lab')}
          onClose={() => setPhase('lab')}
        />
      )}
      {phase === 'send' && card && <MarketSend card={card} link={link} by={by} onBy={setBy} onClose={() => setPhase(score ? 'scored' : 'lab')} />}

      <span className="sr-only" data-testid="doors">{DOORS.map((d) => d.name).join(' · ')}</span>
      <InputHints />
      <ProgressToasts />
      {contextLost && <WebglFallback />}
    </div>
  )
}
