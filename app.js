/* ============================================================
   JOH Room Storyboard — app shell, router, search, room &
   material storyboard rendering.
   ============================================================ */
var ROOMS = {}, MATERIALS = [], MAT_BY_CODE = {}, META = {}, PROGRESS = {};
var LEVELS = [], ABBR_LABELS = {};

var app = document.getElementById('app');
var q, fl, fa;

function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
function row2(k, v) { return '<tr><td>' + esc(k) + '</td><td>' + esc(v == null || v === '' ? '–' : v) + '</td></tr>'; }

/* ---------- boot ---------- */
Promise.all([
  fetch('data/rooms.json').then(r => r.json()),
  fetch('data/materials.json').then(r => r.json()),
  fetch('data/meta.json').then(r => r.json()),
]).then(function (res) {
  ROOMS = res[0]; MATERIALS = res[1]; META = res[2];
  MATERIALS.forEach(function (m) { MAT_BY_CODE[m.code] = m; });
  LEVELS = META.levels;
  boot();
}).catch(function (e) {
  document.getElementById('app').innerHTML = '<div class="emptystate"><div class="big">⚠️</div>Could not load room data.<br><span class="small">' + esc(e.message) + '</span></div>';
});

function boot() {
  q = document.getElementById('q'); fl = document.getElementById('fl'); fa = document.getElementById('fa');
  LEVELS.forEach(function (l) { var o = document.createElement('option'); o.value = l; o.textContent = 'Level ' + l; fl.appendChild(o); });
  Object.keys(ROOMS).forEach(function (id) {
    var r = ROOMS[id];
    if (r.abbr && !ABBR_LABELS[r.abbr]) ABBR_LABELS[r.abbr] = (r.study && r.study[0]) ? r.study[0].split(' - ')[0].split(',')[0] : r.abbr;
  });
  Object.keys(ABBR_LABELS).sort().forEach(function (a) { var o = document.createElement('option'); o.value = a; o.textContent = a; fa.appendChild(o); });

  q.addEventListener('input', function () { setTab('rooms'); doSearch(); });
  q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { var t = q.value.trim(); if (ROOMS[t]) location.hash = '#/room/' + encodeURIComponent(t); } });
  fl.addEventListener('change', function () { setTab('rooms'); doSearch(); });
  fa.addEventListener('change', function () { setTab('rooms'); doSearch(); });

  document.querySelectorAll('#tabbar button').forEach(function (b) {
    b.addEventListener('click', function () { location.hash = '#/' + b.dataset.tab; });
  });

  loadProgress();
  window.addEventListener('hashchange', route);
  route();
}

