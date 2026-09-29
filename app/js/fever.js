// 连击热度 (fever) and 连击大奖 (jackpot), the slot-machine layer of a long combo.
// - Border lights: two rings of bulbs along the screen edge (in the gutter outside the card and
//   keypad) that blink against each other; faster and hotter with the fever level. Opacity only.
// - Jackpot: at a combo milestone a three-reel slot drops into the stage, the reels roll and stop
//   one after another on the same symbol (fixed by the combo, never a roll), then "N 连击！" slams in.
//   It never covers the card or the keypad and never blocks input.
import { tween, wait, easeOutBack, easeInCubic } from './core.js';
import { JACKPOT_SYMBOLS } from './showplan.js';

const INK = '#172754';
const SYM = {
  coin: `<circle cx="20" cy="20" r="14" fill="#FFD447" stroke="${INK}" stroke-width="3"/><circle cx="20" cy="20" r="9" fill="none" stroke="#E8A317" stroke-width="2"/><rect x="17.5" y="12" width="5" height="16" rx="2" fill="#FFF3A0"/>`,
  star: `<path d="M20 4 L24.7 14.6 L36 15.6 L27.4 23.2 L30 34.5 L20 28.5 L10 34.5 L12.6 23.2 L4 15.6 L15.3 14.6Z" fill="#FFD447" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`,
  gem: `<path d="M20 5 L33 16 L20 35 L7 16Z" fill="#3D8BFF" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><path d="M7 16 H33 M20 5 L15 16 L20 35" fill="none" stroke="#BFE0FF" stroke-width="2"/>`,
  heart: `<path d="M20 33 C6 24 5 14 11 10 C15 7 19 9 20 13 C21 9 25 7 29 10 C35 14 34 24 20 33Z" fill="#FF5A8A" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><circle cx="14" cy="14" r="2.4" fill="#fff" opacity=".8"/>`,
  ty: `<ellipse cx="13" cy="33" rx="5" ry="3" fill="#FF782D" stroke="${INK}" stroke-width="2.2"/><ellipse cx="27" cy="33" rx="5" ry="3" fill="#FF782D" stroke="${INK}" stroke-width="2.2"/><ellipse cx="20" cy="21" rx="16" ry="13" fill="#FFD447" stroke="${INK}" stroke-width="3"/><path d="M13 19 q2.5 -3 5 0 M22 19 q2.5 -3 5 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><path d="M16 24 q4 5 8 0Z" fill="#EE4B3E" stroke="${INK}" stroke-width="1.6"/><ellipse cx="10" cy="24" rx="2.6" ry="1.6" fill="#FF9A52"/><ellipse cx="30" cy="24" rx="2.6" ry="1.6" fill="#FF9A52"/>`,
};
const REPEAT = 4; // symbol list repeated in each strip (room to roll forward)
const N = JACKPOT_SYMBOLS.length;

export class Fever {
  constructor(root = document.body) {
    this.body = root; this.level = 0; this.run = 0;
    const el = document.createElement('div'); el.className = 'jackpot'; el.hidden = true; el.setAttribute('aria-hidden', 'true');
    const cells = JACKPOT_SYMBOLS.map((k) => `<i><svg viewBox="0 0 40 40">${SYM[k]}</svg></i>`).join('');
    el.innerHTML = `<div class="jp-box"><b class="jp-cap">连击大奖</b>${[0, 1, 2].map(() => `<div class="jp-win"><div class="jp-strip">${cells.repeat(REPEAT)}</div></div>`).join('')}</div><div class="jp-text"></div>`;
    document.getElementById('cutins').appendChild(el);
    this.el = el; this.strips = [...el.querySelectorAll('.jp-strip')]; this.text = el.querySelector('.jp-text');
  }

  // 0 = off. The body gets fever-1 … fever-4 (style.css draws the lights).
  set(level) {
    if (level === this.level) return;
    this.body.classList.remove(`fever-${this.level}`);
    this.level = level;
    if (level > 0) this.body.classList.add(`fever-${level}`);
  }

  place(strip, pos) { strip.style.transform = `translateY(${(-(pos / (N * REPEAT)) * 100).toFixed(3)}%)`; }

  // at: { x, y } centre in page px; size: reel window height; audio for the clicks.
  async jackpot({ combo, symbol, at, size = 48, audio = null, onWin = null }) {
    const run = ++this.run; const el = this.el;
    el.style.setProperty('--jh', `${Math.round(size)}px`);
    el.style.left = `${at.x.toFixed(0)}px`; el.style.top = `${at.y.toFixed(0)}px`;
    this.text.textContent = `${combo} 连击！`;
    this.text.style.opacity = 0;
    el.hidden = false;
    this.body.classList.add('jackpot-on');
    const starts = this.strips.map(() => Math.floor(Math.random() * N));
    this.strips.forEach((s, i) => this.place(s, starts[i]));
    await tween(220, (k) => { el.style.transform = `translate(-50%, -50%) translateY(${((1 - k) * -40).toFixed(1)}px) scale(${(0.5 + 0.5 * k).toFixed(3)})`; el.style.opacity = Math.min(1, k * 2); }, easeOutBack);
    if (run !== this.run) return;
    // The three reels roll together and stop left to right, all on the same symbol.
    let lastTick = 0;
    const stops = this.strips.map((s, i) => {
      const from = starts[i]; const to = N * (REPEAT - 1) + symbol;
      return tween(420 + 170 * i, (k) => {
        if (run !== this.run) return;
        const p = from + (to - from) * k; this.place(s, p);
        const t = Math.floor(p); if (i === 2 && t !== lastTick) { lastTick = t; audio?.reelTick(); }
      }, (k) => 1 + 1.4 * (k - 1) ** 3 + 0.4 * (k - 1) ** 2).then(() => {
        if (run !== this.run) return;
        audio?.reelStop(i);
        s.parentElement.animate([{ transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 160, easing: 'ease-out' });
      });
    });
    await Promise.all(stops);
    if (run !== this.run) return;
    el.classList.add('win');
    onWin?.();
    this.text.animate([{ transform: 'translateX(-50%) scale(2.4) rotate(-6deg)', opacity: 0 }, { transform: 'translateX(-50%) scale(.92) rotate(-6deg)', opacity: 1, offset: 0.7 }, { transform: 'translateX(-50%) scale(1) rotate(-6deg)', opacity: 1 }], { duration: 260, easing: 'ease-out', fill: 'forwards' });
    await wait(780);
    if (run !== this.run) return;
    this.body.classList.remove('jackpot-on');
    await tween(200, (k) => { el.style.opacity = 1 - k; el.style.transform = `translate(-50%, -50%) scale(${(1 + 0.2 * k).toFixed(3)})`; }, easeInCubic);
    if (run !== this.run) return;
    el.hidden = true; el.classList.remove('win');
  }

  // Put everything away at once (screen change, combo broken on a new round).
  stop() { this.run += 1; this.el.hidden = true; this.el.classList.remove('win'); this.body.classList.remove('jackpot-on'); this.set(0); }

  // Draw the reel box and the lights once (nearly invisible) at boot.
  prewarm() {
    const el = this.el; el.hidden = false; el.style.cssText += ';left:40px;top:40px;opacity:.004;--jh:48px';
    this.text.textContent = '0123456789 连击！';
    this.body.classList.add('fever-4', 'jackpot-on', 'fever-warm');
    return () => { el.hidden = true; this.text.textContent = ''; this.body.classList.remove('fever-4', 'jackpot-on', 'fever-warm'); this.level = 0; };
  }
}
