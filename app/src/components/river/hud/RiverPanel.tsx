import { useState } from 'react'
import {
  ChevronDown,
  CloudRain,
  Eye,
  Flag,
  Map as MapIcon,
  Moon,
  Mountain,
  PlayCircle,
  RotateCcw,
  Ruler,
  ShieldCheck,
  Timer,
  Waves,
} from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { Tile } from '@/components/ui/tile'
import { useBandCaps } from '@/lib/bands'
import {
  BASIN_PRESETS,
  BASINS,
  DEFENCE_BY_ID,
  DEFENCES,
  FLOOD_BUDGET,
  LAND_USES,
  STATION_BY_ID,
  STATIONS,
  type BasinId,
  type DefenceId,
  type LandUseId,
  type LensId,
} from '@/lib/river'

export interface RiverSettings {
  basin: BasinId
  landUse: LandUseId
  wet: boolean
  night: boolean
  visionOn: boolean
  mapOn: boolean
  lens: LensId
  station: 'st1' | 'st2' | 'st3'
  fastestFlag: 'st1' | 'st2' | 'st3' | null
  floodLine: number | null
  pebbleRing: number | null
  defences: DefenceId[]
}

export interface RiverStatus {
  rideActive: boolean
  q: number
  stage: number
  stormActive: boolean
  flooded: boolean
  damage: number
  swRunning: boolean
  swElapsed: number
  floatActive: boolean
  floatDone: number
  meterUnlocked: boolean
  underUnlocked: boolean
  lapseUnlocked: boolean
  years: number
  pebbleMode: string
  pebbleRound: number
}

interface Props {
  settings: RiverSettings
  status: RiverStatus
  notice: string | null
  onChange: (patch: Partial<RiverSettings>) => void
  onTape: () => void
  onSound: () => void
  onFloat: () => void
  onMeter: () => void
  onTap: () => void
  onResetWatch: () => void
  onStorm: () => void
  onMeasurePebble: () => void
  onResetPebble: () => void
  onGradient: () => void
  onDefence: (id: DefenceId) => void
  onDemo: () => void
  onRide: () => void
  embedded?: boolean
}

