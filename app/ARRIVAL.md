# Seaplane arrival prototype

Build with `VITE_WORLD=1 npm run build` in `app`, serve `dist`, and open `#/world`.
A fresh profile starts the 30-second arrival when Play is pressed. An existing save
continues directly. The welcome screen also offers **Watch the seaplane arrival**;
finishing or skipping this replay returns to the welcome screen without advancing
the saved simulation. Reduced-motion preference bypasses automatic first-time flight.

During the flight, drag to look, pause/resume, mute, or skip. On a fresh arrival,
completion and skipping share the same jetty spawn and cue Nara's walk up the path.
The aircraft remains beside the jetty. Regional silhouettes are scenery, not
playable destinations. Existing Foundry state remains unchanged.

## Verification

- `node verify-arrival-model.mjs`: route continuity, touchdown and final camera pose.
- `node verify-roots-model.mjs`: existing learning model regression checks.
- `VITE_WORLD=1 npm run build`: complete world compilation and bundle.

Manual checks on a WebGL2 device before merging:

1. New profile: Play, look around, pause, resume, watch touchdown and reach the jetty.
2. New profile: skip near the start and during descent; compare the starting position.
3. Reload a progressed save: Continue must bypass the flight and preserve progress.
4. From the saved welcome screen, replay then skip: Continue must restore the same spot.
5. Try landscape touch, reduced motion, mute, tab switching, and a blocked WebGL context.

Prototype limitations: simple procedural aircraft and regional landmarks; Ploob's
reactions are captions, with synthesized engine audio. A rendered GPU playthrough
is still required for visual timing and collision review. Arrival progress itself
is not saved; leaving mid-flight restarts it unless it was completed or skipped.
