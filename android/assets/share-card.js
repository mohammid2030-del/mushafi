'use strict';
/* Share as image: a verse or a dua set inside Mushafi's glass card (portrait story or square),
   with "مصحفي | Mushafi" under the card. Text sharing stays available from the same sheet. */
const SC_FORMATS = {
  story: { src: 'images/share-story.jpg', W: 1080, H: 1919, box: [70, 513, 1008, 1482], brandY: 1590, max: 62, min: 26, ref: 34 },
  square: { src: 'images/share-square.jpg', W: 1080, H: 1080, box: [84, 382, 993, 820], brandY: 906, max: 50, min: 22, ref: 28 }
};
const scImages = {};
function scImage(src) { return scImages[src] || (scImages[src] = new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src })) }
async function scFonts() { try { await Promise.all([document.fonts?.load('40px Quran'), document.fonts?.load('600 40px AppArabic'), document.fonts?.load('400 40px AppArabic')]) } catch (e) {} }

// Break text into lines that fit `max` pixels at the current font (Arabic words stay whole).
function scWrap(g, text, max) {
  const out = [];
  for (const para of String(text).split(/\n+/)) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? line + ' ' + word : word;
      if (line && g.measureText(next).width > max) { out.push(line); line = word } else line = next;
    }
    if (line) out.push(line);
  }
  return out;
}

