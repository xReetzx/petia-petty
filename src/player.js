/* The runner: toon-shaded body, inked outlines, a drawn face, and hair that
 * is literally the health bar. */
window.PP = window.PP || {};

PP.Player = (function () {
  'use strict';

  const U = () => PP.U;
  const C = () => PP.CFG.COL;

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
    const torso = U_.inked(new THREE.BoxGeometry(0.94, 0.94, 0.58), c.shirt, 0.075);
    torso.position.y = 1.12;
    body.add(torso);

    // Shoulders rounded off so the silhouette isn't a pure box
    const shoulders = U_.inked(new THREE.CylinderGeometry(0.31, 0.31, 0.94, 10), c.shirt, 0.06);
    shoulders.rotation.z = Math.PI / 2;
    shoulders.position.y = 1.48;
    body.add(shoulders);

    // --- Head -------------------------------------------------------------
    const head = new THREE.Group();
    head.position.y = 2.0;
    body.add(head);
    this.head = head;

    const skullGeo = new THREE.BoxGeometry(0.8, 0.86, 0.66);
    const faceTex = PP.Face.get('panic');
    // BoxGeometry material order is [+X, -X, +Y, -Y, +Z, -Z]. He runs toward
    // -Z, so -Z is his front and that's where the drawn portrait goes — the
    // chase camera correctly sees the back of his head, and the face swings
    // into view during the look-back stumble.
    const skin = U_.toonMat(c.skin);
    const faceMat = U_.toonMat(0xffffff, { map: faceTex });
    const skull = new THREE.Mesh(skullGeo, [skin, skin, skin, skin, skin, faceMat]);
    U_.outline(skull, 0.07);
    head.add(skull);
    this.skull = skull;
    this.faceMat = faceMat;

    // Ears
    [-1, 1].forEach((s) => {
      const ear = U_.inked(new THREE.SphereGeometry(0.1, 8, 6), c.skin, 0.045);
      ear.position.set(s * 0.41, 0.0, 0);
      ear.scale.set(0.6, 1, 0.7);
      head.add(ear);
    });

    // Neck
    const neck = U_.inked(new THREE.CylinderGeometry(0.17, 0.19, 0.2, 8), c.skin, 0.045);
    neck.position.y = 1.62;
    body.add(neck);

    // Hair lives on the head so it follows the look-back twist.
    this.hairGroup = new THREE.Group();
    head.add(this.hairGroup);

    // --- Arms -------------------------------------------------------------
    this.arms = [];
    [-1, 1].forEach((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.52, 1.45, 0);
      body.add(pivot);
      const upper = U_.inked(new THREE.BoxGeometry(0.21, 0.52, 0.21), c.shirt, 0.05);
      upper.position.y = -0.26;
      pivot.add(upper);
      const fore = new THREE.Group();
      fore.position.y = -0.52;
      pivot.add(fore);
      const lower = U_.inked(new THREE.BoxGeometry(0.19, 0.5, 0.19), c.skin, 0.05);
      lower.position.y = -0.25;
      fore.add(lower);
      const fist = U_.inked(new THREE.SphereGeometry(0.135, 8, 6), c.skin, 0.045);
      fist.position.y = -0.52;
      fore.add(fist);
      this.arms.push({ pivot, fore, side: s });
    });

    // --- Legs -------------------------------------------------------------
    this.legs = [];
    [-1, 1].forEach((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.22, 0.7, 0);
      body.add(pivot);
      const thigh = U_.inked(new THREE.BoxGeometry(0.27, 0.46, 0.27), c.jeans, 0.05);
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

  /* ---- Hair stages: 3 = full mess, 0 = chrome dome ---------------------- */
  Player.prototype.setHair = function (n) {
    const U_ = U(), c = C();
    this.hair = Math.max(0, Math.min(PP.CFG.HAIR_MAX, n));
    while (this.hairGroup.children.length) this.hairGroup.remove(this.hairGroup.children[0]);

    if (this.hair <= 0) return; // fully bald

    const spike = (x, y, z, h, rot) => {
      const m = U_.inked(new THREE.ConeGeometry(0.105, h, 5), c.hair, 0.045);
      m.position.set(x, y, z);
      m.rotation.set(rot[0], rot[1], rot[2]);
      this.hairGroup.add(m);
    };

    // Base cap — shrinks back as hair is lost
    const capScale = this.hair === 3 ? 1 : this.hair === 2 ? 0.86 : 0.7;
    const cap = U_.inked(new THREE.SphereGeometry(0.43, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), c.hair, 0.06);
    cap.position.y = 0.3;
    cap.scale.set(1.02 * capScale, this.hair === 1 ? 0.5 : 0.85, 1.02 * capScale);
    this.hairGroup.add(cap);

    if (this.hair === 1) {
      // Horseshoe: push the cap back off the crown, keep sides only
      cap.position.set(0, 0.2, -0.06);
      cap.scale.set(1.06, 0.42, 1.0);
      return;
    }

    // Messy spikes, denser at full health. Deterministic so he looks the same
    // every run rather than re-rolling a new haircut each time.
    const count = this.hair === 3 ? 14 : 7;
    const rand = U_.rng(1337);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand() * 0.4;
      const r = 0.12 + rand() * 0.2;
      const h = 0.26 + rand() * 0.22;
      spike(
        Math.cos(a) * r,
        0.5 + rand() * 0.07,
        Math.sin(a) * r * 0.85 - 0.03,
        h,
        [(rand() - 0.5) * 0.9, 0, (rand() - 0.5) * 0.9]
      );
    }
  };

  Player.prototype.reset = function () {
    this.lane = this.targetLane = 1;
    this.laneT = 1;
    this.x = this.laneFrom = PP.CFG.LANE_X[1];
    this.y = 0; this.vy = 0;
    this.grounded = true; this.sliding = false; this.slideT = 0; this.airT = 0;
    this.invuln = 0; this.shield = 0; this.stumble = 0; this.dead = false;
    this.runPhase = 0;
    this.setHair(PP.CFG.HAIR_MAX);
    this.aura.visible = false;
    this.body.visible = true;   // clear any half-finished invuln blink
    this.root.rotation.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
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

    // Look back at the clippers while stumbling
    const lookBack = this.stumble > 0 ? 2.3 : 0;
    this.head.rotation.y = U_.damp(this.head.rotation.y, lookBack, 9, dt);
    this.head.rotation.z = U_.damp(this.head.rotation.z, this.stumble > 0 ? 0.25 : 0, 9, dt);
    // Idle head bob
    this.head.rotation.x = Math.sin(this.runPhase * 2) * 0.045;

    // Invulnerability blink
    const blink = this.invuln > 0 ? (Math.sin(this.invuln * 34) > 0 ? 0.25 : 1) : 1;
    this.body.visible = blink > 0.5;

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
    this.setHair(this.hair - 1);
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
