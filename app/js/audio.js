// Web Audio: every sound is synthesized (no audio files).
// A 4-bar loop in C with a pentatonic 笛子-like lead; layers are added as the show level rises,
// and the tempo follows the show intensity (and ?speed).
import { SPEED } from './core.js';

const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const PENT = [0, 2, 4, 7, 9];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

const PROG = [
  { tones: [60, 64, 67], bass: 36 }, // C
  { tones: [57, 60, 64], bass: 45 }, // Am
  { tones: [57, 60, 65], bass: 41 }, // F
  { tones: [55, 59, 62], bass: 43 }, // G
];
const MELODY = [
  [76, 79, 81, 79, 76, 74, 72, 74],
  [76, null, 81, 84, 81, 79, 76, null],
  [81, 84, 86, 84, 81, 79, 81, 84],
  [86, null, 84, 81, 79, null, 74, 79],
];
const COUNTER = [[88, null, null, 91], [88, null, 84, null], [89, null, 88, null], [86, null, 91, null]];

export class Audio {
  constructor() {
    this.ctx = null; this.muted = false; this.volume = 0.8;
    this.level = 0; this.key = 0; this.bpm = 104; this.playing = false;
    this.step = 0; this.nextTime = 0; this.kicks = [];
  }

  // Adopt the context index.html created while loading (suspended) and build the graph, off the
  // first tap. Called once the title screen is idle; unlock() does it too if it has not happened.
  prepare() {
    if (this.ctx || !window.__audioCtx) return;
    try { this.ctx = window.__audioCtx; this.build(); } catch (e) { this.ctx = null; }
  }

  // Must be called from a user gesture; safe to call repeatedly.
  unlock() {
    try {
      this.prepare();
      if (!this.ctx) {
        // Without a user gesture (e.g. ?demo on load) wait: a gesture later unlocks it.
        if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC({ latencyHint: 'interactive' });
        this.build();
      }
      if (this.ctx.state === 'suspended' && (!navigator.userActivation || navigator.userActivation.isActive)) this.ctx.resume();
    } catch (e) { this.ctx = null; }
  }

