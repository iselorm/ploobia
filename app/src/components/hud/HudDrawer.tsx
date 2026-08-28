import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { ChevronUp, X } from 'lucide-react'
import { Tile } from '@/components/ui/tile'
import { useBackHandler, useInputAction } from '@/lib/input'

export interface DrawerTab {
  id: string
  label: string
  icon: ReactNode
  /** Small badge text (count, "predict!") */
  badge?: string
  badgeTone?: 'neutral' | 'warn' | 'good'
  content: ReactNode
}

interface Props {
  tabs: DrawerTab[]
  /** Dim and disable while a guided demo drives the cabinet. */
  muted?: boolean
  /** Extra strip rendered above the tab bar (e.g. band switch on phones). */
  toolbar?: ReactNode
  /**
   * Reports how many pixels of the viewport bottom this sheet is currently
   * covering — 0 while collapsed. A cabinet can use it to move the subject up
   * out from behind the sheet instead of leaving the learner adjusting a
   * control whose effect is hidden under their own thumb.
   */
  onObstructHeight?: (px: number) => void
}

/** Drag this far down and the sheet closes. Below it, the sheet springs back. */
const DISMISS_PX = 64

/**
 * Bottom sheet for compact layouts. The scene keeps most of the screen; the
 * learner pulls up Controls / Data / Missions as tabs. Only ever one tab is
 * open, and the sheet collapses to just its tab bar. Bumpers / [ ] cycle tabs;
 * "back" closes the sheet before it leaves the cabinet.
 *
 * Three ways out, because one was not enough: the × button, a downward swipe
 * on the grab handle, and tapping the open tab again. The chevron alone tested
 * badly — it reads as "there is more below" rather than "this closes".
 */
