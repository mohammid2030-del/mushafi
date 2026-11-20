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

// Verses flow as one paragraph, like a mushaf line: the basmala stands on its own line, every verse-end marker stays
// with the word before it, and full lines are justified edge to edge (the last line is centred).
function scParagraphs(text) {
  const rows = String(text).split(/\n+/).map(r => r.trim()).filter(Boolean);
  const out = [];
  if (rows.length > 1 && /^بِسْمِ/.test(rows[0]) && rows[0].split(/\s+/).length <= 5) out.push(rows.shift());
  if (rows.length) out.push(rows.join(' '));
  return out.map(p => {
    const tokens = [];
    for (const w of p.split(/\s+/).filter(Boolean)) { if (tokens.length && /^[﴿(]?[\d٠-٩۰-۹]+[﴾)]?$|^[ۖۗۚۛۜ۩ۘ]$/.test(w)) tokens[tokens.length - 1] += ' ' + w; else tokens.push(w) }
    return tokens;
  });
}
function scLines(g, text, max) {
  const space = g.measureText(' ').width, lines = [];
  for (const tokens of scParagraphs(text)) {
    let cur = [], width = 0;
    for (const t of tokens) {
      const w = g.measureText(t).width;
      if (cur.length && width + space + w > max) { lines.push({ words: cur, width, last: false }); cur = []; width = 0 }
      width += (cur.length ? space : 0) + w; cur.push({ t, w });
    }
    if (cur.length) lines.push({ words: cur, width, last: true });
  }
  return lines;
}
function scDrawLine(g, line, cx, y, max) {
  const n = line.words.length, natural = line.words.reduce((a, w) => a + w.w, 0), space = g.measureText(' ').width;
  // justify full lines; keep the last line of a paragraph (and very short lines) centred at natural spacing
  const stretch = n > 1 ? (max - natural) / (n - 1) : space, justify = !line.last && n > 1 && stretch <= space * 2.6, gapW = justify ? stretch : space;
  const total = natural + gapW * (n - 1);
  let x = cx + total / 2;
  g.textAlign = 'right';
  for (const w of line.words) { g.fillText(w.t, x, y); x -= w.w + gapW }
  g.textAlign = 'center';
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
    g.font = `${size}px Quran, serif`; L.lines = scLines(g, content.text, inner); L.measure = inner;
    L.total = L.kBlock + L.lines.length * L.lh + L.rBlock;
    return L;
  };
  let L = null;
  for (let size = f.max; size >= f.min; size -= 1) { L = lay(size); if (L.total <= room) break }
  if (L.total > room) {   // very long passage: keep what fits and mark the cut
    const keep = Math.max(1, Math.floor((room - L.kBlock - L.rBlock) / L.lh));
    if (L.lines.length > keep) { L.lines = L.lines.slice(0, keep); const t = L.lines[keep - 1]; t.words.push({ t: '…', w: g.measureText('…').width }); t.last = true; L.cut = true }
    L.total = L.kBlock + L.lines.length * L.lh + L.rBlock;
  }
  // pick the measure (up to the card width) that fills every full line most evenly, so justified lines need no wide gaps
  if (!L.cut && L.lines.length > 1) {
    // also try a slightly smaller size: a few points less often lets every full line fill evenly
    let best = null;
    for (let sz = L.size; sz >= Math.max(f.min, Math.round(L.size * 0.86)); sz -= 2) {
      const T = sz === L.size ? L : lay(sz); if (T.total > room) continue;
      g.font = `${sz}px Quran, serif`; const sp = g.measureText(' ').width;
      for (let m = inner; m >= inner * 0.7; m -= inner * 0.01) {
        const ls = scLines(g, content.text, m); if (ls.length > T.lines.length) break;
        const full = ls.filter(l => !l.last), lastShort = ls.filter(l => l.last && ls.length > 1 && (l.words.length === 1 || l.width < m * 0.3)).length;
        const cost = full.reduce((a, l) => { const n = l.words.length, st = n > 1 ? (m - l.width) / (n - 1) + sp : 9 * sp; return a + ((m - l.width) / m) ** 2 + (st > sp * 2.6 ? 1 : 0) }, 0) + lastShort * 3 + (L.size - sz) * 0.012;
        if (!best || cost < best.cost - 1e-6) best = { cost, m, ls, T };
      }
    }
    if (best) { L = best.T; L.lines = best.ls; L.measure = best.m; L.total = L.kBlock + L.lines.length * L.lh + L.rBlock }
  }
  const { size, lh, kSize, rSize, rLines, rLH, gap, lines } = L;
  let y = top + Math.max(0, (room - L.total) / 2);
  if (kSize) { g.font = `600 ${kSize}px AppArabic, sans-serif`; g.fillStyle = GOLD; g.fillText(content.kicker, CX, y + kSize * 0.7); y += L.kBlock }
  g.font = `${size}px Quran, serif`; g.fillStyle = INK; g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 8;
  lines.forEach((line, i) => scDrawLine(g, line, CX, y + lh * (i + 0.5), L.measure));
  g.shadowBlur = 0; y += lines.length * lh;
  if (rLines.length) {
    y += gap * 0.65;
    const w = Math.min(inner * 0.28, 190); g.strokeStyle = 'rgba(220,191,134,.45)'; g.lineWidth = 2; g.beginPath(); g.moveTo(CX - w / 2, y); g.lineTo(CX + w / 2, y); g.stroke();
    y += gap * 0.65;
    g.font = `500 ${rSize}px AppArabic, sans-serif`; g.fillStyle = GOLD;
    rLines.forEach((line, i) => g.fillText(line, CX, y + rLH * (i + 0.5)));
  }
  content._fit = { size, rSize, kSize, cut: !!L.cut };
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
  openShareCard({ text: d.text, reference: ref, kicker: '' }, () => scDuaText(id), `Mushafi-dua`);
};
