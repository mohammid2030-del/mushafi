import fs from 'fs';
const log = (...a) => console.log(a.join(' '));
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
async function get(u, opt = {}) { try { const r = await fetch(u, { headers: { 'user-agent': UA, 'accept-language': 'ar-SA' }, redirect: 'manual', signal: AbortSignal.timeout(20000), ...opt }); const t = await r.text(); return { s: r.status, loc: r.headers.get('location'), t }; } catch (e) { return { s: 'ERR ' + e.message, t: '' }; } }
const page = await get('https://ehsan.sa/FastDonation/023544911AA3B6BE973774424665F484C3CFDFFF283D6D744E12A20EA020BFE8350C0E567D258DBD42EAE85D79436847');
log('PAGE', page.s, page.t.length);
const scripts = [...page.t.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => new URL(m[1], 'https://ehsan.sa').href);
log('SCRIPTS', scripts.length);
const words = /(isMobile\w*|mobileApp\w*|IsApp\w*|isApp\w*|fromApp\w*|webview\w*|WebView\w*|hideHeader\w*|HideHeader\w*|embedded\w*|Embedded\w*|isFromMobile\w*|FromMobile\w*|platform=\w*|source=\w*|eps\.ehsan\.sa[^"'\s]*|redirectToUrl|isQuickDonation|QuickDonate[^"'\s]*)/g;
const found = {};
for (const s of [page.t, ...await Promise.all(scripts.filter(u => u.includes('ehsan')).map(async u => (await get(u)).t))]) for (const m of s.matchAll(words)) found[m[0]] = (found[m[0]] || 0) + 1;
log('WORDS', JSON.stringify(found));
// QuickDonate then payment page variants
const fd = new FormData(); fd.append('CartItems[0][Amount]', '5'); fd.append('CartItems[0][InitiativeType]', 'publicOpportunity'); fd.append('FastDonationSource', 'be25a516-2952-5226-c999-3a252423e046');
const cookie = (page.t && '') ;
const qd = await get('https://ehsan.sa/QuickDonate', { method: 'POST', body: fd, headers: { 'user-agent': UA, referer: 'https://ehsan.sa/FastDonation/x', accept: 'application/json' } });
log('QD', qd.s, qd.t.slice(0, 300));
let pay = null; try { pay = JSON.parse(qd.t).redirectToUrl } catch (e) {}
if (pay) {
  for (const u of [pay, pay + '&isMobile=true', pay + '&isMobileApp=true']) { const r = await get(u); log('PAY', u.slice(-40), r.s, r.loc || '', r.t.length, (r.t.match(/<title>[^<]*/) || [''])[0]); }
}
for (const u of ['https://eps.ehsan.sa/', 'https://eps.ehsan.sa/Payment']) { const r = await get(u); log('EPS', u, r.s, r.loc || '', r.t.length); }
