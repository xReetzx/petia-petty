# assets/

The game ships with **zero binary assets** — every texture is drawn at runtime on a
`<canvas>` and every model is built from Three.js primitives. That's why it runs from
`file://` with no server and no CORS setup.

This folder is a hook for optional extras:

- Drop the original inked character illustration in here as `reetz-ref.png` and the
  title screen will use it as cover art instead of the generated one.
