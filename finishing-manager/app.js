/* JOH Finishing Manager — app logic */
var ROOMS = {}, MATERIALS = [], MAT_BY_CODE = {}, META = {}, EXTRA = {}, SEARCH = {docs: [], pages: []}, DISCIPLINES = {}, LEVELS = [];

function esc(s) {
  return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }

/* ---------- persisted checklist state ---------- */
function getState(key) {
  try { return JSON.parse(localStorage.getItem('joh_fm_' + key) || '{}'); } catch (e) { return {}; }
}
function setState(key, obj) {
  try { localStorage.setItem('joh_fm_' + key, JSON.stringify(obj)); } catch (e) {}
}
function toggleFlag(stateKey, itemKey) {
  var st = getState(stateKey);
  st[itemKey] = !st[itemKey];
  setState(stateKey, st);
  return st[itemKey];
}

/* ---------- boot ---------- */
function startApp() {
  if (typeof ROOMS_DATA !== 'undefined') {
    ROOMS = ROOMS_DATA; MATERIALS = MATERIALS_DATA; META = META_DATA; EXTRA = EXTRA_DATA;
    SEARCH = SEARCH_DATA; DISCIPLINES = DISCIPLINES_DATA;
    MATERIALS.forEach(function (m) { MAT_BY_CODE[m.code] = m; });
    LEVELS = META.levels || [];
    boot();
  } else {
    document.getElementById('app').innerHTML = '<div class="emptystate"><div class="big">⚠️</div>Could not load project data.</div>';
  }
}

function boot() {
  var fl = document.getElementById('fl');
  LEVELS.forEach(function (l) {
    var code = (typeof l === 'string') ? l : l.code;
    fl.appendChild(el('<option value="' + esc(code) + '">' + esc(code) + '</option>'));
  });
  document.querySelectorAll('#tabbar button').forEach(function (b) {
    b.addEventListener('click', function () {
      var tab = b.getAttribute('data-tab');
      if (tab === 'rooms') location.hash = '#/';
      else if (tab === 'plan') location.hash = '#/plan/' + (LEVELS[0] ? (typeof LEVELS[0] === 'string' ? LEVELS[0] : LEVELS[0].code) : '00');
      else if (tab === 'search') location.hash = '#/search';
    });
  });
  document.getElementById('q').addEventListener('input', onHeaderSearch);
  document.getElementById('fl').addEventListener('change', onHeaderSearch);
  window.addEventListener('hashchange', route);
  route();
}

function setActiveTab(tab) {
  document.querySelectorAll('#tabbar button').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-tab') === tab);
  });
}

function onHeaderSearch() {
  if (location.hash.indexOf('#/room') === 0 || location.hash.indexOf('#/plan') === 0 || location.hash.indexOf('#/search') === 0) {
    location.hash = '#/';
  }
  renderHome();
}

/* ---------- router ---------- */
function route() {
  var h = location.hash || '#/';
  closeDoc();
  if (h.indexOf('#/room/') === 0) {
    setActiveTab('rooms');
    openRoom(decodeURIComponent(h.slice(7)));
  } else if (h.indexOf('#/plan/') === 0) {
    setActiveTab('plan');
    openPlanBrowse(decodeURIComponent(h.slice(7)));
  } else if (h.indexOf('#/search') === 0) {
    setActiveTab('search');
    renderSearch();
  } else {
    setActiveTab('rooms');
    renderHome();
  }
  window.scrollTo(0, 0);
}

/* ---------- home / room list ---------- */
function renderHome() {
  var q = (document.getElementById('q').value || '').trim().toLowerCase();
  var lvl = document.getElementById('fl').value;
  var ids = Object.keys(ROOMS);
  if (lvl) ids = ids.filter(function (id) { return ROOMS[id].level === lvl; });
  if (q) {
    ids = ids.filter(function (id) {
      var r = ROOMS[id];
      return id.toLowerCase().indexOf(q) >= 0 || (r.name || '').toLowerCase().indexOf(q) >= 0 || (r.abbr || '').toLowerCase().indexOf(q) >= 0;
    });
  }
  ids.sort();
  var cap = 250;
  var html = '<div class="sectionhead">' + ids.length + ' room' + (ids.length === 1 ? '' : 's') + (q || lvl ? ' matching' : ' total') + '</div>';
  if (!ids.length) {
    html += '<div class="emptystate">No rooms match.</div>';
  } else {
    ids.slice(0, cap).forEach(function (id) {
      var r = ROOMS[id];
      html += '<div class="roomrow" data-id="' + esc(id) + '">' +
        '<div><div class="rname">' + esc(r.name) + '</div><div class="rmeta">' + esc(id) + ' · Level ' + esc(r.level) + (r.area ? ' · ' + r.area.toFixed(0) + ' m²' : '') + '</div></div>' +
        '<div class="rbadge">' + esc(r.abbr) + '</div></div>';
    });
    if (ids.length > cap) html += '<div class="small" style="text-align:center;padding:10px">Showing first ' + cap + ' — refine your search to narrow down.</div>';
  }
  var app = document.getElementById('app');
  app.innerHTML = html;
  app.querySelectorAll('.roomrow').forEach(function (row) {
    row.addEventListener('click', function () { location.hash = '#/room/' + encodeURIComponent(row.getAttribute('data-id')); });
  });
}

