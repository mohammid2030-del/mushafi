"""Match EVERY publisher-indexed verse clip to its own official chapter recording.
QUD is used only for search hints; final timestamps come from official audio waveforms.
No interpolation or unverified reference timing is shipped by this tool.
"""
import importlib.util,concurrent.futures,hashlib,json,gzip,time
from pathlib import Path
spec=importlib.util.spec_from_file_location('calibrate',Path(__file__).with_name('calibrate-complex-timings.py'));c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c);m=c.m;v=c.v
OUT=Path('/workspace/downloads/complex-direct');OUT.mkdir(exist_ok=True)

def clock_bias(target):
 pos=int(target.first+target.kbps*125);i,*_=target.find(target.head,pos);raw=target.head[i:];part=m.pcm(raw);length=min(1200,len(part)//3);anchor=min(2000,len(part)-length)
 if anchor<1000:return 0.
 off,score=m.match_anchor(target.wave,part,anchor,length,0,len(target.wave));assert score>.90,('clock calibration',score)
 return off/m.SR-(i-target.first)/(target.kbps*125)

def process(reader,ch,workers=12):
 f=OUT/reader/f'{ch}.json';f.parent.mkdir(exist_ok=True)
 if f.exists():return
 t=time.time();slug='quran-audio-hafs-'+reader;qd,rough=c.SPECS[reader];source=next(x for x in m.SOURCES if x['slug']==slug);z=next(x for x in source['zip'] if 'ayat' in x);index=m.zip_index(z,slug);entries={x['verse']:x for x in index if x['ch']==ch};q=json.loads(gzip.decompress((Path('/workspace/downloads/qud')/qd/'verse_timestamps.json.gz').read_bytes()));rows=[[int(x[0].split(':')[1]),x[1],x[2]] for x in q['rows'] if x[0].startswith(str(ch)+':') and x[3]]
 assert [r[0] for r in rows]==list(range(1,m.COUNTS[ch]+1));url=json.loads((m.ROOT/(slug+'.json')).read_text())[ch-1]['audio'];target=v.Remote(url);bias=clock_bias(target)
 anchors=[];af=v.OUT/reader/f'{ch}-anchors.json';vf=v.OUT/reader/f'{ch}.json'
 if af.exists():anchors=json.loads(af.read_text())
 elif vf.exists():anchors=json.loads(vf.read_text()).get('anchors',[])
 anchors=[x for x in anchors if 'referenceMs' in x];alpha=rough;beta=0
 def locate(verse,predicted=None,bound=2):
  data=c.clip_data(z,entries[verse]);audio=m.pcm(data);st,en=m.activity(audio)
  if predicted is None:
   if verse==1:lo=0;hi=min(target.duration,max(25,(en-st)/m.SR+20))
   else:lo=max(0,target.duration-len(audio)/m.SR-22);hi=target.duration
  else:lo=max(0,predicted-bound);hi=min(target.duration,predicted+bound+4)
  segment,base=c.window(target,lo,hi);at,checks=c.locate(segment,base,audio,st,en);at+=bias if lo>0 else 0
  return dict(verse=verse,start=round(at*1000),clipSha256=hashlib.sha256(data).hexdigest(),**checks)
 if not anchors:
  first=locate(1);last=locate(len(rows)) if len(rows)>1 else first;anchors=[dict(verse=x['verse'],referenceMs=rows[x['verse']-1][1],officialMs=x['start'],**{k:val for k,val in x.items() if k not in ['verse','start']}) for x in [first,last]]
 anchors=sorted(anchors,key=lambda x:x['referenceMs']);xs=m.np.array([x['referenceMs'] for x in anchors]);ys=m.np.array([x['officialMs'] for x in anchors])
 # Search hints only: no hints become final timestamps without a clip match.
 def predict(r):return float(m.np.interp(r[1],xs,ys))/1000
 cache=f.with_suffix('.partial.json');known={}
 if cache.exists():known={x['verse']:x for x in json.loads(cache.read_text())}
 lock=__import__('threading').Lock();errors=[]
 def run(r):
  verse=r[0]
  if verse in known:return known[verse]
  try:
   try:result=locate(verse,predict(r),2)
   except Exception:result=locate(verse,predict(r),10)
   with lock:known[verse]=result
   return result
  except Exception as e:
   with lock:errors.append((verse,str(e)))
   return None
 with concurrent.futures.ThreadPoolExecutor(workers) as pool:
  for i,result in enumerate(pool.map(run,rows)):
   if i%32==0:
    with lock:cache.write_text(json.dumps(list(known.values()),separators=(',',':')))
 cache.write_text(json.dumps(list(known.values()),separators=(',',':')))
 assert not errors,(reader,ch,errors)
 checks=[known[r[0]] for r in rows];starts=[x['start'] for x in checks];assert all(t>=0 and (not i or t>starts[i-1]) for i,t in enumerate(starts)),(reader,ch,'order')
 timings=[[r[0],starts[i],starts[i+1] if i+1<len(rows) else round(target.duration*1000)] for i,r in enumerate(rows)];assert all(r[2]>r[1] for r in timings)
 f.write_text(json.dumps(dict(url=url,source=source['url'],timings=timings,duration=round(target.duration*1000),method='every-verse-publisher-waveform',clockBiasMs=round(bias*1000,4),validation=checks),separators=(',',':')));cache.unlink();print(reader,ch,'PASS',len(rows),round(time.time()-t,1),'sec',flush=True)

def main():
 import argparse
 ap=argparse.ArgumentParser();ap.add_argument('--reader',required=True);ap.add_argument('--chapters',default='');ap.add_argument('--workers',type=int,default=12);args=ap.parse_args();cs=list(map(int,args.chapters.split(','))) if args.chapters else list(range(1,115));errors=[]
 for ch in cs:
  try:process(args.reader,ch,args.workers)
  except Exception as e:print(args.reader,ch,'FAIL',str(e),flush=True);errors.append((ch,str(e)))
 (OUT/(args.reader+'-errors.json')).write_text(json.dumps(errors));print('FINISHED',args.reader,'errors',len(errors),flush=True)
 if errors:raise SystemExit(1)
if __name__=='__main__':main()
