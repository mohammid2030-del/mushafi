'use strict';
/* التلاوة الصوتية: صفحة مرتبة (القراء · السور · تنزيلاتي · الحفظ والتكرار) ومتابعة الاستماع */
iconPaths.mic = '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>';
iconPaths.playlist = '<path d="M4 6h11M4 11h11M4 16h7M17 18.5V8l4-1.5"/><circle cx="15" cy="18.5" r="2"/>';
iconPaths.skipNext = '<path d="M6 5l10 7-10 7z"/><path d="M18 5v14"/>';
iconPaths.skipPrev = '<path d="M18 5L8 12l10 7z"/><path d="M6 5v14"/>';
function rhLast() { try { const v = JSON.parse(localStorage.rhLastListen || 'null'); return v && surahCatalog[v.reader] && chapters[v.chapter - 1] ? v : null } catch (e) { return null } }
const rhPrevStart = startFullSurah;
startFullSurah = function (reader, chapter, ...rest) { try { const old = rhLast(); localStorage.rhLastListen = JSON.stringify(old && old.reader === +reader && old.chapter === +chapter && rhResuming ? old : { reader: +reader, chapter: +chapter }) } catch (e) {} return rhPrevStart.call(this, reader, chapter, ...rest) };
// Remember where the listener is, so "continue listening" resumes there even after the app was closed.
let rhResuming = false;
function rhSavePosition() {
  try {
    if (typeof fullSurahActive !== 'function' || !fullSurahActive() || !surahState.reader || !surahState.chapter) return;
    const pos = +surahState.position || 0, dur = +surahState.duration || 0, ended = dur && pos > dur - 4000;
    const verse = +String(surahState.key || '').split(':')[1] || 0;
    localStorage.rhLastListen = JSON.stringify({ reader: +surahState.reader, chapter: +surahState.chapter, position: ended ? 0 : pos, duration: dur, verse: ended ? 0 : verse, at: Date.now() });
  } catch (e) {}
}
setInterval(() => { if (!document.hidden) rhSavePosition() }, 3000);
document.addEventListener('visibilitychange', () => { if (document.hidden) rhSavePosition() });

