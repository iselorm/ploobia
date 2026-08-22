import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowLeft, Atom, LineChart, RotateCcw, SlidersHorizontal, Trophy } from 'lucide-react'
import { BAND_CAPS, getBand, useBand } from '@/lib/bands'
import { logEvent } from '@/lib/events'
import { useBackHandler } from '@/lib/input'
import { useLayoutMode, useShortViewport } from '@/hooks/use-layout'
import {
  addressLogic,
  applyBuild,
  ATOM_DEMO,
  CATEGORY_META,
  roomInOuterShell,
  commonNeutrons,
  createAtomSim,
  ELEMENT_BY_Z,
  fireProbe,
  forgePlace,
  INTRO_STEPS,
  MAX_Z,
  outerElectrons,
  PERIOD_OF,
  shellsFor,
  stabilityOf,
  type AtomDemoApi,
  type AtomMissionContext,
  type AtomViewId,
  type GripReading,
  type PlacedBuild,
} from '@/lib/atoms'
import SceneErrorBoundary from '@/components/SceneErrorBoundary'
import BandSwitch from '@/components/hud/BandSwitch'
import InputHints from '@/components/hud/InputHints'
import HudDrawer from '@/components/hud/HudDrawer'
import ProgressToasts from '@/components/hud/ProgressToasts'
import ProgressChip from '@/components/hud/ProgressChip'
import ViewControls from '@/components/photo/hud/ViewControls'
import AtomPanel from '@/components/atoms/hud/AtomPanel'
import AtomDataLab from '@/components/atoms/hud/AtomDataLab'
import {
  AtomAboutCard,
  AtomDemoOverlay,
  AtomFactCard,
  AtomMissionCard,
  AtomTicker,
  AtomWelcome,
  CoachChip,
  ElementPop,
  IntroCards,
  elementFact,
  nextObjectFact,
  type ActiveAtomFact,
} from '@/components/atoms/hud/AtomCards'
import { ATOM_VIEWS } from '@/components/atoms/AtomCamera'
import type { ParticleKind } from '@/components/atoms/Dispensers'

const AtomScene = lazy(() => import('@/components/atoms/AtomScene'))

function SceneFallback() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#4A3826]">
      <p className="animate-pulse text-sm font-bold text-[#FBF5EA]/80">Lighting the foundry…</p>
    </div>
  )
}

function WebglFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#4A3826] p-6">
      <div className="w-full max-w-md rounded-[28px] border border-[#F3E9D7] bg-[#FBF5EA] p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#B97D10]/10">
          <Atom className="h-7 w-7 text-[#B97D10]" />
        </div>
        <h2 className="text-xl font-black text-[#402222]">The furnace went cold</h2>
        <p className="mt-2 text-sm leading-relaxed font-semibold text-[#7A5252]">Your browser could not start the 3D foundry (WebGL is unavailable or crashed). Try reloading, or use a browser with WebGL enabled.</p>
        <button onClick={() => window.location.reload()} className="mx-auto mt-5 flex items-center gap-2 rounded-full bg-[#B97D10] px-6 py-3 text-sm font-extrabold text-[#FBF5EA] shadow transition-all hover:bg-[#95650C] active:scale-95">
          <RotateCcw className="h-4 w-4" />
          Relight the foundry
        </button>
      </div>
    </div>
  )
}

