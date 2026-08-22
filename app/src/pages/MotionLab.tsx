import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowLeft, LineChart, RotateCcw, SlidersHorizontal, Timer, Trophy } from 'lucide-react'
import { BAND_CAPS, getBand, useBand } from '@/lib/bands'
import { logEvent } from '@/lib/events'
import { useBackHandler, useInputAction } from '@/lib/input'
import { useLayoutMode, useShortViewport } from '@/hooks/use-layout'
import { getReactionMs, useReactionMs } from '@/lib/practical'
import {
  createMotionSim,
  currentLaunchSpeed,
  EQUATION_BEATS,
  fallTime,
  fireLaunch,
  MOTION_DEMO,
  motionMissionsForBand,
  predictionClose,
  pushBall,
  releaseDrop,
  resetStopwatch,
  SEGUE_REQUIRES,
  simNow,
  tapStopwatch,
  trueInterval,
  WORLD_BY_ID,
  type EquationBeat,
  type LabMode,
  type MissionContext,
  type MotionDemoApi,
  type MotionReading,
  type MotionViewId,
  type WorldId,
} from '@/lib/motion'
import SceneErrorBoundary from '@/components/SceneErrorBoundary'
import BandSwitch from '@/components/hud/BandSwitch'
import InputHints from '@/components/hud/InputHints'
import HudDrawer from '@/components/hud/HudDrawer'
import ProgressToasts from '@/components/hud/ProgressToasts'
import ProgressChip from '@/components/hud/ProgressChip'
import ViewControls from '@/components/photo/hud/ViewControls'
import MotionPanel, { type MotionSettings, type MotionStatus } from '@/components/motion/hud/MotionPanel'
import MotionDataLab, { type LineState } from '@/components/motion/hud/MotionDataLab'
import {
  CalibrationCard,
  commitReaction,
  EquationBeatCard,
  MotionDemoOverlay,
  MotionMissionCard,
  MotionWelcome,
  ReactionChip,
  SegueCard,
} from '@/components/motion/hud/MotionCards'
import { MOTION_VIEWS } from '@/components/motion/MotionCamera'

const MotionScene = lazy(() => import('@/components/motion/MotionScene'))

function SceneFallback() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#1B2A3A]">
      <p className="animate-pulse text-sm font-bold text-[#FBF5EA]/80">Setting up the bench…</p>
    </div>
  )
}

function WebglFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1B2A3A] p-6">
      <div className="w-full max-w-md rounded-[28px] border border-[#F3E9D7] bg-[#FBF5EA] p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#2E6DA8]/10">
          <Timer className="h-7 w-7 text-[#2E6DA8]" />
        </div>
        <h2 className="text-xl font-black text-[#402222]">The lab lights are off</h2>
        <p className="mt-2 text-sm leading-relaxed font-semibold text-[#7A5252]">Your browser could not start the 3D lab (WebGL is unavailable or crashed). Try reloading, or use a browser with WebGL enabled.</p>
        <button onClick={() => window.location.reload()} className="mx-auto mt-5 flex items-center gap-2 rounded-full bg-[#2E6DA8] px-6 py-3 text-sm font-extrabold text-[#FBF5EA] shadow transition-all hover:bg-[#245685] active:scale-95">
          <RotateCcw className="h-4 w-4" />
          Reload the lab
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

const BEAT_FOR_MISSION: Record<string, EquationBeat['id']> = {
  'two-numbers': 'speed',
  gradient: 'gradient',
  'vt-line': 'vt',
  area: 'area',
  'no-time': 'v2',
}

