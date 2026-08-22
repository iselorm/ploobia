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
Workshop still undiscovered. The Rate Lab also carries the Cinematic Lab
rendering work and a Cardboard stereo tour.

**This repository is the single line.** Four parallel sessions had forked it
into `web1`, `blood6` and the `SchoolArcade-cinematic` branch; all three are
merged here. Work in the repo, never in a `-src.zip` again.

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
VERIFY_STRICT=1 npm run verify         # refuse to skip anything (see below)
```

Each suite serves the built file over HTTP and drives it with Playwright,
asserting against the simulation handles cabinets expose on `window`
(`__atomSim`, `__riverSim`, `__journey`, `__perf`, …). Screenshots land in
`app/shots/` — **look at them**: a 52/52-green build once shipped with
calcium's shell capacity wrong, and only the picture showed it.

### Frame rate and honest skips

CI has no GPU. Chromium falls back to SwiftShader, which renders the heavier
cabinets at one to five frames per second — one to two orders of magnitude
slower than the cheapest real tablet. Two consequences, both handled rather
than papered over:

- **Hand-timed assertions cannot run.** The Motion Yard taps a stopwatch a
  fixed delay after a simulated event, and sim time only advances on rendered
  frames, so at 5 fps a tap lands a whole frame late. Those checks now measure
  the renderer first and report **`SKIP` with the measured fps — never a silent
  pass**. `VERIFY_STRICT=1` turns every skip into a failure, which is what a
  GPU runner or a real-device run should use.
- **Playwright clicks can time out on a correct page.** A click is several
  round-trips, each queued behind a main thread that took 4.2 s to answer a
  trivial call. `resilientClick()` in `verify-lib.mjs` tries the real click and
  falls back to dispatching the event, saying so when it does.

`?q=low|medium|high` anywhere in the URL pins the quality tier — for debugging,
and for suites that need frames more than fidelity. Software renderers are
detected at boot and start at `low` automatically.

### What the cabinets cost

`verify-perf.mjs` asserts per-cabinet **draw-call and triangle budgets** at the
low tier, because those numbers transfer to real hardware while headless frame
rate does not. Current low-tier cost at 1280×800:

| cabinet | draw calls | triangles | programs |
| --- | ---: | ---: | ---: |
| Rate Lab | 42 | 205,906 | 36 |
| Blood Voyage | 75 | 570,560 | 17 |
| Motion Yard | 86 | 184,842 | 36 |
| Atom Foundry | 142 | 44,408 | 14 |
| River Basin | 93 | 53,746 | 31 |

Every cabinet mounts `<PerfProbe/>` inside its Canvas, which publishes those
numbers to `window.__perf` **and onto every pilot report** — so a tester's "it
was laggy" arrives with the GPU, the tier, the frame time and the draw count
attached. Mounting the probe is not optional: its mount effect also re-arms the
adaptive-quality window, without which walking between cabinets ratchets a
capable tablet down a tier per room.

## Deploying

`DEPLOY.md`. Short version: Cloudflare Pages, build command `npm run build`,
output `dist`, deploys on push to `main`.

## House rules

`PLOOBIA.md` carries the architecture and the traps — the R3F, Vite and
verification mistakes that have each cost hours. Read it before the first
change.
