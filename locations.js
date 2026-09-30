/* ============================================================
   JOH Room Storyboard — CUSTOM LOCATIONS
   Add your own pins for places that have no room point
   (corridors, shafts, external areas, parts of big rooms…).
   Two ways:
     1. Plan tab → "+ Add Location" → tap the exact spot.
     2. Pick the nearest room → "Add location near here" → the plan
        zooms to that room → tap the exact spot.
   Custom pins behave like rooms: searchable, own page, Site Photo.
   SHARED: every pin is saved to data/locations.json in the GitHub
   repo, so anyone opening the link gets it on open / refresh.
   Adding needs a GitHub token on the phone (Sync settings);
   without one, pins wait on the phone as "pending" and upload
   automatically once a token is set.
   ============================================================ */
var Locs = (function () {
  var KEY = 'joh_custom_locs';
  var add = null; // {level, near, x, y}
  function $(id) { return document.getElementById(id); }
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  /* ---------- store: shared (server) + pending edits (this phone) ---------- */
  var GH = { owner: 'fadeelhusin', repo: 'joh-rooms-1', path: 'data/locations.json', branch: 'main' };
  var K_SHARED = 'joh_locs_shared', K_DEL = 'joh_locs_del', K_TOKEN = 'joh_gh_token';
  function lsJ(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (x) { return d; } }
  function lsS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (x) { alert('Could not save on this phone (storage full or private mode).'); } }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function shared() { return lsJ(K_SHARED, []) || []; }
  function pending() { return lsJ(KEY, []) || []; }
  function dels() { return lsJ(K_DEL, []) || []; }
  function token() { try { return localStorage.getItem(K_TOKEN) || ''; } catch (x) { return ''; } }
  function load() {
    var map = {}, order = [], del = {};
    dels().forEach(function (id) { del[id] = 1; });
    shared().forEach(function (l) { if (!del[l.id]) { map[l.id] = l; order.push(l.id); } });
    pending().forEach(function (l) { if (!map[l.id]) order.push(l.id); map[l.id] = l; });
    return order.filter(function (id) { return map[id]; }).map(function (id) { return clone(map[id]); });
  }
  function save(next) {                       // diff against current view → pending upserts / deletes
    var cur = {}, nx = {}, p = pending(), d = dels(), sh = {};
    load().forEach(function (l) { cur[l.id] = JSON.stringify(l); });
    shared().forEach(function (l) { sh[l.id] = JSON.stringify(l); });
    next.forEach(function (l) {
      nx[l.id] = 1;
      if (cur[l.id] !== JSON.stringify(l)) {
        p = p.filter(function (x) { return x.id !== l.id; });
        if (sh[l.id] !== JSON.stringify(l)) p.push(l);
        d = d.filter(function (x) { return x !== l.id; });
      }
    });
    Object.keys(cur).forEach(function (id) {
      if (!nx[id]) { p = p.filter(function (x) { return x.id !== id; }); if (sh[id] && d.indexOf(id) < 0) d.push(id); }
    });
    lsS(KEY, p); lsS(K_DEL, d);
    sync();
  }
  function isPending(id) { return pending().some(function (l) { return l.id === id; }); }

  /* ---------- GitHub sync ---------- */
  var syncing = false, lastErr = '';
  function b64enc(str) { return btoa(unescape(encodeURIComponent(str))); }
  function b64dec(b) { return decodeURIComponent(escape(atob(b.replace(/\s/g, '')))); }
  function api(method, body) {
    return fetch('https://api.github.com/repos/' + GH.owner + '/' + GH.repo + '/contents/' + GH.path + (method === 'GET' ? '?ref=' + GH.branch + '&t=' + Date.now() : ''), {
      method: method, cache: 'no-store',
      headers: { 'Authorization': 'Bearer ' + token(), 'Accept': 'application/vnd.github+json' },
      body: body ? JSON.stringify(body) : undefined
    });
  }
  function readRemote() {
    return api('GET').then(function (r) {
      if (r.status === 404) return { sha: null, list: [] };
      if (!r.ok) throw new Error(r.status === 401 ? 'Token rejected (401)' : r.status === 403 ? 'Token has no access (403)' : 'GitHub error ' + r.status);
      return r.json().then(function (j) { var d = JSON.parse(b64dec(j.content) || '{}'); return { sha: j.sha, list: d.locations || [] }; });
    });
  }
  /* generic helpers other modules (geo.js) use for their own shared files */
  function ghRead(path) {
    return fetch('https://api.github.com/repos/' + GH.owner + '/' + GH.repo + '/contents/' + path + '?ref=' + GH.branch + '&t=' + Date.now(), { cache: 'no-store', headers: { 'Authorization': 'Bearer ' + token(), 'Accept': 'application/vnd.github+json' } })
      .then(function (r) {
        if (r.status === 404) return { sha: null, data: null };
        if (!r.ok) throw new Error(r.status === 401 ? 'Token rejected (401)' : r.status === 403 ? 'Token has no access (403)' : 'GitHub error ' + r.status);
        return r.json().then(function (j) { return { sha: j.sha, data: JSON.parse(b64dec(j.content) || 'null') }; });
      });
  }
  function ghWrite(path, obj, sha, msg) {
    var body = { message: msg || ('Update ' + path), branch: GH.branch, content: b64enc(JSON.stringify(obj, null, 1)) };
    if (sha) body.sha = sha;
    return fetch('https://api.github.com/repos/' + GH.owner + '/' + GH.repo + '/contents/' + path, { method: 'PUT', headers: { 'Authorization': 'Bearer ' + token(), 'Accept': 'application/vnd.github+json' }, body: JSON.stringify(body) })
      .then(function (r) { if (r.status === 409 || r.status === 422) { var er = new Error('conflict'); er.conflict = true; throw er; } if (!r.ok) throw new Error('Upload failed (' + r.status + ')'); return r; });
  }
  function setShared(list, fromServer) {
    var before = JSON.stringify(shared());
    lsS(K_SHARED, list);
    if (fromServer) {                           // drop pending items the server already has identically
      var sh = {}; list.forEach(function (l) { sh[l.id] = JSON.stringify(l); });
      lsS(KEY, pending().filter(function (l) { return sh[l.id] !== JSON.stringify(l); }));
      lsS(K_DEL, dels().filter(function (id) { return sh[id]; }));
    }
    return before !== JSON.stringify(list);
  }
  function sync(tries) {
    tries = tries || 0;
    mergeAll(); status();
    if (!token() || syncing || (!pending().length && !dels().length)) return Promise.resolve();
    syncing = true; status();
    return readRemote().then(function (rm) {
      var list = rm.list.slice(), byId = {}, del = {}, renamed = {};
      dels().forEach(function (id) { del[id] = 1; });
      list = list.filter(function (l) { return !del[l.id]; });
      list.forEach(function (l, i) { byId[l.id] = i; });
      pending().forEach(function (l) {
        if (byId[l.id] != null && list[byId[l.id]].created !== l.created) {   // same code made on another phone → renumber mine
          var old = l.id; l.id = nextId(l.level, list); renamed[old] = l.id;
        }
        if (byId[l.id] != null) list[byId[l.id]] = l; else { byId[l.id] = list.length; list.push(l); }
      });
      var body = { message: 'Update custom locations (' + list.length + ')', branch: GH.branch,
        content: b64enc(JSON.stringify({ app: 'joh-rooms', updated: new Date().toISOString(), locations: list }, null, 1)) };
      if (rm.sha) body.sha = rm.sha;
      return api('PUT', body).then(function (r) {
        if (r.status === 409 || r.status === 422) { if (tries < 2) { syncing = false; return sync(tries + 1); } }
        if (!r.ok) throw new Error('Upload failed (' + r.status + ')');
        lsS(KEY, []); lsS(K_DEL, []); setShared(list); lastErr = '';
        syncing = false; mergeAll(); status();
        var h = location.hash; Object.keys(renamed).forEach(function (o) { if (h.indexOf(encodeURIComponent(o)) >= 0) location.hash = h.replace(encodeURIComponent(o), encodeURIComponent(renamed[o])); });
        toast('☁ Locations shared with the team');
      });
    }).catch(function (x) { syncing = false; lastErr = x.message || 'Sync failed'; status(); });
  }
  function fetchShared() {                      // everyone: pull the shared list on open / refresh / return to app
    var p = token() ? readRemote().then(function (r) { return r.list; })
      : fetch('data/locations.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('no file'); return r.json(); })
        .then(function (j) { if (!j || !Array.isArray(j.locations)) throw new Error('offline'); return j.locations; });
    return p.then(function (list) {
      var changed = setShared(list, true);
      if (changed) { mergeAll(); refreshView(); }
      return sync();
    }).catch(function () { status(); });
  }
  function refreshView() {
    if (add || document.querySelector('#pvb.adding') || document.querySelector('#loc-dlg.on') || document.querySelector('#sc-modal.on')) return;
    var h = location.hash;
    if (/^#\/(plan|room)/.test(h) || h === '' || h === '#/') { var y = window.scrollY; route(); window.scrollTo(0, y); }
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) fetchShared(); });
  window.addEventListener('online', function () { sync(); });
  function status() {
    var el = document.getElementById('loc-sync'); if (!el) return;
    var n = pending().length + dels().length, t = token();
    el.className = 'loc-sync' + (lastErr ? ' err' : n ? ' wait' : '');
    el.innerHTML = syncing ? '⏳ Sharing…' : lastErr ? '⚠ ' + e(lastErr) : n ? (t ? '⏳ ' + n + ' waiting to share' : '📱 ' + n + ' on this phone only') : (t ? '☁ Shared' : '☁ View only');
  }
  function toast(m) { var t = document.getElementById('sc-toast'); if (!t) { t = document.createElement('div'); t.id = 'sc-toast'; document.body.appendChild(t); } t.textContent = m; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('on'); }, 2600); }

  function settings() {
    var has = !!token();
    dlg('<div class="sc-head"><div><div class="eyebrow" style="color:#d8cdb6">Sharing</div><div class="rn">Team sync</div></div><button class="sc-x" onclick="Locs.closeDlg()">✕</button></div>' +
      '<div class="sc-body"><div class="small" style="margin-bottom:8px">Everyone with the link sees shared locations when they open or refresh the app. To <b>add, edit or delete</b> locations for the whole team, this phone needs a GitHub token with write access to the <b>' + GH.repo + '</b> repo.</div>' +
      '<div class="sublab">GitHub token</div><input id="loc-tok" class="loc-in" type="password" autocomplete="off" placeholder="' + (has ? '•••••••• saved on this phone' : 'github_pat_…') + '">' +
      '<div class="small" style="margin-top:6px">Create it at github.com → Settings → Developer settings → Fine-grained tokens → Repository access: only <b>' + GH.repo + '</b> → Permissions: <b>Contents: Read and write</b>. The token stays on this phone only.</div>' +
      '<div class="sc-actions"><button class="btn brass sc-big" onclick="Locs.saveToken()">Save &amp; test</button>' + (has ? '<button class="btn ghost loc-del" onclick="Locs.clearToken()">Remove token</button>' : '') + '</div>' +
      '<div class="small" id="loc-tokmsg"></div>' +
      '<div class="sublab">Backup of custom locations</div><button class="btn ghost" onclick="Locs.exportAll()">Export file</button><button class="btn ghost" onclick="Locs.importPick()">Import file</button></div>');
  }
  function saveToken() {
    var v = ($('loc-tok').value || '').trim(), msg = $('loc-tokmsg');
    if (!v && !token()) { $('loc-tok').focus(); return; }
    if (v) try { localStorage.setItem(K_TOKEN, v); } catch (x) {}
    msg.textContent = 'Testing…';
    readRemote().then(function (r) {
      setShared(r.list, true); mergeAll();
      msg.textContent = '✓ Connected. ' + r.list.length + ' shared location(s).';
      return sync();
    }).then(function () { setTimeout(function () { closeDlg(); refreshView(); }, 900); })
      .catch(function (x) { msg.textContent = '✗ ' + x.message + ' — check the token and its repo permission.'; });
  }
  function clearToken() { try { localStorage.removeItem(K_TOKEN); } catch (x) {} closeDlg(); status(); }
  function pad3(n) { return ('00' + n).slice(-3); }

  function toRoom(l) {
    var nr = l.near && window.ROOMS_DATA ? ROOMS_DATA[l.near] : null;
    return {
      id: l.id, name: l.name, level: l.level, baseLevel: l.level, zone: nr ? nr.zone : '', area: null,
      function: 'Custom location', abbr: 'LOC', src: 'custom', custom: true, near: l.near || '', desc: l.desc || '',
      created: l.created, pos: [l.level, l.x, l.y], dwg: nr ? nr.dwg : ''
    };
  }
  function mergeAll() {
    if (!window.ROOMS_DATA) return;
    Object.keys(ROOMS_DATA).forEach(function (k) { if (ROOMS_DATA[k] && ROOMS_DATA[k].custom) delete ROOMS_DATA[k]; });
    load().forEach(function (l) { if (!ROOMS_DATA[l.id] || ROOMS_DATA[l.id].custom) ROOMS_DATA[l.id] = toRoom(l); });
  }
  mergeAll();
  setTimeout(fetchShared, 0);

  function nearest(level, x, y) {
    var best = null, bd = Infinity;
    Object.keys(ROOMS_DATA).forEach(function (k) {
      var r = ROOMS_DATA[k]; if (r.custom || r.baseLevel !== level || !r.pos) return;
      var dx = (r.pos[1] - x) * 1191, dy = (r.pos[2] - y) * 842, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = k; }
    });
    return best;
  }
  function nextId(level, list) {
    var n = 0; list.forEach(function (l) { if (l.level === level) { var m = /\.(\d+)$/.exec(l.id); if (m) n = Math.max(n, +m[1]); } });
    var id; do { n++; id = 'LOC.' + level + '.' + pad3(n); } while (ROOMS_DATA[id]);
    return id;
  }

  /* ---------- add mode on the plan ---------- */
  function startAdd(level, near) {
    add = { level: level, near: near || '' };
    var wrap = $('pvb'); if (!wrap) return;
    wrap.classList.add('adding');
    var b = $('loc-banner');
    if (b) {
      b.innerHTML = '<span>📍 Zoom in, then tap the exact spot' + (near ? ' near <b>' + e(near) + '</b>' : '') + '</span><button class="btn ghost" onclick="Locs.cancel()">Cancel</button>';
      b.classList.add('on');
    }
    var ab = $('loc-addbtn'); if (ab) ab.style.display = 'none';
    Viewer.setAddMode(function (x, y) { placed(x, y); });
    if (near && ROOMS_DATA[near] && ROOMS_DATA[near].pos) Viewer.centerOn(ROOMS_DATA[near].pos[1], ROOMS_DATA[near].pos[2], 2.6);
  }
  function cancel() {
    add = null; Viewer.setAddMode(null);
    var wrap = $('pvb'); if (wrap) wrap.classList.remove('adding');
    var b = $('loc-banner'); if (b) b.classList.remove('on');
    var ab = $('loc-addbtn'); if (ab) ab.style.display = '';
    Viewer.showTemp(null);
    closeDlg();
  }
  function placed(x, y) {
    if (!add) return;
    add.x = +x.toFixed(5); add.y = +y.toFixed(5);
    Viewer.showTemp(x, y);
    Viewer.panTo(x, y, 0.22, 1.6);
    var wrap = $('pvb'); if (wrap) wrap.scrollIntoView({ block: 'start' });
    var near = nearest(add.level, x, y);
    add.nearAuto = near;
    var nr = near ? ROOMS_DATA[near] : null;
    dlg('<div class="sc-head"><div><div class="eyebrow" style="color:#d8cdb6">New location · Level ' + e(add.level) + '</div><div class="rn">' + e(nextId(add.level, load())) + '</div></div><button class="sc-x" onclick="Locs.cancel()">✕</button></div>' +
      '<div class="sc-body">' +
      '<div class="sublab">Location name *</div><input id="loc-name" dir="auto" class="loc-in" placeholder="e.g. Corridor behind Stage Door" autocomplete="off">' +
      '<div class="sublab">Description (optional)</div><input id="loc-desc" dir="auto" class="loc-in" placeholder="e.g. Between grid C4–C6, riser side">' +
      '<div class="sublab">Nearest room</div><div class="small">' + (nr ? '<b>' + e(near) + '</b> — ' + e(nr.name || '') : 'None found on this level') + '</div>' +
      '<div class="small" style="margin-top:6px">✓ Position set — tap somewhere else on the plan to move it.</div>' +
      '<div class="sc-actions"><button class="btn brass sc-big" onclick="Locs.saveNew(false)">Save location</button>' +
      '<button class="btn ghost" onclick="Locs.saveNew(true)">📷 Save + Site Photo</button></div></div>', true);
    setTimeout(function () { var n = $('loc-name'); if (n && !n.value) n.focus(); }, 60);
  }
  function saveNew(photo) {
    var nm = ($('loc-name').value || '').trim();
    if (!nm) { $('loc-name').focus(); $('loc-name').classList.add('err'); return; }
    var list = load(), id = nextId(add.level, list);
    var l = { id: id, name: nm, desc: ($('loc-desc').value || '').trim(), level: add.level, x: add.x, y: add.y, near: add.nearAuto || add.near || '', created: new Date().toISOString() };
    list.push(l); save(list); mergeAll();
    var lvl = add.level;
    cancel();
    if (photo) { location.hash = '#/plan/' + lvl; setTimeout(function () { SiteCam.open(id); }, 250); }
    else location.hash = '#/room/' + encodeURIComponent(id);
  }

  /* ---------- small dialog (reuses Site Photo panel look) ---------- */
  function dlg(html, keepPlanVisible) {
    var m = $('loc-dlg');
    if (!m) { m = document.createElement('div'); m.id = 'loc-dlg'; document.body.appendChild(m); }
    m.className = 'on' + (keepPlanVisible ? ' low' : '');
    m.innerHTML = '<div class="sc-panel">' + html + '</div>';
  }
  function closeDlg() { var m = $('loc-dlg'); if (m) { m.className = ''; m.innerHTML = ''; } }

  /* ---------- edit / delete (from the location page) ---------- */
  function edit(id) {
    var l = load().filter(function (x) { return x.id === id; })[0]; if (!l) return;
    dlg('<div class="sc-head"><div><div class="eyebrow" style="color:#d8cdb6">Edit location</div><div class="rn">' + e(id) + '</div></div><button class="sc-x" onclick="Locs.closeDlg()">✕</button></div>' +
      '<div class="sc-body"><div class="sublab">Location name *</div><input id="loc-name" dir="auto" class="loc-in" value="' + e(l.name) + '">' +
      '<div class="sublab">Description</div><input id="loc-desc" dir="auto" class="loc-in" value="' + e(l.desc || '') + '">' +
      '<div class="sc-actions"><button class="btn brass sc-big" onclick="Locs.saveEdit(\'' + e(id) + '\')">Save</button>' +
      '<button class="btn ghost" onclick="Locs.move(\'' + e(id) + '\')">Move pin</button>' +
      '<button class="btn ghost loc-del" onclick="Locs.del(\'' + e(id) + '\')">Delete</button></div></div>');
  }
  function saveEdit(id) {
    var nm = ($('loc-name').value || '').trim(); if (!nm) return;
    var list = load(); list.forEach(function (l) { if (l.id === id) { l.name = nm; l.desc = ($('loc-desc').value || '').trim(); } });
    save(list); mergeAll(); closeDlg(); route();
  }
  function del(id) {
    if (!confirm('Delete location ' + id + '? Photos already saved in the gallery are not affected.')) return;
    save(load().filter(function (l) { return l.id !== id; })); mergeAll(); closeDlg();
    var r = ROOMS_DATA[id]; location.hash = '#/plan/' + (id.split('.')[1] || '');
  }
  var moving = null;
  function move(id) {
    closeDlg();
    var l = load().filter(function (x) { return x.id === id; })[0]; if (!l) return;
    moving = id;
    location.hash = '#/plan/' + l.level + '/move/' + encodeURIComponent(id);
  }
  function startMove(id) {
    var l = load().filter(function (x) { return x.id === id; })[0]; if (!l) return;
    var wrap = $('pvb'); if (wrap) wrap.classList.add('adding');
    var b = $('loc-banner');
    if (b) { b.innerHTML = '<span>📍 Tap the new spot for <b>' + e(l.name) + '</b></span><button class="btn ghost" onclick="Locs.cancel();location.hash=\'#/room/' + encodeURIComponent(id) + '\'">Cancel</button>'; b.classList.add('on'); }
    var ab = $('loc-addbtn'); if (ab) ab.style.display = 'none';
    Viewer.centerOn(l.x, l.y, 2.6);
    Viewer.setAddMode(function (x, y) {
      var list = load(); list.forEach(function (it) { if (it.id === id) { it.x = +x.toFixed(5); it.y = +y.toFixed(5); it.near = nearest(it.level, x, y) || it.near; } });
      save(list); mergeAll(); cancel(); location.hash = '#/room/' + encodeURIComponent(id);
    });
  }

  /* ---------- export / import (share with the team) ---------- */
  function exportAll() {
    var list = load();
    if (!list.length) { alert('No custom locations yet.'); return; }
    var blob = new Blob([JSON.stringify({ app: 'joh-rooms', type: 'custom-locations', exported: new Date().toISOString(), locations: list }, null, 1)], { type: 'application/json' });
    var name = 'JOH_custom_locations_' + new Date().toISOString().slice(0, 10) + '.json';
    var file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'JOH custom locations' }).catch(function (x) { if (x && x.name !== 'AbortError') dl(blob, name); });
    } else dl(blob, name);
  }
  function dl(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  function importPick() {
    var i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
    i.onchange = function () {
      var f = i.files[0]; if (!f) return;
      f.text().then(function (t) {
        var j = JSON.parse(t), inc = (j && j.locations) || (Array.isArray(j) ? j : []);
        var list = load(), have = {}, added = 0, upd = 0;
        list.forEach(function (l) { have[l.id] = l; });
        inc.forEach(function (l) {
          if (!l || !l.id || !l.level || l.x == null || l.y == null) return;
          if (have[l.id]) { if (have[l.id].name !== l.name || have[l.id].x !== l.x || have[l.id].y !== l.y) { Object.assign(have[l.id], l); upd++; } }
          else { list.push(l); added++; }
        });
        save(list); mergeAll(); alert('Imported: ' + added + ' new, ' + upd + ' updated.'); route();
      }).catch(function () { alert('That file is not a locations export.'); });
    };
    i.click();
  }

  /* ---------- page pieces used by app.js ---------- */
  function planTools(level) {
    setTimeout(status, 0);
    return { btn: '<button class="tb brass" id="loc-addbtn" onclick="Locs.startAdd(\'' + e(level) + '\')">+ Location</button>',
      btnEnd: '<button class="tb" onclick="Locs.settings()">⚙ Sync</button>',
      stat: '<span class="loc-sync" id="loc-sync"></span>' };
  }
  function roomCard(k, d) {
    if (!d.custom) return '';
    var nr = d.near && ROOMS_DATA[d.near];
    setTimeout(status, 0);
    return '<div class="card loc-card"><div class="eyebrow">Custom location · ' + (isPending(k) ? (token() ? 'waiting to share' : 'this phone only — set up ⚙ Sync on the Plan tab') : 'shared with the team') + '</div>' +
      (d.desc ? '<div style="margin:4px 0" dir="auto">' + e(d.desc) + '</div>' : '') +
      (nr ? '<div class="small">Nearest room: <span class="roomchip" onclick="location.hash=\'#/room/' + encodeURIComponent(d.near) + '\'">' + e(d.near) + ' · ' + e(nr.name || '') + '</span></div>' : '') +
      '<div class="small">Added ' + e((d.created || '').slice(0, 10)) + '</div>' +
      '<button class="btn ghost" onclick="Locs.edit(\'' + e(k) + '\')">Edit / Move / Delete</button></div>';
  }

  return { gh: { token: token, read: ghRead, write: ghWrite }, toast: toast, dlg: dlg, settings: settings, saveToken: saveToken, clearToken: clearToken, fetchShared: fetchShared, sync: sync, mergeAll: mergeAll, startAdd: startAdd, startMove: startMove, cancel: cancel, saveNew: saveNew, edit: edit, saveEdit: saveEdit, del: del, move: move, closeDlg: closeDlg, exportAll: exportAll, importPick: importPick, planTools: planTools, roomCard: roomCard, nearest: nearest };
})();