function Section({ title, icon, children, defaultOpen = true }: { title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-2xl border border-[#EFE3CE] bg-[#FFFDF7] p-3">
      <Tile onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 text-left">
        <span className="text-[#2E6DA8]">{icon}</span>
        <span className="grow text-[13px] font-black text-[#402222]">{title}</span>
        <ChevronDown className={`h-4 w-4 text-[#B08A7A] transition-transform ${open ? 'rotate-180' : ''}`} />
      </Tile>
      {open && <div className="mt-2 flex flex-col gap-2">{children}</div>}
    </div>
  )
}

function Chip({ active, onClick, children, disabled, title }: { active?: boolean; onClick?: () => void; children: React.ReactNode; disabled?: boolean; title?: string }) {
  return (
    <Tile
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-full border px-3 py-1.5 text-[11px] font-extrabold transition-all ${
        active
          ? 'border-[#2E6DA8] bg-[#2E6DA8] text-[#FBF5EA] shadow'
          : disabled
            ? 'border-[#EFE3CE] bg-[#F6F0E2] text-[#C9B49E]'
            : 'border-[#E3D5BC] bg-[#FBF5EA] text-[#7A5252] hover:border-[#2E6DA8] hover:text-[#2E6DA8]'
      }`}
    >
      {children}
    </Tile>
  )
}

export default function RiverPanel({
  settings,
  status,
  notice,
  onChange,
  onTape,
  onSound,
  onFloat,
  onMeter,
  onTap,
  onResetWatch,
  onStorm,
  onMeasurePebble,
  onResetPebble,
  onGradient,
  onDefence,
  onDemo,
  onRide,
  embedded = false,
}: Props) {
  const caps = useBandCaps()
  const st = STATION_BY_ID[settings.station]
  const spent = settings.defences.reduce((c, d) => c + DEFENCE_BY_ID[d].cost, 0)

  return (
    <div
      className={
        embedded
          ? 'flex w-full flex-col gap-2'
          : 'pointer-events-auto flex max-h-[calc(100dvh-14rem)] w-[19.5rem] flex-col gap-2 overflow-y-auto rounded-[22px] border border-[#F3E9D7] bg-[#FBF5EA]/95 p-3 shadow-xl backdrop-blur-md'
      }
    >
      {!embedded && (
        <div className="flex items-center gap-2">
          <Waves className="h-5 w-5 text-[#2E6DA8]" />
          <p className="grow text-sm font-black text-[#402222]">The River Basin</p>
          <Tile onClick={onDemo} className="flex items-center gap-1 rounded-full border border-[#2E6DA8] px-2.5 py-1 text-[10px] font-extrabold text-[#2E6DA8] hover:bg-[#E4EEF7]">
            <PlayCircle className="h-3.5 w-3.5" />
            Demo
          </Tile>
        </div>
      )}
      {notice && <p className="rounded-xl bg-[#FBE9DB] px-3 py-2 text-[11px] leading-snug font-bold text-[#A0522E]">{notice}</p>}

      <Tile
        onClick={onRide}
        disabled={status.rideActive}
        className="flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#2E6DA8] to-[#3E8CB8] px-5 py-2.5 text-[13px] font-extrabold text-[#FBF5EA] shadow-lg transition-all hover:scale-[1.02] disabled:opacity-60"
      >
        <Waves className="h-4 w-4" />
        {status.rideActive ? 'Riding…' : 'Ride the river — source to sea'}
      </Tile>

      <Section title="Basin" icon={<Mountain className="h-4 w-4" />}>
        <div className="flex flex-wrap gap-1.5">
          {BASINS.map((b) => (
            <Chip key={b} active={settings.basin === b} onClick={() => onChange({ basin: b })} title={BASIN_PRESETS[b].blurb}>
              {BASIN_PRESETS[b].label}
            </Chip>
          ))}
        </div>
        <p className="text-[10.5px] leading-snug font-semibold text-[#B08A7A]">{BASIN_PRESETS[settings.basin].blurb}</p>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={settings.night} onClick={() => onChange({ night: !settings.night })}>
            <span className="flex items-center gap-1"><Moon className="h-3 w-3" /> Night</span>
          </Chip>
          <Chip active={settings.visionOn} onClick={() => onChange({ visionOn: !settings.visionOn })}>
            <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> Hydro Vision</span>
          </Chip>
          <Chip active={settings.mapOn} onClick={() => onChange({ mapOn: !settings.mapOn })}>
            <span className="flex items-center gap-1"><MapIcon className="h-3 w-3" /> Map</span>
          </Chip>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip
            active={settings.lens === 'under'}
            disabled={!status.underUnlocked}
            title={status.underUnlocked ? 'Dive below the surface at the current station' : 'Time the float once to earn the dive'}
            onClick={() => onChange({ lens: settings.lens === 'under' ? 'none' : 'under' })}
          >
            Underwater lens
          </Chip>
          <Chip
            active={settings.lens === 'lapse'}
            disabled={!status.lapseUnlocked}
            title={status.lapseUnlocked ? '1 second = 1 year. Watch the valley work.' : 'Complete two missions to earn the time-lapse lens'}
            onClick={() => onChange({ lens: settings.lens === 'lapse' ? 'none' : 'lapse' })}
          >
            Time-lapse {status.lapseUnlocked && status.years > 0.5 ? `· yr ${status.years.toFixed(0)}` : ''}
          </Chip>
        </div>
      </Section>

      <Section title="Field kit" icon={<Ruler className="h-4 w-4" />}>
        <div className="flex flex-wrap gap-1.5">
          {STATIONS.map((s) => (
            <Chip key={s.id} active={settings.station === s.id} onClick={() => onChange({ station: s.id })}>
              {s.name.split(' — ')[0]}
            </Chip>
          ))}
        </div>
        <p className="text-[10.5px] leading-snug font-semibold text-[#B08A7A]">{st.blurb}</p>
        <div className="flex flex-wrap gap-1.5">
          <Chip onClick={onTape}>Tape the width</Chip>
          <Chip onClick={onSound}>Sound the bed</Chip>
          <Chip onClick={onGradient}>Clinometer</Chip>
        </div>
        <div className="flex items-center gap-2">
          <Tile
            onClick={onFloat}
            disabled={status.floatActive}
            className="flex items-center gap-1.5 rounded-full bg-[#F08A2E] px-4 py-2 text-[12px] font-extrabold text-[#FBF5EA] shadow transition-all hover:bg-[#D97A24] disabled:opacity-50"
          >
            <Waves className="h-4 w-4" />
            {status.floatActive ? 'Float running…' : 'Release the float'}
          </Tile>
          {caps.fieldMeter && (
            <Chip disabled={!status.meterUnlocked} onClick={onMeter} title={status.meterUnlocked ? 'Electromagnetic flow meter — instant velocity' : 'Time the float three times to earn the meter'}>
              Flow meter
            </Chip>
          )}
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-[#EFE3CE] bg-[#FBF5EA] px-3 py-2">
          <Timer className="h-4 w-4 text-[#2E6DA8]" />
          <span className="grow font-mono text-lg font-black text-[#402222]">{status.swElapsed.toFixed(2)} s</span>
          <Tile onClick={onTap} aria-label="Stopwatch" className={`rounded-full px-4 py-1.5 text-[11px] font-extrabold text-[#FBF5EA] shadow ${status.swRunning ? 'bg-[#C13B33]' : 'bg-[#3E7C43]'}`}>
            {status.swRunning ? 'STOP' : 'START'}
          </Tile>
          <Tile onClick={onResetWatch} round className="text-[#B08A7A]">
            <RotateCcw className="h-4 w-4" />
          </Tile>
        </div>
        <p className="text-[10px] leading-snug font-semibold text-[#B08A7A]">
          Start as the float passes the first pole, stop at the second — {`${6}`} m apart. Speed = distance ÷ time.
        </p>
        {caps.prediction !== 'none' && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 text-[10.5px] font-extrabold text-[#7A5252]"><Flag className="h-3 w-3 text-[#E8A33D]" /> Fastest station?</span>
            {STATIONS.map((s) => (
              <Chip key={s.id} active={settings.fastestFlag === s.id} onClick={() => onChange({ fastestFlag: s.id })}>
                {s.id.replace('st', 'S')}
              </Chip>
            ))}
          </div>
        )}
      </Section>

      <Section title="Your pebble" icon={<Mountain className="h-4 w-4" />} defaultOpen={false}>
        <p className="text-[10.5px] leading-snug font-semibold text-[#B08A7A]">
          Tagged at the source: {status.pebbleMode}, roundness {(status.pebbleRound * 100).toFixed(0)}%.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Chip onClick={onMeasurePebble}>Measure it</Chip>
          <Chip onClick={onResetPebble}>New pebble</Chip>
        </div>
        {caps.prediction !== 'none' && (
          <div className="flex flex-col gap-1">
            <span className="text-[10.5px] font-extrabold text-[#7A5252]">Call where it finally rests (ring on the lower course)</span>
            <Slider
              value={[settings.pebbleRing ?? 120]}
              min={90}
              max={150}
              step={1}
              onValueChange={([v]) => onChange({ pebbleRing: v })}
              aria-label="Pebble resting place"
            />
          </div>
        )}
      </Section>

      <Section title="Storm & flood" icon={<CloudRain className="h-4 w-4" />}>
        <div className="flex flex-wrap gap-1.5">
          {LAND_USES.map((l) => (
            <Chip key={l.id} active={settings.landUse === l.id} onClick={() => onChange({ landUse: l.id })} title={l.blurb}>
              {l.label}
            </Chip>
          ))}
          <Chip active={settings.wet} onClick={() => onChange({ wet: !settings.wet })} title="Antecedent moisture: the ground is already soaked">
            Wet ground
          </Chip>
        </div>
        {caps.prediction !== 'none' && (
          <div className="flex flex-col gap-1">
            <span className="text-[10.5px] font-extrabold text-[#7A5252]">Call the peak: how high up the gauge? ({(settings.floodLine ?? 0.6).toFixed(1)} m)</span>
            <Slider value={[settings.floodLine ?? 0.6]} min={0.1} max={1.6} step={0.1} onValueChange={([v]) => onChange({ floodLine: v })} aria-label="Flood line" />
          </div>
        )}
        <Tile
          onClick={onStorm}
          disabled={status.stormActive}
          className="flex items-center justify-center gap-2 rounded-full bg-[#2E6DA8] px-5 py-2.5 text-[13px] font-extrabold text-[#FBF5EA] shadow-lg transition-all hover:bg-[#245685] disabled:opacity-50"
        >
          <CloudRain className="h-4 w-4" />
          {status.stormActive ? 'Storm running…' : 'Run a storm'}
        </Tile>
        <div className="flex items-center justify-between rounded-xl border border-[#EFE3CE] bg-[#FBF5EA] px-3 py-2 text-[11px] font-extrabold">
          <span className="text-[#7A5252]">Gauge</span>
          <span className="font-mono text-[#402222]">{status.q.toFixed(2)} m³/s</span>
          <span className={status.stage > 1 ? 'text-[#C13B33]' : 'text-[#3E7C43]'}>{status.stage > 1 ? 'OVER BANKFULL' : `${(status.stage * 100).toFixed(0)}% full`}</span>
        </div>
        {status.damage > 0 && (
          <p className="rounded-xl bg-[#F6DEDC] px-3 py-1.5 text-[11px] font-extrabold text-[#C13B33]">Village damage: {(status.damage * 100).toFixed(0)}%</p>
        )}
      </Section>

      <Section title={caps.floodBudget ? `Defences — budget ${spent}/${FLOOD_BUDGET}` : 'Defences'} icon={<ShieldCheck className="h-4 w-4" />} defaultOpen={false}>
        <div className="flex flex-wrap gap-1.5">
          {DEFENCES.map((d) => {
            const active = settings.defences.includes(d.id)
            const wouldSpend = spent + (active ? 0 : d.cost)
            const blocked = caps.floodBudget && !active && wouldSpend > FLOOD_BUDGET
            return (
              <Chip key={d.id} active={active} disabled={blocked} onClick={() => onDefence(d.id)} title={`${d.blurb}${caps.floodBudget ? ` · cost ${d.cost}` : ''}`}>
                {d.label}
                {caps.floodBudget ? ` · ${d.cost}` : ''}
              </Chip>
            )
          })}
        </div>
        {settings.defences.length > 0 && (
          <p className="text-[10.5px] leading-snug font-semibold text-[#B08A7A]">{DEFENCE_BY_ID[settings.defences[settings.defences.length - 1]].tradeoff}</p>
        )}
      </Section>
    </div>
  )
}
