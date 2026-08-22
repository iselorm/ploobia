import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { getQualityTier, resetFrameSampling } from '@/lib/quality'
import { FrameWindow, clearPerf, publishPerf } from '@/lib/perf'

/**
 * Publishes what the scene actually costs, once a second, from inside the
 * Canvas. One of these belongs in every cabinet's scene.
 *
 * It reads `renderer.info` — which three.js maintains anyway — plus a rolling
 * frame-time window. The cost is one object write per second, so there is no
 * reason to strip it from a production build and every reason to keep it: this
 * is what turns a tester's "it was laggy" into "412 draw calls at 1.5 DPR on a
 * Mali-G52".
 */
export default function PerfProbe({ cabinet }: { cabinet: string }) {
  const gl = useThree((s) => s.gl)
  const win = useRef(new FrameWindow())
  const since = useRef(0)

  const frames = win.current
  useEffect(() => {
    clearPerf()
    frames.clear()
    // Entering a cabinet costs a burst of shader compiles and texture uploads.
    // Re-arming here is what stops that burst being read as sustained slowness
    // and ratcheting a capable tablet down a tier per room. Mounting this probe
    // is therefore not optional — it is how adaptive quality stays honest.
    resetFrameSampling()
    return clearPerf
  }, [cabinet, frames])

  useFrame((_, dt) => {
    win.current.push(dt * 1000)
    since.current += dt
    if (since.current < 1) return
    since.current = 0
    // Too few samples to say anything honest about a median yet.
    if (win.current.size < 10) return

    const info = gl.info
    const canvas = gl.domElement
    const ms = win.current.median()

    publishPerf({
      cabinet,
      tier: getQualityTier(),
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      frameMs: Math.round(ms * 10) / 10,
      fps: ms > 0 ? Math.round(1000 / ms) : 0,
      worstMs: Math.round(win.current.worst()),
      // The backing store, i.e. after the tier's DPR cap — the number that
      // actually decides fill cost, not the CSS size.
      drawingBuffer: `${canvas.width}×${canvas.height}`,
      at: Date.now(),
    })
  })

  return null
}
