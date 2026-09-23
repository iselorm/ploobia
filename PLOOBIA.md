# PLOOBIA — Project Instructions

> **Name (decided 2026-08-18):** the product and world is **Ploobia** (ploobia.com). Learners *enter* Ploobia; "the school arcade" is the descriptor for adults. Use "Ploobia" in all user-facing copy, titles and metadata; regions and cabinets inside it carry their own serious names. **Ploob** (2.0, the amber figure) is the only companion — no other mascot, no folklore framing.

> This file is the single source of truth for how the app is built, extended and delivered. Drop it in the repo root as `CLAUDE.md` / `AGENTS.md` or your agent's equivalent. Strategy and decisions live in the Obsidian vault (`Roadmap/*.md`, hub `School Arcade Roadmap.md`, append to `Decision Log.md`); this file is the code-facing distillation. **Rewritten 2026-09-06** for two decisions: every cabinet is a game on one grammar, and everything is landscape.

## 1. Vision

**Ploobia** is an interactive 3D learning platform for ages **10–18** (lower secondary through 6th form), IGCSE- and A Level-compatible and mapped to Ghana's NaCCA curriculum, built from Ghana for learners in price-sensitive markets. The principle:

> Don't teach the world as a textbook. Let the learner manipulate the world and discover why it works.

Each subject area is an **arcade cabinet**: a full-screen, playful, scientifically honest simulation that opens in a browser — no installs, no accounts to start, no lecture first. Since 2026-09-06 every cabinet is also a **game** (§5) whose front door is *Play*, with the free lab one tap away.

Live: **`https://ploobia.pages.dev/`** — `/` the site, `/app/` the arcade, `/app/#/<route>` a cabinet. Repo `github.com/iselorm/ploobia` (private); Selorm's clone is `C:\Users\iselo\ploobia_online`; every push to `main` deploys.

Current cabinets (`app/src/lib/cabinets.ts` is the registry — add a card there for every new one):

| Route | Cabinet | Subject | State |
|---|---|---|---|
| `#/` | The hall — machines, band select, attract mode | — | live |
| `#/home` | Family home — parent-first profiles, support card | — | live |
| `#/photosynthesis` | **The Sugar Line** — whole-plant source → phloem → sink; Münch pressure flow; five specimens in their habitats; the five-stage campaign (Factory · Hatches · Line · Roots · Stand) | Biology | live; campaign rounds A–B + map built, C next |
| `#/atoms` | **The Foundry** (Atom Foundry) — crucibles feed a Bohr atom; the table assembles itself on a dark wall; real isotope stability and ionisation energies. *Cabinet Spec — The Foundry Game* is its next form | Chemistry | live; game round A next after the Sugar Line |
| `#/rivers` | **The Long River** — a simulated meander planform (seed 8081), Manning + Hjulström, 13 checkpoints each with a live proof | Geography | live |
| `#/physics` | **First Physics** — one growing room of one-idea episodes A1–A7, the Equation Card, the shelf | Physics | live |
| `#/motion` | **Motion Yard** — hidden; reached through First Physics' shelf door; launchers, Physics Vision | Physics | live, hidden |
| `#/blood` | **Blood Voyage** — the double circulation as a ride, the demand dial, the Delivery Lab | Biology | live |

The Photosynthesis Rate Lab and the Membrane Lab were **replaced** by The Sugar Line at the same route. `lib/membrane.ts` and `lib/ratelab.ts` stay on disk (the Sugar Line still uses `solveLeaf`); the membrane bench is the seed of a future Cell Transport cabinet.

## 2. Audience, tone, science

