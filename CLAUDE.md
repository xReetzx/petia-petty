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

### The rig splits at the waist, and the cycle is never damped

`player.js` builds `body → { pelvis, chest }`, with the legs on the pelvis and
the torso, arms and head on the chest. That exists for one reason: a run reads
as a run because the hips and shoulders rotate *against* each other. With the
limbs on a single group that is impossible to express and the result is a
wind-up toy marching. Don't flatten the hierarchy.

The head is a child of `chest`, so `_animate` **cancels the chest's run twist
out of `head.rotation.y`**. A runner's shoulders turn under a head that stays
pointed where he is going; without the cancellation his face swings twenty
degrees each way, every step.

**Never wrap a periodic value in `damp()`.** The cycle runs at 3–6 Hz and no
sane damping rate can follow that — the filter silently flattens it and
phase-lags what is left. The old body bob was a correct-looking
`damp(y, |sin(p)| * 0.07, 14, dt)` that produced almost no visible motion at
all, and a character with no vertical travel is the single loudest thing wrong
with a run. Write anything periodic analytically and assign it directly;
`damp()` is for transitions *between* states (lean, pose changes, the camera).

Two more things the rebuild depends on:

- **Impact velocity has to be captured in `update()` before the ground clamp**,
  which zeroes `vy` one line later. Miss it and a landing frame is
  arithmetically identical to any other grounded frame, leaving nothing to
  animate a landing with.
- **Lane bank is driven by lateral velocity, not distance remaining.** Driving
  it from the gap left to close makes the lean peak *after* he has arrived.

Cadence is derived from ground speed but is deliberately **not** solved for
zero foot-skate — see the note in `config.js`. His legs are far too short for
the speed the track moves at; matching it exactly would need eight to twenty
steps a second.

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
it — the face and the whole composition — and writes them into `src/art.js` as
base64 data URIs. Re-run it after changing the artwork:

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
  still hold; do not resize it without rescaling them. `FACE` must stay square,
  and it is deliberately generous — the mask in `face.js` does the trimming, so
  reframing does not mean re-baking.

The hand-drawn face in `src/face.js` is kept as the fallback and for roster
slots with no artwork. `PP.Face.drawn()` reaches it directly.

### The head is one painting, not six pictures

It used to be a `BoxGeometry` with six materials: a three-quarter portrait on
the front, a closer crop of that *same* portrait on both sides — so he had a
face on each side of his head — and a flat brown slab at the back. Three
unrelated images at three scales meeting at hard 90° corners, where tone, scale
and line weight all jumped at once. That is what "stitched together" meant.

It is **still a box** (square reads better for this character than a sphere did,
which was tried and rejected), but now there is **one wrapped texture** built by
`PP.Face.headWrap()`, and `player.js` rewrites the box's `uv` attribute so the
four side faces take **contiguous quarter-slices** of it. The painting runs
round the head continuously and merely creases at the corners.

Things that depend on each other here:

- **The wrap is a plain unrolled band** — `x` around the head, `y` from crown to
  chin, both linear. `FACE_TOP`/`FACE_HEIGHT` and `HEAD_BAND` are simple
  fractions, not angles.
- **The back face's slice runs past 1.0** (`0.875 → 1.125`) so the wrap's own
  seam sits in the middle of it, hidden at the back of his skull. The map must
  therefore have `wrapS = RepeatWrapping`.
- **A sliver at each end of the band is reserved** for the crown and chin faces,
  painted flat and painted *last* so nothing that ran off the band can appear
  on them.
- **The head is unlit** (`MeshBasicMaterial`) while the body is toon-shaded.
  With toon shading each box face gets its own flat tone, so every corner
  becomes a tonal step — half of what read as stitched. The wrap is a drawing
  that already carries its own light.
- **Nothing painted may have a straight vertical edge.** On a box those land
  exactly on a corner and read as a join; the nape is a cosine falloff across
  the full width for that reason.

### His face is straightened in the bake, not faked at runtime

The illustration is a three-quarter view — his head is drawn turned about 30°,
measured off the artwork: his ink outline runs 4%→93% of the crop so his skull's
centreline is at 48.5%, but his pupils put his plane of symmetry at 26%.

`tools/bake-art.py` re-projects it. Treat the drawn head as a cylinder: a
feature at true angle θ appears at `sin(θ + α)` and belongs at `sin(θ)`, so
sampling the source at `sin(asin(x) + α)` per column rotates the face back.
`FACE_STRAIGHTEN` is how much of the turn to undo — **0.5**, chosen off a ladder
of renders; 1.0 is geometrically dead-on but stretches his far cheek ~60% and
visibly widens one eye against the other.

Two things this gets right that are easy to get wrong:

- **Clamp the angle, not the position.** Past ±90° the output is asking for part
  of the head that was hidden behind the silhouette; without clamping `asin(u) +
  α` the sine folds back, the mapping stops being monotone, and background from
  outside his head smears across his face.
- **Recentring is free** — at θ = 0 his nose lands on the axis — *provided*
  `FACE_AXIS` is his skull's centreline and not the crop's midpoint. Get that
  wrong and the whole face slides sideways instead of turning.

An earlier attempt faked this by sliding the artwork round the wrap
(`FACE_YAW_FIX`). That is gone; with the bake doing it properly the two would
fight each other.

### Limb signs### Limb signs

Every limb hangs down `-Y`, so a **positive `rotation.x` swings the lower end
forward** (toward `-Z`). Knees are negative because knees bend backwards.
Elbows must be **positive** — they were negative for a long time, which folded
his forearms behind him and put his fists at his back whatever his shoulders
did. `npm test` pins the sign now.

### Two rendering constraints worth knowing

- **Outlines are inverted hulls** — a back-faced copy of each mesh scaled
  outward. This only works on *closed* geometry. An open-ended cylinder or a
  partial sphere renders its black interior instead, which shows up as dark
  wedges through the model. Build from closed primitives — or, where the shape
  genuinely has to be open, skip the outline. The hair cap and the stage-2
  panels are domes and carry none; with an outline the cap's rim rendered as a
  hard black band straight across his eyebrows.
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
