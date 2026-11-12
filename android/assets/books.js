'use strict';
/* الكتب — Islamic books from IslamHouse.com (دار الإسلام), in the app's language.
   The list comes from the IslamHouse API; a book opens in the native PDF reader, which keeps
   it on the device for reading without internet (AndroidReader.openBook / booksSaved / deleteBook). */
const BOOKS_API = 'https://api3.islamhouse.com/v3/paV29H2gm56kvLPy/main/books';
const BOOKS_PAGE = 20;
const BOOKS_HOSTS = /^https:\/\/([a-z0-9-]+\.)*islamhouse\.com\//i;
let booksState = null, booksOrigin = 'home', booksCurrent = null;

function booksLang() { const l = typeof uiLocale === 'function' ? uiLocale() : 'ar'; return ['ar', 'en', 'ur', 'bn', 'tr'].includes(l) ? l : 'en' }
function booksNative(name, ...args) { try { const f = window.AndroidReader?.[name]; return typeof f === 'function' ? f.apply(window.AndroidReader, args) : undefined } catch (e) { return undefined } }
function booksSaved() { try { const l = JSON.parse(booksNative('booksSaved') || '[]'); return Array.isArray(l) ? l : [] } catch (e) { return [] } }
function booksIsSaved(id) { return booksSaved().some(b => String(b.bookId || b.id) === String(id)) }
function booksT(t) { return typeof uiTranslate === 'function' ? uiTranslate(t) : t }
function booksSavedBooks() { const seen = new Set(); return booksSaved().filter(x => { const k = String(x.bookId || x.id); if (seen.has(k)) return false; seen.add(k); return true }).map(x => booksClean(x.raw || x)).filter(Boolean) }

function booksClean(raw) {
  if (!raw || !Number.isFinite(+raw.id)) return null;
  const files = (raw.attachments || []).filter(a => String(a.extension_type || '').toLowerCase() === 'pdf' && BOOKS_HOSTS.test(a.url || ''))
    .map((a, i) => ({ url: a.url, size: String(a.size || ''), label: String(a.description || '').trim() || '' + (i + 1) }));
  if (!files.length) return null;
  const people = raw.prepared_by || [];
  const author = people.find(p => p.kind === 'author' && p.title)?.title || people.find(p => p.title)?.title || '';
  return {
    id: +raw.id, title: String(raw.title || '').trim().slice(0, 200), author: String(author).trim().slice(0, 120),
    desc: String(raw.description || '').trim().slice(0, 1200), image: BOOKS_HOSTS.test(raw.image || '') ? raw.image : '',
    files, important: raw.importance_level === 'critical' || raw.importance_level === 'high', lang: raw.translated_language || ''
  }
}
function booksCacheKey(lang) { return 'booksCache_' + lang }
function booksFresh(lang) {
  booksState = { lang, items: [], page: 0, pages: Infinity, loading: false, error: '', query: '', tab: booksState?.tab || 'all', total: 0 };
  try {
    const c = JSON.parse(localStorage.getItem(booksCacheKey(lang)) || 'null');
    if (c && Array.isArray(c.items) && c.items.length) { booksState.items = c.items.map(booksClean).filter(Boolean); booksState.page = 0; booksState.cached = true; booksState.total = c.total || 0 }
  } catch (e) {}
}
async function booksLoadMore() {
  const s = booksState; if (!s || s.loading || s.page >= s.pages) return;
  s.loading = true; s.error = ''; booksPaint();
  const page = s.page + 1, ctrl = typeof AbortController === 'function' ? new AbortController() : null, timer = ctrl && setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(`${BOOKS_API}/${s.lang}/${s.lang}/${page}/${BOOKS_PAGE}/json`, ctrl ? { signal: ctrl.signal } : {});
    if (!r.ok) throw new Error('http ' + r.status);
    const data = await r.json();
    if (booksState !== s) return;
    const fresh = (data.data || []).map(booksClean).filter(Boolean);
    if (page === 1) { s.items = []; s.cached = false; try { localStorage.setItem(booksCacheKey(s.lang), JSON.stringify({ at: Date.now(), total: data.links?.total_items || 0, items: data.data || [] })) } catch (e) {} }
    const seen = new Set(s.items.map(b => b.id));
    s.items.push(...fresh.filter(b => !seen.has(b.id)));
    s.page = page; s.pages = +data.links?.pages_number || page; s.total = +data.links?.total_items || s.total;
  } catch (e) {
    if (booksState === s) s.error = navigator.onLine === false ? 'لا يوجد اتصال بالإنترنت؛ تظهر كتبك المحفوظة' : 'تعذر تحميل الكتب الآن؛ حاول مرة أخرى';
  } finally { clearTimeout(timer); if (booksState === s) { s.loading = false; booksPaint() } }
}

