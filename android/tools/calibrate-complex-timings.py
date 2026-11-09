"""Calibrate complete CC-BY QUD timestamps to official chapter recordings.
Use the publisher's independently indexed verse clips as waveform anchors in each chapter.
Fail closed on missing verses, ambiguous matches, non-affine edits or excessive residuals.
"""
import importlib.util,json,gzip,hashlib,concurrent.futures,zlib,struct,re,time
from pathlib import Path
from scipy.signal import resample
spec=importlib.util.spec_from_file_location('verify',Path(__file__).with_name('verify-complex-recordings.py'));v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v);m=v.m
SPECS={'ayyoub':('mohammed_ayyub_drive',1.012),'muhanna':('khalid_al_mohana_drive',1.),'akhdar':('ibrahim_al_akhdar_drive',1.012)}

def window(target,lo,hi):
 lo=max(0,lo);hi=min(target.duration,hi)
 if lo==0:
  data=m.raw_fetch(target.url,f'0-{min(target.size-1,int(target.first+hi*target.kbps*125))}');return m.pcm(data),0.
 start=int(target.first+lo*target.kbps*125);end=min(target.size-1,int(target.first+hi*target.kbps*125));data=m.raw_fetch(target.url,f'{start}-{end}');i,*_=target.find(data,0);return m.pcm(data[i:]),(start+i-target.first)/(target.kbps*125)

def clip_data(z,entry):
 cached=Path('/workspace/downloads/complex-clips')/hashlib.sha256((z+str(entry['offset'])).encode()).hexdigest();cached.parent.mkdir(exist_ok=True)
 if cached.exists():return cached.read_bytes()
 lo=entry['offset'];b=m.fetch(z,f"{lo}-{lo+entry['size']+1024}");assert b[:4]==b'PK\x03\x04';n,e=struct.unpack_from('<2H',b,26);method=struct.unpack_from('<H',b,8)[0];data=b[30+n+e:30+n+e+entry['size']];data=zlib.decompress(data,-15) if method==8 else data;assert zlib.crc32(data)&0xffffffff==entry['crc'];cached.write_bytes(data);return data

