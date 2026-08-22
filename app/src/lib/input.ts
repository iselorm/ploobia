/**
 * Input model — the platform-wide layer between devices and cabinets.
 *
 * Cabinets never ask "was A pressed?" or "was this tapped?". Devices are turned
 * into a small vocabulary of *actions* (move focus, confirm, back, adjust,
 * orbit, zoom, menu, tab) by adapters, and cabinets subscribe to actions.
 * Adding a new input source later means adding an adapter, not touching a
 * cabinet — the same discipline as `BAND_CAPS` in `bands.ts`.
 *
 * Detection is capability-based, never device-sniffing:
 *   • `pointer: coarse` / `hover: none`, or a real touch, → touch
 *   • a `gamepadconnected` event, or any live pad input, → gamepad
 *   • gamepad + big landscape viewport + no touch → tv (ten-foot presentation)
 *   • otherwise → pointer
 * The mode is mirrored onto `<html data-input="…">` so CSS can grow hit targets.
 *
 * Module-level store, no browser storage (unavailable in the preview sandbox).
 */

import { useEffect, useSyncExternalStore } from 'react'

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type InputMode = 'pointer' | 'touch' | 'gamepad' | 'tv'
export type FocusDir = 'up' | 'down' | 'left' | 'right'

export type InputAction =
  | { type: 'focus'; dir: FocusDir }
  | { type: 'confirm' }
  | { type: 'back' }
  | { type: 'menu' }
  /** Nudge the focused control. `axis: 'coarse'` is a bigger step. */
  | { type: 'adjust'; axis: 'coarse' | 'fine'; delta: number }
  /** Orbit the scene camera. Deltas are per-frame, unitless (≈ radians·k). */
  | { type: 'orbit'; dx: number; dy: number }
  /** Dolly the scene camera. Positive = zoom out. */
  | { type: 'zoom'; delta: number }
  | { type: 'tab'; dir: 1 | -1 }

export type ActionHandler = (action: InputAction) => void

/** Camera hooks a cabinet registers so orbit/zoom actions reach its rig. */
export interface CameraHandlers {
  orbit?: (dx: number, dy: number) => void
  zoom?: (delta: number) => void
}

export interface InputState {
  mode: InputMode
  hasTouch: boolean
  hasGamepad: boolean
  gamepadId: string | null
}

/* ------------------------------------------------------------------ */
/* Store                                                              */
/* ------------------------------------------------------------------ */

let state: InputState = { mode: 'pointer', hasTouch: false, hasGamepad: false, gamepadId: null }
const stateListeners = new Set<() => void>()
const actionListeners = new Set<ActionHandler>()
const backStack: Array<() => boolean | void> = []
let camera: CameraHandlers = {}

function setState(patch: Partial<InputState>) {
  const next = { ...state, ...patch }
  if (
    next.mode === state.mode &&
    next.hasTouch === state.hasTouch &&
    next.hasGamepad === state.hasGamepad &&
    next.gamepadId === state.gamepadId
  )
    return
  state = next
  if (typeof document !== 'undefined') document.documentElement.dataset.input = state.mode
  stateListeners.forEach((l) => l())
}

export function getInputState(): InputState {
  return state
}

export function getInputMode(): InputMode {
  return state.mode
}

/** Any hand-held or ten-foot mode: bigger targets, focus-driven navigation. */
export function isCoarse(mode: InputMode = state.mode): boolean {
  return mode !== 'pointer'
}

function subscribeState(l: () => void) {
  stateListeners.add(l)
  return () => {
    stateListeners.delete(l)
  }
}

/** Re-renders when the input mode changes. */
export function useInputMode(): InputMode {
  return useSyncExternalStore(subscribeState, getInputMode, getInputMode)
}

export function useInputState(): InputState {
  return useSyncExternalStore(subscribeState, getInputState, getInputState)
}

/* ------------------------------------------------------------------ */
/* Actions                                                            */
/* ------------------------------------------------------------------ */

/** Broadcast an action to every subscriber, then run the default behaviour. */
export function emit(action: InputAction): void {
  actionListeners.forEach((h) => h(action))
  defaultHandle(action)
}

