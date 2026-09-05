import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Tile } from '@/components/ui/tile'
import { landChord, nudge, startAudio } from '@/lib/audio'
import { speak } from '@/lib/narrator'
import { useBackHandler } from '@/lib/input'
import { CARDS, fmt, type CardId, type CardSymbol, type SentenceTile, type Vocab } from '@/lib/physics'

/**
 * The HUD Equation Card.
 *
 * The one way an equation ever appears in First Physics. It is *triggered*
 * by an episode's Land beat — never toggled — and it can only be opened with
 * the learner's own measured values, which `openCard` in lib/physics.ts
 * enforces before this component is ever mounted.
 *
 * Anatomy: the scene dims underneath (the objects the symbols refer to stay
 * visible so the arrows have somewhere real to point); an eyebrow title;
 * a symbol row in large mono type, each symbol in its own colour; the
 * learner's numbers slide up into place under the symbols, staggered; the
 * result computes with a pulse on the equals sign; one arrow per right-hand
 * symbol from its number to the projected screen position of its object,
 * with a three-word label; tapping a symbol pulses its object and reads its
 * sentence; and "Say it back" closes the card — three sentence tiles, one
 * right, one with the quantities swapped, one with the wrong operation.
 *
 * Band layers come from `vocab` alone: simple → words only, plain numbers;
 * formal → words above symbols, units; technical → symbols with units and a
 * rearranged form.
 */

export interface Projected {
  x: number
  y: number
  /** False when the object is off-screen; the arrow then points at the edge. */
  onScreen: boolean
}

export type Projector = (objectId: string) => Projected | null

interface Props {
  card: CardId
  values: Record<string, number>
  vocab: Vocab
  sentences: SentenceTile[]
  project: Projector
  /** Called when a symbol is tapped: the scene should pulse that object. */
  onPulse?: (objectId: string | null) => void
  /** Called with `true` when the learner picked the right sentence, or after two misses. */
  onSaid: (correct: boolean) => void
}

const REDUCED = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function symbolText(sym: CardSymbol, vocab: Vocab): string {
  return vocab === 'simple' ? sym.word.simple : sym.symbol
}

