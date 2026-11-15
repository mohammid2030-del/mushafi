#!/usr/bin/env python3
"""Fetch Muhammad Hamidullah's French translation of the meanings of the Quran
from the Quran.com API (resource 31) and bundle it for offline reading.
Writes android/assets/quran-french-meanings.json (same schema as the other
translation files) and keeps the raw API responses under docs/sources."""
import json, re, sys, html, hashlib, urllib.request, time, pathlib
root = pathlib.Path(__file__).resolve().parents[1]
src = (root / 'assets/quran.js').read_text(encoding='utf-8')
chapters = json.loads(src[src.index('['):src.index('];') + 1])
counts = {c['id']: c['verses_count'] for c in chapters}
assert len(counts) == 114 and sum(counts.values()) == 6236
API = 'https://api.quran.com/api/v4/quran/translations/31?chapter_number={}'

def get(url):
    for i in range(5):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mushafi build (support@mushafiapp.com)', 'Accept': 'application/json'})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except Exception as e:
            print('retry', url, e, file=sys.stderr); time.sleep(3 * (i + 1))
    raise SystemExit('failed: ' + url)

def clean(t):
    t = re.sub(r'\s*<sup[^>]*>.*?</sup>', '', t, flags=re.S)  # footnote markers (and the space before them)
    t = re.sub(r'<[^>]+>', '', t)
    t = html.unescape(t)
    t = re.sub(r'\s+', ' ', t).strip()
    return re.sub(r' +([.,])', r'\1', t)  # no space before . or , left by removed markers

raw, verses = {}, {}
for c in range(1, 115):
    body = get(API.format(c)); raw[c] = json.loads(body)
    items = raw[c]['translations']
    assert len(items) == counts[c], (c, len(items), counts[c])
    assert all(x.get('resource_id') == 31 for x in items), c
    for v, x in enumerate(items, 1):
        text = clean(x['text']); assert text, (c, v)
        verses[f'{c}:{v}'] = text
assert len(verses) == 6236
raw_bytes = json.dumps(raw, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
(root / 'docs/sources/fr.hamidullah.quran-com.json').write_bytes(raw_bytes)
out = {'schema': 1, 'language': 'fr', 'kind': 'translation-of-meanings',
       'translator': 'Muhammad Hamidullah',
       'source': 'https://api.quran.com/api/v4/quran/translations/31',
       'sourceSha256': hashlib.sha256(raw_bytes).hexdigest(), 'verses': verses}
(root / 'assets/quran-french-meanings.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print('ok', len(verses), verses['1:1'], '|', verses['112:1'])
