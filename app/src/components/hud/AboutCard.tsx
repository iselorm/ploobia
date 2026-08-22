import { useState } from 'react'
import { ChevronDown, ChevronUp, Info } from 'lucide-react'

/** Collapsible explainer card about what red blood cells actually do. */
export default function AboutCard({ embedded = false }: { embedded?: boolean } = {}) {
  const [open, setOpen] = useState(() =>
    embedded ? true : typeof window === 'undefined' ? true : window.innerWidth > 900,
  )

  return (
    <div
      className={
        embedded
          ? 'pointer-events-auto w-full'
          : 'pointer-events-auto w-[min(21rem,calc(100vw-2rem))] rounded-[20px] border border-[#F3E9D7]/60 bg-[#FBF5EA]/70 shadow-xl backdrop-blur-xl'
      }
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left ${
          embedded ? 'hidden' : ''
        }`}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-extrabold text-[#402222]">
          <Info className="h-4 w-4 text-[#C13B33]" />
          About this journey
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-[#7A5252]" />
        ) : (
          <ChevronUp className="h-4 w-4 text-[#7A5252]" />
        )}
      </button>
      {open && (
        <p className="px-4 pb-4 text-[13px] leading-relaxed font-semibold text-[#5C3A3A]">
          You are riding one full lap of your <strong>double circulation</strong> — the heart is
          crossed <strong>twice</strong>, which is why you have two pumps. In the{' '}
          <strong>lungs</strong>, oxygen slips through a paper-thin wall and clicks onto{' '}
          <strong>haemoglobin</strong> inside every dimpled <strong>red blood cell</strong> (the one
          in the golden ring is yours, with 4 sites). The thick-walled <strong>left heart</strong>{' '}
          shoves you down an <strong>artery</strong> into a <strong>capillary</strong> so narrow the
          cells go single file — and there oxygen is handed to the <strong>body cells</strong>,
          whose <strong>mitochondria</strong> burn it for energy. Here is the surprise: at rest each
          cell gives up only <strong>1 of its 4</strong>. Your veins still carry a three-quarters
          reserve. Set the body sprinting and hot, acidic muscle prises <strong>3 of 4</strong>{' '}
          loose — same cells, triple the delivery. Their waste <strong>CO₂</strong> rides home
          through the <strong>vein</strong> to the thinner-walled <strong>right heart</strong>,
          which sends you back to the lungs to breathe it out. Tap any cell to learn more.
        </p>
      )}
    </div>
  )
}
