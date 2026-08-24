---
title: Tripo Asset Brief — The Sugar Line
type: reference
status: living
created: 2026-08-24
tags: [ploobia, assets, tripo, sugar-line, photosynthesis]
---

# Tripo Asset Brief — The Sugar Line

Everything in the cabinet is procedural today and it stands on its own. This
note is the shopping list for the level above that: the handful of objects
where a generated mesh would genuinely beat generated geometry, in priority
order, with the prompt, the slot it plugs into, and the budget it has to hit.

## Read this first: what NOT to buy

**Nothing that represents a molecule, a reaction, or an organelle.** The house
rule from [[Visual Style]] is *photoreal for the physical world, luminous and
deliberately diagrammatic for the invisible* — a photoreal chloroplast teaches
nothing, and a photoreal glucose molecule teaches something actively false. The
grana, the Calvin cycle ring, the ATP and NADPH carriers, the sugar parcels and
the sieve plates all stay hand-built. Tripo is for the **organs**: the things a
learner has held in their hand and would recognise.

**And nothing that breaks the offline build.** The arcade ships as one
self-contained HTML file with no external requests, because that is what makes
it usable on a metered connection and from a memory stick. So every asset here
is *optional*: it loads on demand from `/app/assets/` when the network allows,
and the procedural version stays in the bundle as the fallback. A cabinet that
shows a grey box when the CDN is slow is worse than one that never had the
asset. See "Wiring" at the end.

---

## Priority 1 — the sinks

These are the whole point of the cabinet. "Where did the sugar go?" is answered
by an object, and the object should be one a learner has eaten.

### 1.1 Bean pods on a peduncle

> **Tripo prompt:** *A cluster of three green common-bean pods hanging from a
> short woody stalk, one pod split open lengthwise to reveal five pale beans in
> a row inside. Botanical specimen, matte surface, soft even studio light,
> neutral background, no leaves, no soil, no text.*

- **Slot:** `SinkBody` → `preset === 'fruit' && specimenId === 'bean'`
- **Anchor:** the `pods` sink, currently `[0.3, 1.3, 0.16]`; hangs downward
- **Fit box:** 0.42 units tall (≈ 4 cm), pivot at the top of the stalk
- **Why it beats the code:** the split pod showing seeds *is* the teaching. Three
  capsule primitives cannot say "each of these is a packed lunch".

### 1.2 Maize cob, husk peeled back

> **Tripo prompt:** *A single ear of maize with the green husk peeled halfway
> back to expose rows of plump yellow kernels, pale silk threads at the tip.
> Botanical specimen, matte, soft studio light, neutral background, no stalk,
> no text.*

- **Slot:** `SinkBody` → `preset === 'fruit' && specimenId === 'maize'`
- **Fit box:** 0.55 units, long axis roughly vertical, tilted ~20°
- **Why:** the kernels are visibly *warehouses*. The current capsule is the
  weakest object in the cabinet.

### 1.3 Potato tubers with eyes

> **Tripo prompt:** *Three freshly lifted potato tubers of slightly different
> sizes, dusty brown skin with visible eyes and a few shallow scars, one small
> pale sprout on the largest. Matte, soft studio light, neutral background, no
> soil pile, no text.*

- **Slot:** `SinkBody` → `preset === 'store' && specimenId === 'potato'`
- **Fit box:** 0.5 units across the cluster
- **Why:** this is the single clearest "last summer's sunlight, filed
  underground" object in the whole library. The eyes matter — they are what
  proves a tuber is a stem, not a root.

### 1.4 Tomato truss

> **Tripo prompt:** *A tomato truss with five fruits on a green stem: two fully
> red, one orange, two still green, each with a five-pointed green calyx.
> Matte, soft studio light, neutral background, no leaves, no text.*

- **Slot:** `SinkBody` → `preset === 'fruit' && specimenId === 'tomato'`
- **Fit box:** 0.5 units
- **Why:** the ripening gradient on one truss is a free extra lesson, and it is
  exactly what the sink-competition mission is about.

### 1.5 Prickly-pear pad with areoles

> **Tripo prompt:** *A single flattened prickly-pear cactus pad, blue-green
> waxy surface, regular diagonal rows of small round areoles each with a tuft
> of fine spines. Botanical specimen, matte, soft studio light, neutral
> background, no pot, no text.*

- **Slot:** the `pad` arrangement in `rig.ts` (currently a squashed ellipsoid)
- **Fit box:** 0.9 units tall
- **Why:** the areole rows are the diagnostic feature, and they are exactly the
  sort of regular-but-organic detail procedural code is bad at.

---

## Priority 2 — the root ball

### 2.1 Fibrous root mass

> **Tripo prompt:** *A washed fibrous root system from a young bean plant, pale
> cream main roots with dense fine laterals and root hairs, spread as if just
> lifted from soil, a few small round nodules on the larger roots. Botanical
> specimen photograph, matte, soft even light, neutral background, no soil, no
> plant above, no text.*

