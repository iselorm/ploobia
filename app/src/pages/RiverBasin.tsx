import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowLeft, LineChart, RotateCcw, SlidersHorizontal, Trophy, Waves } from 'lucide-react'
import { BAND_CAPS, getBand, useBand } from '@/lib/bands'
import { logEvent } from '@/lib/events'
import { useBackHandler } from '@/lib/input'
import { useLayoutMode, useShortViewport } from '@/hooks/use-layout'
import { getReactionMs } from '@/lib/practical'
import {
  areaAt,
  channelD,
  channelW,
  createRiverSim,
  endRide,
  startRide,
  FLOAT_RUN,
  profileH,
  releaseFloat,
  resetPebble,
  resetStopwatch,
  riverMissionsForBand,
  RIVER_DEMO,
  startStorm,
  STATION_BY_ID,
  GAUGE_S,
  tapStopwatch,
  velocityAt,
  type DefenceId,
  type RiverContext,
  type RiverDemoApi,
  type RiverReading,
  type RiverViewId,
  type StormLog,
} from '@/lib/river'
import SceneErrorBoundary from '@/components/SceneErrorBoundary'
import BandSwitch from '@/components/hud/BandSwitch'
import InputHints from '@/components/hud/InputHints'
import HudDrawer from '@/components/hud/HudDrawer'
import ProgressToasts from '@/components/hud/ProgressToasts'
import ProgressChip from '@/components/hud/ProgressChip'
import ViewControls from '@/components/photo/hud/ViewControls'
import RiverPanel, { type RiverSettings, type RiverStatus } from '@/components/river/hud/RiverPanel'
import RiverData from '@/components/river/hud/RiverData'
import RiverMiniMap from '@/components/river/hud/RiverMiniMap'
import RiverNav from '@/components/river/hud/RiverNav'
import { RiverDemoOverlay, RiverMissionCard, RiverWelcome } from '@/components/river/hud/RiverCards'
import { RIVER_VIEWS } from '@/components/river/RiverCamera'

const RiverScene = lazy(() => import('@/components/river/RiverScene'))

function SceneFallback() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#152836]">
      <p className="animate-pulse text-sm font-bold text-[#FBF5EA]/80">Raising the valley…</p>
    </div>
  )
}

function WebglFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#152836] p-6">
      <div className="w-full max-w-md rounded-[28px] border border-[#F3E9D7] bg-[#FBF5EA] p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#2E6DA8]/10">
          <Waves className="h-7 w-7 text-[#2E6DA8]" />
        </div>
        <h2 className="text-xl font-black text-[#402222]">The mist has not lifted</h2>
        <p className="mt-2 text-sm leading-relaxed font-semibold text-[#7A5252]">
          Your browser could not start the 3D valley (WebGL is unavailable or crashed). Try reloading, or use a browser with WebGL enabled.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mx-auto mt-5 flex items-center gap-2 rounded-full bg-[#2E6DA8] px-6 py-3 text-sm font-extrabold text-[#FBF5EA] shadow transition-all hover:bg-[#245685] active:scale-95"
        >
          <RotateCcw className="h-4 w-4" />
          Reload the basin
        </button>
      </div>
    </div>
  )
}

