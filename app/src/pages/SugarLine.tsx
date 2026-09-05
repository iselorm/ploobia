import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
  ArrowLeft,
  Clock,
  LineChart,
  RotateCcw,
  SlidersHorizontal,
  Sprout,
  Swords,
  Trophy,
} from 'lucide-react'
import SceneErrorBoundary from '@/components/SceneErrorBoundary'
import BandSwitch from '@/components/hud/BandSwitch'
import HudDrawer from '@/components/hud/HudDrawer'
import RotateHint from '@/components/hud/RotateHint'
import InputHints from '@/components/hud/InputHints'
import ProgressChip from '@/components/hud/ProgressChip'
import ProgressToasts from '@/components/hud/ProgressToasts'
import StereoOverlay from '@/components/hud/StereoOverlay'
import { Tile } from '@/components/ui/tile'
import { cn } from '@/lib/utils'
import { BAND_CAPS, getBand, useBand } from '@/lib/bands'
import { logEvent } from '@/lib/events'
import { useBackHandler, useInputAction } from '@/lib/input'
import { useLayoutMode } from '@/hooks/use-layout'
import {
  narrationAvailable,
  narrationOn,
  setNarration,
  speak,
  startNarration,
  stopNarration,
} from '@/lib/narrator'
import {
  narrateNext,
  narrateOpening,
  narrateResult,
  narrateTrialStart,
} from '@/lib/sugarnarrate'
import { enterStereo, useStereo } from '@/lib/stereo'
import { SPECIMEN_BY_ID } from '@/lib/specimens'
import {
  findBottleneck,
  predictionClose,
  type MeasureId,
  type SugarReading,
  type SugarVarId,
} from '@/lib/sugarline'
import {
  CLOCK_LIVE_MULTIPLIER,
  CLOCK_TRACER_MULTIPLIER,
  createSugarSim,
  loadSpecimen,
  makeReading,
  missionProgress,
  missionsForBand,
  simEnv,
  simSolve,
  snapshotTrial,
  SUGAR_DEMO,
  SUGAR_VARS,
  STAGE_BY_ID,
  type DemoApi,
  type StageId,
} from '@/lib/sugarsim'
import { Coach, PillGroup, ScaleBar } from '@/components/sugar/hud/AtlasKit'
import {
  ConditionsPlate,
  InstrumentPlate,
  LedgerPlate,
  SpecimenPlate,
  SpecimenRail,
  StageTabs,
  TipCard,
  ToolRail,
  type Conditions,
} from '@/components/sugar/hud/Panels'
import DataPlate from '@/components/sugar/hud/DataPlate'
import MissionPlate from '@/components/sugar/hud/MissionPlate'
import Welcome from '@/components/sugar/hud/Welcome'
import DemoOverlay from '@/components/sugar/hud/DemoOverlay'
import Reveal from '@/components/sugar/hud/Reveal'
import { defaultViewFor, VIEW_BY_ID, viewsForStage } from '@/components/sugar/views'
import { ChallengeBar, ChallengeBrief, GatherHud, ScoreCard } from '@/components/sugar/hud/Challenge'
import { useSugarChallenge } from '@/hooks/use-sugar-challenge'
import { decodeChallenge, type Challenge } from '@/lib/challenge'
import { CO2_AMBIENT_PPM, CO2_MAX_PPM, PAR_FULL_SUN } from '@/lib/ratelab'
import {
  BASE_SOIL_WATER,
  canAfford,
  capsFor,
  co2DialFor,
  metricValue,
  POUR_DRAW,
  trialCost,
  WATER_PER_POUR,
  type SugarResource,
} from '@/lib/sugarchallenge'

const SugarScene = lazy(() => import('@/components/sugar/SugarScene'))

/* ------------------------------------------------------------------ */

function SceneFallback() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#F6F2E8]">
      <p className="atlas-serif animate-pulse text-[15px] font-semibold text-[#8B8471] italic">
        Mounting the specimen…
      </p>
    </div>
  )
}

function WebglFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#F6F2E8] p-6">
      <div className="atlas-plate w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#E7F1E3]">
          <Sprout className="h-7 w-7 text-[#3E7C43]" />
        </div>
        <h2 className="atlas-serif text-[22px] font-semibold text-[#2A2823]">
          The plate could not be drawn
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed font-semibold text-[#8B8471]">
          Your browser could not start the 3D view (WebGL is unavailable or crashed). Try reloading, or
          open this in a browser with WebGL enabled.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mx-auto mt-5 flex items-center gap-2 rounded-full bg-[#2F6134] px-6 py-3 text-sm font-extrabold text-[#FBF8EF] shadow transition-all hover:bg-[#24512A] active:scale-95"
        >
          <RotateCcw className="h-4 w-4" />
          Reload
        </button>
      </div>
    </div>
  )
}

