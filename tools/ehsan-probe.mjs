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
pg.on('request', r => { if (['xhr', 'fetch', 'document'].includes(r.resourceType()) && r.method() !== 'GET') log('REQ', r.method(), r.url(), (r.postData() || '').slice(0, 400)); });
try {
  const res = await pg.goto(URL, { waitUntil: 'networkidle', timeout: 45000 });
  log('STATUS', res && res.status());
} catch (e) { log('GOTO ERR', String(e)); }
await pg.waitForTimeout(3000);
await pg.screenshot({ path: 'out/1-page.png', fullPage: true });
fs.writeFileSync('out/page.html', await pg.content());
const info = await pg.evaluate(() => {
  const pick = el => ({ tag: el.tagName, id: el.id, cls: el.className && String(el.className).slice(0, 80), name: el.getAttribute('name'), type: el.getAttribute('type'), val: el.value, txt: (el.innerText || '').trim().slice(0, 40), data: Object.fromEntries([...el.attributes].filter(a => a.name.startsWith('data-') || a.name.startsWith('on') || a.name === 'href').map(a => [a.name, a.value.slice(0, 120)])) });
  return { inputs: [...document.querySelectorAll('input,select,textarea')].map(pick), buttons: [...document.querySelectorAll('button,a.btn,[role=tab],.nav-link,label')].filter(e => e.offsetParent).map(pick).slice(0, 80), forms: [...document.forms].map(f => ({ action: f.action, method: f.method, id: f.id })) };
});
fs.writeFileSync('out/info.json', JSON.stringify(info, null, 1));
log('INPUTS', info.inputs.length, 'BUTTONS', info.buttons.length, 'FORMS', info.forms);
// Try: choose «تيسرت», type 50, press «تبرع الآن»
async function clickText(t) {
  const loc = pg.getByText(t, { exact: true }).filter({ visible: true }).first();
  try { await loc.click({ timeout: 5000 }); log('CLICK OK', t); return true; } catch (e) { log('CLICK FAIL', t, String(e).slice(0, 150)); return false; }
}
await clickText('تيسرت');
await pg.waitForTimeout(1500);
await pg.screenshot({ path: 'out/2-tab.png', fullPage: true });
try {
  const amt = pg.locator('input[type=number], input[inputmode=numeric], input[placeholder*="مبلغ"]').filter({ visible: true }).first();
  await amt.fill('50', { timeout: 5000 }); log('AMOUNT OK');
} catch (e) { log('AMOUNT FAIL', String(e).slice(0, 150)); }
await pg.waitForTimeout(800);
await pg.screenshot({ path: 'out/3-amount.png', fullPage: true });
await clickText('تبرع الآن');
await pg.waitForTimeout(8000);
log('URL AFTER', pg.url());
await pg.screenshot({ path: 'out/4-after.png', fullPage: true });
fs.writeFileSync('out/after.html', await pg.content());
await b.close();
