'use strict';
/* قسم الأذكار: صفحة مرتبة (الأذكار · الأدعية · أذكار اليوم · قسم الأذكار · قسم الأدعية) */
iconPaths.duaHands = '<path d="M7 20v-5.5L4.6 9.8a1.6 1.6 0 0 1 2.8-1.5L9 11V5.5a1.5 1.5 0 0 1 3 0V20M17 20v-5.5l2.4-4.7a1.6 1.6 0 0 0-2.8-1.5L15 11V5.5a1.5 1.5 0 0 0-3 0"/>';
iconPaths.sunrise = '<path d="M12 4v4M5.6 8.6l1.8 1.8M18.4 8.6l-1.8 1.8M3 15h2M19 15h2M7.5 15a4.5 4.5 0 0 1 9 0M3 19h18"/>';
iconPaths.bed = '<path d="M3 18V8M21 18v-5a3 3 0 0 0-3-3H10v5M3 15h18M6.5 12.5a1.5 1.5 0 1 0 0-.01"/>';
iconPaths.mosque = '<path d="M4 20h16M6 20v-7a6 6 0 0 1 12 0v7M12 4v3M10 20v-4a2 2 0 0 1 4 0v4"/>';
const azkarHubPrev = duaHome;
duaHome = function (group) {
  if (group) return azkarHubPrev.apply(this, arguments);
  enterSection('duas', 'n-dua');
  const g = id => devotionGroups.find(x => x.id === id), n = id => groupProgress(id).total, has = id => !!g(id) && n(id) > 0;
  const hour = new Date().getHours(), suggested = hour >= 4 && hour < 16 ? 'morning' : 'evening';
  const today = id => { const p = groupProgress(id); return `<em class="az-count">${ar(p.done)} / ${ar(p.total)}</em>` };
  const row = (icon, title, sub, action, count) => `<button onclick="${action}"><span class="azkar-category-icon">${uiIcon(icon)}</span><span><strong>${title}</strong><small>${sub}</small></span>${count != null ? `<em>${ar(count)}</em>` : ''}${uiIcon('arrow')}</button>`;
  const azkar = [
    has('morning') && row('sunrise', 'أذكار الصباح والمساء', 'كل وقت له أذكاره مع عدّاد الإنجاز', `duaHome('${suggested}')`, n('morning') + n('evening')),
    has('prayer') && row('mosque', 'أذكار بعد الصلاة', 'الأذكار الثابتة عقب الصلوات المفروضة', "duaHome('prayer')", n('prayer')),
    has('salah') && row('book', g('salah').title, g('salah').subtitle, "duaHome('salah')", n('salah')),
    has('sleep') && row('bed', 'أذكار النوم والاستيقاظ', 'أذكار ما قبل النوم وبعد الاستيقاظ', "duaHome('sleep')", n('sleep')),
    has('daily') && row('home', 'الأذكار اليومية', 'المنزل، الطعام، اللباس، الخروج وغيرها', "duaHome('daily')", n('daily')),
    has('adhan') && row('repeat', g('adhan').title, g('adhan').subtitle, "duaHome('adhan')", n('adhan')),
    row('beads', 'التسبيح والاستغفار', 'مسبحة إلكترونية لعدّ ذكرك', 'sebhaHome()', null)
  ].filter(Boolean).join('');
  const topicIcons = { quran: 'book', sunnah: 'heart', muslim: 'book', travel: 'arrow', illness: 'heart', weather: 'sun', funeral: 'moon', variants: 'info' };
  const topics = ['quran', 'sunnah', 'muslim', 'travel', 'illness', 'weather', 'funeral', 'variants'].filter(has)
    .map(id => `<button onclick="duaHome('${id}')">${uiIcon(topicIcons[id] || 'book')}<span>${g(id).title}</span></button>`).join('')
    + `<button onclick="duaHome('favorites')">${uiIcon('bookmark')}<span>الأدعية المفضلة</span></button><button onclick="duaHome('all')">${uiIcon('grid')}<span>كل الأدعية والأذكار</span></button>`;
  app.innerHTML = `<div class="azkar-title az-hub-title"><div><span>وَاذْكُر رَّبَّكَ كَثِيرًا</span><h1>الأذكار والأدعية</h1><p>طمأنينة لقلبك في كل وقت</p></div><button class="round-action" onclick="duaHome('favorites')" aria-label="مفضلة الأذكار">${uiIcon('heart')}</button></div>
  <button class="search-field azkar-search" onclick="globalSearch('duas')">${uiIcon('search')}<span>ابحث عن ذكر أو دعاء</span><small>${ar(devotions.length)} نصًا</small></button>
  <div class="mushaf-hub az-hub">
    <div class="mh-grid">
      <button class="mh-card" onclick="azkarHubJump('az-azkar')"><span class="mh-icon">${uiIcon('moon')}</span><b>الأذكار</b><small>حصّن يومك بذكر الله</small></button>
      <button class="mh-card" onclick="azkarHubJump('az-duas')"><span class="mh-icon">${uiIcon('duaHands')}</span><b>الأدعية</b><small>ادعُ الله في كل أحوالك</small></button>
    </div>
    <div class="azkar-section-title"><h2>أذكار اليوم</h2></div>
    <div class="az-today">
      <button onclick="duaHome('morning')"><span class="azkar-category-icon">${uiIcon('sunrise')}</span><span><strong>أذكار الصباح</strong><small>ابدأ يومك بذكر الله</small></span>${today('morning')}${uiIcon('arrow')}</button>
      <button onclick="duaHome('evening')"><span class="azkar-category-icon">${uiIcon('moon')}</span><span><strong>أذكار المساء</strong><small>اختم يومك بالطمأنينة</small></span>${today('evening')}${uiIcon('arrow')}</button>
    </div>
    <div class="azkar-section-title" id="az-azkar"><h2>أولًا: قسم الأذكار</h2></div>
    <div class="azkar-category-list">${azkar}</div>
    <div class="azkar-section-title" id="az-duas"><h2>ثانيًا: قسم الأدعية</h2></div>
    <p class="az-note">مرتبة حسب الموضوع، ليسهل الوصول إلى الدعاء المناسب</p>
    <div class="az-topics">${topics}</div>
    <p class="azkar-footnote">مختارات من القرآن والسنة بمراجعها<br>تعمل دون إنترنت</p>
  </div>`;
  try { uiLocalize(app) } catch (e) {}
  revealSection();
};
function azkarHubJump(id) { const el = document.getElementById(id); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 16, behavior: 'smooth' }) }
