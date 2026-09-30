// Canvas 2D particles: paper confetti, stars, hearts, sparks, twinkles, coins, jewels, mini 汤圆,
// rings and shock waves, fireworks, streamers, streaks, fountains, text.
// Two layers in the game: the back layer sits below the problem card and the keypad; the front
// layer sits above them but is clipped with holes where the card and the keypad are (setHoles), so
// no effect ever covers the problem or the keys (the finale drops the holes for its 2-3 s).
//
// Performance notes: shapes are drawn from small pre-rendered sprites (one drawImage each), text
// floats are rendered once into their own sprite, the particle count is capped by the quality tier,
// the backing store is capped for big desktop windows, and an empty canvas is not redrawn.
import { rand, pick, VP } from './core.js';
import { Q } from './quality.js';
import { GEMS, GEM_TRAIL } from './art.js';
import { FILLINGS, GOLD, PLAIN } from './tangyuan.js';
import { spriteVisible } from './visibility.js';

const PAPER = ['#FF782D', '#2455F5', '#FFD447', '#FFFFFF', '#7B4DFF', '#FF8FB1', '#3FD0A0'];
const STAR_COLORS = ['#FFD447', '#FFFFFF', '#FF8FB1', '#9FD8FF'];
const HEART_COLORS = ['#FF5A8A', '#FF8FB8', '#FF6B6B'];
const GLOW_COLORS = ['#FFF3A0', '#FFFFFF', '#9FF3FF', '#FFB3E6'];
const JEWELS = ['gem-sapphire', 'gem-amethyst', 'gem-star'];
const MINIS = [...FILLINGS, GOLD, PLAIN];
const INK = '#172754';
const BOUNDED = new Set(['confetti', 'star', 'heart', 'jewel', 'mini', 'twinkle', 'glow', 'coin', 'puff', 'shell']);
const MAX_PX = 2.4e6; // backing-store pixels (a 1440×900 window at 2x would be 5.2M)

const FONT = (size) => `900 ${size}px "PingFang SC","HarmonyOS Sans SC","Microsoft YaHei",sans-serif`;

