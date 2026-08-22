/// <reference types="vite/client" />

/** Stamped by `define` in vite.config.ts — see lib/pilot.ts. */
declare const __PLOOBIA_BUILD__: string

interface ImportMetaEnv {
  /** '1' turns on the in-app pilot report tab. */
  readonly VITE_PILOT?: string
  /** POST target for pilot reports. Unset → clipboard + mailto fallback. */
  readonly VITE_FEEDBACK_URL?: string
  /** Address the mailto fallback opens. */
  readonly VITE_FEEDBACK_EMAIL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
