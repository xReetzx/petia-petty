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
      const outer = P.cx + s * 128, inner = P.cx + s * 26;
      ctx.beginPath();
      ctx.moveTo(inner, P.browY + 2);
      ctx.quadraticCurveTo(P.cx + s * 80, P.browY - 20, outer, P.browY + 14);
      // Taper to a point at the outer end rather than stopping square
      ctx.quadraticCurveTo(P.cx + s * 80, P.browY + 6, inner, P.browY + 20);
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


  /* ---- The other faces of the head ---------------------------------------
   * The chase camera looks at the back of his head for the entire run, and a
   * turnaround showed the sides and back were bare skin slabs. These fill the
   * remaining faces of the head box so he reads from every angle.
   */

  /** Profile: ear on bare cheek, beard along the jaw below it, sideburn
   *  joining the two. Note this canvas has nothing painted beneath it, so the
   *  bare patches are drawn as skin rather than punched with destination-out
   *  the way the front is — punching here just erases to transparent, which
   *  renders as a white hole on the model. */
  function sideTexture() {
    const c = C();
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const ctx = cv.getContext('2d');

    ctx.fillStyle = hex(c.skin);
    ctx.fillRect(0, 0, S, S);
    PP.U.hatch(ctx, 0, 0, S, S, 9, Math.PI / 3.1, 0.09, hex(c.skinDark));

    // Beard along the jaw: the lower two fifths, top edge dipping slightly
    const beardTop = (x) => 306 + Math.sin((x / S) * Math.PI) * 26;
    ctx.fillStyle = hex(c.beard);
    ctx.beginPath();
    ctx.moveTo(0, beardTop(0));
    for (let x = 0; x <= S; x += 16) ctx.lineTo(x, beardTop(x));
    ctx.lineTo(S, S); ctx.lineTo(0, S);
    ctx.closePath();
    ctx.fill();

    // Ragged upper edge
    ctx.strokeStyle = hex(c.beard);
    ctx.lineCap = 'round';
    for (let i = 0; i < 230; i++) {
      const x = Math.random() * S;
      const e = beardTop(x);
      ctx.lineWidth = 1.8 + Math.random() * 2.2;
      ctx.globalAlpha = 0.4 + Math.random() * 0.6;
      ctx.beginPath();
      ctx.moveTo(x, e - Math.random() * 30);
      ctx.lineTo(x + (Math.random() - 0.5) * 6, e + 8);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Sideburn dropping from the hairline into the beard, in front of the ear
    ctx.fillStyle = hex(c.beard);
    ctx.beginPath();
    ctx.moveTo(150, 96);
    ctx.quadraticCurveTo(196, 190, 190, 316);
    ctx.lineTo(132, 316);
    ctx.quadraticCurveTo(126, 190, 108, 100);
    ctx.closePath();
    ctx.fill();

    // A bare spot in the beard, painted as skin — the alopecia carries round
    ctx.save();
    ctx.translate(320, 392);
    ctx.rotate(0.18);
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 44);
    g.addColorStop(0, hex(c.skin));
    g.addColorStop(0.72, hex(c.skin));
    g.addColorStop(1, 'rgba(242,189,151,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, 44, 34, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(92,56,42,0.3)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, 38, 29, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // Ear, sitting on bare cheek above the beard line
    ctx.fillStyle = hex(c.skin);
    ctx.strokeStyle = hex(c.ink);
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.ellipse(276, 226, 44, 60, -0.16, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.ellipse(280, 232, 20, 32, -0.16, Math.PI * 0.2, Math.PI * 1.45);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(268, 272); ctx.quadraticCurveTo(288, 280, 296, 262);
    ctx.stroke();

    PP.U.hatch(ctx, 0, 0, S, S, 30, Math.PI / 4, 0.035, hex(c.ink));
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    return tex;
  }

  /** Back of the head: hairline dropping to a bare nape. */
  function backTexture() {
    const c = C();
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const ctx = cv.getContext('2d');

    ctx.fillStyle = hex(c.skin);
    ctx.fillRect(0, 0, S, S);
    PP.U.hatch(ctx, 0, 0, S, S, 10, Math.PI / 2.8, 0.09, hex(c.skinDark));

    // Hair down to just below the ears, with a ragged hairline
    ctx.fillStyle = hex(c.hair);
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(S, 0); ctx.lineTo(S, 300);
    ctx.quadraticCurveTo(384, 356, 256, 344);
    ctx.quadraticCurveTo(128, 356, 0, 300);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = hex(c.hair);
    ctx.lineCap = 'round';
    for (let i = 0; i < 220; i++) {
      const x = Math.random() * S;
      const t = x / S;
      const edge = 300 + Math.sin(t * Math.PI) * 46;
      ctx.lineWidth = 2 + Math.random() * 2.4;
      ctx.beginPath();
      ctx.moveTo(x, edge - 14 - Math.random() * 20);
      ctx.lineTo(x + (Math.random() - 0.5) * 7, edge + Math.random() * 16);
      ctx.stroke();
    }

    PP.U.hatch(ctx, 0, 0, S, S, 30, Math.PI / 4, 0.035, hex(c.ink));
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    return tex;
  }

  /** Under the chin — beard all the way. */
  function underTexture() {
    const c = C();
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = hex(c.beard);
    ctx.fillRect(0, 0, 128, 128);
    PP.U.hatch(ctx, 0, 0, 128, 128, 5, Math.PI / 2.5, 0.28, '#000');
    return new THREE.CanvasTexture(cv);
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


  /* ---- Portrait card -----------------------------------------------------
   * A framed head-and-shoulders for the character select panel. Drawn on a
   * canvas rather than rendered from the 3D scene: the face is already a
   * canvas texture, so composing hair and shoulders around it is cheaper and
   * sharper than grabbing a second WebGL view, and it's the one place the
   * player gets a proper look at him.
   */
  function portrait(character, size) {
    const P_ = size || 320;
    const cv = document.createElement('canvas');
    cv.width = P_; cv.height = P_;
    const ctx = cv.getContext('2d');
    const cc = (character && character.colors) || {};
    const hairCol = hex(cc.hair != null ? cc.hair : C().hair);
    const shirtCol = hex(cc.shirt != null ? cc.shirt : C().shirt);
    const ink = hex(C().ink);

    // Paper ground with a soft vignette
    ctx.fillStyle = hex(C().paper);
    ctx.fillRect(0, 0, P_, P_);
    const vg = ctx.createRadialGradient(P_ / 2, P_ * 0.44, P_ * 0.1, P_ / 2, P_ * 0.5, P_ * 0.62);
    vg.addColorStop(0, 'rgba(245,197,24,0.20)');
    vg.addColorStop(1, 'rgba(245,197,24,0)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, P_, P_);

    const cx = P_ / 2;

    // Shoulders first, so the head overlaps them
    ctx.fillStyle = shirtCol;
    ctx.strokeStyle = ink;
    ctx.lineWidth = P_ * 0.026;
    ctx.beginPath();
    ctx.moveTo(cx - P_ * 0.40, P_);
    ctx.quadraticCurveTo(cx - P_ * 0.34, P_ * 0.76, cx, P_ * 0.74);
    ctx.quadraticCurveTo(cx + P_ * 0.34, P_ * 0.76, cx + P_ * 0.40, P_);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Head: the face texture, clipped to a rounded jaw
    const hw = P_ * 0.25, hy = P_ * 0.12, hh = P_ * 0.62;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - hw, hy + hh * 0.18);
    ctx.lineTo(cx - hw, hy + hh * 0.62);
    ctx.quadraticCurveTo(cx - hw, hy + hh, cx, hy + hh);
    ctx.quadraticCurveTo(cx + hw, hy + hh, cx + hw, hy + hh * 0.62);
    ctx.lineTo(cx + hw, hy + hh * 0.18);
    ctx.quadraticCurveTo(cx, hy - hh * 0.04, cx - hw, hy + hh * 0.18);
    ctx.closePath();
    ctx.clip();
    const faceTex = build('determined');
    ctx.drawImage(faceTex.image, cx - hw, hy, hw * 2, hh);
    faceTex.dispose();
    ctx.restore();

    // Jaw outline over the top
    ctx.strokeStyle = ink;
    ctx.lineWidth = P_ * 0.022;
    ctx.beginPath();
    ctx.moveTo(cx - hw, hy + hh * 0.2);
    ctx.lineTo(cx - hw, hy + hh * 0.62);
    ctx.quadraticCurveTo(cx - hw, hy + hh, cx, hy + hh);
    ctx.quadraticCurveTo(cx + hw, hy + hh, cx + hw, hy + hh * 0.62);
    ctx.lineTo(cx + hw, hy + hh * 0.2);
    ctx.stroke();

    // Messy hair on top, spikes and all
    ctx.fillStyle = hairCol;
    ctx.beginPath();
    ctx.moveTo(cx - hw * 1.1, hy + hh * 0.3);
    ctx.quadraticCurveTo(cx - hw * 1.16, hy - hh * 0.08, cx, hy - hh * 0.1);
    ctx.quadraticCurveTo(cx + hw * 1.16, hy - hh * 0.08, cx + hw * 1.1, hy + hh * 0.3);
    ctx.quadraticCurveTo(cx + hw * 0.8, hy + hh * 0.12, cx, hy + hh * 0.14);
    ctx.quadraticCurveTo(cx - hw * 0.8, hy + hh * 0.12, cx - hw * 1.1, hy + hh * 0.3);
    ctx.closePath();
    ctx.fill();

    const rnd = PP.U.rng(7);
    for (let i = 0; i < 13; i++) {
      const t = i / 12;
      const x = cx - hw * 1.05 + t * hw * 2.1;
      const baseY = hy - hh * 0.06 + Math.abs(t - 0.5) * hh * 0.24;
      const h = hh * (0.1 + rnd() * 0.13);
      ctx.beginPath();
      ctx.moveTo(x - P_ * 0.028, baseY + P_ * 0.02);
      ctx.lineTo(x + (rnd() - 0.5) * P_ * 0.05, baseY - h);
      ctx.lineTo(x + P_ * 0.028, baseY + P_ * 0.02);
      ctx.closePath();
      ctx.fill();
    }

    ctx.strokeStyle = ink;
    ctx.lineWidth = P_ * 0.018;
    ctx.beginPath();
    ctx.moveTo(cx - hw * 1.08, hy + hh * 0.29);
    ctx.quadraticCurveTo(cx - hw * 1.14, hy - hh * 0.07, cx, hy - hh * 0.09);
    ctx.quadraticCurveTo(cx + hw * 1.14, hy - hh * 0.07, cx + hw * 1.08, hy + hh * 0.29);
    ctx.stroke();

    return cv;
  }

  /** A greyed-out silhouette for roster slots that aren't filled yet. */
  function portraitLocked(size) {
    const P_ = size || 320;
    const cv = document.createElement('canvas');
    cv.width = P_; cv.height = P_;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = hex(C().paper);
    ctx.fillRect(0, 0, P_, P_);
    ctx.fillStyle = 'rgba(20,16,19,0.16)';
    ctx.beginPath();
    ctx.arc(P_ / 2, P_ * 0.4, P_ * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(P_ * 0.14, P_);
    ctx.quadraticCurveTo(P_ * 0.5, P_ * 0.58, P_ * 0.86, P_);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(20,16,19,0.4)';
    ctx.font = '900 ' + Math.round(P_ * 0.26) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', P_ / 2, P_ * 0.4);
    return cv;
  }

  const sideCache = {}, backCache = {}, underCache = {};
  const side = () => (sideCache.t || (sideCache.t = sideTexture()));
  const back = () => (backCache.t || (backCache.t = backTexture()));
  const under = () => (underCache.t || (underCache.t = underTexture()));

  return { get, build, side, back, under, portrait, portraitLocked, PATCHES };
})();
