"""Extract structural grid lines (label + geometry) from the level plan PDFs.
Output: grids.js  (GRIDS_DATA = {level: [{l: label, p: [x,y], d: [dx,dy]}]}) in the app's
rotated plan space (1191 x 842 sheet points, same space as ROOMS pos * [1191, 842])."""
import pymupdf as fitz, math, re, json, sys, collections, glob, os
GR = re.compile(r'^(?:[A-Z][a-c]?|\d{1,2}[a-c]?)$')
STYLE_W = 0.54

def extract(path):
    d = fitz.open(path); p = d[0]
    M = p.rotation_matrix
    dr = p.get_drawings(); ws = p.get_text('words')
    circ = []
    for g in dr:
        it = g['items']; r = g['rect']
        if len(it) >= 4 and all(i[0] == 'c' for i in it) and 0.85 < r.width / max(r.height, 1e-6) < 1.15 and 4 < r.width < 40:
            circ.append((r.x0 + r.width / 2, r.y0 + r.height / 2, r.width / 2))
    bub = []
    for w in ws:
        if not GR.match(w[4]) or not circ: continue
        cx, cy = (w[0] + w[2]) / 2, (w[1] + w[3]) / 2
        c = min(circ, key=lambda c: math.hypot(c[0] - cx, c[1] - cy))
        if math.hypot(c[0] - cx, c[1] - cy) < c[2] * 0.6: bub.append((w[4], c[0], c[1], c[2]))
    # grid-style segments; learn style from segments touching bubbles
    allseg = []
    for g in dr:
        st = (round(g.get('width') or 0, 2), tuple(round(x, 2) for x in (g.get('color') or ())))
        for it in g['items']:
            if it[0] == 'l': allseg.append((it[1].x, it[1].y, it[2].x, it[2].y, st))
    touch = collections.Counter()
    for (lab, cx, cy, r) in bub:
        for s in allseg:
            for (ex, ey) in ((s[0], s[1]), (s[2], s[3])):
                if abs(math.hypot(ex - cx, ey - cy) - r) < 1.2: touch[s[4]] += 1
    if not touch: return [], bub
    style = (0.54, (0.5, 0.5, 0.5)) if any(x[4] == (0.54, (0.5, 0.5, 0.5)) for x in allseg) else touch.most_common(1)[0][0]
    sel = [s for s in allseg if s[4] == style and math.hypot(s[2] - s[0], s[3] - s[1]) >= 2]
    # cluster into infinite lines (theta, rho)
    items = []
    for s in sel:
        th = math.atan2(s[3] - s[1], s[2] - s[0]) % math.pi
        n = (-math.sin(th), math.cos(th)); rho = n[0] * s[0] + n[1] * s[1]
        items.append([th, rho, s])
    items.sort(key=lambda t: (t[0], t[1]))
    clusters = []
    for th, rho, s in items:
        placed = False
        for c in clusters[-60:]:
            dth = abs(th - c['th']); dth = min(dth, math.pi - dth)
            rr = rho if abs(th - c['th']) < math.pi / 2 else -rho
            if dth < 0.006 and abs(rr - c['rho']) < 0.8:
                c['segs'].append(s); placed = True; break
        if not placed: clusters.append({'th': th, 'rho': rho, 'segs': [s]})
    lines = []
    for c in clusters:
        L = sum(math.hypot(s[2] - s[0], s[3] - s[1]) for s in c['segs'])
        if L < 60: continue
        th = c['th']; dx, dy = math.cos(th), math.sin(th)
        pts = [(s[0], s[1]) for s in c['segs']] + [(s[2], s[3]) for s in c['segs']]
        # refine: average perpendicular offset
        n = (-dy, dx); rho = sum(n[0] * x + n[1] * y for x, y in pts) / len(pts)
        ts = [x * dx + y * dy for x, y in pts]
        lines.append({'dx': dx, 'dy': dy, 'rho': rho, 't0': min(ts), 't1': max(ts), 'L': L, 'labels': set()})
    def perp(l, x, y): return (-l['dy']) * x + l['dx'] * y - l['rho']
    def tpos(l, x, y): return l['dx'] * x + l['dy'] * y
    unassigned = []
    for (lab, cx, cy, r) in bub:
        best = None
        for l in lines:
            pd = abs(perp(l, cx, cy)); t = tpos(l, cx, cy)
            gap = max(l['t0'] - t, t - l['t1'], 0)
            if pd < 1.5 and gap < 60:
                sc = pd + gap * 0.01
                if best is None or sc < best[0]: best = (sc, l)
        if best: best[1]['labels'].add(lab)
        else: unassigned.append((lab, cx, cy, r))
    # kinked leaders: follow segments from the bubble edge
    for (lab, cx, cy, r) in unassigned:
        frontier = [(ex2, ey2) for s in allseg for (ex, ey, ex2, ey2) in ((s[0], s[1], s[2], s[3]), (s[2], s[3], s[0], s[1])) if s[4] == style and abs(math.hypot(ex - cx, ey - cy) - r) < 1.2]
        seen = set(); found = None
        for hop in range(4):
            nxt = []
            for (px, py) in frontier:
                for l in lines:
                    t = tpos(l, px, py)
                    if abs(perp(l, px, py)) < 1.0 and max(l['t0'] - t, t - l['t1'], 0) < 30 and l['L'] > 150:
                        found = l; break
                if found: break
                for s in allseg:
                    if s[4] != style: continue
                    for (ex, ey, ex2, ey2) in ((s[0], s[1], s[2], s[3]), (s[2], s[3], s[0], s[1])):
                        k = (round(ex2, 1), round(ey2, 1))
                        if math.hypot(ex - px, ey - py) < 1.0 and k not in seen: seen.add(k); nxt.append((ex2, ey2))
            if found: break
            frontier = nxt
        if found: found['labels'].add(lab)
    out = []
    for l in lines:
        if not l['labels']: continue
        # point on line (unrotated) -> rotated app space
        tm = (l['t0'] + l['t1']) / 2
        x = l['dx'] * tm - l['dy'] * l['rho'] * -1 if False else l['dx'] * tm + (-l['dy']) * l['rho']
        y = l['dy'] * tm + l['dx'] * l['rho']
        P = fitz.Point(x, y) * M
        Q = fitz.Point(x + l['dx'] * 100, y + l['dy'] * 100) * M
        dd = (Q.x - P.x, Q.y - P.y); nrm = math.hypot(*dd)
        A = fitz.Point(l['dx'] * l['t0'] + (-l['dy']) * l['rho'], l['dy'] * l['t0'] + l['dx'] * l['rho']) * M
        B = fitz.Point(l['dx'] * l['t1'] + (-l['dy']) * l['rho'], l['dy'] * l['t1'] + l['dx'] * l['rho']) * M
        out.append({'l': '/'.join(sorted(l['labels'])), 'a': [round(A.x, 2), round(A.y, 2)], 'b': [round(B.x, 2), round(B.y, 2)]})
    return out, bub

