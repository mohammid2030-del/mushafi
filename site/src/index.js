// مصحفي — public website on Cloudflare Workers (static assets + the Android download).
const APK = 'https://github.com/mohammid2030-del/mushafi/releases/download/android-latest/Mushafi.apk';

// /download/android redirects to a URL that names the current build, so phones never reuse an old cached file.
async function currentBuild() {
  const head = await fetch(APK, { redirect: 'manual', cf: { cacheTtl: 0 } });
  const loc = head.headers.get('location') || '';
  const m = loc.match(/\/(\d{6,})\?|\/(\d{6,})$|releases\/assets\/(\d+)|\/([0-9a-f-]{36})\?/i);
  return m ? (m[1] || m[2] || m[3] || m[4]) : String(Date.now());
}

async function serveApk(request) {
  const upstream = await fetch(APK, { redirect: 'follow', cf: { cacheTtl: 0 } });
  if (!upstream.ok) return null;
  const headers = new Headers({
    'content-type': 'application/vnd.android.package-archive',
    'content-disposition': 'attachment; filename="Mushafi.apk"',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  const len = upstream.headers.get('content-length');
  if (len) headers.set('content-length', len);
  return new Response(request.method === 'HEAD' ? null : upstream.body, { status: 200, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // One public address: the old workers.dev link and www both move to mushafiapp.com.
    if (url.hostname !== 'mushafiapp.com' && url.hostname !== 'localhost') {
      return Response.redirect('https://mushafiapp.com' + url.pathname + url.search, 301);
    }
    if (url.pathname === '/download/android' || url.pathname === '/download/android/') {
      const build = await currentBuild();
      return new Response(null, { status: 302, headers: { location: `/download/android/${build}/Mushafi.apk`, 'cache-control': 'no-store' } });
    }
    if (url.pathname.startsWith('/download/android/')) {
      const res = await serveApk(request);
      return res || Response.redirect(url.origin + '/#download', 302);
    }
    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    out.headers.set('x-content-type-options', 'nosniff');
    out.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
    if (/\.(webp|woff|ttf|png|jpg)$/.test(url.pathname)) out.headers.set('cache-control', 'public, max-age=604800');
    return out;
  },
};
