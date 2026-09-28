// 蒸笼开箱 on the result screen: the lid rattles, the steam builds up, the light climbs
// 白 → 蓝 → 紫 → 金 → 彩虹 up to the tier the round earned, then the lid flies off and the prize
// (decided beforehand by chest.js / collection.js, never at random) comes out. A tap speeds it up.
// The rolling candidates during the climb are only decoration.
import { tween, wait, onFrame, rand, pick, easeOutBack, easeOutCubic, easeInCubic, VP } from './core.js';
import { FX } from './fx.js';
import { TIERS, GOALS } from './chest.js';
import { ITEMS } from './collection.js';
import { STEAMER_SVG, itemIcon } from './art.js';
import { tangyuanSVG } from './tangyuan.js';
import { fmtSweetValue } from './scoring.js';

const $ = (s) => document.querySelector(s);

// Picture of an item (outfits: a 汤圆 wearing it).
export function prizeSVG(item, size = 120) {
  if (!item || item.gift) return `<svg viewBox="0 0 48 48" aria-hidden="true"><ellipse cx="24" cy="38" rx="17" ry="5" fill="#E8A317" stroke="#172754" stroke-width="2.4"/><ellipse cx="24" cy="33" rx="17" ry="5" fill="#FFD447" stroke="#172754" stroke-width="2.4"/><ellipse cx="24" cy="27" rx="15" ry="4.6" fill="#FFD447" stroke="#172754" stroke-width="2.4"/><ellipse cx="22" cy="21" rx="13" ry="4.2" fill="#FFE38A" stroke="#172754" stroke-width="2.4"/><path d="M34 8 l2 5 5 1 -4 3 1 5 -4 -3 -4 3 1 -5 -4 -3 5 -1z" fill="#fff" stroke="#172754" stroke-width="1.6"/></svg>`;
  if (item.cat === 'outfit') return tangyuanSVG({ outfit: { [item.slot]: item.id }, eyes: 'happy', mouth: 'grin', mood: 'happy', size });
  return itemIcon(item);
}

let fxLocal = null; let offFrame = null;

// The chest's own particle canvas, created and warmed up at boot (allocating a full-screen canvas
// and its sprites the moment the chest opens used to cost a long frame).
export function warmChest() {
  if (fxLocal) return;
  const box = $('#chest');
  const cv = document.createElement('canvas'); cv.className = 'ch-fx';
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0';
  box.prepend(cv); fxLocal = new FX(cv);
  fxLocal.prewarm();
}

