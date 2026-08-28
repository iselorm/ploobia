import { useEffect, useState } from 'react'
import { RotateCw, X } from 'lucide-react'
import { Tile } from '@/components/ui/tile'
import { usePortrait } from '@/hooks/use-layout'

/**
 * "There is more room sideways" — a hint, deliberately not a button.
 *
 * The obvious thing to build here is a control that rotates the app to
 * landscape. It cannot be built honestly. `screen.orientation.lock()` requires
 * fullscreen and is **unsupported on iOS Safari entirely**, which is most of
 * the tablet and phone fleet a school actually owns. On Android it works only
 * after a fullscreen request the learner must also accept. So the button would
 * do nothing at all for most of its users, and something inconsistent for the
 * rest — and a control that silently fails is worse than no control, because
 * it teaches that the cabinet is broken rather than that the phone is narrow.
 *
 * What is left is worth doing: say it once, quietly, and let the learner turn
 * the device themselves. Portrait still has to work properly on its own, which
 * is the real fix and where the effort went.
 *
 * Shown on **phones only**. A tablet held in portrait has plenty of room and
 * does not need advice.
 */

/** Once per session, not once per mount. Cabinet switches must not re-nag. */
let shownThisSession = false

const PHONE_MAX = 520
const LINGER_MS = 7000

export default function RotateHint() {
  const portrait = usePortrait()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (shownThisSession || !portrait) return
    if (typeof window === 'undefined' || window.innerWidth > PHONE_MAX) return
    shownThisSession = true
    setShow(true)
    const t = window.setTimeout(() => setShow(false), LINGER_MS)
    return () => window.clearTimeout(t)
  }, [portrait])

  if (!show) return null

  return (
    <div className="pointer-events-none absolute inset-x-0 top-[8.6rem] z-30 flex justify-center px-3">
      <div className="atlas-plate pointer-events-auto flex items-center gap-2 rounded-full py-1.5 pr-1.5 pl-3">
        <RotateCw className="h-3.5 w-3.5 shrink-0 text-[#3E7C43]" />
        <p className="text-[11.5px] leading-tight font-bold text-[#5A4A32]">
          More room sideways — turn your phone.
        </p>
        <Tile
          round
          onClick={() => setShow(false)}
          aria-label="Dismiss the rotate hint"
          className="flex shrink-0 items-center justify-center rounded-full text-[#7A5252] hover:bg-[#F3E9D7]"
        >
          <X className="h-3.5 w-3.5" />
        </Tile>
      </div>
    </div>
  )
}
