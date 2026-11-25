// إحسان — التبرع السريع عبر رابط الشراكة: بانر في الرئيسية تحت «تابع القراءة»، وبطاقة لاختيار المبلغ والمجال.
// الدفع نفسه يتم في صفحة إحسان الرسمية داخل التطبيق (Safari المدمج على الآيفون).
const EHSAN_AMOUNTS = [1, 5, 10, 25, 50, 100];
const EHSAN_FIELDS = [
  ['publicOpportunity', 'تبرع عام', 'للحالات الأشد احتياجًا', '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>'],
  ['tanfeethQuickDonation', 'تيسرت', 'سداد الفواتير والديون', '<path d="M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21z"/><path d="M9.5 8h5M9.5 12h5"/>'],
  ['AwkaafQuickDonation', 'وقف', 'أجر جارٍ ممتد', '<path d="M4 20h16M6 20V10m4 10V10m4 10V10m4 10V10M3 10l9-6 9 6z"/>'],
  ['mosqueCareQuickDonation', 'المساجد', 'عمارة بيوت الله', '<path d="M5 20v-6a7 7 0 0 1 14 0v6zM12 7V4m-1 1h2M3 20h18M10 20v-3a2 2 0 0 1 4 0v3"/>'],
];
const EH_LOCK = '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const ehNum = n => typeof ar === 'function' ? ar(n) : String(n);

// Ehsan's quick donation is available inside Saudi Arabia only.
function ehsanAvailable() {
  try { if (Intl.DateTimeFormat().resolvedOptions().timeZone === 'Asia/Riyadh') return true } catch (e) {}
  try { return JSON.parse(localStorage.prayerSettings || '{}').timezone === 'Asia/Riyadh' } catch (e) { return false }
}

function ehsanBanner() {
  if (!ehsanAvailable()) return null;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'eh-banner'; b.setAttribute('onclick', 'ehsanOpen()');
  b.innerHTML = `<span class="eh-lg"><img src="ehsan-logo-white.png" alt=""></span><span class="eh-tx"><b>تبرّع عبر منصة إحسان</b><small>صدقتك تصل للحالات الأشد احتياجًا</small></span><span class="eh-go">تبرّع<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></span>`;
  return b;
}

let ehState = { amount: 50, custom: '', field: 'publicOpportunity' };
function ehAmount() { const c = parseInt(String(ehState.custom).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, ''), 10); return ehState.custom !== '' ? (c || 0) : ehState.amount }

function ehsanOpen() {
  document.querySelector('.eh-bg')?.remove();
  try { const s = JSON.parse(localStorage.ehsanLast || 'null'); if (s && EHSAN_FIELDS.some(f => f[0] === s.field)) ehState.field = s.field } catch (e) {}
  ehState.custom = '';
  const bg = document.createElement('div');
  bg.className = 'eh-bg'; bg.setAttribute('role', 'dialog'); bg.setAttribute('aria-modal', 'true');
  bg.innerHTML = `<div class="eh-card">
    <button type="button" class="eh-x" aria-label="إغلاق" onclick="ehsanClose()"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    <div class="eh-hd"><div class="eh-lg"><img src="ehsan-logo-white.png" alt="إحسان"></div><b>تبرّع عبر إحسان</b><small>المنصة الوطنية للعمل الخيري</small></div>
    <h4>مبلغ التبرع</h4>
    <div class="eh-amts">${EHSAN_AMOUNTS.map(a => `<button type="button" class="eh-amt" data-a="${a}" onclick="ehPick(${a})">${ehNum(a)}<small>ريال</small></button>`).join('')}</div>
    <label class="eh-inp"><input inputmode="numeric" maxlength="7" placeholder="مبلغ آخر (اختياري)" oninput="ehCustom(this.value)"><em>ريال</em></label>
    <h4>مجال التبرع</h4>
    <div class="eh-flds">${EHSAN_FIELDS.map(([k, n, d, p]) => `<button type="button" class="eh-fld" data-f="${k}" onclick="ehField('${k}')"><i><svg viewBox="0 0 24 24">${p}</svg></i><span><b>${n}</b><span>${d}</span></span></button>`).join('')}</div>
    <div class="eh-sum"><span class="eh-sum-f"></span><b class="eh-sum-a"></b></div>
    <button type="button" class="eh-btn" onclick="ehsanGo(1)">${EH_LOCK}<span>إتمام التبرع</span></button>
    <button type="button" class="eh-alt" onclick="ehsanGo(2)">نسخة تجربة: جرّب الطريقة الثانية</button>
    <div class="eh-ft">${EH_LOCK}<span>الدفع آمن عبر منصة إحسان · متاح داخل المملكة</span></div>
  </div>`;
  bg.addEventListener('click', e => { if (e.target === bg) ehsanClose() });
  document.body.append(bg);
  uiLocalize?.(bg);
  ehPaint();
  try { tactile?.() } catch (e) {}
}
function ehsanClose() { document.querySelector('.eh-bg')?.remove() }
function ehPick(a) { ehState.amount = a; ehState.custom = ''; const i = document.querySelector('.eh-inp input'); if (i) i.value = ''; ehPaint() }
function ehCustom(v) { ehState.custom = v.trim(); ehPaint() }
function ehField(k) { ehState.field = k; ehPaint() }
function ehPaint() {
  const card = document.querySelector('.eh-card'); if (!card) return;
  const custom = ehState.custom !== '', amount = ehAmount(), ok = amount >= 1 && amount <= 1000000;
  card.querySelectorAll('.eh-amt').forEach(b => b.classList.toggle('on', !custom && +b.dataset.a === ehState.amount));
  card.querySelector('.eh-inp').classList.toggle('on-inp', custom);
  card.querySelectorAll('.eh-fld').forEach(b => b.classList.toggle('on', b.dataset.f === ehState.field));
  card.querySelector('.eh-sum-f').textContent = EHSAN_FIELDS.find(f => f[0] === ehState.field)[1];
  card.querySelector('.eh-sum-a').textContent = ok ? ehNum(amount) + ' ريال' : '—';
  card.querySelectorAll('.eh-btn,.eh-alt').forEach(b => b.disabled = !ok);
  card.querySelector('.eh-btn').toggleAttribute('disabled', !ok);
}
function ehsanGo(mode) {
  const amount = ehAmount();
  if (!(amount >= 1 && amount <= 1000000)) return;
  localStorage.ehsanLast = JSON.stringify({ field: ehState.field });
  if (window.AndroidReader?.ehsanDonate) {
    document.querySelector('.eh-btn')?.classList.add('busy');
    AndroidReader.ehsanDonate(amount, ehState.field, mode);
  } else showSmallNotice('التبرع عبر إحسان متاح في نسخة التجربة على الآيفون');
}
// Native result: true = the payment page is showing; false = it could not be prepared.
window.onEhsanDonate = ok => {
  document.querySelector('.eh-btn')?.classList.remove('busy');
  if (ok) ehsanClose(); else showSmallNotice('تعذّر تجهيز التبرع، فتحنا لك صفحة إحسان');
};
