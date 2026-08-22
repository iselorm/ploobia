import { Suspense, lazy, useCallback, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { getSim, type Highlight } from '@/lib/sim'
import { applyDemand, setDemand } from '@/lib/journey'
import { startAudio } from '@/lib/audio'
import {
  BODYCELL_FACTS,
  PLATELET_FACTS,
  RBC_FACTS,
  WBC_KINDS,
  WBC_ROSTER,
  createFactRotator,
  type CellType,
} from '@/lib/facts'
import { useLayoutMode, useMinWidth } from '@/hooks/use-layout'
import HudDrawer from '@/components/hud/HudDrawer'
import { FlaskConical, Gauge, Info } from 'lucide-react'
import SceneErrorBoundary, { WebglFallback } from '@/components/SceneErrorBoundary'
import WelcomeOverlay from '@/components/hud/WelcomeOverlay'
import ControlPanel, { type Settings } from '@/components/hud/ControlPanel'
import FactCard, { type ActiveFact } from '@/components/hud/FactCard'
import CounterChip from '@/components/hud/CounterChip'
import JourneyChip from '@/components/hud/JourneyChip'
import RaceHud from '@/components/hud/RaceHud'
import StoryCard from '@/components/hud/StoryCard'
import AboutCard from '@/components/hud/AboutCard'
import DeliveryLab from '@/components/hud/DeliveryLab'

const BloodVesselScene = lazy(() => import('@/components/scene/BloodVesselScene'))

function SceneFallback() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#2E080B]">
      <p className="animate-pulse text-sm font-bold text-[#FBF5EA]/80">Warming up the bloodstream…</p>
    </div>
  )
}

/** Tiny chip linking back to the Ploobia hall. */
function BackToMenu({ iconOnly = false }: { iconOnly?: boolean }) {
  return (
    <Link
      to="/"
      aria-label="Back to Ploobia"
      className={`pointer-events-auto flex items-center gap-1.5 rounded-full border border-[#F3E9D7]/60 bg-[#FBF5EA]/70 font-extrabold text-[#7A5252] shadow-lg backdrop-blur-md transition-all hover:scale-[1.04] hover:text-[#C13B33] ${
        iconOnly ? 'h-9 w-9 justify-center' : 'px-3 py-1.5 text-[11px]'
      }`}
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {!iconOnly && 'Back to Ploobia'}
    </Link>
  )
}