function BackToMenu() {
  return (
    <Link to="/" className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-[#F3E9D7] bg-[#FBF5EA]/90 px-3 py-1.5 text-[11px] font-extrabold text-[#7A5252] shadow-lg backdrop-blur-md transition-all hover:scale-[1.04] hover:text-[#B97D10]">
      <ArrowLeft className="h-3.5 w-3.5" />
      Back to Ploobia
    </Link>
  )
}

interface BuildState {
  protons: number
  neutrons: number
  electrons: number
}

export default function AtomFoundry() {
  const sim = useMemo(() => createAtomSim(), [])
  const [band] = useBand()
  const caps = BAND_CAPS[band]
  const layout = useLayoutMode()
  const compact = layout === 'compact'
  const short = useShortViewport(900)

  const [started, setStarted] = useState(false)
  const [contextLost, setContextLost] = useState(false)
  const [build, setBuild] = useState<BuildState>({ protons: 0, neutrons: 0, electrons: 0 })
  const [cloudView, setCloudView] = useState(false)
  const [predicted, setPredicted] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [readings, setReadings] = useState<GripReading[]>([])
  const [builds, setBuilds] = useState<PlacedBuild[]>([])
  const [discovered, setDiscovered] = useState<number[]>([])
  const [probed, setProbed] = useState<Record<number, number>>({})
  const [ionHeld, setIonHeld] = useState(false)
  const [shellOpened, setShellOpened] = useState(false)
  const [probing, setProbing] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [lastGrip, setLastGrip] = useState<number | null>(null)
  const [fact, setFact] = useState<ActiveAtomFact | null>(null)
  const [factSummonZ, setFactSummonZ] = useState<number | null>(null)
  const [elementPop, setElementPop] = useState<{ z: number; a: number } | null>(null)
  const [autoOrbit, setAutoOrbit] = useState(false)
  const [viewId, setViewId] = useState<AtomViewId>('overview')
  const [demoStep, setDemoStep] = useState(-1)
  const [demoProgress, setDemoProgress] = useState(0)
  const [introStep, setIntroStep] = useState<number | null>(null)
  const introSeen = useRef(false)
  const probeExplained = useRef(false)

  const nextId = useRef(1)
  const factKey = useRef(1)
  const lastProbeDone = useRef(0)
  const lastPlaceDone = useRef(0)
  const lastCompleteSeq = useRef(0)
  const popTimer = useRef(0)
  const pendingForge = useRef<{ z: number; neutrons: number } | null>(null)
  const predictedRef = useRef<number | null>(null)
  predictedRef.current = predicted
  const buildRef = useRef(build)
  buildRef.current = build
  const noticeTimer = useRef(0)
  const demoSnapshot = useRef<{ discovered: number[]; probed: Record<number, number>; readingCutoff: number } | null>(null)

  useEffect(() => {
    logEvent('atoms', getBand(), 'session.started', {})
    // Exposed for the Playwright harness (verify-atoms.mjs).
    ;(window as unknown as { __atomSim?: unknown }).__atomSim = sim
  }, [sim])

  const showNotice = useCallback((text: string) => {
    setNotice(text)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 5000)
  }, [])

  /* ---- build changes ---- */
  const updateBuild = useCallback(
    (patch: Partial<BuildState>) => {
      setBuild((prev) => {
        const next = { ...prev, ...patch }
        next.protons = Math.max(0, Math.min(MAX_Z, next.protons))
        next.neutrons = Math.max(0, Math.min(30, next.neutrons))
        next.electrons = Math.max(0, Math.min(MAX_Z + 2, next.electrons))
        // Explorer never juggles neutrons: the common isotope loads itself.
        if (!BAND_CAPS[getBand()].isotopes && patch.protons !== undefined) {
          next.neutrons = commonNeutrons(next.protons)
        }
        if (next.protons === 0 && patch.protons !== undefined) next.neutrons = BAND_CAPS[getBand()].isotopes ? next.neutrons : 0
        applyBuild(sim, next)
        // A learner opening a second shell is a mission moment.
        if (!sim.demoMode && shellsFor(next.electrons).length >= 2) setShellOpened(true)
        return next
      })
    },
    [sim],
  )

  const handleAdd = useCallback(
    (kind: ParticleKind) => {
      if (sim.placing) return
      const b = buildRef.current
      if (kind === 'proton') updateBuild({ protons: b.protons + 1 })
      else if (kind === 'neutron') updateBuild({ neutrons: b.neutrons + 1 })
      else updateBuild({ electrons: b.electrons + 1 })
    },
    [sim, updateBuild],
  )

  /* ---- facts (defined early: the probe explainer fires from handleProbe) ---- */
  const openObjectFact = useCallback((kind: 'nucleus' | 'electron' | 'wall' | 'probe') => {
    const accents = { nucleus: '#E8A33D', electron: '#63E0FF', wall: '#B97D10', probe: '#1E9BBF' }
    setFactSummonZ(null)
    setFact({ fact: nextObjectFact(kind), accent: accents[kind], key: factKey.current++ })
  }, [])

  const openTileFact = useCallback((z: number) => {
    const f = elementFact(z)
    if (!f) return
    setFactSummonZ(z)
    setFact({ fact: f, accent: CATEGORY_META[ELEMENT_BY_Z[z].category].tint, key: factKey.current++ })
  }, [])

  const summon = useCallback(
    (z: number) => {
      updateBuild({ protons: z, neutrons: commonNeutrons(z), electrons: z })
      setFact(null)
      showNotice(`${ELEMENT_BY_Z[z].name} summoned back to the stage.`)
    },
    [updateBuild, showNotice],
  )

  /* ---- ion held (charge ±1 kept steady for a moment) ---- */
  useEffect(() => {
    const charge = build.protons - build.electrons
    if (sim.demoMode || build.protons === 0 || build.electrons === 0 || Math.abs(charge) !== 1) return
    const t = window.setTimeout(() => setIonHeld(true), 2500)
    return () => window.clearTimeout(t)
  }, [build, sim])

  /* ---- probe / forge ---- */
  const handleProbe = useCallback(() => {
    const b = buildRef.current
    if (b.protons < 1) {
      showNotice('Nothing on the stage yet — add particles first.')
      return
    }
    if (b.electrons !== b.protons) {
      showNotice('The probe reads neutral atoms only — balance electrons against protons first.')
      return
    }
    if (fireProbe(sim, BAND_CAPS[getBand()].noise)) {
      setProbing(true)
      // First firing: explain what the instrument actually measures.
      if (!probeExplained.current && !sim.demoMode) {
        probeExplained.current = true
        openObjectFact('probe')
      }
      if (predictedRef.current !== null && !sim.demoMode) {
        logEvent('atoms', getBand(), 'prediction.committed', { variable: 'grip', x: b.protons, predicted: predictedRef.current, kind: 'point' })
      }
    }
  }, [sim, showNotice, openObjectFact])

  const handleForge = useCallback(() => {
    const b = buildRef.current
    if (forgePlace(sim)) {
      pendingForge.current = { z: b.protons, neutrons: b.neutrons }
      setPlacing(true)
      // Pull back to the overview so the flight to the wall is actually seen.
      if (sim.viewId === 'stage') {
        sim.viewId = 'overview'
        sim.viewSeq += 1
        setViewId('overview')
      }
    }
  }, [sim])

  const handleReset = useCallback(() => {
    updateBuild({ protons: 0, neutrons: 0, electrons: 0 })
    setPredicted(null)
  }, [updateBuild])

  /* ---- poll the sim for finished animations ---- */
  useEffect(() => {
    const t = window.setInterval(() => {
      if (sim.probeDone !== lastProbeDone.current) {
        lastProbeDone.current = sim.probeDone
        setProbing(false)
        const z = sim.probeZ
        const el = ELEMENT_BY_Z[z]
        const y = sim.probeValue
        setLastGrip(y)
        setProbed((prev) => ({ ...prev, [z]: y }))
        const pred = predictedRef.current
        const reading: GripReading = {
          id: nextId.current++,
          z,
          symbol: el?.symbol ?? '?',
          period: PERIOD_OF[z] ?? 1,
          outer: outerElectrons(z),
          y,
          repeats: [y],
          predicted: pred,
        }
        setReadings((prev) => [...prev, reading])
        setPredicted(null)
        if (!sim.demoMode) {
          logEvent('atoms', getBand(), 'reading.recorded', {
            variable: 'grip',
            x: z,
            y,
            repeats: [y],
            uncertainty: Math.round(y * BAND_CAPS[getBand()].noise),
            controls: { neutrons: buildRef.current.neutrons },
            predicted: pred,
            predictionClose: pred === null ? null : Math.abs(pred - y) <= Math.abs(y) * 0.15,
            anomalous: false,
          })
        }
      }
      if (sim.completeSeq !== lastCompleteSeq.current) {
        lastCompleteSeq.current = sim.completeSeq
        if (!sim.demoMode) {
          setElementPop({ z: sim.lastCompleteZ, a: sim.lastCompleteZ + buildRef.current.neutrons })
          window.clearTimeout(popTimer.current)
          popTimer.current = window.setTimeout(() => setElementPop(null), 3800)
        }
      }
      if (sim.placeDone !== lastPlaceDone.current) {
        lastPlaceDone.current = sim.placeDone
        setPlacing(false)
        const forged = pendingForge.current
        pendingForge.current = null
        if (forged) {
          setBuilds((prev) => [...prev, { id: nextId.current++, z: forged.z, neutrons: forged.neutrons }])
          setDiscovered([...sim.discovered])
          updateBuild({ protons: 0, neutrons: 0, electrons: 0 })
        }
      }
    }, 90)
    return () => window.clearInterval(t)
  }, [sim, updateBuild])

  /* ---- missions ---- */
  const ctx = useMemo<AtomMissionContext>(() => ({ readings, builds, ionHeld, shellOpened }), [readings, builds, ionHeld, shellOpened])

  /* ---- the coach: one line that always says the next move ---- */
  const coach = useMemo(() => {
    if (!started || demoStep >= 0 || placing || probing || introStep !== null) return null
    const { protons, neutrons, electrons } = build
    if (protons === 0 && electrons === 0) return { text: 'Tap the glowing amber crucible — or its + button — to drop in your first proton.', glow: false }
    if (protons === 0) return { text: 'Electrons need a nucleus to orbit — add a proton first.', glow: false }
    const el = ELEMENT_BY_Z[protons]
    const charge = protons - electrons
    if (charge > 0) {
      const room = roomInOuterShell(electrons)
      const seat =
        electrons === 0
          ? ' The first ring seats 2.'
          : room === 0
            ? ' The outer ring is full — the next one starts a new ring.'
            : room !== null
              ? ` Room for ${room} more in the outer ring.`
              : ''
      return { text: `Charge +${charge}: add ${charge} more electron${charge === 1 ? '' : 's'} (cyan) to balance it.${seat}`, glow: false }
    }
    if (charge < 0) return { text: `Charge ${charge}: that's an ion — remove ${-charge} electron${charge === -1 ? '' : 's'} to get back to a neutral atom.`, glow: false }
    if (caps.isotopes && el && stabilityOf(protons, neutrons) !== 'stable')
      return { text: `${el.name}'s nucleus is shaking — a stable one has ${el.stableN.join(' or ')} neutrons.`, glow: false }
    if (el && probed[protons] === undefined) return { text: `${el.name} complete! Fire the grip probe to measure how hard it holds its outer electron.`, glow: true }
    if (el && !discovered.includes(protons)) {
      const addr = addressLogic(electrons)
      const where = addr ? ` Its address: row ${addr.row} (${addr.rowWhy}), column ${addr.col} (${addr.colWhy}).` : ''
      return { text: `Measured! Now press “Forge into the wall”.${where}`, glow: true }
    }
    if (el) return { text: `${el.name} is on the wall! Clear the stage and forge the next element — or try an isotope or an ion.`, glow: false }
    return null
  }, [started, demoStep, placing, probing, introStep, build, caps, probed, discovered])

  /* ---- camera ---- */
  const handleView = useCallback(
    (id: AtomViewId) => {
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

  useBackHandler(
    useCallback(() => {
      if (fact) {
        setFact(null)
        return true
      }
      return false
    }, [fact]),
  )

  /* ---- guided demo ---- */
  const demoApi = useMemo<AtomDemoApi>(
    () => ({
      set: (patch) => updateBuild(patch),
      get: () => buildRef.current,
      probe: () => handleProbe(),
      probeBusy: () => sim.probing,
      place: () => handleForge(),
      placeBusy: () => !!sim.placing,
      view: (v) => handleView(v),
      resetView: () => handleResetView(),
      setAutoOrbit: (on) => {
        sim.autoOrbit = on
        setAutoOrbit(on)
      },
    }),
    [updateBuild, handleProbe, handleForge, handleView, handleResetView, sim],
  )

  const startDemo = useCallback(() => {
    sim.started = true
    sim.demoMode = true
    demoSnapshot.current = { discovered: [...sim.discovered], probed: { ...probed }, readingCutoff: nextId.current }
    setStarted(true)
    setDemoProgress(0)
    setDemoStep(0)
  }, [sim, probed])

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
      logEvent('atoms', getBand(), 'demo.watched', { completed })
      sim.demoMode = false
      sim.autoOrbit = false
      setAutoOrbit(false)
      setDemoStep(-1)
      setDemoProgress(0)
      // The demo's atoms are examples, not evidence: wipe what it forged.
      const snap = demoSnapshot.current
      if (snap) {
        sim.discovered = new Set(snap.discovered)
        sim.probedGrip = new Map(Object.entries(snap.probed).map(([k, v]) => [Number(k), v]))
        setDiscovered(snap.discovered)
        setProbed(snap.probed)
        setReadings((prev) => prev.filter((r) => r.id < snap.readingCutoff))
        setBuilds((prev) => prev.filter((b) => b.id < snap.readingCutoff))
      }
      setLastGrip(null)
      updateBuild({ protons: 0, neutrons: 0, electrons: 0 })
      handleResetView()
      // The demo teaches the controls; the intro teaches the concepts. Anyone
      // who has not read it yet gets it at handover.
      if (!introSeen.current) {
        introSeen.current = true
        setIntroStep(0)
      }
    },
    [sim, updateBuild, handleResetView],
  )

  useEffect(() => {
    if (demoStep < 0) return
    if (demoStep >= ATOM_DEMO.length) {
      finishDemo(true)
      return
    }
    const step = ATOM_DEMO[demoStep]
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

  const handleStart = useCallback(() => {
    sim.started = true
    setStarted(true)
    if (!introSeen.current) {
      introSeen.current = true
      setIntroStep(0)
    }
  }, [sim])

  /* ---- panels ---- */
  const controlsPanel = (
    <AtomPanel
      build={build}
      status={{ probing, placing, lastGrip, predicted }}
      cloudView={cloudView}
      notice={notice}
      onChange={updateBuild}
      onProbe={handleProbe}
      onForge={handleForge}
      onPredict={setPredicted}
      onReset={handleReset}
      onDemo={startDemo}
      onCloud={setCloudView}
      embedded={compact}
    />
  )
  const dataLab = (
    <AtomDataLab
      readings={readings}
      onDelete={(id) => setReadings((prev) => prev.filter((r) => r.id !== id))}
      onClear={() => setReadings([])}
      embedded={compact}
    />
  )
  const missionCard = <AtomMissionCard ctx={ctx} embedded={compact} />

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#4A3826]">
      <SceneErrorBoundary>
        <Suspense fallback={<SceneFallback />}>
          <AtomScene
            sim={sim}
            protons={build.protons}
            neutrons={build.neutrons}
            electrons={build.electrons}
            cloudView={cloudView && caps.electronCloud}
            showMass={caps.isotopes}
            showNeutrons={caps.isotopes}
            discovered={discovered}
            probed={probed}
            onAdd={handleAdd}
            onTile={openTileFact}
            onFact={openObjectFact}
            onContextLost={() => setContextLost(true)}
          />
        </Suspense>
      </SceneErrorBoundary>

      <div className="pointer-events-none fixed inset-0 z-10" style={{ background: 'radial-gradient(ellipse at center, transparent 62%, rgba(46, 32, 16, 0.28) 100%)' }} />

      {compact ? (
        <div className="hud pointer-events-none fixed inset-0 z-20">
          <div className={`absolute top-3 right-3 left-3 flex flex-wrap items-center gap-2 transition-opacity duration-300 ${demoStep >= 0 ? 'pointer-events-none opacity-70' : ''}`}>
            <BackToMenu />
            <BandSwitch />
            <ProgressChip compact />
          </div>
          <HudDrawer
            muted={demoStep >= 0}
            tabs={[
              { id: 'controls', label: caps.vocab === 'simple' ? 'Forge' : 'Controls', icon: <SlidersHorizontal className="h-4 w-4" />, content: controlsPanel },
              { id: 'data', label: 'Data', icon: <LineChart className="h-4 w-4" />, badge: readings.length ? String(readings.length) : undefined, badgeTone: 'good' as const, content: dataLab },
              { id: 'missions', label: 'Missions', icon: <Trophy className="h-4 w-4" />, content: missionCard },
            ]}
          />
          {fact && (
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center px-2 pb-16">
              <AtomFactCard active={fact} onClose={() => setFact(null)} onSummon={factSummonZ !== null ? () => summon(factSummonZ) : undefined} />
            </div>
          )}
          {elementPop && (
            <div className="absolute inset-x-0 top-16 z-30 px-2">
              <ElementPop z={elementPop.z} a={elementPop.a} />
            </div>
          )}
          {coach && (
            <div className="absolute inset-x-0 bottom-[4.4rem] px-3">
              <CoachChip text={coach.text} glow={coach.glow} />
            </div>
          )}
          {demoStep >= 0 && (
            <div className="absolute inset-x-0 top-0 bottom-16">
              <AtomDemoOverlay step={demoStep} progress={demoProgress} onSkip={() => finishDemo(false)} />
            </div>
          )}
        </div>
      ) : (
        <div className="hud pointer-events-none fixed inset-0 z-20">
          <div className={`absolute top-4 bottom-4 left-4 flex flex-col items-start gap-2 transition-opacity duration-300 ${demoStep >= 0 ? 'pointer-events-none opacity-70' : ''}`}>
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
          <div className="absolute top-4 right-4 bottom-4 flex w-[min(23rem,calc(100vw-5.5rem))] flex-col items-end gap-2">
            {!short && <AtomAboutCard />}
            {!short && <AtomTicker />}
            <div className="min-h-0 grow" />
            <div className="min-h-0 shrink">{missionCard}</div>
            {dataLab}
          </div>
          <div className="absolute inset-x-0 top-4 hidden justify-center sm:flex">
            <ViewControls autoOrbit={autoOrbit} onZoom={handleZoomView} onToggleOrbit={handleToggleOrbit} onReset={handleResetView} viewId={viewId} onView={(id) => handleView(id as AtomViewId)} views={ATOM_VIEWS} />
          </div>
          {fact && (
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center px-4">
              <AtomFactCard active={fact} onClose={() => setFact(null)} onSummon={factSummonZ !== null ? () => summon(factSummonZ) : undefined} />
            </div>
          )}
          {elementPop && (
            <div className="absolute inset-x-0 top-28 z-30">
              <ElementPop z={elementPop.z} a={elementPop.a} />
            </div>
          )}
          {coach && (
            <div className="absolute inset-x-0 bottom-5">
              <CoachChip text={coach.text} glow={coach.glow} />
            </div>
          )}
          {demoStep >= 0 && <AtomDemoOverlay step={demoStep} progress={demoProgress} onSkip={() => finishDemo(false)} />}
        </div>
      )}

      {!started && <AtomWelcome onStart={handleStart} onDemo={startDemo} />}
      {introStep !== null && (
        <IntroCards
          step={introStep}
          onNext={() => setIntroStep((s) => (s !== null && s + 1 < INTRO_STEPS.length ? s + 1 : null))}
          onSkip={() => setIntroStep(null)}
        />
      )}
      <InputHints />
      <ProgressToasts />
      {contextLost && <WebglFallback />}
    </div>
  )
}
