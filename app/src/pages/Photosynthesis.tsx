import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowLeft, Leaf, LineChart, RotateCcw, SlidersHorizontal, Trophy } from 'lucide-react'
import { BAND_CAPS, getBand, useBand } from '@/lib/bands'
import { createFactRotator } from '@/lib/facts'
import { BIOME_BY_ID, LEAF_BY_ID, type BiomeId } from '@/lib/leaves'
import {
  CHLOROPLAST_FACTS,
  createPhotoSim,
  simPhysiology,
  snapshotTrial,
  type LabMode,
  type MembraneDemo,
} from '@/lib/photo'
import {
  findAnomaly,
  halfRange,
  mean,
  takeReading,
  VARS,
  type Reading,
  type VarId,
} from '@/lib/ratelab'
import { DEMO_STEPS, type DemoApi } from '@/lib/demo'
import SceneErrorBoundary from '@/components/SceneErrorBoundary'
import BandSwitch from '@/components/hud/BandSwitch'
import PhotoWelcome from '@/components/photo/hud/PhotoWelcome'
import PhotoPanel from '@/components/photo/hud/PhotoPanel'
import RateLabPanel, { type LabSettings } from '@/components/photo/hud/RateLabPanel'
import DataLab from '@/components/photo/hud/DataLab'
import MissionCard from '@/components/photo/hud/MissionCard'
import MembranePanel from '@/components/photo/hud/MembranePanel'
import DemoOverlay from '@/components/photo/hud/DemoOverlay'
import ViewControls from '@/components/photo/hud/ViewControls'
import InputHints from '@/components/hud/InputHints'
import { useBackHandler, useInputAction } from '@/lib/input'
import { useLayoutMode, useShortViewport } from '@/hooks/use-layout'
import HudDrawer from '@/components/hud/HudDrawer'
import { missionsForBand } from '@/lib/missions'
import { logEvent } from '@/lib/events'
import { predictionClose } from '@/lib/ratelab'
import ProgressToasts from '@/components/hud/ProgressToasts'
import ProgressChip from '@/components/hud/ProgressChip'
import EquationCard from '@/components/photo/hud/EquationCard'
import { EQ_STEPS } from '@/components/photo/EquationStage'
import { VIEW_BY_ID, VIEWPOINTS, type ViewId } from '@/lib/viewpoints'
import { enterStereo, useStereo } from '@/lib/stereo'
import StereoOverlay from '@/components/hud/StereoOverlay'
import { Glasses } from 'lucide-react'
import { Tile } from '@/components/ui/tile'
import {
  GlucoseChip,
  PhotoAbout,
  PhotoFactCard,
  PhotoTicker,
  type PhotoFact,
} from '@/components/photo/hud/PhotoCards'

const PhotoScene = lazy(() => import('@/components/photo/PhotoScene'))

function SceneFallback() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#1E3422]">
      <p className="animate-pulse text-sm font-bold text-[#FBF5EA]/80">Planting the garden…</p>
    </div>
  )
}

/** Friendly fallback if WebGL is unavailable or crashes. */
function WebglFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1E3422] p-6">
      <div className="w-full max-w-md rounded-[28px] border border-[#F3E9D7] bg-[#FBF5EA] p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#3E7C43]/10">
          <Leaf className="h-7 w-7 text-[#3E7C43]" />
        </div>
        <h2 className="text-xl font-black text-[#402222]">The garden needs sunlight!</h2>
        <p className="mt-2 text-sm leading-relaxed font-semibold text-[#7A5252]">
          Your browser could not start the 3D garden (WebGL is unavailable or crashed). Try
          reloading, or use a browser with WebGL enabled.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mx-auto mt-5 flex items-center gap-2 rounded-full bg-[#3E7C43] px-6 py-3 text-sm font-extrabold text-[#FBF5EA] shadow transition-all hover:bg-[#2F6134] active:scale-95"
        >
          <RotateCcw className="h-4 w-4" />
          Reload the lab
        </button>
      </div>
    </div>
  )
}

