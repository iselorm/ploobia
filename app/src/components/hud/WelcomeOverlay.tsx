import { useState } from 'react'
import { ArrowRight, Heart } from 'lucide-react'

interface Props {
  onStart: () => void
}

/** Full-screen welcome scrim shown before the ride begins. */
export default function WelcomeOverlay({ onStart }: Props) {
  const [leaving, setLeaving] = useState(false)

  const handleStart = () => {
    setLeaving(true)
    window.setTimeout(onStart, 420)
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
          'radial-gradient(ellipse at center, rgba(90, 22, 24, 0.55) 0%, rgba(46, 8, 11, 0.82) 100%)',
      }}
    >
      <div
        className={`welcome-pop w-full max-w-lg rounded-[28px] border border-[#F3E9D7] bg-[#FBF5EA] p-8 text-center shadow-2xl transition-all sm:p-10 ${
          leaving ? 'scale-95 opacity-0' : ''
        }`}
        style={{ transitionDuration: '420ms' }}
      >
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#C13B33] shadow-lg">
          <Heart className="h-8 w-8 fill-[#FBF5EA] text-[#FBF5EA]" />
        </div>
        <h1 className="text-4xl font-black tracking-tight text-[#402222] sm:text-5xl">
          Blood Voyage
        </h1>
        <p className="mt-2 text-lg font-bold text-[#C13B33]">The Oxygen Journey</p>
        <p className="mx-auto mt-4 max-w-sm text-[15px] leading-relaxed font-semibold text-[#7A5252]">
          Shrunk down to cell size, you start in the lungs — where your red cell loads up on
          oxygen — then ride the full circuit: left heart, artery, a capillary so narrow the cells
          squeeze single file, out to the living cells waiting for their delivery, home through the
          vein and the right heart. You decide what the body is doing — resting, jogging or
          sprinting — and everything changes: heart rate, speed, and how much oxygen each cell
          hands over.
        </p>
        <button
          onClick={handleStart}
          className="group mx-auto mt-7 flex items-center gap-2 rounded-full bg-[#C13B33] px-8 py-4 text-lg font-extrabold text-[#FBF5EA] shadow-lg transition-all duration-200 hover:scale-[1.04] hover:bg-[#9E2B25] active:scale-[0.97]"
        >
          Start in the lungs
          <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
        </button>
        <p className="mt-4 text-xs font-semibold text-[#B08A7A]">
          Tip: the golden ring is YOUR red cell. Watch its 4 oxygen sites as you ride.
        </p>
      </div>
    </div>
  )
}
