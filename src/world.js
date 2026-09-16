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
  /* Obstacles.
   *
   * The collision system is only ever a band — `yMin`, `yMax`, `halfW` — so
   * variety is free as long as every kind maps onto one of three answers the
   * player has. JUMP is anything low enough to vault, SLIDE is anything held
   * clear of the road, BLOCK is anything you can only go around. A kind whose
   * band does not match its archetype is an unavoidable hit, which is why
   * `npm test` now checks every one of them against the jump apex and the
   * slide height.
   */
  const OB = {
    CAR:      'car',       // jump  — stalled sedan
    CAB:      'cab',       // jump  — yellow taxi, roof light and all
    CONES:    'cones',     // jump  — construction barrier and cones
    PLATE:    'plate',     // jump  — steel road plate, low and mean
    RIG:      'rig',       // slide — container up on a flatbed
    GANTRY:   'gantry',    // slide — scaffolding over the road
    VAN:      'van',       // block — box van
    TRUCK:    'truck',     // block — box truck, taller still
    DUMPSTER: 'dumpster'   // block — skip parked in the lane
  };

  // Which answer each kind demands. Read by the suite, not just by eye.
  const ARCHETYPE = {
    car: 'jump', cab: 'jump', cones: 'jump', plate: 'jump',
    rig: 'slide', gantry: 'slide',
    van: 'block', truck: 'block', dumpster: 'block'
  };

  function World(scene, seed) {
    this.scene = scene;
    this.rand = PP.U.rng(seed || 20260914);
    this.obstacles = [];   // live obstacles, world-space z
    this.pickups = [];
    this.scenery = [];     // buildings, furniture and the crowd
    this.nextZ = 0;        // z where the next chunk begins (negative = ahead)
    this.lastPatternZ = -40;

    this._buildGround();
    this.backdrop = this._buildBackdrop(scene);
    scene.add(this.backdrop);
    this._pools();
  }

  /* --- Dawn ---------------------------------------------------------------
   *
   * Manhattanhenge, in the comic's own language.
   *
   * The sky is FLAT BANDS on a canvas, not a gradient — banding is what a
   * screen print does, and a smooth sky would have read as a different game
   * behind the same character. The sun is a disc with an ink outline and two
   * halo rings, and the skyline is three silhouette strips hazing out with
   * distance. The whole backdrop is five draw calls.
   */
  World.prototype._buildSky = function () {
    const cfg = PP.CFG;
    const cv = document.createElement('canvas');
    cv.width = 8; cv.height = 128;
    const ctx = cv.getContext('2d');
    const bands = cfg.SKY_BANDS;
    // Weighted toward the horizon: most of the colour happens in the last
    // third of the sky, which is where the eye is at this camera angle.
    let y = 0;
    bands.forEach((col, i) => {
      const t = i / (bands.length - 1);
      const h = 128 * (0.05 + 0.26 * Math.pow(t, 1.7));
      ctx.fillStyle = col;
      ctx.fillRect(0, y, 8, Math.ceil(h) + 1);
      y += h;
    });
    ctx.fillStyle = bands[bands.length - 1];
    ctx.fillRect(0, y, 8, 128 - y);
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter;   // keep the band edges hard
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return tex;
  };

  World.prototype._buildBackdrop = function (scene) {
    const cfg = PP.CFG, c = cfg.COL, U = PP.U;
    const g = new THREE.Group();
    scene.background = this._buildSky();

    /* No sky PLANE.
     *
     * A wall down the avenue only ever shows the slice of itself the frustum
     * happens to cross — at this camera angle that was the bottom third, so
     * the whole violet half of the sky was off-screen and it read as a flat
     * orange wash. The banded texture goes on `scene.background` instead,
     * which fills the frame exactly and costs no draw call at all.
     */

    /* The sun. Rings first so the disc lands on top of them, and all of it
     * unfogged — fog is for the street, and a sun that fades into haze is not
     * a sun you are running toward.
     */
    [2.1, 1.55].forEach((mult, i) => {
      const ring = new THREE.Mesh(
        new THREE.CircleGeometry(cfg.SUN_R * mult, 48),
        new THREE.MeshBasicMaterial({
          color: cfg.SUN_RING, fog: false, transparent: true,
          opacity: i === 0 ? 0.16 : 0.28, depthWrite: false
        })
      );
      ring.position.set(0, cfg.SUN_Y + 6, cfg.SUN_Z - 2 + i);
      ring.renderOrder = -9 + i;
      g.add(ring);
    });
    const sun = new THREE.Mesh(
      new THREE.CircleGeometry(cfg.SUN_R, 48),
      new THREE.MeshBasicMaterial({ color: cfg.SUN_COL, fog: false, depthWrite: false })
    );
    sun.position.set(0, cfg.SUN_Y + 6, cfg.SUN_Z);
    sun.renderOrder = -7;
    g.add(sun);
    // Ink rim, so it belongs to the same drawing as everything else
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(cfg.SUN_R, cfg.SUN_R * 1.035, 48),
      new THREE.MeshBasicMaterial({ color: c.ink, fog: false, depthWrite: false })
    );
    rim.position.copy(sun.position);
    rim.position.z += 0.5;
    rim.renderOrder = -6;
    g.add(rim);

    /* Skyline: three silhouette strips at decreasing contrast. Cheap depth —
     * before this there was nothing at all past the fog, so the avenue simply
     * stopped.
     */
    /* Skyline sits UNDER the sun, not over it.
     *
     * These strips were centred high enough to cover the sun completely —
     * they are in front of it in Z, so it simply never appeared. A ridge of
     * rooftops below a low sun is the shot; a wall of silhouette in front of
     * it is not.
     */
    cfg.SKYLINE_COLS.forEach((col, i) => {
      const cv = document.createElement('canvas');
      cv.width = 512; cv.height = 128;
      const ctx = cv.getContext('2d');
      const rand = PP.U.rng(7000 + i * 31);
      ctx.clearRect(0, 0, 512, 128);
      ctx.fillStyle = '#ffffff';
      let x = 0;
      while (x < 512) {
        const w = 14 + rand() * 40;
        const h = 26 + rand() * (i === 0 ? 92 : 60);
        ctx.fillRect(x, 128 - h, w, h);
        // The odd water tower and mast, so the ridge is not just rectangles
        if (rand() < 0.3) ctx.fillRect(x + w * 0.3, 128 - h - 9, w * 0.3, 9);
        if (rand() < 0.2) ctx.fillRect(x + w * 0.5, 128 - h - 18, 2, 18);
        x += w + 2 + rand() * 7;
      }
      const tex = new THREE.CanvasTexture(cv);
      const h = 132 - i * 24;
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(900 - i * 110, h),
        new THREE.MeshBasicMaterial({
          map: tex, color: col, transparent: true, fog: false, depthWrite: false
        })
      );
      // Ridge tops just under the sun's centre
      strip.position.set(0, cfg.SKYLINE_TOP - h / 2, cfg.SUN_Z + 14 + i * 18);
      strip.renderOrder = -5 + i;
      g.add(strip);
    });

    return g;
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

    // One material for the entire world: vertex colours carry the paint, so
    // everything merged can share it. Declared here because every factory
    // below reaches for it.
    this.cityMat = new THREE.MeshToonMaterial({
      vertexColors: true, gradientMap: U.toonGradient()
    });

    /* --- Obstacles -------------------------------------------------------
     *
     * Each one merges to a single vertex-coloured mesh plus one outline: two
     * draw calls instead of the eighteen to twenty-four they used to cost as
     * loose inked parts. The outline stays — on the road, unlike on a distant
     * cornice, the ink is what makes a thing read as solid at speed.
     */
    const ob = (build, halfW, yMin, yMax, kind) => () => {
      const L = U.partList();
      build(L, U, c);
      const m = new THREE.Mesh(U.merge(L.parts), this.cityMat);
      U.outline(m, 0.06);
      m.userData = { kind: kind, yMin: yMin, yMax: yMax, halfW: halfW };
      return m;
    };
    const B = () => U.cachedGeo('unit', () => new THREE.BoxGeometry(1, 1, 1));
    const WH = () => U.cachedGeo('cwheel', () => new THREE.CylinderGeometry(0.3, 0.3, 0.17, 9));
    const wheels4 = (L, hw, hl, col) => {
      [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => {
        L.add(WH(), col, [sx * hw, 0.3, sz * hl], [0, 0, Math.PI / 2]);
      }));
    };

    const mkCar = ob((L, U, c) => {
      const paint = c.cars[(Math.random() * c.cars.length) | 0];
      L.add(B(), paint, [0, 0.52, 0], null, [1.5, 0.46, 3.3]);
      L.add(B(), paint, [0, 0.94, 0.12], null, [1.32, 0.42, 1.55]);
      L.add(B(), c.glass, [0, 0.96, 0.12], null, [1.36, 0.3, 1.22]);
      wheels4(L, 0.74, 1.12, c.tyre);
      [-1, 1].forEach((sx) => {
        L.add(B(), 0xfff3cf, [sx * 0.52, 0.56, -1.68], null, [0.3, 0.16, 0.1]);
        L.add(B(), 0xd94a4a, [sx * 0.52, 0.6, 1.68], null, [0.3, 0.16, 0.1]);
      });
    }, 0.88, 0, 1.18, OB.CAR);

    const mkCab = ob((L, U, c) => {
      const YELLOW = 0xf2c014, CHECK = 0x2b2b2b;
      L.add(B(), YELLOW, [0, 0.52, 0], null, [1.5, 0.46, 3.3]);
      L.add(B(), YELLOW, [0, 0.94, 0.12], null, [1.32, 0.42, 1.55]);
      L.add(B(), c.glass, [0, 0.96, 0.12], null, [1.36, 0.3, 1.22]);
      // Checker band and the roof light — the two things that say "cab"
      L.add(B(), CHECK, [0, 0.66, 0], null, [1.52, 0.14, 3.32]);
      L.add(B(), 0xfff3cf, [0, 1.23, 0.12], null, [0.62, 0.2, 0.3]);
      wheels4(L, 0.74, 1.12, c.tyre);
      [-1, 1].forEach((sx) => {
        L.add(B(), 0xfff3cf, [sx * 0.52, 0.56, -1.68], null, [0.3, 0.16, 0.1]);
      });
    }, 0.88, 0, 1.18, OB.CAB);

    const mkCones = ob((L, U, c) => {
      // Barrier boards on feet, with cones out front
      L.add(B(), 0xe8763a, [0, 0.52, 0], null, [1.9, 0.26, 0.14]);
      L.add(B(), 0xf0ece0, [0, 0.52, -0.08], null, [0.5, 0.27, 0.06]);
      L.add(B(), 0xe8763a, [0, 0.82, 0], null, [1.9, 0.26, 0.14]);
      [-1, 1].forEach((sx) => {
        L.add(B(), 0x8a8072, [sx * 0.8, 0.3, 0], null, [0.12, 0.62, 0.7]);
      });
      [-0.6, 0, 0.6].forEach((x, i) => {
        L.add(U.cachedGeo('cone', () => new THREE.ConeGeometry(0.2, 0.62, 8)),
              0xe8763a, [x, 0.31, -0.9 - (i % 2) * 0.4]);
        L.add(B(), 0xf0ece0, [x, 0.38, -0.9 - (i % 2) * 0.4], null, [0.24, 0.1, 0.24]);
      });
    }, 0.92, 0, 0.95, OB.CONES);

    const mkPlate = ob((L, U, c) => {
      // Steel road plate over a trench, with a warning stand
      L.add(B(), 0x7d838c, [0, 0.13, 0], null, [2.0, 0.22, 2.4]);
      L.add(B(), 0x5f656e, [0, 0.25, 0], null, [1.7, 0.04, 2.1]);
      L.add(B(), 0xe8763a, [0, 0.52, -1.35], null, [1.1, 0.5, 0.1]);
      L.add(B(), 0x2f3540, [0, 0.72, -1.35], null, [0.9, 0.1, 0.1]);
    }, 0.95, 0, 0.75, OB.PLATE);

    const mkRig = ob((L, U, c) => {
      L.add(B(), c.rigDeck, [0, 1.42, 0], null, [2.0, 0.22, 4.6]);
      L.add(B(), c.rigBody, [0, 2.28, 0], null, [1.9, 1.5, 4.2]);
      for (let i = 0; i < 6; i++) {
        L.add(B(), c.rigDeck, [0, 2.28, -1.75 + i * 0.7], null, [1.94, 1.4, 0.1]);
      }
      [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => {
        L.add(B(), c.rigDeck, [sx * 0.85, 0.66, sz * 1.95], null, [0.2, 1.3, 0.24]);
      }));
    }, 1.0, 1.15, 3.3, OB.RIG);

    const mkGantry = ob((L, U, c) => {
      // Scaffolding straddling the lane: legs outboard, deck overhead
      [-1, 1].forEach((sx) => {
        L.add(B(), 0x6b6252, [sx * 1.05, 0.9, -0.9], null, [0.18, 1.8, 0.18]);
        L.add(B(), 0x6b6252, [sx * 1.05, 0.9, 0.9], null, [0.18, 1.8, 0.18]);
        L.add(B(), 0x6b6252, [sx * 1.05, 1.5, 0], [0.9, 0, 0], [0.1, 2.3, 0.1]);
      });
      L.add(B(), 0x8a8072, [0, 1.95, 0], null, [2.5, 0.2, 2.4]);
      L.add(B(), 0x6b6252, [0, 2.3, 0], null, [2.4, 0.5, 0.14]);
      L.add(B(), 0xe8763a, [0, 1.78, -1.2], null, [2.4, 0.22, 0.1]);
      L.add(B(), 0xf0ece0, [0, 1.78, -1.26], null, [0.5, 0.23, 0.04]);
    }, 1.05, 1.2, 3.1, OB.GANTRY);

    const mkVan = ob((L, U, c) => {
      const paint = c.cars[(Math.random() * c.cars.length) | 0];
      L.add(B(), paint, [0, 1.0, -1.35], null, [1.55, 1.25, 1.35]);
      L.add(B(), c.glass, [0, 1.3, -2.0], null, [1.4, 0.55, 0.12]);
      L.add(B(), c.rigBody, [0, 1.42, 0.55], null, [1.7, 1.95, 2.9]);
      L.add(B(), paint, [0, 0.86, 0.55], null, [1.74, 0.66, 2.9]);
      L.add(B(), paint, [0, 2.4, 0.55], null, [1.74, 0.18, 2.9]);
      wheels4(L, 0.8, 1.3, c.tyre);
    }, 0.95, 0, 2.6, OB.VAN);

    const mkTruck = ob((L, U, c) => {
      L.add(B(), 0x3f7fd0, [0, 1.15, -1.75], null, [1.75, 1.6, 1.6]);
      L.add(B(), c.glass, [0, 1.5, -2.52], null, [1.55, 0.6, 0.12]);
      L.add(B(), 0xe4e0d4, [0, 1.75, 0.7], null, [1.85, 2.5, 3.6]);
      L.add(B(), 0x3f7fd0, [0, 0.72, 0.7], null, [1.88, 0.5, 3.6]);
      L.add(B(), 0x9aa2ad, [0, 1.75, 2.52], null, [1.7, 2.2, 0.12]);
      L.add(B(), 0x2f3540, [0, 0.5, -2.5], null, [1.8, 0.24, 0.2]);
      wheels4(L, 0.85, 1.5, c.tyre);
      L.add(WH(), c.tyre, [0.85, 0.3, 2.0], [0, 0, Math.PI / 2]);
      L.add(WH(), c.tyre, [-0.85, 0.3, 2.0], [0, 0, Math.PI / 2]);
    }, 1.0, 0, 2.95, OB.TRUCK);

    const mkDumpster = ob((L, U, c) => {
      /* Deliberately taller than the jump apex.
       *
       * At 2.0 it was 0.1 under it — a "blocker" you could clear, which is
       * worse than either answer being right: the player learns that skips are
       * jumpable and then eats one. A construction skip is chest-high on a
       * truck anyway. The suite checks this now.
       */
      L.add(B(), 0x4a6b3f, [0, 1.15, 0], null, [1.9, 2.1, 2.9]);
      L.add(B(), 0x3d5a34, [0, 2.26, 0], null, [1.96, 0.16, 2.96]);
      L.add(B(), 0x3d5a34, [0, 1.25, 0], null, [1.98, 0.16, 2.2]);
      [-1, 1].forEach((sz) => {
        L.add(B(), 0x2f3540, [0, 0.16, sz * 1.2], null, [2.0, 0.24, 0.3]);
      });
      // Overflowing, because they always are
      L.add(B(), 0x8a7a5c, [0.35, 2.48, -0.5], [0.3, 0.4, 0], [0.7, 0.5, 0.6]);
      L.add(B(), 0x6b6252, [-0.4, 2.44, 0.6], [0, 0.7, 0.2], [0.6, 0.4, 0.5]);
    }, 1.0, 0, 2.7, OB.DUMPSTER);

    this.obPools = {
      [OB.CAR]: new U.Pool(mkCar),
      [OB.CAB]: new U.Pool(mkCab),
      [OB.CONES]: new U.Pool(mkCones),
      [OB.PLATE]: new U.Pool(mkPlate),
      [OB.RIG]: new U.Pool(mkRig),
      [OB.GANTRY]: new U.Pool(mkGantry),
      [OB.VAN]: new U.Pool(mkVan),
      [OB.TRUCK]: new U.Pool(mkTruck),
      [OB.DUMPSTER]: new U.Pool(mkDumpster)
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

    /* --- Roadside city ---------------------------------------------------
     *
     * Rebuilt around a fixed palette of PRE-MERGED building geometries.
     *
     * Two things were wrong with how this worked. Every building was 24-78
     * separate inked meshes, so thirty of them down the street was over a
     * thousand draw calls on its own. And all scenery shared ONE pool whose
     * type roll happened inside the factory, so once the pool warmed up the
     * mix froze: the same handful of silhouettes recycled for the whole run,
     * each with its height, facade and fire escape baked in permanently.
     *
     * Now: N whole buildings are merged once, at load, into single
     * vertex-coloured geometries. A building is 2 draw calls — the merged
     * mesh and its merged outline — instead of dozens. Placement picks a
     * fresh variant each time, so the street stops repeating, and because
     * variants are shared by reference the memory cost is N, not one per
     * building on screen.
     *
     * Windows are geometry rather than a texture. That costs triangles, which
     * GPUs have in abundance, and buys one material for the entire city plus
     * per-building window lighting that actually differs.
     */
    this.towerGeos = [];
    for (let i = 0; i < PP.CFG.TOWER_VARIANTS; i++) {
      this.towerGeos.push(this._towerGeometry(this.rand));
    }

    const towerMesh = () => {
      const m = new THREE.Mesh(this.towerGeos[0], this.cityMat);
      U.outline(m, 0.13);
      return m;
    };

    /* One pool PER TYPE. With a single shared pool, `put()` returned a tower
     * to the same free list a lamp came out of, so the mix drifted to whatever
     * happened to be created first and never recovered.
     */
    this.sceneryPools = {
      tower: new U.Pool(towerMesh),
      lamp: new U.Pool(() => this._buildLamp()),
      light: new U.Pool(() => this._buildTrafficLight()),
      hydrant: new U.Pool(() => this._buildHydrant()),
      boxes: new U.Pool(() => this._buildNewsBoxes()),
      shelter: new U.Pool(() => this._buildShelter()),
      scaffold: new U.Pool(() => this._buildScaffold()),
      parked: new U.Pool(() => this._buildParkedCar()),
      walker: new U.Pool(() => this._buildWalker())
    };

  };

  /* A Manhattan block, merged into one geometry.
   *
   * Tiered setbacks as it rises, a water tower and rooftop clutter, fire
   * escapes zig-zagging down the street face, a dark storefront at pavement
   * level — and windows as actual quads, lit at random, so no two variants
   * share a lighting pattern the way the four shared facade textures did.
   *
   * Everything goes into one part list and comes out as a single
   * vertex-coloured BufferGeometry. Built once at load; placement reuses these
   * by reference.
   */
  World.prototype._towerGeometry = function (rand) {
    const U = PP.U, c = PP.CFG.COL;
    const L = U.partList();
    const box = (w, h, d) => U.cachedGeo('b' + w + '_' + h + '_' + d,
      () => new THREE.BoxGeometry(w, h, d));

    const w = 5.5 + rand() * 6;
    const d = 6 + rand() * 8;
    const tone = c.bldg[(rand() * c.bldg.length) | 0];

    const tiers = 2 + ((rand() * 2) | 0);
    let y = 0, tw = w, td = d, firstTierH = 0;
    for (let i = 0; i < tiers; i++) {
      const h = (i === 0 ? 9 + rand() * 12 : 5 + rand() * 9);
      if (i === 0) firstTierH = h;
      L.add(box(1, 1, 1), tone, [0, y + h / 2, 0], null, [tw, h, td]);

      /* Windows on the street-facing side, as geometry.
       *
       * Counted from the tier's real size rather than stretched from a fixed
       * texture — the old facade map showed the same window count on a
       * 5.5-wide wall and an 11.5-wide one.
       */
      const cols = Math.max(2, Math.round(tw / 1.5));
      const rows = Math.max(2, Math.round(h / 2.2));
      const ww = tw / cols * 0.52, wh = h / rows * 0.5;
      for (let cx = 0; cx < cols; cx++) {
        for (let ry = 0; ry < rows; ry++) {
          const lit = rand() < 0.26;
          const px = -tw / 2 + (cx + 0.5) * (tw / cols);
          const py = y + (ry + 0.5) * (h / rows);
          // Street face and the two sides, so corners don't read as blank
          L.add(box(1, 1, 1), lit ? 0xffe9b0 : 0x59616e,
                [px, py, -td / 2 - 0.02], null, [ww, wh, 0.06]);
          if (rand() < 0.5) {
            L.add(box(1, 1, 1), lit ? 0xffe9b0 : 0x59616e,
                  [-tw / 2 - 0.02, py, px * (td / tw)], null, [0.06, wh, ww]);
          }
        }
      }

      // Cornice band marking each setback
      L.add(box(1, 1, 1), 0x6b6252, [0, y + h, 0], null, [tw + 0.3, 0.32, td + 0.3]);
      y += h;
      tw *= 0.72 + rand() * 0.1;
      td *= 0.72 + rand() * 0.1;
    }

    // Rooftop: water tower on legs, a vent block, an antenna
    if (rand() < 0.75) {
      const legH = 0.9;
      [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => {
        L.add(box(1, 1, 1), 0x5c5242, [sx * 0.5, y + legH / 2, sz * 0.5], null, [0.12, legH, 0.12]);
      }));
      L.add(U.cachedGeo('tank', () => new THREE.CylinderGeometry(0.72, 0.72, 1.5, 10)),
            0x7a5c42, [0, y + legH + 0.75, 0]);
      L.add(U.cachedGeo('tankroof', () => new THREE.ConeGeometry(0.84, 0.6, 10)),
            0x5c4330, [0, y + legH + 1.75, 0]);
    }
    if (rand() < 0.6) {
      L.add(box(1, 1, 1), 0x8a8072, [tw * 0.45, y + 0.3, -td * 0.3], null, [1.2, 0.6, 1.0]);
    }
    if (rand() < 0.45) {
      L.add(U.cachedGeo('mast', () => new THREE.CylinderGeometry(0.05, 0.07, 3.4, 6)),
            0x5c5242, [-tw * 0.3, y + 1.7, td * 0.25]);
    }

    // Fire escape down the street-facing side
    if (rand() < 0.55) {
      const iron = 0x5f5647;
      const levels = Math.max(0, Math.min(5, Math.floor((firstTierH - 4.2) / 2.4)));
      for (let i = 0; i < levels; i++) {
        const fy = 3.6 + i * 2.4;
        L.add(box(1, 1, 1), iron, [-w / 2 - 0.35, fy, 0], null, [0.7, 0.07, 1.9]);
        L.add(box(1, 1, 1), iron, [-w / 2 - 0.68, fy + 0.62, 0], null, [0.05, 0.05, 1.9]);
        [-1, 1].forEach((sz) => {
          L.add(box(1, 1, 1), iron, [-w / 2 - 0.68, fy + 0.31, sz * 0.9], null, [0.05, 0.62, 0.05]);
        });
        L.add(box(1, 1, 1), iron, [-w / 2 - 0.42, fy + 1.2, (i % 2 ? 1 : -1) * 0.5],
              [(i % 2 ? 1 : -1) * 0.72, 0, 0], [0.5, 0.06, 1.9]);
      }
    }

    // Ground floor: dark storefront, awning, and a lit shop window
    L.add(box(1, 1, 1), 0x3a3f48, [0, 1.2, 0], null, [w * 0.99, 2.4, d * 0.99]);
    L.add(box(1, 1, 1), c.pole, [0, 2.5, -d / 2 - 0.3], null, [w * 0.4, 0.2, 0.9]);
    L.add(box(1, 1, 1), 0xffd98a, [0, 1.1, -d / 2 - 0.03], null, [w * 0.55, 1.3, 0.06]);

    const geo = U.merge(L.parts);
    /* The building's own half-width, carried on the geometry.
     *
     * Placement has to seat a building by its street-facing FACE, not its
     * centre — these are 5.5 to 11.5 wide, so centring an 11.5-wide one on the
     * building line pushed its inner face three units INTO the road, burying
     * the pavement and every hydrant and pedestrian standing on it.
     */
    geo.userData = { halfW: w / 2 };
    return geo;
  };

  /* --- Street furniture --------------------------------------------------
   *
   * Everything here is merged the same way and carries at most one outline.
   * A hydrant that costs eight draw calls is a hydrant you cannot afford to
   * put on every corner, and a crowded street needs them on every corner.
   */
  World.prototype._prop = function (build, outlineThickness) {
    const U = PP.U, L = U.partList();
    build(L, U, PP.CFG.COL);
    const m = new THREE.Mesh(U.merge(L.parts), this.cityMat);
    if (outlineThickness) U.outline(m, outlineThickness);
    return m;
  };

  const BOX = (U) => U.cachedGeo('unit', () => new THREE.BoxGeometry(1, 1, 1));
  const CYL = (U, k, a, b, h, seg) => U.cachedGeo('c' + k,
    () => new THREE.CylinderGeometry(a, b, h, seg));

  World.prototype._buildLamp = function () {
    return this._prop((L, U, c) => {
      L.add(CYL(U, 'lamp', 0.11, 0.15, 6.4, 8), c.lamp, [0, 3.2, 0]);
      L.add(BOX(U), c.lamp, [-1.15, 6.3, 0], null, [2.3, 0.14, 0.14]);
      L.add(BOX(U), 0xffeeae, [-2.1, 6.06, 0], null, [0.6, 0.08, 0.34]);
    }, 0.05);
  };

  World.prototype._buildTrafficLight = function () {
    return this._prop((L, U, c) => {
      L.add(CYL(U, 'tl', 0.1, 0.13, 4.6, 8), c.lamp, [0, 2.3, 0]);
      L.add(BOX(U), c.lamp, [-0.5, 4.6, 0], null, [1.0, 0.1, 0.1]);
      L.add(BOX(U), 0x2f3540, [-0.35, 4.6, -0.1], null, [0.34, 1.05, 0.3]);
      [[0.38, 0xd94a4a], [0, 0xe0b21f], [-0.38, 0x57a86b]].forEach(([dy, col]) => {
        L.add(BOX(U), col, [-0.35, 4.6 + dy, -0.27], null, [0.2, 0.2, 0.06]);
      });
      // Walk signal facing the street
      L.add(BOX(U), 0x2f3540, [0.22, 3.2, -0.1], null, [0.42, 0.5, 0.28]);
      L.add(BOX(U), 0xe8763a, [0.22, 3.2, -0.25], null, [0.3, 0.34, 0.05]);
    }, 0.05);
  };

  World.prototype._buildHydrant = function () {
    return this._prop((L, U, c) => {
      L.add(CYL(U, 'hyd', 0.17, 0.2, 0.62, 8), 0xd94a4a, [0, 0.31, 0]);
      L.add(CYL(U, 'hydcap', 0.13, 0.17, 0.18, 8), 0xd94a4a, [0, 0.69, 0]);
      L.add(BOX(U), 0xb33a3a, [0, 0.4, 0], null, [0.56, 0.14, 0.16]);
      L.add(CYL(U, 'hydbase', 0.26, 0.26, 0.1, 8), 0x8e2d2d, [0, 0.05, 0]);
    }, 0);      // too small to read an outline
  };

  World.prototype._buildNewsBoxes = function () {
    return this._prop((L, U, c) => {
      [0x3f7fd0, 0xe0b21f, 0x57a86b].forEach((col, i) => {
        L.add(BOX(U), col, [(i - 1) * 0.58, 0.44, 0], null, [0.52, 0.88, 0.44]);
        L.add(BOX(U), 0x2f3540, [(i - 1) * 0.58, 0.68, -0.23], null, [0.36, 0.3, 0.04]);
      });
    }, 0.04);
  };

  World.prototype._buildShelter = function () {
    return this._prop((L, U, c) => {
      L.add(BOX(U), 0x3d444e, [0, 1.3, 0], null, [0.12, 2.6, 0.12]);
      L.add(BOX(U), 0x3d444e, [3.0, 1.3, 0], null, [0.12, 2.6, 0.12]);
      L.add(BOX(U), 0x3d444e, [1.5, 2.66, 0], null, [3.4, 0.14, 1.6]);
      L.add(BOX(U), 0x9fc4d8, [1.5, 1.4, 0.7], null, [3.0, 2.2, 0.05]);
      L.add(BOX(U), 0x6b7480, [1.5, 0.5, 0.4], null, [2.6, 0.14, 0.5]);
      // Lit advert panel, the thing that actually reads at speed
      L.add(BOX(U), 0xffe9b0, [3.1, 1.5, 0], null, [0.08, 1.9, 1.1]);
    }, 0.05);
  };

  World.prototype._buildScaffold = function () {
    /* Sidewalk scaffolding. There is no more New York object than this. */
    return this._prop((L, U, c) => {
      for (let i = 0; i < 5; i++) {
        const z = -4 + i * 2;
        L.add(BOX(U), 0x6b6252, [-1.4, 1.5, z], null, [0.16, 3.0, 0.16]);
        L.add(BOX(U), 0x6b6252, [1.4, 1.5, z], null, [0.16, 3.0, 0.16]);
        L.add(BOX(U), 0x6b6252, [0, 3.05, z], null, [3.0, 0.16, 0.16]);
      }
      L.add(BOX(U), 0x8a8072, [0, 3.2, 0], null, [3.2, 0.14, 10]);
      L.add(BOX(U), 0xd94a4a, [-1.5, 2.2, 0], null, [0.1, 0.7, 10]);
      // Cross-bracing down the street face
      for (let i = 0; i < 4; i++) {
        L.add(BOX(U), 0x6b6252, [-1.4, 1.6, -3 + i * 2], [0, 0, 0.7], [0.1, 2.8, 0.1]);
      }
    }, 0.05);
  };

  World.prototype._buildParkedCar = function () {
    return this._prop((L, U, c) => {
      const paint = c.cars[(Math.random() * c.cars.length) | 0];
      L.add(BOX(U), paint, [0, 0.52, 0], null, [1.5, 0.46, 3.3]);
      L.add(BOX(U), paint, [0, 0.94, 0.12], null, [1.32, 0.42, 1.55]);
      L.add(BOX(U), c.glass, [0, 0.96, 0.12], null, [1.36, 0.3, 1.22]);
      [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => {
        L.add(CYL(U, 'wheel', 0.3, 0.3, 0.17, 9), c.tyre,
              [sx * 0.74, 0.3, sz * 1.12], [0, 0, Math.PI / 2]);
      }));
    }, 0.05);
  };

  World.prototype._buildWalker = function () {
    /* A person on the pavement. Deliberately plain: at this distance and
     * speed a pedestrian is a silhouette, and anything more detailed costs
     * budget that the buildings need. Colour varies per instance so a crowd
     * does not read as clones.
     */
    const coat = [0x2f3540, 0x4a3b33, 0x3d444e, 0x6b3a3a, 0x2f3a4a, 0x55503f];
    return this._prop((L, U, c) => {
      const col = coat[(Math.random() * coat.length) | 0];
      L.add(BOX(U), col, [0, 0.85, 0], null, [0.42, 0.9, 0.3]);
      L.add(BOX(U), 0x2f3a4a, [0, 0.3, 0], null, [0.34, 0.72, 0.26]);
      L.add(BOX(U), 0xe0a57e, [0, 1.45, 0], null, [0.3, 0.32, 0.3]);
      L.add(BOX(U), 0x241c18, [0, 1.62, 0], null, [0.33, 0.12, 0.33]);
    }, 0.04);
  };

  /* `_facadeTexture` is gone. Windows are geometry now — see `_towerGeometry`
   * — which means one material for the whole city, window counts that match
   * the wall they are on, and lighting that differs between buildings instead
   * of repeating across every building sharing one of four textures.
   */

  /* Patterns.
   *
   * `blocked` is how many of the three lanes the pattern fills. `tier` is the
   * earliest difficulty tier it may appear at — full-width jams used to skip
   * the tier gate entirely via a `|| p.blocked === 3` escape hatch, so about a
   * fifth of everything spawned in the first hundred metres was a wall.
   */
  const PATTERNS = [
    // --- Single lane -------------------------------------------------------
    { w: 16, blocked: 1, tier: 0, build: (b) => [{ lane: b, kind: OB.CAR }] },
    { w: 15, blocked: 1, tier: 0, build: (b) => [{ lane: b, kind: OB.CAB }] },
    { w: 12, blocked: 1, tier: 0, build: (b) => [{ lane: b, kind: OB.CONES }] },
    { w: 10, blocked: 1, tier: 0, build: (b) => [{ lane: b, kind: OB.PLATE }] },
    { w: 13, blocked: 1, tier: 0, build: (b) => [{ lane: b, kind: OB.RIG }] },
    { w: 10, blocked: 1, tier: 1, build: (b) => [{ lane: b, kind: OB.GANTRY }] },
    { w: 12, blocked: 1, tier: 0, build: (b) => [{ lane: b, kind: OB.VAN }] },
    { w: 10, blocked: 1, tier: 1, build: (b) => [{ lane: b, kind: OB.TRUCK }] },
    { w: 9,  blocked: 1, tier: 1, build: (b) => [{ lane: b, kind: OB.DUMPSTER }] },

    // --- Two lanes blocked, one way through --------------------------------
    { w: 9, blocked: 2, tier: 1, build: (open_) => {
        const others = [0, 1, 2].filter((x) => x !== open_);
        return others.map((o) => ({ lane: o, kind: OB.VAN }));
      } },
    { w: 9, blocked: 2, tier: 1, build: (open_) => {
        const others = [0, 1, 2].filter((x) => x !== open_);
        return others.map((o) => ({ lane: o, kind: OB.CAB }));
      } },
    { w: 8, blocked: 2, tier: 2, build: (open_) => {
        // Roadworks: plates and cones either side of the one clear lane
        const others = [0, 1, 2].filter((x) => x !== open_);
        return others.map((o, i) => ({ lane: o, kind: i ? OB.CONES : OB.PLATE }));
      } },
    { w: 7, blocked: 2, tier: 2, build: (open_) => {
        const others = [0, 1, 2].filter((x) => x !== open_);
        return others.map((o) => ({ lane: o, kind: OB.TRUCK }));
      } },

    // --- Full width: survivable by one specific answer ----------------------
    // Homogeneous on purpose. A row that mixed a jump-kind and a slide-kind
    // would have no single answer and would be an unavoidable hit.
    { w: 8, blocked: 3, tier: 1, build: () => [0, 1, 2].map((o) => ({ lane: o, kind: OB.RIG })) },
    { w: 7, blocked: 3, tier: 1, build: () => [0, 1, 2].map((o) => ({ lane: o, kind: OB.CAR })) },
    { w: 6, blocked: 3, tier: 2, build: () => [0, 1, 2].map((o) => ({ lane: o, kind: OB.CONES })) },
    { w: 6, blocked: 3, tier: 3, build: () => [0, 1, 2].map((o) => ({ lane: o, kind: OB.GANTRY })) }
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

    /* Spacing.
     *
     * The requirement is simply that he can see a thing coming: MIN_REACTION
     * seconds of clear runway, which is `speed * MIN_REACTION` units, plus
     * room for the obstacle itself.
     *
     * The old formula multiplied that by 1.7 and then added up to 70% more on
     * top, which at SPEED_MAX put the mean step at 42 units — longer than a
     * whole 30-unit chunk. The track emptied out exactly when the player
     * wanted the most pressure, and no amount of raising `density` could fix
     * it, because density only ever removes patterns.
     */
    const minGap = Math.max(8, speed * cfg.MIN_REACTION + 6);

    /* `lastPatternZ` finally does its job.
     *
     * `z` restarts at each chunk boundary, so without carrying the previous
     * chunk's last pattern across the seam, the first pattern of a chunk could
     * land right on top of the last one of the chunk before — a guaranteed hit
     * that no amount of reaction time helps with. This variable has existed,
     * unread, since the world was written.
     */
    let z = Math.min(zStart, this.lastPatternZ - minGap);
    const end = zStart - len;

    while (z > end) {
      if (rand() < tier.density) {
        /* Tier gating, honestly applied.
         *
         * Full-width patterns used to carry an `|| p.blocked === 3` escape
         * that let them through at any difficulty, so roughly a fifth of
         * everything in the first hundred metres was a wall across the road.
         * Now every pattern declares the earliest tier it may appear at and
         * that is the only gate.
         */
        const usable = PATTERNS.filter(
          (p) => p.tier <= tier.level && p.blocked <= tier.maxBlocked
        );
        if (usable.length) {
          const pat = U.weighted(rand, usable);

          /* One lane, two meanings — now named apart.
           *
           * `build()` took a single lane index that meant the BLOCKED lane for
           * single-lane patterns and the OPEN lane for two-lane ones, and
           * tufts were then dropped into it either way. After a lone van that
           * put the reward line inside the van.
           */
          const pick = (rand() * 3) | 0;
          const specs = pat.build(pick);
          for (const spec of specs) this._addObstacle(spec.kind, spec.lane, z);

          const taken = specs.map((s) => s.lane);
          const clear = [0, 1, 2].filter((l) => taken.indexOf(l) === -1);

          if (clear.length && rand() < 0.8) {
            // A line of tufts down a lane that is actually open
            const lane = clear[(rand() * clear.length) | 0];
            const n = 3 + ((rand() * 3) | 0);
            for (let i = 0; i < n; i++) {
              this._addPickup('tuft', lane, z - 3 - i * 1.5, 0.9);
            }
          } else if (!clear.length && rand() < 0.65) {
            // Full width: an arc over or under it, at the height of the answer
            const lane = (rand() * 3) | 0;
            const slide = PP.World.ARCHETYPE[specs[0].kind] === 'slide';
            for (let i = 0; i < 4; i++) {
              this._addPickup('tuft', lane, z + 1.6 - i * 1.3,
                slide ? 0.55 : 1.2 + Math.sin(i / 3 * Math.PI) * 0.9);
            }
          }
          this.lastPatternZ = z;
        }
      }
      z -= minGap + rand() * minGap * 0.35;
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
    /* --- Dress the street ------------------------------------------------
     *
     * Buildings go on a BUILDING LINE, both sides, marching down the block at
     * a roughly regular pitch with jitter. They used to be scattered at random
     * X across a ten-unit band, which left them standing as islands in the
     * middle of the pavement with gaps between — no street wall, and half the
     * reason the city read as empty.
     *
     * Everything in front of the building line is furniture, placed against
     * the kerb where it belongs.
     */
    const place = (type, x, z, yaw, y) => {
      const s = this.sceneryPools[type].get();
      if (type === 'tower') {
        // A fresh silhouette every placement. Variants are shared by
        // reference, so this costs nothing but kills the repetition.
        s.geometry = this.towerGeos[(rand() * this.towerGeos.length) | 0];
        if (s.children[0]) s.children[0].geometry = s.geometry;
        // Seat it by its face, so the pavement in front stays pavement
        x = Math.sign(x) * (cfgS.BUILDING_LINE + s.geometry.userData.halfW);
      }
      s.position.set(x, y == null ? 0.42 : y, z);
      s.rotation.y = yaw;
      s.userData.sceneryType = type;
      this.scene.add(s);
      this.scenery.push(s);
      return s;
    };

    [-1, 1].forEach((side) => {
      const yaw = side < 0 ? Math.PI : 0;

      // The wall itself
      for (let i = 0; i < cfgS.TOWERS_PER_SIDE; i++) {
        const z = zStart - (i + rand() * 0.6) * (len / cfgS.TOWERS_PER_SIDE);
        place('tower', side * (cfgS.BUILDING_LINE + rand() * 1.4), z, yaw);
      }

      // Kerbside furniture, evenly spread so there are no dead stretches
      for (let i = 0; i < cfgS.FURNITURE_PER_SIDE; i++) {
        const z = zStart - rand() * len;
        const roll = rand();
        const kerb = side * (cfgS.KERB_LINE + rand() * 0.9);
        if (roll < 0.20) place('lamp', kerb, z, yaw);
        else if (roll < 0.32) place('light', side * cfgS.KERB_LINE, z, yaw);
        else if (roll < 0.48) place('hydrant', kerb, z, yaw);
        else if (roll < 0.60) place('boxes', kerb, z, yaw);
        else if (roll < 0.70) place('shelter', side * (cfgS.KERB_LINE + 1.4), z, yaw);
        else if (roll < 0.80) place('scaffold', side * (cfgS.BUILDING_LINE - 1.4), z, yaw);
        else place('parked', side * cfgS.PARKED_LINE, z, yaw, 0.0);
      }

      // The crowd
      for (let i = 0; i < cfgS.WALKERS_PER_SIDE; i++) {
        place('walker',
              side * (cfgS.KERB_LINE + 0.4 + rand() * 2.6),
              zStart - rand() * len,
              rand() * Math.PI * 2);
      }
    });
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
    for (const s of this.scenery) { this.scene.remove(s); this.sceneryPools[s.userData.sceneryType].put(s); }
    this.obstacles.length = 0;
    this.pickups.length = 0;
    this.scenery.length = 0;

    this.nextZ = -PP.CFG.CHUNK_LEN;
    // Far enough ahead that the running start is genuinely clear, and in the
    // same frame everything else is about to start scrolling in.
    this.lastPatternZ = -PP.CFG.CHUNK_LEN;
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
    shift(this.scenery, (s) => this.sceneryPools[s.userData.sceneryType].put(s));

    // Spin the pickups so they catch the eye
    const t = performance.now() * 0.003;
    for (const p of this.pickups) {
      p.rotation.y = t * (p.userData.kind === 'tuft' ? 2 : 1.2);
      if (p.userData.kind !== 'tuft') p.position.y += Math.sin(t * 2 + p.position.z) * 0.0025;
    }

    // Scroll the floor texture instead of moving the floor mesh
    this.floor.material.map.offset.y -= dz * (40 / 600);

    /* Both of these live in the WORLD's moving frame, so both have to move
     * with it. `lastPatternZ` is a spawn-time coordinate; leave it fixed while
     * everything else scrolls toward the camera and within seconds it sits so
     * far "behind" that `lastPatternZ - minGap` is past the end of every
     * chunk, the spawn loop never runs, and the road goes completely empty.
     */
    this.nextZ += dz;
    this.lastPatternZ += dz;
    while (this.nextZ > -cfg.CHUNK_LEN * cfg.SPAWN_AHEAD) {
      this._populate(this.nextZ - cfg.CHUNK_LEN, metres, speed);
      this.nextZ -= cfg.CHUNK_LEN;
    }
  };

  World.OB = OB;
  World.ARCHETYPE = ARCHETYPE;
  return World;
})();
