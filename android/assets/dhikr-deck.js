'use strict';
/* Adhkar as a deck of glass cards: every dhikr of a section is one card, stacked one behind the other to the end.
   Swipe (or the arrows) to move between cards, tap the card to count, save and share from the card itself. */
const dkMemory = Object.create(null);
let dk = { group: null, items: [], index: 0, busy: false };
const dkSkip = ['all', 'variants', 'me', 'tasbih'];
function dkEligible(group) { return !!group && !dkSkip.includes(group) && devotionItemsForGroup(group).length > 0 }
function dkKind(d) { return d.kind === 'quran' ? 'من القرآن الكريم' : d.kind === 'athar' ? 'من الآثار' : 'من السنة' }
function dkTarget(d) { return d.count || 1 }
function dkCount(d) { return devotionCount(d, dk.group) }
function dkDone(d) { return dkCount(d) >= dkTarget(d) }
function dkTimes(n) { return ar(n) + ' ' + (n === 1 || n > 10 ? 'مرة' : 'مرات') }
function dkSize(d) { const n = String(d.text || '').length, q = d.kind === 'quran' ? 2 : 0; return (n <= 90 ? 30 : n <= 220 ? 27 : n <= 420 ? 24 : 22) - q }
function dkLtr() { return document.documentElement.dir === 'ltr' }
function dkLocalize(root) { try { uiLocalize(root) } catch (e) {} }

function dhikrDeck(group) {
  enterSection('dua-category', 'n-dua');
  const items = devotionItemsForGroup(group);
  let index = dk.group === group && dkMemory[group] != null ? dkMemory[group] : -1;
  dk = { group, items, index: 0, busy: false };
  if (index < 0 || index > items.length) { index = items.findIndex(d => !dkDone(d)); if (index < 0) index = 0 }
  dk.index = index;
  app.innerHTML = sectionHeading(group === 'favorites' ? 'مفضلة الأدعية' : devotionGroupName(group), ar(items.length) + ' ' + (items.length <= 10 ? 'نصوص' : 'نصًا') + ' · متاح دون إنترنت', 'duaHome()') + `
  <section class="dk" id="dk">
    <div class="dk-top">
      <button class="dk-tool" id="dk-prev" aria-label="الذكر السابق">${uiIcon('back')}</button>
      <div class="dk-progress"><span class="dk-pos" id="dk-pos"></span><div class="dk-bar" aria-hidden="true"><i id="dk-bar"></i></div></div>
      <button class="dk-tool" id="dk-next" aria-label="الذكر التالي">${uiIcon('arrow')}</button>
    </div>
    <div class="dk-stack" id="dk-stack"></div>
    ${group === 'prayer' ? '<button class="dk-reset" id="dk-prayer-reset">إعادة العدّ لصلاة جديدة</button>' : ''}
  </section>`;
  document.getElementById('dk-prev').onclick = () => dkGo(-1);
  document.getElementById('dk-next').onclick = () => dkGo(1);
  const reset = document.getElementById('dk-prayer-reset'); if (reset) reset.onclick = () => { resetPrayerSession(); dkMemory.prayer = 0; dkRender() };
  dkRender();
  dkLocalize(app);
  revealSection();
}

