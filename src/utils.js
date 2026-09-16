/* Shared helpers: RNG, easing, pooling, and the "inked comic" look. */
window.PP = window.PP || {};

PP.U = (function () {
  'use strict';

  // ---- Math ---------------------------------------------------------------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  // Frame-rate independent smoothing. `rate` is roughly "how fast", in 1/sec.
  const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  // Deterministic RNG (mulberry32) so a seed replays the same track.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (rand, arr) => arr[(rand() * arr.length) | 0];

  // Weighted pick from [{ w: number, ... }]
  function weighted(rand, list) {
    let total = 0;
    for (const it of list) total += it.w;
    let r = rand() * total;
    for (const it of list) { r -= it.w; if (r <= 0) return it; }
    return list[list.length - 1];
  }

  // ---- Toon shading -------------------------------------------------------
  // A 3-step gradient map turns MeshToonMaterial into hard cel bands.
  let _gradient = null;
  function toonGradient() {
    if (_gradient) return _gradient;
    const c = document.createElement('canvas');
    c.width = 4; c.height = 1;
    const ctx = c.getContext('2d');
    // dark -> mid -> light -> light: reads as inked cel shading
    const steps = ['#6b6258', '#a9a294', '#ded6c6', '#ffffff'];
    steps.forEach((s, i) => { ctx.fillStyle = s; ctx.fillRect(i, 0, 1, 1); });
    _gradient = new THREE.CanvasTexture(c);
    _gradient.minFilter = THREE.NearestFilter;
    _gradient.magFilter = THREE.NearestFilter;
    _gradient.generateMipmaps = false;
    return _gradient;
  }

  function toonMat(color, opts) {
    opts = opts || {};
    const m = new THREE.MeshToonMaterial({
      color: color,
      gradientMap: toonGradient()
    });
    if (opts.map) m.map = opts.map;
    if (opts.transparent) { m.transparent = true; m.opacity = opts.opacity != null ? opts.opacity : 1; }
    if (opts.emissive != null) m.emissive = new THREE.Color(opts.emissive);
    return m;
  }

  // ---- Inked outlines -----------------------------------------------------
  // Inverted-hull: clone the mesh, flip to BackSide, push vertices out along
  // their normals. Pure core Three, no post-processing, and it survives any
  // camera angle — which is what sells the hand-drawn linework.
  const _outlineMat = (() => {
    let m = null;
    return () => {
      if (!m) {
        m = new THREE.MeshBasicMaterial({
          color: PP.CFG.COL.ink,
          side: THREE.BackSide
        });
      }
      return m;
    };
  })();

  function outline(mesh, thickness) {
    const t = thickness == null ? 0.045 : thickness;
    const o = new THREE.Mesh(mesh.geometry, _outlineMat());
    // Scale-based hull: cheap, and good enough for the chunky shapes here.
    const g = mesh.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    const r = Math.max(g.boundingSphere.radius, 0.001);
    const s = 1 + t / r;
    o.scale.set(s, s, s);
    o.renderOrder = -1;
    o.matrixAutoUpdate = false;
    o.updateMatrix();
    mesh.add(o);
    return o;
  }

  /* Build a mesh with its outline already attached.
   *
   * `thickness: 0` declines the hull. An outline doubles an object's draw
   * calls, and on anything small or far down the street it is not resolvable
   * anyway — so the crowd work opts out for most scenery detail.
   *
   * Materials come from the cache, so a hundred identically-coloured parts
   * share one rather than allocating a hundred.
   */
  function inked(geometry, color, thickness) {
    const mesh = new THREE.Mesh(geometry, cachedMat(color));
    if (thickness !== 0) outline(mesh, thickness);
    return mesh;
  }


  /* ---- Budget: sharing, merging, and optional outlines --------------------
   *
   * Every prop in this game used to be built from individual inked meshes,
   * each allocating its own geometry AND its own material, each carrying an
   * inverted-hull outline child. That is two draw calls per part, and a
   * building is thirty-odd parts. The scene was running 1,200-1,700 meshes
   * before any of the crowd work below, which is the whole reason the city
   * was kept sparse.
   *
   * These three helpers are what make a denser street affordable.
   */

  // Memoised geometry. Two thousand wheels share one cylinder.
  const _geoCache = {};
  function cachedGeo(key, make) {
    return _geoCache[key] || (_geoCache[key] = make());
  }

  // Memoised toon material, keyed by colour and the handful of options that
  // actually vary. Anything with a map stays unshared — maps are per-object.
  const _matCache = {};
  function cachedMat(color, opts) {
    if (opts && (opts.map || opts.transparent || opts.emissive != null)) {
      return toonMat(color, opts);
    }
    const k = 'c' + color;
    return _matCache[k] || (_matCache[k] = toonMat(color));
  }

  /* Merge a pile of transformed boxes into ONE geometry with vertex colours.
   *
   * r128 ships BufferGeometryUtils only as an examples file and this project
   * vendors just the core build, so this is the minimum that does the job:
   * non-indexed position/normal/uv/color concatenation. Feed it
   * `{ geo, matrix, color, uv }` parts and it returns a single BufferGeometry
   * that one material can draw in one call.
   *
   * Everything merged shares one material, which is why colour rides in a
   * vertex attribute rather than in the material.
   */
  function merge(parts) {
    let total = 0;
    const prepped = [];
    for (const p of parts) {
      let g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
      g.applyMatrix4(p.matrix);
      prepped.push({ g, color: new THREE.Color(p.color == null ? 0xffffff : p.color), uv: p.uv });
      total += g.attributes.position.count;
    }

    const pos = new Float32Array(total * 3);
    const nor = new Float32Array(total * 3);
    const uvs = new Float32Array(total * 2);
    const col = new Float32Array(total * 3);

    let v = 0;
    for (const { g, color, uv } of prepped) {
      const gp = g.attributes.position, gn = g.attributes.normal, gu = g.attributes.uv;
      const n = gp.count;
      pos.set(gp.array.subarray(0, n * 3), v * 3);
      if (gn) nor.set(gn.array.subarray(0, n * 3), v * 3);
      for (let i = 0; i < n; i++) {
        col[(v + i) * 3] = color.r;
        col[(v + i) * 3 + 1] = color.g;
        col[(v + i) * 3 + 2] = color.b;
        /* UV: either pass the source UVs through, or pin every vertex to one
         * point of the atlas. Pinning is how an untextured part (a water tank,
         * a fire escape) shares a material with a window-textured wall — it
         * samples a single blank pixel and takes its colour from the vertex
         * attribute instead. */
        if (uv) {
          uvs[(v + i) * 2] = uv[0];
          uvs[(v + i) * 2 + 1] = uv[1];
        } else if (gu) {
          uvs[(v + i) * 2] = gu.array[i * 2];
          uvs[(v + i) * 2 + 1] = gu.array[i * 2 + 1];
        }
      }
      v += n;
      g.dispose();
    }

    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  }

  /* A reusable part list, so builders can describe a prop declaratively and
   * hand the whole thing to merge() once. `box(w,h,d).at(x,y,z)` style would be
   * nicer but this keeps it to plain data.
   */
  function partList() {
    const parts = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    return {
      parts,
      add(geo, color, pos, rot, scale, uv) {
        p.set(pos[0], pos[1], pos[2]);
        e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0);
        q.setFromEuler(e);
        s.set(scale ? scale[0] : 1, scale ? scale[1] : 1, scale ? scale[2] : 1);
        parts.push({ geo, color, uv, matrix: new THREE.Matrix4().compose(p, q, s) });
        return this;
      },
      build(material, outlineThickness) {
        const geo = merge(parts);
        const mesh = new THREE.Mesh(geo, material);
        if (outlineThickness) outline(mesh, outlineThickness);
        return mesh;
      }
    };
  }

  // ---- Canvas ink helpers (for drawn textures) ----------------------------
  // Wobbly hand-drawn line — no two strokes identical.
  function inkLine(ctx, x1, y1, x2, y2, w, jitter) {
    jitter = jitter || 1.5;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * jitter * 4;
    const my = (y1 + y2) / 2 + (Math.random() - 0.5) * jitter * 4;
    ctx.quadraticCurveTo(mx, my, x2, y2);
    ctx.stroke();
  }

  // Cross-hatch shading inside a region — the reference's signature texture.
  function hatch(ctx, x, y, w, h, spacing, angle, alpha, color) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color || '#000';
    ctx.lineWidth = 1.2;
    const len = Math.hypot(w, h) * 1.5;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const px = -dy, py = dx;
    const cx = x + w / 2, cy = y + h / 2;
    for (let i = -len / spacing; i < len / spacing; i++) {
      const ox = cx + px * i * spacing, oy = cy + py * i * spacing;
      ctx.beginPath();
      ctx.moveTo(ox - dx * len / 2 + (Math.random() - 0.5) * 2, oy - dy * len / 2);
      ctx.lineTo(ox + dx * len / 2 + (Math.random() - 0.5) * 2, oy + dy * len / 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---- Object pool --------------------------------------------------------
  function Pool(factory, reset) {
    this.items = [];
    this.factory = factory;
    this.reset = reset;
  }
  Pool.prototype.get = function () {
    const it = this.items.pop() || this.factory();
    return it;
  };
  Pool.prototype.put = function (it) {
    if (this.reset) this.reset(it);
    this.items.push(it);
  };

  // ---- localStorage that never throws ------------------------------------
  const store = {
    get(k, dflt) {
      try {
        const v = window.localStorage.getItem(k);
        return v == null ? dflt : JSON.parse(v);
      } catch (e) { return dflt; }
    },
    set(k, v) {
      try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ }
    }
  };

  return {
    clamp, lerp, damp, easeOutCubic, easeInOutQuad,
    rng, pick, weighted,
    toonGradient, toonMat, outline, inked,
    cachedGeo, cachedMat, merge, partList,
    inkLine, hatch,
    Pool, store
  };
})();
