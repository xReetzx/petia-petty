# Petia Petty — project record

A running note of what this is, what was decided, and where things stand.
Kept so a later session (or a later me) can pick it up without re-deriving it.

## What it is

A Three.js endless runner. You run toward the camera down a city street while a
giant pair of hair clippers chases you, and your hair is the health bar. The
alopecia premise is the mechanic, not decoration: getting caught costs a stage
of hair, and going bald ends the run.

## Where it lives

| | |
|---|---|
| Canonical source | `xReetzx/petia-petty` on GitHub (its own repo) |
| Working copy | `Projects/petia-petty/` in the Claude access folder |
| Playable link | https://claude.ai/artifact/TFQrkQmDHTyxhqQqGwMmUU |
| Planned hosting | GitHub Pages via `.github/workflows/pages.yml` → `xreetzx.github.io/petia-petty` |

The access-folder copy is a mirror for convenience. The GitHub repo is the one
to treat as canonical; if the two drift, prefer the repo.

## Decisions taken

- **Its own repo, public.** Kept out of the access folder's own repo because
  that one holds personal skills and automation. Public so GitHub Pages can
  serve a free permanent link to share with friends. Nothing sensitive is in
  the game code, and it stays that way.
- **No build step, no dependencies, no binary assets.** Classic `<script>`
  tags, Three.js r128 vendored into `vendor/`. Every texture is drawn on a
  canvas at load time and every model is built from primitives. It runs by
  opening `index.html`, from Pages, and as an Artifact, all from one source.
- **Camera trails the runner**, over the shoulder. This went back and forth: a
  trailing camera hides a pursuer that chases from behind, and a leading camera
  shows the face but puts obstacles behind the lens. Settled by keeping the
  trailing camera and moving the clippers to hunt from the SIDE, which is the
  only arrangement where both the player and the threat stay readable.
- **Art direction: inked comic.** Cel shading, inverted-hull black outlines,
  screen-printed flat colour. The sky is a banded dawn now, not cream paper —
  but the rule that held through that change is that a photoreal backdrop would
  leave the hand-drawn character looking pasted onto a different game.
- **The face is the real artwork.** `assets/petty-ref.jpg` is Brandon's
  illustration; `tools/bake-art.py` crops and re-projects it into `src/art.js`
  as data URIs. It is baked rather than fetched because a `file://` page taints
  any canvas a runtime-loaded image is drawn into.
- **The drawing is a three-quarter view and is straightened in the bake.** A
  cylinder re-projection undoes about half the ~30° turn so he faces down the
  street. Full correction is geometrically right but stretches his far cheek
  and widens one eye; `FACE_STRAIGHTEN` is the dial.
- **Draw calls are the budget that matters.** Everything merges to one
  vertex-coloured geometry per object; outlines are optional and cost double.
  `npm run budget` prints it and the suite holds a ceiling.

## Current state

Complete and playable. **78 automated checks** pass in Chromium.

- Three lanes, jump and slide, speed 13 → 33 over about four minutes
- **Nine obstacle kinds**, each declaring an archetype the suite verifies
  against the real jump apex and slide height: car, cab, cones and steel plate
  to jump; flatbed rig and scaffolding gantry to slide; van, truck and dumpster
  to go around
- **Dawn New York**: banded sky, the sun framed down the avenue, a building
  line both sides with lamps, traffic lights, hydrants, news boxes, bus
  shelters, sidewalk scaffolding, parked cars and a crowd
- Hair tufts for score and combo, serum regrows a stage, pomade shields one hit
- Clippers hunt from the side, lunge at full menace, take a hair stage
- Synthesized WebAudio — original chiptune plus effects — keyboard (WASD and
  arrows) and touch, best score saved
- Each snip physically mows hair off the top of his head, down to a bald scalp
- Petty's run cycle is a proper gait: pelvis and chest counter-rotate, cadence
  follows ground speed, landings carry impact

## Outstanding

- **Enable Pages — needs one click, and only Brandon can make it.**
  Settings → Pages → Build and deployment → Source: **GitHub Actions**.
  Not "Deploy from a branch": that serves the site without the workflow and
  leaves it failing red on every push. `configure-pages` cannot self-enable
  here — the Actions token gets "Resource not accessible by integration".
- **Characters 2 and 3** are locked `???` placeholders. A character is pure
  data in `src/characters.js` — a palette and some copy — and adding one should
  need no changes to `player.js` or `ui.js`.

## Working on it

```bash
# run it
python3 -m http.server 8000        # then open http://127.0.0.1:8000
# or just open index.html — there is no build step
```

```bash
npm test          # 78 checks in Chromium; starts its own server
npm run capture   # render the visual review sheets into .shots/
npm run budget    # draw calls, triangles and mesh count at three speeds
```

Tuning lives in `src/config.js`; almost every number worth changing is there.
`window.__PP_DEBUG` exposes hooks used by the test harness — `stats()`,
`forceSnip()`, `clearShield()`, `givePickup()`, `setMenace()`, `setSpeed()`,
`lane()`, `rig()`, `elbows()`, `obstacleKinds()`, `render()`.

`CLAUDE.md` carries the architecture and the traps: merged geometry, per-type
pools, the obstacle archetype contract, limb signs, and why the head is one
wrapped texture on a box.

Two things worth knowing before changing visuals:

- Screenshots catch what tests cannot. Every visual bug in this project's
  history — the character facing backwards, the clippers off-screen, buildings
  filling the frame, alopecia patches that did not punch through — passed the
  test suite the entire time it was broken. Look at the render.
- The face is the focal point. It is the real illustration wrapped onto the
  head; `npm run capture` writes a head orbit at 45° steps, which is the sheet
  that shows whether it reads as one object. The turnaround is framed too wide
  to show a seam — which is how a head made of three unrelated photographs
  shipped once already.
- Anything periodic must be computed analytically and applied directly, never
  through `damp()`. At 3–6 Hz the filter flattens it to nothing, which is how
  the run cycle lost its vertical bob while looking correct in code.
