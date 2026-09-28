// Input judging. A problem carries several legal answers, each a token list.
// A key is correct when (typed + key) is still a prefix of at least one legal answer.
// Pure: no DOM.

const isPrefix = (seq, ans) => seq.length <= ans.length && seq.every((t, i) => t === ans[i]);

export function candidates(answers, typed) {
  return answers.filter((a) => isPrefix(typed, a));
}

// -> { ok, done, next } : ok = key accepted; done = some legal answer is now complete.
export function judge(answers, typed, key) {
  const seq = [...typed, key];
  const live = candidates(answers, seq);
  if (!live.length) return { ok: false, done: false, typed: typed.slice() };
  return { ok: true, done: live.some((a) => a.length === seq.length), typed: seq };
}

// Tokens that would be accepted next (for the demo player and hints).
export function nextTokens(answers, typed) {
  const out = new Set();
  for (const a of candidates(answers, typed)) if (a.length > typed.length) out.add(a[typed.length]);
  return [...out];
}