/* ---------- screens ---------- */
function booksHome(origin) {
  if (origin) booksOrigin = origin;
  enterSection('books', booksOrigin === 'more' ? 'n-more' : 'n-home');
  const lang = booksLang();
  if (!booksState || booksState.lang !== lang) booksFresh(lang);
  if (!booksSavedBooks().length && booksState.tab === 'saved') booksState.tab = 'all';
  app.innerHTML = sectionHeading('الكتب', 'كتب إسلامية موثوقة، تقرؤها في التطبيق وتحفظها لما بعد', booksOrigin === 'more' ? 'moreHome()' : 'home()') +
    `<div class="books-tools">
      <label class="books-search">${uiIcon('search')}<input type="search" id="books-q" placeholder="ابحث بالعنوان أو المؤلف" autocomplete="off" enterkeyhint="search"></label>
      <div class="books-tabs" role="tablist"><button type="button" role="tab" data-tab="all">كل الكتب</button><button type="button" role="tab" data-tab="saved">المحفوظة</button></div>
    </div>
    <div id="books-list" class="books-list" aria-live="polite"></div>
    <div id="books-more" class="books-more"></div>
    <p class="books-credit"><span>المصدر</span> <span translate="no">IslamHouse.com</span></p>`;
  const q = document.getElementById('books-q'); q.value = booksState.query || '';
  q.oninput = () => { booksState.query = q.value; booksPaint() };
  app.querySelectorAll('.books-tabs button').forEach(b => b.onclick = () => { booksState.tab = b.dataset.tab; booksPaint() });
  uiLocalize?.(app);
  booksPaint();
  if (booksState.page === 0 && !booksState.loading) booksLoadMore();
  revealSection()
}
function booksMatches(b, q) { if (!q) return true; const n = s => String(s || '').normalize('NFKD').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase(); const t = n(q).trim(); return n(b.title).includes(t) || n(b.author).includes(t) }
function booksCover(b, big) {
  if (b.image) return `<span class="book-cover${big ? ' big' : ''}"><img src="${esc(b.image)}" alt="" loading="lazy" onerror="this.parentNode.classList.add('plain');this.remove()"></span>`;
  const hue = (b.id * 47) % 360;
  return `<span class="book-cover plain${big ? ' big' : ''}" style="--h:${hue}"><b>${esc(String(b.title).trim().slice(0, 1))}</b><i></i></span>`
}
function booksRow(b, saved) {
  return `<button type="button" class="book-row" onclick="bookOpen(${b.id})">${booksCover(b)}<span class="book-row-text"><strong translate="no" dir="auto">${esc(b.title)}</strong>${b.author ? `<small translate="no" dir="auto">${esc(b.author)}</small>` : ''}<em>${saved ? `<span class="book-saved">${uiIcon('check')}<span>محفوظ</span></span>` : ''}<bdi dir="ltr">${esc(b.files[0].size)}</bdi>${b.files.length > 1 ? ' · ' + booksNum(b.files.length) + ' ' + (b.files.length === 2 ? 'جزءان' : 'أجزاء') : ''}</em></span></button>`
}
function booksNum(n) { return typeof ar === 'function' ? ar(n) : String(n) }
function booksPaint() {
  const s = booksState, list = document.getElementById('books-list'), more = document.getElementById('books-more');
  if (!s || !list || view !== 'books') return;
  const saved = booksSavedBooks(), savedIds = new Set(saved.map(b => String(b.id)));
  app.querySelectorAll('.books-tabs button').forEach(b => { const on = b.dataset.tab === s.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on) });
  const savedTab = app.querySelector('.books-tabs [data-tab=saved]'); if (savedTab) savedTab.textContent = saved.length ? `${booksT('المحفوظة')} · ${booksNum(saved.length)}` : booksT('المحفوظة');
  const source = s.tab === 'saved' ? saved : s.items;
  const shown = source.filter(b => booksMatches(b, s.query));
  if (s.tab === 'saved' && !saved.length) list.innerHTML = `<div class="books-empty">${uiIcon('download')}<strong>لا توجد كتب محفوظة بعد</strong><p>أي كتاب تفتحه يُحفظ في جهازك لتقرأه دون إنترنت</p></div>`;
  else if (!shown.length && !s.loading) list.innerHTML = s.query ? `<div class="books-empty">${uiIcon('search')}<strong>لا نتائج في الكتب المعروضة</strong><p>${s.tab === 'all' && s.page < s.pages ? 'حمّل المزيد ثم ابحث مرة أخرى' : 'جرّب كلمة أخرى'}</p></div>` : (s.error ? '' : '');
  else list.innerHTML = shown.map(b => booksRow(b, savedIds.has(String(b.id)))).join('');
  if (s.loading && !shown.length) list.innerHTML = Array.from({ length: 6 }, () => '<div class="book-row skeleton"><span class="book-cover"></span><span class="book-row-text"><i></i><i></i></span></div>').join('');
  if (more) {
    if (s.tab === 'saved') more.innerHTML = '';
    else if (s.error) more.innerHTML = `<p class="books-error">${esc(s.error)}</p><button type="button" class="books-load" onclick="booksLoadMore()">إعادة المحاولة</button>`;
    else if (s.loading && shown.length) more.innerHTML = '<div class="books-spinner" aria-label="جارٍ التحميل"></div>';
    else if (s.page < s.pages && s.page > 0) more.innerHTML = `<button type="button" class="books-load" onclick="booksLoadMore()">عرض المزيد${s.total ? ` <small>${booksNum(shown.length)} / ${booksNum(s.total)}</small>` : ''}</button>`;
    else more.innerHTML = '';
    if (s.tab === 'all' && !s.error && !s.loading && s.page > 0 && s.page < s.pages && 'IntersectionObserver' in window) {
      const btn = more.querySelector('.books-load'); if (btn) { const io = new IntersectionObserver(e => { if (e[0].isIntersecting) { io.disconnect(); booksLoadMore() } }, { rootMargin: '300px' }); io.observe(btn) }
    }
  }
  uiLocalize?.(list); uiLocalize?.(more)
}

