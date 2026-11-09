"""Verify every verse against fully decoded official chapters (no byte-clock estimates)."""
import importlib.util,json,gzip,time,concurrent.futures
from pathlib import Path
sp=importlib.util.spec_from_file_location('direct',Path(__file__).with_name('time-complex-verses.py'));d=importlib.util.module_from_spec(sp);sp.loader.exec_module(d);c=d.c;m=d.m;v=d.v
OUT=Path('/workspace/downloads/complex-direct-full');OUT.mkdir(exist_ok=True)
def process(reader,ch):
 f=OUT/reader/f'{ch}.json';f.parent.mkdir(exist_ok=True)
 if f.exists():
  try:
   saved=json.loads(f.read_text());assert len(saved['timings'])==m.COUNTS[ch] and len(saved['validation'])==m.COUNTS[ch];return
  except (ValueError,KeyError,AssertionError):f.unlink()
 t=time.time();print(reader,ch,'checking publisher files',flush=True);slug='quran-audio-hafs-'+reader;qd,rough=c.SPECS[reader];source=next(x for x in m.SOURCES if x['slug']==slug);z=next(x for x in source['zip'] if 'ayat' in x);index=m.zip_index(z,slug)
 clips=dict(m.chapter_from_zip(z,index,ch));assert sorted(clips)==list(range(1,m.COUNTS[ch]+1));url=json.loads((m.ROOT/(slug+'.json')).read_text())[ch-1]['audio'];raw=m.fetch(url);audio=m.pcm(raw);duration=len(audio)*1000/m.SR
 with m.av.open(m.io.BytesIO(raw)) as probe:declared=probe.duration/1000 if probe.duration else duration
 assert abs(declared-duration)<350,(reader,ch,'decoder clock discrepancy',declared,duration)
 q=json.loads(gzip.decompress((Path('/workspace/downloads/qud')/qd/'verse_timestamps.json.gz').read_bytes()));rows=[[int(x[0].split(':')[1]),x[1],x[2]] for x in q['rows'] if x[0].startswith(str(ch)+':') and x[3]];assert [r[0] for r in rows]==sorted(clips)
 def locate(verse,expected=None,bound=2):
  clip=m.pcm(clips[verse]);st,en=m.activity(clip)
  if expected is None:
   if verse==1:lo=0;hi=min(len(audio),int((max(25,(en-st)/m.SR+20))*m.SR))
   else:lo=max(0,len(audio)-len(clip)-int(22*m.SR));hi=len(audio)
  else:lo=max(0,round((expected-bound)*m.SR));hi=min(len(audio),round((expected+bound+4)*m.SR))
  at,checks=c.locate(audio[lo:hi],lo/m.SR,clip,st,en);return dict(verse=verse,start=round(at*1000),clipSha256=m.hashlib.sha256(clips[verse]).hexdigest(),**checks)
 known={};partial=f.with_suffix('.partial.json')
 if partial.exists():known.update({x['verse']:x for x in json.loads(partial.read_text())})
 # A phase-edited endpoint must not prevent verification of the interior.
 # Search inward for two proven anchors; failed endpoints get the same full
 # acoustic verification as any other missing verse below.
 for sequence in [rows,list(reversed(rows))]:
  for r in sequence:
   if r[0] in known:break
   try:
    if r[0] in [1,len(rows)]:known[r[0]]=locate(r[0])
    else:
     anchor=next(iter(known.values()),None)
     predicted=r[1]*rough/1000
     if anchor:predicted=anchor['start']/1000+(r[1]-rows[anchor['verse']-1][1])*rough/1000
     known[r[0]]=locate(r[0],predicted,90)
    break
   except (AssertionError,ValueError):continue
 anchors=sorted(v for v in known if not known[v].get('verification','').startswith('spectral-dtw'));assert anchors,'No verified search anchors'
 xs=[rows[v-1][1] for v in anchors];ys=[known[v]['start'] for v in anchors]
 errors=[]
 for r in rows:
  verse=r[0]
  if verse in known:continue
  predicted=float(m.np.interp(r[1],xs,ys))/1000
  if len(xs)>1 and r[1]<xs[0]:predicted=(ys[0]+(r[1]-xs[0])*(ys[1]-ys[0])/(xs[1]-xs[0]))/1000
  if len(xs)>1 and r[1]>xs[-1]:predicted=(ys[-1]+(r[1]-xs[-1])*(ys[-1]-ys[-2])/(xs[-1]-xs[-2]))/1000
  try:
   try:result=locate(verse,predicted,2)
   except Exception:
    try:result=locate(verse,predicted,12)
    except Exception:
     try:result=locate(verse,predicted,90)
     except Exception:
      if len(audio)>180*m.SR:raise
      clip=m.pcm(clips[verse]);st,en=m.activity(clip);at,checks=c.locate(audio,0,clip,st,en)
      result=dict(verse=verse,start=round(at*1000),clipSha256=m.hashlib.sha256(clips[verse]).hexdigest(),**checks)
   known[verse]=result
  except Exception as e:errors.append([verse,str(e)])
  if verse%32==0:partial.write_text(json.dumps(list(known.values()),separators=(',',':')))
 partial.write_text(json.dumps(list(known.values()),separators=(',',':')))
 if errors:
  spectral_spec=importlib.util.spec_from_file_location('spectral',Path(__file__).with_name('complex-spectral-verification.py'));spectral=importlib.util.module_from_spec(spectral_spec);spectral_spec.loader.exec_module(spectral);remaining=[]
  for verse,error in errors:
   try:known[verse]=spectral.verify(m,audio,clips,known,verse)
   except Exception as e:remaining.append([verse,str(e)])
  errors=remaining;partial.write_text(json.dumps(list(known.values()),separators=(',',':')))
 assert not errors,(reader,ch,errors)
 checks=[known[r[0]] for r in rows];starts=[x['start'] for x in checks];assert all(p>=0 and (not i or p>starts[i-1]) for i,p in enumerate(starts)),(reader,ch,'order')
 times=[[r[0],starts[i],starts[i+1] if i+1<len(rows) else round(duration)] for i,r in enumerate(rows)];assert all(r[2]>r[1] for r in times)
 temporary=f.with_suffix('.tmp');temporary.write_text(json.dumps(dict(url=url,source=source['url'],timings=times,duration=round(duration),audioSha256=m.hashlib.sha256(raw).hexdigest(),method='every-verse-full-pcm-waveform',validation=checks),separators=(',',':')));temporary.replace(f);partial.unlink();
 if ch not in [1,2,18,67,114]:
  (m.CACHE/(m.hashlib.sha256(url.encode()).hexdigest()+'.mp3')).unlink(missing_ok=True)
  (m.CACHE/(m.hashlib.sha256((z+':'+str(ch)).encode()).hexdigest()+'.clips.zip')).unlink(missing_ok=True)
 print(reader,ch,'PASS',len(rows),round(time.time()-t,1),'sec',flush=True)
def main():
 import argparse
 ap=argparse.ArgumentParser();ap.add_argument('--reader',required=True);ap.add_argument('--chapters',default='');ap.add_argument('--workers',type=int,default=1);a=ap.parse_args();cs=list(map(int,a.chapters.split(','))) if a.chapters else list(range(114,0,-1))
 def run(ch):
  try:process(a.reader,ch)
  except Exception as e:print(a.reader,ch,'FAIL',str(e),flush=True);return ch,str(e)
 errors=[e for e in concurrent.futures.ThreadPoolExecutor(a.workers).map(run,cs) if e];(OUT/(a.reader+'-errors.json')).write_text(json.dumps(errors));print('FINISHED',a.reader,'errors',len(errors),flush=True)
 if errors:raise SystemExit(1)
if __name__=='__main__':main()
