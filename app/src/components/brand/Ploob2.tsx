import { cn } from '@/lib/utils'
import ploob2Url from '@/assets/ploob2.webp'

/**
 * Ploob 2.0 — the film's Ploob, as the picture.
 *
 * Locked on 2 September 2026 for *The Sugar Journey* and canonical since: a
 * small glossy translucent amber jelly creature, a curled teardrop tip on top
 * of the head, two big dark eyes with bright highlights, soft brows, a faint
 * warm tint on the cheeks (no rosy blush), a small open happy smile, two tiny
 * rounded arms, two rounded feet, a subsurface glow, amber `#E8A33D`.
 *
 * Selorm, 2026-09-11: "update the ploob to ploob2.png" — the drawn SVG that
 * stood in here is gone; this is the rendered still from the vault
 * (`Ploobia/ploob2.png`), cut out, halo stripped, packed to a 768 px WebP and
 * inlined into the single-file build. Everything in HUD chrome that shows
 * Ploob (the coach line, the welcome cards, the top bars) goes through this
 * component, so it changed everywhere at once. The in-scene Ploob is
 * `PloobCutout` — the same picture as a billboard — where a cabinet has moved
 * off the old `ploob.glb`. He never speaks on camera, so he never gets a
 * speech bubble — the words beside him are the coach's.
 */
export const PLOOB2_URL: string = ploob2Url

export default function Ploob2({
  size = 28,
  className,
  title = 'Ploob',
}: {
  size?: number
  className?: string
  title?: string
}) {
  // The picture is square with the figure filling its height; the old SVG was
  // 46×56, so a `size` here still reads as "about this wide" to callers.
  const px = (size * 56) / 46
  return (
    <img
      src={ploob2Url}
      width={px}
      height={px}
      alt={title}
      draggable={false}
      className={cn('shrink-0 select-none', className)}
      style={{ width: px, height: px, objectFit: 'contain' }}
    />
  )
}
