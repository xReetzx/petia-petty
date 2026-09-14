/* The chaser: a giant pair of hair clippers with chattering blades.
 *
 * `menace` (0..1) is the single dial that drives everything — how close they
 * sit behind the player, how loud and high the buzz is, how hard the camera
 * pushes in, and when they lunge. Hits raise it; clean running bleeds it off.
 */
window.PP = window.PP || {};

PP.Clippers = (function () {
  'use strict';

  function Clippers(scene) {
    this.root = new THREE.Group();
    scene.add(this.root);

    this.menace = 0;
    this.lunge = 0;       // 0..1 animation progress of a strike
    this.lungeDir = 0;    // +1 striking, -1 recovering
    this.chatter = 0;
    this.x = 0;

    this._build();
  }

  Clippers.prototype._build = function () {
    const U = PP.U, c = PP.CFG.COL;
    const g = new THREE.Group();
    this.rig = g;
    this.root.add(g);

    // --- Main housing -----------------------------------------------------
    const body = U.inked(new THREE.BoxGeometry(1.35, 1.15, 3.2), c.chrome, 0.075);
    body.position.set(0, 0, 0.5);
    g.add(body);

    // Grip ridges — three dark bands down the body
    for (let i = 0; i < 3; i++) {
      const rib = U.inked(new THREE.BoxGeometry(1.4, 0.14, 0.26), c.chromeDk, 0.04);
      rib.position.set(0, 0.38 - i * 0.36, 1.0);
      g.add(rib);
    }

    // Black rubber grip at the back
    const grip = U.inked(new THREE.BoxGeometry(1.2, 1.0, 1.1), 0x24262b, 0.06);
    grip.position.set(0, 0, 1.95);
    g.add(grip);

    // --- Blade head -------------------------------------------------------
    const head = new THREE.Group();
    head.position.set(0, -0.14, -1.45);
    g.add(head);

    const neck = U.inked(new THREE.BoxGeometry(1.5, 0.62, 0.6), c.chromeDk, 0.06);
    head.add(neck);

    // Two combs that chatter against each other — the actual "jaws"
    const toothRow = (yOff) => {
      const row = new THREE.Group();
      const plate = U.inked(new THREE.BoxGeometry(1.62, 0.16, 0.44), c.blade, 0.045);
      plate.position.z = -0.45;
      row.add(plate);
      for (let i = 0; i < 11; i++) {
        const t = U.inked(new THREE.BoxGeometry(0.1, 0.15, 0.48), c.blade, 0.028);
        t.position.set(-0.72 + i * 0.145, 0, -0.82);
        row.add(t);
      }
      row.position.y = yOff;
      head.add(row);
      return row;
    };
    this.jawTop = toothRow(0.21);
    this.jawBot = toothRow(-0.21);

    // --- Power switch + cord ---------------------------------------------
    const collar = U.inked(new THREE.BoxGeometry(1.42, 1.2, 0.3), 0x24262b, 0.05);
    collar.position.set(0, 0, -1.05);
    g.add(collar);

    const sw = U.inked(new THREE.BoxGeometry(0.34, 0.18, 0.5), c.pole, 0.04);
    sw.position.set(0, 0.64, 0.3);
    g.add(sw);

    // A trailing power cord was tried here and cut: its segments reached back
    // toward the camera and rendered as huge black bars across the frame.

    // --- Ink speed lines trailing the clippers ----------------------------
    this.speedLines = new THREE.Group();
    g.add(this.speedLines);
    for (let i = 0; i < 8; i++) {
      const l = new THREE.Mesh(
        new THREE.PlaneGeometry(0.06, 1.6 + Math.random() * 1.4),
        new THREE.MeshBasicMaterial({
          color: PP.CFG.COL.ink, transparent: true, opacity: 0.35, depthWrite: false
        })
      );
      l.rotation.x = Math.PI / 2;
      l.position.set((Math.random() - 0.5) * 3.4, (Math.random() - 0.5) * 2.0, 2.2 + Math.random() * 2.4);
      this.speedLines.add(l);
    }

    g.scale.setScalar(PP.CFG.CHASE_SCALE);
    g.rotation.x = -0.18;  // jaws angled slightly down at the player
    g.rotation.y = 0.34;   // three-quarter view so it reads as clippers
    this.root.position.set(0, PP.CFG.CHASE_Y_FAR, PP.CFG.CHASE_Z_FAR);
  };

  Clippers.prototype.reset = function () {
    this.menace = 0;
    this.lunge = 0;
    this.lungeDir = 0;
    this.x = 0;
    this.root.position.set(0, PP.CFG.CHASE_Y_FAR, PP.CFG.CHASE_Z_FAR);
  };

  Clippers.prototype.addMenace = function (n) {
    this.menace = PP.U.clamp(this.menace + n, 0, 1);
  };

  /** True on the frame the clippers actually connect. */
  Clippers.prototype.update = function (dt, playerX, speed) {
    const cfg = PP.CFG, U = PP.U;

    // Baseline creep + decay from clean running.
    this.menace = U.clamp(
      this.menace + cfg.MENACE_CREEP * dt - cfg.MENACE_DECAY * dt,
      0, 1
    );

    let connected = false;

    // Lunge when fully menacing
    if (this.menace >= 1 && this.lungeDir === 0) {
      this.lungeDir = 1;
    }
    if (this.lungeDir === 1) {
      this.lunge += dt * 5.2;
      if (this.lunge >= 1) {
        this.lunge = 1;
        this.lungeDir = -1;
        connected = true;
        this.menace = cfg.MENACE_AFTER_SNIP;
      }
    } else if (this.lungeDir === -1) {
      this.lunge -= dt * 2.4;
      if (this.lunge <= 0) { this.lunge = 0; this.lungeDir = 0; }
    }

    // Distance behind the player, eased so the approach feels weighty
    const eased = U.easeOutCubic(this.menace);
    const baseZ = U.lerp(cfg.CHASE_Z_FAR, cfg.CHASE_Z_NEAR, eased);
    const z = baseZ - this.lunge * (baseZ - 1.4);
    this.root.position.z = U.damp(this.root.position.z, z, 7, dt);

    // Track the player laterally, lagging behind so it reads as pursuit
    this.x = U.damp(this.x, playerX, 3.2 + eased * 3, dt);
    this.root.position.x = this.x;

    // Height barely changes now. The camera leads the player, so the clippers
    // simply loom larger as they close the gap — which does honestly what the
    // old overhead swoop was faking.
    const baseY = U.lerp(cfg.CHASE_Y_FAR, cfg.CHASE_Y_NEAR, eased);
    const y = baseY - this.lunge * (baseY - 2.3);
    this.root.position.y = U.damp(this.root.position.y, y, 8, dt);

    // Tip the jaws down toward his scalp as they line up the cut
    this.rig.rotation.x = U.damp(this.rig.rotation.x, -0.18 - eased * 0.3 - this.lunge * 0.35, 7, dt);
    this.rig.rotation.y = U.damp(this.rig.rotation.y, 0.34 - eased * 0.22, 6, dt);

    // Blades chatter faster the closer they get
    this.chatter += dt * (26 + eased * 40);
    const gap = 0.17 + Math.abs(Math.sin(this.chatter)) * 0.13;
    this.jawTop.position.y = gap;
    this.jawBot.position.y = -gap;
    // Whole unit shakes with the motor
    this.rig.position.x = Math.sin(this.chatter * 1.7) * 0.03 * (0.4 + eased);
    this.rig.position.y = Math.cos(this.chatter * 2.3) * 0.03 * (0.4 + eased);
    this.rig.rotation.z = Math.sin(this.chatter * 0.9) * 0.04 * (0.5 + eased);

    // Speed lines only at pace
    const showLines = speed > 18;
    this.speedLines.visible = showLines;
    if (showLines) {
      this.speedLines.children.forEach((l) => {
        l.position.z += dt * speed * 0.4;
        if (l.position.z > 5.2) l.position.z = 2.0;
        l.material.opacity = 0.15 + eased * 0.3;
      });
    }

    return connected;
  };

  return Clippers;
})();
