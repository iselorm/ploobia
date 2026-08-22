import { useEffect, useState } from 'react'
import { Map as MapIcon, X } from 'lucide-react'
import { Tile } from '@/components/ui/tile'
import {
  CHECKPOINTS,
  checkpointData,
  COURSE,
  DELTA0,
  DISTRIBUTARIES,
  distribX,
  distribZ,
  meanderX,
  TRIBUTARIES,
  tribPoint,
  worldZ,
  type RiverSim,
} from '@/lib/river'

/**
 * The journey map — a semi-opaque HUD chart of the whole course laid over the
 * 3D, with the checkpoints as gates. Tap a gate for its live data (read from
 * the same model the instruments read); during the ride the current gate
 * lights up and narrates itself.
 */

const W = 150
const H = 272
// The minimap is a plan view: world x across, world z down.
const sx = (x: number) => W / 2 + x * 2.4
const sz = (z: number) => 12 + (z - worldZ(0)) * 1.5

const riverPath = (() => {
  const pts: string[] = []
  for (let s = 2; s <= DELTA0; s += 2) pts.push(`${sx(meanderX(s)).toFixed(1)},${sz(worldZ(s)).toFixed(1)}`)
  return 'M' + pts.join(' L')
})()

const tribPaths = TRIBUTARIES.map((tb) => {
  const p = { x: 0, z: 0 }
  const pts: string[] = []
  for (let i = 0; i <= 10; i++) {
    tribPoint(tb, i / 10, p)
    pts.push(`${sx(p.x).toFixed(1)},${sz(p.z).toFixed(1)}`)
  }
  return { d: 'M' + pts.join(' L'), name: tb.name }
})

const distribPaths = DISTRIBUTARIES.map((k) => {
  const pts: string[] = []
  for (let i = 0; i <= 10; i++) pts.push(`${sx(distribX(k, i / 10)).toFixed(1)},${sz(distribZ(i / 10)).toFixed(1)}`)
  return 'M' + pts.join(' L')
})

interface Props {
  sim: RiverSim
  /** Bumped by the page's poll so live values re-render. */
  tick: number
  compactRide?: boolean
}

export default function RiverMiniMap({ sim, tick, compactRide = false }: Props) {
  void tick
  const [selected, setSelected] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const expanded = open || sim.rideActive || sim.ploobActive || compactRide

  // The ride drives the selection; passing a gate opens its card.
  useEffect(() => {
    if (sim.rideActive && sim.rideCp >= 0) setSelected(CHECKPOINTS[sim.rideCp].id)
  }, [sim, sim.rideActive, sim.rideCp])

  if (!expanded) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-[#FBF5EA]/25 px-3 py-1.5 text-[10.5px] font-extrabold text-[#EAF4F8]/90 shadow-lg backdrop-blur-md transition-all hover:scale-[1.04]"
        style={{ background: 'rgba(10, 22, 32, 0.55)' }}
      >
        <MapIcon className="h-3.5 w-3.5" />
        The Journey
      </button>
    )
  }

  const cp = selected ? CHECKPOINTS.find((c) => c.id === selected) : null
  const passed = sim.rideActive ? sim.rideCp : -1

  return (
    <div
      className={`pointer-events-auto flex flex-col gap-1.5 rounded-[18px] border border-[#FBF5EA]/20 p-2.5 shadow-xl backdrop-blur-md ${compactRide ? 'w-[11.5rem]' : 'w-[12.5rem]'}`}
      style={{ background: 'rgba(10, 22, 32, 0.55)' }}
    >
      <div className="flex items-center gap-1">
        <p className="grow text-[10px] font-black tracking-wide text-[#EAF4F8]/85">THE JOURNEY · source → sea</p>
        {!sim.rideActive && !compactRide && (
          <Tile onClick={() => setOpen(false)} round className="text-[#EAF4F8]/60 hover:text-[#EAF4F8]">
            <X className="h-3 w-3" />
          </Tile>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* the sea */}
        <rect x={0} y={sz(worldZ(COURSE))} width={W} height={H - sz(worldZ(COURSE))} rx={6} fill="#2E5E78" opacity={0.75} />
        {/* tributaries — the network that makes the river */}
        {tribPaths.map((t) => (
          <path key={t.name} d={t.d} fill="none" stroke="#7FD4FF" strokeWidth={1.3} strokeLinecap="round" opacity={0.7} />
        ))}
        {/* distributaries over the delta */}
        {distribPaths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#7FD4FF" strokeWidth={1.5} strokeLinecap="round" opacity={0.8} />
        ))}
        {/* the main stem */}
        <path d={riverPath} fill="none" stroke="#0E1C28" strokeWidth={5} strokeLinecap="round" opacity={0.6} />
        <path d={riverPath} fill="none" stroke="#7FD4FF" strokeWidth={2.6} strokeLinecap="round" opacity={0.95} />
        {/* checkpoints */}
        {CHECKPOINTS.map((c, i) => {
          const isSel = selected === c.id
          const done = i <= passed
          return (
            <g key={c.id} className="cursor-pointer" onClick={() => setSelected(isSel ? null : c.id)}>
              <circle cx={sx(meanderX(c.s))} cy={sz(worldZ(c.s))} r={10} fill="transparent" />
              {isSel && <circle cx={sx(meanderX(c.s))} cy={sz(worldZ(c.s))} r={7.5} fill="none" stroke="#FFD87E" strokeWidth={1.6} opacity={0.9} />}
              <circle
                cx={sx(meanderX(c.s))}
                cy={sz(worldZ(c.s))}
                r={4.2}
                fill={done ? '#FFD87E' : '#FBF5EA'}
                stroke="#0E1C28"
                strokeWidth={1.2}
                opacity={done || isSel ? 1 : 0.75}
              />
            </g>
          )
        })}
        {/* the pebble */}
        <circle cx={sx(meanderX(sim.pebble.s, sim.years))} cy={sz(worldZ(sim.pebble.s))} r={2.6} fill="#AEB8C4" stroke="#0E1C28" strokeWidth={0.8} />
        {/* Ploob */}
        {sim.ploobActive && (
          <g>
            <circle cx={sx(meanderX(sim.ploobS, sim.years))} cy={sz(worldZ(sim.ploobS))} r={6.5} fill="#7FC4EE" opacity={0.35} />
            <circle cx={sx(meanderX(sim.ploobS, sim.years))} cy={sz(worldZ(sim.ploobS))} r={3.6} fill="#7FC4EE" stroke="#FBF5EA" strokeWidth={1.2} />
          </g>
        )}
      </svg>

      {cp && (
        <div className="flex flex-col gap-1 rounded-xl border border-[#FBF5EA]/15 bg-[#0E1C28]/70 p-2">
          <div className="flex items-start gap-1">
            <p className="grow text-[11px] leading-tight font-black text-[#FFD87E]">{cp.name}</p>
            <Tile onClick={() => setSelected(null)} round className="-mt-0.5 text-[#EAF4F8]/60 hover:text-[#EAF4F8]">
              <X className="h-3 w-3" />
            </Tile>
          </div>
          <p className="text-[9.5px] leading-snug font-semibold text-[#EAF4F8]/75">{cp.blurb}</p>
          <div className="flex flex-col">
            {checkpointData(sim, cp).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 text-[9.5px] font-bold">
                <span className="text-[#9ABFD4]">{k}</span>
                <span className="text-right font-mono text-[#EAF4F8]">{v}</span>
              </div>
            ))}
          </div>
          <p className="text-[9.5px] leading-snug font-bold text-[#FFD87E]/90 italic">{cp.teach}</p>
        </div>
      )}
    </div>
  )
}
