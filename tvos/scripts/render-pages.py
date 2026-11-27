#!/usr/bin/env python3
"""Renders the 604 Mushaf pages from the app's own reader (dark theme) into tvos/Pages/page-NNN.webp.

Runs on a Linux runner with Chrome + Playwright. Same fonts, frames and verse ornaments as the phone app.
"""
import asyncio, io, os, sys
from playwright.async_api import async_playwright
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'tvos', 'Pages')
WIDTH = int(os.environ.get('PAGE_WIDTH', '1200'))

async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel='chrome', args=['--allow-file-access-from-files'])
        ctx = await browser.new_context(viewport={'width': 900, 'height': 1400}, device_scale_factor=2)
        page = await ctx.new_page()
        await page.add_init_script("localStorage.mushafiWelcomeCompleted='1';localStorage.themeMode='dark';localStorage.dark='1';"
                                   "localStorage.appLanguage='ar';localStorage.mushafiTourDone='1';")
        await page.goto('file://' + os.path.join(ROOT, 'android', 'assets', 'index.html'))
        await page.wait_for_timeout(2500)
        for n in range(1, 605):
            target = os.path.join(OUT, f'page-{n:03d}.webp')
            await page.evaluate(f'showPage({n})')
            await page.wait_for_function(f"document.querySelector('.page-lines[data-page=\"{n}\"] .qword')", timeout=20000)
            await page.wait_for_timeout(120)
            shot = await page.screenshot(type='png')
            img = Image.open(io.BytesIO(shot)).convert('RGB')
            img = img.resize((WIDTH, round(img.height * WIDTH / img.width)), Image.LANCZOS)
            img.save(target, 'WEBP', quality=76, method=6)
            if n % 50 == 0:
                print('rendered', n, flush=True)
        await browser.close()

asyncio.run(main())
