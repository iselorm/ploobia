import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowLeft, BookOpen, Clock, RotateCcw, Sprout, Swords } from 'lucide-react'
import SceneErrorBoundary from '@/components/SceneErrorBoundary'
import BandSwitch from '@/components/hud/BandSwitch'
import InputHints from '@/components/hud/InputHints'
import ProgressChip from '@/components/hud/ProgressChip'
import ProgressToasts from '@/components/hud/ProgressToasts'
import StereoOverlay from '@/components/hud/StereoOverlay'
import { Tile } from '@/components/ui/tile'
import { cn } from '@/lib/utils'
import { BAND_CAPS, getBand, useBand } from '@/lib/bands'
import { logEvent } from '@/lib/events'
import { checkpointBlip, landChord, loadClick, nudge, startAudio } from '@/lib/audio'
import { useBackHandler, useInputAction } from '@/lib/input'
import { useLayoutTier, usePortraitPhone } from '@/hooks/use-layout'
import TurnCard from '@/components/game/TurnCard'
import { PageCard, type GuideLocation } from '@/components/game/PageCard'
import { SectionLedger } from '@/components/game/SectionLedger'
import { BOOK_0610 } from '@/books/biology'
import { findSection, pagesFor, sectionForStage } from '@/lib/page'
import { registerSugarVerbs } from '@/lib/sugarverbs'
import { noteHandIn, useCurriculum } from '@/lib/curriculum'
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
  bankStarch,
  createSugarSim,
  loadSpecimen,
  makeReading,
  missionProgress,
  missionsForBand,
  simEnv,
  simSolve,
  snapshotTrial,
  stepSim,
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
import {
  ChallengeBrief,
  GatherHud,
  Handover,
  ScoreCard,
  TargetGauge,
  TargetStrip,
  metricPhrase,
  playChallengeFor,
  shortfall,
} from '@/components/sugar/hud/Challenge'
import { DayHud, DayTallyBlock, HatchPlate, type HatchState } from '@/components/sugar/hud/Hatches'
import { buildDay, buildNight, dayTally, endDay, FIRM_TURGOR, startDay, weatherAt, type DayRun, type DayTally, type Weather } from '@/lib/hatches'
import { NightHud, NightTallyBlock, ThermostatPlate, type NightState } from '@/components/sugar/hud/Night'
import { cactusDay, safestCeiling } from '@/lib/hatchesReplay'
import { poreOpening, stomatalGates } from '@/lib/ratelab'
import { bankFromLight, CONDITIONS, dayMetricValue, dayWorldOf, LAB_CONDITIONS, levelForBand, presetIdFor, stageOfPresetId } from '@/lib/sugarchallenge'
import { CAMPAIGN_BY_ID, isStageOpen, recordHandIn, type CampaignStage } from '@/lib/campaign'
import { soloChallenge } from '@/components/sugar/hud/Challenge'
import { useSugarChallenge } from '@/hooks/use-sugar-challenge'
import { challengeId as challengeIdOf, decodeChallenge, type Challenge } from '@/lib/challenge'
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
function ChallengeChip({ onClick, invite = false }: { onClick: () => void; invite?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'atlas-chip pointer-events-auto shrink-0 border-[#C8DFC2] bg-[#E7F1E3] font-extrabold text-[#2F6134] transition-all hover:scale-[1.04] hover:bg-[#DCEBD6] active:scale-95',
        invite && 'atlas-invite',
      )}
    >
      <Swords className="h-3 w-3" />
      Challenge
    </button>
  )
}

/** Capitalise the first letter of a coach line. */
function GuideChip({ onClick, invite = false, open = false }: { onClick: () => void; invite?: boolean; open?: boolean }) {
  return (
    <Tile
      onClick={onClick}
      aria-label="Field guide"
      aria-pressed={open}
      data-testid="guide-chip"
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-extrabold',
        open ? 'border-[#2A2823] bg-[#2A2823] text-[#FBF8EF]' : 'border-[#E4DCC9] bg-[#FCFAF4]/94 text-[#4A4438]',
        invite && !open && 'atlas-invite',
      )}
    >
      <BookOpen className="h-3.5 w-3.5" /> {invite && !open ? 'Explain it' : 'Guide'}
    </Tile>
  )
}

