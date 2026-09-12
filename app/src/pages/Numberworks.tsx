import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowLeft, Store } from 'lucide-react'
import { getBand, useBand, BAND_META, type Band } from '@/lib/bands'
import { useActiveLearner } from '@/lib/profiles'
import { logEvent } from '@/lib/events'
import { useBackHandler } from '@/lib/input'
import { useLayoutTier } from '@/hooks/use-layout'
import { read, write } from '@/lib/persist'
import { cn } from '@/lib/utils'
import { challengeLink, decodeChallenge, type Challenge, type ChallengeScore } from '@/lib/challenge'
import {
  BASIN_MAX,
  DAY1_PRICE,
  DOORS,
  DOOR_BY_ID,
  EXPERIMENT_PRICE,
  LEVELS,
  TOMATOES_PER_KG,
  aimFor,
  attemptFor,
  cedis,
  challengeFor,
  cleanNickname,
  closeDay,
  crowdSeedFor,
  dayQuestion,
  eventDrop,
  gaugeFor,
  harmattanBoard,
  kiloPrice,
  levelForBand,
  levelFromSetup,
  ploobLine,
  reconstructionOf,
  repeatBack,
  scheduleOf,
  sendableNickname,
  shareCardFor,
  shoppersFor,
  soloSeed,
  stampOf,
  startDay,
  startStall,
  stockOf,
  topUp,
  whyQuestion,
  type Aim,
  type DayQuestion,
  type DayResult,
  type DayRun,
  type Level,
  type StallState,
  type WhyOption,
} from '@/lib/market'
import { createMarketSim, beginRun, resumeRun, type MarketSim, type MarketViewId } from '@/lib/marketsim'
import { setAssetsDisabled } from '@/lib/marketassets'
import { nextDoor, recordHandIn } from '@/lib/numberworkscampaign'
import { COACH_KEY, type CoachDock } from '@/components/atoms/game/coachDock'
import { PloobChip, PloobLine } from '@/components/atoms/game/ForgeHud'
import Ploob2 from '@/components/brand/Ploob2'
import SceneErrorBoundary from '@/components/SceneErrorBoundary'
import InputHints from '@/components/hud/InputHints'
import ProgressToasts from '@/components/hud/ProgressToasts'
import { Tile } from '@/components/ui/tile'
import type { StallVerb } from '@/components/numberworks/Stall'
import type { Neighbour } from '@/components/numberworks/Neighbours'
import { DaysPlate, MarketBeat, MarketScore, MarketSend, MarketWelcome, OurSpace, StallPlate, TillPlate, type DayReading, type JournalEntry, type StallControls } from '@/components/numberworks/hud/MarketHud'
import { CloseCard, CountLift, EdgeTab, EventCard, ExplainCard, MissionCard, Plates, PredictCard, SaidChip, SideSheet } from '@/components/numberworks/hud/MarketCards'

const MarketScene = lazy(() => import('@/components/numberworks/MarketScene'))

/**
 * The Numberworks — Door 1, The Market. Round A.2, after review 1.
 *
 * The storyboard "The Market: say the number, then make the market prove it",
 * as a phase machine:
 *
 *   welcome → mission → predict → beat → (gather → count) → lab
 *          → [a day runs; four o'clock may pause it] → close → explain → lab
 *          → hand in → scored → send
 *
 * Play is the front door. At EVERY depth the round opens on a number the
 * learner types — how many tomatoes is ₵200 — and Ploob repeats it back; the
 * catch then has that number as its target, the count layer stands the basin
 * up in rows of ten, and the day proves the number. Later days are
 * experiments (observe at ₵4 → what if ₵4.50 → your own price), each opening
 * on a typed till. A day ends with the reconstruction before any score, then
 * one why-question that becomes the stamp. The HUD while the world moves is
 * three plates and the board; Days and Our Space live behind an edge tab.
 *
 * A link (`?c=…`) is the whole world: same seed, same crowd sequence, the
 * dare on the plates. Nothing here talks to a server.
 */
