import { useEffect, useState } from 'react'
import {
  Activity,
  ChevronDown,
  Footprints,
  Gauge,
  LayoutGrid,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Tag,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { MAX_RBC } from '@/lib/sim'
import { DEMANDS, getJourney, replayCellStory } from '@/lib/journey'
import { isMuted, setMuted } from '@/lib/audio'

export interface Settings {
  demand: number
  density: number
  paused: boolean
  labels: boolean
}

interface Props {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  /** Rendered inside the compact bottom drawer: no card chrome, no collapse. */
  embedded?: boolean
}

const DEMAND_ICONS = [Activity, Footprints, Zap]

/**
 * Captain's controls. The old free-floating "flow speed" slider is gone: what
 * the learner sets now is what the BODY is doing, and heart rate, flow,
 * breathing and oxygen delivery all follow from that one choice. Every
 * control on this panel maps to something biological.
 */
export default function ControlPanel({ settings, onChange, embedded = false }: Props) {
  const [open, setOpen] = useState(() =>
    embedded ? true : typeof window === 'undefined' ? true : window.innerWidth > 720,
  )
  const [mute, setMute] = useState(() => isMuted())
  const [replayed, setReplayed] = useState(false)
  // The cell stop finishes inside the render loop, which never re-renders
  // React — so poll for it rather than reading it once at mount.
  const [storyDone, setStoryDone] = useState(() => getJourney().beatDone)
  useEffect(() => {
    const t = window.setInterval(() => setStoryDone(getJourney().beatDone), 500)
    return () => window.clearInterval(t)
  }, [])

  if (!open && !embedded) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open controls"
        className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-[#F3E9D7] bg-[#FBF5EA]/90 shadow-xl backdrop-blur-md transition-transform duration-200 hover:scale-105 active:scale-95"
      >
        <SlidersHorizontal className="h-5 w-5 text-[#C13B33]" />
      </button>
    )
  }

  return (
    <div
      className={
        embedded
          ? 'pointer-events-auto w-full'
          : 'pointer-events-auto w-72 max-w-[calc(100vw-2rem)] rounded-[22px] border border-[#F3E9D7]/60 bg-[#FBF5EA]/70 p-5 shadow-xl backdrop-blur-xl'
      }
    >
      <div className={`mb-4 flex items-center justify-between ${embedded ? 'hidden' : ''}`}>
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-[#C13B33]" />
          <span className="text-sm font-extrabold tracking-wide text-[#402222] uppercase">
            Captain's controls
          </span>
        </div>
        <button
          onClick={() => setOpen(false)}
          aria-label="Collapse controls"
          className="rounded-full p-1.5 text-[#7A5252] transition-colors hover:bg-[#F3E9D7]"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className="text-[13px] leading-tight font-bold text-[#7A5252]">
              Body demand
            </label>
            <span className="shrink-0 rounded-full bg-[#F3E9D7] px-2 py-0.5 text-[11px] font-extrabold text-[#C13B33] tabular-nums">
              {DEMANDS[settings.demand].bpm} bpm · {DEMANDS[settings.demand].extraction}/4 O₂
            </span>
          </div>
          <div
            className="flex gap-1.5 rounded-full bg-[#F3E9D7]/70 p-1"
            role="radiogroup"
            aria-label="Body demand"
          >
            {DEMANDS.map((d, i) => {
              const Icon = DEMAND_ICONS[i]
              const active = settings.demand === i
              return (
                <button
                  key={d.id}
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange({ demand: i })}
                  className={`flex flex-1 items-center justify-center gap-1 rounded-full px-2 py-1.5 text-[12px] font-extrabold transition-all duration-200 ${
                    active
                      ? 'bg-[#C13B33] text-[#FBF5EA] shadow'
                      : 'text-[#7A5252] hover:bg-[#FBF5EA]/70'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {d.label}
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[11px] leading-snug font-semibold text-[#8A5F4C]">
            {DEMANDS[settings.demand].blurb}
          </p>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-[13px] font-bold text-[#7A5252]">
              <LayoutGrid className="h-3.5 w-3.5" /> Cell crowd
            </label>
            <span className="rounded-full bg-[#F3E9D7] px-2 py-0.5 text-[11px] font-extrabold text-[#C13B33] tabular-nums">
              {settings.density}
            </span>
          </div>
          <Slider
            value={[settings.density]}
            min={600}
            max={MAX_RBC}
            step={100}
            onValueChange={([v]) => onChange({ density: v })}
            aria-label="Cell density"
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <button
            onClick={() => onChange({ paused: !settings.paused })}
            className="flex items-center gap-2 rounded-full bg-[#C13B33] px-4 py-2 text-sm font-extrabold text-[#FBF5EA] shadow transition-all duration-200 hover:scale-[1.03] hover:bg-[#9E2B25] active:scale-95"
          >
            {settings.paused ? <Play className="h-4 w-4 fill-current" /> : <Pause className="h-4 w-4 fill-current" />}
            {settings.paused ? 'Resume' : 'Pause'}
          </button>
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2">
              <Tag className="h-4 w-4 text-[#7A5252]" />
              <span className="text-[13px] font-bold text-[#7A5252]">Tags</span>
              <Switch
                checked={settings.labels}
                onCheckedChange={(v) => onChange({ labels: v })}
                aria-label="Toggle nameplates"
              />
            </label>
            <button
              onClick={() => {
                const next = !mute
                setMute(next)
                setMuted(next)
              }}
              aria-label={mute ? 'Unmute sound' : 'Mute sound'}
              aria-pressed={!mute}
              className="rounded-full p-2 text-[#7A5252] transition-colors hover:bg-[#F3E9D7]"
            >
              {mute ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* The meet-the-cell stop plays once — but curiosity arrives late. */}
        {storyDone && (
          <button
            onClick={() => {
              replayCellStory()
              setReplayed(true)
              window.setTimeout(() => setReplayed(false), 2600)
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-full border border-[#E4D5C0] px-3 py-1.5 text-[11px] font-extrabold text-[#7A5252] transition-colors hover:bg-[#F3E9D7]"
          >
            <RotateCcw className="h-3 w-3" />
            {replayed ? 'Armed — plays at the next body tissue' : 'Replay the cell stop'}
          </button>
        )}
      </div>
    </div>
  )
}
