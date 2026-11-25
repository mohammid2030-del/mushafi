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
pg.on('response', async r => { if (/quickdonate/i.test(r.url())) { let t = ''; try { t = (await r.text()).slice(0, 600); } catch (e) {} log('RES', r.status(), t); } });
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
try { await pg.waitForURL(/Payment/i, { timeout: 20000 }); } catch (e) { log('NO PAYMENT NAV'); }
await pg.waitForTimeout(5000);
log('URL', pg.url());
await pg.screenshot({ path: 'out/2-payment.png', fullPage: true });
log('PAYTEXT', (await pg.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 2500));
log('IFRAMES', pg.frames().map(f => f.url()).slice(0, 10));
await b.close();
