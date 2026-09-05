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
| `verify-challenge.mjs` (new) | **136/136** — determinism, room codes, the link round trip, the economy, scoring, ranking, and every brief run through the real sim to prove it is winnable, affordable, missable and not already won |
| `verify-gather.mjs` (new) | **45/45** — the opt-in stays opt-in, the round is playable with a pointer, the dials stop where the gathering ran out, a trial draws the bank down, a link carries a challenge, and the phone layout survives it |
| `verify-perf.mjs` | 17/17, 4 honest skips |

Cabinet cost at the low tier, 1280×800: **85 draw calls, 18 k triangles** —
against the old Rate Lab's 42 / 206 k. More small instanced meshes, an order of
magnitude less geometry. The perf budget was tightened to 120 calls / 120 k
triangles so a regression fails loudly.

`verify-sugar-model.mjs` is the one to copy into future cabinets: it bundles
the pure model with esbuild and asserts against it in Node, which is the only
way to check that the carbon balances or that a full sink pushes back — neither
is observable through the HUD.

## The challenge layer (`lib/challenge.ts`, `lib/sugarchallenge.ts`)

Opt-in. The cabinet opens exactly as it did; a chip beside the clock says
**Challenge**, and a learner who never presses it never meets a timer, a budget
or a score. That is the whole architectural constraint, and it is why the run
lives in `hooks/use-sugar-challenge.ts` rather than in the page: the lab never
asks whether a challenge is on, the page asks and passes ceilings down.

### The shape

```
gather  →  a short round: sweep a collector through the light, the carbon
           and the water rising off the soil, and bank what you intercept
spend   →  the dials now stop where your gathering ran out, and each trial
           draws the bank down
hit     →  scored on reaching a target, in few trials, cheaply
```

The arcade round deliberately **does not touch the trial**. A game that let you
spray light at a plant under time pressure would teach the exact habit this
cabinet exists to break. Instead the game sits in front of the loop and makes
the inputs *scarce*, so a limiting factor stops being a sentence and becomes
the reason the dial will not go any further.

### Three rules in the spine

1. **A room is many people on one seed.** Two friends comparing a link and a
   class of thirty on one code are the same data structure — one `Challenge`,
   many `ChallengeAttempt`s, ranked by the same pure `rank()`. There is no
   separate multiplayer model to build later.
2. **The world comes from a seed, not a server.** Everything that varies
   derives from one integer, so a challenge fits in a URL fragment: no backend,
   no accounts, no data stored about a child, and it works on a bad connection
   or none.
3. **Score is not XP.** `lib/events.ts` guarantees nothing is earned for clicks
   *by construction*, and a fast reflex is a click. A challenge awards a score;
   XP still comes only from recorded evidence, which a challenge happens to
   produce because hitting a target requires running real trials. Nothing in
   the scoring rewards speed, and the score card says so out loud.

Scoring is accuracy (up to 600) + economy, meaning few trials (250) + thrift,
meaning unspent budget (150). A miss still scores, because "way out" is framed
everywhere else here as the useful kind of wrong.

### Traps this layer hit — do not relearn

- **`.` is not escaped by `encodeURIComponent`.** The link encoder joined on
  it, so a tolerance of `0.5` split into two fields and every value after it
  was read out of the wrong slot. Joined on `,` — which *is* escaped as `%2C`,
  so the split can never be ambiguous.
- **Float equality fails a learner who lands exactly on the line.** `12.3 - 12`
  is `0.30000000000000027`, so a target of 12 ± 0.3 rejected 12.3. `meetsGoal`
  carries an epsilon; being failed by the last bit of a double is indefensible.
- **`L` reads as `1` when a code is said aloud.** Removed from the room-code
  alphabet along with the vowels.
- **The budget was doing two jobs and doing both badly.** `capsFor` reads it as
  *how bright you may go*, `trialCost` as *how much you may burn* — so with a
  trial priced at the raw dial value, gathering enough light to reach the
  ceiling bought exactly one trial at that ceiling, and the second reading of a
  two-reading comparison was unaffordable by construction. `TRIAL_SHARE = 1/3`
  separates them: how bright is what you caught, how many times is what is
  left. The ceiling is computed from the **grant**, never the running balance,
  for the same reason.
