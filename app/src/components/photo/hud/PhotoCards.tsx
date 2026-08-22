import { useEffect, useState } from 'react'
import { Candy, ChevronDown, ChevronUp, Info, Sparkles, X } from 'lucide-react'
import { PHOTO_TICKER_FACTS, type PhotoSim } from '@/lib/photo'

/** Live counter of glucose molecules the leaf has cooked up. */
export function GlucoseChip({ sim, compact = false }: { sim: PhotoSim; compact?: boolean }) {
  const [glucose, setGlucose] = useState(0)
  const [oxygen, setOxygen] = useState(0)

  useEffect(() => {
    const t = window.setInterval(() => {
      const g = Math.floor(sim.glucose)
      const o = Math.floor(sim.oxygen)
      setGlucose((prev) => (prev === g ? prev : g))
      setOxygen((prev) => (prev === o ? prev : o))
    }, 250)
    return () => window.clearInterval(t)
  }, [sim])

  if (compact) {
    return (
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-[#F3E9D7] bg-[#FBF5EA]/90 px-3 py-1.5 shadow-lg backdrop-blur-md">
        <Candy className="h-3.5 w-3.5 text-[#B97D10]" />
        <span className="text-[11px] font-extrabold text-[#7A5252]">
          Glucose{' '}
          <span key={Math.floor(glucose / 10)} className="counter-pop text-[13px] font-black text-[#B97D10] tabular-nums">
            {glucose.toLocaleString()}
          </span>
        </span>
        <span className="text-[11px] font-extrabold text-[#7A5252]">
          O₂ <span className="text-[13px] font-black text-[#2E6DA8] tabular-nums">{oxygen.toLocaleString()}</span>
        </span>
      </div>
    )
  }

  return (
    <div className="pointer-events-auto rounded-[20px] border border-[#F3E9D7] bg-[#FBF5EA]/90 px-4 py-3 shadow-xl backdrop-blur-md">
      <div className="flex items-center gap-2">
        <Candy className="h-4 w-4 text-[#B97D10]" />
        <span className="text-sm font-black tracking-tight text-[#402222]">Photosynthesis Lab</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-[11px] font-bold text-[#7A5252]">Glucose made:</span>
        <span
          key={Math.floor(glucose / 10)}
          className="counter-pop text-lg font-black text-[#B97D10] tabular-nums"
        >
          {glucose.toLocaleString()}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[11px] font-bold text-[#7A5252]">O₂ released:</span>
        <span className="text-sm font-black text-[#2E6DA8] tabular-nums">{oxygen.toLocaleString()}</span>
      </div>
    </div>
  )
}

/** "Did you know?" ticker with plant science facts. */
export function PhotoTicker() {
  const [pool, setPool] = useState<string[]>(PHOTO_TICKER_FACTS)
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    const shuffleTimer = window.setTimeout(() => {
      const arr = [...PHOTO_TICKER_FACTS]
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      }
      setPool(arr)
    }, 50)
    const t = window.setInterval(() => setIdx((i) => i + 1), 12000)
    return () => {
      window.clearTimeout(shuffleTimer)
      window.clearInterval(t)
    }
  }, [])

  return (
    <div className="pointer-events-auto flex w-[min(21rem,calc(100vw-2rem))] items-start gap-3 rounded-[20px] border border-[#F3E9D7] bg-[#FBF5EA]/90 p-4 shadow-xl backdrop-blur-md">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#3E7C43]/15">
        <Sparkles className="h-4 w-4 text-[#3E7C43]" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-black tracking-widest text-[#3E7C43] uppercase">
          Did you know?
        </div>
        <p key={idx} className="ticker-fade mt-1 text-[13px] leading-snug font-semibold text-[#5C3A3A]">
          {pool[idx % pool.length]}
        </p>
      </div>
    </div>
  )
}

/** Collapsible explainer: photosynthesis + osmosis + diffusion at 8th-grade level. */
export function PhotoAbout() {
  const [open, setOpen] = useState(false)

  return (
    <div className="pointer-events-auto w-full max-w-[21rem] rounded-[20px] border border-[#F3E9D7] bg-[#FBF5EA]/90 shadow-xl backdrop-blur-md">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-extrabold text-[#402222]">
          <Info className="h-4 w-4 text-[#3E7C43]" />
          About this lab
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-[#7A5252]" />
        ) : (
          <ChevronUp className="h-4 w-4 text-[#7A5252]" />
        )}
      </button>
      {open && (
        <div className="max-h-[50dvh] space-y-3 overflow-y-auto px-4 pb-4 text-[13px] leading-relaxed font-semibold text-[#5C3A3A]">
          <div className="rounded-[14px] bg-[#EAF3E6] px-3 py-2.5 text-center">
            <div className="text-[11px] font-black tracking-widest text-[#3E7C43] uppercase">
              The photosynthesis recipe
            </div>
            <p className="mt-1 font-black text-[#2E5C33]">
              6CO₂ + 6H₂O + light → C₆H₁₂O₆ + 6O₂
            </p>
            <p className="mt-1 text-[11px] font-bold text-[#6B8A5E]">
              carbon dioxide + water + light → glucose + oxygen
            </p>
          </div>
          <p>
            <strong className="text-[#3E7C43]">Photosynthesis</strong> is how plants make food.
            Inside tiny green factories called <strong>chloroplasts</strong>, the pigment
            chlorophyll catches sunlight and uses its energy to stitch CO₂ and water into{' '}
            <strong>glucose</strong> (a sugar). The leftovers — oxygen — float out of the leaf
            for us to breathe. Run out of any ingredient and the whole recipe slows down: the
            scarcest one is the <strong>limiting factor</strong>.
          </p>
          <p>
            The rate never rises forever. Add more of one factor and the curve bends and{' '}
            <strong>plateaus</strong> — at that point something else has become limiting, and only
            that thing is worth adding. Meanwhile <strong>respiration</strong> runs every second,
            using oxygen and burning sugar. Subtract it and you get the <strong>net</strong> rate,
            which is what the apparatus actually measures. Dim the light far enough and the two
            exactly cancel: that is the <strong>compensation point</strong>.
          </p>
          <p>
            Every leaf lives with one unavoidable conflict. CO₂ gets in through pores called{' '}
            <strong>stomata</strong> — and water gets out through the same pores. Open them and you
            gain carbon but lose water; close them and you save water but starve. Every leaf shape
            on Earth, from a rainforest blade the size of a dinner plate to a cactus spine, is a
            different settlement of that one argument.
          </p>
          <p>
            <strong className="text-[#2E6DA8]">Diffusion</strong> is particles spreading from a
            crowded spot to a roomy one, powered purely by their random jiggling. That is how
            CO₂ slips into a leaf and O₂ slips out.
          </p>
          <p>
            <strong className="text-[#1E8A7B]">Osmosis</strong> is a special diffusion of water:
            water crosses a <strong>semi-permeable membrane</strong> (one with tiny holes only
            water fits through) toward the side with more dissolved stuff like salt or sugar.
            Roots use osmosis to drink water from the soil and send it up to every leaf.
          </p>
        </div>
      )}
    </div>
  )
}

export interface PhotoFact {
  text: string
  key: number
}

/** Pop-up card with a chloroplast fact. */
export function PhotoFactCard({ fact, onClose }: { fact: PhotoFact; onClose: () => void }) {
  return (
    <div
      key={fact.key}
      className="fact-pop pointer-events-auto w-[min(26rem,calc(100vw-2rem))] rounded-[22px] border border-[#F3E9D7] bg-[#FBF5EA] p-5 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: '#57A75B' }} />
          <span className="text-sm font-black tracking-wide text-[#402222] uppercase">
            Chloroplast secrets
          </span>
          <Sparkles className="h-4 w-4 text-[#E8A33D]" />
        </div>
        <button
          onClick={onClose}
          aria-label="Close fact"
          className="rounded-full p-1.5 text-[#7A5252] transition-colors hover:bg-[#F3E9D7]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-3 text-[15px] leading-relaxed font-semibold text-[#5C3A3A]">{fact.text}</p>
      <p className="mt-3 text-xs font-bold text-[#B08A7A]">Tap the chloroplast again for the next fact!</p>
    </div>
  )
}
