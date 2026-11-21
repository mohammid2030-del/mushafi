'use strict';
/* قسم الأذكار: صفحة مرتبة (الأذكار · الأدعية · أذكار اليوم · قسم الأذكار · قسم الأدعية) */
iconPaths.duaHands = '<path d="M7 20v-5.5L4.6 9.8a1.6 1.6 0 0 1 2.8-1.5L9 11V5.5a1.5 1.5 0 0 1 3 0V20M17 20v-5.5l2.4-4.7a1.6 1.6 0 0 0-2.8-1.5L15 11V5.5a1.5 1.5 0 0 0-3 0"/>';
iconPaths.sunrise = '<path d="M12 4v4M5.6 8.6l1.8 1.8M18.4 8.6l-1.8 1.8M3 15h2M19 15h2M7.5 15a4.5 4.5 0 0 1 9 0M3 19h18"/>';
iconPaths.bed = '<path d="M3 18V8M21 18v-5a3 3 0 0 0-3-3H10v5M3 15h18M6.5 12.5a1.5 1.5 0 1 0 0-.01"/>';
iconPaths.mosque = '<path d="M4 20h16M6 20v-7a6 6 0 0 1 12 0v7M12 4v3M10 20v-4a2 2 0 0 1 4 0v4"/>';
const azkarHubPrev = duaHome;
duaHome = function (group) {
  if (group === 'me') return azkarHubMorningEvening();
  if (group) {
    const r = azkarHubPrev.apply(this, arguments);
    if (group === 'tasbih') { const h = app.querySelector('.screen-heading'); if (h) { h.insertAdjacentHTML('afterend', `<button class="az-sebha-open" onclick="sebhaHome()">${uiIcon('beads')}<span><strong>المسبحة الإلكترونية</strong><small>عدّاد للتسبيح والاستغفار بهدفك الشخصي</small></span>${uiIcon('arrow')}</button>`); try { uiLocalize(app) } catch (e) {} } }
    return r;
  }
  enterSection('duas', 'n-dua');
  const g = id => devotionGroups.find(x => x.id === id), n = id => groupProgress(id).total, has = id => !!g(id) && n(id) > 0;
  const today = id => { const p = groupProgress(id); return `<em class="az-count">${ar(p.done)} / ${ar(p.total)}</em>` };
  const row = (icon, title, sub, action, count) => `<button onclick="${action}"><span class="azkar-category-icon">${uiIcon(icon)}</span><span><strong>${title}</strong><small>${sub}</small></span>${count != null ? `<em>${ar(count)}</em>` : ''}${uiIcon('arrow')}</button>`;
  const azkar = ['prayer', 'sleep', 'home', 'purity', 'food', 'clothes', 'adhan', 'weather', 'travel', 'manners', 'tasbih'].filter(has)
    .map(id => row(g(id).icon, g(id).title, g(id).subtitle, `duaHome('${id}')`, n(id))).join('');
  const topics = ['quran', 'sunnah', 'prophets', 'tawba', 'hamm', 'rizq', 'family', 'shifa', 'witr', 'hajj'].filter(has)
    .map(id => `<button onclick="duaHome('${id}')">${uiIcon(g(id).icon)}<span>${g(id).title}</span></button>`).join('')
    + `<button onclick="duaHome('favorites')">${uiIcon('bookmark')}<span>الأدعية المفضلة</span></button>`;
  app.innerHTML = `<div class="azkar-title az-hub-title"><div><span>وَاذْكُر رَّبَّكَ كَثِيرًا</span><h1>الأذكار والأدعية</h1><p>طمأنينة لقلبك في كل وقت</p></div><button class="round-action" onclick="duaHome('favorites')" aria-label="مفضلة الأذكار">${uiIcon('heart')}</button></div>
  <button class="search-field azkar-search" onclick="globalSearch('duas')">${uiIcon('search')}<span>ابحث عن ذكر أو دعاء</span><small>${ar(devotions.length)} نصًا</small></button>
  <div class="mushaf-hub az-hub">
    <div class="mh-grid">
      <button class="mh-card" onclick="azkarHubJump('az-azkar')"><span class="mh-icon">${uiIcon('moon')}</span><b>الأذكار</b><small>حصّن يومك بذكر الله</small></button>
      <button class="mh-card" onclick="azkarHubJump('az-duas')"><span class="mh-icon">${uiIcon('duaHands')}</span><b>الأدعية</b><small>ادعُ الله في كل أحوالك</small></button>
    </div>
    <div class="azkar-section-title"><h2>أذكار اليوم</h2></div>
    <div class="az-today">${azkarHubTodayRows()}</div>
    <div class="azkar-section-title" id="az-azkar"><h2>قسم الأذكار</h2></div>
    <div class="azkar-category-list">${azkar}</div>
    <div class="azkar-section-title" id="az-duas"><h2>قسم الأدعية</h2></div>
    <p class="az-note">مرتبة حسب الموضوع، ليسهل الوصول إلى الدعاء المناسب</p>
    <div class="az-topics">${topics}</div>
    <p class="azkar-footnote">مختارات من القرآن والسنة بمراجعها<br>تعمل دون إنترنت</p>
  </div>`;
  try { uiLocalize(app) } catch (e) {}
  revealSection();
};
function azkarHubTodayRows() {
  const today = id => { const p = groupProgress(id); return `<em class="az-count">${ar(p.done)} / ${ar(p.total)}</em>` };
  return `<button onclick="duaHome('morning')"><span class="azkar-category-icon">${uiIcon('sunrise')}</span><span><strong>أذكار الصباح</strong><small>ابدأ يومك بذكر الله</small></span>${today('morning')}${uiIcon('arrow')}</button>
      <button onclick="duaHome('evening')"><span class="azkar-category-icon">${uiIcon('moon')}</span><span><strong>أذكار المساء</strong><small>اختم يومك بالطمأنينة</small></span>${today('evening')}${uiIcon('arrow')}</button>`;
}
function azkarHubMorningEvening() {
  enterSection('dua-category', 'n-dua');
  app.innerHTML = sectionHeading('أذكار الصباح والمساء', 'كل وقت له أذكاره مع عدّاد الإنجاز', 'duaHome()') + `<div class="mushaf-hub az-hub"><div class="az-today">${azkarHubTodayRows()}</div></div>`;
  try { uiLocalize(app) } catch (e) {}
  revealSection();
}
function azkarHubJump(id) { const el = document.getElementById(id); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 16, behavior: 'smooth' }) }
