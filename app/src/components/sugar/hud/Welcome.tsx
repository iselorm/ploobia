import { useState } from 'react'
import { Eye, FlaskConical, Play } from 'lucide-react'
import { Tile } from '@/components/ui/tile'
import { useBand } from '@/lib/bands'
import { BAND_META } from '@/lib/bands'
import { nextDoor, type CampaignStage } from '@/lib/campaign'
import CampaignMap from './CampaignMap'

/**
 * The way in.
 *
 * The house rule is that instructions are explicit, not discoverable, so the
 * card says in one sentence what this cabinet is about and gives three doors,
 * in this order: **play** — the challenge, which is the arcade's front door —
 * then the free lab, then the demo. Play leads because this is an arcade and
 * a game that was only reachable by a chip in the top bar did not, for the
 * learner, exist. The free lab is one tap away and untouched.
 */
export default function Welcome({
  onPlay,
  onStart,
  onDemo,
}: {
  /** Play a stage: the next door by default, or the one tapped on the map. */
  onPlay: (stage: CampaignStage) => void
  onStart: () => void
  onDemo: () => void
}) {
  const [band] = useBand()
  const meta = BAND_META[band]
  const [shutNote, setShutNote] = useState<string | null>(null)
  const next = nextDoor()

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
          A leaf makes sugar out of air, water and light — then it has to get it somewhere. Catch
          what the leaf needs, then make the line run. Or take the whole lab and find out what
          stalls it yourself.
        </p>

        <div className="mt-4 flex items-center justify-center gap-2">
          <span className="atlas-chip" style={{ borderColor: meta.tint, color: meta.tint }}>
            {meta.label} · {meta.ages}
          </span>
          <span className="atlas-chip">{meta.question}</span>
        </div>

        <CampaignMap
          onEnter={(s) => onPlay(s)}
          onShut={(_s, why) => setShutNote(why)}
        />
        {shutNote && (
          <p data-testid="door-note" className="mt-1.5 text-[11px] leading-snug font-bold text-[#8B8471]">
            {shutNote}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <Tile
            onClick={() => onPlay(next)}
            aria-label="Play"
            className="atlas-invite flex items-center justify-center gap-2 rounded-full bg-[#2F6134] px-6 py-3 text-[14px] font-extrabold text-[#FBF8EF] shadow transition-all hover:bg-[#24512A] active:scale-95"
          >
            <Play className="h-4 w-4" />
            {next.id === 1 ? 'Play — catch light, then run the line' : `Play — stage ${next.id}, ${next.name}`}
          </Tile>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Tile
              onClick={onStart}
              aria-label="Start"
              className="flex flex-1 items-center justify-center gap-2 rounded-full border border-[#E4DCC9] bg-[#FCFAF4] px-5 py-2.5 text-[13px] font-extrabold text-[#5F5A4E] transition-all hover:bg-[#F1ECDE] active:scale-95"
            >
              <FlaskConical className="h-4 w-4" />
              Explore the lab on your own
            </Tile>
            <Tile
              onClick={onDemo}
              aria-label="Watch it play itself"
              className="flex flex-1 items-center justify-center gap-2 rounded-full border border-[#E4DCC9] bg-[#FCFAF4] px-5 py-2.5 text-[13px] font-extrabold text-[#5F5A4E] transition-all hover:bg-[#F1ECDE] active:scale-95"
            >
              <Eye className="h-4 w-4" />
              Watch it first
            </Tile>
          </div>
        </div>
      </div>
    </div>
  )
}