/* ---------- room detail ---------- */
function openRoom(id) {
  var r = ROOMS[id], x = EXTRA[id];
  var app = document.getElementById('app');
  if (!r) { app.innerHTML = '<div class="emptystate">Room not found.</div>'; return; }
  x = x || { narrative: '', sequence: { walls: [], floors: [], ceilings: [] }, clearance: [], finishing: {}, planCrops: [], doors: [], scopeContractor: '' };

  var html = '<button class="backbtn" onclick="history.back()">‹ Back</button>';
  html += '<div class="roomhead"><div class="rid">' + esc(id) + '</div><h2>' + esc(r.name) + '</h2>' +
    '<div class="rtags"><span class="rtag">Level ' + esc(r.level) + '</span><span class="rtag">' + esc(r.abbr) + '</span>' +
    (r.area ? '<span class="rtag">' + r.area.toFixed(1) + ' m²</span>' : '') +
    (r.function ? '<span class="rtag">' + esc(r.function) + '</span>' : '') +
    (x.scopeContractor ? '<span class="rtag scope-' + esc(x.scopeContractor.replace(/\s+/g, '')) + '">' + esc(x.scopeContractor) + ' scope</span>' : '') +
    '</div></div>';

  html += '<div class="sectionhead">Overview</div><div class="card narrative">' + esc(x.narrative) + '</div>';

  html += '<div class="sectionhead">Location</div><div class="minimap" id="minimap"><canvas></canvas><div class="mk"></div><div class="pvstat-el" id="pvstat"></div></div>' +
    '<div class="small" style="margin-top:6px">Tap the map to open the full level plan.</div>';

  if (x.planCrops && x.planCrops.length) {
    html += '<div class="sectionhead">Finishing Plans (drawing extract)</div><div class="crop-row">';
    x.planCrops.forEach(function (c) {
      html += '<div class="crop-card"><img src="crops/' + esc(c.file) + '" data-full="crops/' + esc(c.file) + '" class="crop-img">' +
        '<div class="cc-cap">' + esc(c.pdf.replace('OPE ', '').replace('.pdf', '')) + ' · p.' + c.page + (c.codes && c.codes.length ? ' · ' + c.codes.slice(0, 4).join(', ') : '') + '</div></div>';
    });
    html += '</div><div class="crop-note">Extracted directly from the project typology drawings (' + x.planCrops.map(function(c){return c.pdf.replace('OPE ','').replace('.pdf','')}).filter(function(v,i,a){return a.indexOf(v)===i}).join(', ') + '). Verify against the full IFC set before construction.</div>';
  }

  html += renderDoors(x.doors, r.level);
  html += renderFinishingSchedule(x.finishing, id);
  html += renderSequence(id, x.sequence);
  html += renderClearance(id, x.clearance);
  html += renderFFE(r.ffe, r.directMaterials);
  html += renderRoomDocs(r);

  html += '<div class="sectionhead">&nbsp;</div><button class="printbtn" onclick="window.print()">Print this room</button>';

  app.innerHTML = html;

  // minimap
  try {
    Viewer.openRoom(id, 'minimap');
    document.getElementById('minimap').addEventListener('click', function () {
      location.hash = '#/plan/' + encodeURIComponent(r.level);
    });
  } catch (e) {}

  app.querySelectorAll('.crop-img').forEach(function (img) {
    img.addEventListener('click', function () { openDocImage(img.getAttribute('data-full'), img.alt || ''); });
  });
  app.querySelectorAll('.mthumb').forEach(function (img) {
    img.addEventListener('click', function () {
      var code = img.getAttribute('data-code');
      if (code) location.href = '#'; // no-op; material detail omitted in simplified app
      openDocImage(img.getAttribute('data-full'), code || '');
    });
  });
  app.querySelectorAll('.stage-check').forEach(function (cb) {
    cb.addEventListener('change', function () {
      var key = cb.getAttribute('data-key');
      var st = getState('seq_' + id);
      st[key] = cb.checked;
      setState('seq_' + id, st);
      cb.closest('li').classList.toggle('done', cb.checked);
      updateSeqProgress(id);
    });
  });
  app.querySelectorAll('.clear-check').forEach(function (cb) {
    cb.addEventListener('change', function () {
      var key = cb.getAttribute('data-key');
      var st = getState('clear_' + id);
      st[key] = cb.checked;
      setState('clear_' + id, st);
      cb.closest('tr').classList.toggle('done', cb.checked);
    });
  });
}

