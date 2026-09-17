import { useState } from 'react'
import { BookOpen, Eye, FlaskConical, Play } from 'lucide-react'
import { useLayoutTier } from '@/hooks/use-layout'
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
  onBook,
}: {
  /** Play a stage: the next door by default, or the one tapped on the map. */
  onPlay: (stage: CampaignStage) => void
  onStart: () => void
  onDemo: () => void
  /** Open the field guide — the chapter is the other way in. */
  onBook?: () => void
}) {
  const [band] = useBand()
  const meta = BAND_META[band]
  const [shutNote, setShutNote] = useState<string | null>(null)
  const next = nextDoor()
  /** The phone tier is 390 px tall: the card drops its paragraph and tightens. */
  const phone = useLayoutTier() === 'phone'

  return (
    <div
      data-focus-layer=""
      className={`fixed inset-0 z-40 flex items-center justify-center bg-[#F6F2E8]/82 backdrop-blur-[3px] ${phone ? 'p-2' : 'p-5'}`}
    >
      <div className={`atlas-plate welcome-pop w-full text-center ${phone ? 'max-h-[calc(100vh-1rem)] max-w-[34rem] overflow-y-auto px-4 py-2.5' : 'max-w-[27rem] p-6'}`}>
        {/* The phone tier is 390 px tall: name and question on one line, the
            paragraph and the band chips gone, three quiet doors in a row. */}
        {phone ? (
          <div className="flex items-baseline justify-center gap-2">
            <h1 className="atlas-serif text-[24px] leading-none font-semibold text-[#2A2823]">The Sugar Line</h1>
            <span className="atlas-serif text-[12px] leading-tight text-[#8B8471] italic">Where does the sugar actually go?</span>
          </div>
        ) : (
          <>
            <span className="atlas-eyebrow">Biology · Plant transport</span>
            <h1 className="atlas-serif mt-1 text-[34px] leading-none font-semibold text-[#2A2823]">The Sugar Line</h1>
            <p className="atlas-serif mt-1 text-[14px] leading-tight text-[#8B8471] italic">Where does the sugar actually go?</p>
          </>
        )}

        {!phone && (
          <p className="mt-4 text-[12.5px] leading-relaxed font-semibold text-[#5F5A4E]">
            A leaf makes sugar out of air, water and light — then it has to get it somewhere. Catch
            what the leaf needs, then make the line run. Or take the whole lab and find out what
            stalls it yourself.
          </p>
        )}

        {!phone && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <span className="atlas-chip" style={{ borderColor: meta.tint, color: meta.tint }}>
              {meta.label} · {meta.ages}
            </span>
            <span className="atlas-chip">{meta.question}</span>
          </div>
        )}

        <CampaignMap
          compact={phone}
          onEnter={(s) => onPlay(s)}
          onShut={(_s, why) => setShutNote(why)}
        />
        {shutNote && (
          <p data-testid="door-note" className="mt-1.5 text-[11px] leading-snug font-bold text-[#8B8471]">
            {shutNote}
          </p>
        )}

        <div className={`${phone ? 'mt-2' : 'mt-4'} flex flex-col gap-2`}>
          <Tile
            onClick={() => onPlay(next)}
            aria-label="Play"
            className={`atlas-invite flex items-center justify-center gap-2 rounded-full bg-[#2F6134] px-6 text-[14px] font-extrabold text-[#FBF8EF] shadow transition-all hover:bg-[#24512A] active:scale-95 ${phone ? 'py-2' : 'py-3'}`}
          >
            <Play className="h-4 w-4" />
            {next.id === 1 ? 'Play — catch light, then run the line' : `Play — stage ${next.id}, ${next.name}`}
          </Tile>
          <div className={`flex gap-2 ${phone ? 'flex-row' : 'flex-col sm:flex-row'}`}>
            <Tile
              onClick={onStart}
              aria-label="Start"
              className={`flex flex-1 items-center justify-center gap-2 rounded-full border border-[#E4DCC9] bg-[#FCFAF4] font-extrabold text-[#5F5A4E] transition-all hover:bg-[#F1ECDE] active:scale-95 ${phone ? 'px-3 py-1.5 text-[12px]' : 'px-5 py-2.5 text-[13px]'}`}
            >
              <FlaskConical className="h-4 w-4" />
              {phone ? 'Explore the lab' : 'Explore the lab on your own'}
            </Tile>
            <Tile
              onClick={onDemo}
              aria-label="Watch it play itself"
              className={`flex flex-1 items-center justify-center gap-2 rounded-full border border-[#E4DCC9] bg-[#FCFAF4] font-extrabold text-[#5F5A4E] transition-all hover:bg-[#F1ECDE] active:scale-95 ${phone ? 'px-3 py-1.5 text-[12px]' : 'px-5 py-2.5 text-[13px]'}`}
            >
              <Eye className="h-4 w-4" />
              Watch it first
            </Tile>
            {onBook && phone && (
              <Tile
                onClick={onBook}
                aria-label="Read the field guide"
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-[#EAD0A0] bg-[#FBEBD2] px-3 py-1.5 text-[12px] font-extrabold text-[#8A5A0B] transition-all hover:bg-[#F6E1BD] active:scale-95"
              >
                <BookOpen className="h-3.5 w-3.5" />
                Field guide
              </Tile>
            )}
          </div>
          {onBook && !phone && (
            <Tile
              onClick={onBook}
              aria-label="Read the field guide"
              className="mx-auto flex items-center gap-1.5 rounded-full border border-[#EAD0A0] bg-[#FBEBD2] px-4 py-1.5 text-[11.5px] font-extrabold text-[#8A5A0B] transition-all hover:bg-[#F6E1BD] active:scale-95"
            >
              <BookOpen className="h-3.5 w-3.5" />
              or open the field guide — photosynthesis and transport, chapters 6 and 8
            </Tile>
          )}
        </div>
      </div>
    </div>
  )
}
