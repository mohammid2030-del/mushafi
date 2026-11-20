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
/* تنزيلاتي */
function rhDownloads() {
  enterSection('recitation-downloads', 'n-home');
  const can = typeof window.AndroidReader?.audioDownloadedCount === 'function';
  let rows = '';
  if (can) for (const r of audioReaderOrder) for (const c of chapters) { const n = downloadedCount(r, c.id); if (n > 0) rows += `<button onclick="standaloneAudioEntry('${c.id}:1')"><span class="azkar-category-icon">${uiIcon('download')}</span><span><strong>سورة ${c.name_arabic}</strong><small>${esc(audioIndex[r]?.name || '')} · ${ar(n)} / ${ar(c.verses_count)} آية</small></span>${uiIcon('arrow')}</button>` }
  app.innerHTML = sectionHeading('تنزيلاتي', 'التلاوات المحفوظة على جهازك للاستماع دون إنترنت', 'recitationHub()') + `<div class="mushaf-hub rh-hub">${rows ? `<div class="azkar-category-list rh-downloads">${rows}</div>` : `<div class="rh-empty-box">${uiIcon('download')}<strong>لا توجد تنزيلات بعد</strong><p>من «الحفظ والتكرار» اختر القارئ والسورة، ثم اضغط «تنزيل صوت السورة» لتستمع إليها دون إنترنت.</p><button class="primary" onclick="rhMemorize()">${uiIcon('repeat')} الحفظ والتكرار</button></div>`}</div>`;
  try { uiLocalize(app) } catch (e) {}
  revealSection();
}
/* الرجوع إلى صفحة التلاوة بعد اختيار القارئ أو السورة أو من المشغل */
const rhPrevClose = closeHomeRecitation;
closeHomeRecitation = function (...a) { const onHub = !!app.querySelector('.rh-hub'); const r = rhPrevClose.apply(this, a); if (onHub && app.querySelector('.rh-hub')) { view = 'recitation'; try { active('n-home') } catch (e) {} rhRefresh() } return r };
const rhPrevPlayer = fullSurahPlayerHome;
fullSurahPlayerHome = function (...a) { const fromHub = view === 'recitation' || !!app.querySelector('.rh-hub'); const r = rhPrevPlayer.apply(this, a); if (fromHub) { const back = document.getElementById('listen-back'); if (back) back.onclick = recitationHub } return r };
