// 蒸笼开箱 on the result screen, in five parts:
//   1. 升档: the steamer drops in, then hops once per tier it climbs (白 → 蓝 → 紫 → 金 → 彩虹),
//      spinning in the air from 蓝 on and landing with a squash, a flash and a ring of sparks.
//   2. 蓄力 (~1 s): it shakes harder and harder, light leaks from under the lid, sparks are pulled
//      in, a riser climbs; a last hard squash.
//   3. 爆发: the lid flies off with a bloom flash (screen blend, never above 0.8), a shake and a
//      push-in, three-layer shock waves, streaks, spinning coins and jewels (confetti only for 彩虹).
//   4. 喷涌: coins, jewels, stars and little 汤圆 pour out of the steamer (Vampire Survivors style)
//      while candidates roll in the prize window like a slot reel.
//   5. 揭晓: the prize (decided beforehand by chest.js / collection.js, never at random) flies out on
//      an arc, overshoots and settles; 金 / 彩虹 get a flowing rainbow frame and a NEW! badge.
// How big each part is comes from showplan.gushPlan(tier). A tap speeds everything up; only
// transform / opacity change while it plays.
import { tween, wait, onFrame, rand, pick, easeOutBack, easeOutCubic, easeInCubic, easeInOutCubic, VP } from './core.js';
import { FX } from './fx.js';
import { Q } from './quality.js';
import { TIERS, GOALS } from './chest.js';
import { ITEMS } from './collection.js';
import { STEAMER_SVG, itemIcon } from './art.js';
import { tangyuanSVG } from './tangyuan.js';
import { fmtSweetValue } from './scoring.js';
import { gushPlan } from './showplan.js';

const $ = (s) => document.querySelector(s);

// Picture of an item (outfits: a 汤圆 wearing it).
export function prizeSVG(item, size = 120) {
  if (!item || item.gift) return `<svg viewBox="0 0 48 48" aria-hidden="true"><ellipse cx="24" cy="38" rx="17" ry="5" fill="#E8A317" stroke="#172754" stroke-width="2.4"/><ellipse cx="24" cy="33" rx="17" ry="5" fill="#FFD447" stroke="#172754" stroke-width="2.4"/><ellipse cx="24" cy="27" rx="15" ry="4.6" fill="#FFD447" stroke="#172754" stroke-width="2.4"/><ellipse cx="22" cy="21" rx="13" ry="4.2" fill="#FFE38A" stroke="#172754" stroke-width="2.4"/><path d="M34 8 l2 5 5 1 -4 3 1 5 -4 -3 -4 3 1 -5 -4 -3 5 -1z" fill="#fff" stroke="#172754" stroke-width="1.6"/></svg>`;
  if (item.cat === 'outfit') return tangyuanSVG({ outfit: { [item.slot]: item.id }, eyes: 'happy', mouth: 'grin', mood: 'happy', size });
  return itemIcon(item);
}

let fxLocal = null; let offFrame = null;
// Silhouettes for the slot-reel roll (built once: rebuilding the SVGs every step costs layouts).
let rollPics = null;

// The chest's own particle canvas, created and warmed up at boot (allocating a full-screen canvas
// and its sprites the moment the chest opens used to cost a long frame).
export function warmChest() {
  if (fxLocal) return;
  const box = $('#chest');
  const cv = document.createElement('canvas'); cv.className = 'ch-fx';
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0';
  box.prepend(cv); fxLocal = new FX(cv, { max: () => Math.round(Q.p.partCap * 1.6) });
  fxLocal.prewarm();
  rollPics = ITEMS.map((it) => `<div class="prize-roll">${prizeSVG(it, 96)}</div>`);
}

