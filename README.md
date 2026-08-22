# Ploobia

The school arcade — interactive 3D cabinets where nothing works until you find
out why. Ages 10–17, IGCSE-compatible.

This repository holds both halves of the public product and the script that
puts them together:

```
app/       the arcade — React 19 + TypeScript + @react-three/fiber,
           built by Vite into ONE self-contained dist/index.html
site/      ploobia.com — the front door, also a single self-contained file
functions/ Cloudflare Pages Functions (currently: the feedback endpoint)
scripts/   build-deploy.mjs assembles the bundle; verify.mjs runs the suites
```

Six cabinets live in `app`: the Photosynthesis Rate Lab, Blood Voyage, the
Motion Yard, the Atom Foundry and the River & Flood Bench, with the Circuit
Workshop still undiscovered.

## Getting started

```bash
npm install          # root: playwright, for the suites
npm run install:all  # app + site dependencies
npm run dev          # the arcade on :3000
npm run dev:site     # the public site
```

## Building the hostable bundle

```bash
npm run build
```

Produces `dist/` — the whole deployable thing:

| path | what |
| --- | --- |
| `index.html` | the public site |
| `app/index.html` | the arcade, ~2.5 MB / ~800 kB gzipped |
| `og.png` | social card |
| `_headers` | no-cache on both HTML files, so a reload gets the fix |
| `robots.txt` | `Disallow: /` unless `PLOOBIA_INDEXABLE=1` |

For a pilot build, add the report tab and stamp the build:

```bash
VITE_PILOT=1 PLOOBIA_BUILD=$(git rev-parse --short HEAD) npm run build
```

See `.env.example` for every switch. All of them are read at build time.

## Verifying

```bash
npm run build && npm run verify        # every cabinet
npm run verify atoms river             # just those
```

Each suite serves the built file over HTTP and drives it with Playwright,
asserting against the simulation handles cabinets expose on `window`
(`__atomSim`, `__riverSim`, `__journey`, …). They judge correctness, not frame
rate. Screenshots land in `app/shots/` — **look at them**: a 52/52-green build
once shipped with calcium's shell capacity wrong, and only the picture showed
it.

## Deploying

`DEPLOY.md`. Short version: Cloudflare Pages, build command `npm run build`,
output `dist`, deploys on push to `main`.

## House rules

`PLOOBIA.md` carries the architecture and the traps — the R3F, Vite and
verification mistakes that have each cost hours. Read it before the first
change.
