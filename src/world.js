/* The track: pooled chunks streaming toward the player, carrying obstacles,
 * pickups and barbershop scenery.
 *
 * Fairness is enforced here, not left to chance: no pattern ever blocks all
 * three lanes, and the spacing between patterns always leaves the player at
 * least MIN_REACTION seconds of clear runway at the current speed.
 */
window.PP = window.PP || {};

PP.World = (function () {
  'use strict';

  const OB = { HURDLE: 'hurdle', BAR: 'bar', BLOCK: 'block' };

  function World(scene, seed) {
    this.scene = scene;
    this.rand = PP.U.rng(seed || 20260914);
    this.chunks = [];
    this.obstacles = [];   // live obstacles, world-space z
    this.pickups = [];
    this.nextZ = 0;        // z where the next chunk begins (negative = ahead)
    this.lastPatternZ = -40;

    this._materials();
    this._buildGround();
    this._pools();
  }

  World.prototype._materials = function () {
    const c = PP.CFG.COL, U = PP.U;
    this.mat = {
      hurdle: U.toonMat(c.shirtDk),
      bar: U.toonMat(c.chromeDk),
      block: U.toonMat(c.pole),
      tuft: U.toonMat(c.hair),
      serum: U.toonMat(c.serum),
      pomade: U.toonMat(c.pomade)
    };
  };

  World.prototype._buildGround = function () {
    const c = PP.CFG.COL, U = PP.U;

    // A long floor strip that simply repositions under the player — cheaper
    // and seam-free compared to per-chunk floor meshes.
    const tex = this._floorTexture();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(9.2, 600),
      new THREE.MeshToonMaterial({ map: tex, gradientMap: U.toonGradient() })
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    this.floor = floor;

    // Sidewalks running the length of the track. Without these the barber
    // poles and shopfronts hang in empty space either side of the road.
    [-1, 1].forEach((s) => {
      const walk = new THREE.Mesh(
        new THREE.PlaneGeometry(13, 600),
        U.toonMat(c.floorAlt)
      );
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(s * 11.4, 0.42, 0);
      this.scene.add(walk);
    });

    // Kerbs either side to frame the run.
    // No inverted-hull outline here: on a 600-unit-long box the hull scales by
    // a hair and z-fights with the mesh, which showed up as a black band
    // stretching down the track. A dark cap strip gives the same inked edge.
    [-1, 1].forEach((s) => {
      const kerb = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.46, 600),
        U.toonMat(c.floorAlt)
      );
      kerb.position.set(s * 4.7, 0.23, 0);
      this.scene.add(kerb);

      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.07, 600),
        new THREE.MeshBasicMaterial({ color: c.ink })
      );
      cap.position.set(s * 4.7, 0.47, 0);
      this.scene.add(cap);

      if (s < 0) this.kerbL = kerb; else this.kerbR = kerb;
    });
  };

  World.prototype._floorTexture = function () {
    const c = PP.CFG.COL;
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 256;
    const ctx = cv.getContext('2d');
    const hex = (n) => '#' + n.toString(16).padStart(6, '0');

    ctx.fillStyle = hex(c.floor);
    ctx.fillRect(0, 0, 256, 256);

    // Barbershop checker, drawn slightly wonky so it reads as hand-inked
    ctx.fillStyle = hex(c.floorAlt);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        if ((x + y) % 2) continue;
        ctx.save();
        ctx.translate(x * 64 + 32, y * 64 + 32);
        ctx.rotate((Math.random() - 0.5) * 0.03);
        ctx.fillRect(-32, -32, 64, 64);
        ctx.restore();
      }
    }
    // Ink border on the tiles
    ctx.strokeStyle = 'rgba(20,16,19,0.78)';
    ctx.lineWidth = 3.2;
    for (let i = 0; i <= 4; i++) {
      PP.U.inkLine(ctx, 0, i * 64, 256, i * 64, 2.5, 1.2);
      PP.U.inkLine(ctx, i * 64, 0, i * 64, 256, 2.5, 1.2);
    }
    // Yellow marker scribble accents
    ctx.globalAlpha = 0.5;
    PP.U.hatch(ctx, 20, 150, 70, 50, 6, 1.0, 0.7, hex(c.marker));
    PP.U.hatch(ctx, 0, 0, 256, 256, 22, Math.PI / 3, 0.09, '#141013');
    ctx.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 130);
    return tex;
  };

  World.prototype._pools = function () {
    const U = PP.U, c = PP.CFG.COL, self = this;

    const mkHurdle = () => {
      const g = new THREE.Group();
      const seat = U.inked(new THREE.BoxGeometry(1.7, 0.55, 0.9), c.shirtDk, 0.05);
      seat.position.y = 0.62;
      g.add(seat);
      const post = U.inked(new THREE.CylinderGeometry(0.16, 0.22, 0.62, 8), c.chromeDk, 0.04);
      post.position.y = 0.3;
      g.add(post);
      g.userData = { kind: OB.HURDLE, yMin: 0, yMax: 0.95, halfW: 0.9 };
      return g;
    };

    const mkBar = () => {
      const g = new THREE.Group();
      const shelf = U.inked(new THREE.BoxGeometry(1.9, 0.26, 0.6), c.chromeDk, 0.05);
      shelf.position.y = 1.72;
      g.add(shelf);
      // Bottles hanging under it, so it reads as something to duck
      for (let i = -1; i <= 1; i++) {
        const b = U.inked(new THREE.CylinderGeometry(0.13, 0.13, 0.42, 7), i === 0 ? c.serum : c.pomade, 0.03);
        b.position.set(i * 0.55, 1.42, 0);
        g.add(b);
      }
      const rope = U.inked(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 5), c.ink, 0.015);
      rope.position.y = 2.5;
      g.add(rope);
      g.userData = { kind: OB.BAR, yMin: 1.2, yMax: 3.0, halfW: 1.0 };
      return g;
    };

    const mkBlock = () => {
      const g = new THREE.Group();
      // Barber pole: red/blue/white bands
      const bands = [c.pole, 0xf4efe4, c.poleB, 0xf4efe4, c.pole, 0xf4efe4];
      bands.forEach((col, i) => {
        const b = U.inked(new THREE.CylinderGeometry(0.34, 0.34, 0.34, 10), col, 0.035);
        b.position.y = 0.2 + i * 0.34;
        g.add(b);
      });
      const cap = U.inked(new THREE.SphereGeometry(0.34, 10, 8), c.chrome, 0.04);
      cap.position.y = 2.28;
      g.add(cap);
      g.userData = { kind: OB.BLOCK, yMin: 0, yMax: 2.6, halfW: 0.5 };
      return g;
    };

    this.obPools = {
      [OB.HURDLE]: new U.Pool(mkHurdle),
      [OB.BAR]: new U.Pool(mkBar),
      [OB.BLOCK]: new U.Pool(mkBlock)
    };

    const mkTuft = () => {
      const g = new THREE.Group();
      // A little clump of hair — three cones fanned out
      for (let i = 0; i < 3; i++) {
        const s = U.inked(new THREE.ConeGeometry(0.11, 0.34, 5), c.hair, 0.025);
        s.position.set((i - 1) * 0.1, 0, 0);
        s.rotation.z = (i - 1) * 0.45;
        g.add(s);
      }
      g.userData = { kind: 'tuft' };
      return g;
    };
    const mkSerum = () => {
      const g = new THREE.Group();
      const b = U.inked(new THREE.CylinderGeometry(0.2, 0.24, 0.5, 9), c.serum, 0.035);
      g.add(b);
      const cap2 = U.inked(new THREE.CylinderGeometry(0.1, 0.1, 0.18, 8), c.chrome, 0.025);
      cap2.position.y = 0.33;
      g.add(cap2);
      g.userData = { kind: 'serum' };
      return g;
    };
    const mkPomade = () => {
      const g = new THREE.Group();
      const j = U.inked(new THREE.CylinderGeometry(0.28, 0.28, 0.3, 12), c.pomade, 0.035);
      g.add(j);
      const lid = U.inked(new THREE.CylinderGeometry(0.29, 0.29, 0.1, 12), c.chrome, 0.025);
      lid.position.y = 0.2;
      g.add(lid);
      g.userData = { kind: 'pomade' };
      return g;
    };

    this.pickPools = {
      tuft: new U.Pool(mkTuft),
      serum: new U.Pool(mkSerum),
      pomade: new U.Pool(mkPomade)
    };

    // Roadside scenery: barber poles and shopfront awnings. Purely decorative,
    // but it's what makes the track read as a street rather than a white void.
    this.sceneryPool = new U.Pool(() => {
      const g = new THREE.Group();
      const which = Math.random();

      if (which < 0.55) {
        // Barber pole on a bracket
        const post = U.inked(new THREE.CylinderGeometry(0.09, 0.09, 3.0, 7), c.chromeDk, 0.05);
        post.position.y = 1.5;
        g.add(post);
        const bands = [c.pole, 0xf4efe4, c.poleB, 0xf4efe4, c.pole, 0xf4efe4, c.poleB];
        bands.forEach((col, i) => {
          const b = U.inked(new THREE.CylinderGeometry(0.22, 0.22, 0.22, 9), col, 0.04);
          b.position.set(0, 1.9 + i * 0.22, 0.3);
          g.add(b);
        });
        const capTop = U.inked(new THREE.SphereGeometry(0.22, 9, 7), c.chrome, 0.045);
        capTop.position.set(0, 3.45, 0.3);
        g.add(capTop);
      } else {
        // Shopfront: awning over a dark window
        const wall = U.inked(new THREE.BoxGeometry(0.4, 3.0, 3.4), c.wall, 0.07);
        wall.position.y = 1.5;
        g.add(wall);
        const win = U.inked(new THREE.BoxGeometry(0.16, 1.3, 2.3), 0x3a3f48, 0.05);
        win.position.set(-0.24, 1.55, 0);
        g.add(win);
        const awning = U.inked(new THREE.BoxGeometry(0.9, 0.22, 3.2), c.pole, 0.06);
        awning.position.set(-0.55, 2.45, 0);
        awning.rotation.z = 0.2;
        g.add(awning);
        const stripe = U.inked(new THREE.BoxGeometry(0.92, 0.1, 1.1), c.marker, 0.04);
        stripe.position.set(-0.57, 2.52, 0);
        stripe.rotation.z = 0.2;
        g.add(stripe);
      }
      return g;
    });
    this.scenery = [];
  };

  /* ---- Patterns --------------------------------------------------------
   * Each entry lists which lanes are blocked and by what. `maxBlocked` from
   * the difficulty tier caps how many lanes a pattern may occupy, which is
   * what guarantees at least one lane is always survivable.
   */
  const PATTERNS = [
    { w: 26, blocked: 1, build: (l) => [{ lane: l, kind: OB.HURDLE }] },
    { w: 22, blocked: 1, build: (l) => [{ lane: l, kind: OB.BAR }] },
    { w: 20, blocked: 1, build: (l) => [{ lane: l, kind: OB.BLOCK }] },
    // Two lanes blocked, one gap — only unlocked at higher tiers
    { w: 14, blocked: 2, build: (l) => {
        const others = [0, 1, 2].filter((x) => x !== l);
        return others.map((o) => ({ lane: o, kind: OB.BLOCK }));
      } },
    { w: 12, blocked: 2, build: (l) => {
        const others = [0, 1, 2].filter((x) => x !== l);
        return others.map((o) => ({ lane: o, kind: OB.HURDLE }));
      } },
    // Full-width low bar: must slide, any lane works
    { w: 10, blocked: 3, build: () => [0, 1, 2].map((o) => ({ lane: o, kind: OB.BAR })) },
    // Full-width hurdle row: must jump
    { w: 8, blocked: 3, build: () => [0, 1, 2].map((o) => ({ lane: o, kind: OB.HURDLE })) }
  ];

  World.prototype.tier = function (metres) {
    const tiers = PP.CFG.TIERS;
    let t = tiers[0];
    for (const x of tiers) if (metres >= x.at) t = x;
    return t;
  };

  /** Spawn one chunk's worth of content starting at world z = zStart. */
  World.prototype._populate = function (zStart, metres, speed) {
    const cfg = PP.CFG, cfgS = PP.CFG, U = PP.U, rand = this.rand;
    const tier = this.tier(metres);
    const len = cfg.CHUNK_LEN;

    // Minimum spacing so the player always has time to react.
    const minGap = Math.max(7, speed * cfg.MIN_REACTION * 1.7);

    let z = zStart;
    const end = zStart - len;

    while (z > end) {
      z -= minGap + rand() * minGap * 0.7;
      if (z <= end) break;
      if (rand() > tier.density) continue;

      // "Full width" patterns are always survivable (jump or slide), so they
      // are allowed regardless of maxBlocked; partial blockers are capped.
      const usable = PATTERNS.filter((p) => p.blocked <= tier.maxBlocked || p.blocked === 3);
      const pat = U.weighted(rand, usable);
      const freeLane = (rand() * 3) | 0;

      for (const spec of pat.build(freeLane)) {
        this._addObstacle(spec.kind, spec.lane, z);
      }

      // Reward the free lane with a line of tufts just past the pattern.
      if (pat.blocked < 3 && rand() < 0.75) {
        const n = 3 + ((rand() * 3) | 0);
        for (let i = 0; i < n; i++) {
          this._addPickup('tuft', freeLane, z - 3 - i * 1.5, 0.9);
        }
      } else if (pat.blocked === 3 && rand() < 0.6) {
        // Over/under a full-width pattern: arc of tufts at jump height
        const lane = (rand() * 3) | 0;
        for (let i = 0; i < 4; i++) {
          this._addPickup('tuft', lane, z + 1.6 - i * 1.3, 1.2 + Math.sin(i / 3 * Math.PI) * 0.9);
        }
      }
    }

    // Power-ups, sparsely
    if (rand() < cfg.POMADE_CHANCE) {
      this._addPickup('pomade', (rand() * 3) | 0, zStart - len * rand(), 0.9);
    }
    if (rand() < cfg.SERUM_CHANCE) {
      this._addPickup('serum', (rand() * 3) | 0, zStart - len * rand(), 0.9);
    }

    // Scenery along both kerbs, facing inward toward the street. It sits well
    // outside the track: any closer and a shopfront swallows half the frame
    // as the camera slides past it.
    for (let i = 0; i < 3; i++) {
      const s = this.sceneryPool.get();
      const side = rand() < 0.5 ? -1 : 1;
      s.position.set(
        side * (cfgS.SCENERY_X_MIN + rand() * cfgS.SCENERY_X_RANGE),
        0.42,                       // stand on the sidewalk, not sunk through it
        zStart - rand() * len
      );
      s.rotation.y = side < 0 ? Math.PI : 0;
      this.scene.add(s);
      this.scenery.push(s);
    }
  };

  World.prototype._addObstacle = function (kind, lane, z) {
    const o = this.obPools[kind].get();
    o.position.set(PP.CFG.LANE_X[lane], 0, z);
    o.visible = true;
    this.scene.add(o);
    o.userData.lane = lane;
    this.obstacles.push(o);
    return o;
  };

  World.prototype._addPickup = function (kind, lane, z, y) {
    const p = this.pickPools[kind].get();
    p.position.set(PP.CFG.LANE_X[lane], y, z);
    p.visible = true;
    p.userData.taken = false;
    p.userData.lane = lane;
    this.scene.add(p);
    this.pickups.push(p);
    return p;
  };

  World.prototype.reset = function (metres, speed) {
    // Recycle everything currently alive
    for (const o of this.obstacles) { this.scene.remove(o); this.obPools[o.userData.kind].put(o); }
    for (const p of this.pickups) { this.scene.remove(p); this.pickPools[p.userData.kind].put(p); }
    for (const s of this.scenery) { this.scene.remove(s); this.sceneryPool.put(s); }
    this.obstacles.length = 0;
    this.pickups.length = 0;
    this.scenery.length = 0;

    this.nextZ = -PP.CFG.CHUNK_LEN;
    // Leave the first stretch empty so the player gets a running start.
    for (let i = 0; i < PP.CFG.SPAWN_AHEAD; i++) {
      this._populate(this.nextZ - PP.CFG.CHUNK_LEN, 0, PP.CFG.SPEED_START);
      this.nextZ -= PP.CFG.CHUNK_LEN;
    }
  };

  /** Advance the world toward the player by `dz` and stream in new content. */
  World.prototype.update = function (dz, metres, speed) {
    const cfg = PP.CFG;

    const shift = (arr, pool) => {
      for (let i = arr.length - 1; i >= 0; i--) {
        const it = arr[i];
        it.position.z += dz;
        // Anything the player has run past is still on screen behind him —
        // it's the background of every frame now — so it lives much longer
        // than it did when the camera trailed him.
        if (it.position.z > PP.CFG.CULL_BEHIND) {
          this.scene.remove(it);
          if (pool) pool(it);
          arr.splice(i, 1);
        }
      }
    };

    shift(this.obstacles, (o) => this.obPools[o.userData.kind].put(o));
    shift(this.pickups, (p) => this.pickPools[p.userData.kind].put(p));
    shift(this.scenery, (s) => this.sceneryPool.put(s));

    // Spin the pickups so they catch the eye
    const t = performance.now() * 0.003;
    for (const p of this.pickups) {
      p.rotation.y = t * (p.userData.kind === 'tuft' ? 2 : 1.2);
      if (p.userData.kind !== 'tuft') p.position.y += Math.sin(t * 2 + p.position.z) * 0.0025;
    }

    // Scroll the floor texture instead of moving the floor mesh
    this.floor.material.map.offset.y -= dz * 0.0154;

    this.nextZ += dz;
    while (this.nextZ > -cfg.CHUNK_LEN * cfg.SPAWN_AHEAD) {
      this._populate(this.nextZ - cfg.CHUNK_LEN, metres, speed);
      this.nextZ -= cfg.CHUNK_LEN;
    }
  };

  World.OB = OB;
  return World;
})();
