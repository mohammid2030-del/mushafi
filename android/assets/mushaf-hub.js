'use strict';
/* قسم المصحف: صفحة رئيسية مرتبة (المصحف الشريف · ختمتي · متابعة الختمة) قبل قائمة السور */
iconPaths.mushafOpen = '<path d="M12 6.5C10 5 7.5 4.5 4 4.5v13c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2v-13c-3.5 0-6 .5-8 2z"/><path d="M12 6.5v13M6.5 8.5h3M6.5 11.5h3M14.5 8.5h3M14.5 11.5h3"/>';
iconPaths.khatmaBook = '<path d="M6 3.5h11a1.5 1.5 0 0 1 1.5 1.5v14.5H7.5A2 2 0 0 1 5.5 17.5v-12A2 2 0 0 1 7.5 3.5"/><path d="M5.5 17.5a2 2 0 0 1 2-2h11M9 3.5v8"/>';
let mushafHubOrigin = false;
function mhT(k, ...a) { let t = k; try { if (uiLocale() !== 'ar' && typeof uiDictionary !== 'undefined' && uiDictionary && uiDictionary[k]) t = uiDictionary[k] } catch (e) {} a.forEach((v, i) => { t = t.replace('{' + i + '}', v) }); return t }
function mushafHub() {
  enterSection('mushaf', 'n-quran'); mushafHubOrigin = false;
  let plan = null, stats = null;
  try { plan = khatmaLoad(); if (plan) { try { plan = khatmaSyncCursor(plan) } catch (e) {} stats = khatmaStats(plan) } } catch (e) { plan = null }
  let follow;
  if (plan && stats) {
    const pos = Math.min(604, Math.max(1, plan.position || 1)), juz = mushafPages[pos]?.juz || 1, key = mushafPages[pos].keys[0], chapter = chapters[+key.split(':')[0] - 1];
    const pct = Math.min(100, Math.floor(stats.total / 604 * 100));
    follow = `<button class="mh-follow" onclick="mushafHubKhatma('read')">
      <div class="mh-follow-head"><h2>متابعة الختمة</h2><span class="mh-chip">سورة ${chapter.name_arabic}</span></div>
      <div class="mh-follow-row"><strong translate="no">${mhT('الجزء {0} من {1}', ar(juz), ar(30))}</strong><span class="mh-pct" translate="no">${uiLocale()==='ar'?ar(pct)+'٪':pct+'%'}</span></div>
      <div class="app-progress mh-bar" role="progressbar" aria-label="تقدم الختمة" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
      <p>${stats.done ? 'أتممت ختمتك، تقبّل الله منك' : 'واصل من حيث توقفت في ختمتك'}</p></button>`;
  } else {
    follow = `<button class="mh-follow" onclick="mushafHubKhatma()">
      <div class="mh-follow-head"><h2>متابعة الختمة</h2><span class="mh-chip">${uiIcon('khatmaBook')}</span></div>
      <div class="mh-follow-row"><strong>لم تبدأ ختمة بعد</strong><span class="mh-pct" translate="no">${uiLocale()==='ar'?ar(0)+'٪':'0%'}</span></div>
      <div class="app-progress mh-bar"><span style="width:0"></span></div>
      <p>ضع خطة يومية تناسبك لإتمام القرآن</p></button>`;
  }
  app.innerHTML = sectionHeading('مصحفي', 'رحلتك مع القرآن الكريم') + `<div class="mushaf-hub">
    <div class="mh-grid">
      <button class="mh-card" onclick="mushafHubOpen()"><span class="mh-icon">${uiIcon('mushafOpen')}</span><b>المصحف الشريف</b><small>اقرأ وتدبّر واستمع</small></button>
      <button class="mh-card" onclick="mushafHubKhatma()"><span class="mh-icon">${uiIcon('khatmaBook')}</span><b>ختمتي</b><small>خطتك لإتمام القرآن</small></button>
    </div>${follow}</div>`;
  try { uiLocalize(app) } catch (e) {}
  revealSection();
}
function mushafHubOpen() { mushafHubOrigin = true; openQuran('surahs') }
function mushafHubKhatma(mode) { mushafHubOrigin = true; if (mode === 'read' && typeof openKhatmaReading === 'function') { try { const p = khatmaLoad(); if (p) { openKhatmaReading(); return } } catch (e) {} } khatmaHome() }
/* قائمة السور والختمة ترجعان إلى صفحة المصحف عند الدخول منها */
const mushafHubPrevQuran = openQuran;
openQuran = function (...args) {
  const r = mushafHubPrevQuran.apply(this, args);
  if (mushafHubOrigin) { const h = app.querySelector('.screen-heading'); if (h && !h.querySelector('.round-action')) { h.insertAdjacentHTML('afterbegin', `<button class="round-action" onclick="mushafHub()" aria-label="رجوع">${uiIcon('back')}</button>`); try { uiLocalize(h) } catch (e) {} } }
  return r;
};
const mushafHubPrevKhatma = khatmaHome;
khatmaHome = function (...args) {
  const from = mushafHubOrigin, r = mushafHubPrevKhatma.apply(this, args);
  if (from) { const b = app.querySelector('.screen-heading .round-action'); if (b) b.setAttribute('onclick', 'mushafHub()'); try { active('n-quran') } catch (e) {} }
  return r;
};