export default function HudDrawer({
  tabs,
  muted = false,
  toolbar,
  onObstructHeight,
}: Props) {
  const [active, setActive] = useState(tabs[0]?.id ?? '')
  const [open, setOpen] = useState(false)
  const [drag, setDrag] = useState(0)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const dragStart = useRef<number | null>(null)

  const select = useCallback((id: string) => {
    setActive((cur) => {
      if (cur === id) {
        setOpen((o) => !o)
        return cur
      }
      setOpen(true)
      return id
    })
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    setDrag(0)
  }, [])

  useBackHandler(
    useCallback(() => {
      if (open) {
        close()
        return true
      }
      return false
    }, [open, close]),
  )

  useInputAction(
    useCallback(
      (a) => {
        if (a.type !== 'tab' || tabs.length < 2) return
        const i = Math.max(0, tabs.findIndex((t) => t.id === active))
        const next = tabs[(i + a.dir + tabs.length) % tabs.length]
        setActive(next.id)
        setOpen(true)
      },
      [tabs, active],
    ),
  )

  /* -- What are we covering? -------------------------------------------- */

  // The callback is held in a ref so a caller passing an inline arrow does not
  // re-run the observer every render. Same trap as the reveal card's timer.
  const reportRef = useRef(onObstructHeight)
  reportRef.current = onObstructHeight

  useLayoutEffect(() => {
    const el = sheetRef.current
    const report = (px: number) => reportRef.current?.(Math.max(0, Math.round(px)))
    if (!el || !open) {
      report(0)
      return
    }
    const measure = () => report(el.getBoundingClientRect().height - drag)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open, active, drag])

  // Never leave a cabinet believing it is still obstructed.
  useEffect(() => () => reportRef.current?.(0), [])

  /* -- Swipe down to dismiss -------------------------------------------- */

  const onHandleDown = (e: ReactPointerEvent) => {
    if (!open) return
    dragStart.current = e.clientY
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const onHandleMove = (e: ReactPointerEvent) => {
    if (dragStart.current === null) return
    // Downward only: an upward drag on the handle should scroll nothing and
    // move nothing, rather than letting the sheet grow past its cap.
    setDrag(Math.max(0, e.clientY - dragStart.current))
  }

  const onHandleUp = () => {
    if (dragStart.current === null) return
    dragStart.current = null
    setDrag((d) => {
      if (d > DISMISS_PX) {
        setOpen(false)
        return 0
      }
      return 0
    })
  }

  // If the active tab disappeared (bench switch hides Data), fall back to the first.
  const current = tabs.find((t) => t.id === active) ?? tabs[0]

  const badgeCls = (tone: DrawerTab['badgeTone']) =>
    tone === 'warn'
      ? 'bg-[#FBEBD2] text-[#B97D10] animate-pulse'
      : tone === 'good'
        ? 'bg-[#EAF3E6] text-[#2E7D32]'
        : 'bg-[#F3E9D7] text-[#7A5252]'

  return (
    <div
      className={`pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col transition-opacity duration-300 ${
        muted ? 'pointer-events-none opacity-60' : ''
      }`}
      // Shorter than it was. The sheet used to take 70dvh, which on a 390×844
      // phone left a 250 px slot for a plant the learner was actively
      // changing. The cabinet also lifts the subject now (see
      // `onObstructHeight`), but giving the scene back real estate is the
      // cheaper half of the fix.
      style={{ maxHeight: 'min(56dvh, 100dvh - 5.5rem)' }}
    >
      {toolbar && <div className="mb-2 flex justify-center px-3">{toolbar}</div>}
      <div
        ref={sheetRef}
        className="mx-auto flex w-full max-w-[40rem] min-h-0 flex-col rounded-t-[22px] border border-b-0 border-[#F3E9D7] bg-[#FBF5EA]/95 shadow-[0_-12px_40px_rgba(30,52,34,0.35)] backdrop-blur-md"
        style={{
          transform: drag ? `translateY(${drag}px)` : undefined,
          transition: dragStart.current === null ? 'transform 180ms ease-out' : undefined,
        }}
      >
        {/* Grab handle — the swipe target, and the affordance that says the
            sheet moves at all. Only shown when there is something to dismiss. */}
        {open && (
          <div
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
            className="flex shrink-0 cursor-grab touch-none justify-center pt-2 pb-0.5 active:cursor-grabbing"
            aria-hidden
          >
            <span className="h-1 w-10 rounded-full bg-[#DCCFB4]" />
          </div>
        )}

        {/* Tab bar */}
        <div className="flex shrink-0 items-stretch gap-1 px-2 pt-2.5 pb-1">
          {tabs.map((t) => {
            const on = t.id === current?.id && open
            return (
              <Tile
                key={t.id}
                onClick={() => select(t.id)}
                aria-pressed={on}
                aria-label={t.label}
                className={`relative flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[14px] px-1.5 py-2 text-[12px] font-extrabold transition-all ${
                  on ? 'bg-[#3E7C43] text-[#FBF5EA] shadow' : 'text-[#7A5252] hover:bg-[#F3E9D7]'
                }`}
              >
                <span className={`shrink-0 ${on ? 'text-[#FBF5EA]' : 'text-[#3E7C43]'}`}>{t.icon}</span>
                <span className="truncate">{t.label}</span>
                {t.badge && (
                  <span
                    className={`absolute -top-1 -right-0.5 rounded-full border border-[#FBF5EA] px-1.5 py-px text-[9.5px] font-black tabular-nums shadow-sm ${badgeCls(
                      t.badgeTone,
                    )}`}
                  >
                    {t.badge}
                  </span>
                )}
              </Tile>
            )
          })}
          <Tile
            round
            onClick={() => (open ? close() : setOpen(true))}
            aria-label={open ? 'Close panel' : 'Expand panel'}
            aria-expanded={open}
            className="flex items-center justify-center rounded-full text-[#7A5252] hover:bg-[#F3E9D7]"
          >
            {open ? <X className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Tile>
        </div>

        {/* Sheet body */}
        {open && current && (
          <div
            className="min-h-0 overflow-y-auto overscroll-contain px-3 pt-1"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            {current.content}
          </div>
        )}
        {!open && <div style={{ height: 'max(0.25rem, env(safe-area-inset-bottom))' }} />}
      </div>
    </div>
  )
}
