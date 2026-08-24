---
title: Build Log — The Sugar Line
type: build-log
status: shipped
created: 2026-08-24
tags: [ploobia, biology, photosynthesis, translocation, cabinet]
---

# Build Log — The Sugar Line

The Photosynthesis Rate Lab has been replaced. Same route (`#/photosynthesis`),
same cabinet id, entirely new cabinet: new model, new scene, new HUD, new
measurement loop, new missions.

**Why replace rather than extend.** The Rate Lab stopped where every textbook
stops — at the leaf, with a stream of oxygen bubbles. That is a good limiting-
factors lab and a poor account of photosynthesis, because it never says what
the sugar is *for*. Selorm asked for the scene to be reimagined with the
glucose visibly travelling through the stem; once the sugar leaves the leaf the
cabinet is about a supply chain, and a supply chain needs a different model, a
different instrument and a different set of questions.

---

## What it is

**The Sugar Line.** A leaf makes sugar out of air, water and light — and then
it has to get it somewhere. Three views of one plant:

| Stage | Scale bar | What it shows |
| --- | --- | --- |
| **Whole plant** | 10 cm | Source, phloem and every sink. Gold parcels leaving the leaves, blue water climbing, stores filling. |
| **Inside a leaf** | 2 µm | A chloroplast: grana running the light reactions, the Calvin cycle turning in the stroma, one carbon in six leaving as sugar. |
| **The stem, cut** | 100 µm | One xylem vessel and one sieve tube at working scale, sieve plates, companion cells, and the water crossing over at both ends. |

Five specimens — **common bean, maize, potato, tomato, prickly pear** — chosen
because each one answers "where do I put the surplus?" differently and a
learner has eaten all five.

## The model (`lib/sugarline.ts`)

One pure solve drives the visuals *and* the instruments, so they cannot
disagree. Real units throughout.

```
SOURCE   solveLeaf() — the Rate Lab's leaf physiology, kept because it is right
BUFFER   leaf starch: fills on surplus, drains after dark
LOADING  companion cells, Michaelis–Menten on the free sugar pool
FLOW     Münch pressure flow: Π = cRT at both ends, v = K·ΔP/(L·η)
SINKS    root store, fruit, growing tip — demand, capacity, growth cost,
         maintenance, and back-pressure when they fill
```

Numbers that had to be right, and are:

- 1 µmol CO₂ fixed → **0.0300 mg** glucose (Mr 180.16 ÷ 6).
- 240 g L⁻¹ sucrose at 25 °C → **1.74 MPa** by van 't Hoff; measured phloem
  source pressures are 1–1.5 MPa.
- Translocation runs at **0.7–1.8 m h⁻¹** across the five specimens; radio-
  tracer studies say ~1 m h⁻¹.
- The carbon audit closes: over an hour of plant time, fixed − burnt − stored
  balances to **under 0.01 mg**.

**The sieve plates are the whole resistance.** A bare Hagen–Poiseuille tube of
sieve-element bore runs sap fifty times too fast. `PHLOEM_CONDUCTIVITY` lumps
the perforated end walls in, calibrated to the measured velocity — which is
honest, because in a real sieve tube the plates, not the tube, dominate the
pressure drop.

**Congestion, and why the first version was wrong.** With the pods and roots
full, renormalising the sink shares handed 100% of the flow to the growing tip
— which never fills — so the line ran at full speed with every store packed.
That is not what happens. A tip can only use sugar as fast as it can build
tissue; what the shut sinks would have taken backs up and raises the
concentration at the unloading end. One `congestion` term fixed it, and "a full
store slows the whole line" became true.

## The measurement loop

Three instruments, all reading the same solve:

- **Phloem tap** — sugar export rate, mg h⁻¹. (An aphid stylet left in a sieve
  tube drips pure sap; that is how the rate is really measured.)
- **Tracer run** — translocation speed, m h⁻¹. Release a labelled parcel and
  time it between two scribed marks. The plant clock drops from ×1800 to ×45
  for the run, and **the stopwatch counts plant seconds**, so speed is distance
  ÷ time with no hidden conversion. The result card shows the gap between the
  learner's timing and the truth and names it as reaction time.
- **Balance** — net carbon gain, mg h⁻¹. Negative at night.

Then the house pattern, unchanged: pick one variable, commit a prediction, run
a timed trial, record it, and only recorded evidence completes a mission.

## The nine missions

Wake the line up · The night shift · Cut the ring · Find the ceiling · Time the
sugar · Dry the line out · Balance the books · Fill the store · Two plants, one
question.