function loadProgress() {
  fetch('data/progress.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (j && j.rooms) { PROGRESS = j.rooms; var cur = document.querySelector('[data-curroom]'); if (cur) showProgress(cur.getAttribute('data-curroom')); } })
    .catch(function () {});
}

/* ---------- persisted checklist state ---------- */
var LSS = window.localStorage;
function getState(room) { try { return JSON.parse(LSS.getItem('joh_' + room) || '{}'); } catch (e) { return {}; } }
function setState(room, o) { try { LSS.setItem('joh_' + room, JSON.stringify(o)); } catch (e) {} }
function toggleTick(room, id, el) {
  var s = getState(room); s[id] = el.checked; setState(room, s);
  var t = el.closest('.tick'); if (t) t.classList.toggle('done', el.checked); updateCnt(room);
}
document.addEventListener('change', function (e) {
  var t = e.target;
  if (t && t.matches && t.matches('.tick input')) toggleTick(t.getAttribute('data-room'), t.getAttribute('data-id'), t);
});
function updateCnt(room) {
  document.querySelectorAll('[data-sect]').forEach(function (sec) {
    var boxes = sec.querySelectorAll('input[type=checkbox]');
    var done = sec.querySelectorAll('input[type=checkbox]:checked');
    var cnt = sec.querySelector('.cnt'); if (cnt) cnt.textContent = done.length + '/' + boxes.length;
  });
}
function tickBox(room, id, title, sub) {
  var s = getState(room); var ch = s[id] ? 'checked' : '';
  return '<label class="tick ' + (s[id] ? 'done' : '') + '"><input type="checkbox" data-room="' + esc(room) + '" data-id="' + esc(id) + '" ' + ch + '><span class="tt">' + esc(title) + '<span class="ts">' + esc(sub || '') + '</span></span></label>';
}
function showProgress(room) {
  var host = document.getElementById('prog-body'); if (!host) return;
  var pr = PROGRESS[room];
  if (!pr) { host.innerHTML = '<div class="small">No uploaded progress for this room yet.</div>'; return; }
  var h = '';
  Object.keys(pr).forEach(function (disc) {
    var p = Math.round(pr[disc]); var cls = p >= 80 ? '' : (p >= 40 ? 'warn' : 'bad');
    h += '<div style="margin:6px 0"><div style="display:flex;justify-content:space-between;font-size:12.5px"><b>' + esc(disc) + '</b><span>' + p + '%</span></div><div class="bar"><i class="' + cls + '" style="width:' + p + '%"></i></div></div>';
  });
  host.innerHTML = h;
}

/* ---------- router ---------- */
var CUR_TAB = 'rooms';
function setTab(t) {
  CUR_TAB = t;
  document.querySelectorAll('#tabbar button').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === t); });
}
function route() {
  var h = location.hash.replace(/^#\/?/, '');
  var parts = h.split('/').filter(Boolean).map(decodeURIComponent);
  window.scrollTo(0, 0);
  if (parts[0] === 'room' && parts[1]) { setTab('rooms'); return openRoom(parts[1]); }
  if (parts[0] === 'plan') { setTab('plan'); return openPlanBrowse(parts[1] || LEVELS[0]); }
  if (parts[0] === 'materials' && !parts[1]) { setTab('materials'); return renderMaterialsHome(); }
  if (parts[0] === 'material' && parts[1]) { setTab('materials'); return openMaterial(parts[1]); }
  setTab('rooms'); renderHome();
}

function renderHome() {
  q.style.display = ''; fl.style.display = ''; fa.style.display = '';
  doSearch();
}
function baseLvl(id) { return ROOMS[id] ? ROOMS[id].baseLevel : ''; }

function doSearch() {
  var t = (q.value || '').trim().toUpperCase(), L = fl.value, A = fa.value;
  var keys = Object.keys(ROOMS), out = [];
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i], d = ROOMS[k];
    if (L && d.baseLevel !== L) continue;
    if (A && d.abbr !== A) continue;
    if (t) {
      if (k.toUpperCase() === t) { location.hash = '#/room/' + encodeURIComponent(k); return; }
      var hay = (k + ' ' + (d.name || '') + ' ' + (d.abbr || '') + ' ' + (d.function || '')).toUpperCase();
      if (hay.indexOf(t) < 0) continue;
    }
    out.push(k); if (out.length > 250) break;
  }
  renderList(out, t, L, A);
}
function renderList(keys, t, L, A) {
  if (!t && !L && !A) {
    app.innerHTML = '<div class="eyebrow" style="padding:8px 2px 0">Jeddah Opera House</div>' +
      '<div class="hint" style="font-size:13px;color:var(--ink-soft)">Search a room number (e.g. <b>5.04.TEC.01</b>) or name, filter by level / type, or browse a floor plan to tap a room. ' + Object.keys(ROOMS).length + ' rooms indexed across ' + LEVELS.length + ' levels.</div>' +
      '<div class="card" style="display:flex;gap:10px;align-items:center;cursor:pointer" onclick="location.hash=\'#/plan\'"><div style="font-size:26px">🗺️</div><div><div style="font-weight:700;font-family:var(--serif)">Browse the plan</div><div class="small">Tap any room on the floor plan to open its storyboard</div></div></div>' +
      '<div class="card" style="display:flex;gap:10px;align-items:center;cursor:pointer" onclick="location.hash=\'#/materials\'"><div style="font-size:26px">🧱</div><div><div style="font-weight:700;font-family:var(--serif)">Material library</div><div class="small">' + MATERIALS.length + ' finishes, furniture & fixtures with codes, specs & photos</div></div></div>';
    return;
  }
  var h = '<div class="hint">' + keys.length + ' result(s)</div>';
  keys.slice(0, 150).forEach(function (k) {
    var d = ROOMS[k];
    h += '<div class="card roomrow" style="padding:12px 14px" onclick="location.hash=\'#/room/' + encodeURIComponent(k) + '\'"><span class="rn">' + esc(k) + '</span><span class="rt">' + esc(d.name || '') + '</span><span class="meta">L' + esc(d.baseLevel) + (d.area ? (' · ' + d.area + 'm²') : '') + '</span></div>';
  });
  app.innerHTML = h || '<div class="emptystate"><div class="big">🔍</div>No match.</div>';
}

