/* ============================================================
   JOH Room Storyboard — CUSTOM LOCATIONS
   Add your own pins for places that have no room point
   (corridors, shafts, external areas, parts of big rooms…).
   Two ways:
     1. Plan tab → "+ Add Location" → tap the exact spot.
     2. Pick the nearest room → "Add location near here" → the plan
        zooms to that room → tap the exact spot.
   Custom pins behave like rooms: searchable, own page, Site Photo.
   Stored on this phone; Export / Import to share with the team.
   ============================================================ */
var Locs = (function () {
  var KEY = 'joh_custom_locs';
  var add = null; // {level, near, x, y}
  function $(id) { return document.getElementById(id); }
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (x) { return []; } }
  function save(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (x) { alert('Could not save on this phone (storage full or private mode).'); } }
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
    var n = load().filter(function (l) { return l.level === level; }).length;
    return '<div class="loc-tools"><button class="btn brass" id="loc-addbtn" onclick="Locs.startAdd(\'' + e(level) + '\')">+ Add Location</button>' +
      '<button class="btn ghost" onclick="Locs.exportAll()">Export</button><button class="btn ghost" onclick="Locs.importPick()">Import</button>' +
      '<span class="small">' + (n ? n + ' custom pin(s) on this level' : '') + '</span></div>' +
      '<div id="loc-banner"></div>';
  }
  function roomCard(k, d) {
    if (!d.custom) return '';
    var nr = d.near && ROOMS_DATA[d.near];
    return '<div class="card loc-card"><div class="eyebrow">Custom location · this phone</div>' +
      (d.desc ? '<div style="margin:4px 0" dir="auto">' + e(d.desc) + '</div>' : '') +
      (nr ? '<div class="small">Nearest room: <span class="roomchip" onclick="location.hash=\'#/room/' + encodeURIComponent(d.near) + '\'">' + e(d.near) + ' · ' + e(nr.name || '') + '</span></div>' : '') +
      '<div class="small">Added ' + e((d.created || '').slice(0, 10)) + '</div>' +
      '<button class="btn ghost" onclick="Locs.edit(\'' + e(k) + '\')">Edit / Move / Delete</button></div>';
  }

  return { mergeAll: mergeAll, startAdd: startAdd, startMove: startMove, cancel: cancel, saveNew: saveNew, edit: edit, saveEdit: saveEdit, del: del, move: move, closeDlg: closeDlg, exportAll: exportAll, importPick: importPick, planTools: planTools, roomCard: roomCard, nearest: nearest };
})();
