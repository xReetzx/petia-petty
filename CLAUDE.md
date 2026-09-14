# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # playwright, for the test harness only — the game needs nothing
npm run serve      # static server on http://127.0.0.1:8777
npm test           # full end-to-end suite in Chromium (starts its own server)
npm run capture    # render the visual review sheets into .shots/
```

The game itself has **no build step and no runtime dependencies**. Opening
`index.html` directly from disk works — classic `<script>` tags, no ES modules,
Three.js vendored in `vendor/`, and every texture drawn on a `<canvas>` at load
time. Keep it that way: it is what lets the same source run from `file://`,
from GitHub Pages, and as a published artifact with no configuration.

To run one part of the suite, comment out sections in `tools/test.js` — it is a
single linear script, not a framework, deliberately.

On machines with a preinstalled browser, point the harness at it:
`CHROMIUM_PATH=/path/to/chrome npm test`.

## Tests prove it runs. Only looking proves it works.

Every visual bug this project has had passed the entire suite while broken: the
character facing away from the camera, the clippers sitting off-screen for a
whole run, buildings filling half the frame, alopecia patches that never
punched through, a dark band rendered across his eyes.

So when changing anything visual, run `npm run capture` and **read the images**.
It writes a turnaround, the four hair stages, the chase at three menace levels,
and the raw head textures. Rendering a texture on its own at full size beats
squinting at it 80 pixels tall in-game.

## Architecture

Scripts attach to a single `window.PP` namespace and **load order in
`index.html` matters** — each module assumes the earlier ones exist:

```
config → utils → audio → face → characters → player → clippers → world → ui → game
```

- **`src/config.js`** — every tunable in the game: speeds, gravity, lane
  positions, camera rig, chase behaviour, spawn tables, palette. Tuning work
  belongs here, not scattered through the modules.
- **`src/utils.js`** — seeded RNG, object pooling, frame-rate-independent
  damping, the toon gradient map, and `inked()`/`outline()`.
- **`src/face.js`** — the character's likeness. Draws the face, profile, nape
  and under-chin textures with the canvas 2D API, plus the portrait cards used
  by character select.
- **`src/characters.js`** — the roster. A character is data (a palette and some
  copy); the model, portrait and select panel all build themselves from it.
- **`src/player.js`** — body, procedural animation, and hair-as-health.
- **`src/clippers.js`** — the chaser and the `menace` value that drives it.
- **`src/world.js`** — pooled road chunks, traffic patterns, pickups, city.
- **`src/ui.js`** — DOM HUD and overlay screens.
- **`src/game.js`** — state machine, input, collision, camera, main loop.

### The chase geometry, and why it is the way it is

This went back and forth several times and the current arrangement is the only
one where both the player and the threat stay readable. Do not "simplify" it
without re-deriving the constraint:

- The camera **trails** the player, so he runs away from the viewer.
- A pursuer directly behind him is therefore either *behind the camera too*
  (invisible) or *between camera and player* (covering him up). There is no
  third position on that axis.
- So the clippers **hunt from the side**: out over the sidewalk when the meter
  is low, swinging inward, downward and toward the lens as it fills. They grow
  in frame without occluding him. Only the lunge crosses over his head.
- `menace` (0–1) is the single dial. Hits raise it, clean running bleeds it off,
  and at 1 the clippers lunge and take a stage of hair.

`tools/test.js` projects the player and the clippers into screen space at full
menace and asserts the horizontal gap stays positive, so this cannot silently
regress.

### Hair is the health bar

`PP.Player.setHair(n)` swaps geometry for stage `n`: full mop → clipped back to
bare scalp → horseshoe → bald, which ends the run. A skin-coloured scalp dome
sits under the hair at all times so shaved areas read as skin rather than as
holes in the mesh.

Every hair and beard piece must stay **behind the face plane** (the head box is
0.76 deep, so its front face is at local `z = -0.38`). Anything poking past that
lands on his eyes.

### His face is the real artwork, not a drawing of it

`assets/petty-ref.jpg` is the reference illustration. `tools/bake-art.py` crops
it — face, side profile, and the whole composition — and writes them into
`src/art.js` as base64 data URIs. Re-run it after changing the artwork:

```bash
python3 tools/bake-art.py        # PREVIEW=/some/dir to also dump the crops
```

It is **baked in rather than loaded** for a specific reason: a `file://` page
treats every file as its own origin, so an image fetched at runtime taints any
canvas it is drawn into — and the portrait card does exactly that kind of
canvas work. Embedding sidesteps loading altogether, which is also why the
Artifact CSP is a non-issue. `npm test` has a `file://` section that guards
this; if it starts failing, something reintroduced a runtime fetch.

Two things follow from the artwork being a real image:

- **Decoding is asynchronous**, so `PP.Face.get()` hands back one texture
  object immediately, seeded with the drawn fallback, and paints the image into
  that same canvas when it arrives (`needsUpdate`). Returning the artwork only
  once ready means materials get built from the fallback and never swapped —
  that was the first attempt, and his face silently stayed hand-drawn.
- **Crop constants are in source-image pixel coordinates.** The source was
  converted from a 8.8 MB PNG to a 0.83 MB JPEG at identical dimensions so they
  still hold; do not resize it without rescaling them.

The hand-drawn face in `src/face.js` is kept as the fallback and for roster
slots with no artwork. `PP.Face.drawn()` reaches it directly.

### Two rendering constraints worth knowing

- **Outlines are inverted hulls** — a back-faced copy of each mesh scaled
  outward. This only works on *closed* geometry. An open-ended cylinder or a
  partial sphere renders its black interior instead, which shows up as dark
  wedges through the model. Build from closed primitives.
- **`destination-out` needs something underneath.** The alopecia patches are
  punched through a separate beard layer that is then composited over painted
  skin. Punching straight onto a canvas with nothing beneath erases to
  transparent, which renders as a white hole. Also note canvas resolves gradient
  coordinates in the transform active at *fill* time — build a patch gradient
  after any `translate`, centred on the local origin.

### Debug surface

`window.__PP_DEBUG` exposes state and control for the harness: `stats()`,
`forceSnip()`, `givePickup()`, `setMenace()`, `setHair()`, `lane()`,
`headYaw()`, `clipperGap()`, `facingCamera()`, plus `poseCam()`/`hideWorld()`/
`headCam()` for the capture tool. Extend it rather than reaching into internals
from tests.

## Audio

All synthesized at runtime — no audio files. `src/audio.js` carries an original
chiptune scheduled with the Web Audio lookahead pattern, plus effects and a
clipper drone whose pitch tracks `menace`. The music is deliberately **not** a
transcription of any existing game theme; those are copyrighted compositions and
this repository is public. Keep any additions original.

Audio can only start from a user gesture, which is why the first click on RUN is
what unlocks it.

## Conventions

- Tuning values go in `config.js`; modules read them, they don't hardcode.
- New characters are entries in `characters.js` — adding one should need no
  changes to `player.js` or `ui.js`.
- Pool anything spawned per chunk (`PP.U.Pool`); the world streams continuously.
- Frame delta is clamped to 1/30s so a backgrounded tab doesn't resume by
  teleporting the player through a wall — keep new motion delta-driven.