/** Draw a share card. content: { text, reference, kicker } */
async function scRender(content, format = 'story') {
  const f = SC_FORMATS[format] || SC_FORMATS.story;
  await scFonts();
  const bg = await scImage(f.src), c = document.createElement('canvas'); c.width = f.W; c.height = f.H;
  const g = c.getContext('2d');
  if (bg) g.drawImage(bg, 0, 0, f.W, f.H); else { g.fillStyle = '#121212'; g.fillRect(0, 0, f.W, f.H) }
  const [x0, y0, x1, y1] = f.box, bw = x1 - x0, bh = y1 - y0, padX = bw * 0.1, padY = bh * 0.1, inner = bw - padX * 2;
  const GOLD = '#dcbf86', INK = '#f6efe0', CX = (x0 + x1) / 2;
  g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const top = y0 + padY, bottom = y1 - padY, room = bottom - top;
  // One layout for every length: the verse size is chosen first, and the title and reference follow it in
  // proportion, so a short verse is not oversized and a long one is never cut at the card's edges.
  const lay = size => {
    const L = { size, lh: size * 1.85, gap: Math.round(size * 0.55) };
    L.kSize = content.kicker ? Math.max(22, Math.min(Math.round(size * 0.62), f.ref + 6)) : 0;
    if (L.kSize) { g.font = `600 ${L.kSize}px AppArabic, sans-serif`; while (L.kSize > 18 && g.measureText(content.kicker).width > inner) { L.kSize -= 1; g.font = `600 ${L.kSize}px AppArabic, sans-serif` } }
    L.rLines = [];
    if (content.reference) {
      for (L.rSize = Math.max(20, Math.min(Math.round(size * 0.52), f.ref)); L.rSize >= 16; L.rSize -= 1) { g.font = `500 ${L.rSize}px AppArabic, sans-serif`; L.rLines = scWrap(g, content.reference, inner); if (L.rLines.length <= (L.rSize <= 22 ? 3 : 2)) break }
      if (L.rLines.length > 3) { L.rLines = L.rLines.slice(0, 3); L.rLines[2] += ' …' }
    }
    L.rLH = (L.rSize || 0) * 1.5;
    L.kBlock = L.kSize ? L.kSize * 1.4 + L.gap * 0.7 : 0;
    L.rBlock = L.rLines.length ? L.gap * 1.3 + L.rLines.length * L.rLH : 0;
    g.font = `${size}px Quran, serif`; L.lines = scWrap(g, content.text, inner);
    L.total = L.kBlock + L.lines.length * L.lh + L.rBlock;
    return L;
  };
  let L = null;
  for (let size = f.max; size >= f.min; size -= 1) { L = lay(size); if (L.total <= room) break }
  if (L.total > room) {   // very long passage: keep what fits and mark the cut
    const keep = Math.max(1, Math.floor((room - L.kBlock - L.rBlock) / L.lh));
    if (L.lines.length > keep) { L.lines = L.lines.slice(0, keep); L.lines[keep - 1] += ' …' }
    L.total = L.kBlock + L.lines.length * L.lh + L.rBlock;
  } else if (L.lines.length > 1) {
    // even lines: the narrowest measure that keeps the same number of lines, so the last line is not a lone word
    g.font = `${L.size}px Quran, serif`; let lo = inner * 0.55, hi = inner;
    for (let k = 0; k < 14; k++) { const mid = (lo + hi) / 2; if (scWrap(g, content.text, mid).length <= L.lines.length) hi = mid; else lo = mid }
    L.lines = scWrap(g, content.text, hi);
  }
  const { size, lh, kSize, rSize, rLines, rLH, gap, lines } = L;
  let y = top + Math.max(0, (room - L.total) / 2);
  if (kSize) { g.font = `600 ${kSize}px AppArabic, sans-serif`; g.fillStyle = GOLD; g.fillText(content.kicker, CX, y + kSize * 0.7); y += L.kBlock }
  g.font = `${size}px Quran, serif`; g.fillStyle = INK; g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 8;
  lines.forEach((line, i) => g.fillText(line, CX, y + lh * (i + 0.5)));
  g.shadowBlur = 0; y += lines.length * lh;
  if (rLines.length) {
    y += gap * 0.65;
    const w = Math.min(inner * 0.28, 190); g.strokeStyle = 'rgba(220,191,134,.45)'; g.lineWidth = 2; g.beginPath(); g.moveTo(CX - w / 2, y); g.lineTo(CX + w / 2, y); g.stroke();
    y += gap * 0.65;
    g.font = `500 ${rSize}px AppArabic, sans-serif`; g.fillStyle = GOLD;
    rLines.forEach((line, i) => g.fillText(line, CX, y + rLH * (i + 0.5)));
  }
  content._fit = { size, rSize, kSize, cut: lines.some(l => l.endsWith(' …')) };
  scBrand(g, f.W / 2, f.brandY, format === 'story' ? 40 : 34);
  return c;
}
// "مصحفي | Mushafi" under the card
function scBrand(g, cx, cy, size) {
  g.save(); g.textBaseline = 'middle'; g.direction = 'ltr';
  const arName = 'مصحفي', en = 'Mushafi', bar = '|';
  g.font = `600 ${size}px AppArabic, sans-serif`; const wa = g.measureText(arName).width;
  g.font = `500 ${size * 0.92}px AppArabic, sans-serif`; const we = g.measureText(en).width;
  const space = size * 0.55, total = we + space * 2 + size * 0.2 + wa;
  let x = cx - total / 2;
  g.textAlign = 'left'; g.fillStyle = '#f6efe0'; g.fillText(en, x, cy); x += we + space;
  g.fillStyle = 'rgba(220,191,134,.75)'; g.font = `300 ${size}px AppArabic, sans-serif`; g.fillText(bar, x, cy); x += size * 0.2 + space;
  g.fillStyle = '#dcbf86'; g.font = `600 ${size}px AppArabic, sans-serif`; g.direction = 'rtl'; g.textAlign = 'right'; g.fillText(arName, x + wa, cy);
  g.restore();
}

async function scDeliver(canvas, name, action) {
  const data = canvas.toDataURL('image/png');
  const method = action === 'save' ? 'hajjSaveFile' : 'hajjShareFile';
  try { if (typeof window.AndroidReader?.[method] === 'function') { AndroidReader[method](data, 'image/png', name); return true } } catch (e) {}
  try {
    if (action !== 'save' && navigator.canShare) {
      const blob = await (await fetch(data)).blob(), file = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return true }
    }
  } catch (e) { if (e.name === 'AbortError') return true }
  const a = document.createElement('a'); a.href = data; a.download = name; document.body.append(a); a.click(); a.remove(); return true;
}

