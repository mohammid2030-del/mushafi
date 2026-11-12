// البث المباشر — the app-owned wrapper page around the official Al Aoula (SBA) live embed.
// Served at /live/makkah and /live/madinah; the apps open it in their in-app player and only
// allow this page plus the official embed. Text keys match assets/live-ui-language.js.

const CHANNELS = {
  makkah: { title: 'بث مباشر مكة المكرمة', place: 'المسجد الحرام', source: 'المصدر: قناة القرآن الكريم عبر منصة الأولى', embed: 'https://aloula.sba.sa/ar/live/quran?embed=true' },
  madinah: { title: 'بث مباشر المدينة المنورة', place: 'المسجد النبوي', source: 'المصدر: قناة السنة النبوية عبر منصة الأولى', embed: 'https://aloula.sba.sa/ar/live/sunna?embed=true' },
};
export const LIVE_PATH = /^\/live\/(makkah|madinah)\/?$/;

export function livePage(city, theme) {
  const c = CHANNELS[city];
  const dark = theme === 'dark';
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="${dark ? 'dark' : 'light'}"><title>${c.title} | مصحفي</title>
<style>
:root{--bg:${dark ? '#121214' : '#f8f5ee'};--card:${dark ? '#1c1c1f' : '#fffdf8'};--ink:${dark ? '#f4efe6' : '#143f33'};--soft:${dark ? 'rgba(244,239,230,.62)' : 'rgba(20,63,51,.62)'};--line:${dark ? 'rgba(255,255,255,.08)' : 'rgba(20,63,51,.1)'};--gold:#c9a24a}
*{box-sizing:border-box;margin:0}html,body{height:100%;background:var(--bg);color:var(--ink);font-family:-apple-system,"SF Arabic","Noto Sans Arabic","Segoe UI",Tahoma,sans-serif;-webkit-text-size-adjust:100%}
body{display:flex;flex-direction:column;align-items:center;padding:12px 16px calc(24px + env(safe-area-inset-bottom))}
main{width:100%;max-width:880px;display:flex;flex-direction:column;gap:14px}
.place{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:600}
.dot{width:8px;height:8px;border-radius:50%;background:#e0453a;box-shadow:0 0 0 0 rgba(224,69,58,.6);animation:pulse 1.8s infinite}
@keyframes pulse{70%{box-shadow:0 0 0 8px rgba(224,69,58,0)}100%{box-shadow:0 0 0 0 rgba(224,69,58,0)}}
.player{position:relative;width:100%;aspect-ratio:16/9;border-radius:18px;overflow:hidden;background:#000;border:1px solid var(--line);box-shadow:0 10px 30px rgba(0,0,0,${dark ? '.45' : '.12'})}
.player iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.paused{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(0,0,0,.72);color:#fff;font-size:15px}
.paused button{font:inherit;color:#fff;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:9px 20px}
body.is-paused .paused{display:flex}
.hint{font-size:13px;color:var(--soft);text-align:center}
.meta{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px 16px;display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--soft);line-height:1.7}
.meta b{color:var(--ink);font-weight:600}
</style></head><body><main>
<div class="place"><span class="dot"></span><span>${c.place}</span></div>
<div class="player"><iframe id="official-player" title="${c.title}" src="${c.embed}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
<div class="paused"><span>متوقف مؤقتًا</span><button type="button" onclick="resumeLiveBroadcast()">إعادة المحاولة</button></div></div>
<p class="hint">اضغط تشغيل لمشاهدة البث</p>
<div class="meta"><b>${c.source}</b><span>حقوق البث محفوظة لهيئة الإذاعة والتلفزيون السعودية.</span></div>
</main><script>
(function(){var box=document.querySelector('.player'),tpl=document.getElementById('official-player').cloneNode(false);
window.pauseLiveBroadcast=function(){var f=document.getElementById('official-player');if(f){f.remove();document.body.classList.add('is-paused')}};
window.resumeLiveBroadcast=function(){if(!document.getElementById('official-player'))box.insertBefore(tpl.cloneNode(false),box.firstChild);document.body.classList.remove('is-paused')};})();
</script></body></html>`;
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-src https://aloula.sba.sa; base-uri 'none'; form-action 'none'",
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-content-type-options': 'nosniff',
    },
  });
}
