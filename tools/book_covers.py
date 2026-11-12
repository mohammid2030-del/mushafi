#!/usr/bin/env python3
"""Makes book covers for الكتب from the first page of each IslamHouse PDF that has no cover image.

Runs in CI (covers.yml) inside a checkout of the `covers` branch:
  OUT/<lang>/<id>.webp   a 300px-wide cover
  OUT/<lang>/index.json  the ids that have a cover (the app reads it through the wake worker)
Already-made covers are skipped, so the job can resume and later runs only add new books.
"""
import concurrent.futures as cf, io, json, os, subprocess, sys, tempfile, time, urllib.request

API = 'https://api3.islamhouse.com/v3/paV29H2gm56kvLPy/main/books'
LANGS = ['ar', 'en', 'ur', 'bn', 'tr']
OUT = sys.argv[1] if len(sys.argv) > 1 else 'out'
BUDGET = float(os.environ.get('COVER_BUDGET_MIN', '300')) * 60
STARTED = time.time()

def get(url, timeout=60):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mushafi covers (appmushafi@gmail.com)'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

def books(lang):
    page, pages = 1, 1
    while page <= pages:
        for attempt in range(3):
            try:
                d = json.loads(get(f'{API}/{lang}/{lang}/{page}/25/json')); break
            except Exception:
                time.sleep(3)
        else:
            page += 1; continue
        pages = int(d.get('links', {}).get('pages_number') or page)
        for x in d.get('data') or []:
            pdf = next((a['url'] for a in x.get('attachments') or [] if str(a.get('extension_type', '')).lower() == 'pdf'), None)
            if pdf and not x.get('image'): yield int(x['id']), pdf
        page += 1

def make(lang, bid, url):
    target = os.path.join(OUT, lang, f'{bid}.webp')
    if os.path.exists(target): return bid
    with tempfile.TemporaryDirectory() as tmp:
        pdf = os.path.join(tmp, 'b.pdf')
        try:
            data = get(url, timeout=180)
            if len(data) > 120 * 1024 * 1024 or not data.startswith(b'%PDF'): return None
            open(pdf, 'wb').write(data)
            subprocess.run(['pdftoppm', '-f', '1', '-l', '1', '-scale-to-x', '420', '-scale-to-y', '-1', '-png', pdf, os.path.join(tmp, 'p')],
                           check=True, timeout=120, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            png = next(os.path.join(tmp, f) for f in os.listdir(tmp) if f.endswith('.png'))
            from PIL import Image, ImageStat
            im = Image.open(png).convert('RGB')
            if ImageStat.Stat(im.convert('L')).stddev[0] < 3: return None   # blank first page
            w = 300; im = im.resize((w, max(1, round(im.height * w / im.width))), Image.LANCZOS)
            im.save(target, 'WEBP', quality=72, method=6)
            return bid
        except Exception:
            return None

def main():
    for lang in LANGS:
        os.makedirs(os.path.join(OUT, lang), exist_ok=True)
        idx_path = os.path.join(OUT, lang, 'index.json')
        have = set(int(f[:-5]) for f in os.listdir(os.path.join(OUT, lang)) if f.endswith('.webp'))
        todo = [(b, u) for b, u in books(lang) if b not in have]
        print(lang, 'have', len(have), 'todo', len(todo), flush=True)
        done = 0
        with cf.ThreadPoolExecutor(8) as pool:
            futures = [pool.submit(make, lang, b, u) for b, u in todo]
            for f in cf.as_completed(futures):
                if f.result(): have.add(f.result()); done += 1
                if done and done % 200 == 0: print(lang, 'made', done, flush=True)
                if time.time() - STARTED > BUDGET:
                    for x in futures: x.cancel()
                    break
        json.dump(sorted(have), open(idx_path, 'w'))
        print(lang, 'covers', len(have), flush=True)
        if time.time() - STARTED > BUDGET: print('time budget reached'); break

if __name__ == '__main__':
    main()
