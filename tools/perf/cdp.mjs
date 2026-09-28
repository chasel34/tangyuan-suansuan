// Minimal CDP harness: launches an isolated headless Chrome (fresh profile), one page.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ w = 1440, h = 900, dpr = 2, mobile = false, cpu = 1, extraArgs = [] } = {}) {
  const dir = mkdtempSync(join(process.env.SCRATCH || tmpdir(), 'chr-'));
  const proc = spawn(CHROME, [
    '--headless=new', `--user-data-dir=${dir}`, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
    ...(process.env.AUTOPLAY ? ['--autoplay-policy=no-user-gesture-required'] : []), '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', `--window-size=${w},${h}`, '--enable-gpu', '--use-angle=metal', ...extraArgs, 'about:blank',
  ], { stdio: 'ignore' });
  const portFile = join(dir, 'DevToolsActivePort');
  for (let i = 0; i < 200 && !existsSync(portFile); i++) await sleep(50);
  await sleep(100);
  const [port, path] = readFileSync(portFile, 'utf8').trim().split('\n');
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map(); const listeners = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result); }
    else if (d.method) for (const l of listeners) l(d);
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  const { targetInfos } = await send('Target.getTargets');
  const t = targetInfos.find((x) => x.type === 'page');
  const { sessionId } = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  const s = (method, params) => send(method, params, sessionId);
  await s('Page.enable'); await s('Runtime.enable');
  await s('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile });
  if (mobile) await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  if (cpu > 1) await s('Emulation.setCPUThrottlingRate', { rate: cpu });
  const on = (method, fn) => listeners.push((d) => { if (d.method === method) fn(d.params, d); });
  const evaluate = async (expr) => { const r = await s('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
  const close = async () => { try { await send('Browser.close'); } catch {} ws.close(); await sleep(300); try { proc.kill(); } catch {} try { rmSync(dir, { recursive: true, force: true }); } catch {} };
  return { send, s, on, evaluate, close, sleep };
}
export { sleep };

// Injected before the page scripts: frames (rAF intervals), long tasks, key event timing, phase samples.
export const RECORDER = `
(() => {
  const P = window.__perf = { frames: [], lt: [], ev: [], ph: [] };
  let last = 0;
  const f = (t) => { if (last) P.frames.push([Math.round(t), +(t - last).toFixed(2)]); last = t; requestAnimationFrame(f); };
  requestAnimationFrame(f);
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'keydown' || e.name === 'pointerdown') P.ev.push({ name: e.name, t: Math.round(e.startTime), dur: e.duration, proc: +(e.processingEnd - e.processingStart).toFixed(2), delay: +(e.processingStart - e.startTime).toFixed(2), after: +(e.startTime + e.duration - e.processingEnd).toFixed(2) }); }).observe({ type: 'event', durationThreshold: 16, buffered: true }); } catch {}
  setInterval(() => { try { const s = window.__game && window.__game.state; if (s) P.ph.push([Math.round(performance.now()), s.screen + (s.mode === 'extra' ? '/extra' : '') + (s.overlay ? '+' + s.overlay : ''), s.quality]); } catch {} }, 500);
})();`;

export const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

// Busy runs (consecutive non-idle samples) longer than minMs with their top inclusive functions.
export function busyRuns(profile, minMs = 40, k = 14) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const key = (n) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`;
  let t = 0; let run = null; const runs = []; const out = [];
  for (let i = 0; i < profile.samples.length; i++) {
    t += profile.timeDeltas[i] / 1000;
    const n = byId.get(profile.samples[i]);
    if (n.callFrame.functionName === '(idle)') { if (run) { run.end = t; runs.push(run); run = null; } continue; }
    if (!run) run = { start: t, ids: [] };
    run.ids.push([profile.samples[i], (profile.timeDeltas[i + 1] ?? 0) / 1000]);
  }
  for (const r of runs.filter((r) => r.end - r.start > minMs)) {
    const inc = new Map();
    for (const [id, dt] of r.ids) { let n = byId.get(id); const seen = new Set(); while (n) { const kk = key(n); if (!seen.has(kk)) { seen.add(kk); inc.set(kk, (inc.get(kk) || 0) + dt); } n = byId.get(parent.get(n.id)); } }
    const top = [...inc.entries()].filter(([n]) => !/^\((root|program|idle)\)/.test(n)).sort((a, b) => b[1] - a[1]).slice(0, k);
    out.push(`### run @${r.start.toFixed(0)}ms ${(r.end - r.start).toFixed(0)}ms: ` + top.map(([n, v]) => `${n} ${v.toFixed(0)}`).join(' | '));
  }
  return out.join('\n');
}
