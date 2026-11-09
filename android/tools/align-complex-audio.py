"""Derive chapter timestamps by matching the publisher's own verse waveforms.
Never estimate timestamps from text length or another reciter. Fail closed on ambiguity.
Requires numpy/scipy/PyAV; uses curl with inherited proxy and TLS verification.
"""
from pathlib import Path
from contextlib import contextmanager
import argparse,concurrent.futures,hashlib,io,json,re,struct,subprocess,time,zlib,threading,zipfile,tempfile,os,fcntl
import av,numpy as np
from scipy.signal import correlate
ROOT=Path('/workspace/scratch');OUT=Path('/workspace/downloads/complex-timings');OUT.mkdir(exist_ok=True)
SOURCES=json.loads((ROOT/'complex-sources.json').read_text())
COUNTS={c['id']:c['verses_count'] for c in json.load(open('/workspace/downloads/chapters.json'))['chapters']}
SR=4000

NETWORK=threading.Semaphore(32)
CACHE=Path('/workspace/downloads/complex-audio-cache');CACHE.mkdir(exist_ok=True)
HTTP_CACHE=Path('/workspace/downloads/complex-http-cache');HTTP_CACHE.mkdir(exist_ok=True)
@contextmanager
def network_slot():
 folder=Path('/workspace/scratch/complex-network-slots');folder.mkdir(exist_ok=True)
 files=[open(folder/str(i),'a') for i in range(8)];held=None
 try:
  while held is None:
   for file in files:
    try:fcntl.flock(file,fcntl.LOCK_EX|fcntl.LOCK_NB);held=file;break
    except BlockingIOError:pass
   if held is None:time.sleep(.1)
  yield
 finally:
  if held is not None:fcntl.flock(held,fcntl.LOCK_UN)
  for file in files:file.close()

