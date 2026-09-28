#!/usr/bin/env python3
# Long events per thread with their biggest children. tr.py trace.json [minMs=30]
import json, sys, collections
d = json.load(open(sys.argv[1]))
ev = d['traceEvents']
mn = float(sys.argv[2]) if len(sys.argv) > 2 else 30
tn = {}
for e in ev:
    if e.get('ph') == 'M' and e.get('name') == 'thread_name':
        tn[(e['pid'], e['tid'])] = e['args']['name']
t0 = min(e['ts'] for e in ev if e.get('name') == 'navigationStart' or e.get('name') == 'TracingStartedInBrowser') if any(e.get('name') in ('navigationStart',) for e in ev) else min(e['ts'] for e in ev if e.get('ts'))
marks = [e for e in ev if e.get('name') == 'click' and e.get('ph') in ('R', 'I', 'n', 'b', 'e')]
if marks: print('click mark at', round((marks[0]['ts'] - t0) / 1000))
X = [e for e in ev if e.get('ph') == 'X' and 'dur' in e]
bythr = collections.defaultdict(list)
for e in X: bythr[(e['pid'], e['tid'])].append(e)
for k in bythr: bythr[k].sort(key=lambda e: (e['ts'], -e['dur']))
def label(e):
    a = e.get('args', {}).get('data', {}) or {}
    s = e['name']
    if a.get('functionName') or a.get('url'):
        s += f" {a.get('functionName','')}@{(a.get('url') or '').split('/')[-1]}:{a.get('lineNumber','')}"
    return s
for k, lst in bythr.items():
    name = tn.get(k, str(k))
    tops = []
    end = -1
    for e in lst:
        if e['ts'] >= end:
            tops.append(e); end = e['ts'] + e['dur']
    long = [e for e in tops if e['dur'] / 1000 >= mn and e['name'] not in ('ThreadControllerImpl::RunTask',) or (e['dur']/1000 >= mn)]
    long = [e for e in tops if e['dur'] / 1000 >= mn]
    if not long: continue
    print(f'== {name} {k}')
    for e in long:
        # children breakdown by name (self-ish: direct inclusion)
        kids = [c for c in lst if c is not e and c['ts'] >= e['ts'] and c['ts'] + c['dur'] <= e['ts'] + e['dur']]
        agg = collections.Counter()
        for c in kids: agg[label(c)] += c['dur'] / 1000
        top = ', '.join(f'{n} {v:.0f}' for n, v in agg.most_common(12))
        print(f"  {round((e['ts']-t0)/1000):>6}ms {e['dur']/1000:6.1f}ms {label(e)} :: {top}")
