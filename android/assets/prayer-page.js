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
/* ---------- التقويم الهجري والمناسبات ---------- */
let ppCal = (() => { try { return localStorage.ppCalendar === 'h' ? 'h' : 'g' } catch (e) { return 'g' } })(), ppView = 'grid', ppHStart = null;
function ppHijriOffset() { try { const n = parseInt(localStorage.hijriOffset || '0', 10); return Math.max(-2, Math.min(2, n || 0)) } catch (e) { return 0 } }
function ppHijri(date) {
  try {
    const shifted = new Date(date.getFullYear(), date.getMonth(), date.getDate() + ppHijriOffset());
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' }).formatToParts(new Date(Date.UTC(shifted.getFullYear(), shifted.getMonth(), shifted.getDate(), 12)));
    const get = t => +(parts.find(p => p.type === t)?.value || '').replace(/\D/g, '');
    return { d: get('day'), m: get('month'), y: get('year') };
  } catch (e) { return null }
}
const PP_HIJRI_MONTHS = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];
/* المناسبة الرئيسية لليوم (إن وجدت) + نطاق الشهر/العشر للتلوين الخفيف */
function ppOccasion(h) {
  if (!h) return null;
  const { d, m } = h;
  if (m === 1 && d === 1) return { id: 'newyear', name: 'رأس السنة الهجرية', kind: 'info' };
  if (m === 1 && d === 9) return { id: 'tasua', name: 'تاسوعاء', kind: 'fast' };
  if (m === 1 && d === 10) return { id: 'ashura', name: 'يوم عاشوراء', kind: 'fast' };
  if (m === 9 && d === 1) return { id: 'ramadan', name: 'بداية شهر رمضان', kind: 'major' };
  if (m === 9 && d === 21) return { id: 'lastten', name: 'بداية العشر الأواخر', kind: 'major' };
  if (m === 10 && d === 1) return { id: 'fitr', name: 'عيد الفطر', kind: 'eid' };
  if (m === 10 && d === 2) return { id: 'shawwal', name: 'بداية صيام الست من شوال', kind: 'fast' };
  if (m === 12 && d === 1) return { id: 'dhul10', name: 'بداية عشر ذي الحجة', kind: 'major' };
  if (m === 12 && d === 8) return { id: 'tarwiyah', name: 'يوم التروية', kind: 'major' };
  if (m === 12 && d === 9) return { id: 'arafah', name: 'يوم عرفة', kind: 'fast' };
  if (m === 12 && d === 10) return { id: 'adha', name: 'عيد الأضحى', kind: 'eid' };
  if (m === 12 && d >= 11 && d <= 13) return { id: 'tashreeq', name: 'أيام التشريق', kind: 'eid' };
  if (d >= 13 && d <= 15 && !(m === 12 && d === 13) && m !== 9) return { id: 'white', name: 'الأيام البيض', kind: 'white' };
  return null;
}
function ppRange(h) { if (!h) return ''; if (h.m === 9) return h.d >= 21 ? 'r-lastten' : 'r-ramadan'; if (h.m === 12 && h.d <= 9) return 'r-dhul'; return '' }
/* شرح المناسبات من الكتاب والسنة الصحيحة */
const PP_INFO = {
  arafah: { title: 'يوم عرفة', moon: true, points: [['صيامه لغير الحاج يكفّر السنة الماضية والباقية.', 'صحيح مسلم ١١٦٢'], ['خير الدعاء دعاء يوم عرفة.', 'جامع الترمذي ٣٥٨٥'], ['يوم الوقوف بعرفة، ركن الحج الأعظم.', '']] },
  ashura: { title: 'يوم عاشوراء', moon: true, points: [['صيامه يكفّر السنة التي قبله.', 'صحيح مسلم ١١٦٢'], ['يُستحب أن يُصام معه اليوم التاسع.', 'صحيح مسلم ١١٣٤']] },
  tasua: { title: 'تاسوعاء', moon: true, points: [['قال النبي ﷺ: «لئن بقيتُ إلى قابل لأصومنّ التاسع».', 'صحيح مسلم ١١٣٤']] },
  white: { title: 'الأيام البيض', moon: true, points: [['صيام ثلاثة أيام من كل شهر كصيام الدهر.', 'صحيح البخاري ١٩٧٩'], ['ويُستحب أن تكون الثالث عشر والرابع عشر والخامس عشر من الشهر الهجري.', 'سنن النسائي ٢٤٢٤']] },
  ramadan: { title: 'شهر رمضان', moon: true, points: [['صيامه ركن من أركان الإسلام: ﴿يَا أَيُّهَا الَّذِينَ آمَنُوا كُتِبَ عَلَيْكُمُ الصِّيَامُ﴾.', 'البقرة ١٨٣'], ['من صام رمضان إيمانًا واحتسابًا غُفر له ما تقدّم من ذنبه.', 'صحيح البخاري ٣٨']] },
  lastten: { title: 'العشر الأواخر من رمضان', moon: true, points: [['كان النبي ﷺ يجتهد في العشر الأواخر ما لا يجتهد في غيرها.', 'صحيح مسلم ١١٧٥'], ['تحرّوا ليلة القدر في الوتر من العشر الأواخر.', 'صحيح البخاري ٢٠١٧']] },
  fitr: { title: 'عيد الفطر', moon: true, points: [['يحرم صيام يوم العيد.', 'صحيح البخاري ١٩٩٠'], ['تُخرج زكاة الفطر قبل خروج الناس إلى الصلاة.', 'صحيح البخاري ١٥٠٣']] },
  shawwal: { title: 'صيام ست من شوال', moon: true, points: [['من صام رمضان ثم أتبعه ستًّا من شوال كان كصيام الدهر.', 'صحيح مسلم ١١٦٤']] },
  dhul10: { title: 'عشر ذي الحجة', moon: true, points: [['ما من أيام العمل الصالح فيهن أحب إلى الله من هذه الأيام.', 'صحيح البخاري ٩٦٩']] },
  tarwiyah: { title: 'يوم التروية', moon: true, points: [['الثامن من ذي الحجة؛ يُحرم فيه الحاج بالحج ويتوجه إلى منى.', 'صحيح مسلم ١٢١٨']] },
  adha: { title: 'عيد الأضحى', moon: true, points: [['يوم النحر، ويحرم صيامه.', 'صحيح البخاري ١٩٩٠'], ['ويبدأ وقت الأضحية بعد صلاة العيد.', 'صحيح البخاري ٥٥٤٥']] },
  tashreeq: { title: 'أيام التشريق', moon: true, points: [['أيام أكل وشرب وذكر لله.', 'صحيح مسلم ١١٤١']] },
  newyear: { title: 'شهر الله المحرم', moon: true, points: [['أفضل الصيام بعد رمضان شهر الله المحرم.', 'صحيح مسلم ١١٦٣']] }
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
/* ---------- تبويب الشهر ---------- */
function ppAddDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n) }
function ppHijriMonthStart(date) { let d = new Date(date.getFullYear(), date.getMonth(), date.getDate()), h = ppHijri(d); if (!h) return d; d = ppAddDays(d, -(h.d - 1)); for (let i = 0; i < 3 && ppHijri(d).d !== 1; i++) d = ppAddDays(d, ppHijri(d).d > 15 ? 1 : -1); return d }
function ppMonthDates(s) {
  const tp = prayerLocalParts(Date.now(), s.timezone), today = new Date(tp.year, tp.month - 1, tp.day);
  if (ppCal === 'h') {
    if (!ppHStart) ppHStart = ppHijriMonthStart(today);
    const m = ppHijri(ppHStart).m, list = [];
    for (let d = ppHStart; ppHijri(d).m === m && list.length < 31; d = ppAddDays(d, 1)) list.push(d);
    return { list, today };
  }
  if (!ppMonth) ppMonth = { y: tp.year, m: tp.month - 1 };
  const n = new Date(ppMonth.y, ppMonth.m + 1, 0).getDate();
  return { list: Array.from({ length: n }, (_, i) => new Date(ppMonth.y, ppMonth.m, i + 1)), today };
}
const ppKey = d => d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
function ppFmt(d, o) { return new Intl.DateTimeFormat(uiLocale() + '-u-ca-gregory', o).format(d) }
function ppHStr(h) { return h ? `${ar(h.d)} ${PP_HIJRI_MONTHS[h.m - 1]} ${ar(h.y)} هـ` : '' }
function ppShort(t, zone) { if (!Number.isFinite(t)) return '—'; return new Intl.DateTimeFormat(uiLocale() + '-u-ca-gregory', { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(new Date(t)).filter(p => p.type === 'hour' || p.type === 'minute' || p.type === 'literal' && p.value.trim() === ':').map(p => p.value).join('') }
function ppMonthView(data) {
  const s = data.settings, { list, today } = ppMonthDates(s), first = list[0], last = list[list.length - 1];
  if (!ppSelected || !list.some(d => ppKey(d) === ppKey(ppSelected))) ppSelected = list.find(d => ppKey(d) === ppKey(today)) || first;
  const h1 = ppHijri(first), h2 = ppHijri(last);
  const gTitle = ppFmt(first, { month: 'long', year: 'numeric' }), gTitle2 = first.getMonth() === last.getMonth() ? gTitle : ppFmt(first, { month: 'long' }) + ' – ' + ppFmt(last, { month: 'long', year: 'numeric' });
  const hTitle = h1 && h2 ? (h1.m === h2.m ? `${PP_HIJRI_MONTHS[h1.m - 1]} ${ar(h1.y)} هـ` : `${PP_HIJRI_MONTHS[h1.m - 1]} – ${PP_HIJRI_MONTHS[h2.m - 1]} ${ar(h2.y)} هـ`) : '';
  const title = ppCal === 'h' ? hTitle : gTitle, sub = ppCal === 'h' ? gTitle2 : hTitle;
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(uiLocale(), { weekday: 'narrow' }).format(new Date(2026, 10, 15 + i)));
  const occasions = [];
  const cells = Array.from({ length: first.getDay() }, () => '<span class="pp-cell empty"></span>');
  for (const date of list) {
    const h = ppHijri(date), occ = ppOccasion(h), range = ppRange(h), k = ppKey(date);
    if (occ && occ.kind !== 'white') { const lo = occasions[occasions.length - 1]; if (lo && lo.occ.id === occ.id && ppKey(ppAddDays(lo.to, 1)) === k) { lo.to = date; lo.hTo = h } else occasions.push({ from: date, to: date, h, hTo: h, occ }) }
    const big = ppCal === 'h' ? (h ? ar(h.d) : '') : ar(date.getDate()), small = ppCal === 'h' ? ar(date.getDate()) : (h ? ar(h.d) : '');
    cells.push(`<button class="pp-cell ${range}${k === ppKey(today) ? ' today' : ''}${k === ppKey(ppSelected) ? ' sel' : ''}${occ ? ' occ-' + occ.kind : ''}" onclick="ppPickKey('${k}')" aria-label="${ppFmt(date, { day: 'numeric', month: 'long' })}${h ? ' · ' + ppHStr(h) : ''}${occ ? ' · ' + occ.name : ''}"><b>${big}</b><small>${small}</small>${occ ? '<i></i>' : ''}</button>`);
  }
  const head = `<section class="pp-card pp-month">
    <div class="pp-month-bar"><div class="pp-seg" role="group" aria-label="نوع التقويم"><button class="${ppCal === 'g' ? 'on' : ''}" onclick="ppSetCal('g')">ميلادي</button><button class="${ppCal === 'h' ? 'on' : ''}" onclick="ppSetCal('h')">هجري</button></div><div class="pp-seg" role="group" aria-label="طريقة العرض"><button class="${ppView === 'grid' ? 'on' : ''}" onclick="ppSetView('grid')">${uiIcon('calendar')}</button><button class="${ppView === 'table' ? 'on' : ''}" onclick="ppSetView('table')" aria-label="جدول المواقيت">${uiIcon('playlist')}</button></div></div>
    <div class="pp-month-head"><button aria-label="الشهر السابق" onclick="ppShift(-1)">${uiIcon('chevronR')}</button><span><h2>${title}</h2><p>${sub}</p></span><button aria-label="الشهر التالي" onclick="ppShift(1)">${uiIcon('chevron')}</button></div>`;
  let body;
  if (ppView === 'table') {
    body = head + `<div class="pp-mtable"><div class="pp-mrow pp-mlabels"><span>اليوم</span>${['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].map(k => `<span>${prayerNames[k]}</span>`).join('')}</div>${list.map(date => {
      const t = ppDayTimes(s, date), h = ppHijri(date), occ = ppOccasion(h), k = ppKey(date);
      const big = ppCal === 'h' ? (h ? ar(h.d) : '') : ar(date.getDate()), small = ppCal === 'h' ? ar(date.getDate()) : (h ? ar(h.d) : '');
      return `<button class="pp-mrow${k === ppKey(today) ? ' today' : ''}${occ ? ' occ-' + occ.kind : ''}" onclick="ppPickKey('${k}',true)"><span class="pp-mday"><b>${big}</b><small>${small}</small>${occ ? '<i></i>' : ''}</span>${['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].map(p => `<time>${t ? ppShort(t[p], s.timezone) : '—'}</time>`).join('')}</button>`;
    }).join('')}</div><p class="pp-mnote">الأوقات بنظام ١٢ ساعة. اضغط على أي يوم لعرض تفاصيله.</p></section>`;
  } else {
    body = head + `<div class="pp-week">${weekdays.map(w => `<span>${w}</span>`).join('')}</div><div class="pp-grid">${cells.join('')}</div>
    <div class="pp-legend"><span><i class="eid"></i>عيد</span><span><i class="major"></i>مناسبة</span><span><i class="fast"></i>صيام مستحب</span><span><i class="white"></i>الأيام البيض</span></div></section>` + ppDayCard(s, ppSelected);
  }
  const hijriAdj = ppHijriOffset();
  return body + (occasions.length ? `<section class="pp-card pp-occasions"><div class="pp-card-head"><span><h2>مناسبات الشهر</h2></span></div>${occasions.map(o => `<button class="occ-${o.occ.kind}" onclick="ppPickKey('${ppKey(o.from)}',true)"><i></i><span><strong>${o.occ.name}</strong><small>${ppKey(o.to) !== ppKey(o.from) ? `${ar(o.h.d)}–${ar(o.hTo.d)} ${PP_HIJRI_MONTHS[o.h.m - 1]}` : ppHStr(o.h)} · ${ppFmt(o.from, { weekday: 'long', day: 'numeric', month: 'long' })}</small></span>${uiIcon('chevron')}</button>`).join('')}</section>` : '')
    + `<section class="pp-card pp-adjust"><div><strong>ضبط التاريخ الهجري</strong><small>حسب تقويم أم القرى. إذا أُعلن ثبوت الهلال بخلافه، عدّل بيوم.</small></div><div class="pp-stepper"><button onclick="ppAdjust(-1)" ${hijriAdj <= -2 ? 'disabled' : ''} aria-label="إنقاص يوم">−</button><b>${hijriAdj > 0 ? '+' : ''}${ar(hijriAdj)}</b><button onclick="ppAdjust(1)" ${hijriAdj >= 2 ? 'disabled' : ''} aria-label="زيادة يوم">+</button></div></section>`;
}
function ppDayCard(s, date) {
  const t = ppDayTimes(s, date), next = ppDayTimes(s, ppAddDays(date, 1)), h = ppHijri(date), occ = ppOccasion(h), info = occ ? PP_INFO[occ.id] : null;
  const night = t && next ? { mid: t.maghrib + (next.fajr - t.maghrib) / 2, last: t.maghrib + (next.fajr - t.maghrib) * 2 / 3 } : null;
  const keys = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
  return `<section class="pp-card pp-day">
    <div class="pp-day-head"><span><h2>${ppFmt(date, { weekday: 'long', day: 'numeric', month: 'long' })}</h2><p>${ppHStr(h)}</p></span>${occ ? `<em class="pp-chip occ-${occ.kind}">${occ.name}</em>` : ''}</div>
    ${t ? `<div class="pp-strip">${keys.map(k => `<div><span>${prayerNames[k]}</span><time>${ppShort(t[k], s.timezone)}</time></div>`).join('')}</div>` : '<p class="small-note">تعذر حساب هذا اليوم.</p>'}
    ${info ? `<div class="pp-occ occ-${occ.kind}"><strong>${info.title}</strong><p>${info.points[0][0]}</p>${info.points[0][1] ? `<small>${info.points[0][1]}</small>` : ''}</div>` : ''}
    <details class="pp-more"><summary><span>عرض التفاصيل</span>${uiIcon('chevron')}</summary>
      ${t ? `<h4 class="pp-more-h">الإقامة</h4><div class="pp-more-grid">${keys.filter(k => k !== 'sunrise').map(k => `<div><span>${prayerNames[k]}</span><time>${ppShort(t[k] + (s.prayers?.[k]?.iqama || 0) * 60000, s.timezone)}</time></div>`).join('')}</div>` : ''}
      ${night ? `<h4 class="pp-more-h">الليل والضحى</h4><div class="pp-more-grid night"><div><span>منتصف الليل</span><time>${prayerClock(night.mid, s.timezone)}</time></div><div><span>الثلث الأخير</span><time>${prayerClock(night.last, s.timezone)}</time></div><div><span>الضحى</span><time>${prayerClock(t.duha, s.timezone)}</time></div></div>` : ''}
      ${info ? `<div class="pp-info">${info.points.slice(1).map(([txt, src]) => `<p>${txt}${src ? `<small>${src}</small>` : ''}</p>`).join('')}${info.moon ? '<p class="pp-moon">يعتمد على ثبوت رؤية الهلال؛ التاريخ المعروض حسب تقويم أم القرى وقد يختلف بيوم في بلدك. يمكنك ضبطه من «ضبط التاريخ الهجري».</p>' : ''}</div>` : ''}
    </details>
  </section>`;
}
function ppPickKey(k, fromList) { const [y, m, d] = k.split('-').map(Number); ppSelected = new Date(y, m, d); if (fromList) ppView = 'grid'; const sy = scrollY; renderPrayerPage(); if (fromList) document.querySelector('.pp-day')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); else window.scrollTo(0, sy) }
function ppShift(n) {
  if (ppCal === 'h') { const base = ppHStart || ppHijriMonthStart(new Date()); ppHStart = ppHijriMonthStart(ppAddDays(base, n > 0 ? 32 : -2)) }
  else { const d = new Date(ppMonth.y, ppMonth.m + n, 1); ppMonth = { y: d.getFullYear(), m: d.getMonth() } }
  ppSelected = null; renderPrayerPage();
}
function ppSetCal(c) { ppCal = c; try { localStorage.ppCalendar = c } catch (e) {} const anchor = ppSelected || new Date(); if (c === 'h') ppHStart = ppHijriMonthStart(anchor); else ppMonth = { y: anchor.getFullYear(), m: anchor.getMonth() }; renderPrayerPage() }
function ppSetView(v) { ppView = v; renderPrayerPage() }
function ppAdjust(n) { const v = Math.max(-2, Math.min(2, ppHijriOffset() + n)); try { localStorage.hijriOffset = String(v) } catch (e) {} if (ppCal === 'h') ppHStart = ppHijriMonthStart(ppSelected || new Date()); const sy = scrollY; renderPrayerPage(); window.scrollTo(0, sy) }

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
prayerHome = function () { prayerTab = 'today'; ppMonth = null; ppHStart = null; ppSelected = null; ppView = 'grid'; return ppPrevHome() };
