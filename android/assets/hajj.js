/* الحج والعمرة — الدليل، والرحلة الفعلية، والطواف والسعي، ورحلتي في الحرم، والتقارير.
   البيانات تُحفظ على الجهاز فقط (localStorage + عداد خطوات الهاتف عبر الجسر الأصلي). */
'use strict';

Object.assign(iconPaths, {
  kaaba: '<path d="M4 7.5 12 4l8 3.5v9L12 20l-8-3.5z"/><path d="M4 7.5 12 11l8-3.5M12 11v9"/><path d="M4 10.5l8 3.5 8-3.5"/>',
  walk: '<circle cx="13" cy="4.5" r="1.8"/><path d="m9.5 21 2-6 2.5 2v4M8 12l2.5-4.5 4 1.5 2 3.5M10.5 7.5 9 14"/>',
  route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  leaf: '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19 13 11"/>'
});

const HAJJ_KEY = 'mushafi.hajj.v1';
/* القسم عربي المحتوى حاليًا، فتُعرض الأرقام والتواريخ بالعربية دائمًا */
const hjAr = n => (typeof uiLocale === 'function' && uiLocale() !== 'ar') ? String(n) : String(n).replace(/\d/g, x => '٠١٢٣٤٥٦٧٨٩'[x]);
const HJ_LOCALES = { ar: 'ar-SA-u-ca-gregory-nu-arab', en: 'en-GB', ur: 'ur-PK-u-nu-latn', bn: 'bn-BD-u-nu-latn', tr: 'tr-TR', fr: 'fr-FR' };
const hjLoc = () => HJ_LOCALES[typeof uiLocale === 'function' ? uiLocale() : 'ar'] || 'ar-SA-u-ca-gregory-nu-arab';
/* كلمات يختلف معناها هنا عن معناها العام في قاموس التطبيق (مثل «الحج» اسم السورة) */
const HJ_OVR = {"الحج": {"en": "Hajj", "fr": "Hajj", "tr": "Hac", "ur": "حج", "bn": "হজ"}, "إنهاء": {"en": "End", "fr": "Terminer", "tr": "Bitir", "ur": "ختم کریں", "bn": "শেষ করুন"}};
const hjLang = () => typeof uiLocale === 'function' ? uiLocale() : 'ar';
const hjT = s => (HJ_OVR[s] && HJ_OVR[s][hjLang()]) || (typeof uiTranslate === 'function' ? uiTranslate(s) : s);
function hjOverride(root) { if (hjLang() === 'ar') return; const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const t = n.nodeValue.trim(), o = HJ_OVR[t]; if (o && o[hjLang()]) n.nodeValue = n.nodeValue.replace(t, o[hjLang()]) } }
/* نص بمتغيرات: يُترجم القالب كاملًا من القاموس ثم تُعوَّض القيم (حتى لا تختلط اللغات في سطر واحد) */
function hjF(key, ...a) { let t = key; try { if (uiLocale() !== 'ar' && uiDictionary[key]) t = uiDictionary[key] } catch (e) {} return t.replace(/\{(\d+)\}/g, (_, i) => a[i] ?? '') }
const hjPct = n => hjAr(n) + (typeof uiLocale === 'function' && uiLocale() !== 'ar' ? '%' : '٪');
let hajjStore = null, hajjView = null, hajjTick = 0, hajjPoll = 0, hajjViewer = null, hajjBack = 'home()', hajjStepWaiters = [];

/* ---------- التخزين ---------- */
function hajjLoad() {
  if (hajjStore) return hajjStore;
  try { hajjStore = JSON.parse(localStorage.getItem(HAJJ_KEY) || 'null') } catch (e) { hajjStore = null }
  if (!hajjStore || hajjStore.schema !== 1) hajjStore = { schema: 1, trips: [], active: null, settings: { stride: 0.7, light: false, path: 'near', hajjType: null } };
  hajjStore.settings = Object.assign({ stride: 0.7, light: false, path: 'near', hajjType: null }, hajjStore.settings || {});
  return hajjStore;
}
function hajjSave() { try { localStorage.setItem(HAJJ_KEY, JSON.stringify(hajjStore)) } catch (e) { showSmallNotice('تعذر حفظ التقدم — المساحة ممتلئة') } }
function hajjTrip(id) { return hajjLoad().trips.find(t => t.id === (id || hajjStore.active)) || null }
function hajjActiveTrip() { const t = hajjTrip(); return t && !t.endedAt ? t : null }
function hajjActivity(trip) { return trip?.activities.find(a => !a.endedAt) || null }
const hajjId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ---------- الجسر الأصلي (خطوات الهاتف والملفات) ---------- */
const hajjNative = {
  has: n => typeof window.AndroidReader?.[n] === 'function',
  call(n, ...a) { try { if (this.has(n)) { window.AndroidReader[n](...a); return true } } catch (e) {} return false },
  status() {
    try { if (this.has('hajjStepStatus')) return JSON.parse(window.AndroidReader.hajjStepStatus()) } catch (e) {}
    return { available: false, permission: 'unsupported' };
  }
};
window.onHajjSteps = data => {
  const trip = hajjActiveTrip();
  if (trip && data && data.active && trip.stepsSession) {
    const steps = Math.max(0, +data.steps || 0);
    trip.steps = Math.max(trip.steps || 0, steps); trip.stepsAt = Date.now(); trip.stepsSource = data.source;
    if (typeof data.distance === 'number') trip.phoneDistance = Math.max(trip.phoneDistance || 0, data.distance);
    const act = hajjActivity(trip);
    if (act && act.stepsStart == null) act.stepsStart = trip.steps;
    hajjSave();
  }
  const waiters = hajjStepWaiters; hajjStepWaiters = []; waiters.forEach(f => f());
  hajjRefreshLive();
};
window.onHajjStepPermission = data => {
  const trip = hajjActiveTrip();
  if (trip && data?.permission === 'granted' && !trip.stepsSession) hajjBeginSteps(trip);
  if (hajjView === 'trackers' || hajjView === 'guide') hajjRerender();
};
window.onHajjFile = data => {
  if (data?.ok) showSmallNotice(data.action === 'save' ? 'حُفظ الملخص' : 'جاهز للمشاركة');
  else if (!data?.cancelled) showSmallNotice('تعذر تجهيز الملف');
};
function hajjBeginSteps(trip) {
  const st = hajjNative.status();
  if (st.permission !== 'granted') return false;
  if (hajjNative.call('hajjStepsBegin')) { trip.stepsSession = true; trip.steps = 0; trip.phoneDistance = 0; hajjSave(); return true }
  return false;
}
function hajjQuerySteps() { return new Promise(res => { if (!hajjActiveTrip()?.stepsSession || !hajjNative.call('hajjStepsQuery')) return res(); hajjStepWaiters.push(res); setTimeout(res, 2500) }) }

