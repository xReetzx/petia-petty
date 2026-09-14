# Petia Petty

An endless runner where a giant pair of hair clippers is chasing you, and your
hair is the health bar.

Built with [Three.js](https://threejs.org). No build step, no dependencies to
install, no asset files — every texture is drawn on a `<canvas>` at load time
and every model is built from primitives. Open `index.html` and it runs.

## Play

- **Hosted:** _(GitHub Pages link goes here once Pages is enabled)_
- **Locally:** clone the repo and open `index.html` in a browser. That's it.

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Change lane | `A` / `D` (or `←` `→`) | Swipe left / right |
| Jump | `W` (or `↑` / `Space`) | Swipe up, or tap |
| Slide | `S` (or `↓`) | Swipe down |
| Pause | `P` / `Esc` | Pause button |
| Mute | `M` | Speaker button |

## How it works

You run. Things get in the way. Every time you hit something the clippers
gain ground — they don't kill you directly, they just get closer, and the buzz
gets louder and higher as they do. When the chase meter fills they lunge and
take a stage of hair off the top.

Three stages of hair, then you're bald and it's over.

- **Hair tufts** — score, and build a combo every five you collect
- **Regrowth serum** — rare; gives a hair stage back
- **Pomade** — a shield that eats exactly one hit

Speed ramps from 13 to 33 units/sec over about four minutes, and the obstacle
patterns get denser and nastier at 500m, 1200m and 2500m. Spawning enforces two
fairness rules: no pattern ever blocks all three lanes without a jump or slide
solving it, and there's always at least 0.55 seconds of clear runway to react
at whatever the current speed is.

## Project layout

```
index.html        page shell, HUD, overlay screens, styles
src/config.js     every tunable number — speeds, spawn tables, palette
src/utils.js      RNG, pooling, toon materials, inked-outline helper
src/face.js       the character's face, drawn with the canvas 2D API
src/player.js     body, procedural run/jump/slide animation, hair stages
src/clippers.js   the chaser, and the menace value that drives the tension
src/world.js      streamed track chunks, obstacle patterns, pickups, scenery
src/ui.js         HUD and screens
src/game.js       state machine, input, collision, camera, main loop
vendor/           Three.js r128 (MIT), vendored so this runs offline
```

### Notes on a couple of non-obvious choices

**The camera flies backwards ahead of the runner.** It leads him and looks
back, so he runs toward you and you can see his face — and the clippers,
chasing from behind him, are further from the lens than he is and simply grow
as they close. An earlier build had the camera trailing him, which put the
clippers behind the camera where they were invisible for the entire run.

**The camera's lead scales with speed.** The stretch of street between the lens
and the player is the whole runway you get to read an obstacle in, so the
camera backs off as the pace climbs and that runway stays worth about the same
number of seconds at any speed.

**Outlines are inverted-hull, not post-processing.** Each mesh gets a
back-faced copy scaled slightly outward. It costs one extra draw call per
object, needs no addons beyond core Three, and holds up at every camera angle.

**Rendering is deliberately cheap.** No shadow maps (blob shadows instead),
flat cel lighting, pixel ratio capped at 2, and every chunk, obstacle and
pickup comes from an object pool. Frame delta is clamped to 1/30s so a
backgrounded tab doesn't resume by teleporting you into a wall.

## License

MIT — see `LICENSE`. Three.js is MIT too; its license is in `vendor/`.
