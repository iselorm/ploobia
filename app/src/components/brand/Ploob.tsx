import { useId } from 'react'

/**
 * Ploob — the Ploobian, in two dimensions.
 *
 * The flat drawing of the same creature as `ploob.glb`: a jelly pudding with
 * two big eyes, two nub arms and two feet. Ploob has no eyebrows and no mouth
 * — everything he feels happens in the eyes, which is what keeps the 2D and 3D
 * versions unmistakably the same character.
 *
 * Pure SVG, so it scales from a 16 px chip to a hero. Idle squish and blink
 * live in CSS (`.ploob-*` in index.css) and honour prefers-reduced-motion.
 */

export type PloobTint = 'gold' | 'green' | 'red' | 'blue' | 'violet'
export type PloobMood = 'curious' | 'delighted' | 'thinking' | 'eureka' | 'sleepy'

const TINTS: Record<PloobTint, { hi: string; mid: string; lo: string; line: string }> = {
  gold: { hi: '#FFF3CF', mid: '#F3C463', lo: '#C97A1F', line: '#8A5410' },
  green: { hi: '#EEF9E6', mid: '#8FD07F', lo: '#2F6B36', line: '#1F4A24' },
  red: { hi: '#FFE7E3', mid: '#EE8C82', lo: '#A82825', line: '#6E1714' },
  blue: { hi: '#E6F1FC', mid: '#87BAEE', lo: '#2E6DA8', line: '#1B4570' },
  violet: { hi: '#F0E9FF', mid: '#A98BE0', lo: '#5B3E9C', line: '#3A2568' },
}

const INK = '#2A1A08'

/** The body: a bell of jelly with a scalloped crown and a wide, settled base. */
const BODY =
  'M100 44 C 72 44, 53 58, 52 80 C 51 94, 44 102, 39 114 C 32 132, 27 144, 27 152 ' +
  'C 27 162, 38 167, 56 168 L 144 168 C 162 167, 173 162, 173 152 ' +
  'C 173 144, 168 132, 161 114 C 156 102, 149 94, 148 80 C 147 58, 128 44, 100 44 Z'

/** Faint vertical mould ridges, the thing that makes it read as set jelly. */
const RIDGES = ['M70 54 C 62 82, 54 116, 53 154', 'M100 46 C 100 82, 100 118, 100 160', 'M130 54 C 138 82, 146 116, 147 154']

interface Props {
  size?: number
  tint?: PloobTint
  mood?: PloobMood
  /** Idle squish + blink. Off for static exports. */
  animated?: boolean
  className?: string
  title?: string
}