/* ---------- ROOM STORYBOARD ---------- */
function openRoom(k) {
  var d = ROOMS[k]; if (!d) { app.innerHTML = '<div class="emptystate">Room not found.</div>'; return; }
  var st = d.study || ['', ''];
  var h = '<button class="btn ghost" onclick="history.length>1?history.back():location.hash=\'#/\'">← Back</button>';
  h += '<button class="btn brass" onclick="printRoom(\'' + k + '\')">Export storyboard PDF</button>';

  /* hero */
  h += '<div class="hero" data-curroom="' + esc(k) + '">';
  if (d.pos) {
    h += '<div class="frame" id="pv"><canvas></canvas><div class="mk"></div>' +
      '<div id="pvlvl">LEVEL ' + esc(d.baseLevel) + '</div><div class="pvstat-el" id="pvstat">loading…</div>' +
      '<div id="pvctl"><button onclick="Viewer.zoomBy(1.4)">+</button><button onclick="Viewer.zoomBy(0.72)">−</button><button onclick="Viewer.centerRoom()">◎</button></div></div>';
  } else {
    h += '<div class="frame" style="display:flex;align-items:center;justify-content:center;color:#eee;font-size:12.5px;padding:20px;text-align:center">Location not yet mapped on the L' + esc(d.baseLevel) + ' plan — open the full drawing below.</div>';
  }
  h += '<div class="caption"><div class="rn">' + esc(k) + '</div><div class="rt">' + esc(d.name || '') + '</div>' +
    '<div class="tags"><span class="tag">Level ' + esc(d.baseLevel) + '</span><span class="tag">Zone ' + esc(d.zone || '–') + '</span>' +
    (d.area ? '<span class="tag">' + d.area + ' m²</span>' : '') + '<span class="tag">' + esc(d.abbr) + '</span></div></div></div>';
  if (d.pos) h += '<div class="small" style="margin:-6px 0 8px">Drag to pan · pinch / +− to zoom · ◎ re-centre. Source: ' + esc(d.dwg || '') + '.</div>';

  h += '<table class="kv card" style="margin-top:2px"><tbody>' +
    row2('Room name', d.name) + row2('Level', 'Level ' + esc(d.level)) + row2('Zone', d.zone) +
    row2('Nett area', d.area ? (d.area + ' m²') : null) + row2('Function (schedule)', d.function) +
    row2('Abbreviation usage', st[0]) + row2('OPE function', st[1]) + '</tbody></table>';

  h += '<h2 class="sec">Finishing Schedule</h2>' + renderFinishing(k, d);
  h += '<h2 class="sec">Material Mockup Samples</h2>' + renderMaterialMockups(k, d);
  h += '<h2 class="sec">FF&amp;E List</h2>' + renderFFE(k, d);
  h += '<h2 class="sec">Room Delivery Clearance Checklist</h2>' + renderClearances(k, d);
  h += '<h2 class="sec">Reference Documents</h2>' + renderRoomDocs(k, d);

  app.innerHTML = h;
  if (d.pos) Viewer.openRoom(k, 'pv');
  updateCnt(k); showProgress(k);
}

