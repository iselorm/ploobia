import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '@/lib/utils'

/**
 * Tile — the platform's focusable control primitive.
 *
 * A Tile is anything a finger, a mouse, a keyboard or a game controller can
 * land on. It guarantees a hit target that grows with the input mode
 * (`--hit`, set from `<html data-input>` in index.css: 36px pointer, 48px
 * touch/gamepad, 64px tv), a visible focus ring in non-pointer modes, and
 * `data-tile` so the spatial navigator can prefer it. Existing buttons keep
 * their own look; Tile only adds the ergonomics.
 *
 * Use `asChild` to turn a Link or any element into a Tile.
 */
export interface TileProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  /** Icon-only round control (view buttons, collapse chevrons). */
  round?: boolean
}

export const Tile = React.forwardRef<HTMLButtonElement, TileProps>(function Tile(
  { asChild = false, round = false, className, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      ref={ref}
      data-tile=""
      type={asChild ? undefined : (type ?? 'button')}
      className={cn('tile', round && 'tile-round', className)}
      {...props}
    />
  )
})

export default Tile
