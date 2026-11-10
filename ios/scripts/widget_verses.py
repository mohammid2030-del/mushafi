"""Builds the verse list for the iOS verse widget from the app's own Quran text."""
import json, re, sys
assets, out = sys.argv[1], sys.argv[2]
src = open(f"{assets}/quran.js", encoding="utf-8").read()
chapters = json.loads(src[src.index("["): src.rindex("]") + 1])
en = json.load(open(f"{assets}/quran-english-meanings.json", encoding="utf-8"))["verses"]
keys = """94:5 94:6 2:152 2:153 2:186 3:139 3:173 13:28 14:7 15:49 16:128 20:114 28:24 29:69 33:41 40:60
49:10 55:13 65:2 65:3 93:3 93:5 94:7 94:8 2:45 2:155 47:7 39:10 3:200 8:46 11:115 12:87 16:97 17:24 20:46
21:83 25:63 25:74 26:80 29:45 33:56 35:15 39:53 41:30 42:19 50:16 51:56 57:4 64:11 67:2 73:20 2:201 3:8
59:10 66:11 112:1 103:1 108:1 7:56 11:88 17:80 18:10 23:118 3:191 4:28 6:162 9:51 10:62 12:86 31:17""".split()
by_key = {v["verse_key"]: (c, v) for c in chapters for v in c["verses"]}
order, ar, english, names, names_en = [], {}, {}, {}, {}
for k in keys:
    if k not in by_key or k in ar:
        continue
    c, v = by_key[k]
    text = v["text_uthmani"].strip()
    if len(text) > 190:
        continue
    order.append(k); ar[k] = text; english[k] = en.get(k, ""); names[k] = c["name_arabic"]; names_en[k] = c["name_simple"]
json.dump({"order": order, "ar": ar, "en": english, "surah": names, "surahEn": names_en}, open(out, "w", encoding="utf-8"), ensure_ascii=False)
print(len(order), "verses")
