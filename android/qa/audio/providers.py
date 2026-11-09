import json,urllib.request,concurrent.futures,subprocess,time
from pathlib import Path
root=Path(__file__).resolve().parents[2];catalog=json.loads((root/'assets/surah-audio.json').read_text());out=Path('/tmp/mushafi-audio-audit');out.mkdir(exist_ok=True)
def check(item):
 reader,chapter,track=item;started=time.monotonic();row={'reader':reader,'chapter':chapter,'url':track['url']}
 try:
  headers={'User-Agent':'Mushafi-Audio-Audit/1.0'}
  if chapter!=1:headers['Range']='bytes=0-1023'
  with urllib.request.urlopen(urllib.request.Request(track['url'],headers=headers),timeout=25) as r:
   row.update(status=r.status,mime=r.headers.get('Content-Type'));data=r.read() if chapter==1 else r.read(1024)
  assert len(data)>100 and not data.lstrip().startswith((b'<',b'{')),'not audio'
  if chapter==1:
   file=out/f'{reader}-001.mp3';file.write_bytes(data)
   info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_name','-of','json',str(file)]));row['seconds']=float(info['format']['duration']);row['codec']=info['streams'][0]['codec_name'];row['expectedSeconds']=track.get('duration',0)/1000
  row['ok']=True
 except Exception as e:row.update(ok=False,error=str(e))
 row['elapsedSeconds']=round(time.monotonic()-started,2);return row
items=[(int(r),c,spec['chapters'][str(c)])for r,spec in catalog.items()for c in [1,2,114]]
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
 results=[]
 for row in pool.map(check,items):results.append(row);print(json.dumps(row,ensure_ascii=False),flush=True)
(out/'providers.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print('SUMMARY',sum(x['ok'] for x in results),'/',len(results),flush=True)
