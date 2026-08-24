import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowLeft, Clock, LineChart, RotateCcw, SlidersHorizontal, Sprout, Trophy } from 'lucide-react'
import SceneErrorBoundary from '@/components/SceneErrorBoundary'
import BandSwitch from '@/components/hud/BandSwitch'
import HudDrawer from '@/components/hud/HudDrawer'
import InputHints from '@/components/hud/InputHints'
import ProgressChip from '@/components/hud/ProgressChip'
import ProgressToasts from '@/components/hud/ProgressToasts'
import StereoOverlay from '@/components/hud/StereoOverlay'
import { Tile } from '@/components/ui/tile'
import { BAND_CAPS, getBand, useBand } from '@/lib/bands'
import { logEvent } from '@/lib/events'
import { useBackHandler, useInputAction } from '@/lib/input'
import { useLayoutMode } from '@/hooks/use-layout'
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
import { defaultViewFor, VIEW_BY_ID, viewsForStage } from '@/components/sugar/views'

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
  const [rightTab, setRightTab] = useState<'atlas' | 'data' | 'ledger' | 'missions'>('atlas')
  const [plantHours, setPlantHours] = useState(sim.plantHours)
  const [clockRate, setClockRate] = useState(CLOCK_LIVE_MULTIPLIER)
  /** -1 = not running. */
  const [demoStep, setDemoStep] = useState(-1)
  const [demoProgress, setDemoProgress] = useState(0)

  const nextId = useRef(1)
  const lastCompleted = useRef(0)
  const lastAborted = useRef(0)
  const lastTracer = useRef(0)
  const predictionRef = useRef<number | null>(null)
  predictionRef.current = prediction
  const demoFirstReadingId = useRef(1)

  const specimen = SPECIMEN_BY_ID[specimenId]

  useEffect(() => {
    logEvent('photosynthesis', getBand(), 'session.started', {})
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

  const patchConditions = useCallback(
    (patch: Partial<Conditions>) => {
      abortTrial()
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

  const handleRunTrial = useCallback(() => {
    if (sim.trialRunning) return
    sim.trialLength = caps.trialSeconds
    sim.trialElapsed = 0
    sim.trialSum = 0
    sim.trialSamples = 0
    sim.trialSnapshot = snapshotTrial(sim)
    sim.trialRunning = true
    setTrialRunning(true)
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

  const handleWater = useCallback(() => {
    abortTrial()
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

  const handleStart = useCallback(() => {
    sim.started = true
    setStarted(true)
  }, [sim])

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

  const [searchParams] = useSearchParams()
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

  /** One line naming the single next action. */
  const coach = useMemo(() => {
    if (!started) return null
    if (demoStep >= 0) return null
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
  }, [started, demoStep, conditions.girdled, tracerActive, tracerWatch, predictionPending, readings, band])

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

  // A new reading is worth looking at: swing the right column to the data.
  const lastCount = useRef(0)
  useEffect(() => {
    if (readings.length > lastCount.current && readings.length > 0) setRightTab('data')
    lastCount.current = readings.length
  }, [readings.length])

  /* ---- panels shared by both layouts ---------------------------------- */

  const controlsPanel = (
    <div className="flex flex-col gap-2">
      <SpecimenRail current={specimenId} onPick={handleSpecimen} compact={compact} />
      <ConditionsPlate
        conditions={conditions}
        caps={caps}
        specimen={specimen}
        onChange={patchConditions}
        onGirdle={(on) => patchConditions({ girdled: on })}
        onNight={(on) => patchConditions({ night: on })}
        onWater={handleWater}
        embedded={compact}
      />
      <InstrumentPlate
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

  const missionPanel = <MissionPlate readings={readings} band={band} embedded={compact} />

  const views = viewsForStage(stage).map((v) => ({ id: v.id, label: v.label, hint: v.hint }))

  const rail = (
    <ToolRail
      vision={vision}
      autoOrbit={autoOrbit}
      views={views}
      viewId={viewId}
      onVision={handleVision}
      onOrbit={handleOrbit}
      onZoomIn={() => {
        sim.viewZoom -= 0.22
      }}
      onZoomOut={() => {
        sim.viewZoom += 0.22
      }}
      onReset={handleReset}
      onCardboard={startCardboard}
      onView={handleView}
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

      {!stereo.on && compact && (
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
          </div>

          <div className="absolute top-[4.4rem] right-3 left-3 flex flex-col items-stretch gap-2">
            <StageTabs stage={stage} onStage={handleStage} compact />
            <div className="flex justify-end">{rail}</div>
          </div>

          <div className="absolute right-3 bottom-[9.5rem]">
            <ScaleBar label={stageMeta.scale.label} />
          </div>

          <HudDrawer
            muted={demoStep >= 0}
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

          {coach && (
            <div className="pointer-events-none absolute inset-x-0 bottom-[4.2rem] flex justify-center px-3">
              <Coach text={coach.text} hint={coach.hint} />
            </div>
          )}
        </div>
      )}

      {!stereo.on && !compact && (
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
            </div>
            <div className="pointer-events-auto min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="flex flex-col gap-2">
                <SpecimenRail current={specimenId} onPick={handleSpecimen} />
                <ConditionsPlate
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
              <StageTabs stage={stage} onStage={handleStage} />
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
            <div className="shrink-0">
              <InstrumentPlate
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

          {coach && (
            <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center px-4">
              <Coach text={coach.text} hint={coach.hint} />
            </div>
          )}
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

      {!stereo.on && <InputHints extra={[['LB/RB', 'Plant / leaf / stem']]} />}
      {!stereo.on && <ProgressToasts />}
      {contextLost && <WebglFallback />}
    </div>
  )
}
