// Slot-machine reels (DOM): the 甜度 counter and the 连击倍率 window.
// Each digit is a vertical strip that rolls, slows down and stops with a "咔". Only transforms
// change while rolling (compositor-friendly), and the motion runs on virtual time, so ?speed and
// freezeAfter() catch any moment.
import { tween, easeOutCubic, easeOutBack } from './core.js';

const DIGITS = '0123456789';

export class Reel {
  // el: the container; opts.onStop(i) for the stop click, opts.onTick() while rolling.
  constructor(el, { onStop = null, onTick = null } = {}) {
    this.el = el; this.onStop = onStop; this.onTick = onTick;
    this.text = ''; this.cols = []; this.instant = false; this.run = 0;
    el.classList.add('reel');
  }

  // Build the characters of text: digits become columns, anything else a static glyph.
  build(text) {
    this.el.textContent = '';
    this.cols = [];
    for (const ch of text) {
      if (DIGITS.includes(ch)) {
        const col = document.createElement('span'); col.className = 'rc';
        const strip = document.createElement('span'); strip.className = 'rs';
        // 0-9 twice: rolling forward always has room.
        strip.textContent = '';
        for (let r = 0; r < 2; r++) for (const d of DIGITS) { const s = document.createElement('i'); s.textContent = d; strip.appendChild(s); }
        col.appendChild(strip); this.el.appendChild(col);
        this.cols.push({ col, strip, pos: Number(ch), digit: Number(ch) });
      } else {
        const s = document.createElement('span'); s.className = 'rg'; s.textContent = ch; this.el.appendChild(s);
        this.cols.push(null);
      }
    }
    for (const c of this.cols) if (c) this.place(c, c.pos);
    this.text = text;
  }

  // The strip holds 20 glyphs, so one glyph is 5% of its height.
  place(c, pos) { c.strip.style.transform = `translateY(${(-(pos % 10) * 5).toFixed(3)}%)`; }

  // Show text. Columns whose digit changed roll forward; lower digits (to the right) take extra
  // turns and stop later, like a real counter.
  set(text, { animate = true, big = false } = {}) {
    if (text === this.text) return;
    const same = this.text.length === text.length && [...this.text].every((ch, i) => DIGITS.includes(ch) === DIGITS.includes(text[i]) && (DIGITS.includes(ch) || ch === text[i]));
    if (!same || !animate || this.instant) {
      const old = this.text;
      this.build(text);
      if (animate && !this.instant && old) this.el.animate([{ transform: 'translateY(-30%)', opacity: 0.2 }, { transform: 'none', opacity: 1 }], { duration: 180 });
      return;
    }
    this.text = text;
    const run = ++this.run;
    const digitsIdx = this.cols.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
    let order = 0;
    for (let i = this.cols.length - 1; i >= 0; i--) {
      const c = this.cols[i]; if (!c) continue;
      const target = Number(text[i]);
      if (target === c.digit && !big) continue;
      const fromRight = digitsIdx.length - 1 - digitsIdx.indexOf(i);
      const turns = big ? 1 : fromRight === 0 ? (target === c.digit ? 0 : 1) : 0;
      const start = c.pos % 10;
      let delta = (target - start + 10) % 10 + 10 * turns;
      if (delta === 0 && big) delta = 10;
      c.digit = target;
      const ms = (big ? 520 : 230) + 90 * order + (fromRight === 0 ? 60 : 0);
      order += 1;
      let lastTick = start;
      c.col.classList.add('rolling');
      tween(ms, (k) => {
        if (run !== this.run) return;
        const p = start + delta * k;
        c.pos = p; this.place(c, p);
        if (this.onTick && Math.floor(p) !== lastTick) { lastTick = Math.floor(p); this.onTick(); }
      }, easeOutCubic).then(() => {
        c.col.classList.remove('rolling');
        if (run !== this.run) return;
        c.pos = target; this.place(c, target);
        c.col.animate([{ transform: 'translateY(8%)' }, { transform: 'none' }], { duration: 120, easing: 'ease-out' });
        if (this.onStop) this.onStop(i);
      });
    }
  }
}

// The 连击倍率 window: one strip of labels (×1 ×1.5 ×2 ...) that rolls to the current tier.
export class MultReel {
  constructor(el, labels) {
    this.el = el; this.tier = 0; this.labels = labels;
    el.classList.add('mreel');
    this.strip = document.createElement('span'); this.strip.className = 'ms';
    for (const l of labels) { const s = document.createElement('i'); s.textContent = l; this.strip.appendChild(s); }
    el.appendChild(this.strip);
    this.pos = 0; this.place(0);
  }
  place(p) { this.strip.style.transform = `translateY(${(-p * (100 / this.labels.length)).toFixed(3)}%)`; }
  set(tier, { animate = true } = {}) {
    if (tier === this.tier) return;
    const from = this.pos; this.tier = tier;
    if (!animate) { this.pos = tier; this.place(tier); return; }
    tween(420, (k) => { this.pos = from + (tier - from) * k; this.place(this.pos); }, easeOutBack).then(() => { this.pos = tier; this.place(tier); });
  }
}
