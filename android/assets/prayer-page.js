'use strict';
/* مواقيت الصلاة: تبويبات اليوم · الشهر · الليل · التنبيهات، وتقويم شهري بعلامات المناسبات الإسلامية.
   الإقامة تُحسب من إعداداتك (مدة كل صلاة)، كما كانت. */
iconPaths.calendar = '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17.2h.01M12 17.2h.01" stroke-width="2.2"/>';
iconPaths.bell = '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.6 2H4.4z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>';
iconPaths.sunset = '<path d="M12 9V4M9.5 6.5 12 9l2.5-2.5M5.6 10.6l1.4 1.4M18.4 10.6 17 12M3 16h2M19 16h2M7.5 16a4.5 4.5 0 0 1 9 0M3 20h18"/>';
iconPaths.moonStar = '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/><path d="M17 3v4M15 5h4"/>';
iconPaths.sunPlain = '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M5.2 18.8l1.4-1.4M17.4 6.6l1.4-1.4"/>';
iconPaths.sunLow = '<circle cx="12" cy="13" r="3.6"/><path d="M12 5v2M5 13H3M21 13h-2M6.8 7.8 5.6 6.6M17.2 7.8l1.2-1.2M4 19h16"/>';
iconPaths.chevron = iconPaths.chevron || '<path d="m15 6-6 6 6 6"/>';
iconPaths.chevronR = '<path d="m9 6 6 6-6 6"/>';
const PP_ICON = { fajr: 'moonStar', sunrise: 'sunrise', dhuhr: 'sunPlain', asr: 'sunLow', maghrib: 'sunset', isha: 'moon' };
let prayerTab = 'today', ppMonth = null, ppSelected = null;

/* ---------- التقويم الهجري والمناسبات ---------- */
function ppHijri(date) {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' }).formatToParts(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12)));
    const get = t => +(parts.find(p => p.type === t)?.value || '').replace(/\D/g, '');
    return { d: get('day'), m: get('month'), y: get('year') };
  } catch (e) { return null }
}
const PP_HIJRI_MONTHS = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];
function ppOccasion(h) {
  if (!h) return null;
  const { d, m } = h;
  if (m === 1 && d === 1) return { name: 'رأس السنة الهجرية', kind: 'info' };
  if (m === 1 && d === 9) return { name: 'تاسوعاء · يُستحب صيامه مع عاشوراء', kind: 'fast' };
  if (m === 1 && d === 10) return { name: 'يوم عاشوراء', kind: 'fast' };
  if (m === 9 && d === 1) return { name: 'بداية شهر رمضان', kind: 'major' };
  if (m === 9 && d === 21) return { name: 'بداية العشر الأواخر', kind: 'major' };
  if (m === 10 && d === 1) return { name: 'عيد الفطر', kind: 'eid' };
  if (m === 12 && d === 1) return { name: 'بداية عشر ذي الحجة', kind: 'major' };
  if (m === 12 && d === 8) return { name: 'يوم التروية', kind: 'major' };
  if (m === 12 && d === 9) return { name: 'يوم عرفة', kind: 'fast' };
  if (m === 12 && d === 10) return { name: 'عيد الأضحى', kind: 'eid' };
  if (m === 12 && d >= 11 && d <= 13) return { name: 'أيام التشريق', kind: 'eid' };
  if (d >= 13 && d <= 15 && !(m === 12 && d === 13)) return { name: 'الأيام البيض · يُستحب صيامها', kind: 'white' };
  return null;
}
const PP_OCCASION_SOURCE = {
  'يوم عاشوراء': 'صحيح مسلم ١١٦٢', 'تاسوعاء · يُستحب صيامه مع عاشوراء': 'صحيح مسلم ١١٣٤', 'يوم عرفة': 'صحيح مسلم ١١٦٢',
  'الأيام البيض · يُستحب صيامها': 'سنن النسائي ٢٤٢٤', 'بداية العشر الأواخر': 'صحيح البخاري ٢٠٢٤', 'بداية عشر ذي الحجة': 'صحيح البخاري ٩٦٩',
  'أيام التشريق': 'صحيح مسلم ١١٤١'
};

/* ---------- حساب يوم معيّن (للتقويم الشهري) ---------- */
function ppDayTimes(settings, date) {
  try {
    const snap = browserPrayerSnapshot(JSON.parse(JSON.stringify(settings)), new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12).getTime());
    return snap.days[1];
  } catch (e) { return null }
}
function ppIqama(s, k, adhan) { const row = s.prayers?.[k]; return row && row.iqama > 0 && Number.isFinite(adhan) ? prayerClock(adhan + row.iqama * 60000, s.timezone) : '—' }

