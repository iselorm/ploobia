import { Component, type ReactNode } from 'react'
import { HeartCrack, RotateCcw } from 'lucide-react'
import { captureSceneError } from '@/lib/pilot'

interface State {
  failed: boolean
}

function WebglFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2E080B] p-6">
      <div className="w-full max-w-md rounded-[28px] border border-[#F3E9D7] bg-[#FBF5EA] p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#C13B33]/10">
          <HeartCrack className="h-7 w-7 text-[#C13B33]" />
        </div>
        <h2 className="text-xl font-black text-[#402222]">The ride hit a bump!</h2>
        <p className="mt-2 text-sm leading-relaxed font-semibold text-[#7A5252]">
          Your browser could not start the 3D bloodstream (WebGL is unavailable or crashed). Try
          reloading, or use a browser with WebGL enabled.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mx-auto mt-5 flex items-center gap-2 rounded-full bg-[#C13B33] px-6 py-3 text-sm font-extrabold text-[#FBF5EA] shadow transition-all hover:bg-[#9E2B25] active:scale-95"
        >
          <RotateCcw className="h-4 w-4" />
          Reload the ride
        </button>
      </div>
    </div>
  )
}

/** Catches WebGL/renderer failures and shows a friendly fallback card. */
export default class SceneErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    // Kept out of console.error's own capture path so the message lands once,
    // tagged as a scene failure — the single most useful thing a pilot tester
    // can hand back after a black screen.
    captureSceneError(error)
    console.warn('Scene error:', error)
  }

  render() {
    if (this.state.failed) return <WebglFallback />
    return this.props.children
  }
}

export { WebglFallback }
