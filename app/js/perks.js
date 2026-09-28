// Experience, levels and the 三选一 perks. Pure: no DOM.
// XP is given per finished problem (not per digit), so the number of level-ups does not depend on
// the grade or on how many digits the answers have: a 6-problem set levels up once, 10 and 14
// twice, and a typical 90-second extra round about once more. Perks only change the show and 甜度;
// never the score, the problems or the judging.

export const XP_BASIC = 10; // per finished basic problem
export const XP_EXTRA = 8; // per finished extra-round problem
// XP needed to go from level L to L + 1 (the bar starts at Lv 1): 35, 55, 75, 95 ...
export const xpNeed = (level) => 35 + 20 * (Math.max(1, level) - 1);

// Total XP spent to reach a level (Lv 1 → 0, Lv 2 → 35, Lv 3 → 90 ...).
export function xpBefore(level) { let t = 0; for (let l = 1; l < level; l++) t += xpNeed(l); return t; }

// Level reached with a total of xp, and the progress inside that level.
export function levelOf(xp) {
  let level = 1; let rest = Math.max(0, xp);
  while (rest >= xpNeed(level)) { rest -= xpNeed(level); level += 1; }
  return { level, into: rest, need: xpNeed(level), frac: rest / xpNeed(level) };
}

// Level-ups crossed when the total goes from a to b.
export const levelUpsBetween = (a, b) => levelOf(b).level - levelOf(a).level;

// Fixed order. 三选一 offers three of them by rule, never at random.
export const PERKS = [
  { id: 'sweet20', name: '甜度 +20%', desc: '这一局的甜度多涨两成', icon: 'sweet' },
  { id: 'coins', name: '宝石变金币', desc: '经验宝石都变成金币', icon: 'coin' },
  { id: 'gong', name: '连击变锣鼓', desc: '每按对一位，咚咚锵', icon: 'gong' },
  { id: 'confetti', name: '彩纸加倍', desc: '纸屑和彩带翻倍', icon: 'confetti' },
  { id: 'shades', name: '汤圆戴墨镜', desc: '这一局汤圆戴上墨镜', icon: 'shades' },
  { id: 'fireworks', name: '每题放烟花', desc: '做完一题就放烟花', icon: 'firework' },
  { id: 'early', name: '倍率提前', desc: '连击 3 就到 ×1.5', icon: 'mult' },
  { id: 'magnet', name: '超级磁铁', desc: '磁铁拖出彩虹尾巴', icon: 'magnet' },
  { id: 'cheer', name: '观众欢呼', desc: '每按对一位观众都跳', icon: 'cheer' },
];
export const PERK = Object.fromEntries(PERKS.map((p) => [p.id, p]));
// Offered when every perk has been taken (a very long extra round): stacks.
export const PERK_MORE = { id: 'more', name: '甜度再 +20%', desc: '可以一直叠加', icon: 'sweet' };

// The i-th level-up of this session (0-based) offers the next three perks in the fixed list,
// starting 3 × i places further on and skipping the ones already taken this session.
export function perkChoices(levelIndex, taken = []) {
  const n = PERKS.length; const start = (Math.max(0, levelIndex) * 3) % n;
  const order = [...PERKS.slice(start), ...PERKS.slice(0, start)].filter((p) => !taken.includes(p.id));
  const out = order.slice(0, 3);
  while (out.length < 3) out.push(PERK_MORE);
  return out;
}

// 甜度 multiplier from the perks taken (sweet20 and each 'more' add 20%).
export const sweetBoost = (taken = []) => 1 + 0.2 * taken.filter((id) => id === 'sweet20' || id === 'more').length;
