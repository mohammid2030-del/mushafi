// مصحفي على Android TV: واجهة الشاشة الكبيرة (نفس تصميم Apple TV) مع التنقل بالريموت.
// تعمل فقط على أجهزة التلفزيون (AndroidReader.isTv) أو عند فتح الصفحة بـ ?tv=1.
const TV_ON = (() => { try { return !!(window.AndroidReader?.isTv?.()) || /[?&]tv=1/.test(location.search) } catch (e) { return false } })();
const TV = { tab: 'home', last: null, timer: 0 };
const TV_TABS = [['home', 'الرئيسية'], ['mushaf', 'المصحف'], ['reciters', 'القرّاء'], ['live', 'البث المباشر'], ['settings', 'الإعدادات']];
const TV_CITIES = [
  ['الرياض', 'السعودية', 24.7136, 46.6753, 'Asia/Riyadh'], ['مكة المكرمة', 'السعودية', 21.4225, 39.8262, 'Asia/Riyadh'],
  ['المدينة المنورة', 'السعودية', 24.4686, 39.6142, 'Asia/Riyadh'], ['جدة', 'السعودية', 21.4858, 39.1925, 'Asia/Riyadh'],
  ['الدمام', 'السعودية', 26.4207, 50.0888, 'Asia/Riyadh'], ['الخبر', 'السعودية', 26.2172, 50.1971, 'Asia/Riyadh'],
  ['الأحساء', 'السعودية', 25.3647, 49.5856, 'Asia/Riyadh'], ['الطائف', 'السعودية', 21.2703, 40.4158, 'Asia/Riyadh'],
  ['بريدة', 'السعودية', 26.326, 43.975, 'Asia/Riyadh'], ['تبوك', 'السعودية', 28.3838, 36.555, 'Asia/Riyadh'],
  ['أبها', 'السعودية', 18.2164, 42.5053, 'Asia/Riyadh'], ['حائل', 'السعودية', 27.5114, 41.7208, 'Asia/Riyadh'],
  ['جازان', 'السعودية', 16.8892, 42.5511, 'Asia/Riyadh'], ['نجران', 'السعودية', 17.4924, 44.1277, 'Asia/Riyadh'],
  ['الكويت', 'الكويت', 29.3759, 47.9774, 'Asia/Kuwait'], ['الدوحة', 'قطر', 25.2854, 51.531, 'Asia/Qatar'],
  ['المنامة', 'البحرين', 26.2285, 50.586, 'Asia/Bahrain'], ['أبوظبي', 'الإمارات', 24.4539, 54.3773, 'Asia/Dubai'],
  ['دبي', 'الإمارات', 25.2048, 55.2708, 'Asia/Dubai'], ['مسقط', 'عُمان', 23.588, 58.3829, 'Asia/Muscat'],
  ['عمّان', 'الأردن', 31.9454, 35.9284, 'Asia/Amman'], ['القاهرة', 'مصر', 30.0444, 31.2357, 'Africa/Cairo'],
  ['إسطنبول', 'تركيا', 41.0082, 28.9784, 'Europe/Istanbul'], ['لندن', 'المملكة المتحدة', 51.5074, -0.1278, 'Europe/London']
];
const tvIcons = {
  book: '<path d="M3 5.5C5.5 4 8.5 4 12 6c3.5-2 6.5-2 9-.5V19c-2.5-1.5-5.5-1.5-9 .5-3.5-2-6.5-2-9-.5z"/><path d="M12 6v13.5"/>',
  head: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="7" rx="2"/><rect x="17" y="14" width="4" height="7" rx="2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  star: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  radio: '<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5"/>',
  books: '<path d="M4 4h4v16H4zM10 4h4v16h-4zM16 5l3.5-1 2.5 15.5-3.5 1z"/>',
  play: '<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
  next: '<path d="M11 6v12L2.5 12zM21.5 6v12L13 12z" fill="currentColor" stroke="none"/>',
  prev: '<path d="M13 6v12l8.5-6zM2.5 6v12L11 12z" fill="currentColor" stroke="none"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>'
};
const tvI = k => `<svg class="tv-i" viewBox="0 0 24 24">${tvIcons[k]}</svg>`;
const tvNum = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
const tvEsc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- data ----------
function tvLastPage() { return Math.max(1, Math.min(604, +localStorage.lastPage || 1)) }
function tvPageInfo(p) { const d = mushafPages[p]; const [s, v] = d.keys[0].split(':').map(Number); return { s, v, juz: d.juz } }
function tvPrayer() {
  try {
    const data = readPrayerData(), zone = data.settings?.timezone || 'Asia/Riyadh', now = Date.now();
    const names = { fajr: 'الفجر', sunrise: 'الشروق', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
    const day = (data.days || []).find(d => d.fajr <= now && now < d.fajr + 864e5) || (data.days || [])[1] || {};
    const today = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].filter(k => day[k]).map(k => ({ key: k, name: names[k], time: day[k] }));
    const next = prayerTimeline(data).find(p => p.time > now);
    return { zone, city: data.settings?.city || 'الرياض', today, next: next && { name: names[next.key], time: next.time } };
  } catch (e) { return { zone: 'Asia/Riyadh', city: 'الرياض', today: [], next: null } }
}
function tvClock(t, zone) { try { return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: zone }).format(t).replace(/\s?[AP]M/, '') } catch (e) { return '' } }
function tvIn(t) { const m = Math.max(0, Math.round((t - Date.now()) / 60000)), h = Math.floor(m / 60); return h ? `بعد ${tvNum(h)} س و${tvNum(m % 60)} د` : `بعد ${tvNum(m)} دقيقة` }
function tvDates(zone) {
  const d = new Date();
  const g = new Intl.DateTimeFormat('ar', { weekday: 'long', day: 'numeric', month: 'long', timeZone: zone }).format(d);
  let h = ''; try { h = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric', timeZone: zone }).format(d) } catch (e) {}
  return g + (h ? ' · ' + h : '');
}
let tvVerses = null;
fetch('widget-daily-verses.json').then(r => r.json()).then(d => { tvVerses = d; if (TV.tab === 'home' && document.getElementById('tv')) tvRender() }).catch(() => {});
function tvVerseOfDay() {
  if (!tvVerses?.order?.length) return { text: 'فَإِنَّ مَعَ ٱلْعُسْرِ يُسْرًا', ref: 'الشرح · ٥' };
  const key = tvVerses.order[Math.floor(Date.now() / 864e5) % tvVerses.order.length];
  return { text: tvVerses.ar[key], ref: `${tvVerses.surah[key]} · ${tvNum(+key.split(':')[1])}` };
}
function tvReciters() {
  const order = ['7', '2', '3', '133', '6', '1001', '1002', '1003', '1004', '1005'];
  const ids = Object.keys(surahCatalog || {});
  return [...order.filter(i => ids.includes(i)), ...ids.filter(i => !order.includes(i))].map(id => ({ id, name: surahCatalog[id].name, style: String(surahCatalog[id].style || '').replace(' · MP3Quran', '') }));
}
function tvFavReciter() { return String(localStorage.tvReciter || localStorage.surahReader || 7) }
function tvSurahPlaying() { return ['playing', 'loading', 'buffering'].includes(surahState?.status) }
function tvSurahActive() { return surahState && surahState.status && surahState.status !== 'stopped' }

// ---------- shell ----------
function tvBoot() {
  if (document.getElementById('tv')) return;
  // The big screen is watched in a dim room: night theme unless the user chose otherwise.
  try { if (!localStorage.themeMode && typeof setAppTheme === 'function') setAppTheme('dark') } catch (e) {}
  document.documentElement.classList.add('tv');
  document.body.classList.add('tv-mode');
  const root = document.createElement('div');
  root.id = 'tv';
  root.innerHTML = `<div class="tv-top"><div class="tv-brand"><img src="images/mushafi-official-icon.png" alt=""><b>مصحفي</b></div>
    <div class="tv-tabs">${TV_TABS.map(([k, t]) => `<button class="tvf tv-tab" data-tab="${k}">${t}</button>`).join('')}</div>
    <div class="tv-meta"><span class="tv-city"></span><i></i><b class="tv-time"></b></div></div><div class="tv-main"></div>`;
  document.body.append(root);
  root.querySelectorAll('.tv-tab').forEach(b => b.onclick = () => tvGo(b.dataset.tab));
  tvGo(new URLSearchParams(location.search).get('tvtab') || 'home');
  clearInterval(TV.timer);
  TV.timer = setInterval(tvTick, 1000);
  window.addEventListener('keydown', tvKey, true);
}
function tvGo(tab) {
  TV.tab = tab;
  document.querySelectorAll('.tv-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  tvRender();
  const first = document.querySelector('.tv-main .tvf');
  (first || document.querySelector(`.tv-tab[data-tab="${tab}"]`))?.focus({ preventScroll: true });
}
function tvRender() {
  const main = document.querySelector('.tv-main'); if (!main) return;
  const focusedId = document.activeElement?.dataset?.tvid;
  main.innerHTML = ({ home: tvHome, mushaf: tvMushaf, reciters: tvRecitersView, live: tvLive, settings: tvSettings }[TV.tab] || tvHome)();
  main.scrollTop = 0;
  if (focusedId) main.querySelector(`[data-tvid="${focusedId}"]`)?.focus({ preventScroll: true });
}
function tvTick() {
  const p = tvPrayer();
  const city = document.querySelector('.tv-city'), time = document.querySelector('.tv-time');
  if (city) city.textContent = p.city;
  if (time) time.textContent = tvClock(Date.now(), p.zone);
  const sig = JSON.stringify([surahState?.status, surahState?.chapter, surahState?.reader, surahState?.key, rhRadio?.id, rhRadio?.status, p.next?.time]);
  if (sig !== TV.last && document.getElementById('tv')?.offsetParent !== null && view !== 'reader') {
    TV.last = sig;
    if (TV.tab !== 'mushaf' && TV.tab !== 'settings') tvRender();
  }
  const bar = document.querySelector('.tv-prog i');
  if (bar && surahState?.duration) bar.style.width = Math.min(100, surahState.position / surahState.duration * 100) + '%';
}

// ---------- views ----------
function tvHome() {
  const page = tvLastPage(), info = tvPageInfo(page), ch = chapters[info.s - 1], p = tvPrayer(), vd = tvVerseOfDay();
  const verses = mushafPages[page].keys.slice(0, 3).map(k => { const [s, v] = k.split(':').map(Number); return chapters[s - 1].verses[v - 1].text_uthmani + ` ﴿${tvNum(v)}﴾` }).join(' ');
  const radioOn = rhRadio?.id === 'sa' && rhRadio.status !== 'stopped';
  return `<section class="tv-hero">
    <div class="tv-hero-txt"><span class="tv-eyebrow">${page > 1 ? 'تابع من حيث توقفت' : 'ابدأ رحلتك مع القرآن'}</span>
      <h1>سورة ${tvEsc(ch.name_arabic)}</h1><p class="tv-info">الصفحة ${tvNum(page)} · الجزء ${tvNum(info.juz)}</p>
      <div class="tv-acts"><button class="tvf tv-btn primary" data-tvid="read" onclick="tvOpenPage(${page})">${tvI('book')}تابع القراءة</button>
      <button class="tvf tv-btn" data-tvid="listen" onclick="tvListenPage(${page})">${tvI('head')}استمع للصفحة</button></div></div>
    <div class="tv-leaf"><div class="tv-leaf-frame"><span class="tv-leaf-name">سورة ${tvEsc(ch.name_arabic)}</span><p>${tvEsc(verses)}</p><small>${tvNum(page)}</small></div></div>
  </section>
  <section><div class="tv-sec"><h2>يومك مع مصحفي</h2><small>${tvDates(p.zone)}</small></div>
    <div class="tv-tiles">
      <button class="tvf tv-tile" data-tvid="t-prayer" onclick="tvGo('settings')"><span class="hd"><em>الصلاة القادمة</em>${tvI('clock')}</span><b>${p.next ? p.next.name + ' ' + tvClock(p.next.time, p.zone) : '—'}</b><small>${p.next ? tvIn(p.next.time) : ''}</small></button>
      <button class="tvf tv-tile" data-tvid="t-verse"><span class="hd"><em>آية اليوم</em>${tvI('star')}</span><b class="q">﴿${tvEsc(vd.text)}﴾</b><small>${tvEsc(vd.ref)}</small></button>
      <button class="tvf tv-tile" data-tvid="t-radio" onclick="rhRadioToggle('sa');setTimeout(tvRender,300)"><span class="hd"><em>إذاعة القرآن الكريم</em>${tvI('radio')}</span><b>${radioOn ? 'تستمع الآن' : 'استمع مباشرة'}</b><small>من المملكة العربية السعودية</small></button>
      <button class="tvf tv-tile" data-tvid="t-mushaf" onclick="tvGo('mushaf')"><span class="hd"><em>المصحف كاملًا</em>${tvI('books')}</span><b>١١٤ سورة</b><small>تصفّح السور وابدأ القراءة</small></button>
    </div></section>
  <section><div class="tv-sec"><h2>مواقيت الصلاة</h2><small>${tvEsc(p.city)}</small></div>
    <div class="tv-prayers">${p.today.map(x => `<div class="${p.next && x.time === p.next.time ? 'next' : x.time < Date.now() ? 'past' : ''}"><span>${x.name}</span><b>${tvClock(x.time, p.zone)}</b></div>`).join('')}</div></section>`;
}
function tvMushaf() {
  return `<section class="tv-head"><div><span class="tv-eyebrow">المصحف الشريف</span><h1 class="sm">سور القرآن الكريم</h1><p class="tv-info">١١٤ سورة · ٦٠٤ صفحة برواية حفص عن عاصم</p></div>
    <button class="tvf tv-btn primary" data-tvid="resume" onclick="tvOpenPage(${tvLastPage()})">${tvI('bookmark')}تابع من الصفحة ${tvNum(tvLastPage())}</button></section>
    <div class="tv-grid">${chapters.map(c => `<button class="tvf tv-surah" data-tvid="s${c.id}" onclick="tvOpenPage(${c.pages[0]})"><span class="n">${tvNum(c.id)}</span><span><b>${tvEsc(c.name_arabic)}</b><small>${c.revelation_place === 'makkah' ? 'مكية' : 'مدنية'} · ${tvNum(c.verses_count)} آية</small></span></button>`).join('')}</div>`;
}
function tvRecitersView() {
  const list = tvReciters(), active = tvSurahActive(), rid = String(active ? surahState.reader : tvFavReciter());
  const r = list.find(x => x.id === rid) || list[0] || { name: 'مشاري العفاسي', style: '' };
  const ch = chapters[(surahState?.chapter || 1) - 1];
  const key = surahState?.key || '', [ks, kv] = key.split(':').map(Number);
  const verse = active && ks ? chapters[ks - 1]?.verses[kv - 1]?.text_uthmani : '';
  return `<section class="tv-np"><div class="tv-av big">${tvEsc(r.name[0])}</div>
    <div class="tv-np-t"><span class="tv-eyebrow">${active ? (tvSurahPlaying() ? 'يُتلى الآن' : 'متوقف مؤقتًا') : 'ابدأ الاستماع'}</span><h2>${tvEsc(r.name)}</h2>
      <p>${active ? 'سورة ' + tvEsc(ch.name_arabic) + ' · ' + tvEsc(r.style) : 'اختر قارئًا ثم السورة التي تحب سماعها'}</p>
      <div class="tv-acts">${active ? `<button class="tvf tv-btn icon" data-tvid="np-prev" onclick="skipFullSurah(-1)">${tvI('prev')}</button>
        <button class="tvf tv-btn primary" data-tvid="np-toggle" onclick="tvToggleSurah()">${tvI(tvSurahPlaying() ? 'pause' : 'play')}${tvSurahPlaying() ? 'إيقاف مؤقت' : 'تشغيل'}</button>
        <button class="tvf tv-btn icon" data-tvid="np-next" onclick="skipFullSurah(1)">${tvI('next')}</button>`
      : `<button class="tvf tv-btn primary" data-tvid="np-start" onclick="tvPlay('${r.id}',1)">${tvI('play')}استمع للفاتحة</button>`}</div></div>
    ${verse ? `<div class="tv-np-v"><small>الآية ${tvNum(kv)} من ${tvNum(chapters[ks - 1].verses_count)}</small><p>${tvEsc(verse)}</p><div class="tv-prog"><i></i></div></div>` : ''}</section>
  <section><div class="tv-sec"><h2>القرّاء</h2><small>${tvNum(list.length)} قرّاء · تلاوة السورة كاملة</small></div>
    <div class="tv-people">${list.map(x => `<button class="tvf tv-person ${x.id === rid ? 'cur' : ''}" data-tvid="r${x.id}" onclick="tvReciterPage('${x.id}')"><span class="tv-av">${tvEsc(x.name[0])}</span><b>${tvEsc(x.name)}</b><small>${tvEsc(x.style)}</small></button>`).join('')}</div></section>`;
}
function tvReciterPage(id) {
  const r = tvReciters().find(x => x.id === id); if (!r) return;
  TV.tab = 'reciter:' + id;
  const main = document.querySelector('.tv-main');
  main.innerHTML = `<section class="tv-head"><div class="tv-who"><span class="tv-av">${tvEsc(r.name[0])}</span><div><h1 class="sm">${tvEsc(r.name)}</h1><p class="tv-info">${tvEsc(r.style)}</p></div></div>
    <button class="tvf tv-btn" data-tvid="fav" onclick="localStorage.tvReciter='${id}';this.innerHTML='${tvI('check').replace(/'/g, '&#39;')}القارئ المفضّل'">${tvI('star')}${tvFavReciter() === id ? 'القارئ المفضّل' : 'اجعله القارئ المفضّل'}</button></section>
    <div class="tv-grid">${chapters.map(c => `<button class="tvf tv-surah" data-tvid="p${c.id}" onclick="tvPlay('${id}',${c.id});tvGo('reciters')"><span class="n">${tvNum(c.id)}</span><span><b>${tvEsc(c.name_arabic)}</b><small>${tvNum(c.verses_count)} آية</small></span></button>`).join('')}</div>`;
  main.scrollTop = 0;
  main.querySelector('.tvf')?.focus({ preventScroll: true });
}
function tvLive() {
  const f = rhRadios[0], on = id => rhRadio?.id === id && rhRadio.status !== 'stopped';
  return `<section class="tv-feature"><span class="tv-onair"><i></i>${on(f.id) ? 'تستمع الآن' : 'يبث الآن'}</span>
    <div class="tv-eq ${on(f.id) ? 'on' : ''}"><i></i><i></i><i></i><i></i><i></i></div>
    <h2>${tvEsc(f.title)}</h2><p>${tvEsc(f.place)} · على مدار الساعة</p>
    <button class="tvf tv-btn primary" data-tvid="feat" onclick="tvRadio('${f.id}')">${tvI(on(f.id) ? 'pause' : 'play')}${on(f.id) ? 'إيقاف' : 'استمع الآن'}</button></section>
  <section><div class="tv-sec"><h2>كل الإذاعات</h2><small>${tvNum(rhRadios.length)} إذاعات · بث مباشر على مدار الساعة</small></div>
    <div class="tv-stations">${rhRadios.slice(1).map(r => `<button class="tvf tv-tile st" data-tvid="rad-${r.id}" onclick="tvRadio('${r.id}')"><span class="hd"><em class="live">${on(r.id) ? 'تستمع الآن' : 'مباشر'}</em>${tvI('radio')}</span><b>${tvEsc(r.title)}</b><small>${tvEsc(r.place)}</small></button>`).join('')}</div></section>`;
}
function tvSettings() {
  const p = tvPrayer(), fav = tvFavReciter();
  return `<section><div class="tv-sec"><h2>مدينتك</h2><small>لحساب مواقيت الصلاة · الحالية: ${tvEsc(p.city)}</small></div>
    <div class="tv-grid">${TV_CITIES.map((c, i) => `<button class="tvf tv-surah city" data-tvid="c${i}" onclick="tvCity(${i})"><span><b>${c[0]}</b><small>${c[1]}</small></span>${p.city === c[0] ? tvI('check') : ''}</button>`).join('')}</div></section>
  <section><div class="tv-sec"><h2>القارئ المفضّل</h2><small>يُستخدم عند الاستماع من المصحف</small></div>
    <div class="tv-grid">${tvReciters().map(r => `<button class="tvf tv-surah city" data-tvid="f${r.id}" onclick="localStorage.tvReciter='${r.id}';tvRender()"><span><b>${tvEsc(r.name)}</b></span>${fav === r.id ? tvI('star') : ''}</button>`).join('')}</div></section>
  <section class="tv-about"><img src="images/mushafi-official-icon.png" alt="" onerror="this.remove()"><div><b>مصحفي · Android TV</b><small>مجاني بالكامل وبدون إعلانات · mushafiapp.com</small></div></section>`;
}

// ---------- actions ----------
function tvOpenPage(p) { document.body.classList.add('tv-reading'); showPage(p) }
function tvLeaveReader() { document.body.classList.remove('tv-reading'); view = 'tv'; tvRender(); document.querySelector('.tv-main .tvf')?.focus({ preventScroll: true }) }
function tvPlay(reader, chapter, verse = 0) { if (rhRadio?.id) rhRadioStop(); surahReady.then(() => startFullSurah(+reader, chapter, 'listen', verse)); setTimeout(tvRender, 400) }
function tvToggleSurah() { tvSurahPlaying() ? pauseFullSurah() : resumeFullSurah(); setTimeout(tvRender, 300) }
function tvListenPage(p) { const i = tvPageInfo(p); tvPlay(tvFavReciter(), i.s, i.v > 1 ? i.v : 0) }
function tvRadio(id) { if (tvSurahActive()) stopFullSurah(); rhRadioToggle(id); setTimeout(tvRender, 400) }
function tvCity(i) {
  const c = TV_CITIES[i];
  try { savePrayerConfig({ ...copyPrayerSettings(), city: c[0], latitude: c[2], longitude: c[3], timezone: c[4], confirmed: true, autoMethod: true }) } catch (e) {}
  tvRender();
}

// ---------- remote (D-pad) ----------
function tvCandidates() { return [...document.querySelectorAll(view === 'reader' ? '.tv-none' : '#tv .tvf')].filter(e => e.offsetParent !== null) }
function tvMove(dir) {
  const cur = document.activeElement?.closest?.('.tvf');
  const list = tvCandidates();
  if (!cur || !list.includes(cur)) { list[0]?.focus(); return }
  const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bestScore = Infinity;
  for (const el of list) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2;
    const dx = bx - ax, dy = by - ay;
    const ok = dir === 'left' ? b.right <= a.left + 4 : dir === 'right' ? b.left >= a.right - 4 : dir === 'up' ? b.bottom <= a.top + 4 : b.top >= a.bottom - 4;
    if (!ok) continue;
    const main = dir === 'left' || dir === 'right' ? Math.abs(dx) : Math.abs(dy);
    const cross = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    const score = main + cross * 2.2;
    if (score < bestScore) { bestScore = score; best = el }
  }
  if (best) { best.focus({ preventScroll: true }); best.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); if (best.closest('.tv-top')) document.querySelector('.tv-main').scrollTo({ top: 0, behavior: 'smooth' }) }
}
function tvKey(e) {
  if (!TV_ON) return;
  const k = e.key;
  if (view === 'reader') {
    if (activeSheet) return;
    if (k === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); turnPage(1) }
    else if (k === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); turnPage(-1) }
    else if (k === 'Enter' || k === 'MediaPlayPause' || k === ' ') {
      e.preventDefault(); e.stopImmediatePropagation();
      if (tvSurahActive()) tvToggleSurah(); else tvListenPage(pageNumber);
    }
    return;
  }
  if (activeSheet) return;
  const dirs = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  if (dirs[k]) { e.preventDefault(); e.stopPropagation(); tvMove(dirs[k]); return }
  if (k === 'MediaPlayPause' && tvSurahActive()) { e.preventDefault(); tvToggleSurah() }
}

if (TV_ON) {
  try { localStorage.mushafiWelcomeCompleted = '1'; localStorage.mushafiTourDone = '1' } catch (e) {}
  const tvStart = startMushafi;
  startMushafi = function () { tvStart.apply(this, arguments); tvBoot() };
  // startMushafi may already have run before this file loaded (language ready at once).
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(tvBoot, 0)); else setTimeout(tvBoot, 0);
  const tvBack = handleBack;
  handleBack = function () {
    if (activeSheet) { tvBack(); return }
    if (view === 'reader') { leaveReading?.(); tvLeaveReader(); return }
    if (String(TV.tab).startsWith('reciter:')) { tvGo('reciters'); return }
    if (TV.tab !== 'home') { tvGo('home'); return }
    tvBack();
  };
  const tvShowPage = showPage;
  showPage = function (p, ...rest) { if (view !== 'reader' && !document.body.classList.contains('tv-reading')) document.body.classList.add('tv-reading'); return tvShowPage.call(this, p, ...rest) };
}
