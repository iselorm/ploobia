import { useEffect } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Crosshair, SkipBack, SkipForward } from 'lucide-react'
import { Tile } from '@/components/ui/tile'
import { CHECKPOINTS, panCamera, stepCheckpoint, type RiverSim } from '@/lib/river'

/**
 * Free navigation over the basin: an arrow pad that pans wherever you are
 * looking, and prev/next buttons that walk the checkpoints in order. The
 * keyboard arrows do the same thing, so a laptop learner never has to drag.
 */
export default function RiverNav({ sim, tick, onReset }: { sim: RiverSim; tick: number; onReset: () => void }) {
  void tick

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.getAttribute('role') === 'slider' || el?.isContentEditable) return
      const step = ev.shiftKey ? 2.6 : 1
      switch (ev.key) {
        case 'ArrowLeft':
          panCamera(sim, -step, 0)
          break
        case 'ArrowRight':
          panCamera(sim, step, 0)
          break
        case 'ArrowUp':
          panCamera(sim, 0, step)
          break
        case 'ArrowDown':
          panCamera(sim, 0, -step)
          break
        case ',':
        case '[':
          stepCheckpoint(sim, -1)
          break
        case '.':
        case ']':
          stepCheckpoint(sim, 1)
          break
        default:
          return
      }
      ev.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sim])

  const cp = sim.atCp >= 0 ? CHECKPOINTS[sim.atCp] : null
  const btn =
    'flex h-8 w-8 items-center justify-center rounded-lg border border-[#FBF5EA]/25 text-[#EAF4F8] transition-all hover:bg-[#FBF5EA]/15 active:scale-95'

  return (
    <div
      className="pointer-events-auto flex flex-col items-center gap-1.5 rounded-[18px] border border-[#FBF5EA]/20 p-2 shadow-xl backdrop-blur-md"
      style={{ background: 'rgba(10, 22, 32, 0.55)' }}
    >
      <div className="flex items-center gap-1">
        <Tile aria-label="Previous checkpoint" onClick={() => stepCheckpoint(sim, -1)} className={btn}>
          <SkipBack className="h-4 w-4" />
        </Tile>
        <span className="w-[5.6rem] text-center text-[9.5px] leading-tight font-extrabold text-[#FFD87E]">
          {cp ? cp.name : 'Free look'}
        </span>
        <Tile aria-label="Next checkpoint" onClick={() => stepCheckpoint(sim, 1)} className={btn}>
          <SkipForward className="h-4 w-4" />
        </Tile>
      </div>
      <div className="flex flex-col items-center">
        <Tile aria-label="Pan forward" onClick={() => panCamera(sim, 0, 1)} className={btn}>
          <ChevronUp className="h-4 w-4" />
        </Tile>
        <div className="flex items-center gap-1">
          <Tile aria-label="Pan left" onClick={() => panCamera(sim, -1, 0)} className={btn}>
            <ChevronLeft className="h-4 w-4" />
          </Tile>
          <Tile aria-label="Recentre the view" onClick={onReset} className={btn}>
            <Crosshair className="h-3.5 w-3.5" />
          </Tile>
          <Tile aria-label="Pan right" onClick={() => panCamera(sim, 1, 0)} className={btn}>
            <ChevronRight className="h-4 w-4" />
          </Tile>
        </div>
        <Tile aria-label="Pan back" onClick={() => panCamera(sim, 0, -1)} className={btn}>
          <ChevronDown className="h-4 w-4" />
        </Tile>
      </div>
      <p className="text-[8.5px] font-bold text-[#9ABFD4]">arrow keys · [ ] checkpoints</p>
    </div>
  )
}
