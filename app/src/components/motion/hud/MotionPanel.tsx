import { useState } from 'react'
import {
  ArrowDownToLine,
  ChevronDown,
  Circle,
  Eye,
  Globe2,
  Lock,
  MoveRight,
  PlayCircle,
  Radar,
  Rocket,
  RotateCcw,
  Ruler,
  ScanLine,
  SlidersHorizontal,
  Target,
  Timer,
  Zap,
} from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { Tile } from '@/components/ui/tile'
import { useBandCaps } from '@/lib/bands'
import { useReactionMs } from '@/lib/practical'
import {
  DROP_MAX,
  DROP_MIN,
  landingSpeed,
  MARKERS,
  MASSES,
  PUSH_MAX,
  PUSH_MIN,
  PUSHES,
  SURFACES,
  WORLDS,
  type LabMode,
  type MassId,
  type SurfaceId,
  type WorldId,
} from '@/lib/motion'
import { ANGLE_MAX, ANGLE_MIN, LAUNCHER_BY_ID, LAUNCHERS, TARGETS, VENUES, type LauncherId, type VenueId } from '@/lib/yard'

export interface MotionSettings {
  mode: LabMode
  world: WorldId
  venue: VenueId
  visionOn: boolean
  surface: SurfaceId
  mass: MassId
  push: number
  target: number
  useGates: boolean
  gateDist: number
  dropHeight: number
  paired: boolean
  sensorOn: boolean
  launcher: LauncherId
  launchAngle: number
  launchPower: number
  targetDist: number
  ringDist: number | null
}

export interface MotionStatus {
  rolling: boolean
  dropping: boolean
  launching: boolean
  swRunning: boolean
  swElapsed: number
  flick: number | null
  gatesUnlocked: boolean
  padUnlocked: boolean
  sensorUnlocked: boolean
  trebuchetUnlocked: boolean
  /** Live launch speed the current settings would give, m/s. */
  launchSpeed: number
  /** Last landing, if any: for the readout under the fire button. */
  lastRange: number | null
  lastTof: number | null
  lastGap: number | null
}

interface Props {
  settings: MotionSettings
  status: MotionStatus
  orderPrediction: 'heavy' | 'light' | 'same' | null
  speedPrediction: number | null
  notice: string | null
  onChange: (patch: Partial<MotionSettings>) => void
  onPush: () => void
  onRelease: (paired: boolean) => void
  onFire: () => void
  onTap: () => void
  onResetWatch: () => void
  onOrderPredict: (o: 'heavy' | 'light' | 'same') => void
  onSpeedPredict: (v: number | null) => void
  onDemo: () => void
  onRecalibrate: () => void
  embedded?: boolean
}

const chip = (active: boolean) =>
  `rounded-full px-2.5 py-1 text-[10.5px] font-extrabold transition-all duration-200 ${active ? 'text-[#FBF5EA] shadow' : 'bg-[#F3E9D7] text-[#7A5252] hover:bg-[#EBDFC8]'}`
const chipStyle = (active: boolean, tint = '#2E6DA8') => (active ? { background: tint } : undefined)
const heading = 'mb-1.5 flex items-center gap-1.5 text-[10.5px] font-black tracking-widest text-[#7A5252] uppercase'

/**
 * The stopwatch tile. Taps are stamped on pointerdown so the reading is the
 * learner's real latency; the click that follows a pointerdown is swallowed,
 * while synthetic clicks (gamepad A, keyboard Enter) still work.
 */