def _locate(target,base,a,st,en,primary_rank=0,first_seconds=1.5,search_clock=False):
 from scipy.ndimage import map_coordinates
 def warp(samples,alpha):
  # Integer output-length resampling quantizes a 400 ms anchor's clock scale.
  # Use the actual fractional sample clock instead, retaining sub-sample scale.
  return map_coordinates(samples,[m.np.arange(round(len(samples)*alpha))/alpha],order=3,mode='nearest',prefilter=True)
 sr=m.SR;length=min(int(.4*sr),max(int(.18*sr),(en-st)//4))
 first_stop=min(en-length,st+int(first_seconds*sr));first_candidates=list(range(st,max(st+1,first_stop+1),max(1,int(.05*sr))))
 ranked_first=sorted(first_candidates,key=lambda t:float(m.np.dot(a[t:t+length],a[t:t+length])),reverse=True)
 spaced_first=[]
 for point in ranked_first:
  if all(abs(point-old)>=length//2 for old in spaced_first):spaced_first.append(point)
 assert primary_rank<len(spaced_first),'No further independent primary window'
 anchor=spaced_first[primary_rank];part=a[anchor:anchor+length].astype(float)
 def one(alpha):
  needle=warp(part,alpha);matches=[]
  for polarity in [1,-1]:
   off,score=m.match_anchor(target,needle*polarity,0,len(needle),0,len(target));matches.append((off,score,alpha,polarity))
  return max(matches,key=lambda x:x[1])
 best=one(1.)
 if search_clock or best[1]<.78:
  best=max((one(float(alpha)) for alpha in m.np.arange(.975,1.02501,.0005)),key=lambda x:x[1])
  centre=best[2];best=max([best]+[one(float(alpha)) for alpha in m.np.arange(centre-.0005,centre+.000501,.00005)],key=lambda x:x[1])
 pos,score,alpha,polarity=best
 first_end=anchor+length
 low=min(en-length,first_end);high=min(en-length,anchor+int(8*sr))
 candidates=list(range(low,max(low+1,high+1),max(1,int(.05*sr))))
 if not candidates:candidates=[min(en-length,anchor+length)]
 # Pick voiced reference windows before looking at the chapter match. Silence is not evidence.
 ranked=sorted(candidates,key=lambda t:float(m.np.dot(a[t:t+length],a[t:t+length])),reverse=True)
 spaced=[]
 for point in ranked:
  if all(abs(point-old)>=length//2 for old in spaced):spaced.append(point)
  if len(spaced)>=40:break
 choices=[]
 for point in spaced:
  needle2=warp(a[point:point+length].astype(float),alpha)*polarity;expected=pos+(point-anchor)*alpha
  try:
   off2,score2=m.match_anchor(target,needle2,0,len(needle2),max(0,expected-int(.20*sr)),min(len(target),expected+len(needle2)+int(.20*sr)))
   if score>=.70 and score2<.65:
    # Independently encoded clips can have a slightly different local clock.
    # Prove the second window at its own fractional scale; still require its
    # actual location to agree with the first window's clock and offset.
    for local_alpha in m.np.arange(alpha-.003,alpha+.00301,.00025):
     alternative=warp(a[point:point+length].astype(float),float(local_alpha))*polarity
     candidate,quality=m.match_anchor(target,alternative,0,len(alternative),max(0,expected-int(.20*sr)),min(len(target),expected+len(alternative)+int(.20*sr)))
     if quality>score2 and abs(candidate-expected)<=.12*sr:off2,score2=candidate,quality
   candidate_scale=(off2-pos)/(point-anchor) if point!=anchor else alpha
   if abs(off2-expected)<=.12*sr and .975<=candidate_scale<=1.025:choices.append((score2,off2,point,expected))
  except ValueError:continue
 assert choices,dict(score=score,alpha=alpha,error='No independent voiced anchor')
 score2,off2,anchor2,expected=max(choices)
 assert score>=.70 and score2>=.65,dict(score=score,lateScore=score2,alpha=alpha,driftMs=(off2-expected)*1000/sr)
 fitted=(off2-pos)/(anchor2-anchor) if anchor2!=anchor else alpha
 assert .975<=fitted<=1.025,fitted
 at=base+(pos+(st-anchor)*fitted)/sr
 return at,dict(score=round(score,6),lateScore=round(score2,6),clipScale=round(fitted,7),clipStartMs=round(st*1000/sr),waveformPolarity=polarity)

def locate(target,base,a,st,en):
 failure=None
 # Retry with independently selected voiced primary windows, without changing
 # correlation, clock or consistency thresholds. A codec phase difference in
 # one window cannot stand in for proof of the full recording.
 attempts=[(1.5,range(6)),(3.,range(13))] if len(target)<=60*m.SR else [(1.5,range(2))]
 for seconds,ranks in attempts:
  for rank in ranks:
   try:return _locate(target,base,a,st,en,rank,seconds)
   except (AssertionError,ValueError) as error:failure=error
 for rank in range(2):
  try:return _locate(target,base,a,st,en,rank,1.5,True)
  except (AssertionError,ValueError) as error:failure=error
 raise failure

def process(reader,c):
 f=v.OUT/reader/f'{c}.json';f.parent.mkdir(exist_ok=True)
 if f.exists():return
 slug='quran-audio-hafs-'+reader;qd,rough=SPECS[reader];source=next(s for s in m.SOURCES if s['slug']==slug);z=next(x for x in source['zip'] if 'ayat' in x);entries=m.zip_index(z,slug);byv={e['verse']:e for e in entries if e['ch']==c};assert len(byv)==m.COUNTS[c]
 qfile=Path('/workspace/downloads/qud')/qd/'verse_timestamps.json.gz';q=json.loads(gzip.decompress(qfile.read_bytes()));rows=[[int(x[0].split(':')[1]),x[1],x[2]] for x in q['rows'] if x[0].startswith(str(c)+':') and x[3]];assert [r[0] for r in rows]==list(range(1,m.COUNTS[c]+1))
 url=json.loads((m.ROOT/(slug+'.json')).read_text())[c-1]['audio'].replace('http:','https:');target=v.Remote(url);samples=list(dict.fromkeys([1,len(rows),1+len(rows)//4,1+len(rows)//2,1+len(rows)*3//4]));anchors=[];beta=0
 for verse in samples:
  data=clip_data(z,byv[verse]);a=m.pcm(data);st,en=m.activity(a);ref=rows[verse-1][1]/1000;predicted=ref*rough+beta
  if verse==1:audio,base=window(target,0,min(target.duration,max(25,predicted+(en-st)/m.SR+15)))
  elif verse==len(rows):audio,base=window(target,max(0,target.duration-len(a)/m.SR-22),target.duration)
  else:audio,base=window(target,max(0,predicted-6),min(target.duration,predicted+(en-st)/m.SR+8))
  at,checks=locate(audio,base,a,st,en)
  anchors.append(dict(verse=verse,referenceMs=round(ref*1000),officialMs=round(at*1000),clipSha256=hashlib.sha256(data).hexdigest(),**checks))
  if verse==1:beta=at-ref*rough
  elif verse==len(rows) and verse>1:
   rough=(anchors[-1]['officialMs']-anchors[0]['officialMs'])/(anchors[-1]['referenceMs']-anchors[0]['referenceMs']);beta=(anchors[0]['officialMs']-rough*anchors[0]['referenceMs'])/1000
 (v.OUT/reader/f'{c}-anchors.json').write_text(json.dumps(anchors,separators=(',',':')))
 xs=m.np.array([a['referenceMs'] for a in anchors]);ys=m.np.array([a['officialMs'] for a in anchors])
 if len(anchors)>=2:
  alpha,shift=m.np.polyfit(xs,ys,1)
 else:alpha=rough;shift=ys[0]-rough*xs[0]
 residuals=ys-(xs*alpha+shift);maximum=float(abs(residuals).max());assert .975<=alpha<=1.025 and maximum<=200,(reader,c,'nonlinear/unmatched',alpha,shift,maximum,anchors)
 timings=[[verse,max(0,round(start*alpha+shift)),max(0,round(end*alpha+shift))] for verse,start,end in rows]
 assert all(x[2]>x[1] and (not i or x[1]>timings[i-1][1]) for i,x in enumerate(timings));assert timings[-1][2]<=target.duration*1000+500,(reader,c,'end',timings[-1],target.duration)
 f.write_text(json.dumps(dict(url=url,source=source['url'],timingSource='https://github.com/QUD-Technologies/quranic-universal-audio/releases/tag/v4.0.0',timingAsset=qd,referenceTimingSha256=hashlib.sha256(qfile.read_bytes()).hexdigest(),timings=timings,duration=round(target.duration*1000),scale=round(float(alpha),9),offsetMs=round(float(shift),3),maxAnchorResidualMs=round(maximum,3),anchors=anchors),separators=(',',':')))
 print(reader,c,'PASS',len(rows),'residual',round(maximum,1),flush=True)

def main():
 import argparse
 ap=argparse.ArgumentParser();ap.add_argument('--reader',required=True);ap.add_argument('--chapters',default='');ap.add_argument('--workers',type=int,default=4);args=ap.parse_args();cs=list(map(int,args.chapters.split(','))) if args.chapters else list(range(1,115))
 def task(c):
  try:process(args.reader,c)
  except Exception as e:print(args.reader,c,'FAIL',str(e),flush=True);return c,str(e)
 errors=[x for x in concurrent.futures.ThreadPoolExecutor(args.workers).map(task,cs) if x];(v.OUT/(args.reader+'-calibration-errors.json')).write_text(json.dumps(errors));print('FINISHED',args.reader,'errors',len(errors),flush=True)
 if errors:raise SystemExit(1)
if __name__=='__main__':main()
