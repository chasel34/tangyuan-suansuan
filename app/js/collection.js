// 收藏: cosmetic rewards only (汤圆装扮, 背景主题, 宝石样式, 连击音色). Pure: no DOM, no storage.
// A chest of tier t gives the next item of that tier that is not owned yet, in the fixed order
// below. When a tier is complete, the chest gives a display-only 甜度 gift instead.
import { TIERS, tierRule } from './chest.js';

export const CATEGORIES = [
  { key: 'outfit', name: '汤圆装扮' },
  { key: 'bg', name: '背景主题' },
  { key: 'gem', name: '宝石样式' },
  { key: 'sound', name: '连击音色' },
];
// Outfit slots: one item each.
export const SLOTS = ['head', 'face', 'neck'];

// Owned from the start (not counted as rewards).
export const BASE_ITEMS = [
  { id: 'bg-rays', cat: 'bg', name: '放射光', tier: -1 },
  { id: 'gem-sapphire', cat: 'gem', name: '蓝宝石', tier: -1 },
  { id: 'snd-ding', cat: 'sound', name: '叮', tier: -1 },
];

// Rewards, 3 per tier (15). Order inside a tier is the unlock order.
export const ITEMS = [
  { id: 'scarf-red', cat: 'outfit', slot: 'neck', name: '红围巾', tier: 0 },
  { id: 'glasses', cat: 'outfit', slot: 'face', name: '圆眼镜', tier: 0 },
  { id: 'gem-star', cat: 'gem', name: '星星', tier: 0 },
  { id: 'cap-blue', cat: 'outfit', slot: 'head', name: '蓝色鸭舌帽', tier: 1 },
  { id: 'bg-sea', cat: 'bg', name: '海边', tier: 1 },
  { id: 'snd-marimba', cat: 'sound', name: '木琴', tier: 1 },
  { id: 'hat-magic', cat: 'outfit', slot: 'head', name: '魔法帽', tier: 2 },
  { id: 'gem-amethyst', cat: 'gem', name: '紫水晶', tier: 2 },
  { id: 'bg-night', cat: 'bg', name: '星空', tier: 2 },
  { id: 'crown', cat: 'outfit', slot: 'head', name: '金皇冠', tier: 3 },
  { id: 'gem-coin', cat: 'gem', name: '金币', tier: 3 },
  { id: 'snd-gong', cat: 'sound', name: '锣鼓', tier: 3 },
  { id: 'scarf-rainbow', cat: 'outfit', slot: 'neck', name: '彩虹围巾', tier: 4 },
  { id: 'bg-candy', cat: 'bg', name: '彩虹糖', tier: 4 },
  { id: 'snd-musicbox', cat: 'sound', name: '八音盒', tier: 4 },
];
export const ALL_ITEMS = [...BASE_ITEMS, ...ITEMS];
export const ITEM = Object.fromEntries(ALL_ITEMS.map((i) => [i.id, i]));

export const DEFAULT_EQUIP = { head: null, face: null, neck: null, bg: 'bg-rays', gem: 'gem-sapphire', sound: 'snd-ding' };
export const emptyCollection = () => ({ owned: [], equip: { ...DEFAULT_EQUIP }, opened: 0 });

export const itemsOfTier = (t) => ITEMS.filter((i) => i.tier === t);

// Display-only gift when the tier's items are all owned: bigger for higher tiers.
export const giftFor = (t) => ({ id: 'gift', gift: true, tier: t, name: '甜度大礼包', sweet: [1000, 5000, 20000, 100000, 500000][t] ?? 1000 });

// The reward a chest of tier t gives, given the owned ids.
export function nextReward(tier, owned = []) {
  return itemsOfTier(tier).find((i) => !owned.includes(i.id)) || giftFor(tier);
}

// Apply a reward to a collection (returns a new object; gifts change nothing).
export function grant(col, item) {
  const c = { ...col, owned: [...col.owned], equip: { ...col.equip }, opened: (col.opened || 0) + 1 };
  if (item && !item.gift && ITEM[item.id] && !c.owned.includes(item.id)) c.owned.push(item.id);
  return c;
}

export const isOwned = (col, id) => ITEM[id]?.tier === -1 || col.owned.includes(id);

// Equip (or, for an outfit already worn, take off). Unknown or unowned ids are ignored.
export function equip(col, id) {
  const it = ITEM[id];
  if (!it || !isOwned(col, id)) return col;
  const c = { ...col, equip: { ...col.equip } };
  if (it.cat === 'outfit') c.equip[it.slot] = c.equip[it.slot] === id ? null : id;
  else c.equip[it.cat] = id;
  return c;
}

// Plain-words condition for an item not owned yet.
export function conditionText(item) {
  const t = item.tier; const k = itemsOfTier(t).indexOf(item) + 1;
  return `开出${TIERS[t].name}蒸笼（${tierRule(t)}）· ${TIERS[t].name}第 ${k} 件`;
}

// Sanitize a stored collection (old or edited data never breaks the page).
export function normalize(raw) {
  const c = emptyCollection();
  if (!raw || typeof raw !== 'object') return c;
  c.owned = Array.isArray(raw.owned) ? raw.owned.filter((id) => ITEM[id] && ITEM[id].tier >= 0) : [];
  c.opened = Number(raw.opened) || 0;
  const e = raw.equip || {};
  for (const k of Object.keys(DEFAULT_EQUIP)) {
    const id = e[k];
    const it = id ? ITEM[id] : null;
    const fits = it && isOwned(c, id) && (it.cat === 'outfit' ? it.slot === k : it.cat === k);
    c.equip[k] = fits ? id : DEFAULT_EQUIP[k];
  }
  return c;
}
