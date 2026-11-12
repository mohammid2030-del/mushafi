'use strict';
/* صحبة الفجر — "صحّيني معك للفجر".
   Lists of people to call at Fajr. The page owns the lists, the run and the log; the native
   shell owns the contact picker, the call itself and the alarm at Fajr.
   Android dials automatically one after another; iOS needs one tap per call (Apple rule) but
   reports exactly whether the call was answered. */

const FAJR_KEY = 'fajrCompanion', FAJR_LOG = 'fajrCompanionLog', FAJR_LOG_MAX = 60;
const FAJR_WEEK = [[6, 'السبت'], [0, 'الأحد'], [1, 'الاثنين'], [2, 'الثلاثاء'], [3, 'الأربعاء'], [4, 'الخميس'], [5, 'الجمعة']];
// Weekday names come from the device locale outside Arabic, so "Friday" is never mistaken for the surah name.
function fajrDayName(n, style = 'long') {
  if (typeof uiLocale !== 'function' || uiLocale() === 'ar') return FAJR_WEEK.find(([d]) => d === n)[1];
  const d = new Date(2026, 0, 4 + n);   // 4 Jan 2026 is a Sunday
  try { return new Intl.DateTimeFormat(uiLocale(), { weekday: style }).format(d) } catch (e) { return FAJR_WEEK.find(([x]) => x === n)[1] }
}
const FAJR_LIMITS = {
  gap: [3, 60, 8], retries: [0, 5, 1], retryWait: [10, 300, 30], afterAnswer: [0, 60, 5], loops: [1, 5, 1], offset: [-30, 60, 0]
};
let fajrDraft = null, fajrOrigin = 'home', fajrRunState = null, fajrPickTarget = null;

Object.assign(iconPaths, {
  fajr: '<path d="M3 18h18M6 18a6 6 0 0 1 12 0M12 4v3M4.9 8.9l2.1 2.1M19.1 8.9 17 11M8 21h8"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  contacts: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  'user-plus': '<circle cx="10" cy="8" r="4"/><path d="M2 21a8 8 0 0 1 13-6.3M19 14v6M16 17h6"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  plus: iconPaths.plus || '<path d="M12 5v14M5 12h14"/>',
  skip: '<path d="M5 5v14l10-7zM19 5v14"/>',
  bell: iconPaths.bell || '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4"/>',
  clock: iconPaths.clock || '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
});

/* ---------- storage ---------- */
function fajrId() { return Math.random().toString(36).slice(2, 10) }
function fajrClamp(v, key) { const [min, max, def] = FAJR_LIMITS[key]; v = Math.round(+v); return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def }
function fajrNewList() {
  return { id: fajrId(), name: '', enabled: true, mode: 'adhan', offset: 0, time: '04:30', days: [0, 1, 2, 3, 4, 5, 6], members: [],
    gap: 8, retries: 1, retryWait: 30, afterAnswer: 5, loops: 1, stopFirst: false }
}
function fajrClean(list) {
  const l = Object.assign(fajrNewList(), list || {});
  l.name = String(l.name || '').trim().slice(0, 40);
  l.mode = l.mode === 'manual' ? 'manual' : 'adhan';
  l.time = /^([01]\d|2[0-3]):[0-5]\d$/.test(l.time) ? l.time : '04:30';
  l.days = [...new Set((l.days || []).map(Number).filter(d => d >= 0 && d <= 6))];
  l.members = (l.members || []).filter(m => m && /^[A-Za-z0-9]{6,128}$/.test(m.id || '') && !m.phone).slice(0, 30).map(m => ({ id: m.id, name: String(m.name || '').trim().slice(0, 60) || 'مستخدم مصحفي' }));
  for (const k of ['gap', 'retries', 'retryWait', 'afterAnswer', 'loops', 'offset']) l[k] = fajrClamp(l[k], k);
  l.enabled = !!l.enabled; l.stopFirst = !!l.stopFirst;
  return l
}
function fajrPhone(p) { const s = String(p || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[^\d+]/g, ''); return /^\+?\d{3,18}$/.test(s) ? s : '' }
function fajrLoad() { const c = readJSON(FAJR_KEY, null); return { version: 1, lists: Array.isArray(c?.lists) ? c.lists.slice(0, 20).map(fajrClean) : [] } }
function fajrStore(config) {
  localStorage.setItem(FAJR_KEY, JSON.stringify(config));
  fajrSync()
}
function fajrLog() { const l = readJSON(FAJR_LOG, []); return Array.isArray(l) ? l : [] }
function fajrNative(name, ...args) { try { const f = window.AndroidReader?.[name]; return typeof f === 'function' ? f.apply(window.AndroidReader, args) : undefined } catch (e) { return undefined } }
function fajrStatus() { try { return JSON.parse(fajrNative('fajrStatus') || '{}') } catch (e) { return {} } }
function fajrPlatform() { return fajrStatus().platform || (window.AndroidReader ? 'android' : 'web') }

/* ---------- time ---------- */
function fajrTimesByDay() {
  const map = {};
  try { for (const d of readPrayerData()?.days || []) if (d.fajr) { const x = new Date(d.fajr); map[x.toDateString()] = d.fajr } } catch (e) {}
  return map
}
function fajrNextAt(list, now = Date.now()) {
  if (!list.enabled || !list.members.length || !list.days.length) return 0;
  const fajrs = fajrTimesByDay(), known = Object.values(fajrs).sort();
  for (let add = 0; add < 9; add++) {
    const day = new Date(now); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() + add);
    if (!list.days.includes(day.getDay())) continue;
    let at;
    if (list.mode === 'manual') { const [h, m] = list.time.split(':').map(Number); const t = new Date(day); t.setHours(h, m, 0, 0); at = t.getTime() }
    else {
      let base = fajrs[day.toDateString()];
      if (!base && known.length) { const ref = new Date(known[known.length - 1]), t = new Date(day); t.setHours(ref.getHours(), ref.getMinutes(), 0, 0); base = t.getTime() }
      if (!base) continue;
      at = base + list.offset * 60000
    }
    if (at > now) return at
  }
  return 0
}
function fajrNext(config = fajrLoad()) {
  let best = null;
  for (const l of config.lists) { const at = fajrNextAt(l); if (at && (!best || at < best.at)) best = { at, list: l } }
  return best
}
function fajrClock(t) { return new Date(t).toLocaleTimeString(uiLocale() === 'ar' ? 'ar-SA-u-nu-arab' : uiLocale(), { hour: 'numeric', minute: '2-digit' }) }
function fajrDayLabel(t) {
  const d = new Date(t), today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - today) / 86400000);
  if (diff === 0) return 'اليوم'; if (diff === 1) return 'غدًا';
  return `<span translate="no">${fajrDayName(d.getDay())}</span>`
}
function fajrIn(t) {
  const m = Math.max(0, Math.round((t - Date.now()) / 60000)), h = Math.floor(m / 60), r = m % 60;
  if (h && r) return 'بعد ' + ar(h) + ' س و' + ar(r) + ' د';
  if (h) return 'بعد ' + ar(h) + ' س';
  return 'بعد ' + ar(r) + ' د'
}
function fajrWhen(l) {
  if (l.mode === 'manual') { const [h, m] = l.time.split(':').map(Number); const t = new Date(); t.setHours(h, m, 0, 0); return fajrClock(t) }
  if (!l.offset) return 'مع أذان الفجر';
  return (l.offset > 0 ? 'بعد الأذان بـ ' : 'قبل الأذان بـ ') + ar(Math.abs(l.offset)) + ' د'
}
function fajrDaysText(days) {
  if (days.length === 7) return 'يوميًا';
  if (!days.length) return 'بدون أيام';
  return `<span translate="no">${FAJR_WEEK.filter(([n]) => days.includes(n)).map(([n]) => fajrDayName(n, days.length > 3 ? 'short' : 'long')).join(uiLocale() === 'ar' ? '، ' : ', ')}</span>`
}
function fajrT(key, ...args) { let out = key; try { if (typeof uiLanguage !== 'undefined' && uiLanguage !== 'ar' && uiDictionary?.[key]) out = uiDictionary[key] } catch (e) {} return out.replace(/\{(\d+)\}/g, (_, n) => args[n] ?? '') }
function fajrPeople(n) { return ar(n) + ' ' + (n === 1 ? 'شخص' : n === 2 ? 'شخصان' : n < 11 ? 'أشخاص' : 'شخصًا') }
function fajrBits(parts) { return parts.filter(Boolean).map(p => `<span>${p}</span>`).join('<i aria-hidden="true">·</i>') }
function fajrInitials(name) { const w = String(name || '؟').trim().split(/\s+/); return esc((w[0]?.[0] || '؟') + (w[1]?.[0] || '')) }

