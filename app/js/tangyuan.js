// 汤圆 mascot drawn in SVG: white, slightly flattened round body, orange oval feet, blush,
// thin arms with round hands, and a two-wisp S-shaped 热气 on top (never a question mark:
// two wavy strokes, no hook curling back, no dot). The steam follows the mood:
// happy = taller and perky, sad = droops sideways, surprised = straight up.
// The hero's arms live in screen space so they can stretch like rubber hoses to the keypad.
import { Spring, clamp, lerp, tween, wait, easeOutCubic, easeInOutCubic, easeOutBack } from './core.js';
import { Q } from './quality.js';
import { OUTFIT } from './art.js';

const NS = 'http://www.w3.org/2000/svg';
export const INK = '#172754';
const STEAM = '#BFD3FF';
const FOOT = '#FF782D';

export const PLAIN = { key: 'plain', name: '汤圆', body: '#FFFFFF', blush: '#FFB08A' };
export const FILLINGS = [
  { key: 'sesame', name: '黑芝麻', body: '#4D4E5C', blush: '#FFFFFF' },
  { key: 'peanut', name: '花生', body: '#E0B88C', blush: '#FF9A76' },
  { key: 'redbean', name: '红豆', body: '#B8544F', blush: '#FFA394' },
  { key: 'matcha', name: '抹茶', body: '#AACB86', blush: '#FF9C7A' },
  { key: 'taro', name: '芋泥', body: '#D9C9F5', blush: '#FF9FB8' },
];
// The fourth merge level (金): a golden 汤圆 whatever the filling.
export const GOLD = { key: 'gold', name: '金', body: '#FFD447', blush: '#FF9A52' };

