import { useEffect, useState } from 'react'
import { Droplet, Wind } from 'lucide-react'
import { useBandCaps } from '@/lib/bands'
import { simLeaf, simPhysiology, type PhotoSim } from '@/lib/photo'

/**
 * The water side of the story, made visible: how far the stomata are open, how
 * hard the air is pulling, and whether the leaf is winning or losing.
 *
 * This is where the CO₂-in-versus-water-out trade-off stops being a sentence in
 * a textbook and becomes something you can watch happen.
 */

/** A stoma drawn from two guard cells that bow apart as conductance rises. */
function Stoma({ open }: { open: number }) {
  // Aperture in SVG units — never quite zero so the outline stays readable.
  const gap = 1.2 + open * 7.4
  return (
    <svg viewBox="0 0 44 30" className="h-[30px] w-[44px] shrink-0" aria-hidden="true">
      <ellipse cx="22" cy="15" rx="20" ry="13" fill="#DDEBD9" />
      {/* Guard cells: two crescents whose inner edges pull apart. */}
      <path
        d={`M6 15 Q22 ${15 - gap} 38 15 Q22 ${15 - gap - 5.5} 6 15 Z`}
        fill="#5E9E63"
        stroke="#3E7C43"
        strokeWidth="1"
      />
      <path
        d={`M6 15 Q22 ${15 + gap} 38 15 Q22 ${15 + gap + 5.5} 6 15 Z`}
        fill="#5E9E63"
        stroke="#3E7C43"
        strokeWidth="1"
      />
      {/* The pore itself. */}
      <path
        d={`M7 15 Q22 ${15 - gap} 37 15 Q22 ${15 + gap} 7 15 Z`}
        fill="#2B3A2C"
        opacity={0.25 + open * 0.55}
      />
    </svg>
  )
}

function Bar({
  label,
  value,
  color,
  caption,
}: {
  label: string
  value: number
  color: string
  caption?: string
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-bold text-[#7A5252]">{label}</span>
        <span className="text-[11px] font-black tabular-nums" style={{ color }}>
          {Math.round(value * 100)}%
        </span>
      </div>
      <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-[#EFE4CE]">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${Math.max(2, value * 100)}%`, background: color }}
        />
      </div>
      {caption && <p className="mt-0.5 text-[10px] font-bold text-[#B08A7A]">{caption}</p>}
    </div>
  )
}

export default function LeafVitals({ sim }: { sim: PhotoSim }) {
  const caps = useBandCaps()
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 260)
    return () => window.clearInterval(t)
  }, [])
  void tick

  const leaf = simLeaf(sim)
  const phys = simPhysiology(sim)
  const losing = phys.transpiration > phys.uptake * 1.02
  const wilting = sim.turgor < 0.45

  return (
    <div className="rounded-[14px] border border-[#DDEAD8] bg-[#EAF3E6] px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Stoma open={phys.conductance} />
        <div className="min-w-0">
          <div className="text-[11px] font-black tracking-wider text-[#2E7D32] uppercase">
            {phys.conductance < 0.12
              ? 'Stomata shut'
              : phys.conductance < 0.4
                ? 'Stomata part-open'
                : 'Stomata open'}
          </div>
          <p className="text-[10.5px] leading-snug font-bold text-[#5E7F5F]">
            {leaf.pathway === 'CAM'
              ? 'CAM: sealed shut all day — it collected its CO₂ last night.'
              : phys.conductance < 0.4
                ? 'Half shut to save water — which also throttles the CO₂ coming in.'
                : 'Wide open: CO₂ flooding in, water pouring out.'}
          </p>
        </div>
      </div>

      <div className="mt-2.5 space-y-2">
        <Bar
          label="Leaf firmness (turgor)"
          value={sim.turgor}
          color={wilting ? '#C13B33' : '#3E7C43'}
          caption={wilting ? 'Wilting — cells have lost their water pressure.' : undefined}
        />
        <Bar label="Soil water" value={sim.water} color="#2E6DA8" />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-[#D3E3CE] pt-2">
        <span className="flex items-center gap-1 text-[10.5px] font-extrabold text-[#7A5252]">
          <Droplet className="h-3 w-3 text-[#2E6DA8]" />
          {losing ? 'Losing water faster than it drinks' : 'Drinking faster than it loses'}
        </span>
        {caps.quantitative && (
          <span className="flex items-center gap-1 text-[10.5px] font-black text-[#8A7A55]">
            <Wind className="h-3 w-3" />
            VPD {phys.vpd.toFixed(2)} kPa
          </span>
        )}
      </div>

      {caps.waterEfficiency && (
        <p className="mt-1.5 text-[10.5px] leading-snug font-bold text-[#5E7F5F]">
          Water use efficiency:{' '}
          <strong className="text-[#2E7D32]">{phys.waterUseEfficiency.toFixed(1)}</strong> sugar
          units per unit of water lost.
        </p>
      )}
    </div>
  )
}