/* ---------- home card + More row ---------- */
function fajrHomeCard() {
  const next = fajrNext();
  const title = next ? `<span>صحبتك القادمة</span> <span>${fajrClock(next.at)}</span>` : 'صحّيني معك للفجر';
  const sub = next ? fajrBits([`<bdi>${esc(next.list.name || 'قائمة الفجر')}</bdi>`, fajrPeople(next.list.members.length), fajrDayLabel(next.at)])
    : 'يتصل بمن تحب وقت أذان الفجر، فقد تكون سببًا في صلاته';
  return `<button class="fajr-home-card" data-fajr-entry onclick="fajrHome('home')"><span class="fajr-home-art" aria-hidden="true">${uiIcon('fajr')}</span><span class="fajr-home-text"><span class="fajr-kicker">صحبة الفجر</span><strong>${title}</strong><small>${sub}</small></span><span class="fajr-home-arrow">${uiIcon('arrow')}</span></button>`
}
const fajrOldHome = home;
home = function (...args) {
  const r = fajrOldHome.apply(this, args);
  if (view === 'home' && !app.querySelector('[data-fajr-entry]')) {
    const anchor = app.querySelector('.home-charity-card') || app.querySelector('.home-footer');
    if (anchor) anchor.insertAdjacentHTML('beforebegin', fajrHomeCard()); else app.insertAdjacentHTML('beforeend', fajrHomeCard());
    uiLocalize?.(app.querySelector('[data-fajr-entry]'))
  }
  return r
};
const fajrOldMore = moreHome;
moreHome = function (...args) {
  const r = fajrOldMore.apply(this, args);
  const menu = app.querySelector('.menu-list');
  if (view === 'more' && menu && !menu.querySelector('[data-fajr-row]')) {
    const row = document.createElement('div');
    row.innerHTML = listAction('fajr', 'صحبة الفجر', 'صحّيني معك للفجر باتصال تلقائي', "fajrHome('more')").replace('class="menu-row"', 'class="menu-row" data-fajr-row');
    menu.children[1] ? menu.children[1].before(row.firstChild) : menu.append(row.firstChild);
    uiLocalize?.(menu)
  }
  return r
};

/* ---------- main screen ---------- */
function fajrBack() { return fajrOrigin === 'more' ? 'moreHome()' : 'home()' }
function fajrSignedIn() { return typeof cloudState === 'undefined' || !!cloudState.uid }
function fajrHome(origin) {
  if (origin) fajrOrigin = origin;
  if (!fajrSignedIn()) { fajrGate(); return }
  enterSection('fajr', fajrOrigin === 'more' ? 'n-more' : 'n-home');
  if (fajrPeers === null) fajrLoadPeers();
  const config = fajrLoad(), next = fajrNext(config), st = fajrStatus(), platform = st.platform || (window.AndroidReader ? 'android' : 'web');
  const hero = next
    ? `<span class="fajr-kicker">الصحبة القادمة</span><strong class="fajr-hero-time">${fajrClock(next.at)}</strong><span class="fajr-hero-meta fajr-meta">${fajrBits([fajrDayLabel(next.at), `<bdi>${esc(next.list.name || 'قائمة الفجر')}</bdi>`, fajrIn(next.at)])}</span>`
    : `<span class="fajr-kicker">صحبة الفجر</span><strong class="fajr-hero-title">صحّيني معك للفجر</strong><span class="fajr-hero-meta">ادعُ من طلب منك إيقاظه، ويرنّ جواله من داخل مصحفي وقت الأذان</span>`;
  app.innerHTML = sectionHeading('صحبة الفجر', 'قد يكون اتصالك سببًا في صلاة من تحب', fajrBack()) +
    `<section class="fajr-hero">${hero}<p class="fajr-verse">﴿وَقُرْآنَ الْفَجْرِ إِنَّ قُرْآنَ الْفَجْرِ كَانَ مَشْهُودًا﴾</p></section>` +
    fajrNotices(st, platform) +
    `<div class="section-label"><h2>قوائمك</h2>${config.lists.length ? `<span>${ar(config.lists.length)}</span>` : ''}</div>` +
    (config.lists.length ? `<div class="fajr-lists">${config.lists.map(fajrListCard).join('')}</div>` : `<div class="fajr-empty">${uiIcon('contacts')}<strong>لا توجد قوائم بعد</strong><p>ادعُ من طلب منك إيقاظه، ثم أنشئ قائمة وأضفه لها</p></div>`) +
    `<button class="fajr-new" onclick="fajrEdit()">${uiIcon('plus')}<span>قائمة جديدة</span></button>` +
    `<div class="content-card menu-list fajr-menu">${listAction('contacts', 'الأشخاص', 'الدعوات، ومن تصحّيهم، ومن يصحّونك', 'fajrPeopleHome()')}${listAction('history', 'سجل الاتصالات', 'من ردّ ومن لم يردّ في كل صحبة', 'fajrHistory()')}${listAction('info', 'كيف تعمل صحبة الفجر', 'رنين من داخل مصحفي، واحدًا تلو الآخر', 'fajrHowItWorks()')}</div>`;
  app.querySelectorAll('[data-fajr-toggle]').forEach(input => input.onchange = e => {
    e.stopPropagation(); const c = fajrLoad(), l = c.lists.find(x => x.id === input.dataset.fajrToggle); if (!l) return;
    if (input.checked && !l.members.length) { input.checked = false; showSmallNotice('أضف شخصًا واحدًا على الأقل'); return }
    l.enabled = input.checked; fajrStore(c); fajrHome()
  });
  app.querySelectorAll('.fajr-switch').forEach(s => s.onclick = e => e.stopPropagation());
  revealSection()
}
function fajrNotices(st, platform) {
  const out = [];
  if (st.notifications === false) out.push(`<div class="fajr-notice"><span>${uiIcon('bell')}</span><div><strong>التنبيهات متوقفة</strong><small>فعّلها ليصلك تنبيه الصحبة، ويصلك رنين من يصحّيك</small></div><button onclick="fajrAskPermissions()">تفعيل</button></div>`);
  if (platform === 'android' && st.fullScreen === false) out.push(`<div class="fajr-notice"><span>${uiIcon('phone')}</span><div><strong>اسمح بالرنين على الشاشة</strong><small>ليظهر الرنين حتى لو كان الجوال مقفولًا</small></div><button onclick="fajrAskPermissions()">السماح</button></div>`);
  if (platform === 'android' && st.exact === false) out.push(`<div class="fajr-notice"><span>${uiIcon('clock')}</span><div><strong>اسمح بالمنبهات الدقيقة</strong><small>ليبدأ الاتصال في الوقت تمامًا</small></div><button onclick="fajrNative('fajrOpenAlarmSettings')">الإعدادات</button></div>`);
  return out.join('')
}
function fajrListCard(l) {
  const next = fajrNextAt(l), faces = l.members.slice(0, 4).map(m => `<span>${fajrInitials(m.name)}</span>`).join('') + (l.members.length > 4 ? `<span>+${ar(l.members.length - 4)}</span>` : '');
  return `<article class="fajr-list-card${l.enabled ? '' : ' off'}" onclick="fajrEdit('${l.id}')" tabindex="0" role="button">
    <div class="fajr-list-top"><div><strong>${esc(l.name || 'قائمة الفجر')}</strong><small class="fajr-meta">${fajrBits([fajrWhen(l), fajrDaysText(l.days)])}</small></div>
    <label class="fajr-switch" aria-label="تفعيل القائمة"><input type="checkbox" data-fajr-toggle="${l.id}" ${l.enabled ? 'checked' : ''}><span></span></label></div>
    <div class="fajr-list-bottom"><span class="fajr-faces">${faces || '<em>لا يوجد أشخاص</em>'}</span><span class="fajr-list-next">${next ? fajrDayLabel(next) + ' ' + fajrClock(next) : (l.enabled ? '' : 'متوقفة')}</span></div></article>`
}

