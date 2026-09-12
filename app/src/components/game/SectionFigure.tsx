import { cn } from '@/lib/utils'

/**
 * A page's own figure — for a section whose parts the cabinet does not draw.
 *
 * The Sugar Line's scales are the whole plant, one chloroplast, one stoma
 * and one cut stem; a leaf in cross-section and a root in cross-section
 * are not among them, and statement 6.2.2 asks for "diagrams and images"
 * in so many words. So the page carries a figure of its own, and the terms
 * on the page are verbs on it (`figure/<layer>`): the named layer lights,
 * the rest steps back.
 *
 * Every layer is a hotspot with a halo when lit, and the hotspot map is the
 * contract: a painted card from the asset pipeline slides underneath with
 * the same regions and the pages never change (assets note, 2026-09-11 —
 * the procedural drawing is the stand-in). Labels are never in the figure;
 * they come from the page, in the learner's language.
 */

import type { FigureKind } from './figures'

function Layer({
  k,
  lit,
  onTap,
  label,
  children,
  className,
  /** Layers that stay lit alongside another (chloroplasts inside the palisade). */
  within,
}: {
  k: string
  lit: string | null
  onTap: (key: string) => void
  label: string
  children: React.ReactNode
  className?: string
  within?: string
}) {
  const on = lit === k || (!!within && lit === within)
  const dim = lit !== null && !on
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      data-layer={k}
      data-lit={lit === k ? 'true' : 'false'}
      onClick={(e) => {
        e.stopPropagation()
        onTap(k)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onTap(k)
      }}
      className={cn('cursor-pointer outline-none transition-opacity duration-300', dim && 'opacity-30', className)}
      style={lit === k ? { filter: 'drop-shadow(0 0 2px #E8A33D) drop-shadow(0 0 7px #E8A33D)' } : undefined}
    >
      {children}
    </g>
  )
}

