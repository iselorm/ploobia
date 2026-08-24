import { forwardRef, useMemo } from 'react'
import * as THREE from 'three'

/**
 * Chemical labels drawn straight onto the molecules.
 *
 * A learner should not have to match a floating caption to a moving blob — the
 * carbon atom should say C, the oxygens should say O, and the droplet should
 * say H₂O. Text is rendered once to a canvas texture and then drawn with an
 * InstancedMesh, so a hundred labels cost one draw call rather than a hundred
 * DOM nodes.
 *
 * Platform primitive: every cabinet that labels things in the world uses this.
 */

const textureCache = new Map<string, { texture: THREE.CanvasTexture; aspect: number }>()

export interface GlyphStyle {
  /** Outline width in canvas px (default 14 — the classic soft halo). Small labels want 5–7. */
  strokeWidth?: number
  /** Outline colour (default the cream halo). A dark outline reads on bright scenes. */
  strokeColor?: string
  /** Font stack override — the atlas cabinets use a serif for specimen names. */
  font?: string
}

/** Render a formula to a transparent canvas texture, cached by text + colour + outline. */
export function glyphTexture(
  text: string,
  color: string,
  style: GlyphStyle = {},
): { texture: THREE.CanvasTexture; aspect: number } {
  const strokeWidth = style.strokeWidth ?? 14
  const strokeColor = style.strokeColor ?? 'rgba(251, 245, 234, 0.92)'
  const font = style.font ?? 'Nunito, ui-rounded, system-ui, sans-serif'
  const key = `${text}|${color}|${strokeWidth}|${strokeColor}|${font}`
  const cached = textureCache.get(key)
  if (cached) return cached

  // Wider formulas get a wider canvas so the glyphs never squash.
  const aspect = Math.max(1, Math.min(9, text.length * 0.56))
  const height = 128
  const width = Math.round(height * aspect)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  if (ctx) {
    ctx.clearRect(0, 0, width, height)
    ctx.font = `700 ${text.length > 8 ? 62 : 76}px ${font}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // The outline keeps the label readable against whatever sits behind it.
    ctx.lineJoin = 'round'
    if (strokeWidth > 0) {
      ctx.lineWidth = strokeWidth
      ctx.strokeStyle = strokeColor
      ctx.strokeText(text, width / 2, height / 2 + 4)
    }
    ctx.fillStyle = color
    ctx.fillText(text, width / 2, height / 2 + 4)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true

  const entry = { texture, aspect }
  textureCache.set(key, entry)
  return entry
}

interface Props {
  text: string
  color: string
  count: number
  /** World height of one label. */
  size?: number
  /** Optional outline override — see GlyphStyle. */
  style?: GlyphStyle
  /** Draw order, so labels sit above the things they name. */
  renderOrder?: number
}

/**
 * An InstancedMesh of camera-facing label quads. The parent writes the instance
 * matrices in its own frame loop, right alongside the atoms they belong to.
 */
const GlyphInstances = forwardRef<THREE.InstancedMesh, Props>(function GlyphInstances(
  { text, color, count, size = 0.26, style, renderOrder = 2 },
  ref,
) {
  const { texture, aspect } = useMemo(() => glyphTexture(text, color, style), [text, color, style])

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, count]}
      frustumCulled={false}
      renderOrder={renderOrder}
    >
      <planeGeometry args={[size * aspect, size]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        toneMapped={false}
        alphaTest={0.02}
      />
    </instancedMesh>
  )
})

export default GlyphInstances

const toCamera = new THREE.Vector3()

/**
 * Point an instance at the camera and size it, then commit the matrix.
 * Shared by every labelled molecule so billboarding behaves identically.
 *
 * `lift` pushes the label along the line to the camera. Without it a label
 * placed at an atom's centre sits inside the sphere and is hidden by its own
 * front face — which is exactly how the first version of this ended up with
 * invisible C and O labels.
 */
export function writeGlyph(
  mesh: THREE.InstancedMesh,
  index: number,
  dummy: THREE.Object3D,
  camera: THREE.Camera,
  position: THREE.Vector3,
  scale: number,
  lift = 0.24,
) {
  dummy.position.copy(position)
  if (lift > 0) {
    toCamera.copy(camera.position).sub(position)
    const length = toCamera.length()
    if (length > 1e-4) dummy.position.addScaledVector(toCamera, lift / length)
  }
  dummy.quaternion.copy(camera.quaternion)
  dummy.scale.setScalar(scale)
  dummy.updateMatrix()
  mesh.setMatrixAt(index, dummy.matrix)
}

/** Park an instance out of sight. */
export function hideGlyph(mesh: THREE.InstancedMesh, index: number, dummy: THREE.Object3D) {
  dummy.scale.setScalar(0)
  dummy.updateMatrix()
  mesh.setMatrixAt(index, dummy.matrix)
}