  build() {
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.7 * this.volume;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(c.destination);
    this.musicBus = c.createGain(); this.musicBus.gain.value = 0.75;
    this.duck = c.createGain();
    // 听牌: a low-pass on the music that closes while the last digit is pending (setReach).
    this.reachLP = c.createBiquadFilter(); this.reachLP.type = 'lowpass'; this.reachLP.frequency.value = 20000; this.reachLP.Q.value = 0.7;
    this.musicBus.connect(this.reachLP); this.reachLP.connect(this.duck); this.duck.connect(this.master);
    this.sfx = c.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    // Small room reverb from generated noise.
    const len = Math.floor(c.sampleRate * 1.6);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3; }
    this.rev = c.createConvolver(); this.rev.buffer = ir;
    this.revIn = c.createGain(); this.revIn.gain.value = 0.35;
    this.revIn.connect(this.rev); this.rev.connect(this.master);
    const nlen = c.sampleRate;
    this.noiseBuf = c.createBuffer(1, nlen, c.sampleRate);
    const nd = this.noiseBuf.getChannelData(0); for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
  }

  get ok() { return !!(this.ctx && this.ctx.state === 'running'); }
  now() { return this.ctx ? this.ctx.currentTime : 0; }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7 * this.volume, this.now(), 0.03); }
  setVolume(v) { this.volume = Math.max(0, Math.min(1, v)); this.setMuted(this.muted); }

  // ---------------------------------------------------------------- building blocks
  env(t, { a = 0.004, peak = 1, d = 0.2, sus = 0, hold = 0, r = 0.1 } = {}) {
    const g = this.ctx.createGain(); const p = g.gain;
    p.setValueAtTime(0.0001, t); p.linearRampToValueAtTime(peak, t + a);
    if (sus > 0) { p.setTargetAtTime(peak * sus, t + a, d / 3); p.setValueAtTime(peak * sus, t + a + hold); p.exponentialRampToValueAtTime(0.0001, t + a + hold + r); } else p.exponentialRampToValueAtTime(0.0001, t + a + d);
    return g;
  }
  osc(type, f, t, stop) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(stop); return o; }
  noise(t, stop) { const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true; n.start(t, Math.random() * 0.8); n.stop(stop); return n; }
  filter(type, f, q = 0.7) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  pan(v) { const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : this.ctx.createGain(); if (p.pan) p.pan.value = v; return p; }
  out(node, bus, rev = 0) { node.connect(bus); if (rev) { const s = this.ctx.createGain(); s.gain.value = rev; node.connect(s); s.connect(this.revIn); } }
  at(t) { return Math.max(t, this.ctx.currentTime); }

  // ---------------------------------------------------------------- instruments
  pluck(t, m, v = 0.18, dur = 0.5, pv = 0, bus = this.musicBus) {
    const f = hz(m);
    const e = this.env(t, { a: 0.002, peak: v, d: dur }); const p = this.pan(pv);
    this.osc('sine', f, t, t + dur + 0.05).connect(e);
    const e2 = this.env(t, { a: 0.001, peak: v * 0.5, d: 0.05 }); this.osc('triangle', f * 3, t, t + 0.08).connect(e2); e2.connect(p);
    e.connect(p); this.out(p, bus, 0.25);
  }
  bell(t, m, v = 0.15, dur = 1, pv = 0) {
    const f = hz(m);
    const car = this.osc('sine', f, t, t + dur + 0.05); const mod = this.osc('sine', f * 2.01, t, t + dur + 0.05);
    const mg = this.ctx.createGain(); mg.gain.setValueAtTime(f * 1.6, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + dur * 0.7);
    mod.connect(mg); mg.connect(car.frequency);
    const e = this.env(t, { a: 0.002, peak: v, d: dur }); const p = this.pan(pv);
    car.connect(e); e.connect(p); this.out(p, this.sfx, 0.3);
  }
  kick(t, v = 0.9) {
    const o = this.osc('sine', 150, t, t + 0.45); o.frequency.exponentialRampToValueAtTime(44, t + 0.12);
    const e = this.env(t, { a: 0.002, peak: v, d: 0.38 }); o.connect(e); e.connect(this.master);
    this.kicks.push(t); if (this.kicks.length > 32) this.kicks.shift();
  }
  drum(t, v = 0.8, m = 45) { // 大鼓
    const o = this.osc('sine', hz(m + 10), t, t + 0.6); o.frequency.exponentialRampToValueAtTime(hz(m), t + 0.1);
    const e = this.env(t, { a: 0.002, peak: v, d: 0.5 }); o.connect(e); this.out(e, this.master, 0.2);
    const n = this.noise(t, t + 0.1); const bp = this.filter('bandpass', 700, 0.8); const ne = this.env(t, { a: 0.001, peak: v * 0.3, d: 0.07 });
    n.connect(bp); bp.connect(ne); ne.connect(this.master);
  }
  snare(t, v = 0.5) {
    const n = this.noise(t, t + 0.2); const bp = this.filter('bandpass', 2000, 0.7); const e = this.env(t, { a: 0.001, peak: v, d: 0.13 });
    n.connect(bp); bp.connect(e); this.out(e, this.master, 0.15);
  }
  clap(t, v = 0.6) {
    for (let i = 0; i < 3; i++) { const tt = t + i * 0.012; const n = this.noise(tt, tt + 0.2); const bp = this.filter('bandpass', 1300, 1); const e = this.env(tt, { a: 0.001, peak: v * (i === 2 ? 0.8 : 0.4), d: i === 2 ? 0.16 : 0.025 }); n.connect(bp); bp.connect(e); this.out(e, this.master, 0.25); }
  }
  hat(t, v = 0.15, open = false) {
    const n = this.noise(t, t + (open ? 0.3 : 0.06)); const hp = this.filter('highpass', open ? 7000 : 8500); const e = this.env(t, { a: 0.001, peak: v, d: open ? 0.22 : 0.03 });
    n.connect(hp); hp.connect(e); e.connect(this.master);
  }
  shaker(t, v = 0.05) { const n = this.noise(t, t + 0.07); const bp = this.filter('bandpass', 6000, 1.5); const e = this.env(t, { a: 0.01, peak: v, d: 0.05 }); n.connect(bp); bp.connect(e); e.connect(this.master); }
  crash(t, v = 0.3) { const n = this.noise(t, t + 1.8); const hp = this.filter('highpass', 4000); const e = this.env(t, { a: 0.002, peak: v, d: 1.6 }); n.connect(hp); hp.connect(e); this.out(e, this.master, 0.3); }
  gongAt(t, v = 0.5, m = 43) {
    for (const [mul, g] of [[1, 1], [2.4, 0.5], [3.9, 0.3]]) { const o = this.osc('sine', hz(m) * mul, t, t + 3); o.frequency.exponentialRampToValueAtTime(hz(m) * mul * 0.985, t + 2.5); const e = this.env(t, { a: 0.01, peak: v * g, d: 2.6 }); o.connect(e); this.out(e, this.sfx, 0.4); }
    const n = this.noise(t, t + 1.2); const bp = this.filter('bandpass', 500, 0.6); const ne = this.env(t, { a: 0.005, peak: v * 0.4, d: 1 }); n.connect(bp); bp.connect(ne); this.out(ne, this.sfx, 0.4);
  }
  bass(t, m, dur = 0.25, v = 0.4) {
    const f = hz(m); const lp = this.filter('lowpass', 300, 5);
    lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(900, t + 0.02); lp.frequency.exponentialRampToValueAtTime(250, t + dur);
    const e = this.env(t, { a: 0.004, peak: v, d: dur, sus: 0.6, hold: dur * 0.5, r: 0.08 });
    this.osc('sawtooth', f, t, t + dur + 0.15).connect(lp); this.osc('sine', f / 2, t, t + dur + 0.15).connect(lp);
    lp.connect(e); e.connect(this.musicBus);
  }
  pad(t, notes, dur = 2, v = 0.06, bright = 900) {
    const e = this.env(t, { a: 0.3, peak: v, d: 0.4, sus: 0.85, hold: dur, r: 0.5 }); const lp = this.filter('lowpass', bright, 0.7);
    lp.connect(e); this.out(e, this.musicBus, 0.5);
    for (const m of notes) for (const dt of [-7, 7]) { const o = this.osc('sawtooth', hz(m), t, t + dur + 1); o.detune.value = dt; o.connect(lp); }
  }
  arp(t, m, v = 0.05) {
    const lp = this.filter('lowpass', 3500, 2); lp.frequency.setValueAtTime(3500, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.12);
    const e = this.env(t, { a: 0.002, peak: v, d: 0.14 }); const p = this.pan(Math.sin(m * 1.3) * 0.5);
    this.osc('square', hz(m), t, t + 0.2).connect(lp); lp.connect(e); e.connect(p); this.out(p, this.musicBus, 0.15);
  }
  stab(t, notes, v = 0.07, dur = 0.18) {
    const lp = this.filter('lowpass', 4500, 1); lp.frequency.setValueAtTime(4500, t); lp.frequency.exponentialRampToValueAtTime(900, t + dur);
    const e = this.env(t, { a: 0.003, peak: v, d: dur }); lp.connect(e); this.out(e, this.musicBus, 0.3);
    for (const m of notes) for (const dt of [-10, 0, 10]) { const o = this.osc('sawtooth', hz(m), t, t + dur + 0.2); o.detune.value = dt; o.connect(lp); }
  }
  flute(t, m, dur = 0.3, v = 0.09) { // 笛子-like lead: sine + breath noise + vibrato
    const f = hz(m);
    const o = this.osc('sine', f, t, t + dur + 0.25); const o2 = this.osc('triangle', f * 2, t, t + dur + 0.25);
    const lfo = this.osc('sine', 5.5, t, t + dur + 0.25); const lg = this.ctx.createGain(); lg.gain.value = 12; lfo.connect(lg); lg.connect(o.detune); lg.connect(o2.detune);
    const e = this.env(t, { a: 0.025, peak: v, d: 0.1, sus: 0.8, hold: dur, r: 0.14 });
    const g2 = this.ctx.createGain(); g2.gain.value = 0.18; o2.connect(g2); g2.connect(e); o.connect(e);
    const n = this.noise(t, t + dur + 0.2); const bp = this.filter('bandpass', f * 2, 4); const ng = this.ctx.createGain(); ng.gain.value = 0.2; n.connect(bp); bp.connect(ng); ng.connect(e);
    this.out(e, this.musicBus, 0.4);
  }
  blip(t, m, v = 0.12) {
    const f = hz(m); const o = this.osc('triangle', f * 1.02, t, t + 0.13); o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    const e = this.env(t, { a: 0.001, peak: v, d: 0.1 }); o.connect(e); this.out(e, this.sfx, 0.1);
  }
  pop(t, v = 0.12, f = 500) { const o = this.osc('sine', f, t, t + 0.1); o.frequency.exponentialRampToValueAtTime(f * 2.3, t + 0.05); const e = this.env(t, { a: 0.001, peak: v, d: 0.07 }); o.connect(e); e.connect(this.sfx); }
  thud(t, v = 0.16) { const o = this.osc('sine', 220, t, t + 0.12); o.frequency.exponentialRampToValueAtTime(95, t + 0.08); const e = this.env(t, { a: 0.001, peak: v, d: 0.09 }); o.connect(e); e.connect(this.sfx); }
  boing(t, v = 0.25) {
    const o = this.osc('sine', 330, t, t + 0.55); o.frequency.exponentialRampToValueAtTime(150, t + 0.45);
    const lfo = this.osc('sine', 15, t, t + 0.55); const lg = this.ctx.createGain(); lg.gain.setValueAtTime(80, t); lg.gain.exponentialRampToValueAtTime(6, t + 0.45); lfo.connect(lg); lg.connect(o.frequency);
    const e = this.env(t, { a: 0.003, peak: v, d: 0.5 }); o.connect(e); this.out(e, this.sfx, 0.2);
  }
  coin(t, m = 84, v = 0.07) {
    for (const [dt, mm] of [[0, m], [0.07, m + 5]]) { const e = this.env(t + dt, { a: 0.001, peak: v, d: dt ? 0.3 : 0.07 }); this.osc('square', hz(mm), t + dt, t + dt + (dt ? 0.32 : 0.08)).connect(e); this.out(e, this.sfx, 0.15); }
  }
  whooshAt(t, v = 0.2, up = true, dur = 0.3) {
    const n = this.noise(t, t + dur + 0.05); const bp = this.filter('bandpass', up ? 500 : 4000, 1.6); bp.frequency.exponentialRampToValueAtTime(up ? 4500 : 400, t + dur);
    const e = this.env(t, { a: dur * 0.6, peak: v, d: dur * 0.4 }); n.connect(bp); bp.connect(e); this.out(e, this.sfx, 0.2);
  }
  impact(t, v = 0.8) {
    const o = this.osc('sine', 90, t, t + 1.3); o.frequency.exponentialRampToValueAtTime(30, t + 1.1);
    const e = this.env(t, { a: 0.003, peak: v, d: 1.2 }); o.connect(e); e.connect(this.master);
    const n = this.noise(t, t + 0.8); const lp = this.filter('lowpass', 1200); lp.frequency.exponentialRampToValueAtTime(150, t + 0.7); const ne = this.env(t, { peak: v * 0.5, d: 0.7 }); n.connect(lp); lp.connect(ne); this.out(ne, this.master, 0.4);
  }
  duckMusic(t, depth = 0.3, dur = 0.3) { const p = this.duck.gain; p.cancelScheduledValues(t); p.setValueAtTime(depth, t); p.setTargetAtTime(1, t + 0.02, dur / 3); }

  // ---------------------------------------------------------------- music
  setLevel(level, bpm, key) { this.level = level; if (bpm) this.bpm = bpm; if (key !== undefined) this.key = key; }
  get stepDur() { return 60 / Math.min(240, Math.max(40, this.bpm * SPEED)) / 4; }
  startMusic() { if (this.playing) return; this.playing = true; this.step = 0; this.nextTime = this.now() + 0.08; }
  stopMusic() { this.playing = false; }
  musicGain(v, ramp = 0.3) { if (this.musicBus) this.musicBus.gain.setTargetAtTime(v, this.now(), ramp / 3); }

  update() {
    if (!this.playing || !this.ok) return;
    const t0 = this.now();
    if (this.nextTime < t0 - 0.2) this.nextTime = t0 + 0.02;
    while (this.nextTime < t0 + 0.12) { this.schedule(this.step, this.nextTime); this.nextTime += this.stepDur; this.step += 1; }
  }

  schedule(step, t) {
    const s = step % 16; const bar = Math.floor(step / 16) % 4; const L = this.level; const k = this.key;
    const ch = PROG[bar]; const sd = this.stepDur;
    if (s === 0) this.pad(t, ch.tones.map((m) => m + k), sd * 15, 0.035 + 0.025 * Math.min(1, L / 8), 700 + 220 * Math.min(L, 10));
    if (s % 2 === 0 && L <= 8) { const i = [0, 1, 2, 1, 0, 2, 1, 2][(s / 2) % 8]; this.pluck(t, ch.tones[i] + 12 + k, 0.14 * (1 - L / 11), 0.4, i % 2 ? 0.3 : -0.3); }
    this.shaker(t, (s % 2 ? 0.045 : 0.025) * (0.5 + L / 10));
    const kick = (L >= 3 && s % 4 === 0) || (L >= 1 && (s === 0 || s === 8));
    if (kick) { this.kick(t, L < 3 ? 0.6 : 0.9); if (L >= 6) this.duckMusic(t, 0.55, sd * 3); }
    if (L >= 2) { if (L >= 7 && s % 2 === 0) this.bass(t, ch.bass + k + (s % 4 ? 12 : 0), sd * 1.6, 0.36); else if (L < 7 && s % 4 === 0) this.bass(t, ch.bass + k, sd * 3, 0.4); }
    if (L >= 3 && (s === 4 || s === 12)) this.clap(t, 0.55);
    if (L >= 4 && s % 4 === 2) this.hat(t, 0.16, L >= 7);
    if (L >= 6 && s % 2 === 1) this.hat(t, 0.06);
    if (L >= 5) { const i = [0, 1, 2, 3, 2, 1, 2, 3][s % 8]; const m = i === 3 ? ch.tones[0] + 12 : ch.tones[i]; this.arp(t, m + 12 + (L >= 8 && s >= 8 ? 12 : 0) + k, 0.045); }
    if (L >= 6 && s % 4 === 2) this.stab(t, ch.tones.map((m) => m + 12 + k), 0.055);
    if (L >= 8 && s % 2 === 0) { const m = MELODY[bar][s / 2]; if (m) this.flute(t, m + k, sd * 1.7, 0.085); }
    if (L >= 9 && s % 4 === 0) { const m = COUNTER[bar][s / 4]; if (m) this.bell(t, m + k, 0.05, 0.8, 0.4); }
    if (L >= 9 && s === 0 && bar === 0) this.crash(t, 0.22);
    if (L >= 10 && (s === 14 || s === 15)) this.drum(t, 0.45 + (s - 14) * 0.2, 45);
    if (L >= 11 && s % 4 === 3) this.drum(t, 0.3, 50);
    if (L >= 5 && bar === 3 && s >= 12) this.snare(t, 0.15 + (s - 12) * 0.08);
  }

  // Kick pulse for visuals (0..1).
  pulse() { const t = this.now(); for (let i = this.kicks.length - 1; i >= 0; i--) if (this.kicks[i] <= t) return Math.exp(-(t - this.kicks[i]) * 9); return 0; }

  // ---------------------------------------------------------------- effects
  run(fn) { if (!this.ok) return; try { fn(this.now()); } catch (e) { /* ignore */ } }
  tone(combo) { const c = Math.max(0, combo); return Math.min(98, 72 + PENT[c % 5] + 12 * Math.floor(c / 5) + this.key); }
  keyTap(combo) { this.run((t) => this.blip(t, Math.min(100, this.tone(combo) + 12), 0.1)); }
  grab() { this.run((t) => this.pop(t, 0.08, 460 + Math.random() * 120)); }
  place() { this.run((t) => this.thud(t, 0.13)); }
  erase() { this.run((t) => this.whooshAt(t, 0.14, false, 0.16)); }
  correct(combo, E) {
    this.run((t) => {
      const m = this.tone(combo) + 12;
      this.bell(t, m, 0.12 + 0.06 * E, 0.8);
      if (E > 0.35) this.bell(t + 0.05, m + 7, 0.07 + 0.04 * E, 0.7, 0.3);
      if (E > 0.6) this.coin(t + 0.02, 84 + this.key, 0.035 + 0.03 * E);
    });
  }
  clear(E) {
    this.run((t) => {
      const root = 60 + this.key;
      const arp = [0, 4, 7, 12, 16, 19, 24];
      const n = 3 + Math.round(Math.min(1, E) * 4);
      for (let i = 0; i < n; i++) this.bell(t + i * 0.05, root + 12 + arp[i], 0.1 + 0.05 * E, 1.1, i % 2 ? 0.4 : -0.4);
      if (E > 0.25) this.stab(t, [root, root + 4, root + 7, root + 12].map((m) => m + 12), 0.06 + 0.06 * E, 0.3);
      if (E > 0.4) { this.crash(t, 0.18 + 0.2 * E); this.kick(t, 0.8); }
      if (E > 0.7) { this.impact(t, 0.4 + 0.3 * E); for (let i = 0; i < 6; i++) this.coin(t + 0.1 + i * 0.05, 79 + (i % 3) * 5 + this.key, 0.04); }
    });
  }
  wrong() { this.run((t) => { this.boing(t, 0.24); this.duckMusic(t, 0.35, 0.35); }); }
  comboUp(n) { this.run((t) => { const b = this.tone(n) + 12; [0, 4, 7].forEach((d, i) => this.bell(t + i * 0.06, b + d, 0.09, 0.7)); }); }
  comboEnd() { this.run((t) => this.blip(t, 64 + this.key, 0.06)); }
  milestone() { this.run((t) => { this.bell(t, 84 + this.key, 0.16, 1.3); this.bell(t + 0.1, 91 + this.key, 0.14, 1.4); for (let i = 0; i < 5; i++) this.coin(t + 0.05 + i * 0.06, 84 + i * 2 + this.key, 0.04); }); }
  whoosh() { this.run((t) => this.whooshAt(t, 0.18, true, 0.28)); }
  land() { this.run((t) => this.thud(t, 0.14)); }
  jingle() { this.run((t) => { [72, 74, 76, 79, 81, 84].forEach((m, i) => this.pluck(t + i * 0.07, m, 0.2, 0.5, 0, this.sfx)); this.bell(t + 0.45, 96, 0.1, 1.2); }); }
  gong() { this.run((t) => { this.gongAt(t, 0.45); this.impact(t, 0.6); }); }
  tick(last) { this.run((t) => this.blip(t, last ? 96 : 84, 0.12)); }
  // ---------------------------------------------------------------- M2: 爽感 effects
  // Combo 叮: every correct digit climbs one step of the major scale; past the top it starts the
  // scale again one octave higher (three octaves, then round again).
  dingNote(combo) { const c = Math.max(0, combo - 1); return 72 + MAJOR[c % 7] + 12 * (Math.floor(c / 7) % 3) + this.key; }
  // style: the equipped 连击音色 (or the 锣鼓 perk). v grows with the show intensity.
  ding(combo, style = 'snd-ding', v = 0.12) {
    this.run((t) => {
      const m = this.dingNote(combo);
      if (style === 'snd-marimba') {
        const f = hz(m - 12); const e = this.env(t, { a: 0.001, peak: v * 1.3, d: 0.35 });
        this.osc('sine', f, t, t + 0.4).connect(e); const e2 = this.env(t, { a: 0.001, peak: v * 0.5, d: 0.05 }); this.osc('sine', f * 4, t, t + 0.06).connect(e2); e2.connect(e);
        this.out(e, this.sfx, 0.2);
      } else if (style === 'snd-gong') {
        // 锣鼓: a small drum on every digit and a little gong that still climbs with the combo.
        this.drum(t, v * 3, 47 + (combo % 2) * 5);
        for (const [mul, g] of [[1, 1], [1.48, 0.45], [2.3, 0.3]]) { const o = this.osc('sine', hz(m - 12) * mul, t, t + 0.6); o.frequency.exponentialRampToValueAtTime(hz(m - 12) * mul * 0.97, t + 0.5); const e = this.env(t, { a: 0.004, peak: v * g * 1.1, d: 0.5 }); o.connect(e); this.out(e, this.sfx, 0.3); }
      } else if (style === 'snd-musicbox') {
        const f = hz(m + 12); const e = this.env(t, { a: 0.001, peak: v, d: 0.9 });
        this.osc('sine', f, t, t + 1).connect(e); const e2 = this.env(t, { a: 0.001, peak: v * 0.35, d: 0.4 }); this.osc('sine', f * 3.01, t, t + 0.45).connect(e2); e2.connect(e);
        const n = this.noise(t, t + 0.02); const hp = this.filter('highpass', 6000); const ne = this.env(t, { a: 0.0005, peak: v * 0.4, d: 0.01 }); n.connect(hp); hp.connect(ne); ne.connect(e);
        this.out(e, this.sfx, 0.35);
      } else this.bell(t, m, v, 0.55);
    });
  }
  // Slot reels.
  reelTick() { this.run((t) => { const e = this.env(t, { a: 0.0005, peak: 0.035, d: 0.012 }); this.osc('square', 2400 + Math.random() * 300, t, t + 0.02).connect(e); e.connect(this.sfx); }); }
  reelStop(i = 0) {
    this.run((t) => {
      const n = this.noise(t, t + 0.05); const bp = this.filter('bandpass', 2600, 2); const e = this.env(t, { a: 0.0005, peak: 0.12, d: 0.03 }); n.connect(bp); bp.connect(e); e.connect(this.sfx);
      const o = this.osc('sine', 1300 + i * 90, t, t + 0.06); o.frequency.exponentialRampToValueAtTime(700, t + 0.05); const e2 = this.env(t, { a: 0.0005, peak: 0.06, d: 0.04 }); o.connect(e2); e2.connect(this.sfx);
    });
  }
  // 甜度 reaches 100 / 1000 / 1万 ...: the reel locks and pays out.
  jackpot(level = 2) {
    this.run((t) => {
      const b = 72 + this.key; const big = Math.min(1, (level - 2) / 4);
      this.impact(t, 0.35 + 0.3 * big); this.crash(t, 0.22 + 0.15 * big);
      [0, 4, 7, 12, 16, 19, 24].forEach((d, i) => this.bell(t + i * 0.045, b + 12 + d, 0.09, 1.1, i % 2 ? 0.4 : -0.4));
      for (let i = 0; i < 10 + 6 * big; i++) this.coin(t + 0.12 + i * 0.045, 79 + (i % 4) * 3 + this.key, 0.04);
    });
  }
  // 连击倍率 reel moves up a step.
  multUp(tier) { this.run((t) => { [0, 4, 7, 12].forEach((d, i) => this.blip(t + i * 0.05, 79 + tier * 2 + d + this.key, 0.09)); this.whooshAt(t, 0.1, true, 0.2); }); }
  // Experience gems: consecutive pickups climb (reset after a short gap by the caller).
  gem(n = 0) { this.run((t) => { const m = Math.min(108, 84 + (n % 16) + this.key); const e = this.env(t, { a: 0.001, peak: 0.055, d: 0.09 }); this.osc('triangle', hz(m), t, t + 0.1).connect(e); const e2 = this.env(t + 0.03, { a: 0.001, peak: 0.03, d: 0.1 }); this.osc('sine', hz(m + 12), t + 0.03, t + 0.14).connect(e2); e.connect(this.sfx); e2.connect(this.sfx); }); }
  magnet() {
    this.run((t) => {
      const o = this.osc('sawtooth', 110, t, t + 0.5); o.frequency.exponentialRampToValueAtTime(330, t + 0.45); const lp = this.filter('lowpass', 600, 6); lp.frequency.exponentialRampToValueAtTime(2400, t + 0.45);
      const e = this.env(t, { a: 0.05, peak: 0.07, d: 0.4 }); o.connect(lp); lp.connect(e); this.out(e, this.sfx, 0.2);
      this.whooshAt(t, 0.16, true, 0.45);
    });
  }
  // 观众合成: a soft suck, a pop and a chord (lower and fuller for bigger merges).
  merge(lv = 1) {
    this.run((t) => {
      this.whooshAt(t, 0.12, true, 0.18);
      const o = this.osc('sine', 700, t + 0.16, t + 0.4); o.frequency.exponentialRampToValueAtTime(160, t + 0.34); const e = this.env(t + 0.16, { a: 0.002, peak: 0.2, d: 0.2 }); o.connect(e); e.connect(this.sfx);
      const b = 84 - 5 * lv + this.key;
      [0, 4, 7, 12].slice(0, 2 + lv).forEach((d, i) => this.bell(t + 0.2 + i * 0.04, b + d, 0.1, 0.9 + 0.2 * lv, i % 2 ? 0.3 : -0.3));
      if (lv >= 2) { this.crash(t + 0.2, 0.12 * lv); this.kick(t + 0.2, 0.6); }
      if (lv >= 3) { this.gongAt(t + 0.22, 0.25, 50 + this.key); for (let i = 0; i < 8; i++) this.coin(t + 0.3 + i * 0.05, 84 + (i % 3) * 4 + this.key, 0.035); }
    });
  }
  levelUp() {
    this.run((t) => {
      const b = 72 + this.key;
      [0, 4, 7, 12, 16, 19, 24].forEach((d, i) => this.pluck(t + i * 0.055, b + d, 0.2, 0.5, i % 2 ? 0.3 : -0.3, this.sfx));
      this.stab(t + 0.38, [b + 12, b + 16, b + 19, b + 24], 0.1, 0.5);
      this.crash(t + 0.38, 0.25); this.kick(t + 0.38, 0.8);
      this.bell(t + 0.4, b + 24, 0.12, 1.4);
    });
  }
  pick() { this.run((t) => { this.coin(t, 88 + this.key, 0.06); this.bell(t + 0.04, 91 + this.key, 0.1, 0.8); this.whooshAt(t, 0.12, true, 0.2); }); }
  // 蒸笼: the lid rattles, each tier step rings a little higher and fuller, the reveal pays out.
  chestShake(k = 0.5) {
    this.run((t) => {
      for (let i = 0; i < 3; i++) { const tt = t + i * 0.045; const n = this.noise(tt, tt + 0.05); const bp = this.filter('bandpass', 850 + Math.random() * 300, 3); const e = this.env(tt, { a: 0.001, peak: 0.06 + 0.06 * k, d: 0.035 }); n.connect(bp); bp.connect(e); e.connect(this.sfx); }
      this.thud(t, 0.06 + 0.06 * k);
    });
  }
  chestStep(tier) {
    this.run((t) => {
      const b = 67 + tier * 3 + this.key;
      [0, 4, 7].forEach((d, i) => this.bell(t + i * 0.03, b + d + 12, 0.07 + 0.015 * tier, 0.8, i - 1));
      this.whooshAt(t, 0.1 + 0.03 * tier, true, 0.35);
      if (tier >= 2) this.drum(t, 0.3 + 0.1 * tier, 45);
    });
  }
  // 听牌 (the last digit): the music is muffled and a riser climbs until the digit is typed or
  // the moment is over; off opens the filter again at once.
  setReach(on) {
    if (on === !!this.reach) return;
    this.reach = on;
    if (!this.ok || !this.reachLP) return;
    try { this.applyReach(on); } catch (e) { /* sound only: never let it stop the game */ }
  }
  applyReach(on) {
    const t = this.now(); const f = this.reachLP.frequency; const q = this.reachLP.Q;
    f.cancelScheduledValues(t); f.setValueAtTime(Math.max(40, f.value), t); q.cancelScheduledValues(t);
    if (on) {
      f.exponentialRampToValueAtTime(850, t + 0.35); q.setTargetAtTime(4, t, 0.1);
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(880, t + 3.2);
      const lp = this.filter('lowpass', 600, 5); lp.frequency.exponentialRampToValueAtTime(3200, t + 3.2);
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.045, t + 2.6);
      g.gain.setTargetAtTime(0.0001, t + 4.5, 0.8); // a long think: the riser fades away by itself
      o.connect(lp); lp.connect(g); this.out(g, this.sfx, 0.25); o.start(t);
      this.riser = { o, g };
      this.whooshAt(t, 0.16, true, 0.4);
    } else {
      f.exponentialRampToValueAtTime(20000, t + 0.08); q.setTargetAtTime(0.7, t, 0.03);
      // The riser runs until here (it is stopped only once, so a long wait never breaks this).
      const r = this.riser; this.riser = null;
      if (r) { try { r.g.gain.cancelScheduledValues(t); r.g.gain.setTargetAtTime(0.0001, t, 0.03); r.o.stop(t + 0.2); } catch (e) { /* already stopped */ } }
    }
  }
  // The last digit landed after 听牌: a bigger hit on top of the usual clear.
  reachHit() {
    this.run((t) => {
      const root = 60 + this.key;
      this.impact(t, 0.6); this.crash(t, 0.35); this.kick(t, 0.9);
      this.stab(t, [root, root + 4, root + 7, root + 12, root + 16].map((m) => m + 12), 0.12, 0.5);
    });
  }
  // Charge-up: a sawtooth riser through an opening filter, a rising noise swell and a snare roll
  // that speeds up; all of it ends at dur (seconds).
  chestCharge(dur = 1) {
    this.run((t) => {
      const o = this.osc('sawtooth', 110, t, t + dur + 0.05); o.frequency.exponentialRampToValueAtTime(880, t + dur);
      const o2 = this.osc('square', 165, t, t + dur + 0.05); o2.frequency.exponentialRampToValueAtTime(1320, t + dur);
      const lp = this.filter('lowpass', 400, 6); lp.frequency.exponentialRampToValueAtTime(5200, t + dur);
      const e = this.ctx.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.07, t + dur * 0.9); e.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
      const g2 = this.ctx.createGain(); g2.gain.value = 0.35; o2.connect(g2); g2.connect(lp);
      o.connect(lp); lp.connect(e); this.out(e, this.sfx, 0.2);
      this.whooshAt(t, 0.2, true, dur);
      let x = 0; let gap = 0.14;
      while (x < dur - 0.02) { this.snare(t + x, 0.06 + 0.2 * (x / dur)); x += gap; gap = Math.max(0.035, gap * 0.82); }
    });
  }
  // The lid blows off: a deep hit, a crash, a downward whoosh and a bright chord (bigger by tier).
  chestBurst(tier = 0) {
    this.run((t) => {
      const b = 60 + this.key;
      this.impact(t, 0.7 + 0.08 * tier); this.crash(t, 0.3 + 0.06 * tier); this.kick(t, 0.9);
      this.whooshAt(t, 0.2, false, 0.5);
      this.stab(t, [b + 12, b + 16, b + 19, b + 24], 0.1 + 0.02 * tier, 0.5);
      if (tier >= 3) this.gongAt(t + 0.02, 0.3, 48 + this.key);
      this.duckMusic(t, 0.3, 0.8);
    });
  }
  // The steamer pours out: a stream of coin clinks that climb, with a few bells on top.
  gush(dur = 1.2, tier = 0) {
    this.run((t) => {
      const n = Math.round(dur * (14 + 3 * tier));
      for (let i = 0; i < n; i++) this.coin(t + (i / n) * dur + Math.random() * 0.02, 79 + ((i * 5) % 17) + Math.floor((i / n) * 7) + this.key, 0.028);
      [0, 4, 7, 12, 16].slice(0, 2 + Math.min(3, tier)).forEach((d, i) => this.bell(t + 0.1 + i * dur * 0.18, 84 + d + this.key, 0.07, 0.9, i % 2 ? 0.4 : -0.4));
    });
  }
  chestReveal(tier) {
    this.run((t) => {
      const b = 60 + this.key;
      this.impact(t, 0.5 + 0.1 * tier); this.crash(t, 0.25 + 0.06 * tier);
      if (tier >= 3) this.gongAt(t, 0.3, 48 + this.key);
      this.pad(t, [b + 12, b + 16, b + 19, b + 24], 1.6 + 0.3 * tier, 0.05 + 0.015 * tier, 1600 + 400 * tier);
      [0, 4, 7, 12, 16, 19, 24, 28].slice(0, 4 + tier).forEach((d, i) => this.bell(t + 0.05 + i * 0.05, b + 24 + d, 0.09, 1.2, i % 2 ? 0.5 : -0.5));
      for (let i = 0; i < 6 + 4 * tier; i++) this.coin(t + 0.15 + i * 0.04, 79 + (i % 4) * 4 + this.key, 0.035);
    });
  }
  finale() {
    this.run((t) => {
      const root = 60 + this.key;
      this.impact(t, 1); this.crash(t, 0.5); this.gongAt(t + 0.05, 0.35, 48 + this.key);
      this.pad(t, [root + 12, root + 16, root + 19, root + 24], 2.4, 0.09, 2600);
      [0, 4, 7, 12, 16, 19, 24, 28, 31].forEach((d, i) => this.bell(t + 0.15 + i * 0.06, root + 24 + d, 0.08, 1.3, i % 2 ? 0.5 : -0.5));
      for (let i = 0; i < 12; i++) this.coin(t + 0.3 + i * 0.05, 79 + (i % 4) * 4 + this.key, 0.035);
      for (let i = 0; i < 4; i++) this.drum(t + 0.6 + i * 0.16, 0.6, 43);
    });
  }
}
