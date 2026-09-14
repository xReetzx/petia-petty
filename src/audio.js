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
  let musicGain = null;
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
    musicGain = ctx.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(master);
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


  /* ---- Music ------------------------------------------------------------
   * An original chiptune, written for this game — bouncy major-key square
   * lead over a walking bass with a noise kit, in the spirit of 8-bit
   * platformer music. Deliberately NOT a transcription of any existing game
   * theme: those are copyrighted compositions and this repo is public.
   *
   * Scheduled with the standard Web Audio lookahead pattern: a coarse timer
   * wakes up often enough to queue the next slice of notes slightly ahead of
   * the clock, so timing comes from the audio hardware rather than setTimeout.
   */
  const MUSIC = (function () {
    const STEP_PER_BAR = 16;
    const R = null;                       // rest
    const hold = (n, k) => Array(k).fill(n);

    // Lead: four bars, sixteenth-note grid. Repeating a note sustains it.
    const LEAD = [].concat(
      hold(67,2), hold(71,2), hold(74,2), hold(71,2),
      hold(67,2), hold(R,2),  hold(69,2), hold(71,2),

      hold(72,2), hold(71,2), hold(69,2), hold(67,2),
      hold(64,4), hold(R,4),

      hold(69,2), hold(72,2), hold(76,2), hold(72,2),
      hold(69,2), hold(R,2),  hold(71,2), hold(72,2),

      hold(74,2), hold(72,2), hold(71,2), hold(69,2),
      hold(67,6), hold(R,2)
    );

    // Counter-melody an octave down, thinner, entering on the second pass
    const HARM = LEAD.map((n) => (n == null ? null : n - 12));

    // Walking bass: root, octave, fifth, octave per bar
    const bar = (root, fifth) => [].concat(
      hold(root, 2), hold(root + 12, 2), hold(fifth, 2), hold(root + 12, 2),
      hold(root, 2), hold(root + 12, 2), hold(fifth, 2), hold(root + 12, 2)
    );
    const BASS = [].concat(bar(43, 50), bar(48, 55), bar(45, 52), bar(43, 50));

    const TOTAL = LEAD.length;

    let timer = null, step = 0, nextTime = 0, pass = 0;
    const LOOKAHEAD = 0.12;               // seconds queued in advance
    const TICK = 25;                      // ms between scheduler wakeups

    let bpm = 150;
    function stepDur() { return 60 / bpm / 4; }

    function blip(freq, t, dur, type, vol, duty) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      // Short attack, quick decay — the classic square-wave pluck
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.008);
      g.gain.setValueAtTime(vol, t + dur * 0.55);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(musicGain);
      o.start(t); o.stop(t + dur + 0.02);
      if (duty) {
        // Cheap vibrato on held notes so the lead isn't dead flat
        const lfo = ctx.createOscillator();
        const la = ctx.createGain();
        lfo.frequency.setValueAtTime(5.5, t);
        la.gain.setValueAtTime(3.5, t);
        lfo.connect(la); la.connect(o.frequency);
        lfo.start(t); lfo.stop(t + dur + 0.02);
      }
    }

    function drum(t, kind) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx, 0.2);
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      if (kind === 'kick') {
        const o = ctx.createOscillator();
        const og = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(140, t);
        o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
        og.gain.setValueAtTime(0.42, t);
        og.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
        o.connect(og); og.connect(musicGain);
        o.start(t); o.stop(t + 0.15);
        return;
      }
      if (kind === 'snare') {
        f.type = 'bandpass'; f.frequency.setValueAtTime(1900, t); f.Q.value = 0.8;
        g.gain.setValueAtTime(0.2, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      } else {
        f.type = 'highpass'; f.frequency.setValueAtTime(7000, t);
        g.gain.setValueAtTime(0.055, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      }
      src.connect(f); f.connect(g); g.connect(musicGain);
      src.start(t); src.stop(t + 0.2);
    }

    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

    function scheduleStep(i, t) {
      const inBar = i % STEP_PER_BAR;

      // Swing: nudge the off-eighths late, which is what gives it the bounce
      const swung = (inBar % 4 === 2) ? t + stepDur() * 0.34 : t;

      // Lead — only on note onsets, not on the held repeats
      const n = LEAD[i];
      if (n != null && LEAD[(i - 1 + TOTAL) % TOTAL] !== n) {
        let len = 1;
        while (LEAD[(i + len) % TOTAL] === n && len < 8) len++;
        blip(midi(n), swung, stepDur() * len * 0.92, 'square', 0.1, true);
      }

      // Harmony joins from the second time round, so the loop develops
      if (pass > 0) {
        const h = HARM[i];
        if (h != null && HARM[(i - 1 + TOTAL) % TOTAL] !== h) {
          blip(midi(h), swung, stepDur() * 1.6, 'triangle', 0.045, false);
        }
      }

      const b = BASS[i];
      if (b != null && i % 2 === 0) {
        blip(midi(b), t, stepDur() * 1.7, 'triangle', 0.13, false);
      }

      if (inBar === 0 || inBar === 8) drum(t, 'kick');
      if (inBar === 4 || inBar === 12) drum(t, 'snare');
      if (inBar % 2 === 0) drum(t, 'hat');
    }

    function tick() {
      if (!ctx) return;
      while (nextTime < ctx.currentTime + LOOKAHEAD) {
        scheduleStep(step, nextTime);
        nextTime += stepDur();
        step++;
        if (step >= TOTAL) { step = 0; pass++; }
      }
    }

    return {
      start() {
        if (!ctx || timer) return;
        step = 0; pass = 0;
        nextTime = ctx.currentTime + 0.08;
        musicGain.gain.setTargetAtTime(0.85, ctx.currentTime, 0.25);
        timer = setInterval(tick, TICK);
        tick();
      },
      stop() {
        if (timer) { clearInterval(timer); timer = null; }
        if (ctx && musicGain) musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
      },
      /* Wind the tempo up as the run gets faster and the clippers close, so
       * the music carries the same tension the chase meter does. */
      setIntensity(speedT, menace) {
        bpm = 150 + speedT * 22 + menace * 14;
      },
      get playing() { return !!timer; }
    };
  })();

  function setMuted(m) {
    muted = m;
    if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
  }
  function isMuted() { return muted; }

  return { start, resume, setMenace, stopBuzz, sfx, setMuted, isMuted,
           music: MUSIC,
           get ready() { return started; } };
})();