/* ---------- people: invites and the Mushafi users on each side ---------- */
const WAKE_SITE = 'https://mohammid2030-del.github.io/mushafi-support/wake.html';
let fajrPeers = null, fajrPeersBusy = false;
function fajrPeersOf(role) { return (fajrPeers || []).filter(p => p.role === role) }
function fajrLoadPeers() {
  if (fajrPeersBusy) return; fajrPeersBusy = true;
  if (!window.AndroidReader?.wakePeers) { fajrPeersBusy = false; fajrPeers = fajrPeers || []; return }
  fajrNative('wakePeers')
}
window.onWakePeers = function (r) {
  fajrPeersBusy = false;
  try { r = typeof r === 'string' ? JSON.parse(r) : r } catch (e) { return }
  if (r?.error) { if (!fajrPeers) fajrPeers = []; fajrRepaintPeople(); return }
  fajrPeers = (r.list || []).filter(p => /^[A-Za-z0-9]{6,128}$/.test(p.uid)).map(p => ({ uid: p.uid, name: String(p.name || '').slice(0, 60) || 'مستخدم مصحفي', role: p.role, since: p.since || 0 }));
  // keep names in lists fresh, and drop people who are no longer linked
  const c = fajrLoad(), allowed = new Map(fajrPeersOf('canWake').map(p => [p.uid, p.name])); let changed = false;
  for (const l of c.lists) { const before = l.members.length; l.members = l.members.filter(m => allowed.has(m.id)).map(m => ({ id: m.id, name: allowed.get(m.id) })); if (l.members.length !== before) changed = true; if (!l.members.length && l.enabled) { l.enabled = false; changed = true } }
  if (changed) fajrStore(c);
  fajrRepaintPeople()
};
function fajrRepaintPeople() { if (view === 'fajr-people') fajrPeopleHome(); else if (view === 'fajr-edit' && fajrDraft) fajrRerender(); else if (view === 'fajr') fajrHome() }

