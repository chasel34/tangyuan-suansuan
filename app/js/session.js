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

// Extra round (加时赛): problems 1-6 (k < 6) take the harder half of the grade (with a little jitter);
// from problem 7 (k >= 6) on, the first 4 skills of the next grade in order, cycling. Grade 3 (no next
// grade here) keeps the harder half. extraSkills() is only this grade's part.
export const EXTRA_NEXT_FROM = 6;
export function extraSkills(grade) {
  const list = skillsOfGrade(grade);
  return list.slice(Math.floor(list.length * 0.5));
}
// The next grade's first 4 skills ([] when there is no next grade).
export const nextGradeSkills = (grade) => skillsOfGrade(grade + 1).slice(0, 4);
export function planExtra(grade, k, rng, onlySkill = null) {
  if (onlySkill) return onlySkill;
  const next = nextGradeSkills(grade);
  if (k >= EXTRA_NEXT_FROM && next.length) return next[(k - EXTRA_NEXT_FROM) % next.length];
  const hard = extraSkills(grade);
  return rng() < 0.7 ? hard[k % hard.length] : hard[Math.floor(rng() * hard.length)];
}

export const gradeOf = (skillId) => (SKILL[skillId] ? SKILL[skillId].grade : 3);
