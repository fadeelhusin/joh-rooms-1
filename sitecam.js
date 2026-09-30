/* ============================================================
   JOH Room Storyboard — SITE PHOTO
   Pick a room (plan pin or room page) → camera → the photo is
   stamped with room no. / name / level, your note (typed or
   dictated), date-time, GPS and a mini location plan, then
   saved to the phone gallery (or shared).
   Everything runs on the phone — no server, no upload.
   ============================================================ */
var SiteCam = (function () {
  var S = { room: null, img: null, taken: null, geo: null, geoErr: '', rec: null, recOn: false, blob: null, name: '', plan: {}, timer: null };
  var IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var LS = window.localStorage;
  function $(id) { return document.getElementById(id); }
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function lsGet(k, d) { try { var v = LS.getItem(k); return v == null ? d : JSON.parse(v); } catch (x) { return d; } }
  function lsSet(k, v) { try { LS.setItem(k, JSON.stringify(v)); } catch (x) {} }

  /* ---------- 1. bottom sheet after tapping a plan pin ---------- */
  function pick(id) {
    var d = ROOMS[id]; if (!d) return;
    var sh = $('sc-sheet');
    if (!sh) { sh = document.createElement('div'); sh.id = 'sc-sheet'; document.body.appendChild(sh); }
    sh.innerHTML = '<div class="sc-sh-top"><div><div class="rn">' + e(id) + '</div><div class="small">' + e(d.name || '') + ' · Level ' + e(d.baseLevel) + '</div></div>' +
      '<button class="sc-x" aria-label="Close" onclick="SiteCam.closeSheet()">✕</button></div>' +
      '<div class="sc-sh-btns"><button class="btn brass sc-big" onclick="SiteCam.open(\'' + e(id) + '\')">📷 Site Photo</button>' +
      '<button class="btn ghost" onclick="SiteCam.closeSheet();location.hash=\'#/room/' + encodeURIComponent(id) + '\'">Open room</button></div>';
    sh.classList.add('on');
    document.querySelectorAll('.mkdot').forEach(function (m) { m.classList.toggle('active', m.dataset.id === id); });
  }
  function closeSheet() {
    var sh = $('sc-sheet'); if (sh) sh.classList.remove('on');
    document.querySelectorAll('.mkdot.active').forEach(function (m) { m.classList.remove('active'); });
  }
  window.addEventListener('hashchange', function () { closeSheet(); if ($('sc-modal') && $('sc-modal').classList.contains('on')) close(); });

  /* ---------- 2. the capture panel ---------- */
  function open(id) {
    var d = ROOMS[id]; if (!d) return;
    closeSheet();
    S.room = id; S.img = null; S.blob = null;
    var lang = lsGet('sc_lang', 'ar-SA');
    var m = $('sc-modal');
    if (!m) { m = document.createElement('div'); m.id = 'sc-modal'; document.body.appendChild(m); }
    var n = (lsGet('sc_log_' + id, []) || []).length;
    m.innerHTML = '<div class="sc-panel">' +
      '<div class="sc-head"><div><div class="eyebrow" style="color:#d8cdb6">Site Photo</div><div class="rn">' + e(id) + '</div>' +
      '<div class="sc-sub">' + e(d.name || '') + ' · Level ' + e(d.baseLevel) + (d.zone ? ' · Zone ' + e(d.zone) : '') + '</div></div>' +
      '<button class="sc-x" aria-label="Close" onclick="SiteCam.close()">✕</button></div>' +
      '<div class="sc-body">' +
      '<div class="sublab">Note (printed under the photo)</div>' +
      '<textarea id="sc-note" dir="auto" rows="3" placeholder="Type a note, or tap Dictate and speak"></textarea>' +
      '<div class="sc-voice">' +
      (SR ? '<button class="btn ghost" id="sc-mic" onclick="SiteCam.mic()">🎤 Dictate</button>' +
        '<select id="sc-lang"><option value="ar-SA"' + (lang === 'ar-SA' ? ' selected' : '') + '>Arabic</option><option value="en-US"' + (lang === 'en-US' ? ' selected' : '') + '>English</option></select>'
        : '') +
      '<span class="small" id="sc-vstat">' + (SR ? '' : 'Tip: tap the 🎤 on your keyboard to dictate into the note.') + '</span></div>' +
      '<div class="small" id="sc-gps">📍 Getting location…</div>' +
      '<div class="sc-actions"><button class="btn brass sc-big" onclick="$sc(\'sc-f-cam\').click()">📷 Take Photo</button>' +
      '<button class="btn ghost" onclick="$sc(\'sc-f-lib\').click()">🖼️ From Gallery</button></div>' +
      '<input type="file" id="sc-f-cam" accept="image/*" capture="environment" hidden>' +
      '<input type="file" id="sc-f-lib" accept="image/*" hidden>' +
      '<div id="sc-prev"></div>' +
      '<div class="small" id="sc-count" style="margin-top:10px">' + (n ? n + ' site photo(s) saved for this room on this phone.' : '') + '</div>' +
      '</div></div>';
    m.classList.add('on');
    document.body.style.overflow = 'hidden';
    $('sc-f-cam').onchange = onFile; $('sc-f-lib').onchange = onFile;
    $('sc-note').addEventListener('input', restamp);
    var sel = $('sc-lang'); if (sel) sel.onchange = function () { lsSet('sc_lang', sel.value); };
    locate();
    loadPlan(d.baseLevel);
  }
  function close() {
    stopMic();
    var m = $('sc-modal'); if (m) { m.classList.remove('on'); m.innerHTML = ''; }
    document.body.style.overflow = '';
  }

  /* ---------- GPS ---------- */
  function locate() {
    var el = $('sc-gps');
    if (!navigator.geolocation) { S.geo = null; if (el) el.textContent = '📍 Location not available on this device.'; return; }
    navigator.geolocation.getCurrentPosition(function (p) {
      S.geo = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy };
      var g = $('sc-gps'); if (g) g.textContent = '📍 ' + fmtGeo(S.geo) + ' (±' + Math.round(S.geo.acc) + ' m)';
      restamp();
    }, function () {
      S.geo = null; var g = $('sc-gps'); if (g) g.textContent = '📍 Location off — photo will be stamped without GPS.';
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  }
  function dm(v, pos, neg) { var a = Math.abs(v), d = Math.floor(a), m = (a - d) * 60; return (v >= 0 ? pos : neg) + d + '° ' + m.toFixed(3); }
  function fmtGeo(g) { return dm(g.lat, 'N', 'S') + ', ' + dm(g.lon, 'E', 'W'); }

  /* ---------- voice → text ---------- */
  function mic() {
    if (S.recOn) { stopMic(); return; }
    var ta = $('sc-note'), vs = $('sc-vstat'), btn = $('sc-mic');
    var r = new SR(); S.rec = r;
    r.lang = ($('sc-lang') || {}).value || 'ar-SA';
    r.interimResults = true; r.continuous = !IS_IOS; r.maxAlternatives = 1;
    var base = ta.value ? ta.value.replace(/\s+$/, '') + ' ' : '';
    var finals = '';
    r.onresult = function (ev) {
      var interim = '';
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var t = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) finals += t + ' '; else interim += t;
      }
      ta.value = (base + finals + interim).replace(/\s+/g, ' ');
      restamp();
    };
    r.onerror = function (ev) {
      var msg = { 'not-allowed': 'Microphone blocked — allow it in the browser settings.', 'network': 'Dictation needs internet here — use the keyboard 🎤 instead.', 'no-speech': 'Didn’t hear anything — try again.', 'service-not-allowed': 'Dictation not allowed — use the keyboard 🎤 instead.' }[ev.error];
      if (vs) vs.textContent = msg || ('Dictation error: ' + ev.error);
    };
    r.onend = function () { S.recOn = false; if (btn) { btn.textContent = '🎤 Dictate'; btn.classList.remove('rec'); } if (vs && vs.textContent === 'Listening…') vs.textContent = ''; ta.value = ta.value.trim(); restamp(); };
    try { r.start(); S.recOn = true; btn.textContent = '■ Stop'; btn.classList.add('rec'); vs.textContent = 'Listening…'; }
    catch (x) { vs.textContent = 'Could not start dictation.'; }
  }
  function stopMic() { if (S.rec && S.recOn) { try { S.rec.stop(); } catch (x) {} } S.recOn = false; }

  /* ---------- plan image for the mini location map ---------- */
  function loadPlan(lvl) {
    if (S.plan[lvl]) return;
    var im = new Image();
    im.onload = function () { S.plan[lvl] = im; restamp(); };
    im.src = 'png/' + lvl + '.png';
  }

  /* ---------- photo in ---------- */
  function onFile(ev) {
    var f = ev.target.files && ev.target.files[0]; ev.target.value = '';
    if (!f) return;
    var url = URL.createObjectURL(f), im = new Image();
    im.onload = function () {
      S.img = im; S.taken = new Date(f.lastModified || Date.now());
      if (Math.abs(Date.now() - S.taken) > 864e5 * 400) S.taken = new Date();
      render(true);
    };
    im.onerror = function () { URL.revokeObjectURL(url); alert('Could not read that image.'); };
    im.src = url;
  }
  function restamp() {
    if (!S.img) return;
    clearTimeout(S.timer); S.timer = setTimeout(function () { render(false); }, 350);
  }

  /* ---------- the stamp ---------- */
  var AR = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
  var LATIN = /[A-Za-z]/;
  function isRtl(s) { var a = s.search(AR), l = s.search(LATIN); return a >= 0 && (l < 0 || a < l); }
  function wrap(ctx, text, maxW) {
    var out = [];
    String(text).split(/\n/).forEach(function (para) {
      var words = para.split(/\s+/).filter(Boolean), line = '';
      words.forEach(function (w) {
        var t = line ? line + ' ' + w : w;
        if (ctx.measureText(t).width <= maxW || !line) line = t; else { out.push(line); line = w; }
      });
      if (line) out.push(line);
    });
    return out;
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDate(d) {
    var M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return pad2(d.getDate()) + ' ' + M[d.getMonth()] + ' ' + d.getFullYear() + '  ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }

  function compose(withMap) {
    var d = ROOMS[S.room], img = S.img;
    var nw = img.naturalWidth, nh = img.naturalHeight;
    var sc = Math.min(1, 2560 / Math.max(nw, nh));
    var W = Math.round(nw * sc), H = Math.round(nh * sc);
    var f = Math.max(22, Math.min(W, H) / 32);          // base font size
    var pad = Math.round(f * 0.8);
    var mapS = Math.round(Math.min(W * (W < H ? 0.36 : 0.26), f * 11));
    var tx = pad * 2 + mapS, tw = W - tx - pad;
    var SANS = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans Arabic",Tahoma,Arial,sans-serif';

    var cv = document.createElement('canvas'), ctx = cv.getContext('2d');
    // measure text block first
    var note = ($('sc-note') && $('sc-note').value || '').trim();
    ctx.font = (f * 0.95) + 'px ' + SANS;
    var noteLines = note ? wrap(ctx, note, tw) : [];
    if (noteLines.length > 9) { noteLines = noteLines.slice(0, 9); noteLines[8] += ' …'; }
    ctx.font = (f * 0.95) + 'px ' + SANS;
    var nameLines = wrap(ctx, d.name || '', tw).slice(0, 2);
    var meta1 = fmtDate(S.taken || new Date());
    var meta2 = S.geo ? fmtGeo(S.geo) + '  ±' + Math.round(S.geo.acc) + 'm' : '';
    var lines = [];
    lines.push({ t: S.room, sz: f * 1.3, w: 'bold ', c: '#f3c77a' });
    nameLines.forEach(function (l) { lines.push({ t: l, sz: f * 0.95, w: '600 ', c: '#ffffff' }); });
    lines.push({ t: 'Level ' + d.baseLevel + (d.zone ? '  ·  Zone ' + d.zone : '') + (d.abbr ? '  ·  ' + d.abbr : '') + (d.area ? '  ·  ' + d.area + ' m²' : ''), sz: f * 0.78, w: '', c: '#d8cdb6' });
    if (noteLines.length) { lines.push({ gap: f * 0.45, rule: true }); noteLines.forEach(function (l) { lines.push({ t: l, sz: f * 0.95, w: '', c: '#ffffff', note: 1 }); }); }
    lines.push({ gap: f * 0.45, rule: true });
    lines.push({ t: meta1, sz: f * 0.72, w: '', c: '#bfb4a0' });
    if (meta2) lines.push({ t: meta2, sz: f * 0.72, w: '', c: '#bfb4a0' });
    lines.push({ t: 'Jeddah Opera House · S4-01-056 · Site Photo', sz: f * 0.62, w: '', c: '#8a7f6d' });
    var textH = 0; lines.forEach(function (l) { textH += l.gap ? l.gap : l.sz * 1.32; });
    var footH = Math.round(Math.max(textH, mapS + f * 1.1) + pad * 2);

    cv.width = W; cv.height = H + footH;
    ctx.drawImage(img, 0, 0, W, H);
    ctx.fillStyle = '#1f1a14'; ctx.fillRect(0, H, W, footH);
    ctx.fillStyle = '#a9752f'; ctx.fillRect(0, H, W, Math.max(3, f * 0.12));

    // mini location plan
    var mx = pad, my = H + pad;
    var plan = S.plan[d.baseLevel];
    ctx.fillStyle = '#ffffff'; ctx.fillRect(mx, my, mapS, mapS);
    if (withMap && plan && d.pos) {
      var pw = plan.naturalWidth, ph = plan.naturalHeight;
      var px = d.pos[1] * pw, py = d.pos[2] * ph, c = Math.round(pw * 0.2);
      var sx = Math.max(0, Math.min(pw - c, px - c / 2)), sy = Math.max(0, Math.min(ph - c, py - c / 2));
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(plan, sx, sy, c, c, mx, my, mapS, mapS);
      var kx = mx + (px - sx) / c * mapS, ky = my + (py - sy) / c * mapS, r = mapS * 0.055;
      ctx.strokeStyle = 'rgba(166,59,46,.9)'; ctx.lineWidth = Math.max(2, mapS * 0.006);
      ctx.beginPath(); ctx.moveTo(mx, ky); ctx.lineTo(mx + mapS, ky); ctx.moveTo(kx, my); ctx.lineTo(kx, my + mapS); ctx.stroke();
      ctx.fillStyle = 'rgba(166,59,46,.28)'; ctx.beginPath(); ctx.arc(kx, ky, r * 1.9, 0, 7); ctx.fill();
      ctx.lineWidth = Math.max(3, r * 0.3); ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.arc(kx, ky, r, 0, 7); ctx.stroke();
      ctx.fillStyle = '#a63b2e'; ctx.beginPath(); ctx.arc(kx, ky, r * 0.72, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = '#8a7f6d'; ctx.font = (f * 0.6) + 'px ' + SANS; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(d.pos ? 'Plan not loaded' : 'Location not mapped', mx + mapS / 2, my + mapS / 2);
    }
    ctx.strokeStyle = '#a9752f'; ctx.lineWidth = Math.max(2, f * 0.06); ctx.strokeRect(mx, my, mapS, mapS);
    ctx.fillStyle = '#d8cdb6'; ctx.font = 'bold ' + (f * 0.6) + 'px ' + SANS; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('LEVEL ' + d.baseLevel + ' · LOCATION', mx, my + mapS + f * 0.25);

    // text block
    var y = H + pad;
    ctx.textBaseline = 'top';
    lines.forEach(function (l) {
      if (l.gap) {
        if (l.rule) { ctx.fillStyle = 'rgba(216,205,182,.25)'; ctx.fillRect(tx, y + l.gap / 2 - 1, tw, Math.max(1, f * 0.04)); }
        y += l.gap; return;
      }
      ctx.font = l.w + l.sz + 'px ' + SANS; ctx.fillStyle = l.c;
      var rtl = isRtl(l.t);
      ctx.direction = rtl ? 'rtl' : 'ltr'; ctx.textAlign = rtl ? 'right' : 'left';
      ctx.fillText(l.t, rtl ? tx + tw : tx, y + l.sz * 0.12, tw);
      y += l.sz * 1.32;
    });
    ctx.direction = 'ltr';
    return cv;
  }

  function render(scrollTo) {
    var cv = compose(true), host = $('sc-prev');
    if (!host) return;
    var done = function (blob, cvUsed) {
      S.blob = blob;
      var t = S.taken || new Date();
      S.name = 'JOH_' + S.room.replace(/[^\w.-]+/g, '_') + '_' + t.getFullYear() + pad2(t.getMonth() + 1) + pad2(t.getDate()) + '_' + pad2(t.getHours()) + pad2(t.getMinutes()) + pad2(t.getSeconds()) + '.jpg';
      var old = host.querySelector('img'); if (old && old.src.indexOf('blob:') === 0) URL.revokeObjectURL(old.src);
      var canShare = false;
      try { canShare = !!(navigator.canShare && navigator.canShare({ files: [new File([blob], S.name, { type: 'image/jpeg' })] })); } catch (x) {}
      var saveBtn, altBtn, hint;
      if (IS_IOS && canShare) {
        saveBtn = '<button class="btn brass sc-big" onclick="SiteCam.share()">💾 Save to Photos</button>';
        altBtn = '<button class="btn ghost" onclick="SiteCam.download()">⬇ Save as file</button>';
        hint = 'In the share sheet tap <b>Save Image</b> — it goes straight to your Photos.';
      } else {
        saveBtn = '<button class="btn brass sc-big" onclick="SiteCam.download()">💾 Save to Gallery</button>';
        altBtn = canShare ? '<button class="btn ghost" onclick="SiteCam.share()">📤 Share</button>' : '';
        hint = 'Saved to <b>Downloads</b> — it shows in your Gallery / Google Photos under the Downloads album.';
      }
      host.innerHTML = '<div class="sublab">Preview</div><img class="sc-img" src="' + URL.createObjectURL(blob) + '" alt="Stamped photo">' +
        '<div class="sc-actions">' + saveBtn + altBtn + '<button class="btn ghost" onclick="$sc(\'sc-f-cam\').click()">📷 Retake</button></div>' +
        '<div class="small">' + hint + ' Edit the note above and the stamp updates.</div>';
      if (scrollTo) host.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    try {
      cv.toBlob(function (b) { if (b) done(b); }, 'image/jpeg', 0.9);
    } catch (x) {                               // canvas tainted (app opened from a local file) → stamp without mini plan
      var cv2 = compose(false);
      cv2.toBlob(function (b) { if (b) done(b); }, 'image/jpeg', 0.9);
    }
  }

  /* ---------- save / share ---------- */
  function log() {
    var k = 'sc_log_' + S.room, a = lsGet(k, []) || [];
    if (a.some(function (x) { return x.n === S.name; })) return;
    a.push({ n: S.name, t: Date.now(), note: (($('sc-note') || {}).value || '').slice(0, 200) }); lsSet(k, a.slice(-300));
    var c = $('sc-count'); if (c) c.textContent = a.length + ' site photo(s) saved for this room on this phone.';
  }
  function download() {
    if (!S.blob) return;
    var a = document.createElement('a'); a.href = URL.createObjectURL(S.blob); a.download = S.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    log(); toast('Saved: ' + S.name);
  }
  function share() {
    if (!S.blob) return;
    var file = new File([S.blob], S.name, { type: 'image/jpeg' });
    navigator.share({ files: [file], title: S.room }).then(function () { log(); toast('Done'); })
      .catch(function (x) { if (x && x.name !== 'AbortError') download(); });
  }
  function toast(msg) {
    var t = $('sc-toast'); if (!t) { t = document.createElement('div'); t.id = 'sc-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('on'); }, 2600);
  }

  window.$sc = $;
  return { pick: pick, open: open, close: close, closeSheet: closeSheet, mic: mic, download: download, share: share, _compose: compose, _S: S };
})();