function renderDoors(doors, level) {
  doors = doors || [];
  if (!doors.length) return '';
  var html = '<div class="sectionhead">Doors</div>';
  doors.forEach(function (d) {
    html += '<div class="card doorcard">' +
      '<div class="doorhead"><span class="doormark">' + esc(d.mark) + '</span>' +
      (d.keynote ? '<span class="doortype">' + esc(d.keynote) + '</span>' : '') + '</div>' +
      '<table class="doorspecs">' +
      (d.size ? '<tr><td>Size</td><td>' + esc(d.size) + (d.module_size ? ' (module ' + esc(d.module_size) + ')' : '') + '</td></tr>' : '') +
      '<tr><td>Fire rating</td><td>' + esc(d.fire || 'N/A') + '</td></tr>' +
      '<tr><td>Acoustic rating</td><td>' + esc(d.acoustic || 'N/A') + '</td></tr>' +
      (d.threshold ? '<tr><td>Threshold</td><td>' + esc(d.threshold) + (d.hinge_side ? ' · hinge ' + esc(d.hinge_side) : '') + '</td></tr>' : '') +
      (d.material ? '<tr><td>Leaf / finish</td><td>' + esc(d.material) + '</td></tr>' : '') +
      (d.hardware && d.hardware.length ? '<tr><td>Hardware</td><td>' + esc(d.hardware.join(', ')) + '</td></tr>' : '') +
      (d.eacs && d.eacs !== 'N/A' ? '<tr><td>Access control (EACS)</td><td>' + esc(d.eacs) + '</td></tr>' : '') +
      (d.connects_to_name ? '<tr><td>Connects to</td><td>' + esc(d.connects_to_name) + (d.connects_to ? ' (' + esc(d.connects_to) + ')' : '') + '</td></tr>' : '') +
      '</table>' +
      '<div class="doorfoundation"><strong>Installation / backing requirements:</strong> ' + esc(d.foundation || '') + '</div>' +
      '</div>';
  });
  html += '<div class="crop-note">From the project Door Schedule (AR-010500/501) — mark, opening dimensions, fire/acoustic ratings and hardware are as scheduled; anchorage/backing notes are derived from Spec 08 11 13 and this room’s wall type, and from the fire/acoustic rating shown. Verify against the door typology drawings (AR-015300-306) before construction.</div>';
  return html;
}

function renderFinishingSchedule(fin, roomId) {
  fin = fin || {};
  var rows = [];
  var surfaces = [
    { label: 'Wall', obj: (fin.walls && fin.walls[0]) || {}, spec: (fin.walls && fin.walls[0] && fin.walls[0].spec) },
    { label: 'Floor', obj: fin.floor || {}, spec: fin.floor && fin.floor.finish },
    { label: 'Skirting', obj: {}, spec: fin.floor && fin.floor.skirting },
    { label: 'Ceiling', obj: fin.ceiling || {}, spec: fin.ceiling && fin.ceiling.type },
  ];
  var matList = fin.materials || [];
  var html = '<div class="sectionhead">Finishing Schedule</div><div class="card"><table class="fintable"><tr><th>Surface</th><th>Code</th><th>Description</th><th></th></tr>';
  var used = {};
  matList.forEach(function (m) {
    var img = m.image ? '<img class="mthumb" data-full="materials/' + esc(m.image) + '" src="materials/' + esc(m.image) + '">' : '';
    var desc = esc(m.desc || '');
    if (m.specRefs && m.specRefs.length) {
      desc += '<div class="small" style="margin-top:3px">“…' + esc(m.specRefs[0].snippet.slice(0, 140)) + '…” — ' + esc(m.specRefs[0].doc) + ', p.' + m.specRefs[0].page + '</div>';
    }
    html += '<tr><td>Ref.</td><td class="mcode">' + esc(m.code) + '</td><td>' + desc + '</td><td>' + img + '</td></tr>';
    used[m.code] = true;
  });
  surfaces.forEach(function (s) {
    if (!s.spec) return;
    html += '<tr><td>' + s.label + '</td><td class="mcode">—</td><td>' + esc(s.spec) + ' <span class="confbadge typical">typical build-up</span></td><td></td></tr>';
  });
  if (!matList.length && !surfaces.some(function(s){return s.spec})) {
    html += '<tr><td colspan="4" class="small">No finishing schedule data extracted for this room.</td></tr>';
  }
  html += '</table></div>';
  html += '<div class="crop-note">Codes drawn from drawing extracts are marked <span class="confbadge confirmed">confirmed</span> in the plan crops above; other rows show the typical build-up for this room type — verify against the approved IFC drawings and specification.</div>';
  return html;
}

