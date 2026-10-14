/* ============================================================
   Opera House RFI (Request for Inspection) search — #/rfi
   Data: data/rfi.json, exported from the RFI Log Sheet by the
   local RFI agent. Documents open on MBL SharePoint (MBL sign-in).
   Search by RFI number, by words, or by image (OCR in the browser:
   an RFI number in the picture is looked up directly).
   ============================================================ */
(function () {
  var DATA = null, ROWS = [], BY_NO = {}, HAY = [], LOADING = null, ACTIONS = [];
  var C = {};                       // column name -> index
  var OCR_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  var LIMIT = 60;

  function e(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function load() {
    if (DATA) return Promise.resolve(DATA);
    if (LOADING) return LOADING;
    LOADING = fetch('data/rfi.json').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        DATA = d; ROWS = d.rows;
        d.cols.forEach(function (c, i) { C[c] = i; });
        var acts = {};
        ROWS.forEach(function (r, i) {
          BY_NO[r[C.rfi]] = r;
          HAY[i] = ['rfi-' + r[C.rfi], r[C.action], r[C.description], r[C.location], r[C.discipline],
                    r[C.works], r[C.pmt], r[C.qmd], r[C.rejected_ref]].join(' ').toLowerCase();
          if (r[C.action]) acts[r[C.action]] = (acts[r[C.action]] || 0) + 1;
        });
        ACTIONS = Object.keys(acts).sort(function (a, b) { return acts[b] - acts[a]; });
        return d;
      });
    return LOADING;
  }

  /* ---------- search ---------- */
  function numberIn(t) {
    var m = String(t).match(/^\s*(?:(?:JCD-OPE-MBL-QUA-)?RFI[\s\-_.#:]*)?0*(\d{1,6})\s*$/i);
    return m ? +m[1] : null;
  }
  function textSearch(t, act) {
    var n = numberIn(t);
    if (n != null) return BY_NO[n] ? [BY_NO[n]] : [];
    var words = t.toLowerCase().split(/[^\w؀-ۿ.\-\/+]+/).filter(Boolean);
    var out = [];
    for (var i = 0; i < ROWS.length; i++) {
      if (act && ROWS[i][C.action] !== act) continue;
      var h = HAY[i], ok = true;
      for (var j = 0; j < words.length; j++) if (h.indexOf(words[j]) < 0) { ok = false; break; }
      if (ok) out.push(ROWS[i]);
    }
    return out;
  }

  /* OCR text -> RFI numbers. Tolerates common OCR slips (O->0, I/l->1, S->5). */
  function numbersFromText(txt) {
    var fix = function (s) { return s.replace(/[OQD]/gi, '0').replace(/[Il|]/g, '1').replace(/S/g, '5'); };
    var found = [], seen = {};
    var add = function (n) { if (n > 0 && !seen[n] && BY_NO[n]) { seen[n] = 1; found.push(n); } };
    var re = /R\s*[FE]\s*[I1l|]\s*[\s\-_.:#№]*(?:N[O0]\.?\s*)?[\s\-_.:#]*([0-9OQDIlS|]{2,7})/gi, m;
    while ((m = re.exec(txt))) add(+fix(m[1]));
    if (!found.length) {                         // bare zero-padded numbers like 008855
      var re2 = /\b0{1,3}[0-9]{3,5}\b/g;
      while ((m = re2.exec(txt))) add(+m[0]);
    }
    return found;
  }
  /* No number in the picture: rank RFIs by how many of its words they contain. */
  function wordsSearch(txt) {
    var stop = { the: 1, and: 1, for: 1, with: 1, from: 1, this: 1, that: 1, inspection: 1, project: 1, opera: 1, house: 1, request: 1 };
    var words = txt.toLowerCase().split(/[^a-z0-9؀-ۿ\-\/.]+/).filter(function (w) { return w.length >= 4 && !stop[w]; });
    var uniq = {}; words.forEach(function (w) { uniq[w] = 1; }); words = Object.keys(uniq).slice(0, 40);
    if (!words.length) return [];
    var scored = [];
    for (var i = 0; i < ROWS.length; i++) {
      var s = 0; for (var j = 0; j < words.length; j++) if (HAY[i].indexOf(words[j]) >= 0) s++;
      if (s >= Math.min(3, words.length)) scored.push([s, ROWS[i]]);
    }
    scored.sort(function (a, b) { return b[0] - a[0] || b[1][C.rfi] - a[1][C.rfi]; });
    return scored.slice(0, 30).map(function (x) { return x[1]; });
  }

  /* ---------- rendering ---------- */
  function docId(n) { return 'JCD-OPE-MBL-QUA-RFI-' + ('000000' + n).slice(-6); }
  function fileUrl(p) {
    return DATA.base + (DATA.folder + '/' + p).split('/').map(encodeURIComponent).join('/').replace(/%2F/g, '/') + '?web=1';
  }
  function actCls(a) { return /reject|revise|not /i.test(a) ? 'bad' : /object|accept|approv/i.test(a) ? 'ok' : 'warn'; }
  function card(r) {
    var a = r[C.action], files = r[C.files] || [];
    var h = '<div class="card rfi-card"><div class="rfi-head"><b>' + e(docId(r[C.rfi])) + '</b>' +
      (r[C.rev] !== '' ? ' · Rev ' + e(r[C.rev]) : '') +
      ' · <span class="rfi-act ' + actCls(a) + '">' + e(a || 'no response in log') + '</span></div>';
    if (r[C.description]) h += '<div class="rfi-desc">' + e(r[C.description]) + '</div>';
    var place = [r[C.location], r[C.discipline], r[C.works]].filter(Boolean);
    if (place.length) h += '<div class="small">' + place.map(e).join(' · ') + '</div>';
    if (r[C.submitted]) h += '<div class="small">Submitted ' + e(r[C.submitted]) + (r[C.responded] ? ' → responded ' + e(r[C.responded]) : '') + '</div>';
    if (r[C.pmt]) h += '<div class="rfi-c"><b>PMT:</b> ' + e(r[C.pmt]) + '</div>';
    if (r[C.qmd]) h += '<div class="rfi-c"><b>QMD:</b> ' + e(r[C.qmd]) + '</div>';
    if (r[C.rejected_ref]) h += '<div class="rfi-c"><b>Rejected ref:</b> ' + e(r[C.rejected_ref]) + '</div>';
    h += files.length
      ? files.map(function (p) { return '<a class="rfi-file" href="' + e(fileUrl(p)) + '" target="_blank" rel="noopener">📄 ' + e(p.split('/').pop()) + '</a>'; }).join('')
      : '<div class="small">No documents in the RFI folder.</div>';
    return h + '</div>';
  }
  function show(list, note) {
    var out = document.getElementById('rfi-out'); if (!out) return;
    var more = list.length > LIMIT;
    out.innerHTML = (note ? '<div class="small rfi-note">' + note + '</div>' : '') +
      (list.length ? list.slice(0, LIMIT).map(card).join('') : '<div class="emptystate">No matching RFIs.</div>') +
      (more ? '<div class="small rfi-note">Showing ' + LIMIT + ' of ' + list.length + ' — add more words to narrow down.</div>' : '');
  }
  function run(t) {
    var act = (document.getElementById('rfi-act') || {}).value || '';
    t = (t || '').trim();
    if (!t && !act) return show([], '');
    var list = t ? textSearch(t, act) : ROWS.filter(function (r) { return r[C.action] === act; });
    show(list, list.length + ' RFI' + (list.length === 1 ? '' : 's'));
  }

  /* ---------- image search ---------- */
  function loadOcr() {
    if (window.Tesseract) return Promise.resolve();
    return new Promise(function (ok, bad) {
      var s = document.createElement('script'); s.src = OCR_SRC; s.onload = ok;
      s.onerror = function () { bad(new Error('could not load the OCR engine (internet needed)')); };
      document.head.appendChild(s);
    });
  }
  function fromImage(file) {
    if (!file) return;
    var out = document.getElementById('rfi-out');
    var prev = URL.createObjectURL(file);
    out.innerHTML = '<div class="card"><img src="' + prev + '" class="rfi-thumb" alt=""><div class="small" id="rfi-ocr">Reading the image…</div></div>';
    var st = function (m) { var x = document.getElementById('rfi-ocr'); if (x) x.textContent = m; };
    OCR_STATUS = st;
    st('Loading the text reader (first time only)…');
    ocrWorker().then(function (w) { return w.recognize(file); }).then(function (res) {
      var txt = (res && res.data && res.data.text) || '';
      var nums = numbersFromText(txt);
      var snippet = '<details><summary>Text read from image</summary><pre class="rfi-pre">' + e(txt.trim().slice(0, 1500) || '(none)') + '</pre></details>';
      if (nums.length) {
        document.getElementById('rfi-q').value = nums.length === 1 ? docId(nums[0]) : '';
        show(nums.map(function (n) { return BY_NO[n]; }), 'Found RFI number' + (nums.length > 1 ? 's' : '') + ' in the image: <b>' + nums.map(docId).join(', ') + '</b>' + snippet);
      } else {
        document.getElementById('rfi-q').value = '';
        var list = wordsSearch(txt);
        show(list, (list.length ? 'No RFI number in the image — closest matches by its words:' : 'No RFI number found in the image.') + snippet);
      }
      URL.revokeObjectURL(prev);
    }).catch(function (err) { WORKER = null; st('Image search failed: ' + ((err && err.message) || err || 'unknown error') + ' — try again.'); });
  }
  var WORKER = null, OCR_STATUS = function () {};
  function ocrWorker() {                       // one OCR worker, created on first use and reused
    if (!WORKER) WORKER = loadOcr().then(function () {
      return Tesseract.createWorker('eng', 1, { logger: function (m) {
        if (m.status === 'recognizing text') OCR_STATUS('Reading the image… ' + Math.round(m.progress * 100) + '%');
      } });
    });
    return WORKER;
  }

  /* ---------- page ---------- */
  function page(arg) {
    var q0 = arg || '';
    app.innerHTML = libSwitch('rfi') +
      '<div class="eyebrow" style="padding:8px 2px 0">Opera House · Request for Inspection log</div>' +
      '<div class="rfi-bar"><input id="rfi-q" type="search" placeholder="RFI no. or words: waterproofing rejected car park…" autocomplete="off" value="' + e(q0) + '">' +
      '<select id="rfi-act"><option value="">Any result</option></select></div>' +
      '<div class="rfi-img"><label class="btn brass">📷 Photo<input type="file" accept="image/*" capture="environment" hidden></label>' +
      '<label class="btn ghost">🖼️ Image<input type="file" accept="image/*" hidden></label>' +
      '<span class="small" id="rfi-upd"></span></div><div id="rfi-out"><div class="emptystate">Loading RFI log…</div></div>';
    var qi = document.getElementById('rfi-q'), sel = document.getElementById('rfi-act'), timer;
    app.querySelectorAll('.rfi-img input').forEach(function (inp) {
      inp.addEventListener('change', function () { fromImage(inp.files[0]); inp.value = ''; });
    });
    load().then(function () {
      ACTIONS.forEach(function (a) { var o = document.createElement('option'); o.value = a; o.textContent = a; sel.appendChild(o); });
      document.getElementById('rfi-upd').textContent = ROWS.length + ' RFIs · log updated ' + DATA.updated;
      var go = function () { clearTimeout(timer); timer = setTimeout(function () {
        run(qi.value);
        history.replaceState(null, '', '#/rfi' + (qi.value.trim() ? '/' + encodeURIComponent(qi.value.trim()) : ''));
      }, 180); };
      qi.addEventListener('input', go); sel.addEventListener('change', go);
      if (q0) run(q0); else show([], 'Type an RFI number or words, or search with a photo of an RFI sheet.');
    }).catch(function (err) {
      document.getElementById('rfi-out').innerHTML = '<div class="emptystate">Could not load the RFI log.<br><span class="small">' + e(err.message) + '</span></div>';
    });
  }

  window.RFI = { page: page, _numbersFromText: numbersFromText, _load: load };
})();
