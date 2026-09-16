/* Petia Petty — main loop, state machine, input and collision. */
window.PP = window.PP || {};

(function () {
  'use strict';

  const S = { TITLE: 'title', PLAY: 'play', PAUSE: 'pause', OVER: 'over' };

  const G = {
    state: S.TITLE,
    score: 0, metres: 0, combo: 1, comboHits: 0,
    speed: PP.CFG.SPEED_START,
    runTime: 0,
    best: PP.U.store.get('pp.best', 0),
    shake: 0,
    // The un-shaken camera position. Shake is layered on top of this so it
    // never feeds back into its own smoothing.
    camBase: { x: 0, y: PP.CFG.CAM_HEIGHT, z: PP.CFG.CAM_BACK },
    freezeCam: false,
    freezePose: false,
    baseFov: PP.CFG.FOV_BASE,
    lastT: 0,
    raf: 0
  };

  let renderer, scene, camera, player, clippers, world;
  let container, hitFlash;
  const buffered = { jump: 0, slide: 0, lane: 0, laneDir: 0 };

  /* ---------------------------------------------------------------- setup */
  function init() {
    container = document.getElementById('game');

    scene = new THREE.Scene();
    /* Dawn. The sky itself is geometry in `world._buildBackdrop()`; this is
     * the colour behind it and the haze the street dissolves into.
     */
    // `world` sets scene.background to the banded dawn sky once it is built.
    scene.fog = new THREE.Fog(PP.CFG.FOG_COL, PP.CFG.FOG_NEAR, PP.CFG.FOG_FAR);

    camera = new THREE.PerspectiveCamera(PP.CFG.FOV_BASE, 1, 0.1, 400);
    camera.position.set(0, PP.CFG.CAM_HEIGHT, PP.CFG.CAM_BACK);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    /* Lit by the sunrise he is running at.
     *
     * The key used to sit at (4, 9, 6) — behind the camera — so it lit the
     * backs of everything he runs toward and the city read flat. Now the warm
     * key comes from low and down-track, where the sun is, and a cool fill
     * sits behind. That single swap does most of the work of making this look
     * like dawn; the sky is dressing on top of it.
     */
    scene.add(new THREE.HemisphereLight(0xbfc4e8, 0xc99a70, 0.55));
    const sun = new THREE.DirectionalLight(0xffd9a0, 0.85);
    sun.position.set(0.5, 3.5, -14);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x9fb0d8, 0.30);
    fill.position.set(-5, 7, 9);
    scene.add(fill);

    player = new PP.Player(scene);
    clippers = new PP.Clippers(scene);
    world = new PP.World(scene);

    hitFlash = document.getElementById('flash');

    PP.UI.init();
    PP.UI.buildRoster(pickCharacter);
    PP.UI.setBest(G.best);
    PP.UI.setHair(PP.CFG.HAIR_MAX, PP.CFG.HAIR_MAX);
    PP.UI.show('title');

    const muted = PP.U.store.get('pp.muted', false);
    PP.Audio.setMuted(muted);
    PP.UI.setMuted(muted);

    bindInput();
    onResize();
    window.addEventListener('resize', onResize);

    // Park the world in its starting arrangement so the title screen has
    // something to look at rather than an empty street.
    world.reset(0, PP.CFG.SPEED_START);
    clippers.reset();

    G.lastT = performance.now();
    G.raf = requestAnimationFrame(frame);

    window.__PP_PLAYER = player;   // inspection hook
    window.__PP_READY = true;
  }

  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    G.baseFov = framingFov();
    camera.fov = G.baseFov;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  }

  /* On a narrow phone the vertical FOV gives far too little horizontal view,
   * which pushes the outer lanes (and the player) off the edge of the screen.
   * Widen the FOV until the full track width fits, capped so it never turns
   * into a fisheye on very tall displays. */
  function framingFov() {
    const cfg = PP.CFG;
    const dist = cfg.CAM_BACK + cfg.CAM_LOOK_AHEAD * 0.3;
    const needed = 2 * Math.atan(cfg.FRAME_HALF_WIDTH / (camera.aspect * dist)) * 180 / Math.PI;
    return PP.U.clamp(Math.max(cfg.FOV_BASE, needed), cfg.FOV_BASE, cfg.FOV_MAX);
  }

  /* ---------------------------------------------------------------- input */
  // Buffered lane change: fires now if it can, otherwise keeps trying for
  // INPUT_BUFFER seconds. `moveLane` refuses only at the outer lanes, so a
  // queued press survives the tail of a swap that is still finishing.
  function queueLane(dir) {
    if (player.moveLane(dir)) { PP.Audio.sfx.lane(); buffered.lane = 0; return; }
    buffered.lane = PP.CFG.INPUT_BUFFER;
    buffered.laneDir = dir;
  }

  function bindInput() {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'spacebar'].includes(k)) {
        e.preventDefault();
      }
      /* One press, one action.
       *
       * Without this, the OS key-repeat that exists to type "aaaaaa" is
       * wired straight into the controls: holding a direction walks him
       * across every lane, and holding jump re-arms the buffer ~30 times a
       * second so he re-launches on the frame he lands, forever.
       */
      if (e.repeat) return;
      if (k === 'm') { toggleMute(); return; }
      if (k === 'escape' || k === 'p') { togglePause(); return; }

      if (G.state === S.TITLE) { startRun(); return; }
      if (G.state === S.OVER) { if (k === ' ' || k === 'enter' || k === 'r') startRun(); return; }
      if (G.state !== S.PLAY) return;

      // Lane presses go through the same buffer as jump and slide, so a dodge
      // entered a frame early isn't simply dropped.
      if (k === 'arrowleft' || k === 'a') { queueLane(-1); }
      else if (k === 'arrowright' || k === 'd') { queueLane(1); }
      else if (k === 'arrowup' || k === 'w' || k === ' ') { buffered.jump = PP.CFG.INPUT_BUFFER; }
      else if (k === 'arrowdown' || k === 's') { buffered.slide = PP.CFG.INPUT_BUFFER; }
    });

    // --- Touch: swipe, with dominant-axis detection ------------------------
    // Bound to the window rather than the canvas: the title and game-over
    // overlays sit on top of #game, so canvas-only listeners would never see
    // a tap on those screens. Taps that land on a real button are ignored so
    // the on-screen controls don't fire twice.
    let sx = 0, sy = 0, st = 0, swiped = false, fromButton = false;
    const TH = 28;
    const isButton = (t) => !!(t && t.closest && t.closest('button'));

    window.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      sx = t.clientX; sy = t.clientY; st = performance.now();
      swiped = false;
      fromButton = isButton(e.target);
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (swiped || fromButton || G.state !== S.PLAY) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) < TH && Math.abs(dy) < TH) return;
      swiped = true;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (player.moveLane(dx > 0 ? 1 : -1)) PP.Audio.sfx.lane();
      } else if (dy < 0) {
        buffered.jump = PP.CFG.INPUT_BUFFER;
      } else {
        buffered.slide = PP.CFG.INPUT_BUFFER;
      }
    }, { passive: true });

    window.addEventListener('touchend', () => {
      // A quick tap (no swipe) starts the game, or jumps mid-run.
      if (swiped || fromButton) return;
      if (performance.now() - st > 350) return;
      if (G.state === S.TITLE || G.state === S.OVER) startRun();
      else if (G.state === S.PLAY) buffered.jump = PP.CFG.INPUT_BUFFER;
    }, { passive: true });

    // Mouse/trackpad click-to-start on the title and game-over screens, for
    // anyone who reaches for the pointer instead of the keyboard.
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' || isButton(e.target)) return;
      if (G.state === S.TITLE || G.state === S.OVER) startRun();
    });

    document.querySelectorAll('[data-action="play"]').forEach((b) =>
      b.addEventListener('click', startRun));
    document.querySelectorAll('[data-action="resume"]').forEach((b) =>
      b.addEventListener('click', togglePause));
    const mb = document.getElementById('muteBtn');
    if (mb) mb.addEventListener('click', toggleMute);
    const pb = document.getElementById('pauseBtn');
    if (pb) pb.addEventListener('click', togglePause);
  }

  /* Swapping character rebuilds the model in place: colours are read through
   * the roster, so a fresh Player picks up the new palette. */
  function pickCharacter(id) {
    if (!PP.Characters.select(id)) return;
    // The head wrap is painted from the selected palette, so it has to be
    // repainted before the model that samples it is rebuilt.
    PP.Face.refreshHead();
    scene.remove(player.root);
    player = new PP.Player(scene);
    player.reset();
    PP.Audio.sfx.lane();
    PP.UI.markSelected();
    PP.UI.setHair(PP.CFG.HAIR_MAX, PP.CFG.HAIR_MAX);
  }

  function toggleMute() {
    const m = !PP.Audio.isMuted();
    PP.Audio.setMuted(m);
    PP.UI.setMuted(m);
    PP.U.store.set('pp.muted', m);
  }

  function togglePause() {
    if (G.state === S.PLAY) {
      G.state = S.PAUSE;
      PP.Audio.stopBuzz();
      PP.Audio.music.stop();
      PP.UI.show('pause');
    } else if (G.state === S.PAUSE) {
      G.state = S.PLAY;
      PP.Audio.resume();
      PP.Audio.music.start();
      PP.UI.show('play');
      G.lastT = performance.now();
    }
  }

  /* ----------------------------------------------------------------- flow */
  function startRun() {
    PP.Audio.start();       // first gesture — safe to create the AudioContext
    PP.Audio.resume();
    PP.Audio.sfx.start();
    PP.Audio.music.start();

    G.score = 0; G.metres = 0; G.combo = 1; G.comboHits = 0;
    G.speed = PP.CFG.SPEED_START;
    G.runTime = 0; G.shake = 0;

    player.reset();
    clippers.reset();
    world.reset(0, G.speed);

    PP.UI.setHair(PP.CFG.HAIR_MAX, PP.CFG.HAIR_MAX);
    PP.UI.setScore(0, 0, 1);
    PP.UI.setMenace(0);
    PP.UI.show('play');
    G.state = S.PLAY;
    G.lastT = performance.now();
  }

  function endRun() {
    G.state = S.OVER;
    PP.Audio.stopBuzz();
    PP.Audio.music.stop();
    PP.Audio.sfx.dead();
    const final = Math.floor(G.score);
    const isNew = final > G.best;
    if (isNew) { G.best = final; PP.U.store.set('pp.best', final); PP.UI.setBest(final); }
    PP.UI.gameOver(final, G.metres, G.best, isNew);
  }

  /* ------------------------------------------------------------ collision */
  function overlaps(pc, ob, travel) {
    const ud = ob.userData;
    const dz = Math.abs(ob.position.z);
    /* The Z test has to cover the ground the obstacle crossed this frame,
     * not just where it happens to sit now. A fixed +-1.1 window was exactly
     * one frame of travel at SPEED_MAX with dt clamped to 1/30, so the test
     * sat right on the edge of missing an obstacle entirely between frames.
     */
    if (dz > 1.1 + travel * 0.5) return false;        // not at the player yet
    if (Math.abs(pc.x - ob.position.x) > ud.halfW + pc.r * 0.6) return false;
    // Vertical: does the player's current pose intersect the obstacle band?
    return pc.yMin < ud.yMax && pc.yMax > ud.yMin;
  }

  function checkCollisions(dt) {
    const pc = player.collider();
    const travel = G.speed * dt;

    for (const ob of world.obstacles) {
      if (ob.userData.hitDone) continue;
      if (overlaps(pc, ob, travel)) {
        ob.userData.hitDone = true;
        onObstacleHit();
      }
      // Reset the flag once it's safely behind, so pooled objects work again
      if (ob.position.z > 3) ob.userData.hitDone = false;
    }

    for (const p of world.pickups) {
      if (p.userData.taken) continue;
      if (Math.abs(p.position.z) > 1.0) continue;
      if (Math.abs(pc.x - p.position.x) > 1.0) continue;
      const py = p.position.y;
      if (py < pc.yMin - 0.5 || py > pc.yMax + 0.4) continue;
      p.userData.taken = true;
      p.visible = false;
      onPickup(p.userData.kind);
    }
  }

  function onObstacleHit() {
    // An obstacle doesn't cut hair directly — it lets the clippers gain.
    if (player.invuln > 0) return;
    if (player.shield > 0) {
      player.shield = 0;
      player.aura.visible = false;
      player.invuln = 0.6;
      PP.Audio.sfx.shield();
      PP.UI.toast('POMADE SAVED YOU', 'good');
      return;
    }
    player.invuln = 0.45;
    player.stumble = 0.55;
    clippers.addMenace(PP.CFG.MENACE_HIT);
    G.combo = 1; G.comboHits = 0;
    G.shake = 0.55;
    G.speed = Math.max(PP.CFG.SPEED_START, G.speed - 2.4);
    PP.Audio.sfx.hit();
    flash('rgba(217,74,74,0.35)');
    PP.UI.toast('THEY\'RE GAINING', 'bad');
  }

  function onPickup(kind) {
    if (kind === 'tuft') {
      G.comboHits++;
      if (G.comboHits % 5 === 0) G.combo = Math.min(PP.CFG.COMBO_MAX, G.combo + 1);
      G.score += PP.CFG.TUFT_VALUE * G.combo;
      PP.Audio.sfx.coin(G.combo);
      // Collecting hair calms the chase slightly — rewards greed with safety
      clippers.addMenace(-0.012);
    } else if (kind === 'serum') {
      PP.Audio.sfx.serum();
      if (player.hair < PP.CFG.HAIR_MAX) {
        player.setHair(player.hair + 1);
        PP.UI.setHair(player.hair, PP.CFG.HAIR_MAX);
        PP.UI.toast('REGROWTH SERUM +1 HAIR', 'good');
      } else {
        G.score += 250;
        PP.UI.toast('SERUM +250 (FULL HEAD)', 'good');
      }
    } else if (kind === 'pomade') {
      player.giveShield();
      PP.Audio.sfx.shield();
      PP.UI.toast('POMADE SHIELD', 'good');
    }
  }

  function onSnipped() {
    const res = player.takeSnip();
    if (!res) return;
    if (res === 'shielded') {
      PP.Audio.sfx.shield();
      PP.UI.toast('POMADE SAVED YOU', 'good');
      return;
    }
    PP.Audio.sfx.snip();
    G.shake = 1.0;
    G.combo = 1; G.comboHits = 0;
    flash('rgba(20,16,19,0.55)');
    PP.UI.setHair(player.hair, PP.CFG.HAIR_MAX);
    if (res === 'dead') { endRun(); return; }
    PP.UI.toast('SNIP! — ' + player.hair + ' LEFT', 'bad');
  }

  function flash(color) {
    if (!hitFlash) return;
    hitFlash.style.background = color;
    hitFlash.classList.remove('on');
    void hitFlash.offsetWidth;
    hitFlash.classList.add('on');
  }

  /* ------------------------------------------------------------ main loop */
  function frame(now) {
    G.raf = requestAnimationFrame(frame);

    // Clamp dt so a backgrounded tab doesn't teleport the player into a wall.
    let dt = (now - G.lastT) / 1000;
    G.lastT = now;
    if (dt > 1 / 30) dt = 1 / 30;
    if (dt <= 0) return;

    if (G.state === S.PLAY) step(dt);
    else idle(dt);

    renderer.render(scene, camera);
  }

  // Title / pause / game-over: keep the scene gently alive
  function idle(dt) {
    if (G.freezePose) return;                  // held mid-stride for a capture
    if (G.freezeCam) { player.update(dt, 0); return; }
    clippers.update(dt, 0, 0);
    world.update(dt * 3.5, 0, 4);
    player.update(dt, 4);
    const t = performance.now() * 0.0004;
    camera.position.x = Math.sin(t) * 1.6;
    camera.position.y = PP.CFG.CAM_HEIGHT + Math.sin(t * 1.7) * 0.2;
    camera.position.z = PP.CFG.CAM_BACK;
    camera.lookAt(0, PP.CFG.CAM_LOOK_Y, -PP.CFG.CAM_LOOK_AHEAD);
  }

  function step(dt) {
    const cfg = PP.CFG, U = PP.U;
    G.runTime += dt;

    // Speed ramps on an eased curve toward SPEED_MAX
    const rampT = U.clamp(G.runTime / cfg.SPEED_RAMP_TIME, 0, 1);
    const target = U.lerp(cfg.SPEED_START, cfg.SPEED_MAX, U.easeOutCubic(rampT));
    G.speed = U.damp(G.speed, target, 0.8, dt);

    const dz = G.speed * dt;
    G.metres += dz;
    G.score += dz * 1.0;

    // Buffered inputs: a press just before landing still fires.
    if (buffered.jump > 0) {
      buffered.jump -= dt;
      if (player.jump()) { buffered.jump = 0; PP.Audio.sfx.jump(); }
    }
    if (buffered.slide > 0) {
      buffered.slide -= dt;
      if (player.grounded && player.slide()) { buffered.slide = 0; PP.Audio.sfx.slide(); }
    }
    if (buffered.lane > 0) {
      buffered.lane -= dt;
      if (player.moveLane(buffered.laneDir)) { buffered.lane = 0; PP.Audio.sfx.lane(); }
    }

    player.update(dt, G.speed, clippers.menace);
    world.update(dz, G.metres, G.speed);
    checkCollisions(dt);

    const connected = clippers.update(dt, player.x, G.speed);
    if (connected) onSnipped();

    PP.Audio.setMenace(clippers.menace);
    PP.Audio.music.setIntensity(
      U.clamp((G.speed - cfg.SPEED_START) / (cfg.SPEED_MAX - cfg.SPEED_START), 0, 1),
      clippers.menace
    );
    PP.UI.setScore(G.score, G.metres, G.combo);
    PP.UI.setMenace(clippers.menace);

    updateCamera(dt);
  }

  function updateCamera(dt) {
    const cfg = PP.CFG, U = PP.U;
    const sN = U.clamp(
      (G.speed - cfg.SPEED_START) / (cfg.SPEED_MAX - cfg.SPEED_START), 0, 1);

    // Camera trails the player laterally rather than locking to him — makes
    // lane changes feel like movement instead of the world sliding. On narrow
    // screens it follows more closely so he stays comfortably in frame.
    const follow = camera.aspect < 1 ? 0.78 : 0.52;

    /* The smoothed follow position is tracked separately from what the
     * camera is actually set to. Damping from camera.position would be
     * damping from a value that already has this frame's random shake
     * baked into it, which quietly turns a shake into a drift.
     */
    G.camBase.x = U.damp(G.camBase.x, player.x * follow, 6, dt);
    // Dip on landing, so an impact is felt and not just seen
    const landDip = player.landT > 0
      ? (player.landT / cfg.LAND_TIME) * player.landImpact * cfg.CAM_LAND_DIP : 0;
    G.camBase.y = U.damp(
      G.camBase.y,
      cfg.CAM_HEIGHT + player.y * 0.3 + (player.sliding ? -0.3 : 0) - landDip,
      7, dt
    );
    // Pull back a touch at speed so the frame opens up as the run gets fast
    G.camBase.z = U.damp(G.camBase.z, cfg.CAM_BACK + sN * cfg.CAM_BACK_SPEED, 3, dt);

    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * cfg.SHAKE_DECAY);
    const s = G.shake * G.shake;
    camera.position.set(
      G.camBase.x + (Math.random() - 0.5) * s * 0.85,
      G.camBase.y + (Math.random() - 0.5) * s * 0.85,
      G.camBase.z
    );
    // Aim down the street he's running into.
    camera.lookAt(
      player.x * (camera.aspect < 1 ? 0.5 : 0.3),
      cfg.CAM_LOOK_Y + player.y * 0.45,
      -cfg.CAM_LOOK_AHEAD
    );

    /* FOV widens with speed and punches in as the clippers close. Speed used
     * to change nothing at all here — he could be going two and a half times
     * as fast as he started and the lens never acknowledged it, which is a
     * large part of why the run stopped feeling fast well before it stopped
     * getting faster.
     */
    const fov = G.baseFov + sN * cfg.FOV_SPEED
      + U.easeOutCubic(clippers.menace) * cfg.FOV_MENACE;
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov = U.damp(camera.fov, fov, 4, dt);
      camera.updateProjectionMatrix();
    }
  }

  /* ------------------------------------------- debug hooks (test harness) */
  window.__PP_DEBUG = {
    state: () => G.state,
    stats: () => ({
      state: G.state, score: Math.floor(G.score), metres: Math.floor(G.metres),
      combo: G.combo, hair: player.hair, menace: +clippers.menace.toFixed(3),
      speed: +G.speed.toFixed(2), shield: +player.shield.toFixed(2),
      best: G.best, obstacles: world.obstacles.length, pickups: world.pickups.length
    }),
    start: startRun,
    forceSnip: () => { player.invuln = 0; onSnipped(); },
    /* Drop any shield. The street is busy enough now that a run can pick up a
     * pomade mid-test, and a shield makes `takeSnip` return 'shielded' and
     * leave the hair alone — which reads as a hair bug and is not one. Tests
     * that care about hair call this first; the shield test deliberately does
     * not.
     */
    clearShield: () => { player.shield = 0; player.aura.visible = false; },
    forceHit: () => { player.invuln = 0; onObstacleHit(); },
    giveShield: () => player.giveShield(),
    givePickup: (k) => onPickup(k),
    setMenace: (m) => { clippers.menace = m; },
    // Jump the speed ramp to a given speed, and move runTime with it so the
    // ramp target doesn't simply damp it straight back down again.
    setSpeed: (v) => {
      const cfg = PP.CFG;
      const y = PP.U.clamp((v - cfg.SPEED_START) / (cfg.SPEED_MAX - cfg.SPEED_START), 0, 1);
      G.runTime = (1 - Math.cbrt(1 - y)) * cfg.SPEED_RAMP_TIME;
      G.speed = v;
    },
    kill: () => {
      player.invuln = 0; player.shield = 0; player.aura.visible = false;
      player.setHair(1); onSnipped();
    },
    lane: () => player.targetLane,
    playerY: () => +player.y.toFixed(3),
    sliding: () => player.sliding,
    musicPlaying: () => PP.Audio.music.playing,
    character: () => PP.Characters.id,
    pickCharacter: (id) => pickCharacter(id),
    rosterCount: () => document.querySelectorAll('.char-card').length,
    /* World-space head yaw. The head's own rotation cancels the run's
     * shoulder twist, so reading it alone would report the cancellation
     * rather than where he is actually looking. */
    headYaw: () => +(player.head.rotation.y + player.chest.rotation.y).toFixed(3),
    /* Run-cycle probes. Feel bugs are silent — every one of them passed the
     * whole suite while broken — so the parts of the cycle that can be
     * measured, are.
     */
    rig: () => ({
      bob: +player.body.position.y.toFixed(4),
      hipYaw: +player.pelvis.rotation.y.toFixed(4),
      // The look-back twist rides on the same group, so subtract it out to
      // read the run's own counter-rotation.
      chestYaw: +(player.chest.rotation.y - (player.twist || 0)).toFixed(4),
      cadence: +(player.cadence || 0).toFixed(3),
      lean: +player.body.rotation.x.toFixed(4),
      thigh: player.legs.map((l) => +l.pivot.rotation.x.toFixed(4)),
      ankle: player.legs.map((l) => +l.foot.rotation.x.toFixed(4)),
      landT: +player.landT.toFixed(4)
    }),
    /* Elbow flexion per arm, in the arm's own frame.
     *
     * Limbs hang down -Y, so a POSITIVE rotation.x swings the lower end
     * toward -Z, which is forward. Knees are correctly negative because knees
     * bend backwards; every elbow had the same sign, so his forearms folded
     * behind him — "his arms look backwards".
     *
     * Deliberately measured here and not in world space: at the back of a
     * stride the whole arm trails behind him, so a world-space fist-versus-
     * elbow test fails on a perfectly correct arm. The sign of the joint is
     * the thing that was wrong and the thing worth pinning.
     */
    elbows: () => player.arms.map((a) => +a.fore.rotation.x.toFixed(3)),
    // The head is one mesh under one texture. A material ARRAY here means the
    // six-faced box is back, and with it the stitched-together look.
    headInfo: () => ({
      materials: Array.isArray(player.skull.material) ? player.skull.material.length : 1,
      geometry: player.skull.geometry.type
    }),
    /* Render budget.
     *
     * Every object in this game costs two draw calls — the toon pass and its
     * inverted-hull outline — and nothing was instanced or merged, so the
     * scene was already carrying well over a thousand meshes before the city
     * got busier. This is measured rather than estimated, and the suite holds
     * a ceiling on it, because a frame rate that quietly halves is exactly the
     * kind of regression that ships green here.
     */
    render: () => ({
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      meshes: (() => { let n = 0; scene.traverse((o) => { if (o.isMesh) n++; }); return n; })(),
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures
    }),
    /* Every obstacle kind's collision band, next to the archetype it claims.
     *
     * The suite checks these against the jump apex and the slide height. A
     * kind whose band does not match its archetype — a "jump" obstacle taller
     * than he can jump — is an unavoidable hit, and nothing in this project
     * validated that in code or in tests until now. With nine kinds instead of
     * three, that is no longer a risk worth carrying.
     */
    obstacleKinds: () => {
      const out = {};
      const W = PP.World;
      Object.keys(W.OB).forEach((k) => {
        const kind = W.OB[k];
        const m = world.obPools[kind].get();
        out[kind] = {
          archetype: W.ARCHETYPE[kind],
          yMin: m.userData.yMin, yMax: m.userData.yMax, halfW: m.userData.halfW
        };
        world.obPools[kind].put(m);
      });
      return out;
    },
    // Z of every live obstacle, for checking spacing holds across chunk seams
    obstacleZs: () => world.obstacles.map((o) => +o.position.z.toFixed(2)),
    // World-space Y of each foot, for checking ground contact
    feetY: () => player.legs.map((l) => {
      const v = new THREE.Vector3();
      l.foot.updateWorldMatrix(true, false);
      v.setFromMatrixPosition(l.foot.matrixWorld);
      return +v.y.toFixed(3);
    }),
    vy: () => +player.vy.toFixed(3),
    airborne: () => !player.grounded,
    /* Horizontal gap between the clippers and the player in normalised screen
     * space. The whole point of hunting from the side is that this stays
     * positive, so the harness checks it rather than trusting the geometry. */
    clipperGap: () => {
      const a = new THREE.Vector3().setFromMatrixPosition(player.root.matrixWorld).project(camera);
      const b = new THREE.Vector3().setFromMatrixPosition(clippers.root.matrixWorld).project(camera);
      return +(Math.abs(b.x - a.x)).toFixed(3);
    },
    setHair: (n) => { player.setHair(n); PP.UI.setHair(player.hair, PP.CFG.HAIR_MAX); },
    // Park the camera behind his head — used only to inspect the scalp
    // Orbit the character for a turnaround sheet: angle in degrees, 0 = front
    poseCam: (angleDeg, dist, height, lookY) => {
      G.freezeCam = true;
      G.state = S.PAUSE;
      const a = angleDeg * Math.PI / 180;
      camera.position.set(Math.sin(a) * dist, height, Math.cos(a) * dist);
      camera.lookAt(0, lookY, 0);
      camera.fov = 30;
      camera.updateProjectionMatrix();
    },
    /* Hold him at an exact point in the stride so a capture can walk the
     * whole cycle frame by frame. A run cycle cannot be reviewed from a
     * single still — you need the strip — and the game will not sit still
     * on its own.
     *
     * Settle the damped values first, then set the phase and animate with
     * dt = 0: damp() is a no-op at zero dt, so everything periodic snaps to
     * the requested phase while everything smoothed stays where it settled.
     */
    stridePose: (u, speed) => {
      G.state = S.PAUSE;
      G.freezeCam = true;
      G.freezePose = true;
      player.grounded = true; player.sliding = false;
      player.x = 0; player.y = 0; player.vy = 0; player.landT = 0;
      player.lookT = 0; player.twist = 0; player.stumble = 0;
      player.head.rotation.set(0, 0, 0);
      for (let i = 0; i < 40; i++) player._animate(1 / 60, speed, 0);
      player.runPhase = u * Math.PI * 2;
      player._animate(0, speed, 0);
      player.root.position.set(0, 0, 0);
    },
    // Freeze the nervous glance, so a turnaround shows him square rather than
    // catching him mid-look-back
    faceForward: () => { player.lookT = 0; player.head.rotation.set(0, 0, 0); player.twist = 0; },
    hideWorld: () => {
      scene.traverse((o) => {
        if (o.isMesh && !player.root.getObjectById(o.id)) o.visible = false;
      });
      player.root.traverse((o) => { if (o.isMesh) o.visible = true; });
      clippers.root.visible = false;
      scene.background = new THREE.Color(0xf4efe4);
      scene.fog = null;
    },
    headCam: () => {
      G.freezeCam = true;
      G.state = S.PAUSE;
      camera.position.set(0.85, 3.05, 2.4);
      camera.lookAt(0, 2.08, 0);
    },
    fov: () => +camera.fov.toFixed(1),
    camZ: () => +camera.position.z.toFixed(2),
    // Dot of the player's facing direction (his front is -Z) against the
    // direction from him to the camera. Positive means we're seeing his face.
    facingCamera: () => {
      const toCam = new THREE.Vector3().subVectors(camera.position, player.root.position).normalize();
      const forward = new THREE.Vector3(0, 0, -1);
      return +forward.dot(toCam).toFixed(3);
    }
  };

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
