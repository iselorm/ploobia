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
  /** '1' builds the Archipelago (world branch) in. Unset → the classroom arcade. */
  readonly VITE_WORLD?: string
  /** Where a why in the learner's own words is judged. Unset → same-origin `/api/why`. */
  readonly VITE_WHY_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