function finBlock(w) {
  var h = '<div class="lay"><b>' + esc(w.type || '') + '</b></div>';
  (w.buildup || []).forEach(function (l) { h += '<div class="lay">' + esc(l) + '</div>'; });
  if (w.prep && w.prep.length) { h += '<div class="sublab">Prep</div>'; w.prep.forEach(function (l) { h += '<div class="lay">' + esc(l) + '</div>'; }); }
  if (w.spec) h += '<div class="lay">Spec: ' + esc(w.spec) + '</div>';
  if (w.acoustic || w.fire) h += '<div class="lay">Acoustic: ' + esc(w.acoustic || '–') + ' · Fire: ' + esc(w.fire || '–') + '</div>';
  return h;
}

function renderFinishing(k, d) {
  var f = d.fin;
  if (!f) return '<div class="card small">No finishing library mapped for ' + esc(d.abbr) + '.</div>';
  var h = '';
  h += '<details data-sect data-id="wall" open><summary>Wall<span class="cnt"></span></summary><div class="body">';
  (f.walls || []).forEach(function (w) { h += finBlock(w); });
  if (!(f.walls || []).length) h += '<div class="small">No wall build-up on file.</div>';
  h += '</div></details>';

  var fl2 = f.floor || {};
  h += '<details data-sect data-id="floor"><summary>Floor &amp; Skirting<span class="cnt"></span></summary><div class="body">';
  (fl2.buildup || []).forEach(function (l) { h += '<div class="lay">' + esc(l) + '</div>'; });
  h += '<div class="lay">Finish: ' + esc(fl2.finish || '–') + '</div>';
  h += '<div class="lay">Skirting: ' + esc(fl2.skirting || '–') + '</div>';
  if (fl2.spec) h += '<div class="lay">Spec: ' + esc(fl2.spec) + '</div>';
  h += '</div></details>';

  var cl = f.ceiling || {};
  h += '<details data-sect data-id="ceil"><summary>Ceiling<span class="cnt"></span></summary><div class="body">';
  h += '<div class="lay"><b>' + esc(cl.type || '–') + '</b>' + (cl.level ? (' · level ' + esc(cl.level)) : '') + '</div>';
  (cl.buildup || []).forEach(function (l) { h += '<div class="lay">' + esc(l) + '</div>'; });
  if (cl.spec) h += '<div class="lay">Spec: ' + esc(cl.spec) + '</div>';
  h += '</div></details>';

  if (f.doors && f.doors.length) {
    h += '<details data-sect data-id="dr"><summary>Openings &amp; Doors<span class="cnt"></span></summary><div class="body">';
    f.doors.forEach(function (dr) { h += '<div class="lay"><b>' + esc(dr.type || '') + '</b> — ' + esc(dr.info || '') + '</div>'; });
    h += '</div></details>';
  }

  var ac = f.acoustic || {};
  if (ac.rating || (ac.layers || []).length) {
    h += '<details data-sect data-id="ac"><summary>Acoustic<span class="cnt"></span></summary><div class="body">';
    h += '<div class="lay">Rating: ' + esc(ac.rating || 'TBC') + '</div>';
    if (ac.layers && ac.layers.length) { h += '<div class="sublab">Achievement layers (tick as installed)</div>'; ac.layers.forEach(function (l, i) { h += tickBox(k, 'ac' + i, l, 'Acoustic layer'); }); }
    h += '</div></details>';
  }
  var fr = f.fire || {};
  if (fr.rating || (fr.stopping || []).length) {
    h += '<details data-sect data-id="fr"><summary>Fire stopping / rating<span class="cnt"></span></summary><div class="body">';
    h += '<div class="lay">Fire rating: ' + esc(fr.rating || 'TBC') + '</div>';
    if ((fr.stopping || []).length) { h += '<div class="sublab">Fire stopping / sealant status</div>'; fr.stopping.forEach(function (s, i) { h += tickBox(k, 'fs' + i, s, 'Fire stopping item'); }); }
    h += '</div></details>';
  }
  if (f.mep && f.mep.length) {
    h += '<details data-sect data-id="mep"><summary>Pre-Finishing Activities<span class="cnt"></span></summary><div class="body">';
    h += '<div class="small" style="margin-bottom:6px">Coordination checks to close out before finishes start on site.</div>';
    f.mep.forEach(function (m, i) { h += tickBox(k, 'mep' + i, m, 'Pre-finishing check'); });
    h += '</div></details>';
  }
  h += '<details data-sect data-id="prg"><summary>Daily Progress<span class="cnt"></span></summary><div class="body"><div id="prog-upd" class="small"></div><div id="prog-body"></div></div></details>';
  return h;
}