function bookFind(id) {
  id = +id;
  return booksState?.items.find(b => b.id === id) || booksSavedBooks().find(b => b.id === id) || null
}
function bookOpen(id) {
  const b = bookFind(id); if (!b) return;
  booksCurrent = b;
  enterSection('book', booksOrigin === 'more' ? 'n-more' : 'n-home');
  bookPaint();
  revealSection()
}
function bookPaint() {
  const b = booksCurrent; if (!b || view !== 'book') return;
  const saved = booksIsSaved(b.id);
  app.innerHTML = sectionHeading('الكتب', '', 'booksHome()') +
    `<article class="book-detail">${booksCover(b, true)}
      <h1 dir="auto" translate="no">${esc(b.title)}</h1>${b.author ? `<p class="book-author" dir="auto" translate="no">${esc(b.author)}</p>` : ''}
      <div class="book-actions">${b.files.length === 1 ? `<button type="button" class="book-read" onclick="bookRead(0)">${uiIcon('book')}<span>${saved ? 'اقرأ' : 'اقرأ الكتاب'}</span></button>` : ''}
        ${saved ? `<span class="book-saved big">${uiIcon('check')}<span>محفوظ في جهازك للقراءة دون إنترنت</span></span><button type="button" class="book-delete" onclick="bookDelete()">${uiIcon('trash')}<span>حذف من الجهاز</span></button>` : `<p class="book-note">${b.files.length === 1 ? '<bdi dir="ltr">' + esc(b.files[0].size) + '</bdi> · ' : ''}<span>يُحفظ في جهازك عند فتحه، لتقرأه دون إنترنت</span></p>`}</div>
      ${b.files.length > 1 ? `<h2>أجزاء الكتاب</h2><div class="book-files">${b.files.map((f, i) => `<button type="button" class="book-file" onclick="bookRead(${i})">${uiIcon('book')}<span dir="auto" translate="no">${esc(f.label)}</span><small translate="no" dir="ltr">${esc(f.size)}</small></button>`).join('')}</div>` : ''}
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
window.onBooksChanged = function () { if (view === 'books') booksPaint(); else if (view === 'book') bookPaint() };

if (typeof handleBack === 'function') {
  const booksPreviousBack = handleBack;
  handleBack = function () {
    if (activeSheet || (view !== 'books' && view !== 'book')) { booksPreviousBack(); return }
    if (view === 'book') { booksHome(); return }
    booksOrigin === 'more' && typeof moreHome === 'function' ? moreHome() : home()
  };
}
