"""Find where a heard snippet sits in the Quran text.

The speech model writes what it heard; this module finds the verses that text came from,
even when some words are misheard. Plain Python so it can be ported to the app as is.
"""
import json, re, difflib
from collections import defaultdict

_DIAC = re.compile('[ؐ-ًؚ-ٟۖ-ۭ࣓-ࣿـ]')


def norm_word(w):
    w = w.replace('ٰ', 'ا')            # dagger alef reads as alef
    w = _DIAC.sub('', w)
    w = re.sub('[ٱآأإ]', 'ا', w)
    w = w.replace('ى', 'ي').replace('ة', 'ه').replace('ؤ', 'و').replace('ئ', 'ي').replace('ء', '')
    w = re.sub('[^ء-ي]', '', w)
    return w


def norm_text(t):
    return [x for x in (norm_word(w) for w in t.split()) if x]


class Quran:
    def __init__(self, quran_js):
        src = open(quran_js, encoding='utf-8').read()
        chapters, _ = json.JSONDecoder().raw_decode(src[src.index('['):])
        self.words, self.where, self.verse_text = [], [], {}
        for ch in chapters:
            for v in ch['verses']:
                key = v['verse_key']
                self.verse_text[key] = v['text_uthmani']
                for w in norm_text(v['text_uthmani']):
                    self.words.append(w)
                    self.where.append(key)
        self.index = defaultdict(list)
        for i, w in enumerate(self.words):
            self.index[w].append(i)
        self.names = {ch['id']: ch['name_arabic'] for ch in chapters}

    def find(self, heard, top=3):
        """Return [(score, [verse keys])] best first."""
        q = norm_text(heard)
        if len(q) < 2:
            return []
        votes = defaultdict(float)
        for i, w in enumerate(q):
            hits = self.index.get(w, [])
            if not hits or len(hits) > 3000:
                continue
            weight = 1.0 / (1 + len(hits) ** 0.5)  # rare words count more
            for p in hits:
                votes[p - i] += weight
        cands = sorted(votes, key=votes.get, reverse=True)[:40]
        qs = ' '.join(q)
        scored = []
        for start in cands:
            best = None
            for s in range(start - 2, start + 3):
                for n in (len(q) - 1, len(q), len(q) + 1):
                    if s < 0 or n < 1 or s + n > len(self.words):
                        continue
                    ws = ' '.join(self.words[s:s + n])
                    r = difflib.SequenceMatcher(None, qs, ws, autojunk=False).ratio()
                    if best is None or r > best[0]:
                        best = (r, s, n)
            if best:
                r, s, n = best
                keys = list(dict.fromkeys(self.where[s:s + n]))
                scored.append((round(r, 3), keys))
        scored.sort(key=lambda x: -x[0])
        out, seen = [], set()
        for r, keys in scored:
            k = tuple(keys)
            if k in seen:
                continue
            seen.add(k)
            out.append((r, keys))
            if len(out) == top:
                break
        return out