export default function MotionLab() {
  const sim = useMemo(() => createMotionSim(), [])
  const [band] = useBand()
  const caps = BAND_CAPS[band]
  const layout = useLayoutMode()
  const compact = layout === 'compact'
  const short = useShortViewport(900)
  const reactionMs = useReactionMs()

  const [started, setStarted] = useState(false)
  const [calibrating, setCalibrating] = useState(false)
  const [contextLost, setContextLost] = useState(false)
  const [settings, setSettings] = useState<MotionSettings>({
    mode: 'roll',
    world: 'earth',
    venue: 'outdoors',
    visionOn: true,
    surface: 'felt',
    mass: 'steel',
    push: 1.0,
    target: 1.0,
    useGates: false,
    gateDist: 1.0,
    dropHeight: 1.0,
    paired: false,
    sensorOn: true,
    launcher: 'slingshot',
    launchAngle: 40,
    launchPower: 0.6,
    targetDist: 6.0,
    ringDist: null,
  })
  const [status, setStatus] = useState<MotionStatus>({
    rolling: false,
    dropping: false,
    launching: false,
    swRunning: false,
    swElapsed: 0,
    flick: null,
    gatesUnlocked: false,
    padUnlocked: false,
    sensorUnlocked: false,
    trebuchetUnlocked: false,
    launchSpeed: 6,
    lastRange: null,
    lastTof: null,
    lastGap: null,
  })
  const [readings, setReadings] = useState<MotionReading[]>([])
  const [orderPrediction, setOrderPrediction] = useState<'heavy' | 'light' | 'same' | null>(null)
  const [orderPredicted, setOrderPredicted] = useState(false)
  const [speedPrediction, setSpeedPrediction] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [lineState, setLineState] = useState<LineState>({ rollLineOk: false, vtLineOk: false, areaOk: false })
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [segueOpen, setSegueOpen] = useState(false)
  const [beat, setBeat] = useState<EquationBeat['id'] | null>(null)
  const [earned, setEarned] = useState<string[]>([])
  const earnedIds = useRef<Set<string>>(new Set())
  const [autoOrbit, setAutoOrbit] = useState(false)
  const [viewId, setViewId] = useState<MotionViewId>('overview')
  const [demoStep, setDemoStep] = useState(-1)
  const [demoProgress, setDemoProgress] = useState(0)
  const demoFirstReadingId = useRef(1)
  const [rollLog, setRollLog] = useState(sim.rollLog.length)
  const [dropLog, setDropLog] = useState(sim.dropLog.length)
  const [launchLog, setLaunchLog] = useState(sim.launchLog.length)

  const nextId = useRef(1)
  const lastSwStops = useRef(0)
  const lastGate = useRef(0)
  const lastPad = useRef(0)
  const lastTrace = useRef(0)
  const lastLaunch = useRef(0)
  const noticeTimer = useRef(0)
  const speedPredRef = useRef<number | null>(null)
  speedPredRef.current = speedPrediction
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  useEffect(() => {
    logEvent('motion', getBand(), 'session.started', {})
    // Exposed for the Playwright harness (verify-motion.mjs): it needs the
    // exact crossing times to tap "like a human" on a slow renderer.
    ;(window as unknown as { __motionSim?: unknown }).__motionSim = sim
  }, [sim])

  const showNotice = useCallback((text: string) => {
    setNotice(text)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 5000)
  }, [])

  const record = useCallback(
    (r: Omit<MotionReading, 'id'>) => {
      const reading: MotionReading = { ...r, id: nextId.current++ }
      setReadings((prev) => [...prev, reading])
      if (!sim.demoMode) {
        logEvent('motion', band, 'reading.recorded', {
          variable: r.kind === 'roll' ? 'distance' : r.kind === 'trace' ? 'sensor' : r.kind === 'launch' ? 'range' : 'fall',
          x: r.x,
          y: r.t,
          repeats: [r.t],
          uncertainty: r.method === 'hand' ? (getReactionMs() ?? 250) / 1000 : r.method === 'gate' ? 0.001 : 0.02,
          controls: { g: r.g, push: r.push, height: r.kind === 'roll' ? 0 : r.x },
          predicted: r.predicted,
          predictionClose: r.predicted === null ? null : predictionClose(r.predicted, r.t),
          anomalous: false,
        })
      }
    },
    [sim, band],
  )

  /* ---- keep the HUD in step with the sim (fast poll: the stopwatch is live) ---- */
  useEffect(() => {
    const t = window.setInterval(() => {
      const s = settingsRef.current
      setStatus((prev) => {
        const swElapsed = sim.swRunning ? Math.max(0, simNow(sim) - sim.swStartAt) : sim.swElapsed
        const flick = sim.swFlick !== null && sim.time - sim.swFlickAt < 3 ? sim.swFlick : null
        const launchSpeed = currentLaunchSpeed(sim)
        const lastLog = sim.launchLog.length ? sim.launchLog[sim.launchLog.length - 1] : null
        if (
          prev.rolling === sim.rolling &&
          prev.dropping === sim.dropping &&
          prev.launching === sim.launching &&
          prev.swRunning === sim.swRunning &&
          Math.abs(prev.swElapsed - swElapsed) < 0.005 &&
          prev.flick === flick &&
          prev.gatesUnlocked === sim.gatesUnlocked &&
          prev.padUnlocked === sim.padUnlocked &&
          prev.sensorUnlocked === sim.sensorUnlocked &&
          prev.trebuchetUnlocked === sim.trebuchetUnlocked &&
          Math.abs(prev.launchSpeed - launchSpeed) < 0.05 &&
          prev.lastRange === (lastLog?.range ?? null)
        )
          return prev
        return {
          rolling: sim.rolling,
          dropping: sim.dropping,
          launching: sim.launching,
          swRunning: sim.swRunning,
          swElapsed,
          flick,
          gatesUnlocked: sim.gatesUnlocked,
          padUnlocked: sim.padUnlocked,
          sensorUnlocked: sim.sensorUnlocked,
          trebuchetUnlocked: sim.trebuchetUnlocked,
          launchSpeed,
          lastRange: lastLog?.range ?? null,
          lastTof: lastLog?.tof ?? null,
          lastGap: lastLog?.ringGap ?? null,
        }
      })
      if (sim.rollLog.length !== rollLog) setRollLog(sim.rollLog.length)
      if (sim.dropLog.length !== dropLog) setDropLog(sim.dropLog.length)
      if (sim.launchLog.length !== launchLog) setLaunchLog(sim.launchLog.length)

      // A landing: Scout measures it and it becomes a reading.
      if (sim.launchDone !== lastLaunch.current) {
        lastLaunch.current = sim.launchDone
        const log = sim.launchLog[sim.launchLog.length - 1]
        if (log) {
          record({
            kind: 'launch',
            method: 'sensor',
            x: Number(log.range.toFixed(2)),
            t: Number(log.tof.toFixed(3)),
            trueT: log.tof,
            world: log.world,
            g: log.g,
            mass: log.mass,
            surface: s.surface,
            push: s.push,
            predicted: log.ringAt,
            predictedSpeed: null,
            angle: log.angle,
            speed: Number(log.v0.toFixed(2)),
            launcher: log.launcher,
          })
        }
      }

      // A STOP tap: turn it into a hand reading if a motion was actually timed.
      if (sim.swStops !== lastSwStops.current) {
        lastSwStops.current = sim.swStops
        const last = sim.swLast
        if (last) {
          const trueT = trueInterval(sim)
          const base = {
            world: s.world as WorldId,
            g: sim.g,
            mass: s.mass,
            surface: s.surface,
            push: s.push,
            predicted: null,
            predictedSpeed: null,
          }
          if (s.mode === 'roll') {
            const started = Object.keys(sim.crossAt).length > 0 && last.start >= sim.rollStartAt - 1.5
            if (!started) showNotice('Push the ball first, then start the watch as it crosses the red line.')
            else if (trueT === null) showNotice('The ball stopped before that marker — pick a nearer marker, a harder push or a smoother surface.')
            else record({ ...base, kind: 'roll', method: 'hand', x: s.target, t: Number(last.stop - last.start > 0 ? (last.stop - last.start).toFixed(2) : '0'), trueT })
          } else {
            const started = (sim.dropping || sim.landedAt !== null) && last.start >= sim.dropStartAt - 1.5
            if (!started || trueT === null) showNotice('Release the ball first, then start the watch on release and stop it on landing.')
            else record({ ...base, kind: 'drop', method: 'hand', x: sim.dropH0, t: Number((last.stop - last.start).toFixed(2)), trueT })
          }
        }
      }
      if (sim.gateDone !== lastGate.current) {
        lastGate.current = sim.gateDone
        const g = sim.gateSnapshot
        if (g && s.useGates)
          record({ kind: 'roll', method: 'gate', x: g.d, t: Number(g.t.toFixed(3)), trueT: g.t, world: s.world, g: sim.g, mass: s.mass, surface: s.surface, push: s.push, predicted: null, predictedSpeed: null })
      }
      if (sim.padDone !== lastPad.current) {
        lastPad.current = sim.padDone
        const p = sim.padSnapshot
        if (p && !(s.sensorOn && sim.sensorUnlocked))
          record({ kind: 'drop', method: 'gate', x: p.h, t: Number(p.t.toFixed(3)), trueT: p.t, world: s.world, g: sim.g, mass: s.mass, surface: s.surface, push: s.push, predicted: null, predictedSpeed: null })
      }
      if (sim.traceDone !== lastTrace.current) {
        lastTrace.current = sim.traceDone
        const tr = sim.traceSnapshot
        if (tr) {
          record({ kind: 'trace', method: 'sensor', x: tr.h, t: Number(tr.t.toFixed(3)), trueT: tr.t, world: s.world, g: sim.g, mass: s.mass, surface: s.surface, push: s.push, predicted: null, predictedSpeed: speedPredRef.current, trace: tr.samples })
        }
      }
    }, 50)
    return () => window.clearInterval(t)
  }, [sim, record, showNotice, rollLog, dropLog, launchLog])

  /* ---- missions, unlocks, beats, segue ---- */
  const ctx = useMemo<MissionContext>(
    () => ({
      readings,
      rolls: sim.rollLog.slice(0, rollLog),
      drops: sim.dropLog.slice(0, dropLog),
      launches: sim.launchLog.slice(0, launchLog),
      orderPredicted,
      rollLineOk: lineState.rollLineOk,
      vtLineOk: lineState.vtLineOk,
      areaOk: lineState.areaOk,
      drawerOpen,
    }),
    [readings, sim, rollLog, dropLog, launchLog, orderPredicted, lineState, drawerOpen],
  )
  const missions = useMemo(() => motionMissionsForBand(band), [band])
  const done = useMemo(() => new Set(missions.filter((m) => m.check(ctx)).map((m) => m.id)), [missions, ctx])

  useEffect(() => {
    if (sim.demoMode) return
    const gates = caps.vocab === 'simple' ? done.has('first-time') : done.has('same-roll-thrice')
    if (gates && !sim.gatesUnlocked) {
      sim.gatesUnlocked = true
      setSettings((p) => ({ ...p, useGates: true }))
    }
    if (done.has('time-a-fall') && !sim.padUnlocked) {
      sim.padUnlocked = true
      if (caps.motionSensor) sim.sensorUnlocked = true
    }
    if (done.has('hit-target') && !sim.trebuchetUnlocked) {
      sim.trebuchetUnlocked = true
    }
    if (SEGUE_REQUIRES.every((id) => done.has(id)) && !drawerOpen) {
      sim.drawerOpen = true
      setDrawerOpen(true)
    }
    for (const [mid, b] of Object.entries(BEAT_FOR_MISSION)) {
      if (done.has(mid) && !earnedIds.current.has(mid)) {
        earnedIds.current.add(mid)
        setEarned((prev) => [...prev, EQUATION_BEATS[b].equation])
        setBeat(b)
      }
    }
  }, [done, sim, caps, drawerOpen])

  // Guard with a ref, not `segueShown`: putting the flag in the deps would let
  // the state update that sets it re-run the effect and clear its own pending
  // timeout, so the modal would never actually open.
  const segueScheduled = useRef(false)
  useEffect(() => {
    if (!drawerOpen || segueScheduled.current || sim.demoMode) return
    segueScheduled.current = true
    const t = window.setTimeout(() => setSegueOpen(true), 1200)
    return () => window.clearTimeout(t)
  }, [drawerOpen, sim])

  /* ---- handlers ---- */
  const updateSettings = useCallback(
    (patch: Partial<MotionSettings>) => {
      if (patch.world !== undefined) {
        sim.world = patch.world
        sim.g = WORLD_BY_ID[patch.world].g
      }
      if (patch.mode !== undefined && patch.mode !== sim.mode) {
        sim.mode = patch.mode
        // The camera follows the corner of the yard you are working in.
        sim.viewId = patch.mode === 'drop' ? 'drop' : patch.mode === 'launch' ? 'instrument' : 'bench'
        sim.viewSeq += 1
        sim.autoOrbit = false
        setAutoOrbit(false)
        setViewId(sim.viewId)
      }
      if (patch.venue !== undefined) sim.venue = patch.venue
      if (patch.visionOn !== undefined) sim.visionOn = patch.visionOn
      if (patch.surface !== undefined) sim.surface = patch.surface
      if (patch.mass !== undefined) sim.mass = patch.mass
      if (patch.push !== undefined) sim.push = patch.push
      if (patch.target !== undefined) sim.target = patch.target
      if (patch.gateDist !== undefined) sim.gateDist = patch.gateDist
      if (patch.launcher !== undefined) {
        sim.launcher = patch.launcher
        patch.launchPower = sim.launchPower[patch.launcher]
        if (patch.launcher === 'trebuchet') {
          sim.launchAngle = 45
          patch.launchAngle = 45
        }
      }
      if (patch.launchAngle !== undefined) sim.launchAngle = patch.launchAngle
      if (patch.launchPower !== undefined) sim.launchPower[sim.launcher] = patch.launchPower
      if (patch.targetDist !== undefined) sim.targetDist = patch.targetDist
      if (patch.ringDist !== undefined) sim.predictRing = patch.ringDist
      if (patch.dropHeight !== undefined) {
        sim.dropHeight = patch.dropHeight
        if (!sim.dropping) {
          sim.ballAY = patch.dropHeight
          sim.ballBY = patch.dropHeight
          sim.landedAt = null
        }
      }
      setSettings((prev) => ({ ...prev, ...patch }))
    },
    [sim],
  )

  const handlePush = useCallback(() => {
    if (sim.rolling) return
    if (sim.swRunning) resetStopwatch(sim)
    pushBall(sim)
  }, [sim])

  const handleRelease = useCallback(
    (paired: boolean) => {
      if (sim.dropping) return
      if (sim.swRunning) resetStopwatch(sim)
      setSettings((p) => (p.paired === paired ? p : { ...p, paired }))
      sim.sensorArmed = false
      releaseDrop(sim, paired)
      sim.sensorArmed = sim.sensorUnlocked && settingsRef.current.sensorOn
    },
    [sim],
  )

  const handleFire = useCallback(() => {
    if (sim.launching) return
    if (sim.predictRing !== null && !sim.demoMode) {
      logEvent('motion', getBand(), 'prediction.committed', { variable: 'landing', x: sim.targetDist, predicted: sim.predictRing, kind: 'point' })
    }
    fireLaunch(sim)
  }, [sim])

  const handlePlaceRing = useCallback(
    (d: number) => {
      updateSettings({ ringDist: d })
    },
    [updateSettings],
  )

  const handleTap = useCallback(() => {
    if (!sim.started) return
    tapStopwatch(sim)
  }, [sim])

  const handleResetWatch = useCallback(() => resetStopwatch(sim), [sim])

  const handleOrderPredict = useCallback(
    (o: 'heavy' | 'light' | 'same') => {
      setOrderPrediction(o)
      setOrderPredicted(true)
      if (!sim.demoMode) logEvent('motion', band, 'prediction.committed', { variable: 'order', x: settingsRef.current.dropHeight, predicted: o === 'same' ? 0 : o === 'heavy' ? -1 : 1, kind: 'direction' })
    },
    [sim, band],
  )

  const handleView = useCallback(
    (id: MotionViewId) => {
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
    if (getReactionMs() === null) setCalibrating(true)
  }, [sim])

  const handleCalibrated = useCallback(
    (samples: number[]) => {
      commitReaction(samples, getBand())
      sim.lampOn = false
      setCalibrating(false)
    },
    [sim],
  )

  // Space bar taps the stopwatch when nothing text-like has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.defaultPrevented) return
      const el = document.activeElement as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || el?.getAttribute('role') === 'slider' || el?.isContentEditable) return
      if (!sim.started || calibrating || demoStep >= 0) return
      e.preventDefault()
      tapStopwatch(sim)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sim, calibrating, demoStep])

  useBackHandler(
    useCallback(() => {
      if (beat) {
        setBeat(null)
        return true
      }
      if (segueOpen) {
        setSegueOpen(false)
        return true
      }
      return false
    }, [beat, segueOpen]),
  )
  useInputAction(
    useCallback(
      (a) => {
        if (a.type === 'tab' && !compact) {
          const order: LabMode[] = ['roll', 'launch', 'drop']
          const i = order.indexOf(settingsRef.current.mode)
          updateSettings({ mode: order[(i + 1 + order.length) % order.length] })
        }
      },
      [compact, updateSettings],
    ),
  )

  /* ---- guided demo ---- */
  const demoApi = useMemo<MotionDemoApi>(
    () => ({
      setMode: (m: LabMode) => updateSettings({ mode: m }),
      setWorld: (w) => updateSettings({ world: w }),
      setPush: (v) => updateSettings({ push: v }),
      setTarget: (d) => updateSettings({ target: d }),
      setDropHeight: (h) => updateSettings({ dropHeight: h }),
      setLauncher: (l) => updateSettings({ launcher: l }),
      setAngle: (deg) => updateSettings({ launchAngle: deg }),
      setPower: (v) => updateSettings({ launchPower: v }),
      fire: () => handleFire(),
      push: () => handlePush(),
      release: (paired) => handleRelease(paired),
      tap: () => tapStopwatch(sim),
      resetView: () => handleResetView(),
      setAutoOrbit: (on) => {
        sim.autoOrbit = on
        setAutoOrbit(on)
      },
      view: (v) => handleView(v),
      crossing: (which) => {
        if (which === 'start') return sim.mode === 'roll' ? (sim.crossAt['0'] ?? null) : sim.dropping || sim.landedAt !== null ? sim.dropStartAt : null
        if (which === 'target') return sim.crossAt[String(sim.target)] ?? null
        return sim.dropping || sim.landedAt !== null ? sim.dropStartAt + fallTime(sim.dropH0, sim.g) : null
      },
      now: () => simNow(sim),
    }),
    [updateSettings, handlePush, handleRelease, handleResetView, handleView, sim],
  )

  const startDemo = useCallback(() => {
    sim.started = true
    sim.demoMode = true
    demoFirstReadingId.current = nextId.current
    setStarted(true)
    setCalibrating(false)
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
      logEvent('motion', getBand(), 'demo.watched', { completed })
      sim.demoMode = false
      sim.autoOrbit = false
      resetStopwatch(sim)
      setAutoOrbit(false)
      setDemoStep(-1)
      setDemoProgress(0)
      const cutoff = demoFirstReadingId.current
      setReadings((prev) => prev.filter((r) => r.id < cutoff))
      // The demo's own rolls, drops and launches are examples, not evidence.
      sim.rollLog.length = 0
      sim.dropLog.length = 0
      sim.launchLog.length = 0
      setRollLog(0)
      setDropLog(0)
      setLaunchLog(0)
      if (getReactionMs() === null) setCalibrating(true)
    },
    [sim],
  )

  useEffect(() => {
    if (demoStep < 0) return
    if (demoStep >= MOTION_DEMO.length) {
      finishDemo(true)
      return
    }
    const step = MOTION_DEMO[demoStep]
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

  /* ---- derived ---- */
  const matches = useCallback(
    (r: MotionReading) => r.world === settings.world && r.mass === settings.mass && r.surface === settings.surface && Math.abs(r.push - settings.push) < 1e-6,
    [settings.world, settings.mass, settings.surface, settings.push],
  )
  const doneCount = done.size

  const controlsPanel = (
    <MotionPanel
      settings={settings}
      status={status}
      orderPrediction={orderPrediction}
      speedPrediction={speedPrediction}
      notice={notice}
      onChange={updateSettings}
      onPush={handlePush}
      onRelease={handleRelease}
      onFire={handleFire}
      onTap={handleTap}
      onResetWatch={handleResetWatch}
      onOrderPredict={handleOrderPredict}
      onSpeedPredict={setSpeedPrediction}
      onDemo={startDemo}
      onRecalibrate={() => setCalibrating(true)}
      embedded={compact}
    />
  )
  const dataLab = (
    <MotionDataLab
      readings={readings}
      mode={settings.mode}
      matches={matches}
      g={sim.g}
      launchSpeed={status.launchSpeed}
      onDelete={(id) => setReadings((prev) => prev.filter((r) => r.id !== id))}
      onClear={() => setReadings([])}
      onLineState={setLineState}
      embedded={compact}
    />
  )
  const missionCard = <MotionMissionCard ctx={ctx} embedded={compact} />

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#1B2A3A]">
      <SceneErrorBoundary>
        <Suspense fallback={<SceneFallback />}>
          <MotionScene
            sim={sim}
            world={settings.world}
            venue={settings.venue}
            visionOn={settings.visionOn}
            surface={settings.surface}
            mass={settings.mass}
            target={settings.target}
            gatesUnlocked={status.gatesUnlocked && settings.useGates}
            gateDist={settings.gateDist}
            paired={settings.paired}
            padUnlocked={status.padUnlocked}
            sensorUnlocked={status.sensorUnlocked}
            extraWorlds={caps.extraWorlds}
            showComponents={caps.vocab !== 'simple'}
            launcher={settings.launcher}
            launchAngle={settings.launchAngle}
            launchPower={settings.launchPower}
            trebuchetUnlocked={status.trebuchetUnlocked}
            targetDist={settings.targetDist}
            ringAt={settings.ringDist}
            dropHeight={settings.dropHeight}
            g={sim.g}
            earned={earned}
            onPlaceRing={handlePlaceRing}
            onContextLost={() => setContextLost(true)}
          />
        </Suspense>
      </SceneErrorBoundary>

      <div className="pointer-events-none fixed inset-0 z-10" style={{ background: 'radial-gradient(ellipse at center, transparent 58%, rgba(20, 34, 50, 0.35) 100%)' }} />

      {compact ? (
        <div className="hud pointer-events-none fixed inset-0 z-20">
          <div className={`absolute top-3 right-3 left-3 flex flex-wrap items-center gap-2 transition-opacity duration-300 ${demoStep >= 0 ? 'pointer-events-none opacity-70' : ''}`}>
            <BackToMenu />
            <BandSwitch />
            <ReactionChip onRecalibrate={() => setCalibrating(true)} />
            <ProgressChip compact />
          </div>
          <HudDrawer
            muted={demoStep >= 0}
            tabs={[
              { id: 'controls', label: caps.vocab === 'simple' ? 'Kit' : 'Controls', icon: <SlidersHorizontal className="h-4 w-4" />, content: controlsPanel },
              { id: 'data', label: 'Data', icon: <LineChart className="h-4 w-4" />, badge: readings.length ? String(readings.length) : undefined, badgeTone: 'good' as const, content: dataLab },
              { id: 'missions', label: 'Missions', icon: <Trophy className="h-4 w-4" />, badge: `${doneCount}/${missions.length}`, badgeTone: 'neutral' as const, content: missionCard },
            ]}
          />
          {beat && (
            <div className="absolute inset-x-0 top-14 flex justify-center px-2">
              <EquationBeatCard beat={beat} onClose={() => setBeat(null)} />
            </div>
          )}
          {demoStep >= 0 && (
            <div className="absolute inset-x-0 top-0 bottom-16">
              <MotionDemoOverlay step={demoStep} progress={demoProgress} onSkip={() => finishDemo(false)} />
            </div>
          )}
        </div>
      ) : (
        <div className="hud pointer-events-none fixed inset-0 z-20">
          <div className={`absolute top-4 bottom-4 left-4 flex flex-col items-start gap-2 transition-opacity duration-300 ${demoStep >= 0 ? 'pointer-events-none opacity-70' : ''}`}>
            <div className="shrink-0">
              <ReactionChip onRecalibrate={() => setCalibrating(true)} />
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
          <div className="absolute top-4 right-4 bottom-4 flex w-[min(27rem,calc(100vw-5.5rem))] flex-col items-end gap-2">
            <div className="min-h-0 grow" />
            <div className="min-h-0 shrink">{missionCard}</div>
            {dataLab}
          </div>
          <div className="absolute inset-x-0 top-4 hidden justify-center sm:flex">
            <ViewControls autoOrbit={autoOrbit} onZoom={handleZoomView} onToggleOrbit={handleToggleOrbit} onReset={handleResetView} viewId={viewId} onView={(id) => handleView(id as MotionViewId)} views={MOTION_VIEWS} />
          </div>
          {beat && (
            <div className="absolute inset-x-0 top-20 flex justify-center px-4">
              <EquationBeatCard beat={beat} onClose={() => setBeat(null)} />
            </div>
          )}
          {demoStep >= 0 && <MotionDemoOverlay step={demoStep} progress={demoProgress} onSkip={() => finishDemo(false)} />}
        </div>
      )}

      {!started && <MotionWelcome onStart={handleStart} onDemo={startDemo} />}
      {started && calibrating && demoStep < 0 && (
        <CalibrationCard
          onLamp={(on) => {
            sim.lampOn = on
          }}
          onDone={handleCalibrated}
          onSkip={reactionMs !== null ? () => setCalibrating(false) : undefined}
        />
      )}
      {segueOpen && <SegueCard onClose={() => setSegueOpen(false)} />}
      <InputHints extra={[['LB/RB', 'Roll / Drop']]} />
      <ProgressToasts />
      {contextLost && <WebglFallback />}
    </div>
  )
}