// Letters of a title slam in one by one with a bounce.
function slam(el, text, still) {
  el.textContent = '';
  [...text].forEach((ch, i) => {
    const s = document.createElement('i'); s.textContent = ch; el.appendChild(s);
    if (!still) s.animate([{ transform: 'translateY(-24px) scale(2.4)', opacity: 0 }, { transform: 'scale(.86)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 300, delay: 45 * i, easing: 'cubic-bezier(.3,1.5,.5,1)', fill: 'backwards' });
  });
}

export function playChest({ tier, goals = [], reward, audio, still = false, auto = false, fresh = true }) {
  const box = $('#chest');
  warmChest();
  const fx2 = fxLocal; fx2.clear(); fx2.motion = still ? 0 : 1;
  offFrame?.(); offFrame = onFrame((dt) => { fx2.update(dt); fx2.draw(); });
  const steamer = $('#ch-steamer'); steamer.innerHTML = `${STEAMER_SVG}<i class="ch-leak"></i>`;
  const lid = steamer.querySelector('.st-lid'); const leak = steamer.querySelector('.ch-leak');
  const stageEl = $('#ch-stage'); const bloom = $('#ch-bloom'); const pillars = $('#ch-pillars');
  const prize = $('#ch-prize'); const glow = $('#ch-glow'); const beams = $('#ch-beams'); const beams2 = $('#ch-beams2');
  const tierEl = $('#ch-tier'); const nameEl = $('#ch-name'); const ok = $('#ch-ok'); const goalsEl = $('#ch-goals');
  const skipEl = $('#ch-skip');
  const plan = gushPlan(tier);
  prize.style.transform = 'translateX(-50%) scale(0)'; prize.innerHTML = '';
  tierEl.textContent = ''; nameEl.innerHTML = ''; goalsEl.innerHTML = ''; ok.hidden = true; skipEl.hidden = still;
  box.classList.remove('rainbow', 'pillars-on');
  beams.style.opacity = 0; beams2.style.opacity = 0; glow.style.opacity = 0.3; beams.style.transform = ''; beams2.style.transform = '';
  bloom.style.opacity = 0; leak.style.opacity = 0; steamer.style.transform = ''; stageEl.style.transform = '';
  box.hidden = false;
  let fast = false;
  const T = (ms) => (fast ? ms / 4 : ms);
  const step = (ms) => wait(T(ms));
  const onDown = (e) => { if (e.target.closest('#ch-ok')) return; fast = true; };
  box.addEventListener('pointerdown', onDown);
  const loops = [];

  const setTier = (t) => {
    const T0 = TIERS[t];
    box.style.setProperty('--tc', T0.color); box.style.setProperty('--tg', T0.glow);
    box.classList.toggle('rainbow', t === 4);
    glow.style.opacity = (0.35 + 0.13 * t).toFixed(2);
    beams.style.opacity = (0.12 + 0.14 * t).toFixed(2);
    beams2.style.opacity = (0.08 * t).toFixed(2);
    slam(tierEl, `${T0.name}蒸笼${t ? '！' : ''}`, still);
  };
  // The steamer's mouth (under the lid), measured once it has landed (never while it moves).
  let mouth = { x: VP.w / 2, y: VP.h * 0.4 };
  const measure = () => {
    const r = steamer.getBoundingClientRect();
    mouth = { x: r.left + r.width / 2, y: r.top + r.height * 0.56 };
    const b = box.getBoundingClientRect();
    bloom.style.setProperty('--by', `${(mouth.y - b.top).toFixed(0)}px`);
  };
  const flash = (v, ms = 420) => tween(T(ms), (k) => { bloom.style.opacity = (v * (1 - k)).toFixed(3); }, easeOutCubic);

  return new Promise((resolve) => {
    const finish = () => {
      box.removeEventListener('pointerdown', onDown);
      for (const a of loops) a.cancel();
      box.hidden = true; box.classList.remove('pillars-on'); offFrame?.(); offFrame = null; fx2.clear();
      resolve();
    };
    const showPrize = () => {
      const rare = tier >= 3 && !reward.gift;
      prize.innerHTML = `<div class="prize-frame"><div class="prize-ring${rare ? ' rare' : ''}"><div class="prize-card">${prizeSVG(reward)}</div></div>${rare ? '<b class="new-badge">NEW!</b>' : ''}</div>`;
      nameEl.innerHTML = reward.gift
        ? `甜度大礼包 +${fmtSweetValue(reward.sweet)}<small>${TIERS[tier].name}奖励已经全部收集，送你一份甜度</small>`
        : `${reward.name}<small>${fresh ? '新收藏！可以在首页“收藏”里换上' : '（调试：不保存）'}</small>`;
      goalsEl.innerHTML = goals.length ? goals.map((id) => `<li class="got">${GOALS.find((g) => g.id === id).text}</li>`).join('') : '<li>做完了一局</li>';
      audio?.chestReveal(tier);
      ok.hidden = false;
      const close = () => { ok.removeEventListener('click', close); finish(); };
      ok.addEventListener('click', close);
      return close;
    };

    if (still) {
      setTier(tier); lid.style.opacity = 0; prize.style.transform = 'translateX(-50%) scale(1)';
      const close = showPrize();
      if (auto) wait(900).then(close);
      return;
    }

    (async () => {
      // 1. The steamer drops in, then climbs tier by tier.
      await tween(T(260), (k) => { steamer.style.transform = `translateY(${(1 - k) * -90}px)`; steamer.style.opacity = Math.min(1, k * 2); }, easeOutBack);
      steamer.style.transform = '';
      measure();
      audio?.chestShake(0.3);
      for (let t = 0; t <= tier; t++) {
        const spin = t > 0; const h = 46 + 10 * t;
        audio?.whoosh?.();
        await tween(T(300), (k) => {
          const y = -Math.sin(k * Math.PI) * h; const r = spin ? 360 * easeInOutCubic(k) : 0;
          steamer.style.transform = `translateY(${y.toFixed(1)}px) rotate(${r.toFixed(1)}deg) scale(${(1 - 0.08 * Math.sin(k * Math.PI)).toFixed(3)}, ${(1 + 0.08 * Math.sin(k * Math.PI)).toFixed(3)})`;
        }, (k) => k);
        setTier(t);
        audio?.chestStep(t);
        flash(0.3 + 0.08 * t);
        fx2.ring(mouth.x, mouth.y, { color: TIERS[t].color, radius: 120 + 20 * t, width: 8 });
        fx2.burst(mouth.x, mouth.y, { count: 16 + 8 * t, kinds: ['spark', 'star', 'twinkle'], speed: 460, up: 120, life: 0.7, colors: [TIERS[t].color, '#FFFFFF'] });
        fx2.puff(mouth.x + rand(-50, 50), mouth.y, 4 + t);
        tween(T(260), (k) => { glow.style.transform = `scale(${(1 + 0.3 * Math.sin(k * Math.PI)).toFixed(3)})`; });
        await tween(T(200), (k) => { const s = Math.sin(k * Math.PI) * (1 - k * 0.4); steamer.style.transform = `scale(${(1 + 0.16 * s).toFixed(3)}, ${(1 - 0.2 * s).toFixed(3)})`; }, (k) => k);
        steamer.style.transform = '';
        prize.innerHTML = pick(rollPics); prize.style.transform = 'translateX(-50%) scale(.5)';
        await step(t < tier ? 160 : 60);
      }
      prize.style.transform = 'translateX(-50%) scale(0)';

      // 2. Charge: shaking harder and harder, light leaking from under the lid, sparks pulled in.
      const chargeMs = T(1000);
      audio?.chestCharge(chargeMs / 1000);
      let pulls = 0; let rattle = 0;
      await tween(chargeMs, (k) => {
        const a = 1 + 7 * k * k;
        steamer.style.transform = `translate(${(Math.sin(k * 90) * a * 0.6).toFixed(1)}px, ${(-Math.abs(Math.sin(k * 70)) * a * 0.4).toFixed(1)}px) rotate(${(Math.sin(k * 60) * a * 0.5).toFixed(2)}deg)`;
        lid.style.transform = `translateY(${(-Math.abs(Math.sin(k * 55)) * (2 + 6 * k)).toFixed(1)}px) rotate(${(Math.sin(k * 47) * (1 + 4 * k)).toFixed(2)}deg)`;
        leak.style.opacity = Math.min(1, k * 1.3).toFixed(3);
        leak.style.transform = `scale(${(0.6 + 0.6 * k).toFixed(3)}, ${(0.5 + 1.2 * k).toFixed(3)})`;
        glow.style.transform = `scale(${(1 + 0.3 * k).toFixed(3)})`;
        if (k * 6 > pulls) { pulls += 1; fx2.suck(mouth.x, mouth.y, { count: 10 + 3 * tier, radius: 150 + 30 * tier, life: 0.55, colors: ['#FFFFFF', TIERS[tier].glow, TIERS[tier].color] }); }
        if (k * 8 > rattle) { rattle += 1; audio?.chestShake(k); }
      }, (k) => k);
      lid.style.transform = '';
      await tween(T(110), (k) => { steamer.style.transform = `scale(${(1 + 0.18 * k).toFixed(3)}, ${(1 - 0.24 * k).toFixed(3)})`; }, easeInCubic);

      // 3. Burst.
      audio?.chestBurst(tier);
      setTier(tier);
      skipEl.hidden = true;
      bloom.style.opacity = 0.8; flash(0.8, 650);
      tween(T(180), (k) => { steamer.style.transform = `scale(${(1.18 - 0.18 * k).toFixed(3)}, ${(0.76 + 0.24 * easeOutBack(k)).toFixed(3)})`; }).then(() => { steamer.style.transform = ''; });
      tween(T(460), (k) => { lid.style.transform = `translateY(${-k * 190}%) rotate(${-k * 40}deg)`; lid.style.opacity = 1 - k * 0.9; }, easeOutCubic);
      leak.style.opacity = 0;
      // Shake and push in (the stage only; the backdrop stays).
      tween(T(520), (k) => {
        const a = 14 * (1 - k) * (1 + tier * 0.2); const z = 1 + 0.12 * Math.sin(Math.min(1, k * 2) * Math.PI) * (0.6 + 0.1 * tier);
        stageEl.style.transform = `translate(${rand(-a, a).toFixed(1)}px, ${rand(-a, a).toFixed(1)}px) scale(${z.toFixed(3)})`;
      }, (k) => k).then(() => { stageEl.style.transform = ''; });
      for (let i = 0; i < plan.shocks; i++) fx2.shock(mouth.x, mouth.y, { color: i ? TIERS[tier].glow : TIERS[tier].color, radius: 190 + 70 * i + 20 * tier, delay: 0.08 * i });
      fx2.streaks(mouth.x, mouth.y, { count: plan.streaks, speed: 1500 + 150 * tier, colors: ['#FFFFFF', TIERS[tier].glow, TIERS[tier].color] });
      fx2.burst(mouth.x, mouth.y, { count: 40 + 18 * tier, kinds: plan.kinds, speed: 820 + 90 * tier, up: 300, life: 1.2 });
      fx2.burst(mouth.x, mouth.y, { count: 18 + 6 * tier, kinds: ['glow', 'twinkle', 'spark'], speed: 700, up: 60, life: 0.8, colors: ['#FFFFFF', TIERS[tier].glow] });
      if (plan.confetti) { fx2.streamers(VP.w, VP.h, 10); fx2.rain(VP.w, 70, ['confetti', 'confetti', 'star', 'heart']); }
      beams.style.opacity = (0.3 + 0.14 * tier).toFixed(2);
      loops.push(beams.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 9000, iterations: Infinity }));
      loops.push(beams2.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(-360deg)' }], { duration: 14000, iterations: Infinity }));
      await step(160);

      // 4. Gush: the steamer pours out, the prize window rolls like a slot reel and slows down.
      box.classList.add('pillars-on');
      fx2.fountain(mouth.x, mouth.y, { ms: T(plan.ms), rate: plan.rate, kinds: plan.kinds, spread: 0.95, speed: 1050 + 60 * tier, life: 1.1 });
      audio?.gush(T(plan.ms) / 1000, tier);
      let left = T(plan.ms) * 0.85; let gap = 55;
      prize.style.transform = 'translateX(-50%) translateY(-18%) scale(.72)';
      while (left > 0) {
        prize.innerHTML = pick(rollPics);
        await wait(gap);
        left -= gap; gap = Math.min(170, gap * 1.1);
      }

      // 5. Reveal: the prize flies out on an arc, overshoots and settles with a wobble.
      const close = showPrize();
      fx2.shock(mouth.x, mouth.y - 60, { color: TIERS[tier].glow, radius: 150 });
      fx2.burst(mouth.x, mouth.y - 60, { count: 26 + 8 * tier, kinds: ['twinkle', 'star', 'coin'], speed: 520, up: 160, life: 0.9 });
      await tween(T(520), (k) => {
        // Up out of the steamer, over the top and down into place (translateY in % of the card).
        const y = 40 * (1 - k) - 62 * Math.sin(k * Math.PI);
        const s = 0.2 + 0.8 * easeOutBack(k); const r = (1 - k) * -18;
        prize.style.transform = `translateX(-50%) translateY(${y.toFixed(1)}%) rotate(${r.toFixed(1)}deg) scale(${s.toFixed(3)})`;
      }, (k) => k);
      await tween(T(420), (k) => { const w = Math.sin(k * Math.PI * 3) * (1 - k); prize.style.transform = `translateX(-50%) rotate(${(w * 6).toFixed(2)}deg) scale(${(1 + w * 0.04).toFixed(3)})`; }, (k) => k);
      prize.style.transform = 'translateX(-50%)';
      if (auto) wait(1100).then(close);
    })();
  });
}
