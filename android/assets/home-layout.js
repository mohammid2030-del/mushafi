'use strict';
// Home arrangement: a sky header that follows the day's prayers, today's times, a quick row,
// then features grouped in tiles. Every card still comes from its own module; this file only
// places them, so their own updates (weather, smart shortcut, recitation, challenge) keep working.
Object.assign(iconPaths, {
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8 4.8-2.2Z"/>',
  live: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="m8 3 4 3 4-3"/><path d="m10.5 10 4 2.5-4 2.5v-5Z"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M9.5 17h5"/>',
  cap: '<path d="m3 9 9-4.5L21 9l-9 4.5L3 9Z"/><path d="M7 11v4.5c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V11M21 9v5"/>',
  scroll: '<path d="M7 4h11a2 2 0 0 1 2 2v1h-4"/><path d="M16 7v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1h10"/><path d="M7 4a2 2 0 0 0-2 2v11M9 9h4M9 12.5h4"/>',
  volume: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4v-5Z"/><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10"/>',
  mute: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4v-5Z"/><path d="m16 10 4 4M20 10l-4 4"/>'
});

const HL_KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
let hlTimer = null;

function hlZone(data) { return data?.settings?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone }
function hlDateKey(t, zone) { return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t)) }
function hlToday(data, now = Date.now()) {
  const days = (data?.days || []).filter(d => Number.isFinite(d.fajr) && Number.isFinite(d.isha));
  const key = hlDateKey(now, hlZone(data));
  return days.find(d => d.date === key) || days.find(d => hlDateKey(d.dhuhr, hlZone(data)) === key) || null
}
function hlEvents(data) {
  return (data?.days || []).flatMap(d => HL_KEYS.filter(k => Number.isFinite(d[k])).map(k => ({ key: k, time: d[k] }))).sort((a, b) => a.time - b.time)
}
function hlLeft(ms, long) {
  const m = Math.max(1, Math.ceil(ms / 60000)), h = Math.floor(m / 60), r = m % 60;
  if (h && r) return 'بعد ' + ar(h) + ' س و' + ar(r) + ' د';
  if (h) return 'بعد ' + ar(h) + ' س';
  return long ? 'بعد ' + ar(m) + ' دقيقة' : 'بعد ' + ar(m) + ' د'
}
function hlRemain(ms) {
  const m = Math.max(1, Math.ceil(ms / 60000)), h = Math.floor(m / 60), r = m % 60;
  return h ? 'بقي ' + ar(h) + ' س و' + ar(r) + ' د' : 'بقي ' + ar(m) + ' د'
}
// The sky follows the part of the day we are in.
function hlSky(today, now) {
  if (!today) return 'day';
  if (now < today.fajr || now >= today.isha) return 'night';
  if (now < today.sunrise) return 'dawn';
  if (now < today.asr) return 'day';
  if (now < today.maghrib - 25 * 60000) return 'afternoon';
  return 'dusk'
}