export default function SectionFigure({
  kind,
  lit,
  onTap,
  className,
}: {
  kind: FigureKind
  lit: string | null
  onTap: (key: string) => void
  className?: string
}) {
  if (kind === 'leaf-section') {
    // Fourteen palisade cells across the whole width; the vein sits in the
    // spongy layer, where a dicot's veins are.
    const palisade = Array.from({ length: 14 }, (_, i) => 12 + i * 19.8)
    const spongy: Array<[number, number, number, number]> = [
      [28, 88, 13, 9],
      [62, 100, 14, 9],
      [96, 86, 12, 8],
      [214, 88, 13, 9],
      [246, 102, 14, 9],
      [276, 88, 12, 8],
      [60, 116, 11, 7],
      [232, 118, 11, 7],
      [30, 112, 9, 6],
      [278, 114, 9, 6],
    ]
    return (
      <svg
        viewBox="0 0 300 150"
        data-testid="figure-leaf-section"
        data-lit={lit ?? ''}
        role="img"
        aria-label="A leaf in section: cuticle, upper epidermis, palisade mesophyll, spongy mesophyll with air spaces, lower epidermis with a stoma, and a vascular bundle"
        className={cn('block h-auto w-full select-none', className)}
      >
        <rect x="0" y="0" width="300" height="150" rx="6" fill="#FBF8F1" />
        <Layer k="cuticle" lit={lit} onTap={onTap} label="cuticle">
          <rect x="8" y="8" width="284" height="6" rx="2" fill="#E9E0C8" stroke="#C9BFA6" strokeWidth="0.7" />
        </Layer>
        <Layer k="upperEpidermis" lit={lit} onTap={onTap} label="upper epidermis">
          <rect x="8" y="14" width="284" height="12" fill="#F1ECDE" stroke="#C9BFA6" strokeWidth="0.7" />
          {Array.from({ length: 13 }, (_, i) => 30 + i * 21).map((x) => (
            <line key={x} x1={x} y1="14" x2={x} y2="26" stroke="#C9BFA6" strokeWidth="0.6" />
          ))}
        </Layer>
        <Layer k="palisade" lit={lit} onTap={onTap} label="palisade mesophyll">
          {palisade.map((x) => (
            <rect key={x} x={x} y="27" width="17" height="44" rx="3" fill="#7FB07A" stroke="#4E8A4A" strokeWidth="0.7" />
          ))}
        </Layer>
        <Layer k="chloroplast" lit={lit} onTap={onTap} label="chloroplasts" within="palisade">
          {palisade.flatMap((x) => [0, 1, 2, 3].map((i) => <circle key={`${x}-${i}`} cx={x + 8.5} cy={34 + i * 10.5} r="2.8" fill="#2F6134" />))}
        </Layer>
        <Layer k="spongy" lit={lit} onTap={onTap} label="spongy mesophyll">
          {spongy.map(([cx, cy, rx, ry]) => (
            <ellipse key={`${cx}-${cy}`} cx={cx} cy={cy} rx={rx} ry={ry} fill="#D9E8D3" stroke="#4E8A4A" strokeWidth="0.7" />
          ))}
          {spongy.slice(0, 6).map(([cx, cy]) => (
            <circle key={`c-${cx}-${cy}`} cx={cx - 3} cy={cy} r="2.2" fill="#3E7C43" />
          ))}
        </Layer>
        <Layer k="airSpaces" lit={lit} onTap={onTap} label="air spaces">
          {[[45, 76], [80, 118], [112, 108], [186, 108], [230, 78], [262, 120], [12, 100], [290, 102]].map(([x, y]) => (
            <ellipse key={`${x}-${y}`} cx={x} cy={y} rx="9" ry="6" fill="#FBF8F1" stroke="#B9B09A" strokeWidth="0.6" strokeDasharray="1.5 1.5" />
          ))}
        </Layer>
        <Layer k="vascular" lit={lit} onTap={onTap} label="vascular bundle">
          <ellipse cx="150" cy="100" rx="40" ry="24" fill="#F3DFB2" stroke="#C98A1E" strokeWidth="0.9" />
          {[128, 143, 158, 173].map((x) => (
            <circle key={x} cx={x} cy="92" r="6.5" fill="#C6DCEE" stroke="#3F7FBF" strokeWidth="1.3" />
          ))}
          {[124, 134, 144, 154, 164, 174].map((x) => (
            <circle key={x} cx={x} cy="110" r="3.4" fill="#E8C071" stroke="#B5541C" strokeWidth="0.6" />
          ))}
        </Layer>
        <Layer k="lowerEpidermis" lit={lit} onTap={onTap} label="lower epidermis">
          <rect x="8" y="126" width="284" height="13" fill="#F1ECDE" stroke="#C9BFA6" strokeWidth="0.7" />
          {[30, 52, 74, 96, 118, 190, 212, 234, 256, 278].map((x) => (
            <line key={x} x1={x} y1="126" x2={x} y2="139" stroke="#C9BFA6" strokeWidth="0.6" />
          ))}
        </Layer>
        <Layer k="stoma" lit={lit} onTap={onTap} label="stoma with guard cells">
          <ellipse cx="140" cy="132.5" rx="10" ry="7" fill="#9CC694" stroke="#2F6134" strokeWidth="1" />
          <ellipse cx="164" cy="132.5" rx="10" ry="7" fill="#9CC694" stroke="#2F6134" strokeWidth="1" />
          <rect x="148" y="128" width="8" height="9" rx="3" fill="#FBF8F1" stroke="#2F6134" strokeWidth="0.6" />
          {[136, 143, 161, 168].map((x) => (
            <circle key={x} cx={x} cy="132.5" r="1.8" fill="#2F6134" />
          ))}
        </Layer>
      </svg>
    )
  }

  /* root-section */
  const hairs = Array.from({ length: 14 }, (_, i) => (i / 14) * Math.PI * 2 + 0.15)
  return (
    <svg
      viewBox="0 0 300 118"
      data-testid="figure-root-section"
      data-lit={lit ?? ''}
      role="img"
      aria-label="A root in section: root hairs reaching into the soil, the cortex, and a star of xylem at the centre with phloem between its arms"
      className={cn('block h-auto w-full select-none', className)}
    >
      <rect x="0" y="0" width="300" height="118" rx="6" fill="#FBF8F1" />
      <Layer k="soil" lit={lit} onTap={onTap} label="soil">
        <rect x="0" y="0" width="300" height="118" rx="6" fill="#EADFC8" />
        {[[20, 20, 7], [40, 95, 6], [265, 25, 8], [280, 90, 6], [120, 12, 5], [200, 108, 6], [15, 60, 5], [285, 58, 5], [230, 10, 4], [70, 108, 5]].map(([x, y, r]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#CDBB98" stroke="#B39C74" strokeWidth="0.5" />
        ))}
      </Layer>
      <Layer k="rootHair" lit={lit} onTap={onTap} label="root hair cells">
        {hairs.map((a, i) => {
          const x1 = 150 + Math.cos(a) * 46
          const y1 = 59 + Math.sin(a) * 46
          const len = 22 + (i % 3) * 8
          const x2 = 150 + Math.cos(a + 0.12) * (46 + len)
          const y2 = 59 + Math.sin(a + 0.12) * (46 + len)
          return <path key={i} d={`M${x1} ${y1} Q${(x1 + x2) / 2 + 3} ${(y1 + y2) / 2 - 3} ${x2} ${y2}`} stroke="#8FB68A" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        })}
        <circle cx="150" cy="59" r="46" fill="none" stroke="#6FA36A" strokeWidth="3" />
      </Layer>
      <Layer k="cortex" lit={lit} onTap={onTap} label="root cortex cells">
        <circle cx="150" cy="59" r="44" fill="#E4EED8" />
        {[[150, 24], [180, 34], [193, 59], [180, 84], [150, 94], [120, 84], [107, 59], [120, 34], [150, 42], [166, 59], [150, 76], [134, 59]].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="8.5" fill="#EEF4E6" stroke="#8FB68A" strokeWidth="0.7" />
        ))}
      </Layer>
      <Layer k="rootXylem" lit={lit} onTap={onTap} label="xylem">
        <circle cx="150" cy="59" r="15" fill="#F3DFB2" stroke="#C98A1E" strokeWidth="0.7" />
        <path d="M150 45 L154 55 L164 59 L154 63 L150 73 L146 63 L136 59 L146 55 Z" fill="#C6DCEE" stroke="#3F7FBF" strokeWidth="1.2" />
        {[[157, 52], [157, 66], [143, 66], [143, 52]].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="2.4" fill="#E8C071" stroke="#B5541C" strokeWidth="0.5" />
        ))}
      </Layer>
    </svg>
  )
}