/** Subscribe to actions. Returns an unsubscribe. */
export function onAction(handler: ActionHandler): () => void {
  actionListeners.add(handler)
  return () => {
    actionListeners.delete(handler)
  }
}

/** Hook form of `onAction`. */
export function useInputAction(handler: ActionHandler): void {
  useEffect(() => onAction(handler), [handler])
}

/**
 * Register what "back" means right now (close a card, leave zoom, …).
 * Handlers are a stack — the most recent one that returns `true` (or nothing)
 * consumes the action; return `false` to pass it down. Falls back to history.
 */
export function pushBackHandler(fn: () => boolean | void): () => void {
  backStack.push(fn)
  return () => {
    const i = backStack.lastIndexOf(fn)
    if (i >= 0) backStack.splice(i, 1)
  }
}

export function useBackHandler(fn: (() => boolean | void) | null): void {
  useEffect(() => {
    if (!fn) return
    return pushBackHandler(fn)
  }, [fn])
}

/** Cabinets register their camera rig so orbit/zoom actions have somewhere to go. */
export function registerCamera(handlers: CameraHandlers): () => void {
  camera = handlers
  return () => {
    if (camera === handlers) camera = {}
  }
}

export function useCameraHandlers(handlers: CameraHandlers): void {
  const { orbit, zoom } = handlers
  useEffect(() => registerCamera({ orbit, zoom }), [orbit, zoom])
}

/* ------------------------------------------------------------------ */
/* Focus navigation                                                   */
/* ------------------------------------------------------------------ */

const FOCUSABLE =
  'a[href], button:not([disabled]), [role="slider"]:not([aria-disabled="true"]), ' +
  'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), ' +
  '[tabindex]:not([tabindex="-1"])'

function isVisible(el: HTMLElement): boolean {
  if (el.getAttribute('aria-hidden') === 'true') return false
  const rects = el.getClientRects()
  if (rects.length === 0) return false
  const r = el.getBoundingClientRect()
  if (r.width < 2 || r.height < 2) return false
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (r.bottom < 0 || r.right < 0 || r.top > vh || r.left > vw) return false
  const cs = window.getComputedStyle(el)
  if (cs.visibility === 'hidden' || cs.pointerEvents === 'none' || cs.opacity === '0') return false
  // Something on top of it (an overlay) means it is not really reachable.
  return true
}

/** Every reachable control on screen, in document order. */
export function getFocusables(root: ParentNode = document): HTMLElement[] {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
  // Prefer the top-most layer: if a modal-ish overlay is open, keep to it.
  const layer = topLayer()
  return nodes.filter((el) => (layer ? layer.contains(el) : true) && isVisible(el))
}

/**
 * The element marked `data-focus-layer` that was mounted last (welcome
 * overlays, dialogs). Focus navigation stays inside it while it exists.
 */
function topLayer(): HTMLElement | null {
  const layers = document.querySelectorAll<HTMLElement>('[data-focus-layer]')
  return layers.length ? layers[layers.length - 1] : null
}