function fajrInvite() {
  if (!window.AndroidReader?.wakeCreateInvite) { showSmallNotice('الدعوة متاحة في تطبيق مصحفي على الجوال'); return }
  showSmallNotice('نجهّز رابط الدعوة…'); fajrNative('wakeCreateInvite')
}
window.onWakeInvite = function (r) {
  try { r = typeof r === 'string' ? JSON.parse(r) : r } catch (e) { return }
  if (!r?.code) { showSmallNotice(r?.error === 'signin' ? 'سجّل دخولك أولًا' : 'تعذّر إنشاء الدعوة، تحقق من الإنترنت'); return }
  const link = WAKE_SITE + '?c=' + r.code;
  const text = fajrT('{0} يطلب أن يصحّيك لصلاة الفجر من تطبيق مصحفي.', r.name || '') + '\n' + fajrT('اقبل الدعوة من هنا:') + '\n' + link + '\n' + fajrT('أو أدخل هذا الرمز في مصحفي ← صحبة الفجر: {0}', r.code);
  if (window.AndroidReader?.shareText) AndroidReader.shareText(text); else { try { navigator.clipboard?.writeText(text) } catch (e) {} showSmallNotice('نُسخ رابط الدعوة') }
};
function fajrEnterCode(prefill) {
  const box = featureSheet('عندي رمز دعوة', 'wake-code');
  box.innerHTML = `<p class="fajr-help">أدخل الرمز اللي وصلك. بعد القبول يقدر صاحب الدعوة يرنّ عليك وقت الفجر، وتقدر توقفه متى شئت.</p>
    <input id="wake-code" class="fajr-input" dir="ltr" maxlength="10" autocomplete="off" autocapitalize="none" placeholder="abcd23efgh" value="${esc(prefill || '')}">
    <div class="fajr-actions"><button class="fajr-primary" onclick="fajrAcceptCode()">قبول الدعوة</button></div>`;
  uiLocalize?.(box); setTimeout(() => box.querySelector('#wake-code')?.focus(), 200)
}
function fajrAcceptCode(code) {
  code = String(code || document.getElementById('wake-code')?.value || '').trim().toLowerCase();
  if (!/^[a-z0-9]{10}$/.test(code)) { showSmallNotice('الرمز غير صحيح'); return }
  if (!fajrSignedIn()) { localStorage.setItem('wakePendingCode', code); closeFeatureSheet?.(); fajrGate(); return }
  if (!window.AndroidReader?.wakeAcceptInvite) { showSmallNotice('القبول متاح في تطبيق مصحفي على الجوال'); return }
  fajrNative('wakeAcceptInvite', code)
}
window.onWakeAccept = function (r) {
  try { r = typeof r === 'string' ? JSON.parse(r) : r } catch (e) { return }
  if (r?.ok) {
    closeFeatureSheet?.(); localStorage.removeItem('wakePendingCode');
    showSmallNotice(fajrT('صار {0} يقدر يصحّيك للفجر', r.name || ''));
    fajrPeers = null; fajrLoadPeers(); if (!String(view).startsWith('fajr')) fajrPeopleHome('home'); return
  }
  const msg = { code: 'الرمز غير صحيح', expired: 'انتهت صلاحية الدعوة، اطلب دعوة جديدة', self: 'هذه دعوتك أنت', signin: 'سجّل دخولك أولًا' }[r?.error] || 'تعذّر قبول الدعوة، تحقق من الإنترنت';
  showSmallNotice(msg)
};
function fajrAskAccept(code) {
  const box = featureSheet('دعوة صحبة الفجر', 'wake-accept');
  box.innerHTML = `<div class="fajr-accept"><span class="fajr-gate-emblem"><span class="fajr-orb-ring"></span>${uiIcon('fajr')}</span>
    <h3>صحّيني معك للفجر</h3><p>بعد القبول يقدر صاحب الدعوة يرنّ على جوالك وقت الفجر من داخل مصحفي. تقدر توقف هذا متى شئت من «الأشخاص».</p>
    <div class="fajr-actions"><button class="fajr-primary" onclick="fajrAcceptCode('${code}')">قبول الدعوة</button><button class="fajr-link center" onclick="closeFeatureSheet()">لاحقًا</button></div></div>`;
  uiLocalize?.(box)
}
window.onWakeLink = function () {
  const code = fajrNative('wakeConsumeLink') || '';
  if (code === 'open') { fajrHome('home'); return }
  if (!/^[a-z0-9]{10}$/.test(code)) return;
  if (!fajrSignedIn()) { localStorage.setItem('wakePendingCode', code); fajrOrigin = 'home'; fajrGate(); return }
  fajrAskAccept(code)
};
function fajrRemovePeer(uid, role) {
  const p = (fajrPeers || []).find(x => x.uid === uid); if (!p) return;
  const q = role === 'wakesMe' ? fajrT('إيقاف {0} من إيقاظك؟', p.name) : fajrT('إزالة {0} من الأشخاص؟', p.name);
  if (!confirm(q)) return;
  fajrNative('wakeRemovePeer', uid)
}
window.onWakeRemoved = function (r) {
  try { r = typeof r === 'string' ? JSON.parse(r) : r } catch (e) { return }
  if (!r?.ok) { showSmallNotice('تعذّر الحذف، تحقق من الإنترنت'); return }
  fajrPeers = (fajrPeers || []).filter(p => p.uid !== r.uid); window.onWakePeers({ list: fajrPeers })
};
function fajrPeopleHome(origin) {
  if (origin) fajrOrigin = origin;
  if (!fajrSignedIn()) { fajrGate(); return }
  enterSection('fajr-people', fajrOrigin === 'more' ? 'n-more' : 'n-home');
  if (fajrPeers === null) fajrLoadPeers();
  const row = (p, role) => `<div class="fajr-member"><span class="fajr-avatar">${fajrInitials(p.name)}</span><span class="fajr-member-text"><strong>${esc(p.name)}</strong></span><span class="fajr-member-actions"><button type="button" class="danger" onclick="fajrRemovePeer('${p.uid}','${role}')" aria-label="${role === 'wakesMe' ? 'إيقاف' : 'حذف'}">${uiIcon(role === 'wakesMe' ? 'close' : 'trash')}</button></span></div>`;
  const wake = fajrPeersOf('canWake'), me = fajrPeersOf('wakesMe');
  app.innerHTML = sectionHeading('الأشخاص', 'من تصحّيهم، ومن يصحّونك', 'fajrHome()') +
    `<div class="fajr-add-row wide"><button class="fajr-primary" onclick="fajrInvite()">${uiIcon('user-plus')}<span>دعوة شخص</span></button><button class="fajr-soft" onclick="fajrEnterCode()">${uiIcon('plus')}<span>عندي رمز دعوة</span></button></div>
    <section class="fajr-card"><div class="fajr-card-head"><h2>تصحّيهم</h2><span>${ar(wake.length)}</span></div><p class="fajr-help">قبلوا دعوتك، وتقدر تضيفهم لقوائمك.</p>
      <div class="fajr-members">${fajrPeers === null ? '<div class="fajr-members-empty">جارٍ التحميل…</div>' : wake.map(p => row(p, 'canWake')).join('') || '<div class="fajr-members-empty">ما أحد قبل دعوتك بعد. أرسل له رابط الدعوة.</div>'}</div></section>
    <section class="fajr-card"><div class="fajr-card-head"><h2>يصحّونك</h2><span>${ar(me.length)}</span></div><p class="fajr-help">قبلت دعوتهم، فيقدرون يرنّون عليك وقت الفجر.</p>
      <div class="fajr-members">${fajrPeers === null ? '' : me.map(p => row(p, 'wakesMe')).join('') || '<div class="fajr-members-empty">لا أحد</div>'}</div></section>
    <p class="fajr-help center">يلزم أن يكون مصحفي مثبتًا عند الطرفين مع تسجيل الدخول. الرنين من داخل التطبيق وليس مكالمة هاتفية.</p>`;
  uiLocalize?.(app); revealSection()
}

