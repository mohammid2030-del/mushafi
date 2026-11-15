'use strict';
/* تقييم مصحفي في App Store: صف في «عن التطبيق» + نافذة لطيفة كل ثلاثة أيام (مرة في اليوم الذي تظهر فيه) */
const RATE_KEY = 'mushafi.rate.v1', RATE_EVERY_DAYS = 3;
const rateIOS = () => window.MushafiPlatform === 'ios';
function rateState() { try { return JSON.parse(localStorage.getItem(RATE_KEY) || '{}') } catch (e) { return {} } }
function rateSave(s) { try { localStorage.setItem(RATE_KEY, JSON.stringify(s)) } catch (e) {} }
const rateDay = (t = Date.now()) => { const d = new Date(t); return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000) };
function rateOpenStore(stars) {
  const s = rateState(); s.done = Date.now(); if (stars) s.stars = stars; rateSave(s);
  document.querySelector('.rate-overlay')?.remove();
  if (typeof window.AndroidReader?.openAppReview === 'function') window.AndroidReader.openAppReview();
  else window.open('https://apps.apple.com/app/id6832528924?action=write-review', '_blank', 'noopener');
}
function rateDue() {
  const s = rateState(); if (s.done) return false;
  return s.last == null || rateDay() - s.last >= RATE_EVERY_DAYS;
}
function rateShowPrompt(force) {
  if (!force && (!rateIOS() || !rateDue())) return;
  if (document.querySelector('.rate-overlay')) return;
  const s = rateState(); s.last = rateDay(); s.count = (s.count || 0) + 1; rateSave(s);
  const o = document.createElement('div'); o.className = 'rate-overlay'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
  o.innerHTML = `<div class="rate-card">
    <div class="rate-icon">${typeof mushafiBrandIcon === 'function' ? mushafiBrandIcon() : ''}</div>
    <h2>هل أعجبك مصحفي؟</h2>
    <p>إن كان مصحفي رفيقك في تلاوتك وأذكارك، فتقييمك يُعين غيرك على الوصول إليه، ولك أجر الدال على الخير بإذن الله.</p>
    <div class="rate-stars" role="group" aria-label="التقييم">${[1, 2, 3, 4, 5].map(n => `<button data-star="${n}" aria-label="${n}"><svg viewBox="0 0 24 24"><path d="m12 3.2 2.7 5.5 6 .9-4.35 4.25 1.03 6-5.38-2.83-5.38 2.83 1.03-6L3.3 9.6l6-.9z"/></svg></button>`).join('')}</div>
    <small class="rate-hint">اختر عدد النجوم لتقييم مصحفي</small>
    <p class="rate-hadith" translate="no" lang="ar" dir="rtl">«مَن دلَّ على خيرٍ فله مثلُ أجرِ فاعلِه»</p>
    <button class="rate-later" data-later>لاحقًا</button>
  </div>`;
  const stars = [...o.querySelectorAll('[data-star]')];
  const paint = n => stars.forEach((b, i) => b.classList.toggle('on', i < n));
  stars.forEach(b => { b.addEventListener('pointerenter', () => paint(+b.dataset.star)); b.addEventListener('click', () => { paint(+b.dataset.star); window.AndroidReader?.haptic?.(1); setTimeout(() => rateThanks(o, +b.dataset.star), 260) }) });
  o.querySelector('.rate-stars').addEventListener('pointerleave', () => paint(0));
  o.addEventListener('click', e => { if (e.target === o || e.target.closest('[data-later]')) { o.classList.add('out'); setTimeout(() => o.remove(), 220) } });
  document.body.append(o); try { uiLocalize(o) } catch (e) {}
}
/* بعد اختيار النجوم: نافذة آبل الرسمية للتقييم (البند 5.6.1)، مع خيار فتح App Store إن لم تظهر */
function rateThanks(o, stars) {
  const s = rateState(); s.done = Date.now(); s.stars = stars; rateSave(s);
  if (typeof window.AndroidReader?.requestAppReview === 'function') window.AndroidReader.requestAppReview();
  const card = o.querySelector('.rate-card');
  card.innerHTML = `<div class="rate-icon">${typeof mushafiBrandIcon === 'function' ? mushafiBrandIcon() : ''}</div><h2>جزاك الله خيرًا</h2><p>شكرًا لدعمك مصحفي. إن لم تظهر لك نافذة التقييم، يمكنك كتابة تقييمك في App Store.</p><button class="rate-store" onclick="rateOpenStore()">${uiIcon('star')}<span>فتح App Store</span></button><button class="rate-later" data-later>تم</button>`;
  card.classList.add('thanks'); try { uiLocalize(card) } catch (e) {}
}
/* صف التقييم آخر «عن التطبيق» (على iOS فقط حتى يتوفر مصحفي على Google Play) */
const rateMoreHome = moreHome;
moreHome = function (...args) {
  rateMoreHome.apply(this, args);
  if (!rateIOS() && !window.__ratePreview) return;
  const about = [...document.querySelectorAll('.section-label h2')].find(h => h.textContent.trim() === uiTranslate('عن التطبيق') || h.textContent.trim() === 'عن التطبيق');
  const menu = about?.parentElement.nextElementSibling;
  if (menu?.classList.contains('menu-list') && !menu.querySelector('.rate-row')) { menu.insertAdjacentHTML('beforeend', listAction('star', 'قيّم مصحفي', 'تقييمك يساعد غيرك في الوصول إلى مصحفي', 'rateOpenStore()').replace('class="menu-row"', 'class="menu-row rate-row"')); try { uiLocalize(menu) } catch (e) {} }
};
/* عند فتح التطبيق على الرئيسية */
let rateChecked = false;
function rateOnHome() { if (rateChecked || view !== 'home' || document.body.classList.contains('onboarding-mode')) return; rateChecked = true; setTimeout(() => { if (view === 'home' && !document.querySelector('.feature-sheet,.first-tour,.hj-dialog')) rateShowPrompt() }, 2200) }
const rateHomePrev = home;
home = function (...args) { const r = rateHomePrev.apply(this, args); rateOnHome(); return r };
setTimeout(rateOnHome, 2500);
