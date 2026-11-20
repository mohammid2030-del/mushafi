'use strict';
/* سهم القبلة في الرئيسية: يدور مع الهاتف، يضيء عند الاقتراب من القبلة ويبهت عند الابتعاد، ويفتح البوصلة عند الضغط.
   لا اهتزاز هنا؛ الاهتزاز داخل صفحة القبلة فقط. */
const hq = { running: false, bearing: null, heading: null, angle: null, raf: 0, coords: null };
function hqCoords() { try { const s = readPrayerData().settings; if (s && Number.isFinite(+s.latitude) && Number.isFinite(+s.longitude) && (s.confirmed || s.latitude)) return { latitude: +s.latitude, longitude: +s.longitude } } catch (e) {} return null }
function hqMarkup() {
  return `<button class="hl-qibla" id="hl-qibla" onclick="hqOpen()" aria-label="اتجاه القبلة">
    <span class="hq-glow" aria-hidden="true"></span>
    <svg class="hq-dial" viewBox="0 0 100 100" aria-hidden="true">
      <circle class="hq-ring" cx="50" cy="50" r="44"/>
      <g class="hq-ticks">${Array.from({ length: 24 }, (_, i) => `<line x1="50" y1="${i % 6 ? 9 : 7}" x2="50" y2="${i % 6 ? 12 : 14}" transform="rotate(${i * 15} 50 50)"/>`).join('')}</g>
      <circle class="hq-disk" cx="50" cy="50" r="34"/>
      <g class="hq-needle" id="hq-needle">
        <defs><linearGradient id="hqGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6dfa4"/><stop offset=".55" stop-color="#c9a35a"/><stop offset="1" stop-color="#8e6a2c"/></linearGradient></defs>
        <path class="hq-tail" d="M50 56 L45.5 74 L50 70.5 L54.5 74 Z"/>
        <path class="hq-arrow" d="M50 17 L58 47 Q50 43.5 42 47 Z" fill="url(#hqGold)"/>
        <rect class="hq-kaaba" x="46.6" y="10.6" width="6.8" height="6.8" rx="1.2" transform="rotate(0 50 14)"/>
        <rect class="hq-kaaba-band" x="46.6" y="12.2" width="6.8" height="1.2"/>
      </g>
      <circle class="hq-hub" cx="50" cy="50" r="3.4"/>
    </svg>
    <span class="hq-label">القبلة</span>
  </button>`;
}
function hqOpen() { hqStop(); openQibla() }
function hqStart() {
  const slot = document.getElementById('hl-qibla-slot'); if (!slot) return;
  if (!slot.firstElementChild) { slot.innerHTML = hqMarkup(); try { uiLocalize(slot) } catch (e) {} }
  hq.coords = hqCoords(); hq.bearing = hq.coords ? qiblaBearing(hq.coords.latitude, hq.coords.longitude) : null;
  if (hq.coords && qiblaDistance(hq.coords.latitude, hq.coords.longitude) < 100) hq.bearing = null;
  if (!hq.running && hq.coords && !document.hidden && view === 'home') {
    const r = window.AndroidReader;
    const fn = r?.startQiblaHeading ? 'startQiblaHeading' : null;
    if (fn) { try { r[fn](hq.coords.latitude, hq.coords.longitude); hq.running = true } catch (e) {} }
  }
  if (!hq.raf) hq.raf = requestAnimationFrame(hqTick);
}
function hqStop() {
  if (hq.running) { try { window.AndroidReader?.stopQibla?.() } catch (e) {} }
  hq.running = false; hq.heading = null;
  if (hq.raf) { cancelAnimationFrame(hq.raf); hq.raf = 0 }
}
function hqTick() {
  hq.raf = 0;
  const btn = document.getElementById('hl-qibla'), needle = document.getElementById('hq-needle');
  if (!btn || !needle || view !== 'home') { if (view !== 'qibla') hqStop(); else { hq.running = false; hq.heading = null } return }
  const live = typeof hq.heading === 'number' && hq.bearing !== null;
  const target = live ? hq.bearing - hq.heading : 0;
  if (hq.angle === null) hq.angle = target; else hq.angle += (((target - hq.angle) % 360 + 540) % 360 - 180) * .14;
  needle.style.transform = `rotate(${hq.angle.toFixed(2)}deg)`;
  const delta = live ? Math.abs((((hq.bearing - hq.heading) % 360) + 540) % 360 - 180) : 180;
  const close = live ? Math.max(0, 1 - delta / 70) : 0;
  btn.style.setProperty('--hq-near', close.toFixed(3));
  btn.classList.toggle('is-live', live);
  btn.classList.toggle('is-aligned', live && delta <= 6);
  hq.raf = requestAnimationFrame(hqTick);
}
/* بيانات البوصلة الأصلية تُشارك مع صفحة القبلة */
const hqPrevNative = window.onNativeQibla;
window.onNativeQibla = function (data) {
  if (view === 'home' && hq.running && data) {
    if (data.available === false || data.waiting) hq.heading = null;
    if (typeof data.heading === 'number' && Number.isFinite(data.heading)) hq.heading = data.heading;
    return;
  }
  return hqPrevNative ? hqPrevNative(data) : undefined;
};
const hqPrevEnter = enterSection;
enterSection = function (name, tab) { if (name !== 'home') hqStop(); return hqPrevEnter(name, tab) };
const hqPrevShowPage = showPage;
showPage = function (...a) { hqStop(); return hqPrevShowPage.apply(this, a) };
const hqPrevHome = home;
home = function (...a) { const r = hqPrevHome.apply(this, a); setTimeout(() => { if (view === 'home') hqStart() }, 60); return r };
document.addEventListener('visibilitychange', () => { if (document.hidden) hqStop(); else if (view === 'home') hqStart() });
/* الاهتزاز داخل صفحة القبلة فقط، مرة واحدة عند الوصول لاتجاهها */
let hqAlignedOnPage = false, hqLastBuzz = 0;
const hqPrevRender = qiblaRenderState;
qiblaRenderState = function (...a) {
  const r = hqPrevRender.apply(this, a);
  if (view === 'qibla') {
    const aligned = !!document.querySelector('.qibla-compass.is-aligned');
    if (aligned && !hqAlignedOnPage && Date.now() - hqLastBuzz > 1500) { hqLastBuzz = Date.now(); try { window.AndroidReader?.haptic?.(1) } catch (e) {} }
    hqAlignedOnPage = aligned;
  } else hqAlignedOnPage = false;
  return r;
};
