import { Link } from 'react-router'
import { Award, FlaskConical, Ticket } from 'lucide-react'
import { BAND_META, useBand } from '@/lib/bands'
import { faceFor, useProgress } from '@/lib/progression'

/**
 * The learner's standing, band-skinned from one derivation:
 * Explorer — tickets and badges; Scientist — lab level; Analyst — rank.
 * Links to the lab record on the home page.
 */
export default function ProgressChip({ compact = false }: { compact?: boolean }) {
  const [band] = useBand()
  const progress = useProgress()
  const face = faceFor(band, progress)
  const tint = BAND_META[band].tint
  const Icon = band === 'explorer' ? Ticket : band === 'scientist' ? FlaskConical : Award

  if (compact) {
    return (
      <Link
        to="/home"
        aria-label={`Progress: ${face.headline}`}
        className="pointer-events-auto flex items-center gap-2 rounded-full border border-[#F3E9D7] bg-[#FBF5EA]/90 px-3 py-1.5 shadow-lg backdrop-blur-md"
      >
        <Icon className="h-3.5 w-3.5" style={{ color: tint }} />
        <span className="text-[11px] font-black text-[#402222] tabular-nums">{face.headline}</span>
      </Link>
    )
  }

  return (
    <Link
      to="/home"
      aria-label={`Progress: ${face.headline}`}
      title={face.nextLabel}
      className="pointer-events-auto block w-[15.5rem] rounded-[20px] border border-[#F3E9D7] bg-[#FBF5EA]/90 px-4 py-2.5 shadow-xl backdrop-blur-md transition-transform hover:scale-[1.02]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[13px] font-black text-[#402222] tabular-nums">
          <Icon className="h-4 w-4" style={{ color: tint }} />
          {face.headline}
        </span>
        <span className="text-[10px] font-extrabold text-[#A08750]">{face.sub}</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#F3E9D7]">
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{ width: `${Math.round(face.ratio * 100)}%`, background: tint }}
        />
      </div>
      <p className="mt-1 truncate text-[10px] font-bold text-[#7A5252]">{face.nextLabel}</p>
    </Link>
  )
}
