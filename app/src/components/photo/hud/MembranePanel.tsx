import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleSlash,
  Pause,
  Play,
  RotateCcw,
  Thermometer,
  Timer,
} from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { useBandCaps } from '@/lib/bands'
import {
  canCross,
  MEMBRANE_BY_ID,
  MEMBRANE_DEMOS,
  MEMBRANES,
  SPECIES,
  SPECIES_ORDER,
  type MembraneDemoId,
} from '@/lib/membrane'
import type { PhotoSim } from '@/lib/photo'

interface Props {
  sim: PhotoSim
  demo: MembraneDemoId
  membraneId: string
  running: boolean
  tempC: number
  onDemo: (d: MembraneDemoId) => void
  onMembrane: (id: string) => void
  onRunning: (running: boolean) => void
  onTemp: (c: number) => void
  onReset: () => void
}

interface Sample {
  t: number
  leftPct: number
}

/** Tiny sparkline of how the split between the two sides changes over time. */
function SplitGraph({ samples }: { samples: Sample[] }) {
  const W = 250
  const H = 76
  const maxT = Math.max(20, samples.length ? samples[samples.length - 1].t : 20)

  const points = samples
    .map((s) => `${8 + (s.t / maxT) * (W - 16)},${6 + (1 - s.leftPct / 100) * (H - 20)}`)
    .join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Share on the left side over time">
      <rect x={8} y={6} width={W - 16} height={H - 20} fill="#FFFDF7" />
      {/* The 50% line: where an evenly-spread system ends up. */}
      <line
        x1={8}
        x2={W - 8}
        y1={6 + 0.5 * (H - 20)}
        y2={6 + 0.5 * (H - 20)}
        stroke="#C9B896"
        strokeWidth="1"
        strokeDasharray="4 3"
      />
      <text x={W - 10} y={6 + 0.5 * (H - 20) - 3} textAnchor="end" fontSize="7.5" fontWeight="700" fill="#A08750">
        even (50%)
      </text>
      {samples.length > 1 && (
        <polyline fill="none" stroke="#3E7C43" strokeWidth="1.8" points={points} />
      )}
      <text x={8} y={H - 4} fontSize="7.5" fontWeight="700" fill="#A08750">
        0 s
      </text>
      <text x={W - 8} y={H - 4} textAnchor="end" fontSize="7.5" fontWeight="700" fill="#A08750">
        {Math.round(maxT)} s
      </text>
    </svg>
  )
}