/* ---------- sky header ---------- */
function hlSkyMarkup(data) {
  const s = data?.settings || {};
  if (!s.confirmed) return `<section class="hl-sky day hl-sky-setup"><div class="hl-sky-body"><span class="hl-sky-kicker">مواقيت الصلاة</span><h2>حدّد موقعك</h2><p>لتظهر مواقيت صلاتك وحالة يومك هنا</p><button class="hl-pill" onclick="prayerHome()">${uiIcon('pin')}<span>تحديد الموقع</span></button></div>${hlSilhouette()}</section>`;
  const now = Date.now(), today = hlToday(data, now), phase = typeof prayerPhase === 'function' ? prayerPhase(data, now) : null;
  if (data.error || !today || !phase) return `<section class="hl-sky day"><div class="hl-sky-body"><span class="hl-sky-kicker">مواقيت الصلاة</span><h2>تعذر حساب المواقيت</h2><p>${esc(data.error || 'راجع الموقع والمنطقة الزمنية')}</p><button class="hl-pill" onclick="prayerHome()">${uiIcon('settings')}<span>مراجعة الإعدادات</span></button></div>${hlSilhouette()}</section>`;
  const events = hlEvents(data), current = events.filter(e => e.time <= now).at(-1);
  const pill = phase.kind === 'iqama'
    ? `<span>إقامة ${prayerNames[phase.key]}</span> <span>${hlLeft(phase.target - now, true)}</span>`
    : `<span>${prayerNames[phase.key]}</span> <span>${hlLeft(phase.target - now, true)}</span>`;
  const weather = hlWeatherChip();
  return `<section class="hl-sky ${hlSky(today, now)}" aria-label="حالة يومك">
    <span class="hl-stars" aria-hidden="true"></span>
    <div class="hl-sky-top">
      <button class="hl-chip" onclick="prayerHome()" aria-label="الموقع">${uiIcon('pin')}<span>${esc(s.city || '')}</span></button>
      ${weather}
    </div>
    <div class="hl-sky-body">
      <span class="hl-sky-kicker">أنت الآن في وقت</span>
      <h2>${current ? prayerNames[current.key] : prayerNames.isha}</h2>
      <button class="hl-pill" onclick="prayerHome()">${uiIcon('clock')}${pill}</button>
    </div>
    ${hlArc(today, now)}
    ${hlSilhouette()}
  </section>`
}
function hlWeatherChip() {
  try {
    const loc = homeWeatherLocation(), c = loc && homeWeatherCache(loc.key);
    if (!c) return '';
    return `<button class="hl-chip" onclick="openWeatherCredits()" aria-label="الطقس">${homeWeatherIcon(c.symbol)}<span dir="ltr">${ar(Math.round(c.temperature))}°</span></button>`
  } catch (e) { return '' }
}
// Sun path from Fajr (right) to Isha (left); dots mark each prayer, the marker shows now.
function hlArc(today, now) {
  const P0 = [338, 132], P1 = [180, 18], P2 = [22, 132];
  const at = t => { const u = 1 - t; return [u * u * P0[0] + 2 * u * t * P1[0] + t * t * P2[0], u * u * P0[1] + 2 * u * t * P1[1] + t * t * P2[1]] };
  const span = today.isha - today.fajr, pos = time => Math.min(1, Math.max(0, (time - today.fajr) / span));
  const tn = pos(now), night = now < today.fajr || now >= today.isha;
  const pts = HL_KEYS.map(k => at(pos(today[k])));
  const path = (a, b) => { const n = 24; let d = ''; for (let i = 0; i <= n; i++) { const p = at(a + (b - a) * i / n); d += (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1) } return d };
  const [mx, my] = night ? at(now >= today.isha ? 1 : 0) : at(tn);
  return `<svg class="hl-arc" viewBox="0 0 360 150" aria-hidden="true">
    <path class="hl-arc-rest" d="${path(0, 1)}"/>
    ${night ? '' : `<path class="hl-arc-done" d="${path(0, tn)}"/>`}
    ${pts.map(([x, y], i) => `<circle class="hl-arc-dot${HL_KEYS[i] === 'sunrise' ? ' minor' : ''}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${HL_KEYS[i] === 'sunrise' ? 2.6 : 3.6}"/>`).join('')}
    <circle class="hl-arc-halo" cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="15"/>
    <circle class="hl-arc-sun ${night ? 'moon' : ''}" cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="7.5"/>
  </svg>`
}
function hlSilhouette() {
  return `<svg class="hl-skyline" viewBox="0 0 360 64" preserveAspectRatio="none" aria-hidden="true"><path d="M0 64V50h28v-6h22v6h40v-9h8l3-6V18l2-5 2 5v17l3 6h12v-9c6-1 10-6 10-6s4 5 10 6v9h6v-4c0-15 14-23 31-26v-6h2v6c17 3 31 11 31 26v4h6v-9c6-1 10-6 10-6s4 5 10 6v9h12l3-6V18l2-5 2 5v17l3 6h8v9h40v-6h22v6h28v14Z"/></svg>`
}