function BackToMenu() {
  return (
    <Link
      to="/"
      className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-[#E4DCC9] bg-[#FCFAF4]/92 px-3 py-1.5 text-[11px] font-extrabold text-[#8B8471] shadow-sm backdrop-blur-md transition-all hover:scale-[1.04] hover:text-[#2F6134]"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Back to Ploobia
    </Link>
  )
}

/** The plant clock, always on screen: a simulation that speeds time up must say so. */
function ClockChip({ hours, rate }: { hours: number; rate: number }) {
  const h = Math.floor(hours % 24)
  const m = Math.floor((hours % 1) * 60)
  return (
    <span className="atlas-chip pointer-events-auto" title="Plant time, and how much faster it runs than real time">
      <Clock className="h-3 w-3" />
      {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')} · ×{rate}
    </span>
  )
}

/**
 * The way into the arcade layer, and the only one.
 *
 * A chip beside the clock rather than a banner or an interstitial: the lab is
 * the spine, and the challenge is something a learner reaches for when they
 * want it. Anyone who never presses this never meets a timer, a budget or a
 * score, and the cabinet behaves exactly as it did before the feature existed.
 */
function ChallengeChip({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="atlas-chip pointer-events-auto shrink-0 border-[#C8DFC2] bg-[#E7F1E3] font-extrabold text-[#2F6134] transition-all hover:scale-[1.04] hover:bg-[#DCEBD6] active:scale-95"
    >
      <Swords className="h-3 w-3" />
      Challenge
    </button>
  )
}

/* ------------------------------------------------------------------ */

export default function SugarLine() {
  const sim = useMemo(() => createSugarSim(), [])
  const [band] = useBand()
  const caps = BAND_CAPS[band]
  const layout = useLayoutMode()
  const compact = layout === 'compact'
  const stereo = useStereo()

  const [started, setStarted] = useState(false)
  const [contextLost, setContextLost] = useState(false)
  /**
   * How much of the screen bottom the compact sheet is covering. The scene
   * shifts its projection up by half of it, so the specimen stays visible
   * while a control that changes it is open. 0 on desktop and when closed.
   */
  const [sheetPx, setSheetPx] = useState(0)
  const [stage, setStage] = useState<StageId>('plant')
  const [specimenId, setSpecimenId] = useState(sim.specimenId)
  const [conditions, setConditions] = useState<Conditions>({
    light: sim.light,
    co2: sim.co2,
    tempC: sim.tempC,
    soilWater: sim.soilWater,
    night: sim.night,
    girdled: sim.girdled,
  })
  const [measure, setMeasure] = useState<MeasureId>(sim.measure)
  const [xVar, setXVar] = useState<SugarVarId>(sim.xVar)
  const [readings, setReadings] = useState<SugarReading[]>([])
  const [prediction, setPrediction] = useState<number | null>(null)
  const [trialRunning, setTrialRunning] = useState(false)
  const [trialProgress, setTrialProgress] = useState(0)
  const [abortNotice, setAbortNotice] = useState(false)
  const [tracerActive, setTracerActive] = useState(false)
  const [tracerWatch, setTracerWatch] = useState<0 | 1 | 2>(0)
  const [tracerSeconds, setTracerSeconds] = useState(0)
  const [tracerResult, setTracerResult] = useState<{ speed: number; truth: number } | null>(null)
  const [vision, setVision] = useState(false)
  const [autoOrbit, setAutoOrbit] = useState(false)
  const [viewId, setViewId] = useState('overview')
  const [tipOpen, setTipOpen] = useState(true)
  const [narrating, setNarrating] = useState(() => narrationOn())
  const [habitat, setHabitat] = useState(sim.habitat)
  const [activeMission, setActiveMission] = useState<string | null>(null)
  /** The reading whose result card is currently up. */
  const [reveal, setReveal] = useState<SugarReading | null>(null)
  const [rightTab, setRightTab] = useState<'atlas' | 'data' | 'ledger' | 'missions'>('atlas')
  const [plantHours, setPlantHours] = useState(sim.plantHours)
  const [clockRate, setClockRate] = useState(CLOCK_LIVE_MULTIPLIER)
  /** -1 = not running. */
  const [demoStep, setDemoStep] = useState(-1)
  const [demoProgress, setDemoProgress] = useState(0)

  /* ---- the challenge layer, which the lab below knows nothing about ---- */
  const run = useSugarChallenge()
  /** A challenge that arrived by link, offered in place of the preset list. */
  const [incoming, setIncoming] = useState<Challenge | null>(null)
  /** The last catch, purely so the gather HUD can flash. */
  const [caught, setCaught] = useState<{ kind: SugarResource; n: number } | null>(null)
  const catchCount = useRef(0)
  const gathering = run.phase === 'gather'
  const inChallenge = run.phase === 'gather' || run.phase === 'lab'
  /**
   * The interval below is keyed on [sim, caps, band] and everything else it
   * reads is a stale closure — the same trap `predictionRef` and `readingsRef`
   * already exist to avoid. The run object is rebuilt every render, so it has
   * to come through a ref or the bank would never be drawn down.
   */
  const runRef = useRef(run)
  runRef.current = run

  const nextId = useRef(1)
  const lastCompleted = useRef(0)
  const lastAborted = useRef(0)
  const lastTracer = useRef(0)
  const predictionRef = useRef<number | null>(null)
  predictionRef.current = prediction
  // Same reason as `predictionRef`: the frame-sync effect below is keyed on
  // [sim, caps, band], so anything else read inside it is a stale closure. The
  // narration needs the live reading list, and it must name the specimen that
  // is actually on the plate — not the one that was there when the effect was
  // created.
  const readingsRef = useRef<SugarReading[]>([])
  readingsRef.current = readings
  const demoFirstReadingId = useRef(1)

  const specimen = SPECIMEN_BY_ID[specimenId]

  useEffect(() => {
    logEvent('photosynthesis', getBand(), 'session.started', {})
    // A voice that carries on after the learner has left the cabinet is the
    // worst possible failure of this feature.
    return () => stopNarration()
  }, [])

  // Test handles. The suite drives the real controls and then reads the model
  // through these, so an assertion can never be satisfied by the HUD alone.
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    w.__sugarSim = sim
    w.__sugarSolve = () => simSolve(sim)
    return () => {
      delete w.__sugarSim
      delete w.__sugarSolve
    }
  }, [sim])


  /* ---- keep the UI in step with what the render loop mutates ---- */
  useEffect(() => {
    const t = window.setInterval(() => {
      setTrialRunning(sim.trialRunning)
      setTrialProgress(sim.trialRunning ? Math.min(1, sim.trialElapsed / sim.trialLength) : 0)
      setTracerActive(sim.tracerActive)
      setTracerSeconds(sim.tracerWatchSeconds)
      setPlantHours(sim.plantHours)
      setClockRate(sim.tracerActive ? CLOCK_TRACER_MULTIPLIER : CLOCK_LIVE_MULTIPLIER)
      setConditions((prev) =>
        Math.abs(prev.soilWater - sim.soilWater) > 0.004 ? { ...prev, soilWater: sim.soilWater } : prev,
      )

      if (sim.trialCompleted !== lastCompleted.current) {
        lastCompleted.current = sim.trialCompleted
        const snap = sim.trialSnapshot
        if (snap) {
          const reading = makeReading(nextId.current++, sim, snap, caps, predictionRef.current)
          setReadings((prev) => [...prev, reading])
          setPrediction(null)
          /* A challenge pays for the trial it has just run, and is offered the
             goal metric. The goal is read off the model rather than off the
             result card, because the metric a challenge targets need not be
             the instrument the learner happens to have selected. Paying on
             *completion* rather than on start is deliberate: a trial the
             learner aborted by moving a dial produced no evidence, and
             charging for it would punish the correction the cabinet spent all
             its effort teaching. */
          const r = runRef.current
          if (r.phase === 'lab' && r.challenge && !sim.demoMode) {
            r.spend(
              trialCost({
                // `snap.light` is already in PAR units with night applied, and
                // `snap.co2` is already ppm — so both are converted back to
                // dial units here rather than the cost being redefined.
                light: snap.light / PAR_FULL_SUN,
                co2: snap.co2 / CO2_MAX_PPM,
                night: false,
              }),
            )
            r.offer(metricValue(simSolve(sim), r.challenge.goal.metric))
          }
          // The one moment the graph is worth interrupting for. Suppressed
          // during the demo, which drives the real handlers and would
          // otherwise pop a card on every one of its fourteen steps.
          if (!sim.demoMode) setReveal(reading)
          // The result and the reason, then one concrete thing to try. Two
          // utterances rather than one, because the suggestion has to survive
          // the learner reading the reveal card over the top of it.
          if (!sim.demoMode && narrationOn()) {
            const live = SPECIMEN_BY_ID[sim.specimenId] ?? specimen
            const ctx = {
              specimen: live,
              solve: simSolve(sim),
              bottleneck: findBottleneck(live, simEnv(sim), sim.carbon, {
                girdled: sim.girdled,
              }),
              measure: sim.measure,
              xVar: sim.xVar,
              reading,
              readings: [...readingsRef.current, reading],
              prediction: reading.predicted,
              night: sim.night,
              girdled: sim.girdled,
            }
            speak(narrateResult(ctx), { interrupt: true })
            speak(narrateNext(ctx), { queue: true })
          }
          if (!sim.demoMode) {
            logEvent('photosynthesis', band, 'reading.recorded', {
              variable: reading.xVar,
              x: reading.x,
              y: reading.y,
              repeats: reading.repeats,
              uncertainty: reading.uncertainty,
              controls: reading.controls,
              predicted: reading.predicted,
              predictionClose:
                reading.predicted === null ? null : predictionClose(reading.predicted, reading.y),
              anomalous: reading.anomalous,
            })
          }
        }
      }

      if (sim.trialAborted !== lastAborted.current) {
        lastAborted.current = sim.trialAborted
        setAbortNotice(true)
        window.setTimeout(() => setAbortNotice(false), 4000)
      }

      if (sim.tracerCompleted !== lastTracer.current) {
        lastTracer.current = sim.tracerCompleted
        setTracerWatch(0)
        // Only a run the learner actually timed produces a reading.
        if (sim.tracerWatchSeconds > 0.5) {
          const gap = sim.tracerMarkB - sim.tracerMarkA
          const speed = (gap / sim.tracerWatchSeconds) * 3600
          const truth = sim.tracerTrueSeconds > 0.01 ? (gap / sim.tracerTrueSeconds) * 3600 : speed
          setTracerResult({ speed, truth })
          const snap = snapshotTrial(sim)
          snap.measure = 'velocity'
          const reading = makeReading(nextId.current++, sim, snap, caps, predictionRef.current)
          reading.y = Number(speed.toFixed(2))
          reading.repeats = [reading.y]
          reading.uncertainty = Number(Math.abs(speed - truth).toFixed(2))
          setReadings((prev) => [...prev, reading])
          if (!sim.demoMode) {
            logEvent('photosynthesis', band, 'reading.recorded', {
              variable: reading.xVar,
              x: reading.x,
              y: reading.y,
              repeats: reading.repeats,
              uncertainty: reading.uncertainty,
              controls: reading.controls,
              predicted: null,
              predictionClose: null,
              anomalous: false,
            })
          }
        }
      }
    }, 220)
    return () => window.clearInterval(t)
  }, [sim, caps, band])

  /* ---- handlers ---- */

  /**
   * Changing a condition part-way through a measurement would make the average
   * meaningless, so the trial is discarded rather than quietly mislabelled.
   */
  const abortTrial = useCallback(() => {
    if (!sim.trialRunning) return
    sim.trialRunning = false
    sim.trialElapsed = 0
    sim.trialSum = 0
    sim.trialSamples = 0
    sim.trialSnapshot = null
    sim.trialAborted += 1
    setTrialRunning(false)
    setTrialProgress(0)
  }, [sim])

  /**
   * How far each dial may travel, given what is left in the bank.
   *
   * This is the feature's whole argument in four lines. A limiting factor
   * described in a sentence is forgettable; a light dial that *stops* two
   * thirds of the way along, because that is where your gathering ran out, is
   * not. Null in the plain lab, where nothing is scarce.
   */
  const dialCaps = useMemo(() => {
    if (!inChallenge) return null
    // The grant, not the balance — see `capsFor`. During the gather round the
    // grant is not settled yet, and the lab is not on screen anyway.
    const c = capsFor(run.phase === 'lab' ? run.granted : run.bank)
    return { light: c.light, co2: co2DialFor(c.co2ppm), soilWater: c.water }
  }, [inChallenge, run.phase, run.granted, run.bank])
  const dialCapsRef = useRef(dialCaps)
  dialCapsRef.current = dialCaps

  // The challenge run, for the same reason. A suite that could only read the
  // HUD would pass on a bar that displayed a bank nothing was drawing down.
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    w.__sugarRun = () => ({
      phase: run.phase,
      bank: run.bank,
      granted: run.granted,
      spent: run.spent,
      trials: run.trials,
      best: run.best,
      hit: run.hit,
      secondsLeft: run.secondsLeft,
      score: run.score,
      challenge: run.challenge,
      caps: dialCaps,
    })
    return () => {
      delete w.__sugarRun
    }
  }, [run, dialCaps])

  const patchConditions = useCallback(
    (patch: Partial<Conditions>) => {
      abortTrial()
      // Clamped here rather than in the panel so that every route to a
      // condition — sliders, the demo, a mission, a keyboard — meets the same
      // ceiling. A cap one caller can forget is not a cap.
      const cap = dialCapsRef.current
      if (cap) {
        if (patch.light !== undefined) patch = { ...patch, light: Math.min(patch.light, cap.light) }
        if (patch.co2 !== undefined) patch = { ...patch, co2: Math.min(patch.co2, cap.co2) }
        if (patch.soilWater !== undefined)
          patch = { ...patch, soilWater: Math.min(patch.soilWater, cap.soilWater) }
      }
      if (patch.light !== undefined) sim.light = patch.light
      if (patch.co2 !== undefined) sim.co2 = patch.co2
      if (patch.tempC !== undefined) sim.tempC = patch.tempC
      if (patch.soilWater !== undefined) sim.soilWater = patch.soilWater
      if (patch.night !== undefined) sim.night = patch.night
      if (patch.girdled !== undefined) sim.girdled = patch.girdled
      setConditions((prev) => ({ ...prev, ...patch }))
    },
    [sim, abortTrial],
  )

  const handleSpecimen = useCallback(
    (id: string) => {
      if (!SPECIMEN_BY_ID[id]) return
      abortTrial()
      loadSpecimen(sim, id)
      setSpecimenId(id)
      setTracerResult(null)
      setConditions((prev) => ({ ...prev, girdled: false }))
    },
    [sim, abortTrial],
  )

  const handleStage = useCallback(
    (s: StageId) => {
      sim.stage = s
      setStage(s)
      const v = defaultViewFor(s)
      sim.viewId = v.id
      sim.viewSeq += 1
      setViewId(v.id)
      setTipOpen(true)
    },
    [sim],
  )

  const handleView = useCallback(
    (id: string) => {
      const v = VIEW_BY_ID[id]
      if (!v) return
      sim.viewId = id
      sim.viewSeq += 1
      sim.autoOrbit = false
      setAutoOrbit(false)
      setViewId(id)
    },
    [sim],
  )

  const handleMeasure = useCallback(
    (m: MeasureId) => {
      abortTrial()
      sim.measure = m
      setMeasure(m)
      setPrediction(null)
    },
    [sim, abortTrial],
  )

  const handleXVar = useCallback(
    (v: SugarVarId) => {
      abortTrial()
      sim.xVar = v
      setXVar(v)
    },
    [sim, abortTrial],
  )

  /**
   * What the conditions on the dials right now would cost, and whether the
   * bank covers it. Recomputed every render because every dial move changes it.
   */
  const pendingCost = useMemo(
    () => trialCost({ light: conditions.light, co2: conditions.co2, night: conditions.night }),
    [conditions.light, conditions.co2, conditions.night],
  )
  const affordable = run.phase !== 'lab' || canAfford(run.bank, pendingCost)
  const affordableRef = useRef(affordable)
  affordableRef.current = affordable

  const handleRunTrial = useCallback(() => {
    if (sim.trialRunning) return
    // Refused before it starts, never after: a learner must never watch six
    // seconds of measurement and then be told they could not pay for it.
    if (!affordableRef.current) return
    sim.trialLength = caps.trialSeconds
    sim.trialElapsed = 0
    sim.trialSum = 0
    sim.trialSamples = 0
    sim.trialSnapshot = snapshotTrial(sim)
    sim.trialRunning = true
    setTrialRunning(true)
    if (narrationOn()) {
      speak(
        narrateTrialStart({ measure: sim.measure, prediction: predictionRef.current }),
        { interrupt: true },
      )
    }
  }, [sim, caps])

  const handleTracer = useCallback(() => {
    if (sim.tracerActive) return
    sim.tracerActive = true
    sim.tracerDistance = 0
    sim.tracerWatch = 0
    sim.tracerWatchSeconds = 0
    sim.tracerTrueSeconds = 0
    setTracerWatch(0)
    setTracerResult(null)
    setTracerActive(true)
    handleView(stage === 'plant' ? 'stem' : viewId)
  }, [sim, handleView, stage, viewId])

  const handleWatch = useCallback(() => {
    if (sim.tracerWatch === 0) {
      sim.tracerWatch = 1
      setTracerWatch(1)
    } else if (sim.tracerWatch === 1) {
      sim.tracerWatch = 2
      setTracerWatch(2)
    } else {
      sim.tracerWatch = 0
      sim.tracerWatchSeconds = 0
      setTracerWatch(0)
    }
  }, [sim])

  /**
   * The watering can.
   *
   * In the plain lab it fills the pot, because a learner should not have to
   * fight the apparatus. In a challenge it pours one measured amount out of a
   * finite bank — which is the point at which "water is a limiting factor"
   * stops being a phrase and starts being a decision.
   */
  const handleWater = useCallback(() => {
    abortTrial()
    const r = runRef.current
    if (r.phase === 'lab' && r.challenge) {
      if ((r.bank.water ?? 0) + 1e-6 < POUR_DRAW) return
      r.draw({ water: POUR_DRAW })
      const next = Math.min(1, sim.soilWater + WATER_PER_POUR / 100)
      sim.soilWater = next
      sim.turgor = Math.max(sim.turgor, next)
      setConditions((prev) => ({ ...prev, soilWater: next }))
      return
    }
    sim.soilWater = 1
    sim.turgor = 1
    setConditions((prev) => ({ ...prev, soilWater: 1 }))
  }, [sim, abortTrial])

  const handleVision = useCallback(() => {
    sim.vision = !sim.vision
    setVision(sim.vision)
  }, [sim])

  const handleOrbit = useCallback(() => {
    sim.autoOrbit = !sim.autoOrbit
    setAutoOrbit(sim.autoOrbit)
  }, [sim])

  // Not logged: the learning-event log is the sole source of XP and rank, and
  // a view preference is not evidence of anything.
  /**
   * Take a mission on, or put it back down.
   *
   * Picking one also opens the panel it needs and flies to the stage the work
   * happens on, because "clickable" has to mean something happened.
   */
  const handleMission = useCallback(
    (id: string | null) => {
      sim.activeMission = id
      setActiveMission(id)
      if (!id) return
      if (compact) setRightTab('missions')
      if (sim.stage !== 'plant') handleStage('plant')
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sim, compact],
  )

  const handleHabitat = useCallback(() => {
    sim.habitat = !sim.habitat
    setHabitat(sim.habitat)
  }, [sim])

  const handleReset = useCallback(() => {
    sim.viewReset += 1
    sim.autoOrbit = false
    setAutoOrbit(false)
  }, [sim])

  const startCardboard = useCallback(() => {
    handleView(defaultViewFor(sim.stage).id)
    void enterStereo()
  }, [handleView, sim])

  const tourNext = useCallback(() => {
    const order = viewsForStage(sim.stage as StageId).map((v) => v.id)
    const i = order.indexOf(sim.viewId)
    handleView(order[(i + 1) % order.length])
  }, [handleView, sim])

  const commitPrediction = useCallback(
    (v: number | null) => {
      setPrediction(v)
      if (v !== null && !sim.demoMode) {
        logEvent('photosynthesis', band, 'prediction.committed', {
          variable: xVar,
          x: SUGAR_VARS[xVar].read(simEnv(sim)),
          predicted: v,
          kind: caps.prediction === 'point' ? 'point' : 'direction',
        })
      }
    },
    [sim, band, xVar, caps.prediction],
  )

  const handleWriteup = useCallback(
    (c: { claim: string; reason: string; limits: string[] }) => {
      logEvent('photosynthesis', getBand(), 'writeup.completed', {
        variable: xVar,
        claim: c.claim,
        reason: c.reason,
        limitations: c.limits,
        ownWords: false,
      })
    },
    [xVar],
  )

  /**
   * The voice toggle.
   *
   * Turning it ON speaks the opening line immediately — partly so the learner
   * hears that it worked, and partly because the press itself is the user
   * gesture browsers require before any speech is allowed at all.
   */
  const handleNarrate = useCallback(() => {
    const next = !narrationOn()
    setNarration(next)
    setNarrating(next)
    if (next) {
      startNarration()
      speak(narrateOpening(specimen), { interrupt: true })
    }
  }, [specimen])

  const handleStart = useCallback(() => {
    sim.started = true
    setStarted(true)
    // The first real tap. Browsers (iOS especially) discard any `speak()` made
    // before a gesture, so this is the only place the narrator can be armed.
    startNarration()
    if (narrationOn()) speak(narrateOpening(specimen), { interrupt: true })
  }, [sim, specimen])

  /* ---- guided demo ---------------------------------------------------- */

  const demoApi = useMemo<DemoApi>(
    () => ({
      setStage: (s) => handleStage(s),
      setLight: (v) => patchConditions({ light: v }),
      setTemp: (c) => patchConditions({ tempC: c }),
      setNight: (on) => patchConditions({ night: on }),
      setGirdled: (on) => patchConditions({ girdled: on }),
      setMeasure: (m) => handleMeasure(m),
      setXVar: (v) => handleXVar(v),
      setPrediction: (v) => setPrediction(v),
      setVision: (on) => {
        sim.vision = on
        setVision(on)
      },
      startTrial: () => handleRunTrial(),
      view: (id) => handleView(id),
    }),
    [handleStage, patchConditions, handleMeasure, handleXVar, handleRunTrial, handleView, sim],
  )

  const startDemo = useCallback(() => {
    sim.started = true
    sim.demoMode = true
    demoFirstReadingId.current = nextId.current
    setStarted(true)
    setDemoProgress(0)
    setDemoStep(0)
  }, [sim])

  /* ---- the challenge layer's own handlers ----------------------------- */

  /**
   * Open a challenge on the plate.
   *
   * The learner's existing readings are deliberately *not* cleared. They are
   * evidence, they have already been paid for in XP, and throwing them away
   * because someone pressed a button labelled "challenge" would be a small
   * betrayal. The trial count that scores the run is the hook's own, and
   * starts at zero regardless.
   */
  const beginChallenge = useCallback(
    (c: Challenge) => {
      setIncoming(null)
      abortTrial()
      setPrediction(null)
      setReveal(null)
      if (SPECIMEN_BY_ID[c.setup]) {
        loadSpecimen(sim, c.setup)
        setSpecimenId(c.setup)
      }
      // Start from an empty sky. Nothing is banked, so nothing may be spent —
      // and the very first thing the learner does is go and get some light.
      const ambient = CO2_AMBIENT_PPM / CO2_MAX_PPM
      sim.light = 0
      sim.co2 = ambient
      sim.soilWater = BASE_SOIL_WATER
      sim.night = false
      sim.girdled = false
      setConditions((prev) => ({
        ...prev,
        light: 0,
        co2: ambient,
        soilWater: BASE_SOIL_WATER,
        night: false,
        girdled: false,
      }))
      if (sim.stage !== 'plant') handleStage('plant')
      run.begin(c)
    },
    [sim, abortTrial, handleStage, run],
  )

  const handleCatch = useCallback(
    (kind: SugarResource, amount: number) => {
      run.catchOne(kind, amount)
      catchCount.current += 1
      setCaught({ kind, n: catchCount.current })
    },
    [run],
  )

  const gatherProps = useMemo(
    () =>
      gathering && run.challenge
        ? { seed: run.challenge.seed, running: true, onCatch: handleCatch }
        : null,
    [gathering, run.challenge, handleCatch],
  )

  const [searchParams] = useSearchParams()

  /**
   * A challenge that arrived in the link.
   *
   * Read once, on mount. The whole world is in the fragment, so this works with
   * no connection and no account — which was the point of encoding it that way.
   */
  const linkRead = useRef(false)
  useEffect(() => {
    if (linkRead.current) return
    linkRead.current = true
    const raw = searchParams.get('c')
    if (!raw) return
    const c = decodeChallenge(raw)
    if (!c || c.cabinet !== 'photosynthesis') return
    const r = Number(searchParams.get('r'))
    setIncoming(c)
    sim.started = true
    setStarted(true)
    run.open(Number.isFinite(r) && r > 0 ? r : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const autoDemo = searchParams.get('demo') === '1'
  const autoDemoDone = useRef(false)
  useEffect(() => {
    if (!autoDemo || autoDemoDone.current) return
    autoDemoDone.current = true
    const t = window.setTimeout(startDemo, 600)
    return () => window.clearTimeout(t)
  }, [autoDemo, startDemo])

  const finishDemo = useCallback(
    (completed = false) => {
      logEvent('photosynthesis', getBand(), 'demo.watched', { completed })
      sim.demoMode = false
      sim.autoOrbit = false
      sim.trialRunning = false
      sim.trialSnapshot = null
      setAutoOrbit(false)
      setDemoStep(-1)
      setDemoProgress(0)
      setPrediction(null)
      // The demo's own measurements are examples, not the learner's data.
      const cutoff = demoFirstReadingId.current
      setReadings((prev) => prev.filter((r) => r.id < cutoff))
    },
    [sim],
  )

  useEffect(() => {
    if (demoStep < 0) return
    if (demoStep >= SUGAR_DEMO.length) {
      finishDemo(true)
      return
    }
    const step = SUGAR_DEMO[demoStep]
    const startedAt = performance.now()
    let done = false
    step.enter?.(demoApi)

    const advance = () => {
      if (done) return
      done = true
      window.clearInterval(timer)
      setDemoStep((n) => n + 1)
    }

    const timer = window.setInterval(() => {
      const elapsed = performance.now() - startedAt
      if (step.tween) {
        const t = Math.min(1, elapsed / step.ms)
        step.tween.apply(demoApi, step.tween.from + (step.tween.to - step.tween.from) * t)
      }
      if (step.awaitTrial) {
        setDemoProgress(sim.trialRunning ? Math.min(1, sim.trialElapsed / sim.trialLength) : 1)
        if (elapsed > 900 && !sim.trialRunning) advance()
      } else {
        setDemoProgress(Math.min(1, elapsed / step.ms))
        if (elapsed >= step.ms) advance()
      }
    }, 80)

    return () => {
      done = true
      window.clearInterval(timer)
    }
  }, [demoStep, demoApi, finishDemo, sim])

  /* ---- controller / keyboard ------------------------------------------ */

  useBackHandler(
    useCallback(() => {
      if (stage !== 'plant') {
        handleStage('plant')
        return true
      }
      return false
    }, [stage, handleStage]),
  )

  useInputAction(
    useCallback(
      (a) => {
        if (a.type === 'tab' && !compact) {
          const order: StageId[] = ['plant', 'leaf', 'stem']
          const i = order.indexOf(stage)
          handleStage(order[(i + a.dir + order.length) % order.length])
        }
      },
      [stage, handleStage, compact],
    ),
  )

  /* ---- derived --------------------------------------------------------- */

  const currentX = SUGAR_VARS[xVar].read(simEnv(sim))
  const lastReading = readings.length ? readings[readings.length - 1] : null
  const predictionPending = caps.prediction !== 'none' && prediction === null
  const bottleneck = useMemo(
    () => findBottleneck(specimen, simEnv(sim), sim.carbon, { girdled: conditions.girdled }),
    // The solve is cheap and the conditions are the only thing that moves it.
    [specimen, sim, conditions],
  )

  /**
   * The mission the learner has picked up, and the one step of it that is
   * still outstanding. Recomputed from live state every render — the tiles,
   * the coach chip and the glow ring all read the same object, so they can
   * never disagree about what to do next.
   */
  const active = useMemo(
    () => missionProgress(sim, readings, activeMission),
    // `conditions` is the React mirror of the sim fields the steps read; it is
    // what actually changes when a slider moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sim, readings, activeMission, conditions, measure, xVar, specimenId],
  )
  /** The control the active step is pointing at, or null. */
  const highlight = active?.step?.target ?? null

  /** One line naming the single next action. */
  const coach = useMemo(() => {
    if (!started) return null
    if (demoStep >= 0) return null
    // A mission the learner has taken on outranks everything except surgery
    // and a running stopwatch, both of which are time-critical.
    if (active && !conditions.girdled && !tracerActive) {
      if (active.step) return { text: active.step.say, hint: `${active.mission.title} · step ${active.index + 1} of ${active.mission.steps.length}` }
      if (!active.complete)
        return {
          text: 'Every step is done — take the reading that proves it.',
          hint: active.mission.brief,
        }
    }
    if (conditions.girdled)
      return {
        text: 'The ring is cut. Record the export rate now, then heal it.',
        hint: 'Water still climbs the xylem — only the sugar has stopped.',
      }
    if (tracerActive && tracerWatch === 0)
      return { text: 'Start the stopwatch as the parcel crosses the green mark.', hint: undefined }
    if (tracerActive && tracerWatch === 1)
      return { text: 'Stop it on the red mark.', hint: 'The watch counts plant seconds.' }
    if (predictionPending && readings.length > 0)
      return { text: 'Commit a prediction, then run the next measurement.', hint: undefined }
    if (readings.length === 0)
      return {
        text: 'Set the conditions, then press Run measurement.',
        hint: 'One reading is a dot. A curve needs five.',
      }
    const missions = missionsForBand(band)
    const next = missions.find((m) => !m.check(readings))
    if (next) return { text: next.title, hint: next.brief }
    return { text: 'Every mission is done. Try another specimen.', hint: undefined }
  }, [started, demoStep, active, conditions.girdled, tracerActive, tracerWatch, predictionPending, readings, band])

  const stageMeta = STAGE_BY_ID[stage]
  const missionList = missionsForBand(band)
  const missionsTotal = missionList.length
  const missionsDone = missionList.filter((m) => m.check(readings)).length

  /**
   * Missions emit into the learning log the moment their evidence lands.
   *
   * This lives on the page rather than in the mission panel because the panel
   * is only mounted while its tab is open — and a mission completed behind a
   * closed tab still earned its XP. XP, the skill tracks, the rank and the
   * parent digest are all derived from this log and stored nowhere else, so a
   * missed emit is silently unpaid work.
   */
  const loggedMissions = useRef(new Set<string>())
  useEffect(() => {
    missionList.forEach((m) => {
      if (loggedMissions.current.has(m.id) || !m.check(readings)) return
      loggedMissions.current.add(m.id)
      logEvent('photosynthesis', band, 'mission.completed', {
        missionId: m.id,
        title: m.title,
        skill: m.skill,
      })
    })
  }, [missionList, readings, band])

  // A new reading no longer swings the right column to the Data tab. The
  // result card brings the graph to the learner and offers "See the data" if
  // they want the table, so yanking the column away — out of the mission steps
  // they were in the middle of following — is pure disruption.

  /* ---- panels shared by both layouts ---------------------------------- */

  const specimenRail = (
    <SpecimenRail aim={highlight} current={specimenId} onPick={handleSpecimen} compact={compact} />
  )

  const conditionsPlate = (
    <ConditionsPlate
        aim={highlight}
        conditions={conditions}
        caps={caps}
        specimen={specimen}
        onChange={patchConditions}
        onGirdle={(on) => patchConditions({ girdled: on })}
        onNight={(on) => patchConditions({ night: on })}
      onWater={handleWater}
      embedded={compact}
    />
  )

  const instrumentPlate = (
    <InstrumentPlate
        aim={highlight}
        sim={sim}
        caps={caps}
        measure={measure}
        xVar={xVar}
        trialRunning={trialRunning}
        trialProgress={trialProgress}
        prediction={prediction}
        predictionPending={predictionPending}
        lastY={lastReading?.y ?? null}
        tracerActive={tracerActive}
        tracerWatch={tracerWatch}
        tracerWatchSeconds={tracerSeconds}
        onMeasure={handleMeasure}
        onXVar={handleXVar}
        onPredict={commitPrediction}
        onRunTrial={handleRunTrial}
        onTracer={handleTracer}
        onWatch={handleWatch}
      onDemo={startDemo}
      embedded={compact}
    />
  )

  /**
   * On a phone the Controls tab opens onto the **conditions**, not the specimen
   * library.
   *
   * The library is five tall rows and a rarely-repeated choice; the conditions
   * are why anyone opens this tab at all. With the library first, the light
   * dial's track sat at y = 861 on an 844 px screen — off the bottom, reachable
   * only by scrolling a panel that had just appeared. A desktop column has the
   * height to show all three at once and keeps the reading order it was
   * designed with.
   */
  const controlsPanel = (
    <div className="flex flex-col gap-2">
      {compact ? (
        <>
          {conditionsPlate}
          {instrumentPlate}
          {specimenRail}
        </>
      ) : (
        <>
          {specimenRail}
          {conditionsPlate}
          {instrumentPlate}
        </>
      )}
    </div>
  )

  const dataPanel = (
    <DataPlate
      readings={readings}
      xVar={xVar}
      measure={measure}
      currentX={currentX}
      prediction={prediction}
      caps={caps}
      onDelete={(id) => setReadings((prev) => prev.filter((r) => r.id !== id))}
      onClear={() => setReadings([])}
      onWriteup={handleWriteup}
      embedded={compact}
    />
  )

  const missionPanel = (
    <MissionPlate
      sim={sim}
      readings={readings}
      band={band}
      activeId={activeMission}
      onPick={handleMission}
      embedded={compact}
    />
  )

  const views = viewsForStage(stage).map((v) => ({ id: v.id, label: v.label, hint: v.hint }))

  const rail = (
    <ToolRail
      vision={vision}
      autoOrbit={autoOrbit}
      habitat={habitat}
      showHabitat={stage === 'plant'}
      views={views}
      viewId={viewId}
      onVision={handleVision}
      onOrbit={handleOrbit}
      onHabitat={handleHabitat}
      onZoomIn={() => {
        sim.viewZoom -= 0.22
      }}
      onZoomOut={() => {
        sim.viewZoom += 0.22
      }}
      onReset={handleReset}
      onCardboard={startCardboard}
      onView={handleView}
      narrating={narrating}
      canNarrate={narrationAvailable()}
      onNarrate={handleNarrate}
      minimal={compact}
    />
  )

  /* ---- render ---------------------------------------------------------- */

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#F6F2E8]">
      <SceneErrorBoundary>
        <Suspense fallback={<SceneFallback />}>
          <SugarScene
            sim={sim}
            stage={stage}
            specimenId={specimenId}
            habitat={habitat}
            obstructBottom={sheetPx}
            gather={gatherProps}
            onContextLost={() => setContextLost(true)}
          />
        </Suspense>
      </SceneErrorBoundary>

      {/* A whisper of vignette, so the plate has edges. */}
      <div
        className="pointer-events-none fixed inset-0 z-10"
        style={{
          background:
            'radial-gradient(ellipse at 50% 45%, transparent 58%, rgba(120, 106, 78, 0.16) 100%)',
        }}
      />

      {stereo.on && <StereoOverlay onTap={tourNext} />}

      {/* Before the HUD in document order on purpose. The overlay covers the
          cabinet, but a `getByRole('button').first()` walks the DOM — and with
          the welcome last, "Start the line" resolved to a mission tile behind
          the overlay and every suite's opening click was intercepted. */}
      {!started && <Welcome onStart={handleStart} onDemo={startDemo} />}

      {/* The gather round takes the whole screen: it is played by dragging
          across the canvas, and any panel is both in the way of the finger and
          in the way of the eye. */}
      {!stereo.on && compact && !gathering && (
        <div className="hud pointer-events-none fixed inset-0 z-20">
          {/* One strip that scrolls sideways rather than a wrapping row: on a
              390 px phone the chips wrapped onto a second line and the stage
              tabs sat straight on top of them. */}
          <div
            className={`pointer-events-auto absolute top-3 right-0 left-0 flex items-center gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
              demoStep >= 0 ? 'pointer-events-none opacity-70' : ''
            }`}
          >
            <BackToMenu />
            <BandSwitch />
            <ClockChip hours={plantHours} rate={clockRate} />
            <ProgressChip compact />
            {!inChallenge && <ChallengeChip onClick={() => run.open(null)} />}
          </div>

          <div className="absolute top-[4.4rem] right-3 left-3 flex flex-col items-stretch gap-2">
            <StageTabs aim={highlight} stage={stage} onStage={handleStage} compact />
            <div className="flex justify-end">{rail}</div>
          </div>

          {/* A hint, not a rotate button — see RotateHint for why one cannot be
              built honestly. Only once, only on a phone, only in portrait. */}
          {started && demoStep < 0 && <RotateHint />}

          {/* The scale bar and the coach chip live in the strip the sheet
              covers when it opens, so they ride up on top of it. Without this
              the mission's current instruction disappears at exactly the
              moment the learner opens the panel it is telling them to use. */}
          <div
            className="absolute right-3 transition-[bottom] duration-200"
            style={{ bottom: `calc(9.5rem + ${sheetPx}px)` }}
          >
            <ScaleBar label={stageMeta.scale.label} />
          </div>

          <HudDrawer
            muted={demoStep >= 0}
            onObstructHeight={setSheetPx}
            tabs={[
              {
                id: 'controls',
                label: 'Controls',
                icon: <SlidersHorizontal className="h-4 w-4" />,
                content: controlsPanel,
              },
              {
                id: 'data',
                label: 'Data',
                icon: <LineChart className="h-4 w-4" />,
                badge: predictionPending && readings.length ? 'predict!' : readings.length ? String(readings.length) : undefined,
                badgeTone: (predictionPending && readings.length ? 'warn' : 'good') as 'warn' | 'good',
                content: (
                  <div className="flex flex-col gap-2">
                    {dataPanel}
                    <LedgerPlate sim={sim} specimen={specimen} caps={caps} embedded />
                  </div>
                ),
              },
              {
                id: 'missions',
                label: 'Missions',
                icon: <Trophy className="h-4 w-4" />,
                content: (
                  <div className="flex flex-col gap-2">
                    {missionPanel}
                    <SpecimenPlate specimen={specimen} caps={caps} bottleneck={bottleneck} embedded />
                  </div>
                ),
              },
            ]}
          />

          {coach && !reveal && !inChallenge && (
            <div
              className="pointer-events-none absolute inset-x-0 flex justify-center px-3 transition-[bottom] duration-200"
              style={{ bottom: `calc(4.2rem + ${sheetPx}px)` }}
            >
              <Coach text={coach.text} hint={coach.hint} />
            </div>
          )}
        </div>
      )}

      {!stereo.on && !compact && !gathering && (
        <div className="hud pointer-events-none fixed inset-0 z-20">
          {/* Left column. */}
          <div
            className={`absolute top-4 bottom-4 left-4 flex w-[19.5rem] flex-col gap-2 transition-opacity duration-300 ${
              demoStep >= 0 ? 'pointer-events-none opacity-70' : ''
            }`}
          >
            <div className="pointer-events-auto flex flex-wrap items-center gap-2">
              <BackToMenu />
              <BandSwitch />
            </div>
            <div className="pointer-events-auto flex flex-wrap items-center gap-2">
              <ClockChip hours={plantHours} rate={clockRate} />
              <ProgressChip compact />
              {!inChallenge && <ChallengeChip onClick={() => run.open(null)} />}
            </div>
            <div className="pointer-events-auto min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="flex flex-col gap-2">
                <SpecimenRail aim={highlight} current={specimenId} onPick={handleSpecimen} />
                <ConditionsPlate
                  aim={highlight}
                  conditions={conditions}
                  caps={caps}
                  specimen={specimen}
                  onChange={patchConditions}
                  onGirdle={(on) => patchConditions({ girdled: on })}
                  onNight={(on) => patchConditions({ night: on })}
                  onWater={handleWater}
                />
              </div>
            </div>
          </div>

          {/* Top centre: the three stages, then the tool rail. */}
          <div className="pointer-events-none absolute top-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
            <div className="pointer-events-auto">
              <StageTabs aim={highlight} stage={stage} onStage={handleStage} />
            </div>
            <div className="pointer-events-auto">{rail}</div>
            <p className="atlas-serif max-w-[26rem] text-center text-[11.5px] leading-snug text-[#8B8471] italic">
              {stageMeta.hint}
            </p>
          </div>

          {/* Right column.
              The instruments stay pinned at the top and everything else takes
              turns underneath. Stacked, the five plates ran a thousand pixels
              tall and pushed "Run measurement" — the one control the whole
              cabinet is built around — below the fold on a 900 px screen. */}
          <div className="pointer-events-auto absolute top-4 right-4 bottom-4 flex w-[19.5rem] flex-col gap-2 pl-1">
            {/* The instruments are pinned, but capped: they grow as bands and
                readings add rows, and an uncapped pinned block pushes the tab
                below it clean off the screen — which is exactly how "Run
                measurement" ended up at y≈934 on a 900px display once already. */}
            <div className="max-h-[58%] shrink-0 overflow-y-auto pr-0.5">
              <InstrumentPlate
                aim={highlight}
                sim={sim}
                caps={caps}
                measure={measure}
                xVar={xVar}
                trialRunning={trialRunning}
                trialProgress={trialProgress}
                prediction={prediction}
                predictionPending={predictionPending}
                lastY={lastReading?.y ?? null}
                tracerActive={tracerActive}
                tracerWatch={tracerWatch}
                tracerWatchSeconds={tracerSeconds}
                onMeasure={handleMeasure}
                onXVar={handleXVar}
                onPredict={commitPrediction}
                onRunTrial={handleRunTrial}
                onTracer={handleTracer}
                onWatch={handleWatch}
                onDemo={startDemo}
              />
            </div>
            <div className="shrink-0">
              <PillGroup
                ariaLabel="Right panel"
                size="sm"
                value={rightTab}
                onChange={setRightTab}
                options={[
                  { id: 'atlas' as const, label: 'Atlas' },
                  { id: 'data' as const, label: `Data${readings.length ? ` ${readings.length}` : ''}` },
                  { id: 'ledger' as const, label: 'Sugar' },
                  { id: 'missions' as const, label: `Missions ${missionsDone}/${missionsTotal}` },
                ]}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
              {rightTab === 'atlas' && (
                <SpecimenPlate specimen={specimen} caps={caps} bottleneck={bottleneck} />
              )}
              {rightTab === 'data' && dataPanel}
              {rightTab === 'ledger' && <LedgerPlate sim={sim} specimen={specimen} caps={caps} />}
              {rightTab === 'missions' && missionPanel}
            </div>
          </div>

          {/* Tip, bottom-left of the stage rather than over the specimen. */}
          {tipOpen && (
            <div className="absolute bottom-4 left-[21rem]">
              <TipCard stage={stage} onClose={() => setTipOpen(false)} />
            </div>
          )}

          <div className="absolute right-[21rem] bottom-5">
            <ScaleBar label={stageMeta.scale.label} />
          </div>

          {coach && !reveal && !inChallenge && (
            <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center px-4">
              <Coach text={coach.text} hint={coach.hint} />
            </div>
          )}
        </div>
      )}

      {/* The prediction result. Bottom-centre, in the coach chip's strip
          (which stands down while this is up), because that is where a learner
          is already looking for "what now". */}
      {!stereo.on && reveal && (
        <div
          className={cn(
            'pointer-events-none fixed z-30 flex justify-center transition-[bottom] duration-200',
            compact ? 'inset-x-2' : 'inset-x-0 bottom-5',
          )}
          style={compact ? { bottom: `calc(4.4rem + ${sheetPx}px)` } : undefined}
        >
          <Reveal
            reading={reveal}
            readings={readings}
            compact={compact}
            onClose={() => setReveal(null)}
            onSeeData={() => {
              setReveal(null)
              setRightTab('data')
            }}
          />
        </div>
      )}

      {/* Notices that belong to neither column. */}
      {!stereo.on && abortNotice && (
        <div className="atlas-plate fact-pop pointer-events-none fixed top-[4.5rem] left-1/2 z-30 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 px-4 py-3">
          <p className="text-[12px] leading-snug font-bold text-[#96591C]">
            <strong>Trial discarded.</strong> You changed a condition while the measurement was
            running, so the average would not belong to any one set of conditions. Set everything
            first, then measure.
          </p>
        </div>
      )}

      {!stereo.on && tracerResult && (
        <div className="atlas-plate fact-pop pointer-events-auto fixed top-[4.5rem] left-1/2 z-30 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="atlas-eyebrow">Tracer timed</span>
              <p className="atlas-serif text-[20px] leading-tight font-semibold text-[#2A2823]">
                {tracerResult.speed.toFixed(2)} m h⁻¹
              </p>
              <p className="mt-0.5 text-[11px] leading-snug font-semibold text-[#8B8471]">
                Your stopwatch says {tracerResult.speed.toFixed(2)}; the sap actually managed{' '}
                {tracerResult.truth.toFixed(2)}. The gap is your reaction time, and it is a real
                source of error in every timed practical.
              </p>
            </div>
            <Tile
              onClick={() => setTracerResult(null)}
              aria-label="Dismiss the tracer result"
              className="rounded-full px-2 text-[14px] font-bold text-[#B9B09A] hover:text-[#4A4438]"
            >
              ×
            </Tile>
          </div>
        </div>
      )}

      {!stereo.on && demoStep >= 0 && (
        <DemoOverlay step={demoStep} progress={demoProgress} onSkip={() => finishDemo(false)} />
      )}

      {/* ---- the challenge layer ---- */}
      {!stereo.on && run.phase === 'brief' && (
        <ChallengeBrief
          band={band}
          incoming={incoming}
          rival={run.rival}
          onBegin={beginChallenge}
          onClose={run.close}
        />
      )}

      {!stereo.on && run.phase === 'gather' && run.challenge && (
        <GatherHud
          secondsLeft={run.secondsLeft}
          total={run.challenge.gatherSeconds}
          bank={run.bank}
          budget={run.challenge.budget}
          caught={caught}
          onDone={run.endGather}
        />
      )}

      {!stereo.on && run.phase === 'lab' && run.challenge && !reveal && (
        <ChallengeBar
          challenge={run.challenge}
          bank={run.bank}
          ceiling={capsFor(run.granted)}
          best={run.best}
          hit={run.hit}
          trials={run.trials}
          affordable={affordable}
          compact={compact}
          bottomPx={sheetPx}
          onFinish={run.finish}
          onQuit={run.close}
        />
      )}

      {!stereo.on && run.phase === 'scored' && run.challenge && run.score && (
        <ScoreCard
          challenge={run.challenge}
          score={run.score}
          best={run.best}
          trials={run.trials}
          granted={run.granted}
          rival={run.rival}
          onAgain={() => beginChallenge(run.challenge!)}
          onClose={run.close}
        />
      )}

      {!stereo.on && <InputHints extra={[['LB/RB', 'Plant / leaf / stem']]} />}
      {!stereo.on && <ProgressToasts />}
      {contextLost && <WebglFallback />}
    </div>
  )
}
