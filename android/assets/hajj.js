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
  leaf: '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19 13 11"/>'
});

const HAJJ_KEY = 'mushafi.hajj.v1';
/* القسم عربي المحتوى حاليًا، فتُعرض الأرقام والتواريخ بالعربية دائمًا */
const hjAr = n => String(n).replace(/\d/g, x => '٠١٢٣٤٥٦٧٨٩'[x]);
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
function hajjDuration(ms) { const m = Math.round(ms / 60000), h = Math.floor(m / 60); return h ? hjAr(h) + ' س ' + hjAr(m % 60) + ' د' : hjAr(m) + ' دقيقة' }
function hajjNum(n) { return hjAr(Math.round(n).toLocaleString('en-US')) }
function hajjKm(m) { return m >= 1000 ? hjAr((m / 1000).toFixed(2)) + ' كم' : hjAr(Math.round(m)) + ' م' }
function hajjDate(t) { try { return new Date(t).toLocaleDateString('ar-SA-u-ca-gregory-nu-arab', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) } catch (e) { return new Date(t).toDateString() } }
function hajjTime(t) { try { return new Date(t).toLocaleTimeString('ar-SA-u-nu-arab', { hour: 'numeric', minute: '2-digit' }) } catch (e) { return '' } }
const hajjKindTitle = t => t.kind === 'umrah' ? 'العمرة' : t.kind === 'hajj' ? 'الحج — ' + (HAJJ_TYPES[t.type]?.title || '') : 'طواف وسعي';

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
function hajjRerender() { const f = { home: hajjHome, umrah: () => hajjGuide('umrah'), hajj: () => hajjGuide('hajj'), journey: hajjJourney, visit: hajjVisitPage, models: hajjModels }[hajjView]; if (f) f(); else if (hajjView === 'trackers') hajjTracker(hajjCurrentKind) }
/* المحتوى الشرعي لهذا القسم بالعربية حاليًا؛ نمنع الترجمة الآلية الجزئية حتى لا تختلط الكلمات */
function hajjArabic(el) { el.setAttribute('translate', 'no'); el.setAttribute('lang', 'ar'); el.setAttribute('dir', 'rtl') }
function hajjFinishRender() { app.querySelectorAll(':scope > .screen-heading, :scope > .hj-page').forEach(hajjArabic); if (typeof revealSection === 'function') revealSection() }

/* ---------- الصفحة الرئيسية للقسم ---------- */
function hajjHome(origin) {
  if (origin) hajjBack = origin === 'more' ? 'moreHome()' : 'home()';
  hajjEnter('home');
  const trip = hajjActiveTrip(), act = hajjActivity(trip);
  app.innerHTML = sectionHeading('الحج والعمرة', 'دليل المناسك خطوة بخطوة، مع الطواف والسعي ورحلتك في الحرم', hajjBack) + `<div class="hj-page">
    ${trip ? `<button class="hj-resume" onclick="${act ? `hajjTracker('${act.kind}')` : hajjGuideFor(trip)}"><span class="hj-resume-dot"></span><span><small>رحلة جارية</small><strong>${hajjKindTitle(trip)}</strong><em>${act ? (act.kind === 'tawaf' ? 'الطواف' : 'السعي') + ' — الشوط ' + hjAr(Math.min(act.rounds.length + 1, 7)) + ' من ٧' : 'بدأت ' + hajjTime(trip.startedAt)}</em></span>${uiIcon('arrow')}</button>` : ''}
    <div class="hj-choices">
      <button class="hj-choice" onclick="hajjGuide('umrah')"><span class="hj-choice-ico">${uiIcon('kaaba')}</span><strong>العمرة</strong><small>دليل شامل من الإحرام حتى إتمام العمرة</small></button>
      <button class="hj-choice hajj" onclick="hajjGuide('hajj')"><span class="hj-choice-ico">${uiIcon('flag')}</span><strong>الحج</strong><small>المناسك من البداية حتى النهاية: التمتع والإفراد والقران</small></button>
    </div>
    <div class="hj-list">
      ${hlRowSafe('walk', 'رحلتي في الحرم', 'خطواتك ومسافتك ووقتك، والرحلات السابقة', 'hajjJourney()')}
      ${hlRowSafe('cube', 'المجسمات ثلاثية الأبعاد', 'الكعبة والمطاف، المسعى، منى وعرفة ومزدلفة والجمرات', 'hajjModels()')}
    </div>
    <p class="hj-source">المحتوى مستند إلى أدلة وزارة الحج والعمرة ومنصة نسك وفتاوى أهل العلم المعتمدين. ${HAJJ_SOURCES.map(s => `<button class="hj-link" onclick="hajjOpenSource('${s.url}')">${s.name}</button>`).join(' · ')}</p>
  </div>`;
  hajjFinishRender();
}
function hlRowSafe(icon, title, sub, action) { return `<button class="hj-row" onclick="${action}"><span class="hj-row-ico">${uiIcon(icon)}</span><span class="hj-row-text"><strong>${title}</strong><small>${sub}</small></span><span class="hj-row-arrow">${uiIcon('arrow')}</span></button>` }
function hajjOpenSource(url) { if (!hajjNative.call('openSourceUrl', url)) window.open(url, '_blank', 'noopener') }