export default function BloodVoyage() {
  // Mutable simulation state shared with the render loop (never re-renders).
  const sim = getSim()

  const [started, setStarted] = useState(false)
  const [settings, setSettings] = useState<Settings>({
    demand: 0,
    density: 1500,
    paused: false,
    labels: true,
  })
  const [highlighted, setHighlighted] = useState<Highlight | null>(null)
  const [activeFact, setActiveFact] = useState<ActiveFact | null>(null)
  const [contextLost, setContextLost] = useState(false)
  const layout = useLayoutMode()
  // Side columns need real room. Below 1024 px the left controls and the right
  // data column meet in the middle and cover the centre HUD, so the bottom
  // drawer takes over well before the platform's `compact` breakpoint.
  const roomy = useMinWidth(1024)
  const compact = layout === 'compact' || !roomy

  const rotators = useMemo(
    () => ({
      rbc: createFactRotator(RBC_FACTS),
      platelet: createFactRotator(PLATELET_FACTS),
      bodycell: createFactRotator(BODYCELL_FACTS),
    }),
    [],
  )
  // Each white cell on the track is a specific type with its own job, so it
  // gets its own rotator rather than a shared "white blood cell" pool.
  const wbcRotators = useMemo(
    () => WBC_ROSTER.map((k) => createFactRotator(WBC_KINDS[k].facts)),
    [],
  )
  const factKey = useRef(0)

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      // `demand` is not a sim field — it drives heart rate, flow and
      // extraction through the journey model instead.
      const { demand, ...simPatch } = patch
      Object.assign(sim, simPatch)
      if (demand !== undefined) setDemand(sim, demand)
      setSettings((prev) => ({ ...prev, ...patch }))
    },
    [sim],
  )

  const handleCellClick = useCallback(
    (type: CellType, id: number) => {
      setHighlighted({ type, id })
      if (type === 'wbc') {
        const kind = WBC_KINDS[WBC_ROSTER[id] ?? 'neutrophil']
        setActiveFact({
          type,
          title: kind.name,
          color: kind.accent,
          text: (wbcRotators[id] ?? wbcRotators[0])(),
          key: ++factKey.current,
        })
        return
      }
      setActiveFact({ type, text: rotators[type](), key: ++factKey.current })
    },
    [rotators, wbcRotators],
  )

  const handleCloseFact = useCallback(() => {
    setActiveFact(null)
    setHighlighted(null)
  }, [])

  const handleStart = useCallback(() => {
    startAudio() // browsers only allow sound from inside a real gesture
    applyDemand(sim) // heart rate / flow / breathing follow the dial from t=0
    Object.assign(sim, { started: true })
    setStarted(true)
  }, [sim])

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#2E080B]">
      {/* 3D scene */}
      <SceneErrorBoundary>
        <Suspense fallback={<SceneFallback />}>
          <BloodVesselScene
            sim={sim}
            highlighted={highlighted}
            labelsOn={settings.labels}
            onCellClick={handleCellClick}
            onContextLost={() => setContextLost(true)}
          />
        </Suspense>
      </SceneErrorBoundary>

      {/* Warm vignette */}
      <div
        className="pointer-events-none fixed inset-0 z-10"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 52%, rgba(40, 6, 8, 0.55) 100%)',
        }}
      />

      {/* HUD */}
      <div className="hud pointer-events-none fixed inset-0 z-20">
        <div className="absolute top-4 left-4 flex flex-col items-start gap-2">
          <JourneyChip sim={sim} />
          {!compact && (
            <>
              <CounterChip sim={sim} />
              <BackToMenu />
            </>
          )}
        </div>
        {/* On phones the back control becomes an icon in the free top-right
            corner, so it never sits under the race strip. */}
        {compact && (
          <div className="absolute top-4 right-4">
            <BackToMenu iconOnly />
          </div>
        )}
        {started && (
          <div
            className={`absolute inset-x-0 flex justify-center px-4 ${
              compact ? 'bottom-[8.5rem]' : 'bottom-8 pl-[20rem] pr-[23rem]'
            }`}
          >
            <StoryCard sim={sim} />
          </div>
        )}
        {started && (
          <div className="absolute inset-x-0 top-28 flex justify-center sm:top-4">
            <RaceHud sim={sim} />
          </div>
        )}
        {/* Wide layouts keep the side panels; phones and short windows get the
            platform bottom drawer instead, so the tunnel keeps the screen. */}
        {!compact && (
          <>
            <div className="absolute bottom-4 left-4">
              <ControlPanel settings={settings} onChange={updateSettings} />
            </div>
            <div className="absolute right-4 bottom-4 hidden max-h-[calc(100vh-2rem)] flex-col gap-2 overflow-y-auto md:flex">
              <DeliveryLab />
              <AboutCard />
            </div>
          </>
        )}
        {activeFact && (
          <div
            className={`absolute inset-x-0 flex justify-center px-4 ${
              compact ? 'bottom-[8.5rem]' : 'bottom-8 pl-[20rem] pr-[23rem]'
            }`}
          >
            <FactCard fact={activeFact} onClose={handleCloseFact} />
          </div>
        )}
        {compact && (
          <div className="pointer-events-auto absolute inset-x-0 bottom-0">
            <HudDrawer
              tabs={[
                {
                  id: 'controls',
                  label: 'Controls',
                  icon: <Gauge className="h-4 w-4" />,
                  content: (
                    <ControlPanel settings={settings} onChange={updateSettings} embedded />
                  ),
                },
                {
                  id: 'data',
                  label: 'Data',
                  icon: <FlaskConical className="h-4 w-4" />,
                  content: <DeliveryLab embedded />,
                },
                {
                  id: 'about',
                  label: 'About',
                  icon: <Info className="h-4 w-4" />,
                  content: <AboutCard embedded />,
                },
              ]}
            />
          </div>
        )}
      </div>

      {!started && <WelcomeOverlay onStart={handleStart} />}
      {contextLost && <WebglFallback />}
    </div>
  )
}