function matChipHtml(code, name, image, big) {
  var chip = image ? '<img class="mchip' + (big ? ' big' : '') + '" src="materials/' + esc(image) + '" alt="' + esc(code) + '">'
    : '<div class="mchip txt">' + esc((code || '?').slice(0, 4)) + '</div>';
  return chip;
}
function renderMaterialMockups(k, d) {
  var f = d.fin, rows = [];
  if (f && f.materials) f.materials.forEach(function (m) { rows.push({ code: m.code, name: m.desc, spec: m.spec, image: m.image }); });
  var seen = {}; rows.forEach(function (r) { seen[r.code] = 1; });
  (d.directMaterials || []).forEach(function (m) { if (!seen[m.code]) { rows.push({ code: m.code, name: m.name, spec: m.category, image: m.image }); seen[m.code] = 1; } });
  if (!rows.length) return '<div class="card small">No material mockups referenced for this room yet.</div>';
  var h = '<div class="card"><div class="small" style="margin-bottom:6px">Tap a material for full spec, sample photo & application method.</div>';
  rows.forEach(function (r) {
    h += '<div class="mat" onclick="location.hash=\'#/material/' + encodeURIComponent(r.code) + '\'">' + matChipHtml(r.code, r.name, r.image) +
      '<div><div class="mc">' + esc(r.code) + ' — ' + esc(r.name || '') + '</div><div class="md">' + esc(r.spec || '') + '</div></div></div>';
  });
  h += '</div>';
  return h;
}
function renderFFE(k, d) {
  var items = d.ffe || [];
  if (!items.length) return '<div class="card small">No typical FF&amp;E defined for ' + esc(d.abbr) + '.</div>';
  var h = '<div class="card" style="overflow:auto;padding:0"><table><tr><th></th><th>Item</th><th>Category</th><th>Spec</th><th>Qty</th><th>Material/Finish</th></tr>';
  items.forEach(function (r) {
    var mcode = r[6], img = r[7];
    var thumb = img ? '<img class="mchip" style="width:30px;height:30px" src="materials/' + esc(img) + '">' : '';
    var click = mcode ? ' style="cursor:pointer" onclick="location.hash=\'#/material/' + encodeURIComponent(mcode) + '\'"' : '';
    h += '<tr' + click + '><td>' + thumb + '</td><td><b>' + esc(r[0]) + '</b></td><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td><td>' + esc(r[3]) + '</td><td>' + esc(r[5]) + '</td></tr>';
  });
  h += '</table></div>';
  return h;
}
function renderClearances(k, d) {
  var CLEAR = META.clearances || [];
  if (!CLEAR.length) return '<div class="card small">No clearance checklist on file.</div>';
  var h = '<details data-sect data-id="clr" open><summary>Sign-off before handover<span class="cnt"></span></summary><div class="body">';
  CLEAR.forEach(function (c, i) { h += tickBox(k, 'clr' + i, c[0], c[1]); });
  h += '</div></details>';
  return h;
}
function renderRoomDocs(k, d) {
  var h = '<div class="card" style="padding:6px 14px">';
  if (d.dwg) h += '<div class="doclink" onclick="window.open(\'plans/' + esc(d.baseLevel) + '.pdf\',\'_blank\')"><div class="di">DWG</div><div class="dt"><div class="dn">' + esc(d.dwg) + '</div><div class="ds">Architectural plan · Level ' + esc(d.baseLevel) + ' · IFC Rev F00</div></div></div>';
  h += '<div class="doclink small" style="cursor:default"><div class="di" style="background:var(--brass-deep)">SCH</div><div class="dt"><div class="dn">JOH-HLA-S4-01-056-XXX-GN-CAL-AR-000020</div><div class="ds">Room area schedule · Rev F00</div></div></div>';
  var docsUsed = {};
  (d.fin && d.fin.materials || []).forEach(function (m) { if (m.sourceDoc) docsUsed[m.sourceDoc] = 1; });
  (d.directMaterials || []).forEach(function (m) { if (m.doc) docsUsed[m.doc] = 1; });
  Object.keys(docsUsed).forEach(function (docid) {
    var meta = META.docNotes[docid]; if (!meta || !meta.file) return;
    h += '<div class="doclink" onclick="window.open(\'docs/' + esc(meta.file) + '\',\'_blank\')"><div class="di">PDF</div><div class="dt"><div class="dn">' + esc(meta.title) + '</div><div class="ds">' + esc(meta.docNo) + ' · opens offline</div></div></div>';
  });
  if (d.hasIDF) h += '<div class="small" style="margin-top:8px">IDF detail crop: <b>IDF_Crops/IDF_' + esc(k.replace(/\./g, '_')) + '_L' + esc(d.baseLevel) + '.pdf</b></div>';
  h += '</div>';
  return h;
}

