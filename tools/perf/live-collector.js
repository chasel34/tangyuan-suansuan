// Opt-in, local-only instrumentation, injected by live-server.py into either build.
(() => {
  const query = new URLSearchParams(location.search);
  if (!query.has('perf')) return;
  const label = query.get('perf');
  let seed = 12345;
  Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const data = { label, url: location.href, userAgent: navigator.userAgent,
    timeOrigin: performance.timeOrigin, frames: [], events: [], longtasks: [], loaf: [], phases: [], visibility: [], errors: [], slowCalls: [] };
  const observers = [];
  let done = false, last = 0, lastPhase = '', phase = 'boot', frameId, held = false;
  let activeMs = 0, started = false;
  const observe = (type, cb, opts = {}) => {
    if (!PerformanceObserver.supportedEntryTypes.includes(type)) return;
    const o = new PerformanceObserver(list => list.getEntries().forEach(cb));
    o.observe({ type, buffered: true, ...opts }); observers.push(o);
  };
  observe('event', e => data.events.push({ name: e.name, start: e.startTime, duration: e.duration,
    processing: e.processingEnd - e.processingStart, delay: e.processingStart - e.startTime,
    interactionId: e.interactionId, target: e.target?.id || e.target?.tagName, phase }), { durationThreshold: 16 });
  observe('longtask', e => data.longtasks.push({ start: e.startTime, duration: e.duration, phase }));
  observe('long-animation-frame', e => data.loaf.push({ start: e.startTime, duration: e.duration,
    blocking: e.blockingDuration, scripts: e.scripts.map(s => ({ source: s.sourceURL, fn: s.sourceFunctionName,
      duration: s.duration, forcedLayout: s.forcedStyleAndLayoutDuration })) }));
  observe('largest-contentful-paint', e => { data.lcp = e.startTime; });
  addEventListener('error', e => data.errors.push({ message: e.message, file: e.filename, line: e.lineno }));
  addEventListener('unhandledrejection', e => data.errors.push({ message: String(e.reason) }));
  document.addEventListener('visibilitychange', () => {
    data.visibility.push([performance.now(), document.visibilityState]); last = 0;
    if (query.has('demo') || query.has('jump')) {
      if (document.hidden && window.__game) { window.__game.freeze(); held = true; }
      else if (held) { window.__game.unfreeze(); held = false; }
    }
  });
  const frame = t => {
    if (done) return;
    if (!document.hidden) {
      if (!started) { started = true; data.firstFrame = t; }
      if (last) { data.frames.push([t, t - last, phase]); activeMs += t - last; }
      if (activeMs >= duration * 1000) { finish(); return; }
    }
    last = t; frameId = requestAnimationFrame(frame);
  };
  frameId = requestAnimationFrame(frame);
  const phaseTimer = setInterval(() => {
    const s = window.__game?.state;
    if (!s) return;
    phase = s.screen + (s.mode === 'extra' ? '/extra' : '') + (s.overlay ? '+' + s.overlay : '');
    if (phase !== lastPhase) { data.phases.push([performance.now(), phase]); lastPhase = phase; }
  }, 500);
  const pct = (a, p) => { a = [...a].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * p))] || 0; };
  const duration = Math.max(10, Math.min(240, Number(query.get('seconds')) || 60));
  async function finish() {
    if (done) return;
    done = true; clearInterval(phaseTimer); cancelAnimationFrame(frameId);
    // Let queued observer callbacks finish before serializing their entries.
    await new Promise(resolve => setTimeout(resolve, 100));
    observers.forEach(o => o.disconnect());
    data.viewport = { width: innerWidth, height: innerHeight, dpr: devicePixelRatio };
    const gl = document.getElementById('bg')?.getContext('webgl');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    data.renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null;
    data.paint = performance.getEntriesByType('paint').map(e => ({ name: e.name, ms: e.startTime }));
    data.end = performance.now(); data.activeMs = activeMs; data.state = window.__game?.state;
    const start = data.firstFrame + 2500;
    const intervals = data.frames.filter(([t]) => t > start).map(([, dt]) => dt);
    data.summary = { frames: intervals.length, frameP50: pct(intervals, .5), frameP95: pct(intervals, .95),
      frameMax: Math.max(0, ...intervals), over20: intervals.filter(t => t > 20).length,
      over50: intervals.filter(t => t > 50).length,
      longtasks: data.longtasks.filter(e => e.start > start).length,
      hidden: data.visibility.some(([, state]) => state === 'hidden') };
    const panel = document.getElementById('perf-recording');
    try {
      const response = await fetch('/__perf/results', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (panel) panel.textContent = `已保存 ${label} · p95 ${data.summary.frameP95.toFixed(1)}ms · >50ms ${data.summary.over50}帧`;
    } catch (e) { if (panel) panel.textContent = `保存失败：${e.message}`; }
    window.__livePerf = data;
  }
  document.addEventListener('DOMContentLoaded', () => {
    const panel = document.createElement('button'); panel.id = 'perf-recording';
    panel.textContent = `${label} · 记录 ${duration} 秒前台运行（点击提前保存）`;
    panel.style.cssText = 'position:fixed;right:6px;top:6px;z-index:99999;font:11px system-ui;padding:5px;background:white;color:#172754;border:1px solid #172754;border-radius:4px';
    panel.addEventListener('click', finish); document.body.appendChild(panel);
  });
  // Optional coarse function timing, for diagnosis only (exclude these runs from A/B metrics).
  if (query.has('profile') || query.has('omit')) document.addEventListener('DOMContentLoaded', async () => {
    if (query.get('omit') === 'actors') document.getElementById('actors').style.display = 'none';
    for (const [file, cls, methods] of [
      ['fx', 'FX', ['draw', 'update', 'textSprite', 'resize']], ['bg', 'Backdrop', ['draw', 'resize']],
      ['tangyuan', 'Tangyuan', ['update']], ['audio', 'Audio', ['update']],
    ]) {
      const mod = await import(new URL(`js/${file}.js`, location.href));
      if (query.get('omit') === file && (file === 'bg' || file === 'fx')) {
        mod[cls].prototype.draw = function () { this.canvas.style.display = 'none'; };
      }
      if (!query.has('profile')) continue;
      for (const name of methods) {
        const proto = mod[cls].prototype, original = proto[name];
        proto[name] = function (...args) {
          const start = performance.now();
          try { return original.apply(this, args); }
          finally {
            const ms = performance.now() - start;
            if (!done && ms >= 5) data.slowCalls.push({ start, ms, method: `${cls}.${name}`, phase });
          }
        };
      }
    }
  });
})();
