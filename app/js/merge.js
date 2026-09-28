// 观众合成: every solved problem adds a small 汤圆 to the audience; three of the same filling and
// the same size merge into one of the next size (小 → 中 → 大 → 金). Pure: no DOM.
//
// Fillings come in runs of 27: the whole run can climb to 金 (27 smalls → 1 金).
//   6 problems: merges at the 3rd and 6th (two 中).
//   10 problems: 中 at 3 and 6, then at 9 a chain: three 小 → 中, three 中 → 大.
//   27 solved in one sitting (basic + extra round): a triple chain up to 金.
// The run's filling is picked from the session seed, so different games get different colours.

export const LEVELS = ['小', '中', '大', '金'];
export const MAX_LEVEL = LEVELS.length - 1;
export const RUN = 27;
export const FILLING_COUNT = 5;

export const fillingIndex = (n, start = 0) => (((start + Math.floor(n / RUN)) % FILLING_COUNT) + FILLING_COUNT) % FILLING_COUNT;

// Add one small member of filling f. Returns the new list (input untouched), the id of the
// newcomer and the merges in the order they happen (a chain reaction lists every step).
export function addMember(list, f, nextId) {
  let id = nextId;
  const out = list.map((m) => ({ ...m }));
  const added = { id: id++, f, lv: 0 };
  out.push(added);
  const merges = [];
  for (let lv = 0; lv < MAX_LEVEL; lv++) {
    const same = out.filter((m) => m.f === f && m.lv === lv);
    if (same.length < 3) break;
    const three = same.slice(0, 3);
    const into = { id: id++, f, lv: lv + 1 };
    for (const m of three) out.splice(out.indexOf(m), 1);
    out.push(into);
    merges.push({ ids: three.map((m) => m.id), into: into.id, f, lv: lv + 1 });
  }
  return { list: out, added: added.id, merges, nextId: id };
}

// The audience after n solved problems (used by debug jumps and tests).
export function buildCrowd(n, start = 0) {
  let list = []; let nextId = 1; let merges = 0;
  for (let i = 0; i < n; i++) {
    const r = addMember(list, fillingIndex(i, start), nextId);
    list = r.list; nextId = r.nextId; merges += r.merges.length;
  }
  return { list, nextId, merges };
}

// Total "size" of a crowd in smalls (a 中 counts 3, a 大 9, a 金 27): merging never changes it.
export const mass = (list) => list.reduce((a, m) => a + 3 ** m.lv, 0);
