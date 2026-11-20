#!/usr/bin/env python3
"""Bundle Russian for offline use: the Russian translation of the meanings of the Quran by Elmir Kuliev
(Tanzil / alquran.cloud edition ru.kuliev) -> assets/quran-russian-meanings.json"""
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

raw = get('https://api.alquran.cloud/v1/quran/ru.kuliev')
data = json.loads(raw)['data']
assert data['edition']['identifier'] == 'ru.kuliev' and data['edition']['language'] == 'ru', data['edition']
verses = {}
for s in data['surahs']:
    assert len(s['ayahs']) == counts[s['number']], s['number']
    for a in s['ayahs']:
        t = ' '.join(a['text'].split()); assert t, (s['number'], a['numberInSurah'])
        verses[f"{s['number']}:{a['numberInSurah']}"] = t
assert len(verses) == 6236
(root / 'docs/sources/ru.kuliev.json').write_bytes(raw)
out = {'schema': 1, 'language': 'ru', 'kind': 'translation-of-meanings',
       'translator': 'Elmir Kuliev',
       'source': 'https://api.alquran.cloud/v1/quran/ru.kuliev',
       'sourceSha256': hashlib.sha256(raw).hexdigest(), 'verses': verses}
(root / 'assets/quran-russian-meanings.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print('meanings ok', verses['1:1'], '|', verses['112:1'])

