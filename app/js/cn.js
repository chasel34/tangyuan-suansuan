// Chinese wording helpers: numerals, place names and the multiplication rhyme (乘法口诀).

const DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

export const PLACE = ['个位', '十位', '百位', '千位', '万位'];
export const DEC_PLACE = ['十分位', '百分位'];

// Chinese reading of 0-99 as used inside 口诀 (二十, 十二, 三十六...).
export function cnNumber(n) {
  if (n < 10) return DIGITS[n];
  const t = Math.floor(n / 10); const o = n % 10;
  const tens = t === 1 ? '十' : `${DIGITS[t]}十`;
  return o ? `${tens}${DIGITS[o]}` : tens;
}

// 乘法口诀 for a × b (order does not matter): the smaller factor is read first.
// Products below 10 use 得 (二三得六); 10 is read 一十 (二五一十); 11-19 as 十几 (三四十二).
export function koujue(a, b) {
  const x = Math.min(a, b); const y = Math.max(a, b);
  const p = x * y;
  let tail;
  if (p < 10) tail = `得${DIGITS[p]}`;
  else if (p === 10) tail = '一十';
  else tail = cnNumber(p);
  return `${DIGITS[x]}${DIGITS[y]}${tail}`;
}

// Place label for the i-th column from the right, with P decimal places.
export function placeName(i, P = 0) {
  return i < P ? DEC_PLACE[P - 1 - i] : PLACE[i - P];
}
