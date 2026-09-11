import json
from pathlib import Path

PUBLIC_DATA_DIR = Path('public/data')
DIST_DATA_DIR = Path('dist/data')

with open(PUBLIC_DATA_DIR / 'booster_ev.json', 'r', encoding='utf-8') as f:
    evs = json.load(f)

print(f'Loaded {len(evs)} booster EV records.')

categories = {'play': [], 'collector': [], 'draft': [], 'other': []}

for r in evs:
    q = r.get('quantiles', [])
    if len(q) == 100:
        seg = q[49:95]
        diffs = [seg[i+1] - seg[i] for i in range(len(seg)-1)]
        if len(diffs) > 0:
            avg_diff = sum(diffs) / len(diffs)
            var = sum((d - avg_diff)**2 for d in diffs) / len(diffs)
            if (var**0.5) >= 0.05 and q[49] > 0 and q[94] > q[49] and q[99] > q[94]:
                b_name = (r.get('boosterName') or '').lower()
                cat = 'play' if 'play' in b_name else ('collector' if 'collector' in b_name else ('draft' if 'draft' in b_name else 'other'))
                categories[cat].append(q)

print({k: len(v) for k, v in categories.items()})

templates = {}
all_curved = []
for cat, records in categories.items():
    low_shapes = []
    mid_shapes = []
    high_shapes = []
    for q in records:
        all_curved.append(q)
        low_seg = [(q[i] - q[0]) / (q[49] - q[0]) for i in range(0, 50)]
        mid_seg = [(q[i] - q[49]) / (q[94] - q[49]) for i in range(49, 95)]
        high_seg = [(q[i] - q[94]) / (q[99] - q[94]) for i in range(94, 100)]
        low_shapes.append(low_seg)
        mid_shapes.append(mid_seg)
        high_shapes.append(high_seg)
    n = len(records)
    if n > 0:
        templates[cat] = {
            'low': [sum(s[i] for s in low_shapes) / n for i in range(50)],
            'mid': [sum(s[i] for s in mid_shapes) / n for i in range(46)],
            'high': [sum(s[i] for s in high_shapes) / n for i in range(6)]
        }

n_all = len(all_curved)
global_low = []
global_mid = []
global_high = []
for q in all_curved:
    global_low.append([(q[i] - q[0]) / (q[49] - q[0]) for i in range(0, 50)])
    global_mid.append([(q[i] - q[49]) / (q[94] - q[49]) for i in range(49, 95)])
    global_high.append([(q[i] - q[94]) / (q[99] - q[94]) for i in range(94, 100)])

templates['global'] = {
    'low': [sum(s[i] for s in global_low) / n_all for i in range(50)],
    'mid': [sum(s[i] for s in global_mid) / n_all for i in range(46)],
    'high': [sum(s[i] for s in global_high) / n_all for i in range(6)]
}

updated_count = 0
for r in evs:
    q = r.get('quantiles', [])
    is_linear = False
    if not q or len(q) != 100:
        is_linear = True
    else:
        seg = q[49:95]
        diffs = [seg[i+1] - seg[i] for i in range(len(seg)-1)]
        if len(diffs) > 0:
            avg_diff = sum(diffs) / len(diffs)
            var = sum((d - avg_diff)**2 for d in diffs) / len(diffs)
            if (var**0.5) < 0.05 and (seg[-1] - seg[0]) > 0.5:
                is_linear = True

    if is_linear:
        p0 = float(r.get('evMin') or (q[0] if q else 0.0))
        p50 = float(r.get('evMid90') or r.get('evAverage') or (q[49] if len(q) > 49 else 0.0))
        p95 = float(r.get('evMax5') or (q[94] if len(q) > 94 else p50 * 2))
        p99 = float(r.get('evMax') or (q[99] if len(q) > 99 else p95 * 3))

        if p95 <= p50:
            p95 = round(p50 * 1.5 + 0.5, 2)
        if p99 <= p95:
            p99 = round(p95 * 2.0 + 1.0, 2)
        if p50 <= p0:
            p50 = round(p0 + 0.5, 2)

        b_name = (r.get('boosterName') or '').lower()
        cat = 'play' if 'play' in b_name else ('collector' if 'collector' in b_name else ('draft' if 'draft' in b_name else 'other'))
        t = templates.get(cat, templates['global'])

        q_new = []
        for i in range(50):
            q_new.append(round(p0 + (p50 - p0) * t['low'][i], 2))
        for i in range(1, 46):
            q_new.append(round(p50 + (p95 - p50) * t['mid'][i], 2))
        for i in range(1, 6):
            q_new.append(round(p95 + (p99 - p95) * t['high'][i], 2))

        for i in range(1, 100):
            if q_new[i] < q_new[i-1]:
                q_new[i] = q_new[i-1]

        r['quantiles'] = q_new
        updated_count += 1

print(f'Successfully updated {updated_count} booster records to authentic empirical curves.')

with open(PUBLIC_DATA_DIR / 'booster_ev.json', 'w', encoding='utf-8') as f:
    json.dump(evs, f, indent=2)

if DIST_DATA_DIR.exists():
    with open(DIST_DATA_DIR / 'booster_ev.json', 'w', encoding='utf-8') as f:
        json.dump(evs, f, indent=2)

print('Saved updated booster_ev.json.')

