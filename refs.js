/* ============================================================
   JOH Site — REFERENCE DRAWINGS (AutoCAD .dwg)
   • The coloured scope plan + wall / ceiling / floor plans live in
     refs/ in the repo.
   • "Save offline" keeps them on the phone in their own cache
     (not cleared by app updates); the app re-checks on open and
     refreshes a drawing only when the file on GitHub changed.
     On Wi-Fi it downloads / updates by itself.
   • "Open in AutoCAD" hands the file to the AutoCAD app (share
     sheet), or saves it to Downloads where AutoCAD opens it —
     works offline once saved.
   ============================================================ */
var Refs = (function () {
  var CACHE = 'joh-dwg-v1', K_META = 'joh_dwg_meta';
  var LIST = [
    { id: 'overall', name: 'Overall plan — coloured by scope', file: 'refs/JOH_Overall_Colored.dwg', note: 'Subcontractor scope colours (ZAK / MBL Marine / BAUMAT / ICONIC)', size: 87387344 },
    { id: 'walls', name: 'Wall plans', file: 'refs/JOH_Wall_Plans.dwg', note: 'Wall types & finishes', size: 54947270 },
    { id: 'ceilings', name: 'Ceiling plans', file: 'refs/JOH_Ceilings.dwg', note: 'Reflected ceiling plans', size: 72228590 },
    { id: 'floors', name: 'Floor plans', file: 'refs/JOH_Floors.dwg', note: 'Floor finishes', size: 51869827 }
  ];
  var busy = {};
  function $(id) { return document.getElementById(id); }
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mb(n) { return (n / 1048576).toFixed(0) + ' MB'; }
  function meta() { try { return JSON.parse(localStorage.getItem(K_META) || '{}'); } catch (x) { return {}; } }
  function setMeta(id, v) { var m = meta(); m[id] = v; try { localStorage.setItem(K_META, JSON.stringify(m)); } catch (x) {} }
  function toast(t) { if (window.Locs) Locs.toast(t); }
  function url(r) { return new URL(r.file, location.href).href; }
  function hasCache() { return 'caches' in window; }

  function cached(r) { return hasCache() ? caches.open(CACHE).then(function (c) { return c.match(url(r)); }) : Promise.resolve(null); }
  function remoteTag(r) {
    return fetch(r.file, { method: 'HEAD', cache: 'no-store' }).then(function (res) { return res.ok ? (res.headers.get('etag') || res.headers.get('last-modified') || String(res.headers.get('content-length'))) : null; }).catch(function () { return null; });
  }
  function download(r, silent) {
    if (busy[r.id]) return busy[r.id];
    if (!hasCache()) { if (!silent) alert('This browser cannot keep files offline.'); return Promise.resolve(); }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
    var p = fetch(r.file, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error(res.status === 404 ? 'not uploaded yet' : 'HTTP ' + res.status);
      var tag = res.headers.get('etag') || res.headers.get('last-modified') || '';
      var total = +res.headers.get('content-length') || r.size, got = 0, parts = [];
      var rd = res.body && res.body.getReader ? res.body.getReader() : null;
      var finish = function (blob) {
        return caches.open(CACHE).then(function (c) {
          return c.put(url(r), new Response(blob, { headers: { 'Content-Type': 'application/acad', 'Content-Length': String(blob.size) } }));
        }).then(function () { setMeta(r.id, { tag: tag, t: Date.now(), size: blob.size }); });
      };
      if (!rd) return res.blob().then(finish);
      var pump = function () {
        return rd.read().then(function (x) {
          if (x.done) return finish(new Blob(parts, { type: 'application/acad' }));
          parts.push(x.value); got += x.value.length; progress(r, got / total); return pump();
        });
      };
      return pump();
    }).then(function () { delete busy[r.id]; paint(); if (!silent) toast('✓ ' + r.name + ' saved offline'); })
      .catch(function (x) { delete busy[r.id]; paint(); if (!silent) alert(r.name + ': ' + (x.message || 'download failed')); });
    busy[r.id] = p; paint();
    return p;
  }
  function remove(r) { if (!confirm('Remove ' + r.name + ' from this phone?')) return; caches.open(CACHE).then(function (c) { return c.delete(url(r)); }).then(function () { setMeta(r.id, null); paint(); }); }
  function progress(r, f) { var el = $('dwg-p-' + r.id); if (el) el.style.width = Math.round(f * 100) + '%'; var t = $('dwg-s-' + r.id); if (t) t.textContent = 'Downloading… ' + Math.round(f * 100) + '%'; }

  /* open: hand the file to AutoCAD (share sheet) or save to Downloads */
  function open(id) {
    var r = LIST.filter(function (x) { return x.id === id; })[0]; if (!r) return;
    cached(r).then(function (res) {
      if (res) return res.blob();
      if (!navigator.onLine) throw new Error('Not saved on this phone yet — connect once and tap Save offline.');
      toast('Downloading ' + r.name + '…');
      return download(r, true).then(function () { return cached(r); }).then(function (x) { if (!x) throw new Error('Download failed'); return x.blob(); });
    }).then(function (blob) {
      var name = r.file.split('/').pop(), file = new File([blob], name, { type: 'application/acad' });
      var canShare = false; try { canShare = !!(navigator.canShare && navigator.canShare({ files: [file] })); } catch (x) {}
      if (canShare) return navigator.share({ files: [file], title: r.name }).catch(function (x) { if (x && x.name !== 'AbortError') save(blob, name); });
      save(blob, name);
    }).catch(function (x) { alert(x.message || 'Could not open the drawing.'); });
  }
  function save(blob, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
    toast('Saved to Downloads — tap it and choose AutoCAD');
  }

  /* keep them current: check on open; auto-download on Wi-Fi */
  var checked = false, upd = {};
  function check() {
    if (checked || !navigator.onLine || !hasCache()) return; checked = true;
    var c = navigator.connection, wifi = c && (c.type === 'wifi' || c.type === 'ethernet') && !c.saveData;
    LIST.forEach(function (r) {
      Promise.all([cached(r), remoteTag(r)]).then(function (v) {
        var have = v[0], tag = v[1], m = meta()[r.id];
        if (!tag) return;                                         // not uploaded / offline
        if (have && m && m.tag === tag) return;                   // up to date
        upd[r.id] = have ? 'update' : 'new'; paint();
        if (wifi) download(r, true);
      });
    });
  }

  /* ---------- UI ---------- */
  function section(level) {
    setTimeout(paint, 0); setTimeout(check, 500);
    var h = '<div class="card dwg-help small">Tap <b>Open in AutoCAD</b> and pick AutoCAD in the share list (or open the saved file from Downloads). ' +
      (level ? 'Then switch to the <b>Level ' + e(level) + '</b> layout / view.' : 'Then switch to the layout of the level you need.') + '</div>';
    LIST.forEach(function (r) {
      h += '<div class="card dwg" id="dwg-' + r.id + '"><div class="dwg-top"><div class="dwg-ic">DWG</div><div class="dwg-t"><b>' + e(r.name) + '</b><div class="small">' + e(r.note) + ' · ' + mb(r.size) + '</div>' +
        '<div class="small dwg-s" id="dwg-s-' + r.id + '"></div><div class="dwg-bar"><i id="dwg-p-' + r.id + '"></i></div></div></div>' +
        '<div class="dwg-acts"><button class="btn brass" onclick="Refs.open(\'' + r.id + '\')">Open in AutoCAD</button><span id="dwg-b-' + r.id + '"></span></div></div>';
    });
    h += '<div class="sc-actions"><button class="btn ghost" onclick="Refs.all()">⬇ Save all offline</button><span class="small" id="dwg-quota"></span></div>';
    return h;
  }
  function paint() {
    var m = meta();
    LIST.forEach(function (r) {
      var s = $('dwg-s-' + r.id), b = $('dwg-b-' + r.id), card = $('dwg-' + r.id); if (!s) return;
      cached(r).then(function (have) {
        if (busy[r.id]) { card.classList.add('busy'); return; }
        card.classList.remove('busy');
        var p = $('dwg-p-' + r.id); if (p) p.style.width = '0';
        if (have) {
          s.innerHTML = '✓ Saved offline' + (m[r.id] ? ' · ' + new Date(m[r.id].t).toLocaleDateString() : '') + (upd[r.id] === 'update' ? ' · <b style="color:var(--amber)">update available</b>' : '');
          b.innerHTML = (upd[r.id] === 'update' ? '<button class="btn ghost" onclick="Refs.dl(\'' + r.id + '\')">⟳ Update</button>' : '') + '<button class="btn ghost" onclick="Refs.rm(\'' + r.id + '\')">Remove</button>';
          card.classList.add('ok');
        } else {
          s.textContent = 'Not on this phone yet'; card.classList.remove('ok');
          b.innerHTML = '<button class="btn ghost" onclick="Refs.dl(\'' + r.id + '\')">⬇ Save offline</button>';
        }
      });
    });
    var q = $('dwg-quota');
    if (q && navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (x) { q.textContent = 'Phone storage used by the app: ' + mb(x.usage || 0); });
  }
  function byId(id) { return LIST.filter(function (x) { return x.id === id; })[0]; }
  window.addEventListener('online', function () { checked = false; check(); });
  setTimeout(check, 4000);
  return { LIST: LIST, section: section, open: open, dl: function (id) { download(byId(id)); }, rm: function (id) { remove(byId(id)); },
    all: function () { LIST.reduce(function (p, r) { return p.then(function () { return cached(r).then(function (h) { return h && !upd[r.id] ? null : download(r, true); }); }); }, Promise.resolve()).then(function () { toast('✓ All drawings saved offline'); }); } };
})();
