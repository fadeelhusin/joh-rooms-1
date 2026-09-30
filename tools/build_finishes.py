"""Build finishes.js — every room's surfaces from the Room Finishes Database (room schedule)
+ IFC keynotes (extra wall finishes, wall substrate, door marks) + the material library.
Sources: joh-rooms-tracker/tracker-data/room-schedule.json (codes), fin-data.js (schedule text),
roominfo-data.js (IFC keynotes, doors), joh-rooms-1/data/materials.json (code names/specs)."""
import json, re, subprocess, sys, collections
TR = sys.argv[1]; APP = sys.argv[2]
def jsvar(path, name):
    out = subprocess.run(['node', '-e', "global.window={};eval(require('fs').readFileSync(%r,'utf8'));console.log(JSON.stringify(%s))" % (path, name)], capture_output=True, text=True, check=True).stdout
    return json.loads(out)
SCHED = json.load(open(TR + '/tracker-data/room-schedule.json'))['data']
FIN = jsvar(TR + '/fin-data.js', 'FIN_DATA')
RI = jsvar(TR + '/roominfo-data.js', 'ROOMINFO_DATA')
MAT = {m['code']: m for m in json.load(open(APP + '/data/materials.json'))}
ROOMS = json.load(open(APP + '/data/rooms.json'))

def clean(s): return re.sub(r'\s*/\s*', ' ', (s or '')).strip()
def kw(text, *words): t = (text or '').lower(); return any(w in t for w in words)
def split_codes(s):
    out = []
    for c in re.split(r',\s*', s or ''):
        c = re.sub(r'\s*×\d+', '', c).strip()
        if c and c not in ('N/K', 'N/A') and re.match(r'^[A-Z]{1,4}\d', c): out.append(c)
    return out

def first_kind(fn, code, sched, lib, default):
    # the room schedule text wins; the library name of the code is the fallback
    for t in (sched, lib):
        k = fn(code, t, strict=True)
        if k: return k
    return fn(code, '', strict=False) or default
def floor_kind(code, text, strict=False):
    if kw(text, 'carpet'): return 'fl_carpet'
    if kw(text, 'wood', 'timber', 'oak', 'parquet', 'decking', 'hardwood', 'balcony', 'stalls', 'orchestra'): return 'fl_timber'
    if kw(text, 'stone', 'marble', 'terrazzo', 'porcelain', 'ceramic', 'tile'): return 'fl_tile'
    if kw(text, 'grating', 'chequered', 'metal deck', 'steel'): return 'fl_metal'
    if kw(text, 'silicate', 'coated', 'concrete', 'screed', 'epoxy'): return 'fl_coat'
    if strict: return None
    if re.match(r'F0[4-6]|F10', code or ''): return 'fl_coat'
    return 'fl_generic'
def wall_kind(code, text, strict=False):
    if kw(text, 'acoustic', 'sound lock'): return 'wl_acoustic'
    if kw(text, 'tile', 'ceramic', 'porcelain', 'mosaic'): return 'wl_tile'
    if kw(text, 'stone', 'marble', 'limestone', 'granite'): return 'wl_stone'
    if kw(text, 'timber', 'wood', 'batten', 'brass', 'copper', 'metal', 'steel', 'mashrab', 'fish', 'carved', 'panel', 'screen', 'cladding'): return 'wl_clad'
    if kw(text, 'concealed concrete', 'exposed'): return 'wl_exposed'
    if kw(text, 'paint', 'plaster', 'dolomite', 'skim'): return 'wl_paint'
    if strict: return None
    if (code or '').startswith('AW'): return 'wl_acoustic'
    return 'wl_paint'
def ceil_kind(code, text, strict=False):
    if kw(text, 'acoustic plaster'): return 'cl_acplaster'
    if kw(text, 'stainless', 'metal', 'steel', 'stone', 'limestone', 'timber'): return 'cl_clad'
    if kw(text, 'system', 'tile', 'fleece', 'rockfon', 'hygiene', 'grid'): return 'cl_grid'
    if kw(text, 'concealed concrete', 'exposed', 'acoustic insulation directly'): return 'cl_exposed'
    if kw(text, 'plasterboard', 'gypsum', 'board'): return 'cl_board'
    if strict: return None
    if re.match(r'SC1[1-6]', code or ''): return 'cl_grid'
    if re.match(r'SC2', code or ''): return 'cl_acplaster'
    return 'cl_board'

CODES = {}
def code_info(code, fallback):
    if not code: return
    if code in CODES: return
    m = MAT.get(code)
    spec = clean(m.get('spec')) if m else ''
    spec = re.sub(r'^LOCATION:[^|]*\|\s*', '', spec)[:260]
    CODES[code] = {'n': clean(m.get('name')) if m and m.get('name') else clean(fallback), 's': spec}

