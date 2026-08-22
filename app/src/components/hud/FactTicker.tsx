import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { ALL_TICKER_FACTS } from '@/lib/facts'

/** "Did you know?" card that cross-fades a new fun fact every 12 seconds. */
export default function FactTicker() {
  const [pool, setPool] = useState<string[]>(ALL_TICKER_FACTS)
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    const shuffleTimer = window.setTimeout(() => {
      const arr = [...ALL_TICKER_FACTS]
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      }
      setPool(arr)
    }, 50)
    const t = window.setInterval(() => setIdx((i) => i + 1), 12000)
    return () => {
      window.clearTimeout(shuffleTimer)
      window.clearInterval(t)
    }
  }, [])

  return (
    <div className="pointer-events-auto flex w-[min(21rem,calc(100vw-2rem))] items-start gap-3 rounded-[20px] border border-[#F3E9D7] bg-[#FBF5EA]/90 p-4 shadow-xl backdrop-blur-md">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E8A33D]/20">
        <Sparkles className="h-4 w-4 text-[#E8A33D]" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-black tracking-widest text-[#C13B33] uppercase">
          Did you know?
        </div>
        <p key={idx} className="ticker-fade mt-1 text-[13px] leading-snug font-semibold text-[#5C3A3A]">
          {pool[idx % pool.length]}
        </p>
      </div>
    </div>
  )
}
