// 落格印章: a small stamp that pops up above the card's top edge, over the column of each correct
// digit, and floats away. It lives in #cutins (above the actors) and is placed entirely above the
// card, so it never touches the problem. Looks (showplan.stampLook): a steaming 汤圆 smile, a
// flower with a tick (E ≥ 0.45), the flower with rainbow petals and a gold ring (E > 0.85).
// A pool of DOM nodes, animated with transform / opacity (Web Animations) only.
import { SPEED, rand } from './core.js';

const RED = '#E8412F';
const INK = '#172754';
const petals = (colors, ring) => {
  let d = '';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2; const c = colors[i % colors.length];
    d += `<circle cx="${(Math.cos(a) * 13).toFixed(1)}" cy="${(Math.sin(a) * 13).toFixed(1)}" r="6.2" fill="${c}" stroke="${ring}" stroke-width="2.2"/>`;
  }
  return d;
};
const TICK = `<path d="M-5 0.5 L-1.2 4.5 L6 -4" fill="none" stroke="${RED}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`;
const LOOKS = {
  smile: `<path d="M-5 -19 q-2.5 -3 0 -6 q2.5 -3 0 -6 M4 -18 q-2 -2.5 0 -5 q2 -2.5 0 -5" fill="none" stroke="${RED}" stroke-width="2.2" stroke-linecap="round"/>
    <circle r="14.5" fill="#FFF7F2" stroke="${RED}" stroke-width="3.2"/><circle r="11" fill="none" stroke="${RED}" stroke-width="1.3"/>
    <path d="M-7 -2 q2.5 -3.5 5 0 M2 -2 q2.5 -3.5 5 0" fill="none" stroke="${RED}" stroke-width="2.2" stroke-linecap="round"/><path d="M-4.5 3 q4.5 5 9 0" fill="none" stroke="${RED}" stroke-width="2.2" stroke-linecap="round"/>`,
  flower: `${petals(['#FFD6E4', '#FFE3EC'], RED)}<circle r="9.5" fill="#FFFDF7" stroke="${RED}" stroke-width="2.6"/>${TICK}`,
  rainbow: `${petals(['#FF5A6E', '#FFA63D', '#FFD447', '#3FB860', '#2E8BFF', '#8B4DFF', '#FF5DA2', '#FF8FB8'], INK)}<circle r="10" fill="#FFF6C8" stroke="#E8A317" stroke-width="3"/>${TICK}`,
};

export class DigitStamps {
  constructor(parent, n = 5) {
    this.pool = []; this.i = 0;
    for (let k = 0; k < n; k++) {
      const el = document.createElement('div'); el.className = 'dstamp'; el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '<svg viewBox="-24 -24 48 48"></svg>'; el.style.opacity = 0;
      parent.appendChild(el); this.pool.push({ el, svg: el.firstChild, look: '' });
    }
  }

  // x: the column centre; bottom: the lowest the stamp may reach (above the card's top edge);
  // size in px; look: 'smile' | 'flower' | 'rainbow'.
  pop(x, bottom, look, size = 30) {
    const s = this.pool[this.i]; this.i = (this.i + 1) % this.pool.length;
    if (s.look !== look) { s.look = look; s.svg.innerHTML = LOOKS[look]; }
    s.anim?.cancel();
    const el = s.el; el.style.width = `${size}px`; el.style.height = `${size}px`;
    const x0 = x - size / 2; const y0 = bottom - size; const r = rand(-10, 10);
    const at = (dy, sc, rot) => `translate(${x0.toFixed(1)}px, ${(y0 + dy).toFixed(1)}px) rotate(${rot.toFixed(1)}deg) scale(${sc})`;
    s.anim = el.animate([
      { transform: at(-10, 2.2, r - 20), opacity: 0 },
      { transform: at(0, 0.88, r), opacity: 1, offset: 0.22 },
      { transform: at(0, 1.08, r), opacity: 1, offset: 0.34 },
      { transform: at(0, 1, r), opacity: 1, offset: 0.62 },
      { transform: at(-22, 0.8, r + 8), opacity: 0 },
    ], { duration: 760 / SPEED, easing: 'ease-out', fill: 'forwards' });
  }

  // Put every stamp away (a new problem is coming in).
  clear() { for (const s of this.pool) { s.anim?.cancel(); s.anim = null; s.el.style.opacity = 0; } }

  // Draw every look once (nearly invisible) at boot.
  prewarm() {
    Object.keys(LOOKS).forEach((look, k) => {
      const s = this.pool[k % this.pool.length]; s.look = look; s.svg.innerHTML = LOOKS[look];
      s.el.style.cssText = `width:30px;height:30px;opacity:.004;transform:translate(${40 * k}px, 0px)`;
    });
    return () => { for (const s of this.pool) s.el.style.opacity = 0; };
  }
}
