// Runs the worker against fake Google endpoints: ring push, repeat suppression, auth checks, end push.
import crypto from 'node:crypto';
import worker from '../src/index.js';
const sa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const idk = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...idk.publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const env = { FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: 'proj', client_email: 'x@proj.iam', private_key: sa.privateKey.export({ type: 'pkcs8', format: 'pem' }) }) };
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function idToken(sub, extra = {}) { const now = Math.floor(Date.now() / 1000); const u = b64({ alg: 'RS256', kid: 'k1' }) + '.' + b64({ aud: 'proj', iss: 'https://securetoken.google.com/proj', sub, iat: now, exp: now + 600, ...extra }); return u + '.' + crypto.createSign('RSA-SHA256').update(u).sign(idk.privateKey).toString('base64url') }
const docs = { 'wakeCalls/call0000001': { from: 'alice', to: 'bob', fromName: 'Alice', state: 'ringing', createdAt: new Date().toISOString() }, 'wakeProfiles/bob': { token: 'tok-bob', platform: 'android', language: 'ar' } };
const pushes = []; let n = 0;
const val = v => typeof v === 'string' ? { stringValue: v } : { nullValue: null };
globalThis.fetch = async (url, opt = {}) => {
  url = String(url);
  if (url.includes('oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'at', expires_in: 3600 }));
  if (url.includes('jwk/securetoken')) return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'cache-control': 'max-age=100' } });
  if (url.includes('fcm.googleapis.com')) { pushes.push(JSON.parse(opt.body).message); return new Response('{}') }
  const m = /documents\/([^?]+)/.exec(url); const path = m && decodeURIComponent(m[1]);
  if (opt.method === 'PATCH') { const f = JSON.parse(opt.body).fields; docs[path] = { ...(docs[path] || {}), ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.stringValue ?? v.timestampValue ?? v.booleanValue ?? null])) }; n++; return new Response('{}') }
  if (!docs[path]) return new Response('{}', { status: 404 });
  return new Response(JSON.stringify({ fields: Object.fromEntries(Object.entries(docs[path]).map(([k, v]) => [k, val(v)])), updateTime: 't' + n }));
};
const call = (token, callId = 'call0000001') => worker.fetch(new Request('https://w/notify', { method: 'POST', headers: { authorization: 'Bearer ' + token }, body: JSON.stringify({ callId }) }), env).then(async r => [r.status, await r.json()]);
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1) } console.log('ok', m) };
let r = await call('garbage'); assert(r[0] === 401, 'bad token rejected');
r = await call(idToken('mallory')); assert(r[0] === 403, 'stranger rejected');
r = await call(idToken('bob')); assert(r[0] === 403, 'callee cannot trigger ring push');
r = await call(idToken('alice', { aud: 'other' })); assert(r[0] === 401, 'wrong project rejected');
r = await call(idToken('alice')); assert(r[0] === 200 && pushes.length === 1 && pushes[0].token === 'tok-bob' && pushes[0].data.type === 'wake', 'ring pushed to callee');
r = await call(idToken('alice')); assert(r[1].repeat && pushes.length === 1, 'repeat suppressed');
docs['wakeCalls/call0000001'].state = 'answered';
r = await call(idToken('bob')); assert(r[0] === 200 && pushes.length === 2 && pushes[1].data.state === 'answered', 'end pushed');
docs['wakeCalls/call0000002'] = { from: 'alice', to: 'carol', fromName: 'A', state: 'ringing', createdAt: new Date().toISOString() };
r = await call(idToken('alice'), 'call0000002'); assert(r[1].state === 'unreachable' && docs['wakeCalls/call0000002'].state === 'unreachable', 'no profile -> unreachable');
docs['wakeProfiles/dan'] = { token: 'tok-dan', platform: 'ios', language: 'en' };
docs['wakeCalls/call0000003'] = { from: 'alice', to: 'dan', fromName: 'Alice', state: 'ringing', createdAt: new Date().toISOString() };
r = await call(idToken('alice'), 'call0000003'); assert(pushes.at(-1).apns.payload.aps.sound === 'wake-ring.caf' && pushes.at(-1).apns.payload.aps.alert.body.includes('Alice'), 'iOS ring alert');
console.log('all good');
