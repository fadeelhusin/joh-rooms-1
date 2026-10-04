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
  var busy = {}, IS_WIN = /Windows/.test(navigator.userAgent), LVL = '';
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
  /* Windows PC: the johcad:// link (installed once by pc/JOH-CAD-Setup.cmd) opens the drawing
     straight in AutoCAD / ZWCAD on the level's layout, from C:\JOH-CAD\drawings (offline). */
  function openPC(id, level) {
    var t = Date.now(), left = false;
    var onBlur = function () { left = true; };
    window.addEventListener('blur', onBlur);
    location.href = 'johcad://open/' + id + (level ? '/' + level : '');
    setTimeout(function () {
      window.removeEventListener('blur', onBlur);
      if (!left && document.hasFocus()) { var s = document.getElementById('dwg-pc'); if (s) s.classList.add('warn'); }
    }, 2500);
  }
  /* Why the old way failed: the file was read from storage first and only then handed to the share
     sheet / a download — by then the phone no longer counted it as "your tap", so iOS refused the share
     and Android saved a blob with no usable file type, so no "open with" list appeared.
     Now:
     • Android — the button is a real link to the .dwg (served from the offline copy by the app's
       service worker with the proper DWG type), so Chrome's download → "Open" shows the DWG apps.
     • iPhone — first tap gets the file ready, second tap opens the share sheet right away
       (AutoCAD / ZWCAD / Files are listed there because the file is a real .dwg). */
  var READY = {}, MIME = 'image/vnd.dwg', MIME_IOS = 'application/octet-stream';   // iOS: no image/* type so the share sheet treats it as a .dwg document, not a picture
  function isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function fname(r) { return r.file.split('/').pop(); }
  function getBlob(r) {
    return cached(r).then(function (res) {
      if (res) return res.blob();
      if (!navigator.onLine) throw new Error('Not saved on this phone yet — connect once and tap Save offline.');
      return download(r, true).then(function () { return cached(r); }).then(function (x) { if (!x) throw new Error('Download failed'); return x.blob(); });
    });
  }
  function open(id, ev) {
    var r = byId(id); if (!r) return;
    if (IS_WIN) { if (ev) ev.preventDefault(); return openPC(id, LVL); }
    if (!isIOS()) {                                        // Android & others: let the real link download it
      if (!navigator.onLine) cached(r).then(function (h) { if (!h) alert('Not saved on this phone yet — connect once and tap Save offline.'); });
      toast('Opening… tap “Open” on the download message');
      return;                                              // default link action continues
    }
    if (ev) ev.preventDefault();
    var f = READY[id];
    if (f) {                                               // 2nd tap: still inside the tap → share sheet opens
      navigator.share({ files: [f] }).then(function () { delete READY[id]; paintBtn(r); })
        .catch(function (x) { if (x && x.name === 'AbortError') return; location.href = r.file; });
      return;
    }
    var b = $('dwg-o-' + id); if (b) { b.textContent = 'Preparing…'; b.classList.add('busy'); }
    getBlob(r).then(function (blob) {
      var file = new File([blob], fname(r), { type: MIME_IOS });
      var ok = false; try { ok = !!(navigator.canShare && navigator.canShare({ files: [file] })); } catch (x) {}
      if (!ok) { location.href = r.file; return; }
      READY[id] = file; paintBtn(r);
    }).catch(function (x) { paintBtn(r); alert(x.message || 'Could not open the drawing.'); });
  }
  function paintBtn(r) {
    var b = $('dwg-o-' + r.id); if (!b) return;
    b.classList.remove('busy'); b.classList.toggle('go', !!READY[r.id]);
    b.textContent = READY[r.id] ? '▶ Tap again — Save to Files / AutoCAD' : (isIOS() ? 'Save for AutoCAD' : 'Open in AutoCAD');
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
    LVL = level || '';
    setTimeout(paint, 0); setTimeout(check, 500);
    var IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var h = IS_WIN
      ? '<div class="card dwg-help small" id="dwg-pc"><b>Open in AutoCAD</b> opens the drawing straight in AutoCAD (or ZWCAD)' + (level ? ' on the <b>Level ' + e(level) + '</b> layout' : '') + ', from the copy kept on this PC — works offline.' +
        '<div class="dwg-setup">First time on this PC? <a href="pc/JOH-CAD-Setup.cmd" download>⬇ Download PC setup</a>, run it once (no admin needed). When the browser asks, tick <i>Always allow</i>.</div></div>'
      : '<div class="card dwg-help small">' + (IOS ? '<b>iPhone:</b> Safari can\'t hand a file straight to AutoCAD, so keep the drawings in Files once and open them from AutoCAD:' +
          '<ol class="dwg-steps"><li>Tap <b>Save for AutoCAD</b>, then tap it again.</li><li>In the share sheet choose <b>Save to Files</b> → <b>On My iPhone</b> → folder <b>JOH Drawings</b> (create it the first time). If AutoCAD / ZWCAD shows in the app row, you can pick it directly.</li>' +
          '<li>Open <b>AutoCAD</b> (or ZWCAD) → <b>Files</b> / <b>Open</b> → <b>On My iPhone › JOH Drawings</b>. They stay there offline; only re-save when the app says <i>update available</i>.</li></ol>' : 'Tap <b>Open in AutoCAD</b> → tap <b>Open</b> on the download message → choose <b>AutoCAD</b> or <b>ZWCAD</b> → <i>Always</i>.') +
        (level ? ' Then pick the <b>Level ' + e(level) + '</b> layout.' : '') + '</div>';
    LIST.forEach(function (r) {
      h += '<div class="card dwg" id="dwg-' + r.id + '"><div class="dwg-top"><div class="dwg-ic">DWG</div><div class="dwg-t"><b>' + e(r.name) + '</b><div class="small">' + e(r.note) + ' · ' + mb(r.size) + '</div>' +
        '<div class="small dwg-s" id="dwg-s-' + r.id + '"></div><div class="dwg-bar"><i id="dwg-p-' + r.id + '"></i></div></div></div>' +
        '<div class="dwg-acts"><a class="btn brass" id="dwg-o-' + r.id + '" href="' + e(r.file) + '" download="' + e(fname(r)) + '" onclick="Refs.open(\'' + r.id + '\',event)">' + (isIOS() ? 'Save for AutoCAD' : 'Open in AutoCAD') + '</a><span id="dwg-b-' + r.id + '"></span></div></div>';
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