export class FX {
  // opts.max: a function giving the particle cap (default: the quality tier's partCap).
  constructor(canvas, { max = null } = {}) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.parts = []; this.motion = 1;
    this.k = 1; this.sprites = new Map(); this.dirty = true;
    this.gemStyle = 'gem-sapphire'; this.rainbow = false;
    this.cap = max; this.holes = []; this.clipOn = true; this.emitters = [];
  }
  // Rectangles ({ l, t, r, b, rad } in CSS px) the layer never draws into. Measured by the caller
  // when the layout changes, never inside the frame loop.
  setHoles(list) { this.holes = list || []; }
  resize() {
    let k = Math.min(2, VP.dpr);
    const px = VP.w * VP.h * k * k;
    if (px > MAX_PX) k *= Math.sqrt(MAX_PX / px);
    const w = Math.round(VP.w * k); const h = Math.round(VP.h * k);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; this.sprites.clear(); this.dirty = true; }
    this.k = k;
  }
  get max() { return this.cap ? this.cap() : Q.p.partCap; }
  n(count) { return Math.max(this.motion > 0 ? 1 : 0, Math.round(count * (0.1 + 0.9 * this.motion) * (Q.tier >= 2 ? 0.6 : 1))); }
  // Over the cap the oldest decoration goes first; gems (they carry experience to the bar) stay.
  add(p) {
    const over = this.parts.length - this.max + 1;
    if (over > 0) {
      let drop = Math.max(8, over); let j = 0; const list = this.parts;
      for (let i = 0; i < list.length; i++) { if (drop > 0 && list[i].kind !== 'gem') { drop -= 1; continue; } list[j++] = list[i]; }
      list.length = j;
    }
    p.age = 0; this.parts.push(p); return p;
  }

  burst(x, y, { count = 20, speed = 420, kinds = ['confetti'], up = 0, spread = Math.PI * 2, angle = -Math.PI / 2, size = 1, life = 1, colors = PAPER, g = null } = {}) {
    for (let i = 0; i < this.n(count); i++) {
      const a = angle + (Math.random() - 0.5) * spread; const v = speed * rand(0.35, 1);
      this.spawn(pick(kinds), x, y, Math.cos(a) * v, Math.sin(a) * v - up, { size, life, colors, g });
    }
  }
  // One particle of a kind with its own gravity, drag, life and colour.
  spawn(kind, x, y, vx, vy, { size = 1, life = 1, colors = PAPER, g = null } = {}) {
    const p = { kind, x, y, vx, vy, rot: rand(0, 6.3), vr: rand(-10, 10), flip: rand(0, 6.3), vf: rand(6, 14), color: pick(colors), size: size * rand(0.7, 1.3), life: rand(1.3, 2.4) * life, g: 900, drag: 0.8 };
    switch (kind) {
      case 'spark': Object.assign(p, { life: rand(0.3, 0.6) * life, g: 250, drag: 2.4, color: pick(['#FFFFFF', '#FFF3A0', '#FFD447']) }); break;
      case 'star': Object.assign(p, { life: rand(0.8, 1.3) * life, g: 450, drag: 1.5, color: pick(STAR_COLORS) }); break;
      case 'heart': Object.assign(p, { life: rand(0.9, 1.4) * life, g: 380, drag: 1.6, color: pick(HEART_COLORS), vr: rand(-3, 3) }); break;
      case 'twinkle': Object.assign(p, { life: rand(0.5, 0.9) * life, g: 120, drag: 2.6, color: pick(GLOW_COLORS), vr: rand(-2, 2) }); break;
      case 'glow': Object.assign(p, { life: rand(0.45, 0.8) * life, g: 160, drag: 2.2, color: pick(GLOW_COLORS) }); break;
      case 'coin': Object.assign(p, { life: rand(1.3, 2) * life, g: 1300, drag: 0.4 }); break;
      case 'jewel': Object.assign(p, { life: rand(1.2, 1.9) * life, g: 1150, drag: 0.5, color: pick(JEWELS), vr: rand(-8, 8) }); break;
      case 'mini': Object.assign(p, { life: rand(1.3, 2) * life, g: 1000, drag: 0.5, color: Math.floor(Math.random() * MINIS.length), vr: rand(-5, 5) }); break;
      case 'streak': Object.assign(p, { life: rand(0.35, 0.6) * life, g: 0, drag: 3.2, w: rand(2.5, 5) * size }); break;
      default: break;
    }
    if (g !== null) p.g = g;
    return this.add(p);
  }
  ring(x, y, { color = '#FFD447', radius = 90, width = 7, life = 0.45, alpha = 1, delay = 0 } = {}) { if (this.motion > 0) this.add({ kind: 'ring', x, y, vx: 0, vy: 0, g: 0, drag: 0, color, radius, width, life: life + delay, t0: delay, alpha }); }
  // Shock wave in three layers: wide and faint, medium, thin and bright.
  shock(x, y, { color = '#FFD447', radius = 160, life = 0.55, delay = 0 } = {}) {
    this.ring(x, y, { color, radius: radius * 1.08, width: 26, life: life * 1.1, alpha: 0.28, delay });
    this.ring(x, y, { color, radius, width: 12, life, alpha: 0.6, delay });
    this.ring(x, y, { color: '#FFFFFF', radius: radius * 0.96, width: 4, life: life * 0.9, alpha: 1, delay });
  }
  // 流光: long thin lines shooting out of a point.
  streaks(x, y, { count = 12, speed = 1500, colors = ['#FFFFFF', '#FFF3A0', '#FFD447'], size = 1, spread = Math.PI * 2, angle = -Math.PI / 2 } = {}) {
    for (let i = 0; i < this.n(count); i++) {
      const a = angle + (i / Math.max(1, count) - 0.5) * spread + rand(-0.12, 0.12); const v = speed * rand(0.6, 1);
      this.spawn('streak', x, y, Math.cos(a) * v, Math.sin(a) * v, { colors, size });
    }
  }
  // A fountain that keeps spouting for ms (virtual time): rate items per second.
  fountain(x, y, { ms = 1000, rate = 60, kinds = ['coin'], speed = 900, spread = 0.7, angle = -Math.PI / 2, size = 1, life = 1, colors = PAPER, g = null } = {}) {
    if (this.motion <= 0) return;
    this.emitters.push({ x, y, left: ms / 1000, rate: rate * (0.1 + 0.9 * this.motion) * (Q.tier >= 2 ? 0.6 : 1), acc: 0, kinds, speed, spread, angle, size, life, colors, g });
  }
  // Particles pulled in from a ring to (x, y) over life seconds (a charge-up).
  suck(x, y, { count = 24, radius = 180, life = 0.8, kinds = ['glow', 'twinkle', 'spark'], colors = GLOW_COLORS } = {}) {
    for (let i = 0; i < this.n(count); i++) {
      const p = this.spawn(pick(kinds), x, y, 0, 0, { colors, life: 1 });
      Object.assign(p, { suck: true, cx: x, cy: y, a0: rand(0, 6.3), r0: radius * rand(0.7, 1.15), spin: rand(1.2, 2.4) * (Math.random() < 0.5 ? -1 : 1), life: life * rand(0.75, 1), g: 0, drag: 0, color: pick(colors) });
      if (p.kind === 'spark') p.color = pick(colors);
    }
  }
  // slot: at most one live text per slot. A new one sends the older ones into their fade-out at once,
  // so fast typing does not stack "+1,234" labels on top of each other.
  // sprite: false draws the text directly each frame (short Latin floats created on every key:
  // cheaper than making a canvas for each); longer or Chinese text is rendered once into a sprite.
  text(x, y, str, { color = '#FFD447', size = 22, life = 1, vy = -90, slot = null, sprite = true } = {}) {
    if (slot) this.fadeSlot(slot);
    this.add({ kind: 'text', x, y, vx: 0, vy, g: 0, drag: 1.2, str, color, size, life, slot, img: sprite ? this.textSprite(str, size, color) : null });
  }
  measure(str, size) { const c = this.ctx; c.font = FONT(size); return c.measureText(str).width + Math.max(3, size * 0.18); }
  fadeSlot(slot) { for (const q of this.parts) if (q.slot === slot) { q.age = Math.max(q.age, q.life * 0.8); q.vy -= 80; } }
  puff(x, y, n = 6) { for (let i = 0; i < this.n(n); i++) this.add({ kind: 'puff', x: x + rand(-14, 14), y, vx: rand(-120, 120), vy: rand(-60, -10), g: 0, drag: 5, size: rand(6, 12), life: rand(0.35, 0.6), color: '#FFFFFF' }); }
  fireworks(W, H, n = 3, top = 0.08, bottom = 0.35) {
    for (let i = 0; i < this.n(n); i++) {
      const tx = rand(W * 0.1, W * 0.9); const ty = rand(H * top, H * bottom);
      this.add({ kind: 'shell', x: tx + rand(-30, 30), y: H + 20, sx: tx + rand(-30, 30), tx, ty, vx: 0, vy: 0, g: 0, drag: 0, t0: i * 0.15, life: 3, color: pick(PAPER.slice(0, 6)) });
    }
  }
  streamers(W, H, n = 6) {
    for (let i = 0; i < this.n(n); i++) {
      const left = i % 2 === 0; const a = left ? rand(-1.1, -0.4) : Math.PI - rand(-1.1, -0.4); const v = rand(650, 1000);
      this.add({ kind: 'streamer', x: left ? -10 : W + 10, y: rand(H * 0.05, H * 0.35), vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 650, drag: 1.1, life: rand(2, 2.8), color: pick(PAPER.slice(0, 5)), trail: [], w: rand(5, 9) });
    }
  }
  rain(W, n = 50, kinds = ['confetti']) {
    for (let i = 0; i < this.n(n); i++) this.add({ kind: pick(kinds), x: rand(0, W), y: rand(-150, -10), vx: rand(-50, 50), vy: rand(60, 240), rot: rand(0, 6), vr: rand(-8, 8), flip: rand(0, 6), vf: rand(5, 12), color: pick(PAPER), size: rand(0.8, 1.3), life: rand(2.5, 4), g: 110, drag: 0.6 });
  }
  clear() { this.parts.length = 0; this.emitters.length = 0; }

  // ---------------------------------------------------------------- experience gems
  // A gem that flies straight to the XP bar along a curve (onArrive when it gets there).
  // look: a GEMS key drawn instead of the equipped gem (e.g. 'gem-coin' for a payout).
  flyGem(x, y, tx, ty, { delay = 0, onArrive = null, look = null, spread = 70 } = {}) {
    const cx = x + rand(-spread, spread); const cy = Math.min(y, ty) - rand(30, 110);
    this.add({ kind: 'gem', mode: 'fly', x, y, x0: x, y0: y, cx, cy, tx, ty, t0: delay, dur: rand(0.5, 0.68), vx: 0, vy: 0, g: 0, drag: 0, life: 99, rot: rand(-0.4, 0.4), vr: rand(-3, 3), flip: 0, vf: 0, trail: [], onArrive, look });
  }
  // A gem that pops out, lands on the stage floor (between x0 and x1) and waits for the magnet.
  dropGem(x, y, floor, x0, x1, { onArrive = null } = {}) {
    this.add({ kind: 'gem', mode: 'drop', x, y, floor, x0, x1, vx: rand(-160, 160), vy: -rand(260, 420), g: 1500, drag: 0.4, life: 99, rot: rand(-0.5, 0.5), vr: rand(-6, 6), flip: 0, vf: 0, bob: rand(0, 6.3), trail: [], onArrive });
  }
  // 磁铁: every gem still lying around flies to (tx, ty), leaving a trail. Returns how many.
  magnet(tx, ty, { stagger = 0.22 } = {}) {
    let n = 0;
    for (const p of this.parts) {
      if (p.kind !== 'gem' || p.mode === 'fly' || p.mode === 'home') continue;
      p.mode = 'home'; p.tx = tx; p.ty = ty; p.t0 = p.age + rand(0, stagger); p.hv = 0; n += 1;
    }
    return n;
  }
  get groundGems() { let n = 0; for (const p of this.parts) if (p.kind === 'gem' && (p.mode === 'drop' || p.mode === 'rest')) n += 1; return n; }
  // Gems landed nowhere visible (motion 0): pay out at once.
  flushGems() { for (const p of this.parts) if (p.kind === 'gem') { p.age = p.life; if (p.onArrive) p.onArrive(p); p.onArrive = null; } }
  updateGem(p, dt) {
    if (p.mode === 'fly' || p.mode === 'home') {
      if (p.age < p.t0) { if (p.mode === 'home') p.y = p.floor - 7 + Math.sin(p.age * 5 + p.bob) * 2; return; }
      if (p.mode === 'fly') {
        const k = Math.min(1, (p.age - p.t0) / p.dur); const e = k * k * (3 - 2 * k);
        const a = (1 - e) ** 2; const b = 2 * (1 - e) * e; const c = e * e;
        p.x = a * p.x0 + b * p.cx + c * p.tx; p.y = a * p.y0 + b * p.cy + c * p.ty;
        if (k >= 1) this.arrive(p);
      } else {
        // Home in with growing speed (magnet).
        p.hv = Math.min(2600, (p.hv || 0) + 5200 * dt);
        const dx = p.tx - p.x; const dy = p.ty - p.y; const d = Math.hypot(dx, dy) || 1;
        const step = Math.min(d, p.hv * dt);
        p.x += (dx / d) * step; p.y += (dy / d) * step - Math.sin(Math.min(1, (p.age - p.t0) * 3) * Math.PI) * 2;
        if (d < 10) this.arrive(p);
      }
      p.trail.push(p.x, p.y); if (p.trail.length > 16) p.trail.splice(0, 2);
      p.rot += p.vr * dt;
      return;
    }
    // drop / rest
    if (p.mode === 'drop') {
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.x < p.x0) { p.x = p.x0; p.vx = Math.abs(p.vx) * 0.5; }
      if (p.x > p.x1) { p.x = p.x1; p.vx = -Math.abs(p.vx) * 0.5; }
      if (p.y > p.floor - 7) { p.y = p.floor - 7; if (Math.abs(p.vy) > 140) { p.vy *= -0.38; p.vx *= 0.6; } else { p.mode = 'rest'; p.vy = 0; p.rest = p.age; } }
    } else {
      p.y = p.floor - 7 + Math.sin((p.age - p.rest) * 4 + p.bob) * 2; p.rot = Math.sin(p.age * 2 + p.bob) * 0.25;
    }
  }
  arrive(p) {
    p.age = p.life;
    if (p.onArrive) { const f = p.onArrive; p.onArrive = null; f(p); }
    if (this.motion > 0) this.add({ kind: 'spark', x: p.tx, y: p.ty, vx: rand(-90, 90), vy: rand(-120, 20), g: 250, drag: 2.4, life: 0.3, color: '#FFFFFF' });
  }

  update(dt) {
    const H = VP.h + 200;
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      e.left -= dt; e.acc += e.rate * dt;
      while (e.acc >= 1) {
        e.acc -= 1;
        const a = e.angle + (Math.random() - 0.5) * e.spread; const v = e.speed * rand(0.55, 1);
        this.spawn(pick(e.kinds), e.x + rand(-6, 6), e.y, Math.cos(a) * v, Math.sin(a) * v, { size: e.size, life: e.life, colors: e.colors, g: e.g });
      }
      if (e.left <= 0) this.emitters.splice(i, 1);
    }
    const list = this.parts;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.age += dt;
      if (p.kind === 'gem') { this.updateGem(p, dt); continue; }
      if (p.kind === 'shell') {
        if (p.age < p.t0) continue;
        const k = Math.min(1, (p.age - p.t0) / 0.55);
        p.x = p.sx + (p.tx - p.sx) * k; p.y = VP.h + 20 + (p.ty - VP.h - 20) * (1 - (1 - k) ** 2);
        if (k >= 1) { p.age = p.life; this.burst(p.tx, p.ty, { count: 34, speed: 520, kinds: ['spark', 'spark', 'star', 'confetti'], up: 40, life: 0.9, colors: [p.color, '#FFFFFF', '#FFD447'] }); this.ring(p.tx, p.ty, { color: p.color, radius: 110, width: 5, life: 0.5 }); }
        continue;
      }
      if (p.suck) {
        const k = Math.min(1, p.age / p.life); const r = p.r0 * (1 - k * k); const a = p.a0 + p.spin * k;
        const nx = p.cx + Math.cos(a) * r; const ny = p.cy + Math.sin(a) * r;
        p.vx = (nx - p.x) / Math.max(dt, 1e-3); p.vy = (ny - p.y) / Math.max(dt, 1e-3); p.x = nx; p.y = ny;
        continue;
      }
      p.vy += p.g * dt; const f = Math.exp(-p.drag * dt); p.vx *= f; p.vy *= f;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.rot !== undefined) { p.rot += p.vr * dt; p.flip += p.vf * dt; }
      if (p.kind === 'streamer') { p.trail.push(p.x, p.y); if (p.trail.length > 32) p.trail.splice(0, 2); }
      if (p.y > H) p.age = p.life;
    }
    // Compact in place (no new array every frame).
    let j = 0;
    for (let i = 0; i < list.length; i++) if (list[i].age < list[i].life) list[j++] = list[i];
    list.length = j;
  }

  // ---------------------------------------------------------------- sprites
  // A small canvas drawn once at the current backing scale; draw(ctx) works in CSS pixels
  // around the centre.
  sprite(key, w, h, draw) {
    let s = this.sprites.get(key);
    if (s) return s;
    const k = this.k; const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(w * k)); cv.height = Math.max(1, Math.ceil(h * k));
    const c = cv.getContext('2d'); c.setTransform(k, 0, 0, k, (w * k) / 2, (h * k) / 2); draw(c);
    s = { cv, w, h }; this.sprites.set(key, s);
    return s;
  }
  shape(kind, color) {
    switch (kind) {
      case 'confetti': return this.sprite(`c${color}`, 13, 9, (c) => { c.fillStyle = color; c.fillRect(-5, -3, 10, 6); c.strokeStyle = INK; c.lineWidth = 1; c.strokeRect(-5, -3, 10, 6); });
      case 'star': return this.sprite(`s${color}`, 18, 18, (c) => { starPath(c, 7); c.fillStyle = color; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(); });
      case 'coin': return this.sprite('coin', 22, 22, (c) => { c.beginPath(); c.arc(0, 0, 8, 0, Math.PI * 2); c.fillStyle = '#FFD447'; c.fill(); c.strokeStyle = INK; c.lineWidth = 2; c.stroke(); c.fillStyle = '#FFF3A0'; c.fillRect(-1.5, -4, 3, 8); });
      case 'puff': return this.sprite('puff', 28, 28, (c) => { c.beginPath(); c.arc(0, 0, 12, 0, Math.PI * 2); c.fillStyle = '#FFFFFF'; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(); });
      case 'shell': return this.sprite('shell', 10, 10, (c) => { c.beginPath(); c.arc(0, 0, 3.5, 0, Math.PI * 2); c.fillStyle = '#FFF3A0'; c.fill(); });
      case 'gem': case 'jewel': { const g = GEMS[color] || GEMS['gem-sapphire']; return this.sprite(`g${color}`, 24, 24, g); }
      case 'heart': return this.sprite(`h${color}`, 22, 20, (c) => { heartPath(c, 8); c.fillStyle = color; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.6; c.stroke(); c.beginPath(); c.arc(-3.6, -2.6, 1.8, 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,.8)'; c.fill(); });
      case 'twinkle': return this.sprite(`t${color}`, 30, 30, (c) => {
        const gr = c.createRadialGradient(0, 0, 0, 0, 0, 14); gr.addColorStop(0, withAlpha(color, 0.55)); gr.addColorStop(1, withAlpha(color, 0));
        c.fillStyle = gr; c.fillRect(-15, -15, 30, 30);
        c.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 - Math.PI / 2; const r = i % 2 ? 2.2 : 10; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath();
        c.fillStyle = '#FFFFFF'; c.fill(); c.strokeStyle = color; c.lineWidth = 1.2; c.stroke();
      });
      case 'glow': return this.sprite(`o${color}`, 26, 26, (c) => {
        const gr = c.createRadialGradient(0, 0, 0, 0, 0, 13); gr.addColorStop(0, '#FFFFFF'); gr.addColorStop(0.28, withAlpha(color, 0.95)); gr.addColorStop(0.6, withAlpha(color, 0.3)); gr.addColorStop(1, withAlpha(color, 0));
        c.fillStyle = gr; c.fillRect(-13, -13, 26, 26);
      });
      case 'mini': { const f = MINIS[color] || PLAIN; return this.sprite(`m${f.key}`, 32, 30, (c) => miniTangyuan(c, f)); }
      default: return null;
    }
  }
  // Outlined text rendered once (its own canvas; not cached across different strings).
  textSprite(str, size, color) {
    const c0 = this.ctx; c0.font = FONT(size);
    const lw = Math.max(3, size * 0.18);
    const w = c0.measureText(str).width + lw * 2 + 4; const h = size * 1.35 + lw * 2;
    const k = this.k; const cv = document.createElement('canvas');
    cv.width = Math.ceil(w * k); cv.height = Math.ceil(h * k);
    const c = cv.getContext('2d'); c.setTransform(k, 0, 0, k, (w * k) / 2, (h * k) / 2);
    c.font = FONT(size); c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    c.strokeStyle = INK; c.lineWidth = lw; c.strokeText(str, 0, 0);
    c.fillStyle = color; c.fillText(str, 0, 0);
    return { cv, w, h };
  }
  // Draw every sprite and a sample float once (GPU shaders and glyphs get ready before they are
  // needed mid-game, where a first use can stall a frame), then clear.
  prewarm() {
    this.resize();
    const c = this.ctx; const k = this.k;
    c.setTransform(k, 0, 0, k, 0, 0); c.globalAlpha = 0.01;
    let x = 20;
    for (const col of PAPER) { const s = this.shape('confetti', col); c.drawImage(s.cv, x, 20, s.w, s.h); x += 3; }
    for (const col of STAR_COLORS) { const s = this.shape('star', col); c.drawImage(s.cv, x, 20, s.w, s.h); x += 3; }
    for (const kind of ['coin', 'puff', 'shell']) { const s = this.shape(kind); c.drawImage(s.cv, x, 20, s.w, s.h); x += 3; }
    for (const g of Object.keys(GEMS)) { const s = this.shape('gem', g); c.drawImage(s.cv, x, 20, s.w, s.h); x += 3; }
    for (const col of HEART_COLORS) { const s = this.shape('heart', col); c.drawImage(s.cv, x, 20, s.w, s.h); x += 3; }
    for (const col of GLOW_COLORS) { for (const kind of ['twinkle', 'glow']) { const s = this.shape(kind, col); c.drawImage(s.cv, x, 20, s.w, s.h); x += 3; } }
    for (let i = 0; i < MINIS.length; i++) { const s = this.shape('mini', i); c.drawImage(s.cv, x, 20, s.w, s.h); x += 3; }
    const t = this.textSprite('+1,234 甜度 本次连击 分！万', 30, '#FFD447'); c.drawImage(t.cv, 20, 40, t.w, t.h);
    c.strokeStyle = '#FFF'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(10, 10); c.lineTo(30, 30); c.stroke();
    c.beginPath(); c.arc(40, 40, 20, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 1;
    this.dirty = true;
  }

  draw() {
    if (document.hidden) return;
    this.resize();
    const c = this.ctx; const K = this.k;
    if (!this.parts.length) {
      // Empty: clear once and take the full-screen layer out of compositing.
      if (this.dirty) { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.canvas.width, this.canvas.height); this.dirty = false; this.canvas.style.visibility = 'hidden'; }
      return;
    }
    if (!this.dirty) this.canvas.style.visibility = '';
    this.dirty = true;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const clip = this.clipOn && this.holes.length;
    if (clip) {
      c.save(); c.setTransform(K, 0, 0, K, 0, 0); c.beginPath(); c.rect(-50, -50, VP.w + 100, VP.h + 100);
      for (const h of this.holes) roundRect(c, h.l, h.t, h.r - h.l, h.b - h.t, h.rad || 0);
      c.clip('evenodd');
    }
    for (const p of this.parts) {
      if (p.kind === 'shell' && p.age < p.t0) continue;
      if (p.kind === 'ring' && p.age < p.t0) continue;
      // Clipping alone still submits every draw to Canvas/GPU. Skip sprites wholly
      // outside the viewport or inside a clipped hole, but keep updating them (and
      // never cull gems, whose trails/arrival callbacks carry gameplay state).
      if (BOUNDED.has(p.kind) && !spriteVisible(p.x, p.y, 32 * Math.max(1, p.size || 1), VP.w, VP.h, clip ? this.holes : [])) continue;
      const k = p.age / p.life; const fade = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      c.globalAlpha = Math.max(0, fade);
      switch (p.kind) {
        case 'heart': case 'jewel': case 'mini': case 'twinkle': case 'glow': {
          const s = this.shape(p.kind, p.color);
          let sc = K * p.size;
          if (p.kind === 'twinkle') sc *= 0.6 + 0.5 * Math.abs(Math.sin(p.age * 14 + p.flip));
          if (p.kind === 'glow') sc *= 1 - k * 0.5;
          const co = Math.cos(p.rot); const si = Math.sin(p.rot);
          // Hearts and little 汤圆 only rock a little (they stay upright); glows do not turn.
          const w = Math.sin(p.rot) * 0.35;
          const rot = p.kind === 'glow' ? [1, 0] : p.kind === 'heart' || p.kind === 'mini' ? [Math.cos(w), Math.sin(w)] : [co, si];
          c.setTransform(sc * rot[0], sc * rot[1], -sc * rot[1], sc * rot[0], p.x * K, p.y * K);
          c.drawImage(s.cv, -s.w / 2, -s.h / 2, s.w, s.h); break;
        }
        case 'streak': {
          c.setTransform(K, 0, 0, K, 0, 0);
          const len = 0.06; c.strokeStyle = p.color; c.lineWidth = p.w * (1 - k * 0.6); c.lineCap = 'round';
          c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * len, p.y - p.vy * len); c.stroke(); break;
        }
        case 'confetti': case 'star': {
          const s = this.shape(p.kind, p.color); const sc = K * p.size;
          const sy = p.kind === 'confetti' ? Math.cos(p.flip) : 1;
          const co = Math.cos(p.rot); const si = Math.sin(p.rot);
          c.setTransform(sc * co, sc * si, -sc * sy * si, sc * sy * co, p.x * K, p.y * K);
          c.drawImage(s.cv, -s.w / 2, -s.h / 2, s.w, s.h); break;
        }
        case 'coin': {
          const s = this.shape('coin'); const sc = K * p.size;
          c.setTransform(sc * Math.max(0.15, Math.abs(Math.cos(p.flip))), 0, 0, sc, p.x * K, p.y * K);
          c.drawImage(s.cv, -s.w / 2, -s.h / 2, s.w, s.h); break;
        }
        case 'puff': {
          const s = this.shape('puff'); const sc = (K * p.size * (1 - k * 0.5)) / 12;
          c.setTransform(sc, 0, 0, sc, p.x * K, p.y * K); c.drawImage(s.cv, -s.w / 2, -s.h / 2, s.w, s.h); break;
        }
        case 'gem': {
          c.globalAlpha = 1;
          const t = p.trail;
          if (t.length >= 4 && p.age >= (p.t0 || 0)) {
            c.setTransform(K, 0, 0, K, 0, 0); c.lineCap = 'round'; c.lineJoin = 'round';
            c.beginPath(); c.moveTo(t[0], t[1]); for (let j = 2; j < t.length; j += 2) c.lineTo(t[j], t[j + 1]);
            c.globalAlpha = 0.5; c.strokeStyle = INK; c.lineWidth = this.rainbow ? 10 : 8; c.stroke();
            c.globalAlpha = 0.95; c.strokeStyle = this.rainbow ? `hsl(${(p.age * 360 + (p.bob || 0) * 57) % 360},95%,62%)` : (GEM_TRAIL[p.look || this.gemStyle] || '#8FC2FF');
            c.lineWidth = this.rainbow ? 6 : 4.5; c.stroke(); c.globalAlpha = 1;
          }
          const s = this.shape('gem', p.look || this.gemStyle); const sc = K * (p.mode === 'fly' ? 1.15 : 1.3);
          const co = Math.cos(p.rot); const si = Math.sin(p.rot);
          c.setTransform(sc * co, sc * si, -sc * si, sc * co, p.x * K, p.y * K);
          c.drawImage(s.cv, -s.w / 2, -s.h / 2, s.w, s.h); break;
        }
        case 'shell': {
          const s = this.shape('shell'); c.setTransform(K, 0, 0, K, p.x * K, p.y * K); c.drawImage(s.cv, -s.w / 2, -s.h / 2, s.w, s.h); break;
        }
        case 'text': {
          c.setTransform(K, 0, 0, K, p.x * K, p.y * K);
          if (p.img) { c.drawImage(p.img.cv, -p.img.w / 2, -p.img.h / 2, p.img.w, p.img.h); break; }
          c.font = FONT(p.size); c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
          c.strokeStyle = INK; c.lineWidth = Math.max(3, p.size * 0.18); c.strokeText(p.str, 0, 0);
          c.fillStyle = p.color; c.fillText(p.str, 0, 0); break;
        }
        case 'spark': {
          c.setTransform(K, 0, 0, K, 0, 0);
          c.strokeStyle = p.color; c.lineWidth = 3; c.lineCap = 'round';
          c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); c.stroke(); break;
        }
        case 'ring': {
          c.setTransform(K, 0, 0, K, 0, 0);
          const kk = Math.max(0, (p.age - (p.t0 || 0)) / (p.life - (p.t0 || 0)));
          const r = p.radius * (0.3 + 0.7 * (1 - (1 - kk) ** 3));
          c.strokeStyle = p.color; c.lineWidth = p.width * (1 - kk); c.globalAlpha = (1 - kk) * (p.alpha ?? 1);
          c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2); c.stroke(); break;
        }
        case 'streamer': {
          const t = p.trail; if (t.length < 4) break;
          c.setTransform(K, 0, 0, K, 0, 0);
          c.strokeStyle = p.color; c.lineWidth = p.w; c.lineCap = 'round'; c.lineJoin = 'round';
          c.beginPath(); c.moveTo(t[0], t[1]); for (let i = 2; i < t.length; i += 2) c.lineTo(t[i], t[i + 1]); c.stroke(); break;
        }
        default: break;
      }
    }
    c.globalAlpha = 1;
    if (clip) c.restore();
  }
}