- **Age 10–18**, served by the three-band system (§2b), never by separate builds.
- **Range extended to 6th form on 2026-09-11** (Selorm): lower secondary through A Level, mapped to Cambridge (Lower Secondary → IGCSE → A Level) *and* Ghana NaCCA (B7–B9 → SHS 1–3). The Analyst band is the A Level home; depth still ramps by caps, never by separate builds. The reading layer (the Library / Enhanced Textbook — narrated, term-tappable chapters with each cabinet's doors as the workshop) and the mathematics cabinet (The Numberworks) are specified in the Ploobia vault: `Roadmap/The Library.md`, `Roadmap/Enhanced Textbook.md`, `Roadmap/StoryComet Reference.md`.
- **Science must be correct.** Every stated number is real and sourced in code. Model the mechanism (saturating curves, an enzyme cliff, respiration subtracted, conservation that closes) — never `min(a, b, c)` or a lookup that happens to draw the right picture. Where the model has a boundary, say so on screen ("not in the model's table"), never fudge.
- **Vocabulary is a feature**: the real term first ("limiting factor", "translocation"), then the explanation in kid language.
- **Every concept gets an interaction.** If a learner cannot change something and watch the world react, it is not done.
- **Never ask before orienting** (Selorm, 2026-08-29): before any prediction, the scene introduces the object, what the number or arrow means, and why the setup is the way it is. A prediction without context is a coin toss.
- **The hook is a guess, never a caption**: open with a number to commit to, then the answer.
- **Ghana-familiar**: the salt in your jollof, the Harmattan, a pot's aluminium — never willows and maple leaves.
- If the kid tester says **"boring"**, that is a P0 bug.

## 2b. Learning bands (platform-wide)

`lib/bands.ts` holds one of `explorer` (10–12, *what happens if I…?*), `scientist` (13–15, *why did that happen?*) or `analyst` (16–18, *can I model, explain and defend it?*). Chosen in the hall and on each welcome card, switchable from the `BandSwitch` chip. Cabinets **never branch on the band id**: they read `BAND_CAPS[band]` capability flags (vocabulary, which controls exist, prediction required, instrument noise, repeats, data table, conclusion builder, export, trial length, gather round). Adding a band-aware feature means adding a flag.

**The band changes academic depth, never visual quality.** A ten-year-old and a seventeen-year-old see the same world; difficulty rises through vocabulary, controls, mathematics, data, missions, evidence and assessment.

## 2c. The measurement loop (every science cabinet)

A sandbox is delightful at ten and boring at sixteen; measurement is what holds the older learner.

1. **One independent variable**, the others shown as controlled.
2. **A prediction committed on a dial at every band** (Explorer's Higher / Same / Lower buttons *set the dial*; the plate says "not set" until something is committed).
3. **A timed trial** against a visible instrument.
4. **Record → table → live graph**, and the result comes to the learner the instant the trial ends (the Reveal card: what you said, what happened, the miss drawn on the axis, closer than last time or not).
5. **Missions are jobs with ordered steps** that name the single next control (`MissionStep.target`, the amber aim ring); they complete on recorded evidence, never on a slider position.
6. **Write it up** as claim / evidence / reasoning / limitations (sentence tiles on touch).

Rules learned the hard way: snapshot every control at trial start and **discard a trial whose conditions change mid-run**; a trial that was not performed is not recorded; the controlled variable is enforced, not explained. Trial and physics timing run on a loosely clamped `dt` (≤ 0.25 s); idle animation on a tight one (≤ 0.05 s); every user-visible clock on wall time. If a simulation speeds time up, **both multipliers are always on screen**.

## 2d. Labels, arrows, sound

- **Nothing in a 3D scene is labelled with an `<Html>` overlay.** Labels are geometry (`Glyphs.tsx` — one canvas texture, one `InstancedMesh`), depth-tested, offset along the view ray so the object's own front face does not hide them, and applied to a **subset** (the leading five molecules of a stream, not eighteen). The dot carries the colour; the label carries the name, in dark ink on a cream halo.
- **An unlabelled arrow is a puzzle.** Every arrow carries its own name or is pinned to something that does.
- **Nothing audible or colour-only is load-bearing.** Audio is synthesised WebAudio (`lib/audio.ts`), zero download weight, started only from a user gesture, mute persisted.

## 2e. Camera rules

- **Never lerp the camera toward a fixed viewpoint every frame.** Scripted movement runs for a short window after an explicit request; otherwise OrbitControls owns the camera. Wait for `useThree(s => s.controls)` before marking the rig mounted.
- Free zoom and full 360° orbit always. Scene objects never fight the thing being studied (the table wall retracts; the ground goes to glass when the camera drops below it).
- **A door is a viewpoint** (§5): one composed shot per campaign door, off-centre, with the wall / habitat / table as a hint behind the subject.
- **Measure the subject before framing it.** Name each stage's root group `subject`; shift the projection with `camera.setViewOffset` by the headroom found from its `Box3`, never by a fraction of the viewport.
- Orbit and zoom from touch and pads feed OrbitControls through `registerCamera()` — queue deltas, apply once per frame.

## 2f. Visual language

Gen Alpha judge a learning tool against games, so *tidy and deliberate* beats *lots happening*. Warm, bright, a place: gradient sky dome with fog matched to the horizon, contact shadows, clean light sources, slow motes. **Sunlight is orderly** — more light adds *lanes*, never turbulence. **A place matters** (grass, sky, weather are part of the appeal) and it must not look like a copy of the reference (no subject on a plinth in an empty field; Ploob stands in the crop). Dark reads unfriendly — the one dark thing in a room is the thing that pops (the wall). Ceilings on dials are drawn as hard stops with a hatched dead zone, labelled "ceiling". Details: vault `Visual Style.md`, `Rendering Craft.md`.

## 3. Tech stack (pinned)

- Node ≥ 20 · Vite 7 · React 19 + TypeScript · Tailwind 3.4 · shadcn/ui · three + @react-three/fiber + drei
- **HashRouter** — mandatory (§7.1). **vite-plugin-singlefile** — mandatory; the arcade is ONE self-contained `dist/index.html`. `base: './'`.
- Zustand-free: module-level stores (`lib/bands.ts`, `lib/input.ts`, the mutable-sim pattern). No physics engine, no post-processing chain (§7.14).
- Playwright suites in `app/verify-*.mjs`; pure-model suites via esbuild + Node.
- Hosting: Cloudflare **Pages** (not Workers — the feedback endpoint is a Pages Function), `wrangler.jsonc` in the repo, build command carries the `VITE_*` switches. See `DEPLOY.md`.

## 4. Architecture

```
app/src/
  pages/<Cabinet>.tsx           one per route; composition and the beat machine only
  components/<cabinet>/         R3F scene, one concern per file
  components/<cabinet>/hud/     DOM overlay for that cabinet
  components/hud/               shared HUD (BandSwitch, EquationCard, WelcomeOverlay, PilotReport…)
  components/game/              the game kit (§5) — Welcome, CampaignMap, TargetGauge, Dial, Reveal, Handover, ScoreCard, JournalCard, ShareSheet
  lib/<cabinet>.ts              the pure model — no React, no three; one solve drives visuals AND instruments
  lib/campaign.ts               doors, gates, progress (generic over cabinet id)
  lib/challenge.ts              seed + setup + goal + budget in a URL fragment; rank(); challengeLink()
  lib/events.ts  progression.ts the learning-event log (the contract) and what is derived from it
  lib/input.ts  quality.ts  perf.ts   input model, quality tiers, perf probe
  hooks/use-layout.ts           desktop | tablet | phone (+ portrait flag) — §6
```

Rules:

- **Scene vs HUD separation**; they talk through the mutable sim / small stores, never by reaching into each other. An interactive HUD island **owns its own `pointer-events-auto`**.
- **One solve.** The pure model in `lib/<cabinet>.ts` drives the picture and the instruments so they cannot disagree; conservation laws close and are asserted in a Node suite.
- **Instancing for crowds**; no per-frame allocations; pooled particles guard their indices (`if (!entry) { p.alive = false; continue }`).
- **Quality tiers** (`lib/quality.ts`) chosen at boot, downgrade only, `?q=low|medium|high` to pin; `<PerfProbe>` in every Canvas is load-bearing (it resets frame sampling per cabinet).
- **Perf budget per cabinet at the low tier**, asserted by `verify-perf`: draw calls and triangles transfer to real hardware, frame rate under SwiftShader does not.
- **No browser storage for anything that matters**; the event log (`ploobia.events.v1`) and campaign progress are the exceptions, adapter-backed, memory fallback. Never store derived values.
- WebGL failure degrades to a themed card via `SceneErrorBoundary`; the **boot guard** explains a failure to mount.
- Content (facts, episodes, levels, missions) is **data in `lib/`**, editable by a non-programmer.

## 5. The Game Grammar (every cabinet)

**Decided 2026-09-06: every cabinet becomes a game, all on one grammar** — the one The Sugar Line's way-in found (5 Sep) and *Cabinet Spec — The Foundry Game* wrote out (6 Sep). It sits on top of the measurement loop; the game is the front door, the lab is one tap away and untouched. Vault note: `Game Grammar.md`.

**Order of work:** finish The Sugar Line (rounds C–E) → The Foundry (A–E) → The Long River → First Physics → Motion Yard → Blood Voyage. Each cabinet gets its landscape viewpoint pass (§6) in the same round.

1. **Front door — Play first.** Welcome card: **Play — "<the open door's level, ≤ 7 words>"** (from `nextDoor()`) · **Explore on your own** · **Watch it first**. The campaign map above the tiles. A game reachable only through a chip does not exist for the learner.
2. **Doors.** A cabinet is a campaign of ~five doors; a door is a **place in the room the camera moves to**. Three levels per door found by sweep (Explorer can hit it / needs the rule / needs the number) via caps, not builds. **One hand-in at any level opens the next door.** Locked doors visible and named; unbuilt doors dashed — *"nobody has discovered what is behind it yet"*, **never "coming soon"** (suites grep for it). Progress in `lib/campaign.ts`, key `ploobia.campaign.<cabinet>.v1`; it is not XP.
3. **The round**: `off → mission → predict → ready → gather → (count) → lab → close → explain → scored`. The brief opens on a **number the learner TYPES** (never four options); **nobody skips the number, at any depth** — Explorer skips the *reading*, never the *prediction* (Numberworks review 1, 11 Sep: the recording opened on falling tomatoes and the maths had gone missing). Ploob repeats the number back whatever it is; the world checks it. A day/trial ends on a **reconstruction card** (the sum that was said, the sum the world made) before any score, then **one why-question** whose distractors the world disproves — the choice is the fourth line of the stamp. A 3-second **beat** with Ploob's ghost gesture. **Gather** is Explorer's arcade minute (catches count only after the pointer moved; the clock is a catch, not a countdown); Scientist may skip it, Analyst receives the inventory. A **handover** card says what was caught and what to do now. The **lab** is the real cabinet with ceilings drawn on the dials. **Scored** = hand in → journal card → a door opens. **The road not taken is replayed, not described** (Numberworks A.3, review 2): where the learner made a choice the world can re-run — a price, a branch at four o'clock — the round commits the explanation FIRST, then replays the same crowd with the other choice, with the chrome hidden and the split result over the alley. Nothing from a replay is recorded as a day. **Three whys, one a day, never numbered on screen** (*What happened today?* · *Something strange happened…* · *Three market days later…*), and **"which was best" is never asked without "best for what"** — one lens, one computed winner, ties named.
4. **Something talks to them in every phase.** The coach chip carries Ploob and is never suppressed in a game. Ploob points at what changed, offers one comparison, says "let's test it", never praises a click, celebrates a *formed thing*. Hint button after repeated failures; no automatic speech; narration derived from the model, off until switched on.
5. **One pinned gauge**: target, last reading, best, shortfall — never behind a tab. One name for the measured quantity everywhere. Every Run answers on the gauge via the Reveal card. **The HUD has three levels while the world moves** (Numberworks A.2): level 1 = the gauge as two or three translucent plates + the one control, always; level 2 = Ploob, when he has something to say; level 3 = Days / Our Space / history behind an edge tab. No column touches the world during a run; a control is a *hypothesis machine* (the price lever thins the alley before the stall opens).
6. **Score = accuracy · economy · thrift**, three stars, computed **only at hand-in**. **Score ≠ XP**: XP comes only from recorded evidence, which the game produces as a side effect. **The game never touches the trial.**
7. **Failure explains itself**: a lost round ends on the line that names where the process broke (the bottleneck finder on the score card). No "game over".
8. **The link.** `Challenge.made` carries the creation; `challengeLink()` makes the URL; opening it lands on the same seed with the creation on the bench and the dare on the gauge — checkpoint, remix and challenge at once. `navigator.share` → WhatsApp, clipboard fallback, nickname only. A **share card** rendered from the live canvas. **Beat-that via `rank()`** — no global leaderboard, no timers as pressure, no streaks; ties break on fewer trials.
9. **Moments built to be filmed**: one 3-second celebration per door, and the film's picture and the app's picture are one picture.
10. **Storyboard before code, every round**: storyboard artifact → Selorm's review → code → suites → perf → look at the screenshots with your own eyes.

Standing guardrails: rewards follow evidence; no loot boxes, random rewards, come-back-later mechanics or leaderboards across strangers; never gate delight, correctness or the demo; the demo's readings are deleted when it ends.

## 5b. The Field Guide (the Enhanced Textbook's page engine — every cabinet, eventually)

**Decided 2026-09-11: the chapter is the other front door; decided 2026-09-12: its name to the learner is The Field Guide.** A chapter is the IGCSE topic in the syllabus's own order; a section is three or four narrated pages where every academic term is a verb in the cabinet; the section's **practical is one of the campaign doors, run exactly as §5 runs it**; a hit hand-in, once explained, stamps the syllabus statements it evidenced. Vault: `Enhanced Textbook.md`, `The Library.md`; the build on `main` is `Build Log — The Field Guide I · Chapters 6 and 8.md` (the earlier `Build Log — The Sugar Line IV · The Book.md` is a retired parallel build — history only).

1. **A page you can only read is a to-do list.** A term is braced only if it resolves to a registered verb (`lib/verbs.ts`, `lib/<cabinet>verbs.ts`): `{term:object/verb}` · `{term:object/verb|gloss}` · `{{ext}}…{{/ext}}` (Analyst only). The model suite asserts every term resolves; the browser suite taps every term at every band and asserts the sim moved. A term whose verb is not registered renders as plain text — a page can never move a cabinet that is not on screen.
2. **One page source, three band layers** (`explorer / scientist / analyst`, a missing layer falls back downward), **language keys** `en tw ha fr sw ar` per line (the academic term stays English; `ar` is RTL — logical CSS properties only; Western digits everywhere by decision). Verbs are never translated.
3. **The practical is the door, unchanged.** `practical: { door, level per band, stamps, line, explain per band }` — two sections can share a door at different levels; the door's explanation question belongs to the door (`books/<subject>/index.ts`), the stamps to the section. The guide adds nothing to the round and takes nothing from it; **score never touches the trial**.
4. **A stamp is the four-line evidence record, never XP** — the brief's guess, what was set, what the gauge read, and the explanation the practical page asks for after a **hit**; only the explanation stamps (`noteHandIn` → pending → `explainHandIn`), a miss records nothing. A check page stamps on the commit, before the model answer unfolds. **A stamp claims only what was evidenced** (the Line stamps 8.1.1, not 8.1.2 — a stem stage is not roots, stems and leaves); where a section does not cover a statement the ledger says *not here*. Ledger `ploobia.curriculum.v1`; statements in `lib/curriculum.ts` with `code`, verbatim `text` and a plain-words `label`.
5. **Syllabus numbers never on the learner's page.** The page card carries none (the model suite greps for them); the ledger names statements by `label` and shows the numbers and verbatim text only behind the **Syllabus** toggle (remembered per device). A stamped row opens to its four lines. **Depth × lens are two dials**: the band picks the layer, the syllabus picks the statements — a Ghana NaCCA/WASSCE view is its own statements, never IGCSE renumbered.
6. **A check page only where the practical cannot stamp**, and only at bands with such a statement (`pagesFor`).
7. **Layout is the cabinet's own tiers** (§6): the guide is pulled open from inside the room (the chip beside Challenge, gated like it) at the section for where you are; the page card **replaces the parts column** on desktop/tablet and the parts return when the practical starts; a third edge sheet on the phone; the turn card in portrait. Tappable words get their room from the line, never the centred hit-area extension.
8. **Where the cabinet has no stage for a part, the page carries its own figure** (`SectionFigure`: leaf and root in section; `figure/<layer>` verbs; the hotspot map is the contract a painted card must honour) — the syllabus's "identify in diagrams and images".
9. **Read to me** reads the page with Web Speech (`narrator.readAloud`), lighting each term as the voice reaches it and firing its verb once; nothing audible is load-bearing; recorded voice packs later.
10. **Ways in:** the **Field guide** chip in the room; *Read the field guide* on the welcome (the free lab with the guide open). The contents card and the parent evidence view are phase 2 — the Library in the hall.
11. Suites: `verify-page-model.mjs` (grammar, coverage, honesty) and `verify-page.mjs` (the browser); new cabinets register their verbs in `lib/<cabinet>verbs.ts` and ship their sections in `src/books/<subject>/`.
12. **A journal page, where the round discovers before it is told** (Numberworks A.3, review 2 — `kind: 'journal'`): the order is fixed — *You discovered* (the learner's own figures, filled from the round's record by `${key}`) → one sentence that NAMES it → **Show me how →**, folded, carrying the method and the Analyst's notation → **Try it**, the terms as a remote control back into the world. **A page nobody has earned shows its NAME and nothing else** — never the formula before the day that produced it. The syllabus retreats to one quiet strand name; codes live in the ledger a parent reads (two lenses, `strandFor`). The Field Guide's own pages are unchanged by it.
13. **One session per tree.** Two sessions built two engines into one clone on 11 Sep and the second overwrote the first. Before writing to the clone: list the folder, stage-and-diff, and stop on an mtime that is not yours.

## 6. Landscape, three layouts, viewpoints

**Decided 2026-09-06: everything in the Ploobia web app is landscape** — hall, cabinets, home, the game layer — in **three authored layouts**, not one fluid squeeze. Vault note: `Landscape Layouts.md`. The marketing site stays a normal responsive page.

| Tier | Canonical sizes | Composition |
|---|---|---|
| **desktop** | 1440×900 · 1366×768 · 1920×1080 | three columns — left parts/controls, centre scene (target plate top-left, coach chip bottom-left), right data / Our Space; one bottom toolbar |
| **tablet** | 1180×820 · 1024×768 · 1280×800 | same, narrower; toolbar drops secondary actions |
| **phone** (landscape, ≤ ~520 px tall) | 915×412 · 844×390 | scene fills the frame; top bar + one bottom toolbar; side panels slide in **from the edges**, never the bottom |

- `hooks/use-layout.ts` returns `desktop | tablet | phone` + `portrait`, from width **and** height. **Side columns need ≥ 1024 px.**
- **Portrait shows one thing: a full-screen "Turn your phone" card with Ploob.** The Canvas is not mounted behind it; it mounts in place on rotation. No rotate button (`orientation.lock()` is unsupported on iOS and needs fullscreen elsewhere; a control that silently fails is worse than none). `RotateHint`, `HudDrawer` and `usePortrait()` branches are retired cabinet by cabinet.
- **The bottom toolbar** is the standard action strip: Undo · Redo · Inspect · Duplicate | parts tray (next-needed part wears the amber aim ring) | Send · **Hand in**. Green = hand-in and invitations; amber = the aim ring; the cabinet tint = tabs and primary.
- **Viewpoint pass per cabinet**: the default shot, one shot per door, the phone tier's shot — all composed for a wide frame, subject off-centre, HUD never over the centre, `setViewOffset` by measured headroom. FOV per tier, not per cabinet.
- Three layouts are **not** three scenes: one scene, one model, one set of instruments; only HUD composition and camera differ.
- Suites screenshot **1440×900, 1180×820, 915×412** and one portrait size (assert the card, assert no Canvas); the hit-test sweep runs per tier in a `hasTouch` context after one real tap.

## 6b. Input

`lib/input.ts`: one abstract action bus (focus / confirm / back / adjust / orbit / zoom / menu / tab) with touch, mouse, keyboard and Gamepad adapters; everything interactive is a `Tile` (≥ 48 px touch, 64 px TV). Sliders are Radix, driven in tests **by the thumb plus the keyboard, never the track**. Default back → `location.hash = '#/'` (never `history.back`). Controllers and Xbox Edge come after the game and landscape passes.

## 7. Hard-won lessons — DO NOT relearn

1. **Never BrowserRouter.** Blank page, no error, at any non-root path.
2. **Never multi-file builds.** Browsers block module scripts over `file://`; the single-file build is why a kid can double-click it. And **never hand out the hosted build as a file** — Safari refuses `type="module"` from `file://`; hand out `npm run build:offline` → `Ploobia-offline.html` (classic IIFE).
3. **Model the mechanism, not the picture.** `rate = min(light, CO₂, water)` draws straight lines and can never reach the compensation point. Calibrate against real numbers before wiring UI; assert conservation in a Node suite.
4. **No `scale` prop on an R3F `<mesh>` inside an animated subtree** — it silently fails to render. Bake into geometry or scale the group. Custom uniforms on an `onBeforeCompile`-patched `MeshStandardMaterial` can silently no-op too.
5. **`inspectAttr()` only when `command === 'serve'`** — R3F throws on the injected prop in production.
6. **A label at an object's centre is hidden by its own front face.** Offset along the view ray. A glyph's `size` and per-instance scale **multiply** — pass a 0–1 fade, not a world size, as the scale.
7. **Two frame-loop clamps** (≤ 0.05 s animation, ≤ 0.25 s physics/trials), narration on wall time, crossings detected by comparing distances.
8. **Verify at the real path** (`/index.html#/<route>`) over HTTP, and `curl … | wc -c` against `dist/index.html` first — a stale server on the same port silently serves the old build.
9. **Headless SwiftShader FPS is not real FPS.** Judge correctness. Draw calls and triangles transfer; frame rate does not. A suite that fails only while another suite runs is CPU contention — rerun alone, sequentially, from a background shell.
10. **Never `pkill -f <pattern>` when the pattern is in your own command line** (exit 144).
11. **Never sweep a tube with `computeFrenetFrames`** — the frame twists per curve. Build the ring in world space (`v = 0` toward the camera). **`CylinderGeometry` puts θ at `(sin θ, 0, cos θ)`.**
12. **`THREE.MathUtils.smoothstep(x, min, max)` returns 1 for any `x ≥ max`** — reversed edges do not invert it; write `1 - smoothstep(x, lo, hi)`.
13. **Three's lighting units are not lux.** An outdoor rig needs far more intensity than looks reasonable. **Tune lighting against sampled pixels.** **An `InstancedMesh` renders every allocated instance** — set `mesh.count` to what you wrote, or unwritten instances stand at the origin at full size.
14. **No post-processing chain, no physics engine.** God-rays are two instanced draw calls of geometry; bloom, colour grading, cannon-es and friends are real money on a mid-range tablet and step aside in Cardboard stereo. Ploob's transmission material is medium tier and up (a whole render pass).
15. **Never fade an instanced sprite by darkening `instanceColor`** (it goes black, not invisible) — use an `aFade` attribute into alpha. Translucent shells get `depthWrite: false`.
16. **A plate wider than its column is clipped and the clipped strip still swallows taps.** Columns own the width; plates are `w-full`. **A pinned block must be height-capped; a flex column's children need `shrink-0`.** **Assert hit-testing (`elementFromPoint`), not placement** — position, size and non-overlap all pass while a control is dead.
17. **An effect that depends on an inline handler never fires its timeout.** Key it off the data, hold the handler in a ref. **A once-registered window listener must read its handler through a ref.**
18. **`getByRole('button').first()` matches DOM order, not z-order** — render overlays first, and never name a mission anything a suite greps for. `aria-label` overrides visible text; `getByText` matches every ancestor (assert `>= 1`).
19. **A panel that only mounts when its tab is open cannot emit learning events.** Emit from the always-mounted page.
20. **`resilientClick` can double-fire.** For state assertions on a toggle, drive the element once from inside the page (`dispatchEvent('click')`).
21. **Model init is lazy** (`ensureRiverModel()` pattern) — `App.tsx` imports pages eagerly, so module-level simulation taxes every cabinet's boot.
22. **Shared scratch points alias.** Copy scalars out of a `planAt()` result before calling anything else.
23. **Tailwind arbitrary-colour opacity must use scale values** (`/90`, `/95`; `/92` is silently dropped).
24. **Never run `git` against the user's repo through the Cowork mount** (`git status` leaves an undeletable `index.lock`; every file shows modified because of CRLF). Read-only plumbing and `cat` only; never suggest `git add -A` on Windows.
25. **A 403 is not evidence** — identify which layer answered before drawing a conclusion. **A build script written on Linux is not a build script**: `npm run build` must work from a clean checkout on Windows (`shell: true` for `.cmd`, `prebuild` installs the workspaces).
26. **`concat -c copy` discards audio when stream parameters differ**, silently (film pipeline; use the concat filter).
27. **`stabilityOf`, `SHELL_CAPS = [2,8,8,8]` for Z ≤ 20 only**, valency `min(outer, room)`, formula order via the IUPAC `H_FOLLOWS` set — the chemistry model rules are in *Cabinet Spec — The Foundry Game* §6. Some pairs the counting rule cannot settle: name the real product as a caveat, never fudge.

28. **A between-days drift keyed on the shopper index walks the whole crowd off together** (`shoppersFor` sorts by `at`, so index ≈ arrival order): the alley was empty for most of a minute and a "lever thins the alley" test read 0 vs 0. Spread a stroll with a golden-ratio hash of the index. **A bubble that follows a walker is off-screen in a second** — settlements float up from the counter, where they happened.
29. **A day that pauses for a decision must pause EXACTLY on the boundary** (`stepMarket` clamps the target to `EVENT_T` while an event is pending; the wall time spent paused is handed back on resume) — otherwise shoppers after four are settled at the old price and the replay no longer equals `simulateDay`. **A reconstruction line is a product only when the day had one price**; with a drop at four it is two products, and the card says both.
30. **A cabinet suite that must run on a machine without `public/models` takes `STANDINS=1`** (opens with `?standins=1`, treats 404s as expected). The Cowork mount can vanish mid-session (Windows update, 8 Sep): the cloud box can `npm ci` + `vite build` + Playwright with the pre-installed Chromium and the page suites run there; stage sources up, commit results down, never `git` through the mount.
31. **Every count on screen must add up to the whole it names, and people are not things** (Numberworks review 2): the Market's alley is forty PEOPLE — `buyers + passed + missed` — while `sold` is TOMATOES, one to four per buyer. `simulateDay` returned early at sell-out, so the shoppers who arrived after the basin emptied were counted as neither; a third state (`missed`) was the fix, and `resultOf(run)` is now the one place a `DayResult` is made. A day set up but never run is still today: the next-day button must ask again rather than spend a day index.
32. **A narrow plate truncates a long label into a broken instrument** ("PROFIT ON THE…"): every gauge cell carries a `short` name for the plates, ≤ 10 characters and still true; the full label stays on the board panel and the score card.

33. **A scoring rule written for one round shape silently zeroes another** (the Pond, round E). `TRIAL_FLOOR = 6` assumes a lucky first measurement is perfect play; a round whose rules FORBID an early answer — the Pond cannot accuse a plate until every dial has been tried, so its honest minimum is four counts — scored **zero economy under perfect play**, capping every level at one star. A challenge now carries its own `minTrials` (perfect) and `floor` (zero), defaulting to 1 and 6 so every older round scores exactly as before, and the suite asserts that playing a round properly is worth more than one star. Before adding a round, check the spine's terms actually describe it.

34. **A control at the end of its rail must be a disabled button with a word on it.** The Pond's dial buttons stayed live and did nothing at the rail ends; on the veranda sprig (all three dials at the top of their rails) three of six buttons were dead and silent, and one of them had already spent that dial's one prediction. In a round whose whole lesson is *"nothing happened" is a result*, a learner cannot be left unable to tell a designed flat result from a broken control. Check the end BEFORE asking for the prediction, disable the button, and say why on its face ("as close as it goes").

35. **An effect keyed on its own progress restarts forever.** The count clock stored 0–1 in state and listed it in the dependency array, so every 80 ms tick tore the interval down and began the minute again; the count never landed. Key the effect on *when it started* (`countFrom`), read the live world through a ref, and keep the progress in a second piece of state that only the drawing uses.

36. **Evidence is what the learner watched, never what the model would have done.** `hasEvidenceFor` asked the model whether the accused dial *would* move the count from where it stood — crediting a jump nobody saw and refusing one seen under a cloth. Read the log: consecutive counts, one dial moved, the difference on screen.

37. **The reagent is not the requirement, and nothing is never the answer.** "It was short of baking soda" teaches that pondweed eats baking soda; it is short of **carbon dioxide**, and the soda is where that comes from. And a living plant is never limited by nothing — the fourth plate says *"nothing more on this bench"*, not *"nothing was holding it back"*, or a learner has to unlearn it a year later. A number a brief states before the round (the typed prediction's answer) must be true on **every seed** — the Pond's stated "9 a minute" was wrong on all of them and on one seed announced the answer.

38. **A full-screen results card mounted in the same frame as the reveal covers the reveal.** The plates flipping — three question marks becoming three readings, the accused one first — is the Pond's one filmable moment, and the Field Log sheet used to land on top of it. Give the shot its beat (1.5 s), stagger the flips, and put the sound on the accused plate.

## 8. Quality gates & delivery

Before any hand-over:

- [ ] `npm run build` exits 0 from a clean checkout; `tsc` clean; eslint clean on new files (`react-hooks/immutability` on the mutable-sim pattern is house architecture — leave it).
- [ ] Serve `dist/` over HTTP; the cabinet's own suite green (`verify-<cabinet>.mjs`, and the pure-model suite where one exists); `verify-input`, `verify-touch`, `verify-progression`, `verify-perf` green; `verify-challenge` green for any cabinet with a game layer. Timing checks report **SKIP with the number** on a software renderer, never a silent pass.
- [ ] Screenshots at **1440×900, 1180×820, 915×412** and one portrait size, for every door of the cabinet, looked at with your own eyes.
- [ ] Perf within the cabinet's low-tier budget (`verify-perf`).
- [ ] Pilot build + offline build + `scripts/verify-bundle.mjs` (`VITE_PILOT=1 PLOOBIA_BUILD=<id> npm run build && npm run build:offline && node scripts/verify-bundle.mjs`) — a cabinet rename must be made in that suite's greps too.
- [ ] A Cowork session **cannot push**: hand over the source written into the clone (or a `git bundle` + the push lines, one per line, no `&&`), name the files, and Selorm commits. Cloudflare builds on push; match deployments by commit hash.
- [ ] Vault: a `Build Log — …` note for the round and a dated line in `Decision Log.md`; update `Game Grammar.md` / `Landscape Layouts.md` if a rule changed.

## 9. Roadmap

The game and landscape passes run in the order in §5. Beyond them the content program (vault `Content Program.md`) stands: engines not one-offs (Investigation · Journey · Venue · Vision · Expedition · Chronicle · Commons); the Commons as same-room multi-device play via room codes (`lib/challenge.ts` already has `roomCode`); the curriculum layer `lib/curriculum.ts` mapping missions to IGCSE points as the parent-facing evidence view; then Circuit Workshop, the Digestion ride, The Old Crossing (history, with the historian's review planned in), the Observatory, maths cabinets, the Cell Interior with the Scale Elevator. Parked seeds: Cell Transport (the membrane bench), Cell Power (one ATP-synthase motor for photosynthesis and respiration), The Plot (the Sugar Line's stand as its own cabinet).

## 10. Working agreements

- Small themed commits per cabinet (`sugar: …`, `foundry: …`); don't touch another cabinet's scene logic; shared changes (hall, kit, tokens) are expected.
- **Storyboard first, then code.** Whiteboard the way-in, the doors and each door's shot with Selorm before building; nothing is generated or built until he has read it.
- Before choosing a base, read the tail of `Decision Log.md`; if a parallel session moved the head, port only your cabinet's own files and keep their shared ones, then run every suite.
- Report honestly: a suite skipped is reported as skipped; a screenshot not looked at is not verified; a claim about the live site is checked in a real browser (the pilot is unlisted and blocks fetchers).
- Ploob only. Play first. Landscape only. Score ≠ XP. Accuracy is non-negotiable. "Boring" is P0.
