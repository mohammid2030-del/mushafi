#!/usr/bin/env python3
"""Renders the 604 Mushaf pages from the app's own reader into tvos/Pages/page-NNN.webp.

Each image holds only the text block (lines, surah headings, verse ornaments) on a transparent
background, so the TV can lay pages on any colour without a visible page box: as rendered in the
night theme (cream ink, gold ornaments), and inverted to dark ink on cream paper in daylight.
Alongside, tvos/Pages/ayahs.json gives each verse's rectangles on its page (0…1, one per line),
used to highlight the verse being recited.

Runs on a Linux runner with Chrome + Playwright. Same fonts, frames and ornaments as the phone app.
"""
import asyncio, io, json, os
from playwright.async_api import async_playwright
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'tvos', 'Pages')
HEIGHT = int(os.environ.get('PAGE_HEIGHT', '1400'))
PAD = 12  # CSS px around the text block
LAST = int(os.environ.get('PAGE_LAST', '604'))  # for quick local checks

MEASURE = """(n) => {
  const el = document.querySelector(`.page-lines[data-page="${n}"]`);
  const parts = [el.getBoundingClientRect(), ...[...el.querySelectorAll('.qword,.surah-heading,.basmala-line')].map(w => w.getBoundingClientRect())];
  const box = [Math.min(...parts.map(q => q.left)), Math.min(...parts.map(q => q.top)), Math.max(...parts.map(q => q.right)), Math.max(...parts.map(q => q.bottom))];
  const words = [...el.querySelectorAll('.qword[data-key]')].map(w => { const r = w.getBoundingClientRect(); return [w.dataset.key, r.left, r.top, r.right, r.bottom] });
  return { box, words };
}"""

async def main():
    os.makedirs(OUT, exist_ok=True)
    ayahs = {}
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel='chrome', args=['--allow-file-access-from-files'])
        ctx = await browser.new_context(viewport={'width': 900, 'height': 1400}, device_scale_factor=2)
        page = await ctx.new_page()
        await page.add_init_script("localStorage.mushafiWelcomeCompleted='1';localStorage.themeMode='dark';localStorage.dark='1';"
                                   "localStorage.appLanguage='ar';localStorage.mushafiTourDone='1';")
        await page.goto('file://' + os.path.join(ROOT, 'android', 'assets', 'index.html'))
        await page.wait_for_timeout(2500)
        await page.add_style_tag(content='html,body,#app,.reader,.page-stage,.page-stage *{background:transparent!important;'
                                         'background-color:transparent!important;box-shadow:none!important}')
        for n in range(1, LAST + 1):
            target = os.path.join(OUT, f'page-{n:03d}.webp')
            await page.evaluate(f'showPage({n})')
            await page.wait_for_function(f"document.querySelector('.page-lines[data-page=\"{n}\"] .qword')", timeout=20000)
            await page.wait_for_timeout(120)
            m = await page.evaluate(MEASURE, n)
            x0, y0, x1, y1 = m['box']
            x0 -= PAD; y0 -= PAD; x1 += PAD; y1 += PAD
            w, h = x1 - x0, y1 - y0
            shot = await page.screenshot(type='png', clip={'x': x0, 'y': y0, 'width': w, 'height': h}, omit_background=True)
            img = Image.open(io.BytesIO(shot)).convert('RGBA')
            img = img.resize((round(img.width * HEIGHT / img.height), HEIGHT), Image.LANCZOS)
            img.save(target, 'WEBP', quality=66, alpha_quality=45, method=6)

            # Verse rectangles: words of one verse on one line merge into one rectangle.
            lines = {}
            for key, l, t, r, b in m['words']:
                row = round((t + b) / 2 / 8)
                cur = lines.setdefault((key, row), [l, t, r, b])
                cur[0] = min(cur[0], l); cur[1] = min(cur[1], t); cur[2] = max(cur[2], r); cur[3] = max(cur[3], b)
            verses = {}
            for (key, _), (l, t, r, b) in sorted(lines.items(), key=lambda kv: (kv[1][1], -kv[1][2])):
                verses.setdefault(key, []).append([round((l - x0) / w, 4), round((t - y0) / h, 4), round((r - l) / w, 4), round((b - t) / h, 4)])
            ayahs[str(n)] = verses
            if n % 50 == 0:
                print('rendered', n, flush=True)
        await browser.close()
    with open(os.path.join(OUT, 'ayahs.json'), 'w') as f:
        json.dump(ayahs, f, separators=(',', ':'), ensure_ascii=False)

asyncio.run(main())