/* ---------- editor ---------- */
function fajrEdit(id) {
  const existing = id && fajrLoad().lists.find(l => l.id === id);
  fajrDraft = JSON.parse(JSON.stringify(existing || fajrNewList()));
  fajrDraft._new = !existing;
  if (fajrPeers === null) fajrLoadPeers();
  fajrRenderEditor()
}
function fajrStepper(key, label, unit, hint) {
  const [min, max] = FAJR_LIMITS[key], v = fajrDraft[key];
  return `<div class="fajr-step"><div><strong>${label}</strong>${hint ? `<small>${hint}</small>` : ''}</div><div class="fajr-stepper"><button type="button" data-step="${key}" data-dir="-1" ${v <= min ? 'disabled' : ''} aria-label="إنقاص">−</button><output>${ar(Math.abs(v))}<small>${unit}</small></output><button type="button" data-step="${key}" data-dir="1" ${v >= max ? 'disabled' : ''} aria-label="زيادة">+</button></div></div>`
}
function fajrRenderEditor() {
  const d = fajrDraft, today = fajrNextAt(Object.assign({}, d, { enabled: true, members: [{}], days: [0, 1, 2, 3, 4, 5, 6] }));
  const available = fajrPeersOf('canWake').filter(p => !d.members.some(m => m.id === p.uid));
  enterSection('fajr-edit', fajrOrigin === 'more' ? 'n-more' : 'n-home');
  app.innerHTML = sectionHeading(d._new ? 'قائمة جديدة' : 'تعديل القائمة', 'من تصحّيهم، ومتى', 'fajrHome()') +
    `<div class="fajr-form">
     <section class="fajr-card"><label class="fajr-label" for="fajr-name">اسم القائمة</label><input id="fajr-name" class="fajr-input" maxlength="40" placeholder="مثل: العائلة، الأصحاب" value="${esc(d.name)}"></section>

     <section class="fajr-card"><div class="fajr-card-head"><h2>الأشخاص</h2><span>${ar(d.members.length)} / ${ar(30)}</span></div>
      <p class="fajr-help">يرنّ عليهم بهذا الترتيب. رتّبهم بالأسهم.</p>
      <div class="fajr-members">${d.members.map((m, i) => `<div class="fajr-member"><span class="fajr-avatar">${fajrInitials(m.name)}</span><span class="fajr-member-text"><strong>${esc(m.name)}</strong></span><span class="fajr-member-actions"><button type="button" data-move="${i}" data-dir="-1" ${i ? '' : 'disabled'} aria-label="تقديم">${uiIcon('up')}</button><button type="button" data-move="${i}" data-dir="1" ${i < d.members.length - 1 ? '' : 'disabled'} aria-label="تأخير">${uiIcon('down')}</button><button type="button" data-remove="${i}" class="danger" aria-label="حذف">${uiIcon('trash')}</button></span></div>`).join('') || `<div class="fajr-members-empty">لم تضف أحدًا بعد</div>`}</div>
      ${available.length ? `<p class="fajr-label">أضف من الأشخاص</p><div class="fajr-peer-chips">${available.map(p => `<button type="button" class="fajr-peer-chip" data-add="${p.uid}"><span class="fajr-avatar">${fajrInitials(p.name)}</span><span>${esc(p.name)}</span>${uiIcon('plus')}</button>`).join('')}</div>` : fajrPeers === null ? '<p class="fajr-help">جارٍ تحميل الأشخاص…</p>' : ''}
      <div class="fajr-add-row"><button type="button" class="fajr-soft" onclick="fajrInvite()">${uiIcon('user-plus')}<span>دعوة شخص</span></button></div>
      <p class="fajr-help">من يقبل دعوتك يظهر هنا وتقدر تضيفه للقائمة.</p>
     </section>

     <section class="fajr-card"><div class="fajr-card-head"><h2>وقت الاتصال</h2></div>
      <div class="app-segments fajr-seg"><button type="button" class="${d.mode === 'adhan' ? 'selected' : ''}" data-mode="adhan">وقت أذان الفجر</button><button type="button" class="${d.mode === 'manual' ? 'selected' : ''}" data-mode="manual">وقت يدوي</button></div>
      ${d.mode === 'adhan' ? fajrStepper('offset', d.offset < 0 ? 'قبل الأذان' : 'بعد الأذان', 'دقيقة', 'صفر يعني مع الأذان تمامًا') : `<label class="fajr-time"><span>ابدأ الاتصال الساعة</span><input id="fajr-time" type="time" value="${d.time}"></label>`}
      ${today ? `<p class="fajr-preview">${uiIcon('clock')}<span>أقرب موعد:</span> <span>${fajrDayLabel(today)}</span> <span>${fajrClock(today)}</span></p>` : ''}
     </section>

     <section class="fajr-card"><div class="fajr-card-head"><h2>التكرار</h2><button type="button" class="fajr-link" onclick="fajrAllDays()">${d.days.length === 7 ? 'إلغاء الكل' : 'يوميًا'}</button></div>
      <div class="fajr-days">${FAJR_WEEK.map(([n]) => `<button type="button" translate="no" class="${d.days.includes(n) ? 'on' : ''}" data-day="${n}" aria-label="${fajrDayName(n)}">${fajrDayName(n, 'short')}</button>`).join('')}</div>
     </section>

     <details class="fajr-card fajr-advanced"${d._adv ? ' open' : ''}><summary><h2>إعدادات متقدمة</h2>${uiIcon('down')}</summary>
      ${fajrStepper('gap', 'الفاصل بين الأشخاص', 'ثانية', 'بين نهاية رنين وبداية التالي')}
      ${fajrStepper('retries', 'إعادة المحاولة عند عدم الرد', 'مرة', 'لكل شخص لم يرد')}
      ${fajrStepper('retryWait', 'الانتظار قبل إعادة المحاولة', 'ثانية')}
      ${fajrStepper('afterAnswer', 'الانتظار بعد الرد', 'ثانية', 'قبل الانتقال إلى الشخص التالي')}
      ${fajrStepper('loops', 'تكرار الحلقة كاملة', 'مرة', 'الجولات التالية لمن لم يرد فقط')}
      <label class="fajr-toggle"><span><strong>الإيقاف بعد أول رد</strong><small>يكفي أن يستيقظ واحد، مثل أهل البيت</small></span><span class="fajr-switch"><input type="checkbox" id="fajr-stop-first" ${d.stopFirst ? 'checked' : ''}><span></span></span></label>
     </details>

     <div class="fajr-actions"><button type="button" class="fajr-primary" onclick="fajrSaveDraft()">حفظ القائمة</button>${d.members.length ? `<button type="button" class="fajr-soft" onclick="fajrTryNow()">${uiIcon('play')}<span>تجربة الآن</span></button>` : ''}${d._new ? '' : `<button type="button" class="fajr-danger" onclick="fajrDelete()">${uiIcon('trash')}<span>حذف القائمة</span></button>`}</div>
    </div>`;
  const name = app.querySelector('#fajr-name'); name.oninput = () => d.name = name.value;
  app.querySelectorAll('[data-step]').forEach(b => b.onclick = () => { const k = b.dataset.step; d[k] = fajrClamp(d[k] + (+b.dataset.dir) * (k === 'retryWait' ? 10 : k === 'offset' ? 5 : 1), k); d._adv = app.querySelector('.fajr-advanced').open; fajrRerender() });
  app.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { d.mode = b.dataset.mode; fajrRerender() });
  app.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { const n = +b.dataset.day; d.days = d.days.includes(n) ? d.days.filter(x => x !== n) : [...d.days, n]; fajrRerender() });
  app.querySelectorAll('[data-move]').forEach(b => b.onclick = () => { const i = +b.dataset.move, j = i + (+b.dataset.dir); [d.members[i], d.members[j]] = [d.members[j], d.members[i]]; fajrRerender() });
  app.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => { d.members.splice(+b.dataset.remove, 1); fajrRerender() });
  app.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { const p = fajrPeersOf('canWake').find(x => x.uid === b.dataset.add); if (p && d.members.length < 30) { d.members.push({ id: p.uid, name: p.name }); fajrRerender() } });
  const time = app.querySelector('#fajr-time'); if (time) time.onchange = () => { if (/^\d\d:\d\d$/.test(time.value)) { d.time = time.value; fajrRerender() } };
  const stop = app.querySelector('#fajr-stop-first'); stop.onchange = () => d.stopFirst = stop.checked;
  app.querySelector('.fajr-advanced').ontoggle = e => d._adv = e.target.open;
  uiLocalize?.(app); revealSection()
}
function fajrRerender() { const y = scrollY; fajrRenderEditor(); scrollTo(0, y) }
function fajrAllDays() { fajrDraft.days = fajrDraft.days.length === 7 ? [] : [0, 1, 2, 3, 4, 5, 6]; fajrRerender() }
function fajrSaveDraft(silent) {
  const d = fajrDraft; if (!d.name.trim()) d.name = 'قائمة الفجر';
  const clean = fajrClean(d); if (!clean.members.length) clean.enabled = false;
  const c = fajrLoad(), i = c.lists.findIndex(l => l.id === clean.id);
  if (i >= 0) c.lists[i] = clean; else c.lists.push(clean);
  fajrStore(c); fajrDraft = Object.assign(clean, { _new: false });
  if (!silent) { showSmallNotice(clean.members.length ? 'حُفظت القائمة' : 'حُفظت، أضف أشخاصًا لتفعيلها'); fajrHome() }
}
function fajrDelete() {
  if (!confirm(fajrT('حذف القائمة «{0}»؟', fajrDraft.name || fajrT('قائمة الفجر')))) return;
  const c = fajrLoad(); c.lists = c.lists.filter(l => l.id !== fajrDraft.id); fajrStore(c); fajrDraft = null; showSmallNotice('حُذفت القائمة'); fajrHome()
}
function fajrTryNow() { fajrSaveDraft(true); fajrRun(fajrDraft.id, false, true) }
function fajrAskPermissions() { fajrNative('fajrRequestPermissions') }
window.onFajrPermissions = function () { if (view === 'fajr') fajrHome() };