/* ---------- الواجهة ---------- */
function ppTabs() {
  const t = [['today', 'sunPlain', 'اليوم'], ['month', 'calendar', 'الشهر'], ['night', 'moon', 'الليل'], ['alerts', 'bell', 'التنبيهات']];
  return `<div class="pp-tabs" role="tablist">${t.map(([id, icon, label]) => `<button role="tab" aria-selected="${prayerTab === id}" class="${prayerTab === id ? 'on' : ''}" onclick="ppTab('${id}')">${uiIcon(icon)}<span>${label}</span></button>`).join('')}</div>`;
}
function ppTab(id) { if (id === 'alerts') { openPrayerSettings('alerts'); return } prayerTab = id; renderPrayerPage(); window.scrollTo(0, 0) }
function ppHero(data) {
  const phase = prayerPhase(data), s = data.settings;
  if (!phase) return '';
  const iq = phase.kind === 'iqama';
  return `<section class="pp-hero${iq ? ' is-iqama' : ''}">
    <div class="pp-hero-top"><span data-prayer-phase>${iq ? 'حتى الإقامة' : 'الصلاة القادمة'}</span><i>${uiIcon(PP_ICON[phase.key] || 'sunPlain')}</i></div>
    <h2 data-prayer-name>${iq ? 'إقامة ' : ''}${prayerNames[phase.key]}</h2>
    <strong class="pp-hero-time" data-prayer-time>${prayerClock(phase.target, s.timezone)}</strong>
    <div class="pp-hero-left"><span>الوقت المتبقي</span><b data-prayer-countdown dir="ltr">${prayerDuration(phase.target - Date.now())}</b></div>
  </section>`;
}
function ppTable(data) {
  const day = data.days[1 + prayerPageDate], s = data.settings, phase = prayerPhase(data);
  return `<div class="pp-head"><h2>${prayerPageDate ? 'مواقيت الغد' : 'مواقيت اليوم'}</h2><div class="pp-seg" role="group"><button class="${!prayerPageDate ? 'on' : ''}" onclick="prayerPageDate=0;renderPrayerPage()">اليوم</button><button class="${prayerPageDate ? 'on' : ''}" onclick="prayerPageDate=1;renderPrayerPage()">غدًا</button></div></div>
  <div class="pp-table">
    <div class="pp-row pp-labels"><span>الصلاة</span><span>الأذان</span><span>الإقامة</span></div>
    ${['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].map(k => {
      const cur = phase?.prayer.date === day.date && phase.key === k;
      return `<div class="pp-row${cur ? ' is-current' : ''}${k === 'sunrise' ? ' is-sunrise' : ''}" data-prayer-row="${k}"><span class="pp-name"><i>${uiIcon(PP_ICON[k])}</i><strong>${prayerNames[k]}</strong></span><time>${prayerClock(day[k], s.timezone)}</time><span class="pp-iq">${k === 'sunrise' ? '—' : ppIqama(s, k, day[k])}</span></div>`;
    }).join('')}
  </div>`;
}
function ppDuhaNight(data) {
  const s = data.settings, today = data.days[1], now = Date.now(), duhaDay = now < today.duhaEnd ? today : data.days[2], active = now >= duhaDay.duha && now < duhaDay.duhaEnd, night = prayerNight(data);
  return `<div class="pp-links">
    <div class="pp-link"><i>${uiIcon('sunrise')}</i><span><strong>${active ? 'وقت الضحى الآن' : duhaDay === today ? 'الضحى' : 'ضحى الغد'}</strong><small>من ${prayerClock(duhaDay.duha, s.timezone)} إلى ${prayerClock(duhaDay.duhaEnd, s.timezone)}</small></span></div>
    <button class="pp-link" onclick="ppTab('night')"><i>${uiIcon('moonStar')}</i><span><strong>أوقات الليل</strong><small>الثلث الأخير يبدأ ${prayerClock(night.lastThird, s.timezone)}</small></span>${uiIcon('chevron')}</button>
    <button class="pp-link" onclick="ppTab('month')"><i>${uiIcon('calendar')}</i><span><strong>مواقيت الشهر</strong><small>مع المناسبات الإسلامية</small></span>${uiIcon('chevron')}</button>
  </div>`;
}
function ppNight(data) {
  const n = prayerNight(data), s = data.settings, now = Date.now(), live = now >= n.start && now < n.end;
  const rows = [['المغرب', n.start], ['نهاية الثلث الأول', n.firstThird], ['منتصف الليل الشرعي', n.middle], ['بداية الثلث الأخير', n.lastThird, true], ['الفجر', n.end]];
  return `<section class="pp-card pp-night">
    <div class="pp-card-head"><span><h2>أوقات الليل</h2><p>من غروب الشمس إلى طلوع الفجر · ${live ? 'هذه الليلة' : 'الليلة القادمة'}</p></span><i>${uiIcon('moonStar')}</i></div>
    <div class="pp-night-caption" data-prayer-night-caption>${nightCountdownText(n, now)}</div>
    <div class="pp-list">${rows.map(([label, t, hi]) => `<div class="${hi ? 'hi' : ''}"><span>${label}</span><time>${prayerClock(t, s.timezone)}</time></div>`).join('')}</div>
    <details class="pp-how"><summary>${uiIcon('info')}<span>كيف تُحسب أوقات الليل؟</span></summary><p>يُقسم الزمن من المغرب إلى الفجر إلى أجزاء متساوية لحساب منتصف الليل والثلث الأخير، وليس بناءً على الساعة ١٢ منتصف الليل.</p></details>
  </section>`;
}
function ppMonthView(data) {
  const s = data.settings, todayParts = prayerLocalParts(Date.now(), s.timezone);
  if (!ppMonth) ppMonth = { y: todayParts.year, m: todayParts.month - 1 };
  const first = new Date(ppMonth.y, ppMonth.m, 1), days = new Date(ppMonth.y, ppMonth.m + 1, 0).getDate();
  const todayKey = todayParts.year + '-' + todayParts.month + '-' + todayParts.day;
  if (!ppSelected || ppSelected.y !== ppMonth.y || ppSelected.m !== ppMonth.m) ppSelected = (todayParts.year === ppMonth.y && todayParts.month - 1 === ppMonth.m) ? { y: ppMonth.y, m: ppMonth.m, d: todayParts.day } : { y: ppMonth.y, m: ppMonth.m, d: 1 };
  const loc = uiLocale();
  const title = new Intl.DateTimeFormat(loc + '-u-ca-gregory', { month: 'long', year: 'numeric' }).format(first);
  const h1 = ppHijri(first), h2 = ppHijri(new Date(ppMonth.y, ppMonth.m, days));
  const hijriTitle = h1 && h2 ? (h1.m === h2.m ? `${PP_HIJRI_MONTHS[h1.m - 1]} ${ar(h1.y)} هـ` : `${PP_HIJRI_MONTHS[h1.m - 1]} – ${PP_HIJRI_MONTHS[h2.m - 1]} ${ar(h2.y)} هـ`) : '';
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(loc, { weekday: 'narrow' }).format(new Date(2026, 10, 15 + i)));
  const lead = first.getDay(), cells = [], occasions = [];
  for (let i = 0; i < lead; i++) cells.push('<span class="pp-cell empty"></span>');
  for (let d = 1; d <= days; d++) {
    const date = new Date(ppMonth.y, ppMonth.m, d), h = ppHijri(date), occ = ppOccasion(h);
    if (occ && occ.kind !== 'white') { const last = occasions[occasions.length - 1]; if (last && last.occ.name === occ.name && last.to === d - 1) { last.to = d; last.hTo = h } else occasions.push({ d, to: d, h, hTo: h, occ }) }
    const isToday = todayKey === ppMonth.y + '-' + (ppMonth.m + 1) + '-' + d, sel = ppSelected.d === d;
    cells.push(`<button class="pp-cell${isToday ? ' today' : ''}${sel ? ' sel' : ''}${occ ? ' occ-' + occ.kind : ''}" onclick="ppPick(${d})" aria-label="${d}${occ ? ' · ' + occ.name : ''}"><b>${ar(d)}</b><small>${h ? ar(h.d) : ''}</small>${occ ? '<i></i>' : ''}</button>`);
  }
  const selDate = new Date(ppSelected.y, ppSelected.m, ppSelected.d), selH = ppHijri(selDate), selOcc = ppOccasion(selH), t = ppDayTimes(s, selDate);
  const selLabel = new Intl.DateTimeFormat(loc + '-u-ca-gregory', { weekday: 'long', day: 'numeric', month: 'long' }).format(selDate);
  return `<section class="pp-card pp-month">
    <div class="pp-month-head"><button aria-label="الشهر السابق" onclick="ppShift(-1)">${uiIcon('chevronR')}</button><span><h2>${title}</h2><p>${hijriTitle}</p></span><button aria-label="الشهر التالي" onclick="ppShift(1)">${uiIcon('chevron')}</button></div>
    <div class="pp-week">${weekdays.map(w => `<span>${w}</span>`).join('')}</div>
    <div class="pp-grid">${cells.join('')}</div>
    <div class="pp-legend"><span><i class="eid"></i>عيد</span><span><i class="major"></i>مناسبة</span><span><i class="fast"></i>صيام مستحب</span><span><i class="white"></i>الأيام البيض</span></div>
  </section>
  <section class="pp-card pp-day">
    <div class="pp-card-head"><span><h2>${selLabel}</h2><p>${selH ? `${ar(selH.d)} ${PP_HIJRI_MONTHS[selH.m - 1]} ${ar(selH.y)} هـ` : ''}</p></span></div>
    ${selOcc ? `<div class="pp-occ occ-${selOcc.kind}"><strong>${selOcc.name}</strong>${PP_OCCASION_SOURCE[selOcc.name] ? `<small>${PP_OCCASION_SOURCE[selOcc.name]}</small>` : ''}</div>` : ''}
    ${t ? `<div class="pp-mini">${['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].map(k => `<div><i>${uiIcon(PP_ICON[k])}</i><span>${prayerNames[k]}</span><time>${prayerClock(t[k], s.timezone)}</time>${k !== 'sunrise' ? `<small>الإقامة ${ppIqama(s, k, t[k])}</small>` : '<small>&nbsp;</small>'}</div>`).join('')}</div>` : '<p class="small-note">تعذر حساب هذا اليوم.</p>'}
  </section>
  ${occasions.length ? `<section class="pp-card pp-occasions"><div class="pp-card-head"><span><h2>مناسبات هذا الشهر</h2></span></div>${occasions.map(o => `<button class="occ-${o.occ.kind}" onclick="ppPick(${o.d})"><i></i><span><strong>${o.occ.name}</strong><small>${o.to > o.d ? `${ar(o.h.d)}–${ar(o.hTo.d)} ${PP_HIJRI_MONTHS[o.h.m - 1]} · ${new Intl.DateTimeFormat(loc + '-u-ca-gregory', { day: 'numeric', month: 'long' }).formatRange ? new Intl.DateTimeFormat(loc + '-u-ca-gregory', { day: 'numeric', month: 'long' }).formatRange(new Date(ppMonth.y, ppMonth.m, o.d), new Date(ppMonth.y, ppMonth.m, o.to)) : ''}` : `${ar(o.h.d)} ${PP_HIJRI_MONTHS[o.h.m - 1]} · ${new Intl.DateTimeFormat(loc + '-u-ca-gregory', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ppMonth.y, ppMonth.m, o.d))}`}</small></span></button>`).join('')}</section>` : ''}
  <p class="pp-note">التواريخ الهجرية حسب تقويم أم القرى، وقد تختلف بيوم بحسب رؤية الهلال في بلدك. مواقيت الأيام القادمة محسوبة فلكيًا حسب موقعك وطريقتك.</p>`;
}
function ppPick(d) { ppSelected = { y: ppMonth.y, m: ppMonth.m, d }; const y = scrollY; renderPrayerPage(); window.scrollTo(0, y) }
function ppShift(n) { const d = new Date(ppMonth.y, ppMonth.m + n, 1); ppMonth = { y: d.getFullYear(), m: d.getMonth() }; ppSelected = null; renderPrayerPage() }

const ppPrevRender = renderPrayerPage;
renderPrayerPage = function (force = false) {
  const data = readPrayerData(force), s = data.settings;
  if (!s.confirmed || !data.days || data.error || !prayerPhase(data)) return ppPrevRender(force);
  const sub = esc(s.city) + ' · ' + esc(prayerDayLabel(Date.now(), s.timezone));
  let body = '';
  if (prayerTab === 'month') body = ppMonthView(data);
  else if (prayerTab === 'night') body = ppNight(data);
  else body = ppHero(data) + permissionMarkup(data) + ppTable(data) + ppDuhaNight(data);
  app.innerHTML = sectionHeading('مواقيت الصلاة', sub, 'home()') + `<div class="prayer-page pp">${ppTabs()}${body}<div class="prayer-method-note">المواقيت محسوبة فلكيًا حسب الموقع والطريقة المختارة؛ طابقها مع تقويم جهتك المحلية. مدد الإقامة إعداد شخصي لمسجدك.<button class="text-link" onclick="showPrayerSources()">المصادر وطريقة الحساب ${uiIcon('info')}</button></div></div>`;
  prayerLastDay = data.days?.[1]?.date || ''; prayerViewSignature = prayerScreenSignature(data);
  try { uiLocalize(app) } catch (e) {}
  revealSection();
};
const ppPrevHome = prayerHome;
prayerHome = function () { prayerTab = 'today'; ppMonth = null; ppSelected = null; return ppPrevHome() };
