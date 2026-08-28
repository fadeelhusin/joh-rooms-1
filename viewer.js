/* ============================================================
   Plan Viewer — canvas-based zoomable/pannable level plan.
   Two modes:
     "room"   – centred on one room, shows a single pulsing marker
     "browse" – shows every room marker on the level; tap a marker
                (or the plan) to navigate — this is the
                "search by tapping the plan" feature.
   Renders PDF (crisp, via pdf.js) with PNG fallback, same approach
   as the original JOH Room Assistant engine.
   ============================================================ */
var Viewer = (function () {
  var V = {
    mode: null, room: null, lvl: null,
    vw: 1191, vh: 842, viewScale: 1, tx: 0, ty: 0, dpr: 1,
    png: null, pngScale: 3, pdfPage: null, pdfCanvas: null, pdfScale: 0,
    container: null, cv: null, ctx: null, mk: null, stat: null,
    renderTimer: null, maxScale: 4,
    markers: [], // browse mode: [{id,mx,my}]
    onPick: null // browse mode callback(roomId)
  };
  var pdfCache = {};

  function setStat(s) { if (V.stat) V.stat.textContent = s; }

  function openRoom(k, containerId) {
    var d = ROOMS[k]; if (!d || !d.pos) return;
    V.mode = 'room'; V.room = k; V.lvl = d.baseLevel;
    var dim = META.dims[V.lvl];
    V.dpr = window.devicePixelRatio || 1;
    V.vw = 1191; V.vh = 842;
    var p = d.pos; V.mx = p[1] * V.vw; V.my = p[2] * V.vh;
    setupCanvas(containerId);
    V.maxScale = Math.min(Math.sqrt(14.0e6 / (V.vw * V.vh)), 4000 / V.vw, 4000 / V.vh);
    loadPng(V.lvl);
    bind();
    centerAt(2.4);
    loadPdf();
  }

  function openBrowse(level, containerId, onPick) {
    V.mode = 'browse'; V.lvl = level; V.onPick = onPick;
    var dim = META.dims[level];
    V.dpr = window.devicePixelRatio || 1;
    V.vw = 1191; V.vh = 842;
    V.markers = [];
    Object.keys(ROOMS).forEach(function (id) {
      var r = ROOMS[id];
      if (r.baseLevel === level && r.pos) {
        V.markers.push({ id: id, mx: r.pos[1] * V.vw, my: r.pos[2] * V.vh });
      }
    });
    setupCanvas(containerId);
    V.maxScale = Math.min(Math.sqrt(14.0e6 / (V.vw * V.vh)), 4000 / V.vw, 4000 / V.vh);
    loadPng(level);
    bind();
    fitPlan();
    loadPdf();
  }

  function setupCanvas(containerId) {
    V.container = document.getElementById(containerId);
    V.cv = V.container.querySelector('canvas');
    V.ctx = V.cv.getContext('2d');
    V.mk = V.container.querySelector('.mk');
    V.stat = V.container.querySelector('.pvstat-el');
  }

  function loadPng(lvl) {
    V.png = null;
    var src = 'png/' + lvl + '.png';
    var im = new Image();
    im.onload = function () { V.png = im; V.pngScale = im.width / V.vw; draw(); };
    im.src = src;
  }

  function loadPdf() {
    if (!window.pdfjsLib) { setStat('plan image'); return; }
    var src = 'plans/' + V.lvl + '.pdf';
    setStat('loading plan…');
    var lvl = V.lvl;
    var done = function (page) { if (lvl !== V.lvl) return; V.pdfPage = page; renderPdf(needScale(), function () {}); };
    if (pdfCache[lvl]) { done(pdfCache[lvl]); return; }
    try {
      pdfjsLib.getDocument(src).promise.then(function (pdf) { return pdf.getPage(1); })
        .then(function (page) { pdfCache[lvl] = page; done(page); })
        .catch(function () { setStat('plan image'); });
    } catch (e) { setStat('plan image'); }
  }
  function needScale() {
    var want = V.viewScale * V.dpr * 1.15;
    return Math.min(Math.max(want, 2), V.maxScale);
  }
  function renderPdf(scale, cb) {
    if (!V.pdfPage) { if (cb) cb(); return; }
    scale = Math.min(scale, V.maxScale);
    if (V.pdfCanvas && Math.abs(V.pdfScale - scale) < 0.05) { if (cb) cb(); return; }
    var vp = V.pdfPage.getViewport({ scale: scale });
    var c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
    setStat('rendering…');
    V.pdfPage.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise.then(function () {
      V.pdfCanvas = c; V.pdfScale = scale; setStat(V.mode === 'browse' ? 'tap a pin to open' : 'plan · crisp'); draw(); if (cb) cb();
    }).catch(function () { setStat('plan image'); if (cb) cb(); });
  }

  function clampS(s) { return Math.max(0.12, Math.min(V.maxScale * 1.6, s)); }
  function centerAt(s) {
    V.viewScale = clampS(s);
    var cw = V.container.clientWidth, ch = V.container.clientHeight;
    V.tx = cw / 2 - V.mx * V.viewScale; V.ty = ch / 2 - V.my * V.viewScale;
    draw(); scheduleRender();
  }
  function fitPlan() {
    var cw = V.container.clientWidth, ch = V.container.clientHeight;
    V.viewScale = Math.min(cw / V.vw, ch / V.vh) * 0.97;
    V.tx = (cw - V.vw * V.viewScale) / 2; V.ty = (ch - V.vh * V.viewScale) / 2;
    draw(); scheduleRender();
  }
  function zoomAt(px, py, ns) {
    ns = clampS(ns); var f = ns / V.viewScale;
    V.tx = px - (px - V.tx) * f; V.ty = py - (py - V.ty) * f; V.viewScale = ns; draw(); scheduleRender();
  }
  function zoomBy(f) { var cw = V.container.clientWidth, ch = V.container.clientHeight; zoomAt(cw / 2, ch / 2, V.viewScale * f); }
  function centerRoom() { if (V.mode === 'room') centerAt(2.4); else fitPlan(); }
  function scheduleRender() {
    if (!V.pdfPage) return;
    clearTimeout(V.renderTimer);
    V.renderTimer = setTimeout(function () { renderPdf(needScale(), function () {}); }, 160);
  }

  function draw() {
    if (!V.container) return;
    var cw = V.container.clientWidth, ch = V.container.clientHeight;
    if (V.cv.width !== Math.round(cw * V.dpr) || V.cv.height !== Math.round(ch * V.dpr)) {
      V.cv.width = Math.round(cw * V.dpr); V.cv.height = Math.round(ch * V.dpr);
    }
    var ctx = V.ctx; ctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    ctx.fillStyle = '#5b6470'; ctx.fillRect(0, 0, cw, ch);
    var x0 = -V.tx / V.viewScale, y0 = -V.ty / V.viewScale,
      x1 = (cw - V.tx) / V.viewScale, y1 = (ch - V.ty) / V.viewScale;
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(V.vw, x1); y1 = Math.min(V.vh, y1);
    if (x1 > x0 && y1 > y0) {
      var src = null, sScale = 0;
      if (V.pdfCanvas && V.pdfScale >= V.viewScale * V.dpr * 0.85) { src = V.pdfCanvas; sScale = V.pdfScale; }
      else if (V.png) { src = V.png; sScale = V.pngScale; }
      else if (V.pdfCanvas) { src = V.pdfCanvas; sScale = V.pdfScale; }
      if (src) {
        var sx0 = x0 * sScale, sy0 = y0 * sScale, sw = (x1 - x0) * sScale, sh = (y1 - y0) * sScale;
        var dx0 = x0 * V.viewScale + V.tx, dy0 = y0 * V.viewScale + V.ty, dw = (x1 - x0) * V.viewScale, dh = (y1 - y0) * V.viewScale;
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        try { ctx.drawImage(src, sx0, sy0, sw, sh, dx0, dy0, dw, dh); } catch (e) {}
      }
    }
    if (V.mode === 'room' && V.mk) {
      V.mk.style.display = 'block';
      V.mk.style.left = (V.mx * V.viewScale + V.tx) + 'px'; V.mk.style.top = (V.my * V.viewScale + V.ty) + 'px';
    } else if (V.mode === 'browse') {
      drawMarkerDots();
    }
  }

  function drawMarkerDots() {
    var host = V.container;
    var layer = host.querySelector('.dotlayer');
    if (!layer) return;
    // simple DOM-dot approach for crisp hit-testing & styling
    if (layer.childElementCount !== V.markers.length) {
      layer.innerHTML = '';
      V.markers.forEach(function (m) {
        var el = document.createElement('div');
        el.className = 'mkdot';
        el.dataset.id = m.id;
        el.title = m.id;
        el.onclick = function (ev) { ev.stopPropagation(); if (V.onPick) V.onPick(m.id); };
        layer.appendChild(el);
      });
    }
    var kids = layer.children;
    for (var i = 0; i < V.markers.length; i++) {
      var m = V.markers[i], el = kids[i];
      el.style.left = (m.mx * V.viewScale + V.tx) + 'px';
      el.style.top = (m.my * V.viewScale + V.ty) + 'px';
    }
  }

  function bind() {
    var pv = V.container, pts = new Map(), lastDist = 0, lastMid = null, moved = false, downAt = null;
    pv.onpointerdown = function (e) {
      pv.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = false; downAt = { x: e.clientX, y: e.clientY, t: Date.now() };
      if (pts.size === 2) { var a = [...pts.values()]; lastDist = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); lastMid = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 }; }
    };
    pv.onpointermove = function (e) {
      if (!pts.has(e.pointerId)) return;
      var prev = pts.get(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      var r = pv.getBoundingClientRect();
      if (pts.size === 1) {
        var dx = e.clientX - prev.x, dy = e.clientY - prev.y;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
        V.tx += dx; V.ty += dy; draw();
      } else if (pts.size === 2) {
        moved = true;
        var a = [...pts.values()]; var dist = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); var mid = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 };
        if (lastDist) { zoomAt(mid.x - r.left, mid.y - r.top, V.viewScale * (dist / lastDist)); V.tx += mid.x - lastMid.x; V.ty += mid.y - lastMid.y; draw(); }
        lastDist = dist; lastMid = mid;
      }
    };
    var up = function (e) {
      pts.delete(e.pointerId); lastDist = 0; lastMid = null; scheduleRender();
      if (V.mode === 'browse' && !moved && V.onPick && downAt && Date.now() - downAt.t < 500) {
        var r = pv.getBoundingClientRect();
        var px = downAt.x - r.left, py = downAt.y - r.top;
        var vx = (px - V.tx) / V.viewScale, vy = (py - V.ty) / V.viewScale;
        var best = null, bestD = Infinity;
        V.markers.forEach(function (m) {
          var d = Math.hypot(m.mx - vx, m.my - vy);
          if (d < bestD) { bestD = d; best = m; }
        });
        var pickPx = bestD * V.viewScale;
        if (best && pickPx < 46) V.onPick(best.id);
      }
    };
    pv.onpointerup = up; pv.onpointercancel = up;
    pv.onwheel = function (e) { e.preventDefault(); var r = pv.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, V.viewScale * (e.deltaY < 0 ? 1.15 : 0.87)); };
  }

  return { openRoom: openRoom, openBrowse: openBrowse, zoomBy: zoomBy, fitPlan: fitPlan, centerRoom: centerRoom, draw: draw };
})();
