import { Glasses, Orbit, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { VIEWPOINTS, type ViewId } from '@/lib/viewpoints'
import { Tile } from '@/components/ui/tile'
import { useCameraHint } from '@/lib/input'

interface Props {
  autoOrbit: boolean
  onZoom: (delta: number) => void
  onToggleOrbit: () => void
  onReset: () => void
  /** Authored viewpoints (see lib/viewpoints.ts). */
  viewId?: string
  onView?: (id: ViewId) => void
  /** Override the authored viewpoint list (other cabinets bring their own). */
  views?: Array<{ id: string; label: string; hint: string }>
  /** Enter the cardboard stereo tour. Omitted by cabinets that have no tour. */
  onCardboard?: () => void
}

/**
 * Camera controls, parked top-centre where neither side column reaches.
 * Dragging and scrolling already work; these exist so that a learner on a
 * trackpad — or one who has orbited themselves into a corner — always has an
 * obvious way back.
 */
export default function ViewControls({
  autoOrbit,
  onZoom,
  onToggleOrbit,
  onReset,
  viewId,
  onView,
  views,
  onCardboard,
}: Props) {
  const list = views ?? VIEWPOINTS
  const hint = useCameraHint()
  const btn =
    'flex items-center justify-center rounded-full text-[#7A5252] transition-all duration-200 hover:bg-[#F3E9D7] hover:text-[#3E7C43] active:scale-90'

  return (
    <div className="pointer-events-auto flex flex-col items-center gap-1.5">
    {onView && (
      <div className="flex items-center gap-0.5 rounded-full border border-[#F3E9D7] bg-[#FBF5EA]/90 p-1 shadow-lg backdrop-blur-md" role="group" aria-label="Viewpoints">
        {list.map((v) => {
          const on = v.id === viewId
          return (
            <Tile
              key={v.id}
              onClick={() => onView(v.id as ViewId)}
              aria-pressed={on}
              title={v.hint}
              className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold transition-all ${
                on ? 'bg-[#3E7C43] text-[#FBF5EA] shadow' : 'text-[#7A5252] hover:bg-[#F3E9D7]'
              }`}
            >
              {v.label}
            </Tile>
          )
        })}
      </div>
    )}
    <div className="flex items-center gap-0.5 rounded-full border border-[#F3E9D7] bg-[#FBF5EA]/90 p-1 shadow-lg backdrop-blur-md">
      <Tile round onClick={() => onZoom(-0.22)} className={btn} aria-label="Zoom in" title="Zoom in">
        <ZoomIn className="h-4 w-4" />
      </Tile>
      <Tile round onClick={() => onZoom(0.28)} className={btn} aria-label="Zoom out" title="Zoom out">
        <ZoomOut className="h-4 w-4" />
      </Tile>
      <Tile
        round
        onClick={onToggleOrbit}
        aria-pressed={autoOrbit}
        aria-label="Orbit the scene"
        title="Spin slowly all the way around"
        className={`${btn} ${autoOrbit ? 'bg-[#3E7C43] text-[#FBF5EA] hover:bg-[#2F6134] hover:text-[#FBF5EA]' : ''}`}
      >
        <Orbit className="h-4 w-4" />
      </Tile>
      <Tile round onClick={onReset} className={btn} aria-label="Reset the view" title="Reset the view">
        <RotateCcw className="h-4 w-4" />
      </Tile>
      {onCardboard && (
        <Tile
          round
          onClick={onCardboard}
          className={btn}
          aria-label="Cardboard view"
          title="Cardboard: side-by-side 3D for a phone-in-a-viewer"
        >
          <Glasses className="h-4 w-4" />
        </Tile>
      )}
      <span className="px-2 text-[10px] font-bold text-[#B08A7A] select-none">
        {hint}
      </span>
    </div>
    </div>
  )
}