/* ---------- run: ring each person inside Mushafi ---------- */
function fajrRun(listId, auto, test) {
  if (!fajrSignedIn()) { fajrGate(); return }
  const list = fajrLoad().lists.find(l => l.id === listId);
  if (!list || !list.members.length) { showSmallNotice('القائمة فارغة'); return }
  if (fajrRunState) fajrFinish(true, true);
  fajrRunState = { id: fajrId(), list, platform: fajrPlatform(), auto: true, test: !!test, loop: 1, index: 0, attempt: 1, results: {}, entries: [], phase: 'ready', timer: 0, until: 0, startedAt: Date.now(), current: null, callStart: 0, callId: '', token: '' };
  fajrNative('fajrKeepAwake', true); fajrNative('fajrStopAlarm');
  enterSection('fajr-run', fajrOrigin === 'more' ? 'n-more' : 'n-home');
  document.body.classList.add('fajr-running');
  fajrWait(auto ? 5 : 3, 'تبدأ الصحبة خلال', () => fajrDial())
}
function fajrMember() { const s = fajrRunState; return s.list.members[s.index] }
function fajrAdvanceIndex() {
  const s = fajrRunState, ms = s.list.members;
  for (let i = s.index; i < ms.length; i++) if (s.loop === 1 || s.results[ms[i].id] !== 'answered') { s.index = i; return true }
  if (s.loop < s.list.loops && ms.some(m => s.results[m.id] !== 'answered')) { s.loop++; s.index = 0; return fajrAdvanceIndex() }
  return false
}
function fajrDial() {
  const s = fajrRunState; if (!s) return;
  clearInterval(s.timer);
  if (!fajrAdvanceIndex()) { fajrFinish(false); return }
  const m = fajrMember(); s.current = m; s.phase = 'ringing'; s.callStart = Date.now(); s.callId = ''; s.token = fajrId(); fajrPaint();
  if (window.AndroidReader?.wakeRing) fajrNative('wakeRing', m.id, s.token);
  else { const t = s.token; setTimeout(() => window.onWakeCall({ token: t, callId: 'preview' + t, state: 'ringing' }), 300); setTimeout(() => window.onWakeCall({ token: t, callId: 'preview' + t, state: 'answered' }), 3000) }   // browser preview
}
window.onWakeCall = function (e) {
  const s = fajrRunState;
  try { e = typeof e === 'string' ? JSON.parse(e) : e } catch (x) { return }
  if (!s || !e || e.token !== s.token || s.phase !== 'ringing') return;
  if (e.state === 'ringing') { s.callId = e.callId; fajrPaint(); return }
  const map = { answered: 'answered', declined: 'declined', missed: 'missed', cancelled: 'cancelled', unreachable: 'failed', failed: 'failed' };
  fajrRecord(map[e.state] || 'failed', Math.round((Date.now() - s.callStart) / 1000), e.reason || (e.state === 'unreachable' ? 'unreachable' : ''))
};
function fajrCancelRing() { const s = fajrRunState; if (s?.phase === 'ringing' && s.callId) fajrNative('wakeCancel', s.callId) }
function fajrRecord(status, duration, reason) {
  const s = fajrRunState, m = s.current; if (!m) return;
  s.phase = 'recorded';
  s.entries.push({ memberId: m.id, name: m.name, loop: s.loop, attempt: s.attempt, status, duration: duration || 0, at: Date.now(), reason: reason || '' });
  const rank = { answered: 5, declined: 4, missed: 3, cancelled: 2, failed: 1 };
  if ((rank[status] || 0) > (rank[s.results[m.id]] || 0)) s.results[m.id] = status;
  if (status === 'answered') {
    if (s.list.stopFirst) { fajrFinish(false); return }
    s.index++; s.attempt = 1; fajrBetween(s.list.afterAnswer + s.list.gap, 'التالي خلال');
  } else if ((status === 'missed' || status === 'failed') && reason !== 'permission' && s.attempt <= s.list.retries) {
    s.attempt++; fajrBetween(s.list.retryWait, 'إعادة المحاولة خلال');
  } else { s.index++; s.attempt = 1; fajrBetween(s.list.gap, 'التالي خلال') }
}
function fajrBetween(seconds, label) {
  const s = fajrRunState;
  const more = (() => { const keep = { index: s.index, loop: s.loop }; const ok = fajrAdvanceIndex(); s.index = keep.index; s.loop = keep.loop; return ok })();
  if (!more) { fajrFinish(false); return }
  fajrWait(seconds, label, () => fajrDial())
}
function fajrWait(seconds, label, done) {
  const s = fajrRunState; clearInterval(s.timer);
  s.phase = 'wait';
  s.waitLabel = label; s.until = Date.now() + seconds * 1000; s.waitTotal = seconds; fajrPaint();
  s.timer = setInterval(() => { if (!fajrRunState) return; if (Date.now() >= s.until) { clearInterval(s.timer); done() } else fajrTick() }, 250)
}
function fajrTick() {
  const s = fajrRunState; if (!s) return;
  const left = Math.max(0, Math.ceil((s.until - Date.now()) / 1000)), bar = app.querySelector('.fajr-count-bar i'), num = app.querySelector('[data-fajr-left]');
  if (num) num.textContent = ar(left);
  if (bar) bar.style.transform = 'scaleX(' + Math.max(0, (s.until - Date.now()) / (s.waitTotal * 1000)) + ')'
}
function fajrSkip() { const s = fajrRunState; if (!s) return; clearInterval(s.timer); if (s.phase === 'wait') { s.until = 0; fajrDial() } }
function fajrTogglePause() { const s = fajrRunState; if (!s) return; if (s.phase === 'wait') { clearInterval(s.timer); s.phase = 'paused'; fajrPaint() } else if (s.phase === 'paused') fajrDial() }
function fajrStatusChip(status) {
  return { answered: ['ok', 'ردّ'], missed: ['miss', 'لم يردّ'], declined: ['decl', 'أغلق الاتصال'], cancelled: ['unsure', 'ألغيتَ الاتصال'], failed: ['fail', 'تعذّر الوصول'], unsure: ['unsure', 'غير مؤكد'] }[status] || ['wait', 'بالانتظار']
}
function fajrPaint() {
  const s = fajrRunState; if (!s || view !== 'fajr-run') return;
  const m = s.phase === 'ringing' ? s.current : (fajrAdvanceIndex() ? fajrMember() : s.current);
  const total = s.list.members.length, done = Object.keys(s.results).length;
  let status = '', action = '';
  if (s.phase === 'ringing') { status = s.callId ? 'يرنّ الآن…' : 'جارٍ الاتصال…'; action = `<button class="fajr-danger" onclick="fajrCancelRing()" ${s.callId ? '' : 'disabled'}>${uiIcon('close')}<span>إلغاء الاتصال</span></button>` }
  else if (s.phase === 'wait') { status = s.waitLabel + ' <b data-fajr-left></b> ث'; action = `<div class="fajr-count-bar"><i></i></div><div class="fajr-run-row"><button class="fajr-soft" onclick="fajrTogglePause()">إيقاف مؤقت</button><button class="fajr-soft" onclick="fajrSkip()">${uiIcon('skip')}<span>اتصل الآن</span></button></div>` }
  else if (s.phase === 'paused') { status = 'متوقفة مؤقتًا'; action = `<button class="fajr-primary" onclick="fajrDial()">${uiIcon('play')}<span>متابعة</span></button>` }
  const last = s.entries.at(-1), lastLine = last && s.phase !== 'ringing' ? `<p class="fajr-run-last"><bdi>${esc(last.name)}</bdi> · <span>${fajrStatusChip(last.status)[1]}</span></p>` : '';
  app.innerHTML = `<div class="fajr-run">
    <div class="fajr-run-head"><button class="round-action" onclick="fajrFinish(true)" aria-label="إنهاء">${uiIcon('close')}</button><div><span class="fajr-kicker">${s.test ? 'تجربة الصحبة' : 'صحبة الفجر'}</span><strong>${esc(s.list.name || 'قائمة الفجر')}</strong></div><span class="fajr-round">${s.list.loops > 1 ? 'الجولة ' + ar(s.loop) + ' من ' + ar(s.list.loops) : ar(Math.min(done + 1, total)) + ' / ' + ar(total)}</span></div>
    <div class="fajr-orb ${s.phase === 'ringing' ? 'dialing' : s.phase}"><span class="fajr-orb-ring"></span><span class="fajr-orb-face">${fajrInitials(m?.name)}</span></div>
    <div class="fajr-run-who"><strong>${esc(m?.name || '')}</strong></div>
    <p class="fajr-run-status" role="status" aria-live="polite">${status}</p>
    ${lastLine}
    <div class="fajr-run-action">${action}</div>
    <div class="fajr-queue">${s.list.members.map(p => { const r = s.results[p.id], [cls, label] = fajrStatusChip(r), now = p === m && s.phase === 'ringing'; return `<div class="fajr-q${now ? ' now' : ''}"><span class="fajr-avatar">${fajrInitials(p.name)}</span><span>${esc(p.name)}</span><em class="chip ${now ? 'call' : cls}">${now ? 'يرنّ' : label}</em></div>` }).join('')}</div>
    <button class="fajr-danger wide" onclick="fajrFinish(true)">${uiIcon('stop')}<span>إنهاء الصحبة</span></button>
  </div>`;
  uiLocalize?.(app); fajrTick()
}
function fajrFinish(stopped, quiet) {
  const s = fajrRunState; if (!s) return;
  clearInterval(s.timer); fajrRunState = null;
  if (s.phase === 'ringing' && s.callId) fajrNative('wakeCancel', s.callId);
  fajrNative('fajrKeepAwake', false); document.body.classList.remove('fajr-running');
  if (s.entries.length) {
    const log = fajrLog(); log.unshift({ id: s.id, listId: s.list.id, listName: s.list.name || 'قائمة الفجر', startedAt: s.startedAt, endedAt: Date.now(), stopped: !!stopped, test: s.test, people: s.list.members.length, results: s.results, entries: s.entries });
    localStorage.setItem(FAJR_LOG, JSON.stringify(log.slice(0, FAJR_LOG_MAX)))
  }
  if (quiet) return;
  fajrSummary(s, stopped)
}
function fajrCount(results) { const c = { answered: 0, missed: 0, declined: 0, cancelled: 0, failed: 0, unsure: 0 }; for (const v of Object.values(results)) c[v] = (c[v] || 0) + 1; return c }
function fajrSummary(s, stopped) {
  enterSection('fajr-done', fajrOrigin === 'more' ? 'n-more' : 'n-home');
  const c = fajrCount(s.results);
  app.innerHTML = `<div class="fajr-run fajr-done"><div class="fajr-done-mark">${uiIcon(c.answered ? 'check' : 'fajr')}</div><h1>${stopped ? 'أُنهيت الصحبة' : 'اكتملت الصحبة'}</h1><p>${c.answered ? 'جزاك الله خيرًا، ' + (c.answered === 1 ? 'استيقظ بسببك شخص' : 'استيقظ بسببك ' + ar(c.answered) + ' ' + (c.answered < 11 ? 'أشخاص' : 'شخصًا')) : 'لم يرد أحد هذه المرة، وأجرك ثابت إن شاء الله'}</p>
    ${fajrTotals(c, s.entries.length)}
    <div class="fajr-actions"><button class="fajr-primary" onclick="fajrHistory()">${uiIcon('history')}<span>عرض السجل</span></button><button class="fajr-soft" onclick="fajrHome()">العودة لصحبة الفجر</button></div></div>`;
  uiLocalize?.(app); revealSection()
}
function fajrTotals(c, calls) {
  return `<div class="fajr-totals"><div class="ok"><b>${ar(c.answered)}</b><span>ردّ</span></div><div class="miss"><b>${ar(c.missed + (c.failed || 0) + (c.unsure || 0))}</b><span>لم يردّ</span></div><div class="fail"><b>${ar((c.declined || 0) + (c.cancelled || 0))}</b><span>أُغلق/أُلغي</span></div><div><b>${ar(calls)}</b><span>إجمالي الاتصالات</span></div></div>`
}

