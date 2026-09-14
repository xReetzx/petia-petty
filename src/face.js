/* The character's face, drawn with the canvas 2D API at load time.
 *
 * No image files: the whole portrait is generated, which is why the game runs
 * from file:// with nothing to configure. Proportions and features follow the
 * reference illustration — heavy dark brows, a broad nose, a full dark beard
 * along the jaw, and the alopecia patches through that beard which are the
 * reason the game exists.
 *
 * The camera looks the character in the face while he runs, so this texture
 * carries most of his likeness. It is worth reading at full size when
 * changing anything here.
 */
window.PP = window.PP || {};

PP.Face = (function () {
  'use strict';

  const S = 512;
  const C = () => PP.CFG.COL;
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');

  /* ---- Proportions -------------------------------------------------------
   * One place to keep the layout honest. Everything below positions off these
   * rather than scattering magic numbers through the drawing code.
   */
  const P = {
    cx: 256,
    faceTop: 58, faceBottom: 470,
    jawHalf: 152,           // half-width at the widest point of the jaw
    browY: 188,
    eyeY: 232, eyeDx: 84, eyeRx: 46, eyeRy: 27,
    noseTop: 236, noseTip: 304,
    mouthY: 362,
    beardTopSide: 246,      // where the sideburn meets the ear
    beardLineMid: 330       // the beard's cheek line, centre of the face
  };

  /* Where the bare spots sit: [x, y, radiusX, radiusY, rotation].
   * The big one on the viewer's right is the prominent patch in the reference
   * drawing; the smaller ones are the scatter that comes with it. */
  const PATCHES = [
    [332, 388, 42, 34,  0.20],
    [170, 418, 26, 21, -0.32],
    [256, 452, 19, 14,  0.08],
    [348, 424, 16, 13,  0.30]
  ];

  // ---- Skin ---------------------------------------------------------------
  function skin(ctx) {
    const c = C();
    ctx.fillStyle = hex(c.skin);
    ctx.fillRect(0, 0, S, S);

    // Face mass, slightly wider at the cheeks than the jaw
    ctx.fillStyle = hex(c.skin);
    ctx.beginPath();
    ctx.moveTo(P.cx - P.jawHalf, P.faceTop + 60);
    ctx.quadraticCurveTo(P.cx - P.jawHalf - 8, 352, P.cx - 96, 436);
    ctx.quadraticCurveTo(P.cx, P.faceBottom + 16, P.cx + 96, 436);
    ctx.quadraticCurveTo(P.cx + P.jawHalf + 8, 352, P.cx + P.jawHalf, P.faceTop + 60);
    ctx.closePath();
    ctx.fill();

    // Warmth on the cheeks
    [-1, 1].forEach((s) => {
      const g = ctx.createRadialGradient(P.cx + s * 108, 300, 8, P.cx + s * 108, 300, 96);
      g.addColorStop(0, 'rgba(206,116,96,0.26)');
      g.addColorStop(1, 'rgba(213,118,94,0)');
      ctx.fillStyle = g;
      ctx.fillRect(P.cx + s * 108 - 100, 200, 200, 200);
    });

    // Shading hatch down the viewer's right, as in the reference
    PP.U.hatch(ctx, 330, 90, 150, 330, 8, Math.PI / 3.1, 0.1, hex(c.skinDark));
    // Brow shadow across the top of the sockets
    PP.U.hatch(ctx, 120, 196, 272, 40, 6, Math.PI / 2.6, 0.09, hex(c.skinDark));
  }

  function jawline(ctx) {
    ctx.strokeStyle = hex(C().ink);
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(P.cx - P.jawHalf - 2, 224);
    ctx.quadraticCurveTo(P.cx - P.jawHalf - 8, 352, P.cx - 96, 436);
    ctx.quadraticCurveTo(P.cx, P.faceBottom + 16, P.cx + 96, 436);
    ctx.quadraticCurveTo(P.cx + P.jawHalf + 8, 352, P.cx + P.jawHalf + 2, 224);
    ctx.stroke();
  }

  // ---- Beard --------------------------------------------------------------
  function beardShape(ctx) {
    const col = hex(C().beard);
    ctx.fillStyle = col;

    // Sideburn down the jaw, round the chin, and back up the other side.
    // The upper edge is the cheek line: high at the ears, dipping to just
    // under the nose in the middle.
    ctx.beginPath();
    ctx.moveTo(P.cx - 144, P.beardTopSide);
    ctx.quadraticCurveTo(P.cx - 156, 368, P.cx - 92, 444);
    ctx.quadraticCurveTo(P.cx, P.faceBottom + 8, P.cx + 92, 444);
    ctx.quadraticCurveTo(P.cx + 156, 368, P.cx + 144, P.beardTopSide);
    // back along the cheek line
    ctx.quadraticCurveTo(P.cx + 110, 306, P.cx + 62, P.beardLineMid);
    ctx.quadraticCurveTo(P.cx, P.beardLineMid + 8, P.cx - 62, P.beardLineMid);
    ctx.quadraticCurveTo(P.cx - 110, 306, P.cx - 144, P.beardTopSide);
    ctx.closePath();
    ctx.fill();

    // Moustache, reaching up under the nose
    ctx.beginPath();
    ctx.moveTo(P.cx - 78, 344);
    ctx.quadraticCurveTo(P.cx - 40, 312, P.cx, 316);
    ctx.quadraticCurveTo(P.cx + 40, 312, P.cx + 78, 344);
    ctx.quadraticCurveTo(P.cx + 40, 356, P.cx, 352);
    ctx.quadraticCurveTo(P.cx - 40, 356, P.cx - 78, 344);
    ctx.closePath();
    ctx.fill();

    // Ragged lower edge so the silhouette reads as hair, not a cut shape
    ctx.strokeStyle = col;
    ctx.lineCap = 'round';
    for (let i = 0; i < 220; i++) {
      const t = i / 220;
      const a = Math.PI * (0.06 + t * 0.88);
      const x = P.cx - Math.cos(a) * 158;
      const y = 332 + Math.sin(a) * 150;
      const len = 9 + Math.random() * 16;
      ctx.lineWidth = 2 + Math.random() * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 7, y + len * 0.8);
      ctx.stroke();
    }

    // Stubble fading up into the cheek along the beard line
    for (let i = 0; i < 260; i++) {
      const x = P.cx - 150 + Math.random() * 300;
      const t = (x - (P.cx - 150)) / 300;
      const edge = P.beardTopSide + Math.sin(t * Math.PI) * (P.beardLineMid - P.beardTopSide + 6);
      const y = edge - Math.random() * 30;
      ctx.lineWidth = 1.5 + Math.random() * 1.4;
      ctx.globalAlpha = 0.35 + Math.random() * 0.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 5, y + 8 + Math.random() * 9);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Ink weight low on the chin
    PP.U.hatch(ctx, 130, 380, 252, 110, 6, Math.PI / 2.3, 0.2, '#000');
  }

  /* Punch the bare spots straight through the beard layer so the skin already
   * painted underneath shows through — rather than erasing the face and
   * repainting skin into the holes, which is what made an earlier version's
   * patches look stuck on top. */
  function punchPatches(ctx) {
    ctx.globalCompositeOperation = 'destination-out';
    for (const [x, y, rx, ry, rot] of PATCHES) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry));
      // Build the gradient AFTER the transform and centred on the local
      // origin. Canvas resolves gradient coordinates in the transform active
      // at fill time, so one created in page space before translating lands
      // at double the offset and punches nothing.
      const r = Math.max(rx, ry);
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, r);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.78, 'rgba(0,0,0,1)');
      g.addColorStop(0.92, 'rgba(0,0,0,0.55)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function beard(ctx) {
    const layer = document.createElement('canvas');
    layer.width = S; layer.height = S;
    const lctx = layer.getContext('2d');
    beardShape(lctx);
    punchPatches(lctx);
    ctx.drawImage(layer, 0, 0);

    // Each bare spot gets a soft rim and a hint of raw skin, the way the
    // reference outlines them.
    for (const [x, y, rx, ry, rot] of PATCHES) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, Math.max(rx, ry));
      g.addColorStop(0, 'rgba(232,158,128,0.5)');
      g.addColorStop(0.7, 'rgba(232,158,128,0.22)');
      g.addColorStop(1, 'rgba(232,158,128,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx * 0.95, ry * 0.95, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(92,56,42,0.34)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx * 0.88, ry * 0.88, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---- Features -----------------------------------------------------------
  function brows(ctx) {
    const col = hex(C().hair);
    ctx.fillStyle = col;
    // Heavy, angled down toward the nose — the reference's default expression
    [-1, 1].forEach((s) => {
      const outer = P.cx + s * 140, inner = P.cx + s * 26;
      ctx.beginPath();
      ctx.moveTo(outer, P.browY + 16);
      ctx.quadraticCurveTo(P.cx + s * 82, P.browY - 20, inner, P.browY + 4);
      ctx.quadraticCurveTo(P.cx + s * 82, P.browY + 4, outer, P.browY + 34);
      ctx.closePath();
      ctx.fill();
    });
    // Furrow between them
    ctx.strokeStyle = 'rgba(20,16,19,0.5)';
    ctx.lineCap = 'round';
    PP.U.inkLine(ctx, P.cx - 10, P.browY - 6, P.cx - 16, P.browY + 30, 3, 0.5);
    PP.U.inkLine(ctx, P.cx + 10, P.browY - 4, P.cx + 16, P.browY + 30, 2.6, 0.5);
  }

  function eyes(ctx, mode) {
    const wide = mode === 'panic';
    const ry = wide ? P.eyeRy + 6 : P.eyeRy;
    const glance = wide ? -9 : -4;

    [-1, 1].forEach((s) => {
      const cx = P.cx + s * P.eyeDx, cy = P.eyeY;

      ctx.fillStyle = '#f8f4ec';
      ctx.beginPath(); ctx.ellipse(cx, cy, P.eyeRx, ry, 0, 0, Math.PI * 2); ctx.fill();

      if (mode === 'dead') {
        // Defeated: eyes screwed shut
        ctx.strokeStyle = hex(C().ink); ctx.lineWidth = 6; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - P.eyeRx, cy - 6);
        ctx.quadraticCurveTo(cx, cy + 14, cx + P.eyeRx, cy - 6);
        ctx.stroke();
        return;
      }

      ctx.fillStyle = '#4b3220';
      ctx.beginPath(); ctx.arc(cx + glance, cy + 2, ry * 0.7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#16100e';
      ctx.beginPath(); ctx.arc(cx + glance, cy + 2, ry * 0.34, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(cx + glance - ry * 0.26, cy - ry * 0.3, ry * 0.15, 0, Math.PI * 2); ctx.fill();

      // Lids: heavy on top, light underneath
      ctx.strokeStyle = hex(C().ink); ctx.lineCap = 'round';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.ellipse(cx, cy, P.eyeRx, ry, 0, Math.PI, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.ellipse(cx, cy, P.eyeRx, ry, 0, 0, Math.PI); ctx.stroke();
    });

    // Tired lines under the eyes
    ctx.strokeStyle = 'rgba(20,16,19,0.3)';
    [-1, 1].forEach((s) => {
      const cx = P.cx + s * P.eyeDx;
      PP.U.inkLine(ctx, cx - 36, P.eyeY + ry + 16, cx + 36, P.eyeY + ry + 14, 2.4, 0.7);
    });
  }

  function nose(ctx) {
    ctx.strokeStyle = hex(C().ink);
    ctx.lineCap = 'round';
    ctx.lineWidth = 3.6;
    // Bridge down the viewer's left, as in the reference's three-quarter look
    ctx.beginPath();
    ctx.moveTo(P.cx - 6, P.noseTop);
    ctx.quadraticCurveTo(P.cx - 26, P.noseTip - 22, P.cx - 12, P.noseTip);
    ctx.stroke();
    // Tip and the near nostril wing
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(P.cx - 12, P.noseTip);
    ctx.quadraticCurveTo(P.cx + 8, P.noseTip + 10, P.cx + 26, P.noseTip - 6);
    ctx.stroke();
    ctx.fillStyle = 'rgba(20,16,19,0.72)';
    ctx.beginPath(); ctx.ellipse(P.cx - 22, P.noseTip, 9, 5.5, -0.28, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(P.cx + 20, P.noseTip - 4, 8, 5, 0.28, 0, Math.PI * 2); ctx.fill();
  }

  function mouth(ctx, mode) {
    const ink = hex(C().ink);

    if (mode === 'dead') {
      ctx.strokeStyle = ink; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(P.cx - 52, P.mouthY + 6);
      ctx.quadraticCurveTo(P.cx, P.mouthY + 18, P.cx + 52, P.mouthY + 4);
      ctx.lineWidth = 5.5; ctx.stroke();
      return;
    }

    const open = mode === 'panic' ? 26 : 15;
    const halfW = 52;

    // Mouth cavity
    ctx.fillStyle = '#54202c';
    ctx.beginPath();
    ctx.ellipse(P.cx, P.mouthY, halfW, open, 0, 0, Math.PI * 2);
    ctx.fill();

    // Upper teeth only — a full set reads as a grin, not a yell
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(P.cx, P.mouthY, halfW, open, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#f6f2e8';
    ctx.fillRect(P.cx - halfW, P.mouthY - open, halfW * 2, open * 0.72);
    ctx.strokeStyle = 'rgba(20,16,19,0.28)';
    ctx.lineWidth = 1.6;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(P.cx + i * 21, P.mouthY - open);
      ctx.lineTo(P.cx + i * 21, P.mouthY - open * 0.28);
      ctx.stroke();
    }
    ctx.restore();

    // Lower lip catching light below the opening
    ctx.fillStyle = 'rgba(190,104,104,0.5)';
    ctx.beginPath();
    ctx.ellipse(P.cx, P.mouthY + open * 0.78, halfW * 0.82, open * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = ink; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(P.cx, P.mouthY, halfW, open, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  /**
   * mode: 'panic' (in-run) | 'determined' (title) | 'dead' (game over)
   */
  function build(mode) {
    mode = mode || 'panic';
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const ctx = cv.getContext('2d');

    skin(ctx);
    jawline(ctx);
    beard(ctx);
    brows(ctx);
    eyes(ctx, mode);
    nose(ctx);
    mouth(ctx, mode);

    // A last loose pass of ink over everything, to tie the drawing together
    PP.U.hatch(ctx, 0, 0, S, S, 30, Math.PI / 4, 0.035, hex(C().ink));

    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    return tex;
  }

  const cache = {};
  function get(mode) {
    mode = mode || 'panic';
    if (!cache[mode]) cache[mode] = build(mode);
    return cache[mode];
  }

  return { get, build, PATCHES };
})();