The three that carry the cabinet: **the night shift** (the sun is off and the
line keeps running on starch — which is why a leaf weighs most at dusk),
**cut the ring** (girdling stops the sugar dead and leaves the water alone —
which is why a ring-barked tree stays green for weeks and starves from the
bottom up), and **fill the store** (a full sink pushes back, so yield is not
always limited by the leaf).

## The look

A **field-guide plate**, not a diorama. Two references, used differently:

- **Seed Atlas** (seedsatlas.vercel.app) for the chrome: the #F6F2E8 cream
  ground, white cards with hairline rules and generous radii, a display serif
  over a rounded sans, letterspaced uppercase eyebrows, tiny chips, a specimen
  library rail with silhouettes, a specimen on a soft podium, a tip card, and —
  the best single idea taken from it — **a scale bar in the corner of every
  stage**. Without it a chloroplast and a stem look like objects of the same
  size, which is the exact misconception the three views exist to undo.
- **ThreeUI** (github.com/MengTo/threeui, MIT) for the motion vocabulary. Worth
  being precise about what was and was not imported: ThreeUI's components are
  sandboxed `srcDoc` documents or standalone renderers with their own three.js
  runtime, and its whole catalogue is dark. Dropping one into an R3F cabinet
  would cost a second WebGL context, break the shared camera and depth, add
  200 kB to a 2.5 MB single-file bundle, and reintroduce the dark aesthetic
  Selorm rejected in the Atom Foundry review. So the **techniques** were ported
  into the cabinet's own canvas and re-lit for cream: the **Dot Matrix** pulse
  grid became the plate's backdrop, the **Structure Flow** particle dome became
  the CO₂ field around the canopy, **Orbital Sphere** became the Calvin cycle
  ring, and Sylva's **survey pulse** became Reaction Vision's travelling
  wavefront. Sylva's fern generator was adapted directly (MIT) into
  `pinnateGeometry` for the potato and tomato leaves.
- **The Bugged Dev's** Anatomy Atelier stays the reference for the asset level:
  its 16×32 gradient-DataTexture → PMREM environment is what lights this
  cabinet, and its Tripo pipeline is written up in the asset brief.

## Traps this build hit — do not relearn

- **A Frenet frame is the wrong basis for a plant stem.** `taperedTube` used
  `computeFrenetFrames`, and the frame twists unpredictably along a gently
  curving line — so the stem's cutaway slot faced a different direction on
  every specimen and never lined up with the vascular strands inside it. Fixed
  by using a world-aligned ring: angle `v` always means `(sin v, 0, cos v)`, so
  `v = 0` is reliably "toward the camera". Stems are near enough vertical for
  the error to be invisible.
- **The pith hid the pipes.** The pale core was drawn at 0.82 of the stem
  radius and the vascular strands at 0.42–0.68, i.e. inside it. Anatomically
  the bundles sit *outside* the pith; drawing them the other way round put the
  entire point of the cutaway behind an opaque cylinder.
- **A notched drum is not a section.** Two attempts at a cut-away block of soil
  both read as a chocolate cake with a chip out of it — at this scale the
  curved back wall is most of what you see. The fix was to delete the block
  entirely and use the reference atlas's germinating-seed idiom instead: a low
  mound at the surface, and the root ball hanging below it in open air.
- **Three's cylinder puts angle θ at `(sin θ, 0, cos θ)`.** A cut face has to be
  offset *out along that direction*; sitting it at the origin leaves half of it
  poking out the far side. (Twenty minutes.)
- **A parcel pool outlives its route table.** Swapping specimen rebuilt the
  leaf→sink curves while sugar parcels still held indices into the old array —
  191 `Cannot read properties of undefined` in one probe run. Any pooled
  particle that indexes a rebuilt table needs a guard, not just a reset.
- **A 19 rem plate in a 16 rem column is clipped, and `elementFromPoint`
  returns the canvas.** The numbers were being cut off on the right of the
  conditions panel and a slider tap silently did nothing, because the overflow
  container clipped the hit area. Columns own the width; plates are `w-full`.
- **Five stacked plates push the primary control below the fold.** At 1400×900
  "Run measurement" sat at y ≈ 934. The right column now pins the instruments
  at the top and tabs everything else underneath, and the suite asserts the Run
  button and the prediction dial are inside the viewport at both 1440×900 and
  1280×720. (The vault already warned about this after the pilot report tab;
  measure with `boundingBox()`, never by eye.)
- **A panel that only mounts when its tab is open cannot emit events.** Mission
  completion was logged from `MissionPlate`, so a mission completed behind a
  closed tab earned nothing. XP, skill tracks, rank and the parent digest are
  all derived from the event log — the emit belongs on the page, which is
  always mounted.
