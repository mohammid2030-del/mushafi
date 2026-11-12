// مصحفي — public website on Cloudflare Workers (static assets + the Android download).
const APK = 'https://github.com/mohammid2030-del/mushafi/releases/download/android-latest/Mushafi.apk';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/download/android' || url.pathname === '/download/android/') {
      const upstream = await fetch(APK, { redirect: 'follow', cf: { cacheEverything: true, cacheTtl: 3600 } });
      if (!upstream.ok) return Response.redirect(url.origin + '/#download', 302);
      const headers = new Headers({
        'content-type': 'application/vnd.android.package-archive',
        'content-disposition': 'attachment; filename="Mushafi.apk"',
        'cache-control': 'public, max-age=600',
        'x-content-type-options': 'nosniff',
      });
      const len = upstream.headers.get('content-length');
      if (len) headers.set('content-length', len);
      return new Response(request.method === 'HEAD' ? null : upstream.body, { status: 200, headers });
    }
    if (url.pathname === '/privacy') return env.ASSETS.fetch(new Request(url.origin + '/privacy.html', request));
    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    out.headers.set('x-content-type-options', 'nosniff');
    out.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
    if (/\.(webp|woff|ttf|png|jpg)$/.test(url.pathname)) out.headers.set('cache-control', 'public, max-age=604800');
    return out;
  },
};
