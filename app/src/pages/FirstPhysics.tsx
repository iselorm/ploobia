import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import { BAND_CAPS, getBand, useBand } from '@/lib/bands'
import { logEvent, useEvents } from '@/lib/events'
import { useBackHandler } from '@/lib/input'
import { useLayoutMode, usePortrait } from '@/hooks/use-layout'
import { landChord, startAudio } from '@/lib/audio'
import { speak } from '@/lib/narrator'
import { WORLD_BY_ID, type WorldId } from '@/lib/motion'
import {
  A6_HALF,
  BALLS,
  EPISODE_IDS,
  EPISODES,
  FLOORS,
  LANE,
  YARD_DOOR_AFTER,
  arriveEpisode,
  closeCard,
  commitPrediction,
  completedEpisodes,
  createPhysicsSim,
  dragA1,
  dropA7,
  episodeFromParam,
  finishEpisode,
  goA2,
  goA5,
  holdArrowA4,
  resetEpisodeState,
  tapRaceA2,
  land,
  measuredFor,
  missingFor,
  nextEpisode,
  openCard,
  playComplete,
  predictionCorrect,
  pushA6,
  releaseArrowA4,
  resetA7,
  resetWatchA2,
  runA3,
  sentencesFor,
  setBeat,
  setFloorA6,
  setSpeedA3,
  setTeamA5,
  setWorld,
  stepPhysics,
  tapRunnerA3,
  tapWatchA2,
  type CardId,
  type EpisodeId,
  type SentenceTile,
} from '@/lib/physics'
import SceneErrorBoundary from '@/components/SceneErrorBoundary'
import BandSwitch from '@/components/hud/BandSwitch'
import InputHints from '@/components/hud/InputHints'
import ProgressChip from '@/components/hud/ProgressChip'
import ProgressToasts from '@/components/hud/ProgressToasts'
import RotateHint from '@/components/hud/RotateHint'
import EquationCard from '@/components/hud/EquationCard'
import { Tile } from '@/components/ui/tile'
import Ploob from '@/components/brand/Ploob'
import { BeatStrip, type DialHandlers } from '@/components/physics/hud/RoomHud'
import type { AnchorMap } from '@/components/physics/objects'
import type { ScreenMap } from '@/components/physics/PhysicsScene'
import type { SlotState } from '@/components/physics/Shelf'

const PhysicsScene = lazy(() => import('@/components/physics/PhysicsScene'))

const physicsApi = { dragA1, goA2, tapWatchA2, tapRaceA2, resetEpisodeState, resetWatchA2, setSpeedA3, runA3, tapRunnerA3, holdArrowA4, releaseArrowA4, setTeamA5, goA5, setFloorA6, pushA6, setWorld, dropA7, resetA7, measuredFor, openCard, playComplete, stepPhysics }

/**
 * First Physics — the cabinet page.
 *
 * Owns the sim, the beat machine, the event log, the shelf state and the
 * equation card. The scene only draws; the HUD only asks. Every "what
 * happens next" decision is here so the verify suite can drive it through
 * `window.__physicsSim` and the DOM alone.
 */

function SceneFallback() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#1B2A3A]">
      <p className="animate-pulse text-sm font-bold text-[#FBF5EA]/80">Clearing the floor…</p>
    </div>
  )
}

function WebglFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1B2A3A] p-6">
      <div className="w-full max-w-md rounded-[28px] border border-[#F3E9D7] bg-[#FBF5EA] p-8 text-center shadow-2xl">
        <h2 className="text-xl font-black text-[#402222]">The room went dark</h2>
        <p className="mt-2 text-sm leading-relaxed font-semibold text-[#7A5252]">Your browser could not keep the 3D room running (WebGL is unavailable or crashed). Reload to try again.</p>
        <button onClick={() => window.location.reload()} className="mx-auto mt-5 flex items-center gap-2 rounded-full bg-[#2E6DA8] px-6 py-3 text-sm font-extrabold text-[#FBF5EA] shadow transition-all hover:bg-[#245685] active:scale-95">
          <RotateCcw className="h-4 w-4" />
          Reload the room
        </button>
      </div>
    </div>
  )
}

