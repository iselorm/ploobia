import { useCallback, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
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
}

/**
 * Bottom sheet for compact layouts. The scene keeps most of the screen; the
 * learner pulls up Controls / Data / Missions as tabs. Only ever one tab is
 * open, and the sheet collapses to just its tab bar. Bumpers / [ ] cycle tabs;
 * "back" closes the sheet before it leaves the cabinet.
 */
export default function HudDrawer({ tabs, muted = false, toolbar }: Props) {
  const [active, setActive] = useState(tabs[0]?.id ?? '')
  const [open, setOpen] = useState(false)

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

  useBackHandler(
    useCallback(() => {
      if (open) {
        setOpen(false)
        return true
      }
      return false
    }, [open]),
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
      style={{ maxHeight: 'min(70dvh, 100dvh - 5.5rem)' }}
    >
      {toolbar && <div className="mb-2 flex justify-center px-3">{toolbar}</div>}
      <div className="mx-auto flex w-full max-w-[40rem] min-h-0 flex-col rounded-t-[22px] border border-b-0 border-[#F3E9D7] bg-[#FBF5EA]/95 shadow-[0_-12px_40px_rgba(30,52,34,0.35)] backdrop-blur-md">
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
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Collapse panel' : 'Expand panel'}
            aria-expanded={open}
            className="flex items-center justify-center rounded-full text-[#7A5252] hover:bg-[#F3E9D7]"
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
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