/* ---------- PLAN BROWSE (tap-to-search) ---------- */
function openPlanBrowse(level) {
  if (LEVELS.indexOf(level) < 0) level = LEVELS[0];
  var h = '<div class="eyebrow" style="padding:4px 2px 0">Tap a pin to open that room</div>';
  h += '<div class="levelpicker">';
  LEVELS.forEach(function (l) { h += '<button class="' + (l === level ? 'active' : '') + '" onclick="location.hash=\'#/plan/' + l + '\'">Level ' + l + '</button>'; });
  h += '</div>';
  h += '<div class="planwrap" id="pvb"><canvas></canvas><div class="dotlayer" style="position:absolute;inset:0;pointer-events:none"></div>' +
    '<div id="pvlvl">LEVEL ' + esc(level) + '</div><div class="pvstat-el" id="pvstat"></div></div>';
  h += '<div class="small" style="margin-top:8px">Drag to pan · pinch / scroll to zoom · tap a gold pin to open the room storyboard.</div>';
  app.innerHTML = h;
  document.querySelectorAll('#pvb .mkdot').forEach(function () {}); // no-op, dots injected by viewer
  document.querySelector('#pvb .dotlayer').style.pointerEvents = 'auto';
  Viewer.openBrowse(level, 'pvb', function (roomId) { location.hash = '#/room/' + encodeURIComponent(roomId); });
}

/* ---------- MATERIALS ---------- */
var MAT_CATS = null;
function getMatCats() {
  if (MAT_CATS) return MAT_CATS;
  var c = {};
  MATERIALS.forEach(function (m) { var cat = m.category || 'Other'; c[cat] = (c[cat] || 0) + 1; });
  MAT_CATS = Object.keys(c).sort();
  return MAT_CATS;
}
var matFilterCat = '', matFilterText = '';
function renderMaterialsHome() {
  q.style.display = 'none'; fl.style.display = 'none'; fa.style.display = 'none';
  var cats = getMatCats();
  var h = '<div class="eyebrow" style="padding:8px 2px 0">Material &amp; FF&amp;E Library</div>';
  h += '<div class="hint" style="font-size:13px;color:var(--ink-soft)">' + MATERIALS.length + ' coded materials, furniture &amp; fixtures from the approved schedules — search by code, product name or keyword.</div>';
  h += '<input id="mq" type="search" placeholder="Search code, product or keyword…" style="width:100%;padding:11px 12px;border:1px solid var(--line-strong);border-radius:6px;font-size:16px;margin:6px 0 10px;background:var(--card)" value="' + esc(matFilterText) + '">';
  h += '<div class="levelpicker">';
  h += '<button class="' + (matFilterCat === '' ? 'active' : '') + '" data-cat="">All (' + MATERIALS.length + ')</button>';
  cats.forEach(function (c) { h += '<button class="' + (matFilterCat === c ? 'active' : '') + '" data-cat="' + esc(c) + '">' + esc(c) + '</button>'; });
  h += '</div><div id="mgridhost"></div>';
  app.innerHTML = h;
  document.querySelectorAll('.levelpicker button').forEach(function (b) { b.onclick = function () { matFilterCat = b.dataset.cat; renderMatGrid(); document.querySelectorAll('.levelpicker button').forEach(x => x.classList.toggle('active', x === b)); }; });
  var mq = document.getElementById('mq');
  mq.addEventListener('input', function () { matFilterText = mq.value; renderMatGrid(); });
  renderMatGrid();
}
function renderMatGrid() {
  var t = (matFilterText || '').trim().toUpperCase();
  var list = MATERIALS.filter(function (m) {
    if (matFilterCat && m.category !== matFilterCat) return false;
    if (t) {
      var hay = (m.code + ' ' + (m.name || '') + ' ' + (m.category || '') + ' ' + (m.spec || '')).toUpperCase();
      if (hay.indexOf(t) < 0) return false;
    }
    return true;
  });
  var host = document.getElementById('mgridhost');
  var h = '<div class="hint">' + list.length + ' item(s)</div><div class="mgrid">';
  list.slice(0, 500).forEach(function (m) {
    h += '<div class="mcard" onclick="location.hash=\'#/material/' + encodeURIComponent(m.code) + '\'">';
    h += m.image ? '<img class="ph" src="materials/' + esc(m.image) + '" loading="lazy">' : '<div class="ph txt">' + esc(m.code.slice(0, 5)) + '</div>';
    h += '<div class="info"><div class="code">' + esc(m.code) + '</div><div class="nm">' + esc(m.name || m.category || '') + '</div></div></div>';
  });
  h += '</div>';
  host.innerHTML = h || '<div class="emptystate">No matches.</div>';
}