/** The share sheet: preview, portrait/square, share or save the image, or share the text. */
function openShareCard(content, shareText, name = 'Mushafi') {
  const box = featureSheet('مشاركة', 'share-card');
  let format = localStorage.shareCardFormat === 'square' ? 'square' : 'story', canvas = null, serial = 0;
  box.innerHTML = `<div class="sc-sheet">
    <div class="sc-formats" role="radiogroup" aria-label="شكل الصورة">${[['story', 'عمودي', 'للحالة والستوري'], ['square', 'مربع', 'للمنشورات']].map(([id, t, s]) => `<button type="button" role="radio" data-sc="${id}"><b>${t}</b><small>${s}</small></button>`).join('')}</div>
    <div class="sc-preview"><div class="sc-spinner" aria-hidden="true"></div><img alt="" hidden></div>
    <p class="sc-hint" hidden>النص طويل، فيُشارَك بالشكل العمودي ليبقى واضحًا وكاملًا</p>
    <div class="sc-actions"><button type="button" class="primary sc-share">${uiIcon('share')}<span>مشاركة الصورة</span></button><button type="button" class="sc-save">${uiIcon('download')}<span>حفظ الصورة</span></button></div>
    <button type="button" class="welcome-text-button sc-text">مشاركة كنص</button>
  </div>`;
  try { uiLocalize(box) } catch (e) {}
  const img = box.querySelector('.sc-preview img'), preview = box.querySelector('.sc-preview');
  const paint = async () => {
    const mine = ++serial;
    box.querySelectorAll('[data-sc]').forEach(b => { const on = b.dataset.sc === format; b.classList.toggle('on', on); b.setAttribute('aria-checked', on) });
    preview.dataset.format = format; preview.classList.add('busy');
    const c = await scRender(content, format); if (mine !== serial) return;
    canvas = c; img.src = c.toDataURL('image/jpeg', 0.85); img.hidden = false; preview.classList.remove('busy');
  };
  box.querySelectorAll('[data-sc]').forEach(b => b.onclick = () => { if (format === b.dataset.sc) return; format = b.dataset.sc; localStorage.shareCardFormat = format; paint() });
  const ready = async () => { while (!canvas) await new Promise(r => setTimeout(r, 60)); return canvas };
  box.querySelector('.sc-share').onclick = async () => { await scDeliver(await ready(), `${name}-${format}.png`, 'share') };
  box.querySelector('.sc-save').onclick = async () => { await scDeliver(await ready(), `${name}-${format}.png`, 'save'); if (!window.AndroidReader?.hajjSaveFile) showSmallNotice('حُفظت الصورة') };
  box.querySelector('.sc-text').onclick = () => { closeFeatureSheet(); shareText() };
  // A long text would be too small (or cut) in the square: offer the portrait card only.
  const probe = { ...content };
  scRender(probe, 'square').then(() => {
    const fit = probe._fit;
    if (fit && (fit.cut || fit.size < 30)) {
      const sq = box.querySelector('[data-sc="square"]'); sq.disabled = true; sq.querySelector('small').textContent = 'للنصوص القصيرة';
      box.querySelector('.sc-hint').hidden = false; format = 'story';
      try { uiLocalize(box.querySelector('.sc-formats')); uiLocalize(box.querySelector('.sc-hint')) } catch (e) {}
    }
  }).catch(() => {}).then(paint);
}

// Verses
const scVerseText = shareSelectedVerse;
shareSelectedVerse = function (key) {
  const [c, v] = String(key).split(':').map(Number), ch = chapters[c - 1];
  if (!ch?.verses?.[v - 1]) return scVerseText(key);
  openShareCard({ text: '﴿' + ch.verses[v - 1].text_uthmani + '﴾', reference: 'سورة ' + ch.name_arabic + ' · الآية ' + ar(v) }, () => scVerseText(key), `Mushafi-${c}-${v}`);
};
// Duas and adhkar
const scDuaText = shareDevotion;
shareDevotion = function (id) {
  const d = devotionById?.[id];
  if (!d) return scDuaText(id);
  const clean = r => String(r || '').replace(/(\d|[٠-٩])[a-z]\b/gi, '$1'); // sub-numbers such as 2730a read as 2730
  const ref = [...new Set([d.reference, d.hadithRef?.reference].filter(Boolean).map(clean))].join(' · ');
  openShareCard({ text: d.text, reference: ref, kicker: d.title && d.title.length < 40 ? d.title : '' }, () => scDuaText(id), `Mushafi-dua`);
};
