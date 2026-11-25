'use strict';
/* صفحة المزيد: أقسام واضحة — حسابك، أدواتك، الإعدادات، شارك وتابعنا، عن مصحفي، المطوّر.
   تحلّ محل الصفحة القديمة وكل الإضافات التي كانت تُلحق صفوفًا بها. */
if (typeof iconPaths === 'object' && !iconPaths.trophy) iconPaths.trophy = '<path d="M8 3h8v6a4 4 0 0 1-8 0V3Zm0 2H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4M12 13v5m-4 3h8m-7-3h6"/>';
function mpEsc(s) { return typeof esc === 'function' ? esc(s) : String(s ?? '') }
function mpCity() { try { const s = readPrayerData().settings; return s && (s.confirmed || s.latitude) && s.city ? s.city : '' } catch (e) { return '' } }
function mpLanguage() {
  try {
    const p = uiLanguagePreference();
    if (p === 'system') return uiTranslate('لغة الجهاز');
    const l = UI_LANGUAGES.find(x => x[0] === p); return l ? `<span translate="no" lang="${l[0]}" dir="auto">${l[1]}</span>` : '';
  } catch (e) { return '' }
}
moreHome = function () {
  enterSection('more', 'n-more');
  const I = n => uiIcon(n);
  const H = (ic, t) => `<div class="mp-h">${I(ic)}<span>${t}</span></div>`;
  const row = (ic, t, action, tail = '', cls = '') => `<button class="mp-row ${cls}" type="button" onclick="${action}"><span class="mp-ic">${I(ic)}</span><b>${t}</b>${tail}<span class="mp-chev">${I('chevron')}</span></button>`;
  const tool = (ic, t, action) => `<button class="mp-tool" type="button" onclick="${action}"><span>${I(ic)}</span>${t}</button>`;
  const mode = localStorage.themeMode || (localStorage.dark === '1' ? 'dark' : 'light');
  const seg = `<span class="mp-seg" role="group" aria-label="مظهر التطبيق">${[['light', 'فاتح'], ['dark', 'داكن'], ['system', 'تلقائي']].map(([v, t]) => `<button type="button" class="${mode === v ? 'on' : ''}" aria-pressed="${mode === v}" onclick="setAppTheme('${v}')">${t}</button>`).join('')}</span>`;
  const signed = typeof cloudState !== 'undefined' && cloudState.uid;
  const status = typeof cloudStatusMarkup === 'function' ? cloudStatusMarkup() : '';
  const city = mpCity(), lang = mpLanguage();
  const hasWidgets = typeof window.AndroidReader?.openWidgets === 'function';
  const canRate = typeof rateIOS === 'function' && (rateIOS() || window.__ratePreview);
  const fajr = typeof fajrHome === 'function', charity = typeof charityHome === 'function', challenge = typeof challengeHome === 'function';
  const social = typeof SOCIAL === 'object';
  app.innerHTML = sectionHeading('المزيد', 'أدواتك وإعداداتك، في مكان واحد') + `<div class="mp">
    <button class="mp-profile cloud-account-entry" type="button" onclick="accountHome()"><span class="mp-logo">${typeof mushafiBrandIcon === 'function' ? mushafiBrandIcon() : ''}</span><span class="mp-who"><strong>${signed ? 'حسابي والمزامنة' : 'حسابك، على أجهزتك'}</strong><small data-cloud-status>${status}</small></span><span class="mp-chev">${I('chevron')}</span></button>
    ${H('grid', 'أدواتك')}
    <div class="mp-tools">${tool('book', 'ختمتي', 'khatmaHome()')}${tool('chart', 'وردي اليومي', 'wardHome()')}${tool('beads', 'المسبحة', 'sebhaHome()')}${challenge ? tool('trophy', 'تحدّي مصحفي', 'challengeHome()') : ''}${fajr ? tool('sunrise', 'صحبة الفجر', "fajrHome('more')") : ''}</div>
    ${H('settings', 'الإعدادات')}
    <div class="mp-group">
      ${row('mosque', 'الصلاة والأذان', 'openPrayerSettings()', city ? `<span class="mp-val">${mpEsc(city)}</span>` : '')}
      <div class="mp-row mp-static"><span class="mp-ic">${I('moon')}</span><b>المظهر</b>${seg}</div>
      ${row('chat', 'اللغة', 'languageHome()', lang ? `<span class="mp-val">${lang}</span>` : '')}
      ${row('eye', 'راحة القراءة', 'showReadingSettings()')}
      ${hasWidgets ? row('grid', 'ويدجت الشاشة الرئيسية', 'window.AndroidReader.openWidgets()') : ''}
    </div>
    ${social ? `${H('share', 'شارك وتابعنا')}
    <div class="mp-group">
      ${row('share', 'شارك مصحفي', 'socialShareApp()', '', 'gold')}
      ${row('tiktok', 'تيك توك', "socialOpen('tiktok')", `<bdi class="mp-handle">${SOCIAL.tiktok.handle}</bdi>`)}
      ${row('xlogo', 'X', "socialOpen('x')", `<bdi class="mp-handle">${SOCIAL.x.handle}</bdi>`)}
      ${canRate ? row('star', 'قيّم مصحفي', 'rateOpenStore()') : ''}
    </div>` : ''}
    ${H('info', 'عن مصحفي')}
    <div class="mp-group">${row('info', 'تعرّف على مصحفي', 'previewMushafiWelcome()')}${row('eye', 'الخصوصية', 'about()')}${row('sun', 'مصدر الطقس', 'openWeatherCredits()')}</div>
    ${H('letter', 'المطوّر')}
    <div class="mp-group">${typeof devNoteOpen === 'function' ? row('letter', 'رسالة من المطوّر', 'devNoteOpen()') : ''}${row('scroll', 'تواصل مع المطوّر', 'openFeedback()')}</div>
    <div class="app-version">مصحفي · الإصدار ${ar(uiLocale() === 'ar' ? APP_VERSION.replace('.', '٫') : APP_VERSION)}</div>
  </div>`;
  try { uiLocalize(app) } catch (e) {}
  revealSection();
};