/* ---------- حسابات ---------- */
function hajjActiveMs(a, now = Date.now()) {
  if (!a) return 0;
  const end = a.endedAt || now, paused = (a.pausedMs || 0) + (a.pausedAt ? (a.endedAt || now) - a.pausedAt : 0);
  return Math.max(0, end - a.startedAt - paused);
}
function hajjActSteps(trip, a) {
  if (a.steps != null) return a.steps;
  if (!trip?.stepsSession || a.stepsStart == null) return null;
  const pausedSteps = (a.stepsPaused || 0) + (a.pausedAt && a.stepsPauseStart != null ? (trip.steps || 0) - a.stepsPauseStart : 0);
  return Math.max(0, (trip.steps || 0) - a.stepsStart - pausedSteps);
}
function hajjPerRound(a) { return a.kind === 'sai' ? HAJJ_SAI_LENGTH : 2 * Math.PI * (HAJJ_TAWAF_PATHS[a.path]?.radius || 17) }
/* المسافة: من الخطوات × طول الخطوة إن توفرت، وإلا تقدير بحسب الأشواط — ويُذكر مصدرها دائمًا */
function hajjActDistance(trip, a) {
  const steps = hajjActSteps(trip, a);
  if (steps != null && steps > 0) return { m: steps * hajjLoad().settings.stride, src: 'steps' };
  return { m: a.rounds.length * hajjPerRound(a), src: 'rounds' };
}
function hajjTripTotals(trip) {
  const acts = trip.activities, ms = acts.reduce((s, a) => s + hajjActiveMs(a), 0);
  const tawaf = acts.filter(a => a.kind === 'tawaf').reduce((s, a) => s + a.rounds.length, 0), sai = acts.filter(a => a.kind === 'sai').reduce((s, a) => s + a.rounds.length, 0);
  const steps = trip.stepsSession ? (trip.steps || 0) : null;
  let dist, src;
  if (trip.phoneDistance > 0) { dist = trip.phoneDistance; src = 'phone' }
  else if (steps) { dist = steps * hajjLoad().settings.stride; src = 'steps' }
  else { dist = acts.reduce((s, a) => s + hajjActDistance(trip, a).m, 0); src = 'rounds' }
  const span = (trip.endedAt || Date.now()) - trip.startedAt;
  return { ms, span, tawaf, sai, steps, dist, src, speed: ms > 60000 ? (acts.reduce((s, a) => s + hajjActDistance(trip, a).m, 0) / 1000) / (ms / 3600000) : 0 };
}
const hajjSrcLabel = { steps: 'تقديرية من خطوات الهاتف', phone: 'قياس الهاتف', rounds: 'تقديرية بحسب الأشواط' };
function hajjClock(ms) { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return hjAr((h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0')) }
function hajjDuration(ms) { if (ms < 60000) return ms < 1000 ? hjF('{0} دقيقة', hjAr(0)) : hjT('أقل من دقيقة'); const m = Math.round(ms / 60000), h = Math.floor(m / 60); return h ? hjF('{0} س {1} د', hjAr(h), hjAr(m % 60)) : hjF('{0} دقيقة', hjAr(m)) }
function hajjNum(n) { return hjAr(Math.round(n).toLocaleString('en-US')) }
function hajjKm(m) { return m >= 1000 ? hjF('{0} كم', hjAr((m / 1000).toFixed(2))) : hjF('{0} م', hjAr(Math.round(m))) }
function hajjDate(t) { try { return new Date(t).toLocaleDateString(hjLoc(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) } catch (e) { return new Date(t).toDateString() } }
function hajjTime(t) { try { return new Date(t).toLocaleTimeString(hjLoc(), { hour: 'numeric', minute: '2-digit' }) } catch (e) { return '' } }
const hajjKindTitle = t => t.kind === 'umrah' ? hjT('العمرة') : t.kind === 'hajj' ? hjF('الحج — {0}', hjT(HAJJ_TYPES[t.type]?.title || '')) : hjT('طواف وسعي');

/* ---------- التنقل ---------- */
function hajjLeave() {
  clearInterval(hajjTick); clearInterval(hajjPoll); hajjTick = hajjPoll = 0;
  if (hajjViewer) { hajjViewer.destroy(); hajjViewer = null }
  document.querySelector('.hj-dialog')?.remove();
}
const hajjEnterPrev = enterSection;
enterSection = function (name, ...rest) { if (!String(name).startsWith('hajj')) { hajjLeave(); hajjView = null } return hajjEnterPrev(name, ...rest) };
function hajjEnter(name, tab) { hajjLeave(); hajjView = name; enterSection('hajj-' + name, tab || 'n-home') }
function hajjGuideFor(trip) { return !trip ? 'hajjHome()' : trip.kind === 'visit' ? 'hajjVisitPage()' : `hajjGuide('${trip.kind === 'hajj' ? 'hajj' : 'umrah'}')` }
function hajjRerender() { const f = { home: hajjHome, umrah: () => hajjGuide('umrah'), hajj: () => hajjGuide('hajj'), journey: hajjJourney, visit: hajjVisitPage, models: hajjModels, types: hajjTypePicker }[hajjView]; if (f) f(); else if (hajjView === 'trackers') hajjTracker(hajjCurrentKind) }
/* المحتوى الشرعي لهذا القسم بالعربية حاليًا؛ نمنع الترجمة الآلية الجزئية حتى لا تختلط الكلمات */
/* تُترجم نصوص القسم عبر قاموس التطبيق؛ والأذكار ونيات النسك تبقى بنصها العربي */
function hajjArabic(el) { el.removeAttribute('translate') }
function hajjFinishRender() { app.querySelectorAll(':scope > .screen-heading, :scope > .hj-page').forEach(el => { hajjArabic(el); hjOverride(el) }); if (typeof revealSection === 'function') revealSection() }

/* ---------- الصفحة الرئيسية للقسم ---------- */
function hajjOpenSource(url) { if (!hajjNative.call('openSourceUrl', url)) window.open(url, '_blank', 'noopener') }

/* ---------- الدليل: العمرة والحج ---------- */
/* ---------- الرحلة ---------- */
function hajjStartTrip(kind) {
  const s = hajjLoad();
  if (hajjActiveTrip()) { showSmallNotice('لديك رحلة جارية'); return }
  const trip = { id: hajjId(), kind, type: kind === 'hajj' ? s.settings.hajjType : null, startedAt: Date.now(), endedAt: null, stages: {}, activities: [], steps: 0, stepsSession: false };
  s.trips.push(trip); s.active = trip.id; hajjSave();
  if (hajjNative.status().permission === 'granted') hajjBeginSteps(trip);
  hajjGuide(kind);
  if (!trip.stepsSession && hajjNative.status().permission === 'prompt') setTimeout(() => hajjNative.call('hajjStepPermission'), 350);
}
function hajjConfirmEndTrip() {
  const trip = hajjActiveTrip(); if (!trip) return;
  const act = hajjActivity(trip);
  hajjDialog('إنهاء الرحلة؟', (act ? hjT('لديك نشاط جارٍ، سيُنهى ويُحفظ ما أتممته منه.') + ' ' : '') + hjT('سيتوقف حساب الخطوات، ويُحفظ ملخص رحلتك في سجلك.'), 'إنهاء وحفظ', async () => {
    if (act) hajjEndActivity(trip, act);
    await hajjQuerySteps();
    trip.endedAt = Date.now(); hajjStore.active = null; hajjSave();
    if (trip.stepsSession) hajjNative.call('hajjStepsEnd');
    hajjReport(trip.id);
  });
}

/* ---------- الطواف والسعي ---------- */
let hajjCurrentKind = 'tawaf';
function hajjStartActivity(kind, stage) {
  const trip = hajjActiveTrip(); if (!trip) { showSmallNotice('ابدأ الرحلة أولًا'); return }
  const running = hajjActivity(trip);
  if (running && (running.kind !== kind || running.stage !== stage)) {
    hajjDialog('نشاط آخر جارٍ', hjF('أنهِ {0} الجاري أولًا، أو تابعه الآن.', hjT(running.kind === 'tawaf' ? 'الطواف' : 'السعي')), 'متابعته', () => hajjTracker(running.kind));
    return;
  }
  if (!running) {
    const prev = trip.activities.filter(a => a.kind === kind && a.stage === stage).pop();
    if (prev && prev.rounds.length >= 7) { hajjDialog(hjF('{0} مكتمل', hjT(kind === 'tawaf' ? 'الطواف' : 'السعي')), 'سجّلت سبعة أشواط لهذه المرحلة. هل تريد البدء من جديد؟', 'ابدأ من جديد', () => hajjNewActivity(trip, kind, stage)); return }
    hajjNewActivity(trip, kind, stage);
    return;
  }
  hajjTracker(kind);
}
function hajjNewActivity(trip, kind, stage) {
  trip.activities.push({ id: hajjId(), kind, stage, startedAt: Date.now(), endedAt: null, pausedAt: null, pausedMs: 0, rounds: [], path: hajjLoad().settings.path, stepsStart: trip.stepsSession ? (trip.steps || 0) : null, stepsPaused: 0, stepsPauseStart: null });
  hajjSave(); hajjQuerySteps(); hajjTracker(kind);
}
function hajjEndActivity(trip, a) {
  if (a.pausedAt) { a.pausedMs += Date.now() - a.pausedAt; if (a.stepsPauseStart != null) a.stepsPaused += (trip.steps || 0) - a.stepsPauseStart; a.pausedAt = null; a.stepsPauseStart = null }
  a.steps = hajjActSteps(trip, a); a.endedAt = Date.now();
  const d = hajjActDistance(trip, a); a.distance = d.m; a.distanceSrc = d.src;
  if (a.rounds.length >= 7) {
    const st = hajjStagesFor(trip.kind, trip.type).find(x => x.id === a.stage);
    const need = st ? (st.trackers || [st.tracker].filter(Boolean)) : [];
    if (need.includes(a.kind) && need.every(k => trip.activities.some(x => x.kind === k && x.stage === st.id && x.rounds.length >= 7))) trip.stages[st.id] = trip.stages[st.id] || Date.now();
  }
  hajjSave();
}

function hajjMount3D(scene, a, mode) {
  const host = document.getElementById('hj-3d'); if (!host) return;
  if (!Hajj3D.supported()) { host.insertAdjacentHTML('afterbegin', '<p class="hj-hint">جهازك لا يدعم العرض ثلاثي الأبعاد.</p>'); return }
  try {
    hajjViewer = Hajj3D.create(host, scene, { light: hajjLoad().settings.light, path: a?.path, mode });
    if (a && scene === 'kaaba') { Hajj3D.setTawafPath(hajjViewer, a.path, a.rounds.length, !a.pausedAt); const d = { near: 88, mid: 120, first: 210, roof: 250 }[a.path]; if (a.path !== 'near') hajjViewer.focus([0, HAJJ_TAWAF_PATHS[a.path].height + 3, 0], d) }
    if (a && scene === 'masaa') Hajj3D.setSaiProgress(hajjViewer, a.rounds.length, !a.pausedAt);
  } catch (e) { host.insertAdjacentHTML('afterbegin', '<p class="hj-hint">تعذر تشغيل العرض ثلاثي الأبعاد على هذا الجهاز.</p>') }
}
function hajjPathDialog() {
  const trip = hajjActiveTrip(), a = hajjActivity(trip); if (!a) return;
  document.querySelector('.hj-dialog')?.remove();
  const d = document.createElement('div'); d.className = 'hj-dialog';
  d.innerHTML = `<div class="hj-dialog-card"><h3>مسار طوافك</h3><p>يُستخدم لعرض الحلقة على المجسم، ولتقدير المسافة إن لم تتوفر الخطوات.</p><div class="hj-options">${Object.entries(HAJJ_TAWAF_PATHS).map(([k, p]) => `<button class="hj-option ${a.path === k ? 'on' : ''}" data-k="${k}"><b>${p.title}</b><small>${hjF('نحو {0} م للشوط', hjAr(Math.round(2 * Math.PI * p.radius)))}</small></button>`).join('')}</div></div>`;
  hajjArabic(d);
  d.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (e.target === d) d.remove(); if (!b) return; d.remove();
    a.path = b.dataset.k; hajjLoad().settings.path = a.path; hajjSave();
    const chip = document.querySelector('#hj-path span'); if (chip) chip.textContent = HAJJ_TAWAF_PATHS[a.path].title;
    if (hajjViewer) { Hajj3D.setTawafPath(hajjViewer, a.path, a.rounds.length, !a.pausedAt); hajjViewer.focus([0, HAJJ_TAWAF_PATHS[a.path].height + 3, 0], { near: 88, mid: 120, first: 210, roof: 250 }[a.path]) }
    hajjRefreshLive() });
  document.body.append(d);
}
function hajjToggleLight() {
  const s = hajjLoad().settings; s.light = !s.light; hajjSave();
  document.getElementById('hj-light')?.classList.toggle('on', s.light);
  hajjViewer?.setLight(s.light);
  clearInterval(hajjPoll); hajjPoll = setInterval(() => { if (!document.hidden) hajjNative.call('hajjStepsQuery') }, s.light ? 15000 : 5000);
  showSmallNotice(s.light ? 'وضع خفيف: عرض ثابت وتحديث أقل لتوفير البطارية' : 'أُلغي الوضع الخفيف');
}
function hajjRoundDone() {
  const trip = hajjActiveTrip(), a = hajjActivity(trip); if (!a || a.pausedAt || a.rounds.length >= 7) return;
  const active = hajjActiveMs(a), prev = a.rounds.length ? a.rounds[a.rounds.length - 1].active : 0;
  a.rounds.push({ at: Date.now(), active, ms: active - prev });
  hajjSave(); hajjNative.call('haptic', 1);
  const n = a.rounds.length;
  if (hajjViewer) a.kind === 'tawaf' ? Hajj3D.setTawafPath(hajjViewer, a.path, n, n < 7) : Hajj3D.setSaiProgress(hajjViewer, n, n < 7);
  if (n === 7) { try { navigator.vibrate?.([120, 80, 120]) } catch (e) {} showSmallNotice(a.kind === 'sai' ? 'اكتمل الشوط السابع عند المروة' : 'اكتمل الشوط السابع') }
  else showSmallNotice(hjF('سُجّل الشوط {0}', hjAr(n)));
  hajjQuerySteps(); hajjRefreshLive();
}
function hajjUndoRound() {
  const trip = hajjActiveTrip(), a = hajjActivity(trip); if (!a || !a.rounds.length) return;
  const n = a.rounds.length;
  hajjDialog('تصحيح عدد الأشواط', hjF('سيُحذف الشوط {0} ويصبح الشوط الحالي {1}. إن شككت في العدد فابنِ على الأقل.', hjAr(n), hjAr(n)), 'نعم، صحّح', () => {
    a.rounds.pop(); hajjSave();
    if (hajjViewer) a.kind === 'tawaf' ? Hajj3D.setTawafPath(hajjViewer, a.path, a.rounds.length, !a.pausedAt) : Hajj3D.setSaiProgress(hajjViewer, a.rounds.length, !a.pausedAt);
    showSmallNotice(hjF('صُحّح العدد: الشوط الحالي {0}', hjAr(a.rounds.length + 1))); hajjRefreshLive();
  });
}
let hajjPauseBusy = false;
async function hajjPauseToggle() {
  const trip = hajjActiveTrip(), a = hajjActivity(trip); if (!a || hajjPauseBusy) return;
  hajjPauseBusy = true; await hajjQuerySteps(); hajjPauseBusy = false;   // قراءة حديثة للخطوات حتى تُستبعد خطوات فترة الإيقاف بدقة
  if (a.pausedAt) { a.pausedMs += Date.now() - a.pausedAt; a.pausedAt = null; if (a.stepsPauseStart != null) a.stepsPaused += Math.max(0, (trip.steps || 0) - a.stepsPauseStart); a.stepsPauseStart = null }
  else { a.pausedAt = Date.now(); a.stepsPauseStart = trip.stepsSession ? (trip.steps || 0) : null }
  hajjSave();
  if (hajjViewer) a.kind === 'tawaf' ? Hajj3D.setTawafPath(hajjViewer, a.path, a.rounds.length, !a.pausedAt) : Hajj3D.setSaiProgress(hajjViewer, a.rounds.length, !a.pausedAt);
  hajjRefreshLive();
}
function hajjFinishActivity(skipConfirm) {
  const trip = hajjActiveTrip(), a = hajjActivity(trip); if (!a) return;
  const name = a.kind === 'tawaf' ? 'الطواف' : 'السعي';
  const end = async () => { await hajjQuerySteps(); hajjEndActivity(trip, a); showSmallNotice(hjF('حُفظ {0}', hjT(name))); if (trip.kind === 'visit') hajjVisitPage(); else hajjGuide(trip.kind === 'hajj' ? 'hajj' : 'umrah') };
  if (skipConfirm === true || a.rounds.length >= 7) { end(); return }
  hajjDialog(hjF('إنهاء {0}؟', hjT(name)), hjF('سجّلت {0} من ٧ أشواط. سيُحفظ ما أتممته، ولن يُعد {1} مكتملًا.', hjAr(a.rounds.length), hjT(name)), hjT('إنهاء'), end);
}

/* ---------- نافذة تأكيد ---------- */
function hajjDialog(title, body, okText, onOk) {
  document.querySelector('.hj-dialog')?.remove();
  const d = document.createElement('div'); d.className = 'hj-dialog'; d.setAttribute('role', 'dialog');
  d.innerHTML = `<div class="hj-dialog-card"><h3>${title}</h3><p>${body}</p><div><button class="hj-btn" data-x>إلغاء</button><button class="hj-btn gold" data-ok>${okText}</button></div></div>`;
  d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-x]')) d.remove(); else if (e.target.closest('[data-ok]')) { d.remove(); onOk() } });
  hajjArabic(d); document.body.append(d);
}
const hajjNativeBackPrev = window.handleNativeBack;
window.handleNativeBack = function (...args) { const d = document.querySelector('.hj-dialog'); if (d) { d.remove(); return true } return typeof hajjNativeBackPrev === 'function' ? hajjNativeBackPrev.apply(this, args) : false };

/* ---------- المجسمات ---------- */
const HAJJ_MODELS = [
  ['kaaba', 'الكعبة المشرفة والمطاف', 'اتجاه الطواف، ومحاذاة الحجر الأسود، وحِجر إسماعيل، ومقام إبراهيم'],
  ['masaa', 'المسعى', 'الصفا والمروة، ومسار الذهاب والعودة، ومنطقة الهرولة'],
  ['mina', 'منى', 'الخيام، ومسجد الخيف، ومنشأة الجمرات'],
  ['arafah', 'عرفة', 'جبل الرحمة، ومسجد نمرة، وحدود عرفة'],
  ['muzdalifah', 'مزدلفة', 'المشعر الحرام، وحدود مزدلفة'],
  ['jamarat', 'الجمرات', 'الصغرى ثم الوسطى ثم العقبة']
];
/* ---------- رحلتي في الحرم ---------- */
function hajjStrideDialog() {
  const s = hajjLoad().settings;
  document.querySelector('.hj-dialog')?.remove();
  const d = document.createElement('div'); d.className = 'hj-dialog';
  d.innerHTML = `<div class="hj-dialog-card"><h3>طول الخطوة</h3><p>متوسط طول خطوتك بالمتر، ويُستخدم لتقدير المسافة من عدد الخطوات (الشائع بين ٠٫٦ و٠٫٨ م).</p><input type="number" step="0.01" min="0.4" max="1.2" value="${s.stride}" inputmode="decimal" class="hj-input"><div><button class="hj-btn" data-x>إلغاء</button><button class="hj-btn gold" data-ok>حفظ</button></div></div>`;
  hajjArabic(d);
  d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-x]')) d.remove(); else if (e.target.closest('[data-ok]')) { const v = parseFloat(d.querySelector('input').value); if (!(v >= 0.4 && v <= 1.2)) { showSmallNotice('أدخل قيمة بين ٠٫٤ و١٫٢'); return } s.stride = Math.round(v * 100) / 100; hajjSave(); d.remove(); hajjRerender() } });
  document.body.append(d);
}

