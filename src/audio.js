// Sound (2026-10-30, Shauna approved the plan): every sound effect is made in code with Web Audio, so
// there are no files to download and nothing borrowed. Music is CC0 tracks Shauna picked, listed in
// public/audio/music.json (an intro that plays once, then tracks that take turns); without that file the
// game simply has no music.
//
// Continuous sounds follow the car each frame (engine, tires on the ground, skids, water, wind rush) and
// the island (waves near the shore, birds by day, crickets at night, crackling torches nearby).
// One-shot sounds are played by name: sound.play('coin'), sound.play('boom', { at: position }).
// Browsers only allow sound after a click, so `start()` runs from the Start driving button.
// M mutes; the speaker button cycles all on, music off, all off. Settings are kept in localStorage.

const KEY = 'shoreline.audio';
const THREE_SMOOTH = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ } };

class Sound {
  constructor() {
    const s = load();
    this.mode = s.mode || 'all'; // 'all' | 'nomusic' | 'off'
    this.ctx = null;
    this.listener = { x: 0, z: 0 };
    this.lastPlay = {};
  }

  // ---------- setup ----------
  start() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    const comp = ctx.createDynamicsCompressor(); // keeps loud moments (explosions) from clipping
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.sfxBus.connect(this.master); this.musicBus.connect(this.master);
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus.gain.value = 0.9; this.musicBus.gain.value = 0.32;
    this.noise = this.makeNoise();
    this.buildLoops();
    this.applyMode();
    this.loadMusic();
  }

  makeNoise() {
    const len = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  noiseSource() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    src.loopStart = Math.random(); // different noise for each user
    return src;
  }

  filter(type, freq, q = 1) {
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    return f;
  }

  gain(v = 0) { const g = this.ctx.createGain(); g.gain.value = v; return g; }

  // A looping noise layer: noise -> filter -> gain -> sfx bus
  noiseLoop(type, freq, q) {
    const src = this.noiseSource(), f = this.filter(type, freq, q), g = this.gain(0);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start();
    return { f, g };
  }

  buildLoops() {
    const ctx = this.ctx;
    // Engine (reworked 2026-10-30, "less robotic"): built from firing pulses, like a real engine, not
    // oscillators. Two recorded-in-code loops of a small four-cylinder (one at low revs, one at high revs,
    // each pulse a little different) are played faster or slower for the revs and crossfaded, through a
    // load filter that opens with the throttle and a soft saturator for grit. Gears and shifts are simulated.
    const sat = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2); }
    sat.curve = curve;
    const load = this.filter('lowpass', 700, 0.9), body = this.filter('peaking', 140, 1.2); body.gain.value = 5;
    const eg = this.gain(0);
    const layer = (buf) => { const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; const g = this.gain(0); src.connect(g).connect(sat); src.start(0, Math.random() * buf.duration); return { src, g }; };
    const low = layer(this.engineLoop(28, 0)), high = layer(this.engineLoop(80, 1));
    sat.connect(body).connect(load).connect(eg).connect(this.sfxBus);
    const intake = this.noiseLoop('bandpass', 1400, 1.4); // the hiss of air under load
    this.engine = { low, high, load, g: eg, intake, rpm: 900, gear: 1, shift: 0, pops: 0, lastThrottle: 0 };
    // Tires: a different texture for each surface (road hiss, sand crunch, grass and earth rumble), a squeal
    // on the road (a wobbling tone with rubber noise) and a gritty scrape when sliding on sand
    this.roadRoll = this.noiseLoop('bandpass', 1200, 0.5);
    this.sandRoll = this.noiseLoop('bandpass', 700, 0.8);
    this.dirtRoll = this.noiseLoop('lowpass', 260, 0.7);
    this.scrape = this.noiseLoop('bandpass', 1100, 1.1);
    const sq = ctx.createOscillator(), sqv = ctx.createOscillator(), sqvG = this.gain(45), sqF = this.filter('bandpass', 1500, 4), sqG = this.gain(0);
    sq.type = 'sawtooth'; sq.frequency.value = 820; sqv.frequency.value = 7.5; sqv.connect(sqvG).connect(sq.frequency);
    sq.connect(sqF).connect(sqG).connect(this.sfxBus); sq.start(); sqv.start();
    this.squeal = { o: sq, g: sqG, hiss: this.noiseLoop('bandpass', 2600, 2) };
    this.water = this.noiseLoop('bandpass', 850, 0.9); // driving through a pool
    this.rush = this.noiseLoop('lowpass', 900, 0.5); // wind at speed
    this.waves = this.noiseLoop('lowpass', 520, 0.6); // surf near the shore
    this.fire = this.noiseLoop('highpass', 2500, 0.7); // torches nearby (crackle is added in update)
  }

  // A two-second loop of engine firings at `freq` firings a second. Each firing is a short thump (a decaying
  // low tone with the bang of exhaust noise), cylinders slightly unequal and timing a touch uneven, which is
  // what makes a real idle lope instead of buzz.
  engineLoop(freq, seed) {
    const sr = this.ctx.sampleRate, dur = 2, len = sr * dur, buf = this.ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    let r = 12345 + seed * 999;
    const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    const n = Math.round(freq * dur), cyl = [1, 0.82, 0.93, 0.76];
    for (let k = 0; k < n; k++) {
      const t0 = Math.floor(((k + (rnd() - 0.5) * 0.08) / n) * len);
      const amp = cyl[k % 4] * (0.85 + rnd() * 0.3), span = Math.floor((sr / freq) * 1.6), tone = 90 + rnd() * 30;
      for (let i = 0; i < span; i++) {
        const t = i / sr, e = Math.exp(-t * freq * 3.2);
        const v = amp * e * (Math.sin(2 * Math.PI * tone * t) * 0.7 + (rnd() * 2 - 1) * 0.45 * Math.exp(-t * freq * 7));
        d[(t0 + i) % len] += v;
      }
    }
    let peak = 0; for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
    for (let i = 0; i < len; i++) d[i] /= peak;
    return buf;
  }

  // ---------- settings ----------
  cycleMode() {
    this.mode = { all: 'nomusic', nomusic: 'off', off: 'all' }[this.mode];
    save({ mode: this.mode });
    this.applyMode();
    return this.mode;
  }
  toggleMute() {
    this.mode = this.mode === 'off' ? 'all' : 'off';
    save({ mode: this.mode });
    this.applyMode();
    return this.mode;
  }
  applyMode() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.mode === 'off' ? 0 : 1, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.mode === 'all' ? 0.32 : 0, t, 0.2);
  }

  // ---------- music ----------
  // music.json: { "intro": "file.mp3", "tracks": ["a.mp3", "b.mp3"] } (or a plain array of tracks).
  // The intro plays once when you start driving, then the tracks take turns.
  async loadMusic() {
    try {
      const res = await fetch('./audio/music.json');
      if (!res.ok) return;
      const data = await res.json();
      const tracks = Array.isArray(data) ? data : data.tracks || [];
      const intro = Array.isArray(data) ? null : data.intro || null;
      if (!tracks.length && !intro) return;
      this.music = { tracks, i: Math.floor(Math.random() * Math.max(1, tracks.length)) };
      this.playTrack(intro || tracks[this.music.i++ % tracks.length]);
    } catch { /* no music yet */ }
  }
  playTrack(file) {
    const el = new Audio(`./audio/${file}`);
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    const src = this.ctx.createMediaElementSource(el);
    src.connect(this.musicBus);
    el.addEventListener('ended', () => {
      const { tracks } = this.music;
      if (tracks.length) setTimeout(() => this.playTrack(tracks[this.music.i++ % tracks.length]), 1500); // a short breath between tracks
    });
    el.play().catch(() => {});
    this.music.el = el;
  }

  // ---------- continuous sounds, every frame ----------
  // s: { speed, throttle, boost, grounded, drifting, slip (sideways speed), surface ('road' | 'sand' | 'dirt'), inWater, coast (distance to the shore), night, torch (distance), x, z }
  update(dt, s) {
    if (!this.ctx || this.mode === 'off') return;
    const t = this.ctx.currentTime, k = 0.08, v = Math.abs(s.speed);
    this.listener = { x: s.x, z: s.z };
    // Revs: a simple gearbox. In gear the revs follow the wheels; off the ground or stopped they follow the throttle.
    const e = this.engine, G = [0, 2.0, 3.4, 5.0, 6.8, 9.0]; // speed (units/s) per 1000 rpm in each gear
    const IDLE = 900, MAX = 6400;
    let target;
    if (!s.grounded || v < 1.2) target = IDLE + s.throttle * (s.grounded ? 1800 : 4200);
    else {
      if (e.shift <= 0) {
        const r = IDLE + (v / G[e.gear]) * 1000;
        if (r > 5600 && e.gear < 5) { e.gear++; e.shift = 0.16; }
        else if (r < 2300 && e.gear > 1) e.gear--;
      }
      target = IDLE + (v / G[e.gear]) * 1000;
      if (s.boost) target += 500;
    }
    if (e.shift > 0) { e.shift -= dt; target *= 0.82; } // the dip while the clutch is in
    target = Math.min(MAX, target);
    e.rpm += (target - e.rpm) * Math.min(1, dt * (target > e.rpm ? 7 : 4));
    // Lifting off at high revs: a few crackles from the exhaust
    if (e.lastThrottle > 0.5 && s.throttle < 0.1 && e.rpm > 3200) e.pops = 0.6;
    e.lastThrottle = s.throttle;
    if (e.pops > 0) { e.pops -= dt; if (Math.random() < dt * 14) this.pop(0.09, 300 + Math.random() * 500); }
    const firing = e.rpm / 30; // firings a second (four cylinders, four-stroke)
    const hi = THREE_SMOOTH(1800, 3800, e.rpm);
    e.low.src.playbackRate.setTargetAtTime(firing / 28, t, 0.03);
    e.high.src.playbackRate.setTargetAtTime(firing / 80, t, 0.03);
    e.low.g.gain.setTargetAtTime(1 - hi, t, 0.05);
    e.high.g.gain.setTargetAtTime(hi * 0.9, t, 0.05);
    const loadAmt = s.grounded ? s.throttle : s.throttle * 0.5;
    e.load.frequency.setTargetAtTime(380 + loadAmt * 1400 + e.rpm * 0.18 + (s.boost ? 500 : 0), t, 0.06);
    e.g.gain.setTargetAtTime((0.13 + loadAmt * 0.08 + (e.rpm / MAX) * 0.06) * (e.shift > 0 ? 0.6 : 1), t, 0.05);
    e.intake.g.gain.setTargetAtTime(loadAmt * (e.rpm / MAX) * 0.05, t, 0.08);
    e.intake.f.frequency.setTargetAtTime(900 + e.rpm * 0.35, t, 0.08);

    // Tires by surface
    const roll = s.grounded && !s.inWater ? Math.min(v / 18, 1) : 0, surf = s.surface || 'dirt';
    this.roadRoll.g.gain.setTargetAtTime(surf === 'road' ? roll * 0.07 : 0, t, k);
    this.roadRoll.f.frequency.setTargetAtTime(700 + v * 30, t, k);
    this.sandRoll.g.gain.setTargetAtTime(surf === 'sand' ? roll * 0.13 : 0, t, k);
    this.dirtRoll.g.gain.setTargetAtTime(surf === 'dirt' ? roll * 0.2 : 0, t, k);
    if (roll && surf !== 'road' && Math.random() < dt * v * 1.6) this.pop(0.03 * roll, surf === 'sand' ? 2200 + Math.random() * 2500 : 500 + Math.random() * 900); // grit and pebbles
    // Sliding: the handbrake, or the back stepping out in a fast corner
    const slide = s.grounded ? Math.min(1, Math.max(s.drifting ? Math.min(v / 12, 1) : 0, (Math.abs(s.slip || 0) - 2.5) / 6)) : 0;
    const onRoad = surf === 'road';
    this.squeal.g.gain.setTargetAtTime(onRoad ? slide * 0.035 : 0, t, 0.05);
    this.squeal.hiss.g.gain.setTargetAtTime(onRoad ? slide * 0.06 : 0, t, 0.05);
    this.squeal.o.frequency.setTargetAtTime(700 + v * 9, t, 0.1);
    this.scrape.g.gain.setTargetAtTime(!onRoad ? slide * 0.16 : 0, t, 0.05);
    if (slide > 0.2 && !onRoad && Math.random() < dt * 30 * slide) this.pop(0.04 * slide, 1500 + Math.random() * 3000);
    this.water.g.gain.setTargetAtTime(s.inWater ? 0.05 + Math.min(v / 12, 1) * 0.25 : 0, t, k);
    this.rush.g.gain.setTargetAtTime(Math.max(0, v - 8) / 30 * 0.12, t, 0.2);
    // Surf: louder close to the shore, rolling in and out
    const near = Math.max(0, 1 - Math.max(0, s.coast) / 14);
    const swell = 0.55 + 0.45 * Math.sin(t * 0.9) * Math.sin(t * 0.37 + 1);
    this.waves.g.gain.setTargetAtTime(0.02 + near * 0.12 * swell, t, 0.3);
    // Torches: a soft hiss plus random pops when close
    const fire = Math.max(0, 1 - s.torch / 9);
    this.fire.g.gain.setTargetAtTime(fire * 0.015, t, 0.2);
    if (fire > 0 && Math.random() < dt * 9 * fire) this.pop(0.05 * fire, 1800 + Math.random() * 2500);
    // Birds by day, crickets at night
    if (Math.random() < dt * 0.35 * (1 - s.night)) this.bird();
    if (Math.random() < dt * 2.2 * s.night) this.cricket();
  }

  // ---------- small building blocks ----------
  env(g, t, peak, a, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  tone(freq, { type = 'sine', at = 0, peak = 0.2, a = 0.005, d = 0.3, to = null, out = this.sfxBus } = {}) {
    const t = this.ctx.currentTime + at, o = this.ctx.createOscillator(), g = this.gain(0);
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + a + d);
    o.connect(g).connect(out);
    this.env(g, t, peak, a, d);
    o.start(t); o.stop(t + a + d + 0.05);
  }
  burst({ type = 'lowpass', freq = 800, to = null, q = 1, at = 0, peak = 0.3, a = 0.005, d = 0.3, out = this.sfxBus } = {}) {
    const t = this.ctx.currentTime + at, src = this.noiseSource(), f = this.filter(type, freq, q), g = this.gain(0);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + a + d);
    src.connect(f).connect(g).connect(out);
    this.env(g, t, peak, a, d);
    src.start(t, Math.random()); src.stop(t + a + d + 0.05);
  }
  pop(peak, freq) { this.burst({ type: 'bandpass', freq, q: 3, peak, d: 0.03 }); }
  bird() {
    const base = 2600 + Math.random() * 1600, n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.tone(base * (1 + Math.random() * 0.2), { at: i * 0.11, peak: 0.018, a: 0.01, d: 0.07, to: base * (1.3 + Math.random() * 0.4) });
  }
  cricket() {
    const f = 4300 + Math.random() * 400;
    for (let i = 0; i < 3; i++) this.tone(f, { at: i * 0.045, peak: 0.012, a: 0.004, d: 0.025, type: 'triangle' });
  }
  // Volume by distance from the car, for sounds that happen somewhere on the island
  far(at, reach = 40) {
    if (!at) return 1;
    const d = Math.hypot(at.x - this.listener.x, at.z - this.listener.z);
    return Math.max(0, 1 - d / reach);
  }
  // One sound of a kind per short window, so a pile of events doesn't stack into a roar
  ok(name, gap) {
    const t = performance.now();
    if (this.lastPlay[name] && t - this.lastPlay[name] < gap) return false;
    this.lastPlay[name] = t;
    return true;
  }

  // ---------- one-shot sounds ----------
  play(name, { at = null, amount = 1 } = {}) {
    if (!this.ctx || this.mode === 'off') return;
    const notes = (list, opts = {}) => list.forEach((f, i) => { this.tone(f, { at: i * (opts.step ?? 0.09), peak: opts.peak ?? 0.12, d: opts.d ?? 0.35, type: opts.type ?? 'triangle' }); this.tone(f * 2, { at: i * (opts.step ?? 0.09), peak: (opts.peak ?? 0.12) * 0.25, d: (opts.d ?? 0.35) * 0.6 }); });
    switch (name) {
      case 'shell': notes([988, 1319, 1568], { step: 0.07 }); break;
      case 'rare': notes([1047, 1319, 1568, 2093, 2637], { step: 0.06, peak: 0.1 }); break;
      case 'coin': if (this.ok('coin', 60)) { this.tone(1568, { type: 'square', peak: 0.05, d: 0.06 }); this.tone(2093, { type: 'square', at: 0.06, peak: 0.05, d: 0.18 }); } break;
      case 'fanfare': notes([523, 659, 784, 1047, 784, 1047], { step: 0.11, peak: 0.13, d: 0.5 }); break;
      case 'checkpoint': notes([1175, 1568], { step: 0.07, peak: 0.1 }); break;
      case 'go': this.tone(660, { type: 'square', peak: 0.06, d: 0.12 }); this.tone(660, { type: 'square', at: 0.25, peak: 0.06, d: 0.12 }); this.tone(1320, { type: 'square', at: 0.5, peak: 0.07, d: 0.4 }); break;
      case 'goal': notes([392, 523, 659, 784, 1047], { step: 0.08, peak: 0.13, d: 0.6 }); this.burst({ type: 'bandpass', freq: 1400, q: 0.5, peak: 0.12, a: 0.15, d: 1.4 }); break;
      case 'plop': this.tone(500, { to: 160, peak: 0.25, d: 0.18 }); break;
      case 'sad': this.tone(392, { type: 'triangle', peak: 0.1, d: 0.25 }); this.tone(330, { type: 'triangle', at: 0.22, peak: 0.1, d: 0.45 }); break;
      case 'pins': { // wooden pins clattering, more pins more clatter
        const n = Math.round(3 + amount * 10);
        for (let i = 0; i < n; i++) this.burst({ type: 'bandpass', freq: 900 + Math.random() * 1800, q: 6, at: Math.random() * 0.5, peak: 0.12, d: 0.06 + Math.random() * 0.05 });
        break;
      }
      case 'splash': if (this.ok('splash', 400)) this.burst({ type: 'bandpass', freq: 1200, to: 400, q: 0.8, peak: 0.28 * amount, a: 0.01, d: 0.5 }); break;
      case 'jump': this.burst({ type: 'bandpass', freq: 500, to: 1600, q: 1.5, peak: 0.08, a: 0.05, d: 0.25 }); break;
      case 'land': if (this.ok('land', 250)) { this.tone(110, { to: 45, peak: 0.35 * amount, d: 0.22 }); this.burst({ freq: 500, peak: 0.12 * amount, d: 0.15 }); } break;
      case 'hit': if (this.ok('hit', 120)) { this.tone(150, { to: 60, peak: 0.25 * amount, d: 0.15 }); this.burst({ type: 'bandpass', freq: 700, q: 1.2, peak: 0.22 * amount, d: 0.12 }); } break;
      case 'rustle': if (this.ok('rustle', 300)) this.burst({ type: 'bandpass', freq: 3000, q: 0.6, peak: 0.07, a: 0.03, d: 0.35 }); break;
      case 'fuse': this.burst({ type: 'highpass', freq: 3500, peak: 0.06 * this.far(at), a: 0.02, d: 0.32 }); break;
      case 'boom': { // explosion: a crack, a deep thump and a rumble that dies away, quieter far off
        const k = this.far(at, 70) * Math.min(1.4, amount);
        if (!k) break;
        this.burst({ type: 'lowpass', freq: 3000, to: 200, peak: 0.6 * k, a: 0.003, d: 1.6 });
        this.tone(70, { to: 28, peak: 0.7 * k, a: 0.005, d: 0.9 });
        this.burst({ type: 'lowpass', freq: 160, peak: 0.45 * k, a: 0.05, d: 2.4 });
        break;
      }
      case 'launch': if (this.ok('launch', 120)) this.tone(500, { to: 2200, peak: 0.04 * this.far(at, 60), a: 0.02, d: 0.7 }); break;
      case 'pop': this.burst({ type: 'bandpass', freq: 900 + Math.random() * 600, q: 0.7, peak: 0.22 * this.far(at, 60), a: 0.002, d: 0.5 }); for (let i = 0; i < 6; i++) this.pop(0.04 * this.far(at, 60), 3000 + Math.random() * 3000); break;
      case 'boing': if (this.ok('boing', 200)) this.tone(220, { to: 520, peak: 0.12, d: 0.28 }); break;
      default: break;
    }
  }

  // Toasts already mark the game's big moments, so most event sounds come from their titles
  onToast(title) {
    const T = title.toLowerCase();
    if (T.startsWith('shell found')) this.play('shell');
    else if (T.startsWith('rare')) this.play('rare');
    else if (T.startsWith('all shells') || T.startsWith('all the treasure') || T.startsWith('strike') || T.startsWith('lap:') || T.startsWith('hole in one')) this.play('fanfare');
    else if (T.startsWith('treasure')) this.play('rare');
    else if (T.startsWith('goal')) this.play('goal');
    else if (T.startsWith('go!')) this.play('go');
    else if (T.startsWith('in the hole')) this.play('plop');
    else if (T.startsWith('lost ball')) this.play('sad');
    else if (T.startsWith('splash')) this.play('splash');
  }
}

export const sound = new Sound();
