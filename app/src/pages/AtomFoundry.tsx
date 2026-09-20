import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowLeft, Users } from 'lucide-react'
import { getBand, useBand, type Band } from '@/lib/bands'
import { useActiveLearner } from '@/lib/profiles'
import { logEvent } from '@/lib/events'
import { useBackHandler } from '@/lib/input'
import { useLayoutTier } from '@/hooks/use-layout'
import { read, write } from '@/lib/persist'
import { cn } from '@/lib/utils'
import { applyBuild, createAtomSim, type AtomViewId } from '@/lib/atoms'
import { challengeLink, decodeChallenge, type Challenge, type ChallengeScore, type ResourceBudget } from '@/lib/challenge'
import {
  affordable,
  attemptFor,
  bankOf,
  challengeFor,
  cleanNickname,
  sendableNickname,
  gaugeFor,
  identityOf,
  levelForBand,
  levelFromSetup,
  nextPart,
  benchLine,
  isPairLevel,
  ploobLine,
  rain as rainFor,
  shareCardFor,
  soloSeed,
  spentOf,
  startBuild,
  EMPTY_BENCH,
  type Bench,
  topUp,
  type Build,
  type Kind,
  type Level,
} from '@/lib/foundry'
import { DOOR_BY_ID, DOORS, type DoorId } from '@/lib/foundry'
import { nextDoor, recordHandIn } from '@/lib/foundrycampaign'
import { COACH_KEY, nextDock, type CoachDock } from '@/components/atoms/game/coachDock'
import { ElementPicker, ElementStrip, RatioDial, Readout } from '@/components/atoms/game/BenchHud'
import { AtlasButton } from '@/components/sugar/hud/AtlasKit'
import SceneErrorBoundary from '@/components/SceneErrorBoundary'
import InputHints from '@/components/hud/InputHints'
import ProgressToasts from '@/components/hud/ProgressToasts'
import { AtomFactCard, elementFact, type ActiveAtomFact } from '@/components/atoms/hud/AtomCards'
import { CATEGORY_META, ELEMENT_BY_Z } from '@/lib/atoms'
import type { ParticleKind } from '@/components/atoms/Dispensers'
import {
  ElementsPanel,
  ForgeBeat,
  ForgeBrief,
  ForgeGauge,
  ForgeScore,
  ForgeSend,
  ForgeTray,
  ForgeWelcome,
  IdentityChip,
  OurSpace,
  PloobLine,
  PloobChip,
  TopBar,
  type JournalEntry,
} from '@/components/atoms/game/ForgeHud'

const ForgeScene = lazy(() => import('@/components/atoms/ForgeScene'))

/**
 * The Foundry — Door 1, The Forge.
 *
 * The page is the storyboard "Foundry Way In", as a phase machine:
 *
 *   welcome → (brief) → beat → (gather) → forge → scored → send
 *
 * Play is the front door. Explorer skips the brief and catches; the other
 * bands guess first and receive the inventory. The bench is one tap away from
 * every phase, untouched. Ploob talks in every phase; the target and the
 * reading share one gauge; a hand-in scores through `lib/challenge` and
 * opens the next door through `lib/foundrycampaign`. Score is not XP.
 *
 * A link (`?c=…`) is the whole world: same seed, same catch, the dare on the
 * gauge. Nothing here talks to a server.
 */

/**
 * Door 1 is played at the forge (`gather` → `forge`); Door 2 at the bench.
 *
 * The bench has its own three: `place` two atoms, `predict` what they make —
 * and only then `readout`. That order is the whole cabinet. A readout that can
 * be reached before a prediction turns the round into reading comprehension.
 */
type Phase = 'welcome' | 'brief' | 'beat' | 'gather' | 'forge' | 'place' | 'predict' | 'readout' | 'scored' | 'send'

const SESSION_CODE = String((Date.now() ^ 0x9e3779b9) >>> 0)
const JOURNAL_KEY = 'ploobia.foundry.journal.v1'
/** The sender's nickname, kept so a child types it once. */
const BY_KEY = 'ploobia.foundry.by.v1'
const LIT_KEY = 'ploobia.foundry.lit.v1'

function SceneFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#E9CFA3]">
      <div className="atlas-plate flex items-center gap-3 px-4 py-3">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#E4DCC9] border-t-[#D99B2B]" />
        <span className="text-[12px] font-extrabold text-[#5A5445]">Lighting the foundry…</span>
      </div>
    </div>
  )
}

function WebglFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#F6F2E8]/90 p-6">
      <div className="atlas-plate max-w-md p-5 text-center">
        <p className="text-[14px] font-black text-[#2A2823]">The 3D view stopped.</p>
        <p className="mt-1 text-[12px] font-semibold text-[#8B8471]">Your device paused the graphics. Reload to light the foundry again — nothing you handed in is lost.</p>
      </div>
    </div>
  )
}

/** The way out: the arcade menu, or — through the Archipelago's door — back to the courtyard. */
function BackToMenu({ fromWorld = false }: { fromWorld?: boolean }) {
  return (
    <Link
      to={fromWorld ? '/world' : '/'}
      aria-label={fromWorld ? 'Back to the courtyard' : 'Back to the arcade'}
      className="tile pointer-events-auto flex items-center gap-1.5 rounded-full border border-[#E9E2D1] bg-[#FCFAF4]/90 px-3 py-2 text-[12px] font-extrabold text-[#5A5445] backdrop-blur-md transition-all hover:bg-[#F1ECDE] active:scale-95"
    >
      <ArrowLeft className="h-4 w-4" />
      {fromWorld ? 'Courtyard' : 'Arcade'}
    </Link>
  )
}

/* The sim is a mutable object the scene reads every frame; these are the only
   two writes the page makes to it outside `applyBuild`, kept out of the
   callbacks so the compiler's immutability rule can see they are deliberate. */
function markStarted(sim: ReturnType<typeof createAtomSim>): void {
  sim.started = true
}
function setSimView(sim: ReturnType<typeof createAtomSim>, id: AtomViewId): void {
  sim.viewId = id
  sim.viewSeq += 1
  sim.autoOrbit = false
}

function sameBuild(a: Build, b: Build): boolean {
  return a.protons === b.protons && a.neutrons === b.neutrons && a.electrons === b.electrons
}