function centre(r: DOMRect) {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

/**
 * Spatial navigation: pick the nearest control in the requested direction,
 * weighting straight-ahead distance more than sideways offset. Works with the
 * controls that already exist — no explicit wiring per panel.
 */
export function findInDirection(from: HTMLElement, dir: FocusDir): HTMLElement | null {
  const fr = from.getBoundingClientRect()
  const fc = centre(fr)
  let best: HTMLElement | null = null
  let bestScore = Infinity
  for (const el of getFocusables()) {
    if (el === from) continue
    const r = el.getBoundingClientRect()
    const c = centre(r)
    let forward = 0
    let side = 0
    switch (dir) {
      case 'up':
        forward = fr.top - r.bottom
        side = Math.abs(c.x - fc.x)
        break
      case 'down':
        forward = r.top - fr.bottom
        side = Math.abs(c.x - fc.x)
        break
      case 'left':
        forward = fr.left - r.right
        side = Math.abs(c.y - fc.y)
        break
      case 'right':
        forward = r.left - fr.right
        side = Math.abs(c.y - fc.y)
        break
    }
    // Allow slight overlap (rows of chips whose boxes touch).
    if (forward < -Math.min(r.height, r.width) * 0.5) continue
    forward = Math.max(0, forward)
    // Controls that overlap the source on the cross axis are strongly preferred.
    const overlaps =
      dir === 'up' || dir === 'down'
        ? r.right > fr.left && r.left < fr.right
        : r.bottom > fr.top && r.top < fr.bottom
    const score = forward * forward + side * side * (overlaps ? 0.35 : 2.5)
    if (score < bestScore) {
      bestScore = score
      best = el
    }
  }
  return best
}

function activeControl(): HTMLElement | null {
  const el = document.activeElement as HTMLElement | null
  if (!el || el === document.body) return null
  return el
}

function focusEl(el: HTMLElement) {
  el.focus({ preventScroll: true })
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

/** Move focus in a direction; if nothing is focused, land on the first control. */
export function moveFocus(dir: FocusDir): boolean {
  const cur = activeControl()
  if (!cur || !isVisible(cur)) {
    const all = getFocusables()
    if (!all.length) return false
    // Start from the control nearest the screen centre — usually the panel.
    const cx = window.innerWidth / 2
    const cy = window.innerHeight / 2
    let best = all[0]
    let bd = Infinity
    for (const el of all) {
      const c = centre(el.getBoundingClientRect())
      const d = (c.x - cx) ** 2 + (c.y - cy) ** 2
      if (d < bd) {
        bd = d
        best = el
      }
    }
    focusEl(best)
    return true
  }
  const next = findInDirection(cur, dir)
  if (!next) return false
  focusEl(next)
  return true
}

function isTextEntry(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const t = (el as HTMLInputElement).type
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset'].includes(t)
  }
  return (el as HTMLElement).isContentEditable
}

function isSlider(el: Element | null): boolean {
  return !!el && el.getAttribute('role') === 'slider'
}

function sliderIsVertical(el: HTMLElement): boolean {
  return el.getAttribute('aria-orientation') === 'vertical'
}

/** Drive a Radix-style slider thumb with the keys it already understands. */
function nudgeSlider(el: HTMLElement, delta: number, coarse: boolean) {
  const key = coarse ? (delta > 0 ? 'PageUp' : 'PageDown') : delta > 0 ? 'ArrowRight' : 'ArrowLeft'
  const times = Math.max(1, Math.round(Math.abs(delta)))
  for (let i = 0; i < times; i++) {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  }
}

/* ------------------------------------------------------------------ */
/* Default behaviour for each action                                  */
/* ------------------------------------------------------------------ */

function defaultHandle(action: InputAction) {
  switch (action.type) {
    case 'focus': {
      const cur = activeControl()
      // A focused slider owns its own axis.
      if (cur && isSlider(cur)) {
        const vertical = sliderIsVertical(cur)
        const along =
          (!vertical && (action.dir === 'left' || action.dir === 'right')) ||
          (vertical && (action.dir === 'up' || action.dir === 'down'))
        if (along) {
          const positive = action.dir === 'right' || action.dir === 'up'
          nudgeSlider(cur, positive ? 1 : -1, false)
          return
        }
      }
      moveFocus(action.dir)
      return
    }
    case 'confirm': {
      const cur = activeControl()
      if (!cur) {
        moveFocus('down')
        return
      }
      if (isSlider(cur) || isTextEntry(cur)) return
      cur.click()
      return
    }
    case 'back': {
      for (let i = backStack.length - 1; i >= 0; i--) {
        const r = backStack[i]()
        if (r !== false) return
      }
      // Nothing claimed it: leave the cabinet for the arcade menu. (Not
      // history.back(): a learner who arrived by direct link would fall out
      // of the app entirely.)
      if (window.location.hash && window.location.hash !== '#/') {
        window.location.hash = '#/'
      }
      return
    }
    case 'adjust': {
      const cur = activeControl()
      if (cur && isSlider(cur)) nudgeSlider(cur, action.delta, action.axis === 'coarse')
      return
    }
    case 'orbit':
      camera.orbit?.(action.dx, action.dy)
      return
    case 'zoom':
      camera.zoom?.(action.delta)
      return
    case 'menu':
    case 'tab':
      // Cabinets subscribe to these; no default.
      return
  }
}

/* ------------------------------------------------------------------ */
/* Adapters                                                           */
/* ------------------------------------------------------------------ */

let installed = false

/**
 * Wire the adapters once at app start. Idempotent. Safe to call in tests —
 * everything it touches is checked for existence.
 */
export function installInputRuntime(): () => void {
  if (installed || typeof window === 'undefined') return () => {}
  installed = true
  const cleanups: Array<() => void> = []
  document.documentElement.dataset.input = state.mode

  /* ---- capability detection ---- */
  const coarse = window.matchMedia('(pointer: coarse)')
  const noHover = window.matchMedia('(hover: none)')
  const decide = () => {
    const touchy = state.hasTouch || (coarse.matches && noHover.matches)
    let mode: InputMode = touchy ? 'touch' : 'pointer'
    if (state.hasGamepad) {
      const big = window.innerWidth >= 1200 && window.innerWidth > window.innerHeight
      const ua = navigator.userAgent
      const tvish = /Xbox|PlayStation|SmartTV|SMART-TV|Tizen|Web0S|BRAVIA|AFT|CrKey/i.test(ua)
      mode = tvish || (big && !touchy) ? 'tv' : 'gamepad'
    }
    setState({ mode })
  }
  decide()
  const onMedia = () => decide()
  coarse.addEventListener('change', onMedia)
  noHover.addEventListener('change', onMedia)
  window.addEventListener('resize', onMedia)
  cleanups.push(() => {
    coarse.removeEventListener('change', onMedia)
    noHover.removeEventListener('change', onMedia)
    window.removeEventListener('resize', onMedia)
  })

  // A real touch is proof; a real mouse move on a touch-capable laptop wins back.
  const onTouch = () => {
    if (!state.hasTouch) {
      setState({ hasTouch: true })
      decide()
    } else if (state.mode !== 'touch' && !state.hasGamepad) {
      setState({ mode: 'touch' })
    }
  }
  const onMouse = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && state.mode === 'touch' && !coarse.matches) {
      setState({ mode: 'pointer' })
    }
  }
  window.addEventListener('touchstart', onTouch, { passive: true })
  window.addEventListener('pointermove', onMouse, { passive: true })
  cleanups.push(() => {
    window.removeEventListener('touchstart', onTouch)
    window.removeEventListener('pointermove', onMouse)
  })

  /* ---- keyboard adapter (arrows → spatial focus, Esc → back) ---- */
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
    if (isTextEntry(document.activeElement)) return
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight': {
        const dir = e.key.slice(5).toLowerCase() as FocusDir
        // Let a focused slider keep its own arrows (Radix handled + prevented them already).
        if (moveFocus(dir)) e.preventDefault()
        return
      }
      case 'Escape':
        emit({ type: 'back' })
        return
      case '[':
        emit({ type: 'tab', dir: -1 })
        return
      case ']':
        emit({ type: 'tab', dir: 1 })
        return
    }
  }
  window.addEventListener('keydown', onKey)
  cleanups.push(() => window.removeEventListener('keydown', onKey))

  /* ---- gamepad adapter ---- */
  cleanups.push(installGamepadAdapter(decide))

  return () => {
    cleanups.forEach((c) => c())
    installed = false
  }
}