function specRowsFromString(spec) {
  if (!spec) return '';
  var parts = spec.split(' | ');
  var h = '';
  parts.forEach(function (p) {
    var idx = p.indexOf(':');
    if (idx > 0) h += '<div class="spec-row"><b>' + esc(p.slice(0, idx)) + '</b><span>' + esc(p.slice(idx + 1).trim()) + '</span></div>';
    else h += '<div class="spec-row"><span>' + esc(p) + '</span></div>';
  });
  return h;
}
function openMaterial(code) {
  var m = MAT_BY_CODE[code];
  if (!m) { app.innerHTML = '<div class="emptystate">Material ' + esc(code) + ' not found.</div>'; return; }
  var h = '<button class="btn ghost" onclick="history.length>1?history.back():location.hash=\'#/materials\'">← Back to library</button>';
  h += '<div class="card" style="padding:12px">';
  h += m.image ? '<img class="mdetail-photo" src="materials/' + esc(m.image) + '">' : '<div class="mdetail-photo" style="display:flex;align-items:center;justify-content:center;color:var(--mut)">No sample photo on file</div>';
  h += '<div class="eyebrow" style="margin-top:12px">' + esc(m.category || 'Material') + '</div>';
  h += '<div style="font-family:var(--serif);font-size:20px;font-weight:700;color:var(--ink)">' + esc(m.code) + '</div>';
  h += '<div style="font-size:14px;color:var(--ink-soft);margin-top:2px">' + esc(m.name || '') + '</div>';
  h += '</div>';

  h += '<h2 class="sec">Specification</h2><div class="card">' + specRowsFromString(m.spec) + '</div>';

  if (m.variants && m.variants.length) {
    h += '<h2 class="sec">Variants of ' + esc(m.code) + '<span class="n">' + m.variants.length + '</span></h2><div class="card">';
    m.variants.forEach(function (v) {
      h += '<div class="mat">' + matChipHtml(m.code, v.name, v.image) + '<div><div class="mc">' + esc(v.name || '') + '</div><div class="md">' + esc(v.location || '') + '</div></div></div>';
    });
    h += '</div>';
  }

  if (m.contact) {
    h += '<h2 class="sec">Supplier / Contact</h2><div class="card small" style="white-space:pre-line">' + esc(m.contact.replace(/ \/ /g, '\n')) + '</div>';
  }

  var docMeta = META.docNotes[m.doc];
  h += '<h2 class="sec">Application &amp; Approval Notes</h2><div class="card small">';
  if (docMeta && docMeta.generalNotes) h += docMeta.generalNotes.slice(0, 6).map(esc).join('<br>');
  h += '</div>';

  h += '<h2 class="sec">Source Document</h2><div class="card" style="padding:6px 14px">';
  if (docMeta && docMeta.file) {
    h += '<div class="doclink" onclick="window.open(\'docs/' + esc(docMeta.file) + '#page=' + m.page + '\',\'_blank\')"><div class="di">PDF</div><div class="dt"><div class="dn">' + esc(docMeta.title) + '</div><div class="ds">' + esc(docMeta.docNo) + ' · page ' + m.page + ' · opens offline</div></div></div>';
  } else {
    h += '<div class="small">' + esc(m.docTitle || '') + ' · page ' + m.page + '</div>';
  }
  h += '</div>';

  h += '<h2 class="sec">Rooms Using This Material<span class="n">' + (m.rooms ? m.rooms.length : 0) + '</span></h2><div class="card">';
  if (m.rooms && m.rooms.length) {
    m.rooms.forEach(function (r) { h += '<span class="roomchip" onclick="location.hash=\'#/room/' + encodeURIComponent(r.id) + '\'">' + esc(r.id) + ' · ' + esc(r.name) + '</span>'; });
    h += '<div class="small" style="margin-top:8px">Best-effort match from the schedule’s location text — verify placement against the IFC drawings before ordering.</div>';
  } else {
    h += '<div class="small">No specific rooms auto-matched for this item — check the source document for location call-outs.</div>';
  }
  h += '</div>';

  app.innerHTML = h;
}

