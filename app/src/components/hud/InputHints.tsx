import { useInputState } from '@/lib/input'

/**
 * Console-style glyph strip. Appears along the bottom edge only when a game
 * controller is driving the page and disappears when it is unplugged, exactly
 * as games do. Cabinets can pass extra hints (e.g. "LB/RB Switch bench").
 */
export default function InputHints({ extra }: { extra?: Array<[string, string]> }) {
  const { mode } = useInputState()
  if (mode !== 'gamepad' && mode !== 'tv') return null

  const hints: Array<[string, string]> = [
    ['A', 'Select'],
    ['B', 'Back'],
    ['✛', 'Move'],
    ['RS', 'Orbit'],
    ['LT/RT', 'Zoom'],
    ...(extra ?? []),
  ]

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(0.6rem,env(safe-area-inset-bottom))]"
      aria-hidden="true"
    >
      <div className="flex items-center gap-4 rounded-full border border-white/10 bg-[#1B1712]/85 px-5 py-2 text-[12px] font-extrabold text-[#FBF5EA]/90 shadow-2xl backdrop-blur-md">
        {hints.map(([glyph, label]) => (
          <span key={glyph + label} className="flex items-center gap-1.5">
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#FBF5EA] px-1.5 text-[11px] font-black text-[#1B1712]">
              {glyph}
            </span>
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
