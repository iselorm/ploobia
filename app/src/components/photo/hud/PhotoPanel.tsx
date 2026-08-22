import { useState } from 'react'
import { ChevronDown, Droplets, FlaskConical, Leaf, SlidersHorizontal } from 'lucide-react'
import { useBandCaps } from '@/lib/bands'
import { Tile } from '@/components/ui/tile'
import type { LabMode } from '@/lib/photo'

interface Props {
  mode: LabMode
  onMode: (mode: LabMode) => void
  /** Garden-mode contents (the Rate Lab controls). */
  garden: React.ReactNode
  /** Roots-mode contents (the membrane bench controls). */
  roots: React.ReactNode
  /** Rendered inside the compact bottom drawer: no card chrome, no collapse. */
  embedded?: boolean
}

/**
 * Panel shell: scene tabs, the collapse affordance, and the osmosis/diffusion
 * bench. The rate experiment itself lives in `RateLabPanel` and arrives as
 * children, so this file stays about layout.
 */
export default function PhotoPanel({ mode, onMode, garden, roots, embedded = false }: Props) {
  const caps = useBandCaps()
  const [open, setOpen] = useState(() => (typeof window === 'undefined' ? true : window.innerWidth > 720))

  if (!open && !embedded) {
    return (
      <Tile
        onClick={() => setOpen(true)}
        aria-label="Open controls"
        className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-[#F3E9D7] bg-[#FBF5EA]/90 shadow-xl backdrop-blur-md transition-transform duration-200 hover:scale-105 active:scale-95"
      >
        <SlidersHorizontal className="h-5 w-5 text-[#3E7C43]" />
      </Tile>
    )
  }

  const tabBtn = (active: boolean) =>
    `flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-extrabold transition-all duration-200 ${
      active
        ? 'bg-[#3E7C43] text-[#FBF5EA] shadow'
        : 'bg-[#F3E9D7] text-[#7A5252] hover:bg-[#EBDFC8]'
    }`

  return (
    <div
      className={
        embedded
          ? 'pointer-events-auto w-full px-1 pb-1'
          : 'pointer-events-auto max-h-full w-[19.5rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-[22px] border border-[#F3E9D7] bg-[#FBF5EA]/92 p-4 shadow-xl backdrop-blur-md'
      }
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-[#3E7C43]" />
          <span className="text-[13px] font-extrabold tracking-wide text-[#402222] uppercase">
            {mode === 'roots'
              ? 'Membrane bench'
              : caps.vocab === 'simple'
                ? 'Leaf scientist kit'
                : 'Rate lab'}
          </span>
        </div>
        {!embedded && (
          <Tile
            round
            onClick={() => setOpen(false)}
            aria-label="Collapse controls"
            className="flex items-center justify-center rounded-full text-[#7A5252] transition-colors hover:bg-[#F3E9D7]"
          >
            <ChevronDown className="h-4 w-4" />
          </Tile>
        )}
      </div>

      <div className="mb-3 flex gap-2">
        <button onClick={() => onMode('garden')} className={tabBtn(mode === 'garden')}>
          <Leaf className="h-3.5 w-3.5" /> Leaf lab
        </button>
        <button onClick={() => onMode('roots')} className={tabBtn(mode === 'roots')}>
          <Droplets className="h-3.5 w-3.5" /> Membranes
        </button>
      </div>

      {mode === 'garden' ? garden : roots}
    </div>
  )
}