- **`getByRole('button').first()` walks the DOM, not the z-order.** With the
  welcome card rendered last, `/start/i` resolved to a mission tile *behind*
  the overlay and every suite's opening click was intercepted. The welcome now
  renders before the HUD, and the first mission was renamed off "Start".
- **Auditing hit targets in a pointer context measures the wrong number.** The
  input store mirrors the mode onto `<html data-input>` and that sets `--hit`
  (36 px pointer / 48 px touch). A phone audit has to open the page with
  `hasTouch` and land one real tap first.
- **The bottleneck has to be measured against the right quantity.** Ranking a
  nudge by export rate says "nothing would help" in deep shade (the leaf still
  has banked sugar to load) and again in a drought (the line has stalled
  completely, so no nudge moves it at all). Three regimes: rank by *source
  pressure* when the gradient has collapsed, by *production* when the factory
  is the slow step, by *export* otherwise.
- **CPU contention fakes failures.** `verify-motion` and `verify-blood6` both
  failed while `verify-sugar` was running beside them, and both passed cleanly
  when run alone. The vault already says this; it is worth saying twice.

## Verification

| Suite | Result |
| --- | --- |
| `verify-sugar-model.mjs` (new) | **54/54** — units, van 't Hoff, velocity range per specimen, girdling, drought, cold, night, full sinks, bottleneck, C3 vs C4, and a closing carbon audit |
| `verify-sugar.mjs` (new) | **77/77** — the loop, the surgery, the tracer, bands, missions-on-evidence, write-up, fold and overlap at three viewports, thumb targets |
| `verify-cinematic.mjs` (rewritten) | 18/18 |
| `verify-input.mjs` | 19/19 |
| `verify-touch.mjs` | 21/21 |
| `verify-light.mjs` | 14/14 |
| `verify-stereo.mjs` | 8/8 |
| `verify-progression.mjs` | 22/22 |
| `verify-atoms.mjs` | 52/52 |
| `verify-river.mjs` | 83/83 |
| `verify-journey.mjs` | 40/40 |
| `verify-blood5.mjs` | 21/21 |
| `verify-blood6.mjs` | 35/35 |
| `verify-perf.mjs` | 17/17, 4 honest skips |

Cabinet cost at the low tier, 1280×800: **85 draw calls, 18 k triangles** —
against the old Rate Lab's 42 / 206 k. More small instanced meshes, an order of
magnitude less geometry. The perf budget was tightened to 120 calls / 120 k
triangles so a regression fails loudly.

`verify-sugar-model.mjs` is the one to copy into future cabinets: it bundles
the pure model with esbuild and asserts against it in Node, which is the only
way to check that the carbon balances or that a full sink pushes back — neither
is observable through the HUD.

## What moved, and what is now unreferenced

Promoted to platform primitives, because more than one cabinet needs them:

- `components/world/Glyphs.tsx` — the in-world label system (was
  `components/photo/Glyphs.tsx`, which now re-exports it)
- `components/world/StereoRig.tsx` — Cardboard, taking the viewpoint as data
  rather than importing one cabinet's table

`pages/Photosynthesis.tsx` is deleted. The Rate Lab's own components
(`components/photo/{GardenWorld,PhotoScene,MembraneWorld,Chloroplast,BubbleTube,
EquationStage,MoleculeFlows,hud/*}`) are now unreferenced and tree-shaken out of
the bundle, but they are **left on disk on purpose**: `components/photo/world/*`
and `Sprites.tsx` are imported by the Atom Foundry, the Motion Yard, the River
Bench and Blood Voyage, so this folder is a de-facto shared library and cannot
be deleted wholesale. Anyone tidying it should move the shared pieces to
`components/world/` first.

**Parked, not lost:** the membrane bench (diffusion and osmosis) was a mode of
the old cabinet and has no home in this one. `lib/membrane.ts`,
`MembraneWorld.tsx` and `MembranePanel.tsx` are intact and are the obvious seed
of a **Cell Transport** cabinet.

## Next

- The Tripo asset layer — see [[Tripo Asset Brief — The Sugar Line]]. The pods,
  the cob, the tubers and the root ball are where a generated mesh would beat
  generated geometry; the molecules and the organelle must stay diagrammatic.
- A **girdled-tree time-lapse** as an Analyst extension: leave the ring cut and
  watch the root store drain to zero over a plant-week.
- **Sink competition as a control**: let the learner remove side shoots or thin
  a truss, which is the same physics used deliberately by every grower.
- **Sugar to starch and back** in the tuber, which is what keeps the tuber able
  to accept more — the model already reasons about it, the scene does not show
  it yet.