type Phase = 'welcome' | 'mission' | 'predict' | 'beat' | 'gather' | 'count' | 'lab' | 'close' | 'explain' | 'scored' | 'send'

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
function setSimCrowd(sim: MarketSim, seed: number, stock: number, previewPrice: number | null): void {
  sim.shoppers = shoppersFor(seed)
  sim.run = null
  sim.stock = stock
  sim.till = 0
  sim.late = false
  sim.ringAt = -1
  sim.previewPrice = previewPrice
  sim.paused = false
  sim.eventPending = false
}
function setSimStock(sim: MarketSim, stock: number): void {
  if (!sim.run) sim.stock = stock
}
function setSimPreview(sim: MarketSim, price: number | null): void {
  if (!sim.run) sim.previewPrice = price
}
function endSimRun(sim: MarketSim, previewPrice: number | null): void {
  sim.run = null
  sim.paused = false
  sim.eventPending = false
  sim.previewPrice = previewPrice
}
function ringTill(sim: MarketSim): void {
  sim.ringAt = sim.time
}
function decideEvent(sim: MarketSim, drop: boolean, nowMs: number): void {
  const run = sim.run
  if (!run) return
  if (drop) run.schedule = eventDrop(run)
  resumeRun(sim, nowMs)
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
  if (!level || level.kind === 'fill') return { eyebrow: 'tomatoes · each', big: cedis(stall.price, 2), small: stall.discount ? `${cedis(Math.round(stall.price * (1 - stall.discount) * 100) / 100, 2)} after four` : undefined }
  if (level.kind === 'ratio') {
    const each = scheduleOf(level, stall).price
    return { eyebrow: 'tomatoes · kilo', big: cedis(kiloPrice(each), 2), small: `${cedis(each, 2)} each${stall.discount ? ` · −${Math.round(stall.discount * 100)} % at 4` : ''}` }
  }
  const board = harmattanBoard()
  return { eyebrow: 'tomatoes · kilo · Thu', big: cedis(board[board.length - 1], 2), small: stall.prediction === null ? 'Friday — ?' : `Friday — ${cedis(stall.prediction, 2)}` }
}

/** Ploob at the free stall: no target, so what he names is the trade-off itself. */
function freeLine(stall: StallState, run: DayRun | null): string {
  if (run && !run.done) return `${run.sold} sold, ${run.unsold} in the basin.`
  const d = stall.day
  if (!d) return `${stall.stock} in the basin at ${cedis(stall.price, 2)} each. Drag the price and watch the alley — then open the stall.`
  if (d.unsold === 0) return `Sold out at ${cedis(stall.price, 2)} — ${cedis(d.till)} in the till. A higher price sells fewer; would it still make more?`
  return `${d.sold} sold for ${cedis(d.till)}, ${d.passed} walked past, ${d.unsold} left. Move the price and run another day.`
}

function readingOf(id: number, level: Level | null, stall: StallState, day: DayResult): DayReading {
  if (!level || level.kind === 'fill') {
    const hit = !!level && day.till >= level.target.value - 1e-9
    return { id, label: `Day ${id} · ${cedis(stall.price, 2)} each${stall.discount ? ` · ${cedis(3.5, 2)} after four` : ''}`, result: `${cedis(day.till)} · ${day.sold} sold · ${day.unsold} left`, hit }
  }
  const g = gaugeFor(level, { ...stall, day })
  return { id, label: `Day ${id} · +${Math.round(stall.markup * 100)} %${stall.discount ? ` · −${Math.round(stall.discount * 100)} % at 4` : ''}`, result: `${g.cells[0].value} · ${day.unsold} left`, hit: g.hit }
}

