/**
 * The Atom Foundry became The Foundry Game (2026-09-07). Its suite lives in
 * `verify-foundry.mjs` (browser) and `verify-foundry-model.mjs` (the rules);
 * this file keeps the runner's `atoms` name pointing at the live suite.
 */
await import('./verify-foundry.mjs')
