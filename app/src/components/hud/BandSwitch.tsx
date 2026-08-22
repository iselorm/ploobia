import { BANDS, useBand } from '@/lib/bands'

/**
 * The platform-wide depth control. `full` is the card row on the menu, `compact`
 * is the segmented chip every cabinet carries so a learner can change level
 * mid-investigation without losing their data.
 */
export default function BandSwitch({ variant = 'compact' }: { variant?: 'compact' | 'full' }) {
  const [band, setBand] = useBand()

  if (variant === 'full') {
    return (
      <div className="w-full">
        <div className="mb-3 text-center text-xs font-black tracking-widest text-[#7A5252] uppercase">
          Choose your level — you can change it any time
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {BANDS.map((b) => {
            const active = b.id === band
            return (
              <button
                key={b.id}
                onClick={() => setBand(b.id)}
                aria-pressed={active}
                className={`rounded-[20px] border-2 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 ${
                  active ? 'shadow-lg' : 'border-[#F3E9D7] bg-[#FBF5EA]/70 hover:bg-[#FBF5EA]'
                }`}
                style={active ? { borderColor: b.tint, background: b.tintSoft } : undefined}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-black" style={{ color: b.tint }}>
                    {b.label}
                  </span>
                  <span className="text-[11px] font-extrabold text-[#A08750]">Ages {b.ages}</span>
                </div>
                <div className="mt-1 text-[12px] font-black text-[#402222] italic">
                  “{b.question}”
                </div>
                <p className="mt-1.5 text-[11.5px] leading-snug font-semibold text-[#7A5252]">
                  {b.blurb}
                </p>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div
      className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-[#F3E9D7] bg-[#FBF5EA]/90 p-1 shadow-lg backdrop-blur-md"
      role="group"
      aria-label="Learning level"
    >
      {BANDS.map((b) => {
        const active = b.id === band
        return (
          <button
            key={b.id}
            onClick={() => setBand(b.id)}
            aria-pressed={active}
            title={`${b.label} (ages ${b.ages}) — ${b.question}`}
            className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold transition-all duration-200 ${
              active ? 'text-[#FBF5EA] shadow' : 'text-[#7A5252] hover:bg-[#F3E9D7]'
            }`}
            style={active ? { background: b.tint } : undefined}
          >
            {b.label}
          </button>
        )
      })}
    </div>
  )
}
