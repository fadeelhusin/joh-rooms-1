/* ============================================================
   JOH Room Storyboard — GRID REFERENCE
   Works out which structural grids any point sits between
   (e.g. "Cb–Db / 04b–05b") from the grid lines extracted from
   the IFC plans (grids.js, built by tools/extract_grids.py).
   One canonical grid is used for every level (all level sheets
   share the same layout).
   ============================================================ */
var Grid = (function () {
  var VW = 1191, VH = 842, FAM = null;
  function build() {
    if (FAM) return FAM;
    FAM = {};
    var src = (window.GRIDS_DATA && GRIDS_DATA.all) || [];
    src.forEach(function (o) {
      var dx = o.b[0] - o.a[0], dy = o.b[1] - o.a[1], L = Math.hypot(dx, dy); if (L < 1) return;
      var lab = o.l, isNum = /^\d/.test(lab), m = /([abc])$/.exec(isNum ? lab : lab.slice(1)), suf = m ? m[1] : '';
      var th = Math.atan2(dy, dx); if (th < 0) th += Math.PI; if (th >= Math.PI) th -= Math.PI;
      var ln = { l: lab, ax: o.a[0], ay: o.a[1], dx: dx / L, dy: dy / L, L: L, nx: -dy / L, ny: dx / L, th: th };
      // one family per grid system (letters/numbers + a/b/c suffix) AND per direction —
      // some systems mix a straight block and a rotated block
      var base = (isNum ? 'N' : 'L') + suf, key = null;
      Object.keys(FAM).forEach(function (k) {
        var f = FAM[k]; if (f.base !== base || key) return;
        var d = Math.abs(f.th - th); d = Math.min(d, Math.PI - d);
        if (d < 0.1) key = k;
      });
      if (!key) { key = base + '#' + Object.keys(FAM).length; FAM[key] = { key: key, base: base, num: isNum, suf: suf, th: th, lines: [] }; }
      var f = FAM[key];
      if (f.lines.length) { var r = f.lines[0]; if (ln.nx * r.nx + ln.ny * r.ny < 0) { ln.nx = -ln.nx; ln.ny = -ln.ny; } }
      f.lines.push(ln);
    });
    return FAM;
  }
  function bracket(f, X, Y) {
    var lo = null, hi = null;
    f.lines.forEach(function (ln) {
      var px = X - ln.ax, py = Y - ln.ay, t = px * ln.dx + py * ln.dy, m = Math.max(40, ln.L * 0.08);
      if (t < -m || t > ln.L + m) return;                         // point is outside this grid line's span
      var s = px * ln.nx + py * ln.ny;
      if (s <= 0 && (!lo || s > lo.s)) lo = { l: ln.l, s: s };
      if (s > 0 && (!hi || s < hi.s)) hi = { l: ln.l, s: s };
    });
    return { lo: lo, hi: hi };
  }
  function natural(a, b) {
    var na = parseInt(a, 10), nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  function fmt(br) {
    var ON = 1.6;                                                  // ~ within the grid line width on the sheet
    if (br.lo && br.hi) {
      if (-br.lo.s < ON) return br.lo.l;
      if (br.hi.s < ON) return br.hi.l;
      var p = [br.lo.l, br.hi.l].sort(natural); return p[0] + '–' + p[1];
    }
    var one = br.lo || br.hi; return one ? 'beyond ' + one.l : '';
  }
  /* x, y = normalised plan position (0..1) as stored in ROOMS[..].pos */
  function at(x, y) {
    if (x == null || y == null) return null;
    var X = x * VW, Y = y * VH, F = build(), cand = [];
    Object.keys(F).forEach(function (k) {
      var f = F[k], br = bracket(f, X, Y);
      if (!br.lo && !br.hi) return;
      var full = !!(br.lo && br.hi);
      cand.push({ f: f, br: br, full: full, w: full ? br.hi.s - br.lo.s : 1e6 + Math.abs((br.lo || br.hi).s) });
    });
    var Ls = cand.filter(function (c) { return !c.f.num; }), Ns = cand.filter(function (c) { return c.f.num; });
    var pair = null;
    Ls.forEach(function (a) {
      Ns.forEach(function (b) {
        if (!a.full || !b.full) return;
        var d = Math.abs(a.f.th - b.f.th); d = Math.min(d, Math.PI - d);
        if (d < 0.7) return;                                      // letter and number grids must cross
        var w = a.w + b.w + (a.f.suf === b.f.suf ? 0 : 60);       // prefer the same grid system
        if (!pair || w < pair.w) pair = { w: w, L: a, N: b };
      });
    });
    var bestOf = function (arr) { return arr.sort(function (p, q) { return p.w - q.w; })[0]; };
    var L = pair ? pair.L : bestOf(Ls), N = pair ? pair.N : bestOf(Ns);
    var a = L ? fmt(L.br) : '', b = N ? fmt(N.br) : '';
    if (!a && !b) return null;
    return { text: [a, b].filter(Boolean).join(' / '), letter: a, number: b };
  }
  function ofRoom(id) { var r = window.ROOMS && ROOMS[id]; return r && r.pos ? at(r.pos[1], r.pos[2]) : null; }
  function label(id) { var g = ofRoom(id); return g ? 'Grid ' + g.text : ''; }
  return { at: at, ofRoom: ofRoom, label: label };
})();