/** The osmosis / diffusion bench: membrane choice, temperature, and live data. */
export default function MembranePanel({
  sim,
  demo,
  membraneId,
  running,
  tempC,
  onDemo,
  onMembrane,
  onRunning,
  onTemp,
  onReset,
}: Props) {
  const caps = useBandCaps()
  const [examples, setExamples] = useState(false)
  const [tick, setTick] = useState(0)
  const [samples, setSamples] = useState<Sample[]>([])
  const lastReset = useRef(0)

  const membrane = MEMBRANE_BY_ID[membraneId] ?? MEMBRANE_BY_ID.visking
  const setup = MEMBRANE_DEMOS[demo]
  const tracer = SPECIES[setup.tracer]
  const tracerIndex = SPECIES_ORDER.indexOf(setup.tracer)

  // Poll the mutable sim for the live readout, and record the history.
  useEffect(() => {
    const t = window.setInterval(() => {
      setTick((n) => n + 1)
      if (sim.demoReset !== lastReset.current) {
        lastReset.current = sim.demoReset
        setSamples([])
        return
      }
      if (!sim.demoRunning) return
      const left = sim.mLeft[tracerIndex] ?? 0
      const right = sim.mRight[tracerIndex] ?? 0
      const total = left + right
      if (total === 0) return
      setSamples((prev) => {
        const next = [...prev, { t: sim.demoTime, leftPct: (left / total) * 100 }]
        return next.length > 400 ? next.slice(next.length - 400) : next
      })
    }, 400)
    return () => window.clearInterval(t)
  }, [sim, tracerIndex])
  void tick

  const left = sim.mLeft[tracerIndex] ?? 0
  const right = sim.mRight[tracerIndex] ?? 0
  const total = left + right || 1
  const leftPct = Math.round((left / total) * 100)
  const flow = sim.mNetFlow
  const flowing = Math.abs(flow) > 0.55

  const crossing = useMemo(
    () => SPECIES_ORDER.map((id) => ({ species: SPECIES[id], fits: canCross(SPECIES[id], membrane) })),
    [membrane],
  )

  const chip = (active: boolean) =>
    `rounded-full px-2.5 py-1 text-[10.5px] font-extrabold transition-all duration-200 ${
      active ? 'bg-[#3E7C43] text-[#FBF5EA] shadow' : 'bg-[#F3E9D7] text-[#7A5252] hover:bg-[#EBDFC8]'
    }`

  const status = (() => {
    if (!running) return 'Press play and watch. Nothing is pushing the particles — they only jiggle.'
    if (membrane.poreSize === 0)
      return 'Nothing can cross. With no holes there is no diffusion and no osmosis — the two sides can never even out.'
    if (sim.mEquilibrium) return setup.payoff
    if (flowing)
      return demo === 'osmosis'
        ? `Net movement of water toward the ${flow > 0 ? 'right' : 'left'} — the side with more solute crowding it.`
        : `Net movement ${flow > 0 ? 'left → right' : 'right → left'}, from where ${tracer.name.toLowerCase()} is crowded toward where it is roomy.`
    return 'Particles are moving, but roughly the same number cross each way. Watch the arrow.'
  })()

  return (
    <div className="space-y-3.5">
      {/* ---- Which demo ---- */}
      <div className="flex gap-2">
        <button onClick={() => onDemo('diffusion')} className={chip(demo === 'diffusion')}>
          Diffusion
        </button>
        <button onClick={() => onDemo('osmosis')} className={chip(demo === 'osmosis')}>
          Osmosis
        </button>
      </div>

      <p className="rounded-[14px] border border-[#E8DFC8] bg-[#F8F1DF] px-3 py-2.5 text-[12px] leading-snug font-semibold text-[#6B5236]">
        {setup.brief}
      </p>

      {/* ---- Membrane choice ---- */}
      <div>
        <div className="mb-1.5 text-[10.5px] font-black tracking-widest text-[#7A5252] uppercase">
          Membrane in the clamp
        </div>
        <div className="flex flex-wrap gap-1.5">
          {MEMBRANES.map((m) => (
            <button key={m.id} onClick={() => onMembrane(m.id)} className={chip(m.id === membraneId)}>
              {m.name}
            </button>
          ))}
        </div>

        <div
          className="mt-1.5 rounded-[14px] border px-2.5 py-2"
          style={
            membrane.partiallyPermeable
              ? { borderColor: '#DDEAD8', background: '#EAF3E6' }
              : { borderColor: '#F0D9C0', background: '#FDF1E4' }
          }
        >
          <div className="flex items-center gap-1.5">
            {membrane.partiallyPermeable ? (
              <CircleCheck className="h-3.5 w-3.5 shrink-0 text-[#3E7C43]" />
            ) : (
              <CircleSlash className="h-3.5 w-3.5 shrink-0 text-[#C1743B]" />
            )}
            <span
              className="text-[11px] font-black"
              style={{ color: membrane.partiallyPermeable ? '#2E7D32' : '#8A5A32' }}
            >
              {membrane.verdict}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-snug font-semibold text-[#5C3A3A]">{membrane.note}</p>

          {/* Size test: what fits through these holes */}
          <div className="mt-1.5 space-y-1 border-t border-[#D9CDB4] pt-1.5">
            {crossing.map(({ species, fits }) => (
              <div key={species.id} className="flex items-center gap-1.5">
                <span
                  className="inline-block shrink-0 rounded-full"
                  style={{
                    background: species.color,
                    width: 6 + species.size * 3,
                    height: 6 + species.size * 3,
                  }}
                />
                <span className="text-[10.5px] font-bold text-[#5C3A3A]">{species.name}</span>
                <span className="grow" />
                <span
                  className="text-[10px] font-black"
                  style={{ color: fits ? '#2E7D32' : '#C13B33' }}
                >
                  {fits ? 'fits through' : 'too big'}
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={() => setExamples((e) => !e)}
            aria-expanded={examples}
            className="mt-1.5 flex items-center gap-1 text-[10px] font-black text-[#3E7C43] uppercase"
          >
            {examples ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Where you meet this one
          </button>
          {examples && (
            <ul className="mt-1 space-y-1">
              {membrane.realWorld.map((r) => (
                <li key={r} className="flex gap-1.5 text-[10.5px] leading-snug font-semibold text-[#5C3A3A]">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[#8A6B3F]" />
                  {r}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ---- Temperature ---- */}
      <div className="rounded-[12px] px-2 py-1.5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#7A5252]">
            <Thermometer className="h-3.5 w-3.5 text-[#C13B33]" />
            Temperature
          </label>
          <span className="shrink-0 rounded-full bg-[#F3E9D7] px-2 py-0.5 text-[11px] font-extrabold tabular-nums text-[#C13B33]">
            {Math.round(tempC)} °C
          </span>
        </div>
        <Slider
          value={[tempC]}
          min={2}
          max={50}
          step={1}
          onValueChange={([v]) => onTemp(v)}
          aria-label="Chamber temperature"
        />
        <p className="mt-1 text-[10px] leading-snug font-bold text-[#B08A7A]">
          {caps.quantitative
            ? 'Warmer particles carry more kinetic energy — and warm water is also much runnier, so molecules meet less resistance. Together those roughly triple the spreading rate across this slider. Time the same run at 5 °C and at 45 °C.'
            : 'Warm things jiggle harder and spread faster. Try the same race at 5 °C and again at 45 °C — time them!'}
        </p>
      </div>

      {/* ---- Run controls ---- */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => onRunning(!running)}
          className="flex items-center gap-2 rounded-full bg-[#3E7C43] px-4 py-2 text-sm font-extrabold text-[#FBF5EA] shadow transition-all duration-200 hover:bg-[#2F6134] active:scale-95"
        >
          {running ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
          {running ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 rounded-full border border-[#E8DFC8] bg-[#F3E9D7] px-3.5 py-2 text-xs font-extrabold text-[#7A5252] shadow-sm transition-all duration-200 hover:scale-[1.03] active:scale-95"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
        <span className="flex items-center gap-1 rounded-full bg-[#F3E9D7] px-2.5 py-1.5 text-[11px] font-black tabular-nums text-[#7A5252]">
          <Timer className="h-3 w-3" />
          {sim.demoTime.toFixed(1)} s
        </span>
      </div>

      {/* ---- Live readout ---- */}
      <div className="rounded-[14px] border border-[#E8DFC8] bg-[#F8F1DF] px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-black tracking-wider uppercase">
          <ArrowLeftRight className={`h-3 w-3 ${flowing ? 'text-[#B97D10]' : 'text-[#8A9A83]'}`} />
          <span className={flowing ? 'text-[#B97D10]' : 'text-[#5E7F5F]'}>
            {sim.mEquilibrium ? 'Dynamic equilibrium' : flowing ? 'Net movement' : 'No net movement'}
          </span>
        </div>
        <p className="mt-1 text-[12px] leading-snug font-semibold text-[#6B5236]">{status}</p>

        {/* Side-by-side split for the species being watched */}
        <div className="mt-2 border-t border-[#E8DFC8] pt-2">
          <div className="flex items-baseline justify-between text-[10px] font-black tracking-wider text-[#A08750] uppercase">
            <span>{tracer.name} on the left</span>
            <span className="tabular-nums">
              {left} : {right}
            </span>
          </div>
          <div className="mt-1 flex h-3 w-full overflow-hidden rounded-full bg-[#EFE4CE]">
            <div
              className="h-full transition-[width] duration-300"
              style={{ width: `${leftPct}%`, background: tracer.color }}
            />
            <div
              className="h-full transition-[width] duration-300"
              style={{ width: `${100 - leftPct}%`, background: `${tracer.color}55` }}
            />
          </div>
          <div className="mt-0.5 flex justify-between text-[9.5px] font-bold text-[#B08A7A]">
            <span>left {leftPct}%</span>
            <span>right {100 - leftPct}%</span>
          </div>
        </div>

        {caps.quantitative && (
          <p className="mt-1.5 text-[10px] leading-snug font-bold text-[#A08750] tabular-nums">
            Net flow {flow > 0 ? '+' : ''}
            {flow.toFixed(1)} particles s⁻¹ · {sim.mCrossings} crossings so far
          </p>
        )}
      </div>

      {/* ---- History graph ---- */}
      {caps.dataTable && (
        <div className="rounded-[14px] border border-[#E8DFC8] bg-[#FFFDF7] px-2 py-2">
          <div className="px-1 text-[9.5px] font-black tracking-wider text-[#A08750] uppercase">
            Share of {tracer.name.toLowerCase()} on the left, over time
          </div>
          <SplitGraph samples={samples} />
          <p className="px-1 pb-1 text-[10px] leading-snug font-bold text-[#B08A7A]">
            A curve that flattens onto the dashed line has reached equilibrium. One that never
            reaches it is being blocked by the membrane.
          </p>
        </div>
      )}
    </div>
  )
}
