"""Verify the official recordings against timed reference recordings before reusing timestamps.
Checks every chapter's sequence, duration and multiple distant waveform anchors. Fails closed.
Does not claim a human review of every spoken boundary. Reference timestamps remain attributed.
"""
import importlib.util,json,re,hashlib,concurrent.futures,io,struct,math,threading,gzip
from pathlib import Path
spec=importlib.util.spec_from_file_location('alignment',Path(__file__).with_name('align-complex-audio.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
OUT=Path('/workspace/downloads/complex-verified');OUT.mkdir(exist_ok=True)
SPECS={'muaiqly':(133,'maher-muaiqly/r3'),'huthify':(74,'ali-hudhaifi/r1'),'ayyoub':(109,'muhammad-ayyub/r1'),'muhanna':(159,'khalid-mohanna/r1'),'akhdar':(1,'ibrahim-akhdar/r1')}
class Remote:
 def __init__(self,url):
  self.url=url;self.head=m.raw_fetch(url,'0-131071');h=m.raw_fetch(url,head=True).decode('latin1');self.size=int(re.findall(r'(?im)^content-length:\s*(\d+)',h)[-1]);b=self.head
  offset=10+sum((b[6+i]&127)<<(7*(3-i)) for i in range(4)) if b[:3]==b'ID3' else 0
  if offset+32768>len(b):self.head=m.raw_fetch(url,f'0-{offset+131071}');b=self.head
  self.first,self.kbps,self.rate,self.spf,self.frame=self.find(b,offset)
  raw=b[self.first:self.first+self.frame];x=next((raw.find(t) for t in [b'Xing',b'Info'] if raw.find(t)>=0),-1)
  self.frames=None
  if x>=0:
   flags=struct.unpack_from('>I',raw,x+4)[0]
   if flags&1:self.frames=struct.unpack_from('>I',raw,x+8)[0]
  self.duration=self.frames*self.spf/self.rate if self.frames else (self.size-self.first)*8/(self.kbps*1000)
  self.wave=m.pcm(self.head)
 def find(self,b,start):
  for i in range(start,len(b)-4):
   h=int.from_bytes(b[i:i+4],'big');ver=(h>>19)&3;layer=(h>>17)&3;bi=(h>>12)&15;si=(h>>10)&3
   if h>>21!=2047 or ver==1 or layer!=1 or bi in [0,15] or si==3:continue
   kbps=([0,32,40,48,56,64,80,96,112,128,160,192,224,256,320][bi] if ver==3 else [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160][bi]);rate=[44100,48000,32000][si]//(1 if ver==3 else 2 if ver==2 else 4);spf=1152 if ver==3 else 576;size=int((144 if ver==3 else 72)*kbps*1000/rate)+((h>>9)&1)
   if i+size+4>len(b):continue
   j=i+size;consistent=True
   for _ in range(3):
    if j+4>len(b):consistent=False;break
    h2=int.from_bytes(b[j:j+4],'big');bi2=(h2>>12)&15
    if (h2>>21)!=2047 or ((h2>>19)&3)!=ver or ((h2>>17)&3)!=layer or ((h2>>10)&3)!=si or bi2!=bi:consistent=False;break
    j+=int((144 if ver==3 else 72)*kbps*1000/rate)+((h2>>9)&1)
   if not consistent:continue
   if hasattr(self,'kbps') and (kbps!=self.kbps or rate!=self.rate):continue
   return i,kbps,rate,spf,size
  raise ValueError('No valid MP3 audio frames')
 def window(self,seconds):
  if seconds+2<len(self.wave)/m.SR:return self.wave,0.
  start=max(self.first,int(self.first+(seconds-1.3)*self.kbps*1000/8));end=min(self.size-1,int(start+self.kbps*1000/8*5))
  data=m.raw_fetch(self.url,f'{start}-{end}');i,kbps,rate,spf,sz=self.find(data,0);assert kbps==self.kbps and rate==self.rate
  base=(start+i-self.first)*8/(self.kbps*1000)
  return m.pcm(data[i:]),base

def compare(ref,target,second,initial=False):
 a,ab=ref.window(second);b,bb=target.window(second);sr=m.SR
 if initial:
  # Strong voiced window in the beginning; full start decoding defines the actual offset.
  n=min(len(a),len(b))-int(.7*sr);assert n>sr
  aenv=m.np.convolve(a[:n].astype(float)**2,m.np.ones(400),mode='valid');at=int(m.np.argmax(aenv));at=max(int(.35*sr),min(at,n-int(.45*sr)));length=int(.4*sr)
 else:at=max(int(.45*sr),int((second-ab)*sr));length=int(.4*sr)
 at=min(at,len(a)-length-1);expected=at+(ab-bb)*sr
 offset,score=m.match_anchor(b,a,at,length,max(0,expected-.8*sr),min(len(b),expected+length+.8*sr))
 # Verify a second, nonidentical sample within the same distant window.
 at2=min(len(a)-length-1,at+int(.55*sr));expected2=at2+(ab-bb)*sr
 offset2,score2=m.match_anchor(b,a,at2,length,max(0,expected2-.8*sr),min(len(b),expected2+length+.8*sr))
 delta=(offset/sr+bb-ab);delta2=(offset2/sr+bb-ab)
 assert score>=.70 and score2>=.65 and abs(delta-delta2)<=.045,dict(second=second,score=score,score2=score2,delta=delta,delta2=delta2)
 return dict(second=round(second,3),score=round(score,6),secondScore=round(score2,6),deltaMs=round(delta*1000,3))

def process(reader,c):
 f=OUT/reader/f'{c}.json';f.parent.mkdir(exist_ok=True)
 if f.exists():return
 rid,folder=SPECS[reader];slug='quran-audio-hafs-'+reader;tracks=json.loads((m.ROOT/(slug+'.json')).read_text());url=tracks[c-1]['audio'].replace('http:','https:');reference='https://cdn.mp3quran.net/audio/'+folder+f'/{c:03}.mp3';timingurl=f'https://mp3quran.net/api/v3/ayat_timing?surah={c}&read={rid}'
 tf=OUT/f'{rid}-{c}-timing.json'
 if tf.exists():data=json.loads(tf.read_text())
 else:data=json.loads(m.raw_fetch(timingurl));tf.write_text(json.dumps(data,separators=(',',':')))
 rows=[[int(x['ayah']),round(x['start_time']),round(x['end_time'])] for x in data if int(x['ayah'])>0]
 if reader=='huthify':
  q=json.loads(gzip.decompress(Path('/workspace/downloads/qud/ali_al_huthaifi_mp3quran/verse_timestamps.json.gz').read_bytes()))
  rows=[[int(x[0].split(':')[1]),x[1],x[2]] for x in q['rows'] if x[0].startswith(str(c)+':') and x[3]];timingurl='https://github.com/QUD-Technologies/quranic-universal-audio/releases/tag/v4.0.0'
 assert [r[0] for r in rows]==list(range(1,m.COUNTS[c]+1)),(reader,c,'sequence')
 assert all(x[1]>=0 and x[2]>x[1] and (not i or x[1]>=rows[i-1][1]) for i,x in enumerate(rows))
 ref=Remote(reference);target=Remote(url);assert abs(ref.duration-target.duration)<.16,(reader,c,'duration',ref.duration,target.duration)
 first=compare(ref,target,1,initial=True);anchors=[first]
 for portion in [.22,.47,.72,.94]:
  row=rows[min(len(rows)-1,int(len(rows)*portion))];seconds=(row[1]+min(1800,max(500,(row[2]-row[1])*.3)))/1000
  if seconds+2<min(ref.duration,target.duration):anchors.append(compare(ref,target,seconds))
 shift=first['deltaMs'];assert all(abs(a['deltaMs']-shift)<=80 for a in anchors),(reader,c,anchors)
 shifted=[[v,max(0,round(st+shift)),max(0,round(en+shift))] for v,st,en in rows]
 assert shifted[-1][1]<target.duration*1000 and shifted[-1][2]<=target.duration*1000+350,(reader,c,'end',shifted[-1],target.duration)
 f.write_text(json.dumps(dict(url=url,source='https://qurancomplex.gov.sa/'+slug+'/',reference=reference,timingSource=timingurl,referenceTimingSha256=hashlib.sha256(json.dumps(data,separators=(',',':')).encode()).hexdigest(),timings=shifted,duration=round(target.duration*1000),offsetMs=shift,anchors=anchors),separators=(',',':')))
 print(reader,c,'PASS',len(rows),'offset',shift,flush=True)

def main():
 import argparse
 ap=argparse.ArgumentParser();ap.add_argument('--reader',default='muaiqly');ap.add_argument('--chapters',default='');ap.add_argument('--workers',type=int,default=6);args=ap.parse_args();cs=[int(x) for x in args.chapters.split(',')] if args.chapters else list(range(1,115))
 def run(c):
  try:process(args.reader,c)
  except Exception as e:print(args.reader,c,'FAIL',str(e),flush=True);return c,str(e)
 errors=[x for x in concurrent.futures.ThreadPoolExecutor(args.workers).map(run,cs) if x];(OUT/(args.reader+'-errors.json')).write_text(json.dumps(errors));print('FINISHED',args.reader,'errors',len(errors),flush=True)
 if errors:raise SystemExit(1)
if __name__=='__main__':main()