function BackToMenu() {
  return (
    <Link
      to="/"
      className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-[#F3E9D7] bg-[#FBF5EA]/90 px-3 py-1.5 text-[11px] font-extrabold text-[#7A5252] shadow-lg backdrop-blur-md transition-all hover:scale-[1.04] hover:text-[#2E6DA8]"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Back to Ploobia
    </Link>
  )
}

export default function RiverBasin() {
  const sim = useMemo(() => createRiverSim(), [])
  const [band] = useBand()
  const caps = BAND_CAPS[band]
  const layout = useLayoutMode()
  const compact = layout === 'compact'
  const short = useShortViewport(900)

  const [started, setStarted] = useState(false)
  const [contextLost, setContextLost] = useState(false)
  const [settings, setSettings] = useState<RiverSettings>({
    basin: 'temperate',
    landUse: 'farm',
    wet: false,
    night: false,
    visionOn: true,
    mapOn: false,
    lens: 'none',
    station: 'st2',
    fastestFlag: null,
    floodLine: null,
    pebbleRing: null,
    defences: [],
  })
  const [status, setStatus] = useState<RiverStatus>({
    rideActive: false,
    q: 0, stage: 0.3, stormActive: false, flooded: false, damage: 0,
    swRunning: false, swElapsed: 0, floatActive: false, floatDone: 0,
    meterUnlocked: false, underUnlocked: false, lapseUnlocked: false,
    years: 0, pebbleMode: 'at rest', pebbleRound: 0.06,
  })
  const [readings, setReadings] = useState<RiverReading[]>([])
  const [storms, setStorms] = useState<StormLog[]>([])
  const [sections, setSections] = useState<Partial<Record<'st1' | 'st2' | 'st3', number[]>>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [oxbowSeen, setOxbowSeen] = useState(false)
  const [autoOrbit, setAutoOrbit] = useState(false)
  const [viewId, setViewId] = useState<RiverViewId>('overview')
  const [demoStep, setDemoStep] = useState(-1)
  const [demoProgress, setDemoProgress] = useState(0)
  const [hydroTick, setHydroTick] = useState(0)
  void hydroTick

  const nextId = useRef(1)
  const demoFirstReadingId = useRef(1)
  const demoFirstStorm = useRef(0)
  const lastSwStops = useRef(0)
  const lastStormSeq = useRef(0)
  const pendingTape = useRef<number | null>(null)
  const pendingSound = useRef<number | null>(null)
  const noticeTimer = useRef(0)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  useEffect(() => {
    logEvent('rivers', getBand(), 'session.started', {})
  }, [sim])

  const showNotice = useCallback((text: string) => {
    setNotice(text)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 5200)
  }, [])

  const record = useCallback(
    (r: Omit<RiverReading, 'id'>) => {
      const reading: RiverReading = { ...r, id: nextId.current++ }
      setReadings((prev) => [...prev, reading])
      if (!sim.demoMode) {
        logEvent('rivers', band, 'reading.recorded', {
          variable: r.kind,
          x: r.station === '—' ? 0 : STATION_BY_ID[r.station].s,
          y: r.value,
          repeats: [r.value],
          uncertainty: r.method === 'hand' ? (getReactionMs() ?? 250) / 1000 : 0.01,
          controls: { s: r.station === '—' ? 0 : STATION_BY_ID[r.station].s },
          predicted: typeof r.predicted === 'number' ? r.predicted : null,
          predictionClose: null,
          anomalous: false,
        })
      }
      return reading
    },
    [sim, band],
  )

  /* ---- poll the sim into React state ---- */
  useEffect(() => {
    const t = window.setInterval(() => {
      const missionCount = 0
      void missionCount
      setStatus((prev) => {
        const swElapsed = sim.swRunning ? Math.max(0, sim.time - sim.swStartAt) : sim.swElapsed
        const next: RiverStatus = {
          rideActive: sim.rideActive,
          q: sim.q,
          stage: sim.stage,
          stormActive: sim.stormActive,
          flooded: sim.flooded,
          damage: sim.damage,
          swRunning: sim.swRunning,
          swElapsed,
          floatActive: sim.floatActive,
          floatDone: sim.floatDone,
          meterUnlocked: sim.meterUnlocked,
          underUnlocked: prev.underUnlocked,
          lapseUnlocked: prev.lapseUnlocked,
          years: sim.years,
          pebbleMode: sim.pebble.mode === 'rest' ? 'at rest' : sim.pebble.mode,
          pebbleRound: sim.pebble.roundness,
        }
        const same =
          prev.rideActive === next.rideActive &&
          Math.abs(prev.q - next.q) < 0.005 &&
          prev.stormActive === next.stormActive &&
          prev.flooded === next.flooded &&
          Math.abs(prev.damage - next.damage) < 0.01 &&
          prev.swRunning === next.swRunning &&
          Math.abs(prev.swElapsed - next.swElapsed) < 0.005 &&
          prev.floatActive === next.floatActive &&
          prev.floatDone === next.floatDone &&
          prev.meterUnlocked === next.meterUnlocked &&
          Math.abs(prev.years - next.years) < 0.2 &&
          prev.pebbleMode === next.pebbleMode &&
          Math.abs(prev.pebbleRound - next.pebbleRound) < 0.01
        return same ? prev : next
      })
      setHydroTick(sim.hydro.length + (sim.ploobActive ? Math.floor(sim.time * 6) : sim.rideCp))

      // Stopwatch STOP → a hand velocity reading, if a float was actually timed.
      if (sim.swStops !== lastSwStops.current) {
        lastSwStops.current = sim.swStops
        const last = sim.swLast
        const snap = sim.floatSnapshot
        if (last && snap && snap.station === sim.station && !sim.floatActive) {
          const t = last.stop - last.start
          if (t < 0.4 || Math.abs(t - snap.t) > Math.max(2.5, snap.t)) {
            showNotice('Time the float between the two poles: START at the first, STOP at the second.')
          } else {
            const v = FLOAT_RUN / t
            record({
              kind: 'velocity', station: sim.station, value: Number(v.toFixed(2)), unit: 'm/s',
              method: 'hand', trueValue: snap.v, basin: sim.basin, seconds: Number(t.toFixed(2)),
              predicted: settingsRef.current.fastestFlag,
            })
            sim.floatSnapshot = null
          }
        } else if (last && !snap) {
          showNotice('Release the float first — then time it between the poles.')
        }
      }

      // Tape / sounding animations finishing → readings.
      if (pendingTape.current !== null && sim.tapeT < 0) {
        const stId = settingsRef.current.station
        const st = STATION_BY_ID[stId]
        pendingTape.current = null
        const w = channelW(st.s)
        record({ kind: 'width', station: stId, value: Number((w * (1 + (caps.noise ? (Math.random() - 0.5) * caps.noise : 0))).toFixed(2)), unit: 'm', method: 'tape', trueValue: w, basin: sim.basin })
      }
      if (pendingSound.current !== null && sim.soundT < 0) {
        const stId = settingsRef.current.station
        const st = STATION_BY_ID[stId]
        pendingSound.current = null
        const d = channelD(st.s)
        const profile = [0.35, 0.8, 1, 0.85, 0.4].map((k) => Number((d * k * (1 + (Math.random() - 0.5) * 0.06)).toFixed(2)))
        const w = channelW(st.s)
        const A = profile.reduce((a, p) => a + p, 0) / profile.length * w
        setSections((prev) => ({ ...prev, [stId]: profile }))
        record({ kind: 'section', station: stId, value: Number(A.toFixed(2)), unit: 'm²', method: 'rule', trueValue: areaAt(sim, st.s), basin: sim.basin, profile })
      }

      // Storm ended → log it and record the peak as evidence.
      if (sim.stormSeq !== lastStormSeq.current) {
        lastStormSeq.current = sim.stormSeq
        const s = sim.storms[sim.storms.length - 1]
        if (s) {
          setStorms([...sim.storms])
          record({
            kind: 'hydro', station: 'st3', value: Number(s.peakQ.toFixed(2)), unit: 'm³/s', method: 'sensor',
            trueValue: s.peakQ, basin: s.basin, storm: s, predicted: settingsRef.current.floodLine,
          })
        }
      }
    }, 90)
    return () => window.clearInterval(t)
  }, [sim, record, showNotice, caps.noise])

  /* ---- unlocks ---- */
  const velocityCount = readings.filter((r) => r.kind === 'velocity' && r.method === 'hand').length
  useEffect(() => {
    if (velocityCount >= 3 && !sim.meterUnlocked) {
      sim.meterUnlocked = true
      showNotice('Flow meter earned — three honest float timings. Instant velocity, anywhere.')
    }
    setStatus((p) => (p.underUnlocked === velocityCount >= 1 ? p : { ...p, underUnlocked: velocityCount >= 1 }))
  }, [velocityCount, sim, showNotice])

  /* ---- missions ---- */
  const ctx = useMemo<RiverContext>(
    () => ({ readings, sim, storms, oxbowSeen, fastestCommitted: settings.fastestFlag !== null }),
    [readings, sim, storms, oxbowSeen, settings.fastestFlag],
  )
  const doneCount = useMemo(() => riverMissionsForBand(band).filter((m) => m.check(ctx)).length, [band, ctx])

  // Time-lapse lens: earned on two completed missions.
  const [lapseUnlocked, setLapseUnlocked] = useState(false)
  useEffect(() => {
    if (doneCount >= 2 && !lapseUnlocked) {
      setLapseUnlocked(true)
      showNotice('Time-lapse lens earned — 1 second = 1 year. Hold it on the big bend.')
    }
  }, [doneCount, lapseUnlocked, showNotice])
  useEffect(() => {
    setStatus((p) => (p.lapseUnlocked === lapseUnlocked ? p : { ...p, lapseUnlocked }))
  }, [lapseUnlocked])

  // Ox-bow: seen when the lens has run past the cut-off.
  useEffect(() => {
    const t = window.setInterval(() => {
      if (sim.years > 30 && !oxbowSeen) setOxbowSeen(true)
    }, 800)
    return () => window.clearInterval(t)
  }, [sim, oxbowSeen])

  /* ---- handlers ---- */
  const updateSettings = useCallback(
    (patch: Partial<RiverSettings>) => {
      if (patch.basin !== undefined) sim.basin = patch.basin
      if (patch.landUse !== undefined) sim.landUse = patch.landUse
      if (patch.wet !== undefined) sim.wet = patch.wet
      if (patch.night !== undefined) sim.night = patch.night
      if (patch.visionOn !== undefined) sim.visionOn = patch.visionOn
      if (patch.mapOn !== undefined) sim.mapOn = patch.mapOn
      if (patch.lens !== undefined) sim.lens = patch.lens
      if (patch.station !== undefined) sim.station = patch.station
      if (patch.fastestFlag !== undefined && patch.fastestFlag !== null) {
        sim.fastestFlag = patch.fastestFlag
        if (!sim.demoMode && settingsRef.current.fastestFlag !== patch.fastestFlag) {
          logEvent('rivers', getBand(), 'prediction.committed', { variable: 'fastest-station', x: STATION_BY_ID[patch.fastestFlag].s, predicted: STATION_BY_ID[patch.fastestFlag].s, kind: 'point' })
        }
      }
      if (patch.floodLine !== undefined) {
        sim.floodLine = patch.floodLine
        if (!sim.demoMode && patch.floodLine !== null) {
          logEvent('rivers', getBand(), 'prediction.committed', { variable: 'flood-peak', x: GAUGE_S, predicted: patch.floodLine, kind: 'point' })
        }
      }
      if (patch.pebbleRing !== undefined) sim.pebbleRing = patch.pebbleRing
      setSettings((prev) => ({ ...prev, ...patch }))
    },
    [sim],
  )

  const handleTape = useCallback(() => {
    sim.tapeT = 0
    pendingTape.current = 1
  }, [sim])
  const handleSound = useCallback(() => {
    sim.soundT = 0
    pendingSound.current = 1
  }, [sim])
  const handleFloat = useCallback(() => {
    releaseFloat(sim)
    resetStopwatch(sim)
  }, [sim])
  const handleMeter = useCallback(() => {
    if (!sim.meterUnlocked) return
    const st = STATION_BY_ID[sim.station]
    const v = velocityAt(sim, st.s)
    record({ kind: 'velocity', station: sim.station, value: Number(v.toFixed(2)), unit: 'm/s', method: 'sensor', trueValue: v, basin: sim.basin })
  }, [sim, record])
  const handleTap = useCallback(() => tapStopwatch(sim), [sim])
  const handleResetWatch = useCallback(() => resetStopwatch(sim), [sim])
  const handleStorm = useCallback(() => {
    startStorm(sim)
  }, [sim])
  const handleMeasurePebble = useCallback(() => {
    record({ kind: 'pebble', station: '—', value: Number((sim.pebble.roundness * 100).toFixed(0)), unit: '% round', method: 'hand', trueValue: sim.pebble.s, basin: sim.basin, predicted: sim.pebbleRing })
  }, [sim, record])
  const handleResetPebble = useCallback(() => resetPebble(sim), [sim])
  const handleGradient = useCallback(() => {
    const st = STATION_BY_ID[sim.station]
    const drop = profileH(st.s - 5) - profileH(st.s + 5)
    const deg = (Math.atan2(drop, 10) * 180) / Math.PI
    record({ kind: 'gradient', station: sim.station, value: Number(deg.toFixed(1)), unit: '°', method: 'clino', trueValue: deg, basin: sim.basin })
  }, [sim, record])
  const handleDefence = useCallback(
    (id: DefenceId) => {
      const has = sim.defences.has(id)
      if (has) sim.defences.delete(id)
      else sim.defences.add(id)
      setSettings((p) => ({ ...p, defences: [...sim.defences] }))
    },
    [sim],
  )
  const handleComputeDischarge = useCallback(
    (stId: 'st1' | 'st2' | 'st3') => {
      const A = readings.filter((r) => r.kind === 'section' && r.station === stId).slice(-1)[0]
      const vs = readings.filter((r) => r.kind === 'velocity' && r.station === stId)
      if (!A || !vs.length) return
      const v = vs.reduce((a, r) => a + r.value, 0) / vs.length
      const q = A.value * v
      record({ kind: 'discharge', station: stId, value: Number(q.toFixed(2)), unit: 'm³/s', method: 'hand', trueValue: areaAt(sim, STATION_BY_ID[stId].s) * velocityAt(sim, STATION_BY_ID[stId].s), basin: sim.basin })
      showNotice(`Discharge at ${STATION_BY_ID[stId].name.split(' — ')[0]}: A × v̄ = ${A.value} × ${v.toFixed(2)} = ${q.toFixed(2)} m³/s. Your number, your method.`)
    },
    [readings, record, sim, showNotice],
  )

  const handleView = useCallback(
    (id: RiverViewId) => {
      sim.viewId = id
      sim.viewSeq += 1
      sim.autoOrbit = false
      setAutoOrbit(false)
      setViewId(id)
    },
    [sim],
  )
  const handleZoomView = useCallback((d: number) => void (sim.viewZoom = d), [sim])
  const handleToggleOrbit = useCallback(() => {
    sim.autoOrbit = !sim.autoOrbit
    setAutoOrbit(sim.autoOrbit)
  }, [sim])
  const handleResetView = useCallback(() => {
    sim.viewReset += 1
    sim.autoOrbit = false
    setAutoOrbit(false)
    setViewId('overview')
  }, [sim])

  const handleStart = useCallback(() => {
    sim.started = true
    setStarted(true)
  }, [sim])

  const handleRide = useCallback(() => {
    if (sim.demoMode || sim.rideActive) return
    sim.started = true
    setStarted(true)
    startRide(sim)
  }, [sim])
  const handleEndRide = useCallback(() => {
    endRide(sim, false)
    setViewId(sim.viewId)
  }, [sim])
  const lastRidesDone = useRef(0)
  useEffect(() => {
    const t = window.setInterval(() => {
      if (sim.ridesDone !== lastRidesDone.current) {
        lastRidesDone.current = sim.ridesDone
        setViewId(sim.viewId)
        showNotice('Ride complete — source to sea. Now measure what you saw: the float, the tape, the gauge.')
      }
    }, 400)
    return () => window.clearInterval(t)
  }, [sim, showNotice])

  /* ---- guided demo: Ploob rides the river ---- */
  const demoApi = useMemo<RiverDemoApi>(
    () => ({
      setBasin: (b) => updateSettings({ basin: b }),
      setLandUse: (l) => updateSettings({ landUse: l }),
      view: (v) => handleView(v),
      setMap: (on) => updateSettings({ mapOn: on }),
      storm: () => startStorm(sim),
      releaseFloat: () => releaseFloat(sim),
      station: (id) => updateSettings({ station: id }),
      ploob: (on) => {
        sim.ploobActive = on
        if (on) sim.ploobS = 4
      },
      ploobAt: () => sim.ploobS,
      vision: (on) => updateSettings({ visionOn: on }),
      now: () => sim.time,
    }),
    [sim, updateSettings, handleView],
  )

  const startDemo = useCallback(() => {
    sim.started = true
    sim.demoMode = true
    demoFirstReadingId.current = nextId.current
    demoFirstStorm.current = sim.storms.length
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
      logEvent('rivers', getBand(), 'demo.watched', { completed })
      sim.demoMode = false
      sim.ploobActive = false
      sim.autoOrbit = false
      setAutoOrbit(false)
      setDemoStep(-1)
      setDemoProgress(0)
      const cutoff = demoFirstReadingId.current
      setReadings((prev) => prev.filter((r) => r.id < cutoff))
      sim.storms.length = demoFirstStorm.current
      setStorms([...sim.storms])
      sim.stormActive = false
      sim.stormFast = 0
      sim.stormSlow = 0
      sim.hydro.length = 0
      handleResetView()
    },
    [sim, handleResetView],
  )

  useEffect(() => {
    if (demoStep < 0) return
    if (demoStep >= RIVER_DEMO.length) {
      finishDemo(true)
      return
    }
    const step = RIVER_DEMO[demoStep]
    const startedAt = performance.now()
    const state: Record<string, unknown> = {}
    let doneFlag = false
    step.enter?.(demoApi)
    const advance = () => {
      if (doneFlag) return
      doneFlag = true
      window.clearInterval(timer)
      setDemoStep((n) => n + 1)
    }
    const timer = window.setInterval(() => {
      const elapsed = performance.now() - startedAt
      setDemoProgress(Math.min(1, elapsed / step.ms))
      const early = step.tick?.(demoApi, elapsed, state)
      if (early === true || elapsed >= step.ms) advance()
    }, 60)
    return () => {
      doneFlag = true
      window.clearInterval(timer)
    }
  }, [demoStep, demoApi, finishDemo])

  useBackHandler(
    useCallback(() => {
      if (settingsRef.current.mapOn) {
        updateSettings({ mapOn: false })
        return true
      }
      if (settingsRef.current.lens !== 'none') {
        updateSettings({ lens: 'none' })
        return true
      }
      return false
    }, [updateSettings]),
  )

  /* ---- panels ---- */
  const controlsPanel = (
    <RiverPanel
      settings={settings}
      status={status}
      notice={notice}
      onChange={updateSettings}
      onTape={handleTape}
      onSound={handleSound}
      onFloat={handleFloat}
      onMeter={handleMeter}
      onTap={handleTap}
      onResetWatch={handleResetWatch}
      onStorm={handleStorm}
      onMeasurePebble={handleMeasurePebble}
      onResetPebble={handleResetPebble}
      onGradient={handleGradient}
      onDefence={handleDefence}
      onDemo={startDemo}
      onRide={handleRide}
      embedded={compact}
    />
  )
  const dataLab = (
    <RiverData
      readings={readings}
      hydro={sim.hydro}
      storms={storms}
      basin={settings.basin}
      pebbleSizeMm={Math.max(1, sim.pebble.size * 64)}
      pebbleV={velocityAt(sim, sim.pebble.s)}
      onDelete={(id) => setReadings((prev) => prev.filter((r) => r.id !== id))}
      onClear={() => setReadings([])}
      onComputeDischarge={handleComputeDischarge}
      embedded={compact}
    />
  )
  const missionCard = <RiverMissionCard ctx={ctx} embedded={compact} />

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#152836]">
      <SceneErrorBoundary>
        <Suspense fallback={<SceneFallback />}>
          <RiverScene sim={sim} sections={sections} onContextLost={() => setContextLost(true)} />
        </Suspense>
      </SceneErrorBoundary>

      <div className="pointer-events-none fixed inset-0 z-10" style={{ background: 'radial-gradient(ellipse at center, transparent 58%, rgba(14, 28, 40, 0.35) 100%)' }} />
      <div
        className="pointer-events-none fixed inset-0 z-10 transition-opacity duration-1000"
        style={{ background: '#26344E', mixBlendMode: 'multiply', opacity: settings.night ? 0.55 : 0 }}
      />
      <div
        className="pointer-events-none fixed inset-0 z-10 transition-opacity duration-700"
        style={{ background: 'linear-gradient(#4A7A8C, #2A4A52)', mixBlendMode: 'multiply', opacity: settings.lens === 'under' ? 0.5 : 0 }}
      />

      {compact ? (
        <div className="hud pointer-events-none fixed inset-0 z-20">
          <div className={`absolute top-3 right-3 left-3 flex flex-wrap items-center gap-2 transition-opacity duration-300 ${demoStep >= 0 ? 'pointer-events-none opacity-70' : ''}`}>
            <BackToMenu />
            <BandSwitch />
            <ProgressChip compact />
          </div>
          {!status.rideActive && demoStep < 0 && (
            <div className="absolute bottom-24 left-3">
              <RiverNav sim={sim} tick={hydroTick} onReset={handleResetView} />
            </div>
          )}
          <HudDrawer
            muted={demoStep >= 0}
            tabs={[
              { id: 'controls', label: caps.vocab === 'simple' ? 'Kit' : 'Controls', icon: <SlidersHorizontal className="h-4 w-4" />, content: controlsPanel },
              { id: 'data', label: 'Data', icon: <LineChart className="h-4 w-4" />, badge: readings.length ? String(readings.length) : undefined, badgeTone: 'good' as const, content: dataLab },
              { id: 'missions', label: 'Missions', icon: <Trophy className="h-4 w-4" />, badge: `${doneCount}/${riverMissionsForBand(band).length}`, badgeTone: 'neutral' as const, content: missionCard },
            ]}
          />
          {demoStep >= 0 && (
            <div className="absolute inset-x-0 top-0 bottom-16">
              <RiverDemoOverlay step={demoStep} progress={demoProgress} onSkip={() => finishDemo(false)} />
            </div>
          )}
        </div>
      ) : (
        <div className="hud pointer-events-none fixed inset-0 z-20">
          <div className={`absolute top-4 bottom-4 left-4 flex flex-col items-start gap-2 transition-opacity duration-300 ${demoStep >= 0 ? 'pointer-events-none opacity-70' : ''} ${status.rideActive ? 'pointer-events-none opacity-30' : ''}`}>
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
          <div className={`absolute top-4 right-4 bottom-4 flex w-[min(25rem,calc(100vw-5.5rem))] flex-col items-end gap-2 transition-opacity duration-300 ${status.rideActive ? 'pointer-events-none opacity-0' : ''}`}>
            <div className="min-h-0 grow" />
            <div className="min-h-0 shrink">{missionCard}</div>
            {dataLab}
          </div>
          <div className="absolute inset-x-0 top-4 hidden justify-center sm:flex">
            <ViewControls autoOrbit={autoOrbit} onZoom={handleZoomView} onToggleOrbit={handleToggleOrbit} onReset={handleResetView} viewId={viewId} onView={(id) => handleView(id as RiverViewId)} views={RIVER_VIEWS} />
          </div>
          <div className="absolute top-16 right-4 flex flex-col items-end gap-2">
            <RiverMiniMap sim={sim} tick={hydroTick} />
            {!status.rideActive && <RiverNav sim={sim} tick={hydroTick} onReset={handleResetView} />}
          </div>
          {demoStep >= 0 && <RiverDemoOverlay step={demoStep} progress={demoProgress} onSkip={() => finishDemo(false)} />}
        </div>
      )}

      {status.rideActive && (
        <div className="hud pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center">
          <button
            onClick={handleEndRide}
            className="pointer-events-auto rounded-full border border-[#FBF5EA]/30 bg-[#0E1C28]/70 px-5 py-2 text-[12px] font-extrabold text-[#EAF4F8] shadow-lg backdrop-blur-md transition-all hover:scale-[1.04]"
          >
            End the ride
          </button>
        </div>
      )}
      {compact && status.rideActive && (
        <div className="hud pointer-events-none fixed top-14 right-3 z-30">
          <RiverMiniMap sim={sim} tick={hydroTick} compactRide />
        </div>
      )}
      {!started && <RiverWelcome onStart={handleStart} onDemo={startDemo} />}
      <InputHints extra={[['LB/RB', 'Stations']]} />
      <ProgressToasts />
      {contextLost && <WebglFallback />}
    </div>
  )
}