function cap(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/* ------------------------------------------------------------------ */

export default function SugarLine() {
  const sim = useMemo(() => createSugarSim(), [])
  const [band] = useBand()
  const caps = BAND_CAPS[band]
  const tier = useLayoutTier()
  /** The phone tier: the scene owns the frame, panels slide in from the edges. */
  const compact = tier === 'phone'
  const portraitPhone = usePortraitPhone()
  /** Which edge sheet is open on the phone tier, if any. */
  const [sheet, setSheet] = useState<'conditions' | 'data' | 'guide' | null>(null)
  /**
   * The field guide, pulled open from inside the room. While it is open it
   * takes the parts column (decision 2, 11 Sep); the parts come back the
   * moment a practical starts, and the page returns when the round is over
   * to ask for the explanation that closes the hand-in's record.
   */
  const [guide, setGuide] = useState<GuideLocation | null>(null)
  const guideOpenRef = useRef(false)
  guideOpenRef.current = guide !== null
  const curriculum = useCurriculum()
  /** A hit hand-in waiting for its explanation — the guide chip invites. */
  const guideOwed = useMemo(
    () => Object.values(curriculum.pending).some((p) => p.cabinet === 'photosynthesis'),
    [curriculum],
  )
  const stereo = useStereo()

  const [started, setStarted] = useState(false)
  const [contextLost, setContextLost] = useState(false)
  /**
   * How much of the screen bottom the compact sheet is covering. The scene
   * shifts its projection up by half of it, so the specimen stays visible
   * while a control that changes it is open. 0 on desktop and when closed.
   */
  // The phone tier's sheets come in from the sides, so nothing covers the
  // bottom of the scene any more; the lift stays wired for the day the
  // whole-plant stage grows a bottom strip again.
  const [sheetPx] = useState(0)
  const [stage, setStage] = useState<StageId>('plant')
  const [specimenId, setSpecimenId] = useState(sim.specimenId)
  const [conditions, setConditions] = useState<Conditions>({
    light: sim.light,
    co2: sim.co2,
    tempC: sim.tempC,
    soilWater: sim.soilWater,
    night: sim.night,
    girdled: sim.girdled,
    xylemCut: sim.xylemCut,
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
  const keep = run.challenge?.loop === 'keep'
  /** Whether this round opens on the collector — a keep round can (the night shift banks the daylight first). */
  const opensOnGather = (run.challenge?.gatherSeconds ?? 0) > 0
  /** The collector is live through the get-ready beat and the round itself. */
  const gathering = opensOnGather && (run.phase === 'ready' || run.phase === 'gather')
  const inLab = run.phase === 'lab'
  /** A keep round's span: the countdown (when nothing is gathered first) and the span itself. */
  const inDay = keep && ((run.phase === 'ready' && !opensOnGather) || run.phase === 'day')
  /** The span is a night: the sun is off and the thermostat is the learner's. */
  const isNight = !!run.challenge && dayWorldOf(run.challenge).night
  const inChallenge = gathering || run.phase === 'handover' || inLab || inDay
  /* ---- the Hatches' day, mirrored for the HUD ---- */
  const [dayRun, setDayRun] = useState<DayRun | null>(null)
  const [dayWeather, setDayWeather] = useState<Weather | null>(null)
  const [hatchState, setHatchState] = useState<HatchState>({ ceiling: 1, pore: 0, plant: 0, turgor: 1 })
  /* ---- the night shift, mirrored for its HUD ---- */
  const [nightState, setNightState] = useState<NightState>({ bankMg: 0, bankStartMg: 0, sugarMg: 0, totalStartMg: 0, exportRate: 0, velocity: 0, tempC: 20 })
  /** The leaf's whole store at dusk: starch banked plus the free sugar it held. */
  const nightStart = useRef({ starch: 0, total: 0 })
  /** The replay's answers for the tally card, computed once at the end of a day. */
  const [dayExtras, setDayExtras] = useState<{
    safest: { ceiling: number; sugarMg: number } | null
    cactus: DayTally | null
  }>({ safest: null, cactus: null })
  /**
   * The goal metric at the last two trials, for the gauge and the result
   * card. Kept here rather than derived from `readings`, because the metric a
   * challenge targets need not be the instrument the learner has selected.
   */
  const [goalLast, setGoalLast] = useState<number | null>(null)
  const [goalPrev, setGoalPrev] = useState<number | null>(null)
  /**
   * The interval below is keyed on [sim, caps, band] and everything else it
   * reads is a stale closure — the same trap `predictionRef` and `readingsRef`
   * already exist to avoid. The run object is rebuilt every render, so it has
   * to come through a ref or the bank would never be drawn down.
   */
  const runRef = useRef(run)
  runRef.current = run
  const goalLastRef = useRef<number | null>(null)

  /** Whether the learner has opened a challenge this visit — the invite stops once they have. */
  const challengeSeen = useRef(false)
  useEffect(() => {
    if (run.phase !== 'off') challengeSeen.current = true
  }, [run.phase])

  const nextId = useRef(1)
  const lastCompleted = useRef(0)
  const lastAborted = useRef(0)
  const lastTracer = useRef(0)
  const markPassed = useRef(0)
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
    // Fast-forward: a suite on a software renderer cannot wait for a night
    // that advances by frame time. Steps the real `stepSim`, so nothing is
    // faked — only hurried.
    w.__sugarStep = (rawDt = 0.25, times = 1) => {
      for (let i = 0; i < times; i++) stepSim(sim, rawDt)
    }
    return () => {
      delete w.__sugarSim
      delete w.__sugarSolve
      delete w.__sugarStep
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

      /* -- the day, if one is running -- */
      {
        const r = runRef.current
        const d = sim.day
        if (d || sim.stage === 'hatches') {
          const sp = SPECIMEN_BY_ID[sim.specimenId] ?? specimen
          const env = simEnv(sim)
          setHatchState({
            ceiling: sim.hatch,
            pore: poreOpening(sp.leaf, env),
            plant: stomatalGates(sp.leaf, env).plant,
            turgor: sim.turgor,
          })
        }
        if (d && d.spec.night) {
          const so = sim.solve ?? simSolve(sim)
          setNightState({
            bankMg: sim.carbon.leafStarch,
            bankStartMg: nightStart.current.starch,
            sugarMg: sim.carbon.leafSugar,
            totalStartMg: nightStart.current.total,
            exportRate: so.exportRate,
            velocity: so.velocity,
            tempC: sim.tempC,
          })
        }
        if (d) {
          setDayWeather(weatherAt(d.spec, d.hour))
          // A fresh object each tick so React sees the change; the run
          // itself is mutated in place by the sim.
          setDayRun({ ...d })
          if (d.done && r.phase === 'day' && r.challenge) {
            const tally = dayTally(d, sim.turgor)
            const cond = r.challenge.condition ? CONDITIONS[r.challenge.condition] : null
            const world = dayWorldOf(r.challenge)
            const safe = safestCeiling(sim.specimenId, d.spec)
            setDayExtras({
              safest: safe ? { ceiling: safe.ceiling, sugarMg: safe.tally.sugarMg } : null,
              cactus: world.habitat === 'desert' && sim.specimenId !== 'opuntia' ? cactusDay(d.spec.seed, world.hours) : null,
            })
            endDay(sim)
            // Hand the dials back at a sane afternoon, not the dusk the day ended on.
            sim.night = false
            sim.light = 0.6
            sim.humidity = 0.55
            sim.tempC = 24
            sim.paused = false
            setConditions((prev) => ({ ...prev, light: 0.6, night: false, tempC: 24, soilWater: sim.soilWater }))
            // A day spends water; a night spends nothing it was granted — the
            // bank it ran on is the score's own story, not a thrift term.
            const spentNow: Record<string, number> = d.spec.night
              ? {
                  // Thrift on a night is the share of the leaf's store that
                  // was burnt rather than sent: a cooler night scores
                  // thriftier, a hit is not automatically three stars.
                  light: Math.round(
                    ((r.granted.light ?? r.challenge.budget.light ?? 0) *
                      Math.max(0, nightStart.current.total - (sim.carbon.leafStarch + sim.carbon.leafSugar) - tally.exportedMg)) /
                      Math.max(1e-6, nightStart.current.total) *
                      100,
                  ) / 100,
                }
              : { water: Math.round(tally.waterMl * 100) / 100 }
            r.finishDay(tally, dayMetricValue(tally, r.challenge.goal.metric), cond ? cond.met(tally) : true, spentNow)
          }
        }
      }

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
          // The tracer brief is scored on the learner's own timing: a rate
          // trial neither spends a parcel nor offers the gauge a speed it
          // never timed (Run measurement stays available for a rate reading).
          if (r.phase === 'lab' && r.challenge && !sim.demoMode && r.challenge.budget.parcels === undefined) {
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
            const v = metricValue(simSolve(sim), r.challenge.goal.metric)
            // A condition is read off the sim at the moment the trial ends:
            // "leaves still firm" is the leaf's turgor now, not a tally.
            const ok = !r.challenge.condition || (r.challenge.condition === 'leafFirm' ? sim.turgor >= FIRM_TURGOR : true)
            if (!ok) nudge()
            r.offer(v, ok)
            setGoalPrev(goalLastRef.current)
            setGoalLast(v)
            goalLastRef.current = v
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
                xylemCut: sim.xylemCut,
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

      {
        // The split, heard: one blip per mark as the parcel crosses it.
        const past = sim.tracerActive ? (sim.tracerDistance >= sim.tracerMarkB ? 2 : sim.tracerDistance >= sim.tracerMarkA ? 1 : 0) : 0
        if (past > markPassed.current) checkpointBlip()
        markPassed.current = sim.tracerActive ? past : 0
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
          {
            // A timed parcel is a trial of the tracer brief: it was paid for
            // at release, and its speed is what the gauge reads.
            const r = runRef.current
            if (r.phase === 'lab' && r.challenge && r.challenge.goal.metric === 'velocity' && !sim.demoMode) {
              r.offer(reading.y)
              setGoalPrev(goalLastRef.current)
              setGoalLast(reading.y)
              goalLastRef.current = reading.y
            }
          }
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
    const c = capsFor(run.phase === 'lab' || run.phase === 'handover' ? run.granted : run.bank)
    return { light: c.light, co2: co2DialFor(c.co2ppm), soilWater: c.water }
  }, [inChallenge, run.phase, run.granted, run.bank])
  /** The same ceilings in the dials' own units, drawn on the dials themselves. */
  const dialCeilings = useMemo(() => (inLab ? capsFor(run.granted) : null), [inLab, run.granted])
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
      readyLeft: run.readyLeft,
      score: run.score,
      challenge: run.challenge,
      caps: dialCaps,
      goalLast,
    })
    return () => {
      delete w.__sugarRun
    }
  }, [run, dialCaps, goalLast])

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
      // One knife, two blades, one cut: choosing either blade heals the other.
      if (patch.girdled !== undefined) {
        sim.girdled = patch.girdled
        if (patch.girdled) {
          loadClick()
          sim.xylemCut = false
          patch = { ...patch, xylemCut: false }
        }
      }
      if (patch.xylemCut !== undefined) {
        sim.xylemCut = patch.xylemCut
        if (patch.xylemCut) {
          loadClick()
          sim.girdled = false
          patch = { ...patch, girdled: false }
        }
        // Healing the wood lets the leaf drink again; it recovers at the
        // roots' pace, not instantly, so nothing is reset here.
      }
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
      setConditions((prev) => ({ ...prev, girdled: false, xylemCut: false }))
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
      // A page that flies the stage should not also drop a tip on it.
      setTipOpen(!guideOpenRef.current)
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
  // In the tracer brief the parcels are the budget that runs out; when the
  // last one is spent the round is over and the honest move is to hand in.
  const parcelsLeft = run.challenge?.budget.parcels === undefined || (run.bank.parcels ?? 0) >= 1
  const affordable = run.phase !== 'lab' || (canAfford(run.bank, pendingCost) && parcelsLeft)
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
    {
      // The tracer brief grants parcels, and a release spends one: it is the
      // trial the economy term counts, and the one thing the round can run out of.
      const r = runRef.current
      if (r.phase === 'lab' && r.challenge && r.challenge.budget.parcels !== undefined && !sim.demoMode) {
        if (!canAfford(r.bank, { parcels: 1 })) return
        r.spend({ parcels: 1 })
      }
    }
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
      // Water in the pot reaches the leaf only up the wood.
      if (!sim.xylemCut) sim.turgor = Math.max(sim.turgor, next)
      setConditions((prev) => ({ ...prev, soilWater: next }))
      return
    }
    sim.soilWater = 1
    if (!sim.xylemCut) sim.turgor = 1
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
      setGoalLast(null)
      setGoalPrev(null)
      goalLastRef.current = null
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
      sim.xylemCut = false
      setConditions((prev) => ({
        ...prev,
        light: 0,
        co2: ambient,
        soilWater: BASE_SOIL_WATER,
        night: false,
        girdled: false,
        xylemCut: false,
      }))
      const door = stageOfPresetId(presetIdFor(c) ?? '')
      const night = dayWorldOf(c).night
      if (c.loop !== 'keep' && c.gatherSeconds === 0) {
        // Nothing to gather: the whole grant is handed over, so the pot
        // starts as wet as the grant allows rather than at the dry base a
        // gather round begins from — a leaf that goes limp for want of a
        // watering can would fail a brief about a knife.
        const full = capsFor(c.budget)
        sim.soilWater = full.water
        sim.turgor = 1
        sim.light = full.light
        setConditions((prev) => ({ ...prev, soilWater: full.water, light: full.light }))
      }
      if (c.goal.metric === 'velocity') {
        // The tracer brief is played on the speed instrument, whose
        // apparatus the tracer is.
        sim.measure = 'velocity'
        setMeasure('velocity')
      }
      if (c.loop === 'keep' && !night) {
        // A day is played on the stoma; the weather script sets the sky.
        sim.hatch = 1
        sim.paused = false
        if (sim.stage !== 'hatches') handleStage('hatches')
      } else if (night || door === 3) {
        // Door 3 is played on the cut stem — but a night that opens on the
        // collector is gathered in the field first; the handover flies down.
        if (c.gatherSeconds > 0) {
          if (sim.stage !== 'plant') handleStage('plant')
        } else if (sim.stage !== 'stem') handleStage('stem')
      } else if (sim.stage !== 'plant') handleStage('plant')
      run.begin(c)
    },
    [sim, abortTrial, handleStage, run],
  )

  /**
   * The front door.
   *
   * An Explorer goes straight from the card into the countdown, with the
   * band's own level already chosen: the brief was a wall of text between a
   * ten-year-old and the game, and Ploob says the target over the countdown
   * while the gauge shows it the instant the lab opens. A Scientist or an
   * Analyst gets the brief, because the tolerance, the room code and the
   * choice of challenge live there and choosing is part of the work at those
   * ages.
   */
  const handlePlay = useCallback(
    (stage?: CampaignStage) => {
      sim.started = true
      setStarted(true)
      startNarration()
      startAudio()
      const stageId = (stage?.id === 2 || stage?.id === 3 ? stage.id : 1) as 1 | 2 | 3
      if (band === 'explorer') beginChallenge(stage ? soloChallenge(levelForBand(band, stageId)) : playChallengeFor(band))
      else run.open(null, stageId)
    },
    [sim, band, beginChallenge, run],
  )

  /** A hand-in walks the learner through a door. Recorded once per scoring. */
  const scoredFor = useRef<string | null>(null)
  const [doorOpened, setDoorOpened] = useState<CampaignStage | null>(null)
  useEffect(() => {
    if (run.phase !== 'scored' || !run.challenge || !run.score) return
    const key = `${challengeIdOf(run.challenge)}:${run.trials}:${run.score.total}`
    if (scoredFor.current === key) return
    scoredFor.current = key
    const presetId = presetIdFor(run.challenge)
    if (!presetId) return
    const stage = stageOfPresetId(presetId)
    const opened = recordHandIn(presetId, stage, run.score.total)
    setDoorOpened(opened && stage ? (CAMPAIGN_BY_ID[stage + 1] ?? null) : null)
    if (run.score.hit) landChord()
    logEvent('photosynthesis', getBand(), 'challenge.handedIn', {
      presetId,
      stage: stage ?? null,
      score: run.score.total,
      hit: run.score.hit,
    })
    // Three lines of the evidence record land here; the fourth — the
    // explanation — is asked for on the guide's practical page, and only
    // then does anything stamp. A miss records nothing.
    if (run.score.hit) {
      const bandNow = getBand()
      const stamps = new Set<string>()
      for (const ch of BOOK_0610.chapters)
        for (const sec of ch.sections)
          for (const pg of sec.pages)
            if (pg.practical && pg.practical.level[bandNow] === presetId) pg.practical.stamps.forEach((id) => stamps.add(id))
      const g = run.challenge.goal
      noteHandIn({
        cabinet: 'photosynthesis',
        source: presetId,
        action: `light ${Math.round(sim.light * 100)} %, CO₂ ${Math.round(sim.co2 * CO2_MAX_PPM)} ppm, ${Math.round(sim.tempC)} °C, water ${Math.round(sim.soilWater * 100)} %${sim.night ? ', night' : ''}${sim.girdled ? ', ring cut' : ''}${sim.xylemCut ? ', wood cut' : ''}`,
        observed: `${g.metric} ${run.best === null ? '—' : Math.round(run.best * 100) / 100} ${g.unit}`.trim(),
        stamps: [...stamps],
      })
      if (stamps.size) {
        for (const ch of BOOK_0610.chapters)
          for (const sec of ch.sections) {
            const pages = pagesFor(sec, bandNow)
            const i = pages.findIndex((pg) => pg.practical && pg.practical.level[bandNow] === presetId)
            if (i >= 0) {
              setGuide({ sectionId: sec.id, page: i })
              return
            }
          }
      }
    }
  }, [run.phase, run.challenge, run.score, run.trials, sim])

  /**
   * The day starts the moment the countdown ends. The hook owns the phase;
   * the page owns the sim, so this is where the two meet. The stage flies to
   * the stoma, the specimen is the challenge's, and the weather is the
   * seed's.
   */
  useEffect(() => {
    if (run.phase !== 'day' || !run.challenge || sim.day) return
    const world = dayWorldOf(run.challenge)
    if (world.night) {
      // The night shift: the bank is what the gather round put away (or the
      // whole grant, for a band that skipped it), the stem is the stage, and
      // the thermostat starts at a mild evening the learner may move.
      const habitat = SPECIMEN_BY_ID[sim.specimenId]?.leaf.nativeBiome ?? 'temperate'
      const spec = buildNight(run.challenge.seed, habitat, world.hours)
      bankStarch(sim, bankFromLight(run.granted.light ?? run.challenge.budget.light ?? 0))
      nightStart.current = { starch: sim.carbon.leafStarch, total: sim.carbon.leafStarch + sim.carbon.leafSugar }
      setNightState({
        bankMg: sim.carbon.leafStarch,
        bankStartMg: sim.carbon.leafStarch,
        sugarMg: sim.carbon.leafSugar,
        totalStartMg: sim.carbon.leafStarch + sim.carbon.leafSugar,
        exportRate: 0,
        velocity: 0,
        tempC: 20,
      })
      sim.tempC = 20
      setConditions((prev) => ({ ...prev, tempC: 20, night: true, light: 0 }))
      startDay(sim, spec, 1)
      if (sim.stage !== 'stem') handleStage('stem')
      setDayRun({ ...sim.day! })
      setDayWeather(weatherAt(spec, spec.from))
      setDayExtras({ safest: null, cactus: null })
      return
    }
    const spec = buildDay(run.challenge.seed, world.habitat, world.hours)
    startDay(sim, spec, 1)
    setDayRun({ ...sim.day! })
    setDayWeather(weatherAt(spec, spec.from))
    setHatchState((h) => ({ ...h, ceiling: 1, turgor: 1 }))
    setDayExtras({ safest: null, cactus: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.phase, run.challenge])

  // Leaving a challenge mid-day hands the sim its dials back.
  useEffect(() => {
    if (run.phase === 'off' && sim.day) {
      endDay(sim)
      sim.night = false
      sim.paused = false
      sim.light = 0.6
      sim.tempC = 24
      setConditions((prev) => ({ ...prev, night: false, light: 0.6, tempC: 24, soilWater: sim.soilWater }))
      setDayRun(null)
    }
  }, [run.phase, sim])

  const handleHatch = useCallback(
    (ceiling: number) => {
      sim.hatch = Math.max(0, Math.min(1, ceiling))
      setHatchState((h) => ({ ...h, ceiling: sim.hatch }))
    },
    [sim],
  )

  /**
   * The field guide's verbs — what a word on a page can do in this room.
   * Bound to the live handlers so a page goes through the same caps as a
   * slider, and unbound on unmount so no page can move a cabinet that is not
   * on screen.
   */
  useEffect(
    () =>
      registerSugarVerbs({
        stage: handleStage,
        view: handleView,
        patch: patchConditions,
        humidity: (h) => {
          sim.humidity = h
        },
        hatch: (h) => {
          handleStage('hatches')
          handleHatch(h)
        },
        vision: (on) => {
          sim.vision = on
          setVision(on)
        },
        water: handleWater,
        tracer: handleTracer,
        bankStarch: (mg) => bankStarch(sim, mg),
        specimen: handleSpecimen,
        spotlight: (tissue) => {
          sim.spotlight = tissue
          sim.spotlightUntil = sim.time + 3
        },
      }),
    [sim, handleStage, handleView, patchConditions, handleHatch, handleWater, handleTracer, handleSpecimen],
  )

  const openGuide = useCallback(
    (sectionId?: string) => {
      setGuide((g) => {
        if (sectionId) return { sectionId, page: 0 }
        if (g) return g
        const s = sectionForStage(BOOK_0610, sim.stage)
        return { sectionId: s?.id ?? BOOK_0610.chapters[0].sections[0].id, page: 0 }
      })
      setTipOpen(false)
      if (compact) setSheet('guide')
    },
    [sim, compact],
  )
  const guideSection = guide ? findSection(BOOK_0610, guide.sectionId) : undefined
  /** An Explorer's finger on the thumb holds the day; older bands' days do not wait. */
  const handleHold = useCallback(
    (held: boolean) => {
      // Letting go always resumes; only an Explorer's hold pauses, and only
      // while the day is actually running.
      if (!held) {
        sim.paused = false
        return
      }
      if (band !== 'explorer' || !sim.day || sim.day.done) return
      sim.paused = true
    },
    [sim, band],
  )

  const handleCatch = useCallback(
    (kind: SugarResource, amount: number) => {
      run.catchOne(kind, amount)
      catchCount.current += 1
      setCaught({ kind, n: catchCount.current })
    },
    [run],
  )

  // The suite banks catches through the same handler the collector uses.
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    w.__catch = handleCatch
    return () => {
      delete w.__catch
    }
  }, [handleCatch])

  const gatherProps = useMemo(
    () =>
      gathering && run.challenge
        ? {
            seed: run.challenge.seed,
            running: true,
            kinds: (['light', 'co2', 'water'] as SugarResource[]).filter((k) => run.challenge!.budget[k] !== undefined),
            onCatch: handleCatch,
          }
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
          const order: StageId[] = ['plant', 'leaf', 'hatches', 'stem']
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
    () => findBottleneck(specimen, simEnv(sim), sim.carbon, { girdled: conditions.girdled, xylemCut: conditions.xylemCut }),
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

  /**
   * Why the last challenge reading landed where it did, in one sentence:
   * which dials are at their ceiling (that is what you caught) and which
   * still have room. Shared by the coach and the result card so they cannot
   * disagree.
   */
  const ceilingWhy = useMemo(() => {
    if (!dialCeilings || !run.challenge) return null
    const atCap: string[] = []
    const room: string[] = []
    const nearly = (v: number, cap: number) => v >= cap - 0.02
    if (conditions.night) atCap.push('the sun is off')
    else (nearly(conditions.light, dialCeilings.light) ? atCap : room).push('light')
    ;(nearly(conditions.co2, co2DialFor(dialCeilings.co2ppm)) ? atCap : room).push('carbon')
    ;(nearly(conditions.soilWater, dialCeilings.water) ? atCap : room).push('water')
    const list = (xs: string[]) => xs.join(xs.length === 3 ? ', ' : ' and ')
    const hit = run.hit
    if (hit) {
      return room.length
        ? `You hit it with ${list(room)} still in hand. Hand it in, or spend what is left on a cleaner reading.`
        : 'You hit it with every dial at its ceiling. Hand it in.'
    }
    if (atCap.length && room.length)
      return `${cap(list(atCap))} ${atCap.length === 1 && !conditions.night ? 'is' : 'are'} at the ceiling — that is what you caught. ${cap(list(room))} ${room.length === 1 ? 'is not' : 'are not'}. Turn ${room.length === 1 ? 'it' : 'them'} up and run again.`
    if (atCap.length && !room.length)
      return 'Every dial is at its ceiling. Temperature is still free — or go back and gather more.'
    return `Nothing is at its ceiling yet. Turn ${list(room)} up and run again.`
  }, [dialCeilings, run.challenge, run.hit, conditions])

  /**
   * The result card's line for the door-3 briefs, where the jars are not
   * the story: the knife brief answers "which pipe?" and the tracer brief
   * answers "how fast, and why".
   */
  const briefWhy = useMemo(() => {
    const c = run.challenge
    if (!c || run.phase !== 'lab' || goalLast === null) return null
    if (c.condition === 'leafFirm' && c.goal.direction === 'atMost') {
      if (conditions.girdled && !run.lastRefused && goalLast <= c.goal.target + c.goal.tolerance)
        return 'None. The sugar piles up above the ring; the water still climbs the wood, so the leaves stay green — and the roots below the cut starve.'
      if (conditions.xylemCut)
        return 'The wood is cut: nothing reaches the leaves, so they go limp and the line stalls from the top. Sugar stopped for the wrong reason — that reading does not count.'
      if (!conditions.girdled && !conditions.xylemCut) return 'Nothing is cut yet, so the line is running. Choose a blade.'
      return null
    }
    if (c.goal.metric === 'velocity' && c.budget.parcels !== undefined) {
      const d = goalLast - c.goal.target
      if (Math.abs(d) <= c.goal.tolerance) return `${goalLast.toFixed(2)} m h⁻¹ at ${Math.round(conditions.tempC)} °C — in the band. That is the sap's own speed at this temperature, timed by you.`
      return d > 0
        ? `${goalLast.toFixed(2)} m h⁻¹: too fast. Warmer sap is thinner sap, and the same push moves it further — cool it and release another parcel.`
        : `${goalLast.toFixed(2)} m h⁻¹: too slow. Cold sap is thick sap — warm it a little and release another parcel.`
    }
    return null
  }, [run.challenge, run.phase, run.lastRefused, goalLast, conditions.girdled, conditions.xylemCut, conditions.tempC])

  /** One line naming the single next action. */
  const coach = useMemo(() => {
    if (!started) return null
    if (demoStep >= 0) return null
    // Inside a challenge the coach follows the run, not the missions: the
    // chip is the one voice the learner is trained to look for, and a round
    // with nobody talking in it was the whole feature's worst fault.
    if (run.phase === 'lab' && run.challenge) {
      const g = run.challenge.goal
      const target = `Target: ${g.target} ${g.unit} · ${metricPhrase(g.metric)}`
      if (trialRunning) return { text: 'Measuring…', hint: target }
      // The tracer brief: the parcel and the thermometer, not the jars.
      if (g.metric === 'velocity' && run.challenge.budget.parcels !== undefined) {
        if (tracerActive && tracerWatch === 0) return { text: 'Start the stopwatch as the parcel crosses A.', hint: target }
        if (tracerActive && tracerWatch === 1) return { text: 'Stop it on B. The watch counts plant seconds.', hint: target }
        if (tracerActive) return { text: 'Let the parcel run off the end; the reading lands on the gauge.', hint: target }
        const left = run.bank.parcels ?? 0
        if (run.hit) return { text: `On the mark, with ${left} ${left === 1 ? 'parcel' : 'parcels'} left. Hand it in.`, hint: target }
        if (run.trials === 0) return { text: 'Set the temperature, then release a parcel and time it between the marks.', hint: target }
        if (left === 0) return { text: 'No parcels left. Hand in the best run.', hint: target }
        const last = goalLast
        if (last !== null && last > g.target + g.tolerance)
          return { text: `Too fast: ${last.toFixed(2)} m h⁻¹. Colder sap is thicker sap — turn the temperature down and release another.`, hint: target }
        if (last !== null && last < g.target - g.tolerance)
          return { text: `Too slow: ${last.toFixed(2)} m h⁻¹. Warm it a little and release another.`, hint: target }
        return { text: 'Release another parcel.', hint: target }
      }
      // The knife brief: which pipe, and what the leaves say about it.
      if (run.challenge.condition === 'leafFirm' && g.direction === 'atMost') {
        if (conditions.xylemCut) return { text: 'The wood is cut. Watch the leaves — a reading with limp leaves will not count.', hint: target }
        if (run.hit) return { text: 'Sugar stopped, leaves still firm — that is the right pipe. Hand it in, or try the other blade to see the difference.', hint: target }
        if (run.trials === 0) return { text: 'Choose a blade, cut, then press Run measurement.', hint: target }
        if (!conditions.girdled) return { text: 'Nothing is cut. Cut the bark ring and measure below it.', hint: target }
        return { text: ceilingWhy ?? 'Run again.', hint: target }
      }
      if (run.trials === 0)
        return { text: 'Set the dials, then press Run measurement.', hint: target }
      return { text: ceilingWhy ?? 'Run again.', hint: target }
    }
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
    if (conditions.xylemCut)
      return {
        text: 'The wood is cut. Watch the leaves — nothing is coming up to them.',
        hint: 'The sugar pipe is whole, but a leaf with no water cannot hold its pressure. Heal the wood when you have seen it.',
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
    if (readings.length === 1 && run.phase === 'off' && !challengeSeen.current)
      return {
        text: 'That is your first reading. Ready for a challenge?',
        hint: 'Press Challenge, next to the clock — the dials will only go as far as what you catch.',
      }
    const missions = missionsForBand(band)
    const next = missions.find((m) => !m.check(readings))
    if (next) return { text: next.title, hint: next.brief }
    return { text: 'Every mission is done. Try another specimen.', hint: undefined }
  }, [started, demoStep, active, conditions.girdled, conditions.xylemCut, tracerActive, tracerWatch, predictionPending, readings, band, run.phase, run.challenge, run.trials, run.hit, run.bank, goalLast, trialRunning, ceilingWhy])

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
                  onXylem={(on) => patchConditions({ xylemCut: on })}
        onNight={(on) => patchConditions({ night: on })}
      onWater={handleWater}
      embedded={compact}
      ceilings={dialCeilings}
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

  // Held upright: one card, and no Canvas behind it — nothing is spent on a
  // scene nobody can use, and the cabinet mounts the moment the phone turns.
  if (portraitPhone) return <TurnCard line="The Sugar Line runs left to right. It needs the wide way round." />

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
      {!started && (
        <Welcome
          onPlay={handlePlay}
          onStart={handleStart}
          onDemo={startDemo}
          onBook={() => {
            // The chapter is the other way in: the free lab, with the guide open
            // at the door the campaign opens on.
            handleStart()
            window.setTimeout(() => openGuide(), 50)
          }}
        />
      )}

      {/* The gather round takes the whole screen: it is played by dragging
          across the canvas, and any panel is both in the way of the finger and
          in the way of the eye. */}
      {!stereo.on && compact && !gathering && (
        <div className="hud pointer-events-none fixed inset-0 z-20">
          {/* The phone tier (landscape, ≤ ~520 px tall). The scene owns the
              frame: one strip along the top, one toolbar along the bottom,
              and the panels slide in from the edges as sheets — never from
              the bottom, because height is the scarce thing here. The old
              bottom drawer is gone from this cabinet (2026-09-06). */}
          {!inDay && (
          <div
            className={`pointer-events-auto absolute top-2 right-0 left-0 z-30 flex items-center gap-1.5 px-2 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
              inLab && run.challenge ? 'overflow-visible' : 'overflow-x-auto'
            } ${demoStep >= 0 ? 'pointer-events-none opacity-70' : ''}`}
          >
            <BackToMenu />
            <BandSwitch />
            <ClockChip hours={plantHours} rate={clockRate} />
            {inLab && run.challenge ? (
              <TargetStrip
                challenge={run.challenge}
                bank={run.bank}
                best={run.best}
                last={goalLast}
                hit={run.hit}
                trials={run.trials}
                affordable={affordable}
                compact
                refused={run.lastRefused && run.challenge.condition ? LAB_CONDITIONS[run.challenge.condition]?.failLine ?? null : null}
                onFinish={run.finish}
                onQuit={run.close}
              />
            ) : (
              <StageTabs aim={highlight} stage={stage} onStage={handleStage} compact />
            )}
            <ProgressChip compact />
            {!inChallenge && (
              <GuideChip open={sheet === 'guide'} invite={guideOwed} onClick={() => (sheet === 'guide' ? setSheet(null) : openGuide())} />
            )}
            {!inChallenge && (
              <ChallengeChip invite={readings.length > 0 && !challengeSeen.current} onClick={() => run.open(null)} />
            )}
          </div>
          )}

          {/* The edge tabs: one sheet at a time. */}
          {!inDay && (
            <>
              <Tile
                onClick={() => setSheet((v) => (v === 'conditions' ? null : 'conditions'))}
                aria-label="Conditions"
                aria-expanded={sheet === 'conditions'}
                className={cn(
                  'pointer-events-auto absolute top-1/2 z-40 -translate-y-1/2 rounded-r-xl border border-l-0 border-[#E4DCC9] bg-[#FCFAF4]/94 px-1.5 py-3 text-[9.5px] font-black tracking-[0.08em] text-[#5F5A4E] uppercase [writing-mode:vertical-rl] [text-orientation:mixed] transition-[left] duration-200',
                  // The tab rides the sheet's outer edge while it is open, so
                  // the thing that opened it is the thing that closes it.
                  sheet === 'conditions' ? 'left-[16.5rem]' : sheet === 'guide' ? 'left-[17.5rem]' : 'left-0',
                )}
              >
                Conditions
              </Tile>
              <Tile
                onClick={() => setSheet((v) => (v === 'data' ? null : 'data'))}
                aria-label="Data"
                aria-expanded={sheet === 'data'}
                className={cn(
                  'pointer-events-auto absolute top-1/2 z-40 -translate-y-1/2 rotate-180 rounded-r-xl border border-l-0 border-[#E4DCC9] bg-[#FCFAF4]/94 px-1.5 py-3 text-[9.5px] font-black tracking-[0.08em] text-[#5F5A4E] uppercase [writing-mode:vertical-rl] [text-orientation:mixed] transition-[right] duration-200',
                  sheet === 'data' ? 'right-[16.5rem]' : 'right-0',
                )}
              >
                Data{readings.length ? ` · ${readings.length}` : ''}
              </Tile>
              {sheet === 'guide' && guide && guideSection && !inChallenge && (
                <div
                  data-testid="sheet-guide"
                  className="pointer-events-auto absolute top-[2.9rem] bottom-[2.9rem] left-2 flex w-[17rem] flex-col gap-2 overflow-y-auto pr-1"
                >
                  <PageCard
                    book={BOOK_0610}
                    band={band}
                    cabinet="photosynthesis"
                    where={guide}
                    onNavigate={setGuide}
                    onClose={() => setSheet(null)}
                    onStartPractical={(door) => {
                      const st = door === 'plant' ? 1 : door === 'hatches' ? 2 : door === 'stem' ? 3 : null
                      if (!st) return
                      setSheet(null)
                      run.open(null, st)
                    }}
                    compact
                  />
                  <SectionLedger section={guideSection} band={band} embedded />
                </div>
              )}
              {sheet === 'conditions' && (
                <div
                  data-testid="sheet-conditions"
                  className="pointer-events-auto absolute top-[2.9rem] bottom-[2.9rem] left-2 flex w-[16rem] flex-col gap-2 overflow-y-auto pr-1"
                >
                  {conditionsPlate}
                  {specimenRail}
                </div>
              )}
              {sheet === 'data' && (
                <div
                  data-testid="sheet-data"
                  className="pointer-events-auto absolute top-[2.9rem] right-2 bottom-[2.9rem] flex w-[16rem] flex-col gap-2 overflow-y-auto pl-1"
                >
                  {instrumentPlate}
                  {dataPanel}
                  {missionPanel}
                  <LedgerPlate sim={sim} specimen={specimen} caps={caps} embedded />
                  <SpecimenPlate specimen={specimen} caps={caps} bottleneck={bottleneck} embedded />
                </div>
              )}
            </>
          )}

          {/* The scale bar, tucked above the toolbar. */}
          <div className="absolute right-2 bottom-[3.1rem]">
            <ScaleBar label={stageMeta.scale.label} />
          </div>

          {/* The one toolbar: the parts this door needs, Run wearing the aim
              ring, and Hand in when a round is on. */}
          {!inDay && (
          <div
            data-testid="toolbar"
            className={`pointer-events-auto absolute right-2 bottom-2 left-2 flex h-[2.5rem] items-center gap-1 overflow-x-auto rounded-full border border-[#E4DCC9] bg-[#FCFAF4]/94 px-2 backdrop-blur-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
              demoStep >= 0 ? 'pointer-events-none opacity-70' : ''
            }`}
          >
            <Tile
              onClick={() => patchConditions({ night: !conditions.night })}
              aria-label={conditions.night ? 'Switch to day' : 'Switch to night'}
              aria-pressed={conditions.night}
              className={cn('shrink-0 rounded-full border px-2.5 py-1 text-[10.5px] font-black', conditions.night ? 'border-[#3A4466] bg-[#232C46] text-[#EDE7D9]' : 'border-[#E4DCC9] bg-[#F6F2E8] text-[#5F5A4E]')}
            >
              {conditions.night ? '☾ Night' : '☀ Day'}
            </Tile>
            <Tile
              onClick={() => patchConditions({ girdled: !conditions.girdled })}
              aria-label={conditions.girdled ? 'Heal the phloem ring' : 'Cut the phloem ring'}
              className={cn('shrink-0 rounded-full border px-2.5 py-1 text-[10.5px] font-black', conditions.girdled ? 'border-[#EDC2BC] bg-[#F7E3E0] text-[#9A302A]' : 'border-[#E4DCC9] bg-[#F6F2E8] text-[#5F5A4E]')}
            >
              ✂ {conditions.girdled ? 'Heal ring' : 'Bark ring'}
            </Tile>
            <Tile
              onClick={() => patchConditions({ xylemCut: !conditions.xylemCut })}
              aria-label={conditions.xylemCut ? 'Heal the wood' : 'Cut the wood'}
              className={cn('shrink-0 rounded-full border px-2.5 py-1 text-[10.5px] font-black', conditions.xylemCut ? 'border-[#EDC2BC] bg-[#F7E3E0] text-[#9A302A]' : 'border-[#E4DCC9] bg-[#F6F2E8] text-[#5F5A4E]')}
            >
              ✂ {conditions.xylemCut ? 'Heal wood' : 'Wood'}
            </Tile>
            <Tile
              onClick={handleTracer}
              aria-label="Release the tracer"
              disabled={tracerActive}
              className="shrink-0 rounded-full border border-[#E4DCC9] bg-[#F6F2E8] px-2.5 py-1 text-[10.5px] font-black text-[#5F5A4E] disabled:opacity-50"
            >
              ◉ {tracerActive ? 'Running…' : 'Tracer'}
            </Tile>
            {tracerActive && (
              <Tile
                onClick={handleWatch}
                aria-label="Stopwatch"
                className="shrink-0 rounded-full border border-[#2A2823] bg-[#2A2823] px-2.5 py-1 text-[10.5px] font-black text-[#FBF5EA]"
              >
                {tracerWatch === 0 ? '▶ Start at A' : tracerWatch === 1 ? `■ Stop at B · ${tracerSeconds.toFixed(0)} s` : '↺ Reset'}
              </Tile>
            )}
            <span className="flex-1" />
            <Tile
              onClick={handleRunTrial}
              aria-label="Run measurement"
              disabled={trialRunning || !affordable}
              className={cn('atlas-aim-ring shrink-0 rounded-full bg-[#2F6134] px-3 py-1 text-[11px] font-black text-[#FBF5EA] disabled:opacity-50')}
            >
              {trialRunning ? `Measuring ${Math.round(trialProgress * 100)}%` : '▶ Run measurement'}
            </Tile>
            {inLab && run.challenge && (
              <Tile
                onClick={run.finish}
                aria-label="Hand it in"
                disabled={run.trials === 0}
                className="shrink-0 rounded-full border border-[#2F6134] bg-[#E7F1E3] px-2.5 py-1 text-[10.5px] font-black text-[#2F6134] disabled:opacity-50"
              >
                ⚑ Hand in
              </Tile>
            )}
          </div>
          )}

          {coach && !reveal && !gathering && !inDay && run.phase !== 'handover' && (
            <div className="pointer-events-none absolute right-12 bottom-[3.1rem] left-12 flex justify-center">
              <Coach text={coach.text} hint={coach.hint} />
            </div>
          )}
        </div>
      )}

      {!stereo.on && !compact && !gathering && (
        <div className="hud pointer-events-none fixed inset-0 z-20">
          {/* Left column. */}
          <div
            className={`absolute top-4 bottom-4 left-4 flex ${tier === 'tablet' ? 'w-[16.5rem]' : 'w-[19.5rem]'} flex-col gap-2 transition-opacity duration-300 ${
              demoStep >= 0 ? 'pointer-events-none opacity-70' : inDay ? 'pointer-events-none opacity-35' : ''
            }`}
          >
            <div className="pointer-events-auto flex flex-wrap items-center gap-2">
              <BackToMenu />
              <BandSwitch />
            </div>
            <div className="pointer-events-auto flex flex-wrap items-center gap-2">
              <ClockChip hours={plantHours} rate={clockRate} />
              <ProgressChip compact />
              {!inChallenge && (
              <ChallengeChip invite={readings.length > 0 && !challengeSeen.current} onClick={() => run.open(null)} />
            )}
              {!inChallenge && (
                <GuideChip open={!!guide} invite={guideOwed} onClick={() => (guide ? setGuide(null) : openGuide())} />
              )}
            </div>
            {/* The field guide takes the parts column while the learner reads;
                the parts come back the moment a practical starts. */}
            {guide && guideSection && !inChallenge ? (
              <div className="pointer-events-auto flex min-h-0 flex-1 flex-col">
                <PageCard
                  book={BOOK_0610}
                  band={band}
                  cabinet="photosynthesis"
                  where={guide}
                  onNavigate={setGuide}
                  onClose={() => setGuide(null)}
                  onStartPractical={(door) => {
                    const st = door === 'plant' ? 1 : door === 'hatches' ? 2 : door === 'stem' ? 3 : null
                    if (!st) return
                    run.open(null, st)
                  }}
                />
              </div>
            ) : (
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
                  onXylem={(on) => patchConditions({ xylemCut: on })}
                  onNight={(on) => patchConditions({ night: on })}
                  onWater={handleWater}
                  ceilings={dialCeilings}
                />
              </div>
            </div>
            )}
          </div>

          {/* Top centre: the three stages, then the tool rail — or, inside a
              challenge, the target gauge in the stages' place. */}
          {/* The top strip steps aside for a span (a day on the hatches, a
              night on the stem): the span's own HUD owns the top, and a
              learner mid-night has no business changing stage. */}
          {!inDay && (
          <div
            className={cn(
              'pointer-events-none absolute top-4 flex flex-col items-center gap-2',
              // With the target plate up, the centre stack moves right of it and
              // the tabs shrink to pills: plate, tabs and rail share the band
              // between the columns instead of stacking on one another.
              inLab && run.challenge
                ? tier === 'tablet'
                  ? 'right-[18rem] left-[34.5rem]'
                  : 'right-[21rem] left-[39.5rem]'
                : 'left-1/2 -translate-x-1/2',
            )}
          >
            <div className="pointer-events-auto">
              <StageTabs aim={highlight} stage={stage} onStage={handleStage} compact={!!(inLab && run.challenge)} />
            </div>
            <div className="pointer-events-auto">{rail}</div>
            <p className="atlas-serif max-w-[26rem] text-center text-[11.5px] leading-snug text-[#8B8471] italic">
              {stageMeta.hint}
            </p>
          </div>
          )}

          {/* The target plate: top-left of the scene, beside the conditions
              that move it, for the length of the round. The tabs stay — a
              learner mid-round can still see where they are. (Chosen over the
              gauge-in-the-strip of doors 1–2 on 2026-09-06; the Foundry uses
              the same slot.) */}
          {inLab && run.challenge && (
            <div className={cn('pointer-events-auto absolute top-4', tier === 'tablet' ? 'left-[18rem] w-[15rem]' : 'left-[21rem] w-[16rem]')}>
              <TargetGauge
                challenge={run.challenge}
                bank={run.bank}
                best={run.best}
                last={goalLast}
                hit={run.hit}
                trials={run.trials}
                affordable={affordable}
                compact
                fold={false}
                refused={run.lastRefused && run.challenge.condition ? LAB_CONDITIONS[run.challenge.condition]?.failLine ?? null : null}
                onFinish={run.finish}
                onQuit={run.close}
              />
            </div>
          )}

          {/* Right column.
              The instruments stay pinned at the top and everything else takes
              turns underneath. Stacked, the five plates ran a thousand pixels
              tall and pushed "Run measurement" — the one control the whole
              cabinet is built around — below the fold on a 900 px screen. */}
          {/* During a span the lab steps back: the game owns the frame, and a
              column at full strength was the lab fighting it for attention. */}
          <div
            className={cn(
              'pointer-events-auto absolute top-4 right-4 bottom-4 flex flex-col gap-2 pl-1 transition-opacity duration-300',
              tier === 'tablet' ? 'w-[16.5rem]' : 'w-[19.5rem]',
              inDay && 'pointer-events-none opacity-35',
            )}
          >
            {/* The instruments are pinned, but capped: they grow as bands and
                readings add rows, and an uncapped pinned block pushes the tab
                below it clean off the screen — which is exactly how "Run
                measurement" ended up at y≈934 on a 900px display once already. */}
            {guide && guideSection && !inChallenge && (
              <div className="shrink-0">
                <SectionLedger section={guideSection} band={band} />
              </div>
            )}
            <div className="max-h-[calc(100%-9.5rem)] shrink-0 overflow-y-auto pr-0.5">
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
          {tipOpen && !inDay && !inLab && (
            <div className={cn('absolute bottom-4', tier === 'tablet' ? 'left-[18rem]' : 'left-[21rem]')}>
              <TipCard stage={stage} onClose={() => setTipOpen(false)} />
            </div>
          )}

          <div className="absolute right-[21rem] bottom-5">
            <ScaleBar label={stageMeta.scale.label} />
          </div>

          {coach && !reveal && !gathering && !inDay && run.phase !== 'handover' && (
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
            challenge={
              inLab && run.challenge && goalLast !== null
                ? {
                    value: goalLast,
                    unit: run.challenge.goal.unit,
                    target: run.challenge.goal.target,
                    phrase: metricPhrase(run.challenge.goal.metric),
                    hit: shortfall(run.challenge, goalLast).hit,
                    gap: shortfall(run.challenge, goalLast).text,
                    previous: goalPrev,
                    why: briefWhy ?? ceilingWhy ?? '',
                    trials: run.trials,
                    onHandIn: () => {
                      setReveal(null)
                      run.finish()
                    },
                  }
                : null
            }
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
          stage={run.stage}
          onBegin={beginChallenge}
          onClose={run.close}
        />
      )}

      {!stereo.on && gathering && run.challenge && (
        <GatherHud
          secondsLeft={run.secondsLeft}
          total={run.challenge.gatherSeconds}
          readyLeft={run.readyLeft}
          ready={run.phase === 'ready'}
          bank={run.bank}
          budget={run.challenge.budget}
          caught={caught}
          challenge={run.challenge}
          onDone={run.endGather}
        />
      )}

      {!stereo.on && run.phase === 'handover' && run.challenge && (
        <Handover challenge={run.challenge} granted={run.granted} onEnter={run.enterLab} />
      )}

      {/* ---- the Hatches' day ---- */}
      {!stereo.on && inDay && run.challenge && isNight && (
        <>
          <NightHud
            challenge={run.challenge}
            run={dayRun}
            state={nightState}
            ready={run.phase === 'ready'}
            readyLeft={run.readyLeft}
            band={band}
            compact={compact}
            onQuit={run.close}
          />
          <div
            className={cn(
              'pointer-events-none fixed inset-x-0 z-30 flex justify-center px-3',
              compact ? 'bottom-3' : 'bottom-5',
            )}
          >
            <ThermostatPlate
              tempC={conditions.tempC}
              canHold={band === 'explorer'}
              onChange={(t) => patchConditions({ tempC: t })}
              onHold={handleHold}
              compact={compact}
            />
          </div>
        </>
      )}

      {!stereo.on && inDay && run.challenge && !isNight && (
        <>
          <DayHud
            challenge={run.challenge}
            run={dayRun}
            weather={dayWeather}
            hatch={hatchState}
            ready={run.phase === 'ready'}
            readyLeft={run.readyLeft}
            band={band}
            compact={compact}
            onQuit={run.close}
          />
          <div
            className={cn(
              'pointer-events-none fixed inset-x-0 z-30 flex justify-center px-3',
              compact ? 'bottom-3' : 'bottom-5',
            )}
          >
            <HatchPlate
              hatch={hatchState}
              wilted={hatchState.turgor < 0.35}
              canHold={band === 'explorer'}
              onChange={handleHatch}
              onHold={handleHold}
              compact={compact}
            />
          </div>
        </>
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
          opened={doorOpened}
          onNext={() => {
            const next = doorOpened
            if (!next || !isStageOpen(next.id)) return
            setDoorOpened(null)
            const stageId = (next.id === 2 || next.id === 3 ? next.id : 1) as 1 | 2 | 3
            if (band === 'explorer') beginChallenge(soloChallenge(levelForBand(band, stageId)))
            else {
              run.close()
              run.open(null, stageId)
            }
          }}
          tally={
            run.tally ? (
              isNight ? (
                <NightTallyBlock
                  challenge={run.challenge}
                  tally={run.tally}
                  bankStartMg={nightState.bankStartMg}
                  totalStartMg={nightState.totalStartMg}
                  totalEndMg={nightState.bankMg + nightState.sugarMg}
                  tempC={nightState.tempC}
                />
              ) : (
                <DayTallyBlock challenge={run.challenge} tally={run.tally} safest={dayExtras.safest} cactus={dayExtras.cactus} />
              )
            ) : null
          }
        />
      )}

      {!stereo.on && <InputHints extra={[['LB/RB', 'Plant / leaf / stem']]} />}
      {!stereo.on && (
        <ProgressToasts clearLeft={!compact && inLab && run.challenge ? (tier === 'tablet' ? 'left-[33rem]' : 'left-[37rem]') : null} />
      )}
      {contextLost && <WebglFallback />}
    </div>
  )
}
