// Deploys firestore.rules through the Firebase Rules REST API (no firebase-tools,
// so the service account needs no Service Usage permission).
import crypto from 'node:crypto';
import fs from 'node:fs';
const sa = JSON.parse(process.env.SA_JSON);
const P = sa.project_id;
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 600 });
const jwt = unsigned + '.' + crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url');
const tok = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt })).json();
if (!tok.access_token) { console.error('auth failed', tok.error || ''); process.exit(1) }
const H = { authorization: 'Bearer ' + tok.access_token, 'content-type': 'application/json' };
const api = `https://firebaserules.googleapis.com/v1/projects/${P}`;
const content = fs.readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8');
const rs = await fetch(`${api}/rulesets`, { method: 'POST', headers: H, body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content }] } }) });
const ruleset = await rs.json();
if (!rs.ok) { console.error('ruleset', rs.status, JSON.stringify(ruleset)); process.exit(1) }
const name = `projects/${P}/releases/cloud.firestore`;
let rel = await fetch(`${api}/releases/cloud.firestore`, { method: 'PATCH', headers: H, body: JSON.stringify({ release: { name, rulesetName: ruleset.name } }) });
if (rel.status === 404) rel = await fetch(`${api}/releases`, { method: 'POST', headers: H, body: JSON.stringify({ name, rulesetName: ruleset.name }) });
if (!rel.ok) { console.error('release', rel.status, await rel.text()); process.exit(1) }
console.log('rules deployed:', ruleset.name);
