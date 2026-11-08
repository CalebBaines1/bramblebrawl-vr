/* Hivebound audio: synthesized effects and a gentle generative meadow tune. No files to load. */
(function (root) {
  'use strict';
  const MW = root.MW = root.MW || {};
  let ctx = null, master, sfxBus, musicBus, noiseBuf, musicTimer = null;
  const vol = { master: 0.8, sfx: 0.9, music: 0.45, musicOn: true };

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    applyVol();
    if (vol.musicOn) startMusic();
  }
  function applyVol() {
    if (!ctx) return;
    master.gain.value = vol.master;
    sfxBus.gain.value = vol.sfx;
    musicBus.gain.value = vol.musicOn ? vol.music * 0.5 : 0;
  }
  function setVolume(o) { Object.assign(vol, o); applyVol(); if (ctx && vol.musicOn && !musicTimer) startMusic(); }

  function tone(freq, dur, type, gain, when, glideTo, bus) {
    if (!ctx) return;
    const t = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.3, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, filter, freq, gain, when, sweepTo, q) {
    if (!ctx) return;
    const t = ctx.currentTime + (when || 0);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = filter || 'lowpass'; f.frequency.setValueAtTime(freq || 1200, t); f.Q.value = q || 0.8;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  const SFX = {
    click() { tone(880, 0.06, 'triangle', 0.12); },
    hover() { tone(1320, 0.03, 'sine', 0.04); },
    select() { tone(660, 0.07, 'triangle', 0.14); tone(990, 0.09, 'triangle', 0.1, 0.05); },
    deny() { tone(220, 0.12, 'square', 0.06); tone(180, 0.14, 'square', 0.05, 0.08); },
    whoosh() { noise(0.35, 'bandpass', 400, 0.25, 0, 2400, 1.5); },
    thud() { tone(140, 0.3, 'sine', 0.5, 0, 45); noise(0.18, 'lowpass', 600, 0.25); },
    hop() { tone(300, 0.12, 'sine', 0.12, 0, 600); },
    hit(amount, adv) {
      const a = Math.min(8, amount || 1);
      noise(0.16 + a * 0.02, 'lowpass', 1800 + a * 200, 0.25 + a * 0.03);
      tone(260 - a * 12, 0.18, 'square', 0.09, 0, 90);
      if (adv) { tone(1046, 0.12, 'triangle', 0.12, 0.02); tone(1568, 0.16, 'triangle', 0.1, 0.07); }
    },
    block() { tone(1400, 0.08, 'triangle', 0.1); tone(1800, 0.1, 'sine', 0.06, 0.03); },
    heal() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'sine', 0.1, i * 0.06)); },
    buff() { [392, 494, 587].forEach((f, i) => tone(f, 0.2, 'sawtooth', 0.05, i * 0.05)); noise(0.3, 'bandpass', 900, 0.08, 0, 2400); },
    shield() { tone(660, 0.4, 'sine', 0.1, 0, 990); tone(990, 0.4, 'sine', 0.06, 0.05, 1320); },
    die() { tone(500, 0.45, 'triangle', 0.15, 0, 90); noise(0.4, 'bandpass', 1500, 0.15, 0.05, 300); },
    crush() { for (let i = 0; i < 6; i++) noise(0.05, 'highpass', 2500 + Math.random() * 2000, 0.12, i * 0.025); },
    armed() { tone(784, 0.15, 'sine', 0.1); tone(1175, 0.2, 'sine', 0.08, 0.06); },
    fizzle() { noise(0.6, 'highpass', 3000, 0.08, 0, 800); tone(400, 0.4, 'sine', 0.05, 0, 150); },
    throw() { noise(0.25, 'bandpass', 800, 0.18, 0, 2000, 2); },
    burn() { noise(0.5, 'lowpass', 900, 0.15, 0, 3000); },
    wind() { noise(0.7, 'bandpass', 300, 0.28, 0, 1800, 0.7); },
    splat() { noise(0.2, 'lowpass', 500, 0.3, 0, 150); tone(160, 0.15, 'sine', 0.15, 0, 70); },
    twang() { tone(196, 0.4, 'sawtooth', 0.08, 0, 180); tone(392, 0.25, 'triangle', 0.06); noise(0.1, 'bandpass', 2000, 0.1); },
    stretch() { tone(120, 0.15, 'sawtooth', 0.025, 0, 160); },
    pump() { noise(0.28, 'lowpass', 700, 0.3, 0, 200); tone(90, 0.2, 'sine', 0.2, 0, 60); },
    puff() { noise(0.35, 'bandpass', 1200, 0.18, 0, 400); },
    stomp() { tone(80, 0.5, 'sine', 0.6, 0, 35); noise(0.4, 'lowpass', 400, 0.35); },
    build() { [0, 0.1, 0.2].forEach(w => { tone(180 + w * 300, 0.1, 'square', 0.06, w); noise(0.06, 'bandpass', 1200, 0.1, w); }); },
    draw() { noise(0.12, 'highpass', 4000, 0.06); tone(1200, 0.08, 'sine', 0.05, 0.03); },
    turn(mine) { (mine ? [523, 784] : [392, 311]).forEach((f, i) => tone(f, 0.5, 'sine', 0.15, i * 0.12)); },
    surgeReady() { [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.4, 'triangle', 0.09, i * 0.05)); },
    thunder() { noise(1.6, 'lowpass', 2500, 0.5, 0, 120); tone(55, 1.2, 'sawtooth', 0.15, 0, 30); },
    zap() { noise(0.15, 'highpass', 3000, 0.25); tone(1800, 0.1, 'square', 0.05, 0, 400); },
    bloom() { [523, 659, 784, 988, 1175, 1318].forEach((f, i) => tone(f, 0.6, 'sine', 0.08, i * 0.07)); },
    horn() { tone(196, 0.9, 'sawtooth', 0.09); tone(294, 0.9, 'sawtooth', 0.06, 0.15); noise(0.6, 'lowpass', 300, 0.25, 0.1); },
    win() { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, 0.35, 'triangle', 0.12, i * 0.11)); },
    lose() { [440, 392, 349, 262].forEach((f, i) => tone(f, 0.5, 'sine', 0.12, i * 0.2)); }
  };

  /* Generative pastoral music: soft pad chords, a plucked pentatonic melody, a little bass. */
  const CHORDS = [[261.6, 329.6, 392], [220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7]];
  const SCALE = [523.3, 587.3, 659.3, 784, 880, 1046.5, 1174.7];
  let step = 0, nextTime = 0;
  function startMusic() {
    if (!ctx || musicTimer) return;
    nextTime = ctx.currentTime + 0.1;
    musicTimer = setInterval(schedule, 120);
  }
  function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }
  function schedule() {
    if (!ctx) return;
    if (!vol.musicOn) { stopMusic(); return; }
    const beat = 60 / 84 / 2;
    while (nextTime < ctx.currentTime + 0.4) {
      const bar = Math.floor(step / 8) % CHORDS.length, pos = step % 8;
      const when = nextTime - ctx.currentTime;
      if (pos === 0) CHORDS[bar].forEach(f => pad(f / 2, beat * 8, when));
      if (pos === 0 || pos === 4) tone(CHORDS[bar][0] / 4, beat * 3, 'sine', 0.12, when, null, musicBus);
      if (Math.random() < (pos % 2 ? 0.25 : 0.5)) {
        const n = SCALE[Math.floor(Math.random() * SCALE.length)];
        pluck(n, when);
      }
      nextTime += beat;
      step++;
    }
  }
  function pad(freq, dur, when) {
    const t = ctx.currentTime + when;
    [0, 4].forEach(det => {
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = det;
      f.type = 'lowpass'; f.frequency.value = 700;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.025, t + dur * 0.35);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(musicBus);
      o.start(t); o.stop(t + dur + 0.1);
    });
  }
  function pluck(freq, when) { tone(freq, 0.6, 'triangle', 0.06, when, null, musicBus); tone(freq * 2, 0.25, 'sine', 0.02, when, null, musicBus); }

  MW.Audio = { init, setVolume, sfx: SFX, play(name, ...a) { try { if (ctx && SFX[name]) SFX[name](...a); } catch (e) { /* audio is optional */ } } };
})(typeof window !== 'undefined' ? window : globalThis);
