'use strict';
/* التلاوة الصوتية: صفحة مرتبة (القراء · السور · تنزيلاتي · الحفظ والتكرار) ومتابعة الاستماع */
iconPaths.mic = '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>';
iconPaths.playlist = '<path d="M4 6h11M4 11h11M4 16h7M17 18.5V8l4-1.5"/><circle cx="15" cy="18.5" r="2"/>';
iconPaths.skipNext = '<path d="M6 5l10 7-10 7z"/><path d="M18 5v14"/>';
iconPaths.skipPrev = '<path d="M18 5L8 12l10 7z"/><path d="M6 5v14"/>';
function rhLast() { try { const v = JSON.parse(localStorage.rhLastListen || 'null'); return v && surahCatalog[v.reader] && chapters[v.chapter - 1] ? v : null } catch (e) { return null } }
const rhPrevStart = startFullSurah;
startFullSurah = function (reader, chapter, ...rest) { try { localStorage.rhLastListen = JSON.stringify({ reader, chapter }) } catch (e) {} return rhPrevStart.call(this, reader, chapter, ...rest) };
function rhFollowMarkup() {
  const live = typeof fullSurahActive === 'function' && fullSurahActive(), last = live ? { reader: surahState.reader, chapter: surahState.chapter } : rhLast();
  if (!last) return `<button class="mh-follow rh-follow rh-empty" onclick="openHomeRecitation('readers')"><div class="mh-follow-head"><h2>متابعة الاستماع</h2><span class="mh-chip">${uiIcon('headphones')}</span></div><div class="mh-follow-row"><strong>لم تبدأ الاستماع بعد</strong></div><p>اختر قارئك والسورة التي تحب سماعها</p></button>`;
  const pct = live && surahState.duration ? Math.min(100, surahState.position / surahState.duration * 100) : 0, playing = live && ['playing', 'loading'].includes(surahState.status);
  return `<section class="mh-follow rh-follow"><div class="mh-follow-head"><h2>متابعة الاستماع</h2><span class="mh-chip">${live ? (playing ? 'يُتلى الآن' : 'متوقف مؤقتًا') : 'آخر استماع'}</span></div>
    <button class="rh-now" onclick="${live ? 'fullSurahPlayerHome()' : `startFullSurah(${last.reader},${last.chapter},'listen')`}"><strong>سورة ${chapters[last.chapter - 1].name_arabic}</strong><small>${esc(fullReaderName(last.reader))}</small></button>
    <div class="app-progress mh-bar rh-bar"><span style="width:${pct}%"></span></div>
    <div class="rh-controls">
      <button aria-label="الاستماع مع المصحف" onclick="${live ? 'openFullSurahMushaf()' : `startFullSurah(${last.reader},${last.chapter},'mushaf')`}">${uiIcon('book')}</button>
      <button aria-label="السورة التالية" ${last.chapter >= 114 ? 'disabled' : ''} onclick="startFullSurah(${last.reader},${Math.min(114, last.chapter + 1)},'listen');setTimeout(rhRefresh,300)">${uiIcon('skipNext')}</button>
      <button class="rh-play" aria-label="${playing ? 'إيقاف مؤقت' : 'تشغيل'}" onclick="rhToggle()">${uiIcon(playing ? 'pause' : 'play')}</button>
      <button aria-label="السورة السابقة" ${last.chapter <= 1 ? 'disabled' : ''} onclick="startFullSurah(${last.reader},${Math.max(1, last.chapter - 1)},'listen');setTimeout(rhRefresh,300)">${uiIcon('skipPrev')}</button>
      <button aria-label="قائمة السور" onclick="openHomeRecitation('chapters')">${uiIcon('playlist')}</button>
    </div></section>`;
}
function rhToggle() {
  const live = fullSurahActive();
  if (live && ['playing', 'loading'].includes(surahState.status)) pauseFullSurah();
  else if (live && surahState.status === 'paused') resumeFullSurah();
  else { const l = rhLast(); if (l) startFullSurah(l.reader, l.chapter, 'listen') }
  setTimeout(rhRefresh, 250);
}
function recitationHub() {
  enterSection('recitation', 'n-home');
  app.innerHTML = sectionHeading('التلاوة الصوتية', 'استمع إلى القرآن الكريم بصوت قارئك المفضل', 'home()') + `<div class="mushaf-hub rh-hub">
    <div class="mh-grid">
      <button class="mh-card" onclick="openHomeRecitation('readers')"><span class="mh-icon">${uiIcon('mic')}</span><b>القراء</b><small>اختر قارئك المفضل</small></button>
      <button class="mh-card" onclick="openHomeRecitation('chapters')"><span class="mh-icon">${uiIcon('playlist')}</span><b>السور</b><small translate="no">${mhT('{0} سورة للاستماع', uiLocale()==='ar'?ar(114):'114')}</small></button>
      <button class="mh-card" onclick="rhDownloads()"><span class="mh-icon">${uiIcon('download')}</span><b>تنزيلاتي</b><small>استمع دون إنترنت</small></button>
      <button class="mh-card" onclick="rhMemorize()"><span class="mh-icon">${uiIcon('repeat')}</span><b>الحفظ والتكرار</b><small>كرر الآيات للحفظ</small></button>
    </div><div id="rh-follow">${rhFollowMarkup()}</div></div>`;
  try { uiLocalize(app) } catch (e) {}
  revealSection();
}
function rhRefresh() { const box = document.getElementById('rh-follow'); if (view === 'recitation' && box) { box.innerHTML = rhFollowMarkup(); try { uiLocalize(box) } catch (e) {} } }
const rhPrevUpdate = updateFullSurahUI;
updateFullSurahUI = function (...a) { const r = rhPrevUpdate.apply(this, a); if (view === 'recitation') { const bar = document.querySelector('#rh-follow .rh-bar>span'); if (bar && surahState.duration) bar.style.width = Math.min(100, surahState.position / surahState.duration * 100) + '%'; if (!rhUpdating) { rhUpdating = true; setTimeout(() => { rhUpdating = false; const st = document.querySelector('#rh-follow .mh-chip'); const want = fullSurahActive() ? (['playing', 'loading'].includes(surahState.status) ? 'يُتلى الآن' : 'متوقف مؤقتًا') : 'آخر استماع'; if (st && st.dataset.s !== want) { st.dataset.s = want; rhRefresh() } }, 400) } } return r };
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
  const y = scrollY; enterSection('recitation-downloads', 'n-home');
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
closeHomeRecitation = function (...a) { const onHub = !!app.querySelector('.rh-hub'); const r = rhPrevClose.apply(this, a); if (onHub && app.querySelector('.rh-hub')) { view = 'recitation'; try { active('n-home') } catch (e) {} rhRefresh() } return r };
const rhPrevPlayer = fullSurahPlayerHome;
fullSurahPlayerHome = function (...a) { const fromHub = view === 'recitation' || !!app.querySelector('.rh-hub'); const r = rhPrevPlayer.apply(this, a); if (fromHub) { const back = document.getElementById('listen-back'); if (back) back.onclick = recitationHub } return r };
