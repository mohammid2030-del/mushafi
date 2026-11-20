'use strict';
/* Page turning: three styles (paper curl, slide, instant) and the neighbouring pages prepared ahead,
   so a turn never waits for a page font to load. */
const PT_STYLES = [['curl', 'طيّ الورقة', 'انثناء وظل يتبعان إصبعك'], ['slide', 'انزلاق', 'الأسرع مع حركة ناعمة'], ['none', 'فوري', 'بلا حركة، تتبدّل الصفحة مباشرة']];
function ptCurrent() { return !allowsMotion() ? 'none' : pageTurnStyle() }

// Prepare the pages either side of what is on screen (fonts are the slow part of a turn).
let ptPrefetchTimer = 0;
function ptPrefetch() {
  clearTimeout(ptPrefetchTimer);
  ptPrefetchTimer = setTimeout(() => {
    if (view !== 'reader') return;
    const shown = visiblePageNumbers(), first = shown[0], last = shown.at(-1), step = shown.length;
    const want = [last + 1, first - 1]; if (step > 1) want.push(last + 2, first - 2);
    want.filter(p => p >= 1 && p <= 604).forEach(p => { try { ensurePageFont(p)?.catch?.(() => {}) } catch (e) {} });
  }, 90);
}
const ptShowPage = showPage;
showPage = function (...args) { const r = ptShowPage.apply(this, args); Promise.resolve(r).then(ptPrefetch, () => {}); return r };

// Slide: the old page glides out while the new one glides in.
let ptSliding = false;
const ptTurn = turnPage;
turnPage = async function (delta) {
  if (ptCurrent() !== 'slide' || ptSliding || view !== 'reader' || activeSheet || ![1, -1].includes(delta)) return ptTurn(delta);
  const root = app.querySelector('.mushaf-reader'), target = bookTurnDestination(delta);
  if (!root || !target) return ptTurn(delta);
  ptSliding = true;
  let layer = null;
  try {
    await Promise.all(target.after.map(ensurePageFont));
    if (view !== 'reader' || !root.isConnected) return;
    const r = root.getBoundingClientRect(), g = delta * (root.classList.contains('ltr-book') ? -1 : 1);
    layer = document.createElement('div'); layer.className = 'pt-slide-layer' + (document.body.classList.contains('dark') ? ' dark-paper' : '');
    layer.setAttribute('aria-hidden', 'true'); layer.setAttribute('data-no-translate', ''); layer.inert = true;
    layer.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
    const ghost = bookTurnClone(root); ghost.style.width = r.width + 'px'; ghost.style.height = r.height + 'px';
    // an opaque sheet of paper, so the outgoing page never shows through the incoming one
    const paper = getComputedStyle(document.body).backgroundColor; ghost.style.background = paper && paper !== 'rgba(0, 0, 0, 0)' ? paper : (document.body.classList.contains('dark') ? '#101013' : '#fbf7ed');
    layer.append(ghost); document.body.append(layer);
    await ptTurn(delta);
    const fresh = app.querySelector('.mushaf-reader');
    if (!fresh || fresh === root || ![...fresh.querySelectorAll(':scope>.page-leaf')].map(l => l.dataset.page).join(',').includes(String(target.after[0]))) return;
    const ease = 'cubic-bezier(.22,.8,.24,1)', ms = window.ptSlideMs || 260;
    const a = ghost.animate([{ transform: 'translate3d(0,0,0)' }, { transform: `translate3d(${g * 100}%,0,0)` }], { duration: ms, easing: ease, fill: 'forwards' });
    fresh.animate([{ transform: `translate3d(${-g * 30}%,0,0)` }, { transform: 'translate3d(0,0,0)' }], { duration: ms, easing: ease });
    await a.finished.catch(() => {});
  } finally { layer?.remove(); ptSliding = false }
};

// Reading comfort sheet: choose the style.
const ptReadingSettings = showReadingSettings;
showReadingSettings = function (...args) {
  const result = ptReadingSettings.apply(this, args);
  const sheet = document.querySelector('.feature-sheet'), row = sheet?.querySelector('#pref-motion')?.closest('.preference-row');
  if (!row) return result;
  const reduced = systemReducedMotion.matches;
  const box = document.createElement('div'); box.className = 'pt-choice';
  const paint = () => {
    const cur = ptCurrent();
    box.innerHTML = `<span class="pt-choice-head"><strong>تقليب الصفحات</strong><small>${reduced ? 'تقليل الحركة مفعّل من إعدادات جهازك؛ التقليب فوري' : (PT_STYLES.find(s => s[0] === cur) || PT_STYLES[0])[2]}</small></span>
      <div class="pt-options" role="radiogroup" aria-label="تقليب الصفحات">${PT_STYLES.map(([id, label]) => `<button type="button" role="radio" aria-checked="${cur === id}" class="${cur === id ? 'on' : ''}" data-pt="${id}" ${reduced && id !== 'none' ? 'disabled' : ''}>${ptIcon(id)}<span>${label}</span></button>`).join('')}</div>`;
    try { uiLocalize(box) } catch (e) {}
    box.querySelectorAll('[data-pt]').forEach(b => b.onclick = () => {
      const id = b.dataset.pt;
      if (id === 'none') { localStorage.pageTurnStyle = 'none' }
      else { localStorage.pageTurnStyle = id; if (!readingPrefs.motion) { readingPrefs.motion = true; localStorage.readingMotion = '1'; applyReadingPrefs() } }
      try { if (readingPrefs.haptics) tactile() } catch (e) {}
      paint();
    });
  };
  paint(); row.replaceWith(box);
  return result;
};
function ptIcon(id) {
  const p = { curl: '<path d="M5 4h9l5 5v11H5z"/><path d="M14 4v5h5"/><path d="M5 20c4-1 7-4 9-8"/>', slide: '<rect x="3" y="5" width="9" height="14" rx="2"/><path d="M15 9l3 3-3 3"/><path d="M18 12h-4"/>', none: '<rect x="6" y="4" width="12" height="16" rx="2"/><path d="M13 8l-3 4h4l-3 4"/>' }[id];
  return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}
