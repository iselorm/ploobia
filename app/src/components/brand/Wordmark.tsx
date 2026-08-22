import { PloobEyes, type PloobTint } from './Ploob'

/**
 * The Ploobia wordmark: "Pl" + the two o's drawn as Ploob's eyes + "bia".
 * The name looks back at you. Set in the app font (Nunito 900) so it stays a
 * real, selectable word; the eyes are inline SVG sized from the x-height.
 */
export default function Wordmark({
  size = 64,
  tint = 'gold',
  gradient = true,
  className,
}: {
  /** Font size in px; everything else scales from it. */
  size?: number
  tint?: PloobTint
  /** Gold gradient (dark backgrounds) or solid ink (light backgrounds). */
  gradient?: boolean
  className?: string
}) {
  const eye = size * 0.62
  const textClass = gradient
    ? 'bg-gradient-to-b from-[#FFF7E4] via-[#F8DFA6] to-[#E8A33D] bg-clip-text text-transparent'
    : 'text-[#2A1A08]'
  return (
    <span
      className={`inline-flex items-baseline leading-none font-black tracking-tight ${className ?? ''}`}
      style={{ fontSize: size }}
      aria-label="Ploobia"
      role="img"
    >
      <span className={textClass}>Pl</span>
      <span
        className="inline-flex items-center"
        style={{ height: eye, alignSelf: 'flex-end', marginBottom: size * 0.05, marginInline: size * 0.02 }}
        aria-hidden
      >
        <PloobEyes size={eye} tint={tint} />
      </span>
      <span className={textClass}>bia</span>
    </span>
  )
}