if __name__ == '__main__':
    root = sys.argv[1] if len(sys.argv) > 1 else '.'
    data = {}
    for f in sorted(glob.glob(os.path.join(root, 'plans', '*.pdf'))):
        lvl = os.path.basename(f)[:-4]
        out, bub = extract(f)
        labs = set(b[0] for b in bub); got = set(x for o in out for x in o['l'].split('/'))
        print(lvl, 'bubbles', len(bub), 'labels', len(labs), 'lines', len(out), 'missing', sorted(labs - got))
        data[lvl] = out
    # The level sheets share one layout, so build ONE canonical grid by voting per label
    # across the levels where extraction worked, then use it for every level.
    import itertools
    votes = collections.defaultdict(list)
    for lvl, out in data.items():
        for o in out:
            for lab in o['l'].split('/'):
                votes[lab].append((lvl, o))
    def key(o):
        ax, ay = o['a']; bx, by = o['b']; th = math.atan2(by - ay, bx - ax) % math.pi
        n = (-math.sin(th), math.cos(th)); return th, n[0] * ax + n[1] * ay
    canon = []
    for lab, vs in sorted(votes.items()):
        groups = []
        for lvl, o in vs:
            th, rho = key(o)
            for g in groups:
                dth = min(abs(th - g['th']), math.pi - abs(th - g['th']))
                if dth < 0.01 and abs(abs(rho) - abs(g['rho'])) < 2: g['m'].append(o); g['lv'].add(lvl); break
            else: groups.append({'th': th, 'rho': rho, 'm': [o], 'lv': {lvl}})
        g = max(groups, key=lambda g: (len(g['lv']), len(g['m'])))
        if len(groups) > 1: print('  label', lab, 'conflict: kept geometry seen on', sorted(g['lv']), 'dropped', [sorted(x['lv']) for x in groups if x is not g])
        # union extent along the line
        th = g['th']; dx, dy = math.cos(th), math.sin(th)
        pts = [pt for o in g['m'] for pt in (o['a'], o['b'])]
        ts = [x * dx + y * dy for x, y in pts]; ref = pts[0]
        n = (-dy, dx); rho = sum(n[0] * x + n[1] * y for x, y in pts) / len(pts)
        A = (dx * min(ts) - dy * rho, dy * min(ts) + dx * rho); B = (dx * max(ts) - dy * rho, dy * max(ts) + dx * rho)
        canon.append({'l': lab, 'a': [round(A[0], 2), round(A[1], 2)], 'b': [round(B[0], 2), round(B[1], 2)], 'n': len(g['lv'])})
    print('canonical grid lines:', len(canon))
    data = {'all': canon}
    with open(os.path.join(root, 'grids.js'), 'w') as fh:
        fh.write('/* Structural grid lines extracted from plans/*.pdf by tools/extract_grids.py — sheet points in the app plan space (1191 x 842). */\n')
        fh.write('var GRIDS_DATA=' + json.dumps(data, separators=(',', ':')) + ';\n')