- **The CO₂ cost was on a different scale from the CO₂ dial.** `sim.co2` is
  normalised against `CO2_MAX_PPM`; the first cost function normalised against
  the ambient-to-max span, so the cap sat at a number the learner was not
  looking at.
- **A cold `solveSugarLine` cannot tell light from darkness.** Export rate is
  driven by the leaf's sugar pool, and a freshly created specimen carries a
  full one — so the first winnability check read the same 10.6 mg h⁻¹ at zero
  light as at full sun, and cheerfully blessed briefs that were unreachable
  while passing briefs that were already won before the learner touched
  anything. The check now drives the **real sim** forward four plant hours per
  grid point. It immediately found that `fast-line` was asking for a
  translocation speed its own budget could not reach, and that `thin-air` and
  `drought` were met by doing nothing.
- **`stepSim` returns early until `sim.started`.** Correct behaviour, and it
  silently made every reading in that check the cold one anyway.
- **A frame is a snapshot, and a finger is a sweep.** Testing interception only
  against where the pointer *is* means a fast drag tunnels straight through
  everything it crosses. On a phone at thirty frames a second that is most of a
  sweep, and the round feels broken in a way the player can neither see nor
  correct. The test is point-to-**segment**, against the path swept since the
  last frame.
- **A mutable `useMemo`.** The catchables were one array holding both the
  seeded plan and the per-frame motion, and the frame loop wrote to it. Split
  into an immutable plan and a `useRef` of motion — a memo is a value React may
  hand back to anyone.
- **A control test that cannot fail.** The first ceiling check poked an
  `input[type=range]` that does not exist (the dial is a Radix slider), changed
  nothing, and passed — because zero is under every ceiling. It now clicks the
  real track and asserts the dial both *stops at* and *reaches* the ceiling.
- **Wall-clock budgets lie under SwiftShader.** A single `mouse.move` can take
  most of a second, so twelve seconds of "playing" was nineteen pointer
  positions and the mechanic looked dead. The suite counts **moves, not
  seconds**.

## Sugar Line VI — the way in (2026-09-05)

Selorm, looking at the live build: *"How does the observer get in the game?
What prompts them? How do they see what is being measured? This should be done
seamlessly without having to look around to navigate."* He was right, and the
diagnosis was three gaps, not one:

1. **Nothing invited them in.** The welcome card had two doors and the game was
   a chip beside the clock that nothing pointed at. The coach chip — the one
   voice a learner is trained to look for — was switched *off* for the whole
   challenge (`!inChallenge`).
2. **The round started cold and ended cold.** The clock was already running when
   the sky appeared; when it hit zero the lab opened with the dials capped and
   no explanation, the only connecting sentence folded inside a collapsed strip.
3. **The target and the reading were in different places.** The target sat in
   a bottom strip; the number being measured sat in the instrument plate behind
   the Data tab on a phone. A learner was told to hit a number they could not
   see.

Storyboarded first ("Sugar Line Way In", seven phone frames), his three calls
taken — *Play first*; *gate lightly*; *Explorer skips the brief* — then built.

### The front door

`Welcome.tsx` has three doors in this order: **Play — catch light, then run the
line** (pulsing, the only invite on the card), **Explore the lab on your own**
(the free lab, byte-for-byte what *Start the line* was; still `aria-label
"Start"`, so every existing suite walks in the old way), **Watch it first**.

`handlePlay` in the page: an Explorer goes straight into the countdown on the
band's own level (`levelForBand` → `playChallengeFor`); a Scientist or Analyst
gets the brief, because the tolerance, the room code and the choice of
challenge live there and choosing is part of the work at those ages. The
Challenge chip stays for anyone already in the free lab, and pulses (`atlas-aim`)
after the first reading until a challenge has been opened once; the coach
offers it in words at the same moment.

### The brief, reordered

Opens on **one** challenge with the target as the headline in the learner's
units — *Find the ceiling. Land sugar leaving the leaf at 12 mg h⁻¹, give or
take 0.4.* — one green button, and the list and the room code folded behind
*Other challenges ▸* / *Join a room code ▸*. The eyebrow names the campaign
position: *Stage 1 · The Factory · Level 2*.

