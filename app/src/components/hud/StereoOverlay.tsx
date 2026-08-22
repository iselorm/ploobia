import { useEffect, useRef } from 'react'
import { RotateCcw, X } from 'lucide-react'
import { Tile } from '@/components/ui/tile'
import { exitStereo, useStereo } from '@/lib/stereo'

interface Props {
  /** Called on a clean tap (the Cardboard button presses the screen). */
  onTap: () => void
}

/**
 * The only chrome that exists in stereo: an exit control, a rotate prompt for
 * portrait phones, and a one-line status. Everything else lives in the world.
 * A tap anywhere (Cardboard v2 viewers press the screen) advances the tour.
 */
export default function StereoOverlay({ onTap }: Props) {
  const stereo = useStereo()
  const start = useRef<{ x: number; y: number; t: number } | null>(null)

  useEffect(() => {
    const down = (e: PointerEvent) => {
      start.current = { x: e.clientX, y: e.clientY, t: performance.now() }
    }
    const up = (e: PointerEvent) => {
      const s = start.current
      start.current = null
      if (!s) return
      const moved = Math.hypot(e.clientX - s.x, e.clientY - s.y)
      const held = performance.now() - s.t
      const target = e.target as HTMLElement | null
      if (target?.closest('[data-stereo-ui]')) return
      if (moved < 14 && held < 450) onTap()
    }
    window.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
    }
  }, [onTap])

  return (
    <div className="pointer-events-none fixed inset-0 z-40 select-none">
      <div className="absolute top-2 left-2 flex items-center gap-2" data-stereo-ui="">
        <Tile
          onClick={exitStereo}
          aria-label="Exit cardboard view"
          className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/15 bg-black/45 px-3 py-1.5 text-[11px] font-extrabold text-white/90 backdrop-blur"
        >
          <X className="h-3.5 w-3.5" /> Exit
        </Tile>
        <span className="rounded-full bg-black/35 px-2.5 py-1 text-[10px] font-bold text-white/70 backdrop-blur">
          {stereo.tracking ? 'gyroscope on · move your head' : 'no gyroscope · drag to look'} · tap for next stop
        </span>
      </div>
      {!stereo.landscape && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <div className="flex flex-col items-center gap-3 text-center text-[#FBF5EA]">
            <RotateCcw className="h-10 w-10 animate-[spin_3s_linear_infinite]" />
            <p className="text-lg font-black">Turn your phone sideways</p>
            <p className="max-w-xs text-[13px] font-semibold text-white/75">
              Then slide it into the cardboard viewer. Tap the screen (or the viewer's button) to move
              to the next stop.
            </p>
          </div>
        </div>
      )}
      {/* Divider between the eyes helps the viewer's lenses line up */}
      {stereo.landscape && <div className="absolute inset-y-0 left-1/2 w-px bg-black/60" />}
    </div>
  )
}
