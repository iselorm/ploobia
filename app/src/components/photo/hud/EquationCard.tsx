import { ChevronRight, Pause, Play, RotateCcw, X } from 'lucide-react'
import { Tile } from '@/components/ui/tile'
import { useBandCaps } from '@/lib/bands'

export interface EquationStepCopy {
  title: string
  body: string
}

const STEPS: Record<'simple' | 'formal' | 'technical', EquationStepCopy[]> = {
  simple: [
    { title: 'The ingredients', body: 'A leaf needs three things: carbon dioxide from the air, water from the roots, and light from the sun.' },
    { title: 'Light splits water', body: 'Inside the chloroplast, light breaks water apart. The oxygen escapes — those are the bubbles you counted!' },
    { title: 'Building sugar', body: 'The leaf grabs carbon dioxide and, using the energy from light, clicks six of them into one ring of sugar.' },
    { title: 'The whole recipe', body: 'Carbon dioxide + water + light → sugar + oxygen. That is photosynthesis — the recipe every green leaf runs.' },
  ],
  formal: [
    {
      title: 'Ingredients',
      body: 'CO₂ enters through the stomata, water arrives through the xylem from the roots, and light is absorbed by chlorophyll in the chloroplasts.',
    },
    {
      title: 'Light splits water',
      body: 'In the thylakoid membranes, light energy splits water. The oxygen is released as O₂ — the gas in your bubbles. The hydrogen and its electrons are captured as energy carriers (ATP and NADPH).',
    },
    {
      title: 'Carbon is fixed',
      body: 'In the stroma, the Calvin cycle spends that energy to bolt six CO₂ molecules together into one glucose ring, C₆H₁₂O₆.',
    },
    {
      title: 'The equation',
      body: '6CO₂ + 6H₂O + light energy → C₆H₁₂O₆ + 6O₂. Every reading you record is this equation running at some rate — light, CO₂, temperature and water set how fast.',
    },
  ],
  technical: [
    {
      title: 'Ingredients',
      body: 'CO₂ diffuses in through stomata (its conductance is what water stress throttles); H₂O rises in the xylem; photons are absorbed by chlorophyll a/b and carotenoids in photosystems II and I.',
    },
    {
      title: 'Light-dependent reactions',
      body: 'At photosystem II, 2H₂O → O₂ + 4H⁺ + 4e⁻. The electron transport chain pumps protons; ATP synthase makes ATP and ferredoxin–NADP⁺ reductase makes NADPH. The O₂ you count comes from water, not CO₂ (Ruben & Kamen, ¹⁸O tracer, 1941).',
    },
    {
      title: 'Calvin cycle',
      body: 'RuBisCO fixes CO₂ onto RuBP; per glucose the cycle spends 18 ATP and 12 NADPH. RuBisCO also binds O₂ (photorespiration) — the reason C4 and CAM leaves concentrate CO₂ first.',
    },
    {
      title: 'The equation and its limits',
      body: '6CO₂ + 6H₂O + light → C₆H₁₂O₆ + 6O₂ (ΔG ≈ +2,870 kJ mol⁻¹). Net rate = gross − respiration; the plateau you measured is a limiting factor — light, CO₂ or enzyme kinetics — not the equation.',
    },
  ],
}

interface Props {
  step: number
  progress: number
  playing: boolean
  onPlayPause: () => void
  onNext: () => void
  onReplay: () => void
  onClose: () => void
  compact?: boolean
}

/** HUD chrome for the 3D equation stage: step title, explanation, transport. */
export default function EquationCard({ step, progress, playing, onPlayPause, onNext, onReplay, onClose, compact = false }: Props) {
  const caps = useBandCaps()
  const copy = STEPS[caps.vocab]
  const s = Math.min(copy.length - 1, Math.max(0, step))
  const done = step >= copy.length

  return (
    <div className={`pointer-events-auto w-[min(34rem,calc(100vw-1.5rem))] rounded-[22px] border border-[#F3E9D7] bg-[#FBF5EA]/95 shadow-2xl backdrop-blur-md ${compact ? 'p-3' : 'p-4'}`} data-focus-layer="">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-black tracking-widest text-[#A08750] uppercase">
            Photosynthesis, expanded · {Math.min(copy.length, s + 1)}/{copy.length}
          </div>
          <h3 className="mt-0.5 text-[15px] leading-tight font-black text-[#402222]">{copy[s].title}</h3>
        </div>
        <Tile round onClick={onClose} aria-label="Close the equation" className="flex items-center justify-center rounded-full text-[#7A5252] hover:bg-[#F3E9D7]">
          <X className="h-4 w-4" />
        </Tile>
      </div>
      <p className={`mt-1.5 leading-snug font-semibold text-[#5C3A3A] ${compact ? 'text-[11.5px]' : 'text-[12.5px]'}`}>{copy[s].body}</p>

      {/* progress dots */}
      <div className="mt-2.5 flex items-center gap-1.5">
        {copy.map((_, i) => {
          const fill = i < step ? 1 : i === step ? progress : 0
          return (
            <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F3E9D7]">
              <div className="h-full rounded-full bg-[#3E7C43] transition-[width] duration-150" style={{ width: `${Math.round(fill * 100)}%` }} />
            </div>
          )
        })}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {!done ? (
          <Tile onClick={onPlayPause} className="flex items-center gap-1.5 rounded-full bg-[#3E7C43] px-3.5 py-1.5 text-[12px] font-black text-[#FBF5EA] shadow hover:bg-[#2F6134]">
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
            {playing ? 'Pause' : 'Play'}
          </Tile>
        ) : (
          <Tile onClick={onReplay} className="flex items-center gap-1.5 rounded-full bg-[#3E7C43] px-3.5 py-1.5 text-[12px] font-black text-[#FBF5EA] shadow hover:bg-[#2F6134]">
            <RotateCcw className="h-3.5 w-3.5" /> Replay
          </Tile>
        )}
        {!done && (
          <Tile onClick={onNext} className="flex items-center gap-1 rounded-full bg-[#F3E9D7] px-3 py-1.5 text-[12px] font-extrabold text-[#7A5252] hover:bg-[#EBDFC8]">
            Next step <ChevronRight className="h-3.5 w-3.5" />
          </Tile>
        )}
        <span className="ml-auto text-[10.5px] font-bold text-[#B08A7A]">drag to orbit the stage</span>
      </div>
    </div>
  )
}