/** Whether the board is locked this day: day 1 observes at ₵4, day 2 is the ₵4.50 experiment. */
function priceLockOf(level: Level | null, stall: StallState): number | null {
  if (!level || level.kind !== 'fill') return null
  if (stall.dayIndex === 1 || stall.lastHit === false) return stall.dayIndex === 1 ? DAY1_PRICE : null
  if (stall.dayIndex === 2) return EXPERIMENT_PRICE
  return null
}

export default function Numberworks() {
  const sim = useMemo(() => createMarketSim(), [])
  const [band] = useBand()
  const tier = useLayoutTier()
  const compact = tier === 'phone'
  const dense = tier !== 'desktop'
  const wide = tier === 'desktop' || tier === 'tablet'

  /* ---- where Ploob's line sits (the player's call, remembered) ---- */
  const [dock, setDock] = useState<CoachDock>(() => {
    const saved = read<CoachDock>(COACH_KEY, 'float')
    return saved === 'hidden' ? 'hidden' : 'float'
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
  /** The day's question, while the predict card is up — and the number typed, kept on screen. */
  const [question, setQuestion] = useState<DayQuestion | null>(null)
  const [said, setSaid] = useState<{ q: DayQuestion; typed: number } | null>(null)
  const [caught, setCaught] = useState(0)
  const [rain, setRain] = useState<{ seed: number; startAt: number; startedAtMs: number; seconds: number } | null>(null)
  const [gatherLeft, setGatherLeft] = useState(0)
  const [beat, setBeat] = useState(3)
  const [running, setRunning] = useState(false)
  const [live, setLive] = useState<{ t: number; till: number; sold: number; unsold: number } | null>(null)
  const [eventRun, setEventRun] = useState<DayRun | null>(null)
  const [trials, setTrials] = useState(0)
  const [readings, setReadings] = useState<DayReading[]>([])
  const [score, setScore] = useState<ChallengeScore | null>(null)
  const [opened, setOpened] = useState<number | null>(null)
  const [chosen, setChosen] = useState<WhyOption | null>(null)
  const [journal, setJournal] = useState<JournalEntry[]>(() => read<JournalEntry[]>(JOURNAL_KEY, []))
  const [sheet, setSheet] = useState<'board' | 'space' | null>(null)
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
      setChosen(null)
      setCaught(0)
      setRain(null)
      setRunning(false)
      setLive(null)
      setEventRun(null)
      setSaid(null)
      setSheet(null)
      setDraft({ prediction: null, bound: null })
      const gathers = c.gatherSeconds > 0
      const s = startStall(lvl, gathers ? 0 : BASIN_MAX)
      if (lvl.kind === 'fill') s.price = DAY1_PRICE
      setStall(s)
      // Day 1's crowd is guaranteed to prove a right first number (D5).
      setSimCrowd(sim, crowdSeedFor(c.seed, lvl, 1), s.stock, s.price)
      startedAt.current = Date.now()
      setBeat(3)
      setLine('')
      setPhase('mission')
    },
    [sim],
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
    setEventRun(null)
    setTrials(0)
    setReadings([])
    setSaid(null)
    const s = startStall(LEVELS[0], BASIN_MAX)
    setStall(s)
    setSimCrowd(sim, soloSeed(SESSION_CODE, LEVELS[0]) ^ 0x51a11, s.stock, s.price)
    setPhase('lab')
    setLine('The stall is yours. Drag the price and watch the alley answer — then open the stall and count the till.')
  }, [sim])

  /* ---- mission → predict: the question for this round ---- */
  const askFirst = useCallback(() => {
    if (!level) return
    if (level.kind === 'fill') setQuestion(dayQuestion(level, stall, sim.shoppers))
    else setQuestion({ kind: 'count', question: level.guess.question, answer: level.guess.answer, unit: level.guess.unit, lockPrice: null, decimals: level.guess.step < 1, intent: level.open })
    setPhase('predict')
  }, [level, stall, sim])

  /* ---- the number, typed ---- */
  const commit = useCallback(
    (typed: number) => {
      if (!level || !question) return
      const q = question
      const first = phase === 'predict' && stall.day === null && stall.dayIndex === 1 && q.kind === 'count'
      logEvent('numberworks', band, 'prediction.committed', { variable: `${q.kind === 'count' ? 'guess' : 'till'}:${level.id}:day${stall.dayIndex}`, x: level.tier, predicted: typed, kind: 'point' })
      setSaid({ q, typed })
      setQuestion(null)
      if (level.kind !== 'fill') {
        // Levels 2 and 3: the brief's number, then the beat, then the dials.
        setStall((s) => ({ ...s, guess: typed }))
        setLine(`${q.decimals ? typed.toFixed(2) : Math.round(typed)}. ${q.intent}`)
        setBeat(3)
        setPhase('beat')
        return
      }
      if (q.kind === 'count') {
        setStall((s) => ({ ...s, guess: typed, tillGuess: null, price: q.lockPrice ?? s.price }))
        setLine(repeatBack(q, typed))
        if (first) {
          setBeat(3)
          setPhase('beat')
          return
        }
        // A retry day after a miss: the count again, then straight to the stall.
        setPhase('lab')
        return
      }
      // A later day: the till, typed — then the day runs.
      const price = q.lockPrice ?? stall.price
      const s: StallState = { ...stall, tillGuess: typed, price, discount: 0 }
      setStall(s)
      setLine(repeatBack(q, typed))
      const run = startDay(sim.shoppers, s.stock, { price, discount: 0 })
      beginRun(sim, run, Date.now(), true)
      setRunning(true)
      setLive({ t: 0, till: 0, sold: 0, unsold: run.stock0 })
      setPhase('lab')
    },
    [level, question, phase, stall, band, sim],
  )

  /* ---- the beat: three seconds, then catch or count ---- */
  useEffect(() => {
    if (phase !== 'beat') return
    const t1 = setTimeout(() => setBeat(2), 1000)
    const t2 = setTimeout(() => setBeat(1), 2000)
    const t3 = setTimeout(() => {
      if (!level || !challenge) return
      if (challenge.gatherSeconds > 0) {
        setRain({ seed: challenge.seed, startAt: sim.time, startedAtMs: Date.now(), seconds: challenge.gatherSeconds })
        setGatherLeft(challenge.gatherSeconds)
        setLine(stall.guess !== null ? `Tap the tomatoes as they fall. ${stall.guess} is your number — catch at least that many.` : 'Tap a tomato and it is in the basin.')
        setPhase('gather')
      } else if (level.kind === 'fill') {
        setPhase('count')
      } else {
        setPhase('lab')
      }
    }, 3000)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [phase, level, challenge, sim, stall.guess])

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
        const { stock, topped } = topUp(stockOf(caught), level, stall.guess)
        setStall((s) => ({ ...s, stock }))
        setSimStock(sim, stock)
        setRain(null)
        setLine(topped ? `You caught ${caught}. The wholesaler tops the basin up to your ${stock} — it costs you thrift, not the round.` : `${stock} in the basin.`)
        setPhase('count')
      }
    }, 150)
    return () => clearInterval(id)
  }, [phase, rain, level, caught, sim, stall.guess])

  /* ---- the count layer → the stall ---- */
  const countDone = useCallback(() => {
    if (!level) return
    setLine(level.open)
    setSimView(sim, 'stall')
    setPhase('lab')
  }, [level, sim])

  /* ---- the dials ---- */
  const ctl: StallControls = useMemo(
    () => ({
      onPrice: (v) => {
        const price = Math.round(v * 100) / 100
        setStall((s) => ({ ...s, price }))
        setSimPreview(sim, price)
      },
      onMarkup: (v) => setStall((s) => ({ ...s, markup: Math.round(v * 100) / 100 })),
      onDiscount: (v) => setStall((s) => ({ ...s, discount: Math.round(v * 100) / 100 })),
      onPredict: (v) => setDraft((d) => ({ ...d, prediction: Math.round(v * 100) / 100 })),
      onBound: (v) => setDraft((d) => ({ ...d, bound: Math.round(v * 100) / 100 })),
    }),
    [sim],
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
    if (level && level.kind === 'fill') {
      // Level 1: every day opens on a number. Day 1's was the brief; a day
      // after that asks for the till (or the count again, after a miss).
      const q = dayQuestion(level, stall, sim.shoppers)
      if (q && (stall.day !== null || stall.guess === null)) {
        setQuestion(q)
        setPhase('predict')
        return
      }
    }
    const s: StallState = { ...stall, discount: level?.kind === 'fill' ? 0 : stall.discount }
    setStall(s)
    const run = startDay(sim.shoppers, s.stock, scheduleOf(lvl, s))
    beginRun(sim, run, Date.now(), !!level && level.kind === 'fill')
    setRunning(true)
    setLive({ t: 0, till: 0, sold: 0, unsold: run.stock0 })
    setLine('')
  }, [running, phase, level, sim, stall])
  const closeEarly = useCallback(() => {
    if (sim.run) closeDay(sim.run)
    if (sim.paused) resumeRun(sim, Date.now())
    setEventRun(null)
  }, [sim])
  const onEvent = useCallback(
    (drop: boolean) => {
      decideEvent(sim, drop, Date.now())
      if (drop) setStall((s) => ({ ...s, discount: sim.run?.schedule.discount ?? s.discount }))
      setEventRun(null)
      setLine(drop ? `${cedis(3.5, 2)} on the board. Watch who stops now.` : 'Kept. Three more sales is the sum.')
    },
    [sim],
  )
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const run = sim.run
      if (!run) return
      setLive({ t: run.t, till: run.till, sold: run.sold, unsold: run.unsold })
      if (sim.paused) setEventRun((e) => e ?? run)
      if (run.done) {
        // First thing: this tick is the only one that may record the day. The
        // cleanup below runs after the re-render, and a long frame (a prop
        // arriving mid-day) can let a second tick see the same done run.
        clearInterval(id)
        const day: DayResult = { sold: run.sold, till: run.till, unsold: run.unsold, passed: run.passed, sales: run.sales }
        const t = trials + 1
        const s = stallRef.current
        const hit = level ? gaugeFor(level, { ...s, day }).hit : null
        const next: StallState = { ...s, day, lastHit: hit, discount: level?.kind === 'fill' ? 0 : s.discount }
        setTrials(t)
        setStall(next)
        setReadings((r) => [readingOf(t, level, s, day), ...r].slice(0, 12))
        setLive(null)
        setRunning(false)
        setEventRun(null)
        setLine('')
        // The picture lets the crowd go; the lever shows the next day's alley.
        endSimRun(sim, s.price)
        if (level) {
          if (hit) ringTill(sim)
          // A day run is a reading: what was on the board, what the till said.
          const predicted = s.tillGuess
          logEvent('numberworks', band, 'reading.recorded', {
            variable: level.metric.id,
            x: scheduleOf(level, s).price,
            y: hit !== null ? gaugeFor(level, next).best : day.till,
            repeats: [day.till],
            uncertainty: 0,
            controls: { stock: s.stock, markup: s.markup, discount: s.discount, guess: s.guess ?? -1 },
            predicted,
            predictionClose: predicted === null ? null : Math.abs(predicted - day.till) <= Math.max(10, day.till * 0.1),
            anomalous: false,
          })
          setChosen(null)
          setPhase('close')
        }
      }
    }, LIVE_MS)
    return () => clearInterval(id)
  }, [running, sim, trials, level, band])

  /* ---- another day: the question changes ---- */
  const nextDay = useCallback(() => {
    if (!level || !challenge || level.kind !== 'fill') return
    const dayIndex = stall.dayIndex + 1
    const lock = stall.lastHit === false ? null : dayIndex === 2 ? EXPERIMENT_PRICE : null
    const s: StallState = { ...stall, dayIndex, tillGuess: null, discount: 0, price: lock ?? stall.price }
    setStall(s)
    setSimCrowd(sim, crowdSeedFor(challenge.seed, level, dayIndex), s.stock, s.price)
    setSheet(null)
    setChosen(null)
    setQuestion(dayQuestion(level, s, shoppersFor(crowdSeedFor(challenge.seed, level, dayIndex))))
    setPhase('predict')
  }, [level, challenge, stall, sim])

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

  /* ---- the reconstruction, the question, the stamp ---- */
  const recon = useMemo(() => (level ? reconstructionOf(level, stall) : null), [level, stall])
  const why = useMemo(() => (level ? whyQuestion(level, stall) : null), [level, stall])
  const stamp = useMemo(() => (level ? stampOf(level, stall, chosen) : []), [level, stall, chosen])
  const choose = useCallback(
    (o: WhyOption) => {
      if (!level) return
      setChosen(o)
      logEvent('numberworks', band, 'writeup.completed', { variable: level.metric.id, claim: o.text, reason: o.answer, limitations: o.right ? [] : ['the day says otherwise'], ownWords: false })
    },
    [level, band],
  )
  const explainDone = useCallback(() => {
    if (!level) return
    if (level.kind === 'harmattan') {
      setPhase('scored')
      return
    }
    const g = gaugeFor(level, stall)
    setLine(g.hit ? level.done : level.kind === 'fill' ? (stall.lastHit === false ? 'Another day, then. Same board — how many this time?' : '') : '')
    setPhase('lab')
  }, [level, stall])

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
      const card = shareCardFor(level, stall, undefined, t, s.stars)
      const entry: JournalEntry = { id: `${level.id}:${Date.now()}`, levelId: level.id, title: level.title, figure: card.figure, strategy: card.sub, dare: card.dare, score: s, trials: t, by: challenge.by }
      setJournal((j) => {
        const next = [entry, ...j].slice(0, 12)
        write(JOURNAL_KEY, next)
        return next
      })
    } else {
      setOpened(null)
    }
    // Level 3 has no day to close on: the reconstruction and the question come here.
    if (level.kind === 'harmattan') {
      setChosen(null)
      setPhase('close')
      return
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
  const onTap = useCallback(
    (v: StallVerb) => {
      // During the catch a tap is for a tomato; the stall's parts wait.
      if (phase !== 'lab') return
      if (v === 'till') {
        if (phase !== 'lab') return
        if (running) return
        if (level && gaugeFor(level, stall).hit) handIn()
        else openStall()
      } else if (v === 'board') {
        view('board')
        if (!wide) setSheet('board')
      } else if (v === 'basin') {
        view('stall')
        setLine(stall.day ? `${stall.day.unsold} left in the basin after the day. Unsold is wasted.` : `${stall.stock} tomatoes in the basin. Sixty is all it holds.`)
      } else if (v === 'scale') {
        setLine(level?.kind === 'harmattan' ? 'The scale reads to the nearest fifty grams. Half of that, either way, is how far a weight could be off.' : `Eight tomatoes make about a kilo here. A price each is a price per kilo × ${TOMATOES_PER_KG}.`)
      }
    },
    [phase, running, level, stall, wide, handIn, openStall, view],
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
      if (phase === 'predict' && stall.day !== null) {
        setQuestion(null)
        setPhase('lab')
        return true
      }
      return false
    }, [sheet, phase, score, stall.day]),
  )

  /* ---- derived ---- */
  const hudBottom = tier === 'phone' ? 150 : tier === 'tablet' ? 80 : 40
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
  const priceLock = priceLockOf(level, stall)
  const shownLine = phase === 'lab' ? line || (level ? ploobLine(level, stall, sim.run) : freeLine(stall, sim.run)) : phase === 'gather' || phase === 'count' ? line : ''
  const showHud = phase !== 'welcome'
  const doorOpened = opened ? DOOR_BY_ID[opened] ?? null : null
  const shortWhy = useMemo(() => {
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
  const meta = BAND_META[band]

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
  const boardPanel = <StallPlate level={level} stall={stallForPlate} running={running || (phase !== 'lab' && !free)} free={free} aim={aim} compact={dense} ctl={ctl} priceLock={priceLock} dayIndex={stall.dayIndex} />
  const daysPlate = <DaysPlate readings={readings} compact={dense} />

  /* ---- Ploob's line ---- */
  const coachNode =
    phase !== 'beat' && shownLine ? (
      dock === 'hidden' ? (
        <PloobChip
          unread={heard !== shownLine}
          onOpen={() => {
            setHeard(shownLine)
            setDockAnd('float')
          }}
        />
      ) : (
        <PloobLine
          text={shownLine}
          compact={compact}
          dock="float"
          columns={false}
          onHide={() => {
            setHeard(shownLine)
            setDockAnd('hidden')
          }}
        />
      )
    ) : null

  const plates = (
    <Plates
      level={level}
      stall={stall}
      live={live}
      gather={phase === 'gather' ? { needed: stall.guess, caught, left: gatherLeft } : null}
      compact={dense}
    />
  )

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#E9CFA3]" data-phase={phase} data-hud-bottom={hudBottom} data-running={running ? 'true' : 'false'} data-day={stall.dayIndex} data-till={(live ? live.till : (stall.day?.till ?? 0)).toFixed(2)} data-testid="numberworks">
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

      {/* the HUD: three plates over the world, the board low-left, Ploob low, one edge tab */}
      {showHud && (
        <div className="hud pointer-events-none fixed inset-0 z-20 flex flex-col justify-between gap-2 p-2 sm:p-3">
          <div className="flex items-start justify-between gap-2" data-testid="topbar">
            <div className="flex items-center gap-2">
              <BackToMenu />
              <div className="pointer-events-none flex items-center gap-1.5 pl-1">
                <Ploob2 size={compact ? 22 : 26} />
                {!compact && <span className="atlas-serif text-[17px] leading-none font-semibold text-[#2A2823]">The Numberworks</span>}
              </div>
            </div>
            <div className="flex min-w-0 flex-1 justify-center">{plates}</div>
            <div className="flex items-center gap-1">
              <span className="atlas-chip" style={{ borderColor: meta.tint, color: meta.tint }}>
                {meta.label}
              </span>
              {said && phase !== 'predict' && <SaidChip q={said.q} typed={said.typed} />}
            </div>
          </div>
          <div className="flex items-end justify-between gap-2">
            <div className={cn('shrink-0', wide ? 'w-[17.5rem]' : 'w-auto')}>
              {phase === 'lab' && wide && <div className="max-h-[46vh] overflow-hidden">{boardPanel}</div>}
              {phase === 'lab' && !wide && (
                <Tile onClick={() => setSheet('board')} aria-label="The board" className="atlas-plate-quiet pointer-events-auto flex items-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-extrabold text-[#5A5445] active:scale-95" data-testid="board-button">
                  <Store className="h-4 w-4" /> {board.big}
                </Tile>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col items-center gap-2">{coachNode && <div className="flex justify-center">{coachNode}</div>}</div>
            <div className={cn('shrink-0', wide ? 'w-[19rem]' : 'w-auto')}>
              {phase === 'lab' && (
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
                  onNextDay={level?.kind === 'fill' && stall.day ? nextDay : undefined}
                />
              )}
            </div>
          </div>
        </div>
      )}
      {showHud && phase !== 'gather' && phase !== 'beat' && (
        <div className="pointer-events-none fixed top-1/2 right-0 z-20 -translate-y-1/2">
          <EdgeTab open={sheet === 'space'} count={journal.length} onOpen={() => setSheet(sheet === 'space' ? null : 'space')} />
        </div>
      )}

      {/* level 3 of the HUD: the sheet from the edge */}
      <SideSheet open={sheet === 'space'} onClose={() => setSheet(null)} title="Days · Our Space">
        <div className="min-h-[9rem]">{daysPlate}</div>
        <div className="min-h-0 flex-1">{ourSpace}</div>
      </SideSheet>
      {sheet === 'board' && !wide && (
        <div className="pointer-events-auto fixed inset-0 z-30 flex items-end justify-center bg-[#2A2823]/35 p-2" onClick={() => setSheet(null)} data-testid="sheet-board">
          <div className="max-h-[80vh] w-full max-w-md overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {boardPanel}
          </div>
        </div>
      )}

      {phase === 'welcome' && (
        <MarketWelcome level={inbound ? inbound.level : levelForBand(band as Band, nextDoor().id)} incoming={inbound ? { by: inbound.challenge.by, title: inbound.level.title } : null} onPlay={play} onExplore={explore} />
      )}
      {phase === 'mission' && level && <MissionCard level={level} onNext={askFirst} />}
      {phase === 'predict' && level && question && (
        <PredictCard
          eyebrow={question.kind === 'till' ? `Day ${stall.dayIndex} · before the stall opens` : `Door ${level.door} · The Market · level ${level.tier}`}
          question={question.question}
          unit={question.unit}
          decimals={question.decimals}
          prefix={question.kind === 'till' || (level.kind === 'ratio' && question.unit.startsWith('₵')) ? '₵' : undefined}
          onCommit={commit}
          onClose={
            stall.day !== null
              ? () => {
                  setQuestion(null)
                  setPhase('lab')
                }
              : undefined
          }
        />
      )}
      {phase === 'beat' && <MarketBeat count={beat} />}
      {phase === 'count' && level && (
        <CountLift
          count={stall.stock}
          need={stall.guess}
          line={stall.guess !== null && stall.guess <= stall.stock ? `${Math.ceil(stall.guess / 10)} rows of 10 — your ${stall.guess}` : `${Math.ceil(stall.stock / 10)} rows of 10 — ${stall.stock}`}
          onDone={countDone}
        />
      )}
      {eventRun && running && level && <EventCard run={eventRun} target={level.target.value} onKeep={() => onEvent(false)} onDrop={() => onEvent(true)} />}
      {phase === 'close' && level && recon && (
        <CloseCard level={level} recon={recon} hit={gaugeFor(level, stall).hit} dayIndex={stall.dayIndex} onNext={() => setPhase('explain')} />
      )}
      {phase === 'explain' && level && why && <ExplainCard why={why} stamp={stamp} chosen={chosen} onChoose={choose} onDone={explainDone} />}
      {phase === 'scored' && level && score && (
        <MarketScore
          level={level}
          stall={stall}
          score={score}
          trials={Math.max(1, trials)}
          opened={doorOpened}
          why={shortWhy}
          strategy={card}
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
          onNextDay={level.kind === 'fill' ? nextDay : undefined}
          nextDayLabel={level.kind === 'fill' ? (stall.dayIndex === 1 && stall.lastHit ? `Day 2 — what if ${cedis(EXPERIMENT_PRICE, 2)}?` : `Day ${stall.dayIndex + 1} — your price`) : ''}
          onClose={() => setPhase('lab')}
        />
      )}
      {phase === 'send' && card && <MarketSend card={card} link={link} by={by} onBy={setBy} onClose={() => setPhase(score ? 'scored' : 'lab')} />}

      <span className="sr-only" data-testid="doors">{DOORS.map((d) => d.name).join(' · ')}</span>
      <InputHints />
      <ProgressToasts top="top-[7rem]" />
      {contextLost && <WebglFallback />}
    </div>
  )
}
