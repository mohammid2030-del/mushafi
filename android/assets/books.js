'use strict';
/* الكتب — Islamic books from IslamHouse.com (دار الإسلام), in the app's language.
   A shelf of covers by category; a book opens in the native PDF reader, which keeps it on the
   device for reading without internet (AndroidReader.openBook / booksSaved / deleteBook). */
const BOOKS_BASE = 'https://api3.islamhouse.com/v3/paV29H2gm56kvLPy';
const BOOKS_PAGE = 24;
const BOOKS_HOSTS = /^https:\/\/([a-z0-9-]+\.)*islamhouse\.com\//i;
// Top categories that hold books (IslamHouse category tree ids).
// Covers made from each PDF's first page (tools/book_covers.py), served by the wake worker.
const BOOKS_COVERS = 'https://go.mushafi.workers.dev';
let booksCoverIds = { lang: '', ids: new Set() };
const BOOKS_CATS = [86219, 132381, 192525, 199946, 276187, 794, 5301, 764, 276190, 398193];
let booksState = null, booksOrigin = 'home', booksCurrent = null;
const booksDetails = new Map(), booksPending = new Map();

function booksLang() { const l = typeof uiLocale === 'function' ? uiLocale() : 'ar'; return ['ar', 'en', 'ur', 'bn', 'tr'].includes(l) ? l : 'en' }
function booksT(t) { return typeof uiTranslate === 'function' ? uiTranslate(t) : t }
function booksNum(n) { return typeof ar === 'function' ? ar(n) : String(n) }
function booksNative(name, ...args) { try { const f = window.AndroidReader?.[name]; return typeof f === 'function' ? f.apply(window.AndroidReader, args) : undefined } catch (e) { return undefined } }
function booksSavedRaw() { try { const l = JSON.parse(booksNative('booksSaved') || '[]'); return Array.isArray(l) ? l : [] } catch (e) { return [] } }
function booksSavedBooks() { const seen = new Set(); return booksSavedRaw().filter(x => { const k = String(x.bookId || x.id); if (seen.has(k)) return false; seen.add(k); return true }).map(x => booksClean(x.raw || x)).filter(Boolean) }
function booksIsSaved(id) { return booksSavedRaw().some(b => String(b.bookId || b.id) === String(id)) }

async function booksGet(path, timeout = 20000) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null, timer = ctrl && setTimeout(() => ctrl.abort(), timeout);
  try { const r = await fetch(BOOKS_BASE + path, ctrl ? { signal: ctrl.signal } : {}); if (!r.ok) throw new Error('http ' + r.status); return await r.json() }
  finally { clearTimeout(timer) }
}
function booksClean(raw) {
  if (!raw || !Number.isFinite(+raw.id)) return null;
  const files = (raw.attachments || raw.files || []).filter(a => (String(a.extension_type || 'pdf').toLowerCase() === 'pdf') && BOOKS_HOSTS.test(a.url || ''))
    .map((a, i) => ({ url: a.url, size: String(a.size || ''), label: String(a.description || a.label || '').trim() || String(i + 1) }));
  const people = raw.prepared_by || [];
  const author = raw.author || people.find(p => p.kind === 'author' && p.title)?.title || people.find(p => p.title)?.title || '';
  return {
    id: +raw.id, title: String(raw.title || '').trim().slice(0, 200), author: String(author).trim().slice(0, 120),
    desc: String(raw.description || raw.desc || '').trim().slice(0, 1500), image: BOOKS_HOSTS.test(raw.image || '') ? raw.image : '', files
  }
}
/* ---------- book details (category lists only carry id + title) ---------- */
function booksDetailKey(lang) { return 'booksDetails_' + lang }
function booksDetailCache(lang) { try { return JSON.parse(localStorage.getItem(booksDetailKey(lang)) || '{}') || {} } catch (e) { return {} } }
function booksRemember(lang, b) {
  booksDetails.set(lang + ':' + b.id, b);
  try { const c = booksDetailCache(lang), keys = Object.keys(c); c[b.id] = b; if (keys.length > 600) for (const k of keys.slice(0, 200)) delete c[k]; localStorage.setItem(booksDetailKey(lang), JSON.stringify(c)) } catch (e) {}
}
function booksKnown(lang, id) { return booksDetails.get(lang + ':' + id) || booksDetailCache(lang)[id] || null }
function booksDetail(lang, id) {
  const key = lang + ':' + id, known = booksKnown(lang, id);
  if (known) return Promise.resolve(booksClean(known));
  if (booksPending.has(key)) return booksPending.get(key);
  const p = booksQueue(() => booksGet(`/main/get-item/${id}/${lang}/json`)).then(raw => { const b = booksClean(raw); if (b) booksRemember(lang, b); return b }).catch(() => null).finally(() => booksPending.delete(key));
  booksPending.set(key, p); return p
}
let booksRunning = 0; const booksWaiting = [];
function booksQueue(job) {
  return new Promise((resolve, reject) => {
    const run = () => { booksRunning++; job().then(resolve, reject).finally(() => { booksRunning--; const next = booksWaiting.shift(); if (next) next() }) };
    booksRunning < 5 ? run() : booksWaiting.push(run)
  })
}