export function playChest({ tier, goals = [], reward, audio, still = false, auto = false, fresh = true }) {
  const box = $('#chest');
  warmChest();
  const fx2 = fxLocal; fx2.clear(); fx2.motion = still ? 0 : 1;
  offFrame?.(); offFrame = onFrame((dt) => { fx2.update(dt); fx2.draw(); });
  const steamer = $('#ch-steamer'); steamer.innerHTML = STEAMER_SVG;
  const lid = steamer.querySelector('.st-lid');
  const prize = $('#ch-prize'); const glow = $('#ch-glow'); const beams = $('#ch-beams');
  const tierEl = $('#ch-tier'); const nameEl = $('#ch-name'); const ok = $('#ch-ok'); const goalsEl = $('#ch-goals');
  const skipEl = $('#ch-skip');
  prize.style.transform = 'translateX(-50%) scale(0)'; prize.innerHTML = '';
  tierEl.textContent = ''; nameEl.innerHTML = ''; goalsEl.innerHTML = ''; ok.hidden = true; skipEl.hidden = still;
  box.classList.remove('rainbow');
  beams.style.opacity = 0; glow.style.opacity = 0.3; beams.style.transform = '';
  box.hidden = false;
  let fast = false;
  const step = (ms) => wait(fast ? ms / 4 : ms);
  const onDown = (e) => { if (e.target.closest('#ch-ok')) return; fast = true; };
  box.addEventListener('pointerdown', onDown);

  const setTier = (t) => {
    const T = TIERS[t];
    box.style.setProperty('--tc', T.color); box.style.setProperty('--tg', T.glow);
    box.classList.toggle('rainbow', t === 4);
    glow.style.opacity = (0.35 + 0.13 * t).toFixed(2);
    beams.style.opacity = (0.12 + 0.14 * t).toFixed(2);
    tierEl.textContent = `${T.name}蒸笼${t ? '！' : ''}`;
  };
  const cx = () => VP.w / 2; const cy = () => steamer.getBoundingClientRect().top + steamer.offsetHeight * 0.3;

  return new Promise((resolve) => {
    const finish = () => {
      box.removeEventListener('pointerdown', onDown);
      box.hidden = true; offFrame?.(); offFrame = null; fx2.clear();
      resolve();
    };
    const reveal = () => {
      skipEl.hidden = true;
      setTier(tier);
      prize.innerHTML = `<div class="prize-card">${prizeSVG(reward)}</div>`;
      nameEl.innerHTML = reward.gift
        ? `甜度大礼包 +${fmtSweetValue(reward.sweet)}<small>${TIERS[tier].name}奖励已经全部收集，送你一份甜度</small>`
        : `${reward.name}<small>${fresh ? '新收藏！可以在首页“收藏”里换上' : '（调试：不保存）'}</small>`;
      goalsEl.innerHTML = goals.length ? goals.map((id) => `<li class="got">${GOALS.find((g) => g.id === id).text}</li>`).join('') : '<li>做完了一局</li>';
      audio?.chestReveal(tier);
      ok.hidden = false;
      const close = () => { ok.removeEventListener('click', close); finish(); };
      ok.addEventListener('click', close);
      if (still) { lid.style.opacity = 0; prize.style.transform = 'translateX(-50%) scale(1)'; if (auto) wait(900).then(close); return; }
      fx2.burst(cx(), cy(), { count: 30 + 16 * tier, kinds: ['coin', 'coin', 'star', 'confetti'], speed: 520 + 90 * tier, up: 260, life: 1.2 });
      fx2.ring(cx(), cy(), { color: TIERS[tier].color, radius: 160 + 20 * tier, width: 10 });
      tween(420, (k) => { lid.style.transform = `translateY(${-k * 150}%) rotate(${-k * 28}deg)`; lid.style.opacity = 1 - k * 0.9; }, easeOutCubic);
      tween(460, (k) => { prize.style.transform = `translateX(-50%) translateY(${(1 - k) * 40}%) scale(${k})`; }, easeOutBack);
      beams.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 9000, iterations: Infinity });
      if (auto) wait(1100).then(close);
    };

    if (still) { setTier(tier); reveal(); return; }
    (async () => {
      // 1. The steamer drops in.
      await tween(260, (k) => { steamer.style.transform = `translateY(${(1 - k) * -90}px)`; steamer.style.opacity = Math.min(1, k * 2); }, easeOutBack);
      audio?.chestShake(0.3);
      setTier(0);
      // 2. The lid rattles, the steam builds up.
      const shakeMs = 650;
      let n = 0;
      await tween(fast ? shakeMs / 4 : shakeMs, (k) => {
        lid.style.transform = `translateY(${-Math.abs(Math.sin(k * 40)) * 4 * k}px) rotate(${Math.sin(k * 34) * 4 * k}deg)`;
        if (k * 6 > n) { n += 1; audio?.chestShake(k); fx2.puff(cx() + rand(-40, 40), cy() - 20, 3 + Math.round(k * 4)); }
      }, (k) => k);
      lid.style.transform = '';
      // 3. The light climbs, one tier at a time (candidates roll past as decoration).
      for (let t = 0; t <= tier; t++) {
        setTier(t);
        audio?.chestStep(t);
        fx2.burst(cx(), cy(), { count: 10 + 5 * t, kinds: ['spark', 'star'], speed: 380, up: 120, life: 0.7, colors: [TIERS[t].color, '#FFFFFF'] });
        fx2.puff(cx() + rand(-50, 50), cy() - 30, 4 + t);
        tween(fast ? 60 : 240, (k) => { glow.style.transform = `scale(${1 + 0.25 * Math.sin(k * Math.PI)})`; });
        prize.innerHTML = `<div class="prize-roll">${prizeSVG(pick(ITEMS), 96)}</div>`;
        prize.style.transform = 'translateX(-50%) scale(.55)';
        await step(t < tier ? 520 : 380);
      }
      prize.style.transform = 'translateX(-50%) scale(0)';
      // 4. The lid flies off: the prize.
      reveal();
    })();
  });
}