function StopwatchTile({ status, onTap, onReset }: { status: MotionStatus; onTap: () => void; onReset: () => void }) {
  const [swallow, setSwallow] = useState(false)
  const caps = useBandCaps()
  const reaction = useReactionMs()
  const flick = status.flick
  const flickText =
    flick === null
      ? null
      : Math.abs(flick) < 0.12
        ? `on it (${flick >= 0 ? '+' : ''}${flick.toFixed(2)} s)`
        : flick > 0
          ? `late by ${flick.toFixed(2)} s`
          : `early by ${Math.abs(flick).toFixed(2)} s`
  return (
    <div className="rounded-[16px] border border-[#D3E2F0] bg-[#EDF4FA] p-2.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10.5px] font-black tracking-widest text-[#2E6DA8] uppercase">
          <Timer className="h-3.5 w-3.5" /> Stopwatch
        </span>
        <span className="text-[10px] font-bold text-[#5E7F97]">space bar works too</span>
      </div>
      <div className="mt-1.5 flex items-stretch gap-2">
        <button
          data-testid="stopwatch"
          aria-label={status.swRunning ? 'Stop the stopwatch' : 'Start the stopwatch'}
          onPointerDown={(e) => {
            if (e.button !== 0 && e.pointerType === 'mouse') return
            setSwallow(true)
            onTap()
          }}
          onClick={() => {
            if (swallow) {
              setSwallow(false)
              return
            }
            onTap()
          }}
          className={`tile flex min-h-[64px] flex-1 flex-col items-center justify-center rounded-[14px] px-3 py-2 text-[#FBF5EA] shadow transition-colors select-none ${status.swRunning ? 'bg-[#C13B33]' : 'bg-[#2E6DA8]'}`}
          style={{ touchAction: 'manipulation' }}
        >
          <span className="text-[26px] leading-none font-black tabular-nums" data-testid="stopwatch-reading">
            {status.swElapsed.toFixed(2)}
          </span>
          <span className="mt-1 text-[10px] font-black tracking-widest uppercase">{status.swRunning ? 'STOP' : 'START'}</span>
        </button>
        <Tile round onClick={onReset} aria-label="Reset the stopwatch" className="flex items-center justify-center self-center rounded-full bg-[#F3E9D7] text-[#7A5252] hover:bg-[#EBDFC8]">
          <RotateCcw className="h-4 w-4" />
        </Tile>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[10.5px] font-bold">
        <span className={flick === null ? 'text-[#B08A7A]' : Math.abs(flick) < 0.12 ? 'text-[#2E7D32]' : flick > 0 ? 'text-[#B97D10]' : 'text-[#2E6DA8]'} data-testid="flick">
          {flickText ?? 'tap on the event you are timing'}
        </span>
        {caps.reactionFeedback !== 'flick' && reaction !== null && (
          <span className="flex items-center gap-1 text-[#5E7F97]">
            <Zap className="h-3 w-3 text-[#E8A33D]" /> yours ≈ {(reaction / 1000).toFixed(2)} s
          </span>
        )}
      </div>
    </div>
  )
}

