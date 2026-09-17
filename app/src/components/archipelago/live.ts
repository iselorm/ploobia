/**
 * Per-frame mutable state shared between the explorer, the camera, the
 * companion and the HUD's touch controls. Deliberately NOT React state: these
 * values change every frame and nothing needs to re-render on them.
 */
import * as THREE from 'three'

export const control = {
  /** Stick / WASD, −1..1 in the camera's frame (x right, y forward). */
  x: 0,
  y: 0,
  jump: false,
  /** Edge-triggered: set true by an input, consumed by the explorer. */
  interact: false,
  lens: false,
  /** Look drag in radians accumulated since last frame. */
  yaw: 0,
  pitch: 0,
}

export const live = {
  pos: new THREE.Vector3(0, 0.5, 0),
  /** Direction the explorer faces, radians about +Y. */
  facing: 0,
  camYaw: 0.6,
  camPitch: 0.42,
  grounded: false,
  /** Where Ploob is heading this frame (the quest target or the explorer). */
  ploobTarget: new THREE.Vector3(1.2, 0, 1.2),
  ploob: new THREE.Vector3(1.2, 0, 1.2),
  /** Where the explorer stands on arrival, per zone. */
  spawn: new THREE.Vector3(0, 0.6, 4),
  /** A requested teleport (suites, and later the lift); applied next frame. */
  requestPos: null as [number, number, number] | null,
}

export const SPAWNS: Record<string, [number, number, number]> = {
  landing: [0, 0.6, 4],
  foundry: [0, 0.6, 9.5],
}

const keys = new Set<string>()

const KEY_AXES: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
}

function isTextEntry(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable
}

function recompute() {
  let x = 0
  let y = 0
  for (const k of keys) {
    const a = KEY_AXES[k]
    if (a) {
      x += a[0]
      y += a[1]
    }
  }
  const len = Math.hypot(x, y)
  control.x = len > 1 ? x / len : x
  control.y = len > 1 ? y / len : y
}

/**
 * Keyboard adapter for the world. Installed in capture phase so the platform's
 * arrow-key focus navigation (lib/input.ts) sees `defaultPrevented` and leaves
 * the arrows to the explorer while the world is mounted.
 */
export function installWorldKeys(): () => void {
  const down = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey || isTextEntry(document.activeElement)) return
    if (KEY_AXES[e.code]) {
      keys.add(e.code)
      recompute()
      e.preventDefault()
      return
    }
    if (e.code === 'Space') {
      control.jump = true
      e.preventDefault()
    } else if (e.code === 'KeyE' || e.code === 'Enter') {
      if (!e.repeat) control.interact = true
    } else if (e.code === 'KeyL') {
      if (!e.repeat) control.lens = true
    }
  }
  const up = (e: KeyboardEvent) => {
    if (KEY_AXES[e.code]) {
      keys.delete(e.code)
      recompute()
    }
    if (e.code === 'Space') control.jump = false
  }
  const blur = () => {
    keys.clear()
    recompute()
    control.jump = false
  }
  window.addEventListener('keydown', down, { capture: true })
  window.addEventListener('keyup', up, { capture: true })
  window.addEventListener('blur', blur)
  return () => {
    window.removeEventListener('keydown', down, { capture: true })
    window.removeEventListener('keyup', up, { capture: true })
    window.removeEventListener('blur', blur)
    blur()
  }
}
