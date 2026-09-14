/* Canvas-drawn face textures in the reference's inked-comic style.
 *
 * Everything is drawn with the 2D API at load time, so there are no image
 * files to fetch — the game runs from file:// with nothing to configure.
 * Key details carried over from the reference illustration: heavy dark brows,
 * a thick beard with a bald patch on the (viewer's) right cheek, hatched skin
 * shading, and a slightly panicked open mouth.
 */
window.PP = window.PP || {};

PP.Face = (function () {
  'use strict';

  const S = 512;
  const C = () => PP.CFG.COL;
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');

  function base(ctx) {
    ctx.fillStyle = hex(C().skin);
    ctx.fillRect(0, 0, S, S);

    // Warm cheek blush + hatched shading down the right side of the face,
    // matching the marker-over-ink feel of the reference.
    const g = ctx.createRadialGradient(150, 300, 10, 150, 300, 120);
    g.addColorStop(0, 'rgba(214,120,96,0.45)');
    g.addColorStop(1, 'rgba(214,120,96,0)');
    ctx.fillStyle = g;
    ctx.fillRect(30, 180, 240, 240);

    PP.U.hatch(ctx, 330, 60, 182, 400, 7, Math.PI / 3.2, 0.13, hex(C().skinDark));
    PP.U.hatch(ctx, 0, 380, 512, 132, 9, Math.PI / 2.6, 0.10, hex(C().skinDark));
  }

  function brows(ctx) {
    ctx.strokeStyle = hex(C().hair);
    ctx.fillStyle = hex(C().hair);
    // Thick, angry, slightly asymmetric — drawn as filled wedges, not strokes.
    ctx.beginPath();
    ctx.moveTo(120, 196); ctx.quadraticCurveTo(175, 168, 232, 190);
    ctx.quadraticCurveTo(178, 186, 122, 212); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(286, 190); ctx.quadraticCurveTo(344, 168, 398, 198);
    ctx.quadraticCurveTo(342, 186, 288, 208); ctx.closePath(); ctx.fill();
    // Worry creases between the brows
    ctx.strokeStyle = 'rgba(20,16,19,0.55)';
    PP.U.inkLine(ctx, 252, 176, 246, 208, 2.4, 0.6);
    PP.U.inkLine(ctx, 268, 178, 274, 206, 2.0, 0.6);
  }

  function eyes(ctx, mode) {
    const draw = (cx, cy, w, h, look) => {
      // White
      ctx.fillStyle = '#f7f3ec';
      ctx.beginPath(); ctx.ellipse(cx, cy, w, h, 0, 0, Math.PI * 2); ctx.fill();
      // Iris, shifted to glance back over the shoulder
      ctx.fillStyle = '#4a3020';
      ctx.beginPath(); ctx.arc(cx + look, cy + 1, h * 0.72, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#140f0d';
      ctx.beginPath(); ctx.arc(cx + look, cy + 1, h * 0.36, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(cx + look - h * 0.25, cy - h * 0.3, h * 0.16, 0, Math.PI * 2); ctx.fill();
      // Inked lid line, heavier on top
      ctx.strokeStyle = hex(C().ink); ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.ellipse(cx, cy, w, h, 0, Math.PI, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.ellipse(cx, cy, w, h, 0, 0, Math.PI); ctx.stroke();
    };
    const wide = mode === 'panic';
    const look = wide ? -12 : -6;
    draw(176, 244, 44, wide ? 30 : 24, look);
    draw(340, 244, 44, wide ? 30 : 24, look);
    // Under-eye bags — he is tired and being chased by clippers
    ctx.strokeStyle = 'rgba(20,16,19,0.35)';
    PP.U.inkLine(ctx, 140, 282, 214, 284, 2.2, 0.8);
    PP.U.inkLine(ctx, 304, 284, 378, 282, 2.2, 0.8);
  }

  function nose(ctx) {
    ctx.strokeStyle = hex(C().ink);
    ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(246, 248);
    ctx.quadraticCurveTo(232, 306, 250, 322);
    ctx.stroke();
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(250, 322); ctx.quadraticCurveTo(268, 328, 282, 314);
    ctx.stroke();
    ctx.fillStyle = 'rgba(20,16,19,0.7)';
    ctx.beginPath(); ctx.ellipse(238, 322, 9, 5, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(276, 320, 8, 5, 0.3, 0, Math.PI * 2); ctx.fill();
  }

  function mouth(ctx, mode) {
    if (mode === 'dead') {
      // Flat, defeated line
      ctx.strokeStyle = hex(C().ink);
      PP.U.inkLine(ctx, 196, 386, 318, 390, 5, 1);
      return;
    }
    // Open, mid-yell
    const open = mode === 'panic' ? 34 : 20;
    ctx.fillStyle = '#5a2230';
    ctx.beginPath();
    ctx.ellipse(256, 384, 62, open, 0, 0, Math.PI * 2);
    ctx.fill();
    // Top teeth
    ctx.fillStyle = '#f4efe4';
    ctx.beginPath();
    ctx.moveTo(200, 372); ctx.lineTo(312, 372);
    ctx.lineTo(306, 388); ctx.lineTo(206, 388); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = hex(C().ink); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(256, 384, 62, open, 0, 0, Math.PI * 2); ctx.stroke();
  }

  /* The beard — including the alopecia patch that the whole game is about. */
  function beard(ctx) {
    const c = hex(C().beard);
    ctx.save();
    // Beard mass: jaw, chin, moustache, sideburns
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(84, 268);
    ctx.quadraticCurveTo(78, 430, 190, 486);
    ctx.quadraticCurveTo(256, 512, 322, 486);
    ctx.quadraticCurveTo(434, 430, 428, 268);
    ctx.quadraticCurveTo(410, 360, 366, 392);
    ctx.quadraticCurveTo(322, 352, 256, 352);
    ctx.quadraticCurveTo(190, 352, 146, 392);
    ctx.quadraticCurveTo(102, 360, 84, 268);
    ctx.closePath();
    ctx.fill();

    // Moustache
    ctx.beginPath();
    ctx.moveTo(186, 344);
    ctx.quadraticCurveTo(256, 322, 326, 344);
    ctx.quadraticCurveTo(256, 358, 186, 344);
    ctx.closePath();
    ctx.fill();

    // Ragged hair-stroke edge so it reads as drawn, not as a filled shape
    ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = 0; i < 150; i++) {
      const t = i / 150;
      const a = Math.PI * (0.08 + t * 0.84);
      const rx = 176, ry = 150;
      const x = 256 - Math.cos(a) * rx;
      const y = 300 + Math.sin(a) * ry;
      const len = 12 + Math.random() * 16;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a + Math.PI / 2) * -len * 0.3, y + len);
      ctx.stroke();
    }

    // --- The bald patch (alopecia areata) on the right cheek ---------------
    // Skin shows through, with a soft feathered edge.
    ctx.globalCompositeOperation = 'destination-out';
    const g = ctx.createRadialGradient(330, 392, 6, 330, 392, 46);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.68, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(330, 392, 46, 38, 0.25, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // Fill the patch with bare skin + a faint outline, like the drawing
    ctx.fillStyle = 'rgba(232,164,138,0.85)';
    ctx.beginPath(); ctx.ellipse(330, 392, 40, 32, 0.25, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(90,50,40,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(330, 392, 40, 32, 0.25, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function jawline(ctx) {
    ctx.strokeStyle = hex(C().ink);
    ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(70, 150);
    ctx.quadraticCurveTo(52, 400, 256, 500);
    ctx.quadraticCurveTo(460, 400, 442, 150);
    ctx.stroke();
  }

  /**
   * mode: 'panic' (default, used in-run) | 'determined' (title) | 'dead' (game over)
   */
  function build(mode) {
    mode = mode || 'panic';
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const ctx = cv.getContext('2d');

    base(ctx);
    jawline(ctx);
    beard(ctx);
    brows(ctx);
    eyes(ctx, mode);
    nose(ctx);
    mouth(ctx, mode);

    // Final pass of loose ink hatching over the whole face to unify it
    PP.U.hatch(ctx, 0, 0, S, S, 26, Math.PI / 4, 0.05, hex(C().ink));

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

  return { get, build };
})();