def raw_fetch(url,byte_range=None,head=False):
 folder=HTTP_CACHE/hashlib.sha256(url.encode()).hexdigest();folder.mkdir(exist_ok=True);meta=folder/'metadata.json'
 if head:
  if not meta.exists():raw_fetch(url,'0-0')
  return ('content-length: '+str(json.loads(meta.read_text())['size'])+'\n').encode()
 if not byte_range:
  # Small API documents have no useful byte-range contract. Keep retries in
  # separate files so an interrupted response can never be concatenated.
  for attempt in range(3):
   fd,name=tempfile.mkstemp(prefix='document-',dir=folder);os.close(fd)
   try:
    with network_slot():result=subprocess.run(['curl','-fsSL','--max-time','30','--max-filesize','8388608','-o',name,url],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    if result.returncode==0:
     data=Path(name).read_bytes();json.loads(data);return data
   finally:Path(name).unlink(missing_ok=True)
  raise IOError('API document transfer failed: '+url)
 cap=int(byte_range[1:]) if byte_range.startswith('-') else int(byte_range.split('-')[1])-int(byte_range.split('-')[0])+1
 cached=folder/(byte_range+'.bin');partial=folder/(byte_range+'.partial')
 if cached.exists() and cached.stat().st_size==cap and (byte_range!='0-0' or meta.exists()):return cached.read_bytes()
 if byte_range.startswith('-'):
  if not meta.exists():raw_fetch(url,'0-0')
  lo=json.loads(meta.read_text())['size']-cap
 else:lo=int(byte_range.split('-')[0])
 have=partial.stat().st_size if partial.exists() else 0
 if have>cap:partial.unlink();have=0
 failures=0;request_size=524288
 while have<cap:
  start=lo+have;end=min(lo+cap-1,start+request_size-1)
  fd,name=tempfile.mkstemp(prefix='attempt-',suffix='.part',dir=folder);os.close(fd);header=name+'.headers'
  args=['curl','-fsSL','--max-time','30','--range',f'{start}-{end}','--max-filesize',str(end-start+1),'-D',header,'-o',name,url]
  try:
   with network_slot():result=subprocess.run(args,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
   data=Path(name).read_bytes();h=Path(header).read_text(errors='replace');ranges=re.findall(r'(?im)^content-range:\s*bytes\s+(\d+)-(\d+)/(\d+)',h)
   valid=False
   if ranges:
    received_start,received_end,total=map(int,ranges[-1]);valid=received_start==start and start<=received_end<=end and received_end<total and 0<len(data)<=received_end-start+1 and result.returncode in [0,18,28,56]
   if valid:
    with partial.open('ab') as out:out.write(data)
    have+=len(data);failures=0
    tmp=Path(name+'.metadata');tmp.write_text(json.dumps({'size':total}));tmp.replace(meta)
   else:
    failures+=1
    request_size=max(131072,request_size//2)
    if failures>=5:raise IOError('Publisher transfer stalled: '+url+' '+str(start)+'-'+str(end)+'; completed bytes retained; curl '+str(result.returncode)+' '+result.stderr.decode(errors='replace')[-160:])
    time.sleep(1)
  finally:
   Path(name).unlink(missing_ok=True);Path(header).unlink(missing_ok=True)
 partial.replace(cached);return cached.read_bytes()

def clear_range_cache(url,lo,hi):
 folder=HTTP_CACHE/hashlib.sha256(url.encode()).hexdigest()
 if not folder.exists():return
 for f in folder.glob('*.bin'):
  try:start,end=map(int,f.stem.split('-'))
  except ValueError:continue
  if start>=lo and end<=hi:f.unlink(missing_ok=True)

def fetch(url,byte_range=None):
 cache=CACHE/(hashlib.sha256(url.encode()).hexdigest()+'.mp3') if byte_range is None and url.endswith('.mp3') else None
 if cache and cache.exists():return cache.read_bytes()
 if byte_range and byte_range.startswith('-'):return raw_fetch(url,byte_range)
 if byte_range:lo,hi=map(int,byte_range.split('-'))
 else:
  headers=raw_fetch(url,head=True).decode('latin1');sizes=re.findall(r'(?im)^content-length:\s*(\d+)',headers)
  if not sizes:return raw_fetch(url)
  lo=0;hi=int(sizes[-1])-1
 if hi-lo+1<=1048576:data=raw_fetch(url,f'{lo}-{hi}')
 else:
  ranges=[(i,min(i+1048575,hi)) for i in range(lo,hi+1,1048576)]
  def part(r):
   b=raw_fetch(url,f'{r[0]}-{r[1]}');assert len(b)==r[1]-r[0]+1,(url,r,len(b));return b
  with concurrent.futures.ThreadPoolExecutor(4) as pool:data=b''.join(pool.map(part,ranges))
 assert len(data)==hi-lo+1,(url,len(data),hi-lo+1)
 if cache:
  tmp=cache.with_suffix('.tmp');tmp.write_bytes(data);tmp.replace(cache);clear_range_cache(url,lo,hi)
 return data

def _pcm(data):
 with av.open(io.BytesIO(data)) as c:
  rs=av.AudioResampler(format='flt',layout='mono',rate=SR);frames=[]
  for packet in c.demux(audio=0):
   try:decoded=packet.decode()
   except av.error.InvalidDataError:
    duration=float(packet.duration*packet.time_base) if packet.duration and packet.time_base else 0
    if duration:frames.append(np.zeros(round(duration*SR),dtype=np.float32))
    continue
   for fr in decoded:frames.extend(f.to_ndarray().reshape(-1).copy() for f in rs.resample(fr))
  frames.extend(f.to_ndarray().reshape(-1).copy() for f in rs.resample(None))
  return np.concatenate(frames)

def pcm(data):
 if len(data)<2000000:return _pcm(data)
 with open('/workspace/scratch/complex-pcm.lock','w') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX)
  return _pcm(data)

def activity(a):
 block=40;n=len(a)//block
 env=np.sqrt(np.mean(a[:n*block].reshape(-1,block)**2,axis=1));threshold=max(float(env.max())*.008,.0005)
 # Ignore isolated codec clicks; keep low-volume opening consonants.
 mask=env>threshold;ix=np.where(mask[:-1]&mask[1:])[0]
 if not len(ix):raise ValueError('No speech detected')
 return max(0,int(ix[0]*block)-int(.05*SR)),min(len(a),int((ix[-1]+2)*block)+int(.08*SR))

def match_anchor(chapter,clip,anchor,length,lo,hi):
 part=clip[anchor:anchor+length].astype(np.float64)
 if len(part)<SR//5:raise ValueError('Short anchor')
 lo=max(0,int(lo));hi=min(len(chapter),int(hi))
 region=chapter[lo:hi].astype(np.float64)
 if len(region)<len(part):raise ValueError('Short search window')
 corr=correlate(region,part,mode='valid',method='fft')
 sums=np.concatenate(([0.],np.cumsum(region*region)));energy=sums[len(part):]-sums[:-len(part)]
 part_energy=np.dot(part,part)
 score=corr/np.maximum(np.sqrt(np.maximum(energy,0)*part_energy),1e-12)
 score[(energy<part_energy*1e-5)|(score>1.0001)]=-1
 at=int(np.argmax(score));return lo+at-anchor,float(score[at])

def align(chapter,clips):
 rows=[];checks=[];prev_end=0
 for v,data in clips:
  a=pcm(data);st,en=activity(a);active=en-st
  length=min(int(.40*SR),max(int(.20*SR),active//4))
  anchor=st+min(int(.18*SR),max(0,active-length)//4)
  # Search only after the preceding verse. A whole-file fallback is still waveform-based.
  lo=max(0,prev_end-st-int(2.5*SR));hi=min(len(chapter),prev_end+len(a)+int(35*SR))
  offset,score=match_anchor(chapter,a,anchor,length,lo,hi)
  if score<.70:
   offset,score=match_anchor(chapter,a,anchor,length,max(0,prev_end-st-int(3*SR)),len(chapter))
  # Independent late anchor must point to the same recording position.
  anchor2=max(anchor+length,min(en-length-int(.15*SR),st+int(active*.72)))
  anchor2=min(anchor2,en-length)
  off2,score2=match_anchor(chapter,a,anchor2,length,max(0,offset+anchor2-int(.3*SR)),min(len(chapter),offset+anchor2+length+int(.3*SR)))
  discrepancy=abs(off2-offset)/SR
  start=max(0,round((offset+st)*1000/SR));end=min(round(len(chapter)*1000/SR),round((offset+en)*1000/SR))
  anchor3=min(en-length,st+active//2)
  off3,score3=match_anchor(chapter,a,anchor3,length,max(0,offset+anchor3-int(.3*SR)),min(len(chapter),offset+anchor3+length+int(.3*SR)))
  discrepancy=max(discrepancy,abs(off3-offset)/SR)
  valid=score>=.70 and score2>=.65 and score3>=.65 and discrepancy<=.045 and end>start and (not rows or start>rows[-1][1])
  checks.append(dict(verse=v,score=round(score,6),lateScore=round(score2,6),middleScore=round(score3,6),offsetDeltaMs=round(discrepancy*1000,3),clipSha256=hashlib.sha256(data).hexdigest(),valid=valid))
  if not valid:raise ValueError(json.dumps(dict(verse=v,start=start,end=end,check=checks[-1])))
  rows.append([v,start,end]);prev_end=offset+en
 return rows,checks

def zip_index(url,slug):
 f=OUT/(slug+'-central.bin')
 if not f.exists():f.write_bytes(fetch(url,'-2097152'))
 b=f.read_bytes();i=b.rfind(b'PK\x05\x06');assert i>=0
 count=struct.unpack_from('<H',b,i+10)[0];items=[];i=0
 while (i:=b.find(b'PK\x01\x02',i))>=0:
  n,e,c=struct.unpack_from('<3H',b,i+28);name=b[i+46:i+46+n];m=re.search(rb'(?:/|^)(?:10-)?(\d{3})(\d{3})-[^/]+\.mp3$',name,re.I)
  if m and name.endswith({'muaiqly':b'-A08.mp3','ayyoub':b'-A03.mp3','muhanna':b'-A06.mp3','akhdar':b'-A02.mp3'}[slug.rsplit('-',1)[-1]]):
   ch,v=map(int,m.groups())
   # Publisher An-Nasr directory contains three mistakenly 109-prefixed files.
   # Correct only this documented label; waveform verification still proves
   # every clip against the actual official chapter before promotion.
   if slug=='quran-audio-hafs-muhanna' and b'/110 An-Nasr ' in name and ch==109 and 1<=v<=3:ch=110
   if ch in COUNTS and 1<=v<=COUNTS[ch]:items.append(dict(ch=ch,verse=v,offset=struct.unpack_from('<I',b,i+42)[0],size=struct.unpack_from('<I',b,i+20)[0],crc=struct.unpack_from('<I',b,i+16)[0]))
  i+=46+n+e+c
 assert len(items)==6236,(slug,len(items),count)
 assert len({(x['ch'],x['verse']) for x in items})==6236,(slug,'Duplicate publisher verse labels')
 return items

def chapter_from_zip(source,items,c):
 entries=sorted([x for x in items if x['ch']==c],key=lambda x:x['verse']);assert [x['verse'] for x in entries]==list(range(1,COUNTS[c]+1))
 bundle=CACHE/(hashlib.sha256((source+':'+str(c)).encode()).hexdigest()+'.clips.zip')
 if bundle.exists():
  with zipfile.ZipFile(bundle) as z:return [(x['verse'],z.read(str(x['verse']))) for x in entries]
 lo=min(x['offset'] for x in entries);hi=max(x['offset']+x['size']+2048 for x in entries)
 b=fetch(source,f'{lo}-{hi}');clips=[]
 for x in entries:
  i=x['offset']-lo;assert b[i:i+4]==b'PK\x03\x04';n,e=struct.unpack_from('<2H',b,i+26);method=struct.unpack_from('<H',b,i+8)[0];compressed=b[i+30+n+e:i+30+n+e+x['size']];data=zlib.decompress(compressed,-15) if method==8 else compressed
  assert zlib.crc32(data)&0xffffffff==x['crc'];clips.append((x['verse'],data))
 with zipfile.ZipFile(bundle.with_suffix('.tmp'),'w',zipfile.ZIP_STORED) as z:
  for verse,data in clips:z.writestr(str(verse),data)
 bundle.with_suffix('.tmp').replace(bundle);clear_range_cache(source,lo,hi)
 return clips

def process(slug,c,clips,chapter_url):
 d=OUT/slug;d.mkdir(exist_ok=True);f=d/f'{c}.json'
 if f.exists():return
 t=time.time();audio=fetch(chapter_url);a=pcm(audio);rows,checks=align(a,clips)
 f.write_text(json.dumps(dict(url=chapter_url,source='https://qurancomplex.gov.sa/'+slug+'/',timings=rows,duration=round(len(a)*1000/SR),audioSha256=hashlib.sha256(audio).hexdigest(),validation=checks),separators=(',',':')))
 print(slug,c,len(rows),'PASS',round(time.time()-t,1),'sec',flush=True)

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--reader',default='muaiqly');ap.add_argument('--chapters',default='');ap.add_argument('--workers',type=int,default=2);args=ap.parse_args()
 source=next(x for x in SOURCES if x['slug']=='quran-audio-hafs-'+args.reader);slug=source['slug'];tracks=json.loads((ROOT/(slug+'.json')).read_text());chapters=[int(x) for x in args.chapters.split(',')] if args.chapters else list(range(1,115))
 z=next(x for x in source['zip'] if 'ayat' in x);items=zip_index(z,slug)
 def task(c):
  if (OUT/slug/f'{c}.json').exists():return
  try:process(slug,c,chapter_from_zip(z,items,c),tracks[c-1]['audio'].replace('http:','https:'))
  except Exception as e:print(slug,c,'FAIL',str(e),flush=True);return c,str(e)
 errors=[e for e in concurrent.futures.ThreadPoolExecutor(args.workers).map(task,chapters) if e]
 (OUT/(slug+'-errors.json')).write_text(json.dumps(errors));print('FINISHED',slug,'errors',len(errors),flush=True)
 if errors:raise SystemExit(1)
if __name__=='__main__':main()
