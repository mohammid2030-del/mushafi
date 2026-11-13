(function () {
  'use strict';
  var hero = document.getElementById('hero');
  var shot = document.getElementById('heroShot');
  var label = document.getElementById('phaseLabel');
  var nav = document.getElementById('nav');
  function tr(s) { return window.mushafiI18n ? window.mushafiI18n.t(s) : s; }
  document.addEventListener('mushafi:lang', function () { label.textContent = tr(TEXT[hero.dataset.phase] || TEXT.day); });

  /* The hero sky follows the visitor's own clock, like the home screen in the app. */
  function phaseFor(d) {
    var h = d.getHours() + d.getMinutes() / 60;
    if (h >= 5 && h < 7) return 'dawn';
    if (h >= 7 && h < 16.5) return 'day';
    if (h >= 16.5 && h < 19) return 'dusk';
    return 'night';
  }
  var SHOT = { night: 'home-night', dawn: 'home-morning', day: 'home-day', dusk: 'home-day' };
  var TEXT = { night: 'سماء الليل الآن، كما في التطبيق', dawn: 'سماء الفجر الآن، كما في التطبيق', day: 'سماء النهار الآن، كما في التطبيق', dusk: 'سماء الغروب الآن، كما في التطبيق' };
  function applyPhase() {
    var p = phaseFor(new Date());
    if (hero.dataset.phase === p) return;
    hero.dataset.phase = p;
    if (shot) { shot.setAttribute('data-shot', SHOT[p]); if (window.mushafiI18n) window.mushafiI18n.setShot(shot, true); else shot.src = '/img/' + SHOT[p] + '.webp'; }
    label.textContent = tr(TEXT[p]);
    var light = p === 'night' || p === 'dusk';
    document.documentElement.style.setProperty('--navInk', light ? '#f4ecda' : '#163b2e');
  }
  applyPhase();
  setInterval(applyPhase, 60000);

  /* Solid nav after the hero starts scrolling away. */
  /* The bar takes the tone of whatever section is beneath it: night glass over dark sections,
     paper glass over light ones, so it never sits as a pale band over the night sky. */
  function underNavIsDark() {
    var y = nav.getBoundingClientRect().bottom + 2;
    var el = document.elementFromPoint(window.innerWidth / 2, y);
    var sec = el && el.closest('section, footer');
    if (!sec) return true;
    if (sec.classList.contains('features') || sec.classList.contains('skyshow')) return false;
    if (sec === hero) {
      var p = hero.dataset.phase;
      if (p === 'night' || p === 'dusk') return true;
      var r = hero.getBoundingClientRect();
      return (y - r.top) / r.height > 0.5;
    }
    return true;
  }
  function onScroll() {
    var solid = window.scrollY > 40;
    nav.classList.toggle('solid', solid);
    nav.classList.toggle('on-dark', solid && underNavIsDark());
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* Word-by-word verse, like the app's dua animation. */
  var ayah = document.getElementById('ayah');
  var words = ayah.textContent.trim().split(/\s+/);
  ayah.innerHTML = words.map(function (w) { return '<span class="w">' + w + '</span>'; }).join(' ');

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!('IntersectionObserver' in window) || reduce) {
    document.querySelectorAll('.reveal,.ayah .w').forEach(function (e) { e.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        if (el === ayah) {
          el.querySelectorAll('.w').forEach(function (w, i) { setTimeout(function () { w.classList.add('in'); }, 160 + i * 230); });
        } else {
          var sib = Array.prototype.indexOf.call(el.parentNode.children, el);
          el.style.transitionDelay = Math.min(sib, 6) * 70 + 'ms';
          el.classList.add('in');
        }
        io.unobserve(el);
      });
    }, { threshold: 0.16, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.reveal').forEach(function (e) { io.observe(e); });
    io.observe(ayah);
  }

  /* Gallery arrows. */
  var rail = document.getElementById('rail');
  document.querySelectorAll('.rail-nav button').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!rail) return; var step = rail.querySelector('figure').offsetWidth + 34;
      var fwd = b.dataset.dir === 'next' ? 1 : -1, rtl = document.documentElement.dir === 'rtl';
      rail.scrollBy({ left: fwd * (rtl ? -1 : 1) * step * 2, behavior: 'smooth' });
    });
  });

  /* Gentle tilt of the hero phone with the pointer (desktop only). */
  var phone = document.getElementById('heroPhone');
  if (phone && !reduce && window.matchMedia('(pointer:fine)').matches) {
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      phone.style.transform = 'perspective(1200px) rotateY(' + (x * 10) + 'deg) rotateX(' + (-y * 8) + 'deg) rotate(-3deg)';
    });
    hero.addEventListener('pointerleave', function () { phone.style.transform = ''; });
  }
  /* Devices showcase: rise in on view, drift with the pointer, flag chips switch language. */
  var stage = document.getElementById('dvStage');
  if (stage) {
    var show = function () { stage.classList.add('in'); setTimeout(function () { stage.classList.add('live'); }, 1700); };
    if (!('IntersectionObserver' in window) || reduce) show();
    else {
      var dio = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { show(); dio.disconnect(); } }, { threshold: 0.2 });
      dio.observe(stage);
    }
    var sec = hero;
    if (!reduce && window.matchMedia('(pointer:fine)').matches) {
      sec.addEventListener('pointermove', function (e) {
        var r = sec.getBoundingClientRect();
        stage.style.setProperty('--tx', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
        stage.style.setProperty('--ty', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
      });
      sec.addEventListener('pointerleave', function () { stage.style.setProperty('--tx', 0); stage.style.setProperty('--ty', 0); });
    }
    /* Light / dark: every device switches together (tap again to return to the mix). */
    var modes = document.querySelectorAll('.dv-mode'), cur = '';
    var setMode = function (m) {
      cur = m;
      modes.forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.mode === m ? 'true' : 'false'); });
      stage.querySelectorAll('img[data-light]').forEach(function (img, i) {
        var orig = img.dataset.orig || (img.dataset.orig = img.getAttribute('data-shot'));
        var want = m ? img.getAttribute('data-' + m) : orig;
        if (img.getAttribute('data-shot') === want) return;
        img.setAttribute('data-shot', want);
        setTimeout(function () { if (window.mushafiI18n) window.mushafiI18n.setShot(img); }, i * 90);
      });
    };
    modes.forEach(function (b) { b.addEventListener('click', function () { setMode(cur === b.dataset.mode ? '' : b.dataset.mode); }); });
    document.querySelectorAll('.dv-flag').forEach(function (b) {
      b.addEventListener('click', function () { if (window.mushafiI18n) window.mushafiI18n.apply(b.getAttribute('data-lang')); });
    });
  }
})();
