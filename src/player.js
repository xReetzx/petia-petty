/* The runner: toon-shaded body, inked outlines, a drawn face, and hair that
 * is literally the health bar. */
window.PP = window.PP || {};

PP.Player = (function () {
  'use strict';

  const U = () => PP.U;
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
    this.dead = false;

    this._build();
    this.setHair(this.hair);
  }

  Player.prototype._build = function () {
    const U_ = U(), c = C();
    const body = new THREE.Group();
    this.body = body;
    this.root.add(body);

    // --- Torso: maroon tee ------------------------------------------------
    const torso = U_.inked(new THREE.BoxGeometry(1.06, 0.96, 0.66), c.shirt, 0.075);
    torso.position.y = 1.12;
    body.add(torso);

    // Shoulders rounded off so the silhouette isn't a pure box
    const shoulders = U_.inked(new THREE.CylinderGeometry(0.36, 0.36, 1.1, 12), c.shirt, 0.06);
    shoulders.rotation.z = Math.PI / 2;
    shoulders.position.y = 1.5;
    body.add(shoulders);

    // --- Head -------------------------------------------------------------
    const head = new THREE.Group();
    head.position.y = 2.02;
    body.add(head);
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
      pivot.position.set(s * 0.58, 1.45, 0);
      body.add(pivot);
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
      pivot.position.set(s * 0.25, 0.72, 0);
      body.add(pivot);
      const thigh = U_.inked(new THREE.BoxGeometry(0.3, 0.46, 0.3), c.jeans, 0.05);
      thigh.position.y = -0.23;
      pivot.add(thigh);
      const shin = new THREE.Group();
      shin.position.y = -0.46;
      pivot.add(shin);
      const calf = U_.inked(new THREE.BoxGeometry(0.24, 0.44, 0.24), c.jeans, 0.05);
      calf.position.y = -0.22;
      shin.add(calf);
      const shoe = U_.inked(new THREE.BoxGeometry(0.28, 0.17, 0.42), c.shoe, 0.05);
      shoe.position.set(0, -0.48, 0.07);
      shin.add(shoe);
      this.legs.push({ pivot, shin, side: s });
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
    this.setHair(PP.CFG.HAIR_MAX);
    this.aura.visible = false;
    this.body.visible = true;   // clear any half-finished invuln blink
    this.root.rotation.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
    this.twist = 0;
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
    // Coyote time: a jump pressed just after running off a ledge still counts.
    if (!this.grounded && this.airT > PP.CFG.COYOTE_TIME) return false;
    this.vy = PP.CFG.JUMP_V;
    this.grounded = false;
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
  Player.prototype.update = function (dt, speed) {
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
      this.y = 0;
      this.vy = 0;
      this.grounded = true;
      this.airT = 0;
    } else {
      this.grounded = false;
      this.airT += dt;
    }

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
    this._animate(dt, speed);
  };

  Player.prototype._animate = function (dt, speed) {
    const U_ = U();
    const grounded = this.grounded;

    // Run cycle speed scales with actual velocity so it never looks like
    // he's moon-walking at high speed.
    if (grounded && !this.sliding) this.runPhase += dt * (4.2 + speed * 0.42);
    const p = this.runPhase;

    if (this.sliding) {
      // Slide: lean back, legs out front
      this.body.rotation.x = U_.damp(this.body.rotation.x, -1.05, 16, dt);
      this.body.position.y = U_.damp(this.body.position.y, -0.62, 16, dt);
      this.legs.forEach((l) => {
        l.pivot.rotation.x = U_.damp(l.pivot.rotation.x, 1.25, 16, dt);
        l.shin.rotation.x = U_.damp(l.shin.rotation.x, -0.5, 16, dt);
      });
      this.arms.forEach((a) => {
        a.pivot.rotation.x = U_.damp(a.pivot.rotation.x, -2.1, 14, dt);
        a.fore.rotation.x = U_.damp(a.fore.rotation.x, -0.4, 14, dt);
      });
    } else if (!grounded) {
      // Jump: tuck
      this.body.rotation.x = U_.damp(this.body.rotation.x, this.vy > 0 ? -0.18 : 0.12, 10, dt);
      this.body.position.y = U_.damp(this.body.position.y, 0, 12, dt);
      const tuck = this.vy > 0 ? 1.15 : 0.55;
      this.legs.forEach((l, i) => {
        l.pivot.rotation.x = U_.damp(l.pivot.rotation.x, tuck * (i ? 0.75 : 1), 12, dt);
        l.shin.rotation.x = U_.damp(l.shin.rotation.x, -1.1, 12, dt);
      });
      this.arms.forEach((a) => {
        a.pivot.rotation.x = U_.damp(a.pivot.rotation.x, -1.5 * a.side * 0 - 1.2, 12, dt);
        a.fore.rotation.x = U_.damp(a.fore.rotation.x, -0.7, 12, dt);
      });
    } else {
      // Run cycle: counter-swinging arms and legs
      this.body.rotation.x = U_.damp(this.body.rotation.x, 0.13, 10, dt);
      this.body.position.y = U_.damp(this.body.position.y, Math.abs(Math.sin(p)) * 0.07, 14, dt);
      this.legs.forEach((l) => {
        const ph = p + (l.side > 0 ? Math.PI : 0);
        l.pivot.rotation.x = Math.sin(ph) * 0.95;
        l.shin.rotation.x = -Math.max(0, Math.sin(ph - 0.8)) * 1.25;
      });
      this.arms.forEach((a) => {
        const ph = p + (a.side > 0 ? 0 : Math.PI);
        a.pivot.rotation.x = Math.sin(ph) * 0.85 - 0.25;
        a.fore.rotation.x = -0.55 - Math.max(0, Math.sin(ph + 0.6)) * 0.5;
      });
    }

    // Lean into lane changes
    const leanTarget = (PP.CFG.LANE_X[this.targetLane] - this.x) * 0.34;
    this.body.rotation.z = U_.damp(this.body.rotation.z, leanTarget, 12, dt);
    this.body.rotation.y = this.twist || 0;

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
    this.head.rotation.y = U_.damp(this.head.rotation.y, lookBack, 7, dt);
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