export default function MotionPanel({
  settings,
  status,
  orderPrediction,
  speedPrediction,
  notice,
  onChange,
  onPush,
  onRelease,
  onFire,
  onTap,
  onResetWatch,
  onOrderPredict,
  onSpeedPredict,
  onDemo,
  onRecalibrate,
  embedded = false,
}: Props) {
  const caps = useBandCaps()
  const [open, setOpen] = useState(() => (typeof window === 'undefined' ? true : window.innerWidth > 720))
  const simple = caps.vocab === 'simple'
  const worlds = WORLDS.filter((w) => !w.extra || caps.extraWorlds)

  if (!open && !embedded) {
    return (
      <Tile onClick={() => setOpen(true)} aria-label="Open controls" className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-[#F3E9D7] bg-[#FBF5EA]/90 shadow-xl backdrop-blur-md transition-transform duration-200 hover:scale-105 active:scale-95">
        <SlidersHorizontal className="h-5 w-5 text-[#2E6DA8]" />
      </Tile>
    )
  }

  const tabBtn = (active: boolean) =>
    `flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-extrabold transition-all duration-200 ${active ? 'bg-[#2E6DA8] text-[#FBF5EA] shadow' : 'bg-[#F3E9D7] text-[#7A5252] hover:bg-[#EBDFC8]'}`

  return (
    <div
      className={
        embedded
          ? 'pointer-events-auto w-full px-1 pb-1'
          : 'pointer-events-auto max-h-full w-[20rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-[22px] border border-[#F3E9D7] bg-[#FBF5EA]/92 p-4 shadow-xl backdrop-blur-md'
      }
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Ruler className="h-4 w-4 text-[#2E6DA8]" />
          <span className="text-[13px] font-extrabold tracking-wide text-[#402222] uppercase">Motion yard</span>
        </div>
        {!embedded && (
          <Tile round onClick={() => setOpen(false)} aria-label="Collapse controls" className="flex items-center justify-center rounded-full text-[#7A5252] transition-colors hover:bg-[#F3E9D7]">
            <ChevronDown className="h-4 w-4" />
          </Tile>
        )}
      </div>

      <div className="mb-2 flex gap-2">
        <button onClick={() => onChange({ mode: 'roll' })} className={tabBtn(settings.mode === 'roll')}>
          <MoveRight className="h-3.5 w-3.5" /> Drive
        </button>
        <button onClick={() => onChange({ mode: 'launch' })} className={tabBtn(settings.mode === 'launch')} data-testid="tab-launch">
          <Rocket className="h-3.5 w-3.5" /> Launch
        </button>
        <button onClick={() => onChange({ mode: 'drop' })} className={tabBtn(settings.mode === 'drop')}>
          <ArrowDownToLine className="h-3.5 w-3.5" /> Drop
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => onChange({ visionOn: !settings.visionOn })}
          className={chip(settings.visionOn)}
          style={chipStyle(settings.visionOn, '#0F8A7A')}
          aria-pressed={settings.visionOn}
          data-testid="vision-toggle"
        >
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3 w-3" /> Physics Vision
          </span>
        </button>
        {VENUES.map((v) => (
          <button key={v.id} onClick={() => onChange({ venue: v.id })} className={chip(settings.venue === v.id)} style={chipStyle(settings.venue === v.id, '#6E5A9E')} title={v.blurb} aria-pressed={settings.venue === v.id} data-testid={`venue-${v.id}`}>
            {v.label}
          </button>
        ))}
      </div>

      <div className="space-y-3.5">
        {settings.mode !== 'launch' && <StopwatchTile status={status} onTap={onTap} onReset={onResetWatch} />}

        {/* ---- Gravity dial ---- */}
        <div>
          <div className={heading}>
            <Globe2 className="h-3 w-3" /> Gravity dial
          </div>
          <div className="flex flex-wrap gap-1.5">
            {worlds.map((w) => (
              <button key={w.id} onClick={() => onChange({ world: w.id })} className={chip(settings.world === w.id)} style={chipStyle(settings.world === w.id)} title={w.note} aria-pressed={settings.world === w.id}>
                {w.label} {caps.quantitative && <span className="opacity-70">{w.g.toFixed(1)}</span>}
              </button>
            ))}
          </div>
          {caps.quantitative && <p className="mt-1 text-[10px] font-bold text-[#B08A7A]">g in m/s² — the speed a falling thing gains every second.</p>}
        </div>

        {settings.mode === 'roll' && (
          <>
            {/* ---- Lane ---- */}
            <div>
              <div className={heading}>
                <MoveRight className="h-3 w-3" /> Lane surface
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SURFACES.map((s) => (
                  <button key={s.id} onClick={() => onChange({ surface: s.id })} className={chip(settings.surface === s.id)} style={chipStyle(settings.surface === s.id)} aria-pressed={settings.surface === s.id}>
                    {s.label} {caps.quantitative && <span className="opacity-70">μ {s.mu}</span>}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className={heading}>
                <Zap className="h-3 w-3" /> Push
              </div>
              {simple ? (
                <div className="flex flex-wrap gap-1.5">
                  {PUSHES.map((p) => (
                    <button key={p.label} onClick={() => onChange({ push: p.v0 })} className={chip(Math.abs(settings.push - p.v0) < 1e-6)} style={chipStyle(Math.abs(settings.push - p.v0) < 1e-6)} aria-pressed={Math.abs(settings.push - p.v0) < 1e-6}>
                      {p.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-[12px] px-2 py-1.5">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[12px] font-bold text-[#7A5252]">Launch speed</span>
                    <span className="rounded-full bg-[#F3E9D7] px-2 py-0.5 text-[11px] font-extrabold text-[#2E6DA8] tabular-nums">{settings.push.toFixed(1)} m/s</span>
                  </div>
                  <Slider value={[settings.push]} min={PUSH_MIN} max={PUSH_MAX} step={0.1} onValueChange={([v]) => onChange({ push: v })} aria-label="Launch speed" />
                </div>
              )}
            </div>
            <div>
              <div className={heading}>
                <Ruler className="h-3 w-3" /> Time it to
              </div>
              <div className="flex flex-wrap gap-1.5">
                {MARKERS.map((d) => (
                  <button key={d} onClick={() => onChange({ target: d })} className={chip(Math.abs(settings.target - d) < 1e-6)} style={chipStyle(Math.abs(settings.target - d) < 1e-6, '#B97D10')} aria-pressed={Math.abs(settings.target - d) < 1e-6}>
                    {d.toFixed(1)} m
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] font-bold text-[#B08A7A]">
                {simple ? 'The glowing line is your finish. Start the watch at the red line, stop it at the glow.' : 'START as the car crosses the red start line, STOP as it crosses the glowing line.'}
              </p>
            </div>
            <div>
              <div className={heading}>
                <ScanLine className="h-3 w-3" /> Timing gates
                {!status.gatesUnlocked && <Lock className="h-3 w-3 text-[#B08A7A]" />}
              </div>
              {status.gatesUnlocked ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button onClick={() => onChange({ useGates: !settings.useGates })} className={chip(settings.useGates)} style={chipStyle(settings.useGates, '#C13B33')} aria-pressed={settings.useGates}>
                    {settings.useGates ? 'Gates on' : 'Gates off'}
                  </button>
                  {settings.useGates &&
                    MARKERS.map((d) => (
                      <button key={d} onClick={() => onChange({ gateDist: d })} className={chip(Math.abs(settings.gateDist - d) < 1e-6)} style={chipStyle(Math.abs(settings.gateDist - d) < 1e-6, '#C13B33')} aria-pressed={Math.abs(settings.gateDist - d) < 1e-6}>
                        {d.toFixed(1)} m
                      </button>
                    ))}
                </div>
              ) : (
                <p className="text-[10.5px] font-bold text-[#B08A7A]">Locked. {simple ? 'Time a run first.' : 'Time the same run three times first — you have to feel the spread before the machine fixes it.'}</p>
              )}
            </div>
            <Tile
              onClick={onPush}
              disabled={status.rolling}
              data-testid="push"
              className={`flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-[13px] font-black text-[#FBF5EA] shadow transition-all ${status.rolling ? 'bg-[#8FA9C4]' : 'bg-[#2E6DA8] hover:bg-[#245685]'}`}
            >
              <MoveRight className="h-4 w-4" /> {status.rolling ? 'Driving…' : 'Send the car'}
            </Tile>
          </>
        )}

        {settings.mode === 'launch' && (
          <>
            {/* ---- The launch family ---- */}
            <div>
              <div className={heading}>
                <Rocket className="h-3 w-3" /> Launcher
              </div>
              <div className="flex flex-wrap gap-1.5">
                {LAUNCHERS.map((l) => {
                  const locked = l.locked && !status.trebuchetUnlocked
                  return (
                    <button
                      key={l.id}
                      onClick={() => !locked && onChange({ launcher: l.id })}
                      className={chip(settings.launcher === l.id)}
                      style={chipStyle(settings.launcher === l.id, '#B9541E')}
                      title={locked ? 'It stands dark at the pad. Hit the target ring to earn it.' : l.blurb}
                      aria-pressed={settings.launcher === l.id}
                      aria-disabled={locked}
                      data-testid={`launcher-${l.id}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {locked && <Lock className="h-3 w-3" />} {l.label}
                      </span>
                    </button>
                  )
                })}
              </div>
              {LAUNCHER_BY_ID[settings.launcher].locked && !status.trebuchetUnlocked && null}
            </div>
            {/* Power */}
            <div className="rounded-[12px] px-2 py-1.5">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[12px] font-bold text-[#7A5252]">{LAUNCHER_BY_ID[settings.launcher].power.label}</span>
                <span className="rounded-full bg-[#F3E9D7] px-2 py-0.5 text-[11px] font-extrabold text-[#B9541E] tabular-nums">
                  {settings.launchPower.toFixed(2).replace(/\.?0+$/, '')} {LAUNCHER_BY_ID[settings.launcher].power.unit}
                </span>
              </div>
              <Slider
                value={[settings.launchPower]}
                min={LAUNCHER_BY_ID[settings.launcher].power.min}
                max={LAUNCHER_BY_ID[settings.launcher].power.max}
                step={LAUNCHER_BY_ID[settings.launcher].power.step}
                onValueChange={([v]) => onChange({ launchPower: v })}
                aria-label={LAUNCHER_BY_ID[settings.launcher].power.label}
              />
            </div>
            {/* Angle */}
            {LAUNCHER_BY_ID[settings.launcher].fixedAngle === undefined ? (
              <div className="rounded-[12px] px-2 py-1.5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[12px] font-bold text-[#7A5252]">Launch angle</span>
                  <span className="rounded-full bg-[#F3E9D7] px-2 py-0.5 text-[11px] font-extrabold text-[#B9541E] tabular-nums">{settings.launchAngle.toFixed(0)}°</span>
                </div>
                <Slider value={[settings.launchAngle]} min={ANGLE_MIN} max={ANGLE_MAX} step={1} onValueChange={([v]) => onChange({ launchAngle: v })} aria-label="Launch angle" />
              </div>
            ) : (
              <p className="px-2 text-[10.5px] font-bold text-[#B08A7A]">The trebuchet releases at 45° — the counterweight is your variable.</p>
            )}
            <div className="flex items-center justify-between rounded-[12px] border border-[#E5D8F0] bg-[#F5F0FA] px-2.5 py-1.5">
              <span className="text-[10.5px] font-black tracking-widest text-[#6E5A9E] uppercase">Launch speed</span>
              <span className="text-[13px] font-black text-[#6E5A9E] tabular-nums" data-testid="launch-speed">
                {status.launchSpeed.toFixed(1)} m/s
              </span>
            </div>
            {/* Ball */}
            <div>
              <div className={heading}>
                <Circle className="h-3 w-3" /> Ball
              </div>
              <div className="flex flex-wrap gap-1.5">
                {MASSES.map((m) => (
                  <button key={m.id} onClick={() => onChange({ mass: m.id })} className={chip(settings.mass === m.id)} style={chipStyle(settings.mass === m.id)} aria-pressed={settings.mass === m.id}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Target ring */}
            <div>
              <div className={heading}>
                <Target className="h-3 w-3" /> Target ring
              </div>
              <div className="flex flex-wrap gap-1.5">
                {TARGETS.map((d) => (
                  <button key={d} onClick={() => onChange({ targetDist: d })} className={chip(Math.abs(settings.targetDist - d) < 1e-6)} style={chipStyle(Math.abs(settings.targetDist - d) < 1e-6, '#B97D10')} aria-pressed={Math.abs(settings.targetDist - d) < 1e-6}>
                    {d.toFixed(1)} m
                  </button>
                ))}
              </div>
            </div>
            {/* Landing call */}
            <div className="rounded-[14px] border border-[#D0EAE6] bg-[#EDF8F6] px-2.5 py-2">
              <div className="text-[10px] font-black tracking-widest text-[#0F8A7A] uppercase">Call the landing — tap the grass or slide</div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="grow">
                  <Slider
                    value={[settings.ringDist ?? settings.targetDist]}
                    min={1}
                    max={12}
                    step={0.1}
                    onValueChange={([v]) => onChange({ ringDist: v })}
                    aria-label="Landing call distance"
                  />
                </div>
                <span className="w-14 text-right text-[11px] font-extrabold text-[#0F8A7A] tabular-nums">{settings.ringDist === null ? '—' : `${settings.ringDist.toFixed(1)} m`}</span>
                {settings.ringDist !== null && (
                  <button onClick={() => onChange({ ringDist: null })} className="rounded-full bg-[#F3E9D7] px-2 py-1 text-[10px] font-extrabold text-[#7A5252]">
                    clear
                  </button>
                )}
              </div>
            </div>
            {status.lastRange !== null && (
              <div className="rounded-[12px] border border-[#D3E2F0] bg-[#EDF4FA] px-2.5 py-2 text-[11px] font-bold text-[#3C5A75]" data-testid="last-launch">
                Scout measured: {status.lastRange.toFixed(2)} m in {status.lastTof?.toFixed(2)} s
                {status.lastGap !== null && ` · your call was ${Math.abs(status.lastGap).toFixed(2)} m ${status.lastGap > 0 ? 'long' : 'short'}`}
              </div>
            )}
            <Tile
              onClick={onFire}
              disabled={status.launching}
              data-testid="fire"
              className={`flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-[13px] font-black text-[#FBF5EA] shadow transition-all ${status.launching ? 'bg-[#C9A48F]' : 'bg-[#B9541E] hover:bg-[#96431A]'}`}
            >
              <Rocket className="h-4 w-4" /> {status.launching ? 'In flight…' : 'Fire'}
            </Tile>
          </>
        )}

        {settings.mode === 'drop' && (
          <>
            {/* ---- Drop ---- */}
            <div>
              <div className={heading}>
                <ArrowDownToLine className="h-3 w-3" /> Drop height
              </div>
              <div className="rounded-[12px] px-2 py-1.5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[12px] font-bold text-[#7A5252]">Release clamp</span>
                  <span className="rounded-full bg-[#F3E9D7] px-2 py-0.5 text-[11px] font-extrabold text-[#2E6DA8] tabular-nums">{settings.dropHeight.toFixed(2)} m</span>
                </div>
                <Slider value={[settings.dropHeight]} min={DROP_MIN} max={DROP_MAX} step={0.05} onValueChange={([v]) => onChange({ dropHeight: v })} aria-label="Drop height" />
              </div>
            </div>
            <div>
              <div className={heading}>
                <Circle className="h-3 w-3" /> Ball
              </div>
              <div className="flex flex-wrap gap-1.5">
                {MASSES.map((m) => (
                  <button key={m.id} onClick={() => onChange({ mass: m.id })} className={chip(settings.mass === m.id)} style={chipStyle(settings.mass === m.id)} aria-pressed={settings.mass === m.id}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-[14px] border border-[#F0DFC0] bg-[#FDF6E7] px-2.5 py-2">
              <div className="text-[10px] font-black tracking-widest text-[#B97D10] uppercase">Predict first — which lands first?</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(
                  [
                    ['heavy', 'The heavy one'],
                    ['light', 'The light one'],
                    ['same', 'Together'],
                  ] as const
                ).map(([id, label]) => (
                  <button key={id} onClick={() => onOrderPredict(id)} className={chip(orderPrediction === id)} style={chipStyle(orderPrediction === id, '#B97D10')} aria-pressed={orderPrediction === id}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {caps.suvat === 'full' && (
              <div className="rounded-[14px] border border-[#D3E2F0] bg-[#EDF4FA] px-2.5 py-2">
                <div className="text-[10px] font-black tracking-widest text-[#2E6DA8] uppercase">Analyst · predict the landing speed</div>
                <p className="mt-0.5 text-[10.5px] font-semibold text-[#3C5A75]">From height and g alone — no clock. Then record a sensor trace to check.</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={speedPrediction ?? ''}
                    onChange={(e) => onSpeedPredict(e.target.value === '' ? null : Number(e.target.value))}
                    placeholder="m/s"
                    aria-label="Predicted landing speed"
                    className="w-24 rounded-[10px] border border-[#D3E2F0] bg-[#FFFDF7] px-2 py-1 text-[12px] font-bold text-[#1F3E5C]"
                  />
                  <span className="text-[10.5px] font-bold text-[#5E7F97]">m/s {speedPrediction !== null && `· model would say ${landingSpeed(settings.dropHeight, worlds.find((w) => w.id === settings.world)?.g ?? 9.81).toFixed(2)} — after the trace`}</span>
                </div>
              </div>
            )}
            <div>
              <div className={heading}>
                <Radar className="h-3 w-3" /> Landing pad &amp; sensor
                {!status.padUnlocked && <Lock className="h-3 w-3 text-[#B08A7A]" />}
              </div>
              {status.padUnlocked ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-[#EDF4FA] px-2.5 py-1 text-[10.5px] font-extrabold text-[#2E6DA8]">Pad timer on</span>
                  {status.sensorUnlocked && (
                    <button onClick={() => onChange({ sensorOn: !settings.sensorOn })} className={chip(settings.sensorOn)} style={chipStyle(settings.sensorOn, '#C13B33')} aria-pressed={settings.sensorOn}>
                      {settings.sensorOn ? 'Motion sensor armed' : 'Arm motion sensor'}
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-[10.5px] font-bold text-[#B08A7A]">Locked. Hand-time five drops from the same height first.</p>
              )}
            </div>
            <div className="flex gap-2">
              <Tile
                onClick={() => onRelease(false)}
                disabled={status.dropping}
                data-testid="release"
                className={`flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-3 text-[13px] font-black text-[#FBF5EA] shadow transition-all ${status.dropping ? 'bg-[#8FA9C4]' : 'bg-[#2E6DA8] hover:bg-[#245685]'}`}
              >
                <ArrowDownToLine className="h-4 w-4" /> Release
              </Tile>
              <Tile
                onClick={() => onRelease(true)}
                disabled={status.dropping}
                data-testid="release-both"
                className={`flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-3 text-[13px] font-black shadow transition-all ${status.dropping ? 'bg-[#EBDFC8] text-[#B08A7A]' : 'bg-[#F3E9D7] text-[#7A5252] hover:bg-[#EBDFC8]'}`}
              >
                Drop both
              </Tile>
            </div>
          </>
        )}

        {notice && (
          <p className="fact-pop rounded-[12px] border border-[#F0D9C0] bg-[#FDF1E4] px-2.5 py-2 text-[11px] leading-snug font-bold text-[#8A5A32]" data-testid="notice">
            {notice}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-[#F0E6D2] pt-2.5">
          <button onClick={onDemo} className="flex items-center gap-1.5 rounded-full bg-[#F3E9D7] px-3 py-1.5 text-[11px] font-extrabold text-[#7A5252] transition-colors hover:bg-[#EBDFC8]">
            <PlayCircle className="h-3.5 w-3.5" /> Show me
          </button>
          <button onClick={onRecalibrate} className="flex items-center gap-1.5 rounded-full bg-[#F3E9D7] px-3 py-1.5 text-[11px] font-extrabold text-[#7A5252] transition-colors hover:bg-[#EBDFC8]">
            <Zap className="h-3.5 w-3.5 text-[#E8A33D]" /> Re-measure my reaction
          </button>
        </div>
      </div>
    </div>
  )
}
