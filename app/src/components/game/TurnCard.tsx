import Ploob2 from '@/components/brand/Ploob2'

/**
 * What a phone held upright shows: one card, and nothing behind it.
 *
 * Not a rotate button — `screen.orientation.lock()` is unsupported on iOS
 * Safari and needs fullscreen elsewhere, and a control that silently fails
 * teaches that the cabinet is broken rather than that the phone is narrow.
 * A sign, then: Ploob, one line, the turn glyph. The cabinet mounts in place
 * the moment the device turns, because the page simply renders it instead.
 */
export default function TurnCard({ line }: { line?: string }) {
  return (
    <div
      data-testid="turn-card"
      data-focus-layer=""
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#F6F2E8] p-6"
    >
      <div className="atlas-plate w-full max-w-[22rem] px-6 py-7 text-center">
        <div className="flex justify-center">
          <Ploob2 size={64} />
        </div>
        <h1 className="atlas-serif mt-4 text-[24px] leading-tight font-semibold text-[#2A2823]">
          Turn your phone sideways
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed font-semibold text-[#5F5A4E]">
          {line ?? 'Ploobia is played the wide way round.'}
        </p>
        <div className="mt-5 text-[34px] leading-none text-[#8B8471]" aria-hidden>
          ⟲
        </div>
      </div>
    </div>
  )
}
