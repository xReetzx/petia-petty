/* All sound is synthesized at runtime — no audio files to load or host.
 *
 * The clipper buzz is the important one: it's a continuous drone whose pitch,
 * volume and filter track `menace`, so you hear them gaining on you before
 * you think to look back. */
window.PP = window.PP || {};

PP.Audio = (function () {
  'use strict';

  let ctx = null;
  let master = null;
  let buzz = null;         // { osc, sub, noise, filter, gain, lfo }
  let muted = PP.U ? false : false;
  let started = false;

  function noiseBuffer(c, seconds) {
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /* Must be called from a user gesture — browsers block audio otherwise. */
  function start() {
    if (started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);
    _buildBuzz();
    started = true;
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function _buildBuzz() {
    const g = ctx.createGain();
    g.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 1.4;

    // Sawtooth motor + square sub for body
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 92;
    const sub = ctx.createOscillator();
    sub.type = 'square';
    sub.frequency.value = 46;
    const subG = ctx.createGain();
    subG.gain.value = 0.35;

    // Noise layer = the blade rattle
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, 2);
    noise.loop = true;
    const noiseG = ctx.createGain();
    noiseG.gain.value = 0.25;

    // Slow LFO so the motor wavers rather than sitting dead flat
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7.5;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 14;
    lfo.connect(lfoG);
    lfoG.connect(osc.frequency);

    osc.connect(filter);
    sub.connect(subG); subG.connect(filter);
    noise.connect(noiseG); noiseG.connect(filter);
    filter.connect(g);
    g.connect(master);

    osc.start(); sub.start(); noise.start(); lfo.start();
    buzz = { osc, sub, noise, filter, gain: g, lfo };
  }

  /** Drive the chase drone from menace (0..1). */
  function setMenace(m) {
    if (!buzz || !ctx) return;
    const t = ctx.currentTime;
    const target = 0.04 + m * 0.3;
    buzz.gain.gain.setTargetAtTime(target, t, 0.12);
    buzz.osc.frequency.setTargetAtTime(78 + m * 88, t, 0.15);
    buzz.sub.frequency.setTargetAtTime(39 + m * 44, t, 0.15);
    buzz.filter.frequency.setTargetAtTime(650 + m * 1900, t, 0.15);
    buzz.lfo.frequency.setTargetAtTime(6 + m * 11, t, 0.2);
  }

  function stopBuzz() {
    if (buzz && ctx) buzz.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
  }

  /* ---- One-shots -------------------------------------------------------- */
  function tone(freq, dur, type, vol, sweepTo) {
    if (!ctx || muted) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (sweepTo) o.frequency.exponentialRampToValueAtTime(sweepTo, ctx.currentTime + dur);
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(vol == null ? 0.25 : vol, ctx.currentTime + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(master);
    o.start(); o.stop(ctx.currentTime + dur + 0.02);
  }

  function noiseBurst(dur, vol, freq, type) {
    if (!ctx || muted) return;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer(ctx, Math.max(dur, 0.05));
    const f = ctx.createBiquadFilter();
    f.type = type || 'highpass';
    f.frequency.value = freq || 2000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol == null ? 0.3 : vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(); s.stop(ctx.currentTime + dur + 0.02);
  }

  const sfx = {
    jump() { tone(320, 0.16, 'sine', 0.16, 640); noiseBurst(0.1, 0.08, 1600); },
    land() { noiseBurst(0.08, 0.12, 500, 'lowpass'); },
    slide() { noiseBurst(0.3, 0.16, 900, 'bandpass'); },
    lane() { tone(520, 0.06, 'triangle', 0.07); },
    coin(combo) {
      const base = 760 + Math.min(combo || 0, 8) * 55;
      tone(base, 0.09, 'triangle', 0.13);
      tone(base * 1.5, 0.07, 'sine', 0.07);
    },
    // Two quick shears — the sound of losing hair
    snip() {
      noiseBurst(0.07, 0.42, 3800);
      setTimeout(() => noiseBurst(0.07, 0.36, 3200), 70);
      tone(180, 0.22, 'sawtooth', 0.16, 70);
    },
    hit() { tone(150, 0.2, 'square', 0.2, 60); noiseBurst(0.15, 0.2, 400, 'lowpass'); },
    shield() { tone(420, 0.3, 'sine', 0.18, 880); tone(630, 0.32, 'triangle', 0.1); },
    serum() { tone(520, 0.35, 'sine', 0.2, 1040); },
    dead() {
      tone(300, 0.8, 'sawtooth', 0.22, 60);
      setTimeout(() => tone(200, 0.9, 'square', 0.16, 40), 120);
      noiseBurst(0.5, 0.2, 1200);
    },
    start() { tone(440, 0.12, 'triangle', 0.16); setTimeout(() => tone(660, 0.18, 'triangle', 0.16), 110); }
  };

  function setMuted(m) {
    muted = m;
    if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
  }
  function isMuted() { return muted; }

  return { start, resume, setMenace, stopBuzz, sfx, setMuted, isMuted,
           get ready() { return started; } };
})();