/* ---------- covers ---------- */
function booksCoverUrl(b) {
  if (b.image) return b.image;
  const lang = booksState?.lang || booksLang();
  return booksCoverIds.lang === lang && booksCoverIds.ids.has(+b.id) ? `${BOOKS_COVERS}/cover/${lang}/${b.id}.webp` : ''
}
async function booksLoadCovers(lang) {
  const key = 'booksCovers_' + lang;
  try { const c = JSON.parse(localStorage.getItem(key) || 'null'); if (c && Array.isArray(c.ids)) { booksCoverIds = { lang, ids: new Set(c.ids) }; if (Date.now() - c.at < 6 * 3600000) return } } catch (e) {}
  try {
    const r = await fetch(`${BOOKS_COVERS}/covers/${lang}.json`); if (!r.ok) return;
    const ids = await r.json(); if (!Array.isArray(ids)) return;
    booksCoverIds = { lang, ids: new Set(ids.map(Number)) };
    try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), ids })) } catch (e) {}
    if (view === 'books') booksPaint(); else if (view === 'book') bookPaint()
  } catch (e) {}
}

/* ---------- lists ---------- */
function booksFresh(lang) {
  booksState = { lang, cat: 'all', cats: [], lists: {}, query: '' };
  try { const c = JSON.parse(localStorage.getItem('booksCats_' + lang) || 'null'); if (Array.isArray(c)) booksState.cats = c } catch (e) {}
  booksLoadCats(); booksLoadCovers(lang)
}
async function booksLoadCats() {
  const s = booksState;
  try {
    const tree = await booksGet(`/main/get-categories-tree/${s.lang}/json`);
    const top = (tree.sub_categories || []).filter(c => BOOKS_CATS.includes(+c.id) && c.title).map(c => ({ id: +c.id, title: String(c.title).trim() }));
    top.sort((a, b) => BOOKS_CATS.indexOf(a.id) - BOOKS_CATS.indexOf(b.id));
    if (booksState !== s || !top.length) return;
    s.cats = top; try { localStorage.setItem('booksCats_' + s.lang, JSON.stringify(top)) } catch (e) {}
    booksPaintChips()
  } catch (e) {}
}
function booksList(key) { const s = booksState; return s.lists[key] || (s.lists[key] = { items: [], ids: null, page: 0, pages: Infinity, loading: false, error: '', total: 0, shown: BOOKS_PAGE }) }
function booksNeedsLoad(cat) { const L = booksList(cat); return cat !== 'saved' && !L.loading && !L.error && (cat === 'all' ? L.page === 0 : !L.ids) }
async function booksLoadMore() {
  const s = booksState, key = s.cat, L = booksList(key);
  if (key === 'saved' || L.loading) return;
  if (key !== 'all' && L.ids) { L.shown += BOOKS_PAGE; booksPaint(); return }
  if (key === 'all' && L.page >= L.pages) return;
  L.loading = true; L.error = ''; booksPaint();
  try {
    if (key === 'all') {
      const page = L.page + 1, data = await booksGet(`/main/books/${s.lang}/${s.lang}/${page}/${BOOKS_PAGE}/json`);
      const fresh = (data.data || []).map(booksClean).filter(b => b && b.files.length);
      fresh.forEach(b => booksRemember(s.lang, b));
      const seen = new Set(L.items.map(b => b.id)); L.items.push(...fresh.filter(b => !seen.has(b.id)));
      L.page = page; L.pages = +data.links?.pages_number || page; L.total = +data.links?.total_items || L.total;
      if (page === 1) try { localStorage.setItem('booksAll_' + s.lang, JSON.stringify(L.items.slice(0, BOOKS_PAGE))) } catch (e) {}
    } else {
      const list = await booksGet(`/categories/viewitems/${key}/books/${s.lang}/showall/json`, 30000);
      L.ids = (Array.isArray(list) ? list : []).filter(x => x && Number.isFinite(+x.id) && (!x.datatype || x.datatype === 'books')).map(x => ({ id: +x.id, title: String(x.title || '').trim() }));
      L.total = L.ids.length;
    }
  } catch (e) {
    L.error = navigator.onLine === false ? 'لا يوجد اتصال بالإنترنت؛ تظهر كتبك المحفوظة' : 'تعذر تحميل الكتب الآن؛ حاول مرة أخرى';
    if (key === 'all' && !L.items.length) try { L.items = (JSON.parse(localStorage.getItem('booksAll_' + s.lang) || '[]') || []).map(booksClean).filter(Boolean) } catch (x) {}
  } finally { L.loading = false; if (booksState === s) booksPaint() }
}
function booksRetry() { const L = booksList(booksState.cat); L.error = ''; booksLoadMore() }

