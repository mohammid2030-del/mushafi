'use strict';
/* «عن التطبيق»: شارك مصحفي برسالة فيها روابط التحميل، وحسابات مصحفي في تيك توك وX */
const SOCIAL = {
  appStore: 'https://apps.apple.com/app/id6832528924',
  site: 'https://mushafiapp.com',
  tiktok: { handle: '@mushafi.app.sa', url: 'https://www.tiktok.com/@mushafi.app.sa' },
  x: { handle: '@mushafiapp_sa', url: 'https://x.com/mushafiapp_sa' }
};
if (typeof iconPaths === 'object') {
  iconPaths.tiktok = '<path d="M14.5 3.5v10.8a3.3 3.3 0 1 1-3.3-3.3"/><path d="M14.5 3.5c.4 2.4 2 4 4.6 4.3"/>';
  iconPaths.xlogo = '<path d="M4.5 4.5 19.5 19.5M19.5 4.5l-6.2 6.9M10.7 13.6 4.5 19.5"/>';
}
function socialShareText() {
  const t = s => { try { return uiTranslate(s) } catch (e) { return s } };
  return [
    t('السلام عليكم 🌙'),
    t('حبيت أشاركك تطبيق «مصحفي»: مصحف واضح، ومواقيت الصلاة والأذان، والأذكار وحصن المسلم، والتلاوات والبث المباشر من الحرمين، كله في تطبيق واحد.'),
    '',
    '📱 ' + t('للآيفون والآيباد:'),
    SOCIAL.appStore,
    '',
    '🤖 ' + t('للأندرويد والموقع الرسمي:'),
    SOCIAL.site,
    '',
    t('«الدال على الخير كفاعله» رواه الترمذي ٢٦٧٠')
  ].join('\n');
}
async function socialShareApp() {
  const text = socialShareText();
  try {
    if (window.AndroidReader?.shareText) { AndroidReader.shareText(text); return }
    if (navigator.share) { await navigator.share({ text }); return }
  } catch (e) { if (e?.name === 'AbortError') return }
  try { await navigator.clipboard?.writeText(text); window.showToast?.(uiTranslate('تم نسخ الرسالة')) } catch (e) {}
}
function socialOpen(kind) {
  const item = SOCIAL[kind]; if (!item) return;
  if (typeof window.AndroidReader?.openSupportPage === 'function') window.AndroidReader.openSupportPage(kind);
  else window.open(item.url, '_blank', 'noopener');
}
const socialMoreHome = moreHome;
moreHome = function (...args) {
  const r = socialMoreHome.apply(this, args);
  const about = [...document.querySelectorAll('.section-label h2')].find(h => h.textContent.trim() === uiTranslate('عن التطبيق') || h.textContent.trim() === 'عن التطبيق');
  const menu = about?.parentElement.nextElementSibling;
  if (menu?.classList.contains('menu-list') && !menu.querySelector('.social-row')) {
    const row = (icon, title, sub, action) => listAction(icon, title, sub, action).replace('class="menu-row"', 'class="menu-row social-row"');
    const html = row('share', 'شارك مصحفي', 'أرسل التطبيق لمن تحب مع روابط التحميل', 'socialShareApp()')
      + row('tiktok', 'مصحفي على تيك توك', `<bdi dir="ltr">${SOCIAL.tiktok.handle}</bdi>`, "socialOpen('tiktok')")
      + row('xlogo', 'مصحفي على X', `<bdi dir="ltr">${SOCIAL.x.handle}</bdi>`, "socialOpen('x')");
    const first = menu.querySelector('.menu-row');
    if (first) first.insertAdjacentHTML('afterend', html); else menu.insertAdjacentHTML('afterbegin', html);
    try { uiLocalize(menu) } catch (e) {}
  }
  return r;
};