### The round, narrated (`use-sugar-challenge.ts`, `GatherHud`)

```
off → brief → ready → gather → handover → lab → scored
```

- **`ready`** — a three-second beat with the collector already live, a "3 /
  Drag the ring through the light" card, and Ploob naming the three things
  falling and where. The clock starts at zero **or on the first catch**. Two
  traps in that sentence:
  - **A catch made by a still finger is not a gesture.** The collector sits
    wherever the pointer was when the round opened — the middle of the
    screen, where the plant is, where things fall — so the first "catch"
    happened to a learner who had not touched anything and ended the beat
    before they read it. `GatherRound` now arms interception only once the
    pointer has moved (> 0.02 NDC) since the round began.
  - **Count the beat on the wall clock, not in ticks.** Under SwiftShader the
    100 ms timer callbacks are starved by the frames between them; a beat
    counted in ticks ran six seconds where three were promised. Real
    low-end tablets have the same shape of problem.
- **`gather`** — as before, plus a coach line at the bottom that reads the jars
  and names a *place*: the emptiest jar → "Water rises off the soil, low down —
  sweep near the ground." Under five seconds: "Last few — grab water." The
  geography is the biology's (light down the sun lanes, carbon across the
  canopy, water up from the soil), so the hint is never a lie about where
  things are.
- **`handover`** — the card the first build skipped: the three jars as caught,
  *Now use it. Get sugar leaving the leaf to 10 mg h⁻¹ or better.*, and the
  three moves. `enterLab()` is the only way out, and it is where the lab clock
  starts.
- **`lab`** — the coach stays on and follows the run, not the missions:
  *Set the dials, then press Run measurement* → then `ceilingWhy`, one sentence
  naming which dials are at the ceiling ("that is what you caught") and which
  still have room. The same sentence is on the result card, so the two cannot
  disagree.

### The target gauge (`TargetGauge`, replacing `ChallengeBar`)

Pinned to the top of the screen for the whole lab phase — **in the stage tabs'
strip**, a deliberate trade, because the target and the reading must never be
behind a tab and the round is played on the whole-plant stage anyway. One bar:
the target line with the "or better" zone shaded (a tolerance band for a `near`
goal), the last reading as a ring, the best as a tick, the miss drawn as a
dashed length, the gap as a chip in the learner's words ("2.2 short", "on the
mark"). On a phone the jars and the hand-in fold behind a tap and unfold on a
hit; on desktop they are always open. Hand-in also lives on every result card,
so nobody has to find it. Not a scoreboard: the score is still computed once,
at hand-in.

`Reveal.tsx` takes an optional `challenge` block: reading against target,
"7.8 → 11.2", the gap chip, `ceilingWhy`, and **Hand it in / Run again** in
place of Keep going / See the data. The prediction half of the card is
unchanged and still shows when there is one.

### Ceilings drawn on the dials (`Dial`, `ConditionsPlate`)

`Dial` takes a `ceiling`; beyond it the track is a hatched dead zone with a hard
stop, the value reads "190 µmol · CEILING" at the stop, and the plate says in
one line what the hatched ends are. `data-ceiling` on the wrapper is the
handle the suite asserts on. A capped slider now reads as *caused*, not broken.

### Ploob 2.0 (`components/brand/Ploob2.tsx`)

The film's Ploob, flat: amber, the curled tip, brows, the small smile. He is the
face of the coach chip, the gather coach and the countdown. The in-scene mesh is
still the old `ploob.glb` until a proper turnaround exists — rear and profile
renders first, or the image-to-3D geometry is only true near the front.

### Stage 1, three levels (`sugarchallenge.ts`)