/* ---------- screen ---------- */
function booksHome(origin) {
  if (origin) booksOrigin = origin;
  enterSection('books', booksOrigin === 'more' ? 'n-more' : 'n-home');
  const lang = booksLang();
  if (!booksState || booksState.lang !== lang) booksFresh(lang);
  if (booksState.cat === 'saved' && !booksSavedBooks().length) booksState.cat = 'all';
  app.innerHTML = sectionHeading('الكتب', 'مكتبة إسلامية موثوقة بلغتك، تقرؤها وتحفظها لما بعد', booksOrigin === 'more' ? 'moreHome()' : 'home()') +
    `<label class="books-search">${uiIcon('search')}<input type="search" id="books-q" placeholder="ابحث باسم الكتاب أو مؤلفه" autocomplete="off" enterkeyhint="search"></label>
    <div class="books-chips" id="books-chips" role="tablist"></div>
    <div id="books-grid" class="books-grid" aria-live="polite"></div>
    <div id="books-more" class="books-more"></div>
    <p class="books-credit"><span>المصدر</span> <span translate="no">IslamHouse.com</span></p>`;
  const q = document.getElementById('books-q'); q.value = booksState.query || '';
  q.oninput = () => { booksState.query = q.value; booksPaint() };
  uiLocalize?.(app);
  booksPaintChips(); booksPaint();
  if (booksNeedsLoad(booksState.cat)) booksLoadMore();
  revealSection()
}
function booksPickCat(cat) {
  booksState.cat = /^\d+$/.test(cat) ? +cat : cat; booksPaintChips(); booksPaint();
  if (booksNeedsLoad(booksState.cat)) booksLoadMore()
}
function booksPaintChips() {
  const box = document.getElementById('books-chips'); if (!box || !booksState) return;
  const s = booksState, saved = booksSavedBooks().length;
  const chips = [{ id: 'all', title: booksT('الكل') }, ...(saved ? [{ id: 'saved', title: booksT('المحفوظة'), count: saved, icon: 'download' }] : []), ...s.cats];
  box.innerHTML = chips.map(c => { const on = String(s.cat) === String(c.id); return `<button type="button" role="tab" class="books-chip${on ? ' on' : ''}" aria-selected="${on}" onclick="booksPickCat('${c.id}')"${typeof c.id === 'number' ? ' translate="no"' : ''}>${c.icon ? uiIcon(c.icon) : ''}<span>${esc(c.title)}</span>${c.count ? `<b class="books-count">${booksNum(c.count)}</b>` : ''}</button>` }).join('');
  const on = box.querySelector('.on'); if (on && box.scrollWidth > box.clientWidth) on.scrollIntoView?.({ inline: 'center', block: 'nearest' })
}
function booksNorm(s) { return String(s || '').normalize('NFKD').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase() }
function booksCover(b, big) {
  const plain = `<span class="bk-plain"><i></i><b dir="auto">${esc(b.title)}</b>${b.author ? `<small dir="auto">${esc(b.author)}</small>` : ''}<i></i></span>`;
  const src = booksCoverUrl(b);
  return `<span class="bk-cover${big ? ' big' : ''}${src ? ' has-img' : ''}" translate="no">${plain}${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" onload="this.parentNode.classList.add('loaded')" onerror="this.parentNode.classList.remove('has-img');this.remove()">` : ''}</span>`
}
function booksCard(b, saved) {
  return `<button type="button" class="bk-card${b.pending ? ' pending' : ''}" data-id="${b.id}" onclick="bookOpen(${b.id})">${booksCover(b)}<strong dir="auto" translate="no">${esc(b.title)}</strong><small dir="auto" translate="no">${esc(b.author || '')}</small>${saved ? `<em class="bk-badge">${uiIcon('download')}</em>` : ''}</button>`
}
function booksPaint() {
  const s = booksState, grid = document.getElementById('books-grid'), more = document.getElementById('books-more');
  if (!s || !grid || view !== 'books') return;
  const savedList = booksSavedBooks(), savedIds = new Set(savedList.map(b => b.id)), L = booksList(s.cat), q = booksNorm(s.query).trim();
  let books;
  if (s.cat === 'saved') books = savedList;
  else if (s.cat === 'all') books = L.items;
  else books = (L.ids || []).map(x => { const k = booksKnown(s.lang, x.id); return k ? booksClean(k) : { id: x.id, title: x.title, author: '', image: '', files: [], pending: true } });
  if (q) books = books.filter(b => booksNorm(b.title).includes(q) || booksNorm(b.author).includes(q));
  const total = books.length;
  if (s.cat !== 'all' && s.cat !== 'saved') books = books.slice(0, L.shown);
  if (L.loading && !books.length && s.cat !== 'saved') grid.innerHTML = Array.from({ length: 9 }, () => '<div class="bk-card skeleton"><span class="bk-cover"></span><i></i><i></i></div>').join('');
  else if (!books.length) {
    const title = s.cat === 'saved' ? 'لا توجد كتب محفوظة بعد' : q ? 'لا نتائج' : L.error ? '' : 'لا توجد كتب في هذا القسم بلغتك';
    const hint = s.cat === 'saved' ? 'أي كتاب تفتحه يُحفظ في جهازك لتقرأه دون إنترنت' : q ? (s.cat === 'all' && L.page < L.pages ? 'البحث في الكتب المعروضة؛ اختر قسمًا أو اعرض المزيد' : 'جرّب كلمة أخرى') : '';
    grid.innerHTML = title ? `<div class="books-empty">${uiIcon(s.cat === 'saved' ? 'download' : q ? 'search' : 'book')}<strong>${title}</strong>${hint ? `<p>${hint}</p>` : ''}</div>` : '';
  }
  else grid.innerHTML = books.map(b => booksCard(b, savedIds.has(b.id))).join('');
  uiLocalize?.(grid);
  // category lists carry only titles: fill in covers and authors as they arrive
  if (s.cat !== 'all' && s.cat !== 'saved') books.filter(b => b.pending).forEach(b => booksDetail(s.lang, b.id).then(d => {
    if (!d || booksState !== s || view !== 'books') return;
    const card = grid.querySelector(`.bk-card[data-id="${b.id}"]`); if (card) card.outerHTML = booksCard(d, savedIds.has(d.id))
  }));
  if (more) {
    let html = '', auto = false;
    if (L.error && s.cat !== 'saved') html = `<p class="books-error">${esc(L.error)}</p><button type="button" class="books-load" onclick="booksRetry()">إعادة المحاولة</button>`;
    else if (L.loading && books.length) html = '<div class="books-spinner" aria-label="جارٍ التحميل"></div>';
    else if (s.cat === 'all' && L.page > 0 && L.page < L.pages && !q) { html = '<button type="button" class="books-load" onclick="booksLoadMore()">عرض المزيد</button>'; auto = true }
    else if (s.cat !== 'all' && s.cat !== 'saved' && L.ids && total > L.shown) { html = `<button type="button" class="books-load" onclick="booksLoadMore()">عرض المزيد <small>${booksNum(L.shown)} / ${booksNum(total)}</small></button>`; auto = true }
    more.innerHTML = html; uiLocalize?.(more);
    const btn = auto && more.querySelector('.books-load');
    if (btn && 'IntersectionObserver' in window) { const io = new IntersectionObserver(e => { if (e[0].isIntersecting) { io.disconnect(); booksLoadMore() } }, { rootMargin: '500px' }); io.observe(btn) }
  }
}

/* ---------- one book ---------- */
async function bookOpen(id) {
  id = +id; const lang = booksState?.lang || booksLang();
  let b = booksKnown(lang, id); b = b ? booksClean(b) : (booksSavedBooks().find(x => x.id === id) || null);
  if (!b || !b.files.length) { showSmallNotice?.('جارٍ فتح الكتاب…'); b = await booksDetail(lang, id); if (!b) { showSmallNotice?.('تعذر فتح الكتاب؛ تحقق من الاتصال'); return } }
  if (!b.files.length) { showSmallNotice?.('هذا الكتاب غير متاح بصيغة PDF'); return }
  booksCurrent = b;
  enterSection('book', booksOrigin === 'more' ? 'n-more' : 'n-home');
  bookPaint(); revealSection()
}
function bookPaint() {
  const b = booksCurrent; if (!b || view !== 'book') return;
  const saved = booksIsSaved(b.id), one = b.files.length === 1;
  app.innerHTML = sectionHeading('الكتب', '', 'booksHome()') +
    `<article class="book-detail">${booksCover(b, true)}
      <h1 dir="auto" translate="no">${esc(b.title)}</h1>${b.author ? `<p class="book-author" dir="auto" translate="no">${esc(b.author)}</p>` : ''}
      <div class="book-actions">${one ? `<button type="button" class="book-read" onclick="bookRead(0)">${uiIcon('book')}<span>${saved ? 'متابعة القراءة' : 'اقرأ الكتاب'}</span></button>` : ''}
        ${saved ? `<span class="book-saved">${uiIcon('check')}<span>محفوظ في جهازك للقراءة دون إنترنت</span></span><button type="button" class="book-delete" onclick="bookDelete()">${uiIcon('trash')}<span>حذف من الجهاز</span></button>` : `<p class="book-note">${one ? '<bdi dir="ltr">' + esc(b.files[0].size) + '</bdi> · ' : ''}<span>يُحفظ في جهازك عند فتحه، لتقرأه دون إنترنت</span></p>`}</div>
      ${one ? '' : `<h2>أجزاء الكتاب</h2><div class="book-files">${b.files.map((f, i) => `<button type="button" class="book-file" onclick="bookRead(${i})">${uiIcon('book')}<span dir="auto" translate="no">${esc(f.label)}</span><small dir="ltr" translate="no">${esc(f.size)}</small></button>`).join('')}</div>`}
      ${b.desc ? `<h2>عن الكتاب</h2><p class="book-desc" dir="auto" translate="no">${esc(b.desc)}</p>` : ''}
      <p class="books-credit"><span>المصدر</span> <span translate="no">IslamHouse.com</span></p></article>`;
  uiLocalize?.(app)
}
function bookRead(index) {
  const b = booksCurrent, f = b?.files[index]; if (!f) return;
  const payload = JSON.stringify({ id: String(b.files.length > 1 ? b.id * 100 + index : b.id), bookId: String(b.id), url: f.url, title: b.files.length > 1 ? b.title + ' — ' + f.label : b.title, author: b.author, size: f.size, raw: { id: b.id, title: b.title, description: b.desc, image: b.image, prepared_by: b.author ? [{ kind: 'author', title: b.author }] : [], attachments: b.files.map(x => ({ extension_type: 'PDF', url: x.url, size: x.size, description: x.label })) } });
  if (window.AndroidReader?.openBook) booksNative('openBook', payload);
  else window.open(f.url, '_blank', 'noopener')
}
function bookDelete() {
  const b = booksCurrent; if (!b) return;
  if (!confirm(booksT('حذف هذا الكتاب من جهازك؟'))) return;
  booksNative('deleteBook', String(b.id));   // removes every part of this book
  setTimeout(() => { bookPaint(); showSmallNotice?.('حُذف الكتاب من جهازك') }, 200)
}
// The native side reports downloads and deletions.
window.onBooksChanged = function () { if (view === 'books') { booksPaintChips(); booksPaint() } else if (view === 'book') bookPaint() };

if (typeof handleBack === 'function') {
  const booksPreviousBack = handleBack;
  handleBack = function () {
    if (activeSheet || (view !== 'books' && view !== 'book')) { booksPreviousBack(); return }
    if (view === 'book') { booksHome(); return }
    booksOrigin === 'more' && typeof moreHome === 'function' ? moreHome() : home()
  };
}