/* ---------- today's times ---------- */
function hlTimesMarkup(data) {
  const s = data?.settings || {}; if (!s.confirmed) return '';
  const now = Date.now(), today = hlToday(data, now); if (!today) return '';
  const zone = hlZone(data), phase = prayerPhase(data, now), events = hlEvents(data);
  const nextKey = phase && hlDateKey(phase.prayer?.time || phase.target, zone) === today.date ? phase.key : null;
  const d = new Date(now), nums = { numberingSystem: uiLocale() === 'ar' ? 'arab' : 'latn', timeZone: zone };
  let greg = '', hijri = '';
  try { greg = new Intl.DateTimeFormat(uiLocale(), { ...nums, weekday: 'long', day: 'numeric', month: 'long' }).format(d) } catch (e) {}
  try { hijri = new Intl.DateTimeFormat(uiLocale() + '-u-ca-islamic-umalqura', { ...nums, day: 'numeric', month: 'long', year: 'numeric' }).format(d) } catch (e) {}
  const rows = prayerKeys.map(k => {
    const t = today[k], on = !!s.prayers?.[k]?.adhan, active = k === nextKey;
    let extra = '';
    if (active) {
      const prev = events.filter(e => e.time < phase.target).at(-1)?.time || (phase.target - 3600000);
      const pct = Math.min(100, Math.max(2, (now - prev) / (phase.target - prev) * 100));
      extra = `<div class="hl-progress"><span class="hl-bar"><i style="width:${pct.toFixed(1)}%"></i></span><small>${phase.kind === 'iqama' ? '<span>الإقامة</span> ' : ''}<span>${hlRemain(phase.target - now)}</span></small></div>`
    }
    return `<button class="hl-row${active ? ' active' : ''}${t < now && !active ? ' past' : ''}" onclick="prayerHome()">
      <span class="hl-dot" aria-hidden="true"></span>
      <span class="hl-row-main"><strong>${prayerNames[k]}</strong>${active ? `<em class="hl-next">${phase.kind === 'iqama' ? 'الإقامة' : 'التالية'}</em>` : ''}<span class="hl-time">${prayerClock(t, zone)}</span><span class="hl-sound ${on ? '' : 'off'}" aria-label="${on ? 'الأذان مفعّل' : 'الأذان متوقف'}">${uiIcon(on ? 'volume' : 'mute')}</span></span>
      ${extra}
    </button>`
  }).join('');
  return `<section class="hl-times">
    <div class="hl-times-head"><div><strong>${esc(greg)}</strong><small>${esc(hijri)}${s.city ? ' · ' + esc(s.city) : ''}</small></div><button class="hl-link" onclick="prayerHome()"><span>كل المواقيت</span>${uiIcon('arrow')}</button></div>
    <div class="hl-rows">${rows}</div>
    ${!nextKey && phase ? `<button class="hl-tomorrow" onclick="prayerHome()"><span><span>${phase.kind === 'iqama' ? 'إقامة ' + prayerNames[phase.key] : prayerNames[phase.key]}</span> <span>غدًا</span></span><span class="hl-time">${prayerClock(phase.target, zone)}</span><small>${hlRemain(phase.target - now)}</small></button>` : ''}
  </section>`
}

/* ---------- tiles ---------- */
function hlTile(icon, label, action, badge) {
  return `<button class="hl-tile" onclick="${action}">${uiIcon(icon)}<span>${label}</span>${badge ? `<em class="hl-badge">${badge}</em>` : ''}</button>`
}
function hlHead(title, link, action) {
  return `<div class="hl-head"><h2>${title}</h2>${link ? `<button class="hl-link" onclick="${action}"><span>${link}</span>${uiIcon('arrow')}</button>` : ''}</div>`
}
function hlRow(icon, title, sub, action) {
  return `<button class="hl-item" onclick="${action}"><span class="hl-item-ico">${uiIcon(icon)}</span><span class="hl-item-text"><strong>${title}</strong>${sub ? `<small>${sub}</small>` : ''}</span><span class="hl-item-arrow">${uiIcon('arrow')}</span></button>`
}
function hlNode(html) { return document.createRange().createContextualFragment(html).firstElementChild }
function hlOpenMushaf() { const tab = document.getElementById('n-quran'); if (tab) tab.click(); else showPage(+(localStorage.lastPage || 1)) }

