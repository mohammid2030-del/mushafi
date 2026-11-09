from pathlib import Path
import json
P=Path(__file__).resolve().parents[1]
full=json.loads((P/'assets/surah-audio.json').read_text());inline=json.loads((P/'assets/audio-index.json').read_text());tracks={};unavailable=[]
for c in range(1,115):
 d=json.loads((P/f'docs/sources/nafees-mp3quran/{c}.json').read_text())
 tracks[str(c)]={'url':d['url'],'source':'MP3Quran · تلاوة السورة الكاملة','sourceVersion':'mp3quran-nafees-v1','duration':d['headerDurationMs'],'verseCount':len(d['timings']),'timings':[],'audioOffsetMs':0,'trimToTimings':False,'verseTimingVerified':False,'timelineRevision':'full-file-v2'}
 unavailable.extend(f'{c}:{v}' for v,_,_ in d['timings'])
full['1005']={'name':'أحمد النفيس','style':'حفص عن عاصم · MP3Quran','chapters':tracks}
inline['1005']={'name':'أحمد النفيس','urls':{},'verseTimingVerified':False,'unavailable':unavailable}
for name,data in [('surah-audio.json',full),('audio-index.json',inline)]:
 (P/'assets'/name).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
p=P/'assets/audio-index.js';old=p.read_text();p.write_text('const audioIndex='+json.dumps(inline,ensure_ascii=False,separators=(',',':'))+';'+old[old.index('\nconst audioReaderOrder='):])
print('114 complete chapters; zero unverified verse segments. Publisher timing reports retained for diagnosis only.')