function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function heartPath(c, r) {
  c.beginPath(); c.moveTo(0, r * 0.95);
  c.bezierCurveTo(-r * 1.25, 0, -r * 0.95, -r * 1.05, 0, -r * 0.45);
  c.bezierCurveTo(r * 0.95, -r * 1.05, r * 1.25, 0, 0, r * 0.95); c.closePath();
}
function withAlpha(hexStr, a) { const n = parseInt(hexStr.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
// A small 汤圆 (about 26 px): body, feet, dot eyes, an open smile; the filling colours from tangyuan.js.
function miniTangyuan(c, f) {
  c.lineWidth = 1.8; c.strokeStyle = INK;
  c.fillStyle = '#FF782D';
  c.beginPath(); c.ellipse(-5.5, 10, 4, 2.4, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  c.beginPath(); c.ellipse(5.5, 10, 4, 2.4, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  c.beginPath(); c.ellipse(0, 0, 13, 11, 0, 0, Math.PI * 2); c.fillStyle = f.body; c.fill(); c.lineWidth = 2; c.stroke();
  c.fillStyle = f.blush; c.globalAlpha = 0.9;
  c.beginPath(); c.ellipse(-7.6, 2.6, 2.2, 1.4, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(7.6, 2.6, 2.2, 1.4, 0, 0, Math.PI * 2); c.fill();
  c.globalAlpha = 1; c.fillStyle = f.key === 'sesame' ? '#FFFFFF' : INK;
  c.beginPath(); c.ellipse(-4, -2, 1.5, 2, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(4, -2, 1.5, 2, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.moveTo(-2.6, 2); c.quadraticCurveTo(0, 6.2, 2.6, 2); c.closePath(); c.fillStyle = '#EE4B3E'; c.fill();
}

function starPath(c, r) {
  c.beginPath();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2; const rr = i % 2 ? r * 0.45 : r; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  c.closePath();
}
