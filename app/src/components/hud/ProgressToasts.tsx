import { useEffect, useState } from 'react'
import { Sparkles, Trophy } from 'lucide-react'
import { getBand } from '@/lib/bands'
import { onEvent, type LearningEvent } from '@/lib/events'
import { toastFor } from '@/lib/progression'

interface Toast {
  id: string
  title: string
  detail: string
  kind: 'mission' | 'other'
}

/**
 * Small, evidence-tied juice. A toast only ever follows a learning event, so
 * the learner sees the reward next to the thing that earned it. Wording is
 * band-skinned: Explorer gets tickets and exclamation marks, Analyst gets a
 * quiet "logged". Sits low-centre in the HUD (never over the 3D scene as a
 * floating label — it is HUD chrome, like the demo narration).
 */
export default function ProgressToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(
    () =>
      onEvent((e: LearningEvent) => {
        const t = toastFor(getBand(), e)
        if (!t) return
        const toast: Toast = {
          id: e.id,
          ...t,
          kind: e.type === 'mission.completed' ? 'mission' : 'other',
        }
        setToasts((prev) => [...prev.slice(-2), toast])
        window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== toast.id)), 3200)
      }),
    [],
  )

  if (!toasts.length) return null
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[4.25rem] z-30 flex flex-col items-center gap-1.5 sm:top-16"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`fact-pop flex items-center gap-2.5 rounded-full border px-4 py-2 shadow-xl backdrop-blur-md ${
            t.kind === 'mission'
              ? 'border-[#F3D9A0] bg-[#FDF3D8]/95 text-[#8A5A32]'
              : 'border-[#DDEAD8] bg-[#EAF3E6]/95 text-[#2E5A32]'
          }`}
        >
          {t.kind === 'mission' ? (
            <Trophy className="h-4 w-4 text-[#E8A33D]" />
          ) : (
            <Sparkles className="h-4 w-4 text-[#3E7C43]" />
          )}
          <span className="text-[13px] font-black">{t.title}</span>
          <span className="text-[11.5px] font-bold opacity-80">{t.detail}</span>
        </div>
      ))}
    </div>
  )
}