function BackToMenu() {
  return (
    <Link
      to="/"
      className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-[#F3E9D7] bg-[#FBF5EA]/90 px-3 py-1.5 text-[11px] font-extrabold text-[#7A5252] shadow-lg backdrop-blur-md transition-all hover:scale-[1.04] hover:text-[#3E7C43]"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Back to Ploobia
    </Link>
  )
}

export default function Photosynthesis() {
  // Per-visit mutable sim state shared with the render loop (never re-renders).
  const sim = useMemo(() => createPhotoSim(), [])
  const [band] = useBand()
  const caps = BAND_CAPS[band]
  const layout = useLayoutMode()
  const compact = layout === 'compact'
  const stereo = useStereo()
  const short = useShortViewport(900)

  const [started, setStarted] = useState(false)
  const [settings, setSettings] = useState<LabSettings>({
    light: sim.light,
    co2: sim.co2,
    water: sim.water,
    tempC: sim.tempC,
    paused: false,
  })
  const [mode, setMode] = useState<LabMode>('garden')
  const [zoomed, setZoomed] = useState(false)
  const [demo, setDemo] = useState<MembraneDemo>('diffusion')
  const [demoRunning, setDemoRunning] = useState(false)
  const [membraneId, setMembraneId] = useState(sim.membraneId)
  const [membraneTempC, setMembraneTempC] = useState(sim.membraneTempC)
  const [fact, setFact] = useState<PhotoFact | null>(null)
  const [contextLost, setContextLost] = useState(false)

  const [leafId, setLeafId] = useState(sim.leafId)
  const [biomeId, setBiomeId] = useState<BiomeId>(sim.biomeId)
  const [xVar, setXVar] = useState<VarId>(sim.xVar)
  const [readings, setReadings] = useState<Reading[]>([])
  const [prediction, setPrediction] = useState<number | null>(null)
  const [trialRunning, setTrialRunning] = useState(false)
  const [trialProgress, setTrialProgress] = useState(0)
  const [abortNotice, setAbortNotice] = useState(false)
  const [autoOrbit, setAutoOrbit] = useState(false)
  const [viewId, setViewId] = useState<ViewId>('overview')
  const [equationOpen, setEquationOpen] = useState(false)
  const [equationT, setEquationT] = useState(0)
  const [equationPlaying, setEquationPlaying] = useState(false)
  /** -1 = not running. */
  const [demoStep, setDemoStep] = useState(-1)
  const [demoProgress, setDemoProgress] = useState(0)
  const demoFirstReadingId = useRef(1)

  const nextId = useRef(1)
  const lastCompleted = useRef(0)
  const lastAborted = useRef(0)
  const predictionRef = useRef<number | null>(null)
  predictionRef.current = prediction
  const currentXRef = useRef(0)

  const rotator = useMemo(() => createFactRotator(CHLOROPLAST_FACTS), [])
  const factKey = useRef(0)

  // One learning event marks the cabinet being opened; everything else is emitted
  // by the measurement loop below.
  useEffect(() => {
    logEvent('photosynthesis', getBand(), 'session.started', {})
  }, [])

  /* ---- keep the UI in step with values the render loop mutates ---- */
  useEffect(() => {
    const t = window.setInterval(() => {
      setSettings((prev) =>
        Math.abs(prev.water - sim.water) > 0.005 ? { ...prev, water: sim.water } : prev,
      )
      setTrialRunning(sim.trialRunning)
      setTrialProgress(sim.trialRunning ? Math.min(1, sim.trialElapsed / sim.trialLength) : 0)
      if (sim.equationOpen) {
        setEquationT(sim.equationT)
        setEquationPlaying(sim.equationPlaying)
      }

      // A trial has finished: turn the true rate into a measurement.
      if (sim.trialCompleted !== lastCompleted.current) {
        lastCompleted.current = sim.trialCompleted
        const snap = sim.trialSnapshot
        if (snap) {
          const repeats = takeReading(sim.lastTrueValue, caps)
          const value = Number(mean(repeats).toFixed(1))
          const phys = simPhysiology(sim)
          const reading: Reading = {
            id: nextId.current++,
            xVar: snap.xVar,
            x: snap.x,
            y: value,
            repeats,
            uncertainty: Number(halfRange(repeats).toFixed(1)),
            anomalous: findAnomaly(repeats),
            leafId: snap.leafId,
            biomeId: snap.biomeId,
            controls: {
              light: snap.light,
              co2: snap.co2,
              temp: snap.tempC,
              water: snap.water,
              humidity: snap.humidity,
            },
            predicted: predictionRef.current,
            wue: Number(phys.waterUseEfficiency.toFixed(2)),
          }
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
    }, 220)
    return () => window.clearInterval(t)
  }, [sim, caps, band])

  /* ---- control handlers ---- */
  /**
   * Changing a condition part-way through a measurement would make the average
   * meaningless, so the trial is discarded rather than quietly mislabelled.
   */
  const abortTrialIfRunning = useCallback(() => {
    if (!sim.trialRunning) return
    sim.trialRunning = false
    sim.trialElapsed = 0
    sim.trialBubbles = 0
    sim.trialSnapshot = null
    sim.trialAborted += 1
    setTrialRunning(false)
    setTrialProgress(0)
  }, [sim])

  const updateSettings = useCallback(
    (patch: Partial<LabSettings>) => {
      if (patch.paused === undefined) abortTrialIfRunning()
      if (patch.light !== undefined) sim.light = patch.light
      if (patch.co2 !== undefined) sim.co2 = patch.co2
      if (patch.water !== undefined) sim.water = patch.water
      if (patch.tempC !== undefined) sim.tempC = patch.tempC
      if (patch.paused !== undefined) sim.paused = patch.paused
      setSettings((prev) => ({ ...prev, ...patch }))
    },
    [sim, abortTrialIfRunning],
  )

  const handleLeaf = useCallback(
    (id: string) => {
      if (!LEAF_BY_ID[id]) return
      abortTrialIfRunning()
      sim.leafId = id
      // A fresh specimen goes into the apparatus fully hydrated.
      sim.turgor = 1
      setLeafId(id)
    },
    [sim, abortTrialIfRunning],
  )

  const handleBiome = useCallback(
    (id: BiomeId) => {
      const b = BIOME_BY_ID[id]
      if (!b) return
      abortTrialIfRunning()
      sim.biomeId = id
      sim.humidity = b.humidity
      sim.light = b.light
      sim.tempC = b.temp
      sim.water = b.soilWater
      sim.turgor = 1
      setBiomeId(id)
      setSettings((prev) => ({ ...prev, light: b.light, tempC: b.temp, water: b.soilWater }))
    },
    [sim, abortTrialIfRunning],
  )

  const handleXVar = useCallback(
    (v: VarId) => {
      abortTrialIfRunning()
      sim.xVar = v
      setXVar(v)
    },
    [sim, abortTrialIfRunning],
  )

  const handleWaterPlant = useCallback(() => {
    abortTrialIfRunning()
    sim.water = 1
    sim.turgor = 1
    setSettings((prev) => ({ ...prev, water: 1 }))
  }, [sim, abortTrialIfRunning])

  const handleZoomView = useCallback(
    (delta: number) => {
      sim.viewZoom = delta
    },
    [sim],
  )

  const handleToggleOrbit = useCallback(() => {
    sim.autoOrbit = !sim.autoOrbit
    setAutoOrbit(sim.autoOrbit)
  }, [sim])

  const handleResetView = useCallback(() => {
    sim.viewReset += 1
    sim.autoOrbit = false
    setAutoOrbit(false)
  }, [sim])

  const handleView = useCallback(
    (id: ViewId) => {
      const v = VIEW_BY_ID[id]
      if (!v) return
      sim.viewId = id
      sim.viewSeq += 1
      sim.autoOrbit = false
      setAutoOrbit(false)
      setViewId(id)
      const wantZoom = !!v.zoomed
      if (wantZoom !== sim.zoomed) {
        sim.zoomed = wantZoom
        setZoomed(wantZoom)
        if (!wantZoom) setFact(null)
      }
    },
    [sim],
  )

  const startCardboard = useCallback(() => {
    // The tour begins at the overview; a tap moves to the next authored stop.
    if (sim.equationOpen) closeEquationRef.current?.()
    handleView('overview')
    void enterStereo()
  }, [sim, handleView])

  const tourNext = useCallback(() => {
    const order = VIEWPOINTS.map((v) => v.id)
    const i = order.indexOf(sim.viewId as ViewId)
    handleView(order[(i + 1) % order.length])
  }, [sim, handleView])

  const openEquation = useCallback(() => {
    sim.equationOpen = true
    sim.equationT = 0
    sim.equationPlaying = true
    sim.autoOrbit = false
    setAutoOrbit(false)
    setEquationOpen(true)
    setEquationT(0)
    setEquationPlaying(true)
  }, [sim])

  const closeEquationRef = useRef<(() => void) | null>(null)
  const closeEquation = useCallback(() => {
    sim.equationOpen = false
    sim.equationPlaying = false
    setEquationOpen(false)
    setEquationPlaying(false)
    setViewId('overview')
  }, [sim])

  closeEquationRef.current = closeEquation

  const equationPlayPause = useCallback(() => {
    sim.equationPlaying = !sim.equationPlaying
    setEquationPlaying(sim.equationPlaying)
  }, [sim])

  const equationNext = useCallback(() => {
    sim.equationT = Math.min(EQ_STEPS, Math.floor(sim.equationT + 1e-6) + 1)
    if (sim.equationT >= EQ_STEPS) sim.equationPlaying = false
    setEquationT(sim.equationT)
    setEquationPlaying(sim.equationPlaying)
  }, [sim])

  const equationReplay = useCallback(() => {
    sim.equationT = 0
    sim.equationPlaying = true
    setEquationT(0)
    setEquationPlaying(true)
  }, [sim])

  const handleStartTrial = useCallback(() => {
    if (sim.trialRunning) return
    sim.trialLength = caps.trialSeconds
    sim.trialElapsed = 0
    sim.trialBubbles = 0
    sim.trialRateSum = 0
    sim.trialSamples = 0
    sim.trialSnapshot = snapshotTrial(sim)
    sim.trialRunning = true
    sim.paused = false
    setSettings((prev) => (prev.paused ? { ...prev, paused: false } : prev))
    setTrialRunning(true)
  }, [sim, caps])

  const handleMode = useCallback(
    (m: LabMode) => {
      sim.mode = m
      if (m === 'roots') {
        sim.zoomed = false
        setZoomed(false)
      }
      setMode(m)
    },
    [sim],
  )

  const handleZoom = useCallback(
    (z: boolean) => {
      sim.zoomed = z
      setZoomed(z)
      if (!z) setFact(null)
    },
    [sim],
  )

  const handleDemo = useCallback(
    (d: MembraneDemo) => {
      sim.demo = d
      sim.demoRunning = false
      sim.demoTime = 0
      sim.demoReset += 1
      setDemo(d)
      setDemoRunning(false)
    },
    [sim],
  )

  const handleMembrane = useCallback(
    (id: string) => {
      sim.membraneId = id
      // A different membrane is a different experiment — start it clean.
      sim.demoRunning = false
      sim.demoTime = 0
      sim.demoReset += 1
      setMembraneId(id)
      setDemoRunning(false)
    },
    [sim],
  )

  const handleMembraneTemp = useCallback(
    (c: number) => {
      sim.membraneTempC = c
      setMembraneTempC(c)
    },
    [sim],
  )

  const handleDemoRunning = useCallback(
    (running: boolean) => {
      sim.demoRunning = running
      setDemoRunning(running)
    },
    [sim],
  )

  const handleDemoReset = useCallback(() => {
    sim.demoRunning = false
    sim.demoTime = 0
    sim.demoReset += 1
    setDemoRunning(false)
  }, [sim])

  const handleChloroplastFact = useCallback(() => {
    setFact({ text: rotator(), key: ++factKey.current })
  }, [rotator])

  const commitPrediction = useCallback(
    (v: number | null) => {
      setPrediction(v)
      if (v !== null && !sim.demoMode) {
        logEvent('photosynthesis', band, 'prediction.committed', {
          variable: xVar,
          x: currentXRef.current,
          predicted: v,
          kind: caps.prediction === 'point' ? 'point' : 'direction',
        })
      }
    },
    [sim, band, xVar, caps.prediction],
  )

  const handleStart = useCallback(() => {
    sim.started = true
    setStarted(true)
  }, [sim])

  /* ---- controller / keyboard actions ---------------------------------- */

  // "Back" peels layers in the order a learner would expect: fact card, zoom,
  // then (by default) the menu.
  useBackHandler(
    useCallback(() => {
      if (equationOpen) {
        closeEquation()
        return true
      }
      if (fact) {
        setFact(null)
        return true
      }
      if (zoomed) {
        handleZoom(false)
        return true
      }
      return false
    }, [fact, zoomed, handleZoom, equationOpen, closeEquation]),
  )

  // Bumpers / [ ] switch between the leaf lab and the membrane bench.
  useInputAction(
    useCallback(
      (a) => {
        // In the compact layout the drawer owns the bumpers (it cycles its tabs).
        if (a.type === 'tab' && !compact) handleMode(mode === 'garden' ? 'roots' : 'garden')
      },
      [mode, handleMode, compact],
    ),
  )

  /* ---- guided demo ---------------------------------------------------- */

  /**
   * The demo drives the very same handlers the buttons do, so what a learner
   * watches is exactly what they are about to do themselves.
   */
  const demoApi = useMemo<DemoApi>(
    () => ({
      setLight: (v) => updateSettings({ light: v }),
      setCo2: (v) => updateSettings({ co2: v }),
      setTemp: (c) => updateSettings({ tempC: c }),
      setXVar: (v) => handleXVar(v),
      setPrediction: (v) => setPrediction(v),
      startTrial: () => handleStartTrial(),
      resetView: () => handleResetView(),
      setAutoOrbit: (on) => {
        sim.autoOrbit = on
        setAutoOrbit(on)
      },
    }),
    [updateSettings, handleXVar, handleStartTrial, handleResetView, sim],
  )

  const startDemo = useCallback(() => {
    sim.started = true
    sim.demoMode = true
    demoFirstReadingId.current = nextId.current
    setStarted(true)
    setDemoProgress(0)
    setDemoStep(0)
  }, [sim])

  // The arcade hall's "watch it play itself" opens the cabinet straight into the
  // guided demo (attract mode) — same handler the welcome button uses.
  const [searchParams] = useSearchParams()
  const autoDemo = searchParams.get('demo') === '1'
  const autoDemoDone = useRef(false)
  useEffect(() => {
    if (!autoDemo || autoDemoDone.current) return
    autoDemoDone.current = true
    const t = window.setTimeout(startDemo, 600)
    return () => window.clearTimeout(t)
  }, [autoDemo, startDemo])

  const finishDemo = useCallback((completed = false) => {
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
  }, [sim])

  useEffect(() => {
    if (demoStep < 0) return
    if (demoStep >= DEMO_STEPS.length) {
      finishDemo(true)
      return
    }

    const step = DEMO_STEPS[demoStep]
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
        // Give the trial a moment to actually start before watching for its end.
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

  /* ---- derived ---- */
  const lastReading = readings.length > 0 ? readings[readings.length - 1] : null
  const needsPoint = caps.prediction === 'point' && prediction === null
  const needsDirection =
    caps.prediction === 'direction' && prediction === null && lastReading !== null
  const currentX = VARS[xVar].read({
    light: settings.light,
    co2: settings.co2,
    tempC: settings.tempC,
    humidity: sim.humidity,
    soilWater: settings.water,
    turgor: sim.turgor,
  })
  currentXRef.current = currentX

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#1E3422]">
      {/* 3D scene */}
      <SceneErrorBoundary>
        <Suspense fallback={<SceneFallback />}>
          <PhotoScene
            sim={sim}
            mode={mode}
            demo={demo}
            zoomed={zoomed}
            equationOpen={equationOpen}
            leafId={leafId}
            biomeId={biomeId}
            membraneId={membraneId}
            onChloroplastFact={handleChloroplastFact}
            onContextLost={() => setContextLost(true)}
          />
        </Suspense>
      </SceneErrorBoundary>

      {/* Warm vignette */}
      <div
        className="pointer-events-none fixed inset-0 z-10"
        style={{
          background:
            mode === 'garden'
              ? 'radial-gradient(ellipse at center, transparent 55%, rgba(30, 52, 34, 0.35) 100%)'
              : 'radial-gradient(ellipse at center, transparent 50%, rgba(40, 26, 16, 0.55) 100%)',
        }}
      />

      {stereo.on && <StereoOverlay onTap={tourNext} />}

      {/* Shared panels — the same elements go into side columns (wide) or the
          bottom drawer (compact), so behaviour never forks by layout. */}
      {!stereo.on && (() => {
        const controlsPanel = (
          <PhotoPanel
            mode={mode}
            onMode={handleMode}
            embedded={compact}
            roots={
              <MembranePanel
                sim={sim}
                demo={demo}
                membraneId={membraneId}
                running={demoRunning}
                tempC={membraneTempC}
                onDemo={handleDemo}
                onMembrane={handleMembrane}
                onRunning={handleDemoRunning}
                onTemp={handleMembraneTemp}
                onReset={handleDemoReset}
              />
            }
            garden={
              <RateLabPanel
                sim={sim}
                settings={settings}
                leafId={leafId}
                biomeId={biomeId}
                xVar={xVar}
                zoomed={zoomed}
                trialRunning={trialRunning}
                trialProgress={trialProgress}
                predictionPending={needsPoint}
                onChange={updateSettings}
                onLeaf={handleLeaf}
                onBiome={handleBiome}
                onXVar={handleXVar}
                onZoom={handleZoom}
                onEquation={openEquation}
                onWaterPlant={handleWaterPlant}
                onStartTrial={handleStartTrial}
                onDemo={startDemo}
              />
            }
          />
        )
        const dataLab = (
          <DataLab
            readings={readings}
            xVar={xVar}
            leafId={leafId}
            currentX={currentX}
            prediction={prediction}
            predictionPending={needsPoint || needsDirection}
            lastY={lastReading?.y ?? null}
            onPredict={commitPrediction}
            onDelete={(id) => setReadings((prev) => prev.filter((r) => r.id !== id))}
            onClear={() => setReadings([])}
            embedded={compact}
          />
        )
        const missionCard = <MissionCard readings={readings} embedded={compact} />

        if (compact) {
          const missions = missionsForBand(band)
          const done = missions.filter((m) => m.check(readings)).length
          return (
            <div className="hud pointer-events-none fixed inset-0 z-20">
              <div
                className={`absolute top-3 right-3 left-3 flex flex-wrap items-center gap-2 transition-opacity duration-300 ${
                  demoStep >= 0 ? 'pointer-events-none opacity-70' : ''
                }`}
              >
                <BackToMenu />
                <BandSwitch />
                <GlucoseChip sim={sim} compact />
                <ProgressChip compact />
                <Tile
                  round
                  onClick={startCardboard}
                  aria-label="Cardboard view"
                  className="pointer-events-auto flex items-center justify-center rounded-full border border-[#F3E9D7] bg-[#FBF5EA]/90 text-[#7A5252] shadow-lg backdrop-blur-md"
                >
                  <Glasses className="h-4 w-4" />
                </Tile>
              </div>

              {!equationOpen && (
              <HudDrawer
                muted={demoStep >= 0}
                tabs={[
                  {
                    id: 'controls',
                    label: mode === 'roots' ? 'Bench' : caps.vocab === 'simple' ? 'Kit' : 'Controls',
                    icon: <SlidersHorizontal className="h-4 w-4" />,
                    content: controlsPanel,
                  },
                  ...(mode === 'garden'
                    ? [
                        {
                          id: 'data',
                          label: 'Data',
                          icon: <LineChart className="h-4 w-4" />,
                          badge:
                            needsPoint || needsDirection
                              ? 'predict!'
                              : readings.length
                                ? String(readings.length)
                                : undefined,
                          badgeTone: (needsPoint || needsDirection ? 'warn' : 'good') as 'warn' | 'good',
                          content: dataLab,
                        },
                        {
                          id: 'missions',
                          label: 'Missions',
                          icon: <Trophy className="h-4 w-4" />,
                          badge: `${done}/${missions.length}`,
                          badgeTone: 'neutral' as const,
                          content: missionCard,
                        },
                      ]
                    : []),
                ]}
              />
              )}

              {equationOpen && (
                <div className="absolute inset-x-0 top-14 flex justify-center px-2">
                  <EquationCard
                    compact
                    step={Math.floor(equationT + 1e-6)}
                    progress={equationT - Math.floor(equationT + 1e-6)}
                    playing={equationPlaying}
                    onPlayPause={equationPlayPause}
                    onNext={equationNext}
                    onReplay={equationReplay}
                    onClose={closeEquation}
                  />
                </div>
              )}

              {demoStep >= 0 && (
                <div className="absolute inset-x-0 top-0 bottom-16">
                  <DemoOverlay step={demoStep} progress={demoProgress} onSkip={() => finishDemo(false)} />
                </div>
              )}

              {abortNotice && (
                <div className="fact-pop pointer-events-auto absolute top-16 left-1/2 w-[min(24rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-[18px] border border-[#F0D9C0] bg-[#FDF1E4] px-4 py-3 shadow-xl">
                  <p className="text-[12px] leading-snug font-bold text-[#8A5A32]">
                    <strong>Trial discarded.</strong> You changed a condition while the measurement
                    was running. Set everything first, then measure.
                  </p>
                </div>
              )}

              {fact && zoomed && (
                <div className="absolute top-20 left-1/2 -translate-x-1/2">
                  <PhotoFactCard fact={fact} onClose={() => setFact(null)} />
                </div>
              )}
            </div>
          )
        }

        return (
      <div className="hud pointer-events-none fixed inset-0 z-20">
        {/* Left column: status chips pinned to the top, controls to the bottom,
            bounded so a tall panel can never swallow the chips above it. */}
        <div
          className={`absolute top-4 bottom-4 left-4 flex flex-col items-start gap-2 transition-opacity duration-300 ${
            demoStep >= 0 ? 'pointer-events-none opacity-70' : ''
          } ${equationOpen ? 'pointer-events-none opacity-0' : ''}`}
        >
          <div className="shrink-0">
            <GlucoseChip sim={sim} />
          </div>
          <div className="shrink-0">
            <ProgressChip compact={short} />
          </div>
          <div className="shrink-0">
            <BandSwitch />
          </div>
          <div className="shrink-0">
            <BackToMenu />
          </div>
          <div className="min-h-0 grow" />
          {controlsPanel}
        </div>

        {/* One right-hand column, so the cards can never stack on top of each
            other however tall they grow. */}
        <div
          className={`absolute top-4 right-4 bottom-4 flex w-[min(27rem,calc(100vw-5.5rem))] flex-col items-end gap-2 transition-opacity duration-300 ${
            equationOpen ? 'pointer-events-none opacity-0' : ''
          }`}
        >
          <div className="hidden shrink-0 xl:block">
            <PhotoTicker />
          </div>
          <div className="min-h-0 grow" />
          {mode === 'garden' && <div className="min-h-0 shrink">{missionCard}</div>}
          {mode === 'garden' && dataLab}
          <div className="hidden md:block">
            <PhotoAbout />
          </div>
        </div>

        {mode === 'garden' && (
          <div className="absolute inset-x-0 top-4 hidden justify-center sm:flex">
            <ViewControls
              autoOrbit={autoOrbit}
              onZoom={handleZoomView}
              onToggleOrbit={handleToggleOrbit}
              onReset={handleResetView}
              viewId={viewId}
              onView={handleView}
              onCardboard={startCardboard}
            />
          </div>
        )}

        {equationOpen && (
          <div className="absolute top-4 left-4 flex flex-col items-start gap-2">
            <BackToMenu />
            <BandSwitch />
          </div>
        )}
        {equationOpen && (
          <div className="absolute inset-x-0 bottom-6 flex justify-center px-4">
            <EquationCard
              step={Math.floor(equationT + 1e-6)}
              progress={equationT - Math.floor(equationT + 1e-6)}
              playing={equationPlaying}
              onPlayPause={equationPlayPause}
              onNext={equationNext}
              onReplay={equationReplay}
              onClose={closeEquation}
            />
          </div>
        )}

        {demoStep >= 0 && (
          <DemoOverlay step={demoStep} progress={demoProgress} onSkip={() => finishDemo(false)} />
        )}

        {abortNotice && (
          <div className="fact-pop pointer-events-auto absolute top-4 left-1/2 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 rounded-[18px] border border-[#F0D9C0] bg-[#FDF1E4] px-4 py-3 shadow-xl">
            <p className="text-[12px] leading-snug font-bold text-[#8A5A32]">
              <strong>Trial discarded.</strong> You changed a condition while the measurement was
              running, so the average would not belong to any single set of conditions. Set
              everything first, then measure.
            </p>
          </div>
        )}

        {fact && zoomed && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 sm:bottom-8">
            <PhotoFactCard fact={fact} onClose={() => setFact(null)} />
          </div>
        )}
      </div>
        )
      })()}

      {!started && <PhotoWelcome onStart={handleStart} onDemo={startDemo} />}
      {!stereo.on && <InputHints extra={[['LB/RB', 'Leaf lab / Membranes']]} />}
      {!stereo.on && <ProgressToasts />}
      {contextLost && <WebglFallback />}
    </div>
  )
}
