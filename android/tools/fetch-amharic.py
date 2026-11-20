#!/usr/bin/env python3
"""Bundle Amharic for offline use:
 - the Amharic translation of the meanings of the Quran by Muhammed Sadiq and Muhammed Sani Habib
   (Tanzil / alquran.cloud edition am.sadiq) -> assets/quran-amharic-meanings.json
 - Noto Sans Ethiopic (SIL OFL) -> assets/fonts/noto-sans-ethiopic.ttf + licence."""
import json, sys, hashlib, urllib.request, time, pathlib
root = pathlib.Path(__file__).resolve().parents[1]
src = (root / 'assets/quran.js').read_text(encoding='utf-8')
chapters = json.loads(src[src.index('['):src.index('];') + 1])
counts = {c['id']: c['verses_count'] for c in chapters}
assert len(counts) == 114 and sum(counts.values()) == 6236

def get(url):
    for i in range(5):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mushafi build (support@mushafiapp.com)'})
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read()
        except Exception as e:
            print('retry', url, e, file=sys.stderr); time.sleep(4 * (i + 1))
    raise SystemExit('failed: ' + url)

raw = get('https://api.alquran.cloud/v1/quran/am.sadiq')
data = json.loads(raw)['data']
assert data['edition']['identifier'] == 'am.sadiq' and data['edition']['language'] == 'am', data['edition']
verses = {}
for s in data['surahs']:
    assert len(s['ayahs']) == counts[s['number']], s['number']
    for a in s['ayahs']:
        t = ' '.join(a['text'].split()); assert t, (s['number'], a['numberInSurah'])
        verses[f"{s['number']}:{a['numberInSurah']}"] = t
assert len(verses) == 6236
(root / 'docs/sources/am.sadiq.json').write_bytes(raw)
out = {'schema': 1, 'language': 'am', 'kind': 'translation-of-meanings',
       'translator': 'Muhammed Sadiq and Muhammed Sani Habib',
       'source': 'https://api.alquran.cloud/v1/quran/am.sadiq',
       'sourceSha256': hashlib.sha256(raw).hexdigest(), 'verses': verses}
(root / 'assets/quran-amharic-meanings.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print('meanings ok', verses['1:1'], '|', verses['112:1'])

base = 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosansethiopic/'
font = get(base + 'NotoSansEthiopic%5Bwdth,wght%5D.ttf')
assert font[:4] in (b'\x00\x01\x00\x00', b'true') and len(font) > 100000, len(font)
(root / 'assets/fonts/noto-sans-ethiopic.ttf').write_bytes(font)
(root / 'assets/fonts/NotoSansEthiopic-OFL.txt').write_bytes(get(base + 'OFL.txt'))
print('font ok', len(font))