function el(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

const EYES = {
  dot: (fill) => `<ellipse cx="-15" cy="-50" rx="4.3" ry="5.8" fill="${fill}"/><ellipse cx="15" cy="-50" rx="4.3" ry="5.8" fill="${fill}"/><circle cx="-13.6" cy="-52.4" r="1.4" fill="#fff"/><circle cx="16.4" cy="-52.4" r="1.4" fill="#fff"/>`,
  happy: () => `<path d="M-21 -48 Q-15 -57 -9 -48 M9 -48 Q15 -57 21 -48" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`,
  closed: () => `<path d="M-21 -51 Q-15 -45 -9 -51 M9 -51 Q15 -45 21 -51" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>`,
  x: () => `<path d="M-20 -55 L-10 -45 M-10 -55 L-20 -45 M10 -55 L20 -45 M20 -55 L10 -45" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`,
  wide: (fill) => `<circle cx="-15" cy="-51" r="6.5" fill="#fff" stroke="${INK}" stroke-width="2.4"/><circle cx="15" cy="-51" r="6.5" fill="#fff" stroke="${INK}" stroke-width="2.4"/><circle cx="-15" cy="-50" r="3.2" fill="${fill}"/><circle cx="15" cy="-50" r="3.2" fill="${fill}"/>`,
  // 听牌: eyes looking down at the answer, brows set.
  focus: (fill) => `<ellipse cx="-14" cy="-46" rx="4.3" ry="5.4" fill="${fill}"/><ellipse cx="14" cy="-46" rx="4.3" ry="5.4" fill="${fill}"/><circle cx="-12.8" cy="-47.6" r="1.3" fill="#fff"/><circle cx="15.2" cy="-47.6" r="1.3" fill="#fff"/><path d="M-23 -60 L-8 -56 M23 -60 L8 -56" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>`,
  wink: (fill) => `<ellipse cx="-15" cy="-50" rx="4.3" ry="5.8" fill="${fill}"/><circle cx="-13.6" cy="-52.4" r="1.4" fill="#fff"/><path d="M9 -54 L20 -50 L9 -46" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`,
};
const MOUTH = {
  smile: () => `<path d="M-8 -39 C-8 -28.5 8 -28.5 8 -39 Z" fill="#EE4B3E" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M-4.2 -32.4 C-2 -34 2 -34 4.2 -32.4 C2.6 -30.6 -2.6 -30.6 -4.2 -32.4Z" fill="#FF9DA0"/>`,
  grin: () => `<path d="M-12 -40 C-12 -23 12 -23 12 -40 Z" fill="#EE4B3E" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/><path d="M-6.5 -29.5 C-3 -32 3 -32 6.5 -29.5 C4 -26.6 -4 -26.6 -6.5 -29.5Z" fill="#FF9DA0"/>`,
  o: () => `<ellipse cx="0" cy="-34" rx="4.6" ry="5.6" fill="#EE4B3E" stroke="${INK}" stroke-width="2.4"/>`,
  wavy: () => `<path d="M-9 -33 q2.25 -3.5 4.5 0 t4.5 0 t4.5 0 t4.5 0" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  // Cheeks puffed, lips pressed together.
  puff: () => `<path d="M-5 -34 Q0 -31 5 -34" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`,
  flat: () => `<path d="M-6 -35 L6 -35" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`,
};

// Steam parameters per mood; the drawn values ease toward the current mood.
const MOODS = {
  calm: { amp: 3.2, h: 1, bend: 0, speed: 2.4, wiggle: 0 },
  happy: { amp: 4.6, h: 1.22, bend: 0, speed: 6, wiggle: 0.22 },
  sad: { amp: 3, h: 0.86, bend: 1.3, speed: 1.1, wiggle: 0 },
  surprised: { amp: 0.25, h: 1.32, bend: 0, speed: 0.5, wiggle: 0 },
};

// One S-shaped wisp as a smooth path (local coordinates, growing upward from bx, by).
export function wispPath(bx, by, h, amp, phase, bend, tilt, waves = 1.5) {
  const N = 14; const ds = h / N; const pts = []; let x = bx; let y = by;
  const dirAt = (s) => -Math.PI / 2 + tilt + bend * s ** 1.4;
  pts.push([x, y, dirAt(0)]);
  for (let i = 1; i <= N; i++) { const s = i / N; const a = dirAt(s); x += Math.cos(a) * ds; y += Math.sin(a) * ds; pts.push([x, y, a]); }
  const wav = pts.map(([px, py, a], i) => {
    const s = i / N; const off = amp * Math.sin(2 * waves * Math.PI * s + phase) * (0.35 + 0.65 * s);
    return [px - Math.sin(a) * off, py + Math.cos(a) * off];
  });
  let d = `M${wav[0][0].toFixed(1)} ${wav[0][1].toFixed(1)}`;
  for (let i = 1; i < wav.length - 1; i++) {
    const mx = (wav[i][0] + wav[i + 1][0]) / 2; const my = (wav[i][1] + wav[i + 1][1]) / 2;
    d += ` Q${wav[i][0].toFixed(1)} ${wav[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  const L = wav[wav.length - 1]; d += ` L${L[0].toFixed(1)} ${L[1].toFixed(1)}`;
  return d;
}

export class Tangyuan {
  // layer: SVG group; opts.armLayer: group for stretchy screen-space arms (hero), else short local arms.
  constructor(layer, { scale = 1, filling = PLAIN, armLayer = null, shadow = true } = {}) {
    this.S = scale; this.filling = filling; this.x = -999; this.y = -999; this.lift = 0; this.rot = 0; this.bob = 0;
    this.sq = new Spring(0, 260, 13);
    this.visible = true; this.t = Math.random() * 10;
    this.mood = 'calm'; this.m = { ...MOODS.calm };
    this.eyes = null; this.mouth = null; this.faceHold = 0;
    // Idle life: blink every 2.5-5 s, and an optional gentle sway (rocking on the feet).
    this.blinkIn = 1 + Math.random() * 3; this.blinking = 0; this.sway = 0; this.swayPh = Math.random() * 6.3;
    this.shadow = shadow ? el('ellipse', { fill: 'rgba(23,39,84,.13)' }, layer) : null;
    this.g = el('g', { class: 'ty' }, layer);
    this.stretchy = !!armLayer;
    // Parts in local coordinates (feet at 0,0; body top at about -89).
    this.localArms = this.stretchy ? null : el('g', {}, this.g);
    el('ellipse', { cx: -19, cy: -5, rx: 13.5, ry: 8, fill: FOOT, stroke: INK, 'stroke-width': 3.2 }, this.g);
    el('ellipse', { cx: 19, cy: -5, rx: 13.5, ry: 8, fill: FOOT, stroke: INK, 'stroke-width': 3.2 }, this.g);
    this.bodyEl = el('ellipse', { cx: 0, cy: -46, rx: 50, ry: 43, fill: filling.body, stroke: INK, 'stroke-width': 3.6 }, this.g);
    this.blushEl = el('g', {}, this.g);
    el('ellipse', { cx: -29, cy: -37, rx: 8, ry: 5, fill: filling.blush, opacity: 0.9 }, this.blushEl);
    el('ellipse', { cx: 29, cy: -37, rx: 8, ry: 5, fill: filling.blush, opacity: 0.9 }, this.blushEl);
    this.neckG = el('g', {}, this.g);
    if (filling.key === 'gold') el('path', { d: 'M-30 -72 Q-18 -84 -2 -85', fill: 'none', stroke: '#FFF6C8', 'stroke-width': 6, 'stroke-linecap': 'round' }, this.g);
    this.eyeG = el('g', {}, this.g);
    this.mouthG = el('g', {}, this.g);
    this.faceG = el('g', {}, this.g);
    this.headG = el('g', {}, this.g);
    this.steamBase = [0, 0];
    this.steamG = el('g', { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, this.g);
    this.steam = [0, 1].map(() => ({ o: el('path', { stroke: INK, 'stroke-width': 6.6 }, this.steamG), f: el('path', { stroke: STEAM, 'stroke-width': 3.4 }, this.steamG) }));
    // Arms.
    this.hands = [-1, 1].map((side) => ({ side, raise: 0, raiseT: 0, pos: null, busy: false, digit: null, anim: false }));
    if (this.stretchy) {
      for (const h of this.hands) {
        h.o = el('path', { fill: 'none', stroke: INK, 'stroke-linecap': 'round' }, armLayer);
        h.i = el('path', { fill: 'none', stroke: filling.body, 'stroke-linecap': 'round' }, armLayer);
        h.c = el('circle', { fill: filling.body, stroke: INK }, armLayer);
        h.t = el('text', { class: 'carry-digit', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, armLayer);
      }
    } else {
      for (const h of this.hands) {
        h.o = el('path', { fill: 'none', stroke: INK, 'stroke-width': 6.4, 'stroke-linecap': 'round' }, this.localArms);
        h.i = el('path', { fill: 'none', stroke: filling.body, 'stroke-width': 3, 'stroke-linecap': 'round' }, this.localArms);
        h.c = el('circle', { r: 7, fill: filling.body, stroke: INK, 'stroke-width': 2.8 }, this.localArms);
      }
    }
    this.eyeFill = filling.key === 'sesame' ? '#0E1330' : INK;
    this.setFace('dot', 'smile');
  }

  // Outfit: { head, face, neck } item ids (see art.js). The steam then rises from the top of the hat.
  setOutfit(o = {}) {
    const key = `${o.head || ''}|${o.face || ''}|${o.neck || ''}`;
    if (key === this.outfitKey) return;
    this.outfitKey = key;
    this.headG.innerHTML = o.head && OUTFIT[o.head] ? OUTFIT[o.head].svg : '';
    this.faceG.innerHTML = o.face && OUTFIT[o.face] ? OUTFIT[o.face].svg : '';
    this.neckG.innerHTML = o.neck && OUTFIT[o.neck] ? OUTFIT[o.neck].svg : '';
    const st = o.head && OUTFIT[o.head]?.steam;
    this.steamBase = st ? [st[0], st[1] + 87] : [0, 0];
  }

  destroy() { this.g.remove(); if (this.shadow) this.shadow.remove(); if (this.stretchy) for (const h of this.hands) { h.o.remove(); h.i.remove(); h.c.remove(); h.t.remove(); } }
  place(x, y) { this.x = x; this.y = y; }

  setFace(eyes, mouth, holdMs = 0) {
    if (eyes !== this.eyes) { this.eyes = eyes; this.eyeG.innerHTML = EYES[eyes](this.eyeFill); }
    if (mouth !== this.mouth) { this.mouth = mouth; this.mouthG.innerHTML = MOUTH[mouth](); }
    this.faceHold = holdMs;
  }
  resetFace() { this.setFace('dot', 'smile'); this.setMood('calm'); }
  setMood(m) { this.mood = MOODS[m] ? m : 'calm'; }

  // Local point -> screen point (includes lift, rotation about the feet and squash).
  toScreen(lx, ly) {
    const sx = 1 + this.sq.value * 0.9; const sy = 1 - this.sq.value;
    const a = (this.rot * Math.PI) / 180; const X = lx * this.S * sx; const Y = ly * this.S * sy;
    return { x: this.x + X * Math.cos(a) - Y * Math.sin(a), y: this.y - this.lift + X * Math.sin(a) + Y * Math.cos(a) };
  }
  handRest(h) {
    const r = h.raise;
    return this.toScreen(h.side * lerp(57, 52, r), lerp(-24, -98, r));
  }
  get headTop() { return this.toScreen(0, -92 + this.steamBase[1]); }
  get center() { return this.toScreen(0, -46); }

  update(dt) {
    this.t += dt;
    this.sq.step(dt); this.sq.value = clamp(this.sq.value, -0.3, 0.3);
    if (this.faceHold > 0) { this.faceHold -= dt * 1000; if (this.faceHold <= 0) this.resetFace(); }
    this.blinkIn -= dt;
    if (this.blinking > 0) { this.blinking -= dt; if (this.blinking <= 0) this.eyeG.innerHTML = EYES[this.eyes](this.eyeFill); } else if (this.blinkIn <= 0) {
      this.blinkIn = 2.5 + Math.random() * 2.5;
      if (this.eyes === 'dot' && dt > 0) { this.eyeG.innerHTML = EYES.closed(); this.blinking = 0.12; }
    }
    // Hidden actors (title friends during play, the audience on a tiny stage) cost nothing.
    if (this.shown !== this.visible) {
      this.shown = this.visible; const v = this.visible ? '' : 'none';
      this.g.style.display = v; if (this.shadow) this.shadow.style.display = v;
      if (this.stretchy) for (const h of this.hands) { h.o.style.display = v; h.i.style.display = v; h.c.style.display = v; if (!this.visible) h.t.style.display = 'none'; }
    }
    if (!this.visible) return;
    const sw = (this.sway ? Math.sin(this.t * 1.7 + this.swayPh) * this.sway : 0) + (this.tremble ? Math.sin(this.t * 43 + this.swayPh) * this.tremble : 0);
    const target = MOODS[this.mood]; const km = Math.min(1, dt * 7);
    this.m.amp = lerp(this.m.amp, target.amp, km); this.m.h = lerp(this.m.h, target.h, km); this.m.bend = lerp(this.m.bend, target.bend, km);
    this.m.speed = lerp(this.m.speed, target.speed, km); this.m.wiggle = lerp(this.m.wiggle, target.wiggle, km);
    const breathe = Math.sin(this.t * 2.2) * (0.015 + 0.03 * this.bob);
    const sx = 1 + this.sq.value * 0.9 + breathe; const sy = 1 - this.sq.value - breathe;
    // Attributes are only written when their text changes (SVG repaints are the costly part).
    const tr = `translate(${this.x.toFixed(1)} ${(this.y - this.lift).toFixed(1)}) rotate(${(this.rot + sw).toFixed(1)}) scale(${(this.S * sx).toFixed(3)} ${(this.S * sy).toFixed(3)})`;
    if (tr !== this.lastTr) { this.lastTr = tr; this.g.setAttribute('transform', tr); }
    if (this.shadow) {
      const k = clamp(1 - this.lift / 160, 0.4, 1);
      const sh = `${this.x.toFixed(1)}|${(this.y + 1).toFixed(1)}|${Math.max(0, 42 * this.S * k).toFixed(1)}|${Math.max(0, 7 * this.S * k).toFixed(1)}`;
      if (sh !== this.lastSh) {
        this.lastSh = sh; const [cx, cy, rx, ry] = sh.split('|');
        this.shadow.setAttribute('cx', cx); this.shadow.setAttribute('cy', cy); this.shadow.setAttribute('rx', rx); this.shadow.setAttribute('ry', ry);
      }
    }
    // Steam: two S-shaped wisps. The audience redraws it every few frames on lower quality tiers.
    this.frameN = (this.frameN || 0) + 1;
    if (this.stretchy || this.frameN % Q.p.steamEvery === 0) {
      const m = this.m; const ph = this.t * m.speed; const tilt = Math.sin(this.t * 9) * m.wiggle;
      const [bx, by] = this.steamBase;
      const d0 = wispPath(bx - 5, by - 87, 26 * m.h, m.amp, ph, m.bend, tilt - 0.08, 1.5);
      const d1 = wispPath(bx + 9, by - 85, 17 * m.h, m.amp * 0.8, ph + 2.1, m.bend * 1.1, tilt + 0.18, 1);
      this.steam[0].o.setAttribute('d', d0); this.steam[0].f.setAttribute('d', d0);
      this.steam[1].o.setAttribute('d', d1); this.steam[1].f.setAttribute('d', d1);
    }
    // Arms.
    for (const h of this.hands) {
      h.raise = lerp(h.raise, h.raiseT, Math.min(1, dt * 10));
      if (this.stretchy) this.drawStretchy(h); else this.drawLocal(h);
    }
  }

  drawLocal(h) {
    const r = h.raise; const s = h.side;
    const hx = (s * lerp(56, 50, r)).toFixed(1); const hy = (lerp(-23, -96, r) + Math.sin(this.t * 6 + s) * 2 * r).toFixed(1);
    const d = `M${s * 40} -42 Q${(s * lerp(54, 58, r)).toFixed(1)} ${lerp(-30, -70, r).toFixed(1)} ${hx} ${hy}`;
    if (d === h.lastD) return;
    h.lastD = d;
    h.o.setAttribute('d', d); h.i.setAttribute('d', d); h.c.setAttribute('cx', hx); h.c.setAttribute('cy', hy);
  }

  drawStretchy(h) {
    const sh = this.toScreen(h.side * 42, -43);
    const hand = h.anim && h.pos ? h.pos : this.handRest(h);
    if (!h.anim) h.pos = hand;
    const dx = hand.x - sh.x; const dy = hand.y - sh.y; const len = Math.hypot(dx, dy) || 1;
    const bulge = clamp(len * 0.16, 3, 42) * (1 + 0.12 * Math.sin(this.t * 14)) * h.side * (dy > 0 ? -1 : 1);
    const cx = (sh.x + hand.x) / 2 + (-dy / len) * bulge; const cy = (sh.y + hand.y) / 2 + (dx / len) * bulge;
    const d = `M${sh.x.toFixed(1)} ${sh.y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${hand.x.toFixed(1)} ${hand.y.toFixed(1)}`;
    if (d !== h.lastD) {
      h.lastD = d;
      h.o.setAttribute('d', d); h.i.setAttribute('d', d);
      h.c.setAttribute('cx', hand.x.toFixed(1)); h.c.setAttribute('cy', hand.y.toFixed(1));
    }
    if (this.S !== h.lastS) {
      h.lastS = this.S; const w = Math.max(3.6, 6.6 * this.S);
      h.o.setAttribute('stroke-width', w.toFixed(2)); h.i.setAttribute('stroke-width', (w * 0.45).toFixed(2));
      h.c.setAttribute('r', Math.max(5, 7.5 * this.S).toFixed(1)); h.c.setAttribute('stroke-width', Math.max(2, 2.8 * this.S).toFixed(1));
    }
    if (h.digit !== null && this.visible) {
      const size = Math.max(26, 34 * this.S);
      h.t.textContent = h.digit; h.t.style.display = '';
      h.t.setAttribute('x', hand.x.toFixed(1)); h.t.setAttribute('y', (hand.y - size * 0.55).toFixed(1));
      h.t.setAttribute('font-size', size.toFixed(0));
    } else h.t.style.display = 'none';
  }

  // Move a hand along a path given by functions (targets may move while the hand travels).
  moveHand(h, from, to, ms, arc = 0) {
    h.anim = true;
    return tween(ms, (e) => {
      const a = from(); const b = to();
      h.pos = { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e) - Math.sin(e * Math.PI) * arc };
    }, easeInOutCubic);
  }

  // Carry a digit from the keypad (from) to a cell (to). Returns false when both hands are busy.
  async carry(from, to, digit, { onGrab, onPlace } = {}) {
    if (!this.stretchy) return false;
    const pref = from.x >= this.x ? 1 : -1;
    const h = this.hands.find((x) => x.side === pref && !x.busy) || this.hands.find((x) => !x.busy);
    if (!h) return false;
    h.busy = true;
    const start = { ...(h.pos || this.handRest(h)) };
    await this.moveHand(h, () => start, () => from, 110);
    h.digit = digit; if (onGrab) onGrab();
    await this.moveHand(h, () => from, () => to(), 190, 36);
    if (onPlace) onPlace();
    h.digit = null;
    const at = { ...h.pos };
    await this.moveHand(h, () => at, () => this.handRest(h), 150);
    h.anim = false; h.busy = false;
    return true;
  }

  // Decoration for a key press: the rubber-hose arm reaches the cell, pats it and comes back.
  // The digit is already in the cell; this never delays anything. Skipped when both hands are busy.
  async tap(target) {
    if (!this.stretchy) return;
    const h = this.hands.find((x) => !x.busy && x.side === (target.x >= this.x ? 1 : -1)) || this.hands.find((x) => !x.busy);
    if (!h) return;
    h.busy = true;
    const start = { ...(h.pos || this.handRest(h)) };
    const at = { x: target.x, y: target.y };
    await this.moveHand(h, () => start, () => at, 120, 20);
    await tween(90, (e) => { h.pos = { x: at.x, y: at.y - Math.sin(e * Math.PI) * 9 }; }, (k) => k);
    const back = { ...h.pos };
    await this.moveHand(h, () => back, () => this.handRest(h), 150);
    h.anim = false; h.busy = false;
  }

  // Point at something for a moment (second-miss hint).
  async point(target) {
    if (!this.stretchy) return;
    const h = this.hands.find((x) => !x.busy); if (!h) return;
    h.busy = true;
    const start = { ...(h.pos || this.handRest(h)) };
    const near = { x: target.x - (target.w || 30) / 2 - 10, y: target.y - (target.h || 30) * 0.15 };
    await this.moveHand(h, () => start, () => near, 180);
    await wait(650);
    const at = { ...h.pos };
    await this.moveHand(h, () => at, () => this.handRest(h), 180);
    h.anim = false; h.busy = false;
  }

  raise(on) { for (const h of this.hands) h.raiseT = on ? 1 : 0; }

  // maxLift: the owner can cap jumps (a short stage must not send the hero over the header).
  async hop(height = 24, ms = 320) {
    height = Math.min(height, this.maxLift ?? Infinity);
    this.hopping = true;
    this.sq.kick(-2.2);
    await tween(ms, (e) => { this.lift = Math.sin(e * Math.PI) * height; }, (k) => k);
    this.lift = 0; this.sq.kick(3);
    this.hopping = false;
  }

  async celebrate(E = 0.5, big = false) {
    this.setFace(big ? 'happy' : 'happy', big ? 'grin' : 'smile', 900);
    this.setMood('happy');
    this.raise(true);
    await this.hop(18 + 34 * Math.min(1, E) + (big ? 20 : 0), 300 + 60 * Math.min(1, E));
    if (big) await this.hop(20, 260);
    this.raise(false);
    setTimeoutVirtual(() => { if (this.mood === 'happy') this.setMood('calm'); }, 500);
  }

  // Wrong answer: × eyes, falls over, bounces back up.
  async hurt(dir = 1) {
    this.setFace('x', 'wavy', 1300);
    this.setMood('sad');
    this.sq.kick(4);
    // Lying on its side the body would dip below the ground; lift it so it rests on the ground line.
    const rest = 44 * this.S;
    await tween(170, (e) => { this.rot = -dir * 82 * e; this.lift = rest * e + Math.sin(e * Math.PI) * 10; }, easeOutCubic);
    this.lift = rest;
    await wait(450);
    this.setFace('closed', 'wavy', 900);
    await tween(360, (e) => { this.rot = -dir * 82 * (1 - e); this.lift = rest * (1 - e) + Math.sin(e * Math.PI) * 26; }, easeOutBack);
    this.rot = 0; this.lift = 0; this.sq.kick(3.5);
  }

  // Tapped: a startled hop, then a grin.
  async poke() {
    this.setFace('wide', 'o', 260); this.setMood('surprised');
    this.sq.kick(-3);
    await this.hop(26, 300);
    this.setFace('happy', 'grin', 600); this.setMood('happy');
    wait(700).then(() => { if (this.mood === 'happy') this.setMood('calm'); });
  }

  // 听牌 poses. Hero: leans toward the answer and stares at it. Audience: cheeks puffed, trembling.
  stare(on, dir = 0) {
    if (on) { this.setFace('focus', 'flat', 60000); this.setMood('surprised'); this.lean = 7 * Math.sign(dir || 1); this.rot = this.lean; this.sq.kick(-1.2); } else if (this.lean) { this.lean = 0; this.rot = 0; this.resetFace(); }
  }
  brace(on) {
    if (on) { this.setFace('wide', 'puff', 60000); this.setMood('surprised'); this.tremble = 1.8; this.blushEl.setAttribute('transform', 'translate(0 -37) scale(1.4 1.35) translate(0 37)'); } else if (this.tremble) { this.tremble = 0; this.blushEl.removeAttribute('transform'); this.resetFace(); }
  }

  surprised(ms = 700) { this.setFace('wide', 'o', ms); this.setMood('surprised'); setTimeoutVirtual(() => { if (this.mood === 'surprised') this.setMood('calm'); }, ms); }
}

// Small helper (virtual-time timeout) without a circular import of `later`.
function setTimeoutVirtual(fn, ms) { wait(ms).then(fn); }

// Static SVG markup of a tangyuan (for the title logo and result card decorations).
export function tangyuanSVG({ filling = PLAIN, eyes = 'dot', mouth = 'smile', mood = 'calm', size = 120, outfit = {} } = {}) {
  const m = MOODS[mood];
  const st = outfit.head && OUTFIT[outfit.head]?.steam; const [bx, by] = st ? [st[0], st[1] + 87] : [0, 0];
  const w1 = wispPath(bx - 5, by - 87, 26 * m.h, m.amp, 0.6, m.bend, -0.08, 1.5);
  const w2 = wispPath(bx + 9, by - 85, 17 * m.h, m.amp * 0.8, 2.7, m.bend * 1.1, 0.18, 1);
  const eyeFill = filling.key === 'sesame' ? '#0E1330' : INK;
  const part = (id) => (id && OUTFIT[id] ? OUTFIT[id].svg : '');
  const top = Math.min(-122, by - 122);
  return `<svg viewBox="-70 ${top} 140 ${10 - top}" width="${size}" height="${(size * (10 - top)) / 140}" aria-hidden="true">
    <g fill="none" stroke-linecap="round"><path d="M-40 -42 Q-54 -30 -57 -24" stroke="${INK}" stroke-width="6.4"/><path d="M-40 -42 Q-54 -30 -57 -24" stroke="${filling.body}" stroke-width="3"/>
    <path d="M40 -42 Q54 -30 57 -24" stroke="${INK}" stroke-width="6.4"/><path d="M40 -42 Q54 -30 57 -24" stroke="${filling.body}" stroke-width="3"/></g>
    <circle cx="-57" cy="-24" r="7" fill="${filling.body}" stroke="${INK}" stroke-width="2.8"/><circle cx="57" cy="-24" r="7" fill="${filling.body}" stroke="${INK}" stroke-width="2.8"/>
    <ellipse cx="-19" cy="-5" rx="13.5" ry="8" fill="${FOOT}" stroke="${INK}" stroke-width="3.2"/><ellipse cx="19" cy="-5" rx="13.5" ry="8" fill="${FOOT}" stroke="${INK}" stroke-width="3.2"/>
    <ellipse cx="0" cy="-46" rx="50" ry="43" fill="${filling.body}" stroke="${INK}" stroke-width="3.6"/>
    <ellipse cx="-29" cy="-37" rx="8" ry="5" fill="${filling.blush}" opacity=".9"/><ellipse cx="29" cy="-37" rx="8" ry="5" fill="${filling.blush}" opacity=".9"/>
    ${part(outfit.neck)}${EYES[eyes](eyeFill)}${MOUTH[mouth]()}${part(outfit.face)}${part(outfit.head)}
    <g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${w1}" stroke="${INK}" stroke-width="6.6"/><path d="${w1}" stroke="${STEAM}" stroke-width="3.4"/><path d="${w2}" stroke="${INK}" stroke-width="6.6"/><path d="${w2}" stroke="${STEAM}" stroke-width="3.4"/></g>
  </svg>`;
}