/** Standard-mapping button indices. */
const BTN = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  BACK: 8,
  START: 9,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
} as const

const DEADZONE = 0.28
const REPEAT_FIRST = 380
const REPEAT_NEXT = 130

function installGamepadAdapter(onPresence: () => void): () => void {
  if (typeof navigator === 'undefined' || !('getGamepads' in navigator)) return () => {}
  let raf = 0
  let prevButtons: boolean[] = []
  const held: Partial<Record<FocusDir, number>> = {}
  let last = 0

  const dirFromInputs = (gp: Gamepad): FocusDir | null => {
    const b = gp.buttons
    if (b[BTN.UP]?.pressed) return 'up'
    if (b[BTN.DOWN]?.pressed) return 'down'
    if (b[BTN.LEFT]?.pressed) return 'left'
    if (b[BTN.RIGHT]?.pressed) return 'right'
    const x = gp.axes[0] ?? 0
    const y = gp.axes[1] ?? 0
    if (Math.abs(x) > Math.abs(y)) {
      if (x > 0.6) return 'right'
      if (x < -0.6) return 'left'
    } else {
      if (y > 0.6) return 'down'
      if (y < -0.6) return 'up'
    }
    return null
  }

  const poll = () => {
    const now = performance.now()
    const pads = navigator.getGamepads?.() ?? []
    let gp: Gamepad | null = null
    for (const p of pads) if (p && p.connected) gp = gp ?? p
    if (!gp) {
      if (state.hasGamepad) {
        setState({ hasGamepad: false, gamepadId: null })
        onPresence()
      }
      return
    }
    const dt = last ? Math.min(50, now - last) : 16
    last = now

    // Any live input from the pad makes it the current mode.
    const anyPressed = gp.buttons.some((b) => b.pressed) || gp.axes.some((a) => Math.abs(a) > DEADZONE)
    if (!state.hasGamepad && anyPressed) {
      setState({ hasGamepad: true, gamepadId: gp.id })
      onPresence()
    }
    if (!state.hasGamepad) return

    const b = gp.buttons
    const pressedNow = b.map((x) => x.pressed)
    const rising = (i: number) => pressedNow[i] && !prevButtons[i]

    if (rising(BTN.A)) emit({ type: 'confirm' })
    if (rising(BTN.B)) emit({ type: 'back' })
    if (rising(BTN.START)) emit({ type: 'menu' })
    if (rising(BTN.LB)) emit({ type: 'tab', dir: -1 })
    if (rising(BTN.RB)) emit({ type: 'tab', dir: 1 })
    // X / Y = coarse nudges on a focused slider.
    if (rising(BTN.X)) emit({ type: 'adjust', axis: 'coarse', delta: -1 })
    if (rising(BTN.Y)) emit({ type: 'adjust', axis: 'coarse', delta: 1 })

    // D-pad / left stick: focus movement with auto-repeat.
    const dir = dirFromInputs(gp)
    for (const d of ['up', 'down', 'left', 'right'] as FocusDir[]) {
      if (d !== dir) delete held[d]
    }
    if (dir) {
      const t = held[dir]
      if (t === undefined) {
        held[dir] = REPEAT_FIRST
        emit({ type: 'focus', dir })
      } else {
        const left = t - dt
        if (left <= 0) {
          held[dir] = REPEAT_NEXT
          emit({ type: 'focus', dir })
        } else held[dir] = left
      }
    }

    // Right stick orbits; triggers dolly. Continuous while held.
    const rx = gp.axes[2] ?? 0
    const ry = gp.axes[3] ?? 0
    if (Math.abs(rx) > DEADZONE || Math.abs(ry) > DEADZONE) {
      const k = dt / 1000
      emit({ type: 'orbit', dx: rx * 2.2 * k, dy: ry * 1.6 * k })
    }
    const lt = b[BTN.LT]?.value ?? 0
    const rt = b[BTN.RT]?.value ?? 0
    if (lt > 0.05 || rt > 0.05) {
      emit({ type: 'zoom', delta: (rt - lt) * 1.4 * (dt / 1000) })
    }

    prevButtons = pressedNow
  }

  const onConnect = (e: GamepadEvent) => {
    setState({ hasGamepad: true, gamepadId: e.gamepad?.id ?? 'gamepad' })
    onPresence()
  }
  const onDisconnect = () => {
    setState({ hasGamepad: false, gamepadId: null })
    onPresence()
  }
  window.addEventListener('gamepadconnected', onConnect)
  window.addEventListener('gamepaddisconnected', onDisconnect)
  // A timer, not requestAnimationFrame: on a slow device frames can be 100 ms+
  // apart and a real button press would fall between two polls.
  raf = window.setInterval(poll, 16)
  return () => {
    window.clearInterval(raf)
    window.removeEventListener('gamepadconnected', onConnect)
    window.removeEventListener('gamepaddisconnected', onDisconnect)
  }
}

/* ------------------------------------------------------------------ */
/* Convenience                                                        */
/* ------------------------------------------------------------------ */

/** Short wording for the camera hint strip, per mode. */
export function cameraHint(mode: InputMode): string {
  switch (mode) {
    case 'touch':
      return 'drag to orbit · pinch to zoom'
    case 'gamepad':
    case 'tv':
      return 'right stick orbits · triggers zoom'
    default:
      return 'drag to orbit · scroll to zoom'
  }
}

export function useCameraHint(): string {
  return cameraHint(useInputMode())
}