export default function EquationCard({ card, values, vocab, sentences, project, onPulse, onSaid }: Props) {
  const spec = CARDS[card]
  const result = spec.compute(values)
  const [stage, setStage] = useState<0 | 1 | 2 | 3>(REDUCED ? 3 : 0)
  const [misses, setMisses] = useState(0)
  const [shake, setShake] = useState<string | null>(null)
  const [hot, setHot] = useState<string | null>(null)
  const numberRefs = useRef<Record<string, HTMLSpanElement | null>>({})
  const rootRef = useRef<HTMLDivElement>(null)
  interface Arrow {
    key: string
    d: string
    color: string
    lx: number
    ly: number
    label: string
    hot: boolean
  }
  const [arrows, setArrows] = useState<Arrow[]>([])

  // Staging: symbols → numbers slide in → result computes → sentences.
  useEffect(() => {
    if (REDUCED) return
    const t1 = window.setTimeout(() => setStage(1), 350)
    const t2 = window.setTimeout(() => setStage(2), 1100)
    const t3 = window.setTimeout(() => setStage(3), 1700)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
    }
  }, [])

  useEffect(() => {
    startAudio()
    landChord()
    speak(spec.title[vocab])
  }, [spec, vocab])

  // Arrows are drawn in screen space from live projections, refreshed on a slow tick.
  useEffect(() => {
    const compute = () => {
      const root = rootRef.current?.getBoundingClientRect()
      if (stage < 1 || !root) {
        setArrows([])
        return
      }
      const out: Arrow[] = []
      for (const sym of spec.rhs) {
        const from = numberRefs.current[sym.key]?.getBoundingClientRect()
        const to = project(sym.objectId)
        if (!from || !to) continue
        const sx = from.left + from.width / 2
        const sy = from.bottom + 4
        let tx = to.x
        let ty = to.y
        if (!to.onScreen) {
          tx = Math.max(24, Math.min(window.innerWidth - 24, tx))
          ty = Math.max(24, Math.min(window.innerHeight - 24, ty))
        }
        const dy = ty - sy
        const c1y = sy + Math.max(40, dy * 0.45)
        const c2y = ty - Math.max(30, dy * 0.3)
        out.push({
          key: sym.key,
          d: `M${sx} ${sy} C ${sx} ${c1y}, ${tx} ${c2y}, ${tx} ${ty}`,
          color: sym.color,
          lx: (sx + tx) / 2,
          ly: (sy + ty) / 2,
          label: sym.label[vocab] + (to.onScreen ? '' : ' (off screen)'),
          hot: hot === sym.key,
        })
      }
      setArrows(out)
    }
    compute()
    const t = window.setInterval(compute, 120)
    return () => window.clearInterval(t)
  }, [stage, spec, project, vocab, hot])

  // Back must not skip the sentence at Scientist/Analyst.
  useBackHandler(() => vocab === 'simple' ? (onSaid(false), true) : true)

  const symbols = useMemo(() => [spec.lhs, ...spec.rhs], [spec])

  const pick = (tile: SentenceTile) => {
    if (tile.id === 'right') {
      onPulse?.(null)
      onSaid(true)
      return
    }
    nudge()
    setShake(tile.id)
    window.setTimeout(() => setShake(null), 500)
    // Re-highlight the arrow the mistake is about rather than saying "wrong".
    const target = tile.id === 'swapped' ? spec.rhs[0] : spec.rhs[spec.rhs.length - 1]
    setHot(target.key)
    onPulse?.(target.objectId)
    window.setTimeout(() => setHot(null), 1400)
    const n = misses + 1
    setMisses(n)
    if (n >= 2) {
      const right = sentences.find((s) => s.id === 'right')
      if (right) speak(right.text)
      window.setTimeout(() => onSaid(false), 1800)
    }
  }

  const tapSymbol = (sym: CardSymbol) => {
    setHot(sym.key)
    onPulse?.(sym.objectId)
    const isLhs = sym.key === spec.lhs.key
    const line = isLhs ? `${sym.word[vocab]}: ${fmt(result, sym.digits)} ${sym.unit}` : `${sym.label[vocab]}: ${fmt(values[sym.key], sym.digits)} ${sym.unit}`
    speak(line)
    window.setTimeout(() => setHot(null), 1200)
  }

  const showUnits = vocab !== 'simple'
  const bigSize = 'text-[clamp(26px,6.2vw,46px)]'

  return (
    <div ref={rootRef} className="hud pointer-events-auto fixed inset-0 z-40 select-none" data-equation-card={card} role="dialog" aria-label={spec.title[vocab]}>
      {/* Dim, not hide: the objects stay visible under the card so the arrows point at something real. */}
      <div className="absolute inset-0 bg-[#0E1620]/65 transition-opacity duration-500" />

      {/* Arrows live on an svg the size of the screen */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          {spec.rhs.map((sym) => (
            <marker key={sym.key} id={`eq-arrow-${sym.key}`} markerWidth="9" markerHeight="9" refX="4.5" refY="4.5" orient="auto">
              <path d="M0 0 L9 4.5 L0 9 z" fill={sym.color} />
            </marker>
          ))}
        </defs>
        {arrows.map((a) => (
          <g key={a.key} className={REDUCED ? '' : 'eq-arrow-in'} style={{ opacity: a.hot ? 1 : 0.85 }}>
            <path d={a.d} stroke={a.color} strokeWidth={a.hot ? 3.5 : 2.2} fill="none" markerEnd={`url(#eq-arrow-${a.key})`} strokeLinecap="round" />
            <text x={a.lx + 10} y={a.ly} fill={a.color} fontSize="13" fontWeight="700" fontFamily="ui-sans-serif, system-ui, sans-serif" paintOrder="stroke" stroke="#0E1620" strokeWidth="4" strokeLinejoin="round">
              {a.label}
            </text>
          </g>
        ))}
      </svg>

      <div className="absolute inset-x-0 top-[6vh] flex flex-col items-center px-4 sm:top-[8vh]">
        {/* A soft band behind the rows, so the shelf and grass never read through the numbers */}
        <div className="flex flex-col items-center rounded-[28px] bg-[#0E1620]/70 px-6 pt-4 pb-5 shadow-2xl backdrop-blur-[2px]">
        <p className="text-[11px] font-extrabold tracking-[0.18em] text-[#8FA3B8] uppercase">{spec.title[vocab]}</p>

        {/* Symbol row */}
        <div className={`mt-4 flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 font-mono font-bold ${bigSize}`} data-symbol-row="">
          {symbols.map((sym, i) => (
            <span key={sym.key} className="contents">
              {i === 1 && <span className="text-[#8FA3B8]">=</span>}
              {i >= 2 && <span className="text-[#8FA3B8]">{spec.op}</span>}
              <button
                type="button"
                onClick={() => tapSymbol(sym)}
                className={`rounded-lg px-1.5 transition-transform ${hot === sym.key ? 'scale-110 bg-white/10' : ''}`}
                style={{ color: sym.color } as CSSProperties}
                aria-label={`${sym.word[vocab]}`}
              >
                {showUnits && vocab === 'formal' ? (
                  <span className="flex flex-col items-center leading-none">
                    <span className="text-[0.38em] font-sans font-extrabold tracking-wide opacity-80">{sym.word.formal}</span>
                    <span>{sym.symbol}</span>
                  </span>
                ) : (
                  symbolText(sym, vocab)
                )}
              </button>
            </span>
          ))}
        </div>

        {/* Number row */}
        <div className={`mt-3 flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 font-mono font-bold text-[clamp(20px,4.6vw,34px)]`} data-number-row="">
          {symbols.map((sym, i) => {
            const isLhs = i === 0
            const value = isLhs ? result : values[sym.key]
            const shown = isLhs ? stage >= 2 : stage >= 1
            return (
              <span key={sym.key} className="contents">
                {i === 1 && <span className={`text-[#8FA3B8] ${stage === 2 && !REDUCED ? 'eq-pulse' : ''}`}>=</span>}
                {i >= 2 && <span className="text-[#8FA3B8]">{spec.op}</span>}
                <span
                  ref={(el) => {
                    numberRefs.current[sym.key] = el
                  }}
                  className={`inline-block whitespace-nowrap ${shown ? (REDUCED ? '' : 'eq-number-in') : 'opacity-0'}`}
                  style={{ color: sym.color, animationDelay: `${(i - 1) * 140}ms` } as CSSProperties}
                  data-value={sym.key}
                >
                  {fmt(value, sym.digits)}
                  {showUnits && <span className="ml-1 text-[0.55em] font-extrabold opacity-80">{sym.unit}</span>}
                  {!showUnits && (sym.unit === 'm' || sym.unit === 's' || sym.unit === 'm/s') && <span className="ml-1 text-[0.55em] font-extrabold opacity-80">{sym.unit}</span>}
                </span>
              </span>
            )
          })}
        </div>

        {vocab === 'technical' && spec.rearranged && stage >= 2 && (
          <p className="mt-2 font-mono text-[13px] font-bold text-[#8FA3B8]">also written {spec.rearranged}</p>
        )}
        </div>
      </div>

      {/* Say it back */}
      <div className={`absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-2 px-3 transition-opacity duration-500 ${stage >= 3 ? 'opacity-100' : 'pointer-events-none opacity-0'}`} data-say-it-back="">
        <p className="text-[11px] font-extrabold tracking-[0.16em] text-[#8FA3B8] uppercase">Say it back</p>
        <div className="flex w-full max-w-[36rem] flex-col gap-2">
          {sentences.map((s) => (
            <Tile
              key={s.id}
              onClick={() => pick(s)}
              data-sentence={s.id}
              className={`w-full rounded-2xl border border-[#F3E9D7]/25 bg-[#FBF5EA] px-4 py-3 text-left text-[13.5px] leading-snug font-extrabold text-[#2A2823] shadow-lg transition-transform hover:scale-[1.01] active:scale-[0.99] ${shake === s.id ? 'eq-shake' : ''}`}
            >
              {s.text}
            </Tile>
          ))}
        </div>
      </div>
    </div>
  )
}