function BackToMenu() {
  return (
    <Link to="/" className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-[#F3E9D7] bg-[#FBF5EA]/90 px-3 py-1.5 text-[11px] font-extrabold text-[#7A5252] shadow-lg backdrop-blur-md transition-all hover:scale-[1.04] hover:text-[#2E6DA8]">
      <ArrowLeft className="h-3.5 w-3.5" />
      Back to Ploobia
    </Link>
  )
}

function Welcome({ onStart, episode }: { onStart: () => void; episode: EpisodeId }) {
  const [band] = useBand()
  const vocab = BAND_CAPS[band].vocab
  const ep = EPISODES[episode]
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0E1620]/55 p-4" data-focus-layer="">
      <div className="fp-plate fp-rise w-full max-w-md p-7 text-center">
        <div className="mx-auto mb-3 w-fit">
          <Ploob size={72} tint="blue" mood="curious" />
        </div>
        <p className="text-[11px] font-extrabold tracking-[0.18em] text-[#8B8471] uppercase">First Physics</p>
        <h1 className="mt-1 text-2xl font-black text-[#2A2823]">{ep.title[vocab]}</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed font-semibold text-[#6B6455]">
          {vocab === 'simple'
            ? 'One thing on the floor at a time. Guess what it will do, try it, then say what you found. Each one goes on the shelf when you are done.'
            : 'One object, one control, one question at a time. Predict, test, notice, then say it back — and each idea earns its place on the shelf.'}
        </p>
        <div className="mt-5">
          <BandSwitch />
        </div>
        <Tile onClick={onStart} className="mx-auto mt-5 rounded-full bg-[#2E6DA8] px-7 py-3 text-[14px] font-extrabold text-[#FBF5EA] shadow-lg transition-all hover:bg-[#245685] active:scale-95" data-start="">
          Start with one Ploob
        </Tile>
      </div>
    </div>
  )
}