/* ---------- history ---------- */
function fajrHistory() {
  enterSection('fajr-history', fajrOrigin === 'more' ? 'n-more' : 'n-home');
  const log = fajrLog(), all = { answered: 0, missed: 0, declined: 0, cancelled: 0, failed: 0, unsure: 0 }; let calls = 0;
  for (const r of log) { const c = fajrCount(r.results || {}); for (const k in all) all[k] += c[k] || 0; calls += r.entries.length }
  app.innerHTML = sectionHeading('سجل الاتصالات', 'كل صحبة: من ردّ، ومن لم يردّ', 'fajrHome()') + (log.length ? fajrTotals(all, calls) + `<div class="fajr-log">${log.map((r, i) => {
    const c = fajrCount(r.results || {}), d = new Date(r.startedAt);
    return `<details class="fajr-card fajr-log-run"${i ? '' : ' open'}><summary><div><strong>${esc(r.listName)}${r.test ? ' <em class="chip unsure">تجربة</em>' : ''}</strong><small class="fajr-meta">${fajrBits([fajrDayLabel(r.startedAt) === 'اليوم' ? 'اليوم' : d.toLocaleDateString(uiLocale() === 'ar' ? 'ar-SA-u-nu-arab' : uiLocale(), { weekday: 'long', day: 'numeric', month: 'long' }), fajrClock(r.startedAt), r.stopped ? 'أُنهيت يدويًا' : ''])}</small></div><span class="fajr-log-mini"><em class="chip ok">${ar(c.answered)}</em><em class="chip miss">${ar(c.missed + c.failed + (c.unsure || 0) + (c.declined || 0) + (c.cancelled || 0))}</em></span></summary>
      <div class="fajr-log-rows">${r.entries.map(e => { const [cls, label] = fajrStatusChip(e.status); return `<div class="fajr-log-row"><span class="fajr-avatar">${fajrInitials(e.name)}</span><span class="fajr-log-who"><strong>${esc(e.name)}</strong><small class="fajr-meta">${fajrBits([fajrClock(e.at), e.attempt > 1 ? 'محاولة ' + ar(e.attempt) : '', e.loop > 1 ? 'جولة ' + ar(e.loop) : '', e.duration ? ar(e.duration) + ' ث' : ''])}</small></span><em class="chip ${cls}">${label}</em></div>` }).join('')}</div></details>`
  }).join('')}</div><button class="fajr-link danger center" onclick="fajrClearLog()">مسح السجل</button>` : `<div class="fajr-empty">${uiIcon('history')}<strong>لا يوجد سجل بعد</strong><p>بعد أول صحبة يظهر هنا من ردّ ومن لم يردّ</p></div>`);
  revealSection()
}
function fajrClearLog() { if (confirm(fajrT('مسح سجل الاتصالات كاملًا؟'))) { localStorage.removeItem(FAJR_LOG); fajrHistory() } }