Presets carry `stage` and `level`; a band's level is `levelForBand`. **Level 1
First light** (Explorer, ≥ 10 mg h⁻¹) · **Level 2 Find the ceiling** (Scientist,
land 12.0 ± 0.4 — the old *Land it exactly*, re-briefed around the light curve)
· **Level 3 Balance the books** (Analyst, new: land net carbon gain within 0.5
of 12 mg h⁻¹ on the bean; respiration doubles per 10 °C, so the books only
balance in the plant's favour where production outruns the burn). Picked by
sweeping the real sim: gain runs −9.7 (30 °C, dark) to 15.3 on the budget, idle
reads −6.8, so it is winnable, missable and not already won — `verify-challenge`
now says so, 145/145. `metricPhrase()` gives every metric one name in the
learner's words — *sugar leaving the leaf*, *sap speed*, *net carbon gain* —
used in the brief, the gauge, the handover and the coach.

### Suites

`verify-gather.mjs` **79/79** (was 50): the front door (Play leads, Explorer →
`ready` with no brief, Scientist → brief on level 2, a still finger does not
start the clock), the beat, the handover, the gauge on screen and on top and
above 300 px and under 230 px tall, the coach still talking inside the
challenge, the ceiling drawn on the light dial and named at the stop, the
result card answering against the target with the gap in words and the hand-in
on it. `verify-challenge` 145/145. `verify-sugar-model` 69/69.

**Two rings, two meanings — do not cross them.** The amber `atlas-aim` ring
belongs to the active mission step and `verify-sugar` asserts there is exactly
one of them on screen; the Challenge chip's invitation is the green
`atlas-invite` pulse. Putting `atlas-aim` on the chip failed three mission
checks on otherwise correct code.

**Suite trap:** a button whose `aria-label` *contains* another control's label
— "Join a room code" beside an input labelled "Room code" — makes
`getByLabel('Room code')` count two. Name the button *Join a room*.

## Sugar Line VII — the Hatches (2026-09-05)

Stage 2 of the campaign, the first *Keep it alive* round, storyboarded first
("Hatches Storyboard", seven frames) and built to Selorm's three calls: the
day pauses only for an Explorer holding the thumb; a slider, with the pore
mirroring it; *The hatches* is a fourth stage tab always in the row, and the
day only runs inside a challenge.

### The correction that shaped it

He wrote "how the stoma will let in light… open the hatches and let more light
in". Stomata do not let in light. Light goes through the leaf's clear top skin
whether they are open or shut; what the hatches control is **carbon dioxide in
and water vapour out**. That trade is the better game, and the stage is built
so the misconception cannot form: Ploob's opener says it, the tip card says it,
the sun-glow behind the skin brightens with the light and is drawn *not* as a
function of the pore, and `verify-hatches-model` asserts `par` is identical
open or shut.

### The model (`ratelab.ts`, `hatches.ts`)

- `LabEnv.hatch` — the learner's ceiling, 0–1. `poreOpening = min(ceiling,
  gates.plant)`: the plant's own reflexes (turgor, dry air, CAM) close the
  hatch further; nothing opens it past them. **A ceiling, not a hand on the
  door.** `stomatalGates()` is exported so the HUD can draw where the plant is
  holding ("your slider says 80, the leaf is holding at 45").
- **Cᵢ/Cₐ = 0.15 + 0.6·pore.** The old `0.45 + 0.55·conductance` let a shut
  leaf keep nearly half its carbon, so closing the hatches was almost free —
  a trade with a free side is not a trade. Real Cᵢ/Cₐ sits near 0.7 open and
  falls toward the compensation point shut. The existing 69 model checks and
  145 challenge checks still pass on the new curve.
- **The turgor gate is `smoothstep(0.1, 0.45)`**, was (0.18, 0.6). The old
  edges closed so early and so smoothly that a leaf in a dry wind settled at
  half-open and half-firm and never actually wilted whatever the learner did
  — a plant that could not be got wrong. Real closure is partial and late.
- **CAM opens at night**: `cam = night ? 0.85 : 0.12`; `LabEnv.night` is new
  and `simEnv` passes it.
- **Water is millilitres for the day.** `transpirationMlPerHour(g, VPD, A)` =
  E = gₛ·VPD/P with gₛ at 0.5 mol m⁻² s⁻¹ fully open — the upper middle of
  the 300–700 mmol range reported for irrigated crop trials (Reynolds et al.,
  CIMMYT *Physiological Breeding II*, ch. 2). A whole-crop figure, not a bean
  one; that is the honest precision. A bean leaf (0.028 m²) wide open in
  1.5 kPa air loses about 10 mL h⁻¹.
- During a day run the plain lab's turgor nudge is switched off and
  `stepDay` owns the water: a pot in mL (sized to leaf area and root reach),
  a leaf store in mL, uptake root-limited and falling as the pot dries
  (∝ soil^1.5), turgor = 1 − deficit / (store × 0.2). Conservation is
  asserted: pot used + leaf deficit = water lost, to 1.5 mL over a day.
- **`WATER_TUNE` was searched, not reasoned.** The brief was two sentences —
  *a bean in a temperate day with a dry afternoon wind goes limp if left wide
  open and stays firm at about half; maize in the Harmattan goes limp at
  anything above a third* — and a grid search over pot size, uptake, wilt
  fraction, root reach and drying power found the one corner that satisfied
  both across seeds. The suite holds the tuning there.
- The day: `buildDay(seed, habitat, hours)` — the habitat's own light, heat and
  humidity (from `BIOMES`), a dry wind from the seed (start 10:30–13:00, 2.5–4 h,
  drier in drier habitats), sometimes a cloud. The savanna's wind is named
  **the Harmattan**, because that is the dry wind a learner in Accra has felt.
  Dawn 06:00, dusk 18:00, a day in 90 s; a day-and-night at the same pace.

### The spine (`challenge.ts`)

`loop: 'keep'`, `condition`, `world` on a `Challenge` — all optional, all in
the link (fields 13–15), all absent on every link written before, which still
decode. `scoreAttempt`: a condition is a **gate on the hit**, not a term; in a
keep round the economy term is the condition (the plant standing) because the
span is the one trial. Thrift is against `budget.water`, the water a wide-open
leaf loses on that day (asserted within 15 %).

### The three levels (`sugarchallenge.ts`), every number from a sweep

| Level | Plant · day | Target | What decides it |
|---|---|---|---|
| L1 Open the hatches (Explorer) | bean · temperate · 12 h | 100 mg, leaf firm | wide open 138 mg but limp; ~0.5 → 116 mg firm; 0.3 → 96 |
| L2 The Harmattan (Scientist) | maize · savanna · 12 h | 730 mg, leaf firm | anything above ~0.3 wilts in the Harmattan; 0.3 → 740–759; 0.2 → 702–720 |
| L3 Night shift, cactus rules (Analyst) | bean · desert · 24 h | 30 mg, leaf firm | only near-shut keeps a bean standing; the card shows the cactus's same day (≈65 mg on 45 mL, firm) |

`safestCeiling()` in `hatchesReplay.ts` replays the day at a ladder of constant
ceilings at hand-in so the advice names a number the model stands behind, and
`cactusDay()` runs the prickly pear on the same seed for the level-3 card. The
card says out loud that the cactus's night bank is assumed full — the model
does not yet drain it.

### The stage (`HatchStage.tsx`)

Two capsules, one plane, two instanced sheets, two label sheets. The gap
between the guard cells *is* `pore`; the CO₂ labels drift to the pore and go
through only when it is open (a mote that finds it shut hovers at the door and
goes back for another try); the water droplets stream out at the model's
transpiration and stop when it shuts; the guard cells slacken and the field
yellows with turgor. `window.__hatch` reports pore / plant / ceiling / turgor
for the suite. Viewpoints `pore` and `skin`. Four tabs on a phone: the tab
eyebrow is dropped on compact.

### The HUD (`hud/Hatches.tsx`)

`DayHud` takes the top strip (the day arc with the wind as a band and the hour
on the sun; two meters with their lines — the target, the wilt point — and the
live mg h⁻¹ / mL h⁻¹ and the air, with VPD in kPa for Scientist and Analyst),
a card when the wind, the wilt or the night arrives, and Ploob reading the
meters. `HatchPlate` at the bottom: the one slider, the plant's hold as a hard
mark on the track when it is closing further than the slider allows, the whole
track hatched when the leaf is limp. `DayTallyBlock` on the score card: the
same gauge as stage 1, the leaf's state, the water, the advice from the log,
the safest ceiling from the replay, the cactus for level 3. The score card's
parts read *Accuracy · Standing · Water* in a keep round.

### Traps

- **A window listener registered once must read its handler through a ref.**
  The hatch plate mounts during the countdown; its `pointerup` listener
  captured a handler that still believed the day had not started, so an
  Explorer's first touch paused the day for good. `onHoldRef` fixes it, and
  letting go now always resumes regardless of phase.
- **The ready beat's tick cannot see state**: `keepRef` tells it whether zero
  means `gather` or `day`.
- **The day cannot be tick-counted** for the same reason as the beat; it is
  advanced by `stepDt`, so a slow renderer plays it slower but never wrong.
- **Circular import**: `sugarsim` steps the day and `hatches` reads the sim,
  so the replay (which drives the sim) lives in its own module.

### Suites

`verify-hatches-model.mjs` **113/113** — the weather, the ceiling, light out
of the trade, water calibration and conservation, the two tuning sentences
across five seeds, every level winnable / missable / not-already-won across
three seeds, the replay, the cactus, the scoring. `verify-hatches.mjs` (browser)
the stage and its names, the pore following turgor, a day played with one
slider on a phone, the ceiling obeyed and never past the plant, the Explorer
hold and the Analyst no-hold, the wind announced and named, the tally with
the leaf's state and the water in mL, the cactus card. `verify-challenge`
160/160 (keep rounds are well-formed on their own terms and their fields
survive a link).

## Sugar Line VIII — the map and the gate (2026-09-05)

Two stages is a journey only if the learner can see it. `lib/campaign.ts` is
the map — five doors in the order the sugar takes, every one named on the
welcome card from the first visit — and the one rule that walks a learner
along it: **one hand-in at any level of a stage opens the next.** Not
"finish every level" (a Scientist who wants the stem must not grind the leaf's
Explorer levels first) and not "all open" (the roots make no sense to someone
who has never seen what the sugar is for).

- **Door states:** `done` (ticked), `open` (the green invite pulse), `shut`
  (a lock; tapping it says *Hand in any level of stage 1 to open The
  Hatches*), `undiscovered` (dashed, dim, no lock; tapping it says *Nobody has
  discovered what is behind it yet*). Never "coming soon" — the suite greps
  for it.
- **Play follows the map.** The welcome card's Play opens `nextDoor()`: the
  first open, un-handed-in stage. Once stage 1 is handed in the button reads
  *Play — stage 2, The Hatches*. Tapping a door plays that stage's level for
  the band (Explorer straight to the countdown; older bands to the brief,
  which now opens on that stage's level via `run.open(rival, stage)`).
- **The brief's list** groups by stage and disables the levels of a shut
  stage with the lock in the chip.
- **The score card** announces a door the hand-in opened, with *Go through*
  — Explorer goes straight into the next stage's level; Scientist/Analyst get
  its brief.
- **Progress** is `ploobia.campaign.photosynthesis.v1` in local storage —
  best score by preset id, and nothing else. It is not XP:
  `challenge.handedIn` is a new learning event for the journal, and
  `progression.ts` awards it nothing by construction.
- **A link still walks the door.** A challenge does not carry its preset id,
  so `presetIdFor()` matches on what a preset fixes: plant, goal, loop,
  world, gather seconds *and budget* — First light and The dry week share a
  target and differ only in what they offer. Key order is not part of a
  budget (a link writes them sorted), which the first version forgot.

**Suites:** `verify-challenge` **182/182** (the map's rules and every preset
recognised from its own link); `verify-gather` **88/88** (five doors on the
card, the shut door's note, the hand-in opening the next door on the score
card and being remembered); `verify-hatches` 48/48 with a stage-1 hand-in
seeded, since that suite is about the stage and not the door.

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

- **The gather round wants a real device.** `WORTH` (what one catch banks) and
  `CATCH_RADIUS` were set by reasoning, not by playing: the harness runs at a
  frame or two a second under SwiftShader and cannot tell a generous mechanic
  from a stingy one. Everything downstream of the bank is checked, and the
  score card names a thin gather as the reason for a miss, but the feel of the
  round is the one thing on this feature that has not been measured.
- **The other cabinets.** `lib/challenge.ts` knows nothing about plants — the
  budget is a `Record<string, number>` on purpose, so the Motion Yard can bank
  launches and the Atom Foundry protons. What each cabinet has to supply is its
  own `capsFor`/`trialCost` pair and a set of goals stated in metrics its
  instruments already display.
- **Rooms as a screen.** `rank()` already takes many attempts at one challenge
  and orders them; nothing yet collects a class's attempts into one view.
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
