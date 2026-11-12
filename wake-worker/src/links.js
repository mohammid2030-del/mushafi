// Short invite links: https://<worker>/<code> opens Mushafi directly (iOS Universal Links,
// Android App Links); people without the app get a small page with the code.
import { ICON_PNG_BASE64 } from './icon.js';

const TEAM_ID = 'ZAU49H7TB9';
const IOS_BUNDLE = 'com.mohammedasif.mushafi';
const ANDROID_PACKAGE = 'com.mushafi.app';
// SHA-256 of the certificates that sign the Android app (test build key; add the release key when it ships).
const ANDROID_CERTS = ['FE:AB:6F:CA:CF:E6:1C:FA:E6:C6:8E:6A:95:5A:F5:7D:B6:58:FB:20:1E:EA:E0:02:3F:A1:14:02:D4:55:AF:56'];

export const CODE_PATH = /^\/([a-z0-9]{10})\/?$/;

const sec = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };

export function appleAssociation() {
  return new Response(JSON.stringify({
    applinks: { details: [{ appIDs: [`${TEAM_ID}.${IOS_BUNDLE}`], components: [{ '/': '/??????????', comment: 'Fajr Companion invite' }] }] },
  }), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600', ...sec } });
}

export function androidAssociation() {
  return new Response(JSON.stringify([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: ANDROID_CERTS },
  }]), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600', ...sec } });
}

export function icon() {
  const bytes = Uint8Array.from(atob(ICON_PNG_BASE64), c => c.charCodeAt(0));
  return new Response(bytes, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400', ...sec } });
}

export function invitePage(code, userAgent = '') {
  const android = /android/i.test(userAgent);
  const open = android
    ? `intent://wake/${code}#Intent;scheme=mushafi-app;package=${ANDROID_PACKAGE};end`
    : `mushafi-app://wake/${code}`;
  const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>مصحفي | دعوة صحبة الفجر</title><link rel="icon" href="/icon.png">
<style>
:root{color-scheme:light dark;--bg:#f5f3ed;--card:#fffdf8;--ink:#213c31;--muted:#6f7a70;--gold:#b7924b;--line:#e4dccb}
@media(prefers-color-scheme:dark){:root{--bg:#101013;--card:#1b1b20;--ink:#f4ead2;--muted:#a59f92;--gold:#e6cf9a;--line:#2c2b33}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.8 system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;display:flex;justify-content:center;padding:28px 18px}
main{width:100%;max-width:440px;text-align:center}img{width:84px;height:84px;border-radius:22px}
h1{font-size:22px;margin:14px 0 4px}p{margin:6px 0;color:var(--muted)}
.card{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:22px 18px;margin-top:20px}
.code{direction:ltr;font:700 25px/1.4 ui-monospace,Menlo,monospace;letter-spacing:3px;color:var(--gold);margin:8px 0}
.btn{display:block;width:100%;margin-top:14px;padding:14px;border-radius:16px;border:0;font:700 16px system-ui,sans-serif;text-decoration:none;cursor:pointer}
.primary{background:var(--gold);color:#211b12}.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
ol{text-align:right;color:var(--muted);padding-inline-start:20px;margin:8px 0 0}
</style></head><body><main>
<img src="/icon.png" alt="مصحفي">
<h1>دعوة «صحبة الفجر»</h1>
<p>وصلتك دعوة ليصحّيك صاحبها لصلاة الفجر من داخل تطبيق مصحفي.</p>
<div class="card">
<a class="btn primary" href="${open}">افتح في مصحفي</a>
<p style="margin-top:16px">رمز الدعوة</p>
<div class="code" id="code">${code}</div>
<button class="btn ghost" id="copy" type="button">نسخ الرمز</button>
</div>
<div class="card"><strong>إذا ما انفتح التطبيق</strong>
<ol><li>ثبّت تطبيق «مصحفي» وسجّل دخولك.</li><li>افتح «صحبة الفجر» ثم «الأشخاص» ثم «عندي رمز دعوة».</li><li>أدخل الرمز ووافق.</li></ol></div>
</main><script>
document.getElementById('copy').onclick=function(){var b=this;(navigator.clipboard?navigator.clipboard.writeText('${code}'):Promise.reject()).then(function(){b.textContent='نُسخ ✓'}).catch(function(){})};
</script></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'", ...sec } });
}

// Book covers for الكتب, made in CI from each PDF's first page and kept on the repo's `covers` branch.
const COVERS = 'https://raw.githubusercontent.com/mohammid2030-del/mushafi/covers';
export async function cover(path, ctx) {
  let m = path.match(/^\/covers\/(ar|en|ur|bn|tr)\.json$/), upstream, type, ttl;
  if (m) { upstream = `${COVERS}/${m[1]}/index.json`; type = 'application/json'; ttl = 3600 }
  else if ((m = path.match(/^\/cover\/(ar|en|ur|bn|tr)\/(\d{1,12})\.webp$/))) { upstream = `${COVERS}/${m[1]}/${m[2]}.webp`; type = 'image/webp'; ttl = 30 * 86400 }
  else return null;
  const cache = caches.default, key = new Request('https://cover.cache' + path);
  const hit = await cache.match(key); if (hit) return hit;
  const r = await fetch(upstream, { cf: { cacheTtl: ttl, cacheEverything: true } });
  if (!r.ok) return new Response(type === 'application/json' ? '[]' : 'not found', { status: r.status === 404 ? 404 : 502, headers: { 'content-type': type === 'application/json' ? 'application/json' : 'text/plain', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=600' } });
  const res = new Response(r.body, { headers: { 'content-type': type, 'access-control-allow-origin': '*', 'cache-control': `public, max-age=${ttl}`, 'x-content-type-options': 'nosniff' } });
  ctx?.waitUntil?.(cache.put(key, res.clone()));
  return res
}