/* ---------- الدليل: العمرة والحج ---------- */
function hajjStagesFor(kind, type) {
  if (kind === 'umrah') return UMRAH_STAGES;
  return HAJJ_STAGES.filter(s => !s.types || s.types.includes(type));
}
function hajjGuide(kind) {
  hajjEnter(kind);
  const s = hajjLoad().settings, active = hajjActiveTrip(), trip = active && (active.kind === kind) ? active : null;
  const type = kind === 'hajj' ? (trip?.type || s.hajjType) : null;
  if (kind === 'hajj' && !type) return hajjTypePicker();
  const stages = hajjStagesFor(kind, type), done = trip ? stages.filter(x => trip.stages[x.id]).length : 0;
  const title = kind === 'umrah' ? 'العمرة' : 'الحج';
  const other = active && active.kind !== kind;
  app.innerHTML = sectionHeading(title, kind === 'umrah' ? 'الإحرام، فالطواف، فالسعي، فالحلق أو التقصير' : 'نسكك: ' + HAJJ_TYPES[type].title, 'hajjHome()') + `<div class="hj-page">
    ${kind === 'hajj' ? `<div class="hj-type-bar"><span>${uiIcon('flag')}<b>${HAJJ_TYPES[type].title}</b> — ${HAJJ_TYPES[type].brief}</span>${trip ? '' : `<button class="hj-chip" onclick="hajjTypePicker()">تغيير</button>`}</div>` : ''}
    ${trip ? hajjTripCard(trip, stages, done) : other ? `<div class="hj-note">لديك رحلة جارية (${hajjKindTitle(active)}). أنهِها من صفحتها لتبدأ رحلة جديدة.</div>` : `<button class="hj-start" onclick="hajjStartTrip('${kind}')">${uiIcon('play')}<span><strong>ابدأ رحلة ${title} الآن</strong><small>يحفظ تقدمك في المناسك والأشواط والوقت والخطوات على جهازك</small></span></button>`}
    <div class="hj-stages">${stages.map((st, i) => hajjStageCard(st, i, trip, type, kind)).join('')}</div>
    <p class="hj-source">لا يُخص شوط من الطواف أو السعي بدعاء معيّن؛ وما ورد هنا من الأذكار ثابت بأدلته.</p>
  </div>`;
  hajjFinishRender();
}
function hajjTripCard(trip, stages, done) {
  const t = hajjTripTotals(trip), pct = Math.round(done / stages.length * 100);
  return `<section class="hj-trip">
    <div class="hj-trip-top"><span><small>رحلة جارية منذ ${hajjTime(trip.startedAt)}</small><strong>${hjAr(done)} من ${hjAr(stages.length)} مراحل</strong></span><span class="hj-pct">${hjAr(pct)}٪</span></div>
    <div class="hj-bar"><i style="width:${pct}%"></i></div>
    <div class="hj-mini"><span><b>${t.steps == null ? '—' : hajjNum(t.steps)}</b><small>خطوة</small></span><span><b>${hajjKm(t.dist)}</b><small>${hajjSrcLabel[t.src]}</small></span><span><b>${hjAr(t.tawaf)}</b><small>أشواط الطواف</small></span><span><b>${hjAr(t.sai)}</b><small>أشواط السعي</small></span></div>
    ${hajjStepsCard(trip)}
    <div class="hj-trip-actions"><button class="hj-btn ghost" onclick="hajjReport('${trip.id}')">${uiIcon('chart')}ملخص الرحلة</button><button class="hj-btn danger" onclick="hajjConfirmEndTrip()">${uiIcon('flag')}إنهاء الرحلة</button></div>
  </section>`;
}
function hajjStepsCard(trip) {
  if (trip.stepsSession) return '';
  const st = hajjNative.status();
  if (st.permission === 'unsupported' || !st.available) return `<p class="hj-hint">${uiIcon('info')}حساب الخطوات غير متاح على هذا الجهاز؛ ستُقدَّر المسافة بحسب الأشواط.</p>`;
  return `<div class="hj-perm">${uiIcon('walk')}<span><strong>احسب خطواتك</strong><small>يستخدم مستشعر الخطوات في هاتفك فقط أثناء الرحلة، وتبقى البيانات على جهازك.</small></span><button class="hj-chip gold" onclick="hajjAskSteps()">${st.permission === 'denied' ? 'الإعدادات' : 'السماح'}</button></div>`;
}
function hajjAskSteps() { const trip = hajjActiveTrip(); if (!trip) return; if (hajjNative.status().permission === 'granted') { hajjBeginSteps(trip); hajjRerender() } else hajjNative.call('hajjStepPermission') }

