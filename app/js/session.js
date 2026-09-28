// Session planning: which skill each problem uses. Pure: no DOM.
import { ORDER_INDEX, skillsOfGrade, SKILL } from './skills.js';

// Basic set for a grade: walk the grade's skills in textbook/prerequisite order from easy to
// hard, with a little jitter, then sort so the order never goes backwards.
export function planBasic(grade, N, rng, onlySkill = null) {
  if (onlySkill) return Array.from({ length: N }, () => onlySkill);
  const list = skillsOfGrade(grade);
  const picks = Array.from({ length: N }, (_, i) => {
    const t = N <= 1 ? 1 : i / (N - 1);
    const j = Math.round(t * (list.length - 1) + (rng() - 0.5) * 1.4);
    return list[Math.max(0, Math.min(list.length - 1, j))];
  });
  return picks.sort((a, b) => ORDER_INDEX[a] - ORDER_INDEX[b]);
}

// Extra round (加时赛): the harder half of the grade, cycling in order.
export function extraSkills(grade) {
  const list = skillsOfGrade(grade);
  return list.slice(Math.floor(list.length * 0.5));
}
export function planExtra(grade, k, rng, onlySkill = null) {
  if (onlySkill) return onlySkill;
  const hard = extraSkills(grade);
  return rng() < 0.7 ? hard[k % hard.length] : hard[Math.floor(rng() * hard.length)];
}

export const gradeOf = (skillId) => (SKILL[skillId] ? SKILL[skillId].grade : 3);
