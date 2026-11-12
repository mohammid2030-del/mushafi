// Writes the deployed worker URL to Firestore (wakeConfig/endpoint) so the apps find it.
import crypto from 'node:crypto';
const [url] = process.argv.slice(2);
if (!/^https:\/\/[a-z0-9.-]+\.workers\.dev$/.test(url || '')) { console.error('bad url', url); process.exit(1) }
const sa = JSON.parse(process.env.SA_JSON);
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 600 });
const jwt = unsigned + '.' + crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url');
const tok = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt })).json();
if (!tok.access_token) { console.error('auth failed'); process.exit(1) }
const res = await fetch(`https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents/wakeConfig/endpoint`, { method: 'PATCH', headers: { authorization: 'Bearer ' + tok.access_token, 'content-type': 'application/json' }, body: JSON.stringify({ fields: { url: { stringValue: url } } }) });
if (!res.ok) { console.error('firestore', res.status, await res.text()); process.exit(1) }
console.log('endpoint saved');
