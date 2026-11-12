// Explains Cloudflare credential problems without printing any secret.
const T = (process.env.CLOUDFLARE_API_TOKEN || '').trim();
const A = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const get = async p => (await fetch('https://api.cloudflare.com/client/v4' + p, { headers: { authorization: 'Bearer ' + T } })).json();
const fail = m => { console.log('::error::' + m); process.exit(1) };
if (T !== process.env.CLOUDFLARE_API_TOKEN || A !== process.env.CLOUDFLARE_ACCOUNT_ID) fail('A secret has spaces or a new line around it; paste it again without them');
if (!/^[0-9a-f]{32}$/.test(A)) fail(`CLOUDFLARE_ACCOUNT_ID does not look like an account ID (length ${A.length}); copy it again from "Copy account ID"`);
const v = await get('/user/tokens/verify');
if (!v.success) fail('CLOUDFLARE_API_TOKEN is not valid: ' + (v.errors || []).map(e => e.code + ' ' + e.message).join('; '));
console.log('token status:', v.result && v.result.status);
const acc = await get('/accounts?per_page=50');
const ids = (acc.result || []).map(a => a.id);
console.log('accounts the token can see:', ids.length);
if (!ids.includes(A)) fail("The token cannot see the account in CLOUDFLARE_ACCOUNT_ID; check the account ID or the token's Account Resources");
const w = await get(`/accounts/${A}/workers/scripts`);
if (!w.success) fail('The token cannot manage Workers: ' + (w.errors || []).map(e => e.code + ' ' + e.message).join('; '));
console.log('cloudflare credentials ok');