/* ---------- التقرير: ملخص رحلتي الإيمانية ---------- */
function hajjDeleteTrip(id) {
  hajjDialog('حذف الرحلة؟', 'ستُحذف الرحلة وإحصائياتها من جهازك نهائيًا.', 'حذف', () => { const s = hajjLoad(); s.trips = s.trips.filter(t => t.id !== id); hajjSave(); hajjJourney() });
}
/* PDF من صفحة واحدة تحتوي صورة التقرير (JPEG) — بلا مكتبات */
function hajjPdfFromJpeg(dataUrl, w, h) {
  const bin = atob(dataUrl.split(',')[1]), img = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) img[i] = bin.charCodeAt(i);
  const pw = 595, ph = Math.round(595 * h / w), enc = new TextEncoder(), parts = [], offsets = []; let len = 0;
  const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length };
  const obj = (n, body) => { offsets[n] = len; push(n + ' 0 obj\n'); body(); push('\nendobj\n') };
  push('%PDF-1.4\n'); push(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));
  const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
  obj(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
  obj(4, () => { push(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`); push(img); push('\nendstream') });
  obj(5, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
  const xref = len; push(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map(n => String(offsets[n]).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const out = new Uint8Array(len); let o = 0; for (const p of parts) { out.set(p, o); o += p.length }
  let s = ''; for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode.apply(null, out.subarray(i, i + 0x8000));
  return 'data:application/pdf;base64,' + btoa(s);
}
async function hajjExport(id, format, action) {
  const trip = hajjTrip(id); if (!trip) return;
  showSmallNotice('جارٍ تجهيز الملخص…');
  const c = await hajjReportCanvas(trip), stamp = new Date(trip.startedAt).toISOString().slice(0, 10);
  const isPdf = format === 'pdf', data = isPdf ? hajjPdfFromJpeg(c.toDataURL('image/jpeg', 0.9), c.width, c.height) : c.toDataURL('image/png');
  const mime = isPdf ? 'application/pdf' : 'image/png', name = `Mushafi-${trip.kind}-${stamp}.${isPdf ? 'pdf' : 'png'}`;
  if (hajjNative.call(action === 'save' ? 'hajjSaveFile' : 'hajjShareFile', data, mime, name)) return;
  const a = document.createElement('a'); a.href = data; a.download = name; document.body.append(a); a.click(); a.remove();
}

/* إعادة تحديث الإحصاءات عند العودة للتطبيق (الوقت يُحسب من الطوابع الزمنية فيستمر بعد الإغلاق) */
document.addEventListener('visibilitychange', () => { if (!document.hidden && hajjView === 'trackers') { hajjNative.call('hajjStepsQuery'); hajjRefreshLive() } });

/* ---------- مكونات بصرية بأسلوب مصحفي ---------- */
function hjHero({ kicker = '', title = '', meta = '', verse = '', body = '', cls = '' }) {
  return `<section class="hj-hero ${cls}">${kicker ? `<span class="hj-kicker">${kicker}</span>` : ''}${title ? `<strong class="hj-hero-title">${title}</strong>` : ''}${meta ? `<span class="hj-hero-meta">${meta}</span>` : ''}${body}${verse ? `<p class="hj-verse" translate="no" lang="ar" dir="rtl">﴿${verse}﴾</p>` : ''}</section>`;
}
function hjLabel(title, aside = '') { return `<div class="section-label"><h2>${title}</h2>${aside ? `<span class="hj-label-aside">${aside}</span>` : ''}</div>` }
function hjMenu(rows) { return `<div class="content-card menu-list hj-menu">${rows.join('')}</div>` }
function hjNotice(icon, title, sub, btn, action) { return `<div class="hj-notice"><span>${uiIcon(icon)}</span><div><strong>${title}</strong><small>${sub}</small></div>${btn ? `<button onclick="${action}">${btn}</button>` : ''}</div>` }
function hjStat(value, label, note = '') { return `<span class="hj-stat"><b>${value}</b><small>${label}</small>${note ? `<em>${note}</em>` : ''}</span>` }
const HJ_ART = {
  umrah: '<svg viewBox="0 0 120 90" class="hj-art" aria-hidden="true"><ellipse cx="60" cy="70" rx="50" ry="13" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-dasharray="3 4"/><ellipse cx="60" cy="70" rx="36" ry="9" fill="none" stroke="currentColor" stroke-opacity=".55"/><path d="M42 30 60 22l18 8v34l-18 8-18-8z" fill="currentColor" fill-opacity=".9"/><path d="M42 30l18 8 18-8M60 38v34" stroke="#000" stroke-opacity=".25" fill="none"/><path d="M42 40l18 8 18-8" stroke="var(--gold)" stroke-width="2.2" fill="none"/><path d="m92 62 6 5-7 3" fill="none" stroke="currentColor" stroke-opacity=".6"/></svg>',
  hajj: '<svg viewBox="0 0 120 90" class="hj-art" aria-hidden="true"><path d="M6 74c18-20 30-30 44-30s22 14 34 14 18-8 30-6" fill="none" stroke="currentColor" stroke-opacity=".35"/><path d="M30 74 52 40l22 34z" fill="currentColor" fill-opacity=".85"/><path d="M52 40v-8" stroke="var(--gold)" stroke-width="2"/><path d="M70 74l14-14 14 14zM12 74l10-10 10 10z" fill="currentColor" fill-opacity=".45"/><circle cx="92" cy="22" r="7" fill="none" stroke="var(--gold)" stroke-width="1.6"/></svg>'
};

/* ---------- الصفحة الرئيسية للقسم ---------- */
function hajjHome(origin) {
  if (origin) hajjBack = origin === 'more' ? 'moreHome()' : 'home()';
  hajjEnter('home');
  const trip = hajjActiveTrip(), act = hajjActivity(trip);
  let resume = '';
  if (trip) {
    const stages = trip.kind === 'visit' ? [] : hajjStagesFor(trip.kind, trip.type), done = stages.filter(s => trip.stages[s.id]).length, pct = stages.length ? Math.round(done / stages.length * 100) : 0;
    resume = `<button class="hj-resume" onclick="${act ? `hajjTracker('${act.kind}')` : hajjGuideFor(trip)}"><span class="hj-live-dot"></span><span class="hj-resume-text"><small>رحلة جارية</small><strong>${hajjKindTitle(trip)}</strong><em>${act ? hjF('{0} · الشوط {1} من ٧', hjT(act.kind === 'tawaf' ? 'الطواف' : 'السعي'), hjAr(Math.min(act.rounds.length + 1, 7))) : stages.length ? hjF('{0} من {1} مراحل', hjAr(done), hjAr(stages.length)) : hjF('بدأت {0}', hajjTime(trip.startedAt))}</em>${stages.length ? `<i class="hj-bar"><i style="width:${pct}%"></i></i>` : ''}</span>${uiIcon('arrow')}</button>`;
  }
  app.innerHTML = sectionHeading('الحج والعمرة', 'دليلك في المناسك خطوة بخطوة', hajjBack) + `<div class="hj-page">
    ${hjHero({ kicker: 'الحج والعمرة', title: 'لبيك اللهم لبيك', meta: 'المناسك بترتيبها الصحيح، مع عدّ أشواط الطواف والسعي، وحفظ رحلتك على جهازك', verse: 'وَأَتِمُّوا الْحَجَّ وَالْعُمْرَةَ لِلَّهِ' })}
    ${resume}
    <div class="hj-paths">
      <button class="hj-path" onclick="hajjGuide('umrah')">${HJ_ART.umrah}<strong>العمرة</strong><small>من الإحرام حتى التحلل</small><em>${hjF('{0} مراحل', hjAr(UMRAH_STAGES.length))}</em></button>
      <button class="hj-path hajj" onclick="hajjOpenHajj()">${HJ_ART.hajj}<strong>الحج</strong><small>التمتع والإفراد والقران</small><em>من يوم التروية حتى الوداع</em></button>
    </div>
    ${hjLabel('أدوات الرحلة')}
    ${hjMenu([
      listAction('walk', 'رحلتي في الحرم', 'خطواتك ومسافتك ووقتك، والرحلات السابقة', 'hajjJourney()'),
      listAction('cube', 'المجسمات ثلاثية الأبعاد', 'الكعبة والمسعى ومنى وعرفة ومزدلفة والجمرات', 'hajjModels()'),
      trip ? '' : listAction('kaaba', 'طواف أو سعي منفرد', 'عدّ الأشواط والوقت دون رحلة كاملة', 'hajjStartVisit()')
    ])}
    <p class="hj-foot">المحتوى مستند إلى أدلة وزارة الحج والعمرة ومنصة نسك وفتاوى أهل العلم. ${HAJJ_SOURCES.map(s => `<button class="hj-link" onclick="hajjOpenSource('${s.url}')">${s.name.split(' — ')[0]}</button>`).join(' · ')}</p>
  </div>`;
  hajjFinishRender();
}
function hajjOpenHajj() { const t = hajjActiveTrip(); if (t && t.kind === 'hajj') hajjGuide('hajj'); else hajjTypePicker() }

/* ---------- اختيار النسك ---------- */
function hajjTypePicker() {
  hajjEnter('types');
  const last = hajjLoad().settings.hajjType;
  app.innerHTML = sectionHeading('الحج', 'اختر نسكك لتظهر لك أعماله بترتيبها', 'hajjHome()') + `<div class="hj-page">
    ${hjHero({ kicker: 'أنواع النسك', title: 'بأي نسك تحج؟', meta: 'الأنساك الثلاثة مشروعة، وتختلف في الهدي وعدد مرات الطواف والسعي، وفي التحلل بعد العمرة' })}
    <div class="hj-types">${Object.entries(HAJJ_TYPES).map(([k, t]) => `<button class="hj-type ${last === k ? 'last' : ''}" onclick="hajjPickType('${k}')">
      <span class="hj-type-top"><strong>${t.title}</strong>${last === k ? '<em>اختيارك السابق</em>' : ''}<span class="hj-type-go">${uiIcon('arrow')}</span></span>
      <span class="hj-intent" translate="no" lang="ar" dir="rtl">${t.intent}</span>
      <span class="hj-type-brief">${t.brief}</span>
      <span class="hj-type-tags"><i class="${k === 'ifrad' ? '' : 'on'}">${k === 'ifrad' ? 'لا هدي عليه' : 'يجب الهدي'}</i><i>${k === 'tamattu' ? 'طوافان وسعيان' : 'طواف وسعي واحد'}</i><i>${k === 'tamattu' ? 'يتحلل بعد العمرة' : 'يبقى محرمًا إلى يوم النحر'}</i></span>
      ${t.note ? `<small>${t.note}</small>` : ''}
    </button>`).join('')}</div>
  </div>`;
  hajjFinishRender();
}
function hajjPickType(k) { hajjLoad().settings.hajjType = k; hajjSave(); hajjGuide('hajj') }

/* ---------- الدليل ---------- */
function hajjStagesFor(kind, type) {
  if (kind === 'umrah') return UMRAH_STAGES;
  return HAJJ_STAGES.filter(s => !s.types || s.types.includes(type));
}
function hajjGuide(kind) {
  const s = hajjLoad().settings, active = hajjActiveTrip(), trip = active && active.kind === kind ? active : null;
  const type = kind === 'hajj' ? (trip?.type || s.hajjType) : null;
  if (kind === 'hajj' && !type) return hajjTypePicker();
  hajjEnter(kind);
  const stages = hajjStagesFor(kind, type), done = trip ? stages.filter(x => trip.stages[x.id]).length : 0;
  const title = kind === 'umrah' ? hjT('العمرة') : hjF('حج {0}', hjT(HAJJ_TYPES[type].title));
  const back = kind === 'hajj' && !trip ? 'hajjTypePicker()' : 'hajjHome()';
  const openId = trip ? (hajjFirstOpen(trip, kind, type) || '') : stages[0].id;
  let hero;
  if (trip) hero = hajjTripHero(trip, stages, done);
  else if (active) hero = hjHero({ kicker: kind === 'umrah' ? 'العمرة' : 'الحج', title, meta: hjF('لديك رحلة جارية ({0}). أنهِها من صفحتها لتبدأ رحلة جديدة.', hajjKindTitle(active)) });
  else hero = hjHero({
    kicker: kind === 'umrah' ? 'دليل العمرة' : hjF('نسكك: {0}', hjT(HAJJ_TYPES[type].title)), title: kind === 'umrah' ? 'عمرتك خطوة بخطوة' : title,
    meta: kind === 'umrah' ? 'إحرام، فطواف، فسعي، ثم حلق أو تقصير' : HAJJ_TYPES[type].brief,
    body: `<button class="hj-hero-cta" onclick="hajjStartTrip('${kind}')">${uiIcon('play')}<span>${hjF('ابدأ رحلة {0}', hjT(kind === 'umrah' ? 'العمرة' : 'الحج'))}</span></button><span class="hj-hero-fine">يحفظ تقدمك وأشواطك ووقتك وخطواتك على جهازك فقط</span>`
  });
  app.innerHTML = sectionHeading(title, kind === 'umrah' ? 'من الإحرام حتى التحلل' : 'المناسك من البداية حتى النهاية', back) + `<div class="hj-page">
    ${hero}
    ${trip ? hajjStepsNotice(trip) : ''}
    ${hjLabel('المراحل', trip ? hjF('{0} من {1}', hjAr(done), hjAr(stages.length)) : hjF('{0} مراحل', hjAr(stages.length)))}
    <div class="hj-timeline">${stages.map((st, i) => hajjStageCard(st, i, trip, type, kind, st.id === openId)).join('')}</div>
    <p class="hj-foot">لا يُخص شوط من الطواف أو السعي بدعاء معيّن؛ والأذكار هنا ثابتة بأدلتها.</p>
  </div>`;
  hajjFinishRender();
}
function hajjTripHero(trip, stages, done) {
  const t = hajjTripTotals(trip), pct = Math.round(done / stages.length * 100);
  return `<section class="hj-hero hj-trip-hero">
    <span class="hj-kicker"><i class="hj-live-dot"></i>${hjF('رحلتك الجارية · منذ {0}', hajjTime(trip.startedAt))}</span>
    <div class="hj-trip-row"><strong class="hj-hero-title">${hjF('{0} من {1} مراحل', hjAr(done), hjAr(stages.length))}</strong><span class="hj-pct">${hjPct(pct)}</span></div>
    <i class="hj-bar big"><i style="width:${pct}%"></i></i>
    <div class="hj-stats4">${hjStat(t.steps == null ? '—' : hajjNum(t.steps), 'خطوة')}${hjStat(hajjKm(t.dist), 'المسافة')}${hjStat(hjAr(t.tawaf), 'طواف')}${hjStat(hjAr(t.sai), 'سعي')}</div>
    <div class="hj-hero-actions"><button onclick="hajjReport('${trip.id}')">${uiIcon('chart')}الملخص</button><button class="end" onclick="hajjConfirmEndTrip()">${uiIcon('flag')}إنهاء الرحلة</button></div>
  </section>`;
}
function hajjStepsNotice(trip) {
  if (trip.stepsSession) return '';
  const st = hajjNative.status();
  if (st.permission === 'unsupported' || !st.available) return hjNotice('info', 'حساب الخطوات غير متاح', 'ستُقدَّر المسافة بحسب عدد الأشواط', '', '');
  return hjNotice('walk', 'احسب خطواتك', 'يُستخدم مستشعر الخطوات أثناء الرحلة فقط، وتبقى البيانات على جهازك', st.permission === 'denied' ? 'الإعدادات' : 'السماح', 'hajjAskSteps()');
}
function hajjStepsCard(trip) { return hajjStepsNotice(trip) }
function hajjAskSteps() { const trip = hajjActiveTrip(); if (!trip) return; if (hajjNative.status().permission === 'granted') { hajjBeginSteps(trip); hajjRerender() } else hajjNative.call('hajjStepPermission') }

function hajjStageCard(st, i, trip, type, kind, open) {
  const done = trip?.stages[st.id], byType = st.byType && type ? st.byType[type] : '';
  const trackers = [...(st.trackers || (st.tracker ? [st.tracker] : []))];
  if (st.optionalSai) trackers.push('sai');
  const saiNotNeeded = st.saiStage && type !== 'tamattu' && trip && hajjDidQudumSai(trip);
  const tabs = [
    st.steps?.length && ['how', 'الصفة', `<ol class="hj-ol">${st.steps.map(x => `<li>${x}</li>`).join('')}</ol>`],
    st.dhikr?.length && ['dhikr', 'الأذكار', st.dhikr.map(k => HAJJ_DHIKR[k]).filter(Boolean).map(d => `<blockquote class="hj-dhikr"><p translate="no" lang="ar" dir="rtl">${d.text}</p><p class="hj-meaning">${d.text}</p><cite>${d.ref}</cite></blockquote>`).join('')],
    st.mistakes?.length && ['err', 'أخطاء شائعة', `<ul class="hj-ul warn">${st.mistakes.map(x => `<li>${x}</li>`).join('')}</ul>`],
    st.rules?.length && ['rules', 'أحكام', `<ul class="hj-ul">${st.rules.map(x => `<li>${x}</li>`).join('')}</ul>`]
  ].filter(Boolean);
  const primary = trip && !saiNotNeeded ? trackers.map((k, n) => `<button class="hj-track ${n ? 'alt' : ''}" onclick="hajjStartActivity('${k}','${st.id}')">${uiIcon(k === 'tawaf' ? 'kaaba' : 'route')}<span>${hajjTrackerLabel(trip, k, st.id)}</span></button>`).join('') : '';
  return `<section class="hj-st ${done ? 'done' : ''} ${open ? 'open' : ''}" data-st="${st.id}">
    <button class="hj-st-head" onclick="hajjStageToggle('${st.id}')" aria-expanded="${open}">
      <span class="hj-st-node">${done ? uiIcon('check') : hjAr(i + 1)}</span>
      <span class="hj-st-title"><strong>${st.title}</strong><small><em class="hj-status ${st.status}">${HAJJ_STATUS[st.status]}</em>${st.day ? '<span>' + st.day + '</span>' : ''}</small></span>
      <span class="hj-st-chev">${uiIcon('chev')}</span>
    </button>
    <div class="hj-st-body"><div class="hj-st-inner"><div class="hj-st-content">
      <p class="hj-brief">${st.brief}</p>
      ${byType ? `<p class="hj-callout">${uiIcon('flag')}<span><b>${hjF('في {0}:', hjT(HAJJ_TYPES[type].title))}</b> ${byType}</span></p>` : ''}
      ${saiNotNeeded ? `<p class="hj-callout ok">${uiIcon('check')}<span>سجّلتَ سعيًا بعد طواف القدوم، فلا سعي عليك الآن.</span></p>` : ''}
      ${primary ? `<div class="hj-tracks">${primary}</div>` : ''}
      ${tabs.length ? `<div class="hj-tabs" role="tablist">${tabs.map((t, n) => `<button role="tab" class="${n ? '' : 'on'}" onclick="hajjTab(this,'${t[0]}')">${t[1]}</button>`).join('')}</div><div class="hj-panels">${tabs.map((t, n) => `<div class="hj-panel ${n ? '' : 'on'}" data-p="${t[0]}">${t[2]}</div>`).join('')}</div>` : ''}
      <div class="hj-st-actions">
        ${st.scene ? `<button onclick="hajjModel('${st.scene}','${st.id === 'aqaba' ? 'aqaba' : ''}')">${uiIcon('cube')}المجسم</button>` : ''}
        ${trip ? `<button class="${done ? '' : 'ok'}" onclick="hajjToggleStage('${st.id}')">${uiIcon(done ? 'undo' : 'check')}${done ? 'إلغاء الإنجاز' : 'أتممت هذه المرحلة'}</button>` : ''}
      </div>
    </div></div></div>
  </section>`;
}
/* أكورديون: تُفتح مرحلة واحدة بسلاسة وتُغلق الأخرى */
function hajjStageToggle(id) {
  const box = app.querySelector('.hj-timeline'); if (!box) return;
  const el = box.querySelector(`[data-st="${id}"]`), opening = !el.classList.contains('open');
  box.querySelectorAll('.hj-st.open').forEach(x => { if (x !== el) { x.classList.remove('open'); x.querySelector('.hj-st-head').setAttribute('aria-expanded', 'false') } });
  el.classList.toggle('open', opening); el.querySelector('.hj-st-head').setAttribute('aria-expanded', String(opening));
  if (opening) setTimeout(() => { const r = el.getBoundingClientRect(); if (r.top < 70 || r.top > innerHeight * 0.55) scrollTo({ top: scrollY + r.top - 90, behavior: 'smooth' }) }, 380);
}
function hajjTab(btn, key) {
  const st = btn.closest('.hj-st-content');
  st.querySelectorAll('.hj-tabs button').forEach(b => b.classList.toggle('on', b === btn));
  st.querySelectorAll('.hj-panel').forEach(p => p.classList.toggle('on', p.dataset.p === key));
}
function hajjTrackerLabel(trip, kind, stage) {
  const a = trip.activities.filter(x => x.kind === kind && x.stage === stage).pop(), name = kind === 'tawaf' ? 'الطواف' : 'السعي';
  if (a && !a.endedAt) return hjF('متابعة {0} · الشوط {1}', hjT(name), hjAr(Math.min(a.rounds.length + 1, 7)));
  if (a && a.rounds.length >= 7) return hjF('{0} مكتمل ✓', hjT(name));
  return hjF('ابدأ {0}', hjT(name));
}
function hajjFirstOpen(trip, kind, type) { return hajjStagesFor(kind, type).find(s => !trip.stages[s.id])?.id }
function hajjDidQudumSai(trip) { return trip.activities.some(a => a.kind === 'sai' && a.stage === 'qudum' && a.rounds.length >= 7) }
function hajjToggleStage(id) {
  const trip = hajjActiveTrip(); if (!trip) return;
  if (trip.stages[id]) delete trip.stages[id]; else trip.stages[id] = Date.now();
  hajjSave(); const y = scrollY; hajjRerender(); scrollTo(0, y);
}

function hajjTracker(kind) {
  hajjCurrentKind = kind;
  const trip = hajjActiveTrip(), a = hajjActivity(trip);
  if (!trip || !a || a.kind !== kind) { hajjHome(); return }
  hajjEnter('trackers');
  const isT = kind === 'tawaf', s = hajjLoad().settings;
  app.innerHTML = sectionHeading(isT ? 'الطواف' : 'السعي', isT ? 'الكعبة عن يسارك، والبداية والنهاية عند محاذاة الحجر الأسود' : 'يبدأ بالصفا وينتهي بالمروة', hajjGuideFor(trip)) + `<div class="hj-page hj-live">
    <div class="hj-stage3d" id="hj-3d"><div class="hj-3d-tools">${isT ? `<button class="hj-pill" id="hj-path" onclick="hajjPathDialog()">${uiIcon('route')}<span>${HAJJ_TAWAF_PATHS[a.path].title}</span></button>` : ''}<span class="hj-grow"></span><button class="hj-pill icon" aria-label="الوضع الافتراضي" onclick="hajjViewer&&hajjViewer.reset()">${uiIcon('repeat')}</button><button class="hj-pill icon ${s.light ? 'on' : ''}" id="hj-light" aria-label="وضع خفيف" onclick="hajjToggleLight()">${uiIcon('leaf')}</button></div><p class="hj-3d-note">المؤشر يوضح الاتجاه فقط، وليس موقعك</p></div>
    <section class="hj-hero hj-counter">
      <div class="hj-counter-top">
        <div class="hj-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="bg"/><circle cx="60" cy="60" r="52" class="fg" id="hj-ring-fg" stroke-dasharray="326.7" stroke-dashoffset="326.7"/>${Array.from({ length: 7 }, (_, i) => { const ang = -Math.PI / 2 + (i + 1) / 7 * Math.PI * 2; return `<circle cx="${(60 + Math.cos(ang) * 52).toFixed(1)}" cy="${(60 + Math.sin(ang) * 52).toFixed(1)}" r="3.2" class="tick" data-t="${i}"/>` }).join('')}</svg><div><small>الشوط</small><strong id="hj-cur">١</strong><span>من ٧</span></div></div>
        <div class="hj-dir" id="hj-dir"></div>
      </div>
      <div class="hj-stats4">
        <span class="hj-stat"><b id="hj-time">٠:٠٠</b><small>الوقت</small></span>
        <span class="hj-stat"><b id="hj-steps">—</b><small>خطوة</small></span>
        <span class="hj-stat"><b id="hj-dist">٠ م</b><small>المسافة</small></span>
        <span class="hj-stat"><b id="hj-pct">٠٪</b><small>الإنجاز</small></span>
      </div>
      <p class="hj-src" id="hj-src"></p>
    </section>
    <div class="hj-controls">
      <button class="hj-main" id="hj-done" onclick="hajjRoundDone()">${uiIcon('check')}<span>أتممت الشوط</span></button>
      <div class="hj-ctrl-row">
        <button id="hj-undo" onclick="hajjUndoRound()">${uiIcon('undo')}<span>تراجع</span></button>
        <button id="hj-pause" onclick="hajjPauseToggle()">${uiIcon('pause')}<span>إيقاف مؤقت</span></button>
        <button class="end" onclick="hajjFinishActivity()">${uiIcon('flag')}<span>إنهاء</span></button>
      </div>
    </div>
    <div class="hj-complete" id="hj-complete" hidden></div>
    ${hajjStepsNotice(trip)}
    <div id="hj-rounds"></div>
  </div>`;
  hajjFinishRender();
  hajjMount3D(isT ? 'kaaba' : 'masaa', a);
  hajjRefreshLive();
  hajjTick = setInterval(hajjRefreshLive, 1000);
  hajjPoll = setInterval(() => { if (!document.hidden) hajjNative.call('hajjStepsQuery') }, s.light ? 15000 : 5000);
  hajjNative.call('hajjStepsQuery');
}
function hajjRefreshLive() {
  if (hajjView !== 'trackers') return;
  const trip = hajjActiveTrip(), a = hajjActivity(trip); if (!a) return;
  const n = a.rounds.length, isT = a.kind === 'tawaf', $ = id => document.getElementById(id);
  if (!$('hj-cur')) return;
  $('hj-cur').textContent = hjAr(Math.min(n + 1, 7));
  $('hj-ring-fg').setAttribute('stroke-dashoffset', (326.7 * (1 - n / 7)).toFixed(1));
  app.querySelectorAll('.hj-ring .tick').forEach(t => t.classList.toggle('on', +t.dataset.t < n));
  $('hj-time').textContent = hajjClock(hajjActiveMs(a));
  const steps = hajjActSteps(trip, a), dist = hajjActDistance(trip, a);
  $('hj-steps').textContent = steps == null ? '—' : hajjNum(steps);
  $('hj-dist').textContent = hajjKm(dist.m);
  $('hj-pct').textContent = hjPct(Math.round(n / 7 * 100));
  $('hj-src').textContent = hjT(steps == null ? (trip.stepsSession ? 'بانتظار مستشعر الخطوات' : 'الخطوات غير مفعّلة') : 'الخطوات من مستشعر الهاتف') + ' · ' + hjF('المسافة {0}', hjT(hajjSrcLabel[dist.src]));
  const curStart = n ? a.rounds[n - 1].active : 0, curMs = hajjActiveMs(a) - curStart;
  const raml = n < 3 && ['tawaf', 'umrah', 'qudum'].includes(a.stage);
  $('hj-dir').innerHTML = n >= 7 ? `<span class="hj-kicker">تم بحمد الله</span><b>${hjF('اكتمل {0}', hjT(isT ? 'الطواف' : 'السعي'))}</b>` : isT
    ? `<span class="hj-kicker">${hjF('الشوط {0} من ٧', hjAr(n + 1))}</span><b>${n === 6 ? 'الشوط الأخير' : 'حول الكعبة'}</b><span>${raml ? 'يُسن الرمل للرجال في الأشواط الثلاثة الأولى' : 'ابدأ من محاذاة الحجر الأسود وانتهِ إليها'}</span><em>${uiIcon('clock')}${hajjClock(curMs)}</em>`
    : `<span class="hj-kicker">${hjF('الشوط {0} من ٧', hjAr(n + 1))}</span><b>${n % 2 === 0 ? 'من الصفا إلى المروة' : 'من المروة إلى الصفا'}</b><span>${n === 6 ? 'الشوط الأخير، ينتهي عند المروة' : 'أسرع بين العلمين الأخضرين (للرجال)'}</span><em>${uiIcon('clock')}${hajjClock(curMs)}</em>`;
  const paused = !!a.pausedAt;
  $('hj-pause').innerHTML = uiIcon(paused ? 'play' : 'pause') + `<span>${paused ? 'استئناف' : 'إيقاف مؤقت'}</span>`;
  $('hj-pause').classList.toggle('on', paused);
  $('hj-done').disabled = paused || n >= 7; $('hj-undo').disabled = n === 0;
  document.querySelector('.hj-live')?.classList.toggle('paused', paused);
  const box = $('hj-rounds');
  if (box.dataset.n !== String(n)) {
    box.dataset.n = n;
    box.innerHTML = n ? hjLabel('الأشواط المكتملة', hjF('{0} من ٧', hjAr(n))) + hjMenu(a.rounds.map((r, i) => `<div class="hj-round"><span class="hj-round-n">${hjAr(i + 1)}</span><span>${a.kind === 'sai' ? (i % 2 === 0 ? 'الصفا ← المروة' : 'المروة ← الصفا') : hjF('الشوط {0}', hjAr(i + 1))}</span><b>${hajjClock(r.ms)}</b></div>`).reverse()) : '';
  }
  const done = $('hj-complete');
  if (n >= 7 && done.hidden) {
    done.hidden = false;
    done.innerHTML = `<span class="hj-complete-ico">${uiIcon('check')}</span><strong>${isT ? 'تقبّل الله طوافك' : 'انتهى سعيك عند المروة'}</strong><p>${isT ? 'صلِّ ركعتين خلف مقام إبراهيم إن تيسر، أو في أي مكان من المسجد، واشرب من ماء زمزم.' : hjT('تقبّل الله منك.') + (trip.kind === 'umrah' || a.stage === 'umrah' ? ' ' + hjT('الخطوة التالية: الحلق أو التقصير.') : '')}</p><button class="hj-main small" onclick="hajjFinishActivity(true)">${uiIcon('check')}<span>${hjF('حفظ {0}', hjT(isT ? 'الطواف' : 'السعي'))}</span></button>`;
  } else if (n < 7) done.hidden = true;
}

/* ---------- المجسمات ---------- */
function hajjModels() {
  hajjEnter('models');
  app.innerHTML = sectionHeading('المجسمات ثلاثية الأبعاد', 'اسحب للتدوير، وقرّب بإصبعين', 'hajjHome()') + `<div class="hj-page">
    ${hjHero({ kicker: 'تعرّف على المشاعر', title: 'قبل أن تصل', meta: 'مجسمات تعليمية تعمل دون إنترنت، توضّح الاتجاهات والمواقع ومراحل النسك' })}
    ${hjMenu(HAJJ_MODELS.map(([k, t, d]) => listAction('cube', t, d, `hajjModel('${k}')`)))}
  </div>`;
  hajjFinishRender();
}
function hajjModel(scene, mode) {
  const back = hajjView === 'umrah' || hajjView === 'hajj' ? `hajjGuide('${hajjView}')` : 'hajjModels()';
  const m = HAJJ_MODELS.find(x => x[0] === scene) || HAJJ_MODELS[0];
  hajjEnter('model');
  const tip = scene === 'kaaba' ? 'الطواف بعكس عقارب الساعة والكعبة عن يسارك. الحلقات تمثّل الأشواط، والخط الأخضر محاذاة الحجر الأسود.' : scene === 'masaa' ? 'يبدأ السعي بالصفا وينتهي بالمروة. الذهاب شوط والعودة شوط، والهرولة للرجال بين العلمين الأخضرين.' : 'مجسم تعليمي مبسّط للتوضيح، وليس خريطة دقيقة للمسافات أو الحدود.';
  app.innerHTML = sectionHeading(m[1], m[2], back) + `<div class="hj-page"><div class="hj-stage3d tall" id="hj-3d"><div class="hj-3d-tools"><span class="hj-grow"></span><button class="hj-pill icon" aria-label="الوضع الافتراضي" onclick="hajjViewer&&hajjViewer.reset()">${uiIcon('repeat')}</button></div><p class="hj-3d-note">اسحب للتدوير · قرّب بإصبعين · انقر مرتين للعودة</p></div>${hjNotice('info', 'للتوضيح', tip, '', '')}</div>`;
  hajjFinishRender();
  hajjMount3D(scene, scene === 'kaaba' ? { path: 'near', rounds: [] } : scene === 'masaa' ? { rounds: [] } : null, mode);
  if (scene === 'kaaba' && hajjViewer) Hajj3D.setTawafPath(hajjViewer, 'near', 0, true);
  if (scene === 'masaa' && hajjViewer) Hajj3D.setSaiProgress(hajjViewer, 0, true);
}

/* ---------- رحلتي في الحرم ---------- */
function hajjJourney() {
  hajjEnter('journey');
  const s = hajjLoad(), trips = [...s.trips].sort((a, b) => b.startedAt - a.startedAt), all = trips.map(t => ({ t, x: hajjTripTotals(t) }));
  const sum = all.reduce((o, { x }) => ({ steps: o.steps + (x.steps || 0), dist: o.dist + x.dist, ms: o.ms + x.ms, tawaf: o.tawaf + x.tawaf, sai: o.sai + x.sai }), { steps: 0, dist: 0, ms: 0, tawaf: 0, sai: 0 });
  const actDist = all.reduce((o, { t }) => o + t.activities.reduce((q, a) => q + hajjActDistance(t, a).m, 0), 0);
  const days = new Map();
  for (const t of trips) for (const a of t.activities) {
    const k = new Date(a.startedAt).toDateString(), d = days.get(k) || { at: a.startedAt, ms: 0, dist: 0, steps: 0, tawaf: 0, sai: 0 };
    d.ms += hajjActiveMs(a); d.dist += hajjActDistance(t, a).m; d.steps += hajjActSteps(t, a) || 0; d[a.kind] += a.rounds.length; days.set(k, d);
  }
  const active = hajjActiveTrip();
  app.innerHTML = sectionHeading('رحلتي في الحرم', 'بياناتك محفوظة على جهازك فقط', 'hajjHome()') + `<div class="hj-page">
    ${hjHero({ kicker: 'إجمالي ما قطعته', title: hajjKm(sum.dist), meta: trips.length ? hjF(trips.length === 1 ? '{0} رحلة · {1} من الطواف والسعي' : '{0} رحلات · {1} من الطواف والسعي', hjAr(trips.length), hajjDuration(sum.ms)) : 'ابدأ رحلة العمرة أو الحج لتظهر إحصاءاتك هنا',
      body: `<div class="hj-stats4">${hjStat(hajjNum(sum.steps), 'خطوة')}${hjStat(hjAr(sum.tawaf), 'شوط طواف')}${hjStat(hjAr(sum.sai), 'شوط سعي')}${hjStat(sum.ms > 60000 ? hjAr((actDist / 1000 / (sum.ms / 3600000)).toFixed(1)) : '—', 'كم/س متوسط')}</div>` })}
    ${active ? `<button class="hj-resume" onclick="${hajjGuideFor(active)}"><span class="hj-live-dot"></span><span class="hj-resume-text"><small>رحلة جارية</small><strong>${hajjKindTitle(active)}</strong></span>${uiIcon('arrow')}</button>` : hjMenu([listAction('kaaba', 'طواف أو سعي منفرد', 'لمن يطوف تطوعًا أو يريد عدّ الأشواط فقط', 'hajjStartVisit()')])}
    ${days.size ? hjLabel('الإحصائيات اليومية') + hjMenu([...days.values()].sort((a, b) => b.at - a.at).map(d => `<div class="hj-day"><span class="hj-day-ico">${uiIcon('chart')}</span><span class="hj-day-text"><strong>${hajjDate(d.at)}</strong><small>${hjF('طواف {0} · سعي {1} أشواط', hjAr(d.tawaf), hjAr(d.sai))}${d.steps ? ' · ' + hjF('{0} خطوة', hajjNum(d.steps)) : ''}</small></span><span class="hj-day-val"><b>${hajjKm(d.dist)}</b><small>${hajjDuration(d.ms)}</small></span></div>`)) : ''}
    ${hjLabel('الرحلات', trips.length ? hjAr(trips.length) : '')}
    ${trips.length ? hjMenu(all.map(({ t, x }) => listAction(t.kind === 'hajj' ? 'flag' : 'kaaba', hajjKindTitle(t) + (t.endedAt ? '' : ' · ' + hjT('جارية')), hajjDate(t.startedAt) + ' · ' + hajjKm(x.dist), `hajjReport('${t.id}')`))) : `<div class="hj-empty">${uiIcon('walk')}<strong>لا توجد رحلات بعد</strong><p>ابدأ رحلة العمرة أو الحج من صفحتها، وسيُحفظ كل شيء هنا</p></div>`}
    <p class="hj-foot">${hjF('الخطوات من مستشعر الهاتف، والمسافة تقديرية من الخطوات × طول خطوتك ({0} م) أو بحسب الأشواط. لا يُستخدم GPS داخل الحرم.', hjAr(s.settings.stride.toFixed(2)))} <button class="hj-link" onclick="hajjStrideDialog()">تعديل طول الخطوة</button></p>
  </div>`;
  hajjFinishRender();
}
function hajjStartVisit() {
  const s = hajjLoad(); if (hajjActiveTrip()) return;
  const trip = { id: hajjId(), kind: 'visit', type: null, startedAt: Date.now(), endedAt: null, stages: {}, activities: [], steps: 0, stepsSession: false };
  s.trips.push(trip); s.active = trip.id; hajjSave();
  if (hajjNative.status().permission === 'granted') hajjBeginSteps(trip);
  hajjVisitPage();
  if (!trip.stepsSession && hajjNative.status().permission === 'prompt') setTimeout(() => hajjNative.call('hajjStepPermission'), 350);
}
function hajjVisitPage() {
  const trip = hajjActiveTrip(); if (!trip || trip.kind !== 'visit') return hajjJourney();
  hajjEnter('visit');
  const t = hajjTripTotals(trip);
  app.innerHTML = sectionHeading('طواف وسعي', 'عدّ الأشواط والوقت والخطوات', 'hajjHome()') + `<div class="hj-page">
    <section class="hj-hero hj-trip-hero"><span class="hj-kicker"><i class="hj-live-dot"></i>${hjF('جارية منذ {0}', hajjTime(trip.startedAt))}</span>
      <div class="hj-stats4">${hjStat(t.steps == null ? '—' : hajjNum(t.steps), 'خطوة')}${hjStat(hajjKm(t.dist), 'المسافة')}${hjStat(hjAr(t.tawaf), 'طواف')}${hjStat(hjAr(t.sai), 'سعي')}</div>
      <div class="hj-hero-actions"><button onclick="hajjReport('${trip.id}')">${uiIcon('chart')}الملخص</button><button class="end" onclick="hajjConfirmEndTrip()">${uiIcon('flag')}إنهاء</button></div></section>
    ${hajjStepsNotice(trip)}
    <div class="hj-paths">
      <button class="hj-path" onclick="hajjStartActivity('tawaf','visit-'+Date.now())">${HJ_ART.umrah}<strong>طواف</strong><small>سبعة أشواط حول الكعبة</small></button>
      <button class="hj-path hajj" onclick="hajjStartActivity('sai','visit-'+Date.now())"><svg viewBox="0 0 120 90" class="hj-art" aria-hidden="true"><path d="M14 66c10-8 18-10 26-10M106 66c-10-8-18-10-26-10" fill="none" stroke="currentColor" stroke-opacity=".5"/><ellipse cx="18" cy="68" rx="12" ry="6" fill="currentColor" fill-opacity=".8"/><ellipse cx="102" cy="68" rx="10" ry="5" fill="currentColor" fill-opacity=".8"/><path d="M34 46h52" stroke="var(--gold)" stroke-width="2"/><path d="m80 41 6 5-6 5M40 41l-6 5 6 5" fill="none" stroke="var(--gold)" stroke-width="2"/></svg><strong>سعي</strong><small>سبعة أشواط بين الصفا والمروة</small></button>
    </div>
  </div>`;
  hajjFinishRender();
}

/* ---------- التقرير ---------- */
function hajjReport(id) {
  const trip = hajjTrip(id); if (!trip) return hajjJourney();
  hajjEnter('report');
  const x = hajjTripTotals(trip), stages = trip.kind === 'visit' ? [] : hajjStagesFor(trip.kind, trip.type), doneStages = stages.filter(s => trip.stages[s.id]);
  app.innerHTML = sectionHeading('ملخص رحلتي الإيمانية', hajjKindTitle(trip), trip.endedAt ? 'hajjJourney()' : hajjGuideFor(trip)) + `<div class="hj-page">
    <section class="hj-hero hj-report-hero">
      <div class="hj-report-brand">${typeof mushafiBrandIcon === 'function' ? mushafiBrandIcon() : ''}<span><span class="hj-kicker">${hajjKindTitle(trip)}</span><strong class="hj-hero-title">${hajjDate(trip.startedAt)}</strong><span class="hj-hero-meta">${hajjTime(trip.startedAt)} — ${trip.endedAt ? hajjTime(trip.endedAt) : hjT('جارية')} · ${hajjDuration(x.span)}</span></span></div>
      <div class="hj-big"><b>${hajjKm(x.dist)}</b><small>${hjF('إجمالي المسافة · {0}', hjT(hajjSrcLabel[x.src]))}</small></div>
      <div class="hj-stats4">${hjStat(x.steps == null ? '—' : hajjNum(x.steps), 'خطوة')}${hjStat(hajjDuration(x.ms), 'طواف وسعي')}${hjStat(hjAr(x.tawaf), 'شوط طواف')}${hjStat(hjAr(x.sai), 'شوط سعي')}</div>
      ${stages.length ? `<div class="hj-tags-wrap"><span class="hj-kicker">${hjF('المراحل المنجزة · {0} من {1}', hjAr(doneStages.length), hjAr(stages.length))}</span><div class="hj-tags">${stages.map(s => `<span class="${trip.stages[s.id] ? 'on' : ''}">${trip.stages[s.id] ? uiIcon('check') : ''}${s.title}</span>`).join('')}</div></div>` : ''}
      <p class="hj-verse" translate="no" lang="ar" dir="rtl">﴿وَأَتِمُّوا الْحَجَّ وَالْعُمْرَةَ لِلَّهِ﴾</p>
    </section>
    ${trip.activities.length ? hjLabel('الأنشطة') + hjMenu(trip.activities.map(a => `<div class="hj-day"><span class="hj-day-ico">${uiIcon(a.kind === 'tawaf' ? 'kaaba' : 'route')}</span><span class="hj-day-text"><strong>${hjF('{0} · {1} من ٧', hjT(a.kind === 'tawaf' ? 'طواف' : 'سعي'), hjAr(a.rounds.length))}</strong><small>${hajjTime(a.startedAt)}${hajjActSteps(trip, a) ? ' · ' + hjF('{0} خطوة', hajjNum(hajjActSteps(trip, a))) : ''}</small></span><span class="hj-day-val"><b>${hajjClock(hajjActiveMs(a))}</b><small>${hajjKm(hajjActDistance(trip, a).m)}</small></span></div>`)) : ''}
    ${hjLabel('حفظ ومشاركة')}
    ${hjMenu([listAction('share', 'مشاركة كصورة', 'بطاقة جاهزة للنشر بشعار مصحفي', `hajjExport('${trip.id}','image','share')`), listAction('share', 'مشاركة كملف PDF', 'للطباعة أو الإرسال', `hajjExport('${trip.id}','pdf','share')`), listAction('download', 'حفظ في الجهاز', 'صورة PNG', `hajjExport('${trip.id}','image','save')`), listAction('download', 'حفظ PDF في الجهاز', 'ملف PDF', `hajjExport('${trip.id}','pdf','save')`)])}
    ${trip.endedAt ? `<button class="hj-link danger" onclick="hajjDeleteTrip('${trip.id}')">حذف هذه الرحلة من السجل</button>` : ''}
  </div>`;
  hajjFinishRender();
}

/* بطاقة الملخص للمشاركة — بهوية مصحفي */
function hajjLoadImg(src) { return new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src }) }
async function hajjReportCanvas(trip) {
  // Same card as verse/dua sharing: Mushafi's glass panel on the dark story background, "مصحفي | Mushafi" beneath.
  const lang = typeof uiLocale === 'function' ? uiLocale() : 'ar', rtl = lang === 'ar' || lang === 'ur', fam = lang === 'bn' ? 'UiBengali, system-ui' : rtl ? 'AppArabic' : 'system-ui, AppArabic';
  try { await Promise.all([document.fonts?.load('700 40px AppArabic'), document.fonts?.load('40px Quran'), lang === 'bn' ? document.fonts?.load('700 40px UiBengali') : null]) } catch (e) {}
  const f = SC_FORMATS.story, bgImg = await scImage(f.src);
  const W = f.W, H = f.H, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), x = hajjTripTotals(trip), stages = trip.kind === 'visit' ? [] : hajjStagesFor(trip.kind, trip.type);
  const GOLD = '#dcbf86', INK = '#f6efe0', SOFT = 'rgba(246,239,224,.62)', [X0, Y0, X1, Y1] = f.box, CW = X1 - X0, CX = (X0 + X1) / 2;
  if (bgImg) g.drawImage(bgImg, 0, 0, W, H); else { g.fillStyle = '#121212'; g.fillRect(0, 0, W, H) }
  const rr = (x0, y0, w, h, r) => { g.beginPath(); g.moveTo(x0 + r, y0); g.arcTo(x0 + w, y0, x0 + w, y0 + h, r); g.arcTo(x0 + w, y0 + h, x0, y0 + h, r); g.arcTo(x0, y0 + h, x0, y0, r); g.arcTo(x0, y0, x0 + w, y0, r); g.closePath() };
  g.direction = rtl ? 'rtl' : 'ltr'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  const F = (w, s, fm = fam) => `${w} ${s}px ${fm}, sans-serif`;
  const fit = (t, max, size, w = 400, fm = fam) => { let z = size; g.font = F(w, z, fm); while (z > 14 && g.measureText(t).width > max) { z -= 2; g.font = F(w, z, fm) } return z };
  const pad = 70, inner = CW - pad * 2;
  // heading
  g.fillStyle = INK; fit(hjT('ملخص رحلتي الإيمانية'), inner, 54, 700); g.fillText(hjT('ملخص رحلتي الإيمانية'), CX, Y0 + 100);
  g.fillStyle = GOLD; fit(hjT(hajjKindTitle(trip)), inner, 36, 600); g.fillText(hjT(hajjKindTitle(trip)), CX, Y0 + 154);
  { const when = hajjDate(trip.startedAt) + '  ·  ' + (rtl ? '\u200f' : '') + hajjTime(trip.startedAt) + ' — ' + (trip.endedAt ? hajjTime(trip.endedAt) : hjT('جارية')); g.fillStyle = SOFT; fit(when, inner, 26); g.fillText(when, CX, Y0 + 200) }
  // distance
  const compact = stages.length > 8, dH = compact ? 172 : 200, sTop = Y0 + 236 + dH + 16, ch = compact ? 100 : 112;
  g.fillStyle = 'rgba(255,255,255,.05)'; rr(X0 + pad, Y0 + 236, inner, dH, 34); g.fill(); g.strokeStyle = 'rgba(220,191,134,.25)'; g.lineWidth = 2; g.stroke();
  g.fillStyle = SOFT; fit(hjT('إجمالي المسافة'), inner - 40, 26); g.fillText(hjT('إجمالي المسافة'), CX, Y0 + (compact ? 278 : 286));
  g.fillStyle = INK; g.font = F(700, compact ? 72 : 84); g.fillText(hajjKm(x.dist), CX, Y0 + (compact ? 344 : 364));
  g.fillStyle = 'rgba(246,239,224,.45)'; fit(hjT(hajjSrcLabel[x.src]), inner - 40, 20); g.fillText(hjT(hajjSrcLabel[x.src]), CX, Y0 + (compact ? 394 : 420));
  // four figures, 2 × 2
  const cells = [[hjT('الخطوات'), x.steps == null ? '—' : hajjNum(x.steps)], [hjT('المدة'), hjT(hajjDuration(x.span))], [hjT('أشواط الطواف'), hjAr(x.tawaf)], [hjT('أشواط السعي'), hjAr(x.sai)]];
  const gap = compact ? 14 : 18, cw = (inner - gap) / 2;
  cells.forEach(([k, v], i) => {
    const col = i % 2, row = Math.floor(i / 2), xx = rtl ? X1 - pad - (col + 1) * cw - col * gap : X0 + pad + col * (cw + gap), yy = sTop + row * (ch + gap);
    g.fillStyle = 'rgba(255,255,255,.045)'; rr(xx, yy, cw, ch, 26); g.fill();
    g.fillStyle = INK; fit(v, cw - 30, 44, 700); g.fillText(v, xx + cw / 2, yy + ch * 0.52); g.fillStyle = SOFT; fit(k, cw - 24, 22); g.fillText(k, xx + cw / 2, yy + ch * 0.82);
  });
  // stages
  let y = sTop + 2 * ch + gap + 44;
  if (stages.length) {
    const done = stages.filter(s => trip.stages[s.id]);
    { const t = hjF('المراحل المنجزة: {0} من {1}', hjAr(done.length), hjAr(stages.length)); g.fillStyle = GOLD; fit(t, inner, 26, 600); g.fillText(t, CX, y) }
    y += 22;
    // every stage is shown: the chips shrink until they fit in the rows left above the verse
    const widthOf = arr => arr.reduce((sum, t) => sum + g.measureText(t).width + 46, -12);
    let chip = 21, rows = [], rowH = 54;
    for (; chip >= 14; chip--) {
      g.font = F(500, chip); rowH = Math.round(chip * 2 + 12); rows = []; let line = [];
      for (const st of stages) { const nl = [...line, hjT(st.title)]; if (widthOf(nl) > inner && line.length) { rows.push(line); line = [hjT(st.title)] } else line = nl } if (line.length) rows.push(line);
      if (y + rows.length * rowH <= Y1 - 92) break;
    }
    for (const row of rows) {
      let xr = CX + widthOf(row) / 2;
      for (const t of (rtl ? row : [...row].reverse())) { const on = trip.stages[stages.find(st => hjT(st.title) === t).id], tw = g.measureText(t).width + 34, bh = rowH - 12; g.fillStyle = on ? 'rgba(220,191,134,.2)' : 'rgba(255,255,255,.05)'; rr(xr - tw, y, tw, bh, bh / 2); g.fill(); g.fillStyle = on ? GOLD : SOFT; g.fillText(t, xr - tw / 2, y + bh * 0.68); xr -= tw + 12 }
      y += rowH;
    }
  }
  g.fillStyle = GOLD; g.font = F(400, 38, 'Quran'); g.fillText('﴿وَأَتِمُّوا الْحَجَّ وَالْعُمْرَةَ لِلَّهِ﴾', CX, Y1 - 40);
  scBrand(g, W / 2, f.brandY, 40);
  return c;
}
