import { chromium } from 'playwright-core';
import fs from 'fs';
fs.mkdirSync('out', { recursive: true });
const URL = 'https://ehsan.sa/FastDonation/023544911AA3B6BE973774424665F484C3CFDFFF283D6D744E12A20EA020BFE8350C0E567D258DBD42EAE85D79436847';
const log = (...a) => { const s = a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '); console.log(s); fs.appendFileSync('out/log.txt', s + '\n'); };
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, locale: 'ar-SA', timezoneId: 'Asia/Riyadh', isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
const pg = await ctx.newPage();
pg.on('framenavigated', f => { if (f === pg.mainFrame()) log('NAV', f.url()); });
pg.on('request', r => { if (r.method() !== 'GET') log('REQ', r.method(), r.url(), JSON.stringify(r.headers()).slice(0, 600), (r.postData() || '').replace(/\r?\n/g, ' ').slice(0, 800)); });
let PAY = null;
pg.on('response', async r => { if (/quickdonate/i.test(r.url())) { let t = ''; try { t = await r.text(); PAY = JSON.parse(t).redirectToUrl; } catch (e) {} log('RES', r.status(), t.slice(0, 600)); } });
await pg.goto(URL, { waitUntil: 'networkidle', timeout: 45000 });
await pg.waitForTimeout(2000);
log('TABS', await pg.evaluate(() => [...document.querySelectorAll('.qd-btn-select')].map(e => ({ t: e.textContent.trim(), type: e.dataset.type, it: e.dataset.initiativetype, label: e.dataset.formLabel, active: e.classList.contains('active') }))));
log('AMOUNT BTNS', await pg.evaluate(() => [...document.querySelectorAll('#qd-formPage button, #qd-formPage label')].map(e => e.textContent.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 20)));
// pick «تيسرت» by JS click, type 25, submit
await pg.evaluate(() => { [...document.querySelectorAll('.qd-btn-select')].find(e => e.textContent.trim() === 'تيسرت').click(); });
await pg.waitForTimeout(800);
log('ACTIVE', await pg.evaluate(() => [...document.querySelectorAll('.qd-btn-select.active')].map(e => e.textContent.trim()) + ' hidden=' + document.getElementById('qd_initiativeTypePage').value));
await pg.fill('#qd_amount', '25');
await pg.screenshot({ path: 'out/1-filled.png' });
await pg.evaluate(() => { const b = [...document.querySelectorAll('#qd-formPage button, #qd-formPage [type=submit]')].find(e => /تبرع الآن/.test(e.textContent)); b.click(); });
await pg.waitForTimeout(4000);
const safe = async (n, f) => { try { return await f(); } catch (e) { log('FAIL', n, String(e).slice(0, 200)); } };
log('AFTERCLICK', await safe('modal', () => pg.evaluate(() => [...document.querySelectorAll('.modal.show, [role=dialog]:not([aria-hidden=true])')].map(m => m.innerText.replace(/\s+/g, ' ').slice(0, 500)))));
if (PAY) await safe('goto', () => pg.goto(PAY, { waitUntil: 'domcontentloaded', timeout: 45000 }));
await pg.waitForTimeout(8000);
log('URL', pg.url());
log('PAYTEXT', await safe('text', async () => (await pg.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 3000)));
log('IFRAMES', pg.frames().map(f => f.url()).slice(0, 10));
const shot = await safe('shot', () => pg.screenshot({ type: 'jpeg', quality: 55, timeout: 15000, animations: 'disabled', caret: 'initial' }));
if (shot) { const b64 = shot.toString('base64'); for (let k = 0; k < b64.length; k += 4000) console.log('IMG' + String(k / 4000).padStart(4, '0') + ' ' + b64.slice(k, k + 4000)); }
await b.close();
