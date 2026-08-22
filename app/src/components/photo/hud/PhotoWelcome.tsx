import { useState } from 'react'
import { ArrowRight, Leaf, PlayCircle } from 'lucide-react'
import BandSwitch from '@/components/hud/BandSwitch'

interface Props {
  onStart: () => void
  onDemo: () => void
}

/** Full-screen welcome scrim for the Photosynthesis Lab. */
export default function PhotoWelcome({ onStart, onDemo }: Props) {
  const [leaving, setLeaving] = useState(false)

  const handleStart = () => {
    setLeaving(true)
    window.setTimeout(onStart, 420)
  }

  const handleDemo = () => {
    setLeaving(true)
    window.setTimeout(onDemo, 420)
  }

  return (
    <div
      data-focus-layer={leaving ? undefined : ''}
      className={`hud fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-[6px] transition-opacity ${
        leaving ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
      style={{
        transitionDuration: '420ms',
        background:
          'radial-gradient(ellipse at center, rgba(58, 96, 62, 0.5) 0%, rgba(30, 52, 34, 0.82) 100%)',
      }}
    >
      <div
        className={`welcome-pop max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-[28px] border border-[#F3E9D7] bg-[#FBF5EA] p-6 text-center shadow-2xl transition-all sm:p-9 ${
          leaving ? 'scale-95 opacity-0' : ''
        }`}
        style={{ transitionDuration: '420ms' }}
      >
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#3E7C43] shadow-lg">
          <Leaf className="h-8 w-8 fill-[#FBF5EA] text-[#FBF5EA]" />
        </div>
        <h1 className="text-4xl font-black tracking-tight text-[#402222] sm:text-5xl">
          Photosynthesis Lab
        </h1>
        <p className="mt-2 text-lg font-bold text-[#3E7C43]">The Rate Lab</p>
        <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed font-semibold text-[#7A5252]">
          You're a leaf scientist. Mount a leaf, drop it into a climate, change one factor at a time
          and measure the oxygen coming off it — then plot the curve and work out what is really
          holding the plant back.
        </p>
        <div className="mx-auto mt-5">
          <BandSwitch variant="full" />
        </div>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            onClick={handleDemo}
            className="group flex items-center gap-2 rounded-full border-2 border-[#3E7C43] px-6 py-3.5 text-base font-extrabold text-[#3E7C43] transition-all duration-200 hover:scale-[1.03] hover:bg-[#EAF3E6] active:scale-[0.97]"
          >
            <PlayCircle className="h-5 w-5" />
            Show me how it works
          </button>
          <button
            onClick={handleStart}
            className="group flex items-center gap-2 rounded-full bg-[#3E7C43] px-7 py-3.5 text-base font-extrabold text-[#FBF5EA] shadow-lg transition-all duration-200 hover:scale-[1.04] hover:bg-[#2F6134] active:scale-[0.97]"
          >
            Start experimenting
            <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
          </button>
        </div>
        <p className="mt-4 text-xs font-semibold text-[#B08A7A]">
The demo runs a real investigation using these controls — about a minute. Drag to orbit, scroll to zoom.
        </p>
      </div>
    </div>
  )
}
