/* Plans-only app: plan browse, room page with register info, WhatsApp message with room plan + photos/videos */
(function () {
  var REG = window.REGISTER_DATA || {};
  function lastLvl() { try { var l = localStorage.getItem('joh_last_level'); if (l && LEVELS.indexOf(l) >= 0) return l; } catch (x) {} return LEVELS.indexOf('00') >= 0 ? '00' : LEVELS[0]; }
  function chip(c) {
    c = String(c || '').trim(); var k = { A: 'ok', B: 'ok', C: 'ok', O: 'info', E: 'bad', D: 'bad', G: 'warn' }[c.charAt(0).toUpperCase()] || 'none';
    return '<span class="cchip ' + k + '">' + esc(c || '–') + '</span>';
  }
  function lnk(t, u) { return u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(t) + '</a>' : esc(t); }
  function partOf(k) { var p = k.charAt(0); return p === '4' ? '004' : p === '5' ? '005' : ROOMS[k] && ROOMS[k].zone || ''; }

  /* ---------- routing: plans only ---------- */
  window.route = function () {
    var h = location.hash.replace(/^#\/?/, '');
    var parts = h.split('/').filter(Boolean).map(decodeURIComponent);
    window.scrollTo(0, 0);
    if (window.showSearch) showSearch(false);
    if (parts[0] === 'room' && parts[1]) return openRoom(parts[1]);
    var lv = parts[0] === 'plan' && parts[1] ? parts[1] : lastLvl();
    try { localStorage.setItem('joh_last_level', lv); } catch (x) {}
    openPlanBrowse(lv);
  };

  window.openPlanBrowse = function (level) {
    if (LEVELS.indexOf(level) < 0) level = LEVELS[0];
    var h = '<div class="levelpicker">';
    LEVELS.forEach(function (l) { h += '<button class="' + (l === level ? 'active' : '') + '" onclick="location.hash=\'#/plan/' + l + '\'">Level ' + l + '</button>'; });
    h += '</div>';
    h += '<div class="planwrap" id="pvb"><canvas></canvas><div class="dotlayer" style="position:absolute;inset:0;pointer-events:none"></div>' +
      '<div id="pvlvl">LEVEL ' + esc(level) + '</div><div class="pvstat-el" id="pvstat"></div></div>';
    h += '<p class="small rp-hint">Tap a room point to open the room.</p>';
    app.innerHTML = h;
    document.querySelector('#pvb .dotlayer').style.pointerEvents = 'auto';
    Viewer.openBrowse(level, 'pvb', function (roomId) { location.hash = '#/room/' + encodeURIComponent(roomId); });
  };

  /* ---------- room page ---------- */
  window.openRoom = function (k) {
    var d = ROOMS[k]; if (!d) { app.innerHTML = '<div class="emptystate">Room not found.</div>'; return; }
    var r = REG[k] || null, g = window.Grid && Grid.ofRoom(k);
    var h = '<div class="rtop"><button class="btn ghost" onclick="location.hash=\'#/plan/' + esc(d.baseLevel) + '\'">←</button>' +
      '<div class="rhead"><div class="rn">' + esc(k) + '</div><div class="rt">' + esc((r && r.ifc.n) || d.name || '') + '</div>' +
      '<div class="small">Level ' + esc(d.baseLevel) + ' · Part ' + esc(partOf(k)) + (g ? ' · Grid ' + esc(g.text) : '') + (d.area ? ' · ' + d.area + ' m²' : '') + '</div></div></div>';
    h += '<div class="hero small-hero rp-plan">';
    if (d.pos) h += '<div class="frame" id="pv"><canvas></canvas><div class="mk"></div><div id="pvlvl">LEVEL ' + esc(d.baseLevel) + '</div><div class="pvstat-el" id="pvstat">loading…</div>' +
      '<div id="pvctl"><button onclick="Viewer.zoomBy(1.4)">+</button><button onclick="Viewer.zoomBy(0.72)">−</button><button onclick="Viewer.centerRoom()">◎</button></div></div>';
    else h += '<div class="frame rp-noloc">Location not yet mapped on the Level ' + esc(d.baseLevel) + ' plan.</div>';
    h += '</div>';

    if (r) {
      h += '<div class="rp-scope"><span>Sub-contractor</span><b>' + esc(r.sc) + '</b></div>';
      h += '<h2 class="sec">Finishes (IFC Room Finishes Schedule)</h2><table class="kv card"><tbody>' +
        row2('Walls', r.ifc.w) + row2('Floor', r.ifc.f) + row2('Ceiling', r.ifc.c) + '</tbody></table>';
      if (r.dr.length) {
        h += '<h2 class="sec">Doors</h2><div class="rp-list">';
        r.dr.forEach(function (x) { h += '<div class="card rp-item"><b>' + esc(x.tag) + ' · ' + esc(x.type) + '</b><span>' + esc([x.fire, x.ac, x.size, x.th].filter(Boolean).join(' · ')) + '</span>' + (x.fin ? '<span class="small">' + esc(x.fin) + '</span>' : '') + (x.hw ? '<span class="small">' + esc(x.hw) + '</span>' : '') + '</div>'; });
        h += '</div>';
      }
      h += '<h2 class="sec">Shop drawings &amp; approvals</h2>';
      if (r.sd.length) {
        h += '<div class="rp-tbl card"><table><tbody>';
        r.sd.forEach(function (s) { h += '<tr><td>' + lnk(s.no, s.u) + '<div class="small">' + esc(s.t) + '</div></td><td>' + chip(s.c) + '</td></tr>'; });
        h += '</tbody></table></div>';
      } else h += '<div class="card small rp-pad">No shop drawing found in the register for this room.</div>';
      if (r.it.length) {
        h += '<h2 class="sec">Furniture, equipment &amp; fit-out</h2><div class="rp-list">';
        r.it.forEach(function (x) { h += '<div class="card rp-item"><b>' + esc(x.tag) + ' – ' + esc(x.pk) + '</b><span>' + esc(x.d) + '</span>' + (x.f ? '<span class="small">' + esc(x.f) + '</span>' : '') + (x.mts ? '<span class="small">' + esc(x.mts) + '</span>' : '') + '</div>'; });
        h += '</div>';
      }
      if (r.mt.length) {
        h += '<h2 class="sec">Materials (MTS)</h2><div class="rp-tbl card"><table><tbody>';
        r.mt.forEach(function (m) { h += '<tr><td>' + lnk(m.c, m.u) + '</td><td>' + esc(m.m) + (m.p ? ' – ' + esc(m.p) : '') + '</td></tr>'; });
        h += '</tbody></table></div>';
      }
    } else {
      h += '<h2 class="sec">Room info</h2><table class="kv card"><tbody>' + row2('Room name', d.name) + row2('Zone', d.zone) + row2('Function', d.function) + '</tbody></table>';
    }

    /* WhatsApp composer */
    h += '<h2 class="sec">WhatsApp message</h2><div class="card rp-wa">' +
      '<textarea id="wa-note" rows="3" placeholder="Note to send with the room plan (issue, request, update)…"></textarea>' +
      '<label class="btn ghost rp-file">📎 Add photos / videos<input id="wa-files" type="file" accept="image/*,video/*" multiple hidden></label>' +
      '<div id="wa-thumbs" class="rp-thumbs"></div>' +
      '<label class="rp-chk"><input type="checkbox" id="wa-plan" checked> Attach room plan image</label>' +
      '<button class="btn brass sc-big" onclick="RoomPage.sendWA(\'' + esc(k) + '\')">Send on WhatsApp</button>' +
      '<div id="wa-msg" class="small"></div></div>';
    h += '<button class="btn ghost rp-status" onclick="askClaude(\'' + esc(k) + '\')">📊 Room Status</button>';
    app.innerHTML = h;
    if (d.pos) Viewer.openRoom(k, 'pv');
    var fi = document.getElementById('wa-files');
    fi.addEventListener('change', function () {
      var t = document.getElementById('wa-thumbs'); t.innerHTML = '';
      Array.prototype.forEach.call(fi.files, function (f) {
        var u = URL.createObjectURL(f);
        t.insertAdjacentHTML('beforeend', f.type.indexOf('video') === 0 ? '<video src="' + u + '" muted></video>' : '<img src="' + u + '" alt="">');
      });
    });
    try { localStorage.setItem('joh_cur_room', JSON.stringify({ id: k, t: Date.now() })); } catch (x) {}
  };

  function waText(k, note) {
    var d = ROOMS[k] || {}, r = REG[k], g = window.Grid && Grid.ofRoom(k), L = [];
    L.push('*JOH – Room ' + k + ' – ' + ((r && r.ifc.n) || d.name || '') + '*');
    L.push('Level ' + d.baseLevel + ' · Part ' + partOf(k) + (g ? ' · Grid ' + g.text : '') + (d.area ? ' · ' + d.area + ' m²' : ''));
    if (r) {
      L.push('Sub-contractor: ' + r.sc);
      L.push('Walls: ' + (r.ifc.w || '–') + ' | Floor: ' + (r.ifc.f || '–') + ' | Ceiling: ' + (r.ifc.c || '–'));
      r.dr.forEach(function (x) { L.push('Door ' + x.tag + ': ' + [x.type, x.fire, x.ac, x.size].filter(Boolean).join(' · ')); });
      var open = r.sd.filter(function (s) { return /^[EGD]/.test(s.c); });
      if (open.length) L.push('Open SDs: ' + open.map(function (s) { return s.no + ' (' + s.c + ')'; }).join(', '));
    }
    if (note) { L.push(''); L.push(note); }
    L.push(''); L.push(location.origin + location.pathname + '#/room/' + encodeURIComponent(k));
    return L.join('\n');
  }
  function planBlob(k) {
    return new Promise(function (res) {
      try { var c = Viewer.snapshot && Viewer.snapshot(); if (!c) return res(null); c.toBlob(function (b) { res(b); }, 'image/png'); } catch (e) { res(null); }
    });
  }
  function msg(t) { var e = document.getElementById('wa-msg'); if (e) e.textContent = t; }

  window.RoomPage = {
    sendWA: function (k) {
      var note = (document.getElementById('wa-note').value || '').trim();
      var text = waText(k, note);
      var picked = Array.prototype.slice.call(document.getElementById('wa-files').files || []);
      var withPlan = document.getElementById('wa-plan').checked;
      (withPlan ? planBlob(k) : Promise.resolve(null)).then(function (b) {
        var files = picked.slice();
        if (b) files.unshift(new File([b], 'Room_' + k + '_plan.png', { type: 'image/png' }));
        var data = { text: text, files: files };
        if (files.length && navigator.canShare && navigator.canShare({ files: files })) {
          navigator.share(data).then(function () { msg('Shared – choose WhatsApp in the share sheet.'); }, function (e) { if (e && e.name !== 'AbortError') msg('Sharing failed: ' + e.message); });
          return;
        }
        if (!files.length && navigator.share) { navigator.share({ text: text }).catch(function () {}); return; }
        /* desktop fallback: download the plan and open WhatsApp with the text */
        if (b) { var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'Room_' + k + '_plan.png'; document.body.appendChild(a); a.click(); a.remove(); }
        window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
        msg(files.length ? 'WhatsApp opened with the text. The plan image was downloaded – attach it and your photos in WhatsApp.' : 'WhatsApp opened with the room details.');
      });
    }
  };
  if (window.ROOMS && Object.keys(ROOMS).length) route();
})();
