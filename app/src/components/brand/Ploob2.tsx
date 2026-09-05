import { useId } from 'react'
import { cn } from '@/lib/utils'

/**
 * Ploob 2.0 — the film's Ploob, flat.
 *
 * Locked on 2 September 2026 for *The Sugar Journey* and canonical since: a
 * small glossy translucent amber jelly creature, a curled teardrop tip on top
 * of the head, two big dark eyes with bright highlights, soft brows, a faint
 * warm tint on the cheeks (no rosy blush), a small open happy smile, two tiny
 * rounded arms, two rounded feet, a subsurface glow, amber `#E8A33D`.
 *
 * This replaces the green-tinted jelly pudding in HUD chrome — the coach chip,
 * the countdown and handover cards. The in-scene mesh is still the old
 * `ploob.glb` until a proper turnaround exists; a 3D Ploob 2.0 needs rear and
 * profile renders first, and drawing him flat is the honest stand-in until
 * then. He never speaks on camera, so he never gets a speech bubble — the
 * words beside him are the coach's, in the cabinet's own voice.
 */
export default function Ploob2({
  size = 28,
  className,
  title = 'Ploob',
}: {
  size?: number
  className?: string
  title?: string
}) {
  const id = useId()
  const grad = `pl-body-${id}`
  return (
    <svg
      viewBox="0 0 46 56"
      width={size}
      height={(size * 56) / 46}
      role="img"
      aria-label={title}
      className={cn('shrink-0 select-none', className)}
    >
      <defs>
        <radialGradient id={grad} cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#FFD98A" />
          <stop offset="0.55" stopColor="#E8A33D" />
          <stop offset="1" stopColor="#C67E1E" />
        </radialGradient>
      </defs>
      {/* the curl */}
      <path
        d="M23 3 C 26 0, 31 1, 30 5 C 29 8, 25 8, 24 6"
        fill="none"
        stroke="#C67E1E"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      {/* body */}
      <path
        d="M23 4 C 10 14, 4 26, 5 38 C 6 50, 40 50, 41 38 C 42 26, 36 14, 23 4 Z"
        fill={`url(#${grad})`}
      />
      {/* the glass highlight */}
      <ellipse cx="15" cy="16" rx="5" ry="7" fill="#FFF3CF" opacity="0.55" />
      {/* feet */}
      <ellipse cx="14" cy="53" rx="6" ry="2.6" fill="#C67E1E" />
      <ellipse cx="32" cy="53" rx="6" ry="2.6" fill="#C67E1E" />
      {/* arms */}
      <ellipse cx="5" cy="35" rx="3.2" ry="2.2" fill="#D89432" transform="rotate(-30 5 35)" />
      <ellipse cx="41" cy="35" rx="3.2" ry="2.2" fill="#D89432" transform="rotate(30 41 35)" />
      {/* brows */}
      <path d="M12 21 q4 -3 8 -1" fill="none" stroke="#7A4E10" strokeWidth="1.3" strokeLinecap="round" opacity="0.7" />
      <path d="M26 20 q4 -2 8 1" fill="none" stroke="#7A4E10" strokeWidth="1.3" strokeLinecap="round" opacity="0.7" />
      {/* eyes */}
      <ellipse cx="16.5" cy="29" rx="4.6" ry="5.6" fill="#2A2320" />
      <ellipse cx="29.5" cy="29" rx="4.6" ry="5.6" fill="#2A2320" />
      <circle cx="18" cy="27" r="1.7" fill="#fff" />
      <circle cx="31" cy="27" r="1.7" fill="#fff" />
      <circle cx="15" cy="31.5" r="0.8" fill="#fff" opacity="0.8" />
      <circle cx="28" cy="31.5" r="0.8" fill="#fff" opacity="0.8" />
      {/* cheeks — warm, not rosy */}
      <circle cx="10" cy="36" r="3" fill="#F2B063" opacity="0.5" />
      <circle cx="36" cy="36" r="3" fill="#F2B063" opacity="0.5" />
      {/* the small open smile */}
      <path d="M19 39 q4 4 8 0" fill="#7A3B10" stroke="#7A3B10" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  )
}
