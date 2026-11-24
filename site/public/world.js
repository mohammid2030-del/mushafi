/* «مصحفي حول العالم» — interactive globe of visits, downloads and updates per country (data: /api/world). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var T = function (s) { return window.mushafiI18n ? window.mushafiI18n.t(s) : s; };
  var lang = function () { return window.mushafiI18n ? window.mushafiI18n.lang() : 'ar'; };
  var PALESTINE = { ar: 'فلسطين', en: 'Palestine', ur: 'فلسطین', bn: 'ফিলিস্তিন', tr: 'Filistin', fr: 'Palestine', ru: 'Палестина', am: 'ፍልስጤም' };
  // Small countries that have no shape at this map scale still get a dot.
  var POINTS = { SG: [103.82, 1.35], HK: [114.17, 22.32], BH: [50.56, 26.07], MT: [14.4, 35.9], MV: [73.5, 4.2], MU: [57.55, -20.2], LU: [6.13, 49.6], MO: [113.55, 22.17], AD: [1.52, 42.5], MC: [7.42, 43.74], SM: [12.45, 43.94], LI: [9.55, 47.15] };
  var KEY = { v: 'v', d: 'd', u: 'u' };

  var DATA = { v: {}, d: {}, u: {} }, SINCE = null, WORLD = null, byId = {};
  var metric = 'v', mode = 'globe', sel = null, spinning = true, showAll = false, rot = [-35, -18, 0];
  var W = 600, H = 600, R = 262, proj, path, col;

  // Theme: follows the device (light / dark), like the app.
  var wd = $('wd'), nav = $('nav'), mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function theme() {
    var dark = !!(mq && mq.matches);
    wd.classList.toggle('dark', dark); document.body.classList.toggle('wd-dark', dark);
    if (nav) nav.classList.toggle('on-dark', dark);
    if (WORLD) { col = colorer(); draw(); }
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', theme);
  theme();

  function nf(n) { try { return new Intl.NumberFormat(lang() === 'ar' ? 'ar-SA' : lang()).format(n); } catch (e) { return String(n); } }
  function cname(c) {
    if (c === 'PS') return PALESTINE[lang()] || PALESTINE.en;
    try { return new Intl.DisplayNames([lang()], { type: 'region' }).of(c); } catch (e) { return c; }
  }
  function flag(c) { return String.fromCodePoint.apply(null, c.split('').map(function (x) { return 127397 + x.charCodeAt(0); })); }
  function val(c, m) { return (DATA[m || metric][c]) || 0; }
  function countries() {
    var all = {};
    ['v', 'd', 'u'].forEach(function (m) { Object.keys(DATA[m]).forEach(function (c) { if (DATA[m][c] > 0) all[c] = 1; }); });
    return Object.keys(all);
  }
  function ranked() { return countries().filter(function (c) { return val(c) > 0; }).sort(function (a, b) { return val(b) - val(a); }); }
  function total(m) { return Object.keys(DATA[m]).reduce(function (a, c) { return a + DATA[m][c]; }, 0); }

  var svg = d3.select('#wdMap');
  svg.append('defs').html(
    '<radialGradient id="wdOc" cx="40%" cy="35%" r="70%"><stop offset="0" style="stop-color:var(--ocean1)"/><stop offset="1" style="stop-color:var(--ocean2)"/></radialGradient>' +
    '<radialGradient id="wdHalo" r="50%"><stop offset=".86" stop-color="#e6c67e" stop-opacity=".22"/><stop offset="1" stop-color="#e6c67e" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="wdShine" cx="35%" cy="28%" r="60%"><stop offset="0" stop-color="#fff" stop-opacity=".10"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
    '<filter id="wdGlow" x="-2" y="-2" width="5" height="5"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>');
  var gHalo = svg.append('circle'), gSphere = svg.append('path'), gGrat = svg.append('path'), gLand = svg.append('g'),
      gShine = svg.append('circle').attr('pointer-events', 'none'), gDots = svg.append('g').attr('pointer-events', 'none');
  var land, dots;

  function setup() {
    var globe = mode === 'globe';
    $('wdStage').classList.toggle('flat', !globe);
    if (globe) { svg.attr('viewBox', '0 0 ' + W + ' ' + H); proj = d3.geoOrthographic().scale(R).translate([W / 2, H / 2]).clipAngle(90).rotate(rot); }
    else { svg.attr('viewBox', '0 0 ' + W + ' 330'); proj = d3.geoNaturalEarth1().rotate([-20, 0]).fitExtent([[6, 6], [W - 6, 324]], { type: 'Sphere' }); }
    path = d3.geoPath(proj);
    gHalo.attr('display', globe ? null : 'none').attr('cx', W / 2).attr('cy', H / 2).attr('r', R + 38).attr('fill', 'url(#wdHalo)');
    gShine.attr('display', globe ? null : 'none').attr('cx', W / 2).attr('cy', H / 2).attr('r', R).attr('fill', 'url(#wdShine)');
    gSphere.datum({ type: 'Sphere' }).attr('fill', 'url(#wdOc)').style('stroke', 'var(--rim)').attr('stroke-width', globe ? 1.2 : .6);
    gGrat.datum(d3.geoGraticule10()).attr('fill', 'none').style('stroke', 'var(--grat)').attr('stroke-width', .6);
    draw();
  }
  function colorer() {
    var max = d3.max(countries(), function (c) { return val(c); }) || 1, dark = wd.classList.contains('dark');
    var s = d3.scaleSqrt().domain([0, max]).range(dark ? ['#5a4422', '#ffe3a0'] : ['#ecdcb2', '#8f6a22']);
    return function (c) { var x = val(c); return x ? s(x) : 'var(--land)'; };
  }
  function draw() {
    if (!WORLD) return;
    gSphere.attr('d', path); gGrat.attr('d', path);
    land.attr('d', path).style('fill', function (f) { return col(f.id); }).classed('sel', function (f) { return f.id && f.id === sel; });
    var center = mode === 'globe' ? [-proj.rotate()[0], -proj.rotate()[1]] : null;
    dots.attr('display', function (d) { return !center || d3.geoDistance(d.p, center) < 1.45 ? null : 'none'; })
        .attr('transform', function (d) { var p = proj(d.p); return p ? 'translate(' + p[0] + ',' + p[1] + ')' : ''; });
  }
  function where(c) { return byId[c] ? d3.geoCentroid(byId[c]) : POINTS[c]; }
  function makeDots() {
    var top = ranked().slice(0, 12).filter(where).map(function (c) { return { id: c, p: where(c) }; });
    dots = gDots.selectAll('g').data(top, function (d) { return d.id; }).join(function (e) {
      var g = e.append('g'); g.append('circle').attr('class', 'wd-ring').attr('r', 5); g.append('circle').attr('class', 'wd-dot').attr('r', 2.6); return g;
    });
  }

  function flyTo(c) {
    var p = where(c); if (!p || mode !== 'globe') return;
    var it = d3.interpolate(rot.slice(), [-p[0], Math.max(-60, Math.min(60, -p[1] + 8)), 0]);
    d3.transition().duration(1100).ease(d3.easeCubicInOut).tween('r', function () { return function (t) { rot = it(t); proj.rotate(rot); draw(); }; });
  }
  function popup() {
    var pop = $('wdPop');
    if (!sel) { pop.hidden = true; return; }
    var rk = ranked().indexOf(sel) + 1;
    $('pF').textContent = flag(sel); $('pN').textContent = cname(sel);
    $('pR').textContent = rk ? T('المرتبة {n} عالميًا').replace('{n}', nf(rk)) : T('لا توجد زيارات بعد');
    $('pV').textContent = nf(val(sel, 'v')); $('pD').textContent = nf(val(sel, 'd')); $('pU').textContent = nf(val(sel, 'u'));
    $('lV').textContent = T('الزيارات'); $('lD').textContent = T('التحميلات'); $('lU').textContent = T('التحديثات');
    pop.hidden = false;
  }
  function select(c, fly) {
    sel = c; spinning = false;
    popup(); list(); draw();
    if (fly && c) flyTo(c);
  }
  function list() {
    var rows = ranked(), max = rows.length ? val(rows[0]) : 1;
    $('wdLT').textContent = T({ v: 'أكثر الدول زيارة', d: 'أكثر الدول تحميلًا', u: 'أكثر الدول تحديثًا' }[metric]);
    try { $('wdSince').textContent = SINCE ? T('منذ {d}').replace('{d}', new Intl.DateTimeFormat(lang() === 'ar' ? 'ar-SA-u-ca-gregory-nu-arab' : lang(), { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(SINCE + 'T12:00:00Z'))) : ''; } catch (e) {}
    var box = $('wdList');
    if (!rows.length) { box.innerHTML = '<div class="wd-empty">' + T('العدّ بدأ للتو، ترقّب أول الأرقام') + '</div>'; $('wdMore').hidden = true; return; }
    box.innerHTML = rows.slice(0, showAll ? rows.length : 8).map(function (c, i) {
      return '<div class="wd-row' + (c === sel ? ' sel' : '') + '" data-c="' + c + '"><span class="n">' + nf(i + 1) + '</span><span class="f">' + flag(c) + '</span><div class="mid"><div class="nm">' + cname(c) + '</div><div class="wd-track"><i style="width:' + Math.max(1.5, val(c) / max * 100).toFixed(1) + '%"></i></div></div><span class="val">' + nf(val(c)) + '</span></div>';
    }).join('');
    box.querySelectorAll('.wd-row').forEach(function (el) { el.onclick = function () { select(el.getAttribute('data-c'), true); if (innerWidth < 900) $('wdStage').scrollIntoView({ behavior: 'smooth', block: 'center' }); }; });
    $('wdMore').hidden = rows.length <= 8;
    $('wdMore').textContent = showAll ? T('عرض أقل') : T('عرض كل الدول') + ' (' + nf(rows.length) + ')';
  }
  function totals() {
    $('tV').textContent = nf(total('v')); $('tD').textContent = nf(total('d')); $('tU').textContent = nf(total('u'));
    $('tC').textContent = nf(countries().length);
  }
  function render() { col = colorer(); makeDots(); totals(); list(); popup(); draw(); }

  $('wdMore').onclick = function () { showAll = !showAll; list(); };
  document.querySelectorAll('#wdMetric button').forEach(function (b) {
    b.onclick = function () { document.querySelectorAll('#wdMetric button').forEach(function (x) { x.classList.toggle('on', x === b); }); metric = KEY[b.getAttribute('data-m')]; showAll = false; render(); };
  });
  document.querySelectorAll('#wdMode button').forEach(function (b) {
    b.onclick = function () { document.querySelectorAll('#wdMode button').forEach(function (x) { x.classList.toggle('on', x === b); }); mode = b.getAttribute('data-p'); setup(); };
  });
  document.addEventListener('mushafi:lang', function () { if (WORLD) { totals(); list(); popup(); } });

  // Drag to turn the globe.
  d3.select('#wdStage').call(d3.drag()
    .filter(function (e) { return mode === 'globe' && !e.button; })
    .on('start', function () { spinning = false; })
    .on('drag', function (e) { var k = 75 / R; rot = [rot[0] + e.dx * k, Math.max(-70, Math.min(70, rot[1] - e.dy * k)), 0]; proj.rotate(rot); draw(); }));
  svg.on('click', function () { if (sel) select(null); });
  d3.timer(function () { if (spinning && mode === 'globe' && WORLD && !document.hidden) { rot[0] += .12; proj.rotate(rot); draw(); } });

  function load() {
    return fetch('/api/world', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      DATA = { v: j.v || {}, d: j.d || {}, u: j.u || {} }; SINCE = j.since || null;
    }).catch(function () {});
  }
  Promise.all([fetch('/world/countries.json').then(function (r) { return r.json(); }), load()]).then(function (res) {
    WORLD = res[0];
    WORLD.features.forEach(function (f) { if (f.id) byId[f.id] = f; });
    land = gLand.selectAll('path').data(WORLD.features).join('path').attr('class', 'wd-c')
      .on('click', function (e, f) { e.stopPropagation(); if (f.id) select(f.id, true); });
    col = colorer(); makeDots(); setup(); render();
    setInterval(function () { if (!document.hidden) load().then(render); }, 60000);
  });

  // ---- Share: a 1080×1920 story image (Snapchat / Instagram / WhatsApp status) ----
  var storyBlob = null;
  function fmtDate(d, opt) { try { return new Intl.DateTimeFormat(lang() === 'ar' ? 'ar-SA-u-ca-gregory-nu-arab' : lang(), opt).format(d); } catch (e) { return d.toDateString(); } }
  function rrect(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
  function fit(x, text, max, size, weight) { var s = size; do { x.font = weight + ' ' + s + 'px UI'; s -= 1; } while (x.measureText(text).width > max && s > 14); return text; }
  function loadImg(src) { return new Promise(function (ok) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = function () { ok(null); }; i.src = src; }); }
  function drawStory() {
    var S = 1080, H = 1920, cv = document.createElement('canvas'); cv.width = S; cv.height = H;
    var x = cv.getContext('2d'), rtl = document.documentElement.dir === 'rtl', cx = S / 2;
    return Promise.all([loadImg('/img/icon.webp'), document.fonts ? document.fonts.load('800 60px UI') : null]).then(function (r) {
      var icon = r[0];
      x.direction = rtl ? 'rtl' : 'ltr'; x.textAlign = 'center'; x.textBaseline = 'middle';
      var g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1a140b'); g.addColorStop(.5, '#0c0a07'); g.addColorStop(1, '#070604');
      x.fillStyle = g; x.fillRect(0, 0, S, H);
      var gl = x.createRadialGradient(cx, 0, 10, cx, 0, 900); gl.addColorStop(0, 'rgba(230,198,126,.26)'); gl.addColorStop(1, 'rgba(230,198,126,0)'); x.fillStyle = gl; x.fillRect(0, 0, S, H);
      // brand
      if (icon) { x.save(); rrect(x, cx - 70, 170, 140, 140, 34); x.clip(); x.drawImage(icon, cx - 70, 170, 140, 140); x.restore(); }
      x.fillStyle = '#e6c67e'; x.font = '800 78px UI'; fit(x, T('مصحفي حول العالم'), 980, 78, 800); x.fillText(T('مصحفي حول العالم'), cx, 395);
      // date range pill
      var a = SINCE ? new Date(SINCE + 'T12:00:00Z') : new Date(), b = new Date();
      var range = T('من {a} إلى {b}').replace('{a}', fmtDate(a, { day: 'numeric', month: 'long' })).replace('{b}', fmtDate(b, { day: 'numeric', month: 'long', year: 'numeric' }));
      x.font = '700 34px UI'; var pw = Math.min(980, x.measureText(range).width + 70);
      rrect(x, cx - pw / 2, 468, pw, 70, 35); x.fillStyle = 'rgba(230,198,126,.13)'; x.fill(); x.strokeStyle = 'rgba(230,198,126,.45)'; x.lineWidth = 2; x.stroke();
      x.fillStyle = '#f0d38e'; fit(x, range, pw - 50, 34, 700); x.fillText(range, cx, 504);
      // globe, turned to the busiest country
      var top = ranked(), focus = [42, 24], R2 = 335, gy = 935;
      var pj = d3.geoOrthographic().scale(R2).translate([cx, gy]).clipAngle(90).rotate([-focus[0] + 10, -Math.max(-40, Math.min(40, focus[1])) + 4, 0]), gp = d3.geoPath(pj, x);
      var halo = x.createRadialGradient(cx, gy, R2 * .86, cx, gy, R2 + 70); halo.addColorStop(0, 'rgba(230,198,126,.30)'); halo.addColorStop(1, 'rgba(230,198,126,0)');
      x.fillStyle = halo; x.beginPath(); x.arc(cx, gy, R2 + 70, 0, 7); x.fill();
      var oc = x.createRadialGradient(cx - 110, gy - 120, 20, cx, gy, R2); oc.addColorStop(0, '#241c10'); oc.addColorStop(1, '#090704');
      x.fillStyle = oc; x.beginPath(); gp({ type: 'Sphere' }); x.fill();
      x.strokeStyle = 'rgba(240,214,150,.07)'; x.lineWidth = 1; x.beginPath(); gp(d3.geoGraticule10()); x.stroke();
      var max = d3.max(countries(), function (c) { return val(c); }) || 1, sc = d3.scaleSqrt().domain([0, max]).range(['#5a4422', '#ffe3a0']);
      WORLD.features.forEach(function (f) {
        var v = f.id ? val(f.id) : 0; x.beginPath(); gp(f);
        x.fillStyle = v ? sc(v) : 'rgba(240,214,150,.10)'; x.fill(); x.strokeStyle = 'rgba(240,214,150,.24)'; x.lineWidth = 1; x.stroke();
      });
      var shine = x.createRadialGradient(cx - 120, gy - 140, 10, cx - 60, gy - 80, R2); shine.addColorStop(0, 'rgba(255,255,255,.12)'); shine.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = shine; x.beginPath(); x.arc(cx, gy, R2, 0, 7); x.fill();
      x.strokeStyle = 'rgba(230,198,126,.7)'; x.lineWidth = 2.5; x.beginPath(); x.arc(cx, gy, R2, 0, 7); x.stroke();
      var center = [-pj.rotate()[0], -pj.rotate()[1]];
      top.slice(0, 12).forEach(function (c) {
        var p = where(c); if (!p || d3.geoDistance(p, center) > 1.45) return; var q = pj(p);
        var dg = x.createRadialGradient(q[0], q[1], 0, q[0], q[1], 22); dg.addColorStop(0, 'rgba(255,231,168,.9)'); dg.addColorStop(1, 'rgba(255,231,168,0)');
        x.fillStyle = dg; x.beginPath(); x.arc(q[0], q[1], 22, 0, 7); x.fill(); x.fillStyle = '#fff3cf'; x.beginPath(); x.arc(q[0], q[1], 6, 0, 7); x.fill();
      });
      // two numbers
      var cards = [[total('v'), T('زيارة للموقع')], [total('d') + total('u'), T('تحميل للأندرويد')]], cw = 470, ch = 210, cy = 1330;
      cards.forEach(function (k, i) {
        var X = rtl ? (i === 0 ? cx + 15 : cx - 15 - cw) : (i === 0 ? cx - 15 - cw : cx + 15);
        rrect(x, X, cy, cw, ch, 40); x.fillStyle = 'rgba(255,248,232,.06)'; x.fill(); x.strokeStyle = 'rgba(240,214,150,.22)'; x.lineWidth = 2; x.stroke();
        var ng = x.createLinearGradient(0, cy + 40, 0, cy + 140); ng.addColorStop(0, '#fff2d2'); ng.addColorStop(1, '#d9b462');
        x.fillStyle = ng; x.font = '800 96px UI'; x.fillText(nf(k[0]), X + cw / 2, cy + 92);
        x.fillStyle = '#bba985'; fit(x, k[1], cw - 40, 34, 700); x.fillText(k[1], X + cw / 2, cy + 165);
      });
      // top countries
      x.fillStyle = '#f7eedb'; x.font = '800 36px UI';
      x.fillText(T({ v: 'أكثر الدول زيارة', d: 'أكثر الدول تحميلًا', u: 'أكثر الدول تحديثًا' }[metric]), cx, 1608);
      var five = top.slice(0, 5), colW = 196, start = cx - colW * five.length / 2;
      five.forEach(function (c, i) {
        var X = rtl ? start + colW * (five.length - 1 - i) + colW / 2 : start + colW * i + colW / 2;
        x.font = '64px UI'; x.fillStyle = '#fff'; x.fillText(flag(c), X, 1690);
        x.fillStyle = '#f0d38e'; x.font = '800 32px UI'; x.fillText(nf(val(c)), X, 1752);
        x.fillStyle = '#bba985'; fit(x, cname(c), colW - 16, 24, 600); x.fillText(cname(c), X, 1792);
      });
      // footer
      x.fillStyle = 'rgba(240,214,150,.55)'; x.font = '700 30px UI'; x.fillText(T('حمّل مصحفي مجانًا') + '  ·  mushafiapp.com', cx, 1862);
      return new Promise(function (ok) { cv.toBlob(ok, 'image/png'); });
    });
  }
  function openShare() {
    var m = $('wdModal'), pv = $('wdPrev');
    m.hidden = false; storyBlob = null; pv.innerHTML = '<span class="wd-wait">' + T('تجهيز الصورة…') + '</span>';
    drawStory().then(function (b) {
      storyBlob = b; var im = new Image(); im.alt = T('مصحفي حول العالم'); im.src = URL.createObjectURL(b); pv.innerHTML = ''; pv.appendChild(im);
    });
  }
  function saveStory() {
    if (!storyBlob) return; var a = document.createElement('a'); a.href = URL.createObjectURL(storyBlob); a.download = 'mushafi-world.png'; document.body.appendChild(a); a.click(); a.remove();
  }
  $('wdShare').onclick = function () { if (WORLD) openShare(); };
  $('wdClose').onclick = function () { $('wdModal').hidden = true; };
  $('wdModal').onclick = function (e) { if (e.target === this) this.hidden = true; };
  $('wdSave').onclick = saveStory;
  $('wdDoShare').onclick = function () {
    if (!storyBlob) return;
    var file = new File([storyBlob], 'mushafi-world.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], title: T('مصحفي حول العالم'), text: T('مصحفي حول العالم') + ' — https://mushafiapp.com/world' }).catch(function () {});
    else saveStory();
  };
  window.mushafiStory = drawStory;
})();
