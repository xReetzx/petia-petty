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
    beardTopSide: 250,      // where the sideburn meets the ear
    beardLineMid: 326       // the beard's cheek line, centre of the face
  };

  /* Where the bare spots sit: [x, y, radiusX, radiusY, rotation].
   * The big one on the viewer's right is the prominent patch in the reference
   * drawing; the smaller ones are the scatter that comes with it. */
  // The drawing has exactly one bare spot, high on his left cheek where the
  // beard thins out. Earlier versions scattered several and he looked mangy.
  const PATCHES = [
    [360, 348, 42, 35, 0.18]
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

    // Forehead creases
    ctx.strokeStyle = 'rgba(112,66,48,0.4)';
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const y = 112 + i * 22;
      ctx.lineWidth = 3 - i * 0.5;
      ctx.beginPath();
      ctx.moveTo(P.cx - 104 + i * 8, y + 4);
      ctx.quadraticCurveTo(P.cx, y - 8, P.cx + 104 - i * 8, y + 5);
      ctx.stroke();
    }
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
    ctx.moveTo(P.cx - 150, P.beardTopSide);
    ctx.quadraticCurveTo(P.cx - 162, 372, P.cx - 94, 452);
    ctx.quadraticCurveTo(P.cx, P.faceBottom + 14, P.cx + 94, 452);
    ctx.quadraticCurveTo(P.cx + 162, 372, P.cx + 150, P.beardTopSide);
    // Back along the cheek line. It rides high under the cheekbones and only
    // dips in the middle to clear the mouth — a full beard, as in the
    // reference, not a chinstrap.
    // Walk the cheek line back with a little wobble rather than sweeping two
    // clean arcs — a smooth boundary reads as a shape laid over the face.
    const wob = PP.U.rng(515);
    for (let i = 0; i <= 26; i++) {
      const t = i / 26;                       // 0 at the right ear, 1 at the left
      const x = P.cx + 150 - t * 300;
      const arc = Math.sin(t * Math.PI);
      const y = P.beardTopSide + arc * (P.beardLineMid - P.beardTopSide + 16)
                + (wob() - 0.5) * 13;
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    // Moustache, reaching up under the nose
    ctx.beginPath();
    ctx.moveTo(P.cx - 88, 340);
    ctx.quadraticCurveTo(P.cx - 44, 300, P.cx, 306);
    ctx.quadraticCurveTo(P.cx + 44, 300, P.cx + 88, 340);
    ctx.quadraticCurveTo(P.cx + 44, 352, P.cx, 348);
    ctx.quadraticCurveTo(P.cx - 44, 352, P.cx - 88, 340);
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
    for (let i = 0; i < 420; i++) {
      const x = P.cx - 158 + Math.random() * 316;
      const t = (x - (P.cx - 158)) / 316;
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

    // Strands through the whole mass, so it reads as hair rather than paint
    const strandRand = PP.U.rng(8080);
    for (let i = 0; i < 900; i++) {
      const x = P.cx - 160 + strandRand() * 320;
      const y = 300 + strandRand() * 190;
      const len = 7 + strandRand() * 13;
      const ang = Math.PI / 2 + (strandRand() - 0.5) * 0.7;
      ctx.strokeStyle = strandRand() < 0.5 ? '#4e3327' : '#2a1a13';
      ctx.globalAlpha = 0.25 + strandRand() * 0.45;
      ctx.lineWidth = 1.2 + strandRand() * 1.3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(ang) * len * 0.3, y + Math.sin(ang) * len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Ink weight low on the chin
    PP.U.hatch(ctx, 130, 396, 252, 100, 7, Math.PI / 2.3, 0.14, '#000');
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
      // Bare skin, warmed very slightly — the point is that hair is missing,
      // not that there's a mark on him.
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, Math.max(rx, ry));
      g.addColorStop(0, 'rgba(236,176,140,0.55)');
      g.addColorStop(0.62, 'rgba(236,176,140,0.3)');
      g.addColorStop(1, 'rgba(236,176,140,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx * 0.95, ry * 0.95, 0, 0, Math.PI * 2);
      ctx.fill();
      // Stubble creeping back in at the rim, so the edge isn't a clean cut
      ctx.strokeStyle = hex(C().beard);
      ctx.lineCap = 'round';
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2;
        const rr = 0.72 + Math.random() * 0.3;
        ctx.globalAlpha = 0.3 + Math.random() * 0.4;
        ctx.lineWidth = 1.3 + Math.random();
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * rx * rr, Math.sin(a) * ry * rr);
        ctx.lineTo(Math.cos(a) * rx * (rr + 0.22), Math.sin(a) * ry * (rr + 0.22));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
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
    /* Narrow and hooded, not big and round.
     *
     * Round cartoon eyes were the single thing making him look like a
     * different person: in the reference they are half-lidded and tired, with
     * a heavy upper lid cutting across the iris, deep bags underneath, and
     * crow's feet at the outer corners. */
    const ry = (mode === 'panic') ? P.eyeRy * 0.78 : P.eyeRy * 0.62;
    const rx = P.eyeRx * 1.06;
    const glance = -10;                       // both eyes cut to his right

    [-1, 1].forEach((s2) => {
      const cx = P.cx + s2 * P.eyeDx, cy = P.eyeY;

      if (mode === 'dead') {
        ctx.strokeStyle = hex(C().ink); ctx.lineWidth = 6; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - rx, cy - 5);
        ctx.quadraticCurveTo(cx, cy + 13, cx + rx, cy - 5);
        ctx.stroke();
        return;
      }

      // The opening: an almond, flatter on top where the lid sits
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx - rx, cy + 2);
      ctx.quadraticCurveTo(cx - rx * 0.3, cy - ry * 1.5, cx + rx * 0.55, cy - ry * 0.85);
      ctx.quadraticCurveTo(cx + rx, cy - ry * 0.35, cx + rx, cy + 3);
      ctx.quadraticCurveTo(cx + rx * 0.4, cy + ry * 1.45, cx - rx * 0.45, cy + ry * 1.1);
      ctx.quadraticCurveTo(cx - rx * 0.9, cy + ry * 0.7, cx - rx, cy + 2);
      ctx.closePath();
      ctx.clip();

      ctx.fillStyle = '#f4efe4';
      ctx.fillRect(cx - rx - 4, cy - ry * 2, rx * 2 + 8, ry * 4);

      // Iris, pushed high and to one side, partly under the lid
      ctx.fillStyle = '#4b3220';
      ctx.beginPath(); ctx.arc(cx + glance, cy, ry * 1.15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#17110e';
      ctx.beginPath(); ctx.arc(cx + glance, cy, ry * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(cx + glance - ry * 0.4, cy - ry * 0.45, ry * 0.22, 0, Math.PI * 2); ctx.fill();

      // The upper lid's shadow falling across the top of the eye
      ctx.fillStyle = 'rgba(60,38,28,0.34)';
      ctx.fillRect(cx - rx - 4, cy - ry * 2, rx * 2 + 8, ry * 1.25);
      ctx.restore();

      // Heavy inked upper lid, thin lower
      ctx.strokeStyle = hex(C().ink); ctx.lineCap = 'round';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(cx - rx, cy + 2);
      ctx.quadraticCurveTo(cx - rx * 0.3, cy - ry * 1.5, cx + rx * 0.55, cy - ry * 0.85);
      ctx.quadraticCurveTo(cx + rx, cy - ry * 0.35, cx + rx, cy + 3);
      ctx.stroke();
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(cx + rx, cy + 3);
      ctx.quadraticCurveTo(cx + rx * 0.4, cy + ry * 1.45, cx - rx * 0.45, cy + ry * 1.1);
      ctx.quadraticCurveTo(cx - rx * 0.9, cy + ry * 0.7, cx - rx, cy + 2);
      ctx.stroke();

      // Hood crease above the lid
      ctx.strokeStyle = 'rgba(40,26,20,0.5)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - rx * 0.85, cy - ry * 1.9);
      ctx.quadraticCurveTo(cx, cy - ry * 3.0, cx + rx * 0.95, cy - ry * 1.5);
      ctx.stroke();

      // Bags: two soft lines under each eye
      ctx.strokeStyle = 'rgba(120,70,52,0.45)';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(cx - rx * 0.8, cy + ry * 2.0);
      ctx.quadraticCurveTo(cx, cy + ry * 3.1, cx + rx * 0.85, cy + ry * 1.9);
      ctx.stroke();
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(cx - rx * 0.6, cy + ry * 3.0);
      ctx.quadraticCurveTo(cx, cy + ry * 3.9, cx + rx * 0.7, cy + ry * 2.8);
      ctx.stroke();

      // Crow's feet at the outer corner
      ctx.strokeStyle = 'rgba(60,38,28,0.35)';
      ctx.lineWidth = 2;
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.moveTo(cx + s2 * rx * 1.02, cy + k * 7);
        ctx.lineTo(cx + s2 * (rx * 1.02 + 20), cy + k * 13 - 2);
        ctx.stroke();
      }
    });
  }

  function nose(ctx) {
    ctx.strokeStyle = hex(C().ink);
    ctx.lineCap = 'round';
    ctx.lineWidth = 4.6;
    // Bridge down the viewer's left, as in the reference's three-quarter look
    ctx.beginPath();
    ctx.moveTo(P.cx - 6, P.noseTop);
    ctx.quadraticCurveTo(P.cx - 26, P.noseTip - 22, P.cx - 12, P.noseTip);
    ctx.stroke();
    // Tip and the near nostril wing
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(P.cx - 12, P.noseTip);
    ctx.quadraticCurveTo(P.cx + 8, P.noseTip + 10, P.cx + 26, P.noseTip - 6);
    ctx.stroke();
    ctx.fillStyle = 'rgba(20,16,19,0.72)';
    ctx.beginPath(); ctx.ellipse(P.cx - 24, P.noseTip, 11, 6.5, -0.28, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(P.cx + 22, P.noseTip - 4, 10, 6, 0.28, 0, Math.PI * 2); ctx.fill();
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

    const open = mode === 'panic' ? 19 : 11;
    const halfW = 46;

    // Lips: a thin warm edge, not a ring of lipstick round the opening
    ctx.fillStyle = 'rgba(168,96,90,0.85)';
    ctx.beginPath();
    ctx.ellipse(P.cx, P.mouthY, halfW + 6, open + 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#4e2028';
    ctx.beginPath();
    ctx.ellipse(P.cx, P.mouthY, halfW, open, 0, 0, Math.PI * 2);
    ctx.fill();

    /* A hint of upper teeth, nothing more.
     * Two earlier attempts drew a bright white band across a dark opening —
     * once with hard dividing lines, once with faint ones — and both read as
     * a gap-toothed grin at any distance. The fix is contrast, not detail:
     * warm ivory rather than white, occupying only the top of the opening,
     * with no seams at all. */
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(P.cx, P.mouthY, halfW, open, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#e8ddc6';
    ctx.beginPath();
    ctx.moveTo(P.cx - halfW, P.mouthY - open);
    ctx.lineTo(P.cx + halfW, P.mouthY - open);
    ctx.lineTo(P.cx + halfW * 0.9, P.mouthY - open * 0.18);
    ctx.quadraticCurveTo(P.cx, P.mouthY + open * 0.04, P.cx - halfW * 0.9, P.mouthY - open * 0.18);
    ctx.closePath();
    ctx.fill();
    // Shadow where the top lip overhangs
    ctx.fillStyle = 'rgba(40,16,22,0.34)';
    ctx.fillRect(P.cx - halfW, P.mouthY - open, halfW * 2, 4.5);
    ctx.restore();

    ctx.fillStyle = 'rgba(190,112,104,0.6)';
    ctx.beginPath();
    ctx.ellipse(P.cx, P.mouthY + open * 0.86, halfW * 0.74, open * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    // Inked mouth line, heavier on top
    ctx.strokeStyle = ink; ctx.lineCap = 'round';
    ctx.lineWidth = 4.4;
    ctx.beginPath();
    ctx.ellipse(P.cx, P.mouthY, halfW + 4, open + 5, 0, Math.PI * 0.98, Math.PI * 2.02);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(P.cx, P.mouthY, halfW + 4, open + 5, 0, 0, Math.PI);
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
    ctx.moveTo(0, 0); ctx.lineTo(S, 0); ctx.lineTo(S, 418);
    ctx.quadraticCurveTo(384, 462, 256, 452);
    ctx.quadraticCurveTo(128, 462, 0, 418);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = hex(c.hair);
    ctx.lineCap = 'round';
    for (let i = 0; i < 220; i++) {
      const x = Math.random() * S;
      const t = x / S;
      const edge = 418 + Math.sin(t * Math.PI) * 42;
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


  /* ---- The artwork ------------------------------------------------------
   * His face is the reference illustration itself, not a drawing of it.
   * PP.Art holds it as data URIs baked by tools/bake-art.py — see that file
   * for why it is embedded rather than loaded.
   *
   * The drawn face below is kept as a fallback: if the image fails to decode
   * for any reason the game still has a face to put on him, and the locked
   * roster slots have no artwork of their own.
   */
  let artCanvas = null, artTex = null, artStarted = false;

  /* Hand back ONE texture object immediately and fill it in when the image
   * decodes.
   *
   * Decoding is asynchronous, so returning the artwork only once it is ready
   * means the material is built from the drawn fallback and never swapped —
   * which is exactly what happened on the first attempt. Instead the canvas
   * and its texture are created up front, seeded with the drawn face so there
   * is never a blank frame, and the image is painted into that same canvas
   * later with `needsUpdate`. The material holds one texture throughout and
   * does not care that its pixels changed.
   */

  /* ---- The head, as one continuous surface ------------------------------
   *
   * The head used to be a box with a different picture on each of its six
   * faces: a three-quarter portrait on the front, a closer crop of that SAME
   * portrait on both sides (so he had a face on each side of his head), and a
   * flat brown slab at the back with none of the illustration's ink in it.
   * They met at hard 90-degree corners where tone, scale and line weight all
   * jumped at once. That is what "stitched together" was, and no amount of
   * re-cropping fixes it while the geometry is a cube.
   *
   * So: one rounded mesh, one texture, painted all the way round.
   *
   * The canvas is equirectangular, which is exactly what a UV sphere wants.
   * `x` runs around the head and `y` from crown to chin. The face artwork is
   * composited into the middle through a soft elliptical mask, so instead of
   * ending at a rectangle its edges dissolve into skin that carries on around
   * the sides and joins itself at the back.
   *
   * Two mapping facts this depends on, both verified against the render
   * rather than assumed:
   *
   *  - A default THREE.SphereGeometry puts u = 0 at -X, so the UV seam would
   *    land on his left cheek. `player.js` shifts the map by -0.25 to move it
   *    to the back of his head, which also lands the canvas centre on his
   *    face. Change one without the other and the seam crosses his nose.
   *  - Canvas x increasing appears to move RIGHT when you are looking at his
   *    face, so the artwork goes on unmirrored.
   */
  const WRAP_W = 1024, WRAP_H = 512;

  // Character palette if one is selected, otherwise the base scheme.
  function pal() {
    const base = PP.CFG.COL;
    const cc = PP.Characters && PP.Characters.current && PP.Characters.current().colors;
    return new Proxy(base, { get: (t, k) => (cc && cc[k] != null ? cc[k] : t[k]) });
  }

  // Longitude in degrees (0 = straight ahead) to a canvas x.
  const lonX = (deg) => WRAP_W / 2 + (deg / 360) * WRAP_W;

  function paintWrap(ctx, faceImg) {
    const c = pal();
    const W = WRAP_W, H = WRAP_H;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // --- skin everywhere ---------------------------------------------------
    ctx.fillStyle = hex(c.skin);
    ctx.fillRect(0, 0, W, H);
    PP.U.hatch(ctx, 0, 0, W, H, 11, Math.PI / 2.9, 0.08, hex(c.skinDark));

    // Under the jaw goes into shadow, which also hides the pole pinch.
    const under = ctx.createLinearGradient(0, H * 0.72, 0, H);
    under.addColorStop(0, 'rgba(0,0,0,0)');
    under.addColorStop(1, 'rgba(60,32,22,0.55)');
    ctx.fillStyle = under;
    ctx.fillRect(0, H * 0.72, W, H * 0.28);

    // --- beard, swept continuously round the jaw ---------------------------
    // Drawn as one path across the whole width so it closes on itself at the
    // seam: a beard that stopped short of the edges would show a chin-strap
    // join at the back of his head.
    // Toned toward his hair rather than the lighter beard swatch: beside the
    // drawn beard, which is near-black hatching, the mid-brown read as a bald
    // patch rather than as the same beard continuing round.
    ctx.fillStyle = hex(c.hair);
    ctx.globalAlpha = 0.88;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.62);
    for (let x = 0; x <= W; x += 16) {
      // Highest at the sideburns, dipping across the front where his
      // moustache and mouth sit, and rising again behind the ears.
      const lon = ((x / W) - 0.5) * 360;            // -180..180, 0 = front
      const front = Math.cos((lon * Math.PI) / 180); // 1 at front, -1 at back
      const y = H * (0.60 - front * 0.10) + Math.sin(x * 0.05) * 5;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H); ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // Ragged edge, so it reads as hair rather than a painted mask
    ctx.strokeStyle = hex(c.hair);
    ctx.lineCap = 'round';
    const rb = PP.U.rng(90210);
    for (let i = 0; i < 1100; i++) {
      const x = rb() * W;
      const lon = ((x / W) - 0.5) * 360;
      const front = Math.cos((lon * Math.PI) / 180);
      const edge = H * (0.60 - front * 0.10);
      ctx.lineWidth = 1.6 + rb() * 2.2;
      ctx.beginPath();
      ctx.moveTo(x, edge + rb() * 26);
      ctx.lineTo(x + (rb() - 0.5) * 9, edge - 6 - rb() * 26);
      ctx.stroke();
    }

    // --- nape: hair coming down the back -----------------------------------
    // Drawn as a cosine falloff across the FULL width rather than a polygon
    // spanning part of it. A polygon has straight vertical sides, and a
    // straight vertical edge on an equirectangular wrap becomes a hard line
    // down the side of his skull. Centred on the seam, so its two halves meet
    // exactly where the texture joins itself.
    const napeY = (x) => {
      const lon = ((x / W) - 0.5) * 360;
      const back = (1 - Math.cos((lon * Math.PI) / 180)) / 2;   // 0 front, 1 back
      return H * (0.02 + Math.pow(back, 1.8) * 0.62);
    };
    ctx.fillStyle = hex(c.hair);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let x = 0; x <= W; x += 8) ctx.lineTo(x, napeY(x));
    ctx.lineTo(W, 0);
    ctx.closePath();
    ctx.fill();

    const rn = PP.U.rng(1357);
    ctx.strokeStyle = hex(c.hair);
    for (let i = 0; i < 420; i++) {
      const x = rn() * W;
      const edge = napeY(x);
      if (edge < H * 0.06) continue;          // nothing to fringe at the front
      ctx.lineWidth = 1.8 + rn() * 2.2;
      ctx.beginPath();
      ctx.moveTo(x, edge - 14 - rn() * 20);
      ctx.lineTo(x + (rn() - 0.5) * 7, edge + rn() * 16);
      ctx.stroke();
    }

    /* --- one ear -------------------------------------------------------
     *
     * Only on his right. The artwork is a three-quarter view that already
     * contains his left ear, and painting a second one over it is exactly
     * what the old head did — sphere ears sitting on top of drawn ones. So
     * the wrap supplies only the ear the drawing does not.
     */
    (() => {
      const x = lonX(-95), y = H * 0.50;
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = hex(c.skin);
      ctx.strokeStyle = hex(c.skinDark);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(0, 0, 24, 36, 0.12, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(3, 3, 10, 18, 0.12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    })();

    // --- the artwork --------------------------------------------------------
    const fw = (PP.CFG.FACE_SPAN / 360) * W;
    const fh = H * PP.CFG.FACE_HEIGHT;
    const fx = lonX(PP.CFG.FACE_YAW_FIX) - fw / 2;
    const fy = H * PP.CFG.FACE_TOP;

    // Mask on its own canvas: compositing the feather directly onto the wrap
    // would erase the skin underneath it rather than blending into it.
    const m = document.createElement('canvas');
    m.width = Math.ceil(fw); m.height = Math.ceil(fh);
    const mc = m.getContext('2d');
    if (faceImg) {
      mc.drawImage(faceImg, 0, 0, m.width, m.height);
    } else {
      // Fallback: the hand-drawn face, so the head is never blank while the
      // baked artwork is still decoding.
      const seed = build('panic');
      mc.drawImage(seed.image, 0, 0, m.width, m.height);
      seed.dispose();
    }
    mc.globalCompositeOperation = 'destination-in';
    // Build the gradient AFTER the translate and centred on the local origin:
    // canvas resolves gradient coordinates in the transform active at fill
    // time, which has bitten this project before.
    mc.translate(m.width / 2, m.height / 2);
    mc.scale(1, m.height / m.width);
    const g = mc.createRadialGradient(0, 0, m.width * 0.20, 0, 0, m.width * 0.5);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.72, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    mc.fillStyle = g;
    mc.fillRect(-m.width, -m.height, m.width * 2, m.height * 2);

    ctx.drawImage(m, fx, fy, fw, fh);

    // A wash of the illustration's ink over everything, so the painted parts
    // and the drawn parts sit in the same medium.
    PP.U.hatch(ctx, 0, 0, W, H, 28, Math.PI / 4, 0.03, hex(c.ink));
  }

  let wrapCv = null, wrapTex = null, wrapStarted = false;
  function headWrap() {
    if (!wrapCv) {
      wrapCv = document.createElement('canvas');
      wrapCv.width = WRAP_W; wrapCv.height = WRAP_H;
      paintWrap(wrapCv.getContext('2d'), null);
      wrapTex = new THREE.CanvasTexture(wrapCv);
      wrapTex.anisotropy = 4;
      wrapTex.wrapS = THREE.RepeatWrapping;
      // Move the UV seam off his cheek and onto the back of his head. This
      // also lands the canvas centre on his face — see the note above.
      wrapTex.offset.x = -0.25;
    }
    /* Decoding is asynchronous, so hand back one texture object immediately
     * and repaint into the same canvas when the image arrives. Returning the
     * artwork only once ready means materials get built from the fallback and
     * never swapped, which is a bug this project has already shipped once.
     */
    if (!wrapStarted && window.PP && PP.Art && PP.Art.face) {
      wrapStarted = true;
      const img = new Image();
      img.onload = () => {
        paintWrap(wrapCv.getContext('2d'), img);
        wrapTex.needsUpdate = true;
      };
      img.src = PP.Art.face;
    }
    return wrapTex;
  }

  /** Repaint the wrap after a character change re-tones the palette. */
  function refreshHead() {
    if (!wrapCv) return;
    wrapStarted = false;
    paintWrap(wrapCv.getContext('2d'), null);
    wrapTex.needsUpdate = true;
    headWrap();
  }

  function artTexture(mode) {
    if (!artCanvas) {
      artCanvas = document.createElement('canvas');
      artCanvas.width = artCanvas.height = S;
      const seed = build(mode || 'panic');
      artCanvas.getContext('2d').drawImage(seed.image, 0, 0);
      seed.dispose();
      artTex = new THREE.CanvasTexture(artCanvas);
      artTex.anisotropy = 4;
    }
    if (!artStarted && window.PP && PP.Art && PP.Art.face) {
      artStarted = true;
      const img = new Image();
      img.onload = () => {
        const ctx = artCanvas.getContext('2d');
        ctx.clearRect(0, 0, S, S);
        ctx.drawImage(img, 0, 0, S, S);
        artTex.needsUpdate = true;
      };
      // No handler needed on failure: the canvas already holds the drawn face.
      img.src = PP.Art.face;
    }
    return artTex;
  }


  /* The same deferred-decode trick for any other baked crop: build the canvas
   * and its texture now, seed it with a drawn fallback, paint the image in
   * when it decodes. One texture object throughout, so materials built before
   * the image arrives still end up showing it. */
  function bakedTexture(key, size, seedFn) {
    const store = bakedTexture._cache || (bakedTexture._cache = {});
    if (store[key]) return store[key].tex;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    if (seedFn) {
      const seed = seedFn();
      cv.getContext('2d').drawImage(seed.image, 0, 0, size, size);
      seed.dispose();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    store[key] = { tex, cv };
    const uri = window.PP && PP.Art && PP.Art[key];
    if (uri) {
      const img = new Image();
      img.onload = () => {
        const ctx = cv.getContext('2d');
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
        tex.needsUpdate = true;
      };
      img.src = uri;
    }
    return tex;
  }

  const cache = {};
  function get(mode) {
    // One texture for every mode: the illustration has a single expression,
    // and it is his likeness that matters rather than a panic variant.
    return artTexture(mode || 'panic');
  }

  /** The drawn face, bypassing the artwork — used by the fallback portrait. */
  function drawn(mode) {
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
    // Petty's card is the illustration itself. Everything below is the drawn
    // fallback, still used for any character without artwork.
    if (character && character.art !== false && window.PP && PP.Art && PP.Art.cover) {
      const P_ = size || 320;
      const cv = document.createElement('canvas');
      cv.width = P_; cv.height = P_;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = hex(C().paper);
      ctx.fillRect(0, 0, P_, P_);
      const img = new Image();
      img.onload = () => {
        // Fill the square on his head and shoulders
        const sw = img.width, sh = img.height;
        const cropH = sw * 1.02;
        const sy = Math.max(0, sh * 0.05);
        ctx.drawImage(img, 0, sy, sw, Math.min(cropH, sh - sy), 0, 0, P_, P_);
      };
      img.src = PP.Art.cover;
      return cv;
    }
    return portraitDrawn(character, size);
  }

  function portraitDrawn(character, size) {
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
  // His ear, jaw and beard in profile come out of the illustration itself —
  // the painted version sat lighter and flatter than the artwork on the front
  // and the seam at the box edge showed.
  const side = () => bakedTexture('side', 384, sideTexture);
  const back = () => (backCache.t || (backCache.t = backTexture()));
  const under = () => (underCache.t || (underCache.t = underTexture()));

  return { get, drawn, build, headWrap, refreshHead, portrait, portraitLocked, PATCHES };
})();
