import json,gzip,urllib.request,hashlib,struct,concurrent.futures,time
from pathlib import Path
P=Path('/workspace');out=Path('/tmp/primary-rebuild');out.mkdir(exist_ok=True)
specs={'133':(133,'maher-muaiqly/r3'),'1001':(74,'ali-hudhaifi/r1'),'1002':(109,'muhammad-ayyub/r1'),'1003':(159,'khalid-mohanna/r1'),'1004':(1,'ibrahim-akhdar/r1')}
counts={c['id']:c['verses_count']for c in json.load(open(P/'downloads/chapters.json'))['chapters']}
qud=json.loads(gzip.decompress((P/'downloads/qud/ali_al_huthaifi_mp3quran/verse_timestamps.json.gz').read_bytes()))['rows']
def rows(r,c):
 if r=='1001':return [[int(x[0].split(':')[1]),x[1],x[2]]for x in qud if x[0].startswith(str(c)+':')and x[3]]
 rid=specs[r][0];data=json.load(open(P/f'downloads/complex-verified/{rid}-{c}-timing.json'));result=[[int(x['ayah']),round(float(x['start_time'])),round(float(x['end_time']))]for x in data if int(x['ayah'])>0]
 if r=='1004' and c==19:result[-1][2]=1379809
 if r=='1004' and c==36:result[-1][2]=1241256
 if r=='1004' and c==93:result[-2][2]=62500;result[-1][1]=62500
 return result
def frame(b,start):
 for i in range(start,min(len(b)-4,start+65536)):
  h=int.from_bytes(b[i:i+4],'big');ver=(h>>19)&3;layer=(h>>17)&3;bi=(h>>12)&15;si=(h>>10)&3
  if h>>21!=2047 or ver==1 or layer!=1 or bi in[0,15]or si==3:continue
  kb=([0,32,40,48,56,64,80,96,112,128,160,192,224,256,320][bi]if ver==3 else[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160][bi]);sr=[44100,48000,32000][si]//(1 if ver==3 else 2 if ver==2 else 4);spf=1152 if ver==3 else 576;size=int((144 if ver==3 else 72)*kb*1000/sr)+((h>>9)&1)
  if i+size+4>=len(b)or int.from_bytes(b[i+size:i+size+4],'big')>>21!=2047:continue
  return i,kb,sr,spf,size
 raise ValueError('No MPEG Layer III frame')
def audit(item):
 r,c=item;dest=out/f'{r}-{c}.json'
 if dest.exists():return json.loads(dest.read_text())
 url=f'https://cdn.mp3quran.net/audio/{specs[r][1]}/{c:03}.mp3';result={'reader':r,'chapter':c,'url':url};error=None
 for retry in range(3):
  try:
   cap=131072
   with urllib.request.urlopen(urllib.request.Request(url,headers={'Range':f'bytes=0-{cap-1}'}),timeout=25)as x:
    assert x.status==206;cr=x.headers['Content-Range'];total=int(cr.split('/')[-1]);b=x.read(cap);assert cr.startswith('bytes 0-');assert len(b)>100
   offset=10+sum((b[6+i]&127)<<(7*(3-i))for i in range(4))if b[:3]==b'ID3'else 0
   if offset+4096>len(b):
    cap=offset+32768;assert cap<2097152
    with urllib.request.urlopen(urllib.request.Request(url,headers={'Range':f'bytes=0-{cap-1}'}),timeout=25)as x:b=x.read(cap)
   first,kb,sr,spf,sz=frame(b,offset);raw=b[first:first+sz];marker=max(raw.find(b'Xing'),raw.find(b'Info'));frames=None
   if marker>=0 and marker+12<=len(raw):
    flags=int.from_bytes(raw[marker+4:marker+8],'big')
    if flags&1:frames=int.from_bytes(raw[marker+8:marker+12],'big')
   duration=round(frames*spf/sr*1000)if frames else round((total-first)*8/kb)
   timing=rows(r,c);assert[v for v,st,en in timing]==list(range(1,counts[c]+1));assert all(st>=0 and en>st and(not i or st>timing[i-1][1])for i,(v,st,en)in enumerate(timing))
   result.update(byteSize=total,duration=duration,bitrateKbps=kb,sampleRate=sr,durationMethod='MPEG frame count'if frames else'CBR file length',prefixSha256=hashlib.sha256(b).hexdigest(),timings=timing,overrunMs=timing[-1][2]-duration,ok=all(st<duration and en<=duration+350 for v,st,en in timing))
   dest.write_text(json.dumps(result,separators=(',',':')));return result
  except Exception as e:error=str(e)
 result.update(ok=False,error=error);return result
with concurrent.futures.ThreadPoolExecutor(max_workers=8)as pool:
 results=[]
 for x in pool.map(audit,[(r,c)for r in specs for c in range(1,115)]):
  results.append(x)
  if not x['ok']:print('FAIL',x['reader'],x['chapter'],x.get('error'),x.get('overrunMs'),flush=True)
  elif len(results)%25==0:print('CHECKED',len(results),flush=True)
(out/'summary.json').write_text(json.dumps(results,separators=(',',':')));print('SUMMARY',sum(x['ok']for x in results),len(results),flush=True)
