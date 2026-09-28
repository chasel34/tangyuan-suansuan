// 升级 · 三选一 overlay. Full screen (allowed to cover the card); the game clock is held by the
// caller. Intro ~0.8 s (a tap skips it), then three cards; resolves with the chosen perk id.
import { tween, wait, later, easeOutBack, easeOutCubic, SPEED } from './core.js';

const $ = (s) => document.querySelector(s);

export const PERK_LOOK = {
  sweet20: { glyph: '甜', color: '#FFB3CF' },
  more: { glyph: '甜', color: '#FFB3CF' },
  coins: { glyph: '币', color: '#FFD447' },
  gong: { glyph: '锣', color: '#F2B63B' },
  confetti: { glyph: '彩', color: '#8FE8C4' },
  shades: { glyph: '镜', color: '#A9C1FF' },
  fireworks: { glyph: '烟', color: '#FF9A52' },
  early: { glyph: '倍', color: '#FFE07A' },
  magnet: { glyph: '磁', color: '#FF8FB8' },
  cheer: { glyph: '欢', color: '#C9A6FF' },
};

// level: the new level; choices: 3 perks; opts.auto: pick the first by itself (demo);
// opts.still: no motion (cards appear at once).
export function showLevelUp(level, choices, { audio, auto = false, still = false } = {}) {
  const box = $('#levelup'); const cards = $('#lu-cards'); const banner = $('#lu-banner');
  $('#lu-level').textContent = `Lv ${level}`;
  cards.innerHTML = '';
  choices.forEach((p, i) => {
    const look = PERK_LOOK[p.id] || PERK_LOOK.sweet20;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'lu-card'; b.dataset.i = i;
    b.innerHTML = `<span class="pk-ico" style="--pc:${look.color}">${look.glyph}</span><b>${p.name}</b><small>${p.desc}</small>`;
    cards.appendChild(b);
  });
  box.hidden = false;
  audio?.levelUp();
  return new Promise((resolve) => {
    let ready = false; let done = false; let skip = null;
    const cardEls = [...cards.children];
    const showCards = () => {
      if (ready) return; ready = true;
      $('#lu-tip').style.opacity = 1;
      cardEls.forEach((el, i) => {
        if (still) { el.style.transform = ''; el.style.opacity = 1; return; }
        el.style.opacity = 1;
        later(70 * i, () => tween(300, (k) => { el.style.transform = `translateY(${(1 - k) * 60}px) scale(${0.6 + 0.4 * k}) rotate(${(1 - k) * (i - 1) * 8}deg)`; }, easeOutBack));
      });
      if (auto) later(700, () => pick(0));
    };
    const pick = (i) => {
      if (done || !ready) return; done = true;
      const el = cardEls[i]; el.classList.add('picked');
      audio?.pick();
      const fin = () => { box.hidden = true; box.removeEventListener('pointerdown', onDown); resolve(choices[i].id); };
      if (still) { fin(); return; }
      cardEls.forEach((c, j) => { if (j !== i) tween(200, (k) => { c.style.opacity = 1 - k; c.style.transform = `scale(${1 - 0.2 * k})`; }); });
      tween(380, (k) => { el.style.transform = `translateY(${-k * 70}px) scale(${1 + 0.15 * Math.sin(k * Math.PI)})`; el.style.opacity = 1 - Math.max(0, k - 0.6) / 0.4; }, easeOutCubic).then(fin);
    };
    const onDown = (e) => {
      const c = e.target.closest('.lu-card');
      if (!ready) { if (skip) skip(); showCards(); return; }
      if (c) pick(Number(c.dataset.i));
    };
    box.addEventListener('pointerdown', onDown);
    const onKey = (e) => { if (!box.hidden && ready && ['1', '2', '3'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); pick(Number(e.key) - 1); } };
    addEventListener('keydown', onKey, { capture: true });
    const cleanup = () => removeEventListener('keydown', onKey, { capture: true });
    const origResolve = resolve; resolve = (v) => { cleanup(); origResolve(v); };
    cardEls.forEach((el) => { el.style.opacity = 0; });
    $('#lu-tip').style.opacity = 0;
    if (still) { banner.style.transform = ''; showCards(); return; }
    // Intro: the banner slams in, then the cards.
    let cancelled = false; skip = () => { cancelled = true; banner.style.transform = 'rotate(-4deg)'; };
    tween(320, (k) => { if (!cancelled) banner.style.transform = `rotate(-4deg) scale(${2.4 - 1.4 * k})`; banner.style.opacity = Math.min(1, k * 3); }, easeOutBack)
      .then(() => wait(380)).then(() => { if (!ready) showCards(); });
  });
}
