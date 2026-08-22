import type { Plugin } from 'vite'

/** Injects boot-guard.html at the top of <body>. See boot-guard.js. */
export declare function bootGuard(buildId?: string): Plugin
