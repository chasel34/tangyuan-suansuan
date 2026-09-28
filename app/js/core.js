// Virtual clock, tweens and small helpers (browser only).
// Every animation, wait and game timer runs on virtual time so ?speed=0.2 slows the whole
// show and the clocks together (and ?speed=3 speeds them up).

export const params = new URLSearchParams(location.search);
export const SPEED = Math.min(10, Math.max(0.05, Number(params.get('speed')) || 1));
document.documentElement.style.setProperty('--spd', String(SPEED));

// Viewport size, cached: reading innerWidth/innerHeight inside the frame loop can force a layout
// (mobile viewport), so hot paths use VP.w / VP.h, refreshed on resize.
export const VP = { w: innerWidth, h: innerHeight, dpr: window.devicePixelRatio || 1 };
addEventListener('resize', () => { VP.w = innerWidth; VP.h = innerHeight; VP.dpr = window.devicePixelRatio || 1; });

const tasks = new Set();
let vt = 0;
let paused = false;
const FREEZE_AT = params.has('freezeAt') ? Number(params.get('freezeAt')) : null;
let frozeOnce = false;
// Debug: freeze virtual time (animations, timers and tweens stop; the page keeps rendering).
export function setPaused(p) { paused = !!p; }
export const isPaused = () => paused;
let lastReal = performance.now();
let lastTick = 0;

export const now = () => vt;

// Game clock (用时 and the extra-round countdown). It follows virtual time, with two differences:
// it keeps running through a hit-stop (a show effect must not add time to the extra round), and
// it can be held on its own while the level-up / 三选一 overlay is open (animations keep going).
// An explicit pause (the "回到首页？" dialog, debug freeze) stops both.
let gameT = 0;
let clockHeld = false;
let stopUntil = 0;
export const gameNow = () => gameT;
export function holdClock(on) { clockHeld = !!on; }
export const clockIsHeld = () => clockHeld;
// Hit-stop (顿帧): animation time stands still for ms (scaled by ?speed like everything else).
export function hitStop(ms) { if (ms > 0) stopUntil = Math.max(stopUntil, performance.now() + ms / SPEED); }
export const inHitStop = () => performance.now() < stopUntil;

export function onFrame(fn) { tasks.add(fn); return () => tasks.delete(fn); }

function step(real) {
  const t0 = performance.now();
  const dtReal = Math.min(60, Math.max(0, real - lastReal));
  lastReal = real;
  lastTick = real;
  let run = paused ? 0 : dtReal * SPEED;
  // ?freezeAt=<ms>: stop virtual time once, at that moment (screenshots of exact moments).
  if (FREEZE_AT !== null && !frozeOnce && vt + run >= FREEZE_AT) { run = Math.max(0, FREEZE_AT - vt); paused = true; frozeOnce = true; }
  const dt = real < stopUntil ? 0 : run;
  vt += dt;
  if (!clockHeld) gameT += run;
  for (const fn of [...tasks]) {
    try { fn(dt / 1000, vt); } catch (e) { console.error(e); tasks.delete(fn); }
  }
  FRAMES[frI] = dtReal; WORK[frI] = performance.now() - t0; frI = (frI + 1) % FRAMES.length; frN = Math.min(frN + 1, FRAMES.length);
}

// Frame statistics (?fps overlay and the adaptive quality): the last ~2 s of frames.
const FRAMES = new Float32Array(120); const WORK = new Float32Array(120);
let frI = 0; let frN = 0;
const p95 = (arr, n) => { const a = Array.from(arr.slice(0, n)).sort((x, y) => x - y); return a[Math.min(n - 1, Math.floor(n * 0.95))] || 0; };
export function frameStats() {
  if (!frN) return { fps: 0, p95: 0, workP95: 0, n: 0 };
  let sum = 0; for (let i = 0; i < frN; i++) sum += FRAMES[i];
  return { fps: (1000 * frN) / Math.max(1, sum), p95: p95(FRAMES, frN), workP95: p95(WORK, frN), n: frN };
}
export function resetFrameStats() { frN = 0; frI = 0; }
function loop(real) { step(real); requestAnimationFrame(loop); }
requestAnimationFrame((t) => { lastReal = t; requestAnimationFrame(loop); });
// Background tabs pause requestAnimationFrame; keep the game (and ?demo) moving anyway.
setInterval(() => { const t = performance.now(); if (t - lastTick > 120) step(t); }, 100);

export function wait(ms) {
  return new Promise((resolve) => {
    const end = vt + ms;
    const off = onFrame((dt, t) => { if (t >= end) { off(); resolve(); } });
  });
}

// setTimeout on virtual time; returns a cancel function.
export function later(ms, fn) {
  const end = vt + ms;
  const off = onFrame((dt, t) => { if (t >= end) { off(); fn(); } });
  return off;
}

export function tween(ms, fn, ease = easeOutCubic) {
  return new Promise((resolve) => {
    const t0 = vt;
    fn(ease(0), 0);
    const off = onFrame((dt, t) => {
      const k = ms <= 0 ? 1 : Math.min(1, (t - t0) / ms);
      fn(ease(k), k);
      if (k >= 1) { off(); resolve(); }
    });
  });
}

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (a, b, v) => { const k = clamp((v - a) / (b - a)); return k * k * (3 - 2 * k); };
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const chance = (p) => Math.random() < p;

export const easeLinear = (k) => k;
export const easeOutCubic = (k) => 1 - (1 - k) ** 3;
export const easeInCubic = (k) => k * k * k;
export const easeInOutCubic = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
export const easeOutBack = (k, s = 1.8) => 1 + (s + 1) * (k - 1) ** 3 + s * (k - 1) ** 2;
export const easeInBack = (k, s = 1.7) => (s + 1) * k * k * k - s * k * k;

export class Spring {
  constructor(value = 0, stiffness = 300, damping = 15) { this.value = value; this.target = value; this.v = 0; this.k = stiffness; this.d = damping; }
  kick(v) { this.v += v; }
  step(dt) {
    const n = Math.max(1, Math.ceil(dt / (1 / 120))); const h = dt / n;
    for (let i = 0; i < n; i++) { const a = (this.target - this.value) * this.k - this.v * this.d; this.v += a * h; this.value += this.v * h; }
    return this.value;
  }
}

export function centerOf(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}

// Hex colour helpers for palette interpolation.
export const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const mixRgb = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
export const rgbStr = (c) => `rgb(${c.map((v) => Math.round(v)).join(',')})`;
