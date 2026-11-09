"""Promote only complete, verified recordings into the shipped catalog."""
from pathlib import Path
import json,zipfile,shutil,hashlib
P=Path('/workspace/mushafi');D=Path('/workspace/downloads');base=P/'store-release/Mushafi-3.0.55-source.zip'
with zipfile.ZipFile(base) as z:old=json.loads(z.read('assets/surah-audio.json'))
specs=[('muaiqly',133,'ماهر المعيقلي','complex-verified'),('huthify',1001,'علي الحذيفي','complex-verified'),('ayyoub',1002,'محمد أيوب','complex-direct-full'),('muhanna',1003,'خالد المهنا','complex-direct-full'),('akhdar',1004,'إبراهيم الأخضر','complex-direct-full')]
catalog=dict(old);ledger={'version':1,'readers':{},'scope':'Hafs only. Other riwayat require their own canonical text; never highlight Hafs against them.'}
counts={c['id']:c['verses_count'] for c in json.load(open('/workspace/downloads/chapters.json'))['chapters']}
for slug,rid,name,directory in specs:
 reader=dict(name=name,style='حفص عن عاصم · مجمع الملك فهد',chapters={});reports={}
 for ch in range(1,115):
  f=D/directory/slug/f'{ch}.json';assert f.exists(),f;report=json.loads(f.read_text());times=report['timings'];assert [r[0] for r in times]==list(range(1,counts[ch]+1));assert all(r[1]>=0 and r[2]>r[1] and (not i or r[1]>times[i-1][1]) for i,r in enumerate(times));assert report['url'].startswith('https://download.qurancomplex.gov.sa/')
  if directory=='complex-direct-full':assert len(report['validation'])==counts[ch] and report['method']=='every-verse-full-pcm-waveform'
  reader['chapters'][str(ch)]={k:report[k] for k in ['url','timings','source','duration']};reader['chapters'][str(ch)]['sourceVersion']='kfgqpc-v1';reports[str(ch)]=report
 assert sum(len(x['timings']) for x in reader['chapters'].values())==6236;catalog[str(rid)]=reader;ledger['readers'][str(rid)]=reports
(P/'assets/surah-audio.json').write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':')))
(P/'docs/sources/complex-audio-validation.json').write_text(json.dumps(ledger,ensure_ascii=False,separators=(',',':')))
(P/'docs/sources/surah-readers-preserved-3.0.55.json').write_text(json.dumps(old,ensure_ascii=False,separators=(',',':')))
for name in ['muaiqly','huthify','ayyoub','muhanna','akhdar']:
 src=P/'qa/assets/complex55'/f'{name}-1.mp3';src.parent.mkdir(exist_ok=True)
 rid=next(rid for slug,rid,label,directory in specs if slug==name);report=ledger['readers'][str(rid)]['1']
 fixture=Path(f'/workspace/scratch/complex-native55/{name}-1.mp3')
 if 'audioSha256' in report:
  fixture=D/'complex-audio-cache'/(hashlib.sha256(report['url'].encode()).hexdigest()+'.mp3')
  assert hashlib.sha256(fixture.read_bytes()).hexdigest()==report['audioSha256'],('Native fixture digest',name)
 else:
  with zipfile.ZipFile(base) as z:assert fixture.read_bytes()==z.read(f'qa/assets/complex55/{name}-1.mp3'),('Previous native fixture changed',name)
 shutil.copyfile(fixture,src)
print('PASS verified 5 recordings / 570 chapters / 31180 verse timings; 6 previous recordings preserved')
