// صحبة الفجر — push relay on Cloudflare Workers (free plan, no Firebase Blaze needed).
// The apps write wakeCalls in Firestore (rules decide who may ring whom); after each change the
// app that made it calls POST /notify {callId} with its Firebase ID token, and this sends the push.
// Secret: FIREBASE_SERVICE_ACCOUNT (the service-account JSON from Firebase, set from GitHub in CI).

const TEXT = {
  ar: { title: 'صحبة الفجر', ring: '{0} يصحّيك للفجر', missed: 'مكالمة صحبة فائتة من {0}' },
  en: { title: 'Fajr Companion', ring: '{0} is waking you for Fajr', missed: 'Missed wake-up call from {0}' },
  ur: { title: 'فجر کی رفاقت', ring: '{0} آپ کو فجر کے لیے جگا رہے ہیں', missed: '{0} کی رفاقت کال چھوٹ گئی' },
  bn: { title: 'ফজরের সঙ্গী', ring: '{0} আপনাকে ফজরে জাগাচ্ছেন', missed: '{0}-এর মিসড কল' },
  tr: { title: 'Sabah Arkadaşı', ring: '{0} seni sabah namazına kaldırıyor', missed: '{0} cevapsız uyandırma araması' },
};
const t = (lang, key, name) => (TEXT[lang] || TEXT.ar)[key].replace('{0}', name);
const END_STATES = ['missed', 'cancelled', 'answered', 'declined'];

/* ---------- small helpers ---------- */
const enc = new TextEncoder();
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlJson = obj => b64url(enc.encode(JSON.stringify(obj)));
function b64urlDecode(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)) }
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

function account(env) {
  if (!env.__sa) env.__sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  return env.__sa;
}

/* ---------- Google access token from the service account ---------- */
let accessCache = { token: '', until: 0 };
async function accessToken(env) {
  if (accessCache.token && Date.now() < accessCache.until) return accessCache.token;
  const sa = account(env), now = Math.floor(Date.now() / 1000);
  const head = b64urlJson({ alg: 'RS256', typ: 'JWT' });
  const body = b64urlJson({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(head + '.' + body));
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + head + '.' + body + '.' + b64url(sig) });
  const data = await res.json();
  if (!data.access_token) throw new Error('google auth failed');
  accessCache = { token: data.access_token, until: Date.now() + (data.expires_in - 120) * 1000 };
  return accessCache.token;
}

/* ---------- verify the caller's Firebase ID token ---------- */
let jwkCache = { keys: null, until: 0 };
async function jwks() {
  if (jwkCache.keys && Date.now() < jwkCache.until) return jwkCache.keys;
  const res = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  const maxAge = +(/max-age=(\d+)/.exec(res.headers.get('cache-control') || '') || [0, 3600])[1];
  jwkCache = { keys: (await res.json()).keys, until: Date.now() + maxAge * 1000 };
  return jwkCache.keys;
}
async function verifyIdToken(token, projectId) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  let head, claims;
  try { head = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0]))); claims = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1]))) } catch { return null }
  if (head.alg !== 'RS256') return null;
  const jwk = (await jwks()).find(k => k.kid === head.kid); if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlDecode(parts[2]), enc.encode(parts[0] + '.' + parts[1]));
  const now = Math.floor(Date.now() / 1000);
  if (!ok || claims.aud !== projectId || claims.iss !== 'https://securetoken.google.com/' + projectId || !claims.sub || claims.exp < now || claims.iat > now + 300) return null;
  return claims.sub;
}

