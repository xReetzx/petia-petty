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
| Playable link | published Artifact (see the session it was published from) |
| Planned hosting | GitHub Pages, `main` / root → `xreetzx.github.io/petia-petty` |

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
- **Camera leads the runner.** It flies backwards ahead of him looking back, so
  you see his face and the clippers behind him. An earlier build trailed him,
  which put the clippers behind the camera and invisible for the whole run.
- **Art direction: inked comic.** Cel shading, inverted-hull black outlines,
  cream paper sky. Taken from the hand-drawn character reference.
- **Character is rebuilt in-engine.** The original illustration was never on
  disk. Toon-shaded body, drawn face texture. Drop the original into
  `assets/reetz-ref.png` to use the real artwork on the title card.

## Current state

Complete and playable. 45 automated checks pass in Chromium.

- Three lanes, jump and slide, speed 13 → 33 over about four minutes
- Traffic obstacles: low car (vault), flatbed rig (slide under), box van (dodge)
- Hair tufts for score and combo, serum regrows a stage, pomade shields one hit
- Clippers close on every hit, lunge at full menace, take a hair stage
- Synthesized WebAudio, keyboard (WASD and arrows) and touch, best score saved

## Outstanding

- **Push to GitHub.** The repo could not be created from the build session —
  the GitHub integration returned 403 on repo creation. Commits are ready
  locally. Someone needs to create an empty public `petia-petty` (no README,
  gitignore or license — the repo has all three), then push.
- **Enable Pages** once pushed: Settings → Pages → Deploy from a branch →
  `main` / `/ (root)`.

## Working on it

```bash
# run it
python3 -m http.server 8000        # then open http://127.0.0.1:8000
# or just open index.html — there is no build step
```

Tuning lives in `src/config.js`; almost every number worth changing is there.
`window.__PP_DEBUG` exposes hooks used by the test harness (`stats()`,
`forceSnip()`, `givePickup()`, `setMenace()`, `lane()`, `facingCamera()`).

Two things worth knowing before changing visuals:

- Screenshots catch what tests cannot. Every visual bug in this project's
  history — the character facing backwards, the clippers off-screen, buildings
  filling the frame, alopecia patches that did not punch through — passed the
  test suite the entire time it was broken. Look at the render.
- The face is the focal point now that the camera faces him. It is a 512×512
  canvas texture; render it on its own at full size when editing, not just
  in-game where it is 80 pixels tall.