export default function AtomFoundry() {
  const sim = useMemo(() => createAtomSim(), [])
  const [band] = useBand()
  const tier = useLayoutTier()
  const compact = tier === 'phone'
  /**
   * The gauge and the tray are the two widest things in the middle column, and
   * at the tablet tier they were running under the right-hand column — the
   * last gauge cell clipped, "Hand in" half-covered. They take the compact
   * density **one tier earlier** than everything else: the plate loses the
   * "≈ 0.1 nm, enlarged" line and the per-cell to-do line, which is exactly
   * the slack the column needed and nothing a learner is reading mid-forge.
   */
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
  // A line that arrives while Ploob is shut puts a dot on the chip. It never
  // reopens itself: the player closed it, and taking that back would teach
  // them the close button is a lie.
  const learner = useActiveLearner()
  const [heard, setHeard] = useState('')

  /* ---- Door 2: what is on the two pads, and what was predicted ---- */
  const [bench, setBench] = useState<Bench>(EMPTY_BENCH)

  /**
   * Who the card is from.
   *
   * The share card said "Someone forged helium" because nothing ever asked.
   * It starts from the active learner's nickname (unless that is still the
   * stock "Player 1", which is nobody's name), keeps whatever the sender types
   * for next time, and is the **only** thing about a child that travels with a
   * link. `cleanNickname` is what decides that stays true.
   */
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
    const challenge = decodeChallenge(c)
    if (!challenge || challenge.cabinet !== 'atoms') return null
    const level = levelFromSetup(challenge.setup)
    return level ? { challenge, level } : null
  }, [searchParams])

  /* ---- through a door from the Archipelago ---- */
  const fromWorld = searchParams.get('from') === 'world'
  const askedDoor = useMemo<DoorId | null>(() => {
    const n = Number(searchParams.get('door')) as DoorId
    return DOOR_BY_ID[n]?.built ? n : null
  }, [searchParams])

  /* ---- state ---- */
  const [phase, setPhase] = useState<Phase>('welcome')
  const [level, setLevel] = useState<Level | null>(null)
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [build, setBuild] = useState<Build>({ protons: 0, neutrons: 0, electrons: 0 })
  const [history, setHistory] = useState<Build[]>([])
  const [future, setFuture] = useState<Build[]>([])
  const [bank, setBank] = useState<ResourceBudget | null>(null)
  const [caught, setCaught] = useState<Kind[]>([])
  const [rain, setRain] = useState<{ seed: number; kinds: Kind[]; startAt: number; startedAtMs: number; seconds: number } | null>(null)
  const [gatherLeft, setGatherLeft] = useState<number>(0)
  const [beat, setBeat] = useState(3)
  const [trials, setTrials] = useState(0)
  const [score, setScore] = useState<ChallengeScore | null>(null)
  const [opened, setOpened] = useState<number | null>(null)
  const [lit, setLit] = useState<number[]>(() => read<number[]>(LIT_KEY, []))
  const [journal, setJournal] = useState<JournalEntry[]>(() => read<JournalEntry[]>(JOURNAL_KEY, []))
  const [fact, setFact] = useState<ActiveAtomFact | null>(null)
  const [tab, setTab] = useState<'wall' | 'bench' | 'space'>('bench')
  const [spaceOpen, setSpaceOpen] = useState(false)
  const [contextLost, setContextLost] = useState(false)
  const [line, setLine] = useState<string>('')
  const [prev, setPrev] = useState<Build | null>(null)
  const startedAt = useRef(0)
  const prevBuild = useRef<Build | null>(null)
  const factKey = useRef(0)

  useEffect(() => {
    logEvent('atoms', getBand(), 'session.started', {})
  }, [])

  /* ---- the build: one setter, so the sim and the state never drift ---- */
  const commit = useCallback(
    (next: Build, record = true) => {
      setBuild((cur) => {
        if (sameBuild(cur, next)) return cur
        if (record) {
          setHistory((h) => [...h.slice(-30), cur])
          setFuture([])
        }
        prevBuild.current = cur
        setPrev(cur)
        applyBuild(sim, next)
        return next
      })
    },
    [sim],
  )

  const canAfford = useCallback(
    (next: Build) => {
      if (!level || !bank) return true
      return affordable(level, bank, next)
    },
    [level, bank],
  )

  const add = useCallback(
    (k: Kind) => {
      if (phase !== 'forge') return
      const next = { ...build }
      if (k === 'proton') next.protons += 1
      else if (k === 'neutron') next.neutrons += 1
      else next.electrons += 1
      if (next.protons > 20) return
      if (!canAfford(next)) return
      commit(next)
    },
    [phase, build, canAfford, commit],
  )
  const remove = useCallback(
    (k: Kind) => {
      if (phase !== 'forge') return
      const next = { ...build }
      if (k === 'proton') next.protons = Math.max(0, next.protons - 1)
      else if (k === 'neutron') next.neutrons = Math.max(0, next.neutrons - 1)
      else next.electrons = Math.max(0, next.electrons - 1)
      commit(next)
    },
    [phase, build, commit],
  )
  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h
      const last = h[h.length - 1]
      setFuture((f) => [build, ...f])
      prevBuild.current = build
      setPrev(build)
      applyBuild(sim, last)
      setBuild(last)
      return h.slice(0, -1)
    })
  }, [build, sim])
  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f
      const next = f[0]
      setHistory((h) => [...h, build])
      prevBuild.current = build
      setPrev(build)
      applyBuild(sim, next)
      setBuild(next)
      return f.slice(1)
    })
  }, [build, sim])
  const reset = useCallback(() => {
    const s = level ? startBuild(level) : { protons: 0, neutrons: 0, electrons: 0 }
    commit(s)
  }, [level, commit])

  /* ---- the launchers in the world feed the same setter ---- */
  const onCrucible = useCallback((kind: ParticleKind) => add(kind), [add])

  /* ---- starting a level ---- */
  const begin = useCallback(
    (lvl: Level, c: Challenge) => {
      setLevel(lvl)
      setChallenge(c)
      setTrials(0)
      setScore(null)
      setOpened(null)
      setHistory([])
      setFuture([])
      setCaught([])
      setRain(null)
      prevBuild.current = null
      setPrev(null)
      const s = startBuild(lvl)
      applyBuild(sim, s)
      setBuild(s)
      setBench(EMPTY_BENCH)
      startedAt.current = Date.now()
      markStarted(sim)
      if (c.gatherSeconds > 0) setBank({ proton: 0, neutron: 0, electron: 0 })
      else setBank({ ...c.budget })
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
    if (incoming) {
      begin(incoming.level, incoming.challenge)
      return
    }
    // Play opens the door the campaign is actually up to, not always the first
    // one. With two doors built, a learner who has finished the Forge should
    // land on the Bench without hunting for it. A door named in the link
    // (the Archipelago's courtyard sends `door=2`) wins, if it is built.
    const door: DoorId = askedDoor ?? nextDoor().id
    const lvl = levelForBand(band as Band, door)
    begin(lvl, challengeFor(lvl, band, soloSeed(SESSION_CODE, lvl)))
  }, [incoming, band, begin, askedDoor])

  const explore = useCallback(() => {
    setLevel(null)
    setChallenge(null)
    setBank(null)
    setRain(null)
    setHistory([])
    setFuture([])
    prevBuild.current = null
    setPrev(null)
    markStarted(sim)
    setPhase('forge')
    setLine('The bench is yours. Fire a launcher, or use the tray. What you forge goes up on the wall.')
  }, [sim])

  /* ---- the brief → the beat ---- */
  const commitGuess = useCallback(
    (guess: number) => {
      if (!level) return
      logEvent('atoms', band, 'prediction.committed', { variable: `guess:${level.id}`, x: level.tier, predicted: guess, kind: 'point' })
      setLine(guess === level.guess.answer ? `${level.guess.answer} — right. ${level.open}` : `You said ${guess}. ${level.open}`)
      setBeat(3)
      setPhase('beat')
    },
    [level, band],
  )

  /* ---- the beat: three seconds, then catch or build ---- */
  useEffect(() => {
    if (phase !== 'beat') return
    const t1 = setTimeout(() => setBeat(2), 1000)
    const t2 = setTimeout(() => setBeat(1), 2000)
    const t3 = setTimeout(() => {
      if (!level || !challenge) return
      if (isPairLevel(level)) {
        setPhase('place')
      } else if (challenge.gatherSeconds > 0) {
        setRain({ seed: challenge.seed, kinds: rainFor(challenge.seed, level, 60), startAt: sim.time, startedAtMs: Date.now(), seconds: challenge.gatherSeconds })
        setGatherLeft(challenge.gatherSeconds)
        setLine('Two of each is enough. Extra is fine — you will use it later.')
        setPhase('gather')
      } else {
        setPhase('forge')
      }
    }, 3000)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [phase, level, challenge, sim])

  /* ---- the gather round: a catch, not a countdown ---- */
  const onCatch = useCallback(
    (k: Kind) => {
      if (phase !== 'gather') return
      setCaught((c) => [...c, k])
    },
    [phase],
  )
  useEffect(() => {
    if (phase !== 'gather' || !rain || !level) return
    // The round is timed on the **wall clock**, not on rendered-frame time.
    // sim.time accumulates clamped frame deltas, so on a slow renderer it
    // falls behind the child's actual afternoon — a "20 second catch" ran for
    // closer to a minute, which is a bug in the game before it is a bug in the
    // test. The rain's *motion* still runs on sim.time, so the drops keep
    // moving smoothly; only the deadline is real time.
    const id = setInterval(() => {
      const left = rain.seconds + 4 - (Date.now() - rain.startedAtMs) / 1000
      setGatherLeft(Math.max(0, left))
      if (left <= 0) {
        const { bank: b, topped } = topUp(bankOf(caught, level), level)
        setBank(b)
        setRain(null)
        setPhase('forge')
        if (topped) setLine(`You caught ${caught.length}. The launchers top you up this time — build with what is in the tray.`)
      }
    }, 150)
    return () => clearInterval(id)
  }, [phase, rain, level, caught])
  /* ---- the bench: place, predict, read ---- */
  const nextPad: 'a' | 'b' = bench.a === null ? 'a' : bench.b === null ? 'b' : 'b'
  const placeAtom = useCallback(
    (z: number) => {
      setBench((cur) => (cur.a === null ? { ...cur, a: z, predicted: null } : { ...cur, b: z, predicted: null }))
    },
    [],
  )
  const clearPad = useCallback((slot: 'a' | 'b') => {
    // Clearing a pad clears the prediction with it. A guess about a pair that
    // is no longer on the bench is not a guess about anything.
    setBench((cur) => ({ ...cur, [slot]: null, predicted: null }))
  }, [])
  const lockPrediction = useCallback(
    (n: number) => {
      setBench((cur) => ({ ...cur, predicted: n }))
      setPhase('readout')
      // Logged as evidence, the same shape as the brief's guess: this is the
      // prediction the round is actually about.
      if (level) logEvent('atoms', band, 'prediction.committed', { variable: `ratio:${level.id}`, x: level.tier, predicted: n, kind: 'point' })
    },
    [level, band],
  )
  // What is still allowed on the pads, by symbol — a job's budget, spent.
  const allowance = useMemo(() => {
    if (!level || level.target.kind !== 'pair') return {}
    const spent: Record<string, number> = {}
    for (const z of [bench.a, bench.b]) {
      const sym = z === null ? null : ELEMENT_BY_Z[z]?.symbol
      if (sym) spent[sym] = (spent[sym] ?? 0) + 1
    }
    const out: Record<string, number> = {}
    for (const [sym, n] of Object.entries(level.budget)) out[sym] = n - (spent[sym] ?? 0)
    return out
  }, [level, bench])

  /* ---- hand in ---- */
  const handIn = useCallback(() => {
    if (!level || !challenge) return
    const t = trials + 1
    setTrials(t)
    const seconds = (Date.now() - startedAt.current) / 1000
    const { attempt, score: s } = attemptFor(level, challenge, build, t, bank ?? { ...challenge.budget }, seconds, bench)
    setScore(s)
    logEvent('atoms', band, 'challenge.handedIn', { presetId: level.id, stage: level.door, score: s.total, hit: attempt.hit })
    if (attempt.hit) {
      const openedDoor = recordHandIn(level.id, s.total)
      setOpened(openedDoor ? level.door + 1 : null)
      const id = identityOf(build)
      if (id) {
        setLit((cur) => {
          const next = cur.includes(id.z) ? cur : [...cur, id.z]
          write(LIT_KEY, next)
          return next
        })
      }
      const entry: JournalEntry = { id: `${level.id}:${Date.now()}`, levelId: level.id, title: level.title, build: { ...build }, score: s, trials: t, by: challenge.by }
      setJournal((j) => {
        const next = [entry, ...j].slice(0, 12)
        write(JOURNAL_KEY, next)
        return next
      })
    } else {
      setOpened(null)
    }
    setPhase('scored')
  }, [level, challenge, trials, build, bank, band, bench])

  /* ---- the link and the card ---- */
  const link = useMemo(() => {
    if (!level || !challenge) return ''
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return challengeLink(origin, '/atoms', { ...challenge, by: sendableNickname(by) || undefined })
  }, [level, challenge, by])
  const card = useMemo(() => {
    if (!level) return null
    return shareCardFor(level, build, sendableNickname(by) || undefined, lit, Math.max(1, trials), score?.stars ?? 0)
  }, [level, build, by, lit, trials, score])

  /* ---- views ---- */
  const view = useCallback((id: AtomViewId) => setSimView(sim, id), [sim])
  const onTab = useCallback(
    (t: 'wall' | 'bench' | 'space') => {
      setTab(t)
      if (t === 'wall') view('wall')
      else if (t === 'bench') view('overview')
      else setSpaceOpen(true)
    },
    [view],
  )

  const look = useCallback((z: number) => {
    const f = elementFact(z)
    if (!f) return
    factKey.current += 1
    setFact({ fact: f, accent: CATEGORY_META[ELEMENT_BY_Z[z].category].tint, key: factKey.current })
  }, [])

  useBackHandler(
    useCallback(() => {
      if (fact) {
        setFact(null)
        return true
      }
      if (spaceOpen) {
        setSpaceOpen(false)
        return true
      }
      if (phase === 'send') {
        setPhase(score ? 'scored' : 'forge')
        return true
      }
      if (phase === 'scored' || phase === 'brief') {
        setPhase('forge')
        return true
      }
      return false
    }, [fact, spaceOpen, phase, score]),
  )

  /* ---- derived ---- */
  // During the catch the bank IS the catch, so the tray's badges tick up as drops land.
  const liveBank = phase === 'gather' && level ? bankOf(caught, level) : bank
  // A phone has no columns to dock into, so a saved 'left'/'right' floats there.
  const shownDock: CoachDock = !columns && (dock === 'left' || dock === 'right') ? 'float' : dock

  /**
   * How much of the canvas's bottom edge the HUD is sitting on, in CSS pixels.
   *
   * The scene is drawn behind the whole HUD, so on a short screen the shot's
   * centre lands under the tray and the room's subject is composed where the
   * player cannot see it. Telling the camera how tall the furniture is lets it
   * frame the part of the canvas that is actually visible. Desktop is left
   * alone: its columns are beside the scene, not on top of it, and its
   * composition already works.
   */
  const hudBottom =
    tier === 'phone' ? (shownDock === 'float' ? 172 : 110) : tier === 'tablet' ? 80 : 0
  const spent = useMemo(() => (level ? spentOf(level, build) : { proton: 0, neutron: 0, electron: 0 }), [level, build])
  const gauge = useMemo(() => (level ? gaugeFor(level, build) : null), [level, build])
  const aim: Kind | 'hand' | null = useMemo(() => {
    if (!level || phase !== 'forge') return null
    const p = nextPart(level, build)
    return p ?? 'hand'
  }, [level, phase, build])
  const onBench = level !== null && isPairLevel(level)
  /** True when this job wants a prediction before it will show a readout. */
  const askingRatio = level !== null && level.target.kind === 'pair' && level.target.askRatio
  const shownLine =
    phase === 'forge' && level
      ? ploobLine(level, build, prev)
      : onBench && (phase === 'place' || phase === 'predict' || phase === 'readout') && level
        ? benchLine(level, bench)
        : line
  const showBench = phase !== 'welcome'
  const inGame = level !== null
  const doorOpened = opened ? DOOR_BY_ID[opened] ?? null : null
  const presence = 1

  const ourSpace = (
    <OurSpace
      entries={journal}
      incoming={incoming && phase === 'welcome' ? { by: incoming.challenge.by, title: incoming.level.title } : incoming && !inGame ? { by: incoming.challenge.by, title: incoming.level.title } : null}
      onPlay={() => {
        setSpaceOpen(false)
        play()
      }}
      onRemix={() => {
        if (!level) {
          play()
          return
        }
        setPhase('send')
      }}
      compact={compact}
    />
  )

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
    <div className="fixed inset-0 overflow-hidden bg-[#E9CFA3]" data-phase={phase} data-hud-bottom={hudBottom} data-testid="foundry">
      <SceneErrorBoundary>
        <Suspense fallback={<SceneFallback />}>
          <ForgeScene
            sim={sim}
            protons={build.protons}
            neutrons={build.neutrons}
            electrons={build.electrons}
            discovered={lit}
            showNeutrons
            rain={rain}
            bench={onBench ? bench : null}
            showProduct={phase === 'readout' || phase === 'scored' || phase === 'send'}
            phone={tier === 'phone'}
            hudBottom={hudBottom}
            onAdd={onCrucible}
            onCatch={onCatch}
            onTile={look}
            onContextLost={() => setContextLost(true)}
          />
        </Suspense>
      </SceneErrorBoundary>

      {/* the HUD: three columns, one toolbar, Ploob's line */}
      {showBench && (
        <div className="hud pointer-events-none fixed inset-0 z-20 flex flex-col gap-2 p-2 sm:gap-3 sm:p-3">
          <TopBar tab={tab} onTab={onTab} band={band} compact={compact} presence={presence} left={<BackToMenu fromWorld={fromWorld} />} />
          <div className="flex min-h-0 flex-1 gap-3">
            {columns && <div className={cn('flex min-h-0 flex-col gap-2', tier === 'desktop' ? 'w-[18.5rem] shrink-0' : 'w-[11.5rem] shrink-0')}>
              {/* the panel owns the column's slack and clips inside itself, so
                  a docked Ploob underneath never squeezes a card off the end */}
              <div className="min-h-0 flex-1 overflow-hidden">
                {onBench && level ? (
                  <ElementPicker bench={bench} slot={nextPad} allowance={allowance} compact={tier !== 'desktop'} onPick={placeAtom} onClear={clearPad} />
                ) : (
                  <ElementsPanel onLook={look} onWall={() => onTab('wall')} compact={tier !== 'desktop'} />
                )}
              </div>
              {shownDock === 'left' && coachNode}
            </div>}
            <div className="flex min-w-0 flex-1 flex-col justify-between">
              <div className="flex items-start justify-between gap-2">
                {inGame && level && phase !== 'brief' ? (
                  <ForgeGauge level={level} build={build} bench={bench} trials={trials + 1} gather={phase === 'gather' ? { left: gatherLeft, total: challenge?.gatherSeconds ?? 0 } : null} compact={dense} />
                ) : (
                  <IdentityChip build={build} />
                )}
                {/* The nuclide chip is the forge's reading. At the bench there
                    is no single atom to name, and "No atom yet · 0 p⁺" beside
                    two atoms on the pads is just wrong. */}
                {inGame && !onBench && <IdentityChip build={build} />}
              </div>
              <div className="flex flex-col gap-2">
                {(shownDock === 'float' || shownDock === 'hidden') && coachNode && (
                  <div className="flex justify-start pl-2 sm:pl-8">{coachNode}</div>
                )}
                {columns && phase === 'predict' && level && <RatioDial level={level} bench={bench} compact={false} onLock={lockPrediction} />}
                {columns && phase === 'readout' && (
                  <Readout bench={bench} locked={bench.predicted !== null || !askingRatio} compact={false} onHandIn={handIn} />
                )}
                {/* No side columns means no picker; the strip is where the
                    elements live on a phone. Without it Door 2 could not be
                    played on a phone at all. */}
                {phase === 'place' && level && !columns && (
                  <ElementStrip bench={bench} slot={nextPad} allowance={allowance} onPick={placeAtom} onClear={clearPad} />
                )}
                {phase === 'place' && level && (
                  <div className="atlas-plate pointer-events-auto flex w-full max-w-[30rem] items-center justify-between gap-3 p-3" data-testid="place">
                    <div className="min-w-0">
                      <span className="atlas-eyebrow">On the bench</span>
                      <p className="text-[13px] leading-snug font-black text-[#2A2823]">
                        {bench.a === null || bench.b === null ? 'Put an atom on each pad.' : 'Two atoms down. Ready?'}
                      </p>
                    </div>
                    <AtlasButton
                      onClick={() => setPhase(askingRatio ? 'predict' : 'readout')}
                      tone="primary"
                      invite
                      disabled={bench.a === null || bench.b === null}
                      className="shrink-0 py-2"
                      ariaLabel={askingRatio ? 'Say what forms' : 'See what formed'}
                    >
                      {askingRatio ? 'Say what forms' : 'See what formed'}
                    </AtlasButton>
                  </div>
                )}
                {(phase === 'forge' || phase === 'gather') && (
                  <ForgeTray
                    bank={liveBank}
                    spent={spent}
                    aim={aim}
                    canUndo={history.length > 0 && phase === 'forge'}
                    canRedo={future.length > 0 && phase === 'forge'}
                    hit={!!gauge?.hit}
                    free={!inGame}
                    compact={dense}
                    onAdd={add}
                    onRemove={remove}
                    onUndo={undo}
                    onRedo={redo}
                    onReset={reset}
                    onSend={() => setPhase('send')}
                    onHandIn={handIn}
                  />
                )}
              </div>
            </div>
            {columns && (
              <div className={cn('flex min-h-0 flex-col gap-2', tier === 'desktop' ? 'w-[18.5rem] shrink-0' : 'w-[12rem] shrink-0')}>
                <div className="min-h-0 flex-1 overflow-hidden">{ourSpace}</div>
                {shownDock === 'right' && coachNode}
              </div>
            )}
          </div>
        </div>
      )}

      {/* On a phone the dial and the readout are sheets.
          Inside the HUD's flex column nothing bounded their height, so the
          card ran past the bottom of a 390 px screen and took "Lock it in"
          with it — the one control the round cannot continue without. A sheet
          is bounded by the viewport by construction, which is the whole reason
          this layout already uses one for Our Space. */}
      {!columns && (phase === 'predict' || phase === 'readout') && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center p-2">
          <div className="pointer-events-auto w-full max-w-md">
            {phase === 'predict' && level && <RatioDial level={level} bench={bench} compact onLock={lockPrediction} />}
            {phase === 'readout' && <Readout bench={bench} locked={bench.predicted !== null || !askingRatio} compact onHandIn={handIn} />}
          </div>
        </div>
      )}

      {/* the phone's Our Space, as a sheet */}
      {spaceOpen && !columns && (
        <div className="pointer-events-auto fixed inset-0 z-30 flex items-end justify-center bg-[#2A2823]/35 p-2" onClick={() => setSpaceOpen(false)}>
          <div className="max-h-[80vh] w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            {ourSpace}
          </div>
        </div>
      )}

      {phase === 'welcome' && (
        <ForgeWelcome
          level={incoming ? incoming.level : levelForBand(band as Band, askedDoor ?? nextDoor().id)}
          incoming={incoming ? { by: incoming.challenge.by, title: incoming.level.title } : null}
          from={
            fromWorld
              ? {
                  eyebrow: 'From the Foundry courtyard',
                  line: 'The foreman wants bronze. Copper with tin in it, in a proportion — that is a counting question, and this is the bench that counts.',
                  back: 'Back to the courtyard',
                  to: '/world',
                }
              : null
          }
          onPlay={play}
          onExplore={explore}
        />
      )}
      {phase === 'brief' && level && <ForgeBrief level={level} onCommit={commitGuess} onClose={() => setPhase('forge')} />}
      {phase === 'beat' && <ForgeBeat count={beat} />}
      {phase === 'scored' && level && score && (
        <ForgeScore
          level={level}
          build={build}
          score={score}
          trials={trials}
          spent={spent}
          bank={bank}
          opened={doorOpened}
          onNext={() => {
            // Go through actually goes through, now that there is somewhere to
            // go. It was written when Door 2 did not exist and the honest move
            // was back to the map; a door that opens and then hands you a menu
            // is a door that did not open.
            const door = nextDoor()
            if (door.built && doorOpened && door.id === doorOpened.id) {
              const lvl = levelForBand(band as Band, door.id)
              begin(lvl, challengeFor(lvl, band, soloSeed(SESSION_CODE, lvl)))
              return
            }
            setPhase('welcome')
          }}
          onSend={() => setPhase('send')}
          onAgain={() => {
            reset()
            setPhase('forge')
          }}
          onClose={() => setPhase('forge')}
        />
      )}
      {phase === 'send' && card && (
        <ForgeSend card={card} build={build} link={link} by={by} onBy={setBy} onClose={() => setPhase(score ? 'scored' : 'forge')} />
      )}

      {fact && (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center px-4">
          <AtomFactCard active={fact} onClose={() => setFact(null)} />
        </div>
      )}
      <span className="sr-only" data-testid="doors">{DOORS.map((d) => d.name).join(' · ')}</span>
      <span className="sr-only" data-testid="presence"><Users className="h-3 w-3" />{presence}</span>
      <InputHints />
      <ProgressToasts />
      {contextLost && <WebglFallback />}
    </div>
  )
}
