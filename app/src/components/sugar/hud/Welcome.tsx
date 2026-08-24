import { Eye, Play } from 'lucide-react'
import { Tile } from '@/components/ui/tile'
import { useBand } from '@/lib/bands'
import { BAND_META } from '@/lib/bands'

/**
 * The way in.
 *
 * The house rule is that instructions are explicit, not discoverable, so the
 * card says in one sentence what this cabinet is about and gives exactly two
 * doors: do it, or watch it do itself first. Nothing else.
 */
export default function Welcome({ onStart, onDemo }: { onStart: () => void; onDemo: () => void }) {
  const [band] = useBand()
  const meta = BAND_META[band]

  return (
    <div
      data-focus-layer=""
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#F6F2E8]/82 p-5 backdrop-blur-[3px]"
    >
      <div className="atlas-plate welcome-pop w-full max-w-[27rem] p-6 text-center">
        <span className="atlas-eyebrow">Biology · Plant transport</span>
        <h1 className="atlas-serif mt-1 text-[34px] leading-none font-semibold text-[#2A2823]">
          The Sugar Line
        </h1>
        <p className="atlas-serif mt-1 text-[14px] leading-tight text-[#8B8471] italic">
          Where does the sugar actually go?
        </p>

        <p className="mt-4 text-[12.5px] leading-relaxed font-semibold text-[#5F5A4E]">
          A leaf makes sugar out of air, water and light. Then it has to get it somewhere — down a
          stem, into a pod, a tuber, a root. Run the line, find out what stalls it, and cut the pipe
          to prove which one it is.
        </p>

        <div className="mt-4 flex items-center justify-center gap-2">
          <span className="atlas-chip" style={{ borderColor: meta.tint, color: meta.tint }}>
            {meta.label} · {meta.ages}
          </span>
          <span className="atlas-chip">{meta.question}</span>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Tile
            onClick={onStart}
            aria-label="Start"
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#2F6134] px-6 py-3 text-[14px] font-extrabold text-[#FBF8EF] shadow transition-all hover:bg-[#24512A] active:scale-95"
          >
            <Play className="h-4 w-4" />
            Start the line
          </Tile>
          <Tile
            onClick={onDemo}
            aria-label="Watch it play itself"
            className="flex flex-1 items-center justify-center gap-2 rounded-full border border-[#E4DCC9] bg-[#FCFAF4] px-6 py-3 text-[14px] font-extrabold text-[#5F5A4E] transition-all hover:bg-[#F1ECDE] active:scale-95"
          >
            <Eye className="h-4 w-4" />
            Watch it first
          </Tile>
        </div>
      </div>
    </div>
  )
}
