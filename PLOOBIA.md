# PLOOBIA — Project Instructions

> **Name (decided 2026-08-18):** the product and world is **Ploobia** (ploobia.com / ploobia.app). Learners *enter* Ploobia; "the school arcade" is the descriptor for adults. Use "Ploobia" in all user-facing copy, titles and metadata; regions/cabinets inside it carry the serious names.

> Drop this file in the repo root (as `CLAUDE.md`, `AGENTS.md`, or your agent's equivalent).
> It is the single source of truth for how this project is built, extended, and delivered.

## 1. Vision

**Ploobia** (formerly School Arcade) is a growing collection of interactive 3D science experiences for
middle-school kids (primary tester: one 8th grader). Each subject is an "arcade cabinet":
a full-screen, playful, scientifically accurate simulation you open in a browser —
no installs, no accounts, no explanation needed. Kids learn by *playing scientist*:
poking things, cranking sliders, breaking experiments, and collecting fun facts.

Current cabinets:
| Route | Cabinet | Status |
|---|---|---|
| `#/` | Menu — adventure picker + band selector | ✅ |
| `#/blood` | Blood Voyage — ride the bloodstream, click cells for facts | ✅ |
| `#/photosynthesis` (leaf lab) | Photosynthesis **Rate Lab** — measurable rate experiment across five leaves and five climates, | ✅ |
| `#/photosynthesis` (membrane bench) | **Membrane Lab** — pick a membrane, watch diffusion and osmosis with net-flow arrows, timers and a live graph | ✅ |
| `#/motion` | **Motion Yard** (Physics, Mechanics strand I) — an outdoor yard on the Cinematic Lab meadow (venue layer: Outdoors / Workshop hangar); the gravity dial retunes the whole world. Toy car on a racing lane, slingshot/catapult/trebuchet launch family, Scout the drone for drops; Physics Vision AR layer (telemetry tags, strobe trails, ghost runs, vectors, v–t curtain, timing-gate splits); placed landing-ring predictions; measured reaction-time calibration, learner-plotted graphs, equations earned onto the holo-board, segue to the pendulum | ✅ |
| `#/atoms` | **Atom Foundry** (Chemistry strand I) — a warm foundry at night: three crucibles (p⁺/n⁰/e⁻) feed a luminous Bohr-model atom on a stage; shells ignite as they fill; a dark wall of sockets IS the periodic table (rows = shells, columns = outer electrons) with a ghost frame tracking the current build; forging (neutral + stable only) flies the atom into its one possible slot; the grip probe measures real first ionisation energies (kJ/mol, Z 1–20) into a grip-vs-Z graph — the Analyst sawtooth is the evidence shells exist; isotopes/ions via band caps `isotopes`/`electronCloud` | ✅ |

## 2. Audience & tone

- **Age**: 10–17, served by the three-band system in §2b rather than by separate builds.
  Any single band should read as though it were written for exactly that age.
- **Science must be correct.** Facts are short, surprising, and true. If a number is
  stated (e.g. "an RBC circles the body in ~60 seconds"), it must be real.
- **Vocabulary is a feature, not a barrier**: use the real term ("limiting factor",
  "semi-permeable"), then immediately explain it in kid language.
- **Every concept gets an interaction.** No passive diagrams. If a kid can't change
  something and watch the world react, it's not done.
- Fun multipliers: counters that tick up, rare things to spot, zoom-ins, "did you know?" tickers.

## 2b. Learning bands (platform-wide)

`src/lib/bands.ts` owns a tiny module store holding one of `explorer` (10–12),
`scientist` (13–15) or `analyst` (16–17). It is chosen on the menu and on each
cabinet's welcome card, and can be changed mid-session from the `BandSwitch`
chip every cabinet carries. The choice survives hash navigation; it deliberately
uses **no browser storage** (see §7.5).

Cabinets never branch on the band id. They read `BAND_CAPS[band]` — a flags
object covering vocabulary level, which controls exist, whether a prediction is
required, instrument noise, repeats, data table, conclusion builder, CSV export
and trial length. Adding a band-aware feature means adding a flag, not an
`if (band === ...)`.

**The band changes academic depth, never visual quality.** A ten-year-old and a
seventeen-year-old see the same 3D world.

## 2b-ii. Labelling the world (no HTML overlays in a 3D scene)

**Rule: nothing in a 3D scene is labelled with a `<Html>` overlay.** Those
captions float above everything, ignore depth, collide with each other and land
on top of the HUD. Every label in the garden is now geometry:

- `components/photo/Glyphs.tsx` renders a formula once to a canvas texture and
  draws it with an `InstancedMesh` of camera-facing quads. A hundred labels cost
  one draw call instead of a hundred DOM nodes.
- The identity goes **on the molecule**: the carbon says C, each oxygen says O,
  the droplet says H₂O, the sugar says C₆H₁₂O₆. Oxygen leaves as a bonded pair,
  because drawing it as a lone ball teaches the wrong thing.
- **Label a subset, not everything** (`LABEL_EVERY_*`). Every molecule wearing a
  formula turns the sky into a wall of text. Glucose gets exactly one label
  because the cubes pile up in one small patch.
- `writeGlyph(..., lift)` pushes each label along the line to the camera. Place
  it at an atom's centre and the sphere's own front face hides it.
- Single-object captions (the gas syringe, the chloroplast) are billboarded
  planes with the same texture helper, positioned where traffic does not pass —
  the syringe label sits *below* the tube, not above it.

## 2b-iii. Camera rules

**Never lerp the camera toward a fixed viewpoint every frame.** The first
version did, and it silently fought every drag: you could orbit, and the rig
pulled you straight back. Scripted movement runs only for a short window after
an explicit request; otherwise OrbitControls owns the camera outright.

- Full sweep: `minPolarAngle 0.06` to `maxPolarAngle 0.86π`, unlimited azimuth,
  `minDistance 1.6` to `maxDistance 36`.
- HUD zoom/orbit/reset buttons talk to the rig through `sim` fields
  (`viewZoom`, `autoOrbit`, `viewReset`), same mutable-sim pattern as everything else.
- **Wait for `useThree(s => s.controls)` before marking the rig mounted.**
  OrbitControls is not registered on frame one; flipping the flag early leaves
  the orbit target at the world origin and aims the camera at the dirt.

## 2b-iv. Visual language

Gen Alpha judge a learning tool against games, so "tidy and deliberate" beats
"lots happening". Concretely, in this cabinet:

- **Sunlight is orderly.** Sparks are grouped into fixed lanes from the sun to
  the leaf, evenly spaced within each lane and moving at one steady speed — they
  drop in columns like icicles. More light adds *lanes*, never turbulence, so
  the scene stays readable at every setting. The first attempt scattered
  stretched streaks at random and read as noise.
- **Gradient sky dome + fog matched to the horizon.** A flat background colour
  and a ground disc that stops in a hard circle are the two things that make a
  3D scene look like a diagram. Both are ~20 lines to fix.
- **Contact shadows.** A soft dark ellipse under anything standing on the floor.
  Nothing else grounds objects as cheaply.
- **Clean light sources.** A glowing disc with a soft halo beats spinning
  geometry every time; rotating boxes around the sun read as clutter.
- **Slow drifting motes** for depth, at very low opacity.

## 2c. The measurement loop (the pattern every science cabinet should copy)

A sandbox is delightful at ten and boring at sixteen. What fixes that is not
more graphics, it is *measurement*:

1. **Choose one independent variable**, with the other three shown explicitly as
   controlled variables.
2. **Commit a prediction** before the trial runs (a point on the graph for
   Scientist/Analyst, a direction for Explorer).
3. **Run a timed trial** against a visible instrument — here a graduated tube
   collecting O₂, the classic pondweed apparatus.
4. **Record → table → live graph**, with band-appropriate uncertainty.
5. **Missions complete on recorded evidence**, never on a slider position.
6. **Write it up** as claim / evidence / reasoning / limitations.

Two rules learned the hard way while building this:

- A reading belongs to the conditions it was taken under. Snapshot every control
  at trial *start* (`snapshotTrial`), and **discard the trial** if a condition
  changes mid-run rather than quietly mislabelling the point.
- Drive trial and physics timing from a loosely-clamped `dt` (≤0.25 s), not the
  tight animation clamp (≤0.05 s). On a slow machine the tight clamp stretches a
  "6 second" trial into twelve real seconds.

## 2c-ii. The membrane bench pattern

Abstract processes need three things before they teach anything:

1. **A visible mechanism.** The membrane has pores of a chosen size; particles
   have sizes; crossing happens if it fits. Swapping cling film for filter paper
   changes the outcome for a reason a learner can see, not because a flag flipped.
2. **Net movement drawn separately from movement.** An arrow scaled by the net
   crossing rate, shrinking to nothing at equilibrium, is the only way "the
   particles are still moving but there is no net movement" lands.
3. **Time, counts and a graph.** Elapsed seconds, a live split bar, and a curve
   flattening onto the 50% line.

Two modelling notes worth keeping:

- **Brownian motion must be ballistic, not per-frame jitter.** Re-randomising a
  position every frame is technically a random walk but looks like vibration and
  spreads about a hundred times too slowly. Give each particle a velocity and
  scatter it on collision.
- **Temperature has to be modelled as a diffusion coefficient, not a speed.**
  Molecular speed rises only with √T — about 8% across a 2–50 °C slider, which
  is invisible. Real liquids speed up because viscosity falls: D ∝ T/η roughly
  triples over that range. Scale particle speed by √D so the *spreading rate*
  tracks D.

## 2d. The journey pattern (Blood Voyage — shipped 2026-08-20)

Blood Voyage is no longer a plain endless ride: it is one full circuit of the
circulation, expressed as *distance* along the infinite tunnel. `lib/journey.ts`
owns the loop — six stages (lungs → heart → artery → capillary → tissue → vein,
`LAP_LENGTH` world units per lap) with per-stage vessel radius, wall colour,
translucent "window" fraction, flow pace, pulse gain, fog and light. Both the
GLSL wall shader (`Vessel.tsx`, uniform arrays) and the JS cell sims blend
stages with the same piecewise smoothstep, so what the learner sees and what
the cells obey always agree. Key pieces:

- **Hero cell** (`HeroCell.tsx`): one ringed RBC rides ahead of the camera with
  4 haemoglobin sites; self-labelled O₂ docks in the lungs, leaves at the
  tissue, CO₂ hitches the return ride. The crowd shows the trend (oxygenation
  colours the instanced cells per-position); the hero shows the mechanism.
- **Journey world** (`JourneyWorld.tsx`): alveoli breathe outside the lungs'
  translucent wall, body cells wait outside the capillary/tissue wall, and
  orderly radial gas lanes (O₂/CO₂) cross where exchange happens.
- **Meet-the-cell story**: a once-per-run skippable beat at a featured body
  cell (membrane / nucleus / mitochondria labelled in-world) — the ride slows,
  the camera steers, one O₂ is walked into a mitochondrion and CO₂ comes back.
  Narration/toasts run on wall-clock time (`nowS()`), never sim time, or the
  0.05 s dt clamp stretches them on slow GPUs.
- The journey map chip + O₂/CO₂ cargo dots live in `hud/JourneyChip.tsx`;
  toasts + story narration in `hud/StoryCard.tsx` (low-centre, demo pattern).

Copy this pattern for future "ride" cabinets (digestion tract, a river's
course, a nerve impulse): stages as distance, a hero to carry the mechanism,
windows in the wall wherever the interesting exchange happens.

## 3. Tech stack (pinned — do not change casually)

- Node.js 20 · Vite 7 · React 19 + TypeScript · Tailwind CSS 3.4 · shadcn/ui
- three + @react-three/fiber + @react-three/drei for all 3D
- **HashRouter** — MANDATORY, see §7 (never BrowserRouter)
- **vite-plugin-singlefile** — MANDATORY; the build ships as ONE self-contained
  `dist/index.html` that works from `file://`, USB sticks, and email attachments
- `base: './'` in vite.config.ts — relative asset paths always

## 4. Architecture conventions

```
src/
  pages/<Cabinet>.tsx          # one per route; composition only, no scene logic
  components/<cabinet>/        # scene components (R3F), one concern per file
  components/<cabinet>/hud/    # DOM overlay UI (panel, cards, ticker, welcome)
  lib/<cabinet>.ts             # pure logic: rate models, fact lists, sim math
```

Rules:
- **Scene vs. HUD separation.** R3F canvas owns 3D; HTML/Tailwind overlay owns UI.
  They communicate through a small state store/props — never by reaching into each other.
- **Instancing for crowds.** Anything with hundreds of copies (cells, molecules,
  particles) is an `InstancedMesh`. No per-frame allocations in the render loop.
- **Every cabinet has a density/performance slider.** This is the escape hatch for
  weak hardware — non-negotiable.
- **WebGL failure degrades gracefully** via the shared `SceneErrorBoundary` +
  a themed fallback card. A kid on an old Chromebook sees an apology card, not a crash.
- **Routes are hash routes.** Add a card on the Menu page for every new cabinet.

## 5. The Cabinet Recipe (every new module follows this)

1. **Welcome overlay** — title, one-sentence premise ("You're a leaf scientist…"),
   a band picker, and TWO buttons: "Show me how it works" and "Start
   experimenting". Dismisses into the scene.
1a. **A membrane-style bench where relevant** — see §2c-ii.
1b. **A guided demo** (`lib/demo.ts`) — the cabinet runs one complete
   investigation by itself, driving the *real* handlers so the sliders visibly
   move and real trials run, with narration low and centred and a skip button
   throughout. Readings it produces are deleted when it ends, so the learner's
   own data starts empty. Nothing is a video: if the demo can do it, the learner
   can do it with the same controls.
2. **The toy** — the core interactive 3D scene. Auto-motion so it's alive before
   the kid touches anything.
3. **Experiment controls** — 2–4 sliders/toggles with *visible* causal effect.
   Prefer controls that teach a real principle (limiting factors, concentration
   gradients, inverse-square law).
4. **Click-for-facts** — important objects are tappable and pop a fact card.
   8–12 facts per major object type, rotating.
5. **"Did you know?" ticker** — cycles every ~12 s.
6. **A live counter** — glucose made, cells passed, orbits completed. Silly, delightful.
7. **About card** — collapsible, 2–3 short paragraphs, 8th-grade level, include the
   real equation/formula where one exists.
8. **Back-link chip** to `#/` menu.

## 6. Design system

- **Palette**: warm and organic. Cream/ivory UI cards, deep warm neutrals, ONE accent
  color per cabinet (blood = warm red, photosynthesis = leaf green, chemistry = amber,
  physics = slate blue…). No blue-purple gradients, no neon saturation.
- **Type**: Nunito (headings/UI) + clean sans for body. Rounded, friendly.
- **UI shape**: rounded-2xl cards, soft shadows, generous whitespace, collapsible
  panel on mobile. HUD never covers the center of the scene.
- **Feel**: everything idles gently (bobbing, pulsing, drifting). Stillness = dead.

## 7. Hard-won lessons — DO NOT relearn these

1. **Never BrowserRouter.** The preview/file pipeline serves the app at paths like
   `/index.html`; BrowserRouter matches no route → totally blank page, no error.
   HashRouter renders under any path. (Cost us a full debugging round.)
2. **Never multi-file builds.** Browsers block external ES-module scripts over
   `file://`. The single-file inline build is the only reason kids can double-click
   the game. Do not remove `vite-plugin-singlefile`.
3. **The scene must be scientifically honest, not just plausible.** The first
   version of the Rate Lab used `rate = min(light, CO₂, water)`. It is tidy, it
   is what a lot of textbooks imply, and it is wrong: it draws straight lines and
   hard corners where real photosynthesis gives saturating curves, and it can
   never produce a negative net rate, which makes the compensation point
   unreachable. Model the mechanism (saturating response curves, an asymmetric
   temperature optimum with an enzyme cliff, respiration subtracted, C3/C4/CAM
   pathways, VPD-driven water loss) and check the outputs against real numbers
   before wiring any UI.
4. **Never put a `scale` prop on an R3F `<mesh>` inside an animated subtree
   here.** The succulent pad silently failed to draw — mounted, `visible: true`,
   correct world position, simply never rendered — until the flattening was baked
   into the geometry instead (`geo.scale(...)`). Cost an hour. Prefer baked
   geometry or a `scale` on the wrapping `<group>`.
5. **Never `inspectAttr()` in a production build.** It injects a `code-path`
   attribute onto every JSX element; react-three-fiber forwards unknown props
   onto the three.js object and throws `R3F: Cannot set "code-path"` on update,
   dropping the whole scene into the error boundary. `vite.config.ts` now applies
   it only when `command === 'serve'`.
6. **A `<mesh>` label at an object's centre is invisible** — its own geometry
   occludes it. Offset toward the camera.
7. **No browser storage, ever.** `localStorage`/`sessionStorage` are unavailable
   in the preview sandbox. Cross-route state uses a module-level store.
8. **Sub-step particle physics on slow frames**, and drive any user-visible
   clock from wall time. Otherwise a "20 second" experiment takes ninety.
9. **Verify at the real path.** "Works at `http://localhost:3000/`" proves nothing.
   Every delivery must be screenshot-tested at `http://<host>/index.html#/<route>`.
10. **Headless SwiftShader FPS is not real FPS.** Software rendering is ~10× slower;
   judge correctness (renders? counters tick? zero console errors?), not frame rate.
11. **The platform preview can be flaky.** The single-file HTML export is the
   reliable deliverable; always produce it (see §8).

## 8. Quality gates & delivery (mandatory checklist)

Before any delivery:
- [ ] `npm run build` exits 0, `tsc` clean, eslint clean on new files
- [ ] Serve `dist/` over HTTP, headless-screenshot EVERY route at the
      `/index.html#/<route>` path; confirm non-blank render + no uncaught console
      errors (ignore dbus/GPU noise)
- [ ] Click-through pass: welcome → start → one interaction → one fact card
- [ ] Merge to `master` in the shared repo
- [ ] `build_version` (type: static, project_dir: /mnt/agents/output/app)
- [ ] **Export `dist/index.html` → `Ploobia.html`** in `/mnt/agents/output/`
      as the user-facing downloadable deliverable

## 9. Roadmap — future cabinets (pick by the kid's current school topics)

**Biology**
- Blood Voyage → give it the Rate Lab treatment: exercise raises heart rate and
  cardiac output, vessel radius drives resistance, O₂ saturation gradients, a
  clotting cascade. It is currently a ride, not a simulation.
- DNA Helix Explorer — spin, unzip, base-pair matching game, "build a codon"
- Cell Explorer — plant vs. animal cell, clickable organelles, zoom into membrane
- Human Anatomy — layer toggle skin → muscle → organs → skeleton
- Food Web / Ecosystem sim — predator-prey population waves

**Chemistry**
- Atom Builder — add protons/neutrons/electrons, build elements, isotope stability
- States of Matter — heat slider shakes particles solid→liquid→gas
- pH Lab — pour indicators, watch colors change, titration toy

**Physics**
- Solar System — orbit sandbox, gravity slingshot, scale-mode toggle
- Circuit Builder — drag batteries/wires/bulbs, watch electron flow
- Wave Machine — frequency/amplitude sliders, sound vs. light

**Earth & Space Science**
- Water Cycle — sun/heat sliders drive evaporation→clouds→rain
- Plate Tectonics — drag continents, trigger earthquakes/volcanoes
- Rock Cycle — melt/cool/erode a rock through its loop

**Math**
- Geometry Playground — morph shapes, area/volume fill with water
- Fraction Pizza / Probability Dice Lab

Each new cabinet: follow §5 recipe, §6 design, §8 gates. When in doubt, more
interaction, fewer words.

## 10. Working agreements for agents/contributors

- Small, themed commits per cabinet (`photo: …`, `dna: …`).
- Don't touch another cabinet's scene logic when adding yours; shared changes
  (menu, design tokens) are fine and expected.
- Facts are content — keep them in `lib/` data files, not buried in components,
  so a non-programmer (e.g. a parent, a teacher) can edit them.
- If the kid tester says "boring", that's a P0 bug.