- **Slot:** `PlantBody` → `rig.rootGeometry`
- **Fit box:** 1.0 unit deep × 1.4 wide, pivot at the crown
- **Why:** tapered tubes will always read as wire, however much they wander.
  Fine laterals and root hairs are the whole visual difference between "a
  diagram of roots" and "a root ball", and this is the view the "Below ground"
  shot is built around. The nodules are a bonus — bean rent paid to bacteria.
- **Variant to generate at the same time:** the same root system for maize
  (denser, more even, with prop roots at the crown).

---

## Priority 3 — the instruments

These make the measurement loop literal rather than notional, which is the
difference between "the cabinet tells me a number" and "I can see what took it".

### 3.1 Aphid with its stylet in the stem

> **Tripo prompt:** *A single green aphid in profile, side view, long thin
> mouthpart (stylet) extended straight down from its head, two cornicles at the
> rear, fine legs. Scientific illustration model, matte, soft light, neutral
> background, no plant, no text.*

- **Slot:** a new prop on the stem stage at the phloem tube, and a tiny one on
  the plant stage where the phloem tap reads
- **Fit box:** 0.16 units long
- **Why:** the instrument copy already says an aphid stylet is how phloem sap is
  really collected. Showing the aphid turns that from a caption into the thing
  on screen — and it is the most memorable fact in the topic.

### 3.2 Cut stem billet

> **Tripo prompt:** *A short section of green herbaceous plant stem cut cleanly
> across at both ends, standing upright, the cut face showing a ring of small
> vascular bundles around a pale pith. Botanical specimen, matte, soft light,
> neutral background, no leaves, no text.*

- **Slot:** an optional physical prop beside the enlarged pipes in the stem
  stage, so the enormous schematic has a real object to be a magnification *of*
- **Fit box:** 0.7 units tall
- **Why:** the scale bar says 100 µm; a real billet next to it is what makes
  that number mean something.

### 3.3 Soil crumbs

> **Tripo prompt:** *A small scatter of dry loamy soil crumbs and two tiny
> pebbles, top-down, matte, soft light, neutral background, no plants, no text.*

- **Slot:** dressing on the `SoilMound`
- **Fit box:** 0.25 units, instanced 8–14 times with random yaw
- **Why:** cheap, and it stops the mound reading as chocolate icing.

---

## Budgets and the pipeline

Per hero, after processing: **≤ 25 k triangles, ≤ 3 MB GLB, one material,
1024² textures**. The whole optional pack should stay under **20 MB**, because
the arcade's entire current bundle is 2.5 MB and an optional layer that dwarfs
the app is not optional in practice.

Tripo output is typically 120–150 MB raw. The route down, using
`@gltf-transform/cli` (this is the recipe distilled in [[Anatomy Atelier Reference]]):

```bash
npx @gltf-transform/cli prune    raw.glb  s1.glb
npx @gltf-transform/cli dedup    s1.glb   s2.glb
npx @gltf-transform/cli weld     s2.glb   s3.glb
npx @gltf-transform/cli simplify s3.glb   s4.glb --ratio 0.2 --error 0.001
npx @gltf-transform/cli resize   s4.glb   s5.glb --width 1024 --height 1024
npx @gltf-transform/cli etc1s    s5.glb   s6.glb --quality 200
npx @gltf-transform/cli meshopt  s6.glb   final.glb
```

Then, on load, run the **material sanitiser** — generated meshes arrive with
wild PBR values and will not sit in the atlas light rig without it:

- `roughness` clamped to 0.45–0.65, `metalness` 0
- `envMapIntensity` ≈ 0.3 against the cabinet's procedural environment
- clearcoat at most 0.1 (rough 0.6) — a waxy leaf, not a car
- `transmission` off, front side only
- `anisotropy` up to 8, or the texture crawls when the camera orbits

And **fit-box normalise** every asset into the unit cube before use, so the
anchor coordinates in `lib/specimens.ts` keep meaning the same thing whichever
generation of the mesh is installed.

## Wiring

```
app/public/assets/sugar/{bean-pods,maize-cob,potato-tubers,tomato-truss,
                         opuntia-pad,root-bean,root-maize,aphid,stem-billet,
                         soil-crumbs}.glb
```

- One `useSugarAsset(id)` hook: returns the loaded GLB or `null`, never blocks.
- Every consumer renders the procedural version when the hook returns `null`.
  That is not a placeholder, it is the shipped free tier.
- Prefetch on specimen hover in the library rail; keep a small LRU so switching
  back and forth does not re-download.
- `PLOOBIA_OFFLINE=1` builds skip the hook entirely.
- Add the loaded triangle count to `verify-perf.mjs`'s photosynthesis budget
  before merging: the cabinet currently measures **85 draw calls / 18 k
  triangles** at the low tier, and the whole point of that budget is that it
  fails loudly when an asset lands on it.

## Before you generate

Check the commercial terms of the Tripo plan the assets are made on. Ploobia
ships free to learners and takes sponsorship, so the licence has to permit
commercial redistribution inside a product. This has been the blocking question
for asset work twice; settle it once and note the answer here.
