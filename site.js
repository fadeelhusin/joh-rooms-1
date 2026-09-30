/* ============================================================
   JOH Room Storyboard — SITE STATUS & LOOK-AHEAD
   • Every room gets a stage template by room type
     (A BOH Dry · B Wet · C FOH Decorative · D Technical · E Theatre interfaces).
   • On site: mark stages ▶ in progress / ✅ done (walk-down: "done up to here"),
     log ⛔ blockers (RFI, material approval, shop drawing, MEP, access…).
   • Everything is an event in data/site-log.json, shared with the team
     through the same GitHub token as locations (⚙ Sync).
   • Proposed updates (e.g. from Claude's photo review) arrive as proposals
     you Accept / Reject in the Review list.
   • Look-ahead: rooms that can OPEN this week, will open next week,
     are in progress, or are blocked — with Excel export.
   ============================================================ */
var Site = (function () {
  var PATH = 'data/site-log.json', K_SH = 'joh_site_shared', K_P = 'joh_site_pend', K_USER = 'joh_user';
  function $(id) { return document.getElementById(id); }
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function lsJ(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (x) { return d; } }
  function lsS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (x) { alert('Could not save on this phone (storage full?)'); } }
  function tok() { return window.Locs ? Locs.gh.token() : ''; }
  function toast(m) { if (window.Locs) Locs.toast(m); }

  /* ---------- stage templates ---------- */
  var T = {
    A: { name: 'BOH Dry', st: [
      ['A1', 'Setting-out & partitions / blockwork'], ['A2', '1st-fix MEP (walls & ceiling void)', 'A1'], ['A3', 'Boarding, insulation & close-up inspection', 'A2'],
      ['A4', 'Ceiling grid / bulkheads', 'A3'], ['A5', 'Wall prep & paint 1st coat', 'A3'], ['A6', 'Flooring & skirting', 'A5'],
      ['A7', 'Doors, frames & ironmongery', 'A6'], ['A8', '2nd-fix MEP & ceiling close', 'A4,A5'], ['A9', 'Final paint & clean', 'A7,A8'],
      ['A10', 'FF&E install', 'A9'], ['A11', 'Snag & handover', 'A10']] },
    B: { name: 'Wet room', st: [
      ['B1', 'Setting-out & blockwork / partitions'], ['B2', '1st-fix MEP & plumbing', 'B1'], ['B3', 'Boarding / render & close-up inspection', 'B2'],
      ['B4', 'Waterproofing & flood test', 'B3'], ['B5', 'Screed & falls', 'B4'], ['B6', 'Wall tiling / cladding', 'B4'], ['B7', 'Floor tiling', 'B5,B6'],
      ['B8', 'Moisture-resistant ceiling', 'B3'], ['B9', 'Doors, cubicles & vanity joinery', 'B7'], ['B10', 'Sanitaryware & 2nd-fix MEP', 'B7,B8'],
      ['B11', 'Paint, sealants & clean', 'B9,B10'], ['B12', 'Snag & handover', 'B11']] },
    C: { name: 'FOH Decorative', st: [
      ['C1', 'Setting-out & substrate / partitions'], ['C2', '1st-fix MEP & services coordination', 'C1'], ['C3', 'Mock-up / sample approval on site'],
      ['C4', 'Substrate close-up inspection', 'C2'], ['C5', 'Feature ceilings / GRG', 'C4'], ['C6', 'Wall cladding (stone / timber / GRG)', 'C3,C4'],
      ['C7', 'Floor finishes (stone / carpet / timber)', 'C6'], ['C8', 'Bespoke joinery & doors', 'C7'], ['C9', 'Feature lighting & 2nd-fix MEP', 'C5'],
      ['C10', 'Final finishes, protection & clean', 'C8,C9'], ['C11', 'FF&E / loose furniture', 'C10'], ['C12', 'Snag & handover', 'C11']] },
    D: { name: 'Technical', st: [
      ['D1', 'Blockwork / partitions & openings'], ['D2', 'MEP installation', 'D1'], ['D3', 'Wall paint / dust sealing', 'D1'],
      ['D4', 'Floor epoxy / sealer', 'D3'], ['D5', 'Doors, louvres & access control', 'D4'], ['D6', 'MEP T&C and handover docs', 'D2,D5'], ['D7', 'Snag & handover', 'D6']] },
    E: { name: 'Theatre interfaces', st: [
      ['E1', 'Area released to specialist'], ['E2', 'Structure / MEP interfaces closed (hold point)', 'E1'], ['E3', 'Acoustic hold-point inspection', 'E2'],
      ['E4', 'Specialist finishes & seating', 'E3'], ['E5', 'Stage / technical systems interfaces', 'E3'], ['E6', 'Joint inspection & handover', 'E4,E5']] }
  };
  Object.keys(T).forEach(function (k) {
    T[k].by = {};
    T[k].st = T[k].st.map(function (s) { var o = { id: s[0], name: s[1], after: s[2] ? s[2].split(',') : [] }; T[k].by[o.id] = o; return o; });
  });
  var WET = /toilet|sanitar|\bwc\b|ablution|shower|kitchen|pantry|servery|cleaner|kitchenette|coldroom|cold room|wash|laundry|sluice/i;
  var FOHN = /foyer|lounge|entrance|caf[eé]|bar\b|vip|lobby|prayer|reception|hall\b/i;
  function tplOf(id) {
    var r = ROOMS[id]; if (!r) return null;
    if (r.custom) return null;
    var a = r.abbr, n = r.name || '';
    if (/^(LTS|MTS|LTA|MTA|REH|RHE)$/.test(a)) return 'E';
    if (/^(TEC|SHA|VEC|LOA)$/.test(a)) return 'D';
    if (/^(TOI|TOIL)$/.test(a) || WET.test(n)) return 'B';
    if (/^(FOY|VIP|PRA|EDU)$/.test(a) || (a === 'CAT' && /seating|caf|bar|restaurant/i.test(n)) || FOHN.test(n)) return 'C';
    return 'A';
  }
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
    var a = pend(); a.push(ev); lsS(K_P, a); STATE = null; sync(); return ev;
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
    var S = {}, handled = {};
    var evs = events();
    evs.forEach(function (v) { if (v.k === 'acc' || v.k === 'rej') handled[v.ref] = v.k; });
    function room(id) { return S[id] || (S[id] = { st: {}, bl: {}, last: null, photos: 0 }); }
    evs.forEach(function (v) {
      if (v.p && handled[v.id] !== 'acc') return;           // proposals count only once accepted
      var r = room(v.room); r.last = v;
      if (v.k === 'st') {
        var tp = T[tplOf(v.room)];
        if (v.v === 'clear') { delete r.st[v.stage]; return; }
        r.st[v.stage] = { v: v.v, t: v.t, by: v.by };
        if (tp && ((v.v === 'done' && v.all) || v.v === 'wip')) {   // walk-down / a started stage: everything before it is done
          var mark = function (sid) { var s = tp.by[sid]; if (!s) return; s.after.forEach(function (a) { if (!r.st[a] || r.st[a].v !== 'done') r.st[a] = { v: 'done', t: v.t, by: v.by, auto: 1 }; mark(a); }); };
          mark(v.stage);
        }
      } else if (v.k === 'bl') r.bl[v.id] = { type: v.type, text: v.text, stage: v.stage, t: v.t, by: v.by, open: true };
      else if (v.k === 'ok' && r.bl[v.ref]) { r.bl[v.ref].open = false; r.bl[v.ref].closed = v.t; }
      else if (v.k === 'photo') r.photos++;
    });
    STATE = { rooms: S, handled: handled };
    return STATE;
  }
  function roomInfo(id) {
    var tk = tplOf(id), tp = T[tk]; if (!tp) return null;
    var r = state().rooms[id] || { st: {}, bl: {}, last: null };
    var done = function (s) { return r.st[s] && r.st[s].v === 'done'; };
    var wip = function (s) { return r.st[s] && r.st[s].v === 'wip'; };
    var next = tp.st.filter(function (s) { return !done(s.id) && !wip(s.id) && s.after.every(done); });
    var soon = tp.st.filter(function (s) { return !done(s.id) && !wip(s.id) && !s.after.every(done) && s.after.every(function (a) { return done(a) || wip(a); }); });
    var blk = Object.keys(r.bl).map(function (k) { var b = r.bl[k]; b.id = k; return b; }).filter(function (b) { return b.open; });
    var nDone = tp.st.filter(function (s) { return done(s.id); }).length;
    var status = !Object.keys(r.st).length && !blk.length ? 'none' : nDone === tp.st.length ? 'handed' : blk.length ? 'blocked' : next.length ? 'ready' : 'wip';
    return { tk: tk, tp: tp, r: r, done: done, wip: wip, next: next, soon: soon, blk: blk, nDone: nDone, status: status,
      inprog: tp.st.filter(function (s) { return wip(s.id); }) };
  }
  function pinClass(id) { var i = roomInfo(id); return i ? 'st-' + i.status : ''; }

  /* ---------- room page section ---------- */
  function roomSection(id) {
    var i = roomInfo(id); if (!i) return '';
    setTimeout(status, 0);
    var h = '<h2 class="sec">Site Status<span class="n">' + e(i.tp.name) + ' · ' + i.nDone + '/' + i.tp.st.length + '</span></h2><div class="card site-card">';
    var pr = proposals().filter(function (p) { return p.room === id; });
    if (pr.length) h += '<div class="site-prop">🤖 ' + pr.length + ' proposed update(s) waiting — <a href="#/lookahead" onclick="">review</a></div>';
    if (i.blk.length) {
      h += '<div class="sublab" style="color:var(--red)">⛔ Open blockers</div>';
      i.blk.forEach(function (b) { h += '<div class="site-bl"><div><b>' + e(b.type) + '</b>' + (b.stage ? ' · ' + e(b.stage) : '') + '<div class="small" dir="auto">' + e(b.text || '') + ' — ' + e(b.by) + ' ' + e(b.t.slice(0, 10)) + '</div></div><button class="btn ghost" onclick="Site.resolve(\'' + e(id) + '\',\'' + b.id + '\')">Resolve</button></div>'; });
    }
    h += '<div class="small" style="margin:4px 0 6px">Tap a stage: ▶ started · ✅ done (walk-down marks everything before it too).</div>';
    i.tp.st.forEach(function (s) {
      var st = i.r.st[s.id], ready = !st && s.after.every(i.done);
      var ic = st ? (st.v === 'done' ? '✅' : '▶') : ready ? '🟢' : '·';
      h += '<div class="site-st ' + (st ? st.v : ready ? 'ready' : 'locked') + '" onclick="Site.stageMenu(\'' + e(id) + '\',\'' + s.id + '\')"><span class="ic">' + ic + '</span><span class="sid">' + s.id + '</span><span class="snm">' + e(s.name) + '</span>' +
        (st ? '<span class="sby">' + e(st.by || '') + ' ' + e((st.t || '').slice(5, 10)) + '</span>' : ready ? '<span class="sby">ready to open</span>' : '') + '</div>';
    });
    h += '<div class="sc-actions"><button class="btn ghost loc-del" onclick="Site.blockDlg(\'' + e(id) + '\')">⛔ Add blocker</button><button class="btn ghost" onclick="SiteCam.open(\'' + e(id) + '\')">📷 Photo</button></div>';
    h += '<div class="small"><span class="site-sync loc-sync"></span></div></div>';
    return h;
  }
  function stageMenu(id, sid) {
    var tp = T[tplOf(id)], s = tp.by[sid];
    Locs.dlg('<div class="sc-head"><div><div class="eyebrow" style="color:#d8cdb6">' + e(id) + ' · ' + e(tp.name) + '</div><div class="rn">' + e(s.id + ' ' + s.name) + '</div></div><button class="sc-x" onclick="Locs.closeDlg()">✕</button></div>' +
      '<div class="sc-body"><div class="sc-actions" style="flex-direction:column">' +
      '<button class="btn brass sc-big" onclick="Site.setStage(\'' + e(id) + '\',\'' + sid + '\',\'done\',1)">✅ Done (and everything before it)</button>' +
      '<button class="btn ghost" onclick="Site.setStage(\'' + e(id) + '\',\'' + sid + '\',\'done\',0)">✅ Done (this stage only)</button>' +
      '<button class="btn ghost" onclick="Site.setStage(\'' + e(id) + '\',\'' + sid + '\',\'wip\',0)">▶ Started / in progress</button>' +
      '<button class="btn ghost" onclick="Site.blockDlg(\'' + e(id) + '\',\'' + sid + '\')">⛔ Blocked…</button>' +
      '<button class="btn ghost" onclick="Site.setStage(\'' + e(id) + '\',\'' + sid + '\',\'clear\',0)">↺ Clear</button>' +
      '<button class="btn ghost" onclick="Locs.closeDlg();SiteCam.open(\'' + e(id) + '\',\'' + sid + '\')">📷 Photo for this stage</button></div></div>');
  }
  function setStage(id, sid, v, all) {
    add({ room: id, k: 'st', stage: sid, v: v, all: all ? 1 : undefined });
    Locs.closeDlg(); refresh(); toast(v === 'clear' ? 'Cleared' : v === 'done' ? '✅ ' + sid + ' done' : '▶ ' + sid + ' started');
  }
  function blockDlg(id, sid) {
    var tp = T[tplOf(id)];
    Locs.dlg('<div class="sc-head"><div><div class="eyebrow" style="color:#d8cdb6">' + e(id) + '</div><div class="rn">⛔ Add blocker</div></div><button class="sc-x" onclick="Locs.closeDlg()">✕</button></div>' +
      '<div class="sc-body"><div class="sublab">Type</div><select id="bl-type" class="loc-in">' + BLOCK_TYPES.map(function (b) { return '<option>' + e(b) + '</option>'; }).join('') + '</select>' +
      '<div class="sublab">Stage it blocks</div><select id="bl-stage" class="loc-in"><option value="">(whole room)</option>' + tp.st.map(function (s) { return '<option value="' + s.id + '"' + (s.id === sid ? ' selected' : '') + '>' + s.id + ' ' + e(s.name) + '</option>'; }).join('') + '</select>' +
      '<div class="sublab">Details (RFI no., material, what\'s missing…)</div><input id="bl-text" class="loc-in" dir="auto" placeholder="e.g. RFI-123 ceiling level clash with duct">' +
      '<div class="sc-actions"><button class="btn brass sc-big" onclick="Site.saveBlock(\'' + e(id) + '\')">Save blocker</button></div></div>');
  }
  function saveBlock(id) {
    add({ room: id, k: 'bl', type: $('bl-type').value, stage: $('bl-stage').value || undefined, text: ($('bl-text').value || '').trim() });
    Locs.closeDlg(); refresh(); toast('⛔ Blocker saved');
  }
  function resolve(id, ref) { if (!confirm('Mark this blocker as resolved?')) return; add({ room: id, k: 'ok', ref: ref }); refresh(); }
  function photoEvent(id, sid, v, name) { add({ room: id, k: 'photo', stage: sid || undefined, text: name }); if (sid && v) add({ room: id, k: 'st', stage: sid, v: v }); }

  /* ---------- proposals (review queue) ---------- */
  function proposals() { var h = state().handled; return events().filter(function (v) { return v.p && !h[v.id]; }); }
  function accept(pid) { add({ room: (events().filter(function (v) { return v.id === pid; })[0] || {}).room, k: 'acc', ref: pid }); refresh(); }
  function reject(pid) { add({ room: (events().filter(function (v) { return v.id === pid; })[0] || {}).room, k: 'rej', ref: pid }); refresh(); }
  function acceptAll() { proposals().forEach(function (p) { add({ room: p.room, k: 'acc', ref: p.id }); }); refresh(); }

  /* ---------- sheet line under a plan pin ---------- */
  function sheetLine(id) {
    var i = roomInfo(id); if (!i) return '';
    var t = i.blk.length ? '⛔ ' + i.blk.length + ' blocker(s)' : '';
    var nx = i.inprog.length ? '▶ ' + i.inprog.map(function (s) { return s.id; }).join(', ') : '';
    var op = i.next.length ? '🟢 open: ' + i.next.map(function (s) { return s.id + ' ' + s.name; }).slice(0, 2).join(' · ') : '';
    return '<div class="site-line">' + [t, nx, op].filter(Boolean).map(e).join('  ') + (i.status === 'none' ? 'No site status yet — walk-down needed' : i.status === 'handed' ? '✅ Handed over' : '') + '</div>';
  }

  /* ---------- LOOK-AHEAD page ---------- */
  var LA_LVL = '00';
  function lookahead(level) {
    LA_LVL = level || LA_LVL;
    var ids = Object.keys(ROOMS).filter(function (k) { return ROOMS[k].baseLevel === LA_LVL && !ROOMS[k].custom && tplOf(k); }).sort();
    var rows = ids.map(function (k) { return { id: k, i: roomInfo(k) }; });
    var cnt = { none: 0, blocked: 0, ready: 0, wip: 0, handed: 0 };
    rows.forEach(function (r) { cnt[r.i.status]++; });
    var h = '<div class="eyebrow" style="padding:4px 2px 0">2-week look-ahead · what can be opened</div><div class="levelpicker">';
    LEVELS.forEach(function (l) { h += '<button class="' + (l === LA_LVL ? 'active' : '') + '" onclick="location.hash=\'#/lookahead/' + l + '\'">Level ' + l + '</button>'; });
    h += '</div><div class="la-kpi">' +
      '<div class="k ready"><b>' + cnt.ready + '</b>ready</div><div class="k wip"><b>' + cnt.wip + '</b>in progress</div><div class="k blocked"><b>' + cnt.blocked + '</b>blocked</div>' +
      '<div class="k handed"><b>' + cnt.handed + '</b>handed over</div><div class="k none"><b>' + cnt.none + '</b>not surveyed</div></div>';
    h += '<div class="sc-actions"><button class="btn brass" onclick="Site.exportXlsx()">⬇ Excel (look-ahead + status)</button><span class="site-sync loc-sync"></span></div>';
    var pr = proposals().filter(function (p) { return ROOMS[p.room] && ROOMS[p.room].baseLevel === LA_LVL; });
    if (pr.length) {
      h += '<h2 class="sec">🤖 Proposed updates to review<span class="n">' + pr.length + '</span></h2><div class="card">';
      pr.forEach(function (p) {
        var what = p.k === 'st' ? (p.v === 'done' ? '✅ ' : '▶ ') + p.stage + ' ' + ((T[tplOf(p.room)] || { by: {} }).by[p.stage] || {}).name : p.k === 'bl' ? '⛔ ' + p.type : p.k;
        h += '<div class="geo-row"><span><b>' + e(p.room) + '</b> ' + e(what) + (p.text ? '<br><span class="small" dir="auto">' + e(p.text) + '</span>' : '') + '</span><span style="white-space:nowrap"><button class="btn brass" onclick="Site.accept(\'' + p.id + '\')">✓</button><button class="btn ghost" onclick="Site.reject(\'' + p.id + '\')">✕</button></span></div>';
      });
      h += '<button class="btn ghost" onclick="Site.acceptAll()">Accept all</button></div>';
    }
    // group: open this week (by stage), opening next week, blocked, in progress
    var byStage = {}, soon = {}, blocked = [], wip = [];
    rows.forEach(function (r) {
      var i = r.i;
      if (i.status === 'none' || i.status === 'handed') return;   // only surveyed rooms feed the plan
      if (i.blk.length) blocked.push(r);
      else i.next.forEach(function (s) { (byStage[s.name] = byStage[s.name] || []).push(r.id); });
      if (!i.blk.length) i.soon.forEach(function (s) { (soon[s.name] = soon[s.name] || []).push(r.id); });
      if (i.inprog.length) wip.push(r);
    });
    var grp = function (title, cls, map) {
      var keys = Object.keys(map).sort(function (a, b) { return map[b].length - map[a].length; });
      var x = '<h2 class="sec">' + title + '<span class="n">' + keys.reduce(function (n, k) { return n + map[k].length; }, 0) + '</span></h2>';
      if (!keys.length) return x + '<div class="card small">Nothing yet.</div>';
      keys.forEach(function (k) {
        x += '<details class="la-grp ' + cls + '"><summary>' + e(k) + '<span class="cnt">' + map[k].length + '</span></summary><div class="body">' +
          map[k].map(function (id) { return '<span class="roomchip" onclick="location.hash=\'#/room/' + encodeURIComponent(id) + '\'">' + e(id) + ' · ' + e(ROOMS[id].name || '') + '</span>'; }).join('') + '</div></details>';
      });
      return x;
    };
    h += grp('🟢 Week 1 — can open now', 'ready', byStage);
    h += grp('🟡 Week 2 — opens when current work finishes', 'soon', soon);
    h += '<h2 class="sec">⛔ Blocked<span class="n">' + blocked.length + '</span></h2><div class="card">' + (blocked.length ? '' : '<span class="small">No open blockers.</span>');
    blocked.forEach(function (r) { h += '<div class="geo-row" onclick="location.hash=\'#/room/' + encodeURIComponent(r.id) + '\'" style="cursor:pointer"><span><b>' + e(r.id) + '</b> ' + e(ROOMS[r.id].name || '') + '<br><span class="small">' + r.i.blk.map(function (b) { return e(b.type + (b.text ? ': ' + b.text : '')); }).join(' · ') + '</span></span></div>'; });
    h += '</div><h2 class="sec">▶ In progress<span class="n">' + wip.length + '</span></h2><div class="card">' + (wip.length ? '' : '<span class="small">Nothing marked in progress.</span>');
    wip.forEach(function (r) { h += '<span class="roomchip" onclick="location.hash=\'#/room/' + encodeURIComponent(r.id) + '\'">' + e(r.id) + ' · ' + r.i.inprog.map(function (s) { return s.id; }).join(', ') + '</span>'; });
    h += '</div>';
    if (cnt.none) h += '<div class="card small">' + cnt.none + ' room(s) on this level have no site status yet — walk-down: open the Plan, tap a pin → Site Status.</div>';
    document.getElementById('app').innerHTML = h;
    setTimeout(status, 0);
  }
  function loadXlsx() { return new Promise(function (res, rej) { if (window.XLSX) return res(); var s = document.createElement('script'); s.src = 'vendor/xlsx.mini.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  function exportXlsx() {
    loadXlsx().then(function () {
      var ids = Object.keys(ROOMS).filter(function (k) { return !ROOMS[k].custom && tplOf(k); }).sort();
      var today = new Date(), wk = function (n) { var d = new Date(today); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
      var la = [['Level', 'Room', 'Name', 'Grid', 'Template', 'Look-ahead', 'Stage to open', 'Window', 'Blockers', 'In progress', 'Stages done', 'Last update', 'By']];
      var st = [['Level', 'Room', 'Name', 'Grid', 'Template', 'Status', 'Done', 'Of', 'In progress', 'Next', 'Open blockers', 'Last update']];
      var bl = [['Level', 'Room', 'Name', 'Type', 'Stage', 'Details', 'Raised', 'By']];
      ids.forEach(function (k) {
        var r = ROOMS[k], i = roomInfo(k), g = window.Grid && Grid.ofRoom(k), gr = g ? g.text : '';
        var last = i.r.last ? i.r.last.t.slice(0, 10) : '', by = i.r.last ? i.r.last.by : '';
        var bls = i.blk.map(function (b) { return b.type + (b.text ? ': ' + b.text : ''); }).join(' | ');
        i.blk.forEach(function (b) { bl.push([r.baseLevel, k, r.name, b.type, b.stage || '', b.text || '', (b.t || '').slice(0, 10), b.by || '']); });
        st.push([r.baseLevel, k, r.name, gr, i.tp.name, i.status, i.nDone, i.tp.st.length, i.inprog.map(function (s) { return s.id; }).join(', '), i.next.map(function (s) { return s.id; }).join(', '), bls, last]);
        if (i.status === 'none' || i.status === 'handed') return;
        if (i.blk.length) la.push([r.baseLevel, k, r.name, gr, i.tp.name, 'Blocked', i.next.concat(i.soon).map(function (s) { return s.id + ' ' + s.name; }).join(' | '), '', bls, i.inprog.map(function (s) { return s.id; }).join(', '), i.nDone + '/' + i.tp.st.length, last, by]);
        else {
          i.next.forEach(function (s) { la.push([r.baseLevel, k, r.name, gr, i.tp.name, 'Week 1 — open now', s.id + ' ' + s.name, wk(0) + ' → ' + wk(6), '', i.inprog.map(function (x) { return x.id; }).join(', '), i.nDone + '/' + i.tp.st.length, last, by]); });
          i.soon.forEach(function (s) { la.push([r.baseLevel, k, r.name, gr, i.tp.name, 'Week 2 — after current work', s.id + ' ' + s.name, wk(7) + ' → ' + wk(13), '', i.inprog.map(function (x) { return x.id; }).join(', '), i.nDone + '/' + i.tp.st.length, last, by]); });
        }
      });
      var wb = XLSX.utils.book_new();
      [['Look-ahead', la], ['Room status', st], ['Blockers', bl]].forEach(function (p) {
        var ws = XLSX.utils.aoa_to_sheet(p[1]);
        ws['!cols'] = p[1][0].map(function (h, c) { return { wch: Math.min(48, Math.max(8, h.length + 2, p[1].slice(1, 200).reduce(function (m, row) { return Math.max(m, String(row[c] == null ? '' : row[c]).length); }, 0))) }; });
        ws['!autofilter'] = { ref: ws['!ref'] };
        XLSX.utils.book_append_sheet(wb, ws, p[0]);
      });
      XLSX.writeFile(wb, 'JOH_Lookahead_' + today.toISOString().slice(0, 10) + '.xlsx');
    }).catch(function () { alert('Could not load the Excel exporter — open the app once online.'); });
  }

  function refresh() {
    STATE = null;
    if (document.querySelector('#loc-dlg.on') || document.querySelector('#sc-modal.on') || document.querySelector('#pvb.adding')) return;
    var y = window.scrollY; route(); window.scrollTo(0, y);
  }
  setTimeout(fetchShared, 0);
  return { T: T, tplOf: tplOf, roomInfo: roomInfo, pinClass: pinClass, roomSection: roomSection, stageMenu: stageMenu, setStage: setStage, blockDlg: blockDlg, saveBlock: saveBlock, resolve: resolve,
    photoEvent: photoEvent, proposals: proposals, accept: accept, reject: reject, acceptAll: acceptAll, sheetLine: sheetLine, lookahead: lookahead, exportXlsx: exportXlsx, fetchShared: fetchShared, _events: events, _add: add };
})();