/* سجل «شغلتها مؤخرًا» */
function rhRecent() { try { return (JSON.parse(localStorage.rhRecent || '[]') || []).filter(v => surahCatalog[v.reader] && chapters[v.chapter - 1]).slice(0, 6) } catch (e) { return [] } }
function rhRemember(reader, chapter) { try { const list = rhRecent().filter(v => !(v.reader === reader && v.chapter === chapter)); list.unshift({ reader, chapter }); localStorage.rhRecent = JSON.stringify(list.slice(0, 6)) } catch (e) {} }
const rhPrevStart2 = startFullSurah;
startFullSurah = function (reader, chapter, ...rest) { rhRadioStop(); rhRemember(+reader, +chapter); return rhPrevStart2.call(this, reader, chapter, ...rest) };
function rhPortrait(id, cls = '') { const img = surahReaderPortraits[id]; return `<span class="rh-face ${cls}">${img ? `<img src="images/${img}.png" alt="" decoding="async" loading="lazy">` : uiIcon('mic')}</span>` }
/* بطاقة متابعة الاستماع المختصرة */
function rhFollowMarkup() {
  const live = typeof fullSurahActive === 'function' && fullSurahActive(), last = live ? { reader: surahState.reader, chapter: surahState.chapter } : rhLast();
  if (!last) return '';
  const pct = live && surahState.duration ? Math.min(100, surahState.position / surahState.duration * 100) : 0, playing = live && ['playing', 'loading'].includes(surahState.status);
  const at = live ? surahState.position : last.position, sub = at > 5000 ? mhT('سورة {0} · الدقيقة {1}', chapters[last.chapter - 1].name_arabic, mediaTime(at)) : mhT('سورة {0}', chapters[last.chapter - 1].name_arabic);
  const pctSaved = !live && last.duration && last.position ? Math.min(100, last.position / last.duration * 100) : 0;
  return `<section class="rh-mini${playing ? ' on' : ''}" aria-label="متابعة الاستماع">
    <button class="rh-mini-main" onclick="${live ? 'fullSurahPlayerHome()' : 'rhResume()'}">${rhPortrait(last.reader, 'round')}<span class="rh-mini-text"><small>${live ? (playing ? 'يُتلى الآن' : 'متوقف مؤقتًا') : 'متابعة الاستماع'}</small><strong>${esc(fullReaderName(last.reader))}</strong><em translate="no" data-rh-sub>${sub}</em><span class="rh-mini-bar"><i style="width:${pct || pctSaved}%"></i></span></span></button>
    <button class="rh-mini-play" aria-label="${playing ? 'إيقاف مؤقت' : 'تشغيل'}" onclick="rhToggle()">${uiIcon(playing ? 'pause' : 'play')}</button></section>`;
}
// Continue from the saved place: the verse where timings exist, otherwise the exact minute.
function rhResume() {
  const l = rhLast(); if (!l) return;
  rhRadioStop();
  const mode = localStorage.surahViewMode === 'read' ? 'read' : 'listen', pos = +l.position || 0;
  const timed = typeof surahHasVerseTimings === 'function' && surahHasVerseTimings(l.reader, l.chapter);
  rhResuming = true;
  try {
    if (timed && l.verse > 1) { startFullSurah(l.reader, l.chapter, mode, l.verse); return }
    startFullSurah(l.reader, l.chapter, mode);
  } finally { rhResuming = false }
  if (pos > 5000) {
    const until = Date.now() + 15000;
    const seek = () => {
      if (!fullSurahActive() || surahState.reader !== l.reader || surahState.chapter !== l.chapter || Date.now() > until) return;
      if (surahState.duration > 0 && ['playing', 'paused'].includes(surahState.status)) { seekFullSurah(Math.max(0, pos - 2000)); return }
      setTimeout(seek, 250);
    };
    setTimeout(seek, 300);
  }
  setTimeout(rhRefresh, 250);
}
function rhToggle() {
  const live = fullSurahActive();
  if (live && ['playing', 'loading'].includes(surahState.status)) pauseFullSurah();
  else if (live && surahState.status === 'paused') { rhRadioStop(); resumeFullSurah() }
  else rhResume()
  setTimeout(rhRefresh, 250);
}
function rhOpenReader(id) { surahReader = id; try { localStorage.surahReader = id } catch (e) {} openHomeRecitation('chapters') }
function rhSection(title, more, body, cls = '') { return `<section class="rh-sec ${cls}"><div class="rh-sec-head"><h2>${title}</h2>${more || ''}</div>${body}</section>` }
/* الإذاعات: بث صوتي مباشر */
const rhRadios = [
  { id: 'sa', title: 'إذاعة القرآن الكريم', place: 'من المملكة العربية السعودية', url: 'https://stream.radiojar.com/0tpy1h0kxtzuv' },
  { id: 'eg', title: 'إذاعة القرآن الكريم', place: 'من القاهرة', url: 'https://stream.radiojar.com/8s5u5tpdtwzuv' }
];
let rhRadio = { id: '', audio: null, status: 'stopped' };
// Android and iOS stream the radio natively (the page cannot follow the stream's http redirect, and it keeps playing with the screen off).
const rhRadioNative = () => typeof window.AndroidReader?.radioPlay === 'function';
function rhRadioStop() {
  if (rhRadio.audio) { try { rhRadio.audio.pause(); rhRadio.audio.removeAttribute('src'); rhRadio.audio.load() } catch (e) {} }
  if (rhRadio.id && rhRadioNative()) { try { AndroidReader.radioStop() } catch (e) {} }
  rhRadio = { id: '', audio: null, status: 'stopped' }; rhPaintRadios()
}
function rhRadioFailed() { showSmallNotice('تعذر تشغيل الإذاعة، تحقق من الاتصال بالإنترنت') }
window.onNativeRadio = function (state) {
  if (!state || !rhRadioNative()) return;
  if (state.status === 'error') { if (rhRadio.id) { rhRadio = { id: '', audio: null, status: 'stopped' }; rhPaintRadios(); rhRadioFailed() } return }
  if (state.status === 'stopped' || !state.id) { if (rhRadio.id) { rhRadio = { id: '', audio: null, status: 'stopped' }; rhPaintRadios() } return }
  rhRadio = { id: state.id, audio: null, status: state.status === 'playing' ? 'playing' : 'loading' }; rhPaintRadios()
};
function rhRadioToggle(id) {
  if (rhRadio.id === id) { rhRadioStop(); return }
  rhRadioStop();
  const st = rhRadios.find(r => r.id === id); if (!st) return;
  if (typeof fullSurahActive === 'function' && fullSurahActive() && ['playing', 'loading', 'paused'].includes(surahState.status)) { try { stopFullSurah() } catch (e) { pauseFullSurah() } }
  try { if (['playing', 'loading'].includes(inlineVerse.status)) pauseInlineVerse() } catch (e) {}
  if (rhRadioNative()) {
    rhRadio = { id, audio: null, status: 'loading' };
    try { AndroidReader.radioPlay(st.id, st.url, st.title, st.place) } catch (e) { rhRadio = { id: '', audio: null, status: 'stopped' }; rhRadioFailed() }
    rhPaintRadios(); setTimeout(rhRefresh, 200); return
  }
  const audio = new Audio(); audio.preload = 'none'; audio.src = st.url;
  rhRadio = { id, audio, status: 'loading' };
  audio.addEventListener('playing', () => { if (rhRadio.audio === audio) { rhRadio.status = 'playing'; rhPaintRadios() } });
  audio.addEventListener('waiting', () => { if (rhRadio.audio === audio) { rhRadio.status = 'loading'; rhPaintRadios() } });
  audio.addEventListener('pause', () => { if (rhRadio.audio === audio) rhRadioStop() });
  audio.addEventListener('error', () => { if (rhRadio.audio === audio) { rhRadioStop(); rhRadioFailed() } });
  try { if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: st.title, artist: st.place, album: 'مصحفي' }) } catch (e) {}
  audio.play().catch(() => { if (rhRadio.audio === audio) { rhRadioStop(); rhRadioFailed() } });
  rhPaintRadios(); setTimeout(rhRefresh, 200);
}
// Reopening the app while a station plays: show it as playing.
try { if (rhRadioNative()) { const s = JSON.parse(AndroidReader.radioSnapshot() || '{}'); if (s.id && s.status !== 'stopped') rhRadio = { id: s.id, audio: null, status: s.status === 'playing' ? 'playing' : 'loading' } } } catch (e) {}
function rhRadioCard(r) {
  const on = rhRadio.id === r.id, label = on ? (rhRadio.status === 'playing' ? 'إيقاف الاستماع' : 'جارٍ الاتصال بالبث…') : 'استماع مباشر';
  return `<article class="rh-radio${on ? ' on' : ''}" data-radio="${r.id}"><span class="rh-radio-art" aria-hidden="true">${uiIcon('radio')}</span><strong>${r.title}</strong><small>${r.place}</small><button onclick="rhRadioToggle('${r.id}')"><i class="rh-dot"></i>${uiIcon(on && rhRadio.status === 'playing' ? 'pause' : 'radio')}<span>${label}</span></button></article>`;
}
function rhPaintRadios() { const box = document.getElementById('rh-radios'); if (box) { box.innerHTML = rhRadios.map(rhRadioCard).join(''); try { uiLocalize(box) } catch (e) {} } }
iconPaths.radio = '<rect x="3" y="8" width="18" height="12" rx="3"/><path d="m7 8 9-5"/><circle cx="15.5" cy="14" r="2.5"/><path d="M6.5 12h4M6.5 16h4"/>';
iconPaths.chevron = '<path d="m15 6-6 6 6 6"/>';
function rhLiveCard(key) {
  const c = liveBroadcastChannels[key];
  return `<button class="rh-live" onclick="openLiveBroadcast('${key}')" aria-label="${c.title}"><span class="rh-live-art photo ${key}"><b class="rh-live-tag"><i class="rh-dot"></i>مباشر</b></span><span class="rh-live-text"><strong>${c.place}</strong><small>${c.channel}</small></span></button>`;
}
function recitationHub() {
  enterSection('recitation', 'n-player');
  const readers = audioReaderOrder.filter(id => surahCatalog[id]);
  const recent = rhRecent();
  app.innerHTML = sectionHeading('المشغل', 'القراء والسور، البث المباشر والإذاعات', '') + `<div class="rh-hub">
    <div id="rh-follow">${rhFollowMarkup()}</div>
    ${rhSection('القراء', `<button class="rh-more" onclick="openHomeRecitation('readers')">عرض الكل${uiIcon('chevron')}</button>`, `<div class="rh-rail">${readers.map(id => `<button class="rh-reader" onclick="rhOpenReader(${id})">${rhPortrait(id)}<strong>${esc(surahCatalog[id].name)}</strong></button>`).join('')}</div>`)}
    ${rhSection('بث مباشر', '', `<div class="rh-rail rh-rail-wide">${rhLiveCard('makkah')}${rhLiveCard('madinah')}</div>`)}
    ${rhSection('إذاعات صوتية', '', `<div class="rh-rail rh-rail-wide" id="rh-radios">${rhRadios.map(rhRadioCard).join('')}</div>`)}
    <div class="rh-tools">
      <button onclick="openHomeRecitation('chapters')">${uiIcon('playlist')}<span>السور</span></button>
      <button onclick="rhDownloads()">${uiIcon('download')}<span>تنزيلاتي</span></button>
      <button onclick="rhMemorize()">${uiIcon('repeat')}<span>الحفظ والتكرار</span></button>
    </div>
    ${recent.length ? rhSection('شغلتها مؤخرًا', '', `<div class="rh-recent">${recent.map(v => `<button onclick="startFullSurah(${v.reader},${v.chapter},'listen')">${rhPortrait(v.reader, 'round sm')}<span><strong>سورة ${chapters[v.chapter - 1].name_arabic}</strong><small>${esc(fullReaderName(v.reader))}</small></span>${uiIcon('play')}</button>`).join('')}</div>`) : ''}
  </div>`;
  try { uiLocalize(app) } catch (e) {}
  revealSection();
  if (!readers.length && typeof surahReady !== 'undefined') surahReady.then(() => { if (view === 'recitation' && Object.keys(surahCatalog).length) recitationHub() }).catch(() => {});
}
function rhRefresh() { const box = document.getElementById('rh-follow'); if (view === 'recitation' && box) { box.innerHTML = rhFollowMarkup(); try { uiLocalize(box) } catch (e) {} } }
const rhPrevUpdate = updateFullSurahUI;
updateFullSurahUI = function (...a) { const r = rhPrevUpdate.apply(this, a); if (view === 'recitation') { const bar = document.querySelector('#rh-follow .rh-mini-bar>i'); if (bar && surahState.duration) bar.style.width = Math.min(100, surahState.position / surahState.duration * 100) + '%'; const sub = document.querySelector('#rh-follow [data-rh-sub]'); if (sub && fullSurahActive() && surahState.position) sub.textContent = mhT('سورة {0} · الدقيقة {1}', chapters[surahState.chapter - 1].name_arabic, mediaTime(surahState.position)); if (!rhUpdating) { rhUpdating = true; setTimeout(() => { rhUpdating = false; const box = document.querySelector('#rh-follow .rh-mini'); const want = fullSurahActive() && ['playing', 'loading'].includes(surahState.status); if (box && box.classList.contains('on') !== want) rhRefresh(); else if (!box && fullSurahActive()) rhRefresh() }, 400) } } return r };
let rhUpdating = false;
/* الحفظ والتكرار: مشغل الآيات مع خيار تكرار الآية، من آخر موضع قراءة */
function rhMemorize() { let key = '1:1'; try { const last = JSON.parse(localStorage.last || 'null'); if (last && chapters[last.c - 1]) key = last.c + ':' + (last.v || 1) } catch (e) {} if (typeof standaloneAudioEntry === 'function') standaloneAudioEntry(key); else openAudio(key) }
/* تنزيلاتي: السور كاملة للاستماع دون إنترنت (أندرويد وآيفون) */
let rhDl = { reader: 0, chapter: 0, received: 0, total: 0 };
const rhCanDownload = () => typeof window.AndroidReader?.surahDownload === 'function';
function rhDownloadedSet() { try { return new Set(JSON.parse(window.AndroidReader?.surahDownloadedList?.() || '[]')) } catch (e) { return new Set() } }
function rhIsDownloaded(r, c) { return rhDownloadedSet().has(r + ':' + c) }
function rhMb(b) { return (b / 1048576).toFixed(1) }
function rhDownloadCard(r, c) {
  if (!rhCanDownload()) return '';
  const busy = rhDl.reader === r && rhDl.chapter === c, done = !busy && rhIsDownloaded(r, c), pct = busy && rhDl.total ? Math.floor(rhDl.received / rhDl.total * 100) : 0;
  if (done) return `<div class="rh-dl-card done" data-rh-dl>${uiIcon('check')}<span><strong>السورة محفوظة على جهازك</strong><small>تُشغَّل دون إنترنت</small></span><button class="rh-dl-del" onclick="rhDeleteSurah(${r},${c})">حذف</button></div>`;
  if (busy) return `<div class="rh-dl-card" data-rh-dl>${uiIcon('download')}<span><strong>جارٍ تنزيل السورة… <b translate="no">${uiLocale() === 'ar' ? ar(pct) + '٪' : pct + '%'}</b></strong><small translate="no" dir="ltr" class="rh-dl-mb">${rhDl.total ? rhMb(rhDl.received) + ' / ' + rhMb(rhDl.total) + ' MB' : ''}</small><i class="rh-dl-bar"><i style="width:${pct}%"></i></i></span><button class="rh-dl-del" onclick="AndroidReader.surahDownloadCancel()">إلغاء</button></div>`;
  return `<button class="rh-dl-card" data-rh-dl onclick="rhDownloadSurah(${r},${c})">${uiIcon('download')}<span><strong>تنزيل السورة</strong><small>للاستماع دون إنترنت · يُفضّل استخدام Wi-Fi</small></span>${uiIcon('arrow')}</button>`;
}
function rhDownloadSurah(r, c) { if (rhDl.reader) { showSmallNotice('يوجد تنزيل قائم، انتظر حتى يكتمل'); return } rhDl = { reader: r, chapter: c, received: 0, total: 0 }; AndroidReader.surahDownload(r, c); rhPaintDownloads() }
function rhDeleteSurah(r, c) { AndroidReader.surahDownloadDelete(r, c) }
function rhPaintDownloads() {
  document.querySelectorAll('[data-rh-dl]').forEach(el => { const r = +el.closest('[data-rh-r]')?.dataset.rhR || homeRecitationSession?.reader, c = +el.closest('[data-rh-c]')?.dataset.rhC || homeRecitationSession?.chapter; if (!r || !c) return; el.outerHTML = rhDownloadCard(r, c) });
  if (view === 'recitation-downloads') rhDownloads(true);
  try { document.querySelectorAll('[data-rh-dl]').forEach(el => uiLocalize(el)) } catch (e) {}
}
window.onSurahDownload = function (e) {
  if (!e) return;
  if (e.status === 'progress') { rhDl = { reader: e.reader, chapter: e.chapter, received: +e.received || 0, total: +e.total || 0 }; const card = document.querySelector('[data-rh-dl] .rh-dl-bar>i'); if (card && rhDl.total) { const pct = Math.floor(rhDl.received / rhDl.total * 100); card.style.width = pct + '%'; const b = document.querySelector('[data-rh-dl] strong b'); if (b) b.textContent = uiLocale() === 'ar' ? ar(pct) + '٪' : pct + '%'; const sm = document.querySelector('[data-rh-dl] .rh-dl-mb'); if (sm) sm.textContent = rhMb(rhDl.received) + ' / ' + rhMb(rhDl.total) + ' MB' } else rhPaintDownloads(); return }
  if (e.status === 'busy') { showSmallNotice('يوجد تنزيل قائم، انتظر حتى يكتمل'); return }
  rhDl = { reader: 0, chapter: 0, received: 0, total: 0 };
  if (e.status === 'done') showSmallNotice('حُفظت سورة ' + (chapters[e.chapter - 1]?.name_arabic || '') + ' للاستماع دون إنترنت');
  else if (e.status === 'error') showSmallNotice('تعذر تنزيل السورة؛ تحقق من الاتصال وحاول مجددًا');
  else if (e.status === 'deleted') showSmallNotice('حُذفت السورة من جهازك');
  rhPaintDownloads();
};
/* بطاقة التنزيل في صفحة السورة، وعلامة المحفوظ في قائمة السور */
const rhPrevRenderHome = renderHomeRecitation;
renderHomeRecitation = function (stage = 'readers', ...rest) {
  const r = rhPrevRenderHome.call(this, stage, ...rest), s = homeRecitationSession; if (!s) return r;
  const body = s.root.querySelector('.home-recitation-body');
  if (stage === 'mode' && body) { body.insertAdjacentHTML('beforeend', `<div data-rh-r="${s.reader}" data-rh-c="${s.chapter}">${rhDownloadCard(s.reader, s.chapter)}</div>`); try { uiLocalize(body) } catch (e) {} }
  if (stage === 'chapters' && body && rhCanDownload()) {
    const mark = () => { const set = rhDownloadedSet(); body.querySelectorAll('[data-home-chapter]').forEach(b => { if (set.has(s.reader + ':' + b.dataset.homeChapter) && !b.querySelector('.rh-saved')) b.querySelector('small')?.insertAdjacentHTML('beforeend', ` <span class="rh-saved">· ${uiTranslate('محفوظة')}</span>`) }) };
    mark(); body.querySelector('input')?.addEventListener('input', () => setTimeout(mark, 0));
  }
  return r;
};
function rhDownloads(keepScroll) {
  const y = scrollY; enterSection('recitation-downloads', 'n-player');
  const set = rhDownloadedSet(), rows = [...set].map(k => k.split(':').map(Number)).filter(([r, c]) => surahCatalog[r] && chapters[c - 1]).sort((a, b) => a[1] - b[1] || a[0] - b[0])
    .map(([r, c]) => `<div class="rh-dl-row"><button class="rh-dl-play" onclick="startFullSurah(${r},${c},'listen')"><span class="azkar-category-icon">${uiIcon('play')}</span><span><strong>سورة ${chapters[c - 1].name_arabic}</strong><small>${esc(fullReaderName(r))}</small></span></button><button class="rh-dl-x" aria-label="حذف" onclick="rhDeleteSurah(${r},${c})">${uiIcon('trash')}</button></div>`).join('');
  const busy = rhDl.reader ? `<div data-rh-r="${rhDl.reader}" data-rh-c="${rhDl.chapter}"><p class="az-note">سورة ${chapters[rhDl.chapter - 1].name_arabic} · ${esc(fullReaderName(rhDl.reader))}</p>${rhDownloadCard(rhDl.reader, rhDl.chapter)}</div>` : '';
  app.innerHTML = sectionHeading('تنزيلاتي', 'التلاوات المحفوظة على جهازك للاستماع دون إنترنت', 'recitationHub()') + `<div class="mushaf-hub rh-hub">${busy}
    ${rows ? `<div class="azkar-category-list rh-downloads">${rows}</div>` : (!busy ? `<div class="rh-empty-box">${uiIcon('download')}<strong>لا توجد تنزيلات بعد</strong><p>اختر القارئ ثم السورة، واضغط «تنزيل السورة» لتستمع إليها دون إنترنت.</p></div>` : '')}
    ${rhCanDownload() ? `<button class="primary rh-dl-add" onclick="openHomeRecitation('chapters')">${uiIcon('download')} تنزيل سورة</button>` : ''}</div>`;
  try { uiLocalize(app) } catch (e) {}
  if (keepScroll) window.scrollTo(0, y); else revealSection();
}
/* الرجوع إلى صفحة التلاوة بعد اختيار القارئ أو السورة أو من المشغل */
const rhPrevClose = closeHomeRecitation;
closeHomeRecitation = function (...a) { const onHub = !!app.querySelector('.rh-hub'); const r = rhPrevClose.apply(this, a); if (onHub && app.querySelector('.rh-hub')) { view = 'recitation'; try { active('n-player') } catch (e) {} rhRefresh() } return r };
const rhPrevPlayer = fullSurahPlayerHome;
fullSurahPlayerHome = function (...a) { const fromHub = view === 'recitation' || !!app.querySelector('.rh-hub'); const r = rhPrevPlayer.apply(this, a); if (fromHub) { const back = document.getElementById('listen-back'); if (back) back.onclick = recitationHub } return r };

if (typeof openLiveBroadcast === 'function') { const rhPrevLive = openLiveBroadcast; openLiveBroadcast = function (...a) { rhRadioStop(); return rhPrevLive.apply(this, a) } }
