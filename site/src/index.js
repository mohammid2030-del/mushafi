// مصحفي — public website on Cloudflare Workers (static assets + the Android download).
import { DurableObject } from 'cloudflare:workers';
const APK = 'https://github.com/mohammid2030-del/mushafi/releases/download/android-latest/Mushafi.apk';
// Update manifest for the in-app updater (written by the Publish APK workflow next to the APK).
const MANIFEST = 'https://github.com/mohammid2030-del/mushafi/releases/download/android-latest/app-update.json';

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

// «مصحفي حول العالم» (/world): anonymous counts per country — nothing about the visitor is kept,
// only one number per country for visits, new downloads and in-app updates.
// v = requests to the site (same unit as Cloudflare's "Top countries"), d = new APK downloads, u = in-app updates,
// a = taps on the site's App Store button (counted from APPLE_SINCE).
export class WorldStats extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS c (k TEXT PRIMARY KEY, n INTEGER NOT NULL)');
  }
  add(inc) {
    for (const [k, n] of Object.entries(inc || {})) {
      if (/^[vdua]:[A-Z]{2}$/.test(k) && n > 0 && n < 1e5) this.sql.exec('INSERT INTO c (k, n) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET n = n + excluded.n', k, Math.floor(n));
    }
  }
  all() { return this.sql.exec('SELECT k, n FROM c').toArray(); }
}

// Cloudflare "Top countries", last 14 days up to 24 Nov 2026 — the starting point; live counts add on top.
const WORLD_SINCE = '2026-11-13';
const APPLE_SINCE = '2026-11-25';
const APP_STORE = 'https://apps.apple.com/app/id6832528924';
const WORLD_BASE = { US: 6800, SA: 4330, NL: 1800, SG: 1140, GB: 845, DE: 667, BE: 652, AU: 628, HK: 518, CA: 455, FR: 449, QA: 328,
  CH: 321, PS: 320, JP: 295, PL: 291, YE: 285, TH: 251, EG: 232, BR: 213, IQ: 187, TR: 165, BD: 151, DZ: 151, MA: 150, SE: 149,
  CN: 98, KR: 98, FI: 97, IE: 89, SD: 63, ID: 60, IN: 49, LY: 37, AF: 36, TW: 30, SY: 27, RU: 27, OM: 23, UA: 18, RO: 14, LT: 13,
  NG: 12, AR: 8, SI: 7, MX: 7, ES: 6, MY: 6, CO: 5, IS: 4, AE: 3, PT: 3, VE: 3, BF: 3, BG: 2, ZA: 2, VN: 2, PK: 1, CL: 1, HU: 1,
  BY: 1, CR: 1, IT: 1, HR: 1 };
// Android downloads per country (Cloudflare, /download paths, same 14 days).
const WORLD_BASE_D = { SA: 130, YE: 100, US: 30, GB: 20, BR: 10, CH: 10, QA: 10, SD: 10, SE: 10, IQ: 10 };

function worldCountry(request) {
  let c = String((request.cf && request.cf.country) || '').toUpperCase();
  if (c === 'IL') c = 'PS';
  return /^[A-Z]{2}$/.test(c) && c !== 'XX' && c !== 'T1' ? c : '';
}
// Counts are gathered for a moment and written together, so busy minutes cost one write, not hundreds.
let pending = {}, flushing = null;
function worldCount(env, ctx, kind, request) {
  const c = worldCountry(request);
  if (!c || !env.WORLD) return;
  const k = kind + ':' + c;
  pending[k] = (pending[k] || 0) + 1;
  if (flushing) return;
  flushing = new Promise((r) => setTimeout(r, 2500)).then(async () => {
    const inc = pending; pending = {}; flushing = null;
    try { await env.WORLD.get(env.WORLD.idFromName('world')).add(inc); } catch (e) {}
  });
  ctx.waitUntil(flushing);
}
async function worldData(env, ctx) {
  const cache = caches.default, key = new Request('https://mushafiapp.com/api/world?c=1');
  const hit = await cache.match(key);
  if (hit) return hit;
  const out = { since: WORLD_SINCE, asince: APPLE_SINCE, v: { ...WORLD_BASE }, d: { ...WORLD_BASE_D }, u: {}, a: {} };
  try {
    for (const { k, n } of await env.WORLD.get(env.WORLD.idFromName('world')).all()) {
      const [t, c] = k.split(':');
      if (out[t]) out[t][c] = (out[t][c] || 0) + n;
    }
  } catch (e) {}
  const res = new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60', 'x-content-type-options': 'nosniff' } });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Approximate place of the connection, for the TV apps' prayer times and weather.
    // Nothing is stored or logged; the TV keeps it on the device only.
    if (url.pathname === '/api/where') {
      const cf = request.cf || {}, lat = Number(cf.latitude), lon = Number(cf.longitude);
      const ok = Number.isFinite(lat) && Number.isFinite(lon);
      const country = cf.country === 'IL' ? 'PS' : (cf.country || '');
      return new Response(JSON.stringify(ok ? { city: cf.city || '', region: cf.region || '', country, latitude: lat, longitude: lon, timezone: cf.timezone || '' } : { error: 'unknown' }), {
        status: ok ? 200 : 404,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' }
      });
    }
    if (url.hostname === 'mushafiapp.com' && url.pathname !== '/api/world' && url.pathname !== '/go/appstore') worldCount(env, ctx, 'v', request);
    if (url.pathname === '/api/world') return worldData(env, ctx);
    // The site's App Store button passes through here once, so each tap is counted for its country.
    if (url.pathname === '/go/appstore') {
      if (request.method === 'GET') worldCount(env, ctx, 'a', request);
      return new Response(null, { status: 302, headers: { location: APP_STORE, 'cache-control': 'no-store' } });
    }
    // One public address: the old workers.dev link and www both move to mushafiapp.com.
    if (url.hostname !== 'mushafiapp.com' && url.hostname !== 'localhost') {
      return Response.redirect('https://mushafiapp.com' + url.pathname + url.search, 301);
    }
    if (url.pathname === '/download/android' || url.pathname === '/download/android/') {
      const build = await currentBuild();
      return new Response(null, { status: 302, headers: { location: `/download/android/${build}/Mushafi.apk`, 'cache-control': 'no-store' } });
    }
    // In-app updater: latest release metadata (version, size, sha256, notes).
    if (url.pathname === '/api/app-update') {
      const up = await fetch(MANIFEST, { redirect: 'follow', cf: { cacheTtl: 0 } });
      if (!up.ok) return new Response('{"available":false}', { status: 503, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
      return new Response(await up.text(), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
    }
    // In-app updater download: /download/Mushafi-<version>.apk (the app checks size and sha256).
    if (/^\/download\/Mushafi-\d{1,4}(\.\d{1,4}){1,3}\.apk$/.test(url.pathname)) {
      const res = await serveApk(request);
      if (res && request.method === 'GET') worldCount(env, ctx, 'u', request);
      return res || new Response('Not found', { status: 404 });
    }
    if (url.pathname.startsWith('/download/android/')) {
      const res = await serveApk(request);
      if (res && request.method === 'GET') worldCount(env, ctx, 'd', request);
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
