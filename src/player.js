/* The runner: toon-shaded body, inked outlines, a drawn face, and hair that
 * is literally the health bar. */
window.PP = window.PP || {};

PP.Player = (function () {
  'use strict';

  const U = () => PP.U;

  // Where the body splits. HIP_Y is the hip line the legs pivot around;
  // SPINE_Y is the base of the spine the upper body counter-rotates about.
  const HIP_Y = 0.72;
  const SPINE_Y = 1.0;
  // Colours come from the selected character, so adding a character is data
  // rather than another branch in here.
  const C = () => new Proxy(PP.CFG.COL, {
    get(target, key) {
      const cc = PP.Characters && PP.Characters.current().colors;
      return (cc && cc[key] != null) ? cc[key] : target[key];
    }
  });

  function Player(scene) {
    this.root = new THREE.Group();
    scene.add(this.root);

    this.lane = 1;
    this.targetLane = 1;
    this.laneT = 1;         // 0..1 progress of the current lane swap
    this.laneFrom = PP.CFG.LANE_X[1];
    this.x = PP.CFG.LANE_X[1];

    this.y = 0;
    this.vy = 0;
    this.grounded = true;
    this.sliding = false;
    this.slideT = 0;
    this.airT = 0;          // time since leaving the ground (coyote)

    this.hair = PP.CFG.HAIR_MAX;
    this.invuln = 0;
    this.shield = 0;
    this.stumble = 0;       // >0 while doing the look-back animation
    this.runPhase = 0;
    this.lookT = 0;          // drives the periodic glance over the shoulder
    this.jumped = false;     // true while airborne from an actual jump
    this.landT = 0;          // counts down while absorbing a landing
    this.landImpact = 0;     // 0..1, how hard the last landing was
    this.chestYaw = 0;
    this.dead = false;

    this._build();
    this.setHair(this.hair);
  }

  Player.prototype._build = function () {
    const U_ = U(), c = C();
    const body = new THREE.Group();
    this.body = body;
    this.root.add(body);

    /* The character splits at the waist.
     *
     * A run reads as a run mostly because the hips and the shoulders rotate
     * *against* each other — right leg forward, left arm forward, spine
     * wound between them. With arms and legs hanging off one group that
     * counter-rotation is impossible to express, and what you get instead is
     * a wind-up toy marching. So `pelvis` and `chest` sit between the body
     * and the limbs, and the run cycle yaws them in opposite directions.
     *
     * `body` stays the whole-character transform: bob, lean, lane roll.
     */
    const pelvis = new THREE.Group();
    pelvis.position.y = HIP_Y;
    body.add(pelvis);
    this.pelvis = pelvis;

    const chest = new THREE.Group();
    chest.position.y = SPINE_Y;
    body.add(chest);
    this.chest = chest;

    // --- Torso: maroon tee ------------------------------------------------
    const torso = U_.inked(new THREE.BoxGeometry(1.06, 0.96, 0.66), c.shirt, 0.075);
    torso.position.y = 1.12 - SPINE_Y;
    chest.add(torso);

    // Shoulders rounded off so the silhouette isn't a pure box
    const shoulders = U_.inked(new THREE.CylinderGeometry(0.36, 0.36, 1.1, 12), c.shirt, 0.06);
    shoulders.rotation.z = Math.PI / 2;
    shoulders.position.y = 1.5 - SPINE_Y;
    chest.add(shoulders);

    // --- Head -------------------------------------------------------------
    const head = new THREE.Group();
    head.position.y = 2.02 - SPINE_Y;
    chest.add(head);
    this.head = head;

    // A touch wider than tall so it reads as a head rather than a slab.
    // Proportioned to the artwork crop in tools/bake-art.py, so his face
    // maps onto the front of the head without being stretched.
    const skullGeo = new THREE.BoxGeometry(0.88, 0.98, 0.74);

    // BoxGeometry material order is [+X, -X, +Y, -Y, +Z, -Z]. He runs toward
    // -Z, so -Z is his front. Every face gets its own drawn texture: a
    // turnaround showed that with only the front painted, the sides and back
    // were bare skin slabs — and the chase camera looks at the back of his
    // head for the entire run, so that was the view that mattered most.
    const faceMat  = U_.toonMat(0xffffff, { map: PP.Face.get('panic') });
    const sideTex = PP.Face.side();
    const sideMatL = U_.toonMat(0xffffff, { map: sideTex });
    // Mirror for the far side so the ear faces forward on both. The clone
    // shares the same canvas image, so it picks up the artwork when it
    // decodes just as the original does.
    const mirrored = sideTex.clone();
    mirrored.wrapS = THREE.RepeatWrapping;
    mirrored.repeat.x = -1;
    mirrored.needsUpdate = true;
    const sideMatR = U_.toonMat(0xffffff, { map: mirrored });
    const backMat  = U_.toonMat(0xffffff, { map: PP.Face.back() });
    const underMat = U_.toonMat(0xffffff, { map: PP.Face.under() });
    const topMat   = U_.toonMat(c.hair);

    const skull = new THREE.Mesh(skullGeo,
      [sideMatR, sideMatL, topMat, underMat, backMat, faceMat]);
    U_.outline(skull, 0.07);
    head.add(skull);
    this.skull = skull;
    this.faceMat = faceMat;

    // Ears, sitting proud of the drawn ones on the side textures
    [-1, 1].forEach((s) => {
      const ear = U_.inked(new THREE.SphereGeometry(0.12, 8, 6), c.skin, 0.04);
      ear.position.set(s * 0.45, -0.02, 0.02);
      ear.scale.set(0.5, 1.05, 0.8);
      head.add(ear);
    });

    /* No 3D beard any more.
     *
     * The cluster of spheres here existed because the face was painted flat on
     * one side of a box and needed framing. His face is now the reference
     * illustration itself, beard and all, so geometry on top of it only
     * competes with the drawing. The sides and back of the head carry beard in
     * their own textures, toned from the same sampled palette.
     */

    // Hair lives on the head so it follows the look-back twist.
    this.hairGroup = new THREE.Group();
    head.add(this.hairGroup);

    // --- Arms -------------------------------------------------------------
    this.arms = [];
    [-1, 1].forEach((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.58, 1.45 - SPINE_Y, 0);
      chest.add(pivot);
      const upper = U_.inked(new THREE.BoxGeometry(0.25, 0.62, 0.25), c.shirt, 0.05);
      upper.position.y = -0.31;
      pivot.add(upper);
      const fore = new THREE.Group();
      fore.position.y = -0.52;
      pivot.add(fore);
      const lower = U_.inked(new THREE.BoxGeometry(0.19, 0.42, 0.19), c.skin, 0.05);
      lower.position.y = -0.21;
      fore.add(lower);
      const fist = U_.inked(new THREE.SphereGeometry(0.125, 8, 6), c.skin, 0.045);
      fist.position.y = -0.46;
      fore.add(fist);
      this.arms.push({ pivot, fore, side: s });
    });

    // --- Legs -------------------------------------------------------------
    this.legs = [];
    [-1, 1].forEach((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.25, 0, 0);
      pelvis.add(pivot);
      const thigh = U_.inked(new THREE.BoxGeometry(0.3, 0.46, 0.3), c.jeans, 0.05);
      thigh.position.y = -0.23;
      pivot.add(thigh);
      const shin = new THREE.Group();
      shin.position.y = -0.46;
      pivot.add(shin);
      const calf = U_.inked(new THREE.BoxGeometry(0.24, 0.44, 0.24), c.jeans, 0.05);
      calf.position.y = -0.22;
      shin.add(calf);
      // The shoe hangs off an ankle rather than being welded to the shin. A
      // rigid foot is the single loudest "this is a doll" tell: without a
      // toe-off at push and a flatten at contact the foot just skims the
      // ground, whatever the rest of the leg is doing.
      const foot = new THREE.Group();
      foot.position.y = -0.40;
      shin.add(foot);
      const shoe = U_.inked(new THREE.BoxGeometry(0.28, 0.17, 0.42), c.shoe, 0.05);
      shoe.position.set(0, -0.085, 0.07);
      foot.add(shoe);
      this.legs.push({ pivot, shin, foot, side: s });
    });

    // --- Blob shadow (cheaper and more "drawn" than a real shadow map) ----
    const sh = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 18),
      new THREE.MeshBasicMaterial({ color: 0x141013, transparent: true, opacity: 0.3 })
    );
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.02;
    this.root.add(sh);
    this.shadow = sh;

    // --- Shield aura (pomade) ---------------------------------------------
    const aura = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 16, 12),
      new THREE.MeshBasicMaterial({
        color: c.pomade, transparent: true, opacity: 0.22,
        side: THREE.DoubleSide, depthWrite: false
      })
    );
    aura.position.y = 1.1;
    aura.visible = false;
    this.root.add(aura);
    this.aura = aura;
  };

  /* ---- Hair: this is the health bar ------------------------------------
   *
   * The camera sits behind him, so the top of his head is the part the player
   * looks at all run. Each hit from the clippers mows a visible swath off it:
   *
   *   3  full messy mop
   *   2  a strip buzzed clean through the middle, scalp showing
   *   1  horseshoe only — the whole crown is gone
   *   0  bald, and the run is over
   *
   * A bare scalp dome always sits under the hair so the shaved areas read as
   * skin rather than as holes in the mesh.
   */
  Player.prototype.setHair = function (n, opts) {
    const U_ = U(), c = C();
    const prev = this.hair;
    this.hair = Math.max(0, Math.min(PP.CFG.HAIR_MAX, n));

    while (this.hairGroup.children.length) {
      this.hairGroup.remove(this.hairGroup.children[0]);
    }

    // Scalp: always present, so a buzzed patch shows skin underneath
    if (!this.scalp) {
      this.scalp = U_.inked(
        new THREE.SphereGeometry(0.48, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
        c.skin, 0.045
      );
      this.scalp.position.set(0, 0.2, 0.1);
      this.scalp.scale.set(0.96, 0.9, 0.9);
      this.head.add(this.scalp);
    }

    if (this.hair > 0) this._buildHair(this.hair);

    // Puff of clippings whenever hair is actually lost
    if (opts && opts.puff && this.hair < prev) this._puffClippings();
  };

  Player.prototype._buildHair = function (stage) {
    const U_ = U(), c = C();
    // Deterministic, so he has the same haircut every run rather than
    // re-rolling a new one each time.
    const rand = U_.rng(1337);

    const spike = (x, y, z, h, tilt) => {
      const m = U_.inked(new THREE.ConeGeometry(0.105, h, 5), c.hair, 0.045);
      m.position.set(x, y, z);
      m.rotation.set(tilt[0], 0, tilt[1]);
      this.hairGroup.add(m);
    };

    if (stage === 3) {
      // Full mop: cap plus spikes all over
      const cap = U_.inked(
        new THREE.SphereGeometry(0.52, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
        c.hair, 0.06
      );
      cap.position.set(0, 0.2, 0.13);
      cap.scale.set(1.0, 0.95, 0.94);
      this.hairGroup.add(cap);

      // A separate slab down the back of the skull, which the shell alone
      // no longer reaches now that its sweep stops at the hairline.
      const nape = U_.inked(
        new THREE.SphereGeometry(0.46, 12, 10, 0, Math.PI, Math.PI * 0.25, Math.PI * 0.45),
        c.hair, 0.05
      );
      nape.position.set(0, 0.16, 0.2);
      nape.rotation.y = -Math.PI / 2;
      nape.scale.set(1.0, 1.0, 0.85);
      this.hairGroup.add(nape);

      // Overlapping lumps that break up the dome. A smooth cap read as a
      // helmet; the reference's hair is a messy irregular mass, and a handful
      // of offset blobs gets most of the way there for almost nothing.
      const rh = U_.rng(4242);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + rh() * 0.5;
        const lump = U_.inked(new THREE.SphereGeometry(0.2 + rh() * 0.09, 8, 7), c.hair, 0.05);
        lump.position.set(
          Math.cos(a) * (0.2 + rh() * 0.13),
          0.3 + rh() * 0.13,
          Math.sin(a) * (0.18 + rh() * 0.12) + 0.1
        );
        lump.scale.set(1, 0.78 + rh() * 0.3, 1);
        this.hairGroup.add(lump);
      }

      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + rand() * 0.4;
        const r = 0.1 + rand() * 0.22;
        spike(Math.cos(a) * r, 0.5 + rand() * 0.07, Math.sin(a) * r * 0.85 - 0.03,
              0.26 + rand() * 0.22, [(rand() - 0.5) * 0.9, (rand() - 0.5) * 0.9]);
      }
      return;
    }

    if (stage === 2) {
      // One clean strip mown straight through the middle. Built as two
      // side panels with a gap, so the bare scalp shows down the centre.
      [-1, 1].forEach((side) => {
        const panel = U_.inked(
          new THREE.SphereGeometry(0.48, 10, 8, 0, Math.PI, 0, Math.PI * 0.5),
          c.hair, 0.055
        );
        panel.position.set(side * 0.15, 0.24, 0.05);
        panel.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        panel.scale.set(0.78, 0.86, 0.96);
        this.hairGroup.add(panel);
      });
      // Surviving spikes, only out at the sides
      for (let i = 0; i < 9; i++) {
        const side = i % 2 ? 1 : -1;
        const r = 0.22 + rand() * 0.14;
        const a = (rand() - 0.5) * 2.2;
        spike(side * r, 0.46 + rand() * 0.06, Math.sin(a) * 0.26,
              0.2 + rand() * 0.18, [(rand() - 0.5) * 0.8, side * 0.35]);
      }
      return;
    }

    // stage 1 — horseshoe: crown completely gone, a band round the back
    // and sides only.
    const band = U_.inked(
      new THREE.TorusGeometry(0.38, 0.09, 7, 18, Math.PI * 1.35),
      c.hair, 0.045
    );
    band.position.set(0, 0.14, 0.05);
    band.rotation.set(Math.PI / 2, 0, -Math.PI * 0.18);
    band.scale.set(1.12, 1.0, 1.0);
    this.hairGroup.add(band);

    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.25 + (i / 5) * 1.0);
      spike(Math.cos(a) * 0.33, 0.24 + rand() * 0.04, Math.sin(a) * 0.3,
            0.15 + rand() * 0.1, [(rand() - 0.5) * 0.6, (rand() - 0.5) * 0.6]);
    }
  };

  /* A burst of clippings thrown off the scalp when the clippers connect. */
  Player.prototype._puffClippings = function () {
    const U_ = U(), c = C();
    if (!this.clippings) {
      this.clippings = [];
      for (let i = 0; i < 22; i++) {
        const bit = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, 0.012, 0.05),
          new THREE.MeshBasicMaterial({ color: c.hair, transparent: true })
        );
        bit.visible = false;
        this.root.add(bit);
        this.clippings.push({ mesh: bit, vel: new THREE.Vector3(), life: 0 });
      }
    }
    for (const cl of this.clippings) {
      cl.mesh.visible = true;
      cl.mesh.position.set((Math.random() - 0.5) * 0.4, 2.35, (Math.random() - 0.5) * 0.4);
      cl.vel.set((Math.random() - 0.5) * 3.4, 1.4 + Math.random() * 2.6, (Math.random() - 0.5) * 2.2 + 1.2);
      cl.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      cl.life = 0.85 + Math.random() * 0.5;
    }
  };

  Player.prototype._updateClippings = function (dt) {
    if (!this.clippings) return;
    for (const cl of this.clippings) {
      if (cl.life <= 0) continue;
      cl.life -= dt;
      if (cl.life <= 0) { cl.mesh.visible = false; continue; }
      cl.vel.y -= 9 * dt;
      cl.mesh.position.addScaledVector(cl.vel, dt);
      cl.mesh.rotation.x += dt * 7;
      cl.mesh.rotation.z += dt * 5;
      cl.mesh.material.opacity = Math.min(1, cl.life * 2);
    }
  };

  Player.prototype.reset = function () {
    this.lane = this.targetLane = 1;
    this.laneT = 1;
    this.x = this.laneFrom = PP.CFG.LANE_X[1];
    this.y = 0; this.vy = 0;
    this.grounded = true; this.sliding = false; this.slideT = 0; this.airT = 0;
    this.invuln = 0; this.shield = 0; this.stumble = 0; this.dead = false;
    this.runPhase = 0; this.lookT = 0;
    this.jumped = false; this.landT = 0; this.landImpact = 0;
    this._lastX = undefined;
    this.setHair(PP.CFG.HAIR_MAX);
    this.aura.visible = false;
    this.body.visible = true;   // clear any half-finished invuln blink
    this.root.rotation.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
    this.twist = 0;
    this.chestYaw = 0;
    this.headYawT = 0;
    this.pelvis.rotation.set(0, 0, 0);
    this.chest.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
  };

  /* ---- Input ----------------------------------------------------------- */
  Player.prototype.moveLane = function (dir) {
    const next = PP.U.clamp(this.targetLane + dir, 0, 2);
    if (next === this.targetLane) return false;
    this.laneFrom = this.x;
    this.targetLane = next;
    this.laneT = 0;
    return true;
  };

  Player.prototype.jump = function () {
    /* Coyote time: a jump pressed just after leaving the ground still counts.
     *
     * The `jumped` flag is what makes that safe. Gating on airT alone looks
     * right and is not: airT is zero at the instant of take-off, so a second
     * press inside the coyote window passed the test and re-set vy, handing
     * out a free 90ms double jump.
     */
    if (!this.grounded && (this.jumped || this.airT > PP.CFG.COYOTE_TIME)) {
      return false;
    }
    this.vy = PP.CFG.JUMP_V;
    this.grounded = false;
    this.jumped = true;
    this.sliding = false;
    this.slideT = 0;
    return true;
  };

  Player.prototype.slide = function () {
    if (this.sliding) return false;
    this.sliding = true;
    this.slideT = PP.CFG.SLIDE_TIME;
    if (!this.grounded) this.vy = Math.min(this.vy, -14); // slam down to slide
    return true;
  };

  /* ---- Per-frame ------------------------------------------------------- */
  Player.prototype.update = function (dt, speed, menace) {
    const cfg = PP.CFG, U_ = U();

    // Lane interpolation
    if (this.laneT < 1) {
      this.laneT = Math.min(1, this.laneT + dt / cfg.LANE_SWAP_TIME);
      const t = U_.easeInOutQuad(this.laneT);
      this.x = U_.lerp(this.laneFrom, cfg.LANE_X[this.targetLane], t);
      if (this.laneT >= 1) this.lane = this.targetLane;
    }

    // Gravity
    this.vy += cfg.GRAVITY * dt;
    this.y += this.vy * dt;
    if (this.y <= 0) {
      /* Touchdown. Grab the impact before the clamp discards it — without
       * this, a landing frame is arithmetically identical to any other
       * grounded frame and there is nothing left to animate a landing with.
       */
      if (!this.grounded) {
        this.landImpact = U_.clamp(-this.vy / Math.abs(cfg.JUMP_V), 0, 1);
        this.landT = cfg.LAND_TIME;
        // Land on a foot, not mid-scissor: snap to the nearer of the two
        // contact phases in the cycle.
        this.runPhase = Math.round(this.runPhase / Math.PI) * Math.PI;
      }
      this.y = 0;
      this.vy = 0;
      this.grounded = true;
      this.jumped = false;
      this.airT = 0;
    } else {
      this.grounded = false;
      this.airT += dt;
    }
    if (this.landT > 0) this.landT -= dt;

    // Slide timer
    if (this.sliding) {
      this.slideT -= dt;
      if (this.slideT <= 0) this.sliding = false;
    }

    if (this.invuln > 0) this.invuln -= dt;
    if (this.shield > 0) {
      this.shield -= dt;
      if (this.shield <= 0) this.aura.visible = false;
    }
    if (this.stumble > 0) this.stumble -= dt;

    this.root.position.set(this.x, this.y, 0);
    this._updateClippings(dt);
    this._animate(dt, speed, menace);
  };

  /* ---- The run cycle ----------------------------------------------------
   *
   * Phase conventions, because every sign in here depends on them:
   *   - He faces -Z. A positive `rotation.x` on a limb pivot swings that
   *     limb FORWARD; a negative one swings it back.
   *   - `runPhase` advances 2*PI per full cycle, and a full cycle is TWO
   *     steps. The two legs are half a cycle apart.
   *   - `u` is that phase as 0..1, per leg. u = 0 is foot contact.
   *
   * Within a leg's cycle, stance is short and swing is long (STANCE_FRAC).
   * `warp` squeezes the first half of a curve into the stance window and
   * stretches the second half over the swing, which is the asymmetry that
   * separates running from marching. It has a corner at its midpoint, but
   * every curve fed through it is a sine or cosine whose slope is zero
   * exactly there, so the result is still smooth.
   */
  const warp = (u, k) => (u < k ? (u / k) * 0.5 : 0.5 + ((u - k) / (1 - k)) * 0.5);
  const frac = (v) => v - Math.floor(v);

  Player.prototype._animate = function (dt, speed, menace) {
    const U_ = U(), cfg = PP.CFG;
    const grounded = this.grounded;
    menace = menace || 0;

    // Cadence follows ground speed on an eased curve. See the note in
    // config.js about why this is not solved for zero foot-skate.
    const sN = U_.clamp(
      (speed - cfg.SPEED_START) / (cfg.SPEED_MAX - cfg.SPEED_START), 0, 1);
    const cadence = U_.lerp(
      cfg.CADENCE_MIN, cfg.CADENCE_MAX, Math.pow(sN, cfg.CADENCE_CURVE));
    this.cadence = cadence;

    // The phase keeps running in the air so that landing can snap to the
    // nearest contact rather than resuming wherever it happened to freeze.
    if (!this.sliding) this.runPhase += dt * cadence * Math.PI;
    const base = frac(this.runPhase / (Math.PI * 2));

    // Landing absorb: a countdown started in update(), where the impact
    // velocity is captured before gravity integration throws it away.
    const landK = this.landT > 0 ? this.landT / cfg.LAND_TIME : 0;
    const absorb = landK * this.landImpact;

    if (this.sliding) {
      // Slide: lean back, legs out front
      this.body.rotation.x = U_.damp(this.body.rotation.x, -1.05, 16, dt);
      this.body.position.y = U_.damp(this.body.position.y, -0.62, 16, dt);
      this.legs.forEach((l) => {
        l.pivot.rotation.x = U_.damp(l.pivot.rotation.x, 1.25, 16, dt);
        l.shin.rotation.x = U_.damp(l.shin.rotation.x, -0.5, 16, dt);
        l.foot.rotation.x = U_.damp(l.foot.rotation.x, 0.35, 16, dt);
      });
      this.arms.forEach((a) => {
        a.pivot.rotation.x = U_.damp(a.pivot.rotation.x, -2.1, 14, dt);
        a.fore.rotation.x = U_.damp(a.fore.rotation.x, -0.4, 14, dt);
      });
      this.pelvis.rotation.y = U_.damp(this.pelvis.rotation.y, 0, 12, dt);
      this.chestYaw = U_.damp(this.chestYaw || 0, 0, 12, dt);

    } else if (!grounded) {
      /* Airborne.
       *
       * The first fraction of a second is a push-off, not a tuck — the legs
       * are still extended behind him from driving off the ground. Tucking
       * from frame one is what made the old jump read as a hop performed by
       * someone sitting down.
       */
      const ext = U_.clamp(this.airT / 0.12, 0, 1);
      const rising = this.vy > 0;
      this.body.rotation.x = U_.damp(this.body.rotation.x, rising ? -0.18 : 0.12, 10, dt);
      this.body.position.y = U_.damp(this.body.position.y, 0, 12, dt);
      const tuck = rising ? 1.15 : 0.55;
      this.legs.forEach((l, i) => {
        const target = U_.lerp(-0.55, tuck * (i ? 0.75 : 1), ext);
        l.pivot.rotation.x = U_.damp(l.pivot.rotation.x, target, 12, dt);
        l.shin.rotation.x = U_.damp(l.shin.rotation.x, U_.lerp(-0.25, -1.1, ext), 12, dt);
        // Toes point down on the way up, come up ready to land on the way down
        l.foot.rotation.x = U_.damp(l.foot.rotation.x, rising ? -0.35 : 0.30, 10, dt);
      });
      // Arms up and back, and asymmetric — a symmetric pose reads as a doll
      this.arms.forEach((a) => {
        a.pivot.rotation.x = U_.damp(a.pivot.rotation.x, -1.2 - a.side * 0.35, 12, dt);
        a.fore.rotation.x = U_.damp(a.fore.rotation.x, -0.7 - a.side * 0.2, 12, dt);
      });
      this.pelvis.rotation.y = U_.damp(this.pelvis.rotation.y, 0, 10, dt);
      this.chestYaw = U_.damp(this.chestYaw || 0, 0, 10, dt);

    } else {
      /* Grounded run cycle.
       *
       * Everything periodic in here is written analytically and applied
       * DIRECTLY. Do not wrap these in damp(): at 3-6 steps a second the
       * cycle outruns any sane damping rate, and the filter quietly
       * flattens it to nothing. That is exactly what happened to the old
       * body bob — the target was there, the motion was not.
       */
      this.legs.forEach((l) => {
        const u = frac(base + (l.side > 0 ? 0.5 : 0));
        const w = warp(u, cfg.STANCE_FRAC);

        // Hip: forward at contact, driven back through stance, whipped
        // forward again through the longer swing.
        l.pivot.rotation.x = Math.cos(w * Math.PI * 2) * cfg.THIGH_AMP + cfg.THIGH_BIAS;

        if (w < 0.5) {
          // Stance: the knee gives a little under load rather than pogoing
          // on a locked leg, then extends into toe-off.
          l.shin.rotation.x = -0.10 - Math.sin(w * Math.PI * 2) * 0.22
            - absorb * 0.55;
          l.foot.rotation.x = -0.15 + Math.cos(w * Math.PI * 2) * 0.30;
        } else {
          // Swing: heel snaps up toward the backside early, then the shin
          // unfolds to reach for the next contact.
          const s = (w - 0.5) * 2;
          const sw = warp(s, 0.4);
          l.shin.rotation.x = -0.10 - Math.sin(sw * Math.PI) * 1.8;
          l.foot.rotation.x = -0.15 + Math.cos(w * Math.PI * 2) * 0.30
            + Math.sin(s * Math.PI) * 0.40;
        }
      });

      /* Arms are contralateral: right leg forward, left arm forward. Each
       * arm is driven by the phase of the leg on the OTHER side. The elbow
       * stays folded near a right angle throughout — a sprinter's carriage —
       * instead of the near-straight swing it had, which read as marching.
       */
      this.arms.forEach((a) => {
        const u = frac(base + (a.side > 0 ? 0 : 0.5));
        a.pivot.rotation.x = Math.cos(u * Math.PI * 2) * cfg.ARM_AMP + cfg.ARM_BIAS;
        a.fore.rotation.x = -1.15 - Math.cos(u * Math.PI * 2 + 0.9) * 0.35;
        a.pivot.rotation.z = -a.side * cfg.ARM_TUCK;
      });

      /* Hips and shoulders wind against each other. This is the single
       * biggest reason the old cycle read as a wind-up toy: with arms and
       * legs on one group there was no spine between them to twist.
       */
      const twistPhase = Math.cos(base * Math.PI * 2);
      this.pelvis.rotation.y = -twistPhase * cfg.HIP_SWING;
      this.chestYaw = twistPhase * cfg.SHOULDER_SWING;
      // Pelvic drop on the swing side, so the hips aren't a rigid bar
      this.pelvis.rotation.z = Math.sin(base * Math.PI * 2) * 0.07;

      /* Vertical travel.
       *
       * Two footfalls per cycle, so the bob runs at double the leg rate.
       * He is lowest at mid-stance, under load, and highest mid-flight —
       * which is why it is keyed off STANCE_FRAC rather than being a free
       * sine. Amplitude grows a little with cadence.
       */
      const bobPhase = (base - cfg.STANCE_FRAC * 0.5) * Math.PI * 4;
      const bobAmp = cfg.BOB_AMOUNT * U_.lerp(0.8, 1.15, sN);
      this.body.position.y = -Math.cos(bobPhase) * bobAmp * 0.5 - absorb * cfg.LAND_SQUASH;

      // He folds forward harder the faster he goes and the closer they get
      const lean = cfg.LEAN_BASE + cfg.LEAN_SPEED * sN + cfg.LEAN_MENACE * menace
        + absorb * 0.25;
      this.body.rotation.x = U_.damp(this.body.rotation.x, lean, 8, dt);
    }

    // Shoulder yaw is the run twist plus the look-back twist, on one group.
    this.chest.rotation.y = (this.chestYaw || 0) + (this.twist || 0);

    /* Bank into lane changes.
     *
     * Driven by lateral VELOCITY, not by distance still to travel. The old
     * version used the remaining gap, which meant the lean peaked once he
     * had already arrived and then unwound — the bank happened after the
     * dodge instead of during it.
     */
    const vx = dt > 0 ? (this.x - (this._lastX === undefined ? this.x : this._lastX)) / dt : 0;
    this._lastX = this.x;
    const stumbleK = this.stumble > 0 ? Math.min(1, this.stumble / 0.35) : 0;
    this.body.rotation.z = U_.damp(
      this.body.rotation.z, -vx * PP.CFG.LANE_BANK + stumbleK * 0.12, 14, dt);

    /* Clipping a car used to move nothing but his head. Throw the arms out
     * of their cycle so the hit lands in his body too — one arm up to catch
     * himself, the other trailing.
     */
    if (stumbleK > 0) {
      this.arms.forEach((a) => {
        a.pivot.rotation.x += stumbleK * (a.side > 0 ? -1.15 : -0.35);
        a.pivot.rotation.z += stumbleK * a.side * 0.5;
        a.fore.rotation.x += stumbleK * 0.35;
      });
      this.body.rotation.x += stumbleK * 0.14;
    }

    /* Look back at the clippers.
     *
     * Two sources: a hard snap while stumbling from a hit, and a steady
     * nervous glance the rest of the time — roughly two seconds facing
     * forward, two seconds looking back. He turns over his RIGHT shoulder,
     * which is the side the clippers actually hunt from.
     *
     * He faces -Z, so a positive Y rotation turns him toward -X (his left).
     * Looking right means a negative angle.
     */
    this.lookT += dt;
    const CYCLE = PP.CFG.LOOK_FORWARD + PP.CFG.LOOK_BACK;
    if (this.lookT > CYCLE) this.lookT -= CYCLE;
    const glancing = this.lookT > PP.CFG.LOOK_FORWARD;

    const lookBack = (this.stumble > 0 || glancing) ? -PP.CFG.LOOK_ANGLE : 0;
    /* The head is parented to the chest, so the run's shoulder counter-yaw
     * would swing his face 20-odd degrees each way every step. A runner's
     * shoulders rotate UNDER a head that stays pointed where he is going, so
     * the run twist is cancelled out here and only the deliberate glance and
     * its shoulder follow are left.
     */
    this.headYawT = U_.damp(this.headYawT || 0, lookBack, 7, dt);
    this.head.rotation.y = this.headYawT - (this.chestYaw || 0);
    // Tip the head as he cranes round, and a little more when actually hit
    this.head.rotation.z = U_.damp(
      this.head.rotation.z,
      this.stumble > 0 ? -0.3 : (glancing ? -0.16 : 0), 7, dt
    );
    // The shoulders follow a fraction of the way, so it's a turn and not an
    // owl swivel. Body twist rides on top of the lean from lane changes.
    this.twist = U_.damp(this.twist || 0, lookBack * 0.22, 6, dt);

    // Idle head bob
    this.head.rotation.x = Math.sin(this.runPhase * 2) * 0.045
      + (glancing ? -0.06 : 0);

    // Invulnerability blink. Deliberately lopsided — visible roughly three
    // quarters of the time — so it reads as flashing rather than as the
    // character disappearing.
    this.body.visible = this.invuln <= 0 || Math.sin(this.invuln * 30) > -0.5;

    // Shadow shrinks and fades as he rises
    const h = Math.max(0, this.y);
    this.shadow.scale.setScalar(Math.max(0.35, 1 - h * 0.22));
    this.shadow.material.opacity = Math.max(0.06, 0.3 - h * 0.055);

    if (this.aura.visible) {
      this.aura.rotation.y += dt * 1.6;
      this.aura.material.opacity = 0.16 + Math.sin(performance.now() * 0.006) * 0.07;
      // Flash faster as the shield runs out
      if (this.shield < 2) this.aura.visible = Math.sin(this.shield * 18) > -0.4;
    }
  };

  /* ---- Damage ---------------------------------------------------------- */
  Player.prototype.giveShield = function () {
    this.shield = PP.CFG.SHIELD_TIME;
    this.aura.visible = true;
  };

  /** Returns 'shielded' | 'snipped' | 'dead' | null (ignored while invulnerable). */
  Player.prototype.takeSnip = function () {
    if (this.invuln > 0) return null;
    if (this.shield > 0) {
      this.shield = 0;
      this.aura.visible = false;
      this.invuln = 0.6;
      return 'shielded';
    }
    this.setHair(this.hair - 1, { puff: true });
    this.invuln = PP.CFG.INVULN_TIME;
    this.stumble = 0.9;
    if (this.hair <= 0) { this.dead = true; return 'dead'; }
    return 'snipped';
  };

  /** Collider for the current pose — shrinks while sliding. */
  Player.prototype.collider = function () {
    const h = this.sliding ? PP.CFG.PLAYER_SLIDE_H : PP.CFG.PLAYER_STAND_H;
    return { x: this.x, yMin: this.y, yMax: this.y + h, r: PP.CFG.PLAYER_RADIUS };
  };

  return Player;
})();