function fajrHowItWorks() {
  const steps = [['user-plus', 'ادعُ من يطلب إيقاظه', 'أرسل له رابط الدعوة، ويقبلها من مصحفي في جواله'], ['contacts', 'أنشئ قائمة', 'أضف من قبل دعوتك، ورتّبهم'], ['clock', 'حدّد الوقت', 'مع أذان الفجر، أو قبله أو بعده، أو وقت تختاره'], ['phone', 'يرنّ جوالهم', 'رنين صحبة يظهر على شاشتهم واحدًا تلو الآخر؛ إذا ردّ ينتهي فورًا'], ['history', 'تعرف النتيجة', 'ردّ، أو لم يردّ، أو أغلق الاتصال، ويُحفظ في السجل']];
  enterSection('fajr-how', fajrOrigin === 'more' ? 'n-more' : 'n-home');
  app.innerHTML = sectionHeading('كيف تعمل صحبة الفجر', 'رنين من داخل مصحفي، واحدًا تلو الآخر', 'fajrHome()') +
    `<div class="fajr-card fajr-how">${steps.map(([icon, t, d], i) => `<div class="fajr-how-step"><span class="fajr-how-num">${ar(i + 1)}</span><span class="fajr-how-icon">${uiIcon(icon)}</span><div><strong>${t}</strong><small>${d}</small></div></div>`).join('')}</div>` +
    `<p class="fajr-help center">ليست مكالمة هاتفية ولا تكلّف شيئًا. يلزم أن يكون مصحفي مثبتًا عند الطرفين مع تسجيل الدخول، والتنبيهات مفعّلة.</p>`;
  uiLocalize?.(app); revealSection()
}

/* ---------- launch from the Fajr alarm ---------- */
window.onFajrLaunch = function (id) { if (id) { fajrOrigin = 'home'; fajrRun(String(id), true) } };
function fajrCheckLaunch() { const id = fajrNative('fajrConsumeLaunch'); if (id) window.onFajrLaunch(id) }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(fajrCheckLaunch, 300) });
// The phone only keeps calling schedules while an account is signed in; lists stay on the device either way.
let fajrSyncedFor = null;
function fajrSync() {
  const uid = typeof cloudState === 'undefined' ? 'local' : (cloudState.uid || ''); fajrSyncedFor = uid;
  try { window.AndroidReader?.fajrSave?.(uid ? JSON.stringify(fajrLoad()) : JSON.stringify({ lists: [] })) } catch (e) {}
}
function fajrWakeRegister() { if (fajrSignedIn() && typeof cloudState !== 'undefined' && cloudState.uid) fajrNative('wakeRegister') }
function fajrPendingInvite() { const code = localStorage.getItem('wakePendingCode'); if (code && fajrSignedIn() && typeof cloudState !== 'undefined' && cloudState.uid) fajrAskAccept(code) }
setTimeout(() => { fajrSync(); fajrCheckLaunch(); fajrWakeRegister(); window.onWakeLink() }, 1500);

/* ---------- sign-in gate: the companion is tied to an account ---------- */
function fajrGate() {
  enterSection('fajr-gate', fajrOrigin === 'more' ? 'n-more' : 'n-home');
  const busy = !!cloudState.loginBusy, apple = !!window.AndroidReader?.cloudSignInApple, google = !!window.AndroidReader?.cloudSignIn;
  app.innerHTML = `<section class="fajr-gate">
    <div class="fajr-gate-emblem"><span class="fajr-orb-ring"></span>${uiIcon('fajr')}</div>
    <span class="fajr-kicker">صحبة الفجر</span>
    <h2>سجّل دخولك لتبدأ الصحبة</h2>
    <p>تُربط قوائمك وسجل مكالماتك بحسابك، فتبقى معك إذا غيّرت جوالك.</p>
    <ul class="fajr-gate-points">
      <li>${uiIcon('contacts')}<span>قوائم من طلبوا منك إيقاظهم</span></li>
      <li>${uiIcon('phone')}<span>اتصال بهم وقت أذان الفجر</span></li>
      <li>${uiIcon('history')}<span>سجل يوضّح من ردّ ومن لم يرد</span></li>
    </ul>
    <div class="fajr-gate-actions">
      ${apple ? `<button class="cloud-apple-button" onclick="fajrGateLogin('apple')" ${busy ? 'disabled' : ''}>${typeof cloudAppleMark === 'function' ? cloudAppleMark() : ''}<span>${busy && cloudLoginProvider === 'apple' ? 'جارٍ تسجيل الدخول…' : 'المتابعة باستخدام Apple'}</span></button>` : ''}
      ${google ? `<button class="cloud-google-button" onclick="fajrGateLogin('google')" ${busy ? 'disabled' : ''}><img src="google-g.svg" alt=""><span>${busy && cloudLoginProvider !== 'apple' ? 'جارٍ تسجيل الدخول…' : 'المتابعة باستخدام Google'}</span></button>` : ''}
      ${!apple && !google ? '<p class="fajr-gate-note">تسجيل الدخول غير متاح على هذا الجهاز.</p>' : ''}
      <p class="cloud-error" data-cloud-error ${cloudState.error ? '' : 'hidden'}>${esc(cloudState.error || '')}</p>
      <button class="fajr-link center" onclick="fajrGateLater()">لاحقًا</button>
    </div>
  </section>`;
  uiLocalize?.(app); revealSection()
}
function fajrGateLogin(provider) { fajrGateWaiting = true; if (provider === 'apple') cloudLoginApple(); else cloudLogin(); if (view === 'fajr-gate') fajrGate() }
function fajrGateLater() { fajrGateWaiting = false; if (fajrOrigin === 'more') moreHome(); else home() }
let fajrGateWaiting = false;
// When the account finishes signing in while the gate is open, continue straight into the companion.
if (typeof cloudUpdateUI === 'function') {
  const fajrCloudUI = cloudUpdateUI;
  cloudUpdateUI = function () {
    fajrCloudUI();
    if (fajrSyncedFor !== null && fajrSyncedFor !== (cloudState.uid || '')) { fajrSync(); fajrPeers = null; fajrWakeRegister(); setTimeout(fajrPendingInvite, 400) }
    if (view !== 'fajr-gate') return;
    if (cloudState.uid) { fajrGateWaiting = false; fajrHome() }
    else if (!activeSheet) { const y = scrollY; fajrGate(); scrollTo(0, y) }
  };
}
// Hardware/system back returns to where the user came from.
if (typeof handleBack === 'function') {
  const fajrPreviousBack = handleBack;
  handleBack = function () {
    if (activeSheet || !String(view).startsWith('fajr')) { fajrPreviousBack(); return }
    if (view === 'fajr' || view === 'fajr-gate') { fajrGateLater(); return }
    if (view === 'fajr-people' || view === 'fajr-edit' || view === 'fajr-history' || view === 'fajr-how' || view === 'fajr-done') { fajrHome(); return }
    if (view === 'fajr-run') { fajrFinish(true); return }
    fajrHome()
  };
}
