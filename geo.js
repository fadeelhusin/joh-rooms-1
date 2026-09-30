/* ============================================================
   JOH Room Storyboard — GPS ↔ PLAN  +  LEVEL QR
   • Calibrate: stand on a spot you can find on the plan (outside
     the building is best), let GPS settle, tap that spot on the
     plan. 2 points work, 3–4 spread around the building is good.
     Points are shared with the team (data/geo.json).
   • Site Photos taken in a room with good GPS (≤12 m) add
     calibration points automatically.
   • Where am I / Find photo: GPS → position on the plan with an
     accuracy circle + nearest rooms.
   • Level QR: GPS can't tell the floor, so scanning a QR at the
     stair/lift lobby (or a room door label) sets your level.
   ============================================================ */
var Geo = (function () {
  var PATH = 'data/geo.json', K_SH = 'joh_geo_shared', K_P = 'joh_geo_pend', K_D = 'joh_geo_del', K_LVL = 'joh_cur_level';
  var VW = 1191, VH = 842;
  function $(id) { return document.getElementById(id); }
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function lsJ(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (x) { return d; } }
  function lsS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (x) {} }
  function toast(m) { if (window.Locs) Locs.toast(m); }
  function tok() { return window.Locs ? Locs.gh.token() : ''; }

  /* ---------- store (shared file + pending on this phone) ---------- */
  function shared() { return lsJ(K_SH, []) || []; }
  function pend() { return lsJ(K_P, []) || []; }
  function dels() { return lsJ(K_D, []) || []; }
  function points() {
    var d = {}, out = [], seen = {};
    dels().forEach(function (id) { d[id] = 1; });
    shared().concat(pend()).forEach(function (p) { if (!d[p.id] && !seen[p.id]) { seen[p.id] = 1; out.push(p); } });
    return out;
  }
  var syncing = false, err = '';
  function fetchShared() {
    var p = tok() ? Locs.gh.read(PATH).then(function (r) { return r.data; })
      : fetch(PATH, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('no file'); return r.json(); });
    return p.then(function (d) {
      if (!d || !Array.isArray(d.points)) return;
      lsS(K_SH, d.points);
      var have = {}; d.points.forEach(function (x) { have[x.id] = 1; });
      lsS(K_P, pend().filter(function (x) { return !have[x.id]; }));
      lsS(K_D, dels().filter(function (id) { return have[id]; }));
      FIT = {}; status();
    }).catch(function () {}).then(function () { return sync(); });
  }
  function sync(tries) {
    tries = tries || 0;
    if (!tok() || syncing || (!pend().length && !dels().length)) { status(); return Promise.resolve(); }
    syncing = true; status();
    return Locs.gh.read(PATH).then(function (r) {
      var list = (r.data && r.data.points) || [], d = {}, have = {};
      dels().forEach(function (id) { d[id] = 1; });
      list = list.filter(function (p) { return !d[p.id]; });
      list.forEach(function (p) { have[p.id] = 1; });
      pend().forEach(function (p) { if (!have[p.id]) list.push(p); });
      return Locs.gh.write(PATH, { app: 'joh-rooms', updated: new Date().toISOString(), points: list }, r.sha, 'Update GPS calibration (' + list.length + ' points)')
        .then(function () { lsS(K_SH, list); lsS(K_P, []); lsS(K_D, []); syncing = false; err = ''; FIT = {}; status(); });
    }).catch(function (x) {
      syncing = false;
      if (x && x.conflict && tries < 2) return sync(tries + 1);
      err = (x && x.message) || 'Sync failed'; status();
    });
  }
  function addPoint(p) {
    p.id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    p.t = new Date().toISOString();
    var a = pend(); a.push(p); lsS(K_P, a); FIT = {}; sync(); return p;
  }
  function delPoint(id) {
    lsS(K_P, pend().filter(function (p) { return p.id !== id; }));
    if (shared().some(function (p) { return p.id === id; })) { var d = dels(); if (d.indexOf(id) < 0) d.push(id); lsS(K_D, d); }
    FIT = {}; sync();
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) fetchShared(); });
  window.addEventListener('online', function () { sync(); });

  /* ---------- math: similarity transform plan ⇄ local metres ---------- */
  var FIT = {};
  function enu(lat, lon, o) { return [(lon - o.lon) * Math.cos(o.lat * Math.PI / 180) * 111320, (lat - o.lat) * 110574]; }
  function solve(pts) {
    if (pts.length < 2) return null;
    var W = 0, o = { lat: 0, lon: 0 };
    pts.forEach(function (p) { var w = 1 / Math.pow(Math.max(p.acc || 10, 3), 2); p._w = w; W += w; o.lat += p.lat * w; o.lon += p.lon * w; });
    o.lat /= W; o.lon /= W;
    var zb = [0, 0], wb = [0, 0];
    pts.forEach(function (p) {
      p._z = [p.x * VW, -p.y * VH]; p._m = enu(p.lat, p.lon, o);
      zb[0] += p._z[0] * p._w; zb[1] += p._z[1] * p._w; wb[0] += p._m[0] * p._w; wb[1] += p._m[1] * p._w;
    });
    zb = [zb[0] / W, zb[1] / W]; wb = [wb[0] / W, wb[1] / W];
    var nr = 0, ni = 0, den = 0;
    pts.forEach(function (p) {
      var zr = p._z[0] - zb[0], zi = p._z[1] - zb[1], wr = p._m[0] - wb[0], wi = p._m[1] - wb[1];
      nr += p._w * (zr * wr + zi * wi); ni += p._w * (zr * wi - zi * wr); den += p._w * (zr * zr + zi * zi);
    });
    if (den < 1e-9) return null;
    var a = [nr / den, ni / den];
    var b = [wb[0] - (a[0] * zb[0] - a[1] * zb[1]), wb[1] - (a[0] * zb[1] + a[1] * zb[0])];
    var se = 0;
    pts.forEach(function (p) {
      var fx = a[0] * p._z[0] - a[1] * p._z[1] + b[0], fy = a[0] * p._z[1] + a[1] * p._z[0] + b[1];
      p._res = Math.hypot(fx - p._m[0], fy - p._m[1]); se += p._res * p._res;
    });
    var spanM = 0;
    pts.forEach(function (p) { pts.forEach(function (q) { spanM = Math.max(spanM, Math.hypot(p._m[0] - q._m[0], p._m[1] - q._m[1])); }); });
    return { a: a, b: b, o: o, n: pts.length, rms: pts.length > 2 ? Math.sqrt(se / (pts.length - 2)) : 0, scale: Math.hypot(a[0], a[1]), span: spanM, pts: pts };
  }
  function fit(level) {
    if (FIT[level] !== undefined) return FIT[level];
    var all = points().map(function (p) { return Object.assign({}, p); });
    var lv = all.filter(function (p) { return p.level === level; });
    var use = lv.length >= 3 ? lv : all;       // plans share one sheet layout, so other levels' points help
    var f = solve(use);
    if (f && use.length >= 4) {                 // drop gross outliers once and refit
      var rs = use.map(function (p) { return p._res; }).sort(function (x, y) { return x - y; });
      var lim = Math.max(15, 3 * rs[Math.floor(rs.length / 2)]);
      var keep = use.filter(function (p) { return p._res <= lim; });
      if (keep.length >= 2 && keep.length < use.length) {
        var out = {}; use.forEach(function (p) { if (p._res > lim) out[p.id] = Math.round(p._res); });
        f = solve(keep); if (f) f.outliers = out;
      }
    }
    FIT[level] = f || null;
    return FIT[level];
  }
  function toPlan(lat, lon, f) {
    var m = enu(lat, lon, f.o), wr = m[0] - f.b[0], wi = m[1] - f.b[1], d = f.a[0] * f.a[0] + f.a[1] * f.a[1];
    var zr = (wr * f.a[0] + wi * f.a[1]) / d, zi = (wi * f.a[0] - wr * f.a[1]) / d;
    return { x: zr / VW, y: -zi / VH };
  }
  function nearRooms(level, x, y, f, n) {
    var out = [];
    Object.keys(ROOMS).forEach(function (k) {
      var r = ROOMS[k]; if (r.baseLevel !== level || !r.pos) return;
      out.push({ id: k, d: Math.hypot((r.pos[1] - x) * VW, (r.pos[2] - y) * VH) * f.scale });
    });
    return out.sort(function (p, q) { return p.d - q.d; }).slice(0, n || 6);
  }

  /* ---------- current level (from QR / Site Photo) ---------- */
  function curLevel() { var v = lsJ(K_LVL, null); return v && Date.now() - v.t < 4 * 3600e3 ? v.level : null; }
  function setLevel(l) { lsS(K_LVL, { level: l, t: Date.now() }); }
  function arrive(level, room) {
    if (LEVELS.indexOf(level) >= 0) setLevel(level);
    if (room && ROOMS[room] && window.markHere) markHere(room);
    toast('📍 You are on Level ' + level);
    location.replace(room && ROOMS[room] ? '#/room/' + encodeURIComponent(room) : '#/plan/' + level);
  }

  /* ---------- live GPS with averaging ---------- */
  var watchId = null;
  function watch(cb) {
    stopWatch();
    if (!navigator.geolocation) { cb(null, 0, 'Location not available on this device'); return; }
    var rd = [];
    watchId = navigator.geolocation.watchPosition(function (p) {
      rd.push({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy });
      if (rd.length > 40) rd.shift();
      var best = Math.min.apply(null, rd.map(function (r) { return r.acc; }));
      var use = rd.filter(function (r) { return r.acc <= Math.max(best * 1.5, 8); }), W = 0, la = 0, lo = 0;
      use.forEach(function (r) { var w = 1 / (r.acc * r.acc); W += w; la += r.lat * w; lo += r.lon * w; });
      cb({ lat: la / W, lon: lo / W, acc: best }, use.length);
    }, function (x) { cb(null, 0, x.code === 1 ? 'Location permission is off' : 'No GPS fix yet — step outside or near a window'); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  }
  function stopWatch() { if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId); watchId = null; }

  /* ---------- small dialog helpers ---------- */
  function dlg(html, low) { Locs.dlg(html, low); }
  function close() {
    stopWatch(); stopScan();
    if (window.Viewer) { Viewer.setAddMode(null); Viewer.showTemp(null); }
    var w = $('pvb'); if (w) w.classList.remove('adding');
    var b = $('loc-banner'); if (b) b.classList.remove('on');
    Locs.closeDlg();
  }
  function head(eyebrow, title) {
    return '<div class="sc-head"><div><div class="eyebrow" style="color:#d8cdb6">' + e(eyebrow) + '</div><div class="rn">' + e(title) + '</div></div><button class="sc-x" onclick="Geo.close()">✕</button></div>';
  }
  function status() {
    var el = $('geo-stat'); if (!el) return;
    var lv = window.Viewer && Viewer.level(), f = lv ? fit(lv) : null, n = points().length, pn = pend().length + dels().length;
    el.className = 'loc-sync' + (err ? ' err' : pn ? ' wait' : '');
    el.textContent = err ? '⚠ GPS: ' + err : !f ? 'GPS: not calibrated (' + n + ' pt)' : 'GPS: ' + f.n + ' pts · ±' + Math.max(3, Math.round(f.rms)) + ' m' + (pn ? ' · ⏳' + pn : '');
  }

  /* ---------- plan-page toolbar ---------- */
  function planTools(level) {
    setTimeout(status, 0);
    var cl = curLevel();
    return { btn: '<button class="tb" onclick="Geo.whereAmI(\'' + e(level) + '\')">📍 Where am I</button>' +
      '<button class="tb" onclick="Geo.findPhoto(\'' + e(level) + '\')">🔎 Find photo</button>' +
      '<button class="tb" onclick="Geo.qrMenu(\'' + e(level) + '\')">▦ QR</button>' +
      '<button class="tb" onclick="Geo.calibrate(\'' + e(level) + '\')">🎯 Calibrate</button>',
      chip: '<span class="geo-chip' + (cl ? '' : ' off') + '" onclick="Geo.qrMenu(\'' + e(level) + '\')">' + (cl ? '📍 You: L' + e(cl) : '📍 Level? scan QR') + '</span>',
      stat: '<span class="loc-sync" id="geo-stat"></span>' };
  }

  /* ---------- CALIBRATE ---------- */
  var live = null;
  function calibrate(level) {
    if (!tok()) toast('Tip: set up ⚙ Sync so calibration is shared with the team');
    live = null;
    dlg(head('GPS calibration · Level ' + level, 'Calibrate'), true);
    renderCal(level);
    watch(function (g, n, msg) {
      live = g;
      var el = $('geo-live'); if (!el) return;
      el.innerHTML = g ? '<b>±' + Math.round(g.acc) + ' m</b> · ' + n + ' reading(s)' + (g.acc > 15 ? ' — <span style="color:var(--red)">wait or move outside</span>' : g.acc <= 6 ? ' — <span style="color:var(--green)">excellent</span>' : ' — good') : e(msg || 'Waiting for GPS…');
    });
  }
  function renderCal(level) {
    var f = fit(level), list = points().filter(function (p) { return p.level === level; });
    var res = {}; if (f) f.pts.forEach(function (p) { res[p.id] = p._res; });
    var h = '<div class="sc-body"><div class="small">1. Stand on a spot you can find exactly on the plan — a building corner, entrance, or grid column at the façade. <b>Outside the building is best.</b><br>2. Wait until accuracy is ≤ 10 m.<br>3. Tap <b>Mark this spot</b>, then tap the same spot on the plan.<br>Use 3–4 spots spread around the building.</div>' +
      '<div class="geo-live" id="geo-live">Waiting for GPS…</div>' +
      '<div class="sc-actions"><button class="btn brass sc-big" onclick="Geo.mark(\'' + e(level) + '\')">🎯 Mark this spot</button></div>' +
      '<div class="sublab">Calibration points · Level ' + e(level) + ' (' + list.length + ')' + (f ? ' — fit ±' + Math.max(3, Math.round(f.rms)) + ' m' + (f.span < 40 ? ' · <span style="color:var(--red)">points too close together</span>' : '') : '') + '</div>';
    if (!list.length) h += '<div class="small">None yet on this level.' + (points().length ? ' Points from other levels are used meanwhile (' + points().length + ').' : '') + '</div>';
    list.forEach(function (p) {
      var r = res[p.id], out = f && f.outliers && f.outliers[p.id];
      h += '<div class="geo-row"><span>' + (p.src === 'photo' ? '📷 ' + e(p.room || '') : '🎯 manual') + ' · ±' + Math.round(p.acc) + ' m' +
        (out ? ' · <b style="color:var(--red)">ignored (off by ' + out + ' m)</b>' : r != null && f && f.n > 2 ? ' · fit ' + Math.round(r) + ' m' : '') +
        '</span><button class="sc-x" onclick="Geo.delPt(\'' + p.id + '\',\'' + e(level) + '\')">🗑</button></div>';
    });
    h += '</div>';
    var m = document.querySelector('#loc-dlg .sc-panel');
    if (m) { var hd = m.querySelector('.sc-head').outerHTML; var liveTxt = $('geo-live') ? $('geo-live').innerHTML : ''; m.innerHTML = hd + h; if (liveTxt) $('geo-live').innerHTML = liveTxt; }
  }
  function mark(level) {
    if (!live) { toast('Waiting for a GPS fix…'); return; }
    if (live.acc > 25 && !confirm('GPS accuracy is only ±' + Math.round(live.acc) + ' m. Use it anyway?')) return;
    var g = { lat: live.lat, lon: live.lon, acc: live.acc };
    var b = $('loc-banner'); if (b) { b.innerHTML = '<span>🎯 Tap the spot where you are standing</span><button class="btn ghost" onclick="Geo.cancelMark()">Cancel</button>'; b.classList.add('on'); }
    var w = $('pvb'); if (w) w.classList.add('adding');
    $('loc-dlg').classList.add('hide');
    if (w) w.scrollIntoView({ block: 'start', behavior: 'smooth' });
    Viewer.setAddMode(function (x, y) {
      addPoint({ src: 'manual', level: level, x: +x.toFixed(5), y: +y.toFixed(5), lat: +g.lat.toFixed(7), lon: +g.lon.toFixed(7), acc: Math.round(g.acc * 10) / 10 });
      cancelMark(); renderCal(level); status(); toast('🎯 Calibration point saved');
    });
  }
  function cancelMark() {
    Viewer.setAddMode(null);
    var w = $('pvb'); if (w) w.classList.remove('adding');
    var b = $('loc-banner'); if (b) b.classList.remove('on');
    var d = $('loc-dlg'); if (d) d.classList.remove('hide');
  }
  function delPt(id, level) { if (!confirm('Delete this calibration point?')) return; delPoint(id); renderCal(level); status(); }

  /* ---------- WHERE AM I / FIND PHOTO ---------- */
  function whereAmI(level) {
    level = curLevel() || level;
    dlg(head('Where am I', 'Level ' + level) + '<div class="sc-body"><div class="geo-live" id="geo-live">Getting GPS…</div>' +
      '<div class="small">' + (curLevel() ? 'Level from your last QR scan / Site Photo.' : 'Level = the plan you are viewing. Scan a level QR to set it.') + '</div></div>', true);
    var shown = 0, t0 = Date.now();
    watch(function (g, n, msg) {
      var el = $('geo-live'); if (!el) return;
      if (!g) { el.textContent = msg || 'Waiting…'; return; }
      el.innerHTML = '±' + Math.round(g.acc) + ' m · ' + n + ' reading(s)';
      if ((g.acc <= 15 || Date.now() - t0 > 8000) && Date.now() - shown > 3000) { shown = Date.now(); show(g, level, 'You are here', true); }
    });
  }
  function findPhoto(level) {
    var i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
    i.onchange = function () {
      var f = i.files[0]; if (!f) return;
      Exif.readMeta(f).then(function (m) {
        if (!m.gps) { alert('This photo has no GPS saved in it. (WhatsApp and screenshots remove it — use the original photo from the gallery.)'); return; }
        var lm = /Level\s+(\w+)/.exec(m.desc || ''), rm = /^(\S+)\s+-/.exec(m.desc || ''), lv = lm && LEVELS.indexOf(lm[1]) >= 0 ? lm[1] : level;
        show(m.gps, lv, rm ? 'Photo of ' + rm[1] : 'Photo location', false, lm ? 'Level read from the photo stamp.' : 'Photo has no level — shown on Level ' + lv + '. Switch level on the plan and try again if needed.');
      });
    };
    i.click();
  }
  function show(g, level, title, keepWatch, note) {
    var f = fit(level);
    if (!f) { if (!keepWatch) stopWatch(); dlg(head(title, 'Not calibrated'), true); var p = document.querySelector('#loc-dlg .sc-panel'); p.innerHTML += '<div class="sc-body"><div class="small">GPS isn\'t linked to the plan yet. Add at least 2 calibration points with <b>🎯 Calibrate</b> (3–4 spread around the building is better).</div><div class="sc-actions"><button class="btn brass sc-big" onclick="Geo.calibrate(\'' + e(level) + '\')">🎯 Calibrate now</button></div></div>'; return; }
    var go = function () {
      var pp = toPlan(g.lat, g.lon, f), accM = Math.sqrt(Math.pow(g.acc || 0, 2) + Math.pow(Math.max(f.rms, 3), 2));
      var inSheet = pp.x >= 0 && pp.x <= 1 && pp.y >= 0 && pp.y <= 1;
      Viewer.showTemp(pp.x, pp.y, accM / f.scale / VW);
      Viewer.panTo(pp.x, pp.y, 0.3, 1.4);
      var pw = $('pvb'); if (pw) pw.scrollIntoView({ block: 'start' });
      var near = inSheet ? nearRooms(level, pp.x, pp.y, f, 6) : [];
      var h = '<div class="sc-body">' + (keepWatch ? '<div class="geo-live" id="geo-live">±' + Math.round(g.acc) + ' m</div>' : '') +
        (window.Grid && Grid.at(pp.x, pp.y) ? '<div class="loc-grid">≈ Grid ' + e(Grid.at(pp.x, pp.y).text) + '</div>' : '') +
        '<div class="small">Blue circle = likely area (±' + Math.round(accM) + ' m).' + (note ? ' ' + e(note) : '') + '</div>';
      if (!inSheet) h += '<div class="small" style="color:var(--red)">The position falls outside this plan sheet — check the calibration or the photo.</div>';
      if (near.length) {
        h += '<div class="sublab">Nearest rooms</div>';
        near.forEach(function (n) {
          var r = ROOMS[n.id];
          h += '<div class="geo-row"><span onclick="Geo.close();location.hash=\'#/room/' + encodeURIComponent(n.id) + '\'" style="cursor:pointer"><b>' + e(n.id) + '</b> ' + e(r.name || '') + ' · ' + Math.round(n.d) + ' m</span>' +
            '<button class="btn ghost" onclick="Geo.close();SiteCam.open(\'' + e(n.id) + '\')">📷</button></div>';
        });
      }
      h += '</div>';
      dlg(head(title, 'Level ' + level), true);
      var p = document.querySelector('#loc-dlg .sc-panel'); p.innerHTML += h;
    };
    if (!keepWatch) stopWatch();
    if (window.Viewer && Viewer.level() === level && $('pvb')) go();
    else { location.hash = '#/plan/' + level; setTimeout(go, 400); }
  }

  /* ---------- auto calibration point from a Site Photo ---------- */
  function fromPhoto(id, g) {
    var d = ROOMS[id]; if (!d) return;
    setLevel(d.baseLevel);
    if (!g || !d.pos || g.acc > 12) return;
    if (points().some(function (p) { return p.room === id && Date.now() - Date.parse(p.t) < 864e5; })) return;
    var rr = d.area ? Math.sqrt(d.area / Math.PI) : 4;
    addPoint({ src: 'photo', room: id, level: d.baseLevel, x: d.pos[1], y: d.pos[2], lat: +g.lat.toFixed(7), lon: +g.lon.toFixed(7), acc: Math.round(Math.sqrt(g.acc * g.acc + rr * rr) * 10) / 10 });
  }

  /* ---------- QR: scan + print ---------- */
  function base() { return location.href.split('#')[0].replace(/index\.html$/, '') + 'index.html'; }
  function qrMenu(level) {
    var n = Object.keys(ROOMS).filter(function (k) { return ROOMS[k].baseLevel === level && !ROOMS[k].custom; }).length;
    dlg(head('Level QR', 'Level ' + level) + '<div class="sc-body">' +
      '<div class="small">GPS can\'t tell the floor. Scan the QR at the stair / lift lobby when you arrive on a level, or a room door label — the app remembers your level for 4 hours.</div>' +
      '<div class="sc-actions"><button class="btn brass sc-big" onclick="Geo.scan()">📷 Scan QR</button></div>' +
      '<div class="sublab">Set level manually</div><div class="levelpicker">' + LEVELS.map(function (l) { return '<button class="' + (l === curLevel() ? 'active' : '') + '" onclick="Geo.close();Geo.arrive(\'' + l + '\')">L' + l + '</button>'; }).join('') + '</div>' +
      '<div class="sublab">Print</div>' +
      '<button class="btn ghost" onclick="Geo.printLevel(\'' + e(level) + '\')">🖨 Level ' + e(level) + ' lobby QR (4 per page)</button>' +
      '<button class="btn ghost" onclick="Geo.printDoors(\'' + e(level) + '\')">🖨 Door labels · ' + n + ' rooms on Level ' + e(level) + '</button>' +
      '</div>');
  }
  var scanStream = null, scanTimer = null;
  function stopScan() {
    clearTimeout(scanTimer); scanTimer = null;
    if (scanStream) { scanStream.getTracks().forEach(function (t) { t.stop(); }); scanStream = null; }
  }
  function loadJsQR() {
    return new Promise(function (res, rej) {
      if (window.jsQR) return res();
      var s = document.createElement('script'); s.src = 'vendor/jsQR.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
  }
  function scan() {
    dlg(head('Scan QR', 'Point at the code') + '<div class="sc-body"><video id="geo-vid" playsinline muted autoplay class="geo-vid"></video><div class="small" id="geo-scanmsg">Starting camera…</div></div>');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('geo-scanmsg').textContent = 'Camera not available here — use your phone camera app to scan the QR instead.'; return; }
    var det = ('BarcodeDetector' in window) ? new BarcodeDetector({ formats: ['qr_code'] }) : null;
    Promise.all([navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }), det ? Promise.resolve() : loadJsQR()]).then(function (r) {
      scanStream = r[0]; var v = $('geo-vid'); if (!v) { stopScan(); return; }
      v.srcObject = scanStream; v.play();
      $('geo-scanmsg').textContent = 'Hold the QR inside the frame';
      var cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
      var tick = function () {
        if (!scanStream) return;
        var done = function (txt) { if (txt) { stopScan(); handle(txt); } else scanTimer = setTimeout(tick, 180); };
        if (v.readyState < 2) return done(null);
        if (det) det.detect(v).then(function (c) { done(c[0] && c[0].rawValue); }).catch(function () { done(null); });
        else {
          var w = v.videoWidth, h = v.videoHeight, k = Math.min(1, 720 / Math.max(w, h)); cv.width = w * k; cv.height = h * k;
          cx.drawImage(v, 0, 0, cv.width, cv.height);
          var q = jsQR(cx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, { inversionAttempts: 'dontInvert' });
          done(q && q.data);
        }
      };
      tick();
    }).catch(function () { var m = $('geo-scanmsg'); if (m) m.textContent = 'Camera blocked — allow camera access, or scan with your phone camera app.'; });
  }
  function handle(txt) {
    var m = /#\/here\/([^\/\s]+)(?:\/([^\s]+))?/.exec(txt);
    Locs.closeDlg();
    if (m) arrive(decodeURIComponent(m[1]), m[2] ? decodeURIComponent(m[2]) : '');
    else if (ROOMS[txt.trim()]) location.hash = '#/room/' + encodeURIComponent(txt.trim());
    else alert('QR content: ' + txt);
  }
  function qrImg(text, cell) {
    var q = qrcode(0, 'M'); q.addData(text); q.make();
    return q.createDataURL(cell || 6, 2);
  }
  function printLevel(level) {
    var url = base() + '#/here/' + encodeURIComponent(level), h = '<div class="qr-lv">';
    for (var i = 0; i < 4; i++) h += '<div class="qr-lvc"><div class="qr-t">LEVEL ' + e(level) + '</div><img src="' + qrImg(url, 8) + '"><div class="qr-s">Jeddah Opera House · scan when you arrive on this level</div></div>';
    doPrint(h + '</div>');
  }
  function printDoors(level) {
    var ids = Object.keys(ROOMS).filter(function (k) { return ROOMS[k].baseLevel === level && !ROOMS[k].custom; }).sort();
    var h = '<div class="qr-grid">';
    ids.forEach(function (k) {
      h += '<div class="qr-lab"><img src="' + qrImg(base() + '#/here/' + encodeURIComponent(level) + '/' + encodeURIComponent(k), 3) + '"><div><b>' + e(k) + '</b><br>' + e(ROOMS[k].name || '') + '<br><span>Level ' + e(level) + '</span></div></div>';
    });
    doPrint(h + '</div>');
  }
  function doPrint(h) { close(); document.getElementById('doc').innerHTML = h; setTimeout(function () { window.print(); }, 500); }

  setTimeout(fetchShared, 0);
  return { planTools: planTools, calibrate: calibrate, mark: mark, cancelMark: cancelMark, delPt: delPt, whereAmI: whereAmI, findPhoto: findPhoto, close: close,
    qrMenu: qrMenu, scan: scan, arrive: arrive, printLevel: printLevel, printDoors: printDoors, fromPhoto: fromPhoto, curLevel: curLevel, fit: fit, toPlan: toPlan, _add: addPoint, _pts: points };
})();
