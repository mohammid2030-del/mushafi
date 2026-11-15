'use strict';
/* عن المطوّر: رسالة من مطوّر مصحفي + التواصل، كقسم مستقل في صفحة المزيد */
iconPaths.letter = '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4.5 7 7.5 6 7.5-6"/>';
const devNoteMore = moreHome;
moreHome = function (...args) {
  devNoteMore.apply(this, args);
  const version = document.querySelector('.app-version'); if (!version) return;
  version.parentElement.querySelectorAll('.menu-row[onclick="openFeedback()"]').forEach(r => r.remove());
  if (document.querySelector('.dev-note-menu')) return;
  version.insertAdjacentHTML('beforebegin', `<div class="section-label"><h2>عن المطوّر</h2></div><div class="content-card menu-list dev-note-menu">${listAction('letter', 'رسالة من مطوّر مصحفي', 'لماذا صنعتُ «مصحفي»؟', 'devNoteOpen()')}${listAction('note', 'تواصل مع المطوّر', 'راسلنا على بريد الدعم', 'openFeedback()')}</div>`);
  try { uiLocalize(version.parentElement) } catch (e) {}
};
function devNoteOpen() {
  enterSection('dev-note', 'n-more');
  app.innerHTML = sectionHeading('رسالة من المطوّر', 'مطوّر مصحفي', 'moreHome()') + `<div class="dev-note">
    <article class="dev-letter-card">
      <span class="dev-kicker">رسالة من المطوّر</span>
      <h2>لماذا صنعتُ «مصحفي»؟</h2>
      <p>كنت أبحث عن تطبيق قرآن هادئ… بلا إعلانات تقطع التلاوة، وبلا تتبّع، وبلا اشتراكات.</p>
      <p>فقررت أن أصنعه بنفسي، وأجعله مجانيًا للجميع، صدقةً جارية بإذن الله.</p>
      <div class="dev-pillars"><span>${uiIcon('check')}بلا إعلانات</span><span>${uiIcon('check')}بلا تتبّع</span><span>${uiIcon('check')}بلا اشتراكات</span></div>
      <footer class="dev-sig">
        <span class="dev-av" aria-hidden="true" translate="no">م</span>
        <span class="dev-sig-txt"><b>محمد المغربي</b><small>مطوّر مصحفي</small></span>
        <span class="dev-hand" aria-hidden="true" translate="no">محمد</span>
      </footer>
    </article>
    <div class="dev-made">${typeof mushafiBrandIcon === 'function' ? mushafiBrandIcon() : ''}<span><b>صُنع بإتقان في الرياض</b><small>إن نفعك التطبيق فلا تنسني من دعائك 🤍</small></span></div>
    <div class="content-card menu-list">${listAction('note', 'تواصل مع المطوّر', 'راسلنا على بريد الدعم', 'openFeedback()')}</div>
  </div>`;
  try { uiLocalize(app) } catch (e) {}
  revealSection();
}
