#!/usr/bin/env python3
"""Serve before/after builds with opt-in performance recording in an existing Chrome.

python3 tools/perf/live-server.py --before /tmp/baseline/app
Open /before/?perf=before-native or /after/?perf=after-native.
Only local performance JSON is saved; the application sources are not instrumented.
"""
import argparse
import json
import re
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--before', type=Path, required=True)
parser.add_argument('--port', type=int, default=8733)
args = parser.parse_args()
roots = {'before': args.before.resolve(), 'after': HERE.parent.parent / 'app'}
out = HERE / 'out'
out.mkdir(exist_ok=True)


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/__perf/collector.js':
            data = (HERE / 'live-collector.js').read_bytes()
            content_type = 'text/javascript; charset=utf-8'
        elif path in ('/before/', '/after/'):
            root = roots[path.strip('/')]
            data = (root / 'index.html').read_bytes().replace(
                b'<head>', b'<head><script src="/__perf/collector.js"></script>', 1)
            content_type = 'text/html; charset=utf-8'
        else:
            return super().do_GET()
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def translate_path(self, path):
        # SimpleHTTPRequestHandler handles decoding and removes traversal segments.
        clean = Path(super().translate_path(path)).relative_to(Path.cwd())
        parts = clean.parts
        if not parts or parts[0] not in roots:
            return str(HERE / '__not_found__')
        return str(roots[parts[0]].joinpath(*parts[1:]))

    def do_POST(self):
        if urlsplit(self.path).path != '/__perf/results':
            self.send_error(404)
            return
        size = int(self.headers.get('Content-Length', '0'))
        if not 0 < size <= 4_000_000:
            self.send_error(413)
            return
        try:
            data = json.loads(self.rfile.read(size))
            label = data['label']
            if not isinstance(label, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,80}', label):
                raise ValueError('invalid label')
            dest = out / f'live-{label}-{time.time_ns()}.json'
            dest.write_text(json.dumps(data, ensure_ascii=False))
        except (ValueError, KeyError, TypeError):
            self.send_error(400)
            return
        self.send_response(204)
        self.end_headers()


print(f'Live Chrome recorder: http://localhost:{args.port}/after/?perf=after-native', flush=True)
ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