/* ---------- Firestore REST ---------- */
const docBase = env => `https://firestore.googleapis.com/v1/projects/${account(env).project_id}/databases/(default)/documents/`;
function plain(fields = {}) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = v.stringValue ?? v.booleanValue ?? (v.integerValue != null ? +v.integerValue : v.timestampValue ?? null);
  return out;
}
async function getDoc(env, path) {
  const res = await fetch(docBase(env) + path, { headers: { authorization: 'Bearer ' + await accessToken(env) } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('firestore ' + res.status);
  const d = await res.json(); return { fields: plain(d.fields), updateTime: d.updateTime };
}
async function patchDoc(env, path, fields, updateTime) {
  const mask = Object.keys(fields).map(k => 'updateMask.fieldPaths=' + k).join('&');
  const body = { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : k === 'updatedAt' ? { timestampValue: v } : { stringValue: String(v) }])) };
  const pre = updateTime ? '&currentDocument.updateTime=' + encodeURIComponent(updateTime) : '';
  const res = await fetch(docBase(env) + path + '?' + mask + pre, { method: 'PATCH', headers: { authorization: 'Bearer ' + await accessToken(env), 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return res.ok;
}

/* ---------- FCM ---------- */
async function send(env, uid, profile, message) {
  if (!profile?.token || !message) return false;
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${account(env).project_id}/messages:send`, {
    method: 'POST', headers: { authorization: 'Bearer ' + await accessToken(env), 'content-type': 'application/json' },
    body: JSON.stringify({ message: { token: profile.token, ...message } }),
  });
  if (res.ok) return true;
  const err = await res.text();
  if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT.*registration/.test(err)) await patchDoc(env, 'wakeProfiles/' + uid, { token: null });
  return false;
}

function ringMessage(p, callId, call) {
  const name = String(call.fromName || '').slice(0, 60), lang = p.language || 'ar';
  const data = { type: 'wake', callId, fromName: name, at: String(Date.now()) };
  if (p.platform === 'ios') return {
    data,
    apns: {
      headers: { 'apns-priority': '10', 'apns-push-type': 'alert', 'apns-collapse-id': callId, 'apns-expiration': String(Math.floor(Date.now() / 1000) + 60) },
      payload: { aps: { alert: { title: t(lang, 'title', name), body: t(lang, 'ring', name) }, sound: 'wake-ring.caf', category: 'WAKE_CALL', 'interruption-level': 'time-sensitive', 'thread-id': 'wake' } },
    },
  };
  return { data, android: { priority: 'high', ttl: '60s' } };
}
function endMessage(p, callId, call, state) {
  const name = String(call.fromName || '').slice(0, 60), lang = p.language || 'ar';
  const data = { type: 'wakeEnd', callId, state, fromName: name };
  if (p.platform === 'ios') {
    if (state !== 'missed' && state !== 'cancelled') return null;
    return { data, apns: { headers: { 'apns-priority': '10', 'apns-push-type': 'alert', 'apns-collapse-id': callId }, payload: { aps: { alert: { title: t(lang, 'title', name), body: t(lang, 'missed', name) }, sound: 'default', 'thread-id': 'wake' } } } };
  }
  return { data, android: { priority: 'high', ttl: '600s' } };
}

/* ---------- POST /notify ---------- */
async function notify(request, env) {
  const uid = await verifyIdToken((request.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''), account(env).project_id);
  if (!uid) return json({ error: 'auth' }, 401);
  let body; try { body = await request.json() } catch { return json({ error: 'body' }, 400) }
  const callId = String(body?.callId || '');
  if (!/^[A-Za-z0-9]{10,40}$/.test(callId)) return json({ error: 'call' }, 400);
  const doc = await getDoc(env, 'wakeCalls/' + callId);
  if (!doc) return json({ error: 'call' }, 404);
  const call = doc.fields;
  if (call.from !== uid && call.to !== uid) return json({ error: 'auth' }, 403);
  const state = call.state;
  // each state is pushed once; a repeated /notify does nothing
  if (call.pushed === state) return json({ ok: true, repeat: true });
  if (state === 'ringing' && uid !== call.from) return json({ error: 'auth' }, 403);
  if (state !== 'ringing' && !END_STATES.includes(state)) return json({ ok: true, skip: true });
  if (state === 'ringing' && call.createdAt && Date.now() - Date.parse(call.createdAt) > 90000) return json({ error: 'stale' }, 409);
  if (!await patchDoc(env, 'wakeCalls/' + callId, { pushed: state }, doc.updateTime)) return json({ ok: true, raced: true });
  const profile = (await getDoc(env, 'wakeProfiles/' + call.to))?.fields;
  if (state === 'ringing') {
    const sent = profile?.token ? await send(env, call.to, profile, ringMessage(profile, callId, call)) : false;
    if (!sent) { await patchDoc(env, 'wakeCalls/' + callId, { state: 'unreachable', pushed: 'unreachable', updatedAt: new Date().toISOString() }); return json({ ok: false, state: 'unreachable' }) }
    return json({ ok: true });
  }
  const message = profile && endMessage(profile, callId, call, state);
  if (message) await send(env, call.to, profile, message);
  return json({ ok: true });
}

/* ---------- daily cleanup: rings older than 30 days, expired invites ---------- */
async function cleanup(env) {
  const token = await accessToken(env), base = docBase(env).replace(/\/documents\/$/, '/documents');
  const query = (collection, field, before) => fetch(base + ':runQuery', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], where: { fieldFilter: { field: { fieldPath: field }, op: 'LESS_THAN', value: { timestampValue: before } } }, limit: 300 } }) }).then(r => r.json());
  const old = [...await query('wakeCalls', 'createdAt', new Date(Date.now() - 30 * 86400000).toISOString()), ...await query('wakeInvites', 'expiresAt', new Date().toISOString())].filter(r => r.document).map(r => ({ delete: r.document.name }));
  if (old.length) await fetch(base + ':commit', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ writes: old }) });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === 'POST' && url.pathname === '/notify') return await notify(request, env);
      if (url.pathname === '/' || url.pathname === '/health') return json({ ok: true, service: 'mushafi-wake' });
      return json({ error: 'not found' }, 404);
    } catch (e) { return json({ error: 'server' }, 500) }
  },
  async scheduled(_event, env, ctx) { ctx.waitUntil(cleanup(env)) },
};