export default function FirstPhysics() {
  const sim = useMemo(() => createPhysicsSim(), [])
  const [band] = useBand()
  const caps = BAND_CAPS[band]
  const vocab = caps.vocab
  const layout = useLayoutMode()
  const compact = layout === 'compact'
  const portrait = usePortrait()
  const navigate = useNavigate()
  const params = useParams<{ episode?: string }>()
  const events = useEvents()

  const anchors = useMemo<AnchorMap>(() => ({}), [])
  const screen = useMemo<ScreenMap>(() => ({}), [])

  const [started, setStarted] = useState(false)
  const [contextLost, setContextLost] = useState(false)
  const [tick, setTick] = useState(0)
  const [episode, setEpisode] = useState<EpisodeId>(() => episodeFromParam(params.episode) ?? 'a1')
  const [beat, setBeatState] = useState(sim.beat)
  const [card, setCard] = useState<{ id: CardId; values: Record<string, number> } | null>(null)
  const [pulseId, setPulseId] = useState<string | null>(null)
  const [said, setSaid] = useState<SentenceTile['id'] | null>(null)
  const [landing, setLanding] = useState<EpisodeId | null>(null)
  const [meetStep, setMeetStep] = useState(0)
  const demoTimers = useRef<number[]>([])
  const lastSeq = useRef(-1)
  const lastBeat = useRef(sim.beat)

  /* ---- boot ---- */
  useEffect(() => {
    logEvent('physics', getBand(), 'session.started', {})
    arriveEpisode(sim, episode)
    // Exposed for the Playwright harness (verify-physics.mjs): the sim plus the
    // same pure functions the controls call, so a slow renderer can be driven
    // "like a human" without depending on 30 pointer moves landing in order.
    ;(window as unknown as { __physicsSim?: unknown; __physicsApi?: unknown }).__physicsSim = sim
    ;(window as unknown as { __physicsApi?: unknown }).__physicsApi = physicsApi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim])

  /* ---- keep the HUD in step with the sim ---- */
  useEffect(() => {
    const t = window.setInterval(() => {
      if (sim.seq !== lastSeq.current || sim.a2.swRunning || sim.a3.running || sim.a6.sliding) {
        lastSeq.current = sim.seq
        setTick((n) => n + 1)
      }
      if (sim.beat !== lastBeat.current) {
        lastBeat.current = sim.beat
        setBeatState(sim.beat)
      }
    }, 80)
    return () => window.clearInterval(t)
  }, [sim])

  /* ---- derived shelf state ---- */
  const done = useMemo(() => {
    const s = completedEpisodes(events)
    for (const id of sim.landed) s.add(id)
    return s
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, tick, sim.landed.length])
  const missing = useMemo(() => missingFor(episode, done), [episode, done])
  const shelfStates = useMemo(() => {
    const out = {} as Record<EpisodeId, SlotState>
    for (const id of EPISODE_IDS) {
      if (done.has(id)) out[id] = 'done'
      else if (id === episode) out[id] = 'current'
      else if (EPISODES[id].requires.every((r) => done.has(r))) out[id] = 'open'
      else out[id] = 'ahead'
    }
    return out
  }, [done, episode])
  const doorOpen = done.has(YARD_DOOR_AFTER)

  /* ---- navigation between episodes ---- */
  const goTo = useCallback(
    (id: EpisodeId) => {
      arriveEpisode(sim, id)
      setEpisode(id)
      setCard(null)
      setSaid(null)
      setLanding(null)
      setMeetStep(0)
      setBeatState('arrive')
      navigate(`/physics/${id}`, { replace: true })
    },
    [sim, navigate],
  )

  useEffect(() => {
    const fromUrl = episodeFromParam(params.episode)
    if (fromUrl && fromUrl !== episode) goTo(fromUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.episode])

  const handleStart = useCallback(() => {
    startAudio()
    sim.started = true
    setStarted(true)
    // Arrive → Meet after the object has settled.
    window.setTimeout(() => {
      if (sim.beat === 'arrive') setBeat(sim, 'meet')
    }, 900)
  }, [sim])

  // Arriving an episode after start goes on to Meet after the settle.
  useEffect(() => {
    if (!started || beat !== 'arrive' || missing.length) return
    const t = window.setTimeout(() => {
      if (sim.beat === 'arrive') setBeat(sim, 'meet')
    }, 900)
    return () => window.clearTimeout(t)
  }, [started, beat, sim, episode, missing.length])

  /* ---- Meet: the room demonstrates, the coach narrates, the learner taps through ---- */
  const clearDemo = useCallback(() => {
    for (const t of demoTimers.current) window.clearInterval(t)
    demoTimers.current = []
  }, [])
  const every = useCallback((fn: () => void, ms: number) => {
    const t = window.setInterval(fn, ms)
    demoTimers.current.push(t as unknown as number)
  }, [])

  useEffect(() => {
    if (beat !== 'meet') {
      clearDemo()
      return
    }
    const ep = EPISODES[sim.episode]
    const step = ep.meet[Math.min(meetStep, ep.meet.length - 1)]
    sim.demoMode = true
    setPulseId(step.pulse ?? null)
    if (vocab === 'simple') speak(step.say.simple)
    clearDemo()
    switch (step.do) {
      case 'a1-slide': {
        // The Ploob slides out to 1.5 m and back by itself, so the ruler is seen unrolling.
        // Wall-clock driven, so a slow frame rate stretches nothing: out in 1.6 s, hold, back in 1.4 s, repeat.
        const t0 = performance.now()
        every(() => {
          const t = ((performance.now() - t0) / 1000) % 4.2
          const x = t < 1.6 ? (t / 1.6) * 1.5 : t < 2.2 ? 1.5 : t < 3.6 ? Math.max(0, 1.5 - ((t - 2.2) / 1.4) * 1.5) : 0
          dragA1(sim, x)
        }, 50)
        break
      }
      case 'a2-race':
        goA2(sim)
        every(() => {
          if (!sim.a2.running) goA2(sim)
        }, 5000)
        break
      case 'a3-run':
        setSpeedA3(sim, 1.0)
        runA3(sim)
        every(() => {
          if (!sim.a3.running) {
            sim.a3.t = 0
            runA3(sim)
          }
        }, 8500)
        break
      case 'a4-push': {
        // An arrow grows from the crate, then lets go; the crate slides. Repeats gently.
        const pushOnce = () => {
          const t0 = performance.now()
          const grow = window.setInterval(() => {
            const f = Math.min(10, ((performance.now() - t0) / 800) * 10)
            holdArrowA4(sim, f)
            if (f >= 10) {
              window.clearInterval(grow)
              releaseArrowA4(sim)
            }
          }, 60)
          demoTimers.current.push(grow as unknown as number)
        }
        pushOnce()
        every(() => {
          if (sim.a4.v === 0) {
            sim.a4.x = 0
            pushOnce()
          }
        }, 4500)
        break
      }
      case 'a5-lean':
        // The teams lean back: the rope is under tension but nothing moves until Go.
        break
      case 'a6-cycle': {
        let i = 0
        every(() => {
          i = (i + 1) % FLOORS.length
          setFloorA6(sim, i)
        }, 1400)
        break
      }
      case 'a7-hang':
        break
      default:
        break
    }
    return clearDemo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat, meetStep, sim, episode])

  const handleMeetNext = useCallback(() => {
    const ep = EPISODES[sim.episode]
    if (meetStep < ep.meet.length - 1) {
      setMeetStep((n) => n + 1)
      return
    }
    // Leaving Meet: clear what the room did by itself, then ask.
    clearDemo()
    sim.demoMode = false
    resetEpisodeState(sim)
    setPulseId(null)
    setMeetStep(0)
    setBeat(sim, 'predict')
    setBeatState('predict')
    if (vocab === 'simple') speak(ep.predict.prompt.simple)
  }, [sim, meetStep, clearDemo, vocab])

  /* ---- beats ---- */
  const handlePredict = useCallback(
    (option: string) => {
      const ep = EPISODES[sim.episode]
      commitPrediction(sim, option)
      if (!sim.demoMode)
        logEvent('physics', band, 'prediction.committed', {
          variable: ep.variable ?? ep.id,
          x: ep.predict.options.findIndex((o) => o.id === option),
          predicted: option === ep.predict.correct ? 1 : 0,
          kind: 'direction',
        })
    },
    [sim, band],
  )

  // Episodes whose Play completes on a drag or tap (A1, A3, A4) advance from here.
  useEffect(() => {
    if (beat !== 'play') return
    const t = window.setInterval(() => {
      if (sim.beat === 'play' && playComplete(sim)) setBeat(sim, 'notice')
    }, 250)
    return () => window.clearInterval(t)
  }, [beat, sim])

  const recordReading = useCallback(() => {
    const ep = EPISODES[sim.episode]
    if (sim.demoMode) return
    const pc = predictionCorrect(sim)
    const base = { repeats: [] as number[], uncertainty: 0, controls: {} as Record<string, number>, predicted: pc === null ? null : pc ? 1 : 0, predictionClose: pc, anomalous: false }
    switch (sim.episode) {
      case 'a2':
        if (sim.a2.lap !== null) logEvent('physics', band, 'reading.recorded', { ...base, variable: 'speed', x: LANE, y: LANE / sim.a2.lap, repeats: [sim.a2.lap], uncertainty: 0.25, controls: { distance: LANE } })
        break
      case 'a5': {
        const r = sim.a5.results[sim.a5.results.length - 1]
        if (r) logEvent('physics', band, 'reading.recorded', { ...base, variable: 'resultant', x: r.left - r.right, y: r.moved, controls: { left: r.left, right: r.right } })
        break
      }
      case 'a6':
        for (const r of sim.a6.results) logEvent('physics', band, 'reading.recorded', { ...base, variable: 'stop-distance', x: FLOORS[r.floor].mu, y: Number.isFinite(r.dist) ? r.dist : 2 * A6_HALF * 10, controls: { v0: 1.5 } })
        break
      case 'a7':
        for (const d of sim.a7.drops) logEvent('physics', band, 'reading.recorded', { ...base, variable: 'fall', x: 1.0, y: d.t, controls: { g: sim.g, mass: BALLS[0].kg } })
        break
      default:
        void ep
    }
  }, [sim, band])

  const handleNoticed = useCallback(() => {
    recordReading()
    land(sim)
    if (sim.card) {
      const values = measuredFor(sim, sim.card)
      if (values) setCard({ id: sim.card, values })
    }
    setBeatState('land')
  }, [sim, recordReading])

  const complete = useCallback(() => {
    const ep = EPISODES[sim.episode]
    if (!sim.demoMode) logEvent('physics', band, 'mission.completed', { missionId: ep.id, title: ep.title.formal, skill: ep.skill })
    setLanding(ep.id)
    finishEpisode(sim)
    setCard(null)
    closeCard(sim)
    setBeatState('done')
    window.setTimeout(() => setLanding(null), 1400)
  }, [sim, band])

  const handleSaid = useCallback(
    (correct: boolean) => {
      setSaid(correct ? 'right' : 'wrong')
      complete()
    },
    [complete],
  )

  const handleSayTile = useCallback(
    (t: SentenceTile) => {
      if (t.id === 'right') {
        setSaid('right')
        landChord()
        complete()
      } else {
        setSaid(t.id)
      }
    },
    [complete],
  )

  const handleNext = useCallback(() => {
    const n = nextEpisode(sim.episode)
    if (n) goTo(n)
  }, [sim, goTo])

  const handleDoor = useCallback(() => {
    navigate('/motion')
  }, [navigate])

  useBackHandler(() => {
    if (card) return true
    return false
  })

  /* ---- dial handlers ---- */
  const h = useMemo<DialHandlers>(
    () => ({
      go: () => (sim.episode === 'a2' ? goA2(sim) : goA5(sim)),
      tapWatch: () => tapRaceA2(sim),
      resetWatch: () => resetWatchA2(sim),
      setSpeed: (v) => setSpeedA3(sim, v),
      run: () => runA3(sim),
      setTeam: (side, n) => setTeamA5(sim, side, n),
      setFloor: (i) => setFloorA6(sim, i),
      push: () => pushA6(sim),
      setWorld: (w: WorldId) => setWorld(sim, w),
      drop: () => dropA7(sim),
      resetDrop: () => resetA7(sim),
    }),
    [sim],
  )

  const sentences = useMemo(() => sentencesFor(sim, vocab), [sim, vocab, episode, beat]) // eslint-disable-line react-hooks/exhaustive-deps
  const live = started && (beat === 'play' || beat === 'notice') && !card
  // Arrows point at scene objects by default; instruments that live in the HUD
  // (the stopwatch, the world dial) are found by `data-anchor` instead.
  const project = useCallback(
    (id: string) => {
      const el = document.querySelector<HTMLElement>(`[data-anchor="${id}"]`)
      if (el) {
        const r = el.getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, onScreen: true }
      }
      return screen[id] ?? null
    },
    [screen],
  )
  const ep = EPISODES[episode]
  const hasNext = nextEpisode(episode) !== null
  const stripBottom = compact ? 'bottom-[max(0.75rem,env(safe-area-inset-bottom))]' : 'bottom-6'

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#1B2A3A]" data-cabinet="physics">
      <SceneErrorBoundary>
        <Suspense fallback={<SceneFallback />}>
          <PhysicsScene
            sim={sim}
            episode={episode}
            vocab={vocab}
            live={live}
            pulseId={pulseId}
            anchors={anchors}
            screen={screen}
            portrait={portrait}
            shelfStates={shelfStates}
            doorOpen={doorOpen}
            landing={landing}
            onSelect={goTo}
            onDoor={handleDoor}
            onContextLost={() => setContextLost(true)}
          />
        </Suspense>
      </SceneErrorBoundary>

      <div className="pointer-events-none fixed inset-0 z-10" style={{ background: 'radial-gradient(ellipse at center, transparent 62%, rgba(20, 34, 50, 0.3) 100%)' }} />

      <div className="hud pointer-events-none fixed inset-0 z-20">
        {/* Top bar: the hall's chrome, kept small */}
        <div className="absolute top-3 right-3 left-3 flex items-start justify-between gap-2">
          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            <BackToMenu />
            {!compact && <BandSwitch />}
            <ProgressChip compact />
          </div>
          <div className="fp-plate pointer-events-auto flex items-center gap-2 px-3 py-1.5" data-episode={episode}>
            <span className="font-mono text-[11px] font-bold text-[#2E6DA8] uppercase">{episode}</span>
            <span className="text-[12px] font-extrabold text-[#2A2823]">{ep.title[vocab]}</span>
            <span className="text-[10.5px] font-bold text-[#8B8471]">
              {EPISODE_IDS.indexOf(episode) + 1}/{EPISODE_IDS.length}
            </span>
          </div>
        </div>

        {/* The beat strip: coach chip + the beat's tiles + the one dial */}
        {started && (
          <div className={`pointer-events-auto absolute inset-x-0 ${stripBottom} flex flex-col items-center gap-2 px-3`} data-beat={beat}>
            <BeatStrip
              sim={sim}
              beat={beat}
              vocab={vocab}
              extraWorlds={caps.extraWorlds}
              h={h}
              tick={tick}
              onPredict={handlePredict}
              onNoticed={handleNoticed}
              onSay={handleSayTile}
              sentences={sentences}
              said={said}
              onNext={handleNext}
              hasNext={hasNext}
              missing={missing}
              onGoTo={goTo}
              meetStep={meetStep}
              onMeetNext={handleMeetNext}
            />
          </div>
        )}
      </div>

      {card && (
        <div className="pointer-events-none fixed top-1/2 left-3 z-50 -translate-y-1/2" data-instruments="">
          {card.id === 'speed' && (
            <div className="fp-plate flex flex-col items-start px-3.5 py-2" data-anchor="stopwatch">
              <span className="text-[10px] font-black tracking-[0.14em] text-[#8B8471] uppercase">{vocab === 'simple' ? 'Your stopwatch' : 'Stopwatch'}</span>
              <span className="font-mono text-[22px] font-bold text-[#7CC283] tabular-nums">{(sim.a2.lap ?? 0).toFixed(2)} s</span>
            </div>
          )}
          {card.id === 'weight' && (
            <div className="fp-plate flex flex-col items-start px-3.5 py-2" data-anchor="dial">
              <span className="text-[10px] font-black tracking-[0.14em] text-[#8B8471] uppercase">{vocab === 'simple' ? 'Which world' : 'Gravity dial'}</span>
              <span className="font-mono text-[22px] font-bold text-[#7CC283] tabular-nums">{WORLD_BY_ID[sim.world].label}{vocab !== 'simple' ? ` · ${sim.g} N/kg` : ''}</span>
            </div>
          )}
        </div>
      )}
      {card && (
        <EquationCard card={card.id} values={card.values} vocab={vocab} sentences={sentences} project={project} onPulse={setPulseId} onSaid={handleSaid} />
      )}

      {!started && <Welcome onStart={handleStart} episode={episode} />}
      <RotateHint />
      <InputHints />
      <ProgressToasts />
      {contextLost && <WebglFallback />}
    </div>
  )
}
