import { Sparkles, X } from 'lucide-react'
import { CELL_COLORS, CELL_LABELS, type CellType } from '@/lib/facts'

export interface ActiveFact {
  type: CellType
  text: string
  key: number
  /** Overrides for cells that have a specific identity (e.g. a monocyte). */
  title?: string
  color?: string
}

interface Props {
  fact: ActiveFact
  onClose: () => void
}

/** Pop-up card shown when a cell is clicked, with a type-specific fun fact. */
export default function FactCard({ fact, onClose }: Props) {
  return (
    <div
      key={fact.key}
      className="fact-pop pointer-events-auto w-full max-w-[26rem] rounded-[22px] border border-[#F3E9D7] bg-[#FBF5EA] p-5 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ background: fact.color ?? CELL_COLORS[fact.type] }}
          />
          <span className="text-sm font-black tracking-wide text-[#402222] uppercase">
            {fact.title ?? CELL_LABELS[fact.type]}
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
      <p className="mt-3 text-xs font-bold text-[#B08A7A]">Tap another cell for the next fact!</p>
    </div>
  )
}