export default function Ploob({ size = 96, tint = 'gold', mood = 'curious', animated = true, className, title }: Props) {
  const id = useId().replace(/:/g, '')
  const t = TINTS[tint]

  /* Everything Ploob feels happens in the eyes. */
  let dx = 0
  let dy = 0
  let lidL = 0 // 0 = open, 1 = shut
  let lidR = 0
  let pupil = 12
  let sparkle = false
  switch (mood) {
    case 'delighted':
      dy = 1
      pupil = 13.5
      break
    case 'thinking':
      dx = 4
      dy = -4
      lidL = 0.34
      break
    case 'eureka':
      pupil = 14.5
      sparkle = true
      break
    case 'sleepy':
      lidL = 0.62
      lidR = 0.62
      dy = 3
      break
    default:
      dx = -1.5
      dy = -2
  }

  const eye = (cx: number, lid: number, key: string) => (
    <g key={key}>
      <ellipse cx={cx} cy={116} rx={21} ry={23} fill="#fff" />
      <circle cx={cx + dx} cy={118 + dy} r={pupil} fill={INK} />
      <circle cx={cx + dx + 5} cy={118 + dy - 6} r={pupil * 0.34} fill="#fff" />
      <circle cx={cx + dx - 5} cy={118 + dy + 6} r={pupil * 0.17} fill="#fff" opacity="0.85" />
      {lid > 0 && (
        <path
          d={`M${cx - 22} ${116 - 23} h44 v${46 * lid} a22 ${23 * lid} 0 0 1 -44 0 Z`}
          fill={t.mid}
          stroke={t.line}
          strokeWidth="0"
        />
      )}
    </g>
  )

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={`ploob ${animated ? 'ploob-animated' : ''} ${className ?? ''}`}
      role="img"
      aria-label={title ?? 'Ploob, a Ploobian'}
    >
      <defs>
        <radialGradient id={`${id}-jelly`} cx="36%" cy="26%" r="82%">
          <stop offset="0%" stopColor={t.hi} />
          <stop offset="46%" stopColor={t.mid} />
          <stop offset="100%" stopColor={t.lo} />
        </radialGradient>
        <radialGradient id={`${id}-shine`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}-clip`}>
          <path d={BODY} />
        </clipPath>
      </defs>

      <g className="ploob-body" style={{ transformOrigin: '100px 168px' }}>
        {/* arms — small nubs of the same jelly, behind the body */}
        <ellipse cx="26" cy="134" rx="13" ry="17" fill={t.mid} stroke={t.line} strokeWidth="4" transform="rotate(-18 26 134)" />
        <ellipse cx="174" cy="134" rx="13" ry="17" fill={t.mid} stroke={t.line} strokeWidth="4" transform="rotate(18 174 134)" />
        {/* feet */}
        <ellipse cx="78" cy="173" rx="12" ry="10" fill={t.mid} stroke={t.line} strokeWidth="4" />
        <ellipse cx="122" cy="173" rx="12" ry="10" fill={t.mid} stroke={t.line} strokeWidth="4" />

        {/* body */}
        <path d={BODY} fill={`url(#${id}-jelly)`} stroke={t.line} strokeWidth="4.5" strokeLinejoin="round" />
        <g clipPath={`url(#${id}-clip)`}>
          {RIDGES.map((d, i) => (
            <path key={i} d={d} fill="none" stroke={t.hi} strokeOpacity="0.4" strokeWidth="5" strokeLinecap="round" />
          ))}
          <ellipse cx="72" cy="70" rx="17" ry="12" fill={`url(#${id}-shine)`} />
          <path d="M46 138 C 48 155, 62 162, 80 163" fill="none" stroke={t.hi} strokeOpacity="0.45" strokeWidth="7" strokeLinecap="round" />
        </g>

        {/* eyes — the whole face */}
        <g className="ploob-eyes" style={{ transformOrigin: '100px 116px' }}>
          {[eye(77, lidL, 'l'), eye(123, lidR, 'r')]}
        </g>
      </g>

      {sparkle && (
        <g className="ploob-spark" fill="#F5D28C">
          <path d="M158 40 l 4 10 l 10 4 l -10 4 l -4 10 l -4 -10 l -10 -4 l 10 -4 z" />
          <circle cx="140" cy="26" r="3" />
          <circle cx="176" cy="66" r="2.5" />
        </g>
      )}
    </svg>
  )
}

/** Just the eyes — the favicon, the header chip, the "oo" in the wordmark. */
export function PloobEyes({ size = 24, tint = 'gold', className }: { size?: number; tint?: PloobTint; className?: string }) {
  const id = useId().replace(/:/g, '')
  const t = TINTS[tint]
  return (
    <svg viewBox="0 0 120 64" width={size * (120 / 64)} height={size} className={className} aria-hidden>
      <defs>
        <radialGradient id={`${id}-jelly`} cx="38%" cy="30%" r="80%">
          <stop offset="0%" stopColor={t.hi} />
          <stop offset="45%" stopColor={t.mid} />
          <stop offset="100%" stopColor={t.lo} />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="28" fill={`url(#${id}-jelly)`} stroke={t.line} strokeWidth="4" />
      <circle cx="88" cy="32" r="28" fill={`url(#${id}-jelly)`} stroke={t.line} strokeWidth="4" />
      <ellipse cx="22" cy="20" rx="6" ry="9" fill="#fff" opacity="0.6" />
      <ellipse cx="78" cy="20" rx="6" ry="9" fill="#fff" opacity="0.6" />
      <ellipse cx="35" cy="35" rx="10" ry="12" fill="#fff" />
      <ellipse cx="91" cy="35" rx="10" ry="12" fill="#fff" />
      <circle cx="37" cy="37" r="6" fill={INK} />
      <circle cx="93" cy="37" r="6" fill={INK} />
      <circle cx="39" cy="34.5" r="2" fill="#fff" />
      <circle cx="95" cy="34.5" r="2" fill="#fff" />
    </svg>
  )
}