function renderSequence(id, seq) {
  seq = seq || { walls: [], floors: [], ceilings: [] };
  var st = getState('seq_' + id);
  function group(title, num, key, stages) {
    var html = '<div class="seqgroup"><h4><span class="n">' + num + '</span>' + title + '<span class="seqprog" id="prog-' + key + '"></span></h4><ul class="stagelist">';
    stages.forEach(function (s, i) {
      var k = key + '_' + i;
      var done = !!st[k];
      html += '<li class="' + (done ? 'done' : '') + '"><input type="checkbox" class="stage-check" data-key="' + k + '" id="cb-' + key + '-' + i + '" ' + (done ? 'checked' : '') + '>' +
        '<label for="cb-' + key + '-' + i + '">' + esc(s) + '</label></li>';
    });
    html += '</ul></div>';
    return html;
  }
  var html = '<div class="sectionhead">Construction Sequence — Preparation to Delivery</div><div class="card">';
  html += group('Walls', 1, 'walls', seq.walls || []);
  html += group('Floors', 2, 'floors', seq.floors || []);
  html += group('Ceilings', 3, 'ceilings', seq.ceilings || []);
  html += '</div>';
  setTimeout(function () { updateSeqProgress(id); }, 0);
  return html;
}
function updateSeqProgress(id) {
  var st = getState('seq_' + id);
  ['walls', 'floors', 'ceilings'].forEach(function (key) {
    var el2 = document.getElementById('prog-' + key);
    if (!el2) return;
    var items = document.querySelectorAll('[data-key^="' + key + '_"]');
    var done = 0;
    items.forEach(function (cb) { if (cb.checked) done++; });
    el2.textContent = items.length ? (done + '/' + items.length) : '';
  });
}

function renderClearance(id, clearance) {
  clearance = clearance || [];
  var st = getState('clear_' + id);
  var html = '<div class="sectionhead">Delivery Clearance — By Discipline</div><div class="card"><table class="cleartable">';
  clearance.forEach(function (c, i) {
    var k = 'c' + i;
    var done = !!st[k];
    html += '<tr class="' + (done ? 'done' : '') + '"><td><input type="checkbox" class="clear-check" data-key="' + k + '" id="cc-' + i + '" ' + (done ? 'checked' : '') + '></td>' +
      '<td><label for="cc-' + i + '"><div class="discname">' + esc(c.label) + '</div>' +
      (c.disciplines && c.disciplines.length ? '<div class="disccode">' + esc(c.disciplines.join(' · ')) + '</div>' : '') +
      '<div class="req">' + esc(c.requirement) + '</div></label></td></tr>';
  });
  if (!clearance.length) html += '<tr><td class="small">No clearance checklist available.</td></tr>';
  html += '</table></div>';
  return html;
}

function renderFFE(ffe, directMaterials) {
  ffe = ffe || [];
  if (!ffe.length && !(directMaterials || []).length) return '';
  var html = '<div class="sectionhead">FF&amp;E</div><div class="card"><ul class="ffelist">';
  ffe.forEach(function (row) {
    html += '<li><div class="fname">' + esc(row[0]) + '</div><div class="fmeta">' + esc(row[2] || '') + (row[4] ? ' — ' + esc(row[4]) : '') + '</div></li>';
  });
  html += '</ul></div>';
  return html;
}

function renderRoomDocs(r) {
  if (!r.dwg) return '';
  return '<div class="sectionhead">Reference Drawing</div><div class="doclink"><span>' + esc(r.dwg) + '</span></div>';
}

