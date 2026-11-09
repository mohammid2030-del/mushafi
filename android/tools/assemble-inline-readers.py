"""Promote complete, independently addressed verse recordings; never split a chapter by guesses."""
from pathlib import Path
import json,re,struct,hashlib
P=Path(__file__).resolve().parents[1];D=Path('/workspace/downloads');S=Path('/workspace/scratch')
chapters=json.JSONDecoder().raw_decode((P/'assets/quran.js').read_text()[len('const chapters='):])[0]
keys={v['verse_key'] for c in chapters for v in c['verses']};counts={c['id']:len(c['verses']) for c in chapters}
catalog=json.loads((P/'assets/audio-index.json').read_text());full=json.loads((P/'assets/surah-audio.json').read_text());evidence={'readers':{},'preserved':json.loads((P/'docs/sources/inline-readers-3.0.63.json').read_text()).get('preserved',{})}
for rid,folder in [(3,'Abdurrahmaan_As-Sudais_192kbps'),(1001,'Hudhaify_128kbps')]:
 raw=(S/(folder+'-index.html')).read_text();files=set(re.findall(r'href="/data/'+re.escape(folder)+r'/(\d{6})\.mp3"',raw));urls={k:'https://everyayah.com/data/'+folder+'/'+''.join(f'{int(n):03d}' for n in k.split(':'))+'.mp3' for k in keys};assert all(u.rsplit('/',1)[-1][:-4] in files for u in urls.values()),folder
 catalog[str(rid)]={'name':full[str(rid)]['name'],'urls':urls};evidence['readers'][str(rid)]={'source':'https://everyayah.com/data/'+folder+'/','listingSha256':hashlib.sha256(raw.encode()).hexdigest(),'count':len(urls)}
sources=json.loads((S/'complex-sources.json').read_text())
for rid,slug in [(1002,'ayyoub'),(1003,'muhanna'),(1004,'akhdar')]:
 source=next(x for x in sources if x['slug']=='quran-audio-hafs-'+slug);url=next(x for x in source['zip'] if 'ayat' in x);b=(D/'complex-timings'/('quran-audio-hafs-'+slug+'-central.bin')).read_bytes();entries={};i=0
 while (i:=b.find(b'PK\x01\x02',i))>=0:
  n,e,c=struct.unpack_from('<3H',b,i+28);name=b[i+46:i+46+n];match=re.search(rb'(?:/|^)(?:10-)?(\d{3})(\d{3})-[^/]+\.mp3$',name,re.I)
  if match and name.endswith({'ayyoub':b'-A03.mp3','muhanna':b'-A06.mp3','akhdar':b'-A02.mp3'}[slug]):
   ch,v=map(int,match.groups())
   if slug=='muhanna' and b'/110 An-Nasr ' in name and ch==109 and 1<=v<=3:ch=110
   key=f'{ch}:{v}'
   if key in keys:
    assert key not in entries
    entries[key]=[struct.unpack_from('<I',b,i+42)[0],struct.unpack_from('<I',b,i+20)[0],struct.unpack_from('<I',b,i+24)[0],struct.unpack_from('<I',b,i+16)[0],struct.unpack_from('<H',b,i+10)[0]]
  i+=46+n+e+c
 assert entries.keys()==keys
 for ch in range(1,115):
  report=json.loads((D/'complex-direct-full'/slug/f'{ch}.json').read_text());assert len(report['validation'])==counts[ch]
  for v in report['validation']:entries[f'{ch}:{v["verse"]}'].append(v['clipSha256'])
 assert all(len(x)==6 and x[4] in [0,8] and x[1]>100 and x[2]>100 for x in entries.values())
 size=json.loads((D/'complex-http-cache'/hashlib.sha256(url.encode()).hexdigest()/'metadata.json').read_text())['size'];catalog[str(rid)]={'name':full[str(rid)]['name'],'urls':{},'archive':url,'archiveSize':size,'entries':entries};evidence['readers'][str(rid)]={'source':source['url'],'archive':url,'archiveSize':size,'centralSha256':hashlib.sha256(b).hexdigest(),'count':len(entries),'validation':'All individual clip SHA256 values from previously verified publisher waveform evidence. Only the documented Muhanna 110/109 label anomaly is normalized.'}
assert catalog.keys()==full.keys()
for rid,data in catalog.items():assert set(data['urls'])|set(data.get('entries',{}))==keys
text=json.dumps(catalog,ensure_ascii=False,separators=(',',':'));(P/'assets/audio-index.json').write_text(text);(P/'assets/audio-index.js').write_text('const audioIndex='+text+';\nconst audioReaderOrder=[...[7,133,6,2].filter(id=>audioIndex[id]),...Object.keys(audioIndex).map(Number).filter(id=>![7,133,6,2].includes(id))];\n');(P/'docs/sources/inline-readers-3.0.63.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2))
print('PASS: 9 readers, 56124 independently addressed verses; 18708 publisher clip SHA256 values and 12472 additional listed EveryAyah files; all four prior catalogs preserved.')
