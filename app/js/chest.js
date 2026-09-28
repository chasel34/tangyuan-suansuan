// 蒸笼 (steamer chest) tier: decided by how the round went, never by chance.
// Pure: same input, same tier; improving any performance input never lowers the tier.
//
// Each goal reached in the round raises the steamer by one tier:
//   0 goals 白色 · 1 蓝色 · 2 紫色 · 3 金色 · 4 or more 彩虹
// The basic-round chest is opened with extraSolved = 0; the extra-round chest uses the same
// basic stats (first-try rate is only tracked in the basic round) plus extraSolved.

export const TIERS = [
  { key: 'white', name: '白色', color: '#FFFFFF', glow: '#FFFFFF' },
  { key: 'blue', name: '蓝色', color: '#3D8BFF', glow: '#8FC2FF' },
  { key: 'purple', name: '紫色', color: '#9B5CFF', glow: '#C9A6FF' },
  { key: 'gold', name: '金色', color: '#FFC53D', glow: '#FFE38A' },
  { key: 'rainbow', name: '彩虹', color: '#FF5DA2', glow: '#FFFFFF' },
];
export const MAX_TIER = TIERS.length - 1;

// Goals in plain words (shown on the collection page and after a chest opens).
export const GOALS = [
  { id: 'rate80', text: '首次正确率达到 80%', ok: (s) => s.firstTryRate >= 0.8 - 1e-9 },
  { id: 'rate100', text: '每一题都是第一次就答对', ok: (s) => s.firstTryRate >= 1 - 1e-9 },
  { id: 'combo10', text: '本局最高连击达到 10', ok: (s) => s.maxCombo >= 10 },
  { id: 'combo25', text: '本局最高连击达到 25', ok: (s) => s.maxCombo >= 25 },
  { id: 'long', text: '做完一局 14 题', ok: (s) => s.count >= 14 && s.solved >= s.count },
  { id: 'extra8', text: '加时赛答对 8 题', ok: (s) => s.extraSolved >= 8 },
  { id: 'extra16', text: '加时赛答对 16 题', ok: (s) => s.extraSolved >= 16 },
];

const norm = ({ maxCombo = 0, firstTryRate = 0, solved = 0, count = 0, extraSolved = 0 } = {}) => ({
  maxCombo: Number(maxCombo) || 0, firstTryRate: Number(firstTryRate) || 0, solved: Number(solved) || 0, count: Number(count) || 0, extraSolved: Number(extraSolved) || 0,
});

// Ids of the goals reached.
export function chestGoals(stats) {
  const s = norm(stats);
  return GOALS.filter((g) => g.ok(s)).map((g) => g.id);
}

export function chestTier(stats) {
  return Math.min(MAX_TIER, chestGoals(stats).length);
}

// "一局达成 N 个目标" for tier t.
export const tierRule = (t) => (t <= 0 ? '做完一局就能开出' : t >= MAX_TIER ? `一局达成 ${MAX_TIER} 个或更多目标` : `一局达成 ${t} 个目标`);