/* ---------- plan browse ---------- */
function openPlanBrowse(level) {
  if (!level) level = LEVELS[0] ? (typeof LEVELS[0] === 'string' ? LEVELS[0] : LEVELS[0].code) : '00';
  var app = document.getElementById('app');
  var html = '<div class="plvbar"><select id="pl-lvl">';
  LEVELS.forEach(function (l) {
    var code = (typeof l === 'string') ? l : l.code;
    html += '<option value="' + esc(code) + '" ' + (code === level ? 'selected' : '') + '>' + esc(code) + '</option>';
  });
  html += '</select></div><div id="planwrap"><canvas></canvas><div class="dotlayer" style="position:absolute;inset:0;pointer-events:auto"></div><div class="pvstat-el" id="pvstat"></div></div><div class="small" style="margin-top:8px">Tap a marker to open that room.</div>';
  app.innerHTML = html;
  document.getElementById('pl-lvl').addEventListener('change', function (e) {
    location.hash = '#/plan/' + encodeURIComponent(e.target.value);
  });
  try {
    Viewer.openBrowse(level, 'planwrap', function (roomId) { location.hash = '#/room/' + encodeURIComponent(roomId); });
  } catch (e) {}
}

/* ---------- full text search ---------- */
function tokenize(q) {
  return q.toLowerCase().split(/[^a-z0-9؀-ۿ]+/i).filter(function (t) { return t.length > 1; });
}
function runSearch(q) {
  var terms = tokenize(q);
  if (!terms.length) return [];
  var scored = [];
  var pages = SEARCH.pages;
  for (var i = 0; i < pages.length; i++) {
    var t = pages[i].t.toLowerCase();
    var score = 0, hit = false;
    for (var j = 0; j < terms.length; j++) {
      var idx = t.indexOf(terms[j]);
      if (idx >= 0) { score += 1; hit = true; } else { score -= 0.15; }
    }
    if (hit && score > 0) scored.push({ p: pages[i], score: score });
  }
  scored.sort(function (a, b) { return b.score - a.score; });
  return scored.slice(0, 40);
}
function snippetFor(text, terms) {
  var low = text.toLowerCase();
  var pos = -1;
  for (var i = 0; i < terms.length; i++) { pos = low.indexOf(terms[i]); if (pos >= 0) break; }
  if (pos < 0) pos = 0;
  var start = Math.max(0, pos - 90), end = Math.min(text.length, pos + 220);
  var snip = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  var re = new RegExp('(' + terms.map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')', 'ig');
  return esc(snip).replace(re, function (m) { return '<mark>' + m + '</mark>'; });
}
function renderSearch() {
  var app = document.getElementById('app');
  app.innerHTML = '<div class="sectionhead">Search the Project</div>' +
    '<div class="searchtip">Full-text search across ' + SEARCH.docs.length + ' project documents (' + SEARCH.pages.length + ' pages) — specifications, reports, compliance documents, and drawing sheets. Results cite the exact document and page.</div>' +
    '<input id="fts" type="search" placeholder="e.g. porcelain tile, IW07, acoustic ceiling, fire stopping…" style="width:100%;padding:11px;border-radius:8px;border:1px solid var(--line);font-size:14px;margin-bottom:12px">' +
    '<div id="fts-results"></div>';
  var input = document.getElementById('fts');
  var results = document.getElementById('fts-results');
  var timer = null;
  input.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(function () {
      var q = input.value.trim();
      if (q.length < 2) { results.innerHTML = ''; return; }
      var hits = runSearch(q);
      var terms = tokenize(q);
      if (!hits.length) { results.innerHTML = '<div class="emptystate">No matches.</div>'; return; }
      var html = '<div class="small" style="margin-bottom:8px">' + hits.length + ' matching page(s)</div>';
      hits.forEach(function (h) {
        var doc = SEARCH.docs[h.p.d];
        html += '<div class="searchhit"><div class="sh-doc">' + esc(doc.title) + '</div>' +
          '<div class="sh-meta">' + esc(doc.cat) + ' · page ' + h.p.p + (doc.npages ? ' of ' + doc.npages : '') + '</div>' +
          '<div class="sh-snip">' + snippetFor(h.p.t, terms) + '</div></div>';
      });
      results.innerHTML = html;
    }, 200);
  });
}

/* ---------- doc / image viewer overlay ---------- */
function openDocImage(src, caption) {
  var doc = document.getElementById('doc');
  doc.innerHTML = '<div class="docbar"><button onclick="closeDoc()">Close ✕</button></div><img src="' + esc(src) + '" alt="' + esc(caption) + '">';
  doc.classList.add('open');
}
function closeDoc() {
  var doc = document.getElementById('doc');
  doc.classList.remove('open');
  doc.innerHTML = '';
}

startApp();
