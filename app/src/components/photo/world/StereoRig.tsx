import type { PhotoSim } from '@/lib/photo'
import { VIEW_BY_ID } from '@/lib/viewpoints'
import SharedStereoRig from '@/components/world/StereoRig'

/**
 * The Rate Lab's Cardboard rig. The stereo machinery itself is a platform
 * primitive now (`components/world/StereoRig`) so more than one cabinet can
 * offer it; this wrapper only supplies the cabinet's own viewpoint table.
 */
export default function StereoRig({ sim }: { sim: PhotoSim }) {
  const v = VIEW_BY_ID[sim.viewId]
  return (
    <SharedStereoRig
      view={v ? { label: v.label, position: v.position, target: v.target } : null}
      viewSeq={sim.viewSeq}
    />
  )
}