/* ---------- print / export single room ---------- */
function printRoom(k) {
  var d = ROOMS[k], st = d.study || ['', ''];
  var h = '<h1>Room Storyboard: ' + esc(k) + '</h1><div class="small">Jeddah Opera House · FF&amp;E Site Reference · Rev F00 IFC 31-01-2024</div>';
  h += '<h2>Room information</h2><table class="kv">' + row2('Room number', k) + row2('Room name', d.name) + row2('Level', 'Level ' + esc(d.level)) + row2('Zone', d.zone) + row2('Nett area', d.area ? d.area + ' m²' : 'n/a') + row2('Function', d.function) + row2('Abbreviation', d.abbr) + row2('Usage', st[0]) + row2('OPE function', st[1]) + '</table>';
  var items = d.ffe || [];
  if (items.length) {
    h += '<h2>FF&amp;E schedule — ' + esc(d.abbr) + '</h2><table><tr><th>Item</th><th>Category</th><th>Specification</th><th>Qty</th><th>Material/Finish</th></tr>';
    items.forEach(function (r) { h += '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td><td>' + esc(r[3]) + '</td><td>' + esc(r[5]) + '</td></tr>'; });
    h += '</table>';
  }
  var f = d.fin;
  if (f) {
    h += '<h2>Finishing schedule</h2><div class="small">';
    (f.walls || []).forEach(function (w) { h += esc(w.type || '') + ': ' + esc(w.spec || '') + '. '; });
    var fl2 = f.floor || {}, cl = f.ceiling || {};
    h += 'Floor: ' + esc(fl2.finish || '') + ' (' + esc(fl2.skirting || '') + '). Ceiling: ' + esc(cl.type || '') + '. ';
    var ac = f.acoustic || {}, fr = f.fire || {};
    h += 'Acoustic: ' + esc(ac.rating || 'TBC') + '. Fire: ' + esc(fr.rating || 'TBC') + '.</div>';
  }
  var CLEAR = META.clearances || [];
  if (CLEAR.length) {
    h += '<h2>Clearance / release checklist</h2><table class="kv">';
    CLEAR.forEach(function (c, i) { var s = getState(k); h += '<tr><td>' + esc(c[0]) + '</td><td>' + (s['clr' + i] ? '✓ done' : '☐ pending') + '</td></tr>'; });
    h += '</table>';
  }
  h += '<h2>References</h2><div class="small">Plan: ' + esc(d.dwg || 'n/a') + ' | Schedule: JOH-HLA-S4-01-056-XXX-GN-CAL-AR-000020 Rev F00 | IFC 31-01-2024</div>';
  document.getElementById('doc').innerHTML = h;
  setTimeout(function () { window.print(); }, 400);
}
