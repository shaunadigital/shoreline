// Sound (2026-10-30, Shauna approved the plan): every sound effect is made in code with Web Audio, so
// there are no files to download and nothing borrowed. Music plays from CC0 tracks listed in
// public/audio/music.json when that file exists (see _docs/PROJECT_STATUS.md); without it the game
// simply has no music.
//
// Continuous sounds follow the car each frame (engine, tires on the ground, skids, water, wind rush) and
// the island (waves near the shore, birds by day, crickets at night, crackling torches nearby).
// One-shot sounds are played by name: sound.play('coin'), sound.play('boom', { at: position }).
// Browsers only allow sound after a click, so `start()` runs from the Start driving button.
// M mutes; the speaker button cycles all on, music off, all off. Settings are kept in localStorage.

const KEY = 'shoreline.audio';
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
    // Engine: two detuned saws and a square an octave down, through a lowpass that opens with the throttle,
    // with a fast wobble for the putter of a small engine
    const eg = this.gain(0), lp = this.filter('lowpass', 500, 2);
    const oscs = [['sawtooth', 0], ['sawtooth', 7], ['square', -1200]].map(([type, detune]) => {
      const o = ctx.createOscillator(); o.type = type; o.detune.value = detune; o.frequency.value = 50; o.connect(lp); o.start(); return o;
    });
    const wob = ctx.createOscillator(), wobG = this.gain(0.25);
    wob.frequency.value = 22; wob.connect(wobG);
    const am = this.gain(0.75); wobG.connect(am.gain); wob.start();
    lp.connect(am).connect(eg).connect(this.sfxBus);
    this.engine = { oscs, lp, g: eg, wob };
    this.roll = this.noiseLoop('lowpass', 380, 0.7); // tires on sand and road
    this.skid = this.noiseLoop('bandpass', 1900, 2.2); // drifting
    this.water = this.noiseLoop('bandpass', 850, 0.9); // driving through a pool
    this.rush = this.noiseLoop('lowpass', 900, 0.5); // wind at speed
    this.waves = this.noiseLoop('lowpass', 520, 0.6); // surf near the shore
    this.fire = this.noiseLoop('highpass', 2500, 0.7); // torches nearby (crackle is added in update)
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
  async loadMusic() {
    try {
      const res = await fetch('./audio/music.json');
      if (!res.ok) return;
      const list = await res.json();
      if (!Array.isArray(list) || !list.length) return;
      this.music = { list, i: Math.floor(Math.random() * list.length) };
      this.playTrack();
    } catch { /* no music yet */ }
  }
  playTrack() {
    const { list } = this.music;
    const el = new Audio(`./audio/${list[this.music.i % list.length]}`);
    el.crossOrigin = 'anonymous';
    const src = this.ctx.createMediaElementSource(el);
    src.connect(this.musicBus);
    el.addEventListener('ended', () => { this.music.i++; this.playTrack(); });
    el.play().catch(() => {});
    this.music.el = el;
  }

  // ---------- continuous sounds, every frame ----------
  // s: { speed, throttle, boost, grounded, drifting, inWater, coast (distance to the shore), night, torch (distance), x, z }
  update(dt, s) {
    if (!this.ctx || this.mode === 'off') return;
    const t = this.ctx.currentTime, k = 0.08, v = Math.abs(s.speed);
    this.listener = { x: s.x, z: s.z };
    const e = this.engine, rpm = 38 + v * 3.6 + s.throttle * 14 + (s.boost ? 18 : 0);
    for (const o of e.oscs) o.frequency.setTargetAtTime(rpm, t, k);
    e.wob.frequency.setTargetAtTime(rpm * 0.45, t, k);
    e.lp.frequency.setTargetAtTime(380 + s.throttle * 900 + v * 30 + (s.boost ? 600 : 0), t, k);
    e.g.gain.setTargetAtTime(0.05 + s.throttle * 0.06 + Math.min(v, 25) * 0.002, t, k);
    this.roll.g.gain.setTargetAtTime(s.grounded ? Math.min(v / 20, 1) * 0.22 : 0, t, k);
    this.roll.f.frequency.setTargetAtTime(250 + v * 12, t, k);
    this.skid.g.gain.setTargetAtTime(s.drifting ? Math.min(v / 15, 1) * 0.16 : 0, t, 0.05);
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