out = {}; stats = collections.Counter()
ids = sorted(set(ROOMS) | set(SCHED))
for rid in ids:
    s = SCHED.get(rid) or {}; f = FIN.get(rid) or {}; ri = RI.get(rid) or {}
    surf = []
    # FLOOR
    fc = (s.get('floorFinish') or {}).get('code') or ''
    fkeys = split_codes(ri.get('Floor Keynotes (IFC)'))
    if not fc and fkeys: fc = fkeys[0]
    ftxt = f.get('floor') or ri.get('Floor Finish (Schedule)') or ''
    if fc or (ftxt and ftxt not in ('-', 'N/A')):
        code_info(fc, ftxt); d = (CODES.get(fc) or {}).get('n') or ''
        surf.append({'c': 'floor', 'code': fc, 'd': ftxt or d, 'k': first_kind(floor_kind, fc, ftxt, d, 'fl_generic')})
    # SKIRTING
    sk = (s.get('skirting') or {}).get('code') or (s.get('skirting') or {}).get('description') or ''
    if sk: code_info(sk, ''); surf.append({'c': 'skirting', 'code': sk, 'd': 'Skirting ' + sk, 'k': 'sk'})
    # WALLS — schedule finish + extra finish keynotes from IFC (IW/AW); cores give the substrate
    wc = (s.get('wallFinish') or {}).get('code') or ''
    wtxt = f.get('wall') or ri.get('Wall Finish (Schedule)') or ''
    wk = split_codes(ri.get('Wall Keynotes (IFC)'))
    cores = [c for c in wk if re.match(r'^(BW|CW|LW)', c)]
    sub = ', '.join(sorted(set(('Blockwork' if c.startswith('BW') else 'Concrete' if c.startswith('CW') else 'Drywall') for c in cores)))
    wcodes = ([wc] if wc else []) + [c for c in wk if re.match(r'^(IW|AW)', c) and c != wc]
    seen = set()
    for i, c in enumerate(wcodes):
        if c in seen: continue
        seen.add(c); code_info(c, wtxt if i == 0 else '')
        d = (CODES.get(c) or {}).get('n') or ''
        txt = (wtxt if i == 0 else '') + ' ' + d
        surf.append({'c': 'wall', 'code': c, 'd': (wtxt if i == 0 and wtxt else d) or c, 'k': first_kind(wall_kind, c, wtxt if i == 0 else '', d, 'wl_paint'), 'sub': sub})
    if not wcodes and wtxt and wtxt not in ('-',):
        surf.append({'c': 'wall', 'code': '', 'd': wtxt, 'k': first_kind(wall_kind, '', wtxt, '', 'wl_paint'), 'sub': sub})
    # CEILING
    cc = (s.get('ceilingFinish') or {}).get('code') or ''
    ckeys = split_codes(ri.get('Ceiling Keynotes (IFC)'))
    if not cc and ckeys: cc = ckeys[0]
    ctxt = f.get('ceiling') or ri.get('Ceiling Finish (Schedule)') or ''
    if cc or (ctxt and ctxt not in ('-', 'N/A')):
        code_info(cc, ctxt); d = (CODES.get(cc) or {}).get('n') or ''
        surf.append({'c': 'ceiling', 'code': cc, 'd': ctxt or d, 'k': first_kind(ceil_kind, cc, ctxt, d, 'cl_board')})
    # DOORS — one surface per door mark
    marks = [m.strip() for m in re.split(r',\s*', str(ri.get('Door Marks') or '')) if m.strip()]
    dkeys = split_codes(ri.get('Door Keynotes (IFC)')) or [c.strip() for c in re.split(r',\s*', ri.get('Door Keynotes (IFC)') or '') if c.strip()]
    for j, mk in enumerate(marks):
        typ = dkeys[j] if j < len(dkeys) else (dkeys[0] if dkeys else '')
        surf.append({'c': 'door', 'code': re.sub(r'\s*×\d+', '', typ), 'd': 'Door ' + mk, 'k': 'door', 'mark': mk})
    if surf:
        # stable keys
        n = collections.Counter()
        for x in surf:
            base = x['c'] + ':' + (x.get('mark') or x['code'] or 'x'); n[base] += 1
            x['id'] = base + ('' if n[base] == 1 else '#' + str(n[base]))
        out[rid] = surf; stats['rooms'] += 1; stats['surfaces'] += len(surf)
        for x in surf: stats[x['k']] += 1
print(dict(stats))
with open(APP + '/finishes.js', 'w') as fh:
    fh.write('/* Room surfaces from the Room Finishes Database + IFC keynotes — built by tools/build_finishes.py */\n')
    fh.write('var FIN_ROOMS=' + json.dumps(out, separators=(',', ':'), ensure_ascii=False) + ';\n')
    fh.write('var FIN_CODES=' + json.dumps(CODES, separators=(',', ':'), ensure_ascii=False) + ';\n')
