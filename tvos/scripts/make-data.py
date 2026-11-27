#!/usr/bin/env python3
"""Builds the small data files the Apple TV app reads, from the same web assets the phones use.

tv-library.json: surahs (name, verses, start page, place), each page's first verse, juz, and the page of every verse.
tv-verses.json:  Uthmani text of every verse (for the «now playing» line).
"""
import json, os, sys
root = os.path.join(os.path.dirname(__file__), '..', '..', 'android', 'assets')
out = os.path.join(os.path.dirname(__file__), '..', 'Generated')

def js_value(name):
    text = open(os.path.join(root, name), encoding='utf-8').read()
    return json.loads(text[text.index('=') + 1:text.rstrip().rindex(';')])

chapters = js_value('quran.js')
pages = js_value('pages.js')
ayah_page = {}
page_rows = []
for p in range(1, 605):
    data = pages[str(p)]
    keys = data['keys']
    s, a = map(int, keys[0].split(':'))
    page_rows.append({'s': s, 'a': a, 'juz': data.get('juz', 0)})
    for k in keys:
        c, v = map(int, k.split(':'))
        ayah_page.setdefault(c, {})[v] = p
library = {
    'chapters': [{'id': c['id'], 'name': c['name_arabic'], 'verses': c['verses_count'], 'page': c['pages'][0],
                  'place': c['revelation_place']} for c in chapters],
    'pages': page_rows,
    'ayahPage': {str(c): [ayah_page[c][v] for v in sorted(ayah_page[c])] for c in sorted(ayah_page)},
}
verses = {str(c['id']): [v['text_uthmani'] for v in c['verses']] for c in chapters}
os.makedirs(out, exist_ok=True)
json.dump(library, open(os.path.join(out, 'tv-library.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
json.dump(verses, open(os.path.join(out, 'tv-verses.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('chapters', len(library['chapters']), 'pages', len(page_rows))
