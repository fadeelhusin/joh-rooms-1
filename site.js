/* ============================================================
   JOH Room Storyboard — SITE STATUS (by surface) & LOOK-AHEAD
   • Each room's surfaces come from the Room Finishes Database
     (finishes.js): floor, skirting, every wall finish, ceiling, each door.
   • Each surface has the full stage sequence for its finish type,
     one checkbox per stage. Stages are sequential: ticking a later
     stage completes every stage before it; unticking clears it and
     everything after it.
   • ⛔ Blockers per room, proposals to review, shared through
     data/site-log.json (⚙ Sync token).
   • Look-ahead: the next stage of every surface = work that can be
     opened this week; the one after = next week.
   ============================================================ */
var Site = (function () {
  var PATH = 'data/site-log.json', K_SH = 'joh_site_shared', K_P = 'joh_site_pend', K_USER = 'joh_user';
  function $(id) { return document.getElementById(id); }
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function lsJ(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (x) { return d; } }
  function lsS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (x) { alert('Could not save on this phone (storage full?)'); } }
  function tok() { return window.Locs ? Locs.gh.token() : ''; }
  function toast(m) { if (window.Locs) Locs.toast(m); }

  /* ---------- stage sequences per finish type ---------- */
  var KINDS = {
    fl_coat: ['Slab clean & level survey', 'Screed laid & cured', 'Surface prep / grinding', 'Primer / base coat', 'Finish coat / densifier', 'Protection', 'Inspection & sign-off'],
    fl_tile: ['Level survey & setting-out', 'Screed / waterproofing (wet areas)', 'Sample / dry-lay approval', 'Laying', 'Grouting & movement joints', 'Polish / seal', 'Protection', 'Inspection & sign-off'],
    fl_timber: ['Substrate ready & moisture test', 'Acoustic / membrane layer', 'Laying', 'Sanding & oil / paint', 'Protection', 'Inspection & sign-off'],
    fl_carpet: ['Screed level & moisture test', 'Underlay / adhesive', 'Carpet laid', 'Trims & thresholds', 'Inspection & sign-off'],
    fl_metal: ['Support frame / pedestals', 'Grating / plate fixed', 'Edge trims & fixings', 'Inspection & sign-off'],
    fl_generic: ['Substrate ready', 'Base layer', 'Finish installed', 'Protection', 'Inspection & sign-off'],
    sk: ['Wall finish ready at base', 'Skirting installed', 'Joints / sealant / touch-up', 'Inspection & sign-off'],
    wl_paint: ['Substrate complete', '1st-fix MEP chased & closed', 'Render / skim / board jointing', 'Primer & 1st coat', 'Final coat', 'Inspection & sign-off'],
    wl_tile: ['Substrate complete', '1st-fix MEP closed', 'Render / cement board', 'Waterproofing (wet areas)', 'Tiling', 'Grout & silicone', 'Inspection & sign-off'],
    wl_stone: ['Substrate complete', 'Brackets / sub-frame', 'Sample / mock-up approval', 'Stone installed', 'Pointing & sealing', 'Protection', 'Inspection & sign-off'],
    wl_clad: ['Substrate complete', 'Sub-frame / battens', 'Mock-up approval', 'Panels installed', 'Adjust, trims & protection', 'Inspection & sign-off'],
    wl_acoustic: ['Structure / substrate', 'Acoustic hold-point inspection', 'Sub-frame', 'Acoustic finish installed', 'Inspection & sign-off'],
    wl_exposed: ['Surface repair & make-good', 'Sealer / paint', 'Inspection & sign-off'],
    cl_board: ['Hangers & MF grid', 'MEP above ceiling closed (inspection)', 'Boarding', 'Jointing & access panels', 'Paint', 'Fixtures 2nd fix', 'Inspection & sign-off'],
    cl_grid: ['Hangers & grid', 'MEP above ceiling closed (inspection)', 'Tiles installed', 'Fixtures cut-in', 'Inspection & sign-off'],
    cl_acplaster: ['Frame & substrate boards', 'MEP above ceiling closed (inspection)', 'Acoustic panels', 'Acoustic plaster coats', 'Final texture / finish', 'Inspection & sign-off'],
    cl_clad: ['Hangers & sub-frame', 'MEP above ceiling closed (inspection)', 'Mock-up approval', 'Panels installed', 'Fixtures & trims', 'Inspection & sign-off'],
    cl_exposed: ['Services & soffit make-good', 'Sealer / paint / insulation', 'Inspection & sign-off'],
    door: ['Frame installed', 'Wall finished around frame', 'Leaf hung', 'Ironmongery fitted', 'Final adjust & finish', 'Access control / fire tag & sign-off']
  };
  var CAT = { floor: 'Floor', skirting: 'Skirting', wall: 'Walls', ceiling: 'Ceiling', door: 'Doors' };
  var CAT_ORDER = ['wall', 'ceiling', 'floor', 'skirting', 'door'];
  function surfaces(id) { return (window.FIN_ROOMS && FIN_ROOMS[id]) || []; }
  function surfLabel(sf) { return CAT[sf.c].replace(/s$/, '') + (sf.mark ? ' ' + sf.mark.split('.').pop() : sf.code ? ' ' + sf.code : ''); }
  var BLOCK_TYPES = ['RFI / TQ', 'Material approval', 'Shop drawing', 'MEP not closed', 'Area not released / access', 'Damage / rework', 'Other'];

  /* ---------- shared event log ---------- */
  function shared() { return lsJ(K_SH, []) || []; }
  function pend() { return lsJ(K_P, []) || []; }
  function events() { var seen = {}, out = []; shared().concat(pend()).forEach(function (v) { if (!seen[v.id]) { seen[v.id] = 1; out.push(v); } }); return out.sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : 0; }); }
  var syncing = false, err = '', STATE = null;
  function user() {
    var u = localStorage.getItem(K_USER);
    if (!u) { u = (prompt('Your initials (shown on site updates, e.g. "FH"):') || '').trim().slice(0, 8) || 'site'; try { localStorage.setItem(K_USER, u); } catch (x) {} }
    return u;
  }
  function add(ev) {
    ev.id = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    ev.t = ev.t || new Date().toISOString(); ev.by = ev.by || user();
    var a = pend(); a.push(ev); lsS(K_P, a); STATE = null; sync();
    if (window.markHere && ev.room && ROOMS[ev.room] && !ev.p) markHere(ev.room);
    return ev;
  }
  function fetchShared() {
    var p = tok() ? Locs.gh.read(PATH).then(function (r) { return r.data; })
      : fetch(PATH, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('x'); return r.json(); });
    return p.then(function (d) {
      if (!d || !Array.isArray(d.events)) return;
      var before = shared().length;
      lsS(K_SH, d.events); var have = {}; d.events.forEach(function (v) { have[v.id] = 1; });
      lsS(K_P, pend().filter(function (v) { return !have[v.id]; }));
      STATE = null;
      if (d.events.length !== before) refresh();
    }).catch(function () {}).then(function () { return sync(); });
  }
  function sync(tries) {
    tries = tries || 0;
    if (!tok() || syncing || !pend().length) { status(); return Promise.resolve(); }
    syncing = true; status();
    return Locs.gh.read(PATH).then(function (r) {
      var list = (r.data && r.data.events) || [], have = {};
      list.forEach(function (v) { have[v.id] = 1; });
      pend().forEach(function (v) { if (!have[v.id]) list.push(v); });
      return Locs.gh.write(PATH, { app: 'joh-rooms', updated: new Date().toISOString(), events: list }, r.sha, 'Site log: ' + pend().length + ' update(s)')
        .then(function () { lsS(K_SH, list); lsS(K_P, []); syncing = false; err = ''; STATE = null; status(); });
    }).catch(function (x) { syncing = false; if (x && x.conflict && tries < 2) return sync(tries + 1); err = (x && x.message) || 'Sync failed'; status(); });
  }
  function status() {
    document.querySelectorAll('.site-sync').forEach(function (el) {
      var n = pend().length;
      el.className = 'site-sync loc-sync' + (err ? ' err' : n ? ' wait' : '');
      el.textContent = syncing ? '⏳ Sharing…' : err ? '⚠ ' + err : n ? (tok() ? '⏳ ' + n + ' waiting' : '📱 ' + n + ' on this phone — set up ⚙ Sync') : '☁ Up to date';
    });
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) fetchShared(); });
  window.addEventListener('online', function () { sync(); });

  /* ---------- state from events ---------- */
  function state() {
    if (STATE) return STATE;
    var S = {}, handled = {}, evs = events();
    evs.forEach(function (v) { if (v.k === 'acc' || v.k === 'rej') handled[v.ref] = v.k; });
    function room(id) { return S[id] || (S[id] = { f: {}, fby: {}, bl: {}, last: null }); }
    evs.forEach(function (v) {
      if (v.p && handled[v.id] !== 'acc') return;           // proposals count only once accepted
      var r = room(v.room); if (v.k !== 'acc' && v.k !== 'rej') r.last = v;
      if (v.k === 'fin') { r.f[v.s] = v.n; r.fby[v.s] = { by: v.by, t: v.t }; }
      else if (v.k === 'bl') r.bl[v.id] = { type: v.type, text: v.text, s: v.s, t: v.t, by: v.by, open: true };
      else if (v.k === 'ok' && r.bl[v.ref]) { r.bl[v.ref].open = false; r.bl[v.ref].closed = v.t; }
    });
    STATE = { rooms: S, handled: handled };
    return STATE;
  }
  function roomInfo(id) {
    var sf = surfaces(id); if (!sf.length) return null;
    var r = state().rooms[id] || { f: {}, fby: {}, bl: {}, last: null };
    var tot = 0, done = 0, touched = false;
    var list = sf.map(function (x) {
      var st = KINDS[x.k] || KINDS.fl_generic, n = Math.min(r.f[x.id] || 0, st.length);
      if (r.f[x.id] != null) touched = true;
      tot += st.length; done += n;
      return { sf: x, st: st, n: n, next: n < st.length ? st[n] : null, after: n + 1 < st.length ? st[n + 1] : null, by: r.fby[x.id] };
    });
    var blk = Object.keys(r.bl).map(function (k) { var b = r.bl[k]; b.id = k; return b; }).filter(function (b) { return b.open; });
    var status = !touched && !blk.length ? 'none' : done === tot ? 'handed' : blk.length ? 'blocked' : 'wip';
    return { list: list, blk: blk, r: r, pct: tot ? Math.round(done / tot * 100) : 0, done: done, tot: tot, status: status };
  }
  function pinClass(id) { var i = roomInfo(id); return i ? 'st-' + i.status : ''; }

  /* ---------- room page: surfaces with checkbox stages ---------- */
  function roomSection(id) {
    var i = roomInfo(id);
    setTimeout(status, 0);
    if (!i) return '<div class="card small">No finishes in the Room Schedule for this room.</div>';
    var h = '<h2 class="sec">Finishes progress<span class="n">' + i.pct + '%</span></h2>';
    var pr = proposals().filter(function (p) { return p.room === id; });
    if (pr.length) h += '<div class="site-prop">🤖 ' + pr.length + ' proposed update(s) — review in Look-ahead</div>';
    if (i.blk.length) {
      i.blk.forEach(function (b) { h += '<div class="site-bl"><div><b>⛔ ' + e(b.type) + '</b>' + (b.s ? ' · ' + e(b.s) : '') + '<div class="small" dir="auto">' + e(b.text || '') + ' — ' + e(b.by) + ' ' + e((b.t || '').slice(0, 10)) + '</div></div><button class="btn ghost" onclick="Site.resolve(\'' + e(id) + '\',\'' + b.id + '\')">Resolve</button></div>'; });
    }
    CAT_ORDER.forEach(function (c) {
      var items = i.list.filter(function (x) { return x.sf.c === c; }); if (!items.length) return;
      h += '<div class="fin-cat">' + CAT[c] + '</div>';
      items.forEach(function (x) {
        var sf = x.sf, ci = (window.FIN_CODES && FIN_CODES[sf.code]) || {}, full = x.n === x.st.length;
        h += '<details class="fin-s' + (full ? ' full' : '') + '"' + (x.n > 0 && !full ? ' open' : '') + '><summary><span class="fin-code">' + e(sf.code || '—') + '</span><span class="fin-d" dir="auto">' + e(sf.mark ? 'Door ' + sf.mark : sf.d) + '</span>' +
          '<span class="fin-n">' + x.n + '/' + x.st.length + '</span></summary><div class="body">';
        if (ci.n || ci.s || sf.sub) h += '<div class="fin-spec">' + (ci.n ? '<b>' + e(ci.n) + '</b>' : '') + (sf.sub ? ' · substrate: ' + e(sf.sub) : '') + (ci.s ? '<div class="small">' + e(ci.s) + '</div>' : '') + '</div>';
        x.st.forEach(function (nm, k) {
          var on = k < x.n;
          h += '<label class="fin-st' + (on ? ' on' : k === x.n ? ' nx' : '') + '"><input type="checkbox"' + (on ? ' checked' : '') + ' onchange="Site.tick(\'' + e(id) + '\',\'' + e(sf.id) + '\',' + k + ')"><span>' + e(nm) + '</span></label>';
        });
        if (x.by) h += '<div class="small">Last update ' + e(x.by.by || '') + ' ' + e((x.by.t || '').slice(0, 10)) + '</div>';
        h += '<div class="fin-acts"><button class="btn ghost" onclick="SiteCam.open(\'' + e(id) + '\',\'' + e(sf.id) + '\')">📷 Photo</button><button class="btn ghost loc-del" onclick="Site.blockDlg(\'' + e(id) + '\',\'' + e(sf.id) + '\')">⛔ Blocker</button></div></div></details>';
      });
    });
    h += '<div class="sc-actions"><button class="btn ghost loc-del" onclick="Site.blockDlg(\'' + e(id) + '\')">⛔ Room blocker</button></div><div class="small"><span class="site-sync loc-sync"></span></div>';
    return h;
  }
  /* sequential: ticking stage k ⇒ stages 0..k done; unticking stage k ⇒ only 0..k-1 done */
  function tick(id, sid, k) {
    var i = roomInfo(id), x = i && i.list.filter(function (y) { return y.sf.id === sid; })[0]; if (!x) return;
    var n = k < x.n ? k : k + 1;
    add({ room: id, k: 'fin', s: sid, n: n });
    refresh(); toast(n > x.n ? '✅ ' + x.st[n - 1] : '↺ back to ' + (n ? x.st[n - 1] : 'not started'));
  }
  function blockDlg(id, sid) {
    var sf = surfaces(id);
    Locs.dlg('<div class="sc-head"><div><div class="eyebrow" style="color:#d8cdb6">' + e(id) + '</div><div class="rn">⛔ Add blocker</div></div><button class="sc-x" onclick="Locs.closeDlg()">✕</button></div>' +
      '<div class="sc-body"><div class="sublab">Type</div><select id="bl-type" class="loc-in">' + BLOCK_TYPES.map(function (b) { return '<option>' + e(b) + '</option>'; }).join('') + '</select>' +
      '<div class="sublab">Surface</div><select id="bl-stage" class="loc-in"><option value="">(whole room)</option>' + sf.map(function (s) { return '<option value="' + e(s.id) + '"' + (s.id === sid ? ' selected' : '') + '>' + e(surfLabel(s) + ' · ' + (s.mark ? '' : s.d)) + '</option>'; }).join('') + '</select>' +
      '<div class="sublab">Details (RFI no., material, what\'s missing…)</div><input id="bl-text" class="loc-in" dir="auto" placeholder="e.g. RFI-123 ceiling level clash with duct">' +
      '<div class="sc-actions"><button class="btn brass sc-big" onclick="Site.saveBlock(\'' + e(id) + '\')">Save blocker</button></div></div>');
  }
  function saveBlock(id) {
    add({ room: id, k: 'bl', type: $('bl-type').value, s: $('bl-stage').value || undefined, text: ($('bl-text').value || '').trim() });
    Locs.closeDlg(); refresh(); toast('⛔ Blocker saved');
  }
  function resolve(id, ref) { if (!confirm('Mark this blocker as resolved?')) return; add({ room: id, k: 'ok', ref: ref }); refresh(); }
  /* photo tagged with a surface stage: "sid|stageIndex" — marks that stage (and all before) done */
  function photoOptions(id, sid) {
    var i = roomInfo(id); if (!i) return '';
    var o = '<option value="">— photo only —</option>';
    i.list.forEach(function (x) {
      o += '<optgroup label="' + e(surfLabel(x.sf) + ' · ' + (x.sf.mark ? 'door' : x.sf.d)) + '">';
      x.st.forEach(function (nm, k) { o += '<option value="' + e(x.sf.id) + '|' + k + '"' + (x.sf.id === sid && k === x.n ? ' selected' : '') + '>' + (k < x.n ? '✓ ' : '') + e(nm) + '</option>'; });
      o += '</optgroup>';
    });
    return o;
  }
  function photoLabel(id, val) {
    if (!val) return ''; var p = val.split('|'), sf = surfaces(id).filter(function (s) { return s.id === p[0]; })[0]; if (!sf) return '';
    return surfLabel(sf) + ' · ' + (KINDS[sf.k] || [])[+p[1]];
  }
  function photoEvent(id, val, done, name) {
    add({ room: id, k: 'photo', s: val || undefined, text: name });
    if (val && done) { var p = val.split('|'), i = roomInfo(id), x = i.list.filter(function (y) { return y.sf.id === p[0]; })[0]; if (x && +p[1] + 1 > x.n) add({ room: id, k: 'fin', s: p[0], n: +p[1] + 1 }); }
  }

  /* ---------- proposals (review queue) ---------- */
  function proposals() { var h = state().handled; return events().filter(function (v) { return v.p && !h[v.id]; }); }
  function accept(pid) { add({ room: (events().filter(function (v) { return v.id === pid; })[0] || {}).room, k: 'acc', ref: pid }); refresh(); }
  function reject(pid) { add({ room: (events().filter(function (v) { return v.id === pid; })[0] || {}).room, k: 'rej', ref: pid }); refresh(); }
  function acceptAll() { proposals().forEach(function (p) { add({ room: p.room, k: 'acc', ref: p.id }); }); refresh(); }
  function propText(p) {
    if (p.k === 'fin') { var sf = surfaces(p.room).filter(function (s) { return s.id === p.s; })[0]; return sf ? '✅ ' + surfLabel(sf) + ' → ' + ((KINDS[sf.k] || [])[p.n - 1] || 'not started') : p.s; }
    if (p.k === 'bl') return '⛔ ' + p.type;
    return p.k;
  }

  /* ---------- sheet line under a plan pin ---------- */
  function sheetLine(id) {
    var i = roomInfo(id); if (!i) return '';
    if (i.status === 'none') return '<div class="site-line">Not surveyed yet</div>';
    if (i.status === 'handed') return '<div class="site-line">✅ All finishes complete</div>';
    var nx = i.list.filter(function (x) { return x.next; }).slice(0, 3).map(function (x) { return surfLabel(x.sf) + ': ' + x.next; });
    return '<div class="site-line">' + (i.blk.length ? '⛔ ' + i.blk.length + ' blocker(s) · ' : '') + i.pct + '% · next: ' + e(nx.join(' · ')) + '</div>';
  }

  /* ---------- LOOK-AHEAD page ---------- */
  var LA_LVL = '00';
  function lookahead(level) {
    LA_LVL = level || LA_LVL;
    var ids = Object.keys(ROOMS).filter(function (k) { return ROOMS[k].baseLevel === LA_LVL && surfaces(k).length; }).sort();
    var rows = ids.map(function (k) { return { id: k, i: roomInfo(k) }; });
    var cnt = { none: 0, blocked: 0, wip: 0, handed: 0 };
    rows.forEach(function (r) { cnt[r.i.status]++; });
    var h = '<div class="levelpicker">';
    LEVELS.forEach(function (l) { h += '<button class="' + (l === LA_LVL ? 'active' : '') + '" onclick="location.hash=\'#/lookahead/' + l + '\'">Level ' + l + '</button>'; });
    h += '</div><div class="la-kpi four">' +
      '<div class="k wip"><b>' + cnt.wip + '</b>in progress</div><div class="k blocked"><b>' + cnt.blocked + '</b>blocked</div>' +
      '<div class="k handed"><b>' + cnt.handed + '</b>complete</div><div class="k none"><b>' + cnt.none + '</b>not surveyed</div></div>';
    h += '<div class="sc-actions"><button class="btn brass" onclick="Site.exportXlsx()">⬇ Excel</button><span class="site-sync loc-sync"></span></div>';
    var pr = proposals().filter(function (p) { return ROOMS[p.room] && ROOMS[p.room].baseLevel === LA_LVL; });
    if (pr.length) {
      h += '<h2 class="sec">🤖 Review<span class="n">' + pr.length + '</span></h2><div class="card">';
      pr.forEach(function (p) {
        h += '<div class="geo-row"><span><b>' + e(p.room) + '</b> ' + e(propText(p)) + (p.text ? '<br><span class="small" dir="auto">' + e(p.text) + '</span>' : '') + '</span><span style="white-space:nowrap"><button class="btn brass" onclick="Site.accept(\'' + p.id + '\')">✓</button><button class="btn ghost" onclick="Site.reject(\'' + p.id + '\')">✕</button></span></div>';
      });
      h += '<button class="btn ghost" onclick="Site.acceptAll()">Accept all</button></div>';
    }
    var w1 = {}, w2 = {}, blocked = [];
    rows.forEach(function (r) {
      var i = r.i; if (i.status === 'none' || i.status === 'handed') return;
      if (i.blk.length) { blocked.push(r); }
      var bs = {}; i.blk.forEach(function (b) { bs[b.s || '*'] = 1; });
      i.list.forEach(function (x) {
        if (!x.next || bs['*'] || bs[x.sf.id]) return;
        var k1 = CAT[x.sf.c] + ' · ' + x.next; (w1[k1] = w1[k1] || []).push(r.id);
        if (x.after) { var k2 = CAT[x.sf.c] + ' · ' + x.after; (w2[k2] = w2[k2] || []).push(r.id); }
      });
    });
    var grp = function (title, map) {
      var keys = Object.keys(map).sort(function (a, b) { return a < b ? -1 : 1; });
      var x = '<h2 class="sec">' + title + '<span class="n">' + keys.length + ' activities</span></h2>';
      if (!keys.length) return x + '<div class="card small">Nothing yet — tick stages on site to build the plan.</div>';
      keys.forEach(function (k) {
        var u = map[k].filter(function (v, j, a) { return a.indexOf(v) === j; });
        x += '<details class="la-grp"><summary>' + e(k) + '<span class="cnt">' + u.length + '</span></summary><div class="body">' +
          u.map(function (id) { return '<span class="roomchip" onclick="location.hash=\'#/room/' + encodeURIComponent(id) + '\'">' + e(id) + ' · ' + e(ROOMS[id].name || '') + '</span>'; }).join('') + '</div></details>';
      });
      return x;
    };
    h += grp('🟢 This week — can open now', w1);
    h += grp('🟡 Next week — follows on', w2);
    h += '<h2 class="sec">⛔ Blocked<span class="n">' + blocked.length + '</span></h2><div class="card">' + (blocked.length ? '' : '<span class="small">No open blockers.</span>');
    blocked.forEach(function (r) { h += '<div class="geo-row" onclick="location.hash=\'#/room/' + encodeURIComponent(r.id) + '\'" style="cursor:pointer"><span><b>' + e(r.id) + '</b> ' + e(ROOMS[r.id].name || '') + '<br><span class="small">' + r.i.blk.map(function (b) { return e(b.type + (b.text ? ': ' + b.text : '')); }).join(' · ') + '</span></span></div>'; });
    h += '</div>';
    document.getElementById('app').innerHTML = h;
    setTimeout(status, 0);
  }
  function loadXlsx() { return new Promise(function (res, rej) { if (window.XLSX) return res(); var s = document.createElement('script'); s.src = 'vendor/xlsx.mini.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  function exportXlsx() {
    loadXlsx().then(function () {
      var ids = Object.keys(ROOMS).filter(function (k) { return surfaces(k).length; }).sort();
      var today = new Date(), wk = function (n) { var d = new Date(today); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
      var la = [['Level', 'Room', 'Name', 'Grid', 'Surface', 'Code', 'Finish', 'Week', 'Window', 'Activity', 'Stage no.', 'Blocked by']];
      var sf = [['Level', 'Room', 'Name', 'Grid', 'Surface', 'Code', 'Finish', 'Done', 'Of', '%', 'Last completed stage', 'Next stage', 'Updated', 'By']];
      var bl = [['Level', 'Room', 'Name', 'Type', 'Surface', 'Details', 'Raised', 'By']];
      ids.forEach(function (k) {
        var r = ROOMS[k], i = roomInfo(k), g = window.Grid && Grid.ofRoom(k), gr = g ? g.text : '';
        var bs = {}; i.blk.forEach(function (b) { bs[b.s || '*'] = (bs[b.s || '*'] ? bs[b.s || '*'] + ' | ' : '') + b.type + (b.text ? ': ' + b.text : ''); bl.push([r.baseLevel, k, r.name, b.type, b.s || '(room)', b.text || '', (b.t || '').slice(0, 10), b.by || '']); });
        i.list.forEach(function (x) {
          var fin = x.sf.mark ? 'Door ' + x.sf.mark : x.sf.d;
          sf.push([r.baseLevel, k, r.name, gr, CAT[x.sf.c], x.sf.code, fin, x.n, x.st.length, Math.round(x.n / x.st.length * 100), x.n ? x.st[x.n - 1] : '', x.next || 'Complete', x.by ? (x.by.t || '').slice(0, 10) : '', x.by ? x.by.by : '']);
          if (i.status === 'none' || !x.next) return;
          var why = bs['*'] || bs[x.sf.id] || '';
          la.push([r.baseLevel, k, r.name, gr, CAT[x.sf.c], x.sf.code, fin, why ? 'Blocked' : 'Week 1', why ? '' : wk(0) + ' → ' + wk(6), x.next, x.n + 1, why]);
          if (x.after && !why) la.push([r.baseLevel, k, r.name, gr, CAT[x.sf.c], x.sf.code, fin, 'Week 2', wk(7) + ' → ' + wk(13), x.after, x.n + 2, '']);
        });
      });
      var wb = XLSX.utils.book_new();
      [['Look-ahead', la], ['Surface status', sf], ['Blockers', bl]].forEach(function (p) {
        var ws = XLSX.utils.aoa_to_sheet(p[1]);
        ws['!cols'] = p[1][0].map(function (h, c) { return { wch: Math.min(46, Math.max(7, h.length + 2, p[1].slice(1, 300).reduce(function (m, row) { return Math.max(m, String(row[c] == null ? '' : row[c]).length); }, 0))) }; });
        ws['!autofilter'] = { ref: ws['!ref'] };
        XLSX.utils.book_append_sheet(wb, ws, p[0]);
      });
      XLSX.writeFile(wb, 'JOH_Lookahead_' + today.toISOString().slice(0, 10) + '.xlsx');
    }).catch(function () { alert('Could not load the Excel exporter — open the app once online.'); });
  }

  function refresh() {
    STATE = null;
    if (document.querySelector('#loc-dlg.on') || document.querySelector('#sc-modal.on') || document.querySelector('#pvb.adding')) return;
    var y = window.scrollY, open = [].map.call(document.querySelectorAll('details.fin-s[open] .fin-code'), function (n) { return n.parentNode.parentNode.querySelector('.fin-d').textContent; });
    route(); window.scrollTo(0, y);
    document.querySelectorAll('details.fin-s').forEach(function (d) { if (open.indexOf(d.querySelector('.fin-d').textContent) >= 0) d.open = true; });
  }
  setTimeout(fetchShared, 0);
  return { KINDS: KINDS, surfaces: surfaces, roomInfo: roomInfo, pinClass: pinClass, roomSection: roomSection, tick: tick, blockDlg: blockDlg, saveBlock: saveBlock, resolve: resolve,
    photoOptions: photoOptions, photoLabel: photoLabel, photoEvent: photoEvent, proposals: proposals, accept: accept, reject: reject, acceptAll: acceptAll, sheetLine: sheetLine, lookahead: lookahead, exportXlsx: exportXlsx, fetchShared: fetchShared, _events: events, _add: add };
})();