function dkCardMarkup(d, i, depth) {
  const n = dk.items.length, saved = duaFavorites().includes(d.id), c = dkCount(d), t = dkTarget(d), done = c >= t;
  const disputed = d.routineEvidence?.disputed;
  return `<article class="dk-card${done ? ' is-done' : ''}" data-depth="${depth}" style="--depth:${depth}" ${depth ? 'aria-hidden="true"' : ''}>
    <div class="dk-head">
      <span class="dk-num">${ar(i + 1)} / ${ar(n)}</span>
      <span class="dk-kind">${dkKind(d)}</span>
    </div>
    <h2 class="dk-title">${esc(d.title)}</h2>
    <div class="dk-body"><div class="devotion-text dk-text${d.kind === 'quran' ? ' dhikr-quran' : ''}" data-dk-text="${d.id}" lang="ar" dir="rtl" translate="no" style="font-size:${dkSize(d)}px"></div></div>
    <button class="dk-count" data-dk-count aria-label="تأكيد إتمام قراءة الذكر">
      <span class="dk-count-text">${done ? 'تمت القراءة ✓' : t > 1 ? `<b>${ar(c)}</b> من ${dkTimes(t)}` : 'المس بعد إتمام القراءة'}</span>
      <span class="dk-count-bar" aria-hidden="true"><i style="width:${Math.min(100, c / t * 100)}%"></i></span>
    </button>
    <div class="dk-foot">
      <button class="dk-ref${disputed ? ' is-disputed' : ''}" data-dk-source>${uiIcon(disputed ? 'info' : 'book')}<span translate="no" dir="rtl">${esc(d.reference)}</span></button>
      <div class="dk-actions">
        <button class="dk-icon" data-dk-share aria-label="مشاركة الذكر">${uiIcon('share')}</button>
        <button class="dk-icon${saved ? ' is-saved' : ''}" data-dk-fav aria-label="${saved ? 'إزالة من المفضلة' : 'حفظ في المفضلة'}">${uiIcon('heart')}</button>
      </div>
    </div>
    ${disputed ? '<span class="dk-grade">في تصحيحه خلاف · انظر المصدر</span>' : ''}
  </article>`;
}
function dkEndMarkup(depth) {
  const done = dk.items.filter(dkDone).length;
  return `<article class="dk-card dk-end" data-depth="${depth}" style="--depth:${depth}" ${depth ? 'aria-hidden="true"' : ''}>
    <div class="dk-end-mark" aria-hidden="true">✓</div>
    <h2>أتممت هذا القسم</h2>
    <p>${ar(done)} / ${ar(dk.items.length)}</p>
    <p class="dk-end-note">تقبّل الله منك</p>
    <div class="dk-end-actions"><button class="primary" data-dk-restart>ابدأ القسم من جديد</button><button data-dk-back>العودة إلى قسم الأذكار</button></div>
  </article>`;
}
function dkFill(card, d) {
  const target = card.querySelector('[data-dk-text]'); if (!target) return;
  try { target.id = 'devotion-text'; renderDhikrReadingText(d) } catch (e) { target.textContent = d.text } finally { target.removeAttribute('id') }
}
function dkRender(enter = 0) {
  const stack = document.getElementById('dk-stack'); if (!stack) return;
  const n = dk.items.length; dk.index = Math.max(0, Math.min(n, dk.index)); dkMemory[dk.group] = dk.index;
  const parts = [];
  for (let k = 2; k >= 0; k--) { const i = dk.index + k; if (i < n) parts.push(dkCardMarkup(dk.items[i], i, k)); else if (i === n) parts.push(dkEndMarkup(k)) }
  stack.innerHTML = parts.join('');
  stack.querySelectorAll('.dk-card').forEach(card => { const i = dk.index + +card.dataset.depth; if (i < n) dkFill(card, dk.items[i]) });
  const front = stack.querySelector('.dk-card[data-depth="0"]');
  if (front && enter) { front.classList.add(enter > 0 ? 'dk-enter-next' : dkLtr() ? 'dk-enter-prev-ltr' : 'dk-enter-prev'); setTimeout(() => front.classList.remove('dk-enter-next', 'dk-enter-prev', 'dk-enter-prev-ltr'), 420) }
  const done = dk.items.filter(dkDone).length;
  document.getElementById('dk-pos').textContent = dk.index < n ? ar(dk.index + 1) + ' / ' + ar(n) : ar(n) + ' / ' + ar(n);
  document.getElementById('dk-bar').style.width = (n ? done / n * 100 : 0) + '%';
  document.getElementById('dk-prev').disabled = dk.index === 0;
  document.getElementById('dk-next').disabled = dk.index >= n;
  if (front) dkBind(front);
  dkLocalize(stack);
  dkLayout();
}
// the deck takes exactly the room between the top bar and the navigation bar, and each text shrinks until it shows in full
function dkLayout() {
  const stack = document.getElementById('dk-stack'); if (!stack) return;
  const nav = document.querySelector('body>nav') || document.querySelector('nav'), r = nav ? nav.getBoundingClientRect() : null, navTop = r && r.height > 0 && getComputedStyle(nav).display !== 'none' ? r.top : innerHeight;
  const top = stack.getBoundingClientRect().top + scrollY - scrollY;
  const room = Math.max(330, Math.min(navTop, innerHeight) - top - 10);
  stack.style.height = room + 'px';
  stack.querySelectorAll('.dk-card').forEach(card => {
    const body = card.querySelector('.dk-body'), text = card.querySelector('.dk-text'); if (!body || !text) return;
    let size = parseFloat(text.style.fontSize) || 24; const min = 16;
    while (size > min && text.scrollHeight > body.clientHeight) { size -= 1; text.style.fontSize = size + 'px' }
    body.classList.toggle('is-scroll', text.scrollHeight > body.clientHeight + 2);
  });
}
addEventListener('resize', () => { if (view === 'dua-category' && document.getElementById('dk-stack')) dkLayout() });
function dkGo(step) {
  const n = dk.items.length, next = dk.index + step;
  if (dk.busy || next < 0 || next > n) return;
  const front = document.querySelector('#dk-stack .dk-card[data-depth="0"]');
  dk.busy = true;
  if (front) front.classList.add((step > 0) !== dkLtr() ? 'dk-leave-next' : 'dk-leave-prev');
  setTimeout(() => { dk.busy = false; dk.index = next; dkRender(step) }, front ? 260 : 0);
}
function dkCountTap(card) {
  const d = dk.items[dk.index]; if (!d || dkDone(d)) { if (d) dkGo(1); return }
  const key = devotionProgressKey(d, dk.group), all = readJSON('devotionProgress', {}), t = dkTarget(d);
  all[key] = Math.min(t, Math.max(0, +all[key] || 0) + 1); saveJSON('devotionProgress', all);
  try { tactile() } catch (e) {}
  const c = all[key];
  card.querySelector('.dk-count-bar i').style.width = Math.min(100, c / t * 100) + '%';
  card.querySelector('.dk-count-text').innerHTML = c >= t ? 'تمت القراءة ✓' : `<b>${ar(c)}</b> من ${dkTimes(t)}`; dkLocalize(card.querySelector('.dk-count-text'));
  const btn = card.querySelector('.dk-count'); btn.classList.remove('dk-pulse'); void btn.offsetWidth; btn.classList.add('dk-pulse');
  if (c >= t) {
    card.classList.add('is-done');
    const n = dk.items.length, done = dk.items.filter(dkDone).length; document.getElementById('dk-bar').style.width = done / n * 100 + '%';
    setTimeout(() => { if (view === 'dua-category' && dk.items[dk.index] === d) dkGo(1) }, 650);
  }
}
function dkBind(card) {
  if (card.classList.contains('dk-end')) {
    card.querySelector('[data-dk-restart]').onclick = () => { dk.index = 0; dkRender(-1) };
    card.querySelector('[data-dk-back]').onclick = () => duaHome();
  } else {
    const d = dk.items[dk.index];
    card.querySelector('[data-dk-source]').onclick = e => { e.stopPropagation(); showDevotionSource(d.id) };
    card.querySelector('[data-dk-share]').onclick = e => { e.stopPropagation(); shareDevotion(d.id) };
    card.querySelector('[data-dk-fav]').onclick = e => {
      e.stopPropagation(); toggleDuaFavorite(d.id); const b = e.currentTarget, saved = duaFavorites().includes(d.id);
      b.classList.toggle('is-saved', saved); b.setAttribute('aria-label', saved ? 'إزالة من المفضلة' : 'حفظ في المفضلة');
    };
    card.querySelector('[data-dk-count]').onclick = e => { e.stopPropagation(); dkCountTap(card) };
  }
  // drag sideways to move through the deck; a vertical drag scrolls the card's text
  let sx = 0, sy = 0, dx = 0, axis = null, moved = false, id = null;
  card.addEventListener('pointerdown', e => { if (e.button > 0 || e.target.closest('button')) return; sx = e.clientX; sy = e.clientY; dx = 0; axis = null; moved = false; id = e.pointerId });
  card.addEventListener('pointermove', e => {
    if (id !== e.pointerId) return;
    const x = e.clientX - sx, y = e.clientY - sy;
    if (!axis && Math.hypot(x, y) > 9) { axis = Math.abs(x) > Math.abs(y) * 1.2 ? 'x' : 'y'; if (axis === 'x') { try { card.setPointerCapture(id) } catch (err) {} card.classList.add('dk-dragging') } }
    if (axis !== 'x') return;
    moved = true; dx = x;
    const fwd = dkLtr() ? -dx : dx, atEdge = (fwd > 0 && dk.index >= dk.items.length) || (fwd < 0 && dk.index === 0);
    const shown = atEdge ? dx * 0.25 : dx;
    card.style.transform = `translateX(${shown}px) rotate(${shown / 28}deg)`;
    card.parentElement.style.setProperty('--pull', Math.min(1, Math.abs(shown) / 160).toFixed(3));
  });
  const end = e => {
    if (id !== e.pointerId) return; id = null;
    card.classList.remove('dk-dragging'); card.parentElement?.style.removeProperty('--pull');
    if (axis === 'x' && Math.abs(dx) > 80) {
      // drag toward the reading direction's end for the next card (right in Arabic, like turning a mushaf page)
      const step = (dkLtr() ? -dx : dx) > 0 ? 1 : -1;
      if ((step > 0 && dk.index < dk.items.length) || (step < 0 && dk.index > 0)) { card.style.transform = ''; dkGo(step); return }
    }
    card.style.transform = '';
  };
  card.addEventListener('pointerup', end); card.addEventListener('pointercancel', end);
  card.addEventListener('click', e => { if (moved) { moved = false; return } if (e.target.closest('button,a,.dhikr-ayah-marker')) return; if (!card.classList.contains('dk-end')) dkCountTap(card) });
}
const dkPrevDuaHome = duaHome;
duaHome = function (group) { return dkEligible(group) ? dhikrDeck(group) : dkPrevDuaHome.apply(this, arguments) };