function hajjStageCard(st, i, trip, type, kind) {
  const done = trip?.stages[st.id], open = !trip ? i === 0 : !done && hajjFirstOpen(trip, kind, type) === st.id;
  const byType = st.byType && type ? st.byType[type] : '';
  const trackers = st.trackers || (st.tracker ? [st.tracker] : []);
  if (st.optionalSai) trackers.push('sai');
  const saiNotNeeded = st.saiStage && type !== 'tamattu' && trip && hajjDidQudumSai(trip);
  return `<details class="hj-stage${done ? ' done' : ''}" ${open ? 'open' : ''}>
    <summary><span class="hj-step-n">${done ? uiIcon('check') : hjAr(i + 1)}</span><span class="hj-stage-head"><strong>${st.title}</strong><small>${st.day ? st.day + ' · ' : ''}<em class="hj-status ${st.status}">${HAJJ_STATUS[st.status]}</em></small></span></summary>
    <div class="hj-stage-body">
      <p class="hj-brief">${st.brief}</p>
      ${byType ? `<p class="hj-bytype">${uiIcon('flag')}<span><b>في ${HAJJ_TYPES[type].title}:</b> ${byType}</span></p>` : ''}
      ${saiNotNeeded ? `<p class="hj-bytype ok">${uiIcon('check')}<span>سجّلتَ سعيًا بعد طواف القدوم، فلا سعي عليك الآن.</span></p>` : ''}
      ${st.steps?.length ? `<h4>الصفة</h4><ol class="hj-ol">${st.steps.map(x => `<li>${x}</li>`).join('')}</ol>` : ''}
      ${st.rules?.length ? `<h4>أحكام</h4><ul class="hj-ul">${st.rules.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
      ${st.dhikr?.length ? `<h4>الأذكار والأدعية</h4>${st.dhikr.map(k => HAJJ_DHIKR[k]).filter(Boolean).map(d => `<blockquote class="hj-dhikr"><p>${d.text}</p><cite>${d.ref}</cite></blockquote>`).join('')}` : ''}
      ${st.mistakes?.length ? `<h4>أخطاء شائعة</h4><ul class="hj-ul warn">${st.mistakes.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
      <div class="hj-stage-actions">
        ${st.scene ? `<button class="hj-chip" onclick="hajjModel('${st.scene}','${st.id === 'aqaba' ? 'aqaba' : ''}')">${uiIcon('cube')}المجسم ثلاثي الأبعاد</button>` : ''}
        ${trip && !saiNotNeeded ? trackers.map(k => `<button class="hj-chip gold" onclick="hajjStartActivity('${k}','${st.id}')">${uiIcon(k === 'tawaf' ? 'kaaba' : 'route')}${hajjTrackerLabel(trip, k, st.id)}</button>`).join('') : ''}
        ${trip ? `<button class="hj-chip ${done ? '' : 'ok'}" onclick="hajjToggleStage('${st.id}')">${uiIcon('check')}${done ? 'إلغاء الإنجاز' : 'أتممت هذه المرحلة'}</button>` : ''}
      </div>
    </div></details>`;
}
function hajjTrackerLabel(trip, kind, stage) {
  const a = trip.activities.filter(x => x.kind === kind && x.stage === stage).pop();
  const name = kind === 'tawaf' ? 'الطواف' : 'السعي';
  if (a && !a.endedAt) return 'متابعة ' + name;
  if (a && a.rounds.length >= 7) return name + ' مكتمل ✓';
  return 'ابدأ ' + name;
}
function hajjFirstOpen(trip, kind, type) { return hajjStagesFor(kind, type).find(s => !trip.stages[s.id])?.id }
function hajjDidQudumSai(trip) { return trip.activities.some(a => a.kind === 'sai' && a.stage === 'qudum' && a.rounds.length >= 7) }
function hajjToggleStage(id) {
  const trip = hajjActiveTrip(); if (!trip) return;
  if (trip.stages[id]) delete trip.stages[id]; else trip.stages[id] = Date.now();
  hajjSave(); const y = scrollY; hajjRerender(); scrollTo(0, y);
}

function hajjTypePicker() {
  hajjEnter('hajj');
  app.innerHTML = sectionHeading('اختر نوع نسكك', 'تختلف بعض الأعمال وترتيبها بحسب النسك', 'hajjHome()') + `<div class="hj-page"><div class="hj-types">
    ${Object.entries(HAJJ_TYPES).map(([k, t]) => `<button class="hj-type" onclick="hajjPickType('${k}')"><strong>${t.title}</strong><span class="hj-intent">${t.intent}</span><p>${t.brief}</p><ul>${t.points.map(p => `<li>${p}</li>`).join('')}</ul>${t.note ? `<small>${t.note}</small>` : ''}<em>اختيار ${t.title} ${uiIcon('arrow')}</em></button>`).join('')}
  </div></div>`;
  hajjFinishRender();
}
function hajjPickType(k) { hajjLoad().settings.hajjType = k; hajjSave(); hajjGuide('hajj') }

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
  hajjDialog('إنهاء الرحلة؟', (act ? 'لديك نشاط جارٍ، سيُنهى ويُحفظ ما أتممته منه. ' : '') + 'سيتوقف حساب الخطوات، ويُحفظ ملخص رحلتك في سجلك.', 'إنهاء وحفظ', async () => {
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
    hajjDialog('نشاط آخر جارٍ', 'أنهِ ' + (running.kind === 'tawaf' ? 'الطواف' : 'السعي') + ' الجاري أولًا، أو تابعه الآن.', 'متابعته', () => hajjTracker(running.kind));
    return;
  }
  if (!running) {
    const prev = trip.activities.filter(a => a.kind === kind && a.stage === stage).pop();
    if (prev && prev.rounds.length >= 7) { hajjDialog((kind === 'tawaf' ? 'الطواف' : 'السعي') + ' مكتمل', 'سجّلت سبعة أشواط لهذه المرحلة. هل تريد البدء من جديد؟', 'ابدأ من جديد', () => hajjNewActivity(trip, kind, stage)); return }
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

function hajjTracker(kind) {
  hajjCurrentKind = kind;
  const trip = hajjActiveTrip(), a = hajjActivity(trip);
  if (!trip || !a || a.kind !== kind) { hajjHome(); return }
  hajjEnter('trackers');
  const isT = kind === 'tawaf', s = hajjLoad().settings;
  app.innerHTML = sectionHeading(isT ? 'الطواف حول الكعبة' : 'السعي بين الصفا والمروة', isT ? 'الكعبة عن يسارك، والبداية والنهاية عند محاذاة الحجر الأسود' : 'من الصفا إلى المروة شوط، والعودة إلى الصفا شوط ثانٍ', hajjGuideFor(trip)) + `<div class="hj-page hj-live">
    <div class="hj-stage3d" id="hj-3d"><div class="hj-3d-tools">${isT ? `<button class="hj-chip small" id="hj-path" onclick="hajjPathDialog()">${uiIcon('route')}<span>${HAJJ_TAWAF_PATHS[a.path].title}</span></button>` : ''}<button class="hj-chip small" onclick="hajjViewer&&hajjViewer.reset()">${uiIcon('repeat')}الوضع الافتراضي</button><button class="hj-chip small ${s.light ? 'on' : ''}" id="hj-light" onclick="hajjToggleLight()">${uiIcon('leaf')}وضع خفيف</button></div><p class="hj-3d-note">مؤشر توضيحي للاتجاه، وليس موقعك الفعلي</p></div>
    <section class="hj-counter">
      <div class="hj-ring" id="hj-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="bg"/><circle cx="60" cy="60" r="52" class="fg" id="hj-ring-fg" stroke-dasharray="326.7" stroke-dashoffset="326.7"/></svg><div><small>الشوط الحالي</small><strong id="hj-cur">١</strong><span>من ٧</span></div></div>
      <div class="hj-dir" id="hj-dir"></div>
    </section>
    <div class="hj-stats">
      <span><small>الوقت المنقضي</small><b id="hj-time">٠:٠٠</b></span>
      <span><small>الخطوات</small><b id="hj-steps">—</b><em id="hj-steps-src"></em></span>
      <span><small>المسافة</small><b id="hj-dist">٠ م</b><em id="hj-dist-src"></em></span>
      <span><small>نسبة الإنجاز</small><b id="hj-pct">٠٪</b></span>
    </div>
    <div class="hj-controls">
      <button class="hj-main" id="hj-done" onclick="hajjRoundDone()">${uiIcon('check')}<span>أتممت الشوط</span></button>
      <div class="hj-ctrl-row">
        <button class="hj-btn" id="hj-undo" onclick="hajjUndoRound()">${uiIcon('undo')}التراجع عن الشوط</button>
        <button class="hj-btn" id="hj-pause" onclick="hajjPauseToggle()">${uiIcon('pause')}إيقاف مؤقت</button>
        <button class="hj-btn danger" onclick="hajjFinishActivity()">${uiIcon('flag')}إنهاء</button>
      </div>
    </div>
    ${trip.stepsSession ? '' : hajjStepsCard(trip)}
    <div class="hj-rounds" id="hj-rounds"></div>
    <div class="hj-complete" id="hj-complete" hidden></div>
  </div>`;
  hajjFinishRender();
  hajjMount3D(isT ? 'kaaba' : 'masaa', a);
  hajjRefreshLive();
  hajjTick = setInterval(hajjRefreshLive, 1000);
  hajjPoll = setInterval(() => { if (!document.hidden) hajjNative.call('hajjStepsQuery') }, s.light ? 15000 : 5000);
  hajjNative.call('hajjStepsQuery');
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
  d.innerHTML = `<div class="hj-dialog-card"><h3>مسار طوافك</h3><p>يُستخدم لعرض الحلقة على المجسم، ولتقدير المسافة إن لم تتوفر الخطوات.</p><div class="hj-options">${Object.entries(HAJJ_TAWAF_PATHS).map(([k, p]) => `<button class="hj-option ${a.path === k ? 'on' : ''}" data-k="${k}"><b>${p.title}</b><small>نحو ${hjAr(Math.round(2 * Math.PI * p.radius))} م للشوط</small></button>`).join('')}</div></div>`;
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
function hajjRefreshLive() {
  if (hajjView !== 'trackers') return;
  const trip = hajjActiveTrip(), a = hajjActivity(trip); if (!a) return;
  const n = a.rounds.length, isT = a.kind === 'tawaf', $ = id => document.getElementById(id);
  if (!$('hj-cur')) return;
  $('hj-cur').textContent = hjAr(Math.min(n + 1, 7)); if (n >= 7) $('hj-cur').textContent = hjAr(7);
  $('hj-ring-fg').setAttribute('stroke-dashoffset', (326.7 * (1 - n / 7)).toFixed(1));
  $('hj-time').textContent = hajjClock(hajjActiveMs(a));
  const steps = hajjActSteps(trip, a), dist = hajjActDistance(trip, a);
  $('hj-steps').textContent = steps == null ? '—' : hajjNum(steps);
  $('hj-steps-src').textContent = steps == null ? (trip.stepsSession ? 'بانتظار المستشعر' : 'غير مفعّل') : 'من مستشعر الهاتف';
  $('hj-dist').textContent = hajjKm(dist.m); $('hj-dist-src').textContent = hajjSrcLabel[dist.src];
  $('hj-pct').textContent = hjAr(Math.round(n / 7 * 100)) + '٪';
  const curStart = n ? a.rounds[n - 1].active : 0, curMs = hajjActiveMs(a) - curStart;
  $('hj-dir').innerHTML = n >= 7 ? `<b>اكتمل ${isT ? 'الطواف' : 'السعي'}</b>` : isT
    ? `<b>الشوط ${hjAr(n + 1)}</b><span>ابدأ من محاذاة الحجر الأسود وانتهِ إليها${n < 3 && ['tawaf', 'umrah', 'qudum'].includes(a.stage) ? ' — ويُسن الرمل للرجال في الأشواط الثلاثة الأولى' : ''}</span><em>وقت هذا الشوط ${hajjClock(curMs)}</em>`
    : `<b>${n % 2 === 0 ? 'من الصفا إلى المروة' : 'من المروة إلى الصفا'}</b><span>الشوط ${hjAr(n + 1)} — ${n === 6 ? 'الأخير، ينتهي عند المروة' : 'أسرع بين العلمين الأخضرين (للرجال)'}</span><em>وقت هذا الشوط ${hajjClock(curMs)}</em>`;
  const paused = !!a.pausedAt;
  $('hj-pause').innerHTML = uiIcon(paused ? 'play' : 'pause') + (paused ? 'استئناف' : 'إيقاف مؤقت');
  $('hj-done').disabled = paused || n >= 7; $('hj-undo').disabled = n === 0;
  document.querySelector('.hj-live')?.classList.toggle('paused', paused);
  const list = a.rounds.map((r, i) => `<li><span>الشوط ${hjAr(i + 1)}${a.kind === 'sai' ? ' · ' + (i % 2 === 0 ? 'الصفا ← المروة' : 'المروة ← الصفا') : ''}</span><b>${hajjClock(r.ms)}</b></li>`).join('');
  const box = $('hj-rounds'), html = n ? `<h4>الأشواط المكتملة</h4><ol>${list}</ol>` : '';
  if (box.dataset.n !== String(n)) { box.innerHTML = html; box.dataset.n = n }
  const done = $('hj-complete');
  if (n >= 7 && done.hidden) {
    done.hidden = false;
    done.innerHTML = isT
      ? `<strong>${uiIcon('check')}تقبّل الله طوافك</strong><p>صلِّ ركعتين خلف مقام إبراهيم إن تيسر، أو في أي مكان من المسجد، واشرب من ماء زمزم.</p><button class="hj-btn gold" onclick="hajjFinishActivity(true)">حفظ وإنهاء الطواف</button>`
      : `<strong>${uiIcon('check')}انتهى سعيك عند المروة</strong><p>تقبّل الله منك. ${trip.kind === 'umrah' || (trip.kind === 'hajj' && trip.type === 'tamattu' && a.stage === 'umrah') ? 'الخطوة التالية: الحلق أو التقصير.' : ''}</p><button class="hj-btn gold" onclick="hajjFinishActivity(true)">حفظ وإنهاء السعي</button>`;
  } else if (n < 7) done.hidden = true;
}
function hajjRoundDone() {
  const trip = hajjActiveTrip(), a = hajjActivity(trip); if (!a || a.pausedAt || a.rounds.length >= 7) return;
  const active = hajjActiveMs(a), prev = a.rounds.length ? a.rounds[a.rounds.length - 1].active : 0;
  a.rounds.push({ at: Date.now(), active, ms: active - prev });
  hajjSave(); hajjNative.call('haptic', 1);
  const n = a.rounds.length;
  if (hajjViewer) a.kind === 'tawaf' ? Hajj3D.setTawafPath(hajjViewer, a.path, n, n < 7) : Hajj3D.setSaiProgress(hajjViewer, n, n < 7);
  if (n === 7) { try { navigator.vibrate?.([120, 80, 120]) } catch (e) {} showSmallNotice(a.kind === 'sai' ? 'اكتمل الشوط السابع عند المروة' : 'اكتمل الشوط السابع') }
  else showSmallNotice('سُجّل الشوط ' + hjAr(n));
  hajjQuerySteps(); hajjRefreshLive();
}
function hajjUndoRound() {
  const trip = hajjActiveTrip(), a = hajjActivity(trip); if (!a || !a.rounds.length) return;
  const n = a.rounds.length;
  hajjDialog('تصحيح عدد الأشواط', 'سيُحذف الشوط ' + hjAr(n) + ' ويصبح الشوط الحالي ' + hjAr(n) + '. إن شككت في العدد فابنِ على الأقل.', 'نعم، صحّح', () => {
    a.rounds.pop(); hajjSave();
    if (hajjViewer) a.kind === 'tawaf' ? Hajj3D.setTawafPath(hajjViewer, a.path, a.rounds.length, !a.pausedAt) : Hajj3D.setSaiProgress(hajjViewer, a.rounds.length, !a.pausedAt);
    showSmallNotice('صُحّح العدد: الشوط الحالي ' + hjAr(a.rounds.length + 1)); hajjRefreshLive();
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
  const end = async () => { await hajjQuerySteps(); hajjEndActivity(trip, a); showSmallNotice('حُفظ ' + name); if (trip.kind === 'visit') hajjVisitPage(); else hajjGuide(trip.kind === 'hajj' ? 'hajj' : 'umrah') };
  if (skipConfirm === true || a.rounds.length >= 7) { end(); return }
  hajjDialog('إنهاء ' + name + '؟', 'سجّلت ' + hjAr(a.rounds.length) + ' من ٧ أشواط. سيُحفظ ما أتممته، ولن يُعد ' + name + ' مكتملًا.', 'إنهاء', end);
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
function hajjModels() {
  hajjEnter('models');
  app.innerHTML = sectionHeading('المجسمات ثلاثية الأبعاد', 'اسحب للتدوير، وقرّب بإصبعين، وانقر مرتين للعودة', 'hajjHome()') + `<div class="hj-page"><div class="hj-list">${HAJJ_MODELS.map(([k, t, d]) => hlRowSafe('cube', t, d, `hajjModel('${k}')`)).join('')}</div></div>`;
  hajjFinishRender();
}
function hajjModel(scene, mode) {
  const back = hajjView === 'umrah' || hajjView === 'hajj' ? `hajjGuide('${hajjView}')` : 'hajjModels()';
  const m = HAJJ_MODELS.find(x => x[0] === scene) || HAJJ_MODELS[0];
  hajjEnter('model');
  app.innerHTML = sectionHeading(m[1], m[2], back) + `<div class="hj-page"><div class="hj-stage3d tall" id="hj-3d"><div class="hj-3d-tools"><button class="hj-chip small" onclick="hajjViewer&&hajjViewer.reset()">${uiIcon('repeat')}الوضع الافتراضي</button></div></div>
    <p class="hj-hint">${uiIcon('info')}${scene === 'kaaba' ? 'الطواف بعكس عقارب الساعة والكعبة عن يسارك. الحلقات توضّح الأشواط، والسهم الأخضر يشير إلى خط محاذاة الحجر الأسود.' : scene === 'masaa' ? 'يبدأ السعي بالصفا وينتهي بالمروة. الذهاب شوط والعودة شوط، والهرولة للرجال بين العلمين الأخضرين.' : 'مجسم تعليمي مبسّط للتوضيح، وليس خريطة دقيقة للمسافات أو الحدود.'}</p></div>`;
  hajjFinishRender();
  hajjMount3D(scene, scene === 'kaaba' ? { path: 'near', rounds: [] } : scene === 'masaa' ? { rounds: [] } : null, mode);
  if (scene === 'kaaba' && hajjViewer) Hajj3D.setTawafPath(hajjViewer, 'near', 0, true);
  if (scene === 'masaa' && hajjViewer) Hajj3D.setSaiProgress(hajjViewer, 0, true);
}

/* ---------- رحلتي في الحرم ---------- */
function hajjJourney() {
  hajjEnter('journey');
  const s = hajjLoad(), trips = [...s.trips].sort((a, b) => b.startedAt - a.startedAt);
  const all = trips.map(t => ({ t, x: hajjTripTotals(t) }));
  const sum = all.reduce((o, { x }) => ({ steps: o.steps + (x.steps || 0), dist: o.dist + x.dist, ms: o.ms + x.ms, tawaf: o.tawaf + x.tawaf, sai: o.sai + x.sai }), { steps: 0, dist: 0, ms: 0, tawaf: 0, sai: 0 });
  // إحصائيات يومية من الأنشطة
  const days = new Map();
  for (const t of trips) for (const a of t.activities) {
    const k = new Date(a.startedAt).toDateString(), d = days.get(k) || { at: a.startedAt, ms: 0, dist: 0, steps: 0, tawaf: 0, sai: 0 };
    d.ms += hajjActiveMs(a); d.dist += hajjActDistance(t, a).m; d.steps += hajjActSteps(t, a) || 0; d[a.kind] += a.rounds.length; days.set(k, d);
  }
  const active = hajjActiveTrip();
  app.innerHTML = sectionHeading('رحلتي في الحرم', 'كل البيانات محفوظة على جهازك فقط', 'hajjHome()') + `<div class="hj-page">
    ${active ? `<button class="hj-resume" onclick="${hajjGuideFor(active)}"><span class="hj-resume-dot"></span><span><small>رحلة جارية</small><strong>${hajjKindTitle(active)}</strong></span>${uiIcon('arrow')}</button>` : `<button class="hj-start" onclick="hajjStartVisit()">${uiIcon('kaaba')}<span><strong>طواف أو سعي منفرد</strong><small>لمن يطوف تطوعًا أو يريد عدّ الأشواط دون رحلة كاملة</small></span></button>`}
    <div class="hj-stats big">
      <span><small>إجمالي الخطوات</small><b>${hajjNum(sum.steps)}</b></span>
      <span><small>إجمالي المسافة</small><b>${hajjKm(sum.dist)}</b></span>
      <span><small>وقت الأنشطة</small><b>${hajjDuration(sum.ms)}</b></span>
      <span><small>متوسط سرعة المشي</small><b>${sum.ms > 60000 ? hjAr((all.reduce((o, { t }) => o + t.activities.reduce((q, a) => q + hajjActDistance(t, a).m, 0), 0) / 1000 / (sum.ms / 3600000)).toFixed(1)) + ' كم/س' : '—'}</b></span>
      <span><small>أشواط الطواف</small><b>${hjAr(sum.tawaf)}</b></span>
      <span><small>أشواط السعي</small><b>${hjAr(sum.sai)}</b></span>
    </div>
    <p class="hj-hint">${uiIcon('info')}الخطوات من مستشعر الهاتف. المسافة تُقدَّر من الخطوات × طول خطوتك (${hjAr(s.settings.stride.toFixed(2))} م)، أو بحسب الأشواط إن لم تتوفر الخطوات. لا يُستخدم GPS داخل الحرم.<button class="hj-link" onclick="hajjStrideDialog()">تعديل طول الخطوة</button></p>
    ${days.size ? `<h3 class="hj-h">الإحصائيات اليومية</h3><div class="hj-days">${[...days.values()].sort((a, b) => b.at - a.at).map(d => `<div class="hj-day"><strong>${hajjDate(d.at)}</strong><span>${hajjDuration(d.ms)} · ${hajjKm(d.dist)}${d.steps ? ' · ' + hajjNum(d.steps) + ' خطوة' : ''}</span><small>طواف ${hjAr(d.tawaf)} · سعي ${hjAr(d.sai)} أشواط</small></div>`).join('')}</div>` : ''}
    <h3 class="hj-h">الرحلات</h3>
    ${trips.length ? `<div class="hj-list">${all.map(({ t, x }) => hlRowSafe(t.kind === 'hajj' ? 'flag' : 'kaaba', hajjKindTitle(t) + (t.endedAt ? '' : ' (جارية)'), hajjDate(t.startedAt) + ' · ' + hajjDuration(x.ms) + ' · ' + hajjKm(x.dist), `hajjReport('${t.id}')`)).join('')}</div>` : '<p class="hj-empty">لا توجد رحلات بعد. ابدأ رحلة العمرة أو الحج من صفحتها.</p>'}
  </div>`;
  hajjFinishRender();
}
function hajjStartVisit() {
  const s = hajjLoad(); if (hajjActiveTrip()) return;
  const trip = { id: hajjId(), kind: 'visit', type: null, startedAt: Date.now(), endedAt: null, stages: {}, activities: [], steps: 0, stepsSession: false };
  s.trips.push(trip); s.active = trip.id; hajjSave();
  if (hajjNative.status().permission === 'granted') hajjBeginSteps(trip);
  hajjVisitPage();
}
function hajjVisitPage() {
  const trip = hajjActiveTrip(); if (!trip || trip.kind !== 'visit') return hajjJourney();
  hajjEnter('visit');
  const t = hajjTripTotals(trip);
  app.innerHTML = sectionHeading('طواف وسعي', 'عدّ الأشواط والوقت والخطوات', 'hajjJourney()') + `<div class="hj-page"><section class="hj-trip">
    <div class="hj-mini"><span><b>${t.steps == null ? '—' : hajjNum(t.steps)}</b><small>خطوة</small></span><span><b>${hajjKm(t.dist)}</b><small>${hajjSrcLabel[t.src]}</small></span><span><b>${hjAr(t.tawaf)}</b><small>أشواط الطواف</small></span><span><b>${hjAr(t.sai)}</b><small>أشواط السعي</small></span></div>
    ${hajjStepsCard(trip)}
    <div class="hj-trip-actions"><button class="hj-btn ghost" onclick="hajjReport('${trip.id}')">${uiIcon('chart')}الملخص</button><button class="hj-btn danger" onclick="hajjConfirmEndTrip()">${uiIcon('flag')}إنهاء</button></div></section>
    <div class="hj-choices"><button class="hj-choice" onclick="hajjStartActivity('tawaf','visit-'+Date.now())"><span class="hj-choice-ico">${uiIcon('kaaba')}</span><strong>ابدأ طوافًا</strong><small>سبعة أشواط حول الكعبة</small></button><button class="hj-choice" onclick="hajjStartActivity('sai','visit-'+Date.now())"><span class="hj-choice-ico">${uiIcon('route')}</span><strong>ابدأ سعيًا</strong><small>سبعة أشواط بين الصفا والمروة</small></button></div></div>`;
  hajjFinishRender();
}
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
function hajjReport(id) {
  const trip = hajjTrip(id); if (!trip) return hajjJourney();
  hajjEnter('report');
  const x = hajjTripTotals(trip), stages = trip.kind === 'visit' ? [] : hajjStagesFor(trip.kind, trip.type), doneStages = stages.filter(s => trip.stages[s.id]);
  app.innerHTML = sectionHeading('ملخص رحلتي الإيمانية', hajjKindTitle(trip), trip.endedAt ? 'hajjJourney()' : hajjGuideFor(trip)) + `<div class="hj-page">
    <section class="hj-report">
      <div class="hj-report-row"><small>تاريخ الرحلة</small><b>${hajjDate(trip.startedAt)}</b></div>
      <div class="hj-report-row"><small>البداية والنهاية</small><b>${hajjTime(trip.startedAt)} — ${trip.endedAt ? hajjTime(trip.endedAt) : 'جارية'}</b></div>
      <div class="hj-report-row"><small>مدة الرحلة</small><b>${hajjDuration(x.span)}</b></div>
      <div class="hj-report-row"><small>وقت الطواف والسعي</small><b>${hajjDuration(x.ms)}</b></div>
      <div class="hj-report-row"><small>إجمالي الخطوات</small><b>${x.steps == null ? 'غير متاح' : hajjNum(x.steps)}</b></div>
      <div class="hj-report-row"><small>إجمالي المسافة</small><b>${hajjKm(x.dist)} <em>${hajjSrcLabel[x.src]}</em></b></div>
      <div class="hj-report-row"><small>الأشواط المكتملة</small><b>طواف ${hjAr(x.tawaf)} · سعي ${hjAr(x.sai)}</b></div>
      ${stages.length ? `<div class="hj-report-row col"><small>المراحل المنجزة (${hjAr(doneStages.length)} من ${hjAr(stages.length)})</small><div class="hj-tags">${stages.map(s => `<span class="${trip.stages[s.id] ? 'on' : ''}">${trip.stages[s.id] ? '✓ ' : ''}${s.title}</span>`).join('')}</div></div>` : ''}
      ${trip.activities.length ? `<div class="hj-report-row col"><small>الأنشطة</small><ul class="hj-acts">${trip.activities.map(a => `<li><b>${a.kind === 'tawaf' ? 'طواف' : 'سعي'} ${hjAr(a.rounds.length)}/٧</b><span>${hajjClock(hajjActiveMs(a))} · ${hajjKm(hajjActDistance(trip, a).m)}${hajjActSteps(trip, a) ? ' · ' + hajjNum(hajjActSteps(trip, a)) + ' خطوة' : ''}</span></li>`).join('')}</ul></div>` : ''}
    </section>
    <div class="hj-share">
      <button class="hj-btn gold" onclick="hajjExport('${trip.id}','image','share')">${uiIcon('share')}مشاركة كصورة</button>
      <button class="hj-btn" onclick="hajjExport('${trip.id}','pdf','share')">${uiIcon('share')}مشاركة PDF</button>
      <button class="hj-btn" onclick="hajjExport('${trip.id}','image','save')">${uiIcon('download')}حفظ الصورة</button>
      <button class="hj-btn" onclick="hajjExport('${trip.id}','pdf','save')">${uiIcon('download')}حفظ PDF</button>
    </div>
    ${trip.endedAt ? `<button class="hj-link danger" onclick="hajjDeleteTrip('${trip.id}')">حذف هذه الرحلة من السجل</button>` : ''}
  </div>`;
  hajjFinishRender();
}
function hajjDeleteTrip(id) {
  hajjDialog('حذف الرحلة؟', 'ستُحذف الرحلة وإحصائياتها من جهازك نهائيًا.', 'حذف', () => { const s = hajjLoad(); s.trips = s.trips.filter(t => t.id !== id); hajjSave(); hajjJourney() });
}
async function hajjReportCanvas(trip) {
  try { await document.fonts?.load('700 40px AppArabic') } catch (e) {}
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), x = hajjTripTotals(trip), stages = trip.kind === 'visit' ? [] : hajjStagesFor(trip.kind, trip.type);
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#13261f'); bg.addColorStop(1, '#0b1612'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(201,163,90,.35)'; g.lineWidth = 3; g.strokeRect(36, 36, W - 72, H - 72);
  g.direction = 'rtl'; g.textAlign = 'center';
  const F = (w, s) => `${w} ${s}px AppArabic, sans-serif`;
  g.fillStyle = '#c9a35a'; g.font = F(500, 34); g.fillText('مصحفي', W / 2, 120);
  g.fillStyle = '#f6efdf'; g.font = F(700, 66); g.fillText('ملخص رحلتي الإيمانية', W / 2, 215);
  g.fillStyle = '#e6cf9a'; g.font = F(500, 42); g.fillText(hajjKindTitle(trip), W / 2, 285);
  g.fillStyle = 'rgba(246,239,223,.75)'; g.font = F(400, 32); g.fillText(hajjDate(trip.startedAt), W / 2, 340);
  g.fillText(hajjTime(trip.startedAt) + ' — ' + (trip.endedAt ? hajjTime(trip.endedAt) : 'جارية'), W / 2, 388);
  const cells = [['مدة الرحلة', hajjDuration(x.span)], ['وقت الطواف والسعي', hajjDuration(x.ms)], ['الخطوات', x.steps == null ? '—' : hajjNum(x.steps)], ['المسافة', hajjKm(x.dist)], ['أشواط الطواف', hjAr(x.tawaf)], ['أشواط السعي', hjAr(x.sai)]];
  cells.forEach(([k, v], i) => {
    const col = i % 2, row = Math.floor(i / 2), cx = col ? 300 : 780, cy = 470 + row * 170;
    g.fillStyle = 'rgba(255,255,255,.05)'; g.beginPath(); g.roundRect ? g.roundRect(cx - 220, cy - 60, 440, 140, 28) : g.rect(cx - 220, cy - 60, 440, 140); g.fill();
    g.fillStyle = 'rgba(246,239,223,.65)'; g.font = F(400, 28); g.fillText(k, cx, cy - 10);
    g.fillStyle = '#f6efdf'; g.font = F(700, 46); g.fillText(v, cx, cy + 50);
  });
  g.fillStyle = 'rgba(246,239,223,.55)'; g.font = F(400, 24); g.fillText('المسافة ' + hajjSrcLabel[x.src], W / 2, 980);
  if (stages.length) {
    const done = stages.filter(s => trip.stages[s.id]).map(s => s.title);
    g.fillStyle = '#c9a35a'; g.font = F(500, 30); g.fillText('المراحل المنجزة: ' + hjAr(done.length) + ' من ' + hjAr(stages.length), W / 2, 1050);
    g.fillStyle = 'rgba(246,239,223,.8)'; g.font = F(400, 26);
    let line = '', y = 1100; for (const t of done) { const next = line ? line + ' · ' + t : t; if (g.measureText(next).width > W - 180) { g.fillText(line, W / 2, y); y += 42; line = t } else line = next } if (line) g.fillText(line, W / 2, y);
  }
  g.fillStyle = '#e6cf9a'; g.font = F(500, 30); g.fillText('تقبّل الله منا ومنكم', W / 2, H - 120);
  g.fillStyle = 'rgba(246,239,223,.45)'; g.font = F(400, 22); g.fillText('mushafiapp.com', W / 2, H - 78);
  return c;
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
