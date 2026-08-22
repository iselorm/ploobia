import { useEffect, useState } from 'react'
import { Droplets } from 'lucide-react'
import type { SimState } from '@/lib/sim'
import { DEMANDS, deliveryPerMinute, getJourney, nowS } from '@/lib/journey'

/**
 * The delivery counter — the cabinet's headline number. Not "cells that went
 * past" (which measured nothing the learner controls) but **oxygen actually
 * handed to body cells**, plus the rate it is arriving at.
 *
 * That rate is trips-per-minute × molecules-per-trip: raise the demand dial
 * and BOTH factors climb, which is the shape of the real relationship between
 * blood flow, extraction and oxygen delivery. It is a reading from this
 * simulation, not a physiological figure in real units.
 */
export default function CounterChip({ sim }: { sim: SimState }) {
  const [, force] = useState(0)

  useEffect(() => {
    const t = window.setInterval(() => force((n) => n + 1), 220)
    return () => window.clearInterval(t)
  }, [sim])

  const j = getJourney()
  const rate = deliveryPerMinute()
  const perLap = DEMANDS[j.demand].extraction
  const justDelivered = nowS() - j.deliveredAt < 1.4

  return (
    <div className="pointer-events-auto rounded-[20px] border border-[#F3E9D7]/60 bg-[#FBF5EA]/70 px-4 py-3 shadow-xl backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <Droplets className="h-4 w-4 text-[#C13B33]" />
        <span className="text-sm font-black tracking-tight text-[#402222]">O₂ delivered</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span
          key={j.o2Delivered}
          className={`text-lg font-black tabular-nums ${
            justDelivered ? 'counter-pop text-[#2E6DA8]' : 'text-[#402222]'
          }`}
        >
          {j.o2Delivered.toLocaleString()}
        </span>
        <span className="text-[11px] font-bold text-[#8A5F4C]">
          · {perLap} per trip
        </span>
      </div>
      <div className="mt-0.5 text-[11px] font-extrabold text-[#2E6DA8] tabular-nums">
        {rate.toFixed(1)} / min
      </div>
    </div>
  )
}