function homeLayout() {
  if (view !== 'home' || app.querySelector('.hl-sky')) return;
  const take = sel => { const el = app.querySelector(sel); if (el) el.remove(); return el };
  const reading = take('.reading-hero'), quick = take('.quick-grid'), dua = take('.daily-dua-card'),
    fajr = take('.fajr-home-card'), charity = take('.home-charity-card'), recitation = take('.home-recitation-card'),
    challenge = take('.challenge-entry'), footer = take('.home-footer');
  const smart = quick?.querySelectorAll(':scope > button')[1];
  // Kept in the page (hidden) so their own refresh code still finds them.
  const keep = [take('#home-weather') || take('.home-weather'), take('.home-prayer-widget')].filter(Boolean);
  const rest = [...app.children];   // notices and anything another module added
  const data = readPrayerData();
  const frag = document.createElement('div');
  frag.innerHTML = `<div class="hl-sky-slot">${hlSkyMarkup(data)}</div><div class="hl-times-slot">${hlTimesMarkup(data)}</div>
    <div class="hl-quick">${hlTile('book', 'المصحف', 'hlOpenMushaf()')}${hlTile('clock', 'مواقيت الصلاة', 'prayerHome()')}${hlTile('compass', 'القبلة', 'openQibla()')}<span class="hl-smart-slot"></span></div>
    <div class="hl-reading-slot"></div>
    <div class="hl-rest"></div>
    ${hlHead('المميزات')}
    <div class="hl-grid">${hlTile('fajr', 'صحبة الفجر', "fajrHome('home')", 'جديد')}${hlTile('chart', 'ختمتي', 'khatmaHome()')}${hlTile('note', 'وردي اليومي', 'wardHome()')}${hlTile('beads', 'المسبحة', 'sebhaHome()')}${typeof challengeHome === 'function' ? hlTile('trophy', 'تحدّي مصحفي', 'challengeHome()') : ''}${typeof liveBroadcastHome === 'function' ? hlTile('live', 'البث المباشر', 'liveBroadcastHome()') : ''}</div>
    ${hlHead('علم وأدوات')}
    <div class="hl-grid">${typeof storiesHome === 'function' ? hlTile('scroll', 'قصص', 'storiesHome()') : ''}${typeof openMuslimLibrary === 'function' ? hlTile('book', 'صحيح مسلم', 'openMuslimLibrary(true)') : ''}${hlTile('bookmark', 'مكتبتي', 'libraryHome()')}${hlTile('heart', 'الأذكار', 'duaHome()')}${hlTile('grid', 'ويدجت الشاشة', 'hlWidgets()')}${typeof openPrayerSettings === 'function' ? hlTile('settings', 'إعدادات الصلاة', 'openPrayerSettings()') : ''}</div>
    <div class="hl-recitation-slot"></div>
    <div class="hl-dua-slot"></div>
    <div class="hl-charity-slot"></div>
    <div class="hl-footer-slot"></div>`;
  const put = (slot, el, head) => { const s = frag.querySelector(slot); if (!s) return; if (!el) { s.remove(); return } if (head) s.insertAdjacentHTML('beforebegin', head); s.replaceWith(el) };
  const restBox = frag.querySelector('.hl-rest'); rest.forEach(el => restBox.append(el)); if (!rest.length) restBox.remove();
  if (smart) { smart.classList.add('hl-tile', 'hl-smart'); put('.hl-smart-slot', smart) } else put('.hl-smart-slot', hlNode(hlTile('sun', 'أذكار الصباح', "duaHome('morning')")));
  // Big cards become quiet rows on the page background.
  let readingRow = null;
  if (reading) {
    const resume = !!localStorage.lastPage, title = reading.querySelector('h2')?.textContent || '', meta = reading.querySelector('p')?.textContent.replace(/\s+/g, ' ').trim() || '';
    const go = reading.querySelector('.hero-continue')?.getAttribute('onclick') || 'hlOpenMushaf()';
    readingRow = hlNode(`<div class="hl-list">${hlRow('book', resume ? 'تابع القراءة' : 'ابدأ القراءة', esc(title + (meta ? ' · ' + meta : '')), go)}</div>`)
  }
  put('.hl-reading-slot', readingRow);
  put('.hl-recitation-slot', recitation ? hlNode(`<div class="hl-list">${hlRow('headphones', 'التلاوة الصوتية', 'اختر قارئك، واستمع مع المصحف', 'openHomeRecitation()')}${charity ? hlRow('charity', 'باب الخير', 'أقسام إحسان ومشاريعه وأوقافه، في مكان واحد', 'charityHome()') : ''}</div>`) : null, hlHead('استماع وعطاء'));
  put('.hl-dua-slot', dua, hlHead('دعاء من القرآن'));
  put('.hl-charity-slot', recitation ? null : (charity ? hlNode(`<div class="hl-list">${hlRow('charity', 'باب الخير', 'أقسام إحسان ومشاريعه وأوقافه، في مكان واحد', 'charityHome()')}</div>`) : null), recitation ? '' : hlHead('باب الخير'));
  put('.hl-footer-slot', footer);
  fajr?.remove(); challenge?.remove(); reading?.remove();
  // the recitation card stays (hidden) so its player can still open from it
  if (recitation) { recitation.classList.add('hl-hidden'); frag.append(recitation) } if (charity) charity.remove();
  keep.forEach(el => { el.classList.add('hl-hidden'); frag.append(el) });
  app.replaceChildren(...frag.childNodes);
  uiLocalize?.(app);
  hlLift();
  hlStart()
}
function hlWidgets() { if (window.AndroidReader?.openWidgets) AndroidReader.openWidgets(); else showSmallNotice('أضف ويدجت مصحفي من الشاشة الرئيسية لجهازك') }

