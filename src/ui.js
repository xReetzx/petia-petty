/* HUD and overlay screens. Plain DOM over the canvas — crisp text at any DPI
 * and far easier to make responsive than drawing it into WebGL. */
window.PP = window.PP || {};

PP.UI = (function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  // Rotating game-over lines. Self-deprecating, never mean — it's his bit.
  const DEATH_LINES = [
    'He fought the clippers. The clippers won.',
    'Follicles remaining: zero.',
    'That\'s not a fade, that\'s a surrender.',
    'Buzzed into the shadow realm.',
    'The scalp giveth, the clippers taketh away.',
    'Somewhere, a barber felt that.',
    'You can\'t outrun genetics. Or clippers.',
    'Clean shave. Not by choice.'
  ];

  const el = {};
  let lastToast = 0;

  function init() {
    ['hud', 'score', 'dist', 'combo', 'hair', 'menaceFill',
     'screenTitle', 'screenPause', 'screenOver',
     'bestTitle', 'finalScore', 'finalDist', 'finalBest', 'deathLine',
     'toast', 'muteBtn', 'pauseBtn', 'newBest'].forEach((k) => { el[k] = $(k); });
  }

  function show(which) {
    el.screenTitle.classList.toggle('on', which === 'title');
    el.screenPause.classList.toggle('on', which === 'pause');
    el.screenOver.classList.toggle('on', which === 'over');
    el.hud.classList.toggle('on', which === 'play' || which === 'pause');
  }

  function setHair(n, max) {
    if (!el.hair) return;
    let html = '';
    for (let i = 0; i < max; i++) {
      html += '<span class="tuft' + (i < n ? '' : ' gone') + '"></span>';
    }
    el.hair.innerHTML = html;
  }

  function setScore(score, metres, combo) {
    el.score.textContent = String(Math.floor(score));
    el.dist.textContent = Math.floor(metres) + 'm';
    if (combo > 1) {
      el.combo.textContent = '×' + combo;
      el.combo.classList.add('on');
    } else {
      el.combo.classList.remove('on');
    }
  }

  function setMenace(m) {
    if (el.menaceFill) el.menaceFill.style.width = Math.round(m * 100) + '%';
    if (el.hud) el.hud.classList.toggle('danger', m > 0.78);
  }

  function toast(text, cls) {
    const now = performance.now();
    if (now - lastToast < 120) return;
    lastToast = now;
    el.toast.textContent = text;
    el.toast.className = 'toast on ' + (cls || '');
    // Restart the CSS animation
    void el.toast.offsetWidth;
    el.toast.className = 'toast on show ' + (cls || '');
  }

  function setBest(best) {
    if (el.bestTitle) el.bestTitle.textContent = best > 0 ? String(best) : '—';
  }

  function gameOver(score, metres, best, isNew) {
    el.finalScore.textContent = String(Math.floor(score));
    el.finalDist.textContent = Math.floor(metres) + 'm';
    el.finalBest.textContent = String(best);
    el.newBest.classList.toggle('on', !!isNew);
    el.deathLine.textContent = DEATH_LINES[(Math.random() * DEATH_LINES.length) | 0];
    show('over');
  }

  function setMuted(m) {
    if (el.muteBtn) {
      el.muteBtn.textContent = m ? '🔇' : '🔊';
      el.muteBtn.setAttribute('aria-label', m ? 'Unmute' : 'Mute');
      el.muteBtn.setAttribute('aria-pressed', m ? 'true' : 'false');
    }
  }

  return { init, show, setHair, setScore, setMenace, toast, setBest, gameOver, setMuted, DEATH_LINES };
})();
