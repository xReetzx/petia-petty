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

  // Three kinds of stalled traffic, one per way of getting past it.
  const OB = {
    CAR: 'car',   // low enough to vault
    RIG: 'rig',   // container up on a flatbed — slide under it
    VAN: 'van'    // solid wall of van — change lanes
  };

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
      new THREE.MeshBasicMaterial({ map: tex })
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    this.floor = floor;

    // Sidewalks running the length of the track. Without these the barber
    // poles and shopfronts hang in empty space either side of the road.
    [-1, 1].forEach((s) => {
      const walk = new THREE.Mesh(
        new THREE.PlaneGeometry(24, 600),
        new THREE.MeshToonMaterial({
          color: c.walk, map: this._walkTexture(), gradientMap: U.toonGradient()
        })
      );
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(s * 16.6, 0.42, 0);
      this.scene.add(walk);
    });

    // Kerbs either side to frame the run.
    // No inverted-hull outline here: on a 600-unit-long box the hull scales by
    // a hair and z-fights with the mesh, which showed up as a black band
    // stretching down the track. A dark cap strip gives the same inked edge.
    [-1, 1].forEach((s) => {
      const kerb = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.46, 600),
        U.toonMat(c.kerbCol)
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

  /* Paving slabs for the sidewalk. */
  World.prototype._walkTexture = function () {
    if (this._walkTex) return this._walkTex;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = 'rgba(20,16,19,0.34)';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(128, i * 64); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, 128); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let i = 0; i < 260; i++) {
      ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(5, 130);
    this._walkTex = t;
    return t;
  };

  World.prototype._floorTexture = function () {
    const c = PP.CFG.COL;
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 512;
    const ctx = cv.getContext('2d');
    const hex = (n) => '#' + n.toString(16).padStart(6, '0');

    // Asphalt, roughed up so it isn't a flat slab of grey
    ctx.fillStyle = hex(c.road);
    ctx.fillRect(0, 0, 256, 512);
    ctx.fillStyle = hex(c.roadDark);
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * 256, y = Math.random() * 512;
      ctx.globalAlpha = 0.1 + Math.random() * 0.25;
      ctx.fillRect(x, y, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
    ctx.globalAlpha = 1;
    PP.U.hatch(ctx, 0, 0, 256, 512, 17, Math.PI / 3, 0.07, '#000');

    // The texture spans the full road width, so lane dividers land at the
    // boundaries between the three lanes and the solid lines mark the edges.
    const dash = (x, color, w) => {
      ctx.fillStyle = color;
      for (let y = 0; y < 512; y += 96) ctx.fillRect(x - w / 2, y, w, 54);
    };
    dash(96, hex(c.lineMid), 7);
    dash(160, hex(c.lineMid), 7);

    ctx.fillStyle = hex(c.lineMark);
    ctx.fillRect(10, 0, 6, 512);
    ctx.fillRect(240, 0, 6, 512);

    // Worn paint: knock holes in the markings so they read as hand-inked
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 130; i++) {
      ctx.globalAlpha = 0.25 + Math.random() * 0.5;
      ctx.fillRect(Math.random() * 256, Math.random() * 512, 2 + Math.random() * 5, 2 + Math.random() * 7);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 40);
    return tex;
  };

  World.prototype._pools = function () {
    const U = PP.U, c = PP.CFG.COL;

    const pickCar = () => c.cars[(Math.random() * c.cars.length) | 0];

    // Four wheels on a chassis of the given footprint.
    const wheels = (g, halfW, halfL, r) => {
      [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => {
        const w = U.inked(new THREE.CylinderGeometry(r, r, 0.17, 9), c.tyre, 0.035);
        w.rotation.z = Math.PI / 2;
        w.position.set(sx * halfW, r, sz * halfL);
        g.add(w);
      }));
    };

    /* --- Low car: vault the bonnet ------------------------------------- */
    const mkCar = () => {
      const g = new THREE.Group();
      const paint = pickCar();

      const body = U.inked(new THREE.BoxGeometry(1.5, 0.46, 3.3), paint, 0.055);
      body.position.y = 0.52;
      g.add(body);

      // Cabin set back and narrowed, so the silhouette reads as a car
      const cabin = U.inked(new THREE.BoxGeometry(1.32, 0.42, 1.55), paint, 0.05);
      cabin.position.set(0, 0.94, 0.12);
      g.add(cabin);
      const glass = U.inked(new THREE.BoxGeometry(1.36, 0.3, 1.2), c.glass, 0.04);
      glass.position.set(0, 0.96, 0.12);
      g.add(glass);

      wheels(g, 0.74, 1.12, 0.3);

      // Lights: white at the front (facing the oncoming player), red behind
      [-1, 1].forEach((sx) => {
        const hl = U.inked(new THREE.BoxGeometry(0.3, 0.16, 0.1), 0xfff3cf, 0.03);
        hl.position.set(sx * 0.52, 0.56, -1.68);
        g.add(hl);
        const tl = U.inked(new THREE.BoxGeometry(0.3, 0.16, 0.1), 0xd94a4a, 0.03);
        tl.position.set(sx * 0.52, 0.6, 1.68);
        g.add(tl);
      });

      g.userData = { kind: OB.CAR, yMin: 0, yMax: 1.18, halfW: 0.88 };
      return g;
    };

    /* --- Flatbed rig: container up on stilts, slide underneath --------- */
    const mkRig = () => {
      const g = new THREE.Group();

      // Deck held high so there's a clear gap at road level
      const deck = U.inked(new THREE.BoxGeometry(2.0, 0.22, 4.6), c.rigDeck, 0.055);
      deck.position.y = 1.42;
      g.add(deck);

      const box = U.inked(new THREE.BoxGeometry(1.9, 1.5, 4.2), c.rigBody, 0.07);
      box.position.y = 2.28;
      g.add(box);
      // Corrugation so it isn't a blank slab
      for (let i = 0; i < 6; i++) {
        const rib = U.inked(new THREE.BoxGeometry(1.94, 1.4, 0.1), c.rigDeck, 0.03);
        rib.position.set(0, 2.28, -1.75 + i * 0.7);
        g.add(rib);
      }

      // Stilts at the corners, kept narrow and outboard of the lane centre
      [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => {
        const leg = U.inked(new THREE.BoxGeometry(0.2, 1.3, 0.24), c.rigDeck, 0.04);
        leg.position.set(sx * 0.85, 0.66, sz * 1.95);
        g.add(leg);
      }));

      g.userData = { kind: OB.RIG, yMin: 1.15, yMax: 3.3, halfW: 1.0 };
      return g;
    };

    /* --- Box van: solid, change lanes ---------------------------------- */
    const mkVan = () => {
      const g = new THREE.Group();
      const paint = pickCar();

      const cab = U.inked(new THREE.BoxGeometry(1.55, 1.25, 1.35), paint, 0.06);
      cab.position.set(0, 1.0, -1.35);
      g.add(cab);
      const wind = U.inked(new THREE.BoxGeometry(1.4, 0.55, 0.12), c.glass, 0.04);
      wind.position.set(0, 1.3, -2.0);
      g.add(wind);

      const box = U.inked(new THREE.BoxGeometry(1.7, 1.95, 2.9), c.rigBody, 0.07);
      box.position.set(0, 1.42, 0.55);
      g.add(box);
      // Livery band in the cab's colour, so the van reads against a pale sky
      const stripe = U.inked(new THREE.BoxGeometry(1.74, 0.66, 2.9), paint, 0.04);
      stripe.position.set(0, 0.86, 0.55);
      g.add(stripe);
      const roof = U.inked(new THREE.BoxGeometry(1.74, 0.18, 2.9), paint, 0.04);
      roof.position.set(0, 2.4, 0.55);
      g.add(roof);

      wheels(g, 0.8, 1.3, 0.34);

      g.userData = { kind: OB.VAN, yMin: 0, yMax: 2.6, halfW: 0.95 };
      return g;
    };

    this.obPools = {
      [OB.CAR]: new U.Pool(mkCar),
      [OB.RIG]: new U.Pool(mkRig),
      [OB.VAN]: new U.Pool(mkVan)
    };

    /* --- Pickups -------------------------------------------------------- */
    const mkTuft = () => {
      const g = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const sp = U.inked(new THREE.ConeGeometry(0.11, 0.34, 5), c.hair, 0.025);
        sp.position.set((i - 1) * 0.1, 0, 0);
        sp.rotation.z = (i - 1) * 0.45;
        g.add(sp);
      }
      g.userData = { kind: 'tuft' };
      return g;
    };
    const mkSerum = () => {
      const g = new THREE.Group();
      g.add(U.inked(new THREE.CylinderGeometry(0.2, 0.24, 0.5, 9), c.serum, 0.035));
      const cap = U.inked(new THREE.CylinderGeometry(0.1, 0.1, 0.18, 8), c.chrome, 0.025);
      cap.position.y = 0.33;
      g.add(cap);
      g.userData = { kind: 'serum' };
      return g;
    };
    const mkPomade = () => {
      const g = new THREE.Group();
      g.add(U.inked(new THREE.CylinderGeometry(0.28, 0.28, 0.3, 12), c.pomade, 0.035));
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

    /* --- Roadside city -------------------------------------------------- */
    this.facades = [0, 1, 2, 3].map((i) => this._facadeTexture(i));

    this.sceneryPool = new U.Pool(() => {
      const g = new THREE.Group();
      const roll = Math.random();

      if (roll < 0.62) {
        // Building. Height varies a lot so the skyline has a rhythm.
        const h = 6 + Math.random() * 15;
        const w = 5.5 + Math.random() * 6;
        const d = 6 + Math.random() * 8;
        const tex = this.facades[(Math.random() * this.facades.length) | 0];
        const mat = new THREE.MeshToonMaterial({
          color: c.bldg[(Math.random() * c.bldg.length) | 0],
          map: tex,
          gradientMap: U.toonGradient()
        });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        U.outline(b, 0.12);
        b.position.y = h / 2;
        g.add(b);

        // Ground-floor shopfront, so the street level isn't a blank wall
        const shop = U.inked(new THREE.BoxGeometry(w * 0.99, 2.4, d * 0.99), 0x3a3f48, 0.08);
        shop.position.y = 1.2;
        g.add(shop);
        // A narrow awning over the entrance only, not a band round the block
        const awn = U.inked(new THREE.BoxGeometry(w * 0.42, 0.2, 0.9), c.pole, 0.05);
        awn.position.set(0, 2.5, -d / 2 - 0.3);
        g.add(awn);
      } else if (roll < 0.84) {
        // Street lamp with an arm reaching over the road
        const post = U.inked(new THREE.CylinderGeometry(0.11, 0.15, 6.4, 8), c.lamp, 0.05);
        post.position.y = 3.2;
        g.add(post);
        const arm = U.inked(new THREE.BoxGeometry(2.3, 0.14, 0.14), c.lamp, 0.04);
        arm.position.set(-1.1, 6.3, 0);
        g.add(arm);
        const hood = U.inked(new THREE.BoxGeometry(0.75, 0.2, 0.42), c.lamp, 0.04);
        hood.position.set(-2.1, 6.2, 0);
        g.add(hood);
        const bulb = new THREE.Mesh(
          new THREE.BoxGeometry(0.6, 0.08, 0.34),
          new THREE.MeshBasicMaterial({ color: 0xffeeae })
        );
        bulb.position.set(-2.1, 6.06, 0);
        g.add(bulb);
      } else {
        // Traffic light
        const post = U.inked(new THREE.CylinderGeometry(0.1, 0.13, 4.6, 8), c.lamp, 0.05);
        post.position.y = 2.3;
        g.add(post);
        const housing = U.inked(new THREE.BoxGeometry(0.46, 1.25, 0.4), 0x2f3540, 0.05);
        housing.position.set(-0.35, 4.6, 0);
        g.add(housing);
        [[0.38, 0xd94a4a], [0, 0xe0b21f], [-0.38, 0x57a86b]].forEach(([dy, col]) => {
          const lens = new THREE.Mesh(
            new THREE.SphereGeometry(0.13, 8, 6),
            new THREE.MeshBasicMaterial({ color: col })
          );
          lens.position.set(-0.35, 4.6 + dy, -0.22);
          g.add(lens);
        });
      }
      return g;
    });
    this.scenery = [];
  };

  /* A building facade: rows of windows, drawn once and reused. */
  World.prototype._facadeTexture = function (variant) {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 256;
    const ctx = cv.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 128, 256);

    const cols = 3 + (variant % 3);
    const rows = 8 + variant * 2;
    const mw = 128 / cols, mh = 256 / rows;
    const ww = mw * 0.52, wh = mh * 0.52;

    for (let r = 0; r < rows; r++) {
      for (let cI = 0; cI < cols; cI++) {
        const x = cI * mw + (mw - ww) / 2;
        const y = r * mh + (mh - wh) / 2;
        // A few windows lit, the rest dark glass
        const lit = Math.random() < 0.22;
        ctx.fillStyle = lit ? '#ffe9b0' : '#6b7480';
        ctx.fillRect(x, y, ww, wh);
        ctx.strokeStyle = 'rgba(20,16,19,0.85)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, ww, wh);
      }
    }
    // Floor lines
    ctx.strokeStyle = 'rgba(20,16,19,0.28)';
    ctx.lineWidth = 1.5;
    for (let r = 1; r < rows; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * mh); ctx.lineTo(128, r * mh); ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  };

  /* ---- Patterns --------------------------------------------------------
   * Each entry lists which lanes are blocked and by what. `maxBlocked` from
   * the difficulty tier caps how many lanes a pattern may occupy, which is
   * what guarantees at least one lane is always survivable.
   */
  const PATTERNS = [
    { w: 26, blocked: 1, build: (l) => [{ lane: l, kind: OB.CAR }] },
    { w: 22, blocked: 1, build: (l) => [{ lane: l, kind: OB.RIG }] },
    { w: 20, blocked: 1, build: (l) => [{ lane: l, kind: OB.VAN }] },
    // Two lanes blocked, one gap — only unlocked at higher tiers
    { w: 14, blocked: 2, build: (l) => {
        const others = [0, 1, 2].filter((x) => x !== l);
        return others.map((o) => ({ lane: o, kind: OB.VAN }));
      } },
    { w: 12, blocked: 2, build: (l) => {
        const others = [0, 1, 2].filter((x) => x !== l);
        return others.map((o) => ({ lane: o, kind: OB.CAR }));
      } },
    // Traffic jammed clean across the road, up on flatbeds: slide under it
    { w: 10, blocked: 3, build: () => [0, 1, 2].map((o) => ({ lane: o, kind: OB.RIG })) },
    // Bumper-to-bumper low cars: vault the lot
    { w: 8, blocked: 3, build: () => [0, 1, 2].map((o) => ({ lane: o, kind: OB.CAR })) }
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
    this.floor.material.map.offset.y -= dz * (40 / 600);

    this.nextZ += dz;
    while (this.nextZ > -cfg.CHUNK_LEN * cfg.SPAWN_AHEAD) {
      this._populate(this.nextZ - cfg.CHUNK_LEN, metres, speed);
      this.nextZ -= cfg.CHUNK_LEN;
    }
  };

  World.OB = OB;
  return World;
})();