function hlRefresh() {
  if (view !== 'home' || document.hidden) return;
  const data = readPrayerData(), sky = app.querySelector('.hl-sky-slot'), times = app.querySelector('.hl-times-slot');
  const signature = Math.floor(Date.now() / 30000) + '|' + JSON.stringify(data?.settings?.city || '') + '|' + (data?.days?.[0]?.fajr || 0);
  if (!sky || sky.dataset.sig === signature) return;
  sky.dataset.sig = signature;
  sky.innerHTML = hlSkyMarkup(data);
  if (times) times.innerHTML = hlTimesMarkup(data);
  uiLocalize?.(sky); if (times) uiLocalize?.(times);
  hlLift()
}
// The sky runs up behind the header and the status bar, so the top of Home is one scene.
function hlLift() {
  const slot = app.querySelector('.hl-sky-slot'); if (!slot || view !== 'home') { document.body.classList.remove('hl-sky-on'); return }
  slot.style.marginTop = '0px';
  const top = slot.getBoundingClientRect().top + scrollY;
  slot.style.setProperty('--hl-lift', top + 'px');
  slot.style.marginTop = -top + 'px';
  const phase = slot.querySelector('.hl-sky')?.classList;
  document.body.dataset.hlSky = ['night', 'dawn', 'dusk', 'afternoon'].find(k => phase?.contains(k)) || 'day';
  document.body.classList.add('hl-sky-on')
}
function hlStart() { clearInterval(hlTimer); hlTimer = setInterval(hlRefresh, 15000) }

const hlPreviousEnter = enterSection;
enterSection = function (...args) { document.body.classList.remove('hl-sky-on'); return hlPreviousEnter.apply(this, args) };
addEventListener('resize', () => { if (view === 'home') hlLift() });
const hlPreviousHome = home;
home = function (...args) { const r = hlPreviousHome.apply(this, args); try { homeLayout() } catch (e) { console.error(e) } return r };
if (typeof renderHomeWeather === 'function') {
  const hlPreviousWeather = renderHomeWeather;
  renderHomeWeather = function (...args) { const r = hlPreviousWeather.apply(this, args); const sky = app.querySelector('.hl-sky-slot'); if (sky) { sky.dataset.sig = ''; hlRefresh() } return r };
}
const hlPreviousPrayerChange = window.onPrayerNativeChanged;
window.onPrayerNativeChanged = function (...args) { const r = typeof hlPreviousPrayerChange === 'function' ? hlPreviousPrayerChange.apply(this, args) : undefined; const sky = app.querySelector('.hl-sky-slot'); if (sky) { sky.dataset.sig = ''; hlRefresh() } return r };
document.addEventListener('visibilitychange', () => { const sky = app.querySelector('.hl-sky-slot'); if (sky && !document.hidden) { sky.dataset.sig = ''; hlRefresh() } });
if (view === 'home') homeLayout();
